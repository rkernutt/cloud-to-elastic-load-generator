/**
 * EKS OTel trace generator.
 *
 * Simulates EKS (Kubernetes) containerised services instrumented with the
 * EDOT DaemonSet + pod-level SDK instrumentation. Produces one APM
 * transaction document plus 2–5 downstream span documents per invocation.
 *
 * Real-world instrumentation path:
 *   Pod (Java/Python/Node.js) + EDOT OTel SDK
 *     → EDOT DaemonSet Collector (OTLP gRPC)
 *       → Elastic APM Server / OTel Collector
 *         → traces-apm-default
 */

import {
  TRACE_REGIONS,
  TRACE_ACCOUNTS,
  randHex,
  newTraceId,
  newSpanId,
  rand,
  randInt,
  offsetTs,
  serviceBlock,
  otelBlocks,
} from "./helpers.js";

// ─── Service configurations ───────────────────────────────────────────────────
const SERVICE_CONFIGS = [
  {
    name: "payment-service",
    language: "java",
    runtime: "java21",
    runtimeVersion: "21.0.3",
    framework: "Spring Boot",
    txType: "request",
    http: { method: "POST", paths: ["/payments", "/payments/refund", "/payments/capture"] },
    spans: ["postgresql", "redis", "kafka-produce"],
  },
  {
    name: "recommendation-engine",
    language: "python",
    runtime: "python3.12",
    runtimeVersion: "3.12.3",
    framework: "FastAPI",
    txType: "request",
    http: {
      method: "GET",
      paths: ["/recommend/{userId}", "/recommend/trending", "/recommend/similar/{itemId}"],
    },
    spans: ["redis", "dynamodb", "http-ml"],
  },
  {
    name: "gateway-service",
    language: "nodejs",
    runtime: "nodejs20.x",
    runtimeVersion: "20.15.1",
    framework: "Express",
    txType: "request",
    http: { method: "GET", paths: ["/api/v1/users/{id}", "/api/v1/orders", "/api/v1/products"] },
    spans: ["http-downstream", "http-downstream", "http-downstream", "http-downstream"],
  },
  {
    name: "search-service",
    language: "java",
    runtime: "java21",
    runtimeVersion: "21.0.3",
    framework: null,
    txType: "request",
    http: { method: "GET", paths: ["/search", "/search/suggestions", "/search/filters"] },
    spans: ["elasticsearch", "redis"],
  },
  {
    name: "user-profile-service",
    language: "python",
    runtime: "python3.12",
    runtimeVersion: "3.12.3",
    framework: "FastAPI",
    txType: "request",
    http: {
      method: "GET",
      paths: ["/users/{id}", "/users/{id}/preferences", "/users/{id}/activity"],
    },
    spans: ["postgresql", "redis"],
  },
  {
    name: "event-processor",
    language: "java",
    runtime: "java21",
    runtimeVersion: "21.0.3",
    framework: "Spring Boot",
    txType: "messaging",
    kafka: {
      topics: ["order-events", "payment-events", "inventory-events", "user-events"],
    },
    spans: ["dynamodb", "sns"],
  },
];

