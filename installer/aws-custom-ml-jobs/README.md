# Installer 4 — ML Anomaly Detection Jobs

Interactive CLI that installs **Elasticsearch ML anomaly detection jobs** for AWS services across 22 service groups (137 jobs total). Jobs are created via the Elasticsearch ML API directly — no Kibana required.

---

## Why this installer exists

The official Elastic AWS integration ships ML jobs only for **CloudTrail**. This installer fills the gap with purpose-built anomaly detection jobs for 40+ AWS services across security, compute, networking, databases, streaming, analytics, AI/ML, storage, and cloud management.

---

## Prerequisites

- Elasticsearch 8.x (Stack) or Elastic Cloud / Serverless with ML enabled
- A Platinum or Enterprise licence is required for ML anomaly detection on self-managed clusters
- An API key with the **`manage_ml`** cluster privilege

To create a suitable API key in Kibana:

> Dev Tools → `POST /_security/api_key` with `"cluster": ["manage_ml"]`

---

## How to run

```bash
# From the repo root:
npm run setup:aws-ml-jobs

# Or directly:
node installer/aws-custom-ml-jobs/index.mjs
```

The installer will prompt you for:

1. Deployment type (Self-Managed / Cloud Hosted / Serverless)
2. Whether to skip TLS verification (self-managed only, for internal CAs)
3. Your **Elasticsearch** URL (not Kibana)
4. Your API key

---

## Job groups

| #   | Group                 | Description                                                                                                                                                                                                                                                        | Jobs |
| --- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| 1   | `security`            | Security & compliance — VPC Flow, GuardDuty, WAF, CloudTrail                                                                                                                                                                                                       | 7    |
| 2   | `security-extended`   | Extended security — Security Hub, Macie, Inspector, Config, KMS, Security Lake                                                                                                                                                                                     | 7    |
| 3   | `compute`             | Compute & containers — Lambda, EC2, EKS                                                                                                                                                                                                                            | 7    |
| 4   | `compute-extended`    | Extended compute — ECS, Auto Scaling, Elastic Beanstalk                                                                                                                                                                                                            | 5    |
| 5   | `networking`          | Networking & load balancers — ALB, API Gateway                                                                                                                                                                                                                     | 5    |
| 6   | `networking-extended` | Extended networking — CloudFront, Route 53, Network Firewall                                                                                                                                                                                                       | 4    |
| 7   | `databases`           | Databases — RDS, Aurora, ElastiCache                                                                                                                                                                                                                               | 6    |
| 8   | `databases-extended`  | Extended databases — DynamoDB, Redshift, OpenSearch                                                                                                                                                                                                                | 5    |
| 9   | `streaming`           | Streaming & messaging — Kinesis, SQS                                                                                                                                                                                                                               | 4    |
| 10  | `messaging`           | Messaging & event bus — SNS, MSK, EventBridge, Step Functions                                                                                                                                                                                                      | 5    |
| 11  | `analytics`           | Analytics — Glue, Athena, EMR                                                                                                                                                                                                                                      | 5    |
| 12  | `aiml`                | AI & ML services — Bedrock                                                                                                                                                                                                                                         | 4    |
| 13  | `storage`             | Storage — S3                                                                                                                                                                                                                                                       | 4    |
| 14  | `management`          | Management & governance — CloudWatch, CloudFormation, Billing, SSM                                                                                                                                                                                                 | 4    |
| 15  | `apm-traces`          | APM & distributed traces — Lambda, EMR, all OTel trace services                                                                                                                                                                                                    | 6    |
| 16  | `serverless`          | Serverless & API — API Gateway errors, throttling, Lambda cold starts                                                                                                                                                                                              | 4    |
| 17  | `devtools`            | Developer & CI/CD — CodeBuild failures, CodePipeline, X-Ray traces                                                                                                                                                                                                 | 5    |
| 18  | `iot`                 | IoT — IoT Core connection failures, message volume, rule errors, rare devices                                                                                                                                                                                      | 4    |
| 19  | `media`               | Media & end-user computing — MediaConvert jobs, Connect contacts, WorkSpaces                                                                                                                                                                                       | 4    |
| 20  | `siem`                | SIEM anomaly detection — CloudTrail source IP anomalies, root account activity, IAM creation spikes, Route53 DNS exfiltration detection                                                                                                                            | 4    |
| 21  | `new-services`        | v10 services — Kendra, VPC Lattice, FIS, Clean Rooms, DataZone, Security IR, CloudHSM, Managed Grafana, Supply Chain, IoT TwinMaker, IoT FleetWise, CodeCatalyst, Entity Resolution, Data Exchange, Device Farm, MSK Connect, A2I, Deadline Cloud, HealthLake, ARC | 21   |
| 22  | `v11-services`        | v11 services — App Mesh, Client VPN, Cloud Map, Outposts, Audit Manager, Verified Permissions, Payment Cryptography, DAX, Proton, AppFabric, B2B Interchange, AppConfig, Elastic DRS, License Manager, Chatbot, Chime SDK Voice, Artifact                          | 17   |

