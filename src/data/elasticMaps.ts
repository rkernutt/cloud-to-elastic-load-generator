// ═══════════════════════════════════════════════════════════════════════════
// ELASTIC DATA STREAM DATASET MAPPING
// Maps app service ID → Elastic AWS integration data_stream.dataset
// ═══════════════════════════════════════════════════════════════════════════

const ELASTIC_DATASET_MAP = {
  cloudtrail: "aws.cloudtrail",
  vpc: "aws.vpcflow",
  alb: "aws.elb_logs",
  nlb: "aws.elb_logs",
  guardduty: "aws.guardduty",
  s3: "aws.s3access",
  storagelens: "aws.s3_storage_lens",
  apigateway: "aws.apigateway_logs",
  cloudfront: "aws.cloudfront_logs",
  lambda: "aws.lambda_logs",
  networkfirewall: "aws.firewall_logs",
  securityhub: "aws.securityhub_findings",
  waf: "aws.waf",
  wafv2: "aws.waf",
  rds: "aws.rds",
  route53: "aws.route53_public_logs",
  route53resolver: "aws.route53_resolver_logs",
  emr: "aws.emr_logs",
  ec2: "aws.ec2_logs",
  ecs: "aws.ecs",
  config: "aws.config",
  inspector: "aws.inspector",
  dynamodb: "aws.dynamodb",
  redshift: "aws.redshift",
  ebs: "aws.ebs",
  kinesis: "aws.kinesis",
  msk: "aws.kafka_metrics",
  sns: "aws.sns",
  sqs: "aws.sqs",
  transitgateway: "aws.transitgateway",
  vpn: "aws.vpn",
  health: "aws.awshealth",
  bedrockagent: "aws.bedrockagent",
  billing: "aws.billing",
  natgateway: "aws.natgateway",
  // Elastic Security posture (non-AWS dataset path)
  cspm: "cloud_security_posture.findings",
  kspm: "cloud_security_posture.findings",
  vpclattice: "aws.vpclattice",
  mwaa: "aws.mwaa",
  fis: "aws.fis",
  cleanrooms: "aws.cleanrooms",
  datazone: "aws.datazone",
  securityir: "aws.securityir",
  cloudhsm: "aws.cloudhsm",
  managedgrafana: "aws.managedgrafana",
  supplychain: "aws.supplychain",
  iottwinmaker: "aws.iottwinmaker",
  iotfleetwise: "aws.iotfleetwise",
  codecatalyst: "aws.codecatalyst",
  entityresolution: "aws.entityresolution",
  dataexchange: "aws.dataexchange",
  devicefarm: "aws.devicefarm",
  mskconnect: "aws.mskconnect",
  a2i: "aws.a2i",
  deadlinecloud: "aws.deadlinecloud",
  healthlake: "aws.healthlake",
  arc: "aws.arc",
  // v11.1 new services
  wavelength: "aws.wavelength",
  nova: "aws.nova",
  lookoutvision: "aws.lookoutvision",
  // v11.0 new services
  appmesh: "aws.appmesh",
  clientvpn: "aws.clientvpn",
  cloudmap: "aws.cloudmap",
  outposts: "aws.outposts",
  auditmanager: "aws.auditmanager",
  verifiedpermissions: "aws.verifiedpermissions",
  paymentcryptography: "aws.paymentcryptography",
  dax: "aws.dax",
  proton: "aws.proton",
  appfabric: "aws.appfabric",
  b2bi: "aws.b2bi",
  appconfig: "aws.appconfig",
  drs: "aws.drs",
  licensemanager: "aws.licensemanager",
  chatbot: "aws.chatbot",
  chimesdkvoice: "aws.chimesdkvoice",
  // v11.4 new services
  vpcipam: "aws.vpcipam",
  private5g: "aws.private5g",
  neptuneanalytics: "aws.neptuneanalytics",
  auroradsql: "aws.auroradsql",
  mainframemodernization: "aws.m2",
  parallelcomputing: "aws.pcs",
  evs: "aws.evs",
  healthomics: "aws.healthomics",
  bedrockdataautomation: "aws.bedrockdataautomation",
  groundstation: "aws.groundstation",
  workmail: "aws.workmail",
  wickr: "aws.wickr",
  qdeveloper: "aws.qdeveloper",
  endusermessaging: "aws.endusermessaging",
  // v11.5 new services
  networkaccessanalyzer: "aws.networkaccessanalyzer",
  incidentmanager: "aws.incidentmanager",
  cloud9: "aws.cloud9",
  lookoutequipment: "aws.lookoutequipment",
  monitron: "aws.monitron",
  kinesisvideo: "aws.kinesisvideo",
  cloudwatchrum: "aws.cloudwatch_rum",
  // Extended AWS integrations pack
  bedrockguardrails: "aws.bedrockguardrails",
  gwlb: "aws.gwlb",
  elb: "aws.elb_logs",
  mediaconnect: "aws.mediaconnect",
  mediapackage: "aws.mediapackage",
  mediatailor: "aws.mediatailor",
  ivs: "aws.ivs",
  ivschat: "aws.ivschat",
  directoryservice: "aws.directoryservice",
  acmpca: "aws.acmpca",
  mgn: "aws.mgn",
  cwsynthetics: "aws.cwsynthetics",
  managedprometheus: "aws.managedprometheus",
};

