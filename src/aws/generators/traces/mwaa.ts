/**
 * Amazon MWAA (Managed Apache Airflow) OTel trace generator.
 *
 * Simulates DAG trigger through parse, scheduling, operator execution, and XCom.
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

const ORCHESTRATION_APPS = [
  {
    name: "analytics-dags",
    language: "python" as const,
    framework: "Apache Airflow",
    runtimeName: "CPython",
    runtimeVersion: "3.11.9",
  },
  {
    name: "data-platform-airflow",
    language: "python" as const,
    framework: "Apache Airflow",
    runtimeName: "CPython",
    runtimeVersion: "3.10.14",
  },
];

export function generateMwaaTrace(ts: string, er: number) {
  const cfg = rand(ORCHESTRATION_APPS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "staging", "dev"]);
  const isErr = Math.random() < er;
  const envName = rand(["prod-mwaa-1", "staging-airflow", "analytics-mwaa"]);
  const dagId = rand(["daily_warehouse_sync", "feature_store_refresh", "cdc_to_lake"]);

  const svcBlock = serviceBlock(
    cfg.name,
    env,
    cfg.language,
    cfg.framework,
    cfg.runtimeName,
    cfg.runtimeVersion
  );
  const { agent, telemetry } = otelBlocks(cfg.language, "elastic");

  const phases = [
    {
      name: "MWAA.DAG.parse",
      us: randInt(500_000, 12_000_000),
      labels: { dag_file: `${dagId}.py` },
    },
    {
      name: "MWAA.task.schedule",
      us: randInt(200_000, 8_000_000),
      labels: { task_id: rand(["extract", "transform", "validate", "load"]) },
    },
    {
      name: "MWAA.operator.run",
      us: randInt(2_000_000, 90_000_000),
      labels: { operator: rand(["PythonOperator", "SQSPublishOperator", "GlueJobOperator"]) },
    },
    {
      name: "MWAA.XCom.push",
      us: randInt(100_000, 4_000_000),
      labels: { xcom_key: rand(["row_count", "s3_path", "run_id"]) },
    },
  ];

  let offsetMs = randInt(8, 40);
  const spans: Record<string, unknown>[] = [];
  let sumUs = 0;
  for (let i = 0; i < phases.length; i++) {
    const ph = phases[i]!;
    const spanErr = isErr && i === phases.length - 2;
    const du = spanErr ? randInt(15_000_000, 80_000_000) : ph.us;
    sumUs += du;
    spans.push({
      "@timestamp": offsetTs(new Date(ts), offsetMs),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: newSpanId(),
        type: "app",
        subtype: "mwaa",
        name: ph.name,
        duration: { us: du },
        action: rand(["parse", "schedule", "execute", "xcom"]),
        destination: { service: { resource: "mwaa", type: "app", name: "mwaa" } },
      },
      labels: { "aws.mwaa.environment": envName, "airflow.dag_id": dagId, ...ph.labels },
      event: { outcome: spanErr ? "failure" : "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    });
    offsetMs += Math.max(10, Math.min(20_000, Math.round(du / 1000 / 100))) + randInt(5, 35);
  }

  const totalUs = sumUs + randInt(200_000, 4_000_000);
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `DAG ${dagId}`,
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
      service: { name: "mwaa" },
    },
    labels: { "aws.mwaa.environment": envName, "airflow.dag_id": dagId },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  return [txDoc, ...spans];
}
