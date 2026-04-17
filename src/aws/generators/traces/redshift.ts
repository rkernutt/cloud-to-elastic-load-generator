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
    name: "reporting-dwh",
    language: "python",
    framework: "SQLAlchemy",
    runtimeName: "CPython",
    runtimeVersion: "3.12.3",
  },
  {
    name: "bi-extractor",
    language: "java",
    framework: "JDBC",
    runtimeName: "OpenJDK",
    runtimeVersion: "21.0.3",
  },
];

const STMTS = [
  "SELECT date_dim.d_week_seq, SUM(store_sales.ss_ext_sales_price) FROM store_sales JOIN date_dim ON ... GROUP BY 1",
  "COPY staging_events FROM 's3://data-lake/events/' IAM_ROLE 'arn:aws:iam::...:role/RedshiftS3' FORMAT AS PARQUET",
  "UNLOAD (SELECT * FROM mart.orders WHERE ship_date >= $1) TO 's3://exports/orders/' PARALLEL ON",
];

export function generateRedshiftTrace(ts: string, er: number) {
  const cfg = rand(APPS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "staging", "dev"]);
  const isErr = Math.random() < er;
  const cluster = `${rand(["dwh", "analytics"])}-${randInt(1, 5)}`;

  const svcBlock = serviceBlock(
    cfg.name,
    env,
    cfg.language,
    cfg.framework,
    cfg.runtimeName,
    cfg.runtimeVersion
  );
  const { agent, telemetry } = otelBlocks(cfg.language as "python" | "java", "elastic");

  const nSpans = randInt(2, 4);
  let offsetMs = randInt(1, 8);
  const spans: Record<string, unknown>[] = [];
  let sumUs = 0;
  for (let i = 0; i < nSpans; i++) {
    const sid = newSpanId();
    const us = randInt(5_000, 2_200_000);
    sumUs += us;
    const spanErr = isErr && i === nSpans - 1;
    const stmt = rand(STMTS);
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
        name: `Redshift ${rand(["SELECT", "COPY", "UNLOAD", "INSERT"])}`,
        duration: { us },
        action: "query",
        db: { type: "sql", statement: stmt },
        destination: { service: { resource: "postgresql", type: "db", name: "redshift" } },
      },
      labels: { "aws.redshift.cluster_identifier": cluster },
      event: { outcome: spanErr ? "failure" : "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    });
    offsetMs += Math.max(1, Math.round(us / 1000));
  }

  const totalUs = sumUs + randInt(3_000, 40_000);
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: rand(["NightlyAggJob", "AdhocSliceQuery", "StagePromoteCopy"]),
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
      service: { name: "redshift" },
    },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  return [txDoc, ...spans];
}