You can install individual groups or all groups at once.

---

## All jobs

### security (7 jobs)

| Job ID                            | Service       | Detector                  | What it detects                                                    |
| --------------------------------- | ------------- | ------------------------- | ------------------------------------------------------------------ |
| `aws-vpcflow-high-bytes-tx`       | VPC Flow Logs | high_sum by dest IP       | Unusually high bytes transmitted to a destination (exfiltration)   |
| `aws-vpcflow-rare-dest-port`      | VPC Flow Logs | rare by dest port         | Rare destination ports being contacted (lateral movement, recon)   |
| `aws-vpcflow-high-denied-count`   | VPC Flow Logs | high_count by src IP      | Spikes in denied connections from a single source IP               |
| `aws-guardduty-finding-spike`     | GuardDuty     | high_count by severity    | Sudden increases in GuardDuty finding counts per severity          |
| `aws-guardduty-rare-finding-type` | GuardDuty     | rare by finding type      | Rare or novel GuardDuty finding types appearing for the first time |
| `aws-waf-high-block-rate`         | WAF           | high_count by src IP      | Spikes in WAF rule block actions per source IP                     |
| `aws-cloudtrail-rare-user-action` | CloudTrail    | rare by event name + user | Rare or unusual API calls per user (privilege escalation, recon)   |

### security-extended (7 jobs)

| Job ID                                   | Service       | Detector                    | What it detects                                                                              |
| ---------------------------------------- | ------------- | --------------------------- | -------------------------------------------------------------------------------------------- |
| `aws-securityhub-critical-finding-spike` | Security Hub  | high_count                  | Unusual spikes in high/critical severity findings (posture degradation)                      |
| `aws-macie-finding-spike`                | Macie         | high_count by bucket        | Unusual Macie sensitive data findings per S3 bucket                                          |
| `aws-inspector-critical-vuln-spike`      | Inspector     | high_mean by instance       | Unusual spikes in critical Inspector vulnerability findings per instance                     |
| `aws-config-noncompliance-spike`         | Config        | high_count                  | Unusual spikes in non-compliant Config rule evaluations (compliance drift)                   |
| `aws-kms-unusual-operation`              | KMS           | rare by operation + account | Rare or unusual KMS key operations (credential abuse, unusual access)                        |
| `aws-securitylake-ocsf-finding-spike`    | Security Lake | high_count by class_uid     | Spikes in high/critical OCSF Security Findings (class 2001) — GuardDuty→SecurityHub chains   |
| `aws-securitylake-rare-ocsf-class`       | Security Lake | rare by class_uid           | Rare OCSF class types appearing in Security Lake — unexpected data sources or attack vectors |

### compute (7 jobs)

| Job ID                        | Service | Detector                | What it detects                                       |
| ----------------------------- | ------- | ----------------------- | ----------------------------------------------------- |
| `aws-lambda-error-spike`      | Lambda  | high_count by function  | Spikes in Lambda function errors per function name    |
| `aws-lambda-duration-anomaly` | Lambda  | high_mean by function   | Unusually long Lambda invocation durations            |
| `aws-lambda-throttle-spike`   | Lambda  | high_mean by function   | Spikes in Lambda throttles (capacity exhaustion)      |
| `aws-ec2-cpu-anomaly`         | EC2     | high_mean by instance   | CPU utilisation anomalies per EC2 instance            |
| `aws-ec2-network-spike`       | EC2     | high_sum by instance    | Unusual outbound network volume per instance          |
| `aws-eks-pod-failure-spike`   | EKS     | high_count by namespace | Pod failure / restart spikes per Kubernetes namespace |
| `aws-eks-rare-image`          | EKS     | rare by image           | Rare container images starting in the cluster         |

