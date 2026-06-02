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

export function generateRouteServerDedicatedRemainingMetrics(
  ts: string,
  er: number
): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP["route-server"]!;
  const peers = ["hub-bgp-1", "hub-bgp-2", "onprem-edge"];
  const n = Math.min(randInt(1, 3), peers.length);
  return Array.from({ length: n }, (_, i) => {
    const peer = peers[i]!;
    const name = `rs-${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "route_server", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Network/routeServers",
      resourceName: name,
      armProviderSegments: ["Microsoft.Network", "routeServers", name],
      dimensions: { BgpPeer: peer },
      metrics: {
        ActivePeers: stat(dp(jitter(fail ? 1 : 4, 1.5, 0, 8))),
        RoutesAdvertised: counter(randInt(100, fail ? 180_000 : 120_000)),
        RoutesReceived: counter(randInt(200, fail ? 220_000 : 150_000)),
      },
    });
  });
}

export function generateSapOnAzureDedicatedRemainingMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP["sap-on-azure"]!;
  const instances = ["s4hana-prod", "bw-qa", "hana-dev"];
  const n = Math.min(randInt(1, 3), instances.length);
  return Array.from({ length: n }, (_, i) => {
    const inst = instances[i]!;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "sap_on_azure", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Workloads/sapVirtualInstances",
      resourceName: inst,
      armProviderSegments: ["Microsoft.Workloads", "sapVirtualInstances", inst],
      dimensions: { SID: rand(["S4P", "BWQ", "DEV"]), Database: rand(["HANA", "AnyDB"]) },
      metrics: {
        CpuUtilization: stat(dp(jitter(38 + (fail ? 48 : 0), 28, 0, 100))),
        MemoryUtilization: stat(dp(jitter(44 + (fail ? 35 : 0), 22, 0, 100))),
        InstanceHealth: stat(dp(jitter(fail ? 62 : 100, fail ? 18 : 0.05, 0, 100))),
      },
    });
  });
}

export function generateSignalrDedicatedRemainingMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP.signalr!;
  const hubs = ["notify", "telemetry", "chat"];
  const n = Math.min(randInt(1, 3), hubs.length);
  return Array.from({ length: n }, (_, i) => {
    const hub = hubs[i]!;
    const name = `sigr-${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "signalr", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.SignalRService/SignalR",
      resourceName: name,
      armProviderSegments: ["Microsoft.SignalRService", "SignalR", name],
      dimensions: { Hub: hub },
      metrics: {
        ConnectionCount: stat(dp(jitter(1200 + (fail ? 6000 : 0), 900, 0, 50_000))),
        MessageCount: counter(randInt(10_000, fail ? 2_800_000 : 2_000_000)),
        InboundTraffic: counter(randInt(5_000_000, fail ? 9_000_000_000 : 6_000_000_000)),
        OutboundTraffic: counter(randInt(4_000_000, fail ? 7_500_000_000 : 5_000_000_000)),
      },
    });
  });
}

export function generateSiteRecoveryDedicatedRemainingMetrics(
  ts: string,
  er: number
): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP["site-recovery"]!;
  const vaults = ["rsv-primary", "rsv-dr", "rsv-shared"];
  const n = Math.min(randInt(1, 3), vaults.length);
  return Array.from({ length: n }, (_, i) => {
    const vault = `${vaults[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "site_recovery", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.RecoveryServices/vaults",
      resourceName: vault,
      armProviderSegments: ["Microsoft.RecoveryServices", "vaults", vault],
      dimensions: { ProtectedItem: rand(["vm-sql-01", "vm-web-02", "vm-app-03"]) },
      metrics: {
        ReplicationHealth: stat(dp(jitter(fail ? 72 : 100, fail ? 22 : 0.05, 0, 100))),
        RPODrift: stat(dp(jitter(120 + (fail ? 1800 : 0), 180, 0, 86_400))),
        ProtectedItems: stat(dp(jitter(18 + (fail ? -2 : 0), 4, 0, 512))),
      },
    });
  });
}

export function generateSpeechDedicatedRemainingMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP.speech!;
  const skus = ["speech-prod", "speech-stt", "speech-tts"];
  const n = Math.min(randInt(1, 3), skus.length);
  return Array.from({ length: n }, (_, i) => {
    const acct = `sp-${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "speech", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.CognitiveServices/accounts",
      resourceName: acct,
      armProviderSegments: ["Microsoft.CognitiveServices", "accounts", acct],
      dimensions: { ApiKind: skus[i]!, Region: region },
      metrics: {
        TotalCalls: counter(randInt(500, fail ? 1_200_000 : 900_000)),
        TotalErrors: counter(fail ? randInt(20, 80_000) : randInt(0, 2_000)),
        SuccessfulCalls: counter(randInt(400, fail ? 1_100_000 : 880_000)),
        SynthesisCharacters: counter(randInt(1000, fail ? 420_000_000 : 300_000_000)),
      },
    });
  });
}

export function generateSpringAppsDedicatedRemainingMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP["spring-apps"]!;
  const apps = ["orders-api", "catalog-svc", "inventory-worker"];
  const n = Math.min(randInt(1, 3), apps.length);
  return Array.from({ length: n }, (_, i) => {
    const app = apps[i]!;
    const svc = `asa-${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "spring_apps", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.AppPlatform/Spring",
      resourceName: svc,
      armProviderSegments: ["Microsoft.AppPlatform", "Spring", svc],
      dimensions: { AppName: app, Deployment: rand(["default", "blue", "green"]) },
      metrics: {
        AppCpuUsage: stat(dp(jitter(32 + (fail ? 55 : 0), 26, 0, 100))),
        AppMemoryUsage: stat(dp(jitter(41 + (fail ? 40 : 0), 24, 0, 100))),
        IngressBytesReceived: counter(randInt(2_000_000, fail ? 8_000_000_000 : 5_500_000_000)),
        RequestCount: counter(randInt(1000, fail ? 2_200_000 : 1_600_000)),
      },
    });
  });
}

export function generateAzureStackDedicatedRemainingMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP.stack!;
  const clusters = ["hci-prod", "hci-edge-1", "hci-lab"];
  const n = Math.min(randInt(1, 3), clusters.length);
  return Array.from({ length: n }, (_, i) => {
    const cluster = `${clusters[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "azure_stack", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.AzureStackHCI/clusters",
      resourceName: cluster,
      armProviderSegments: ["Microsoft.AzureStackHCI", "clusters", cluster],
      dimensions: { Node: rand(["node-01", "node-02", "node-03"]) },
      metrics: {
        RegistrationHealth: stat(dp(jitter(fail ? 68 : 100, fail ? 24 : 0.05, 0, 100))),
        NodeCount: stat(dp(jitter(4 + (fail ? -1 : 0), 1, 1, 64))),
      },
    });
  });
}

export function generateStaticWebAppsDedicatedRemainingMetrics(
  ts: string,
  er: number
): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP["static-web-apps"]!;
  const sites = ["docs-portal", "marketing", "internal-tools"];
  const n = Math.min(randInt(1, 3), sites.length);
  return Array.from({ length: n }, (_, i) => {
    const site = `${sites[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "static_web_apps", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Web/staticSites",
      resourceName: site,
      armProviderSegments: ["Microsoft.Web", "staticSites", site],
      dimensions: { Build: rand(["main", "preview", "release"]) },
      metrics: {
        BytesSent: counter(randInt(500_000, fail ? 3_000_000_000 : 2_000_000_000)),
        FunctionExecutionCount: counter(randInt(200, fail ? 1_800_000 : 1_200_000)),
        FunctionExecutionUnits: counter(randInt(800, fail ? 45_000_000 : 32_000_000)),
      },
    });
  });
}

export function generateStorageSyncDedicatedRemainingMetrics(
  ts: string,
  er: number
): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP["storage-sync"]!;
  const servers = ["sync-srv-a", "sync-srv-b", "sync-srv-c"];
  const n = Math.min(randInt(1, 3), servers.length);
  return Array.from({ length: n }, (_, i) => {
    const svc = `ssc-${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "storage_sync", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.StorageSync/storageSyncServices",
      resourceName: svc,
      armProviderSegments: ["Microsoft.StorageSync", "storageSyncServices", svc],
      dimensions: { ServerName: servers[i]!, SyncGroup: rand(["files", "profiles"]) },
      metrics: {
        SyncItemsUploaded: counter(randInt(0, fail ? 180_000 : 125_000)),
        SyncItemsDownloaded: counter(randInt(0, fail ? 165_000 : 118_000)),
        SyncErrors: counter(fail ? randInt(2, 4_000) : randInt(0, 40)),
      },
    });
  });
}

