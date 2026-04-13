/**
 * Gemini AI OTel trace: model inference with optional RAG retrieval and cache check spans.
 */

import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";

const APM_AGENT = { name: "opentelemetry/nodejs", version: "1.x" } as const;
const APM_DS = { type: "traces", dataset: "apm", namespace: "default" } as const;

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

  let offsetMs = 0;
  const spanDocs: EcsDocument[] = [];
  let totalUs = 0;

  // Optional span: Firestore cache check (before model call)
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
      service: {
        name: "ai-assistant-api",
        environment: env,
        language: { name: "python" },
        runtime: { name: "python", version: "3.12" },
      },
      cloud: gcpCloud(region, project, "firestore.googleapis.com"),
      agent: APM_AGENT,
      data_stream: APM_DS,
      event: { outcome: "success" },
    });
    offsetMs += Math.max(1, Math.round(cacheUs / 1000));
  }

  // Optional span: GCS context document retrieval (RAG)
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
      service: {
        name: "ai-assistant-api",
        environment: env,
        language: { name: "python" },
        runtime: { name: "python", version: "3.12" },
      },
      cloud: gcpCloud(region, project, "storage.googleapis.com"),
      agent: APM_AGENT,
      data_stream: APM_DS,
      event: { outcome: "success" },
    });
    offsetMs += Math.max(1, Math.round(ragUs / 1000));
  }

  // Span: Gemini model call
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
      },
    },
    service: {
      name: "ai-assistant-api",
      environment: env,
      language: { name: "python" },
      runtime: { name: "python", version: "3.12" },
    },
    cloud: gcpCloud(region, project, "generativelanguage.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    "gcp.trace.model": model,
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
    service: {
      name: "ai-assistant-api",
      environment: env,
      language: { name: "python" },
      runtime: { name: "python", version: "3.12" },
    },
    cloud: gcpCloud(region, project, "generativelanguage.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    "gcp.trace.model": model,
  };

  return [txDoc, ...spanDocs];
}
