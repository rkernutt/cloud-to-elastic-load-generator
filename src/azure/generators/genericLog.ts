import {
  type EcsDocument,
  rand,
  randInt,
  randId,
  randIp,
  randUUID,
  azureCloud,
  makeAzureSetup,
  randCorrelationId,
} from "./helpers.js";
import { AZURE_ELASTIC_DATASET_MAP } from "../data/elasticMaps.js";

const ACTIVITY_CATEGORIES = [
  "Administrative",
  "Security",
  "ServiceHealth",
  "Alert",
  "Policy",
  "ResourceHealth",
  "Recommendation",
] as const;

const AZURE_ERROR_CODES = [
  {
    code: "AuthorizationFailed",
    message: "The client does not have authorization to perform action.",
  },
  {
    code: "ResourceNotFound",
    message: "The Resource 'Microsoft.*' under resource group was not found.",
  },
  {
    code: "Conflict",
    message: "The request could not be completed due to a conflict with the current state.",
  },
  {
    code: "InvalidRequestContent",
    message: "The request content was invalid and could not be deserialized.",
  },
  { code: "Throttled", message: "The request was throttled. Retry after the specified time." },
  {
    code: "DisallowedOperation",
    message: "The current subscription does not allow this operation.",
  },
] as const;

const DIAG_TEMPLATES: Record<string, readonly string[]> = {
  default: [
    "AzureControlPlane: requestId={rid} correlation={cid} op={op} resource={res} region={region} outcome={out}",
    "ARM audit: principal completed {op} on {res} in {rg} ({region}) latencyMs={lat}",
    "AzureDiagnostics category=Operational service={svc} op={op} target={res} rg={rg} ms={lat} req={rid}",
  ],
  monitor: [
    "AzureMonitor: ingestion succeeded op={op} resource={res} region={region} latencyMs={lat}",
    "Microsoft.Insights diagnostic pipeline op={op} component={res} outcome={out}",
  ],
  "defender-for-cloud": [
    "Microsoft.Security assessment pipeline op={op} resource={res} correlation={cid}",
  ],
};

function diagLines(serviceId: string): readonly string[] {
  return DIAG_TEMPLATES[serviceId] ?? DIAG_TEMPLATES.default;
}

export function azureNestedKeyFromDataset(dataset: string): string {
  return dataset.startsWith("azure.") ? dataset.slice(6) : dataset;
}

