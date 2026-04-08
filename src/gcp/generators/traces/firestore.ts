/**
 * Firestore OTel trace: multi-document read/write transaction.
 */

import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";

const APM_AGENT = { name: "opentelemetry/nodejs", version: "1.x" } as const;
const APM_DS = { type: "traces", dataset: "apm", namespace: "default" } as const;

export function generateFirestoreTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);

  const txKind = rand(["batch_write", "transaction"] as const);
  const readCount = randInt(2, 3);
  const writeCount = randInt(1, 2);

  const beginUs = randInt(400, 18_000);
  const readUsEach = Array.from({ length: readCount }, () => randInt(800, 95_000));
  const writeUsEach = Array.from({ length: writeCount }, () => randInt(1200, 110_000));
  const commitUs = randInt(1500, 85_000);

  const spanIds = {
    begin: randSpanId(),
    reads: readUsEach.map(() => randSpanId()),
    writes: writeUsEach.map(() => randSpanId()),
    commit: randSpanId(),
  };

  const totalSpanCount = 1 + readCount + writeCount + 1;
  let failIdx = -1;
  if (isErr) {
    failIdx = randInt(0, totalSpanCount - 1);
  }

  let offsetMs = 0;
  let si = 0;

  const service = {
    name: "inventory-service",
    environment: env,
    language: { name: "python" },
    runtime: { name: "python", version: "3.12" },
  };

  const spanBegin: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: spanIds.begin,
      type: "db",
      subtype: "firestore",
      name: "begin_transaction",
      duration: { us: beginUs },
      action: "begin",
      db: { type: "nosql", statement: `BEGIN ${txKind.toUpperCase()} /* inventory */` },
      destination: { service: { resource: "firestore", type: "db", name: "firestore" } },
    },
    service,
    cloud: gcpCloud(region, project, "firestore.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failIdx === si++ ? "failure" : "success" },
  };
  offsetMs += Math.max(1, Math.round(beginUs / 1000));

  const readSpans: EcsDocument[] = [];
  const collections = ["skus", "warehouses", "reservations", "stock_ledger"];
  for (let i = 0; i < readCount; i++) {
    const us = readUsEach[i];
    const sid = spanIds.reads[i];
    readSpans.push({
      "@timestamp": offsetTs(base, offsetMs),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sid,
        type: "db",
        subtype: "firestore",
        name: `document_reads ${i + 1}`,
        duration: { us },
        action: "query",
        db: {
          type: "nosql",
          statement: `get ${rand(collections)}/${randIdPath()} /* read in ${txKind} */`,
        },
        destination: { service: { resource: "firestore", type: "db", name: "firestore" } },
      },
      service,
      cloud: gcpCloud(region, project, "firestore.googleapis.com"),
      agent: APM_AGENT,
      data_stream: APM_DS,
      event: { outcome: failIdx === si++ ? "failure" : "success" },
    });
    offsetMs += Math.max(1, Math.round(us / 1000));
  }

  const writeSpans: EcsDocument[] = [];
  for (let i = 0; i < writeCount; i++) {
    const us = writeUsEach[i];
    const sid = spanIds.writes[i];
    writeSpans.push({
      "@timestamp": offsetTs(base, offsetMs),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sid,
        type: "db",
        subtype: "firestore",
        name: `document_writes ${i + 1}`,
        duration: { us },
        action: "execute",
        db: {
          type: "nosql",
          statement: `set ${rand(collections)}/${randIdPath()} merge:true`,
        },
        destination: { service: { resource: "firestore", type: "db", name: "firestore" } },
      },
      service,
      cloud: gcpCloud(region, project, "firestore.googleapis.com"),
      agent: APM_AGENT,
      data_stream: APM_DS,
      event: { outcome: failIdx === si++ ? "failure" : "success" },
    });
    offsetMs += Math.max(1, Math.round(us / 1000));
  }

  const spanCommit: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: spanIds.commit,
      type: "db",
      subtype: "firestore",
      name: "commit",
      duration: { us: commitUs },
      action: "commit",
      db: { type: "nosql", statement: "COMMIT" },
      destination: { service: { resource: "firestore", type: "db", name: "firestore" } },
    },
    service,
    cloud: gcpCloud(region, project, "firestore.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failIdx === si++ ? "failure" : "success" },
  };

  const totalUs =
    beginUs +
    readUsEach.reduce((a, b) => a + b, 0) +
    writeUsEach.reduce((a, b) => a + b, 0) +
    commitUs +
    randInt(1000, 6000) * 1000;

  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: txKind,
      type: "request",
      duration: { us: totalUs },
      result: isErr ? "aborted" : "success",
      sampled: true,
      span_count: { started: totalSpanCount, dropped: 0 },
    },
    service,
    cloud: gcpCloud(region, project, "firestore.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
  };

  return [txDoc, spanBegin, ...readSpans, ...writeSpans, spanCommit];
}

function randIdPath(): string {
  const part = () => Math.random().toString(36).slice(2, 10);
  return `${part()}/${part()}`;
}
