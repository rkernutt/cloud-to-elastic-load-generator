/**
 * Amazon EventBridge OTel trace generator.
 *
 * Simulates EventBridge rules firing and invoking targets, with the entire
 * fan-out captured in one trace. The root transaction represents the rule
 * evaluation; each target invocation is a child span.
 *
 * Real-world instrumentation path:
 *   Producer / consumer service + EDOT OTel SDK
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

// ─── Rule configurations ──────────────────────────────────────────────────────
const RULE_CONFIGS = [
  {
    ruleName: "order.created",
    eventBusName: "custom-events",
    eventSource: "com.myapp.orders",
    detailType: "Order Created",
    language: "nodejs",
    framework: "Express",
    runtimeName: "node",
    runtimeVersion: "20.15.1",
    targets: [{ name: "order-fulfillment-lambda", targetType: "lambda" }],
  },
  {
    ruleName: "user.registered",
    eventBusName: "custom-events",
    eventSource: "com.myapp.auth",
    detailType: "User Registered",
    language: "nodejs",
    framework: "Fastify",
    runtimeName: "node",
    runtimeVersion: "20.15.1",
    targets: [
      { name: "welcome-email-lambda", targetType: "lambda" },
      { name: "user-onboarding-queue", targetType: "sqs" },
    ],
  },
  {
    ruleName: "security.finding",
    eventBusName: "default",
    eventSource: "aws.securityhub",
    detailType: "Security Hub Findings - Imported",
    language: "python",
    framework: "FastAPI",
    runtimeName: "CPython",
    runtimeVersion: "3.12.3",
    targets: [
      { name: "security-alert-lambda", targetType: "lambda" },
      { name: "security-alerts-topic", targetType: "sns" },
    ],
  },
  {
    ruleName: "scheduled.report",
    eventBusName: "default",
    eventSource: "aws.events",
    detailType: "Scheduled Event",
    language: "python",
    framework: "Flask",
    runtimeName: "CPython",
    runtimeVersion: "3.11.9",
    targets: [{ name: "daily-report-lambda", targetType: "lambda" }],
  },
  {
    ruleName: "deployment.complete",
    eventBusName: "custom-events",
    eventSource: "com.myapp.cicd",
    detailType: "Deployment Complete",
    language: "java",
    framework: "Spring Boot",
    runtimeName: "OpenJDK",
    runtimeVersion: "21.0.3",
    targets: [
      { name: "deployment-notify-topic", targetType: "sns" },
      { name: "deployment-audit-queue", targetType: "sqs" },
    ],
  },
];

// Target span duration ranges
const TARGET_PROPS = {
  lambda: { durationMs: [5, 300] },
  sqs: { durationMs: [2, 50] },
  sns: { durationMs: [2, 40] },
};

function buildTargetSpan(traceId, txId, parentId, ts, target, isErr, spanOffsetMs) {
  const id = newSpanId();
  const props = TARGET_PROPS[target.targetType] || TARGET_PROPS.lambda;
  const durationUs = randInt(props.durationMs[0], props.durationMs[1]) * 1000;

  const isMessaging = target.targetType === "sqs" || target.targetType === "sns";

  return {
    "@timestamp": offsetTs(new Date(ts), spanOffsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: parentId },
    span: {
      id: id,
      type: isMessaging ? "messaging" : "external",
      subtype: target.targetType,
      name: `EventBridge.${target.targetType.toUpperCase()} ${target.name}`,
      duration: { us: durationUs },
      action: "invoke",
      destination: {
        service: {
          resource: target.targetType,
          type: isMessaging ? "messaging" : "external",
          name: target.targetType,
        },
      },
    },
    labels: {
      target_name: target.name,
      target_type: target.targetType,
    },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };
}

/**
 * Generates an EventBridge OTel trace: 1 transaction (rule evaluation) + target invocation spans.
 * @param {string} ts  - ISO timestamp string (base time for the event)
 * @param {number} er  - error rate 0.0–1.0
 * @returns {Object[]} array of APM documents (transaction first, then spans)
 */
export function generateEventBridgeTrace(ts, er) {
  const cfg = rand(RULE_CONFIGS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "production", "staging", "dev"]);
  const isErr = Math.random() < er;

  const matchedRuleCount = randInt(1, 3);
  const totalUs = randInt(10, 500) * 1000;

  const svcBlock = serviceBlock(
    cfg.ruleName,
    env,
    cfg.language,
    cfg.framework,
    cfg.runtimeName,
    cfg.runtimeVersion
  );

  const { agent, telemetry } = otelBlocks(cfg.language, "elastic");

  // ── Root transaction (rule evaluation) ──────────────────────────────────────
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `${cfg.ruleName} process`,
      type: "messaging",
      duration: { us: totalUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: cfg.targets.length, dropped: 0 },
    },
    labels: {
      rule_name: cfg.ruleName,
      event_bus_name: cfg.eventBusName,
      event_source: cfg.eventSource,
      detail_type: cfg.detailType,
      matched_rule_count: String(matchedRuleCount),
    },
    service: svcBlock,
    agent: agent,
    telemetry: telemetry,
    cloud: {
      provider: "aws",
      region: region,
      account: { id: account.id, name: account.name },
      service: { name: "events" },
    },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  // ── Child spans (target invocations) ────────────────────────────────────────
  const spans: any[] = [];
  let spanOffsetMs = randInt(1, 5);

  for (let i = 0; i < cfg.targets.length; i++) {
    const target = cfg.targets[i];
    const spanIsErr = isErr && i === cfg.targets.length - 1;
    const props = TARGET_PROPS[target.targetType] || TARGET_PROPS.lambda;
    const durationUs = randInt(props.durationMs[0], props.durationMs[1]) * 1000;

    spans.push(buildTargetSpan(traceId, txId, txId, ts, target, spanIsErr, spanOffsetMs));

    spanOffsetMs += durationUs / 1000 + randInt(1, 5);
  }

  return [txDoc, ...spans];
}
