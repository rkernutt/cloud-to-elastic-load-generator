# Configuring OTel Traces for AWS Services → Elastic APM

This guide covers everything needed to get distributed traces from AWS services into Elastic APM using OpenTelemetry. Traces land in the `traces-apm-default` data stream and appear in the Elastic APM UI under **Services**.

Services covered: Lambda, EMR Spark, API Gateway, ECS/Fargate, Step Functions, EKS/Kubernetes, SQS, Kinesis, DynamoDB, RDS/Aurora, Amazon Bedrock, and eight multi-service workflow patterns. In total, the app ships **54** AWS trace generators (**46** single-service profiles plus **8** workflows).

---

## Prerequisites

### 1. Elastic APM integration installed

Traces require the **Elastic APM integration** to be installed before any data is shipped. This provisions the index templates and ILM policies for `traces-apm-*`, `logs-apm.error-*`, and `metrics-apm.*`. Without these templates, bulk writes will fail with a mapping exception.

Install via Fleet in Kibana:

**Kibana → Fleet → Add integration → search "APM" → Add APM**

Accept defaults for all settings. The integration creates the required data stream templates automatically. You only need to do this once per deployment.

> **Elastic Cloud users:** The APM integration is pre-installed on all Elastic Cloud deployments. No action needed — `traces-apm-default` already exists.

### 2. APM Server or direct OTLP endpoint

Lambda and EMR both send trace data via **OTLP** (the OTel wire protocol). You need a destination that accepts OTLP:

| Option                                            | When to use                                   | OTLP endpoint format                            |
| ------------------------------------------------- | --------------------------------------------- | ----------------------------------------------- |
| **Elastic APM Server** (bundled with Fleet/Cloud) | All deployments                               | `https://<kibana-host>:8200`                    |
| **Elastic Cloud APM endpoint**                    | Elastic Cloud only                            | Available in Cloud console → Integrations → APM |
| **OTel Collector** (self-managed)                 | When you need buffering, sampling, or fan-out | Your collector's gRPC/HTTP port                 |

Retrieve your APM Server URL and secret token (or API key) from:

- **Elastic Cloud:** Console → Deployments → your deployment → Applications → APM
- **Self-managed:** Kibana → Fleet → Agent policies → Elastic APM integration settings

---

## Lambda

Lambda instrumentation uses a **Lambda layer** that wraps the function runtime. No application code changes are required — the layer intercepts all AWS SDK calls automatically and generates spans.

### Step 1 — Add the EDOT Lambda layer

The Elastic Distribution of OpenTelemetry (EDOT) Lambda layers are the recommended option. AWS also publishes ADOT (AWS Distro for OpenTelemetry) layers as an alternative.

**EDOT layers (Elastic-managed):**

| Runtime             | Layer ARN (eu-west-2)                                                      |
| ------------------- | -------------------------------------------------------------------------- |
| Node.js 18.x / 20.x | `arn:aws:lambda:eu-west-2:267093732750:layer:elastic-otel-node-x86_64:5`   |
| Python 3.11 / 3.12  | `arn:aws:lambda:eu-west-2:267093732750:layer:elastic-otel-python-x86_64:5` |
| Java 11 / 17 / 21   | `arn:aws:lambda:eu-west-2:267093732750:layer:elastic-otel-java-x86_64:5`   |

> Replace `eu-west-2` with your function's region. Full layer ARN lists for all regions: [ela.st/edot-lambda-layers](https://ela.st/edot-lambda-layers)

**ADOT layers (AWS-managed alternative):**

| Runtime | Layer ARN (eu-west-2)                                                  |
| ------- | ---------------------------------------------------------------------- |
| Node.js | `arn:aws:lambda:eu-west-2:901920570463:layer:aws-otel-nodejs-x86_64:5` |
| Python  | `arn:aws:lambda:eu-west-2:901920570463:layer:aws-otel-python-x86_64:5` |
| Java    | `arn:aws:lambda:eu-west-2:901920570463:layer:aws-otel-java-x86_64:5`   |

Add the layer via AWS CLI:

```bash
aws lambda update-function-configuration \
  --function-name my-function \
  --layers arn:aws:lambda:eu-west-2:267093732750:layer:elastic-otel-node-x86_64:5
```

Or in CloudFormation / SAM:

```yaml
Properties:
  Layers:
    - arn:aws:lambda:eu-west-2:267093732750:layer:elastic-otel-node-x86_64:5
```

Or in Terraform:

```hcl
resource "aws_lambda_function" "my_function" {
  layers = [
    "arn:aws:lambda:eu-west-2:267093732750:layer:elastic-otel-node-x86_64:5"
  ]
}
```

### Step 2 — Set environment variables

Add the following environment variables to the Lambda function:

```bash
# Required — wraps the runtime entry point with the OTel handler
AWS_LAMBDA_EXEC_WRAPPER=/opt/otel-handler

# Required — where to send traces
OTEL_EXPORTER_OTLP_ENDPOINT=https://your-apm-server:8200

# Required — authentication (use secret token or API key)
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer <apm-secret-token>
# OR for API key auth:
# OTEL_EXPORTER_OTLP_HEADERS=Authorization=ApiKey <base64-api-key>

# Required — identifies the service in APM
OTEL_SERVICE_NAME=my-function-name

# Recommended — environment for filtering in APM UI
OTEL_RESOURCE_ATTRIBUTES=deployment.environment=production,cloud.provider=aws,cloud.region=eu-west-2
```

> **ADOT users:** Replace `AWS_LAMBDA_EXEC_WRAPPER=/opt/otel-handler` with `/opt/otel-proxy-handler` (Node/Python) or `/opt/otel-stream-handler` for streaming functions.

Via AWS CLI:

```bash
aws lambda update-function-configuration \
  --function-name my-function \
  --environment "Variables={
    AWS_LAMBDA_EXEC_WRAPPER=/opt/otel-handler,
    OTEL_EXPORTER_OTLP_ENDPOINT=https://your-apm-server:8200,
    OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer abc123,
    OTEL_SERVICE_NAME=my-function-name,
    OTEL_RESOURCE_ATTRIBUTES=deployment.environment=production
  }"
```