export function generateStreamAnalyticsDedicatedRemainingMetrics(
  ts: string,
  er: number
): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP["stream-analytics"]!;
  const streams = ["telemetry-pipeline", "orders-stream", "audit-out"];
  const n = Math.min(randInt(1, 3), streams.length);
  return Array.from({ length: n }, (_, i) => {
    const job = `asa-${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "stream_analytics", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.StreamAnalytics/streamingjobs",
      resourceName: job,
      armProviderSegments: ["Microsoft.StreamAnalytics", "streamingjobs", job],
      dimensions: { StreamInput: streams[i]! },
      metrics: {
        ResourceUtilization: stat(dp(jitter(46 + (fail ? 42 : 0), 32, 0, 100))),
        InputEvents: counter(randInt(10_000, fail ? 48_000_000 : 36_000_000)),
        OutputEvents: counter(randInt(8_000, fail ? 46_000_000 : 34_000_000)),
        ConversionErrors: counter(fail ? randInt(5, 90_000) : randInt(0, 800)),
      },
    });
  });
}

export function generateTableStorageDedicatedRemainingMetrics(
  ts: string,
  er: number
): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP["table-storage"]!;
  const accounts = ["sttableprod", "stcatalog", "sttelemetry"];
  const n = Math.min(randInt(1, 3), accounts.length);
  return Array.from({ length: n }, (_, i) => {
    const acct = accounts[i]!;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "table_storage", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Storage/storageAccounts",
      resourceName: acct,
      armProviderSegments: ["Microsoft.Storage", "storageAccounts", acct],
      dimensions: {
        TableName: rand(["Entities", "Sessions", "Counters"]),
        ApiName: rand(["QueryEntities", "InsertEntity", "MergeEntity"]),
      },
      metrics: {
        Transactions: counter(randInt(0, fail ? 8_000_000 : 5_500_000)),
        TableEntityCount: stat(
          dp(jitter(2_400_000 + (fail ? 400_000 : 0), 900_000, 0, 50_000_000))
        ),
        TableCapacity: stat(dp(jitter(8e9 + (fail ? 2e9 : 0), 2e9, 1e6, 120e9))),
      },
    });
  });
}

export function generateTrafficManagerDedicatedRemainingMetrics(
  ts: string,
  er: number
): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP["traffic-manager"]!;
  const endpoints = ["ep-primary", "ep-failover", "ep-geo"];
  const n = Math.min(randInt(1, 3), endpoints.length);
  return Array.from({ length: n }, (_, i) => {
    const prof = `tm-${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "traffic_manager", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Network/trafficmanagerprofiles",
      resourceName: prof,
      armProviderSegments: ["Microsoft.Network", "trafficmanagerprofiles", prof],
      dimensions: { Endpoint: endpoints[i]!, Profile: prof },
      metrics: {
        QpsByEndpoint: stat(dp(jitter(420 + (fail ? 800 : 0), 280, 0, 12_000))),
        ProbeAgentCurrentEndpointStateByProfileResourceId: stat(
          dp(jitter(fail ? 0 : 1, 0.05, 0, 1))
        ),
      },
    });
  });
}

export function generateTranslatorDedicatedRemainingMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP.translator!;
  const pairs = ["en-es", "de-fr", "ja-en"];
  const n = Math.min(randInt(1, 3), pairs.length);
  return Array.from({ length: n }, (_, i) => {
    const acct = `tr-${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "translator", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.CognitiveServices/accounts",
      resourceName: acct,
      armProviderSegments: ["Microsoft.CognitiveServices", "accounts", acct],
      dimensions: { LanguagePair: pairs[i]! },
      metrics: {
        TotalCalls: counter(randInt(300, fail ? 900_000 : 650_000)),
        TotalErrors: counter(fail ? randInt(15, 55_000) : randInt(0, 900)),
        CharactersTranslated: counter(randInt(5_000, fail ? 280_000_000 : 200_000_000)),
      },
    });
  });
}

export function generateVirtualWanDedicatedRemainingMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP["virtual-wan"]!;
  const tunnels = ["tunnel-branch-1", "tunnel-branch-2", "tunnel-partner"];
  const n = Math.min(randInt(1, 3), tunnels.length);
  return Array.from({ length: n }, (_, i) => {
    const hub = `vhub-${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "virtual_wan", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Network/virtualHubs",
      resourceName: hub,
      armProviderSegments: ["Microsoft.Network", "virtualHubs", hub],
      dimensions: { Tunnel: tunnels[i]!, ConnectionName: rand(["S2S-prod", "P2S-pool"]) },
      metrics: {
        TunnelBandwidth: stat(
          dp(jitter(180_000_000 + (fail ? 40_000_000 : 0), 60_000_000, 0, 10_000_000_000))
        ),
        TunnelEgressBytes: counter(randInt(1_000_000, fail ? 6_000_000_000 : 4_000_000_000)),
        TunnelIngressBytes: counter(randInt(1_000_000, fail ? 5_500_000_000 : 3_800_000_000)),
        VpnGatewayBgpPeerStatus: stat(dp(jitter(fail ? 0 : 1, fail ? 0.35 : 0.02, 0, 1))),
      },
    });
  });
}

export function generateVisionDedicatedRemainingMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP.vision!;
  const models = ["ocr-read", "image-analysis", "custom-classifier"];
  const n = Math.min(randInt(1, 3), models.length);
  return Array.from({ length: n }, (_, i) => {
    const acct = `cv-${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "vision", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.CognitiveServices/accounts",
      resourceName: acct,
      armProviderSegments: ["Microsoft.CognitiveServices", "accounts", acct],
      dimensions: { ApiName: models[i]! },
      metrics: {
        TotalCalls: counter(randInt(400, fail ? 1_100_000 : 820_000)),
        TotalErrors: counter(fail ? randInt(25, 70_000) : randInt(0, 1_500)),
        SuccessfulCalls: counter(randInt(350, fail ? 1_000_000 : 800_000)),
        Latency: stat(dp(jitter(220 + (fail ? 1600 : 0), 160, 12, 45_000))),
      },
    });
  });
}

export function generateVmwareSolutionDedicatedRemainingMetrics(
  ts: string,
  er: number
): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP["vmware-solution"]!;
  const clouds = ["pc-prod-east", "pc-dr-west", "pc-lab"];
  const n = Math.min(randInt(1, 3), clouds.length);
  return Array.from({ length: n }, (_, i) => {
    const cloud = `${clouds[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "vmware_solution", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.AVS/privateClouds",
      resourceName: cloud,
      armProviderSegments: ["Microsoft.AVS", "privateClouds", cloud],
      dimensions: { Cluster: rand(["cluster-1", "cluster-2"]) },
      metrics: {
        EffectiveCpuAvailable: stat(dp(jitter(48 + (fail ? -18 : 8), 14, 0, 256))),
        EffectiveMemAvailable: stat(dp(jitter(180 + (fail ? -40 : 20), 35, 0, 1024))),
        TotalMbAvailable: stat(
          dp(jitter(786_432 + (fail ? -122_880 : 61_440), 81_920, 0, 4_194_304))
        ),
      },
    });
  });
}

export function generateWafPolicyDedicatedRemainingMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP["waf-policy"]!;
  const rules = ["950100", "920420", "942440"];
  const n = Math.min(randInt(1, 3), rules.length);
  return Array.from({ length: n }, (_, i) => {
    const pol = `waf-${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "waf", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Network/applicationGatewayWebApplicationFirewallPolicies",
      resourceName: pol,
      armProviderSegments: [
        "Microsoft.Network",
        "applicationGatewayWebApplicationFirewallPolicies",
        pol,
      ],
      dimensions: { RuleId: rules[i]!, PolicyName: pol },
      metrics: {
        MatchedWafRequests: counter(randInt(500, fail ? 2_200_000 : 1_400_000)),
        BlockedWafRequests: counter(fail ? randInt(200, 180_000) : randInt(0, 4_000)),
        WafRuleHits: counter(randInt(100, fail ? 420_000 : 280_000)),
      },
    });
  });
}

export function generateMicrosoftFabricDedicatedRemainingMetrics(
  ts: string,
  er: number
): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP["microsoft-fabric"]!;
  const capacities = ["cap-analytics", "cap-bi-shared", "cap-eng"];
  const n = Math.min(randInt(1, 3), capacities.length);
  return Array.from({ length: n }, (_, i) => {
    const cap = `${capacities[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "microsoft_fabric", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Fabric/capacities",
      resourceName: cap,
      armProviderSegments: ["Microsoft.Fabric", "capacities", cap],
      dimensions: { Workload: rand(["PowerBI", "DataFactory", "Synapse"]) },
      metrics: {
        CapacityCuUtilization: stat(dp(jitter(62 + (fail ? 28 : 0), 22, 0, 100))),
        OverageMinutes: counter(fail ? randInt(5, 14_400) : randInt(0, 120)),
      },
    });
  });
}

