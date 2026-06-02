# CloudWatch ingestion: index / data stream routing

> **Last updated:** 2026-03-17 (v8.0)

When you ingest logs **from Amazon CloudWatch** (e.g. Elastic Agent with the AWS integration, or a Lambda/Firehose that forwards CloudWatch log events to Elastic), **CloudWatch does not send an index name**. It only provides:

- **Log group name** (e.g. `/aws-glue/jobs/output`, `/aws/sagemaker/...`)
- **Log stream name**
- **Log events** (message, timestamp)

So the **ingestion path** (Fleet integration, Lambda, Firehose, or whatever writes to Elasticsearch) must **set the target index or data stream** for each document. If it doesn’t, everything typically lands in a single default (e.g. `logs-aws.cloudwatch` or the integration’s default dataset).

To get Glue and SageMaker logs into the **same indices** the load generator uses when you “Ship” from the UI, you need to route by log group when sending to Elastic.

---

## Target indices (align with load generator)

| Source (CloudWatch log group) | Target index (logs)  | Target data_stream.dataset |
| ----------------------------- | -------------------- | -------------------------- |
| Glue job logs                 | `logs-aws.glue`      | `aws.glue`                 |
| SageMaker logs                | `logs-aws.sagemaker` | `aws.sagemaker`            |

_(If you use a different index prefix, replace `logs-aws` with your prefix.)_

---

## Option 1: Elastic Agent / Fleet — AWS integration

The Elastic **AWS integration** (CloudWatch Logs input) usually sends to a **single** data stream (e.g. `logs-aws.cloudwatch`) unless you configure otherwise. To get **per-service indices** like `logs-aws.glue` and `logs-aws.sagemaker`:

- Check the integration’s **“Log group”** / **“Dataset”** (or similar) options. Some integrations let you add **multiple inputs** (one per log group) and set a **dataset** or **index** per input.
- If your version supports it: add one input for Glue log groups with dataset `aws.glue`, and one for SageMaker log groups with dataset `aws.sagemaker`. The integration will then send to the data streams that resolve to `logs-aws.glue` and `logs-aws.sagemaker` when using the standard `logs-aws.*` index template.

If the integration does **not** support per–log-group dataset/index, use **Option 2** or **Option 3**.

---

## Option 2: Ingest pipeline (if the integration sends log group in the document)

If the ingestion path sends each event to a **single** index (e.g. `logs-aws.cloudwatch`) but includes the **log group name** in the document (e.g. `log.file.path`, `aws.log.group`, or a custom field), you **cannot** change the index from inside an ingest pipeline (the index is fixed at bulk request time). So you must either:

- Use **Option 1** (different dataset per log group in the integration), or
- Use **Option 3** (custom sender that sets `_index` per document).

If you only need to **enrich** documents (e.g. set `event.dataset` or a custom field from the log group) for search/filtering, you can use an ingest pipeline that sets a field from the log group; the document will still live in whatever index the client chose.

---

## Option 3: Custom sender (Lambda, Firehose, etc.) — set index per document

When you control the code that reads from CloudWatch and writes to Elastic (e.g. Lambda triggered by a CloudWatch Logs subscription, or Kinesis Firehose), **set the target index in the bulk request** using the log group name.

Example mapping logic (pseudocode) for the **create** action of each bulk item:

```text
log_group = event.logGroup  # or event["logGroup"] from CloudWatch subscription

if "/aws-glue/" in log_group or "glue" in log_group.lower():
  index = "logs-aws.glue"
elif "sagemaker" in log_group.lower():
  index = "logs-aws.sagemaker"
else:
  index = "logs-aws.cloudwatch"   # or your default

# In the bulk NDJSON, for each document:
# {"create": {"_index": index}}
# { ... document ... }
```

Use the **same index names** and (if you set it) **data_stream.dataset** as in the table above so that CloudWatch-sourced Glue/SageMaker logs land in the same indices as the load generator.

---

## Glue and SageMaker log group names (reference)

Typical CloudWatch log groups for these services:

| Service       | Typical log group(s)                                                                                                                |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Glue**      | `/aws-glue/jobs/output`, `/aws-glue/jobs/error`, or custom prefix (e.g. `my-prefix/aws-glue/jobs/output`)                           |
| **SageMaker** | `/aws/sagemaker/NotebookInstances/...`, `/aws/sagemaker/TrainingJobs/...`, `/aws/sagemaker/Endpoints/...`, or Studio-related groups |

Use these (or your actual log group names) in the routing logic so that Glue → `logs-aws.glue` and SageMaker → `logs-aws.sagemaker`.

---

## Summary

- **CloudWatch does not set an index.** Whatever sends CloudWatch logs to Elastic must set it.
- To get Glue and SageMaker into **logs-aws.glue** and **logs-aws.sagemaker**: either configure the AWS integration with a dataset (or index) per log group, or use a custom sender that sets `_index` (and optionally `data_stream.dataset`) from the log group name as in Option 3.

---

