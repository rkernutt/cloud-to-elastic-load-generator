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

export function generateAiSearchDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const indexes = ["catalog-prod", "docs-search", "kb-retail"];
  const n = Math.min(randInt(1, 3), indexes.length);
  const dataset = AZURE_METRICS_DATASET_MAP["ai-search"]!;
  return Array.from({ length: n }, (_, i) => {
    const svc = `srch-${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "ai_search", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Search/searchServices",
      resourceName: svc,
      armProviderSegments: ["Microsoft.Search", "searchServices", svc],
      dimensions: { IndexName: indexes[i]!, Replica: rand(["primary", "replica-1"]) },
      metrics: {
        SearchQueriesPerSecond: stat(dp(jitter(42 + (fail ? 28 : 0), 22, 0, 500))),
        SearchLatency: stat(dp(jitter(95 + (fail ? 420 : 0), 55, 5, 12_000))),
        ThrottledSearchQueriesPercentage: stat(
          dp(jitter(fail ? 4.2 : 0.08, fail ? 2.5 : 0.04, 0, 100))
        ),
        DocumentsProcessedCount: counter(randInt(0, fail ? 180_000 : 260_000)),
      },
    });
  });
}

export function generateArcDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const machines = ["arc-sql-01", "arc-k8s-edge", "arc-hyperv-prod"];
  const n = Math.min(randInt(1, 3), machines.length);
  const dataset = AZURE_METRICS_DATASET_MAP.arc!;
  return Array.from({ length: n }, (_, i) => {
    const name = `${machines[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "arc", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.HybridCompute/machines",
      resourceName: name,
      armProviderSegments: ["Microsoft.HybridCompute", "machines", name],
      dimensions: { MachineName: name, OsType: rand(["Linux", "Windows"]) },
      metrics: {
        HeartbeatCount: counter(randInt(500, fail ? 48_000 : 72_000)),
        ExtensionInstallationSucceeded: counter(randInt(10, fail ? 180 : 420)),
        GuestConfigurationAssignmentCompliance: stat(
          dp(jitter(fail ? 82 : 98, fail ? 12 : 1.5, 0, 100))
        ),
      },
    });
  });
}

export function generateAttestationDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const providers = ["attest-east", "attest-shared", "attest-workload"];
  const n = Math.min(randInt(1, 3), providers.length);
  const dataset = AZURE_METRICS_DATASET_MAP.attestation!;
  return Array.from({ length: n }, (_, i) => {
    const name = `${providers[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "attestation", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Attestation/attestationProviders",
      resourceName: name,
      armProviderSegments: ["Microsoft.Attestation", "attestationProviders", name],
      dimensions: {
        Policy: rand(["snp", "sgx", "tpm"]),
        ApiVersion: rand(["2022-08-01", "2020-10-01"]),
      },
      metrics: {
        TotalCalls: counter(randInt(200, fail ? 2_200_000 : 1_600_000)),
        ServerErrors: counter(fail ? randInt(20, 18_000) : randInt(0, 400)),
        SuccessfulCalls: counter(randInt(180, fail ? 1_950_000 : 1_520_000)),
      },
    });
  });
}

export function generateBastionDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const hosts = ["bastion-hub", "bastion-spoke", "bastion-jump"];
  const n = Math.min(randInt(1, 3), hosts.length);
  const dataset = AZURE_METRICS_DATASET_MAP.bastion!;
  return Array.from({ length: n }, (_, i) => {
    const name = `${hosts[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "bastion", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Network/bastionHosts",
      resourceName: name,
      armProviderSegments: ["Microsoft.Network", "bastionHosts", name],
      dimensions: {
        VirtualNetwork: `vnet-${randId(4).toLowerCase()}`,
        TunnelType: rand(["NativeClient", "Portal"]),
      },
      metrics: {
        TotalSessions: counter(randInt(0, fail ? 58_000 : 82_000)),
        SessionCount: stat(dp(jitter(8 + (fail ? 22 : 0), 6, 0, 500))),
        CpuUsage: stat(dp(jitter(28 + (fail ? 38 : 0), 22, 0, 100))),
        MemoryUsage: stat(dp(jitter(46 + (fail ? 32 : 0), 20, 0, 100))),
      },
    });
  });
}

