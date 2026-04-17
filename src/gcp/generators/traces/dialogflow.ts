import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

export function generateDialogflowTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const otel = gcpOtelMeta("nodejs");
  const svc = gcpServiceBase("support-bot-gateway", env, "nodejs", {
    framework: "Express",
    runtimeName: "node",
    runtimeVersion: "20.15.1",
  });
  const dfCloud = gcpCloud(region, project, "dialogflow.googleapis.com");
  const webhookCloud = gcpCloud(region, project, "run.googleapis.com");

  const s1 = randSpanId();
  const s2 = randSpanId();
  const s3 = randSpanId();
  const u1 = randInt(5_000, 180_000);
  const u2 = randInt(20_000, 600_000);
  const u3 = randInt(8_000, 350_000);
  const err2 = isErr && randInt(0, 1) === 0;
  const err3 = isErr && !err2;

  const spanDetect: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: s1,
      type: "external",
      subtype: "grpc",
      name: "Dialogflow.DetectIntent",
      duration: { us: u1 },
      action: "call",
      destination: { service: { resource: "dialogflow", type: "external", name: "dialogflow" } },
      labels: { "gcp.dialogflow.agent": "support-prod" },
    },
    service: svc,
    cloud: dfCloud,
    data_stream: APM_DS,
    event: { outcome: "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s1),
  };

  const spanFulfill: EcsDocument = {
    "@timestamp": offsetTs(base, Math.max(1, Math.round(u1 / 1000))),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: s2,
      type: "external",
      subtype: "http",
      name: "Dialogflow fulfillment webhook",
      duration: { us: u2 },
      action: "call",
      destination: { service: { resource: "https", type: "external", name: "https" } },
      labels: err2 ? { "http.status_code": "500" } : { "http.status_code": "200" },
    },
    service: svc,
    cloud: webhookCloud,
    data_stream: APM_DS,
    event: { outcome: err2 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s2),
  };

  const spanKb: EcsDocument = {
    "@timestamp": offsetTs(base, Math.max(1, Math.round((u1 + u2) / 1000))),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: s3,
      type: "db",
      subtype: "elasticsearch",
      name: "Dialogflow.AgentAssist.search",
      duration: { us: u3 },
      action: "query",
      db: { type: "elasticsearch", statement: "search knowledgeArticles" },
      destination: { service: { resource: "dialogflow", type: "db", name: "dialogflow" } },
      labels: err3 ? { "gcp.rpc.status_code": "DEADLINE_EXCEEDED" } : {},
    },
    service: svc,
    cloud: dfCloud,
    data_stream: APM_DS,
    event: { outcome: err2 ? "success" : err3 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s3),
  };

  const totalUs = u1 + u2 + u3 + randInt(1_000, 12_000);
  const txErr = err2 || err3;
  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: "POST /chat/message",
      type: "request",
      duration: { us: totalUs },
      result: txErr ? "HTTP 502" : "HTTP 2xx",
      sampled: true,
      span_count: { started: 3, dropped: 0 },
    },
    service: svc,
    cloud: dfCloud,
    data_stream: APM_DS,
    event: { outcome: txErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, spanDetect, spanFulfill, spanKb];
}
