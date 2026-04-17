import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

const INSTANCES = ["prod-banking", "globex-ledger", "inventory-global"];

export function generateCloudSpannerTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const instance = rand(INSTANCES);
  const db = rand(["core", "payments", "inventory"]);
  const otel = gcpOtelMeta("java");
  const svc = gcpServiceBase(`spanner-${instance}`, env, "java", {
    framework: "Spanner JDBC",
    runtimeName: "java",
    runtimeVersion: "21",
  });

  const beginUs = randInt(800, 25_000);
  const splitCount = randInt(2, 4);
  const splitUs = Array.from({ length: splitCount }, () => randInt(5000, 220_000));
  const commitUs = randInt(2000, 95_000);

  const failIdx = isErr ? randInt(-1, splitCount) : -1;

  let offsetMs = 0;
  const sBegin = randSpanId();

  const spanBegin: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: sBegin,
      type: "db",
      subtype: "spanner",
      name: "Spanner.BeginTransaction",
      duration: { us: beginUs },
      action: "begin",
      db: { type: "sql", statement: `BEGIN RW TRANSACTION /* ${instance}/${db} */` },
      destination: { service: { resource: "spanner", type: "db", name: "spanner" } },
      labels: failIdx === -1 ? { "gcp.rpc.status_code": "ABORTED" } : {},
    },
    service: svc,
    cloud: gcpCloud(region, project, "spanner.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: failIdx === -1 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, sBegin),
  };
  offsetMs += Math.max(1, Math.round(beginUs / 1000));

  const splitSpans: EcsDocument[] = [];
  let parentId = sBegin;
  for (let i = 0; i < splitCount; i++) {
    const sid = randSpanId();
    const us = splitUs[i]!;
    const regions = ["us-central1", "europe-west1", "asia-east1"];
    const splitRegion = rand(regions);
    const spanErr = failIdx === i;
    splitSpans.push({
      "@timestamp": offsetTs(base, offsetMs),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: parentId },
      span: {
        id: sid,
        type: "db",
        subtype: "spanner",
        name: `Spanner.SplitReadWrite participant=${i + 1}`,
        duration: { us },
        action: "query",
        db: {
          type: "sql",
          statement: rand([
            `SELECT balance FROM accounts@{FORCE_INDEX=...} WHERE customer_id = @p1 /* split ${splitRegion} */`,
            `UPDATE inventory SET qty = qty - @q WHERE sku = @s AND region = '${splitRegion}'`,
            `INSERT INTO ledger (id, amount, ts) VALUES (@id, @amt, PENDING_COMMIT_TIMESTAMP())`,
          ]),
        },
        destination: { service: { resource: "spanner", type: "db", name: "spanner" } },
        labels: spanErr ? { "gcp.rpc.status_code": "DEADLINE_EXCEEDED" } : {},
      },
      service: svc,
      cloud: {
        ...gcpCloud(splitRegion, project, "spanner.googleapis.com"),
        availability_zone: `${splitRegion}-a`,
      },
      data_stream: APM_DS,
      event: { outcome: spanErr ? "failure" : "success" },
      ...otel,
      ...gcpCloudTraceMeta(project.id, traceId, sid),
    });
    offsetMs += Math.max(1, Math.round(us / 1000));
    parentId = sid;
  }

  const sCommit = randSpanId();
  const commitErr = failIdx === splitCount;
  const spanCommit: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: parentId },
    span: {
      id: sCommit,
      type: "db",
      subtype: "spanner",
      name: "Spanner.CommitTransaction",
      duration: { us: commitUs },
      action: "commit",
      db: { type: "sql", statement: "COMMIT TRANSACTION" },
      destination: { service: { resource: "spanner", type: "db", name: "spanner" } },
      labels: commitErr ? { "gcp.rpc.status_code": "ABORTED" } : {},
    },
    service: svc,
    cloud: gcpCloud(region, project, "spanner.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: commitErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, sCommit),
  };

  const totalUs =
    beginUs + splitUs.reduce((a, b) => a + b, 0) + commitUs + randInt(1000, 8000) * 1000;
  const txErr = isErr;

  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `Spanner read-write ${instance}/${db}`,
      type: "request",
      duration: { us: totalUs },
      result: txErr ? "failure" : "success",
      sampled: true,
      span_count: { started: 2 + splitCount, dropped: 0 },
    },
    service: svc,
    cloud: gcpCloud(region, project, "spanner.googleapis.com"),
    labels: { "gcp.spanner.instance": instance, "gcp.spanner.database": db },
    data_stream: APM_DS,
    event: { outcome: txErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, spanBegin, ...splitSpans, spanCommit];
}
