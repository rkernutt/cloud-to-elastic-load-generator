/**
 * Registry of custom Elasticsearch ingest pipelines for AWS services
 * not covered by the official Elastic AWS integration.
 *
 * Pipeline naming convention:  logs-aws.{dataset_suffix}-default
 * This matches the index pattern the load generator writes documents into,
 * so pipelines are applied automatically on ingest.
 *
 * Processor strategy:
 *   - Services with structured JSON logging → json + targeted rename processors
 *   - All other services → json with ignore_failure (passes through plain-text safely)
 *
 * Services already covered by the official Elastic AWS integration are omitted:
 * cloudtrail, vpcflow, alb/nlb, guardduty, s3access, apigateway, cloudfront,
 * networkfirewall, securityhub, waf, rds (official), route53, emr (official),
 * ec2 (official), ecs, config, inspector, dynamodb, redshift, ebs, kinesis,
 * msk/kafka, sns, sqs, transitgateway, vpn, awshealth, billing, natgateway.
 */

// ─── helpers ────────────────────────────────────────────────────────────────

/** Minimal pipeline: parse JSON message into {ns}.parsed, ignore on failure. */
function json(ns) {
  return [{ json: { field: "message", target_field: `${ns}.parsed`, ignore_failure: true } }];
}

// ─── registry ───────────────────────────────────────────────────────────────

