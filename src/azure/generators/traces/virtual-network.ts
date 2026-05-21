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

export function generateVirtualNetworkTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const vnet = rand(["vnet-hub", "vnet-spoke-app", "vnet-data"]);
  const svc = azureServiceBase("network-controller", env, "go", {
    runtimeName: "go",
    runtimeVersion: "1.23",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);
  const cloud = azureCloud(region, subscription, "Microsoft.Network/virtualNetworks");
  const failIdx = isErr ? randInt(0, 2) : -1;

  const ops = [
    { name: `VNet.routeLookup ${vnet}`, us: randInt(400, 15_000) },
    { name: `VNet.nsgEvaluate ${vnet}`, us: randInt(300, 12_000) },
    { name: `VNet.packetForward ${vnet}`, us: randInt(1_000, 45_000) },
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
            subtype: "internal",
            name: op.name,
            duration: { us: op.us },
            action: "route",
            destination: { service: { resource: "virtual-network", type: "app", name: "vnet" } },
            labels: spanErr ? { "azure.vnet.error": "route_unavailable" } : { vnet },
          },
          service: svc,
          cloud,
          event: { outcome: spanErr ? "failure" : "success" },
          ...dim({ dependency_type: "Azure Virtual Network", vnet }),
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
        name: `East-west traffic (${vnet})`,
        type: "request",
        duration: { us: sum + randInt(500, 8000) },
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
