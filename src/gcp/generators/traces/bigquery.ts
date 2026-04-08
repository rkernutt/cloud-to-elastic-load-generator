/**
 * BigQuery OTel trace: query planning → stage execution (2–3 stages) → result write.
 */

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

const APM_AGENT = { name: "opentelemetry/nodejs", version: "1.x" } as const;
const APM_DS = { type: "traces", dataset: "apm", namespace: "default" } as const;

export function generateBigQueryTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging", "dev"]);
  const dataset = randBigQueryDataset();
  const table = randBigQueryTable();

  const planUs = randInt(5000, 120_000);
  const stageCount = randInt(2, 3);
  const stageUs = Array.from({ length: stageCount }, () => randInt(20_000, 900_000));
  const writeUs = randInt(8000, 250_000);

  const failIdx = isErr ? randInt(-1, stageCount) : -1; // -1=plan, 0..stageCount-1=stages (commit write separate)

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
    },
    service: { name: "analytics-queries", environment: env, language: { name: "sql" } },
    cloud: gcpCloud(region, project, "bigquery.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failIdx === -1 ? "failure" : "success" },
  };
  offsetMs += Math.max(1, Math.round(planUs / 1000));

  const stageSpans: EcsDocument[] = [];
  let parentId = sPlan;
  for (let i = 0; i < stageCount; i++) {
    const sid = randSpanId();
    const us = stageUs[i];
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
      },
      service: { name: "analytics-queries", environment: env, language: { name: "sql" } },
      cloud: gcpCloud(region, project, "bigquery.googleapis.com"),
      agent: APM_AGENT,
      data_stream: APM_DS,
      event: { outcome: stageErr ? "failure" : "success" },
    });
    offsetMs += Math.max(1, Math.round(us / 1000));
    parentId = sid;
  }

  const sWrite = randSpanId();
  const writeErr = failIdx === stageCount; // when isErr, allow failing write
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
    },
    service: { name: "analytics-queries", environment: env, language: { name: "sql" } },
    cloud: gcpCloud(region, project, "bigquery.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: writeErr ? "failure" : "success" },
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
    service: { name: "analytics-queries", environment: env, language: { name: "sql" } },
    cloud: gcpCloud(region, project, "bigquery.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: txErr ? "failure" : "success" },
  };

  return [txDoc, spanPlan, ...stageSpans, spanWrite];
}