### Step 3 — Verify

Invoke the function once, then check **Kibana → Observability → APM → Services**. Your function should appear within 30 seconds. Each invocation creates one transaction (the Lambda execution) plus child spans for every AWS SDK call made inside the function (DynamoDB, S3, SQS, etc.).

### What gets traced automatically

The EDOT/ADOT Lambda layer auto-instruments the following without code changes:

| SDK call                           | Span type           | Span name example               |
| ---------------------------------- | ------------------- | ------------------------------- |
| DynamoDB GetItem / PutItem / Query | `db` / `dynamodb`   | `DynamoDB.GetItem`              |
| S3 GetObject / PutObject           | `storage` / `s3`    | `S3.GetObject`                  |
| SQS SendMessage / ReceiveMessage   | `messaging` / `sqs` | `SQS.SendMessage`               |
| SNS Publish                        | `messaging` / `sns` | `SNS.Publish`                   |
| Secrets Manager GetSecretValue     | `external` / `aws`  | `SecretsManager.GetSecretValue` |
| HTTP/HTTPS outbound calls          | `external` / `http` | `GET https://api.example.com`   |

### Cold start visibility

Cold starts are tracked automatically. The `transaction.faas.coldstart: true` field is set on invocations where initialisation occurred. In the APM UI, cold starts show as a longer transaction duration. The load generator simulates ~8% cold start rate, matching real-world Lambda behaviour on low-traffic functions.

### Sampling

Lambda traces every invocation by default (100% sampling). For high-throughput functions this can be expensive. To reduce volume:

```bash
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=0.1   # 10% of invocations traced
```

---

## EMR Spark

EMR does not automatically instrument Spark applications. Your data engineering team needs to make two changes to the cluster configuration: a **bootstrap action** that downloads the agent, and **Spark configuration** that attaches it to the JVM.

### Step 1 — Create the bootstrap action script

Create the following shell script and upload it to an S3 bucket accessible by the EMR cluster.

**`s3://your-bucket/bootstrap/install-otel-agent.sh`:**

```bash
#!/bin/bash
set -euo pipefail

EDOT_VERSION="1.6.0"
INSTALL_DIR="/opt/edot"

echo "[OTel Bootstrap] Installing EDOT Java agent v${EDOT_VERSION}"
mkdir -p "${INSTALL_DIR}"

curl -fsSL \
  "https://github.com/elastic/elastic-otel-java/releases/download/v${EDOT_VERSION}/elastic-otel-javaagent.jar" \
  -o "${INSTALL_DIR}/elastic-otel-javaagent.jar"

echo "[OTel Bootstrap] Agent installed at ${INSTALL_DIR}/elastic-otel-javaagent.jar"
```

> **Alternative — ADOT Java agent:** If your organisation uses ADOT instead of EDOT, replace the download URL with:
> `https://github.com/aws-observability/aws-otel-java-instrumentation/releases/download/v1.32.2/aws-opentelemetry-agent.jar`

### Step 2 — Configure Spark to load the agent

The `-javaagent` JVM flag must be added to both the **driver** and **executor** JVM options. This can be done via `spark-defaults.conf` or passed as `--conf` flags at job submission.

**Via EMR cluster configuration (JSON — applies to all jobs on the cluster):**

```json
[
  {
    "Classification": "spark-defaults",
    "Properties": {
      "spark.driver.extraJavaOptions": "-javaagent:/opt/edot/elastic-otel-javaagent.jar",
      "spark.executor.extraJavaOptions": "-javaagent:/opt/edot/elastic-otel-javaagent.jar"
    }
  }
]
```

**Via spark-submit (per-job override):**

```bash
spark-submit \
  --conf spark.driver.extraJavaOptions="-javaagent:/opt/edot/elastic-otel-javaagent.jar" \
  --conf spark.executor.extraJavaOptions="-javaagent:/opt/edot/elastic-otel-javaagent.jar" \
  --conf spark.executorEnv.OTEL_SERVICE_NAME=etl-daily-orders \
  --conf spark.executorEnv.OTEL_EXPORTER_OTLP_ENDPOINT=https://your-apm-server:8200 \
  --conf spark.executorEnv.OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer <token>" \
  --conf spark.driverEnv.OTEL_SERVICE_NAME=etl-daily-orders \
  --conf spark.driverEnv.OTEL_EXPORTER_OTLP_ENDPOINT=https://your-apm-server:8200 \
  --conf spark.driverEnv.OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer <token>" \
  s3://your-bucket/jobs/etl-daily-orders.jar
```

### Step 3 — Set OTel environment variables

OTel configuration is passed via environment variables. For EMR, these are set per-role (`driverEnv` vs `executorEnv`):

| Variable                      | Value                                                  | Scope             |
| ----------------------------- | ------------------------------------------------------ | ----------------- |
| `OTEL_SERVICE_NAME`           | Your Spark app name, e.g. `etl-daily-orders`           | Driver + Executor |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `https://your-apm-server:8200`                         | Driver + Executor |
| `OTEL_EXPORTER_OTLP_HEADERS`  | `Authorization=Bearer <secret-token>`                  | Driver + Executor |
| `OTEL_RESOURCE_ATTRIBUTES`    | `deployment.environment=production,cloud.provider=aws` | Driver + Executor |
| `OTEL_TRACES_SAMPLER`         | `parentbased_traceidratio`                             | Driver + Executor |
| `OTEL_TRACES_SAMPLER_ARG`     | `0.1` (10%) — see sampling note below                  | Driver + Executor |

Add these to the `spark-defaults` classification:

