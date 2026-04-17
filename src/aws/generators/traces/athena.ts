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
    name: "ad-hoc-analytics",
    language: "python",
    framework: "boto3",
    runtimeName: "CPython",
    runtimeVersion: "3.12.3",
  },
  {
    name: "metrics-export",
    language: "java",
    framework: "AWS SDK v2",
    runtimeName: "OpenJDK",
    runtimeVersion: "21.0.3",
  },
];

export function generateAthenaTrace(ts: string, er: number) {
  const cfg = rand(APPS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "staging", "dev"]);
  const isErr = Math.random() < er;
  const workgroup = `wg-${rand(["primary", "adhoc", "security"])}`;

  const svcBlock = serviceBlock(
    cfg.name,
    env,
    cfg.language,
    cfg.framework,
    cfg.runtimeName,
    cfg.runtimeVersion
  );
  const { agent, telemetry } = otelBlocks(cfg.language as "python" | "java", "elastic");

  const phases = [
    { name: "Athena.StartQueryExecution", us: randInt(50_000, 400_000) },
    { name: "Athena.GetQueryExecution", us: randInt(20_000, 180_000) },
    { name: "Athena.GetQueryResults", us: randInt(200_000, 4_000_000) },
  ];

  let offsetMs = randInt(1, 8);
  const spans: Record<string, unknown>[] = [];
  let sumUs = 0;
  for (let i = 0; i < phases.length; i++) {
    const ph = phases[i]!;
    const sid = newSpanId();
    sumUs += ph.us;
    const spanErr = isErr && i === phases.length - 1;
    spans.push({
      "@timestamp": offsetTs(new Date(ts), offsetMs),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sid,
        type: "db",
        subtype: "aws",
        name: ph.name,
        duration: { us: ph.us },
        action: "query",
        db: {
          type: "sql",
          statement: `SELECT event_type, COUNT(*) FROM ${rand(["access_logs", "orders_parquet"])} WHERE dt = '$DATE' GROUP BY 1`,
        },
        destination: { service: { resource: "athena", type: "db", name: "athena" } },
      },
      labels: { "aws.athena.work_group": workgroup },
      event: { outcome: spanErr ? "failure" : "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    });
    offsetMs += Math.max(1, Math.round(ph.us / 1000));
  }

  const totalUs = sumUs + randInt(2_000, 25_000);
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: rand(["PartitionPruneScan", "SecurityLakeLookup", "FinanceReconQuery"]),
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
      service: { name: "athena" },
    },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  return [txDoc, ...spans];
}
