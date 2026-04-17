/**
 * GCP AI/ML metric generators: Vertex AI.
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

const VERTEX_ENDPOINT_IDS = ["endpoint-chat", "endpoint-embed", "endpoint-classify"];

export function generateVertexAiMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["vertex-ai"]!;
  const endpoint_id = rand(VERTEX_ENDPOINT_IDS);
  const isErr = Math.random() < er;
  const res = { project_id: project.id, location: region, endpoint_id };
  const predCount = randInt(isErr ? 20 : 120, isErr ? 900 : 4200);
  const latMs = isErr ? jitter(2400, 1600, 300, 12000) : jitter(240, 190, 18, 3200);
  const distN = randInt(80, 2400);
  const failed = isErr ? randInt(2, 120) : 0;
  const quota = jitter(isErr ? 0.82 : 0.38, 0.22, 0, 1);
  const replicas = randInt(1, isErr ? 8 : 4);

  return [
    gcpMetricDoc(ts, "vertex-ai", dataset, region, project, {
      metricType: "aiplatform.googleapis.com/prediction/online_prediction_request_count",
      resourceType: "aiplatform.googleapis.com/Endpoint",
      resourceLabels: res,
      metricLabels: { deployed_model_id: "deployed-md-prod" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(predCount) },
    }),
    gcpMetricDoc(ts, "vertex-ai", dataset, region, project, {
      metricType: "aiplatform.googleapis.com/prediction/online_prediction_latencies",
      resourceType: "aiplatform.googleapis.com/Endpoint",
      resourceLabels: res,
      metricLabels: { deployed_model_id: "deployed-md-prod" },
      metricKind: "DELTA",
      valueType: "DISTRIBUTION",
      point: distributionFromMs(latMs, distN, isErr),
    }),
    gcpMetricDoc(ts, "vertex-ai", dataset, region, project, {
      metricType: "aiplatform.googleapis.com/prediction/online_prediction_error_count",
      resourceType: "aiplatform.googleapis.com/Endpoint",
      resourceLabels: res,
      metricLabels: { deployed_model_id: "deployed-md-prod" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(failed) },
    }),
    gcpMetricDoc(ts, "vertex-ai", dataset, region, project, {
      metricType: "aiplatform.googleapis.com/prediction/prediction_consumer_spec_quota_utilization",
      resourceType: "aiplatform.googleapis.com/Endpoint",
      resourceLabels: res,
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: { doubleValue: dp(quota) },
    }),
    gcpMetricDoc(ts, "vertex-ai", dataset, region, project, {
      metricType: "aiplatform.googleapis.com/prediction/online_prediction_concurrent_requests",
      resourceType: "aiplatform.googleapis.com/Endpoint",
      resourceLabels: res,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(replicas) },
    }),
  ];
}
