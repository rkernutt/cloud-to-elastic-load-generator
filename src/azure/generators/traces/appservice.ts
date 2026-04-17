import type { EcsDocument } from "../helpers.js";
import { rand, randInt, azureCloud, makeAzureSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { azureServiceBase, enrichAzureTraceDoc } from "./trace-kit.js";

function cd(
  region: string,
  resourceGroup: string,
  subscriptionId: string,
  extra: Record<string, string> = {}
) {
  return {
    customDimensions: {
      azure_region: region,
      azure_resource_group: resourceGroup,
      azure_subscription_id: subscriptionId,
      ...extra,
    },
  };
}

export function generateAppServiceTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  let ms = 0;
  const svcName = rand(["checkout-api", "catalog-api", "inventory-api"]);
  const env = rand(["production", "staging"]);
  const svc = azureServiceBase(svcName, env, "dotnet", {
    framework: "ASP.NET Core",
    runtimeName: "dotnet",
    runtimeVersion: "8.0",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);

  const dbUs = randInt(2000, 80_000);
  const cacheUs = randInt(400, 25_000);
  const s1 = randSpanId();
  const s2 = randSpanId();
  const failSql = isErr && randInt(0, 1) === 0;
  const failRedis = isErr && !failSql;

  const spanDb: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, ms),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: s1,
        type: "db",
        subtype: "mssql",
        name: "SQL SELECT orders",
        duration: { us: dbUs },
        action: "query",
        db: { type: "sql", statement: "SELECT TOP 50 * FROM Orders WHERE Status=@s" },
        destination: { service: { resource: "sql", type: "db", name: "azure-sql" } },
        labels: failSql ? { "azure.sql.error_number": "1205" } : {},
      },
      service: svc,
      cloud: azureCloud(region, subscription, "Microsoft.Web/sites"),
      event: { outcome: failSql ? "failure" : "success" },
      azure: { trace: { component: "app_service_sql" } },
      ...dim({ dependency_type: "SQL" }),
    },
    traceId,
    "dotnet"
  );
  ms += Math.max(1, Math.round(dbUs / 1000));

  const spanCache: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, ms),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: s2,
        type: "db",
        subtype: "redis",
        name: "Redis session GET",
        duration: { us: cacheUs },
        action: "query",
        db: { type: "redis", statement: "GET session:abc" },
        destination: { service: { resource: "redis", type: "db", name: "azure-redis" } },
      },
      service: svc,
      cloud: azureCloud(region, subscription, "Microsoft.Web/sites"),
      event: { outcome: failSql || failRedis ? "failure" : "success" },
      azure: { trace: { component: "redis" } },
      ...dim({ dependency_type: "redis" }),
    },
    traceId,
    "dotnet"
  );

  const totalUs = dbUs + cacheUs + randInt(800, 6000) * 1000;
  const txErr = failSql || failRedis;

  const txDoc: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: rand(["GET /api/orders", "POST /api/checkout", "GET /api/catalog"]),
        type: "request",
        duration: { us: totalUs },
        result: txErr ? "HTTP 5xx" : "HTTP 2xx",
        sampled: true,
        span_count: { started: 2, dropped: 0 },
      },
      service: svc,
      cloud: azureCloud(region, subscription, "Microsoft.Web/sites"),
      event: { outcome: txErr ? "failure" : "success" },
      ...dim({ hosting_model: "app_service" }),
    },
    traceId,
    "dotnet"
  );

  return [txDoc, spanDb, spanCache];
}
