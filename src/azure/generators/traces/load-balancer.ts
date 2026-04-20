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

export function generateLoadBalancerTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const svc = azureServiceBase("edge-ingress", env, "go", {
    framework: "net/http",
    runtimeName: "go",
    runtimeVersion: "1.23",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);
  const cloud = azureCloud(region, subscription, "Microsoft.Network/loadBalancers");
  const lb = rand(["ilb-app-tier", "plb-public-api", "ilb-data"]);
  const failIdx = isErr ? randInt(0, 3) : -1;

  const ops = [
    { name: `AzureLB.HealthProbe ${lb}`, us: randInt(800, 25_000) },
    { name: `AzureLB.SelectBackendPool ${lb}`, us: randInt(400, 12_000) },
    { name: `AzureLB.ApplyNatRule ${lb}`, us: randInt(300, 18_000) },
    { name: `AzureLB.Forward ${lb}`, us: randInt(2_000, 120_000) },
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
            destination: { service: { resource: "load-balancer", type: "app", name: "azure-lb" } },
            labels: spanErr
              ? { "azure.lb.error": "backend_unhealthy" }
              : { backend: rand(["vm-01", "vm-02", "vmss-3"]) },
          },
          service: svc,
          cloud,
          event: { outcome: spanErr ? "failure" : "success" },
          ...dim({ dependency_type: "Azure Load Balancer", load_balancer: lb }),
        },
        traceId,
        "go"
      )
    );
    ms += Math.max(1, Math.round(op.us / 1000));
  }

  const totalUs = sum + randInt(500, 12_000);
  const txErr = failIdx >= 0;
  const txDoc = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: rand(["TCP :443", "TCP :80"]),
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
    "go"
  );

  return [txDoc, ...spans];
}
