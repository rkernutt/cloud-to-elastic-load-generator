/**
 * Data & Analytics Pipeline chained event generator.
 *
 * Models a realistic multi-service data pipeline:
 *   MWAA (Airflow) → S3 (source Avro) → EMR/Spark (process)
 *     → S3 (output) → Glue (catalog) → Athena (query)
 *
 * Returns correlated log documents (each with __dataset for per-doc
 * index routing), companion CloudTrail audit events for every API call,
 * and 1 APM trace (transaction + spans) that powers the Elastic Service Map.
 *
 * Every document carries ECS user identity (`user.name`, `user.email`,
 * `source.ip`, `user_agent.original`) for cross-event correlation.
 *
 * Failure modes (selected by errorRate):
 *   1. Null / empty source files  – silent degradation through the full chain
 *   2. Incorrect file format       – AvroParseException, pipeline halts at EMR
 *   3. Special characters in S3 keys – IOException, pipeline halts at EMR
 */

import { rand, randInt, randFloat, randId, randUUID, randAccount, REGIONS } from "../../helpers";
import {
  randHumanUser,
  randSourceIp,
  randPipelineUserAgent,
  ecsIdentityFields,
  awsCloudTrailIdentity,
  awsCloudTrailEvent,
} from "../../helpers/identity.js";
import {
  TRACE_ACCOUNTS,
  newTraceId,
  newSpanId,
  offsetTs,
  serviceBlock,
  otelBlocks,
} from "./traces/helpers.js";
import type { EcsDocument } from "./types.js";

// ── Pipeline configuration templates ────────────────────────────────────────

const DAG_NAMES = [
  "data_pipeline_daily",
  "analytics_etl_hourly",
  "warehouse_refresh",
  "customer_360_pipeline",
  "clickstream_processing",
];

const SOURCE_BUCKETS = [
  "analytics-raw-data",
  "data-lake-ingest",
  "event-collector-output",
  "partner-feeds",
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
  "data/región/año_2025.avro",
  "exports/client data (final).avro",
  "batch/file%20with%20spaces.avro",
  "uploads/résumé_données.avro",
];

const EMR_COMPUTE_MODES = ["ec2", "serverless", "eks"] as const;
type EmrComputeMode = (typeof EMR_COMPUTE_MODES)[number];

const GLUE_CRAWLERS = [
  "analytics-crawler",
  "catalog-updater",
  "schema-discovery",
  "partition-scanner",
];

const ATHENA_WORKGROUPS = ["primary", "analytics-team", "bi-workgroup", "data-science"];

const FAILURE_MODES = ["null_file", "wrong_format", "special_chars"] as const;
type FailureMode = (typeof FAILURE_MODES)[number];

// ── Helper to build MWAA/Airflow log documents ─────────────────────────────

