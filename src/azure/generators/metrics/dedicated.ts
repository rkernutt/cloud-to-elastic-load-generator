import {
  randInt,
  jitter,
  dp,
  stat,
  counter,
  azureMetricDoc,
  pickAzureContext,
  randId,
} from "./helpers.js";
import type { EcsDocument } from "../../../aws/generators/types.js";

export function generateIotHubMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const hubName = `iot-${randId(6).toLowerCase()}`;
  const dims = ["device-001", "device-002", "sensor-fleet-1"];
  const n = Math.min(randInt(1, 3), dims.length);
  return Array.from({ length: n }, (_, i) => {
    const deviceId = dims[i];
    const fail = Math.random() < er;
    return azureMetricDoc(
      ts,
      "iot_hub",
      "azure.iot_hub_metrics",
      region,
      subscription,
      resourceGroup,
      {
        namespace: "Microsoft.Devices/IotHubs",
        resourceName: hubName,
        armProviderSegments: ["Microsoft.Devices", "IotHubs", hubName],
        dimensions: { IotHub: hubName, DeviceId: deviceId },
        metrics: {
          "d2c.telemetry.ingress.allProtocol": counter(randInt(0, 50_000)),
          "d2c.telemetry.egress.complete": counter(randInt(0, 48_000)),
          "d2c.endpoints.egress.success": counter(randInt(0, 45_000)),
          "d2c.endpoints.egress.failure": counter(fail ? randInt(1, 500) : 0),
          "jobs.createOrUpdate.failure": counter(fail ? randInt(1, 80) : 0),
          "twinRead.success": counter(randInt(0, 12_000)),
        },
      }
    );
  });
}

export function generateLogicAppsMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const workflowNames = ["order-flow", "approval-chain", "notification-relay"];
  const n = Math.min(randInt(1, 3), workflowNames.length);
  return Array.from({ length: n }, (_, i) => {
    const workflowName = workflowNames[i];
    const wfRes = `logic-${workflowName.replace(/-/g, "")}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(
      ts,
      "logic_apps",
      "azure.logic_apps_metrics",
      region,
      subscription,
      resourceGroup,
      {
        namespace: "Microsoft.Logic/workflows",
        resourceName: wfRes,
        armProviderSegments: ["Microsoft.Logic", "workflows", wfRes],
        dimensions: { ResourceId: wfRes, workflowName },
        metrics: {
          RunsStarted: counter(randInt(0, 10_000)),
          RunsCompleted: counter(randInt(0, fail ? 8_000 : 9_800)),
          RunsFailed: counter(fail ? randInt(1, 500) : 0),
          ActionsStarted: counter(randInt(0, 120_000)),
          BillableActionExecutions: counter(randInt(0, 400_000)),
          RunLatency: stat(dp(jitter(800 + (fail ? 4000 : 0), 600, 10, 120_000))),
        },
      }
    );
  });
}

export function generateApiManagementMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const apimName = `apim-${randId(5).toLowerCase()}`;
  const apis = ["orders-api", "users-api", "payments-api"];
  const n = Math.min(randInt(1, 3), apis.length);
  return Array.from({ length: n }, (_, i) => {
    const apiId = apis[i];
    const fail = Math.random() < er;
    return azureMetricDoc(
      ts,
      "api_management",
      "azure.api_management_metrics",
      region,
      subscription,
      resourceGroup,
      {
        namespace: "Microsoft.ApiManagement/service",
        resourceName: apimName,
        armProviderSegments: ["Microsoft.ApiManagement", "service", apimName],
        dimensions: { Gateway: apimName, ApiId: apiId },
        metrics: {
          Requests: counter(randInt(0, 2_000_000)),
          Duration: stat(dp(jitter(120 + (fail ? 800 : 0), 100, 1, 30_000))),
          Bandwidth: counter(randInt(0, 10_000_000_000)),
          FailedRequests: counter(fail ? randInt(1, 100_000) : randInt(0, 2_000)),
          SuccessfulRequests: counter(randInt(0, 1_900_000)),
          UnauthorizedRequests: counter(fail ? randInt(1, 5000) : randInt(0, 200)),
        },
      }
    );
  });
}

export function generateEventGridMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const topics = ["blob-events", "custom-events", "domain-events"];
  const n = Math.min(randInt(1, 3), topics.length);
  return Array.from({ length: n }, (_, i) => {
    const topicName = topics[i];
    const topicRes = `egt-${topicName.replace(/-/g, "")}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(
      ts,
      "event_grid",
      "azure.event_grid_metrics",
      region,
      subscription,
      resourceGroup,
      {
        namespace: "Microsoft.EventGrid/topics",
        resourceName: topicRes,
        armProviderSegments: ["Microsoft.EventGrid", "topics", topicRes],
        dimensions: { Topic: topicRes, EventSubscriptionName: topicName },
        metrics: {
          PublishSuccess: counter(randInt(0, 5_000_000)),
          PublishFail: counter(fail ? randInt(1, 50_000) : 0),
          DeliveryAttemptSuccessCount: counter(randInt(0, 4_900_000)),
          DeliveryAttemptFailCount: counter(fail ? randInt(1, 40_000) : 0),
          MatchedEventCount: counter(randInt(0, 5_000_000)),
          DroppedEventCount: counter(fail ? randInt(1, 10_000) : 0),
        },
      }
    );
  });
}

export function generateSynapseWorkspaceMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const wsName = `syn-${randId(6).toLowerCase()}`;
  const pools = ["sql-pool-1", "spark-pool-main", "serverless"];
  const n = Math.min(randInt(1, 3), pools.length);
  return Array.from({ length: n }, (_, i) => {
    const poolName = pools[i];
    const fail = Math.random() < er;
    return azureMetricDoc(
      ts,
      "synapse_workspace",
      "azure.synapse_workspace_metrics",
      region,
      subscription,
      resourceGroup,
      {
        namespace: "Microsoft.Synapse/workspaces",
        resourceName: wsName,
        armProviderSegments: ["Microsoft.Synapse", "workspaces", wsName],
        dimensions: { WorkspaceName: wsName, PoolName: poolName },
        metrics: {
          IntegrationPipelineRunsEnded: counter(randInt(0, 2_000)),
          IntegrationActivityRunsEnded: counter(randInt(0, 8_000)),
          IntegrationTriggerRunsStarted: counter(randInt(0, 1_500)),
          IntegrationPipelineRunsFailed: counter(fail ? randInt(1, 80) : 0),
          IntegrationRuntimeAvailableMemory: stat(dp(jitter(45, 25, 5, 95))),
          IntegrationRuntimeCpuUtilization: stat(dp(jitter(40 + (fail ? 25 : 0), 30, 0, 100))),
        },
      }
    );
  });
}

export function generateDatabricksMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const wsName = `dbw-${randId(6).toLowerCase()}`;
  const clusters = ["job-cluster-1", "interactive-1", "automl-cluster"];
  const n = Math.min(randInt(1, 3), clusters.length);
  return Array.from({ length: n }, (_, i) => {
    const clusterId = clusters[i];
    const fail = Math.random() < er;
    return azureMetricDoc(
      ts,
      "databricks",
      "azure.databricks_metrics",
      region,
      subscription,
      resourceGroup,
      {
        namespace: "Microsoft.Databricks/workspaces",
        resourceName: wsName,
        armProviderSegments: ["Microsoft.Databricks", "workspaces", wsName],
        dimensions: { ClusterId: clusterId, WorkspaceName: wsName },
        metrics: {
          ClusterDbuConsumption: counter(randInt(0, 12_000)),
          JobRunDuration: stat(dp(jitter(240 + (fail ? 600 : 0), 200, 5, 86_400))),
          JobsFailed: counter(fail ? randInt(1, 200) : 0),
          ClusterNodesAvailable: counter(randInt(2, 64)),
          DiskReadBytes: counter(randInt(0, 50_000_000_000)),
          DiskWriteBytes: counter(randInt(0, 30_000_000_000)),
        },
      }
    );
  });
}

export function generateCosmosDbDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const account = `cosmos-${randId(6).toLowerCase()}`;
  const regions = ["East US", "West Europe", "Southeast Asia"];
  const n = Math.min(randInt(1, 3), regions.length);
  return Array.from({ length: n }, (_, i) => {
    const regDim = regions[i];
    const fail = Math.random() < er;
    return azureMetricDoc(
      ts,
      "cosmos_db",
      "azure.cosmos_db_metrics",
      region,
      subscription,
      resourceGroup,
      {
        namespace: "Microsoft.DocumentDB/databaseAccounts",
        resourceName: account,
        armProviderSegments: ["Microsoft.DocumentDB", "databaseAccounts", account],
        dimensions: { DatabaseAccount: account, Region: regDim },
        metrics: {
          TotalRequests: counter(randInt(10_000, 5_000_000)),
          TotalRequestUnits: counter(randInt(50_000, 80_000_000)),
          ProvisionedThroughput: stat(dp(jitter(1000, 400, 400, 10_000))),
          MongoRequestCharge: counter(randInt(0, 25_000_000)),
          TotalRequestUnitsCharge: counter(randInt(0, 50_000_000)),
          ServiceAvailability: stat(dp(jitter(fail ? 92 : 99.9, fail ? 5 : 0.05, 0, 100))),
        },
      }
    );
  });
}

export function generateEventHubsDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const nsName = `evhns-${randId(5).toLowerCase()}`;
  const entities = ["telemetry", "clicks", "audit-log"];
  const n = Math.min(randInt(1, 3), entities.length);
  return Array.from({ length: n }, (_, i) => {
    const entityName = entities[i];
    const fail = Math.random() < er;
    return azureMetricDoc(
      ts,
      "event_hubs",
      "azure.event_hubs_metrics",
      region,
      subscription,
      resourceGroup,
      {
        namespace: "Microsoft.EventHub/namespaces",
        resourceName: nsName,
        armProviderSegments: ["Microsoft.EventHub", "namespaces", nsName],
        dimensions: { EntityName: entityName },
        metrics: {
          IncomingMessages: counter(randInt(0, 10_000_000)),
          OutgoingMessages: counter(randInt(0, 9_800_000)),
          ThrottledRequests: counter(fail ? randInt(1, 10_000) : randInt(0, 50)),
          ActiveConnections: counter(randInt(0, 5_000)),
          IncomingBytes: counter(randInt(0, 80_000_000_000)),
          OutgoingBytes: counter(randInt(0, 75_000_000_000)),
        },
      }
    );
  });
}
