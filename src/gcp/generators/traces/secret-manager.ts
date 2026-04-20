import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

export function generateSecretManagerTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging", "dev"]);
  const secretId = rand(["db-password", "stripe-api-key", "jwt-signing-key", "webhook-hmac"]);
  const version = rand(["latest", "3", "12"]);
  const otel = gcpOtelMeta("nodejs");
  const svc = gcpServiceBase("config-loader", env, "nodejs", {
    runtimeName: "nodejs",
    runtimeVersion: "20.x",
  });
  const cloud = gcpCloud(region, project, "secretmanager.googleapis.com");

  const u1 = randInt(600, 35_000);
  const u2 = randInt(500, 28_000);
  const u3 = randInt(1_000, 90_000);
  const u4 = randInt(2_000, 180_000) * (isErr ? randInt(2, 5) : 1);

  const failIdx = isErr ? randInt(0, 3) : -1;
  let offsetMs = 0;

  const s1 = randSpanId();
  const spanAccess: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: s1,
      type: "external",
      subtype: "secret_manager",
      name: `SecretManager.AccessSecretVersion`,
      duration: { us: u1 },
      action: "access",
      destination: {
        service: { resource: "secretmanager", type: "external", name: "secretmanager" },
      },
      labels: {
        "gcp.secret.id": secretId,
        ...(failIdx === 0 ? { "gcp.rpc.status_code": "INVALID_ARGUMENT" } : {}),
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
  const spanVersion: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s1 },
    span: {
      id: s2,
      type: "db",
      subtype: "secret_manager",
      name: `SecretVersion.resolve ${version}`,
      duration: { us: u2 },
      action: "query",
      destination: { service: { resource: "secret_version", type: "db", name: "secret_version" } },
      labels: failIdx === 1 ? { "gcp.rpc.status_code": "NOT_FOUND" } : {},
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
  const spanIam: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s2 },
    span: {
      id: s3,
      type: "external",
      subtype: "auth",
      name: "IAM.TestIamPermissions secrets",
      duration: { us: u3 },
      action: "verify",
      destination: { service: { resource: "iam", type: "external", name: "iam" } },
      labels: failIdx === 2 ? { "gcp.rpc.status_code": "PERMISSION_DENIED" } : {},
    },
    service: svc,
    cloud: gcpCloud(region, project, "iam.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: failIdx === 2 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s3),
  };
  offsetMs += Math.max(1, Math.round(u3 / 1000));

  const s4 = randSpanId();
  const spanPayload: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s3 },
    span: {
      id: s4,
      type: "external",
      subtype: "secret_manager",
      name: "SecretManager.payloadDelivery",
      duration: { us: u4 },
      action: "receive",
      destination: {
        service: { resource: "secret_payload", type: "external", name: "secret_payload" },
      },
      labels: failIdx === 3 ? { "gcp.rpc.status_code": "FAILED_PRECONDITION" } : {},
    },
    service: svc,
    cloud,
    data_stream: APM_DS,
    event: { outcome: failIdx === 3 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s4),
  };

  const totalUs = u1 + u2 + u3 + u4 + randInt(200, 2200) * 1000;
  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `Access secret ${secretId}`,
      type: "request",
      duration: { us: totalUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: 4, dropped: 0 },
    },
    service: svc,
    cloud,
    labels: { "gcp.secret.id": secretId, "gcp.secret.version": version },
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, spanAccess, spanVersion, spanIam, spanPayload];
}
