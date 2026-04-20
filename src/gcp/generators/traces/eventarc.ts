import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

export function generateEventarcTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const trigger = rand(["audit-log-trigger", "storage-finalize", "pubsub-order-topic"]);
  const dest = rand(["cloud-run-handler", "workflows-pipeline", "cloud-functions-fn"]);
  const otel = gcpOtelMeta("go");
  const svc = gcpServiceBase("eventarc-dispatcher", env, "go", {
    runtimeName: "go",
    runtimeVersion: "1.22",
  });
  const cloud = gcpCloud(region, project, "eventarc.googleapis.com");

  const u1 = randInt(800, 45_000);
  const u2 = randInt(1_000, 90_000);
  const u3 = randInt(5_000, 500_000) * (isErr ? randInt(2, 5) : 1);

  const failIdx = isErr ? randInt(0, 2) : -1;
  let offsetMs = 0;

  const s1 = randSpanId();
  const spanReceive: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: s1,
      type: "messaging",
      subtype: "http",
      name: "Eventarc.receiveEvent",
      duration: { us: u1 },
      action: "receive",
      destination: { service: { resource: "eventarc", type: "messaging", name: "eventarc" } },
      labels: {
        "gcp.eventarc.trigger": trigger,
        ...(failIdx === 0 ? { "gcp.rpc.status_code": "INVALID_ARGUMENT" } : {}),
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
  const spanMatch: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s1 },
    span: {
      id: s2,
      type: "app",
      subtype: "eventarc",
      name: `Eventarc.matchTrigger ${trigger}`,
      duration: { us: u2 },
      action: "process",
      destination: {
        service: { resource: "eventarc_trigger", type: "app", name: "eventarc_trigger" },
      },
      labels:
        failIdx === 1 ? { "gcp.eventarc.match": "no_route" } : { "gcp.eventarc.match": "routed" },
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
  const spanDeliver: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s2 },
    span: {
      id: s3,
      type: "external",
      subtype: "http",
      name: `Eventarc.deliverDestination ${dest}`,
      duration: { us: u3 },
      action: "call",
      destination: {
        service: {
          resource: "eventarc_destination",
          type: "external",
          name: "eventarc_destination",
        },
      },
      labels:
        failIdx === 2
          ? { "gcp.rpc.status_code": "UNAVAILABLE", "http.status_code": "503" }
          : { "http.status_code": "202" },
    },
    service: svc,
    cloud,
    data_stream: APM_DS,
    event: { outcome: failIdx === 2 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s3),
  };

  const totalUs = u1 + u2 + u3 + randInt(200, 3000) * 1000;
  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `Eventarc route (${trigger})`,
      type: "messaging",
      duration: { us: totalUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: 3, dropped: 0 },
    },
    service: svc,
    cloud,
    labels: { "gcp.eventarc.trigger": trigger, "gcp.eventarc.destination": dest },
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, spanReceive, spanMatch, spanDeliver];
}
