/**
 * GCP Data & Analytics Pipeline chained event generator.
 *
 * Models a realistic multi-service data pipeline:
 *   Composer (Airflow) → GCS (source Avro) → Dataproc/Spark (process)
 *     → GCS (output) → Data Catalog (catalog) → BigQuery (query)
 *
 * Returns 6-8 correlated log documents (each with __dataset for per-doc
 * index routing) PLUS 1 APM trace (transaction + 5-7 spans) that powers
 * the Elastic Service Map.
 *
 * Failure modes (selected by errorRate):
 *   1. Null / empty source files  – silent degradation through the full chain
 *   2. Incorrect file format       – AvroParseException, pipeline halts at Dataproc
 *   3. Special characters in GCS keys – IOException, pipeline halts at Dataproc
 */

import {
  type EcsDocument,
  rand,
  randInt,
  randFloat,
  randId,
  randUUID,
  gcpCloud,
  makeGcpSetup,
  randTraceId,
  randSpanId,
} from "./helpers.js";
import { gcpServiceBase, enrichGcpTraceDoc } from "./traces/trace-kit.js";

const DAG_NAMES = [
  "data_pipeline_daily",
  "analytics_etl_hourly",
  "warehouse_refresh",
  "customer_360_pipeline",
  "clickstream_processing",
];

const SOURCE_BUCKETS = [
  "analytics-raw-ingest",
  "data-lake-landing",
  "event-collector-output",
  "partner-feeds-gcs",
  "iot-telemetry-landing",
];

const OUTPUT_BUCKETS = [
  "analytics-processed",
  "warehouse-staging",
  "curated-data-lake",
  "feature-store-output",
  "reporting-datasets",
];

const AVRO_KEYS = [
  "events/2025/04/16/hourly_events.avro",
  "transactions/2025/04/16/batch_001.avro",
  "clickstream/2025/04/16/session_data.avro",
  "customers/delta/customer_updates.avro",
  "iot/sensors/temperature_readings.avro",
];

const SPECIAL_CHAR_KEYS = [
  "events/report+2025 Q1.avro",
  "data/région/année_2025.avro",
  "exports/client data (final).avro",
  "batch/file%20with%20spaces.avro",
  "uploads/résumé_données.avro",
];

const DATAPROC_IMAGES = ["2.1-debian11", "2.2-ubuntu22", "2.1-rocky8"] as const;

const BQ_DATASETS = ["analytics", "reporting", "data_warehouse", "ml_features"];

const FAILURE_MODES = ["null_file", "wrong_format", "special_chars"] as const;
type FailureMode = (typeof FAILURE_MODES)[number];

function offsetTs(base: Date, ms: number): string {
  return new Date(base.getTime() + ms).toISOString();
}

function composerDoc(
  ts: string,
  region: string,
  project: { id: string; name: string; number: string },
  dagId: string,
  runId: string,
  taskId: string,
  state: string,
  extra: Record<string, unknown> = {}
): EcsDocument {
  return {
    __dataset: "gcp.composer",
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "composer"),
    gcp: {
      composer: {
        environment_name: `composer-${project.id.split("-")[0]}-prod`,
        dag_id: dagId,
        run_id: runId,
        task_id: taskId,
        state,
        execution_date: ts,
        ...extra,
      },
    },
    event: {
      kind: "event",
      outcome: state === "failed" ? "failure" : "success",
      category: ["process"],
      type: ["info"],
      dataset: "gcp.composer",
      provider: "composer.googleapis.com",
    },
    message: `Airflow [${dagId}/${taskId}]: state=${state}`,
    log: { level: state === "failed" ? "error" : "info" },
    ...(state === "failed"
      ? {
          error: {
            code: "TaskFailure",
            message: `Airflow task ${taskId} failed`,
            type: "pipeline",
          },
        }
      : {}),
  };
}

