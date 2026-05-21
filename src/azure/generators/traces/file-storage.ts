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

export function generateFileStorageTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const share = rand(["reports", "uploads", "backups"]);
  const file = rand(["Q1-summary.xlsx", "export.csv", "archive.tar.gz"]);
  const svc = azureServiceBase("report-worker", env, "dotnet", {
    framework: "ASP.NET Core",
    runtimeName: ".NET",
    runtimeVersion: "8.0",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);
  const cloud = azureCloud(region, subscription, "Microsoft.Storage/storageAccounts");
  const failIdx = isErr ? randInt(0, 2) : -1;

  const ops = [
    { name: `FileShare.open ${share}`, us: randInt(1_000, 20_000) },
    { name: `FileShare.read ${file}`, us: randInt(2_000, 85_000) },
    { name: `FileShare.close ${share}`, us: randInt(300, 8_000) },
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
            type: "storage",
            subtype: "azurefile",
            name: op.name,
            duration: { us: op.us },
            action: i === 1 ? "read" : "access",
            destination: {
              service: { resource: "file-storage", type: "storage", name: "azure-files" },
            },
            labels: spanErr ? { "azure.storage.error": "share_not_found" } : { share, file },
          },
          service: svc,
          cloud,
          event: { outcome: spanErr ? "failure" : "success" },
          ...dim({ dependency_type: "Azure Files", share }),
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
        name: `Read ${file}`,
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