export function generateConfidentialLedgerDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const ledgers = ["audit-chain", "claims-ledger", "trade-settle"];
  const n = Math.min(randInt(1, 3), ledgers.length);
  const dataset = AZURE_METRICS_DATASET_MAP["confidential-ledger"]!;
  return Array.from({ length: n }, (_, i) => {
    const name = `ledger-${ledgers[i]!.replace(/-/g, "")}-${randId(3).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "confidential_ledger", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.ConfidentialLedger/ledgers",
      resourceName: name,
      armProviderSegments: ["Microsoft.ConfidentialLedger", "ledgers", name],
      dimensions: { LedgerRole: rand(["Reader", "Contributor", "Administrator"]) },
      metrics: {
        RequestCount: counter(randInt(100, fail ? 1_800_000 : 1_200_000)),
        Latency: stat(dp(jitter(22 + (fail ? 180 : 0), 18, 2, 4_000))),
        SuccessCount: counter(randInt(90, fail ? 1_650_000 : 1_150_000)),
        FailureCount: counter(fail ? randInt(20, 35_000) : randInt(0, 800)),
      },
    });
  });
}

export function generateIotCentralDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const apps = ["factory-floor", "smart-building", "asset-tracker"];
  const n = Math.min(randInt(1, 3), apps.length);
  const dataset = AZURE_METRICS_DATASET_MAP["iot-central"]!;
  return Array.from({ length: n }, (_, i) => {
    const name = `iotc-${apps[i]!.replace(/-/g, "")}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "iot_central", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.IoTCentral/iotApps",
      resourceName: name,
      armProviderSegments: ["Microsoft.IoTCentral", "iotApps", name],
      dimensions: { Template: rand(["thermostat", "gateway", "sensor-pack"]) },
      metrics: {
        ConnectedDeviceCount: stat(dp(jitter(420 + (fail ? -80 : 40), 120, 0, 50_000))),
        ProvisionedDeviceCount: counter(randInt(50, fail ? 12_000 : 18_000)),
        DataExport: counter(randInt(0, fail ? 2_200_000 : 3_100_000)),
      },
    });
  });
}

export function generateLabServicesDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const plans = ["cs101", "devbox-lab", "trainers-east"];
  const n = Math.min(randInt(1, 3), plans.length);
  const dataset = AZURE_METRICS_DATASET_MAP["lab-services"]!;
  return Array.from({ length: n }, (_, i) => {
    const name = `labplan-${plans[i]}-${randId(3).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "lab_services", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.LabServices/labPlans",
      resourceName: name,
      armProviderSegments: ["Microsoft.LabServices", "labPlans", name],
      dimensions: { SKU: rand(["Standard", "Premium"]) },
      metrics: {
        LabVmCount: stat(dp(jitter(24 + (fail ? -6 : 4), 8, 0, 500))),
        UserCount: counter(randInt(20, fail ? 1_200 : 2_400)),
        ActiveLabCount: stat(dp(jitter(5 + (fail ? 0 : 2), 2, 0, 80))),
      },
    });
  });
}

export function generateManagedIdentityDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const ids = ["id-api", "id-data-pipeline", "id-automation"];
  const n = Math.min(randInt(1, 3), ids.length);
  const dataset = AZURE_METRICS_DATASET_MAP["managed-identity"]!;
  return Array.from({ length: n }, (_, i) => {
    const name = `${ids[i]}-${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "managed_identity", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.ManagedIdentity/userAssignedIdentities",
      resourceName: name,
      armProviderSegments: ["Microsoft.ManagedIdentity", "userAssignedIdentities", name],
      dimensions: { Audience: rand(["api://vault", "api://storage", "https://vault.azure.net"]) },
      metrics: {
        TokenIssuanceCount: counter(randInt(500, fail ? 8_200_000 : 6_200_000)),
        FederatedCredentialUsage: counter(randInt(0, fail ? 620_000 : 890_000)),
      },
    });
  });
}

