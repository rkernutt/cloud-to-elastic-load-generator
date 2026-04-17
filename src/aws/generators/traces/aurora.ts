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

const APPS = [
  {
    name: "payments-core",
    language: "java",
    framework: "Spring Data JDBC",
    runtimeName: "OpenJDK",
    runtimeVersion: "21.0.3",
  },
  {
    name: "ledger-svc",
    language: "go",
    framework: "database/sql",
    runtimeName: "go",
    runtimeVersion: "1.22.5",
  },
];

export function generateAuroraTrace(ts: string, er: number) {
  const cfg = rand(APPS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "staging", "dev"]);
  const isErr = Math.random() < er;
  const writer = `aurora-${rand(["pay", "ledger"])}-cluster.cluster-${newTraceId().slice(0, 12)}.${region}.rds.amazonaws.com`;

  const svcBlock = serviceBlock(
    cfg.name,
    env,
    cfg.language,
    cfg.framework,
    cfg.runtimeName,
    cfg.runtimeVersion
  );
  const { agent, telemetry } = otelBlocks(cfg.language as "java" | "go", "elastic");

  const stmts = [
    "SELECT balance_cents, version FROM accounts WHERE id = $1",
    "UPDATE accounts SET balance_cents = balance_cents + $1, version = version + 1 WHERE id = $2 AND version = $3",
    "INSERT INTO ledger_entries (account_id, amount_cents, ref) VALUES ($1, $2, $3)",
  ];

  let offsetMs = randInt(1, 6);
  const spans: Record<string, unknown>[] = [];
  let sumUs = 0;
  for (let i = 0; i < stmts.length; i++) {
    const sid = newSpanId();
    const us = randInt(400, 95_000);
    sumUs += us;
    const spanErr = isErr && i === stmts.length - 1;
    spans.push({
      "@timestamp": offsetTs(new Date(ts), offsetMs),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sid,
        type: "db",
        subtype: "postgresql",
        name: `Aurora PostgreSQL ${rand(["SELECT", "UPDATE", "INSERT"])}`,
        duration: { us },
        action: stmts[i]!.startsWith("SELECT") ? "query" : "execute",
        db: { type: "sql", statement: stmts[i] },
        destination: { service: { resource: "postgresql", type: "db", name: "aurora" } },
      },
      labels: {
        "aws.rds.db_instance_identifier": writer,
        "aws.aurora.role": i === 0 ? "writer" : rand(["writer", "reader"]),
      },
      event: { outcome: spanErr ? "failure" : "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    });
    offsetMs += Math.max(1, Math.round(us / 1000));
  }

  const totalUs = sumUs + randInt(1_500, 22_000);
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: rand(["PostTransfer", "ReserveFunds", "SettleBatch"]),
      type: "request",
      duration: { us: totalUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: spans.length, dropped: 0 },
    },
    service: svcBlock,
    agent,
    telemetry,
    cloud: {
      provider: "aws",
      region,
      account: { id: account.id, name: account.name },
      service: { name: "aurora" },
    },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  return [txDoc, ...spans];
}
