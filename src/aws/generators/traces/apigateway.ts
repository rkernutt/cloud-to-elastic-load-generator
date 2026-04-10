/**
 * API Gateway OTel trace generator.
 *
 * Simulates API Gateway REST/HTTP API requests instrumented via the EDOT Lambda
 * layer on the backing Lambda function. Produces one APM transaction document
 * (the full API Gateway HTTP server span) plus 2–4 child span documents
 * (Lambda invocation + downstream AWS SDK calls made inside the function).
 *
 * Real-world instrumentation path:
 *   API Gateway → Lambda (EDOT OTel layer)
 *     → OTLP gRPC/HTTP → Elastic APM Server / OTel Collector
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

// ─── Function / route configs ─────────────────────────────────────────────────
const FUNCTION_CONFIGS = [
  {
    serviceName: "api-orders",
    apiType: "REST",
    apiId: "a1b2c3d4e5",
    stage: "prod",
    routes: [
      { method: "GET", template: "/orders/{orderId}", path: () => `/orders/${randHex(8)}` },
      { method: "POST", template: "/orders", path: () => "/orders" },
      { method: "DELETE", template: "/orders/{orderId}", path: () => `/orders/${randHex(8)}` },
    ],
    lambdaName: "order-processor",
    downstreamSdk: ["dynamodb", "sqs", "sns"],
  },
  {
    serviceName: "api-users",
    apiType: "REST",
    apiId: "b2c3d4e5f6",
    stage: "prod",
    routes: [
      {
        method: "GET",
        template: "/users/{userId}/profile",
        path: () => `/users/${randHex(8)}/profile`,
      },
      { method: "POST", template: "/users", path: () => "/users" },
      { method: "PUT", template: "/users/{userId}", path: () => `/users/${randHex(8)}` },
    ],
    lambdaName: "user-auth-handler",
    downstreamSdk: ["dynamodb", "cognito", "secretsmanager"],
  },
  {
    serviceName: "api-products",
    apiType: "REST",
    apiId: "c3d4e5f6a7",
    stage: "v1",
    routes: [
      { method: "GET", template: "/products/{productId}", path: () => `/products/${randHex(8)}` },
      { method: "GET", template: "/products", path: () => "/products" },
      { method: "POST", template: "/products", path: () => "/products" },
      { method: "PATCH", template: "/products/{productId}", path: () => `/products/${randHex(8)}` },
    ],
    lambdaName: "product-catalogue",
    downstreamSdk: ["dynamodb", "s3", "elasticache"],
  },
  {
    serviceName: "api-payments",
    apiType: "REST",
    apiId: "d4e5f6a7b8",
    stage: "prod",
    routes: [
      { method: "POST", template: "/payments", path: () => "/payments" },
      { method: "GET", template: "/payments/{paymentId}", path: () => `/payments/${randHex(8)}` },
    ],
    lambdaName: "payment-processor",
    downstreamSdk: ["dynamodb", "sqs", "secretsmanager"],
  },
  {
    serviceName: "api-inventory",
    apiType: "REST",
    apiId: "e5f6a7b8c9",
    stage: "prod",
    routes: [
      {
        method: "GET",
        template: "/inventory/{sku}",
        path: () => `/inventory/${randHex(6).toUpperCase()}`,
      },
      {
        method: "PUT",
        template: "/inventory/{sku}",
        path: () => `/inventory/${randHex(6).toUpperCase()}`,
      },
    ],
    lambdaName: "inventory-updater",
    downstreamSdk: ["dynamodb", "sns", "sqs"],
  },
  {
    serviceName: "api-stream",
    apiType: "HTTP",
    apiId: "f6a7b8c9d0",
    stage: "prod",
    routes: [
      { method: "POST", template: "/api/v2/stream", path: () => "/api/v2/stream" },
      { method: "GET", template: "/api/v2/stream", path: () => "/api/v2/stream" },
    ],
    lambdaName: "stream-processor",
    downstreamSdk: ["kinesis", "dynamodb", "firehose"],
  },
  {
    serviceName: "api-search",
    apiType: "HTTP",
    apiId: "a7b8c9d0e1",
    stage: "prod",
    routes: [
      { method: "GET", template: "/api/v2/search", path: () => "/api/v2/search" },
      { method: "POST", template: "/api/v2/search", path: () => "/api/v2/search" },
    ],
    lambdaName: "api-backend",
    downstreamSdk: ["dynamodb", "s3", "elasticache"],
  },
  {
    serviceName: "api-webhooks",
    apiType: "WebSocket",
    apiId: "b8c9d0e1f2",
    stage: "prod",
    routes: [
      { method: "POST", template: "/webhooks", path: () => "/webhooks" },
      { method: "POST", template: "/webhooks/{hookId}", path: () => `/webhooks/${randHex(8)}` },
    ],
    lambdaName: "webhook-dispatcher",
    downstreamSdk: ["sqs", "dynamodb", "secretsmanager"],
  },
];

// All API Gateway Lambda proxies are Node.js by convention
const LANGUAGE = "nodejs";
const RUNTIME_NAME = "nodejs20.x";
const RUNTIME_VERSION = "20.15.1";

// HTTP status code buckets
function pickStatusCode(isErr: boolean) {
  if (!isErr) return rand([200, 200, 200, 201, 204]);
  return rand([400, 401, 403, 404, 422, 500, 502, 503]);
}

function httpResult(code: number) {
  if (code < 300) return "HTTP 2xx";
  if (code < 400) return "HTTP 3xx";
  if (code < 500) return "HTTP 4xx";
  return "HTTP 5xx";
}

// ─── Per-SDK-call span builder ────────────────────────────────────────────────
function buildDownstreamSpan(
  traceId: string,
  txId: string,
  parentId: string,
  ts: string,
  sdkKey: string,
  isErr: boolean,
  spanOffsetMs: number,
  spanUs: number
) {
  const id = newSpanId();

  const shapes = {
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
    s3: {
      type: "storage",
      subtype: "s3",
      name: () => `S3.${rand(["GetObject", "PutObject", "DeleteObject", "ListObjectsV2"])}`,
      action: () => rand(["GetObject", "PutObject", "DeleteObject", "ListObjectsV2"]),
      db: null,
      dest: "s3",
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
    kinesis: {
      type: "messaging",
      subtype: "kinesis",
      name: () => `Kinesis.${rand(["PutRecord", "PutRecords", "GetRecords"])}`,
      action: () => rand(["send", "receive"]),
      db: null,
      dest: "kinesis",
    },
    firehose: {
      type: "messaging",
      subtype: "firehose",
      name: () => "Firehose.PutRecordBatch",
      action: () => "send",
      db: null,
      dest: "firehose",
    },
    secretsmanager: {
      type: "external",
      subtype: "aws",
      name: () => "SecretsManager.GetSecretValue",
      action: () => "GetSecretValue",
      db: null,
      dest: "secretsmanager",
    },
    cognito: {
      type: "external",
      subtype: "aws",
      name: () => `Cognito.${rand(["GetUser", "InitiateAuth", "RespondToAuthChallenge"])}`,
      action: () => rand(["GetUser", "InitiateAuth"]),
      db: null,
      dest: "cognito",
    },
    elasticache: {
      type: "db",
      subtype: "redis",
      name: () => `Redis ${rand(["GET", "SET", "HGET", "HSET", "ZADD", "ZRANGE"])}`,
      action: () => rand(["GET", "SET", "query"]),
      db: () => ({ type: "redis", statement: rand(["GET key", "SET key value", "HGETALL hash"]) }),
      dest: "redis",
    },
  };

  const shape = shapes[sdkKey as keyof typeof shapes] || shapes.dynamodb;
  const spanName = shape.name();
  const spanAction = shape.action();
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
      action: spanAction,
      ...(dbBlock ? { db: dbBlock } : {}),
      destination: { service: { resource: shape.dest, type: shape.type, name: shape.dest } },
    },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };
}

/**
 * Generates an API Gateway OTel trace: 1 transaction + 2–4 child spans.
 * @param {string} ts  - ISO timestamp string (base time for the request)
 * @param {number} er  - error rate 0.0–1.0
 * @returns {Object[]} array of APM documents (transaction first, then spans)
 */
