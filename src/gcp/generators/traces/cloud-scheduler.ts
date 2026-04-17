import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

export function generateCloudSchedulerTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const otel = gcpOtelMeta("nodejs");
  const svc = gcpServiceBase("scheduler-runner", env, "nodejs", {
    framework: "node-fetch",
    runtimeName: "node",
    runtimeVersion: "20.15.1",
  });
  const schedCloud = gcpCloud(region, project, "cloudscheduler.googleapis.com");
  const targetCloud = gcpCloud(region, project, "run.googleapis.com");

  const sTick = randSpanId();
  const sHttp = randSpanId();
  const u1 = randInt(1_000, 45_000);
  const u2 = randInt(8_000, 500_000);
  const httpErr = isErr;

  const spanTick: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: sTick,
      type: "app",
      subtype: "timer",
      name: "CloudScheduler.RunJob",
      duration: { us: u1 },
      action: "invoke",
      destination: {
        service: { resource: "cloud_scheduler", type: "app", name: "cloud_scheduler" },
      },
      labels: { "gcp.scheduler.job": "nightly-rollup" },
    },
    service: svc,
    cloud: schedCloud,
    data_stream: APM_DS,
    event: { outcome: "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, sTick),
  };

  const spanHttp: EcsDocument = {
    "@timestamp": offsetTs(base, Math.max(1, Math.round(u1 / 1000))),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: sHttp,
      type: "external",
      subtype: "http",
      name: "HTTP POST /internal/jobs/rollup",
      duration: { us: u2 },
      action: "call",
      destination: { service: { resource: "https", type: "external", name: "https" } },
      labels: httpErr ? { "http.status_code": "503" } : { "http.status_code": "204" },
    },
    service: svc,
    cloud: targetCloud,
    data_stream: APM_DS,
    event: { outcome: httpErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, sHttp),
  };

  const totalUs = u1 + u2 + randInt(500, 6_000);
  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: "ScheduledJob nightly-rollup",
      type: "request",
      duration: { us: totalUs },
      result: httpErr ? "failure" : "success",
      sampled: true,
      span_count: { started: 2, dropped: 0 },
    },
    service: svc,
    cloud: schedCloud,
    data_stream: APM_DS,
    event: { outcome: httpErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, spanTick, spanHttp];
}
