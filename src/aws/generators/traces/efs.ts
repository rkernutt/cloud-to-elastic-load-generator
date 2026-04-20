/**
 * Amazon EFS OTel trace generator.
 *
 * Simulates NFS mount path operations: protocol handling, metadata sync, throughput metering.
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

const CLIENTS = [
  {
    name: "media-transcode",
    language: "python" as const,
    framework: "Celery",
    runtimeName: "CPython",
    runtimeVersion: "3.12.3",
  },
  {
    name: "shared-workspace",
    language: "java" as const,
    framework: "Spring Boot",
    runtimeName: "OpenJDK",
    runtimeVersion: "21.0.3",
  },
];

export function generateEfsTrace(ts: string, er: number) {
  const cfg = rand(CLIENTS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "staging", "dev"]);
  const isErr = Math.random() < er;
  const fsId = `fs-${newTraceId().slice(0, 17)}`;

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
      name: `EFS.NFS.${rand(["READ", "WRITE", "GETATTR", "READDIR"])}`,
      us: randInt(5_000, 180_000),
      labels: { nfs_version: rand(["4.1", "4.0"]), bytes: String(randInt(4096, 10485760)) },
    },
    {
      name: "EFS.metadata-sync",
      us: randInt(2_000, 90_000),
      labels: { inode_op: rand(["lookup", "create", "unlink"]) },
    },
    {
      name: "EFS.throughput-metering",
      us: randInt(500, 35_000),
      labels: { burst_credit_status: rand(["OK", "THROTTLED"]) },
    },
  ];

  let offsetMs = randInt(1, 6);
  const spans: Record<string, unknown>[] = [];
  let sumUs = 0;
  for (let i = 0; i < phases.length; i++) {
    const ph = phases[i]!;
    const spanErr = isErr && i === phases.length - 1;
    const du = spanErr ? randInt(200_000, 2_000_000) : ph.us;
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
        subtype: "efs",
        name: ph.name,
        duration: { us: du },
        action: rand(["read", "write", "sync", "meter"]),
        destination: { service: { resource: "efs", type: "storage", name: "efs" } },
      },
      labels: { "aws.efs.file_system_id": fsId, ...ph.labels },
      event: { outcome: spanErr ? "failure" : "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    });
    offsetMs += Math.max(1, Math.round(du / 1000)) + randInt(1, 10);
  }

  const totalUs = sumUs + randInt(3_000, 40_000);
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: rand(["EFS file read", "EFS file write", "EFS metadata update"]),
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
      service: { name: "efs" },
    },
    labels: { "aws.efs.file_system_id": fsId },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  return [txDoc, ...spans];
}
