/**
 * Registry of Azure log generators (synthetic).
 */

import { AZURE_ELASTIC_DATASET_MAP } from "../data/elasticMaps.js";
import {
  generateVirtualMachinesLog,
  generateVmScaleSetsLog,
  generateBatchLog,
  generateAksLog,
} from "./compute.js";
import {
  generateContainerAppsLog,
  generateContainerInstancesLog,
  generateKubernetesFleetLog,
  generateAcrLog,
  generateStaticWebAppsLog,
  generateSpringAppsLog,
  generateDedicatedHostLog,
  generateCapacityReservationLog,
  generateProximityPlacementLog,
  generateComputeGalleryLog,
  generateConfidentialVmLog,
  generateImageBuilderLog,
  generateVmwareSolutionLog,
  generateOracleOnAzureLog,
  generateSapOnAzureLog,
} from "./computeExtended.js";
import {
  generateFileStorageLog,
  generateQueueStorageLog,
  generateTableStorageLog,
  generateDataLakeStorageLog,
  generateStorageSyncLog,
  generateNetappFilesLog,
  generateHpcCacheLog,
  generateSqlManagedInstanceLog,
  generateCacheForRedisLog,
  generateDatabaseForPostgresqlLog,
  generateDatabaseForMysqlLog,
  generateDatabaseForMariadbLog,
  generatePurviewLog,
  generateDataFactoryLog,
  generateStreamAnalyticsLog,
  generateDigitalTwinsLog,
  generateHdinsightLog,
  generateAnalysisServicesLog,
  generatePowerBiEmbeddedLog,
  generateMicrosoftFabricLog,
} from "./dataExtended.js";
import {
  generateCognitiveServicesLog,
  generateMachineLearningLog,
  generateAiSearchLog,
  generateBotServiceLog,
  generateVisionLog,
  generateSpeechLog,
  generateTranslatorLog,
  generateDocumentIntelligenceLog,
  generateManagedIdentityLog,
  generateDefenderForCloudLog,
  generateSentinelLog,
  generateAttestationLog,
  generateConfidentialLedgerLog,
  generateActivityLogLog,
  generateMonitorLog,
  generatePolicyLog,
  generateAdvisorLog,
  generateCostManagementLog,
  generateResourceGraphLog,
} from "./aiSecurityExtended.js";
import {
  generateVirtualNetworkLog,
  generateLoadBalancerLog,
  generateApplicationGatewayLog,
  generateAzureFirewallLog,
} from "./networking.js";
import {
  generateNetworkSecurityGroupsLog,
  generateNatGatewayLog,
  generatePrivateLinkLog,
  generatePrivateDnsLog,
  generateTrafficManagerLog,
  generateDdosProtectionLog,
  generateBastionLog,
  generateWafPolicyLog,
  generateVirtualWanLog,
  generateRouteServerLog,
  generateNetworkWatcherLog,
  generateVpnClientLog,
  generateFirewallPolicyLog,
  generateExpressRouteCircuitLog,
  generateExpressRouteGatewayLog,
} from "./networkingExtended.js";
import { generateBlobStorageLog } from "./storage.js";
import { generateSqlDatabaseLog, generateCosmosDbLog } from "./databases.js";
import {
  generateAppServiceLog,
  generateFunctionsLog,
  generateServiceBusLog,
  generateEventHubsLog,
  generateKeyVaultLog,
  generateEntraIdLog,
  generateM365Log,
} from "./platform.js";
import { generateOpenAiLog } from "./aiml.js";
import {
  generateAzureSecurityFindingChain,
  generateAzureCspmFindings,
  generateAzureKspmFindings,
  generateAzureIamPrivEscChain,
  generateAzureDataExfilChain,
} from "./securityChains.js";
import { generateAzureDataPipelineChain } from "./dataPipelineChain.js";
import { generateServiceNowCmdbLog } from "../../servicenow/generators/index.js";
import {
  generateIotHubLog,
  generateLogicAppsLog,
  generateApiManagementLog,
  generateEventGridLog,
  generateSynapseWorkspaceLog,
  generateDatabricksLog,
} from "./integration.js";
import {
  generateRelayLog,
  generateIotCentralLog,
  generateDeviceProvisioningLog,
  generateMediaServicesLog,
  generateCommunicationServicesLog,
  generateSignalRLog,
  generateNotificationHubsLog,
  generateAutomationAccountLog,
  generateAppConfigurationLog,
  generateDeploymentEnvironmentsLog,
  generateMapsLog,
  generateBackupLog,
  generateSiteRecoveryLog,
  generateMigrateLog,
  generateDataBoxLog,
  generateDevcenterLog,
  generateLabServicesLog,
  generateLoadTestingLog,
  generatePipelineLog,
} from "./integrationExtended.js";
import { mergeAzureLogVariants } from "./mergeHelpers.js";
import {
  generateFrontDoorLog,
  generateCdnLog,
  generateVpnGatewayLog,
  generateActiveUsersServicesLog,
  generateTeamsUserActivityLog,
  generateOutlookActivityLog,
  generateOnedriveUsageStorageLog,
  generateArcLog,
  generateStackLog,
  generateApiCenterLog,
} from "./miscExtended.js";
import {
  generateAiFoundryLog,
  generateApplicationInsightsLog,
  generateDataExplorerLog,
  generateDedicatedHsmLog,
  generateDnsPrivateResolverLog,
  generateElasticSanLog,
  generateManagedGrafanaLog,
  generateManagedPrometheusLog,
  generateVideoIndexerLog,
  generateVirtualDesktopLog,
} from "./azurePlatformServicesExtended.js";

