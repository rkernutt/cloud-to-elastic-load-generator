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

export function generateServiceBusTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const svc = azureServiceBase("orders-worker", env, "dotnet", {
    framework: "Azure.Messaging.ServiceBus",
    runtimeName: "dotnet",
    runtimeVersion: "8.0",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);
  const cloud = azureCloud(region, subscription, "Microsoft.ServiceBus/namespaces");

  const sRecv = randSpanId();
  const sProc = randSpanId();
  const sComp = randSpanId();
  const u1 = randInt(2_000, 120_000);
  const u2 = randInt(5_000, 350_000);
  const u3 = randInt(800, 65_000);
  const err2 = isErr && randInt(0, 1) === 0;
  const err3 = isErr && !err2;

  const spanRecv = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sRecv,
        type: "messaging",
        subtype: "azure-service-bus",
        name: "ServiceBus.ReceiveMessages orders-queue",
        duration: { us: u1 },
        action: "receive",
        destination: { service: { resource: "servicebus", type: "messaging", name: "servicebus" } },
      },
      service: svc,
      cloud,
      event: { outcome: "success" },
      ...dim({ dependency_type: "Azure Service Bus" }),
    },
    traceId,
    "dotnet"
  );

  const spanProc = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, Math.max(1, Math.round(u1 / 1000))),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sProc,
        type: "app",
        subtype: "internal",
        name: "ProcessOrderMessage",
        duration: { us: u2 },
        action: "process",
        destination: { service: { resource: "orders-worker", type: "app", name: "orders-worker" } },
        labels: err2 ? { "azure.service_bus.dead_letter": "true" } : {},
      },
      service: svc,
      cloud,
      event: { outcome: err2 ? "failure" : "success" },
      ...dim({}),
    },
    traceId,
    "dotnet"
  );

  const spanComp = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, Math.max(1, Math.round((u1 + u2) / 1000))),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sComp,
        type: "messaging",
        subtype: "azure-service-bus",
        name: "ServiceBus.CompleteMessage",
        duration: { us: u3 },
        action: "consume",
        destination: { service: { resource: "servicebus", type: "messaging", name: "servicebus" } },
        labels: err3 ? { "azure.service_bus.error": "lock_lost" } : {},
      },
      service: svc,
      cloud,
      event: { outcome: err2 ? "failure" : err3 ? "failure" : "success" },
      ...dim({ dependency_type: "Azure Service Bus" }),
    },
    traceId,
    "dotnet"
  );

  const totalUs = u1 + u2 + u3 + randInt(500, 8_000);
  const txErr = err2 || err3;
  const txDoc = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: "ServiceBusTrigger orders-queue",
        type: "request",
        duration: { us: totalUs },
        result: txErr ? "failure" : "success",
        sampled: true,
        span_count: { started: 3, dropped: 0 },
      },
      service: svc,
      cloud,
      event: { outcome: txErr ? "failure" : "success" },
      ...dim({}),
    },
    traceId,
    "dotnet"
  );

  return [txDoc, spanRecv, spanProc, spanComp];
}
