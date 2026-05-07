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

const CDN_METRICS_DATASET = AZURE_METRICS_DATASET_MAP.cdn ?? "azure.cdn_metrics";

export function generateActivityLogDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP["activity-log"]!;
  const alerts = ["sub-activity", "audit-critical", "policy-changes"];
  const n = Math.min(randInt(1, 3), alerts.length);
  return Array.from({ length: n }, (_, i) => {
    const name = `${alerts[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "activity_log", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Insights/activityLogAlerts",
      resourceName: name,
      armProviderSegments: ["Microsoft.Insights", "activityLogAlerts", name],
      dimensions: {
        AlertName: name,
        Category: rand(["Administrative", "Security", "Policy", "ResourceHealth"]),
      },
      metrics: {
        ActivityLogEventCount: counter(randInt(200, fail ? 800_000 : 400_000)),
        OperationCount: counter(randInt(100, fail ? 400_000 : 220_000)),
      },
    });
  });
}

export function generateAdvisorDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP.advisor!;
  const categories = ["Cost", "Security", "Reliability", "OperationalExcellence", "Performance"];
  const n = Math.min(randInt(1, 3), categories.length);
  return Array.from({ length: n }, (_, i) => {
    const cat = categories[i]!;
    const recId = `rec-${cat.toLowerCase()}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "advisor", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Advisor/recommendations",
      resourceName: recId,
      armProviderSegments: ["Microsoft.Advisor", "recommendations", recId],
      dimensions: { Category: cat, Impact: rand(["High", "Medium", "Low"]) },
      metrics: {
        RecommendationCount: counter(randInt(5, fail ? 2_000 : 400)),
        ActiveRecommendations: counter(randInt(3, fail ? 1_500 : 320)),
      },
    });
  });
}

export function generateAnalysisServicesDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP["analysis-services"]!;
  const models = ["sales-model", "finance-tab", "ops-semantic"];
  const n = Math.min(randInt(1, 3), models.length);
  return Array.from({ length: n }, (_, i) => {
    const model = models[i]!;
    const srv = `aas-${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "analysis_services", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.AnalysisServices/servers",
      resourceName: srv,
      armProviderSegments: ["Microsoft.AnalysisServices", "servers", srv],
      dimensions: { ModelName: model, ServerName: srv },
      metrics: {
        QueryPoolJobQueueLength: stat(dp(jitter(2 + (fail ? 18 : 0), 3, 0, 100))),
        ProcessingPoolJobQueueLength: stat(dp(jitter(1 + (fail ? 12 : 0), 2, 0, 80))),
        CurrentUserSessions: counter(randInt(2, fail ? 800 : 420)),
      },
    });
  });
}

export function generateAppConfigurationDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP["app-configuration"]!;
  const stores = ["appcfg-prod", "appcfg-shared", "flags-team-a"];
  const n = Math.min(randInt(1, 3), stores.length);
  return Array.from({ length: n }, (_, i) => {
    const store = `${stores[i]}-${randId(3).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "app_configuration", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.AppConfiguration/configurationStores",
      resourceName: store,
      armProviderSegments: ["Microsoft.AppConfiguration", "configurationStores", store],
      dimensions: { Endpoint: `${store}.azconfig.io`, Replica: rand(["primary", "secondary"]) },
      metrics: {
        HttpIncomingRequestCount: counter(randInt(500, fail ? 2_800_000 : 1_900_000)),
        ThrottledHttpRequestCount: counter(fail ? randInt(10, 25_000) : randInt(0, 400)),
        HttpIncomingRequestDuration: stat(dp(jitter(18 + (fail ? 180 : 0), 14, 1, 8_000))),
      },
    });
  });
}

