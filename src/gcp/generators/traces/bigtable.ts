import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

export function generateBigtableTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const otel = gcpOtelMeta("go");
  const svc = gcpServiceBase("telemetry-writer", env, "go", {
    framework: "grpc-go",
    runtimeName: "go",
    runtimeVersion: "1.22.5",
  });
  const cloud = gcpCloud(region, project, "bigtable.googleapis.com");
  const table = rand(["events", "sessions", "metrics"]);

  const ops = [
    { name: "Bigtable.ReadRows", action: "query", us: randInt(2_000, 180_000) },
    { name: "Bigtable.MutateRow", action: "execute", us: randInt(800, 95_000) },
    { name: "Bigtable.SampleRowKeys", action: "query", us: randInt(1_000, 120_000) },
  ];

  let ms = randInt(1, 5);
  const spans: EcsDocument[] = [];
  let sum = 0;
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]!;
    const sid = randSpanId();
    sum += op.us;
    const spanErr = isErr && i === ops.length - 1;
    spans.push({
      "@timestamp": offsetTs(base, ms),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sid,
        type: "db",
        subtype: "bigtable",
        name: op.name,
        duration: { us: op.us },
        action: op.action,
        db: { type: "nosql", statement: `${op.name} ${table}` },
        destination: { service: { resource: "bigtable", type: "db", name: "bigtable" } },
      },
      service: svc,
      cloud,
      data_stream: APM_DS,
      event: { outcome: spanErr ? "failure" : "success" },
      ...otel,
      ...gcpCloudTraceMeta(project.id, traceId, sid),
    });
    ms += Math.max(1, Math.round(op.us / 1000));
  }

  const totalUs = sum + randInt(1_500, 12_000);
  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: "FlushTelemetryBatch",
      type: "request",
      duration: { us: totalUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: spans.length, dropped: 0 },
    },
    service: svc,
    cloud,
    labels: { "gcp.bigtable.instance": "bt-prod-1" },
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, ...spans];
}