### compute-extended (5 jobs)

| Job ID                              | Service           | Detector                 | What it detects                                                       |
| ----------------------------------- | ----------------- | ------------------------ | --------------------------------------------------------------------- |
| `aws-ecs-memory-pressure`           | ECS               | high_mean by cluster     | Unusual memory utilisation spikes in ECS clusters (early OOM warning) |
| `aws-ecs-task-failure-spike`        | ECS               | high_count by cluster    | Spikes in ECS task failures per cluster (container instability)       |
| `aws-autoscaling-rapid-scaling`     | Auto Scaling      | high_mean by ASG         | Unusually rapid Auto Scaling activity — flapping/thrashing detection  |
| `aws-beanstalk-5xx-spike`           | Elastic Beanstalk | high_mean by environment | Unusual 5xx error rates in Elastic Beanstalk environments             |
| `aws-beanstalk-latency-p99-anomaly` | Elastic Beanstalk | high_mean by environment | Unusual p99 latency spikes (tail latency regression)                  |

### networking (5 jobs)

| Job ID                                | Service     | Detector                   | What it detects                                                 |
| ------------------------------------- | ----------- | -------------------------- | --------------------------------------------------------------- |
| `aws-alb-5xx-spike`                   | ALB         | high_count by target group | Spikes in ALB 5xx responses per target group                    |
| `aws-alb-response-time-anomaly`       | ALB         | high_mean                  | Unusual backend response times in ALB                           |
| `aws-alb-rare-user-agent`             | ALB         | rare by user agent         | Rare user agent strings (scanners, bots, attack tooling)        |
| `aws-apigateway-logs-latency-anomaly` | API Gateway | high_mean by stage         | Unusual API Gateway latency per stage (API Gateway access logs) |
| `aws-apigateway-error-spike`          | API Gateway | high_count by stage        | Spikes in API Gateway 4xx/5xx errors per stage                  |

### networking-extended (4 jobs)

| Job ID                            | Service          | Detector   | What it detects                                                       |
| --------------------------------- | ---------------- | ---------- | --------------------------------------------------------------------- |
| `aws-cloudfront-error-rate-spike` | CloudFront       | high_count | Unusual CDN 5xx error rates (origin failures, availability issues)    |
| `aws-cloudfront-cache-miss-spike` | CloudFront       | high_count | Unusual CloudFront cache miss rate spikes (cache invalidation storms) |
| `aws-route53-nxdomain-spike`      | Route 53         | high_count | Unusual NXDOMAIN response spikes (DNS attack or misconfiguration)     |
| `aws-networkfirewall-drop-spike`  | Network Firewall | high_count | Unusual Network Firewall packet drop spikes (perimeter anomaly)       |

### databases (6 jobs)

| Job ID                           | Service           | Detector               | What it detects                                              |
| -------------------------------- | ----------------- | ---------------------- | ------------------------------------------------------------ |
| `aws-rds-latency-anomaly`        | RDS               | high_mean by instance  | Query latency anomalies per RDS instance                     |
| `aws-rds-connection-spike`       | RDS               | high_count by instance | Unusual connection count spikes (connection pool exhaustion) |
| `aws-aurora-replica-lag`         | Aurora            | high_mean by cluster   | Aurora replica lag anomalies indicating replication issues   |
| `aws-aurora-serverless-capacity` | Aurora Serverless | high_max by cluster    | Capacity unit spikes (cost runaway, scaling storms)          |
| `aws-elasticache-hit-rate-drop`  | ElastiCache       | low_mean by node       | Cache hit rate drops (cold cache, key churn)                 |
| `aws-elasticache-latency-spike`  | ElastiCache       | high_mean by node      | Command latency spikes per ElastiCache node                  |

### databases-extended (5 jobs)

