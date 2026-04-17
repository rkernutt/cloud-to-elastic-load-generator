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

export function generateAksTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const sEnv = randSpanId();
  const sGrpc = randSpanId();
  const sCos = randSpanId();
  const env = rand(["production", "staging"]);
  const svc = azureServiceBase("checkout-svc", env, "go", {
    framework: "chi",
    runtimeName: "go",
    runtimeVersion: "1.22",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);

  const envUs = randInt(2000, 45_000);
  const grpcUs = randInt(3000, 120_000);
  const cosUs = randInt(4000, 180_000);
  const failIdx = isErr ? randInt(0, 2) : -1;

  const spanEnvoy: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sEnv,
        type: "external",
        subtype: "envoy",
        name: "envoy.ingress route checkout-svc",
        duration: { us: envUs },
        action: "proxy",
        destination: { service: { resource: "envoy", type: "external", name: "envoy" } },
      },
      service: svc,
      cloud: azureCloud(region, subscription, "Microsoft.ContainerService/managedClusters"),
      event: { outcome: "success" },
      azure: { trace: { cluster: `aks-${randInt(1, 9)}` } },
      ...dim({ mesh: "istio" }),
    },
    traceId,
    "go"
  );

  const spanGrpc: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(new Date(ts), Math.max(1, Math.round(envUs / 1000))),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: sEnv },
      span: {
        id: sGrpc,
        type: "external",
        subtype: "grpc",
        name: "grpc.payments.Payments/Capture",
        duration: { us: grpcUs },
        action: "call",
        destination: { service: { resource: "payments-svc", type: "external", name: "grpc" } },
        labels: failIdx === 0 ? { "grpc.status_code": "14" } : {},
      },
      service: svc,
      cloud: azureCloud(region, subscription, "Microsoft.ContainerService/managedClusters"),
      event: { outcome: failIdx === 0 ? "failure" : "success" },
      ...dim({ dependency_type: "gRPC" }),
    },
    traceId,
    "go"
  );

  const spanCosmos: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(
        new Date(ts),
        Math.max(1, Math.round(envUs / 1000)) + Math.max(1, Math.round(grpcUs / 1000))
      ),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: sGrpc },
      span: {
        id: sCos,
        type: "db",
        subtype: "cosmosdb",
        name: "CosmosDB.CreateItem carts",
        duration: { us: cosUs },
        action: "query",
        destination: { service: { resource: "cosmos", type: "db", name: "cosmos" } },
        labels: failIdx === 1 ? { "azure.cosmos.status_code": "429" } : {},
      },
      service: svc,
      cloud: azureCloud(region, subscription, "Microsoft.DocumentDB/databaseAccounts"),
      event: { outcome: failIdx === 1 ? "failure" : "success" },
      ...dim({ dependency_type: "Azure Cosmos DB" }),
    },
    traceId,
    "go"
  );

  const totalUs = envUs + grpcUs + cosUs + randInt(1000, 8000) * 1000;
  const txErr = failIdx >= 0;

  const txDoc: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: "GET /api/v1/checkout",
        type: "request",
        duration: { us: totalUs },
        result: txErr ? "HTTP 5xx" : "HTTP 2xx",
        sampled: true,
        span_count: { started: 3, dropped: 0 },
      },
      service: svc,
      cloud: azureCloud(region, subscription, "Microsoft.ContainerService/managedClusters"),
      event: { outcome: txErr ? "failure" : "success" },
      azure: { trace: { cluster: `aks-${randInt(1, 9)}` } },
      ...dim({ workload: "checkout" }),
    },
    traceId,
    "go"
  );

  return [txDoc, spanEnvoy, spanGrpc, spanCosmos];
}

export function generateServiceBusFlowTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  let ms = 0;
  const env = rand(["production", "staging"]);
  const svcBase = azureServiceBase(rand(["order-worker", "billing-worker"]), env, "dotnet", {
    framework: "Azure Functions",
    runtimeName: "dotnet",
    runtimeVersion: "8.0",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);
  const steps = ["enqueue", "processor", "downstream-api"];
  const docs: EcsDocument[] = [];
  let totalSpanUs = 0;

  for (let i = 0; i < steps.length; i++) {
    const sid = randSpanId();
    const d = randInt(1000, 90_000);
    totalSpanUs += d;
    const fail = isErr && i === steps.length - 1;
    const step = steps[i]!;
    docs.push(
      enrichAzureTraceDoc(
        {
          "@timestamp": offsetTs(base, ms),
          processor: { name: "transaction", event: "span" },
          trace: { id: traceId },
          transaction: { id: txId },
          parent: { id: txId },
          span: {
            id: sid,
            type: "messaging",
            subtype: "azure-service-bus",
            name: step,
            duration: { us: d },
            action: i === 0 ? "send" : "receive",
            destination: {
              service: { resource: "servicebus", type: "messaging", name: "azure-service-bus" },
            },
            labels: fail ? { "azure.service_bus.delivery_count": "10" } : {},
          },
          service: svcBase,
          cloud: azureCloud(region, subscription, "Microsoft.ServiceBus/namespaces"),
          event: { outcome: fail ? "failure" : "success" },
          ...dim({ step }),
        },
        traceId,
        "dotnet"
      )
    );
    ms += Math.max(1, Math.round(d / 1000));
  }

  const totalUs = totalSpanUs + randInt(2000, 8000) * 1000;
  const txDoc: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: "Service Bus multi-hop",
        type: "messaging",
        duration: { us: totalUs },
        result: isErr ? "failure" : "success",
        sampled: true,
        span_count: { started: steps.length, dropped: 0 },
      },
      service: svcBase,
      cloud: azureCloud(region, subscription, "Microsoft.ServiceBus/namespaces"),
      event: { outcome: isErr ? "failure" : "success" },
      ...dim({ flow: "service_bus" }),
    },
    traceId,
    "dotnet"
  );

  return [txDoc, ...docs];
}