// ═══════════════════════════════════════════════════════════════════════════
// DEDICATED ELASTIC INTEGRATION LOG DATASETS
// Services with built-in parsers in the Elastic AWS or Firehose integration.
// These get their real dataset regardless of ingestion method because Elastic
// has content-based detection / dedicated input streams for them.
// Source: elastic/integrations aws package + awsfirehose package
// ═══════════════════════════════════════════════════════════════════════════

const DEDICATED_LOG_DATASETS: Record<string, string> = {
  cloudtrail: "aws.cloudtrail",
  vpc: "aws.vpcflow",
  alb: "aws.elb_logs",
  nlb: "aws.elb_logs",
  elb: "aws.elb_logs",
  cloudfront: "aws.cloudfront_logs",
  waf: "aws.waf",
  wafv2: "aws.waf",
  networkfirewall: "aws.firewall_logs",
  route53: "aws.route53_public_logs",
  route53resolver: "aws.route53_resolver_logs",
  s3: "aws.s3access",
  ec2: "aws.ec2_logs",
  lambda: "aws.lambda_logs",
  apigateway: "aws.apigateway_logs",
  emr: "aws.emr_logs",
  guardduty: "aws.guardduty",
  securityhub: "aws.securityhub_findings",
  inspector: "aws.inspector",
  config: "aws.config",
  health: "aws.awshealth",
  storagelens: "aws.s3_storage_lens",
  billing: "aws.billing",
};

// ─── Fallback datasets when no dedicated parser exists ──────────────────────
const GENERIC_DATASET_BY_SOURCE: Record<string, string> = {
  cloudwatch: "aws.cloudwatch_logs",
  s3: "aws_logs.generic",
  firehose: "awsfirehose",
  api: "aws.cloudwatch_logs",
  agent: "aws.cloudwatch_logs",
  otel: "aws.cloudwatch_logs",
  "otel-edot-collector": "aws.cloudwatch_logs",
  "otel-csp-edot-gateway": "aws.cloudwatch_logs",
  // Fluent Bit (ECS FireLens / EKS DaemonSet) ships container stdout/stderr directly
  // to Elasticsearch. Documents carry the same log content as the CloudWatch path.
  "fluent-bit": "aws.cloudwatch_logs",
};

/**
 * Resolve the correct log dataset for a service + ingestion source combination.
 * - Services with a dedicated Elastic integration parser always get their
 *   real dataset (Firehose auto-routes them, S3/CW inputs parse them).
 * - Everything else gets the generic dataset for the ingestion method.
 */
function resolveLogDatasetForSource(serviceId: string, source: string): string {
  const dedicated = DEDICATED_LOG_DATASETS[serviceId];
  if (dedicated) return dedicated;
  return GENERIC_DATASET_BY_SOURCE[source] || "aws.cloudwatch_logs";
}

// ═══════════════════════════════════════════════════════════════════════════
// REAL ELASTIC LOG DATASET VALUES
// The set of dataset *values* that correspond to a real Elastic integration
// data stream (dedicated AWS parsers + the generic catch-alls + Cloud Security
// Posture). Any other `aws.<service>` value is a project-specific dataset that
// the project ships custom pipelines/dashboards for.
// ═══════════════════════════════════════════════════════════════════════════

