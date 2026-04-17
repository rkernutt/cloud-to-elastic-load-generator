import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

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

  const otel = gcpOtelMeta("python");
  const svc = gcpServiceBase("vertex-inference", env, "python", {
    runtimeName: "python",
    runtimeVersion: "3.12",
  });

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

  const labelsBase = {
    "gcp.vertex_ai.model": modelName,
    "gcp.vertex_ai.endpoint": endpointId,
    "gcp.vertex_ai.accelerator": accelerator,
  };

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
      labels: {
        ...labelsBase,
        ...(failIdx === 0 ? { "gcp.rpc.status_code": "DEADLINE_EXCEEDED" } : {}),
      },
    },
    service: svc,
    cloud: gcpCloud(region, project, "aiplatform.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: failIdx === 0 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, sLoad),
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
      labels: {
        ...labelsBase,
        ...(failIdx === 1 ? { "gcp.rpc.status_code": "INVALID_ARGUMENT" } : {}),
      },
    },
    service: svc,
    cloud: gcpCloud(region, project, "aiplatform.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: failIdx === 1 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, sPre),
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
      labels: {
        ...labelsBase,
        ...(failIdx === 2 ? { "gcp.rpc.status_code": "RESOURCE_EXHAUSTED" } : {}),
      },
    },
    service: svc,
    cloud: gcpCloud(region, project, "aiplatform.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: failIdx === 2 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, sInfer),
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
      labels: { ...labelsBase, ...(failIdx === 3 ? { "gcp.rpc.status_code": "ABORTED" } : {}) },
    },
    service: svc,
    cloud: gcpCloud(region, project, "aiplatform.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: failIdx === 3 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, sPost),
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
      labels: {
        ...labelsBase,
        ...(failIdx === 4 ? { "gcp.rpc.status_code": "PERMISSION_DENIED" } : {}),
      },
    },
    service: svc,
    cloud: gcpCloud(region, project, "aiplatform.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: failIdx === 4 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, sSer),
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
    service: svc,
    cloud: gcpCloud(region, project, "aiplatform.googleapis.com"),
    labels: labelsBase,
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, spanLoad, spanPre, spanInfer, spanPost, spanSer];
}
