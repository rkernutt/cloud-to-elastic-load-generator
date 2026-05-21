import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import {
  APM_DS,
  gcpCloudTraceMeta,
  gcpOtelMeta,
  gcpServiceBase,
  gcpSpanFailureLabels,
} from "./trace-kit.js";

export function generateDataCatalogTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const entry = rand(["projects/.../datasets/orders/tables/events", "bigquery://analytics/users"]);
  const otel = gcpOtelMeta("java");
  const svc = gcpServiceBase("catalog-sync", env, "java", {
    framework: "Spring",
    runtimeName: "OpenJDK",
    runtimeVersion: "17",
  });
  const cloud = gcpCloud(region, project, "datacatalog.googleapis.com");

  const ops = [
    { name: "DataCatalog.lookupEntry", resource: "data_catalog", us: randInt(2_000, 35_000) },
    { name: "DataCatalog.searchCatalog", resource: "search_index", us: randInt(5_000, 70_000) },
    { name: "DataCatalog.createTagTemplate", resource: "tag_template", us: randInt(1_500, 28_000) },
  ];
  const failIdx = isErr ? randInt(0, ops.length - 1) : -1;
  let offsetMs = 0;
  const spans: EcsDocument[] = [];
  let sum = 0;
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i]!;
    const sid = randSpanId();
    const spanErr = failIdx === i;
    sum += o.us;
    spans.push({
      "@timestamp": offsetTs(base, offsetMs),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sid,
        type: "db",
        subtype: "metadata",
        name: o.name,
        duration: { us: o.us },
        action: "query",
        destination: { service: { resource: o.resource, type: "db", name: o.resource } },
        labels: {
          "gcp.datacatalog.entry": entry,
          ...(spanErr ? gcpSpanFailureLabels() : {}),
        },
      },
      service: svc,
      cloud,
      data_stream: APM_DS,
      event: { outcome: spanErr ? "failure" : "success" },
      ...otel,
      ...gcpCloudTraceMeta(project.id, traceId, sid),
    });
    offsetMs += Math.max(1, Math.round(o.us / 1000));
  }

  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: "Catalog metadata sync",
      type: "request",
      duration: { us: sum + randInt(1500, 8000) },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: spans.length, dropped: 0 },
    },
    service: svc,
    cloud,
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };
  return [txDoc, ...spans];
}
