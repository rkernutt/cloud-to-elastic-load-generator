/**
 * Amazon SageMaker inference OTel trace generator.
 *
 * Simulates real-time endpoint invocations from application code instrumented
 * with EDOT. Each trace represents one inference request (transaction) with a
 * primary InvokeEndpoint span, an optional S3 pre-processing span, and an
 * optional DynamoDB post-processing span.
 *
 * Real-world instrumentation path:
 *   Application (Python) + EDOT OTel SDK
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

// ─── Endpoint configurations ──────────────────────────────────────────────────
const ENDPOINT_CONFIGS = [
  {
    appName: "fraud-detection-xgb",
    endpointName: "fraud-detection-v2",
    modelName: "fraud-detection-xgb",
    language: "python",
    framework: "FastAPI",
    runtimeName: "CPython",
    runtimeVersion: "3.10.14",
    instanceType: "ml.m5.large",
    inputContentType: "application/json",
  },
  {
    appName: "recommendation-engine",
    endpointName: "rec-engine-prod",
    modelName: "recommendation-engine",
    language: "python",
    framework: "FastAPI",
    runtimeName: "CPython",
    runtimeVersion: "3.10.14",
    instanceType: "ml.m5.xlarge",
    inputContentType: "application/json",
  },
  {
    appName: "sentiment-classifier",
    endpointName: "nlp-sentiment-v1",
    modelName: "sentiment-classifier",
    language: "python",
    framework: "Flask",
    runtimeName: "CPython",
    runtimeVersion: "3.11.9",
    instanceType: "ml.m5.large",
    inputContentType: "text/plain",
  },
  {
    appName: "image-classifier",
    endpointName: "vision-classifier-v3",
    modelName: "image-classifier",
    language: "python",
    framework: "FastAPI",
    runtimeName: "CPython",
    runtimeVersion: "3.10.14",
    instanceType: "ml.g4dn.xlarge",
    inputContentType: "image/jpeg",
  },
  {
    appName: "churn-predictor",
    endpointName: "churn-prediction-v1",
    modelName: "churn-predictor",
    language: "python",
    framework: "Flask",
    runtimeName: "CPython",
    runtimeVersion: "3.11.9",
    instanceType: "ml.m5.large",
    inputContentType: "application/json",
  },
  {
    appName: "anomaly-detector",
    endpointName: "anomaly-detection-prod",
    modelName: "anomaly-detector",
    language: "python",
    framework: "FastAPI",
    runtimeName: "CPython",
    runtimeVersion: "3.10.14",
    instanceType: "ml.m5.2xlarge",
    inputContentType: "application/json",
  },
];

type EndpointCfg = (typeof ENDPOINT_CONFIGS)[number];

function buildInvokeEndpointSpan(
  traceId: string,
  txId: string,
  parentId: string,
  ts: string,
  cfg: EndpointCfg,
  _account: (typeof TRACE_ACCOUNTS)[number],
  isErr: boolean,
  spanOffsetMs: number
) {
  const id = newSpanId();
  const inferenceLatencyMs = randInt(20, 800);
  const durationUs = inferenceLatencyMs * 1000;

  return {
    "@timestamp": offsetTs(new Date(ts), spanOffsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: parentId },
    span: {
      id: id,
      type: "external",
      subtype: "sagemaker",
      name: `SageMaker.InvokeEndpoint ${cfg.endpointName}`,
      duration: { us: durationUs },
      action: "InvokeEndpoint",
      destination: { service: { resource: "sagemaker", type: "external", name: "sagemaker" } },
    },
    labels: {
      sagemaker_endpoint_name: cfg.endpointName,
      sagemaker_model_name: cfg.modelName,
      sagemaker_instance_type: cfg.instanceType,
      inference_latency_ms: String(inferenceLatencyMs),
      input_content_type: cfg.inputContentType,
    },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };
}

function buildS3PreProcessSpan(
  traceId: string,
  txId: string,
  parentId: string,
  ts: string,
  account: (typeof TRACE_ACCOUNTS)[number],
  isErr: boolean,
  spanOffsetMs: number
) {
  const id = newSpanId();
  const durationUs = randInt(5, 120) * 1000;
  const bucketName = `${account.name}-feature-store`;

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
      name: `S3.GetObject ${bucketName}`,
      duration: { us: durationUs },
      action: "GetObject",
      destination: { service: { resource: "s3", type: "storage", name: "s3" } },
    },
    labels: {
      bucket_name: bucketName,
      operation: "GetObject",
    },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };
}

function buildDynamoPostProcessSpan(
  traceId: string,
  txId: string,
  parentId: string,
  ts: string,
  isErr: boolean,
  spanOffsetMs: number
) {
  const id = newSpanId();
  const durationUs = randInt(2, 50) * 1000;

  return {
    "@timestamp": offsetTs(new Date(ts), spanOffsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: parentId },
    span: {
      id: id,
      type: "db",
      subtype: "dynamodb",
      name: "DynamoDB.PutItem inference-cache",
      duration: { us: durationUs },
      action: "PutItem",
      db: { type: "nosql", statement: "PutItem inference-cache" },
      destination: { service: { resource: "dynamodb", type: "db", name: "dynamodb" } },
    },
    labels: {
      table_name: "inference-cache",
      operation: "PutItem",
    },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };
}

/**
 * Generates a SageMaker inference OTel trace: 1 transaction + 1–3 spans.
 * Primary span is InvokeEndpoint; optional S3 pre-processing (50% chance)
 * and DynamoDB post-processing (30% chance) spans may be included.
 * @param {string} ts  - ISO timestamp string (base time for the request)
 * @param {number} er  - error rate 0.0–1.0
 * @returns {Object[]} array of APM documents (transaction first, then spans)
 */
