/**
 * Amazon Bedrock Agents OTel trace generator.
 *
 * Simulates agent orchestration traces: multi-step AI workflows involving
 * knowledge base retrieval, LLM invocation (via InvokeModel), and optional
 * action group tool calls to external APIs.
 *
 * Real-world instrumentation path:
 *   Application (Python/Node/Java) + EDOT OTel SDK + bedrock-agent instrumentation
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

// ─── Agent configurations ─────────────────────────────────────────────────────
const AGENT_CONFIGS = [
  {
    serviceName: "customer-support-app",
    agentName: "customer-support-agent",
    agentAlias: "prod-v2",
    language: "python",
    framework: "FastAPI",
    runtimeName: "CPython",
    runtimeVersion: "3.12.3",
    model: "anthropic.claude-3-5-sonnet-20241022-v2:0",
    hasKnowledgeBase: true,
    hasActionGroup: true,
    kbName: "support-kb",
    actionGroupName: "crm-integration",
    inputTokenRange: [300, 3000] as [number, number],
    outputTokenRange: [200, 1500] as [number, number],
    llmMsRange: [1500, 12000] as [number, number],
  },
  {
    serviceName: "research-assistant-app",
    agentName: "research-assistant-agent",
    agentAlias: "latest",
    language: "nodejs",
    framework: "Express",
    runtimeName: "node",
    runtimeVersion: "20.15.1",
    model: "anthropic.claude-3-5-sonnet-20241022-v2:0",
    hasKnowledgeBase: true,
    hasActionGroup: false,
    kbName: "research-docs-kb",
    actionGroupName: null,
    inputTokenRange: [500, 6000] as [number, number],
    outputTokenRange: [400, 3000] as [number, number],
    llmMsRange: [2000, 20000] as [number, number],
  },
  {
    serviceName: "code-review-app",
    agentName: "code-review-agent",
    agentAlias: "v1",
    language: "java",
    framework: "Spring Boot",
    runtimeName: "OpenJDK",
    runtimeVersion: "21.0.3",
    model: "anthropic.claude-3-haiku-20240307-v1:0",
    hasKnowledgeBase: false,
    hasActionGroup: true,
    kbName: null,
    actionGroupName: "github-api",
    inputTokenRange: [1000, 8000] as [number, number],
    outputTokenRange: [500, 4000] as [number, number],
    llmMsRange: [3000, 25000] as [number, number],
  },
  {
    serviceName: "data-analyst-app",
    agentName: "data-analyst-agent",
    agentAlias: "prod-stable",
    language: "python",
    framework: "Flask",
    runtimeName: "CPython",
    runtimeVersion: "3.11.9",
    model: "mistral.mistral-large-2402-v1:0",
    hasKnowledgeBase: true,
    hasActionGroup: true,
    kbName: "metrics-catalog-kb",
    actionGroupName: "athena-query",
    inputTokenRange: [400, 4000] as [number, number],
    outputTokenRange: [200, 2000] as [number, number],
    llmMsRange: [1000, 15000] as [number, number],
  },
];

const FINISH_REASONS = ["end_turn", "max_tokens", "stop_sequence"];

/**
 * Generates a Bedrock Agent OTel trace: 1 transaction + 2–4 child spans.
 * @param {string} ts  - ISO timestamp string (base time for the agent invocation)
 * @param {number} er  - error rate 0.0–1.0
 * @returns {Object[]} array of APM documents (transaction first, then spans)
 */