```json
[
  {
    "Classification": "spark-defaults",
    "Properties": {
      "spark.driver.extraJavaOptions": "-javaagent:/opt/edot/elastic-otel-javaagent.jar",
      "spark.executor.extraJavaOptions": "-javaagent:/opt/edot/elastic-otel-javaagent.jar",
      "spark.driverEnv.OTEL_SERVICE_NAME": "etl-daily-orders",
      "spark.driverEnv.OTEL_EXPORTER_OTLP_ENDPOINT": "https://your-apm-server:8200",
      "spark.driverEnv.OTEL_EXPORTER_OTLP_HEADERS": "Authorization=Bearer abc123",
      "spark.driverEnv.OTEL_RESOURCE_ATTRIBUTES": "deployment.environment=production,cloud.provider=aws",
      "spark.driverEnv.OTEL_TRACES_SAMPLER": "parentbased_traceidratio",
      "spark.driverEnv.OTEL_TRACES_SAMPLER_ARG": "0.1",
      "spark.executorEnv.OTEL_SERVICE_NAME": "etl-daily-orders",
      "spark.executorEnv.OTEL_EXPORTER_OTLP_ENDPOINT": "https://your-apm-server:8200",
      "spark.executorEnv.OTEL_EXPORTER_OTLP_HEADERS": "Authorization=Bearer abc123",
      "spark.executorEnv.OTEL_RESOURCE_ATTRIBUTES": "deployment.environment=production,cloud.provider=aws",
      "spark.executorEnv.OTEL_TRACES_SAMPLER": "parentbased_traceidratio",
      "spark.executorEnv.OTEL_TRACES_SAMPLER_ARG": "0.1"
    }
  }
]
```

### Full cluster launch example (AWS CLI)

```bash
aws emr create-cluster \
  --name "my-etl-cluster" \
  --release-label emr-7.1.0 \
  --applications Name=Spark \
  --instance-type m5.xlarge \
  --instance-count 3 \
  --bootstrap-actions \
    Path=s3://your-bucket/bootstrap/install-otel-agent.sh,Name="Install EDOT OTel Agent" \
  --configurations file://emr-spark-otel-config.json \
  --use-default-roles
```

### Terraform

```hcl
resource "aws_emr_cluster" "my_cluster" {
  name          = "my-etl-cluster"
  release_label = "emr-7.1.0"
  applications  = ["Spark"]

  bootstrap_action {
    name = "Install EDOT OTel Agent"
    path = "s3://your-bucket/bootstrap/install-otel-agent.sh"
  }

  configurations_json = jsonencode([
    {
      Classification = "spark-defaults"
      Properties = {
        "spark.driver.extraJavaOptions"              = "-javaagent:/opt/edot/elastic-otel-javaagent.jar"
        "spark.executor.extraJavaOptions"            = "-javaagent:/opt/edot/elastic-otel-javaagent.jar"
        "spark.driverEnv.OTEL_SERVICE_NAME"          = "etl-daily-orders"
        "spark.driverEnv.OTEL_EXPORTER_OTLP_ENDPOINT" = "https://your-apm-server:8200"
        "spark.driverEnv.OTEL_EXPORTER_OTLP_HEADERS" = "Authorization=Bearer ${var.apm_secret_token}"
        "spark.executorEnv.OTEL_SERVICE_NAME"        = "etl-daily-orders"
        "spark.executorEnv.OTEL_EXPORTER_OTLP_ENDPOINT" = "https://your-apm-server:8200"
        "spark.executorEnv.OTEL_EXPORTER_OTLP_HEADERS" = "Authorization=Bearer ${var.apm_secret_token}"
        "spark.executorEnv.OTEL_TRACES_SAMPLER"      = "parentbased_traceidratio"
        "spark.executorEnv.OTEL_TRACES_SAMPLER_ARG"  = "0.1"
      }
    }
  ])
}
```

### CDK (Python)

```python
from aws_cdk import aws_emr as emr

cluster = emr.CfnCluster(
    self, "MyEMRCluster",
    name="my-etl-cluster",
    release_label="emr-7.1.0",
    applications=[emr.CfnCluster.ApplicationProperty(name="Spark")],
    bootstrap_actions=[
        emr.CfnCluster.BootstrapActionConfigProperty(
            name="Install EDOT OTel Agent",
            script_bootstrap_action=emr.CfnCluster.ScriptBootstrapActionConfigProperty(
                path="s3://your-bucket/bootstrap/install-otel-agent.sh"
            )
        )
    ],
    configurations=[
        emr.CfnCluster.ConfigurationProperty(
            classification="spark-defaults",
            configuration_properties={
                "spark.driver.extraJavaOptions":
                    "-javaagent:/opt/edot/elastic-otel-javaagent.jar",
                "spark.executor.extraJavaOptions":
                    "-javaagent:/opt/edot/elastic-otel-javaagent.jar",
                "spark.driverEnv.OTEL_SERVICE_NAME":           "etl-daily-orders",
                "spark.driverEnv.OTEL_EXPORTER_OTLP_ENDPOINT": "https://your-apm-server:8200",
                "spark.driverEnv.OTEL_EXPORTER_OTLP_HEADERS":  "Authorization=Bearer TOKEN",
                "spark.executorEnv.OTEL_SERVICE_NAME":          "etl-daily-orders",
                "spark.executorEnv.OTEL_EXPORTER_OTLP_ENDPOINT": "https://your-apm-server:8200",
                "spark.executorEnv.OTEL_EXPORTER_OTLP_HEADERS":  "Authorization=Bearer TOKEN",
                "spark.executorEnv.OTEL_TRACES_SAMPLER":        "parentbased_traceidratio",
                "spark.executorEnv.OTEL_TRACES_SAMPLER_ARG":    "0.1",
            }
        )
    ]
)
```

### What gets traced automatically

Once the agent is attached, the OTel Spark instrumentation library (bundled in the EDOT Java agent) captures the following automatically:

