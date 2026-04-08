# Elastic onboarding installers

Standalone Node.js scripts to configure Elastic before you ship data with the **Cloud Load Generator** (AWS, GCP, or Azure). Run them once — all are idempotent and safe to re-run at any time.

**Requirements:** Node.js 18+ (native `fetch`, ES modules). No `npm install` needed — zero external dependencies.

---

## Deployment types

Each installer begins by asking which type of Elastic deployment you are connecting to:

```
Select your Elastic deployment type:

  1. Self-Managed  (on-premises, Docker, VM)
  2. Elastic Cloud Hosted  (cloud.elastic.co)
  3. Elastic Serverless  (cloud.elastic.co/serverless)
```

Your selection controls the URL format shown in the prompts and the validation rules applied.

|                        | Self-Managed                                 | Cloud Hosted    | Serverless      |
| ---------------------- | -------------------------------------------- | --------------- | --------------- |
| **Kibana port**        | `:5601` (default)                            | `:9243`         | none            |
| **Elasticsearch port** | `:9200` (default)                            | `:9243`         | none            |
| **Protocol**           | `http://` or `https://`                      | `https://` only | `https://` only |
| **TLS skip option**    | yes (prompted)                               | no              | no              |
| **Package Registry**   | Kibana-proxied (air-gap safe) + EPR fallback | EPR via Kibana  | EPR via Kibana  |
| **Fleet required**     | yes — must be enabled                        | pre-configured  | pre-configured  |

### Self-Managed notes

**Self-signed / internal CA certificates**

If your Kibana or Elasticsearch endpoint uses a self-signed certificate or one issued by an internal CA, the installer will prompt:

```
Skip TLS certificate verification? Required for self-signed / internal CA certs. (y/N):
> y
  ⚠  TLS verification disabled — ensure you trust this endpoint.
```

Answering `y` sets `NODE_TLS_REJECT_UNAUTHORIZED=0` for the duration of the installer process only. This is safe for internal networks where you control the endpoint. Do not use on untrusted networks.

**Air-gapped / no internet access**

The integration installer (Installer 1) resolves the latest AWS package version by first querying Kibana's own Fleet API (`GET /api/fleet/epm/packages/aws`), which works without any internet access. It only falls back to the public Elastic Package Registry (`epr.elastic.co`) if the Kibana Fleet API does not return a version. The pipeline and dashboard installers have no external network dependencies at all.

**Fleet setup**

On self-managed Kibana, Fleet must be enabled and initialised before running Installer 1. Go to **Kibana → Fleet → Settings** and complete the Fleet setup wizard if you have not already done so.

---

## Installer 1 — Official Elastic AWS Integration

**File:** `installer/aws-elastic-integration/`
**Command:** `npm run setup:integration`

### What it installs

The official Elastic AWS integration package via the Kibana Fleet API. You get:

- Pre-built index templates for all 46 officially-supported AWS services
- ILM (Index Lifecycle Management) policies
- Pre-built Kibana dashboards for CloudTrail, VPC Flow, ALB/NLB, GuardDuty, Lambda, RDS, and more
- ML anomaly detection job configurations

### How to run

```bash
npm run setup:integration
# or directly:
node installer/aws-elastic-integration/index.mjs
```

### Credentials

| Prompt         | Where to find it                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| **Kibana URL** | Deployment overview → Kibana endpoint (e.g. `https://my-deployment.kb.us-east-1.aws.elastic-cloud.com:9243`) |
| **API key**    | Kibana → Stack Management → API Keys → Create API key — needs `cluster: manage` + `kibana: all` privileges   |

### What happens

1. Prompts for Kibana URL and API key
2. Checks if the AWS integration is already installed
3. If installed → prints current version and exits (skips safely)
4. If not installed → fetches the latest version from the Elastic Package Registry and installs it

### Example output

```
╔══════════════════════════════════════════════════════╗
║     AWS → Elastic Integration Installer              ║
╚══════════════════════════════════════════════════════╝

Kibana URL (https://...):
> https://my-deployment.kb.us-east-1.aws.elastic-cloud.com:9243

Elastic API Key:
> ABCdef123==

Checking AWS integration status...
  AWS integration not installed — fetching latest version...
  Latest version: 2.34.1
  Installing aws 2.34.1...
  ✓ AWS integration installed successfully (version 2.34.1)
Done.
```

---

## Installer 2 — Custom Ingest Pipelines

**File:** `installer/aws-custom-pipelines/`
**Command:** `npm run setup:pipelines`

### What it installs

Custom Elasticsearch ingest pipelines for the ~187 AWS services not covered by the official integration. These pipelines parse the structured JSON `message` field emitted by the load generator into named fields (e.g. `glue.parsed`, `sagemaker.parsed`) — making logs fully searchable and aggregatable in Kibana.