const REAL_LOG_DATASET_VALUES = new Set<string>([
  ...Object.values(DEDICATED_LOG_DATASETS),
  // Security Hub also has an insights stream; posture is a separate integration
  "aws.securityhub_insights",
  "cloud_security_posture.findings",
  // Generic catch-alls (must pass through unchanged)
  "aws.cloudwatch_logs",
  "aws_logs.generic",
  "awsfirehose",
]);

/**
 * Generator log datasets that contradict the project's own dataset map / ingest
 * pipeline for a service that has a real Elastic integration data stream. These
 * are stale inline values emitted by generators — the docs were landing in an
 * index with no parser. Correcting them aligns the data with the real Elastic
 * dataset (and the matching ingest pipeline), and the per-service dashboards
 * use `logs-aws.<service>*` wildcards so they keep matching.
 */
const LOG_DATASET_MISMATCH_FIX: Record<string, string> = {
  "aws.ec2": "aws.ec2_logs",
  "aws.s3": "aws.s3access",
  "aws.inspector2": "aws.inspector",
  "aws.route53": "aws.route53_public_logs",
};

/**
 * Normalize a log dataset *value* against the real Elastic data streams,
 * honoring the chosen ingestion method.
 *
 * - Known generator/map mismatches are corrected to the real Elastic dataset.
 * - Real dedicated/posture/generic values pass through unchanged.
 * - Project-specific `aws.<service>` values (which ship with custom ingest
 *   pipelines + dashboards) are kept as-is on each service's native path so the
 *   per-service custom assets keep working. Only when the user *explicitly*
 *   overrides the ingestion method are they switched to that method's generic
 *   stream (S3 → `aws_logs.generic`, Firehose → `awsfirehose`), mirroring how
 *   those logs would really land in Elastic when shipped via S3 or Firehose.
 *
 * @param ingestionOverridden true when the user explicitly selected a global
 *   ingestion method (vs the service's native default). The generic switch only
 *   fires on an explicit override so native bespoke datasets are preserved.
 */
function normalizeAwsLogDataset(
  dataset: string | undefined,
  source: string,
  ingestionOverridden = false
): string {
  if (!dataset) return GENERIC_DATASET_BY_SOURCE[source] || "aws.cloudwatch_logs";
  const corrected = LOG_DATASET_MISMATCH_FIX[dataset] ?? dataset;
  if (REAL_LOG_DATASET_VALUES.has(corrected)) return corrected;
  if (ingestionOverridden) {
    const generic = GENERIC_DATASET_BY_SOURCE[source];
    // Only override bespoke datasets when the chosen method routes somewhere
    // other than the CloudWatch catch-all (i.e. S3 or Firehose).
    if (generic && generic !== "aws.cloudwatch_logs") return generic;
  }
  return corrected;
}

// ═══════════════════════════════════════════════════════════════════════════
// REAL-WORLD CLOUDWATCH LOG GROUP PATTERNS
// When ingesting via CloudWatch, the log_group identifies the service.
// ═══════════════════════════════════════════════════════════════════════════

const CLOUDWATCH_LOG_GROUPS: Record<
  string,
  string | ((ctx: { region?: string; clusterId?: string; envName?: string }) => string)
