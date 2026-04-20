/**
 * Amazon EBS OTel trace generator.
 *
 * Simulates volume attach, I/O operations, and snapshot workflows.
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

const CONSUMERS = [
  {
    name: "db-backup-agent",
    language: "go" as const,
    framework: null as string | null,
    runtimeName: "go",
    runtimeVersion: "1.22.5",
  },
  {
    name: "block-store-proxy",
    language: "java" as const,
    framework: "Micronaut",
    runtimeName: "OpenJDK",
    runtimeVersion: "21.0.3",
  },
];

export function generateEbsTrace(ts: string, er: number) {
  const cfg = rand(CONSUMERS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "staging", "dev"]);
  const isErr = Math.random() < er;
  const volumeId = `vol-${newTraceId().slice(0, 17)}`;
  const instanceId = `i-${newTraceId().slice(0, 17)}`;

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
      name: "EBS.volume-attach",
      us: randInt(800_000, 25_000_000),
      labels: { "aws.ec2.instance_id": instanceId, attach_device: "/dev/xvdf" },
    },
    {
      name: "EBS.io-operation",
      us: randInt(2_000, 450_000),
      labels: { op: rand(["read", "write", "flush"]), iops: String(randInt(100, 16000)) },
    },
    {
      name: "EBS.snapshot-create",
      us: randInt(5_000_000, 120_000_000),
      labels: { snapshot_id: `snap-${newTraceId().slice(0, 17)}` },
    },
  ];

  let offsetMs = randInt(5, 30);
  const spans: Record<string, unknown>[] = [];
  let sumUs = 0;
  for (let i = 0; i < phases.length; i++) {
    const ph = phases[i]!;
    const spanErr = isErr && i === phases.length - 1;
    const du = spanErr ? randInt(30_000_000, 200_000_000) : ph.us;
    sumUs += du;
    spans.push({
      "@timestamp": offsetTs(new Date(ts), offsetMs),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: newSpanId(),
        type: "storage",
        subtype: "ebs",
        name: ph.name,
        duration: { us: du },
        action: rand(["attach", "io", "snapshot"]),
        destination: { service: { resource: "ebs", type: "storage", name: "ebs" } },
      },
      labels: { "aws.ebs.volume_id": volumeId, ...ph.labels },
      event: { outcome: spanErr ? "failure" : "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    });
    offsetMs += Math.max(5, Math.min(20_000, Math.round(du / 1000 / 40))) + randInt(3, 25);
  }

  const totalUs = sumUs + randInt(100_000, 3_000_000);
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: rand(["EBS attach volume", "EBS snapshot chain", "EBS high-I/O batch"]),
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
      service: { name: "ebs" },
    },
    labels: { "aws.ebs.volume_id": volumeId },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  return [txDoc, ...spans];
}
