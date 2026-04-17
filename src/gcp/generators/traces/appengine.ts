import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

const APPS = ["globex-web", "globex-admin", "globex-api"];

export function generateAppEngineTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const app = rand(APPS);
  const base = new Date(ts);
  const env = rand(["production", "staging", "dev"]);
  const otel = gcpOtelMeta("python");
  const svc = gcpServiceBase(app, env, "python", {
    framework: "App Engine standard",
    runtimeName: "python",
    runtimeVersion: "3.12",
  });
  const cloudAe = gcpCloud(region, project, "appengine.googleapis.com");

  const fsUs = randInt(1500, 95_000);
  const mcUs = randInt(400, 35_000);
  const tqUs = randInt(1200, 55_000);
  const bqUs = randInt(4000, 220_000);

  const failIdx = isErr ? randInt(0, 3) : -1;
  let offsetMs = 0;

  const s1 = randSpanId();
  const s2 = randSpanId();
  const s3 = randSpanId();
  const s4 = randSpanId();

  const spanFs: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: s1,
      type: "db",
      subtype: "firestore",
      name: `Firestore.${rand(["getDocument", "runQuery", "writeDocument"])}`,
      duration: { us: fsUs },
      action: "query",
      db: {
        type: "nosql",
        statement: `${rand(["get", "query", "update"])} ${rand(["profiles", "sessions", "preferences"])}/*`,
      },
      destination: { service: { resource: "firestore", type: "db", name: "firestore" } },
      labels: failIdx === 0 ? { "gcp.rpc.status_code": "PERMISSION_DENIED" } : {},
    },
    service: svc,
    cloud: gcpCloud(region, project, "firestore.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: failIdx === 0 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s1),
  };
  offsetMs += Math.max(1, Math.round(fsUs / 1000));

  const spanMc: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: s2,
      type: "db",
      subtype: "memcache",
      name: `Memcache ${rand(["get", "set", "delete", "incr"])}`,
      duration: { us: mcUs },
      action: "query",
      db: {
        type: "memcached",
        statement: rand(["GET session:id", "SET rate:user", "DELETE cart:tmp"]),
      },
      destination: { service: { resource: "memcache", type: "db", name: "memcache" } },
      labels: failIdx === 1 ? { "gcp.rpc.status_code": "DEADLINE_EXCEEDED" } : {},
    },
    service: svc,
    cloud: cloudAe,
    data_stream: APM_DS,
    event: { outcome: failIdx === 1 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s2),
  };
  offsetMs += Math.max(1, Math.round(mcUs / 1000));

  const spanTq: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: s3,
      type: "messaging",
      subtype: "cloud_tasks",
      name: `CloudTasks.${rand(["createTask", "runTask"])} ${rand(["email-queue", "billing-queue"])}`,
      duration: { us: tqUs },
      action: "send",
      destination: { service: { resource: "cloudtasks", type: "messaging", name: "cloudtasks" } },
      labels: failIdx === 2 ? { "gcp.rpc.status_code": "RESOURCE_EXHAUSTED" } : {},
    },
    service: svc,
    cloud: gcpCloud(region, project, "cloudtasks.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: failIdx === 2 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s3),
  };
  offsetMs += Math.max(1, Math.round(tqUs / 1000));

  const spanBq: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: s4,
      type: "db",
      subtype: "bigquery",
      name: "BigQuery.queryJob reporting.user_facts",
      duration: { us: bqUs },
      action: "execute",
      db: { type: "sql", statement: "SELECT ... FROM `reporting.user_facts` WHERE ..." },
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

  const totalUs = fsUs + mcUs + tqUs + bqUs + randInt(300, 6000) * 1000;
  const txErr = failIdx >= 0;

  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `${rand(["GET", "POST"])} ${rand(["/home", "/account", "/api/session"])}`,
      type: "request",
      duration: { us: totalUs },
      result: txErr ? "HTTP 5xx" : "HTTP 2xx",
      sampled: true,
      span_count: { started: 4, dropped: 0 },
    },
    service: svc,
    cloud: cloudAe,
    labels: { "gcp.project_id": project.id, "gcp.app_engine.service": app },
    data_stream: APM_DS,
    event: { outcome: txErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, spanFs, spanMc, spanTq, spanBq];
}
