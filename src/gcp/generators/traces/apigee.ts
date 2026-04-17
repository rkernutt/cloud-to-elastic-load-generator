import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;
const API_RESOURCES = ["orders", "products", "users", "payments"] as const;

export function generateApigeeTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "production", "staging", "dev"]);
  const method = rand(HTTP_METHODS);
  const resource = rand(API_RESOURCES);
  const otel = gcpOtelMeta("java");
  const svc = gcpServiceBase("apigee-gateway", env, "java", {
    framework: "Apigee",
    runtimeName: "java",
    runtimeVersion: "21",
  });

  let offsetMs = 0;

  const quotaUs = randInt(500, 5_000);
  const sQuota = randSpanId();
  const quotaErr = isErr && Math.random() < 0.25;
  const spanQuota: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: sQuota,
      type: "external",
      subtype: "quota",
      name: "Apigee quota check",
      duration: { us: quotaUs },
      action: "check",
      destination: { service: { resource: "quota-service", type: "external", name: "quota" } },
      labels: quotaErr ? { "gcp.rpc.status_code": "RESOURCE_EXHAUSTED", http_status: "429" } : {},
    },
    service: svc,
    cloud: gcpCloud(region, project, "apigee.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: quotaErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, sQuota),
  };
  offsetMs += Math.max(1, Math.round(quotaUs / 1000));

  const authUs = randInt(2_000, 30_000);
  const sAuth = randSpanId();
  const spanAuth: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: sAuth,
      type: "external",
      subtype: "auth",
      name: "OAuth token verification",
      duration: { us: authUs },
      action: "verify",
      destination: { service: { resource: "oauth-service", type: "external", name: "oauth" } },
      labels: isErr && !quotaErr ? { "gcp.rpc.status_code": "PERMISSION_DENIED" } : {},
    },
    service: svc,
    cloud: gcpCloud(region, project, "apigee.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: isErr && !quotaErr && Math.random() < 0.3 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, sAuth),
  };
  offsetMs += Math.max(1, Math.round(authUs / 1000));

  const backendUs = randInt(5_000, 200_000) * (isErr ? randInt(3, 8) : 1);
  const sBackend = randSpanId();
  const backendStatus = isErr ? rand([500, 502, 503, 504]) : rand([200, 201, 204]);
  const spanBackend: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: sBackend,
      type: "external",
      subtype: "http",
      name: `${method} backend/${resource}`,
      duration: { us: backendUs },
      action: "call",
      destination: {
        service: { resource: `backend-${resource}`, type: "external", name: `backend-${resource}` },
      },
      http: { response: { status_code: backendStatus } },
      labels: isErr ? { "gcp.apigee.target_response_code": String(backendStatus) } : {},
    },
    service: svc,
    cloud: gcpCloud(region, project, "apigee.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, sBackend),
  };

  const totalUs = quotaUs + authUs + backendUs + randInt(200, 2000) * 1000;
  const txErr = quotaErr || isErr;

  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `${method} /v1/${resource}`,
      type: "request",
      duration: { us: totalUs },
      result: quotaErr ? "HTTP 429" : isErr ? `HTTP ${backendStatus}` : "HTTP 2xx",
      sampled: true,
      span_count: { started: 3, dropped: 0 },
    },
    service: svc,
    cloud: gcpCloud(region, project, "apigee.googleapis.com"),
    labels: { "gcp.apigee.proxy": `${resource}-proxy`, "gcp.project_id": project.id },
    data_stream: APM_DS,
    event: { outcome: txErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, spanQuota, spanAuth, spanBackend];
}
