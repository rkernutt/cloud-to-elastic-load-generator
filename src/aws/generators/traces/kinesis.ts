/**
 * Kinesis stream consumer OTel trace generator.
 *
 * Simulates Kinesis stream consumer applications processing record batches per
 * shard. OTel SDK auto-instrumentation creates a consumer transaction per shard
 * batch. Iterator age reflects consumer lag; high values indicate processing
 * falling behind the stream.
 *
 * Real-world instrumentation path:
 *   Consumer service (Python/Java/Node) + EDOT OTel SDK
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
    serviceName: "clickstream-processor",
    streamName: "clickstream-events",
    language: "python",
    sdkCalls: ["dynamodb", "s3"],
    description: "Aggregates web analytics events and checkpoints progress to S3",
  },
  {
    serviceName: "iot-sensor-processor",
    streamName: "iot-telemetry-stream",
    language: "java",
    sdkCalls: ["dynamodb", "sns"],
    description: "Processes IoT telemetry, writes readings and alerts on anomaly detection",
  },
  {
    serviceName: "log-aggregator",
    streamName: "structured-logs-stream",
    language: "java",
    sdkCalls: ["opensearch", "s3"],
    description: "Bulk-indexes structured logs into OpenSearch and archives raw records to S3",
  },
  {
    serviceName: "financial-events-processor",
    streamName: "financial-transactions-stream",
    language: "java",
    sdkCalls: ["rds", "firehose"],
    description: "Inserts transaction events into RDS and puts records to Firehose for audit",
  },
  {
    serviceName: "metrics-rollup",
    streamName: "metrics-stream",
    language: "python",
    sdkCalls: ["dynamodb", "cloudwatch"],
    description:
      "Rolls up time-series metrics into DynamoDB and publishes aggregates to CloudWatch",
  },
  {
    serviceName: "user-activity-processor",
    streamName: "user-activity-stream",
    language: "nodejs",
    sdkCalls: ["dynamodb", "s3", "sns"],
    description: "Processes user activity events, updates session state and archives to S3",
  },
];

// ─── Per-SDK-call span shape ──────────────────────────────────────────────────
function buildSpan(traceId, txId, parentId, ts, sdkKey, isErr, spanOffset, spanDuration, labels) {
  const id = newSpanId();

  const shapes = {
    dynamodb: {
      type: "db",
      subtype: "dynamodb",
      name: () => `DynamoDB.${rand(["BatchWriteItem", "PutItem", "UpdateItem", "Query"])}`,
      action: () => rand(["BatchWriteItem", "PutItem", "UpdateItem", "Query"]),
      db: () => ({
        type: "nosql",
        statement: `${rand(["BatchWriteItem", "PutItem", "UpdateItem"])} ${rand(["metrics", "sessions", "iot_readings", "aggregations", "checkpoints"])}`,
      }),
      dest: "dynamodb",
    },
    s3: {
      type: "storage",
      subtype: "s3",
      name: () => `S3.${rand(["PutObject", "GetObject"])}`,
      action: () => rand(["PutObject", "GetObject"]),
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
    opensearch: {
      type: "db",
      subtype: "elasticsearch",
      name: () => `Elasticsearch.${rand(["Bulk", "Index"])}`,
      action: () => rand(["bulk", "index"]),
      db: () => ({
        type: "elasticsearch",
        statement: rand(["POST _bulk", "POST logs-*/_bulk", "POST structured-logs/_bulk"]),
      }),
      dest: "elasticsearch",
    },
    rds: {
      type: "db",
      subtype: "postgresql",
      name: () => `PostgreSQL ${rand(["INSERT", "UPDATE", "SELECT"])}`,
      action: () => rand(["query", "execute"]),
      db: () => ({
        type: "sql",
        statement: rand([
          "INSERT INTO transactions (id, type, amount, currency, created_at) VALUES ($1, $2, $3, $4, $5)",
          "INSERT INTO financial_events (stream_seq, payload) VALUES ($1, $2)",
          "SELECT id FROM accounts WHERE external_id = $1",
        ]),
      }),
      dest: "postgresql",
    },
    firehose: {
      type: "messaging",
      subtype: "firehose",
      name: () => `Firehose.PutRecordBatch`,
      action: () => "send",
      db: null,
      dest: "firehose",
    },
    cloudwatch: {
      type: "external",
      subtype: "aws",
      name: () => `CloudWatch.PutMetricData`,
      action: () => "PutMetricData",
      db: null,
      dest: "cloudwatch",
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
    service: { name: "kinesis" },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };
}

/**
 * Generates a Kinesis consumer OTel trace: 1 transaction + 2–3 downstream spans.
 * @param {string} ts  - ISO timestamp string (base time for the shard batch processing)
 * @param {number} er  - error rate 0.0–1.0
 * @returns {Object[]} array of APM documents (transaction first, then spans)
 */
export function generateKinesisTrace(ts, er) {
  const cfg = rand(CONSUMER_CONFIGS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const lang = cfg.language;
  const env = rand(["production", "production", "staging", "dev"]);
  const isErr = Math.random() < er;

  // Batch processing duration: 100ms – 10s (batch-oriented consumers are slower)
  const totalUs = randInt(100, 10000) * 1000;

  const shardIndex = randInt(0, 9);
  const shardId = `shardId-${String(shardIndex).padStart(12, "0")}`;
  const streamArn = `arn:aws:kinesis:${region}:${account.id}:stream/${cfg.streamName}`;
  const seqStart = randInt(49000, 49999);
  const seqEnd = randInt(49000, 49999);
  const recordCount = randInt(10, 500);
  const iteratorAge = randInt(0, 30000);

  // Shared labels applied to every doc in this trace
  const sharedLabels = {
    stream_name: cfg.streamName,
    stream_arn: streamArn,
    shard_id: shardId,
    sequence_number_range: `${seqStart}...${seqEnd}`,
    record_count: String(recordCount),
    iterator_age_ms: String(iteratorAge),
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

  const svcBlock = serviceBlock(
    cfg.serviceName,
    env,
    lang,
    "AWS Kinesis",
    runtimeName,
    runtimeVersion
  );

  const { agent, telemetry } = otelBlocks(lang, "elastic");

  // ── Root transaction (the Kinesis shard batch processing) ────────────────────
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `${cfg.streamName} process`,
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
      service: { name: "kinesis" },
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
    spanOffset += spanUs / 1000 + randInt(1, 20);
  }

  return [txDoc, ...spans];
}
