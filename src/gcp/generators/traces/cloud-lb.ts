import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

const HTTP_METHODS = ["GET", "POST", "PUT"] as const;

export function generateCloudLbTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const method = rand(HTTP_METHODS);
  const path = rand(["/api/orders", "/api/users", "/health", "/static/assets"]);
  const backend = rand(["neg-prod-api", "neg-checkout", "neg-static"]);
  const otel = gcpOtelMeta("go");
  const svc = gcpServiceBase("https-lb-proxy", env, "go", {
    runtimeName: "go",
    runtimeVersion: "1.22",
  });
  const cloud = gcpCloud(region, project, "compute.googleapis.com");

  const u1 = randInt(800, 45_000);
  const u2 = randInt(400, 25_000);
  const u3 = randInt(2_000, 120_000);
  const u4 = randInt(5_000, 400_000) * (isErr ? randInt(2, 5) : 1);

  const failIdx = isErr ? randInt(0, 3) : -1;
  let offsetMs = 0;

  const s1 = randSpanId();
  const spanHttp: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: s1,
      type: "request",
      subtype: "http",
      name: `HTTP ${method} ${path}`,
      duration: { us: u1 },
      action: "receive",
      destination: { service: { resource: "https_lb", type: "request", name: "https_lb" } },
      labels:
        failIdx === 0
          ? { "http.status_code": "400", "gcp.load_balancer.type": "EXTERNAL_MANAGED" }
          : {},
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
  const spanBackend: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s1 },
    span: {
      id: s2,
      type: "app",
      subtype: "load_balancer",
      name: `BackendService.select ${backend}`,
      duration: { us: u2 },
      action: "process",
      destination: {
        service: { resource: "backend_service", type: "app", name: "backend_service" },
      },
      labels: {
        "gcp.backend_service": backend,
        ...(failIdx === 1 ? { "gcp.rpc.status_code": "FAILED_PRECONDITION" } : {}),
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
  const spanHealth: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s2 },
    span: {
      id: s3,
      type: "external",
      subtype: "http",
      name: "HealthCheck.probe",
      duration: { us: u3 },
      action: "call",
      destination: {
        service: { resource: "health_check", type: "external", name: "health_check" },
      },
      labels:
        failIdx === 2
          ? { "gcp.health_check.result": "UNHEALTHY" }
          : { "gcp.health_check.result": "HEALTHY" },
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
  const spanForward: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s3 },
    span: {
      id: s4,
      type: "external",
      subtype: "http",
      name: `ForwardingRule.route ${path}`,
      duration: { us: u4 },
      action: "call",
      destination: {
        service: { resource: "backend_target", type: "external", name: "backend_target" },
      },
      labels:
        failIdx === 3
          ? { "http.status_code": "502", "gcp.rpc.status_code": "UNAVAILABLE" }
          : { "http.status_code": "200" },
    },
    service: svc,
    cloud,
    data_stream: APM_DS,
    event: { outcome: failIdx === 3 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s4),
  };

  const totalUs = u1 + u2 + u3 + u4 + randInt(200, 3000) * 1000;
  const txErr = isErr;
  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `${method} ${path} via HTTPS LB`,
      type: "request",
      duration: { us: totalUs },
      result: txErr ? "failure" : "success",
      sampled: true,
      span_count: { started: 4, dropped: 0 },
    },
    service: svc,
    cloud,
    labels: { "gcp.forwarding_rule": "public-https-fr", "gcp.url_map": "api-url-map" },
    data_stream: APM_DS,
    event: { outcome: txErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, spanHttp, spanBackend, spanHealth, spanForward];
}
