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

/** Independent stress primitives driven by generator error-rate `er`. */
function inferStress(er: number) {
  const stressed = Math.random() < er;
  const throttled = Math.random() < er * 0.3;
  const degraded = Math.random() < er * 0.5;
  return { stressed, throttled, degraded };
}

export function generateAiFoundryDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const ctx = inferStress(er);
  const { region, subscription, resourceGroup } = pickAzureContext();
  const hub = `hub-ai-core-${randId(5).toLowerCase()}`;
  const dataset = AZURE_METRICS_DATASET_MAP["ai-foundry"]!;
  const mk = (
    dims: Record<string, string>,
    metrics: Record<string, Record<string, number>>
  ): EcsDocument =>
    azureMetricDoc(ts, "ai_foundry", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.MachineLearningServices/workspaces",
      resourceName: hub,
      armProviderSegments: ["Microsoft.MachineLearningServices", "workspaces", hub],
      dimensions: dims,
      metrics,
    });
  return [
    mk(
      { OperationCategory: "ModelCatalog", ResultCode: rand(["Succeeded", "Failed"]) },
      {
        ModelDeploymentCount: stat(dp(jitter(8 + (ctx.stressed ? -3 : 2), 4, 0, 92))),
        OnlineEndpointResponseTime: stat(
          dp(jitter(ctx.throttled ? 840 : 180, ctx.degraded ? 220 : 60, 8, 12_000))
        ),
      }
    ),
    mk(
      { InferenceRoute: rand(["chat-completions", "embeddings"]), Region: region },
      {
        TotalInferenceRequests: counter(randInt(5000, ctx.throttled ? 920_000 : 620_000)),
        ThrottledInferenceRequests: counter(ctx.throttled ? randInt(200, 18_000) : randInt(0, 80)),
      }
    ),
    mk(
      { BatchJobState: rand(["Running", "Completed"]), SkuTier: rand(["Standard", "Provisioned"]) },
      {
        BatchInferenceThroughput: counter(randInt(800, ctx.stressed ? 180_000 : 220_000)),
      }
    ),
    mk(
      { FineTunePhase: rand(["FineTuning", "Deployment"]), GpuVmFamily: rand(["NCv3", "NDv5"]) },
      {
        GpuMemoryUsagePercent: stat(dp(jitter(42 + (ctx.degraded ? 42 : 0), 28, 0, 99))),
      }
    ),
    mk(
      { EndpointHealthProbe: rand(["Ready", "Degraded"]), HttpStatusBucket: rand(["2xx", "5xx"]) },
      {
        EndpointAvailabilityPercent: stat(
          dp(jitter(ctx.degraded ? 88 : 99.9, ctx.stressed ? 8 : 0.06, 0, 100))
        ),
      }
    ),
  ];
}

export function generateDataExplorerDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const ctx = inferStress(er);
  const { region, subscription, resourceGroup } = pickAzureContext();
  const cluster = `adx-security-${randId(4).toLowerCase()}`;
  const dataset = AZURE_METRICS_DATASET_MAP["data-explorer"]!;
  const mk = (
    dims: Record<string, string>,
    metrics: Record<string, Record<string, number>>
  ): EcsDocument =>
    azureMetricDoc(ts, "data_explorer", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Kusto/clusters",
      resourceName: cluster,
      armProviderSegments: ["Microsoft.Kusto", "clusters", cluster],
      dimensions: dims,
      metrics,
    });
  return [
    mk(
      { Database: rand(["telemetry", "finance"]), Role: rand(["Leader", "Data"]) },
      {
        QueryDuration: stat(dp(jitter(ctx.stressed ? 620 : 140, ctx.degraded ? 280 : 90, 5, 9000))),
        CPUUsagePercent: stat(dp(jitter(48 + (ctx.degraded ? 38 : 0), 26, 0, 100))),
      }
    ),
    mk(
      { TableKind: rand(["Storm", "Ingest"]), IngestSource: "blob" },
      {
        IngestionLatencyInSeconds: stat(
          dp(jitter(ctx.throttled ? 95 : 22, ctx.stressed ? 55 : 18, 2, 600))
        ),
        IngestionBlobDroppedCount: counter(ctx.stressed ? randInt(0, 12_000) : randInt(0, 80)),
      }
    ),
    mk(
      { Database: "streaming", ShardId: randId(4).toUpperCase() },
      {
        StreamingIngestLatencyInSeconds: stat(
          dp(jitter(ctx.throttled ? 420 : 18, ctx.degraded ? 120 : 8, 1, 800))
        ),
        IngestionResult: counter(ctx.throttled ? randInt(200, 80_000) : randInt(2000, 180_000)),
      }
    ),
    mk(
      { MaterializedView: `mv_${randId(6)}`, State: rand(["Refreshing", "Ready"]) },
      {
        MaterializedViewRebuildDurationSeconds: stat(
          dp(jitter(ctx.degraded ? 820 : 95, ctx.stressed ? 420 : 40, 2, 12_600))
        ),
      }
    ),
    mk(
      { Topology: "follower_cluster", ReplicationRole: "Follower" },
      {
        FollowerLagInSeconds: stat(
          dp(jitter(ctx.throttled ? 280 : 12, ctx.degraded ? 180 : 5, 0, 9200))
        ),
        ReplicationHealth: stat(
          dp(jitter(ctx.degraded ? 0.72 : 0.995, ctx.stressed ? 0.2 : 0.006, 0, 1))
        ),
      }
    ),
  ];
}

