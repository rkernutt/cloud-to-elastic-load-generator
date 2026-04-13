/**
 * Apigee OTel trace: API proxy request chain — quota + auth + backend spans.
 */

import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";

const APM_AGENT = { name: "opentelemetry/nodejs", version: "1.x" } as const;
const APM_DS = { type: "traces", dataset: "apm", namespace: "default" } as const;

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

  let offsetMs = 0;

  // Span 1: quota check
  const quotaUs = randInt(500, 5_000);
  const sQuota = randSpanId();
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
    },
    service: {
      name: "apigee-gateway",
      environment: env,
      language: { name: "java" },
      runtime: { name: "java", version: "21" },
      framework: { name: "Apigee" },
    },
    cloud: gcpCloud(region, project, "apigee.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: "success" },
  };
  offsetMs += Math.max(1, Math.round(quotaUs / 1000));

  // Span 2: OAuth token verification
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
    },
    service: {
      name: "apigee-gateway",
      environment: env,
      language: { name: "java" },
      runtime: { name: "java", version: "21" },
      framework: { name: "Apigee" },
    },
    cloud: gcpCloud(region, project, "apigee.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: "success" },
  };
  offsetMs += Math.max(1, Math.round(authUs / 1000));

  // Span 3: backend service call
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
    },
    service: {
      name: "apigee-gateway",
      environment: env,
      language: { name: "java" },
      runtime: { name: "java", version: "21" },
      framework: { name: "Apigee" },
    },
    cloud: gcpCloud(region, project, "apigee.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
  };

  const totalUs = quotaUs + authUs + backendUs + randInt(200, 2000) * 1000;
  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `${method} /v1/${resource}`,
      type: "request",
      duration: { us: totalUs },
      result: isErr ? `HTTP ${backendStatus}` : "HTTP 2xx",
      sampled: true,
      span_count: { started: 3, dropped: 0 },
    },
    service: {
      name: "apigee-gateway",
      environment: env,
      language: { name: "java" },
      runtime: { name: "java", version: "21" },
      framework: { name: "Apigee" },
    },
    cloud: gcpCloud(region, project, "apigee.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
  };

  return [txDoc, spanQuota, spanAuth, spanBackend];
}