| Spark activity             | Span type                              | Attributes captured                                                     |
| -------------------------- | -------------------------------------- | ----------------------------------------------------------------------- |
| Spark Job execution        | `compute` / `spark` (root transaction) | Job ID, job name, duration, success/failure                             |
| Spark Stage                | `compute` / `spark` (child span)       | Stage ID, attempt, input records, output records, shuffle bytes written |
| SparkSQL query             | `db` / `spark_sql` (child span)        | SQL statement (truncated), execution plan hash, query duration          |
| JDBC reads (RDS, Redshift) | `db` / `postgresql` or `redshift`      | SQL statement, row count                                                |
| S3 reads/writes via Hadoop | `storage` / `s3`                       | Bucket, key prefix, bytes transferred                                   |

### Sampling for EMR — important

The `-javaagent` flag attaches to **every executor JVM**. On a cluster with 20 executors each running 4 tasks, a single Spark job can generate hundreds of spans. **Always configure sampling for EMR**, particularly for production clusters:

```bash
# 10% sampling — recommended starting point for ETL jobs
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=0.1

# 100% sampling — useful during initial setup to verify traces appear
OTEL_TRACES_SAMPLER=always_on

# No traces — useful for specific jobs where tracing is not needed
OTEL_TRACES_SAMPLER=always_off
```

**Driver-only tracing (lower volume alternative):** If executor-level task spans are not required, instrument only the driver by omitting `spark.executor.extraJavaOptions`. This captures job-level and stage-level transactions without per-task spans — sufficient for latency and failure detection in most cases.

---

## EMR Serverless

EMR Serverless uses the same EDOT Java agent but is configured differently — there is no bootstrap action. Instead, pass the agent as a job dependency and configure JVM options at job submission.

```bash
# Upload the agent to S3 first
aws s3 cp elastic-otel-javaagent.jar s3://your-bucket/deps/

# Submit the job with agent as a file dependency
aws emr-serverless start-job-run \
  --application-id <app-id> \
  --execution-role-arn <role-arn> \
  --job-driver '{
    "sparkSubmit": {
      "entryPoint": "s3://your-bucket/jobs/my-job.jar",
      "sparkSubmitParameters": "--conf spark.driver.extraJavaOptions=-javaagent:/tmp/elastic-otel-javaagent.jar --conf spark.executor.extraJavaOptions=-javaagent:/tmp/elastic-otel-javaagent.jar --conf spark.driverEnv.OTEL_SERVICE_NAME=my-job --conf spark.driverEnv.OTEL_EXPORTER_OTLP_ENDPOINT=https://your-apm-server:8200 --conf spark.driverEnv.OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer TOKEN"
    }
  }' \
  --configuration-overrides '{
    "monitoringConfiguration": {
      "s3MonitoringConfiguration": {
        "logUri": "s3://your-bucket/emr-logs/"
      }
    }
  }' \
  --tags '{}' \
  --execution-timeout-minutes 60
```

The `--files` parameter is not shown above — upload the jar to S3 and reference via `spark.files`:

```
--conf spark.files=s3://your-bucket/deps/elastic-otel-javaagent.jar
--conf spark.driver.extraJavaOptions=-javaagent:/tmp/elastic-otel-javaagent.jar
```

---

## Verifying traces in Kibana

After the first instrumented invocation or Spark job run:

1. **Kibana → Observability → APM → Services** — your function/app should appear with `service.name` matching `OTEL_SERVICE_NAME`
2. **Transactions tab** — shows individual Lambda invocations or Spark job executions with flame graph
3. **Dependencies** — shows downstream services (DynamoDB, S3, etc.) as a service map
4. **APM → Service Map** — visualises the full call graph across all instrumented services

Useful ES|QL queries for verifying data arrived:

```esql
FROM traces-apm-default
| WHERE service.name == "my-function-name"
| STATS count = COUNT(*), avg_duration = AVG(transaction.duration.us)
  BY transaction.name
| SORT count DESC
```

```esql
FROM traces-apm-default
| WHERE service.name == "etl-daily-orders"
| WHERE processor.event == "span"
| STATS count = COUNT(*) BY span.type, span.subtype
| SORT count DESC
```

---

## Troubleshooting

| Symptom                                          | Likely cause                              | Fix                                                                                |
| ------------------------------------------------ | ----------------------------------------- | ---------------------------------------------------------------------------------- |
| No services appear in APM UI                     | APM integration not installed             | Install via Fleet (see Prerequisites)                                              |
| Bulk writes return 400 mapping error             | Index template missing                    | Install APM integration first                                                      |
| Lambda traces appear but no child spans          | Wrong `AWS_LAMBDA_EXEC_WRAPPER` value     | Use `/opt/otel-handler` (EDOT) or `/opt/otel-proxy-handler` (ADOT)                 |
| EMR job runs but no traces appear                | Bootstrap action failed silently          | SSH to master node and check `/var/log/bootstrap-actions/`                         |
| EMR traces appear only for driver, not executors | `spark.executor.extraJavaOptions` not set | Add executor config to `spark-defaults` classification                             |
| Traces arrive but `service.name` is wrong        | `OTEL_SERVICE_NAME` not set on executors  | Set `spark.executorEnv.OTEL_SERVICE_NAME` explicitly                               |
| High volume of spans filling APM storage         | Sampling not configured on EMR            | Set `OTEL_TRACES_SAMPLER=parentbased_traceidratio` + `OTEL_TRACES_SAMPLER_ARG=0.1` |
| Authentication errors (401) from APM Server      | Secret token expired or incorrect         | Regenerate token in Fleet → APM integration settings                               |

---

## Version compatibility

| Component                | Minimum version                           |
| ------------------------ | ----------------------------------------- |
| Elastic Stack            | 8.6 (GA APM OTel support)                 |
| Elastic Cloud Serverless | All versions (OTel supported from launch) |
| EDOT Java agent          | 1.0.0                                     |
| ADOT Lambda layer        | 1.30.x                                    |
| EMR release              | 6.9.0 (Spark 3.3.x) or later              |
| EMR 7.x                  | 7.0.0+ (Spark 3.5.x) — recommended        |
| Java runtime (EMR)       | Java 11 minimum, Java 21 recommended      |

