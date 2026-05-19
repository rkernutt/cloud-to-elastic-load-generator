import {
  type EcsDocument,
  rand,
  randInt,
  randId,
  randIp,
  azureCloud,
  makeAzureSetup,
  randUUID,
} from "./helpers.js";

function azureDiagnosticTime(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) {
    const base = ts.replace(/Z$/i, "").split(".")[0] ?? ts;
    return `${base}.0000000Z`;
  }
  const iso = d.toISOString();
  const m = /^(.+)T(.+)\.(\d+)Z$/.exec(iso);
  if (!m) return `${iso.slice(0, 19)}.0000000Z`;
  const frac = m[3]!.padEnd(7, "0").slice(0, 7);
  return `${m[1]}T${m[2]}.${frac}Z`;
}

type AzureApiErrorCode =
  | "ResourceNotFound"
  | "AuthorizationFailed"
  | "QuotaExceeded"
  | "ConflictError"
  | "BadRequest"
  | "InternalServerError"
  | "ThrottlingException"
  | "InvalidSubscriptionId";

function azureError(code: AzureApiErrorCode, message: string) {
  return { code, message, type: "azure" as const };
}

/** Nested ARM / provisioning diagnostics on admin failure paths */
function azureStatusMessageError(code: AzureApiErrorCode, message: string) {
  return { statusMessage: { error: { code, message } } };
}

function armFailureError(): AzureApiErrorCode {
  return rand([
    "QuotaExceeded",
    "ConflictError",
    "AuthorizationFailed",
    "BadRequest",
    "InternalServerError",
    "InvalidSubscriptionId",
  ] satisfies AzureApiErrorCode[]);
}

function armQuotaMessage(): string {
  return (
    "Operation could not be completed as it results in exceeding approved quota for " +
    rand(["SKU", "regional cores", "regional deployments"])
  );
}

function armErrorMessage(code: AzureApiErrorCode): string {
  const base: Record<AzureApiErrorCode, string> = {
    ResourceNotFound: "The specified resource does not exist.",
    AuthorizationFailed:
      "The client '...' does not have authorization to perform action '...' using scope authorization.",
    QuotaExceeded: armQuotaMessage(),
    ConflictError: "A conflict occurred while processing the PUT request.",
    BadRequest: "The request URI is invalid or malformed.",
    InternalServerError: "An unexpected error occurred while processing the request.",
    ThrottlingException: "Too many concurrent requests exceeded policy limits.",
    InvalidSubscriptionId: "The subscription identifier is invalid.",
  };
  return base[code];
}

function armAiFoundryHub(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.MachineLearningServices/workspaces/${name}`;
}

function armKustoCluster(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Kusto/clusters/${name}`;
}

function armAvdHostPool(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.DesktopVirtualization/hostpools/${name}`;
}

function armElasticSan(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.ElasticSan/elasticSans/${name}`;
}

function armManagedGrafana(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Dashboard/grafana/${name}`;
}

function armPrometheusWorkspace(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Monitor/accounts/${name}`;
}

function armDnsResolver(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Network/dnsResolvers/${name}`;
}

function armAppInsights(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Insights/components/${name}`;
}

function armDedicatedHsm(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.HardwareSecurityModules/dedicatedHSMs/${name}`;
}

function armVideoIndexer(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.VideoIndexer/accounts/${name}`;
}

const SVC_ML_WS = "Microsoft.MachineLearningServices/workspaces";

