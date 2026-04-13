/**
 * Amazon SNS standalone publisher OTel trace generator.
 *
 * Simulates direct SNS publisher traces: services that publish messages to
 * SNS topics (standard or FIFO). Covers pre-publish database lookups and the
 * SNS.Publish / SNS.PublishBatch calls.
 *
 * This is distinct from the workflow-sns-fanout generator which traces the
 * full fan-out pipeline including subscriber Lambdas.
 *
 * Real-world instrumentation path:
 *   Publisher service (Python/Java/Node) + EDOT OTel SDK
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

// ─── Publisher configurations ─────────────────────────────────────────────────
const PUBLISHER_CONFIGS = [
  {
    serviceName: "notification-service",
    topicName: "user-notifications",
    topicType: "standard" as const,
    language: "python",
    framework: "Flask",
    runtimeName: "CPython",
    runtimeVersion: "3.12.3",
    hasPreLookup: true,
    operation: "PublishBatch" as const,
    description: "Publishes batched user notifications to a standard SNS topic",
  },
  {
    serviceName: "alert-dispatcher",
    topicName: "critical-alerts.fifo",
    topicType: "fifo" as const,
    language: "java",
    framework: "Spring Boot",
    runtimeName: "OpenJDK",
    runtimeVersion: "21.0.3",
    hasPreLookup: false,
    operation: "Publish" as const,
    description: "Dispatches ordered critical alerts to a FIFO SNS topic",
  },
  {
    serviceName: "event-publisher",
    topicName: "domain-events",
    topicType: "standard" as const,
    language: "nodejs",
    framework: "Express",
    runtimeName: "node",
    runtimeVersion: "20.15.1",
    hasPreLookup: true,
    operation: "Publish" as const,
    description: "Publishes domain events after validating subscriber state via DynamoDB",
  },
];

/**
 * Generates an SNS publisher OTel trace: 1 transaction + 1–2 child spans.
 * @param {string} ts  - ISO timestamp string (base time for the publish call)
 * @param {number} er  - error rate 0.0–1.0
 * @returns {Object[]} array of APM documents (transaction first, then spans)
 */
export function generateSnsTrace(ts: string, er: number) {
  const cfg = rand(PUBLISHER_CONFIGS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "production", "staging", "dev"]);
  const isErr = Math.random() < er;

  const messageCount = cfg.operation === "PublishBatch" ? randInt(2, 10) : 1;
  const subject = rand(["order.created", "payment.processed", "alert.triggered", "user.signup", "threshold.exceeded"]);
  const messageGroupId = cfg.topicType === "fifo" ? `group-${rand(["a", "b", "c", "d"])}` : undefined;

  const topicArn = `arn:aws:sns:${region}:${account.id}:${cfg.topicName}`;

  const sharedLabels: Record<string, string> = {
    topic_arn: topicArn,
    message_count: String(messageCount),
    subject,
    ...(messageGroupId ? { message_group_id: messageGroupId } : {}),
  };

  // Error type: authorization error or throttling
  const errorType = isErr ? rand(["AuthorizationError", "ThrottledException", "KMSAccessDeniedException"]) : undefined;
  if (isErr && errorType) {
    sharedLabels["error_type"] = errorType;
  }

  // Duration: optional pre-lookup (10–80ms) + SNS publish (20–300ms)
  const lookupUs = cfg.hasPreLookup ? randInt(10, 80) * 1000 : 0;
  const publishUs = isErr ? randInt(20, 100) * 1000 : randInt(20, 300) * 1000;
  const totalUs = lookupUs + publishUs + randInt(2, 20) * 1000;

  const spanCount = cfg.hasPreLookup ? 2 : 1;

  const svcBlock = serviceBlock(
    cfg.serviceName,
    env,
    cfg.language,
    cfg.framework,
    cfg.runtimeName,
    cfg.runtimeVersion
  );

  const { agent, telemetry } = otelBlocks(cfg.language, "elastic");

  // ── Root transaction (the SNS publish operation) ─────────────────────────────
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `SNS Publish ${cfg.topicName}`,
      type: "messaging",
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
      service: { name: "sns" },
    },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  const spans: any[] = [];
  let spanOffsetMs = randInt(1, 5);
  let lastSpanId = txId;

  // ── Optional span 1: pre-publish DynamoDB lookup ─────────────────────────────
  if (cfg.hasPreLookup) {
    const lookupSpanId = newSpanId();
    const lookupTable = rand(["subscribers", "user-preferences", "notification-settings"]);
    spans.push({
      "@timestamp": offsetTs(new Date(ts), spanOffsetMs),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: lookupSpanId,
        type: "db",
        subtype: "dynamodb",
        name: `DynamoDB.Query`,
        duration: { us: lookupUs },
        action: "Query",
        db: {
          type: "nosql",
          statement: `Query ${lookupTable}`,
        },
        destination: { service: { resource: "dynamodb", type: "db", name: "dynamodb" } },
      },
      labels: { ...sharedLabels },
      event: { outcome: "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    });
    spanOffsetMs += lookupUs / 1000 + randInt(1, 10);
    lastSpanId = lookupSpanId;
  }

  // ── Span: SNS.Publish / SNS.PublishBatch ─────────────────────────────────────
  spans.push({
    "@timestamp": offsetTs(new Date(ts), spanOffsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: lastSpanId },
    span: {
      id: newSpanId(),
      type: "messaging",
      subtype: "sns",
      name: `SNS.${cfg.operation}`,
      duration: { us: publishUs },
      action: "send",
      destination: { service: { resource: "sns", type: "messaging", name: "sns" } },
    },
    labels: { ...sharedLabels },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  });

  return [txDoc, ...spans];
}
