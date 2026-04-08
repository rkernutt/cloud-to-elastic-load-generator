/**
 * GCP networking metric generators: Cloud Load Balancing, Cloud CDN.
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
import type { EcsDocument } from "../../../aws/generators/types.js";

const URL_MAPS = ["api-map", "web-frontend-map", "grpc-services-map", "static-assets-map"];
const BACKEND_SERVICES = ["api-bs", "web-bs", "default-bs", "canary-bs"];
const ORIGINS = ["cdn.example.com", "api.internal", "storage.googleapis.com", "assets.cdn"];
const CACHE_RESULTS = ["hit", "miss", "revalidated"];

export function generateCloudLbMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["cloud-lb"]!;
  const n = randInt(1, 3);
  return Array.from({ length: n }, (_, i) => {
    const url_map = URL_MAPS[i % URL_MAPS.length];
    const backend_service = BACKEND_SERVICES[i % BACKEND_SERVICES.length];
    const stressed = Math.random() < er;
    return gcpMetricDoc(
      ts,
      "cloud-lb",
      dataset,
      region,
      project,
      { url_map, backend_service },
      {
        request_count: counter(randInt(1_000, 5_000_000)),
        total_latencies: stat(dp(jitter(stressed ? 450 : 85, stressed ? 200 : 60, 5, 10_000))),
        backend_latencies: stat(dp(jitter(stressed ? 380 : 65, stressed ? 180 : 50, 3, 8_000))),
      }
    );
  });
}

export function generateCloudCdnMetrics(ts: string, _er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["cloud-cdn"]!;
  const n = randInt(1, 3);
  return Array.from({ length: n }, (_, i) => {
    const origin = ORIGINS[i % ORIGINS.length];
    const cache_result = CACHE_RESULTS[i % CACHE_RESULTS.length];
    return gcpMetricDoc(
      ts,
      "cloud-cdn",
      dataset,
      region,
      project,
      { origin, cache_result },
      {
        cache_hit_count: counter(randInt(10_000, 20_000_000)),
        cache_miss_count: counter(randInt(500, 2_000_000)),
        total_bandwidth: counter(randInt(50_000_000, 500_000_000_000)),
      }
    );
  });
}
