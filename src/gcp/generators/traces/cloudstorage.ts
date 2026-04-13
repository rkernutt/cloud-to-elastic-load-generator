/**
 * Cloud Storage OTel trace: GCS object operation with optional downstream metadata update.
 */

import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";

const APM_AGENT = { name: "opentelemetry/nodejs", version: "1.x" } as const;
const APM_DS = { type: "traces", dataset: "apm", namespace: "default" } as const;

const BUCKETS = ["assets-prod", "data-lake-raw", "backups", "ml-training-data"];
const OBJECTS = [
  "uploads/2024/report.csv",
  "exports/snapshot.parquet",
  "models/weights.bin",
  "images/thumb_9f3a.jpg",
];

export function generateCloudStorageTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "production", "staging", "dev"]);
  const operation = rand(["PutObject", "GetObject", "CopyObject"]);
  const bucket = rand(BUCKETS);
  const object = rand(OBJECTS);

  const gcsUs = randInt(5_000, 800_000) * (isErr ? randInt(2, 6) : 1);
  const sGcs = randSpanId();

  let offsetMs = 0;

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
      name: `GCS ${operation}`,
      duration: { us: gcsUs },
      action: operation.toLowerCase(),
      destination: { service: { resource: "gcs", type: "storage", name: "gcs" } },
      labels: { bucket, object },
    },
    service: {
      name: "data-pipeline-worker",
      environment: env,
      language: { name: "nodejs" },
      runtime: { name: "nodejs", version: "20.x" },
    },
    cloud: gcpCloud(region, project, "storage.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
  };
  offsetMs += Math.max(1, Math.round(gcsUs / 1000));

  const docs: EcsDocument[] = [spanGcs];
  let totalUs = gcsUs;

  // Optional downstream metadata update span (only on successful writes)
  const hasMetaUpdate = !isErr && operation === "PutObject" && Math.random() < 0.6;
  if (hasMetaUpdate) {
    const metaSubtype = rand(["firestore", "bigquery"]);
    const metaUs = randInt(2_000, 40_000);
    const sMeta = randSpanId();
    totalUs += metaUs;
    docs.push({
      "@timestamp": offsetTs(base, offsetMs),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: sGcs },
      span: {
        id: sMeta,
        type: "db",
        subtype: metaSubtype,
        name:
          metaSubtype === "firestore"
            ? `Firestore.${rand(["setDocument", "updateDocument"])}`
            : `BigQuery.${rand(["insertRows", "queryJob"])}`,
        duration: { us: metaUs },
        action: "write",
        destination: { service: { resource: metaSubtype, type: "db", name: metaSubtype } },
      },
      service: {
        name: "data-pipeline-worker",
        environment: env,
        language: { name: "nodejs" },
        runtime: { name: "nodejs", version: "20.x" },
      },
      cloud: gcpCloud(
        region,
        project,
        metaSubtype === "firestore" ? "firestore.googleapis.com" : "bigquery.googleapis.com"
      ),
      agent: APM_AGENT,
      data_stream: APM_DS,
      event: { outcome: "success" },
    });
    offsetMs += Math.max(1, Math.round(metaUs / 1000));
  }

  const txOverhead = randInt(100, 2000) * 1000;
  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `GCS ${operation}`,
      type: "request",
      duration: { us: totalUs + txOverhead },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: docs.length, dropped: 0 },
    },
    service: {
      name: "data-pipeline-worker",
      environment: env,
      language: { name: "nodejs" },
      runtime: { name: "nodejs", version: "20.x" },
    },
    cloud: gcpCloud(region, project, "storage.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
  };

  return [txDoc, ...docs];
}