| Job ID                                | Service    | Detector             | What it detects                                                             |
| ------------------------------------- | ---------- | -------------------- | --------------------------------------------------------------------------- |
| `aws-dynamodb-throttle-spike`         | DynamoDB   | high_mean by table   | Unusual DynamoDB read throttle events per table (capacity planning)         |
| `aws-dynamodb-latency-anomaly`        | DynamoDB   | high_mean by table   | Unusual DynamoDB request latency per table (performance regression)         |
| `aws-redshift-query-duration-anomaly` | Redshift   | high_mean by cluster | Unusual Redshift query execution durations (long-running warehouse queries) |
| `aws-opensearch-jvm-pressure`         | OpenSearch | high_mean by domain  | Unusual JVM memory pressure in OpenSearch (pre-OOM and GC storm warning)    |
| `aws-opensearch-write-rejections`     | OpenSearch | high_mean by domain  | Unusual write rejection spikes in OpenSearch (indexing backpressure)        |

### streaming (12 jobs in `streaming-jobs.json`)

| Job ID                               | Service   | Detector            | What it detects                                                                  |
| ------------------------------------ | --------- | ------------------- | -------------------------------------------------------------------------------- |
| `aws-kinesis-iterator-age-anomaly`   | Kinesis   | high_mean by stream | Iterator age anomalies (consumers falling behind)                                |
| `aws-kinesis-throughput-anomaly`     | Kinesis   | high_sum by stream  | Unusual write throughput spikes per stream                                       |
| `aws-sqs-message-age-anomaly`        | SQS       | high_mean by queue  | Message age anomalies (slow consumers, DLQ build-up)                             |
| `aws-sqs-not-visible-spike`          | SQS       | high_count by queue | Spikes in not-visible message count (processing failures)                        |
| `aws-msk-topic-lag-duration-anomaly` | MSK/Kafka | high_mean by topic  | Unusual consumer lag duration by topic (distinct from messaging cluster lag job) |
| `aws-msk-failure-spike`              | MSK/Kafka | high_count by topic | Failure event spikes by topic                                                    |

Also includes Kinesis Data Analytics, Firehose, and SNS jobs — see the JSON file for full IDs.

### messaging (5 jobs)

| Job ID                                      | Service        | Detector                   | What it detects                                                  |
| ------------------------------------------- | -------------- | -------------------------- | ---------------------------------------------------------------- |
| `aws-sns-delivery-failure-spike`            | SNS            | high_mean                  | Unusual spikes in SNS notification delivery failures             |
| `aws-msk-consumer-lag-anomaly`              | MSK/Kafka      | high_mean by cluster       | Unusual Kafka consumer lag (consumers falling behind producers)  |
| `aws-msk-under-replicated-partitions`       | MSK/Kafka      | high_mean by cluster       | Unusual under-replicated Kafka partitions (broker health issues) |
| `aws-eventbridge-failed-invocations`        | EventBridge    | high_mean by rule          | Unusual EventBridge target invocation failure spikes             |
| `aws-stepfunctions-execution-failure-spike` | Step Functions | high_mean by state machine | Unusual Step Functions execution failure rates per state machine |

### analytics (5 jobs)

| Job ID                              | Service | Detector               | What it detects                                                  |
| ----------------------------------- | ------- | ---------------------- | ---------------------------------------------------------------- |
| `aws-glue-job-duration-anomaly`     | Glue    | high_mean by job       | Unusual ETL job durations per Glue job (silently getting slower) |
| `aws-glue-failure-spike`            | Glue    | high_count by job      | Spikes in Glue job failures                                      |
| `aws-athena-data-scanned-spike`     | Athena  | high_sum by workgroup  | Unusual data scan volumes (primary cost anomaly signal)          |
| `aws-athena-query-duration-anomaly` | Athena  | high_mean by workgroup | Unusual Athena query execution times (performance regression)    |
| `aws-emr-task-failure-spike`        | EMR     | high_mean by cluster   | Unusual task failure rates in EMR clusters                       |

### aiml (4 jobs)

| Job ID                          | Service | Detector            | What it detects                                              |
| ------------------------------- | ------- | ------------------- | ------------------------------------------------------------ |
| `aws-bedrock-token-usage-spike` | Bedrock | high_sum by model   | Unusual token consumption per model (cost runaway detection) |
| `aws-bedrock-latency-anomaly`   | Bedrock | high_mean by model  | Unusual inference latency per Bedrock model                  |
| `aws-bedrock-error-spike`       | Bedrock | high_count by model | Error rate spikes per Bedrock model                          |
| `aws-bedrock-rare-model`        | Bedrock | rare by model ID    | Rare or unexpected model IDs being invoked                   |

