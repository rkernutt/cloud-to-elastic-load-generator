# Step-by-step: Ingest Glue and SageMaker logs from CloudWatch into Elastic

This guide walks you through **AWS** and **Elastic** setup so that **AWS Glue** and **Amazon SageMaker** logs from CloudWatch reach Elastic and land in the correct indices (`logs-aws.glue`, `logs-aws.sagemaker`) with optional parsing of JSON in the `message` field.

You can use either the **default Elastic AWS CloudWatch integration** or the **Elastic AWS Custom Logs integration**. Both use the Elastic Agent and read from CloudWatch Logs; the steps below cover both and call out differences where they exist.

---

## Overview

| Step | Where   | What                                                                                                                                              |
| ---- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–2  | AWS     | Enable Glue and SageMaker logging to CloudWatch; note log group names                                                                             |
| 3    | AWS     | IAM role (or user) for the Elastic Agent to read CloudWatch Logs                                                                                  |
| 4–5  | Elastic | Add Glue and SageMaker log groups in the AWS integration (or Custom Logs) and set dataset so indices are `logs-aws.glue` and `logs-aws.sagemaker` |
| 6    | Elastic | (Optional) Create index templates for `logs-aws.glue` and `logs-aws.sagemaker` if they don’t exist                                                |
| 7–8  | Elastic | Create and attach ingest pipelines to parse JSON from `message` into `glue.parsed` and `sagemaker.parsed`                                         |
| 9    | Both    | Verify end-to-end                                                                                                                                 |

---

## Part 1 — AWS

### Step 1: Enable Glue job logging to CloudWatch

1. In **AWS Glue**:
   - Open **AWS Glue console** → **ETL jobs** → **Jobs** (or **Job runs**).
   - Create a new job or edit an existing one.
2. Enable **Continuous logging** (and optionally **Job metrics** for CloudWatch metrics):
   - In the job configuration, go to **Advanced properties** (or **Job details** → **Advanced**).
   - Under **Monitoring**, enable **Continuous logging**.
   - Optionally set **Custom log group prefix** if you use one (e.g. `my-prefix/aws-glue/jobs`). If you leave it default, Glue uses the standard log groups below.
3. Note the **CloudWatch log groups** Glue will write to:
   - **Default (no custom prefix):**
     - `/aws-glue/jobs/output` — driver stdout and user logs.
     - `/aws-glue/jobs/error` — driver stderr and system logs.
   - **With custom prefix** (e.g. `my-prefix`):  
     `my-prefix/aws-glue/jobs/output`, `my-prefix/aws-glue/jobs/error`.
4. Run the job at least once so that the log groups exist in CloudWatch (they are created on first run).

