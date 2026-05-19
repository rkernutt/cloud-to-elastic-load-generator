import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

const FAIL_BY_IDX = [
  { code: "INVALID_ARGUMENT", labels: { "cloudtasks.failure": "target_url_malformed" } },
  { code: "NOT_FOUND", labels: { "cloudtasks.failure": "queue_missing" } },
  { code: "DEADLINE_EXCEEDED", labels: { "cloudtasks.failure": "http_target_timeout" } },
  {
    code: "RESOURCE_EXHAUSTED",
    labels: { "cloudtasks.failure": "max_dispatches_per_queue" },
  },
  { code: "ABORTED", labels: { "cloudtasks.failure": "dlq_delivery_aborted", dlq_hit: "true" } },
] as const;

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

  const queue = "checkout-async";
  const taskName = rand(["payments/reconcile", "inventory/sync", "fraud-score"]);
  const maxAttempts = String(randInt(3, 10));

  const steps = [
    {
      cloud: cloudTasks,
      span: {
        type: "messaging" as const,
        subtype: "cloud_tasks" as const,
        name: "CloudTasks.CreateTask",
        action: "send" as const,
        duration: randInt(2_000, 85_000),
        destination: {
          service: {
            resource: "cloudtasks",
            type: "messaging",
            name: "cloudtasks",
          },
        },
      },
      labels: { "gcp.tasks.phase": "enqueue", "gcp.tasks.queue": queue, task_name: taskName },
    },
    {
      cloud: cloudTasks,
      span: {
        type: "messaging",
        subtype: "cloud_tasks",
        name: "CloudTasks.Dispatch dequeue",
        action: "receive",
        duration: randInt(3_000, 120_000),
        destination: {
          service: {
            resource: "cloudtasks",
            type: "messaging",
            name: "cloudtasks",
          },
        },
      },
      labels: {
        "gcp.tasks.phase": "queue_dispatch",
        dispatch_latency_ms: String(randInt(40, 800)),
      },
    },
    {
      cloud: cloudRun,
      span: {
        type: "http" as const,
        subtype: "http" as const,
        name: `HTTP POST /${taskName}`,
        action: "execute",
        duration: randInt(8_000, 420_000),
        destination: {
          service: { resource: "cloud_run", type: "lambda", name: "cloud_run" },
        },
      },
      labels: {
        "gcp.tasks.phase": "http_target",
        "http.url": `https://${queue}-svc-${region}.${project.id}.run.app/${taskName}`,
      },
    },
    {
      cloud: cloudTasks,
      span: {
        type: "messaging",
        subtype: "cloud_tasks",
        name: `CloudTasks.retry policy (attempt backoff)`,
        action: "process",
        duration: randInt(4_000, 95_000),
        destination: {
          service: { resource: "cloudtasks", type: "messaging", name: "cloudtasks" },
        },
      },
      labels: {
        "gcp.tasks.phase": "retry_logic",
        "gcp.tasks.max_attempts": maxAttempts,
        "gcp.tasks.retry_attempt": rand(["2", "3", "4"]),
      },
    },
    {
      cloud: rand([cloudTasks, cloudRun]),
      span: {
        type: "messaging",
        subtype: "cloud_tasks",
        name: "CloudTasks.DeadLetter / DLQ enqueue",
        action: "receive",
        duration: randInt(2_500, 60_000),
        destination: {
          service: { resource: "cloudtasks_dlq", type: "messaging", name: "cloudtasks_dlq" },
        },
      },
      labels: {
        "gcp.tasks.phase": "dead_letter",
        dlq_topic: `${queue}-dlq`,
      },
    },
  ];

  const spanCount = steps.length;
  const failIdx = isErr ? randInt(0, spanCount - 1) : -1;
  const failMeta = failIdx >= 0 ? FAIL_BY_IDX[failIdx % FAIL_BY_IDX.length]! : null;

  const spanDocs: EcsDocument[] = [];
  let offsetMs = randInt(0, 4);
  let totalUs = 0;

  for (let i = 0; i < spanCount; i++) {
    const st = steps[i]!;
    const sid = randSpanId();
    const us = st.span.duration;
    totalUs += us;
    const spanErr = failIdx === i;
    spanDocs.push({
      "@timestamp": offsetTs(base, offsetMs),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sid,
        type: st.span.type,
        subtype: st.span.subtype,
        name: st.span.name,
        duration: { us },
        action: st.span.action,
        destination: st.span.destination,
      },
      service: svc,
      cloud: st.cloud,
      data_stream: APM_DS,
      labels: {
        "gcp.tasks.queue": queue,
        ...st.labels,
        ...(spanErr
          ? {
              "gcp.rpc.status_code": failMeta!.code,
              "error.type": `cloudtasks.${failMeta!.labels["cloudtasks.failure"]}`,
              "error.message": `Cloud Tasks orchestration failed at ${String(st.labels["gcp.tasks.phase"])}`,
              ...failMeta!.labels,
              ...(failMeta!.code === "RESOURCE_EXHAUSTED"
                ? { "gcp.tasks.retry_count": String(randInt(3, 8)) }
                : {}),
            }
          : {}),
      },
      event: { outcome: spanErr ? "failure" : "success" },
      ...otel,
      ...gcpCloudTraceMeta(project.id, traceId, sid),
    });
    offsetMs += Math.max(1, Math.round(us / 1000));
  }

  const totalUsTx = totalUs + randInt(1_000, 10_000);
  const txErr = failIdx >= 0;

  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: "POST /checkout/async",
      type: "request",
      duration: { us: totalUsTx },
      result: txErr ? "failure" : "success",
      sampled: true,
      span_count: { started: spanDocs.length, dropped: 0 },
    },
    service: svc,
    cloud: cloudTasks,
    data_stream: APM_DS,
    event: { outcome: txErr ? "failure" : "success" },
    labels: {
      "gcp.tasks.queue": queue,
      ...(txErr && failMeta ? failMeta.labels : {}),
    },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, ...spanDocs];
}
