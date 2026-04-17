/**
 * Azure Data & Analytics Pipeline chained event generator.
 *
 * Models a realistic multi-service data pipeline:
 *   Data Factory (orchestration) → Blob Storage (source Avro) → Databricks/Spark (process)
 *     → Blob Storage (output) → Purview (catalog) → Synapse Analytics (query)
 *
 * Returns 6-8 correlated log documents (each with __dataset for per-doc
 * index routing) PLUS 1 APM trace (transaction + 5-7 spans) that powers
 * the Elastic Service Map.
 *
 * Failure modes (selected by errorRate):
 *   1. Null / empty source files  – silent degradation through the full chain
 *   2. Incorrect file format       – AvroParseException, pipeline halts at Databricks
 *   3. Special characters in blob names – FileNotFoundException, pipeline halts at Databricks
 */

import {
  type EcsDocument,
  rand,
  randInt,
  randFloat,
  randId,
  randUUID,
  AZURE_REGIONS,
  randSubscription,
  randResourceGroup,
  azureCloud,
} from "./helpers.js";
import { azureServiceBase, enrichAzureTraceDoc } from "./traces/trace-kit.js";

const PIPELINE_NAMES = [
  "data_pipeline_daily",
  "analytics_etl_hourly",
  "warehouse_refresh",
  "customer_360_pipeline",
  "clickstream_processing",
];

const SOURCE_CONTAINERS = [
  "analytics-raw-ingest",
  "data-lake-landing",
  "event-collector",
  "partner-feeds",
  "iot-telemetry-landing",
];

const OUTPUT_CONTAINERS = [
  "analytics-processed",
  "warehouse-staging",
  "curated-lake",
  "feature-store-output",
  "reporting-datasets",
];

const AVRO_BLOBS = [
  "events/2025/04/16/hourly_events.avro",
  "transactions/2025/04/16/batch_001.avro",
  "clickstream/2025/04/16/session_data.avro",
  "customers/delta/customer_updates.avro",
  "iot/sensors/temperature_readings.avro",
];

const SPECIAL_CHAR_BLOBS = [
  "events/report+2025 Q1.avro",
  "data/región/año_2025.avro",
  "exports/client data (final).avro",
  "batch/file%20with%20spaces.avro",
  "uploads/résumé_données.avro",
];

const DBR_RUNTIMES = ["14.3 LTS", "15.1", "13.3 LTS"] as const;
const SYNAPSE_POOLS = ["analytics_pool", "dedicated_sql", "serverless_sql"];

const FAILURE_MODES = ["null_file", "wrong_format", "special_chars"] as const;
type FailureMode = (typeof FAILURE_MODES)[number];

function offsetTs(base: Date, ms: number): string {
  return new Date(base.getTime() + ms).toISOString();
}

