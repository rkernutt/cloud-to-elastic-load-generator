import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

type Engine = "redis" | "memcached";

const FAIL_BY_IDX = [
  {
    status: "DEADLINE_EXCEEDED" as const,
    labels: { "memorystore.failure": "deadline" },
  },
  {
    status: "UNAVAILABLE" as const,
    labels: { "memorystore.failure": "failover_primary_down" },
  },
  {
    status: "ABORTED" as const,
    labels: { "memorystore.failure": "readonly_replica" },
  },
  {
    status: "RESOURCE_EXHAUSTED" as const,
    labels: { "memorystore.failure": "connection_pool_saturation" },
  },
];

function redisSpans(): { name: string; action: string; stmt: string }[] {
  const key = rand(["rl:quota", "sess:abc", "cart:42"]);
  return rand([
    [
      { name: "Redis CONNECT", action: "connect", stmt: "CONNECT pool" },
      { name: `Redis GET ${key}`, action: "get", stmt: `GET ${key}` },
      { name: `Redis SET ${key}`, action: "set", stmt: `SET ${key}` },
      { name: "Redis SCAN", action: "scan", stmt: "SCAN 0 MATCH rl:*" },
      { name: "Redis POOL.checkout", action: "pool", stmt: "CONN.checkout" },
    ],
    [
      { name: "Redis POOL.warm", action: "pool", stmt: "CONN.pool_warm" },
      {
        name: `Redis SUBSCRIBE notifications`,
        action: "subscribe",
        stmt: "SUBSCRIBE quota:events",
      },
      { name: `Redis GET ${key}`, action: "get", stmt: `GET ${key}` },
      { name: `Redis DEL ${key}`, action: "del", stmt: `DEL ${key}` },
      { name: "Redis failover wait", action: "failover", stmt: "READONLY failover_wait" },
    ],
  ]);
}

function mcSpans(): { name: string; action: string; stmt: string }[] {
  return [
    { name: "Memcached getClient", action: "connect", stmt: "connection_pool_acquire" },
    { name: "Memcached get", action: "get", stmt: "GET session_token" },
    { name: "Memcached set", action: "set", stmt: "SET session_token TTL=900" },
    { name: "Memcached delete", action: "del", stmt: "DELETE session_token" },
    { name: "Memcached stats failover probe", action: "failover", stmt: "noop_failover_route" },
  ];
}

export function generateMemorystoreTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const otel = gcpOtelMeta("nodejs");
  const engine: Engine = Math.random() < 0.78 ? "redis" : "memcached";
  const svc = gcpServiceBase(rand(["rate-limiter", "session-cache"]), env, "nodejs", {
    framework: "Express",
    runtimeName: "node",
    runtimeVersion: "20.15.1",
  });
  const cloudSvc = engine === "redis" ? "redis.googleapis.com" : "memcached.googleapis.com";
  const cloud = gcpCloud(region, project, cloudSvc);

  const rawOps = engine === "redis" ? redisSpans() : mcSpans();
  const spans: EcsDocument[] = [];
  const spanCount = rawOps.length;
  const failIdx = isErr ? randInt(0, spanCount - 1) : -1;
  const failMeta = failIdx >= 0 ? FAIL_BY_IDX[failIdx % FAIL_BY_IDX.length]! : null;

  let ms = randInt(1, 5);
  let sum = 0;

  for (let i = 0; i < spanCount; i++) {
    const op = rawOps[i]!;
    const sid = randSpanId();
    const us = randInt(200, 55_000);
    sum += us;
    const spanErr = failIdx === i;
    spans.push({
      "@timestamp": offsetTs(base, ms),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sid,
        type: "db",
        subtype: engine,
        name: op.name,
        duration: { us },
        action: op.action,
        db: {
          type: engine,
          statement: op.stmt,
        },
        destination: {
          service: {
            resource: engine === "redis" ? "redis" : "memcached",
            type: "db",
            name: engine,
          },
        },
      },
      service: svc,
      cloud,
      data_stream: APM_DS,
      labels: {
        "gcp.memorystore.engine": engine,
        "gcp.memorystore.instance": engine === "redis" ? "memorystore-redis-1" : "memorystore-mc-1",
        "gcp.redis.version": engine === "redis" ? rand(["REDIS_7_0", "REDIS_6_X"]) : "n/a",
        ...(spanErr
          ? {
              "gcp.rpc.status_code": failMeta!.status,
              "error.type": `memorystore.${failMeta!.labels["memorystore.failure"]}`,
              "error.message":
                failMeta!.status === "UNAVAILABLE"
                  ? "Replica promoted; connections drained briefly."
                  : "Memorystore request failed.",
              ...failMeta!.labels,
            }
          : {}),
      },
      event: { outcome: spanErr ? "failure" : "success" },
      ...otel,
      ...gcpCloudTraceMeta(project.id, traceId, sid),
    });
    ms += Math.max(1, Math.round(us / 1000));
  }

  const totalUs = sum + randInt(800, 9_000);
  const txErr = failIdx >= 0;
  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: "POST /check-quota",
      type: "request",
      duration: { us: totalUs },
      result: txErr ? "HTTP 503" : "HTTP 2xx",
      sampled: true,
      span_count: { started: spans.length, dropped: 0 },
    },
    service: svc,
    cloud,
    labels: {
      "gcp.memorystore.engine": engine,
      "gcp.redis.instance":
        engine === "redis"
          ? "projects/-/locations/-/instances/memorystore-rate-1"
          : "memorystore-mc-1",
    },
    data_stream: APM_DS,
    event: { outcome: txErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, ...spans];
}