import type { EcsDocument } from "./helpers.js";

/** Most generators return one doc; security-chain generators return correlated multi-doc bursts. */
type Gen = (ts: string, er: number) => EcsDocument | EcsDocument[];

const DEDICATED: Record<string, Gen> = {
  "virtual-machines": generateVirtualMachinesLog,
  "vm-scale-sets": generateVmScaleSetsLog,
  batch: generateBatchLog,
  aks: generateAksLog,
  "container-apps": generateContainerAppsLog,
  "container-instances": generateContainerInstancesLog,
  "kubernetes-fleet": generateKubernetesFleetLog,
  acr: generateAcrLog,
  "static-web-apps": generateStaticWebAppsLog,
  "spring-apps": generateSpringAppsLog,
  "dedicated-host": generateDedicatedHostLog,
  "capacity-reservation": generateCapacityReservationLog,
  "proximity-placement": generateProximityPlacementLog,
  "compute-gallery": generateComputeGalleryLog,
  "confidential-vm": generateConfidentialVmLog,
  "image-builder": generateImageBuilderLog,
  "vmware-solution": generateVmwareSolutionLog,
  "oracle-on-azure": generateOracleOnAzureLog,
  "sap-on-azure": generateSapOnAzureLog,
  "virtual-desktop": generateVirtualDesktopLog,
  "virtual-network": generateVirtualNetworkLog,
  "network-security-groups": generateNetworkSecurityGroupsLog,
  "load-balancer": generateLoadBalancerLog,
  "application-gateway": generateApplicationGatewayLog,
  "front-door": generateFrontDoorLog,
  cdn: generateCdnLog,
  "vpn-gateway": generateVpnGatewayLog,
  "azure-firewall": generateAzureFirewallLog,
  "nat-gateway": generateNatGatewayLog,
  "private-link": generatePrivateLinkLog,
  "private-dns": generatePrivateDnsLog,
  "dns-private-resolver": generateDnsPrivateResolverLog,
  "traffic-manager": generateTrafficManagerLog,
  "ddos-protection": generateDdosProtectionLog,
  bastion: generateBastionLog,
  "waf-policy": generateWafPolicyLog,
  "virtual-wan": generateVirtualWanLog,
  "route-server": generateRouteServerLog,
  "network-watcher": generateNetworkWatcherLog,
  "vpn-client": generateVpnClientLog,
  "firewall-policy": generateFirewallPolicyLog,
  "expressroute-circuit": generateExpressRouteCircuitLog,
  "expressroute-gateway": generateExpressRouteGatewayLog,
  "blob-storage": generateBlobStorageLog,
  "file-storage": generateFileStorageLog,
  "queue-storage": generateQueueStorageLog,
  "table-storage": generateTableStorageLog,
  "data-lake-storage": generateDataLakeStorageLog,
  "storage-sync": generateStorageSyncLog,
  "netapp-files": generateNetappFilesLog,
  "hpc-cache": generateHpcCacheLog,
  "elastic-san": generateElasticSanLog,
  "sql-managed-instance": generateSqlManagedInstanceLog,
  "cache-for-redis": generateCacheForRedisLog,
  "database-for-postgresql": generateDatabaseForPostgresqlLog,
  "database-for-mysql": generateDatabaseForMysqlLog,
  "database-for-mariadb": generateDatabaseForMariadbLog,
  purview: generatePurviewLog,
  "data-factory": generateDataFactoryLog,
  "stream-analytics": generateStreamAnalyticsLog,
  "digital-twins": generateDigitalTwinsLog,
  hdinsight: generateHdinsightLog,
  "analysis-services": generateAnalysisServicesLog,
  "power-bi-embedded": generatePowerBiEmbeddedLog,
  "microsoft-fabric": generateMicrosoftFabricLog,
  "data-explorer": generateDataExplorerLog,
  "ai-foundry": generateAiFoundryLog,
  "cognitive-services": generateCognitiveServicesLog,
  "machine-learning": generateMachineLearningLog,
  "ai-search": generateAiSearchLog,
  "bot-service": generateBotServiceLog,
  vision: generateVisionLog,
  speech: generateSpeechLog,
  translator: generateTranslatorLog,
  "document-intelligence": generateDocumentIntelligenceLog,
  "managed-identity": generateManagedIdentityLog,
  "defender-for-cloud": generateDefenderForCloudLog,
  sentinel: generateSentinelLog,
  attestation: generateAttestationLog,
  "confidential-ledger": generateConfidentialLedgerLog,
  "dedicated-hsm": generateDedicatedHsmLog,
  "activity-log": generateActivityLogLog,
  monitor: generateMonitorLog,
  "managed-grafana": generateManagedGrafanaLog,
  "managed-prometheus": generateManagedPrometheusLog,
  "application-insights": generateApplicationInsightsLog,
  policy: generatePolicyLog,
  advisor: generateAdvisorLog,
  "cost-management": generateCostManagementLog,
  "resource-graph": generateResourceGraphLog,
  "sql-database": generateSqlDatabaseLog,
  "cosmos-db": generateCosmosDbLog,
  "app-service": generateAppServiceLog,
  functions: generateFunctionsLog,
  "service-bus": generateServiceBusLog,
  "event-hubs": generateEventHubsLog,
  "key-vault": generateKeyVaultLog,
  "entra-id": generateEntraIdLog,
  m365: generateM365Log,
  "active-users-services": generateActiveUsersServicesLog,
  "teams-user-activity": generateTeamsUserActivityLog,
  "outlook-activity": generateOutlookActivityLog,
  "onedrive-usage-storage": generateOnedriveUsageStorageLog,
  openai: generateOpenAiLog,
  "iot-hub": generateIotHubLog,
  relay: generateRelayLog,
  "iot-central": generateIotCentralLog,
  "device-provisioning": generateDeviceProvisioningLog,
  "media-services": generateMediaServicesLog,
  "communication-services": generateCommunicationServicesLog,
  signalr: generateSignalRLog,
  "notification-hubs": generateNotificationHubsLog,
  "video-indexer": generateVideoIndexerLog,
  "automation-account": generateAutomationAccountLog,
  "app-configuration": generateAppConfigurationLog,
  "deployment-environments": generateDeploymentEnvironmentsLog,
  maps: generateMapsLog,
  backup: generateBackupLog,
  "site-recovery": generateSiteRecoveryLog,
  migrate: generateMigrateLog,
  "data-box": generateDataBoxLog,
  devcenter: generateDevcenterLog,
  "api-center": generateApiCenterLog,
  "lab-services": generateLabServicesLog,
  "load-testing": generateLoadTestingLog,
  pipeline: generatePipelineLog,
  stack: generateStackLog,
  arc: generateArcLog,
  "logic-apps": generateLogicAppsLog,
  "api-management": generateApiManagementLog,
  "event-grid": generateEventGridLog,
  "synapse-workspace": generateSynapseWorkspaceLog,
  databricks: generateDatabricksLog,
  "azure-security-chain": generateAzureSecurityFindingChain,
  "azure-cspm": generateAzureCspmFindings,
  "azure-kspm": generateAzureKspmFindings,
  "azure-iam-privesc-chain": generateAzureIamPrivEscChain,
  "azure-data-exfil-chain": generateAzureDataExfilChain,
  "azure-data-pipeline-chain": generateAzureDataPipelineChain,
  // Cross-cloud ITSM
  servicenow_cmdb: generateServiceNowCmdbLog,
};

