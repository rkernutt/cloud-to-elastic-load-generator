/**
 * Amazon GuardDuty OTel trace generator.
 *
 * Simulates finding analysis: log ingestion, threat intel correlation, and finding persistence.
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

const DETECTORS = [
  {
    name: "gd-orchestrator",
    language: "python" as const,
    framework: "FastAPI",
    runtimeName: "CPython",
    runtimeVersion: "3.12.3",
  },
  {
    name: "security-analytics",
    language: "java" as const,
    framework: "Spring Boot",
    runtimeName: "OpenJDK",
    runtimeVersion: "21.0.3",
  },
];

export function generateGuarddutyTrace(ts: string, er: number) {
  const cfg = rand(DETECTORS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "staging", "dev"]);
  const isErr = Math.random() < er;
  const detectorId = `${rand(["abc", "def", "fed"])}${randInt(100000, 999999)}`;

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
      name: "GuardDuty.log-analysis",
      us: randInt(50_000, 800_000),
      labels: { data_source: rand(["CLOUD_TRAIL", "VPC_FLOW_LOGS", "DNS_LOGS", "S3_DATA_EVENTS"]) },
    },
    {
      name: "GuardDuty.threat-intel-lookup",
      us: randInt(20_000, 400_000),
      labels: { intel_feed: rand(["AWS_THREAT_INTEL", "CUSTOM_LISTS"]) },
    },
    {
      name: "GuardDuty.finding-persistence",
      us: randInt(10_000, 250_000),
      labels: { finding_severity: rand(["LOW", "MEDIUM", "HIGH"]) },
    },
  ];

  let offsetMs = randInt(2, 12);
  const spans: Record<string, unknown>[] = [];
  let sumUs = 0;
  for (let i = 0; i < phases.length; i++) {
    const ph = phases[i]!;
    const spanErr = isErr && i === phases.length - 1;
    const du = spanErr ? randInt(100_000, 2_000_000) : ph.us;
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
        subtype: "guardduty",
        name: ph.name,
        duration: { us: du },
        action: rand(["analyze", "lookup", "publish"]),
        destination: { service: { resource: "guardduty", type: "app", name: "guardduty" } },
      },
      labels: { ...ph.labels, "aws.guardduty.detector_id": detectorId },
      event: { outcome: spanErr ? "failure" : "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    });
    offsetMs += Math.max(2, Math.round(du / 1000)) + randInt(2, 20);
  }

  const totalUs = sumUs + randInt(5_000, 80_000);
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: rand(["RunDetector", "CreateDetector", "GetFindings", "ArchiveFindings"]),
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
      service: { name: "guardduty" },
    },
    labels: { "aws.guardduty.detector_id": detectorId },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  return [txDoc, ...spans];
}
