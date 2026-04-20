import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

const RECORD_TYPES = ["A", "AAAA", "CNAME", "TXT"] as const;

export function generateCloudDnsTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging", "dev"]);
  const zone = rand(["prod-public", "internal-corp", "edge-dns"]);
  const fqdn = rand(["api.globex.example.", "cdn.globex.example.", "mail.globex.example."]);
  const rtype = rand(RECORD_TYPES);
  const otel = gcpOtelMeta("python");
  const svc = gcpServiceBase("dns-resolver-agent", env, "python", {
    runtimeName: "python",
    runtimeVersion: "3.12",
  });
  const cloud = gcpCloud(region, project, "dns.googleapis.com");

  const u1 = randInt(300, 18_000);
  const u2 = randInt(500, 35_000);
  const u3 = randInt(1_000, 80_000);
  const u4 = randInt(400, 40_000) * (isErr ? randInt(2, 6) : 1);

  const failIdx = isErr ? randInt(0, 3) : -1;
  let offsetMs = 0;

  const s1 = randSpanId();
  const spanQuery: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: s1,
      type: "external",
      subtype: "dns",
      name: `DNS.query ${rtype} ${fqdn}`,
      duration: { us: u1 },
      action: "query",
      destination: { service: { resource: "dns", type: "external", name: "dns" } },
      labels: failIdx === 0 ? { "gcp.dns.rcode": "FORMERR" } : { "gcp.dns.rcode": "NOERROR" },
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
  const spanZone: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s1 },
    span: {
      id: s2,
      type: "db",
      subtype: "dns",
      name: `ManagedZone.lookup ${zone}`,
      duration: { us: u2 },
      action: "access",
      destination: { service: { resource: "managed_zone", type: "db", name: "managed_zone" } },
      labels: {
        "gcp.dns.managed_zone": zone,
        ...(failIdx === 1 ? { "gcp.rpc.status_code": "NOT_FOUND" } : {}),
      },
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
  const spanRecord: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s2 },
    span: {
      id: s3,
      type: "db",
      subtype: "dns",
      name: `ResourceRecordSet.resolve ${rtype}`,
      duration: { us: u3 },
      action: "query",
      destination: { service: { resource: "rrset", type: "db", name: "rrset" } },
      labels: failIdx === 2 ? { "gcp.dns.rcode": "NXDOMAIN" } : {},
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
      subtype: "dns",
      name: "DNS.response",
      duration: { us: u4 },
      action: "send",
      destination: {
        service: { resource: "dns_response", type: "external", name: "dns_response" },
      },
      labels: failIdx === 3 ? { "gcp.rpc.status_code": "DEADLINE_EXCEEDED" } : {},
    },
    service: svc,
    cloud,
    data_stream: APM_DS,
    event: { outcome: failIdx === 3 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s4),
  };

  const totalUs = u1 + u2 + u3 + u4 + randInt(200, 2500) * 1000;
  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `Resolve ${fqdn} (${rtype})`,
      type: "request",
      duration: { us: totalUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: 4, dropped: 0 },
    },
    service: svc,
    cloud,
    labels: { "gcp.dns.zone": zone, "gcp.dns.fqdn": fqdn },
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, spanQuery, spanZone, spanRecord, spanResponse];
}
