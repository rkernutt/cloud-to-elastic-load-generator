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
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

export function generateGkeTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging", "dev"]);
  const cluster = randGkeCluster();
  const ns = randGkeNamespace();
  const otelGw = gcpOtelMeta("cpp");

  const mkCloud = (svc: string) => ({
    ...gcpCloud(region, project, svc),
    orchestrator: { cluster: { name: cluster }, namespace: ns },
  });

  const envoyUs = randInt(800, 25_000);
  const routeUs = randInt(400, 12_000);
  const apiUs = randInt(2000, 120_000);
  const grpcUs = randInt(1500, 95_000);
  const poolUs = randInt(800, 45_000);
  const workerUs = randInt(1500, 200_000);
  const dsUs = randInt(1000, 80_000);

  const sEnvoy = randSpanId();
  const sRoute = randSpanId();
  const sApi = randSpanId();
  const sGrpc = randSpanId();
  const sPool = randSpanId();
  const sWorker = randSpanId();
  const sDs = randSpanId();

  const failIdx = isErr ? randInt(0, 4) : -1;
  let offsetMs = 0;

  const gwSvc = gcpServiceBase("istio-ingressgateway", env, "cpp");

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
      name: `envoy.${rand(["ingress", "sidecar"])} ${rand(["decode", "encode"])}`,
      duration: { us: envoyUs },
      action: "proxy",
      destination: { service: { resource: "envoy", type: "external", name: "envoy" } },
      labels: { "istio.canonical_service": "istio-ingressgateway" },
    },
    service: gwSvc,
    cloud: mkCloud("container.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: "success" },
    kubernetes: { pod: { name: randGkePod() } },
    ...otelGw,
    ...gcpCloudTraceMeta(project.id, traceId, sEnvoy),
  };
  offsetMs += Math.max(1, Math.round(envoyUs / 1000));

  const spanRoute: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: sEnvoy },
    span: {
      id: sRoute,
      type: "external",
      subtype: "envoy",
      name: `route ${rand(["shop-api", "checkout-api"])}.${ns}.svc.cluster.local`,
      duration: { us: routeUs },
      action: "route",
      destination: { service: { resource: "envoy", type: "external", name: "envoy" } },
    },
    service: gwSvc,
    cloud: mkCloud("container.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: "success" },
    kubernetes: { pod: { name: randGkePod() } },
    ...otelGw,
    ...gcpCloudTraceMeta(project.id, traceId, sRoute),
  };
  offsetMs += Math.max(1, Math.round(routeUs / 1000));

  const otelGo = gcpOtelMeta("go");
  const apiSvc = gcpServiceBase("api-server", env, "go", {
    runtimeName: "go",
    runtimeVersion: "1.22",
  });
  const spanApi: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: sRoute },
    span: {
      id: sApi,
      type: "request",
      subtype: "http",
      name: `${rand(["GET", "POST"])} /api/${rand(["v1/orders", "v2/items", "internal/health"])}`,
      duration: { us: apiUs },
      action: "request",
      destination: { service: { resource: "api-server", type: "request", name: "api-server" } },
      labels: failIdx === 0 ? { "gcp.rpc.status_code": "RESOURCE_EXHAUSTED" } : {},
    },
    service: apiSvc,
    cloud: mkCloud("container.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: failIdx === 0 ? "failure" : "success" },
    kubernetes: { pod: { name: randGkePod() } },
    ...otelGo,
    ...gcpCloudTraceMeta(project.id, traceId, sApi),
  };
  offsetMs += Math.max(1, Math.round(apiUs / 1000));

  const spanGrpc: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: sApi },
    span: {
      id: sGrpc,
      type: "external",
      subtype: "grpc",
      name: `grpc.${rand(["inventory.Inventory", "payments.Payments"])}.${rand(["Reserve", "Capture"])}`,
      duration: { us: grpcUs },
      action: "call",
      destination: { service: { resource: "worker", type: "external", name: "grpc" } },
      labels: failIdx === 1 ? { "grpc.status_code": "DEADLINE_EXCEEDED" } : {},
    },
    service: apiSvc,
    cloud: mkCloud("container.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: failIdx === 1 ? "failure" : "success" },
    kubernetes: { pod: { name: randGkePod() } },
    ...otelGo,
    ...gcpCloudTraceMeta(project.id, traceId, sGrpc),
  };
  offsetMs += Math.max(1, Math.round(grpcUs / 1000));

  const spanPool: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: sGrpc },
    span: {
      id: sPool,
      type: "db",
      subtype: "postgresql",
      name: "jdbc.acquireConnection checkout-pool",
      duration: { us: poolUs },
      action: "connect",
      destination: { service: { resource: "cloudsql", type: "db", name: "cloudsql" } },
      labels: failIdx === 2 ? { "gcp.rpc.status_code": "UNAVAILABLE" } : {},
    },
    service: apiSvc,
    cloud: gcpCloud(region, project, "sqladmin.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: failIdx === 2 ? "failure" : "success" },
    kubernetes: { pod: { name: randGkePod() } },
    ...otelGo,
    ...gcpCloudTraceMeta(project.id, traceId, sPool),
  };
  offsetMs += Math.max(1, Math.round(poolUs / 1000));

  const workerSvc = gcpServiceBase("order-worker", env, "java", {
    framework: "Spring Boot",
    runtimeName: "java",
    runtimeVersion: "21",
  });
  const spanWorker: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: sGrpc },
    span: {
      id: sWorker,
      type: "messaging",
      subtype: "kafka",
      name: `consume ${rand(["order.created", "inventory.sync", "payment.captured"])}`,
      duration: { us: workerUs },
      action: "process",
      destination: { service: { resource: "kafka", type: "messaging", name: "kafka" } },
      labels: failIdx === 3 ? { "gcp.rpc.status_code": "ABORTED" } : {},
    },
    service: workerSvc,
    cloud: mkCloud("container.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: failIdx === 3 ? "failure" : "success" },
    kubernetes: { pod: { name: randGkePod() } },
    ...gcpOtelMeta("java"),
    ...gcpCloudTraceMeta(project.id, traceId, sWorker),
  };
  offsetMs += Math.max(1, Math.round(workerUs / 1000));

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
      db: {
        type: "nosql",
        statement: `${rand(["lookup", "query"])} ${rand(["Order", "LineItem", "Customer"])}`,
      },
      destination: { service: { resource: "datastore", type: "db", name: "datastore" } },
      labels: failIdx === 4 ? { "gcp.rpc.status_code": "PERMISSION_DENIED" } : {},
    },
    service: workerSvc,
    cloud: gcpCloud(region, project, "datastore.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: failIdx === 4 ? "failure" : "success" },
    kubernetes: { pod: { name: randGkePod() } },
    ...gcpOtelMeta("java"),
    ...gcpCloudTraceMeta(project.id, traceId, sDs),
  };

  const totalUs =
    envoyUs + routeUs + apiUs + grpcUs + poolUs + workerUs + dsUs + randInt(500, 5000) * 1000;
  const txErr = failIdx >= 0;

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
      span_count: { started: 7, dropped: 0 },
    },
    service: gwSvc,
    cloud: mkCloud("container.googleapis.com"),
    labels: {
      "gcp.gke.cluster": cluster,
      "gcp.k8s.namespace": ns,
    },
    data_stream: APM_DS,
    event: { outcome: txErr ? "failure" : "success" },
    kubernetes: { pod: { name: randGkePod() } },
    ...otelGw,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, spanEnvoy, spanRoute, spanApi, spanGrpc, spanPool, spanWorker, spanDs];
}
