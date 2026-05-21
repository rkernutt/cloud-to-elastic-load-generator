import type { EcsDocument } from "../helpers.js";
import { rand, randInt, azureCloud, makeAzureSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { azureServiceBase, enrichAzureTraceDoc } from "./trace-kit.js";

function cd(region: string, rg: string, sub: string, extra: Record<string, string> = {}) {
  return {
    customDimensions: {
      azure_region: region,
      azure_resource_group: rg,
      azure_subscription_id: sub,
      ...extra,
    },
  };
}

export function generateCdnTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const endpoint = rand(["cdn-assets", "cdn-media", "cdn-api-cache"]);
  const cacheStatus = rand(["HIT", "MISS", "REVALIDATED"]);
  const svc = azureServiceBase("static-delivery", env, "go", { runtimeName: "go", runtimeVersion: "1.23" });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);
  const cloud = azureCloud(region, subscription, "Microsoft.Cdn/profiles");
  const failIdx = isErr ? randInt(0, 2) : -1;

  const ops = [
    { name: `CDN.cacheLookup ${endpoint}`, us: randInt(200, 12_000) },
    { name: `CDN.popServe ${cacheStatus}`, us: randInt(500, 35_000) },
    { name: `CDN.originPull ${endpoint}`, us: randInt(2_000, 95_000) },
  ];

  let ms = randInt(1, 4);
  const spans: EcsDocument[] = [];
  let sum = 0;
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]!;
    const sid = randSpanId();
    sum += op.us;
    const spanErr = failIdx === i;
    spans.push(
      enrichAzureTraceDoc(
        {
          "@timestamp": offsetTs(base, ms),
          processor: { name: "transaction", event: "span" },
          trace: { id: traceId },
          transaction: { id: txId },
          parent: { id: txId },
          span: {
            id: sid,
            type: "app",
            subtype: "cdn",
            name: op.name,
            duration: { us: op.us },
            action: "process",
            destination: { service: { resource: "cdn", type: "app", name: "azure-cdn" } },
            labels: spanErr ? { "azure.cdn.error": "origin_timeout" } : { cache_status: cacheStatus },
          },
          service: svc,
          cloud,
          event: { outcome: spanErr ? "failure" : "success" },
          ...dim({ dependency_type: "Azure CDN", endpoint }),
        },
        traceId,
        "go",
        { spanFailed: spanErr }
      )
    );
    ms += Math.max(1, Math.round(op.us / 1000));
  }

  const txDoc = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: rand(["GET /assets/app.js", "GET /images/banner.png"]),
        type: "request",
        duration: { us: sum + randInt(800, 6000) },
        result: failIdx >= 0 ? "failure" : "success",
        sampled: true,
        span_count: { started: spans.length, dropped: 0 },
      },
      service: svc,
      cloud,
      event: { outcome: failIdx >= 0 ? "failure" : "success" },
      ...dim({}),
    },
    traceId,
    "go"
  );

  return [txDoc, ...spans];
}
