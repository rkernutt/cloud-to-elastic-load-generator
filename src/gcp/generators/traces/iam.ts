import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

export function generateIamTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const resource = rand([
    "projects/-/buckets/assets-prod",
    "projects/-/secrets/db-password",
    "projects/-/instances/api-db",
  ]);
  const permission = rand([
    "storage.objects.get",
    "secretmanager.versions.access",
    "compute.instances.get",
  ]);
  const otel = gcpOtelMeta("java");
  const svc = gcpServiceBase("policy-engine", env, "java", {
    runtimeName: "java",
    runtimeVersion: "21",
  });
  const cloud = gcpCloud(region, project, "iam.googleapis.com");

  const u1 = randInt(600, 35_000);
  const u2 = randInt(1_000, 85_000);
  const u3 = randInt(800, 55_000);
  const u4 = randInt(400, 35_000);

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
      subtype: "auth",
      name: "IAM.TestIamPermissions",
      duration: { us: u1 },
      action: "check",
      destination: { service: { resource: "iam", type: "external", name: "iam" } },
      labels: {
        "gcp.iam.resource": resource,
        "gcp.iam.permission": permission,
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
  const spanPolicy: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s1 },
    span: {
      id: s2,
      type: "db",
      subtype: "iam",
      name: "IAM.policyLookup",
      duration: { us: u2 },
      action: "query",
      destination: { service: { resource: "iam_policy", type: "db", name: "iam_policy" } },
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
  const spanCondition: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s2 },
    span: {
      id: s3,
      type: "app",
      subtype: "iam",
      name: "IAM.evaluateConditions",
      duration: { us: u3 },
      action: "process",
      destination: { service: { resource: "iam_conditions", type: "app", name: "iam_conditions" } },
      labels:
        failIdx === 2
          ? { "gcp.iam.condition_result": "false" }
          : { "gcp.iam.condition_result": "true" },
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
  const spanDecision: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s3 },
    span: {
      id: s4,
      type: "external",
      subtype: "auth",
      name: "IAM.authorizationDecision",
      duration: { us: u4 },
      action: "authorize",
      destination: {
        service: { resource: "iam_decision", type: "external", name: "iam_decision" },
      },
      labels:
        failIdx === 3
          ? { "gcp.iam.decision": "DENY", "gcp.rpc.status_code": "PERMISSION_DENIED" }
          : { "gcp.iam.decision": "ALLOW" },
    },
    service: svc,
    cloud,
    data_stream: APM_DS,
    event: { outcome: failIdx === 3 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s4),
  };

  const totalUs = u1 + u2 + u3 + u4 + randInt(200, 2500) * 1000;
  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `IAM evaluate ${permission}`,
      type: "request",
      duration: { us: totalUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: 4, dropped: 0 },
    },
    service: svc,
    cloud,
    labels: { "gcp.iam.resource": resource },
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, spanAccess, spanPolicy, spanCondition, spanDecision];
}
