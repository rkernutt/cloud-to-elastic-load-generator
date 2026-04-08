/**
 * Cloud Run OTel trace: HTTP request → Cloud SQL → Redis → Pub/Sub.
 */

import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";

const APM_AGENT = { name: "opentelemetry/nodejs", version: "1.x" } as const;
const APM_DS = { type: "traces", dataset: "apm", namespace: "default" } as const;

const SERVICES = ["orders-api", "payments-api", "catalog-api", "notifications-api"];

export function generateCloudRunTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const svc = rand(SERVICES);
  const base = new Date(ts);
  const env = rand(["production", "production", "staging", "dev"]);
  let offsetMs = 0;

  const sqlUs = randInt(2000, 180_000);
  const redisUs = randInt(500, 45_000);
  const pubUs = randInt(800, 90_000);

  const failIdx = isErr ? randInt(0, 2) : -1;
  const sqlErr = failIdx === 0;
  const redisErr = failIdx === 1;
  const pubErr = failIdx === 2;

  const s1 = randSpanId();
  const s2 = randSpanId();
  const s3 = randSpanId();

  const spanSql: EcsDocument = {
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
    },
    service: {
      name: svc,
      environment: env,
      language: { name: "nodejs" },
      runtime: { name: "nodejs", version: "20.x" },
      framework: { name: "Cloud Run" },
    },
    cloud: gcpCloud(region, project, "run.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: sqlErr ? "failure" : "success" },
  };
  offsetMs += Math.max(1, Math.round(sqlUs / 1000));

  const spanRedis: EcsDocument = {
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
    },
    service: {
      name: svc,
      environment: env,
      language: { name: "nodejs" },
      runtime: { name: "nodejs", version: "20.x" },
      framework: { name: "Cloud Run" },
    },
    cloud: gcpCloud(region, project, "run.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: redisErr ? "failure" : "success" },
  };
  offsetMs += Math.max(1, Math.round(redisUs / 1000));

  const spanPub: EcsDocument = {
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
    },
    service: {
      name: svc,
      environment: env,
      language: { name: "nodejs" },
      runtime: { name: "nodejs", version: "20.x" },
      framework: { name: "Cloud Run" },
    },
    cloud: gcpCloud(region, project, "run.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: pubErr ? "failure" : "success" },
  };

  const totalUs = sqlUs + redisUs + pubUs + randInt(500, 8000) * 1000;
  const txErr = sqlErr || redisErr || pubErr;

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
      span_count: { started: 3, dropped: 0 },
    },
    service: {
      name: svc,
      environment: env,
      language: { name: "nodejs" },
      runtime: { name: "nodejs", version: "20.x" },
      framework: { name: "Cloud Run" },
    },
    cloud: gcpCloud(region, project, "run.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: txErr ? "failure" : "success" },
  };

  return [txDoc, spanSql, spanRedis, spanPub];
}
