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

export function generateDatabaseForPostgresqlTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const svc = azureServiceBase("orders-api", env, "go", {
    framework: "chi",
    runtimeName: "go",
    runtimeVersion: "1.23",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);
  const cloud = azureCloud(region, subscription, "Microsoft.DBforPostgreSQL/flexibleServers");
  const server = rand(["psql-orders-prod", "psql-analytics", "psql-shared"]);
  const failIdx = isErr ? randInt(0, 3) : -1;

  const ops = [
    { name: `PostgreSQL.Connection ${server}`, us: randInt(2_000, 85_000) },
    { name: `PostgreSQL.Parse ${server}`, us: randInt(400, 25_000) },
    { name: `PostgreSQL.Execute ${server}`, us: randInt(8_000, 900_000) },
    { name: `PostgreSQL.Result ${server}`, us: randInt(1_000, 55_000) },
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
            subtype: "postgresql",
            name: op.name,
            duration: { us: op.us },
            action: i === 0 ? "connect" : i === 3 ? "query" : "query",
            ...(i === 2
              ? {
                  db: {
                    type: "postgres",
                    statement: "SELECT o.* FROM orders o WHERE o.tenant_id = $1",
                  },
                }
              : { db: { type: "postgres" } }),
            destination: { service: { resource: "postgresql", type: "db", name: "postgresql" } },
            labels: spanErr ? { "azure.postgresql.error": "query_canceled" } : {},
          },
          service: svc,
          cloud,
          event: { outcome: spanErr ? "failure" : "success" },
          ...dim({ dependency_type: "Azure Database for PostgreSQL", server }),
        },
        traceId,
        "go"
      )
    );
    ms += Math.max(1, Math.round(op.us / 1000));
  }

  const totalUs = sum + randInt(1_000, 22_000);
  const txErr = failIdx >= 0;
  const txDoc = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: rand(["GET /api/orders", "POST /api/orders"]),
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
    "go"
  );

  return [txDoc, ...spans];
}
