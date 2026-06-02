import {
  type EcsDocument,
  rand,
  randInt,
  randId,
  randIp,
  azureCloud,
  makeAzureSetup,
  randUUID,
  randIamUser,
} from "./helpers.js";

const AI_SECURITY_ERR_CODES = [
  "ModelNotFound",
  "DeploymentQuotaExceeded",
  "EndpointNotFound",
  "CognitiveServicesAccountNotFound",
  "KeyVaultAccessDenied",
  "AuthorizationFailed",
  "ThrottlingException",
  "InternalServerError",
] as const;

type AiSecurityTopError = { code: string; message: string; type: "azure" };

function aiSecurityErrMessage(code: (typeof AI_SECURITY_ERR_CODES)[number]): string {
  switch (code) {
    case "ModelNotFound":
      return "The specified cognitive model deployment was not found.";
    case "DeploymentQuotaExceeded":
      return "Regional deployment concurrency limit exceeded for this subscription.";
    case "EndpointNotFound":
      return "Inference endpoint URL could not be resolved.";
    case "CognitiveServicesAccountNotFound":
      return "Azure AI / Cognitive Services account does not exist in this tenant.";
    case "KeyVaultAccessDenied":
      return "Denied access to referenced Key Vault secret for API authentication.";
    case "AuthorizationFailed":
      return "Caller is not authorized to perform the operation.";
    case "ThrottlingException":
      return "Too many inference requests — rate limiting applied.";
    default:
      return "Service returned an internal error while executing the inference request.";
  }
}

function aiSecurityPickError(isErr: boolean): AiSecurityTopError | undefined {
  if (!isErr) return undefined;
  const code = rand([...AI_SECURITY_ERR_CODES]);
  return { code, message: aiSecurityErrMessage(code), type: "azure" };
}

