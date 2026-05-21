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

export function generateFrontDoorTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const profile = rand(["afd-global-prod", "afd-api-edge"]);
  const path = rand(["/api/orders", "/static/*", "/health"]);
  const svc = azureServiceBase("edge-gateway", env, "nodejs", {
    framework: "Express",
    runtimeName: "node",
    runtimeVersion: "20.x",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);
  const cloud = azureCloud(region, subscription, "Microsoft.Cdn/profiles");
  const failIdx = isErr ? randInt(0, 2) : -1;

  const ops = [
    { name: `FrontDoor.WAF.inspect ${path}`, us: randInt(800, 25_000) },
    { name: `FrontDoor.routeRule ${profile}`, us: randInt(400, 18_000) },
    { name: `FrontDoor.originFetch ${path}`, us: randInt(3_000, 120_000) },
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
            type: i === 2 ? "external" : "app",
            subtype: i === 2 ? "http" : "cdn",
            name: op.name,
            duration: { us: op.us },
            action: i === 2 ? "call" : "process",
            destination: { service: { resource: "front-door", type: "app", name: "azure-front-door" } },
            labels: spanErr ? { "http.status_code": "502" } : { profile },
          },
          service: svc,
          cloud,
          event: { outcome: spanErr ? "failure" : "success" },
          ...dim({ dependency_type: "Azure Front Door", profile }),
        },
        traceId,
        "nodejs",
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
        name: `GET ${path}`,
        type: "request",
        duration: { us: sum + randInt(1000, 8000) },
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
    "nodejs"
  );

  return [txDoc, ...spans];
}
