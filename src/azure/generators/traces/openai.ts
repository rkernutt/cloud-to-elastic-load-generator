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

export function generateOpenAiTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const svc = azureServiceBase("copilot-api", env, "python", {
    framework: "FastAPI",
    runtimeName: "python",
    runtimeVersion: "3.12",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);
  const cloud = azureCloud(region, subscription, "Microsoft.CognitiveServices/accounts");

  const sEmb = randSpanId();
  const sComp = randSpanId();
  const u1 = randInt(5_000, 180_000);
  const u2 = randInt(40_000, 4_000_000);
  const errEmb = isErr && randInt(0, 1) === 0;
  const errComp = isErr && !errEmb;

  const spanEmb = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, randInt(1, 4)),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sEmb,
        type: "external",
        subtype: "openai",
        name: "AzureOpenAI.embeddings",
        duration: { us: u1 },
        action: "call",
        destination: { service: { resource: "openai", type: "external", name: "openai" } },
        labels: errEmb ? { "azure.openai.status": "429" } : {},
      },
      service: svc,
      cloud,
      event: { outcome: errEmb ? "failure" : "success" },
      ...dim({ dependency_type: "Azure OpenAI" }),
    },
    traceId,
    "python"
  );

  const spanComp = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, Math.max(1, Math.round(u1 / 1000))),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sComp,
        type: "external",
        subtype: "openai",
        name: "AzureOpenAI.chat.completions",
        duration: { us: u2 },
        action: "call",
        destination: { service: { resource: "openai", type: "external", name: "openai" } },
        labels: errComp ? { "azure.openai.status": "500" } : {},
      },
      service: svc,
      cloud,
      event: { outcome: errEmb ? "success" : errComp ? "failure" : "success" },
      ...dim({ dependency_type: "Azure OpenAI" }),
    },
    traceId,
    "python"
  );

  const totalUs = u1 + u2 + randInt(1_000, 12_000);
  const txErr = errEmb || errComp;
  const txDoc = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: "POST /assist/answer",
        type: "request",
        duration: { us: totalUs },
        result: txErr ? "HTTP 502" : "HTTP 2xx",
        sampled: true,
        span_count: { started: 2, dropped: 0 },
      },
      service: svc,
      cloud,
      event: { outcome: txErr ? "failure" : "success" },
      ...dim({}),
    },
    traceId,
    "python"
  );

  return [txDoc, spanEmb, spanComp];
}
