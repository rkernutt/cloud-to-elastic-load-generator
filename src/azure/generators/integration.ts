import {
  type EcsDocument,
  rand,
  randInt,
  randId,
  randIp,
  azureCloud,
  makeAzureSetup,
  randCorrelationId,
  randUUID,
  HTTP_METHODS,
} from "./helpers.js";

export function generateIotHubLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const hubName = `iothub-${randId(6).toLowerCase()}`;
  const deviceId = `device-${randId(8).toLowerCase()}`;
  const correlationId = randCorrelationId();
  const callerIp = randIp();
  const resourceId = `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Devices/IotHubs/${hubName}`;
  const operation = rand([
    "d2c.telemetry.ingress",
    "c2d.command.complete",
    "twin.read",
    "twin.update",
  ] as const);
  const protocol = rand(["MQTT", "AMQP", "HTTPS"] as const);
  const statusCode = isErr ? rand([400, 401, 404, 500] as const) : 200;
  const category = "Connections";
  const resultType = statusCode >= 400 ? "Failed" : "Succeeded";
  const level = statusCode >= 500 ? "Error" : statusCode >= 400 ? "Warning" : "Informational";
  const messageBytes = isErr ? randInt(0, 512) : randInt(64, 262_144);
  const properties: Record<string, unknown> = {
    resourceId,
    deviceId,
    operationName: operation,
    protocol,
    authType: rand(["sas", "x509", "deviceKey"]),
    messageSize: messageBytes,
    statusCode,
    enqueuedTime: ts,
    partitionId: randInt(0, 31),
    trackingId: randUUID(),
  };

  return {
    "@timestamp": ts,
    cloud: azureCloud(region, subscription, "Microsoft.Devices/IotHubs"),
    category,
    operationName: operation,
    resultType,
    level,
    correlationId,
    callerIpAddress: callerIp,
    properties,
    azure: {
      iot_hub: {
        hub_name: hubName,
        resource_group: resourceGroup,
        device_id: deviceId,
        operation:
          operation === "d2c.telemetry.ingress"
            ? "D2C"
            : operation === "c2d.command.complete"
              ? "C2D"
              : operation.startsWith("twin")
                ? "TWIN"
                : "IOT",
        protocol,
        message_bytes: messageBytes,
        status: statusCode,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e5, 5e8) },
    message: isErr
      ? `IoT Hub diagnostic ${hubName}: ${operation} failed for ${deviceId} HTTP ${statusCode} tracking=${properties.trackingId}`
      : `IoT Hub diagnostic ${hubName}: ${operation} accepted from ${deviceId} via ${protocol}`,
  };
}

export function generateLogicAppsLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const workflowName = rand([
    "order-processing",
    "approval-workflow",
    "notification-relay",
    "data-sync",
  ]);
  const workflowId = randId(32).toLowerCase();
  const runId = randId(16).toLowerCase();
  const actionName = rand(["ParseJSON", "SendEmail", "HttpRequest", "Condition", "ForEach"]);
  const actionType = rand(["ApiConnection", "Http", "ServiceProvider"] as const);
  const triggerName = rand(["manual", "recurrence", "http", "serviceBusTrigger"]);
  const status = isErr ? rand(["Failed", "Skipped"] as const) : "Succeeded";
  const durationMs = randInt(isErr ? 500 : 20, isErr ? 60_000 : 8_000);
  const correlationId = randCorrelationId();
  const callerIp = randIp();
  const resourceId = `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Logic/workflows/${workflowName}`;
  const category = "WorkflowRuntime";
  const operationName = `WorkflowAction${status}`;
  const resultType = status === "Succeeded" ? "Succeeded" : "Failed";
  const level = status === "Failed" ? "Error" : status === "Skipped" ? "Warning" : "Informational";
  const properties: Record<string, unknown> = {
    resourceId,
    workflowId,
    workflowName,
    runId,
    actionName,
    actionType,
    triggerName,
    status,
    durationInMilliseconds: durationMs,
    correlation: { clientTrackingId: randUUID() },
    error: isErr
      ? {
          code: "InvalidTemplate",
          message: "Unable to process template language expressions in action inputs.",
        }
      : null,
  };

  return {
    "@timestamp": ts,
    cloud: azureCloud(region, subscription, "Microsoft.Logic/workflows"),
    category,
    operationName,
    resultType,
    level,
    correlationId,
    callerIpAddress: callerIp,
    properties,
    azure: {
      logic_apps: {
        workflow_name: workflowName,
        workflow_id: workflowId,
        resource_group: resourceGroup,
        run_id: runId,
        action_name: actionName,
        action_type: actionType,
        trigger_name: triggerName,
        status,
        duration_ms: durationMs,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: durationMs * 1_000_000 },
    message: isErr
      ? `Logic Apps runtime ${workflowName}: run ${runId} failed on ${actionName} (${String((properties.error as { code?: string })?.code)})`
      : `Logic Apps runtime ${workflowName}: run ${runId} completed in ${durationMs}ms`,
  };
}

