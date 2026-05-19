import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

const FAIL_BY_IDX = [
  {
    code: "INVALID_ARGUMENT",
    labels: { "composer.failure": "dag_parse_invalid", "airflow.exc": "DagParsingError" },
  },
  {
    code: "RESOURCE_EXHAUSTED",
    labels: { "composer.failure": "scheduler_slot_starvation", "airflow.exc": "TaskDeferred" },
  },
  {
    code: "DEADLINE_EXCEEDED",
    labels: { "composer.failure": "sensor_poke_timeout", "airflow.exc": "SensorTimeout" },
  },
  {
    code: "FAILED_PRECONDITION",
    labels: { "composer.failure": "xcom_deserialize_bad_type", "airflow.exc": "XComTypeMismatch" },
  },
  {
    code: "ABORTED",
    labels: {
      "composer.failure": "task_retry_airflow_retry",
      "airflow.exc": "AirflowTaskTimeout",
    },
  },
] as const;

export function generateComposerTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const otel = gcpOtelMeta("python");
  const svc = gcpServiceBase("airflow-worker", env, "python", {
    framework: "Apache Airflow",
    runtimeName: "python",
    runtimeVersion: "3.11.9",
  });
  const cloud = gcpCloud(region, project, "composer.googleapis.com");

  const dag = rand(["mart_daily", "ingest_hourly", "security_audit"]);
  const runId = `run_${randTraceId().slice(0, 8)}`;
  const taskId = rand(["upstream_sensor", "transform_stg", "load_mart"]);

  const tasks = [
    {
      name: "Composer.DAG.parse_bundle",
      us: randInt(3_000, 90_000),
      phase: "dag_parse",
    },
    {
      name: "Airflow.scheduler.enqueue_task_instance",
      us: randInt(8_000, 220_000),
      phase: "task_scheduling",
    },
    {
      name: `Airflow.executor.run_task.${taskId}`,
      us: randInt(25_000, 950_000),
      phase: "worker_execution",
    },
    {
      name: `Airflow.xcom_push.${taskId}`,
      us: randInt(2_000, 45_000),
      phase: "xcom_push",
    },
    {
      name: "Airflow.sensor.poke.ExternalTaskSensor",
      us: randInt(5_000, 380_000),
      phase: "sensor_poke",
    },
  ];

  const spanCount = tasks.length;
  const failIdx = isErr ? randInt(0, spanCount - 1) : -1;
  const failMeta = failIdx >= 0 ? FAIL_BY_IDX[failIdx % FAIL_BY_IDX.length]! : null;

  let ms = randInt(1, 6);
  const spans: EcsDocument[] = [];
  let sum = 0;

  for (let i = 0; i < spanCount; i++) {
    const t = tasks[i]!;
    const sid = randSpanId();
    sum += t.us;
    const spanErr = failIdx === i;
    spans.push({
      "@timestamp": offsetTs(base, ms),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sid,
        type: "app",
        subtype: "airflow",
        name: t.name,
        duration: { us: t.us },
        action: "execute",
        destination: { service: { resource: "composer", type: "app", name: "composer" } },
        labels: {
          "gcp.composer.dag": dag,
          "gcp.composer.phase": t.phase,
          "gcp.composer.airflow_run_id": runId,
        },
      },
      service: svc,
      cloud,
      data_stream: APM_DS,
      labels: {
        "gcp.composer.dag": dag,
        "gcp.composer.task_family": taskId,
        "gcp.composer.phase": t.phase,
        ...(spanErr
          ? {
              "gcp.rpc.status_code": failMeta!.code,
              "error.type": `composer.${failMeta!.labels["composer.failure"]}`,
              "error.message": `Composer Airflow pipeline failed (${failMeta!.labels["composer.failure"]})`,
              ...failMeta!.labels,
            }
          : {}),
      },
      event: { outcome: spanErr ? "failure" : "success" },
      ...otel,
      ...gcpCloudTraceMeta(project.id, traceId, sid),
    });
    ms += Math.max(1, Math.round(t.us / 1000));
  }

  const totalUs = sum + randInt(2_000, 25_000);
  const txErr = failIdx >= 0;

  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `DAG ${dag}`,
      type: "request",
      duration: { us: totalUs },
      result: txErr ? "failure" : "success",
      sampled: true,
      span_count: { started: spans.length, dropped: 0 },
    },
    service: svc,
    cloud,
    data_stream: APM_DS,
    event: { outcome: txErr ? "failure" : "success" },
    labels: txErr
      ? { "gcp.composer.dag": dag, ...(failMeta?.labels ?? {}) }
      : { "gcp.composer.dag": dag },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, ...spans];
}
