import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

export function generateDataFusionTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const pipeline = rand(["daily-curated-orders", "cdc-users", "log-enrich"]);
  const otel = gcpOtelMeta("java");
  const svc = gcpServiceBase("data-fusion-driver", env, "java", {
    runtimeName: "java",
    runtimeVersion: "11",
  });
  const cloud = gcpCloud(region, project, "datafusion.googleapis.com");

  const u1 = randInt(1_000, 60_000);
  const u2 = randInt(5_000, 800_000) * (isErr ? randInt(2, 4) : 1);
  const u3 = randInt(10_000, 1_200_000) * (isErr ? randInt(2, 3) : 1);
  const u4 = randInt(5_000, 900_000) * (isErr ? randInt(2, 4) : 1);

  const failIdx = isErr ? randInt(0, 3) : -1;
  let offsetMs = 0;

  const s1 = randSpanId();
  const spanTrigger: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: s1,
      type: "messaging",
      subtype: "http",
      name: `DataFusion.startPipeline ${pipeline}`,
      duration: { us: u1 },
      action: "send",
      destination: { service: { resource: "datafusion", type: "messaging", name: "datafusion" } },
      labels: failIdx === 0 ? { "gcp.rpc.status_code": "FAILED_PRECONDITION" } : {},
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
  const spanSource: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s1 },
    span: {
      id: s2,
      type: "db",
      subtype: "bigquery",
      name: "DataFusion.sourceRead",
      duration: { us: u2 },
      action: "query",
      destination: {
        service: { resource: "pipeline_source", type: "db", name: "pipeline_source" },
      },
      labels: failIdx === 1 ? { "gcp.rpc.status_code": "DEADLINE_EXCEEDED" } : {},
    },
    service: svc,
    cloud: gcpCloud(region, project, "bigquery.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: failIdx === 1 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s2),
  };
  offsetMs += Math.max(1, Math.round(u2 / 1000));

  const s3 = randSpanId();
  const spanTransform: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s2 },
    span: {
      id: s3,
      type: "app",
      subtype: "datafusion",
      name: "DataFusion.transform",
      duration: { us: u3 },
      action: "process",
      destination: { service: { resource: "cdap_transform", type: "app", name: "cdap_transform" } },
      labels:
        failIdx === 2 ? { "gcp.datafusion.stage": "error" } : { "gcp.datafusion.stage": "map" },
    },
    service: svc,
    cloud,
    data_stream: APM_DS,
    event: { outcome: failIdx === 2 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s3),
  };
  offsetMs += Math.max(1, Math.round(u3 / 1000));

  const s4 = randSpanId();
  const spanSink: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s3 },
    span: {
      id: s4,
      type: "db",
      subtype: "bigquery",
      name: "DataFusion.sinkWrite",
      duration: { us: u4 },
      action: "write",
      destination: { service: { resource: "pipeline_sink", type: "db", name: "pipeline_sink" } },
      labels: failIdx === 3 ? { "gcp.rpc.status_code": "ABORTED" } : {},
    },
    service: svc,
    cloud: gcpCloud(region, project, "bigquery.googleapis.com"),
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
      name: `Data Fusion pipeline (${pipeline})`,
      type: "request",
      duration: { us: totalUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: 4, dropped: 0 },
    },
    service: svc,
    cloud,
    labels: { "gcp.datafusion.pipeline": pipeline },
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, spanTrigger, spanSource, spanTransform, spanSink];
}