export function generateApiManagementLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const serviceName = `apim-${randId(6).toLowerCase()}`;
  const apiId = rand(["orders-api", "users-api", "payments-api", "inventory-api"]);
  const operationId = rand(["getOrders", "createUser", "processPayment", "listItems"]);
  const method = rand(HTTP_METHODS);
  const url = `https://${serviceName}.azure-api.net/${apiId}/v1/${operationId}`;
  const correlationId = randCorrelationId();
  const callerIp = randIp();
  const resourceId = `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.ApiManagement/service/${serviceName}`;
  const style = rand(["GatewayLogs", "GatewayLogsError", "PolicyEvaluation"] as const);
  const responseCode =
    style === "GatewayLogsError" || isErr
      ? rand([400, 401, 403, 429, 500, 502, 503])
      : rand([200, 200, 200, 201, 204]);
  const backendResponseCode =
    style === "PolicyEvaluation" ? 401 : responseCode >= 500 ? rand([500, 502, 503]) : responseCode;
  const backendTimeMs = randInt(isErr ? 100 : 5, isErr ? 30_000 : 2_000);
  const cache = rand(["hit", "miss", "none"] as const);
  const subscriptionName = rand(["gold-tier", "silver-tier", "developer", "internal"]);
  const category = "GatewayLogs";
  const operationName = style === "PolicyEvaluation" ? "Policy" : "RequestResponse";
  const resultType = responseCode >= 400 ? "Failed" : "Succeeded";
  const level = responseCode >= 500 ? "Error" : responseCode >= 400 ? "Warning" : "Informational";
  const responseSize = responseCode >= 400 ? randInt(80, 4000) : randInt(500, 4_000_000);

  const properties: Record<string, unknown> = {
    resourceId,
    apiId: `/apis/${apiId}`,
    operationId: `/apis/${apiId}/operations/${operationId}`,
    method,
    url,
    responseCode,
    responseSize,
    cache: cache === "none" ? "none" : cache,
    backendResponseCode,
    backendTime: backendTimeMs,
    totalTime: backendTimeMs + randInt(1, 80),
    apimSubscriptionId: subscriptionName,
    productId: rand(["prod-enterprise", "prod-partner", "prod-internal"]),
    userId: rand(["1", "42", "anonymous"]),
    clientProtocol: "HTTP/1.1",
    lastError: isErr
      ? {
          source: style === "PolicyEvaluation" ? "validate-jwt" : "forward-request",
          reason:
            style === "PolicyEvaluation"
              ? "JWT not present or invalid."
              : "Backend connection failure.",
          message:
            style === "PolicyEvaluation"
              ? "IDX10500: Signature validation failed."
              : "The remote server returned an error.",
        }
      : null,
    policyId: style === "PolicyEvaluation" ? "inbound-validate-jwt" : null,
    policyScope: style === "PolicyEvaluation" ? "inbound" : null,
  };

  if (style === "PolicyEvaluation") {
    properties.policyEvent = rand([
      "rate-limit-key",
      "jwt-validation",
      "rewrite-uri",
      "set-header",
    ]);
    properties.remainingCalls = responseCode === 429 ? 0 : randInt(1, 900);
    properties.retryAfter = responseCode === 429 ? randInt(1, 120) : null;
  }

  return {
    "@timestamp": ts,
    cloud: azureCloud(region, subscription, "Microsoft.ApiManagement/service"),
    category,
    operationName,
    resultType,
    level,
    correlationId,
    callerIpAddress: callerIp,
    properties,
    azure: {
      api_management: {
        service_name: serviceName,
        resource_group: resourceGroup,
        api_id: apiId,
        operation_id: operationId,
        method,
        url,
        response_code: responseCode,
        backend_response_time_ms: backendTimeMs,
        cache,
        subscription_name: subscriptionName,
      },
    },
    event: {
      outcome: isErr || responseCode >= 400 ? "failure" : "success",
      duration: randInt(1e6, 5e9),
    },
    message:
      style === "PolicyEvaluation"
        ? `API Management ${serviceName}: policy ${properties.policyEvent} outcome HTTP ${responseCode} api=${apiId}`
        : `API Management ${serviceName}: ${method} ${apiId}/${operationId} client=${responseCode} backend=${backendResponseCode} ${backendTimeMs}ms cache=${cache}`,
  };
}

