import {
  randInt,
  rand,
  randId,
  jitter,
  dp,
  stat,
  counter,
  azureMetricDoc,
  pickAzureContext,
} from "./helpers.js";
import type { EcsDocument, MetricGenerator } from "../../../aws/generators/types.js";
import type { AzureSubscription } from "../helpers.js";

type Ctx = { region: string; subscription: AzureSubscription; resourceGroup: string };

type Builder = (ts: string, er: number, ctx: Ctx, dataset: string) => EcsDocument[];

function multiDoc(
  ts: string,
  _er: number,
  ctx: Ctx,
  dataset: string,
  nestedKey: string,
  dimVals: string[],
  mk: (
    dimVal: string,
    i: number
  ) => {
    namespace: string;
    resourceName: string;
    armProviderSegments: string[];
    dimensions: Record<string, string>;
    metrics: Record<string, Record<string, number>>;
  }
): EcsDocument[] {
  const { region, subscription, resourceGroup } = ctx;
  const n = Math.min(randInt(1, 3), dimVals.length);
  return Array.from({ length: n }, (_, i) => {
    const dimVal = dimVals[i];
    const p = mk(dimVal, i);
    return azureMetricDoc(ts, nestedKey, dataset, region, subscription, resourceGroup, p);
  });
}

function vmLikeMetrics(er: number): Record<string, Record<string, number>> {
  const stress = er * 40;
  return {
    "Percentage CPU": stat(dp(jitter(32 + stress, 28, 1, 100))),
    "Available Memory Bytes": stat(dp(jitter(5e9 - stress * 1.5e7, 1.5e9, 4e8, 16e9))),
    "Disk Read Bytes": counter(randInt(5_000_000, 12_000_000_000)),
    "Disk Write Bytes": counter(randInt(4_000_000, 8_000_000_000)),
    "Network In Total": counter(randInt(50_000_000, 4_000_000_000)),
    "Network Out Total": counter(randInt(40_000_000, 2_500_000_000)),
  };
}

const buildVirtualMachines: Builder = (ts, er, ctx, dataset) => {
  const vms = ["vm-web-01", "vm-app-02", "vm-batch-03"];
  return multiDoc(ts, er, ctx, dataset, "virtual_machines", vms, (vmName) => ({
    namespace: "Microsoft.Compute/virtualMachines",
    resourceName: vmName,
    armProviderSegments: ["Microsoft.Compute", "virtualMachines", vmName],
    dimensions: { VMName: vmName },
    metrics: vmLikeMetrics(er),
  }));
};

const buildVmScaleSets: Builder = (ts, er, ctx, dataset) => {
  const instances = ["vmss-prod_0", "vmss-prod_1", "vmss-prod_2"];
  return multiDoc(ts, er, ctx, dataset, "vm_scale_sets", instances, (vmName) => ({
    namespace: "Microsoft.Compute/virtualMachineScaleSets",
    resourceName: "vmss-prod",
    armProviderSegments: [
      "Microsoft.Compute",
      "virtualMachineScaleSets",
      "vmss-prod",
      "virtualMachines",
      vmName,
    ],
    dimensions: { VMName: vmName, vmssName: "vmss-prod" },
    metrics: vmLikeMetrics(er),
  }));
};

const buildAks: Builder = (ts, er, ctx, dataset) => {
  const nodes = ["nodepool-0", "nodepool-1", "system-2"];
  return multiDoc(ts, er, ctx, dataset, "aks", nodes, (node) => {
    const ns = rand(["default", "kube-system", "payments"]);
    const pod = `pod-${rand(["api", "worker", "ingress"])}-${randInt(1, 99)}`;
    const fail = Math.random() < er;
    return {
      namespace: "Microsoft.ContainerService/managedClusters",
      resourceName: "aks-prod",
      armProviderSegments: ["Microsoft.ContainerService", "managedClusters", "aks-prod"],
      dimensions: { node, namespace: ns, pod },
      metrics: {
        node_cpu_usage_percentage: stat(dp(jitter(48 + (fail ? 35 : 0), 28, 3, 100))),
        node_memory_rss_percentage: stat(dp(jitter(55 + (fail ? 20 : 0), 25, 8, 100))),
        kube_pod_status_ready: stat(dp(jitter(fail ? 0.65 : 0.94, 0.12, 0, 1))),
      },
    };
  });
};