export function generateAutomationAccountDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP["automation-account"]!;
  const accounts = ["auto-prod", "auto-shared", "auto-governance"];
  const n = Math.min(randInt(1, 3), accounts.length);
  return Array.from({ length: n }, (_, i) => {
    const acct = `${accounts[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "automation_account", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Automation/automationAccounts",
      resourceName: acct,
      armProviderSegments: ["Microsoft.Automation", "automationAccounts", acct],
      dimensions: { Runbook: rand(["patch-cycle", "disk-cleanup", "tag-enforce"]) },
      metrics: {
        TotalJob: counter(randInt(20, fail ? 80_000 : 45_000)),
        TotalUpdateDeploymentRuns: counter(randInt(0, fail ? 12_000 : 8_000)),
        TotalUpdateDeploymentMachineRuns: counter(randInt(0, fail ? 180_000 : 120_000)),
      },
    });
  });
}

export function generateBackupDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP.backup!;
  const vaults = ["rsv-prod", "rsv-dr", "rsv-archive"];
  const n = Math.min(randInt(1, 3), vaults.length);
  return Array.from({ length: n }, (_, i) => {
    const vault = `${vaults[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "backup", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.RecoveryServices/vaults",
      resourceName: vault,
      armProviderSegments: ["Microsoft.RecoveryServices", "vaults", vault],
      dimensions: { BackupTier: rand(["Azure", "Archive"]), VaultName: vault },
      metrics: {
        BackupHealthEvents: counter(fail ? randInt(1, 400) : randInt(0, 25)),
        RestoreHealthEvents: counter(fail ? randInt(1, 120) : randInt(0, 12)),
        BackupItemsCount: counter(randInt(12, fail ? 18_000 : 12_000)),
      },
    });
  });
}

export function generateBlueprintsDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP.blueprints!;
  const assigns = ["landing-zone", "sox-baseline", "pci-scope"];
  const n = Math.min(randInt(1, 3), assigns.length);
  return Array.from({ length: n }, (_, i) => {
    const assign = `bp-${assigns[i]}-${randId(3).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "blueprints", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Blueprint/blueprintAssignments",
      resourceName: assign,
      armProviderSegments: ["Microsoft.Blueprint", "blueprintAssignments", assign],
      dimensions: { BlueprintName: assigns[i]!, AssignmentName: assign },
      metrics: {
        AssignmentCount: counter(randInt(1, fail ? 120 : 80)),
        CompliancePercentage: stat(dp(jitter(fail ? 72 : 96, fail ? 18 : 3, 0, 100))),
      },
    });
  });
}

export function generateBotServiceDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP["bot-service"]!;
  const bots = ["support-bot", "sales-bot", "internal-hr"];
  const n = Math.min(randInt(1, 3), bots.length);
  return Array.from({ length: n }, (_, i) => {
    const bot = `bot-${bots[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "bot_service", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.BotService/botServices",
      resourceName: bot,
      armProviderSegments: ["Microsoft.BotService", "botServices", bot],
      dimensions: { Channel: rand(["DirectLine", "Teams", "WebChat"]) },
      metrics: {
        RequestsTraffic: counter(randInt(100, fail ? 4_000_000 : 2_600_000)),
        RequestLatency: stat(dp(jitter(85 + (fail ? 650 : 0), 60, 5, 30_000))),
        ResponseStatusCode4xx: counter(fail ? randInt(20, 120_000) : randInt(0, 4_000)),
      },
    });
  });
}

export function generateCdnDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = CDN_METRICS_DATASET;
  const profiles = ["cdn-app", "cdn-static", "cdn-api"];
  const n = Math.min(randInt(1, 3), profiles.length);
  return Array.from({ length: n }, (_, i) => {
    const prof = `${profiles[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "cdn", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Cdn/profiles",
      resourceName: prof,
      armProviderSegments: ["Microsoft.Cdn", "profiles", prof],
      dimensions: {
        EndpointName: `ep-${rand(["www", "api", "assets"])}-${randId(3).toLowerCase()}`,
        ProfileName: prof,
      },
      metrics: {
        RequestCount: counter(randInt(1_000, fail ? 42_000_000 : 28_000_000)),
        BytesSent: counter(randInt(80_000_000, fail ? 900_000_000_000 : 620_000_000_000)),
        OriginHealthPercentage: stat(dp(jitter(fail ? 82 : 99.2, fail ? 14 : 0.4, 0, 100))),
        TotalLatency: stat(dp(jitter(38 + (fail ? 220 : 0), 28, 2, 12_000))),
      },
    });
  });
}

export function generateCognitiveServicesDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP["cognitive-services"]!;
  const apis = ["vision", "speech", "language"];
  const n = Math.min(randInt(1, 3), apis.length);
  return Array.from({ length: n }, (_, i) => {
    const api = apis[i]!;
    const acct = `cog-${api}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "cognitive_services", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.CognitiveServices/accounts",
      resourceName: acct,
      armProviderSegments: ["Microsoft.CognitiveServices", "accounts", acct],
      dimensions: { ApiName: api, ApiType: "REST" },
      metrics: {
        TotalCalls: counter(randInt(200, fail ? 8_000_000 : 5_200_000)),
        TotalErrors: counter(fail ? randInt(40, 180_000) : randInt(0, 6_000)),
        SuccessfulCalls: counter(randInt(180, fail ? 7_800_000 : 5_100_000)),
        Latency: stat(dp(jitter(120 + (fail ? 800 : 0), 90, 10, 45_000))),
        TotalTokens: counter(randInt(0, fail ? 420_000_000 : 280_000_000)),
      },
    });
  });
}