### How to run

```bash
npm run setup:pipelines
# or directly:
node installer/aws-custom-pipelines/index.mjs
```

### Credentials

| Prompt                | Where to find it                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Elasticsearch URL** | Deployment overview → Elasticsearch endpoint (e.g. `https://my-deployment.es.us-east-1.aws.elastic-cloud.com:9243`) |
| **API key**           | Kibana → Stack Management → API Keys → Create API key — needs `manage_ingest_pipelines` cluster privilege           |

### What happens

1. Prompts for Elasticsearch URL and API key
2. Tests the connection and confirms the cluster name + version
3. Displays an interactive group selection menu
4. For each selected pipeline: checks if it exists, skips if so, creates it if not
5. Prints a summary of installed / skipped / failed counts

### Example output

```
╔══════════════════════════════════════════════════════╗
║     AWS → Elastic Custom Pipeline Installer          ║
╚══════════════════════════════════════════════════════╝

Elasticsearch URL (e.g. https://my-deployment.es.us-east-1.aws.elastic-cloud.com:9243):
> https://my-deployment.es.us-east-1.aws.elastic-cloud.com:9243

Elastic API Key:
> ABCdef123==

Testing connection...
  Connected to cluster: my-deployment (8.14.0)

Available pipeline groups:

  1. aiml        (3 pipelines)
  2. analytics    (15 pipelines)
  3. compute      (8 pipelines)
  4. databases    (10 pipelines)
  5. devtools     (9 pipelines)
  6. enduser      (14 pipelines)
  7. iot          (8 pipelines)
  8. management   (25 pipelines)
  9. media        (2 pipelines)
  10. ml          (14 pipelines)
  11. networking  (9 pipelines)
  12. security    (16 pipelines)
  13. serverless  (5 pipelines)
  14. storage     (6 pipelines)
  15. streaming   (5 pipelines)
  16. all         (install every group)

Enter number(s) comma-separated, or "all":
> all

Installing 187 pipeline(s)...

  ✓ logs-aws.glue-default — installed
  ✓ logs-aws.emr_logs-default — installed
  ✓ logs-aws.athena-default — installed
  ...
  ✓ logs-aws.sagemaker-default — installed

Installed 132 / 132 pipelines.
Done.
```

You can select individual groups (e.g. `1,3,8`) or type `all`. Already-installed pipelines are automatically skipped on every run.

### Pipeline groups

| Group      | Pipelines | Services covered                                                                                                                                                                                                                                                           |
| ---------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| aiml       | 3         | Kendra, A2I, HealthLake                                                                                                                                                                                                                                                    |
| analytics  | 13        | Glue, EMR, Athena, Lake Formation, QuickSight, DataBrew, AppFlow, MWAA, Clean Rooms, DataZone, Entity Resolution, Data Exchange, OpenSearch                                                                                                                                |
| compute    | 7         | EC2, EKS, Fargate, ECR, App Runner, Batch, Elastic Beanstalk                                                                                                                                                                                                               |
| databases  | 9         | ElastiCache, DocumentDB, Aurora, Neptune, Timestream, QLDB, Keyspaces, MemoryDB, Redshift                                                                                                                                                                                  |
| devtools   | 8         | CodeCommit, CodeArtifact, Amplify, CodeGuru, DevOps Guru, Lightsail, CodeCatalyst, Device Farm                                                                                                                                                                             |
| enduser    | 14        | WorkSpaces, Connect, AppStream, GameLift, Transfer Family, MediaConvert, MediaLive, Pinpoint, Location Service, Managed Blockchain, Fraud Detector, Lookout for Metrics, Comprehend Medical, SES                                                                           |
| iot        | 8         | IoT Core, Greengrass, IoT Analytics, IoT Events, IoT SiteWise, IoT Defender, IoT TwinMaker, IoT FleetWise                                                                                                                                                                  |
| management | 21        | CloudFormation, SSM, CloudWatch Alarms, AWS Health, Trusted Advisor, Control Tower, Organizations, Service Catalog, Service Quotas, Compute Optimizer, Budgets, Billing, RAM, Resilience Hub, Migration Hub, Network Manager, DMS, FIS, Managed Grafana, Supply Chain, ARC |
| media      | 1         | Deadline Cloud                                                                                                                                                                                                                                                             |
| ml         | 14        | SageMaker, Bedrock, Bedrock Agent, Rekognition, Textract, Comprehend, Translate, Transcribe, Polly, Forecast, Personalize, Lex, Comprehend Medical, Q Business                                                                                                             |
| networking | 6         | Shield, Global Accelerator, Direct Connect, PrivateLink, WAF v2, VPC Lattice                                                                                                                                                                                               |
| security   | 12        | Macie, IAM Access Analyzer, Cognito, KMS, Secrets Manager, ACM, IAM Identity Center, Detective, Verified Access, Security Lake, Security IR, CloudHSM                                                                                                                      |
| serverless | 5         | Lambda, API Gateway, Step Functions, EventBridge, AppSync                                                                                                                                                                                                                  |
| storage    | 6         | EFS, FSx, DataSync, Backup, Storage Gateway, S3 Storage Lens                                                                                                                                                                                                               |
| streaming  | 5         | Kinesis Analytics, Amazon MQ, SNS, SQS (custom only), MSK Connect                                                                                                                                                                                                          |

