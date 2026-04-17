import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

const GEMINI_OPERATIONS = ["generateContent", "streamGenerateContent", "embedContent"] as const;

const GEMINI_MODELS = ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.0-ultra"] as const;

const CONTEXT_BUCKETS = ["rag-corpus-prod", "knowledge-base-v2", "embeddings-store"];

export function generateGeminiTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "production", "staging", "dev"]);
  const operation = rand(GEMINI_OPERATIONS);
  const model = rand(GEMINI_MODELS);
  const otel = gcpOtelMeta("python");
  const svc = gcpServiceBase("ai-assistant-api", env, "python", {
    runtimeName: "python",
    runtimeVersion: "3.12",
  });

  let offsetMs = 0;
  const spanDocs: EcsDocument[] = [];
  let totalUs = 0;

  const hasCacheCheck = Math.random() < 0.4;
  if (hasCacheCheck) {
    const cacheUs = randInt(500, 8_000);
    const sCache = randSpanId();
    totalUs += cacheUs;
    spanDocs.push({
      "@timestamp": offsetTs(base, offsetMs),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sCache,
        type: "db",
        subtype: "firestore",
        name: "Firestore.getDocument (cache)",
        duration: { us: cacheUs },
        action: "query",
        destination: { service: { resource: "firestore", type: "db", name: "firestore" } },
      },
      service: svc,
      cloud: gcpCloud(region, project, "firestore.googleapis.com"),
      data_stream: APM_DS,
      event: { outcome: "success" },
      ...otel,
      ...gcpCloudTraceMeta(project.id, traceId, sCache),
    });
    offsetMs += Math.max(1, Math.round(cacheUs / 1000));
  }

  const hasRagRetrieval = !hasCacheCheck && Math.random() < 0.5;
  if (hasRagRetrieval) {
    const ragUs = randInt(5_000, 80_000);
    const sRag = randSpanId();
    totalUs += ragUs;
    spanDocs.push({
      "@timestamp": offsetTs(base, offsetMs),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sRag,
        type: "storage",
        subtype: "gcs",
        name: "GCS GetObject (context docs)",
        duration: { us: ragUs },
        action: "retrieve",
        destination: { service: { resource: "gcs", type: "storage", name: "gcs" } },
        labels: { bucket: rand(CONTEXT_BUCKETS) },
      },
      service: svc,
      cloud: gcpCloud(region, project, "storage.googleapis.com"),
      data_stream: APM_DS,
      event: { outcome: "success" },
      ...otel,
      ...gcpCloudTraceMeta(project.id, traceId, sRag),
    });
    offsetMs += Math.max(1, Math.round(ragUs / 1000));
  }

  const promptTokens = randInt(50, 4096);
  const completionTokens = isErr ? 0 : randInt(10, 2048);
  const modelUs = randInt(200_000, 3_000_000) * (isErr ? randInt(2, 5) : 1);
  const sModel = randSpanId();
  totalUs += modelUs;
  spanDocs.push({
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: sModel,
      type: "external",
      subtype: "gemini",
      name: `Gemini ${operation}`,
      duration: { us: modelUs },
      action: "infer",
      destination: {
        service: {
          resource: "generativelanguage.googleapis.com",
          type: "external",
          name: "gemini",
        },
      },
      labels: {
        model,
        prompt_token_count: String(promptTokens),
        completion_token_count: String(completionTokens),
        ...(isErr
          ? { "gcp.rpc.status_code": rand(["RESOURCE_EXHAUSTED", "DEADLINE_EXCEEDED"]) }
          : {}),
      },
    },
    service: svc,
    cloud: gcpCloud(region, project, "generativelanguage.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, sModel),
  });

  const txOverhead = randInt(100, 1000) * 1000;
  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `gemini ${operation}`,
      type: "request",
      duration: { us: totalUs + txOverhead },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: spanDocs.length, dropped: 0 },
    },
    service: svc,
    cloud: gcpCloud(region, project, "generativelanguage.googleapis.com"),
    labels: { model, "gcp.generative_ai.product": "gemini" },
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, ...spanDocs];
}
