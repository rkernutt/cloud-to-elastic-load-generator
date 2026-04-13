import type { EcsDocument } from "../helpers.js";
import { rand, randInt, azureCloud, makeAzureSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";

const APM_AGENT = { name: "opentelemetry", version: "1.x" } as const;
const APM_DS = { type: "traces", dataset: "apm", namespace: "default" } as const;

/**
 * Event Hubs — producer/consumer trace.
 * Producer root transaction → sendBatch span → consumer receiveMessages span.
 */
export function generateEventHubsTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const topic = rand(["orders-topic", "payments-topic", "inventory-events", "user-events"]);
  const partition = randInt(0, 31);

  const sendUs = randInt(4_000, 90_000);
  const receiveUs = randInt(6_000, 180_000);
  const overheadUs = randInt(1_000, 10_000);
  const totalUs = sendUs + receiveUs + overheadUs;

  const failOnSpan = isErr ? randInt(0, 1) : -1;

  const sSend = randSpanId();
  const sReceive = randSpanId();

  let ms = randInt(1, 8);

  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `produce ${topic}`,
      type: "messaging",
    },
    service: {
      name: "order-producer",
      language: { name: "java" },
      framework: { name: "spring-boot" },
    },
    cloud: azureCloud(region, subscription, "Microsoft.EventHub/namespaces"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    span: { id: txId, duration: { us: totalUs } },
  };

  const spanSend: EcsDocument = {
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
      destination: { service: { resource: "event-hubs" } },
    },
    service: { name: "order-producer" },
    cloud: azureCloud(region, subscription, "Microsoft.EventHub/namespaces"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: {
      outcome: failOnSpan === 0 ? "failure" : "success",
    },
    azure: { trace: { entity_path: topic } },
  };
  ms += Math.max(1, Math.round(sendUs / 1000));

  const spanReceive: EcsDocument = {
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
      destination: { service: { resource: "event-hubs" } },
    },
    service: { name: rand(["order-consumer", "audit-consumer", "analytics-consumer"]) },
    cloud: azureCloud(region, subscription, "Microsoft.EventHub/namespaces"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: {
      outcome: failOnSpan === 1 ? "failure" : "success",
    },
    azure: { trace: { entity_path: `${topic}/ConsumerGroups/$Default/Partitions/${partition}` } },
  };

  return [txDoc, spanSend, spanReceive];
}

/**
 * Key Vault — short request transaction + secret access span + optional downstream span.
 */
export function generateKeyVaultTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);

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

  let ms = randInt(1, 5);

  const txDoc: EcsDocument = {
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
    },
    service: {
      name: serviceName,
      language: { name: "python" },
      framework: { name: "fastapi" },
    },
    cloud: azureCloud(region, subscription, "Microsoft.KeyVault/vaults"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    span: { id: txId, duration: { us: totalUs } },
  };

  const spanKv: EcsDocument = {
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
    },
    service: { name: serviceName },
    cloud: azureCloud(region, subscription, "Microsoft.KeyVault/vaults"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: {
      outcome: failOnSpan === 0 ? "failure" : "success",
    },
  };
  ms += Math.max(1, Math.round(kvUs / 1000));

  const docs: EcsDocument[] = [txDoc, spanKv];

  if (includeDownstream) {
    const isDbCall = Math.random() > 0.5;
    const spanDown: EcsDocument = {
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
      },
      service: { name: serviceName },
      cloud: azureCloud(region, subscription, "Microsoft.KeyVault/vaults"),
      agent: APM_AGENT,
      data_stream: APM_DS,
      event: {
        outcome: failOnSpan === 1 ? "failure" : "success",
      },
    };
    docs.push(spanDown);
  }

  return docs;
}

/**
 * Logic Apps — workflow run as root transaction with 3-4 sequential action spans.
 */
export function generateLogicAppsTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);

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

  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `${workflowName} run`,
      type: "workflow",
    },
    service: {
      name: "logic-apps",
      language: { name: "json" },
      framework: { name: "Azure Logic Apps" },
    },
    cloud: azureCloud(region, subscription, "Microsoft.Logic/workflows"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    span: { id: txId, duration: { us: totalUs } },
    azure: { trace: { workflow: workflowName } },
  };

  let ms = randInt(1, 6);

  const spanTrigger: EcsDocument = {
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
    },
    service: { name: "logic-apps" },
    cloud: azureCloud(region, subscription, "Microsoft.Logic/workflows"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failOnAction === 0 ? "failure" : "success" },
    azure: { trace: { workflow: workflowName } },
  };
  ms += Math.max(1, Math.round(triggerUs / 1000));

  const spanHttp: EcsDocument = {
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
    },
    service: { name: "logic-apps" },
    cloud: azureCloud(region, subscription, "Microsoft.Logic/workflows"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failOnAction === 1 ? "failure" : "success" },
    azure: { trace: { workflow: workflowName } },
  };
  ms += Math.max(1, Math.round(httpUs / 1000));

  const spanSb: EcsDocument = {
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
    },
    service: { name: "logic-apps" },
    cloud: azureCloud(region, subscription, "Microsoft.Logic/workflows"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: failOnAction === 2 ? "failure" : "success" },
    azure: { trace: { workflow: workflowName } },
  };
  ms += Math.max(1, Math.round(sbUs / 1000));

  const docs: EcsDocument[] = [txDoc, spanTrigger, spanHttp, spanSb];

  if (includeNotification) {
    const spanNotif: EcsDocument = {
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
      },
      service: { name: "logic-apps" },
      cloud: azureCloud(region, subscription, "Microsoft.Logic/workflows"),
      agent: APM_AGENT,
      data_stream: APM_DS,
      event: { outcome: failOnAction === 3 ? "failure" : "success" },
      azure: { trace: { workflow: workflowName } },
    };
    docs.push(spanNotif);
  }

  return docs;
}
