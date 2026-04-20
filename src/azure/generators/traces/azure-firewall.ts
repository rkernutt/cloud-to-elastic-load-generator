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

export function generateAzureFirewallTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const svc = azureServiceBase("hub-firewall-policy", env, "python", {
    framework: "fastapi",
    runtimeName: "python",
    runtimeVersion: "3.12",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);
  const cloud = azureCloud(region, subscription, "Microsoft.Network/azureFirewalls");
  const fw = rand(["azfw-hub-01", "azfw-spoke-edge", "azfw-secure-vnet"]);
  const failIdx = isErr ? randInt(0, 3) : -1;

  const ops = [
    { name: `AzureFirewall.IngestPacket ${fw}`, us: randInt(200, 8_000) },
    { name: `AzureFirewall.EvaluateRuleCollection ${fw}`, us: randInt(1_000, 45_000) },
    { name: `AzureFirewall.ApplyAction ${fw}`, us: randInt(500, 25_000) },
    { name: `AzureFirewall.LogFlow ${fw}`, us: randInt(300, 15_000) },
  ];

  let ms = randInt(1, 3);
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
            action: "firewall",
            destination: {
              service: { resource: "azure-firewall", type: "app", name: "azure-firewall" },
            },
            labels: spanErr
              ? { "azure.firewall.action": "deny", "azure.firewall.error": "rule_violation" }
              : { "azure.firewall.action": rand(["allow", "allow", "dnat"]) },
          },
          service: svc,
          cloud,
          event: { outcome: spanErr ? "failure" : "success" },
          ...dim({ dependency_type: "Azure Firewall", firewall: fw }),
        },
        traceId,
        "python"
      )
    );
    ms += Math.max(1, Math.round(op.us / 1000));
  }

  const totalUs = sum + randInt(200, 6_000);
  const txErr = failIdx >= 0;
  const txDoc = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: rand(["inspect flow tcp/443", "inspect flow udp/53"]),
        type: "request",
        duration: { us: totalUs },
        result: txErr ? "failure" : "success",
        sampled: true,
        span_count: { started: spans.length, dropped: 0 },
      },
      service: svc,
      cloud,
      event: { outcome: txErr ? "failure" : "success" },
      ...dim({}),
    },
    traceId,
    "python"
  );

  return [txDoc, ...spans];
}