### Using custom pipelines alongside the official AWS integration

The custom pipelines were designed to cover services **not** included in the official Elastic AWS integration, so in most cases they are purely additive. However there are a few things to be aware of if you have both installed.

**Services intentionally excluded from the custom pipelines** (already covered by the official integration):

CloudTrail, VPC Flow, ALB/NLB, GuardDuty, S3 Access, API Gateway, CloudFront, Network Firewall, Security Hub, WAF, Route 53, EC2 (metrics), ECS, Config, Inspector, DynamoDB, Redshift, EBS, Kinesis, MSK/Kafka, SNS, SQS, Transit Gateway, VPN, AWS Health, Bedrock Agent, Billing, NAT Gateway.

None of these have a custom pipeline — there is nothing to conflict with.

**Services where different dataset names are used to avoid conflicts:**

For services where the load generator produces logs under a different dataset name than the official integration uses, both pipelines coexist safely and target separate data streams:

| Service | Official dataset | Load generator dataset |
| ------- | ---------------- | ---------------------- |
| Lambda  | `aws.lambda`     | `aws.lambda_logs`      |
| EC2     | `aws.ec2`        | `aws.ec2_logs`         |
| EMR     | `aws.emr`        | `aws.emr_logs`         |

**Two pipelines that will overwrite official integration pipelines if installed:**

| Pipeline               | Group     | Notes                                                                                                                                                                                                                                                                                                                                              |
| ---------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `logs-aws.rds-default` | databases | RDS has official integration coverage. The custom pipeline adds structured JSON parsing for the load generator's simulated log format but **replaces** the official pipeline for the `logs-aws.rds` data stream. Skip this pipeline if you want to preserve the official integration's RDS field mappings and ECS normalization for real RDS logs. |
| `logs-aws.eks-default` | compute   | Same situation as RDS above — EKS is covered by the official integration.                                                                                                                                                                                                                                                                          |

**Recommendation:** If you are running the official AWS integration alongside the load generator, consider skipping the **RDS** entry from the `databases` group and the **EKS** entry from the `compute` group when prompted during installation. All other custom pipelines are safe to install without affecting the official integration.

---

### Pipeline naming convention

All pipelines follow the Elastic standard:

```
logs-aws.{dataset_suffix}-default
```

Examples:

- `logs-aws.glue-default`
- `logs-aws.sagemaker-default`
- `logs-aws.lambda_logs-default`
- `logs-aws.emr_logs-default`

These match the index names the load generator writes to, so pipelines are applied automatically on ingest — no extra routing or index template configuration needed.

### Processor strategy

| Service type                                                               | Processors                                                                                               |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Services with structured JSON logging (Glue, EMR, SageMaker, Lambda, etc.) | `json` processor → parse `message` into `{ns}.parsed`, then targeted `rename` processors for key fields  |
| All other services                                                         | Single `json` processor with `ignore_failure: true` — passes plain-text safely, parses JSON when present |

---

---

## Installer 3 — Custom Dashboards

**File:** `installer/aws-custom-dashboards/`
**Command:** `npm run setup:dashboards`

### What it installs

Pre-built Kibana dashboards for AWS services monitored by the load generator. Dashboards use ES|QL queries against
the `logs-aws.*` data streams written by the app.

### Dashboards included

15 pre-built dashboards covering key AWS services. Each dashboard supports both import methods — the Kibana Dashboards API (9.4+) and Saved Objects ndjson import (8.11–9.3) — so all versions are covered automatically.

