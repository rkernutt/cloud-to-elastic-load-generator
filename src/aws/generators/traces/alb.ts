/**
 * Application Load Balancer OTel trace generator.
 *
 * Simulates HTTP request handling: routing, TLS termination, target forwarding,
 * and periodic health check correlation in a single trace.
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
  randHex,
} from "./helpers.js";

const APPS = [
  {
    name: "api-gateway-edge",
    language: "nodejs",
    framework: "Express",
    runtimeName: "node",
    runtimeVersion: "20.15.1",
  },
  {
    name: "checkout-bff",
    language: "java",
    framework: "Spring Boot",
    runtimeName: "OpenJDK",
    runtimeVersion: "21.0.3",
  },
  {
    name: "media-api",
    language: "python",
    framework: "FastAPI",
    runtimeName: "CPython",
    runtimeVersion: "3.12.3",
  },
];

function albSpan(
  traceId: string,
  txId: string,
  ts: string,
  offsetMs: number,
  name: string,
  spanType: string,
  subtype: string,
  action: string,
  resource: string,
  durationUs: number,
  labels: Record<string, string>,
  isErr: boolean
) {
  return {
    "@timestamp": offsetTs(new Date(ts), offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: newSpanId(),
      type: spanType,
      subtype,
      name,
      duration: { us: durationUs },
      action,
      destination: { service: { resource, type: spanType, name: resource } },
    },
    labels,
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };
}

export function generateAlbTrace(ts: string, er: number) {
  const cfg = rand(APPS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "production", "staging", "dev"]);
  const isErr = Math.random() < er;

  const tgName = rand(["tg-api-primary", "tg-checkout-v2", "tg-media-green"]);
  const listenerArn = `arn:aws:elasticloadbalancing:${region}:${account.id}:listener/app/${rand(["api", "checkout", "media"])}-alb/${randHex(6)}/${randInt(1000, 9999)}`;
  const targetId = `i-${newTraceId().slice(0, 17)}`;

  const svcBlock = serviceBlock(
    cfg.name,
    env,
    cfg.language,
    cfg.framework,
    cfg.runtimeName,
    cfg.runtimeVersion
  );
  const { agent, telemetry } = otelBlocks(cfg.language as "nodejs" | "java" | "python", "elastic");

  const phases: Array<{
    name: string;
    type: string;
    subtype: string;
    action: string;
    resource: string;
    us: number;
    labels: Record<string, string>;
  }> = [
    {
      name: "ALB.tls-termination",
      type: "app",
      subtype: "alb",
      action: "tls",
      resource: "alb",
      us: randInt(800, 25_000),
      labels: {
        "aws.elb.listener_arn": listenerArn,
        tls_version: rand(["TLSv1.2", "TLSv1.3"]),
      },
    },
    {
      name: "ALB.target-resolution",
      type: "app",
      subtype: "alb",
      action: "route",
      resource: "alb",
      us: randInt(300, 12_000),
      labels: {
        "aws.elb.target_group": tgName,
        rule_priority: String(randInt(1, 500)),
      },
    },
    {
      name: "ALB.backend-forward",
      type: "external",
      subtype: "http",
      action: "call",
      resource: "http",
      us: randInt(5_000, 400_000),
      labels: {
        "aws.elb.target_group": tgName,
        "aws.ec2.instance_id": targetId,
        "http.url": `http://${targetId}.compute.internal:${rand([8080, 8443, 3000])}/`,
      },
    },
    {
      name: "ALB.health-check",
      type: "app",
      subtype: "alb",
      action: "health",
      resource: "alb",
      us: randInt(2_000, 45_000),
      labels: {
        "aws.elb.target_group": tgName,
        health_check_path: rand(["/health", "/ready", "/status"]),
      },
    },
  ];

  let offsetMs = randInt(1, 5);
  const spans: ReturnType<typeof albSpan>[] = [];
  let sumUs = 0;
  for (let i = 0; i < phases.length; i++) {
    const ph = phases[i]!;
    const spanErr = isErr && i === phases.length - 2;
    const du = spanErr ? randInt(50_000, 900_000) : ph.us;
    sumUs += du;
    spans.push(
      albSpan(
        traceId,
        txId,
        ts,
        offsetMs,
        ph.name,
        ph.type,
        ph.subtype,
        ph.action,
        ph.resource,
        du,
        ph.labels,
        spanErr
      )
    );
    offsetMs += Math.max(1, Math.round(du / 1000)) + randInt(1, 8);
  }

  const totalUs = sumUs + randInt(2_000, 25_000);
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: rand(["GET /api/orders", "POST /checkout", "GET /media/*"]),
      type: "request",
      duration: { us: totalUs },
      result: isErr ? "HTTP 502" : "HTTP 2xx",
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
      service: { name: "alb" },
    },
    labels: {
      "aws.elb.load_balancer": `app/${cfg.name}-alb/${randInt(100000, 999999)}`,
    },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  return [txDoc, ...spans];
}
