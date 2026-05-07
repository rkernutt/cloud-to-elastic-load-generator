/**
 * GCP networking metric generators: Cloud Load Balancing, Cloud CDN, Cloud DNS, Cloud Armor,
 * plus dedicated generators for interconnect, NAT, VPN, Cloud Router, VPC flow telemetry, and
 * several security-related monitoring shapes (KMS, Secret Manager, IDS, CA, IAP, scanners).
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
import type { MonitoringPointValue } from "./helpers.js";
import { rand } from "../helpers.js";
import type { EcsDocument } from "../../../aws/generators/types.js";

const ZONES = ["a", "b", "c"];

function vpcZone(region: string): string {
  return `${region}-${ZONES[randInt(0, ZONES.length - 1)]!}`;
}

function distributionFromUnitScore(
  meanScore: number,
  count: number,
  stressed: boolean
): MonitoringPointValue {
  const c = Math.max(1, Math.round(count));
  const mean = Math.max(0.01, Math.min(0.99, meanScore));
  const spread = stressed ? 0.22 : 0.12;
  return {
    distributionValue: {
      count: String(c),
      mean,
      sumOfSquaredDeviation: dp(spread * spread * c * 0.25),
      bucketCounts: [
        "0",
        toInt64String(c * (stressed ? 0.35 : 0.15)),
        toInt64String(c * 0.4),
        toInt64String(c * 0.2),
        toInt64String(c * 0.05),
      ],
    },
  };
}

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

/* —— Dedicated networking telemetry (native Monitoring types) —— */

export function generateCloudInterconnectMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["cloud-interconnect"]!;
  const interconnect_id = rand(["ic-globex-dc1", "ic-partner-sjc", "ic-primary-equinx"]);
  const attachment_id = rand(["attach-prod-a", "attach-dr-b", "attach-analytics"]);
  const stressed = Math.random() < er;
  const attachRes = {
    project_id: project.id,
    attachment: attachment_id,
    interconnect: interconnect_id,
    region,
    interconnect_project: project.id,
  };
  const icRes = { project_id: project.id, interconnect: interconnect_id };
  const rx = randInt(80_000_000, stressed ? 520_000_000_000 : 280_000_000_000);
  const cap = randInt(1_000_000_000, 10_000_000_000);
  const linkUp = stressed ? 0 : 1;

  return [
    gcpMetricDoc(ts, "cloud-interconnect", dataset, region, project, {
      metricType: "interconnect.googleapis.com/network/attachment/received_bytes_count",
      resourceType: "interconnect_attachment",
      resourceLabels: attachRes,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(rx) },
    }),
    gcpMetricDoc(ts, "cloud-interconnect", dataset, region, project, {
      metricType: "interconnect.googleapis.com/network/attachment/capacity",
      resourceType: "interconnect_attachment",
      resourceLabels: attachRes,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(cap) },
    }),
    gcpMetricDoc(ts, "cloud-interconnect", dataset, region, project, {
      metricType: "interconnect.googleapis.com/network/interconnect/link/operational",
      resourceType: "interconnect",
      resourceLabels: icRes,
      metricLabels: { link_id: rand(["link-0", "link-1"]) },
      metricKind: "GAUGE",
      valueType: "BOOL",
      point: { doubleValue: linkUp ? 1 : 0 },
    }),
  ];
}

export function generateCloudNatMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["cloud-nat"]!;
  const router_id = rand(["cr-edge-01", "cr-shared-02", "cr-prod-03"]);
  const gateway_name = rand(["nat-gw-primary", "nat-gw-egress", "nat-gw-batch"]);
  const natRes = { project_id: project.id, region, router_id, gateway_name };
  const stressed = Math.random() < er;
  const proto = rand(["TCP", "UDP", "ICMP"]);
  const newConn = randInt(2000, stressed ? 1_800_000 : 620_000);
  const ports = randInt(400, stressed ? 48_000 : 18_000);
  const dropped = randInt(stressed ? 800 : 0, stressed ? 120_000 : 900);

  return [
    gcpMetricDoc(ts, "cloud-nat", dataset, region, project, {
      metricType: "router.googleapis.com/nat/new_connections_count",
      resourceType: "nat_gateway",
      resourceLabels: natRes,
      metricLabels: { ip_protocol: proto },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(newConn) },
    }),
    gcpMetricDoc(ts, "cloud-nat", dataset, region, project, {
      metricType: "router.googleapis.com/nat/port_usage",
      resourceType: "nat_gateway",
      resourceLabels: natRes,
      metricLabels: { ip_protocol: proto },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(ports) },
    }),
    gcpMetricDoc(ts, "cloud-nat", dataset, region, project, {
      metricType: "router.googleapis.com/nat/dropped_sent_packets_count",
      resourceType: "nat_gateway",
      resourceLabels: natRes,
      metricLabels: {
        ip_protocol: proto,
        reason: stressed ? "OUT_OF_RESOURCES" : "ENDPOINT_INDEPENDENCE_CONFLICT",
      },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(dropped) },
    }),
  ];
}

