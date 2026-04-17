import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

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
  const otel = gcpOtelMeta("nodejs");
  const svc = gcpServiceBase("data-pipeline-worker", env, "nodejs", {
    runtimeName: "nodejs",
    runtimeVersion: "20.x",
  });

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
      labels: {
        bucket,
        object,
        ...(isErr ? { "gcp.rpc.status_code": "PERMISSION_DENIED" } : {}),
      },
    },
    service: svc,
    cloud: gcpCloud(region, project, "storage.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, sGcs),
  };
  offsetMs += Math.max(1, Math.round(gcsUs / 1000));

  const docs: EcsDocument[] = [spanGcs];
  let totalUs = gcsUs;

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
      service: svc,
      cloud: gcpCloud(
        region,
        project,
        metaSubtype === "firestore" ? "firestore.googleapis.com" : "bigquery.googleapis.com"
      ),
      data_stream: APM_DS,
      event: { outcome: "success" },
      ...otel,
      ...gcpCloudTraceMeta(project.id, traceId, sMeta),
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
    service: svc,
    cloud: gcpCloud(region, project, "storage.googleapis.com"),
    labels: { "gcp.storage.bucket": bucket },
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, ...docs];
}