export function generateOpenAiChainTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  let ms = 0;
  const env = rand(["production", "staging"]);
  const svc = azureServiceBase("rag-api", env, "python", {
    framework: "FastAPI",
    runtimeName: "python",
    runtimeVersion: "3.12",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);
  const emb = randSpanId();
  const cmp = randSpanId();
  const eUs = randInt(5_000, 80_000);
  const cUs = randInt(50_000, 900_000);

  const spanEmb: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, ms),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: emb,
        type: "external",
        subtype: "openai",
        name: "embeddings",
        duration: { us: eUs },
        action: "embed",
        destination: { service: { resource: "openai", type: "external", name: "openai" } },
      },
      service: svc,
      cloud: azureCloud(region, subscription, "Microsoft.CognitiveServices/accounts"),
      event: { outcome: "success" },
      azure: { trace: { model: "text-embedding-3-large" } },
      ...dim({ operation: "embedding" }),
    },
    traceId,
    "python"
  );
  ms += Math.max(1, Math.round(eUs / 1000));

  const spanCmp: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, ms),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: cmp,
        type: "external",
        subtype: "openai",
        name: "chat completion",
        duration: { us: cUs },
        action: "completion",
        destination: { service: { resource: "openai", type: "external", name: "openai" } },
        labels: isErr ? { "azure.openai.status": "429" } : {},
      },
      service: svc,
      cloud: azureCloud(region, subscription, "Microsoft.CognitiveServices/accounts"),
      event: { outcome: isErr ? "failure" : "success" },
      azure: { trace: { deployment: "gpt-4o" } },
      ...dim({ operation: "chat" }),
    },
    traceId,
    "python"
  );

  const totalUs = eUs + cUs + randInt(1000, 5000) * 1000;
  const txDoc: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: "POST /v1/rag/query",
        type: "request",
        duration: { us: totalUs },
        result: isErr ? "HTTP 429" : "HTTP 2xx",
        sampled: true,
        span_count: { started: 2, dropped: 0 },
      },
      service: svc,
      cloud: azureCloud(region, subscription, "Microsoft.CognitiveServices/accounts"),
      event: { outcome: isErr ? "failure" : "success" },
      ...dim({ chain: "openai" }),
    },
    traceId,
    "python"
  );

  return [txDoc, spanEmb, spanCmp];
}

export function generateDataFactoryEtlTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const svc = azureServiceBase("adf-pipeline", env, "dotnet", { framework: "Azure Data Factory" });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);
  const blobUs = randInt(200_000, 2_000_000);
  const sqlUs = randInt(300_000, 14_000_000);
  const s1 = randSpanId();
  const s2 = randSpanId();
  const failIdx = isErr ? randInt(0, 1) : -1;

  const spanBlob: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: s1,
        type: "storage",
        subtype: "azure-blob",
        name: "CopyBlobSource staging/export",
        duration: { us: blobUs },
        action: "read",
        destination: { service: { resource: "blob", type: "storage", name: "azure-blob" } },
      },
      service: svc,
      cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts"),
      event: { outcome: failIdx === 0 ? "failure" : "success" },
      ...dim({ activity: "Copy" }),
    },
    traceId,
    "dotnet"
  );

  const spanSql: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, Math.max(1, Math.round(blobUs / 1000))),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: s1 },
      span: {
        id: s2,
        type: "db",
        subtype: "azuresql",
        name: "SqlSink warehouse.facts",
        duration: { us: sqlUs },
        action: "bulk_insert",
        db: { type: "sql", statement: "INSERT INTO warehouse.facts SELECT * FROM staging" },
        destination: { service: { resource: "sql", type: "db", name: "azure-sql" } },
        labels: failIdx === 1 ? { "azure.sql.error": "40613" } : {},
      },
      service: svc,
      cloud: azureCloud(region, subscription, "Microsoft.Sql/servers"),
      event: { outcome: failIdx === 1 ? "failure" : "success" },
      ...dim({ activity: "SqlSink" }),
    },
    traceId,
    "dotnet"
  );

  const totalUs = blobUs + sqlUs + randInt(50_000, 500_000);
  const txDoc: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: "Copy Blob → SQL",
        type: "job",
        duration: { us: totalUs },
        result: isErr ? "failure" : "success",
        sampled: true,
        span_count: { started: 2, dropped: 0 },
      },
      service: svc,
      cloud: azureCloud(region, subscription, "Microsoft.DataFactory/factories"),
      event: { outcome: isErr ? "failure" : "success" },
      azure: { trace: { activity: "Copy" } },
      ...dim({ pipeline: "daily_curated" }),
    },
    traceId,
    "dotnet"
  );

  return [txDoc, spanBlob, spanSql];
}

