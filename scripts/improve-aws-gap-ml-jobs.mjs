#!/usr/bin/env node
/**
 * Upgrade generic gap-coverage and minimal-coverage ML jobs with service-specific
 * detectors, influencers, and data stream index patterns.
 */
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const jobsDir = join(root, "installer/aws-custom-ml-jobs/jobs");

/** @typedef {{ function: string, field_name?: string, partition_field_name?: string, by_field_name?: string, detector_description: string }} Detector */

/**
 * Per-dataset ML tuning. Keys are event.dataset values.
 * @type {Record<string, {
 *   label: string,
 *   category: string,
 *   partition: string,
 *   influencers: string[],
 *   logIndex: string,
 *   metricsIndex?: string,
 *   error: Detector,
 *   activity: Detector,
 * }>}
 */
const DATASET_CONFIG = {
  "aws.accessanalyzer": {
    label: "IAM Access Analyzer",
    category: "security",
    partition: "aws.access_analyzer.analyzer_name",
    influencers: ["aws.access_analyzer.finding_type", "cloud.region"],
    logIndex: "logs-aws.accessanalyzer*",
    metricsIndex: "metrics-aws.accessanalyzer*",
    error: {
      function: "high_count",
      partition_field_name: "aws.access_analyzer.analyzer_name",
      detector_description: "High count of Access Analyzer failures by analyzer",
    },
    activity: {
      function: "high_mean",
      field_name: "aws.accessanalyzer.metrics.ActiveFindingsCount.avg",
      partition_field_name: "aws.accessanalyzer.dimensions.AnalyzerName",
      detector_description: "High mean active findings by analyzer",
    },
  },
  "aws.acm": {
    label: "Certificate Manager",
    category: "security",
    partition: "aws.acm.certificate_arn",
    influencers: ["aws.acm.domain_name", "cloud.region"],
    logIndex: "logs-aws.acm*",
    error: {
      function: "high_count",
      partition_field_name: "aws.acm.certificate_arn",
      detector_description: "High count of ACM certificate failures",
    },
    activity: {
      function: "rare",
      by_field_name: "event.action",
      partition_field_name: "aws.acm.certificate_arn",
      detector_description: "Rare ACM API operations per certificate",
    },
  },
  "aws.amazonmq": {
    label: "Amazon MQ",
    category: "messaging",
    partition: "aws.amazonmq.broker_id",
    influencers: ["aws.amazonmq.queue_name", "cloud.region"],
    logIndex: "logs-aws.amazonmq*",
    metricsIndex: "metrics-aws.amazonmq*",
    error: {
      function: "high_count",
      partition_field_name: "aws.amazonmq.broker_id",
      detector_description: "High count of Amazon MQ broker failures",
    },
    activity: {
      function: "high_mean",
      field_name: "aws.amazonmq.metrics.QueueSize.avg",
      partition_field_name: "aws.amazonmq.broker_id",
      detector_description: "High mean queue depth per broker",
    },
  },
  "aws.amplify": {
    label: "Amplify",
    category: "compute",
    partition: "aws.amplify.app_id",
    influencers: ["aws.amplify.branch_name", "cloud.region"],
    logIndex: "logs-aws.amplify*",
    error: {
      function: "high_count",
      partition_field_name: "aws.amplify.app_id",
      detector_description: "High count of Amplify deployment failures",
    },
    activity: {
      function: "high_mean",
      field_name: "event.duration",
      partition_field_name: "aws.amplify.app_id",
      detector_description: "High mean build duration per Amplify app",
    },
  },
  "aws.appflow": {
    label: "AppFlow",
    category: "analytics",
    partition: "aws.appflow.flow_name",
    influencers: ["aws.appflow.connector_type", "cloud.region"],
    logIndex: "logs-aws.appflow*",
    metricsIndex: "metrics-aws.appflow*",
    error: {
      function: "high_count",
      partition_field_name: "aws.appflow.flow_name",
      detector_description: "High count of AppFlow run failures",
    },
    activity: {
      function: "high_mean",
      field_name: "aws.appflow.metrics.FlowExecutionsFailed.sum",
      partition_field_name: "aws.appflow.flow_name",
      detector_description: "High mean failed flow executions",
    },
  },
  "aws.apprunner": {
    label: "App Runner",
    category: "compute",
    partition: "aws.apprunner.service_name",
    influencers: ["aws.apprunner.service_arn", "cloud.region"],
    logIndex: "logs-aws.apprunner*",
    error: {
      function: "high_count",
      partition_field_name: "aws.apprunner.service_name",
      detector_description: "High count of App Runner service failures",
    },
    activity: {
      function: "high_mean",
      field_name: "event.duration",
      partition_field_name: "aws.apprunner.service_name",
      detector_description: "High mean request duration per service",
    },
  },
  "aws.appstream": {
    label: "AppStream",
    category: "compute",
    partition: "aws.appstream.fleet_name",
    influencers: ["aws.appstream.stack_name", "cloud.region"],
    logIndex: "logs-aws.appstream*",
    error: {
      function: "high_count",
      partition_field_name: "aws.appstream.fleet_name",
      detector_description: "High count of AppStream session failures",
    },
    activity: {
      function: "high_mean",
      field_name: "aws.appstream.metrics.ActiveSessions.avg",
      partition_field_name: "aws.appstream.fleet_name",
      detector_description: "High mean active sessions per fleet",
    },
  },
  "aws.appsync": {
    label: "AppSync",
    category: "compute",
    partition: "aws.appsync.api_id",
    influencers: ["aws.appsync.graphql_api_name", "cloud.region"],
    logIndex: "logs-aws.appsync*",
    error: {
      function: "high_count",
      partition_field_name: "aws.appsync.api_id",
      detector_description: "High count of AppSync resolver errors",
    },
    activity: {
      function: "high_mean",
      field_name: "event.duration",
      partition_field_name: "aws.appsync.api_id",
      detector_description: "High mean GraphQL latency per API",
    },
  },
  "aws.backup": {
    label: "AWS Backup",
    category: "storage",
    partition: "aws.backup.backup_vault_name",
    influencers: ["aws.backup.resource_type", "cloud.region"],
    logIndex: "logs-aws.backup*",
    error: {
      function: "high_count",
      partition_field_name: "aws.backup.backup_vault_name",
      detector_description: "High count of backup job failures",
    },
    activity: {
      function: "high_sum",
      field_name: "aws.backup.bytes_transferred",
      partition_field_name: "aws.backup.backup_vault_name",
      detector_description: "High sum backup bytes transferred per vault",
    },
  },
  "aws.batch": {
    label: "AWS Batch",
    category: "compute",
    partition: "aws.batch.job_queue",
    influencers: ["aws.batch.job_definition", "cloud.region"],
    logIndex: "logs-aws.batch*",
    error: {
      function: "high_count",
      partition_field_name: "aws.batch.job_queue",
      detector_description: "High count of Batch job failures",
    },
    activity: {
      function: "high_mean",
      field_name: "event.duration",
      partition_field_name: "aws.batch.job_queue",
      detector_description: "High mean job duration per queue",
    },
  },
  "aws.budgets": {
    label: "AWS Budgets",
    category: "management",
    partition: "aws.budgets.budget_name",
    influencers: ["cloud.account.id", "cloud.region"],
    logIndex: "logs-aws.budgets*",
    error: {
      function: "high_count",
      partition_field_name: "aws.budgets.budget_name",
      detector_description: "High count of budget threshold breaches",
    },
    activity: {
      function: "high_mean",
      field_name: "aws.budgets.actual_spend",
      partition_field_name: "aws.budgets.budget_name",
      detector_description: "High mean actual spend per budget",
    },
  },
  "aws.codeartifact": {
    label: "CodeArtifact",
    category: "devtools",
    partition: "aws.codeartifact.repository",
    influencers: ["aws.codeartifact.domain", "cloud.region"],
    logIndex: "logs-aws.codeartifact*",
    error: {
      function: "high_count",
      partition_field_name: "aws.codeartifact.repository",
      detector_description: "High count of CodeArtifact API failures",
    },
    activity: {
      function: "rare",
      by_field_name: "event.action",
      partition_field_name: "aws.codeartifact.repository",
      detector_description: "Rare package operations per repository",
    },
  },
  "aws.codecommit": {
    label: "CodeCommit",
    category: "devtools",
    partition: "aws.codecommit.repository_name",
    influencers: ["event.action", "cloud.region"],
    logIndex: "logs-aws.codecommit*",
    error: {
      function: "high_count",
      partition_field_name: "aws.codecommit.repository_name",
      detector_description: "High count of CodeCommit operation failures",
    },
    activity: {
      function: "rare",
      by_field_name: "user.name",
      partition_field_name: "aws.codecommit.repository_name",
      detector_description: "Rare Git push users per repository",
    },
  },
  "aws.codedeploy": {
    label: "CodeDeploy",
    category: "devtools",
    partition: "aws.codedeploy.deployment_group",
    influencers: ["aws.codedeploy.application_name", "cloud.region"],
    logIndex: "logs-aws.codedeploy*",
    error: {
      function: "high_count",
      partition_field_name: "aws.codedeploy.deployment_group",
      detector_description: "High count of CodeDeploy deployment failures",
    },
    activity: {
      function: "high_mean",
      field_name: "event.duration",
      partition_field_name: "aws.codedeploy.deployment_group",
      detector_description: "High mean deployment duration per group",
    },
  },
  "aws.codeguru": {
    label: "CodeGuru",
    category: "devtools",
    partition: "aws.codeguru.repository_name",
    influencers: ["aws.codeguru.recommendation_type", "cloud.region"],
    logIndex: "logs-aws.codeguru*",
    error: {
      function: "high_count",
      partition_field_name: "aws.codeguru.repository_name",
      detector_description: "High count of CodeGuru review failures",
    },
    activity: {
      function: "high_count",
      partition_field_name: "aws.codeguru.repository_name",
      detector_description: "High count of security recommendations",
    },
  },
  "aws.cognito": {
    label: "Cognito",
    category: "security",
    partition: "aws.cognito.user_pool_id",
    influencers: ["aws.cognito.client_id", "cloud.region"],
    logIndex: "logs-aws.cognito*",
    error: {
      function: "high_count",
      partition_field_name: "aws.cognito.user_pool_id",
      detector_description: "High count of Cognito authentication failures",
    },
    activity: {
      function: "high_mean",
      field_name: "aws.cognito.metrics.ThrottleCount.sum",
      partition_field_name: "aws.cognito.user_pool_id",
      detector_description: "High mean throttle events per user pool",
    },
  },
  "aws.comprehend": {
    label: "Comprehend",
    category: "aiml",
    partition: "aws.comprehend.job_id",
    influencers: ["aws.comprehend.language_code", "cloud.region"],
    logIndex: "logs-aws.comprehend*",
    error: {
      function: "high_count",
      partition_field_name: "aws.comprehend.job_id",
      detector_description: "High count of Comprehend job failures",
    },
    activity: {
      function: "high_mean",
      field_name: "event.duration",
      partition_field_name: "aws.comprehend.job_id",
      detector_description: "High mean NLP job duration",
    },
  },
  "aws.comprehendmedical": {
    label: "Comprehend Medical",
    category: "aiml",
    partition: "aws.comprehendmedical.job_id",
    influencers: ["cloud.region"],
    logIndex: "logs-aws.comprehendmedical*",
    error: {
      function: "high_count",
      partition_field_name: "aws.comprehendmedical.job_id",
      detector_description: "High count of Comprehend Medical job failures",
    },
    activity: {
      function: "high_mean",
      field_name: "event.duration",
      partition_field_name: "aws.comprehendmedical.job_id",
      detector_description: "High mean medical NLP job duration",
    },
  },
  "aws.computeoptimizer": {
    label: "Compute Optimizer",
    category: "management",
    partition: "aws.computeoptimizer.resource_arn",
    influencers: ["aws.computeoptimizer.finding", "cloud.region"],
    logIndex: "logs-aws.computeoptimizer*",
    error: {
      function: "high_count",
      partition_field_name: "aws.computeoptimizer.resource_arn",
      detector_description: "High count of optimization recommendation errors",
    },
    activity: {
      function: "high_count",
      partition_field_name: "aws.computeoptimizer.resource_arn",
      detector_description: "High count of under-provisioned findings",
    },
  },
  "aws.controltower": {
    label: "Control Tower",
    category: "management",
    partition: "cloud.account.id",
    influencers: ["aws.controltower.control_identifier", "cloud.region"],
    logIndex: "logs-aws.controltower*",
    error: {
      function: "high_count",
      partition_field_name: "cloud.account.id",
      detector_description: "High count of Control Tower drift events",
    },
    activity: {
      function: "rare",
      by_field_name: "event.action",
      partition_field_name: "cloud.account.id",
      detector_description: "Rare Control Tower API operations per account",
    },
  },
  "aws.databrew": {
    label: "DataBrew",
    category: "analytics",
    partition: "aws.databrew.job_name",
    influencers: ["aws.databrew.dataset_name", "cloud.region"],
    logIndex: "logs-aws.databrew*",
    error: {
      function: "high_count",
      partition_field_name: "aws.databrew.job_name",
      detector_description: "High count of DataBrew job failures",
    },
    activity: {
      function: "high_mean",
      field_name: "event.duration",
      partition_field_name: "aws.databrew.job_name",
      detector_description: "High mean DataBrew job duration",
    },
  },
  "aws.datasync": {
    label: "DataSync",
    category: "storage",
    partition: "aws.datasync.task_arn",
    influencers: ["aws.datasync.location_arn", "cloud.region"],
    logIndex: "logs-aws.datasync*",
    error: {
      function: "high_count",
      partition_field_name: "aws.datasync.task_arn",
      detector_description: "High count of DataSync task failures",
    },
    activity: {
      function: "high_sum",
      field_name: "aws.datasync.bytes_transferred",
      partition_field_name: "aws.datasync.task_arn",
      detector_description: "High sum bytes transferred per task",
    },
  },
  "aws.detective": {
    label: "Detective",
    category: "security",
    partition: "aws.detective.graph_arn",
    influencers: ["cloud.account.id", "cloud.region"],
    logIndex: "logs-aws.detective*",
    error: {
      function: "high_count",
      partition_field_name: "aws.detective.graph_arn",
      detector_description: "High count of Detective investigation errors",
    },
    activity: {
      function: "high_mean",
      field_name: "aws.detective.metrics.TotalFindingCount.avg",
      partition_field_name: "aws.detective.graph_arn",
      detector_description: "High mean finding count per graph",
    },
  },
  "aws.devopsguru": {
    label: "DevOps Guru",
    category: "management",
    partition: "aws.devopsguru.resource_arn",
    influencers: ["aws.devopsguru.severity", "cloud.region"],
    logIndex: "logs-aws.devopsguru*",
    error: {
      function: "high_count",
      partition_field_name: "aws.devopsguru.resource_arn",
      detector_description: "High count of DevOps Guru insight errors",
    },
    activity: {
      function: "high_count",
      partition_field_name: "aws.devopsguru.resource_arn",
      detector_description: "High count of reactive insights",
    },
  },
  "aws.directconnect": {
    label: "Direct Connect",
    category: "networking",
    partition: "aws.directconnect.connection_id",
    influencers: ["aws.directconnect.virtual_interface_id", "cloud.region"],
    logIndex: "logs-aws.directconnect*",
    metricsIndex: "metrics-aws.directconnect*",
    error: {
      function: "high_count",
      partition_field_name: "aws.directconnect.connection_id",
      detector_description: "High count of Direct Connect errors",
    },
    activity: {
      function: "high_sum",
      field_name: "aws.directconnect.metrics.ConnectionBpsEgress.sum",
      partition_field_name: "aws.directconnect.connection_id",
      detector_description: "High sum egress bandwidth per connection",
    },
  },
  "aws.docdb": {
    label: "DocumentDB",
    category: "database",
    partition: "aws.docdb.dimensions.DBClusterIdentifier",
    influencers: ["aws.docdb.dimensions.DBInstanceIdentifier", "cloud.region"],
    logIndex: "logs-aws.docdb*",
    metricsIndex: "metrics-aws.docdb*",
    error: {
      function: "high_count",
      partition_field_name: "aws.docdb.dimensions.DBClusterIdentifier",
      detector_description: "High count of DocumentDB failures",
    },
    activity: {
      function: "high_mean",
      field_name: "aws.docdb.metrics.CPUUtilization.avg",
      partition_field_name: "aws.docdb.dimensions.DBClusterIdentifier",
      detector_description: "High mean CPU utilization per cluster",
    },
  },
  "aws.ecr": {
    label: "ECR",
    category: "compute",
    partition: "aws.ecr.repository",
    influencers: ["aws.ecr.image_tag", "cloud.region"],
    logIndex: "logs-aws.ecr*",
    error: {
      function: "high_count",
      partition_field_name: "aws.ecr.repository",
      detector_description: "High count of ECR push/pull failures",
    },
    activity: {
      function: "rare",
      by_field_name: "user.name",
      partition_field_name: "aws.ecr.repository",
      detector_description: "Rare image push users per repository",
    },
  },
  "aws.efs": {
    label: "EFS",
    category: "storage",
    partition: "aws.efs.file_system_id",
    influencers: ["cloud.region"],
    logIndex: "logs-aws.efs*",
    metricsIndex: "metrics-aws.efs*",
    error: {
      function: "high_count",
      partition_field_name: "aws.efs.file_system_id",
      detector_description: "High count of EFS access failures",
    },
    activity: {
      function: "high_mean",
      field_name: "aws.efs.metrics.PercentIOLimit.avg",
      partition_field_name: "aws.efs.file_system_id",
      detector_description: "High mean IO limit utilization per file system",
    },
  },
  "aws.fargate": {
    label: "Fargate",
    category: "compute",
    partition: "aws.ecs.cluster_arn",
    influencers: ["aws.ecs.task_definition", "cloud.region"],
    logIndex: "logs-aws.fargate*",
    error: {
      function: "high_count",
      partition_field_name: "aws.ecs.cluster_arn",
      detector_description: "High count of Fargate task failures",
    },
    activity: {
      function: "high_mean",
      field_name: "aws.ecs.metrics.CPUUtilization.avg",
      partition_field_name: "aws.ecs.cluster_arn",
      detector_description: "High mean CPU utilization per cluster",
    },
  },
  "aws.forecast": {
    label: "Forecast",
    category: "aiml",
    partition: "aws.forecast.predictor_arn",
    influencers: ["aws.forecast.dataset_arn", "cloud.region"],
    logIndex: "logs-aws.forecast*",
    error: {
      function: "high_count",
      partition_field_name: "aws.forecast.predictor_arn",
      detector_description: "High count of Forecast job failures",
    },
    activity: {
      function: "high_mean",
      field_name: "event.duration",
      partition_field_name: "aws.forecast.predictor_arn",
      detector_description: "High mean forecast training duration",
    },
  },
  "aws.frauddetector": {
    label: "Fraud Detector",
    category: "aiml",
    partition: "aws.frauddetector.detector_id",
    influencers: ["aws.frauddetector.model_version", "cloud.region"],
    logIndex: "logs-aws.frauddetector*",
    error: {
      function: "high_count",
      partition_field_name: "aws.frauddetector.detector_id",
      detector_description: "High count of Fraud Detector evaluation errors",
    },
    activity: {
      function: "high_mean",
      field_name: "event.duration",
      partition_field_name: "aws.frauddetector.detector_id",
      detector_description: "High mean fraud scoring latency",
    },
  },
  "aws.fsx": {
    label: "FSx",
    category: "storage",
    partition: "aws.fsx.file_system_id",
    influencers: ["aws.fsx.storage_type", "cloud.region"],
    logIndex: "logs-aws.fsx*",
    metricsIndex: "metrics-aws.fsx*",
    error: {
      function: "high_count",
      partition_field_name: "aws.fsx.file_system_id",
      detector_description: "High count of FSx file system errors",
    },
    activity: {
      function: "high_mean",
      field_name: "aws.fsx.metrics.DataReadBytes.avg",
      partition_field_name: "aws.fsx.file_system_id",
      detector_description: "High mean read throughput per file system",
    },
  },
  "aws.gamelift": {
    label: "GameLift",
    category: "compute",
    partition: "aws.gamelift.fleet_id",
    influencers: ["aws.gamelift.build_id", "cloud.region"],
    logIndex: "logs-aws.gamelift*",
    error: {
      function: "high_count",
      partition_field_name: "aws.gamelift.fleet_id",
      detector_description: "High count of GameLift session failures",
    },
    activity: {
      function: "high_mean",
      field_name: "aws.gamelift.metrics.PlacementsStarted.avg",
      partition_field_name: "aws.gamelift.fleet_id",
      detector_description: "High mean placement starts per fleet",
    },
  },
  "aws.globalaccelerator": {
    label: "Global Accelerator",
    category: "networking",
    partition: "aws.globalaccelerator.accelerator_arn",
    influencers: ["aws.globalaccelerator.listener_arn", "cloud.region"],
    logIndex: "logs-aws.globalaccelerator*",
    error: {
      function: "high_count",
      partition_field_name: "aws.globalaccelerator.accelerator_arn",
      detector_description: "High count of Global Accelerator errors",
    },
    activity: {
      function: "high_sum",
      field_name: "aws.globalaccelerator.metrics.ProcessedBytesIn.sum",
      partition_field_name: "aws.globalaccelerator.accelerator_arn",
      detector_description: "High sum inbound bytes per accelerator",
    },
  },
  "aws.greengrass": {
    label: "Greengrass",
    category: "iot",
    partition: "aws.greengrass.thing_name",
    influencers: ["aws.greengrass.group_id", "cloud.region"],
    logIndex: "logs-aws.greengrass*",
    error: {
      function: "high_count",
      partition_field_name: "aws.greengrass.thing_name",
      detector_description: "High count of Greengrass deployment failures",
    },
    activity: {
      function: "rare",
      by_field_name: "event.action",
      partition_field_name: "aws.greengrass.thing_name",
      detector_description: "Rare Greengrass operations per device",
    },
  },
  "aws.identitycenter": {
    label: "IAM Identity Center",
    category: "security",
    partition: "user.name",
    influencers: ["aws.identitycenter.permission_set_arn", "cloud.region"],
    logIndex: "logs-aws.identitycenter*",
    error: {
      function: "high_count",
      partition_field_name: "user.name",
      detector_description: "High count of Identity Center auth failures",
    },
    activity: {
      function: "rare",
      by_field_name: "event.action",
      partition_field_name: "user.name",
      detector_description: "Rare SSO operations per user",
    },
  },
  "aws.imagebuilder": {
    label: "EC2 Image Builder",
    category: "compute",
    partition: "aws.imagebuilder.image_pipeline_arn",
    influencers: ["aws.imagebuilder.image_recipe_arn", "cloud.region"],
    logIndex: "logs-aws.imagebuilder*",
    error: {
      function: "high_count",
      partition_field_name: "aws.imagebuilder.image_pipeline_arn",
      detector_description: "High count of image build failures",
    },
    activity: {
      function: "high_mean",
      field_name: "event.duration",
      partition_field_name: "aws.imagebuilder.image_pipeline_arn",
      detector_description: "High mean image build duration",
    },
  },
  "aws.iotanalytics": {
    label: "IoT Analytics",
    category: "iot",
    partition: "aws.iotanalytics.dataset_name",
    influencers: ["aws.iotanalytics.channel_name", "cloud.region"],
    logIndex: "logs-aws.iotanalytics*",
    error: {
      function: "high_count",
      partition_field_name: "aws.iotanalytics.dataset_name",
      detector_description: "High count of IoT Analytics pipeline failures",
    },
    activity: {
      function: "high_mean",
      field_name: "event.duration",
      partition_field_name: "aws.iotanalytics.dataset_name",
      detector_description: "High mean pipeline processing duration",
    },
  },
  "aws.iotdefender": {
    label: "IoT Device Defender",
    category: "iot",
    partition: "aws.iotdefender.account_id",
    influencers: ["aws.iotdefender.check_name", "cloud.region"],
    logIndex: "logs-aws.iotdefender*",
    error: {
      function: "high_count",
      partition_field_name: "aws.iotdefender.check_name",
      detector_description: "High count of IoT security check failures",
    },
    activity: {
      function: "high_count",
      partition_field_name: "aws.iotdefender.check_name",
      detector_description: "High count of failed security checks",
    },
  },
  "aws.iotevents": {
    label: "IoT Events",
    category: "iot",
    partition: "aws.iotevents.detector_model_name",
    influencers: ["aws.iotevents.input_name", "cloud.region"],
    logIndex: "logs-aws.iotevents*",
    error: {
      function: "high_count",
      partition_field_name: "aws.iotevents.detector_model_name",
      detector_description: "High count of IoT Events detector errors",
    },
    activity: {
      function: "high_count",
      partition_field_name: "aws.iotevents.detector_model_name",
      detector_description: "High count of triggered alarms",
    },
  },
  "aws.iotsitewise": {
    label: "IoT SiteWise",
    category: "iot",
    partition: "aws.iotsitewise.asset_id",
    influencers: ["aws.iotsitewise.property_id", "cloud.region"],
    logIndex: "logs-aws.iotsitewise*",
    error: {
      function: "high_count",
      partition_field_name: "aws.iotsitewise.asset_id",
      detector_description: "High count of SiteWise ingestion failures",
    },
    activity: {
      function: "high_mean",
      field_name: "event.duration",
      partition_field_name: "aws.iotsitewise.asset_id",
      detector_description: "High mean ingestion latency per asset",
    },
  },
  "aws.keyspaces": {
    label: "Keyspaces",
    category: "database",
    partition: "aws.keyspaces.keyspace",
    influencers: ["aws.keyspaces.table_name", "cloud.region"],
    logIndex: "logs-aws.keyspaces*",
    error: {
      function: "high_count",
      partition_field_name: "aws.keyspaces.table_name",
      detector_description: "High count of Keyspaces request failures",
    },
    activity: {
      function: "high_mean",
      field_name: "event.duration",
      partition_field_name: "aws.keyspaces.table_name",
      detector_description: "High mean Cassandra API latency per table",
    },
  },
  "aws.lakeformation": {
    label: "Lake Formation",
    category: "analytics",
    partition: "aws.lakeformation.database_name",
    influencers: ["aws.lakeformation.table_name", "cloud.region"],
    logIndex: "logs-aws.lakeformation*",
    error: {
      function: "high_count",
      partition_field_name: "aws.lakeformation.database_name",
      detector_description: "High count of Lake Formation permission errors",
    },
    activity: {
      function: "rare",
      by_field_name: "user.name",
      partition_field_name: "aws.lakeformation.database_name",
      detector_description: "Rare data lake access patterns per database",
    },
  },
  "aws.lex": {
    label: "Lex",
    category: "aiml",
    partition: "aws.lex.bot_name",
    influencers: ["aws.lex.bot_alias", "cloud.region"],
    logIndex: "logs-aws.lex*",
    error: {
      function: "high_count",
      partition_field_name: "aws.lex.bot_name",
      detector_description: "High count of Lex bot session failures",
    },
    activity: {
      function: "high_mean",
      field_name: "event.duration",
      partition_field_name: "aws.lex.bot_name",
      detector_description: "High mean Lex intent processing duration",
    },
  },
  "aws.lightsail": {
    label: "Lightsail",
    category: "compute",
    partition: "aws.lightsail.instance_name",
    influencers: ["cloud.region"],
    logIndex: "logs-aws.lightsail*",
    error: {
      function: "high_count",
      partition_field_name: "aws.lightsail.instance_name",
      detector_description: "High count of Lightsail instance errors",
    },
    activity: {
      function: "high_mean",
      field_name: "aws.lightsail.metrics.CPUUtilization.avg",
      partition_field_name: "aws.lightsail.instance_name",
      detector_description: "High mean CPU per Lightsail instance",
    },
  },
  "aws.location": {
    label: "Location Service",
    category: "aiml",
    partition: "aws.location.tracker_name",
    influencers: ["event.action", "cloud.region"],
    logIndex: "logs-aws.location*",
    error: {
      function: "high_count",
      partition_field_name: "aws.location.tracker_name",
      detector_description: "High count of Location Service API failures",
    },
    activity: {
      function: "high_mean",
      field_name: "event.duration",
      partition_field_name: "aws.location.tracker_name",
      detector_description: "High mean geolocation API latency",
    },
  },
  "aws.lookoutmetrics": {
    label: "Lookout for Metrics",
    category: "aiml",
    partition: "aws.lookoutmetrics.anomaly_detector_arn",
    influencers: ["aws.lookoutmetrics.metric_set_arn", "cloud.region"],
    logIndex: "logs-aws.lookoutmetrics*",
    error: {
      function: "high_count",
      partition_field_name: "aws.lookoutmetrics.anomaly_detector_arn",
      detector_description: "High count of anomaly detector errors",
    },
    activity: {
      function: "high_count",
      partition_field_name: "aws.lookoutmetrics.anomaly_detector_arn",
      detector_description: "High count of detected metric anomalies",
    },
  },
  "aws.blockchain": {
    label: "Managed Blockchain",
    category: "aiml",
    partition: "aws.blockchain.network_id",
    influencers: ["aws.blockchain.member_id", "cloud.region"],
    logIndex: "logs-aws.blockchain*",
    error: {
      function: "high_count",
      partition_field_name: "aws.blockchain.network_id",
      detector_description: "High count of blockchain network errors",
    },
    activity: {
      function: "high_mean",
      field_name: "event.duration",
      partition_field_name: "aws.blockchain.network_id",
      detector_description: "High mean transaction processing duration",
    },
  },
  "aws.medialive": {
    label: "MediaLive",
    category: "media",
    partition: "aws.medialive.channel_id",
    influencers: ["aws.medialive.pipeline", "cloud.region"],
    logIndex: "logs-aws.medialive*",
    error: {
      function: "high_count",
      partition_field_name: "aws.medialive.channel_id",
      detector_description: "High count of MediaLive channel errors",
    },
    activity: {
      function: "high_mean",
      field_name: "aws.medialive.metrics.ActiveAlerts.avg",
      partition_field_name: "aws.medialive.channel_id",
      detector_description: "High mean active alerts per channel",
    },
  },
  "aws.memorydb": {
    label: "MemoryDB",
    category: "database",
    partition: "aws.memorydb.cluster_name",
    influencers: ["aws.memorydb.node_name", "cloud.region"],
    logIndex: "logs-aws.memorydb*",
    metricsIndex: "metrics-aws.memorydb*",
    error: {
      function: "high_count",
      partition_field_name: "aws.memorydb.cluster_name",
      detector_description: "High count of MemoryDB cluster failures",
    },
    activity: {
      function: "high_mean",
      field_name: "aws.memorydb.metrics.EngineCPUUtilization.avg",
      partition_field_name: "aws.memorydb.cluster_name",
      detector_description: "High mean engine CPU per cluster",
    },
  },
  "aws.migrationhub": {
    label: "Migration Hub",
    category: "management",
    partition: "aws.migrationhub.application_name",
    influencers: ["aws.migrationhub.progress_status", "cloud.region"],
    logIndex: "logs-aws.migrationhub*",
    error: {
      function: "high_count",
      partition_field_name: "aws.migrationhub.application_name",
      detector_description: "High count of migration task failures",
    },
    activity: {
      function: "high_count",
      partition_field_name: "aws.migrationhub.application_name",
      detector_description: "High count of blocked migration steps",
    },
  },
  "aws.networkmanager": {
    label: "Network Manager",
    category: "networking",
    partition: "aws.networkmanager.core_network_id",
    influencers: ["aws.networkmanager.segment_name", "cloud.region"],
    logIndex: "logs-aws.networkmanager*",
    error: {
      function: "high_count",
      partition_field_name: "aws.networkmanager.core_network_id",
      detector_description: "High count of network topology errors",
    },
    activity: {
      function: "rare",
      by_field_name: "event.action",
      partition_field_name: "aws.networkmanager.core_network_id",
      detector_description: "Rare network change operations",
    },
  },
  "aws.organizations": {
    label: "Organizations",
    category: "management",
    partition: "cloud.account.id",
    influencers: ["event.action", "cloud.region"],
    logIndex: "logs-aws.organizations*",
    error: {
      function: "high_count",
      partition_field_name: "cloud.account.id",
      detector_description: "High count of Organizations API failures",
    },
    activity: {
      function: "rare",
      by_field_name: "event.action",
      partition_field_name: "cloud.account.id",
      detector_description: "Rare org policy changes per account",
    },
  },
  "aws.personalize": {
    label: "Personalize",
    category: "aiml",
    partition: "aws.personalize.campaign_arn",
    influencers: ["aws.personalize.recommender_arn", "cloud.region"],
    logIndex: "logs-aws.personalize*",
    error: {
      function: "high_count",
      partition_field_name: "aws.personalize.campaign_arn",
      detector_description: "High count of Personalize recommendation errors",
    },
    activity: {
      function: "high_mean",
      field_name: "event.duration",
      partition_field_name: "aws.personalize.campaign_arn",
      detector_description: "High mean recommendation latency",
    },
  },
  "aws.pinpoint": {
    label: "Pinpoint",
    category: "messaging",
    partition: "aws.pinpoint.application_id",
    influencers: ["aws.pinpoint.campaign_id", "cloud.region"],
    logIndex: "logs-aws.pinpoint*",
    error: {
      function: "high_count",
      partition_field_name: "aws.pinpoint.application_id",
      detector_description: "High count of Pinpoint delivery failures",
    },
    activity: {
      function: "high_mean",
      field_name: "aws.pinpoint.metrics.DeliveryAttempts.sum",
      partition_field_name: "aws.pinpoint.application_id",
      detector_description: "High mean delivery attempts per application",
    },
  },
  "aws.polly": {
    label: "Polly",
    category: "aiml",
    partition: "aws.polly.voice_id",
    influencers: ["event.action", "cloud.region"],
    logIndex: "logs-aws.polly*",
    error: {
      function: "high_count",
      partition_field_name: "aws.polly.voice_id",
      detector_description: "High count of Polly synthesis failures",
    },
    activity: {
      function: "high_mean",
      field_name: "event.duration",
      partition_field_name: "aws.polly.voice_id",
      detector_description: "High mean speech synthesis duration",
    },
  },
  "aws.privatelink": {
    label: "PrivateLink",
    category: "networking",
    partition: "aws.privatelink.endpoint_id",
    influencers: ["aws.privatelink.service_name", "cloud.region"],
    logIndex: "logs-aws.privatelink*",
    error: {
      function: "high_count",
      partition_field_name: "aws.privatelink.endpoint_id",
      detector_description: "High count of VPC endpoint connection failures",
    },
    activity: {
      function: "high_sum",
      field_name: "aws.privatelink.metrics.BytesProcessed.sum",
      partition_field_name: "aws.privatelink.endpoint_id",
      detector_description: "High sum bytes processed per endpoint",
    },
  },
  "aws.qbusiness": {
    label: "Amazon Q Business",
    category: "aiml",
    partition: "aws.qbusiness.application_id",
    influencers: ["user.name", "cloud.region"],
    logIndex: "logs-aws.qbusiness*",
    error: {
      function: "high_count",
      partition_field_name: "aws.qbusiness.application_id",
      detector_description: "High count of Q Business query failures",
    },
    activity: {
      function: "high_mean",
      field_name: "event.duration",
      partition_field_name: "aws.qbusiness.application_id",
      detector_description: "High mean Q Business response latency",
    },
  },
  "aws.qldb": {
    label: "QLDB",
    category: "database",
    partition: "aws.qldb.ledger_name",
    influencers: ["event.action", "cloud.region"],
    logIndex: "logs-aws.qldb*",
    error: {
      function: "high_count",
      partition_field_name: "aws.qldb.ledger_name",
      detector_description: "High count of QLDB transaction failures",
    },
    activity: {
      function: "high_mean",
      field_name: "event.duration",
      partition_field_name: "aws.qldb.ledger_name",
      detector_description: "High mean ledger write latency",
    },
  },
  "aws.quicksight": {
    label: "QuickSight",
    category: "analytics",
    partition: "aws.quicksight.dashboard_id",
    influencers: ["user.name", "cloud.region"],
    logIndex: "logs-aws.quicksight*",
    error: {
      function: "high_count",
      partition_field_name: "aws.quicksight.dashboard_id",
      detector_description: "High count of QuickSight access failures",
    },
    activity: {
      function: "rare",
      by_field_name: "user.name",
      partition_field_name: "aws.quicksight.dashboard_id",
      detector_description: "Rare dashboard viewers per dashboard",
    },
  },
  "aws.ram": {
    label: "RAM",
    category: "management",
    partition: "aws.ram.resource_share_arn",
    influencers: ["cloud.account.id", "cloud.region"],
    logIndex: "logs-aws.ram*",
    error: {
      function: "high_count",
      partition_field_name: "aws.ram.resource_share_arn",
      detector_description: "High count of resource share errors",
    },
    activity: {
      function: "rare",
      by_field_name: "event.action",
      partition_field_name: "aws.ram.resource_share_arn",
      detector_description: "Rare cross-account share operations",
    },
  },
  "aws.rekognition": {
    label: "Rekognition",
    category: "aiml",
    partition: "aws.rekognition.collection_id",
    influencers: ["event.action", "cloud.region"],
    logIndex: "logs-aws.rekognition*",
    error: {
      function: "high_count",
      partition_field_name: "aws.rekognition.collection_id",
      detector_description: "High count of Rekognition API failures",
    },
    activity: {
      function: "high_mean",
      field_name: "event.duration",
      partition_field_name: "aws.rekognition.collection_id",
      detector_description: "High mean image analysis duration",
    },
  },
  "aws.resiliencehub": {
    label: "Resilience Hub",
    category: "management",
    partition: "aws.resiliencehub.app_arn",
    influencers: ["aws.resiliencehub.policy_name", "cloud.region"],
    logIndex: "logs-aws.resiliencehub*",
    error: {
      function: "high_count",
      partition_field_name: "aws.resiliencehub.app_arn",
      detector_description: "High count of resilience assessment failures",
    },
    activity: {
      function: "high_count",
      partition_field_name: "aws.resiliencehub.app_arn",
      detector_description: "High count of policy compliance violations",
    },
  },
  "aws.secretsmanager": {
    label: "Secrets Manager",
    category: "security",
    partition: "aws.secretsmanager.secret_arn",
    influencers: ["event.action", "cloud.region"],
    logIndex: "logs-aws.secretsmanager*",
    error: {
      function: "high_count",
      partition_field_name: "aws.secretsmanager.secret_arn",
      detector_description: "High count of secret access failures",
    },
    activity: {
      function: "rare",
      by_field_name: "user.name",
      partition_field_name: "aws.secretsmanager.secret_arn",
      detector_description: "Rare secret retrieval users per secret",
    },
  },
  "aws.servicecatalog": {
    label: "Service Catalog",
    category: "management",
    partition: "aws.servicecatalog.product_id",
    influencers: ["aws.servicecatalog.portfolio_id", "cloud.region"],
    logIndex: "logs-aws.servicecatalog*",
    error: {
      function: "high_count",
      partition_field_name: "aws.servicecatalog.product_id",
      detector_description: "High count of Service Catalog provisioning failures",
    },
    activity: {
      function: "high_count",
      partition_field_name: "aws.servicecatalog.product_id",
      detector_description: "High count of provisioned product changes",
    },
  },
  "aws.servicequotas": {
    label: "Service Quotas",
    category: "management",
    partition: "aws.servicequotas.quota_code",
    influencers: ["aws.servicequotas.service_code", "cloud.region"],
    logIndex: "logs-aws.servicequotas*",
    error: {
      function: "high_count",
      partition_field_name: "aws.servicequotas.quota_code",
      detector_description: "High count of quota increase request failures",
    },
    activity: {
      function: "high_count",
      partition_field_name: "aws.servicequotas.quota_code",
      detector_description: "High count of quota utilization warnings",
    },
  },
  "aws.ses": {
    label: "SES",
    category: "messaging",
    partition: "aws.ses.configuration_set",
    influencers: ["aws.ses.identity", "cloud.region"],
    logIndex: "logs-aws.ses*",
    error: {
      function: "high_count",
      partition_field_name: "aws.ses.configuration_set",
      detector_description: "High count of SES bounce/complaint events",
    },
    activity: {
      function: "high_mean",
      field_name: "aws.ses.metrics.Send.sum",
      partition_field_name: "aws.ses.configuration_set",
      detector_description: "High mean email send volume",
    },
  },
  "aws.shield": {
    label: "Shield",
    category: "security",
    partition: "aws.shield.resource_arn",
    influencers: ["aws.shield.attack_vector", "cloud.region"],
    logIndex: "logs-aws.shield*",
    error: {
      function: "high_count",
      partition_field_name: "aws.shield.resource_arn",
      detector_description: "High count of DDoS mitigation events",
    },
    activity: {
      function: "high_sum",
      field_name: "aws.shield.metrics.DDoSDetected.sum",
      partition_field_name: "aws.shield.resource_arn",
      detector_description: "High sum DDoS attack volume per resource",
    },
  },
  "aws.storagegateway": {
    label: "Storage Gateway",
    category: "storage",
    partition: "aws.storagegateway.gateway_id",
    influencers: ["aws.storagegateway.volume_id", "cloud.region"],
    logIndex: "logs-aws.storagegateway*",
    error: {
      function: "high_count",
      partition_field_name: "aws.storagegateway.gateway_id",
      detector_description: "High count of Storage Gateway errors",
    },
    activity: {
      function: "high_sum",
      field_name: "aws.storagegateway.bytes_uploaded",
      partition_field_name: "aws.storagegateway.gateway_id",
      detector_description: "High sum bytes uploaded per gateway",
    },
  },
  "aws.textract": {
    label: "Textract",
    category: "aiml",
    partition: "aws.textract.job_id",
    influencers: ["event.action", "cloud.region"],
    logIndex: "logs-aws.textract*",
    error: {
      function: "high_count",
      partition_field_name: "aws.textract.job_id",
      detector_description: "High count of Textract OCR job failures",
    },
    activity: {
      function: "high_mean",
      field_name: "event.duration",
      partition_field_name: "aws.textract.job_id",
      detector_description: "High mean document analysis duration",
    },
  },
  "aws.timestream": {
    label: "Timestream",
    category: "database",
    partition: "aws.timestream.database_name",
    influencers: ["aws.timestream.table_name", "cloud.region"],
    logIndex: "logs-aws.timestream*",
    error: {
      function: "high_count",
      partition_field_name: "aws.timestream.table_name",
      detector_description: "High count of Timestream write failures",
    },
    activity: {
      function: "high_mean",
      field_name: "event.duration",
      partition_field_name: "aws.timestream.table_name",
      detector_description: "High mean Timestream query latency",
    },
  },
  "aws.transcribe": {
    label: "Transcribe",
    category: "aiml",
    partition: "aws.transcribe.job_name",
    influencers: ["aws.transcribe.language_code", "cloud.region"],
    logIndex: "logs-aws.transcribe*",
    error: {
      function: "high_count",
      partition_field_name: "aws.transcribe.job_name",
      detector_description: "High count of Transcribe job failures",
    },
    activity: {
      function: "high_mean",
      field_name: "event.duration",
      partition_field_name: "aws.transcribe.job_name",
      detector_description: "High mean transcription job duration",
    },
  },
  "aws.transfer": {
    label: "Transfer Family",
    category: "messaging",
    partition: "aws.transfer.server_id",
    influencers: ["user.name", "cloud.region"],
    logIndex: "logs-aws.transfer*",
    error: {
      function: "high_count",
      partition_field_name: "aws.transfer.server_id",
      detector_description: "High count of SFTP/FTP authentication failures",
    },
    activity: {
      function: "high_sum",
      field_name: "aws.transfer.bytes_out",
      partition_field_name: "aws.transfer.server_id",
      detector_description: "High sum outbound transfer bytes",
    },
  },
  "aws.translate": {
    label: "Translate",
    category: "aiml",
    partition: "aws.translate.job_id",
    influencers: ["aws.translate.source_language", "cloud.region"],
    logIndex: "logs-aws.translate*",
    error: {
      function: "high_count",
      partition_field_name: "aws.translate.job_id",
      detector_description: "High count of Translate job failures",
    },
    activity: {
      function: "high_mean",
      field_name: "event.duration",
      partition_field_name: "aws.translate.job_id",
      detector_description: "High mean translation job duration",
    },
  },
  "aws.trustedadvisor": {
    label: "Trusted Advisor",
    category: "management",
    partition: "aws.trustedadvisor.check_id",
    influencers: ["aws.trustedadvisor.category", "cloud.region"],
    logIndex: "logs-aws.trustedadvisor*",
    error: {
      function: "high_count",
      partition_field_name: "aws.trustedadvisor.check_id",
      detector_description: "High count of Trusted Advisor check errors",
    },
    activity: {
      function: "high_count",
      partition_field_name: "aws.trustedadvisor.check_id",
      detector_description: "High count of red/warning check results",
    },
  },
  "aws.verifiedaccess": {
    label: "Verified Access",
    category: "security",
    partition: "aws.verifiedaccess.endpoint_id",
    influencers: ["user.name", "cloud.region"],
    logIndex: "logs-aws.verifiedaccess*",
    error: {
      function: "high_count",
      partition_field_name: "aws.verifiedaccess.endpoint_id",
      detector_description: "High count of Verified Access denials",
    },
    activity: {
      function: "rare",
      by_field_name: "user.name",
      partition_field_name: "aws.verifiedaccess.endpoint_id",
      detector_description: "Rare users accessing Verified Access endpoints",
    },
  },
  // minimal-coverage datasets
  "aws.auroradsql": {
    label: "Aurora DSQL",
    category: "database",
    partition: "aws.auroradsql.cluster_id",
    influencers: ["cloud.region"],
    logIndex: "logs-aws.auroradsql*",
    metricsIndex: "metrics-aws.auroradsql*",
    error: {
      function: "high_count",
      partition_field_name: "aws.auroradsql.cluster_id",
      detector_description: "High count of Aurora DSQL failures",
    },
    activity: {
      function: "high_mean",
      field_name: "event.duration",
      partition_field_name: "aws.auroradsql.cluster_id",
      detector_description: "High mean DSQL query latency",
    },
  },
  "aws.bedrockagent": {
    label: "Bedrock Agent",
    category: "aiml",
    partition: "aws.bedrockagent.agent_id",
    influencers: ["aws.bedrockagent.alias_id", "cloud.region"],
    logIndex: "logs-aws.bedrockagent*",
    error: {
      function: "high_count",
      partition_field_name: "aws.bedrockagent.agent_id",
      detector_description: "High count of Bedrock Agent invocation failures",
    },
    activity: {
      function: "high_mean",
      field_name: "event.duration",
      partition_field_name: "aws.bedrockagent.agent_id",
      detector_description: "High mean agent invocation latency",
    },
  },
  "aws.bedrockdataautomation": {
    label: "Bedrock Data Automation",
    category: "aiml",
    partition: "aws.bedrockdataautomation.project_arn",
    influencers: ["cloud.region"],
    logIndex: "logs-aws.bedrockdataautomation*",
    error: {
      function: "high_count",
      partition_field_name: "aws.bedrockdataautomation.project_arn",
      detector_description: "High count of data automation job failures",
    },
    activity: {
      function: "high_mean",
      field_name: "event.duration",
      partition_field_name: "aws.bedrockdataautomation.project_arn",
      detector_description: "High mean automation job duration",
    },
  },
  "aws.billing": {
    label: "Billing",
    category: "management",
    partition: "cloud.account.id",
    influencers: ["cloud.region"],
    logIndex: "logs-aws.billing*",
    metricsIndex: "metrics-aws.billing*",
    error: {
      function: "high_count",
      partition_field_name: "cloud.account.id",
      detector_description: "High count of billing API failures",
    },
    activity: {
      function: "high_mean",
      field_name: "aws.billing.estimated_charges",
      partition_field_name: "cloud.account.id",
      detector_description: "High mean estimated charges per account",
    },
  },
  "aws.dynamodb": {
    label: "DynamoDB",
    category: "database",
    partition: "aws.dynamodb.table_name",
    influencers: ["cloud.region"],
    logIndex: "logs-aws.dynamodb*",
    metricsIndex: "metrics-aws.dynamodb*",
    error: {
      function: "high_count",
      partition_field_name: "aws.dynamodb.table_name",
      detector_description: "High count of DynamoDB request failures",
    },
    activity: {
      function: "high_mean",
      field_name: "event.duration",
      partition_field_name: "aws.dynamodb.table_name",
      detector_description: "High mean DynamoDB request latency",
    },
  },
  "aws.ebs": {
    label: "EBS",
    category: "storage",
    partition: "aws.ebs.volume_id",
    influencers: ["cloud.region"],
    logIndex: "logs-aws.ebs*",
    metricsIndex: "metrics-aws.ebs*",
    error: {
      function: "high_count",
      partition_field_name: "aws.ebs.volume_id",
      detector_description: "High count of EBS volume errors",
    },
    activity: {
      function: "high_mean",
      field_name: "aws.ebs.metrics.VolumeQueueLength.avg",
      partition_field_name: "aws.ebs.volume_id",
      detector_description: "High mean volume queue length",
    },
  },
  "aws.ecs_metrics": {
    label: "ECS",
    category: "compute",
    partition: "aws.ecs.dimensions.ClusterName",
    influencers: ["aws.ecs.dimensions.ServiceName", "cloud.region"],
    logIndex: "logs-aws.ecs*",
    metricsIndex: "metrics-aws.ecs*",
    error: {
      function: "high_count",
      partition_field_name: "aws.ecs.dimensions.ClusterName",
      detector_description: "High count of ECS service failures",
    },
    activity: {
      function: "high_mean",
      field_name: "aws.ecs.metrics.CPUUtilization.avg",
      partition_field_name: "aws.ecs.dimensions.ClusterName",
      detector_description: "High mean CPU utilization per cluster",
    },
  },
  "aws.endusermessaging": {
    label: "End User Messaging",
    category: "messaging",
    partition: "aws.endusermessaging.application_id",
    influencers: ["cloud.region"],
    logIndex: "logs-aws.endusermessaging*",
    error: {
      function: "high_count",
      partition_field_name: "aws.endusermessaging.application_id",
      detector_description: "High count of messaging delivery failures",
    },
    activity: {
      function: "high_mean",
      field_name: "aws.endusermessaging.metrics.DeliveryAttempts.sum",
      partition_field_name: "aws.endusermessaging.application_id",
      detector_description: "High mean delivery attempts",
    },
  },
  "aws.evs": {
    label: "EVS",
    category: "compute",
    partition: "aws.evs.environment_id",
    influencers: ["cloud.region"],
    logIndex: "logs-aws.evs*",
    error: {
      function: "high_count",
      partition_field_name: "aws.evs.environment_id",
      detector_description: "High count of EVS environment errors",
    },
    activity: {
      function: "high_mean",
      field_name: "event.duration",
      partition_field_name: "aws.evs.environment_id",
      detector_description: "High mean environment operation duration",
    },
  },
  "aws.groundstation": {
    label: "Ground Station",
    category: "compute",
    partition: "aws.groundstation.contact_id",
    influencers: ["aws.groundstation.satellite_id", "cloud.region"],
    logIndex: "logs-aws.groundstation*",
    error: {
      function: "high_count",
      partition_field_name: "aws.groundstation.contact_id",
      detector_description: "High count of satellite contact failures",
    },
    activity: {
      function: "high_mean",
      field_name: "event.duration",
      partition_field_name: "aws.groundstation.contact_id",
      detector_description: "High mean contact duration",
    },
  },
  "aws.awshealth": {
    label: "AWS Health",
    category: "management",
    partition: "aws.awshealth.event_type_code",
    influencers: ["cloud.region", "cloud.account.id"],
    logIndex: "logs-aws.awshealth*",
    error: {
      function: "high_count",
      partition_field_name: "aws.awshealth.event_type_code",
      detector_description: "High count of AWS Health issue events",
    },
    activity: {
      function: "high_count",
      partition_field_name: "aws.awshealth.event_type_code",
      detector_description: "High count of open health events",
    },
  },
  "aws.healthomics": {
    label: "HealthOmics",
    category: "aiml",
    partition: "aws.healthomics.workflow_id",
    influencers: ["aws.healthomics.run_id", "cloud.region"],
    logIndex: "logs-aws.healthomics*",
    error: {
      function: "high_count",
      partition_field_name: "aws.healthomics.workflow_id",
      detector_description: "High count of omics workflow failures",
    },
    activity: {
      function: "high_mean",
      field_name: "event.duration",
      partition_field_name: "aws.healthomics.workflow_id",
      detector_description: "High mean workflow run duration",
    },
  },
  "aws.m2": {
    label: "Mainframe Modernization",
    category: "compute",
    partition: "aws.m2.environment_id",
    influencers: ["cloud.region"],
    logIndex: "logs-aws.m2*",
    error: {
      function: "high_count",
      partition_field_name: "aws.m2.environment_id",
      detector_description: "High count of M2 environment errors",
    },
    activity: {
      function: "high_mean",
      field_name: "event.duration",
      partition_field_name: "aws.m2.environment_id",
      detector_description: "High mean batch job duration",
    },
  },
  "aws.kafka_metrics": {
    label: "MSK",
    category: "messaging",
    partition: "aws.msk.cluster_name",
    influencers: ["aws.msk.topic", "cloud.region"],
    logIndex: "logs-aws.kafka_metrics*",
    metricsIndex: "metrics-aws.kafka_metrics*",
    error: {
      function: "high_count",
      partition_field_name: "aws.msk.cluster_name",
      detector_description: "High count of MSK broker errors",
    },
    activity: {
      function: "high_mean",
      field_name: "aws.msk.lag",
      partition_field_name: "aws.msk.cluster_name",
      detector_description: "High mean consumer lag per cluster",
    },
  },
  "aws.natgateway": {
    label: "NAT Gateway",
    category: "networking",
    partition: "aws.natgateway.nat_gateway_id",
    influencers: ["cloud.region"],
    logIndex: "logs-aws.natgateway*",
    metricsIndex: "metrics-aws.natgateway*",
    error: {
      function: "high_count",
      partition_field_name: "aws.natgateway.nat_gateway_id",
      detector_description: "High count of NAT Gateway errors",
    },
    activity: {
      function: "high_sum",
      field_name: "aws.natgateway.metrics.BytesOutToDestination.sum",
      partition_field_name: "aws.natgateway.nat_gateway_id",
      detector_description: "High sum outbound bytes per NAT gateway",
    },
  },
  "aws.neptuneanalytics": {
    label: "Neptune Analytics",
    category: "database",
    partition: "aws.neptuneanalytics.graph_id",
    influencers: ["cloud.region"],
    logIndex: "logs-aws.neptuneanalytics*",
    error: {
      function: "high_count",
      partition_field_name: "aws.neptuneanalytics.graph_id",
      detector_description: "High count of graph analytics failures",
    },
    activity: {
      function: "high_mean",
      field_name: "event.duration",
      partition_field_name: "aws.neptuneanalytics.graph_id",
      detector_description: "High mean graph query latency",
    },
  },
  "aws.pcs": {
    label: "Parallel Computing Service",
    category: "compute",
    partition: "aws.pcs.cluster_id",
    influencers: ["cloud.region"],
    logIndex: "logs-aws.pcs*",
    error: {
      function: "high_count",
      partition_field_name: "aws.pcs.cluster_id",
      detector_description: "High count of HPC cluster job failures",
    },
    activity: {
      function: "high_mean",
      field_name: "event.duration",
      partition_field_name: "aws.pcs.cluster_id",
      detector_description: "High mean HPC job duration",
    },
  },
  "aws.private5g": {
    label: "Private 5G",
    category: "networking",
    partition: "aws.private5g.network_arn",
    influencers: ["cloud.region"],
    logIndex: "logs-aws.private5g*",
    error: {
      function: "high_count",
      partition_field_name: "aws.private5g.network_arn",
      detector_description: "High count of Private 5G network errors",
    },
    activity: {
      function: "high_sum",
      field_name: "aws.private5g.metrics.UplinkThroughput.sum",
      partition_field_name: "aws.private5g.network_arn",
      detector_description: "High sum uplink throughput",
    },
  },
  "aws.qdeveloper": {
    label: "Amazon Q Developer",
    category: "aiml",
    partition: "user.name",
    influencers: ["event.action", "cloud.region"],
    logIndex: "logs-aws.qdeveloper*",
    error: {
      function: "high_count",
      partition_field_name: "user.name",
      detector_description: "High count of Q Developer request failures",
    },
    activity: {
      function: "high_mean",
      field_name: "event.duration",
      partition_field_name: "user.name",
      detector_description: "High mean Q Developer response latency",
    },
  },
  "aws.rds": {
    label: "RDS",
    category: "database",
    partition: "aws.rds.db_instance.identifier",
    influencers: ["cloud.region"],
    logIndex: "logs-aws.rds*",
    metricsIndex: "metrics-aws.rds*",
    error: {
      function: "high_count",
      partition_field_name: "aws.rds.db_instance.identifier",
      detector_description: "High count of RDS instance failures",
    },
    activity: {
      function: "high_mean",
      field_name: "aws.rds.latency.read",
      partition_field_name: "aws.rds.db_instance.identifier",
      detector_description: "High mean RDS read latency",
    },
  },
  "aws.redshift": {
    label: "Redshift",
    category: "database",
    partition: "aws.redshift.cluster_id",
    influencers: ["cloud.region"],
    logIndex: "logs-aws.redshift*",
    metricsIndex: "metrics-aws.redshift*",
    error: {
      function: "high_count",
      partition_field_name: "aws.redshift.cluster_id",
      detector_description: "High count of Redshift cluster errors",
    },
    activity: {
      function: "high_mean",
      field_name: "event.duration",
      partition_field_name: "aws.redshift.cluster_id",
      detector_description: "High mean query duration per cluster",
    },
  },
  "aws.simspaceweaver": {
    label: "SimSpace Weaver",
    category: "compute",
    partition: "aws.simspaceweaver.simulation_name",
    influencers: ["cloud.region"],
    logIndex: "logs-aws.simspaceweaver*",
    error: {
      function: "high_count",
      partition_field_name: "aws.simspaceweaver.simulation_name",
      detector_description: "High count of simulation runtime errors",
    },
    activity: {
      function: "high_mean",
      field_name: "event.duration",
      partition_field_name: "aws.simspaceweaver.simulation_name",
      detector_description: "High mean simulation tick duration",
    },
  },
  "aws.sns": {
    label: "SNS",
    category: "messaging",
    partition: "aws.sns.topic_arn",
    influencers: ["cloud.region"],
    logIndex: "logs-aws.sns*",
    metricsIndex: "metrics-aws.sns*",
    error: {
      function: "high_count",
      partition_field_name: "aws.sns.topic_arn",
      detector_description: "High count of SNS publish failures",
    },
    activity: {
      function: "high_mean",
      field_name: "aws.sns.metrics.NumberOfNotificationsFailed.sum",
      partition_field_name: "aws.sns.topic_arn",
      detector_description: "High mean failed notifications per topic",
    },
  },
  "aws.sqs": {
    label: "SQS",
    category: "messaging",
    partition: "aws.sqs.queue_name",
    influencers: ["cloud.region"],
    logIndex: "logs-aws.sqs*",
    metricsIndex: "metrics-aws.sqs*",
    error: {
      function: "high_count",
      partition_field_name: "aws.sqs.queue_name",
      detector_description: "High count of SQS message processing failures",
    },
    activity: {
      function: "high_mean",
      field_name: "aws.sqs.metrics.ApproximateAgeOfOldestMessage.avg",
      partition_field_name: "aws.sqs.queue_name",
      detector_description: "High mean oldest message age per queue",
    },
  },
  "aws.s3_storage_lens": {
    label: "S3 Storage Lens",
    category: "storage",
    partition: "aws.s3.bucket.name",
    influencers: ["cloud.region"],
    logIndex: "logs-aws.s3_storage_lens*",
    error: {
      function: "high_count",
      partition_field_name: "aws.s3.bucket.name",
      detector_description: "High count of Storage Lens reporting errors",
    },
    activity: {
      function: "high_sum",
      field_name: "aws.s3_storage_lens.bytes_stored",
      partition_field_name: "aws.s3.bucket.name",
      detector_description: "High sum stored bytes per bucket",
    },
  },
  "aws.transitgateway": {
    label: "Transit Gateway",
    category: "networking",
    partition: "aws.transitgateway.transit_gateway_id",
    influencers: ["cloud.region"],
    logIndex: "logs-aws.transitgateway*",
    metricsIndex: "metrics-aws.transitgateway*",
    error: {
      function: "high_count",
      partition_field_name: "aws.transitgateway.transit_gateway_id",
      detector_description: "High count of Transit Gateway errors",
    },
    activity: {
      function: "high_sum",
      field_name: "aws.transitgateway.metrics.BytesIn.sum",
      partition_field_name: "aws.transitgateway.transit_gateway_id",
      detector_description: "High sum inbound bytes per transit gateway",
    },
  },
  "aws.vpcipam": {
    label: "VPC IPAM",
    category: "networking",
    partition: "aws.vpcipam.pool_id",
    influencers: ["cloud.region"],
    logIndex: "logs-aws.vpcipam*",
    error: {
      function: "high_count",
      partition_field_name: "aws.vpcipam.pool_id",
      detector_description: "High count of IPAM allocation failures",
    },
    activity: {
      function: "high_mean",
      field_name: "aws.vpcipam.utilization_percent",
      partition_field_name: "aws.vpcipam.pool_id",
      detector_description: "High mean IP pool utilization",
    },
  },
  "aws.vpn": {
    label: "VPN",
    category: "networking",
    partition: "aws.vpn.tunnel_id",
    influencers: ["aws.vpn.connection_id", "cloud.region"],
    logIndex: "logs-aws.vpn*",
    metricsIndex: "metrics-aws.vpn*",
    error: {
      function: "high_count",
      partition_field_name: "aws.vpn.tunnel_id",
      detector_description: "High count of VPN tunnel errors",
    },
    activity: {
      function: "high_sum",
      field_name: "aws.vpn.metrics.TunnelDataIn.sum",
      partition_field_name: "aws.vpn.tunnel_id",
      detector_description: "High sum tunnel ingress bytes",
    },
  },
  "aws.wickr": {
    label: "Wickr",
    category: "security",
    partition: "aws.wickr.network_id",
    influencers: ["user.name", "cloud.region"],
    logIndex: "logs-aws.wickr*",
    error: {
      function: "high_count",
      partition_field_name: "aws.wickr.network_id",
      detector_description: "High count of Wickr messaging failures",
    },
    activity: {
      function: "rare",
      by_field_name: "user.name",
      partition_field_name: "aws.wickr.network_id",
      detector_description: "Rare Wickr users per network",
    },
  },
  "aws.workmail": {
    label: "WorkMail",
    category: "messaging",
    partition: "aws.workmail.organization_id",
    influencers: ["user.name", "cloud.region"],
    logIndex: "logs-aws.workmail*",
    error: {
      function: "high_count",
      partition_field_name: "aws.workmail.organization_id",
      detector_description: "High count of WorkMail delivery failures",
    },
    activity: {
      function: "high_mean",
      field_name: "aws.workmail.metrics.InboundMail.sum",
      partition_field_name: "aws.workmail.organization_id",
      detector_description: "High mean inbound mail volume",
    },
  },
};

