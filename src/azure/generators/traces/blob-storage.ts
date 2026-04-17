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

export function generateBlobStorageTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const svc = azureServiceBase("media-api", env, "nodejs", {
    framework: "Express",
    runtimeName: "nodejs",
    runtimeVersion: "20",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);
  const cloud = azureCloud(region, subscription, "Microsoft.Storage/storageAccounts/blobServices");

  const ops = [
    { name: "Blob.GetProperties", us: randInt(400, 45_000) },
    { name: "Blob.Download", us: randInt(2_000, 400_000) },
    { name: "Blob.ListBlobsSegmented", us: randInt(800, 120_000) },
  ];

  let ms = randInt(1, 5);
  const spans: EcsDocument[] = [];
  let sum = 0;
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]!;
    const sid = randSpanId();
    sum += op.us;
    const spanErr = isErr && i === ops.length - 1;
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
            subtype: "azure_blob",
            name: op.name,
            duration: { us: op.us },
            action: "call",
            destination: { service: { resource: "azure_blob", type: "storage", name: "blob" } },
            labels: { "azure.storage.container": rand(["assets", "uploads", "exports"]) },
          },
          service: svc,
          cloud,
          event: { outcome: spanErr ? "failure" : "success" },
          ...dim({ dependency_type: "Azure Blob" }),
        },
        traceId,
        "nodejs"
      )
    );
    ms += Math.max(1, Math.round(op.us / 1000));
  }

  const totalUs = sum + randInt(1_000, 12_000);
  const txDoc = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: "GET /media/{id}",
        type: "request",
        duration: { us: totalUs },
        result: isErr ? "HTTP 500" : "HTTP 2xx",
        sampled: true,
        span_count: { started: spans.length, dropped: 0 },
      },
      service: svc,
      cloud,
      event: { outcome: isErr ? "failure" : "success" },
      ...dim({}),
    },
    traceId,
    "nodejs"
  );

  return [txDoc, ...spans];
}
