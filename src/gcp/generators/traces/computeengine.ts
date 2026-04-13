/**
 * Compute Engine OTel trace: VM instance lifecycle management + health check spans.
 */

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

const APM_AGENT = { name: "opentelemetry/nodejs", version: "1.x" } as const;
const APM_DS = { type: "traces", dataset: "apm", namespace: "default" } as const;

const OPERATIONS = ["start", "stop", "restart"] as const;

export function generateComputeEngineTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "production", "staging", "dev"]);
  const operation = rand(OPERATIONS);
  const instance = randGceInstance();

  let offsetMs = 0;

  // Span 1: Compute Engine API call
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
      name: `instances.${operation}`,
      duration: { us: apiUs },
      action: "call",
      destination: {
        service: { resource: "compute.googleapis.com", type: "external", name: "compute-api" },
      },
      labels: { instance_name: instance.name, instance_id: instance.id },
    },
    service: {
      name: "infra-manager",
      environment: env,
      language: { name: "python" },
      runtime: { name: "python", version: "3.12" },
    },
    cloud: gcpCloud(region, project, "compute.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
  };
  offsetMs += Math.max(1, Math.round(apiUs / 1000));

  // Span 2: health check or metadata server call
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
        ? `GET /healthcheck ${instance.name}`
        : "GET metadata.google.internal/computeMetadata",
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
    service: {
      name: "infra-manager",
      environment: env,
      language: { name: "python" },
      runtime: { name: "python", version: "3.12" },
    },
    cloud: gcpCloud(region, project, "compute.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: "success" },
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
    service: {
      name: "infra-manager",
      environment: env,
      language: { name: "python" },
      runtime: { name: "python", version: "3.12" },
    },
    cloud: gcpCloud(region, project, "compute.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
  };

  return [txDoc, spanApi, spanHealth];
}
