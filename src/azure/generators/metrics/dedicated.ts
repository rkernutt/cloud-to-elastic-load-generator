import {
  randInt,
  jitter,
  dp,
  stat,
  counter,
  azureMetricDoc,
  pickAzureContext,
  randId,
  rand,
} from "./helpers.js";
import type { EcsDocument } from "../../../aws/generators/types.js";
import { AZURE_METRICS_DATASET_MAP } from "../../data/elasticMaps.js";

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

export function generateAppServiceDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP["app-service"]!;
  const sites = ["web-prod", "api-stg", "portal-app"];
  const n = Math.min(randInt(1, 3), sites.length);
  return Array.from({ length: n }, (_, i) => {
    const site = sites[i]!;
    const inst = `${site}__${randInt(1, 4)}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "app_service", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Web/sites",
      resourceName: site,
      armProviderSegments: ["Microsoft.Web", "sites", site],
      dimensions: { Instance: inst },
      metrics: {
        Requests: counter(randInt(2_000, fail ? 4_000_000 : 2_800_000)),
        AverageResponseTime: stat(dp(jitter(85 + (fail ? 1200 : 0), 60, 4, 28_000))),
        CpuPercentage: stat(dp(jitter(28 + (fail ? 45 : 0), 22, 1, 98))),
        MemoryPercentage: stat(dp(jitter(42 + (fail ? 28 : 0), 20, 5, 95))),
        Http2xx: counter(randInt(1_800, fail ? 3_800_000 : 2_700_000)),
        Http4xx: counter(fail ? randInt(200, 180_000) : randInt(0, 12_000)),
        Http5xx: counter(fail ? randInt(40, 90_000) : randInt(0, 800)),
        AppConnections: counter(randInt(0, fail ? 18_000 : 4_200)),
      },
    });
  });
}

export function generateFunctionsDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP.functions!;
  const fns = ["HttpTrigger1", "QueueProcessor", "TimerCleanup"];
  const n = Math.min(randInt(1, 3), fns.length);
  return Array.from({ length: n }, (_, i) => {
    const fn = fns[i]!;
    const site = `func-${rand(["prod", "shared"])}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "functions", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Web/sites",
      resourceName: site,
      armProviderSegments: ["Microsoft.Web", "sites", site],
      dimensions: { site, function: fn },
      metrics: {
        FunctionExecutionCount: counter(randInt(200, fail ? 6_000_000 : 4_200_000)),
        FunctionExecutionUnits: counter(randInt(800, fail ? 62_000_000 : 42_000_000)),
        Http2xx: counter(randInt(180, fail ? 5_600_000 : 4_000_000)),
        Http5xx: counter(fail ? randInt(10, 80_000) : randInt(0, 400)),
        Errors: counter(fail ? randInt(20, 120_000) : randInt(0, 2_400)),
        FunctionExecutionDuration: stat(dp(jitter(240 + (fail ? 4200 : 0), 180, 8, 86_400))),
      },
    });
  });
}

export function generateAksDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP.aks!;
  const clusters = ["aks-prod", "aks-staging"];
  const n = Math.min(randInt(1, 2), clusters.length);
  return Array.from({ length: n }, (_, i) => {
    const cluster = clusters[i]!;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "aks", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.ContainerService/managedClusters",
      resourceName: cluster,
      armProviderSegments: ["Microsoft.ContainerService", "managedClusters", cluster],
      dimensions: { resource_name: cluster, location: region, phase: "Running" },
      metrics: {
        node_cpu_usage_percentage: stat(dp(jitter(46 + (fail ? 38 : 0), 26, 2, 100))),
        node_memory_working_set_percentage: stat(dp(jitter(52 + (fail ? 22 : 0), 24, 6, 100))),
        kube_pod_status_phase: counter(randInt(40, fail ? 9_000 : 5_200)),
        cluster_autoscaler_cluster_safe_to_autoscale: stat(dp(fail ? 0 : 1)),
        kube_apiserver_requests_total: counter(randInt(8_000, fail ? 2_200_000 : 1_400_000)),
      },
    });
  });
}

export function generateBlobStorageDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP["blob-storage"]!;
  const accounts = ["stprod", "stdatalake", "stlogs"];
  const n = Math.min(randInt(1, 3), accounts.length);
  return Array.from({ length: n }, (_, i) => {
    const acct = accounts[i]!;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "blob_storage", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Storage/storageAccounts",
      resourceName: acct,
      armProviderSegments: ["Microsoft.Storage", "storageAccounts", acct],
      dimensions: {
        ApiName: rand(["GetBlob", "PutBlob", "DeleteBlob", "ListBlobs"]),
        Authentication: rand(["OAuth", "SAS", "AccountKey"]),
        GeoType: rand(["Primary", "Secondary"]),
      },
      metrics: {
        Transactions: counter(randInt(0, fail ? 12_000_000 : 8_000_000)),
        Ingress: counter(randInt(0, fail ? 85_000_000_000 : 58_000_000_000)),
        Egress: counter(randInt(0, fail ? 72_000_000_000 : 48_000_000_000)),
        Availability: stat(dp(jitter(fail ? 96.5 : 100, fail ? 2.5 : 0.02, 0, 100))),
        SuccessE2ELatency: stat(dp(jitter(14 + (fail ? 220 : 0), 12, 1, 8_000))),
        UsedCapacity: stat(dp(jitter(42e9 + (fail ? 8e9 : 0), 12e9, 1e9, 180e9))),
      },
    });
  });
}