---

## API Gateway

API Gateway traces capture the full lifecycle of each inbound HTTP, WebSocket, or gRPC request — from the edge to your backend Lambda or VPC Link integration.

### Instrumentation path

```
Client → API Gateway → Lambda (EDOT/ADOT layer) → Elastic APM
```

API Gateway itself does not emit OTLP spans. The **Lambda function backing each route** must be instrumented (see Lambda section above). The EDOT/ADOT layer auto-generates an entry span for the API Gateway trigger with the correct `faas.trigger.type: "http"` attribute, and propagates the `traceparent` header downstream automatically.

For **WebSocket APIs**, instrument the `$connect`, `$disconnect`, and `$default` route handler Lambdas separately — each creates its own transaction.

### Enabling X-Ray-to-OTel passthrough (optional)

If API Gateway X-Ray tracing is enabled, the ADOT layer bridges X-Ray segments into OTel spans automatically. No additional configuration is needed beyond enabling X-Ray active tracing on the API stage:

**AWS Console:** API Gateway → your API → Stages → your stage → Logs/Tracing → Enable X-Ray Tracing

**AWS CLI:**

```bash
aws apigateway update-stage \
  --rest-api-id <api-id> \
  --stage-name <stage-name> \
  --patch-operations op=replace,path=/tracingEnabled,value=true
```

### What the generator simulates

The `apigateway` trace generator produces:

- One transaction per API request (type: `request`) with HTTP method, path, status code, and API stage
- One child Lambda-invoke span
- 1–3 downstream SDK spans (DynamoDB, S3, SQS) from the backing Lambda

Labels include `api_id`, `stage`, `api_type` (REST/HTTP/WebSocket), and `route`.

---

## ECS / Fargate

ECS traces instrument containerised microservices running on either EC2-backed clusters or Fargate. The instrumentation agent runs as a **sidecar container** alongside your application or is bundled directly into the application image.

### Instrumentation path

```
ECS Task (application container + EDOT sidecar)
  → OTLP gRPC → Elastic APM Server
    → traces-apm-default
```

### Step 1 — Add the EDOT/OTel Collector sidecar

Add a sidecar container to your ECS task definition that runs the OpenTelemetry Collector configured to forward to Elastic:

```json
{
  "name": "otel-collector",
  "image": "public.ecr.aws/aws-observability/aws-otel-collector:latest",
  "environment": [{ "name": "AOT_CONFIG_CONTENT", "value": "..." }],
  "portMappings": [{ "containerPort": 4317, "protocol": "tcp" }]
}
```

### Step 2 — Configure your application container

Set OTLP environment variables to point to the sidecar:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
OTEL_SERVICE_NAME=my-service
OTEL_RESOURCE_ATTRIBUTES=deployment.environment=production
```

For language-specific EDOT agents on ECS:

| Language | Agent image / package                              |
| -------- | -------------------------------------------------- |
| Node.js  | `@elastic/opentelemetry-node` npm package          |
| Python   | `elastic-opentelemetry` pip package                |
| Java     | `elastic-otel-javaagent.jar` via `-javaagent` flag |

### Task role IAM permissions

ECS tasks communicating with AWS services (DynamoDB, S3, SQS) need IAM task roles. OTel auto-instrumentation of AWS SDK calls captures these as child spans automatically.

```json
{
  "Effect": "Allow",
  "Action": ["dynamodb:GetItem", "dynamodb:PutItem", "s3:GetObject", "sqs:SendMessage"],
  "Resource": "*"
}
```

### What the generator simulates

The `ecs` trace generator produces:

- One transaction per HTTP request to the service
- 2–4 AWS SDK child spans (DynamoDB, S3, SQS, ElastiCache, Secrets Manager)
- All docs carry ECS-specific labels: `container_id`, `task_id` (full ARN), `cluster_name`, `task_definition`

---

## Step Functions

Step Functions orchestration traces span the entire workflow execution — each state (Lambda invocation, Wait, Choice, Parallel) appears as a child span under the root execution transaction.

### Instrumentation path

```
Step Functions execution
  → Each Lambda state: EDOT/ADOT layer generates spans
    → OTel Collector or APM Server
      → traces-apm-default
```

Step Functions does not emit OTel natively. Trace continuity is achieved by **passing the traceparent through the execution input** of each Lambda state:

```json
{
  "traceparent.$": "$.traceparent",
  "payload.$": "States.JsonMerge($.payload, $$.Execution.Input, false)"
}
```

Each Lambda then reads `event.traceparent` and passes it to the OTel SDK on startup:

```js
// Node.js Lambda handler
process.env.TRACEPARENT = event.traceparent;
```

### Alternative: X-Ray + ADOT bridge

If X-Ray is enabled on the state machine, the ADOT Lambda layer bridges X-Ray trace context into OTel automatically. Enable X-Ray on the state machine:

```bash
aws stepfunctions update-state-machine \
  --state-machine-arn <arn> \
  --tracing-configuration enabled=true
```

### What the generator simulates

The `stepfunctions` trace generator produces:

- One root transaction for the execution (type: `workflow`)
- One span per state: Lambda invocations, S3/DynamoDB operations, SageMaker endpoints, Bedrock calls
- Labels include `execution_arn`, `state_machine_arn`, `execution_status` (SUCCEEDED/FAILED), and per-span `state_type` and `lambda_function_name`

---

## EKS / Kubernetes

EKS traces instrument workloads running in Kubernetes pods. The recommended approach uses the **EDOT Kubernetes Operator** to auto-inject the OTel agent into pods without any Dockerfile changes.

### Instrumentation path

```
Pod (application) ← EDOT Operator injects agent via init container
  → OTel Collector DaemonSet (per node)
    → Elastic APM Server
      → traces-apm-default
```

### Step 1 — Install the EDOT Operator

```bash
helm repo add open-telemetry https://open-telemetry.github.io/opentelemetry-helm-charts
helm install opentelemetry-operator open-telemetry/opentelemetry-operator \
  --set "manager.collectorImage.repository=otel/opentelemetry-collector-contrib"
