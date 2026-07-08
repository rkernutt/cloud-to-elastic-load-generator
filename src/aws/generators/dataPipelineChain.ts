/**
 * Data & Analytics Pipeline chained event generator.
 *
 * Models a realistic multi-service AWS data pipeline with three
 * orchestration modes and realistic quality issues:
 *
 * ── Orchestration modes ───────────────────────────────────────────
 *   manual      – User triggers EMR Spark step directly via console/CLI
 *   mwaa        – S3 event notification → MWAA (Airflow) DAG → pipeline stages
 *   eventbridge – S3 event → EventBridge rule → Step Functions → pipeline stages
 *
 * ── Pipeline stages (common to all modes) ─────────────────────────
 *   1. Data lands in S3 in Avro format
 *   2. Spark on EMR reads Avro, converts to Parquet
 *   3. Parquet written to S3 (data bucket) + metadata to separate bucket
 *   4. Glue Catalog builds / updates schema for the data
 *   5. Athena validates data + Tableau BI queries
 *
 * ── Failure modes ─────────────────────────────────────────────────
 *   null_file      – 0-byte source, silent degradation
 *   wrong_format   – AvroParseException, halts at EMR
 *   special_chars  – IOException on bad S3 keys, halts at EMR
 *   schema_drift   – Glue Catalog detects column changes; Athena queries
 *                    may fail or return partial results
 *
 * Every run emits correlated logs + CloudTrail audit events + an APM
 * trace for the Elastic Service Map.
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
import { METRICS_GENERATORS } from "./metrics/index.js";

/**
 * Co-emit correlated CloudWatch metrics for the services this pipeline run
 * touches, so the per-service metric dashboards/ML jobs (which read from
 * metrics-aws.*) light up during the same window as the scenario's logs +
 * traces + CloudTrail audit. Each metric doc is tagged with a fully-qualified
 * `__dataset` (e.g. "metrics-aws.emr") so it routes to the metrics stream even
 * though the scenario is shipped over the logs path, and is stamped with the
 * run's region/account/pipeline_run_id for correlation.
 */
function pipelineMetricDocs(
  orchestration: OrchestrationMode,
  ts: string,
  er: number,
  region: string,
  acct: { id: string; name: string },
  pipelineRunId: string
): EcsDocument[] {
  const keys = ["s3", "emr", "glue", "athena"];
  if (orchestration === "mwaa") keys.push("mwaa");
  if (orchestration === "eventbridge") keys.push("eventbridge", "stepfunctions");

  const out: EcsDocument[] = [];
  for (const key of keys) {
    const gen = METRICS_GENERATORS[key as keyof typeof METRICS_GENERATORS];
    if (!gen) continue;
    // Cap per service to keep the scenario's metric volume representative but light.
    for (const raw of gen(ts, er).slice(0, 4)) {
      const doc = raw as Record<string, unknown>;
      const dataset = (doc.data_stream as { dataset?: string })?.dataset ?? `aws.${key}`;
      doc.__dataset = `metrics-${dataset}`;
      doc.cloud = {
        ...(doc.cloud as Record<string, unknown> | undefined),
        region,
        account: { id: acct.id, name: acct.name },
      };
      doc.labels = {
        ...((doc.labels as Record<string, unknown> | undefined) ?? {}),
        pipeline_run_id: pipelineRunId,
      };
      out.push(doc as EcsDocument);
    }
  }
  return out;
}

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