export function generateCloudVpnMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["cloud-vpn"]!;
  const gateway_id = rand(["vpn-gw-ha-1", "vpn-gw-onprem", "vpn-gw-partner"]);
  const tunnel_name = rand(["tunnel-36auc1", "tunnel-2zw9qn", "tunnel-dr-04"]);
  const gwRes = {
    project_id: project.id,
    gateway_id,
    region,
  };
  const stressed = Math.random() < er;
  const sent = randInt(12_000_000, stressed ? 90_000_000_000 : 42_000_000_000);
  const recv = randInt(10_000_000, stressed ? 82_000_000_000 : 38_000_000_000);

  return [
    gcpMetricDoc(ts, "cloud-vpn", dataset, region, project, {
      metricType: "vpn.googleapis.com/tunnel_established",
      resourceType: "vpn_gateway",
      resourceLabels: gwRes,
      metricLabels: { tunnel_name, gateway_name: gateway_id },
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: { doubleValue: dp(stressed ? 0.05 : 1.0) },
    }),
    gcpMetricDoc(ts, "cloud-vpn", dataset, region, project, {
      metricType: "vpn.googleapis.com/network/sent_bytes_count",
      resourceType: "vpn_gateway",
      resourceLabels: gwRes,
      metricLabels: { tunnel_name, gateway_name: gateway_id },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(sent) },
    }),
    gcpMetricDoc(ts, "cloud-vpn", dataset, region, project, {
      metricType: "vpn.googleapis.com/network/received_bytes_count",
      resourceType: "vpn_gateway",
      resourceLabels: gwRes,
      metricLabels: { tunnel_name, gateway_name: gateway_id },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(recv) },
    }),
  ];
}

export function generateCloudRouterMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["cloud-router"]!;
  const router_id = rand([
    "cr-northamerica-northeast1-04qw",
    "cr-us-west2-k9m2",
    "cr-eu-west1-aa01",
  ]);
  const bgp_peer = rand(["peer-onprem-1", "peer-transit-2", "peer-partner-3"]);
  const routerRes = { project_id: project.id, router_id, region };
  const stressed = Math.random() < er;
  const recvRoutes = randInt(8, stressed ? 420 : 180);
  const sentRoutes = randInt(4, stressed ? 210 : 96);
  const sessionsUp = stressed ? randInt(0, 2) : randInt(2, 8);

  return [
    gcpMetricDoc(ts, "cloud-router", dataset, region, project, {
      metricType: "router.googleapis.com/bgp/received_routes_count",
      resourceType: "gce_router",
      resourceLabels: routerRes,
      metricLabels: { bgp_peer_name: bgp_peer },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(recvRoutes) },
    }),
    gcpMetricDoc(ts, "cloud-router", dataset, region, project, {
      metricType: "router.googleapis.com/bgp/sent_routes_count",
      resourceType: "gce_router",
      resourceLabels: routerRes,
      metricLabels: { bgp_peer_name: bgp_peer },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(sentRoutes) },
    }),
    gcpMetricDoc(ts, "cloud-router", dataset, region, project, {
      metricType: "router.googleapis.com/bgp_sessions_up_count",
      resourceType: "gce_router",
      resourceLabels: routerRes,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(sessionsUp) },
    }),
  ];
}