function mergeAiSecurityArmProps(
  isErr: boolean,
  armProvisioning: boolean,
  props: Record<string, unknown>,
  err: AiSecurityTopError | undefined
): Record<string, unknown> {
  if (!isErr || !armProvisioning || !err) return props;
  return {
    ...props,
    statusMessage: {
      error: {
        code: err.code,
        message: `ARM-level description: ${err.message}`,
      },
    },
  };
}

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
  const variant = rand([
    "admin",
    "api",
    "throttle",
    "privateLink",
    "modelDeploy",
    "usage",
  ] as const);

  if (variant === "admin") {
    const docErr = aiSecurityPickError(isErr);
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
    const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.CognitiveServices/accounts"),
      azure: {
        cognitive_services: {
          account,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Administrative",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String(op),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e7, 3e9),
      },
      message: isErr
        ? `Cognitive Services ${account}: ${op} failed (status ${statusCode})`
        : `Cognitive Services ${account}: control plane ${op} completed`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "throttle") {
    const docErr = aiSecurityPickError(true);
    const op = rand([
      "TextAnalytics.Entities",
      "Face.Detect",
      "ContentModerator.Scan",
      "CustomVision.Predict",
    ]);
    const statusCode = 429;
    const props = {
      operation: op,
      apiVersion: "2023-05-15",
      latencyMs: randInt(5, 120),
      billingTokens: randInt(1, 800),
      statusCode,
      retryAfter: `${randInt(1, 60)}s`,
      quotaRemaining: 0,
      callerIpAddress: callerIp,
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(true, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "CognitiveServices.Throttled",
      category: "RateLimiting",
      resultType: "Failure",
      resultSignature: String(statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: "Warning",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.CognitiveServices/accounts"),
      azure: {
        cognitive_services: {
          account,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "RateLimiting",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: ["denied"],
        action: String("CognitiveServices.Throttled"),
        outcome: "failure",
        duration: randInt(1e6, 2e8),
      },
      message: `Cognitive Services ${account}: throttled on ${op} retryAfter=${props.retryAfter}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "privateLink") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      privateEndpoint: `pe-${randId(6)}`,
      connectionState: isErr ? "Disconnected" : "Approved",
      dnsZone: `privatelink.cognitiveservices.azure.com`,
      statusCode: isErr ? rand([403, 404]) : 200,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.CognitiveServices/accounts/privateEndpointConnections/write",
      category: "PrivateLink",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.CognitiveServices/accounts"),
      azure: {
        cognitive_services: {
          account,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "PrivateLink",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.CognitiveServices/accounts/privateEndpointConnections/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(8e8, 4e10),
      },
      message: isErr
        ? `Cognitive Services ${account}: private endpoint ${props.privateEndpoint} failed`
        : `Private link approved for ${account}/${props.privateEndpoint}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "modelDeploy") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      deploymentName: `${rand(["gpt-4", "gpt-35-turbo"])}-${randId(3)}`,
      modelVersion: rand(["0613", "1106"]),
      capacityUnits: isErr ? 0 : randInt(10, 500),
      state: isErr ? "Failed" : "Succeeded",
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.CognitiveServices/accounts/deployments/write",
      category: "ModelDeployment",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.state,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.CognitiveServices/accounts"),
      azure: {
        cognitive_services: {
          account,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Deployments",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.CognitiveServices/accounts/deployments/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e11, 2e13),
      },
      message: isErr
        ? `Cognitive ${account}: deployment ${props.deploymentName} failed`
        : `Cognitive ${account}: deployed ${props.deploymentName} (${props.capacityUnits} units)`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "usage") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      billingPeriodStart: `${time.slice(0, 10)}T00:00:00Z`,
      tokensConsumed: isErr ? 0 : randInt(5000, 9e8),
      requestCount: randInt(10, 50000),
      statusCode: isErr ? rand([500, 503]) : 200,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "CognitiveServices.UsageReport",
      category: "Usage",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.CognitiveServices/accounts"),
      azure: {
        cognitive_services: {
          account,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Metering",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("CognitiveServices.UsageReport"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(6e9, 2e11),
      },
      message: isErr
        ? `Cognitive ${account}: usage roll-up failed (${props.statusCode})`
        : `Cognitive ${account}: billed requests=${props.requestCount}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  const fail = isErr && Math.random() < 0.55;
  const docErr = aiSecurityPickError(fail);
  const op = rand([
    "TextAnalytics.Entities",
    "Face.Detect",
    "ContentModerator.Scan",
    "CustomVision.Predict",
  ]);
  const statusCode = fail ? rand([400, 500, 503]) : 200;
  const props = {
    operation: op,
    apiVersion: "2023-05-15",
    latencyMs: fail ? randInt(50, 800) : randInt(12, 1800),
    billingTokens: randInt(1, 800),
    statusCode,
    retryAfter: undefined as string | undefined,
    quotaRemaining: randInt(10, 9000),
    callerIpAddress: callerIp,
    correlationId,
  };
  const propsForDoc = mergeAiSecurityArmProps(fail, false, props, docErr);
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "CognitiveServices.Request",
    category: "RequestResponse",
    resultType: statusCode >= 400 ? "Failure" : "Success",
    resultSignature: String(statusCode),
    callerIpAddress: callerIp,
    correlationId,
    level: statusCode >= 400 ? "Error" : "Information",
    properties: propsForDoc,
    cloud: azureCloud(region, subscription, "Microsoft.CognitiveServices/accounts"),
    azure: {
      cognitive_services: {
        account,
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: "RequestResponse",
        correlation_id: correlationId,
        properties: propsForDoc,
      },
    },
    event: {
      outcome: statusCode >= 400 ? "failure" : "success",
      duration: randInt(1e6, 4e9),
    },
    message:
      statusCode >= 400
        ? `Cognitive Services ${account}: ${op} failed HTTP ${statusCode}`
        : `Cognitive Services ${account}: ${op} completed latencyMs=${props.latencyMs}`,
    ...(docErr ? { error: docErr } : {}),
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
  const variant = rand([
    "experiment",
    "deployment",
    "compute",
    "datastore",
    "workspaceAdmin",
    "inference",
  ] as const);

  if (variant === "experiment") {
    const docErr = aiSecurityPickError(isErr);
    const runId = `run_${randId(10)}`;
    const props = {
      experimentName: rand(["finance-default", "churn-v2", "pricing-alpha"]),
      runId,
      status: isErr ? "Failed" : rand(["Completed", "Running", "Queued"]),
      durationSeconds: isErr ? randInt(12, 400) : randInt(120, 7200),
      target: rand(["cpu-cluster", "gpu-v100", "serverless"]),
      metricsLogged: randInt(5, 900),
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.MachineLearningServices/workspaces"),
      azure: {
        machine_learning: {
          workspace: ws,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "AmlRunStatus",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("AzureML.ExperimentRun"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e7, 6e9),
      },
      message: isErr
        ? `AML workspace ${ws}: experiment run ${runId} failed`
        : `AML workspace ${ws}: run ${runId} ${props.status}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "deployment") {
    const docErr = aiSecurityPickError(isErr);
    const endpoint = `ep-${randId(5).toLowerCase()}`;
    const props = {
      endpointName: endpoint,
      modelName: rand(["sklearn-gbdt", "torch-resnet", "xgboost-risk"]),
      modelVersion: String(randInt(1, 42)),
      aksName: rand(["aml-aks-prod", "aml-aks-stg"]),
      provisioningState: isErr ? "Failed" : rand(["Succeeded", "Updating"]),
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.MachineLearningServices/workspaces"),
      azure: {
        machine_learning: {
          workspace: ws,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "AmlDeploymentEvent",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("AzureML.ModelDeployment"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(8e7, 12e9),
      },
      message: isErr
        ? `AML ${ws}: deployment ${endpoint} failed`
        : `AML ${ws}: model deployment ${endpoint} ${props.provisioningState}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "compute") {
    const docErr = aiSecurityPickError(isErr);
    const cluster = `cl-${randId(5).toLowerCase()}`;
    const props = {
      computeName: cluster,
      vmSize: rand(["Standard_DS3_v2", "Standard_NC6s_v3"]),
      nodeCount: randInt(0, 8),
      operation: isErr ? "Resize" : rand(["Create", "Scale", "Delete"]),
      state: isErr ? "Failed" : rand(["Succeeded", "InProgress"]),
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.MachineLearningServices/workspaces"),
      azure: {
        machine_learning: {
          workspace: ws,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Administrative",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.MachineLearningServices/workspaces/computes/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e8, 5e9),
      },
      message: isErr
        ? `AML compute ${cluster} in ${ws}: provisioning failed`
        : `AML compute ${cluster}: ${props.operation} ${props.state}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "datastore") {
    const docErr = aiSecurityPickError(isErr);
    const ds = `ds_${randId(5)}`;
    const props = {
      datastoreName: ds,
      storeType: rand(["AzureBlob", "AzureDataLakeGen2", "AzureFiles"]),
      account: `stor${randId(4)}`,
      operation: rand(["Validate", "Create", "RotateKeys"]),
      statusCode: isErr ? rand([403, 500]) : 200,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.MachineLearningServices/workspaces/datastores/write",
      category: "Datastores",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.MachineLearningServices/workspaces"),
      azure: {
        machine_learning: {
          workspace: ws,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Datastores",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.MachineLearningServices/workspaces/datastores/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e7, 2e9),
      },
      message: isErr
        ? `AML datastore ${ds} (${props.storeType}) validation failed (${props.statusCode})`
        : `AML datastore ${ds} registered against ${props.account}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "workspaceAdmin") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      sku: rand(["basic", "standard", "premium"]),
      publicNetworkAccess: isErr ? "Disabled" : "Enabled",
      keyVaultIntegration: rand(["Healthy", "Degraded"]),
      statusCode: isErr ? rand([409, 500]) : 202,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.MachineLearningServices/workspaces/write",
      category: "WorkspaceManagement",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.MachineLearningServices/workspaces"),
      azure: {
        machine_learning: {
          workspace: ws,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "WorkspaceManagement",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.MachineLearningServices/workspaces/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e8, 4e10),
      },
      message: isErr
        ? `AML workspace ${ws}: SKU / networking update rejected`
        : `AML workspace ${ws}: SKU ${props.sku} provisioning accepted`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  const docErr = aiSecurityPickError(isErr);
  const endpointName = `scoring-${randId(4)}`;
  const props = {
    endpointName,
    requestType: rand(["Realtime", "Batch"]),
    statusCode: isErr ? rand([502, 503, 504]) : 200,
    latencyMs: isErr ? randInt(900, 8000) : randInt(8, 400),
    invocationsPerSecond: randFloat(1, isErr ? 0.05 : 85),
    modelSku: rand(["Standard_DS2_v2", "Standard_DS3_v2"]),
  };
  const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "AzureML.ManagedOnlineEndpoint.ScoringRun",
    category: "Inferencing",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: String(props.statusCode),
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: propsForDoc,
    cloud: azureCloud(region, subscription, "Microsoft.MachineLearningServices/workspaces"),
    azure: {
      machine_learning: {
        workspace: ws,
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: "Inferencing",
        correlation_id: correlationId,
        properties: propsForDoc,
      },
    },
    event: {
      kind: "event",
      category: ["intrusion_detection"],
      type: isErr ? ["denied"] : ["info"],
      action: String("AzureML.ManagedOnlineEndpoint.ScoringRun"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(9e8, 3e11),
    },
    message: isErr
      ? `AML ${ws}/${endpointName}: realtime scoring degraded (${props.statusCode})`
      : `AML scoring ${endpointName}: ${props.requestType.toLowerCase()} throughput OK`,
    ...(docErr ? { error: docErr } : {}),
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
  const variant = rand(["index", "query", "skill", "synonymMap", "rbac", "indexer"] as const);

  if (variant === "index") {
    const docErr = aiSecurityPickError(isErr);
    const indexName = `idx-${rand(["products", "docs", "tickets"])}`;
    const props = {
      indexName,
      operation: rand(["createOrUpdate", "delete", "analyze"]),
      documentsIndexed: randInt(0, 5_000_000),
      statusCode: isErr ? rand([400, 409]) : rand([200, 202]),
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Search/searchServices"),
      azure: {
        ai_search: {
          service: svc,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "IndexManagement",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String(`SearchService.IndexManagement/${props.operation}`),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e7, 4e9),
      },
      message: isErr
        ? `AI Search ${svc}: index ${indexName} operation failed`
        : `AI Search ${svc}: index ${indexName} ${props.operation} OK`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "query") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      searchTextLength: randInt(3, 512),
      resultsCount: isErr ? 0 : randInt(1, 500),
      queryLatencyMs: isErr ? randInt(400, 4000) : randInt(8, 220),
      searchMode: rand(["any", "all"]),
      apiVersion: "2024-07-01",
      statusCode: isErr ? rand([408, 500]) : 200,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Search/searchServices"),
      azure: {
        ai_search: {
          service: svc,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "QueryExecution",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("SearchService.SearchQuery"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e5, 2e9),
      },
      message: isErr
        ? `AI Search ${svc}: query execution error (${props.statusCode})`
        : `AI Search ${svc}: query returned ${props.resultsCount} docs in ${props.queryLatencyMs}ms`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "skill") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      skillsetName: `skill-${randId(4)}`,
      skillType: rand(["#Microsoft.Skills.Text.MergeSkill", "#Microsoft.Skills.Vision.OcrSkill"]),
      documentsProcessed: isErr ? 0 : randInt(1, 2000),
      errors: isErr ? randInt(1, 50) : 0,
      status: isErr ? "Failed" : "Succeeded",
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Search/searchServices"),
      azure: {
        ai_search: {
          service: svc,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "SkillExecution",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("SearchService.SkillExecution"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e7, 8e9),
      },
      message: isErr
        ? `AI Search ${svc}: skill ${props.skillsetName} execution failed`
        : `AI Search ${svc}: skill ${props.skillType} processed ${props.documentsProcessed} docs`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "synonymMap") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      synonymMapName: `syn_${rand(["en", "es", "de"])}`,
      mapsRuleCount: randInt(5, 400),
      statusCode: isErr ? rand([400, 500]) : 200,
      operation: rand(["refresh", "create", "rollback"]),
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "SearchService.SynonymMaps/write",
      category: "Configuration",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Search/searchServices"),
      azure: {
        ai_search: {
          service: svc,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Synonyms",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("SearchService.SynonymMaps/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e7, 3e9),
      },
      message: isErr
        ? `AI Search ${svc}: synonym map ${props.synonymMapName} ${props.operation} failed (${props.statusCode})`
        : `Synonym map ${props.synonymMapName} refreshed (${props.mapsRuleCount} rules)`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "rbac") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      callerRole: rand(["Search Index Data Reader", "Search Service Contributor"]),
      objectId: randUUID(),
      operation: rand(["authorize", "deny"]),
      statusCode: isErr ? rand([401, 403]) : 200,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "SearchService.DataPlaneAuth",
      category: "RoleBasedAccess",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Search/searchServices"),
      azure: {
        ai_search: {
          service: svc,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "RBAC",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("SearchService.DataPlaneAuth"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e8, 2e10),
      },
      message: isErr
        ? `AI Search ${svc}: RBAC denial for principal ${props.objectId.slice(0, 8)}`
        : `AI Search RBAC authorization granted (${props.callerRole})`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  const docErr = aiSecurityPickError(isErr);
  const props = {
    indexerName: `idx-${randId(4)}`,
    dataSourceType: rand(["azureblob", "cosmosdb", "sharepoint-online"]),
    lastRunOutcome: isErr ? "PermanentFailure" : "Success",
    itemsFailed: isErr ? randInt(1, 200) : 0,
    statusCode: isErr ? rand([500, 503]) : 202,
    cursor: randUUID(),
  };
  const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "SearchService.Indexer.Run",
    category: "IndexerExecution",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.lastRunOutcome,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: propsForDoc,
    cloud: azureCloud(region, subscription, "Microsoft.Search/searchServices"),
    azure: {
      ai_search: {
        service: svc,
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: "Indexer",
        correlation_id: correlationId,
        properties: propsForDoc,
      },
    },
    event: {
      kind: "event",
      category: ["intrusion_detection"],
      type: isErr ? ["denied"] : ["info"],
      action: String("SearchService.Indexer.Run"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(4e10, 2e13),
    },
    message: isErr
      ? `AI Search indexer ${props.indexerName} stalled (${props.itemsFailed} batches failed)`
      : `Indexer ${props.indexerName} ingestion batch committed`,
    ...(docErr ? { error: docErr } : {}),
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
  const variant = rand([
    "message",
    "channel",
    "session",
    "webhook",
    "oauth",
    "provisioning",
  ] as const);

  if (variant === "message") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      channelId: rand(["webchat", "msteams", "directline"]),
      activityType: rand(["message", "conversationUpdate"]),
      userId: `u-${randId(8)}`,
      textBytes: randInt(8, 4000),
      latencyMs: isErr ? randInt(200, 5000) : randInt(20, 400),
      status: isErr ? "DeliveryFailed" : "Delivered",
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.BotService/botServices"),
      azure: {
        bot_service: {
          bot,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "BotMessages",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("BotService.Message"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e5, 2e9),
      },
      message: isErr
        ? `Bot ${bot}: message delivery failed on ${props.channelId}`
        : `Bot ${bot}: message handled on ${props.channelId}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "channel") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      channel: rand(["DirectLine", "Slack", "Email"]),
      operation: isErr ? "RegisterFailed" : rand(["Register", "Unregister", "TokenRefresh"]),
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.BotService/botServices"),
      azure: {
        bot_service: {
          bot,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "ChannelOperations",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("BotService.ChannelOperation"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(8e6, 2e9),
      },
      message: isErr
        ? `Bot ${bot}: channel ${props.channel} operation failed`
        : `Bot ${bot}: channel ${props.operation} ${props.channel}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "session") {
    const docErr = aiSecurityPickError(isErr);
    const convId = `conv-${randUUID().slice(0, 18)}`;
    const props = {
      conversationId: convId,
      action: rand(["Start", "Continue", "End"]),
      watermark: randInt(1, 9999),
      stateStore: rand(["cosmos", "blob"]),
      expired: isErr,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.BotService/botServices"),
      azure: {
        bot_service: {
          bot,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "SessionManagement",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("BotService.SessionState"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e5, 1e9),
      },
      message: isErr
        ? `Bot ${bot}: session ${convId} state error`
        : `Bot ${bot}: session ${convId} ${props.action}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "webhook") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      callbackUrlHost: rand(["botservice.azurewebsites.net", "api.enterprise.meridiantech"]),
      verifiedSignature: !isErr,
      httpStatus: isErr ? rand([401, 500, 504]) : 202,
      deliveryAttempt: randInt(1, 5),
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "BotService.OutgoingWebhookDelivery",
      category: "Webhooks",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.httpStatus),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.BotService/botServices"),
      azure: {
        bot_service: {
          bot,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "OutboundWebhooks",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("BotService.OutgoingWebhookDelivery"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e9, 3e11),
      },
      message: isErr
        ? `Bot ${bot}: webhook callback failed (${props.httpStatus}), attempt=${props.deliveryAttempt}`
        : `Bot ${bot}: outgoing webhook ACK from ${props.callbackUrlHost}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "oauth") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      connectionName: rand(["aad-v2", "google-oauth2", "slack-user"]),
      tokenExchangeStatus: isErr ? "ConsentDenied" : "Succeeded",
      scopesRequested: rand(["User.Read offline_access", "openid profile"]),
      statusCode: isErr ? rand([400, 401]) : 200,
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "BotService.OAuth.SignInExchange",
      category: "Identity",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.BotService/botServices"),
      azure: {
        bot_service: {
          bot,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "OAuth",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("BotService.OAuth.SignInExchange"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e11, 2e13),
      },
      message: isErr
        ? `Bot ${bot}: OAuth handshake failed for ${props.connectionName}`
        : `OAuth token exchange succeeded for ${props.connectionName}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  const docErr = aiSecurityPickError(isErr);
  const sku = rand(["F0", "S1"]);
  const props = {
    sku,
    microsoftAppType: rand(["MultiTenant", "SingleTenant"]),
    provisioningState: isErr ? "Failed" : rand(["Succeeded", "Updating"]),
    statusCode: isErr ? rand([409, 500]) : 202,
    correlationId,
  };
  const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.BotService/botServices/write",
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: String(props.statusCode),
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: propsForDoc,
    cloud: azureCloud(region, subscription, "Microsoft.BotService/botServices"),
    azure: {
      bot_service: {
        bot,
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: "Administrative",
        correlation_id: correlationId,
        properties: propsForDoc,
      },
    },
    event: {
      kind: "event",
      category: ["intrusion_detection"],
      type: isErr ? ["denied"] : ["info"],
      action: String("Microsoft.BotService/botServices/write"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(1e10, 3e13),
    },
    message: isErr
      ? `Bot ${bot}: resource provisioning aborted (${sku})`
      : `Bot ${bot}: SKU ${sku} assignment ${props.provisioningState.toLowerCase()}`,
    ...(docErr ? { error: docErr } : {}),
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
  const variant = rand([
    "analyze",
    "ocr",
    "spatial",
    "moderation",
    "tagging",
    "thumbnail",
  ] as const);

  if (variant === "analyze") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      visualFeatures: rand(["Categories,Tags", "Faces,Adult"]),
      language: rand(["en", "es", "fr"]),
      width: randInt(640, 4096),
      height: randInt(480, 4096),
      latencyMs: isErr ? randInt(80, 2000) : randInt(25, 900),
      statusCode: isErr ? rand([400, 429, 500]) : 200,
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ComputerVision.AnalyzeImage",
      category: "ComputerVision",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.CognitiveServices/accounts"),
      azure: {
        vision: {
          account,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: variant,
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("ComputerVision.AnalyzeImage"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e6, 3e9),
      },
      message: isErr
        ? `Computer Vision ${account}: analyze failed (${props.statusCode})`
        : `Computer Vision ${account}: AnalyzeImage completed in ${props.latencyMs}ms`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "ocr") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      language: rand(["en", "es", "fr"]),
      width: randInt(640, 4096),
      height: randInt(480, 4096),
      latencyMs: isErr ? randInt(80, 2000) : randInt(25, 900),
      regionsDetected: !isErr ? randInt(1, 120) : 0,
      statusCode: isErr ? rand([400, 429, 500]) : 200,
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ComputerVision.Read",
      category: "ComputerVision",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.CognitiveServices/accounts"),
      azure: {
        vision: {
          account,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: variant,
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("ComputerVision.Read"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e6, 3e9),
      },
      message: isErr
        ? `Computer Vision ${account}: OCR failed (${props.statusCode})`
        : `Computer Vision ${account}: OCR regions=${props.regionsDetected}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "spatial") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      language: rand(["en", "es", "fr"]),
      width: randInt(640, 4096),
      height: randInt(480, 4096),
      latencyMs: isErr ? randInt(80, 2000) : randInt(25, 900),
      peopleCount: !isErr ? randInt(0, 80) : (undefined as number | undefined),
      statusCode: isErr ? rand([400, 429, 500]) : 200,
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ComputerVision.AnalyzeImage/spatial",
      category: "SpatialAnalysis",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.CognitiveServices/accounts"),
      azure: {
        vision: {
          account,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: variant,
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("ComputerVision.AnalyzeImage/spatial"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e6, 3e9),
      },
      message: isErr
        ? `Computer Vision ${account}: spatial failed (${props.statusCode})`
        : `Spatial analysis peopleCount=${props.peopleCount}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "moderation") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      adultScore: randFloat(0, isErr ? 0.91 : 0.12),
      racyScore: randFloat(0, 0.3),
      isAdultClassification: !isErr,
      latencyMs: isErr ? randInt(90, 1500) : randInt(20, 500),
      statusCode: isErr ? rand([500, 503]) : 200,
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ComputerVision.ModernContentModeration",
      category: "ContentModeration",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.CognitiveServices/accounts"),
      azure: {
        vision: {
          account,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: variant,
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("ComputerVision.ModernContentModeration"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e6, 2e10),
      },
      message: isErr
        ? `Computer Vision ${account}: moderation pipeline error`
        : `Moderation flagged adult=${props.isAdultClassification}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "tagging") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      tagsEmitted: !isErr ? randInt(2, 40) : 0,
      confidenceThreshold: randFloat(0.25, 0.85),
      language: rand(["en", "es"]),
      latencyMs: isErr ? randInt(60, 1200) : randInt(25, 400),
      statusCode: isErr ? rand([400, 408]) : 200,
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ComputerVision.TagImage",
      category: "ImageTagging",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.CognitiveServices/accounts"),
      azure: {
        vision: {
          account,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: variant,
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("ComputerVision.TagImage"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e7, 2e9),
      },
      message: isErr
        ? `Computer Vision ${account}: tagging request timed out (${props.statusCode})`
        : `${props.tagsEmitted} tags emitted above ${props.confidenceThreshold}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  const docErr = aiSecurityPickError(isErr);
  const props = {
    thumbDimension: rand([64, 128, 256]),
    smartCrop: rand([true, false]),
    sharpenLevel: randFloat(0.1, 0.95),
    bytesWritten: !isErr ? randInt(2_500, 90_000) : 0,
    statusCode: isErr ? rand([413, 500]) : 200,
    correlationId,
  };
  const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "ComputerVision.GenerateThumbnail",
    category: "Thumbnails",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: String(props.statusCode),
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: propsForDoc,
    cloud: azureCloud(region, subscription, "Microsoft.CognitiveServices/accounts"),
    azure: {
      vision: {
        account,
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: variant,
        correlation_id: correlationId,
        properties: propsForDoc,
      },
    },
    event: {
      kind: "event",
      category: ["intrusion_detection"],
      type: isErr ? ["denied"] : ["info"],
      action: String("ComputerVision.GenerateThumbnail"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(1e9, 2e11),
    },
    message: isErr
      ? `Computer Vision ${account}: thumbnail render failed (${props.statusCode})`
      : `${props.thumbDimension}px thumbnail (${props.smartCrop ? "smart" : "center"} crop)`,
    ...(docErr ? { error: docErr } : {}),
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
  const variant = rand([
    "recognize",
    "synthesize",
    "translate",
    "customVoice",
    "speechEndpoint",
    "batchTranscribe",
  ] as const);

  const baseReturn = (
    op: string,
    statusCode: number,
    azureCategory: string,
    docErrReturn: AiSecurityTopError | undefined,
    propsForDoc: Record<string, unknown>,
    message: string
  ): EcsDocument => ({
    "@timestamp": ts,
    time,
    resourceId,
    operationName: op,
    category: "Speech",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: String(statusCode),
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: propsForDoc,
    cloud: azureCloud(region, subscription, "Microsoft.CognitiveServices/accounts"),
    azure: {
      speech: {
        account,
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: azureCategory,
        correlation_id: correlationId,
        properties: propsForDoc,
      },
    },
    event: {
      kind: "event",
      category: ["intrusion_detection"],
      type: isErr ? ["denied"] : ["info"],
      action: String(op),
      outcome: isErr ? "failure" : "success",
      duration: randInt(1e6, 5e9),
    },
    message,
    ...(docErrReturn ? { error: docErrReturn } : {}),
  });

  if (variant === "recognize") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      locale: rand(["en-US", "es-ES", "de-DE"]),
      audioDurationSec: randFloat(1, 120),
      characters: randInt(10, 4000),
      wordCount: !isErr ? randInt(5, 400) : 0,
      engine: rand(["neural", "standard"]),
      statusCode: isErr ? rand([400, 429, 502]) : 200,
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
    return baseReturn(
      "SpeechToText.Recognize",
      props.statusCode,
      variant,
      docErr,
      propsForDoc,
      isErr
        ? `Speech ${account}: recognize failed`
        : `Speech ${account}: SpeechToText OK locale=${props.locale}`
    );
  }

  if (variant === "synthesize") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      locale: rand(["en-US", "es-ES", "de-DE"]),
      characters: randInt(20, 8000),
      engine: rand(["neural", "standard"]),
      statusCode: isErr ? rand([400, 429, 502]) : 200,
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
    return baseReturn(
      "TextToSpeech.Synthesize",
      props.statusCode,
      variant,
      docErr,
      propsForDoc,
      isErr
        ? `Speech ${account}: synthesize failed`
        : `Speech ${account}: synthesis OK (${props.characters} chars)`
    );
  }

  if (variant === "translate") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      locale: rand(["en-US", "es-ES", "de-DE"]),
      characters: randInt(10, 4000),
      engine: rand(["neural", "standard"]),
      statusCode: isErr ? rand([400, 429, 502]) : 200,
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
    return baseReturn(
      "SpeechTranslation.Translate",
      props.statusCode,
      variant,
      docErr,
      propsForDoc,
      isErr ? `Speech ${account}: translation failed` : `Speech ${account}: SpeechTranslation OK`
    );
  }

  if (variant === "customVoice") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      locale: rand(["en-US", "fr-FR"]),
      modelId: `custom-voice-${randId(5)}`,
      trainingSamplesHour: randFloat(0.5, 120),
      statusCode: isErr ? rand([409, 500]) : 202,
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
    return baseReturn(
      "Speech.CustomVoice.training",
      props.statusCode,
      variant,
      docErr,
      propsForDoc,
      isErr
        ? `Speech ${account}: custom voice training rejected`
        : `Custom voice dataset registered (${props.trainingSamplesHour.toFixed(2)} hrs)`
    );
  }

  if (variant === "speechEndpoint") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      endpointId: `se-${randId(6)}`,
      provisionedRegions: randInt(1, 4),
      sslHandshakeMs: randInt(12, isErr ? 1200 : 90),
      statusCode: isErr ? rand([500, 502]) : 204,
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
    return baseReturn(
      "Speech.Diagnostics.EndpointWarmup",
      props.statusCode,
      variant,
      docErr,
      propsForDoc,
      isErr
        ? `Speech endpoint ${props.endpointId} unhealthy (${props.statusCode})`
        : `Warmup OK for endpoint ${props.endpointId}`
    );
  }

  const docErr = aiSecurityPickError(isErr);
  const props = {
    blobUriPrefix: `https://st${randId(6)}.blob.core.windows.net/audio`,
    jobId: randUUID(),
    transcriptsWritten: !isErr ? randInt(5, 2000) : 0,
    statusCode: isErr ? rand([500, 503]) : 202,
    correlationId,
  };
  const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
  return baseReturn(
    "Speech.BatchTranscription.Job",
    props.statusCode,
    "batchTranscribe",
    docErr,
    propsForDoc,
    isErr
      ? `Batch transcription ${props.jobId.slice(0, 8)} failed`
      : `Batch job wrote ${props.transcriptsWritten} transcripts`
  );
}

/** Translator — document and text batches. */
export function generateTranslatorLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const account = `tr-${randId(5).toLowerCase()}`;
  const resourceId = armCognitive(subscription.id, resourceGroup, account);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["text", "document", "glossary", "detect", "rbac", "sku"] as const);

  if (variant === "text") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      from: rand(["en", "de", "fr"]),
      to: rand(["es", "it", "pt"]),
      characterCount: randInt(50, 400_000),
      batchSize: randInt(1, 80),
      statusCode: isErr ? rand([400, 429]) : 200,
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.CognitiveServices/accounts"),
      azure: {
        translator: {
          account,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "TextBatch",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Translator.Text.Batch"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e6, 3e9),
      },
      message: isErr
        ? `Translator ${account}: text batch failed`
        : `Translator ${account}: translated ${props.characterCount} chars ${props.from}->${props.to}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "document") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      sourceStorage: `https://st${randId(6)}.blob.core.windows.net/in`,
      targetStorage: `https://st${randId(6)}.blob.core.windows.net/out`,
      fileCount: isErr ? 0 : randInt(1, 400),
      pagesProcessed: isErr ? 0 : randInt(10, 20_000),
      operationId: randUUID(),
      status: isErr ? "Failed" : rand(["Succeeded", "Running"]),
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.CognitiveServices/accounts"),
      azure: {
        translator: {
          account,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "DocumentBatch",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Translator.Document.Batch"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e8, 12e9),
      },
      message: isErr
        ? `Translator ${account}: document job ${props.operationId} failed`
        : `Translator ${account}: document batch ${props.status} files=${props.fileCount}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "glossary") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      glossaryGuid: randUUID(),
      entryCount: isErr ? 0 : randInt(10, 40_000),
      statusCode: isErr ? rand([400, 500]) : 200,
      targetLocales: rand(["ja;ko", "zh-Hans"]),
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Translator.Glossary.Upload",
      category: "Glossary",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.CognitiveServices/accounts"),
      azure: {
        translator: {
          account,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Glossary",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Translator.Glossary.Upload"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e10, 2e12),
      },
      message: isErr
        ? `Translator glossary ${props.glossaryGuid.slice(0, 8)} ingestion failed`
        : `Imported ${props.entryCount} glossary segments`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "detect") {
    const docErr = aiSecurityPickError(isErr);
    const detected = rand(["en", "de", "ar", "pt"]);
    const props = {
      sampleSnippetBytes: randInt(16, 8000),
      confidence: randFloat(isErr ? 0.12 : 0.55, 0.999),
      detectedLanguage: isErr ? undefined : detected,
      statusCode: isErr ? rand([400, 500]) : 200,
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Translator.Detect",
      category: "LanguageDetection",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.CognitiveServices/accounts"),
      azure: {
        translator: {
          account,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Detect",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Translator.Detect"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e7, 4e11),
      },
      message: isErr
        ? `Translator ${account}: detection failed (${props.statusCode})`
        : `Language detected=${props.detectedLanguage} conf=${props.confidence.toFixed(3)}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "rbac") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      principalId: randUUID(),
      denialReason: isErr ? "NotDataActionAllowed" : "Allowed",
      statusCode: isErr ? rand([401, 403]) : 200,
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Translator.Rbac.Authorization",
      category: "AccessControl",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.CognitiveServices/accounts"),
      azure: {
        translator: {
          account,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "RBAC",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Translator.Rbac.Authorization"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e8, 2e10),
      },
      message: isErr
        ? `Translator RBAC denied principal ${props.principalId.slice(0, 8)}`
        : `RBAC authorization ${props.denialReason.toLowerCase()}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  const docErr = aiSecurityPickError(isErr);
  const props = {
    skuName: rand(["S1", "S2"]),
    customDomainEnabled: rand([true, false]),
    provisioningState: isErr ? "Failed" : rand(["Succeeded", "Updating"]),
    statusCode: isErr ? rand([409, 500]) : 202,
    correlationId,
  };
  const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.CognitiveServices/accounts/write",
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: String(props.statusCode),
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: propsForDoc,
    cloud: azureCloud(region, subscription, "Microsoft.CognitiveServices/accounts"),
    azure: {
      translator: {
        account,
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: "Capacity",
        correlation_id: correlationId,
        properties: propsForDoc,
      },
    },
    event: {
      kind: "event",
      category: ["intrusion_detection"],
      type: isErr ? ["denied"] : ["info"],
      action: String("Microsoft.CognitiveServices/accounts/write"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(1e10, 2e13),
    },
    message: isErr
      ? `Translator reseller SKU update failed (${props.skuName})`
      : `Translator account scaled to SKU ${props.skuName}`,
    ...(docErr ? { error: docErr } : {}),
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
  const variant = rand(["analyze", "train", "layout", "classify", "rbac", "meter"] as const);

  if (variant === "analyze") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      modelId: rand(["prebuilt-invoice", "prebuilt-layout", "custom-invoice-v3"]),
      pages: randInt(1, 120),
      tablesExtracted: isErr ? 0 : randInt(0, 40),
      kvPairs: isErr ? 0 : randInt(2, 500),
      latencyMs: isErr ? randInt(100, 4000) : randInt(200, 9000),
      statusCode: isErr ? rand([400, 500]) : 200,
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.CognitiveServices/accounts"),
      azure: {
        document_intelligence: {
          account,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "AnalyzeOperation",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("DocumentIntelligence.Analyze"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e6, 6e9),
      },
      message: isErr
        ? `Document Intelligence ${account}: analyze failed`
        : `Document Intelligence ${account}: analyze ${props.pages} pages model=${props.modelId}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "train") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      modelName: `custom-${randId(5)}`,
      trainingDocCount: randInt(5, 500),
      epochs: randInt(1, 10),
      status: isErr ? "Failed" : rand(["Succeeded", "Training"]),
      trainingHours: isErr ? randFloat(0.2, 2) : randFloat(0.5, 18),
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.CognitiveServices/accounts"),
      azure: {
        document_intelligence: {
          account,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "ModelTraining",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("DocumentIntelligence.TrainModel"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e7, 14e9),
      },
      message: isErr
        ? `Document Intelligence ${account}: training ${props.modelName} failed`
        : `Document Intelligence ${account}: model ${props.modelName} training ${props.status}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "layout") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      readingOrder: rand(["Natural", "Improved"]),
      figureCount: isErr ? 0 : randInt(0, 24),
      lineCount: isErr ? 0 : randInt(10, 5000),
      statusCode: isErr ? rand([408, 500]) : 200,
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "DocumentIntelligence.Prebuilt.Layout",
      category: "Layout",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.CognitiveServices/accounts"),
      azure: {
        document_intelligence: {
          account,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Layout",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("DocumentIntelligence.Prebuilt.Layout"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e11, 2e13),
      },
      message: isErr
        ? `DocIntel layout extraction failed (${props.statusCode})`
        : `${props.lineCount} lines / ${props.figureCount} figures with ${props.readingOrder} order`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "classify") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      classifierModel: `cls-${randId(4)}`,
      labelAssigned: !isErr ? rand(["invoice", "receipt", "contract"]) : "unknown",
      confidence: randFloat(isErr ? 0.01 : 0.75, isErr ? 0.42 : 0.999),
      statusCode: isErr ? rand([400, 500]) : 200,
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "DocumentIntelligence.ClassifyDocument",
      category: "Classification",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.CognitiveServices/accounts"),
      azure: {
        document_intelligence: {
          account,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Classify",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("DocumentIntelligence.ClassifyDocument"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e11, 2e13),
      },
      message: isErr
        ? `Classifier ${props.classifierModel} returned low confidence (${props.confidence})`
        : `Classified as ${props.labelAssigned} conf=${props.confidence.toFixed(3)}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "rbac") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      scopedRole: rand(["DocumentIntelligenceContributor", "CognitiveServicesUser"]),
      statusCode: isErr ? rand([401, 403]) : 204,
      subjectId: randUUID(),
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.CognitiveServices/accounts/providers/Microsoft.Authorization/write",
      category: "AccessControl",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.CognitiveServices/accounts"),
      azure: {
        document_intelligence: {
          account,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "RBAC",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String(
          "Microsoft.CognitiveServices/accounts/providers/Microsoft.Authorization/write"
        ),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e10, 3e13),
      },
      message: isErr
        ? `DocIntel RBAC assign failed (${props.statusCode})`
        : `${props.scopedRole} granted`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  const docErr = aiSecurityPickError(isErr);
  const props = {
    skuTier: rand(["S0", "S1"]),
    pagesMeteredThisHour: isErr ? 0 : randInt(1000, 750_000),
    overageChargesEstimated: randFloat(isErr ? 10 : 0, isErr ? 500 : 120),
    statusCode: isErr ? rand([429, 500]) : 200,
    correlationId,
  };
  const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "DocumentIntelligence.MeteringReport",
    category: "Usage",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: String(props.statusCode),
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: propsForDoc,
    cloud: azureCloud(region, subscription, "Microsoft.CognitiveServices/accounts"),
    azure: {
      document_intelligence: {
        account,
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: "Metering",
        correlation_id: correlationId,
        properties: propsForDoc,
      },
    },
    event: {
      kind: "event",
      category: ["intrusion_detection"],
      type: isErr ? ["denied"] : ["info"],
      action: String("DocumentIntelligence.MeteringReport"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(2e10, 2e13),
    },
    message: isErr
      ? `DocIntel metering ingestion failed (${props.statusCode}), est charge ${props.overageChargesEstimated}`
      : `Metered ${props.pagesMeteredThisHour} pages on tier ${props.skuTier}`,
    ...(docErr ? { error: docErr } : {}),
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
  const variant = rand([
    "token",
    "federated",
    "provisionIdentity",
    "rbacAssign",
    "revoke",
    "heartbeat",
  ] as const);

  if (variant === "token") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      audience: rand(["https://vault.azure.net", "https://storage.azure.com"]),
      clientId: randUUID(),
      tokenBytes: isErr ? 0 : randInt(800, 4000),
      leaseSeconds: isErr ? 0 : randInt(300, 3600),
      errorCode: isErr ? rand(["identity_not_found", "forbidden"]) : undefined,
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.ManagedIdentity/userAssignedIdentities"),
      azure: {
        managed_identity: {
          identity: idName,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "TokenIssuance",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("ManagedIdentity.GetToken"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e5, 8e8),
      },
      message: isErr
        ? `Managed Identity ${idName}: token issuance failed (${props.errorCode})`
        : `Managed Identity ${idName}: token issued for audience ${props.audience}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "federated") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      federatedCredentialName: `fc-${randId(5)}`,
      issuer: rand([
        "https://token.actions.githubusercontent.com",
        "https://login.microsoftonline.com/.../v2.0",
      ]),
      subject: isErr
        ? "invalid-subject"
        : `repo:meridiantech/${rand(["api", "infra"])}:ref:refs/heads/main`,
      operation: isErr ? "delete" : rand(["create", "update"]),
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.ManagedIdentity/userAssignedIdentities"),
      azure: {
        managed_identity: {
          identity: idName,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "FederatedCredential",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String(
          `Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials/${props.operation}`
        ),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e6, 2e9),
      },
      message: isErr
        ? `Managed Identity ${idName}: federated credential ${props.operation} failed`
        : `Managed Identity ${idName}: federated cred ${props.federatedCredentialName} ${props.operation}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "provisionIdentity") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      locationNormalized: rand(["eastus2", "westeurope"]),
      tagsApplied: isErr ? 0 : randInt(1, 6),
      principalId: randUUID(),
      provisioningState: isErr ? "Failed" : rand(["Succeeded", "Updating"]),
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.ManagedIdentity/userAssignedIdentities/write",
      category: "Provisioning",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.provisioningState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.ManagedIdentity/userAssignedIdentities"),
      azure: {
        managed_identity: {
          identity: idName,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "IdentityProvision",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.ManagedIdentity/userAssignedIdentities/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e10, 2e13),
      },
      message: isErr
        ? `Provisioning user-assigned MI ${idName} failed`
        : `User-assigned identity ${idName} ${props.provisioningState.toLowerCase()}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "rbacAssign") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      roleDefinitionId: randUUID(),
      assigneePrincipal: randUUID(),
      scopeSuffix: `/resourceGroups/${resourceGroup}`,
      deniedReasonCode: isErr ? "AuthorizationFailed" : undefined,
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Authorization/roleAssignments/write",
      category: "AccessControl",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.deniedReasonCode ?? "201",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.ManagedIdentity/userAssignedIdentities"),
      azure: {
        managed_identity: {
          identity: idName,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "RBACAttachment",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.Authorization/roleAssignments/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e10, 2e13),
      },
      message: isErr
        ? `Could not attach MI ${idName}: ${props.deniedReasonCode}`
        : `Role assignment created for MI ${idName}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "revoke") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      revocationReason: rand(["credential_rotated", "compromise"]),
      affectedSessionCount: isErr ? 0 : randInt(1, 400),
      statusCode: isErr ? rand([500, 503]) : 204,
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ManagedIdentity.RevokeActiveSessions",
      category: "SessionRevocation",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.ManagedIdentity/userAssignedIdentities"),
      azure: {
        managed_identity: {
          identity: idName,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Revocation",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("ManagedIdentity.RevokeActiveSessions"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e11, 2e13),
      },
      message: isErr
        ? `Revoke operation failed for ${idName} (${props.statusCode})`
        : `Revoked ${props.affectedSessionCount} sessions (${props.revocationReason})`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  const docErr = aiSecurityPickError(isErr);
  const props = {
    imdsHealthy: !isErr,
    instanceMetadataLatencyMs: isErr ? randInt(800, 5000) : randInt(2, 40),
    lastRotationAgeHours: randInt(1, 720),
    statusCode: isErr ? rand([502, 503]) : 200,
    correlationId,
  };
  const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "ManagedIdentity.IMDS.HealthProbe",
    category: "Diagnostics",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: String(props.statusCode),
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: propsForDoc,
    cloud: azureCloud(region, subscription, "Microsoft.ManagedIdentity/userAssignedIdentities"),
    azure: {
      managed_identity: {
        identity: idName,
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: "IMDSHeartbeat",
        correlation_id: correlationId,
        properties: propsForDoc,
      },
    },
    event: {
      kind: "event",
      category: ["intrusion_detection"],
      type: isErr ? ["denied"] : ["info"],
      action: String("ManagedIdentity.IMDS.HealthProbe"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(9e11, 2e13),
    },
    message: isErr
      ? `IMDS probe failed for MI ${idName} (${props.statusCode})`
      : `IMDS OK latency=${props.instanceMetadataLatencyMs}ms`,
    ...(docErr ? { error: docErr } : {}),
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
  const variant = rand([
    "finding",
    "recommendation",
    "secureScore",
    "suppression",
    "ingestion",
    "workspaceOnboard",
  ] as const);

  if (variant === "finding") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      status: isErr ? "NotApplicable" : rand(["Unhealthy", "Healthy"]),
      severity: rand(["High", "Medium", "Low"]),
      resourceName,
      resourceType: rand(["Microsoft.KeyVault/vaults", "Microsoft.Storage/storageAccounts"]),
      description: isErr ? "Assessment compute failed" : "CMK not configured on storage account",
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Security/assessments"),
      azure: {
        defender: {
          resource_group: resourceGroup,
          assessment_id: assessmentId,
          resource_id: resourceId,
          category: "AssessmentFinding",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.Security/assessments/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e7, 4e9),
      },
      message: isErr
        ? `Defender assessment ${assessmentId}: failed for ${resourceName}`
        : `Defender: assessment ${assessmentId} ${props.status} (${props.severity})`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "recommendation") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      recommendationId: `rec-${randId(6)}`,
      action: isErr ? "DismissFailed" : rand(["Activate", "Postpone", "Dismiss"]),
      subscriptionId: subscription.id,
      resourceName,
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Security/recommendations"),
      azure: {
        defender: {
          resource_group: resourceGroup,
          assessment_id: assessmentId,
          resource_id: resourceId,
          category: "RecommendationChange",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.Security/recommendations/status"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e6, 2e9),
      },
      message: isErr
        ? `Defender recommendation ${props.recommendationId}: status update failed`
        : `Defender: recommendation ${props.action} on ${resourceName}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "secureScore") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      weightedScorePct: randFloat(isErr ? 42 : 71, isErr ? 58 : 99),
      staleControlsCount: randInt(isErr ? 28 : 0, isErr ? 400 : 12),
      controlName: rand(["IAM", "Data", "Networking"]),
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Security/secureScores/write",
      category: "SecureScore",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: `${props.weightedScorePct}%`,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Security/secureScores"),
      azure: {
        defender: {
          resource_group: resourceGroup,
          assessment_id: assessmentId,
          resource_id: resourceId,
          category: "ScoreBoard",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.Security/secureScores/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e11, 2e13),
      },
      message: isErr
        ? `Secure score snapshot rejected (${props.staleControlsCount} stale controls)`
        : `Secure score ${props.weightedScorePct}% on ${props.controlName} pillar`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "suppression") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      suppressionReason: rand(["accepted risk", "false positive"]),
      ruleId: randUUID(),
      expiresOn: randUUID(),
      statusCode: isErr ? rand([400, 500]) : 204,
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Security/alerts/suppressions/write",
      category: "SuppressionRules",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Security/alerts"),
      azure: {
        defender: {
          resource_group: resourceGroup,
          assessment_id: assessmentId,
          resource_id: resourceId,
          category: "Suppression",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.Security/alerts/suppressions/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e10, 2e13),
      },
      message: isErr
        ? `Defender suppression create failed (${props.statusCode})`
        : `Suppression persisted for alert rule ${props.ruleId.slice(0, 8)}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "ingestion") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      streamVendor: rand(["GCP", "AWS", "GCP-SCC"]),
      eventsIngested: isErr ? 0 : randInt(900, 900_000),
      lagSeconds: randInt(isErr ? 420 : 12, isErr ? 9000 : 180),
      statusCode: isErr ? rand([500, 503]) : 202,
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Security/dataConnectors/ingestion",
      category: "DataIngest",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Security/dataConnectors"),
      azure: {
        defender: {
          resource_group: resourceGroup,
          assessment_id: assessmentId,
          resource_id: resourceId,
          category: "MultiCloudIngest",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.Security/dataConnectors/ingestion"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e13, 4e13),
      },
      message: isErr
        ? `Defender ingestion backlog spike lag=${props.lagSeconds}s`
        : `${props.eventsIngested} ${props.streamVendor} events normalized`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  const docErr = aiSecurityPickError(isErr);
  const workspaceName = `mdvm-${randId(4)}`;
  const props = {
    workspaceName,
    autoProvisionAgents: rand([true, false]),
    sentinelConnectorState: isErr ? "Detached" : "Attached",
    statusCode: isErr ? rand([409, 500]) : 200,
    correlationId,
  };
  const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.Security/workspaceSettings/write",
    category: "Onboarding",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: String(props.statusCode),
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: propsForDoc,
    cloud: azureCloud(region, subscription, "Microsoft.Security/pricings"),
    azure: {
      defender: {
        resource_group: resourceGroup,
        assessment_id: assessmentId,
        resource_id: resourceId,
        category: "WorkspaceLink",
        correlation_id: correlationId,
        properties: propsForDoc,
      },
    },
    event: {
      kind: "event",
      category: ["intrusion_detection"],
      type: isErr ? ["denied"] : ["info"],
      action: String("Microsoft.Security/workspaceSettings/write"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(2e12, 2e14),
    },
    message: isErr
      ? `Defender onboarding to ${workspaceName} failed (${props.statusCode})`
      : `${workspaceName} linked (autoAgents=${props.autoProvisionAgents})`,
    ...(docErr ? { error: docErr } : {}),
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
  const variant = rand([
    "incident",
    "rule",
    "playbook",
    "hunting",
    "connector",
    "workspaceRbac",
  ] as const);

  if (variant === "incident") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      incidentId: incName,
      severity: rand(["High", "Medium", "Low", "Informational"]),
      status: isErr ? "Error" : rand(["New", "Active", "Closed"]),
      owner: randIamUser(),
      tactics: rand(["InitialAccess", "Exfiltration", "CredentialAccess"]),
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.SecurityInsights/incidents"),
      azure: {
        sentinel: {
          workspace: law,
          resource_group: resourceGroup,
          resource_id: incidentResourceId,
          category: "Incident",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.SecurityInsights/incidents/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e6, 3e9),
      },
      message: isErr
        ? `Sentinel ${law}: incident ${incName} update failed`
        : `Sentinel: incident ${incName} ${props.status} severity=${props.severity}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "rule") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      ruleId: randUUID(),
      ruleName: rand(["AAD risky sign-in", "Rare outbound RDP", "Malware hash match"]),
      runFrequency: rand(["5M", "1H"]),
      matchedEvents: isErr ? 0 : randInt(0, 2500),
      queryDurationMs: randInt(200, 45_000),
      status: isErr ? "QueryFailed" : "Completed",
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.SecurityInsights/alertRules"),
      azure: {
        sentinel: {
          workspace: law,
          resource_group: resourceGroup,
          resource_id: wsResourceId,
          category: "AnalyticsRule",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.SecurityInsights/alertRules/query"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e7, 8e9),
      },
      message: isErr
        ? `Sentinel rule ${props.ruleName}: execution failed`
        : `Sentinel rule ${props.ruleName}: matched ${props.matchedEvents} events`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "playbook") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      playbookName: `pb-${randId(5)}`,
      runId: randUUID(),
      trigger: rand(["incident", "alert", "manual"]),
      actionsRun: isErr ? randInt(0, 2) : randInt(3, 28),
      status: isErr ? "Failed" : "Succeeded",
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Logic/workflows"),
      azure: {
        sentinel: {
          workspace: law,
          resource_group: resourceGroup,
          resource_id: wsResourceId,
          category: "Playbook",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.Logic/workflows/run"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e8, 9e9),
      },
      message: isErr
        ? `Sentinel playbook ${props.playbookName}: run ${props.runId} failed`
        : `Sentinel playbook ${props.playbookName}: ${props.actionsRun} actions ${props.status}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "hunting") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      queryGuid: randUUID(),
      operator: rand(["SOC-L2", "IR-Lead"]),
      rowsReturned: isErr ? 0 : randInt(0, 15_000),
      scanDurationMs: randInt(isErr ? 900 : 120, isErr ? 120_000 : 44_000),
      statusCode: isErr ? rand([500, 504]) : 200,
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId: wsResourceId,
      operationName: "Microsoft.SecurityInsights/huntingqueries/run",
      category: "Hunting",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.SecurityInsights/bookmarks"),
      azure: {
        sentinel: {
          workspace: law,
          resource_group: resourceGroup,
          resource_id: wsResourceId,
          category: "HuntingSession",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.SecurityInsights/huntingqueries/run"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e12, 2e14),
      },
      message: isErr
        ? `Hunting query ${props.queryGuid.slice(0, 8)} failed (${props.statusCode})`
        : `${props.operator} hunting returned ${props.rowsReturned} rows`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "connector") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      connectorKind: rand(["AzureActivity", "ThreatIntelligenceTAXII", "Dynamics365"]),
      status: isErr ? "Disconnected" : "Connected",
      lastPollLatencyMs: randInt(isErr ? 900 : 45, isErr ? 8000 : 1800),
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId: wsResourceId,
      operationName: "Microsoft.SecurityInsights/dataConnectors/write",
      category: "DataConnector",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.status,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.SecurityInsights/dataConnectors"),
      azure: {
        sentinel: {
          workspace: law,
          resource_group: resourceGroup,
          resource_id: wsResourceId,
          category: "Connector",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.SecurityInsights/dataConnectors/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e13, 2e14),
      },
      message: isErr
        ? `Connector ${props.connectorKind} health=${props.status}`
        : `${props.connectorKind} connector stable poll=${props.lastPollLatencyMs}ms`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  const docErr = aiSecurityPickError(isErr);
  const props = {
    rbacOperation: rand(["Contributor assign", "Reader deny"]),
    objectId: randUUID(),
    statusCode: isErr ? rand([401, 403]) : 204,
    reasoning: isErr ? "PrivilegedRoleRequired" : "Allowed",
    correlationId,
  };
  const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
  return {
    "@timestamp": ts,
    time,
    resourceId: wsResourceId,
    operationName: "Microsoft.OperationalInsights/workspaces/write",
    category: "AccessControl",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: String(props.statusCode),
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: propsForDoc,
    cloud: azureCloud(region, subscription, "Microsoft.OperationalInsights/workspaces"),
    azure: {
      sentinel: {
        workspace: law,
        resource_group: resourceGroup,
        resource_id: wsResourceId,
        category: "WorkspaceRBAC",
        correlation_id: correlationId,
        properties: propsForDoc,
      },
    },
    event: {
      kind: "event",
      category: ["intrusion_detection"],
      type: isErr ? ["denied"] : ["info"],
      action: String("Microsoft.OperationalInsights/workspaces/write"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(1e12, 2e13),
    },
    message: isErr
      ? `${props.rbacOperation} blocked (${props.reasoning})`
      : `${props.rbacOperation} succeeded for principal ${props.objectId.slice(0, 8)}`,
    ...(docErr ? { error: docErr } : {}),
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
  const variant = rand([
    "attest",
    "policy",
    "jwtFetch",
    "rbacAssign",
    "nonceReplay",
    "providerSku",
  ] as const);

  if (variant === "attest") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      tee: rand(["SgxEnclave", "SevSnpVm"]),
      mrenclave: randId(16),
      policyVersion: `v${randInt(1, 12)}`,
      verdict: isErr ? "failed" : "accepted",
      latencyMs: randInt(5, 400),
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Attestation/attestationProviders"),
      azure: {
        attestation: {
          provider: name,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Attest",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.Attestation/attest"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e5, 1e9),
      },
      message: isErr
        ? `Attestation ${name}: request rejected`
        : `Attestation ${name}: ${props.tee} quote ${props.verdict}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "policy") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      policy: isErr ? "invalid-jws" : "signed-policy-v3",
      operator: rand(["add", "remove", "replace"]),
      jwtThumbprint: randId(12),
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Attestation/attestationProviders"),
      azure: {
        attestation: {
          provider: name,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "PolicyChange",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.Attestation/attestationProviders/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e6, 2e9),
      },
      message: isErr
        ? `Attestation ${name}: policy update failed`
        : `Attestation ${name}: policy ${props.operator} applied`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "jwtFetch") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      signingAlg: rand(["RS256", "ES384"]),
      jwksCacheHitRate: randFloat(isErr ? 0.1 : 0.55, isErr ? 0.35 : 0.99),
      keysRotatedRecently: rand([true, false]),
      latencyMs: randInt(isErr ? 240 : 8, isErr ? 4000 : 120),
      statusCode: isErr ? rand([500, 504]) : 200,
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Attestation/jwks/refresh",
      category: "KeyMaterial",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Attestation/attestationProviders"),
      azure: {
        attestation: {
          provider: name,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "JWKS",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.Attestation/jwks/refresh"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e11, 2e13),
      },
      message: isErr
        ? `JWT metadata fetch failed (${props.statusCode})`
        : `${props.signingAlg} JWKS warmup OK cache=${props.jwksCacheHitRate}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "rbacAssign") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      roleName: rand(["AttestationContributor", "AttestationReader"]),
      statusCode: isErr ? rand([401, 403]) : 204,
      assigneeOid: randUUID(),
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Authorization/roleAssignments/write",
      category: "AccessControl",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Attestation/attestationProviders"),
      azure: {
        attestation: {
          provider: name,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "RBAC",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.Authorization/roleAssignments/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e13, 2e13),
      },
      message: isErr
        ? `Attestation RBAC assign failed (${props.statusCode})`
        : `${props.roleName} assigned`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "nonceReplay") {
    const errForReplay = aiSecurityPickError(true)!;
    const props = {
      nonce: randUUID(),
      replayDetected: true,
      traceId: randUUID(),
      statusCode: 409,
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(true, false, props, errForReplay);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Attestation/attest",
      category: "FraudSignals",
      resultType: "Failure",
      resultSignature: "nonce_replayed",
      callerIpAddress: callerIp,
      correlationId,
      level: "Error",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Attestation/attestationProviders"),
      azure: {
        attestation: {
          provider: name,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "ReplayBlock",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: ["denied"],
        action: String("Microsoft.Attestation/attest"),
        outcome: "failure",
        duration: randInt(9e11, 2e13),
      },
      message: `Blocked replayed nonce=${props.nonce.slice(0, 8)} trace=${props.traceId.slice(0, 8)}`,
      ...{ error: errForReplay },
    };
  }

  const docErr = aiSecurityPickError(isErr);
  const props = {
    skuTier: rand(["Dedicated", "Shared"]),
    hsmBacked: rand([true, false]),
    provisionState: isErr ? "Failed" : rand(["Succeeded", "Updating"]),
    statusCode: isErr ? rand([409, 500]) : 202,
    correlationId,
  };
  const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.Attestation/attestationProviders/write",
    category: "Capacity",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: String(props.statusCode),
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: propsForDoc,
    cloud: azureCloud(region, subscription, "Microsoft.Attestation/attestationProviders"),
    azure: {
      attestation: {
        provider: name,
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: "SKU",
        correlation_id: correlationId,
        properties: propsForDoc,
      },
    },
    event: {
      kind: "event",
      category: ["intrusion_detection"],
      type: isErr ? ["denied"] : ["info"],
      action: String("Microsoft.Attestation/attestationProviders/write"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(2e13, 2e14),
    },
    message: isErr
      ? `SKU move to ${props.skuTier} failed (${props.statusCode})`
      : `Attestation provider upgraded to ${props.skuTier} hsmBacked=${props.hsmBacked}`,
    ...(docErr ? { error: docErr } : {}),
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
  const variant = rand([
    "write",
    "member",
    "readProof",
    "rbacAssignment",
    "drFailover",
    "metering",
  ] as const);

  if (variant === "write") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      collectionId: rand(["app-log", "audit", "contracts"]),
      transactionId: randUUID(),
      payloadBytes: randInt(64, 65536),
      round: randInt(1, 10_000_000),
      status: isErr ? "Aborted" : "Committed",
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.ConfidentialLedger/ledgers"),
      azure: {
        confidential_ledger: {
          ledger,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "WriteEntry",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("ConfidentialLedger.WriteEntry"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e6, 3e9),
      },
      message: isErr
        ? `Confidential Ledger ${ledger}: append failed`
        : `Confidential Ledger ${ledger}: committed tx ${props.transactionId} round=${props.round}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "member") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      memberId: `member-${randId(6)}`,
      action: isErr ? "RemoveFailed" : rand(["AddTrustedMember", "RemoveMember"]),
      certificateThumbprint: randId(10),
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.ConfidentialLedger/ledgers"),
      azure: {
        confidential_ledger: {
          ledger,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "MembershipChange",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("ConfidentialLedger.MembershipChange"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e6, 4e9),
      },
      message: isErr
        ? `Confidential Ledger ${ledger}: membership change failed`
        : `Confidential Ledger ${ledger}: ${props.action} ${props.memberId}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "readProof") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      merkleDepth: randInt(8, 32),
      siblingsVerified: !isErr,
      ledgerSequence: randInt(1_000_000, 999_999_999),
      statusCode: isErr ? rand([500, 504]) : 200,
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ConfidentialLedger.GetLedgerEntries",
      category: "ReadPath",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.ConfidentialLedger/ledgers"),
      azure: {
        confidential_ledger: {
          ledger,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "MerkleProof",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("ConfidentialLedger.GetLedgerEntries"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e13, 2e14),
      },
      message: isErr
        ? `Ledger read proof verification failed (${props.statusCode})`
        : `Sequence ${props.ledgerSequence} proof depth=${props.merkleDepth}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "rbacAssignment") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      rbacOperation: rand(["Contributor add", "Reader remove"]),
      objectId: randUUID(),
      statusCode: isErr ? rand([401, 403]) : 204,
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.ConfidentialLedger/ledgers/providers/Microsoft.Authorization/write",
      category: "AccessControl",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.ConfidentialLedger/ledgers"),
      azure: {
        confidential_ledger: {
          ledger,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "RBAC",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String(
          "Microsoft.ConfidentialLedger/ledgers/providers/Microsoft.Authorization/write"
        ),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e13, 3e13),
      },
      message: isErr
        ? `Ledger RBAC ${props.rbacOperation} denied`
        : `RBAC mutation accepted for oid ${props.objectId.slice(0, 8)}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "drFailover") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      failoverRegionPair: rand([
        ["eastus", "eastus2"],
        ["westeu", "northeurope"],
      ] as const),
      rpoSecondsAchieved: isErr ? randInt(600, 3600) : randInt(1, 90),
      healthState: isErr ? "Degraded" : "Healthy",
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ConfidentialLedger.DisasterRecovery.Rebalance",
      category: "Resiliency",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.healthState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.ConfidentialLedger/ledgers"),
      azure: {
        confidential_ledger: {
          ledger,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "DR",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("ConfidentialLedger.DisasterRecovery.Rebalance"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e14, 4e14),
      },
      message: isErr
        ? `Ledger DR failover behind RPO>${props.rpoSecondsAchieved}s`
        : `Failover exercised ${props.failoverRegionPair} RPO=${props.rpoSecondsAchieved}s`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  const docErr = aiSecurityPickError(isErr);
  const props = {
    pageReadsThisHour: isErr ? 0 : randInt(50, 200_000),
    writeChargesAccrued: randFloat(isErr ? 42 : 0.05, isErr ? 980 : 9.99),
    subscriptionIdHint: subscription.id,
    correlationId,
    statusCode: isErr ? rand([429, 500]) : 200,
  };
  const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "ConfidentialLedger.Metering.Flush",
    category: "Usage",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: String(props.statusCode),
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: propsForDoc,
    cloud: azureCloud(region, subscription, "Microsoft.ConfidentialLedger/ledgers"),
    azure: {
      confidential_ledger: {
        ledger,
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: "Billing",
        correlation_id: correlationId,
        properties: propsForDoc,
      },
    },
    event: {
      kind: "event",
      category: ["intrusion_detection"],
      type: isErr ? ["denied"] : ["info"],
      action: String("ConfidentialLedger.Metering.Flush"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(1e13, 2e14),
    },
    message: isErr
      ? `Ledger metering rollup failed (${props.statusCode}); est overdue ${props.writeChargesAccrued}`
      : `${props.pageReadsThisHour} read ops billed this interval`,
    ...(docErr ? { error: docErr } : {}),
  };
}

/** Activity Log — subscription-level admin events. */
export function generateActivityLogLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "subscription",
    "alerts",
    "resource",
    "rbac",
    "delegatedAdmin",
    "remediation",
  ] as const);

  if (variant === "subscription") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      eventChannels: "Administrative",
      status: isErr ? "Failed" : "Succeeded",
      subStatus: isErr ? "Forbidden" : "OK",
      httpRequest: {
        clientRequestId: randUUID(),
        clientIpAddress: callerIp,
        method: rand(["PUT", "DELETE"]),
      },
      correlationId,
    };
    const resourceId = `/subscriptions/${subscription.id}`;
    const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Resources/subscriptions"),
      azure: {
        activity_log: {
          scope: "subscription",
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Administrative",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String(rand(["write", "delete", "read"])),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e6, 4e9),
      },
      message: isErr
        ? `Activity Log subscription ${subscription.id}: admin operation failed`
        : `Activity Log: subscription-level ${props.status} admin event`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "alerts") {
    const docErr = aiSecurityPickError(isErr);
    const alertName = `ala-${randId(5).toLowerCase()}`;
    const resourceId = armActivityLogAlert(subscription.id, resourceGroup, alertName);
    const props = {
      alertName,
      enabled: !isErr,
      conditionCount: randInt(1, 12),
      actionGroup: `ag-${randId(4)}`,
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Insights/activityLogAlerts"),
      azure: {
        activity_log: {
          alert: alertName,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "ActivityLogAlert",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String(isErr),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e6, 2e9),
      },
      message: isErr
        ? `Activity Log alert ${alertName}: operation failed`
        : `Activity Log: alert rule ${alertName} updated`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "resource") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      resourceName: `st${randId(7)}`,
      resourceType: "Microsoft.Storage/storageAccounts",
      actionName: isErr ? "write" : rand(["delete", "action"]),
      caller: rand(["svc-deploy-prod", "svc-cicd-runner", "policy-remediation"]),
      correlationId,
    };
    const resourceId = `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/${props.resourceType}/${props.resourceName}`;
    const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, props.resourceType),
      azure: {
        activity_log: {
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "ResourceOperation",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String(`Microsoft.Storage/storageAccounts/${props.actionName}`),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e6, 3e9),
      },
      message: isErr
        ? `Activity Log: ${props.resourceType} ${props.resourceName} failed (${props.actionName})`
        : `Activity Log: resource ${props.resourceName} ${props.actionName} by ${props.caller}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "rbac") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      roleDefinitionName: rand(["Owner", "User Access Administrator"]),
      assigneePrincipal: randUUID(),
      scope: `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}`,
      statusCode: isErr ? rand([400, 403]) : 201,
      correlationId,
    };
    const resourceId = `/subscriptions/${subscription.id}/providers/microsoft.authorization`;
    const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Authorization/roleAssignments/write",
      category: "Administrative",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Authorization/roleAssignments"),
      azure: {
        activity_log: {
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "RBAC",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.Authorization/roleAssignments/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e10, 2e13),
      },
      message: isErr
        ? `RBAC assignment failed (${props.statusCode}) for ${props.roleDefinitionName}`
        : `Granted ${props.roleDefinitionName} at ${props.scope}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "delegatedAdmin") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      resellerMspObjectId: randUUID(),
      offerName: rand(["AzurePlan", "CSPPartnership"]),
      consentState: isErr ? "Revoked" : "Active",
      correlationId,
    };
    const resourceId = `/providers/Microsoft.Billing`;
    const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Billing/register/action",
      category: "Policy",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.consentState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Billing/register"),
      azure: {
        activity_log: {
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "DelegatedAdmin",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.Billing/register/action"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(8e13, 2e14),
      },
      message: isErr
        ? `Delegated partner consent ${props.consentState}`
        : `MSP ${props.offerName} consent updated`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  const docErr = aiSecurityPickError(isErr);
  const remediationId = `rem-${randId(8)}`;
  const props = {
    remediationId,
    policyAssignmentId: randUUID(),
    nonCompliantResourceCount: isErr ? randInt(5, 200) : 0,
    status: isErr ? "Failed" : "Succeeded",
    correlationId,
  };
  const resourceId = `/subscriptions/${subscription.id}/providers/Microsoft.PolicyInsights/remediations/${remediationId}`;
  const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.PolicyInsights/remediations/write",
    category: "Policy",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.status,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: propsForDoc,
    cloud: azureCloud(region, subscription, "Microsoft.PolicyInsights/remediations"),
    azure: {
      activity_log: {
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: "PolicyRemediation",
        correlation_id: correlationId,
        properties: propsForDoc,
      },
    },
    event: {
      kind: "event",
      category: ["intrusion_detection"],
      type: isErr ? ["denied"] : ["info"],
      action: String("Microsoft.PolicyInsights/remediations/write"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(2e14, 3e14),
    },
    message: isErr
      ? `Policy remediation ${props.remediationId}: still ${props.nonCompliantResourceCount} non-compliant`
      : `Remediation ${props.remediationId}: subscription sweep ${props.status.toLowerCase()}`,
    ...(docErr ? { error: docErr } : {}),
  };
}

/** Azure Monitor — diagnostics, Application Insights. */
export function generateMonitorLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "diagnostic",
    "appinsights",
    "pipeline",
    "actionGroup",
    "prometheusRules",
    "workbookPublish",
  ] as const);

  if (variant === "diagnostic") {
    const docErr = aiSecurityPickError(isErr);
    const targetName = `st${randId(6)}`;
    const targetId = `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Storage/storageAccounts/${targetName}`;
    const props = {
      targetResourceId: targetId,
      logCategories: rand(["Audit", "AllMetrics"]),
      destination: rand(["logAnalytics", "eventHub", "storage"]),
      provisioningState: isErr ? "Failed" : "Succeeded",
      correlationId,
    };
    const resourceId = targetId;
    const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Insights/diagnosticSettings"),
      azure: {
        monitor: {
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "DiagnosticSettings",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.Insights/diagnosticSettings/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e6, 3e9),
      },
      message: isErr
        ? `Monitor: diagnostic settings update failed for ${targetName}`
        : `Monitor: diagnostics to ${props.destination} ${props.provisioningState}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "appinsights") {
    const docErr = aiSecurityPickError(isErr);
    const app = `appi-${randId(5).toLowerCase()}`;
    const resourceId = armAppInsights(subscription.id, resourceGroup, app);
    const props = {
      ingestionKeyRotated: Math.random() < 0.2,
      samplingPercentage: rand([100, 50, 20, 10]),
      liveMetrics: rand(["enabled", "disabled"]),
      dailyCapGb: rand([1, 5, 25, 100]),
      operation: isErr ? "UpdateFailed" : rand(["Create", "Purge", "Update"]),
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Insights/components"),
      azure: {
        monitor: {
          component: app,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "ApplicationInsights",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String(`Microsoft.Insights/components/${props.operation}`),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e6, 4e9),
      },
      message: isErr
        ? `Application Insights ${app}: operation failed`
        : `Application Insights ${app}: ${props.operation} sampling=${props.samplingPercentage}%`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "pipeline") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      bytesIngested: isErr ? 0 : randInt(1e6, 5e11),
      throttled: !isErr && Math.random() < 0.08,
      droppedSeries: isErr ? randInt(10, 5000) : randInt(0, 50),
      pipeline: "metrics-platform",
      correlationId,
    };
    const resourceId = `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Insights/dataCollectionEndpoints/dce-${randId(4)}`;
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Insights/dataCollectionEndpoints"),
      azure: {
        monitor: {
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Ingestion",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.Monitor/dataCollection/pipeline"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e7, 7e9),
      },
      message: isErr
        ? `Monitor ingestion pipeline: drops=${props.droppedSeries}`
        : `Monitor pipeline: ingested ${props.bytesIngested} bytes${props.throttled ? " (throttled)" : ""}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "actionGroup") {
    const docErr = aiSecurityPickError(isErr);
    const agName = `ag-${randId(5)}`;
    const resourceId = `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Insights/actionGroups/${agName}`;
    const props = {
      actionGroupName: agName,
      webhookTargets: randInt(1, 6),
      smsTargets: randInt(0, 3),
      operation: isErr ? "DeleteFailed" : rand(["Create", "Update"]),
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: `Microsoft.Insights/actionGroups/${props.operation === "DeleteFailed" ? "delete" : "write"}`,
      category: "ActionGroups",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.operation,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Insights/actionGroups"),
      azure: {
        monitor: {
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Notifications",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String(
          `Microsoft.Insights/actionGroups/${props.operation === "DeleteFailed" ? "delete" : "write"}`
        ),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e10, 2e13),
      },
      message: isErr
        ? `Action group ${agName} mutation failed (${props.operation})`
        : `Action group updated webhooks=${props.webhookTargets} sms=${props.smsTargets}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "prometheusRules") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      ruleGroupName: `prom-${randId(4)}`,
      rulesEvaluated: isErr ? 0 : randInt(5, 500),
      alertFiringCount: randInt(isErr ? 22 : 0, isErr ? 400 : 8),
      statusCode: isErr ? rand([500, 503]) : 200,
      correlationId,
    };
    const resourceId = `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.AlertsManagement/prometheusRuleGroups/${props.ruleGroupName}`;
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.AlertsManagement/prometheusRuleGroups/read",
      category: "Prometheus",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.AlertsManagement/prometheusRuleGroups"),
      azure: {
        monitor: {
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "PromAlerts",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.AlertsManagement/prometheusRuleGroups/read"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e13, 2e14),
      },
      message: isErr
        ? `Prometheus rule eval failed (${props.statusCode}) alarms=${props.alertFiringCount}`
        : `Evaluated ${props.rulesEvaluated} rules in ${props.ruleGroupName}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  const docErr = aiSecurityPickError(isErr);
  const wb = `wb-${randId(5)}`;
  const resourceId = `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Portal/dashboards/${wb}`;
  const props = {
    workbookName: wb,
    tileCount: isErr ? 0 : randInt(4, 40),
    dataSources: rand(["workspace", "arg", "adx"]),
    statusCode: isErr ? rand([400, 500]) : 200,
    correlationId,
  };
  const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "microsoft.insights/workbooks/write",
    category: "Workbooks",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: String(props.statusCode),
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: propsForDoc,
    cloud: azureCloud(region, subscription, "Microsoft.Portal/dashboards"),
    azure: {
      monitor: {
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: "WorkbookPublish",
        correlation_id: correlationId,
        properties: propsForDoc,
      },
    },
    event: {
      kind: "event",
      category: ["intrusion_detection"],
      type: isErr ? ["denied"] : ["info"],
      action: String("microsoft.insights/workbooks/write"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(1e13, 2e13),
    },
    message: isErr
      ? `Workbook publish ${wb} failed (${props.statusCode})`
      : `Published workbook ${wb} tiles=${props.tileCount} datasource=${props.dataSources}`,
    ...(docErr ? { error: docErr } : {}),
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
  const variant = rand([
    "evaluate",
    "remediate",
    "exemption",
    "denyAudit",
    "initiativeDeploy",
    "complianceSummarize",
  ] as const);

  if (variant === "evaluate") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      policyDefinitionId: `/providers/Microsoft.Authorization/policyDefinitions/${randUUID()}`,
      complianceState: isErr ? "Error" : rand(["Compliant", "NonCompliant"]),
      nonCompliantResources: isErr ? 0 : randInt(0, 400),
      scanId: randUUID(),
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Authorization/policyAssignments"),
      azure: {
        policy: {
          assignment,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Compliance",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.PolicyInsights/policyStates/triggerEvaluation"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e7, 9e9),
      },
      message: isErr
        ? `Policy ${assignment}: evaluation failed`
        : `Policy scan ${props.scanId}: ${props.complianceState} (${props.nonCompliantResources} resources)`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "remediate") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      taskName: `remediate-${randId(4)}`,
      targetCount: randInt(1, 200),
      succeeded: isErr ? 0 : randInt(1, 200),
      failed: isErr ? randInt(1, 40) : randInt(0, 5),
      deploymentId: randUUID(),
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.PolicyInsights/remediations"),
      azure: {
        policy: {
          assignment,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Remediation",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.PolicyInsights/remediations/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e7, 12e9),
      },
      message: isErr
        ? `Policy remediation ${props.taskName}: ${props.failed} failures`
        : `Policy remediation ${props.taskName}: fixed ${props.succeeded}/${props.targetCount}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "exemption") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      exemptionCategory: rand(["Mitigated", "Waiver"]),
      expiryOn: time,
      statusCode: isErr ? rand([400, 409]) : 201,
      resourcesCovered: isErr ? 0 : randInt(1, 50),
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Authorization/policyExemptions/write",
      category: "Exemptions",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Authorization/policyAssignments"),
      azure: {
        policy: {
          assignment,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Exemption",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.Authorization/policyExemptions/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e13, 2e13),
      },
      message: isErr
        ? `Policy exemption rejected (${props.statusCode})`
        : `Recorded ${props.exemptionCategory} covering ${props.resourcesCovered} scopes`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "denyAudit") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      enforcementMode: isErr ? "DisabledDueToConflict" : "Default",
      effectResult: rand(["Deny", "Audit"]),
      targetResourceUri: `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}`,
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.PolicyInsights/policyStates/write",
      category: "EvaluationEvents",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.effectResult,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Authorization/policyAssignments"),
      azure: {
        policy: {
          assignment,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "DenyAudit",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.PolicyInsights/policyStates/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e12, 2e13),
      },
      message: isErr
        ? `Deny audit pipeline halted (${props.enforcementMode})`
        : `${props.effectResult} event emitted for RG scope`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "initiativeDeploy") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      initiativeName: rand(["SOC2Baseline", "CIS1-4"]),
      policiesBundled: randInt(isErr ? 10 : 20, isErr ? 18 : 90),
      deployStatus: isErr ? "RolledBack" : rand(["Applying", "Completed"]),
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Authorization/policySetDefinitions/write",
      category: "InitiativeMgmt",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.deployStatus,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Authorization/policySetDefinitions"),
      azure: {
        policy: {
          assignment,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Initiative",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.Authorization/policySetDefinitions/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e14, 4e14),
      },
      message: isErr
        ? `Initiative ${props.initiativeName} bundle deploy failed (${props.policiesBundled} defs)`
        : `Initiative deployed ${props.initiativeName}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  const docErr = aiSecurityPickError(isErr);
  const props = {
    rollupWindow: rand(["daily", "weekly"]),
    percentCompliantAggregate: randFloat(isErr ? 40 : 88, isErr ? 72 : 100),
    outstandingFindings: isErr ? randInt(80, 5000) : randInt(0, 180),
    correlationId,
  };
  const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.PolicyInsights/policyStates/summarize/action",
    category: "Summaries",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: `${props.percentCompliantAggregate}%`,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: propsForDoc,
    cloud: azureCloud(region, subscription, "Microsoft.PolicyInsights/policyStates"),
    azure: {
      policy: {
        assignment,
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: "Summary",
        correlation_id: correlationId,
        properties: propsForDoc,
      },
    },
    event: {
      kind: "event",
      category: ["intrusion_detection"],
      type: isErr ? ["denied"] : ["info"],
      action: String("Microsoft.PolicyInsights/policyStates/summarize/action"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(2e13, 2e14),
    },
    message: isErr
      ? `Compliance rollup ${props.rollupWindow} degraded (${props.outstandingFindings} open)`
      : `Rollup compliant=${props.percentCompliantAggregate}% window=${props.rollupWindow}`,
    ...(docErr ? { error: docErr } : {}),
  };
}

/** Azure Advisor — recommendations, suppressions. */
export function generateAdvisorLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "generate",
    "suppress",
    "postpone",
    "dismiss",
    "export",
    "rightsizing",
  ] as const);
  const resourceId = `/subscriptions/${subscription.id}/providers/Microsoft.Advisor/recommendations/${randId(10)}`;

  if (variant === "generate") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      category: rand(["Cost", "Security", "Performance", "HighAvailability"]),
      impact: rand(["High", "Medium", "Low"]),
      freshCount: isErr ? 0 : randInt(3, 120),
      suppressedCount: randInt(0, 20),
      scanId: randUUID(),
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Advisor/recommendations"),
      azure: {
        advisor: {
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Generation",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.Advisor/recommendations/generate"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e7, 6e9),
      },
      message: isErr
        ? `Advisor: recommendation generation failed`
        : `Advisor: ${props.freshCount} new ${props.category} recommendations (${props.impact} impact)`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "suppress") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      recommendationId: `/subscriptions/${subscription.id}/providers/Microsoft.Advisor/recommendations/${randId(8)}`,
      ttl: `${randInt(30, 365)}d`,
      reason: rand(["noise", "accepted_risk", "third_party"]),
      suppressSuccess: !isErr,
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Advisor/recommendations"),
      azure: {
        advisor: {
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Suppression",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.Advisor/recommendations/suppressions/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e6, 2e9),
      },
      message: isErr
        ? `Advisor suppression failed for ${props.recommendationId}`
        : `Advisor: suppressed recommendation reason=${props.reason} ttl=${props.ttl}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "postpone") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      snoozeUntil: `${randInt(7, 180)}d`,
      recurrence: rand(["once", "weekly"]),
      correlationId,
      statusCode: isErr ? rand([400, 500]) : 200,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Advisor/recommendations/postpone/action",
      category: "Postpone",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Advisor/recommendations"),
      azure: {
        advisor: {
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Snooze",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.Advisor/recommendations/postpone/action"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e10, 2e13),
      },
      message: isErr
        ? `Advisor postpone failed (${props.statusCode})`
        : `Recommendation snoozed ${props.snoozeUntil}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "dismiss") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      dismissedIds: isErr ? 0 : randInt(1, 12),
      statusCode: isErr ? rand([409, 500]) : 204,
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Advisor/recommendations/dismiss/action",
      category: "Dismiss",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Advisor/recommendations"),
      azure: {
        advisor: {
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Dismiss",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.Advisor/recommendations/dismiss/action"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e11, 2e13),
      },
      message: isErr
        ? `Dismiss batch failed (${props.statusCode})`
        : `Permanent dismiss for ${props.dismissedIds} recs`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "export") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      exportFormat: rand(["Csv", "Parquet"]),
      rowsPacked: isErr ? 0 : randInt(200, 25_000),
      destinationContainer: `advexport-${randId(4)}`,
      statusCode: isErr ? rand([500, 503]) : 202,
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Advisor/recommendations/export/action",
      category: "Export",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Advisor/recommendations"),
      azure: {
        advisor: {
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "BulkExport",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.Advisor/recommendations/export/action"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e14, 2e14),
      },
      message: isErr
        ? `Advisor export failed (${props.statusCode})`
        : `Exported ${props.rowsPacked} findings`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  const docErr = aiSecurityPickError(isErr);
  const props = {
    resourceSku: rand(["Standard_D8s_v5", "Standard_E16s_v5"]),
    targetVm: `vm-${randId(5)}`,
    savingsUsdMonthly: randFloat(isErr ? 0 : 40, isErr ? 25 : 1200),
    riskNote: isErr ? "Sizing regression detected" : "Within safe downgrade window",
    correlationId,
  };
  const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.Advisor/recommendations/rightsizing/evaluate",
    category: "Rightsizing",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.resourceSku,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: propsForDoc,
    cloud: azureCloud(region, subscription, "Microsoft.Advisor/recommendations"),
    azure: {
      advisor: {
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: "Optimize",
        correlation_id: correlationId,
        properties: propsForDoc,
      },
    },
    event: {
      kind: "event",
      category: ["intrusion_detection"],
      type: isErr ? ["denied"] : ["info"],
      action: String("Microsoft.Advisor/recommendations/rightsizing/evaluate"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(2e13, 4e13),
    },
    message: isErr
      ? `Rightsizing check failed for ${props.targetVm}: ${props.riskNote}`
      : `Potential save $${props.savingsUsdMonthly.toFixed(2)}/mo by moving to ${props.resourceSku}`,
    ...(docErr ? { error: docErr } : {}),
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
  const variant = rand([
    "export",
    "budget",
    "anomaly",
    "reservation",
    "priceSheet",
    "forecast",
  ] as const);

  if (variant === "export") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      format: rand(["Csv", "Parquet"]),
      storageAccount: `st${randId(7)}`,
      blobPath: `cost/${rand(["daily", "monthly"])}/${randUUID()}.csv`,
      runId: randUUID(),
      rowCount: isErr ? 0 : randInt(1000, 9_000_000),
      bytesWritten: isErr ? 0 : randInt(50_000, 4e9),
      status: isErr ? "Failed" : "Completed",
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.CostManagement/exports"),
      azure: {
        cost_management: {
          export: exportName,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Export",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.CostManagement/exports/run/action"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e7, 15e9),
      },
      message: isErr
        ? `Cost export ${exportName}: run ${props.runId} failed`
        : `Cost export ${exportName}: wrote ${props.rowCount} rows to ${props.blobPath}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "budget") {
    const docErr = aiSecurityPickError(isErr);
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
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Consumption/budgets"),
      azure: {
        cost_management: {
          budget: budgetName,
          resource_group: resourceGroup,
          resource_id: budgetId,
          category: "BudgetThreshold",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.Consumption/budgets/alert"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e6, 5e9),
      },
      message: props.fired
        ? `Budget ${budgetName}: threshold ${props.thresholdPercent}% reached ($${props.amountUsd})`
        : `Budget ${budgetName}: within threshold`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "anomaly") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      serviceName: rand(["Virtual Machines", "Networking", "Containers"]),
      upliftPct: randFloat(isErr ? 5 : 120, isErr ? 25 : 950),
      anomalyId: randUUID(),
      statusCode: isErr ? rand([400, 500]) : 200,
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.CostManagement/Alerts",
      category: "CostAnomaly",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.CostManagement/alerts"),
      azure: {
        cost_management: {
          export: exportName,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Anomaly",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.CostManagement/Alerts"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e13, 2e14),
      },
      message: isErr
        ? `Cost anomaly signal failed (${props.statusCode})`
        : `Spike detected on ${props.serviceName} uplift=${props.upliftPct}%`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "reservation") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      riSku: rand(["D8s_v5", "E32s_v5"]),
      utilizationPct: randFloat(isErr ? 10 : 72, isErr ? 45 : 99),
      term: rand(["1year", "3year"]),
      statusCode: isErr ? rand([409, 500]) : 202,
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Capacity/reservationOrders/write",
      category: "Reservation",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Capacity/reservationOrders"),
      azure: {
        cost_management: {
          export: exportName,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "RI",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.Capacity/reservationOrders/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e14, 4e14),
      },
      message: isErr
        ? `RI purchase ${props.riSku} failed (${props.statusCode})`
        : `RI utilization ${props.utilizationPct}% for ${props.term}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "priceSheet") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      currency: rand(["USD", "EUR", "GBP"]),
      lineItems: isErr ? 0 : randInt(900, 900_000),
      hash: randId(12),
      correlationId,
      statusCode: isErr ? rand([500, 503]) : 200,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.CostManagement/query",
      category: "PriceSheet",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.CostManagement/query"),
      azure: {
        cost_management: {
          export: exportName,
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Commerce",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.CostManagement/query"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(9e13, 2e14),
      },
      message: isErr
        ? `Price sheet pull failed (${props.statusCode})`
        : `${props.lineItems} SKUs synced currency=${props.currency}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  const docErr = aiSecurityPickError(isErr);
  const props = {
    horizonMonths: rand([3, 6, 12]),
    projectedSpendUsd: randFloat(isErr ? 1 : 4500, isErr ? 999 : 2_900_000),
    confidencePct: randFloat(isErr ? 12 : 60, isErr ? 42 : 95),
    statusCode: isErr ? rand([500, 503]) : 200,
    correlationId,
  };
  const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.CostManagement/forecast",
    category: "Forecast",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: String(props.statusCode),
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: propsForDoc,
    cloud: azureCloud(region, subscription, "Microsoft.CostManagement/forecast"),
    azure: {
      cost_management: {
        export: exportName,
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: "Predictive",
        correlation_id: correlationId,
        properties: propsForDoc,
      },
    },
    event: {
      kind: "event",
      category: ["intrusion_detection"],
      type: isErr ? ["denied"] : ["info"],
      action: String("Microsoft.CostManagement/forecast"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(2e14, 2e14),
    },
    message: isErr
      ? `Forecast job failed (${props.statusCode})`
      : `${props.horizonMonths}m outlook $${props.projectedSpendUsd.toFixed(0)} conf=${props.confidencePct}%`,
    ...(docErr ? { error: docErr } : {}),
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
  const variant = rand([
    "inventory",
    "changefeed",
    "throttle",
    "mgmtGroup",
    "scheduled",
    "explain",
  ] as const);

  if (variant === "inventory") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      queryId,
      queryLength: randInt(40, 8000),
      resultCount: isErr ? 0 : randInt(0, 50_000),
      shardsQueried: randInt(4, 400),
      durationMs: isErr ? randInt(5000, 120_000) : randInt(80, 12_000),
      truncated: !isErr && Math.random() < 0.12,
      statusCode: isErr ? rand([400, 429, 500]) : 200,
      subscriptionScope: subscription.id,
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.ResourceGraph/queries"),
      azure: {
        resource_graph: {
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Query",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.ResourceGraph/resources/read"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e6, 4e9),
      },
      message: isErr
        ? `Resource Graph query ${queryId}: failed (${props.statusCode})`
        : `Resource Graph: ${props.resultCount} resources in ${props.durationMs}ms${props.truncated ? " [truncated]" : ""}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "changefeed") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      changeToken: randUUID(),
      mutationsObserved: isErr ? 0 : randInt(1, 9000),
      cursorLagMs: randInt(isErr ? 5000 : 200, isErr ? 120_000 : 4000),
      statusCode: isErr ? rand([500, 504]) : 200,
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.ResourceGraph/resourceChanges/read",
      category: "ChangeFeed",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.ResourceGraph/resourceChanges"),
      azure: {
        resource_graph: {
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "Drift",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.ResourceGraph/resourceChanges/read"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e13, 2e14),
      },
      message: isErr
        ? `Change feed stalled lag=${props.cursorLagMs}ms`
        : `${props.mutationsObserved} ARM mutations since token ${props.changeToken.slice(0, 8)}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "throttle") {
    const docErr = aiSecurityPickError(true);
    const props = {
      retryAfterSec: randInt(30, 240),
      quotaUsedPct: randFloat(92, 99.9),
      correlationId,
      statusCode: 429,
    };
    const propsForDoc = mergeAiSecurityArmProps(true, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.ResourceGraph/resources/read",
      category: "Throttle",
      resultType: "Failure",
      resultSignature: "429",
      callerIpAddress: callerIp,
      correlationId,
      level: "Warning",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.ResourceGraph/queries"),
      azure: {
        resource_graph: {
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "RateLimit",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: ["denied"],
        action: String("Microsoft.ResourceGraph/resources/read"),
        outcome: "failure",
        duration: randInt(9e11, 2e13),
      },
      message: `Resource Graph throttled retryAfter=${props.retryAfterSec}s usage=${props.quotaUsedPct}%`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "mgmtGroup") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      rootScope: `/providers/Microsoft.Management/managementGroups/${randId(8)}`,
      descendantResources: isErr ? 0 : randInt(200, 2_000_000),
      mgDepth: randInt(3, 8),
      statusCode: isErr ? rand([400, 403]) : 200,
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.ResourceGraph/resources/read",
      category: "HierarchyQueries",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.ResourceGraph/queries"),
      azure: {
        resource_graph: {
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "ManagementGroup",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.ResourceGraph/resources/read"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e13, 2e14),
      },
      message: isErr
        ? `MG-scope query unauthorized (${props.statusCode})`
        : `Traversal depth=${props.mgDepth} matched ${props.descendantResources}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "scheduled") {
    const docErr = aiSecurityPickError(isErr);
    const props = {
      schedulerRuleName: `sqr-${randId(5)}`,
      nextFireEpochSec: randInt(1_700_000_000, 2_050_000_000),
      lastRunMs: randInt(isErr ? 240_000 : 2000, isErr ? 900_000 : 45_000),
      correlationId,
    };
    const propsForDoc = mergeAiSecurityArmProps(isErr, true, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.ResourceGraph/queries/scheduledWrites",
      category: "Automation",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.schedulerRuleName,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.ResourceGraph/queries"),
      azure: {
        resource_graph: {
          resource_group: resourceGroup,
          resource_id: resourceId,
          category: "ScheduledQuery",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["intrusion_detection"],
        type: isErr ? ["denied"] : ["info"],
        action: String("Microsoft.ResourceGraph/queries/scheduledWrites"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e14, 2e14),
      },
      message: isErr
        ? `Scheduled ARG job ${props.schedulerRuleName} breached SLA (${props.lastRunMs}ms)`
        : `Next fire @${props.nextFireEpochSec}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  const docErr = aiSecurityPickError(isErr);
  const props = {
    explainJsonBytes: randInt(200, 120_000),
    missingIndexHint: isErr,
    estimatedRows: isErr ? 0 : randInt(10, 5_000_000),
    correlationId,
    statusCode: isErr ? rand([400, 500]) : 200,
  };
  const propsForDoc = mergeAiSecurityArmProps(isErr, false, props, docErr);
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.ResourceGraph/resources/explain",
    category: "Diagnostics",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: String(props.statusCode),
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Information" : "Information",
    properties: propsForDoc,
    cloud: azureCloud(region, subscription, "Microsoft.ResourceGraph/queries"),
    azure: {
      resource_graph: {
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: "ExplainPlan",
        correlation_id: correlationId,
        properties: propsForDoc,
      },
    },
    event: {
      kind: "event",
      category: ["intrusion_detection"],
      type: isErr ? ["denied"] : ["info"],
      action: String("Microsoft.ResourceGraph/resources/explain"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(1e11, 2e13),
    },
    message: isErr
      ? `Explain failed (${props.statusCode}) bytes=${props.explainJsonBytes}`
      : `Planner estimates ${props.estimatedRows} rows`,
    ...(docErr ? { error: docErr } : {}),
  };
}
