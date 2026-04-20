import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

export function generateCloudIdsTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const endpoint = rand(["ids-east-endpoint", "ids-data-plane-1", "ids-threat-egress"]);
  const otel = gcpOtelMeta("java");
  const svc = gcpServiceBase("ids-sensor", env, "java", {
    runtimeName: "java",
    runtimeVersion: "21",
  });
  const cloud = gcpCloud(region, project, "ids.googleapis.com");

  const u1 = randInt(2_000, 120_000);
  const u2 = randInt(1_500, 95_000);
  const u3 = randInt(3_000, 200_000) * (isErr ? randInt(2, 5) : 1);

  const failIdx = isErr ? randInt(0, 2) : -1;
  let offsetMs = 0;

  const s1 = randSpanId();
  const spanInspect: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: s1,
      type: "external",
      subtype: "ids",
      name: "CloudIDS.packetInspection",
      duration: { us: u1 },
      action: "process",
      destination: { service: { resource: "ids", type: "external", name: "ids" } },
      labels: {
        "gcp.ids.endpoint": endpoint,
        ...(failIdx === 0
          ? { "gcp.ids.engine": "decode_error" }
          : { "gcp.ids.engine": "suricata" }),
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
  const spanSig: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s1 },
    span: {
      id: s2,
      type: "app",
      subtype: "ids",
      name: "CloudIDS.signatureMatch",
      duration: { us: u2 },
      action: "process",
      destination: { service: { resource: "ids_ruleset", type: "app", name: "ids_ruleset" } },
      labels: failIdx === 1 ? { "gcp.ids.match": "false_positive" } : { "gcp.ids.match": "threat" },
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
  const spanAlert: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s2 },
    span: {
      id: s3,
      type: "messaging",
      subtype: "http",
      name: "CloudIDS.generateAlert",
      duration: { us: u3 },
      action: "send",
      destination: { service: { resource: "ids_alert", type: "messaging", name: "ids_alert" } },
      labels: failIdx === 2 ? { "gcp.rpc.status_code": "UNAVAILABLE" } : {},
    },
    service: svc,
    cloud: gcpCloud(region, project, "logging.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: failIdx === 2 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s3),
  };

  const totalUs = u1 + u2 + u3 + randInt(200, 2500) * 1000;
  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `Cloud IDS inspection (${endpoint})`,
      type: "request",
      duration: { us: totalUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: 3, dropped: 0 },
    },
    service: svc,
    cloud,
    labels: { "gcp.ids.endpoint": endpoint },
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, spanInspect, spanSig, spanAlert];
}
