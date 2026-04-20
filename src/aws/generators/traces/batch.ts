/**
 * AWS Batch OTel trace generator.
 *
 * Simulates SubmitJob through scheduling, compute, and result storage.
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

const DRIVERS = [
  {
    name: "hpc-submit-api",
    language: "python" as const,
    framework: "FastAPI",
    runtimeName: "CPython",
    runtimeVersion: "3.12.3",
  },
  {
    name: "data-pipeline-driver",
    language: "java" as const,
    framework: "Spring Boot",
    runtimeName: "OpenJDK",
    runtimeVersion: "21.0.3",
  },
];

export function generateBatchTrace(ts: string, er: number) {
  const cfg = rand(DRIVERS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "staging", "dev"]);
  const isErr = Math.random() < er;
  const jobQueue = rand(["gpu-training-queue", "etl-spot-queue", "render-on-demand"]);
  const jobName = rand(["genome-align", "daily-report", "video-transcode", "feature-backfill"]);

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
      name: "Batch.job-scheduling",
      us: randInt(200_000, 6_000_000),
      labels: { "aws.batch.job_queue": jobQueue },
    },
    {
      name: "Batch.container-provisioning",
      us: randInt(2_000_000, 45_000_000),
      labels: { compute_environment: rand(["FARGATE_SPOT", "EC2_SPOT", "EC2_ON_DEMAND"]) },
    },
    {
      name: "Batch.job-execution",
      us: randInt(10_000_000, 240_000_000),
      labels: { vcpus: String(randInt(1, 16)), memory_mib: String(randInt(2048, 122880)) },
    },
    {
      name: "Batch.result-storage",
      us: randInt(300_000, 20_000_000),
      labels: { output_location: `s3://${account.name}-batch-out/${jobName}/` },
    },
  ];

  let offsetMs = randInt(8, 40);
  const spans: Record<string, unknown>[] = [];
  let sumUs = 0;
  for (let i = 0; i < phases.length; i++) {
    const ph = phases[i]!;
    const spanErr = isErr && i === phases.length - 2;
    const du = spanErr ? randInt(25_000_000, 200_000_000) : ph.us;
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
        subtype: "batch",
        name: ph.name,
        duration: { us: du },
        action: rand(["schedule", "provision", "run", "store"]),
        destination: { service: { resource: "batch", type: "app", name: "batch" } },
      },
      labels: { "aws.batch.job_name": jobName, ...ph.labels },
      event: { outcome: spanErr ? "failure" : "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    });
    offsetMs += Math.max(10, Math.min(25_000, Math.round(du / 1000 / 120))) + randInt(5, 40);
  }

  const totalUs = sumUs + randInt(250_000, 4_000_000);
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `Batch.SubmitJob ${jobName}`,
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
      service: { name: "batch" },
    },
    labels: { "aws.batch.job_queue": jobQueue, "aws.batch.job_name": jobName },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  return [txDoc, ...spans];
}