// ─── Downstream span shapes ───────────────────────────────────────────────────
function buildDownstreamSpan(
  traceId: string,
  txId: string,
  ts: string,
  spanKey: string,
  isErr: boolean,
  offsetMs: number
) {
  const spanId = newSpanId();

  const shapes = {
    postgresql: {
      type: "db",
      subtype: "postgresql",
      name: () => `PostgreSQL ${rand(["SELECT", "INSERT", "UPDATE", "DELETE"])}`,
      db: () => ({
        type: "sql",
        statement: rand([
          "SELECT * FROM users WHERE id = $1",
          "INSERT INTO orders (id, user_id, total) VALUES ($1, $2, $3)",
          "UPDATE payments SET status = $1 WHERE id = $2",
          "DELETE FROM sessions WHERE expires_at < $1",
          "SELECT p.*, i.quantity FROM products p JOIN inventory i ON p.id = i.product_id",
        ]),
      }),
      dest: "postgresql",
    },
    redis: {
      type: "db",
      subtype: "redis",
      name: () =>
        `Redis ${rand(["GET", "SET", "HGET", "HSET", "ZADD", "ZRANGE", "DEL", "EXPIRE"])}`,
      db: () => ({
        type: "redis",
        statement: rand([
          "GET session:{userId}",
          "SET cache:{key} {value}",
          "HGETALL user:{id}",
          "ZADD leaderboard 100 user:42",
          "EXPIRE token:{id} 3600",
        ]),
      }),
      dest: "redis",
    },
    dynamodb: {
      type: "db",
      subtype: "dynamodb",
      name: () =>
        `DynamoDB.${rand(["GetItem", "PutItem", "Query", "UpdateItem", "BatchWriteItem"])}`,
      db: () => ({
        type: "nosql",
        statement: `${rand(["GetItem", "Query", "Scan"])} ${rand(["events", "recommendations", "profiles", "sessions"])}`,
      }),
      dest: "dynamodb",
    },
    elasticsearch: {
      type: "db",
      subtype: "elasticsearch",
      name: () => `Elasticsearch ${rand(["search", "index", "get", "bulk"])}`,
      db: () => ({
        type: "elasticsearch",
        statement: rand([
          '{"query":{"match":{"title":"$1"}}}',
          '{"query":{"bool":{"must":[{"term":{"status":"active"}}]}}}',
          '{"aggs":{"categories":{"terms":{"field":"category.keyword"}}}}',
        ]),
      }),
      dest: "elasticsearch",
    },
    "kafka-produce": {
      type: "messaging",
      subtype: "kafka",
      name: () =>
        `Kafka ${rand(["PRODUCE", "SEND"])} to ${rand(["order-events", "payment-events", "notification-events"])}`,
      db: null,
      dest: "kafka",
    },
    sns: {
      type: "messaging",
      subtype: "sns",
      name: () => `SNS.${rand(["Publish", "PublishBatch"])}`,
      db: null,
      dest: "sns",
    },
    "http-ml": {
      type: "external",
      subtype: "http",
      name: () =>
        `GET ${rand(["ml-service.internal", "inference.internal", "model-api.internal"])}/predict`,
      db: null,
      dest: rand(["ml-service.internal", "inference.internal"]),
    },
    "http-downstream": {
      type: "external",
      subtype: "http",
      name: () => {
        const svc = rand([
          "payment-service",
          "inventory-service",
          "user-profile-service",
          "search-service",
          "notification-service",
        ]);
        const method = rand(["GET", "POST"]);
        return `${method} ${svc}.production.svc.cluster.local`;
      },
      db: null,
      dest: rand([
        "payment-service.production.svc",
        "inventory-service.production.svc",
        "user-profile-service.production.svc",
      ]),
    },
  };

  const shape = shapes[spanKey as keyof typeof shapes] || shapes.dynamodb;
  const spanName = shape.name();
  const dbBlock = shape.db ? shape.db() : undefined;
  const spanUs = randInt(2_000, 150_000); // 2ms – 150ms in µs

  return {
    "@timestamp": offsetTs(new Date(ts), offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: spanId,
      type: shape.type,
      subtype: shape.subtype,
      name: spanName,
      duration: { us: spanUs },
      ...(dbBlock ? { db: dbBlock } : {}),
      destination: { service: { resource: shape.dest, type: shape.type, name: shape.dest } },
    },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    // duration_us is returned so the caller can advance the offset
    _spanUs: spanUs,
  };
}

/**
 * Generates an EKS OTel trace: 1 transaction + 2–N downstream spans.
 * @param {string} ts  - ISO timestamp string (base time for the request)
 * @param {number} er  - error rate 0.0–1.0
 * @returns {Object[]} array of APM documents (transaction first, then spans)
 */