export function generateCommunicationServicesDedicatedMetrics(
  ts: string,
  er: number
): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP["communication-services"]!;
  const acs = ["acs-prod", "acs-support", "acs-marketing"];
  const n = Math.min(randInt(1, 3), acs.length);
  return Array.from({ length: n }, (_, i) => {
    const name = `${acs[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(
      ts,
      "communication_services",
      dataset,
      region,
      subscription,
      resourceGroup,
      {
        namespace: "Microsoft.Communication/communicationServices",
        resourceName: name,
        armProviderSegments: ["Microsoft.Communication", "communicationServices", name],
        dimensions: { Operation: rand(["PSTN", "SMS", "Chat"]) },
        metrics: {
          CallCount: counter(randInt(10, fail ? 90_000 : 58_000)),
          MessagesSent: counter(randInt(100, fail ? 5_000_000 : 3_200_000)),
          MessagesDelivered: counter(randInt(80, fail ? 4_800_000 : 3_100_000)),
        },
      }
    );
  });
}

export function generateCostManagementDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP["cost-management"]!;
  const budgets = ["monthly-ops", "project-alpha", "department-it"];
  const n = Math.min(randInt(1, 3), budgets.length);
  return Array.from({ length: n }, (_, i) => {
    const b = `${budgets[i]}-${randId(3).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "cost_management", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Consumption/budgets",
      resourceName: b,
      armProviderSegments: ["Microsoft.Consumption", "budgets", b],
      dimensions: { BudgetName: b, Scope: rand(["subscription", "resourceGroup"]) },
      metrics: {
        ActualCost: stat(dp(jitter(48_000 + (fail ? 22_000 : 0), 12_000, 0, 500_000))),
        BudgetAmount: stat(dp(jitter(80_000, 10_000, 1_000, 2_000_000))),
        ForecastedCost: stat(dp(jitter(52_000 + (fail ? 35_000 : 0), 15_000, 0, 600_000))),
      },
    });
  });
}

export function generateDataBoxDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP["data-box"]!;
  const jobs = ["dbx-migration-1", "dbx-seed-dc2", "dbx-archive"];
  const n = Math.min(randInt(1, 3), jobs.length);
  return Array.from({ length: n }, (_, i) => {
    const job = `${jobs[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "data_box", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.DataBox/jobs",
      resourceName: job,
      armProviderSegments: ["Microsoft.DataBox", "jobs", job],
      dimensions: {
        JobType: rand(["DataBox", "DataBoxHeavy", "DataBoxDisk"]),
        Stage: rand(["Copy", "Shipped"]),
      },
      metrics: {
        BytesCopied: counter(
          randInt(1_000_000_000, fail ? 80_000_000_000_000 : 55_000_000_000_000)
        ),
        CopySpeed: stat(dp(jitter(220 + (fail ? 80 : 0), 90, 1, 1_200))),
        OrderStatus: stat(dp(jitter(fail ? 3 : 1.5, 0.8, 0, 6))),
      },
    });
  });
}

export function generateDataFactoryDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP["data-factory"]!;
  const pipelines = ["ingest-raw", "curate-silver", "export-mart"];
  const n = Math.min(randInt(1, 3), pipelines.length);
  return Array.from({ length: n }, (_, i) => {
    const pipe = pipelines[i]!;
    const fac = `adf-${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "data_factory", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.DataFactory/factories",
      resourceName: fac,
      armProviderSegments: ["Microsoft.DataFactory", "factories", fac],
      dimensions: { Name: pipe, Pipeline: pipe },
      metrics: {
        PipelineSucceededRuns: counter(randInt(0, fail ? 4_200 : 5_000)),
        PipelineFailedRuns: counter(fail ? randInt(1, 450) : randInt(0, 18)),
        ActivitySucceededRuns: counter(randInt(0, fail ? 72_000 : 95_000)),
        IntegrationRuntimeCpuPercentage: stat(dp(jitter(38 + (fail ? 42 : 0), 28, 0, 100))),
      },
    });
  });
}

export function generateDatabaseForMariadbDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP["database-for-mariadb"]!;
  const servers = ["mariadb-app", "mariadb-report", "mariadb-cache"];
  const n = Math.min(randInt(1, 3), servers.length);
  return Array.from({ length: n }, (_, i) => {
    const srv = `${servers[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(
      ts,
      "database_for_mariadb",
      dataset,
      region,
      subscription,
      resourceGroup,
      {
        namespace: "Microsoft.DBforMariaDB/servers",
        resourceName: srv,
        armProviderSegments: ["Microsoft.DBforMariaDB", "servers", srv],
        dimensions: { ServerName: srv },
        metrics: {
          cpu_percent: stat(dp(jitter(34 + (fail ? 48 : 0), 26, 0, 100))),
          memory_percent: stat(dp(jitter(48 + (fail ? 28 : 0), 22, 0, 100))),
          io_consumption_percent: stat(dp(jitter(28 + (fail ? 45 : 0), 24, 0, 100))),
          storage_percent: stat(dp(jitter(42 + (fail ? 35 : 0), 28, 0, 100))),
          active_connections: counter(randInt(2, fail ? 3_200 : 2_000)),
        },
      }
    );
  });
}

export function generateDatabaseForMysqlDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP["database-for-mysql"]!;
  const servers = ["mysql-flex-1", "mysql-flex-2"];
  const n = Math.min(randInt(1, 2), servers.length);
  return Array.from({ length: n }, (_, i) => {
    const srv = `${servers[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "database_for_mysql", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.DBforMySQL/flexibleServers",
      resourceName: srv,
      armProviderSegments: ["Microsoft.DBforMySQL", "flexibleServers", srv],
      dimensions: { ServerName: srv },
      metrics: {
        cpu_percent: stat(dp(jitter(36 + (fail ? 46 : 0), 28, 0, 100))),
        memory_percent: stat(dp(jitter(50 + (fail ? 32 : 0), 24, 0, 100))),
        io_consumption_percent: stat(dp(jitter(30 + (fail ? 44 : 0), 22, 0, 100))),
        connections_failed: counter(fail ? randInt(2, 8_000) : randInt(0, 90)),
        active_connections: counter(randInt(4, fail ? 3_800 : 2_400)),
      },
    });
  });
}

