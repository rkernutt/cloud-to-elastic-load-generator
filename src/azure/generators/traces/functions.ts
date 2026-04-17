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

export function generateFunctionsTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  let ms = 0;
  const env = rand(["production", "staging"]);
  const svc = azureServiceBase("ingest-fn", env, "nodejs", {
    framework: "Azure Functions",
    runtimeName: "nodejs",
    runtimeVersion: "20",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);

  const hubUs = randInt(1500, 45_000);
  const sbUs = randInt(2000, 55_000);
  const cosmosUs = randInt(2000, 120_000);
  const s1 = randSpanId();
  const s2 = randSpanId();
  const s3 = randSpanId();
  const hubErr = isErr && randInt(0, 2) === 0;
  const sbErr = isErr && !hubErr && randInt(0, 1) === 0;
  const cosmosErr = isErr && !hubErr && !sbErr;

  const spanHub: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, ms),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: s1,
        type: "messaging",
        subtype: "azure-eventhub",
        name: "EventHub produce",
        duration: { us: hubUs },
        action: "send",
        destination: { service: { resource: "eventhubs", type: "messaging", name: "telemetry" } },
      },
      service: svc,
      cloud: azureCloud(region, subscription, "Microsoft.Web/sites"),
      event: { outcome: hubErr ? "failure" : "success" },
      azure: { trace: { function_name: `func-${randInt(1, 9)}` } },
      ...dim({ dependency_type: "Azure Event Hubs" }),
    },
    traceId,
    "nodejs"
  );
  ms += Math.max(1, Math.round(hubUs / 1000));

  const spanSb: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, ms),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: s2,
        type: "messaging",
        subtype: "azure-service-bus",
        name: "ServiceBus.SendMessage settlement-queue",
        duration: { us: sbUs },
        action: "send",
        destination: {
          service: { resource: "servicebus", type: "messaging", name: "azure-service-bus" },
        },
        labels: sbErr ? { "azure.service_bus.dead_letter": "true" } : {},
      },
      service: svc,
      cloud: azureCloud(region, subscription, "Microsoft.ServiceBus/namespaces"),
      event: { outcome: hubErr ? "failure" : sbErr ? "failure" : "success" },
      ...dim({ dependency_type: "Azure Service Bus" }),
    },
    traceId,
    "nodejs"
  );
  ms += Math.max(1, Math.round(sbUs / 1000));

  const spanCosmos: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, ms),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: s3,
        type: "db",
        subtype: "cosmosdb",
        name: "Cosmos upsert item",
        duration: { us: cosmosUs },
        action: "query",
        destination: { service: { resource: "cosmos", type: "db", name: "cosmos" } },
        labels: cosmosErr
          ? { "azure.cosmos.status_code": "429", "azure.cosmos.sub_status": "3200" }
          : {},
      },
      service: svc,
      cloud: azureCloud(region, subscription, "Microsoft.DocumentDB/databaseAccounts"),
      event: { outcome: hubErr || sbErr ? "failure" : cosmosErr ? "failure" : "success" },
      ...dim({ dependency_type: "Azure Cosmos DB" }),
    },
    traceId,
    "nodejs"
  );

  const totalUs = hubUs + sbUs + cosmosUs + randInt(500, 4000) * 1000;
  const txErr = hubErr || sbErr || cosmosErr;

  const txDoc: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: "EventHubTrigger — ingest-fn",
        type: "request",
        duration: { us: totalUs },
        result: txErr ? "failure" : "success",
        sampled: true,
        span_count: { started: 3, dropped: 0 },
      },
      service: svc,
      cloud: azureCloud(region, subscription, "Microsoft.Web/sites"),
      event: { outcome: txErr ? "failure" : "success" },
      ...dim({ trigger: "eventHub" }),
    },
    traceId,
    "nodejs"
  );

  return [txDoc, spanHub, spanSb, spanCosmos];
}