const ARM_PROVIDERS: Record<string, string> = {
  "virtual-machines": "Microsoft.Compute/virtualMachines",
  "vm-scale-sets": "Microsoft.Compute/virtualMachineScaleSets",
  batch: "Microsoft.Batch/batchAccounts",
  "dedicated-host": "Microsoft.Compute/hostGroups/hosts",
  "capacity-reservation": "Microsoft.Compute/capacityReservationGroups/capacityReservations",
  "proximity-placement": "Microsoft.Compute/proximityPlacementGroups",
  "compute-gallery": "Microsoft.Compute/galleries",
  aks: "Microsoft.ContainerService/managedClusters",
  "container-apps": "Microsoft.App/containerApps",
  "container-instances": "Microsoft.ContainerInstance/containerGroups",
  "kubernetes-fleet": "Microsoft.ContainerService/fleets",
  acr: "Microsoft.ContainerRegistry/registries",
  "app-service": "Microsoft.Web/sites",
  functions: "Microsoft.Web/sites",
  "static-web-apps": "Microsoft.Web/staticSites",
  "spring-apps": "Microsoft.AppPlatform/Spring",
  "virtual-network": "Microsoft.Network/virtualNetworks",
  "network-security-groups": "Microsoft.Network/networkSecurityGroups",
  "load-balancer": "Microsoft.Network/loadBalancers",
  "application-gateway": "Microsoft.Network/applicationGateways",
  "front-door": "Microsoft.Cdn/profiles",
  "expressroute-circuit": "Microsoft.Network/expressRouteCircuits",
  "vpn-gateway": "Microsoft.Network/virtualNetworkGateways",
  "nat-gateway": "Microsoft.Network/natGateways",
  "private-link": "Microsoft.Network/privateEndpoints",
  "private-dns": "Microsoft.Network/privateDnsZones",
  "traffic-manager": "Microsoft.Network/trafficManagerProfiles",
  "azure-firewall": "Microsoft.Network/azureFirewalls",
  "ddos-protection": "Microsoft.Network/ddosProtectionPlans",
  bastion: "Microsoft.Network/bastionHosts",
  "waf-policy": "Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies",
  "virtual-wan": "Microsoft.Network/virtualWans",
  "route-server": "Microsoft.Network/virtualHubs",
  "network-watcher": "Microsoft.Network/networkWatchers",
  "blob-storage": "Microsoft.Storage/storageAccounts/blobServices",
  "file-storage": "Microsoft.Storage/storageAccounts/fileServices",
  "queue-storage": "Microsoft.Storage/storageAccounts/queueServices",
  "table-storage": "Microsoft.Storage/storageAccounts/tableServices",
  "data-lake-storage": "Microsoft.Storage/storageAccounts",
  "storage-sync": "Microsoft.StorageSync/storageSyncServices",
  "netapp-files": "Microsoft.NetApp/netAppAccounts",
  "hpc-cache": "Microsoft.StorageCache/caches",
  "sql-database": "Microsoft.Sql/servers/databases",
  "sql-managed-instance": "Microsoft.Sql/managedInstances",
  "cosmos-db": "Microsoft.DocumentDB/databaseAccounts",
  "cache-for-redis": "Microsoft.Cache/Redis",
  "database-for-postgresql": "Microsoft.DBforPostgreSQL/servers",
  "database-for-mysql": "Microsoft.DBforMySQL/servers",
  "database-for-mariadb": "Microsoft.DBforMariaDB/servers",
  "synapse-workspace": "Microsoft.Synapse/workspaces",
  databricks: "Microsoft.Databricks/workspaces",
  purview: "Microsoft.Purview/accounts",
  "data-factory": "Microsoft.DataFactory/factories",
  "stream-analytics": "Microsoft.StreamAnalytics/streamingjobs",
  "event-hubs": "Microsoft.EventHub/namespaces",
  "digital-twins": "Microsoft.DigitalTwins/digitalTwinsInstances",
  hdinsight: "Microsoft.HDInsight/clusters",
  "analysis-services": "Microsoft.AnalysisServices/servers",
  "power-bi-embedded": "Microsoft.PowerBIDedicated/capacities",
  "microsoft-fabric": "Microsoft.Fabric/capacities",
  "cognitive-services": "Microsoft.CognitiveServices/accounts",
  openai: "Microsoft.CognitiveServices/accounts",
  "machine-learning": "Microsoft.MachineLearningServices/workspaces",
  "ai-search": "Microsoft.Search/searchServices",
  "bot-service": "Microsoft.BotService/botServices",
  vision: "Microsoft.CognitiveServices/accounts",
  speech: "Microsoft.CognitiveServices/accounts",
  translator: "Microsoft.CognitiveServices/accounts",
  "document-intelligence": "Microsoft.CognitiveServices/accounts",
  "entra-id": "Microsoft.AzureActiveDirectory/tenants",
  m365: "Microsoft.Office365/auditLogs",
  "key-vault": "Microsoft.KeyVault/vaults",
  "managed-identity": "Microsoft.ManagedIdentity/userAssignedIdentities",
  "defender-for-cloud": "Microsoft.Security/assessments",
  sentinel: "Microsoft.SecurityInsights/incidents",
  attestation: "Microsoft.Attestation/attestationProviders",
  "confidential-ledger": "Microsoft.ConfidentialLedger/ledgers",
  "service-bus": "Microsoft.ServiceBus/namespaces",
  "event-grid": "Microsoft.EventGrid/topics",
  "logic-apps": "Microsoft.Logic/workflows",
  "api-management": "Microsoft.ApiManagement/service",
  relay: "Microsoft.Relay/namespaces",
  "iot-hub": "Microsoft.Devices/IotHubs",
  "iot-central": "Microsoft.IoTCentral/iotApps",
  "device-provisioning": "Microsoft.Devices/provisioningServices",
  "time-series-insights": "Microsoft.TimeSeriesInsights/environments",
  "media-services": "Microsoft.Media/mediaservices",
  "communication-services": "Microsoft.Communication/communicationServices",
  signalr: "Microsoft.SignalRService/SignalR",
  "notification-hubs": "Microsoft.NotificationHubs/namespaces",
  monitor: "Microsoft.Insights/components",
  "activity-log": "Microsoft.Insights/activityLogAlerts",
  policy: "Microsoft.Authorization/policyAssignments",
  advisor: "Microsoft.Advisor/recommendations",
  "cost-management": "Microsoft.CostManagement/exports",
  "resource-graph": "Microsoft.ResourceGraph/queries",
  blueprints: "Microsoft.Blueprint/blueprintAssignments",
  "automation-account": "Microsoft.Automation/automationAccounts",
  "app-configuration": "Microsoft.AppConfiguration/configurationStores",
  "deployment-environments": "Microsoft.DevCenter/devcenters",
  maps: "Microsoft.Maps/accounts",
  backup: "Microsoft.RecoveryServices/vaults",
  "site-recovery": "Microsoft.RecoveryServices/vaults",
  migrate: "Microsoft.Migrate/assessmentProjects",
  "data-box": "Microsoft.DataBox/jobs",
  devcenter: "Microsoft.DevCenter/devcenters",
  "lab-services": "Microsoft.LabServices/labplans",
  "load-testing": "Microsoft.LoadTestService/loadTests",
  pipeline: "Microsoft.DevOps/pipelines",
  stack: "Microsoft.AzureStack/registrations",
  arc: "Microsoft.HybridCompute/machines",
  "api-center": "Microsoft.ApiCenter/services",
  cdn: "Microsoft.Cdn/profiles",
  "vpn-client": "Microsoft.Network/vpnGateways",
  "firewall-policy": "Microsoft.Network/firewallPolicies",
  "expressroute-gateway": "Microsoft.Network/expressRouteGateways",
  "oracle-on-azure": "Oracle.Database/cloudExadataInfrastructures",
  "sap-on-azure": "Microsoft.Workloads/sapVirtualInstances",
  "vmware-solution": "Microsoft.AVS/privateClouds",
  "confidential-vm": "Microsoft.Compute/virtualMachines",
  "image-builder": "Microsoft.VirtualMachineImages/imageTemplates",
  "azure-security-chain": "Microsoft.Security/assessments",
  "azure-cspm": "Microsoft.Security/assessments",
  "azure-kspm": "Microsoft.ContainerService/managedClusters",
  "azure-iam-privesc-chain": "Microsoft.Authorization/roleAssignments",
  "azure-data-exfil-chain": "Microsoft.Storage/storageAccounts",
};

