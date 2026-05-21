import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import {
  APM_DS,
  gcpCloudTraceMeta,
  gcpOtelMeta,
  gcpServiceBase,
  gcpSpanFailureLabels,
} from "./trace-kit.js";

export function generateCloudInterconnectTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const attachment = rand(["ic-attachment-dc1", "ic-partner-equinix", "ic-dedicated-10g"]);
  const otel = gcpOtelMeta("java");
  const svc = gcpServiceBase("hybrid-router", env, "java", {
    framework: "Spring",
    runtimeName: "OpenJDK",
    runtimeVersion: "21",
  });
  const cloud = gcpCloud(region, project, "compute.googleapis.com");

  const ops = [
    { name: "Interconnect.BGP.session", resource: "bgp", us: randInt(2_000, 40_000) },
    { name: `Interconnect.VLAN.attach ${attachment}`, resource: "vlan_attachment", us: randInt(1_500, 30_000) },
    { name: "Interconnect.route-advertise", resource: "cloud_router", us: randInt(3_000, 55_000) },
  ];
  const failIdx = isErr ? randInt(0, ops.length - 1) : -1;
  let offsetMs = 0;
  const spans: EcsDocument[] = [];
  let sum = 0;
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]!;
    const sid = randSpanId();
    const spanErr = failIdx === i;
    sum += op.us;
    spans.push({
      "@timestamp": offsetTs(base, offsetMs),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sid,
        type: "external",
        subtype: "network",
        name: op.name,
        duration: { us: op.us },
        action: "connect",
        destination: { service: { resource: op.resource, type: "external", name: op.resource } },
        labels: {
          "gcp.interconnect.attachment": attachment,
          ...(spanErr ? gcpSpanFailureLabels() : {}),
        },
      },
      service: svc,
      cloud,
      data_stream: APM_DS,
      event: { outcome: spanErr ? "failure" : "success" },
      ...otel,
      ...gcpCloudTraceMeta(project.id, traceId, sid),
    });
    offsetMs += Math.max(1, Math.round(op.us / 1000));
  }

  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `Hybrid route sync (${attachment})`,
      type: "request",
      duration: { us: sum + randInt(2000, 12000) },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: spans.length, dropped: 0 },
    },
    service: svc,
    cloud,
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };
  return [txDoc, ...spans];
}