function randSpanId(): string {
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

function randTraceId(): string {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

function adfDoc(
  ts: string,
  region: string,
  sub: { id: string; name: string },
  rg: string,
  pipelineName: string,
  runId: string,
  activityName: string,
  status: string,
  extra: Record<string, unknown> = {}
): EcsDocument {
  const resourceId = `/subscriptions/${sub.id}/resourceGroups/${rg}/providers/Microsoft.DataFactory/factories/adf-${rg}`;
  return {
    __dataset: "azure.data_factory",
    "@timestamp": ts,
    time: ts,
    resourceId,
    cloud: azureCloud(region, sub, "data-factory"),
    azure: {
      data_factory: {
        pipeline_name: pipelineName,
        run_id: runId,
        activity_name: activityName,
        status,
        execution_date: ts,
        ...extra,
      },
    },
    operationName: `Microsoft.DataFactory/factories/pipelines/${activityName}`,
    category: "PipelineRuns",
    resultType: status === "Failed" ? "Failed" : "Succeeded",
    event: {
      kind: "event",
      outcome: status === "Failed" ? "failure" : "success",
      category: ["process"],
      type: ["info"],
      dataset: "azure.data_factory",
      provider: "Microsoft.DataFactory",
    },
    message: `ADF [${pipelineName}/${activityName}]: status=${status}`,
    log: { level: status === "Failed" ? "error" : "info" },
    ...(status === "Failed"
      ? {
          error: {
            code: "ActivityFailure",
            message: `ADF activity ${activityName} failed`,
            type: "pipeline",
          },
        }
      : {}),
  };
}

export function generateAzureDataPipelineChain(ts: string, er: number): EcsDocument[] {
  const region = rand([...AZURE_REGIONS]);
  const sub = randSubscription();
  const rg = randResourceGroup();
  const pipelineName = rand(PIPELINE_NAMES);
  const runId = randUUID();
  const pipelineRunId = randUUID();
  const sourceContainer = rand(SOURCE_CONTAINERS);
  const outputContainer = rand(OUTPUT_CONTAINERS);
  const storageAccount = `st${randId(8).toLowerCase()}`;
  const dbrRuntime = rand([...DBR_RUNTIMES]);
  const workspaceName = `dbw-${randId(8).toLowerCase()}`;
  const clusterId = `${randInt(1000, 9999)}-${randId(6).toLowerCase()}`;
  const sparkAppId = `application_${Date.now()}_${randInt(1000, 9999)}`;
  const synapsePool = rand(SYNAPSE_POOLS);
  const synapseWorkspace = `syn-${randId(8).toLowerCase()}`;

  const isFailure = Math.random() < er;
  const failureMode: FailureMode | null = isFailure ? rand([...FAILURE_MODES]) : null;

  const sourceBlob = failureMode === "special_chars" ? rand(SPECIAL_CHAR_BLOBS) : rand(AVRO_BLOBS);
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
    pipeline_name: pipelineName,
    blob_source_container: sourceContainer,
    blob_source_path: sourceBlob,
  };

  // 1. Data Factory pipeline triggered
  docs.push({
    ...adfDoc(ts, region, sub, rg, pipelineName, runId, "trigger_pipeline", "InProgress", {
      ...pipelineLabels,
    }),
    labels: pipelineLabels,
  });

  // 2. Blob Storage GetBlob (source file)
  const blobGetTs = advance(100, 500);
  const sourceBytes = isNullFile ? 0 : randInt(50_000_000, 2_000_000_000);
  const blobResourceId = `/subscriptions/${sub.id}/resourceGroups/${rg}/providers/Microsoft.Storage/storageAccounts/${storageAccount}`;
  docs.push({
    __dataset: "azure.blob_storage",
    "@timestamp": blobGetTs,
    time: blobGetTs,
    resourceId: blobResourceId,
    cloud: azureCloud(region, sub, "blob-storage"),
    azure: {
      blob_storage: {
        storage_account: storageAccount,
        container_name: sourceContainer,
        blob_name: sourceBlob,
        operation_name: "GetBlob",
        status_code: 200,
        content_length: sourceBytes,
        request_id: randUUID(),
        caller: `serviceAccount:databricks-sp@${sub.id}`,
      },
    },
    operationName: "Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read",
    category: "StorageRead",
    event: {
      kind: "event",
      outcome: "success",
      category: ["file"],
      type: ["access"],
      dataset: "azure.blob_storage",
      provider: "Microsoft.Storage",
    },
    message: `Blob GetBlob ${storageAccount}/${sourceContainer}/${sourceBlob} (${sourceBytes} bytes)`,
    log: { level: "info" },
    labels: pipelineLabels,
  });

  // 3. Databricks / Spark job
  const dbrStartTs = advance(500, 2000);
  const sparkRecordsRead = isNullFile ? 0 : randInt(100_000, 10_000_000);
  const sparkDurationMs = randInt(30_000, 300_000);
  const dbrResourceId = `/subscriptions/${sub.id}/resourceGroups/${rg}/providers/Microsoft.Databricks/workspaces/${workspaceName}`;

  if (failureMode === "special_chars") {
    docs.push({
      __dataset: "azure.databricks",
      "@timestamp": dbrStartTs,
      time: dbrStartTs,
      resourceId: dbrResourceId,
      cloud: azureCloud(region, sub, "databricks"),
      azure: {
        databricks: {
          workspace_name: workspaceName,
          cluster_id: clusterId,
          runtime_version: dbrRuntime,
          spark_app_id: sparkAppId,
          state: "FAILED",
          exit_code: 1,
        },
      },
      operationName: "Microsoft.Databricks/workspaces/jobs/runs/submit",
      category: "jobs",
      resultType: "Failed",
      event: {
        kind: "event",
        outcome: "failure",
        category: ["process"],
        type: ["error"],
        dataset: "azure.databricks",
        provider: "Microsoft.Databricks",
      },
      error: {
        type: "java.io.FileNotFoundException",
        message: `No such file or directory: abfss://${sourceContainer}@${storageAccount}.dfs.core.windows.net/${sourceBlob}`,
        stack_trace: `java.io.FileNotFoundException: No such file or directory: abfss://${sourceContainer}@${storageAccount}.dfs.core.windows.net/${sourceBlob}\n\tat org.apache.hadoop.fs.azurebfs.AzureBlobFileSystemStore.getFileStatus(AzureBlobFileSystemStore.java:924)\n\tat org.apache.spark.sql.execution.datasources.InMemoryFileIndex.bulkListLeafFiles(InMemoryFileIndex.java:124)`,
      },
      message: `Databricks Spark [${sparkAppId}]: FAILED — FileNotFoundException: ${sourceBlob}`,
      log: { level: "error" },
      labels: pipelineLabels,
    });
  } else if (failureMode === "wrong_format") {
    docs.push({
      __dataset: "azure.databricks",
      "@timestamp": dbrStartTs,
      time: dbrStartTs,
      resourceId: dbrResourceId,
      cloud: azureCloud(region, sub, "databricks"),
      azure: {
        databricks: {
          workspace_name: workspaceName,
          cluster_id: clusterId,
          runtime_version: dbrRuntime,
          spark_app_id: sparkAppId,
          state: "FAILED",
          exit_code: 1,
        },
      },
      operationName: "Microsoft.Databricks/workspaces/jobs/runs/submit",
      category: "jobs",
      resultType: "Failed",
      event: {
        kind: "event",
        outcome: "failure",
        category: ["process"],
        type: ["error"],
        dataset: "azure.databricks",
        provider: "Microsoft.Databricks",
      },
      error: {
        type: "org.apache.avro.AvroParseException",
        message: `Not an Avro data file: abfss://${sourceContainer}@${storageAccount}.dfs.core.windows.net/${sourceBlob}`,
        stack_trace: `org.apache.avro.AvroParseException: Not an Avro data file\n\tat org.apache.avro.file.DataFileReader.openReader(DataFileReader.java:75)\n\tat org.apache.spark.sql.avro.AvroFileFormat.buildReader(AvroFileFormat.java:112)`,
      },
      message: `Databricks Spark [${sparkAppId}]: FAILED — AvroParseException: not an Avro data file`,
      log: { level: "error" },
      labels: pipelineLabels,
    });
  } else {
    const recordsWritten = isNullFile ? 0 : Math.floor(sparkRecordsRead * randFloat(0.6, 0.95));
    docs.push({
      __dataset: "azure.databricks",
      "@timestamp": dbrStartTs,
      time: dbrStartTs,
      resourceId: dbrResourceId,
      cloud: azureCloud(region, sub, "databricks"),
      azure: {
        databricks: {
          workspace_name: workspaceName,
          cluster_id: clusterId,
          runtime_version: dbrRuntime,
          spark_app_id: sparkAppId,
          state: "SUCCEEDED",
          duration_ms: sparkDurationMs,
          spark: {
            records_read: sparkRecordsRead,
            records_written: recordsWritten,
            stages_completed: randInt(3, 7),
            shuffle_bytes_written: isNullFile ? 0 : randInt(50, 2000) * 1024 * 1024,
          },
        },
      },
      operationName: "Microsoft.Databricks/workspaces/jobs/runs/submit",
      category: "jobs",
      resultType: "Succeeded",
      event: {
        kind: "event",
        outcome: "success",
        category: ["process"],
        type: ["info"],
        dataset: "azure.databricks",
        provider: "Microsoft.Databricks",
      },
      message: `Databricks Spark [${sparkAppId}]: SUCCEEDED — ${sparkRecordsRead} records read, ${recordsWritten} written`,
      log: { level: isNullFile ? "warn" : "info" },
      labels: pipelineLabels,
    });
  }

  if (!pipelineHalted) {
    // 4. Blob Storage PutBlob (output)
    const blobPutTs = advance(sparkDurationMs, sparkDurationMs + 5000);
    const outputBytes = isNullFile ? 0 : randInt(10_000_000, 1_500_000_000);
    const outputBlob = `processed/${pipelineName}/${new Date(ts).toISOString().slice(0, 10)}/output.parquet`;
    docs.push({
      __dataset: "azure.blob_storage",
      "@timestamp": blobPutTs,
      time: blobPutTs,
      resourceId: blobResourceId,
      cloud: azureCloud(region, sub, "blob-storage"),
      azure: {
        blob_storage: {
          storage_account: storageAccount,
          container_name: outputContainer,
          blob_name: outputBlob,
          operation_name: "PutBlob",
          status_code: 201,
          content_length: outputBytes,
          request_id: randUUID(),
          caller: `serviceAccount:databricks-sp@${sub.id}`,
        },
      },
      operationName: "Microsoft.Storage/storageAccounts/blobServices/containers/blobs/write",
      category: "StorageWrite",
      event: {
        kind: "event",
        outcome: "success",
        category: ["file"],
        type: ["creation"],
        dataset: "azure.blob_storage",
        provider: "Microsoft.Storage",
      },
      message: `Blob PutBlob ${storageAccount}/${outputContainer}/${outputBlob} (${outputBytes} bytes)`,
      log: { level: "info" },
      labels: {
        ...pipelineLabels,
        blob_output_container: outputContainer,
        blob_output_path: outputBlob,
      },
    });

    // 5. Purview scan/catalog
    const purviewTs = advance(2000, 8000);
    const assetsDiscovered = isNullFile ? 0 : randInt(1, 10);
    const purviewResourceId = `/subscriptions/${sub.id}/resourceGroups/${rg}/providers/Microsoft.Purview/accounts/purview-${rg}`;
    docs.push({
      __dataset: "azure.purview",
      "@timestamp": purviewTs,
      time: purviewTs,
      resourceId: purviewResourceId,
      cloud: azureCloud(region, sub, "purview"),
      azure: {
        purview: {
          scan_name: `scan-${pipelineName}`,
          state: "Succeeded",
          assets_discovered: assetsDiscovered,
          duration_sec: randInt(15, 120),
          target: `https://${storageAccount}.blob.core.windows.net/${outputContainer}/processed/${pipelineName}/`,
        },
      },
      operationName: "Microsoft.Purview/accounts/scan",
      category: "ScanStatusLogEvent",
      resultType: "Succeeded",
      event: {
        kind: "event",
        outcome: "success",
        category: ["database"],
        type: ["info"],
        dataset: "azure.purview",
        provider: "Microsoft.Purview",
      },
      message: `Purview [scan-${pipelineName}]: Succeeded — ${assetsDiscovered} assets discovered`,
      log: { level: "info" },
      labels: pipelineLabels,
    });

    // 6. Synapse Analytics query execution
    const synapseTs = advance(2000, 10000);
    const dataProcessed = isNullFile ? 0 : randInt(100_000_000, 5_000_000_000);
    const rowsReturned = isNullFile ? 0 : randInt(1000, 500_000);
    const synapseResourceId = `/subscriptions/${sub.id}/resourceGroups/${rg}/providers/Microsoft.Synapse/workspaces/${synapseWorkspace}`;
    docs.push({
      __dataset: "azure.synapse",
      "@timestamp": synapseTs,
      time: synapseTs,
      resourceId: synapseResourceId,
      cloud: azureCloud(region, sub, "synapse-workspace"),
      azure: {
        synapse: {
          workspace_name: synapseWorkspace,
          sql_pool: synapsePool,
          state: "Succeeded",
          data_processed_bytes: dataProcessed,
          rows_returned: rowsReturned,
          execution_time_ms: randInt(1000, 30000),
          query: `SELECT COUNT(*), SUM(amount) FROM ${pipelineName}_db.dbo.processed_data WHERE dt = '${new Date(ts).toISOString().slice(0, 10)}'`,
        },
      },
      operationName: "Microsoft.Synapse/workspaces/sqlPools/query",
      category: "SQLSecurityAuditEvents",
      resultType: "Succeeded",
      event: {
        kind: "event",
        outcome: "success",
        category: ["database"],
        type: ["info"],
        dataset: "azure.synapse",
        provider: "Microsoft.Synapse",
      },
      message: `Synapse [${synapsePool}]: Succeeded — processed ${dataProcessed} bytes, returned ${rowsReturned} rows`,
      log: { level: isNullFile && rowsReturned === 0 ? "warn" : "info" },
      labels: pipelineLabels,
    });
  }

  // 7. Data Factory pipeline completed
  const finalTs = advance(1000, 5000);
  const finalStatus = pipelineHalted ? "Failed" : "Succeeded";
  const qualityCheck = isNullFile ? "DEGRADED" : pipelineHalted ? "FAILED" : "PASSED";
  docs.push({
    ...adfDoc(finalTs, region, sub, rg, pipelineName, runId, "pipeline_complete", finalStatus, {
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
  const svc = azureServiceBase("adf-data-pipeline", "production", "python", {
    framework: "Azure Data Factory",
    runtimeName: "Python",
    runtimeVersion: "3.11.8",
  });

  const txDoc = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: `pipeline_run:${pipelineName}`,
        type: "pipeline",
        duration: { us: totalPipelineUs },
        result: pipelineHalted ? "failure" : "success",
        sampled: true,
        span_count: { started: pipelineHalted ? 3 : 6, dropped: 0 },
      },
      service: svc,
      cloud: azureCloud(region, sub, "data-factory"),
      labels: { pipeline_run_id: pipelineRunId, pipeline_name: pipelineName },
      event: { outcome: pipelineHalted ? "failure" : "success" },
    },
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
    const sid = randSpanId();
    const spanTs = offsetTs(baseDate, spanOffsetMs);
    spanOffsetMs += durationUs / 1000 + randInt(50, 500);
    return enrichAzureTraceDoc(
      {
        "@timestamp": spanTs,
        processor: { name: "transaction", event: "span" },
        trace: { id: traceId },
        transaction: { id: txId },
        parent: { id: txId },
        span: {
          id: sid,
          type,
          subtype,
          name,
          duration: { us: durationUs },
          action: type === "storage" ? (name.includes("Put") ? "write" : "read") : "execute",
          destination: { service: { resource: destResource, type, name: destResource } },
          ...extra,
        },
        event: { outcome },
      },
      traceId,
      "python"
    );
  };

  // Span 1: Blob GetBlob
  traceSpans.push(
    makeSpan(
      "blob.GetBlob",
      "storage",
      "blob",
      randInt(100, 500) * 1000,
      `blob-${storageAccount}`,
      "success"
    )
  );

  // Span 2: Databricks/Spark processing
  const dbrOutcome = pipelineHalted ? "failure" : "success";
  const dbrSpan = makeSpan(
    `databricks.SubmitRun [${workspaceName}]`,
    "compute",
    "databricks",
    sparkDurationMs * 1000,
    `databricks-${workspaceName}`,
    dbrOutcome
  );
  if (pipelineHalted) {
    (dbrSpan as Record<string, unknown>).error =
      failureMode === "wrong_format"
        ? { type: "AvroParseException", message: "Not an Avro data file" }
        : { type: "FileNotFoundException", message: `Blob not found: ${sourceBlob}` };
  }
  traceSpans.push(dbrSpan);

  if (!pipelineHalted) {
    // Spark sub-spans
    const dbrSpanId = (dbrSpan.span as Record<string, unknown> & { id: string }).id;
    const stageCount = randInt(3, 6);
    for (let i = 0; i < stageCount; i++) {
      const stageUs = Math.floor(((sparkDurationMs * 1000) / stageCount) * randFloat(0.6, 1.4));
      traceSpans.push(
        enrichAzureTraceDoc(
          {
            "@timestamp": offsetTs(baseDate, spanOffsetMs),
            processor: { name: "transaction", event: "span" },
            trace: { id: traceId },
            transaction: { id: txId },
            parent: { id: dbrSpanId },
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
          traceId,
          "python"
        )
      );
    }

    // Span 3: Blob PutBlob (output)
    traceSpans.push(
      makeSpan(
        "blob.PutBlob",
        "storage",
        "blob",
        randInt(200, 1000) * 1000,
        `blob-${storageAccount}`,
        "success"
      )
    );

    // Span 4: Purview scan
    traceSpans.push(
      makeSpan(
        "purview.Scan",
        "catalog",
        "purview",
        randInt(5000, 30000) * 1000,
        "purview-catalog",
        "success"
      )
    );

    // Span 5: Synapse query
    const synRows = isNullFile ? 0 : randInt(1000, 500_000);
    traceSpans.push(
      makeSpan(
        "synapse.SqlQuery",
        "query",
        "synapse",
        randInt(1000, 15000) * 1000,
        `synapse-${synapsePool}`,
        "success",
        isNullFile
          ? { db: { type: "sql", rows_affected: 0, statement: "SELECT ... (0 rows returned)" } }
          : { db: { type: "sql", rows_affected: synRows } }
      )
    );
  }

  const traceDocs = [txDoc, ...traceSpans];
  for (const td of traceDocs) {
    (td as Record<string, unknown>).__dataset = "apm";
  }

  return [...docs, ...traceDocs];
}
