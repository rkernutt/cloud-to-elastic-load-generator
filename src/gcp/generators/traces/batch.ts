import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

export function generateBatchTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging", "dev"]);
  const job = rand(["etl-nightly", "model-train-weekly", "video-transcode"]);
  const queue = rand(["gpu-batch-queue", "cpu-default", "high-mem-pool"]);
  const otel = gcpOtelMeta("go");
  const svc = gcpServiceBase("batch-submitter", env, "go", {
    runtimeName: "go",
    runtimeVersion: "1.22",
  });
  const cloud = gcpCloud(region, project, "batch.googleapis.com");

  const u1 = randInt(800, 45_000);
  const u2 = randInt(2_000, 180_000);
  const u3 = randInt(10_000, 2_000_000) * (isErr ? randInt(2, 4) : 1);
  const u4 = randInt(1_000, 90_000);

  const failIdx = isErr ? randInt(0, 3) : -1;
  let offsetMs = 0;

  const s1 = randSpanId();
  const spanSubmit: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: s1,
      type: "external",
      subtype: "batch",
      name: `Batch.submitJob ${job}`,
      duration: { us: u1 },
      action: "send",
      destination: { service: { resource: "batch", type: "external", name: "batch" } },
      labels: {
        "gcp.batch.job": job,
        ...(failIdx === 0 ? { "gcp.rpc.status_code": "INVALID_ARGUMENT" } : {}),
      },
    },
    service: svc,
    cloud,
    data_stream: APM_DS,
    event: { outcome: failIdx === 0 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s1),
  };
  offsetMs += Math.max(1, Math.round(u1 / 1000));

  const s2 = randSpanId();
  const spanSchedule: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s1 },
    span: {
      id: s2,
      type: "app",
      subtype: "batch",
      name: `Batch.scheduleOnQueue ${queue}`,
      duration: { us: u2 },
      action: "process",
      destination: {
        service: { resource: "batch_scheduler", type: "app", name: "batch_scheduler" },
      },
      labels: {
        "gcp.batch.queue": queue,
        ...(failIdx === 1 ? { "gcp.rpc.status_code": "RESOURCE_EXHAUSTED" } : {}),
      },
    },
    service: gcpServiceBase("batch-control-plane", env, "go", {
      runtimeName: "go",
      runtimeVersion: "1.22",
    }),
    cloud,
    data_stream: APM_DS,
    event: { outcome: failIdx === 1 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s2),
  };
  offsetMs += Math.max(1, Math.round(u2 / 1000));

  const s3 = randSpanId();
  const spanTask: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s2 },
    span: {
      id: s3,
      type: "request",
      subtype: "batch",
      name: "Batch.taskExecution",
      duration: { us: u3 },
      action: "execute",
      destination: { service: { resource: "batch_task", type: "request", name: "batch_task" } },
      labels:
        failIdx === 2
          ? { "gcp.batch.task_status": "FAILED", "gcp.rpc.status_code": "ABORTED" }
          : {},
    },
    service: gcpServiceBase("batch-worker", env, "python", {
      runtimeName: "python",
      runtimeVersion: "3.12",
    }),
    cloud: gcpCloud(region, project, "compute.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: failIdx === 2 ? "failure" : "success" },
    ...gcpOtelMeta("python"),
    ...gcpCloudTraceMeta(project.id, traceId, s3),
  };
  offsetMs += Math.max(1, Math.round(u3 / 1000));

  const s4 = randSpanId();
  const spanComplete: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s3 },
    span: {
      id: s4,
      type: "external",
      subtype: "batch",
      name: "Batch.jobCompletion",
      duration: { us: u4 },
      action: "receive",
      destination: {
        service: { resource: "batch_status", type: "external", name: "batch_status" },
      },
      labels:
        failIdx === 3
          ? { "gcp.batch.final_status": "CANCELLED" }
          : { "gcp.batch.final_status": "SUCCEEDED" },
    },
    service: svc,
    cloud,
    data_stream: APM_DS,
    event: { outcome: failIdx === 3 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s4),
  };

  const totalUs = u1 + u2 + u3 + u4 + randInt(400, 5000) * 1000;
  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `Batch job (${job})`,
      type: "request",
      duration: { us: totalUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: 4, dropped: 0 },
    },
    service: svc,
    cloud,
    labels: { "gcp.batch.job": job, "gcp.batch.queue": queue },
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, spanSubmit, spanSchedule, spanTask, spanComplete];
}
