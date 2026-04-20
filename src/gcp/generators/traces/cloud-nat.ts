import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

export function generateCloudNatTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const natGateway = rand(["nat-gw-primary", "nat-gw-data", "nat-gw-egress"]);
  const dest = rand(["api.stripe.com:443", "registry.npmjs.org:443", "packages.elastic.co:443"]);
  const otel = gcpOtelMeta("go");
  const svc = gcpServiceBase("vpc-egress-controller", env, "go", {
    runtimeName: "go",
    runtimeVersion: "1.22",
  });
  const cloud = gcpCloud(region, project, "compute.googleapis.com");

  const u1 = randInt(1_000, 55_000);
  const u2 = randInt(800, 45_000);
  const u3 = randInt(1_200, 90_000);
  const u4 = randInt(5_000, 500_000) * (isErr ? randInt(2, 5) : 1);

  const failIdx = isErr ? randInt(0, 3) : -1;
  let offsetMs = 0;

  const s1 = randSpanId();
  const spanOutbound: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: s1,
      type: "external",
      subtype: "tcp",
      name: `NAT.outbound ${dest}`,
      duration: { us: u1 },
      action: "connect",
      destination: { service: { resource: "nat", type: "external", name: "nat" } },
      labels: {
        "gcp.nat.gateway": natGateway,
        ...(failIdx === 0 ? { "gcp.nat.error": "NO_EXTERNAL_IP" } : {}),
      },
    },
    service: svc,
    cloud,
    data_stream: APM_DS,
    event: { outcome: failIdx === 0 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s1),
  };
  offsetMs += Math.max(1, Math.round(u1 / 1000));

  const s2 = randSpanId();
  const spanTranslate: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s1 },
    span: {
      id: s2,
      type: "app",
      subtype: "nat",
      name: "CloudNAT.translateAddress",
      duration: { us: u2 },
      action: "process",
      destination: { service: { resource: "nat_mapping", type: "app", name: "nat_mapping" } },
      labels: failIdx === 1 ? { "gcp.rpc.status_code": "RESOURCE_EXHAUSTED" } : {},
    },
    service: svc,
    cloud,
    data_stream: APM_DS,
    event: { outcome: failIdx === 1 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s2),
  };
  offsetMs += Math.max(1, Math.round(u2 / 1000));

  const s3 = randSpanId();
  const spanRoute: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s2 },
    span: {
      id: s3,
      type: "external",
      subtype: "network",
      name: "DefaultInternetGateway.route",
      duration: { us: u3 },
      action: "route",
      destination: {
        service: { resource: "internet_gateway", type: "external", name: "internet_gateway" },
      },
      labels:
        failIdx === 2 ? { "gcp.network.route": "blackholed" } : { "gcp.network.route": "internet" },
    },
    service: svc,
    cloud,
    data_stream: APM_DS,
    event: { outcome: failIdx === 2 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s3),
  };
  offsetMs += Math.max(1, Math.round(u3 / 1000));

  const s4 = randSpanId();
  const spanResponse: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s3 },
    span: {
      id: s4,
      type: "external",
      subtype: "tcp",
      name: "NAT.response",
      duration: { us: u4 },
      action: "receive",
      destination: { service: { resource: "nat", type: "external", name: "nat" } },
      labels: failIdx === 3 ? { "gcp.nat.error": "CONNECTION_RESET" } : {},
    },
    service: svc,
    cloud,
    data_stream: APM_DS,
    event: { outcome: failIdx === 3 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s4),
  };

  const totalUs = u1 + u2 + u3 + u4 + randInt(300, 4000) * 1000;
  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `Egress via Cloud NAT (${natGateway})`,
      type: "request",
      duration: { us: totalUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: 4, dropped: 0 },
    },
    service: svc,
    cloud,
    labels: { "gcp.nat.name": natGateway, "gcp.egress.destination": dest },
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, spanOutbound, spanTranslate, spanRoute, spanResponse];
}
