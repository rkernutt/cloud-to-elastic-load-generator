/**
 * Cloud Dataflow / Apache Beam OTel trace: single pipeline step with I/O and transforms.
 */

import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";

const APM_AGENT = { name: "opentelemetry/nodejs", version: "1.x" } as const;
const APM_DS = { type: "traces", dataset: "apm", namespace: "default" } as const;

export function generateDataflowTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);

  const sourceKind = rand(["pubsub", "gcs"] as const);
  const sinkKind = rand(["bigquery", "gcs"] as const);
  const readName =
    sourceKind === "pubsub"
      ? `read_source Pub/Sub ${rand(["events-inbound", "clicks", "orders-raw"])}`
      : `read_source GCS ${rand(["gs://events/*.json", "gs://staging/part-*.avro"])}`;
  const sinkName =
    sinkKind === "bigquery"
      ? `write_sink BigQuery ${rand(["analytics.stream_events", "warehouse.facts"])}`
      : `write_sink GCS ${rand(["gs://curated/output/", "gs://archive/daily/"])}`;

  const readUs = randInt(5000, 900_000);
  const transformUs = randInt(8000, 1_200_000);
  const gbkUs = randInt(4000, 800_000);
  const writeUs = randInt(6000, 1_100_000);

  const failIdx = isErr ? randInt(0, 3) : -1;

  let offsetMs = 0;
  const sRead = randSpanId();
  const sTransform = randSpanId();
  const sGbk = randSpanId();
  const sWrite = randSpanId();

  const readSubtype = sourceKind === "pubsub" ? "pubsub" : "gcs";
  const readResource = sourceKind === "pubsub" ? "pubsub" : "gcs";
  const readSpanType = sourceKind === "pubsub" ? "messaging" : "storage";

  const spanRead: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: sRead,
      type: readSpanType,
      subtype: readSubtype,
      name: readName,
      duration: { us: readUs },
      action: "receive",
      destination: { service: { resource: readResource, type: readSpanType, name: readResource } },
    },
    service: {
      name: "event-pipeline",
      environment: env,
      language: { name: "java" },
      runtime: { name: "java", version: "17" },
      framework: { name: "Apache Beam / Dataflow" },
    },
    cloud: gcpCloud(region, project, "dataflow.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failIdx === 0 ? "failure" : "success" },
  };
  offsetMs += Math.max(1, Math.round(readUs / 1000));

  const spanTransform: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: sRead },
    span: {
      id: sTransform,
      type: "app",
      subtype: "dataflow",
      name: "transform ParseAndEnrich",
      duration: { us: transformUs },
      action: "execute",
      destination: { service: { resource: "dataflow", type: "app", name: "dataflow" } },
    },
    service: {
      name: "event-pipeline",
      environment: env,
      language: { name: "java" },
      runtime: { name: "java", version: "17" },
      framework: { name: "Apache Beam / Dataflow" },
    },
    cloud: gcpCloud(region, project, "dataflow.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failIdx === 1 ? "failure" : "success" },
  };
  offsetMs += Math.max(1, Math.round(transformUs / 1000));

  const spanGbk: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: sTransform },
    span: {
      id: sGbk,
      type: "app",
      subtype: "dataflow",
      name: "group_by_key session_window",
      duration: { us: gbkUs },
      action: "aggregate",
      destination: { service: { resource: "dataflow", type: "app", name: "dataflow" } },
    },
    service: {
      name: "event-pipeline",
      environment: env,
      language: { name: "java" },
      runtime: { name: "java", version: "17" },
      framework: { name: "Apache Beam / Dataflow" },
    },
    cloud: gcpCloud(region, project, "dataflow.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failIdx === 2 ? "failure" : "success" },
  };
  offsetMs += Math.max(1, Math.round(gbkUs / 1000));

  const writeSubtype = sinkKind === "bigquery" ? "bigquery" : "gcs";
  const writeResource = sinkKind === "bigquery" ? "bigquery" : "gcs";
  const writeSpanType = sinkKind === "bigquery" ? "db" : "storage";

  const spanWrite: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: sGbk },
    span: {
      id: sWrite,
      type: writeSpanType,
      subtype: writeSubtype,
      name: sinkName,
      duration: { us: writeUs },
      action: sinkKind === "bigquery" ? "execute" : "upload",
      ...(sinkKind === "bigquery"
        ? {
            db: {
              type: "sql",
              statement: "STREAMING INSERT INTO `analytics.stream_events` (...)",
            },
          }
        : {}),
      destination: {
        service: { resource: writeResource, type: writeSpanType, name: writeResource },
      },
    },
    service: {
      name: "event-pipeline",
      environment: env,
      language: { name: "java" },
      runtime: { name: "java", version: "17" },
      framework: { name: "Apache Beam / Dataflow" },
    },
    cloud: gcpCloud(
      region,
      project,
      sinkKind === "bigquery" ? "bigquery.googleapis.com" : "storage.googleapis.com"
    ),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failIdx === 3 ? "failure" : "success" },
  };

  const totalUs = readUs + transformUs + gbkUs + writeUs + randInt(2000, 10_000) * 1000;

  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: "TransformEvents",
      type: "job",
      duration: { us: totalUs },
      result: isErr ? "pipeline_failed" : "success",
      sampled: true,
      span_count: { started: 4, dropped: 0 },
    },
    service: {
      name: "event-pipeline",
      environment: env,
      language: { name: "java" },
      runtime: { name: "java", version: "17" },
      framework: { name: "Apache Beam / Dataflow" },
    },
    cloud: gcpCloud(region, project, "dataflow.googleapis.com"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
  };

  return [txDoc, spanRead, spanTransform, spanGbk, spanWrite];
}
