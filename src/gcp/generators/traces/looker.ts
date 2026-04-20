import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

export function generateLookerTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const explore = rand(["orders", "customers", "inventory"]);
  const otel = gcpOtelMeta("nodejs");
  const svc = gcpServiceBase("looker-api", env, "nodejs", {
    framework: "Express",
    runtimeName: "nodejs",
    runtimeVersion: "20.x",
  });
  const cloud = gcpCloud(region, project, "looker.googleapis.com");

  const u1 = randInt(1_000, 55_000);
  const u2 = randInt(2_000, 120_000);
  const u3 = randInt(1_500, 95_000);
  const u4 = randInt(5_000, 900_000) * (isErr ? randInt(2, 5) : 1);
  const u5 = randInt(800, 65_000);

  const failIdx = isErr ? randInt(0, 4) : -1;
  let offsetMs = 0;

  const s1 = randSpanId();
  const spanQuery: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: s1,
      type: "request",
      subtype: "http",
      name: `Looker.runQuery explore:${explore}`,
      duration: { us: u1 },
      action: "receive",
      destination: { service: { resource: "looker_query", type: "request", name: "looker_query" } },
      labels: failIdx === 0 ? { "gcp.rpc.status_code": "INVALID_ARGUMENT" } : {},
    },
    service: svc,
    cloud,
    data_stream: APM_DS,
    event: { outcome: failIdx === 0 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s1),
  };
  offsetMs += Math.max(1, Math.round(u1 / 1000));

  const s2 = randSpanId();
  const spanLookml: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s1 },
    span: {
      id: s2,
      type: "app",
      subtype: "looker",
      name: "Looker.compileLookML",
      duration: { us: u2 },
      action: "process",
      destination: { service: { resource: "lookml", type: "app", name: "lookml" } },
      labels: failIdx === 1 ? { "gcp.looker.error": "lookml_parse" } : {},
    },
    service: svc,
    cloud,
    data_stream: APM_DS,
    event: { outcome: failIdx === 1 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s2),
  };
  offsetMs += Math.max(1, Math.round(u2 / 1000));

  const s3 = randSpanId();
  const spanSql: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s2 },
    span: {
      id: s3,
      type: "db",
      subtype: "sql",
      name: "Looker.generateSql",
      duration: { us: u3 },
      action: "query",
      destination: { service: { resource: "sql_generator", type: "db", name: "sql_generator" } },
      labels: failIdx === 2 ? { "gcp.looker.error": "sql_generation" } : {},
    },
    service: svc,
    cloud,
    data_stream: APM_DS,
    event: { outcome: failIdx === 2 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s3),
  };
  offsetMs += Math.max(1, Math.round(u3 / 1000));

  const s4 = randSpanId();
  const spanDb: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s3 },
    span: {
      id: s4,
      type: "db",
      subtype: "bigquery",
      name: "BigQuery.job.query",
      duration: { us: u4 },
      action: "query",
      destination: { service: { resource: "bigquery", type: "db", name: "bigquery" } },
      labels: failIdx === 3 ? { "gcp.rpc.status_code": "DEADLINE_EXCEEDED" } : {},
    },
    service: svc,
    cloud: gcpCloud(region, project, "bigquery.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: failIdx === 3 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s4),
  };
  offsetMs += Math.max(1, Math.round(u4 / 1000));

  const s5 = randSpanId();
  const spanRender: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s4 },
    span: {
      id: s5,
      type: "app",
      subtype: "looker",
      name: "Looker.renderVisualization",
      duration: { us: u5 },
      action: "process",
      destination: { service: { resource: "looker_render", type: "app", name: "looker_render" } },
      labels: failIdx === 4 ? { "gcp.rpc.status_code": "INTERNAL" } : {},
    },
    service: svc,
    cloud,
    data_stream: APM_DS,
    event: { outcome: failIdx === 4 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s5),
  };

  const totalUs = u1 + u2 + u3 + u4 + u5 + randInt(300, 4000) * 1000;
  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `Looker dashboard query (${explore})`,
      type: "request",
      duration: { us: totalUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: 5, dropped: 0 },
    },
    service: svc,
    cloud,
    labels: { "gcp.looker.explore": explore },
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, spanQuery, spanLookml, spanSql, spanDb, spanRender];
}
