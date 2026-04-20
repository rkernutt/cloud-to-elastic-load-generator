/**
 * AWS CodeBuild OTel trace generator.
 *
 * Simulates StartBuild through checkout, phases, and artifact upload.
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

const PROJECTS = [
  {
    name: "ci-image-builder",
    language: "nodejs" as const,
    framework: "Jest",
    runtimeName: "node",
    runtimeVersion: "20.15.1",
  },
  {
    name: "lib-compile",
    language: "java" as const,
    framework: "Maven",
    runtimeName: "OpenJDK",
    runtimeVersion: "21.0.3",
  },
  {
    name: "ml-training-bundle",
    language: "python" as const,
    framework: "pytest",
    runtimeName: "CPython",
    runtimeVersion: "3.11.9",
  },
];

export function generateCodebuildTrace(ts: string, er: number) {
  const cfg = rand(PROJECTS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "staging", "dev"]);
  const isErr = Math.random() < er;
  const projectName = rand(["api-build", "infra-validate", "container-scan", "lambda-package"]);

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
    { name: "CodeBuild.SOURCE", phase: "source", us: randInt(2_000_000, 45_000_000) },
    { name: "CodeBuild.INSTALL", phase: "install", us: randInt(500_000, 12_000_000) },
    { name: "CodeBuild.BUILD", phase: "build", us: randInt(5_000_000, 120_000_000) },
    { name: "CodeBuild.POST_BUILD", phase: "post_build", us: randInt(300_000, 15_000_000) },
    { name: "CodeBuild.ARTIFACTS", phase: "artifacts", us: randInt(1_000_000, 30_000_000) },
  ];

  let offsetMs = randInt(5, 30);
  const spans: Record<string, unknown>[] = [];
  let sumUs = 0;
  for (let i = 0; i < phases.length; i++) {
    const ph = phases[i]!;
    const spanErr = isErr && i === phases.length - 1;
    const du = spanErr ? randInt(50_000_000, 180_000_000) : ph.us;
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
        subtype: "codebuild",
        name: ph.name,
        duration: { us: du },
        action: ph.phase,
        destination: { service: { resource: "codebuild", type: "app", name: "codebuild" } },
      },
      labels: {
        "aws.codebuild.project": projectName,
        build_phase: ph.phase,
        "aws.codebuild.build_id": `${projectName}:${newTraceId().slice(0, 8)}`,
      },
      event: { outcome: spanErr ? "failure" : "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    });
    offsetMs += Math.max(10, Math.min(60_000, Math.round(du / 1000 / 50))) + randInt(5, 40);
  }

  const totalUs = sumUs + randInt(100_000, 2_000_000);
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `CodeBuild.StartBuild ${projectName}`,
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
      service: { name: "codebuild" },
    },
    labels: { "aws.codebuild.project": projectName },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  return [txDoc, ...spans];
}
