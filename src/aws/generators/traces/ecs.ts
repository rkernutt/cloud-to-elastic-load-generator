/**
 * ECS/Fargate OTel trace generator.
 *
 * Simulates containerised microservices running on ECS/Fargate, instrumented
 * with an EDOT language agent in the application container and an OTel
 * Collector sidecar container in the same task definition. Produces one APM
 * transaction document (the inbound HTTP request) plus 2–4 child span
 * documents (downstream AWS service calls or database queries).
 *
 * Real-world instrumentation path:
 *   ECS task (app container + EDOT OTel layer + OTel Collector sidecar)
 *     → OTLP gRPC → Elastic APM Server
 *       → traces-apm-default
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

// ─── ECS cluster names ────────────────────────────────────────────────────────
const CLUSTER_NAMES = ["prod-services-cluster", "staging-services-cluster", "prod-backend-cluster"];

// ─── Service configs ──────────────────────────────────────────────────────────
const SERVICE_CONFIGS = [
  {
    serviceName: "checkout-service",
    language: "nodejs",
    runtimeName: "nodejs20.x",
    runtimeVersion: "20.15.1",
    taskDefinition: () => `checkout-service:${randInt(30, 60)}`,
    routes: [{ method: "POST", template: "/checkout", path: () => "/checkout" }],
    spans: ["rds", "redis", "sqs"],
  },
  {
    serviceName: "product-catalogue",
    language: "python",
    runtimeName: "python3.12",
    runtimeVersion: "3.12.3",
    taskDefinition: () => `product-catalogue:${randInt(10, 40)}`,
    routes: [
      { method: "GET", template: "/products/{id}", path: () => `/products/${randHex(8)}` },
      { method: "GET", template: "/products", path: () => "/products" },
    ],
    spans: ["elasticache", "dynamodb"],
  },
  {
    serviceName: "auth-service",
    language: "java",
    runtimeName: "java21",
    runtimeVersion: "21.0.3",
    taskDefinition: () => `auth-service:${randInt(5, 25)}`,
    routes: [
      { method: "POST", template: "/auth/token", path: () => "/auth/token" },
      { method: "POST", template: "/auth/refresh", path: () => "/auth/refresh" },
    ],
    spans: ["dynamodb", "secretsmanager"],
  },
  {
    serviceName: "notification-service",
    language: "python",
    runtimeName: "python3.12",
    runtimeVersion: "3.12.3",
    taskDefinition: () => `notification-service:${randInt(8, 30)}`,
    routes: [
      { method: "POST", template: "/notify", path: () => "/notify" },
      { method: "POST", template: "/notify/batch", path: () => "/notify/batch" },
    ],
    spans: ["ses", "sns", "dynamodb"],
  },
  {
    serviceName: "order-service",
    language: "nodejs",
    runtimeName: "nodejs20.x",
    runtimeVersion: "20.15.1",
    taskDefinition: () => `order-service:${randInt(15, 50)}`,
    routes: [
      { method: "POST", template: "/orders", path: () => "/orders" },
      { method: "GET", template: "/orders/{id}", path: () => `/orders/${randHex(8)}` },
      { method: "PUT", template: "/orders/{id}", path: () => `/orders/${randHex(8)}` },
    ],
    spans: ["rds", "sqs", "sns"],
  },
  {
    serviceName: "inventory-service",
    language: "java",
    runtimeName: "java21",
    runtimeVersion: "21.0.3",
    taskDefinition: () => `inventory-service:${randInt(5, 20)}`,
    routes: [
      {
        method: "PUT",
        template: "/inventory/{sku}",
        path: () => `/inventory/${randHex(6).toUpperCase()}`,
      },
      {
        method: "GET",
        template: "/inventory/{sku}",
        path: () => `/inventory/${randHex(6).toUpperCase()}`,
      },
      { method: "POST", template: "/inventory/bulk", path: () => "/inventory/bulk" },
    ],
    spans: ["dynamodb", "eventbridge"],
  },
  {
    serviceName: "report-service",
    language: "python",
    runtimeName: "python3.11",
    runtimeVersion: "3.11.9",
    taskDefinition: () => `report-service:${randInt(3, 15)}`,
    routes: [
      { method: "POST", template: "/reports", path: () => "/reports" },
      { method: "GET", template: "/reports/{id}", path: () => `/reports/${randHex(8)}` },
    ],
    spans: ["rds", "s3", "ses"],
  },
  {
    serviceName: "search-service",
    language: "java",
    runtimeName: "java21",
    runtimeVersion: "21.0.3",
    taskDefinition: () => `search-service:${randInt(5, 20)}`,
    routes: [
      { method: "GET", template: "/search", path: () => "/search" },
      { method: "POST", template: "/search/suggest", path: () => "/search/suggest" },
    ],
    spans: ["elasticache", "dynamodb", "sqs"],
  },
];

// ─── HTTP status helpers ──────────────────────────────────────────────────────
function pickStatusCode(isErr) {
  if (!isErr) return rand([200, 200, 200, 201, 204]);
  return rand([400, 401, 403, 404, 422, 500, 502, 503]);
}

function httpResult(code) {
  if (code < 300) return "HTTP 2xx";
  if (code < 400) return "HTTP 3xx";
  if (code < 500) return "HTTP 4xx";
  return "HTTP 5xx";
}

// ─── Span builder ─────────────────────────────────────────────────────────────
function buildEcsSpan(
  traceId,
  txId,
  parentId,
  ts,
  spanKey,
  isErr,
  spanOffsetMs,
  spanUs,
  ecsLabels
) {
  const id = newSpanId();

  const shapes = {
    rds: {
      type: "db",
      subtype: "postgresql",
      name: () =>
        `${rand(["SELECT", "INSERT", "UPDATE", "DELETE"])} ${rand(["orders", "users", "products", "events", "inventory"])}`,
      action: () => rand(["query", "execute"]),
      db: () => ({
        type: "sql",
        statement: rand([
          "SELECT * FROM orders WHERE id = $1",
          "INSERT INTO events (id, type, payload) VALUES ($1, $2, $3)",
          "UPDATE users SET last_login = $1 WHERE id = $2",
          "SELECT * FROM products WHERE sku = $1",
          "DELETE FROM sessions WHERE expires_at < $1",
        ]),
      }),
      dest: "postgresql",
    },
    redis: {
      type: "db",
      subtype: "redis",
      name: () => `Redis ${rand(["GET", "SET", "HGET", "HSET", "ZADD", "ZRANGE", "DEL"])}`,
      action: () => rand(["GET", "SET", "query"]),
      db: () => ({
        type: "redis",
        statement: rand(["GET key", "SET key value", "HGETALL hash", "DEL key"]),
      }),
      dest: "redis",
    },
    elasticache: {
      type: "db",
      subtype: "redis",
      name: () => `Redis ${rand(["GET", "SET", "HGET", "HSET", "ZADD", "ZRANGE"])}`,
      action: () => rand(["GET", "SET", "query"]),
      db: () => ({ type: "redis", statement: rand(["GET key", "SET key value", "HGETALL hash"]) }),
      dest: "redis",
    },
    dynamodb: {
      type: "db",
      subtype: "dynamodb",
      name: () =>
        `DynamoDB.${rand(["GetItem", "PutItem", "Query", "UpdateItem", "BatchGetItem", "Scan"])}`,
      action: () => rand(["GetItem", "PutItem", "Query", "UpdateItem", "Scan"]),
      db: () => ({
        type: "nosql",
        statement: `${rand(["GetItem", "Query", "Scan"])} ${rand(["orders", "users", "inventory", "sessions", "events"])}`,
      }),
      dest: "dynamodb",
    },
    sqs: {
      type: "messaging",
      subtype: "sqs",
      name: () =>
        `SQS.${rand(["SendMessage", "ReceiveMessage", "DeleteMessage", "SendMessageBatch"])}`,
      action: () => rand(["send", "receive", "delete"]),
      db: null,
      dest: "sqs",
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
    s3: {
      type: "storage",
      subtype: "s3",
      name: () => `S3.${rand(["GetObject", "PutObject", "DeleteObject", "ListObjectsV2"])}`,
      action: () => rand(["GetObject", "PutObject", "DeleteObject", "ListObjectsV2"]),
      db: null,
      dest: "s3",
    },
    secretsmanager: {
      type: "external",
      subtype: "aws",
      name: () => "SecretsManager.GetSecretValue",
      action: () => "GetSecretValue",
      db: null,
      dest: "secretsmanager",
    },
    eventbridge: {
      type: "messaging",
      subtype: "eventbridge",
      name: () => `EventBridge.${rand(["PutEvents", "PutRule"])}`,
      action: () => "send",
      db: null,
      dest: "eventbridge",
    },
  };

  const shape = shapes[spanKey] || shapes.dynamodb;
  const spanName = shape.name();
  const action = shape.action();
  const dbBlock = shape.db ? shape.db() : undefined;

  return {
    "@timestamp": offsetTs(new Date(ts), spanOffsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: parentId },
    span: {
      id: id,
      type: shape.type,
      subtype: shape.subtype,
      name: spanName,
      duration: { us: spanUs },
      action: action,
      ...(dbBlock ? { db: dbBlock } : {}),
      destination: { service: { resource: shape.dest, type: shape.type, name: shape.dest } },
    },
    labels: ecsLabels,
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };
}

/**
 * Generates an ECS/Fargate OTel trace: 1 transaction + 2–4 child spans.
 * @param {string} ts  - ISO timestamp string (base time for the request)
 * @param {number} er  - error rate 0.0–1.0
 * @returns {Object[]} array of APM documents (transaction first, then spans)
 */
