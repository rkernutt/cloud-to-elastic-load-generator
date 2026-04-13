/**
 * GCP AI/ML metric generators: Vertex AI.
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

const VERTEX_ENDPOINT_IDS = ["endpoint-chat", "endpoint-embed", "endpoint-classify"];

export function generateVertexAiMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["vertex-ai"]!;
  const n = randInt(1, 3);
  return Array.from({ length: n }, () => {
    const endpoint_id = rand(VERTEX_ENDPOINT_IDS);
    const isErr = Math.random() < er;
    return gcpMetricDoc(
      ts,
      "vertex-ai",
      dataset,
      region,
      project,
      { endpoint_id },
      {
        prediction_count: counter(randInt(0, 1000)),
        prediction_latencies_ms: stat(
          dp(isErr ? jitter(2000, 1500, 250, 10000) : jitter(250, 200, 20, 3000))
        ),
        online_prediction_request_count: counter(randInt(0, 1000)),
        failed_prediction_count: counter(isErr ? randInt(1, 50) : 0),
        active_models: counter(randInt(1, 5)),
        accelerator_duty_cycle: stat(dp(jitter(0.6, 0.3, 0, 1))),
      }
    );
  });
}