export function generateGcpDataPipelineChain(ts: string, er: number): EcsDocument[] {
  const { region, project } = makeGcpSetup(0);
  const dagId = rand(DAG_NAMES);
  const runId = `scheduled__${ts.replace(/[:.]/g, "_")}`;
  const pipelineRunId = randUUID();
  const sourceBucket = rand(SOURCE_BUCKETS);
  const outputBucket = rand(OUTPUT_BUCKETS);
  const clusterName = `dataproc-${rand(["etl", "analytics", "spark"])}`;
  const clusterUuid = randUUID();
  const imageVersion = rand([...DATAPROC_IMAGES]);
  const bqDataset = rand(BQ_DATASETS);
  const jobId = `job_${randId(20).toLowerCase()}`;
  const sparkAppId = `application_${Date.now()}_${randInt(1000, 9999)}`;
  const crawlerName = `catalog-${rand(["updater", "scanner", "discovery"])}`;
  const bqJobId = `bqjob_${randId(12)}`;

  const isFailure = Math.random() < er;
  const failureMode: FailureMode | null = isFailure ? rand([...FAILURE_MODES]) : null;

  const sourceKey = failureMode === "special_chars" ? rand(SPECIAL_CHAR_KEYS) : rand(AVRO_KEYS);
  const isNullFile = failureMode === "null_file";
  const pipelineHalted = failureMode === "wrong_format" || failureMode === "special_chars";

  const baseDate = new Date(ts);
  let offsetMs = 0;
  const advance = (minMs: number, maxMs: number) => {
    offsetMs += randInt(minMs, maxMs);
    return offsetTs(baseDate, offsetMs);
  };

  const docs: EcsDocument[] = [];

  const pipelineLabels = {
    pipeline_run_id: pipelineRunId,
    dag_id: dagId,
    gcs_source_bucket: sourceBucket,
    gcs_source_key: sourceKey,
  };

  // 1. Composer DAG triggered
  docs.push({
    ...composerDoc(ts, region, project, dagId, runId, "trigger_dag", "running", {
      operator: "TriggerDagRunOperator",
      ...pipelineLabels,
    }),
    labels: pipelineLabels,
  });

  // 2. GCS GetObject (source file)
  const gcsGetTs = advance(100, 500);
  const sourceBytes = isNullFile ? 0 : randInt(50_000_000, 2_000_000_000);
  docs.push({
    __dataset: "gcp.gcs",
    "@timestamp": gcsGetTs,
    cloud: gcpCloud(region, project, "cloud-storage"),
    gcp: {
      cloud_storage: {
        bucket_name: sourceBucket,
        object_name: sourceKey,
        method_name: "storage.objects.get",
        http_status: 200,
        bytes_sent: sourceBytes,
        time_taken_ms: randInt(10, 200),
        requester: `serviceAccount:dataproc-sa@${project.id}.iam.gserviceaccount.com`,
      },
    },
    event: {
      kind: "event",
      outcome: "success",
      category: ["file"],
      type: ["access"],
      dataset: "gcp.gcs",
      provider: "storage.googleapis.com",
    },
    message: `GCS GetObject gs://${sourceBucket}/${sourceKey} (${sourceBytes} bytes)`,
    log: { level: "info" },
    labels: pipelineLabels,
  });

  // 3. Dataproc / Spark job
  const dpStartTs = advance(500, 2000);
  const sparkRecordsRead = isNullFile ? 0 : randInt(100_000, 10_000_000);
  const sparkDurationMs = randInt(30_000, 300_000);

  if (failureMode === "special_chars") {
    docs.push({
      __dataset: "gcp.dataproc",
      "@timestamp": dpStartTs,
      cloud: gcpCloud(region, project, "dataproc"),
      gcp: {
        dataproc: {
          cluster_name: clusterName,
          cluster_uuid: clusterUuid,
          image_version: imageVersion,
          job_id: jobId,
          spark_app_id: sparkAppId,
          state: "ERROR",
          exit_code: 1,
        },
      },
      event: {
        kind: "event",
        outcome: "failure",
        category: ["process"],
        type: ["error"],
        dataset: "gcp.dataproc",
        provider: "dataproc.googleapis.com",
      },
      error: {
        type: "java.io.FileNotFoundException",
        message: `No such file or directory: gs://${sourceBucket}/${sourceKey}`,
        stack_trace: `java.io.FileNotFoundException: No such file or directory: gs://${sourceBucket}/${sourceKey}\n\tat com.google.cloud.hadoop.gcsio.GoogleCloudStorageFileSystem.getFileInfo(GoogleCloudStorageFileSystem.java:1024)\n\tat org.apache.spark.sql.execution.datasources.InMemoryFileIndex.bulkListLeafFiles(InMemoryFileIndex.java:124)`,
      },
      message: `Dataproc Spark [${sparkAppId}]: ERROR — FileNotFoundException: gs://${sourceBucket}/${sourceKey}`,
      log: { level: "error" },
      labels: pipelineLabels,
    });
  } else if (failureMode === "wrong_format") {
    docs.push({
      __dataset: "gcp.dataproc",
      "@timestamp": dpStartTs,
      cloud: gcpCloud(region, project, "dataproc"),
      gcp: {
        dataproc: {
          cluster_name: clusterName,
          cluster_uuid: clusterUuid,
          image_version: imageVersion,
          job_id: jobId,
          spark_app_id: sparkAppId,
          state: "ERROR",
          exit_code: 1,
        },
      },
      event: {
        kind: "event",
        outcome: "failure",
        category: ["process"],
        type: ["error"],
        dataset: "gcp.dataproc",
        provider: "dataproc.googleapis.com",
      },
      error: {
        type: "org.apache.avro.AvroParseException",
        message: `Not an Avro data file: gs://${sourceBucket}/${sourceKey}`,
        stack_trace: `org.apache.avro.AvroParseException: Not an Avro data file\n\tat org.apache.avro.file.DataFileReader.openReader(DataFileReader.java:75)\n\tat org.apache.spark.sql.avro.AvroFileFormat.buildReader(AvroFileFormat.java:112)`,
      },
      message: `Dataproc Spark [${sparkAppId}]: ERROR — AvroParseException: not an Avro data file`,
      log: { level: "error" },
      labels: pipelineLabels,
    });
  } else {
    const recordsWritten = isNullFile ? 0 : Math.floor(sparkRecordsRead * randFloat(0.6, 0.95));
    docs.push({
      __dataset: "gcp.dataproc",
      "@timestamp": dpStartTs,
      cloud: gcpCloud(region, project, "dataproc"),
      gcp: {
        dataproc: {
          cluster_name: clusterName,
          cluster_uuid: clusterUuid,
          image_version: imageVersion,
          job_id: jobId,
          spark_app_id: sparkAppId,
          state: "DONE",
          duration_ms: sparkDurationMs,
          spark: {
            records_read: sparkRecordsRead,
            records_written: recordsWritten,
            stages_completed: randInt(3, 7),
            shuffle_bytes_written: isNullFile ? 0 : randInt(50, 2000) * 1024 * 1024,
          },
        },
      },
      event: {
        kind: "event",
        outcome: "success",
        category: ["process"],
        type: ["info"],
        dataset: "gcp.dataproc",
        provider: "dataproc.googleapis.com",
      },
      message: `Dataproc Spark [${sparkAppId}]: DONE — ${sparkRecordsRead} records read, ${recordsWritten} written`,
      log: { level: isNullFile ? "warn" : "info" },
      labels: pipelineLabels,
    });
  }

  if (!pipelineHalted) {
    // 4. GCS PutObject (output)
    const gcsPutTs = advance(sparkDurationMs, sparkDurationMs + 5000);
    const outputBytes = isNullFile ? 0 : randInt(10_000_000, 1_500_000_000);
    const outputKey = `processed/${dagId}/${new Date(ts).toISOString().slice(0, 10)}/output.parquet`;
    docs.push({
      __dataset: "gcp.gcs",
      "@timestamp": gcsPutTs,
      cloud: gcpCloud(region, project, "cloud-storage"),
      gcp: {
        cloud_storage: {
          bucket_name: outputBucket,
          object_name: outputKey,
          method_name: "storage.objects.create",
          http_status: 200,
          bytes_sent: outputBytes,
          time_taken_ms: randInt(20, 500),
          requester: `serviceAccount:dataproc-sa@${project.id}.iam.gserviceaccount.com`,
        },
      },
      event: {
        kind: "event",
        outcome: "success",
        category: ["file"],
        type: ["creation"],
        dataset: "gcp.gcs",
        provider: "storage.googleapis.com",
      },
      message: `GCS PutObject gs://${outputBucket}/${outputKey} (${outputBytes} bytes)`,
      log: { level: "info" },
      labels: { ...pipelineLabels, gcs_output_bucket: outputBucket, gcs_output_key: outputKey },
    });

    // 5. Data Catalog entry update
    const catalogTs = advance(2000, 8000);
    const tablesUpdated = isNullFile ? 0 : randInt(1, 5);
    docs.push({
      __dataset: "gcp.data_catalog",
      "@timestamp": catalogTs,
      cloud: gcpCloud(region, project, "data-catalog"),
      gcp: {
        data_catalog: {
          entry_group: `projects/${project.id}/locations/${region}/entryGroups/${dagId}_catalog`,
          crawler_name: crawlerName,
          state: "SUCCEEDED",
          tables_updated: tablesUpdated,
          duration_sec: randInt(15, 120),
          target: `gs://${outputBucket}/processed/${dagId}/`,
        },
      },
      event: {
        kind: "event",
        outcome: "success",
        category: ["database"],
        type: ["info"],
        dataset: "gcp.data_catalog",
        provider: "datacatalog.googleapis.com",
      },
      message: `Data Catalog [${crawlerName}]: SUCCEEDED — ${tablesUpdated} entries updated`,
      log: { level: "info" },
      labels: pipelineLabels,
    });

    // 6. BigQuery query execution
    const bqTs = advance(2000, 10000);
    const bytesProcessed = isNullFile ? 0 : randInt(100_000_000, 5_000_000_000);
    const rowsReturned = isNullFile ? 0 : randInt(1000, 500_000);
    docs.push({
      __dataset: "gcp.bigquery",
      "@timestamp": bqTs,
      cloud: gcpCloud(region, project, "bigquery"),
      gcp: {
        bigquery: {
          job_id: bqJobId,
          project_id: project.id,
          dataset_id: bqDataset,
          state: "DONE",
          bytes_processed: bytesProcessed,
          rows_returned: rowsReturned,
          total_slot_ms: randInt(1000, 60000),
          execution_time_ms: randInt(1000, 30000),
          query: `SELECT COUNT(*), SUM(amount) FROM \`${project.id}.${bqDataset}.processed_data\` WHERE dt = '${new Date(ts).toISOString().slice(0, 10)}'`,
        },
      },
      event: {
        kind: "event",
        outcome: "success",
        category: ["database"],
        type: ["info"],
        dataset: "gcp.bigquery",
        provider: "bigquery.googleapis.com",
      },
      message: `BigQuery [${bqDataset}]: DONE — processed ${bytesProcessed} bytes, returned ${rowsReturned} rows`,
      log: { level: isNullFile && rowsReturned === 0 ? "warn" : "info" },
      labels: pipelineLabels,
    });
  }

  // 7. Composer DAG completed
  const finalTs = advance(1000, 5000);
  const finalState = pipelineHalted ? "failed" : "success";
  const qualityCheck = isNullFile ? "DEGRADED" : pipelineHalted ? "FAILED" : "PASSED";
  docs.push({
    ...composerDoc(finalTs, region, project, dagId, runId, "dag_complete", finalState, {
      operator: "DagRunSensor",
      duration_ms: offsetMs,
      quality_check: qualityCheck,
      records_processed: isNullFile ? 0 : pipelineHalted ? 0 : sparkRecordsRead,
      ...pipelineLabels,
    }),
    labels: { ...pipelineLabels, quality_check: qualityCheck },
  });

  // APM Trace (transaction + spans for Service Map)
  const traceId = randTraceId();
  const txId = randSpanId();
  const totalPipelineUs = offsetMs * 1000;
  const svc = gcpServiceBase("composer-data-pipeline", "production", "python", {
    framework: "Apache Airflow",
    runtimeName: "Python",
    runtimeVersion: "3.11.8",
  });

  const txDoc = enrichGcpTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: `dag_run:${dagId}`,
        type: "pipeline",
        duration: { us: totalPipelineUs },
        result: pipelineHalted ? "failure" : "success",
        sampled: true,
        span_count: { started: pipelineHalted ? 3 : 6, dropped: 0 },
      },
      service: svc,
      cloud: gcpCloud(region, project, "composer"),
      labels: { pipeline_run_id: pipelineRunId, dag_id: dagId },
      event: { outcome: pipelineHalted ? "failure" : "success" },
    },
    project.id,
    traceId,
    "python"
  );

  const traceSpans: EcsDocument[] = [];
  let spanOffsetMs = 0;

  const makeSpan = (
    name: string,
    type: string,
    subtype: string,
    durationUs: number,
    destResource: string,
    outcome: string,
    extra: Record<string, unknown> = {}
  ): EcsDocument => {
    const spanId = randSpanId();
    const spanTs = offsetTs(baseDate, spanOffsetMs);
    spanOffsetMs += durationUs / 1000 + randInt(50, 500);
    return enrichGcpTraceDoc(
      {
        "@timestamp": spanTs,
        processor: { name: "transaction", event: "span" },
        trace: { id: traceId },
        transaction: { id: txId },
        parent: { id: txId },
        span: {
          id: spanId,
          type,
          subtype,
          name,
          duration: { us: durationUs },
          action: type === "storage" ? (name.includes("Create") ? "write" : "read") : "execute",
          destination: { service: { resource: destResource, type, name: destResource } },
          ...extra,
        },
        event: { outcome },
      },
      project.id,
      traceId,
      "python"
    );
  };

  // Span 1: GCS GetObject
  traceSpans.push(
    makeSpan(
      "gcs.objects.get",
      "storage",
      "gcs",
      randInt(100, 500) * 1000,
      `gcs-${sourceBucket}`,
      "success"
    )
  );

  // Span 2: Dataproc/Spark processing
  const dpOutcome = pipelineHalted ? "failure" : "success";
  const dpSpan = makeSpan(
    `dataproc.SubmitJob [${clusterName}]`,
    "compute",
    "dataproc",
    sparkDurationMs * 1000,
    `dataproc-${clusterName}`,
    dpOutcome
  );
  if (pipelineHalted) {
    (dpSpan as Record<string, unknown>).error =
      failureMode === "wrong_format"
        ? { type: "AvroParseException", message: "Not an Avro data file" }
        : {
            type: "FileNotFoundException",
            message: `Path not found: gs://${sourceBucket}/${sourceKey}`,
          };
  }
  traceSpans.push(dpSpan);

  if (!pipelineHalted) {
    // Spark sub-spans
    const dpSpanId = (dpSpan.span as Record<string, unknown> & { id: string }).id;
    const stageCount = randInt(3, 6);
    for (let i = 0; i < stageCount; i++) {
      const stageUs = Math.floor(((sparkDurationMs * 1000) / stageCount) * randFloat(0.6, 1.4));
      traceSpans.push(
        enrichGcpTraceDoc(
          {
            "@timestamp": offsetTs(baseDate, spanOffsetMs),
            processor: { name: "transaction", event: "span" },
            trace: { id: traceId },
            transaction: { id: txId },
            parent: { id: dpSpanId },
            span: {
              id: randSpanId(),
              type: "compute",
              subtype: "spark",
              name: `spark.stage.${i}`,
              duration: { us: stageUs },
              action: "execute",
            },
            labels: {
              spark_stage_id: String(i),
              spark_input_records: String(isNullFile ? 0 : randInt(50_000, 5_000_000)),
            },
            event: { outcome: "success" },
          },
          project.id,
          traceId,
          "python"
        )
      );
    }

    // Span 3: GCS PutObject (output)
    traceSpans.push(
      makeSpan(
        "gcs.objects.create",
        "storage",
        "gcs",
        randInt(200, 1000) * 1000,
        `gcs-${outputBucket}`,
        "success"
      )
    );

    // Span 4: Data Catalog update
    traceSpans.push(
      makeSpan(
        "datacatalog.UpdateEntry",
        "catalog",
        "data-catalog",
        randInt(5000, 30000) * 1000,
        "data-catalog",
        "success"
      )
    );

    // Span 5: BigQuery query
    const bqRows = isNullFile ? 0 : randInt(1000, 500_000);
    traceSpans.push(
      makeSpan(
        "bigquery.jobs.query",
        "query",
        "bigquery",
        randInt(1000, 15000) * 1000,
        `bigquery-${bqDataset}`,
        "success",
        isNullFile
          ? { db: { type: "sql", rows_affected: 0, statement: "SELECT ... (0 rows returned)" } }
          : { db: { type: "sql", rows_affected: bqRows } }
      )
    );
  }

  const traceDocs = [txDoc, ...traceSpans];
  for (const td of traceDocs) {
    (td as Record<string, unknown>).__dataset = "apm";
  }

  return [...docs, ...traceDocs];
}
