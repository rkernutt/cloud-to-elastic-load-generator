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

export function generateStreamAnalyticsTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const svc = azureServiceBase("asa-metrics-job", env, "java", {
    framework: "azure-stream-analytics",
    runtimeName: "java",
    runtimeVersion: "21",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);
  const cloud = azureCloud(region, subscription, "Microsoft.StreamAnalytics/streamingjobs");
  const job = rand(["asa-orders-agg", "asa-telemetry-hotpath", "asa-fraud-stream"]);
  const failIdx = isErr ? randInt(0, 3) : -1;

  const ops = [
    { name: `ASA.Input.Read ${job}`, us: randInt(4_000, 95_000) },
    { name: `ASA.Query.Process ${job}`, us: randInt(25_000, 800_000) },
    { name: `ASA.Output.Write ${job}`, us: randInt(10_000, 350_000) },
    { name: `ASA.Checkpoint.Commit ${job}`, us: randInt(2_000, 55_000) },
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
            type: i === 2 ? "messaging" : "app",
            subtype: i === 2 ? "azure-event-hubs" : "internal",
            name: op.name,
            duration: { us: op.us },
            action: i === 0 ? "receive" : i === 2 ? "send" : "process",
            destination: {
              service: {
                resource: "stream-analytics",
                type: "messaging",
                name: "stream-analytics",
              },
            },
            labels: spanErr ? { "azure.asa.error": "serialization_failure" } : {},
          },
          service: svc,
          cloud,
          event: { outcome: spanErr ? "failure" : "success" },
          ...dim({ dependency_type: "Azure Stream Analytics", job }),
        },
        traceId,
        "java"
      )
    );
    ms += Math.max(1, Math.round(op.us / 1000));
  }

  const totalUs = sum + randInt(3_000, 40_000);
  const txErr = failIdx >= 0;
  const txDoc = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: `StreamingJob ${job}`,
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
    "java"
  );

  return [txDoc, ...spans];
}
