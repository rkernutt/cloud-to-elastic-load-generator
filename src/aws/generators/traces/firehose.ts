/**
 * Amazon Kinesis Firehose OTel trace generator.
 *
 * Simulates producer application traces for services writing to Firehose
 * delivery streams. Covers PutRecordBatch buffering and delivery to
 * destinations: S3, Redshift, and OpenSearch.
 *
 * Real-world instrumentation path:
 *   Producer service (Python/Java/Node) + EDOT OTel SDK
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

// ─── Producer configurations ──────────────────────────────────────────────────
const PRODUCER_CONFIGS = [
  {
    serviceName: "iot-collector",
    streamName: "iot-telemetry-delivery",
    language: "python",
    destination: "s3" as const,
    framework: "FastAPI",
    runtimeName: "CPython",
    runtimeVersion: "3.12.3",
    description: "Buffers IoT sensor readings and delivers batches to S3 data lake",
  },
  {
    serviceName: "web-analytics-producer",
    streamName: "web-clickstream-delivery",
    language: "nodejs",
    destination: "redshift" as const,
    framework: "Express",
    runtimeName: "node",
    runtimeVersion: "20.15.1",
    description: "Delivers web analytics events to Redshift for BI query access",
  },
  {
    serviceName: "clickstream-ingestor",
    streamName: "app-events-delivery",
    language: "java",
    destination: "opensearch" as const,
    framework: "Spring Boot",
    runtimeName: "OpenJDK",
    runtimeVersion: "21.0.3",
    description: "Streams application events to OpenSearch for real-time search and analytics",
  },
];

type Destination = "s3" | "redshift" | "opensearch";

const DESTINATION_SHAPES: Record<
  Destination,
  {
    type: string;
    subtype: string;
    spanName: string;
    action: string;
    dest: string;
    db?: () => object;
  }
> = {
  s3: {
    type: "storage",
    subtype: "s3",
    spanName: "S3.PutObject",
    action: "PutObject",
    dest: "s3",
  },
  redshift: {
    type: "db",
    subtype: "redshift",
    spanName: "Redshift COPY",
    action: "COPY",
    dest: "redshift",
    db: () => ({
      type: "sql",
      statement: rand([
        "COPY events FROM 's3://delivery-bucket/prefix/' IAM_ROLE 'arn:aws:iam::...' FORMAT AS JSON",
        "COPY clickstream FROM 's3://delivery-bucket/clickstream/' IAM_ROLE 'arn:aws:iam::...' FORMAT AS PARQUET",
      ]),
    }),
  },
  opensearch: {
    type: "db",
    subtype: "elasticsearch",
    spanName: "Elasticsearch.Bulk",
    action: "bulk",
    dest: "elasticsearch",
    db: () => ({
      type: "elasticsearch",
      statement: rand(["POST app-events-*/_bulk", "POST iot-telemetry-*/_bulk"]),
    }),
  },
};

/**
 * Generates a Firehose producer OTel trace: 1 transaction + 2 child spans.
 * @param {string} ts  - ISO timestamp string (base time for the delivery batch)
 * @param {number} er  - error rate 0.0–1.0
 * @returns {Object[]} array of APM documents (transaction first, then spans)
 */
export function generateFirehoseTrace(ts: string, er: number) {
  const cfg = rand(PRODUCER_CONFIGS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "production", "staging", "dev"]);
  const isErr = Math.random() < er;

  const recordCount = randInt(100, 5000);
  const bytesPerRecord = randInt(200, 2000);
  const bytesSent = recordCount * bytesPerRecord;
  const dataFreshnessMs = randInt(15000, 900000); // 15s – 15min buffer window
  const dlqCount = isErr ? randInt(1, recordCount) : 0;

  const streamArn = `arn:aws:firehose:${region}:${account.id}:deliverystream/${cfg.streamName}`;

  // Shared labels applied to every doc in this trace
  const sharedLabels = {
    stream_arn: streamArn,
    delivery_stream_name: cfg.streamName,
    destination: cfg.destination,
    records_count: String(recordCount),
    data_freshness_ms: String(dataFreshnessMs),
    bytes_sent: String(bytesSent),
    ...(isErr ? { dlq_count: String(dlqCount) } : {}),
  };

  // Duration: PutRecordBatch (50–500ms) + delivery (200ms – 5s)
  const putRecordUs = randInt(50, 500) * 1000;
  const deliveryUs = isErr ? randInt(100, 500) * 1000 : randInt(200, 5000) * 1000;
  const totalUs = putRecordUs + deliveryUs + randInt(5, 50) * 1000;

  const svcBlock = serviceBlock(
    cfg.serviceName,
    env,
    cfg.language,
    cfg.framework,
    cfg.runtimeName,
    cfg.runtimeVersion
  );

  const { agent, telemetry } = otelBlocks(cfg.language, "elastic");

  // ── Root transaction (the Firehose delivery batch) ───────────────────────────
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `${cfg.streamName} deliver`,
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
      service: { name: "firehose" },
    },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  // ── Span 1: Firehose.PutRecordBatch ─────────────────────────────────────────
  const putSpanId = newSpanId();
  const putSpan = {
    "@timestamp": offsetTs(new Date(ts), randInt(1, 5)),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: putSpanId,
      type: "messaging",
      subtype: "firehose",
      name: "Firehose.PutRecordBatch",
      duration: { us: putRecordUs },
      action: "send",
      destination: { service: { resource: "firehose", type: "messaging", name: "firehose" } },
    },
    labels: { ...sharedLabels },
    event: { outcome: "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  // ── Span 2: delivery to destination ─────────────────────────────────────────
  const destShape = DESTINATION_SHAPES[cfg.destination];
  const deliverySpanId = newSpanId();
  const deliverySpan = {
    "@timestamp": offsetTs(new Date(ts), putRecordUs / 1000 + randInt(1, 10)),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: putSpanId },
    span: {
      id: deliverySpanId,
      type: destShape.type,
      subtype: destShape.subtype,
      name: destShape.spanName,
      duration: { us: deliveryUs },
      action: destShape.action,
      ...(destShape.db ? { db: destShape.db() } : {}),
      destination: {
        service: {
          resource: destShape.dest,
          type: destShape.type,
          name: destShape.dest,
        },
      },
    },
    labels: { ...sharedLabels },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  return [txDoc, putSpan, deliverySpan];
}
