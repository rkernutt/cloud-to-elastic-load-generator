/**
 * Network Load Balancer OTel trace generator.
 *
 * Simulates TCP/UDP pass-through: flow hash, target selection, backend forward,
 * and connection tracking for layer-4 workloads.
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
  randHex,
  awsSpanErrorLabels,
} from "./helpers.js";

const APPS = [
  {
    name: "grpc-gateway",
    language: "go",
    framework: null,
    runtimeName: "go",
    runtimeVersion: "1.23.4",
  },
  {
    name: "game-udp-server",
    language: "java",
    framework: "Netty",
    runtimeName: "OpenJDK",
    runtimeVersion: "21.0.3",
  },
];

export function generateNlbTrace(ts: string, er: number) {
  const cfg = rand(APPS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "production", "staging", "dev"]);
  const isErr = Math.random() < er;
  const lbName = rand(["nlb-grpc-prod", "nlb-udp-gaming", "nlb-tcp-data"]);
  const targetGroup = rand(["tg-grpc-v1", "tg-udp-shard-2", "tg-tcp-primary"]);
  const targetId = `i-${newTraceId().slice(0, 17)}`;
  const protocol = rand(["TCP", "UDP", "TLS"]);

  const svcBlock = serviceBlock(
    cfg.name,
    env,
    cfg.language,
    cfg.framework,
    cfg.runtimeName,
    cfg.runtimeVersion
  );
  const { agent, telemetry } = otelBlocks(cfg.language as "go" | "java", "elastic");

  const phases: Array<{
    name: string;
    type: string;
    subtype: string;
    action: string;
    resource: string;
    us: number;
    labels: Record<string, string>;
  }> = [
    {
      name: "NLB.flow-hash",
      type: "app",
      subtype: "nlb",
      action: "hash",
      resource: "nlb",
      us: randInt(200, 8_000),
      labels: { "aws.elb.load_balancer": `net/${lbName}/${randHex(6)}`, protocol },
    },
    {
      name: "NLB.target-selection",
      type: "app",
      subtype: "nlb",
      action: "route",
      resource: "nlb",
      us: randInt(300, 15_000),
      labels: { "aws.elb.target_group": targetGroup },
    },
    {
      name: `NLB.forward ${protocol}`,
      type: "external",
      subtype: protocol.toLowerCase(),
      action: "forward",
      resource: protocol.toLowerCase(),
      us: randInt(1_000, 85_000),
      labels: {
        "aws.elb.target_group": targetGroup,
        "aws.ec2.instance_id": targetId,
        "net.peer.port": String(rand([443, 8443, 53, 9000])),
      },
    },
    {
      name: "NLB.connection-track",
      type: "app",
      subtype: "nlb",
      action: "track",
      resource: "nlb",
      us: randInt(150, 6_000),
      labels: { "aws.elb.target_group": targetGroup, connection_state: "active" },
    },
  ];

  let offsetMs = randInt(1, 5);
  const spans: Record<string, unknown>[] = [];
  let sumUs = 0;
  for (let i = 0; i < phases.length; i++) {
    const ph = phases[i]!;
    const spanErr = isErr && i === 2;
    const du = spanErr ? randInt(80_000, 500_000) : ph.us;
    sumUs += du;
    spans.push({
      "@timestamp": offsetTs(new Date(ts), offsetMs),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: newSpanId(),
        type: ph.type,
        subtype: ph.subtype,
        name: ph.name,
        duration: { us: du },
        action: ph.action,
        destination: { service: { resource: ph.resource, type: ph.type, name: ph.resource } },
      },
      service: svcBlock,
      agent,
      telemetry,
      labels: { ...ph.labels, ...(spanErr ? awsSpanErrorLabels() : {}) },
      event: { outcome: spanErr ? "failure" : "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    });
    offsetMs += Math.max(1, Math.round(du / 1000)) + randInt(1, 5);
  }

  const totalUs = sumUs + randInt(500, 12_000);
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: rand([`${protocol} :443`, `${protocol} :9000`, "UDP session"]),
      type: "request",
      duration: { us: totalUs },
      result: isErr ? "connection_reset" : "success",
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
      service: { name: "nlb" },
    },
    labels: { "aws.elb.load_balancer": lbName, protocol },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  return [txDoc, ...spans];
}