**Reference:** [Logging for AWS Glue jobs](https://docs.aws.amazon.com/glue/latest/dg/monitor-continuous-logging.html)

---

### Step 2: Enable SageMaker logging to CloudWatch

SageMaker writes to CloudWatch depending on the feature (Training, Notebooks, Endpoints, Studio). Enable logging for what you use and note the log groups.

1. **Training / Processing / Endpoints**
   - When creating or updating a **training job**, **processing job**, or **endpoint**, enable **CloudWatch logs** in the job/endpoint configuration.
   - Typical log groups:
     - Training: `/aws/sagemaker/TrainingJobs`
     - Processing: `/aws/sagemaker/ProcessingJobs`
     - Endpoints: `/aws/sagemaker/Endpoints`
2. **Notebook instances**
   - In **SageMaker** → **Notebook** → **Notebook instances** → your instance → **Additional configuration** (or edit): enable **CloudWatch logs**.
   - Log group is often `/aws/sagemaker/NotebookInstances`.
3. **SageMaker Studio (JupyterLab, etc.)**
   - Studio apps write to log groups under `/aws/sagemaker/` (e.g. by domain or app type). Check **CloudWatch** → **Log groups** and filter by `sagemaker` to see your actual groups.

Write down the **exact log group names** you want to ingest (e.g. `/aws-glue/jobs/output`, `/aws-glue/jobs/error`, `/aws/sagemaker/TrainingJobs`). You will need them in Elastic when adding the integration inputs.

**Reference:** [Monitor Amazon SageMaker with CloudWatch](https://docs.aws.amazon.com/sagemaker/latest/dg/monitoring-cloudwatch.html)

---

### Step 3: IAM permissions for the Elastic Agent (CloudWatch Logs)

The Elastic Agent (running in AWS or elsewhere) needs permission to read from the Glue and SageMaker log groups. Two common patterns:

**Option A — IAM role (recommended if the Agent runs on EC2/ECS/Lambda in AWS)**

1. Create an IAM role (or use an existing one) that the Agent (or the integration’s polling mechanism) will assume.
2. Attach a policy that allows reading the relevant log groups and listing log streams. Example (replace `REGION` and `ACCOUNT_ID`; restrict `Resource` to your Glue/SageMaker log groups if you prefer):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:DescribeLogGroups",
        "logs:DescribeLogStreams",
        "logs:GetLogEvents",
        "logs:GetLogRecordFields",
        "logs:GetQueryResults"
      ],
      "Resource": [
        "arn:aws:logs:REGION:ACCOUNT_ID:log-group:/aws-glue/*",
        "arn:aws:logs:REGION:ACCOUNT_ID:log-group:/aws/sagemaker/*"
      ]
    }
  ]
}
```

3. If the integration uses **log group filtering** or **subscription filters**, ensure the role also has `logs:PutSubscriptionFilter` and `logs:DeleteSubscriptionFilter` on those log groups if your setup uses subscription-based delivery.

**Option B — IAM user (e.g. for Agent running outside AWS)**

1. Create an IAM user (or use an existing one) for the Elastic AWS integration.
2. Attach the same permissions as above (e.g. via a custom policy on the user).
3. Create an **access key** and store the key ID and secret in a secure place; you will enter them in Kibana when configuring the AWS integration.

**Reference:** [Elastic: Add an AWS integration](https://www.elastic.co/guide/en/observability/current/add-aws-integration.html) (or your Elastic version’s equivalent) for the exact permissions your integration expects.

---

## Part 2 — Elastic

### Step 4: Add the AWS integration and Glue / SageMaker log groups

1. In **Kibana**, go to **Fleet** (or **Integrations** → **Integrations**).
2. If you haven’t already, add the **AWS** integration (or **Elastic Agent** policy that uses AWS):
   - Search for **“AWS”** or **“CloudWatch”**.
   - Install **Elastic Agent** and the **AWS** integration (or **AWS Custom Logs** if you prefer that).
3. Open the **AWS** integration (or the policy that uses it) and go to the **Logs** (or **CloudWatch Logs**) configuration.
4. Add **separate inputs** for Glue and SageMaker so you can set a **dataset** per service (this is what makes indices `logs-aws.glue` and `logs-aws.sagemaker`):

**Input 1 — Glue**

- **Log group name(s):**  
  `/aws-glue/jobs/output` and `/aws-glue/jobs/error` (or your custom-prefix groups).
- **Dataset (or “Dataset” / “Namespace”):** set to **`aws.glue`**.  
  This makes the integration send documents to the data stream that resolves to index **`logs-aws.glue`** (with default index template and prefix `logs-aws`).
- If your integration has a **“Custom ingest pipeline”** field, leave it empty for now; you will attach the pipeline in Step 8.

**Input 2 — SageMaker**

- **Log group name(s):**  
  The SageMaker log groups you noted in Step 2 (e.g. `/aws/sagemaker/TrainingJobs`, `/aws/sagemaker/NotebookInstances`, or `/aws/sagemaker/*` if the integration supports a prefix).
- **Dataset:** set to **`aws.sagemaker`**.  
  This makes documents go to **`logs-aws.sagemaker`**.
- Again, leave **Custom ingest pipeline** empty for now if present.

5. Save the integration and **reload the affected Elastic Agent(s)** or deploy the updated policy so the new log groups are collected.

**If your integration does not support “dataset” per input:**  
Then all CloudWatch logs may go to a single dataset (e.g. `aws.cloudwatch` → `logs-aws.cloudwatch`). In that case you cannot get separate indices purely from the integration; you would need a **custom pipeline** (e.g. Lambda or Kinesis Firehose) that reads CloudWatch and writes to Elastic with `_index: logs-aws.glue` or `_index: logs-aws.sagemaker` based on log group. See [cloudwatch-to-index-routing.md](cloudwatch-to-index-routing.md).

---

### Step 5: AWS Custom Logs integration (alternative)

If you use the **“AWS Custom Logs”** (or “Custom Logs”) integration instead of the default CloudWatch one:

1. Add an integration or input of type **Custom Logs** (or **AWS Custom Logs**).
2. Configure **CloudWatch** as the source and add the same Glue and SageMaker **log groups** as above.
3. Where the integration allows, set **dataset** (or equivalent) to **`aws.glue`** for Glue log groups and **`aws.sagemaker`** for SageMaker log groups so that indices are **`logs-aws.glue`** and **`logs-aws.sagemaker`**.
4. Save and deploy the policy.

---

### Step 6: (Optional) Create index templates for `logs-aws.glue` and `logs-aws.sagemaker`

If your deployment does not already create these indices (e.g. via a generic `logs-aws.*` template), you can create index templates so that the first document to each index gets a sensible mapping.

1. In **Kibana** → **Stack Management** → **Index Management** → **Index Templates**, create a new template (or use the **Dev Tools** console with the Put Index Template API).
2. **Template 1 — Glue**
   - **Name:** e.g. `logs-aws.glue`
   - **Index pattern:** `logs-aws.glue*`
   - **Data stream:** optional; only if you use data streams. Otherwise use a normal index template.
   - **Default pipeline (optional now):** you can leave blank and attach in Step 8, or set `glue-parse-json-message` now.
3. **Template 2 — SageMaker**
   - **Name:** e.g. `logs-aws.sagemaker`
   - **Index pattern:** `logs-aws.sagemaker*`
   - **Default pipeline (optional):** `sagemaker-parse-json-message` or set in Step 8.

If you use **data streams** (type `logs`, dataset `aws.glue` / `aws.sagemaker`), the stream names are typically derived from type + dataset + namespace; the integration usually creates them when it first sends data. In that case, ensure your **logs** data stream template uses a pattern that matches (e.g. `logs-aws.*`) and, if needed, add component templates for `aws.glue` and `aws.sagemaker` so the indices align with `logs-aws.glue` and `logs-aws.sagemaker`.

---

### Step 7: Create the Elastic ingest pipelines (parse JSON from `message`)

These pipelines copy the **parsed JSON** from the `message` field into `glue.parsed` and `sagemaker.parsed` so you can search on structured fields. Non-JSON messages are left unchanged.

**Easy way — use the installer (recommended)**

```bash
npm run setup:pipelines
# select: analytics (for Glue/EMR) and ml (for SageMaker), or "all"
```

The installer creates all pipelines idempotently and prints a confirmation for each one.

**Manual way — curl**

**7.1 — Create the Glue pipeline**

```bash
curl -X PUT "${ES_URL}/_ingest/pipeline/logs-aws.glue-default" \
  -H "Content-Type: application/json" \
  -H "Authorization: ApiKey ${ES_API_KEY}" \
  -d '{"description":"Parse JSON from message field into glue.parsed","processors":[{"json":{"field":"message","target_field":"glue.parsed","ignore_failure":true}}]}'
```

Replace `ES_URL` (your Elasticsearch endpoint) and `ES_API_KEY` (from Kibana → Stack Management → API Keys).

**7.2 — Create the SageMaker pipeline**

```bash
curl -X PUT "${ES_URL}/_ingest/pipeline/logs-aws.sagemaker-default" \
  -H "Content-Type: application/json" \
  -H "Authorization: ApiKey ${ES_API_KEY}" \
  -d '{"description":"Parse JSON from message field into sagemaker.parsed","processors":[{"json":{"field":"message","target_field":"sagemaker.parsed","ignore_failure":true}}]}'
```

Pipeline IDs, target fields, and example parsed keys for all 106 services: [docs/INGEST-PIPELINE-REFERENCE.md](../docs/INGEST-PIPELINE-REFERENCE.md).

**Verify pipelines:** In Kibana → **Stack Management** → **Ingest Pipelines**, you should see `glue-parse-json-message` and `sagemaker-parse-json-message`.

---

### Step 8: Attach the ingest pipelines to the Glue and SageMaker indices

So that every document written to `logs-aws.glue` and `logs-aws.sagemaker` is processed by the correct pipeline:

**Option A — Index template (recommended)**

1. Open the index template that matches **`logs-aws.glue*`** (from Step 6 or your existing template).
2. Set **Default pipeline** to **`glue-parse-json-message`**.
3. Open the template that matches **`logs-aws.sagemaker*`** and set **Default pipeline** to **`sagemaker-parse-json-message`**.
4. Save. New indices that match these patterns will use the pipelines automatically.

**Option B — Fleet / integration UI**

If your AWS integration (or Custom Logs) has a **“Custom ingest pipeline”** (or “Pipeline”) field per input:

1. In the **Glue** log group input, set **Custom ingest pipeline** to **`glue-parse-json-message`**.
2. In the **SageMaker** log group input, set **Custom ingest pipeline** to **`sagemaker-parse-json-message`**.
3. Save and redeploy the policy.

**Option C — Kibana Ingest Pipelines UI**

1. **Stack Management** → **Ingest Pipelines**.
2. Open **`glue-parse-json-message`** → **Manage** → assign to the **index template** or **data stream** that backs `logs-aws.glue`.
3. Open **`sagemaker-parse-json-message`** → **Manage** → assign to the template/stream for `logs-aws.sagemaker`.

After this, documents ingested into those indices will have `message` parsed into `glue.parsed` or `sagemaker.parsed` when `message` is valid JSON.

---

## Part 3 — Verify

### Step 9: End-to-end check

1. **AWS**
   - Run a Glue job and/or a SageMaker training job (or open a Studio app) so that new log events are written to the CloudWatch log groups you configured.
2. **CloudWatch**
   - In **CloudWatch** → **Log groups**, open the Glue and SageMaker log groups and confirm **Recent events** show new lines.
3. **Elastic**
   - In **Kibana** → **Discover**, select the **`logs-aws.glue`** and **`logs-aws.sagemaker`** data views (or index patterns).
   - Confirm new documents appear with `@timestamp` and `message`.
   - For a document whose `message` is JSON, confirm that **`glue.parsed`** or **`sagemaker.parsed`** exists and contains the parsed object.
4. **Optional**
   - Create a **Data view** (or index pattern) for `logs-aws.glue*` and `logs-aws.sagemaker*` with time field `@timestamp` for easier searching and dashboards.

---

## Summary checklist

| #   | Task                                                                                                                                                | Done |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | AWS: Enable Glue continuous logging; note log groups (`/aws-glue/jobs/output`, `/aws-glue/jobs/error` or custom)                                    | ☐    |
| 2   | AWS: Enable SageMaker logging to CloudWatch; note log groups                                                                                        | ☐    |
| 3   | AWS: IAM role/user for Elastic Agent with `logs:DescribeLogGroups`, `logs:DescribeLogStreams`, `logs:GetLogEvents` on Glue and SageMaker log groups | ☐    |
| 4   | Elastic: Add AWS (or Custom Logs) integration; add inputs for Glue and SageMaker log groups with dataset `aws.glue` and `aws.sagemaker`             | ☐    |
| 5   | Elastic: Deploy/reload Agent so it starts collecting those log groups                                                                               | ☐    |
| 6   | Elastic: (Optional) Create index templates for `logs-aws.glue*` and `logs-aws.sagemaker*`                                                           | ☐    |
| 7   | Elastic: Create ingest pipelines — run `npm run setup:pipelines` or use manual curl commands                                                        | ☐    |
| 8   | Elastic: Attach pipelines to `logs-aws.glue*` and `logs-aws.sagemaker*` (template or integration UI)                                                | ☐    |
| 9   | Verify: Generate Glue/SageMaker logs, then see them in Discover in the correct indices with optional `*.parsed` fields                              | ☐    |

---

## Related docs

- [cloudwatch-to-index-routing.md](cloudwatch-to-index-routing.md) — How index/dataset is chosen when ingesting from CloudWatch; custom sender option.
- [docs/INGEST-PIPELINE-REFERENCE.md](../docs/INGEST-PIPELINE-REFERENCE.md) — Pipeline IDs, target fields, and example parsed keys for all 106 services.
- [installer/README.md](../installer/README.md) — Automated pipeline installer (`npm run setup:pipelines`).
- [docs/GLUE-METRICS-COVERAGE.md](../docs/GLUE-METRICS-COVERAGE.md) — Glue metrics and log coverage vs AWS docs.