export function generateMapsDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const accounts = ["maps-fleet", "maps-retail", "maps-logistics"];
  const n = Math.min(randInt(1, 3), accounts.length);
  const dataset = AZURE_METRICS_DATASET_MAP.maps!;
  return Array.from({ length: n }, (_, i) => {
    const name = `maps-${accounts[i]}-${randId(3).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "maps", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Maps/accounts",
      resourceName: name,
      armProviderSegments: ["Microsoft.Maps", "accounts", name],
      dimensions: { ApiType: rand(["Render", "Search", "Route", "Weather"]) },
      metrics: {
        Availability: stat(dp(jitter(fail ? 97.2 : 99.95, fail ? 2 : 0.02, 0, 100))),
        Creator: counter(randInt(0, fail ? 120_000 : 220_000)),
        RequestCount: counter(randInt(1_000, fail ? 4_200_000 : 5_800_000)),
        DataSize: counter(randInt(500_000, fail ? 42_000_000_000 : 28_000_000_000)),
      },
    });
  });
}

export function generateMediaServicesDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const accounts = ["media-live", "media-vod", "media-replay"];
  const n = Math.min(randInt(1, 3), accounts.length);
  const dataset = AZURE_METRICS_DATASET_MAP["media-services"]!;
  return Array.from({ length: n }, (_, i) => {
    const name = `ams-${accounts[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "media_services", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Media/mediaservices",
      resourceName: name,
      armProviderSegments: ["Microsoft.Media", "mediaservices", name],
      dimensions: {
        StreamingEndpoint: `se-${randId(4).toLowerCase()}`,
        JobType: rand(["H264", "H265", "AV1"]),
      },
      metrics: {
        StreamingEndpointRequests: counter(randInt(500, fail ? 2_200_000 : 3_400_000)),
        EncodingJobDuration: stat(dp(jitter(420 + (fail ? 900 : 0), 280, 30, 86_400))),
        LiveChannelCount: stat(dp(jitter(4 + (fail ? 0 : 2), 2, 0, 64))),
      },
    });
  });
}

export function generateMigrateDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const projects = ["dc-east-migration", "sap-assess", "vmware-cutover"];
  const n = Math.min(randInt(1, 3), projects.length);
  const dataset = AZURE_METRICS_DATASET_MAP.migrate!;
  return Array.from({ length: n }, (_, i) => {
    const name = `migr-${projects[i]!.replace(/-/g, "")}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "migrate", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Migrate/assessmentProjects",
      resourceName: name,
      armProviderSegments: ["Microsoft.Migrate", "assessmentProjects", name],
      dimensions: { AssessmentType: rand(["VMware", "HyperV", "Physical"]) },
      metrics: {
        AssessedMachines: counter(randInt(10, fail ? 4_200 : 6_800)),
        MigrationProgress: stat(dp(jitter(fail ? 54 : 78, 18, 0, 100))),
        ReplicationHealth: stat(dp(jitter(fail ? 72 : 94, fail ? 16 : 4, 0, 100))),
      },
    });
  });
}

export function generateMonitorDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const components = ["appi-web", "appi-api", "appi-worker"];
  const n = Math.min(randInt(1, 3), components.length);
  const dataset = AZURE_METRICS_DATASET_MAP.monitor!;
  return Array.from({ length: n }, (_, i) => {
    const name = `${components[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "monitor", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Insights/components",
      resourceName: name,
      armProviderSegments: ["Microsoft.Insights", "components", name],
      dimensions: { CloudRoleName: rand(["frontend", "checkout-api", "batch-jobs"]) },
      metrics: {
        TraceCount: counter(randInt(1_000, fail ? 8_200_000 : 5_800_000)),
        ExceptionCount: counter(fail ? randInt(50, 180_000) : randInt(0, 4_000)),
        AvailabilityResults: stat(dp(jitter(fail ? 96.5 : 99.7, fail ? 3 : 0.15, 0, 100))),
        PerformanceCounterValue: stat(dp(jitter(42 + (fail ? 55 : 0), 35, 0, 100))),
      },
    });
  });
}

