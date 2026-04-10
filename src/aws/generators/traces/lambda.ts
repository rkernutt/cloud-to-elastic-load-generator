/**
 * Lambda OTel trace generator.
 *
 * Simulates a Lambda function invocation instrumented with the EDOT Lambda layer
 * (or ADOT). Produces one APM transaction document (the invocation) plus 2–5
 * downstream span documents (AWS SDK calls made from inside the function).
 *
 * Real-world instrumentation path:
 *   Lambda function (Python/Node/Java) + EDOT/ADOT OTel layer
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

// ─── Realistic Lambda function names ─────────────────────────────────────────
const FUNCTION_CONFIGS = [
  {
    name: "order-processor",
    runtime: "python3.12",
    trigger: "sqs",
    sdkCalls: ["sqs", "dynamodb", "sns"],
  },
  {
    name: "user-auth-handler",
    runtime: "nodejs20.x",
    trigger: "http",
    sdkCalls: ["cognito", "dynamodb", "secretsmanager"],
  },
  { name: "image-resizer", runtime: "nodejs18.x", trigger: "s3", sdkCalls: ["s3", "rekognition"] },
  {
    name: "data-pipeline-ingest",
    runtime: "python3.11",
    trigger: "kinesis",
    sdkCalls: ["s3", "dynamodb", "kinesis"],
  },
  {
    name: "notification-sender",
    runtime: "python3.12",
    trigger: "scheduled",
    sdkCalls: ["ses", "sns", "dynamodb"],
  },
  {
    name: "api-backend",
    runtime: "nodejs20.x",
    trigger: "http",
    sdkCalls: ["dynamodb", "s3", "elasticache"],
  },
  {
    name: "etl-transformer",
    runtime: "java21",
    trigger: "s3",
    sdkCalls: ["s3", "dynamodb", "glue"],
  },
  {
    name: "fraud-scorer",
    runtime: "python3.11",
    trigger: "sqs",
    sdkCalls: ["dynamodb", "sagemaker", "sns"],
  },
  {
    name: "inventory-updater",
    runtime: "python3.12",
    trigger: "eventbridge",
    sdkCalls: ["dynamodb", "sqs", "sns"],
  },
  {
    name: "report-generator",
    runtime: "java21",
    trigger: "scheduled",
    sdkCalls: ["s3", "rds", "ses"],
  },
  {
    name: "stream-processor",
    runtime: "nodejs20.x",
    trigger: "kinesis",
    sdkCalls: ["dynamodb", "kinesis", "firehose"],
  },
  {
    name: "webhook-dispatcher",
    runtime: "python3.12",
    trigger: "http",
    sdkCalls: ["sqs", "secretsmanager", "dynamodb"],
  },
];

const RUNTIME_LANG = {
  "python3.11": "python",
  "python3.12": "python",
  "nodejs18.x": "nodejs",
  "nodejs20.x": "nodejs",
  java21: "java",
  "go1.x": "go",
} as const;

const RUNTIME_VERSION = {
  "python3.11": "3.11.9",
  "python3.12": "3.12.3",
  "nodejs18.x": "18.20.4",
  "nodejs20.x": "20.15.1",
  java21: "21.0.3",
  "go1.x": "1.22.5",
} as const;

type LambdaRuntime = keyof typeof RUNTIME_VERSION;

// ─── Per-SDK-call span shape ──────────────────────────────────────────────────
function buildSpan(
  traceId: string,
  txId: string,
  parentId: string,
  ts: string,
  sdkKey: string,
  isErr: boolean,
  spanOffset: number,
  spanDuration: number
) {
  const id = newSpanId();

  const shapes = {
    dynamodb: {
      type: "db",
      subtype: "dynamodb",
      name: () =>
        `DynamoDB.${rand(["GetItem", "PutItem", "Query", "UpdateItem", "BatchGetItem", "Scan"])}`,
      action: () => rand(["GetItem", "PutItem", "Query", "UpdateItem", "BatchGetItem", "Scan"]),
      db: () => ({
        type: "nosql",
        statement: `${rand(["GetItem", "Query", "Scan"])} ${rand(["orders", "users", "inventory", "sessions", "events"])}`,
      }),
      dest: "dynamodb",
    },
    s3: {
      type: "storage",
      subtype: "s3",
      name: () =>
        `S3.${rand(["GetObject", "PutObject", "DeleteObject", "ListObjectsV2", "CopyObject"])}`,
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
    ses: {
      type: "messaging",
      subtype: "ses",
      name: () => `SES.${rand(["SendEmail", "SendRawEmail"])}`,
      action: () => "send",
      db: null,
      dest: "ses",
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
      name: () => `Firehose.PutRecordBatch`,
      action: () => "send",
      db: null,
      dest: "firehose",
    },
    secretsmanager: {
      type: "external",
      subtype: "aws",
      name: () => `SecretsManager.GetSecretValue`,
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
    rekognition: {
      type: "external",
      subtype: "aws",
      name: () => `Rekognition.${rand(["DetectLabels", "DetectFaces", "DetectModerationLabels"])}`,
      action: () => rand(["DetectLabels", "DetectFaces"]),
      db: null,
      dest: "rekognition",
    },
    sagemaker: {
      type: "external",
      subtype: "aws",
      name: () => `SageMaker.InvokeEndpoint`,
      action: () => "InvokeEndpoint",
      db: null,
      dest: "sagemaker",
    },
    elasticache: {
      type: "db",
      subtype: "redis",
      name: () => `Redis ${rand(["GET", "SET", "HGET", "HSET", "ZADD", "ZRANGE"])}`,
      action: () => rand(["GET", "SET", "query"]),
      db: () => ({ type: "redis", statement: rand(["GET key", "SET key value", "HGETALL hash"]) }),
      dest: "redis",
    },
    glue: {
      type: "external",
      subtype: "aws",
      name: () => `Glue.${rand(["GetTable", "GetDatabase", "StartJobRun"])}`,
      action: () => rand(["GetTable", "StartJobRun"]),
      db: null,
      dest: "glue",
    },
    rds: {
      type: "db",
      subtype: "postgresql",
      name: () => `PostgreSQL ${rand(["SELECT", "INSERT", "UPDATE", "DELETE"])}`,
      action: () => rand(["query", "execute"]),
      db: () => ({
        type: "sql",
        statement: rand([
          "SELECT * FROM orders WHERE status = $1",
          "INSERT INTO events (id, type, payload) VALUES ($1, $2, $3)",
          "UPDATE users SET last_login = $1 WHERE id = $2",
        ]),
      }),
      dest: "postgresql",
    },
  };

  const shape = shapes[sdkKey as keyof typeof shapes] || shapes.dynamodb;
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
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };
}

/**
 * Generates a Lambda OTel trace: 1 transaction + 2–5 downstream spans.
 * @param {string} ts  - ISO timestamp string (base time for the invocation)
 * @param {number} er  - error rate 0.0–1.0
 * @returns {Object[]} array of APM documents (transaction first, then spans)
 */