### storage (4 jobs)

| Job ID                     | Service | Detector             | What it detects                                                |
| -------------------------- | ------- | -------------------- | -------------------------------------------------------------- |
| `aws-s3-bandwidth-anomaly` | S3      | high_sum by bucket   | Unusual data egress volume per bucket (potential exfiltration) |
| `aws-s3-error-spike`       | S3      | high_count by bucket | 4xx/5xx error spikes per bucket (access denied, not found)     |
| `aws-s3-rare-operation`    | S3      | rare by operation    | Rare S3 operations (DeleteBucket, PutBucketPolicy, etc.)       |
| `aws-s3-rare-requester`    | S3      | rare by requester    | Rare requesting principals accessing a bucket                  |

### management (4 jobs)

| Job ID                              | Service        | Detector                  | What it detects                                                                      |
| ----------------------------------- | -------------- | ------------------------- | ------------------------------------------------------------------------------------ |
| `aws-cloudwatch-alarm-storm`        | CloudWatch     | high_count                | Correlated alarm storms — many alarms firing at once (infrastructure-wide incidents) |
| `aws-cloudformation-rollback-spike` | CloudFormation | high_count                | Unusual CloudFormation rollback and failure rates (deployment instability)           |
| `aws-billing-cost-anomaly`          | Billing        | high_mean                 | Unusual AWS billing cost spikes per account and region                               |
| `aws-ssm-rare-command`              | SSM            | rare by action + instance | Rare Systems Manager commands per instance (lateral movement, privilege abuse)       |

### apm-traces (6 jobs)

Jobs in this group target the `traces-apm-*` data streams produced by the load generator's OTel trace generators. Requires the **Elastic APM integration** to be installed first (see `npm run setup:aws-apm-integration`).

| Job ID                             | Service | Detector                          | What it detects                                                                 |
| ---------------------------------- | ------- | --------------------------------- | ------------------------------------------------------------------------------- |
| `apm-transaction-duration-anomaly` | APM     | high_mean duration by service     | Services with unusually long transaction durations (latency regression)         |
| `apm-error-rate-spike`             | APM     | high_count errors by service      | Sudden spike in transaction error count per service                             |
| `apm-service-throughput-drop`      | APM     | low_count transactions by service | Significant drop in requests to a service (outage or traffic loss)              |
| `apm-slow-span-by-type`            | APM     | high_mean span duration by type   | Slow spans within a trace by span type (db, messaging, storage, external)       |
| `apm-lambda-cold-start-spike`      | Lambda  | high_count cold starts            | Unusual Lambda cold start frequency per function (scaling or deployment events) |
| `apm-emr-stage-duration-anomaly`   | EMR     | high_mean stage duration          | Unusually long Spark stage durations (data skew, resource contention, OOM)      |

### serverless (4 jobs)

| Job ID                                       | Service     | Detector                    | What it detects                                                          |
| -------------------------------------------- | ----------- | --------------------------- | ------------------------------------------------------------------------ |
| `aws-apigateway-5xx-error-spike`             | API Gateway | high_count by stage         | Unusual spikes in 5xx server errors per stage (backend failures)         |
| `aws-apigateway-throttle-spike`              | API Gateway | high_count                  | Unusual spikes in throttled (429) requests — quota exhaustion or abuse   |
| `aws-apigateway-integration-latency-anomaly` | API Gateway | high_mean duration by stage | Unusual API Gateway integration latency (backend slowdowns, cold starts) |
| `aws-lambda-cold-start-spike`                | Lambda      | high_count by function      | Unusual Lambda cold start frequency per function (scaling or deployment) |

### devtools (5 jobs)

| Job ID                           | Service      | Detector                      | What it detects                                                               |
| -------------------------------- | ------------ | ----------------------------- | ----------------------------------------------------------------------------- |
| `aws-codebuild-failure-spike`    | CodeBuild    | high_count by project         | Unusual spikes in build failures per project (broken builds or regressions)   |
| `aws-codebuild-duration-anomaly` | CodeBuild    | high_mean duration by project | Slow builds indicating dependency or resource issues                          |
| `aws-codepipeline-failure-spike` | CodePipeline | high_count by pipeline        | Unusual pipeline stage failures (deployment regressions or environment drift) |
| `aws-xray-error-rate-spike`      | X-Ray        | high_count by service         | Unusual X-Ray traced errors per service (distributed fault detection)         |
| `aws-xray-latency-anomaly`       | X-Ray        | high_mean duration by service | Unusual response latency per X-Ray service (performance regressions)          |