export function generateNetworkSecurityGroupsDedicatedMetrics(
  ts: string,
  er: number
): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const nsgs = ["nsg-web", "nsg-data", "nsg-mgmt"];
  const n = Math.min(randInt(1, 3), nsgs.length);
  const dataset = AZURE_METRICS_DATASET_MAP["network-security-groups"]!;
  return Array.from({ length: n }, (_, i) => {
    const name = `${nsgs[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(
      ts,
      "network_security_groups",
      dataset,
      region,
      subscription,
      resourceGroup,
      {
        namespace: "Microsoft.Network/networkSecurityGroups",
        resourceName: name,
        armProviderSegments: ["Microsoft.Network", "networkSecurityGroups", name],
        dimensions: {
          Direction: rand(["In", "Out"]),
          RuleName: rand(["AllowHttps", "DenyRdp", "AllowBastion"]),
        },
        metrics: {
          AllowedFlowsCount: counter(randInt(10_000, fail ? 42_000_000 : 62_000_000)),
          BlockedFlowsCount: counter(fail ? randInt(500, 1_800_000) : randInt(0, 120_000)),
        },
      }
    );
  });
}

export function generateNetworkWatcherDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const watchers = ["nw-main", "nw-spoke", "nw-audit"];
  const n = Math.min(randInt(1, 3), watchers.length);
  const dataset = AZURE_METRICS_DATASET_MAP["network-watcher"]!;
  return Array.from({ length: n }, (_, i) => {
    const name = `${watchers[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "network_watcher", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Network/networkWatchers",
      resourceName: name,
      armProviderSegments: ["Microsoft.Network", "networkWatchers", name],
      dimensions: { Feature: rand(["FlowLogs", "ConnectionMonitor", "PacketCapture"]) },
      metrics: {
        FlowLogCount: counter(randInt(20, fail ? 2_400 : 3_800)),
        PacketsCaptured: counter(randInt(0, fail ? 12_000_000 : 18_000_000)),
        TopologyCount: counter(randInt(0, fail ? 42_000 : 68_000)),
      },
    });
  });
}

export function generateNotificationHubsDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const hubs = ["hub-marketing", "hub-transactions", "hub-alerts"];
  const n = Math.min(randInt(1, 3), hubs.length);
  const dataset = AZURE_METRICS_DATASET_MAP["notification-hubs"]!;
  return Array.from({ length: n }, (_, i) => {
    const ns = `nh-${hubs[i]!.replace(/-/g, "")}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "notification_hubs", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.NotificationHubs/namespaces",
      resourceName: ns,
      armProviderSegments: ["Microsoft.NotificationHubs", "namespaces", ns],
      dimensions: { Platform: rand(["apple", "gcm", "browser", "wns"]) },
      metrics: {
        Incoming: counter(randInt(500, fail ? 4_200_000 : 5_800_000)),
        Scheduled: counter(randInt(0, fail ? 820_000 : 1_100_000)),
        Registration: counter(randInt(200, fail ? 1_800_000 : 2_400_000)),
        NotificationHubPushes: counter(randInt(400, fail ? 3_900_000 : 5_200_000)),
      },
    });
  });
}

export function generateOracleOnAzureDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const clusters = ["oda-prod", "oda-dr", "oda-analytics"];
  const n = Math.min(randInt(1, 3), clusters.length);
  const dataset = AZURE_METRICS_DATASET_MAP["oracle-on-azure"]!;
  return Array.from({ length: n }, (_, i) => {
    const name = `oda-${clusters[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "oracle_on_azure", dataset, region, subscription, resourceGroup, {
      namespace: "Oracle.Database/cloudExadataInfrastructures",
      resourceName: name,
      armProviderSegments: ["Oracle.Database", "cloudExadataInfrastructures", name],
      dimensions: { VmCluster: `vmc-${randId(4).toLowerCase()}` },
      metrics: {
        CpuUtilization: stat(dp(jitter(38 + (fail ? 42 : 0), 28, 0, 100))),
        StorageUsed: stat(dp(jitter(42e12 + (fail ? 8e12 : 0), 12e12, 1e12, 120e12))),
        IOLatency: stat(dp(jitter(8 + (fail ? 28 : 0), 6, 1, 500))),
      },
    });
  });
}

