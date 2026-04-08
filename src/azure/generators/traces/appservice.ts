import type { EcsDocument } from "../helpers.js";
import { rand, randInt, azureCloud, makeAzureSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";

const APM_AGENT = { name: "opentelemetry/dotnet", version: "1.x" } as const;
const APM_DS = { type: "traces", dataset: "apm", namespace: "default" } as const;

export function generateAppServiceTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  let ms = 0;
  const svc = rand(["checkout-api", "catalog-api", "inventory-api"]);

  const dbUs = randInt(2000, 80_000);
  const cacheUs = randInt(400, 25_000);
  const s1 = randSpanId();
  const s2 = randSpanId();
  const dbErr = isErr && randInt(0, 1) === 0;

  const spanDb: EcsDocument = {
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
    },
    service: {
      name: svc,
      environment: rand(["production", "staging"]),
      language: { name: "dotnet" },
      framework: { name: "ASP.NET Core" },
    },
    cloud: azureCloud(region, subscription, "Microsoft.Web/sites"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: dbErr ? "failure" : "success" },
    azure: { trace: { component: "app_service_sql" } },
  };
  ms += Math.max(1, Math.round(dbUs / 1000));

  const spanCache: EcsDocument = {
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
    service: { name: svc, language: { name: "dotnet" } },
    cloud: azureCloud(region, subscription, "Microsoft.Web/sites"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: dbErr || (isErr && randInt(0, 1) === 1) ? "failure" : "success" },
    azure: { trace: { component: "redis" } },
  };

  return [spanDb, spanCache];
}
