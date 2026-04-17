import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

export function generateCloudArmorTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const otel = gcpOtelMeta("java");
  const svc = gcpServiceBase("edge-proxy", env, "java", {
    framework: "Envoy",
    runtimeName: "java",
    runtimeVersion: "21",
  });
  const armorCloud = gcpCloud(region, project, "compute.googleapis.com");
  const backendCloud = gcpCloud(region, project, "run.googleapis.com");

  const sWaf = randSpanId();
  const sBe = randSpanId();
  const u1 = randInt(500, 35_000);
  const u2 = randInt(2_000, 280_000);
  const wafErr = isErr && randInt(0, 1) === 0;
  const beErr = isErr && !wafErr;

  const spanWaf: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: sWaf,
      type: "app",
      subtype: "security",
      name: "CloudArmor.EvaluateSecurityPolicy",
      duration: { us: u1 },
      action: "process",
      destination: { service: { resource: "cloud_armor", type: "app", name: "cloud_armor" } },
      labels: {
        "gcp.security_policy": "public-api-edge",
        ...(wafErr
          ? { "gcp.cloud_armor.outcome": "deny" }
          : { "gcp.cloud_armor.outcome": "allow" }),
      },
    },
    service: svc,
    cloud: armorCloud,
    data_stream: APM_DS,
    event: { outcome: wafErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, sWaf),
  };

  const spanBackend: EcsDocument = {
    "@timestamp": offsetTs(base, Math.max(1, Math.round(u1 / 1000))),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: sBe,
      type: "external",
      subtype: "http",
      name: "HTTP GET /api/v1/catalog",
      duration: { us: u2 },
      action: "call",
      destination: { service: { resource: "https", type: "external", name: "https" } },
      labels: beErr ? { "http.status_code": "503" } : { "http.status_code": "200" },
    },
    service: svc,
    cloud: backendCloud,
    data_stream: APM_DS,
    event: { outcome: wafErr ? "failure" : beErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, sBe),
  };

  const totalUs = u1 + u2 + randInt(500, 8_000);
  const txErr = wafErr || beErr;
  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: "GET /api/v1/catalog",
      type: "request",
      duration: { us: totalUs },
      result: txErr ? "HTTP 403" : "HTTP 2xx",
      sampled: true,
      span_count: { started: 2, dropped: 0 },
    },
    service: svc,
    cloud: armorCloud,
    data_stream: APM_DS,
    event: { outcome: txErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, spanWaf, spanBackend];
}
