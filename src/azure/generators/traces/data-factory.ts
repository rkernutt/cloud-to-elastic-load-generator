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

export function generateDataFactoryTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const svc = azureServiceBase("adf-orchestrator", env, "dotnet", {
    framework: "Azure Data Factory",
    runtimeName: "dotnet",
    runtimeVersion: "8.0",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);
  const cloud = azureCloud(region, subscription, "Microsoft.DataFactory/factories");
  const pipeline = rand(["pl_curated_daily", "pl_ingest_sales", "pl_dim_refresh"]);
  const failIdx = isErr ? randInt(0, 3) : -1;

  const activityKind = rand(["Copy", "DataFlow"]);
  const ops = [
    {
      name: `ADF.Trigger.Execute ${pipeline}`,
      us: randInt(5_000, 85_000),
      st: "app" as const,
      sub: "internal" as const,
    },
    {
      name: `ADF.Activity.${activityKind} source_read`,
      us: randInt(80_000, 900_000),
      st: "storage" as const,
      sub: "azure-blob" as const,
    },
    {
      name: `ADF.Activity.${activityKind} transform`,
      us: randInt(120_000, 2_200_000),
      st: "app" as const,
      sub: "internal" as const,
    },
    {
      name: "ADF.Sink.Write sql_warehouse",
      us: randInt(200_000, 5_000_000),
      st: "db" as const,
      sub: "azuresql" as const,
    },
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
            type: op.st,
            subtype: op.sub,
            name: op.name,
            duration: { us: op.us },
            action: i === 0 ? "exec" : i === 3 ? "bulk_insert" : "process",
            destination: {
              service: {
                resource: "data-factory",
                type: op.st === "db" ? "db" : op.st,
                name: "adf",
              },
            },
            labels: spanErr ? { "azure.adf.error": "activity_failed" } : {},
            ...(op.sub === "azuresql"
              ? { db: { type: "sql", statement: "MERGE INTO curated.facts USING staging.s AS s" } }
              : {}),
          },
          service: svc,
          cloud,
          event: { outcome: spanErr ? "failure" : "success" },
          ...dim({ pipeline, activity: activityKind }),
        },
        traceId,
        "dotnet"
      )
    );
    ms += Math.max(1, Math.round(op.us / 1000));
  }

  const totalUs = sum + randInt(50_000, 600_000);
  const txErr = failIdx >= 0;
  const txDoc = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: `PipelineRun ${pipeline}`,
        type: "job",
        duration: { us: totalUs },
        result: txErr ? "failure" : "success",
        sampled: true,
        span_count: { started: spans.length, dropped: 0 },
      },
      service: svc,
      cloud,
      event: { outcome: txErr ? "failure" : "success" },
      azure: { trace: { activity: activityKind } },
      ...dim({}),
    },
    traceId,
    "dotnet"
  );

  return [txDoc, ...spans];
}
