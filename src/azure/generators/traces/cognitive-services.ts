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

export function generateCognitiveServicesTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const svc = azureServiceBase("nlp-api", env, "python", {
    framework: "fastapi",
    runtimeName: "python",
    runtimeVersion: "3.12",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);
  const cloud = azureCloud(region, subscription, "Microsoft.CognitiveServices/accounts");
  const account = rand(["cogsvc-text-prod", "cogsvc-multimodal", "cogsvc-shared"]);
  const failIdx = isErr ? randInt(0, 3) : -1;

  const ops = [
    { name: `CognitiveServices.ApiCall ${account}`, us: randInt(3_000, 45_000) },
    { name: `CognitiveServices.ModelSelect ${account}`, us: randInt(800, 18_000) },
    { name: `CognitiveServices.Inference ${account}`, us: randInt(40_000, 2_500_000) },
    { name: `CognitiveServices.Response ${account}`, us: randInt(2_000, 35_000) },
  ];

  let ms = randInt(1, 5);
  const spans: EcsDocument[] = [];
  let sum = 0;
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]!;
    const sid = randSpanId();
    sum += op.us;
    const spanErr = failIdx === i;
    const isHttp = i === 0 || i === 3;
    const spanCore = {
      id: sid,
      type: isHttp ? ("external" as const) : ("app" as const),
      subtype: isHttp ? ("http" as const) : ("internal" as const),
      name: op.name,
      duration: { us: op.us },
      action: i === 2 ? ("inference" as const) : ("http" as const),
      destination: {
        service: {
          resource: "cognitive-services",
          type: "external" as const,
          name: "cognitive-services",
        },
      },
      labels: spanErr ? { "azure.cognitive.error": "quota_exceeded" } : {},
      ...(isHttp ? { http: { response: { status_code: spanErr ? 429 : 200 } } } : {}),
    };
    spans.push(
      enrichAzureTraceDoc(
        {
          "@timestamp": offsetTs(base, ms),
          processor: { name: "transaction", event: "span" },
          trace: { id: traceId },
          transaction: { id: txId },
          parent: { id: txId },
          span: spanCore,
          service: svc,
          cloud,
          event: { outcome: spanErr ? "failure" : "success" },
          ...dim({ dependency_type: "Azure Cognitive Services", account }),
        },
        traceId,
        "python"
      )
    );
    ms += Math.max(1, Math.round(op.us / 1000));
  }

  const totalUs = sum + randInt(2_000, 28_000);
  const txErr = failIdx >= 0;
  const txDoc = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: rand(["POST /language/analyze", "POST /vision/analyze"]),
        type: "request",
        duration: { us: totalUs },
        result: txErr ? "HTTP 429" : "HTTP 2xx",
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
