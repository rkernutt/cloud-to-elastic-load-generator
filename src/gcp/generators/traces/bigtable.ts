import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

const FAIL_BY_IDX = [
  {
    code: "DEADLINE_EXCEEDED",
    labels: { "bigtable.failure": "read_rows_slow" },
  },
  {
    code: "UNAVAILABLE",
    labels: { "bigtable.failure": "tablet_server_overload" },
  },
  {
    code: "FAILED_PRECONDITION",
    labels: { "bigtable.failure": "schema_mutation_race" },
  },
  {
    code: "ABORTED",
    labels: { "bigtable.failure": "mutation_contention" },
  },
  {
    code: "NOT_FOUND",
    labels: { "bigtable.failure": "table_not_found" },
  },
] as const;

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
  const instance = rand(["bt-prod-1", "bt-ingest"]);

  const ops = [
    {
      name: `Bigtable.ReadRows ${table}`,
      action: "query",
      grpcMethod: "/google.bigtable.v2.Bigtable/ReadRows",
    },
    {
      name: `Bigtable.MutateRows ${table}`,
      action: "execute",
      grpcMethod: "/google.bigtable.v2.Bigtable/MutateRows",
    },
    {
      name: `Bigtable.CheckAndMutateRow ${table}`,
      action: "execute",
      grpcMethod: "/google.bigtable.v2.Bigtable/CheckAndMutateRow",
    },
    {
      name: `Bigtable.SampleRowKeys ${table}`,
      action: "query",
      grpcMethod: "/google.bigtable.v2.Bigtable/SampleRowKeys",
    },
  ];

  const spanCount = ops.length;
  const failIdx = isErr ? randInt(0, spanCount - 1) : -1;
  const failMeta = failIdx >= 0 ? FAIL_BY_IDX[failIdx % FAIL_BY_IDX.length]! : null;

  let ms = randInt(1, 5);
  const spans: EcsDocument[] = [];
  let sum = 0;

  for (let i = 0; i < spanCount; i++) {
    const op = ops[i]!;
    const sid = randSpanId();
    const us = randInt(2_000, 180_000);
    sum += us;
    const spanErr = failIdx === i;
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
        duration: { us },
        action: op.action,
        db: {
          type: "nosql",
          statement: `${op.grpcMethod}`,
        },
        destination: { service: { resource: "bigtable", type: "db", name: "bigtable" } },
      },
      service: svc,
      cloud,
      data_stream: APM_DS,
      labels: {
        "gcp.bigtable.instance": instance,
        "gcp.bigtable.table": table,
        "gcp.bigtable.grpc_method": op.grpcMethod,
        ...(spanErr
          ? {
              "gcp.rpc.status_code": failMeta!.code,
              "error.message": `${failMeta!.code} on Bigtable.${op.grpcMethod.split("/").pop()}`,
              "error.type": `bigtable.grpc.${failMeta!.code}`,
              ...failMeta!.labels,
            }
          : {}),
      },
      event: { outcome: spanErr ? "failure" : "success" },
      ...otel,
      ...gcpCloudTraceMeta(project.id, traceId, sid),
    });
    ms += Math.max(1, Math.round(us / 1000));
  }

  const totalUs = sum + randInt(1_500, 12_000);
  const txErr = failIdx >= 0;
  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: "FlushTelemetryBatch",
      type: "request",
      duration: { us: totalUs },
      result: txErr ? "failure" : "success",
      sampled: true,
      span_count: { started: spans.length, dropped: 0 },
    },
    service: svc,
    cloud,
    labels: {
      "gcp.bigtable.instance": instance,
      "gcp.bigtable.table": table,
    },
    data_stream: APM_DS,
    event: { outcome: txErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, ...spans];
}
