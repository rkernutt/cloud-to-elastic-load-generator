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

function randFloat(min: number, max: number): number {
  return Math.round((min + Math.random() * (max - min)) * 100) / 100;
}

function armCognitive(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.CognitiveServices/accounts/${name}`;
}

function armMlWorkspace(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.MachineLearningServices/workspaces/${name}`;
}

function armSearch(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Search/searchServices/${name}`;
}

function armBot(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.BotService/botServices/${name}`;
}

function armUserAssignedIdentity(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/${name}`;
}

function armAtp(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Attestation/attestationProviders/${name}`;
}

function armLedger(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.ConfidentialLedger/ledgers/${name}`;
}

function armAppInsights(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Insights/components/${name}`;
}

function armActivityLogAlert(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Insights/activityLogAlerts/${name}`;
}

function armPolicyAssignment(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Authorization/policyAssignments/${name}`;
}

function armCostExport(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.CostManagement/exports/${name}`;
}

function armBlueprintAssignment(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Blueprint/blueprintAssignments/${name}`;
}

function armSentinelWorkspace(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.OperationalInsights/workspaces/${name}`;
}

/** Cognitive Services — API calls, throttling, rate limiting. */
export function generateCognitiveServicesLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const account = `cog-${randId(6).toLowerCase()}`;
  const resourceId = armCognitive(subscription.id, resourceGroup, account);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["api", "throttle", "admin"] as const);
  const throttled = variant === "throttle" || (variant === "api" && isErr && Math.random() < 0.35);

  if (variant === "admin") {
    const op = isErr
      ? "Microsoft.CognitiveServices/accounts/write"
      : rand([
          "Microsoft.CognitiveServices/accounts/write",
          "Microsoft.CognitiveServices/accounts/delete",
          "Microsoft.CognitiveServices/accounts/listKeys/action",
        ]);
    const statusCode = isErr ? rand([403, 409]) : rand([200, 202]);
    const props = {
      apiKind: rand(["TextAnalytics", "ComputerVision", "SpeechServices"]),
      sku: rand(["S0", "S1"]),
      statusCode,
      callerIpAddress: callerIp,
      correlationId,
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: op,
      category: "Administrative",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.CognitiveServices/accounts"),
      azure: {
        cognitive_services: {
          account,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Administrative",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e7, 3e9) },
      message: isErr
        ? `Cognitive Services ${account}: ${op} failed (status ${statusCode})`
        : `Cognitive Services ${account}: control plane ${op} completed`,
    };
  }

  const op = rand([
    "TextAnalytics.Entities",
    "Face.Detect",
    "ContentModerator.Scan",
    "CustomVision.Predict",
  ]);
  const statusCode = throttled ? 429 : isErr ? rand([400, 500, 503]) : 200;
  const props = {
    operation: op,
    apiVersion: "2023-05-15",
    latencyMs: throttled ? randInt(5, 120) : randInt(12, 1800),
    billingTokens: randInt(1, 800),
    statusCode,
    retryAfter: throttled ? `${randInt(1, 60)}s` : undefined,
    quotaRemaining: throttled ? 0 : randInt(10, 9000),
    callerIpAddress: callerIp,
    correlationId,
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: throttled ? "CognitiveServices.Throttled" : "CognitiveServices.Request",
    category: throttled ? "RateLimiting" : "RequestResponse",
    resultType: statusCode >= 400 ? "Failure" : "Success",
    resultSignature: String(statusCode),
    callerIpAddress: callerIp,
    correlationId,
    level: statusCode >= 400 ? (throttled ? "Warning" : "Error") : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.CognitiveServices/accounts"),
    azure: {
      cognitive_services: {
        account,
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: props.retryAfter ? "RateLimiting" : "RequestResponse",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      outcome: statusCode >= 400 ? "failure" : "success",
      duration: randInt(1e6, throttled ? 2e8 : 4e9),
    },
    message: throttled
      ? `Cognitive Services ${account}: throttled on ${op} retryAfter=${props.retryAfter}`
      : `Cognitive Services ${account}: ${op} completed latencyMs=${props.latencyMs}`,
  };
}

/** Azure ML — experiments, deployments, compute. */
export function generateMachineLearningLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const ws = `mlw-${randId(6).toLowerCase()}`;
  const resourceId = armMlWorkspace(subscription.id, resourceGroup, ws);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["experiment", "deployment", "compute"] as const);

  if (variant === "experiment") {
    const runId = `run_${randId(10)}`;
    const props = {
      experimentName: rand(["finance-default", "churn-v2", "pricing-alpha"]),
      runId,
      status: isErr ? "Failed" : rand(["Completed", "Running", "Queued"]),
      durationSeconds: isErr ? randInt(12, 400) : randInt(120, 7200),
      target: rand(["cpu-cluster", "gpu-v100", "serverless"]),
      metricsLogged: randInt(5, 900),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "AzureML.ExperimentRun",
      category: "AmlRunStatus",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "Failed" : String(props.status),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.MachineLearningServices/workspaces"),
      azure: {
        machine_learning: {
          workspace: ws,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "AmlRunStatus",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(2e7, 6e9) },
      message: isErr
        ? `AML workspace ${ws}: experiment run ${runId} failed`
        : `AML workspace ${ws}: run ${runId} ${props.status}`,
    };
  }

  if (variant === "deployment") {
    const endpoint = `ep-${randId(5).toLowerCase()}`;
    const props = {
      endpointName: endpoint,
      modelName: rand(["sklearn-gbdt", "torch-resnet", "xgboost-risk"]),
      modelVersion: String(randInt(1, 42)),
      aksName: rand(["aml-aks-prod", "aml-aks-stg"]),
      provisioningState: isErr ? "Failed" : rand(["Succeeded", "Updating"]),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "AzureML.ModelDeployment",
      category: "AmlDeploymentEvent",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.provisioningState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.MachineLearningServices/workspaces"),
      azure: {
        machine_learning: {
          workspace: ws,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "AmlDeploymentEvent",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(8e7, 12e9) },
      message: isErr
        ? `AML ${ws}: deployment ${endpoint} failed`
        : `AML ${ws}: model deployment ${endpoint} ${props.provisioningState}`,
    };
  }

  const cluster = `cl-${randId(5).toLowerCase()}`;
  const props = {
    computeName: cluster,
    vmSize: rand(["Standard_DS3_v2", "Standard_NC6s_v3"]),
    nodeCount: randInt(0, 8),
    operation: isErr ? "Resize" : rand(["Create", "Scale", "Delete"]),
    state: isErr ? "Failed" : rand(["Succeeded", "InProgress"]),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.MachineLearningServices/workspaces/computes/write",
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.state,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.MachineLearningServices/workspaces"),
    azure: {
      machine_learning: {
        workspace: ws,
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 5e9) },
    message: isErr
      ? `AML compute ${cluster} in ${ws}: provisioning failed`
      : `AML compute ${cluster}: ${props.operation} ${props.state}`,
  };
}

/** Azure AI Search — index ops, queries, skills. */
export function generateAiSearchLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const svc = `search-${randId(5).toLowerCase()}`;
  const resourceId = armSearch(subscription.id, resourceGroup, svc);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["index", "query", "skill"] as const);

  if (variant === "index") {
    const indexName = `idx-${rand(["products", "docs", "tickets"])}`;
    const props = {
      indexName,
      operation: rand(["createOrUpdate", "delete", "analyze"]),
      documentsIndexed: randInt(0, 5_000_000),
      statusCode: isErr ? rand([400, 409]) : rand([200, 202]),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: `SearchService.IndexManagement/${props.operation}`,
      category: "IndexManagement",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Search/searchServices"),
      azure: {
        ai_search: {
          service: svc,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "IndexManagement",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(3e7, 4e9) },
      message: isErr
        ? `AI Search ${svc}: index ${indexName} operation failed`
        : `AI Search ${svc}: index ${indexName} ${props.operation} OK`,
    };
  }

  if (variant === "query") {
    const props = {
      searchTextLength: randInt(3, 512),
      resultsCount: isErr ? 0 : randInt(1, 500),
      queryLatencyMs: isErr ? randInt(400, 4000) : randInt(8, 220),
      searchMode: rand(["any", "all"]),
      apiVersion: "2024-07-01",
      statusCode: isErr ? rand([408, 500]) : 200,
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "SearchService.SearchQuery",
      category: "QueryExecution",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Search/searchServices"),
      azure: {
        ai_search: {
          service: svc,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "QueryExecution",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e5, 2e9) },
      message: isErr
        ? `AI Search ${svc}: query execution error (${props.statusCode})`
        : `AI Search ${svc}: query returned ${props.resultsCount} docs in ${props.queryLatencyMs}ms`,
    };
  }

  const props = {
    skillsetName: `skill-${randId(4)}`,
    skillType: rand(["#Microsoft.Skills.Text.MergeSkill", "#Microsoft.Skills.Vision.OcrSkill"]),
    documentsProcessed: isErr ? 0 : randInt(1, 2000),
    errors: isErr ? randInt(1, 50) : 0,
    status: isErr ? "Failed" : "Succeeded",
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "SearchService.SkillExecution",
    category: "SkillExecution",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.status,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.Search/searchServices"),
    azure: {
      ai_search: {
        service: svc,
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: "SkillExecution",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(2e7, 8e9) },
    message: isErr
      ? `AI Search ${svc}: skill ${props.skillsetName} execution failed`
      : `AI Search ${svc}: skill ${props.skillType} processed ${props.documentsProcessed} docs`,
  };
}

/** Bot Service — messaging, channels, sessions. */
export function generateBotServiceLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const bot = `bot-${randId(5).toLowerCase()}`;
  const resourceId = armBot(subscription.id, resourceGroup, bot);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["message", "channel", "session"] as const);

  if (variant === "message") {
    const props = {
      channelId: rand(["webchat", "msteams", "directline"]),
      activityType: rand(["message", "conversationUpdate"]),
      userId: `u-${randId(8)}`,
      textBytes: randInt(8, 4000),
      latencyMs: isErr ? randInt(200, 5000) : randInt(20, 400),
      status: isErr ? "DeliveryFailed" : "Delivered",
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "BotService.Message",
      category: "BotMessages",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.status,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.BotService/botServices"),
      azure: {
        bot_service: {
          bot,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "BotMessages",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e5, 2e9) },
      message: isErr
        ? `Bot ${bot}: message delivery failed on ${props.channelId}`
        : `Bot ${bot}: message handled on ${props.channelId}`,
    };
  }

  if (variant === "channel") {
    const props = {
      channel: rand(["DirectLine", "Slack", "Email"]),
      operation: isErr ? "RegisterFailed" : rand(["Register", "Unregister", "TokenRefresh"]),
      correlationId,
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "BotService.ChannelOperation",
      category: "ChannelOperations",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.operation,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.BotService/botServices"),
      azure: {
        bot_service: {
          bot,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "ChannelOperations",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(8e6, 2e9) },
      message: isErr
        ? `Bot ${bot}: channel ${props.channel} operation failed`
        : `Bot ${bot}: channel ${props.operation} ${props.channel}`,
    };
  }

  const convId = `conv-${randUUID().slice(0, 18)}`;
  const props = {
    conversationId: convId,
    action: rand(["Start", "Continue", "End"]),
    watermark: randInt(1, 9999),
    stateStore: rand(["cosmos", "blob"]),
    expired: isErr,
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "BotService.SessionState",
    category: "SessionManagement",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.action,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.BotService/botServices"),
    azure: {
      bot_service: {
        bot,
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: "SessionManagement",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(4e5, 1e9) },
    message: isErr
      ? `Bot ${bot}: session ${convId} state error`
      : `Bot ${bot}: session ${convId} ${props.action}`,
  };
}

/** Computer Vision — analyze, OCR, spatial. */
export function generateVisionLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const account = `cv-${randId(5).toLowerCase()}`;
  const resourceId = armCognitive(subscription.id, resourceGroup, account);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["analyze", "ocr", "spatial"] as const);

  const op =
    variant === "analyze"
      ? "ComputerVision.AnalyzeImage"
      : variant === "ocr"
        ? "ComputerVision.Read"
        : "ComputerVision.AnalyzeImage/spatial";
  const props = {
    visualFeatures: variant === "analyze" ? rand(["Categories,Tags", "Faces,Adult"]) : undefined,
    language: rand(["en", "es", "fr"]),
    width: randInt(640, 4096),
    height: randInt(480, 4096),
    latencyMs: isErr ? randInt(80, 2000) : randInt(25, 900),
    regionsDetected:
      variant === "ocr" && !isErr ? randInt(1, 120) : variant === "ocr" ? 0 : undefined,
    peopleCount:
      variant === "spatial" && !isErr
        ? randInt(0, 80)
        : variant === "spatial"
          ? undefined
          : undefined,
    statusCode: isErr ? rand([400, 429, 500]) : 200,
    correlationId,
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: op,
    category: variant === "spatial" ? "SpatialAnalysis" : "ComputerVision",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: String(props.statusCode),
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.CognitiveServices/accounts"),
    azure: {
      vision: {
        account,
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: variant,
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e6, 3e9) },
    message: isErr
      ? `Computer Vision ${account}: ${variant} failed (${props.statusCode})`
      : `Computer Vision ${account}: ${op} completed in ${props.latencyMs}ms`,
  };
}

/** Speech — recognition, synthesis, translation. */
export function generateSpeechLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const account = `sp-${randId(5).toLowerCase()}`;
  const resourceId = armCognitive(subscription.id, resourceGroup, account);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["recognize", "synthesize", "translate"] as const);

  const op =
    variant === "recognize"
      ? "SpeechToText.Recognize"
      : variant === "synthesize"
        ? "TextToSpeech.Synthesize"
        : "SpeechTranslation.Translate";
  const props = {
    locale: rand(["en-US", "es-ES", "de-DE"]),
    audioDurationSec: variant === "recognize" ? randFloat(1, 120) : undefined,
    characters: variant === "synthesize" ? randInt(20, 8000) : randInt(10, 4000),
    wordCount: variant === "recognize" && !isErr ? randInt(5, 400) : 0,
    engine: rand(["neural", "standard"]),
    statusCode: isErr ? rand([400, 429, 502]) : 200,
    correlationId,
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: op,
    category: "Speech",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: String(props.statusCode),
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.CognitiveServices/accounts"),
    azure: {
      speech: {
        account,
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: variant,
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e6, 5e9) },
    message: isErr
      ? `Speech ${account}: ${variant} failed`
      : `Speech ${account}: ${op} OK locale=${props.locale}`,
  };
}

/** Translator — document and text batches. */
export function generateTranslatorLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const account = `tr-${randId(5).toLowerCase()}`;
  const resourceId = armCognitive(subscription.id, resourceGroup, account);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["text", "document"] as const);

  if (variant === "text") {
    const props = {
      from: rand(["en", "de", "fr"]),
      to: rand(["es", "it", "pt"]),
      characterCount: randInt(50, 400_000),
      batchSize: randInt(1, 80),
      statusCode: isErr ? rand([400, 429]) : 200,
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Translator.Text.Batch",
      category: "Translation",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.CognitiveServices/accounts"),
      azure: {
        translator: {
          account,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "TextBatch",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(2e6, 3e9) },
      message: isErr
        ? `Translator ${account}: text batch failed`
        : `Translator ${account}: translated ${props.characterCount} chars ${props.from}->${props.to}`,
    };
  }

  const props = {
    sourceStorage: `https://st${randId(6)}.blob.core.windows.net/in`,
    targetStorage: `https://st${randId(6)}.blob.core.windows.net/out`,
    fileCount: isErr ? 0 : randInt(1, 400),
    pagesProcessed: isErr ? 0 : randInt(10, 20_000),
    operationId: randUUID(),
    status: isErr ? "Failed" : rand(["Succeeded", "Running"]),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Translator.Document.Batch",
    category: "DocumentTranslation",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.status,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.CognitiveServices/accounts"),
    azure: {
      translator: {
        account,
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: "DocumentBatch",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 12e9) },
    message: isErr
      ? `Translator ${account}: document job ${props.operationId} failed`
      : `Translator ${account}: document batch ${props.status} files=${props.fileCount}`,
  };
}

