/**
 * Pub/Sub OTel trace: publisher → topic routing → subscription pull → Cloud Functions handler.
 */

import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";

const APM_AGENT = { name: "opentelemetry/nodejs", version: "1.x" } as const;
const APM_DS = { type: "traces", dataset: "apm", namespace: "default" } as const;

export function generatePubSubTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging", "dev"]);
  const topic = rand(["order-events", "user-activity", "billing-stream"]);
  const sub = `${topic}-push-sub`;

  const pubUs = randInt(1200, 45_000);
  const topicUs = randInt(400, 18_000);
  const subUs = randInt(800, 55_000);
  const fnUs = randInt(5000, 400_000);

  const failIdx = isErr ? randInt(0, 3) : -1;

  const sPub = randSpanId();
  const sTopic = randSpanId();
  const sSub = randSpanId();
  const sFn = randSpanId();

  let offsetMs = 0;

  const spanPub: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: sPub,
      type: "messaging",
      subtype: "pubsub",
      name: `PubSub.publish ${topic}`,
      duration: { us: pubUs },
      action: "send",
      destination: { service: { resource: "pubsub", type: "messaging", name: "pubsub" } },
    },
    service: {
      name: "checkout-publisher",
      environment: env,
      language: { name: "nodejs" },
      runtime: { name: "nodejs", version: "20.x" },
    },
    cloud: gcpCloud(region, project, "pubsub.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failIdx === 0 ? "failure" : "success" },
  };
  offsetMs += Math.max(1, Math.round(pubUs / 1000));

  const spanTopic: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: sPub },
    span: {
      id: sTopic,
      type: "messaging",
      subtype: "pubsub",
      name: `PubSub.topic ${topic} route`,
      duration: { us: topicUs },
      action: "process",
      destination: { service: { resource: "pubsub", type: "messaging", name: "pubsub" } },
    },
    service: { name: "pubsub-control-plane", environment: env, language: { name: "go" } },
    cloud: gcpCloud(region, project, "pubsub.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failIdx === 1 ? "failure" : "success" },
  };
  offsetMs += Math.max(1, Math.round(topicUs / 1000));

  const spanSub: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: sTopic },
    span: {
      id: sSub,
      type: "messaging",
      subtype: "pubsub",
      name: `PubSub.subscription ${sub} deliver`,
      duration: { us: subUs },
      action: "receive",
      destination: { service: { resource: "pubsub", type: "messaging", name: "pubsub" } },
    },
    service: { name: "pubsub-data-plane", environment: env, language: { name: "go" } },
    cloud: gcpCloud(region, project, "pubsub.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failIdx === 2 ? "failure" : "success" },
  };
  offsetMs += Math.max(1, Math.round(subUs / 1000));

  const spanFn: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: sSub },
    span: {
      id: sFn,
      type: "request",
      subtype: "cloud_functions",
      name: `functions.process_${topic.replace(/-/g, "_")}`,
      duration: { us: fnUs },
      action: "invoke",
      destination: {
        service: { resource: "cloudfunctions", type: "request", name: "cloudfunctions" },
      },
    },
    service: {
      name: `${topic}-handler`,
      environment: env,
      language: { name: "nodejs" },
      runtime: { name: "nodejs", version: "20.x" },
      framework: { name: "Google Cloud Functions" },
    },
    cloud: gcpCloud(region, project, "cloudfunctions.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failIdx === 3 ? "failure" : "success" },
  };

  const totalUs = pubUs + topicUs + subUs + fnUs + randInt(500, 4000) * 1000;
  const txErr = isErr;

  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `Pub/Sub pipeline ${topic}`,
      type: "messaging",
      duration: { us: totalUs },
      result: txErr ? "failure" : "success",
      sampled: true,
      span_count: { started: 4, dropped: 0 },
    },
    service: {
      name: "checkout-publisher",
      environment: env,
      language: { name: "nodejs" },
      runtime: { name: "nodejs", version: "20.x" },
    },
    cloud: gcpCloud(region, project, "pubsub.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: txErr ? "failure" : "success" },
  };

  return [txDoc, spanPub, spanTopic, spanSub, spanFn];
}
