/**
 * Multi-service trace: API Gateway → Cloud Run → Cloud SQL, with DLQ and Error Reporting on failure paths.
 */

import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";

const APM_AGENT = { name: "opentelemetry/nodejs", version: "1.x" } as const;
const APM_DS = { type: "traces", dataset: "apm", namespace: "default" } as const;

export function generateCascadingFailureTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);

  const runUs = isErr ? randInt(120_000, 900_000) : randInt(8000, 120_000);
  const sqlUs = isErr ? randInt(8_000_000, 35_000_000) : randInt(4000, 180_000);
  const pubUs = randInt(2000, 95_000);
  const errUs = randInt(1500, 55_000);

  const sRun = randSpanId();
  const sSql = randSpanId();
  const sPub = randSpanId();
  const sErr = randSpanId();

  let offsetMs = 0;

  const spanRun: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: sRun,
      type: "request",
      subtype: "cloud_run",
      name: isErr ? "Cloud Run.invoke (retries_exhausted_upstream_ok)" : "Cloud Run.invoke",
      duration: { us: runUs },
      action: "invoke",
      destination: { service: { resource: "run", type: "request", name: "run" } },
    },
    service: {
      name: "orders-api",
      environment: env,
      language: { name: "go" },
      runtime: { name: "go", version: "1.22" },
      framework: { name: "Cloud Run" },
    },
    cloud: gcpCloud(region, project, "run.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: "success" },
  };
  offsetMs += Math.max(1, Math.round(runUs / 1000));

  const spanSql: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: sRun },
    span: {
      id: sSql,
      type: "db",
      subtype: "postgresql",
      name: isErr ? "Cloud SQL.query timeout" : "Cloud SQL.query",
      duration: { us: sqlUs },
      action: "query",
      db: {
        type: "sql",
        statement: "SELECT * FROM order_lines WHERE order_id = $1 FOR UPDATE",
      },
      destination: { service: { resource: "cloudsql", type: "db", name: "cloudsql" } },
    },
    service: {
      name: "orders-api",
      environment: env,
      language: { name: "go" },
      runtime: { name: "go", version: "1.22" },
      framework: { name: "Cloud Run" },
    },
    cloud: gcpCloud(region, project, "sqladmin.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
  };
  offsetMs += Math.max(1, Math.round(sqlUs / 1000));

  const pubName = isErr
    ? "PubSub.publish_dlq orders-timeout-dlq"
    : `PubSub.publish ${rand(["order_events", "audit_stream"])}`;

  const spanPub: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: sSql },
    span: {
      id: sPub,
      type: "messaging",
      subtype: "pubsub",
      name: pubName,
      duration: { us: pubUs },
      action: isErr ? "send" : "send",
      destination: { service: { resource: "pubsub", type: "messaging", name: "pubsub" } },
    },
    service: {
      name: "orders-api",
      environment: env,
      language: { name: "go" },
      runtime: { name: "go", version: "1.22" },
      framework: { name: "Cloud Run" },
    },
    cloud: gcpCloud(region, project, "pubsub.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: "success" },
  };
  offsetMs += Math.max(1, Math.round(pubUs / 1000));

  const errName = isErr ? "ErrorReporting.report_exception" : "ErrorReporting.batch_flush";

  const spanErrReport: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: sPub },
    span: {
      id: sErr,
      type: "external",
      subtype: "http",
      name: errName,
      duration: { us: errUs },
      action: "call",
      destination: {
        service: { resource: "clouderrorreporting", type: "external", name: "clouderrorreporting" },
      },
    },
    service: {
      name: "orders-api",
      environment: env,
      language: { name: "go" },
      runtime: { name: "go", version: "1.22" },
      framework: { name: "Cloud Run" },
    },
    cloud: gcpCloud(region, project, "clouderrorreporting.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: "success" },
  };

  const totalUs = runUs + sqlUs + pubUs + errUs + randInt(1000, 8000) * 1000;

  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `${rand(["GET", "POST"])} /v1/orders/${rand(["checkout", "allocate", "status"])}`,
      type: "request",
      duration: { us: totalUs },
      result: isErr ? "HTTP 504" : "HTTP 2xx",
      sampled: true,
      span_count: { started: 4, dropped: 0 },
    },
    service: {
      name: "api-gateway",
      environment: env,
      language: { name: "go" },
      runtime: { name: "go", version: "1.22" },
      framework: { name: "API Gateway" },
    },
    cloud: gcpCloud(region, project, "apigateway.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
  };

  return [txDoc, spanRun, spanSql, spanPub, spanErrReport];
}