/** Document Intelligence — analyze ops, model training. */
export function generateDocumentIntelligenceLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const account = `docintel-${randId(4).toLowerCase()}`;
  const resourceId = armCognitive(subscription.id, resourceGroup, account);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["analyze", "train"] as const);

  if (variant === "analyze") {
    const props = {
      modelId: rand(["prebuilt-invoice", "prebuilt-layout", "custom-invoice-v3"]),
      pages: randInt(1, 120),
      tablesExtracted: isErr ? 0 : randInt(0, 40),
      kvPairs: isErr ? 0 : randInt(2, 500),
      latencyMs: isErr ? randInt(100, 4000) : randInt(200, 9000),
      statusCode: isErr ? rand([400, 500]) : 200,
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "DocumentIntelligence.Analyze",
      category: "AnalyzeOperation",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.CognitiveServices/accounts"),
      azure: {
        document_intelligence: {
          account,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "AnalyzeOperation",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(2e6, 6e9) },
      message: isErr
        ? `Document Intelligence ${account}: analyze failed`
        : `Document Intelligence ${account}: analyze ${props.pages} pages model=${props.modelId}`,
    };
  }

  const props = {
    modelName: `custom-${randId(5)}`,
    trainingDocCount: randInt(5, 500),
    epochs: randInt(1, 10),
    status: isErr ? "Failed" : rand(["Succeeded", "Training"]),
    trainingHours: isErr ? randFloat(0.2, 2) : randFloat(0.5, 18),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "DocumentIntelligence.TrainModel",
    category: "ModelTraining",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.status,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.CognitiveServices/accounts"),
    azure: {
      document_intelligence: {
        account,
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: "ModelTraining",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(5e7, 14e9) },
    message: isErr
      ? `Document Intelligence ${account}: training ${props.modelName} failed`
      : `Document Intelligence ${account}: model ${props.modelName} training ${props.status}`,
  };
}

/** Managed Identity — tokens, federated credentials. */
export function generateManagedIdentityLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const idName = `id-${randId(6).toLowerCase()}`;
  const resourceId = armUserAssignedIdentity(subscription.id, resourceGroup, idName);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["token", "federated"] as const);

  if (variant === "token") {
    const props = {
      audience: rand(["https://vault.azure.net", "https://storage.azure.com"]),
      clientId: randUUID(),
      tokenBytes: isErr ? 0 : randInt(800, 4000),
      leaseSeconds: isErr ? 0 : randInt(300, 3600),
      errorCode: isErr ? rand(["identity_not_found", "forbidden"]) : undefined,
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ManagedIdentity.GetToken",
      category: "TokenIssuance",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "401" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.ManagedIdentity/userAssignedIdentities"),
      azure: {
        managed_identity: {
          identity: idName,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "TokenIssuance",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(2e5, 8e8) },
      message: isErr
        ? `Managed Identity ${idName}: token issuance failed (${props.errorCode})`
        : `Managed Identity ${idName}: token issued for audience ${props.audience}`,
    };
  }

  const props = {
    federatedCredentialName: `fc-${randId(5)}`,
    issuer: rand([
      "https://token.actions.githubusercontent.com",
      "https://login.microsoftonline.com/.../v2.0",
    ]),
    subject: isErr
      ? "invalid-subject"
      : `repo:contoso/${rand(["api", "infra"])}:ref:refs/heads/main`,
    operation: isErr ? "delete" : rand(["create", "update"]),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: `Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials/${props.operation}`,
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "400" : "200",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.ManagedIdentity/userAssignedIdentities"),
    azure: {
      managed_identity: {
        identity: idName,
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: "FederatedCredential",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(5e6, 2e9) },
    message: isErr
      ? `Managed Identity ${idName}: federated credential ${props.operation} failed`
      : `Managed Identity ${idName}: federated cred ${props.federatedCredentialName} ${props.operation}`,
  };
}

/** Defender for Cloud — assessments, recommendations. */
export function generateDefenderForCloudLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const assessmentId = `assess-${randId(8)}`;
  const resourceName = rand(["kv-prod", "stodata", "aks-prod", "sql-primary"]);
  const resourceId = `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Security/assessments/${assessmentId}`;
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["finding", "recommendation"] as const);

  if (variant === "finding") {
    const props = {
      status: isErr ? "NotApplicable" : rand(["Unhealthy", "Healthy"]),
      severity: rand(["High", "Medium", "Low"]),
      resourceName,
      resourceType: rand(["Microsoft.KeyVault/vaults", "Microsoft.Storage/storageAccounts"]),
      description: isErr ? "Assessment compute failed" : "CMK not configured on storage account",
      correlationId,
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Security/assessments/write",
      category: "SecurityAssessment",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.status,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : rand(["Warning", "Information"]),
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Security/assessments"),
      azure: {
        defender: {
          resource_group: resourceGroup,
          assessment_id: assessmentId,
          resource_id: resourceId,
          category: "AssessmentFinding",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e7, 4e9) },
      message: isErr
        ? `Defender assessment ${assessmentId}: failed for ${resourceName}`
        : `Defender: assessment ${assessmentId} ${props.status} (${props.severity})`,
    };
  }

  const props = {
    recommendationId: `rec-${randId(6)}`,
    action: isErr ? "DismissFailed" : rand(["Activate", "Postpone", "Dismiss"]),
    subscriptionId: subscription.id,
    resourceName,
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.Security/recommendations/status",
    category: "Recommendation",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.action,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.Security/recommendations"),
    azure: {
      defender: {
        resource_group: resourceGroup,
        assessment_id: assessmentId,
        resource_id: resourceId,
        category: "RecommendationChange",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(5e6, 2e9) },
    message: isErr
      ? `Defender recommendation ${props.recommendationId}: status update failed`
      : `Defender: recommendation ${props.action} on ${resourceName}`,
  };
}

