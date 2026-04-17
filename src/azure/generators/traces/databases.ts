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

export function generateCosmosDbTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const container = rand(["orders", "users", "products", "carts", "sessions"]);
  const env = rand(["production", "staging"]);
  const svcName = rand(["catalog-api", "cart-service", "user-api", "order-svc"]);
  const svc = azureServiceBase(svcName, env, "python", {
    framework: "fastapi",
    runtimeName: "python",
    runtimeVersion: "3.12",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);

  const readOp = rand(["CosmosDB.getDocument", "CosmosDB.queryDocuments"]);
  const writeOp = rand(["CosmosDB.createDocument", "CosmosDB.replaceDocument"]);
  const includeDownstream = Math.random() > 0.4;
  const failOnSpan = isErr ? randInt(0, includeDownstream ? 2 : 1) : -1;

  const readUs = randInt(3_000, 85_000);
  const writeUs = randInt(5_000, 120_000);
  const httpUs = includeDownstream ? randInt(8_000, 250_000) : 0;
  const overheadUs = randInt(1_000, 12_000);
  const totalUs = readUs + writeUs + httpUs + overheadUs;

  const sRead = randSpanId();
  const sWrite = randSpanId();
  const sHttp = randSpanId();

  let ms = randInt(1, 8);

  const txDoc: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: rand([
          `GET /api/carts/{id}`,
          `GET /api/orders/{id}`,
          `POST /api/users`,
          `PUT /api/products/{id}`,
        ]),
        type: "request",
        duration: { us: totalUs },
        result: isErr ? "HTTP 429" : "HTTP 2xx",
        sampled: true,
        span_count: { started: includeDownstream ? 3 : 2, dropped: 0 },
      },
      service: svc,
      cloud: azureCloud(region, subscription, "Microsoft.DocumentDB/databaseAccounts"),
      event: { outcome: isErr ? "failure" : "success" },
      ...dim({ workload: "cosmos_api" }),
    },
    traceId,
    "python"
  );

  const spanRead: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, ms),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sRead,
        type: "db",
        subtype: "cosmosdb",
        name: readOp,
        duration: { us: readUs },
        db: { type: "cosmos" },
        destination: { service: { resource: "cosmosdb", type: "db", name: "cosmosdb" } },
        labels: failOnSpan === 0 ? { "azure.cosmos.status_code": "429" } : {},
      },
      service: svc,
      cloud: azureCloud(region, subscription, "Microsoft.DocumentDB/databaseAccounts"),
      event: { outcome: failOnSpan === 0 ? "failure" : "success" },
      azure: { trace: { container } },
      ...dim({ dependency_type: "Cosmos DB" }),
    },
    traceId,
    "python"
  );
  ms += Math.max(1, Math.round(readUs / 1000));

  const spanWrite: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, ms),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sWrite,
        type: "db",
        subtype: "cosmosdb",
        name: writeOp,
        duration: { us: failOnSpan === 1 ? writeUs * 3 : writeUs },
        db: { type: "cosmos" },
        destination: { service: { resource: "cosmosdb", type: "db", name: "cosmosdb" } },
        labels: failOnSpan === 1 ? { "azure.cosmos.status_code": "429" } : {},
      },
      service: svc,
      cloud: azureCloud(region, subscription, "Microsoft.DocumentDB/databaseAccounts"),
      event: { outcome: failOnSpan === 1 ? "failure" : "success" },
      azure: { trace: { container } },
      ...dim({ dependency_type: "Cosmos DB" }),
    },
    traceId,
    "python"
  );
  ms += Math.max(1, Math.round(writeUs / 1000));

  const docs: EcsDocument[] = [txDoc, spanRead, spanWrite];

  if (includeDownstream) {
    const spanHttp: EcsDocument = enrichAzureTraceDoc(
      {
        "@timestamp": offsetTs(base, ms),
        processor: { name: "transaction", event: "span" },
        trace: { id: traceId },
        transaction: { id: txId },
        parent: { id: txId },
        span: {
          id: sHttp,
          type: "external",
          subtype: "http",
          name: rand([
            "HTTP GET /api/inventory",
            "HTTP POST /api/notifications",
            "HTTP GET /api/pricing",
          ]),
          duration: { us: failOnSpan === 2 ? httpUs * 4 : httpUs },
          destination: { service: { resource: "external", type: "external", name: "http" } },
        },
        service: svc,
        cloud: azureCloud(region, subscription, "Microsoft.DocumentDB/databaseAccounts"),
        event: { outcome: failOnSpan === 2 ? "failure" : "success" },
        ...dim({ dependency_type: "HTTP" }),
      },
      traceId,
      "python"
    );
    docs.push(spanHttp);
  }

  return docs;
}

