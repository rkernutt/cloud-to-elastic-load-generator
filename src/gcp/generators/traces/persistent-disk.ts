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

export function generatePersistentDiskTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const disk = rand(["pd-ssd-data-01", "pd-balanced-logs", "pd-extreme-db"]);
  const otel = gcpOtelMeta("go");
  const svc = gcpServiceBase("vm-io-agent", env, "go", {
    runtimeName: "go",
    runtimeVersion: "1.22",
  });
  const cloud = gcpCloud(region, project, "compute.googleapis.com");

  const ops = [
    { name: `Disk.attach ${disk}`, resource: "persistent_disk", us: randInt(10_000, 90_000) },
    { name: "BlockIO.read", resource: "block_io", us: randInt(1_000, 45_000) },
    { name: "BlockIO.write", resource: "block_io", us: randInt(2_000, 80_000) },
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
        type: "storage",
        subtype: "disk",
        name: o.name,
        duration: { us: o.us },
        action: i === 0 ? "attach" : i === 1 ? "read" : "write",
        destination: { service: { resource: o.resource, type: "storage", name: o.resource } },
        labels: {
          "gcp.disk.name": disk,
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
      name: `Disk I/O workflow (${disk})`,
      type: "request",
      duration: { us: sum + randInt(2000, 10000) },
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