/** Microsoft Sentinel — incidents, rules, playbooks. */
export function generateSentinelLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const law = `law-${randId(5).toLowerCase()}`;
  const wsResourceId = armSentinelWorkspace(subscription.id, resourceGroup, law);
  const incidentNumber = randInt(1, 5000);
  const incName = `INC-${incidentNumber}`;
  const incidentResourceId = `${wsResourceId}/providers/Microsoft.SecurityInsights/Incidents/${incName}`;
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["incident", "rule", "playbook"] as const);

  if (variant === "incident") {
    const props = {
      incidentId: incName,
      severity: rand(["High", "Medium", "Low", "Informational"]),
      status: isErr ? "Error" : rand(["New", "Active", "Closed"]),
      owner: rand(["soc-analyst-a", "soc-analyst-b"]),
      tactics: rand(["InitialAccess", "Exfiltration", "CredentialAccess"]),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId: incidentResourceId,
      operationName: "Microsoft.SecurityInsights/incidents/write",
      category: "IncidentLifecycle",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.status,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.SecurityInsights/incidents"),
      azure: {
        sentinel: {
          workspace: law,
          resource_group: resourceGroup,
          resource_id: incidentResourceId,
          category: "Incident",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e6, 3e9) },
      message: isErr
        ? `Sentinel ${law}: incident ${incName} update failed`
        : `Sentinel: incident ${incName} ${props.status} severity=${props.severity}`,
    };
  }

  if (variant === "rule") {
    const props = {
      ruleId: randUUID(),
      ruleName: rand(["AAD risky sign-in", "Rare outbound RDP", "Malware hash match"]),
      runFrequency: rand(["5M", "1H"]),
      matchedEvents: isErr ? 0 : randInt(0, 2500),
      queryDurationMs: randInt(200, 45_000),
      status: isErr ? "QueryFailed" : "Completed",
    };
    return {
      "@timestamp": ts,
      time,
      resourceId: wsResourceId,
      operationName: "Microsoft.SecurityInsights/alertRules/query",
      category: "AnalyticsRuleExecution",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.status,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.SecurityInsights/alertRules"),
      azure: {
        sentinel: {
          workspace: law,
          resource_group: resourceGroup,
          resource_id: wsResourceId,
          category: "AnalyticsRule",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(2e7, 8e9) },
      message: isErr
        ? `Sentinel rule ${props.ruleName}: execution failed`
        : `Sentinel rule ${props.ruleName}: matched ${props.matchedEvents} events`,
    };
  }

  const props = {
    playbookName: `pb-${randId(5)}`,
    runId: randUUID(),
    trigger: rand(["incident", "alert", "manual"]),
    actionsRun: isErr ? randInt(0, 2) : randInt(3, 28),
    status: isErr ? "Failed" : "Succeeded",
  };
  return {
    "@timestamp": ts,
    time,
    resourceId: wsResourceId,
    operationName: "Microsoft.Logic/workflows/run",
    category: "PlaybookRun",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.status,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.Logic/workflows"),
    azure: {
      sentinel: {
        workspace: law,
        resource_group: resourceGroup,
        resource_id: wsResourceId,
        category: "Playbook",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 9e9) },
    message: isErr
      ? `Sentinel playbook ${props.playbookName}: run ${props.runId} failed`
      : `Sentinel playbook ${props.playbookName}: ${props.actionsRun} actions ${props.status}`,
  };
}

