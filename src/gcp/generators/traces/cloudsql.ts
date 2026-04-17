import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

export function generateCloudSqlTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const otel = gcpOtelMeta("java");
  const svc = gcpServiceBase("order-service", env, "java", {
    framework: "Spring JDBC",
    runtimeName: "java",
    runtimeVersion: "17",
  });
  const cloudSql = gcpCloud(region, project, "sqladmin.googleapis.com");

  const isSelect = Math.random() < 0.55;
  const txName = isSelect
    ? `SELECT orders ${rand(["by_customer", "by_status", "recent"])}`
    : `INSERT payment ${rand(["capture", "refund", "auth_hold"])}`;
  const statement = isSelect
    ? "SELECT id, customer_id, total_cents, status FROM orders WHERE customer_id = ? AND status IN ('paid','shipped') LIMIT 100"
    : "INSERT INTO payments (order_id, amount_cents, provider_ref) VALUES (?, ?, ?)";

  const acquireUs = randInt(500, 35_000);
  const queryUs = randInt(2000, isErr ? 2_500_000 : 450_000);
  const fetchUs = randInt(800, 180_000);
  const releaseUs = randInt(200, 25_000);

  const failAt = isErr ? randInt(0, 3) : -1;

  let offsetMs = 0;
  const sAcquire = randSpanId();
  const sQuery = randSpanId();
  const sFetch = randSpanId();
  const sRelease = randSpanId();

  const spanAcquire: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: sAcquire,
      type: "db",
      subtype: "mysql",
      name: "connection_acquire",
      duration: { us: acquireUs },
      action: "connect",
      destination: { service: { resource: "cloudsql", type: "db", name: "cloudsql" } },
      labels: failAt === 0 ? { "gcp.rpc.status_code": "UNAVAILABLE" } : {},
    },
    service: svc,
    cloud: cloudSql,
    data_stream: APM_DS,
    event: { outcome: failAt === 0 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, sAcquire),
  };
  offsetMs += Math.max(1, Math.round(acquireUs / 1000));

  const spanQuery: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: sQuery,
      type: "db",
      subtype: "mysql",
      name: "query_execution",
      duration: { us: queryUs },
      action: "query",
      db: { type: "sql", statement },
      destination: { service: { resource: "cloudsql", type: "db", name: "cloudsql" } },
      labels:
        failAt === 1
          ? { "gcp.rpc.status_code": rand(["DEADLINE_EXCEEDED", "ABORTED"]) as string }
          : {},
    },
    service: svc,
    cloud: cloudSql,
    data_stream: APM_DS,
    event: { outcome: failAt === 1 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, sQuery),
  };
  offsetMs += Math.max(1, Math.round(queryUs / 1000));

  const spanFetch: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: sFetch,
      type: "db",
      subtype: "mysql",
      name: "result_fetch",
      duration: { us: fetchUs },
      action: "fetch",
      destination: { service: { resource: "cloudsql", type: "db", name: "cloudsql" } },
      labels: failAt === 2 ? { "gcp.rpc.status_code": "DEADLINE_EXCEEDED" } : {},
    },
    service: svc,
    cloud: cloudSql,
    data_stream: APM_DS,
    event: { outcome: failAt === 2 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, sFetch),
  };
  offsetMs += Math.max(1, Math.round(fetchUs / 1000));

  const spanRelease: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: sRelease,
      type: "db",
      subtype: "mysql",
      name: "connection_release",
      duration: { us: releaseUs },
      action: "release",
      destination: { service: { resource: "cloudsql", type: "db", name: "cloudsql" } },
      labels: failAt === 3 ? { "gcp.rpc.status_code": "ABORTED" } : {},
    },
    service: svc,
    cloud: cloudSql,
    data_stream: APM_DS,
    event: { outcome: failAt === 3 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, sRelease),
  };

  const totalUs = acquireUs + queryUs + fetchUs + releaseUs + randInt(1000, 6000) * 1000;

  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: txName,
      type: "request",
      duration: { us: totalUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: 4, dropped: 0 },
    },
    service: svc,
    cloud: cloudSql,
    labels: { "gcp.cloud_sql.database": "orders_primary" },
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, spanAcquire, spanQuery, spanFetch, spanRelease];
}
