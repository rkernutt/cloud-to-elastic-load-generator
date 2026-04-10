/**
 * Amazon Bedrock OTel trace generator.
 *
 * Simulates GenAI application traces for services calling Amazon Bedrock LLMs,
 * using OpenTelemetry GenAI semantic conventions. Covers RAG patterns, single
 * invocations, structured extraction, and multi-turn chat.
 *
 * Real-world instrumentation path:
 *   Application (Python/Node/Java) + EDOT OTel SDK + opentelemetry-instrumentation-bedrock
 *     → OTLP gRPC/HTTP → Elastic APM Server / OTel Collector
 *       → traces-apm-default
 */

import {
  TRACE_REGIONS,
  TRACE_ACCOUNTS,
  newTraceId,
  newSpanId,
  rand,
  randInt,
  offsetTs,
  serviceBlock,
  otelBlocks,
} from "./helpers.js";

const FINISH_REASONS = ["end_turn", "max_tokens", "stop_sequence"];

// ─── Application configurations ───────────────────────────────────────────────
const APP_CONFIGS = [
  {
    name: "customer-support-bot",
    language: "python",
    framework: "LangChain",
    runtimeName: "CPython",
    runtimeVersion: "3.12.3",
    pattern: "rag",
    model: "anthropic.claude-3-5-sonnet-20241022-v2:0",
    operations: [
      { opName: "query", inputTokens: [200, 2000], outputTokens: [100, 800], llmMs: [1000, 8000] },
      {
        opName: "classify_intent",
        inputTokens: [100, 500],
        outputTokens: [20, 100],
        llmMs: [500, 3000],
      },
    ],
  },
  {
    name: "code-review-assistant",
    language: "nodejs",
    framework: "Express",
    runtimeName: "node",
    runtimeVersion: "20.15.1",
    pattern: "single",
    model: "anthropic.claude-3-5-sonnet-20241022-v2:0",
    operations: [
      {
        opName: "review",
        inputTokens: [1000, 8000],
        outputTokens: [500, 4000],
        llmMs: [3000, 25000],
      },
      {
        opName: "suggest_fixes",
        inputTokens: [800, 4000],
        outputTokens: [400, 2000],
        llmMs: [2000, 15000],
      },
    ],
  },
  {
    name: "document-summariser",
    language: "python",
    framework: "FastAPI",
    runtimeName: "CPython",
    runtimeVersion: "3.11.9",
    pattern: "single",
    model: "anthropic.claude-3-haiku-20240307-v1:0",
    operations: [
      {
        opName: "summarise",
        inputTokens: [3000, 8000],
        outputTokens: [200, 1000],
        llmMs: [2000, 20000],
      },
      {
        opName: "extract_keywords",
        inputTokens: [2000, 6000],
        outputTokens: [50, 300],
        llmMs: [1000, 8000],
      },
    ],
  },
  {
    name: "content-moderator",
    language: "nodejs",
    framework: "Fastify",
    runtimeName: "node",
    runtimeVersion: "20.15.1",
    pattern: "guardrails",
    model: "amazon.titan-text-express-v1",
    operations: [
      { opName: "classify", inputTokens: [100, 600], outputTokens: [10, 50], llmMs: [500, 3000] },
      { opName: "flag_content", inputTokens: [50, 400], outputTokens: [5, 30], llmMs: [300, 2000] },
    ],
  },
  {
    name: "data-extractor",
    language: "python",
    framework: "Flask",
    runtimeName: "CPython",
    runtimeVersion: "3.12.3",
    pattern: "single",
    model: "mistral.mistral-large-2402-v1:0",
    operations: [
      {
        opName: "extract",
        inputTokens: [500, 4000],
        outputTokens: [200, 1500],
        llmMs: [1000, 12000],
      },
      {
        opName: "validate_schema",
        inputTokens: [300, 2000],
        outputTokens: [100, 600],
        llmMs: [800, 6000],
      },
    ],
  },
  {
    name: "chat-assistant",
    language: "java",
    framework: "Spring Boot",
    runtimeName: "OpenJDK",
    runtimeVersion: "21.0.3",
    pattern: "single",
    model: "cohere.command-r-plus-v1:0",
    operations: [
      { opName: "chat", inputTokens: [200, 3000], outputTokens: [100, 1500], llmMs: [800, 10000] },
      {
        opName: "suggest_response",
        inputTokens: [300, 2000],
        outputTokens: [150, 800],
        llmMs: [600, 6000],
      },
    ],
  },
];

function genAiLabels(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  finishReason: string
): Record<string, string> {
  return {
    gen_ai_system: "aws.bedrock",
    gen_ai_request_model: modelId,
    gen_ai_usage_input_tokens: String(inputTokens),
    gen_ai_usage_output_tokens: String(outputTokens),
    gen_ai_response_finish_reason: finishReason,
  };
}

