/**
 * Generic GCP Monitoring metric document generator — fallback for services
 * without a dedicated dimensional generator.
 */

import {
  randInt,
  dp,
  gcpMetricDoc,
  pickGcpCloudContext,
  jitter,
  toInt64String,
  distributionFromMs,
} from "./helpers.js";
import type { GcpMonitoringMetricSpec } from "./helpers.js";
import type { MetricGenerator } from "../../../aws/generators/types.js";

export type { MetricGenerator } from "../../../aws/generators/types.js";

type TemplatePart = { dim: string; vals: string[] } | { templateKey: string };

export const GCP_METRIC_TEMPLATES: Record<string, TemplatePart[]> = {
  serverless: [
    { dim: "function_name", vals: ["api-handler", "worker", "batch-fn", "webhook"] },
    { templateKey: "serverless" },
  ],
  compute: [
    { dim: "instance_name", vals: ["vm-web-1", "vm-app-2", "vm-batch-3"] },
    { templateKey: "compute" },
  ],
  database: [
    { dim: "database_id", vals: ["globex:db-primary", "globex:db-replica", "globex:db-analytics"] },
    { templateKey: "database" },
  ],
  networking: [
    { dim: "url_map_name", vals: ["api-map", "web-map", "grpc-map", "static-map"] },
    { templateKey: "networking" },
  ],
  storage: [
    { dim: "bucket_name", vals: ["data-lake", "logs-archive", "assets-cdn", "backups"] },
    { templateKey: "storage" },
  ],
  ml: [
    { dim: "model_id", vals: ["recommendation-v2", "fraud-detect", "embeddings-prod"] },
    { templateKey: "ml" },
  ],
  orchestration: [
    { dim: "build_id", vals: ["build-aa1", "build-bb2", "build-cc3"] },
    { templateKey: "orchestration" },
  ],
  observability: [
    { dim: "workspace_id", vals: ["ws-global", "ws-prod", "ws-staging"] },
    { templateKey: "observability" },
  ],
  messaging: [
    { dim: "queue_id", vals: ["tasks-default", "tasks-priority", "scheduler-jobs"] },
    { templateKey: "messaging" },
  ],
  api_gateway: [
    { dim: "gateway_id", vals: ["internal-api", "partner-api", "public-gateway"] },
    { templateKey: "api_gateway" },
  ],
  iot: [
    { dim: "device_type", vals: ["sensor", "gateway", "camera", "controller"] },
    { templateKey: "iot" },
  ],
  security: [
    { dim: "resource_name", vals: ["kms-ring-1", "secret-prod", "artifact-repo"] },
    { templateKey: "security" },
  ],
  default: [
    { dim: "resource_id", vals: ["resource-a", "resource-b", "resource-c"] },
    { templateKey: "default" },
  ],
};

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