export function generateVirtualDesktopDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const ctx = inferStress(er);
  const { region, subscription, resourceGroup } = pickAzureContext();
  const pool = `hp-fin-${randId(4).toLowerCase()}`;
  const dataset = AZURE_METRICS_DATASET_MAP["virtual-desktop"]!;
  const mk = (
    dims: Record<string, string>,
    metrics: Record<string, Record<string, number>>
  ): EcsDocument =>
    azureMetricDoc(ts, "virtual_desktop", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.DesktopVirtualization/hostpools",
      resourceName: pool,
      armProviderSegments: ["Microsoft.DesktopVirtualization", "hostpools", pool],
      dimensions: dims,
      metrics,
    });
  return [
    mk(
      { SessionPhase: rand(["broker", "logon"]), ResultCode: rand(["Succeeded", "Failed"]) },
      {
        ConnectionRoundTripTimeMs: stat(
          dp(jitter(ctx.throttled ? 520 : 190, ctx.degraded ? 220 : 70, 10, 9000))
        ),
      }
    ),
    mk(
      { SessionHostHealth: rand(["Available", "NeedsAssistance"]) },
      {
        SessionHostAvailabilityPercentage: stat(
          dp(jitter(ctx.degraded ? 72 : 96, ctx.stressed ? 22 : 4, 0, 100))
        ),
      }
    ),
    mk(
      { ScalingPlanMode: rand(["Peak", "OffPeak"]), HostPoolSKU: rand(["Heavy", "Light"]) },
      {
        HostPoolCapacityPercentage: stat(dp(jitter(82 + (ctx.degraded ? -28 : 0), 28, 0, 128))),
      }
    ),
    mk(
      { DiagnosticCategory: rand(["Diagnostics", "HostAgent"]), Severity: rand(["Warn", "Info"]) },
      {
        AzureVirtualDesktopOutboundBytes: counter(randInt(200_000, ctx.throttled ? 18e6 : 9e6)),
        AzureVirtualDesktopAgentErrorsTotal: counter(
          ctx.throttled ? randInt(4, 12_000) : randInt(0, 80)
        ),
      }
    ),
    mk(
      { ApplicationGroupType: rand(["Desktop", "RemoteApp"]), AssignedUsersBucket: ">100" },
      {
        ActiveSessionsTotal: counter(
          randInt(40, ctx.stressed ? 1800 + randInt(0, 520) : 900 + randInt(0, 380))
        ),
      }
    ),
  ];
}

