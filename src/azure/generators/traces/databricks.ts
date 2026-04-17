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

export function generateDatabricksTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const svc = azureServiceBase("dbx-driver", env, "java", {
    framework: "Apache Spark",
    runtimeName: "java",
    runtimeVersion: "17",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);
  const cloud = azureCloud(region, subscription, "Microsoft.Databricks/workspaces");

  const stages = [
    { name: "Databricks.Jobs.Run.read", us: randInt(40_000, 1_200_000) },
    { name: "Databricks.Jobs.Run.transform", us: randInt(80_000, 3_500_000) },
    { name: "Databricks.Jobs.Run.write", us: randInt(50_000, 2_000_000) },
  ];

  let ms = randInt(1, 8);
  const spans: EcsDocument[] = [];
  let sum = 0;
  for (let i = 0; i < stages.length; i++) {
    const st = stages[i]!;
    const sid = randSpanId();
    sum += st.us;
    const spanErr = isErr && i === stages.length - 1;
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
            subtype: "spark",
            name: st.name,
            duration: { us: st.us },
            action: "execute",
            destination: { service: { resource: "databricks", type: "app", name: "databricks" } },
            labels: { "azure.databricks.job_id": String(randInt(10000, 99999)) },
          },
          service: svc,
          cloud,
          event: { outcome: spanErr ? "failure" : "success" },
          ...dim({ dependency_type: "Azure Databricks" }),
        },
        traceId,
        "java"
      )
    );
    ms += Math.max(1, Math.round(st.us / 1000));
  }

  const totalUs = sum + randInt(3_000, 30_000);
  const txDoc = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: "DatabricksJob nightly_curated",
        type: "request",
        duration: { us: totalUs },
        result: isErr ? "failure" : "success",
        sampled: true,
        span_count: { started: spans.length, dropped: 0 },
      },
      service: svc,
      cloud,
      event: { outcome: isErr ? "failure" : "success" },
      ...dim({}),
    },
    traceId,
    "java"
  );

  return [txDoc, ...spans];
}
