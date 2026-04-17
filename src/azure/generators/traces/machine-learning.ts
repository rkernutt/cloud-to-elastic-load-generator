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

export function generateMachineLearningTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const svc = azureServiceBase("scoring-gateway", env, "python", {
    framework: "Flask",
    runtimeName: "python",
    runtimeVersion: "3.11",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);
  const cloud = azureCloud(region, subscription, "Microsoft.MachineLearningServices/workspaces");

  const s1 = randSpanId();
  const s2 = randSpanId();
  const u1 = randInt(3_000, 120_000);
  const u2 = randInt(20_000, 2_000_000);
  const err2 = isErr;

  const spanAuth = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, randInt(1, 4)),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: s1,
        type: "external",
        subtype: "http",
        name: "AML.GetToken",
        duration: { us: u1 },
        action: "call",
        destination: { service: { resource: "azure_ml", type: "external", name: "azure_ml" } },
      },
      service: svc,
      cloud,
      event: { outcome: "success" },
      ...dim({ dependency_type: "Azure ML" }),
    },
    traceId,
    "python"
  );

  const spanScore = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, Math.max(1, Math.round(u1 / 1000))),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: s2,
        type: "external",
        subtype: "http",
        name: "AML.OnlineEndpoint.Invoke",
        duration: { us: u2 },
        action: "call",
        destination: { service: { resource: "azure_ml", type: "external", name: "azure_ml" } },
        labels: err2 ? { "http.status_code": "503" } : { "http.status_code": "200" },
      },
      service: svc,
      cloud,
      event: { outcome: err2 ? "failure" : "success" },
      ...dim({ dependency_type: "Azure ML Endpoint" }),
    },
    traceId,
    "python"
  );

  const totalUs = u1 + u2 + randInt(1_000, 10_000);
  const txDoc = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: "POST /score/fraud",
        type: "request",
        duration: { us: totalUs },
        result: err2 ? "HTTP 503" : "HTTP 2xx",
        sampled: true,
        span_count: { started: 2, dropped: 0 },
      },
      service: svc,
      cloud,
      event: { outcome: err2 ? "failure" : "success" },
      ...dim({}),
    },
    traceId,
    "python"
  );

  return [txDoc, spanAuth, spanScore];
}
