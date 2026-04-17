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

export function generateEventHubsTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const topic = rand(["orders-topic", "payments-topic", "inventory-events", "user-events"]);
  const partition = randInt(0, 31);
  const env = rand(["production", "staging"]);
  const svcProd = azureServiceBase("order-producer", env, "java", {
    framework: "spring-boot",
    runtimeName: "java",
    runtimeVersion: "21",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);

  const sendUs = randInt(4_000, 90_000);
  const receiveUs = randInt(6_000, 180_000);
  const overheadUs = randInt(1_000, 10_000);
  const totalUs = sendUs + receiveUs + overheadUs;

  const failOnSpan = isErr ? randInt(0, 1) : -1;

  const sSend = randSpanId();
  const sReceive = randSpanId();

  let ms = randInt(1, 8);

  const txDoc: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: `produce ${topic}`,
        type: "messaging",
        duration: { us: totalUs },
        result: isErr ? "failure" : "success",
        sampled: true,
        span_count: { started: 2, dropped: 0 },
      },
      service: svcProd,
      cloud: azureCloud(region, subscription, "Microsoft.EventHub/namespaces"),
      event: { outcome: isErr ? "failure" : "success" },
      ...dim({ hub: topic }),
    },
    traceId,
    "java"
  );

  const spanSend: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, ms),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sSend,
        type: "messaging",
        subtype: "azure-event-hubs",
        name: `EventHubs.sendBatch ${topic}`,
        duration: { us: failOnSpan === 0 ? sendUs * 4 : sendUs },
        action: "send",
        destination: { service: { resource: "event-hubs", type: "messaging", name: "event-hubs" } },
        labels: failOnSpan === 0 ? { "azure.eventhubs.error": "quota_exceeded" } : {},
      },
      service: svcProd,
      cloud: azureCloud(region, subscription, "Microsoft.EventHub/namespaces"),
      event: {
        outcome: failOnSpan === 0 ? "failure" : "success",
      },
      azure: { trace: { entity_path: topic } },
      ...dim({ dependency_type: "Event Hubs" }),
    },
    traceId,
    "java"
  );
  ms += Math.max(1, Math.round(sendUs / 1000));

  const spanReceive: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, ms),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: sSend },
      span: {
        id: sReceive,
        type: "messaging",
        subtype: "azure-event-hubs",
        name: `EventHubs.receiveMessages partition-${partition}`,
        duration: { us: failOnSpan === 1 ? receiveUs * 5 : receiveUs },
        action: "receive",
        destination: { service: { resource: "event-hubs", type: "messaging", name: "event-hubs" } },
      },
      service: azureServiceBase(
        rand(["order-consumer", "audit-consumer", "analytics-consumer"]),
        env,
        "java",
        {
          runtimeName: "java",
          runtimeVersion: "21",
        }
      ),
      cloud: azureCloud(region, subscription, "Microsoft.EventHub/namespaces"),
      event: {
        outcome: failOnSpan === 1 ? "failure" : "success",
      },
      azure: {
        trace: { entity_path: `${topic}/ConsumerGroups/$Default/Partitions/${partition}` },
      },
      ...dim({ dependency_type: "Event Hubs" }),
    },
    traceId,
    "java"
  );

  return [txDoc, spanSend, spanReceive];
}