| File                           | Title                                              | Panels | Index pattern             |
| ------------------------------ | -------------------------------------------------- | ------ | ------------------------- |
| `glue-dashboard.json`          | AWS Glue — Jobs & Performance                      | 15     | `logs-aws.glue*`          |
| `sagemaker-dashboard.json`     | AWS SageMaker — Endpoints & Training               | 13     | `logs-aws.sagemaker*`     |
| `emr-dashboard.json`           | AWS EMR — Clusters & Job Performance               | 15     | `logs-aws.emr*`           |
| `athena-dashboard.json`        | AWS Athena — Query Performance & Cost              | 15     | `logs-aws.athena*`        |
| `xray-dashboard.json`          | AWS X-Ray — Distributed Tracing                    | 14     | `logs-aws.xray*`          |
| `lambda-dashboard.json`        | AWS Lambda — Invocations & Performance             | 13     | `logs-aws.lambda*`        |
| `eks-dashboard.json`           | AWS EKS — Cluster & Pod Health                     | 14     | `logs-aws.eks*`           |
| `stepfunctions-dashboard.json` | AWS Step Functions — Execution & State Performance | 13     | `logs-aws.stepfunctions*` |
| `bedrock-dashboard.json`       | AWS Bedrock — Model Invocations & Token Usage      | 13     | `logs-aws.bedrock*`       |
| `aurora-dashboard.json`        | AWS Aurora — Cluster & Replication Health          | 13     | `logs-aws.aurora*`        |
| `elasticache-dashboard.json`   | AWS ElastiCache — Cache Performance & Replication  | 13     | `logs-aws.elasticache*`   |
| `opensearch-dashboard.json`    | AWS OpenSearch — Cluster Health & Performance      | 13     | `logs-aws.opensearch*`    |
| `cicd-dashboard.json`          | AWS CI/CD — CodePipeline & CodeBuild               | 14     | `logs-aws.codepipeline*`  |
| `cognito-dashboard.json`       | AWS Cognito — Authentication & Risk Events         | 13     | `logs-aws.cognito*`       |
| `kinesis-dashboard.json`       | AWS Kinesis Streams — Throughput & Iterator Health | 13     | `logs-aws.kinesis*`       |

#### AWS Glue — Jobs & Performance

| Panel                      | Type           | Metric                                                                               |
| -------------------------- | -------------- | ------------------------------------------------------------------------------------ |
| Total Runs                 | KPI metric     | Count of all events                                                                  |
| Success Rate %             | KPI metric     | % of events with `event.outcome` = success                                           |
| Avg Duration (s)           | KPI metric     | Avg `event.duration` in seconds                                                      |
| Failed Runs                | KPI metric     | Count where `event.outcome` = failure                                                |
| Run Outcomes               | Donut          | Count by `event.outcome` (success / failure)                                         |
| Runs by State              | Donut          | Count by `aws.glue.job.run_state`                                                    |
| Failures by Error Category | Horizontal bar | Count by `aws.glue.error_category` (failures only)                                   |
| Avg Job Duration           | Line           | Avg `event.duration` converted to seconds                                            |
| JVM Heap Usage             | Line           | Avg `aws.glue.metrics.driver.jvm.heap.usage` (0–1)                                   |
| Executor Count             | Line           | Avg `aws.glue.metrics.driver.ExecutorAllocationManager.executors.numberAllExecutors` |
| Failed / Killed Tasks      | Stacked bar    | Sum of `numFailedTasks` and `numKilledTasks` over time                               |
| Elapsed Time ETL           | Line           | Avg `aws.glue.metrics.driver.aggregate.elapsedTime` (ms)                             |
| Records Read               | Line           | Sum `aws.glue.metrics.driver.aggregate.numRecords` over time                         |
| Throughput by Job Name     | Horizontal bar | Count by `aws.glue.job.name` (top 10 jobs)                                           |
| Recent Job Runs            | Data table     | Last 100 events: timestamp, job name, state, outcome, duration, error category       |

#### AWS SageMaker — Endpoints & Training

| Panel                    | Type            | Metric                                                                |
| ------------------------ | --------------- | --------------------------------------------------------------------- |
| Total Invocations        | KPI metric      | Sum `aws.sagemaker.cloudwatch_metrics.Invocations.sum`                |
| Avg Latency (ms)         | KPI metric      | Avg `aws.sagemaker.cloudwatch_metrics.ModelLatency.avg`               |
| Total 4xx Errors         | KPI metric      | Sum `Invocations4XXError.sum`                                         |
| Total 5xx Errors         | KPI metric      | Sum `Invocations5XXError.sum`                                         |
| Invocations Over Time    | Area            | Sum `aws.sagemaker.cloudwatch_metrics.Invocations.sum`                |
| Model Latency            | Line            | Avg `aws.sagemaker.cloudwatch_metrics.ModelLatency.avg`               |
| 4xx / 5xx Errors         | Line (2 series) | Sum of `Invocations4XXError.sum` and `Invocations5XXError.sum`        |
| GPU / CPU Utilization    | Line (2 series) | Avg of `GPUUtilization.avg` and `CPUUtilization.avg`                  |
| Job Outcomes             | Donut           | Count by `event.outcome`                                              |
| Events by Job Type       | Horizontal bar  | Count by `aws.sagemaker.job.type`                                     |
| Events by Action         | Horizontal bar  | Count by `event.action` (top 10 actions)                              |
| Training Loss & Accuracy | Line (2 series) | Avg `training_loss` and `accuracy` (Training jobs only)               |
| Recent SageMaker Events  | Data table      | Last 100 events: timestamp, job name, type, action, outcome, duration |

