/**
 * Cloud Build OTel trace: Build pipeline with sequential step spans.
 */

import type { EcsDocument } from "../helpers.js";
import {
  rand,
  randInt,
  randId,
  gcpCloud,
  makeGcpSetup,
  randTraceId,
  randSpanId,
} from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";

const APM_AGENT = { name: "opentelemetry/nodejs", version: "1.x" } as const;
const APM_DS = { type: "traces", dataset: "apm", namespace: "default" } as const;

const BUILD_STEPS = ["pull", "install", "test", "build", "push"] as const;
type BuildStep = (typeof BUILD_STEPS)[number];

const STEP_BASE_US: Record<BuildStep, [number, number]> = {
  pull: [5_000_000, 30_000_000],
  install: [15_000_000, 90_000_000],
  test: [20_000_000, 180_000_000],
  build: [30_000_000, 240_000_000],
  push: [8_000_000, 60_000_000],
};

export function generateCloudBuildTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "production", "staging", "dev"]);
  const buildId = randId(8).toLowerCase();

  const numSteps = randInt(3, 5);
  const steps = BUILD_STEPS.slice(0, numSteps) as BuildStep[];

  // On error: pick test or build as the failing step
  const failStep: BuildStep | null = isErr ? rand(["test", "build"] as BuildStep[]) : null;
  const failIdx = failStep !== null ? steps.indexOf(failStep) : -1;

  let offsetMs = 0;
  let totalUs = 0;
  const spanDocs: EcsDocument[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const isSkipped = failIdx >= 0 && i > failIdx;
    const isFailStep = i === failIdx;

    if (isSkipped) break; // subsequent steps skipped after failure

    const [minUs, maxUs] = STEP_BASE_US[step];
    const stepUs = randInt(minUs, maxUs) * (isFailStep ? randInt(1, 2) : 1);
    totalUs += stepUs;
    const sSpan = randSpanId();

    spanDocs.push({
      "@timestamp": offsetTs(base, offsetMs),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sSpan,
        type: "app",
        subtype: "build-step",
        name: `step: ${step}`,
        duration: { us: stepUs },
        action: step,
        labels: { step_name: step, step_index: String(i) },
      },
      service: {
        name: "cloud-build",
        environment: env,
        language: { name: "python" },
        runtime: { name: "python", version: "3.12" },
        framework: { name: "Google Cloud Build" },
      },
      cloud: gcpCloud(region, project, "cloudbuild.googleapis.com"),
      agent: APM_AGENT,
      data_stream: APM_DS,
      event: { outcome: isFailStep ? "failure" : "success" },
    });
    offsetMs += Math.max(1, Math.round(stepUs / 1000));
  }

  const txOverhead = randInt(500, 3000) * 1000;
  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `build ${buildId} steps`,
      type: "job",
      duration: { us: totalUs + txOverhead },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: spanDocs.length, dropped: 0 },
    },
    service: {
      name: "cloud-build",
      environment: env,
      language: { name: "python" },
      runtime: { name: "python", version: "3.12" },
      framework: { name: "Google Cloud Build" },
    },
    cloud: gcpCloud(region, project, "cloudbuild.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    labels: { build_id: buildId, failed_step: failStep ?? "" },
  };

  return [txDoc, ...spanDocs];
}