export function generateKeyVaultTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);

  const serviceName = rand(["auth-service", "config-manager", "secrets-rotator"]);
  const kvOp = rand(["KeyVault.getSecret", "KeyVault.listSecretVersions"]);
  const includeDownstream = Math.random() > 0.45;
  const failOnSpan = isErr ? randInt(0, includeDownstream ? 1 : 0) : -1;

  const kvUs = randInt(5_000, 60_000);
  const downUs = includeDownstream ? randInt(8_000, 200_000) : 0;
  const overheadUs = randInt(500, 4_000);
  const totalUs = kvUs + downUs + overheadUs;

  const sKv = randSpanId();
  const sDown = randSpanId();
  const svc = azureServiceBase(serviceName, env, "python", {
    framework: "fastapi",
    runtimeName: "python",
    runtimeVersion: "3.12",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);

  let ms = randInt(1, 5);

  const txDoc: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: rand([
          "GET /auth/token",
          "POST /config/reload",
          "GET /health/secrets",
          "POST /rotate/keys",
        ]),
        type: "request",
        duration: { us: totalUs },
        result: isErr ? "HTTP 403" : "HTTP 2xx",
        sampled: true,
        span_count: { started: includeDownstream ? 2 : 1, dropped: 0 },
      },
      service: svc,
      cloud: azureCloud(region, subscription, "Microsoft.KeyVault/vaults"),
      event: { outcome: isErr ? "failure" : "success" },
      ...dim({ component: "key_vault" }),
    },
    traceId,
    "python"
  );

  const spanKv: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, ms),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sKv,
        type: "external",
        subtype: "azure-keyvault",
        name: kvOp,
        duration: { us: failOnSpan === 0 ? kvUs * 3 : kvUs },
        action: "get",
        destination: { service: { resource: "keyvault", type: "external", name: "keyvault" } },
        labels: failOnSpan === 0 ? { "azure.keyvault.status": "403" } : {},
      },
      service: svc,
      cloud: azureCloud(region, subscription, "Microsoft.KeyVault/vaults"),
      event: {
        outcome: failOnSpan === 0 ? "failure" : "success",
      },
      ...dim({ dependency_type: "Key Vault" }),
    },
    traceId,
    "python"
  );
  ms += Math.max(1, Math.round(kvUs / 1000));

  const docs: EcsDocument[] = [txDoc, spanKv];

  if (includeDownstream) {
    const isDbCall = Math.random() > 0.5;
    const spanDown: EcsDocument = enrichAzureTraceDoc(
      {
        "@timestamp": offsetTs(base, ms),
        processor: { name: "transaction", event: "span" },
        trace: { id: traceId },
        transaction: { id: txId },
        parent: { id: sKv },
        span: {
          id: sDown,
          type: isDbCall ? "db" : "external",
          subtype: isDbCall ? "postgresql" : "http",
          name: isDbCall
            ? "SELECT * FROM service_credentials WHERE service = ?"
            : rand(["HTTP POST /api/authenticate", "HTTP GET /internal/validate-token"]),
          duration: { us: failOnSpan === 1 ? downUs * 4 : downUs },
          ...(isDbCall ? { db: { type: "sql" } } : {}),
          destination: {
            service: {
              resource: isDbCall ? "postgresql" : "http",
              type: isDbCall ? "db" : "external",
              name: isDbCall ? "postgresql" : "http",
            },
          },
        },
        service: svc,
        cloud: azureCloud(region, subscription, "Microsoft.KeyVault/vaults"),
        event: {
          outcome: failOnSpan === 1 ? "failure" : "success",
        },
        ...dim({ dependency_type: isDbCall ? "PostgreSQL" : "HTTP" }),
      },
      traceId,
      "python"
    );
    docs.push(spanDown);
  }

  return docs;
}

