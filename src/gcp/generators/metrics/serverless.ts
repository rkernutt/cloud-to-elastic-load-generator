/**
 * GCP serverless metric generators: Cloud Functions, Cloud Run, App Engine.
 */

import { GCP_METRICS_DATASET_MAP } from "../../data/elasticMaps.js";
import {
  randInt,
  jitter,
  dp,
  gcpMetricDoc,
  pickGcpCloudContext,
  toInt64String,
  distributionFromMs,
} from "./helpers.js";
import { rand } from "../helpers.js";
import type { EcsDocument } from "../../../aws/generators/types.js";

const CF_FUNCTION_NAMES = [
  "checkout-webhook",
  "inventory-sync",
  "notification-handler",
  "payment-validator",
];

const CR_SERVICE_NAMES = ["checkout-api", "catalog-svc", "auth-service"];

const AE_MODULES = ["default", "api", "worker", "frontend"];
const AE_VERSION_IDS = ["v1", "v2-canary", "v3-staging"];

export function generateCloudFunctionsMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["cloud-functions"]!;
  const function_name = rand(CF_FUNCTION_NAMES);
  const isErr = Math.random() < er;
  const res = { project_id: project.id, function_name, region };
  const status = isErr ? rand(["internal", "invalid_argument", "deadline_exceeded"]) : "ok";
  const execCount = randInt(isErr ? 40 : 120, isErr ? 900 : 5200);
  const latMs = isErr ? jitter(3200, 2200, 400, 12000) : jitter(220, 160, 8, 2800);
  const count = randInt(80, 900);

  return [
    gcpMetricDoc(ts, "cloud-functions", dataset, region, project, {
      metricType: "cloudfunctions.googleapis.com/function/execution_count",
      resourceType: "cloud_function",
      resourceLabels: res,
      metricLabels: { status },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(execCount) },
    }),
    gcpMetricDoc(ts, "cloud-functions", dataset, region, project, {
      metricType: "cloudfunctions.googleapis.com/function/execution_times",
      resourceType: "cloud_function",
      resourceLabels: res,
      metricLabels: { status },
      metricKind: "DELTA",
      valueType: "DISTRIBUTION",
      point: distributionFromMs(latMs, count, isErr),
    }),
    gcpMetricDoc(ts, "cloud-functions", dataset, region, project, {
      metricType: "cloudfunctions.googleapis.com/function/active_instances",
      resourceType: "cloud_function",
      resourceLabels: res,
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: { doubleValue: dp(jitter(isErr ? 2.8 : 1.1, 0.9, 0, 48)) },
    }),
    gcpMetricDoc(ts, "cloud-functions", dataset, region, project, {
      metricType: "cloudfunctions.googleapis.com/function/user_memory_bytes",
      resourceType: "cloud_function",
      resourceLabels: res,
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: { doubleValue: dp(jitter(2.56e8, 1.2e8, 6.4e7, 1.8e9)) },
    }),
    gcpMetricDoc(ts, "cloud-functions", dataset, region, project, {
      metricType: "cloudfunctions.googleapis.com/function/network_egress_bytes_count",
      resourceType: "cloud_function",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(randInt(0, isErr ? 12_000_000 : 6_000_000)) },
    }),
  ];
}

export function generateCloudRunMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["cloud-run"]!;
  const service_name = rand(CR_SERVICE_NAMES);
  const configuration_name = service_name;
  const revision_name = `${service_name}-${String(randInt(1, 42)).padStart(5, "0")}-${rand(["abc", "def", "xyz"])}`;
  const isErr = Math.random() < er;
  const res = {
    project_id: project.id,
    service_name,
    revision_name,
    configuration_name,
    location: region,
  };
  const rc = isErr ? rand(["5xx", "4xx"]) : "2xx";
  const reqCount = randInt(isErr ? 30 : 200, isErr ? 1800 : 8000);
  const latMs = isErr ? jitter(620, 380, 90, 8000) : jitter(78, 52, 4, 980);
  const distCount = randInt(120, 2400);

  return [
    gcpMetricDoc(ts, "cloud-run", dataset, region, project, {
      metricType: "run.googleapis.com/request_count",
      resourceType: "cloud_run_revision",
      resourceLabels: res,
      metricLabels: { response_code_class: rc },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(reqCount) },
    }),
    gcpMetricDoc(ts, "cloud-run", dataset, region, project, {
      metricType: "run.googleapis.com/request_latencies",
      resourceType: "cloud_run_revision",
      resourceLabels: res,
      metricLabels: { response_code_class: rc },
      metricKind: "DELTA",
      valueType: "DISTRIBUTION",
      point: distributionFromMs(latMs, distCount, isErr),
    }),
    gcpMetricDoc(ts, "cloud-run", dataset, region, project, {
      metricType: "run.googleapis.com/container/cpu/utilizations",
      resourceType: "cloud_run_revision",
      resourceLabels: res,
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: { doubleValue: dp(jitter(isErr ? 0.82 : 0.36, 0.24, 0, 1)) },
    }),
    gcpMetricDoc(ts, "cloud-run", dataset, region, project, {
      metricType: "run.googleapis.com/container/memory/utilizations",
      resourceType: "cloud_run_revision",
      resourceLabels: res,
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: { doubleValue: dp(jitter(isErr ? 0.88 : 0.52, 0.28, 0, 1)) },
    }),
    gcpMetricDoc(ts, "cloud-run", dataset, region, project, {
      metricType: "run.googleapis.com/container/instance_count",
      resourceType: "cloud_run_revision",
      resourceLabels: res,
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: { doubleValue: dp(jitter(isErr ? 6.5 : 2.4, 2.2, 0, 40)) },
    }),
  ];
}

export function generateAppEngineMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["app-engine"]!;
  const module_id = rand(AE_MODULES);
  const version_id = rand(AE_VERSION_IDS);
  const zone = `${region}-${rand(["a", "b"])}`;
  const isErr = Math.random() < er;
  const res = { project_id: project.id, module_id, version_id, zone };
  const respClass = isErr ? rand(["5xx", "4xx"]) : "2xx";
  const respCount = randInt(isErr ? 120 : 800, isErr ? 9000 : 48_000);
  const latMs = isErr ? jitter(920, 520, 140, 12000) : jitter(115, 85, 8, 2200);
  const distN = randInt(200, 5000);

  return [
    gcpMetricDoc(ts, "app-engine", dataset, region, project, {
      metricType: "appengine.googleapis.com/http/server/response_count",
      resourceType: "gae_app",
      resourceLabels: res,
      metricLabels: { response_code: respClass },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(respCount) },
    }),
    gcpMetricDoc(ts, "app-engine", dataset, region, project, {
      metricType: "appengine.googleapis.com/http/server/response_latencies",
      resourceType: "gae_app",
      resourceLabels: res,
      metricLabels: { response_code: respClass },
      metricKind: "DELTA",
      valueType: "DISTRIBUTION",
      point: distributionFromMs(latMs, distN, isErr),
    }),
    gcpMetricDoc(ts, "app-engine", dataset, region, project, {
      metricType: "appengine.googleapis.com/system/instance_count",
      resourceType: "gae_app",
      resourceLabels: res,
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: { doubleValue: dp(jitter(isErr ? 14 : 6.5, 4, 1, 32)) },
    }),
    gcpMetricDoc(ts, "app-engine", dataset, region, project, {
      metricType: "appengine.googleapis.com/memcache/usage",
      resourceType: "gae_app",
      resourceLabels: res,
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: { doubleValue: dp(jitter(1.2e8, 6e7, 1e7, 4.5e8)) },
    }),
  ];
}