export function generateApiGatewayTrace(ts: string, er: number) {
  const cfg = rand(FUNCTION_CONFIGS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const route = rand(cfg.routes);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "production", "staging", "dev"]);
  const isErr = Math.random() < er;

  const statusCode = pickStatusCode(isErr);
  const resolvedPath = route.path();
  const domainId = cfg.apiId;
  const domain = `${domainId}.execute-api.${region}.amazonaws.com`;

  // Total request duration: HTTP APIs are faster than REST
  const totalUs = cfg.apiType === "HTTP" ? randInt(5, 800) * 1000 : randInt(20, 2000) * 1000;

  const svcBlock = serviceBlock(
    cfg.serviceName,
    env,
    LANGUAGE,
    "Amazon API Gateway",
    RUNTIME_NAME,
    RUNTIME_VERSION
  );

  const { agent, telemetry } = otelBlocks(LANGUAGE, "elastic");

  // ── Root transaction (the HTTP server span for the API GW request) ───────────
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
      span_count: { started: 1 + cfg.downstreamSdk.length, dropped: 0 },
    },
    http: {
      request: { method: route.method },
      response: { status_code: statusCode },
    },
    url: {
      path: resolvedPath,
      domain: domain,
    },
    labels: {
      api_id: domainId,
      api_type: cfg.apiType,
      ...(cfg.apiType === "REST" ? { stage: cfg.stage } : {}),
    },
    service: svcBlock,
    agent: agent,
    telemetry: telemetry,
    cloud: {
      provider: "aws",
      region: region,
      account: { id: account.id, name: account.name },
      service: { name: "apigateway" },
    },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  // ── Child spans ──────────────────────────────────────────────────────────────
  // Span 1: Lambda invocation (parent = transaction)
  const lambdaSpanId = newSpanId();
  const lambdaOffsetMs = randInt(1, 10);
  const lambdaUs = Math.floor((totalUs * randInt(70, 95)) / 100);

  const lambdaSpan = {
    "@timestamp": offsetTs(new Date(ts), lambdaOffsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: lambdaSpanId,
      type: "external",
      subtype: "lambda",
      name: `Lambda invoke ${cfg.lambdaName}`,
      duration: { us: lambdaUs },
      action: "invoke",
      destination: { service: { resource: "lambda", type: "external", name: "lambda" } },
    },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  // Spans 2-N: downstream AWS SDK calls (parent = Lambda invocation span)
  const spans = [lambdaSpan];
  let spanOffsetMs = lambdaOffsetMs + randInt(5, 30);
  const sdkKeys = cfg.downstreamSdk;
  const usPerSdk = Math.floor(lambdaUs / (sdkKeys.length + 1));

  for (let i = 0; i < sdkKeys.length; i++) {
    const spanUs = randInt(Math.floor(usPerSdk * 0.2), Math.floor(usPerSdk * 0.9));
    const spanIsErr = isErr && i === sdkKeys.length - 1;
    spans.push(
      buildDownstreamSpan(
        traceId,
        txId,
        lambdaSpanId,
        ts,
        sdkKeys[i],
        spanIsErr,
        spanOffsetMs,
        spanUs
      )
    );
    spanOffsetMs += Math.floor(spanUs / 1000) + randInt(1, 15);
  }

  return [txDoc, ...spans];
}
