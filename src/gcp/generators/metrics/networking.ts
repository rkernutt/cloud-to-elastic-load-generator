/**
 * GCP networking metric generators: Cloud Load Balancing, Cloud CDN.
 */

import { GCP_METRICS_DATASET_MAP } from "../../data/elasticMaps.js";
import {
  randInt,
  jitter,
  gcpMetricDoc,
  pickGcpCloudContext,
  toInt64String,
  distributionFromMs,
} from "./helpers.js";
import { rand } from "../helpers.js";
import type { EcsDocument } from "../../../aws/generators/types.js";

const URL_MAPS = ["api-map", "web-frontend-map", "grpc-services-map", "static-assets-map"];
const FORWARDING_RULES = ["fr-api-https", "fr-web-https", "fr-grpc", "fr-assets"];
const TARGET_PROXIES = ["tp-api-https", "tp-web-https", "tp-grpc", "tp-default"];

export function generateCloudLbMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["cloud-lb"]!;
  const i = randInt(0, URL_MAPS.length - 1);
  const url_map_name = URL_MAPS[i]!;
  const forwarding_rule_name = FORWARDING_RULES[i]!;
  const target_proxy_name = TARGET_PROXIES[i]!;
  const stressed = Math.random() < er;
  const res = {
    project_id: project.id,
    url_map_name,
    forwarding_rule_name,
    target_proxy_name,
    region,
  };
  const req = randInt(2000, stressed ? 8_000_000 : 5_000_000);
  const beLatMs = stressed ? jitter(420, 200, 8, 9000) : jitter(62, 48, 2, 1200);
  const totLatMs = stressed ? jitter(480, 220, 10, 10000) : jitter(78, 55, 3, 1400);
  const distN = randInt(400, 9000);
  const bytes = randInt(80_000_000, stressed ? 220_000_000_000 : 160_000_000_000);

  return [
    gcpMetricDoc(ts, "cloud-lb", dataset, region, project, {
      metricType: "loadbalancing.googleapis.com/https/request_count",
      resourceType: "https_lb_rule",
      resourceLabels: res,
      metricLabels: { response_code_class: stressed ? "5xx" : "2xx" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(req) },
    }),
    gcpMetricDoc(ts, "cloud-lb", dataset, region, project, {
      metricType: "loadbalancing.googleapis.com/https/backend_latencies",
      resourceType: "https_lb_rule",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "DISTRIBUTION",
      point: distributionFromMs(beLatMs, distN, stressed),
    }),
    gcpMetricDoc(ts, "cloud-lb", dataset, region, project, {
      metricType: "loadbalancing.googleapis.com/https/total_latencies",
      resourceType: "https_lb_rule",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "DISTRIBUTION",
      point: distributionFromMs(totLatMs, distN, stressed),
    }),
    gcpMetricDoc(ts, "cloud-lb", dataset, region, project, {
      metricType: "loadbalancing.googleapis.com/https/request_bytes_count",
      resourceType: "https_lb_rule",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(bytes) },
    }),
  ];
}

export function generateCloudCdnMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["cloud-cdn"]!;
  const url_map_name = URL_MAPS[randInt(0, URL_MAPS.length - 1)]!;
  const forwarding_rule_name = FORWARDING_RULES[randInt(0, FORWARDING_RULES.length - 1)]!;
  const missHeavy = Math.random() < er;
  const cache_decision = missHeavy
    ? rand(["MISS", "REVALIDATED"])
    : rand(["HIT", "MISS", "REVALIDATED"]);
  const res = {
    project_id: project.id,
    url_map_name,
    forwarding_rule_name,
    region,
  };
  const req = randInt(5000, 22_000_000);
  const latMs = cache_decision === "MISS" ? jitter(180, 90, 12, 4000) : jitter(22, 14, 2, 400);
  const distN = randInt(800, 14000);
  const bw = randInt(120_000_000, 420_000_000_000);

  return [
    gcpMetricDoc(ts, "cloud-cdn", dataset, region, project, {
      metricType: "cdn.googleapis.com/http/request_count",
      resourceType: "http_load_balancer",
      resourceLabels: res,
      metricLabels: { cache_decision, response_code_class: "2xx" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(req) },
    }),
    gcpMetricDoc(ts, "cloud-cdn", dataset, region, project, {
      metricType: "cdn.googleapis.com/http/response_latencies",
      resourceType: "http_load_balancer",
      resourceLabels: res,
      metricLabels: { cache_decision },
      metricKind: "DELTA",
      valueType: "DISTRIBUTION",
      point: distributionFromMs(latMs, distN, missHeavy || cache_decision === "MISS"),
    }),
    gcpMetricDoc(ts, "cloud-cdn", dataset, region, project, {
      metricType: "cdn.googleapis.com/http/request_bytes_count",
      resourceType: "http_load_balancer",
      resourceLabels: res,
      metricLabels: { cache_decision },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(bw) },
    }),
  ];
}
