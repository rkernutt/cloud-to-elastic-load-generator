import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

export function generatePubSubTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging", "dev"]);
  const topic = rand(["order-events", "user-activity", "billing-stream"]);
  const sub = `${topic}-push-sub`;
  const otel = gcpOtelMeta("nodejs");
  const pubSvc = gcpServiceBase("checkout-publisher", env, "nodejs", {
    runtimeName: "nodejs",
    runtimeVersion: "20.x",
  });

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
      labels: failIdx === 0 ? { "gcp.rpc.status_code": "RESOURCE_EXHAUSTED" } : {},
    },
    service: pubSvc,
    cloud: gcpCloud(region, project, "pubsub.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: failIdx === 0 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, sPub),
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
      labels: failIdx === 1 ? { "gcp.rpc.status_code": "DEADLINE_EXCEEDED" } : {},
    },
    service: gcpServiceBase("pubsub-control-plane", env, "go", {
      runtimeName: "go",
      runtimeVersion: "1.22",
    }),
    cloud: gcpCloud(region, project, "pubsub.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: failIdx === 1 ? "failure" : "success" },
    ...gcpOtelMeta("go"),
    ...gcpCloudTraceMeta(project.id, traceId, sTopic),
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
      labels: failIdx === 2 ? { "gcp.rpc.status_code": "PERMISSION_DENIED" } : {},
    },
    service: gcpServiceBase("pubsub-data-plane", env, "go", {
      runtimeName: "go",
      runtimeVersion: "1.22",
    }),
    cloud: gcpCloud(region, project, "pubsub.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: failIdx === 2 ? "failure" : "success" },
    ...gcpOtelMeta("go"),
    ...gcpCloudTraceMeta(project.id, traceId, sSub),
  };
  offsetMs += Math.max(1, Math.round(subUs / 1000));

  const fnSvc = gcpServiceBase(`${topic}-handler`, env, "nodejs", {
    framework: "Google Cloud Functions",
    runtimeName: "nodejs",
    runtimeVersion: "20.x",
  });
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
      labels: failIdx === 3 ? { "gcp.rpc.status_code": "DEADLINE_EXCEEDED" } : {},
    },
    service: fnSvc,
    cloud: gcpCloud(region, project, "cloudfunctions.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: failIdx === 3 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, sFn),
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
    service: pubSvc,
    cloud: gcpCloud(region, project, "pubsub.googleapis.com"),
    labels: { "gcp.pubsub.topic": topic },
    data_stream: APM_DS,
    event: { outcome: txErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, spanPub, spanTopic, spanSub, spanFn];
}
