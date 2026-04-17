import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

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
  const tasks = [
    { name: "sensor_upstream", us: randInt(5_000, 120_000) },
    { name: "extract_gcs", us: randInt(20_000, 400_000) },
    { name: "load_bigquery", us: randInt(30_000, 900_000) },
  ];

  let ms = randInt(1, 6);
  const spans: EcsDocument[] = [];
  let sum = 0;
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i]!;
    const sid = randSpanId();
    sum += t.us;
    const spanErr = isErr && i === tasks.length - 1;
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
        name: `Airflow.${t.name}`,
        duration: { us: t.us },
        action: "execute",
        destination: { service: { resource: "composer", type: "app", name: "composer" } },
        labels: { "gcp.composer.dag": dag, "gcp.composer.task_id": t.name },
      },
      service: svc,
      cloud,
      data_stream: APM_DS,
      event: { outcome: spanErr ? "failure" : "success" },
      ...otel,
      ...gcpCloudTraceMeta(project.id, traceId, sid),
    });
    ms += Math.max(1, Math.round(t.us / 1000));
  }

  const totalUs = sum + randInt(2_000, 25_000);
  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `DAG ${dag}`,
      type: "request",
      duration: { us: totalUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: spans.length, dropped: 0 },
    },
    service: svc,
    cloud,
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, ...spans];
}
