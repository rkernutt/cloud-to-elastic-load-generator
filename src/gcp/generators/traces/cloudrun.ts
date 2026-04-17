import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

const SERVICES = ["orders-api", "payments-api", "catalog-api", "notifications-api"];

export function generateCloudRunTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const svcName = rand(SERVICES);
  const base = new Date(ts);
  const env = rand(["production", "production", "staging", "dev"]);
  const otel = gcpOtelMeta("nodejs");
  const cloudRun = gcpCloud(region, project, "run.googleapis.com");
  const svc = gcpServiceBase(svcName, env, "nodejs", {
    framework: "Cloud Run",
    runtimeName: "nodejs",
    runtimeVersion: "20.15.1",
  });

  const cold = Math.random() < 0.06;
  const coldUs = cold ? randInt(120, 1600) * 1000 : 0;
  const sqlUs = randInt(2000, 180_000);
  const fsUs = randInt(1500, 95_000);
  const redisUs = randInt(500, 45_000);
  const pubUs = randInt(800, 90_000);
  const bqUs = randInt(5000, 280_000);

  const failIdx = isErr ? randInt(0, 4) : -1;
  let offsetMs = 0;
  const spans: EcsDocument[] = [];

  if (cold) {
    const sid = randSpanId();
    spans.push({
      "@timestamp": ts,
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sid,
        type: "app",
        subtype: "cold-start",
        name: `Cloud Run startup ${svcName}`,
        duration: { us: coldUs },
        action: "init",
        labels: { revision: `${svcName}-${randInt(1, 9)}-${rand(["abc", "def", "ghi"])}` },
      },
      service: svc,
      cloud: cloudRun,
      data_stream: APM_DS,
      event: { outcome: "success" },
      ...otel,
      ...gcpCloudTraceMeta(project.id, traceId, sid),
    });
    offsetMs += Math.max(1, Math.round(coldUs / 1000));
  }

  const s1 = randSpanId();
  spans.push({
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: s1,
      type: "db",
      subtype: "postgresql",
      name: `Cloud SQL ${rand(["SELECT", "INSERT", "UPDATE"])} orders`,
      duration: { us: sqlUs },
      action: "query",
      db: {
        type: "sql",
        statement: rand([
          "SELECT * FROM orders WHERE customer_id = $1",
          "INSERT INTO order_events (order_id, type) VALUES ($1, $2)",
          "UPDATE inventory SET qty = qty - $1 WHERE sku = $2",
        ]),
      },
      destination: { service: { resource: "cloudsql", type: "db", name: "cloudsql" } },
      labels: failIdx === 0 ? { "gcp.rpc.status_code": "DEADLINE_EXCEEDED" } : {},
    },
    service: svc,
    cloud: gcpCloud(region, project, "sqladmin.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: failIdx === 0 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s1),
  });
  offsetMs += Math.max(1, Math.round(sqlUs / 1000));

  const sFs = randSpanId();
  spans.push({
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: sFs,
      type: "db",
      subtype: "firestore",
      name: `Firestore.${rand(["getDocument", "runTransaction"])}`,
      duration: { us: fsUs },
      action: "query",
      db: {
        type: "nosql",
        statement: `${rand(["get", "query"])} carts/${rand(["anon", "user"])}/*`,
      },
      destination: { service: { resource: "firestore", type: "db", name: "firestore" } },
      labels: failIdx === 1 ? { "gcp.rpc.status_code": "PERMISSION_DENIED" } : {},
    },
    service: svc,
    cloud: gcpCloud(region, project, "firestore.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: failIdx === 1 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, sFs),
  });
  offsetMs += Math.max(1, Math.round(fsUs / 1000));

  const s2 = randSpanId();
  spans.push({
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: s2,
      type: "db",
      subtype: "redis",
      name: `Redis ${rand(["GET", "SET", "HGET", "ZADD"])}`,
      duration: { us: redisUs },
      action: "query",
      db: {
        type: "redis",
        statement: rand(["GET cart:session", "SET rate:limit", "HGETALL session"]),
      },
      destination: { service: { resource: "memorystore", type: "db", name: "redis" } },
      labels: failIdx === 2 ? { "gcp.rpc.status_code": "ABORTED" } : {},
    },
    service: svc,
    cloud: cloudRun,
    data_stream: APM_DS,
    event: { outcome: failIdx === 2 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s2),
  });
  offsetMs += Math.max(1, Math.round(redisUs / 1000));

  const s3 = randSpanId();
  spans.push({
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: s3,
      type: "messaging",
      subtype: "pubsub",
      name: `PubSub.publish ${rand(["order-events", "fulfillment", "audit"])}`,
      duration: { us: pubUs },
      action: "send",
      destination: { service: { resource: "pubsub", type: "messaging", name: "pubsub" } },
      labels: failIdx === 3 ? { "gcp.rpc.status_code": "RESOURCE_EXHAUSTED" } : {},
    },
    service: svc,
    cloud: gcpCloud(region, project, "pubsub.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: failIdx === 3 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s3),
  });
  offsetMs += Math.max(1, Math.round(pubUs / 1000));

  const s4 = randSpanId();
  spans.push({
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: s4,
      type: "db",
      subtype: "bigquery",
      name: "BigQuery.insertAll analytics.order_facts",
      duration: { us: bqUs },
      action: "execute",
      db: { type: "sql", statement: "INSERT INTO `analytics.order_facts` SELECT ..." },
      destination: { service: { resource: "bigquery", type: "db", name: "bigquery" } },
      labels: failIdx === 4 ? { "gcp.rpc.status_code": "DEADLINE_EXCEEDED" } : {},
    },
    service: svc,
    cloud: gcpCloud(region, project, "bigquery.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: failIdx === 4 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s4),
  });

  const totalUs = coldUs + sqlUs + fsUs + redisUs + pubUs + bqUs + randInt(500, 8000) * 1000;
  const txErr = failIdx >= 0;

  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `${rand(["GET", "POST", "PUT"])} ${rand(["/v1/orders", "/v1/checkout", "/v1/catalog/item"])}`,
      type: "request",
      duration: { us: totalUs },
      result: txErr ? "HTTP 5xx" : "HTTP 2xx",
      sampled: true,
      span_count: { started: spans.length, dropped: 0 },
    },
    service: svc,
    cloud: cloudRun,
    labels: {
      "gcp.project_id": project.id,
      "gcp.cloud_run.service": svcName,
    },
    data_stream: APM_DS,
    event: { outcome: txErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, ...spans];
}
