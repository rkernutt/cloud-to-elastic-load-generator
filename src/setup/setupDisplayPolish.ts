import type { CloudId } from "../cloud/types";

/**
 * Single-token fixes for AWS dashboard title fragments (after "AWS"/"Amazon", before em dash).
 * Keys are lowercase.
 */
const AWS_FRAGMENT_TOKEN: Record<string, string> = {
  evs: "EVS",
  ecs: "ECS",
  ebs: "EBS",
  rds: "RDS",
  sns: "SNS",
  sqs: "SQS",
  msk: "MSK",
  dynamodb: "DynamoDB",
  vpcipam: "VPC IPAM",
  vpn: "VPN",
  simspaceweaver: "SimSpace Weaver",
  endusermessaging: "End User Messaging",
  parallelcomputing: "Parallel Computing",
  workmail: "WorkMail",
  transitgateway: "Transit Gateway",
  storagelens: "Storage Lens",
  neptuneanalytics: "Neptune Analytics",
  groundstation: "Ground Station",
  bedrockdataautomation: "Bedrock Data Automation",
  auroradsql: "Aurora DSQL",
  mainframemodernization: "Mainframe Modernization",
  healthomics: "HealthOmics",
  qdeveloper: "Q Developer",
  natgateway: "NAT Gateway",
  bedrockagent: "Bedrock Agents",
  freertos: "FreeRTOS",
  private5g: "Private 5G",
  "openSearch service": "OpenSearch Service",
  "opensearch service": "OpenSearch Service",
  "data firehose": "Data Firehose",
  "s3 storage lens": "S3 Storage Lens",
  "kinesis data streams": "Kinesis Data Streams",
  "kinesis data analytics": "Kinesis Data Analytics",
  "bedrock agents": "Bedrock Agents",
};

/**
 * Token fixes for GCP / Azure dashboard fragments (after cloud prefix, before em dash).
 * Keys are lowercase. Used for full-title polish and first-word group keys (Gke → GKE).
 */
const CLOUD_WORD_POLISH: Record<string, string> = {
  gke: "GKE",
  gce: "GCE",
  aks: "AKS",
  sql: "SQL",
  iam: "IAM",
  api: "API",
  vpn: "VPN",
  vpc: "VPC",
  kms: "KMS",
  cdn: "CDN",
  dns: "DNS",
  tpu: "TPU",
  ids: "IDS",
  nat: "NAT",
  dr: "DR",
  db: "DB",
  ai: "AI",
  ml: "ML",
  iot: "IoT",
  ad: "AD",
  vm: "VM",
  automl: "AutoML",
  vmware: "VMware",
  alloydb: "AlloyDB",
  dlp: "DLP",
  beyondcorp: "BeyondCorp",
  dataprep: "Dataprep",
  recaptcha: "reCAPTCHA",
  pubsub: "Pub/Sub",
  postgresql: "PostgreSQL",
  mysql: "MySQL",
  bigquery: "BigQuery",
  bigtable: "Bigtable",
  firestore: "Firestore",
  datastore: "Datastore",
  dataproc: "Dataproc",
  dataplex: "Dataplex",
  dataflow: "Dataflow",
  datastream: "Datastream",
  dialogflow: "Dialogflow",
  openai: "OpenAI",
  devops: "DevOps",
  expressroute: "ExpressRoute",
  netapp: "NetApp",
  kusto: "Kusto",
  acr: "ACR",
  hdinsight: "HDInsight",
  sap: "SAP",
  signalr: "SignalR",
  waf: "WAF",
  hpc: "HPC",
  ddos: "DDoS",
};

function polishAwsTitleMiddle(middle: string): string {
  const t = middle.trim().replace(/\s+/g, " ");
  const exact = AWS_FRAGMENT_TOKEN[t.toLowerCase()];
  if (exact) return exact;
  return t
    .split(" ")
    .map((w) => {
      const lower = w.toLowerCase();
      if (AWS_FRAGMENT_TOKEN[lower]) return AWS_FRAGMENT_TOKEN[lower];
      if (/^[A-Z]{2,}$/.test(w) && w.length <= 6) return w;
      return w;
    })
    .join(" ");
}

