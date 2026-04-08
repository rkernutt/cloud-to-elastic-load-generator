/**
 * Generic Azure platform log — long tail of services with plausible resource metadata.
 */

import {
  type EcsDocument,
  rand,
  randId,
  randInt,
  azureCloud,
  makeAzureSetup,
  randCorrelationId,
} from "./helpers.js";
import { AZURE_ELASTIC_DATASET_MAP } from "../data/elasticMaps.js";

const OPS_OK = ["Write", "Action", "Delete", "Start", "Patch", "Get"] as const;
const OPS_ERR = ["Write", "Action", "Delete", "Cancel"] as const;

/** Nested object key under `azure.*` from data_stream dataset (azure.foo_bar → foo_bar). */
export function azureNestedKeyFromDataset(dataset: string): string {
  return dataset.startsWith("azure.") ? dataset.slice(6) : dataset;
}

export function makeGenericAzureLog(serviceId: string): (ts: string, er: number) => EcsDocument {
  const dataset = AZURE_ELASTIC_DATASET_MAP[serviceId];
  if (!dataset) {
    throw new Error(`Unknown Azure service id for generic log: ${serviceId}`);
  }
  const nestedKey = azureNestedKeyFromDataset(dataset);
  const provider = `Microsoft.Azure/${nestedKey.replace(/_/g, ".")}`;

  return (ts: string, er: number) => {
    const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
    const resourceName = `${serviceId.split("-")[0]}-${randId(5).toLowerCase()}`;
    const op = isErr ? rand(OPS_ERR) : rand(OPS_OK);
    const status = isErr ? rand(["Failed", "Conflict", "Throttled", "BadRequest"]) : "Succeeded";
    const correlationId = randCorrelationId();
    const message = isErr
      ? `Azure ${serviceId}: ${op} on ${resourceName} failed — ${status} (rg=${resourceGroup})`
      : `Azure ${serviceId}: ${op} completed for ${resourceName} in ${resourceGroup}`;

    return {
      "@timestamp": ts,
      cloud: azureCloud(region, subscription, provider),
      azure: {
        [nestedKey]: {
          resource_group: resourceGroup,
          resource_name: resourceName,
          resource_id: `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/${provider}/${resourceName}`,
          operation_name: `${provider}/${op}`,
          status,
          correlation_id: correlationId,
          http_status: isErr ? randInt(400, 503) : rand([200, 201, 202, 204]),
          duration_ms: randInt(20, isErr ? 120_000 : 8000),
        },
      },
      event: {
        outcome: isErr ? "failure" : "success",
        duration: randInt(50_000, isErr ? 90_000_000 : 8_000_000),
        action: op,
      },
      message,
    };
  };
}
