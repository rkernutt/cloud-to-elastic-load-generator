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

export function generateAcrTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const registry = rand(["acrprodshared", "acrdevops", "acrcicd"]);
  const image = rand(["api:2.14.3", "worker:1.8.0", "frontend:2026.04.1"]);
  const svc = azureServiceBase("deploy-pipeline", env, "go", {
    runtimeName: "go",
    runtimeVersion: "1.23",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);
  const cloud = azureCloud(region, subscription, "Microsoft.ContainerRegistry/registries");
  const failIdx = isErr ? randInt(0, 2) : -1;

  const ops = [
    { name: `ACR.authenticate ${registry}`, us: randInt(1_000, 25_000) },
    { name: `ACR.pullManifest ${image}`, us: randInt(5_000, 95_000) },
    { name: `ACR.downloadLayers ${image}`, us: randInt(10_000, 200_000) },
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
            subtype: "containerregistry",
            name: op.name,
            duration: { us: op.us },
            action: i === 0 ? "auth" : "pull",
            destination: { service: { resource: "acr", type: "external", name: "azure-acr" } },
            labels: spanErr ? { "azure.acr.error": "manifest_unknown" } : { registry, image },
          },
          service: svc,
          cloud,
          event: { outcome: spanErr ? "failure" : "success" },
          ...dim({ dependency_type: "Azure Container Registry", registry }),
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
        name: `Pull image ${image}`,
        type: "request",
        duration: { us: sum + randInt(2000, 15000) },
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