export const PIPELINE_REGISTRY = [
  // ═══════════════════════════════════════════════════════════════════════════
  // ANALYTICS
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "logs-aws.glue-default",
    dataset: "aws.glue",
    group: "analytics",
    description: "Parse AWS Glue continuous logging JSON from message field",
    processors: [
      { json: { field: "message", target_field: "glue.parsed", ignore_failure: true } },
      {
        rename: {
          field: "glue.parsed.jobName",
          target_field: "glue.jobName",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
      {
        rename: {
          field: "glue.parsed.jobRunId",
          target_field: "glue.jobRunId",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
      {
        rename: {
          field: "glue.parsed.level",
          target_field: "log.level",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
      { lowercase: { field: "log.level", ignore_missing: true, ignore_failure: true } },
      {
        rename: {
          field: "glue.parsed.errorCode",
          target_field: "error.code",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
    ],
  },

  {
    id: "logs-aws.emr_logs-default",
    dataset: "aws.emr_logs",
    group: "analytics",
    description: "Parse Amazon EMR container/application log JSON from message field",
    processors: [
      { json: { field: "message", target_field: "emr.parsed", ignore_failure: true } },
      {
        rename: {
          field: "emr.parsed.logLevel",
          target_field: "log.level",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
      { lowercase: { field: "log.level", ignore_missing: true, ignore_failure: true } },
      {
        rename: {
          field: "emr.parsed.clusterId",
          target_field: "emr.clusterId",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
      {
        rename: {
          field: "emr.parsed.applicationId",
          target_field: "emr.applicationId",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
      {
        rename: {
          field: "emr.parsed.containerId",
          target_field: "emr.containerId",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
      {
        rename: {
          field: "emr.parsed.component",
          target_field: "emr.component",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
    ],
  },

  {
    id: "logs-aws.athena-default",
    dataset: "aws.athena",
    group: "analytics",
    description: "Parse Amazon Athena query execution JSON from message field",
    processors: [
      { json: { field: "message", target_field: "athena.parsed", ignore_failure: true } },
      {
        rename: {
          field: "athena.parsed.queryId",
          target_field: "athena.queryId",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
      {
        rename: {
          field: "athena.parsed.workgroup",
          target_field: "athena.workgroup",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
      {
        rename: {
          field: "athena.parsed.database",
          target_field: "athena.database",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
      {
        rename: {
          field: "athena.parsed.state",
          target_field: "athena.state",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
      {
        rename: {
          field: "athena.parsed.durationSeconds",
          target_field: "athena.durationSeconds",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
      {
        rename: {
          field: "athena.parsed.dataScannedBytes",
          target_field: "athena.dataScannedBytes",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
    ],
  },

  {
    id: "logs-aws.lakeformation-default",
    dataset: "aws.lakeformation",
    group: "analytics",
    description: "Parse AWS Lake Formation permission event JSON",
    processors: json("lakeformation"),
  },
  {
    id: "logs-aws.quicksight-default",
    dataset: "aws.quicksight",
    group: "analytics",
    description: "Parse Amazon QuickSight dashboard usage JSON",
    processors: json("quicksight"),
  },
  {
    id: "logs-aws.databrew-default",
    dataset: "aws.databrew",
    group: "analytics",
    description: "Parse AWS Glue DataBrew job execution JSON",
    processors: json("databrew"),
  },
  {
    id: "logs-aws.appflow-default",
    dataset: "aws.appflow",
    group: "analytics",
    description: "Parse Amazon AppFlow connector run JSON",
    processors: json("appflow"),
  },
  {
    id: "logs-aws.opensearch-default",
    dataset: "aws.opensearch",
    group: "analytics",
    description: "Parse Amazon OpenSearch Service operation JSON",
    processors: json("opensearch"),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ML / AI
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "logs-aws.sagemaker-default",
    dataset: "aws.sagemaker",
    group: "ml",
    description: "Parse Amazon SageMaker training/inference/studio log JSON from message field",
    processors: [
      { json: { field: "message", target_field: "sagemaker.parsed", ignore_failure: true } },
      {
        rename: {
          field: "sagemaker.parsed.level",
          target_field: "log.level",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
      { lowercase: { field: "log.level", ignore_missing: true, ignore_failure: true } },
      {
        rename: {
          field: "sagemaker.parsed.event",
          target_field: "sagemaker.event",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
      {
        rename: {
          field: "sagemaker.parsed.space",
          target_field: "sagemaker.space",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
      {
        rename: {
          field: "sagemaker.parsed.appType",
          target_field: "sagemaker.appType",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
      {
        rename: {
          field: "sagemaker.parsed.user",
          target_field: "sagemaker.user",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
    ],
  },

  {
    id: "logs-aws.bedrock-default",
    dataset: "aws.bedrock",
    group: "ml",
    description: "Parse Amazon Bedrock model invocation JSON",
    processors: json("bedrock"),
  },
  {
    id: "logs-aws.bedrockagent-default",
    dataset: "aws.bedrockagent",
    group: "ml",
    description: "Parse Amazon Bedrock Agents runtime and action group JSON",
    processors: json("bedrockagent"),
  },
  {
    id: "logs-aws.rekognition-default",
    dataset: "aws.rekognition",
    group: "ml",
    description: "Parse Amazon Rekognition image/video analysis JSON",
    processors: json("rekognition"),
  },
  {
    id: "logs-aws.textract-default",
    dataset: "aws.textract",
    group: "ml",
    description: "Parse Amazon Textract document analysis JSON",
    processors: json("textract"),
  },
  {
    id: "logs-aws.comprehend-default",
    dataset: "aws.comprehend",
    group: "ml",
    description: "Parse Amazon Comprehend NLP analysis JSON",
    processors: json("comprehend"),
  },
  {
    id: "logs-aws.comprehendmedical-default",
    dataset: "aws.comprehendmedical",
    group: "ml",
    description: "Parse Amazon Comprehend Medical clinical NLP JSON",
    processors: json("comprehendmedical"),
  },
  {
    id: "logs-aws.translate-default",
    dataset: "aws.translate",
    group: "ml",
    description: "Parse Amazon Translate language translation JSON",
    processors: json("translate"),
  },
  {
    id: "logs-aws.transcribe-default",
    dataset: "aws.transcribe",
    group: "ml",
    description: "Parse Amazon Transcribe speech-to-text job JSON",
    processors: json("transcribe"),
  },
  {
    id: "logs-aws.polly-default",
    dataset: "aws.polly",
    group: "ml",
    description: "Parse Amazon Polly text-to-speech synthesis JSON",
    processors: json("polly"),
  },
  {
    id: "logs-aws.forecast-default",
    dataset: "aws.forecast",
    group: "ml",
    description: "Parse Amazon Forecast time-series prediction JSON",
    processors: json("forecast"),
  },
  {
    id: "logs-aws.personalize-default",
    dataset: "aws.personalize",
    group: "ml",
    description: "Parse Amazon Personalize recommendation engine JSON",
    processors: json("personalize"),
  },
  {
    id: "logs-aws.lex-default",
    dataset: "aws.lex",
    group: "ml",
    description: "Parse Amazon Lex chatbot intent & session JSON",
    processors: json("lex"),
  },
  {
    id: "logs-aws.lookoutmetrics-default",
    dataset: "aws.lookoutmetrics",
    group: "ml",
    description: "Parse Amazon Lookout for Metrics anomaly detector JSON",
    processors: json("lookoutmetrics"),
  },
  {
    id: "logs-aws.qbusiness-default",
    dataset: "aws.qbusiness",
    group: "ml",
    description: "Parse Amazon Q Business query/retrieval/plugin event JSON from message field",
    processors: [
      { json: { field: "message", target_field: "qbusiness.parsed", ignore_failure: true } },
      {
        rename: {
          field: "qbusiness.parsed.event_type",
          target_field: "qbusiness.event_type",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
      {
        rename: {
          field: "qbusiness.parsed.application_id",
          target_field: "qbusiness.application_id",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
      {
        rename: {
          field: "qbusiness.parsed.conversation_id",
          target_field: "qbusiness.conversation_id",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
      {
        rename: {
          field: "qbusiness.parsed.guardrail_action",
          target_field: "qbusiness.guardrail_action",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SERVERLESS
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "logs-aws.lambda_logs-default",
    dataset: "aws.lambda_logs",
    group: "serverless",
    description:
      "Parse Lambda log lines — START/END/REPORT structured extraction plus JSON fallback",
    processors: [
      // Single grok with all three Lambda system-line patterns; stops at first match.
      // REPORT is listed first as it has the most fields to extract.
      {
        grok: {
          field: "message",
          patterns: [
            "REPORT RequestId: %{DATA:lambda.requestId}\\s+Duration: %{NUMBER:lambda.durationMs:float} ms\\s+Billed Duration: %{NUMBER:lambda.billedDurationMs:float} ms\\s+Memory Size: %{NUMBER:lambda.memorySizeMB:int} MB\\s+Max Memory Used: %{NUMBER:lambda.maxMemoryUsedMB:int} MB",
            "START RequestId: %{DATA:lambda.requestId}\\s+Version: %{DATA:lambda.version}",
            "END RequestId: %{DATA:lambda.requestId}",
          ],
          ignore_failure: true,
          ignore_missing: true,
        },
      },
      // JSON fallback for structured application logs
      { json: { field: "message", target_field: "lambda.parsed", ignore_failure: true } },
    ],
  },

  {
    id: "logs-aws.stepfunctions-default",
    dataset: "aws.stepfunctions",
    group: "serverless",
    description: "Parse AWS Step Functions execution event JSON",
    processors: json("stepfunctions"),
  },
  {
    id: "logs-aws.apprunner-default",
    dataset: "aws.apprunner",
    group: "serverless",
    description: "Parse AWS App Runner container log JSON",
    processors: json("apprunner"),
  },
  {
    id: "logs-aws.appsync-default",
    dataset: "aws.appsync",
    group: "serverless",
    description: "Parse AWS AppSync GraphQL request log JSON",
    processors: json("appsync"),
  },
  {
    id: "logs-aws.fargate-default",
    dataset: "aws.fargate",
    group: "serverless",
    description: "Parse Fargate task log JSON",
    processors: json("fargate"),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPUTE
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "logs-aws.ec2_logs-default",
    dataset: "aws.ec2_logs",
    group: "compute",
    description: "Parse Amazon EC2 instance log JSON from message field",
    processors: json("ec2"),
  },

  {
    id: "logs-aws.eks-default",
    dataset: "aws.eks",
    group: "compute",
    description: "Parse Amazon EKS Kubernetes pod/node log JSON",
    processors: json("eks"),
  },
  {
    id: "logs-aws.ecr-default",
    dataset: "aws.ecr",
    group: "compute",
    description: "Parse Amazon ECR image scan and push log JSON",
    processors: json("ecr"),
  },
  {
    id: "logs-aws.batch-default",
    dataset: "aws.batch",
    group: "compute",
    description: "Parse AWS Batch job execution log JSON",
    processors: json("batch"),
  },
  {
    id: "logs-aws.elasticbeanstalk-default",
    dataset: "aws.elasticbeanstalk",
    group: "compute",
    description: "Parse AWS Elastic Beanstalk deployment log JSON",
    processors: json("elasticbeanstalk"),
  },
  {
    id: "logs-aws.autoscaling-default",
    dataset: "aws.autoscaling",
    group: "compute",
    description: "Parse Amazon EC2 Auto Scaling scale-in/out event JSON",
    processors: json("autoscaling"),
  },
  {
    id: "logs-aws.imagebuilder-default",
    dataset: "aws.imagebuilder",
    group: "compute",
    description: "Parse EC2 Image Builder AMI pipeline log JSON",
    processors: json("imagebuilder"),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DATABASES  (RDS and Redshift have official integration; listed here as
  //             supplement pipelines for structured log parsing)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "logs-aws.rds-default",
    dataset: "aws.rds",
    group: "databases",
    description:
      "Parse RDS continuous log JSON from message field (supplements official integration)",
    processors: [
      { json: { field: "message", target_field: "rds.parsed", ignore_failure: true } },
      {
        rename: {
          field: "rds.parsed.level",
          target_field: "log.level",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
      { lowercase: { field: "log.level", ignore_missing: true, ignore_failure: true } },
      {
        rename: {
          field: "rds.parsed.thread",
          target_field: "rds.thread",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
      {
        rename: {
          field: "rds.parsed.logger",
          target_field: "rds.logger",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
    ],
  },

  {
    id: "logs-aws.elasticache-default",
    dataset: "aws.elasticache",
    group: "databases",
    description: "Parse Amazon ElastiCache Redis command log JSON",
    processors: json("elasticache"),
  },
  {
    id: "logs-aws.aurora-default",
    dataset: "aws.aurora",
    group: "databases",
    description: "Parse Amazon Aurora cluster event log JSON",
    processors: json("aurora"),
  },
  {
    id: "logs-aws.docdb-default",
    dataset: "aws.docdb",
    group: "databases",
    description: "Parse Amazon DocumentDB MongoDB-compat query log JSON",
    processors: json("docdb"),
  },
  {
    id: "logs-aws.neptune-default",
    dataset: "aws.neptune",
    group: "databases",
    description: "Parse Amazon Neptune graph DB query log JSON",
    processors: json("neptune"),
  },
  {
    id: "logs-aws.timestream-default",
    dataset: "aws.timestream",
    group: "databases",
    description: "Parse Amazon Timestream write/query log JSON",
    processors: json("timestream"),
  },
  {
    id: "logs-aws.qldb-default",
    dataset: "aws.qldb",
    group: "databases",
    description: "Parse Amazon QLDB ledger transaction log JSON",
    processors: json("qldb"),
  },
  {
    id: "logs-aws.keyspaces-default",
    dataset: "aws.keyspaces",
    group: "databases",
    description: "Parse Amazon Keyspaces Cassandra-compat log JSON",
    processors: json("keyspaces"),
  },
  {
    id: "logs-aws.memorydb-default",
    dataset: "aws.memorydb",
    group: "databases",
    description: "Parse Amazon MemoryDB durable Redis log JSON",
    processors: json("memorydb"),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // STORAGE
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "logs-aws.s3storagelens-default",
    dataset: "aws.s3storagelens",
    group: "storage",
    description: "Parse Amazon S3 Storage Lens analytics & metrics JSON",
    processors: json("s3storagelens"),
  },
  {
    id: "logs-aws.efs-default",
    dataset: "aws.efs",
    group: "storage",
    description: "Parse Amazon EFS NFS throughput/I/O log JSON",
    processors: json("efs"),
  },
  {
    id: "logs-aws.fsx-default",
    dataset: "aws.fsx",
    group: "storage",
    description: "Parse Amazon FSx file system ops log JSON",
    processors: json("fsx"),
  },
  {
    id: "logs-aws.backup-default",
    dataset: "aws.backup",
    group: "storage",
    description: "Parse AWS Backup job status log JSON",
    processors: json("backup"),
  },
  {
    id: "logs-aws.datasync-default",
    dataset: "aws.datasync",
    group: "storage",
    description: "Parse AWS DataSync transfer task log JSON",
    processors: json("datasync"),
  },
  {
    id: "logs-aws.storagegateway-default",
    dataset: "aws.storagegateway",
    group: "storage",
    description: "Parse AWS Storage Gateway hybrid storage log JSON",
    processors: json("storagegateway"),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "logs-aws.macie-default",
    dataset: "aws.macie",
    group: "security",
    description: "Parse Amazon Macie S3 sensitive data finding JSON",
    processors: json("macie"),
  },
  {
    id: "logs-aws.accessanalyzer-default",
    dataset: "aws.accessanalyzer",
    group: "security",
    description: "Parse AWS IAM Access Analyzer finding JSON",
    processors: json("accessanalyzer"),
  },
  {
    id: "logs-aws.cognito-default",
    dataset: "aws.cognito",
    group: "security",
    description: "Parse Amazon Cognito user auth & sign-in event JSON",
    processors: json("cognito"),
  },
  {
    id: "logs-aws.kms-default",
    dataset: "aws.kms",
    group: "security",
    description: "Parse AWS KMS key usage & rotation log JSON",
    processors: json("kms"),
  },
  {
    id: "logs-aws.secretsmanager-default",
    dataset: "aws.secretsmanager",
    group: "security",
    description: "Parse AWS Secrets Manager access & rotation log JSON",
    processors: json("secretsmanager"),
  },
  {
    id: "logs-aws.acm-default",
    dataset: "aws.acm",
    group: "security",
    description: "Parse AWS Certificate Manager (ACM) certificate lifecycle log JSON",
    processors: json("acm"),
  },
  {
    id: "logs-aws.identitycenter-default",
    dataset: "aws.identitycenter",
    group: "security",
    description: "Parse AWS IAM Identity Center SSO auth log JSON",
    processors: json("identitycenter"),
  },
  {
    id: "logs-aws.detective-default",
    dataset: "aws.detective",
    group: "security",
    description: "Parse Amazon Detective behavioural analysis finding JSON",
    processors: json("detective"),
  },
  {
    id: "logs-aws.verifiedaccess-default",
    dataset: "aws.verifiedaccess",
    group: "security",
    description: "Parse AWS Verified Access session/request audit log JSON from message field",
    processors: [
      { json: { field: "message", target_field: "verifiedaccess.parsed", ignore_failure: true } },
      {
        rename: {
          field: "verifiedaccess.parsed.verdict",
          target_field: "verifiedaccess.verdict",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
      {
        rename: {
          field: "verifiedaccess.parsed.deny_reason",
          target_field: "verifiedaccess.deny_reason",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
      {
        rename: {
          field: "verifiedaccess.parsed.device_posture",
          target_field: "verifiedaccess.device_posture",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
      {
        rename: {
          field: "verifiedaccess.parsed.trust_provider_type",
          target_field: "verifiedaccess.trust_provider_type",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
    ],
  },
  {
    id: "logs-aws.securitylake-default",
    dataset: "aws.securitylake",
    group: "security",
    description: "Parse Amazon Security Lake OCSF 1.1.0 event JSON from message field",
    processors: [
      { json: { field: "message", target_field: "securitylake.parsed", ignore_failure: true } },
      {
        rename: {
          field: "securitylake.parsed.class_uid",
          target_field: "securitylake.class_uid",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
      {
        rename: {
          field: "securitylake.parsed.category_uid",
          target_field: "securitylake.category_uid",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
      {
        rename: {
          field: "securitylake.parsed.activity_id",
          target_field: "securitylake.activity_id",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
      {
        rename: {
          field: "securitylake.parsed.severity_id",
          target_field: "securitylake.severity_id",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
      {
        rename: {
          field: "securitylake.parsed.class_name",
          target_field: "securitylake.class_name",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NETWORKING
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "logs-aws.shield-default",
    dataset: "aws.shield",
    group: "networking",
    description: "Parse AWS Shield DDoS detection event JSON",
    processors: json("shield"),
  },
  {
    id: "logs-aws.globalaccelerator-default",
    dataset: "aws.globalaccelerator",
    group: "networking",
    description: "Parse AWS Global Accelerator anycast routing log JSON",
    processors: json("globalaccelerator"),
  },
  {
    id: "logs-aws.directconnect-default",
    dataset: "aws.directconnect",
    group: "networking",
    description: "Parse AWS Direct Connect circuit log JSON",
    processors: json("directconnect"),
  },
  {
    id: "logs-aws.privatelink-default",
    dataset: "aws.privatelink",
    group: "networking",
    description: "Parse AWS PrivateLink VPC endpoint log JSON",
    processors: json("privatelink"),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // STREAMING
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "logs-aws.firehose-default",
    dataset: "aws.firehose",
    group: "streaming",
    description: "Parse Amazon Data Firehose delivery stream log JSON",
    processors: json("firehose"),
  },
  {
    id: "logs-aws.kinesisanalytics-default",
    dataset: "aws.kinesisanalytics",
    group: "streaming",
    description: "Parse Amazon Kinesis Data Analytics real-time app log JSON",
    processors: json("kinesisanalytics"),
  },
  {
    id: "logs-aws.amazonmq-default",
    dataset: "aws.amazonmq",
    group: "streaming",
    description: "Parse Amazon MQ ActiveMQ/RabbitMQ log JSON",
    processors: json("amazonmq"),
  },
  {
    id: "logs-aws.eventbridge-default",
    dataset: "aws.eventbridge",
    group: "streaming",
    description: "Parse Amazon EventBridge event routing log JSON",
    processors: json("eventbridge"),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // IOT
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "logs-aws.iot-default",
    dataset: "aws.iot",
    group: "iot",
    description: "Parse AWS IoT Core device connect/publish JSON from message field",
    processors: [
      { json: { field: "message", target_field: "iot.parsed", ignore_failure: true } },
      {
        rename: {
          field: "iot.parsed.clientId",
          target_field: "iot.clientId",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
      {
        rename: {
          field: "iot.parsed.action",
          target_field: "iot.action",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
      {
        rename: {
          field: "iot.parsed.topic",
          target_field: "iot.topic",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
    ],
  },

  {
    id: "logs-aws.greengrass-default",
    dataset: "aws.greengrass",
    group: "iot",
    description: "Parse AWS IoT Greengrass edge component log JSON from message field",
    processors: json("greengrass"),
  },

  {
    id: "logs-aws.iotanalytics-default",
    dataset: "aws.iotanalytics",
    group: "iot",
    description: "Parse AWS IoT Analytics pipeline log JSON",
    processors: json("iotanalytics"),
  },
  {
    id: "logs-aws.iotdefender-default",
    dataset: "aws.iotdefender",
    group: "iot",
    description: "Parse AWS IoT Device Defender audit finding JSON",
    processors: json("iotdefender"),
  },
  {
    id: "logs-aws.iotevents-default",
    dataset: "aws.iotevents",
    group: "iot",
    description: "Parse AWS IoT Events detector state machine JSON",
    processors: json("iotevents"),
  },
  {
    id: "logs-aws.iotsitewise-default",
    dataset: "aws.iotsitewise",
    group: "iot",
    description: "Parse AWS IoT SiteWise industrial asset telemetry JSON",
    processors: json("iotsitewise"),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MANAGEMENT & GOVERNANCE
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "logs-aws.cloudformation-default",
    dataset: "aws.cloudformation",
    group: "management",
    description: "Parse AWS CloudFormation stack event JSON from message field",
    processors: [
      { json: { field: "message", target_field: "cloudformation.parsed", ignore_failure: true } },
      {
        rename: {
          field: "cloudformation.parsed.stackName",
          target_field: "cloudformation.stackName",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
      {
        rename: {
          field: "cloudformation.parsed.stackStatus",
          target_field: "cloudformation.stackStatus",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
      {
        rename: {
          field: "cloudformation.parsed.action",
          target_field: "cloudformation.action",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
    ],
  },

  {
    id: "logs-aws.ssm-default",
    dataset: "aws.ssm",
    group: "management",
    description: "Parse AWS Systems Manager Run Command / Session log JSON from message field",
    processors: [
      { json: { field: "message", target_field: "ssm.parsed", ignore_failure: true } },
      {
        rename: {
          field: "ssm.parsed.commandId",
          target_field: "ssm.commandId",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
      {
        rename: {
          field: "ssm.parsed.documentName",
          target_field: "ssm.documentName",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
      {
        rename: {
          field: "ssm.parsed.instanceId",
          target_field: "ssm.instanceId",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
      {
        rename: {
          field: "ssm.parsed.status",
          target_field: "ssm.status",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
    ],
  },

  {
    id: "logs-aws.codebuild-default",
    dataset: "aws.codebuild",
    group: "management",
    description: "Parse AWS CodeBuild build log JSON from message field",
    processors: [
      { json: { field: "message", target_field: "codebuild.parsed", ignore_failure: true } },
      {
        rename: {
          field: "codebuild.parsed.buildId",
          target_field: "codebuild.buildId",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
      {
        rename: {
          field: "codebuild.parsed.project",
          target_field: "codebuild.project",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
      {
        rename: {
          field: "codebuild.parsed.phase",
          target_field: "codebuild.phase",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
      {
        rename: {
          field: "codebuild.parsed.status",
          target_field: "codebuild.status",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
    ],
  },

  {
    id: "logs-aws.codepipeline-default",
    dataset: "aws.codepipeline",
    group: "management",
    description: "Parse AWS CodePipeline execution event JSON from message field",
    processors: [
      { json: { field: "message", target_field: "codepipeline.parsed", ignore_failure: true } },
      {
        rename: {
          field: "codepipeline.parsed.pipeline",
          target_field: "codepipeline.pipeline",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
      {
        rename: {
          field: "codepipeline.parsed.executionId",
          target_field: "codepipeline.executionId",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
      {
        rename: {
          field: "codepipeline.parsed.stage",
          target_field: "codepipeline.stage",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
      {
        rename: {
          field: "codepipeline.parsed.state",
          target_field: "codepipeline.state",
          ignore_missing: true,
          ignore_failure: true,
        },
      },
    ],
  },

  {
    id: "logs-aws.cloudwatch-default",
    dataset: "aws.cloudwatch",
    group: "management",
    description: "Parse Amazon CloudWatch Alarms state change JSON",
    processors: json("cloudwatch"),
  },
  {
    id: "logs-aws.trustedadvisor-default",
    dataset: "aws.trustedadvisor",
    group: "management",
    description: "Parse AWS Trusted Advisor check result JSON",
    processors: json("trustedadvisor"),
  },
  {
    id: "logs-aws.controltower-default",
    dataset: "aws.controltower",
    group: "management",
    description: "Parse AWS Control Tower guardrail/account event JSON",
    processors: json("controltower"),
  },
  {
    id: "logs-aws.organizations-default",
    dataset: "aws.organizations",
    group: "management",
    description: "Parse AWS Organizations account & policy event JSON",
    processors: json("organizations"),
  },
  {
    id: "logs-aws.servicecatalog-default",
    dataset: "aws.servicecatalog",
    group: "management",
    description: "Parse AWS Service Catalog provisioning event JSON",
    processors: json("servicecatalog"),
  },
  {
    id: "logs-aws.servicequotas-default",
    dataset: "aws.servicequotas",
    group: "management",
    description: "Parse AWS Service Quotas utilisation alert JSON",
    processors: json("servicequotas"),
  },
  {
    id: "logs-aws.computeoptimizer-default",
    dataset: "aws.computeoptimizer",
    group: "management",
    description: "Parse AWS Compute Optimizer recommendation JSON",
    processors: json("computeoptimizer"),
  },
  {
    id: "logs-aws.budgets-default",
    dataset: "aws.budgets",
    group: "management",
    description: "Parse AWS Budgets cost threshold alert JSON",
    processors: json("budgets"),
  },
  {
    id: "logs-aws.ram-default",
    dataset: "aws.ram",
    group: "management",
    description: "Parse AWS RAM sharing event JSON",
    processors: json("ram"),
  },
  {
    id: "logs-aws.resiliencehub-default",
    dataset: "aws.resiliencehub",
    group: "management",
    description: "Parse AWS Resilience Hub RTO/RPO assessment JSON",
    processors: json("resiliencehub"),
  },
  {
    id: "logs-aws.migrationhub-default",
    dataset: "aws.migrationhub",
    group: "management",
    description: "Parse AWS Migration Hub server migration status JSON",
    processors: json("migrationhub"),
  },
  {
    id: "logs-aws.networkmanager-default",
    dataset: "aws.networkmanager",
    group: "management",
    description: "Parse AWS Network Manager WAN topology log JSON",
    processors: json("networkmanager"),
  },
  {
    id: "logs-aws.dms-default",
    dataset: "aws.dms",
    group: "management",
    description: "Parse AWS DMS database migration task log JSON",
    processors: json("dms"),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DEVELOPER TOOLS & CI/CD
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "logs-aws.codedeploy-default",
    dataset: "aws.codedeploy",
    group: "devtools",
    description: "Parse AWS CodeDeploy deployment lifecycle JSON",
    processors: json("codedeploy"),
  },
  {
    id: "logs-aws.codecommit-default",
    dataset: "aws.codecommit",
    group: "devtools",
    description: "Parse AWS CodeCommit git push/PR event JSON",
    processors: json("codecommit"),
  },
  {
    id: "logs-aws.codeartifact-default",
    dataset: "aws.codeartifact",
    group: "devtools",
    description: "Parse AWS CodeArtifact package publish/pull JSON",
    processors: json("codeartifact"),
  },
  {
    id: "logs-aws.amplify-default",
    dataset: "aws.amplify",
    group: "devtools",
    description: "Parse AWS Amplify build & deploy event JSON",
    processors: json("amplify"),
  },
  {
    id: "logs-aws.xray-default",
    dataset: "aws.xray",
    group: "devtools",
    description: "Parse AWS X-Ray distributed trace segment JSON",
    processors: json("xray"),
  },
  {
    id: "logs-aws.codeguru-default",
    dataset: "aws.codeguru",
    group: "devtools",
    description: "Parse Amazon CodeGuru code quality finding JSON",
    processors: json("codeguru"),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // END USER & MEDIA
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "logs-aws.workspaces-default",
    dataset: "aws.workspaces",
    group: "enduser",
    description: "Parse Amazon WorkSpaces virtual desktop session JSON",
    processors: json("workspaces"),
  },
  {
    id: "logs-aws.connect-default",
    dataset: "aws.connect",
    group: "enduser",
    description: "Parse Amazon Connect contact centre call log JSON",
    processors: json("connect"),
  },
  {
    id: "logs-aws.appstream-default",
    dataset: "aws.appstream",
    group: "enduser",
    description: "Parse Amazon AppStream 2.0 app streaming session JSON",
    processors: json("appstream"),
  },
  {
    id: "logs-aws.gamelift-default",
    dataset: "aws.gamelift",
    group: "enduser",
    description: "Parse Amazon GameLift game server & matchmaking JSON",
    processors: json("gamelift"),
  },
  {
    id: "logs-aws.ses-default",
    dataset: "aws.ses",
    group: "enduser",
    description: "Parse Amazon SES email send/bounce/complaint event JSON",
    processors: json("ses"),
  },
  {
    id: "logs-aws.pinpoint-default",
    dataset: "aws.pinpoint",
    group: "enduser",
    description: "Parse Amazon Pinpoint campaign & journey delivery JSON",
    processors: json("pinpoint"),
  },
  {
    id: "logs-aws.transfer-default",
    dataset: "aws.transfer",
    group: "enduser",
    description: "Parse AWS Transfer Family SFTP/FTPS/AS2 transfer JSON",
    processors: json("transfer"),
  },
  {
    id: "logs-aws.lightsail-default",
    dataset: "aws.lightsail",
    group: "enduser",
    description: "Parse Amazon Lightsail instance event JSON",
    processors: json("lightsail"),
  },
  {
    id: "logs-aws.frauddetector-default",
    dataset: "aws.frauddetector",
    group: "enduser",
    description: "Parse Amazon Fraud Detector ML risk decision JSON",
    processors: json("frauddetector"),
  },
  {
    id: "logs-aws.location-default",
    dataset: "aws.location",
    group: "enduser",
    description: "Parse Amazon Location Service geofence & routing JSON",
    processors: json("location"),
  },
  {
    id: "logs-aws.mediaconvert-default",
    dataset: "aws.mediaconvert",
    group: "enduser",
    description: "Parse MediaConvert transcoding job JSON",
    processors: json("mediaconvert"),
  },
  {
    id: "logs-aws.medialive-default",
    dataset: "aws.medialive",
    group: "enduser",
    description: "Parse MediaLive live video channel log JSON",
    processors: json("medialive"),
  },
  {
    id: "logs-aws.blockchain-default",
    dataset: "aws.blockchain",
    group: "enduser",
    description: "Parse Amazon Managed Blockchain transaction/network JSON",
    processors: json("blockchain"),
  },
  {
    id: "logs-aws.devopsguru-default",
    dataset: "aws.devopsguru",
    group: "enduser",
    description: "Parse Amazon DevOps Guru ML anomaly insight JSON",
    processors: json("devopsguru"),
  },
  {
    id: "logs-aws.wafv2-default",
    dataset: "aws.wafv2",
    group: "networking",
    description: "Parse AWS WAF v2 web ACL allow/block event JSON",
    processors: json("wafv2"),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // v10.0 NEW SERVICES
  // ═══════════════════════════════════════════════════════════════════════════

  // Networking
  {
    id: "logs-aws.vpclattice-default",
    dataset: "aws.vpclattice",
    group: "networking",
    description: "Parse Amazon VPC Lattice service network access log JSON",
    processors: json("vpclattice"),
  },

  // Security
  {
    id: "logs-aws.securityir-default",
    dataset: "aws.securityir",
    group: "security",
    description: "Parse AWS Security Incident Response case event JSON",
    processors: json("securityir"),
  },
  {
    id: "logs-aws.cloudhsm-default",
    dataset: "aws.cloudhsm",
    group: "security",
    description: "Parse AWS CloudHSM HSM operation and key usage log JSON",
    processors: json("cloudhsm"),
  },

  // Streaming
  {
    id: "logs-aws.mskconnect-default",
    dataset: "aws.mskconnect",
    group: "streaming",
    description: "Parse Amazon MSK Connect Kafka connector task log JSON",
    processors: json("mskconnect"),
  },

  // Analytics
  {
    id: "logs-aws.mwaa-default",
    dataset: "aws.mwaa",
    group: "analytics",
    description: "Parse Amazon MWAA Airflow DAG and task execution log JSON",
    processors: json("mwaa"),
  },
  {
    id: "logs-aws.cleanrooms-default",
    dataset: "aws.cleanrooms",
    group: "analytics",
    description: "Parse AWS Clean Rooms protected query log JSON",
    processors: json("cleanrooms"),
  },
  {
    id: "logs-aws.datazone-default",
    dataset: "aws.datazone",
    group: "analytics",
    description: "Parse Amazon DataZone data catalog and governance event JSON",
    processors: json("datazone"),
  },
  {
    id: "logs-aws.entityresolution-default",
    dataset: "aws.entityresolution",
    group: "analytics",
    description: "Parse AWS Entity Resolution matching workflow job log JSON",
    processors: json("entityresolution"),
  },
  {
    id: "logs-aws.dataexchange-default",
    dataset: "aws.dataexchange",
    group: "analytics",
    description: "Parse AWS Data Exchange subscription and job event JSON",
    processors: json("dataexchange"),
  },

  // AI / ML
  {
    id: "logs-aws.kendra-default",
    dataset: "aws.kendra",
    group: "aiml",
    description: "Parse Amazon Kendra enterprise search query and sync log JSON",
    processors: json("kendra"),
  },
  {
    id: "logs-aws.a2i-default",
    dataset: "aws.a2i",
    group: "aiml",
    description: "Parse Augmented AI (A2I) human review loop event JSON",
    processors: json("a2i"),
  },
  {
    id: "logs-aws.healthlake-default",
    dataset: "aws.healthlake",
    group: "aiml",
    description: "Parse Amazon HealthLake FHIR data store operation log JSON",
    processors: json("healthlake"),
  },

  // IoT
  {
    id: "logs-aws.iottwinmaker-default",
    dataset: "aws.iottwinmaker",
    group: "iot",
    description: "Parse AWS IoT TwinMaker digital twin sync and query log JSON",
    processors: json("iottwinmaker"),
  },
  {
    id: "logs-aws.iotfleetwise-default",
    dataset: "aws.iotfleetwise",
    group: "iot",
    description: "Parse AWS IoT FleetWise vehicle signal campaign log JSON",
    processors: json("iotfleetwise"),
  },

  // Developer Tools
  {
    id: "logs-aws.codecatalyst-default",
    dataset: "aws.codecatalyst",
    group: "devtools",
    description: "Parse Amazon CodeCatalyst workflow run and dev environment log JSON",
    processors: json("codecatalyst"),
  },
  {
    id: "logs-aws.devicefarm-default",
    dataset: "aws.devicefarm",
    group: "devtools",
    description: "Parse AWS Device Farm mobile test run log JSON",
    processors: json("devicefarm"),
  },

  // Management
  {
    id: "logs-aws.fis-default",
    dataset: "aws.fis",
    group: "management",
    description: "Parse AWS Fault Injection Service chaos experiment log JSON",
    processors: json("fis"),
  },
  {
    id: "logs-aws.managedgrafana-default",
    dataset: "aws.managedgrafana",
    group: "management",
    description: "Parse Amazon Managed Grafana workspace and alert log JSON",
    processors: json("managedgrafana"),
  },
  {
    id: "logs-aws.supplychain-default",
    dataset: "aws.supplychain",
    group: "management",
    description: "Parse AWS Supply Chain planning and integration event log JSON",
    processors: json("supplychain"),
  },
  {
    id: "logs-aws.arc-default",
    dataset: "aws.arc",
    group: "management",
    description: "Parse Amazon Application Recovery Controller zonal shift log JSON",
    processors: json("arc"),
  },

  // Media
  {
    id: "logs-aws.deadlinecloud-default",
    dataset: "aws.deadlinecloud",
    group: "media",
    description: "Parse AWS Deadline Cloud render farm job and task log JSON",
    processors: json("deadlinecloud"),
  },

  // ── v11.0 NEW SERVICES ────────────────────────────────────────────────────────
  // Networking
  {
    id: "logs-aws.appmesh-default",
    dataset: "aws.appmesh",
    group: "networking",
    description: "Parse AWS App Mesh Envoy proxy access log JSON",
    processors: json("appmesh"),
  },
  {
    id: "logs-aws.clientvpn-default",
    dataset: "aws.clientvpn",
    group: "networking",
    description: "Parse AWS Client VPN connection and auth log JSON",
    processors: json("clientvpn"),
  },
  {
    id: "logs-aws.cloudmap-default",
    dataset: "aws.cloudmap",
    group: "networking",
    description: "Parse AWS Cloud Map service discovery event JSON",
    processors: json("cloudmap"),
  },
  // Compute
  {
    id: "logs-aws.outposts-default",
    dataset: "aws.outposts",
    group: "compute",
    description: "Parse AWS Outposts hybrid cloud capacity event JSON",
    processors: json("outposts"),
  },
  // Security
  {
    id: "logs-aws.auditmanager-default",
    dataset: "aws.auditmanager",
    group: "security",
    description: "Parse AWS Audit Manager compliance assessment evidence JSON",
    processors: json("auditmanager"),
  },
  {
    id: "logs-aws.verifiedpermissions-default",
    dataset: "aws.verifiedpermissions",
    group: "security",
    description: "Parse Amazon Verified Permissions Cedar authorization decision JSON",
    processors: json("verifiedpermissions"),
  },
  {
    id: "logs-aws.paymentcryptography-default",
    dataset: "aws.paymentcryptography",
    group: "security",
    description: "Parse AWS Payment Cryptography key operation log JSON",
    processors: json("paymentcryptography"),
  },
  {
    id: "logs-aws.artifact-default",
    dataset: "aws.artifact",
    group: "security",
    description: "Parse AWS Artifact compliance report access log JSON",
    processors: json("artifact"),
  },
  // Databases
  {
    id: "logs-aws.dax-default",
    dataset: "aws.dax",
    group: "databases",
    description: "Parse Amazon DynamoDB Accelerator (DAX) cache hit/miss and operation log JSON",
    processors: json("dax"),
  },
  // Developer Tools
  {
    id: "logs-aws.proton-default",
    dataset: "aws.proton",
    group: "devtools",
    description: "Parse AWS Proton environment and service deployment log JSON",
    processors: json("proton"),
  },
  // Analytics
  {
    id: "logs-aws.appfabric-default",
    dataset: "aws.appfabric",
    group: "analytics",
    description: "Parse AWS AppFabric SaaS audit log normalisation event JSON",
    processors: json("appfabric"),
  },
  {
    id: "logs-aws.b2bi-default",
    dataset: "aws.b2bi",
    group: "analytics",
    description: "Parse AWS B2B Data Interchange EDI transformation log JSON",
    processors: json("b2bi"),
  },
  // Management
  {
    id: "logs-aws.appconfig-default",
    dataset: "aws.appconfig",
    group: "management",
    description: "Parse AWS AppConfig configuration deployment event JSON",
    processors: json("appconfig"),
  },
  {
    id: "logs-aws.drs-default",
    dataset: "aws.drs",
    group: "management",
    description: "Parse AWS Elastic Disaster Recovery replication event JSON",
    processors: json("drs"),
  },
  {
    id: "logs-aws.licensemanager-default",
    dataset: "aws.licensemanager",
    group: "management",
    description: "Parse AWS License Manager grant and consumption event JSON",
    processors: json("licensemanager"),
  },
  {
    id: "logs-aws.chatbot-default",
    dataset: "aws.chatbot",
    group: "management",
    description: "Parse AWS Chatbot notification delivery event JSON",
    processors: json("chatbot"),
  },
  // Media
  {
    id: "logs-aws.chimesdkvoice-default",
    dataset: "aws.chimesdkvoice",
    group: "media",
    description: "Parse Amazon Chime SDK Voice call quality and SIP event JSON",
    processors: json("chimesdkvoice"),
  },
  // ── v11.1 NEW SERVICES ──────────────────────────────────────────────────────
  {
    id: "logs-aws.wavelength-default",
    dataset: "aws.wavelength",
    group: "compute",
    description: "Parse AWS Wavelength 5G edge compute and carrier gateway event JSON",
    processors: json("wavelength"),
  },
  {
    id: "logs-aws.nova-default",
    dataset: "aws.nova",
    group: "aiml",
    description: "Parse Amazon Nova foundation model invocation log JSON",
    processors: json("nova"),
  },
  {
    id: "logs-aws.lookoutvision-default",
    dataset: "aws.lookoutvision",
    group: "aiml",
    description: "Parse Amazon Lookout for Vision anomaly detection and training JSON",
    processors: json("lookoutvision"),
  },
  // ── v11.4 NEW SERVICES (200-service milestone) ───────────────────────────────
  // Networking
  {
    id: "logs-aws.vpcipam-default",
    dataset: "aws.vpcipam",
    group: "networking",
    description: "Parse Amazon VPC IPAM allocation and pool event JSON",
    processors: json("vpcipam"),
  },
  {
    id: "logs-aws.private5g-default",
    dataset: "aws.private5g",
    group: "networking",
    description: "Parse AWS Private 5G radio unit and device activation event JSON",
    processors: json("private5g"),
  },
  // Databases
  {
    id: "logs-aws.neptuneanalytics-default",
    dataset: "aws.neptuneanalytics",
    group: "databases",
    description: "Parse Amazon Neptune Analytics graph algorithm run event JSON",
    processors: json("neptuneanalytics"),
  },
  {
    id: "logs-aws.auroradsql-default",
    dataset: "aws.auroradsql",
    group: "databases",
    description: "Parse Amazon Aurora DSQL distributed transaction and replication event JSON",
    processors: json("auroradsql"),
  },
  // Compute
  {
    id: "logs-aws.m2-default",
    dataset: "aws.m2",
    group: "compute",
    description: "Parse AWS Mainframe Modernization batch job and online transaction event JSON",
    processors: json("m2"),
  },
  {
    id: "logs-aws.pcs-default",
    dataset: "aws.pcs",
    group: "compute",
    description: "Parse AWS Parallel Computing Service job queue and cluster event JSON",
    processors: json("pcs"),
  },
  {
    id: "logs-aws.evs-default",
    dataset: "aws.evs",
    group: "compute",
    description: "Parse Amazon Elastic VMware Service host and vSAN event JSON",
    processors: json("evs"),
  },
  {
    id: "logs-aws.simspaceweaver-default",
    dataset: "aws.simspaceweaver",
    group: "compute",
    description: "Parse AWS SimSpace Weaver simulation partition and clock event JSON",
    processors: json("simspaceweaver"),
  },
  // AI / ML
  {
    id: "logs-aws.healthomics-default",
    dataset: "aws.healthomics",
    group: "aiml",
    description: "Parse Amazon HealthOmics workflow run and task event JSON",
    processors: json("healthomics"),
  },
  {
    id: "logs-aws.bedrockdataautomation-default",
    dataset: "aws.bedrockdataautomation",
    group: "aiml",
    description: "Parse Amazon Bedrock Data Automation document extraction invocation JSON",
    processors: json("bedrockdataautomation"),
  },
  // IoT
  {
    id: "logs-aws.groundstation-default",
    dataset: "aws.groundstation",
    group: "iot",
    description: "Parse AWS Ground Station satellite contact and antenna event JSON",
    processors: json("groundstation"),
  },
  // End-User Computing
  {
    id: "logs-aws.workmail-default",
    dataset: "aws.workmail",
    group: "enduser",
    description: "Parse Amazon WorkMail email delivery and mailbox event JSON",
    processors: json("workmail"),
  },
  {
    id: "logs-aws.wickr-default",
    dataset: "aws.wickr",
    group: "enduser",
    description: "Parse AWS Wickr encrypted messaging and compliance event JSON",
    processors: json("wickr"),
  },
  // Developer Tools
  {
    id: "logs-aws.qdeveloper-default",
    dataset: "aws.qdeveloper",
    group: "devtools",
    description: "Parse Amazon Q Developer code suggestion and transform event JSON",
    processors: json("qdeveloper"),
  },
  // Messaging
  {
    id: "logs-aws.endusermessaging-default",
    dataset: "aws.endusermessaging",
    group: "streaming",
    description: "Parse AWS End User Messaging SMS/MMS/voice delivery event JSON",
    processors: json("endusermessaging"),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // v11.5 — New services
  // ═══════════════════════════════════════════════════════════════════════════

  // Databases
  {
    id: "logs-aws.rdsproxy-default",
    dataset: "aws.rdsproxy",
    group: "databases",
    description: "Parse Amazon RDS Proxy connection pooling and auth event JSON",
    processors: json("rdsproxy"),
  },
  {
    id: "logs-aws.rdscustom-default",
    dataset: "aws.rdscustom",
    group: "databases",
    description: "Parse Amazon RDS Custom for SQL Server/Oracle instance event JSON",
    processors: json("rdscustom"),
  },
  {
    id: "logs-aws.dmsserverless-default",
    dataset: "aws.dmsserverless",
    group: "databases",
    description: "Parse AWS DMS Serverless replication task event JSON",
    processors: json("dmsserverless"),
  },
  {
    id: "logs-aws.elasticacheglobal-default",
    dataset: "aws.elasticacheglobal",
    group: "databases",
    description: "Parse Amazon ElastiCache Global Datastore replication event JSON",
    processors: json("elasticacheglobal"),
  },

  // AI/ML
  {
    id: "logs-aws.sagemakerfeaturestore-default",
    dataset: "aws.sagemakerfeaturestore",
    group: "aiml",
    description: "Parse Amazon SageMaker Feature Store ingestion and retrieval event JSON",
    processors: json("sagemakerfeaturestore"),
  },
  {
    id: "logs-aws.sagemakerpipelines-default",
    dataset: "aws.sagemakerpipelines",
    group: "aiml",
    description: "Parse Amazon SageMaker Pipelines workflow execution event JSON",
    processors: json("sagemakerpipelines"),
  },
  {
    id: "logs-aws.sagemakermodelmonitor-default",
    dataset: "aws.sagemakermodelmonitor",
    group: "aiml",
    description: "Parse Amazon SageMaker Model Monitor data quality and drift event JSON",
    processors: json("sagemakermodelmonitor"),
  },
  {
    id: "logs-aws.lookoutequipment-default",
    dataset: "aws.lookoutequipment",
    group: "aiml",
    description: "Parse Amazon Lookout for Equipment anomaly detection event JSON",
    processors: json("lookoutequipment"),
  },
  {
    id: "logs-aws.monitron-default",
    dataset: "aws.monitron",
    group: "aiml",
    description: "Parse Amazon Monitron vibration and temperature sensor event JSON",
    processors: json("monitron"),
  },

  // Security
  {
    id: "logs-aws.networkaccessanalyzer-default",
    dataset: "aws.networkaccessanalyzer",
    group: "security",
    description: "Parse VPC Network Access Analyzer finding and path event JSON",
    processors: json("networkaccessanalyzer"),
  },
  {
    id: "logs-aws.incidentmanager-default",
    dataset: "aws.incidentmanager",
    group: "security",
    description: "Parse AWS Systems Manager Incident Manager response plan and timeline event JSON",
    processors: json("incidentmanager"),
  },

  // Developer Tools
  {
    id: "logs-aws.cloudshell-default",
    dataset: "aws.cloudshell",
    group: "devtools",
    description: "Parse AWS CloudShell session and command execution event JSON",
    processors: json("cloudshell"),
  },
  {
    id: "logs-aws.cloud9-default",
    dataset: "aws.cloud9",
    group: "devtools",
    description: "Parse AWS Cloud9 IDE environment lifecycle event JSON",
    processors: json("cloud9"),
  },
  {
    id: "logs-aws.robomaker-default",
    dataset: "aws.robomaker",
    group: "devtools",
    description: "Parse AWS RoboMaker simulation and robot application event JSON",
    processors: json("robomaker"),
  },

  // Storage
  {
    id: "logs-aws.s3_intelligent_tiering-default",
    dataset: "aws.s3_intelligent_tiering",
    group: "storage",
    description: "Parse Amazon S3 Intelligent-Tiering archive and access tier event JSON",
    processors: json("s3_intelligent_tiering"),
  },
  {
    id: "logs-aws.s3_batch_operations-default",
    dataset: "aws.s3_batch_operations",
    group: "storage",
    description: "Parse Amazon S3 Batch Operations job and task completion event JSON",
    processors: json("s3_batch_operations"),
  },

  // IoT
  {
    id: "logs-aws.kinesisvideo-default",
    dataset: "aws.kinesisvideo",
    group: "iot",
    description: "Parse Amazon Kinesis Video Streams Streams ingestion and playback event JSON",
    processors: json("kinesisvideo"),
  },
  {
    id: "logs-aws.panorama-default",
    dataset: "aws.panorama",
    group: "iot",
    description: "Parse AWS Panorama edge appliance and vision model event JSON",
    processors: json("panorama"),
  },
  {
    id: "logs-aws.freertos-default",
    dataset: "aws.freertos",
    group: "iot",
    description: "Parse FreeRTOS device connectivity and OTA update event JSON",
    processors: json("freertos"),
  },

  // Management
  {
    id: "logs-aws.cloudwatch_rum-default",
    dataset: "aws.cloudwatch_rum",
    group: "management",
    description: "Parse Amazon CloudWatch RUM real user monitoring session event JSON",
    processors: json("cloudwatch_rum"),
  },
];
