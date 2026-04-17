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
    name: "api-tier-asg",
    language: "go",
    framework: "chi",
    runtimeName: "go",
    runtimeVersion: "1.22.5",
  },
  {
    name: "grpc-inventory",
    language: "java",
    framework: "grpc-java",
    runtimeName: "OpenJDK",
    runtimeVersion: "21.0.3",
  },
  {
    name: "edge-bff",
    language: "nodejs",
    framework: "Express",
    runtimeName: "node",
    runtimeVersion: "20.15.1",
  },
];

export function generateEc2Trace(ts: string, er: number) {
  const cfg = rand(APPS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "staging", "dev"]);
  const isErr = Math.random() < er;
  const instanceId = `i-${newTraceId().slice(0, 17)}`;
  const svcBlock = serviceBlock(
    cfg.name,
    env,
    cfg.language,
    cfg.framework,
    cfg.runtimeName,
    cfg.runtimeVersion
  );
  const { agent, telemetry } = otelBlocks(
    cfg.language as "python" | "nodejs" | "java" | "go",
    "elastic"
  );

  const spanSpecs = [
    {
      type: "external",
      subtype: "grpc",
      name: () => `gRPC ${rand(["GetStock", "ReserveItem", "ReleaseItem"])} inventory.internal`,
      dest: "grpc",
    },
    {
      type: "db",
      subtype: "redis",
      name: () => `Redis ${rand(["GET", "MGET", "SET"])}`,
      dest: "redis",
      db: () => ({ type: "redis", statement: rand(["GET session:*", "MGET cart:*"]) }),
    },
    {
      type: "external",
      subtype: "http",
      name: () => `HTTP POST ${rand(["payments.internal", "auth.internal"])}`,
      dest: "http",
    },
  ];

  let offsetMs = randInt(1, 8);
  const spans: Record<string, unknown>[] = [];
  let totalChildUs = 0;
  for (let i = 0; i < spanSpecs.length; i++) {
    const spec = spanSpecs[i]!;
    const sid = newSpanId();
    const us = randInt(800, 120_000);
    totalChildUs += us;
    const spanErr = isErr && i === spanSpecs.length - 1;
    spans.push({
      "@timestamp": offsetTs(new Date(ts), offsetMs),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sid,
        type: spec.type,
        subtype: spec.subtype,
        name: spec.name(),
        duration: { us },
        action: spec.type === "db" ? "query" : "call",
        ...(spec.db ? { db: spec.db() } : {}),
        destination: { service: { resource: spec.dest, type: spec.type, name: spec.dest } },
      },
      event: { outcome: spanErr ? "failure" : "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    });
    offsetMs += Math.max(1, Math.round(us / 1000));
  }

  const totalUs = totalChildUs + randInt(2_000, 25_000);
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: rand([
        `GET /v1/${cfg.name}/health`,
        `POST /v1/${cfg.name}/orders`,
        `GET /v1/${cfg.name}/items`,
      ]),
      type: "request",
      duration: { us: totalUs },
      result: isErr ? "HTTP 503" : "HTTP 2xx",
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
      service: { name: "ec2" },
    },
    labels: { "aws.ec2.instance_id": instanceId },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  return [txDoc, ...spans];
}
