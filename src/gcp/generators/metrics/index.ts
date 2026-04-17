/**
 * GCP_METRICS_GENERATORS — map of service ID → dimensional metric generator.
 *
 * Each generator: (ts: string, er: number) => EcsDocument[]
 *   ts — ISO timestamp string
 *   er — error rate in [0, 1]
 *
 * Each document is one Cloud Monitoring time series (metric + resource + point).
 */

import {
  GCP_ELASTIC_DATASET_MAP,
  GCP_METRICS_DATASET_MAP,
  GCP_METRICS_SUPPORTED_SERVICE_IDS,
} from "../../data/elasticMaps.js";
import type { MetricGenerator } from "../../../aws/generators/types.js";
import { makeGcpGenericGenerator } from "./generic.js";
import { generateComputeEngineMetrics, generateGkeMetrics } from "./compute.js";
import { generateCloudLbMetrics, generateCloudCdnMetrics } from "./networking.js";
import {
  generateCloudSqlMetrics,
  generateCloudSpannerMetrics,
  generateBigtableMetrics,
} from "./databases.js";
import { generatePubSubMetrics, generateDataflowMetrics } from "./streaming.js";
import { generateBigQueryMetrics, generateDataprocMetrics } from "./analytics.js";
import { mergeGcpMetricVariants } from "../mergeHelpers.js";
import {
  generateCloudFunctionsMetrics,
  generateCloudRunMetrics,
  generateAppEngineMetrics,
} from "./serverless.js";
import { generateCloudStorageMetrics } from "./storage.js";
import { generateVertexAiMetrics } from "./aiml.js";

function gcpMetricsDataset(svcId: string): string {
  return (
    GCP_METRICS_DATASET_MAP[svcId] ??
    GCP_ELASTIC_DATASET_MAP[svcId] ??
    `gcp.${svcId.replace(/-/g, "_")}_metrics`
  );
}

const DEDICATED: Record<string, MetricGenerator> = {
  "compute-engine": generateComputeEngineMetrics,
  gke: generateGkeMetrics,
  "gke-autopilot": generateGkeMetrics,
  "cloud-lb": generateCloudLbMetrics,
  "cloud-cdn": generateCloudCdnMetrics,
  "cloud-sql": generateCloudSqlMetrics,
  "cloud-spanner": generateCloudSpannerMetrics,
  bigtable: generateBigtableMetrics,
  pubsub: generatePubSubMetrics,
  dataflow: generateDataflowMetrics,
  bigquery: generateBigQueryMetrics,
  dataproc: generateDataprocMetrics,
  "cloud-functions": generateCloudFunctionsMetrics,
  "cloud-run": generateCloudRunMetrics,
  "app-engine": generateAppEngineMetrics,
  "cloud-storage": generateCloudStorageMetrics,
  "vertex-ai": generateVertexAiMetrics,
};

function metricGenForId(id: string): MetricGenerator {
  return DEDICATED[id] ?? makeGcpGenericGenerator(id, gcpMetricsDataset(id));
}

/** Parent id → variant ids (random pick each emission). */
const METRIC_MERGE_VARIANTS: Record<string, string[]> = {
  "compute-engine": [
    "compute-engine",
    "sole-tenant-nodes",
    "spot-vms",
    "shielded-vms",
    "confidential-computing",
    "migrate-to-vms",
  ],
  gke: ["gke", "config-connector"],
  "vpc-flow": ["vpc-flow", "packet-mirroring", "network-service-tiers"],
  "cloud-lb": ["cloud-lb", "serverless-neg"],
  "cloud-storage": ["cloud-storage", "storage-transfer"],
  "vertex-ai": ["vertex-ai", "vertex-ai-search"],
  "cloud-build": ["cloud-build", "source-repositories"],
  "cloud-monitoring": ["cloud-monitoring", "cloud-trace", "cloud-profiler"],
  "api-gateway": ["api-gateway", "api-hub"],
};

const BASE: Record<string, MetricGenerator> = Object.fromEntries(
  [...GCP_METRICS_SUPPORTED_SERVICE_IDS].sort().map((id) => [id, metricGenForId(id)])
);

export const GCP_METRICS_GENERATORS: Record<string, MetricGenerator> = { ...BASE };

for (const [parent, variantIds] of Object.entries(METRIC_MERGE_VARIANTS)) {
  if (!GCP_METRICS_GENERATORS[parent]) continue;
  const gens = variantIds.map((vid) => metricGenForId(vid));
  GCP_METRICS_GENERATORS[parent] = mergeGcpMetricVariants(gens);
  for (const vid of variantIds) {
    if (vid !== parent) delete GCP_METRICS_GENERATORS[vid];
  }
}
