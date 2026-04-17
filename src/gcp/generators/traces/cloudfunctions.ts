import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

const FN_CONFIGS = [
  {
    name: "checkout-webhook",
    lang: "nodejs" as const,
    runtime: "nodejs20",
    trigger: "http" as const,
    deps: ["firestore", "pubsub", "http"] as const,
  },
  {
    name: "inventory-sync",
    lang: "python" as const,
    runtime: "python312",
    trigger: "pubsub" as const,
    deps: ["firestore", "gcs", "pubsub"] as const,
  },
  {
    name: "user-notifications",
    lang: "nodejs" as const,
    runtime: "nodejs20",
    trigger: "pubsub" as const,
    deps: ["pubsub", "firestore", "http"] as const,
  },
  {
    name: "payment-validator",
    lang: "java" as const,
    runtime: "java21",
    trigger: "http" as const,
    deps: ["http", "firestore", "pubsub"] as const,
  },
  {
    name: "catalog-enricher",
    lang: "go" as const,
    runtime: "go122",
    trigger: "storage" as const,
    deps: ["gcs", "bigquery", "pubsub"] as const,
  },
];

const RT = {
  nodejs20: { lang: "nodejs" as const, ver: "20.15.1" },
  python312: { lang: "python" as const, ver: "3.12.3" },
  java21: { lang: "java" as const, ver: "21.0.3" },
  go122: { lang: "go" as const, ver: "1.22.5" },
};

function depSpan(
  traceId: string,
  txId: string,
  parentId: string,
  ts: string,
  offsetMs: number,
  dep: string,
  isErr: boolean,
  spanUs: number,
  svc: ReturnType<typeof gcpServiceBase>,
  otel: ReturnType<typeof gcpOtelMeta>,
  cloud: Record<string, unknown>,
  projectId: string
): EcsDocument {
  const id = randSpanId();
  const shapes: Record<
    string,
    {
      type: string;
      subtype: string;
      name: string;
      action: string;
      dest: string;
      db?: Record<string, unknown>;
      labels?: Record<string, string>;
    }
  > = {
    firestore: {
      type: "db",
      subtype: "firestore",
      name: `Firestore.${rand(["getDocument", "runQuery", "batchGet", "commit"])}`,
      action: "query",
      dest: "firestore",
      db: {
        type: "nosql",
        statement: `${rand(["get", "query"])} ${rand(["users", "orders", "sessions", "carts"])}/*`,
      },
      labels: { "gcp.rpc.status_code": isErr ? "PERMISSION_DENIED" : "OK" },
    },
    pubsub: {
      type: "messaging",
      subtype: "pubsub",
      name: `PubSub.${rand(["publish", "publishBatch", "acknowledge"])}`,
      action: "send",
      dest: "pubsub",
      labels: {
        "gcp.pubsub.topic": rand(["order-events", "notifications", "audit"]),
        ...(isErr ? { "gcp.rpc.status_code": "RESOURCE_EXHAUSTED" } : {}),
      },
    },
    gcs: {
      type: "storage",
      subtype: "gcs",
      name: `GCS.${rand(["GetObject", "ComposeObject", "RewriteObject"])}`,
      action: "call",
      dest: "gcs",
      labels: { bucket: rand(["assets", "data-lake", "tmp-uploads"]) },
    },
    http: {
      type: "external",
      subtype: "http",
      name: `HTTP ${rand(["GET", "POST"])} ${rand(["payments.api", "auth.idp", "tax.vendor"])}`,
      action: "call",
      dest: "external",
      labels: isErr ? { "gcp.rpc.status_code": "DEADLINE_EXCEEDED" } : {},
    },
    bigquery: {
      type: "db",
      subtype: "bigquery",
      name: `BigQuery.${rand(["insertAll", "queryJob", "getQueryResults"])}`,
      action: "query",
      dest: "bigquery",
      db: {
        type: "sql",
        statement: "INSERT INTO `analytics.events` SELECT ...",
      },
      labels: isErr ? { "gcp.rpc.status_code": "DEADLINE_EXCEEDED" } : {},
    },
  };
  const sh = shapes[dep] ?? shapes.firestore;
  return {
    "@timestamp": offsetTs(new Date(ts), offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: parentId },
    span: {
      id,
      type: sh.type,
      subtype: sh.subtype,
      name: sh.name,
      duration: { us: spanUs },
      action: sh.action,
      ...(sh.db ? { db: sh.db } : {}),
      ...(sh.labels ? { labels: sh.labels } : {}),
      destination: { service: { resource: sh.dest, type: sh.type, name: sh.dest } },
    },
    service: svc,
    cloud,
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(projectId, traceId, id),
  };
}