function mwaaDoc(
  ts: string,
  region: string,
  acct: { id: string; name: string },
  dagId: string,
  runId: string,
  taskId: string,
  state: string,
  extra: Record<string, unknown> = {}
): EcsDocument {
  return {
    __dataset: "aws.mwaa",
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "mwaa" },
    },
    aws: {
      dimensions: { DagId: dagId, TaskId: taskId },
      mwaa: {
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
      dataset: "aws.mwaa",
      provider: "airflow.amazonaws.com",
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

// ── Main chain generator ────────────────────────────────────────────────────

export function generateDataPipelineChain(ts: string, er: number): EcsDocument[] {
  const region = rand(REGIONS);
  const acct = randAccount();
  const dagId = rand(DAG_NAMES);
  const runId = `scheduled__${ts.replace(/[:.]/g, "_")}`;
  const pipelineRunId = randUUID();
  const sourceBucket = rand(SOURCE_BUCKETS);
  const outputBucket = rand(OUTPUT_BUCKETS);
  const computeMode: EmrComputeMode = rand([...EMR_COMPUTE_MODES]);
  const crawlerName = rand(GLUE_CRAWLERS);
  const workgroup = rand(ATHENA_WORKGROUPS);
  const queryExecutionId = randUUID();
  const clusterId = `j-${randId(13).toUpperCase()}`;
  const stepId = `s-${randId(13).toUpperCase()}`;
  const sparkAppId = `application_${Date.now()}_${randInt(1000, 9999)}`;

  // Pick a consistent user identity for the entire pipeline run
  const triggerUser = randHumanUser();
  const triggerIp = randSourceIp();
  const triggerUa = randPipelineUserAgent();
  const identity = ecsIdentityFields(triggerUser, triggerIp, triggerUa);
  const ctIdentity = awsCloudTrailIdentity(acct.id, triggerUser, triggerIp, triggerUa);
  const svcRoleIdentity = awsCloudTrailIdentity(
    acct.id,
    { name: "mwaa-execution-role", email: "mwaa@internal", department: "service" },
    triggerIp,
    "aws-internal/2",
    true
  );

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

  // Shared labels for correlation
  const pipelineLabels = {
    pipeline_run_id: pipelineRunId,
    dag_id: dagId,
    s3_source_bucket: sourceBucket,
    s3_source_key: sourceKey,
  };

  // ── 1. MWAA DAG triggered ─────────────────────────────────────────────────
  docs.push({
    ...mwaaDoc(ts, region, acct, dagId, runId, "trigger_dag", "running", {
      operator: "TriggerDagRunOperator",
      ...pipelineLabels,
    }),
    ...identity,
    labels: pipelineLabels,
  });

  // CloudTrail: user triggered the DAG via MWAA API
  docs.push(
    awsCloudTrailEvent(
      ts,
      region,
      acct,
      ctIdentity,
      "InvokeRestApi",
      "airflow.amazonaws.com",
      { Name: dagId, RestApiPath: `/dags/${dagId}/dagRuns`, RestApiMethod: "POST" },
      { RestApiStatusCode: 200, RestApiResponse: JSON.stringify({ dag_run_id: runId }) },
      "success"
    ) as EcsDocument
  );

  // ── 2. S3 GetObject (source file) ─────────────────────────────────────────
  const s3GetTs = advance(100, 500);
  const sourceBytes = isNullFile ? 0 : randInt(50_000_000, 2_000_000_000);
  docs.push({
    __dataset: "aws.s3access",
    "@timestamp": s3GetTs,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "s3" },
    },
    aws: {
      s3access: {
        bucket: sourceBucket,
        key: sourceKey,
        operation: "REST.GET.OBJECT",
        http_status: 200,
        bytes_sent: sourceBytes,
        total_time: randInt(10, 200),
        turn_around_time: randInt(5, 50),
        request_id: randId(16).toUpperCase(),
        requester: `arn:aws:iam::${acct.id}:role/emr-service-role`,
      },
    },
    event: {
      kind: "event",
      outcome: "success",
      category: ["file"],
      type: ["access"],
      dataset: "aws.s3access",
      provider: "s3.amazonaws.com",
    },
    message: `S3 GetObject s3://${sourceBucket}/${sourceKey} (${sourceBytes} bytes)`,
    log: { level: "info" },
    ...identity,
    labels: pipelineLabels,
  });

  // CloudTrail: S3 GetObject data event (service role)
  docs.push(
    awsCloudTrailEvent(
      s3GetTs,
      region,
      acct,
      svcRoleIdentity,
      "GetObject",
      "s3.amazonaws.com",
      { bucketName: sourceBucket, key: sourceKey },
      { "x-amz-request-id": randId(16).toUpperCase() },
      "success",
      { event_category: "Data" }
    ) as EcsDocument
  );

  // ── 3. EMR Step / Spark job ───────────────────────────────────────────────
  const emrStartTs = advance(500, 2000);
  const sparkRecordsRead = isNullFile ? 0 : randInt(100_000, 10_000_000);
  const sparkDurationMs = randInt(30_000, 300_000);

  if (failureMode === "special_chars") {
    docs.push({
      __dataset: "aws.emr",
      "@timestamp": emrStartTs,
      cloud: {
        provider: "aws",
        region,
        account: { id: acct.id, name: acct.name },
        service: { name: "emr" },
      },
      aws: {
        dimensions: { ClusterId: clusterId, StepId: stepId },
        emr: {
          cluster_id: clusterId,
          step_id: stepId,
          spark_app_id: sparkAppId,
          compute_mode: computeMode,
          state: "FAILED",
          exit_code: 1,
        },
      },
      event: {
        kind: "event",
        outcome: "failure",
        category: ["process"],
        type: ["error"],
        dataset: "aws.emr",
        provider: "emr.amazonaws.com",
      },
      error: {
        type: "java.io.FileNotFoundException",
        message: `No such file or directory: s3://${sourceBucket}/${sourceKey}`,
        stack_trace: `java.io.FileNotFoundException: No such file or directory: s3://${sourceBucket}/${sourceKey}\n\tat org.apache.hadoop.fs.s3a.S3AFileSystem.getFileStatus(S3AFileSystem.java:3350)\n\tat org.apache.spark.sql.execution.datasources.InMemoryFileIndex.bulkListLeafFiles(InMemoryFileIndex.java:124)`,
      },
      message: `EMR Spark [${sparkAppId}]: FAILED — FileNotFoundException: s3://${sourceBucket}/${sourceKey}`,
      log: { level: "error" },
      ...identity,
      labels: pipelineLabels,
    });
  } else if (failureMode === "wrong_format") {
    docs.push({
      __dataset: "aws.emr",
      "@timestamp": emrStartTs,
      cloud: {
        provider: "aws",
        region,
        account: { id: acct.id, name: acct.name },
        service: { name: "emr" },
      },
      aws: {
        dimensions: { ClusterId: clusterId, StepId: stepId },
        emr: {
          cluster_id: clusterId,
          step_id: stepId,
          spark_app_id: sparkAppId,
          compute_mode: computeMode,
          state: "FAILED",
          exit_code: 1,
        },
      },
      event: {
        kind: "event",
        outcome: "failure",
        category: ["process"],
        type: ["error"],
        dataset: "aws.emr",
        provider: "emr.amazonaws.com",
      },
      error: {
        type: "org.apache.avro.AvroParseException",
        message: `Not an Avro data file: s3://${sourceBucket}/${sourceKey}`,
        stack_trace: `org.apache.avro.AvroParseException: Not an Avro data file\n\tat org.apache.avro.file.DataFileReader.openReader(DataFileReader.java:75)\n\tat org.apache.spark.sql.avro.AvroFileFormat.buildReader(AvroFileFormat.java:112)`,
      },
      message: `EMR Spark [${sparkAppId}]: FAILED — AvroParseException: not an Avro data file`,
      log: { level: "error" },
      ...identity,
      labels: pipelineLabels,
    });
  } else {
    // Success or null-file (null-file succeeds but with 0 records)
    const recordsWritten = isNullFile ? 0 : Math.floor(sparkRecordsRead * randFloat(0.6, 0.95));
    docs.push({
      __dataset: "aws.emr",
      "@timestamp": emrStartTs,
      cloud: {
        provider: "aws",
        region,
        account: { id: acct.id, name: acct.name },
        service: { name: "emr" },
      },
      aws: {
        dimensions: { ClusterId: clusterId, StepId: stepId },
        emr: {
          cluster_id: clusterId,
          step_id: stepId,
          spark_app_id: sparkAppId,
          compute_mode: computeMode,
          state: "COMPLETED",
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
        dataset: "aws.emr",
        provider: "emr.amazonaws.com",
      },
      message: `EMR Spark [${sparkAppId}]: COMPLETED — ${sparkRecordsRead} records read, ${recordsWritten} written`,
      log: { level: isNullFile ? "warn" : "info" },
      ...identity,
      labels: pipelineLabels,
    });
  }

  // CloudTrail: EMR AddJobFlowSteps (service role submitted the step)
  docs.push(
    awsCloudTrailEvent(
      emrStartTs,
      region,
      acct,
      svcRoleIdentity,
      "AddJobFlowSteps",
      "elasticmapreduce.amazonaws.com",
      { JobFlowId: clusterId, Steps: [{ Name: `spark-${dagId}`, ActionOnFailure: "CONTINUE" }] },
      pipelineHalted ? null : { StepIds: [stepId] },
      pipelineHalted ? "failure" : "success"
    ) as EcsDocument
  );

  // If pipeline halted, skip S3 output, Glue, Athena — jump to MWAA failure
  if (!pipelineHalted) {
    // ── 4. S3 PutObject (output) ────────────────────────────────────────────
    const s3PutTs = advance(sparkDurationMs, sparkDurationMs + 5000);
    const outputBytes = isNullFile ? 0 : randInt(10_000_000, 1_500_000_000);
    const outputKey = `processed/${dagId}/${new Date(ts).toISOString().slice(0, 10)}/output.parquet`;
    docs.push({
      __dataset: "aws.s3access",
      "@timestamp": s3PutTs,
      cloud: {
        provider: "aws",
        region,
        account: { id: acct.id, name: acct.name },
        service: { name: "s3" },
      },
      aws: {
        s3access: {
          bucket: outputBucket,
          key: outputKey,
          operation: "REST.PUT.OBJECT",
          http_status: 200,
          bytes_sent: outputBytes,
          total_time: randInt(20, 500),
          turn_around_time: randInt(10, 100),
          request_id: randId(16).toUpperCase(),
          requester: `arn:aws:iam::${acct.id}:role/emr-service-role`,
        },
      },
      event: {
        kind: "event",
        outcome: "success",
        category: ["file"],
        type: ["creation"],
        dataset: "aws.s3access",
        provider: "s3.amazonaws.com",
      },
      message: `S3 PutObject s3://${outputBucket}/${outputKey} (${outputBytes} bytes)`,
      log: { level: "info" },
      ...identity,
      labels: { ...pipelineLabels, s3_output_bucket: outputBucket, s3_output_key: outputKey },
    });

    // CloudTrail: S3 PutObject data event (service role)
    docs.push(
      awsCloudTrailEvent(
        s3PutTs,
        region,
        acct,
        svcRoleIdentity,
        "PutObject",
        "s3.amazonaws.com",
        { bucketName: outputBucket, key: outputKey },
        { "x-amz-request-id": randId(16).toUpperCase() },
        "success",
        { event_category: "Data" }
      ) as EcsDocument
    );

    // ── 5. Glue Crawler run ─────────────────────────────────────────────────
    const glueTs = advance(2000, 8000);
    const tablesUpdated = isNullFile ? 0 : randInt(1, 5);
    const partitionsAdded = isNullFile ? 0 : randInt(1, 20);
    docs.push({
      __dataset: "aws.glue",
      "@timestamp": glueTs,
      cloud: {
        provider: "aws",
        region,
        account: { id: acct.id, name: acct.name },
        service: { name: "glue" },
      },
      aws: {
        dimensions: { CrawlerName: crawlerName },
        glue: {
          crawler_name: crawlerName,
          database_name: `${dagId}_db`,
          state: "SUCCEEDED",
          tables_created: 0,
          tables_updated: tablesUpdated,
          partitions_added: partitionsAdded,
          duration_sec: randInt(15, 120),
          catalog_target: `s3://${outputBucket}/processed/${dagId}/`,
        },
      },
      event: {
        kind: "event",
        outcome: "success",
        category: ["database"],
        type: ["info"],
        dataset: "aws.glue",
        provider: "glue.amazonaws.com",
      },
      message: `Glue Crawler [${crawlerName}]: SUCCEEDED — ${tablesUpdated} tables updated, ${partitionsAdded} partitions added`,
      log: { level: "info" },
      ...identity,
      labels: pipelineLabels,
    });

    // CloudTrail: Glue StartCrawler (service role)
    docs.push(
      awsCloudTrailEvent(
        glueTs,
        region,
        acct,
        svcRoleIdentity,
        "StartCrawler",
        "glue.amazonaws.com",
        { Name: crawlerName },
        null,
        "success"
      ) as EcsDocument
    );

    // ── 6. Athena query execution ───────────────────────────────────────────
    const athenaTs = advance(2000, 10000);
    const dataScanned = isNullFile ? 0 : randInt(100_000_000, 5_000_000_000);
    const rowsReturned = isNullFile ? 0 : randInt(1000, 500_000);
    const athenaState = "SUCCEEDED";
    docs.push({
      __dataset: "aws.athena",
      "@timestamp": athenaTs,
      cloud: {
        provider: "aws",
        region,
        account: { id: acct.id, name: acct.name },
        service: { name: "athena" },
      },
      aws: {
        dimensions: { WorkGroup: workgroup },
        athena: {
          query_execution_id: queryExecutionId,
          workgroup,
          database: `${dagId}_db`,
          state: athenaState,
          data_scanned_bytes: dataScanned,
          rows_returned: rowsReturned,
          execution_time_ms: randInt(1000, 30000),
          query: `SELECT COUNT(*), SUM(amount) FROM ${dagId}_db.processed_data WHERE dt = '${new Date(ts).toISOString().slice(0, 10)}'`,
        },
      },
      event: {
        kind: "event",
        outcome: "success",
        category: ["database"],
        type: ["info"],
        dataset: "aws.athena",
        provider: "athena.amazonaws.com",
      },
      message: `Athena [${workgroup}]: ${athenaState} — scanned ${dataScanned} bytes, returned ${rowsReturned} rows`,
      log: { level: isNullFile && rowsReturned === 0 ? "warn" : "info" },
      ...identity,
      labels: pipelineLabels,
    });

    // CloudTrail: Athena StartQueryExecution (service role)
    docs.push(
      awsCloudTrailEvent(
        athenaTs,
        region,
        acct,
        svcRoleIdentity,
        "StartQueryExecution",
        "athena.amazonaws.com",
        {
          QueryString: `SELECT ... FROM ${dagId}_db.processed_data`,
          WorkGroup: workgroup,
          QueryExecutionContext: { Database: `${dagId}_db` },
        },
        { QueryExecutionId: queryExecutionId },
        "success"
      ) as EcsDocument
    );
  }

  // ── 7. MWAA DAG completed ─────────────────────────────────────────────────
  const finalTs = advance(1000, 5000);
  const finalState = pipelineHalted ? "failed" : isNullFile ? "success" : "success";
  const qualityCheck = isNullFile ? "DEGRADED" : pipelineHalted ? "FAILED" : "PASSED";
  docs.push({
    ...mwaaDoc(finalTs, region, acct, dagId, runId, "dag_complete", finalState, {
      operator: "DagRunSensor",
      duration_ms: offsetMs,
      quality_check: qualityCheck,
      records_processed: isNullFile ? 0 : pipelineHalted ? 0 : sparkRecordsRead,
      ...pipelineLabels,
    }),
    ...identity,
    labels: { ...pipelineLabels, quality_check: qualityCheck },
  });

  // ── APM Trace (transaction + spans for Service Map) ───────────────────────
  const traceId = newTraceId();
  const txId = newSpanId();
  const traceAccount = rand(TRACE_ACCOUNTS);
  const totalPipelineUs = offsetMs * 1000;

  const svcBlock = serviceBlock(
    "mwaa-data-pipeline",
    "production",
    "python",
    "Apache Airflow",
    "Python",
    "3.11.8"
  );
  const { agent, telemetry } = otelBlocks("python", "elastic");

  const txDoc: EcsDocument = {
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
    service: svcBlock,
    agent,
    telemetry,
    cloud: {
      provider: "aws",
      region,
      account: { id: traceAccount.id, name: traceAccount.name },
      service: { name: "mwaa" },
    },
    labels: {
      pipeline_run_id: pipelineRunId,
      dag_id: dagId,
    },
    event: { outcome: pipelineHalted ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

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
    const spanId = newSpanId();
    const spanTs = offsetTs(baseDate, spanOffsetMs);
    spanOffsetMs += durationUs / 1000 + randInt(50, 500);
    return {
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
        action: type === "storage" ? (name.includes("Put") ? "write" : "read") : "execute",
        destination: {
          service: { resource: destResource, type, name: destResource },
        },
        ...extra,
      },
      event: { outcome },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    };
  };

  // Span 1: S3 GetObject
  traceSpans.push(
    makeSpan(
      "s3.GetObject",
      "storage",
      "s3",
      randInt(100, 500) * 1000,
      `s3-${sourceBucket}`,
      "success"
    )
  );

  // Span 2: EMR/Spark processing
  const emrOutcome = pipelineHalted ? "failure" : "success";
  const emrSpan = makeSpan(
    `emr.RunJobFlow [${computeMode}]`,
    "compute",
    "emr",
    sparkDurationMs * 1000,
    `emr-${clusterId}`,
    emrOutcome
  );
  if (pipelineHalted) {
    (emrSpan as Record<string, unknown>).error =
      failureMode === "wrong_format"
        ? { type: "AvroParseException", message: "Not an Avro data file" }
        : {
            type: "FileNotFoundException",
            message: `Path not found: s3://${sourceBucket}/${sourceKey}`,
          };
  }
  traceSpans.push(emrSpan);

  if (!pipelineHalted) {
    // Spark sub-spans (children of EMR span)
    const emrSpanId = (emrSpan.span as Record<string, unknown> & { id: string }).id;
    const stageCount = randInt(3, 6);
    for (let i = 0; i < stageCount; i++) {
      const stageUs = Math.floor(((sparkDurationMs * 1000) / stageCount) * randFloat(0.6, 1.4));
      traceSpans.push({
        "@timestamp": offsetTs(baseDate, spanOffsetMs),
        processor: { name: "transaction", event: "span" },
        trace: { id: traceId },
        transaction: { id: txId },
        parent: { id: emrSpanId },
        span: {
          id: newSpanId(),
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
        data_stream: { type: "traces", dataset: "apm", namespace: "default" },
      });
    }

    // Span 3: S3 PutObject (output)
    traceSpans.push(
      makeSpan(
        "s3.PutObject",
        "storage",
        "s3",
        randInt(200, 1000) * 1000,
        `s3-${outputBucket}`,
        "success"
      )
    );

    // Span 4: Glue StartCrawler
    traceSpans.push(
      makeSpan(
        "glue.StartCrawler",
        "catalog",
        "glue",
        randInt(5000, 30000) * 1000,
        "glue-data-catalog",
        "success"
      )
    );

    // Span 5: Athena StartQueryExecution
    const athenaRows = isNullFile ? 0 : randInt(1000, 500_000);
    traceSpans.push(
      makeSpan(
        "athena.StartQueryExecution",
        "query",
        "athena",
        randInt(1000, 15000) * 1000,
        `athena-${workgroup}`,
        "success",
        isNullFile
          ? { db: { type: "sql", rows_affected: 0, statement: "SELECT ... (0 rows returned)" } }
          : { db: { type: "sql", rows_affected: athenaRows } }
      )
    );
  }

  // Combine: log docs first, then trace docs
  // Trace docs do NOT get __dataset — they go to traces-apm-default via the APM path
  const traceDocs = [txDoc, ...traceSpans];
  for (const td of traceDocs) {
    (td as Record<string, unknown>).__dataset = "apm";
  }

  return [...docs, ...traceDocs];
}