### iot (4 jobs)

| Job ID                                 | Service  | Detector           | What it detects                                                                        |
| -------------------------------------- | -------- | ------------------ | -------------------------------------------------------------------------------------- |
| `aws-iotcore-connection-failure-spike` | IoT Core | high_count         | Unusual spikes in device connection failures (compromised or misconfigured devices)    |
| `aws-iotcore-message-volume-anomaly`   | IoT Core | count              | Unusual changes in message publish volume (device fleet anomalies, unexpected silence) |
| `aws-iotcore-rule-error-spike`         | IoT Core | high_count by rule | Spike in IoT rule engine action errors (broken integrations or downstream failures)    |
| `aws-iotcore-rare-client`              | IoT Core | rare by client_id  | Rare or previously unseen device client IDs connecting (unauthorised devices)          |

### media (4 jobs)

| Job ID                                  | Service      | Detector                    | What it detects                                                                        |
| --------------------------------------- | ------------ | --------------------------- | -------------------------------------------------------------------------------------- |
| `aws-mediaconvert-failure-spike`        | MediaConvert | high_count by queue         | Unusual spikes in transcoding job failures per queue (encoding errors)                 |
| `aws-connect-contact-abandonment-spike` | Connect      | high_count by queue         | Unusual contact abandonment spikes (understaffing, outages, or UX problems)            |
| `aws-connect-handle-time-anomaly`       | Connect      | high_mean duration by queue | Unusual agent handle time (training gaps, system slowness, complex calls)              |
| `aws-workspaces-session-failure-spike`  | WorkSpaces   | high_count                  | Unusual spikes in WorkSpaces session failures (VDI connectivity or unhealthy desktops) |

### siem (4 jobs)

| Job ID                              | Service    | Detector             | What it detects                                                                                    |
| ----------------------------------- | ---------- | -------------------- | -------------------------------------------------------------------------------------------------- |
| `aws-cloudtrail-rare-source-ip`     | CloudTrail | rare by source IP    | Rare or previously unseen source IPs making API calls (compromised credentials, unexpected access) |
| `aws-cloudtrail-root-activity`      | CloudTrail | high_count           | Unusual root account API activity (should be near-zero in well-managed accounts)                   |
| `aws-cloudtrail-iam-creation-spike` | CloudTrail | high_count           | Unusual spikes in IAM user/role/policy creation events (privilege escalation, persistence)         |
| `aws-route53-dns-exfiltration`      | Route 53   | high_count by domain | Unusual DNS query volume per domain (DNS tunnelling and data exfiltration detection)               |

---

## Example output