export function generateElasticSanDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const ctx = inferStress(er);
  const { region, subscription, resourceGroup } = pickAzureContext();
  const san = `esan-shared-${randId(4).toLowerCase()}`;
  const dataset = AZURE_METRICS_DATASET_MAP["elastic-san"]!;
  const mk = (
    dims: Record<string, string>,
    metrics: Record<string, Record<string, number>>
  ): EcsDocument =>
    azureMetricDoc(ts, "elastic_san", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.ElasticSan/elasticSans",
      resourceName: san,
      armProviderSegments: ["Microsoft.ElasticSan", "elasticSans", san],
      dimensions: dims,
      metrics,
    });
  return [
    mk(
      { VolumeTier: rand(["Premium", "Standard"]), LunId: String(randInt(0, 6)) },
      {
        VolumeIOPSConsumptionPercentage: stat(dp(jitter(54 + (ctx.degraded ? 38 : 0), 26, 0, 100))),
      }
    ),
    mk(
      { IOPSType: rand(["Read", "Write"]), OperationLatencyBucket: ">100ms" },
      {
        ElasticSanIOPSThroughputAverage: counter(randInt(9000, ctx.throttled ? 240_000 : 920_000)),
        ElasticSanIOLatencyMs: stat(
          dp(jitter(ctx.degraded ? 320 : 18, ctx.throttled ? 260 : 8, 0, 9800))
        ),
      }
    ),
    mk(
      { SnapshotPolicy: rand(["Incremental", "AdHoc"]), Result: rand(["Succeeded", "Failed"]) },
      {
        VolumeSnapshotProvisionedTiBCount: stat(
          dp(jitter(42 + (ctx.stressed ? 12 : -4), 18, 0, 820))
        ),
      }
    ),
    mk(
      { SkuTier: rand(["Premium_LRS", "Standard_LRS"]), Operation: "tier_change" },
      {
        ElasticSansHealthPercentage: stat(
          dp(jitter(ctx.degraded ? 0.74 : 0.998, ctx.stressed ? 0.26 : 0.0025, 0, 1))
        ),
        ElasticSanThroughputLimitPercent: stat(
          dp(jitter(41 + (ctx.throttled ? 46 : -4), 22, 0, 102))
        ),
      }
    ),
    mk(
      { NetworkAclAction: rand(["Deny", "Allow"]), Namespace: region },
      {
        ProvisionedElasticSanVolumesCount: counter(randInt(4, ctx.stressed ? 120 : 80)),
      }
    ),
  ];
}

export function generateManagedGrafanaDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const ctx = inferStress(er);
  const { region, subscription, resourceGroup } = pickAzureContext();
  const inst = `amg-platform-${randId(4).toLowerCase()}`;
  const dataset = AZURE_METRICS_DATASET_MAP["managed-grafana"]!;
  const mk = (
    dims: Record<string, string>,
    metrics: Record<string, Record<string, number>>
  ): EcsDocument =>
    azureMetricDoc(ts, "managed_grafana", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Dashboard/grafana",
      resourceName: inst,
      armProviderSegments: ["Microsoft.Dashboard", "grafana", inst],
      dimensions: dims,
      metrics,
    });
  return [
    mk(
      { HttpRouting: rand(["/api/query", "/api/ds"]), HttpStatusBucket: rand(["429", "5xx"]) },
      {
        GrafanaHttpRequestsReceived: counter(randInt(8000, ctx.throttled ? 920_000 : 620_000)),
        GrafanaAverageRequestLatency: stat(
          dp(jitter(ctx.throttled ? 940 : 85, ctx.degraded ? 360 : 40, 2, 12_600))
        ),
      }
    ),
    mk(
      { PluginSource: rand(["catalog", "private"]), Lifecycle: rand(["install", "rollback"]) },
      {
        GrafanaPluginInstallFailures: counter(ctx.throttled ? randInt(2, 800) : randInt(0, 12)),
      }
    ),
    mk(
      { DataSourceUid: randId(10).toLowerCase(), ProbeResult: rand(["OK", "Fail"]) },
      {
        GrafanaDataSourceLatencyMs: stat(
          dp(jitter(ctx.throttled ? 5200 : 120, ctx.stressed ? 2400 : 45, 0, 65000))
        ),
      }
    ),
    mk(
      { OrgId: rand(["1", "2"]), TeamSyncStatus: rand(["synced", "drift"]) },
      {
        GrafanaActiveUsers: counter(randInt(12, ctx.stressed ? 1200 : 800)),
        GrafanaTeamSyncLagSeconds: stat(
          dp(jitter(ctx.degraded ? 840 : 20, ctx.stressed ? 400 : 8, 0, 9100))
        ),
      }
    ),
    mk(
      { DashboardFolder: rand(["SRE", "Security"]), GrafanaVersionMajor: rand(["10", "11"]) },
      {
        GrafanaRenderingErrorsTotal: counter(ctx.degraded ? randInt(5, 1200) : randInt(0, 180)),
      }
    ),
  ];
}

