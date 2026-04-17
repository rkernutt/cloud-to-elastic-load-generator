/**
 * Multi-service Azure traces analogous to AWS SNS fan-out and storage-trigger pipelines.
 */

import type { EcsDocument } from "../helpers.js";
import { rand, randInt, azureCloud, makeAzureSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { enrichAzureTraceDoc } from "./trace-kit.js";

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

/**
 * API Management → Service Bus topic publish → parallel Function subscribers.
 */
export function generateServiceBusTopicFanoutTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const sendSpanId = randSpanId();
  const base = new Date(ts);
  const topic = rand(["orders", "billing", "inventory-events"]);
  const pubUs = randInt(3000, 85_000);
  const failWhich = isErr ? randInt(0, 4) : -1;
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);

  const subs = [
    {
      id: randSpanId(),
      name: "ServiceBus.process billing-sync",
      duration: randInt(10_000, 450_000),
      serviceName: "billing-fn",
      rsrc: "Microsoft.Web/sites",
    },
    {
      id: randSpanId(),
      name: "ServiceBus.process fulfillment-worker",
      duration: randInt(8000, 520_000),
      serviceName: "fulfillment-fn",
      rsrc: "Microsoft.Web/sites",
    },
    {
      id: randSpanId(),
      name: "CosmosDB.upsert order_projection",
      duration: randInt(5000, 280_000),
      serviceName: "projection-fn",
      rsrc: "Microsoft.DocumentDB/databaseAccounts",
    },
  ] as const;

  const maxSub = Math.max(...subs.map((s) => s.duration));
  const totalUs = pubUs + maxSub + randInt(60, 200) * 1000;

  const txDoc: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: rand(["POST /v1/events/emit", "POST /hooks/order-placed"]),
        type: "request",
        duration: { us: totalUs },
        result: failWhich === 3 ? "HTTP 5xx" : "HTTP 2xx",
        sampled: true,
        span_count: { started: 1 + subs.length, dropped: 0 },
      },
      service: {
        name: "apim-order-api",
        language: { name: "csharp" },
        framework: { name: "dotnet" },
      },
      cloud: azureCloud(region, subscription, "Microsoft.ApiManagement/service"),
      event: { outcome: failWhich === 3 ? "failure" : "success" },
      ...dim({ workflow: "servicebus_fanout" }),
    },
    traceId,
    "dotnet"
  );

  let ms = randInt(2, 12);
  const spanSend: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, ms),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sendSpanId,
        type: "messaging",
        subtype: "azure-service-bus",
        name: `ServiceBus.send ${topic}`,
        duration: { us: pubUs },
        action: "send",
        destination: {
          service: { resource: "servicebus", type: "messaging", name: "azure-service-bus" },
        },
      },
      service: { name: "apim-order-api" },
      cloud: azureCloud(region, subscription, "Microsoft.ServiceBus/namespaces"),
      event: { outcome: failWhich === 3 ? "failure" : "success" },
      azure: { trace: { entity_path: `${topic}/subscriptions/push` } },
      ...dim({ dependency_type: "Service Bus" }),
    },
    traceId,
    "dotnet"
  );
  ms += Math.max(1, Math.round(pubUs / 1000));

  const subDocs: EcsDocument[] = subs.map((s, i) => {
    const dest =
      i === 2
        ? { service: { resource: "cosmosdb", type: "db", name: "cosmosdb" } }
        : { service: { resource: "servicebus", type: "messaging", name: "azure-service-bus" } };
    return enrichAzureTraceDoc(
      {
        "@timestamp": offsetTs(base, ms + i * 4),
        processor: { name: "transaction", event: "span" },
        trace: { id: traceId },
        transaction: { id: txId },
        parent: { id: sendSpanId },
        span: {
          id: s.id,
          type: i === 2 ? "db" : "messaging",
          subtype: i === 2 ? "cosmosdb" : "azure-service-bus",
          name: s.name,
          duration: { us: s.duration },
          action: i === 2 ? "query" : "receive",
          destination: dest,
          labels: i === 2 && failWhich === i ? { "azure.cosmos.status_code": "429" } : {},
        },
        service: { name: s.serviceName },
        cloud: azureCloud(region, subscription, s.rsrc),
        event: { outcome: failWhich === i ? "failure" : "success" },
        ...dim({ subscriber_index: String(i) }),
      },
      traceId,
      "dotnet"
    );
  });

  return [txDoc, spanSend, ...subDocs];
}

