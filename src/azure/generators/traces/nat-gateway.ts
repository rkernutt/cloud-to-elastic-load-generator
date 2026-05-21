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

export function generateNatGatewayTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const nat = rand(["natgw-egress-prod", "natgw-spoke-01"]);
  const svc = azureServiceBase("egress-proxy", env, "go", { runtimeName: "go", runtimeVersion: "1.23" });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);
  const cloud = azureCloud(region, subscription, "Microsoft.Network/natGateways");
  const failIdx = isErr ? randInt(0, 2) : -1;

  const ops = [
    { name: `NatGateway.snapt ${nat}`, us: randInt(300, 12_000) },
    { name: `NatGateway.routeEgress ${nat}`, us: randInt(500, 22_000) },
    { name: `NatGateway.forward ${nat}`, us: randInt(1_000, 38_000) },
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
            destination: { service: { resource: "nat-gateway", type: "app", name: "azure-nat" } },
            labels: spanErr ? { "azure.nat.error": "port_exhausted" } : { nat },
          },
          service: svc,
          cloud,
          event: { outcome: spanErr ? "failure" : "success" },
          ...dim({ dependency_type: "Azure NAT Gateway", nat }),
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
        name: "Outbound internet egress",
        type: "request",
        duration: { us: sum + randInt(500, 6000) },
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