function polishCloudTitleToken(word: string): string {
  const lower = word.toLowerCase();
  if (CLOUD_WORD_POLISH[lower]) return CLOUD_WORD_POLISH[lower];
  if (/^[A-Z]{2,}$/.test(word) && word.length <= 8) return word;
  return word;
}

function polishGcpAzureTitleMiddle(middle: string): string {
  return middle.trim().replace(/\s+/g, " ").split(" ").map(polishCloudTitleToken).join(" ");
}

/**
 * Full dashboard title fragment (between cloud prefix and em dash), polished — used for Setup
 * group headings so names stay unambiguous (e.g. "Cloud Map" not "Cloud", "Augmented AI" not "Augmented").
 */
export function polishDashboardFragmentForGrouping(fragment: string, cloudId: CloudId): string {
  const t = fragment.trim().replace(/\s+/g, " ");
  if (!t) return "Other";
  if (cloudId === "aws") return polishAwsTitleMiddle(t);
  if (cloudId === "gcp" || cloudId === "azure") return polishGcpAzureTitleMiddle(t);
  return t;
}

/**
 * Normalizes the first word of a dashboard title fragment (e.g. GCP "Gke" and "GKE" → "GKE").
 * Prefer {@link polishDashboardFragmentForGrouping} for Setup dashboard section headings.
 */
export function polishDashboardGroupKeyFirstWord(firstWord: string, cloudId: CloudId): string {
  const w = firstWord.trim();
  if (!w || w === "Other") return w || "Other";
  const lower = w.toLowerCase();
  if (cloudId === "aws") {
    if (AWS_FRAGMENT_TOKEN[lower]) return AWS_FRAGMENT_TOKEN[lower];
    return w;
  }
  if (cloudId === "gcp" || cloudId === "azure") {
    if (CLOUD_WORD_POLISH[lower]) return CLOUD_WORD_POLISH[lower];
    return w;
  }
  return w;
}

/** @deprecated Prefer polishDashboardGroupKeyFirstWord(w, "aws") */
export function polishAwsDashboardGroupHeading(firstWord: string): string {
  return polishDashboardGroupKeyFirstWord(firstWord, "aws");
}

/**
 * Human-friendly dashboard title for Setup checkboxes (vendor product casing).
 */
export function polishSetupDashboardTitle(title: string, cloudId: CloudId): string {
  const t = title.trim();
  if (cloudId === "aws") {
    const re = /^(AWS|Amazon)\s+(.+?)\s+([\u2014\u2013-])/u;
    const m = t.match(re);
    if (!m) return title;
    const polished = polishAwsTitleMiddle(m[2]);
    return `${m[1]} ${polished} ${m[3]}${t.slice(m[0].length)}`;
  }
  if (cloudId === "gcp") {
    const m = t.match(/^GCP\s+(.+?)\s+([\u2014\u2013-])/u);
    if (!m) return title;
    const polished = polishGcpAzureTitleMiddle(m[1]);
    return `GCP ${polished} ${m[2]}${t.slice(m[0].length)}`;
  }
  if (cloudId === "azure") {
    const m = t.match(/^Azure\s+(.+?)\s+([\u2014\u2013-])/u);
    if (!m) return title;
    const polished = polishGcpAzureTitleMiddle(m[1]);
    return `Azure ${polished} ${m[2]}${t.slice(m[0].length)}`;
  }
  return title;
}

const CATEGORY_ACRONYMS: Record<string, string> = {
  ml: "ML",
  ai: "AI",
  aiml: "AIML",
  apm: "APM",
  siem: "SIEM",
  iot: "IoT",
  aws: "AWS",
  gcp: "GCP",
  api: "API",
  sql: "SQL",
  vpc: "VPC",
  eks: "EKS",
  ecs: "ECS",
  rds: "RDS",
  kms: "KMS",
};

