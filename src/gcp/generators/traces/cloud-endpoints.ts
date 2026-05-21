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

export function generateCloudEndpointsTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const service = rand(["orders-api.endpoints.globex.cloud.goog", "users-api.endpoints.globex.cloud.goog"]);
  const method = rand(["GET", "POST"]);
  const path = rand(["/v1/orders", "/v1/users", "/health"]);
  const otel = gcpOtelMeta("nodejs");
  const svc = gcpServiceBase("esp-proxy", env, "nodejs", {
    framework: "Express",
    runtimeName: "node",
    runtimeVersion: "20.x",
  });
  const cloud = gcpCloud(region, project, "endpoints.googleapis.com");

  const ops = [
    { name: `Endpoints.validateConfig ${service}`, resource: "endpoints", us: randInt(500, 18_000) },
    { name: `Endpoints.authCheck ${method}`, resource: "iam", us: randInt(1_000, 30_000) },
    { name: `Endpoints.proxy ${method} ${path}`, resource: "backend", us: randInt(3_000, 95_000) },
  ];
  const failIdx = isErr ? randInt(0, ops.length - 1) : -1;
  let offsetMs = 0;
  const spans: EcsDocument[] = [];
  let sum = 0;
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i]!;
    const sid = randSpanId();
    const spanErr = failIdx === i;
    sum += o.us;
    spans.push({
      "@timestamp": offsetTs(base, offsetMs),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sid,
        type: i === 2 ? "external" : "app",
        subtype: i === 2 ? "http" : "endpoints",
        name: o.name,
        duration: { us: o.us },
        action: i === 2 ? "call" : "process",
        destination: { service: { resource: o.resource, type: "app", name: o.resource } },
        labels: {
          "gcp.endpoints.service": service,
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
    offsetMs += Math.max(1, Math.round(o.us / 1000));
  }

  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `${method} ${path}`,
      type: "request",
      duration: { us: sum + randInt(1000, 6000) },
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
