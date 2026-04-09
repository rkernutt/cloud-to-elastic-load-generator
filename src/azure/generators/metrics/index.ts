/**
 * Azure metric generators registry.
 */

import {
  AZURE_ELASTIC_DATASET_MAP,
  AZURE_METRICS_DATASET_MAP,
  AZURE_METRICS_SUPPORTED_SERVICE_IDS,
} from "../../data/elasticMaps.js";
import type { MetricGenerator } from "../../../aws/generators/types.js";
import { makeAzureGenericMetricGenerator } from "./generic.js";
import { mergeAzureMetricVariants } from "../mergeHelpers.js";
import { M365_METRICS_GENERATORS } from "../../../m365/generators/metrics/index.js";

const O365_METRIC_SERVICE_IDS = new Set([
  "active-users-services",
  "teams-user-activity",
  "outlook-activity",
  "onedrive-usage-storage",
]);

function azureMetricsDataset(svcId: string): string {
  return (
    AZURE_METRICS_DATASET_MAP[svcId] ??
    AZURE_ELASTIC_DATASET_MAP[svcId] ??
    `azure.${svcId.replace(/-/g, "_")}_metrics`
  );
}

function metricGenForId(id: string): MetricGenerator {
  return makeAzureGenericMetricGenerator(id, azureMetricsDataset(id));
}

const METRIC_MERGE_VARIANTS: Record<string, string[]> = {
  "virtual-machines": [
    "virtual-machines",
    "dedicated-host",
    "capacity-reservation",
    "proximity-placement",
    "confidential-vm",
  ],
  "front-door": ["front-door", "cdn"],
};

const BASE: Record<string, MetricGenerator> = Object.fromEntries(
  [...AZURE_METRICS_SUPPORTED_SERVICE_IDS]
    .sort()
    .map((id) => [
      id,
      O365_METRIC_SERVICE_IDS.has(id) ? M365_METRICS_GENERATORS[id]! : metricGenForId(id),
    ])
);

export const AZURE_METRICS_GENERATORS: Record<string, MetricGenerator> = { ...BASE };

for (const [parent, variantIds] of Object.entries(METRIC_MERGE_VARIANTS)) {
  if (!AZURE_METRICS_GENERATORS[parent]) continue;
  const gens = variantIds.map((vid) => metricGenForId(vid));
  AZURE_METRICS_GENERATORS[parent] = mergeAzureMetricVariants(gens);
  for (const vid of variantIds) {
    if (vid !== parent) delete AZURE_METRICS_GENERATORS[vid];
  }
}
