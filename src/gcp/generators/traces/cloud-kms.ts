import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

const OPS = ["Encrypt", "Decrypt", "AsymmetricSign"] as const;

export function generateCloudKmsTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const op = rand(OPS);
  const keyRing = rand(["app-keys", "payments-hsm", "data-encryption"]);
  const key = rand(["tls-leaf", "token-signer", "disk-dek"]);
  const otel = gcpOtelMeta("java");
  const svc = gcpServiceBase("secrets-worker", env, "java", {
    runtimeName: "java",
    runtimeVersion: "21",
  });
  const cloud = gcpCloud(region, project, "cloudkms.googleapis.com");

  const u1 = randInt(800, 40_000);
  const u2 = randInt(500, 35_000);
  const u3 = randInt(2_000, 250_000) * (isErr ? randInt(2, 6) : 1);
  const u4 = randInt(400, 25_000);

  const failIdx = isErr ? randInt(0, 3) : -1;
  let offsetMs = 0;

  const s1 = randSpanId();
  const spanOp: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: s1,
      type: "external",
      subtype: "kms",
      name: `KMS.${op}`,
      duration: { us: u1 },
      action: op.toLowerCase(),
      destination: { service: { resource: "cloudkms", type: "external", name: "cloudkms" } },
      labels: failIdx === 0 ? { "gcp.rpc.status_code": "INVALID_ARGUMENT" } : {},
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
  const spanRing: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s1 },
    span: {
      id: s2,
      type: "db",
      subtype: "kms",
      name: `KeyRing.lookup ${keyRing}`,
      duration: { us: u2 },
      action: "access",
      destination: { service: { resource: "key_ring", type: "db", name: "key_ring" } },
      labels: {
        "gcp.kms.key_ring": keyRing,
        ...(failIdx === 1 ? { "gcp.rpc.status_code": "NOT_FOUND" } : {}),
      },
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
  const spanCrypto: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s2 },
    span: {
      id: s3,
      type: "external",
      subtype: "kms",
      name: `CryptoOperation.${op} ${key}`,
      duration: { us: u3 },
      action: "execute",
      destination: { service: { resource: "crypto_keys", type: "external", name: "crypto_keys" } },
      labels: {
        "gcp.kms.crypto_key": key,
        ...(failIdx === 2 ? { "gcp.rpc.status_code": "PERMISSION_DENIED" } : {}),
      },
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
  const spanAudit: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s3 },
    span: {
      id: s4,
      type: "messaging",
      subtype: "pubsub",
      name: "AuditLog.publish kms.googleapis.com",
      duration: { us: u4 },
      action: "send",
      destination: { service: { resource: "audit_logs", type: "messaging", name: "audit_logs" } },
      labels: failIdx === 3 ? { "gcp.rpc.status_code": "UNAVAILABLE" } : {},
    },
    service: gcpServiceBase("audit-publisher", env, "go", {
      runtimeName: "go",
      runtimeVersion: "1.22",
    }),
    cloud: gcpCloud(region, project, "logging.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: failIdx === 3 ? "failure" : "success" },
    ...gcpOtelMeta("go"),
    ...gcpCloudTraceMeta(project.id, traceId, s4),
  };

  const totalUs = u1 + u2 + u3 + u4 + randInt(200, 2500) * 1000;
  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `KMS ${op} ${key}`,
      type: "request",
      duration: { us: totalUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: 4, dropped: 0 },
    },
    service: svc,
    cloud,
    labels: { "gcp.kms.key_ring": keyRing, "gcp.kms.crypto_key": key },
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, spanOp, spanRing, spanCrypto, spanAudit];
}
