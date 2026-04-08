/**
 * Additional multi-service GCP traces (AWS workflow equivalents):
 * Pub/Sub fan-out (SNS-style) and GCS notification → Functions → BigQuery.
 */

import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId, randBucket } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";

const APM_AGENT = { name: "opentelemetry/nodejs", version: "1.x" } as const;
const APM_DS = { type: "traces", dataset: "apm", namespace: "default" } as const;

/**
 * Cloud Run (HTTP) → Pub/Sub publish → parallel subscribers:
 * Cloud Functions, second Cloud Run service, BigQuery streaming insert.
 */
export function generatePubSubFanoutTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const pubSpanId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const pubUs = randInt(2000, 55_000);
  const failWhich = isErr ? randInt(0, 4) : -1;

  const subs = [
    {
      id: randSpanId(),
      name: "PubSub.consume inventory-updates",
      subtype: "cloud_functions",
      duration: randInt(12_000, 420_000),
      serviceName: "inventory-fn",
      cloudSvc: "cloudfunctions.googleapis.com",
    },
    {
      id: randSpanId(),
      name: "PubSub.pull notifier-service",
      subtype: "cloud_run",
      duration: randInt(8000, 380_000),
      serviceName: "notifier-run",
      cloudSvc: "run.googleapis.com",
    },
    {
      id: randSpanId(),
      name: "BigQuery.insertRows audit_stream",
      subtype: "bigquery",
      duration: randInt(15_000, 520_000),
      serviceName: "audit-bq-loader",
      cloudSvc: "bigquery.googleapis.com",
    },
  ] as const;

  const maxSubUs = Math.max(...subs.map((s) => s.duration));
  const totalUs = pubUs + maxSubUs + randInt(80, 180) * 1000;
  const txErr = isErr;

  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `${rand(["POST"])} /internal/v1/orders/emit`,
      type: "request",
      duration: { us: totalUs },
      result: txErr ? "HTTP 5xx" : "HTTP 2xx",
      sampled: true,
      span_count: { started: 1 + subs.length, dropped: 0 },
    },
    service: {
      name: "order-emitter",
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

  let offsetMs = randInt(1, 6);
  const spanPub: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: pubSpanId,
      type: "messaging",
      subtype: "pubsub",
      name: "PubSub.publish topic order-events",
      duration: { us: pubUs },
      action: "send",
      destination: { service: { resource: "pubsub", type: "messaging", name: "pubsub" } },
    },
    service: { name: "order-emitter", environment: env, language: { name: "nodejs" } },
    cloud: gcpCloud(region, project, "pubsub.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failWhich === 3 ? "failure" : "success" },
  };
  offsetMs += Math.max(1, Math.round(pubUs / 1000));

  const subDocs: EcsDocument[] = subs.map((s, i) => ({
    "@timestamp": offsetTs(base, offsetMs + i * 3),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: pubSpanId },
    span: {
      id: s.id,
      type: s.subtype === "bigquery" ? "db" : "request",
      subtype: s.subtype,
      name: s.name,
      duration: { us: s.duration },
      action: s.subtype === "bigquery" ? "execute" : "consume",
      ...(s.subtype === "bigquery"
        ? {
            db: {
              type: "sql",
              statement: "INSERT INTO `analytics.order_fanout` SELECT ...",
            },
            destination: { service: { resource: "bigquery", type: "db", name: "bigquery" } },
          }
        : {
            destination: {
              service: {
                resource: s.subtype === "cloud_functions" ? "cloudfunctions" : "run",
                type: "request",
                name: s.subtype === "cloud_functions" ? "cloudfunctions" : "run",
              },
            },
          }),
    },
    service: {
      name: s.serviceName,
      environment: env,
      language: { name: s.subtype === "cloud_functions" ? "nodejs" : "go" },
      ...(s.subtype === "cloud_run" ? { runtime: { name: "go", version: "1.22" } } : {}),
    },
    cloud: gcpCloud(region, project, s.cloudSvc),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failWhich === i ? "failure" : "success" },
  }));

  return [txDoc, spanPub, ...subDocs];
}

/**
 * GCS object finalize notification → Pub/Sub push → Cloud Function → BigQuery load job.
 */
export function generateGcsObjectPipelineTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging", "dev"]);
  const bucket = randBucket();
  const obj = `landing/${rand(["part", "chunk", "batch"])}-${randInt(1000, 9999)}.parquet`;
  let offsetMs = 0;

  const gcsUs = randInt(4000, 120_000);
  const ackUs = randInt(800, 25_000);
  const bqUs = randInt(35_000, 2_200_000);
  const failIdx = isErr ? randInt(0, 2) : -1;

  const sGcs = randSpanId();
  const sAck = randSpanId();
  const sBq = randSpanId();

  const spanGcs: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: sGcs,
      type: "storage",
      subtype: "gcs",
      name: `GCS.getObject gs://${bucket}/${obj}`,
      duration: { us: gcsUs },
      action: "get",
      destination: { service: { resource: "gcs", type: "storage", name: "gcs" } },
    },
    service: {
      name: "lake-promoter-fn",
      environment: env,
      language: { name: "python" },
      runtime: { name: "python", version: "3.12" },
    },
    cloud: gcpCloud(region, project, "storage.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failIdx === 0 ? "failure" : "success" },
  };
  offsetMs += Math.max(1, Math.round(gcsUs / 1000));

  const spanAck: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: sGcs },
    span: {
      id: sAck,
      type: "messaging",
      subtype: "pubsub",
      name: "PubSub.ack gcs-notifications",
      duration: { us: ackUs },
      action: "ack",
      destination: { service: { resource: "pubsub", type: "messaging", name: "pubsub" } },
    },
    service: { name: "lake-promoter-fn", environment: env, language: { name: "python" } },
    cloud: gcpCloud(region, project, "pubsub.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: "success" },
  };
  offsetMs += Math.max(1, Math.round(ackUs / 1000));

  const spanBq: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: sAck },
    span: {
      id: sBq,
      type: "db",
      subtype: "bigquery",
      name: "BigQuery.loadJob curated_events",
      duration: { us: bqUs },
      action: "execute",
      db: {
        type: "sql",
        statement: `LOAD DATA OVERWRITE ${rand(["analytics", "raw_events"])}.curated_events FROM 'gs://${bucket}/${obj}'`,
      },
      destination: { service: { resource: "bigquery", type: "db", name: "bigquery" } },
    },
    service: { name: "lake-promoter-fn", environment: env, language: { name: "python" } },
    cloud: gcpCloud(region, project, "bigquery.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failIdx === 1 ? "failure" : "success" },
  };

  const totalUs = gcsUs + ackUs + bqUs + randInt(20, 80) * 1000;
  const txErr = isErr;

  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: "functions.lake_promoter",
      type: "request",
      duration: { us: totalUs },
      result: txErr && failIdx >= 0 ? "HTTP 5xx" : "HTTP 2xx",
      sampled: true,
      span_count: { started: 3, dropped: 0 },
    },
    service: {
      name: "lake-promoter-fn",
      environment: env,
      language: { name: "python" },
      runtime: { name: "python", version: "3.12" },
      framework: { name: "Google Cloud Functions" },
    },
    cloud: gcpCloud(region, project, "cloudfunctions.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: txErr && failIdx >= 0 ? "failure" : "success" },
  };

  return [txDoc, spanGcs, spanAck, spanBq];
}

/**
 * Eventarc trigger → Cloud Workflows execution → three Cloud Run steps
 * (Spanner read, Cloud SQL write, Pub/Sub publish) — AWS Step Functions analog.
 */
export function generateEventarcWorkflowOrchestrationTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const evTxId = randSpanId();
  const wfTxId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const wfName = rand(["order-fulfillment", "checkout-orchestration", "ship-and-notify"]);

  const st1 = randSpanId();
  const run1 = randSpanId();
  const sp1 = randSpanId();
  const st2 = randSpanId();
  const run2 = randSpanId();
  const sql2 = randSpanId();
  const st3 = randSpanId();
  const run3 = randSpanId();
  const pub3 = randSpanId();

  const usEv = randInt(800, 45_000);
  const usWf = randInt(2_000_000, 35_000_000);
  const usSt1 = randInt(200_000, 2_800_000);
  const usRun1 = randInt(150_000, 2_200_000);
  const usSp1 = randInt(8000, 450_000);
  const usSt2 = randInt(180_000, 2_600_000);
  const usRun2 = randInt(120_000, 2_000_000);
  const usSql2 = randInt(15_000, 900_000);
  const usSt3 = randInt(100_000, 1_800_000);
  const usRun3 = randInt(90_000, 1_600_000);
  const usPub3 = randInt(5000, 220_000);

  const failBranch = isErr ? randInt(0, 3) : -1;

  let ms = 0;
  const txEventarc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: evTxId,
      name: "Eventarc.auditlogs OrderSubmitted",
      type: "messaging",
      duration: { us: usEv + usWf + randInt(100, 400) * 1000 },
      sampled: true,
    },
    service: { name: "order-api", environment: env, language: { name: "go" } },
    cloud: gcpCloud(region, project, "eventarc.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
  };

  ms = randInt(4, 18);
  const txWorkflow: EcsDocument = {
    "@timestamp": offsetTs(base, ms),
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    parent: { id: evTxId },
    transaction: {
      id: wfTxId,
      name: wfName,
      type: "workflow",
      duration: { us: usWf },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: 3, dropped: 0 },
    },
    service: {
      name: "workflows-executor",
      environment: env,
      language: { name: "nodejs" },
      runtime: { name: "nodejs", version: "20.x" },
    },
    cloud: gcpCloud(region, project, "workflows.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    labels: { workflow_name: wfName, execution_id: `exec-${randInt(10000, 99999)}` },
    event: { outcome: isErr ? "failure" : "success" },
  };

  ms += randInt(8, 25);
  const spanStep1: EcsDocument = {
    "@timestamp": offsetTs(base, ms),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: wfTxId },
    parent: { id: wfTxId },
    span: {
      id: st1,
      type: "workflow",
      subtype: "gcp_workflows",
      name: "step.validate_inventory",
      duration: { us: usSt1 },
    },
    service: { name: "workflows-executor", environment: env },
    cloud: gcpCloud(region, project, "workflows.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: "success" },
  };
  ms += randInt(2, 8);
  const txRun1: EcsDocument = {
    "@timestamp": offsetTs(base, ms),
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    parent: { id: st1 },
    transaction: {
      id: run1,
      name: "POST /v1/inventory/lock",
      type: "request",
      duration: { us: usRun1 },
    },
    service: {
      name: "inventory-api",
      environment: env,
      language: { name: "java" },
      framework: { name: "Cloud Run" },
    },
    cloud: gcpCloud(region, project, "run.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failBranch === 0 ? "failure" : "success" },
  };
  ms += randInt(2, 6);
  const spanSpanner: EcsDocument = {
    "@timestamp": offsetTs(base, ms),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: run1 },
    parent: { id: run1 },
    span: {
      id: sp1,
      type: "db",
      subtype: "spanner",
      name: "Spanner.ReadWrite inventory_sessions",
      duration: { us: usSp1 },
      db: { type: "sql", statement: "SELECT sku, qty FROM inventory WHERE region = @r FOR UPDATE" },
    },
    service: { name: "inventory-api", environment: env },
    cloud: gcpCloud(region, project, "spanner.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failBranch === 0 ? "failure" : "success" },
  };

  ms += Math.max(15, Math.round(usSt1 / 1000 / 3));
  const spanStep2: EcsDocument = {
    "@timestamp": offsetTs(base, ms),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: wfTxId },
    parent: { id: wfTxId },
    span: {
      id: st2,
      type: "workflow",
      subtype: "gcp_workflows",
      name: "step.record_payment",
      duration: { us: usSt2 },
    },
    service: { name: "workflows-executor", environment: env },
    cloud: gcpCloud(region, project, "workflows.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: "success" },
  };
  ms += randInt(2, 8);
  const txRun2: EcsDocument = {
    "@timestamp": offsetTs(base, ms),
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    parent: { id: st2 },
    transaction: {
      id: run2,
      name: "POST /v1/payments/capture",
      type: "request",
      duration: { us: usRun2 },
    },
    service: {
      name: "payments-api",
      environment: env,
      language: { name: "nodejs" },
      framework: { name: "Cloud Run" },
    },
    cloud: gcpCloud(region, project, "run.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failBranch === 1 ? "failure" : "success" },
  };
  ms += randInt(2, 6);
  const spanSql: EcsDocument = {
    "@timestamp": offsetTs(base, ms),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: run2 },
    parent: { id: run2 },
    span: {
      id: sql2,
      type: "db",
      subtype: "cloudsql",
      name: "Cloud SQL INSERT payments_ledger",
      duration: { us: usSql2 },
      db: { type: "sql", statement: "INSERT INTO payments_ledger (order_id, amount, status) VALUES ($1,$2,'captured')" },
    },
    service: { name: "payments-api", environment: env },
    cloud: gcpCloud(region, project, "sqladmin.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failBranch === 1 ? "failure" : "success" },
  };

  ms += Math.max(15, Math.round(usSt2 / 1000 / 3));
  const spanStep3: EcsDocument = {
    "@timestamp": offsetTs(base, ms),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: wfTxId },
    parent: { id: wfTxId },
    span: {
      id: st3,
      type: "workflow",
      subtype: "gcp_workflows",
      name: "step.publish_receipt",
      duration: { us: usSt3 },
    },
    service: { name: "workflows-executor", environment: env },
    cloud: gcpCloud(region, project, "workflows.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: "success" },
  };
  ms += randInt(2, 8);
  const txRun3: EcsDocument = {
    "@timestamp": offsetTs(base, ms),
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    parent: { id: st3 },
    transaction: {
      id: run3,
      name: "POST /notify/receipt",
      type: "request",
      duration: { us: usRun3 },
    },
    service: {
      name: "notifications-api",
      environment: env,
      language: { name: "python" },
      framework: { name: "Cloud Run" },
    },
    cloud: gcpCloud(region, project, "run.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failBranch === 2 ? "failure" : "success" },
  };
  ms += randInt(2, 6);
  const spanPub: EcsDocument = {
    "@timestamp": offsetTs(base, ms),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: run3 },
    parent: { id: run3 },
    span: {
      id: pub3,
      type: "messaging",
      subtype: "pubsub",
      name: "PubSub.publish order-receipts",
      duration: { us: usPub3 },
    },
    service: { name: "notifications-api", environment: env },
    cloud: gcpCloud(region, project, "pubsub.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failBranch === 2 ? "failure" : "success" },
  };

  return [
    txEventarc,
    txWorkflow,
    spanStep1,
    txRun1,
    spanSpanner,
    spanStep2,
    txRun2,
    spanSql,
    spanStep3,
    txRun3,
    spanPub,
  ];
}
