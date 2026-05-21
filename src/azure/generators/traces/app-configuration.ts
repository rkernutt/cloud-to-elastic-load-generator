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

export function generateAppConfigurationTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const store = rand(["appconfig-prod", "appconfig-shared", "appconfig-feature-flags"]);
  const key = rand(["Api:Timeout", "FeatureFlags:NewCheckout", "Database:ConnectionString"]);
  const svc = azureServiceBase("config-bootstrap", env, "dotnet", {
    framework: "ASP.NET Core",
    runtimeName: ".NET",
    runtimeVersion: "8.0",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);
  const cloud = azureCloud(region, subscription, "Microsoft.AppConfiguration/configurationStores");
  const failIdx = isErr ? randInt(0, 2) : -1;

  const ops = [
    { name: `AppConfig.get ${key}`, us: randInt(1_000, 22_000) },
    { name: `AppConfig.refresh ${store}`, us: randInt(2_000, 35_000) },
    { name: `AppConfig.watch ${key}`, us: randInt(500, 18_000) },
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
            subtype: "appconfiguration",
            name: op.name,
            duration: { us: op.us },
            action: "query",
            destination: {
              service: { resource: "app-configuration", type: "external", name: "azure-appconfig" },
            },
            labels: spanErr ? { "azure.appconfig.error": "key_not_found" } : { store, key },
          },
          service: svc,
          cloud,
          event: { outcome: spanErr ? "failure" : "success" },
          ...dim({ dependency_type: "Azure App Configuration", store }),
        },
        traceId,
        "dotnet",
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
        name: `Load configuration (${key})`,
        type: "request",
        duration: { us: sum + randInt(500, 5000) },
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
    "dotnet"
  );

  return [txDoc, ...spans];
}