export function generateLogicAppsTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);

  const workflowName = rand([
    "order-approval-flow",
    "invoice-processing-flow",
    "customer-onboarding-flow",
    "alert-notification-flow",
  ]);
  const includeNotification = Math.random() > 0.3;
  const spanCount = includeNotification ? 4 : 3;
  const failOnAction = isErr ? randInt(0, spanCount - 1) : -1;

  const triggerUs = randInt(3_000, 30_000);
  const httpUs = randInt(20_000, 400_000);
  const sbUs = randInt(8_000, 150_000);
  const notifUs = includeNotification ? randInt(10_000, 200_000) : 0;
  const overheadUs = randInt(5_000, 30_000);
  const totalUs = triggerUs + httpUs + sbUs + notifUs + overheadUs;

  const sTrigger = randSpanId();
  const sHttp = randSpanId();
  const sSb = randSpanId();
  const sNotif = randSpanId();
  const svc = azureServiceBase("logic-apps", env, "nodejs", { framework: "Azure Logic Apps" });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);

  const txDoc: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: `${workflowName} run`,
        type: "workflow",
        duration: { us: totalUs },
        result: isErr ? "failure" : "success",
        sampled: true,
        span_count: { started: spanCount, dropped: 0 },
      },
      service: svc,
      cloud: azureCloud(region, subscription, "Microsoft.Logic/workflows"),
      event: { outcome: isErr ? "failure" : "success" },
      azure: { trace: { workflow: workflowName } },
      ...dim({ integration: "logic_apps" }),
    },
    traceId,
    "nodejs"
  );

  let ms = randInt(1, 6);

  const spanTrigger: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, ms),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sTrigger,
        type: "app",
        subtype: "trigger",
        name: rand(["HTTP Request trigger", "Recurrence trigger", "Service Bus trigger"]),
        duration: { us: failOnAction === 0 ? triggerUs * 3 : triggerUs },
        action: "trigger",
      },
      service: svc,
      cloud: azureCloud(region, subscription, "Microsoft.Logic/workflows"),
      event: { outcome: failOnAction === 0 ? "failure" : "success" },
      azure: { trace: { workflow: workflowName } },
      ...dim({ action: "trigger" }),
    },
    traceId,
    "nodejs"
  );
  ms += Math.max(1, Math.round(triggerUs / 1000));

  const spanHttp: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, ms),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: sTrigger },
      span: {
        id: sHttp,
        type: "external",
        subtype: "http",
        name: rand([
          "HTTP GET /api/orders",
          "HTTP POST /api/validate",
          "HTTP GET /api/customers/{id}",
        ]),
        duration: { us: failOnAction === 1 ? httpUs * 4 : httpUs },
        action: "http",
        destination: { service: { resource: "http", type: "external", name: "http" } },
      },
      service: svc,
      cloud: azureCloud(region, subscription, "Microsoft.Logic/workflows"),
      event: { outcome: failOnAction === 1 ? "failure" : "success" },
      azure: { trace: { workflow: workflowName } },
      ...dim({ action: "http" }),
    },
    traceId,
    "nodejs"
  );
  ms += Math.max(1, Math.round(httpUs / 1000));

  const spanSb: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, ms),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: sHttp },
      span: {
        id: sSb,
        type: "messaging",
        subtype: "azure-service-bus",
        name: `ServiceBus Send ${rand(["orders-topic", "approvals-queue", "notifications-topic"])}`,
        duration: { us: failOnAction === 2 ? sbUs * 5 : sbUs },
        action: "send",
        destination: {
          service: { resource: "servicebus", type: "messaging", name: "azure-service-bus" },
        },
        labels: failOnAction === 2 ? { "azure.service_bus.dead_letter": "true" } : {},
      },
      service: svc,
      cloud: azureCloud(region, subscription, "Microsoft.Logic/workflows"),
      event: { outcome: failOnAction === 2 ? "failure" : "success" },
      azure: { trace: { workflow: workflowName } },
      ...dim({ action: "service_bus" }),
    },
    traceId,
    "nodejs"
  );
  ms += Math.max(1, Math.round(sbUs / 1000));

  const docs: EcsDocument[] = [txDoc, spanTrigger, spanHttp, spanSb];

  if (includeNotification) {
    const spanNotif: EcsDocument = enrichAzureTraceDoc(
      {
        "@timestamp": offsetTs(base, ms),
        processor: { name: "transaction", event: "span" },
        trace: { id: traceId },
        transaction: { id: txId },
        parent: { id: sSb },
        span: {
          id: sNotif,
          type: "external",
          subtype: "smtp",
          name: "Office365 Send Email",
          duration: { us: failOnAction === 3 ? notifUs * 3 : notifUs },
          action: "send",
          destination: { service: { resource: "smtp", type: "external", name: "smtp" } },
        },
        service: svc,
        cloud: azureCloud(region, subscription, "Microsoft.Logic/workflows"),
        event: { outcome: failOnAction === 3 ? "failure" : "success" },
        azure: { trace: { workflow: workflowName } },
        ...dim({ action: "notification" }),
      },
      traceId,
      "nodejs"
    );
    docs.push(spanNotif);
  }

  return docs;
}
