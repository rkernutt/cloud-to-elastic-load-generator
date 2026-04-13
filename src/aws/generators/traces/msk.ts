/**
 * Amazon MSK (Managed Streaming for Apache Kafka) OTel trace generator.
 *
 * Simulates Kafka consumer application traces: poll batches from topic
 * partitions, then process records downstream to DynamoDB, PostgreSQL, or
 * external HTTP endpoints.
 *
 * Real-world instrumentation path:
 *   Consumer service (Python/Java/Node) + EDOT OTel SDK + kafka-python / confluent-kafka
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
    serviceName: "order-consumer",
    topic: "orders.created",
    consumerGroup: "order-processor-cg",
    language: "java",
    framework: "Spring Boot",
    runtimeName: "OpenJDK",
    runtimeVersion: "21.0.3",
    downstream: "dynamodb" as const,
    description: "Consumes order events and persists them to DynamoDB order store",
  },
  {
    serviceName: "analytics-consumer",
    topic: "user-events.raw",
    consumerGroup: "analytics-pipeline-cg",
    language: "python",
    framework: "FastAPI",
    runtimeName: "CPython",
    runtimeVersion: "3.12.3",
    downstream: "postgresql" as const,
    description: "Reads raw user events and inserts aggregated stats into PostgreSQL",
  },
  {
    serviceName: "audit-consumer",
    topic: "audit.trail",
    consumerGroup: "audit-archiver-cg",
    language: "nodejs",
    framework: "Express",
    runtimeName: "node",
    runtimeVersion: "20.15.1",
    downstream: "http" as const,
    description: "Forwards audit events to a compliance HTTP endpoint for archival",
  },
];

type Downstream = "dynamodb" | "postgresql" | "http";

const DOWNSTREAM_SHAPES: Record<
  Downstream,
  { type: string; subtype: string; spanName: () => string; action: () => string; dest: string; db?: () => object }
> = {
  dynamodb: {
    type: "db",
    subtype: "dynamodb",
    spanName: () => `DynamoDB.${rand(["PutItem", "BatchWriteItem", "UpdateItem"])}`,
    action: () => rand(["PutItem", "BatchWriteItem", "UpdateItem"]),
    dest: "dynamodb",
    db: () => ({
      type: "nosql",
      statement: `${rand(["PutItem", "BatchWriteItem"])} ${rand(["orders", "events", "sessions"])}`,
    }),
  },
  postgresql: {
    type: "db",
    subtype: "postgresql",
    spanName: () => `PostgreSQL ${rand(["INSERT", "UPSERT"])}`,
    action: () => rand(["query", "execute"]),
    dest: "postgresql",
    db: () => ({
      type: "sql",
      statement: rand([
        "INSERT INTO user_events (id, event_type, user_id, created_at) VALUES ($1, $2, $3, $4)",
        "INSERT INTO analytics_facts (session_id, event_name, properties, ts) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
      ]),
    }),
  },
  http: {
    type: "external",
    subtype: "http",
    spanName: () => `POST /audit/events`,
    action: () => "send",
    dest: "compliance-api",
  },
};

/**
 * Generates an MSK Kafka consumer OTel trace: 1 transaction + 2 child spans.
 * @param {string} ts  - ISO timestamp string (base time for the poll batch)
 * @param {number} er  - error rate 0.0–1.0
 * @returns {Object[]} array of APM documents (transaction first, then spans)
 */
export function generateMskTrace(ts: string, er: number) {
  const cfg = rand(CONSUMER_CONFIGS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "production", "staging", "dev"]);
  const isErr = Math.random() < er;

  const partitionCount = randInt(1, 12);
  const partition = randInt(0, partitionCount - 1);
  const offsetStart = randInt(0, 9_000_000);
  const offsetEnd = offsetStart + randInt(1, 500);
  const lag = isErr ? randInt(500, 50000) : randInt(0, 1000);
  const dlqCount = isErr ? randInt(1, offsetEnd - offsetStart) : 0;

  // Kafka cluster ARN
  const clusterArn = `arn:aws:kafka:${region}:${account.id}:cluster/msk-cluster-01/${randInt(10000, 99999)}`;

  const sharedLabels = {
    cluster_arn: clusterArn,
    topic: cfg.topic,
    consumer_group: cfg.consumerGroup,
    partition: String(partition),
    offset_start: String(offsetStart),
    offset_end: String(offsetEnd),
    lag: String(lag),
    ...(isErr ? { dlq_count: String(dlqCount) } : {}),
  };

  // Duration: poll (20–300ms) + downstream processing (50ms – 3s)
  const pollUs = randInt(20, 300) * 1000;
  const processUs = isErr ? randInt(50, 500) * 1000 : randInt(50, 3000) * 1000;
  const totalUs = pollUs + processUs + randInt(5, 30) * 1000;

  const svcBlock = serviceBlock(
    cfg.serviceName,
    env,
    cfg.language,
    cfg.framework,
    cfg.runtimeName,
    cfg.runtimeVersion
  );

  const { agent, telemetry } = otelBlocks(cfg.language, "elastic");

  // ── Root transaction (the Kafka poll batch) ──────────────────────────────────
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `${cfg.topic} poll`,
      type: "messaging",
      duration: { us: totalUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: 2, dropped: 0 },
    },
    labels: { ...sharedLabels },
    service: svcBlock,
    agent: agent,
    telemetry: telemetry,
    cloud: {
      provider: "aws",
      region: region,
      account: { id: account.id, name: account.name },
      service: { name: "kafka" },
    },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  // ── Span 1: Kafka.poll ───────────────────────────────────────────────────────
  const pollSpanId = newSpanId();
  const pollSpan = {
    "@timestamp": offsetTs(new Date(ts), randInt(1, 5)),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: pollSpanId,
      type: "messaging",
      subtype: "kafka",
      name: `${cfg.topic} poll`,
      duration: { us: pollUs },
      action: "poll",
      destination: { service: { resource: "kafka", type: "messaging", name: "kafka" } },
    },
    labels: { ...sharedLabels },
    event: { outcome: "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  // ── Span 2: downstream processing ───────────────────────────────────────────
  const shape = DOWNSTREAM_SHAPES[cfg.downstream];
  const spanName = shape.spanName();
  const spanAction = shape.action();
  const dbBlock = shape.db ? shape.db() : undefined;

  const processSpan = {
    "@timestamp": offsetTs(new Date(ts), pollUs / 1000 + randInt(1, 10)),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: pollSpanId },
    span: {
      id: newSpanId(),
      type: shape.type,
      subtype: shape.subtype,
      name: spanName,
      duration: { us: processUs },
      action: spanAction,
      ...(dbBlock ? { db: dbBlock } : {}),
      destination: {
        service: { resource: shape.dest, type: shape.type, name: shape.dest },
      },
    },
    labels: { ...sharedLabels },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  return [txDoc, pollSpan, processSpan];
}