function buildRetrievalSpan(
  traceId: string,
  txId: string,
  parentId: string,
  ts: string,
  spanOffsetMs: number
) {
  const id = newSpanId();
  const durationUs = randInt(50, 500) * 1000;

  return {
    "@timestamp": offsetTs(new Date(ts), spanOffsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: parentId },
    span: {
      id: id,
      type: "db",
      subtype: "opensearch",
      name: "opensearch similarity_search",
      duration: { us: durationUs },
      action: "similarity_search",
      db: { type: "elasticsearch", statement: "similarity_search" },
      destination: { service: { resource: "opensearch", type: "db", name: "opensearch" } },
    },
    event: { outcome: "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };
}

function buildLlmSpan(
  traceId: string,
  txId: string,
  parentId: string,
  ts: string,
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  finishReason: string,
  isErr: boolean,
  spanOffsetMs: number,
  llmMs: number
) {
  const id = newSpanId();
  const durationUs = llmMs * 1000;

  const labels = genAiLabels(modelId, inputTokens, outputTokens, finishReason);
  if (isErr) {
    labels["gen_ai_error"] = rand(["ThrottlingException", "ModelTimeoutException"]);
  }

  return {
    "@timestamp": offsetTs(new Date(ts), spanOffsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: parentId },
    span: {
      id: id,
      type: "gen_ai",
      subtype: "bedrock",
      name: `bedrock ${modelId} invoke`,
      duration: { us: durationUs },
      action: "invoke",
      destination: { service: { resource: "bedrock", type: "gen_ai", name: "bedrock" } },
    },
    labels: labels,
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };
}

function buildGuardrailsSpan(
  traceId: string,
  txId: string,
  parentId: string,
  ts: string,
  spanOffsetMs: number
) {
  const id = newSpanId();
  const durationUs = randInt(50, 200) * 1000;

  return {
    "@timestamp": offsetTs(new Date(ts), spanOffsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: parentId },
    span: {
      id: id,
      type: "external",
      subtype: "aws",
      name: "bedrock applyGuardrail",
      duration: { us: durationUs },
      action: "applyGuardrail",
      destination: { service: { resource: "bedrock", type: "external", name: "bedrock" } },
    },
    event: { outcome: "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };
}

/**
 * Generates a Bedrock GenAI OTel trace: 1 transaction + 1–3 child spans.
 * @param {string} ts  - ISO timestamp string (base time for the invocation)
 * @param {number} er  - error rate 0.0–1.0
 * @returns {Object[]} array of APM documents (transaction first, then spans)
 */
export function generateBedrockTrace(ts: string, er: number) {
  const cfg = rand(APP_CONFIGS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "production", "staging", "dev"]);
  const isErr = Math.random() < er;

  const opConfig = rand(cfg.operations);
  const modelId = cfg.model;
  const inputTokens = randInt(opConfig.inputTokens[0], opConfig.inputTokens[1]);
  const outputTokens = isErr ? 0 : randInt(opConfig.outputTokens[0], opConfig.outputTokens[1]);
  const finishReason = isErr ? "stop_sequence" : rand(FINISH_REASONS);
  const llmMs = randInt(opConfig.llmMs[0], opConfig.llmMs[1]);

  // Total transaction duration covers all child spans
  const retrievalMs = cfg.pattern === "rag" ? randInt(50, 500) : 0;
  const guardrailsMs = cfg.pattern === "guardrails" ? randInt(50, 200) : 0;
  const totalMs = retrievalMs + llmMs + guardrailsMs + randInt(5, 50);
  const totalUs = totalMs * 1000;

  const txLabels = genAiLabels(modelId, inputTokens, outputTokens, finishReason);
  if (isErr) {
    txLabels["gen_ai_error"] = rand(["ThrottlingException", "ModelTimeoutException"]);
  }

  const svcBlock = serviceBlock(
    cfg.name,
    env,
    cfg.language,
    cfg.framework,
    cfg.runtimeName,
    cfg.runtimeVersion
  );

  const { agent, telemetry } = otelBlocks(cfg.language, "elastic");

  // ── Root transaction ────────────────────────────────────────────────────────
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `${cfg.name} ${opConfig.opName}`,
      type: "gen_ai",
      duration: { us: totalUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: {
        started: 1 + (cfg.pattern === "rag" ? 1 : 0) + (cfg.pattern === "guardrails" ? 1 : 0),
        dropped: 0,
      },
    },
    labels: txLabels,
    service: svcBlock,
    agent: agent,
    telemetry: telemetry,
    cloud: {
      provider: "aws",
      region: region,
      account: { id: account.id, name: account.name },
      service: { name: "bedrock" },
    },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  // ── Child spans ──────────────────────────────────────────────────────────────
  const spans: any[] = [];
  let spanOffsetMs = randInt(1, 5);

  // RAG: retrieval span BEFORE model invocation
  if (cfg.pattern === "rag") {
    const retrieval = buildRetrievalSpan(traceId, txId, txId, ts, spanOffsetMs);
    spans.push(retrieval);
    spanOffsetMs += retrieval.span.duration.us / 1000 + randInt(1, 10);
  }

  // Model invocation span (always present)
  const llmSpan = buildLlmSpan(
    traceId,
    txId,
    txId,
    ts,
    modelId,
    inputTokens,
    outputTokens,
    finishReason,
    isErr,
    spanOffsetMs,
    llmMs
  );
  spans.push(llmSpan);
  spanOffsetMs += llmMs + randInt(1, 10);

  // Guardrails: add span AFTER model invocation
  if (cfg.pattern === "guardrails") {
    const guardrails = buildGuardrailsSpan(traceId, txId, txId, ts, spanOffsetMs);
    spans.push(guardrails);
  }

  return [txDoc, ...spans];
}
