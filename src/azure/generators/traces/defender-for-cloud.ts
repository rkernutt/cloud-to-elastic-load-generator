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

export function generateDefenderForCloudTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const svc = azureServiceBase("mdc-assessment-runner", env, "java", {
    framework: "spring-boot",
    runtimeName: "java",
    runtimeVersion: "21",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);
  const cloud = azureCloud(region, subscription, "Microsoft.Security/assessments");
  const subName = subscription.name;
  const failIdx = isErr ? randInt(0, 3) : -1;

  const ops = [
    { name: `Defender.ResourceScan ${subName}`, us: randInt(40_000, 1_200_000) },
    { name: `Defender.PolicyEvaluate ${subName}`, us: randInt(15_000, 400_000) },
    { name: `Defender.Recommendation ${subName}`, us: randInt(8_000, 180_000) },
    { name: `Defender.Alert ${subName}`, us: randInt(5_000, 95_000) },
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
            type: "app",
            subtype: "internal",
            name: op.name,
            duration: { us: op.us },
            action: "security",
            destination: {
              service: { resource: "defender", type: "app", name: "defender-for-cloud" },
            },
            labels: spanErr
              ? { "azure.defender.error": "assessment_failed" }
              : {
                  resource_type: rand([
                    "Microsoft.Storage/storageAccounts",
                    "Microsoft.Sql/servers",
                  ]),
                },
          },
          service: svc,
          cloud,
          event: { outcome: spanErr ? "failure" : "success" },
          ...dim({ dependency_type: "Microsoft Defender for Cloud", subscription: subName }),
        },
        traceId,
        "java"
      )
    );
    ms += Math.max(1, Math.round(op.us / 1000));
  }

  const totalUs = sum + randInt(5_000, 80_000);
  const txErr = failIdx >= 0;
  const txDoc = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: "Security assessment batch",
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