export function generateEksTrace(ts: string, er: number) {
  const cfg = rand(SERVICE_CONFIGS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const isErr = Math.random() < er;
  const env = rand(["production", "production", "production", "staging"]);
  const k8sNs = env === "production" ? "production" : "staging";

  // Kubernetes labels shared across all documents in the trace.
  const podSuffix = `${randHex(5)}-${randHex(5)}`;
  const k8sLabels = {
    k8s_namespace: k8sNs,
    k8s_pod_name: `${cfg.name}-${podSuffix}`,
    k8s_deployment: cfg.name,
    k8s_node: `ip-${randInt(10, 254)}-${randInt(0, 255)}-${randInt(0, 255)}-${randInt(0, 255)}.ec2.internal`,
  };

  const totalUs = randInt(10_000, 500_000); // 10ms – 500ms in µs

  const svcBlock = serviceBlock(
    cfg.name,
    env,
    cfg.language,
    cfg.framework || "Kubernetes",
    cfg.runtime,
    cfg.runtimeVersion
  );
  // Override framework to always include Kubernetes
  svcBlock.framework = { name: "Kubernetes" };

  const { agent, telemetry } = otelBlocks(cfg.language, "elastic");

  const cloudBlock = {
    provider: "aws",
    region,
    account: { id: account.id, name: account.name },
    service: { name: "eks" },
  };

  // ── Root transaction ─────────────────────────────────────────────────────────
  let txDoc;

  if (cfg.txType === "request") {
    const http = cfg.http!;
    const method = http.method;
    const path = rand(http.paths);
    const statusCode = isErr ? rand([500, 502, 503, 504]) : rand([200, 200, 200, 201]);

    txDoc = {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: `${method} ${path}`,
        type: "request",
        duration: { us: totalUs },
        result: `HTTP ${statusCode}`,
        sampled: true,
        span_count: { started: cfg.spans.length, dropped: 0 },
      },
      http: {
        request: { method: method },
        response: { status_code: statusCode },
      },
      url: { path: path },
      labels: { ...k8sLabels },
      service: svcBlock,
      agent: agent,
      telemetry: telemetry,
      cloud: cloudBlock,
      event: { outcome: isErr ? "failure" : "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    };
  } else {
    // messaging (Kafka consumer)
    const topic = rand(cfg.kafka!.topics);
    const partition = randInt(0, 11);
    const offset = randInt(0, 999_999);

    txDoc = {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: `${topic} process`,
        type: "messaging",
        duration: { us: totalUs },
        result: isErr ? "failure" : "success",
        sampled: true,
        span_count: { started: cfg.spans.length, dropped: 0 },
      },
      labels: {
        ...k8sLabels,
        kafka_topic: topic,
        kafka_partition: String(partition),
        kafka_offset: String(offset),
      },
      service: svcBlock,
      agent: agent,
      telemetry: telemetry,
      cloud: cloudBlock,
      event: { outcome: isErr ? "failure" : "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    };
  }

  // ── Child spans (downstream calls) ───────────────────────────────────────────
  const spans: any[] = [];
  let offsetMs = 0;

  for (let i = 0; i < cfg.spans.length; i++) {
    const spanKey = cfg.spans[i];
    const spanIsErr = isErr && i === cfg.spans.length - 1;
    const spanDoc = buildDownstreamSpan(traceId, txId, ts, spanKey, spanIsErr, offsetMs) as Record<
      string,
      any
    >;

    // Pull out the internal _spanUs before emitting the doc.
    const spanUs = spanDoc._spanUs;
    delete spanDoc._spanUs;

    // Attach shared service/agent/telemetry/cloud to each span.
    spanDoc.service = svcBlock;
    spanDoc.agent = agent;
    spanDoc.telemetry = telemetry;
    spanDoc.cloud = cloudBlock;
    spanDoc.labels = { ...k8sLabels };

    spans.push(spanDoc);
    offsetMs += spanUs / 1000 + randInt(1, 15);
  }

  return [txDoc, ...spans];
}