export function generatePolicyDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const assignments = ["deny-public-ip", "require-tags", "allowed-locations"];
  const n = Math.min(randInt(1, 3), assignments.length);
  const dataset = AZURE_METRICS_DATASET_MAP.policy!;
  return Array.from({ length: n }, (_, i) => {
    const name = `pa-${assignments[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "policy", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Authorization/policyAssignments",
      resourceName: name,
      armProviderSegments: ["Microsoft.Authorization", "policyAssignments", name],
      dimensions: {
        PolicyDefinition: rand(["builtin-audit", "custom-governance", "security-baseline"]),
      },
      metrics: {
        NonCompliantResources: counter(randInt(0, fail ? 18_000 : 4_200)),
        CompliancePercentage: stat(dp(jitter(fail ? 82 : 96, fail ? 12 : 2, 0, 100))),
        RemediationTaskCount: counter(randInt(0, fail ? 2_400 : 620)),
      },
    });
  });
}

export function generatePowerBiEmbeddedDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const caps = ["pbi-embed-prod", "pbi-embed-analytics", "pbi-embed-cx"];
  const n = Math.min(randInt(1, 3), caps.length);
  const dataset = AZURE_METRICS_DATASET_MAP["power-bi-embedded"]!;
  return Array.from({ length: n }, (_, i) => {
    const name = `${caps[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "power_bi_embedded", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.PowerBIDedicated/capacities",
      resourceName: name,
      armProviderSegments: ["Microsoft.PowerBIDedicated", "capacities", name],
      dimensions: { Workload: rand(["Default", "PremiumPerUser"]) },
      metrics: {
        QueryDuration: stat(dp(jitter(280 + (fail ? 1200 : 0), 220, 20, 86_400))),
        QPUHighUtilization: stat(dp(jitter(fail ? 78 : 42, fail ? 22 : 18, 0, 100))),
        MemoryUsage: stat(dp(jitter(58 + (fail ? 35 : 0), 25, 0, 100))),
      },
    });
  });
}

export function generatePrivateDnsDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const zones = ["internal.corp", "svc.prod", "db.data"];
  const n = Math.min(randInt(1, 3), zones.length);
  const dataset = AZURE_METRICS_DATASET_MAP["private-dns"]!;
  return Array.from({ length: n }, (_, i) => {
    const zone = `priv-${zones[i]!.replace(/\./g, "-")}-${randId(3).toLowerCase()}.internal`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "private_dns", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Network/privateDnsZones",
      resourceName: zone,
      armProviderSegments: ["Microsoft.Network", "privateDnsZones", zone],
      dimensions: { RecordType: rand(["A", "CNAME", "PTR"]) },
      metrics: {
        RecordSetCount: stat(dp(jitter(120 + (fail ? 40 : 0), 40, 0, 50_000))),
        VirtualNetworkLinkCount: stat(dp(jitter(4 + (fail ? 1 : 0), 2, 0, 500))),
        QueryVolume: counter(randInt(1_000, fail ? 42_000_000 : 62_000_000)),
      },
    });
  });
}

