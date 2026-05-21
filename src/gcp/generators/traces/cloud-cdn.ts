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

export function generateCloudCdnTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const path = rand(["/static/app.js", "/images/logo.png", "/api/config"]);
  const cacheKey = rand(["HIT", "MISS", "REVALIDATED"]);
  const otel = gcpOtelMeta("nodejs");
  const svc = gcpServiceBase("cdn-edge-proxy", env, "nodejs", {
    framework: "Express",
    runtimeName: "node",
    runtimeVersion: "20.x",
  });
  const cloud = gcpCloud(region, project, "compute.googleapis.com");

  const ops = [
    { name: `CloudCDN.viewer-request ${path}`, resource: "cloud_cdn", us: randInt(800, 25_000) },
    { name: `CloudCDN.cache-lookup ${cacheKey}`, resource: "cdn_cache", us: randInt(200, 15_000) },
    {
      name: "CloudCDN.origin-fetch",
      resource: "backend_bucket",
      us: randInt(5_000, 200_000) * (isErr ? randInt(2, 4) : 1),
    },
  ];
  const failIdx = isErr ? randInt(0, ops.length - 1) : -1;
  let offsetMs = 0;
  const spans: EcsDocument[] = [];
  let sum = 0;
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]!;
    const sid = randSpanId();
    const spanErr = failIdx === i;
    sum += op.us;
    spans.push({
      "@timestamp": offsetTs(base, offsetMs),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sid,
        type: i === 2 ? "external" : "app",
        subtype: i === 2 ? "http" : "cdn",
        name: op.name,
        duration: { us: op.us },
        action: i === 2 ? "call" : "process",
        destination: { service: { resource: op.resource, type: "app", name: op.resource } },
        labels: {
          "gcp.cdn.cache_status": cacheKey,
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
    offsetMs += Math.max(1, Math.round(op.us / 1000));
  }

  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `GET ${path}`,
      type: "request",
      duration: { us: sum + randInt(1000, 8000) },
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