const buildContainerApps: Builder = (ts, er, ctx, dataset) => {
  const revs = ["ca-api--v1", "ca-worker--v2", "ca-job--v3"];
  return multiDoc(ts, er, ctx, dataset, "container_apps", revs, (rev) => {
    const fail = Math.random() < er;
    return {
      namespace: "Microsoft.App/containerApps",
      resourceName: "ca-prod",
      armProviderSegments: ["Microsoft.App", "containerApps", "ca-prod"],
      dimensions: { revisionName: rev, replicaName: `ca-prod-${randInt(1000, 9999)}` },
      metrics: {
        Replicas: counter(randInt(1, 30)),
        CpuUsageNanoCores: counter(randInt(50_000_000, 2_000_000_000)),
        MemoryWorkingSetBytes: stat(
          dp(jitter(400_000_000 + (fail ? 200_000_000 : 0), 150_000_000, 50_000_000, 4_000_000_000))
        ),
        RestartCount: counter(fail ? randInt(1, 40) : randInt(0, 3)),
        Requests: counter(randInt(0, 500_000)),
      },
    };
  });
};

const buildAppService: Builder = (ts, er, ctx, dataset) => {
  const sites = ["web-prod", "api-stg", "portal-app"];
  return multiDoc(ts, er, ctx, dataset, "app_service", sites, (site) => {
    const inst = `${site}__${randInt(1, 4)}`;
    const fail = Math.random() < er;
    return {
      namespace: "Microsoft.Web/sites",
      resourceName: site,
      armProviderSegments: ["Microsoft.Web", "sites", site],
      dimensions: { Instance: inst },
      metrics: {
        Http2xx: counter(randInt(5_000, 2_000_000)),
        Http5xx: counter(fail ? randInt(1, 25_000) : randInt(0, 120)),
        AverageResponseTime: stat(dp(jitter(95 + (fail ? 900 : 0), 70, 5, 30_000))),
        CpuTime: counter(randInt(10_000, 900_000)),
        MemoryWorkingSet: stat(dp(jitter(420_000_000, 180_000_000, 80_000_000, 2_200_000_000))),
      },
    };
  });
};

