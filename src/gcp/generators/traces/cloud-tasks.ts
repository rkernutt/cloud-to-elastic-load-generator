import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

export function generateCloudTasksTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const otel = gcpOtelMeta("python");
  const svc = gcpServiceBase("checkout-api", env, "python", {
    framework: "FastAPI",
    runtimeName: "python",
    runtimeVersion: "3.12.3",
  });
  const cloudTasks = gcpCloud(region, project, "cloudtasks.googleapis.com");
  const cloudRun = gcpCloud(region, project, "run.googleapis.com");

  const sEnqueue = randSpanId();
  const sHandler = randSpanId();
  const u1 = randInt(2_000, 85_000);
  const u2 = randInt(5_000, 400_000);
  const enqueueErr = isErr && randInt(0, 1) === 0;
  const handlerErr = isErr && !enqueueErr;

  const spanEnqueue: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: sEnqueue,
      type: "messaging",
      subtype: "cloud_tasks",
      name: "CloudTasks.CreateTask",
      duration: { us: u1 },
      action: "send",
      destination: { service: { resource: "cloud_tasks", type: "messaging", name: "cloud_tasks" } },
      labels: { "gcp.tasks.queue": "checkout-async" },
    },
    service: svc,
    cloud: cloudTasks,
    data_stream: APM_DS,
    event: { outcome: enqueueErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, sEnqueue),
  };

  const spanHandler: EcsDocument = {
    "@timestamp": offsetTs(base, Math.max(1, Math.round(u1 / 1000))),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: sHandler,
      type: "messaging",
      subtype: "cloud_tasks",
      name: "CloudTasks.ExecuteTask /payments/reconcile",
      duration: { us: u2 },
      action: "receive",
      destination: { service: { resource: "cloud_run", type: "lambda", name: "cloud_run" } },
      labels: handlerErr ? { "gcp.rpc.status_code": "UNKNOWN" } : {},
    },
    service: svc,
    cloud: cloudRun,
    data_stream: APM_DS,
    event: { outcome: enqueueErr ? "success" : handlerErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, sHandler),
  };

  const totalUs = u1 + u2 + randInt(1_000, 10_000);
  const txErr = enqueueErr || handlerErr;
  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: "POST /checkout/async",
      type: "request",
      duration: { us: totalUs },
      result: txErr ? "failure" : "success",
      sampled: true,
      span_count: { started: 2, dropped: 0 },
    },
    service: svc,
    cloud: cloudTasks,
    data_stream: APM_DS,
    event: { outcome: txErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, spanEnqueue, spanHandler];
}
