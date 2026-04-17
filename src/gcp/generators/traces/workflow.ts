import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

export function generateEcommerceOrderTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const otel = gcpOtelMeta("nodejs");
  const checkout = gcpServiceBase("checkout-api", env, "nodejs", {
    framework: "Cloud Run",
    runtimeName: "nodejs",
    runtimeVersion: "20.x",
  });
  let offsetMs = 0;

  const runUs = randInt(5000, 120_000);
  const spUs = randInt(8000, 400_000);
  const pubUs = randInt(1200, 85_000);
  const fnUs = randInt(4000, 350_000);

  const failIdx = isErr ? randInt(0, 3) : -1;
  const sRun = randSpanId();
  const s1 = randSpanId();
  const s2 = randSpanId();
  const s3 = randSpanId();

  const spanRun: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: sRun,
      type: "request",
      subtype: "http",
      name: `${rand(["POST"])} /v1/checkout/confirm`,
      duration: { us: runUs },
      action: "request",
      destination: { service: { resource: "run", type: "request", name: "run" } },
      labels: failIdx === 0 ? { "gcp.rpc.status_code": "RESOURCE_EXHAUSTED" } : {},
    },
    service: checkout,
    cloud: gcpCloud(region, project, "run.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: failIdx === 0 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, sRun),
  };
  offsetMs += Math.max(1, Math.round(runUs / 1000));

  const spanSpanner: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: s1,
      type: "db",
      subtype: "spanner",
      name: "Spanner.CommitTransaction orders_rw",
      duration: { us: spUs },
      action: "commit",
      db: { type: "sql", statement: "COMMIT /* order insert + inventory */" },
      destination: { service: { resource: "spanner", type: "db", name: "spanner" } },
      labels: failIdx === 1 ? { "gcp.rpc.status_code": "ABORTED" } : {},
    },
    service: checkout,
    cloud: gcpCloud(region, project, "spanner.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: failIdx === 1 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s1),
  };
  offsetMs += Math.max(1, Math.round(spUs / 1000));

  const spanPub: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s1 },
    span: {
      id: s2,
      type: "messaging",
      subtype: "pubsub",
      name: "PubSub.publish order-fulfillment",
      duration: { us: pubUs },
      action: "send",
      destination: { service: { resource: "pubsub", type: "messaging", name: "pubsub" } },
      labels: failIdx === 2 ? { "gcp.rpc.status_code": "DEADLINE_EXCEEDED" } : {},
    },
    service: checkout,
    cloud: gcpCloud(region, project, "pubsub.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: failIdx === 2 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s2),
  };
  offsetMs += Math.max(1, Math.round(pubUs / 1000));

  const spanFn: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s2 },
    span: {
      id: s3,
      type: "request",
      subtype: "cloud_functions",
      name: "functions.fulfill_order",
      duration: { us: fnUs },
      action: "invoke",
      destination: {
        service: { resource: "cloudfunctions", type: "request", name: "cloudfunctions" },
      },
      labels: failIdx === 3 ? { "gcp.rpc.status_code": "PERMISSION_DENIED" } : {},
    },
    service: gcpServiceBase("fulfillment-fn", env, "nodejs", {
      framework: "Google Cloud Functions",
      runtimeName: "nodejs",
      runtimeVersion: "20.x",
    }),
    cloud: gcpCloud(region, project, "cloudfunctions.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: failIdx === 3 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s3),
  };

  const totalUs = runUs + spUs + pubUs + fnUs + randInt(1000, 8000) * 1000;
  const txErr = isErr;

  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `${rand(["POST"])} /v1/checkout/confirm`,
      type: "request",
      duration: { us: totalUs },
      result: txErr ? "HTTP 5xx" : "HTTP 2xx",
      sampled: true,
      span_count: { started: 4, dropped: 0 },
    },
    service: checkout,
    cloud: gcpCloud(region, project, "run.googleapis.com"),
    labels: { "gcp.workflow": "ecommerce_order" },
    data_stream: APM_DS,
    event: { outcome: txErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, spanRun, spanSpanner, spanPub, spanFn];
}

