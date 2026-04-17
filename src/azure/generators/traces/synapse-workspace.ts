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

export function generateSynapseWorkspaceTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const svc = azureServiceBase("synapse-orchestrator", env, "dotnet", {
    framework: "Azure Synapse SDK",
    runtimeName: "dotnet",
    runtimeVersion: "8.0",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);
  const cloud = azureCloud(region, subscription, "Microsoft.Synapse/workspaces");

  const poolSql = azureCloud(region, subscription, "Microsoft.Synapse/workspaces/sqlPools");
  const sparkPool = azureCloud(region, subscription, "Microsoft.Synapse/workspaces/bigDataPools");

  const s1 = randSpanId();
  const s2 = randSpanId();
  const u1 = randInt(5_000, 400_000);
  const u2 = randInt(50_000, 5_000_000);
  const err1 = isErr && randInt(0, 1) === 0;
  const err2 = isErr && !err1;

  const spanSql = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, randInt(1, 5)),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: s1,
        type: "db",
        subtype: "mssql",
        name: "Synapse.SQLPool.query",
        duration: { us: u1 },
        action: "query",
        db: {
          type: "sql",
          statement: "SELECT TOP 1000 * FROM staging.events WHERE ingest_date = @d",
        },
        destination: { service: { resource: "synapse", type: "db", name: "synapse" } },
        labels: err1 ? { "azure.synapse.error": "timeout" } : {},
      },
      service: svc,
      cloud: poolSql,
      event: { outcome: err1 ? "failure" : "success" },
      ...dim({ dependency_type: "Synapse SQL pool" }),
    },
    traceId,
    "dotnet"
  );

  const spanSpark = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, Math.max(1, Math.round(u1 / 1000))),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: s2,
        type: "app",
        subtype: "spark",
        name: "Synapse.SparkNotebook.run",
        duration: { us: u2 },
        action: "execute",
        destination: { service: { resource: "synapse", type: "app", name: "synapse" } },
        labels: err2 ? { "azure.synapse.error": "executor_failed" } : {},
      },
      service: svc,
      cloud: sparkPool,
      event: { outcome: err1 ? "success" : err2 ? "failure" : "success" },
      ...dim({ dependency_type: "Synapse Spark pool" }),
    },
    traceId,
    "dotnet"
  );

  const totalUs = u1 + u2 + randInt(2_000, 25_000);
  const txErr = err1 || err2;
  const txDoc = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: "SynapsePipeline nightly_curate",
        type: "request",
        duration: { us: totalUs },
        result: txErr ? "failure" : "success",
        sampled: true,
        span_count: { started: 2, dropped: 0 },
      },
      service: svc,
      cloud,
      event: { outcome: txErr ? "failure" : "success" },
      ...dim({}),
    },
    traceId,
    "dotnet"
  );

  return [txDoc, spanSql, spanSpark];
}