export function generateBedrockAgentTrace(ts: string, er: number) {
  const cfg = rand(AGENT_CONFIGS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "production", "staging", "dev"]);
  const isErr = Math.random() < er;

  const agentId = `AGENT${randInt(10000, 99999)}`;
  const agentAliasId = `ALIAS${randInt(1000, 9999)}`;
  const sessionId = `session-${randHex8()}`;
  const agentTraceId = `trace-${randHex8()}-${randHex8()}`;
  const stepCount = randInt(1, 5);

  const inputTokens = randInt(cfg.inputTokenRange[0], cfg.inputTokenRange[1]);
  const outputTokens = isErr ? 0 : randInt(cfg.outputTokenRange[0], cfg.outputTokenRange[1]);
  const finishReason = isErr ? "stop_sequence" : rand(FINISH_REASONS);
  const llmMs = randInt(cfg.llmMsRange[0], cfg.llmMsRange[1]);

  // Duration components
  const orchestrateMs = randInt(50, 300);
  const kbMs = cfg.hasKnowledgeBase ? randInt(100, 800) : 0;
  const actionMs = cfg.hasActionGroup ? randInt(200, 2000) : 0;
  const totalMs = orchestrateMs + kbMs + llmMs + actionMs + randInt(10, 100);
  const totalUs = totalMs * 1000;

  const spanCount =
    1 + // orchestrate
    (cfg.hasKnowledgeBase ? 1 : 0) +
    1 + // LLM invoke
    (cfg.hasActionGroup ? 1 : 0);

  const sharedLabels: Record<string, string> = {
    agent_id: agentId,
    agent_alias_id: agentAliasId,
    session_id: sessionId,
    agent_trace_id: agentTraceId,
    step_count: String(stepCount),
    gen_ai_system: "aws.bedrock",
    gen_ai_request_model: cfg.model,
    gen_ai_usage_input_tokens: String(inputTokens),
    gen_ai_usage_output_tokens: String(outputTokens),
    gen_ai_response_finish_reason: finishReason,
  };

  if (isErr) {
    sharedLabels["gen_ai_error"] = rand([
      "ThrottlingException",
      "ModelTimeoutException",
      "ActionGroupInvocationException",
    ]);
  }

  const svcBlock = serviceBlock(
    cfg.serviceName,
    env,
    cfg.language,
    cfg.framework,
    cfg.runtimeName,
    cfg.runtimeVersion
  );

  const { agent, telemetry } = otelBlocks(cfg.language, "elastic");

  // ── Root transaction ─────────────────────────────────────────────────────────
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `BedrockAgent.invokeAgent ${cfg.agentAlias}`,
      type: "app",
      duration: { us: totalUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: spanCount, dropped: 0 },
    },
    labels: { ...sharedLabels },
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

  const spans: any[] = [];
  let spanOffsetMs = randInt(1, 5);

  // ── Span 1: BedrockAgent.orchestrate ────────────────────────────────────────
  const orchestrateSpanId = newSpanId();
  spans.push({
    "@timestamp": offsetTs(new Date(ts), spanOffsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: orchestrateSpanId,
      type: "external",
      subtype: "bedrock",
      name: "BedrockAgent.orchestrate",
      duration: { us: totalUs - randInt(10, 50) * 1000 },
      action: "orchestrate",
      destination: { service: { resource: "bedrock", type: "external", name: "bedrock" } },
    },
    labels: { ...sharedLabels },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  });
  spanOffsetMs += orchestrateMs + randInt(1, 5);

  // ── Span 2: Knowledge base retrieval (optional) ──────────────────────────────
  if (cfg.hasKnowledgeBase && cfg.kbName) {
    const kbSpanId = newSpanId();
    const numResults = randInt(1, 10);
    const kbLabels = {
      ...sharedLabels,
      kb_name: cfg.kbName,
      num_results_returned: String(numResults),
      query: rand([
        "How do I reset my password?",
        "What is the refund policy?",
        "Analyse performance metrics for Q3",
        "Summarise recent code changes",
      ]),
    };
    spans.push({
      "@timestamp": offsetTs(new Date(ts), spanOffsetMs),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: orchestrateSpanId },
      span: {
        id: kbSpanId,
        type: "db",
        subtype: "bedrock-kb",
        name: "BedrockKnowledgeBase.retrieve",
        duration: { us: kbMs * 1000 },
        action: "retrieve",
        db: {
          type: "elasticsearch",
          statement: "similarity_search",
        },
        destination: { service: { resource: "bedrock-kb", type: "db", name: "bedrock-kb" } },
      },
      labels: kbLabels,
      event: { outcome: "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    });
    spanOffsetMs += kbMs + randInt(1, 10);
  }

  // ── Span 3: Bedrock.InvokeModel (LLM call) ───────────────────────────────────
  const llmLabels = { ...sharedLabels };
  if (isErr) {
    llmLabels["gen_ai_error"] = rand(["ThrottlingException", "ModelTimeoutException"]);
  }
  spans.push({
    "@timestamp": offsetTs(new Date(ts), spanOffsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: orchestrateSpanId },
    span: {
      id: newSpanId(),
      type: "external",
      subtype: "bedrock",
      name: `bedrock ${cfg.model} invoke`,
      duration: { us: llmMs * 1000 },
      action: "invoke",
      destination: { service: { resource: "bedrock", type: "external", name: "bedrock" } },
    },
    labels: llmLabels,
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  });
  spanOffsetMs += llmMs + randInt(1, 10);

  // ── Span 4: Action group tool call (optional) ────────────────────────────────
  if (cfg.hasActionGroup && cfg.actionGroupName) {
    const actionErr = isErr && Math.random() < 0.5;
    spans.push({
      "@timestamp": offsetTs(new Date(ts), spanOffsetMs),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: orchestrateSpanId },
      span: {
        id: newSpanId(),
        type: "external",
        subtype: "http",
        name: `${cfg.actionGroupName} invoke`,
        duration: { us: actionMs * 1000 },
        action: "send",
        destination: {
          service: {
            resource: cfg.actionGroupName,
            type: "external",
            name: cfg.actionGroupName,
          },
        },
      },
      labels: {
        ...sharedLabels,
        action_group: cfg.actionGroupName,
        ...(actionErr ? { action_error: "ToolCallException" } : {}),
      },
      event: { outcome: actionErr ? "failure" : "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    });
  }

  return [txDoc, ...spans];
}

/** Small helper: 8 random hex chars for session/trace IDs. */
function randHex8() {
  return Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, "0");
}
