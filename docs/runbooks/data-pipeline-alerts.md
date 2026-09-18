# Runbook — Data & Analytics Pipeline alerts

Investigation guides for the rules in the **Data & Analytics Pipeline** chain (the six rules below, plus a shared [Lineage triage](#lineage-triage-all-rules) section that also covers the Glue Schema Drift rule and the two OpenLineage-based Lineage rules). These rules watch the orchestrator (Airflow / Composer / Data Factory), the compute layer (EMR-Spark / Dataproc / Databricks), the source bucket (S3 / GCS / Blob), and the data-quality layer (on AWS, the Glue Data Quality result read from the Confluent Kafka topic `glue.dq.results`; on GCP / Azure, the query layer — BigQuery / Synapse).

> **Linked dashboards:** `Data & Analytics Pipeline — overview` and `Data & Analytics Pipeline — run lineage`
> **Chain reference:** [data-analytics-pipeline.md](../chained-events/data-analytics-pipeline.md) (and the GCP / Azure variants)

| Vendor | Orchestrator dataset | Compute dataset    | Source dataset      | Quality / query dataset |
| ------ | -------------------- | ------------------ | ------------------- | ----------------------- |
| AWS    | `aws.mwaa`           | `aws.emr`          | `aws.s3access`      | `aws.glue_dataquality`  |
| GCP    | `gcp.composer`       | `gcp.dataproc`     | `gcp.gcs`           | `gcp.bigquery`          |
| Azure  | `azure.datafactory`  | `azure.databricks` | `azure.blobstorage` | `azure.synapse`         |

The shipped rules are AWS-named. If you switched the deployment to GCP or Azure, swap the dataset names in the queries below — the structure is identical, except that the AWS null-data and schema-drift rules read a Glue Data Quality result (`aws.glue_dataquality.*`) where the GCP / Azure variants read a query log.

---

## 1. `[CloudLoadGen] Data Pipeline — High Failure Rate`

**Threshold:** more than 3 failed pipeline runs in any 15-minute window.

### What this means

The orchestrator (MWAA / Composer / Data Factory) is recording `event.outcome: failure` on more DAG runs than your steady-state. This usually means the pipeline is broken end-to-end — not just a single retry.

### Five-minute triage

1. **Are the failures concentrated on one DAG?** Run the [Concentration query](#concentration-query) below. If yes, the rest of the platform is healthy and you can scope the response to one team.
2. **When did the failures start?** Open the linked dashboard, set the time range to the last hour, and look at the "Pipeline runs / outcome" panel. If the spike is rising, escalate; if it's a flat plateau, the upstream incident has likely already been called.
3. **Is there an upstream symptom?** Check whether one of the other rules in this chain has fired in the same window — `EMR/Spark Processing Error` and `S3 Source File Format Error` are the most common precursors.

### Investigation queries

#### Concentration query

```esql
FROM logs-aws.mwaa-*
| WHERE event.outcome == "failure"
| STATS failures = COUNT(*) BY aws.mwaa.dag_id
| SORT failures DESC
| LIMIT 10
```

(GCP: `FROM logs-gcp.composer-*` and `gcp.composer.dag_id`. Azure: `FROM logs-azure.datafactory-*` and `azure.datafactory.pipeline_name`.)

#### Failure timeline (15-minute buckets)

```esql
FROM logs-aws.mwaa-*
| WHERE @timestamp > NOW() - 4h AND event.outcome == "failure"
| STATS failures = COUNT(*) BY BUCKET(@timestamp, 15m)
| SORT BUCKET(@timestamp, 15m) ASC
```

#### Correlate with the failing DAG's tasks

```esql
FROM logs-aws.mwaa-*
| WHERE aws.mwaa.dag_id == "<dag_id_from_concentration_query>"
| KEEP @timestamp, event.action, event.outcome, error.message
| SORT @timestamp DESC
| LIMIT 50
```

### Likely causes

- **True positive:** Source-data schema change broke a downstream task, the EMR/Spark cluster lost a worker, or an IAM/permissions change blocked the pipeline service account.
- **False positive:** A scheduled "expect-to-fail" health check or a backfill of historical-but-broken DAG runs.

### Containment & remediation

- Pause the affected DAG to stop retry storms (only do this if the failures are confirmed and you have authority over that DAG).
- Open an incident under the support group of the **affected CI** — the [alert-enrichment workflow](../workflow-deployment.md) puts that on the email if it's enabled.
- Page the data team if more than one DAG is failing or failures are accelerating.

### Related rules in the chain

- `Data Pipeline — EMR/Spark Processing Error` (compute layer fault — probable upstream cause).
- `Data Pipeline — S3 Source File Format Error` (bad inputs — probable upstream cause).

### When to escalate

- Multiple DAGs failing.
- Failures still rising after the first 15 minutes.
- Anything touching SLA-bound data (regulatory, financial reporting).

---

## 2. `[CloudLoadGen] Data Pipeline — Null/Empty Data Detected`

**Threshold:** at least 1 Glue Data Quality result in the last 15 minutes whose `RowCount > 0` rule failed (`aws.glue_dataquality.failed_rule_types: RowCount`). GCP / Azure: at least 1 query returning zero rows (BigQuery / Synapse).

### What this means

The Glue DQ job `<dag_id>-dq-evaluate` evaluated the run's Parquet output and found **zero rows** — `EvaluationMessage: "Value: 0 does not meet the constraint requirement!"`, usually with `DataFreshness "event_ts" <= 24 hours` in `ERROR` because there was nothing to evaluate. Spark reported `COMPLETED`, the DQ job reported `SUCCEEDED` (its ruleset-failure action is `None`), and the DAG run ended `success` with `quality_check: DEGRADED` — i.e. the pipeline is silently broken. The result reached Elastic over the Confluent topic `glue.dq.results` (Elastic Agent Kafka input), not CloudWatch.

### Five-minute triage

1. **Identify the empty run.** Run the [Empty output lookup](#empty-output-lookup). `aws.glue_dataquality.job.name` names the DAG; `labels.pipeline_run_id` (ingest-time enrichment keyed on `JobRunId`) names the run.
2. **Check the source object.** The run's `S3 GetObject` on the Avro source will show `bytes_sent: 0` (use the source-bucket query in §4, or the raw-evidence query in [Lineage triage](#lineage-triage-all-rules)) — a 0-byte landing, not a Spark fault.
3. **Check the orchestrator.** MWAA / Step Functions show the run as `success` with `quality_check: DEGRADED`, `dq_state: FAILED`. That is the dangerous case — nothing else in the chain fired.

### Investigation queries

#### Empty output lookup

```esql
FROM logs-aws.glue_dataquality-*
| WHERE @timestamp > NOW() - 1h AND aws.glue_dataquality.failed_rule_types == "RowCount"
| KEEP @timestamp, aws.glue_dataquality.job.name, aws.glue_dataquality.job.run_id, aws.glue_dataquality.result_id,
       aws.glue_dataquality.score, aws.glue_dataquality.failed_rules, labels.pipeline_run_id, kafka.partition, kafka.offset
| SORT @timestamp DESC
| LIMIT 25
```

(GCP: `FROM logs-gcp.bigquery-*` with `gcp.bigquery.rows_returned == 0`. Azure: `azure.synapse.rows_returned == 0`.)

#### Compare to historical baseline

```esql
FROM logs-aws.glue_dataquality-*
| WHERE aws.glue_dataquality.job.name == "<job_name_from_empty_output_lookup>"
| WHERE @timestamp > NOW() - 24h
| STATS empty = COUNT(*) WHERE aws.glue_dataquality.failed_rule_types == "RowCount",
        total = COUNT(*) BY BUCKET(@timestamp, 1h)
```

If `empty / total` is normally <1% and it's now >25%, you're looking at a real regression rather than a one-off empty landing.

### Likely causes

- **True positive:** The producer landed a 0-byte or header-only Avro file, the upstream extract ran before its data was ready, or a partition filter in the Spark job matched nothing.
- **False positive:** A scheduled run that fires _before_ its expected data lands (timing issue) — those reliably alert at the same minute every day.

### Containment & remediation

- Tell the consuming team (dashboard owner, downstream pipeline owner) that they're looking at an empty partition.
- Re-run the pipeline once the producer has re-landed the source file.
- Consider switching the DQ job's ruleset-failure action from `None` to `Fail job after loading target data` for this DAG, so an empty output fails the `glue_dq_evaluate` task and the DAG run instead of only lowering the score.

### Related rules in the chain

- `Data Pipeline — High Failure Rate` (orchestrator may already be flagging the upstream load failure).
- `Data Pipeline — S3 Source File Format Error` (would explain why the load wrote nothing).

### When to escalate

- The query feeds an SLA-bound or customer-facing dataset.
- The same query has been empty for more than two consecutive scheduled runs.

---

## 3. `[CloudLoadGen] Data Pipeline — EMR/Spark Processing Error`

**Threshold:** at least 1 EMR / Dataproc / Databricks document with `error.type` set in the last 15 minutes.

### What this means

The compute cluster (Spark) is logging exceptions. Spark errors that surface to ECS `error.type` are typically driver/executor failures, not retried task errors.

### Five-minute triage

1. **Get the error class.** Run [Error classification](#error-classification) — the top error.type usually tells you whether it's user code, infra, or data.
2. **Locate the executors / nodes.** If the same `host.id` keeps failing, you've got an infra problem; if many hosts fail with the same exception, it's user-code or input-data.
3. **Cross-check the orchestrator.** A Spark error here almost always lights up a `Data Pipeline — High Failure Rate` alert as well.

### Investigation queries

#### Error classification

```esql
FROM logs-aws.emr-*
| WHERE @timestamp > NOW() - 1h AND error.type IS NOT NULL
| STATS errors = COUNT(*) BY error.type, host.id
| SORT errors DESC
| LIMIT 20
```

#### Error-message sample

```esql
FROM logs-aws.emr-*
| WHERE @timestamp > NOW() - 1h AND error.type IS NOT NULL
| KEEP @timestamp, error.type, error.message, host.id, aws.emr.cluster_id
| SORT @timestamp DESC
| LIMIT 25
```

### Likely causes

- **True positive:** OOM killed an executor (`OutOfMemoryError`), schema mismatch in the input parquet/avro (`AnalysisException`), missing dependency JAR (`ClassNotFoundException`).
- **False positive:** Spark recoverable task failures that surface to logs but were retried successfully — only worth chasing if the same exception is repeating.

### Containment & remediation

- Increase executor memory or repartition the input if it's an OOM.
- Roll back the schema change if it's an `AnalysisException`.
- Restart the cluster if it's a single-node infra issue.

### Related rules in the chain

- `Data Pipeline — High Failure Rate` (downstream symptom).
- `Data Pipeline — Slow Pipeline Run` (compute pressure often shows up as slowness first).

### When to escalate

- Multiple clusters affected.
- Same error reproducing after a cluster restart — it's data, not infra.

---

## 4. `[CloudLoadGen] Data Pipeline — S3 Source File Format Error`

**Threshold:** at least 1 S3 / GCS / Blob access log in the last 15 minutes for an object that's not the expected `.avro` extension or contains a URL-encoded `%`.

### What this means

The source bucket has a file the pipeline doesn't expect. Either someone landed the wrong file, the producer is emitting the wrong extension, or a malformed key landed (typically because of unescaped path characters).

### Five-minute triage

1. **List the unexpected keys.** Run [Unexpected keys](#unexpected-keys). If they're all from one prefix or one producer, scope the response to that team.
2. **Confirm landing time.** Check `@timestamp` — was the bad file landed _just now_ (probable bad release) or hours ago (we're catching up after a backlog)?
3. **Check downstream impact.** If the orchestrator already failed the run, the symptom is contained; if not, the query layer might be returning empty (rule 2) or weird data.

### Investigation queries

#### Unexpected keys

```esql
FROM logs-aws.s3access-*
| WHERE @timestamp > NOW() - 1h
| WHERE NOT ENDS_WITH(aws.s3access.key, ".avro") OR aws.s3access.key LIKE "*%*"
| KEEP @timestamp, aws.s3access.key, aws.s3access.bucket_name, aws.s3access.requester
| SORT @timestamp DESC
| LIMIT 50
```

(GCP: `gcp.gcs.object_name`, `gcp.gcs.bucket_name`. Azure: `azure.blobstorage.blob_name`, `azure.blobstorage.container_name`.)

#### Producer identification

```esql
FROM logs-aws.s3access-*
| WHERE @timestamp > NOW() - 1h
| WHERE NOT ENDS_WITH(aws.s3access.key, ".avro")
| STATS bad_keys = COUNT(*) BY aws.s3access.requester, aws.s3access.bucket_name
| SORT bad_keys DESC
```

### Likely causes

- **True positive:** A new producer started writing CSV/JSON instead of Avro, or a CDC tool wrote a manifest file with `%`-escaping.
- **False positive:** Side-car files (`.crc`, `_SUCCESS`, `.tmp`) — these are noisy but harmless. Consider tuning the rule's query to ignore `_SUCCESS`/`.crc`/`.tmp` if they're frequent in your environment.

### Containment & remediation

- Move the bad file to a quarantine prefix so the next pipeline run skips it.
- Tell the producer team to fix the format and re-upload.
- If the file is a CDC/manifest, exclude that prefix from the pipeline glob.

### Related rules in the chain

- `Data Pipeline — Null/Empty Data Detected` (the Glue DQ `RowCount > 0` rule will fail on the empty output).
- `Data Pipeline — High Failure Rate` (orchestrator usually fails the next run).

### When to escalate

- Multiple producers writing the wrong format — likely a shared library upgrade went bad.
- The bucket is bucket-versioned and old versions also got overwritten.

---

## 5. `[CloudLoadGen] Data Pipeline — Slow Pipeline Run (>60s)`

**Threshold:** at least 1 DAG completion in 30 minutes with `aws.mwaa.duration_ms > 60000`.

### What this means

A DAG took longer than its informal SLA. By itself this is the lowest-severity rule in the chain — it's most useful when paired with the other four to spot a degrading-but-not-yet-failing pipeline.

### Five-minute triage

1. **Compare to the DAG's normal runtime.** Run [Runtime baseline](#runtime-baseline). If the slow run is within 2× of the historical p95, this is noise.
2. **Look at the compute layer.** If EMR/Spark errors are also firing, slowness is a symptom of compute pressure.
3. **Look at the input volume.** If the DAG is processing 10× the usual rows, it's expected slowness — annotate the alert and mute for 1 hour.

### Investigation queries

#### Runtime baseline

```esql
FROM logs-aws.mwaa-*
| WHERE event.action == "dag_completed"
| WHERE @timestamp > NOW() - 7d
| STATS p50 = PERCENTILE(aws.mwaa.duration_ms, 50),
        p95 = PERCENTILE(aws.mwaa.duration_ms, 95),
        p99 = PERCENTILE(aws.mwaa.duration_ms, 99) BY aws.mwaa.dag_id
| WHERE p95 > 30000
| SORT p95 DESC
```

#### Last 24h slow runs

```esql
FROM logs-aws.mwaa-*
| WHERE event.action == "dag_completed" AND aws.mwaa.duration_ms > 60000
| WHERE @timestamp > NOW() - 24h
| KEEP @timestamp, aws.mwaa.dag_id, aws.mwaa.duration_ms
| SORT aws.mwaa.duration_ms DESC
| LIMIT 25
```

### Likely causes

- **True positive:** Compute pressure (EMR/Spark errors), input volume spike, or a regression introduced by a recent DAG change.
- **False positive:** First-of-day cold-start (Spark provisioning), or a DAG that's always been slow but recently got an SLA target.

### Containment & remediation

- If compute is the bottleneck, scale the cluster or split the DAG.
- If volume is the bottleneck, push the input team to chunk the file.
- If the DAG just got slower after a code change, roll the change back.

### Related rules in the chain

- `Data Pipeline — EMR/Spark Processing Error` (slowness is often a symptom of executor failures).
- `Data Pipeline — High Failure Rate` (slow DAGs eventually time out and fail).

### When to escalate

- The DAG is SLA-bound and has been slow for two consecutive runs.
- Slowness is correlated with executor errors — the cluster is degrading.

---

## 6. `[CloudLoadGen] Data Pipeline — DQ Score Low` (`cloudloadgen-data-pipeline-dq-score-low`)

**Threshold:** at least 1 Glue Data Quality result in the last 15 minutes with `aws.glue_dataquality.score` below the configured threshold (or `aws.glue_dataquality.state: FAILED`). AWS only — there is no GCP / Azure equivalent yet.

### What this means

The Glue DQ job scored the run's Parquet output against the DQDL ruleset `<dag_id>-parquet-output-ruleset` and one or more rules failed. Because the job's ruleset-failure action is `None`, **nothing else in the chain failed**: Spark `COMPLETED`, the Glue job `SUCCEEDED`, the DAG run is `success` with `quality_check: DQ_RULES_FAILED` (or `SCHEMA_DRIFT` / `DEGRADED`), and the ingest pipeline set `event.outcome: failure`, `error.type: DataQualityRuleFailure` on the result. This rule is the catch-all; the null-data rule (`RowCount`) and the schema-drift rule (`ColumnExists` / `ColumnCount` / `ColumnDataType`) are its specific cases.

### Five-minute triage

1. **Which rule failed?** Run [Failed rules for the result](#failed-rules-for-the-result). A single `Completeness "amount" > 0.95` failure at 0.94 is a marginal data-quality wobble (about 5 % of healthy runs in the demo data); `RowCount` or `Column*` failures mean the null-data or schema-drift rule fired too — go to §2 or [Lineage triage → 5](#5-schema-drift--compare-the-output-schema-run-over-run).
2. **Is the score trending down?** Run [Score trend](#score-trend). The ML job `aws-data-pipeline-dq-score-drift` fires on the same signal before the threshold is crossed.
3. **Did the result actually arrive through Kafka?** `kafka.topic`, `kafka.partition`, `kafka.offset`, `kafka.key` (= `ResultId`) are on the document. If the DQ job log (`aws.glue`, `/aws-glue/jobs/output`) shows an evaluation but no result reached `logs-aws.glue_dataquality-*`, the fault is in the publisher or the Kafka input, not in the data — check the Kafka Connect sink bucket (`topics/glue.dq.results/partition=<p>/…json`) as the fallback copy.

### Investigation queries

#### Failed rules for the result

```esql
FROM logs-aws.glue_dataquality-*
| WHERE @timestamp > NOW() - 1h AND aws.glue_dataquality.state == "FAILED"
| MV_EXPAND aws.glue_dataquality.failed_rules
| KEEP @timestamp, aws.glue_dataquality.job.name, aws.glue_dataquality.score, aws.glue_dataquality.rules.failed,
       aws.glue_dataquality.rules.total, aws.glue_dataquality.failed_rules, labels.pipeline_run_id
| SORT @timestamp DESC
| LIMIT 50
```

#### Rule-level detail (message and evaluated metric)

```esql
FROM logs-aws.glue_dataquality-*
| WHERE aws.glue_dataquality.result_id == "<result_id>"
| MV_EXPAND aws.glue_dataquality.rule_results
| EVAL rule = aws.glue_dataquality.rule_results.evaluated_rule, result = aws.glue_dataquality.rule_results.result,
       msg = aws.glue_dataquality.rule_results.evaluation_message
| WHERE result != "PASS"
| KEEP rule, result, msg
```

#### Score trend

```esql
FROM logs-aws.glue_dataquality-*
| WHERE @timestamp > NOW() - 7d
| STATS avg_score = AVG(aws.glue_dataquality.score), min_score = MIN(aws.glue_dataquality.score),
        failed_results = COUNT(*) WHERE aws.glue_dataquality.state == "FAILED"
  BY aws.glue_dataquality.job.name, BUCKET(@timestamp, 1d)
| SORT aws.glue_dataquality.job.name, `BUCKET(@timestamp, 1d)` ASC
```

### Likely causes

- **True positive:** A producer started emitting nulls in `amount`, a currency outside the allowed set, or the source schema changed (see the schema-drift rule); a 0-byte landing (see §2).
- **False positive:** A ruleset threshold that is tighter than the data ever met (`Completeness > 0.95` on a column that is legitimately 94 % populated) — tune the DQDL, not the alert.

### Containment & remediation

- Tell the consuming team which columns / rules are affected — `failed_rules` is the list to paste.
- If the failure is real and recurring, change the DQ job's ruleset-failure action so the DAG fails rather than degrading silently, and add the rule's `EvaluatedMetrics` to the pipeline's SLO.
- If the ruleset is wrong, fix the DQDL in the Glue job and re-run the DQ job alone (`StartJobRun` with the same `--input_path` / `--pipeline_run_id`).

### Related rules in the chain

- `Data Pipeline — Null/Empty Data Detected` (`RowCount` failure — same result document).
- `Data Pipeline — Glue Schema Drift Detected` (`ColumnExists` / `ColumnCount` / `ColumnDataType` failure — same result document).

### When to escalate

- The score has been below threshold for two consecutive runs of the same DAG.
- The failing column feeds an SLA-bound or customer-facing dataset.

---

## Lineage triage (all rules)

Every rule above, plus the two Lineage rules (`[CloudLoadGen] Data Pipeline — Lineage: job failed (per run)` and `[CloudLoadGen] Data Pipeline — Lineage: job slower than baseline (>2× p50)`), links the **`Data & Analytics Pipeline — run lineage`** dashboard and resolves to a single **run** — `labels.pipeline_run_id`, the OpenLineage root run id (Airflow DAG run or Step Functions execution). The Lineage rules put `run_id`, `dag`, `job`, `error`, `inputs`, `duration_ms`, `baseline_p50_ms`, `ratio_pct`, and `owner` directly in the alert context; for the other rules, take the run id from the alert's document (`labels.pipeline_run_id`) or from the dashboard's "Recent pipeline runs" table. Reference: [data-pipeline-lineage.md](../chained-events/data-pipeline-lineage.md).

Lineage is AWS-only today (MWAA + EMR Spark via OpenLineage); the GCP / Azure variants have no lineage stream yet.

### 1. Reconstruct the run — jobs in execution order

```esql
FROM logs-aws.openlineage*
| WHERE labels.pipeline_run_id == "<run_id>"
| STATS started = MIN(@timestamp),
        events = MV_CONCAT(MV_SORT(VALUES(aws.openlineage.event_type), "DESC"), " → "),
        duration_ms = MAX(aws.openlineage.run.duration_ms),
        inputs = MV_CONCAT(VALUES(aws.openlineage.inputs), " | "),
        outputs = MV_CONCAT(VALUES(aws.openlineage.outputs), " | "),
        rows_written = MAX(aws.openlineage.output_statistics.row_count),
        error = MV_CONCAT(VALUES(error.message), " | ")
  BY job = aws.openlineage.job.name, integration = aws.openlineage.job.integration, job_type = aws.openlineage.job.type
| SORT started ASC
```

Read it top to bottom. `START → COMPLETE` is a healthy job; `START → FAIL` is where it broke and `error` says why; a job with `START` only never finished. If only Spark rows come back, the run was EventBridge or manual — Step Functions and `add-steps` have no Airflow lineage (expected, not a gap).

### 2. Downstream impact — what was never produced

```esql
FROM logs-aws.openlineage*
| WHERE labels.pipeline_run_id == "<run_id>" AND aws.openlineage.job.type != "DAG"
| STATS has_start = MAX(CASE(aws.openlineage.event_type == "START", 1, 0)),
        has_complete = MAX(CASE(aws.openlineage.event_type == "COMPLETE", 1, 0)),
        outputs = MV_CONCAT(VALUES(aws.openlineage.outputs), " | ")
  BY job = aws.openlineage.job.name
| WHERE has_start == 1 AND has_complete == 0
```

The `outputs` listed here (Parquet prefix, run manifest) are what downstream consumers — including the Glue DQ job, which reads the Parquet prefix — are missing. Tell those owners first.

### 3. Slower than its own baseline

```esql
FROM logs-aws.openlineage*
| WHERE @timestamp > NOW() - 7d
  AND aws.openlineage.run.duration_ms IS NOT NULL AND aws.openlineage.job.type != "DAG"
| STATS duration_ms = MAX(aws.openlineage.run.duration_ms) BY run_id = labels.pipeline_run_id, job = aws.openlineage.job.name
| INLINE STATS p50 = PERCENTILE(duration_ms, 50), p95 = PERCENTILE(duration_ms, 95) BY job
| WHERE run_id == "<run_id>"
| EVAL ratio_pct = ROUND(100.0 * duration_ms / p50, 0)
| SORT ratio_pct DESC
```

A single stage at 300 % with the rest at ~100 % is a stage problem (compute, input size); every stage inflated is cluster or platform pressure.

### 4. Raw evidence — native ids for the AWS console

```esql
FROM logs-aws.s3access*, logs-aws.emr_logs*, logs-aws.glue*, logs-aws.glue_dataquality*, logs-aws.eks*, logs-aws.mwaa*, logs-aws.stepfunctions*, logs-aws.cloudtrail*
| WHERE labels.pipeline_run_id == "<run_id>"
| EVAL native_id = COALESCE(aws.emr.step_id, aws.glue_dataquality.result_id, aws.glue.job.run_id, aws.s3access.request_id,
                            aws.stepfunctions.execution_arn, aws.mwaa.run_id, aws.cloudtrail.request_id, kubernetes.pod.name),
       detail = COALESCE(aws.s3access.key, aws.emr.spark_app_id, aws.stepfunctions.state_name, aws.mwaa.task_id,
                         MV_CONCAT(aws.glue_dataquality.failed_rules, "; "), TO_STRING(kafka.offset), event.action)
| KEEP @timestamp, event.dataset, event.outcome, native_id, detail, error.type, error.message
| SORT @timestamp ASC
| LIMIT 200
```

These are the identifiers to chase in EMR (`step_id`, `spark_app_id`), Glue (`job.run_id`), the DQ result (`result_id`, Kafka partition/offset — also the sink object name `glue.dq.results+<p>+<offset>.json` in the results bucket), S3 (`key`), Step Functions (`execution_arn`), and CloudTrail — the same ids the OpenLineage events and the CloudTrail `StartJobRun` carry, which is how the run label is attached on real data. None of the raw documents carry `trace.id` or stage fields; `labels.pipeline_run_id` on them is ingest-time enrichment.

### 5. Schema drift — compare the output schema run over run

```esql
FROM logs-aws.openlineage*
| WHERE aws.openlineage.job.name == "<spark_job_from_step_1>" AND aws.openlineage.output_schema_fields IS NOT NULL
| STATS schema = MV_CONCAT(MV_SORT(VALUES(aws.openlineage.output_schema_fields)), ", "), last_seen = MAX(@timestamp) BY run_id = labels.pipeline_run_id
| SORT last_seen DESC
| LIMIT 5
```

A column changing type (`amount:int` → `amount:double`) or disappearing is the same drift the Glue DQ result reports as a rule failure — `ColumnDataType "amount" = "Integer"` → `FAIL`, or `ColumnExists "legacy_id"` → `FAIL` with `Input data does not include column legacy_id!` and `ColumnCount = 12` → `FAIL`. Confirm with the run's DQ document:

```esql
FROM logs-aws.glue_dataquality*
| WHERE labels.pipeline_run_id == "<run_id>"
| KEEP aws.glue_dataquality.score, aws.glue_dataquality.state, aws.glue_dataquality.failed_rules, aws.glue_dataquality.failed_rule_types
```

The DAG run itself is `success` (ruleset-failure action `None`), so this rule — not the Lineage job-failed rule — is what fires for drift.

### 6. Pivot to APM

```esql
FROM traces-apm*
| WHERE labels.pipeline_run_id == "<run_id>" AND processor.event == "transaction"
| KEEP trace.id, service.name, transaction.name, transaction.duration.us
```

Open `<kibana>/app/apm/link-to/trace/<trace.id>`. The orchestrator documents (Airflow task logs, Step Functions history) share this `trace.id`; raw S3 / EMR / Glue / Glue DQ result / Kafka Connect logs do not, so pivot from them via the run label. The last two spans are `glue.StartJobRun → <dag_id>-dq-evaluate` (with `labels.dq_score` / `dq_state`) and `kafka.produce → glue.dq.results`; the S3 sink is asynchronous and has no span.

If the alert-enrichment workflow is enabled, steps 1–4 and 6 are already in the notification body — see [workflow-deployment.md](../workflow-deployment.md).

---

## See also

- [Chained event reference — Data & Analytics Pipeline](../chained-events/data-analytics-pipeline.md) — what the generator emits and the correlation IDs each rule reads.
- [Run lineage (OpenLineage)](../chained-events/data-pipeline-lineage.md) — field reference, real-world setup (MWAA / EMR / Elastic Agent / enrich policy), dashboard walkthrough, and demo script.
- [Workflow deployment guide](../workflow-deployment.md) — enable the alert-enrichment workflow to add ServiceNow CI/owner/incident context to every notification.
