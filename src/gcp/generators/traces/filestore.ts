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

export function generateFilestoreTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const instance = rand(["fs-ml-models", "fs-shared-home", "fs-render-cache"]);
  const op = rand(["read", "write", "metadata"]);
  const otel = gcpOtelMeta("python");
  const svc = gcpServiceBase("ml-training-worker", env, "python", {
    framework: "PyTorch",
    runtimeName: "python",
    runtimeVersion: "3.12",
  });
  const cloud = gcpCloud(region, project, "file.googleapis.com");

  const ops = [
    { name: `NFS.mount ${instance}`, resource: "nfs_mount", us: randInt(5_000, 80_000) },
    { name: `NFS.${op} /mnt/checkpoints`, resource: "filestore", us: randInt(2_000, 120_000) },
    { name: "NFS.flush", resource: "filestore", us: randInt(500, 25_000) },
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
        subtype: "nfs",
        name: o.name,
        duration: { us: o.us },
        action: op,
        destination: { service: { resource: o.resource, type: "storage", name: o.resource } },
        labels: {
          "gcp.filestore.instance": instance,
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
      name: `Checkpoint ${op} (${instance})`,
      type: "request",
      duration: { us: sum + randInt(1000, 6000) },
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
