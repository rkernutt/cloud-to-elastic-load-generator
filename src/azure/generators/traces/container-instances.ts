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

export function generateContainerInstancesTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const svc = azureServiceBase("aci-deployer", env, "dotnet", {
    framework: "Azure.ResourceManager",
    runtimeName: "dotnet",
    runtimeVersion: "8.0",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);
  const cloud = azureCloud(region, subscription, "Microsoft.ContainerInstance/containerGroups");
  const group = rand(["cg-batch-worker", "cg-sidecar-job", "cg-api-smoke"]);
  const image = rand([
    "contoso/worker:2026.04.1",
    "fabrikam/tools:latest",
    "mcr.microsoft.com/dotnet/runtime:8.0",
  ]);
  const failIdx = isErr ? randInt(0, 3) : -1;

  const ops = [
    { name: `ACI.CreateContainerGroup ${group}`, us: randInt(80_000, 2_500_000) },
    { name: `ACI.PullImage ${group}`, us: randInt(200_000, 8_000_000) },
    { name: `ACI.StartContainer ${group}`, us: randInt(30_000, 900_000) },
    { name: `ACI.HealthProbe ${group}`, us: randInt(5_000, 120_000) },
  ];

  let ms = randInt(1, 5);
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
            action: i === 1 ? "pull" : i === 3 ? "healthcheck" : "exec",
            destination: { service: { resource: "container-instances", type: "app", name: "aci" } },
            labels: spanErr
              ? { "azure.aci.error": i === 1 ? "image_pull_backoff" : "probe_failed" }
              : { image },
          },
          service: svc,
          cloud,
          event: { outcome: spanErr ? "failure" : "success" },
          ...dim({ dependency_type: "Azure Container Instances", container_group: group }),
        },
        traceId,
        "dotnet"
      )
    );
    ms += Math.max(1, Math.round(op.us / 1000));
  }

  const totalUs = sum + randInt(20_000, 400_000);
  const txErr = failIdx >= 0;
  const txDoc = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: `DeployContainerGroup ${group}`,
        type: "job",
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
    "dotnet"
  );

  return [txDoc, ...spans];
}