export function generateVpcFlowMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["vpc-flow"]!;
  const zone = vpcZone(region);
  const instance_id = String(randInt(1000_000_000, 9999_999_999));
  const instRes = { project_id: project.id, instance_id, zone };
  const stressed = Math.random() < er;
  const net = rand(["default", "vpc-app", "vpc-data"]);
  const subnet = rand(["subnet-app-01", "subnet-db-02", "subnet-batch-03"]);
  const nic = rand(["nic0", "ens4"]);
  const labels = {
    local_network: net,
    local_subnetwork: subnet,
    local_network_interface: nic,
    remote_country: "US",
    remote_continent: "America",
    remote_project_id: "REMOTE_IS_EXTERNAL",
    remote_network: "",
    remote_subnetwork: "",
    remote_network_interface: "",
    remote_zone: "",
    remote_region: "NOT_APPLICABLE",
    remote_location_type: "EXTERNAL",
  };
  const ingress = randInt(50_000_000, stressed ? 280_000_000_000 : 120_000_000_000);
  const egress = randInt(40_000_000, stressed ? 260_000_000_000 : 110_000_000_000);
  const packets = randInt(200_000, stressed ? 18_000_000 : 6_000_000);

  return [
    gcpMetricDoc(ts, "vpc-flow", dataset, region, project, {
      metricType: "networking.googleapis.com/vm_flow/ingress_bytes_count",
      resourceType: "gce_instance",
      resourceLabels: instRes,
      metricLabels: labels,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(ingress) },
    }),
    gcpMetricDoc(ts, "vpc-flow", dataset, region, project, {
      metricType: "networking.googleapis.com/vm_flow/egress_bytes_count",
      resourceType: "gce_instance",
      resourceLabels: instRes,
      metricLabels: labels,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(egress) },
    }),
    gcpMetricDoc(ts, "vpc-flow", dataset, region, project, {
      metricType: "networking.googleapis.com/vm_flow/ingress_packets_count",
      resourceType: "gce_instance",
      resourceLabels: instRes,
      metricLabels: labels,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(packets) },
    }),
  ];
}

/* —— Security-adjacent services (still emitted from networking.ts for cohesion) —— */

export function generateCloudKmsMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["cloud-kms"]!;
  const key_ring = rand(["prod-keys", "payment-hsm", "staging-ring"]);
  const crypto_key = rand(["jwt-signing", "tls-cert", "data-encryption"]);
  const ckRes = { project_id: project.id, location: region, key_ring, crypto_key };
  const stressed = Math.random() < er;
  const reqs = randInt(400, stressed ? 180_000 : 95_000);
  const versions = randInt(1, stressed ? 8 : 24);

  return [
    gcpMetricDoc(ts, "cloud-kms", dataset, region, project, {
      metricType: "cloudkms.googleapis.com/cryptokey/request_count",
      resourceType: "cloudkms_cryptokey",
      resourceLabels: ckRes,
      metricLabels: { response_code: stressed ? "PERMISSION_DENIED" : "OK" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(reqs) },
    }),
    gcpMetricDoc(ts, "cloud-kms", dataset, region, project, {
      metricType: "cloudkms.googleapis.com/cryptokey/version_count",
      resourceType: "cloudkms_cryptokey",
      resourceLabels: ckRes,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(versions) },
    }),
  ];
}

export function generateSecretManagerMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["secret-manager"]!;
  const secret_id = rand(["db-creds-L45V", "webhook-hmac-AZ4L", "api-token-9k2"]);
  const noisy = Math.random() < er;
  const accesses = randInt(50, noisy ? 42_000 : 18_000);
  const apiReq = randInt(200, noisy ? 90_000 : 38_000);

  return [
    gcpMetricDoc(ts, "secret-manager", dataset, region, project, {
      metricType: "secretmanager.googleapis.com/secret/version/access_count",
      resourceType: "secretmanager.googleapis.com/Secret",
      resourceLabels: {
        resource_container: project.id,
        location: "global",
        secret_id,
      },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(accesses) },
    }),
    gcpMetricDoc(ts, "secret-manager", dataset, region, project, {
      metricType: "serviceruntime.googleapis.com/api/request_count",
      resourceType: "consumed_api",
      resourceLabels: {
        project_id: project.id,
        service: "secretmanager.googleapis.com",
        method: "/google.cloud.secretmanager.v1.SecretManagerService/AccessSecretVersion",
        version: "v1",
        location: "global",
        credential_id: "",
      },
      metricLabels: {
        protocol: "grpc",
        response_code: noisy ? "7" : "0",
        response_code_class: noisy ? "4xx" : "2xx",
      },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(apiReq) },
    }),
  ];
}

