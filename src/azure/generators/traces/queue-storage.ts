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

export function generateQueueStorageTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const queue = rand(["job-queue", "notifications", "etl-tasks"]);
  const svc = azureServiceBase("queue-processor", env, "python", {
    framework: "Azure SDK",
    runtimeName: "python",
    runtimeVersion: "3.12",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);
  const cloud = azureCloud(region, subscription, "Microsoft.Storage/storageAccounts");
  const failIdx = isErr ? randInt(0, 2) : -1;

  const ops = [
    { name: `Queue.receiveMessage ${queue}`, us: randInt(2_000, 45_000) },
    { name: `Queue.processMessage ${queue}`, us: randInt(5_000, 120_000) },
    { name: `Queue.deleteMessage ${queue}`, us: randInt(500, 15_000) },
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
            type: "messaging",
            subtype: "azurequeue",
            name: op.name,
            duration: { us: op.us },
            action: i === 0 ? "receive" : i === 1 ? "process" : "delete",
            destination: { service: { resource: "queue-storage", type: "messaging", name: "azure-queue" } },
            labels: spanErr ? { "azure.queue.error": "visibility_timeout" } : { queue },
          },
          service: svc,
          cloud,
          event: { outcome: spanErr ? "failure" : "success" },
          ...dim({ dependency_type: "Azure Queue Storage", queue }),
        },
        traceId,
        "python",
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
        name: `Process queue message (${queue})`,
        type: "request",
        duration: { us: sum + randInt(800, 6000) },
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
    "python"
  );

  return [txDoc, ...spans];
}
