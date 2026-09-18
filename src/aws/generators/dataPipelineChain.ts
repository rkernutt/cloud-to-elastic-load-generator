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
 *   4. Glue Data Quality job (EvaluateDataQuality) scores the Parquet output
 *   5. DQ result published to a Confluent Kafka topic (self-managed on EKS);
 *      Kafka Connect S3 sink writes the record to the DQ results bucket
 *
 * ── Failure modes ─────────────────────────────────────────────────
 *   null_file      – 0-byte source, silent degradation (DQ RowCount rule fails)
 *   wrong_format   – AvroParseException, halts at EMR
 *   special_chars  – IOException on bad S3 keys, halts at EMR
 *   schema_drift   – column added/removed/retyped in the output; DQ
 *                    ColumnExists / ColumnCount / ColumnDataType rules fail
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
import {
  AIRFLOW_PRODUCER,
  SPARK_PRODUCER,
  buildRunEvent,
  olEcsDoc,
  airflowRunFacets,
  airflowDagRunFacets,
  airflowJobFacets,
  sparkRunFacets,
  sparkJobFacets,
  sparkJobName,
  s3Dataset,
  schemaFacet,
  dataSourceFacet,
  outputStatisticsFacet,
  columnLineageFacet,
  errorMessageFacet,
  plusMs,
  type OlDataset,
  type OlEventType,
} from "./openlineage.js";
import {
  DQ_TOPIC,
  DQ_S3_SINK_CONNECTOR,
  DQ_S3_SINK_ROLE,
  DQ_RESULTS_BUCKETS,
  CONFLUENT_NAMESPACE,
  CONFLUENT_CLUSTER_NAME,
  CONFLUENT_BOOTSTRAP,
  GLUE_DQ_VERSION,
  buildDqResult,
  dqKafkaDoc,
  dqEventBridgeDetail,
  s3SinkObjectKey,
} from "./glueDataQuality.js";

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
  // Every AWS service in the run reports to CloudWatch Metrics; the Confluent
  // cluster on EKS is covered by the EKS container-insights metrics.
  const keys = ["s3", "emr", "glue", "eks"];
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
  const dqResultsBucket = rand(DQ_RESULTS_BUCKETS);
  const dqJobName = `${dagId}-dq-evaluate`;
  const dqJobRunId = `jr_${randId(64).toLowerCase()}`;
  const dqEvaluationContext = "EvaluateDataQuality_parquet_output";
  const dqRulesetName = `${dagId}-parquet-output-ruleset`;
  const dqDurationMs = randInt(45_000, 240_000);
  const dqPartition = randInt(0, 5);
  const dqOffset = randInt(100_000, 999_999);
  const clusterId = `j-${randId(13).toUpperCase()}`;
  const stepId = `s-${randId(13).toUpperCase()}`;
  const sparkAppId = `application_${Date.now()}_${randInt(1000, 9999)}`;

  const orchestration: OrchestrationMode =
    _orchestrationPref === "all" ? rand([...ORCHESTRATION_MODES]) : _orchestrationPref;
  const ebRuleName = rand(EVENTBRIDGE_RULE_NAMES);
  const sfnArn = `arn:aws:states:${region}:${acct.id}:stateMachine:${rand(SFN_STATE_MACHINES)}`;
  const sfnExecutionName = `${dagId}-${randId(8)}`;
  const sfnStateMachineName = sfnArn.split(":").pop()!;
  const sfnExecutionArn = `${sfnArn.replace(":stateMachine:", ":execution:")}:${sfnExecutionName}`;
  let sfnEventId = 0;

  // OTel trace context is created up front so the orchestrator's own logs
  // (Airflow task logs / Step Functions history) can carry trace.id the way an
  // ADOT-instrumented worker does. Raw service logs (S3 access, EMR, Glue,
  // Kafka Connect, DQ results) deliberately do NOT get trace.id — those don't emit it.
  const traceId = newTraceId();
  const txId = newSpanId();

  // OpenLineage identity — [openlineage] namespace on MWAA and
  // spark.openlineage.namespace on EMR are conventionally set to the same value.
  const olNamespace = `mwaa-${acct.name}`;
  const sparkAppName = "avro_to_parquet";

  const triggerUser = randHumanUser();
  const triggerIp = randSourceIp();
  const triggerUa = randPipelineUserAgent();
  const identity = ecsIdentityFields(triggerUser, triggerIp, triggerUa);
  const ctIdentity = awsCloudTrailIdentity(acct.id, triggerUser, triggerIp, triggerUa);

  // CloudTrail principals must match who really makes each call:
  //  • control plane (AddJobFlowSteps, StartJobRun, PutEvents, StartExecution) — the
  //    orchestrator's execution role, or the human for manual runs;
  //  • data plane (S3 Get/PutObject) — the EMR job's role for the chosen compute mode;
  //  • GetDataQualityResult — the Glue DQ job's own role; the DQ results PutObject —
  //    the Kafka Connect S3 sink's IRSA role on EKS.
  const orchestratorRole =
    orchestration === "mwaa"
      ? {
          name: "mwaa-execution-role",
          ua: "Boto3/1.34.84 md/Botocore#1.34.84 ua/2.0 os/linux#5.10.0 lang/python#3.11.8 exec-env/AmazonMWAA",
        }
      : orchestration === "eventbridge"
        ? { name: `StepFunctions-${sfnStateMachineName}-role`, ua: "states.amazonaws.com" }
        : null;
  const svcRoleIdentity = orchestratorRole
    ? awsCloudTrailIdentity(
        acct.id,
        {
          name: orchestratorRole.name,
          email: `${orchestratorRole.name}@internal`,
          department: "service",
        },
        triggerIp,
        orchestratorRole.ua,
        true
      )
    : ctIdentity;
  const emrDataRoleName =
    computeMode === "serverless"
      ? "EMRServerlessS3RuntimeRole"
      : computeMode === "eks"
        ? "EMRContainers-JobExecutionRole"
        : "EMR_EC2_DefaultRole";
  const emrDataIdentity = awsCloudTrailIdentity(
    acct.id,
    { name: emrDataRoleName, email: `${emrDataRoleName}@internal`, department: "service" },
    triggerIp,
    "aws-sdk-java/1.12.772 Linux/5.10.230 OpenJDK_64-Bit_Server_VM/17.0.13 java/17.0.13 vendor/Amazon.com_Inc. hadoop-aws/3.3.6",
    true
  );
  const manifestWriterRole = orchestration === "mwaa" ? "mwaa-execution-role" : emrDataRoleName;
  const dqJobRoleName = `AWSGlueServiceRole-${dagId}-dq`;
  const dqJobIdentity = awsCloudTrailIdentity(
    acct.id,
    { name: dqJobRoleName, email: `${dqJobRoleName}@internal`, department: "service" },
    triggerIp,
    "Boto3/1.34.131 md/Botocore#1.34.131 ua/2.0 os/linux#5.10.0 lang/python#3.10.13 exec-env/AWS_Glue",
    true
  );
  const sinkIdentity = awsCloudTrailIdentity(
    acct.id,
    { name: DQ_S3_SINK_ROLE, email: `${DQ_S3_SINK_ROLE}@internal`, department: "service" },
    triggerIp,
    "aws-sdk-java/1.12.772 Linux/5.15.0 OpenJDK_64-Bit_Server_VM/17.0.13 java/17.0.13 vendor/Eclipse_Adoptium kafka-connect-s3/10.5.20",
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
  const maxTs = (a: string, b: string) => (new Date(a) > new Date(b) ? a : b);
  // Causal ordering guards: Airflow tasks in this DAG are a linear chain, so a task
  // cannot start before its upstream task finished; Step Functions history is
  // strictly monotonic (event ids and timestamps).
  let lastAirflowTaskEnd = ts;
  let lastSfnTs = ts;

  const docs: EcsDocument[] = [];

  const pipelineLabels = {
    pipeline_run_id: pipelineRunId,
    dag_id: dagId,
    s3_source_bucket: sourceBucket,
    s3_source_key: sourceKey,
    orchestration_mode: orchestration,
  };

  // ── OpenLineage helpers (MWAA provider + Spark listener) ────────────────
  // The Airflow DAG run IS the pipeline run: pipelineRunId is the DAG-level
  // run.runId and every task/Spark event points at it via run.facets.parent.
  const olCtx = (svc: "mwaa" | "emr", startedAt?: string) => ({
    region,
    acct,
    cloudServiceName: svc,
    labels: pipelineLabels,
    startedAt,
  });
  const tasksState: Record<string, string> = {};

  /** Airflow task START + COMPLETE/FAIL pair (MWAA mode only). Returns the task run id. */
  const airflowTask = (o: {
    taskId: string;
    operatorClass: string;
    startTs: string;
    endTs: string;
    outcome: "success" | "failed";
    inputs?: OlDataset[];
    outputs?: OlDataset[];
    sql?: string;
    error?: { message: string; stackTrace?: string };
  }): string => {
    if (orchestration !== "mwaa") return "";
    const taskRunId = randUUID();
    // Enforce upstream → downstream ordering (scheduler latency 150–600 ms).
    const startTs = maxTs(o.startTs, plusMs(lastAirflowTaskEnd, randInt(150, 600)));
    const endTs = maxTs(o.endTs, plusMs(startTs, randInt(300, 900)));
    lastAirflowTaskEnd = endTs;
    const runFacets = airflowRunFacets({
      dagId,
      airflowRunId: runId,
      taskId: o.taskId,
      taskUuid: taskRunId,
      operatorClass: o.operatorClass,
      parentRunId: pipelineRunId,
      namespace: olNamespace,
      nominalStart: ts,
      owner: triggerUser.name,
    });
    const jobFacets = airflowJobFacets({ jobType: "TASK", owner: triggerUser.name, sql: o.sql });
    const jobName = `${dagId}.${o.taskId}`;
    docs.push(
      olEcsDoc(
        buildRunEvent({
          ts: startTs,
          eventType: "START",
          runId: taskRunId,
          jobNamespace: olNamespace,
          jobName,
          producer: AIRFLOW_PRODUCER,
          runFacets,
          jobFacets,
          inputs: o.inputs,
        }),
        olCtx("mwaa")
      )
    );
    const eventType: OlEventType = o.outcome === "failed" ? "FAIL" : "COMPLETE";
    docs.push(
      olEcsDoc(
        buildRunEvent({
          ts: endTs,
          eventType,
          runId: taskRunId,
          jobNamespace: olNamespace,
          jobName,
          producer: AIRFLOW_PRODUCER,
          runFacets: {
            ...runFacets,
            ...(o.error
              ? {
                  errorMessage: errorMessageFacet(
                    AIRFLOW_PRODUCER,
                    o.error.message,
                    "python",
                    o.error.stackTrace
                  ),
                }
              : {}),
          },
          jobFacets,
          inputs: o.inputs,
          outputs: o.outputs,
        }),
        olCtx("mwaa", startTs)
      )
    );
    tasksState[o.taskId] = o.outcome === "failed" ? "failed" : "success";
    return taskRunId;
  };

  /** Step Functions execution-history event (CloudWatch Logs delivery, level ALL). */
  const sfnHistory = (
    hTs: string,
    type: string,
    stateName: string | null,
    details: Record<string, unknown>,
    outcome: "success" | "failure" = "success"
  ): EcsDocument => {
    const id = ++sfnEventId;
    const at = maxTs(hTs, plusMs(lastSfnTs, randInt(20, 150)));
    lastSfnTs = at;
    return {
      __dataset: "aws.stepfunctions",
      "@timestamp": at,
      cloud: cloudDoc(region, acct, "stepfunctions"),
      trace: { id: traceId },
      aws: {
        stepfunctions: {
          state_machine_arn: sfnArn,
          execution_name: sfnExecutionName,
          execution_arn: sfnExecutionArn,
          type: "STANDARD",
          event_type: type,
          event_id: id,
          previous_event_id: id - 1,
          ...(stateName ? { state_name: stateName, current_state: stateName } : {}),
          details: JSON.stringify(details),
        },
      },
      event: {
        kind: "event",
        outcome,
        category: ["process"],
        type: type.endsWith("Entered") || type.endsWith("Started") ? ["start"] : ["end"],
        action: type,
        dataset: "aws.stepfunctions",
        provider: "states.amazonaws.com",
      },
      message: `${type}${stateName ? ` ${stateName}` : ""} (${sfnExecutionName})`,
      log: { level: outcome === "failure" ? "error" : "info" },
      labels: pipelineLabels,
    } as EcsDocument;
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

    const dagStartTs = advance(200, 1000);
    lastAirflowTaskEnd = dagStartTs;
    docs.push({
      ...mwaaDoc(dagStartTs, region, acct, dagId, runId, "trigger_dag", "running", {
        operator: "S3KeySensor → TriggerDagRunOperator",
        trigger_source: "s3_event_notification",
        ...pipelineLabels,
      }),
      ...identity,
      labels: pipelineLabels,
    });

    // OpenLineage: DAG-level START (job.name = dag_id, run.runId = the pipeline run)
    docs.push(
      olEcsDoc(
        buildRunEvent({
          ts: dagStartTs,
          eventType: "START",
          runId: pipelineRunId,
          jobNamespace: olNamespace,
          jobName: dagId,
          producer: AIRFLOW_PRODUCER,
          runFacets: airflowDagRunFacets({ nominalStart: ts }),
          jobFacets: airflowJobFacets({
            jobType: "DAG",
            owner: triggerUser.name,
            description:
              "Avro landing → EMR Spark (Parquet) → Glue Data Quality → Kafka (Confluent) → S3",
          }),
        }),
        olCtx("mwaa")
      )
    );

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
          event_type: "ExecutionStarted",
          event_id: ++sfnEventId,
          previous_event_id: 0,
          current_state: "ReadSourceObject",
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
    lastSfnTs = sfnStartTs;

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
        requester: `arn:aws:iam::${acct.id}:role/${emrDataRoleName}`,
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
      emrDataIdentity,
      "GetObject",
      "s3.amazonaws.com",
      { bucketName: sourceBucket, key: sourceKey },
      { "x-amz-request-id": randId(16).toUpperCase() },
      "success",
      { event_category: "Data" }
    ) as EcsDocument
  );

  // Orchestrator view of the source read — Airflow S3KeySensor task (OpenLineage
  // extractor reports the key as an INPUT) or the Step Functions ReadSourceObject state.
  const sourceDataset = s3Dataset(sourceBucket, sourceKey);
  airflowTask({
    taskId: "wait_for_source_file",
    operatorClass: "airflow.providers.amazon.aws.sensors.s3.S3KeySensor",
    startTs: plusMs(s3GetTs, -randInt(300, 900)),
    endTs: s3GetTs,
    outcome: "success",
    inputs: [sourceDataset],
  });
  if (orchestration === "eventbridge") {
    docs.push(
      sfnHistory(plusMs(s3GetTs, -randInt(100, 400)), "TaskStateEntered", "ReadSourceObject", {
        name: "ReadSourceObject",
        input: { bucket: sourceBucket, key: sourceKey },
      })
    );
    docs.push(
      sfnHistory(s3GetTs, "TaskSucceeded", "ReadSourceObject", {
        resourceType: "aws-sdk:s3",
        resource: "headObject",
        output: { ContentLength: sourceBytes, ContentType: "avro/binary" },
      })
    );
  }

  // ── 3. EMR Spark job: Avro → Parquet conversion ───────────────────────────

  const emrStartTs = advance(500, 2000);
  const sparkRecordsRead = isNullFile ? 0 : randInt(100_000, 10_000_000);
  const sparkDurationMs = randInt(30_000, 300_000);
  // Shared across EMR log, Spark OpenLineage outputStatistics and Glue so every
  // source agrees on record counts and on which column drifted.
  const recordsWritten = isNullFile ? 0 : Math.floor(sparkRecordsRead * randFloat(0.6, 0.95));
  const driftDetail = isSchemaDrift ? rand(SCHEMA_DRIFT_COLUMNS) : null;
  let dqState: "SUCCEEDED" | "FAILED" | null = null;
  let dqScore: number | null = null;
  const sparkEndTs = plusMs(emrStartTs, pipelineHalted ? randInt(3_000, 20_000) : sparkDurationMs);
  const outputDate = new Date(ts).toISOString().slice(0, 10);
  const outputKey = `processed/${dagId}/${outputDate}/output.parquet`;
  const outputPrefix = `/processed/${dagId}/${outputDate}`;
  const metadataKey = `runs/${dagId}/${outputDate}/${pipelineRunId}/manifest.json`;
  const emrOperatorClass =
    computeMode === "serverless"
      ? "airflow.providers.amazon.aws.operators.emr.EmrServerlessStartJobOperator"
      : computeMode === "eks"
        ? "airflow.providers.amazon.aws.operators.emr.EmrContainerOperator"
        : "airflow.providers.amazon.aws.operators.emr.EmrAddStepsOperator";

  if (orchestration === "eventbridge") {
    docs.push(
      sfnHistory(plusMs(emrStartTs, -randInt(100, 800)), "TaskStateEntered", "RunSparkJob", {
        name: "RunSparkJob",
        input: { ClusterId: clusterId, Step: { Name: `spark-${dagId}` } },
      })
    );
  }
  // Airflow task START for the EMR step (COMPLETE/FAIL is emitted after the Spark events)
  const sparkTaskRunId = orchestration === "mwaa" ? randUUID() : "";
  if (orchestration === "mwaa") {
    docs.push(
      olEcsDoc(
        buildRunEvent({
          ts: emrStartTs,
          eventType: "START",
          runId: sparkTaskRunId,
          jobNamespace: olNamespace,
          jobName: `${dagId}.spark_avro_to_parquet`,
          producer: AIRFLOW_PRODUCER,
          runFacets: airflowRunFacets({
            dagId,
            airflowRunId: runId,
            taskId: "spark_avro_to_parquet",
            taskUuid: sparkTaskRunId,
            operatorClass: emrOperatorClass,
            parentRunId: pipelineRunId,
            namespace: olNamespace,
            nominalStart: ts,
            owner: triggerUser.name,
          }),
          jobFacets: airflowJobFacets({ jobType: "TASK", owner: triggerUser.name }),
        }),
        olCtx("mwaa")
      )
    );
  }

  if (failureMode === "special_chars") {
    docs.push({
      __dataset: "aws.emr_logs",
      "@timestamp": sparkEndTs, // the step's terminal log line is written when it finishes
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
      "@timestamp": sparkEndTs, // the step's terminal log line is written when it finishes
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
    docs.push({
      __dataset: "aws.emr_logs",
      "@timestamp": sparkEndTs, // the step's terminal log line is written when it finishes
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

  // ── OpenLineage: Spark listener (openlineage-spark) — all orchestration modes ──
  // The listener sees the real datasets: Avro in, Parquet out, with schema,
  // outputStatistics and column lineage. Parent facet ties it back to the
  // Airflow task (spark_inject_parent_job_info) or the Step Functions execution
  // (spark.openlineage.parentRunId set from the state input). Manual runs have
  // no parent — that is what real lineage looks like for ad-hoc submissions.
  {
    const sparkRunId = randUUID();
    const baseFields = [
      { name: "event_id", type: "string" },
      { name: "customer_id", type: "string" },
      { name: "region", type: "string" },
      { name: "product_category", type: "string" },
      { name: "amount", type: "int" },
      { name: "event_ts", type: "timestamp" },
    ];
    const inputSchema = schemaFacet(SPARK_PRODUCER, baseFields);
    let outFields = [...baseFields, { name: "dt", type: "string" }];
    if (driftDetail) {
      // Object-literal union: TS widens absent keys to `?: undefined`, so test values, not keys.
      const added = "added" in driftDetail ? driftDetail.added : undefined;
      const addedType = "type" in driftDetail ? driftDetail.type : undefined;
      const removed = "removed" in driftDetail ? driftDetail.removed : undefined;
      const typeChange = "typeChange" in driftDetail ? driftDetail.typeChange : undefined;
      if (added !== undefined && addedType !== undefined) {
        outFields.push({ name: added, type: addedType });
      } else if (removed !== undefined) {
        outFields = outFields.filter((f) => f.name !== removed);
      } else if (typeChange !== undefined) {
        outFields = outFields.map((f) =>
          f.name === typeChange.column ? { ...f, type: typeChange.to } : f
        );
      }
    }
    const inputDs = s3Dataset(sourceBucket, sourceKey, {
      dataSource: dataSourceFacet(SPARK_PRODUCER, `s3://${sourceBucket}`, `s3://${sourceBucket}`),
      schema: inputSchema,
    });
    const outputDs = s3Dataset(
      outputBucket,
      outputPrefix,
      {
        dataSource: dataSourceFacet(SPARK_PRODUCER, `s3://${outputBucket}`, `s3://${outputBucket}`),
        schema: schemaFacet(SPARK_PRODUCER, outFields),
        columnLineage: columnLineageFacet(
          SPARK_PRODUCER,
          Object.fromEntries(
            baseFields.map((f) => [
              f.name,
              [{ namespace: `s3://${sourceBucket}`, name: `/${sourceKey}`, field: f.name }],
            ])
          )
        ),
      },
      {
        outputFacets: {
          outputStatistics: outputStatisticsFacet(
            SPARK_PRODUCER,
            recordsWritten,
            isNullFile ? 0 : recordsWritten * randInt(80, 240),
            isNullFile ? 0 : randInt(4, 64)
          ),
        },
      }
    );
    // Parent = the run that launched Spark (Airflow task / SFN execution);
    // root = the top-level pipeline run (DAG run / SFN execution).
    const sparkParent =
      orchestration === "mwaa"
        ? {
            runId: sparkTaskRunId,
            jobNamespace: olNamespace,
            jobName: `${dagId}.spark_avro_to_parquet`,
            root: { runId: pipelineRunId, jobNamespace: olNamespace, jobName: dagId },
          }
        : orchestration === "eventbridge"
          ? {
              runId: pipelineRunId,
              jobNamespace: olNamespace,
              jobName: sfnStateMachineName,
              root: {
                runId: pipelineRunId,
                jobNamespace: olNamespace,
                jobName: sfnStateMachineName,
              },
            }
          : undefined;
    const sparkRun = sparkRunFacets({
      applicationId: sparkAppId,
      appName: sparkAppName,
      master: computeMode === "eks" ? "k8s://https://kubernetes.default.svc:443" : "yarn",
      deployMode: "cluster",
      driverHost: `ip-10-0-${randInt(1, 254)}-${randInt(1, 254)}.${region}.compute.internal`,
      parent: sparkParent,
      properties: {
        "spark.openlineage.namespace": olNamespace,
        "spark.openlineage.transport.type": "http",
        ...(sparkParent
          ? {
              "spark.openlineage.parentRunId": sparkParent.runId,
              "spark.openlineage.parentJobName": sparkParent.jobName,
              "spark.openlineage.parentJobNamespace": olNamespace,
              "spark.openlineage.rootParentRunId": sparkParent.root.runId,
              "spark.openlineage.rootParentJobName": sparkParent.root.jobName,
              "spark.openlineage.rootParentJobNamespace": olNamespace,
            }
          : {}),
      },
    });
    const sparkJob = sparkJobName(sparkAppName, `s3://${outputBucket}`, outputPrefix);
    docs.push(
      olEcsDoc(
        buildRunEvent({
          ts: emrStartTs,
          eventType: "START",
          runId: sparkRunId,
          jobNamespace: olNamespace,
          jobName: sparkJob,
          producer: SPARK_PRODUCER,
          runFacets: sparkRun,
          jobFacets: sparkJobFacets(),
          inputs: [inputDs],
        }),
        olCtx("emr")
      )
    );
    const sparkError = pipelineHalted
      ? failureMode === "wrong_format"
        ? {
            message: `org.apache.avro.AvroParseException: Not an Avro data file: s3://${sourceBucket}/${sourceKey}`,
            stackTrace: `org.apache.avro.AvroParseException: Not an Avro data file\n\tat org.apache.avro.file.DataFileReader.openReader(DataFileReader.java:75)\n\tat org.apache.spark.sql.avro.AvroFileFormat.buildReader(AvroFileFormat.java:112)`,
          }
        : {
            message: `java.io.FileNotFoundException: No such file or directory: s3://${sourceBucket}/${sourceKey}`,
            stackTrace: `java.io.FileNotFoundException: No such file or directory: s3://${sourceBucket}/${sourceKey}\n\tat org.apache.hadoop.fs.s3a.S3AFileSystem.getFileStatus(S3AFileSystem.java:3350)`,
          }
      : null;
    docs.push(
      olEcsDoc(
        buildRunEvent({
          ts: sparkEndTs,
          eventType: pipelineHalted ? "FAIL" : "COMPLETE",
          runId: sparkRunId,
          jobNamespace: olNamespace,
          jobName: sparkJob,
          producer: SPARK_PRODUCER,
          runFacets: {
            ...sparkRun,
            ...(sparkError
              ? {
                  errorMessage: errorMessageFacet(
                    SPARK_PRODUCER,
                    sparkError.message,
                    "JAVA",
                    sparkError.stackTrace
                  ),
                }
              : {}),
          },
          jobFacets: sparkJobFacets(),
          inputs: [inputDs],
          outputs: pipelineHalted ? [] : [outputDs],
        }),
        olCtx("emr", emrStartTs)
      )
    );

    // Airflow task COMPLETE/FAIL for the EMR step (mirrors the Spark outcome)
    const sparkTaskEndTs = plusMs(sparkEndTs, randInt(500, 3000));
    if (orchestration === "mwaa") {
      lastAirflowTaskEnd = sparkTaskEndTs;
      docs.push(
        olEcsDoc(
          buildRunEvent({
            ts: sparkTaskEndTs,
            eventType: pipelineHalted ? "FAIL" : "COMPLETE",
            runId: sparkTaskRunId,
            jobNamespace: olNamespace,
            jobName: `${dagId}.spark_avro_to_parquet`,
            producer: AIRFLOW_PRODUCER,
            runFacets: {
              ...airflowRunFacets({
                dagId,
                airflowRunId: runId,
                taskId: "spark_avro_to_parquet",
                taskUuid: sparkTaskRunId,
                operatorClass: emrOperatorClass,
                parentRunId: pipelineRunId,
                namespace: olNamespace,
                nominalStart: ts,
                owner: triggerUser.name,
              }),
              ...(pipelineHalted
                ? {
                    errorMessage: errorMessageFacet(
                      AIRFLOW_PRODUCER,
                      `airflow.exceptions.AirflowException: EMR step ${stepId} failed with state FAILED`,
                      "python"
                    ),
                  }
                : {}),
            },
            jobFacets: airflowJobFacets({ jobType: "TASK", owner: triggerUser.name }),
          }),
          olCtx("mwaa", emrStartTs)
        )
      );
      tasksState["spark_avro_to_parquet"] = pipelineHalted ? "failed" : "success";
    }
    if (orchestration === "eventbridge") {
      docs.push(
        sfnHistory(
          plusMs(sparkEndTs, randInt(200, 1500)),
          pipelineHalted ? "TaskFailed" : "TaskSucceeded",
          "RunSparkJob",
          pipelineHalted
            ? { error: "States.TaskFailed", cause: sparkError?.message ?? "Step FAILED" }
            : {
                resourceType: "elasticmapreduce",
                resource: "addStep.sync",
                output: { StepId: stepId },
              },
          pipelineHalted ? "failure" : "success"
        )
      );
    }
  }

  if (pipelineHalted) {
    // Move the run clock past the Spark failure so the orchestrator's terminal
    // events (DAG FAIL / dag_complete / ExecutionFailed) come after the task FAIL.
    offsetMs = Math.max(
      offsetMs,
      new Date(sparkEndTs).getTime() - baseDate.getTime() + randInt(3_000, 8_000)
    );
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
    // ── 4a. S3 PutObject — Parquet data ───────────────────────────────────
    // Spark writes its output before reporting COMPLETE: advance the run clock to
    // the job end and place the PUT just before it.
    advance(sparkDurationMs, sparkDurationMs + 2000);
    const s3PutTs = plusMs(sparkEndTs, -randInt(500, 3000));
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
          requester: `arn:aws:iam::${acct.id}:role/${emrDataRoleName}`,
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
        emrDataIdentity,
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
          requester: `arn:aws:iam::${acct.id}:role/${manifestWriterRole}`,
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

    // Airflow PythonOperator writing the manifest — lineage via task `outlets`
    airflowTask({
      taskId: "write_run_manifest",
      operatorClass: "airflow.operators.python.PythonOperator",
      startTs: plusMs(metaPutTs, -randInt(300, 2_000)),
      endTs: metaPutTs,
      outcome: "success",
      inputs: [s3Dataset(outputBucket, outputPrefix)],
      outputs: [s3Dataset(metadataBucket, metadataKey)],
    });

    // ── 5. Glue Data Quality — EvaluateDataQuality on the Parquet output ─
    // The orchestrator starts a Glue 4.0 ETL job with the run context as job
    // arguments; the job evaluates the DQDL ruleset against
    // s3://<output bucket><output prefix>/ and publishes the result to Kafka.
    const dqStartTs = advance(2_000, 8_000);
    const dqEndTs = advance(dqDurationMs, dqDurationMs + 3_000);
    const dqBuilt = buildDqResult({
      jobName: dqJobName,
      jobRunId: dqJobRunId,
      evaluationContext: dqEvaluationContext,
      rulesetName: dqRulesetName,
      startedOn: dqStartTs,
      completedOn: dqEndTs,
      rowCount: recordsWritten,
      nullData: isNullFile,
      drift: driftDetail,
      // Unrelated marginal Completeness failures happen in real data; they are a
      // data-quality signal, not a pipeline fault.
      marginalFailureRate: 0.05,
    });
    dqState = dqBuilt.state;
    dqScore = dqBuilt.result.Score;
    const dqInputUri = `s3://${outputBucket}${outputPrefix}/`;
    const dqArguments = {
      "--input_path": dqInputUri,
      "--pipeline_run_id": pipelineRunId,
      "--dq_topic": DQ_TOPIC,
      "--bootstrap_servers": CONFLUENT_BOOTSTRAP,
      "--enable-continuous-cloudwatch-log": "true",
    };
    const dqDpuSeconds = Math.round((dqDurationMs / 1000) * 5); // 5 × G.1X workers

    // Glue job run log (CloudWatch /aws-glue/jobs/output, continuous logging)
    docs.push({
      __dataset: "aws.glue",
      "@timestamp": dqEndTs,
      cloud: cloudDoc(region, acct, "glue"),
      aws: {
        dimensions: { JobName: dqJobName, JobRunId: dqJobRunId, Type: "count" },
        cloudwatch: { log_group: "/aws-glue/jobs/output", log_stream: dqJobRunId },
        glue: {
          job: { name: dqJobName, run_id: dqJobRunId, type: "glueetl", run_state: "SUCCEEDED" },
          glue_version: GLUE_DQ_VERSION,
          worker: { type: "G.1X", count: 5 },
          dpu_seconds: dqDpuSeconds,
          records: { read: recordsWritten, written: 0, errors: 0 },
          arguments: dqArguments,
          continuous_logging: true,
        },
      },
      event: {
        kind: "event",
        outcome: "success",
        category: ["process"],
        type: ["end"],
        duration: dqDurationMs * 1_000_000,
        dataset: "aws.glue",
        provider: "glue.amazonaws.com",
      },
      message: `${dqEndTs} INFO [main] EvaluateDataQuality: ruleset "${dqRulesetName}" evaluated on ${dqInputUri} — resultId=${dqBuilt.result.ResultId} score=${dqBuilt.result.Score} passed=${dqBuilt.passed} failed=${dqBuilt.failed} skipped=${dqBuilt.skipped}; publishing to ${DQ_TOPIC}`,
      log: { level: dqBuilt.state === "FAILED" ? "warn" : "info" },
      ...identity,
      labels: { ...pipelineLabels, ...(isSchemaDrift ? { schema_drift_detected: "true" } : {}) },
    });

    // Orchestrator view — GlueJobOperator task; the Parquet prefix is declared as
    // a task inlet, which the OpenLineage provider reports as the task INPUT.
    airflowTask({
      taskId: "glue_dq_evaluate",
      operatorClass: "airflow.providers.amazon.aws.operators.glue.GlueJobOperator",
      startTs: dqStartTs,
      endTs: dqEndTs,
      outcome: "success",
      inputs: [s3Dataset(outputBucket, outputPrefix)],
    });
    if (orchestration === "eventbridge") {
      docs.push(
        sfnHistory(dqStartTs, "TaskStateEntered", "EvaluateDataQuality", {
          name: "EvaluateDataQuality",
          input: { JobName: dqJobName, Arguments: dqArguments },
        })
      );
      docs.push(
        sfnHistory(dqEndTs, "TaskSucceeded", "EvaluateDataQuality", {
          resourceType: "glue",
          resource: "startJobRun.sync",
          output: { JobRunId: dqJobRunId, JobRunState: "SUCCEEDED", JobName: dqJobName },
        })
      );
    }

    docs.push(
      awsCloudTrailEvent(
        dqStartTs,
        region,
        acct,
        svcRoleIdentity,
        "StartJobRun",
        "glue.amazonaws.com",
        { jobName: dqJobName, arguments: dqArguments },
        { jobRunId: dqJobRunId },
        "success"
      ) as EcsDocument
    );
    // The publisher reads the full result through the API before producing to Kafka.
    docs.push(
      awsCloudTrailEvent(
        plusMs(dqEndTs, randInt(100, 600)),
        region,
        acct,
        dqJobIdentity,
        "GetDataQualityResult",
        "glue.amazonaws.com",
        { resultId: dqBuilt.result.ResultId },
        null,
        "success"
      ) as EcsDocument
    );

    // ── 6. DQ result → Confluent Kafka topic (+ native EventBridge event) ──
    const dqPublishTs = advance(200, 1_500);
    docs.push(
      dqKafkaDoc(dqBuilt, {
        region,
        acct,
        topic: DQ_TOPIC,
        partition: dqPartition,
        offset: dqOffset,
        blockTimestamp: dqPublishTs,
        labels: { ...pipelineLabels, ...(isSchemaDrift ? { schema_drift_detected: "true" } : {}) },
      })
    );

    // Glue DQ emits "Data Quality Evaluation Results Available" when CloudWatch
    // metrics publishing is on; an EventBridge rule forwards it to CloudWatch Logs.
    const dqEbEvent = {
      version: "0",
      id: randUUID(),
      "detail-type": "Data Quality Evaluation Results Available",
      source: "aws.glue-dataquality",
      account: acct.id,
      time: dqEndTs,
      region,
      resources: [],
      detail: dqEventBridgeDetail(dqBuilt, dqEvaluationContext),
    };
    docs.push({
      __dataset: "aws.eventbridge",
      "@timestamp": plusMs(dqEndTs, randInt(300, 2_000)),
      cloud: cloudDoc(region, acct, "eventbridge"),
      aws: {
        eventbridge: {
          rule_name: "glue-dq-results-to-logs",
          event_bus: "default",
          detail_type: dqEbEvent["detail-type"],
          source: dqEbEvent.source,
          matched_rule: true,
          target_arn: `arn:aws:logs:${region}:${acct.id}:log-group:/aws/events/glue-dataquality`,
          detail: JSON.stringify(dqEbEvent.detail),
        },
      },
      event: {
        kind: "event",
        outcome: dqBuilt.state === "SUCCEEDED" ? "success" : "failure",
        category: ["database"],
        type: ["info"],
        dataset: "aws.eventbridge",
        provider: "events.amazonaws.com",
      },
      message: JSON.stringify(dqEbEvent),
      log: { level: dqBuilt.state === "SUCCEEDED" ? "info" : "warn" },
      labels: pipelineLabels,
    });

    // ── 7. Kafka Connect S3 sink → DQ results bucket ─────────────────────
    // The sink commits a file per flush.size records / rotate interval, so the
    // object lands seconds to a minute after the record was produced.
    const sinkTs = advance(5_000, 60_000);
    const sinkStartOffset = dqOffset - (dqOffset % 50);
    const sinkKey = s3SinkObjectKey(DQ_TOPIC, dqPartition, sinkStartOffset);
    const sinkBytes = randInt(40_000, 180_000);
    const connectPod = `${DQ_S3_SINK_CONNECTOR}-connect-0`;
    const connectLogTs = sinkTs.replace("T", " ").replace("Z", "").slice(0, 23).replace(".", ",");
    docs.push({
      __dataset: "aws.eks",
      "@timestamp": sinkTs,
      cloud: cloudDoc(region, acct, "eks"),
      aws: {
        dimensions: {
          ClusterName: CONFLUENT_CLUSTER_NAME,
          Namespace: CONFLUENT_NAMESPACE,
          PodName: connectPod,
        },
        cloudwatch: {
          log_group: `/aws/containerinsights/${CONFLUENT_CLUSTER_NAME}/application`,
          log_stream: `${connectPod}_${CONFLUENT_NAMESPACE}_connect`,
        },
        eks: {
          structured_logging: false,
          log_line_kind: "container",
          cluster: { name: CONFLUENT_CLUSTER_NAME },
          node: {
            name: `ip-10-0-${randInt(1, 254)}-${randInt(1, 254)}.${region}.compute.internal`,
          },
        },
      },
      container: {
        id: randId(12).toLowerCase(),
        name: "connect",
        image: { name: "confluentinc/cp-server-connect:7.7.1" },
        runtime: "containerd",
      },
      kubernetes: {
        namespace: CONFLUENT_NAMESPACE,
        pod: { name: connectPod },
        container: { name: "connect" },
        labels: { app: "connect", "platform.confluent.io/type": "connect", env: "prod" },
      },
      event: {
        kind: "event",
        outcome: "success",
        category: ["process"],
        type: ["info"],
        dataset: "aws.eks",
        provider: "eks.amazonaws.com",
      },
      message: `[${connectLogTs}] INFO [${DQ_S3_SINK_CONNECTOR}|task-0] Files committed to S3. Target commit offset for ${DQ_TOPIC}-${dqPartition} is ${dqOffset + 1} (io.confluent.connect.s3.TopicPartitionWriter:${randInt(400, 460)})`,
      log: { level: "info" },
      labels: pipelineLabels,
    });

    docs.push({
      __dataset: "aws.s3access",
      "@timestamp": sinkTs,
      cloud: cloudDoc(region, acct, "s3"),
      aws: {
        s3access: {
          bucket: dqResultsBucket,
          key: sinkKey,
          operation: "REST.PUT.OBJECT",
          http_status: 200,
          bytes_sent: sinkBytes,
          total_time: randInt(10, 120),
          turn_around_time: randInt(5, 40),
          request_id: randId(16).toUpperCase(),
          requester: `arn:aws:iam::${acct.id}:role/${DQ_S3_SINK_ROLE}`,
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
      message: `S3 PutObject s3://${dqResultsBucket}/${sinkKey} (${sinkBytes} bytes, Kafka Connect S3 sink)`,
      log: { level: "info" },
      labels: { ...pipelineLabels, s3_dq_results_bucket: dqResultsBucket },
    });

    docs.push(
      awsCloudTrailEvent(
        sinkTs,
        region,
        acct,
        sinkIdentity,
        "PutObject",
        "s3.amazonaws.com",
        { bucketName: dqResultsBucket, key: sinkKey },
        { "x-amz-request-id": randId(16).toUpperCase() },
        "success",
        { event_category: "Data" }
      ) as EcsDocument
    );

    // ── 8. EventBridge / Step Functions completion (when applicable) ─────
    if (orchestration === "eventbridge") {
      const sfnEndTs = advance(1000, 3000);
      // The DQ job is configured with ruleset-failure action "None" (Glue default):
      // failed rules lower the score but do not fail the job or the execution.
      const sfnOutcome = "SUCCEEDED";
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
            event_type: sfnOutcome === "SUCCEEDED" ? "ExecutionSucceeded" : "ExecutionFailed",
            event_id: ++sfnEventId,
            previous_event_id: sfnEventId - 1,
            current_state: "PipelineComplete",
            output: JSON.stringify({
              pipeline_run_id: pipelineRunId,
              records_processed: sparkRecordsRead,
              schema_drift: isSchemaDrift,
              dq_state: dqState,
              dq_score: dqScore,
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
        : dqState === "FAILED"
          ? "DQ_RULES_FAILED"
          : "PASSED";
  // Only a halted Spark task fails the DAG run: the Glue DQ job's ruleset-failure
  // action is "None", so failed rules surface as score/state, not as task failure.
  const finalState = pipelineHalted ? "failed" : "success";

  if (orchestration === "mwaa") {
    const dagCompleteDoc = mwaaDoc(
      finalTs,
      region,
      acct,
      dagId,
      runId,
      "dag_complete",
      finalState,
      {
        operator: "DagRunSensor",
        duration_ms: offsetMs,
        quality_check: qualityCheck,
        ...(dqScore !== null ? { dq_score: dqScore, dq_state: dqState } : {}),
        records_processed: isNullFile ? 0 : pipelineHalted ? 0 : sparkRecordsRead,
        ...pipelineLabels,
      }
    );
    docs.push({
      ...dagCompleteDoc,
      event: {
        ...(dagCompleteDoc.event as Record<string, unknown>),
        duration: offsetMs * 1_000_000,
      },
      ...identity,
      labels: { ...pipelineLabels, quality_check: qualityCheck },
    });

    // OpenLineage: DAG-level COMPLETE/FAIL with the airflowState facet (final task states)
    docs.push(
      olEcsDoc(
        buildRunEvent({
          ts: finalTs,
          eventType: finalState === "failed" ? "FAIL" : "COMPLETE",
          runId: pipelineRunId,
          jobNamespace: olNamespace,
          jobName: dagId,
          producer: AIRFLOW_PRODUCER,
          runFacets: {
            ...airflowDagRunFacets({ nominalStart: ts, finalState, tasksState }),
            ...(finalState === "failed"
              ? {
                  errorMessage: errorMessageFacet(
                    AIRFLOW_PRODUCER,
                    `DAG run ${runId} failed: task spark_avro_to_parquet failed`,
                    "python"
                  ),
                }
              : {}),
          },
          jobFacets: airflowJobFacets({
            jobType: "DAG",
            owner: triggerUser.name,
            description:
              "Avro landing → EMR Spark (Parquet) → Glue Data Quality → Kafka (Confluent) → S3",
          }),
        }),
        olCtx("mwaa", ts)
      )
    );
  }

  // ── APM Trace ─────────────────────────────────────────────────────────────
  // (traceId / txId were created at the top of the run so orchestrator logs carry them)

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

    // Glue Data Quality job span (orchestrator waits on startJobRun.sync)
    traceSpans.push(
      makeSpan(
        `glue.StartJobRun → ${dqJobName}`,
        "compute",
        "glue",
        dqDurationMs * 1000,
        `glue-${dqJobName}`,
        "success",
        dqScore !== null ? { labels: { dq_score: String(dqScore), dq_state: String(dqState) } } : {}
      )
    );

    // Kafka produce span — the DQ publisher writing to the Confluent topic. The
    // downstream S3 sink is asynchronous and not part of the orchestrator's trace.
    traceSpans.push(
      makeSpan(
        `kafka.produce → ${DQ_TOPIC}`,
        "messaging",
        "kafka",
        randInt(20, 250) * 1000,
        DQ_TOPIC,
        "success",
        { message: { queue: { name: DQ_TOPIC } } }
      )
    );
  }

  const traceDocs = [txDoc, ...traceSpans];
  for (const td of traceDocs) {
    (td as Record<string, unknown>).__dataset = "apm";
  }

  const metricDocs = pipelineMetricDocs(orchestration, ts, er, region, acct, pipelineRunId);

  // ── Correlation enrichment (what an ingest pipeline does in production) ────
  // • CloudTrail companions get labels.pipeline_run_id. Real CloudTrail records
  //   carry no such label; in production an enrich processor keyed on the native
  //   ids in requestParameters/responseElements (StepIds, executionArn,
  //   QueryExecutionId, dag_run_id) attaches it. See docs/chained-events/data-pipeline-lineage.md.
  // • Orchestrator logs (Airflow task logs, Step Functions history, EventBridge)
  //   carry trace.id — that is what an ADOT/OTel-instrumented worker emits.
  const ORCHESTRATOR_DATASETS = new Set(["aws.mwaa", "aws.stepfunctions", "aws.eventbridge"]);
  for (const d of docs) {
    const ds = (d as Record<string, unknown>).__dataset;
    if (ds === "aws.cloudtrail" && !(d as Record<string, unknown>).labels) {
      (d as Record<string, unknown>).labels = {
        pipeline_run_id: pipelineRunId,
        dag_id: dagId,
        orchestration_mode: orchestration,
      };
    }
    if (
      typeof ds === "string" &&
      ORCHESTRATOR_DATASETS.has(ds) &&
      !(d as Record<string, unknown>).trace
    ) {
      (d as Record<string, unknown>).trace = { id: traceId };
    }
  }

  return [...docs, ...traceDocs, ...metricDocs];
}
