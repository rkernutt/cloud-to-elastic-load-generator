/**
 * Multi-service Azure traces analogous to AWS SNS fan-out and storage-trigger pipelines.
 */

import type { EcsDocument } from "../helpers.js";
import { rand, randInt, azureCloud, makeAzureSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";

const APM_AGENT = { name: "opentelemetry", version: "1.x" } as const;
const APM_DS = { type: "traces", dataset: "apm", namespace: "default" } as const;

/**
 * API Management → Service Bus topic publish → parallel Function subscribers.
 */
export function generateServiceBusTopicFanoutTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const sendSpanId = randSpanId();
  const base = new Date(ts);
  const topic = rand(["orders", "billing", "inventory-events"]);
  const pubUs = randInt(3000, 85_000);
  const failWhich = isErr ? randInt(0, 4) : -1;

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

  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: rand(["POST /v1/events/emit", "POST /hooks/order-placed"]),
    },
    service: { name: "apim-order-api", language: { name: "csharp" }, framework: { name: "dotnet" } },
    cloud: azureCloud(region, subscription, "Microsoft.ApiManagement/service"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failWhich === 3 ? "failure" : "success" },
    span: { id: txId, duration: { us: totalUs } },
  };

  let ms = randInt(2, 12);
  const spanSend: EcsDocument = {
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
    },
    service: { name: "apim-order-api" },
    cloud: azureCloud(region, subscription, "Microsoft.ServiceBus/namespaces"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failWhich === 3 ? "failure" : "success" },
    azure: { trace: { entity_path: `${topic}/subscriptions/push` } },
  };
  ms += Math.max(1, Math.round(pubUs / 1000));

  const subDocs: EcsDocument[] = subs.map((s, i) => ({
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
    },
    service: { name: s.serviceName },
    cloud: azureCloud(region, subscription, s.rsrc),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failWhich === i ? "failure" : "success" },
  }));

  return [txDoc, spanSend, ...subDocs];
}

/**
 * Blob storage trigger → Event Grid validation/delivery → Function processes → SQL write.
 */
export function generateEventGridBlobPipelineTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const container = rand(["ingest", "staging", "raw-drop"]);
  const blob = `exports/${randInt(2024, 2026)}-${randInt(1, 12)}/chunk_${randInt(1, 999)}.csv`;
  let ms = 0;

  const egUs = randInt(2000, 45_000);
  const dlUs = randInt(8000, 400_000);
  const sqlUs = randInt(12_000, 900_000);
  const failIdx = isErr ? randInt(0, 2) : -1;

  const sEg = randSpanId();
  const sBlob = randSpanId();
  const sSql = randSpanId();

  const spanEg: EcsDocument = {
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
    },
    service: { name: "etl-loader-fn" },
    cloud: azureCloud(region, subscription, "Microsoft.EventGrid/topics"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failIdx === 0 ? "failure" : "success" },
  };
  ms += Math.max(1, Math.round(egUs / 1000));

  const spanBlob: EcsDocument = {
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
    },
    service: { name: "etl-loader-fn" },
    cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failIdx === 1 ? "failure" : "success" },
  };
  ms += Math.max(1, Math.round(dlUs / 1000));

  const spanSql: EcsDocument = {
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
    },
    service: { name: "etl-loader-fn" },
    cloud: azureCloud(region, subscription, "Microsoft.Sql/servers"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failIdx === 2 ? "failure" : "success" },
  };

  const totalUs = egUs + dlUs + sqlUs + randInt(30, 120) * 1000;

  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: { id: txId, name: "Functions.etl_blob_loader" },
    service: { name: "etl-loader-fn", language: { name: "csharp" }, framework: { name: "dotnet-isolated" } },
    cloud: azureCloud(region, subscription, "Microsoft.Web/sites"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: isErr && failIdx >= 0 ? "failure" : "success" },
    span: { id: txId, duration: { us: totalUs } },
  };

  return [txDoc, spanEg, spanBlob, spanSql];
}

/**
 * HTTP starter → Durable Functions orchestration instance → three activity branches
 * (Cosmos, Storage Queue, Service Bus) — Step Functions / Logic Apps–style DAG.
 */
export function generateDurableFunctionsOrchestrationTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const starterTx = randSpanId();
  const orchTx = randSpanId();
  const base = new Date(ts);
  const instId = `order-${randInt(100000, 999999)}`;
  const failBranch = isErr ? randInt(0, 3) : -1;

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

  const txStarter: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: starterTx,
      name: "POST /orchestration/order/start",
    },
    service: {
      name: "order-api-functions",
      language: { name: "csharp" },
      framework: { name: "dotnet-isolated" },
    },
    cloud: azureCloud(region, subscription, "Microsoft.Web/sites"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    span: { id: starterTx, duration: { us: totalUs } },
  };

  let ms = randInt(3, 12);
  const txOrch: EcsDocument = {
    "@timestamp": offsetTs(base, ms),
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    parent: { id: starterTx },
    transaction: {
      id: orchTx,
      name: `OrderProcessingOrchestration_${instId}`,
      type: "workflow",
    },
    service: {
      name: "durable-func-host",
      language: { name: "csharp" },
      framework: { name: "Azure Functions Durable" },
    },
    cloud: azureCloud(region, subscription, "Microsoft.Web/sites"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    labels: {
      "azure.durable.instance_id": instId,
      "azure.durable.orchestration_name": "OrderProcessingOrchestration",
    },
    event: { outcome: isErr ? "failure" : "success" },
    span: { id: orchTx, duration: { us: usOrch } },
  };

  ms += randInt(8, 22);
  const spanAct1: EcsDocument = {
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
    },
    service: { name: "durable-func-host" },
    cloud: azureCloud(region, subscription, "Microsoft.Web/sites"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: "success" },
  };
  ms += randInt(2, 8);
  const txFn1: EcsDocument = {
    "@timestamp": offsetTs(base, ms),
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    parent: { id: act1 },
    transaction: { id: fn1, name: "ValidateInventory" },
    service: { name: "activities-inventory" },
    cloud: azureCloud(region, subscription, "Microsoft.Web/sites"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failBranch === 0 ? "failure" : "success" },
    span: { id: fn1, duration: { us: usFn1 } },
  };
  ms += randInt(2, 6);
  const spanCosmos: EcsDocument = {
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
    },
    service: { name: "activities-inventory" },
    cloud: azureCloud(region, subscription, "Microsoft.DocumentDB/databaseAccounts"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failBranch === 0 ? "failure" : "success" },
  };

  ms += Math.max(20, Math.round(usA1 / 1000 / 4));
  const spanAct2: EcsDocument = {
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
    },
    service: { name: "durable-func-host" },
    cloud: azureCloud(region, subscription, "Microsoft.Web/sites"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: "success" },
  };
  ms += randInt(2, 8);
  const txFn2: EcsDocument = {
    "@timestamp": offsetTs(base, ms),
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    parent: { id: act2 },
    transaction: { id: fn2, name: "ChargePayment" },
    service: { name: "activities-billing" },
    cloud: azureCloud(region, subscription, "Microsoft.Web/sites"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failBranch === 1 ? "failure" : "success" },
    span: { id: fn2, duration: { us: usFn2 } },
  };
  ms += randInt(2, 6);
  const spanQueue: EcsDocument = {
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
    },
    service: { name: "activities-billing" },
    cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failBranch === 1 ? "failure" : "success" },
  };

  ms += Math.max(20, Math.round(usA2 / 1000 / 4));
  const spanAct3: EcsDocument = {
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
    },
    service: { name: "durable-func-host" },
    cloud: azureCloud(region, subscription, "Microsoft.Web/sites"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: "success" },
  };
  ms += randInt(2, 8);
  const txFn3: EcsDocument = {
    "@timestamp": offsetTs(base, ms),
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    parent: { id: act3 },
    transaction: { id: fn3, name: "SendReceiptNotification" },
    service: { name: "activities-notify" },
    cloud: azureCloud(region, subscription, "Microsoft.Web/sites"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failBranch === 2 ? "failure" : "success" },
    span: { id: fn3, duration: { us: usFn3 } },
  };
  ms += randInt(2, 6);
  const spanSb: EcsDocument = {
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
    },
    service: { name: "activities-notify" },
    cloud: azureCloud(region, subscription, "Microsoft.ServiceBus/namespaces"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failBranch === 2 ? "failure" : "success" },
  };

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
