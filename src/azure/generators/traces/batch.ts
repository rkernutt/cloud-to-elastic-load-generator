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

export function generateBatchTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const pool = rand(["render-pool", "etl-pool", "sim-pool"]);
  const job = rand(["frame-render-0421", "daily-aggregate", "monte-carlo-run"]);
  const svc = azureServiceBase("batch-orchestrator", env, "python", {
    framework: "Azure SDK",
    runtimeName: "python",
    runtimeVersion: "3.11",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);
  const cloud = azureCloud(region, subscription, "Microsoft.Batch/batchAccounts");
  const failIdx = isErr ? randInt(0, 2) : -1;

  const ops = [
    { name: `Batch.submitJob ${job}`, us: randInt(2_000, 35_000) },
    { name: `Batch.scheduleTasks ${pool}`, us: randInt(5_000, 80_000) },
    { name: `Batch.taskExecute ${job}`, us: randInt(30_000, 300_000) },
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
            subtype: "batch",
            name: op.name,
            duration: { us: op.us },
            action: "execute",
            destination: { service: { resource: "batch", type: "app", name: "azure-batch" } },
            labels: spanErr ? { "azure.batch.error": "task_failed" } : { pool, job },
          },
          service: svc,
          cloud,
          event: { outcome: spanErr ? "failure" : "success" },
          ...dim({ dependency_type: "Azure Batch", pool }),
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
        name: `Run batch job ${job}`,
        type: "request",
        duration: { us: sum + randInt(3000, 20000) },
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
