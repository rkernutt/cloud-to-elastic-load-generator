/**
 * Generic GCP Monitoring metric document generator — fallback for services
 * without a dedicated dimensional generator.
 */

import {
  randInt,
  dp,
  stat,
  counter,
  gcpMetricDoc,
  pickGcpCloudContext,
  jitter,
} from "./helpers.js";
import type { MetricGenerator } from "../../../aws/generators/types.js";

export type { MetricGenerator } from "../../../aws/generators/types.js";

type TemplatePart =
  | { dim: string; vals: string[] }
  | { metrics: (er: number) => Record<string, unknown> };

/** Default templates by service category (dimension keys + synthetic metrics). */
export const GCP_METRIC_TEMPLATES: Record<string, TemplatePart[]> = {
  serverless: [
    { dim: "function_name", vals: ["api-handler", "worker", "batch-fn", "webhook"] },
    {
      metrics: (er) => ({
        request_count: counter(randInt(0, 500_000)),
        execution_count: counter(randInt(0, 200_000)),
        error_count: counter(Math.random() < er ? randInt(1, 5_000) : 0),
        execution_times: stat(dp(jitter(120, 100, 5, 60_000))),
      }),
    },
  ],
  compute: [
    { dim: "instance_name", vals: ["vm-web-1", "vm-app-2", "vm-batch-3"] },
    {
      metrics: (er) => ({
        cpu_utilization: stat(
          dp(Math.random() < er ? jitter(85, 10, 70, 100) : jitter(35, 25, 5, 95))
        ),
        disk_read_bytes: counter(randInt(0, 80_000_000)),
        disk_write_bytes: counter(randInt(0, 120_000_000)),
        network_received_bytes: counter(randInt(0, 400_000_000)),
        network_sent_bytes: counter(randInt(0, 250_000_000)),
      }),
    },
  ],
  database: [
    { dim: "database_id", vals: ["db-primary", "db-replica", "db-analytics"] },
    {
      metrics: (er) => ({
        cpu_utilization: stat(dp(jitter(40, 30, 5, 98))),
        memory_utilization: stat(dp(jitter(55, 20, 10, 99))),
        connections: counter(randInt(0, 2_000)),
        queries: counter(randInt(0, 500_000)),
        errors: counter(Math.random() < er ? randInt(1, 500) : 0),
      }),
    },
  ],
  networking: [
    { dim: "resource_url", vals: ["/api/v1/orders", "/health", "/static/*", "/graphql"] },
    {
      metrics: (er) => ({
        request_count: counter(randInt(0, 1_000_000)),
        latency: stat(dp(jitter(45, 40, 2, 5_000))),
        error_rate: stat(
          dp(Math.random() < er ? jitter(0.05, 0.04, 0, 0.5) : jitter(0.002, 0.002, 0, 0.02))
        ),
      }),
    },
  ],
  storage: [
    { dim: "bucket_name", vals: ["data-lake", "logs-archive", "assets-cdn", "backups"] },
    {
      metrics: (er) => ({
        storage_bytes: counter(randInt(1_000_000, 50_000_000_000)),
        object_count: counter(randInt(100, 10_000_000)),
        api_request_count: counter(randInt(0, 500_000)),
        errors: counter(Math.random() < er ? randInt(1, 2_000) : 0),
      }),
    },
  ],
  ml: [
    { dim: "model_id", vals: ["recommendation-v2", "fraud-detect", "embeddings-prod"] },
    {
      metrics: (er) => ({
        prediction_count: counter(randInt(0, 2_000_000)),
        latency: stat(dp(jitter(80, 70, 5, 10_000))),
        error_count: counter(Math.random() < er ? randInt(1, 1_000) : 0),
      }),
    },
  ],
  orchestration: [
    { dim: "job_id", vals: ["etl-daily", "spark-agg", "export-weekly"] },
    {
      metrics: (er) => ({
        task_count: counter(randInt(0, 50_000)),
        duration_ms: stat(dp(jitter(600_000, 400_000, 10_000, 3_600_000))),
        failed_tasks: counter(Math.random() < er ? randInt(1, 200) : 0),
      }),
    },
  ],
  observability: [
    { dim: "resource_type", vals: ["global", "project", "workspace"] },
    {
      metrics: (er) => ({
        ingestion_volume: counter(randInt(0, 10_000_000_000)),
        query_count: counter(randInt(0, 500_000)),
        dropped_entries: counter(Math.random() < er ? randInt(1, 10_000) : 0),
      }),
    },
  ],
  messaging: [
    { dim: "queue_id", vals: ["tasks-default", "tasks-priority", "scheduler-jobs"] },
    {
      metrics: (er) => ({
        published_messages: counter(randInt(0, 800_000)),
        delivered_messages: counter(randInt(0, 750_000)),
        oldest_message_age: stat(dp(jitter(2, 8, 0, 3600))),
        dlq_count: counter(Math.random() < er ? randInt(1, 500) : 0),
      }),
    },
  ],
  api_gateway: [
    { dim: "proxy_name", vals: ["internal-api", "partner-api", "public-gateway"] },
    {
      metrics: (er) => ({
        request_count: counter(randInt(0, 2_000_000)),
        latency_ms: stat(dp(jitter(60, 50, 1, 8_000))),
        _4xx_count: counter(Math.random() < er ? randInt(1, 20_000) : randInt(0, 2_000)),
        _5xx_count: counter(Math.random() < er ? randInt(1, 5_000) : 0),
      }),
    },
  ],
  iot: [
    { dim: "device_type", vals: ["sensor", "gateway", "camera", "controller"] },
    {
      metrics: (er) => ({
        mqtt_connections: counter(randInt(0, 100_000)),
        messages_ingested: counter(randInt(0, 5_000_000)),
        errors: counter(Math.random() < er ? randInt(1, 5_000) : 0),
      }),
    },
  ],
  security: [
    { dim: "resource_id", vals: ["kms-ring-1", "secret-prod", "artifact-repo"] },
    {
      metrics: (er) => ({
        api_request_count: counter(randInt(0, 200_000)),
        denied_requests: counter(Math.random() < er ? randInt(1, 1_000) : randInt(0, 50)),
        key_operations: counter(randInt(0, 50_000)),
      }),
    },
  ],
  default: [
    { dim: "resource_id", vals: ["resource-a", "resource-b", "resource-c"] },
    {
      metrics: (er) => ({
        request_count: counter(randInt(0, 100_000)),
        error_count: counter(Math.random() < er ? randInt(1, 1_000) : 0),
        latency: stat(dp(jitter(100, 80, 5, 10_000))),
      }),
    },
  ],
};

