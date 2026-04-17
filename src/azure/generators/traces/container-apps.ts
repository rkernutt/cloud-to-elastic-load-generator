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

export function generateContainerAppsTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const svc = azureServiceBase("checkout-ca", env, "python", {
    framework: "FastAPI",
    runtimeName: "python",
    runtimeVersion: "3.12",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);
  const cloud = azureCloud(region, subscription, "Microsoft.App/containerApps");

  const s1 = randSpanId();
  const s2 = randSpanId();
  const u1 = randInt(2_000, 95_000);
  const u2 = randInt(5_000, 220_000);
  const err2 = isErr;

  const spanSql = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, randInt(1, 5)),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: s1,
        type: "db",
        subtype: "postgresql",
        name: "PostgreSQL SELECT",
        duration: { us: u1 },
        action: "query",
        db: { type: "sql", statement: "SELECT * FROM carts WHERE id = $1" },
        destination: { service: { resource: "postgresql", type: "db", name: "postgresql" } },
      },
      service: svc,
      cloud: azureCloud(region, subscription, "Microsoft.DBforPostgreSQL/flexibleServers"),
      event: { outcome: "success" },
      ...dim({ dependency_type: "PostgreSQL" }),
    },
    traceId,
    "python"
  );

  const spanSb = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, Math.max(1, Math.round(u1 / 1000))),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: s2,
        type: "messaging",
        subtype: "azure-service-bus",
        name: "ServiceBus.SendMessage",
        duration: { us: u2 },
        action: "send",
        destination: { service: { resource: "servicebus", type: "messaging", name: "servicebus" } },
      },
      service: svc,
      cloud: azureCloud(region, subscription, "Microsoft.ServiceBus/namespaces"),
      event: { outcome: err2 ? "failure" : "success" },
      ...dim({ dependency_type: "Azure Service Bus" }),
    },
    traceId,
    "python"
  );

  const totalUs = u1 + u2 + randInt(1_000, 8_000);
  const txDoc = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: "POST /checkout/submit",
        type: "request",
        duration: { us: totalUs },
        result: err2 ? "failure" : "success",
        sampled: true,
        span_count: { started: 2, dropped: 0 },
      },
      service: svc,
      cloud,
      event: { outcome: err2 ? "failure" : "success" },
      ...dim({}),
    },
    traceId,
    "python"
  );

  return [txDoc, spanSql, spanSb];
}