```

### Step 2 — Deploy the OTel Collector DaemonSet

```yaml
apiVersion: opentelemetry.io/v1alpha1
kind: OpenTelemetryCollector
metadata:
  name: elastic-collector
spec:
  mode: daemonset
  config: |
    exporters:
      otlp/elastic:
        endpoint: "https://<apm-server>:8200"
        headers:
          Authorization: "Bearer <secret-token>"
    service:
      pipelines:
        traces:
          exporters: [otlp/elastic]
```

### Step 3 — Annotate namespaces for auto-injection

```bash
kubectl annotate namespace <your-namespace> \
  instrumentation.opentelemetry.io/inject-java=true
```

Supported annotation values: `inject-java`, `inject-nodejs`, `inject-python`, `inject-dotnet`.

### What the generator simulates

The `eks` trace generator produces:

- HTTP request transactions for web services (Java, Python, Node.js)
- Kafka consumer transactions for event-driven services (type: `messaging`)
- AWS SDK child spans (DynamoDB, S3, SQS, ElastiCache, SageMaker, Bedrock)
- K8s labels on all docs: `k8s_namespace`, `k8s_pod_name`, `k8s_deployment`, `k8s_node`

---

## SQS Consumer

SQS consumer traces link the processing of each message batch back to the producer that sent the message — the `traceparent` is embedded as an SQS message attribute.

### Instrumentation path

```
Producer (Lambda/ECS) → SQS message (traceparent attribute)
  → Consumer Lambda/ECS (EDOT/ADOT) reads traceparent
    → Creates child transaction linked to producer trace
      → traces-apm-default
```

### Producer: sending traceparent

When sending a message, include the current W3C trace context as a message attribute:

```python
# Python with EDOT / opentelemetry-sdk
from opentelemetry import trace
from opentelemetry.propagate import inject

carrier = {}
inject(carrier)  # populates {"traceparent": "00-<trace-id>-<span-id>-01"}

sqs.send_message(
    QueueUrl=queue_url,
    MessageBody=json.dumps(payload),
    MessageAttributes={
        "traceparent": {
            "DataType": "String",
            "StringValue": carrier["traceparent"],
        }
    },
)
```

### Consumer: extracting traceparent

The EDOT/ADOT Lambda layer extracts `traceparent` from SQS message attributes automatically. For ECS consumers, use the OTel SDK propagator:

```python
from opentelemetry.propagate import extract

context = extract(record["messageAttributes"])
with tracer.start_as_current_span("process-message", context=context):
    process(record["body"])
```

### What the generator simulates

The `sqs` trace generator produces:

- One transaction per batch poll (type: `messaging`, name `"{queue} process"`)
- Processing spans for each message
- Labels: `queue_name`, `queue_url`, `message_count`, `approximate_first_receive_delay_seconds`

---

## Kinesis Consumer

Kinesis consumer traces span the processing of record batches from a shard. Because Kinesis does not support arbitrary message metadata, the `traceparent` is embedded in the **record data payload** by convention.

### Instrumentation path

```
Producer → Kinesis record (traceparent in payload)
  → Consumer Lambda/ECS reads shard records
    → Extracts traceparent from each record
      → Creates child transaction
        → traces-apm-default
```

### Producer: embedding traceparent in record data

```python
from opentelemetry.propagate import inject
import json, base64

carrier = {}
inject(carrier)

record_data = {
    "payload": your_data,
    "_otel": carrier,  # embed trace context
}

kinesis.put_record(
    StreamName=stream_name,
    Data=json.dumps(record_data).encode(),
    PartitionKey=partition_key,
)
```

### Consumer: extracting context

```python
from opentelemetry.propagate import extract
import json, base64

for record in event["Records"]:
    data = json.loads(base64.b64decode(record["kinesis"]["data"]))
    context = extract(data.get("_otel", {}))
    with tracer.start_as_current_span("process-record", context=context):
        process(data["payload"])
```

### What the generator simulates

The `kinesis` trace generator produces:

- One transaction per shard poll covering a batch of records
- Labels: `stream_name`, `stream_arn`, `shard_id`, `sequence_number_range`, `record_count`, `iterator_age_ms`

---

## DynamoDB

DynamoDB traces are generated by services (Lambda, ECS, EKS) that make DynamoDB API calls — the spans appear as child spans under the calling service's transaction. The `dynamodb` trace generator simulates a **dedicated DynamoDB-heavy service** (session store, leaderboard, shopping cart, etc.) where DynamoDB is the primary integration.

### Instrumentation

No DynamoDB-specific configuration is needed beyond instrumenting the calling service (Lambda, ECS, EKS). The OTel AWS SDK instrumentation automatically wraps all `@aws-sdk/client-dynamodb` / `boto3.dynamodb` calls and emits:

- `span.type: db`
- `span.subtype: dynamodb`
- `span.db.statement`: operation + table name
- `span.destination.service.resource: dynamodb`

### What the generator simulates

The `dynamodb` trace generator produces:

- One root transaction representing a service request that drives DynamoDB traffic
- 3–7 DynamoDB operation spans (GetItem, PutItem, Query, UpdateItem, BatchGetItem, Scan)
- Labels: `table_name`, `consumed_read_capacity_units`, `consumed_write_capacity_units`

---

## RDS / Aurora

RDS traces capture individual SQL queries as child spans under the service transaction. Instrumentation uses the OTel database client libraries which wrap your database driver.

### Instrumentation

| Language | Library                                          | Auto-instrumented |
| -------- | ------------------------------------------------ | ----------------- |
| Node.js  | `@opentelemetry/instrumentation-pg` (PostgreSQL) | Yes, with EDOT    |
| Python   | `opentelemetry-instrumentation-psycopg2`         | Yes, with EDOT    |
| Java     | EDOT Java agent — JDBC auto-instrumentation      | Yes, automatic    |

Each SQL statement generates a span with:

- `span.type: db`
- `span.subtype: postgresql` or `mysql`
- `span.db.statement`: the SQL query text
- `span.destination.service.resource: postgresql`

### Connection string requirements

Ensure the OTel instrumentation can see the database hostname to populate `span.destination.address`. This is derived automatically from the connection string when using the standard JDBC URL format:

```
jdbc:postgresql://<cluster>.cluster-<id>.<region>.rds.amazonaws.com:5432/<database>
```

### What the generator simulates

The `rds` trace generator produces:

- One root transaction per service operation
- BEGIN/COMMIT control spans for transactional services (1–5ms)
- 3–8 SQL query spans covering SELECT, INSERT, UPDATE, DELETE
- Analytics/reporting services have intentionally long durations (5–60 seconds) to trigger `apm-slow-span-by-type` ML anomaly detection
- Labels: `db_name`, `db_host` (RDS endpoint format)

---

## Amazon Bedrock

Bedrock traces use the **GenAI OTel semantic conventions** to capture LLM invocations, RAG retrieval steps, and guardrail evaluations as structured spans.

### Instrumentation path

```
Application (Lambda/ECS/EKS)
  + EDOT agent with GenAI instrumentation
    → Bedrock InvokeModel API call
      → GenAI span with token usage, model ID, prompt cost
        → traces-apm-default