export function generateDatabaseForPostgresqlDedicatedMetrics(
  ts: string,
  er: number
): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP["database-for-postgresql"]!;
  const servers = ["flex-pg-1", "flex-pg-2", "flex-pg-analytics"];
  const n = Math.min(randInt(1, 3), servers.length);
  return Array.from({ length: n }, (_, i) => {
    const srv = `${servers[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(
      ts,
      "database_for_postgresql",
      dataset,
      region,
      subscription,
      resourceGroup,
      {
        namespace: "Microsoft.DBforPostgreSQL/flexibleServers",
        resourceName: srv,
        armProviderSegments: ["Microsoft.DBforPostgreSQL", "flexibleServers", srv],
        dimensions: { ServerName: srv, DatabaseName: rand(["app", "analytics"]) },
        metrics: {
          cpu_percent: stat(dp(jitter(36 + (fail ? 44 : 0), 28, 0, 100))),
          memory_percent: stat(dp(jitter(52 + (fail ? 22 : 0), 24, 0, 100))),
          io_consumption_percent: stat(dp(jitter(32 + (fail ? 48 : 0), 26, 0, 100))),
          storage_percent: stat(dp(jitter(44 + (fail ? 30 : 0), 30, 0, 100))),
          active_connections: counter(randInt(2, fail ? 4_200 : 2_800)),
        },
      }
    );
  });
}

export function generateDeploymentEnvironmentsDedicatedMetrics(
  ts: string,
  er: number
): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP["deployment-environments"]!;
  const centers = ["devcenter-east", "devcenter-shared", "devcenter-poc"];
  const n = Math.min(randInt(1, 3), centers.length);
  return Array.from({ length: n }, (_, i) => {
    const dc = `${centers[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(
      ts,
      "deployment_environments",
      dataset,
      region,
      subscription,
      resourceGroup,
      {
        namespace: "Microsoft.DevCenter/devcenters",
        resourceName: dc,
        armProviderSegments: ["Microsoft.DevCenter", "devcenters", dc],
        dimensions: { DevCenter: dc, Project: rand(["payments", "web", "data"]) },
        metrics: {
          EnvironmentCount: counter(randInt(3, fail ? 2_400 : 1_600)),
          ProvisionCount: counter(randInt(1, fail ? 18_000 : 12_000)),
          ProvisionFailureCount: counter(fail ? randInt(8, 4_000) : randInt(0, 45)),
        },
      }
    );
  });
}

export function generateDevcenterDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP.devcenter!;
  const centers = ["dc-prod", "dc-eng", "dc-lab"];
  const n = Math.min(randInt(1, 3), centers.length);
  return Array.from({ length: n }, (_, i) => {
    const dc = `${centers[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "devcenter", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.DevCenter/devcenters",
      resourceName: dc,
      armProviderSegments: ["Microsoft.DevCenter", "devcenters", dc],
      dimensions: { DevCenterName: dc, NetworkConnection: rand(["subnet-a", "subnet-b"]) },
      metrics: {
        DevBoxCount: counter(randInt(4, fail ? 4_200 : 2_800)),
        ProjectCount: counter(randInt(1, fail ? 220 : 160)),
      },
    });
  });
}

export function generateDeviceProvisioningDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP["device-provisioning"]!;
  const hubs = ["dps-fleet-a", "dps-factory", "dps-lab"];
  const n = Math.min(randInt(1, 3), hubs.length);
  return Array.from({ length: n }, (_, i) => {
    const dps = `${hubs[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "device_provisioning", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Devices/provisioningServices",
      resourceName: dps,
      armProviderSegments: ["Microsoft.Devices", "provisioningServices", dps],
      dimensions: { AllocationPolicy: rand(["Hashed", "GeoLatency", "Static"]) },
      metrics: {
        AttestationAttempts: counter(randInt(20, fail ? 180_000 : 120_000)),
        DeviceAssignments: counter(randInt(10, fail ? 90_000 : 62_000)),
        RegistrationAttempts: counter(randInt(30, fail ? 240_000 : 160_000)),
      },
    });
  });
}

