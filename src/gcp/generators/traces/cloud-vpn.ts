import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

export function generateCloudVpnTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const tunnel = rand(["vpn-to-partner", "vpn-transit-dc", "vpn-dr-site"]);
  const peer = rand(["203.0.113.10", "198.51.100.44", "192.0.2.9"]);
  const otel = gcpOtelMeta("go");
  const svc = gcpServiceBase("vpn-gateway-agent", env, "go", {
    runtimeName: "go",
    runtimeVersion: "1.22",
  });
  const cloud = gcpCloud(region, project, "compute.googleapis.com");

  const u1 = randInt(2_000, 120_000);
  const u2 = randInt(5_000, 400_000);
  const u3 = randInt(3_000, 250_000);
  const u4 = randInt(8_000, 900_000) * (isErr ? randInt(2, 4) : 1);

  const failIdx = isErr ? randInt(0, 3) : -1;
  let offsetMs = 0;

  const s1 = randSpanId();
  const spanSetup: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: s1,
      type: "external",
      subtype: "vpn",
      name: `VPN.connectionSetup ${tunnel}`,
      duration: { us: u1 },
      action: "connect",
      destination: { service: { resource: "vpn_tunnel", type: "external", name: "vpn_tunnel" } },
      labels: {
        "gcp.vpn.peer_ip": peer,
        ...(failIdx === 0 ? { "gcp.vpn.phase": "setup_failed" } : { "gcp.vpn.phase": "init" }),
      },
    },
    service: svc,
    cloud,
    data_stream: APM_DS,
    event: { outcome: failIdx === 0 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s1),
  };
  offsetMs += Math.max(1, Math.round(u1 / 1000));

  const s2 = randSpanId();
  const spanIke: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s1 },
    span: {
      id: s2,
      type: "external",
      subtype: "vpn",
      name: "VPN.ikeNegotiation",
      duration: { us: u2 },
      action: "process",
      destination: { service: { resource: "ike", type: "external", name: "ike" } },
      labels: failIdx === 1 ? { "gcp.vpn.ike": "auth_failed" } : { "gcp.vpn.ike": "established" },
    },
    service: svc,
    cloud,
    data_stream: APM_DS,
    event: { outcome: failIdx === 1 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s2),
  };
  offsetMs += Math.max(1, Math.round(u2 / 1000));

  const s3 = randSpanId();
  const spanTunnel: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s2 },
    span: {
      id: s3,
      type: "external",
      subtype: "vpn",
      name: "VPN.tunnelEstablish",
      duration: { us: u3 },
      action: "connect",
      destination: { service: { resource: "ipsec", type: "external", name: "ipsec" } },
      labels:
        failIdx === 2 ? { "gcp.vpn.tunnel_status": "DOWN" } : { "gcp.vpn.tunnel_status": "UP" },
    },
    service: svc,
    cloud,
    data_stream: APM_DS,
    event: { outcome: failIdx === 2 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s3),
  };
  offsetMs += Math.max(1, Math.round(u3 / 1000));

  const s4 = randSpanId();
  const spanData: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s3 },
    span: {
      id: s4,
      type: "external",
      subtype: "network",
      name: "VPN.encapsulatedTransfer",
      duration: { us: u4 },
      action: "transfer",
      destination: {
        service: { resource: "vpn_data_plane", type: "external", name: "vpn_data_plane" },
      },
      labels: failIdx === 3 ? { "gcp.vpn.error": "replay_detected" } : {},
    },
    service: svc,
    cloud,
    data_stream: APM_DS,
    event: { outcome: failIdx === 3 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s4),
  };

  const totalUs = u1 + u2 + u3 + u4 + randInt(300, 4500) * 1000;
  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `Cloud VPN session (${tunnel})`,
      type: "request",
      duration: { us: totalUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: 4, dropped: 0 },
    },
    service: svc,
    cloud,
    labels: { "gcp.vpn.tunnel": tunnel, "gcp.vpn.peer_gateway": peer },
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, spanSetup, spanIke, spanTunnel, spanData];
}
