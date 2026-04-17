import type { EcsDocument } from "../helpers.js";
import {
  rand,
  randInt,
  gcpCloud,
  makeGcpSetup,
  randBigQueryDataset,
  randBigQueryTable,
  randTraceId,
  randSpanId,
} from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

export function generateBigQueryTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging", "dev"]);
  const dataset = randBigQueryDataset();
  const table = randBigQueryTable();
  const otel = gcpOtelMeta("java");
  const svc = gcpServiceBase("analytics-queries", env, "java", {
    framework: "Apache Beam",
    runtimeName: "java",
    runtimeVersion: "17",
  });

  const planUs = randInt(5000, 120_000);
  const stageCount = randInt(2, 3);
  const stageUs = Array.from({ length: stageCount }, () => randInt(20_000, 900_000));
  const writeUs = randInt(8000, 250_000);

  const failIdx = isErr ? randInt(-1, stageCount) : -1;

  let offsetMs = 0;
  const sPlan = randSpanId();

  const spanPlan: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: sPlan,
      type: "db",
      subtype: "bigquery",
      name: "BigQuery job.create query planning",
      duration: { us: planUs },
      action: "plan",
      db: {
        type: "sql",
        statement: `SELECT ... FROM \`${project.id}.${dataset}.${table}\` WHERE ...`,
      },
      destination: { service: { resource: "bigquery", type: "db", name: "bigquery" } },
      labels: failIdx === -1 ? { "gcp.rpc.status_code": "INVALID_ARGUMENT" } : {},
    },
    service: svc,
    cloud: gcpCloud(region, project, "bigquery.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: failIdx === -1 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, sPlan),
  };
  offsetMs += Math.max(1, Math.round(planUs / 1000));

  const stageSpans: EcsDocument[] = [];
  let parentId = sPlan;
  for (let i = 0; i < stageCount; i++) {
    const sid = randSpanId();
    const us = stageUs[i]!;
    const stageErr = failIdx === i;
    stageSpans.push({
      "@timestamp": offsetTs(base, offsetMs),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: parentId },
      span: {
        id: sid,
        type: "db",
        subtype: "bigquery",
        name: `BigQuery stage ${i + 1} ${rand(["shuffle", "aggregate", "join", "scan"])}`,
        duration: { us },
        action: "execute",
        db: {
          type: "sql",
          statement: `/* stage ${i + 1} */ EXECUTE ON ${rand(["slot-pool", "reservation"])}`,
        },
        destination: { service: { resource: "bigquery", type: "db", name: "bigquery" } },
        labels: stageErr ? { "gcp.rpc.status_code": "RESOURCE_EXHAUSTED" } : {},
      },
      service: svc,
      cloud: gcpCloud(region, project, "bigquery.googleapis.com"),
      data_stream: APM_DS,
      event: { outcome: stageErr ? "failure" : "success" },
      ...otel,
      ...gcpCloudTraceMeta(project.id, traceId, sid),
    });
    offsetMs += Math.max(1, Math.round(us / 1000));
    parentId = sid;
  }

  const sWrite = randSpanId();
  const writeErr = failIdx === stageCount;
  const spanWrite: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: parentId },
    span: {
      id: sWrite,
      type: "storage",
      subtype: "gcs",
      name: "BigQuery export.writeResults",
      duration: { us: writeUs },
      action: "write",
      destination: { service: { resource: "gcs", type: "storage", name: "gcs" } },
      labels: writeErr ? { "gcp.rpc.status_code": "DEADLINE_EXCEEDED" } : {},
    },
    service: svc,
    cloud: gcpCloud(region, project, "bigquery.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: writeErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, sWrite),
  };

  const totalUs =
    planUs + stageUs.reduce((a, b) => a + b, 0) + writeUs + randInt(2000, 10_000) * 1000;
  const txErr = isErr;

  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `BigQuery ${dataset}.${table}`,
      type: "request",
      duration: { us: totalUs },
      result: txErr ? "failure" : "success",
      sampled: true,
      span_count: { started: 2 + stageCount, dropped: 0 },
    },
    service: svc,
    cloud: gcpCloud(region, project, "bigquery.googleapis.com"),
    labels: {
      "gcp.bigquery.dataset": dataset,
      "gcp.bigquery.table": table,
    },
    data_stream: APM_DS,
    event: { outcome: txErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, spanPlan, ...stageSpans, spanWrite];
}