#### AWS EMR — Clusters & Job Performance

| Panel                     | Type        | Metric                                                                                   |
| ------------------------- | ----------- | ---------------------------------------------------------------------------------------- |
| Total Jobs                | KPI metric  | Count of all events                                                                      |
| Success Rate %            | KPI metric  | % of events with `event.outcome` = success                                               |
| Avg Duration (s)          | KPI metric  | Avg `event.duration` in seconds                                                          |
| Failed Jobs               | KPI metric  | Count where `event.outcome` = failure                                                    |
| Job Outcomes              | Donut       | Count by `event.outcome` (success / failure)                                             |
| Jobs by Application       | Donut       | Count by `aws.emr.application` (Spark, Hive, Flink, etc.)                                |
| Jobs by Run State         | Donut       | Count by `aws.emr.job.run_state` (SUCCEEDED / FAILED / RUNNING / WAITING)                |
| Job Runs Over Time        | Line        | Count of job events over time                                                            |
| Avg HDFS Utilisation %    | Line        | Avg `aws.emr.metrics.hdfs_utilization_pct`                                               |
| Avg YARN Memory Used (MB) | Line        | Avg `aws.emr.metrics.yarn_memory_used_mb`                                                |
| JVM Heap Usage (0–1)      | Line        | Avg `aws.emr.metrics.jvm_heap_usage`                                                     |
| Avg Executor Count        | Line        | Avg `aws.emr.metrics.executor_count`                                                     |
| Avg GC Time (ms)          | Line        | Avg `aws.emr.metrics.gc_time_ms`                                                         |
| Completed vs Failed Tasks | Stacked bar | Sum of `numCompletedTasks` and `numFailedTasks` over time                                |
| Recent Job Runs           | Data table  | Last 100 events: timestamp, cluster, application, job name, run state, outcome, duration |

#### AWS Athena — Query Performance & Cost

| Panel                          | Type           | Metric                                                                                   |
| ------------------------------ | -------------- | ---------------------------------------------------------------------------------------- |
| Total Queries                  | KPI metric     | Count of all events                                                                      |
| Success Rate %                 | KPI metric     | % of events with `event.outcome` = success                                               |
| Avg Duration (s)               | KPI metric     | Avg `event.duration` in seconds                                                          |
| Total Scanned (GB)             | KPI metric     | Sum `aws.athena.data_scanned_bytes` converted to GB                                      |
| Query Outcomes                 | Donut          | Count by `event.outcome` (success / failure)                                             |
| Queries by Workgroup           | Donut          | Count by `aws.athena.workgroup`                                                          |
| Queries by Database            | Donut          | Count by `aws.athena.database`                                                           |
| Query Volume Over Time         | Line           | Count of query events over time                                                          |
| Avg Engine Execution Time (ms) | Line           | Avg `aws.athena.metrics.EngineExecutionTimeInMillis.avg`                                 |
| Avg Query Queue Time (ms)      | Line           | Avg `aws.athena.metrics.QueryQueueTimeInMillis.avg`                                      |
| Avg Query Planning Time (ms)   | Line           | Avg `aws.athena.metrics.QueryPlanningTimeInMillis.avg`                                   |
| Data Scanned by Workgroup (GB) | Horizontal bar | Sum `aws.athena.data_scanned_bytes` / 1 GB, grouped by workgroup                         |
| Top Error Codes                | Horizontal bar | Count of failures by `aws.athena.error_code` (top 10)                                    |
| Engine Version Split           | Donut          | Count by `aws.athena.engine_version`                                                     |
| Recent Queries                 | Data table     | Last 100 events: timestamp, workgroup, database, state, duration, scanned MB, error code |

### How to run

```bash
npm run setup:dashboards
# or directly:
node installer/aws-custom-dashboards/index.mjs
```

### Credentials

| Prompt         | Where to find it                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| **Kibana URL** | Deployment overview → Kibana endpoint (e.g. `https://my-deployment.kb.us-east-1.aws.elastic-cloud.com:9243`) |
| **API key**    | Kibana → Stack Management → API Keys → Create API key — needs `kibana_admin` built-in role                   |

**Note:** The dashboard installer automatically selects the best import method for your Kibana version:

- **Kibana 9.4+** — uses the Dashboards API (`Elastic-Api-Version: 1`) as primary, falls back to Saved Objects import if unavailable
- **Kibana 8.11–9.3** — uses Saved Objects ndjson import as primary, falls back to Dashboards API

