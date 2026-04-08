# Glue Metrics & Logs Coverage vs AWS Documentation

> **Last updated:** 2026-03-17 (v8.0)

This document maps the load generator’s Glue events to the official AWS Glue monitoring docs so you can see what’s covered and what’s optional or out of scope.

**References:**

- [Monitoring with Amazon CloudWatch](https://docs.aws.amazon.com/glue/latest/dg/monitor-cloudwatch.html)
- [Monitoring AWS Glue using Amazon CloudWatch metrics](https://docs.aws.amazon.com/glue/latest/dg/monitoring-awsglue-with-cloudwatch-metrics.html)
- [Monitoring with AWS Glue Observability metrics](https://docs.aws.amazon.com/glue/latest/dg/monitor-observability.html)
- [Logging for AWS Glue jobs](https://docs.aws.amazon.com/glue/latest/dg/monitor-continuous-logging.html)

---

## 1. CloudWatch metrics (monitoring-awsglue-with-cloudwatch-metrics.html)

AWS reports these to CloudWatch every 30s; we emit equivalent fields under `aws.glue.metrics` (driver / executor / ALL) so dashboards and ML can use the same field paths.

| AWS metric                                                                 | Generator field                                                               | Notes                                                      |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `glue.driver.aggregate.bytesRead`                                          | `metrics.driver.aggregate.bytesRead`                                          | ✓                                                          |
| `glue.driver.aggregate.elapsedTime` (ms)                                   | `metrics.driver.aggregate.elapsedTime`                                        | In **milliseconds** to match CloudWatch                    |
| `glue.driver.aggregate.numCompletedStages`                                 | `metrics.driver.aggregate.numCompletedStages`                                 | ✓                                                          |
| `glue.driver.aggregate.numCompletedTasks`                                  | `metrics.driver.aggregate.numCompletedTasks`                                  | ✓                                                          |
| `glue.driver.aggregate.numFailedTasks`                                     | `metrics.driver.aggregate.numFailedTasks`                                     | ✓                                                          |
| `glue.driver.aggregate.numKilledTasks`                                     | `metrics.driver.aggregate.numKilledTasks`                                     | ✓                                                          |
| `glue.driver.aggregate.recordsRead`                                        | `metrics.driver.aggregate.numRecords`                                         | Same semantics (records read)                              |
| `glue.driver.aggregate.shuffleBytesWritten`                                | `metrics.driver.aggregate.shuffleBytesWritten`                                | ✓                                                          |
| `glue.driver.aggregate.shuffleLocalBytesRead`                              | `metrics.driver.aggregate.shuffleLocalBytesRead`                              | ✓                                                          |
| `glue.driver.BlockManager.disk.diskSpaceUsed_MB`                           | `metrics.driver.BlockManager.disk.diskSpaceUsed_MB`                           | ✓                                                          |
| `glue.driver.ExecutorAllocationManager.executors.numberAllExecutors`       | `metrics.driver.ExecutorAllocationManager.executors.numberAllExecutors`       | ✓                                                          |
| `glue.driver.ExecutorAllocationManager.executors.numberMaxNeededExecutors` | `metrics.driver.ExecutorAllocationManager.executors.numberMaxNeededExecutors` | ✓                                                          |
| `glue.driver.jvm.heap.usage` (0–1)                                         | `metrics.driver.jvm.heap.usage`                                               | ✓                                                          |
| `glue.driver.jvm.heap.used` (bytes)                                        | `metrics.driver.memory.heap.used`                                             | ✓                                                          |
| `glue.driver.s3.filesystem.read_bytes`                                     | `metrics.driver.s3.filesystem.read_bytes`                                     | ✓                                                          |
| `glue.driver.s3.filesystem.write_bytes`                                    | `metrics.driver.s3.filesystem.write_bytes`                                    | ✓                                                          |
| `glue.driver.system.cpuSystemLoad` (0–1)                                   | `metrics.driver.system.cpuSystemLoad`                                         | ✓                                                          |
| `glue.ALL.*` (executor aggregates)                                         | `metrics.ALL.*` (memory, jvm, disk, s3, system)                               | ✓                                                          |
| `glue.driver.streaming.*`                                                  | —                                                                             | Not emitted (streaming-only; generator is batch/ETL-style) |

**Dimensions:** We emit `aws.dimensions` with `JobName`, `JobRunId`, and `Type` (job type: glueetl/pythonshell/gluestreaming). CloudWatch also uses dimensions `Type: count | gauge` per metric; we don’t split by count/gauge in a single event.

---

## 2. Observability metrics (monitor-observability.html)

Observability adds job_performance, error, resource_utilization, and throughput. We align with the same metric names and categories where they apply to a single job run.

| Category                 | AWS Observability metric                                    | Generator field                                                      | Notes                                   |
| ------------------------ | ----------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------- |
| **job_performance**      | `glue.driver.skewness.stage`                                | `metrics.driver.skewness.stage`                                      | ✓                                       |
| **job_performance**      | `glue.driver.skewness.job`                                  | `metrics.driver.skewness.job`                                        | ✓                                       |
| **error**                | `glue.succeed.ALL` / `glue.error.ALL`                       | Implied by `event.outcome` and `job.run_state`                       | Counts are per-run in our model         |
| **error**                | `glue.error.[error category]`                               | `aws.glue.error_category` (on failure)                               | One of 9 Observability error categories |
| **resource_utilization** | `glue.driver.workerUtilization`                             | `metrics.driver.workerUtilization`                                   | ✓                                       |
| **resource_utilization** | `glue.driver.memory.heap.[available\|used]`                 | `metrics.driver.memory.heap`                                         | ✓                                       |
| **resource_utilization** | `glue.driver.memory.heap.used.percentage`                   | `metrics.driver.memory.heap.used_percentage`                         | ✓                                       |
| **resource_utilization** | `glue.driver.memory.non-heap.*`                             | `metrics.driver.memory["non-heap"]`                                  | ✓                                       |
| **resource_utilization** | `glue.driver.disk.[available_GB\|used_GB\|used.percentage]` | `metrics.driver.disk`                                                | ✓                                       |
| **resource_utilization** | `glue.ALL.memory.*`, `glue.ALL.disk.*`                      | `metrics.ALL.memory`, `metrics.ALL.disk`                             | ✓                                       |
| **throughput**           | bytes/records per source/sink                               | `aws.glue.records.read/written`; aggregate bytes in driver.aggregate | Job-level; per-source/sink not modeled  |

**Error categories** we emit (on failure): `OUT_OF_MEMORY_ERROR`, `PERMISSION_ERROR`, `CONNECTION_ERROR`, `RESOURCE_NOT_FOUND_ERROR`, `THROTTLING_ERROR`, `SYNTAX_ERROR`, `GLUE_OPERATION_TIMEOUT_ERROR`, `S3_ERROR`, `UNCLASSIFIED_SPARK_ERROR`.

---

## 3. Continuous logging (monitor-continuous-logging.html)

- **Real-time logging:** We support both plain messages and **continuous-logging-style JSON** in `message` (jobName, jobRunId, level, message, timestamp, thread, logger, optional errorCode), so ingest pipelines can parse and map to `glue.parsed` or similar.
- **Logger levels:** Messages are chosen from info / warn / error pools (e.g. “Job run started”, “Job run succeeded”, “Job run failed”, Spark stage/shuffle/GC messages for glueetl).
- **Progress bar:** AWS progress bar format is “Stage N (Stage Name): (numCompletedTasks + numActiveTasks) / totalNumOfTasksInThisStage”. We don’t emit a dedicated progress-bar stream; our **Stage N (runJob) finished in X.XXX s** and task counts in metrics support similar progress views.
- **Log groups:** AWS uses `/aws-glue/jobs/error` and `/aws-glue/jobs/output`. We don’t set a log group in the event; that is typically determined by the ingest pipeline or destination.

---

## 4. Job run lifecycle and Spark-style messages

- **Run state:** `aws.glue.job.run_state` (RUNNING | SUCCEEDED | FAILED | STOPPED) and `event.outcome` (success | failure).
- **Duration:** `event.duration` (nanoseconds) and `metrics.driver.aggregate.elapsedTime` (milliseconds, ETL elapsed time).
- **Message pool includes:**
  - “Job run started”, “Job run started with 10 DPUs”, “Job run succeeded”, “Job run failed”
  - For **glueetl:** “Stage N (runJob) finished in X.XXX s”, “Shuffle read: X GB, Shuffle write: Y GB”, executor registration, GC/shuffle spill warnings, Parquet write.

---

## 5. Not covered / out of scope

- **Streaming-only metrics:** `glue.driver.streaming.numRecords`, `glue.driver.streaming.batchProcessingTimeInMs` (Glue 2.0+ streaming). We don’t generate streaming-specific events.
- **Per-executor metrics:** `glue.<executorId>.*` (per-executor JVM, S3, etc.). We only emit driver and ALL (executor aggregate).
- **Per-source / per-sink dimensions:** Observability throughput with Source/Sink dimensions. We emit job-level records/bytes only.
- **CloudWatch alarms setup:** Documented in [Setting up CloudWatch alarms on AWS Glue job profiles](https://docs.aws.amazon.com/glue/latest/dg/monitor-profile-glue-job-cloudwatch-alarms.html); no generator changes.

---

## 6. Regenerating samples

After any change to the Glue generator, run:

```bash
npm run samples
```

to refresh `samples/logs/glue.json` and `samples/metrics/glue.json`.