/** Whole slugs that are not hyphenated but should read as multiple words (e.g. GCP pipeline groups). */
const CATEGORY_FULL_LABEL_OVERRIDES: Record<string, string> = {
  datawarehouse: "Data Warehouse",

  // AWS services — official product names
  lambda: "AWS Lambda",
  apigateway: "Amazon API Gateway",
  appsync: "AWS AppSync",
  apprunner: "AWS App Runner",
  fargate: "AWS Fargate",
  ec2: "Amazon EC2",
  ecs: "Amazon ECS",
  eks: "Amazon EKS",
  batch: "AWS Batch",
  elasticbeanstalk: "AWS Elastic Beanstalk",
  ecr: "Amazon ECR",
  autoscaling: "Amazon EC2 Auto Scaling",
  imagebuilder: "EC2 Image Builder",
  outposts: "AWS Outposts",
  wavelength: "AWS Wavelength",
  mainframemodernization: "AWS Mainframe Modernization",
  parallelcomputing: "AWS Parallel Computing Service",
  evs: "Amazon Elastic VMware Service",
  simspaceweaver: "AWS SimSpace Weaver",

  // Networking
  elb: "Elastic Load Balancing",
  cloudfront: "Amazon CloudFront",
  waf: "AWS WAF",
  route53: "Amazon Route 53",
  networkfirewall: "AWS Network Firewall",
  shield: "AWS Shield",
  globalaccelerator: "AWS Global Accelerator",
  transitgateway: "AWS Transit Gateway",
  directconnect: "AWS Direct Connect",
  vpn: "AWS Site-to-Site VPN",
  privatelink: "AWS PrivateLink",
  networkmanager: "AWS Network Manager",
  natgateway: "NAT Gateway",
  vpc: "Amazon VPC",
  vpclattice: "Amazon VPC Lattice",
  appmesh: "AWS App Mesh",
  clientvpn: "AWS Client VPN",
  cloudmap: "AWS Cloud Map",
  vpcipam: "Amazon VPC IPAM",
  private5g: "AWS Private 5G",

  // Security
  guardduty: "Amazon GuardDuty",
  securityhub: "AWS Security Hub",
  macie: "Amazon Macie",
  inspector: "Amazon Inspector",
  config: "AWS Config",
  accessanalyzer: "AWS IAM Access Analyzer",
  cognito: "Amazon Cognito",
  kms: "AWS KMS",
  secretsmanager: "AWS Secrets Manager",
  acm: "AWS Certificate Manager",
  identitycenter: "AWS IAM Identity Center",
  detective: "Amazon Detective",
  cloudtrail: "AWS CloudTrail",
  verifiedaccess: "AWS Verified Access",
  securitylake: "Amazon Security Lake",
  securityir: "AWS Security Incident Response",
  cloudhsm: "AWS CloudHSM",
  auditmanager: "AWS Audit Manager",
  verifiedpermissions: "Amazon Verified Permissions",
  paymentcryptography: "AWS Payment Cryptography",
  artifact: "AWS Artifact",
  networkaccessanalyzer: "VPC Network Access Analyzer",
  incidentmanager: "AWS Systems Manager Incident Manager",

  // Storage
  s3: "Amazon S3",
  storagelens: "Amazon S3 Storage Lens",
  s3intelligenttier: "S3 Intelligent-Tiering",
  s3batchops: "S3 Batch Operations",
  ebs: "Amazon EBS",
  efs: "Amazon EFS",
  fsx: "Amazon FSx",
  datasync: "AWS DataSync",
  backup: "AWS Backup",
  storagegateway: "AWS Storage Gateway",

  // Databases
  dynamodb: "Amazon DynamoDB",
  elasticache: "Amazon ElastiCache",
  redshift: "Amazon Redshift",
  opensearch: "Amazon OpenSearch Service",
  docdb: "Amazon DocumentDB",
  aurora: "Amazon Aurora",
  neptune: "Amazon Neptune",
  timestream: "Amazon Timestream",
  qldb: "Amazon QLDB",
  dax: "Amazon DynamoDB Accelerator (DAX)",
  keyspaces: "Amazon Keyspaces",
  memorydb: "Amazon MemoryDB",
  rds: "Amazon RDS",

  // Streaming & Messaging
  kinesis: "Amazon Kinesis Data Streams",
  firehose: "Amazon Data Firehose",
  msk: "Amazon MSK",
  sqs: "Amazon SQS",
  sns: "Amazon SNS",
  amazonmq: "Amazon MQ",
  eventbridge: "Amazon EventBridge",
  stepfunctions: "AWS Step Functions",
  kinesisanalytics: "Amazon Kinesis Data Analytics",
  endusermessaging: "AWS End User Messaging",

  // Analytics
  emr: "Amazon EMR",
  glue: "AWS Glue",
  athena: "Amazon Athena",
  lakeformation: "AWS Lake Formation",
  quicksight: "Amazon QuickSight",
  databrew: "AWS Glue DataBrew",
  appflow: "Amazon AppFlow",
  mwaa: "Amazon MWAA",
  "data-pipeline": "Data & Analytics Pipeline",
  cleanrooms: "AWS Clean Rooms",
  datazone: "Amazon DataZone",
  entityresolution: "AWS Entity Resolution",
  dataexchange: "AWS Data Exchange",
  appfabric: "AWS AppFabric",
  b2bi: "AWS B2B Data Interchange",

  // AI & ML
  sagemaker: "Amazon SageMaker",
  bedrock: "Amazon Bedrock",
  bedrockagent: "Amazon Bedrock Agents",
  bedrockdataautomation: "Amazon Bedrock Data Automation",
  rekognition: "Amazon Rekognition",
  textract: "Amazon Textract",
  comprehend: "Amazon Comprehend",
  comprehendmedical: "Amazon Comprehend Medical",
  translate: "Amazon Translate",
  transcribe: "Amazon Transcribe",
  polly: "Amazon Polly",
  forecast: "Amazon Forecast",
  personalize: "Amazon Personalize",
  lex: "Amazon Lex",
  lookoutmetrics: "Amazon Lookout for Metrics",
  qbusiness: "Amazon Q Business",
  kendra: "Amazon Kendra",
  a2i: "Amazon Augmented AI (A2I)",
  healthlake: "Amazon HealthLake",
  nova: "Amazon Nova",
  lookoutvision: "Amazon Lookout for Vision",
  healthomics: "Amazon HealthOmics",
  lookoutequipment: "Amazon Lookout for Equipment",
  monitron: "Amazon Monitron",

  // DevTools
  cicd: "AWS CI/CD",
  "ci/cd": "AWS CI/CD",
  codebuild: "AWS CodeBuild",
  codepipeline: "AWS CodePipeline",
  codedeploy: "AWS CodeDeploy",
  codecommit: "AWS CodeCommit",
  codeartifact: "AWS CodeArtifact",
  amplify: "AWS Amplify",
  xray: "AWS X-Ray",
  codeguru: "Amazon CodeGuru",
  codecatalyst: "Amazon CodeCatalyst",
  devicefarm: "AWS Device Farm",
  proton: "AWS Proton",
  qdeveloper: "Amazon Q Developer",
  cloudshell: "AWS CloudShell",
  cloud9: "AWS Cloud9",
  robomaker: "AWS RoboMaker",

  // IoT
  iotcore: "AWS IoT Core",
  greengrass: "AWS IoT Greengrass",
  iotanalytics: "AWS IoT Analytics",
  iotevents: "AWS IoT Events",
  iotsitewise: "AWS IoT SiteWise",
  iotdefender: "AWS IoT Device Defender",
  iottwinmaker: "AWS IoT TwinMaker",
  iotfleetwise: "AWS IoT FleetWise",
  groundstation: "AWS Ground Station",
  kinesisvideo: "Amazon Kinesis Video Streams",
  panorama: "AWS Panorama",
  freertos: "FreeRTOS",

  // Management & Governance
  cloudformation: "AWS CloudFormation",
  ssm: "AWS Systems Manager",
  cloudwatch: "Amazon CloudWatch",
  health: "AWS Health",
  trustedadvisor: "AWS Trusted Advisor",
  controltower: "AWS Control Tower",
  organizations: "AWS Organizations",
  servicecatalog: "AWS Service Catalog",
  servicequotas: "AWS Service Quotas",
  computeoptimizer: "AWS Compute Optimizer",
  budgets: "AWS Budgets",
  billing: "AWS Billing",
  dms: "AWS Database Migration Service",
  fis: "AWS Fault Injection Service",
  managedgrafana: "Amazon Managed Grafana",
  supplychain: "AWS Supply Chain",
  arc: "Amazon Application Recovery Controller",
  appconfig: "AWS AppConfig",
  drs: "AWS Elastic Disaster Recovery",
  licensemanager: "AWS License Manager",
  chatbot: "AWS Chatbot",
  cloudwatchrum: "Amazon CloudWatch RUM",
  ram: "AWS Resource Access Manager",
  resiliencehub: "AWS Resilience Hub",
  migrationhub: "AWS Migration Hub",

  // End User & Media
  mediaconvert: "AWS Elemental MediaConvert",
  medialive: "AWS Elemental MediaLive",
  workspaces: "Amazon WorkSpaces",
  connect: "Amazon Connect",
  appstream: "Amazon AppStream 2.0",
  deadlinecloud: "AWS Deadline Cloud",
  chimesdkvoice: "Amazon Chime SDK",
  workmail: "Amazon WorkMail",
  wickr: "AWS Wickr",
  ses: "Amazon SES",
  pinpoint: "Amazon Pinpoint",
  transferfamily: "AWS Transfer Family",
  lightsail: "Amazon Lightsail",
  frauddetector: "Amazon Fraud Detector",
  gamelift: "Amazon GameLift",
  locationservice: "Amazon Location Service",
  managedblockchain: "Amazon Managed Blockchain",
  devopsguru: "Amazon DevOps Guru",

  // Shared keys that differ per cloud — prefixed entries win over bare entries
  "aws:batch": "AWS Batch",
  "azure:batch": "Azure Batch",
  "gcp:batch": "Google Cloud Batch",
  "aws:backup": "AWS Backup",
  "azure:backup": "Azure Backup",
  "gcp:backup-dr": "Backup and DR",
  "aws:billing": "AWS Billing",
  "gcp:billing": "Cloud Billing",
  "gcp:iotcore": "Cloud IoT Core",
  "gcp:cloudshell": "Cloud Shell",

  // ── Azure services ──────────────────────────────────────────────────────
  "virtual-machines": "Azure Virtual Machines",
  "vm-scale-sets": "Azure VM Scale Sets",
  "dedicated-host": "Azure Dedicated Host",
  "proximity-placement": "Azure Proximity Placement Groups",
  "confidential-vm": "Azure Confidential VMs",
  "compute-gallery": "Azure Compute Gallery",
  aks: "Azure Kubernetes Service (AKS)",
  "container-apps": "Azure Container Apps",
  "container-instances": "Azure Container Instances",
  "kubernetes-fleet": "Azure Kubernetes Fleet Manager",
  acr: "Azure Container Registry (ACR)",
  "app-service": "Azure App Service",
  functions: "Azure Functions",
  "static-web-apps": "Azure Static Web Apps",
  "spring-apps": "Azure Spring Apps",
  "virtual-network": "Azure Virtual Network",
  "network-security-groups": "Azure Network Security Groups",
  "load-balancer": "Azure Load Balancer",
  "application-gateway": "Azure Application Gateway",
  "front-door": "Azure Front Door",
  cdn: "Azure CDN",
  "expressroute-circuit": "Azure ExpressRoute Circuit",
  "expressroute-gateway": "Azure ExpressRoute Gateway",
  "vpn-gateway": "Azure VPN Gateway",
  "vpn-client": "Azure VPN Client",
  "private-dns": "Azure Private DNS",
  "traffic-manager": "Azure Traffic Manager",
  "azure-firewall": "Azure Firewall",
  "firewall-policy": "Azure Firewall Policy",
  "ddos-protection": "Azure DDoS Protection",
  bastion: "Azure Bastion",
  "waf-policy": "Azure Web Application Firewall",
  "virtual-wan": "Azure Virtual WAN",
  "route-server": "Azure Route Server",
  "network-watcher": "Azure Network Watcher",
  "blob-storage": "Azure Blob Storage",
  "file-storage": "Azure Files",
  "queue-storage": "Azure Queue Storage",
  "table-storage": "Azure Table Storage",
  "data-lake-storage": "Azure Data Lake Storage",
  "storage-sync": "Azure File Sync",
  "netapp-files": "Azure NetApp Files",
  "hpc-cache": "Azure HPC Cache",
  "data-box": "Azure Data Box",
  "sql-database": "Azure SQL Database",
  "sql-managed-instance": "Azure SQL Managed Instance",
  "cosmos-db": "Azure Cosmos DB",
  "cache-for-redis": "Azure Cache for Redis",
  "database-for-postgresql": "Azure Database for PostgreSQL",
  "database-for-mysql": "Azure Database for MySQL",
  "database-for-mariadb": "Azure Database for MariaDB",
  "synapse-workspace": "Azure Synapse Analytics",
  databricks: "Azure Databricks",
  purview: "Microsoft Purview",
  "data-factory": "Azure Data Factory",
  "stream-analytics": "Azure Stream Analytics",
  "event-hubs": "Azure Event Hubs",
  "digital-twins": "Azure Digital Twins",
  hdinsight: "Azure HDInsight",
  "analysis-services": "Azure Analysis Services",
  "power-bi-embedded": "Power BI Embedded",
  "microsoft-fabric": "Microsoft Fabric",
  "cognitive-services": "Azure Cognitive Services",
  openai: "Azure OpenAI Service",
  "machine-learning": "Azure Machine Learning",
  "ai-search": "Azure AI Search",
  "bot-service": "Azure Bot Service",
  vision: "Azure Computer Vision",
  speech: "Azure Speech Services",
  translator: "Azure Translator",
  "document-intelligence": "Azure AI Document Intelligence",
  "entra-id": "Microsoft Entra ID",
  m365: "Microsoft 365",
  "key-vault": "Azure Key Vault",
  "managed-identity": "Azure Managed Identity",
  "defender-for-cloud": "Microsoft Defender for Cloud",
  sentinel: "Microsoft Sentinel",
  attestation: "Azure Attestation",
  "confidential-ledger": "Azure Confidential Ledger",
  "active-users-services": "Microsoft 365 Active Users",
  "teams-user-activity": "Microsoft Teams User Activity",
  "outlook-activity": "Outlook Activity",
  "onedrive-usage-storage": "OneDrive Usage & Storage",
  "service-bus": "Azure Service Bus",
  "event-grid": "Azure Event Grid",
  "logic-apps": "Azure Logic Apps",
  "api-management": "Azure API Management",
  "api-center": "Azure API Center",
  relay: "Azure Relay",
  "iot-hub": "Azure IoT Hub",
  "iot-central": "Azure IoT Central",
  "device-provisioning": "Azure IoT Hub Device Provisioning Service",
  "time-series-insights": "Azure Time Series Insights",
  "media-services": "Azure Media Services",
  "communication-services": "Azure Communication Services",
  signalr: "Azure SignalR Service",
  "notification-hubs": "Azure Notification Hubs",
  monitor: "Azure Monitor",
  "activity-log": "Azure Activity Log",
  policy: "Azure Policy",
  advisor: "Azure Advisor",
  "cost-management": "Azure Cost Management",
  "resource-graph": "Azure Resource Graph",
  blueprints: "Azure Blueprints",
  "automation-account": "Azure Automation",
  "app-configuration": "Azure App Configuration",
  "deployment-environments": "Azure Deployment Environments",
  maps: "Azure Maps",
  "site-recovery": "Azure Site Recovery",
  migrate: "Azure Migrate",
  devcenter: "Azure Dev Center",
  "lab-services": "Azure Lab Services",
  "load-testing": "Azure Load Testing",
  pipeline: "Azure Pipelines",
  stack: "Azure Stack",
  "oracle-on-azure": "Oracle on Azure",
  "sap-on-azure": "SAP on Azure",
  "vmware-solution": "Azure VMware Solution",
  "capacity-reservation": "Azure Capacity Reservation",

  // ── GCP services ────────────────────────────────────────────────────────
  "cloud-functions": "Cloud Functions",
  "cloud-run": "Cloud Run",
  "app-engine": "App Engine",
  "cloud-tasks": "Cloud Tasks",
  "cloud-scheduler": "Cloud Scheduler",
  workflows: "Workflows",
  eventarc: "Eventarc",
  "cloud-run-jobs": "Cloud Run Jobs",
  "serverless-vpc-access": "Serverless VPC Access",
  "compute-engine": "Compute Engine",
  "vmware-engine": "Google Cloud VMware Engine",
  "bare-metal": "Bare Metal Solution",
  "cloud-tpu": "Cloud TPU",
  "cloud-workstations": "Cloud Workstations",
  gke: "Google Kubernetes Engine (GKE)",
  anthos: "Anthos",
  "artifact-registry": "Artifact Registry",
  "container-registry": "Container Registry",
  "gke-autopilot": "GKE Autopilot",
  "anthos-service-mesh": "Anthos Service Mesh",
  "anthos-config-mgmt": "Anthos Config Management",
  "gke-enterprise": "GKE Enterprise",
  "migrate-to-containers": "Migrate to Containers",
  "vpc-flow": "VPC Flow Logs",
  "cloud-lb": "Cloud Load Balancing",
  "cloud-cdn": "Cloud CDN",
  "cloud-dns": "Cloud DNS",
  "cloud-armor": "Cloud Armor",
  "cloud-nat": "Cloud NAT",
  "cloud-vpn": "Cloud VPN",
  "cloud-interconnect": "Cloud Interconnect",
  "cloud-router": "Cloud Router",
  "traffic-director": "Traffic Director",
  "private-service-connect": "Private Service Connect",
  "network-connectivity-center": "Network Connectivity Center",
  "network-intelligence-center": "Network Intelligence Center",
  "cloud-ids": "Cloud IDS",
  "cloud-domains": "Cloud Domains",
  "media-cdn": "Media CDN",
  "security-command-center": "Security Command Center",
  iam: "Cloud IAM",
  "secret-manager": "Secret Manager",
  "cloud-kms": "Cloud KMS",
  "certificate-authority": "Certificate Authority Service",
  beyondcorp: "BeyondCorp Enterprise",
  "binary-authorization": "Binary Authorization",
  "access-context-manager": "Access Context Manager",
  "assured-workloads": "Assured Workloads",
  "recaptcha-enterprise": "reCAPTCHA Enterprise",
  "web-security-scanner": "Web Security Scanner",
  "identity-aware-proxy": "Identity-Aware Proxy",
  dlp: "Cloud DLP",
  "web-risk": "Web Risk",
  "cloud-identity": "Cloud Identity",
  "managed-ad": "Managed AD",
  "security-operations": "Security Operations",
  "cloud-storage": "Cloud Storage",
  "persistent-disk": "Persistent Disk",
  filestore: "Filestore",
  "backup-dr": "Backup and DR",
  "cloud-sql": "Cloud SQL",
  "cloud-spanner": "Cloud Spanner",
  firestore: "Firestore",
  bigtable: "Cloud Bigtable",
  alloydb: "AlloyDB",
  memorystore: "Memorystore",
  "database-migration": "Database Migration Service",
  bigquery: "BigQuery",
  dataproc: "Dataproc",
  "data-fusion": "Cloud Data Fusion",
  composer: "Cloud Composer",
  looker: "Looker",
  dataplex: "Dataplex",
  "data-catalog": "Data Catalog",
  "analytics-hub": "Analytics Hub",
  dataprep: "Dataprep",
  datastream: "Datastream",
  pubsub: "Pub/Sub",
  dataflow: "Dataflow",
  "pubsub-lite": "Pub/Sub Lite",
  "vertex-ai": "Vertex AI",
  gemini: "Gemini",
  "vision-ai": "Vision AI",
  "natural-language": "Cloud Natural Language",
  translation: "Cloud Translation",
  "speech-to-text": "Speech-to-Text",
  "text-to-speech": "Text-to-Speech",
  dialogflow: "Dialogflow",
  "document-ai": "Document AI",
  "recommendations-ai": "Recommendations AI",
  automl: "AutoML",
  "vertex-ai-workbench": "Vertex AI Workbench",
  "vertex-ai-pipelines": "Vertex AI Pipelines",
  "vertex-ai-feature-store": "Vertex AI Feature Store",
  "vertex-ai-matching-engine": "Vertex AI Matching Engine",
  "vertex-ai-tensorboard": "Vertex AI Tensorboard",
  "contact-center-ai": "Contact Center AI",
  "healthcare-api": "Healthcare API",
  "retail-api": "Retail API",
  "cloud-build": "Cloud Build",
  "cloud-deploy": "Cloud Deploy",
  firebase: "Firebase",
  "cloud-endpoints": "Cloud Endpoints",
  apigee: "Apigee",
  "cloud-shell": "Cloud Shell",
  "api-gateway": "API Gateway",
  "cloud-monitoring": "Cloud Monitoring",
  "cloud-logging": "Cloud Logging",
  "resource-manager": "Resource Manager",
  "deployment-manager": "Deployment Manager",
  "cloud-asset-inventory": "Cloud Asset Inventory",
  "org-policy": "Organization Policy",
  "service-directory": "Service Directory",
  "cloud-audit-logs": "Cloud Audit Logs",
  "active-assist": "Active Assist",
  "essential-contacts": "Essential Contacts",
  "error-reporting": "Error Reporting",
  "iot-core": "Cloud IoT Core",
  transcoder: "Transcoder API",
  "video-intelligence": "Video Intelligence",
  "application-integration": "Application Integration",

  // GCP services derived from pipeline dataset slugs
  "access-transparency": "Access Transparency",
  "bms-oracle": "Bare Metal Solution for Oracle",
  "carbon-footprint": "Carbon Footprint",
  "cloud-trace": "Cloud Trace",
  "config-connector": "Config Connector",
  "livestream-api": "Live Stream API",
  "migrate-vms": "Migrate for Compute Engine",
  "network-service-tiers": "Network Service Tiers",
  "os-login": "OS Login",
  "packet-mirroring": "Packet Mirroring",
  "cloud-profiler": "Cloud Profiler",
  "shielded-vms": "Shielded VMs",
  "source-repositories": "Cloud Source Repositories",
  "storage-transfer": "Storage Transfer Service",
  "resource-tags": "Resource Tags",
  "vertex-ai-search": "Vertex AI Search",
  "vpc-service-controls": "VPC Service Controls",
};

/**
 * Pipeline / ML file group ids like `compute-extended`, `aws-ml-data-ml-operations` → readable labels.
 * When `cloudId` is provided, cloud-prefixed entries (e.g. `azure:batch`) take priority.
 */
export function polishSetupCategoryLabel(category: string, cloudId?: CloudId): string {
  const s = category.trim();
  if (!s) return s;
  const lower = s.toLowerCase();
  if (cloudId) {
    const prefixed = CATEGORY_FULL_LABEL_OVERRIDES[`${cloudId}:${lower}`];
    if (prefixed) return prefixed;
  }
  const full = CATEGORY_FULL_LABEL_OVERRIDES[lower];
  if (full) return full;
  return s
    .split("-")
    .map((part) => {
      const partLower = part.toLowerCase();
      if (CATEGORY_ACRONYMS[partLower]) return CATEGORY_ACRONYMS[partLower];
      if (/^v\d+(\.\d+)?$/i.test(part)) return part.toUpperCase();
      if (part.length <= 1) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}