const METADATA_BUCKETS = [
  "pipeline-metadata-store",
  "etl-run-manifests",
  "data-lake-metadata",
  "pipeline-audit-trail",
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

const ORCHESTRATION_MODES = ["manual", "mwaa", "eventbridge"] as const;
type OrchestrationMode = (typeof ORCHESTRATION_MODES)[number];

export type PipelineOrchestrationPreference = OrchestrationMode | "all";

let _orchestrationPref: PipelineOrchestrationPreference = "all";

/** Set the orchestration mode preference for the data pipeline chain generator. */
export function setPipelineOrchestration(pref: PipelineOrchestrationPreference): void {
  _orchestrationPref = pref;
}

/** Get the current orchestration mode preference. */
export function getPipelineOrchestration(): PipelineOrchestrationPreference {
  return _orchestrationPref;
}

const FAILURE_MODES = ["null_file", "wrong_format", "special_chars", "schema_drift"] as const;
type FailureMode = (typeof FAILURE_MODES)[number];

const EVENTBRIDGE_RULE_NAMES = [
  "s3-avro-landing-trigger",
  "data-lake-ingest-rule",
  "raw-data-processor-trigger",
  "etl-pipeline-kickoff",
];

const SFN_STATE_MACHINES = [
  "DataPipelineOrchestrator",
  "AvroToParquetWorkflow",
  "ETLStateMachine",
  "DataLakeProcessor",
];

const TABLEAU_USERS = [
  "tableau-service-account",
  "bi-reader-prod",
  "analytics-viewer",
  "reporting-service",
];

const SCHEMA_DRIFT_COLUMNS = [
  { added: "customer_ltv", type: "double" },
  { added: "loyalty_tier", type: "string" },
  { removed: "legacy_id", type: "bigint" },
  { added: "consent_flags", type: "array<string>" },
  { typeChange: { column: "amount", from: "int", to: "double" } },
  { added: "event_metadata", type: "struct<source:string,version:int>" },
];

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

function cloudDoc(region: string, acct: { id: string; name: string }, serviceName: string) {
  return {
    provider: "aws" as const,
    region,
    account: { id: acct.id, name: acct.name },
    service: { name: serviceName },
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
  const metadataBucket = rand(METADATA_BUCKETS);
  const computeMode: EmrComputeMode = rand([...EMR_COMPUTE_MODES]);
  const crawlerName = rand(GLUE_CRAWLERS);
  const workgroup = rand(ATHENA_WORKGROUPS);
  const queryExecutionId = randUUID();
  const clusterId = `j-${randId(13).toUpperCase()}`;
  const stepId = `s-${randId(13).toUpperCase()}`;
  const sparkAppId = `application_${Date.now()}_${randInt(1000, 9999)}`;

  const orchestration: OrchestrationMode =
    _orchestrationPref === "all" ? rand([...ORCHESTRATION_MODES]) : _orchestrationPref;
  const ebRuleName = rand(EVENTBRIDGE_RULE_NAMES);
  const sfnArn = `arn:aws:states:${region}:${acct.id}:stateMachine:${rand(SFN_STATE_MACHINES)}`;
  const sfnExecutionName = `${dagId}-${randId(8)}`;

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
  const isSchemaDrift = failureMode === "schema_drift";

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
    s3_source_bucket: sourceBucket,
    s3_source_key: sourceKey,
    orchestration_mode: orchestration,
  };

  // ── 1. Orchestration trigger ──────────────────────────────────────────────

  if (orchestration === "mwaa") {
    // S3 event notification triggers MWAA DAG
    docs.push({
      __dataset: "aws.s3access",
      "@timestamp": ts,
      cloud: cloudDoc(region, acct, "s3"),
      aws: {
        s3access: {
          bucket: sourceBucket,
          key: sourceKey,
          operation: "REST.PUT.OBJECT",
          http_status: 200,
          bytes_sent: isNullFile ? 0 : randInt(50_000_000, 2_000_000_000),
          total_time: randInt(50, 500),
          turn_around_time: randInt(10, 80),
          request_id: randId(16).toUpperCase(),
          requester: `arn:aws:iam::${acct.id}:role/upstream-data-producer`,
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
      message: `S3 PutObject s3://${sourceBucket}/${sourceKey} (Avro landing — triggers MWAA)`,
      log: { level: "info" },
      labels: pipelineLabels,
    });

    docs.push({
      ...mwaaDoc(advance(200, 1000), region, acct, dagId, runId, "trigger_dag", "running", {
        operator: "S3KeySensor → TriggerDagRunOperator",
        trigger_source: "s3_event_notification",
        ...pipelineLabels,
      }),
      ...identity,
      labels: pipelineLabels,
    });

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
  } else if (orchestration === "eventbridge") {
    // S3 event → EventBridge rule → Step Functions
    docs.push({
      __dataset: "aws.s3access",
      "@timestamp": ts,
      cloud: cloudDoc(region, acct, "s3"),
      aws: {
        s3access: {
          bucket: sourceBucket,
          key: sourceKey,
          operation: "REST.PUT.OBJECT",
          http_status: 200,
          bytes_sent: isNullFile ? 0 : randInt(50_000_000, 2_000_000_000),
          total_time: randInt(50, 500),
          turn_around_time: randInt(10, 80),
          request_id: randId(16).toUpperCase(),
          requester: `arn:aws:iam::${acct.id}:role/upstream-data-producer`,
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
      message: `S3 PutObject s3://${sourceBucket}/${sourceKey} (Avro landing — triggers EventBridge)`,
      log: { level: "info" },
      labels: pipelineLabels,
    });

    const ebTs = advance(50, 300);
    docs.push({
      __dataset: "aws.eventbridge",
      "@timestamp": ebTs,
      cloud: cloudDoc(region, acct, "eventbridge"),
      aws: {
        eventbridge: {
          rule_name: ebRuleName,
          event_bus: "default",
          detail_type: "Object Created",
          source: "aws.s3",
          matched_rule: true,
          target_arn: sfnArn,
          input_path: `$.detail.bucket.name=${sourceBucket}`,
        },
      },
      event: {
        kind: "event",
        outcome: "success",
        category: ["process"],
        type: ["info"],
        dataset: "aws.eventbridge",
        provider: "events.amazonaws.com",
      },
      message: `EventBridge rule [${ebRuleName}] matched S3:ObjectCreated → starting Step Functions execution`,
      log: { level: "info" },
      labels: pipelineLabels,
    });

    docs.push(
      awsCloudTrailEvent(
        ebTs,
        region,
        acct,
        svcRoleIdentity,
        "PutEvents",
        "events.amazonaws.com",
        { Entries: [{ Source: "aws.s3", DetailType: "Object Created" }] },
        { FailedEntryCount: 0, Entries: [{ EventId: randUUID() }] },
        "success"
      ) as EcsDocument
    );

    // Step Functions execution start
    const sfnStartTs = advance(100, 500);
    docs.push({
      __dataset: "aws.stepfunctions",
      "@timestamp": sfnStartTs,
      cloud: cloudDoc(region, acct, "stepfunctions"),
      aws: {
        stepfunctions: {
          state_machine_arn: sfnArn,
          execution_name: sfnExecutionName,
          execution_arn: `${sfnArn.replace(":stateMachine:", ":execution:")}:${sfnExecutionName}`,
          status: "RUNNING",
          type: "STANDARD",
          current_state: "ProcessAvroData",
          input: JSON.stringify({
            bucket: sourceBucket,
            key: sourceKey,
            pipeline_run_id: pipelineRunId,
          }),
        },
      },
      event: {
        kind: "event",
        outcome: "success",
        category: ["process"],
        type: ["start"],
        dataset: "aws.stepfunctions",
        provider: "states.amazonaws.com",
      },
      message: `Step Functions execution started: ${sfnExecutionName} (triggered by EventBridge)`,
      log: { level: "info" },
      labels: pipelineLabels,
    });

    docs.push(
      awsCloudTrailEvent(
        sfnStartTs,
        region,
        acct,
        svcRoleIdentity,
        "StartExecution",
        "states.amazonaws.com",
        { stateMachineArn: sfnArn, name: sfnExecutionName },
        { executionArn: `${sfnArn.replace(":stateMachine:", ":execution:")}:${sfnExecutionName}` },
        "success"
      ) as EcsDocument
    );
  } else {
    // Manual trigger — user runs EMR step directly
    docs.push(
      awsCloudTrailEvent(
        ts,
        region,
        acct,
        ctIdentity,
        "AddJobFlowSteps",
        "elasticmapreduce.amazonaws.com",
        {
          JobFlowId: clusterId,
          Steps: [
            {
              Name: `manual-spark-${dagId}`,
              HadoopJarStep: {
                Jar: "command-runner.jar",
                Args: [
                  "spark-submit",
                  "--class",
                  "com.globex.etl.AvroToParquet",
                  `s3://${sourceBucket}/${sourceKey}`,
                ],
              },
              ActionOnFailure: "CONTINUE",
            },
          ],
        },
        { StepIds: [stepId] },
        "success"
      ) as EcsDocument
    );
  }

  // ── 2. S3 GetObject (source Avro file) ────────────────────────────────────

  const s3GetTs = advance(100, 500);
  const sourceBytes = isNullFile ? 0 : randInt(50_000_000, 2_000_000_000);
  docs.push({
    __dataset: "aws.s3access",
    "@timestamp": s3GetTs,
    cloud: cloudDoc(region, acct, "s3"),
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
    message: `S3 GetObject s3://${sourceBucket}/${sourceKey} (${sourceBytes} bytes, Avro)`,
    log: { level: "info" },
    ...identity,
    labels: pipelineLabels,
  });

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

  // ── 3. EMR Spark job: Avro → Parquet conversion ───────────────────────────

  const emrStartTs = advance(500, 2000);
  const sparkRecordsRead = isNullFile ? 0 : randInt(100_000, 10_000_000);
  const sparkDurationMs = randInt(30_000, 300_000);

  if (failureMode === "special_chars") {
    docs.push({
      __dataset: "aws.emr_logs",
      "@timestamp": emrStartTs,
      cloud: cloudDoc(region, acct, "emr"),
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
        dataset: "aws.emr_logs",
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
      __dataset: "aws.emr_logs",
      "@timestamp": emrStartTs,
      cloud: cloudDoc(region, acct, "emr"),
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
        dataset: "aws.emr_logs",
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
    const recordsWritten = isNullFile ? 0 : Math.floor(sparkRecordsRead * randFloat(0.6, 0.95));
    docs.push({
      __dataset: "aws.emr_logs",
      "@timestamp": emrStartTs,
      cloud: cloudDoc(region, acct, "emr"),
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
            input_format: "avro",
            output_format: "parquet",
            compression: "snappy",
          },
        },
      },
      event: {
        kind: "event",
        outcome: "success",
        category: ["process"],
        type: ["info"],
        dataset: "aws.emr_logs",
        provider: "emr.amazonaws.com",
      },
      message: `EMR Spark [${sparkAppId}]: COMPLETED — ${sparkRecordsRead} Avro records → ${recordsWritten} Parquet records`,
      log: { level: isNullFile ? "warn" : "info" },
      ...identity,
      labels: pipelineLabels,
    });
  }

  // CloudTrail: EMR AddJobFlowSteps (skip for manual — already emitted above)
  if (orchestration !== "manual") {
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
  }

  // ── If pipeline halted at EMR, skip downstream stages ─────────────────────

  if (!pipelineHalted) {
    const outputDate = new Date(ts).toISOString().slice(0, 10);
    const outputKey = `processed/${dagId}/${outputDate}/output.parquet`;
    const metadataKey = `runs/${dagId}/${outputDate}/${pipelineRunId}/manifest.json`;

    // ── 4a. S3 PutObject — Parquet data ───────────────────────────────────
    const s3PutTs = advance(sparkDurationMs, sparkDurationMs + 5000);
    const outputBytes = isNullFile ? 0 : randInt(10_000_000, 1_500_000_000);
    docs.push({
      __dataset: "aws.s3access",
      "@timestamp": s3PutTs,
      cloud: cloudDoc(region, acct, "s3"),
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
      message: `S3 PutObject s3://${outputBucket}/${outputKey} (${outputBytes} bytes, Parquet/Snappy)`,
      log: { level: "info" },
      ...identity,
      labels: { ...pipelineLabels, s3_output_bucket: outputBucket, s3_output_key: outputKey },
    });

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

    // ── 4b. S3 PutObject — metadata to separate bucket ──────────────────
    const metaPutTs = advance(100, 500);
    const metaBytes = randInt(500, 5000);
    docs.push({
      __dataset: "aws.s3access",
      "@timestamp": metaPutTs,
      cloud: cloudDoc(region, acct, "s3"),
      aws: {
        s3access: {
          bucket: metadataBucket,
          key: metadataKey,
          operation: "REST.PUT.OBJECT",
          http_status: 200,
          bytes_sent: metaBytes,
          total_time: randInt(5, 50),
          turn_around_time: randInt(2, 15),
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
      message: `S3 PutObject s3://${metadataBucket}/${metadataKey} (${metaBytes} bytes, run manifest)`,
      log: { level: "info" },
      ...identity,
      labels: { ...pipelineLabels, s3_metadata_bucket: metadataBucket },
    });

    // ── 5. Glue Catalog — schema build / update ─────────────────────────
    const glueTs = advance(2000, 8000);
    const tablesUpdated = isNullFile ? 0 : randInt(1, 5);
    const partitionsAdded = isNullFile ? 0 : randInt(1, 20);

    const driftDetail = isSchemaDrift ? rand(SCHEMA_DRIFT_COLUMNS) : null;
    const glueState = isSchemaDrift ? "SUCCEEDED" : "SUCCEEDED";
    const glueExtra: Record<string, unknown> = {
      crawler_name: crawlerName,
      database_name: `${dagId}_db`,
      state: glueState,
      tables_created: 0,
      tables_updated: tablesUpdated,
      partitions_added: partitionsAdded,
      duration_sec: randInt(15, 120),
      catalog_target: `s3://${outputBucket}/processed/${dagId}/`,
      classification: "parquet",
    };

    if (isSchemaDrift && driftDetail) {
      if ("added" in driftDetail) {
        glueExtra.schema_change_type = "COLUMN_ADDED";
        glueExtra.schema_change_column = driftDetail.added;
        glueExtra.schema_change_column_type = driftDetail.type;
        glueExtra.schema_version_prev = randInt(3, 15);
        glueExtra.schema_version_new = (glueExtra.schema_version_prev as number) + 1;
      } else if ("removed" in driftDetail) {
        glueExtra.schema_change_type = "COLUMN_REMOVED";
        glueExtra.schema_change_column = driftDetail.removed;
        glueExtra.schema_change_column_type = driftDetail.type;
        glueExtra.schema_version_prev = randInt(3, 15);
        glueExtra.schema_version_new = (glueExtra.schema_version_prev as number) + 1;
      } else if ("typeChange" in driftDetail) {
        glueExtra.schema_change_type = "TYPE_CHANGED";
        glueExtra.schema_change_column = driftDetail.typeChange.column;
        glueExtra.schema_change_from_type = driftDetail.typeChange.from;
        glueExtra.schema_change_to_type = driftDetail.typeChange.to;
        glueExtra.schema_version_prev = randInt(3, 15);
        glueExtra.schema_version_new = (glueExtra.schema_version_prev as number) + 1;
      }
    }

    const schemaDriftMsg =
      isSchemaDrift && driftDetail
        ? "added" in driftDetail
          ? ` — SCHEMA DRIFT: column "${driftDetail.added}" (${driftDetail.type}) added`
          : "removed" in driftDetail
            ? ` — SCHEMA DRIFT: column "${driftDetail.removed}" removed`
            : ` — SCHEMA DRIFT: column "${driftDetail.typeChange.column}" type changed ${driftDetail.typeChange.from} → ${driftDetail.typeChange.to}`
        : "";

    docs.push({
      __dataset: "aws.glue",
      "@timestamp": glueTs,
      cloud: cloudDoc(region, acct, "glue"),
      aws: {
        dimensions: { CrawlerName: crawlerName },
        glue: glueExtra,
      },
      event: {
        kind: "event",
        outcome: isSchemaDrift ? "success" : "success",
        category: ["database"],
        type: isSchemaDrift ? ["change"] : ["info"],
        dataset: "aws.glue",
        provider: "glue.amazonaws.com",
      },
      message: `Glue Crawler [${crawlerName}]: SUCCEEDED — ${tablesUpdated} tables updated, ${partitionsAdded} partitions added${schemaDriftMsg}`,
      log: { level: isSchemaDrift ? "warn" : "info" },
      ...identity,
      labels: { ...pipelineLabels, ...(isSchemaDrift ? { schema_drift_detected: "true" } : {}) },
    });

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

    // Schema drift: also emit UpdateTable CloudTrail event
    if (isSchemaDrift) {
      docs.push(
        awsCloudTrailEvent(
          advance(500, 2000),
          region,
          acct,
          svcRoleIdentity,
          "UpdateTable",
          "glue.amazonaws.com",
          {
            DatabaseName: `${dagId}_db`,
            TableInput: {
              Name: "processed_data",
              StorageDescriptor: { Location: `s3://${outputBucket}/processed/${dagId}/` },
            },
          },
          null,
          "success"
        ) as EcsDocument
      );
    }

    // ── 6. Athena query — validation / BI ────────────────────────────────
    const athenaTs = advance(2000, 10000);
    const dataScanned = isNullFile ? 0 : randInt(100_000_000, 5_000_000_000);
    const rowsReturned = isNullFile
      ? 0
      : isSchemaDrift && randInt(0, 3) === 0
        ? 0
        : randInt(1000, 500_000);
    const athenaFailed = isSchemaDrift && randInt(0, 3) === 0;
    const athenaState = athenaFailed ? "FAILED" : "SUCCEEDED";

    const athenaDoc: EcsDocument = {
      __dataset: "aws.athena",
      "@timestamp": athenaTs,
      cloud: cloudDoc(region, acct, "athena"),
      aws: {
        dimensions: { WorkGroup: workgroup },
        athena: {
          query_execution_id: queryExecutionId,
          workgroup,
          database: `${dagId}_db`,
          state: athenaState,
          data_scanned_bytes: athenaFailed ? 0 : dataScanned,
          rows_returned: athenaFailed ? 0 : rowsReturned,
          execution_time_ms: athenaFailed ? randInt(200, 2000) : randInt(1000, 30000),
          query: `SELECT COUNT(*), SUM(amount) FROM ${dagId}_db.processed_data WHERE dt = '${outputDate}'`,
        },
      },
      event: {
        kind: "event",
        outcome: athenaFailed ? "failure" : "success",
        category: ["database"],
        type: athenaFailed ? ["error"] : ["info"],
        dataset: "aws.athena",
        provider: "athena.amazonaws.com",
      },
      message: athenaFailed
        ? `Athena [${workgroup}]: FAILED — COLUMN_NOT_FOUND: Column 'amount' cannot be resolved (schema drift)`
        : `Athena [${workgroup}]: ${athenaState} — scanned ${dataScanned} bytes, returned ${rowsReturned} rows`,
      log: { level: athenaFailed ? "error" : isNullFile && rowsReturned === 0 ? "warn" : "info" },
      ...identity,
      labels: pipelineLabels,
    };

    if (athenaFailed) {
      athenaDoc.error = {
        type: "COLUMN_NOT_FOUND",
        message: `Column 'amount' cannot be resolved; schema may have changed. Table ${dagId}_db.processed_data has drifted.`,
        code: "INVALID_QUERY",
      };
    }

    docs.push(athenaDoc);

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
        athenaFailed
          ? { QueryExecutionId: queryExecutionId, State: "FAILED" }
          : { QueryExecutionId: queryExecutionId },
        athenaFailed ? "failure" : "success"
      ) as EcsDocument
    );

    // ── 7. Tableau BI query via Athena (downstream consumer) ────────────
    if (!athenaFailed) {
      const tableauTs = advance(5000, 30000);
      const tableauQueryId = randUUID();
      const tableauUser = rand(TABLEAU_USERS);
      const tableauRows = randInt(500, 100_000);
      const tableauScanned = randInt(50_000_000, 2_000_000_000);

      docs.push({
        __dataset: "aws.athena",
        "@timestamp": tableauTs,
        cloud: cloudDoc(region, acct, "athena"),
        aws: {
          dimensions: { WorkGroup: "tableau-connector" },
          athena: {
            query_execution_id: tableauQueryId,
            workgroup: "tableau-connector",
            database: `${dagId}_db`,
            state: "SUCCEEDED",
            data_scanned_bytes: tableauScanned,
            rows_returned: tableauRows,
            execution_time_ms: randInt(2000, 45000),
            query: `SELECT region, product_category, SUM(amount) as total_revenue, COUNT(*) as transaction_count FROM ${dagId}_db.processed_data WHERE dt = '${outputDate}' GROUP BY region, product_category ORDER BY total_revenue DESC LIMIT 1000`,
            client_request_token: `tableau-${randId(12)}`,
          },
        },
        event: {
          kind: "event",
          outcome: "success",
          category: ["database"],
          type: ["access"],
          dataset: "aws.athena",
          provider: "athena.amazonaws.com",
        },
        message: `Athena [tableau-connector]: SUCCEEDED — Tableau BI query, ${tableauRows} rows, ${tableauScanned} bytes scanned`,
        log: { level: "info" },
        user: { name: tableauUser },
        labels: { ...pipelineLabels, query_source: "tableau", bi_user: tableauUser },
      });

      docs.push(
        awsCloudTrailEvent(
          tableauTs,
          region,
          acct,
          awsCloudTrailIdentity(
            acct.id,
            { name: tableauUser, email: `${tableauUser}@globex.io`, department: "bi" },
            randSourceIp(),
            "Tableau/2024.1 Athena-JDBC/3.2.0"
          ),
          "StartQueryExecution",
          "athena.amazonaws.com",
          {
            QueryString: `SELECT region, product_category, SUM(amount) ... FROM ${dagId}_db.processed_data`,
            WorkGroup: "tableau-connector",
          },
          { QueryExecutionId: tableauQueryId },
          "success"
        ) as EcsDocument
      );
    }

    // ── 8. EventBridge / Step Functions completion (when applicable) ─────
    if (orchestration === "eventbridge") {
      const sfnEndTs = advance(1000, 3000);
      const sfnOutcome = isSchemaDrift ? "SUCCEEDED" : athenaFailed ? "FAILED" : "SUCCEEDED";
      docs.push({
        __dataset: "aws.stepfunctions",
        "@timestamp": sfnEndTs,
        cloud: cloudDoc(region, acct, "stepfunctions"),
        aws: {
          stepfunctions: {
            state_machine_arn: sfnArn,
            execution_name: sfnExecutionName,
            execution_arn: `${sfnArn.replace(":stateMachine:", ":execution:")}:${sfnExecutionName}`,
            status: sfnOutcome,
            type: "STANDARD",
            current_state: "PipelineComplete",
            output: JSON.stringify({
              pipeline_run_id: pipelineRunId,
              records_processed: sparkRecordsRead,
              schema_drift: isSchemaDrift,
            }),
          },
        },
        event: {
          kind: "event",
          outcome: sfnOutcome === "SUCCEEDED" ? "success" : "failure",
          category: ["process"],
          type: ["end"],
          dataset: "aws.stepfunctions",
          provider: "states.amazonaws.com",
        },
        message: `Step Functions execution ${sfnOutcome}: ${sfnExecutionName}${isSchemaDrift ? " (schema drift detected)" : ""}`,
        log: { level: sfnOutcome === "SUCCEEDED" ? "info" : "error" },
        labels: pipelineLabels,
      });
    }
  }

  // ── 9. MWAA DAG completion (mwaa mode) or summary log (all modes) ─────

  const finalTs = advance(1000, 5000);
  const qualityCheck = isNullFile
    ? "DEGRADED"
    : pipelineHalted
      ? "FAILED"
      : isSchemaDrift
        ? "SCHEMA_DRIFT"
        : "PASSED";
  const finalState = pipelineHalted ? "failed" : "success";

  if (orchestration === "mwaa") {
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
  }

  // ── APM Trace ─────────────────────────────────────────────────────────────

  const traceId = newTraceId();
  const txId = newSpanId();
  const traceAccount = rand(TRACE_ACCOUNTS);
  const totalPipelineUs = offsetMs * 1000;

  const orchLabel =
    orchestration === "mwaa"
      ? "mwaa-data-pipeline"
      : orchestration === "eventbridge"
        ? "eventbridge-data-pipeline"
        : "manual-data-pipeline";

  const svcBlock = serviceBlock(
    orchLabel,
    "production",
    "python",
    orchestration === "mwaa"
      ? "Apache Airflow"
      : orchestration === "eventbridge"
        ? "AWS Step Functions"
        : "AWS EMR",
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
      name:
        orchestration === "mwaa"
          ? `dag_run:${dagId}`
          : orchestration === "eventbridge"
            ? `sfn:${sfnExecutionName}`
            : `emr_step:${stepId}`,
      type: "pipeline",
      duration: { us: totalPipelineUs },
      result: pipelineHalted ? "failure" : isSchemaDrift ? "degraded" : "success",
      sampled: true,
      span_count: { started: pipelineHalted ? 3 : 7, dropped: 0 },
    },
    service: svcBlock,
    agent,
    telemetry,
    cloud: {
      provider: "aws",
      region,
      account: { id: traceAccount.id, name: traceAccount.name },
      service: {
        name:
          orchestration === "mwaa"
            ? "mwaa"
            : orchestration === "eventbridge"
              ? "stepfunctions"
              : "emr",
      },
    },
    labels: {
      pipeline_run_id: pipelineRunId,
      dag_id: dagId,
      orchestration_mode: orchestration,
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
      service: svcBlock,
      agent,
      telemetry,
      event: { outcome },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    };
  };

  // Orchestrator span (EventBridge or MWAA kickoff)
  if (orchestration === "eventbridge") {
    traceSpans.push(
      makeSpan(
        `eventbridge.PutEvents → ${ebRuleName}`,
        "messaging",
        "eventbridge",
        randInt(50, 300) * 1000,
        "eventbridge-default-bus",
        "success"
      )
    );
  }

  // S3 GetObject span
  traceSpans.push(
    makeSpan(
      "s3.GetObject (Avro source)",
      "storage",
      "s3",
      randInt(100, 500) * 1000,
      `s3-${sourceBucket}`,
      "success"
    )
  );

  // EMR/Spark span
  const emrOutcome = pipelineHalted ? "failure" : "success";
  const emrSpan = makeSpan(
    `emr.Spark [${computeMode}] Avro→Parquet`,
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
    // Spark sub-stages (children of EMR span)
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
        service: svcBlock,
        agent,
        telemetry,
        labels: {
          spark_stage_id: String(i),
          spark_input_records: String(isNullFile ? 0 : randInt(50_000, 5_000_000)),
        },
        event: { outcome: "success" },
        data_stream: { type: "traces", dataset: "apm", namespace: "default" },
      });
    }

    // S3 PutObject span (Parquet output)
    traceSpans.push(
      makeSpan(
        "s3.PutObject (Parquet output)",
        "storage",
        "s3",
        randInt(200, 1000) * 1000,
        `s3-${outputBucket}`,
        "success"
      )
    );

    // S3 PutObject span (metadata)
    traceSpans.push(
      makeSpan(
        "s3.PutObject (run metadata)",
        "storage",
        "s3",
        randInt(20, 100) * 1000,
        `s3-${metadataBucket}`,
        "success"
      )
    );

    // Glue Catalog span
    traceSpans.push(
      makeSpan(
        `glue.StartCrawler → ${crawlerName}`,
        "catalog",
        "glue",
        randInt(5000, 30000) * 1000,
        "glue-data-catalog",
        isSchemaDrift ? "success" : "success"
      )
    );

    // Athena span
    const athenaOutcome = isSchemaDrift && randInt(0, 3) === 0 ? "failure" : "success";
    const athenaSpan = makeSpan(
      "athena.StartQueryExecution",
      "query",
      "athena",
      randInt(1000, 15000) * 1000,
      `athena-${workgroup}`,
      athenaOutcome,
      isNullFile
        ? { db: { type: "sql", rows_affected: 0, statement: "SELECT ... (0 rows returned)" } }
        : { db: { type: "sql", rows_affected: randInt(1000, 500_000) } }
    );
    if (athenaOutcome === "failure") {
      (athenaSpan as Record<string, unknown>).error = {
        type: "COLUMN_NOT_FOUND",
        message: "Schema drift caused query failure",
      };
    }
    traceSpans.push(athenaSpan);
  }

  const traceDocs = [txDoc, ...traceSpans];
  for (const td of traceDocs) {
    (td as Record<string, unknown>).__dataset = "apm";
  }

  const metricDocs = pipelineMetricDocs(orchestration, ts, er, region, acct, pipelineRunId);

  return [...docs, ...traceDocs, ...metricDocs];
}