/**
 * Blob storage trigger → Event Grid validation/delivery → Function processes → SQL write.
 */
export function generateEventGridBlobPipelineTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const container = rand(["ingest", "staging", "raw-drop"]);
  const blob = `exports/${randInt(2024, 2026)}-${randInt(1, 12)}/chunk_${randInt(1, 999)}.csv`;
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);
  let ms = 0;

  const egUs = randInt(2000, 45_000);
  const dlUs = randInt(8000, 400_000);
  const sqlUs = randInt(12_000, 900_000);
  const failIdx = isErr ? randInt(0, 2) : -1;

  const sEg = randSpanId();
  const sBlob = randSpanId();
  const sSql = randSpanId();

  const spanEg: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, ms),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sEg,
        type: "messaging",
        subtype: "azure-event-grid",
        name: "EventGrid.deliver Microsoft.Storage.BlobCreated",
        duration: { us: egUs },
        action: "receive",
        destination: { service: { resource: "event-grid", type: "messaging", name: "event-grid" } },
      },
      service: { name: "etl-loader-fn" },
      cloud: azureCloud(region, subscription, "Microsoft.EventGrid/topics"),
      event: { outcome: failIdx === 0 ? "failure" : "success" },
      ...dim({ dependency_type: "Event Grid" }),
    },
    traceId,
    "dotnet"
  );
  ms += Math.max(1, Math.round(egUs / 1000));

  const spanBlob: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, ms),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: sEg },
      span: {
        id: sBlob,
        type: "storage",
        subtype: "azure-blob",
        name: `Blob.download ${container}/${blob}`,
        duration: { us: dlUs },
        action: "read",
        destination: { service: { resource: "blob", type: "storage", name: "azure-blob" } },
        labels: failIdx === 1 ? { "azure.storage.http_status": "404" } : {},
      },
      service: { name: "etl-loader-fn" },
      cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts"),
      event: { outcome: failIdx === 1 ? "failure" : "success" },
      ...dim({ dependency_type: "Blob" }),
    },
    traceId,
    "dotnet"
  );
  ms += Math.max(1, Math.round(dlUs / 1000));

  const spanSql: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, ms),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: sBlob },
      span: {
        id: sSql,
        type: "db",
        subtype: "azuresql",
        name: "SqlBulkCopy warehouse.staging_import",
        duration: { us: sqlUs },
        action: "bulk_insert",
        db: { type: "sql", statement: "BULK INSERT warehouse.staging_import FROM staging" },
        destination: { service: { resource: "sql", type: "db", name: "azure-sql" } },
        labels: failIdx === 2 ? { "azure.sql.error_number": "1205" } : {},
      },
      service: { name: "etl-loader-fn" },
      cloud: azureCloud(region, subscription, "Microsoft.Sql/servers"),
      event: { outcome: failIdx === 2 ? "failure" : "success" },
      ...dim({ dependency_type: "SQL" }),
    },
    traceId,
    "dotnet"
  );

  const totalUs = egUs + dlUs + sqlUs + randInt(30, 120) * 1000;

  const txDoc: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: "Functions.etl_blob_loader",
        type: "request",
        duration: { us: totalUs },
        result: isErr && failIdx >= 0 ? "HTTP 5xx" : "HTTP 2xx",
        sampled: true,
        span_count: { started: 3, dropped: 0 },
      },
      service: {
        name: "etl-loader-fn",
        language: { name: "csharp" },
        framework: { name: "dotnet-isolated" },
      },
      cloud: azureCloud(region, subscription, "Microsoft.Web/sites"),
      event: { outcome: isErr && failIdx >= 0 ? "failure" : "success" },
      ...dim({ workflow: "eventgrid_blob" }),
    },
    traceId,
    "dotnet"
  );

  return [txDoc, spanEg, spanBlob, spanSql];
}

/**
 * HTTP starter → Durable Functions orchestration instance → three activity branches
 * (Cosmos, Storage Queue, Service Bus) — Step Functions / Logic Apps–style DAG.
 */
export function generateDurableFunctionsOrchestrationTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const starterTx = randSpanId();
  const orchTx = randSpanId();
  const base = new Date(ts);
  const instId = `order-${randInt(100000, 999999)}`;
  const failBranch = isErr ? randInt(0, 3) : -1;
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);

  const act1 = randSpanId();
  const fn1 = randSpanId();
  const c1 = randSpanId();
  const act2 = randSpanId();
  const fn2 = randSpanId();
  const q1 = randSpanId();
  const act3 = randSpanId();
  const fn3 = randSpanId();
  const sb1 = randSpanId();

  const usStart = randInt(200_000, 2_500_000);
  const usOrch = randInt(4_000_000, 55_000_000);
  const usA1 = randInt(400_000, 4_000_000);
  const usFn1 = randInt(300_000, 3_500_000);
  const usC1 = randInt(8000, 600_000);
  const usA2 = randInt(350_000, 3_800_000);
  const usFn2 = randInt(280_000, 3_200_000);
  const usQ1 = randInt(5000, 400_000);
  const usA3 = randInt(250_000, 3_000_000);
  const usFn3 = randInt(200_000, 2_800_000);
  const usSb = randInt(4000, 250_000);

  const totalUs = usStart + usOrch + randInt(50, 200) * 1000;

  const txStarter: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: starterTx,
        name: "POST /orchestration/order/start",
        type: "request",
        duration: { us: totalUs },
        result: isErr ? "HTTP 5xx" : "HTTP 2xx",
        sampled: true,
        span_count: { started: 1, dropped: 0 },
      },
      service: {
        name: "order-api-functions",
        language: { name: "csharp" },
        framework: { name: "dotnet-isolated" },
      },
      cloud: azureCloud(region, subscription, "Microsoft.Web/sites"),
      event: { outcome: isErr ? "failure" : "success" },
      ...dim({ workflow: "durable_orchestration" }),
    },
    traceId,
    "dotnet"
  );

  let ms = randInt(3, 12);
  const txOrch: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, ms),
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      parent: { id: starterTx },
      transaction: {
        id: orchTx,
        name: `OrderProcessingOrchestration_${instId}`,
        type: "workflow",
        duration: { us: usOrch },
        result: isErr ? "failure" : "success",
        sampled: true,
        span_count: { started: 3, dropped: 0 },
      },
      service: {
        name: "durable-func-host",
        language: { name: "csharp" },
        framework: { name: "Azure Functions Durable" },
      },
      cloud: azureCloud(region, subscription, "Microsoft.Web/sites"),
      labels: {
        "azure.durable.instance_id": instId,
        "azure.durable.orchestration_name": "OrderProcessingOrchestration",
      },
      event: { outcome: isErr ? "failure" : "success" },
      ...dim({ durable_instance: instId }),
    },
    traceId,
    "dotnet"
  );

  ms += randInt(8, 22);
  const spanAct1: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, ms),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: orchTx },
      parent: { id: orchTx },
      span: {
        id: act1,
        type: "workflow",
        subtype: "durable_functions",
        name: "call_activity.ValidateInventory",
        duration: { us: usA1 },
        action: "call",
      },
      service: { name: "durable-func-host" },
      cloud: azureCloud(region, subscription, "Microsoft.Web/sites"),
      event: { outcome: "success" },
      ...dim({ activity: "ValidateInventory" }),
    },
    traceId,
    "dotnet"
  );
  ms += randInt(2, 8);
  const txFn1: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, ms),
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      parent: { id: act1 },
      transaction: {
        id: fn1,
        name: "ValidateInventory",
        type: "request",
        duration: { us: usFn1 },
        result: failBranch === 0 ? "failure" : "success",
        sampled: true,
        span_count: { started: 1, dropped: 0 },
      },
      service: { name: "activities-inventory" },
      cloud: azureCloud(region, subscription, "Microsoft.Web/sites"),
      event: { outcome: failBranch === 0 ? "failure" : "success" },
      ...dim({ activity_function: "ValidateInventory" }),
    },
    traceId,
    "dotnet"
  );
  ms += randInt(2, 6);
  const spanCosmos: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, ms),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: fn1 },
      parent: { id: fn1 },
      span: {
        id: c1,
        type: "db",
        subtype: "cosmosdb",
        name: "CosmosDB.ReadItem inventory",
        duration: { us: usC1 },
        action: "query",
        destination: { service: { resource: "cosmosdb", type: "db", name: "cosmosdb" } },
        labels: failBranch === 0 ? { "azure.cosmos.status_code": "429" } : {},
      },
      service: { name: "activities-inventory" },
      cloud: azureCloud(region, subscription, "Microsoft.DocumentDB/databaseAccounts"),
      event: { outcome: failBranch === 0 ? "failure" : "success" },
      ...dim({ dependency_type: "Cosmos DB" }),
    },
    traceId,
    "dotnet"
  );

  ms += Math.max(20, Math.round(usA1 / 1000 / 4));
  const spanAct2: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, ms),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: orchTx },
      parent: { id: orchTx },
      span: {
        id: act2,
        type: "workflow",
        subtype: "durable_functions",
        name: "call_activity.ChargePayment",
        duration: { us: usA2 },
        action: "call",
      },
      service: { name: "durable-func-host" },
      cloud: azureCloud(region, subscription, "Microsoft.Web/sites"),
      event: { outcome: "success" },
      ...dim({ activity: "ChargePayment" }),
    },
    traceId,
    "dotnet"
  );
  ms += randInt(2, 8);
  const txFn2: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, ms),
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      parent: { id: act2 },
      transaction: {
        id: fn2,
        name: "ChargePayment",
        type: "request",
        duration: { us: usFn2 },
        result: failBranch === 1 ? "failure" : "success",
        sampled: true,
        span_count: { started: 1, dropped: 0 },
      },
      service: { name: "activities-billing" },
      cloud: azureCloud(region, subscription, "Microsoft.Web/sites"),
      event: { outcome: failBranch === 1 ? "failure" : "success" },
      ...dim({ activity_function: "ChargePayment" }),
    },
    traceId,
    "dotnet"
  );
  ms += randInt(2, 6);
  const spanQueue: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, ms),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: fn2 },
      parent: { id: fn2 },
      span: {
        id: q1,
        type: "messaging",
        subtype: "azure-queue",
        name: "Queue.PutMessage settlement-tasks",
        duration: { us: usQ1 },
        action: "send",
        destination: { service: { resource: "queue", type: "messaging", name: "azure-queue" } },
        labels: failBranch === 1 ? { "azure.queue.poison": "true" } : {},
      },
      service: { name: "activities-billing" },
      cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts"),
      event: { outcome: failBranch === 1 ? "failure" : "success" },
      ...dim({ dependency_type: "Storage Queue" }),
    },
    traceId,
    "dotnet"
  );

  ms += Math.max(20, Math.round(usA2 / 1000 / 4));
  const spanAct3: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, ms),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: orchTx },
      parent: { id: orchTx },
      span: {
        id: act3,
        type: "workflow",
        subtype: "durable_functions",
        name: "call_activity.SendReceiptNotification",
        duration: { us: usA3 },
        action: "call",
      },
      service: { name: "durable-func-host" },
      cloud: azureCloud(region, subscription, "Microsoft.Web/sites"),
      event: { outcome: "success" },
      ...dim({ activity: "SendReceiptNotification" }),
    },
    traceId,
    "dotnet"
  );
  ms += randInt(2, 8);
  const txFn3: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, ms),
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      parent: { id: act3 },
      transaction: {
        id: fn3,
        name: "SendReceiptNotification",
        type: "request",
        duration: { us: usFn3 },
        result: failBranch === 2 ? "failure" : "success",
        sampled: true,
        span_count: { started: 1, dropped: 0 },
      },
      service: { name: "activities-notify" },
      cloud: azureCloud(region, subscription, "Microsoft.Web/sites"),
      event: { outcome: failBranch === 2 ? "failure" : "success" },
      ...dim({ activity_function: "SendReceiptNotification" }),
    },
    traceId,
    "dotnet"
  );
  ms += randInt(2, 6);
  const spanSb: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, ms),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: fn3 },
      parent: { id: fn3 },
      span: {
        id: sb1,
        type: "messaging",
        subtype: "azure-service-bus",
        name: "ServiceBus.Send receipt-events",
        duration: { us: usSb },
        action: "send",
        destination: {
          service: { resource: "servicebus", type: "messaging", name: "azure-service-bus" },
        },
        labels: failBranch === 2 ? { "azure.service_bus.dead_letter": "true" } : {},
      },
      service: { name: "activities-notify" },
      cloud: azureCloud(region, subscription, "Microsoft.ServiceBus/namespaces"),
      event: { outcome: failBranch === 2 ? "failure" : "success" },
      ...dim({ dependency_type: "Service Bus" }),
    },
    traceId,
    "dotnet"
  );

  return [
    txStarter,
    txOrch,
    spanAct1,
    txFn1,
    spanCosmos,
    spanAct2,
    txFn2,
    spanQueue,
    spanAct3,
    txFn3,
    spanSb,
  ];
}
