import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import {
  APM_DS,
  gcpCloudTraceMeta,
  gcpOtelMeta,
  gcpServiceBase,
  gcpSpanFailureLabels,
} from "./trace-kit.js";

export function generatePubSubLiteTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const topic = rand(["events-lite", "metrics-lite", "audit-lite"]);
  const subscription = `${topic}-sub`;
  const otel = gcpOtelMeta("go");
  const svc = gcpServiceBase("lite-consumer", env, "go", { runtimeName: "go", runtimeVersion: "1.23" });
  const cloud = gcpCloud(region, project, "pubsublite.googleapis.com");

  const ops = [
    { name: `PubSubLite.publish ${topic}`, resource: "pubsub_lite", us: randInt(1_000, 25_000) },
    { name: `PubSubLite.subscribe ${subscription}`, resource: "pubsub_lite", us: randInt(2_000, 45_000) },
    { name: "PubSubLite.acknowledge", resource: "pubsub_lite", us: randInt(300, 12_000) },
  ];
  const failIdx = isErr ? randInt(0, ops.length - 1) : -1;
  let offsetMs = 0;
  const spans: EcsDocument[] = [];
  let sum = 0;
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i]!;
    const sid = randSpanId();
    const spanErr = failIdx === i;
    sum += o.us;
    spans.push({
      "@timestamp": offsetTs(base, offsetMs),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sid,
        type: "messaging",
        subtype: "pubsub_lite",
        name: o.name,
        duration: { us: o.us },
        action: i === 0 ? "publish" : i === 1 ? "receive" : "ack",
        destination: { service: { resource: o.resource, type: "messaging", name: o.resource } },
        labels: {
          "messaging.destination": topic,
          ...(spanErr ? gcpSpanFailureLabels() : {}),
        },
      },
      service: svc,
      cloud,
      data_stream: APM_DS,
      event: { outcome: spanErr ? "failure" : "success" },
      ...otel,
      ...gcpCloudTraceMeta(project.id, traceId, sid),
    });
    offsetMs += Math.max(1, Math.round(o.us / 1000));
  }

  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `Process message from ${topic}`,
      type: "request",
      duration: { us: sum + randInt(800, 5000) },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: spans.length, dropped: 0 },
    },
    service: svc,
    cloud,
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };
  return [txDoc, ...spans];
}