export function generateCloudFunctionsTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const cfg = rand(FN_CONFIGS);
  const rt = RT[cfg.runtime as keyof typeof RT];
  const otel = gcpOtelMeta(rt.lang);
  const env = rand(["production", "production", "staging", "dev"]);
  const coldStart = Math.random() < 0.1;
  const base = new Date(ts);
  const cloudFn = gcpCloud(region, project, "cloudfunctions.googleapis.com");
  const svc = gcpServiceBase(cfg.name, env, rt.lang, {
    framework: "Google Cloud Functions",
    runtimeName: rt.lang,
    runtimeVersion: rt.ver,
  });

  const initUs = coldStart ? randInt(200, 2200) * 1000 : 0;
  const execUs = randInt(25, 3800) * 1000;
  const totalUs = initUs + execUs + randInt(400, 9000) * 1000;

  const executionId = `${randTraceId().slice(0, 8)}-${randSpanId()}`;
  const triggerMap = {
    http: "http",
    pubsub: "pubsub",
    storage: "datastore",
  } as const;

  const spanDocs: EcsDocument[] = [];
  let offsetMs = 0;

  if (coldStart) {
    const sid = randSpanId();
    spanDocs.push({
      "@timestamp": ts,
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sid,
        type: "app",
        subtype: "cold-start",
        name: `Cloud Functions init ${cfg.name}`,
        duration: { us: initUs },
        action: "init",
        labels: { "gcp.cloudfunctions.execution_id": executionId },
      },
      service: svc,
      cloud: cloudFn,
      data_stream: APM_DS,
      event: { outcome: "success" },
      ...otel,
      ...gcpCloudTraceMeta(project.id, traceId, sid),
    });
    offsetMs += Math.max(1, Math.round(initUs / 1000));
  }

  if (cfg.trigger === "pubsub") {
    const sid = randSpanId();
    const pubUs = randInt(800, 35_000);
    spanDocs.push({
      "@timestamp": offsetTs(base, offsetMs),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sid,
        type: "messaging",
        subtype: "pubsub",
        name: "PubSub.pushDelivery handler",
        duration: { us: pubUs },
        action: "receive",
        labels: { "gcp.pubsub.subscription": `${cfg.name}-sub` },
        destination: { service: { resource: "pubsub", type: "messaging", name: "pubsub" } },
      },
      service: svc,
      cloud: gcpCloud(region, project, "pubsub.googleapis.com"),
      data_stream: APM_DS,
      event: { outcome: "success" },
      ...otel,
      ...gcpCloudTraceMeta(project.id, traceId, sid),
    });
    offsetMs += Math.max(1, Math.round(pubUs / 1000));
  }

  const usEach = Math.floor(execUs / Math.max(1, cfg.deps.length));
  for (let i = 0; i < cfg.deps.length; i++) {
    const dep = cfg.deps[i]!;
    const spanUs = randInt(Math.floor(usEach * 0.25), Math.floor(usEach * 0.95));
    const spanErr = isErr && i === cfg.deps.length - 1;
    spanDocs.push(
      depSpan(
        traceId,
        txId,
        txId,
        ts,
        offsetMs,
        dep,
        spanErr,
        spanUs,
        svc,
        otel,
        dep === "bigquery" ? gcpCloud(region, project, "bigquery.googleapis.com") : cloudFn,
        project.id
      )
    );
    offsetMs += Math.max(1, Math.round(spanUs / 1000));
  }

  const errOutcome = isErr ? "failure" : "success";
  const httpResult = isErr ? rand(["HTTP 403", "HTTP 429", "HTTP 504"]) : "HTTP 2xx";

  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `${rand(["GET", "POST", "PUT"])} /${cfg.name}`,
      type: "request",
      duration: { us: totalUs },
      result: isErr ? httpResult : "HTTP 2xx",
      sampled: true,
      span_count: { started: spanDocs.length, dropped: 0 },
    },
    faas: {
      coldstart: coldStart,
      execution: executionId,
      trigger: { type: triggerMap[cfg.trigger] },
    },
    service: svc,
    cloud: cloudFn,
    labels: {
      "gcp.project_id": project.id,
      "gcp.cloud_functions.trigger": cfg.trigger,
      ...(isErr ? { "gcp.error.domain": "googleapis.com" } : {}),
    },
    data_stream: APM_DS,
    event: { outcome: errOutcome },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, ...spanDocs];
}