function getDataset(job) {
  const filters = job.datafeed?.query?.bool?.filter;
  if (!Array.isArray(filters)) return null;
  for (const f of filters) {
    if (f?.term?.["event.dataset"]) return f.term["event.dataset"];
  }
  return null;
}

function isErrorJob(id) {
  return id.endsWith("-error-spike") || id.endsWith("-failure-spike");
}

function isActivityJob(id) {
  return id.endsWith("-activity-anomaly");
}

function buildDetector(det) {
  const out = {
    detector_description: det.detector_description,
    function: det.function,
    detector_index: 0,
  };
  if (det.field_name) out.field_name = det.field_name;
  if (det.partition_field_name) out.partition_field_name = det.partition_field_name;
  if (det.by_field_name) out.by_field_name = det.by_field_name;
  return out;
}

function improveJob(job, groupKind) {
  const dataset = getDataset(job);
  if (!dataset) {
    console.warn(`  skip ${job.id}: no event.dataset`);
    return job;
  }
  const cfg = DATASET_CONFIG[dataset];
  if (!cfg) {
    console.warn(`  skip ${job.id}: no config for ${dataset}`);
    return job;
  }

  const isError = isErrorJob(job.id);
  const isActivity = isActivityJob(job.id);
  const detectorCfg = isActivity ? cfg.activity : cfg.error;
  const useMetricsIndex =
    isActivity && cfg.metricsIndex && detectorCfg.field_name?.includes(".metrics.");

  const indices = [useMetricsIndex ? cfg.metricsIndex : cfg.logIndex];
  const partition = detectorCfg.partition_field_name || cfg.partition;
  const influencers = [...new Set([partition, ...cfg.influencers])].filter(Boolean);

  const label = cfg.label;
  let description;
  if (groupKind === "minimal-coverage") {
    description = isError
      ? `Detects spikes in ${label} failures per resource`
      : `Detects unusual ${label} activity patterns`;
  } else if (isError) {
    description = `Detects spikes in ${label} errors (failures) partitioned by resource`;
  } else {
    description = `Detects unusual ${label} activity or metric anomalies by resource`;
  }

  const jobDesc = isError
    ? `Detects spikes in ${label} failures partitioned by ${partition}`
    : `Detects unusual ${label} metric or activity anomalies partitioned by ${partition}`;

  const updated = structuredClone(job);
  updated.description = description;
  updated.job.description = jobDesc;
  updated.job.analysis_config.detectors = [buildDetector(detectorCfg)];
  updated.job.analysis_config.influencers = influencers;
  updated.job.analysis_limits = { model_memory_limit: "16mb" };

  if (groupKind === "gap-coverage") {
    const cat = cfg.category;
    const groups = ["aws", cat === "media" ? "extended" : cat, "cloudloadgen"];
    updated.job.groups = groups;
  }

  updated.datafeed.indices = indices;

  return updated;
}

function processFile(filename, groupKind) {
  const path = join(jobsDir, filename);
  const doc = JSON.parse(readFileSync(path, "utf8"));
  let changed = 0;
  doc.jobs = doc.jobs.map((j) => {
    const before = JSON.stringify(j.job?.analysis_config?.detectors?.[0]);
    const improved = improveJob(j, groupKind);
    const after = JSON.stringify(improved.job?.analysis_config?.detectors?.[0]);
    if (before !== after) changed++;
    return improved;
  });
  if (groupKind === "gap-coverage") {
    doc.description =
      "Gap coverage anomaly detection — service-specific detectors for AWS services without dedicated ML job groups";
  } else {
    doc.description =
      "Minimal-coverage ML jobs — service-specific failure and metric detectors for lightly covered services";
  }
  writeFileSync(path, JSON.stringify(doc, null, 2) + "\n", "utf8");
  console.log(`${filename}: updated ${changed}/${doc.jobs.length} jobs`);
}

processFile("gap-coverage-jobs.json", "gap-coverage");
processFile("minimal-coverage-jobs.json", "minimal-coverage");
