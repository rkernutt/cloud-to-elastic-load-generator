import type { EcsDocument } from "../helpers.js";
import { rand, randInt, azureCloud, makeAzureSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";

const APM_AGENT = { name: "opentelemetry", version: "1.x" } as const;
const APM_DS = { type: "traces", dataset: "apm", namespace: "default" } as const;

export function generateAksTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const tx = randSpanId();
  const us = randInt(3000, 200_000);
  return [
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: { id: tx, name: "GET /api/v1/checkout" },
      service: {
        name: "checkout-svc",
        language: { name: "go" },
        framework: { name: "chi" },
      },
      cloud: azureCloud(region, subscription, "Microsoft.ContainerService/managedClusters"),
      agent: APM_AGENT,
      data_stream: APM_DS,
      event: { outcome: isErr ? "failure" : "success" },
      span: { id: tx, duration: { us } },
      azure: { trace: { cluster: `aks-${randInt(1, 9)}` } },
    },
  ];
}

export function generateServiceBusFlowTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const tx = randSpanId();
  const base = new Date(ts);
  let ms = 0;
  const steps = ["enqueue", "processor", "downstream-api"];
  const docs: EcsDocument[] = [];
  for (let i = 0; i < steps.length; i++) {
    const sid = randSpanId();
    const d = randInt(1000, 90_000);
    const fail = isErr && i === steps.length - 1;
    docs.push({
      "@timestamp": offsetTs(base, ms),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: tx },
      parent: { id: tx },
      span: {
        id: sid,
        type: "messaging",
        subtype: "azure-service-bus",
        name: steps[i]!,
        duration: { us: d },
      },
      service: { name: rand(["order-worker", "billing-worker"]) },
      cloud: azureCloud(region, subscription, "Microsoft.ServiceBus/namespaces"),
      agent: APM_AGENT,
      data_stream: APM_DS,
      event: { outcome: fail ? "failure" : "success" },
    });
    ms += Math.max(1, Math.round(d / 1000));
  }
  return docs;
}

export function generateOpenAiChainTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const tx = randSpanId();
  const base = new Date(ts);
  let ms = 0;
  const emb = randSpanId();
  const cmp = randSpanId();
  const eUs = randInt(5_000, 80_000);
  const cUs = randInt(50_000, 900_000);
  const docs: EcsDocument[] = [
    {
      "@timestamp": offsetTs(base, ms),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: tx },
      parent: { id: tx },
      span: {
        id: emb,
        type: "external",
        subtype: "openai",
        name: "embeddings",
        duration: { us: eUs },
      },
      service: { name: "rag-api" },
      cloud: azureCloud(region, subscription, "Microsoft.CognitiveServices/accounts"),
      agent: APM_AGENT,
      data_stream: APM_DS,
      event: { outcome: "success" },
      azure: { trace: { model: "text-embedding-3-large" } },
    },
  ];
  ms += Math.max(1, Math.round(eUs / 1000));
  docs.push({
    "@timestamp": offsetTs(base, ms),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: tx },
    parent: { id: tx },
    span: {
      id: cmp,
      type: "external",
      subtype: "openai",
      name: "chat completion",
      duration: { us: cUs },
    },
    service: { name: "rag-api" },
    cloud: azureCloud(region, subscription, "Microsoft.CognitiveServices/accounts"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    azure: { trace: { deployment: "gpt-4o" } },
  });
  return docs;
}

export function generateDataFactoryEtlTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const tx = randSpanId();
  return [
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: { id: tx, name: "Copy Blob → SQL" },
      service: { name: "adf-pipeline" },
      cloud: azureCloud(region, subscription, "Microsoft.DataFactory/factories"),
      agent: APM_AGENT,
      data_stream: APM_DS,
      event: { outcome: isErr ? "failure" : "success" },
      span: { id: tx, duration: { us: randInt(500_000, 18_000_000) } },
      azure: { trace: { activity: "Copy" } },
    },
  ];
}

export function generateApiManagementTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const tx = randSpanId();
  return [
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: { id: tx, name: rand(["GET /v1/orders", "POST /v2/pay"]) },
      service: { name: "apim-gateway" },
      cloud: azureCloud(region, subscription, "Microsoft.ApiManagement/service"),
      agent: APM_AGENT,
      data_stream: APM_DS,
      event: { outcome: isErr ? "failure" : "success" },
      span: { id: tx, duration: { us: randInt(400_000, 6_000_000) } },
    },
  ];
}

export function generateWorkflowCascadingTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const tx = randSpanId();
  const base = new Date(ts);
  const s1 = randSpanId();
  const s2 = randSpanId();
  const fail = isErr;
  return [
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: tx },
      parent: { id: tx },
      span: { id: s1, name: "Function trigger", duration: { us: 12_000 }, type: "app" },
      service: { name: "orchestrator-fn" },
      cloud: azureCloud(region, subscription, "Microsoft.Web/sites"),
      agent: APM_AGENT,
      data_stream: APM_DS,
      event: { outcome: "success" },
    },
    {
      "@timestamp": offsetTs(base, 25),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: tx },
      parent: { id: tx },
      span: { id: s2, name: "Blob read", duration: { us: 400_000 }, type: "storage" },
      service: { name: "orchestrator-fn" },
      cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts"),
      agent: APM_AGENT,
      data_stream: APM_DS,
      event: { outcome: fail ? "failure" : "success" },
    },
  ];
}
