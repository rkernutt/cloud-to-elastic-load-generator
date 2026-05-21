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

export function generateAutomationAccountTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const runbook = rand(["Patch-WindowsVMs", "Rotate-StorageKeys", "Scale-AppService"]);
  const svc = azureServiceBase("ops-automation", env, "powershell", {
    framework: "Azure Automation",
    runtimeName: "powershell",
    runtimeVersion: "7.4",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);
  const cloud = azureCloud(region, subscription, "Microsoft.Automation/automationAccounts");
  const failIdx = isErr ? randInt(0, 2) : -1;

  const ops = [
    { name: `Automation.startRunbook ${runbook}`, us: randInt(3_000, 40_000) },
    { name: `Automation.executeActivity ${runbook}`, us: randInt(10_000, 180_000) },
    { name: `Automation.completeJob ${runbook}`, us: randInt(1_000, 25_000) },
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
            subtype: "automation",
            name: op.name,
            duration: { us: op.us },
            action: "execute",
            destination: {
              service: { resource: "automation-account", type: "app", name: "azure-automation" },
            },
            labels: spanErr ? { "azure.automation.error": "runbook_failed" } : { runbook },
          },
          service: svc,
          cloud,
          event: { outcome: spanErr ? "failure" : "success" },
          ...dim({ dependency_type: "Azure Automation", runbook }),
        },
        traceId,
        "nodejs",
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
        name: `Runbook ${runbook}`,
        type: "request",
        duration: { us: sum + randInt(2000, 12000) },
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
    "nodejs"
  );

  return [txDoc, ...spans];
}