Both methods are handled by the same `npm run setup:dashboards` command. You can also use the dedicated legacy installer (`npm run setup:dashboards:legacy`) to force ndjson import on older versions.

### What happens

1. Prompts for Kibana URL and API key
2. Tests the connection and confirms the Kibana version
3. Lists available dashboards and prompts for selection
4. For each selected dashboard: searches by title, skips if already installed, creates if not
5. Prints a summary of installed / skipped / failed counts

### Example output

```
╔══════════════════════════════════════════════════════╗
║     AWS → Elastic Custom Dashboard Installer         ║
╚══════════════════════════════════════════════════════╝

Installs Kibana dashboards for AWS services monitored
by the Cloud Load Generator (AWS path).

Kibana URL (e.g. https://my-deployment.kb.us-east-1.aws.elastic-cloud.com:9243):
> https://my-deployment.kb.us-east-1.aws.elastic-cloud.com:9243

Elastic API Key:
> ABCdef123==

Testing connection...
  Connected to Kibana: my-deployment (9.4.0)

Available dashboards:

  1. AWS Glue — Jobs & Performance
  2. AWS SageMaker — Endpoints & Training
  3. AWS EMR — Clusters & Job Performance
  4. AWS Athena — Query Performance & Cost
  5. AWS X-Ray — Distributed Tracing
  6. AWS Lambda — Invocations & Performance
  7. AWS EKS — Cluster & Pod Health
  8. AWS Step Functions — Execution & State Performance
  9. AWS Bedrock — Model Invocations & Token Usage
  10. AWS Aurora — Cluster & Replication Health
  11. AWS ElastiCache — Cache Performance & Replication
  12. AWS OpenSearch — Cluster Health & Performance
  13. AWS CI/CD — CodePipeline & CodeBuild
  14. AWS Cognito — Authentication & Risk Events
  15. AWS Kinesis Streams — Throughput & Iterator Health
  16. all  (install every dashboard)

Enter number(s) comma-separated, or "all":
> all

Installing 15 dashboard(s)...

  ✓ "AWS Glue — Jobs & Performance" — installed via Dashboards API (id: a1b2c3d4-...)
  ✓ "AWS SageMaker — Endpoints & Training" — installed via Dashboards API (id: e5f6g7h8-...)
  ✓ "AWS EMR — Clusters & Job Performance" — installed via Dashboards API (id: c3d4e5f6-...)
  ...
  ✓ "AWS Kinesis Streams — Throughput & Iterator Health" — installed via Dashboards API (id: f7e8d9c0-...)

Installed 15 / 15 dashboard(s).
Done.
```

### Template variables / filter controls

The dashboard JSON format does not include Kibana filter controls (e.g. dropdowns to filter by job name, job type, or region). These must be added manually after import via the Kibana UI:

1. Open the dashboard in Kibana
2. Click **Controls** in the dashboard toolbar (or **Edit → Add control**)
3. Add an **Options list** control for any field you want to filter by — common choices:
   - `aws.glue.job.name` — filter all Glue panels to a single job
   - `aws.sagemaker.job.type` — filter SageMaker panels to Training / Endpoint / etc.
   - `aws.emr.application` — filter EMR panels to a specific framework (Spark, Hive, etc.)
   - `aws.emr.job.name` — filter EMR panels to a single job pipeline
   - `aws.athena.workgroup` — filter Athena panels to a specific workgroup
   - `aws.athena.database` — filter Athena panels to a specific database
   - `event.outcome` — toggle between success and failure views
   - `cloud.region` — filter by AWS region

Controls are saved as part of the dashboard in Kibana and persist across sessions, but are not exported in the simplified JSON format used by this installer.

---

### Adding more dashboards

Any `*-dashboard.json` file placed in `installer/aws-custom-dashboards/` is automatically discovered and presented in the
selection menu. The JSON format is the Kibana Dashboards API format — see the existing files for reference.

---

### Legacy import (Kibana 8.11 – 9.3)

For Kibana versions before 9.4, use the Saved Objects `.ndjson` installer instead:

```bash
npm run setup:dashboards:legacy
# or directly:
node installer/aws-custom-dashboards/index-legacy.mjs
```

This uses `POST /api/saved_objects/_import` which is supported from **Kibana 8.11+** (when ES|QL became available).

The ndjson files are pre-generated and committed under `installer/aws-custom-dashboards/ndjson/`. If you add a new
`*-dashboard.json` file, regenerate them:

```bash
npm run generate:dashboards:ndjson
# or directly:
node installer/aws-custom-dashboards/generate-ndjson.mjs
```

You can also import the `.ndjson` files manually via the Kibana UI:
**Stack Management → Saved Objects → Import → select the file → Import**

