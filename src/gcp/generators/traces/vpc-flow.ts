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

export function generateVpcFlowTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const subnet = rand(["subnet-app-01", "subnet-data-02", "subnet-dmz"]);
  const otel = gcpOtelMeta("go");
  const svc = gcpServiceBase("flow-collector", env, "go", {
    runtimeName: "go",
    runtimeVersion: "1.23",
  });
  const cloud = gcpCloud(region, project, "compute.googleapis.com");

  const ops = [
    { name: "VpcFlow.capture", us: randInt(500, 12_000), resource: "vpc_flow" },
    { name: "VpcFlow.classify", us: randInt(300, 8_000), resource: "flow_classifier" },
    { name: `VpcFlow.export ${subnet}`, us: randInt(2_000, 45_000), resource: "logging_sink" },
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
        type: "app",
        subtype: "vpc",
        name: op.name,
        duration: { us: op.us },
        action: "process",
        destination: { service: { resource: op.resource, type: "app", name: op.resource } },
        labels: {
          "gcp.subnetwork": subnet,
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
      name: `VPC flow log batch (${subnet})`,
      type: "request",
      duration: { us: sum + randInt(500, 5000) },
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