**Full setup:** For a step-by-step guide that covers AWS (Glue/SageMaker logging, IAM) and Elastic (default CloudWatch or Custom Logs integration, ingest pipelines), see **[GUIDE-CLOUDWATCH-GLUE-SAGEMAKER-ELASTIC.md](GUIDE-CLOUDWATCH-GLUE-SAGEMAKER-ELASTIC.md)**.

---

## Option 4: Fluent Bit — ECS FireLens or EKS DaemonSet

[AWS FireLens](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/using_firelens.html) (ECS) and a Fluent Bit DaemonSet (EKS) are common alternatives to the CloudWatch Logs agent when the destination is Elasticsearch directly, without an intermediate CloudWatch log group.

### How it routes

Fluent Bit's **Elasticsearch** output plugin sets `_index` (and optionally `_type`) on each document at ship time — equivalent to Option 3 but without a Lambda in the middle:

```ini
[OUTPUT]
    Name            es
    Match           *
    Host            <elasticsearch-host>
    Port            443
    TLS             On
    HTTP_User       elastic
    HTTP_Passwd     <api-key>
    Index           logs-aws.ecs
    # Per-service routing via tag matching:
    # Match  ecs.fargate.*  → logs-aws.fargate
    # Match  eks.*          → logs-aws.eks
    # Match  lambda.*       → logs-aws.lambda
    Suppress_Type_Name On
    Replace_Dots    On
```

Set `data_stream.dataset` on each document to match the load generator's `event.dataset` value:

| Container platform | Recommended index | `data_stream.dataset` |
|---|---|---|
| ECS (standard tasks) | `logs-aws.ecs` | `aws.ecs` |
| ECS Fargate | `logs-aws.fargate` | `aws.fargate` |
| EKS pods | `logs-aws.eks` | `aws.eks` |
| Lambda (Fluent Bit layer) | `logs-aws.lambda_logs` | `aws.lambda_logs` |

### Simulating Fluent Bit in the load generator

Select **Fluent Bit** as the ingestion source override on the Start page. The generator will set:

- `agent.type: "fluent-bit"` (version `3.3.4` — the current AWS-maintained image)
- `input.type: "logfile"`
- `aws.cloudwatch.log_group` — preserved from the service's CloudWatch log group template (FireLens passes this through the log record metadata)

This produces documents that land in the same data streams as real Fluent Bit output, so the same dashboards, ML jobs, and detection rules apply.

---

## Cross-account aggregation with AWS OAM

[AWS Observability Access Manager (OAM)](https://docs.aws.amazon.com/OAM/latest/APIReference/Welcome.html) lets **source accounts** share CloudWatch metrics, logs, and X-Ray traces with a central **monitoring account** without replicating data to S3 first. The Elastic Agent in the central monitoring account can then poll all linked accounts' CloudWatch log groups and metrics APIs from a single integration.

### How it maps to this project

The load generator ships documents with `cloud.account.id` drawn from a 12-account pool that mirrors a typical AWS Organization:

| Account name | Purpose | OAM role |
|---|---|---|
| `globex-production` | Production workloads | Source |
| `globex-staging` | Pre-prod | Source |
| `globex-development` | Dev/test | Source |
| `globex-security-tooling` | GuardDuty, Security Hub aggregation | Monitoring |
| `globex-shared-services` | Transit Gateway, DNS, DirectConnect | Source |
| `globex-log-archive` | Centralised S3 log archive | Monitoring |
| `globex-networking` | VPC, NAT, TGW | Source |
| `globex-identity` | IAM Identity Center, SSO | Source |
| `globex-payments-prod` | Payments (isolated for PCI) | Source |
| `globex-data-platform` | EMR, Glue, Athena | Source |
| `globex-ml-platform` | SageMaker, Bedrock | Source |
| `globex-sandbox` | Experimentation | Source |

When using OAM in a real environment:
1. Deploy the Elastic Agent into `globex-security-tooling` (or `globex-log-archive`).
2. Create an OAM sink in the monitoring account; attach source policies to the source accounts.
3. Configure one AWS integration in Fleet pointing at the monitoring account — it will see all source accounts' CloudWatch log groups and CloudWatch metrics.
4. The `cloud.account.id` field in Elastic will reflect each source account, matching the load generator's multi-account document pool exactly.

### NIS2 / DORA retention mapping with OAM + S3

OAM does not move logs to S3 — it shares them in-place. For compliance retention:

| Tier | AWS path | Elastic path |
|---|---|---|
| Standard (3 months) | CloudWatch retention policy | Hot / warm ILM tier |
| NIS2 (18 months) | S3 lifecycle → Standard-IA | Cold ILM tier (searchable snapshots) |
| DORA (5 years) | S3 Glacier / Deep Archive | Frozen ILM tier (searchable snapshots) |

The Elastic data stream ILM policies installed by the load generator use a 30-day hot phase. Extend the cold/frozen phases and attach a snapshot repository backed by the customer's S3 Glacier bucket to cover NIS2 and DORA without changing the ingestion path.
