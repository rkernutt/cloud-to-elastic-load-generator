/**
 * GKE OTel trace: chained spans envoy ingress → api-server → worker → datastore.
 */

import type { EcsDocument } from "../helpers.js";
import {
  rand,
  randInt,
  gcpCloud,
  makeGcpSetup,
  randGkeCluster,
  randGkeNamespace,
  randGkePod,
  randTraceId,
  randSpanId,
} from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";

const APM_AGENT = { name: "opentelemetry/nodejs", version: "1.x" } as const;
const APM_DS = { type: "traces", dataset: "apm", namespace: "default" } as const;

export function generateGkeTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging", "dev"]);
  const cluster = randGkeCluster();
  const ns = randGkeNamespace();

  const envoyUs = randInt(800, 25_000);
  const apiUs = randInt(2000, 120_000);
  const workerUs = randInt(1500, 200_000);
  const dsUs = randInt(1000, 80_000);

  const sEnvoy = randSpanId();
  const sApi = randSpanId();
  const sWorker = randSpanId();
  const sDs = randSpanId();

  let offsetMs = 0;
  const mkCloud = (svc: string) => ({
    ...gcpCloud(region, project, svc),
    orchestrator: { cluster: { name: cluster }, namespace: ns },
  });

  const spanEnvoy: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: sEnvoy,
      type: "external",
      subtype: "envoy",
      name: `envoy ${rand(["ingress", "egress"])} ${rand(["route", "forward"])}`,
      duration: { us: envoyUs },
      action: "proxy",
      destination: { service: { resource: "envoy", type: "external", name: "envoy" } },
    },
    service: { name: "istio-ingressgateway", environment: env, language: { name: "cpp" } },
    cloud: mkCloud("container.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: "success" },
    kubernetes: { pod: { name: randGkePod() } },
  };
  offsetMs += Math.max(1, Math.round(envoyUs / 1000));

  const failIdx = isErr ? randInt(0, 2) : -1;
  const apiErr = failIdx === 0;
  const spanApi: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: sEnvoy },
    span: {
      id: sApi,
      type: "request",
      subtype: "http",
      name: `${rand(["GET", "POST"])} /api/${rand(["v1/orders", "v2/items", "internal/health"])}`,
      duration: { us: apiUs },
      action: "request",
      destination: { service: { resource: "api-server", type: "request", name: "api-server" } },
    },
    service: { name: "api-server", environment: env, language: { name: "go" }, runtime: { name: "go", version: "1.22" } },
    cloud: mkCloud("container.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: apiErr ? "failure" : "success" },
    kubernetes: { pod: { name: randGkePod() } },
  };
  offsetMs += Math.max(1, Math.round(apiUs / 1000));

  const workerErr = failIdx === 1;
  const spanWorker: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: sApi },
    span: {
      id: sWorker,
      type: "messaging",
      subtype: "worker",
      name: `process ${rand(["order.created", "inventory.sync", "payment.captured"])}`,
      duration: { us: workerUs },
      action: "process",
      destination: { service: { resource: "worker", type: "messaging", name: "worker" } },
    },
    service: { name: "order-worker", environment: env, language: { name: "java" }, runtime: { name: "java", version: "21" } },
    cloud: mkCloud("container.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: workerErr ? "failure" : "success" },
    kubernetes: { pod: { name: randGkePod() } },
  };
  offsetMs += Math.max(1, Math.round(workerUs / 1000));

  const dsErr = failIdx === 2;
  const spanDs: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: sWorker },
    span: {
      id: sDs,
      type: "db",
      subtype: "datastore",
      name: `Datastore.${rand(["lookup", "runQuery", "commit"])}`,
      duration: { us: dsUs },
      action: "query",
      db: { type: "nosql", statement: `${rand(["lookup", "query"])} ${rand(["Order", "LineItem", "Customer"])}` },
      destination: { service: { resource: "datastore", type: "db", name: "datastore" } },
    },
    service: { name: "order-worker", environment: env, language: { name: "java" }, runtime: { name: "java", version: "21" } },
    cloud: mkCloud("datastore.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: dsErr ? "failure" : "success" },
    kubernetes: { pod: { name: randGkePod() } },
  };

  const totalUs = envoyUs + apiUs + workerUs + dsUs + randInt(500, 5000) * 1000;
  const txErr = apiErr || workerErr || dsErr;

  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `${rand(["GET", "POST"])} /shop/${rand(["checkout", "cart", "product"])}`,
      type: "request",
      duration: { us: totalUs },
      result: txErr ? "HTTP 5xx" : "HTTP 2xx",
      sampled: true,
      span_count: { started: 4, dropped: 0 },
    },
    service: { name: "istio-ingressgateway", environment: env, language: { name: "cpp" } },
    cloud: mkCloud("container.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: txErr ? "failure" : "success" },
    kubernetes: { pod: { name: randGkePod() } },
  };

  return [txDoc, spanEnvoy, spanApi, spanWorker, spanDs];
}
