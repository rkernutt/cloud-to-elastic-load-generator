/**
 * EMR Spark OTel trace generator.
 *
 * Simulates a Spark application running on EMR, instrumented with the EDOT Java
 * agent (or upstream OTel Java agent) deployed via an EMR bootstrap action.
 * Produces one APM transaction (the Spark job/application run) plus 3–10 stage
 * spans representing Spark stages and, for SQL jobs, SQL query spans.
 *
 * Real-world instrumentation path:
 *   EMR cluster bootstrap action installs:
 *     -javaagent:/opt/aws/otel/elastic-otel-javaagent.jar
 *   Spark executor JVMs emit OTLP → OTel Collector on master node
 *     → Elastic APM Server → traces-apm-default
 *
 * OTel Spark instrumentation (opentelemetry-spark-X.Y.Z.jar) produces:
 *   - One span per Spark Job (root)
 *   - One span per Stage within each Job
 *   - SparkSQL: additional db spans for each SQL query execution plan step
 */

import {
  TRACE_REGIONS,
  TRACE_ACCOUNTS,
  randHex,
  newTraceId,
  newSpanId,
  rand,
  randInt,
  randFloat,
  offsetTs,
  serviceBlock,
  otelBlocks,
} from "./helpers.js";

// ─── EMR / Spark job templates ────────────────────────────────────────────────
const JOB_CONFIGS = [
  {
    appName: "etl-daily-orders",
    jobType: "etl",
    stages: [
      { name: "Stage 0: Scan S3 Parquet", type: "storage", inputRecords: [1e6, 5e6] },
      { name: "Stage 1: Filter & Deduplicate", type: "compute", inputRecords: [5e5, 4e6] },
      { name: "Stage 2: Join with Customer Dim", type: "compute", inputRecords: [5e5, 4e6] },
      { name: "Stage 3: Aggregate by Product/Region", type: "compute", inputRecords: [1e4, 2e5] },
      { name: "Stage 4: Write Output to S3", type: "storage", inputRecords: [1e4, 2e5] },
    ],
  },
  {
    appName: "ml-feature-engineering",
    jobType: "spark_sql",
    stages: [
      { name: "Stage 0: Load Raw Events from S3", type: "storage", inputRecords: [2e6, 8e6] },
      { name: "Stage 1: Explode & Normalise", type: "compute", inputRecords: [2e6, 8e6] },
      { name: "Stage 2: Window Aggregations", type: "compute", inputRecords: [5e5, 2e6] },
      { name: "Stage 3: Feature Vectorisation", type: "compute", inputRecords: [5e5, 2e6] },
      { name: "Stage 4: Write Feature Store (Delta)", type: "storage", inputRecords: [5e5, 2e6] },
    ],
    sqlQueries: [
      "SELECT user_id, COUNT(*) AS events_30d FROM events WHERE event_date >= date_sub(current_date(),30) GROUP BY user_id",
      "SELECT *, NTILE(10) OVER (ORDER BY spend DESC) AS spend_decile FROM user_summary",
    ],
  },
  {
    appName: "clickstream-aggregation",
    jobType: "streaming_sql",
    stages: [
      { name: "Stage 0: Read Kinesis Shard", type: "messaging", inputRecords: [5e4, 5e5] },
      { name: "Stage 1: Parse & Validate Events", type: "compute", inputRecords: [5e4, 5e5] },
      { name: "Stage 2: Session Window Join", type: "compute", inputRecords: [1e4, 1e5] },
      { name: "Stage 3: Write to DynamoDB", type: "db", inputRecords: [1e4, 1e5] },
    ],
  },
  {
    appName: "report-pipeline-monthly",
    jobType: "spark_sql",
    stages: [
      { name: "Stage 0: Load Sales Transactions", type: "storage", inputRecords: [5e6, 2e7] },
      { name: "Stage 1: Load Product Catalogue", type: "storage", inputRecords: [1e4, 1e5] },
      { name: "Stage 2: Broadcast Join Products", type: "compute", inputRecords: [5e6, 2e7] },
      { name: "Stage 3: Group by Category/Date", type: "compute", inputRecords: [1e3, 1e4] },
      { name: "Stage 4: Compute Percentiles", type: "compute", inputRecords: [1e3, 1e4] },
      { name: "Stage 5: Write Report to S3 Parquet", type: "storage", inputRecords: [1e3, 1e4] },
    ],
    sqlQueries: [
      "SELECT category, date_trunc('month', txn_date) AS month, SUM(revenue) AS revenue FROM sales JOIN products USING (product_id) GROUP BY 1,2",
    ],
  },
  {
    appName: "log-analysis-pipeline",
    jobType: "etl",
    stages: [
      { name: "Stage 0: Read Raw Logs from S3", type: "storage", inputRecords: [1e7, 5e7] },
      { name: "Stage 1: Parse & Extract Fields", type: "compute", inputRecords: [1e7, 5e7] },
      { name: "Stage 2: Enrich with GeoIP", type: "compute", inputRecords: [1e7, 5e7] },
      { name: "Stage 3: Aggregate Error Rates", type: "compute", inputRecords: [1e4, 5e4] },
      { name: "Stage 4: Write Enriched to S3", type: "storage", inputRecords: [1e7, 5e7] },
    ],
  },
  {
    appName: "data-quality-checks",
    jobType: "spark_sql",
    stages: [
      { name: "Stage 0: Profile Source Dataset", type: "storage", inputRecords: [2e6, 1e7] },
      { name: "Stage 1: Run Null Checks", type: "compute", inputRecords: [2e6, 1e7] },
      { name: "Stage 2: Run Referential Integrity", type: "compute", inputRecords: [1e5, 1e6] },
      { name: "Stage 3: Run Statistical Checks", type: "compute", inputRecords: [1e5, 1e6] },
      { name: "Stage 4: Publish DQ Report", type: "storage", inputRecords: [1e2, 1e3] },
    ],
  },
];

