/**
 * AWS Fargate OTel trace generator.
 *
 * Simulates RunTask: image pull, container start, health checks, and log shipping.
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
    name: "pricing-worker",
    language: "go" as const,
    framework: null as string | null,
    runtimeName: "go",
    runtimeVersion: "1.22.5",
  },
  {
    name: "render-sidecar",
    language: "nodejs" as const,
    framework: "Express",
    runtimeName: "node",
    runtimeVersion: "20.15.1",
  },
  {
    name: "batch-etl",
    language: "python" as const,
    framework: "Celery",
    runtimeName: "CPython",
    runtimeVersion: "3.12.3",
  },
];

export function generateFargateTrace(ts: string, er: number) {
  const cfg = rand(SERVICES);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "staging", "dev"]);
  const isErr = Math.random() < er;
  const cluster = rand(["prod-services", "staging-batch", "dev-sandbox"]);
  const taskArn = `arn:aws:ecs:${region}:${account.id}:task/${cluster}/${newTraceId().slice(0, 32)}`;

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
      name: "Fargate.image-pull",
      us: randInt(3_000_000, 90_000_000),
      labels: {
        image: rand([
          "123456789012.dkr.ecr.us-east-1.amazonaws.com/api:v42",
          "public.ecr.aws/nginx:latest",
        ]),
      },
    },
    {
      name: "Fargate.container-start",
      us: randInt(500_000, 25_000_000),
      labels: { container_name: rand(["app", "worker", "sidecar"]) },
    },
    {
      name: "Fargate.health-check",
      us: randInt(200_000, 8_000_000),
      labels: { health_status: rand(["HEALTHY", "UNKNOWN"]) },
    },
    {
      name: "Fargate.log-push",
      us: randInt(100_000, 6_000_000),
      labels: { log_driver: rand(["awslogs", "firelens"]) },
    },
  ];

  let offsetMs = randInt(10, 80);
  const spans: Record<string, unknown>[] = [];
  let sumUs = 0;
  for (let i = 0; i < phases.length; i++) {
    const ph = phases[i]!;
    const spanErr = isErr && i === phases.length - 2;
    const du = spanErr ? randInt(30_000_000, 120_000_000) : ph.us;
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
        subtype: "fargate",
        name: ph.name,
        duration: { us: du },
        action: rand(["pull", "start", "probe", "publish"]),
        destination: { service: { resource: "fargate", type: "app", name: "fargate" } },
      },
      labels: { "aws.ecs.cluster": cluster, "aws.ecs.task_arn": taskArn, ...ph.labels },
      event: { outcome: spanErr ? "failure" : "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    });
    offsetMs += Math.max(15, Math.min(30_000, Math.round(du / 1000 / 100))) + randInt(5, 50);
  }

  const totalUs = sumUs + randInt(300_000, 5_000_000);
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: "ECS.RunTask",
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
      service: { name: "fargate" },
    },
    labels: { "aws.ecs.cluster": cluster, "aws.ecs.task_arn": taskArn, launch_type: "FARGATE" },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  return [txDoc, ...spans];
}
