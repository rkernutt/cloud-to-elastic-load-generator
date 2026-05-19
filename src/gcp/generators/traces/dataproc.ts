import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

const FAIL_BY_IDX = [
  {
    code: "RESOURCE_EXHAUSTED",
    labels: {
      "dataproc.error": "quota.cluster_create",
      "hadoop.failure": "YARNCapacityScheduler.NoRoom",
    },
  },
  {
    code: "DEADLINE_EXCEEDED",
    labels: {
      "spark.failure": "org.apache.spark.SparkTimeoutException.stage_fetch",
      "yarn.failure": "AM_container_allocation_timeout",
    },
  },
  {
    code: "FAILED_PRECONDITION",
    labels: {
      "hdfs.failure": "BlockMissingException.replica_missing",
      "spark.failure": "java.io.IOException.metadata_corrupt",
    },
  },
  {
    code: "ABORTED",
    labels: {
      "yarn.failure": "ApplicationMaster_preempted",
      "spark.failure": "org.apache.spark.TaskKilled(stage_abort)",
    },
  },
  {
    code: "UNKNOWN",
    labels: {
      "spark.failure": "java.lang.OutOfMemoryError.heap_space_on_executor",
    },
  },
] as const;

export function generateDataprocTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const otel = gcpOtelMeta("java");
  const svc = gcpServiceBase("spark-driver", env, "java", {
    framework: "Apache Spark",
    runtimeName: "java",
    runtimeVersion: "17",
  });
  const cloud = gcpCloud(region, project, "dataproc.googleapis.com");
  const jobName = `etl-${randInt(1000, 9999)}`;
  const clusterId = `dp-${randInt(10, 99)}-${region.split("-")[0]}`;

  const stages = [
    {
      name: "Dataproc.SubmitJob",
      subtype: "dataproc",
      dest: "dataproc",
      labels: { "gcp.dataproc.phase": "job_submission" },
      us: randInt(20_000, 120_000),
    },
    {
      name: "Dataproc.ClusterManager.Provision",
      subtype: "dataproc",
      dest: "dataproc",
      labels: { "gcp.dataproc.phase": "cluster_provisioning", "gcp.dataproc.cluster": clusterId },
      us: randInt(200_000, 1_500_000),
    },
    {
      name: "YARN.ResourceManager.allocate",
      subtype: "yarn",
      dest: "yarn",
      labels: { "yarn.queue": "root.spark", "gcp.dataproc.phase": "yarn_allocation" },
      us: randInt(50_000, 800_000),
    },
    {
      name: "Spark.Driver.sessionize_events",
      subtype: "spark",
      dest: "spark",
      labels: {
        "spark.app_id": `application_${randTraceId().slice(0, 12)}`,
        "gcp.dataproc.phase": "driver",
      },
      us: randInt(100_000, 2_000_000),
    },
    {
      name: "Spark.Executor.task.shuffle_write",
      subtype: "spark",
      dest: "spark",
      labels: {
        "spark.stage_id": String(randInt(0, 40)),
        "gcp.dataproc.phase": "executor",
      },
      us: randInt(80_000, 3_500_000),
    },
  ];

  const spanCount = stages.length;
  const failIdx = isErr ? randInt(0, spanCount - 1) : -1;
  const failMeta = failIdx >= 0 ? FAIL_BY_IDX[failIdx % FAIL_BY_IDX.length]! : null;

  let ms = randInt(1, 8);
  const spans: EcsDocument[] = [];
  let sum = 0;

  for (let i = 0; i < spanCount; i++) {
    const st = stages[i]!;
    const sid = randSpanId();
    sum += st.us;
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
        subtype: st.subtype,
        name: st.name,
        duration: { us: st.us },
        action: "execute",
        destination: { service: { resource: st.dest, type: "app", name: st.dest } },
        labels: { "gcp.dataproc.job": jobName, ...st.labels },
      },
      service: svc,
      cloud,
      data_stream: APM_DS,
      labels: {
        "gcp.dataproc.job": jobName,
        ...st.labels,
        ...(spanErr
          ? {
              "gcp.rpc.status_code": failMeta!.code,
              "error.type": `dataproc.${failMeta!.code}`,
              "error.message": `Dataproc pipeline failed during ${st.labels["gcp.dataproc.phase"] ?? "unknown_phase"}`,
              ...failMeta!.labels,
              ...(failMeta!.code === "UNKNOWN"
                ? { "spark.executor.id": String(randInt(1, 120)) }
                : {}),
            }
          : {}),
      },
      event: { outcome: spanErr ? "failure" : "success" },
      ...otel,
      ...gcpCloudTraceMeta(project.id, traceId, sid),
    });
    ms += Math.max(1, Math.round(st.us / 1000));
  }

  const totalUs = sum + randInt(5_000, 40_000);
  const txErr = failIdx >= 0;
  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `SparkApplication sessionize_events (${jobName})`,
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
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, ...spans];
}
