/**
 * SQS consumer OTel trace generator.
 *
 * Simulates SQS consumer applications (Lambda or ECS service) processing
 * message batches. OTel SDK auto-instrumentation creates a consumer transaction
 * per message batch, with trace context propagated from the producer via W3C
 * traceparent in SQS message attributes (AWSTraceHeader).
 *
 * Real-world instrumentation path:
 *   Consumer service (Python/Node/Java) + EDOT OTel SDK
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

// ─── Consumer configurations ──────────────────────────────────────────────────
const CONSUMER_CONFIGS = [
  {
    serviceName: "order-queue-consumer",
    queueName: "order-queue.fifo",
    language: "python",
    sdkCalls: ["dynamodb", "sns"],
    description: "Processes order events from the order FIFO queue",
  },
  {
    serviceName: "notification-queue-consumer",
    queueName: "notification-queue",
    language: "nodejs",
    sdkCalls: ["ses", "dynamodb"],
    description: "Sends email/SMS notifications triggered by queue messages",
  },
  {
    serviceName: "dead-letter-processor",
    queueName: "order-queue-dlq.fifo",
    language: "python",
    sdkCalls: ["dynamodb", "sns"],
    description: "Processes dead-letter queue messages for forensic handling",
  },
  {
    serviceName: "payment-events-consumer",
    queueName: "payment-events-queue",
    language: "java",
    sdkCalls: ["rds", "eventbridge"],
    description: "Processes payment result events, updates records and emits downstream events",
  },
  {
    serviceName: "inventory-updates-consumer",
    queueName: "inventory-updates-queue",
    language: "nodejs",
    sdkCalls: ["dynamodb", "s3"],
    description: "Updates stock levels and writes S3 inventory reports",
  },
  {
    serviceName: "audit-log-consumer",
    queueName: "audit-log-queue",
    language: "java",
    sdkCalls: ["opensearch", "s3"],
    description: "Writes audit events to OpenSearch and archives to S3",
  },
  {
    serviceName: "user-events-consumer",
    queueName: "user-events-queue",
    language: "python",
    sdkCalls: ["dynamodb", "sns", "s3"],
    description: "Processes user lifecycle events, updates profile store and notifies downstream",
  },
  {
    serviceName: "analytics-ingest-consumer",
    queueName: "analytics-ingest-queue",
    language: "nodejs",
    sdkCalls: ["opensearch", "dynamodb"],
    description: "Ingests analytics events into OpenSearch and tracks state in DynamoDB",
  },
];

// ─── Per-SDK-call span shape ──────────────────────────────────────────────────
function buildSpan(traceId, txId, parentId, ts, sdkKey, isErr, spanOffset, spanDuration, labels) {
  const id = newSpanId();

  const shapes = {
    dynamodb: {
      type: "db",
      subtype: "dynamodb",
      name: () =>
        `DynamoDB.${rand(["GetItem", "PutItem", "Query", "UpdateItem", "BatchWriteItem", "Scan"])}`,
      action: () => rand(["GetItem", "PutItem", "Query", "UpdateItem", "BatchWriteItem", "Scan"]),
      db: () => ({
        type: "nosql",
        statement: `${rand(["PutItem", "UpdateItem", "BatchWriteItem"])} ${rand(["orders", "users", "inventory", "audit_events", "payments"])}`,
      }),
      dest: "dynamodb",
    },
    s3: {
      type: "storage",
      subtype: "s3",
      name: () => `S3.${rand(["PutObject", "GetObject", "CopyObject"])}`,
      action: () => rand(["PutObject", "GetObject", "CopyObject"]),
      db: null,
      dest: "s3",
    },
    sns: {
      type: "messaging",
      subtype: "sns",
      name: () => `SNS.${rand(["Publish", "PublishBatch"])}`,
      action: () => "send",
      db: null,
      dest: "sns",
    },
    ses: {
      type: "messaging",
      subtype: "ses",
      name: () => `SES.${rand(["SendEmail", "SendRawEmail"])}`,
      action: () => "send",
      db: null,
      dest: "ses",
    },
    rds: {
      type: "db",
      subtype: "postgresql",
      name: () => `PostgreSQL ${rand(["UPDATE", "INSERT", "SELECT"])}`,
      action: () => rand(["query", "execute"]),
      db: () => ({
        type: "sql",
        statement: rand([
          "UPDATE payments SET status = $1, updated_at = $2 WHERE id = $3",
          "INSERT INTO payment_events (id, type, amount, currency) VALUES ($1, $2, $3, $4)",
          "SELECT id, status FROM orders WHERE payment_id = $1",
        ]),
      }),
      dest: "postgresql",
    },
    eventbridge: {
      type: "messaging",
      subtype: "eventbridge",
      name: () => `EventBridge.PutEvents`,
      action: () => "send",
      db: null,
      dest: "eventbridge",
    },
    opensearch: {
      type: "db",
      subtype: "elasticsearch",
      name: () => `Elasticsearch.${rand(["Index", "Bulk", "Search"])}`,
      action: () => rand(["index", "bulk", "search"]),
      db: () => ({
        type: "elasticsearch",
        statement: rand([`POST audit-events/_doc`, `POST _bulk`, `GET analytics-*/_search`]),
      }),
      dest: "elasticsearch",
    },
  };

  const shape = shapes[sdkKey] || shapes.dynamodb;
  const spanName = shape.name();
  const spanAction = shape.action();
  const dbBlock = shape.db ? shape.db() : undefined;

  return {
    "@timestamp": offsetTs(new Date(ts), spanOffset),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: parentId },
    span: {
      id: id,
      type: shape.type,
      subtype: shape.subtype,
      name: spanName,
      duration: { us: spanDuration },
      action: spanAction,
      ...(dbBlock ? { db: dbBlock } : {}),
      destination: { service: { resource: shape.dest, type: shape.type, name: shape.dest } },
    },
    labels: { ...labels },
    service: { name: "sqs" },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };
}

/**
 * Generates an SQS consumer OTel trace: 1 transaction + 2–3 downstream spans.
 * @param {string} ts  - ISO timestamp string (base time for the batch processing)
 * @param {number} er  - error rate 0.0–1.0
 * @returns {Object[]} array of APM documents (transaction first, then spans)
 */
export function generateSqsTrace(ts, er) {
  const cfg = rand(CONSUMER_CONFIGS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const lang = cfg.language;
  const env = rand(["production", "production", "staging", "dev"]);
  const isErr = Math.random() < er;

  // Batch processing duration: 50ms – 5000ms
  const totalUs = randInt(50, 5000) * 1000;

  const messageCount = randInt(1, 10);
  const queueUrl = `https://sqs.${region}.amazonaws.com/${account.id}/${cfg.queueName}`;
  const parentTraceId = newTraceId(); // upstream producer's trace ID (W3C traceparent propagation)

  // Shared labels applied to every doc in this trace
  const sharedLabels = {
    queue_name: cfg.queueName,
    queue_url: queueUrl,
    message_count: String(messageCount),
    approximate_first_receive_delay_seconds: String(randInt(0, 120)),
    parent_trace_id: parentTraceId,
  };

  const runtimeName =
    lang === "python"
      ? `python3.${rand([11, 12])}`
      : lang === "nodejs"
        ? `nodejs${rand([18, 20])}.x`
        : "java21";
  const runtimeVersion =
    lang === "python"
      ? `3.${rand([11, 12])}.${randInt(0, 9)}`
      : lang === "nodejs"
        ? `${rand([18, 20])}.${randInt(0, 20)}.${randInt(0, 5)}`
        : "21.0.3";

  const svcBlock = serviceBlock(cfg.serviceName, env, lang, "AWS SQS", runtimeName, runtimeVersion);

  const { agent, telemetry } = otelBlocks(lang, "elastic");

  // ── Root transaction (the SQS message batch processing) ─────────────────────
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `${cfg.queueName} process`,
      type: "messaging",
      duration: { us: totalUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: cfg.sdkCalls.length, dropped: 0 },
    },
    labels: { ...sharedLabels },
    service: svcBlock,
    agent: agent,
    telemetry: telemetry,
    cloud: {
      provider: "aws",
      region: region,
      account: { id: account.id, name: account.name },
      service: { name: "sqs" },
    },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  // ── Child spans (downstream AWS SDK calls) ───────────────────────────────────
  const spans: any[] = [];
  let spanOffset = 0;
  const usPerSdk = Math.floor(totalUs / cfg.sdkCalls.length);

  for (const sdkKey of cfg.sdkCalls) {
    const spanUs = randInt(Math.floor(usPerSdk * 0.2), Math.floor(usPerSdk * 0.85));
    const spanIsErr = isErr && spans.length === cfg.sdkCalls.length - 1;
    spans.push(
      buildSpan(traceId, txId, txId, ts, sdkKey, spanIsErr, spanOffset, spanUs, sharedLabels)
    );
    spanOffset += spanUs / 1000 + randInt(1, 15);
  }

  return [txDoc, ...spans];
}
