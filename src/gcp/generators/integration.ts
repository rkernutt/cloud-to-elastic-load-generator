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

const GRPC_RPC_STATUSES = [
  "INTERNAL",
  "DEADLINE_EXCEEDED",
  "PERMISSION_DENIED",
  "RESOURCE_EXHAUSTED",
  "NOT_FOUND",
  "ALREADY_EXISTS",
  "UNAVAILABLE",
] as const;

type GrpcRpcStatus = (typeof GRPC_RPC_STATUSES)[number];

const GRPC_MESSAGES: Partial<Record<GrpcRpcStatus, string>> = {
  INTERNAL: "Integration control plane internal error",
  DEADLINE_EXCEEDED: "Connector or integration action deadline exceeded",
  PERMISSION_DENIED: "Missing connectors.connections.use or integrations.run",
  RESOURCE_EXHAUSTED: "Upstream partner or execution quota exhausted",
  NOT_FOUND: "Connection, entity, or integration resource not found",
  ALREADY_EXISTS: "API or version already registered in the hub",
  UNAVAILABLE: "Integration runtime temporarily unavailable",
};

function grpcStructuredFault(isErr: boolean): {
  spread: Record<string, unknown>;
  rpcLabel: Record<string, string>;
} {
  if (!isErr) return { spread: {}, rpcLabel: {} };
  const status_code = rand(GRPC_RPC_STATUSES);
  return {
    spread: {
      "gcp.rpc": { status_code },
      error: {
        code: status_code,
        message: GRPC_MESSAGES[status_code] ?? `RPC ${status_code}`,
        type: "gcp",
      },
    },
    rpcLabel: { "gcp.rpc.status_code": status_code },
  };
}

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
  const connectionName = `conn-${connector}-${randId(4).toLowerCase()}`;
  const latencyMs = randLatencyMs(randInt(50, 2000), isErr);
  const recordsProcessed = randInt(1, 500);
  const connectionResource = `projects/${project.id}/locations/${region}/connections/${connectionName}`;

  const SCENARIOS = [
    "connections_create",
    "connections_get",
    "connections_execute_action",
    "connections_entities_list",
    "connections_entities_get",
    "connections_actions_list",
  ] as const;
  const scenario = rand(SCENARIOS);

  let action = "EXECUTE_ACTION";
  let apiMethod = "";
  let message = "";
  const status = isErr ? "FAILED" : "SUCCEEDED";

  if (scenario === "connections_create") {
    action = "CREATE_CONNECTION";
    apiMethod = `connectors.googleapis.com/v1/projects/${project.id}/locations/${region}/connections`;
    message = isErr
      ? `CreateConnection FAILED "${connectionName}": OAuth client misconfigured (${rand(GRPC_RPC_STATUSES)})`
      : `CreateConnection LRO completed connection=${connector} oauth_scopes_verified`;
  } else if (scenario === "connections_get") {
    action = "GET_CONNECTION";
    apiMethod = `connectors.googleapis.com/v1/${connectionResource}`;
    message = isErr
      ? `GetConnection FAILED ${connectionName}: NOT_FOUND`
      : `GetConnection state=READY connector_type=${connector}`;
  } else if (scenario === "connections_execute_action") {
    action = "EXECUTE_ACTION";
    apiMethod = `connectors.googleapis.com/v1/${connectionResource}:executeAction`;
    message = isErr
      ? `executeAction FAILED action=${rand(["UPSERT_CONTACT", "GET_CASE", "POST_ORDER"])}: partner 429`
      : `executeAction OK entity=${rand(["Account", "Ticket", "Order"])} records=${recordsProcessed} latency_ms=${latencyMs.toFixed(1)}`;
  } else if (scenario === "connections_entities_list") {
    action = "LIST_ENTITIES";
    apiMethod = `connectors.googleapis.com/v1/${connectionResource}/entities:listEntities`;
    message = isErr
      ? `ListEntities FAILED pagination_token corrupted: RESOURCE_EXHAUSTED`
      : `ListEntities page_size=${randInt(20, 200)}`;
  } else if (scenario === "connections_entities_get") {
    action = "GET_ENTITY";
    apiMethod = `connectors.googleapis.com/v1/${connectionResource}/entities/{entity}`;
    message = isErr
      ? `GetEntity FAILED key=${randId(8)}: NOT_FOUND`
      : `GetEntity OK entity=${rand(["Lead", "Opportunity"])}`;
  } else {
    action = "LIST_ACTIONS";
    apiMethod = `connectors.googleapis.com/v1/${connectionResource}/actions:listActions`;
    message = isErr
      ? `ListActions FAILED INTERNAL`
      : `ListActions returned ${randInt(3, 40)} schemas`;
  }

  const { spread: faultSpread, rpcLabel } = grpcStructuredFault(isErr);
  const severity = randSeverity(isErr);

  return {
    "@timestamp": ts,
    severity,
    log: { level: severity.toLowerCase() },
    labels: {
      "resource.type": "connectors.googleapis.com/Connection",
      connection: connectionName,
      connector_type: connector,
      api_method: apiMethod,
      connector_scenario: scenario,
      ...rpcLabel,
    },
    cloud: gcpCloud(region, project, "connectors.googleapis.com"),
    gcp: {
      integration_connectors: {
        scenario,
        api_method: apiMethod,
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
    ...faultSpread,
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
  const executionId = randOperationId();
  const executionTimeMs = randInt(100, isErr ? 60000 : 5000);
  const tasksExecuted = randInt(3, 15);
  const status = isErr ? "FAILED" : "SUCCEEDED";
  const integResource = `projects/${project.id}/locations/${region}/integrations/${integration}`;

  const SCENARIOS = [
    "integrations_execute",
    "executions_cancel",
    "executions_download",
    "integrations_list_versions",
    "integrations_deploy",
    "integrations_delete",
  ] as const;
  const scenario = rand(SCENARIOS);

  let taskName = "DataMapper";
  let apiMethod = "";
  let message = "";
  const triggerType = rand(triggers);

  if (scenario === "integrations_execute") {
    taskName = rand(["Connector", "SubProcess", "ScriptTask"]);
    apiMethod = `integrations.googleapis.com/v1/${integResource}:execute`;
    message = isErr
      ? `ExecuteIntegration FAILED ${executionId} at task="${taskName}": ${GRPC_MESSAGES.DEADLINE_EXCEEDED}`
      : `ExecuteIntegration STARTED ${executionId} trigger=${triggerType} tasks_estimate=${tasksExecuted}`;
  } else if (scenario === "executions_cancel") {
    taskName = "WorkflowsExecute";
    apiMethod = `integrations.googleapis.com/v1/projects/${project.id}/locations/${region}/integrations/${integration}/executions/${executionId}:cancel`;
    message = isErr
      ? `CancelExecution FAILED ${executionId}: ALREADY_CANCELLED`
      : `CancelExecution ACCEPTED execution=${executionId}`;
  } else if (scenario === "executions_download") {
    taskName = "FieldMapping";
    apiMethod = `integrations.googleapis.com/v1/projects/${project.id}/locations/${region}/integrations/${integration}/executions/${executionId}:download`;
    message = isErr
      ? `DownloadExecutionResponse FAILED INTERNAL`
      : `DownloadExecution gzip=true bytes=${randInt(2_000, 9_000_000)}`;
  } else if (scenario === "integrations_list_versions") {
    taskName = "DataMapper";
    apiMethod = `integrations.googleapis.com/v1/${integResource}/versions:list`;
    message = isErr
      ? `ListIntegrationVersions FAILED NOT_FOUND`
      : `ListIntegrationVersions count=${randInt(1, 28)}`;
  } else if (scenario === "integrations_deploy") {
    taskName = "Deployment";
    const verOp = rand(["publish", "create"] as const);
    apiMethod =
      verOp === "publish"
        ? `integrations.googleapis.com/v1/${integResource}/versions:publish`
        : `integrations.googleapis.com/v1/${integResource}/versions`;
    message = isErr
      ? `PublishIntegration FAILED schema validation FAILED_PRECONDITION`
      : `PublishIntegration SUCCESS version=@${randInt(1, 40)}`;
  } else {
    taskName = "Cleanup";
    apiMethod = `integrations.googleapis.com/v1/${integResource}:delete`;
    message = isErr
      ? `DeleteIntegration FAILED active_executions:${randInt(1, 90)} PERMISSION_DENIED`
      : `DeleteIntegration scheduled LRO=${randOperationId()}`;
  }

  const { spread: faultSpread, rpcLabel } = grpcStructuredFault(isErr);
  const severity = randSeverity(isErr);

  return {
    "@timestamp": ts,
    severity,
    log: { level: severity.toLowerCase() },
    labels: {
      "resource.type": "integrations.googleapis.com/Execution",
      integration,
      execution_id: executionId,
      api_method: apiMethod,
      application_integration_scenario: scenario,
      ...rpcLabel,
    },
    cloud: gcpCloud(region, project, "integrations.googleapis.com"),
    gcp: {
      application_integration: {
        scenario,
        api_method: apiMethod,
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
    ...faultSpread,
  };
}

export function generateApiHubLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const apis = ["user-api", "payment-api", "inventory-api", "notification-api", "analytics-api"];
  const apiName = rand(apis);
  const version = `v${randInt(1, 5)}.${randInt(0, 9)}.${randInt(0, 20)}`;

  const SCENARIOS = [
    "apis_create",
    "apis_patch",
    "apis_get",
    "apis_dependents_list",
    "runtime_project_attachments_list",
    "attributes_query",
  ] as const;
  const scenario = rand(SCENARIOS);

  const apiResource = `projects/${project.id}/locations/${region}/apis/${apiName}`;
  let apiMethod = "";
  let message = "";

  let action = "REGISTER_API";
  if (scenario === "apis_create") {
    action = "REGISTER_API";
    apiMethod = `apihub.googleapis.com/v1/projects/${project.id}/locations/${region}/apis`;
    message = isErr
      ? `CreateApi FAILED display_name dup: ALREADY_EXISTS`
      : `CreateApi SUCCESS api=${apiName} style=${rand(["REST", "gRPC", "GraphQL"])}`;
  } else if (scenario === "apis_patch") {
    action = "UPDATE_VERSION";
    apiMethod = `apihub.googleapis.com/v1/${apiResource}?updateMask=display_name`;
    message = isErr
      ? `PatchApi FAILED PERMISSION_DENIED on apihub.apis.update`
      : `PatchApi metadata updated maturity=${rand(["ALPHA", "BETA", "GA"])}`;
  } else if (scenario === "apis_get") {
    action = "REVIEW";
    apiMethod = `apihub.googleapis.com/v1/${apiResource}`;
    message = isErr ? `GetApi FAILED NOT_FOUND` : `GetApi ${apiName} versions=${randInt(1, 8)}`;
  } else if (scenario === "apis_dependents_list") {
    action = "LIST_APIS";
    apiMethod = `apihub.googleapis.com/v1/${apiResource}:listDependents`;
    message = isErr
      ? `ListDependents FAILED UNAVAILABLE`
      : `ListDependents count=${randInt(0, 45)}`;
  } else if (scenario === "runtime_project_attachments_list") {
    action = "APPROVE";
    apiMethod = `apihub.googleapis.com/v1/projects/${project.id}/locations/${region}/runtimeProjectAttachments:list`;
    message = isErr
      ? `runtimeProjectAttachments.list FAILED RESOURCE_EXHAUSTED`
      : `attachments=${randInt(0, 12)}`;
  } else {
    action = "REVIEW";
    apiMethod = `apihub.googleapis.com/v1/projects/${project.id}/locations/${region}:queryAttributes`;
    message = isErr
      ? `QueryAttributes FAILED DEADLINE_EXCEEDED`
      : `QueryAttributes hits=${randInt(0, 250)} facet=team`;
  }

  const { spread: faultSpread, rpcLabel } = grpcStructuredFault(isErr);
  const severity = randSeverity(isErr);

  return {
    "@timestamp": ts,
    severity,
    log: { level: severity.toLowerCase() },
    labels: {
      "resource.type": "apihub.googleapis.com/Api",
      api: apiName,
      api_method: apiMethod,
      apihub_scenario: scenario,
      ...rpcLabel,
    },
    cloud: gcpCloud(region, project, "apihub.googleapis.com"),
    gcp: {
      api_hub: {
        scenario,
        api_method: apiMethod,
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
    ...faultSpread,
  };
}
