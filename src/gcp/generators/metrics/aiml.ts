/**
 * GCP AI/ML metric generators: Vertex AI, Gemini API.
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
const GEMINI_MODELS = ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"];

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

export function generateGeminiMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP.gemini!;
  const model = rand(GEMINI_MODELS);
  const isErr = Math.random() < er;
  const locRes = {
    resource_container: project.id,
    location: region,
  };
  const outTok = randInt(isErr ? 400 : 4_000, isErr ? 180_000 : 820_000);
  const inTok = randInt(isErr ? 800 : 8_000, isErr ? 260_000 : 1_200_000);
  const reqs = randInt(isErr ? 80 : 400, isErr ? 12_000 : 48_000);
  const latMs = isErr ? jitter(2800, 1600, 200, 22_000) : jitter(420, 280, 40, 5200);
  const distN = randInt(80, 2800);
  const errCount = isErr ? randInt(4, 900) : 0;

  return [
    gcpMetricDoc(ts, "gemini", dataset, region, project, {
      metricType: "generativelanguage.googleapis.com/generate_content_usage_output_token_count",
      resourceType: "generativelanguage.googleapis.com/Location",
      resourceLabels: locRes,
      metricLabels: {
        model,
        output_modality: "TEXT",
        thinking_enabled: "false",
      },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(outTok) },
    }),
    gcpMetricDoc(ts, "gemini", dataset, region, project, {
      metricType:
        "generativelanguage.googleapis.com/quota/generate_content_free_tier_input_token_count/usage",
      resourceType: "generativelanguage.googleapis.com/Location",
      resourceLabels: locRes,
      metricLabels: {
        limit_name: "GenerateContentInputTokensPerModelPerMinute",
        method: "google.ai.generativelanguage.v1.GenerativeService.GenerateContent",
        model,
      },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(inTok) },
    }),
    gcpMetricDoc(ts, "gemini", dataset, region, project, {
      metricType:
        "generativelanguage.googleapis.com/quota/generate_content_free_tier_requests/usage",
      resourceType: "generativelanguage.googleapis.com/Location",
      resourceLabels: locRes,
      metricLabels: {
        limit_name: "GenerateContentRequestsPerMinutePerProjectPerModel",
        method: "google.ai.generativelanguage.v1.GenerativeService.GenerateContent",
        model,
      },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(reqs) },
    }),
    gcpMetricDoc(ts, "gemini", dataset, region, project, {
      metricType: "aiplatform.googleapis.com/prediction/online_prediction_latencies",
      resourceType: "aiplatform.googleapis.com/Endpoint",
      resourceLabels: {
        project_id: project.id,
        location: region,
        endpoint_id: `gemini-${model.replace(/\./g, "-")}`,
      },
      metricLabels: { deployed_model_id: model },
      metricKind: "DELTA",
      valueType: "DISTRIBUTION",
      point: distributionFromMs(latMs, distN, isErr),
    }),
    gcpMetricDoc(ts, "gemini", dataset, region, project, {
      metricType: "aiplatform.googleapis.com/prediction/online_prediction_error_count",
      resourceType: "aiplatform.googleapis.com/Endpoint",
      resourceLabels: {
        project_id: project.id,
        location: region,
        endpoint_id: `gemini-${model.replace(/\./g, "-")}`,
      },
      metricLabels: { deployed_model_id: model },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(errCount) },
    }),
  ];
}