export function generateSageMakerTrace(ts: string, er: number) {
  const cfg = rand(ENDPOINT_CONFIGS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "production", "staging", "dev"]);
  const isErr = Math.random() < er;

  const includePreProcess = Math.random() < 0.5;
  const includePostProcess = Math.random() < 0.3;
  const spanCount = 1 + (includePreProcess ? 1 : 0) + (includePostProcess ? 1 : 0);
  const totalUs = randInt(30, 1200) * 1000;

  const svcBlock = serviceBlock(
    cfg.appName,
    env,
    cfg.language,
    cfg.framework,
    cfg.runtimeName,
    cfg.runtimeVersion
  );

  const { agent, telemetry } = otelBlocks(cfg.language, "elastic");

  // ── Root transaction (inference request) ────────────────────────────────────
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `${cfg.appName} inference request`,
      type: "gen_ai",
      duration: { us: totalUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: spanCount, dropped: 0 },
    },
    service: svcBlock,
    agent: agent,
    telemetry: telemetry,
    cloud: {
      provider: "aws",
      region: region,
      account: { id: account.id, name: account.name },
      service: { name: "sagemaker" },
    },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  const spans: any[] = [];
  let spanOffsetMs = randInt(1, 5);

  // Optional pre-processing: fetch input features from S3
  if (includePreProcess) {
    const preDurationUs = randInt(5, 120) * 1000;
    spans.push(buildS3PreProcessSpan(traceId, txId, txId, ts, account, false, spanOffsetMs));
    spanOffsetMs += preDurationUs / 1000 + randInt(1, 5);
  }

  // Primary: SageMaker InvokeEndpoint
  const inferenceIsErr = isErr && !includePostProcess;
  const inferenceDurationUs = randInt(20, 800) * 1000;
  spans.push(
    buildInvokeEndpointSpan(traceId, txId, txId, ts, cfg, account, inferenceIsErr, spanOffsetMs)
  );
  spanOffsetMs += inferenceDurationUs / 1000 + randInt(1, 5);

  // Optional post-processing: cache result in DynamoDB
  if (includePostProcess) {
    const postIsErr = isErr;
    spans.push(buildDynamoPostProcessSpan(traceId, txId, txId, ts, postIsErr, spanOffsetMs));
  }

  return [txDoc, ...spans];
}
