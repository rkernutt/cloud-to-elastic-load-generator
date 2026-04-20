/**
 * AWS App Runner OTel trace generator.
 *
 * Simulates HTTP handling with routing, container invocation, and response serialization.
 */

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

const SERVICES = [
  {
    name: "public-docs",
    language: "nodejs" as const,
    framework: "Fastify",
    runtimeName: "node",
    runtimeVersion: "20.15.1",
  },
  {
    name: "internal-tools",
    language: "python" as const,
    framework: "FastAPI",
    runtimeName: "CPython",
    runtimeVersion: "3.12.3",
  },
];

export function generateApprunnerTrace(ts: string, er: number) {
  const cfg = rand(SERVICES);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "staging", "dev"]);
  const isErr = Math.random() < er;
  const serviceId = `arn:aws:apprunner:${region}:${account.id}:service/${cfg.name}/${randInt(1000000, 9999999)}`;

  const svcBlock = serviceBlock(
    cfg.name,
    env,
    cfg.language,
    cfg.framework,
    cfg.runtimeName,
    cfg.runtimeVersion
  );
  const { agent, telemetry } = otelBlocks(cfg.language, "elastic");

  const phases = [
    {
      name: "AppRunner.routing",
      us: randInt(400, 18_000),
      labels: { route_match: rand(["/", "/api/*", "/health"]) },
    },
    {
      name: "AppRunner.auto-scale-check",
      us: randInt(200, 12_000),
      labels: { desired_instances: String(randInt(1, 8)) },
    },
    {
      name: "AppRunner.container-invocation",
      us: randInt(8_000, 350_000),
      labels: { revision: `v${randInt(1, 40)}` },
    },
    {
      name: "AppRunner.response-serialization",
      us: randInt(300, 25_000),
      labels: { content_type: rand(["application/json", "text/html"]) },
    },
  ];

  let offsetMs = randInt(1, 5);
  const spans: Record<string, unknown>[] = [];
  let sumUs = 0;
  for (let i = 0; i < phases.length; i++) {
    const ph = phases[i]!;
    const spanErr = isErr && i === phases.length - 2;
    const du = spanErr ? randInt(200_000, 900_000) : ph.us;
    sumUs += du;
    spans.push({
      "@timestamp": offsetTs(new Date(ts), offsetMs),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: newSpanId(),
        type: "app",
        subtype: "apprunner",
        name: ph.name,
        duration: { us: du },
        action: rand(["route", "scale", "invoke", "serialize"]),
        destination: { service: { resource: "apprunner", type: "app", name: "apprunner" } },
      },
      labels: { "aws.apprunner.service_arn": serviceId, ...ph.labels },
      event: { outcome: spanErr ? "failure" : "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    });
    offsetMs += Math.max(1, Math.round(du / 1000)) + randInt(1, 8);
  }

  const totalUs = sumUs + randInt(2_000, 30_000);
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: rand(["GET /", "GET /api/status", "POST /hooks/github"]),
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
      service: { name: "apprunner" },
    },
    labels: { "aws.apprunner.service_arn": serviceId },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  return [txDoc, ...spans];
}