export function generateEventGridLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const topicName = rand([
    "blob-events",
    "custom-topic-prod",
    "domain-events",
    "system-topic-storage",
  ]);
  const subject = rand([
    "/blobServices/default/containers/data/blobs/file.csv",
    "/subscriptions/events/resource/created",
    "custom/app/event",
    "/eventhubs/telemetry/capture",
  ]);
  const eventType = rand([
    "Microsoft.Storage.BlobCreated",
    "Microsoft.EventHub.CaptureFileCreated",
    "Microsoft.Resources.ResourceWriteSuccess",
    "custom.app.eventPublished",
  ]);
  const deliveryCount = isErr ? randInt(3, 30) : randInt(1, 3);
  const deliveryStatus = isErr ? rand(["Failed", "Dropped"] as const) : "Delivered";
  const subscriptionName = rand(["sub-function-handler", "sub-logic-app", "sub-webhook"]);
  const correlationId = randCorrelationId();
  const callerIp = randIp();
  const resourceId = `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.EventGrid/topics/${topicName}`;
  const category = isErr ? "DeliveryFailures" : "PublishEvents";
  const operationName = isErr
    ? "Microsoft.EventGrid.SubscriptionDeliveryFailed"
    : "Microsoft.EventGrid.SubscriptionDeliveryAttempt";
  const resultType = isErr ? "Failed" : "Succeeded";
  const level = isErr ? "Error" : "Informational";
  const properties: Record<string, unknown> = {
    resourceId,
    topic: topicName,
    subject,
    eventType,
    eventId: randUUID(),
    deliveryCount,
    deliveryStatus,
    subscriptionName,
    endpointBaseUrl: `https://${rand(["func", "logic"])}-${randId(4)}.azurewebsites.net/runtime/webhooks/EventGrid`,
    lastHttpStatusCode: isErr ? rand([400, 404, 500, 502]) : 200,
    lastDeliveryOutcome: deliveryStatus,
    deadLetterReason: isErr ? rand(["MaxDeliveryAttemptsExceeded", "ResponseTimeout"]) : null,
  };

  return {
    "@timestamp": ts,
    cloud: azureCloud(region, subscription, "Microsoft.EventGrid/topics"),
    category,
    operationName,
    resultType,
    level,
    correlationId,
    callerIpAddress: callerIp,
    properties,
    azure: {
      event_grid: {
        topic_name: topicName,
        resource_group: resourceGroup,
        subject,
        event_type: eventType,
        delivery_count: deliveryCount,
        delivery_status: deliveryStatus,
        subscription_name: subscriptionName,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(5e5, 2e8) },
    message: isErr
      ? `Event Grid ${topicName}: delivery ${deliveryStatus} for ${eventType} attempts=${deliveryCount} lastHttp=${properties.lastHttpStatusCode}`
      : `Event Grid ${topicName}: delivered ${eventType} to ${subscriptionName}`,
  };
}

export function generateSynapseWorkspaceLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const workspaceName = `synapse-${randId(6).toLowerCase()}`;
  const poolName = rand(["sql-pool-1", "spark-pool-main", "serverless"]);
  const jobId = randId(16).toLowerCase();
  const queryIdOrJobName = poolName.startsWith("spark")
    ? `spark-job-${randInt(1000, 9999)}`
    : `query-${randId(8).toLowerCase()}`;
  const status = isErr
    ? rand(["Failed", "Cancelled"] as const)
    : rand(["Succeeded", "Running"] as const);
  const durationMs = randInt(isErr ? 500 : 100, isErr ? 120_000 : 3_600_000);
  const dataProcessedBytes = randInt(0, 500_000_000_000);
  const correlationId = randCorrelationId();
  const callerIp = randIp();
  const resourceId = `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Synapse/workspaces/${workspaceName}`;
  const category = poolName.startsWith("spark") ? "SparkService" : "SqlPools";
  const operationName = poolName.startsWith("spark") ? "SparkApplicationEnd" : "SqlPoolDms";
  const resultType = status === "Succeeded" || status === "Running" ? "Succeeded" : "Failed";
  const level =
    status === "Failed" ? "Error" : status === "Cancelled" ? "Warning" : "Informational";
  const properties: Record<string, unknown> = {
    resourceId,
    workspaceName,
    poolName,
    jobId,
    queryId: queryIdOrJobName,
    status,
    durationInMs: durationMs,
    dataProcessedBytes,
    sessionId: randUUID(),
    applicationId: poolName.startsWith("spark") ? `application_${randInt(100000, 999999)}` : null,
  };

  return {
    "@timestamp": ts,
    cloud: azureCloud(region, subscription, "Microsoft.Synapse/workspaces"),
    category,
    operationName,
    resultType,
    level,
    correlationId,
    callerIpAddress: callerIp,
    properties,
    azure: {
      synapse: {
        workspace_name: workspaceName,
        resource_group: resourceGroup,
        pool_name: poolName,
        job_id: jobId,
        query_id_or_job_name: queryIdOrJobName,
        status,
        duration_ms: durationMs,
        data_processed_bytes: dataProcessedBytes,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: durationMs * 1_000_000 },
    message: isErr
      ? `Synapse diagnostic ${workspaceName}: ${queryIdOrJobName} on ${poolName} ended ${status}`
      : `Synapse diagnostic ${workspaceName}: ${queryIdOrJobName} ${status} duration=${durationMs}ms`,
  };
}

export function generateDatabricksLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const workspaceId = `adb-${randInt(1_000_000_000, 9_999_999_999)}`;
  const clusterId = `${randId(4).toLowerCase()}-${randId(6).toLowerCase()}-${randId(6).toLowerCase()}`;
  const clusterName = rand(["job-cluster", "interactive-cluster", "automl-cluster", "shared-dev"]);
  const jobId = randInt(1000, 999_999);
  const runId = randInt(10_000, 9_999_999);
  const action = rand(["Create", "Delete", "Start", "Terminate", "RunNow"] as const);
  const principal = `user${randInt(100, 999)}@${rand(["contoso", "fabrikam"])}.com`;
  const sourceIp = `${randInt(100, 203)}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`;
  const correlationId = randCorrelationId();
  const resourceId = `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Databricks/workspaces/dbw-${randId(5)}`;
  const category = "clusters";
  const operationName = `cluster.${action.toLowerCase()}`;
  const resultType = isErr ? "Failed" : "Succeeded";
  const level = isErr ? "Error" : "Informational";
  const properties: Record<string, unknown> = {
    resourceId,
    workspaceId,
    clusterId,
    clusterName,
    jobId,
    runId,
    action,
    userName: principal,
    sourceIPAddress: sourceIp,
    requestId: randUUID(),
    serviceName: "clusters",
    eventTime: ts,
    errorMessage: isErr ? "Cluster failed to start: insufficient capacity in region." : null,
  };

  return {
    "@timestamp": ts,
    cloud: azureCloud(region, subscription, "Microsoft.Databricks/workspaces"),
    category,
    operationName,
    resultType,
    level,
    correlationId,
    callerIpAddress: sourceIp,
    properties,
    azure: {
      databricks: {
        workspace_id: workspaceId,
        resource_group: resourceGroup,
        cluster_id: clusterId,
        cluster_name: clusterName,
        job_id: jobId,
        run_id: runId,
        action,
        principal,
        source_ip: sourceIp,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e6, 2e9) },
    message: isErr
      ? `Databricks audit ${workspaceId}: ${action} failed for cluster ${clusterName} (${properties.errorMessage})`
      : `Databricks audit ${workspaceId}: ${action} on cluster ${clusterName} by ${principal}`,
  };
}
