import {
  TRACE_REGIONS,
  TRACE_ACCOUNTS,
  newTraceId,
  newSpanId,
  rand,
  randInt,
  offsetTs,
  serviceBlock,
  otelBlocks,
} from "./helpers.js";

const APPS = [
  {
    name: "catalog-mongo",
    language: "nodejs",
    framework: "mongoose",
    runtimeName: "node",
    runtimeVersion: "20.15.1",
  },
  {
    name: "telemetry-store",
    language: "python",
    framework: "motor",
    runtimeName: "CPython",
    runtimeVersion: "3.12.3",
  },
];

const OPS = [
  ["find", "updateOne", "aggregate"],
  ["findOne", "insertOne"],
  ["aggregate", "countDocuments"],
];

export function generateDocDbTrace(ts: string, er: number) {
  const cfg = rand(APPS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "staging", "dev"]);
  const isErr = Math.random() < er;
  const coll = rand(["products", "events", "devices"]);
  const opList = rand(OPS);

  const svcBlock = serviceBlock(
    cfg.name,
    env,
    cfg.language,
    cfg.framework,
    cfg.runtimeName,
    cfg.runtimeVersion
  );
  const { agent, telemetry } = otelBlocks(cfg.language as "python" | "nodejs", "elastic");

  let offsetMs = randInt(1, 6);
  const spans: Record<string, unknown>[] = [];
  let sumUs = 0;
  for (let i = 0; i < opList.length; i++) {
    const cmd = opList[i]!;
    const sid = newSpanId();
    const us = randInt(800, 220_000);
    sumUs += us;
    const spanErr = isErr && i === opList.length - 1;
    spans.push({
      "@timestamp": offsetTs(new Date(ts), offsetMs),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sid,
        type: "db",
        subtype: "mongodb",
        name: `DocumentDB.${cmd}`,
        duration: { us },
        action: cmd,
        db: { type: "mongodb", statement: `${cmd} ${coll}` },
        destination: { service: { resource: "mongodb", type: "db", name: "documentdb" } },
      },
      labels: { "aws.docdb.cluster_name": `docdb-${rand(["main", "ro"])}` },
      event: { outcome: spanErr ? "failure" : "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    });
    offsetMs += Math.max(1, Math.round(us / 1000));
  }

  const totalUs = sumUs + randInt(1_500, 18_000);
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: rand(["LoadProductBundle", "IngestDeviceBatch", "FacetBrowse"]),
      type: "request",
      duration: { us: totalUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: spans.length, dropped: 0 },
    },
    service: svcBlock,
    agent,
    telemetry,
    cloud: {
      provider: "aws",
      region,
      account: { id: account.id, name: account.name },
      service: { name: "docdb" },
    },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  return [txDoc, ...spans];
}
