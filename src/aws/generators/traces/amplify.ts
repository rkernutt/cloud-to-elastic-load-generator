/**
 * AWS Amplify OTel trace generator.
 *
 * Simulates CI/CD: source pull, build, deploy to S3, and CDN invalidation.
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

const APPS = [
  {
    name: "marketing-site",
    language: "nodejs" as const,
    framework: "React",
    runtimeName: "node",
    runtimeVersion: "20.15.1",
  },
  {
    name: "partner-portal",
    language: "nodejs" as const,
    framework: "Next.js",
    runtimeName: "node",
    runtimeVersion: "20.15.1",
  },
];

export function generateAmplifyTrace(ts: string, er: number) {
  const cfg = rand(APPS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "staging", "dev"]);
  const isErr = Math.random() < er;
  const appId = `d${newTraceId().slice(0, 9)}`;
  const branch = rand(["main", "develop", "preview/pr-142"]);

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
      name: "Amplify.source-pull",
      us: randInt(3_000_000, 55_000_000),
      labels: { git_ref: rand(["refs/heads/main", "refs/heads/develop"]), branch },
    },
    {
      name: "Amplify.build",
      us: randInt(8_000_000, 180_000_000),
      labels: { build_spec_version: "1.0", framework: cfg.framework ?? "node" },
    },
    {
      name: "Amplify.deploy-s3",
      us: randInt(2_000_000, 40_000_000),
      labels: { hosting_bucket: `amplify-${appId}-hosting` },
    },
    {
      name: "Amplify.cdn-invalidation",
      us: randInt(500_000, 15_000_000),
      labels: { distribution: `E${newTraceId().slice(0, 12).toUpperCase()}` },
    },
  ];

  let offsetMs = randInt(10, 50);
  const spans: Record<string, unknown>[] = [];
  let sumUs = 0;
  for (let i = 0; i < phases.length; i++) {
    const ph = phases[i]!;
    const spanErr = isErr && i === phases.length - 1;
    const du = spanErr ? randInt(40_000_000, 200_000_000) : ph.us;
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
        subtype: "amplify",
        name: ph.name,
        duration: { us: du },
        action: rand(["checkout", "build", "deploy", "invalidate"]),
        destination: { service: { resource: "amplify", type: "app", name: "amplify" } },
      },
      labels: { "aws.amplify.app_id": appId, ...ph.labels },
      event: { outcome: spanErr ? "failure" : "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    });
    offsetMs += Math.max(15, Math.min(35_000, Math.round(du / 1000 / 90))) + randInt(8, 45);
  }

  const totalUs = sumUs + randInt(300_000, 5_000_000);
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `Amplify deploy ${branch}`,
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
      service: { name: "amplify" },
    },
    labels: { "aws.amplify.app_id": appId, branch },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  return [txDoc, ...spans];
}
