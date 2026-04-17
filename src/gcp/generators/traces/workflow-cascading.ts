import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

export function generateCascadingFailureTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const otel = gcpOtelMeta("go");
  const apiGw = gcpServiceBase("api-gateway", env, "go", {
    framework: "API Gateway",
    runtimeName: "go",
    runtimeVersion: "1.22",
  });
  const orders = gcpServiceBase("orders-api", env, "go", {
    framework: "Cloud Run",
    runtimeName: "go",
    runtimeVersion: "1.22",
  });

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
    service: orders,
    cloud: gcpCloud(region, project, "run.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, sRun),
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
      labels: isErr
        ? { "gcp.rpc.status_code": "DEADLINE_EXCEEDED", "gcp.sql.timeout_ms": "30000" }
        : {},
    },
    service: orders,
    cloud: gcpCloud(region, project, "sqladmin.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, sSql),
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
      action: "send",
      destination: { service: { resource: "pubsub", type: "messaging", name: "pubsub" } },
    },
    service: orders,
    cloud: gcpCloud(region, project, "pubsub.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, sPub),
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
    service: orders,
    cloud: gcpCloud(region, project, "clouderrorreporting.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, sErr),
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
    service: apiGw,
    cloud: gcpCloud(region, project, "apigateway.googleapis.com"),
    labels: { "gcp.workflow": "cascading_failure" },
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, spanRun, spanSql, spanPub, spanErrReport];
}
