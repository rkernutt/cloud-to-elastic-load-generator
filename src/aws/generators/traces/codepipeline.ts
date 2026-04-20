/**
 * AWS CodePipeline OTel trace generator.
 *
 * Simulates pipeline execution across source, build, and deploy stages.
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

const ORCHESTRATORS = [
  {
    name: "release-bot",
    language: "python" as const,
    framework: "FastAPI",
    runtimeName: "CPython",
    runtimeVersion: "3.12.3",
  },
  {
    name: "deploy-controller",
    language: "java" as const,
    framework: "Spring Boot",
    runtimeName: "OpenJDK",
    runtimeVersion: "21.0.3",
  },
];

export function generateCodepipelineTrace(ts: string, er: number) {
  const cfg = rand(ORCHESTRATORS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "staging", "dev"]);
  const isErr = Math.random() < er;
  const pipelineName = rand(["app-main", "data-batch", "infra-cdk"]);

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
      name: "CodePipeline.Source",
      action: "source",
      us: randInt(800_000, 25_000_000),
      labels: { provider: rand(["CodeCommit", "GitHub", "S3"]) },
    },
    {
      name: "CodePipeline.Build",
      action: "build",
      us: randInt(3_000_000, 90_000_000),
      labels: { provider: rand(["CodeBuild", "Jenkins"]) },
    },
    {
      name: "CodePipeline.Deploy",
      action: "deploy",
      us: randInt(1_000_000, 40_000_000),
      labels: { provider: rand(["CloudFormation", "CodeDeploy", "ECS"]) },
    },
  ];

  let offsetMs = randInt(5, 25);
  const spans: Record<string, unknown>[] = [];
  let sumUs = 0;
  for (let i = 0; i < phases.length; i++) {
    const ph = phases[i]!;
    const spanErr = isErr && i === phases.length - 1;
    const du = spanErr ? randInt(20_000_000, 120_000_000) : ph.us;
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
        subtype: "codepipeline",
        name: ph.name,
        duration: { us: du },
        action: ph.action,
        destination: { service: { resource: "codepipeline", type: "app", name: "codepipeline" } },
      },
      labels: {
        "aws.codepipeline.pipeline": pipelineName,
        ...ph.labels,
        execution_id: newTraceId().slice(0, 13),
      },
      event: { outcome: spanErr ? "failure" : "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    });
    offsetMs += Math.max(10, Math.min(45_000, Math.round(du / 1000 / 80))) + randInt(5, 35);
  }

  const totalUs = sumUs + randInt(200_000, 4_000_000);
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `Pipeline ${pipelineName}`,
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
      service: { name: "codepipeline" },
    },
    labels: { "aws.codepipeline.pipeline": pipelineName },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  return [txDoc, ...spans];
}
