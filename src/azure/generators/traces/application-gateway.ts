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

export function generateApplicationGatewayTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const svc = azureServiceBase("appgw-ingress", env, "dotnet", {
    framework: "YARP",
    runtimeName: "dotnet",
    runtimeVersion: "8.0",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);
  const cloud = azureCloud(region, subscription, "Microsoft.Network/applicationGateways");
  const agw = rand(["agw-public-01", "agw-waf-prod", "agw-internal"]);
  const failIdx = isErr ? randInt(0, 3) : -1;

  const ops = [
    { name: `AppGateway.ReceiveRequest ${agw}`, us: randInt(1_000, 25_000) },
    { name: `AppGateway.WafInspect ${agw}`, us: randInt(5_000, 180_000) },
    { name: `AppGateway.UrlPathRoute ${agw}`, us: randInt(600, 22_000) },
    { name: `AppGateway.BackendForward ${agw}`, us: randInt(8_000, 400_000) },
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
            type: i === 3 ? "external" : "app",
            subtype: i === 3 ? "http" : "internal",
            name: op.name,
            duration: { us: op.us },
            action: i === 1 ? "security" : i === 3 ? "http" : "route",
            destination: {
              service: { resource: "application-gateway", type: "external", name: "appgw" },
            },
            labels: spanErr
              ? { "azure.appgw.error": i === 1 ? "waf_block" : "backend_timeout" }
              : {},
            ...(i === 3 ? { http: { response: { status_code: spanErr ? 504 : 200 } } } : {}),
          },
          service: svc,
          cloud,
          event: { outcome: spanErr ? "failure" : "success" },
          ...dim({ dependency_type: "Azure Application Gateway", gateway: agw }),
        },
        traceId,
        "dotnet"
      )
    );
    ms += Math.max(1, Math.round(op.us / 1000));
  }

  const totalUs = sum + randInt(1_000, 20_000);
  const txErr = failIdx >= 0;
  const txDoc = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: rand(["GET /api/catalog", "POST /checkout"]),
        type: "request",
        duration: { us: totalUs },
        result: txErr ? "HTTP 403" : "HTTP 2xx",
        sampled: true,
        span_count: { started: spans.length, dropped: 0 },
      },
      service: svc,
      cloud,
      event: { outcome: txErr ? "failure" : "success" },
      ...dim({}),
    },
    traceId,
    "dotnet"
  );

  return [txDoc, ...spans];
}