/** Azure Attestation — attest ops, policy. */
export function generateAttestationLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const name = `attp-${randId(5).toLowerCase()}`;
  const resourceId = armAtp(subscription.id, resourceGroup, name);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["attest", "policy"] as const);

  if (variant === "attest") {
    const props = {
      tee: rand(["SgxEnclave", "SevSnpVm"]),
      mrenclave: randId(16),
      policyVersion: `v${randInt(1, 12)}`,
      verdict: isErr ? "failed" : "accepted",
      latencyMs: randInt(5, 400),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Attestation/attest",
      category: "AttestationRequest",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.verdict,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Attestation/attestationProviders"),
      azure: {
        attestation: {
          provider: name,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Attest",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(3e5, 1e9) },
      message: isErr
        ? `Attestation ${name}: request rejected`
        : `Attestation ${name}: ${props.tee} quote ${props.verdict}`,
    };
  }

  const props = {
    policy: isErr ? "invalid-jws" : "signed-policy-v3",
    operator: rand(["add", "remove", "replace"]),
    jwtThumbprint: randId(12),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.Attestation/attestationProviders/write",
    category: "PolicyManagement",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "400" : "200",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.Attestation/attestationProviders"),
    azure: {
      attestation: {
        provider: name,
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: "PolicyChange",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(4e6, 2e9) },
    message: isErr
      ? `Attestation ${name}: policy update failed`
      : `Attestation ${name}: policy ${props.operator} applied`,
  };
}

/** Confidential Ledger — writes, membership. */
export function generateConfidentialLedgerLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const ledger = `ledger-${randId(4).toLowerCase()}`;
  const resourceId = armLedger(subscription.id, resourceGroup, ledger);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["write", "member"] as const);

  if (variant === "write") {
    const props = {
      collectionId: rand(["app-log", "audit", "contracts"]),
      transactionId: randUUID(),
      payloadBytes: randInt(64, 65536),
      round: randInt(1, 10_000_000),
      status: isErr ? "Aborted" : "Committed",
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ConfidentialLedger.WriteEntry",
      category: "LedgerWrite",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.status,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.ConfidentialLedger/ledgers"),
      azure: {
        confidential_ledger: {
          ledger,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "WriteEntry",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e6, 3e9) },
      message: isErr
        ? `Confidential Ledger ${ledger}: append failed`
        : `Confidential Ledger ${ledger}: committed tx ${props.transactionId} round=${props.round}`,
    };
  }

  const props = {
    memberId: `member-${randId(6)}`,
    action: isErr ? "RemoveFailed" : rand(["AddTrustedMember", "RemoveMember"]),
    certificateThumbprint: randId(10),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "ConfidentialLedger.MembershipChange",
    category: "Membership",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.action,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.ConfidentialLedger/ledgers"),
    azure: {
      confidential_ledger: {
        ledger,
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: "MembershipChange",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(5e6, 4e9) },
    message: isErr
      ? `Confidential Ledger ${ledger}: membership change failed`
      : `Confidential Ledger ${ledger}: ${props.action} ${props.memberId}`,
  };
}

/** Activity Log — subscription-level admin events. */
export function generateActivityLogLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["subscription", "alerts", "resource"] as const);

  if (variant === "subscription") {
    const props = {
      eventChannels: "Administrative",
      status: isErr ? "Failed" : "Succeeded",
      subStatus: isErr ? "Forbidden" : "OK",
      httpRequest: {
        clientRequestId: randUUID(),
        clientIpAddress: callerIp,
        method: rand(["PUT", "DELETE"]),
      },
    };
    const resourceId = `/subscriptions/${subscription.id}`;
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: rand([
        "Microsoft.Resources/subscriptions/resourcegroups/write",
        "Microsoft.Authorization/roleAssignments/write",
      ]),
      category: "Administrative",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.subStatus,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Resources/subscriptions"),
      azure: {
        activity_log: {
          scope: "subscription",
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Administrative",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e6, 4e9) },
      message: isErr
        ? `Activity Log subscription ${subscription.id}: admin operation failed`
        : `Activity Log: subscription-level ${props.status} admin event`,
    };
  }

  if (variant === "alerts") {
    const alertName = `ala-${randId(5).toLowerCase()}`;
    const resourceId = armActivityLogAlert(subscription.id, resourceGroup, alertName);
    const props = {
      alertName,
      enabled: !isErr,
      conditionCount: randInt(1, 12),
      actionGroup: `ag-${randId(4)}`,
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: isErr
        ? "Microsoft.Insights/activityLogAlerts/delete"
        : "Microsoft.Insights/activityLogAlerts/write",
      category: "Administrative",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "Failed" : "Succeeded",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Insights/activityLogAlerts"),
      azure: {
        activity_log: {
          alert: alertName,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "ActivityLogAlert",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(4e6, 2e9) },
      message: isErr
        ? `Activity Log alert ${alertName}: operation failed`
        : `Activity Log: alert rule ${alertName} updated`,
    };
  }

  const props = {
    resourceName: `st${randId(7)}`,
    resourceType: "Microsoft.Storage/storageAccounts",
    actionName: isErr ? "write" : rand(["delete", "action"]),
    caller: rand(["deploy-bot", "policy-remediation"]),
  };
  const resourceId = `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/${props.resourceType}/${props.resourceName}`;
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: `Microsoft.Storage/storageAccounts/${props.actionName}`,
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "Conflict" : "Accepted",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, props.resourceType),
    azure: {
      activity_log: {
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: "ResourceOperation",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(3e6, 3e9) },
    message: isErr
      ? `Activity Log: ${props.resourceType} ${props.resourceName} failed (${props.actionName})`
      : `Activity Log: resource ${props.resourceName} ${props.actionName} by ${props.caller}`,
  };
}

