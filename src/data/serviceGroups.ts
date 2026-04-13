export interface ServiceItem {
  id: string;
  label: string;
  icon: string;
  desc: string;
  /** When set, shown indented under its parent row; data generators stay keyed by child id */
  children?: ServiceItem[];
}
export interface ServiceGroup {
  id: string;
  label: string;
  color: string;
  icon: string;
  services: ServiceItem[];
}

const SERVICE_GROUPS: ServiceGroup[] = [
  {
    id: "serverless",
    label: "Serverless & Core",
    color: "#FF9900",
    icon: "λ",
    services: [
      { id: "lambda", label: "Lambda", icon: "λ", desc: "Function execution logs" },
      { id: "apigateway", label: "API Gateway", icon: "⇌", desc: "HTTP access logs" },
      { id: "cloudtrail", label: "CloudTrail", icon: "☁", desc: "API audit events" },
      { id: "ecs", label: "ECS", icon: "▣", desc: "Container task logs" },
    ],
  },
  {
    id: "compute",
    label: "Compute & Containers",
    color: "#F04E98",
    icon: "□",
    services: [
      { id: "ec2", label: "EC2", icon: "□", desc: "System & auth logs" },
      {
        id: "outposts",
        label: "Outposts",
        icon: "⊟",
        desc: "Hybrid cloud capacity & instance logs",
      },
      { id: "wavelength", label: "Wavelength", icon: "≋", desc: "5G edge compute logs" },
      { id: "eks", label: "EKS", icon: "☸", desc: "Kubernetes pod/node logs" },
      { id: "fargate", label: "Fargate", icon: "▷", desc: "Serverless container logs" },
      { id: "ecr", label: "ECR", icon: "◫", desc: "Container image & scan logs" },
      { id: "apprunner", label: "App Runner", icon: "▷", desc: "Container web app logs" },
      { id: "batch", label: "Batch", icon: "≡", desc: "Job queue & execution" },
      { id: "elasticbeanstalk", label: "Beanstalk", icon: "⊕", desc: "App deployment logs" },
      { id: "autoscaling", label: "Auto Scaling", icon: "⤢", desc: "Scale in/out events" },
      { id: "imagebuilder", label: "Image Builder", icon: "⊙", desc: "AMI pipeline logs" },
      {
        id: "mainframemodernization",
        label: "Mainframe Modernization",
        icon: "▦",
        desc: "Batch job & online transaction logs",
      },
      {
        id: "parallelcomputing",
        label: "Parallel Computing",
        icon: "⊞",
        desc: "HPC cluster job queue events",
      },
      {
        id: "evs",
        label: "Elastic VMware Service",
        icon: "▣",
        desc: "ESXi host & vSAN operation logs",
      },
      {
        id: "simspaceweaver",
        label: "SimSpace Weaver",
        icon: "⊙",
        desc: "Spatial simulation partition logs",
      },
    ],
  },
  {
    id: "networking",
    label: "Networking & CDN",
    color: "#1BA9F5",
    icon: "⇆",
    services: [
      { id: "alb", label: "ALB", icon: "⚖", desc: "Load balancer access logs" },
      { id: "vpc", label: "VPC Flow", icon: "⟳", desc: "Network flow records" },
      { id: "nlb", label: "NLB", icon: "⚡", desc: "TCP/TLS load balancer logs" },
      { id: "cloudfront", label: "CloudFront", icon: "◌", desc: "CDN access & cache logs" },
      { id: "waf", label: "WAF", icon: "◈", desc: "Web ACL block/allow events" },
      { id: "route53", label: "Route 53", icon: "◉", desc: "DNS query logs" },
      { id: "networkfirewall", label: "Network FW", icon: "⊘", desc: "Firewall flow logs" },
      { id: "shield", label: "Shield", icon: "⬡", desc: "DDoS detection events" },
      {
        id: "globalaccelerator",
        label: "Global Accelerator",
        icon: "⊛",
        desc: "Anycast routing logs",
      },
      { id: "transitgateway", label: "Transit Gateway", icon: "⟺", desc: "Cross-VPC routing logs" },
      { id: "directconnect", label: "Direct Connect", icon: "⌁", desc: "Dedicated circuit logs" },
      { id: "vpn", label: "Site-to-Site VPN", icon: "⊔", desc: "IPSec tunnel logs" },
      { id: "privatelink", label: "PrivateLink", icon: "⊗", desc: "VPC endpoint logs" },
      {
        id: "natgateway",
        label: "NAT Gateway",
        icon: "⇄",
        desc: "NAT traffic & connection metrics",
      },
      {
        id: "vpclattice",
        label: "VPC Lattice",
        icon: "⟺",
        desc: "Service-to-service networking logs",
      },
      { id: "appmesh", label: "App Mesh", icon: "⊛", desc: "Service mesh Envoy proxy logs" },
      { id: "clientvpn", label: "Client VPN", icon: "⊔", desc: "VPN connection & auth logs" },
      { id: "cloudmap", label: "Cloud Map", icon: "◎", desc: "Service discovery events" },
      {
        id: "vpcipam",
        label: "VPC IPAM",
        icon: "⊘",
        desc: "IP address pool allocation & CIDR events",
      },
      {
        id: "private5g",
        label: "Private 5G",
        icon: "≋",
        desc: "Radio unit status & device activation",
      },
    ],
  },
  {
    id: "security",
    label: "Security & Compliance",
    color: "#00BFB3",
    icon: "⚿",
    services: [
      { id: "guardduty", label: "GuardDuty", icon: "⚠", desc: "Threat detection findings" },
      { id: "securityhub", label: "Security Hub", icon: "◈", desc: "Aggregated security findings" },
      { id: "macie", label: "Macie", icon: "⊛", desc: "S3 sensitive data findings" },
      { id: "inspector", label: "Inspector", icon: "◎", desc: "Vulnerability findings" },
      { id: "config", label: "Config", icon: "⚙", desc: "Resource compliance events" },
      {
        id: "accessanalyzer",
        label: "Access Analyzer",
        icon: "⊕",
        desc: "IAM access path findings",
      },
      { id: "cognito", label: "Cognito", icon: "◯", desc: "User auth & sign-in events" },
      { id: "kms", label: "KMS", icon: "🔑", desc: "Key usage & rotation logs" },
      {
        id: "secretsmanager",
        label: "Secrets Manager",
        icon: "⊚",
        desc: "Secret access & rotation",
      },
      { id: "acm", label: "ACM", icon: "⊠", desc: "Certificate lifecycle logs" },
      {
        id: "identitycenter",
        label: "IAM Identity Center",
        icon: "⊞",
        desc: "SSO auth & provisioning",
      },
      { id: "detective", label: "Detective", icon: "⊙", desc: "Behavioral analysis findings" },
      {
        id: "verifiedaccess",
        label: "Verified Access",
        icon: "⊜",
        desc: "Zero-trust access audit logs",
      },
      {
        id: "securitylake",
        label: "Security Lake",
        icon: "◉",
        desc: "OCSF 1.1.0 unified security logs",
      },
      {
        id: "securityir",
        label: "Security IR",
        icon: "⚠",
        desc: "Security incident response cases",
      },
      { id: "cloudhsm", label: "CloudHSM", icon: "⊚", desc: "Hardware security module logs" },
      {
        id: "auditmanager",
        label: "Audit Manager",
        icon: "◈",
        desc: "Compliance assessment evidence logs",
      },
      {
        id: "verifiedpermissions",
        label: "Verified Permissions",
        icon: "⊞",
        desc: "Cedar policy authorisation decisions",
      },
      {
        id: "paymentcryptography",
        label: "Payment Cryptography",
        icon: "⊕",
        desc: "PIN/MAC/CVV cryptographic operation logs",
      },
      { id: "artifact", label: "Artifact", icon: "⊙", desc: "Compliance report access audit logs" },
      {
        id: "networkaccessanalyzer",
        label: "Network Access Analyzer",
        icon: "⊘",
        desc: "Reachability path & finding analysis",
      },
      {
        id: "incidentmanager",
        label: "Incident Manager",
        icon: "⚠",
        desc: "Incident response plan & runbook events",
      },
    ],
  },
  {
    id: "findings",
    label: "Security Findings & Attack Patterns",
    color: "#DC2626",
    icon: "⚡",
    services: [
      {
        id: "security-chain",
        label: "GD → SecHub → Lake",
        icon: "⛓",
        desc: "Linked GuardDuty → Security Hub → Security Lake finding chain",
      },
      {
        id: "cspm",
        label: "CSPM",
        icon: "◎",
        desc: "Elastic CSPM — CIS AWS 1.5 posture findings (cloud_security_posture.findings)",
      },
      {
        id: "kspm",
        label: "KSPM",
        icon: "☸",
        desc: "Elastic KSPM — CIS EKS 1.4 Kubernetes posture findings",
      },
      {
        id: "iam-privesc-chain",
        label: "IAM PrivEsc Chain",
        icon: "⚡",
        desc: "Attack chain: IAM enumeration → credential creation → policy escalation → AssumeRole",
      },
      {
        id: "data-exfil-chain",
        label: "Data Exfil Chain",
        icon: "◂",
        desc: "Attack chain: GuardDuty S3 detection → CloudTrail GetObject burst → VPC Flow high egress",
      },
    ],
  },
  {
    id: "storage",
    label: "Storage & Databases",
    color: "#93C90E",
    icon: "⊞",
    services: [
      { id: "s3", label: "S3", icon: "○", desc: "Object access logs" },
      {
        id: "storagelens",
        label: "S3 Storage Lens",
        icon: "◎",
        desc: "Storage analytics & metrics",
      },
      { id: "rds", label: "RDS", icon: "⊞", desc: "Database query logs" },
      { id: "efs", label: "EFS", icon: "◫", desc: "NFS throughput & I/O logs" },
      { id: "fsx", label: "FSx", icon: "⊟", desc: "File system ops & backups" },
      { id: "ebs", label: "EBS", icon: "◫", desc: "Volume perf, state & snapshots" },
      { id: "backup", label: "AWS Backup", icon: "⊙", desc: "Backup job status logs" },
      { id: "datasync", label: "DataSync", icon: "⟺", desc: "Data transfer task logs" },
      { id: "storagegateway", label: "Storage Gateway", icon: "⊔", desc: "Hybrid storage logs" },
      { id: "dynamodb", label: "DynamoDB", icon: "⟐", desc: "NoSQL operation logs" },
      { id: "aurora", label: "Aurora", icon: "✦", desc: "Cluster failover & perf" },
      { id: "elasticache", label: "ElastiCache", icon: "⚡", desc: "Redis command logs" },
      { id: "memorydb", label: "MemoryDB", icon: "⚡", desc: "Durable Redis logs" },
      { id: "redshift", label: "Redshift", icon: "◇", desc: "Data warehouse query logs" },
      { id: "opensearch", label: "OpenSearch", icon: "◎", desc: "Search & index logs" },
      { id: "docdb", label: "DocumentDB", icon: "⊙", desc: "MongoDB-compat query logs" },
      { id: "neptune", label: "Neptune", icon: "⬡", desc: "Graph DB query logs" },
      { id: "timestream", label: "Timestream", icon: "⌚", desc: "Time-series write & query" },
      { id: "qldb", label: "QLDB", icon: "◈", desc: "Ledger transaction logs" },
      {
        id: "dax",
        label: "DynamoDB DAX",
        icon: "⟳",
        desc: "DynamoDB Accelerator cache hit/miss logs",
      },
      { id: "keyspaces", label: "Keyspaces", icon: "⊕", desc: "Cassandra-compat logs" },
      {
        id: "neptuneanalytics",
        label: "Neptune Analytics",
        icon: "⬡",
        desc: "Graph algorithm run logs",
      },
      {
        id: "auroradsql",
        label: "Aurora DSQL",
        icon: "⬡",
        desc: "Distributed SQL transaction events",
      },
    ],
  },
  {
    id: "streaming",
    label: "Streaming & Messaging",
    color: "#FEC514",
    icon: "⟿",
    services: [
      { id: "kinesis", label: "Kinesis Streams", icon: "〜", desc: "Data stream ingestion" },
      { id: "firehose", label: "Firehose", icon: "⤳", desc: "Delivery stream logs" },
      {
        id: "kinesisanalytics",
        label: "Kinesis Analytics",
        icon: "⟿",
        desc: "Real-time analytics logs",
      },
      { id: "msk", label: "MSK (Kafka)", icon: "⊕", desc: "Kafka broker logs" },
      { id: "sqs", label: "SQS", icon: "☰", desc: "Queue & DLQ events" },
      { id: "sns", label: "SNS", icon: "◉", desc: "Topic delivery logs" },
      { id: "amazonmq", label: "Amazon MQ", icon: "⊛", desc: "ActiveMQ/RabbitMQ logs" },
      { id: "eventbridge", label: "EventBridge", icon: "⬡", desc: "Event routing logs" },
      { id: "stepfunctions", label: "Step Functions", icon: "⤶", desc: "State machine execution" },
      { id: "appsync", label: "AppSync", icon: "⟺", desc: "GraphQL API logs" },
      { id: "mskconnect", label: "MSK Connect", icon: "⟿", desc: "Kafka Connect managed logs" },
      {
        id: "endusermessaging",
        label: "End User Messaging",
        icon: "✉",
        desc: "SMS/MMS/voice delivery events",
      },
    ],
  },
  {
    id: "devtools",
    label: "Developer & CI/CD",
    color: "#7C3AED",
    icon: "⚙",
    services: [
      { id: "codebuild", label: "CodeBuild", icon: "⚙", desc: "Build job logs" },
      { id: "codepipeline", label: "CodePipeline", icon: "⟿", desc: "Pipeline stage events" },
      { id: "codedeploy", label: "CodeDeploy", icon: "⤳", desc: "Deployment lifecycle" },
      { id: "codecommit", label: "CodeCommit", icon: "⊙", desc: "Git push/PR events" },
      { id: "codeartifact", label: "CodeArtifact", icon: "⊛", desc: "Package publish & pull" },
      { id: "amplify", label: "Amplify", icon: "⚡", desc: "Frontend build & deploy" },
      { id: "xray", label: "X-Ray", icon: "◎", desc: "Distributed trace logs" },
      {
        id: "codecatalyst",
        label: "CodeCatalyst",
        icon: "⊙",
        desc: "Dev environment & workflow logs",
      },
      { id: "devicefarm", label: "Device Farm", icon: "□", desc: "Mobile app test run logs" },
      {
        id: "proton",
        label: "Proton",
        icon: "⊟",
        desc: "IaC environment & service deployment logs",
      },
      {
        id: "qdeveloper",
        label: "Q Developer",
        icon: "⊙",
        desc: "Code suggestion & transform events",
      },
      { id: "cloudshell", label: "CloudShell", icon: "⊙", desc: "Managed shell session logs" },
      { id: "cloud9", label: "Cloud9", icon: "⊟", desc: "IDE environment usage logs" },
      { id: "robomaker", label: "RoboMaker", icon: "⊛", desc: "Robotics simulation & fleet logs" },
    ],
  },
  {
    id: "analytics",
    label: "Analytics",
    color: "#F59E0B",
    icon: "◈",
    services: [
      { id: "emr", label: "EMR", icon: "⚙", desc: "Spark/Hadoop cluster logs" },
      { id: "glue", label: "Glue", icon: "⟺", desc: "ETL job execution logs" },
      { id: "athena", label: "Athena", icon: "◇", desc: "S3 SQL query logs" },
      { id: "lakeformation", label: "Lake Formation", icon: "◫", desc: "Data lake permissions" },
      { id: "quicksight", label: "QuickSight", icon: "◎", desc: "BI dashboard usage logs" },
      { id: "databrew", label: "DataBrew", icon: "⊕", desc: "Data prep job logs" },
      { id: "appflow", label: "AppFlow", icon: "⟿", desc: "SaaS integration logs" },
      { id: "mwaa", label: "MWAA", icon: "⟿", desc: "Managed Airflow DAG & task logs" },
      {
        id: "cleanrooms",
        label: "Clean Rooms",
        icon: "◎",
        desc: "Privacy-safe collaboration queries",
      },
      { id: "datazone", label: "DataZone", icon: "⊛", desc: "Data catalog & governance logs" },
      {
        id: "entityresolution",
        label: "Entity Resolution",
        icon: "⊕",
        desc: "Record matching & linking logs",
      },
      {
        id: "dataexchange",
        label: "Data Exchange",
        icon: "⟺",
        desc: "Data product subscription logs",
      },
      {
        id: "appfabric",
        label: "AppFabric",
        icon: "⟿",
        desc: "SaaS audit log normalisation (OCSF)",
      },
      {
        id: "b2bi",
        label: "B2B Data Interchange",
        icon: "⇆",
        desc: "EDI X12/EDIFACT transformation logs",
      },
    ],
  },
  {
    id: "aiml",
    label: "AI & Machine Learning",
    color: "#E91E63",
    icon: "✦",
    services: [
      { id: "sagemaker", label: "SageMaker", icon: "✦", desc: "Training & inference logs" },
      { id: "bedrock", label: "Bedrock", icon: "⊙", desc: "Foundation model invocations" },
      {
        id: "bedrockagent",
        label: "Bedrock Agent",
        icon: "◇",
        desc: "Agent & knowledge base invocations",
      },
      { id: "rekognition", label: "Rekognition", icon: "◎", desc: "Image & video analysis" },
      { id: "textract", label: "Textract", icon: "⊟", desc: "Document text extraction" },
      { id: "comprehend", label: "Comprehend", icon: "⊛", desc: "NLP & entity detection" },
      { id: "translate", label: "Translate", icon: "⇌", desc: "Language translation logs" },
      { id: "transcribe", label: "Transcribe", icon: "⊙", desc: "Speech-to-text jobs" },
      { id: "polly", label: "Polly", icon: "◉", desc: "Text-to-speech synthesis" },
      { id: "forecast", label: "Forecast", icon: "⌚", desc: "Time-series prediction logs" },
      { id: "personalize", label: "Personalize", icon: "⊕", desc: "Recommendation engine logs" },
      { id: "lex", label: "Lex", icon: "◯", desc: "Chatbot intent & session" },
      { id: "qbusiness", label: "Q Business", icon: "✦", desc: "Enterprise AI query & retrieval" },
      { id: "kendra", label: "Kendra", icon: "◎", desc: "Enterprise search query logs" },
      { id: "a2i", label: "Augmented AI (A2I)", icon: "⊙", desc: "Human review loop logs" },
      { id: "healthlake", label: "HealthLake", icon: "⊛", desc: "FHIR health data store logs" },
      {
        id: "nova",
        label: "Amazon Nova",
        icon: "✦",
        desc: "Nova foundation model invocation logs",
      },
      {
        id: "lookoutvision",
        label: "Lookout for Vision",
        icon: "◉",
        desc: "Industrial visual anomaly detection logs",
      },
      { id: "healthomics", label: "HealthOmics", icon: "✦", desc: "Genomics workflow run events" },
      {
        id: "bedrockdataautomation",
        label: "Bedrock Data Automation",
        icon: "⊙",
        desc: "Document extraction invocation logs",
      },
      {
        id: "lookoutequipment",
        label: "Lookout for Equipment",
        icon: "⊛",
        desc: "Industrial equipment anomaly detection",
      },
      { id: "monitron", label: "Monitron", icon: "◉", desc: "Equipment health sensor monitoring" },
    ],
  },
  {
    id: "iot",
    label: "IoT",
    color: "#06B6D4",
    icon: "⊛",
    services: [
      { id: "iotcore", label: "IoT Core", icon: "⊛", desc: "Device connect & message" },
      { id: "greengrass", label: "Greengrass", icon: "⊙", desc: "Edge compute deployment" },
      { id: "iotanalytics", label: "IoT Analytics", icon: "⟿", desc: "Device data pipeline" },
      { id: "iottwinmaker", label: "IoT TwinMaker", icon: "⊙", desc: "Digital twin asset logs" },
      {
        id: "iotfleetwise",
        label: "IoT FleetWise",
        icon: "⚡",
        desc: "Connected vehicle signal logs",
      },
      {
        id: "groundstation",
        label: "Ground Station",
        icon: "◎",
        desc: "Satellite contact & antenna events",
      },
      {
        id: "kinesisvideo",
        label: "Kinesis Video Streams",
        icon: "▷",
        desc: "Video stream ingestion & playback",
      },
      { id: "panorama", label: "Panorama", icon: "◎", desc: "Edge computer vision appliance logs" },
      { id: "freertos", label: "FreeRTOS", icon: "⊛", desc: "Embedded OS device telemetry" },
    ],
  },
  {
    id: "management",
    label: "Management & Governance",
    color: "#64748B",
    icon: "⚙",
    services: [
      {
        id: "cloudformation",
        label: "CloudFormation",
        icon: "⊟",
        desc: "Stack create/update events",
      },
      { id: "ssm", label: "Systems Manager", icon: "⚙", desc: "Run Command & Patch logs" },
      {
        id: "cloudwatch",
        label: "CloudWatch Alarms",
        icon: "⚠",
        desc: "Metric alarm state changes",
      },
      { id: "health", label: "AWS Health", icon: "⊕", desc: "Service health events" },
      { id: "trustedadvisor", label: "Trusted Advisor", icon: "◎", desc: "Cost & security checks" },
      { id: "controltower", label: "Control Tower", icon: "⊛", desc: "Guardrail & account mgmt" },
      { id: "organizations", label: "Organizations", icon: "⟺", desc: "Account & policy events" },
      {
        id: "servicecatalog",
        label: "Service Catalog",
        icon: "⊙",
        desc: "Self-service provisioning",
      },
      {
        id: "servicequotas",
        label: "Service Quotas",
        icon: "⊠",
        desc: "Quota utilization & alerts",
      },
      {
        id: "computeoptimizer",
        label: "Compute Optimizer",
        icon: "⟳",
        desc: "Right-sizing recommendations",
      },
      { id: "budgets", label: "Budgets", icon: "◇", desc: "Cost threshold alerts" },
      { id: "billing", label: "Billing", icon: "$", desc: "Cost & usage (Elastic)" },
      {
        id: "ram",
        label: "Resource Access Manager",
        icon: "⊕",
        desc: "Cross-account sharing logs",
      },
      { id: "resiliencehub", label: "Resilience Hub", icon: "⊛", desc: "RTO/RPO assessment logs" },
      { id: "migrationhub", label: "Migration Hub", icon: "⟺", desc: "Server migration tracking" },
      {
        id: "networkmanager",
        label: "Network Manager",
        icon: "⊙",
        desc: "Global WAN topology logs",
      },
      { id: "dms", label: "DMS", icon: "⟺", desc: "Database migration logs" },
      { id: "fis", label: "Fault Injection", icon: "⚠", desc: "Chaos experiment logs" },
      {
        id: "managedgrafana",
        label: "Managed Grafana",
        icon: "◎",
        desc: "Grafana workspace & alert logs",
      },
      {
        id: "supplychain",
        label: "Supply Chain",
        icon: "⟺",
        desc: "Supply planning & forecast logs",
      },
      {
        id: "appconfig",
        label: "AppConfig",
        icon: "⚙",
        desc: "Configuration deployment & rollback events",
      },
      {
        id: "drs",
        label: "Elastic Disaster Recovery",
        icon: "⊟",
        desc: "Replication, failover & recovery events",
      },
      {
        id: "licensemanager",
        label: "License Manager",
        icon: "⊠",
        desc: "License grant & consumption tracking",
      },
      {
        id: "chatbot",
        label: "Chatbot",
        icon: "◉",
        desc: "Slack/Teams/Chime notification delivery",
      },
      {
        id: "cloudwatchrum",
        label: "CloudWatch RUM",
        icon: "◎",
        desc: "Real user monitoring & web vitals",
      },
    ],
  },
  {
    id: "media",
    label: "Media & End User Computing",
    color: "#BE185D",
    icon: "▷",
    services: [
      { id: "mediaconvert", label: "MediaConvert", icon: "▷", desc: "Video transcoding jobs" },
      { id: "medialive", label: "MediaLive", icon: "◉", desc: "Live video channel logs" },
      { id: "workspaces", label: "WorkSpaces", icon: "□", desc: "Virtual desktop sessions" },
      { id: "connect", label: "Amazon Connect", icon: "◯", desc: "Contact centre call logs" },
      { id: "appstream", label: "AppStream", icon: "⊙", desc: "App streaming sessions" },
      { id: "gamelift", label: "GameLift", icon: "⬡", desc: "Game server & matchmaking" },
      { id: "deadlinecloud", label: "Deadline Cloud", icon: "▷", desc: "Render job & task logs" },
      {
        id: "chimesdkvoice",
        label: "Chime SDK Voice",
        icon: "◉",
        desc: "VoIP call quality & SIP event logs",
      },
      { id: "workmail", label: "WorkMail", icon: "✉", desc: "Email delivery & mailbox events" },
      { id: "wickr", label: "Wickr", icon: "⬡", desc: "Encrypted messaging & compliance logs" },
    ],
  },
  {
    id: "messaging",
    label: "Messaging & Communications",
    color: "#DB2777",
    icon: "◉",
    services: [
      { id: "ses", label: "SES", icon: "◉", desc: "Email send/bounce/complaint" },
      { id: "pinpoint", label: "Pinpoint", icon: "◎", desc: "Campaign & journey delivery" },
    ],
  },
  {
    id: "additional",
    label: "Additional Services",
    color: "#7C3AED",
    icon: "⊛",
    services: [
      {
        id: "arc",
        label: "App Recovery Controller",
        icon: "⊛",
        desc: "Zonal shift & routing control logs",
      },
      {
        id: "transferfamily",
        label: "Transfer Family",
        icon: "⟺",
        desc: "SFTP/FTPS/AS2 transfers",
      },
      { id: "lightsail", label: "Lightsail", icon: "⊙", desc: "Simple compute instance logs" },
      { id: "frauddetector", label: "Fraud Detector", icon: "⚠", desc: "ML fraud risk decisions" },
      {
        id: "lookoutmetrics",
        label: "Lookout for Metrics",
        icon: "◎",
        desc: "Anomaly detection alerts",
      },
      {
        id: "comprehendmedical",
        label: "Comprehend Medical",
        icon: "⊛",
        desc: "Clinical NLP & PHI logs",
      },
      {
        id: "locationservice",
        label: "Location Service",
        icon: "◉",
        desc: "Geofence & routing logs",
      },
      {
        id: "managedblockchain",
        label: "Managed Blockchain",
        icon: "⟺",
        desc: "Transaction & network logs",
      },
      { id: "codeguru", label: "CodeGuru", icon: "◎", desc: "Code quality findings" },
      { id: "devopsguru", label: "DevOps Guru", icon: "⊙", desc: "ML ops anomaly insights" },
      { id: "iotevents", label: "IoT Events", icon: "⬡", desc: "Device state machine logs" },
      { id: "iotsitewise", label: "IoT SiteWise", icon: "⌚", desc: "Industrial asset telemetry" },
      { id: "iotdefender", label: "IoT Defender", icon: "⚠", desc: "Device security audit logs" },
      { id: "wafv2", label: "WAF v2", icon: "◈", desc: "Web ACL allow/block rules" },
    ],
  },
];

/** All service ids in UI order (parents, then their subtrees recursively). */
export function flattenServiceIds(services: ServiceItem[]): string[] {
  const ids: string[] = [];
  for (const s of services) {
    ids.push(s.id);
    if (s.children?.length) ids.push(...flattenServiceIds(s.children));
  }
  return ids;
}

/** Flatten nested services for iteration (e.g. group select-all). */
export function flattenServiceItems(services: ServiceItem[]): ServiceItem[] {
  const out: ServiceItem[] = [];
  for (const s of services) {
    out.push(s);
    if (s.children?.length) out.push(...flattenServiceItems(s.children));
  }
  return out;
}

export function serviceIdsInGroup(group: { services: ServiceItem[] }): string[] {
  return flattenServiceIds(group.services);
}

const ALL_SERVICE_IDS = SERVICE_GROUPS.flatMap((g) => flattenServiceIds(g.services));

export { SERVICE_GROUPS, ALL_SERVICE_IDS };