function specsForTemplate(
  key: string,
  dimKey: string,
  dimVal: string,
  project: ReturnType<typeof pickGcpCloudContext>["project"],
  region: string,
  er: number
): GcpMonitoringMetricSpec[] {
  const err = Math.random() < er;
  const project_id = project.id;

  switch (key) {
    case "serverless": {
      const res = { project_id, function_name: dimVal, region };
      return [
        {
          metricType: "cloudfunctions.googleapis.com/function/execution_count",
          resourceType: "cloud_function",
          resourceLabels: res,
          metricLabels: { status: err ? "internal" : "ok" },
          metricKind: "DELTA",
          valueType: "INT64",
          point: { int64Value: toInt64String(randInt(err ? 20 : 80, err ? 900 : 5200)) },
        },
        {
          metricType: "cloudfunctions.googleapis.com/function/execution_times",
          resourceType: "cloud_function",
          resourceLabels: res,
          metricLabels: { status: err ? "internal" : "ok" },
          metricKind: "DELTA",
          valueType: "DISTRIBUTION",
          point: distributionFromMs(
            err ? jitter(2800, 1600, 200, 20000) : jitter(140, 95, 5, 900),
            randInt(60, 900),
            err
          ),
        },
        {
          metricType: "run.googleapis.com/request_count",
          resourceType: "cloud_run_revision",
          resourceLabels: {
            project_id,
            service_name: dimVal,
            revision_name: `${dimVal}-00001-abc`,
            configuration_name: dimVal,
            location: region,
          },
          metricLabels: { response_code_class: err ? "5xx" : "2xx" },
          metricKind: "DELTA",
          valueType: "INT64",
          point: { int64Value: toInt64String(randInt(10, err ? 4000 : 12000)) },
        },
      ];
    }
    case "compute": {
      const zone = `${region}-a`;
      const instance_id = String(randInt(1000000000000, 9999999999999));
      const res = { project_id, instance_id, zone };
      return [
        {
          metricType: "compute.googleapis.com/instance/cpu/utilization",
          resourceType: "gce_instance",
          resourceLabels: res,
          extraServiceLabels: { instance_name: dimVal },
          metricKind: "GAUGE",
          valueType: "DOUBLE",
          point: {
            doubleValue: dp(err ? jitter(0.9, 0.06, 0.75, 1) : jitter(0.36, 0.22, 0.03, 0.92)),
          },
        },
        {
          metricType: "compute.googleapis.com/instance/disk/read_bytes_count",
          resourceType: "gce_instance",
          resourceLabels: res,
          extraServiceLabels: { instance_name: dimVal },
          metricKind: "DELTA",
          valueType: "INT64",
          point: { int64Value: toInt64String(randInt(0, err ? 95_000_000 : 65_000_000)) },
        },
        {
          metricType: "compute.googleapis.com/instance/network/sent_bytes_count",
          resourceType: "gce_instance",
          resourceLabels: res,
          extraServiceLabels: { instance_name: dimVal },
          metricKind: "DELTA",
          valueType: "INT64",
          point: {
            int64Value: toInt64String(randInt(1_000_000, err ? 220_000_000_000 : 160_000_000_000)),
          },
        },
      ];
    }
    case "database": {
      const res = { project_id, database_id: dimVal, region };
      return [
        {
          metricType: "cloudsql.googleapis.com/database/cpu/utilization",
          resourceType: "cloudsql_database",
          resourceLabels: res,
          metricKind: "GAUGE",
          valueType: "DOUBLE",
          point: { doubleValue: dp(jitter(0.44, 0.26, 0.05, err ? 0.98 : 0.88)) },
        },
        {
          metricType: "cloudsql.googleapis.com/database/memory/utilization",
          resourceType: "cloudsql_database",
          resourceLabels: res,
          metricKind: "GAUGE",
          valueType: "DOUBLE",
          point: { doubleValue: dp(jitter(0.56, 0.18, 0.1, err ? 0.96 : 0.88)) },
        },
        {
          metricType: "redis.googleapis.com/stats/memory/usage_ratio",
          resourceType: "redis_instance",
          resourceLabels: { project_id, region, instance_id: dimVal },
          metricKind: "GAUGE",
          valueType: "DOUBLE",
          point: { doubleValue: dp(jitter(0.58, 0.2, 0.12, err ? 0.98 : 0.92)) },
        },
      ];
    }
    case "networking": {
      const res = {
        project_id,
        url_map_name: dimVal,
        forwarding_rule_name: "fr-generic",
        target_proxy_name: "tp-generic",
        region,
      };
      return [
        {
          metricType: "loadbalancing.googleapis.com/https/request_count",
          resourceType: "https_lb_rule",
          resourceLabels: res,
          metricLabels: { response_code_class: err ? "4xx" : "2xx" },
          metricKind: "DELTA",
          valueType: "INT64",
          point: { int64Value: toInt64String(randInt(100, err ? 900_000 : 600_000)) },
        },
        {
          metricType: "dns.googleapis.com/query/response_count",
          resourceType: "dns_query",
          resourceLabels: { project_id, target_name: dimVal, location: region },
          metricKind: "DELTA",
          valueType: "INT64",
          point: { int64Value: toInt64String(randInt(200, 800_000)) },
        },
      ];
    }
    case "storage": {
      const res = { project_id, bucket_name: dimVal, location: region };
      return [
        {
          metricType: "storage.googleapis.com/api/request_count",
          resourceType: "gcs_bucket",
          resourceLabels: res,
          metricLabels: { method: "GET", response_code: err ? "503" : "200" },
          metricKind: "DELTA",
          valueType: "INT64",
          point: { int64Value: toInt64String(randInt(0, err ? 50_000 : 400_000)) },
        },
        {
          metricType: "storage.googleapis.com/storage/total_bytes",
          resourceType: "gcs_bucket",
          resourceLabels: res,
          metricKind: "GAUGE",
          valueType: "DOUBLE",
          point: { doubleValue: randInt(50_000_000, 40_000_000_000) },
        },
      ];
    }
    case "ml": {
      const res = { project_id, location: region, endpoint_id: dimVal };
      return [
        {
          metricType: "aiplatform.googleapis.com/prediction/online_prediction_request_count",
          resourceType: "aiplatform.googleapis.com/Endpoint",
          resourceLabels: res,
          metricLabels: { deployed_model_id: "dm-generic" },
          metricKind: "DELTA",
          valueType: "INT64",
          point: { int64Value: toInt64String(randInt(0, err ? 800 : 4000)) },
        },
        {
          metricType: "dialogflow.googleapis.com/request_count",
          resourceType: "global",
          resourceLabels: { project_id },
          metricLabels: { agent_name: dimVal },
          metricKind: "DELTA",
          valueType: "INT64",
          point: { int64Value: toInt64String(randInt(0, err ? 12_000 : 80_000)) },
        },
      ];
    }
    case "orchestration": {
      return [
        {
          metricType: "cloudbuild.googleapis.com/build/build_count",
          resourceType: "cloud_build",
          resourceLabels: { project_id, build_id: dimVal },
          metricLabels: { status: err ? "FAILURE" : "SUCCESS" },
          metricKind: "DELTA",
          valueType: "INT64",
          point: { int64Value: toInt64String(randInt(0, err ? 40 : 200)) },
        },
        {
          metricType: "composer.googleapis.com/environment/dag_processing_duration",
          resourceType: "cloud_composer_environment",
          resourceLabels: {
            project_id,
            image_version: "composer-2",
            location: region,
            environment_name: dimVal,
          },
          metricKind: "DELTA",
          valueType: "DISTRIBUTION",
          point: distributionFromMs(
            err
              ? jitter(420_000, 180_000, 60_000, 3_600_000)
              : jitter(90_000, 45_000, 5000, 900_000),
            randInt(20, 200),
            err
          ),
        },
      ];
    }
    case "observability": {
      return [
        {
          metricType: "monitoring.googleapis.com/billing/bytes_ingested",
          resourceType: "global",
          resourceLabels: { project_id },
          metricLabels: { workspace: dimVal },
          metricKind: "DELTA",
          valueType: "INT64",
          point: {
            int64Value: toInt64String(randInt(1_000_000, err ? 12_000_000_000 : 8_000_000_000)),
          },
        },
        {
          metricType: "logging.googleapis.com/log_entry_count",
          resourceType: "project",
          resourceLabels: { project_id },
          metricLabels: { log: dimVal },
          metricKind: "DELTA",
          valueType: "INT64",
          point: { int64Value: toInt64String(randInt(5000, err ? 2_000_000 : 1_200_000)) },
        },
      ];
    }
    case "messaging": {
      const res = { project_id, subscription_id: dimVal };
      return [
        {
          metricType: "pubsub.googleapis.com/subscription/num_undelivered_messages",
          resourceType: "pubsub_subscription",
          resourceLabels: res,
          metricKind: "GAUGE",
          valueType: "INT64",
          point: { int64Value: toInt64String(randInt(0, err ? 5_000_000 : 400_000)) },
        },
        {
          metricType: "cloudtasks.googleapis.com/queue/task_attempt_count",
          resourceType: "cloud_tasks_queue",
          resourceLabels: { project_id, queue_id: dimVal, location: region },
          metricKind: "DELTA",
          valueType: "INT64",
          point: { int64Value: toInt64String(randInt(0, err ? 50_000 : 400_000)) },
        },
      ];
    }
    case "api_gateway": {
      const res = { project_id, gateway_id: dimVal, location: region };
      return [
        {
          metricType: "serviceruntime.googleapis.com/api/request_count",
          resourceType: "api",
          resourceLabels: res,
          metricLabels: { response_code: err ? "503" : "200" },
          metricKind: "DELTA",
          valueType: "INT64",
          point: { int64Value: toInt64String(randInt(0, err ? 400_000 : 2_000_000)) },
        },
        {
          metricType: "apigee.googleapis.com/environment/analytics.requests",
          resourceType: "apigee.googleapis.com/Environment",
          resourceLabels: { project_id, location: region, environment: dimVal },
          metricKind: "DELTA",
          valueType: "INT64",
          point: { int64Value: toInt64String(randInt(0, 900_000)) },
        },
      ];
    }
    case "iot": {
      return [
        {
          metricType: "cloudiot.googleapis.com/device/active_device_count",
          resourceType: "cloudiot_device_registry",
          resourceLabels: { project_id, device_registry_id: "registry-main", location: region },
          metricKind: "GAUGE",
          valueType: "INT64",
          point: { int64Value: toInt64String(randInt(10, err ? 120_000 : 80_000)) },
        },
        {
          metricType: "cloudiot.googleapis.com/device/sent_bytes_count",
          resourceType: "cloudiot_device",
          resourceLabels: {
            project_id,
            device_num_id: "42",
            registry_id: "registry-main",
            location: region,
          },
          metricLabels: { device_type: dimVal },
          metricKind: "DELTA",
          valueType: "INT64",
          point: { int64Value: toInt64String(randInt(0, err ? 8_000_000 : 4_000_000)) },
        },
      ];
    }
    case "security": {
      return [
        {
          metricType: "cloudkms.googleapis.com/cryptokey/request_count",
          resourceType: "cloudkms_cryptokey",
          resourceLabels: { project_id, location: region, key_ring: "ring-1", crypto_key: dimVal },
          metricLabels: { response_code: err ? "PERMISSION_DENIED" : "OK" },
          metricKind: "DELTA",
          valueType: "INT64",
          point: { int64Value: toInt64String(randInt(0, err ? 12_000 : 200_000)) },
        },
        {
          metricType: "secretmanager.googleapis.com/secret/version/access_count",
          resourceType: "secretmanager.googleapis.com/SecretVersion",
          resourceLabels: { project_id, secret_id: dimVal, version_id: "latest" },
          metricKind: "DELTA",
          valueType: "INT64",
          point: { int64Value: toInt64String(randInt(0, 90_000)) },
        },
      ];
    }
    default: {
      return [
        {
          metricType: "serviceruntime.googleapis.com/api/request_count",
          resourceType: "consumed_api",
          resourceLabels: { project_id, service: "generic.googleapis.com", method: dimKey },
          metricLabels: { credential_id: dimVal },
          metricKind: "DELTA",
          valueType: "INT64",
          point: { int64Value: toInt64String(randInt(0, err ? 20_000 : 100_000)) },
        },
        {
          metricType: "monitoring.googleapis.com/uptime_check/check_passed",
          resourceType: "uptime_url",
          resourceLabels: { project_id, host: dimVal },
          metricKind: "GAUGE",
          valueType: "INT64",
          point: { int64Value: toInt64String(err ? 0 : 1) },
        },
      ];
    }
  }
}

export function makeGcpGenericGenerator(serviceId: string, dataset: string): MetricGenerator {
  const templateKey = GCP_TEMPLATE_MAP[serviceId] ?? "default";
  const template = GCP_METRIC_TEMPLATES[templateKey] ?? GCP_METRIC_TEMPLATES.default;
  const dimEntry = template.find((t): t is { dim: string; vals: string[] } => "dim" in t);
  const tmplPart = template.find((t): t is { templateKey: string } => "templateKey" in t);
  const specKey = tmplPart?.templateKey ?? templateKey;

  return function gcpGenericMetricGenerator(ts: string, er: number) {
    const { region, project } = pickGcpCloudContext();
    const dimKey = dimEntry?.dim ?? "resource_id";
    const dimVals = dimEntry?.vals ?? ["resource-1", "resource-2"];
    const numDims = Math.min(randInt(1, 3), dimVals.length);

    return Array.from({ length: numDims }, (_, i) => {
      const dimVal = dimVals[i % dimVals.length]!;
      return specsForTemplate(specKey, dimKey, dimVal, project, region, er).map((spec) =>
        gcpMetricDoc(ts, serviceId, dataset, region, project, spec)
      );
    }).flat();
  };
}