```
╔══════════════════════════════════════════════════════╗
║     AWS → Elastic ML Anomaly Detection Installer     ║
╚══════════════════════════════════════════════════════╝

Installs Elasticsearch ML anomaly detection jobs for AWS services.
Requires an API key with the `manage_ml` cluster privilege.

Select your Elastic deployment type:

  1. Self-Managed  (on-premises, Docker, VM)
  2. Elastic Cloud Hosted  (cloud.elastic.co)
  3. Elastic Serverless  (cloud.elastic.co/serverless)

Enter 1, 2, or 3:
> 2

Elasticsearch URL (e.g. https://my-deployment.es.us-east-1.aws.elastic-cloud.com:9243):
> https://my-deployment.es.eu-west-2.aws.elastic.cloud

Elastic API Key (requires `manage_ml` privilege):
> <redacted>

Testing connection...
  Connected to cluster: my-production (8.17.0)
  Checking ML availability...
  ML is available.

Available job groups:

    1. security          (7 jobs)  — Security & compliance anomaly detection — VPC Flow, GuardDuty, WAF, CloudTrail
    2. security-extended (7 jobs)  — Extended security anomaly detection — Security Hub, Macie, Inspector, Config, KMS, Security Lake
    3. compute           (7 jobs)  — Compute & container anomaly detection — Lambda, EC2, EKS
    4. compute-extended  (5 jobs)  — Extended compute anomaly detection — ECS, Auto Scaling, Elastic Beanstalk
    5. networking        (5 jobs)  — Networking & load balancer anomaly detection — ALB, API Gateway
    6. networking-extended (4 jobs) — Extended networking anomaly detection — CloudFront, Route 53, Network Firewall
    7. databases         (6 jobs)  — Database anomaly detection — RDS, Aurora, ElastiCache
    8. databases-extended (5 jobs) — Extended database anomaly detection — DynamoDB, Redshift, OpenSearch
    9. streaming         (4 jobs)  — Streaming & messaging anomaly detection — Kinesis, SQS
   10. messaging         (5 jobs)  — Messaging & event bus anomaly detection — SNS, MSK, EventBridge, Step Functions
   11. analytics         (5 jobs)  — Analytics anomaly detection — Glue, Athena, EMR
   12. aiml              (4 jobs)  — AI & ML service anomaly detection — Bedrock
   13. storage           (4 jobs)  — Storage anomaly detection — S3
   14. management        (4 jobs)  — Management & governance anomaly detection — CloudWatch, CloudFormation, Billing, SSM
   15. apm-traces        (6 jobs)  — APM & distributed trace anomaly detection — Lambda, EMR, OTel services
   16. serverless        (4 jobs)  — Serverless & API anomaly detection — API Gateway, Lambda cold starts
   17. devtools          (5 jobs)  — Developer & CI/CD anomaly detection — CodeBuild, CodePipeline, X-Ray
   18. iot               (4 jobs)  — IoT anomaly detection — IoT Core connections, message volume, rule errors
   19. media             (4 jobs)  — Media & end-user computing — MediaConvert, Connect, WorkSpaces
   20. siem              (4 jobs)  — SIEM anomaly detection — CloudTrail source IP anomalies, root account activity, IAM creation spikes, Route53 DNS exfiltration
   21. all               (install every group)

Enter number(s) comma-separated, or "all":
> 1,3

Installing 14 job(s)...

  ✓ aws-vpcflow-high-bytes-tx — installed
  ✓ aws-vpcflow-rare-dest-port — installed
  ✓ aws-vpcflow-high-denied-count — installed
  ✓ aws-guardduty-finding-spike — installed
  ✓ aws-guardduty-rare-finding-type — installed
  ✓ aws-waf-high-block-rate — installed
  ✓ aws-cloudtrail-rare-user-action — installed
  ✓ aws-lambda-error-spike — installed
  ✓ aws-lambda-duration-anomaly — installed
  ✓ aws-lambda-throttle-spike — installed
  ✓ aws-ec2-cpu-anomaly — installed
  ✓ aws-ec2-network-spike — installed
  ✓ aws-eks-pod-failure-spike — installed
  ✓ aws-eks-rare-image — installed

Installed 14 / 14 job(s).

Open jobs and start datafeeds? This begins ML analysis. (y/N):
> y

  Opening aws-vpcflow-high-bytes-tx... opened. Starting datafeed... started.
  Opening aws-vpcflow-rare-dest-port... opened. Starting datafeed... started.
  ...

Done.
```

---

## Opening jobs and starting datafeeds

After installation, the installer offers to open jobs and start their datafeeds immediately. If you choose **N** (or run the installer again to install more groups later), you can start jobs manually from:

> Kibana → Machine Learning → Anomaly Detection → Jobs → select jobs → Actions → Start datafeed

Datafeeds default to real-time mode (from now). To backfill historical data, use the Kibana UI to set a custom start time.

---

## Viewing results in Kibana

Once datafeeds are running and data has been collected for at least one bucket span (typically 15–60 minutes), anomalies will appear in:

> Kibana → Machine Learning → Anomaly Detection → Anomaly Explorer

Filter by job group `aws` to see all jobs installed by this tool. Anomaly scores are surfaced on a per-job and per-detector basis, with influencers highlighting the specific instance, function, bucket, or IP responsible for the anomaly.

---

## Notes

- Jobs use `allow_lazy_open: true` — they will open even if ML nodes are temporarily at capacity.
- All jobs use `model_memory_limit` values between 16 MB and 128 MB; adjust these in the job JSON files before installing if your environment has high cardinality.
- Re-running the installer is safe — existing jobs are detected and skipped automatically.
- Job definitions live in `installer/aws-custom-ml-jobs/jobs/` as `*-jobs.json` files. You can add new groups by creating additional files following the same schema.