export function generatePrivateLinkDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const endpoints = ["pe-storage", "pe-sql", "pe-keyvault"];
  const n = Math.min(randInt(1, 3), endpoints.length);
  const dataset = AZURE_METRICS_DATASET_MAP["private-link"]!;
  return Array.from({ length: n }, (_, i) => {
    const name = `${endpoints[i]}-${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "private_link", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Network/privateEndpoints",
      resourceName: name,
      armProviderSegments: ["Microsoft.Network", "privateEndpoints", name],
      dimensions: {
        PrivateLinkServiceId: `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/privateLinkServices/pls-${randId(4)}`,
      },
      metrics: {
        BytesIn: counter(randInt(500_000, fail ? 90_000_000_000 : 62_000_000_000)),
        BytesOut: counter(randInt(400_000, fail ? 72_000_000_000 : 48_000_000_000)),
        ConnectionCount: stat(dp(jitter(180 + (fail ? 220 : 0), 120, 0, 50_000))),
      },
    });
  });
}

export function generatePurviewDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const accounts = ["purview-gov", "purview-pii", "purview-finance"];
  const n = Math.min(randInt(1, 3), accounts.length);
  const dataset = AZURE_METRICS_DATASET_MAP.purview!;
  return Array.from({ length: n }, (_, i) => {
    const name = `${accounts[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "purview", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Purview/accounts",
      resourceName: name,
      armProviderSegments: ["Microsoft.Purview", "accounts", name],
      dimensions: { Collection: rand(["root", "finance", "ops"]) },
      metrics: {
        ScanCount: counter(randInt(10, fail ? 8_200 : 12_400)),
        DataMapStorageCapacity: stat(
          dp(jitter(2.2e12 + (fail ? 0.4e12 : 0), 0.5e12, 0.1e12, 12e12))
        ),
        ClassificationCount: counter(randInt(500, fail ? 42_000_000 : 58_000_000)),
      },
    });
  });
}

export function generateQueueStorageDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const accounts = ["stqprod", "stqevents", "stqjobs"];
  const n = Math.min(randInt(1, 3), accounts.length);
  const dataset = AZURE_METRICS_DATASET_MAP["queue-storage"]!;
  return Array.from({ length: n }, (_, i) => {
    const acct = `${accounts[i]}${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "queue_storage", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Storage/storageAccounts",
      resourceName: acct,
      armProviderSegments: [
        "Microsoft.Storage",
        "storageAccounts",
        acct,
        "queueServices",
        "default",
      ],
      dimensions: { QueueName: rand(["jobs", "deadletter", "ingest"]) },
      metrics: {
        Transactions: counter(randInt(1_000, fail ? 6_200_000 : 8_800_000)),
        QueueCapacity: stat(dp(jitter(1.2e9 + (fail ? 0.3e9 : 0), 0.4e9, 0, 12e9))),
        QueueCount: stat(dp(jitter(8 + (fail ? 4 : 0), 4, 0, 500))),
        QueueMessageCount: stat(dp(jitter(420_000 + (fail ? 180_000 : 0), 120_000, 0, 50_000_000))),
      },
    });
  });
}

export function generateRelayDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const namespaces = ["relay-api", "relay-events", "relay-legacy"];
  const n = Math.min(randInt(1, 3), namespaces.length);
  const dataset = AZURE_METRICS_DATASET_MAP.relay!;
  return Array.from({ length: n }, (_, i) => {
    const name = `${namespaces[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "relay", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Relay/namespaces",
      resourceName: name,
      armProviderSegments: ["Microsoft.Relay", "namespaces", name],
      dimensions: { EntityPath: rand(["orders", "notifications", "telemetry"]) },
      metrics: {
        ActiveConnections: stat(dp(jitter(120 + (fail ? 80 : 0), 60, 0, 20_000))),
        ListenerConnections: counter(randInt(10, fail ? 42_000 : 62_000)),
        BytesTransferred: counter(randInt(500_000, fail ? 48_000_000_000 : 32_000_000_000)),
      },
    });
  });
}

export function generateResourceGraphDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const queries = ["inventory-base", "policy-audit", "cost-tags"];
  const n = Math.min(randInt(1, 3), queries.length);
  const dataset = AZURE_METRICS_DATASET_MAP["resource-graph"]!;
  return Array.from({ length: n }, (_, i) => {
    const name = `arg-${queries[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "resource_graph", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.ResourceGraph/queries",
      resourceName: name,
      armProviderSegments: ["Microsoft.ResourceGraph", "queries", name],
      dimensions: { Scope: rand(["subscription", "managementGroup", "tenant"]) },
      metrics: {
        QueryCount: counter(randInt(200, fail ? 2_200_000 : 1_600_000)),
        ThrottledRequests: counter(fail ? randInt(20, 18_000) : randInt(0, 400)),
        TotalResourceChanges: counter(randInt(1_000, fail ? 180_000_000 : 240_000_000)),
      },
    });
  });
}