export function generateM365DedicatedRemainingMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP.m365!;
  const tenants = [
    "meridiantech.onmicrosoft.com",
    "cascadeops.onmicrosoft.com",
    "northpeak.onmicrosoft.com",
  ];
  const n = Math.min(randInt(1, 3), tenants.length);
  return Array.from({ length: n }, (_, i) => {
    const fail = Math.random() < er;
    const law = `law-m365-${randId(4).toLowerCase()}`;
    return azureMetricDoc(ts, "m365", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.OperationalInsights/workspaces",
      resourceName: law,
      armProviderSegments: ["Microsoft.OperationalInsights", "workspaces", law],
      dimensions: { TenantDomain: tenants[i]!, Product: rand(["Exchange", "Teams", "M365"]) },
      metrics: {
        ActiveUsers: stat(dp(jitter(4200 + (fail ? -800 : 400), 900, 0, 200_000))),
        EmailCount: counter(randInt(10_000, fail ? 2_800_000 : 2_000_000)),
        TeamsMessages: counter(randInt(5000, fail ? 1_200_000 : 900_000)),
      },
    });
  });
}

export function generateDataLakeStorageDedicatedRemainingMetrics(
  ts: string,
  er: number
): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP["data-lake-storage"]!;
  const accounts = ["dlsraw", "dlscurated", "dlslogs"];
  const n = Math.min(randInt(1, 3), accounts.length);
  return Array.from({ length: n }, (_, i) => {
    const acct = accounts[i]!;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "data_lake_storage", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Storage/storageAccounts",
      resourceName: acct,
      armProviderSegments: ["Microsoft.Storage", "storageAccounts", acct],
      dimensions: {
        BlobType: "BlockBlob",
        ApiName: rand(["CreateFile", "GetBlob", "PutBlob", "DeleteBlob"]),
      },
      metrics: {
        Transactions: counter(randInt(0, 12_000_000)),
        TotalIngress: counter(randInt(0, 90_000_000_000)),
        TotalEgress: counter(randInt(0, 72_000_000_000)),
        BlobCapacity: stat(dp(jitter(62e9 + (fail ? 15e9 : 0), 18e9, 1e9, 500e9))),
      },
    });
  });
}

export function generateNetappFilesDedicatedRemainingMetrics(
  ts: string,
  er: number
): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP["netapp-files"]!;
  const vols = ["vol-oracle", "vol-sap", "vol-shared"];
  const n = Math.min(randInt(1, 3), vols.length);
  return Array.from({ length: n }, (_, i) => {
    const acct = `na-${randId(4).toLowerCase()}`;
    const pool = `pool-${randId(4).toLowerCase()}`;
    const vol = `${vols[i]}-${randId(3).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "netapp_files", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.NetApp/netAppAccounts/capacityPools/volumes",
      resourceName: vol,
      armProviderSegments: [
        "Microsoft.NetApp",
        "netAppAccounts",
        acct,
        "capacityPools",
        pool,
        "volumes",
        vol,
      ],
      dimensions: { VolumeName: vol, PoolName: pool },
      metrics: {
        VolumeAllocatedSize: stat(dp(jitter(4e12 + (fail ? 5e11 : 0), 8e11, 1e9, 64e12))),
        VolumeLogicalSize: stat(dp(jitter(2.2e12 + (fail ? 4e11 : 0), 6e11, 1e9, 50e12))),
        ReadIops: stat(dp(jitter(2800 + (fail ? 1800 : 0), 1200, 0, 80_000))),
        WriteIops: stat(dp(jitter(1400 + (fail ? 900 : 0), 600, 0, 40_000))),
      },
    });
  });
}

export function generateApiCenterDedicatedRemainingMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP["api-center"]!;
  const workspaces = ["default", "partner-apis", "internal"];
  const n = Math.min(randInt(1, 3), workspaces.length);
  return Array.from({ length: n }, (_, i) => {
    const svc = `apic-${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "api_center", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.ApiCenter/services",
      resourceName: svc,
      armProviderSegments: ["Microsoft.ApiCenter", "services", svc],
      dimensions: { Workspace: workspaces[i]! },
      metrics: {
        ApiCount: stat(dp(jitter(48 + (fail ? -6 : 4), 12, 0, 5000))),
        DefinitionCount: stat(dp(jitter(120 + (fail ? -15 : 20), 35, 0, 50_000))),
        EnvironmentCount: stat(dp(jitter(6 + (fail ? -1 : 1), 2, 1, 64))),
      },
    });
  });
}
