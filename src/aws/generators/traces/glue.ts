/**
 * AWS Glue ETL OTel trace generator.
 *
 * Simulates Glue jobs instrumented with the EDOT Java agent. Each trace
 * represents one job run (transaction) with 3–6 phase spans covering
 * extract, transform, load, and validate stages.
 *
 * Real-world instrumentation path:
 *   Glue job (Python Shell / ETL) + EDOT Java agent
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
  randFloat,
  offsetTs,
  serviceBlock,
  otelBlocks,
} from "./helpers.js";

// ─── Job configurations ───────────────────────────────────────────────────────
const JOB_CONFIGS = [
  {
    jobName: "customer-data-etl",
    jobType: "PYTHON_SHELL",
    language: "python",
    framework: null,
    runtimeName: "CPython",
    runtimeVersion: "3.9.18",
    phases: [
      { name: "ExtractCustomerRecords", type: "extract", loadSubtype: null },
      { name: "TransformAndNormalise", type: "transform", loadSubtype: null },
      { name: "ValidateSchema", type: "validate", loadSubtype: null },
      { name: "LoadToRedshift", type: "load", loadSubtype: "redshift" },
    ],
  },
  {
    jobName: "product-catalogue-sync",
    jobType: "ETL",
    language: "python",
    framework: null,
    runtimeName: "CPython",
    runtimeVersion: "3.10.14",
    phases: [
      { name: "ExtractProductFeed", type: "extract", loadSubtype: null },
      { name: "DeduplicateRecords", type: "transform", loadSubtype: null },
      { name: "EnrichWithMetadata", type: "transform", loadSubtype: null },
      { name: "LoadToDynamoDB", type: "load", loadSubtype: "dynamodb" },
      { name: "ValidateLoadCount", type: "validate", loadSubtype: null },
    ],
  },
  {
    jobName: "clickstream-aggregator",
    jobType: "ETL",
    language: "python",
    framework: null,
    runtimeName: "CPython",
    runtimeVersion: "3.10.14",
    phases: [
      { name: "ExtractClickEvents", type: "extract", loadSubtype: null },
      { name: "SessioniseEvents", type: "transform", loadSubtype: null },
      { name: "AggregateByPage", type: "transform", loadSubtype: null },
      { name: "WriteAggregateParquet", type: "load", loadSubtype: "s3" },
    ],
  },
  {
    jobName: "compliance-report-generator",
    jobType: "PYTHON_SHELL",
    language: "python",
    framework: null,
    runtimeName: "CPython",
    runtimeVersion: "3.9.18",
    phases: [
      { name: "ExtractAuditLogs", type: "extract", loadSubtype: null },
      { name: "FilterSensitiveFields", type: "transform", loadSubtype: null },
      { name: "ValidateComplianceRules", type: "validate", loadSubtype: null },
      { name: "ExportReportToS3", type: "load", loadSubtype: "s3" },
    ],
  },
  {
    jobName: "data-quality-validator",
    jobType: "ETL",
    language: "python",
    framework: null,
    runtimeName: "CPython",
    runtimeVersion: "3.10.14",
    phases: [
      { name: "ExtractSampleDataset", type: "extract", loadSubtype: null },
      { name: "RunNullChecks", type: "validate", loadSubtype: null },
      { name: "RunRangeChecks", type: "validate", loadSubtype: null },
      { name: "RunReferentialIntegrity", type: "validate", loadSubtype: null },
      { name: "WriteQualityReport", type: "load", loadSubtype: "s3" },
    ],
  },
];

// Phase span type/subtype/action mapping
const PHASE_PROPS = {
  extract: { type: "storage", subtype: "s3", action: "read", durationMs: [500, 8000] },
  transform: { type: "compute", subtype: "glue", action: "execute", durationMs: [1000, 30000] },
  load: { type: "storage", subtype: null, action: "write", durationMs: [800, 15000] },
  validate: { type: "compute", subtype: "glue", action: "execute", durationMs: [200, 4000] },
};

const LOAD_SUBTYPES = { s3: "s3", dynamodb: "dynamodb", redshift: "redshift" };

function buildGluePhaseSpan(traceId, txId, parentId, ts, phase, isErr, spanOffsetMs) {
  const id = newSpanId();
  const baseProps = PHASE_PROPS[phase.type] || PHASE_PROPS.transform;
  const durationUs = randInt(baseProps.durationMs[0], baseProps.durationMs[1]) * 1000;

  const subtype =
    phase.type === "load" ? LOAD_SUBTYPES[phase.loadSubtype] || "s3" : baseProps.subtype;

  return {
    "@timestamp": offsetTs(new Date(ts), spanOffsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: parentId },
    span: {
      id: id,
      type: baseProps.type,
      subtype: subtype,
      name: `Glue.${phase.name}`,
      duration: { us: durationUs },
      action: baseProps.action,
      destination: { service: { resource: subtype, type: baseProps.type, name: subtype } },
    },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };
}

/**
 * Generates a Glue ETL OTel trace: 1 transaction (job run) + 3–6 phase spans.
 * @param {string} ts  - ISO timestamp string (base time for the job run)
 * @param {number} er  - error rate 0.0–1.0
 * @returns {Object[]} array of APM documents (transaction first, then spans)
 */
export function generateGlueTrace(ts, er) {
  const cfg = rand(JOB_CONFIGS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "production", "staging", "dev"]);
  const isErr = Math.random() < er;

  const jobRunId = `jr_${randHex(32)}`;
  const dpuHours = randFloat(0.1, 10.0, 2);
  const totalUs = randInt(5000, 120000) * 1000; // Glue jobs are long-running

  const svcBlock = serviceBlock(
    cfg.jobName,
    env,
    cfg.language,
    cfg.framework,
    cfg.runtimeName,
    cfg.runtimeVersion
  );

  const { agent, telemetry } = otelBlocks(cfg.language, "elastic");

  // ── Root transaction (job run) ───────────────────────────────────────────────
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `${cfg.jobName} [${cfg.jobType}]`,
      type: "glue_job",
      duration: { us: totalUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: cfg.phases.length, dropped: 0 },
    },
    labels: {
      glue_job_name: cfg.jobName,
      glue_job_run_id: jobRunId,
      glue_job_type: cfg.jobType,
      glue_dpu_hours: String(dpuHours),
    },
    service: svcBlock,
    agent: agent,
    telemetry: telemetry,
    cloud: {
      provider: "aws",
      region: region,
      account: { id: account.id, name: account.name },
      service: { name: "glue" },
    },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  // ── Child spans (job phases) ─────────────────────────────────────────────────
  const spans: any[] = [];
  let spanOffsetMs = randInt(50, 200);

  for (let i = 0; i < cfg.phases.length; i++) {
    const phase = cfg.phases[i];
    const spanIsErr = isErr && i === cfg.phases.length - 1;
    const baseProps = PHASE_PROPS[phase.type] || PHASE_PROPS.transform;
    const durationUs = randInt(baseProps.durationMs[0], baseProps.durationMs[1]) * 1000;

    spans.push(buildGluePhaseSpan(traceId, txId, txId, ts, phase, spanIsErr, spanOffsetMs));

    spanOffsetMs += durationUs / 1000 + randInt(10, 100);
  }

  return [txDoc, ...spans];
}
