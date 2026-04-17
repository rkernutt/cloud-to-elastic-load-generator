import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

export function generateMemorystoreTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const otel = gcpOtelMeta("nodejs");
  const svc = gcpServiceBase("rate-limiter", env, "nodejs", {
    framework: "Express",
    runtimeName: "node",
    runtimeVersion: "20.15.1",
  });
  const cloud = gcpCloud(region, project, "redis.googleapis.com");

  const cmds = rand([
    ["GET", "INCR", "EXPIRE"],
    ["MGET", "SET"],
    ["ZADD", "ZRANGE", "EXPIRE"],
  ]);

  let ms = randInt(1, 5);
  const spans: EcsDocument[] = [];
  let sum = 0;
  for (let i = 0; i < cmds.length; i++) {
    const cmd = cmds[i]!;
    const sid = randSpanId();
    const us = randInt(200, 55_000);
    sum += us;
    const spanErr = isErr && i === cmds.length - 1;
    spans.push({
      "@timestamp": offsetTs(base, ms),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sid,
        type: "db",
        subtype: "redis",
        name: `Redis ${cmd}`,
        duration: { us },
        action: cmd.toLowerCase(),
        db: { type: "redis", statement: `${cmd} rl:*` },
        destination: { service: { resource: "redis", type: "db", name: "redis" } },
      },
      service: svc,
      cloud,
      data_stream: APM_DS,
      event: { outcome: spanErr ? "failure" : "success" },
      ...otel,
      ...gcpCloudTraceMeta(project.id, traceId, sid),
    });
    ms += Math.max(1, Math.round(us / 1000));
  }

  const totalUs = sum + randInt(800, 9_000);
  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: "POST /check-quota",
      type: "request",
      duration: { us: totalUs },
      result: isErr ? "HTTP 429" : "HTTP 2xx",
      sampled: true,
      span_count: { started: spans.length, dropped: 0 },
    },
    service: svc,
    cloud,
    labels: { "gcp.redis.instance": "memorystore-rate-1" },
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, ...spans];
}