export function generateSqlDatabaseDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP["sql-database"]!;
  const dbs = ["appdb", "reportdb", "authdb"];
  const n = Math.min(randInt(1, 3), dbs.length);
  return Array.from({ length: n }, (_, i) => {
    const db = dbs[i]!;
    const srv = `sql-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "sql_database", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Sql/servers/databases",
      resourceName: db,
      armProviderSegments: ["Microsoft.Sql", "servers", srv, "databases", db],
      dimensions: { DatabaseName: db, logical_server: srv },
      metrics: {
        dtu_consumption_percent: stat(dp(jitter(36 + (fail ? 52 : 0), 28, 0, 100))),
        cpu_percent: stat(dp(jitter(32 + (fail ? 48 : 0), 26, 0, 100))),
        data_io_percent: stat(dp(jitter(24 + (fail ? 40 : 0), 20, 0, 100))),
        log_io_percent: stat(dp(jitter(18 + (fail ? 35 : 0), 16, 0, 100))),
        deadlocks: counter(fail ? randInt(1, 120) : 0),
        connection_successful: counter(randInt(400, fail ? 420_000 : 620_000)),
        connection_failed: counter(fail ? randInt(2, 18_000) : randInt(0, 120)),
      },
    });
  });
}

export function generateCacheForRedisDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP["cache-for-redis"]!;
  const shards = ["shard-0", "shard-1", "shard-2"];
  const n = Math.min(randInt(1, 3), shards.length);
  return Array.from({ length: n }, (_, i) => {
    const shard = shards[i]!;
    const name = `redis-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "cache_for_redis", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Cache/Redis",
      resourceName: name,
      armProviderSegments: ["Microsoft.Cache", "Redis", name],
      dimensions: { ShardId: shard },
      metrics: {
        cachehits: counter(randInt(50_000, fail ? 12_000_000 : 8_000_000)),
        cachemisses: counter(randInt(fail ? 8_000 : 400, fail ? 1_800_000 : 420_000)),
        connectedclients: stat(dp(jitter(120 + (fail ? 900 : 0), 80, 0, 20_000))),
        percentProcessorTime: stat(dp(jitter(34 + (fail ? 42 : 0), 26, 0, 100))),
        usedmemory: stat(dp(jitter(1.1e9 + (fail ? 4e8 : 0), 3e8, 5e7, 26e9))),
        evictedkeys: counter(fail ? randInt(40, 180_000) : randInt(0, 8_000)),
        operationsPerSecond: stat(dp(jitter(12_000 + (fail ? 28_000 : 0), 9000, 0, 220_000))),
      },
    });
  });
}

export function generateLoadBalancerDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP["load-balancer"]!;
  const fes = ["fe-prod", "fe-staging", "fe-internal"];
  const n = Math.min(randInt(1, 3), fes.length);
  return Array.from({ length: n }, (_, i) => {
    const fe = fes[i]!;
    const lb = `lb-${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "load_balancer", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Network/loadBalancers",
      resourceName: lb,
      armProviderSegments: ["Microsoft.Network", "loadBalancers", lb],
      dimensions: { FrontendIPAddress: fe, ProtocolType: rand(["TCP", "UDP"]) },
      metrics: {
        SnatConnectionCount: counter(randInt(0, fail ? 820_000 : 520_000)),
        VipAvailability: stat(dp(jitter(fail ? 86 : 100, fail ? 10 : 0.02, 0, 100))),
        DipAvailability: stat(dp(jitter(fail ? 82 : 99.5, fail ? 14 : 0.2, 0, 100))),
        ByteCount: counter(randInt(80_000_000, fail ? 520_000_000_000 : 360_000_000_000)),
        PacketCount: counter(randInt(2_000_000, fail ? 900_000_000 : 620_000_000)),
        SYNCount: counter(randInt(0, fail ? 420_000 : 180_000)),
      },
    });
  });
}

export function generateOpenAiDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP.openai!;
  const depls = ["gpt-deploy", "embed-1", "classifier"];
  const n = Math.min(randInt(1, 3), depls.length);
  return Array.from({ length: n }, (_, i) => {
    const d = depls[i]!;
    const acct = `oai-${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "openai", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.CognitiveServices/accounts",
      resourceName: acct,
      armProviderSegments: ["Microsoft.CognitiveServices", "accounts", acct],
      dimensions: { ApiName: d, ModelName: rand(["gpt-4o", "gpt-4", "text-embedding-3-large"]) },
      metrics: {
        TokenTransaction: counter(randInt(0, fail ? 620_000_000 : 420_000_000)),
        TotalCalls: counter(randInt(0, fail ? 2_400_000 : 1_800_000)),
        Latency: stat(dp(jitter(380 + (fail ? 5200 : 0), 260, 20, 72_000))),
        ThrottledRequests: counter(fail ? randInt(10, 80_000) : randInt(0, 400)),
        ActiveTokens: stat(dp(jitter(fail ? 1_800_000 : 320_000, 220_000, 20_000, 8_000_000))),
        ClientErrors: counter(fail ? randInt(20, 120_000) : randInt(0, 3_000)),
      },
    });
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