| Method               | Kibana version | Command                                   |
| -------------------- | -------------- | ----------------------------------------- |
| Dashboards API       | 9.4+           | `npm run setup:dashboards`                |
| Saved Objects import | 8.11 – 9.3     | `npm run setup:dashboards:legacy`         |
| Manual UI import     | 8.11+          | Stack Management → Saved Objects → Import |

---

---

## Installer 4 — ML Anomaly Detection Jobs

**File:** `installer/aws-custom-ml-jobs/`
**Command:** `npm run setup:ml-jobs`

### What it installs

99 Elasticsearch ML anomaly detection jobs across 20 groups — covering services that the official Elastic AWS integration does not include (which only ships ML jobs for CloudTrail). These jobs detect real operational and security anomalies such as:

- Spikes in VPC denied traffic, rare destination ports, GuardDuty finding types, WAF blocks, CloudTrail rare user actions
- Security Hub critical finding spikes, Macie data exposure, Inspector critical vulnerabilities, Config compliance drift, KMS unusual operations, Security Lake OCSF finding spikes
- Lambda error/throttle/duration anomalies, EC2 CPU and network anomalies, EKS pod failures and rare images
- ECS memory pressure, Auto Scaling thrashing, Elastic Beanstalk 5xx and latency spikes
- API Gateway 5xx errors, throttle spikes, and latency anomalies; Lambda cold start spikes
- ALB 5xx spikes and rare user agents
- CloudFront cache miss storms, Route 53 NXDOMAIN spikes, Network Firewall drop spikes
- RDS latency/connection spikes, Aurora replica lag, ElastiCache hit-rate drops
- DynamoDB throttles and latency, Redshift query duration, OpenSearch JVM pressure and write rejections
- Kinesis iterator age lag, SQS message backlog, SNS delivery failures, MSK consumer lag, EventBridge failures, Step Functions rollbacks
- Glue job failures and duration anomalies, Athena cost and performance, EMR task failures
- Bedrock token usage, latency, and error anomalies per model
- CloudWatch alarm storms, CloudFormation rollbacks, billing cost spikes, SSM rare commands
- APM transaction duration, error rate, and throughput anomalies across OTel trace services
- CodeBuild failures and duration anomalies, CodePipeline failures, X-Ray trace errors and latency
- IoT Core connection failures, message volume anomalies, rule engine errors, rare device detection
- MediaConvert job failures, Connect contact abandonment and handle time, WorkSpaces session failures

See [`installer/aws-custom-ml-jobs/README.md`](aws-custom-ml-jobs/README.md) for the full job catalogue.

### How to run

```bash
npm run setup:ml-jobs
# or directly:
node installer/aws-custom-ml-jobs/index.mjs
```

### Credentials

| Prompt                | Where to find it                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------- |
| **Elasticsearch URL** | Deployment overview → Elasticsearch endpoint                                                |
| **API key**           | Kibana → Stack Management → API Keys → Create API key — needs `manage_ml` cluster privilege |

### Job groups

| Group               | Jobs | Services covered                                                                                                              |
| ------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------- |
| security            | 7    | VPC Flow, GuardDuty, WAF, CloudTrail                                                                                          |
| security-extended   | 7    | Security Hub, Macie, Inspector, Config, KMS, Security Lake                                                                    |
| compute             | 7    | Lambda, EC2, EKS                                                                                                              |
| compute-extended    | 5    | ECS, Auto Scaling, Elastic Beanstalk                                                                                          |
| networking          | 5    | ALB, API Gateway                                                                                                              |
| networking-extended | 4    | CloudFront, Route 53, Network Firewall                                                                                        |
| databases           | 6    | RDS, Aurora, ElastiCache                                                                                                      |
| databases-extended  | 5    | DynamoDB, Redshift, OpenSearch                                                                                                |
| streaming           | 4    | Kinesis Streams, SQS                                                                                                          |
| messaging           | 5    | SNS, MSK/Kafka, EventBridge, Step Functions                                                                                   |
| analytics           | 5    | Glue, Athena, EMR                                                                                                             |
| aiml                | 4    | Bedrock                                                                                                                       |
| storage             | 4    | S3                                                                                                                            |
| management          | 4    | CloudWatch, CloudFormation, Billing, SSM                                                                                      |
| apm-traces          | 6    | APM transactions, spans, Lambda cold starts, EMR stages                                                                       |
| serverless          | 4    | API Gateway, Lambda cold starts                                                                                               |
| devtools            | 5    | CodeBuild, CodePipeline, X-Ray                                                                                                |
| iot                 | 4    | IoT Core                                                                                                                      |
| media               | 4    | MediaConvert, Connect, WorkSpaces                                                                                             |
| siem                | 4    | SIEM anomaly detection — CloudTrail source IP anomalies, root account activity, IAM creation spikes, Route53 DNS exfiltration |

