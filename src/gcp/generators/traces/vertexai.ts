/**
 * Vertex AI OTel trace: online prediction with GPU inference and serialization.
 */

import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";

const APM_AGENT = { name: "opentelemetry/nodejs", version: "1.x" } as const;
const APM_DS = { type: "traces", dataset: "apm", namespace: "default" } as const;

export function generateVertexAiTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);

  const modelName = rand([
    "textembedding-gecko@003",
    "gemini-pro",
    "churn-xgb-v2",
    "image-classifier-resnet",
  ]);
  const endpointId = rand(["1234567890123456789", "9876543210987654321"]);
  const accelerator = rand(["NVIDIA_TESLA_T4", "NVIDIA_L4", "NVIDIA_A100_40GB", "TPU_V5E"]);

  const service = {
    name: "vertex-inference",
    environment: env,
    language: { name: "python" },
    runtime: { name: "python", version: "3.12" },
    labels: {
      "gcp.vertex_ai.model": modelName,
      "gcp.vertex_ai.endpoint": endpointId,
      "gcp.vertex_ai.accelerator": accelerator,
    },
  };

  const loadUs = randInt(50_000, 800_000);
  const preUs = randInt(2000, 95_000);
  const inferUs = randInt(25_000, 3_500_000);
  const postUs = randInt(1500, 120_000);
  const serUs = randInt(800, 45_000);

  const failIdx = isErr ? randInt(0, 4) : -1;

  let offsetMs = 0;
  const sLoad = randSpanId();
  const sPre = randSpanId();
  const sInfer = randSpanId();
  const sPost = randSpanId();
  const sSer = randSpanId();

  const spanLoad: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: sLoad,
      type: "external",
      subtype: "vertex_ai",
      name: "model_loading",
      duration: { us: loadUs },
      action: "load",
      destination: { service: { resource: "vertex_ai", type: "external", name: "vertex_ai" } },
    },
    service,
    cloud: gcpCloud(region, project, "aiplatform.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failIdx === 0 ? "failure" : "success" },
  };
  offsetMs += Math.max(1, Math.round(loadUs / 1000));

  const spanPre: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: sLoad },
    span: {
      id: sPre,
      type: "external",
      subtype: "vertex_ai",
      name: "preprocessing",
      duration: { us: preUs },
      action: "encode",
      destination: { service: { resource: "vertex_ai", type: "external", name: "vertex_ai" } },
    },
    service,
    cloud: gcpCloud(region, project, "aiplatform.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failIdx === 1 ? "failure" : "success" },
  };
  offsetMs += Math.max(1, Math.round(preUs / 1000));

  const spanInfer: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: sPre },
    span: {
      id: sInfer,
      type: "external",
      subtype: "vertex_ai",
      name: "inference",
      duration: { us: inferUs },
      action: "predict",
      destination: { service: { resource: "vertex_ai", type: "external", name: "vertex_ai" } },
    },
    service,
    cloud: gcpCloud(region, project, "aiplatform.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failIdx === 2 ? "failure" : "success" },
  };
  offsetMs += Math.max(1, Math.round(inferUs / 1000));

  const spanPost: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: sInfer },
    span: {
      id: sPost,
      type: "external",
      subtype: "vertex_ai",
      name: "postprocessing",
      duration: { us: postUs },
      action: "decode",
      destination: { service: { resource: "vertex_ai", type: "external", name: "vertex_ai" } },
    },
    service,
    cloud: gcpCloud(region, project, "aiplatform.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failIdx === 3 ? "failure" : "success" },
  };
  offsetMs += Math.max(1, Math.round(postUs / 1000));

  const spanSer: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: sPost },
    span: {
      id: sSer,
      type: "external",
      subtype: "vertex_ai",
      name: "response_serialization",
      duration: { us: serUs },
      action: "serialize",
      destination: { service: { resource: "vertex_ai", type: "external", name: "vertex_ai" } },
    },
    service,
    cloud: gcpCloud(region, project, "aiplatform.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failIdx === 4 ? "failure" : "success" },
  };

  const totalUs = loadUs + preUs + inferUs + postUs + serUs + randInt(1000, 8000) * 1000;

  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `POST /v1/projects/${project.id}/locations/${region}/endpoints/${endpointId}:predict`,
      type: "request",
      duration: { us: totalUs },
      result: isErr ? "predict_failed" : "HTTP 2xx",
      sampled: true,
      span_count: { started: 5, dropped: 0 },
    },
    service,
    cloud: gcpCloud(region, project, "aiplatform.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
  };

  return [txDoc, spanLoad, spanPre, spanInfer, spanPost, spanSer];
}