> = {
  lambda: "/aws/lambda/${functionName}",
  ecs: "/ecs/${clusterName}",
  eks: "/aws/eks/${clusterName}/cluster",
  rds: "/aws/rds/instance/${dbInstanceId}/error",
  aurora: "/aws/rds/cluster/${clusterId}/error",
  apigateway: "/aws/apigateway/${apiId}",
  appsync: "/aws/appsync/apis/${apiId}",
  emr: "/aws/emr/${clusterId}",
  glue: "/aws/glue/jobs/output",
  athena: "/aws/athena/query-logs",
  stepfunctions: "/aws/vendedlogs/states/${stateMachineId}",
  eventbridge: "/aws/events/${ruleName}",
  mwaa: "/aws/mwaa/environment/${envName}/DAGProcessing",
  sagemaker: "/aws/sagemaker/TrainingJobs",
  bedrock: "/aws/bedrock/modelinvocations",
  bedrockagent: "/aws/bedrock/agents",
  codebuild: "/aws/codebuild/${projectName}",
  batch: "/aws/batch/job",
  opensearch: "/aws/OpenSearchService/domains/${domainName}/search-logs",
  elasticache: "/aws/elasticache/${cacheClusterId}",
  redshift: "/aws/redshift/${clusterName}",
  docdb: "/aws/docdb/${clusterName}/profiler",
  neptune: "/aws/neptune/${clusterId}/audit",
  msk: "/aws/msk/${clusterName}/broker-logs",
  kinesis: "/aws/kinesis/${streamName}",
  cognito: "/aws/cognito/userpools/${userPoolId}",
  cloudformation: "/aws/cloudformation/${stackName}",
  transitgateway: "/aws/transitgateway/flowlogs",
  vpn: "/aws/vpn/${vpnConnectionId}",
  connect: "/aws/connect/${instanceId}",
  route53: "/aws/route53/${hostedZoneId}",
  route53resolver: "/aws/route53resolver/query-logs",
  networkfirewall: "/aws/networkfirewall/flow",
  cloudtrail: "aws-cloudtrail-logs-${accountId}",
  waf: "aws-waf-logs-${webAclName}",
  cloudfront: "/aws/cloudfront/${distributionId}",
  ec2: "/aws/ec2/${instanceId}/syslog",
  kms: "/aws/kms/${keyId}",
  secretsmanager: "/aws/secretsmanager",
  dms: "/aws/dms/tasks/${taskId}",
  apprunner: "/aws/apprunner/${serviceName}/application",
  ssm: "/aws/ssm/session-logs",
};

// ═══════════════════════════════════════════════════════════════════════════
// SERVICES WITH METRICS IN ELASTIC AWS INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

const METRICS_SUPPORTED_SERVICE_IDS = new Set([
  // Core compute & serverless
  "lambda",
  "ec2",
  "ecs",
  "fargate",
  "eks",
  "apprunner",
  "elasticbeanstalk",
  "batch",
  "wavelength",
  // Compute (container registry & API layer)
  "ecr",
  "apigateway",
  // Networking & CDN
  "alb",
  "nlb",
  "cloudfront",
  "natgateway",
  "transitgateway",
  "vpn",
  "networkfirewall",
  "globalaccelerator",
  "directconnect",
  "vpc",
  // Networking (private connectivity & WAN)
  "privatelink",
  "vpclattice",
  "networkmanager",
  "appmesh",
  "clientvpn",
  "cloudmap",
  // Hybrid / edge
  "outposts",
  // Security / data (v11 metrics generators)
  "verifiedpermissions",
  "dax",
  // Voice / DR (v11 metrics generators)
  "chimesdkvoice",
  "drs",
  // Databases & storage
  "rds",
  "aurora",
  "dynamodb",
  "redshift",
  "ebs",
  "s3",
  "storagelens",
  "elasticache",
  "opensearch",
  "docdb",
  "neptune",
  "keyspaces",
  "memorydb",
  "timestream",
  "efs",
  "fsx",
  "backup",
  // Storage (migration & hybrid)
  "datasync",
  "storagegateway",
  // Streaming & messaging
  "kinesis",
  "kinesisanalytics",
  "msk",
  "mskconnect",
  "firehose",
  "sns",
  "sqs",
  "eventbridge",
  "amazonmq",
  // Security
  "waf",
  "wafv2",
  "shield",
  "kms",
  "cognito",
  // Security (extended)
  "guardduty",
  "macie",
  "inspector",
  "config",
  "accessanalyzer",
  "secretsmanager",
  "acm",
  "identitycenter",
  "detective",
  "verifiedaccess",
  "securitylake",
  "cloudtrail",
  "securityhub",
  // Analytics & ML
  "glue",
  "athena",
  "emr",
  "sagemaker",
  "bedrock",
  "bedrockagent",
  // Analytics (extended)
  "lakeformation",
  "databrew",
  "appflow",
  // ML / AI services
  "rekognition",
  "textract",
  "comprehend",
  "comprehendmedical",
  "translate",
  "transcribe",
  "polly",
  "personalize",
  "lex",
  "qbusiness",
  "nova",
  "lookoutvision",
  // Developer & CI/CD
  "codebuild",
  "codepipeline",
  "codedeploy",
  "amplify",
  // Developer tools (extended)
  "codecommit",
  "codeartifact",
  "codeguru",
  // Management & observability
  "cloudwatch",
  "stepfunctions",
  "appsync",
  "health",
  "billing",
  // Management (extended)
  "cloudformation",
  "ssm",
  "controltower",
  "organizations",
  "servicecatalog",
  "servicequotas",
  "computeoptimizer",
  "budgets",
  "dms",
  "resiliencehub",
  "ram",
  "migrationhub",
  "devopsguru",
  // IoT
  "iotcore",
  // IoT (extended)
  "greengrass",
  "iotanalytics",
  "iotevents",
  "iotsitewise",
  "iotdefender",
  // End-user & media
  "workspaces",
  "connect",
  "gamelift",
  "transferfamily",
  // End-user & media (extended)
  "appstream",
  "pinpoint",
  "lightsail",
  "frauddetector",
  "locationservice",
  "mediaconvert",
  "medialive",
  "managedblockchain",
  // Additional CloudWatch-capable
  "route53",
  "route53resolver",
  "autoscaling",
  "quicksight",
  "mwaa",
  "imagebuilder",
  "xray",
  "ses",
  // v11.5 new services
  "lookoutequipment",
  "monitron",
  "networkaccessanalyzer",
  "incidentmanager",
  "cloud9",
  "kinesisvideo",
  "cloudwatchrum",
  "a2i",
  "appfabric",
  "arc",
  "auditmanager",
  "b2bi",
  "chatbot",
  "cloudhsm",
  "codecatalyst",
  "dataexchange",
  "datazone",
  "devicefarm",
  "entityresolution",
  "paymentcryptography",
  "proton",
  "securityir",
  "supplychain",
  // Extended AWS integrations pack (metrics + logs)
  "bedrockguardrails",
  "gwlb",
  "elb",
  "mediaconnect",
  "mediapackage",
  "mediatailor",
  "ivs",
  "ivschat",
  "directoryservice",
  "acmpca",
  "mgn",
  "cwsynthetics",
  "managedprometheus",
]);

