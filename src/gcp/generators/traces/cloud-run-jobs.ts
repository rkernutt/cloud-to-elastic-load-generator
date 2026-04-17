import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

export function generateCloudRunJobsTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const otel = gcpOtelMeta("go");
  const svc = gcpServiceBase(rand(["export-job", "reindex-job", "purge-job"]), env, "go", {
    framework: "stdlib",
    runtimeName: "go",
    runtimeVersion: "1.22.5",
  });
  const cloud = gcpCloud(region, project, "run.googleapis.com");

  const steps = [
    { name: "Job.bootstrap", us: randInt(2_000, 80_000) },
    { name: "Job.processBatch", us: randInt(50_000, 6_000_000) },
    { name: "Job.finalize", us: randInt(1_000, 120_000) },
  ];

  let ms = 0;
  const spans: EcsDocument[] = [];
  let sum = 0;
  for (let i = 0; i < steps.length; i++) {
    const st = steps[i]!;
    const sid = randSpanId();
    sum += st.us;
    const spanErr = isErr && i === steps.length - 1;
    spans.push({
      "@timestamp": offsetTs(base, ms),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sid,
        type: "app",
        subtype: "cloud_run_job",
        name: st.name,
        duration: { us: st.us },
        action: "execute",
        destination: { service: { resource: "cloud_run", type: "lambda", name: "cloud_run" } },
        labels: { "gcp.run.job": "export-parquet-nightly" },
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

  const totalUs = sum + randInt(2_000, 20_000);
  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: "CloudRunJob execution",
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