const STAGE_TYPE_MAP = {
  storage: { spanType: "storage", subtype: "s3" },
  compute: { spanType: "compute", subtype: "spark" },
  db: { spanType: "db", subtype: "dynamodb" },
  messaging: { spanType: "messaging", subtype: "kinesis" },
};

const EMR_VERSIONS = ["7.1.0", "7.0.0", "6.15.0", "6.14.0", "6.13.0"];
const SPARK_VERSIONS = {
  "7.1.0": "3.5.1",
  "7.0.0": "3.5.0",
  "6.15.0": "3.4.1",
  "6.14.0": "3.4.0",
  "6.13.0": "3.3.2",
};

/**
 * Generates an EMR Spark OTel trace: 1 transaction + 3–10 stage/query spans.
 * @param {string} ts  - ISO timestamp string (job start time)
 * @param {number} er  - error rate 0.0–1.0
 * @returns {Object[]} array of APM documents (transaction first, then spans)
 */
export function generateEmrTrace(ts, er) {
  const cfg = rand(JOB_CONFIGS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const emrVer = rand(EMR_VERSIONS);
  const sparkVer = SPARK_VERSIONS[emrVer];
  const isErr = Math.random() < er;
  const env = rand(["production", "production", "staging"]);

  const clusterId = `j-${randHex(13).toUpperCase()}`;
  const clusterName = `${account.name}-emr-${cfg.jobType}`;
  const stepId = `s-${randHex(13).toUpperCase()}`;
  const appId = `application_${Date.now()}_${randInt(1000, 9999)}`;

  // Total job duration — varies with job type and input size
  const baseDurationMs =
    cfg.jobType === "streaming_sql" ? randInt(30, 120) * 60 * 1000 : randInt(3, 25) * 60 * 1000;
  const totalUs = baseDurationMs * 1000;

  const svcBlock = serviceBlock(cfg.appName, env, "java", "Spark", "OpenJDK", "21.0.3");
  // Override framework to include Spark version
  (svcBlock as Record<string, any>).framework = { name: "Spark", version: sparkVer };

  const { agent, telemetry } = otelBlocks("java", "elastic");

  // ── Root transaction (Spark job / step execution) ────────────────────────────
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `${cfg.appName} [${cfg.jobType.toUpperCase()}]`,
      type: "spark_job",
      duration: { us: totalUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: cfg.stages.length + (cfg.sqlQueries?.length || 0), dropped: 0 },
    },
    service: svcBlock,
    agent: agent,
    telemetry: telemetry,
    cloud: {
      provider: "aws",
      region: region,
      account: { id: account.id, name: account.name },
      service: { name: "emr" },
    },
    labels: {
      emr_cluster_id: clusterId,
      emr_cluster_name: clusterName,
      emr_step_id: stepId,
      spark_app_id: appId,
      emr_version: emrVer,
      spark_version: sparkVer,
      job_type: cfg.jobType,
    },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  // ── Stage spans ──────────────────────────────────────────────────────────────
  const spans: any[] = [];
  let offsetMs = 0;
  const stageShare = 1 / cfg.stages.length;

  cfg.stages.forEach((stage, i) => {
    const stageUs = Math.floor(totalUs * stageShare * randFloat(0.5, 1.4));
    const stageIsErr = isErr && i === cfg.stages.length - 1;
    const stageMap = STAGE_TYPE_MAP[stage.type] || STAGE_TYPE_MAP.compute;
    const inputRecs = randInt(stage.inputRecords[0], stage.inputRecords[1]);
    const shuffleBytes = stage.type === "compute" ? randInt(50, 2000) * 1024 * 1024 : 0; // MB → bytes

    spans.push({
      "@timestamp": offsetTs(new Date(ts), offsetMs),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: newSpanId(),
        type: stageMap.spanType,
        subtype: stageMap.subtype,
        name: stage.name,
        duration: { us: stageUs },
        action: stage.type === "storage" ? rand(["read", "write"]) : "execute",
      },
      labels: {
        spark_stage_id: String(i),
        spark_stage_attempt: "0",
        spark_input_records: String(inputRecs),
        spark_output_records: String(Math.floor(inputRecs * randFloat(0.3, 1.1))),
        ...(shuffleBytes ? { spark_shuffle_bytes_written: String(shuffleBytes) } : {}),
      },
      event: { outcome: stageIsErr ? "failure" : "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    });

    offsetMs += stageUs / 1000 + randInt(100, 2000);
  });

  // ── SparkSQL query spans (for SQL job types) ────────────────────────────────
  if (cfg.sqlQueries?.length) {
    for (const sql of cfg.sqlQueries) {
      const queryUs = randInt(5, 60) * 1000 * 1000; // 5–60 seconds in µs
      spans.push({
        "@timestamp": offsetTs(new Date(ts), randInt(0, baseDurationMs * 0.8)),
        processor: { name: "transaction", event: "span" },
        trace: { id: traceId },
        transaction: { id: txId },
        parent: { id: txId },
        span: {
          id: newSpanId(),
          type: "db",
          subtype: "spark_sql",
          name: `SparkSQL: ${sql.substring(0, 60)}${sql.length > 60 ? "…" : ""}`,
          duration: { us: queryUs },
          action: "query",
          db: { type: "sql", statement: sql },
        },
        event: { outcome: "success" },
        data_stream: { type: "traces", dataset: "apm", namespace: "default" },
      });
    }
  }

  return [txDoc, ...spans];
}
