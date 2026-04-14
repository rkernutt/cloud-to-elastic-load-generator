/**
 * When `architecture-service/${name}.svg` is missing, copy from this path under `node_modules/aws-icons/icons/`.
 */
export const AWS_ICON_SOURCE_ALIASES = {
  AmazonVirtualPrivateCloud_NetworkAccessAnalyzer: "resource/AmazonVPCNetworkAccessAnalyzer.svg",
  AmazonS3StorageLens: "resource/AmazonSimpleStorageServiceS3StorageLens.svg",
  AmazonMSKConnect: "resource/AmazonMSKAmazonMSKConnect.svg",
  AmazonMWAA: "architecture-service/AmazonManagedWorkflowsforApacheAirflow.svg",
  AmazonAugmentedAI: "architecture-service/AmazonAugmentedAIA2I.svg",
  AWSApplicationRecoveryController: "architecture-service/AmazonApplicationRecoveryController.svg",
  AWSOutposts: "architecture-service/AWSOutpostsfamily.svg",
  AmazonDAX: "resource/AmazonDynamoDBAmazonDynamoDBAccelerator.svg",
  AmazonHealthOmics: "architecture-service/AWSHealthOmics.svg",
  AWSSystemsManagerIncidentManager: "resource/AWSSystemsManagerIncidentManager.svg",
  AmazonCloudWatch_RUM: "resource/AmazonCloudWatchRUM.svg",
  // Removed from `aws-icons` package — map to closest published assets so `copy-icons` succeeds.
  AmazonQLDB: "resource/Database.svg",
  AmazonLookoutforMetrics: "resource/AmazonCloudWatchMetricsInsights.svg",
  AWSPrivate5G: "architecture-service/AWSWavelength.svg",
  AWSRoboMaker: "architecture-service/AWSSimSpaceWeaver.svg",
};

/** Category-* public filenames → relative path under `icons/` (category/). */
export const CATEGORY_ICON_SOURCES = {
  "Category-Serverless": "category/Serverless.svg",
  "Category-Compute": "category/Compute.svg",
  "Category-Networking": "category/NetworkingContentDelivery.svg",
  "Category-Security": "category/SecurityIdentity.svg",
  "Category-Storage": "category/Storage.svg",
  "Category-AppIntegration": "category/ApplicationIntegration.svg",
  "Category-DevTools": "category/DeveloperTools.svg",
  "Category-Analytics": "category/Analytics.svg",
  "Category-AI": "category/ArtificialIntelligence.svg",
  "Category-IoT": "category/InternetofThings.svg",
  "Category-Management": "category/ManagementTools.svg",
  "Category-Media": "category/MediaServices.svg",
  "Category-BusinessApps": "category/BusinessApplications.svg",
};
