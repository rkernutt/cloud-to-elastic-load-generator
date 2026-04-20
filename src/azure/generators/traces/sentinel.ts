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

export function generateSentinelTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const svc = azureServiceBase("soc-automation", env, "python", {
    framework: "azure-functions",
    runtimeName: "python",
    runtimeVersion: "3.12",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);
  const cloud = azureCloud(region, subscription, "Microsoft.OperationalInsights/workspaces");
  const workspace = rand(["law-soc-prod", "law-security-01", "law-central"]);
  const failIdx = isErr ? randInt(0, 3) : -1;

  const ops = [
    { name: `Sentinel.KustoQuery ${workspace}`, us: randInt(25_000, 900_000) },
    { name: `Sentinel.RuleEvaluation ${workspace}`, us: randInt(8_000, 220_000) },
    { name: `Sentinel.CreateIncident ${workspace}`, us: randInt(12_000, 180_000) },
    { name: `Sentinel.Notification ${workspace}`, us: randInt(5_000, 120_000) },
  ];

  let ms = randInt(1, 5);
  const spans: EcsDocument[] = [];
  let sum = 0;
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]!;
    const sid = randSpanId();
    sum += op.us;
    const spanErr = failIdx === i;
    const spanBody: Record<string, unknown> = {
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
        action: "security",
        destination: { service: { resource: "sentinel", type: "app", name: "sentinel" } },
        labels: spanErr
          ? { "azure.sentinel.error": "query_failed" }
          : { rule: rand(["AAD-001", "NET-442", "PROC-88"]) },
      },
      service: svc,
      cloud,
      event: { outcome: spanErr ? "failure" : "success" },
      ...dim({ dependency_type: "Microsoft Sentinel", workspace }),
    };
    spans.push(enrichAzureTraceDoc(spanBody, traceId, "python"));
    ms += Math.max(1, Math.round(op.us / 1000));
  }

  const totalUs = sum + randInt(3_000, 45_000);
  const txErr = failIdx >= 0;
  const txDoc = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: "ScheduledAnalyticsRule run",
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
    "python"
  );

  return [txDoc, ...spans];
}