export function generateManagedPrometheusDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const ctx = inferStress(er);
  const { region, subscription, resourceGroup } = pickAzureContext();
  const ws = `amw-prod-${randId(4).toLowerCase()}`;
  const dataset = AZURE_METRICS_DATASET_MAP["managed-prometheus"]!;
  const mk = (
    dims: Record<string, string>,
    metrics: Record<string, Record<string, number>>
  ): EcsDocument =>
    azureMetricDoc(ts, "managed_prometheus", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Monitor/accounts",
      resourceName: ws,
      armProviderSegments: ["Microsoft.Monitor", "accounts", ws],
      dimensions: dims,
      metrics,
    });
  return [
    mk(
      { RemoteWriteTenant: rand(["aks-prod", "aks-dev"]), Shard: rand(["A", "B"]) },
      {
        MetricSamplesDroppedCount: counter(randInt(100, ctx.throttled ? 920_000 : 620_000)),
        ActiveTimeSeriesSamplesIngestRate: counter(
          randInt(450_000, ctx.stressed ? 8_200_000 : 6_700_000)
        ),
      }
    ),
    mk(
      { QueryEngine: rand(["distributed", "local"]), Complexity: rand(["low", "high"]) },
      {
        QueryDurationMilliseconds: stat(
          dp(jitter(ctx.stressed ? 12_500 : 420, ctx.degraded ? 7600 : 180, 1, 120_000))
        ),
      }
    ),
    mk(
      {
        KubernetesClusterPrefix: rand(["west", "central"]),
        ScrapeResult: rand(["success", "error"]),
      },
      {
        ScrapeFailuresCount: counter(ctx.throttled ? randInt(80, 12_800) : randInt(0, 920)),
      }
    ),
    mk(
      {
        PrometheusRuleFamily: rand(["kubernetes", "alloy"]),
        EvalStatus: rand(["ok", "error"]),
      },
      {
        AlertmanagerNotificationsFailedTotal: counter(
          ctx.degraded ? randInt(120, 18_800) : randInt(0, 320)
        ),
      }
    ),
    mk(
      {
        FederatedUpstream: rand(["peer-west", "peer-east"]),
        SamplesDirection: "ingress",
      },
      {
        AzureMonitorWorkspaceVolumeUsagePercentage: stat(
          dp(jitter(ctx.stressed ? 89 : 58, ctx.degraded ? 28 : 12, 0, 103))
        ),
        FederatedQueriesFailedCount: counter(
          ctx.throttled ? randInt(200, 12_600) : randInt(5, 400)
        ),
      }
    ),
  ];
}

export function generateDnsPrivateResolverDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const ctx = inferStress(er);
  const { region, subscription, resourceGroup } = pickAzureContext();
  const resolver = `pvdns-shared-${randId(4).toLowerCase()}`;
  const dataset = AZURE_METRICS_DATASET_MAP["dns-private-resolver"]!;
  const mk = (
    dims: Record<string, string>,
    metrics: Record<string, Record<string, number>>
  ): EcsDocument =>
    azureMetricDoc(ts, "dns_private_resolver", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Network/dnsResolvers",
      resourceName: resolver,
      armProviderSegments: ["Microsoft.Network", "dnsResolvers", resolver],
      dimensions: dims,
      metrics,
    });
  return [
    mk(
      {
        EndpointType: rand(["Inbound", "Outbound"]),
        ResponseCodeBucket: rand(["NOERROR", "NXDOMAIN"]),
      },
      {
        DNSQueryInboundCountPerSecondAverage: counter(randInt(5000, ctx.throttled ? 42e6 : 28e6)),
        DNSQueryOutboundForwardedCountTotal: counter(randInt(900, ctx.stressed ? 18e6 : 14e6)),
      }
    ),
    mk(
      { RulesetTier: rand(["corp", "shared"]), DnsPolicyAction: rand(["Forward", "Block"]) },
      {
        DNSResolverForwardedQueryFailuresCountTotal: counter(
          ctx.throttled ? randInt(800, 920_800) : randInt(5, 200_020)
        ),
      }
    ),
    mk(
      { VNetLinkState: rand(["Succeeded", "Failed"]), LinkName: randId(6).toLowerCase() },
      {
        DnsResolverOutboundEndpointHealthPercentage: stat(
          dp(jitter(ctx.degraded ? 0.62 : 0.999, ctx.stressed ? 0.36 : 0.0018, 0, 1))
        ),
        DNSResolverIngressPacketDropCountTotal: counter(
          ctx.throttled ? randInt(420, 18_920) : randInt(0, 920)
        ),
      }
    ),
    mk(
      {
        SecurityInspection: rand(["on", "off"]),
        AttackSignature: rand(["none", "flood"]),
      },
      {
        DnsResolverOutboundEndpointHealthFailureCount: counter(
          ctx.degraded ? randInt(420, 12_920) : randInt(0, 920)
        ),
      }
    ),
    mk(
      { RegionName: region, EndpointName: randId(5).toLowerCase() },
      {
        DnsResolverIngressPacketDropPercentage: stat(
          dp(jitter(ctx.throttled ? 4.8 : 0.02, ctx.stressed ? 2.8 : 0.012, 0, 92))
        ),
      }
    ),
  ];
}

