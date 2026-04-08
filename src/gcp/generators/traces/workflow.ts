/**
 * Multi-service GCP workflow traces (e-commerce, ML, data pipeline).
 */

import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";

const APM_AGENT = { name: "opentelemetry/nodejs", version: "1.x" } as const;
const APM_DS = { type: "traces", dataset: "apm", namespace: "default" } as const;

/** Cloud Run → Spanner → Pub/Sub → Cloud Functions */
export function generateEcommerceOrderTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  let offsetMs = 0;

  const runUs = randInt(5000, 120_000);
  const spUs = randInt(8000, 400_000);
  const pubUs = randInt(1200, 85_000);
  const fnUs = randInt(4000, 350_000);

  const failIdx = isErr ? randInt(0, 3) : -1;
  const s1 = randSpanId();
  const s2 = randSpanId();
  const s3 = randSpanId();

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
    },
    service: { name: "checkout-api", environment: env, language: { name: "nodejs" }, runtime: { name: "nodejs", version: "20.x" } },
    cloud: gcpCloud(region, project, "spanner.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failIdx === 0 ? "failure" : "success" },
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
    },
    service: { name: "checkout-api", environment: env, language: { name: "nodejs" }, runtime: { name: "nodejs", version: "20.x" } },
    cloud: gcpCloud(region, project, "pubsub.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failIdx === 1 ? "failure" : "success" },
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
      destination: { service: { resource: "cloudfunctions", type: "request", name: "cloudfunctions" } },
    },
    service: {
      name: "fulfillment-fn",
      environment: env,
      language: { name: "nodejs" },
      runtime: { name: "nodejs", version: "20.x" },
      framework: { name: "Google Cloud Functions" },
    },
    cloud: gcpCloud(region, project, "cloudfunctions.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failIdx === 2 ? "failure" : "success" },
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
      span_count: { started: 3, dropped: 0 },
    },
    service: {
      name: "checkout-api",
      environment: env,
      language: { name: "nodejs" },
      runtime: { name: "nodejs", version: "20.x" },
      framework: { name: "Cloud Run" },
    },
    cloud: gcpCloud(region, project, "run.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: txErr ? "failure" : "success" },
  };

  return [txDoc, spanSpanner, spanPub, spanFn];
}

/** Cloud Run → Vertex AI → BigQuery */
export function generateMlInferenceTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging", "dev"]);
  let offsetMs = 0;

  const vxUs = randInt(25_000, 2_500_000);
  const bqUs = randInt(8000, 600_000);
  const failIdx = isErr ? randInt(0, 1) : -1;

  const s1 = randSpanId();
  const s2 = randSpanId();

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
    },
    service: { name: "scoring-api", environment: env, language: { name: "python" }, runtime: { name: "python", version: "3.12" } },
    cloud: gcpCloud(region, project, "aiplatform.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failIdx === 0 ? "failure" : "success" },
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
    },
    service: { name: "scoring-api", environment: env, language: { name: "python" }, runtime: { name: "python", version: "3.12" } },
    cloud: gcpCloud(region, project, "bigquery.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failIdx === 1 ? "failure" : "success" },
  };

  const totalUs = vxUs + bqUs + randInt(2000, 12_000) * 1000;
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
      span_count: { started: 2, dropped: 0 },
    },
    service: {
      name: "scoring-api",
      environment: env,
      language: { name: "python" },
      runtime: { name: "python", version: "3.12" },
      framework: { name: "Cloud Run" },
    },
    cloud: gcpCloud(region, project, "run.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: txErr ? "failure" : "success" },
  };

  return [txDoc, spanVertex, spanBq];
}

/** Pub/Sub → Dataflow → BigQuery → Cloud Storage */
export function generateDataPipelineTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging", "dev"]);
  let offsetMs = 0;

  const dfUs = randInt(120_000, 4_000_000);
  const bqUs = randInt(40_000, 1_200_000);
  const gcsUs = randInt(15_000, 500_000);
  const failIdx = isErr ? randInt(0, 2) : -1;

  const s1 = randSpanId();
  const s2 = randSpanId();
  const s3 = randSpanId();

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
    },
    service: { name: "ingest-pipeline", environment: env, language: { name: "java" } },
    cloud: gcpCloud(region, project, "dataflow.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failIdx === 0 ? "failure" : "success" },
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
    },
    service: { name: "ingest-pipeline", environment: env, language: { name: "java" } },
    cloud: gcpCloud(region, project, "bigquery.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failIdx === 1 ? "failure" : "success" },
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
    },
    service: { name: "ingest-pipeline", environment: env, language: { name: "java" } },
    cloud: gcpCloud(region, project, "storage.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failIdx === 2 ? "failure" : "success" },
  };

  const totalUs = dfUs + bqUs + gcsUs + randInt(2000, 15_000) * 1000;
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
      span_count: { started: 3, dropped: 0 },
    },
    service: { name: "ingest-pipeline", environment: env, language: { name: "java" } },
    cloud: gcpCloud(region, project, "pubsub.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: txErr ? "failure" : "success" },
  };

  return [txDoc, spanDf, spanBq, spanGcs];
}
