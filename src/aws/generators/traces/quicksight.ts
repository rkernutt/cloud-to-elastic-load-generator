/**
 * Amazon QuickSight OTel trace generator.
 *
 * Simulates dashboard query path: parse, SPICE fetch, calculation, render.
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
    name: "exec-dashboards",
    language: "java" as const,
    framework: "Spring Boot",
    runtimeName: "OpenJDK",
    runtimeVersion: "21.0.3",
  },
  {
    name: "embedded-analytics",
    language: "nodejs" as const,
    framework: "Express",
    runtimeName: "node",
    runtimeVersion: "20.15.1",
  },
];

export function generateQuicksightTrace(ts: string, er: number) {
  const cfg = rand(APPS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "staging", "dev"]);
  const isErr = Math.random() < er;
  const dashboardId = rand(["sales-overview", "ops-health", "finance-close"]);

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
      name: "QuickSight.query-parse",
      us: randInt(5_000, 180_000),
      labels: { dataset_id: `ds-${randInt(1000, 9999)}` },
    },
    {
      name: "QuickSight.SPICE.fetch",
      us: randInt(20_000, 2_500_000),
      labels: { spice_mode: rand(["DIRECT_QUERY", "SPICE"]) },
    },
    {
      name: "QuickSight.calculation",
      us: randInt(8_000, 900_000),
      labels: { calc_fields: String(randInt(1, 24)) },
    },
    {
      name: "QuickSight.render",
      us: randInt(10_000, 600_000),
      labels: { visual_type: rand(["combo", "pivot", "geospatial", "table"]) },
    },
  ];

  let offsetMs = randInt(2, 10);
  const spans: Record<string, unknown>[] = [];
  let sumUs = 0;
  for (let i = 0; i < phases.length; i++) {
    const ph = phases[i]!;
    const spanErr = isErr && i === phases.length - 1;
    const du = spanErr ? randInt(500_000, 5_000_000) : ph.us;
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
        subtype: "quicksight",
        name: ph.name,
        duration: { us: du },
        action: rand(["parse", "fetch", "compute", "render"]),
        destination: { service: { resource: "quicksight", type: "app", name: "quicksight" } },
      },
      labels: { "aws.quicksight.dashboard": dashboardId, ...ph.labels },
      event: { outcome: spanErr ? "failure" : "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    });
    offsetMs += Math.max(2, Math.round(du / 1000)) + randInt(2, 12);
  }

  const totalUs = sumUs + randInt(5_000, 80_000);
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `QuickSight dashboard ${dashboardId}`,
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
      service: { name: "quicksight" },
    },
    labels: { "aws.quicksight.dashboard": dashboardId },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  return [txDoc, ...spans];
}