export function generateEcsTrace(ts, er) {
  const cfg = rand(SERVICE_CONFIGS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const route = rand(cfg.routes);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "production", "staging", "dev"]);
  const isErr = Math.random() < er;
  const cluster = rand(CLUSTER_NAMES);

  const statusCode = pickStatusCode(isErr);
  const resolvedPath = route.path();
  const containerId = randHex(12);
  const taskArn = `arn:aws:ecs:${region}:${account.id}:task/${cluster}/${randHex(32)}`;
  const taskDef = cfg.taskDefinition();

  // ECS-specific labels applied to all docs in this trace
  const ecsLabels = {
    container_id: containerId,
    task_id: taskArn,
    cluster_name: cluster,
    task_definition: taskDef,
  };

  // Typical container service latency
  const totalUs = randInt(10, 1500) * 1000;

  const svcBlock = serviceBlock(
    cfg.serviceName,
    env,
    cfg.language,
    "ECS",
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
      name: `${route.method} ${route.template}`,
      type: "request",
      duration: { us: totalUs },
      result: httpResult(statusCode),
      sampled: true,
      span_count: { started: cfg.spans.length, dropped: 0 },
    },
    http: {
      request: { method: route.method },
      response: { status_code: statusCode },
    },
    url: {
      path: resolvedPath,
    },
    labels: ecsLabels,
    service: svcBlock,
    agent: agent,
    telemetry: telemetry,
    cloud: {
      provider: "aws",
      region: region,
      account: { id: account.id, name: account.name },
      service: { name: "ecs" },
    },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  // ── Child spans ──────────────────────────────────────────────────────────────
  const spans: any[] = [];
  let spanOffsetMs = randInt(2, 20);
  const usPerSpan = Math.floor(totalUs / (cfg.spans.length + 1));

  for (let i = 0; i < cfg.spans.length; i++) {
    const spanUs = randInt(Math.floor(usPerSpan * 0.2), Math.floor(usPerSpan * 0.9));
    const spanIsErr = isErr && i === cfg.spans.length - 1;
    spans.push(
      buildEcsSpan(
        traceId,
        txId,
        txId,
        ts,
        cfg.spans[i],
        spanIsErr,
        spanOffsetMs,
        spanUs,
        ecsLabels
      )
    );
    spanOffsetMs += Math.floor(spanUs / 1000) + randInt(1, 15);
  }

  return [txDoc, ...spans];
}