export function generateCloudIdsMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["cloud-ids"]!;
  const zone = vpcZone(region);
  const endpointRes = {
    resource_container: project.id,
    location: zone,
    id: rand(["ids-endp-prod-a", "ids-endp-analytics", "ids-endp-pci"]),
  };
  const stressed = Math.random() < er;
  const bytes = randInt(200_000_000, stressed ? 220_000_000_000 : 95_000_000_000);
  const pkts = randInt(800_000, stressed ? 120_000_000 : 48_000_000);

  return [
    gcpMetricDoc(ts, "cloud-ids", dataset, region, project, {
      metricType: "ids.googleapis.com/received_bytes_count",
      resourceType: "ids.googleapis.com/Endpoint",
      resourceLabels: endpointRes,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(bytes) },
    }),
    gcpMetricDoc(ts, "cloud-ids", dataset, region, project, {
      metricType: "ids.googleapis.com/received_packets_count",
      resourceType: "ids.googleapis.com/Endpoint",
      resourceLabels: endpointRes,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(pkts) },
    }),
  ];
}

export function generateBinaryAuthorizationMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["binary-authorization"]!;
  const noisy = Math.random() < er;
  const allowed = randInt(2_000, noisy ? 180_000 : 620_000);
  const denied = randInt(noisy ? 400 : 0, noisy ? 28_000 : 1200);

  return [
    gcpMetricDoc(ts, "binary-authorization", dataset, region, project, {
      metricType: "serviceruntime.googleapis.com/api/request_count",
      resourceType: "consumed_api",
      resourceLabels: {
        project_id: project.id,
        service: "binaryauthorization.googleapis.com",
        method: "/google.cloud.binaryauthorization.v1.ValidationHelper/Validate",
        version: "v1",
        location: "global",
        credential_id: "",
      },
      metricLabels: {
        protocol: "grpc",
        response_code: "0",
        response_code_class: "2xx",
      },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(allowed) },
    }),
    gcpMetricDoc(ts, "binary-authorization", dataset, region, project, {
      metricType: "serviceruntime.googleapis.com/api/request_count",
      resourceType: "consumed_api",
      resourceLabels: {
        project_id: project.id,
        service: "binaryauthorization.googleapis.com",
        method: "/google.cloud.binaryauthorization.v1.ValidationHelper/Validate",
        version: "v1",
        location: "global",
        credential_id: "",
      },
      metricLabels: {
        protocol: "grpc",
        response_code: "7",
        response_code_class: "4xx",
      },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(denied) },
    }),
  ];
}

export function generateCertificateAuthorityMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["certificate-authority"]!;
  const ca_pool_id = rand(["internal-pki", "partner-external", "workload-mtls"]);
  const certificate_authority_id = rand([
    "intermediate-prod",
    "dev-subordinate",
    "regional-signer",
  ]);
  const caRes = {
    resource_container: project.id,
    location: region,
    ca_pool_id,
    certificate_authority_id,
  };
  const stressed = Math.random() < er;
  const issued = randInt(20, stressed ? 4000 : 1600);
  const failures = randInt(0, stressed ? 80 : 12);
  const revokedFlag = stressed && Math.random() < 0.25;

  return [
    gcpMetricDoc(ts, "certificate-authority", dataset, region, project, {
      metricType: "privateca.googleapis.com/ca/cert/create_count",
      resourceType: "privateca.googleapis.com/CertificateAuthority",
      resourceLabels: caRes,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(issued) },
    }),
    gcpMetricDoc(ts, "certificate-authority", dataset, region, project, {
      metricType: "privateca.googleapis.com/ca/cert/create_failure_count",
      resourceType: "privateca.googleapis.com/CertificateAuthority",
      resourceLabels: caRes,
      metricLabels: { reason: stressed ? "POLICY" : "VALIDATION", error_detail: "synthetic" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(failures) },
    }),
    gcpMetricDoc(ts, "certificate-authority", dataset, region, project, {
      metricType: "privateca.googleapis.com/ca/cert_revoked",
      resourceType: "privateca.googleapis.com/CertificateAuthority",
      resourceLabels: caRes,
      metricLabels: { status: revokedFlag ? "REVOKED" : "NOT_REVOKED" },
      metricKind: "GAUGE",
      valueType: "BOOL",
      point: { doubleValue: revokedFlag ? 1 : 0 },
    }),
  ];
}

export function generateIdentityAwareProxyMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["identity-aware-proxy"]!;
  const ok = randInt(8_000, 1_200_000);
  const iapErr = Math.random() < er;
  const deny = randInt(iapErr ? 400 : 10, iapErr ? 180_000 : 9000);

  return [
    gcpMetricDoc(ts, "identity-aware-proxy", dataset, region, project, {
      metricType: "serviceruntime.googleapis.com/api/request_count",
      resourceType: "consumed_api",
      resourceLabels: {
        project_id: project.id,
        service: "iap.googleapis.com",
        method: "/google.cloud.iap.v1.IdentityAwareProxyService/AuthorizeUser",
        version: "v1",
        location: "global",
        credential_id: "",
      },
      metricLabels: {
        protocol: "https",
        response_code: "200",
        response_code_class: "2xx",
      },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(ok) },
    }),
    gcpMetricDoc(ts, "identity-aware-proxy", dataset, region, project, {
      metricType: "serviceruntime.googleapis.com/api/request_count",
      resourceType: "consumed_api",
      resourceLabels: {
        project_id: project.id,
        service: "iap.googleapis.com",
        method: "/google.cloud.iap.v1.IdentityAwareProxyService/AuthorizeUser",
        version: "v1",
        location: "global",
        credential_id: "",
      },
      metricLabels: {
        protocol: "https",
        response_code: "403",
        response_code_class: "4xx",
      },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(deny) },
    }),
  ];
}

export function generateWebSecurityScannerMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["web-security-scanner"]!;
  const noisy = Math.random() < er;
  const findings = randInt(0, noisy ? 12_000 : 1800);

  return [
    gcpMetricDoc(ts, "web-security-scanner", dataset, region, project, {
      metricType: "websecurityscanner.googleapis.com/scan/finding_count",
      resourceType: "project",
      resourceLabels: { project_id: project.id },
      metricLabels: {
        severity: noisy ? rand(["HIGH", "MEDIUM", "CRITICAL"]) : rand(["LOW", "MEDIUM"]),
        result_state: "FOUND",
      },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(findings) },
    }),
  ];
}

export function generateWebRiskMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["web-risk"]!;
  const noisy = Math.random() < er;
  const lookups = randInt(400, noisy ? 900_000 : 320_000);
  const updates = randInt(5, noisy ? 4000 : 800);
  const apiErr = Math.random() < er;

  return [
    gcpMetricDoc(ts, "web-risk", dataset, region, project, {
      metricType: "serviceruntime.googleapis.com/api/request_count",
      resourceType: "consumed_api",
      resourceLabels: {
        project_id: project.id,
        service: "webrisk.googleapis.com",
        method: "/google.webrisk.v1.WebRiskService/SearchUris",
        version: "v1",
        location: "global",
        credential_id: "",
      },
      metricLabels: { protocol: "grpc", response_code_class: apiErr ? "4xx" : "2xx" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(lookups) },
    }),
    gcpMetricDoc(ts, "web-risk", dataset, region, project, {
      metricType: "webrisk.googleapis.com/threat_list/update_count",
      resourceType: "project",
      resourceLabels: { project_id: project.id },
      metricLabels: { threat_type: rand(["SOCIAL_ENGINEERING", "MALWARE", "UNWANTED_SOFTWARE"]) },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(updates) },
    }),
  ];
}

export function generateRecaptchaEnterpriseMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["recaptcha-enterprise"]!;
  const keyRes = {
    resource_container: project.id,
    location: "global",
    key_id: rand(["login-checkbox-prod", "checkout-invisible", "mobile-app-key"]),
  };
  const stressed = Math.random() < er;
  const assessments = randInt(800, stressed ? 2_200_000 : 950_000);
  const distN = randInt(500, 8000);
  const meanScore = stressed ? 0.28 : 0.72;

  return [
    gcpMetricDoc(ts, "recaptcha-enterprise", dataset, region, project, {
      metricType: "recaptchaenterprise.googleapis.com/assessment_count",
      resourceType: "recaptchaenterprise.googleapis.com/Key",
      resourceLabels: keyRes,
      metricLabels: { token_status: stressed ? "invalid_reason_unspecified" : "valid" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(assessments) },
    }),
    gcpMetricDoc(ts, "recaptcha-enterprise", dataset, region, project, {
      metricType: "recaptchaenterprise.googleapis.com/assessments",
      resourceType: "recaptchaenterprise.googleapis.com/Key",
      resourceLabels: keyRes,
      metricLabels: { action: "login", platform: "web", challenge: "nocaptcha" },
      metricKind: "DELTA",
      valueType: "DISTRIBUTION",
      point: distributionFromUnitScore(meanScore, distN, stressed),
    }),
  ];
}