function armResourceType(serviceId: string): string {
  return ARM_PROVIDERS[serviceId] ?? `Microsoft.Resources/deployments`;
}

function buildArmResourceId(
  subscriptionId: string,
  resourceGroup: string,
  armType: string,
  resourceName: string
): string {
  const segs = armType.split("/");
  const base = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers`;
  if (segs.length < 2) {
    return `${base}/${armType}/${resourceName}`;
  }
  const [ns, ...rest] = segs;
  if (rest.length === 1) {
    return `${base}/${ns}/${rest[0]}/${resourceName}`;
  }
  if (rest.length === 2) {
    return `${base}/${ns}/${rest[0]}/${resourceName}/${rest[1]}/default`;
  }
  let path = `${base}/${ns}`;
  for (let j = 0; j < rest.length; j++) {
    path += `/${rest[j]}`;
    if (j < rest.length - 1) {
      path += `/${j === 0 ? resourceName : `${resourceName}-${j}`}`;
    }
  }
  path += `/${resourceName}`;
  return path;
}

function defaultOps(armType: string): readonly string[] {
  const i = armType.indexOf("/");
  if (i < 0) return [`${armType}/write`];
  const ns = armType.slice(0, i);
  const res = armType.slice(i + 1);
  return [
    `${ns}/${res}/write`,
    `${ns}/${res}/delete`,
    `${ns}/${res}/read`,
    `${ns}/${res}/listKeys/action`,
  ];
}

const SERVICE_OPS: Record<string, readonly string[]> = {
  "container-apps": [
    "Microsoft.App/containerApps/write",
    "Microsoft.App/containerApps/delete",
    "Microsoft.App/containerApps/start/action",
    "Microsoft.App/containerApps/restart/action",
  ],
  "container-instances": [
    "Microsoft.ContainerInstance/containerGroups/write",
    "Microsoft.ContainerInstance/containerGroups/delete",
    "Microsoft.ContainerInstance/containerGroups/restart/action",
  ],
  "kubernetes-fleet": [
    "Microsoft.ContainerService/fleets/write",
    "Microsoft.ContainerService/fleets/delete",
    "Microsoft.ContainerService/fleets/members/write",
  ],
  acr: [
    "Microsoft.ContainerRegistry/registries/push/write",
    "Microsoft.ContainerRegistry/registries/pull/read",
    "Microsoft.ContainerRegistry/registries/importImage/action",
    "Microsoft.ContainerRegistry/registries/delete",
  ],
  "static-web-apps": [
    "Microsoft.Web/staticSites/write",
    "Microsoft.Web/staticSites/delete",
    "Microsoft.Web/staticSites/build/action",
  ],
  "spring-apps": [
    "Microsoft.AppPlatform/Spring/write",
    "Microsoft.AppPlatform/Spring/delete",
    "Microsoft.AppPlatform/Spring/apps/write",
  ],
  "network-security-groups": [
    "Microsoft.Network/networkSecurityGroups/write",
    "Microsoft.Network/networkSecurityGroups/delete",
    "Microsoft.Network/networkSecurityGroups/securityRules/write",
  ],
  "nat-gateway": ["Microsoft.Network/natGateways/write", "Microsoft.Network/natGateways/delete"],
  "private-link": [
    "Microsoft.Network/privateEndpoints/write",
    "Microsoft.Network/privateEndpoints/delete",
    "Microsoft.Network/privateEndpoints/privateLinkServiceConnections/write",
  ],
  "private-dns": [
    "Microsoft.Network/privateDnsZones/write",
    "Microsoft.Network/privateDnsZones/delete",
    "Microsoft.Network/privateDnsZones/A/write",
  ],
  "traffic-manager": [
    "Microsoft.Network/trafficManagerProfiles/write",
    "Microsoft.Network/trafficManagerProfiles/delete",
    "Microsoft.Network/trafficManagerProfiles/heatMaps/read",
  ],
  "ddos-protection": [
    "Microsoft.Network/ddosProtectionPlans/write",
    "Microsoft.Network/ddosProtectionPlans/delete",
  ],
  bastion: ["Microsoft.Network/bastionHosts/write", "Microsoft.Network/bastionHosts/delete"],
  "waf-policy": [
    "Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies/write",
    "Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies/delete",
  ],
  "virtual-wan": ["Microsoft.Network/virtualWans/write", "Microsoft.Network/virtualWans/delete"],
  "route-server": [
    "Microsoft.Network/virtualHubs/write",
    "Microsoft.Network/virtualHubs/delete",
    "Microsoft.Network/virtualHubs/bgpConnections/write",
  ],
  "network-watcher": [
    "Microsoft.Network/networkWatchers/write",
    "Microsoft.Network/networkWatchers/packetCaptures/write",
    "Microsoft.Network/networkWatchers/queryFlowLogStatus/action",
  ],
  "file-storage": [
    "Microsoft.Storage/storageAccounts/fileServices/shares/write",
    "Microsoft.Storage/storageAccounts/fileServices/shares/delete",
  ],
  "queue-storage": [
    "Microsoft.Storage/storageAccounts/queueServices/queues/write",
    "Microsoft.Storage/storageAccounts/queueServices/queues/delete",
  ],
  "table-storage": [
    "Microsoft.Storage/storageAccounts/tableServices/tables/write",
    "Microsoft.Storage/storageAccounts/tableServices/tables/delete",
  ],
  "data-lake-storage": [
    "Microsoft.Storage/storageAccounts/write",
    "Microsoft.Storage/storageAccounts/blobServices/containers/write",
    "Microsoft.Storage/storageAccounts/listKeys/action",
  ],
  "storage-sync": [
    "Microsoft.StorageSync/storageSyncServices/write",
    "Microsoft.StorageSync/storageSyncServices/syncGroups/write",
  ],
  "netapp-files": [
    "Microsoft.NetApp/netAppAccounts/capacityPools/volumes/write",
    "Microsoft.NetApp/netAppAccounts/capacityPools/volumes/delete",
  ],
  "hpc-cache": ["Microsoft.StorageCache/caches/write", "Microsoft.StorageCache/caches/delete"],
  "sql-managed-instance": [
    "Microsoft.Sql/managedInstances/write",
    "Microsoft.Sql/managedInstances/delete",
    "Microsoft.Sql/managedInstances/databases/write",
  ],
  "cache-for-redis": [
    "Microsoft.Cache/Redis/write",
    "Microsoft.Cache/Redis/delete",
    "Microsoft.Cache/Redis/firewallRules/write",
  ],
  "database-for-postgresql": [
    "Microsoft.DBforPostgreSQL/servers/write",
    "Microsoft.DBforPostgreSQL/servers/firewallRules/write",
    "Microsoft.DBforPostgreSQL/servers/databases/read",
  ],
  "database-for-mysql": [
    "Microsoft.DBforMySQL/servers/write",
    "Microsoft.DBforMySQL/servers/firewallRules/write",
  ],
  "database-for-mariadb": [
    "Microsoft.DBforMariaDB/servers/write",
    "Microsoft.DBforMariaDB/servers/configurations/write",
  ],
  purview: [
    "Microsoft.Purview/accounts/write",
    "Microsoft.Purview/accounts/delete",
    "Microsoft.Purview/accounts/scan/read",
  ],
  "data-factory": [
    "Microsoft.DataFactory/factories/write",
    "Microsoft.DataFactory/factories/delete",
    "Microsoft.DataFactory/factories/pipelines/write",
  ],
  "stream-analytics": [
    "Microsoft.StreamAnalytics/streamingjobs/write",
    "Microsoft.StreamAnalytics/streamingjobs/start/action",
    "Microsoft.StreamAnalytics/streamingjobs/stop/action",
  ],
  "digital-twins": [
    "Microsoft.DigitalTwins/digitalTwinsInstances/write",
    "Microsoft.DigitalTwins/digitalTwinsInstances/delete",
    "Microsoft.DigitalTwins/digitalTwinsModels/write",
  ],
  hdinsight: [
    "Microsoft.HDInsight/clusters/write",
    "Microsoft.HDInsight/clusters/delete",
    "Microsoft.HDInsight/clusters/resize/action",
  ],
  "analysis-services": [
    "Microsoft.AnalysisServices/servers/write",
    "Microsoft.AnalysisServices/servers/suspend/action",
    "Microsoft.AnalysisServices/servers/resume/action",
  ],
  "power-bi-embedded": [
    "Microsoft.PowerBIDedicated/capacities/write",
    "Microsoft.PowerBIDedicated/capacities/suspend/action",
    "Microsoft.PowerBIDedicated/capacities/resume/action",
  ],
  "microsoft-fabric": [
    "Microsoft.Fabric/capacities/write",
    "Microsoft.Fabric/capacities/suspend/action",
    "Microsoft.Fabric/capacities/resume/action",
  ],
  "cognitive-services": [
    "Microsoft.CognitiveServices/accounts/write",
    "Microsoft.CognitiveServices/accounts/delete",
    "Microsoft.CognitiveServices/accounts/listKeys/action",
  ],
  "machine-learning": [
    "Microsoft.MachineLearningServices/workspaces/write",
    "Microsoft.MachineLearningServices/workspaces/computes/write",
    "Microsoft.MachineLearningServices/workspaces/delete",
  ],
  "ai-search": [
    "Microsoft.Search/searchServices/write",
    "Microsoft.Search/searchServices/delete",
    "Microsoft.Search/searchServices/sharedPrivateLinkResources/write",
  ],
  "bot-service": [
    "Microsoft.BotService/botServices/write",
    "Microsoft.BotService/botServices/delete",
    "Microsoft.BotService/botServices/regenerateKeys/action",
  ],
  vision: [
    "Microsoft.CognitiveServices/accounts/write",
    "Microsoft.CognitiveServices/accounts/delete",
    "Microsoft.CognitiveServices/accounts/listKeys/action",
  ],
  speech: [
    "Microsoft.CognitiveServices/accounts/write",
    "Microsoft.CognitiveServices/accounts/delete",
    "Microsoft.CognitiveServices/accounts/listKeys/action",
  ],
  translator: [
    "Microsoft.CognitiveServices/accounts/write",
    "Microsoft.CognitiveServices/accounts/delete",
    "Microsoft.CognitiveServices/accounts/listKeys/action",
  ],
  "document-intelligence": [
    "Microsoft.CognitiveServices/accounts/write",
    "Microsoft.CognitiveServices/accounts/delete",
    "Microsoft.CognitiveServices/accounts/listKeys/action",
  ],
  "managed-identity": [
    "Microsoft.ManagedIdentity/userAssignedIdentities/write",
    "Microsoft.ManagedIdentity/userAssignedIdentities/delete",
    "Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials/write",
  ],
  "defender-for-cloud": [
    "Microsoft.Security/assessments/write",
    "Microsoft.Security/pricings/write",
    "Microsoft.Security/settings/write",
  ],
  sentinel: [
    "Microsoft.SecurityInsights/incidents/write",
    "Microsoft.SecurityInsights/alertRules/write",
    "Microsoft.SecurityInsights/cases/write",
  ],
  attestation: [
    "Microsoft.Attestation/attestationProviders/write",
    "Microsoft.Attestation/attestationProviders/delete",
  ],
  "confidential-ledger": [
    "Microsoft.ConfidentialLedger/ledgers/write",
    "Microsoft.ConfidentialLedger/ledgers/delete",
  ],
  relay: [
    "Microsoft.Relay/namespaces/write",
    "Microsoft.Relay/namespaces/delete",
    "Microsoft.Relay/namespaces/hybridConnections/write",
  ],
  "iot-central": [
    "Microsoft.IoTCentral/iotApps/write",
    "Microsoft.IoTCentral/iotApps/delete",
    "Microsoft.IoTCentral/iotApps/devices/write",
  ],
  "device-provisioning": [
    "Microsoft.Devices/provisioningServices/write",
    "Microsoft.Devices/provisioningServices/delete",
    "Microsoft.Devices/provisioningServices/enrollments/write",
  ],
  "time-series-insights": [
    "Microsoft.TimeSeriesInsights/environments/write",
    "Microsoft.TimeSeriesInsights/environments/delete",
    "Microsoft.TimeSeriesInsights/environments/eventSources/write",
  ],
  "media-services": [
    "Microsoft.Media/mediaservices/write",
    "Microsoft.Media/mediaservices/delete",
    "Microsoft.Media/mediaservices/transforms/jobs/write",
  ],
  "communication-services": [
    "Microsoft.Communication/communicationServices/write",
    "Microsoft.Communication/communicationServices/delete",
    "Microsoft.Communication/communicationServices/regenerateKey/action",
  ],
  signalr: [
    "Microsoft.SignalRService/SignalR/write",
    "Microsoft.SignalRService/SignalR/delete",
    "Microsoft.SignalRService/SignalR/restart/action",
  ],
  "notification-hubs": [
    "Microsoft.NotificationHubs/namespaces/write",
    "Microsoft.NotificationHubs/namespaces/notificationHubs/write",
  ],
  monitor: [
    "Microsoft.Insights/components/write",
    "Microsoft.Insights/components/delete",
    "Microsoft.Insights/diagnosticSettings/write",
  ],
  "activity-log": [
    "Microsoft.Insights/activityLogAlerts/write",
    "Microsoft.Insights/activityLogAlerts/delete",
  ],
  policy: [
    "Microsoft.Authorization/policyAssignments/write",
    "Microsoft.Authorization/policyAssignments/delete",
  ],
  advisor: [
    "Microsoft.Advisor/recommendations/suppressions/write",
    "Microsoft.Advisor/configurations/write",
  ],
  "cost-management": [
    "Microsoft.CostManagement/exports/write",
    "Microsoft.CostManagement/exports/run/action",
  ],
  "resource-graph": ["Microsoft.ResourceGraph/queries/read"],
  blueprints: [
    "Microsoft.Blueprint/blueprintAssignments/write",
    "Microsoft.Blueprint/blueprintAssignments/delete",
  ],
  "automation-account": [
    "Microsoft.Automation/automationAccounts/write",
    "Microsoft.Automation/automationAccounts/runbooks/write",
    "Microsoft.Automation/automationAccounts/jobs/write",
  ],
  "app-configuration": [
    "Microsoft.AppConfiguration/configurationStores/write",
    "Microsoft.AppConfiguration/configurationStores/delete",
    "Microsoft.AppConfiguration/configurationStores/keyValues/write",
  ],
  "deployment-environments": [
    "Microsoft.DevCenter/devcenters/write",
    "Microsoft.DevCenter/devcenters/projects/deployments/write",
  ],
  maps: ["Microsoft.Maps/accounts/write", "Microsoft.Maps/accounts/delete"],
  backup: [
    "Microsoft.RecoveryServices/vaults/backupFabrics/protectionContainers/write",
    "Microsoft.RecoveryServices/vaults/backupPolicies/write",
  ],
  "site-recovery": [
    "Microsoft.RecoveryServices/vaults/replicationFabrics/write",
    "Microsoft.RecoveryServices/vaults/replicationPolicies/write",
  ],
  migrate: [
    "Microsoft.Migrate/assessmentProjects/write",
    "Microsoft.Migrate/assessmentProjects/assessments/write",
  ],
  "data-box": [
    "Microsoft.DataBox/jobs/write",
    "Microsoft.DataBox/jobs/cancel/action",
    "Microsoft.DataBox/jobs/bookShipmentPickup/action",
  ],
  devcenter: ["Microsoft.DevCenter/devcenters/write", "Microsoft.DevCenter/devcenters/delete"],
  "lab-services": [
    "Microsoft.LabServices/labplans/write",
    "Microsoft.LabServices/labplans/delete",
    "Microsoft.LabServices/labs/write",
  ],
  "load-testing": [
    "Microsoft.LoadTestService/loadTests/write",
    "Microsoft.LoadTestService/loadTests/delete",
    "Microsoft.LoadTestService/loadTests/run/action",
  ],
  pipeline: ["Microsoft.DevOps/pipelines/write", "Microsoft.DevOps/pipelines/delete"],
  stack: ["Microsoft.AzureStack/registrations/write", "Microsoft.AzureStack/registrations/delete"],
  arc: [
    "Microsoft.HybridCompute/machines/write",
    "Microsoft.HybridCompute/machines/delete",
    "Microsoft.HybridCompute/machines/extensions/write",
  ],
  "api-center": ["Microsoft.ApiCenter/services/write", "Microsoft.ApiCenter/services/delete"],
  "vpn-client": [
    "Microsoft.Network/vpnGateways/write",
    "Microsoft.Network/vpnGateways/disconnectVirtualNetworkGatewayVpnConnections/action",
  ],
  "firewall-policy": [
    "Microsoft.Network/firewallPolicies/write",
    "Microsoft.Network/firewallPolicies/delete",
    "Microsoft.Network/firewallPolicies/ruleCollectionGroups/write",
  ],
  "expressroute-gateway": [
    "Microsoft.Network/expressRouteGateways/write",
    "Microsoft.Network/expressRouteGateways/delete",
  ],
  "oracle-on-azure": [
    "Oracle.Database/cloudExadataInfrastructures/write",
    "Oracle.Database/cloudExadataInfrastructures/delete",
  ],
  "sap-on-azure": [
    "Microsoft.Workloads/sapVirtualInstances/write",
    "Microsoft.Workloads/sapVirtualInstances/delete",
    "Microsoft.Workloads/sapVirtualInstances/start/action",
  ],
  "vmware-solution": [
    "Microsoft.AVS/privateClouds/write",
    "Microsoft.AVS/privateClouds/delete",
    "Microsoft.AVS/privateClouds/rotateNsxtPassword/action",
  ],
  "image-builder": [
    "Microsoft.VirtualMachineImages/imageTemplates/write",
    "Microsoft.VirtualMachineImages/imageTemplates/delete",
    "Microsoft.VirtualMachineImages/imageTemplates/run/action",
  ],
  openai: [
    "Microsoft.CognitiveServices/accounts/write",
    "Microsoft.CognitiveServices/accounts/deployments/write",
    "Microsoft.CognitiveServices/accounts/listKeys/action",
  ],
  "dedicated-host": [
    "Microsoft.Compute/hostGroups/hosts/write",
    "Microsoft.Compute/hostGroups/hosts/delete",
    "Microsoft.Compute/hostGroups/hosts/restart/action",
  ],
  "capacity-reservation": [
    "Microsoft.Compute/capacityReservationGroups/capacityReservations/write",
    "Microsoft.Compute/capacityReservationGroups/capacityReservations/delete",
  ],
  "proximity-placement": [
    "Microsoft.Compute/proximityPlacementGroups/write",
    "Microsoft.Compute/proximityPlacementGroups/delete",
  ],
  "compute-gallery": [
    "Microsoft.Compute/galleries/write",
    "Microsoft.Compute/galleries/delete",
    "Microsoft.Compute/galleries/images/versions/write",
  ],
  "virtual-network": [
    "Microsoft.Network/virtualNetworks/write",
    "Microsoft.Network/virtualNetworks/delete",
    "Microsoft.Network/virtualNetworks/subnets/write",
  ],
  "load-balancer": [
    "Microsoft.Network/loadBalancers/write",
    "Microsoft.Network/loadBalancers/delete",
    "Microsoft.Network/loadBalancers/frontendIPConfigurations/write",
  ],
  "application-gateway": [
    "Microsoft.Network/applicationGateways/write",
    "Microsoft.Network/applicationGateways/delete",
    "Microsoft.Network/applicationGateways/start/action",
  ],
  "front-door": [
    "Microsoft.Cdn/profiles/write",
    "Microsoft.Cdn/profiles/delete",
    "Microsoft.Cdn/profiles/afdEndpoints/write",
  ],
  "expressroute-circuit": [
    "Microsoft.Network/expressRouteCircuits/write",
    "Microsoft.Network/expressRouteCircuits/delete",
    "Microsoft.Network/expressRouteCircuits/peerings/write",
  ],
  "vpn-gateway": [
    "Microsoft.Network/virtualNetworkGateways/write",
    "Microsoft.Network/virtualNetworkGateways/delete",
    "Microsoft.Network/virtualNetworkGateways/reset/action",
  ],
  "azure-firewall": [
    "Microsoft.Network/azureFirewalls/write",
    "Microsoft.Network/azureFirewalls/delete",
  ],
  "blob-storage": [
    "Microsoft.Storage/storageAccounts/write",
    "Microsoft.Storage/storageAccounts/blobServices/containers/write",
    "Microsoft.Storage/storageAccounts/listKeys/action",
  ],
  "synapse-workspace": [
    "Microsoft.Synapse/workspaces/write",
    "Microsoft.Synapse/workspaces/delete",
    "Microsoft.Synapse/workspaces/sqlPools/write",
  ],
  databricks: [
    "Microsoft.Databricks/workspaces/write",
    "Microsoft.Databricks/workspaces/delete",
    "Microsoft.Databricks/workspaces/updateWorkspaceEncryption/action",
  ],
  "event-hubs": [
    "Microsoft.EventHub/namespaces/write",
    "Microsoft.EventHub/namespaces/delete",
    "Microsoft.EventHub/namespaces/eventhubs/write",
  ],
  "cosmos-db": [
    "Microsoft.DocumentDB/databaseAccounts/write",
    "Microsoft.DocumentDB/databaseAccounts/delete",
    "Microsoft.DocumentDB/databaseAccounts/sqlDatabases/write",
  ],
  cdn: [
    "Microsoft.Cdn/profiles/write",
    "Microsoft.Cdn/profiles/delete",
    "Microsoft.Cdn/profiles/endpoints/write",
  ],
  "confidential-vm": [
    "Microsoft.Compute/virtualMachines/write",
    "Microsoft.Compute/virtualMachines/delete",
    "Microsoft.Compute/virtualMachines/start/action",
  ],
  "azure-security-chain": [
    "Microsoft.Security/assessments/write",
    "Microsoft.Security/alerts/suppressions/write",
  ],
  "azure-cspm": [
    "Microsoft.Security/assessments/write",
    "Microsoft.Security/regulatoryComplianceStandards/write",
  ],
  "azure-kspm": [
    "Microsoft.ContainerService/managedClusters/write",
    "Microsoft.ContainerService/managedClusters/agentPools/write",
  ],
  "azure-iam-privesc-chain": [
    "Microsoft.Authorization/roleAssignments/write",
    "Microsoft.Authorization/roleAssignments/delete",
  ],
  "azure-data-exfil-chain": [
    "Microsoft.Storage/storageAccounts/write",
    "Microsoft.Storage/storageAccounts/blobServices/containers/write",
    "Microsoft.Storage/storageAccounts/listKeys/action",
  ],
};

function pickOperation(serviceId: string, armType: string): string {
  const list = SERVICE_OPS[serviceId] ?? defaultOps(armType);
  return rand([...list]);
}

function resultTypeFor(isErr: boolean, op: string): string {
  if (isErr) return "Failure";
  if (op.includes("/start/action")) return "Start";
  if (
    op.includes("/run/action") ||
    op.includes("/importImage/action") ||
    op.includes("/bookShipmentPickup/action")
  ) {
    return rand(["Accept", "Success"]);
  }
  return rand(["Success", "Success", "Success", "Accept"]);
}

function levelFor(isErr: boolean, category: string): string {
  if (isErr) return rand(["Error", "Error", "Warning", "Critical"]);
  if (category === "Security" || category === "Alert") return rand(["Information", "Warning"]);
  return "Information";
}

function buildIdentity(): { claims: Record<string, string> } {
  if (Math.random() < 0.45) {
    return {
      claims: {
        appid: randUUID(),
        appidacr: "2",
        iss: "https://sts.windows.net/" + randUUID() + "/",
        aud: "https://management.azure.com/",
        "http://schemas.microsoft.com/identity/claims/objectidentifier": randUUID(),
      },
    };
  }
  const user = `${rand(["alice", "bob", "deploy-bot", "svc-cicd", "analyst"])}@${rand(["contoso.com", "fabrikam.onmicrosoft.com", "northwind.com"])}`;
  return {
    claims: {
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn": user,
      "http://schemas.microsoft.com/identity/claims/objectidentifier": randUUID(),
      "http://schemas.microsoft.com/identity/claims/tenantid": randUUID(),
    },
  };
}

function callerLabel(identity: { claims: Record<string, string> }): string {
  const upn = identity.claims["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn"];
  if (upn) return upn;
  const app = identity.claims.appid;
  return app ? `appid:${app}` : "unknown";
}

function buildActivityMessage(caller: string, operationName: string, resultType: string): string {
  return `Caller '${caller}' - Action '${operationName}' - Status '${resultType}'`;
}

function buildDiagnosticMessage(
  serviceId: string,
  template: string,
  ctx: {
    rid: string;
    cid: string;
    op: string;
    res: string;
    rg: string;
    region: string;
    out: string;
    lat: number;
  }
): string {
  return template
    .replace("{rid}", ctx.rid)
    .replace("{cid}", ctx.cid)
    .replace("{op}", ctx.op)
    .replace("{res}", ctx.res)
    .replace("{rg}", ctx.rg)
    .replace("{region}", ctx.region)
    .replace("{out}", ctx.out)
    .replace("{lat}", String(ctx.lat))
    .replace("{svc}", serviceId);
}

export function makeGenericAzureLog(serviceId: string): (ts: string, er: number) => EcsDocument {
  const dataset = AZURE_ELASTIC_DATASET_MAP[serviceId];
  if (!dataset) {
    throw new Error(`Unknown Azure service id for generic log: ${serviceId}`);
  }
  const nestedKey = azureNestedKeyFromDataset(dataset);
  const armType = armResourceType(serviceId);
  const cloudServiceName = armType;

  return (ts: string, er: number) => {
    const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
    const resourceName = `${serviceId.split("-")[0]}-${randId(5).toLowerCase()}`;
    const operationName = pickOperation(serviceId, armType);
    const correlationId = randCorrelationId();
    const serviceRequestId = randUUID();
    const callerIp = randIp();
    const httpStatus = isErr ? randInt(400, 503) : rand([200, 201, 202, 204]);
    const resultSignature = String(httpStatus);
    const resultType = resultTypeFor(isErr, operationName);
    const category = rand(ACTIVITY_CATEGORIES);
    const level = levelFor(isErr, category);
    const identity = buildIdentity();
    const caller = callerLabel(identity);
    const durationMs = randInt(20, isErr ? 120_000 : 8000);
    const errPick = rand(AZURE_ERROR_CODES);
    const statusMessage = isErr
      ? { error: { code: errPick.code, message: errPick.message } }
      : { status: "Succeeded", correlationRequestId: serviceRequestId };
    const properties = {
      statusCode: httpStatus,
      statusMessage,
      serviceRequestId,
      eventCategory: category === "Policy" ? "Policy" : "Administrative",
    };
    const rid = buildArmResourceId(subscription.id, resourceGroup, armType, resourceName);

    const msgMode = randInt(0, 2);
    let message: string;
    if (msgMode === 0) {
      message = buildActivityMessage(caller, operationName, resultType);
    } else {
      const tpl = rand([...diagLines(serviceId)]);
      message = buildDiagnosticMessage(serviceId, tpl, {
        rid: serviceRequestId,
        cid: correlationId,
        op: operationName,
        res: resourceName,
        rg: resourceGroup,
        region,
        out: resultType,
        lat: durationMs,
      });
    }

    return {
      "@timestamp": ts,
      time: ts,
      resourceId: rid,
      operationName,
      category,
      resultType,
      resultSignature,
      callerIpAddress: callerIp,
      correlationId,
      level,
      identity,
      properties,
      cloud: azureCloud(region, subscription, cloudServiceName),
      azure: {
        [nestedKey]: {
          resource_group: resourceGroup,
          resource_name: resourceName,
          resource_id: rid,
          operation_name: operationName,
          status: resultType,
          correlation_id: correlationId,
          http_status: httpStatus,
          duration_ms: durationMs,
          category,
          level,
          caller_ip_address: callerIp,
          result_signature: resultSignature,
          properties,
        },
      },
      event: {
        outcome: isErr ? "failure" : "success",
        duration: randInt(50_000, isErr ? 90_000_000 : 8_000_000),
        action: operationName,
      },
      message,
    };
  };
}
