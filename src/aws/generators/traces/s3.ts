/**
 * S3 OTel trace generator.
 *
 * Simulates applications making direct S3 operations as primary data store
 * calls (not just incidental S3 reads). Each trace represents one business
 * operation (transaction) with 2–5 S3 operation spans.
 *
 * Real-world instrumentation path:
 *   Application (Node/Python/Java) + EDOT OTel SDK
 *     → OTLP gRPC/HTTP → Elastic APM Server / OTel Collector
 *       → traces-apm-default
 */

import {
  TRACE_REGIONS,
  TRACE_ACCOUNTS,
  newTraceId,
  newSpanId,
  rand,
  randInt,
  offsetTs,
  serviceBlock,
  otelBlocks,
} from "./helpers.js";

// ─── Service configurations ───────────────────────────────────────────────────
const SERVICE_CONFIGS = [
  {
    name: "content-delivery-service",
    language: "nodejs",
    framework: "Express",
    runtimeName: "node",
    runtimeVersion: "20.15.1",
    bucketSuffix: "content-bucket",
    contentTypes: ["image/jpeg", "image/png", "video/mp4", "application/octet-stream"],
    transactionType: "request",
    operations: [
      { txName: "FetchContent", ops: ["GetObject", "HeadObject"] },
      { txName: "UploadContent", ops: ["PutObject", "GetObjectAcl", "PutObjectAcl"] },
      { txName: "DeleteAsset", ops: ["HeadObject", "DeleteObject"] },
      { txName: "ListAssets", ops: ["ListObjectsV2", "GetObject"] },
    ],
  },
  {
    name: "backup-service",
    language: "python",
    framework: "FastAPI",
    runtimeName: "CPython",
    runtimeVersion: "3.12.3",
    bucketSuffix: "backups",
    contentTypes: ["application/x-tar", "application/gzip", "application/zip"],
    transactionType: "request",
    operations: [
      { txName: "CreateBackup", ops: ["PutObject", "PutObjectAcl"] },
      { txName: "RestoreBackup", ops: ["ListObjectsV2", "GetObject", "HeadObject"] },
      { txName: "PruneOldBackups", ops: ["ListObjectsV2", "DeleteObject", "DeleteObject"] },
      { txName: "VerifyBackup", ops: ["HeadObject", "GetObject"] },
    ],
  },
  {
    name: "data-export-service",
    language: "java",
    framework: "Spring Boot",
    runtimeName: "OpenJDK",
    runtimeVersion: "21.0.3",
    bucketSuffix: "data-exports",
    contentTypes: ["text/csv", "application/json", "application/parquet"],
    transactionType: "request",
    operations: [
      { txName: "ExportReport", ops: ["PutObject", "PutObjectAcl", "HeadObject"] },
      { txName: "CopyExportToArchive", ops: ["CopyObject", "DeleteObject"] },
      { txName: "ListExports", ops: ["ListObjectsV2"] },
      { txName: "FetchExport", ops: ["HeadObject", "GetObject"] },
    ],
  },
  {
    name: "media-processor",
    language: "nodejs",
    framework: "Fastify",
    runtimeName: "node",
    runtimeVersion: "20.15.1",
    bucketSuffix: "media-assets",
    contentTypes: ["video/mp4", "audio/mpeg", "image/jpeg", "image/webp"],
    transactionType: "request",
    operations: [
      { txName: "IngestMediaFile", ops: ["PutObject", "HeadObject"] },
      { txName: "TranscodeAsset", ops: ["GetObject", "PutObject", "CopyObject"] },
      { txName: "PublishThumbnail", ops: ["GetObject", "PutObject", "PutObjectAcl"] },
      { txName: "CleanupSource", ops: ["ListObjectsV2", "DeleteObject"] },
    ],
  },
  {
    name: "archive-service",
    language: "python",
    framework: "Flask",
    runtimeName: "CPython",
    runtimeVersion: "3.11.9",
    bucketSuffix: "archive",
    contentTypes: [
      "application/x-tar",
      "application/gzip",
      "application/zip",
      "application/octet-stream",
    ],
    transactionType: "request",
    operations: [
      { txName: "ArchiveDocument", ops: ["PutObject", "PutObjectAcl"] },
      { txName: "RetrieveArchive", ops: ["HeadObject", "GetObject"] },
      { txName: "CopyToGlacier", ops: ["CopyObject", "DeleteObject"] },
      { txName: "ListArchives", ops: ["ListObjectsV2", "HeadObject"] },
      { txName: "BulkDelete", ops: ["ListObjectsV2", "DeleteObject", "DeleteObject"] },
    ],
  },
];

