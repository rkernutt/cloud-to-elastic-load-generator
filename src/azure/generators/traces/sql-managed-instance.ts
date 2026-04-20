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

export function generateSqlManagedInstanceTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const svc = azureServiceBase("finance-ledger-api", env, "dotnet", {
    framework: "ASP.NET Core",
    runtimeName: "dotnet",
    runtimeVersion: "8.0",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);
  const cloud = azureCloud(region, subscription, "Microsoft.Sql/managedInstances");
  const mi = rand(["sqlmi-finance-prod", "sqlmi-reporting", "sqlmi-legacy"]);
  const failIdx = isErr ? randInt(0, 3) : -1;

  const ops = [
    { name: `SqlMI.Connection ${mi}`, us: randInt(5_000, 120_000) },
    { name: `SqlMI.QueryOptimize ${mi}`, us: randInt(10_000, 450_000) },
    { name: `SqlMI.Execute ${mi}`, us: randInt(15_000, 1_800_000) },
    { name: `SqlMI.ResultSet ${mi}`, us: randInt(3_000, 180_000) },
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
            type: "db",
            subtype: "azuresql",
            name: op.name,
            duration: { us: op.us },
            action: i === 0 ? "connect" : "query",
            ...(i === 2
              ? {
                  db: {
                    type: "sql",
                    statement:
                      "SELECT TOP 5000 * FROM ledger.postings WITH (NOLOCK) WHERE batch_id = @p",
                  },
                }
              : { db: { type: "sql" } }),
            destination: {
              service: { resource: "sql-managed-instance", type: "db", name: "sql-mi" },
            },
            labels: spanErr ? { "azure.sqlmi.error": "timeout" } : {},
          },
          service: svc,
          cloud,
          event: { outcome: spanErr ? "failure" : "success" },
          ...dim({ dependency_type: "Azure SQL Managed Instance", managed_instance: mi }),
        },
        traceId,
        "dotnet"
      )
    );
    ms += Math.max(1, Math.round(op.us / 1000));
  }

  const totalUs = sum + randInt(2_000, 35_000);
  const txErr = failIdx >= 0;
  const txDoc = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: rand(["GET /ledger/batch/{id}", "POST /ledger/postings"]),
        type: "request",
        duration: { us: totalUs },
        result: txErr ? "HTTP 500" : "HTTP 2xx",
        sampled: true,
        span_count: { started: spans.length, dropped: 0 },
      },
      service: svc,
      cloud,
      event: { outcome: txErr ? "failure" : "success" },
      ...dim({}),
    },
    traceId,
    "dotnet"
  );

  return [txDoc, ...spans];
}