const buildFunctions: Builder = (ts, er, ctx, dataset) => {
  const fns = ["HttpTrigger1", "QueueProcessor", "TimerCleanup"];
  return multiDoc(ts, er, ctx, dataset, "functions", fns, (fn) => {
    const site = `func-${rand(["prod", "shared"])}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return {
      namespace: "Microsoft.Web/sites",
      resourceName: site,
      armProviderSegments: ["Microsoft.Web", "sites", site],
      dimensions: { site, function: fn },
      metrics: {
        FunctionExecutionCount: counter(randInt(100, 5_000_000)),
        FunctionExecutionUnits: counter(randInt(500, 50_000_000)),
        Http5xx: counter(fail ? randInt(1, 15_000) : randInt(0, 80)),
        MemoryWorkingSet: stat(dp(jitter(280_000_000, 120_000_000, 40_000_000, 1_800_000_000))),
      },
    };
  });
};

const buildLoadBalancer: Builder = (ts, er, ctx, dataset) => {
  const fes = ["fe-prod", "fe-staging", "fe-internal"];
  return multiDoc(ts, er, ctx, dataset, "load_balancer", fes, (fe) => {
    const lb = `lb-${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return {
      namespace: "Microsoft.Network/loadBalancers",
      resourceName: lb,
      armProviderSegments: ["Microsoft.Network", "loadBalancers", lb],
      dimensions: { FrontendIPAddress: fe, ProtocolType: rand(["TCP", "UDP"]) },
      metrics: {
        VipAvailability: stat(dp(jitter(fail ? 88 : 100, fail ? 8 : 0.01, 0, 100))),
        DipAvailability: stat(dp(jitter(fail ? 82 : 99.5, fail ? 12 : 0.2, 0, 100))),
        SnatConnectionCount: counter(randInt(0, 500_000) + (fail ? randInt(10_000, 200_000) : 0)),
      },
    };
  });
};

const buildApplicationGateway: Builder = (ts, er, ctx, dataset) => {
  const pools = ["backend-pool-a", "backend-pool-b", "backend-pool-c"];
  return multiDoc(ts, er, ctx, dataset, "application_gateway", pools, (pool) => {
    const agw = `agw-${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return {
      namespace: "Microsoft.Network/applicationGateways",
      resourceName: agw,
      armProviderSegments: ["Microsoft.Network", "applicationGateways", agw],
      dimensions: { BackendPool: pool, Listener: rand(["https-443", "http-80"]) },
      metrics: {
        Throughput: counter(randInt(1_000_000, 900_000_000)),
        FailedRequests: counter(fail ? randInt(1, 80_000) : randInt(0, 2_000)),
        HealthyHostCount: stat(dp(jitter(fail ? 2 : 8, 2, 0, 32))),
        UnhealthyHostCount: stat(dp(jitter(fail ? 4 : 0, 2, 0, 16))),
        ResponseStatus: counter(randInt(0, 2_000_000)),
      },
    };
  });
};

const buildVirtualNetwork: Builder = (ts, er, ctx, dataset) => {
  const peers = ["peer-hub", "peer-spoke-a", "peer-spoke-b"];
  return multiDoc(ts, er, ctx, dataset, "virtual_network", peers, (peer) => {
    const vnet = `vnet-${randId(5).toLowerCase()}`;
    return {
      namespace: "Microsoft.Network/virtualNetworks",
      resourceName: vnet,
      armProviderSegments: ["Microsoft.Network", "virtualNetworks", vnet],
      dimensions: { Peering: peer, VnetName: vnet },
      metrics: {
        PeeringBytesIn: counter(randInt(0, 6_000_000_000)),
        PeeringBytesOut: counter(randInt(0, 5_000_000_000)),
        IfUnderDDoSAttack: stat(dp(Math.random() < er * 0.4 ? 1 : 0)),
      },
    };
  });
};

const buildBlobStorage: Builder = (ts, er, ctx, dataset) => {
  const accounts = ["stprod", "stdatalake", "stlogs"];
  return multiDoc(ts, er, ctx, dataset, "blob_storage", accounts, (acct) => {
    const fail = Math.random() < er;
    return {
      namespace: "Microsoft.Storage/storageAccounts",
      resourceName: acct,
      armProviderSegments: ["Microsoft.Storage", "storageAccounts", acct],
      dimensions: {
        ApiName: rand(["GetBlob", "PutBlob", "DeleteBlob", "ListBlobs"]),
        Authentication: rand(["OAuth", "SAS", "AccountKey"]),
        GeoType: rand(["Primary", "Secondary"]),
      },
      metrics: {
        Transactions: counter(randInt(0, 8_000_000)),
        Ingress: counter(randInt(0, 60_000_000_000)),
        Egress: counter(randInt(0, 45_000_000_000)),
        Availability: stat(dp(jitter(fail ? 97.5 : 100, fail ? 1.5 : 0.02, 0, 100))),
        SuccessE2ELatency: stat(dp(jitter(12 + (fail ? 80 : 0), 10, 1, 5_000))),
      },
    };
  });
};

const buildFileStorageReal: Builder = (ts, er, ctx, dataset) => {
  const accounts = ["stfiles", "stshared", "stuserhome"];
  return multiDoc(ts, er, ctx, dataset, "file_storage", accounts, (acct) => {
    const fail = Math.random() < er;
    return {
      namespace: "Microsoft.Storage/storageAccounts",
      resourceName: acct,
      armProviderSegments: ["Microsoft.Storage", "storageAccounts", acct],
      dimensions: {
        ApiName: rand(["CreateFile", "GetFile", "DeleteFile", "QueryDirectory"]),
        Authentication: rand(["OAuth", "SAS", "AccountKey"]),
        GeoType: rand(["Primary", "Secondary"]),
      },
      metrics: {
        Transactions: counter(randInt(0, 4_000_000)),
        Ingress: counter(randInt(0, 25_000_000_000)),
        Egress: counter(randInt(0, 20_000_000_000)),
        Availability: stat(dp(jitter(fail ? 98 : 100, fail ? 1.2 : 0.02, 0, 100))),
        SuccessE2ELatency: stat(dp(jitter(18 + (fail ? 60 : 0), 14, 2, 4_000))),
      },
    };
  });
};

const buildSqlDatabase: Builder = (ts, er, ctx, dataset) => {
  const dbs = ["appdb", "reportdb", "authdb"];
  return multiDoc(ts, er, ctx, dataset, "sql_database", dbs, (db) => {
    const srv = `sql-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return {
      namespace: "Microsoft.Sql/servers/databases",
      resourceName: db,
      armProviderSegments: ["Microsoft.Sql", "servers", srv, "databases", db],
      dimensions: { DatabaseName: db, logical_server: srv },
      metrics: {
        cpu_percent: stat(dp(jitter(42 + (fail ? 45 : 0), 32, 0, 100))),
        dtu_consumption_percent: stat(dp(jitter(38 + (fail ? 40 : 0), 30, 0, 100))),
        storage_percent: stat(dp(jitter(55, 35, 5, 100))),
        deadlock: counter(fail ? randInt(1, 40) : 0),
        connection_successful: counter(randInt(500, 500_000)),
        connection_failed: counter(fail ? randInt(1, 8_000) : randInt(0, 50)),
      },
    };
  });
};

const buildServiceBus: Builder = (ts, er, ctx, dataset) => {
  const entities = ["orders", "events", "audit"];
  return multiDoc(ts, er, ctx, dataset, "service_bus", entities, (entity) => {
    const ns = `sb-${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return {
      namespace: "Microsoft.ServiceBus/namespaces",
      resourceName: ns,
      armProviderSegments: ["Microsoft.ServiceBus", "namespaces", ns],
      dimensions: { EntityName: entity },
      metrics: {
        IncomingMessages: counter(randInt(0, 3_000_000)),
        OutgoingMessages: counter(randInt(0, 2_900_000)),
        DeadletteredMessages: counter(fail ? randInt(1, 50_000) : randInt(0, 500)),
        ActiveMessages: counter(randInt(0, 250_000)),
      },
    };
  });
};

const buildDataFactory: Builder = (ts, er, ctx, dataset) => {
  const pipelines = ["ingest-raw", "curate-silver", "export-mart"];
  return multiDoc(ts, er, ctx, dataset, "data_factory", pipelines, (pipe) => {
    const fac = `adf-${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return {
      namespace: "Microsoft.DataFactory/factories",
      resourceName: fac,
      armProviderSegments: ["Microsoft.DataFactory", "factories", fac],
      dimensions: { Name: pipe, Pipeline: pipe },
      metrics: {
        PipelineSucceededRuns: counter(randInt(0, 5_000)),
        PipelineFailedRuns: counter(fail ? randInt(1, 400) : randInt(0, 15)),
        ActivityRuns: counter(randInt(0, 80_000)),
        TriggerSucceededRuns: counter(randInt(0, 12_000)),
      },
    };
  });
};

const buildMonitor: Builder = (ts, er, ctx, dataset) => {
  const ws = ["law-prod", "law-stg"];
  return multiDoc(ts, er, ctx, dataset, "monitor", ws, (w) => {
    const fail = Math.random() < er;
    return {
      namespace: "Microsoft.OperationalInsights/workspaces",
      resourceName: w,
      armProviderSegments: ["Microsoft.OperationalInsights", "workspaces", w],
      dimensions: { WorkspaceName: w },
      metrics: {
        IngestionVolume: counter(randInt(0, 50_000_000_000)),
        QueryCount: counter(randInt(0, 900_000)),
        IngestionErrors: counter(fail ? randInt(1, 8_000) : randInt(0, 200)),
        DataIngestionLatency: stat(dp(jitter(25 + (fail ? 200 : 0), 20, 1, 5_000))),
      },
    };
  });
};

const buildKeyVault: Builder = (ts, er, ctx, dataset) => {
  const vaults = ["kv-prod", "kv-shared"];
  return multiDoc(ts, er, ctx, dataset, "key_vault", vaults, (v) => {
    const fail = Math.random() < er;
    return {
      namespace: "Microsoft.KeyVault/vaults",
      resourceName: v,
      armProviderSegments: ["Microsoft.KeyVault", "vaults", v],
      dimensions: { VaultName: v, ActivityType: rand(["get", "list", "unwrap"]) },
      metrics: {
        ServiceApiHit: counter(randInt(0, 600_000)),
        ServiceApiLatency: stat(dp(jitter(35 + (fail ? 400 : 0), 28, 1, 8_000))),
        Availability: stat(dp(jitter(fail ? 94 : 100, fail ? 4 : 0.02, 0, 100))),
      },
    };
  });
};

const buildOpenAi: Builder = (ts, er, ctx, dataset) => {
  const depls = ["gpt-deploy", "embed-1", "classifier"];
  return multiDoc(ts, er, ctx, dataset, "openai", depls, (d) => {
    const acct = `oai-${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return {
      namespace: "Microsoft.CognitiveServices/accounts",
      resourceName: acct,
      armProviderSegments: ["Microsoft.CognitiveServices", "accounts", acct],
      dimensions: { ApiName: d, ModelName: rand(["gpt-4o", "gpt-4", "text-embedding-3-large"]) },
      metrics: {
        SuccessfulCalls: counter(randInt(0, 2_000_000)),
        TotalCalls: counter(randInt(0, 2_100_000)),
        ClientErrors: counter(fail ? randInt(1, 50_000) : randInt(0, 800)),
        TokenTransaction: counter(randInt(0, 500_000_000)),
        Latency: stat(dp(jitter(420 + (fail ? 3500 : 0), 280, 20, 60_000))),
      },
    };
  });
};

const buildMachineLearning: Builder = (ts, er, ctx, dataset) => {
  const depls = ["batch-scoring", "online-endpoint-a", "training-cluster"];
  return multiDoc(ts, er, ctx, dataset, "machine_learning", depls, (d) => {
    const ws = `mlw-${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return {
      namespace: "Microsoft.MachineLearningServices/workspaces",
      resourceName: ws,
      armProviderSegments: ["Microsoft.MachineLearningServices", "workspaces", ws],
      dimensions: { DeploymentName: d, ClusterName: rand(["cpu-cluster", "gpu-a100"]) },
      metrics: {
        ModelDeployStarted: counter(randInt(0, 500)),
        GpuUtilization: stat(dp(jitter(35 + (fail ? 30 : 0), 25, 0, 100))),
        CpuUtilization: stat(dp(jitter(28, 20, 0, 100))),
        RunsFailed: counter(fail ? randInt(1, 200) : randInt(0, 8)),
        RunsCompleted: counter(randInt(0, 5_000)),
      },
    };
  });
};

const buildNsg: Builder = (ts, er, ctx, dataset) => {
  const nics = ["nic-web-1", "nic-app-2", "nic-db-3"];
  return multiDoc(ts, er, ctx, dataset, "network_security_groups", nics, (nic) => {
    const nsg = `nsg-${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return {
      namespace: "Microsoft.Network/networkInterfaces",
      resourceName: nic,
      armProviderSegments: ["Microsoft.Network", "networkInterfaces", nic],
      dimensions: { NIC: nic, NSG: nsg },
      metrics: {
        BytesReceivedRate: counter(randInt(0, 500_000_000)),
        BytesTransmittedRate: counter(randInt(0, 320_000_000)),
        PacketDrops: counter(fail ? randInt(1, 50_000) : randInt(0, 500)),
      },
    };
  });
};

const buildAzureFirewall: Builder = (ts, er, ctx, dataset) => {
  const policies = ["policy-east", "policy-west", "policy-shared"];
  return multiDoc(ts, er, ctx, dataset, "azure_firewall", policies, (pol) => {
    const fw = `afw-${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return {
      namespace: "Microsoft.Network/azureFirewalls",
      resourceName: fw,
      armProviderSegments: ["Microsoft.Network", "azureFirewalls", fw],
      dimensions: { FirewallPolicy: pol, Protocol: rand(["TCP", "UDP", "Any"]) },
      metrics: {
        ApplicationRuleHit: counter(randInt(0, 4_000_000)),
        NetworkRuleHit: counter(randInt(0, 2_500_000)),
        FirewallHealth: stat(dp(jitter(fail ? 78 : 100, fail ? 15 : 0.05, 0, 100))),
        SNATPortUtilization: stat(dp(jitter(35 + (fail ? 40 : 0), 30, 0, 100))),
      },
    };
  });
};

const buildStorageSync: Builder = (ts, er, ctx, dataset) => {
  const servers = ["sync-srv-1", "sync-srv-2"];
  return multiDoc(ts, er, ctx, dataset, "storage_sync", servers, (srv) => {
    const svc = `ssc-${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return {
      namespace: "Microsoft.StorageSync/storageSyncServices",
      resourceName: svc,
      armProviderSegments: ["Microsoft.StorageSync", "storageSyncServices", svc],
      dimensions: { ServerName: srv, SyncGroup: rand(["files-prod", "home-dirs"]) },
      metrics: {
        StorageSyncUploadBytes: counter(randInt(0, 40_000_000_000)),
        ServerSyncSessionApplied: counter(randInt(0, 50_000)),
        CloudTieringSizeSaved: counter(randInt(0, 20_000_000_000)),
        SyncSessionFailures: counter(fail ? randInt(1, 2_000) : randInt(0, 30)),
      },
    };
  });
};

const buildStreamAnalytics: Builder = (ts, er, ctx, dataset) => {
  const partitions = ["0", "1", "2"];
  return multiDoc(ts, er, ctx, dataset, "stream_analytics", partitions, (pid) => {
    const job = `asa-${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return {
      namespace: "Microsoft.StreamAnalytics/streamingjobs",
      resourceName: job,
      armProviderSegments: ["Microsoft.StreamAnalytics", "streamingjobs", job],
      dimensions: { PartitionId: pid, JobName: job },
      metrics: {
        InputEvents: counter(randInt(0, 50_000_000)),
        OutputEvents: counter(randInt(0, 49_000_000)),
        Errors: counter(fail ? randInt(1, 500_000) : randInt(0, 5_000)),
        WatermarkDelay: stat(dp(jitter(2 + (fail ? 40 : 0), 3, 0, 300))),
      },
    };
  });
};

const buildAcr: Builder = (ts, er, ctx, dataset) => {
  const repos = ["payments-api", "web-spa", "batch-worker"];
  return multiDoc(ts, er, ctx, dataset, "acr", repos, (repo) => {
    const reg = `cr${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return {
      namespace: "Microsoft.ContainerRegistry/registries",
      resourceName: reg,
      armProviderSegments: ["Microsoft.ContainerRegistry", "registries", reg],
      dimensions: { Repository: repo, ImageTag: rand(["latest", "v1.4.2", "sha-abc"]) },
      metrics: {
        SuccessfulPullCount: counter(randInt(0, 800_000)),
        SuccessfulPushCount: counter(randInt(0, 40_000)),
        TotalPullCount: counter(randInt(0, 900_000)),
        StorageUsed: stat(dp(jitter(12e9 + (fail ? 2e9 : 0), 4e9, 1e8, 80e9))),
      },
    };
  });
};

const buildDefender: Builder = (ts, er, ctx, dataset) => {
  const subs = ["sub-scan-a", "sub-scan-b"];
  return multiDoc(ts, er, ctx, dataset, "defender_for_cloud", subs, (a) => {
    const fail = Math.random() < er;
    return {
      namespace: "Microsoft.Security/locations",
      resourceName: "eastus",
      armProviderSegments: ["Microsoft.Security", "locations", "eastus"],
      dimensions: { Assessment: a, Severity: rand(["High", "Medium", "Low"]) },
      metrics: {
        SecureScore: stat(dp(jitter(fail ? 62 : 88, 12, 0, 100))),
        ActiveAlerts: counter(fail ? randInt(5, 800) : randInt(0, 40)),
        ResolvedAlerts: counter(randInt(0, 2_000)),
      },
    };
  });
};

const buildRedis: Builder = (ts, er, ctx, dataset) => {
  const shards = ["shard-0", "shard-1", "shard-2"];
  return multiDoc(ts, er, ctx, dataset, "cache_for_redis", shards, (sh) => {
    const name = `redis-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return {
      namespace: "Microsoft.Cache/Redis",
      resourceName: name,
      armProviderSegments: ["Microsoft.Cache", "Redis", name],
      dimensions: { ShardId: sh },
      metrics: {
        connectedclients: stat(dp(jitter(120 + (fail ? 800 : 0), 80, 0, 20_000))),
        percentProcessorTime: stat(dp(jitter(38 + (fail ? 35 : 0), 28, 0, 100))),
        usedmemory: stat(dp(jitter(1.2e9, 4e8, 1e7, 26e9))),
        usedmemorypercentage: stat(dp(jitter(48 + (fail ? 25 : 0), 22, 0, 100))),
        cachemisses: counter(randInt(0, 500_000)),
        cachehits: counter(randInt(0, 5_000_000)),
      },
    };
  });
};

const buildPostgresql: Builder = (ts, er, ctx, dataset) => {
  const inst = ["flex-pg-1", "flex-pg-2"];
  return multiDoc(ts, er, ctx, dataset, "database_for_postgresql", inst, (srv) => {
    const fail = Math.random() < er;
    return {
      namespace: "Microsoft.DBforPostgreSQL/flexibleServers",
      resourceName: srv,
      armProviderSegments: ["Microsoft.DBforPostgreSQL", "flexibleServers", srv],
      dimensions: { ServerName: srv, DatabaseName: rand(["app", "analytics"]) },
      metrics: {
        cpu_percent: stat(dp(jitter(36 + (fail ? 40 : 0), 28, 0, 100))),
        memory_percent: stat(dp(jitter(52 + (fail ? 20 : 0), 24, 0, 100))),
        storage_percent: stat(dp(jitter(44, 30, 5, 100))),
        network_bytes_egress: counter(randInt(0, 8_000_000_000)),
        active_connections: counter(randInt(1, 4_000) + (fail ? randInt(50, 800) : 0)),
      },
    };
  });
};

const buildFrontDoor: Builder = (ts, er, ctx, dataset) => {
  const ep = ["ep-api", "ep-static", "ep-stream"];
  return multiDoc(ts, er, ctx, dataset, "front_door", ep, (e) => {
    const prof = `fd-${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return {
      namespace: "Microsoft.Cdn/profiles",
      resourceName: prof,
      armProviderSegments: ["Microsoft.Cdn", "profiles", prof],
      dimensions: { Endpoint: e, Profile: prof },
      metrics: {
        RequestCount: counter(randInt(0, 25_000_000)),
        ByteHitRatio: stat(dp(jitter(fail ? 0.72 : 0.91, 0.1, 0, 1))),
        TotalLatency: stat(dp(jitter(45 + (fail ? 220 : 0), 35, 2, 8_000))),
        Percentage5XX: stat(dp(jitter(fail ? 2.2 : 0.05, fail ? 1.5 : 0.02, 0, 100))),
        Percentage4XX: stat(dp(jitter(0.4 + (fail ? 1.2 : 0), 0.3, 0, 100))),
      },
    };
  });
};

const buildCdn: Builder = buildFrontDoor;

const buildDedicatedHost: Builder = (ts, er, ctx, dataset) => {
  const hosts = ["host-0", "host-1", "host-2"];
  return multiDoc(ts, er, ctx, dataset, "dedicated_host", hosts, (h) => {
    const hg = `hg-${randId(4).toLowerCase()}`;
    return {
      namespace: "Microsoft.Compute/hostGroups",
      resourceName: hg,
      armProviderSegments: ["Microsoft.Compute", "hostGroups", hg, "hosts", h],
      dimensions: { hostGroup: hg, host: h },
      metrics: vmLikeMetrics(er),
    };
  });
};

const buildCapacityReservation: Builder = (ts, er, ctx, dataset) => {
  const crs = ["cr-general", "cr-compute", "cr-memory"];
  return multiDoc(ts, er, ctx, dataset, "capacity_reservation", crs, (cr) => {
    const crg = `crg-${randId(4).toLowerCase()}`;
    return {
      namespace: "Microsoft.Compute/capacityReservations",
      resourceName: cr,
      armProviderSegments: [
        "Microsoft.Compute",
        "capacityReservationGroups",
        crg,
        "capacityReservations",
        cr,
      ],
      dimensions: { capacityReservationGroup: crg, capacityReservation: cr },
      metrics: {
        "Used vCPUs": stat(dp(jitter(48, 20, 0, 256))),
        "Reserved vCPUs": stat(dp(jitter(64, 8, 1, 512))),
        "Utilization %": stat(dp(jitter(72, 18, 0, 100))),
      },
    };
  });
};

const buildProximityPlacement: Builder = (ts, er, ctx, dataset) => {
  const ppg = `ppg-${randId(5).toLowerCase()}`;
  const { region, subscription, resourceGroup } = ctx;
  const load = er * 20;
  return [
    azureMetricDoc(ts, "proximity_placement", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Compute/proximityPlacementGroups",
      resourceName: ppg,
      armProviderSegments: ["Microsoft.Compute", "proximityPlacementGroups", ppg],
      dimensions: { proximityPlacementGroup: ppg },
      metrics: {
        "Standard SKU Family vCPUs": stat(dp(jitter(24 + load, 12, 0, 96))),
        "Standard D Family vCPUs": stat(dp(jitter(32 + load, 16, 0, 128))),
        "Standard E Family vCPUs": stat(dp(jitter(16 + load * 0.5, 10, 0, 64))),
      },
    }),
  ];
};

const buildConfidentialVm: Builder = (ts, er, ctx, dataset) => {
  const vms = ["cvm-web-01", "cvm-app-02", "cvm-batch-03"];
  return multiDoc(ts, er, ctx, dataset, "confidential_vm", vms, (vmName) => ({
    namespace: "Microsoft.Compute/virtualMachines",
    resourceName: vmName,
    armProviderSegments: ["Microsoft.Compute", "virtualMachines", vmName],
    dimensions: { VMName: vmName },
    metrics: vmLikeMetrics(er),
  }));
};

function defaultGeneric(
  ts: string,
  er: number,
  ctx: Ctx,
  dataset: string,
  serviceId: string
): EcsDocument[] {
  const { region, subscription, resourceGroup } = ctx;
  const nested = serviceId.replace(/-/g, "_");
  const acct = `st${randId(6).toLowerCase()}`;
  const fail = Math.random() < er;
  return [
    azureMetricDoc(ts, nested, dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Storage/storageAccounts",
      resourceName: acct,
      armProviderSegments: ["Microsoft.Storage", "storageAccounts", acct],
      dimensions: {
        ApiName: rand(["GetBlob", "PutBlob"]),
        Authentication: rand(["OAuth", "SAS"]),
        GeoType: rand(["Primary", "Secondary"]),
      },
      metrics: {
        Transactions: counter(randInt(0, 2_000_000)),
        Ingress: counter(randInt(0, 20_000_000_000)),
        Egress: counter(randInt(0, 15_000_000_000)),
        Availability: stat(dp(jitter(fail ? 97 : 100, fail ? 2 : 0.02, 0, 100))),
        SuccessE2ELatency: stat(dp(jitter(15 + (fail ? 70 : 0), 12, 1, 4_000))),
      },
    }),
  ];
}

const GENERIC_BUILDERS: Record<string, Builder> = {
  "virtual-machines": buildVirtualMachines,
  "vm-scale-sets": buildVmScaleSets,
  "front-door": buildFrontDoor,
  cdn: buildCdn,
  aks: buildAks,
  "container-apps": buildContainerApps,
  "app-service": buildAppService,
  functions: buildFunctions,
  "load-balancer": buildLoadBalancer,
  "application-gateway": buildApplicationGateway,
  "virtual-network": buildVirtualNetwork,
  "blob-storage": buildBlobStorage,
  "file-storage": buildFileStorageReal,
  "sql-database": buildSqlDatabase,
  "cache-for-redis": buildRedis,
  "database-for-postgresql": buildPostgresql,
  "service-bus": buildServiceBus,
  "data-factory": buildDataFactory,
  monitor: buildMonitor,
  "key-vault": buildKeyVault,
  openai: buildOpenAi,
  "machine-learning": buildMachineLearning,
  "network-security-groups": buildNsg,
  "azure-firewall": buildAzureFirewall,
  "storage-sync": buildStorageSync,
  "stream-analytics": buildStreamAnalytics,
  acr: buildAcr,
  "defender-for-cloud": buildDefender,
  "dedicated-host": buildDedicatedHost,
  "capacity-reservation": buildCapacityReservation,
  "proximity-placement": buildProximityPlacement,
  "confidential-vm": buildConfidentialVm,
};

export function makeAzureGenericMetricGenerator(
  serviceId: string,
  dataset: string
): MetricGenerator {
  const builder = GENERIC_BUILDERS[serviceId];
  return (ts: string, er: number) => {
    const ctx = pickAzureContext();
    if (builder) return builder(ts, er, ctx, dataset);
    return defaultGeneric(ts, er, ctx, dataset, serviceId);
  };
}
