/**
 * GCP networking metric generators: Cloud Load Balancing, Cloud CDN, Cloud DNS, Cloud Armor.
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

const DNS_TARGETS = ["api.internal.example.com.", "db.prod.example.com.", "external"];
const DNS_ZONES = ["globex-public", "globex-private", "partner-delegation"];

export function generateCloudDnsMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["cloud-dns"]!;
  const target_name = rand(DNS_TARGETS);
  const noisy = Math.random() < er;
  const queryRes = {
    project_id: project.id,
    target_name,
    location: region,
    target_type: rand(["public-zone", "private-zone", "external"]),
    source_type: rand(["gce-vm", "internet"]),
  };
  const rc = noisy
    ? rand(["SERVFAIL", "NXDOMAIN", "FORMERR"])
    : rand(["NOERROR", "NOERROR", "NXDOMAIN"]);
  const qCount = randInt(400, noisy ? 2_200_000 : 1_400_000);
  const latMs = noisy ? jitter(180, 95, 4, 6000) : jitter(12, 8, 0.5, 220);
  const distN = randInt(800, 14_000);
  const zone_name = rand(DNS_ZONES);
  const zoneRes = {
    project_id: project.id,
    zone_name,
    location: "global",
  };
  const rrsets = randInt(8, noisy ? 12_000 : 4_200);

  return [
    gcpMetricDoc(ts, "cloud-dns", dataset, region, project, {
      metricType: "dns.googleapis.com/query/response_count",
      resourceType: "dns_query",
      resourceLabels: queryRes,
      metricLabels: { response_code: rc },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(qCount) },
    }),
    gcpMetricDoc(ts, "cloud-dns", dataset, region, project, {
      metricType: "dns.googleapis.com/query/latencies",
      resourceType: "dns_query",
      resourceLabels: queryRes,
      metricLabels: { response_code: rc },
      metricKind: "DELTA",
      valueType: "DISTRIBUTION",
      point: distributionFromMs(latMs, distN, noisy),
    }),
    gcpMetricDoc(ts, "cloud-dns", dataset, region, project, {
      metricType: "dns.googleapis.com/managed_zone/rrset_count",
      resourceType: "dns_managed_zone",
      resourceLabels: zoneRes,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(rrsets) },
    }),
  ];
}

export function generateCloudArmorMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["cloud-armor"]!;
  const policy_name = rand(["edge-waf-prod", "api-shield", "partner-allowlist"]);
  const backend = rand(["be-checkout", "be-graphql", "be-static"]);
  const loc = rand(["global", region]);
  const polRes = {
    project_id: project.id,
    location: loc,
    policy_name,
  };
  const attack = Math.random() < er;
  const allowed = randInt(attack ? 2_000 : 40_000, attack ? 180_000 : 2_200_000);
  const denied = randInt(attack ? 8_000 : 0, attack ? 420_000 : 18_000);
  const preview = randInt(attack ? 1_200 : 40, attack ? 90_000 : 6_000);
  const ruleEval = randInt(attack ? 50_000 : 8_000, attack ? 8_000_000 : 2_400_000);

  return [
    gcpMetricDoc(ts, "cloud-armor", dataset, region, project, {
      metricType: "networksecurity.googleapis.com/https/request_count",
      resourceType: "network_security_policy",
      resourceLabels: polRes,
      metricLabels: { blocked: "false", backend_target_name: backend },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(allowed) },
    }),
    gcpMetricDoc(ts, "cloud-armor", dataset, region, project, {
      metricType: "networksecurity.googleapis.com/https/request_count",
      resourceType: "network_security_policy",
      resourceLabels: polRes,
      metricLabels: { blocked: "true", backend_target_name: backend },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(denied) },
    }),
    gcpMetricDoc(ts, "cloud-armor", dataset, region, project, {
      metricType: "networksecurity.googleapis.com/https/previewed_request_count",
      resourceType: "network_security_policy",
      resourceLabels: polRes,
      metricLabels: { blocked: "false", backend_target_name: backend },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(preview) },
    }),
    gcpMetricDoc(ts, "cloud-armor", dataset, region, project, {
      metricType: "networksecurity.googleapis.com/l3/external/packet_count",
      resourceType: "networksecurity.googleapis.com/RegionalNetworkSecurityPolicy",
      resourceLabels: {
        resource_container: project.id,
        location: region,
        policy_name,
      },
      metricLabels: {
        rule_number: String(randInt(1000, 2147483000)),
        blocked: attack ? "true" : "false",
      },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(ruleEval) },
    }),
  ];
}