```

### Step 1 — Enable GenAI instrumentation

The EDOT agents include Bedrock GenAI instrumentation. Enable it with the environment variable:

```bash
OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true   # optional: captures prompt/response text
```

For Node.js applications not using the Lambda layer:

```bash
npm install @elastic/opentelemetry-node @opentelemetry/instrumentation-aws-sdk
```

### Step 2 — Configure Bedrock invocations normally

No changes to your Bedrock API calls are needed. The OTel instrumentation wraps `InvokeModel` and `InvokeModelWithResponseStream` automatically:

```python
import boto3
bedrock = boto3.client("bedrock-runtime", region_name="us-east-1")

response = bedrock.invoke_model(
    modelId="anthropic.claude-3-5-sonnet-20241022-v2:0",
    body=json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 1024,
        "messages": [{"role": "user", "content": "Explain OTel in one sentence."}],
    }),
)
```

The span carries:

- `gen_ai.system: aws.bedrock`
- `gen_ai.request.model`: the model ID
- `gen_ai.usage.input_tokens` / `gen_ai.usage.output_tokens`
- `gen_ai.response.finish_reasons`

### RAG patterns

For RAG applications, instrument the retrieval step separately to see the full pipeline:

```
Transaction: rag-query-handler
  ├── Span: knowledgebase.retrieve (type: db, subtype: bedrock)
  └── Span: bedrock.InvokeModel (type: gen_ai)
```

### What the generator simulates

The `bedrock` trace generator produces:

- One root transaction per application request (type: `gen_ai`)
- For RAG patterns: a knowledge base retrieval span + a model invocation span
- For guardrail patterns: model invocation + guardrail evaluation span
- GenAI labels on the transaction and invocation spans: `gen_ai_system`, `gen_ai_request_model`, `gen_ai_usage_input_tokens`, `gen_ai_usage_output_tokens`
- Errors simulate `ThrottlingException` and `ModelTimeoutException`

---

## Multi-Service Workflow Patterns

The load generator includes eight pre-built workflow patterns that produce correlated distributed traces — all documents share a single `trace.id`, so the APM flame graph renders the complete end-to-end call chain across services. Each pattern is selectable independently in the UI.

---

### E-commerce Order Flow

**Pattern:** API Gateway → Lambda (order-processor) → DynamoDB + SQS → Lambda (notification-sender) → SES

```
Client HTTP POST /orders
  └── API Gateway (api-orders)             [transaction: request]
       └── Lambda invoke span              [span: external/lambda]
            └── order-processor Lambda     [transaction: lambda]
                 ├── DynamoDB.PutItem      [span: db/dynamodb]
                 └── SQS.SendMessage       [span: messaging/sqs]
                      └── notification-sender Lambda  [transaction: lambda]
                           └── SES.SendEmail          [span: messaging/ses]
```

**What to instrument:**

| Service                    | Method                                                            |
| -------------------------- | ----------------------------------------------------------------- |
| API Gateway                | Lambda Powertools Tracer or ADOT X-Ray bridge (enabled per stage) |
| order-processor Lambda     | EDOT Python layer — auto-instruments DynamoDB and SQS SDK calls   |
| notification-sender Lambda | EDOT Python layer — auto-instruments SES SDK calls                |

**Trace propagation:** The EDOT/ADOT Lambda layer reads `traceparent` from the Lambda event automatically when triggered by API Gateway or SQS. No code changes are required.

**SQS propagation detail:** The SQS `SendMessage` span embeds `traceparent` as a message attribute. When `notification-sender` is triggered by the queue, the EDOT layer extracts it and links the downstream transaction to the same `trace.id`.

---

### ML Inference Pipeline

**Pattern:** API Gateway → Lambda (inference-router) → S3 (fetch input) + Bedrock InvokeModel → DynamoDB (cache result)

```
Client HTTP POST /inference
  └── API Gateway (api-ml)                 [transaction: request]
       └── Lambda invoke span              [span: external/lambda]
            └── inference-router Lambda   [transaction: lambda]
                 ├── S3.GetObject          [span: storage/s3]
                 ├── Bedrock.InvokeModel   [span: gen_ai/bedrock]
                 └── DynamoDB.PutItem      [span: db/dynamodb]