export function generateSqlDatabaseTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);

  const dbSubtype = rand(["mssql", "postgresql"] as const);
  const includeUpdate = Math.random() > 0.35;
  const failOnLast = isErr;

  const selectUs = randInt(4_000, 95_000);
  const insertUs = randInt(6_000, 140_000);
  const updateUs = includeUpdate ? randInt(5_000, 110_000) : 0;
  const overheadUs = randInt(1_000, 8_000);
  const totalUs = selectUs + insertUs + updateUs + overheadUs;

  const sSelect = randSpanId();
  const sInsert = randSpanId();
  const sUpdate = randSpanId();

  const serviceName = rand(["order-svc", "inventory-api", "billing-svc", "fulfillment-svc"]);
  const svc = azureServiceBase(serviceName, env, "java", {
    framework: "spring-boot",
    runtimeName: "java",
    runtimeVersion: "21",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);

  const txDoc: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: rand([
          "POST /orders",
          "PUT /orders/{id}/status",
          "POST /inventory/reserve",
          "POST /billing/charge",
        ]),
        type: "request",
        duration: { us: totalUs },
        result: isErr ? "HTTP 5xx" : "HTTP 2xx",
        sampled: true,
        span_count: { started: includeUpdate ? 3 : 2, dropped: 0 },
      },
      service: svc,
      cloud: azureCloud(region, subscription, "Microsoft.Sql/servers/databases"),
      event: { outcome: isErr ? "failure" : "success" },
      ...dim({ engine: dbSubtype }),
    },
    traceId,
    "java"
  );

  let ms = randInt(1, 6);

  const spanSelect: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, ms),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sSelect,
        type: "db",
        subtype: dbSubtype,
        name: "SELECT * FROM orders WHERE id = ?",
        duration: { us: selectUs },
        db: {
          type: "sql",
          statement: "SELECT * FROM orders WHERE id = @orderId AND status != 'cancelled'",
        },
        destination: { service: { resource: "sql", type: "db", name: "azure-sql" } },
      },
      service: svc,
      cloud: azureCloud(region, subscription, "Microsoft.Sql/servers/databases"),
      event: { outcome: "success" },
      ...dim({ dependency_type: "SQL" }),
    },
    traceId,
    "java"
  );
  ms += Math.max(1, Math.round(selectUs / 1000));

  const failInsert = failOnLast && !includeUpdate;
  const spanInsert: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, ms),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sInsert,
        type: "db",
        subtype: dbSubtype,
        name: "INSERT INTO order_items",
        duration: { us: failInsert ? insertUs * 5 : insertUs },
        db: {
          type: "sql",
          statement:
            "INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (@orderId, @productId, @qty, @price)",
        },
        destination: { service: { resource: "sql", type: "db", name: "azure-sql" } },
        labels: failInsert ? { "azure.sql.error_number": "2627" } : {},
      },
      service: svc,
      cloud: azureCloud(region, subscription, "Microsoft.Sql/servers/databases"),
      event: { outcome: failInsert ? "failure" : "success" },
      ...dim({ dependency_type: "SQL" }),
    },
    traceId,
    "java"
  );
  ms += Math.max(1, Math.round(insertUs / 1000));

  const docs: EcsDocument[] = [txDoc, spanSelect, spanInsert];

  if (includeUpdate) {
    const failUpdate = failOnLast;
    const spanUpdate: EcsDocument = enrichAzureTraceDoc(
      {
        "@timestamp": offsetTs(base, ms),
        processor: { name: "transaction", event: "span" },
        trace: { id: traceId },
        transaction: { id: txId },
        parent: { id: txId },
        span: {
          id: sUpdate,
          type: "db",
          subtype: dbSubtype,
          name: "UPDATE inventory",
          duration: { us: failUpdate ? updateUs * 6 : updateUs },
          db: {
            type: "sql",
            statement:
              "UPDATE inventory SET reserved_qty = reserved_qty + @qty, updated_at = GETUTCDATE() WHERE product_id = @productId",
          },
          destination: { service: { resource: "sql", type: "db", name: "azure-sql" } },
          labels: failUpdate ? { "azure.sql.error_number": "1205" } : {},
        },
        service: svc,
        cloud: azureCloud(region, subscription, "Microsoft.Sql/servers/databases"),
        event: {
          outcome: failUpdate ? "failure" : "success",
        },
        ...dim({ dependency_type: "SQL" }),
      },
      traceId,
      "java"
    );
    docs.push(spanUpdate);
  }

  return docs;
}
