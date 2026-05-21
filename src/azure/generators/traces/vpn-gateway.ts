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

export function generateVpnGatewayTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const gateway = rand(["vpngw-hub", "vpngw-branch-dc1"]);
  const svc = azureServiceBase("hybrid-connect", env, "java", {
    framework: "Spring",
    runtimeName: "OpenJDK",
    runtimeVersion: "21",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);
  const cloud = azureCloud(region, subscription, "Microsoft.Network/virtualNetworkGateways");
  const failIdx = isErr ? randInt(0, 2) : -1;

  const ops = [
    { name: `VpnGateway.IKE.negotiate ${gateway}`, us: randInt(5_000, 80_000) },
    { name: `VpnGateway.tunnelEstablish ${gateway}`, us: randInt(3_000, 55_000) },
    { name: `VpnGateway.encryptForward ${gateway}`, us: randInt(1_000, 40_000) },
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
            type: "external",
            subtype: "vpn",
            name: op.name,
            duration: { us: op.us },
            action: "connect",
            destination: {
              service: { resource: "vpn-gateway", type: "external", name: "azure-vpn" },
            },
            labels: spanErr ? { "azure.vpn.error": "tunnel_down" } : { gateway },
          },
          service: svc,
          cloud,
          event: { outcome: spanErr ? "failure" : "success" },
          ...dim({ dependency_type: "Azure VPN Gateway", gateway }),
        },
        traceId,
        "java",
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
        name: `Site-to-site tunnel (${gateway})`,
        type: "request",
        duration: { us: sum + randInt(2000, 12000) },
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
    "java"
  );

  return [txDoc, ...spans];
}
