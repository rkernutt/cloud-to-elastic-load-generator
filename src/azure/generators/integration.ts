/**
 * Dedicated log generators for Azure integration / messaging / analytics services.
 */

import {
  type EcsDocument,
  rand,
  randInt,
  randId,
  azureCloud,
  makeAzureSetup,
} from "./helpers.js";

// ---------------------------------------------------------------------------
// IoT Hub
// ---------------------------------------------------------------------------

export function generateIotHubLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const hubName = `iothub-${randId(6).toLowerCase()}`;
  const deviceId = `device-${randId(8).toLowerCase()}`;
  const operation = rand(["D2C", "C2D", "TwinRead", "TwinUpdate"] as const);
  const protocol = rand(["MQTT", "AMQP", "HTTPS"] as const);
  const status = isErr ? rand([400, 500] as const) : 200;
  const messageBytes = isErr ? randInt(0, 512) : randInt(64, 262_144);
  return {
    "@timestamp": ts,
    cloud: azureCloud(region, subscription, "Microsoft.Devices/IotHubs"),
    azure: {
      iot_hub: {
        hub_name: hubName,
        resource_group: resourceGroup,
        device_id: deviceId,
        operation,
        protocol,
        message_bytes: messageBytes,
        status,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e5, 5e8) },
    message: isErr
      ? `IoT Hub ${hubName}: ${operation} from ${deviceId} failed (${status})`
      : `IoT Hub ${hubName}: ${operation} via ${protocol} from ${deviceId}`,
  };
}

// ---------------------------------------------------------------------------
// Logic Apps
// ---------------------------------------------------------------------------

export function generateLogicAppsLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const workflowName = rand(["order-processing", "approval-workflow", "notification-relay", "data-sync"]);
  const workflowId = randId(32).toLowerCase();
  const runId = randId(16).toLowerCase();
  const actionName = rand(["ParseJSON", "SendEmail", "HttpRequest", "Condition", "ForEach"]);
  const actionType = rand(["ApiConnection", "Http", "ServiceProvider"] as const);
  const triggerName = rand(["manual", "recurrence", "http", "serviceBusTrigger"]);
  const status = isErr
    ? rand(["Failed", "Skipped"] as const)
    : "Succeeded";
  const durationMs = randInt(isErr ? 500 : 20, isErr ? 60_000 : 8_000);
  return {
    "@timestamp": ts,
    cloud: azureCloud(region, subscription, "Microsoft.Logic/workflows"),
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
      ? `Logic Apps ${workflowName}: run ${runId} ${status.toLowerCase()} on action ${actionName}`
      : `Logic Apps ${workflowName}: run ${runId} succeeded (${durationMs}ms)`,
  };
}

// ---------------------------------------------------------------------------
// API Management
// ---------------------------------------------------------------------------

export function generateApiManagementLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const serviceName = `apim-${randId(6).toLowerCase()}`;
  const apiId = rand(["orders-api", "users-api", "payments-api", "inventory-api"]);
  const operationId = rand(["getOrders", "createUser", "processPayment", "listItems"]);
  const method = rand(["GET", "POST", "PUT", "DELETE"]);
  const url = `https://${serviceName}.azure-api.net/${apiId}/${operationId.toLowerCase()}`;
  const responseCode = isErr ? rand([400, 401, 403, 429, 500, 502, 503]) : rand([200, 200, 200, 201, 204]);
  const backendResponseTimeMs = randInt(isErr ? 100 : 5, isErr ? 30_000 : 2_000);
  const cache = rand(["hit", "miss", "none"] as const);
  const subscriptionName = rand(["gold-tier", "silver-tier", "developer", "internal"]);
  return {
    "@timestamp": ts,
    cloud: azureCloud(region, subscription, "Microsoft.ApiManagement/service"),
    azure: {
      api_management: {
        service_name: serviceName,
        resource_group: resourceGroup,
        api_id: apiId,
        operation_id: operationId,
        method,
        url,
        response_code: responseCode,
        backend_response_time_ms: backendResponseTimeMs,
        cache,
        subscription_name: subscriptionName,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e6, 5e9) },
    message: isErr
      ? `API Management ${serviceName}: ${method} ${apiId}/${operationId} → ${responseCode}`
      : `API Management ${serviceName}: ${method} ${apiId}/${operationId} OK (${backendResponseTimeMs}ms, cache:${cache})`,
  };
}

// ---------------------------------------------------------------------------
// Event Grid
// ---------------------------------------------------------------------------

export function generateEventGridLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const topicName = rand(["blob-events", "custom-topic-prod", "domain-events", "system-topic-storage"]);
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
  const deliveryStatus = isErr
    ? rand(["Failed", "Dropped"] as const)
    : "Delivered";
  const subscriptionName = rand(["sub-function-handler", "sub-logic-app", "sub-webhook"]);
  return {
    "@timestamp": ts,
    cloud: azureCloud(region, subscription, "Microsoft.EventGrid/topics"),
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
      ? `Event Grid ${topicName}: delivery ${deliveryStatus} for ${eventType} (${deliveryCount} attempts)`
      : `Event Grid ${topicName}: delivered ${eventType} to ${subscriptionName}`,
  };
}

// ---------------------------------------------------------------------------
// Synapse Workspace
// ---------------------------------------------------------------------------

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
  return {
    "@timestamp": ts,
    cloud: azureCloud(region, subscription, "Microsoft.Synapse/workspaces"),
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
      ? `Synapse ${workspaceName}: ${queryIdOrJobName} on ${poolName} ${status.toLowerCase()}`
      : `Synapse ${workspaceName}: ${queryIdOrJobName} completed in ${durationMs}ms`,
  };
}

// ---------------------------------------------------------------------------
// Databricks
// ---------------------------------------------------------------------------

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
  return {
    "@timestamp": ts,
    cloud: azureCloud(region, subscription, "Microsoft.Databricks/workspaces"),
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
      ? `Databricks ${workspaceId}: ${action} on cluster ${clusterName} failed (principal: ${principal})`
      : `Databricks ${workspaceId}: ${action} on cluster ${clusterName} by ${principal}`,
  };
}