export function generateLambdaTrace(ts: string, er: number) {
  const cfg = rand(FUNCTION_CONFIGS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const rt = cfg.runtime as LambdaRuntime;
  const lang = RUNTIME_LANG[rt] || "python";
  const env = rand(["production", "production", "staging", "dev"]);
  const isErr = Math.random() < er;
  const coldStart = Math.random() < 0.08;

  // Durations in microseconds
  const initUs = coldStart ? randInt(150, 1800) * 1000 : 0;
  const execUs = randInt(30, 4000) * 1000;
  const totalUs = initUs + execUs;

  const executionId = `${randHex(8)}-${randHex(4)}-${randHex(4)}-${randHex(4)}-${randHex(12)}`;
  const funcArn = `arn:aws:lambda:${region}:${account.id}:function:${cfg.name}`;

  const triggerTypeMap = {
    http: "other",
    sqs: "pubsub",
    kinesis: "pubsub",
    s3: "datastore",
    scheduled: "timer",
    eventbridge: "pubsub",
  } as const;

  const svcBlock = serviceBlock(
    cfg.name,
    env,
    lang,
    "AWS Lambda",
    cfg.runtime,
    RUNTIME_VERSION[rt] || "unknown"
  );

  const distro = rand(["elastic", "aws"]);
  const { agent, telemetry } = otelBlocks(lang, distro);

  // ── Root transaction (the Lambda invocation) ────────────────────────────────
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: cfg.name,
      type: "lambda",
      duration: { us: totalUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: cfg.sdkCalls.length, dropped: 0 },
      faas: {
        coldstart: coldStart,
        execution: executionId,
        trigger: {
          type: triggerTypeMap[cfg.trigger as keyof typeof triggerTypeMap] || "other",
        },
      },
    },
    faas: {
      name: cfg.name,
      id: funcArn,
      version: "$LATEST",
      coldstart: coldStart,
      execution: executionId,
      trigger: {
        type: triggerTypeMap[cfg.trigger as keyof typeof triggerTypeMap] || "other",
      },
    },
    service: svcBlock,
    agent: agent,
    telemetry: telemetry,
    cloud: {
      provider: "aws",
      region: region,
      account: { id: account.id, name: account.name },
      service: { name: "lambda" },
    },
    ...(distro === "aws"
      ? {
          labels: {
            "aws.xray.trace_id": `1-${randHex(8)}-${randHex(24)}`,
            "aws.xray.segment_id": randHex(16),
          },
        }
      : {}),
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  // ── Child spans (AWS SDK calls) ──────────────────────────────────────────────
  // Spans run sequentially after any init time, slightly staggered
  const spans: any[] = [];
  let spanOffset = initUs / 1000; // convert µs → ms for offsetTs
  const usPerSdk = Math.floor(execUs / cfg.sdkCalls.length);

  for (const sdkKey of cfg.sdkCalls) {
    const spanUs = randInt(Math.floor(usPerSdk * 0.2), Math.floor(usPerSdk * 0.9));
    const spanIsErr = isErr && spans.length === cfg.sdkCalls.length - 1; // error on last span if trace is error
    spans.push(buildSpan(traceId, txId, txId, ts, sdkKey, spanIsErr, spanOffset, spanUs));
    spanOffset += spanUs / 1000 + randInt(1, 20); // small gap between calls (ms)
  }

  // ── Cold start init span ─────────────────────────────────────────────────────
  // When the Lambda container was not warm, an init phase precedes the handler.
  // Emitted as a child of the transaction so it appears at the top of the waterfall.
  const initSpans = coldStart
    ? [
        {
          "@timestamp": ts,
          processor: { name: "transaction", event: "span" },
          trace: { id: traceId },
          transaction: { id: txId },
          parent: { id: txId },
          span: {
            id: newSpanId(),
            type: "app",
            subtype: "cold-start",
            name: `Lambda init: ${cfg.name}`,
            duration: { us: initUs },
            action: "init",
          },
          service: svcBlock,
          agent,
          telemetry,
          event: { outcome: "success" },
          data_stream: { type: "traces", dataset: "apm", namespace: "default" },
        },
      ]
    : [];

  return [txDoc, ...initSpans, ...spans];
}