/** Azure Monitor — diagnostics, Application Insights. */
export function generateMonitorLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["diagnostic", "appinsights", "pipeline"] as const);

  if (variant === "diagnostic") {
    const targetName = `st${randId(6)}`;
    const targetId = `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Storage/storageAccounts/${targetName}`;
    const props = {
      targetResourceId: targetId,
      logCategories: rand(["Audit", "AllMetrics"]),
      destination: rand(["logAnalytics", "eventHub", "storage"]),
      provisioningState: isErr ? "Failed" : "Succeeded",
    };
    const resourceId = targetId;
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Insights/diagnosticSettings/write",
      category: "DiagnosticSettings",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.provisioningState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Insights/diagnosticSettings"),
      azure: {
        monitor: {
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "DiagnosticSettings",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(4e6, 3e9) },
      message: isErr
        ? `Monitor: diagnostic settings update failed for ${targetName}`
        : `Monitor: diagnostics to ${props.destination} ${props.provisioningState}`,
    };
  }

  if (variant === "appinsights") {
    const app = `appi-${randId(5).toLowerCase()}`;
    const resourceId = armAppInsights(subscription.id, resourceGroup, app);
    const props = {
      ingestionKeyRotated: Math.random() < 0.2,
      samplingPercentage: rand([100, 50, 20, 10]),
      liveMetrics: rand(["enabled", "disabled"]),
      dailyCapGb: rand([1, 5, 25, 100]),
      operation: isErr ? "UpdateFailed" : rand(["Create", "Purge", "Update"]),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: `Microsoft.Insights/components/${props.operation}`,
      category: "ApplicationInsights",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.operation,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Insights/components"),
      azure: {
        monitor: {
          component: app,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "ApplicationInsights",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e6, 4e9) },
      message: isErr
        ? `Application Insights ${app}: operation failed`
        : `Application Insights ${app}: ${props.operation} sampling=${props.samplingPercentage}%`,
    };
  }

  const props = {
    bytesIngested: isErr ? 0 : randInt(1e6, 5e11),
    throttled: !isErr && Math.random() < 0.08,
    droppedSeries: isErr ? randInt(10, 5000) : randInt(0, 50),
    pipeline: "metrics-platform",
  };
  const resourceId = `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Insights/dataCollectionEndpoints/dce-${randId(4)}`;
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.Monitor/dataCollection/pipeline",
    category: "MetricsPipeline",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "Throttle" : "OK",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.Insights/dataCollectionEndpoints"),
    azure: {
      monitor: {
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: "Ingestion",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(2e7, 7e9) },
    message: isErr
      ? `Monitor ingestion pipeline: drops=${props.droppedSeries}`
      : `Monitor pipeline: ingested ${props.bytesIngested} bytes${props.throttled ? " (throttled)" : ""}`,
  };
}