export function generateMlInferenceTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging", "dev"]);
  const otel = gcpOtelMeta("python");
  const scoring = gcpServiceBase("scoring-api", env, "python", {
    framework: "Cloud Run",
    runtimeName: "python",
    runtimeVersion: "3.12",
  });
  let offsetMs = 0;

  const runUs = randInt(4000, 95_000);
  const vxUs = randInt(25_000, 2_500_000);
  const bqUs = randInt(8000, 600_000);
  const failIdx = isErr ? randInt(0, 2) : -1;

  const sRun = randSpanId();
  const s1 = randSpanId();
  const s2 = randSpanId();

  const spanRun: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: sRun,
      type: "request",
      subtype: "http",
      name: `${rand(["POST"])} /v1/score`,
      duration: { us: runUs },
      action: "request",
      destination: { service: { resource: "run", type: "request", name: "run" } },
    },
    service: scoring,
    cloud: gcpCloud(region, project, "run.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, sRun),
  };
  offsetMs += Math.max(1, Math.round(runUs / 1000));

  const spanVertex: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: s1,
      type: "external",
      subtype: "vertex_ai",
      name: `VertexAI.predict ${rand(["churn", "recommendations", "fraud"])}-endpoint`,
      duration: { us: vxUs },
      action: "predict",
      destination: { service: { resource: "vertex_ai", type: "external", name: "vertex_ai" } },
      labels: failIdx === 0 ? { "gcp.rpc.status_code": "RESOURCE_EXHAUSTED" } : {},
    },
    service: scoring,
    cloud: gcpCloud(region, project, "aiplatform.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: failIdx === 0 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s1),
  };
  offsetMs += Math.max(1, Math.round(vxUs / 1000));

  const spanBq: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s1 },
    span: {
      id: s2,
      type: "db",
      subtype: "bigquery",
      name: "BigQuery.insertRows ml_predictions",
      duration: { us: bqUs },
      action: "execute",
      db: { type: "sql", statement: "INSERT INTO `analytics.ml_predictions` SELECT ..." },
      destination: { service: { resource: "bigquery", type: "db", name: "bigquery" } },
      labels: failIdx === 1 ? { "gcp.rpc.status_code": "DEADLINE_EXCEEDED" } : {},
    },
    service: scoring,
    cloud: gcpCloud(region, project, "bigquery.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: failIdx === 1 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s2),
  };

  const totalUs = runUs + vxUs + bqUs + randInt(2000, 12_000) * 1000;
  const txErr = isErr;

  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `${rand(["POST"])} /v1/score`,
      type: "request",
      duration: { us: totalUs },
      result: txErr ? "HTTP 5xx" : "HTTP 2xx",
      sampled: true,
      span_count: { started: 3, dropped: 0 },
    },
    service: scoring,
    cloud: gcpCloud(region, project, "run.googleapis.com"),
    labels: { "gcp.workflow": "ml_inference" },
    data_stream: APM_DS,
    event: { outcome: txErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, spanRun, spanVertex, spanBq];
}

export function generateDataPipelineTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging", "dev"]);
  const otel = gcpOtelMeta("java");
  const ingest = gcpServiceBase("ingest-pipeline", env, "java", {
    runtimeName: "java",
    runtimeVersion: "17",
  });
  let offsetMs = 0;

  const pullUs = randInt(2000, 85_000);
  const dfUs = randInt(120_000, 4_000_000);
  const bqUs = randInt(40_000, 1_200_000);
  const gcsUs = randInt(15_000, 500_000);
  const failIdx = isErr ? randInt(0, 3) : -1;

  const sPull = randSpanId();
  const s1 = randSpanId();
  const s2 = randSpanId();
  const s3 = randSpanId();

  const spanPull: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: sPull,
      type: "messaging",
      subtype: "pubsub",
      name: `PubSub.pull ${rand(["ingest-raw", "events-main"])}`,
      duration: { us: pullUs },
      action: "receive",
      destination: { service: { resource: "pubsub", type: "messaging", name: "pubsub" } },
      labels: failIdx === 0 ? { "gcp.rpc.status_code": "DEADLINE_EXCEEDED" } : {},
    },
    service: ingest,
    cloud: gcpCloud(region, project, "pubsub.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: failIdx === 0 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, sPull),
  };
  offsetMs += Math.max(1, Math.round(pullUs / 1000));

  const spanDf: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: s1,
      type: "external",
      subtype: "dataflow",
      name: `Dataflow.${rand(["streaming", "batch"])} ${rand(["parse-events", "enrich-users"])}`,
      duration: { us: dfUs },
      action: "process",
      destination: { service: { resource: "dataflow", type: "external", name: "dataflow" } },
      labels: failIdx === 1 ? { "gcp.rpc.status_code": "ABORTED" } : {},
    },
    service: ingest,
    cloud: gcpCloud(region, project, "dataflow.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: failIdx === 1 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s1),
  };
  offsetMs += Math.max(1, Math.round(dfUs / 1000));

  const spanBq: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s1 },
    span: {
      id: s2,
      type: "db",
      subtype: "bigquery",
      name: "BigQuery.loadJob curated_events",
      duration: { us: bqUs },
      action: "execute",
      db: { type: "sql", statement: "LOAD DATA INTO `warehouse.curated_events`" },
      destination: { service: { resource: "bigquery", type: "db", name: "bigquery" } },
      labels: failIdx === 2 ? { "gcp.rpc.status_code": "PERMISSION_DENIED" } : {},
    },
    service: ingest,
    cloud: gcpCloud(region, project, "bigquery.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: failIdx === 2 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s2),
  };
  offsetMs += Math.max(1, Math.round(bqUs / 1000));

  const spanGcs: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s2 },
    span: {
      id: s3,
      type: "storage",
      subtype: "gcs",
      name: `GCS.compose export/${rand(["daily", "hourly"])}/part-*.parquet`,
      duration: { us: gcsUs },
      action: "write",
      destination: { service: { resource: "gcs", type: "storage", name: "gcs" } },
      labels: failIdx === 3 ? { "gcp.rpc.status_code": "RESOURCE_EXHAUSTED" } : {},
    },
    service: ingest,
    cloud: gcpCloud(region, project, "storage.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: failIdx === 3 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s3),
  };

  const totalUs = pullUs + dfUs + bqUs + gcsUs + randInt(2000, 15_000) * 1000;
  const txErr = isErr;

  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: "Pub/Sub → Dataflow batch window",
      type: "messaging",
      duration: { us: totalUs },
      result: txErr ? "failure" : "success",
      sampled: true,
      span_count: { started: 4, dropped: 0 },
    },
    service: ingest,
    cloud: gcpCloud(region, project, "pubsub.googleapis.com"),
    labels: { "gcp.workflow": "data_pipeline" },
    data_stream: APM_DS,
    event: { outcome: txErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, spanPull, spanDf, spanBq, spanGcs];
}