export function generateDigitalTwinsDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP["digital-twins"]!;
  const twins = ["twin-campus", "twin-factory", "twin-grid"];
  const n = Math.min(randInt(1, 3), twins.length);
  return Array.from({ length: n }, (_, i) => {
    const inst = `adt-${twins[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "digital_twins", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.DigitalTwins/digitalTwinsInstances",
      resourceName: inst,
      armProviderSegments: ["Microsoft.DigitalTwins", "digitalTwinsInstances", inst],
      dimensions: { ApiVersion: rand(["2022-10-31", "2023-01-31"]) },
      metrics: {
        ApiRequests: counter(randInt(200, fail ? 6_000_000 : 4_200_000)),
        ApiRequestsLatency: stat(dp(jitter(42 + (fail ? 280 : 0), 30, 2, 12_000))),
        Routing: counter(randInt(50, fail ? 800_000 : 520_000)),
        BilledApiOperations: counter(randInt(100, fail ? 5_000_000 : 3_400_000)),
      },
    });
  });
}

export function generateDocumentIntelligenceDedicatedMetrics(
  ts: string,
  er: number
): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP["document-intelligence"]!;
  const accounts = ["docintel-ocr", "docintel-id", "docintel-invoice"];
  const n = Math.min(randInt(1, 3), accounts.length);
  return Array.from({ length: n }, (_, i) => {
    const acct = `${accounts[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(
      ts,
      "document_intelligence",
      dataset,
      region,
      subscription,
      resourceGroup,
      {
        namespace: "Microsoft.CognitiveServices/accounts",
        resourceName: acct,
        armProviderSegments: ["Microsoft.CognitiveServices", "accounts", acct],
        dimensions: { Kind: "FormRecognizer", ApiName: rand(["analyze", "prebuilt-read"]) },
        metrics: {
          TotalTransactions: counter(randInt(50, fail ? 2_400_000 : 1_600_000)),
          ServerErrors: counter(fail ? randInt(5, 25_000) : randInt(0, 400)),
          SuccessfulCalls: counter(randInt(40, fail ? 2_300_000 : 1_580_000)),
        },
      }
    );
  });
}

export function generateFileStorageDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP["file-storage"]!;
  const accounts = ["stfiles", "stshared", "stuserhome"];
  const n = Math.min(randInt(1, 3), accounts.length);
  return Array.from({ length: n }, (_, i) => {
    const acct = `${accounts[i]}-${randId(4).toLowerCase()}`;
    const share = `share-${rand(["hr", "eng", "finance"])}-${randId(3).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "file_storage", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Storage/storageAccounts",
      resourceName: acct,
      armProviderSegments: [
        "Microsoft.Storage",
        "storageAccounts",
        acct,
        "fileServices",
        "default",
      ],
      dimensions: { FileShare: share, ApiName: rand(["CreateFile", "GetFile", "DeleteFile"]) },
      metrics: {
        Transactions: counter(randInt(100, fail ? 8_000_000 : 5_200_000)),
        FileCapacity: stat(dp(jitter(28e9 + (fail ? 6e9 : 0), 8e9, 1e9, 200e9))),
        FileShareCount: counter(randInt(1, fail ? 420 : 280)),
      },
    });
  });
}

export function generateHdinsightDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP.hdinsight!;
  const clusters = ["spark-prod", "kafka-edge", "hbase-telemetry"];
  const n = Math.min(randInt(1, 3), clusters.length);
  return Array.from({ length: n }, (_, i) => {
    const cl = `${clusters[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "hdinsight", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.HDInsight/clusters",
      resourceName: cl,
      armProviderSegments: ["Microsoft.HDInsight", "clusters", cl],
      dimensions: { Role: rand(["HeadNode", "WorkerNode", "Zookeeper"]) },
      metrics: {
        GatewayRequests: counter(randInt(200, fail ? 2_200_000 : 1_400_000)),
        CategorizedGatewayRequests: counter(randInt(100, fail ? 1_800_000 : 1_200_000)),
        NumActiveWorkers: counter(randInt(3, fail ? 180 : 120)),
      },
    });
  });
}

export function generateHpcCacheDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = AZURE_METRICS_DATASET_MAP["hpc-cache"]!;
  const caches = ["hpcc-nfs-east", "hpcc-lustre", "hpcc-burst"];
  const n = Math.min(randInt(1, 3), caches.length);
  return Array.from({ length: n }, (_, i) => {
    const c = `${caches[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "hpc_cache", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.StorageCache/caches",
      resourceName: c,
      armProviderSegments: ["Microsoft.StorageCache", "caches", c],
      dimensions: { CacheName: c, CacheNode: rand(["node-0", "node-1", "node-2"]) },
      metrics: {
        TotalRead: counter(randInt(80_000_000, fail ? 90_000_000_000_000 : 62_000_000_000_000)),
        TotalWrite: counter(randInt(40_000_000, fail ? 40_000_000_000_000 : 28_000_000_000_000)),
        CacheHitCount: counter(randInt(1_000, fail ? 42_000_000 : 28_000_000)),
        CacheMissCount: counter(randInt(100, fail ? 8_000_000 : 4_200_000)),
      },
    });
  });
}