---

## Why four separate installers?

|                        | `setup:integration`                             | `setup:pipelines`              | `setup:dashboards`            | `setup:ml-jobs`            |
| ---------------------- | ----------------------------------------------- | ------------------------------ | ----------------------------- | -------------------------- |
| **API**                | Kibana Fleet API                                | Elasticsearch Ingest API       | Kibana Dashboards API         | Elasticsearch ML API       |
| **URL needed**         | Kibana URL                                      | Elasticsearch URL              | Kibana URL                    | Elasticsearch URL          |
| **Privileges**         | `cluster: manage` + `kibana: all`               | `manage_ingest_pipelines`      | `kibana_admin`                | `manage_ml`                |
| **What it configures** | Dashboards, ILM, index templates                | Ingest pipelines               | Custom Kibana dashboards      | ML anomaly detection jobs  |
| **Re-runnable**        | Yes — skips if already installed                | Yes — skips existing pipelines | Yes — skips by title          | Yes — skips existing jobs  |
| **When to re-run**     | When Elastic releases a new integration version | When new services are added    | When new dashboards are added | When new ML jobs are added |

Running all four gives you full coverage across all 144 services. Paths use the same `installer/aws-*` prefix as GCP (`installer/gcp-*`) and Azure (`installer/azure-*`).

| Command                                                       | Path                                 |
| ------------------------------------------------------------- | ------------------------------------ |
| `npm run setup:integration` / `setup:aws-integration`         | `installer/aws-elastic-integration/` |
| `npm run setup:pipelines` / `setup:aws-pipelines`             | `installer/aws-custom-pipelines/`    |
| `npm run setup:dashboards` / `setup:aws-dashboards`           | `installer/aws-custom-dashboards/`   |
| `npm run setup:ml-jobs` / `setup:aws-ml-jobs`                 | `installer/aws-custom-ml-jobs/`      |
| `npm run setup:apm-integration` / `setup:aws-apm-integration` | `installer/aws-apm-integration/`     |

---

## GCP mirror (parallel installers)

The same four installer **patterns** exist under standalone paths for Google Cloud. They target the official Elastic **`gcp`** integration package, **`logs-gcp.*`** data streams, and synthetic documents from the GCP generator module (`src/gcp/`).

| Command                         | Path                                 | Purpose                                                                                |
| ------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------- | ------------------- |
| `npm run setup:gcp-integration` | `installer/gcp-elastic-integration/` | Install Fleet package **`gcp`**                                                        |
| `npm run setup:gcp-pipelines`   | `installer/gcp-custom-pipelines/`    | Ingest pipelines `logs-gcp.{dataset}-default` (registry generated from `src/gcp/data`) |
| `npm run setup:gcp-dashboards`  | `installer/gcp-custom-dashboards/`   | Kibana dashboards (ES                                                                  | QL on `logs-gcp.*`) |
| `npm run setup:gcp-ml-jobs`     | `installer/gcp-custom-ml-jobs/`      | ML jobs over `logs-gcp.*`                                                              |

Regenerate assets when GCP dataset maps change:

- `npm run gen:gcp-pipelines` — refreshes `installer/gcp-custom-pipelines/pipelines/registry.mjs`
- `npm run gen:gcp-dashboards` — refreshes `installer/gcp-custom-dashboards/*-dashboard.json`

---

## Azure mirror (parallel installers)

Same four installer **patterns** for Microsoft Azure: synthetic data in `src/azure/`, data streams **`logs-azure.*`**. The Elastic Fleet package **`azure`** covers **Azure Logs**; resource metrics from Azure Monitor are a separate package **`azure_metrics`** if you ingest platform metrics the same way as production.

| Command                           | Path                                   | Purpose                                                                                                            |
| --------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------- |
| `npm run setup:azure-integration` | `installer/azure-elastic-integration/` | Install Fleet package **`azure`** (Azure Logs)                                                                     |
| `npm run setup:azure-pipelines`   | `installer/azure-custom-pipelines/`    | Ingest pipelines for `logs-azure.{dataset}-default` (registry from `scripts/generate-azure-pipeline-registry.mjs`) |
| `npm run setup:azure-dashboards`  | `installer/azure-custom-dashboards/`   | Kibana dashboards (ES                                                                                              | QL on `logs-azure.*`) |
| `npm run setup:azure-ml-jobs`     | `installer/azure-custom-ml-jobs/`      | ML jobs over `logs-azure.*`                                                                                        |

Regenerate assets when Azure dataset maps change:

- `npm run gen:azure-pipelines` → `installer/azure-custom-pipelines/pipelines/registry.mjs`
- `npm run gen:azure-dashboards` → `installer/azure-custom-dashboards/*-dashboard.json`
