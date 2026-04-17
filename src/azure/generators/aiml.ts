import {
  type EcsDocument,
  rand,
  randInt,
  randId,
  azureCloud,
  makeAzureSetup,
  randCorrelationId,
  randUUID,
} from "./helpers.js";

export function generateOpenAiLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const account = `oai-${randId(6).toLowerCase()}`;
  const deployment = rand(["gpt-4o", "gpt-4.1-mini", "text-embedding-3-large", "gpt-35-turbo"]);
  const correlationId = randCorrelationId();
  const callerIp = `${randInt(10, 223)}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`;
  const resourceId = `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.CognitiveServices/accounts/${account}`;
  const style = rand(["Request", "ContentFilter", "RateLimit", "Deployment"] as const);
  const rateLimited = isErr || style === "RateLimit";
  const filtered = style === "ContentFilter" && (isErr || Math.random() < 0.45);

  let category = "RequestResponse";
  let operationName = "ChatCompletions_Create";
  let resultType = "Succeeded";
  let level: string = "Informational";
  const properties: Record<string, unknown> = {
    resourceId,
    deploymentName: deployment,
    callerIpAddress: callerIp,
    correlationId,
    requestId: randUUID(),
    apiVersion: "2024-10-21",
  };
  let message = "";

  if (style === "Request") {
    const promptTokens = randInt(50, 12_000);
    const completionTokens = rateLimited ? 0 : randInt(20, 4000);
    const totalTokens = promptTokens + completionTokens;
    const durationMs = rateLimited ? randInt(50, 400) : randInt(200, 18_000);
    properties.model = deployment;
    properties.promptTokens = promptTokens;
    properties.completionTokens = completionTokens;
    properties.totalTokens = totalTokens;
    properties.durationMs = durationMs;
    properties.statusCode = rateLimited ? 429 : rand([200, 200, 200, 400]);
    properties.stream = rand([true, false]);
    resultType = Number(properties.statusCode) >= 400 ? "Failed" : "Succeeded";
    level = Number(properties.statusCode) >= 400 ? "Error" : "Informational";
    message =
      Number(properties.statusCode) === 429
        ? `Azure OpenAI ${account}/${deployment}: rate limited requestId=${properties.requestId}`
        : `Azure OpenAI ${account}/${deployment}: completion status=${properties.statusCode} tokens=${totalTokens} in ${durationMs}ms`;
  } else if (style === "ContentFilter") {
    category = "ContentFilter";
    operationName = "ContentFilterEvaluated";
    properties.category = "ContentFilter";
    properties.severity = filtered ? rand(["high", "medium"]) : "low";
    properties.blocked = filtered;
    properties.filteredReason = filtered
      ? rand(["hate", "sexual", "violence", "self_harm", "jailbreak"])
      : "none";
    properties.model = deployment;
    properties.promptTokens = randInt(20, 2000);
    properties.completionTokens = filtered ? 0 : randInt(10, 800);
    properties.totalTokens = Number(properties.promptTokens) + Number(properties.completionTokens);
    resultType = filtered ? "Failed" : "Succeeded";
    level = filtered ? "Warning" : "Informational";
    message = filtered
      ? `Azure OpenAI content filter: blocked output reason=${properties.filteredReason} deployment=${deployment}`
      : `Azure OpenAI content filter: allowed prompt severity=${properties.severity}`;
  } else if (style === "RateLimit") {
    category = "RateLimit";
    operationName = "ThrottledRequest";
    properties.statusCode = 429;
    properties.retryAfter = `${randInt(1, 60)}s`;
    properties.remainingRequests = 0;
    properties.deploymentName = deployment;
    properties.model = deployment;
    properties.promptTokens = randInt(0, 400);
    properties.completionTokens = 0;
    properties.totalTokens = properties.promptTokens;
    properties.durationMs = randInt(5, 80);
    resultType = "Failed";
    level = "Warning";
    message = `Azure OpenAI ${account}: 429 Too Many Requests retry-after=${properties.retryAfter} deployment=${deployment}`;
  } else {
    category = "DeploymentManagement";
    operationName = rand([
      "ModelDeploymentStarted",
      "ModelDeploymentSucceeded",
      "ModelDeploymentScaling",
    ] as const);
    properties.deploymentName = deployment;
    properties.sku = rand(["Standard", "GlobalStandard", "ProvisionedManaged"]);
    properties.capacity = randInt(1, 300);
    properties.oldCapacity = operationName === "ModelDeploymentScaling" ? randInt(1, 120) : null;
    resultType = isErr ? "Failed" : "Succeeded";
    level = isErr ? "Error" : "Informational";
    message = isErr
      ? `Azure OpenAI deployment ${deployment} in ${account}: provisioning failed (quota)`
      : `Azure OpenAI deployment ${deployment}: ${operationName} capacity=${properties.capacity}`;
  }

  return {
    "@timestamp": ts,
    time: ts,
    resourceId,
    cloud: azureCloud(region, subscription, "Microsoft.CognitiveServices/accounts"),
    category,
    operationName,
    resultType,
    level,
    correlationId,
    callerIpAddress: callerIp,
    properties,
    azure: {
      openai: {
        resource_group: resourceGroup,
        deployment,
        model: String(properties.model ?? deployment),
        prompt_tokens: Number(properties.promptTokens ?? randInt(50, 2000)),
        completion_tokens: Number(properties.completionTokens ?? 0),
        finish_reason: filtered ? "content_filter" : rateLimited ? "length" : "stop",
      },
    },
    event: {
      outcome: resultType === "Failed" ? "failure" : "success",
      duration: randInt(2e6, rateLimited ? 6e10 : 4e9),
    },
    message,
  };
}
