/**
 * Cloud Functions OTel trace: HTTP invocation + Firestore, Pub/Sub, GCS, external HTTP spans.
 */

import type { EcsDocument } from "../helpers.js";
import {
  rand,
  randInt,
  gcpCloud,
  makeGcpSetup,
  randTraceId,
  randSpanId,
} from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";

const APM_AGENT = { name: "opentelemetry/nodejs", version: "1.x" } as const;
const APM_DS = { type: "traces", dataset: "apm", namespace: "default" } as const;

const CF_NAMES = [
  "checkout-webhook",
  "inventory-sync",
  "user-notifications",
  "payment-validator",
  "catalog-enricher",
];

export function generateCloudFunctionsTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const fn = rand(CF_NAMES);
  const base = new Date(ts);
  const env = rand(["production", "production", "staging", "dev"]);

  const spanTemplates = [
    {
      type: "db" as const,
      subtype: "firestore",
      name: () => `Firestore.${rand(["getDocument", "runQuery", "batchGet"])}`,
      db: () => ({
        type: "nosql",
        statement: `${rand(["get", "query"])} ${rand(["users", "orders", "sessions", "carts"])}/*`,
      }),
      dest: "firestore",
    },
    {
      type: "messaging" as const,
      subtype: "pubsub",
      name: () => `PubSub.${rand(["publish", "publishBatch"])}`,
      db: undefined,
      dest: "pubsub",
    },
    {
      type: "storage" as const,
      subtype: "gcs",
      name: () => `GCS.${rand(["upload", "compose", "rewrite"])}`,
      db: undefined,
      dest: "gcs",
    },
    {
      type: "external" as const,
      subtype: "http",
      name: () => `HTTP ${rand(["GET", "POST"])} ${rand(["payments.example", "auth.example", "shipping.example"])}`,
      db: undefined,
      dest: "external",
    },
  ];

  const numSpans = randInt(2, 4);
  const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5).slice(0, numSpans);
  order.sort((a, b) => a - b);
  const activeSpans = order.map((i) => spanTemplates[i]);

  let offsetMs = 0;
  const spanDocs: EcsDocument[] = [];
  let totalUs = 0;

  for (let i = 0; i < activeSpans.length; i++) {
    const tpl = activeSpans[i];
    const spanUs = randInt(800, 120_000) * (isErr && i === activeSpans.length - 1 ? randInt(2, 5) : 1);
    const spanErr = isErr && i === activeSpans.length - 1;
    const sid = randSpanId();
    totalUs += spanUs;
    spanDocs.push({
      "@timestamp": offsetTs(base, offsetMs),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sid,
        type: tpl.type,
        subtype: tpl.subtype,
        name: tpl.name(),
        duration: { us: spanUs },
        action: rand(["query", "send", "execute", "call"]),
        ...(tpl.db ? { db: tpl.db() } : {}),
        destination: { service: { resource: tpl.dest, type: tpl.type, name: tpl.dest } },
      },
      service: {
        name: fn,
        environment: env,
        language: { name: "nodejs" },
        runtime: { name: "nodejs", version: "20.x" },
        framework: { name: "Google Cloud Functions" },
      },
      cloud: gcpCloud(region, project, "cloudfunctions.googleapis.com"),
      agent: APM_AGENT,
      data_stream: APM_DS,
      event: { outcome: spanErr ? "failure" : "success" },
    });
    offsetMs += Math.max(1, Math.round(spanUs / 1000));
  }

  const txOverhead = randInt(200, 4000) * 1000;
  const totalTxUs = totalUs + txOverhead;

  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `${rand(["GET", "POST", "PUT"])} /${fn}`,
      type: "request",
      duration: { us: totalTxUs },
      result: isErr ? "HTTP 5xx" : "HTTP 2xx",
      sampled: true,
      span_count: { started: activeSpans.length, dropped: 0 },
    },
    service: {
      name: fn,
      environment: env,
      language: { name: "nodejs" },
      runtime: { name: "nodejs", version: "20.x" },
      framework: { name: "Google Cloud Functions" },
    },
    cloud: gcpCloud(region, project, "cloudfunctions.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
  };

  return [txDoc, ...spanDocs];
}