/** Azure AI Foundry hub — catalog, gateways, deployments (ARM: ML workspace hub). */
export function generateAiFoundryLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const hub = `hub-${randId(6).toLowerCase()}`;
  const resourceId = armAiFoundryHub(subscription.id, resourceGroup, hub);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "catalog",
    "gateway",
    "deployment",
    "fine_tune",
    "batch_inference",
    "endpoint_health_check",
  ] as const);

  if (variant === "catalog") {
    const model = rand(["gpt-4o", "phi-4", "mistral-large", "llama-3-70b"]);
    const props = {
      kind: "Hub",
      catalogOperation: rand(["registerModel", "listModelVersions", "deleteModel"]),
      modelName: model,
      sku: rand(["Standard", "Provisioned"]),
      statusCode: isErr ? rand([404, 409]) : rand([200, 202]),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "AzureML.ModelCatalog/Audit",
      category: "ModelCatalog",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      ...(isErr
        ? {
            error: azureError(
              props.statusCode === 404 ? "ResourceNotFound" : "ConflictError",
              props.statusCode === 404
                ? armErrorMessage("ResourceNotFound")
                : armErrorMessage("ConflictError")
            ),
          }
        : {}),
      cloud: azureCloud(region, subscription, SVC_ML_WS),
      azure: {
        ai_foundry: {
          hub,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "ModelCatalog",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(2e7, 5e9) },
      message: isErr
        ? `AI Foundry hub ${hub}: model catalog ${props.catalogOperation} failed for ${model}`
        : `AI Foundry hub ${hub}: catalog ${props.catalogOperation} on ${model}`,
    };
  }

  if (variant === "gateway") {
    const gw = `gw-${randId(5).toLowerCase()}`;
    const props = {
      gatewayName: gw,
      route: rand(["chat-completions", "embeddings", "batch-infer"]),
      tokensRouted: randInt(0, 2_500_000),
      throttleEvents: isErr ? randInt(12, 900) : randInt(0, 6),
      latencyP99Ms: isErr ? randInt(2200, 8000) : randInt(45, 420),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "AzureML.InferenceGateway/RequestAudit",
      category: "InferenceGateway",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "Throttled" : "OK",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      ...(isErr
        ? { error: azureError("ThrottlingException", armErrorMessage("ThrottlingException")) }
        : {}),
      cloud: azureCloud(region, subscription, SVC_ML_WS),
      azure: {
        ai_foundry: {
          hub,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "InferenceGateway",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(4e6, 3e9) },
      message: isErr
        ? `AI Foundry gateway ${gw}: route ${props.route} throttled`
        : `AI Foundry gateway ${gw}: ${props.route} traffic OK`,
    };
  }

  if (variant === "fine_tune") {
    const ftJob = `ft-${randId(6).toLowerCase()}`;
    const props = {
      fineTuneJob: ftJob,
      baseModel: rand(["gpt-4o-mini", "phi-3-mini", "mistral-medium"]),
      trainingEpochs: randInt(1, 8),
      status: isErr ? "Failed" : rand(["Succeeded", "Running"]),
      gpuHours: randFloatBounded(isErr ? 0.2 : 12.5, isErr ? 0.08 : 4.2),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "AzureML.FineTune/PipelineAudit",
      category: "FineTune",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.status,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      ...(isErr
        ? { error: azureError("InternalServerError", armErrorMessage("InternalServerError")) }
        : {}),
      cloud: azureCloud(region, subscription, SVC_ML_WS),
      azure: {
        ai_foundry: {
          hub,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "FineTune",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(2e8, 18e9) },
      message: isErr
        ? `AI Foundry hub ${hub}: fine-tune ${ftJob} failed`
        : `AI Foundry hub ${hub}: fine-tune ${ftJob} ${props.status}`,
    };
  }

  if (variant === "batch_inference") {
    const batchId = `batch-${randId(8).toLowerCase()}`;
    const props = {
      batchInferenceId: batchId,
      datasetUri: `https://st${randId(4)}.blob.core.windows.net/input/${batchId}.jsonl`,
      completedItems: isErr ? randInt(0, 200) : randInt(1200, 500_000),
      failedItems: isErr ? randInt(400, 12_000) : randInt(0, 18),
      maxConcurrency: randInt(10, 200),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "AzureML.BatchInference/Execution",
      category: "BatchInference",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "PartialFailure" : "Completed",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      ...(isErr ? { error: azureError("BadRequest", armErrorMessage("BadRequest")) } : {}),
      cloud: azureCloud(region, subscription, SVC_ML_WS),
      azure: {
        ai_foundry: {
          hub,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "BatchInference",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(4e8, 24e9) },
      message: isErr
        ? `AI Foundry hub ${hub}: batch inference ${batchId} partial failure`
        : `AI Foundry hub ${hub}: batch inference ${batchId} completed`,
    };
  }

  if (variant === "endpoint_health_check") {
    const epName = `ep-${randId(5).toLowerCase()}`;
    const props = {
      inferenceEndpoint: epName,
      probeLatencyMs: isErr ? randInt(850, 9200) : randInt(8, 180),
      healthStatus: isErr ? "Unhealthy" : rand(["Healthy", "Degraded"]),
      replicasReady: randInt(isErr ? 0 : 1, isErr ? 1 : 8),
      lastDeploymentId: `dep-${randId(6).toLowerCase()}`,
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "AzureML.InferenceEndpoint/HealthProbe",
      category: "EndpointAvailability",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.healthStatus,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      ...(isErr
        ? {
            error: azureError(
              "ResourceNotFound",
              `${armErrorMessage("ResourceNotFound")} Endpoint '${epName}'.`
            ),
          }
        : {}),
      cloud: azureCloud(region, subscription, SVC_ML_WS),
      azure: {
        ai_foundry: {
          hub,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "EndpointAvailability",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e6, 8e8) },
      message: isErr
        ? `AI Foundry hub ${hub}: endpoint ${epName} health probe failed`
        : `AI Foundry hub ${hub}: endpoint ${epName} probe ${props.healthStatus}`,
    };
  }

  const dep = `dep-${randId(5).toLowerCase()}`;
  const armCode = armFailureError();
  const props = {
    deploymentName: dep,
    model: rand(["gpt-4o-mini", "mistral-medium", "codellama"]),
    provisioningState: isErr ? "Failed" : rand(["Succeeded", "Updating"]),
    replicaCount: randInt(1, 12),
    quotaSku: rand(["GlobalStandard", "ProvisionedManaged"]),
    ...(isErr ? azureStatusMessageError(armCode, armErrorMessage(armCode)) : {}),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.MachineLearningServices/workspaces/deployments/write",
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.provisioningState,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: props,
    ...(isErr ? { error: azureError(armCode, armErrorMessage(armCode)) } : {}),
    cloud: azureCloud(region, subscription, SVC_ML_WS),
    azure: {
      ai_foundry: {
        hub,
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: "Deployment",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(6e7, 14e9) },
    message: isErr
      ? `AI Foundry hub ${hub}: deployment ${dep} failed`
      : `AI Foundry hub ${hub}: deployment ${dep} ${props.provisioningState}`,
  };
}

/** Azure Data Explorer (Kusto) — ingestion and queries. */
export function generateDataExplorerLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const cluster = `adx-${randId(5).toLowerCase()}`;
  const resourceId = armKustoCluster(subscription.id, resourceGroup, cluster);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "ingest",
    "query",
    "admin",
    "streaming_ingestion",
    "materialized_view",
    "follower_database",
  ] as const);

  if (variant === "ingest") {
    const props = {
      database: rand(["telemetry", "security", "finance"]),
      table: rand(["events", "metrics_raw", "flows"]),
      blobsReceived: randInt(0, 55_000),
      rejectedRows: isErr ? randInt(50, 120_000) : randInt(0, 120),
      ingestionLatencySeconds: isErr ? randInt(180, 900) : randInt(4, 95),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ADX.DataIngest/BatchReceive",
      category: "Ingestion",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "PartialFailure" : "Completed",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      ...(isErr ? { error: azureError("BadRequest", armErrorMessage("BadRequest")) } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Kusto/clusters"),
      azure: {
        data_explorer: {
          cluster,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Ingestion",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(8e6, 6e9) },
      message: isErr
        ? `ADX cluster ${cluster}: ingestion rejected rows=${props.rejectedRows}`
        : `ADX cluster ${cluster}: ingestion batch OK`,
    };
  }

  if (variant === "query") {
    const props = {
      queryHash: randId(16),
      workloadGroup: rand(["default", "analytics", "burst"]),
      cpuSeconds: randFloatBounded(isErr ? 420 : 85, isErr ? 120 : 35),
      rowsReturned: isErr ? 0 : randInt(10, 12_000_000),
      cacheHitRatio: isErr ? randFloatBounded(0.12, 0.08) : randFloatBounded(0.72, 0.18),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ADX.Query/Execution",
      category: "Query",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "Timeout" : "Completed",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      ...(isErr
        ? { error: azureError("ThrottlingException", armErrorMessage("ThrottlingException")) }
        : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Kusto/clusters"),
      azure: {
        data_explorer: {
          cluster,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Query",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e6, 9e9) },
      message: isErr
        ? `ADX cluster ${cluster}: query timed out`
        : `ADX cluster ${cluster}: query returned ${props.rowsReturned} rows`,
    };
  }

  if (variant === "streaming_ingestion") {
    const props = {
      ingestionKind: "StreamingIngest",
      streamName: rand(["device-telemetry", "security-events", "finance-rt"]),
      blobsPending: isErr ? randInt(80, 4200) : randInt(0, 45),
      streamLatencySeconds: isErr ? randInt(45, 520) : randInt(1, 28),
      throughputMBps: randFloatBounded(isErr ? 12 : 180, isErr ? 8 : 55),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ADX.StreamingIngest/DataReceived",
      category: "StreamingIngestion",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "Backlog" : "Flowing",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      ...(isErr
        ? {
            error: azureError(
              "InternalServerError",
              "Streaming ingestion failed due to partition resource limits."
            ),
          }
        : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Kusto/clusters"),
      azure: {
        data_explorer: {
          cluster,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "StreamingIngestion",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(3e6, 4e9) },
      message: isErr
        ? `ADX cluster ${cluster}: streaming backlog on ${props.streamName}`
        : `ADX cluster ${cluster}: streaming ingestion healthy`,
    };
  }

  if (variant === "materialized_view") {
    const mvName = `mv_${rand(["agg", "rollup", "facts"])}_${randId(4)}`;
    const props = {
      materializedView: mvName,
      sourceTable: rand(["events", "raw_metrics", "sessions"]),
      refreshLatencySeconds: isErr ? randInt(600, 9200) : randInt(30, 380),
      extentsRebuilt: isErr ? randInt(2, 220) : randInt(0, 12),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ADX.MaterializedView/RefreshAudit",
      category: "MaterializedView",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "RefreshFailed" : "OK",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      ...(isErr ? { error: azureError("ConflictError", armErrorMessage("ConflictError")) } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Kusto/clusters"),
      azure: {
        data_explorer: {
          cluster,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "MaterializedView",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(4e8, 12e9) },
      message: isErr
        ? `ADX cluster ${cluster}: MV ${mvName} refresh failed`
        : `ADX cluster ${cluster}: MV ${mvName} refreshed`,
    };
  }

  if (variant === "follower_database") {
    const followerCluster = `${cluster}-follower-${randId(3)}`;
    const props = {
      leaderResourceId: resourceId,
      followerCluster,
      synchronizationLagSeconds: isErr ? randInt(120, 3600) : randInt(2, 45),
      followerState: isErr ? "Detached" : rand(["CaughtUp", "CatchingUp"]),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ADX.FollowerDatabase/SyncAudit",
      category: "FollowerDatabase",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.followerState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      ...(isErr
        ? {
            error: azureError("AuthorizationFailed", armErrorMessage("AuthorizationFailed")),
          }
        : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Kusto/clusters"),
      azure: {
        data_explorer: {
          cluster,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "FollowerDatabase",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e8, 9e9) },
      message: isErr
        ? `ADX cluster ${cluster}: follower ${followerCluster} sync degraded`
        : `ADX cluster ${cluster}: follower ${followerCluster} ${props.followerState}`,
    };
  }

  const armCode = armFailureError();
  const props = {
    operation: isErr ? "ScaledownFailed" : rand(["Scaling", "TrustedExternalNetworks"]),
    targetSku: rand(["Standard_E16ads_v5", "Standard_L16as_v3"]),
    nodeCount: randInt(2, 40),
    statusCode: isErr ? rand([409, 500]) : rand([200, 202]),
    ...(isErr ? azureStatusMessageError(armCode, armErrorMessage(armCode)) : {}),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.Kusto/clusters/write",
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: String(props.statusCode),
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: props,
    ...(isErr ? { error: azureError(armCode, armErrorMessage(armCode)) } : {}),
    cloud: azureCloud(region, subscription, "Microsoft.Kusto/clusters"),
    azure: {
      data_explorer: {
        cluster,
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(4e8, 11e9) },
    message: isErr
      ? `ADX cluster ${cluster}: admin operation failed`
      : `ADX cluster ${cluster}: ${props.operation}`,
  };
}

function randFloatBounded(center: number, spread: number): number {
  const v = center + (Math.random() - 0.5) * 2 * spread;
  return Math.round(Math.max(0, v) * 100) / 100;
}

/** Azure Virtual Desktop — host pools and sessions. */
export function generateVirtualDesktopLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const pool = `hp-${randId(5).toLowerCase()}`;
  const resourceId = armAvdHostPool(subscription.id, resourceGroup, pool);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "session",
    "host",
    "admin",
    "scaling_plan",
    "application_group",
    "diagnostics",
  ] as const);

  if (variant === "session") {
    const props = {
      userPrincipalName: `user${randInt(1000, 9999)}@${rand(["contoso.com", "fabrikam.net"])}`,
      sessionState: isErr ? "DisconnectedError" : rand(["Active", "Disconnected"]),
      fsLogixProfileSeconds: randInt(4, 180),
      gatewayRegion: region,
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "AVD.Connection/SessionBroker",
      category: "Connection",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.sessionState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      ...(isErr
        ? { error: azureError("ResourceNotFound", armErrorMessage("ResourceNotFound")) }
        : {}),
      cloud: azureCloud(region, subscription, "Microsoft.DesktopVirtualization/hostpools"),
      azure: {
        virtual_desktop: {
          host_pool: pool,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Connection",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(2e6, 2e9) },
      message: isErr
        ? `AVD pool ${pool}: session failed for ${props.userPrincipalName}`
        : `AVD pool ${pool}: session ${props.sessionState}`,
    };
  }

  if (variant === "host") {
    const props = {
      sessionHostName: `sh-${randId(4).toLowerCase()}.${region}.internal.cloudapp.azure.com`,
      agentVersion: rand(["1.0.8908.1600", "1.0.9027.1700"]),
      healthState: isErr ? "NeedsAssistance" : rand(["Available", "UnavailableDrain"]),
      pendingSessions: randInt(0, isErr ? 80 : 18),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "AVD.HostPool/HostRegistration",
      category: "HostRegistration",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.healthState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      ...(isErr
        ? { error: azureError("InternalServerError", armErrorMessage("InternalServerError")) }
        : {}),
      cloud: azureCloud(region, subscription, "Microsoft.DesktopVirtualization/hostpools"),
      azure: {
        virtual_desktop: {
          host_pool: pool,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "HostRegistration",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(3e6, 4e9) },
      message: isErr
        ? `AVD host ${props.sessionHostName}: health ${props.healthState}`
        : `AVD pool ${pool}: host ${props.sessionHostName} registered`,
    };
  }

  if (variant === "scaling_plan") {
    const planId = `sp-${randId(6).toLowerCase()}`;
    const props = {
      scalingPlanId: planId,
      timezone: rand(["Eastern Standard Time", "UTC", "W. Europe Standard Time"]),
      peakHostCount: randInt(8, 220),
      offPeakReducedPercent: randInt(10, 65),
      scheduleEvaluation: isErr ? "Conflict" : rand(["RampUpMet", "RampDownMet"]),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "AVD.ScalingPlan/ScheduleEvaluation",
      category: "ScalingPlan",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.scheduleEvaluation,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      ...(isErr ? { error: azureError("ConflictError", armErrorMessage("ConflictError")) } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.DesktopVirtualization/hostpools"),
      azure: {
        virtual_desktop: {
          host_pool: pool,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "ScalingPlan",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(4e6, 3e9) },
      message: isErr
        ? `AVD pool ${pool}: scaling plan ${planId} schedule conflict`
        : `AVD pool ${pool}: scaling plan ${planId} evaluated`,
    };
  }

  if (variant === "application_group") {
    const props = {
      applicationGroupType: rand(["Desktop", "RemoteApp"]),
      appGroupId: `ag-${randId(8).toLowerCase()}`,
      assignedUsers: randInt(120, isErr ? 400 : 9800),
      registrationTokenState: isErr ? "Expired" : rand(["Valid", "Refreshing"]),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.DesktopVirtualization/applicationGroups/write",
      category: "ApplicationGroup",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.registrationTokenState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      ...(isErr
        ? {
            error: azureError("AuthorizationFailed", armErrorMessage("AuthorizationFailed")),
          }
        : {}),
      cloud: azureCloud(region, subscription, "Microsoft.DesktopVirtualization/hostpools"),
      azure: {
        virtual_desktop: {
          host_pool: pool,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "ApplicationGroup",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(6e7, 11e9) },
      message: isErr
        ? `AVD pool ${pool}: application group RBAC violation`
        : `AVD pool ${pool}: application group updated`,
    };
  }

  if (variant === "diagnostics") {
    const diagId = `diag-${randId(10)}`;
    const props = {
      diagnosticWorkspace: `law-${randId(5)}`,
      logCategory: rand(["Checkpoint", "Error", "Management"]),
      egressBytesLastHour: isErr ? randInt(0, 4200) : randInt(12_000, 9_200_000),
      droppedEventsCount: isErr ? randInt(400, 28_000) : randInt(0, 80),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "AVD.Diagnostics/AgentForwarder",
      category: "Diagnostics",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "LogAnalyticsUnavailable" : "OK",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      ...(isErr
        ? {
            error: azureError(
              "ThrottlingException",
              "Diagnostics pipeline throttled egress to workspace."
            ),
          }
        : {}),
      cloud: azureCloud(region, subscription, "Microsoft.DesktopVirtualization/hostpools"),
      azure: {
        virtual_desktop: {
          host_pool: pool,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Diagnostics",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(2e6, 28e9) },
      message: isErr
        ? `AVD pool ${pool}: diagnostics ${diagId} failed (${props.logCategory})`
        : `AVD pool ${pool}: diagnostics flowing`,
    };
  }

  const armCode = armFailureError();
  const props = {
    operation: rand([
      "Microsoft.DesktopVirtualization/hostpools/write",
      "Microsoft.DesktopVirtualization/hostpools/delete",
    ]),
    provisioningState: isErr ? "Failed" : rand(["Succeeded", "Updating"]),
    maxSessionLimit: randInt(10, 999),
    ...(isErr ? azureStatusMessageError(armCode, armErrorMessage(armCode)) : {}),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: props.operation,
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.provisioningState,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: props,
    ...(isErr ? { error: azureError(armCode, armErrorMessage(armCode)) } : {}),
    cloud: azureCloud(region, subscription, "Microsoft.DesktopVirtualization/hostpools"),
    azure: {
      virtual_desktop: {
        host_pool: pool,
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(5e7, 8e9) },
    message: isErr
      ? `AVD pool ${pool}: control plane error`
      : `AVD pool ${pool}: ${props.provisioningState}`,
  };
}

/** Azure Elastic SAN — iSCSI volumes and capacity. */
export function generateElasticSanLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const san = `esan-${randId(5).toLowerCase()}`;
  const resourceId = armElasticSan(subscription.id, resourceGroup, san);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "volume",
    "iscsi",
    "admin",
    "snapshot",
    "performance_tier_change",
    "network_rule",
  ] as const);

  if (variant === "volume") {
    const props = {
      volumeGroup: rand(["vg-sql", "vg-k8s", "vg-shared"]),
      volumeName: `vol-${randId(4).toLowerCase()}`,
      sizeTiB: randInt(4, 64),
      iopsConsumedPercent: randFloatBounded(isErr ? 96 : 54, isErr ? 6 : 22),
      provisioningState: isErr ? "Failed" : rand(["Succeeded", "Updating"]),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ElasticSan.Volume/Provision",
      category: "Volume",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.provisioningState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      ...(isErr ? { error: azureError("QuotaExceeded", armErrorMessage("QuotaExceeded")) } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.ElasticSan/elasticSans"),
      azure: {
        elastic_san: {
          elastic_san: san,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Volume",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(9e7, 12e9) },
      message: isErr
        ? `Elastic SAN ${san}: volume provision failed`
        : `Elastic SAN ${san}: volume ${props.volumeName} OK`,
    };
  }

  if (variant === "iscsi") {
    const props = {
      initiatorIp: randIp(),
      lunId: randInt(0, 7),
      bytesTransferred: randInt(10_000_000, 900_000_000_000),
      scsiSenseKey: isErr ? rand(["0x06", "0x0b"]) : "None",
      latencyMs: isErr ? randInt(800, 9000) : randInt(2, 180),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ElasticSan.Target/IOAudit",
      category: "IO",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.scsiSenseKey,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      ...(isErr
        ? { error: azureError("InternalServerError", armErrorMessage("InternalServerError")) }
        : {}),
      cloud: azureCloud(region, subscription, "Microsoft.ElasticSan/elasticSans"),
      azure: {
        elastic_san: {
          elastic_san: san,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "IO",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e6, 5e8) },
      message: isErr
        ? `Elastic SAN ${san}: iSCSI error LUN ${props.lunId}`
        : `Elastic SAN ${san}: iSCSI IO OK`,
    };
  }

  if (variant === "snapshot") {
    const snapName = `snap-${randId(8)}`;
    const props = {
      snapshotName: snapName,
      snapshotType: rand(["Incremental", "Full"]),
      sourceVolumeGroup: rand(["vg-sql", "vg-k8s"]),
      completedPercent: isErr ? randInt(0, 40) : 100,
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ElasticSan.Snapshot/Create",
      category: "Snapshot",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "Incomplete" : "Succeeded",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      ...(isErr
        ? {
            error: azureError(
              "ConflictError",
              "Cannot create snapshot while another snapshot operation is in progress."
            ),
          }
        : {}),
      cloud: azureCloud(region, subscription, "Microsoft.ElasticSan/elasticSans"),
      azure: {
        elastic_san: {
          elastic_san: san,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Snapshot",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(12e8, 20e9) },
      message: isErr
        ? `Elastic SAN ${san}: snapshot ${snapName} failed`
        : `Elastic SAN ${san}: snapshot`,
    };
  }

  if (variant === "performance_tier_change") {
    const props = {
      fromSku: rand(["Standard_LRS", "Premium_ZRS"]),
      toSku: rand(["Premium_LRS", "Standard_LRS"]),
      estimatedImpactMinutes: isErr ? randInt(0, 5) : randInt(8, 90),
      dataPlaneReadOnly: isErr || Math.random() < 0.2,
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ElasticSan.SkuChange/Execution",
      category: "PerformanceTier",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "RolledBack" : "Committed",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      ...(isErr ? { error: azureError("BadRequest", armErrorMessage("BadRequest")) } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.ElasticSan/elasticSans"),
      azure: {
        elastic_san: {
          elastic_san: san,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "PerformanceTier",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(18e8, 30e9) },
      message: isErr
        ? `Elastic SAN ${san}: performance tier rollback`
        : `Elastic SAN ${san}: tier migrated`,
    };
  }

  if (variant === "network_rule") {
    const props = {
      subnetCidr: `10.${randInt(20, 180)}.${randInt(0, 255)}.0/24`,
      ruleAction: isErr ? "Denied" : rand(["Allow", "Audit"]),
      nsgRulePriority: randInt(1000, 4096),
      iSCSILockdownEnforced: !isErr,
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ElasticSan.Network/AccessPolicyAudit",
      category: "NetworkRule",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.ruleAction,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      ...(isErr
        ? { error: azureError("AuthorizationFailed", armErrorMessage("AuthorizationFailed")) }
        : {}),
      cloud: azureCloud(region, subscription, "Microsoft.ElasticSan/elasticSans"),
      azure: {
        elastic_san: {
          elastic_san: san,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "NetworkRule",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(8e7, 3e9) },
      message: isErr
        ? `Elastic SAN ${san}: network rule denial for subnet ${props.subnetCidr}`
        : `Elastic SAN ${san}: network rules OK`,
    };
  }

  const armCode = armFailureError();
  const props = {
    skuTier: rand(["Standard_LRS", "Premium_LRS"]),
    totalCapacityTiB: randInt(16, 512),
    statusCode: isErr ? rand([400, 409]) : rand([200, 202]),
    ...(isErr ? azureStatusMessageError(armCode, armErrorMessage(armCode)) : {}),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.ElasticSan/elasticSans/write",
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: String(props.statusCode),
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: props,
    ...(isErr ? { error: azureError(armCode, armErrorMessage(armCode)) } : {}),
    cloud: azureCloud(region, subscription, "Microsoft.ElasticSan/elasticSans"),
    azure: {
      elastic_san: {
        elastic_san: san,
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(4e8, 9e9) },
    message: isErr
      ? `Elastic SAN ${san}: ARM update failed`
      : `Elastic SAN ${san}: SKU ${props.skuTier}`,
  };
}

/** Azure Managed Grafana — dashboards and API access. */
export function generateManagedGrafanaLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const inst = `amg-${randId(5).toLowerCase()}`;
  const resourceId = armManagedGrafana(subscription.id, resourceGroup, inst);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "api",
    "dashboard",
    "admin",
    "plugin_install",
    "data_source_test",
    "team_sync",
  ] as const);

  if (variant === "api") {
    const props = {
      apiPath: rand(["/api/ds/query", "/api/search", "/api/dashboards/uid"]),
      method: rand(["GET", "POST"]),
      statusCode: isErr ? rand([401, 429, 500]) : rand([200, 204]),
      userAgent: rand(["Grafana/10.4.2", "curl/8.5.0"]),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Grafana.HttpRequest",
      category: "Application",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      ...(isErr
        ? {
            error: azureError(
              props.statusCode === 401
                ? "AuthorizationFailed"
                : props.statusCode === 429
                  ? "ThrottlingException"
                  : "InternalServerError",
              props.statusCode === 401
                ? armErrorMessage("AuthorizationFailed")
                : props.statusCode === 429
                  ? armErrorMessage("ThrottlingException")
                  : armErrorMessage("InternalServerError")
            ),
          }
        : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Dashboard/grafana"),
      azure: {
        managed_grafana: {
          instance: inst,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "API",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(2e6, 2e9) },
      message: isErr
        ? `Managed Grafana ${inst}: API ${props.apiPath} failed`
        : `Managed Grafana ${inst}: ${props.method} ${props.apiPath}`,
    };
  }

  if (variant === "dashboard") {
    const props = {
      dashboardUid: randId(8).toLowerCase(),
      folder: rand(["Platform", "SRE", "Security"]),
      panelQueries: randInt(4, 120),
      refreshInterval: rand(["30s", "1m", "5m"]),
      snapshotExport: isErr,
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Grafana.DashboardAudit",
      category: "Audit",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "Forbidden" : "OK",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      ...(isErr
        ? {
            error: azureError(
              "AuthorizationFailed",
              "Dashboard snapshot export blocked by organization policy."
            ),
          }
        : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Dashboard/grafana"),
      azure: {
        managed_grafana: {
          instance: inst,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Dashboard",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(3e6, 4e9) },
      message: isErr
        ? `Managed Grafana ${inst}: dashboard snapshot denied`
        : `Managed Grafana ${inst}: dashboard viewed`,
    };
  }

  if (variant === "plugin_install") {
    const props = {
      pluginId: rand([
        "amazon-cloudwatch-grafana-datasource",
        "grafana-clock-panel",
        "grafana-k6-app",
      ]),
      pluginVersion: rand(["1.2.3", "2.0.0-beta1"]),
      provisioningSource: rand(["EnterpriseCatalog", "CustomUrl"]),
      installState: isErr ? "Rollback" : rand(["Installing", "Installed"]),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Grafana.Plugin/Provisioning",
      category: "PluginLifecycle",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.installState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      ...(isErr ? { error: azureError("BadRequest", armErrorMessage("BadRequest")) } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Dashboard/grafana"),
      azure: {
        managed_grafana: {
          instance: inst,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "PluginInstall",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(8e7, 5e9) },
      message: isErr
        ? `Managed Grafana ${inst}: plugin ${props.pluginId} install failed`
        : `Managed Grafana ${inst}: plugin installed`,
    };
  }

  if (variant === "data_source_test") {
    const props = {
      dataSourceName: rand(["AzureMonitor", "Prometheus-Amw", "Loki-enterprise"]),
      dataSourceUid: randId(12).toLowerCase(),
      testLatencyMs: isErr ? randInt(9200, 45_000) : randInt(12, 280),
      lastErrorDigest: isErr ? "connection reset by peer" : "",
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Grafana.DataSource/TestConnection",
      category: "DataSourceHealth",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "Unreachable" : "OK",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      ...(isErr
        ? { error: azureError("ResourceNotFound", armErrorMessage("ResourceNotFound")) }
        : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Dashboard/grafana"),
      azure: {
        managed_grafana: {
          instance: inst,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "DataSourceTest",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e7, 2e9) },
      message: isErr
        ? `Managed Grafana ${inst}: datasource ${props.dataSourceName} test failed`
        : `Managed Grafana ${inst}: datasource healthy`,
    };
  }

  if (variant === "team_sync") {
    const props = {
      enterpriseAppId: randUUID(),
      teamCount: randInt(4, isErr ? 12 : 85),
      lastSyncLagSeconds: isErr ? randInt(1800, 7200) : randInt(2, 120),
      orphanedMappings: isErr ? randInt(8, 90) : randInt(0, 4),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Grafana.IdP/TeamsSyncAudit",
      category: "IdentitySync",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "DriftDetected" : "OK",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      ...(isErr ? { error: azureError("ConflictError", armErrorMessage("ConflictError")) } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Dashboard/grafana"),
      azure: {
        managed_grafana: {
          instance: inst,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "TeamSync",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(4e6, 48e9) },
      message: isErr
        ? `Managed Grafana ${inst}: team sync drift from Entra ID`
        : `Managed Grafana ${inst}: team sync`,
    };
  }

  const armCode = armFailureError();
  const props = {
    operation: rand(["Microsoft.Dashboard/grafana/write", "Microsoft.Dashboard/grafana/delete"]),
    sku: rand(["Standard", "Essential"]),
    statusCode: isErr ? rand([403, 409]) : rand([200, 202]),
    ...(isErr ? azureStatusMessageError(armCode, armErrorMessage(armCode)) : {}),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: props.operation,
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: String(props.statusCode),
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: props,
    ...(isErr ? { error: azureError(armCode, armErrorMessage(armCode)) } : {}),
    cloud: azureCloud(region, subscription, "Microsoft.Dashboard/grafana"),
    azure: {
      managed_grafana: {
        instance: inst,
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(5e7, 9e9) },
    message: isErr
      ? `Managed Grafana ${inst}: control plane failed`
      : `Managed Grafana ${inst}: ${props.operation}`,
  };
}

/** Azure Monitor managed Prometheus — remote write / scrape. */
export function generateManagedPrometheusLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const acct = `amw-${randId(5).toLowerCase()}`;
  const resourceId = armPrometheusWorkspace(subscription.id, resourceGroup, acct);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "remote_write",
    "query",
    "admin",
    "scrape_config",
    "alerting_rule",
    "federation",
  ] as const);

  if (variant === "remote_write") {
    const props = {
      samplesReceived: randInt(100_000, 12_000_000_000),
      exemplarsDropped: isErr ? randInt(500, 900_000) : randInt(0, 800),
      scrapeFailures: isErr ? randInt(40, 9000) : randInt(0, 120),
      prometheusEndpoint: `${acct}.${region}.prometheus.monitor.azure.com`,
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "MonitorWorkspace.RemoteWrite/Ingest",
      category: "Ingestion",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "Rejected" : "Accepted",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      ...(isErr ? { error: azureError("QuotaExceeded", armErrorMessage("QuotaExceeded")) } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Monitor/accounts"),
      azure: {
        managed_prometheus: {
          workspace: acct,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "RemoteWrite",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(4e6, 5e9) },
      message: isErr
        ? `Prometheus workspace ${acct}: remote write rejected`
        : `Prometheus workspace ${acct}: samples=${props.samplesReceived}`,
    };
  }

  if (variant === "query") {
    const props = {
      queryEngine: rand(["promql-v2", "grafanacloud-proxy"]),
      cpuSeconds: randFloatBounded(isErr ? 95 : 22, isErr ? 40 : 12),
      concurrentQueries: randInt(2, isErr ? 180 : 48),
      timeoutMs: isErr ? randInt(25_000, 90_000) : randInt(80, 4200),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "MonitorWorkspace.Query/Audit",
      category: "Query",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "Timeout" : "OK",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      ...(isErr
        ? { error: azureError("ThrottlingException", armErrorMessage("ThrottlingException")) }
        : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Monitor/accounts"),
      azure: {
        managed_prometheus: {
          workspace: acct,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Query",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(3e6, 8e9) },
      message: isErr
        ? `Prometheus workspace ${acct}: query exceeded limits`
        : `Prometheus workspace ${acct}: query completed`,
    };
  }

  if (variant === "scrape_config") {
    const props = {
      jobName: rand(["kubernetes-pods", "node-exporter", "cadvisor"]),
      targetsDiscovered: isErr ? randInt(0, 40) : randInt(80, 4200),
      relabelErrors: isErr ? randInt(4, 900) : randInt(0, 12),
      scrapeIntervalSeconds: rand([15, 30, 60]),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "MonitorWorkspace.ScrapeConfig/Reload",
      category: "ScrapeConfig",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "InvalidConfig" : "Applied",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      ...(isErr ? { error: azureError("BadRequest", armErrorMessage("BadRequest")) } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Monitor/accounts"),
      azure: {
        managed_prometheus: {
          workspace: acct,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "ScrapeConfig",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(3e7, 4e9) },
      message: isErr
        ? `Prometheus workspace ${acct}: scrape config reload failed`
        : `Prometheus workspace ${acct}: scrape jobs updated`,
    };
  }

  if (variant === "alerting_rule") {
    const props = {
      ruleGroup: rand(["k8s.rules", "platform.slo", "network.alerts"]),
      rulesEvaluated: randInt(12, isErr ? 80 : 420),
      firingAlerts: isErr ? randInt(40, 900) : randInt(0, 12),
      evaluationDurationMs: isErr ? randInt(8000, 45_000) : randInt(120, 2400),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "MonitorWorkspace.Alerting/Evaluation",
      category: "Alerting",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "EvaluationError" : "OK",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      ...(isErr
        ? { error: azureError("InternalServerError", armErrorMessage("InternalServerError")) }
        : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Monitor/accounts"),
      azure: {
        managed_prometheus: {
          workspace: acct,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Alerting",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(2e6, 6e9) },
      message: isErr
        ? `Prometheus workspace ${acct}: rule group ${props.ruleGroup} evaluation failed`
        : `Prometheus workspace ${acct}: alerting evaluation OK`,
    };
  }

  if (variant === "federation") {
    const props = {
      upstreamWorkspace: `amw-peer-${randId(4)}`,
      matchSelector: rand(['{job="prometheus"}', '{cluster="west"}']),
      samplesForwarded: isErr ? randInt(0, 500) : randInt(50_000, 12_000_000),
      handshakeMs: isErr ? randInt(5000, 28_000) : randInt(8, 220),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "MonitorWorkspace.Federation/Pull",
      category: "Federation",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "UpstreamUnavailable" : "OK",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      ...(isErr
        ? {
            error: azureError(
              "ResourceNotFound",
              "Federation upstream workspace could not be resolved."
            ),
          }
        : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Monitor/accounts"),
      azure: {
        managed_prometheus: {
          workspace: acct,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Federation",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(4e6, 8e9) },
      message: isErr
        ? `Prometheus workspace ${acct}: federation pull failed`
        : `Prometheus workspace ${acct}: federation samples=${props.samplesForwarded}`,
    };
  }

  const armCode = armFailureError();
  const props = {
    operation: rand(["Microsoft.Monitor/accounts/write", "Microsoft.Monitor/accounts/delete"]),
    dataIngestion: rand(["Enabled", "Disabled"]),
    statusCode: isErr ? rand([400, 409]) : rand([200, 202]),
    ...(isErr ? azureStatusMessageError(armCode, armErrorMessage(armCode)) : {}),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: props.operation,
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: String(props.statusCode),
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: props,
    ...(isErr ? { error: azureError(armCode, armErrorMessage(armCode)) } : {}),
    cloud: azureCloud(region, subscription, "Microsoft.Monitor/accounts"),
    azure: {
      managed_prometheus: {
        workspace: acct,
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(6e7, 11e9) },
    message: isErr
      ? `Prometheus workspace ${acct}: ARM failed`
      : `Prometheus workspace ${acct}: ${props.operation}`,
  };
}

/** Azure DNS Private Resolver — inbound/outbound endpoints. */
export function generateDnsPrivateResolverLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const resolver = `pvdns-${randId(5).toLowerCase()}`;
  const resourceId = armDnsResolver(subscription.id, resourceGroup, resolver);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "forward",
    "conditional",
    "admin",
    "inbound_health",
    "vnet_integration",
    "security_policy",
  ] as const);

  if (variant === "forward") {
    const props = {
      outboundEndpoint: `oe-${randId(4).toLowerCase()}`,
      forwardedQueries: randInt(500, 9_000_000),
      upstreamDns: rand(["10.20.4.4", "168.63.129.16"]),
      nxDomainRatePercent: randFloatBounded(isErr ? 38 : 6, isErr ? 22 : 4),
      latencyMs: isErr ? randInt(800, 3500) : randInt(2, 95),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "DnsResolver.Forwarding/Audit",
      category: "Forwarding",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "UpstreamTimeout" : "OK",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      ...(isErr
        ? { error: azureError("InternalServerError", armErrorMessage("InternalServerError")) }
        : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/dnsResolvers"),
      azure: {
        dns_private_resolver: {
          resolver,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Forwarding",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e6, 2e9) },
      message: isErr
        ? `DNS Private Resolver ${resolver}: forward upstream timeout`
        : `DNS Private Resolver ${resolver}: forwarded ${props.forwardedQueries} queries`,
    };
  }

  if (variant === "conditional") {
    const props = {
      rulesetName: `rs-${rand(["corp", "prod", "dmz"])}`,
      fqdnMatched: rand(["_ldap._tcp.corp.local", "api.internal.contoso"]),
      action: rand(["Rewrite", "Forward"]),
      matched: !isErr,
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "DnsResolver.RuleEngine/Match",
      category: "Rules",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.matched ? "Hit" : "Miss",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      ...(isErr ? { error: azureError("BadRequest", armErrorMessage("BadRequest")) } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/dnsResolvers"),
      azure: {
        dns_private_resolver: {
          resolver,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Rules",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(8e5, 15e8) },
      message: isErr
        ? `DNS Private Resolver ${resolver}: ruleset evaluation error`
        : `DNS Private Resolver ${resolver}: rule matched ${props.fqdnMatched}`,
    };
  }

  if (variant === "inbound_health") {
    const iep = `in-${randId(5).toLowerCase()}`;
    const props = {
      inboundEndpoint: iep,
      privateIp: `10.${randInt(40, 200)}.${randInt(1, 250)}.${randInt(10, 240)}`,
      tcpProbeSuccessPercent: randFloatBounded(isErr ? 12 : 99.8, isErr ? 18 : 0.08),
      lastFailureReason: isErr ? rand(["ENOBUFS", "NSG_DENY"]) : "",
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "DnsResolver.InboundEndpoint/Health",
      category: "InboundEndpoint",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "Unreachable" : "Healthy",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      ...(isErr
        ? { error: azureError("ResourceNotFound", armErrorMessage("ResourceNotFound")) }
        : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/dnsResolvers"),
      azure: {
        dns_private_resolver: {
          resolver,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "InboundHealth",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(9e6, 2e9) },
      message: isErr
        ? `DNS Private Resolver ${resolver}: inbound endpoint ${iep} unhealthy`
        : `DNS Private Resolver ${resolver}: inbound ${iep} healthy`,
    };
  }

  if (variant === "vnet_integration") {
    const props = {
      linkedVnetId: `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/virtualNetworks/vnet-hub-${randId(4)}`,
      dnsHostedZoneDelegates: randInt(4, isErr ? 12 : 28),
      linkState: isErr ? "Failed" : rand(["Connected", "Updating"]),
      registrationEnabled: rand([true, false]),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "DnsResolver.VirtualNetworkLink/SyncAudit",
      category: "VNetIntegration",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.linkState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      ...(isErr ? { error: azureError("ConflictError", armErrorMessage("ConflictError")) } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/dnsResolvers"),
      azure: {
        dns_private_resolver: {
          resolver,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "VNetLink",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(4e7, 8e9) },
      message: isErr
        ? `DNS Private Resolver ${resolver}: VNet link sync failed`
        : `DNS Private Resolver ${resolver}: link OK`,
    };
  }

  if (variant === "security_policy") {
    const props = {
      tlsInspection: rand(["Preferred", "Required"]),
      queryRateLimitBurst: randInt(200, isErr ? 800 : 4000),
      policyViolations: isErr ? randInt(900, 80_000) : randInt(0, 400),
      blocklistedClients: isErr ? randInt(120, 900) : randInt(0, 45),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "DnsResolver.SecurityPolicy/EvidenceAudit",
      category: "SecurityPolicy",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "PolicyBreach" : "Compliant",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Critical" : "Information",
      properties: props,
      ...(isErr
        ? {
            error: azureError(
              "AuthorizationFailed",
              "Security policy denies resolver updates for insufficient privileges."
            ),
          }
        : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/dnsResolvers"),
      azure: {
        dns_private_resolver: {
          resolver,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "SecurityPolicy",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(2e6, 42e9) },
      message: isErr
        ? `DNS Private Resolver ${resolver}: security policy anomaly`
        : `DNS Private Resolver ${resolver}: policy pass`,
    };
  }

  const armCode = armFailureError();
  const props = {
    operation: rand([
      "Microsoft.Network/dnsResolvers/write",
      "Microsoft.Network/dnsResolvers/delete",
    ]),
    inboundEndpoints: randInt(1, 4),
    statusCode: isErr ? rand([400, 409]) : rand([200, 202]),
    ...(isErr ? azureStatusMessageError(armCode, armErrorMessage(armCode)) : {}),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: props.operation,
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: String(props.statusCode),
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: props,
    ...(isErr ? { error: azureError(armCode, armErrorMessage(armCode)) } : {}),
    cloud: azureCloud(region, subscription, "Microsoft.Network/dnsResolvers"),
    azure: {
      dns_private_resolver: {
        resolver,
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(5e7, 10e9) },
    message: isErr
      ? `DNS resolver ${resolver}: ARM failed`
      : `DNS resolver ${resolver}: ${props.operation}`,
  };
}

/** Standalone Application Insights — ingestion and availability. */
export function generateApplicationInsightsLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const comp = `ai-${randId(6).toLowerCase()}`;
  const resourceId = armAppInsights(subscription.id, resourceGroup, comp);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "ingest",
    "availability",
    "admin",
    "smart_detection",
    "profiler_session",
    "workbook_export",
  ] as const);

  if (variant === "ingest") {
    const props = {
      itemCount: randInt(500, 25_000_000),
      dataType: rand(["requests", "dependencies", "exceptions", "traces"]),
      throttleDropped: isErr ? randInt(10_000, 900_000) : randInt(0, 500),
      ingestionLatencySeconds: isErr ? randInt(45, 600) : randInt(2, 38),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ApplicationInsights/Ingestion",
      category: "ApplicationInsights",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "Throttled" : "Accepted",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      ...(isErr
        ? { error: azureError("ThrottlingException", armErrorMessage("ThrottlingException")) }
        : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Insights/components"),
      azure: {
        application_insights: {
          component: comp,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Ingestion",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(3e6, 4e9) },
      message: isErr
        ? `App Insights ${comp}: ingestion throttled (${props.dataType})`
        : `App Insights ${comp}: ingested ${props.itemCount} ${props.dataType} items`,
    };
  }

  if (variant === "availability") {
    const props = {
      testName: rand(["homepage-probe", "checkout-api", "auth-health"]),
      location: rand(["us-east-probe", "eu-west-probe"]),
      success: !isErr && Math.random() > 0.12,
      durationMs: isErr ? randInt(5000, 25000) : randInt(120, 2400),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ApplicationInsights/AvailabilityResult",
      category: "Availability",
      resultType: props.success ? "Success" : "Failure",
      resultSignature: props.success ? "Pass" : "Fail",
      callerIpAddress: callerIp,
      correlationId,
      level: props.success ? "Information" : "Warning",
      properties: props,
      ...(!props.success
        ? {
            error: azureError(
              "InternalServerError",
              "Availability test failed: endpoint did not meet success criteria."
            ),
          }
        : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Insights/components"),
      azure: {
        application_insights: {
          component: comp,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Availability",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: props.success ? "success" : "failure", duration: randInt(5e6, 3e9) },
      message: props.success
        ? `App Insights ${comp}: availability ${props.testName} pass`
        : `App Insights ${comp}: availability ${props.testName} failed`,
    };
  }

  if (variant === "smart_detection") {
    const props = {
      ruleName: rand(["LatencySpike-prod", "FailureRate-Anomaly"]),
      anomalyScore: randFloatBounded(isErr ? 0.92 : 0.42, isErr ? 0.06 : 0.22),
      baselineWindowMinutes: randInt(24, 180),
      autoMitigationTriggered: !isErr && Math.random() < 0.4,
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ApplicationInsights/SmartDetection",
      category: "ProactiveDiagnostics",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "CorrelationFailed" : "RaisedIncident",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      ...(isErr ? { error: azureError("BadRequest", armErrorMessage("BadRequest")) } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Insights/components"),
      azure: {
        application_insights: {
          component: comp,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "SmartDetection",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(8e8, 5e9) },
      message: isErr
        ? `App Insights ${comp}: smart detection ${props.ruleName} stalled`
        : `App Insights ${comp}: anomaly`,
    };
  }

  if (variant === "profiler_session") {
    const sess = `sess-${randId(8)}`;
    const props = {
      profilerSessionId: sess,
      sampleRatePercent: randInt(12, isErr ? 40 : 100),
      stacksCaptured: isErr ? randInt(0, 400) : randInt(4200, 900_000),
      uploadBytes: isErr ? randInt(800, 12_000) : randInt(4_000_000, 120_000_000),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ApplicationInsights/ProfilerCapture",
      category: "Profiler",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "BufferOverflow" : "Completed",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      ...(isErr
        ? {
            error: azureError(
              "QuotaExceeded",
              "Profiler session exceeded allocated capture quota."
            ),
          }
        : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Insights/components"),
      azure: {
        application_insights: {
          component: comp,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Profiler",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(6e9, 22e9) },
      message: isErr
        ? `App Insights ${comp}: profiler session ${sess} dropped`
        : `App Insights ${comp}: profiler ${sess}`,
    };
  }

  if (variant === "workbook_export") {
    const props = {
      workbookId: randUUID(),
      exportFormat: rand(["PNG", "PDF"]),
      renderDurationMs: isErr ? randInt(8000, 42_000) : randInt(400, 3200),
      templateVersion: rand(["1.14", "1.21"]),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ApplicationInsights.Workbook/ExportAudit",
      category: "Workbooks",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "RenderTimeout" : "Delivered",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      ...(isErr
        ? { error: azureError("ResourceNotFound", armErrorMessage("ResourceNotFound")) }
        : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Insights/components"),
      azure: {
        application_insights: {
          component: comp,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "WorkbookExport",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(3e9, 8e9) },
      message: isErr
        ? `App Insights ${comp}: workbook export failed`
        : `App Insights ${comp}: workbook export`,
    };
  }

  const armCode = armFailureError();
  const props = {
    operation: rand([
      "Microsoft.Insights/components/write",
      "Microsoft.Insights/components/delete",
    ]),
    retentionDays: rand([30, 90, 180]),
    statusCode: isErr ? rand([403, 409]) : rand([200, 202]),
    ...(isErr ? azureStatusMessageError(armCode, armErrorMessage(armCode)) : {}),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: props.operation,
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: String(props.statusCode),
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: props,
    ...(isErr ? { error: azureError(armCode, armErrorMessage(armCode)) } : {}),
    cloud: azureCloud(region, subscription, "Microsoft.Insights/components"),
    azure: {
      application_insights: {
        component: comp,
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(4e7, 8e9) },
    message: isErr
      ? `App Insights ${comp}: ARM failed`
      : `App Insights ${comp}: ${props.operation}`,
  };
}

/** Azure Dedicated HSM — device provisioning and crypto ops. */
export function generateDedicatedHsmLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const hsm = `hsm-${randId(5).toLowerCase()}`;
  const resourceId = armDedicatedHsm(subscription.id, resourceGroup, hsm);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "crypto",
    "network",
    "admin",
    "partition_backup",
    "rbac_policy",
    "firmware_channel",
  ] as const);

  if (variant === "crypto") {
    const props = {
      keyName: `key-${rand(["rsa3072", "ec-p384", "aes256-hsm"])}`,
      operation: rand(["sign", "unwrapKey", "encrypt"]),
      throughputOpsPerSec: randInt(50, isErr ? 400 : 8500),
      hsmFirmware: rand(["7.4.2", "7.5.1"]),
      tamperEvent: isErr && Math.random() < 0.25,
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "DedicatedHSM.Crypto/Audit",
      category: "CryptoOperations",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.tamperEvent ? "TamperLatch" : props.operation,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Critical" : "Information",
      ...(isErr
        ? {
            error: props.tamperEvent
              ? azureError("InternalServerError", "Tamper response detected by HSM module.")
              : azureError(
                  "AuthorizationFailed",
                  "Key operation denied by local HSM security policy."
                ),
          }
        : {}),
      cloud: azureCloud(region, subscription, "Microsoft.HardwareSecurityModules/dedicatedHSMs"),
      azure: {
        dedicated_hsm: {
          hsm,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Crypto",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e5, 8e8) },
      message: props.tamperEvent
        ? `Dedicated HSM ${hsm}: tamper indicator raised`
        : `Dedicated HSM ${hsm}: ${props.operation} on ${props.keyName}`,
    };
  }

  if (variant === "network") {
    const props = {
      peerSubnet: `10.${randInt(40, 180)}.${randInt(0, 255)}.0/28`,
      vpnProbeOk: !isErr,
      packetLossPercent: randFloatBounded(isErr ? 18 : 0.6, isErr ? 22 : 0.35),
      stampId: rand(["stamp-a", "stamp-b"]),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "DedicatedHSM.Network/Health",
      category: "Network",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.vpnProbeOk ? "Healthy" : "Degraded",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      ...(isErr
        ? {
            error: azureError("ResourceNotFound", "Peer subnet route not reachable from HSM VNet."),
          }
        : {}),
      cloud: azureCloud(region, subscription, "Microsoft.HardwareSecurityModules/dedicatedHSMs"),
      azure: {
        dedicated_hsm: {
          hsm,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Network",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(2e6, 2e9) },
      message: isErr
        ? `Dedicated HSM ${hsm}: network path unhealthy`
        : `Dedicated HSM ${hsm}: HSM subnet reachability OK`,
    };
  }

  if (variant === "partition_backup") {
    const backupId = `bak-${randId(10)}`;
    const props = {
      backupId,
      encryptedPayloadGiB: randFloatBounded(isErr ? 4.2 : 48, isErr ? 2 : 18),
      copyToStamp: rand(["stamp-a", "stamp-b"]),
      verificationHashOk: !isErr,
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "DedicatedHSM.Backup/PartitionExport",
      category: "Backup",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.verificationHashOk ? "IntegrityOK" : "ChecksumMismatch",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      ...(isErr ? { error: azureError("ConflictError", armErrorMessage("ConflictError")) } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.HardwareSecurityModules/dedicatedHSMs"),
      azure: {
        dedicated_hsm: {
          hsm,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "PartitionBackup",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(8e9, 28e9) },
      message: isErr
        ? `Dedicated HSM ${hsm}: backup ${backupId} verification failed`
        : `Dedicated HSM ${hsm}: partition backup queued`,
    };
  }

  if (variant === "rbac_policy") {
    const props = {
      roleDefinition: rand(["HSM_CRYPTO_USER", "HSM_AUDITOR", "HSM_ADMIN"]),
      subjectOid: randUUID(),
      policyEvaluation: isErr ? "DENY" : rand(["ALLOW", "CONDITIONAL"]),
      mfaSatisfied: !isErr,
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "DedicatedHSM.RBAC/Evaluate",
      category: "AccessControl",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.policyEvaluation,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      ...(isErr
        ? { error: azureError("AuthorizationFailed", armErrorMessage("AuthorizationFailed")) }
        : {}),
      cloud: azureCloud(region, subscription, "Microsoft.HardwareSecurityModules/dedicatedHSMs"),
      azure: {
        dedicated_hsm: {
          hsm,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "RBAC",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(2e8, 2e9) },
      message: isErr
        ? `Dedicated HSM ${hsm}: RBAC deny for ${props.roleDefinition}`
        : `Dedicated HSM ${hsm}: RBAC`,
    };
  }

  if (variant === "firmware_channel") {
    const props = {
      pendingFirmware: rand(["7.6.1", "7.7.0-rc1"]),
      maintenanceWindowUtc: rand(["03:00Z", "05:30Z"]),
      rebootRequired: isErr || Math.random() < 0.35,
      channelReadinessPercent: randFloatBounded(isErr ? 12 : 94, isErr ? 28 : 4),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "DedicatedHSM.Firmware/ChannelAudit",
      category: "Firmware",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "ImageCorrupt" : "Staged",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Critical" : "Information",
      properties: props,
      ...(isErr ? { error: azureError("BadRequest", armErrorMessage("BadRequest")) } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.HardwareSecurityModules/dedicatedHSMs"),
      azure: {
        dedicated_hsm: {
          hsm,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Firmware",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(4e9, 16e9) },
      message: isErr
        ? `Dedicated HSM ${hsm}: firmware channel blocked`
        : `Dedicated HSM ${hsm}: firmware staged`,
    };
  }

  const armCode = armFailureError();
  const props = {
    operation: rand([
      "Microsoft.HardwareSecurityModules/dedicatedHSMs/write",
      "Microsoft.HardwareSecurityModules/dedicatedHSMs/delete",
    ]),
    sku: rand(["SafeNet Luna Network HSM B", "SafeNet Luna Network HSM A790"]),
    statusCode: isErr ? rand([400, 409]) : rand([200, 202]),
    ...(isErr ? azureStatusMessageError(armCode, armErrorMessage(armCode)) : {}),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: props.operation,
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: String(props.statusCode),
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: props,
    ...(isErr ? { error: azureError(armCode, armErrorMessage(armCode)) } : {}),
    cloud: azureCloud(region, subscription, "Microsoft.HardwareSecurityModules/dedicatedHSMs"),
    azure: {
      dedicated_hsm: {
        hsm,
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(8e7, 14e9) },
    message: isErr
      ? `Dedicated HSM ${hsm}: provisioning failed`
      : `Dedicated HSM ${hsm}: ${props.operation}`,
  };
}

/** Azure AI Video Indexer — uploads and indexing jobs. */
export function generateVideoIndexerLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const acct = `vi-${randId(5).toLowerCase()}`;
  const resourceId = armVideoIndexer(subscription.id, resourceGroup, acct);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "upload",
    "index",
    "admin",
    "live_stream",
    "transcription_export",
    "webhook_callback",
  ] as const);

  if (variant === "upload") {
    const props = {
      videoId: randUUID(),
      sourceUri: `https://${rand(["media", "cdn"])}.${rand(["contoso", "fabrikam"])}.net/asset-${randId(6)}.mp4`,
      bytesUploaded: randInt(500_000, 12_000_000_000),
      transcodingPreset: rand(["AudioOnly", "Basic", "Advanced"]),
      statusCode: isErr ? rand([413, 502]) : rand([200, 202]),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "VideoIndexer.Media/Upload",
      category: "Upload",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      ...(isErr
        ? {
            error: azureError(
              props.statusCode === 413 ? "BadRequest" : "InternalServerError",
              props.statusCode === 413
                ? armErrorMessage("BadRequest")
                : armErrorMessage("InternalServerError")
            ),
          }
        : {}),
      cloud: azureCloud(region, subscription, "Microsoft.VideoIndexer/accounts"),
      azure: {
        video_indexer: {
          account: acct,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Upload",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(8e6, 9e9) },
      message: isErr
        ? `Video Indexer ${acct}: upload failed`
        : `Video Indexer ${acct}: uploaded ${props.bytesUploaded} bytes`,
    };
  }

  if (variant === "index") {
    const props = {
      jobId: `job_${randId(12)}`,
      insightsRequested: rand(["faces", "topics", "labels", "ocr"]),
      indexedMinutes: isErr ? randInt(0, 40) : randInt(12, 380),
      facesDetected: isErr ? randInt(0, 5) : randInt(2, 420),
      processingState: isErr ? "Failed" : rand(["Processing", "Processed"]),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "VideoIndexer.Index/Pipeline",
      category: "Indexing",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.processingState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      ...(isErr ? { error: azureError("QuotaExceeded", armErrorMessage("QuotaExceeded")) } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.VideoIndexer/accounts"),
      azure: {
        video_indexer: {
          account: acct,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Indexing",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1.2e7, 15e9) },
      message: isErr
        ? `Video Indexer ${acct}: indexing job ${props.jobId} failed`
        : `Video Indexer ${acct}: job ${props.jobId} produced ${props.indexedMinutes} min`,
    };
  }

  if (variant === "live_stream") {
    const streamId = `live-${randId(8)}`;
    const props = {
      streamingEndpointHost: rand(["ams-contoso.streaming.media.azure.net"]),
      bitrateKbps: isErr ? randInt(120, 800) : randInt(2800, 12_500),
      bufferUnderruns: isErr ? randInt(12, 1800) : randInt(0, 35),
      hlsFragmentsDropped: isErr ? randInt(40, 900) : randInt(0, 12),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "VideoIndexer.Live/IngestTelemetry",
      category: "LiveStream",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "Backpressure" : "Stable",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      ...(isErr
        ? {
            error: azureError("ThrottlingException", armErrorMessage("ThrottlingException")),
          }
        : {}),
      cloud: azureCloud(region, subscription, "Microsoft.VideoIndexer/accounts"),
      azure: {
        video_indexer: {
          account: acct,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "LiveStream",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(2e6, 42e9) },
      message: isErr
        ? `Video Indexer ${acct}: live ${streamId} ingest degraded`
        : `Video Indexer ${acct}: live ingest`,
    };
  }

  if (variant === "transcription_export") {
    const props = {
      transcriptionLanguage: rand(["en-US", "es-ES"]),
      subtitleFormat: rand(["VTT", "TTML"]),
      wordCount: isErr ? randInt(0, 400) : randInt(820, 420_000),
      exportAttempts: randInt(isErr ? 6 : 1, isErr ? 18 : 4),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "VideoIndexer.Transcript/Export",
      category: "Transcript",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "StaleArtifact" : "Delivered",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      ...(isErr
        ? { error: azureError("ResourceNotFound", armErrorMessage("ResourceNotFound")) }
        : {}),
      cloud: azureCloud(region, subscription, "Microsoft.VideoIndexer/accounts"),
      azure: {
        video_indexer: {
          account: acct,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "TranscriptExport",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(4e7, 6e9) },
      message: isErr
        ? `Video Indexer ${acct}: transcription export failed`
        : `Video Indexer ${acct}: transcript export`,
    };
  }

  if (variant === "webhook_callback") {
    const props = {
      callbackUrlHost: rand(["hooks.slack.com", "api-internal.contoso"]),
      correlationToken: randId(32),
      retries: isErr ? randInt(4, 42) : randInt(0, 2),
      httpStatusReturned: isErr ? rand([500, 504, 0]) : rand([200, 204]),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "VideoIndexer.Webhook/DeliveryAudit",
      category: "Callback",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.httpStatusReturned),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      ...(isErr
        ? { error: azureError("InternalServerError", armErrorMessage("InternalServerError")) }
        : {}),
      cloud: azureCloud(region, subscription, "Microsoft.VideoIndexer/accounts"),
      azure: {
        video_indexer: {
          account: acct,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Webhook",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e8, 3e9) },
      message: isErr
        ? `Video Indexer ${acct}: webhook delivery exhausting retries`
        : `Video Indexer ${acct}: webhook ok`,
    };
  }

  const armCode = armFailureError();
  const props = {
    operation: rand([
      "Microsoft.VideoIndexer/accounts/write",
      "Microsoft.VideoIndexer/accounts/delete",
    ]),
    accountType: rand(["Paid", "Trial"]),
    statusCode: isErr ? rand([400, 409]) : rand([200, 202]),
    ...(isErr ? azureStatusMessageError(armCode, armErrorMessage(armCode)) : {}),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: props.operation,
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: String(props.statusCode),
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: props,
    ...(isErr ? { error: azureError(armCode, armErrorMessage(armCode)) } : {}),
    cloud: azureCloud(region, subscription, "Microsoft.VideoIndexer/accounts"),
    azure: {
      video_indexer: {
        account: acct,
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(5e7, 9e9) },
    message: isErr
      ? `Video Indexer ${acct}: ARM failed`
      : `Video Indexer ${acct}: ${props.operation}`,
  };
}
