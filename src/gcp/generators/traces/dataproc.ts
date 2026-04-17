import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

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

  const stages = [
    { name: "Spark.stage.read.parquet", us: randInt(50_000, 2_000_000) },
    { name: "Spark.stage.shuffle", us: randInt(80_000, 4_000_000) },
    { name: "Spark.stage.write.bigquery", us: randInt(100_000, 3_500_000) },
  ];

  let ms = randInt(1, 8);
  const spans: EcsDocument[] = [];
  let sum = 0;
  for (let i = 0; i < stages.length; i++) {
    const st = stages[i]!;
    const sid = randSpanId();
    sum += st.us;
    const spanErr = isErr && i === stages.length - 1;
    spans.push({
      "@timestamp": offsetTs(base, ms),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sid,
        type: "app",
        subtype: "spark",
        name: st.name,
        duration: { us: st.us },
        action: "execute",
        destination: { service: { resource: "dataproc", type: "app", name: "dataproc" } },
        labels: { "gcp.dataproc.job": `etl-${randInt(1000, 9999)}` },
      },
      service: svc,
      cloud,
      data_stream: APM_DS,
      event: { outcome: spanErr ? "failure" : "success" },
      ...otel,
      ...gcpCloudTraceMeta(project.id, traceId, sid),
    });
    ms += Math.max(1, Math.round(st.us / 1000));
  }

  const totalUs = sum + randInt(5_000, 40_000);
  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: "SparkApplication sessionize_events",
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