```

**What to instrument:**

| Service                 | Method                                                               |
| ----------------------- | -------------------------------------------------------------------- |
| API Gateway             | Lambda Powertools Tracer or ADOT X-Ray bridge                        |
| inference-router Lambda | EDOT Python layer — auto-instruments S3, Bedrock, DynamoDB SDK calls |

**GenAI span fields:** The Bedrock span carries `gen_ai.system`, `gen_ai.request.model`, `gen_ai.usage.input_tokens`, and `gen_ai.usage.output_tokens` per the OTel GenAI semantic conventions.

**Caching pattern note:** If the DynamoDB cache contains a result, the Bedrock span is skipped — this is visible in the APM flame graph as a short transaction with only S3 and DynamoDB spans.

---

### Data Ingestion Pipeline

**Pattern:** Kinesis (shard consumer) → Lambda (stream-processor) → S3 (archive) + Glue (trigger ETL) → EMR Spark (ETL job stages)

```
Kinesis shard poll                         [transaction: messaging]
  └── stream-processor Lambda              [transaction: lambda]
       ├── S3.PutObject (archive raw)      [span: storage/s3]
       └── Glue.StartJobRun               [span: external/glue]
            └── etl-job (EMR Spark)        [transaction: spark_job]
                 ├── Stage 0: Read Kinesis [span: messaging/kinesis]
                 ├── Stage 1: Parse & Validate [span: compute/spark]
                 └── Stage 2: Write to S3  [span: storage/s3]
```

**What to instrument:**

| Service                 | Method                                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| stream-processor Lambda | EDOT Node.js layer — auto-instruments Kinesis, S3, Glue SDK calls                                              |
| EMR Spark job           | EDOT Java agent via bootstrap action (`-javaagent:/opt/aws/otel/elastic-otel-javaagent.jar`) — see EMR section |

**Trace continuity — Glue → EMR:** Glue does not natively propagate `traceparent` to the Spark executor JVMs. To maintain trace continuity:

1. Pass the `traceparent` as a Spark configuration property in `StartJobRun`:

   ```python
   glue.start_job_run(
       JobName=job_name,
       Arguments={
           "--conf": f"spark.opentelemetry.traceparent={carrier['traceparent']}",
       },
   )
   ```

2. Read it in the Spark driver initialisation:
   ```java
   String traceparent = spark.conf().get("spark.opentelemetry.traceparent", null);
   if (traceparent != null) {
       W3CTraceContextPropagator.getInstance().extract(
           Context.current(), Collections.singletonMap("traceparent", traceparent), ...
       );
   }
   ```

---

### Step Functions Orchestration

**Pattern:** EventBridge → Step Functions execution → Lambda (validate) → DynamoDB → Lambda (payment) → RDS → Lambda (notification) → SES

```
EventBridge rule fires                    [transaction: messaging]
  └── Step Functions execution           [transaction: workflow]
       ├── state: ValidateOrder           [span: workflow/stepfunctions]
       │    └── order-validator Lambda    [transaction: lambda]
       │         └── DynamoDB.GetItem    [span: db/dynamodb]
       ├── state: ProcessPayment         [span: workflow/stepfunctions]
       │    └── payment-processor Lambda [transaction: lambda]
       │         └── PostgreSQL INSERT   [span: db/postgresql]
       └── state: SendConfirmation       [span: workflow/stepfunctions]
            └── notification-sender Lambda [transaction: lambda]
                 └── SES.SendEmail       [span: messaging/ses]
```

**What to instrument:**

| Service                    | Method                                                                 |
| -------------------------- | ---------------------------------------------------------------------- |
| EventBridge rule target    | Lambda Powertools Tracer — generates root transaction                  |
| Step Functions             | Enable X-Ray tracing on the state machine (bridges into OTel via ADOT) |
| order-validator Lambda     | EDOT Python layer                                                      |
| payment-processor Lambda   | EDOT Java layer — auto-instruments PostgreSQL JDBC                     |
| notification-sender Lambda | EDOT Python layer                                                      |

**X-Ray → OTel bridge for Step Functions:**

```bash
aws stepfunctions update-state-machine \
  --state-machine-arn <arn> \
  --tracing-configuration enabled=true
```

The ADOT Lambda layer on each invoked Lambda will pick up the X-Ray trace context and convert it to OTel `traceparent` automatically.

**Passing traceparent through state input (alternative):**

```json
{
  "Comment": "Pass trace context through execution input",
  "StartAt": "ValidateOrder",
  "States": {
    "ValidateOrder": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:...:function:order-validator",
      "Parameters": {
        "traceparent.$": "$$.Execution.Input.traceparent",
        "payload.$": "$.payload"
      }
    }
  }
}
```

---

## Related documentation

| Doc                                                                                                | Description                             |
| -------------------------------------------------------------------------------------------------- | --------------------------------------- |
| [Elastic EDOT Java](https://www.elastic.co/docs/reference/opentelemetry/edot-java)                 | Full EDOT Java agent reference          |
| [Elastic EDOT Lambda layers](https://www.elastic.co/docs/reference/opentelemetry/edot-lambda)      | Layer ARNs for all regions and runtimes |
| [AWS ADOT Lambda layers](https://aws-otel.github.io/docs/getting-started/lambda)                   | AWS-managed OTel Lambda layers          |
| [EDOT Kubernetes Operator](https://www.elastic.co/docs/reference/opentelemetry/edot-collector/k8s) | Auto-inject OTel agents into pods       |
| [OTel AWS SDK instrumentation](https://opentelemetry.io/docs/zero-code/js/aws-sdk/)                | Auto-instrument AWS SDK calls           |
| [OTel GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/)             | GenAI span attribute reference          |
| [OTel Semantic Conventions — FaaS](https://opentelemetry.io/docs/specs/semconv/faas/faas-spans/)   | Lambda span attribute reference         |
| [OTel Semantic Conventions — Spark](https://opentelemetry.io/docs/specs/semconv/database/spark/)   | Spark span attribute reference          |
| [OTel Semantic Conventions — DB](https://opentelemetry.io/docs/specs/semconv/database/)            | Database span attribute reference       |
| [OTel Semantic Conventions — Messaging](https://opentelemetry.io/docs/specs/semconv/messaging/)    | SQS/Kinesis span attribute reference    |
| [README.md](../README.md)                                                                          | Cloud Loadgen for Elastic overview      |
