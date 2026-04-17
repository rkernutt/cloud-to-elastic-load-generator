import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

export function generateAlloyDbTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const otel = gcpOtelMeta("java");
  const svc = gcpServiceBase("loyalty-svc", env, "java", {
    framework: "Spring JDBC",
    runtimeName: "java",
    runtimeVersion: "21",
  });
  const cloud = gcpCloud(region, project, "alloydb.googleapis.com");
  const stmt = "SELECT tier, points FROM loyalty.accounts WHERE customer_id = $1";
  const failAt = isErr ? randInt(0, 2) : -1;
  let ms = 0;
  const s1 = randSpanId();
  const s2 = randSpanId();
  const s3 = randSpanId();
  const u1 = randInt(800, 45_000);
  const u2 = randInt(2_000, 280_000);
  const u3 = randInt(500, 35_000);

  const span1: EcsDocument = {
    "@timestamp": offsetTs(base, ms),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: s1,
      type: "db",
      subtype: "postgresql",
      name: "alloydb.connect",
      duration: { us: u1 },
      action: "connect",
      destination: { service: { resource: "alloydb", type: "db", name: "alloydb" } },
      labels: failAt === 0 ? { "gcp.rpc.status_code": "UNAVAILABLE" } : {},
    },
    service: svc,
    cloud,
    data_stream: APM_DS,
    event: { outcome: failAt === 0 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s1),
  };
  ms += Math.max(1, Math.round(u1 / 1000));

  const span2: EcsDocument = {
    "@timestamp": offsetTs(base, ms),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: s2,
      type: "db",
      subtype: "postgresql",
      name: "alloydb.query",
      duration: { us: u2 },
      action: "query",
      db: { type: "sql", statement: stmt },
      destination: { service: { resource: "alloydb", type: "db", name: "alloydb" } },
      labels: failAt === 1 ? { "gcp.rpc.status_code": "DEADLINE_EXCEEDED" } : {},
    },
    service: svc,
    cloud,
    data_stream: APM_DS,
    event: { outcome: failAt === 1 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s2),
  };
  ms += Math.max(1, Math.round(u2 / 1000));

  const span3: EcsDocument = {
    "@timestamp": offsetTs(base, ms),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: s3,
      type: "db",
      subtype: "postgresql",
      name: "alloydb.fetch",
      duration: { us: u3 },
      action: "fetch",
      destination: { service: { resource: "alloydb", type: "db", name: "alloydb" } },
      labels: failAt === 2 ? { "gcp.rpc.status_code": "ABORTED" } : {},
    },
    service: svc,
    cloud,
    data_stream: APM_DS,
    event: { outcome: failAt === 2 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s3),
  };

  const totalUs = u1 + u2 + u3 + randInt(1_000, 8_000);
  const txErr = failAt >= 0;
  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: "GET /loyalty/balance",
      type: "request",
      duration: { us: totalUs },
      result: txErr ? "failure" : "success",
      sampled: true,
      span_count: { started: 3, dropped: 0 },
    },
    service: svc,
    cloud,
    labels: { "gcp.alloydb.cluster": "loyalty-primary" },
    data_stream: APM_DS,
    event: { outcome: txErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, span1, span2, span3];
}
