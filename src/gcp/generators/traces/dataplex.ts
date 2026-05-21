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

export function generateDataplexTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const lake = rand(["raw-events-lake", "curated-analytics", "ml-features-lake"]);
  const task = rand(["DATA_QUALITY_SCAN", "ENTITY_DISCOVERY", "METADATA_HARVEST"]);
  const otel = gcpOtelMeta("python");
  const svc = gcpServiceBase("data-governance-runner", env, "python", {
    framework: "Apache Beam",
    runtimeName: "python",
    runtimeVersion: "3.11",
  });
  const cloud = gcpCloud(region, project, "dataplex.googleapis.com");

  const ops = [
    { name: `Dataplex.triggerTask ${task}`, resource: "dataplex_task", us: randInt(3_000, 40_000) },
    {
      name: `Dataplex.scanAssets ${lake}`,
      resource: "dataplex_lake",
      us: randInt(10_000, 180_000),
    },
    { name: "Dataplex.publishMetadata", resource: "catalog_entry", us: randInt(2_000, 55_000) },
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
        type: "app",
        subtype: "dataplex",
        name: o.name,
        duration: { us: o.us },
        action: "process",
        destination: { service: { resource: o.resource, type: "app", name: o.resource } },
        labels: {
          "gcp.dataplex.lake": lake,
          "gcp.dataplex.task_type": task,
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
      name: `${task} on ${lake}`,
      type: "request",
      duration: { us: sum + randInt(3000, 15000) },
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
