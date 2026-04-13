/**
 * GCP serverless metric generators: Cloud Functions, Cloud Run, App Engine.
 */

import { GCP_METRICS_DATASET_MAP } from "../../data/elasticMaps.js";
import {
  randInt,
  jitter,
  dp,
  stat,
  counter,
  gcpMetricDoc,
  pickGcpCloudContext,
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

const AE_VERSION_IDS = ["v1", "v2-canary", "v3-staging"];

export function generateCloudFunctionsMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["cloud-functions"]!;
  const n = randInt(1, 3);
  return Array.from({ length: n }, () => {
    const function_name = rand(CF_FUNCTION_NAMES);
    const isErr = Math.random() < er;
    return gcpMetricDoc(
      ts,
      "cloud-functions",
      dataset,
      region,
      project,
      { function_name },
      {
        execution_count: counter(randInt(0, 500)),
        execution_times_ms: stat(dp(isErr ? jitter(3000, 2000, 500, 10000) : jitter(250, 180, 10, 3000))),
        memory_utilization: stat(dp(jitter(0.45, 0.3, 0, 1))),
        instance_count: counter(randInt(0, 50)),
        network_egress: counter(randInt(0, 5_000_000)),
      }
    );
  });
}

export function generateCloudRunMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["cloud-run"]!;
  const n = randInt(1, 3);
  return Array.from({ length: n }, () => {
    const service_name = rand(CR_SERVICE_NAMES);
    const isErr = Math.random() < er;
    return gcpMetricDoc(
      ts,
      "cloud-run",
      dataset,
      region,
      project,
      { service_name },
      {
        request_count: counter(randInt(0, 2000)),
        request_latencies_ms: stat(dp(isErr ? jitter(500, 400, 80, 5000) : jitter(80, 60, 5, 1000))),
        container_instance_count: counter(randInt(0, 20)),
        cpu_utilization: stat(dp(jitter(0.35, 0.25, 0, 1))),
        memory_utilization: stat(dp(jitter(0.5, 0.3, 0, 1))),
        billable_container_instances: counter(randInt(0, 20)),
      }
    );
  });
}

export function generateAppEngineMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["app-engine"]!;
  const n = randInt(1, 3);
  return Array.from({ length: n }, () => {
    const version_id = rand(AE_VERSION_IDS);
    const isErr = Math.random() < er;
    return gcpMetricDoc(
      ts,
      "app-engine",
      dataset,
      region,
      project,
      { version_id },
      {
        requests: counter(randInt(0, 5000)),
        http_response_count: counter(randInt(0, 5000)),
        latencies_ms: stat(dp(isErr ? jitter(800, 600, 120, 10000) : jitter(120, 90, 10, 2000))),
        memory_usage: stat(dp(jitter(400_000_000, 200_000_000, 50_000_000, 1_000_000_000))),
        instances: counter(randInt(1, 20)),
      }
    );
  });
}
