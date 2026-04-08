/**
 * Copy only the AWS service icon SVGs we use from aws-icons into public/aws-icons/.
 * Run after npm install (postinstall) or manually: npm run copy-icons
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const srcDir = path.join(root, "node_modules", "aws-icons", "icons", "architecture-service");
const destDir = path.join(root, "public", "aws-icons");

const UNIQUE_ICON_FILES = new Set([
  "AWSLambda",
  "AmazonAPIGateway",
  "AmazonVirtualPrivateCloud",
  "AWSCloudTrail",
  "AmazonRDS",
  "AmazonElasticContainerService",
  "AmazonEC2",
  "AmazonElasticKubernetesService",
  "AWSAppRunner",
  "AWSBatch",
  "AWSElasticBeanstalk",
  "AmazonElasticContainerRegistry",
  "AWSFargate",
  "AmazonEC2AutoScaling",
  "AmazonEC2ImageBuilder",
  "ElasticLoadBalancing",
  "AmazonCloudFront",
  "AWSWAF",
  "AmazonRoute53",
  "AWSNetworkFirewall",
  "AWSShield",
  "AWSGlobalAccelerator",
  "AWSTransitGateway",
  "AWSDirectConnect",
  "AWSSitetoSiteVPN",
  "AWSPrivateLink",
  "AmazonGuardDuty",
  "AWSSecurityHub",
  "AmazonMacie",
  "AmazonInspector",
  "AWSConfig",
  "AWSIdentityandAccessManagement",
  "AmazonCognito",
  "AWSKeyManagementService",
  "AWSSecretsManager",
  "AWSCertificateManager",
  "AWSIAMIdentityCenter",
  "AmazonDetective",
  "AmazonSimpleStorageService",
  "AmazonDynamoDB",
  "AmazonElastiCache",
  "AmazonRedshift",
  "AmazonOpenSearchService",
  "AmazonDocumentDB",
  "AmazonElasticBlockStore",
  "AmazonEFS",
  "AmazonFSx",
  "AWSDataSync",
  "AWSBackup",
  "AWSStorageGateway",
  "AmazonAurora",
  "AmazonNeptune",
  "AmazonTimestream",
  "AmazonQuantumLedgerDatabase",
  "AmazonKeyspaces",
  "AmazonMemoryDB",
  "AmazonKinesisDataStreams",
  "AmazonDataFirehose",
  "AmazonManagedServiceforApacheFlink",
  "AmazonManagedStreamingforApacheKafka",
  "AmazonSimpleQueueService",
  "AmazonSimpleNotificationService",
  "AmazonMQ",
  "AmazonEventBridge",
  "AWSStepFunctions",
  "AWSAppSync",
  "AWSCodeBuild",
  "AWSCodePipeline",
  "AWSCodeDeploy",
  "AWSCodeCommit",
  "AWSCodeArtifact",
  "AWSAmplify",
  "AWSXRay",
  "AmazonEMR",
  "AWSGlue",
  "AmazonAthena",
  "AWSLakeFormation",
  "AmazonQuickSuite",
  "AWSGlueDataBrew",
  "AmazonAppFlow",
  "AmazonSageMaker",
  "AmazonBedrock",
  "AmazonBedrockAgentCore",
  "AmazonRekognition",
  "AmazonTextract",
  "AmazonComprehend",
  "AmazonTranslate",
  "AmazonTranscribe",
  "AmazonPolly",
  "AmazonForecast",
  "AmazonPersonalize",
  "AmazonLex",
  "AWSIoTCore",
  "AWSIoTGreengrass",
  "AWSCloudFormation",
  "AWSSystemsManager",
  "AmazonCloudWatch",
  "AWSHealthDashboard",
  "AWSTrustedAdvisor",
  "AWSControlTower",
  "AWSOrganizations",
  "AWSServiceCatalog",
  "AWSComputeOptimizer",
  "AWSBudgets",
  "AWSCostExplorer",
  "AWSResourceAccessManager",
  "AWSResilienceHub",
  "AWSMigrationHub",
  "AWSCloudWAN",
  "AWSDatabaseMigrationService",
  "AWSElementalMediaConvert",
  "AWSElementalMediaLive",
  "AmazonWorkSpaces",
  "AmazonConnect",
  "AmazonGameLiftServers",
  "AmazonSimpleEmailService",
  "AmazonPinpoint",
  "AWSTransferFamily",
  "AmazonLightsail",
  "AmazonFraudDetector",
  "AmazonLookoutforMetrics",
  "AmazonComprehendMedical",
  "AmazonLocationService",
  "AmazonManagedBlockchain",
  "AmazonCodeGuru",
  "AmazonDevOpsGuru",
  "AWSIoTEvents",
  "AWSIoTSiteWise",
  "AWSIoTDeviceDefender",
]);

if (!fs.existsSync(srcDir)) {
  console.warn("aws-icons not installed. Run: npm install aws-icons --save-dev");
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });
let copied = 0;
for (const name of UNIQUE_ICON_FILES) {
  const src = path.join(srcDir, `${name}.svg`);
  const dest = path.join(destDir, `${name}.svg`);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    copied++;
  }
}
console.log(`Copied ${copied} AWS icon(s) to public/aws-icons/`);
