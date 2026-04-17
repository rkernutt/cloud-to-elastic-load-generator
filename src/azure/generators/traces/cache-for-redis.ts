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

export function generateCacheForRedisTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const svc = azureServiceBase("pricing-api", env, "dotnet", {
    framework: "ASP.NET Core",
    runtimeName: "dotnet",
    runtimeVersion: "8.0",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);
  const cloud = azureCloud(region, subscription, "Microsoft.Cache/Redis");

  const cmds = rand([
    ["GET", "SET", "GET"],
    ["MGET", "EXPIRE"],
  ]);

  let ms = randInt(1, 6);
  const spans: EcsDocument[] = [];
  let sum = 0;
  for (let i = 0; i < cmds.length; i++) {
    const cmd = cmds[i]!;
    const sid = randSpanId();
    const us = randInt(300, 65_000);
    sum += us;
    const spanErr = isErr && i === cmds.length - 1;
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
            type: "db",
            subtype: "redis",
            name: `StackExchange.Redis ${cmd}`,
            duration: { us },
            action: cmd.toLowerCase(),
            db: { type: "redis", statement: `${cmd} price:*` },
            destination: { service: { resource: "redis", type: "db", name: "redis" } },
          },
          service: svc,
          cloud,
          event: { outcome: spanErr ? "failure" : "success" },
          ...dim({ dependency_type: "Azure Cache for Redis" }),
        },
        traceId,
        "dotnet"
      )
    );
    ms += Math.max(1, Math.round(us / 1000));
  }

  const totalUs = sum + randInt(1_000, 10_000);
  const txDoc = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: "GET /prices/{sku}",
        type: "request",
        duration: { us: totalUs },
        result: isErr ? "failure" : "success",
        sampled: true,
        span_count: { started: spans.length, dropped: 0 },
      },
      service: svc,
      cloud,
      event: { outcome: isErr ? "failure" : "success" },
      ...dim({}),
    },
    traceId,
    "dotnet"
  );

  return [txDoc, ...spans];
}
