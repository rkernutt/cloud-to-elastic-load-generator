import type { EcsDocument } from "../helpers.js";
import {
  rand,
  randInt,
  gcpCloud,
  makeGcpSetup,
  randGceInstance,
  randTraceId,
  randSpanId,
} from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

const OPERATIONS = ["start", "stop", "restart"] as const;

export function generateComputeEngineTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "production", "staging", "dev"]);
  const operation = rand(OPERATIONS);
  const instance = randGceInstance();
  const otel = gcpOtelMeta("python");
  const svc = gcpServiceBase("infra-manager", env, "python", {
    runtimeName: "python",
    runtimeVersion: "3.12",
  });

  let offsetMs = 0;

  const apiUs = randInt(10_000, 500_000) * (isErr ? randInt(2, 5) : 1);
  const sApi = randSpanId();
  const spanApi: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: sApi,
      type: "external",
      subtype: "http",
      name: `compute.instances.${operation}`,
      duration: { us: apiUs },
      action: "call",
      destination: {
        service: { resource: "compute.googleapis.com", type: "external", name: "compute-api" },
      },
      labels: {
        instance_name: instance.name,
        instance_id: instance.id,
        ...(isErr ? { "gcp.rpc.status_code": "PERMISSION_DENIED" } : {}),
      },
    },
    service: svc,
    cloud: gcpCloud(region, project, "compute.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, sApi),
  };
  offsetMs += Math.max(1, Math.round(apiUs / 1000));

  const healthUs = randInt(1_000, 20_000);
  const sHealth = randSpanId();
  const isHealthCheck = Math.random() < 0.5;
  const spanHealth: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: sApi },
    span: {
      id: sHealth,
      type: "external",
      subtype: "http",
      name: isHealthCheck
        ? `GET /healthz ${instance.name}`
        : "GET metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
      duration: { us: healthUs },
      action: "call",
      destination: {
        service: {
          resource: isHealthCheck ? "healthcheck" : "metadata-server",
          type: "external",
          name: isHealthCheck ? "healthcheck" : "metadata-server",
        },
      },
    },
    service: svc,
    cloud: gcpCloud(region, project, "compute.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, sHealth),
  };

  const totalUs = apiUs + healthUs + randInt(500, 3000) * 1000;
  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `VM ${operation} instance`,
      type: "job",
      duration: { us: totalUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: 2, dropped: 0 },
    },
    service: svc,
    cloud: gcpCloud(region, project, "compute.googleapis.com"),
    labels: { "gcp.compute.zone": `${region}-${rand(["a", "b", "c"])}` },
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, spanApi, spanHealth];
}
