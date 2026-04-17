/**
 * GCP integration and API platform log generators (Integration Connectors, Application Integration, API Hub).
 */

import {
  type EcsDocument,
  rand,
  randInt,
  randId,
  gcpCloud,
  makeGcpSetup,
  randOperationId,
  randLatencyMs,
  randSeverity,
} from "./helpers.js";

export function generateIntegrationConnectorsLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const connectors = [
    "salesforce",
    "servicenow",
    "jira",
    "hubspot",
    "zendesk",
    "sap",
    "oracle-db",
    "mysql",
  ];
  const connector = rand(connectors);
  const actions = [
    "EXECUTE_ACTION",
    "LIST_ENTITIES",
    "GET_ENTITY",
    "CREATE_ENTITY",
    "UPDATE_ENTITY",
    "DELETE_ENTITY",
  ];
  const action = rand(actions);
  const connectionName = `conn-${connector}-${randId(4).toLowerCase()}`;
  const latencyMs = randLatencyMs(randInt(50, 2000), isErr);
  const recordsProcessed = randInt(1, 500);
  const status = isErr ? "FAILED" : "SUCCEEDED";
  const severity = randSeverity(isErr);
  const message = isErr
    ? `connectors.googleapis.com: Connection "${connectionName}" ${action} FAILED: ${rand(["Upstream OAuth refresh token invalid", "Partner API 429 Too Many Requests", "Entity key not found", "SSL handshake with on-prem broker failed"])}`
    : `Managed connector execution: connection=${connectionName} connector_type=${connector} action=${action} records=${recordsProcessed} latency_ms=${latencyMs.toFixed(1)} status=${status}`;

  return {
    "@timestamp": ts,
    severity,
    labels: {
      "resource.type": "connectors.googleapis.com/Connection",
      connection: connectionName,
      connector_type: connector,
    },
    cloud: gcpCloud(region, project, "connectors.googleapis.com"),
    gcp: {
      integration_connectors: {
        connection_name: connectionName,
        connector_type: connector,
        action,
        entity_type: rand(["Account", "Contact", "Lead", "Opportunity", "Ticket", "Order"]),
        latency_ms: Math.round(latencyMs),
        records_processed: recordsProcessed,
        status,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: Math.round(latencyMs) },
    message,
  };
}

export function generateApplicationIntegrationLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const integrations = [
    "order-sync",
    "user-provisioning",
    "inventory-update",
    "payment-process",
    "notification-router",
  ];
  const integration = rand(integrations);
  const triggers = ["API", "CLOUD_SCHEDULER", "PUBSUB", "CLOUD_FUNCTIONS", "WORKFLOWS_CALLBACK"];
  const triggerType = rand(triggers);
  const executionId = randOperationId();
  const taskName = rand([
    "DataMapper",
    "Connector",
    "SubProcess",
    "ScriptTask",
    "FieldMapping",
    "WorkflowsExecute",
  ]);
  const status = isErr ? "FAILED" : "SUCCEEDED";
  const executionTimeMs = randInt(100, isErr ? 60000 : 5000);
  const tasksExecuted = randInt(3, 15);
  const severity = randSeverity(isErr);
  const message = isErr
    ? `integrations.googleapis.com: Integration "${integration}" execution ${executionId} FAILED at task="${taskName}": ${rand(["Task deadline exceeded", "Connector task returned non-retryable error", "SubWorkflow execution CANCELLED", "Quota for integration executions exceeded"])}`
    : `Integration "${integration}" execution ${executionId}: trigger=${triggerType} status=${status} tasks_executed=${tasksExecuted} duration_ms=${executionTimeMs} last_task="${taskName}"`;

  return {
    "@timestamp": ts,
    severity,
    labels: {
      "resource.type": "integrations.googleapis.com/Execution",
      integration,
      execution_id: executionId,
    },
    cloud: gcpCloud(region, project, "integrations.googleapis.com"),
    gcp: {
      application_integration: {
        integration_name: integration,
        execution_id: executionId,
        trigger_type: triggerType,
        task_name: taskName,
        status,
        execution_time_ms: executionTimeMs,
        tasks_executed: tasksExecuted,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: executionTimeMs },
    message,
  };
}

export function generateApiHubLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const apis = ["user-api", "payment-api", "inventory-api", "notification-api", "analytics-api"];
  const apiName = rand(apis);
  const actions = ["REGISTER_API", "UPDATE_VERSION", "DEPRECATE", "REVIEW", "APPROVE", "LIST_APIS"];
  const action = rand(actions);
  const version = `v${randInt(1, 5)}.${randInt(0, 9)}.${randInt(0, 20)}`;
  const severity = randSeverity(isErr);
  const message = isErr
    ? `apihub.googleapis.com: ${action} FAILED for api=${apiName}@${version}: ${rand(["Spec validation error (OpenAPI)", "Duplicate display name in hub", "PERMISSION_DENIED on apihub.apis.create", "Proto descriptor parse error"])}`
    : `API Hub ${action}: api="${apiName}" version=${version} style=${rand(["REST", "gRPC", "GraphQL", "AsyncAPI"])} lifecycle=${rand(["DESIGN", "DEVELOP", "DEPLOY", "DEPRECATE"])} spec=${rand(["OPENAPI_V3", "PROTO", "GRAPHQL_SCHEMA"])} consumers=${randInt(0, 50)}`;

  return {
    "@timestamp": ts,
    severity,
    labels: { "resource.type": "apihub.googleapis.com/Api", api: apiName },
    cloud: gcpCloud(region, project, "apihub.googleapis.com"),
    gcp: {
      api_hub: {
        api_name: apiName,
        version,
        action,
        style: rand(["REST", "gRPC", "GraphQL", "AsyncAPI"]),
        lifecycle_stage: rand(["DESIGN", "DEVELOP", "DEPLOY", "DEPRECATE"]),
        spec_type: rand(["OPENAPI_V3", "PROTO", "GRAPHQL_SCHEMA"]),
        consumers_count: randInt(0, 50),
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e4, 5e6) },
    message,
  };
}
