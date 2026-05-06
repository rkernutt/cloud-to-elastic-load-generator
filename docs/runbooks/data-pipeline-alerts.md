# Runbook — Data & Analytics Pipeline alerts

Investigation guides for the five rules in the **Data & Analytics Pipeline** chain. These rules watch the orchestrator (Airflow / Composer / Data Factory), the compute layer (EMR-Spark / Dataproc / Databricks), the source bucket (S3 / GCS / Blob), and the query layer (Athena / BigQuery / Synapse).

> **Linked dashboard:** `Data & Analytics Pipeline — overview`
> **Chain reference:** [data-analytics-pipeline.md](../chained-events/data-analytics-pipeline.md) (and the GCP / Azure variants)

| Vendor | Orchestrator dataset | Compute dataset    | Source dataset      | Query dataset   |
| ------ | -------------------- | ------------------ | ------------------- | --------------- |
| AWS    | `aws.mwaa`           | `aws.emr`          | `aws.s3access`      | `aws.athena`    |
| GCP    | `gcp.composer`       | `gcp.dataproc`     | `gcp.gcs`           | `gcp.bigquery`  |
| Azure  | `azure.datafactory`  | `azure.databricks` | `azure.blobstorage` | `azure.synapse` |

The shipped rules are AWS-named. If you switched the deployment to GCP or Azure, swap the dataset names in the queries below — the structure is identical.

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

**Threshold:** at least 1 query returning zero rows in the last 15 minutes (Athena / BigQuery / Synapse).

### What this means

A query the pipeline depends on returned no rows. This frequently means the upstream load step never wrote the expected partition — i.e. the pipeline is silently broken.

### Five-minute triage

1. **Identify the empty query.** Run the [Empty query lookup](#empty-query-lookup). If the query name maps to a known reporting dataset, the consuming downstream is already broken.
2. **Check the partition.** If the query has a date / hour partition predicate, confirm the source bucket has data for that partition (use the source-bucket query in §4).
3. **Check the orchestrator.** If MWAA / Composer / Data Factory shows the upstream task as "success", that's the most dangerous case — silent data loss.

### Investigation queries

#### Empty query lookup

```esql
FROM logs-aws.athena-*
| WHERE @timestamp > NOW() - 1h AND aws.athena.rows_returned == 0
| KEEP @timestamp, aws.athena.query_id, aws.athena.query, aws.athena.workgroup, user.name
| SORT @timestamp DESC
| LIMIT 25
```

(GCP: `gcp.bigquery.rows_returned`. Azure: `azure.synapse.rows_returned`.)

#### Compare to historical baseline

```esql
FROM logs-aws.athena-*
| WHERE aws.athena.workgroup == "<workgroup_from_empty_query_lookup>"
| WHERE @timestamp > NOW() - 24h
| STATS empty = COUNT(*) WHERE aws.athena.rows_returned == 0,
        total = COUNT(*) BY BUCKET(@timestamp, 1h)
```

If `empty / total` is normally <1% and it's now >25%, you're looking at a real regression.

### Likely causes

- **True positive:** Upstream load wrote to the wrong partition, the source file landed late, the schema changed and the query no longer matches.
- **False positive:** A scheduled query that runs _before_ its expected data lands (timing issue) — those reliably alert at the same minute every day.

### Containment & remediation

- Tell the consuming team (dashboard owner, downstream pipeline owner) that they're looking at stale data.
- Re-run the upstream load if the partition is genuinely missing.
- Add a watermark check to the query so the next missed-partition is caught earlier.

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

- `Data Pipeline — Null/Empty Data Detected` (downstream Athena will see no rows).
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

## See also

- [Chained event reference — Data & Analytics Pipeline](../chained-events/data-analytics-pipeline.md) — what the generator emits and the correlation IDs each rule reads.
- [Workflow deployment guide](../workflow-deployment.md) — enable the alert-enrichment workflow to add ServiceNow CI/owner/incident context to every notification.
