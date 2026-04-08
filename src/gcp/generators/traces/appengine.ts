/**
 * App Engine OTel trace: HTTP request → Firestore → Memcache → Cloud Tasks.
 */

import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";

const APM_AGENT = { name: "opentelemetry/nodejs", version: "1.x" } as const;
const APM_DS = { type: "traces", dataset: "apm", namespace: "default" } as const;

const APPS = ["globex-web", "globex-admin", "globex-api"];

export function generateAppEngineTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const app = rand(APPS);
  const base = new Date(ts);
  const env = rand(["production", "staging", "dev"]);
  let offsetMs = 0;

  const fsUs = randInt(1500, 95_000);
  const mcUs = randInt(400, 35_000);
  const tqUs = randInt(1200, 55_000);

  const failIdx = isErr ? randInt(0, 2) : -1;
  const fsErr = failIdx === 0;
  const mcErr = failIdx === 1;
  const tqErr = failIdx === 2;

  const s1 = randSpanId();
  const s2 = randSpanId();
  const s3 = randSpanId();

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
    },
    service: {
      name: app,
      environment: env,
      language: { name: "python" },
      runtime: { name: "python", version: "3.12" },
      framework: { name: "App Engine standard" },
    },
    cloud: gcpCloud(region, project, "appengine.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: fsErr ? "failure" : "success" },
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
    },
    service: {
      name: app,
      environment: env,
      language: { name: "python" },
      runtime: { name: "python", version: "3.12" },
      framework: { name: "App Engine standard" },
    },
    cloud: gcpCloud(region, project, "appengine.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: mcErr ? "failure" : "success" },
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
    },
    service: {
      name: app,
      environment: env,
      language: { name: "python" },
      runtime: { name: "python", version: "3.12" },
      framework: { name: "App Engine standard" },
    },
    cloud: gcpCloud(region, project, "appengine.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: tqErr ? "failure" : "success" },
  };

  const totalUs = fsUs + mcUs + tqUs + randInt(300, 6000) * 1000;
  const txErr = fsErr || mcErr || tqErr;

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
      span_count: { started: 3, dropped: 0 },
    },
    service: {
      name: app,
      environment: env,
      language: { name: "python" },
      runtime: { name: "python", version: "3.12" },
      framework: { name: "App Engine standard" },
    },
    cloud: gcpCloud(region, project, "appengine.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: txErr ? "failure" : "success" },
  };

  return [txDoc, spanFs, spanMc, spanTq];
}