/** Maps service IDs to template keys in {@link GCP_METRIC_TEMPLATES}. */
export const GCP_TEMPLATE_MAP: Record<string, string> = {
  "cloud-functions": "serverless",
  "cloud-run": "serverless",
  "app-engine": "serverless",
  "cloud-dns": "networking",
  "cloud-armor": "networking",
  "cloud-nat": "networking",
  "cloud-vpn": "networking",
  "vpc-flow": "networking",
  firestore: "database",
  alloydb: "database",
  memorystore: "database",
  "cloud-storage": "storage",
  "persistent-disk": "storage",
  filestore: "storage",
  "vertex-ai": "ml",
  "cloud-build": "orchestration",
  composer: "orchestration",
  batch: "orchestration",
  "cloud-monitoring": "observability",
  "cloud-logging": "observability",
  "cloud-tasks": "messaging",
  "cloud-scheduler": "messaging",
  apigee: "api_gateway",
  "cloud-interconnect": "networking",
  "iot-core": "iot",
  dialogflow: "ml",
  "secret-manager": "security",
  "cloud-kms": "security",
  "artifact-registry": "security",
  "pubsub-lite": "messaging",
};

/**
 * Generic metric generator for GCP services without a dedicated generator.
 * Produces 1–3 label combinations per call.
 */
export function makeGcpGenericGenerator(serviceId: string, dataset: string): MetricGenerator {
  const templateKey = GCP_TEMPLATE_MAP[serviceId] ?? "default";
  const template = GCP_METRIC_TEMPLATES[templateKey] ?? GCP_METRIC_TEMPLATES.default;
  const dimEntry = template.find((t): t is { dim: string; vals: string[] } => "dim" in t);
  const metricsFn =
    template.find((t): t is { metrics: (er: number) => Record<string, unknown> } => "metrics" in t)
      ?.metrics ?? (() => ({ request_count: counter(randInt(0, 100_000)) }));

  return function gcpGenericMetricGenerator(ts: string, er: number) {
    const { region, project } = pickGcpCloudContext();
    const dimKey = dimEntry?.dim ?? "resource_id";
    const dimVals = dimEntry?.vals ?? ["resource-1", "resource-2"];
    const numDims = Math.min(randInt(1, 3), dimVals.length);

    return Array.from({ length: numDims }, (_, i) => {
      const dimVal = dimVals[i % dimVals.length];
      return gcpMetricDoc(
        ts,
        serviceId,
        dataset,
        region,
        project,
        { [dimKey]: dimVal },
        metricsFn(er)
      );
    });
  };
}
