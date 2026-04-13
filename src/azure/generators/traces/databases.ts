import type { EcsDocument } from "../helpers.js";
import { rand, randInt, azureCloud, makeAzureSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";

const APM_AGENT = { name: "opentelemetry", version: "1.x" } as const;
const APM_DS = { type: "traces", dataset: "apm", namespace: "default" } as const;

/**
 * Cosmos DB — transaction + 2-3 child spans (read, write, optional downstream HTTP).
 */
export function generateCosmosDbTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const container = rand(["orders", "users", "products", "carts", "sessions"]);

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

  const txDoc: EcsDocument = {
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
    },
    service: {
      name: rand(["catalog-api", "cart-service", "user-api", "order-svc"]),
      language: { name: "python" },
      framework: { name: "fastapi" },
    },
    cloud: azureCloud(region, subscription, "Microsoft.DocumentDB/databaseAccounts"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    span: { id: txId, duration: { us: totalUs } },
  };

  const spanRead: EcsDocument = {
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
      destination: { service: { resource: "cosmosdb" } },
    },
    service: { name: "catalog-api" },
    cloud: azureCloud(region, subscription, "Microsoft.DocumentDB/databaseAccounts"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failOnSpan === 0 ? "failure" : "success" },
    azure: { trace: { container } },
  };
  ms += Math.max(1, Math.round(readUs / 1000));

  const spanWrite: EcsDocument = {
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
      destination: { service: { resource: "cosmosdb" } },
    },
    service: { name: "catalog-api" },
    cloud: azureCloud(region, subscription, "Microsoft.DocumentDB/databaseAccounts"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failOnSpan === 1 ? "failure" : "success" },
    azure: { trace: { container } },
  };
  ms += Math.max(1, Math.round(writeUs / 1000));

  const docs: EcsDocument[] = [txDoc, spanRead, spanWrite];

  if (includeDownstream) {
    const spanHttp: EcsDocument = {
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
      },
      service: { name: "catalog-api" },
      cloud: azureCloud(region, subscription, "Microsoft.DocumentDB/databaseAccounts"),
      agent: APM_AGENT,
      data_stream: APM_DS,
      event: { outcome: failOnSpan === 2 ? "failure" : "success" },
    };
    docs.push(spanHttp);
  }

  return docs;
}

/**
 * Azure SQL Database — transaction + 2-3 SQL spans (connection pool + parameterized queries).
 */
export function generateSqlDatabaseTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);

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

  const txDoc: EcsDocument = {
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
    },
    service: {
      name: serviceName,
      language: { name: "java" },
      framework: { name: "spring-boot" },
    },
    cloud: azureCloud(region, subscription, "Microsoft.Sql/servers/databases"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    span: { id: txId, duration: { us: totalUs } },
  };

  let ms = randInt(1, 6);

  const spanSelect: EcsDocument = {
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
    },
    service: { name: serviceName },
    cloud: azureCloud(region, subscription, "Microsoft.Sql/servers/databases"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: "success" },
  };
  ms += Math.max(1, Math.round(selectUs / 1000));

  const failInsert = failOnLast && !includeUpdate;
  const spanInsert: EcsDocument = {
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
    },
    service: { name: serviceName },
    cloud: azureCloud(region, subscription, "Microsoft.Sql/servers/databases"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failInsert ? "failure" : "success" },
  };
  ms += Math.max(1, Math.round(insertUs / 1000));

  const docs: EcsDocument[] = [txDoc, spanSelect, spanInsert];

  if (includeUpdate) {
    const failUpdate = failOnLast;
    const spanUpdate: EcsDocument = {
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
      },
      service: { name: serviceName },
      cloud: azureCloud(region, subscription, "Microsoft.Sql/servers/databases"),
      agent: APM_AGENT,
      data_stream: APM_DS,
      event: {
        outcome: failUpdate ? "failure" : "success",
      },
    };
    docs.push(spanUpdate);
  }

  return docs;
}
