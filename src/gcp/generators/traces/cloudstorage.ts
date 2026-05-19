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

const FAIL_BY_IDX = [
  { code: "PERMISSION_DENIED", labels: { "gcs.failure": "object_acl" } },
  { code: "NOT_FOUND", labels: { "gcs.failure": "resumable_session_expired" } },
  { code: "FAILED_PRECONDITION", labels: { "gcs.failure": "compose_size_mismatch" } },
  { code: "RESOURCE_EXHAUSTED", labels: { "gcs.failure": "project_bandwidth" } },
  { code: "ABORTED", labels: { "gcs.failure": "multipart_part_conflict" } },
] as const;

export function generateCloudStorageTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "production", "staging", "dev"]);
  const bucket = rand(BUCKETS);
  const object = rand(OBJECTS);
  const uploadId = `upload_${randTraceId().slice(0, 16)}`;
  const otel = gcpOtelMeta("nodejs");
  const svc = gcpServiceBase("data-pipeline-worker", env, "nodejs", {
    runtimeName: "nodejs",
    runtimeVersion: "20.x",
  });
  const storageCloud = gcpCloud(region, project, "storage.googleapis.com");

  const stages = [
    {
      name: "GCS.ComposeSession.initiateMultipart",
      action: "multipart_init",
      labels: { bucket, object, "gcs.operation": "multipart_init", upload_id: uploadId },
    },
    {
      name: `GCS.ResumableSession.upload chunk`,
      action: "resumable_upload",
      labels: { bucket, object, "gcs.operation": "resumable_upload", "gcs.chunk_index": "3" },
    },
    {
      name: "GCS.Objects.compose",
      action: "compose",
      labels: {
        bucket,
        "gcs.destination": object,
        "gcs.operation": "compose",
        "gcs.source_count": "4",
      },
    },
    {
      name: "GCS.lifecycle.EvaluateRules",
      action: "lifecycle_eval",
      labels: { bucket, "gcs.operation": "lifecycle", "gcs.rule_action": "Nearline transition" },
    },
    {
      name: "PubSub.publish ObjectChangeNotification",
      action: "notification",
      labels: {
        bucket,
        object,
        "gcs.operation": "notification",
        "pubsub.topic": `${bucket}-objects`,
      },
    },
  ];

  const spanCount = stages.length;
  const failIdx = isErr ? randInt(0, spanCount - 1) : -1;
  const failMeta = failIdx >= 0 ? FAIL_BY_IDX[failIdx % FAIL_BY_IDX.length]! : null;

  let offsetMs = randInt(1, 8);
  const docs: EcsDocument[] = [];
  let totalUs = 0;

  for (let i = 0; i < spanCount; i++) {
    const st = stages[i]!;
    const sid = randSpanId();
    const us = randInt(8_000, 450_000);
    totalUs += us;
    const spanErr = failIdx === i;
    const isNotification = st.action === "notification";
    docs.push({
      "@timestamp": offsetTs(base, offsetMs),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sid,
        type: isNotification ? "messaging" : "storage",
        subtype: isNotification ? "pubsub" : "gcs",
        name: st.name,
        duration: { us },
        action: st.action,
        destination: {
          service: {
            resource: isNotification ? "pubsub" : "gcs",
            type: isNotification ? "messaging" : "storage",
            name: isNotification ? "pubsub" : "gcs",
          },
        },
        labels: st.labels,
      },
      service: svc,
      cloud: isNotification ? gcpCloud(region, project, "pubsub.googleapis.com") : storageCloud,
      data_stream: APM_DS,
      labels: {
        ...st.labels,
        ...(spanErr
          ? {
              "gcp.rpc.status_code": failMeta!.code,
              "error.type": `gcs.${failMeta!.labels["gcs.failure"]}`,
              "error.message": `Cloud Storage pipeline failed (${failMeta!.labels["gcs.failure"]})`,
              ...failMeta!.labels,
            }
          : {}),
      },
      event: { outcome: spanErr ? "failure" : "success" },
      ...otel,
      ...gcpCloudTraceMeta(project.id, traceId, sid),
    });
    offsetMs += Math.max(1, Math.round(us / 1000));
  }

  const txOverhead = randInt(100, 2000) * 1000;
  const txErr = failIdx >= 0;

  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: "GCS compose + notify pipeline",
      type: "request",
      duration: { us: totalUs + txOverhead },
      result: txErr ? "failure" : "success",
      sampled: true,
      span_count: { started: docs.length, dropped: 0 },
    },
    service: svc,
    cloud: storageCloud,
    labels: {
      "gcp.storage.bucket": bucket,
      "gcp.storage.object": object,
      ...(txErr && failMeta ? failMeta.labels : {}),
    },
    data_stream: APM_DS,
    event: { outcome: txErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, ...docs];
}