// Dataset for metrics mode when it differs from logs. Omitted = use ELASTIC_DATASET_MAP.
const ELASTIC_METRICS_DATASET_MAP = {
  lambda: "aws.lambda",
  apigateway: "aws.apigateway_metrics",
  ecs: "aws.ecs_metrics",
  fargate: "aws.ecs_metrics",
  msk: "aws.kafka_metrics",
  emr: "aws.emr_metrics",
  s3: "aws.s3_daily_storage",
  cloudwatch: "aws.cloudwatch_metrics",
  alb: "aws.elb_metrics",
  nlb: "aws.elb_metrics",
  networkfirewall: "aws.firewall_metrics",
  billing: "aws.billing",
  sagemaker: "aws.sagemaker",
  bedrock: "aws.bedrock",
  bedrockagent: "aws.bedrockagent",
  storagelens: "aws.s3_storage_lens",
  vpc: "aws.vpcflow",
  route53: "aws.route53_public_logs",
  route53resolver: "aws.route53resolver",
  // Security services
  guardduty: "aws.guardduty",
  cloudtrail: "aws.cloudtrail",
  ssm: "aws.ssm",
  cloudformation: "aws.cloudformation",
  // Developer tools
  codecommit: "aws.codecommit",
  codedeploy: "aws.codedeploy",
  // ML / AI services
  rekognition: "aws.rekognition",
  // IoT
  iotcore: "aws.iot",
  a2i: "aws.a2i",
  appfabric: "aws.appfabric",
  arc: "aws.arc",
  auditmanager: "aws.auditmanager",
  b2bi: "aws.b2bi",
  chatbot: "aws.chatbot",
  cloudhsm: "aws.cloudhsm",
  codecatalyst: "aws.codecatalyst",
  dataexchange: "aws.dataexchange",
  datazone: "aws.datazone",
  devicefarm: "aws.devicefarm",
  entityresolution: "aws.entityresolution",
  paymentcryptography: "aws.paymentcryptography",
  proton: "aws.proton",
  securityir: "aws.securityir",
  supplychain: "aws.supplychain",
  elb: "aws.elb_metrics",
};

export {
  ELASTIC_DATASET_MAP,
  METRICS_SUPPORTED_SERVICE_IDS,
  ELASTIC_METRICS_DATASET_MAP,
  DEDICATED_LOG_DATASETS,
  GENERIC_DATASET_BY_SOURCE,
  CLOUDWATCH_LOG_GROUPS,
  resolveLogDatasetForSource,
  REAL_LOG_DATASET_VALUES,
  normalizeAwsLogDataset,
};
