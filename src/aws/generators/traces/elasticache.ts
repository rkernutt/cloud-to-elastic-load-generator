import {
  TRACE_REGIONS,
  TRACE_ACCOUNTS,
  newTraceId,
  newSpanId,
  rand,
  randInt,
  offsetTs,
  serviceBlock,
  otelBlocks,
} from "./helpers.js";

const APPS = [
  {
    name: "cart-api",
    language: "python",
    framework: "FastAPI",
    runtimeName: "CPython",
    runtimeVersion: "3.12.3",
  },
  {
    name: "session-svc",
    language: "nodejs",
    framework: "Fastify",
    runtimeName: "node",
    runtimeVersion: "20.15.1",
  },
  {
    name: "pricing-engine",
    language: "java",
    framework: "Micronaut",
    runtimeName: "OpenJDK",
    runtimeVersion: "21.0.3",
  },
];

const OPS = [
  ["GET", "SET", "MGET"],
  ["GET", "HGET", "HSET"],
  ["SET", "EXPIRE", "GET"],
];

export function generateElastiCacheTrace(ts: string, er: number) {
  const cfg = rand(APPS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "staging", "dev"]);
  const isErr = Math.random() < er;
  const opList = rand(OPS);
  const clusterId = `redis-${rand(["prod", "stg", "cache"])}-${randInt(1, 9)}`;

  const svcBlock = serviceBlock(
    cfg.name,
    env,
    cfg.language,
    cfg.framework,
    cfg.runtimeName,
    cfg.runtimeVersion
  );
  const { agent, telemetry } = otelBlocks(cfg.language as "python" | "nodejs" | "java", "elastic");

  let offsetMs = randInt(1, 6);
  const spans: Record<string, unknown>[] = [];
  let sumUs = 0;
  for (let i = 0; i < opList.length; i++) {
    const cmd = opList[i]!;
    const sid = newSpanId();
    const us = randInt(200, 45_000);
    sumUs += us;
    const spanErr = isErr && i === opList.length - 1;
    spans.push({
      "@timestamp": offsetTs(new Date(ts), offsetMs),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sid,
        type: "db",
        subtype: "redis",
        name: `Redis ${cmd}`,
        duration: { us },
        action: cmd.toLowerCase(),
        db: { type: "redis", statement: `${cmd} ${rand(["session:*", "cart:*", "rate:*"])}` },
        destination: { service: { resource: "redis", type: "db", name: "redis" } },
      },
      labels: { "aws.elasticache.replication_group_id": clusterId },
      event: { outcome: spanErr ? "failure" : "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    });
    offsetMs += Math.max(1, Math.round(us / 1000));
  }

  const totalUs = sumUs + randInt(1_000, 12_000);
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: rand(["ResolveSession", "MergeCart", "ApplyPromo"]),
      type: "request",
      duration: { us: totalUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: spans.length, dropped: 0 },
    },
    service: svcBlock,
    agent,
    telemetry,
    cloud: {
      provider: "aws",
      region,
      account: { id: account.id, name: account.name },
      service: { name: "elasticache" },
    },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  return [txDoc, ...spans];
}