export function generateApplicationInsightsDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const ctx = inferStress(er);
  const { region, subscription, resourceGroup } = pickAzureContext();
  const comp = `ai-worker-${randId(4).toLowerCase()}`;
  const dataset = AZURE_METRICS_DATASET_MAP["application-insights"]!;
  const mk = (
    dims: Record<string, string>,
    metrics: Record<string, Record<string, number>>
  ): EcsDocument =>
    azureMetricDoc(ts, "application_insights", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Insights/components",
      resourceName: comp,
      armProviderSegments: ["Microsoft.Insights", "components", comp],
      dimensions: dims,
      metrics,
    });
  return [
    mk(
      {
        TelemetryType: rand(["requests", "dependencies"]),
        ResultOutcome: rand(["Success", "Failed"]),
      },
      {
        RequestsRatePerSecondsAverage: counter(randInt(8200, ctx.throttled ? 42e6 : 31e6)),
        RequestsDurationMillisecondsAverage: stat(
          dp(jitter(ctx.throttled ? 820 : 120, ctx.degraded ? 420 : 40, 0, 9800))
        ),
      }
    ),
    mk(
      { CloudRoleInstance: rand(["web-001", "api-042"]), SdkVersionMajor: rand(["3", "4"]) },
      {
        ExceptionsCountAverage: counter(ctx.throttled ? randInt(200, 920_920) : randInt(4, 40_022)),
      }
    ),
    mk(
      { AvailabilityTestName: rand(["checkout", "auth"]), LocationId: rand(["eastus-probe"]) },
      {
        AvailabilityResultsAvailabilityPercentageAverage: stat(
          dp(jitter(ctx.degraded ? 92 : 99.6, ctx.stressed ? 6 : 0.35, 0, 101))
        ),
      }
    ),
    mk(
      { ProfilerStatus: rand(["capturing", "idle"]), SamplingMode: rand(["event", "time"]) },
      {
        ProcessCpuPercentageAverage: stat(
          dp(jitter(ctx.stressed ? 88 : 32, ctx.degraded ? 38 : 8, 0, 106))
        ),
      }
    ),
    mk(
      {
        SyntheticOperation: rand(["export", "workbook"]),
        WorkbookSku: rand(["free", "shared"]),
      },
      {
        ExportOperationsErrorsAverage: counter(
          ctx.degraded ? randInt(12, 12_092) : randInt(0, 102)
        ),
      }
    ),
  ];
}