export function generateApiManagementTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const svc = azureServiceBase("apim-gateway", env, "csharp", {
    framework: "Azure API Management",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);
  const polUs = randInt(50_000, 400_000);
  const beUs = randInt(400_000, 6_000_000);
  const s1 = randSpanId();
  const s2 = randSpanId();

  const spanPol: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: s1,
        type: "external",
        subtype: "http",
        name: "APIM policy execute",
        duration: { us: polUs },
        action: "policy",
        destination: { service: { resource: "apim", type: "external", name: "apim" } },
      },
      service: svc,
      cloud: azureCloud(region, subscription, "Microsoft.ApiManagement/service"),
      event: { outcome: "success" },
      ...dim({ phase: "policy" }),
    },
    traceId,
    "dotnet"
  );

  const spanBe: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, Math.max(1, Math.round(polUs / 1000))),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: s1 },
      span: {
        id: s2,
        type: "external",
        subtype: "http",
        name: rand(["GET /v1/orders", "POST /v2/pay"]),
        duration: { us: beUs },
        action: "http",
        http: { response: { status_code: isErr ? 504 : 200 } },
      },
      service: svc,
      cloud: azureCloud(region, subscription, "Microsoft.ApiManagement/service"),
      event: { outcome: isErr ? "failure" : "success" },
      ...dim({ phase: "backend" }),
    },
    traceId,
    "dotnet"
  );

  const totalUs = polUs + beUs + randInt(100_000, 800_000);
  const txDoc: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: rand(["GET /v1/orders", "POST /v2/pay"]),
        type: "request",
        duration: { us: totalUs },
        result: isErr ? "HTTP 504" : "HTTP 2xx",
        sampled: true,
        span_count: { started: 2, dropped: 0 },
      },
      service: svc,
      cloud: azureCloud(region, subscription, "Microsoft.ApiManagement/service"),
      event: { outcome: isErr ? "failure" : "success" },
      ...dim({ sku: "Premium" }),
    },
    traceId,
    "dotnet"
  );

  return [txDoc, spanPol, spanBe];
}

export function generateWorkflowCascadingTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const s1 = randSpanId();
  const s2 = randSpanId();
  const s3 = randSpanId();
  const fail = isErr;
  const env = rand(["production", "staging"]);
  const svc = azureServiceBase("orchestrator-fn", env, "csharp", {
    framework: "Azure Functions",
    runtimeName: "dotnet",
    runtimeVersion: "8.0",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);

  const spanTrig: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: s1,
        type: "app",
        subtype: "azure_functions_trigger",
        name: "Function trigger",
        duration: { us: 12_000 },
        action: "invoke",
      },
      service: svc,
      cloud: azureCloud(region, subscription, "Microsoft.Web/sites"),
      event: { outcome: "success" },
      ...dim({ step: "trigger" }),
    },
    traceId,
    "dotnet"
  );

  const spanBlob: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, 25),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: s2,
        type: "storage",
        subtype: "azure-blob",
        name: "Blob download",
        duration: { us: 400_000 },
        action: "read",
        destination: { service: { resource: "blob", type: "storage", name: "azure-blob" } },
        labels: fail ? { "azure.storage.http_status": "404" } : {},
      },
      service: svc,
      cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts"),
      event: { outcome: fail ? "failure" : "success" },
      ...dim({ step: "blob" }),
    },
    traceId,
    "dotnet"
  );

  const spanTable: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, 50),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: s2 },
      span: {
        id: s3,
        type: "db",
        subtype: "azuretable",
        name: "Table batch merge checkpoints",
        duration: { us: randInt(20_000, 120_000) },
        action: "execute",
        destination: { service: { resource: "table", type: "db", name: "azure-table" } },
      },
      service: svc,
      cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts"),
      event: { outcome: fail ? "failure" : "success" },
      ...dim({ step: "table" }),
    },
    traceId,
    "dotnet"
  );

  const totalUs = 12_000 + 400_000 + randInt(20_000, 120_000) + randInt(1000, 8000) * 1000;
  const txDoc: EcsDocument = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: "Functions.orchestrator",
        type: "request",
        duration: { us: totalUs },
        result: fail ? "failure" : "success",
        sampled: true,
        span_count: { started: 3, dropped: 0 },
      },
      service: svc,
      cloud: azureCloud(region, subscription, "Microsoft.Web/sites"),
      event: { outcome: fail ? "failure" : "success" },
      ...dim({ scenario: "cascading" }),
    },
    traceId,
    "dotnet"
  );

  return [txDoc, spanTrig, spanBlob, spanTable];
}