const AZURE_LOG_MERGE_CHILDREN: Record<string, readonly string[]> = {
  "front-door": ["cdn"],
};

function buildRegistry(): Record<string, Gen> {
  const out: Record<string, Gen> = {};
  for (const id of Object.keys(AZURE_ELASTIC_DATASET_MAP)) {
    const gen = DEDICATED[id];
    if (!gen) throw new Error(`No dedicated Azure log generator for: ${id}`);
    out[id] = gen;
  }
  for (const [parent, children] of Object.entries(AZURE_LOG_MERGE_CHILDREN)) {
    const base = out[parent];
    if (!base) continue;
    const variants = [
      base,
      ...children.map((c) => {
        const cg = DEDICATED[c];
        if (!cg) throw new Error(`No dedicated Azure log generator for merge child: ${c}`);
        return cg;
      }),
    ];
    out[parent] = mergeAzureLogVariants(variants);
    for (const c of children) {
      delete out[c];
    }
  }
  for (const [parent, children] of Object.entries(AZURE_LOG_MERGE_CHILDREN)) {
    const parentGen = out[parent];
    if (!parentGen) continue;
    for (const c of children) {
      if (!(c in out)) out[c] = parentGen;
    }
  }
  return out;
}

const AZURE_GENERATORS = buildRegistry();

export { AZURE_GENERATORS };
