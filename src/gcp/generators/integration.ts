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
  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "integration-connectors"),
    gcp: {
      integration_connectors: {
        connection_name: `conn-${connector}-${randId(4).toLowerCase()}`,
        connector_type: connector,
        action,
        entity_type: rand(["Account", "Contact", "Lead", "Opportunity", "Ticket", "Order"]),
        latency_ms: randInt(50, isErr ? 30000 : 2000),
        records_processed: randInt(1, 500),
        status: isErr ? "FAILED" : "SUCCEEDED",
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(5e4, 3e7) },
    message: isErr
      ? `Integration connector ${connector}: ${action} failed — ${rand(["Connection timeout", "Auth token expired", "Rate limit exceeded", "Entity not found"])}`
      : `Integration connector ${connector}: ${action} completed (${randInt(1, 500)} records)`,
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
  const triggers = ["API", "CLOUD_SCHEDULER", "PUBSUB", "CLOUD_FUNCTIONS"];
  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "application-integration"),
    gcp: {
      application_integration: {
        integration_name: integration,
        execution_id: randOperationId(),
        trigger_type: rand(triggers),
        task_name: rand(["DataMapper", "Connector", "SubProcess", "ScriptTask", "FieldMapping"]),
        status: isErr ? "FAILED" : "SUCCEEDED",
        execution_time_ms: randInt(100, isErr ? 60000 : 5000),
        tasks_executed: randInt(3, 15),
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e5, 6e7) },
    message: isErr
      ? `Application Integration ${integration}: execution failed — ${rand(["Task timeout", "Connector error", "Invalid mapping", "Quota exceeded"])}`
      : `Application Integration ${integration}: execution completed (${randInt(3, 15)} tasks)`,
  };
}

export function generateApiHubLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const apis = ["user-api", "payment-api", "inventory-api", "notification-api", "analytics-api"];
  const actions = ["REGISTER_API", "UPDATE_VERSION", "DEPRECATE", "REVIEW", "APPROVE", "LIST_APIS"];
  const action = rand(actions);
  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "api-hub"),
    gcp: {
      api_hub: {
        api_name: rand(apis),
        version: `v${randInt(1, 5)}.${randInt(0, 9)}.${randInt(0, 20)}`,
        action,
        style: rand(["REST", "gRPC", "GraphQL", "AsyncAPI"]),
        lifecycle_stage: rand(["DESIGN", "DEVELOP", "DEPLOY", "DEPRECATE"]),
        spec_type: rand(["OPENAPI_V3", "PROTO", "GRAPHQL_SCHEMA"]),
        consumers_count: randInt(0, 50),
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e4, 5e6) },
    message: isErr
      ? `API Hub: ${action} failed — ${rand(["Validation error", "Duplicate API", "Permission denied", "Spec parse error"])}`
      : `API Hub: ${action} completed`,
  };
}
