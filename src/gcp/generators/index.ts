/**
 * Registry of GCP log generators.
 * Each generator returns a single ECS-shaped document.
 * Signature: (ts: string, er: number) => EcsDocument
 */

import {
  generateGcpSecurityFindingChain,
  generateGcpCspmFindings,
  generateGcpKspmFindings,
  generateGcpIamPrivEscChain,
  generateGcpDataExfilChain,
} from "./securityChains.js";
import {
  generateCloudFunctionsLog,
  generateCloudRunLog,
  generateAppEngineLog,
  generateCloudTasksLog,
  generateCloudSchedulerLog,
  generateWorkflowsLog,
  generateEventarcLog,
  generateCloudRunJobsLog,
  generateServerlessVpcAccessLog,
} from "./serverless.js";
import {
  generateComputeEngineLog,
  generateBatchLog,
  generateSoleTenantNodesLog,
  generateVmwareEngineLog,
  generateBareMetalLog,
  generateSpotVmsLog,
  generateCloudTpuLog,
  generateCloudWorkstationsLog,
  generateShieldedVmsLog,
  generateConfidentialComputingLog,
  generateMigrateToVmsLog,
} from "./compute.js";
import {
  generateGkeLog,
  generateAnthosLog,
  generateArtifactRegistryLog,
  generateContainerRegistryLog,
  generateGkeAutopilotLog,
  generateAnthosServiceMeshLog,
  generateAnthosConfigMgmtLog,
  generateGkeEnterpriseLog,
  generateMigrateToContainersLog,
} from "./containers.js";
import {
  generateVpcFlowLog,
  generateCloudLbLog,
  generateCloudCdnLog,
  generateCloudDnsLog,
  generateCloudArmorLog,
  generateCloudNatLog,
  generateCloudVpnLog,
  generateCloudInterconnectLog,
  generateCloudRouterLog,
  generateTrafficDirectorLog,
  generatePrivateServiceConnectLog,
  generateNetworkConnectivityCenterLog,
  generateNetworkIntelligenceCenterLog,
  generateCloudIdsLog,
  generatePacketMirroringLog,
  generateNetworkServiceTiersLog,
  generateCloudDomainsLog,
  generateMediaCdnLog,
  generateServerlessNegLog,
} from "./networking.js";
import {
  generateSecurityCommandCenterLog,
  generateIamLog,
  generateSecretManagerLog,
  generateCloudKmsLog,
  generateCertificateAuthorityLog,
  generateBeyondCorpLog,
  generateBinaryAuthorizationLog,
  generateVpcServiceControlsLog,
  generateAccessContextManagerLog,
  generateAssuredWorkloadsLog,
  generateChronicleLog,
  generateRecaptchaEnterpriseLog,
  generateWebSecurityScannerLog,
  generateIdentityAwareProxyLog,
  generateDlpLog,
  generateWebRiskLog,
  generateCloudIdentityLog,
  generateManagedAdLog,
  generateOsLoginLog,
  generateSecurityOperationsLog,
} from "./security.js";
import {
  generateCloudStorageLog,
  generatePersistentDiskLog,
  generateFilestoreLog,
  generateStorageTransferLog,
  generateBackupDrLog,
} from "./storage.js";
import {
  generateCloudSqlLog,
  generateCloudSpannerLog,
  generateFirestoreLog,
  generateBigtableLog,
  generateAlloyDbLog,
  generateMemorystoreLog,
  generateFirebaseRtdbLog,
  generateDatabaseMigrationLog,
  generateBareMetalOracleLog,
} from "./databases.js";
import { generateBigQueryLog } from "./datawarehouse.js";
import { generatePubSubLog, generateDataflowLog, generatePubSubLiteLog } from "./streaming.js";
import {
  generateDataprocLog,
  generateDataFusionLog,
  generateComposerLog,
  generateLookerLog,
  generateDataplexLog,
  generateDataCatalogLog,
  generateAnalyticsHubLog,
  generateDataprepLog,
  generateDatastreamLog,
} from "./analytics.js";
import {
  generateVertexAiLog,
  generateGeminiLog,
  generateVisionAiLog,
  generateNaturalLanguageLog,
  generateTranslationLog,
  generateSpeechToTextLog,
  generateTextToSpeechLog,
  generateDialogflowLog,
  generateDocumentAiLog,
  generateRecommendationsAiLog,
  generateVertexAiSearchLog,
  generateAutoMlLog,
  generateVertexAiWorkbenchLog,
  generateVertexAiPipelinesLog,
  generateVertexAiFeatureStoreLog,
  generateVertexAiMatchingEngineLog,
  generateVertexAiTensorBoardLog,
  generateContactCenterAiLog,
  generateHealthcareApiLog,
  generateRetailApiLog,
} from "./aiml.js";
import {
  generateCloudBuildLog,
  generateCloudDeployLog,
  generateSourceRepositoriesLog,
  generateFirebaseLog,
  generateCloudEndpointsLog,
  generateApigeeLog,
  generateCloudShellLog,
  generateGeminiCodeAssistLog,
  generateApiGatewayLog,
} from "./devtools.js";
import {
  generateCloudMonitoringLog,
  generateCloudLoggingLog,
  generateResourceManagerLog,
  generateDeploymentManagerLog,
  generateCloudAssetInventoryLog,
  generateOrgPolicyLog,
  generateAccessTransparencyLog,
  generateRecommenderLog,
  generateBillingLog,
  generateServiceDirectoryLog,
  generateConfigConnectorLog,
  generateCloudAuditLog,
  generateActiveAssistLog,
  generateEssentialContactsLog,
  generateTagsLog,
  generateCarbonFootprintLog,
} from "./management.js";
import {
  generateIntegrationConnectorsLog,
  generateApplicationIntegrationLog,
  generateApiHubLog,
} from "./integration.js";
import {
  generateCloudTraceLog,
  generateCloudProfilerLog,
  generateErrorReportingLog,
} from "./operations.js";
import { generateIotCoreLog } from "./iot.js";
import {
  generateTranscoderLog,
  generateLiveStreamLog,
  generateVideoIntelligenceLog,
} from "./media.js";
import { mergeGcpLogVariants } from "./mergeHelpers.js";