/** Azure Policy — compliance, remediation. */
export function generatePolicyLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const assignment = `pa-${randId(5).toLowerCase()}`;
  const resourceId = armPolicyAssignment(subscription.id, resourceGroup, assignment);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["evaluate", "remediate"] as const);

  if (variant === "evaluate") {
    const props = {
      policyDefinitionId: `/providers/Microsoft.Authorization/policyDefinitions/${randUUID()}`,
      complianceState: isErr ? "Error" : rand(["Compliant", "NonCompliant"]),
      nonCompliantResources: isErr ? -1 : randInt(0, 400),
      scanId: randUUID(),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.PolicyInsights/policyStates/triggerEvaluation",
      category: "PolicyEvaluation",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.complianceState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Authorization/policyAssignments"),
      azure: {
        policy: {
          assignment,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Compliance",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(2e7, 9e9) },
      message: isErr
        ? `Policy ${assignment}: evaluation failed`
        : `Policy scan ${props.scanId}: ${props.complianceState} (${props.nonCompliantResources} resources)`,
    };
  }

  const props = {
    taskName: `remediate-${randId(4)}`,
    targetCount: randInt(1, 200),
    succeeded: isErr ? 0 : randInt(1, 200),
    failed: isErr ? randInt(1, 40) : randInt(0, 5),
    deploymentId: randUUID(),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.PolicyInsights/remediations/write",
    category: "Remediation",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "PartialFailure" : "Succeeded",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.PolicyInsights/remediations"),
    azure: {
      policy: {
        assignment,
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: "Remediation",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(5e7, 12e9) },
    message: isErr
      ? `Policy remediation ${props.taskName}: ${props.failed} failures`
      : `Policy remediation ${props.taskName}: fixed ${props.succeeded}/${props.targetCount}`,
  };
}

/** Azure Advisor — recommendations, suppressions. */
export function generateAdvisorLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["generate", "suppress"] as const);
  const resourceId = `/subscriptions/${subscription.id}/providers/Microsoft.Advisor/recommendations/${randId(10)}`;

  if (variant === "generate") {
    const props = {
      category: rand(["Cost", "Security", "Performance", "HighAvailability"]),
      impact: rand(["High", "Medium", "Low"]),
      freshCount: isErr ? 0 : randInt(3, 120),
      suppressedCount: randInt(0, 20),
      scanId: randUUID(),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Advisor/recommendations/generate",
      category: "RecommendationRefresh",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.freshCount),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Advisor/recommendations"),
      azure: {
        advisor: {
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Generation",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e7, 6e9) },
      message: isErr
        ? `Advisor: recommendation generation failed`
        : `Advisor: ${props.freshCount} new ${props.category} recommendations (${props.impact} impact)`,
    };
  }

  const props = {
    recommendationId: `/subscriptions/${subscription.id}/providers/Microsoft.Advisor/recommendations/${randId(8)}`,
    ttl: `${randInt(30, 365)}d`,
    reason: rand(["noise", "accepted_risk", "third_party"]),
    suppressSuccess: !isErr,
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.Advisor/recommendations/suppressions/write",
    category: "Suppression",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.suppressSuccess ? "Created" : "Failed",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.Advisor/recommendations"),
    azure: {
      advisor: {
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: "Suppression",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(3e6, 2e9) },
    message: isErr
      ? `Advisor suppression failed for ${props.recommendationId}`
      : `Advisor: suppressed recommendation reason=${props.reason} ttl=${props.ttl}`,
  };
}

/** Cost Management — exports, budgets. */
export function generateCostManagementLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const exportName = `export-${randId(4).toLowerCase()}`;
  const resourceId = armCostExport(subscription.id, resourceGroup, exportName);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["export", "budget"] as const);

  if (variant === "export") {
    const props = {
      format: rand(["Csv", "Parquet"]),
      storageAccount: `st${randId(7)}`,
      blobPath: `cost/${rand(["daily", "monthly"])}/${randUUID()}.csv`,
      runId: randUUID(),
      rowCount: isErr ? 0 : randInt(1000, 9_000_000),
      bytesWritten: isErr ? 0 : randInt(50_000, 4e9),
      status: isErr ? "Failed" : "Completed",
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.CostManagement/exports/run/action",
      category: "ExportRun",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.status,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.CostManagement/exports"),
      azure: {
        cost_management: {
          export: exportName,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Export",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e7, 15e9) },
      message: isErr
        ? `Cost export ${exportName}: run ${props.runId} failed`
        : `Cost export ${exportName}: wrote ${props.rowCount} rows to ${props.blobPath}`,
    };
  }

  const budgetName = `budget-${randId(4)}`;
  const budgetId = `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Consumption/budgets/${budgetName}`;
  const thresholdPercent = rand([50, 80, 90, 100, 110]);
  const fired = !isErr && thresholdPercent >= 80 && Math.random() < 0.55;
  const props = {
    budgetName,
    thresholdPercent,
    amountUsd: randInt(500, 500_000),
    notifyEmails: randInt(1, 8),
    fired,
  };
  return {
    "@timestamp": ts,
    time,
    resourceId: budgetId,
    operationName: "Microsoft.Consumption/budgets/alert",
    category: "BudgetAlert",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.fired ? "Triggered" : "OK",
    callerIpAddress: callerIp,
    correlationId,
    level: props.fired ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.Consumption/budgets"),
    azure: {
      cost_management: {
        budget: budgetName,
        resource_group: resourceGroup,
        resource_id: budgetId,
        category: "BudgetThreshold",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e6, 5e9) },
    message: props.fired
      ? `Budget ${budgetName}: threshold ${props.thresholdPercent}% reached ($${props.amountUsd})`
      : `Budget ${budgetName}: within threshold`,
  };
}

/** Resource Graph — query execution. */
export function generateResourceGraphLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const queryId = `q_${randId(12)}`;
  const resourceId = `/subscriptions/${subscription.id}/providers/Microsoft.ResourceGraph/resources/${queryId}`;
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const props = {
    queryId,
    queryLength: randInt(40, 8000),
    resultCount: isErr ? 0 : randInt(0, 50_000),
    shardsQueried: randInt(4, 400),
    durationMs: isErr ? randInt(5000, 120_000) : randInt(80, 12_000),
    truncated: !isErr && Math.random() < 0.12,
    statusCode: isErr ? rand([400, 429, 500]) : 200,
    subscriptionScope: subscription.id,
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.ResourceGraph/resources/read",
    category: "QueryExecution",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: String(props.statusCode),
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.ResourceGraph/queries"),
    azure: {
      resource_graph: {
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: "Query",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e6, 4e9) },
    message: isErr
      ? `Resource Graph query ${queryId}: failed (${props.statusCode})`
      : `Resource Graph: ${props.resultCount} resources in ${props.durationMs}ms${props.truncated ? " [truncated]" : ""}`,
  };
}

/** Blueprints — assignment, compliance. */
export function generateBlueprintsLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const assignment = `bp-assign-${randId(4).toLowerCase()}`;
  const resourceId = armBlueprintAssignment(subscription.id, resourceGroup, assignment);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["publish", "compliance"] as const);

  if (variant === "publish") {
    const props = {
      blueprintId: `/subscriptions/${subscription.id}/providers/Microsoft.Blueprint/blueprints/base-landing`,
      version: `v${randInt(1, 9)}.${randInt(0, 9)}`,
      artifactsDeployed: isErr ? 0 : randInt(6, 120),
      assignmentState: isErr ? "Failed" : rand(["Succeeded", "Deploying"]),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Blueprint/blueprintAssignments/write",
      category: "BlueprintAssignment",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.assignmentState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Blueprint/blueprintAssignments"),
      azure: {
        blueprints: {
          assignment,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Publish",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(2e8, 18e9) },
      message: isErr
        ? `Blueprint assignment ${assignment}: publish failed`
        : `Blueprint ${assignment}: published ${props.version} artifacts=${props.artifactsDeployed}`,
    };
  }

  const props = {
    blueprintName: rand(["secure-baseline", "iso-27001", "caf-foundation"]),
    compliantArtifacts: isErr ? 0 : randInt(4, 80),
    driftCount: isErr ? randInt(3, 40) : randInt(0, 8),
    lastScan: time,
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.Blueprint/blueprintAssignments/compliance",
    category: "ComplianceDrift",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.driftCount > 0 ? "Drift" : "Compliant",
    callerIpAddress: callerIp,
    correlationId,
    level: props.driftCount > 0 ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.Blueprint/blueprintAssignments"),
    azure: {
      blueprints: {
        assignment,
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: "Compliance",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(5e7, 5e9) },
    message: isErr
      ? `Blueprint compliance scan failed for ${assignment}`
      : `Blueprint ${props.blueprintName}: ${props.compliantArtifacts} compliant, drift=${props.driftCount}`,
  };
}