// S3 operation properties
const S3_OP_PROPS = {
  GetObject: { durationMs: [5, 120] },
  PutObject: { durationMs: [10, 200] },
  DeleteObject: { durationMs: [5, 80] },
  ListObjectsV2: { durationMs: [8, 150] },
  CopyObject: { durationMs: [15, 250] },
  HeadObject: { durationMs: [2, 40] },
  GetObjectAcl: { durationMs: [3, 50] },
  PutObjectAcl: { durationMs: [5, 80] },
};

function buildS3Span(
  traceId,
  txId,
  parentId,
  ts,
  operation,
  bucketName,
  contentType,
  isErr,
  spanOffsetMs
) {
  const id = newSpanId();
  const props = S3_OP_PROPS[operation] || S3_OP_PROPS.GetObject;
  const durationUs = randInt(props.durationMs[0], props.durationMs[1]) * 1000;
  const objectSizeBytes = randInt(1024, 104857600); // 1 KB – 100 MB

  return {
    "@timestamp": offsetTs(new Date(ts), spanOffsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: parentId },
    span: {
      id: id,
      type: "storage",
      subtype: "s3",
      name: `S3.${operation} ${bucketName}`,
      duration: { us: durationUs },
      action: operation,
      destination: { service: { resource: "s3", type: "storage", name: "s3" } },
    },
    labels: {
      bucket_name: bucketName,
      object_size_bytes: String(objectSizeBytes),
      content_type: contentType,
    },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };
}

/**
 * Generates an S3 OTel trace: 1 transaction + 2–5 S3 operation spans.
 * @param {string} ts  - ISO timestamp string (base time for the request)
 * @param {number} er  - error rate 0.0–1.0
 * @returns {Object[]} array of APM documents (transaction first, then spans)
 */
export function generateS3Trace(ts, er) {
  const cfg = rand(SERVICE_CONFIGS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "production", "staging", "dev"]);
  const isErr = Math.random() < er;

  const opConfig = rand(cfg.operations);
  const txName = opConfig.txName;
  const opList = opConfig.ops;

  const bucketName = `${account.name}-${cfg.bucketSuffix}`;
  const contentType = rand(cfg.contentTypes);
  const totalUs = randInt(20, 800) * 1000;

  const svcBlock = serviceBlock(
    cfg.name,
    env,
    cfg.language,
    cfg.framework,
    cfg.runtimeName,
    cfg.runtimeVersion
  );

  const { agent, telemetry } = otelBlocks(cfg.language, "elastic");

  // ── Root transaction ────────────────────────────────────────────────────────
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: txName,
      type: cfg.transactionType,
      duration: { us: totalUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: opList.length, dropped: 0 },
    },
    service: svcBlock,
    agent: agent,
    telemetry: telemetry,
    cloud: {
      provider: "aws",
      region: region,
      account: { id: account.id, name: account.name },
      service: { name: "s3" },
    },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  // ── Child spans (S3 operations) ──────────────────────────────────────────────
  const spans: any[] = [];
  let spanOffsetMs = randInt(1, 5);

  for (let i = 0; i < opList.length; i++) {
    const operation = opList[i];
    const spanIsErr = isErr && i === opList.length - 1;
    const props = S3_OP_PROPS[operation] || S3_OP_PROPS.GetObject;
    const durationUs = randInt(props.durationMs[0], props.durationMs[1]) * 1000;

    spans.push(
      buildS3Span(
        traceId,
        txId,
        txId,
        ts,
        operation,
        bucketName,
        contentType,
        spanIsErr,
        spanOffsetMs
      )
    );

    spanOffsetMs += durationUs / 1000 + randInt(1, 10);
  }

  return [txDoc, ...spans];
}
