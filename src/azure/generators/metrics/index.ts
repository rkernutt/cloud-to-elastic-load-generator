import {
  AZURE_ELASTIC_DATASET_MAP,
  AZURE_METRICS_DATASET_MAP,
  AZURE_METRICS_SUPPORTED_SERVICE_IDS,
} from "../../data/elasticMaps.js";
import type { MetricGenerator } from "../../../aws/generators/types.js";
import { makeAzureGenericMetricGenerator } from "./generic.js";
import {
  generateIotHubMetrics,
  generateLogicAppsMetrics,
  generateApiManagementMetrics,
  generateEventGridMetrics,
  generateSynapseWorkspaceMetrics,
  generateDatabricksMetrics,
  generateCosmosDbDedicatedMetrics,
  generateEventHubsDedicatedMetrics,
  generateAppServiceDedicatedMetrics,
  generateFunctionsDedicatedMetrics,
  generateAksDedicatedMetrics,
  generateBlobStorageDedicatedMetrics,
  generateSqlDatabaseDedicatedMetrics,
  generateCacheForRedisDedicatedMetrics,
  generateLoadBalancerDedicatedMetrics,
  generateOpenAiDedicatedMetrics,
} from "./dedicated.js";
import { mergeAzureMetricVariants } from "../mergeHelpers.js";
import { M365_METRICS_GENERATORS } from "../../../m365/generators/metrics/index.js";
import { M365_METRIC_SERVICE_IDS_FOR_AZURE } from "../../../cloud/m365Config.js";

function azureMetricsDataset(svcId: string): string {
  return (
    AZURE_METRICS_DATASET_MAP[svcId] ??
    AZURE_ELASTIC_DATASET_MAP[svcId] ??
    `azure.${svcId.replace(/-/g, "_")}_metrics`
  );
}

const DEDICATED_METRICS: Record<string, MetricGenerator> = {
  "iot-hub": generateIotHubMetrics,
  "logic-apps": generateLogicAppsMetrics,
  "api-management": generateApiManagementMetrics,
  "event-grid": generateEventGridMetrics,
  "synapse-workspace": generateSynapseWorkspaceMetrics,
  databricks: generateDatabricksMetrics,
  "cosmos-db": generateCosmosDbDedicatedMetrics,
  "event-hubs": generateEventHubsDedicatedMetrics,
  "app-service": generateAppServiceDedicatedMetrics,
  functions: generateFunctionsDedicatedMetrics,
  aks: generateAksDedicatedMetrics,
  "blob-storage": generateBlobStorageDedicatedMetrics,
  "sql-database": generateSqlDatabaseDedicatedMetrics,
  "cache-for-redis": generateCacheForRedisDedicatedMetrics,
  "load-balancer": generateLoadBalancerDedicatedMetrics,
  openai: generateOpenAiDedicatedMetrics,
};

function metricGenForId(id: string): MetricGenerator {
  return DEDICATED_METRICS[id] ?? makeAzureGenericMetricGenerator(id, azureMetricsDataset(id));
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
      M365_METRIC_SERVICE_IDS_FOR_AZURE.has(id) ? M365_METRICS_GENERATORS[id]! : metricGenForId(id),
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