const GCP_GENERATORS: Record<string, (ts: string, er: number) => Record<string, unknown>> = {
  // Serverless & Functions
  "cloud-functions": generateCloudFunctionsLog,
  "cloud-run": generateCloudRunLog,
  "app-engine": generateAppEngineLog,
  "cloud-tasks": generateCloudTasksLog,
  "cloud-scheduler": generateCloudSchedulerLog,
  workflows: generateWorkflowsLog,
  eventarc: generateEventarcLog,
  "cloud-run-jobs": generateCloudRunJobsLog,
  "serverless-vpc-access": generateServerlessVpcAccessLog,

  // Compute
  "compute-engine": mergeGcpLogVariants([
    generateComputeEngineLog,
    generateSoleTenantNodesLog,
    generateSpotVmsLog,
    generateShieldedVmsLog,
    generateConfidentialComputingLog,
    generateMigrateToVmsLog,
  ]),
  batch: generateBatchLog,
  "vmware-engine": generateVmwareEngineLog,
  "bare-metal": mergeGcpLogVariants([generateBareMetalLog, generateBareMetalOracleLog]),
  "cloud-tpu": generateCloudTpuLog,
  "cloud-workstations": generateCloudWorkstationsLog,

  // Containers & Kubernetes
  gke: mergeGcpLogVariants([generateGkeLog, generateConfigConnectorLog]),
  anthos: generateAnthosLog,
  "artifact-registry": generateArtifactRegistryLog,
  "container-registry": generateContainerRegistryLog,
  "gke-autopilot": generateGkeAutopilotLog,
  "anthos-service-mesh": generateAnthosServiceMeshLog,
  "anthos-config-mgmt": generateAnthosConfigMgmtLog,
  "gke-enterprise": generateGkeEnterpriseLog,
  "migrate-to-containers": generateMigrateToContainersLog,

  // Networking & CDN
  "vpc-flow": mergeGcpLogVariants([
    generateVpcFlowLog,
    generatePacketMirroringLog,
    generateNetworkServiceTiersLog,
  ]),
  "cloud-lb": mergeGcpLogVariants([generateCloudLbLog, generateServerlessNegLog]),
  "cloud-cdn": generateCloudCdnLog,
  "cloud-dns": generateCloudDnsLog,
  "cloud-armor": generateCloudArmorLog,
  "cloud-nat": generateCloudNatLog,
  "cloud-vpn": generateCloudVpnLog,
  "cloud-interconnect": generateCloudInterconnectLog,
  "cloud-router": generateCloudRouterLog,
  "traffic-director": generateTrafficDirectorLog,
  "private-service-connect": generatePrivateServiceConnectLog,
  "network-connectivity-center": generateNetworkConnectivityCenterLog,
  "network-intelligence-center": generateNetworkIntelligenceCenterLog,
  "cloud-ids": generateCloudIdsLog,
  "cloud-domains": generateCloudDomainsLog,
  "media-cdn": generateMediaCdnLog,

  // Security & Identity
  "security-command-center": mergeGcpLogVariants([
    generateSecurityCommandCenterLog,
    generateVpcServiceControlsLog,
  ]),
  iam: mergeGcpLogVariants([generateIamLog, generateOsLoginLog]),
  "secret-manager": generateSecretManagerLog,
  "cloud-kms": generateCloudKmsLog,
  "certificate-authority": generateCertificateAuthorityLog,
  beyondcorp: generateBeyondCorpLog,
  "binary-authorization": generateBinaryAuthorizationLog,
  "access-context-manager": generateAccessContextManagerLog,
  "assured-workloads": generateAssuredWorkloadsLog,
  chronicle: generateChronicleLog,
  "recaptcha-enterprise": generateRecaptchaEnterpriseLog,
  "web-security-scanner": generateWebSecurityScannerLog,
  "identity-aware-proxy": generateIdentityAwareProxyLog,
  dlp: generateDlpLog,
  "web-risk": generateWebRiskLog,
  "cloud-identity": generateCloudIdentityLog,
  "managed-ad": generateManagedAdLog,
  "security-operations": generateSecurityOperationsLog,

  // Storage
  "cloud-storage": mergeGcpLogVariants([generateCloudStorageLog, generateStorageTransferLog]),
  "persistent-disk": generatePersistentDiskLog,
  filestore: generateFilestoreLog,
  "backup-dr": generateBackupDrLog,

  // Databases
  "cloud-sql": generateCloudSqlLog,
  "cloud-spanner": generateCloudSpannerLog,
  firestore: generateFirestoreLog,
  bigtable: generateBigtableLog,
  alloydb: generateAlloyDbLog,
  memorystore: generateMemorystoreLog,
  "database-migration": generateDatabaseMigrationLog,

  // Data Warehouse & Analytics
  bigquery: generateBigQueryLog,
  dataproc: generateDataprocLog,
  "data-fusion": generateDataFusionLog,
  composer: generateComposerLog,
  looker: generateLookerLog,
  dataplex: generateDataplexLog,
  "data-catalog": generateDataCatalogLog,
  "analytics-hub": generateAnalyticsHubLog,
  dataprep: generateDataprepLog,
  datastream: generateDatastreamLog,

  // Streaming & Messaging
  pubsub: generatePubSubLog,
  dataflow: generateDataflowLog,
  "pubsub-lite": generatePubSubLiteLog,

  // AI & Machine Learning
  "vertex-ai": mergeGcpLogVariants([generateVertexAiLog, generateVertexAiSearchLog]),
  gemini: mergeGcpLogVariants([generateGeminiLog, generateGeminiCodeAssistLog]),
  "vision-ai": generateVisionAiLog,
  "natural-language": generateNaturalLanguageLog,
  translation: generateTranslationLog,
  "speech-to-text": generateSpeechToTextLog,
  "text-to-speech": generateTextToSpeechLog,
  dialogflow: generateDialogflowLog,
  "document-ai": generateDocumentAiLog,
  "recommendations-ai": generateRecommendationsAiLog,
  automl: generateAutoMlLog,
  "vertex-ai-workbench": generateVertexAiWorkbenchLog,
  "vertex-ai-pipelines": generateVertexAiPipelinesLog,
  "vertex-ai-feature-store": generateVertexAiFeatureStoreLog,
  "vertex-ai-matching-engine": generateVertexAiMatchingEngineLog,
  "vertex-ai-tensorboard": generateVertexAiTensorBoardLog,
  "contact-center-ai": generateContactCenterAiLog,
  "healthcare-api": generateHealthcareApiLog,
  "retail-api": generateRetailApiLog,

  // Developer & CI/CD
  "cloud-build": mergeGcpLogVariants([generateCloudBuildLog, generateSourceRepositoriesLog]),
  "cloud-deploy": generateCloudDeployLog,
  firebase: mergeGcpLogVariants([generateFirebaseLog, generateFirebaseRtdbLog]),
  "cloud-endpoints": generateCloudEndpointsLog,
  apigee: generateApigeeLog,
  "cloud-shell": generateCloudShellLog,
  "api-gateway": mergeGcpLogVariants([generateApiGatewayLog, generateApiHubLog]),

  // Management & Governance
  "cloud-monitoring": mergeGcpLogVariants([
    generateCloudMonitoringLog,
    generateCloudTraceLog,
    generateCloudProfilerLog,
  ]),
  "cloud-logging": generateCloudLoggingLog,
  "resource-manager": mergeGcpLogVariants([
    generateResourceManagerLog,
    generateTagsLog,
    generateAccessTransparencyLog,
  ]),
  "deployment-manager": generateDeploymentManagerLog,
  "cloud-asset-inventory": generateCloudAssetInventoryLog,
  "org-policy": generateOrgPolicyLog,
  billing: mergeGcpLogVariants([generateBillingLog, generateCarbonFootprintLog]),
  "service-directory": generateServiceDirectoryLog,
  "cloud-audit-logs": generateCloudAuditLog,
  "active-assist": mergeGcpLogVariants([generateActiveAssistLog, generateRecommenderLog]),
  "essential-contacts": generateEssentialContactsLog,

  // Operations & Observability
  "error-reporting": generateErrorReportingLog,

  // IoT
  "iot-core": generateIotCoreLog,

  // Media & Communications
  transcoder: mergeGcpLogVariants([generateTranscoderLog, generateLiveStreamLog]),
  "video-intelligence": generateVideoIntelligenceLog,

  // Integration & API
  "application-integration": mergeGcpLogVariants([
    generateApplicationIntegrationLog,
    generateIntegrationConnectorsLog,
  ]),

  "gcp-security-chain": generateGcpSecurityFindingChain,
  "gcp-cspm": generateGcpCspmFindings,
  "gcp-kspm": generateGcpKspmFindings,
  "gcp-iam-privesc-chain": generateGcpIamPrivEscChain,
  "gcp-data-exfil-chain": generateGcpDataExfilChain,
};

export { GCP_GENERATORS };