export function generateDedicatedHsmDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const ctx = inferStress(er);
  const { region, subscription, resourceGroup } = pickAzureContext();
  const hsm = `hsm-shared-${randId(4).toLowerCase()}`;
  const dataset = AZURE_METRICS_DATASET_MAP["dedicated-hsm"]!;
  const mk = (
    dims: Record<string, string>,
    metrics: Record<string, Record<string, number>>
  ): EcsDocument =>
    azureMetricDoc(ts, "dedicated_hsm", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.HardwareSecurityModules/dedicatedHSMs",
      resourceName: hsm,
      armProviderSegments: ["Microsoft.HardwareSecurityModules", "dedicatedHSMs", hsm],
      dimensions: dims,
      metrics,
    });
  return [
    mk(
      { CryptoMechanism: rand(["RSA-sign", "ECDH"]), ModuleState: "operational" },
      {
        DedicatedHSMKeysActiveCountAverage: counter(randInt(820, ctx.stressed ? 12_082 : 8_082)),
        DedicatedHsmsThroughputOperationsPerSecondAverage: stat(
          dp(jitter(ctx.degraded ? 420 : 6200, ctx.throttled ? 3800 : 2100, 0, 50_992))
        ),
      }
    ),
    mk(
      {
        NetworkNeighbor: rand(["subnet-a", "subnet-b"]),
        PathHealth: rand(["Healthy", "Degraded"]),
      },
      {
        DedicatedHSMPacketLossPercentage: stat(
          dp(jitter(ctx.degraded ? 18 : 0.62, ctx.stressed ? 22 : 0.35, 0, 100))
        ),
      }
    ),
    mk(
      { BackupTier: rand(["tier1", "tier2"]), VerifyStatus: rand(["pass", "fail"]) },
      {
        DedicatedHSMBackupThroughputBytesPerSecondAverage: counter(
          randInt(920_920, ctx.throttled ? 12_092_082 : 8_929_928)
        ),
      }
    ),
    mk(
      { RbacScope: rand(["crypto-user", "admin"]), Enforcement: rand(["strict", "balanced"]) },
      {
        DedicatedHsmsProvisioningStateHealthPercentAverage: stat(
          dp(jitter(ctx.degraded ? 0.74 : 0.9999, ctx.stressed ? 0.26 : 0.002, 0, 1))
        ),
      }
    ),
    mk(
      { FirmwareTrain: rand(["stable", "canary"]), RebootImpact: rand(["planned", "none"]) },
      {
        DedicatedHsmOperationalMemoryUsagePercentAverage: stat(
          dp(jitter(ctx.stressed ? 72 : 38, ctx.degraded ? 28 : 26, 0, 112))
        ),
      }
    ),
  ];
}

export function generateVideoIndexerDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const ctx = inferStress(er);
  const { region, subscription, resourceGroup } = pickAzureContext();
  const acct = `vi-media-${randId(4).toLowerCase()}`;
  const dataset = AZURE_METRICS_DATASET_MAP["video-indexer"]!;
  const mk = (
    dims: Record<string, string>,
    metrics: Record<string, Record<string, number>>
  ): EcsDocument =>
    azureMetricDoc(ts, "video_indexer", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.VideoIndexer/accounts",
      resourceName: acct,
      armProviderSegments: ["Microsoft.VideoIndexer", "accounts", acct],
      dimensions: dims,
      metrics,
    });
  return [
    mk(
      {
        StreamingProtocol: rand(["HLS", "DASH"]),
        BitrateBracket: rand(["low", "high"]),
        RegionSuffix: rand([region.slice(0, Math.min(region.length, 8))]),
      },
      {
        LiveStreamDroppedFragementsCountSum: counter(
          ctx.throttled ? randInt(120, 12_098) : randInt(0, 902)
        ),
        IndexedOutputMinutesCountTotalCounter: counter(randInt(1200, ctx.stressed ? 880e3 : 720e3)),
      }
    ),
    mk(
      {
        TranscriptionQuality: rand(["Basic", "Standard"]),
        LanguageBucket: rand(["en", "es"]),
      },
      {
        VideoIndexerIndexingJobDurationMillisecondsAverage: stat(
          dp(jitter(ctx.degraded ? 420_098 : 95_098, ctx.throttled ? 180_098 : 18_098, 1, 910_982))
        ),
      }
    ),
    mk(
      {
        WebhookStatusCode: rand(["200", "500"]),
        RetryStage: rand(["initial", "exhaust"]),
      },
      {
        VideoIndexerIndexingSuccessCountSum: counter(randInt(400, ctx.degraded ? 92e3 : 118e3)),
        VideoIndexingFailedEventsCountSum: counter(
          ctx.throttled ? randInt(120, 18e3) : randInt(0, 442)
        ),
      }
    ),
    mk(
      { InsightType: rand(["topics", "faces"]), InferenceBackend: rand(["gpu", "cpu"]) },
      {
        VideoIndexingDurationSecondsTotal: counter(randInt(902, ctx.stressed ? 180_982 : 95_982)),
      }
    ),
    mk(
      {
        WorkflowKind: rand(["UploadAndIndex", "LiveArchive"]),
        QoSClass: rand(["gold", "bronze"]),
      },
      {
        VideosProcessedCountAverage: counter(
          randInt(80, ctx.degraded ? 1800 + randInt(0, 400) : 2800 + randInt(0, 920))
        ),
      }
    ),
  ];
}
