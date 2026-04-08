/**
 * DynamoDB OTel trace generator.
 *
 * Simulates standalone DynamoDB-backed services where DynamoDB is the primary
 * persistence layer (not a side-effect within a Lambda). Each trace represents
 * one business operation (transaction) with 2–5 DynamoDB operation spans.
 *
 * Real-world instrumentation path:
 *   Application (Node/Python/Java) + EDOT OTel SDK
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
  randFloat,
  offsetTs,
  serviceBlock,
  otelBlocks,
} from "./helpers.js";

// ─── Service configurations ───────────────────────────────────────────────────
const SERVICE_CONFIGS = [
  {
    name: "session-store",
    language: "nodejs",
    framework: "Express",
    runtimeName: "node",
    runtimeVersion: "20.15.1",
    tableName: "sessions",
    transactionType: "request",
    operations: [
      { txName: "CheckSession", ops: ["GetItem", "UpdateItem"] },
      { txName: "CreateSession", ops: ["GetItem", "PutItem"] },
      { txName: "RefreshSession", ops: ["GetItem", "UpdateItem", "PutItem"] },
      { txName: "LogoutSession", ops: ["GetItem", "DeleteItem"] },
    ],
  },
  {
    name: "leaderboard-service",
    language: "java",
    framework: "Spring Boot",
    runtimeName: "OpenJDK",
    runtimeVersion: "21.0.3",
    tableName: "leaderboard",
    transactionType: "request",
    operations: [
      { txName: "GetTopScores", ops: ["Query"] },
      { txName: "UpdateScore", ops: ["Query", "UpdateItem", "TransactWriteItems"] },
      { txName: "AtomicScoreSync", ops: ["Query", "TransactWriteItems"] },
    ],
  },
  {
    name: "shopping-cart",
    language: "python",
    framework: "FastAPI",
    runtimeName: "CPython",
    runtimeVersion: "3.12.3",
    tableName: "carts",
    transactionType: "request",
    operations: [
      { txName: "LoadShoppingCart", ops: ["GetItem"] },
      { txName: "AddItemToCart", ops: ["GetItem", "PutItem"] },
      { txName: "ModifyCartQuantity", ops: ["GetItem", "UpdateItem"] },
      { txName: "RemoveCartItem", ops: ["GetItem", "UpdateItem", "DeleteItem"] },
    ],
  },
  {
    name: "feature-flags",
    language: "nodejs",
    framework: "Fastify",
    runtimeName: "node",
    runtimeVersion: "20.15.1",
    tableName: "feature_flags",
    transactionType: "request",
    operations: [
      { txName: "LoadUserFlags", ops: ["BatchGetItem"] },
      { txName: "AdminListAllFlags", ops: ["Scan"] },
      { txName: "EvaluateFlags", ops: ["BatchGetItem", "GetItem"] },
    ],
  },
  {
    name: "user-preferences",
    language: "python",
    framework: "Flask",
    runtimeName: "CPython",
    runtimeVersion: "3.11.9",
    tableName: "user_preferences",
    transactionType: "request",
    operations: [
      { txName: "LoadUserPreferences", ops: ["GetItem"] },
      { txName: "SaveUserPreferences", ops: ["GetItem", "PutItem"] },
      { txName: "GetPreferenceHistory", ops: ["GetItem", "Query"] },
      { txName: "BulkPreferenceSync", ops: ["Query", "PutItem", "UpdateItem"] },
    ],
  },
];

// DynamoDB operation properties
const DYNAMO_OP_PROPS = {
  GetItem: { readCu: [0.5, 2], writeCu: [0, 0], durationMs: [1, 30] },
  PutItem: { readCu: [0, 0], writeCu: [1, 4], durationMs: [2, 40] },
  UpdateItem: { readCu: [0.5, 1], writeCu: [1, 3], durationMs: [2, 50] },
  DeleteItem: { readCu: [0, 0], writeCu: [1, 2], durationMs: [1, 30] },
  Query: { readCu: [1, 10], writeCu: [0, 0], durationMs: [3, 80] },
  Scan: { readCu: [5, 50], writeCu: [0, 0], durationMs: [10, 200] },
  BatchGetItem: { readCu: [2, 20], writeCu: [0, 0], durationMs: [5, 100] },
  TransactWriteItems: { readCu: [1, 5], writeCu: [2, 10], durationMs: [5, 120] },
};

function buildDynamoSpan(traceId, txId, parentId, ts, operation, tableName, isErr, spanOffsetMs) {
  const id = newSpanId();
  const props = DYNAMO_OP_PROPS[operation] || DYNAMO_OP_PROPS.GetItem;
  const durationUs = randInt(props.durationMs[0], props.durationMs[1]) * 1000;
  const readCu = randFloat(props.readCu[0], props.readCu[1], 1);
  const writeCu = randFloat(props.writeCu[0], props.writeCu[1], 1);

  return {
    "@timestamp": offsetTs(new Date(ts), spanOffsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: parentId },
    span: {
      id: id,
      type: "db",
      subtype: "dynamodb",
      name: `DynamoDB.${operation} ${tableName}`,
      duration: { us: durationUs },
      action: operation,
      db: { type: "nosql", statement: `${operation} ${tableName}` },
      destination: { service: { resource: "dynamodb", type: "db", name: "dynamodb" } },
    },
    labels: {
      table_name: tableName,
      consumed_read_capacity_units: String(readCu),
      consumed_write_capacity_units: String(writeCu),
    },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };
}

/**
 * Generates a DynamoDB OTel trace: 1 transaction + 2–5 DynamoDB operation spans.
 * @param {string} ts  - ISO timestamp string (base time for the request)
 * @param {number} er  - error rate 0.0–1.0
 * @returns {Object[]} array of APM documents (transaction first, then spans)
 */
export function generateDynamoDbTrace(ts, er) {
  const cfg = rand(SERVICE_CONFIGS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "production", "staging", "dev"]);
  const isErr = Math.random() < er;

  const opConfig = rand(cfg.operations);
  const txName = opConfig.txName;
  const opList = opConfig.ops;

  // Total transaction duration: sum of span durations + small gaps
  const totalUs = randInt(20, 500) * 1000;

  const svcBlock = serviceBlock(
    cfg.name,
    env,
    cfg.language,
    cfg.framework,
    cfg.runtimeName,
    cfg.runtimeVersion
  );

  const { agent, telemetry } = otelBlocks(cfg.language, "elastic");

  // ── Root transaction ────────────────────────────────────────────────────────
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: txName,
      type: cfg.transactionType,
      duration: { us: totalUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: opList.length, dropped: 0 },
    },
    service: svcBlock,
    agent: agent,
    telemetry: telemetry,
    cloud: {
      provider: "aws",
      region: region,
      account: { id: account.id, name: account.name },
      service: { name: "dynamodb" },
    },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  // ── Child spans (DynamoDB operations) ───────────────────────────────────────
  const spans: any[] = [];
  let spanOffsetMs = randInt(1, 5); // small initial offset into the transaction

  for (let i = 0; i < opList.length; i++) {
    const operation = opList[i];
    const spanIsErr = isErr && i === opList.length - 1;
    const props = DYNAMO_OP_PROPS[operation] || DYNAMO_OP_PROPS.GetItem;
    const durationUs = randInt(props.durationMs[0], props.durationMs[1]) * 1000;

    spans.push(
      buildDynamoSpan(traceId, txId, txId, ts, operation, cfg.tableName, spanIsErr, spanOffsetMs)
    );

    spanOffsetMs += durationUs / 1000 + randInt(1, 10);
  }

  return [txDoc, ...spans];
}
