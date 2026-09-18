/**
 * OpenLineage RunEvent builders + standalone generator.
 *
 * Real data platforms do NOT stamp lineage onto raw service logs — S3 access
 * logs, EMR step logs, Glue crawler logs and Athena query logs know nothing
 * about "stages". Lineage is emitted by the components that actually know the
 * graph:
 *
 *   • Apache Airflow (MWAA) via `apache-airflow-providers-openlineage`
 *       [openlineage] namespace = mwaa-<env>
 *       [openlineage] transport = {"type":"http","url":"https://<agent>:8080","endpoint":"api/v1/lineage"}
 *     → one RunEvent per DAG run (job.name = dag_id) and per task instance
 *       (job.name = "<dag_id>.<task_id>", run.facets.parent → the DAG run).
 *
 *   • Spark on EMR via the `openlineage-spark` listener
 *       --conf spark.extraListeners=io.openlineage.spark.agent.OpenLineageSparkListener
 *       --conf spark.openlineage.transport.type=http
 *       --conf spark.openlineage.namespace=mwaa-<env>
 *       --conf spark.openlineage.parentRunId=<airflow task run id>   (injected by the
 *             provider when [openlineage] spark_inject_parent_job_info = True)
 *     → START/COMPLETE/FAIL with the actual input/output datasets (schema,
 *       outputStatistics, columnLineage) and spark_applicationDetails.
 *
 * Those events reach Elastic over the Elastic Agent **HTTP Endpoint** input
 * (`input.type: http_endpoint`) and are parsed by `logs-aws.openlineage-default`.
 *
 * The documents produced here are the *post-pipeline* ECS shape (curated
 * `aws.openlineage.*` fields) with the raw RunEvent preserved in `message`, so
 * they look exactly like what the shipped ingest pipeline produces from a real
 * event. Field contract (used by dashboards, rules, ML jobs, workflow):
 *
 *   aws.openlineage.event_type            START | RUNNING | COMPLETE | FAIL | ABORT
 *   aws.openlineage.event_time            ISO-8601 (also @timestamp)
 *   aws.openlineage.producer              producer URI
 *   aws.openlineage.run.id                run UUID
 *   aws.openlineage.run.parent.id         immediate parent run (DAG run for tasks / Airflow task for Spark)
 *   aws.openlineage.run.parent.job_name   parent job name
 *   aws.openlineage.run.root.id           top-level run (ParentRunFacet 1-1-0 `root`) — the DAG run /
 *                                         Step Functions execution, even for Spark launched by a task
 *   aws.openlineage.run.root.job_name     root job name
 *   aws.openlineage.run.duration_ms       COMPLETE/FAIL only (eventTime − START eventTime)
 *   aws.openlineage.job.namespace|name    OpenLineage job identity
 *   aws.openlineage.job.type              DAG | TASK | JOB | SQL_JOB
 *   aws.openlineage.job.integration       AIRFLOW | SPARK
 *   aws.openlineage.processing_engine.*   name/version
 *   aws.openlineage.airflow.*             dag_id, run_id, task_id, try_number, operator_class, dag_run_state
 *   aws.openlineage.spark.*               application_id, app_name, master, deploy_mode
 *   aws.openlineage.inputs[] / outputs[]  dataset URIs (namespace + name)
 *   aws.openlineage.input_count / output_count
 *   aws.openlineage.output_statistics.*   row_count, size, file_count
 *   aws.openlineage.output_schema_fields[] "name:type" (column-level drift is visible here)
 *   aws.openlineage.sql.query|dialect     SQL job facet (Athena operator)
 *   error.message / error.type / error.stack_trace   from run.facets.errorMessage on FAIL
 *   labels.pipeline_run_id                = run.root.id → run.parent.id → run.id (first present)
 *
 * @module aws/generators/openlineage
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- OpenLineage facets are open-ended JSON blobs */

import { rand, randInt, randUUID, randAccount, REGIONS } from "../../helpers";
import type { EcsDocument } from "./types.js";

// ── Producers / spec ────────────────────────────────────────────────────────

export const OL_SCHEMA_URL = "https://openlineage.io/spec/2-0-2/OpenLineage.json#/$defs/RunEvent";
// Versions track current releases (checked Sept 2026): apache-airflow-providers-openlineage
// 2.20.1 on PyPI, OpenLineage 1.53.0, Spark 3.5.5 as shipped by Amazon EMR 7.9.
export const AIRFLOW_PROVIDER_VERSION = "2.20.1";
export const AIRFLOW_VERSION = "2.10.5"; // MWAA-supported Airflow 2.x line
export const AIRFLOW_PRODUCER = `https://github.com/apache/airflow/tree/providers-openlineage/${AIRFLOW_PROVIDER_VERSION}`;
export const OPENLINEAGE_SPARK_VERSION = "1.53.0";
export const SPARK_VERSION = "3.5.5";
export const SPARK_PRODUCER = `https://github.com/OpenLineage/OpenLineage/tree/${OPENLINEAGE_SPARK_VERSION}/integration/spark`;

const FACETS_BASE = "https://openlineage.io/spec/facets";
const RUN_FACET_GENERIC = "https://openlineage.io/spec/2-0-2/OpenLineage.json#/$defs/RunFacet";
const AIRFLOW_FACET_BASE = `https://raw.githubusercontent.com/apache/airflow/providers-openlineage/${AIRFLOW_PROVIDER_VERSION}/providers/openlineage/src/airflow/providers/openlineage/facets`;

function facetMeta(producer: string, schemaURL: string) {
  return { _producer: producer, _schemaURL: schemaURL };
}

// ── Types ───────────────────────────────────────────────────────────────────

export type OlEventType = "START" | "RUNNING" | "COMPLETE" | "FAIL" | "ABORT";

export interface OlDataset {
  namespace: string;
  name: string;
  facets?: Record<string, unknown>;
  inputFacets?: Record<string, unknown>;
  outputFacets?: Record<string, unknown>;
}

export interface OlRunEvent {
  eventType: OlEventType;
  eventTime: string;
  run: { runId: string; facets: Record<string, unknown> };
  job: { namespace: string; name: string; facets: Record<string, unknown> };
  inputs: OlDataset[];
  outputs: OlDataset[];
  producer: string;
  schemaURL: string;
}

/** Add `ms` milliseconds to an ISO timestamp. */
export function plusMs(ts: string, ms: number): string {
  return new Date(new Date(ts).getTime() + ms).toISOString();
}

// ── RunEvent (wire format) ──────────────────────────────────────────────────

export function buildRunEvent(o: {
  ts: string;
  eventType: OlEventType;
  runId: string;
  jobNamespace: string;
  jobName: string;
  producer: string;
  runFacets?: Record<string, unknown>;
  jobFacets?: Record<string, unknown>;
  inputs?: OlDataset[];
  outputs?: OlDataset[];
}): OlRunEvent {
  return {
    eventType: o.eventType,
    eventTime: o.ts,
    run: { runId: o.runId, facets: o.runFacets ?? {} },
    job: { namespace: o.jobNamespace, name: o.jobName, facets: o.jobFacets ?? {} },
    inputs: o.inputs ?? [],
    outputs: o.outputs ?? [],
    producer: o.producer,
    schemaURL: OL_SCHEMA_URL,
  };
}

// ── Standard facets ─────────────────────────────────────────────────────────

export interface OlParentRef {
  runId: string;
  jobNamespace: string;
  jobName: string;
}

/**
 * ParentRunFacet 1-1-0. `root` identifies the top-level run (the Airflow DAG
 * run) even when the immediate parent is an intermediate run (an Airflow task
 * that launched a Spark job) — the Airflow provider injects
 * spark.openlineage.rootParentRunId / rootParentJobName for exactly this.
 */
export function parentFacet(
  producer: string,
  runId: string,
  jobNamespace: string,
  jobName: string,
  root?: OlParentRef
) {
  return {
    ...facetMeta(producer, `${FACETS_BASE}/1-1-0/ParentRunFacet.json#/$defs/ParentRunFacet`),
    run: { runId },
    job: { namespace: jobNamespace, name: jobName },
    ...(root
      ? {
          root: {
            run: { runId: root.runId },
            job: { namespace: root.jobNamespace, name: root.jobName },
          },
        }
      : {}),
  };
}

export function nominalTimeFacet(producer: string, start: string, end?: string) {
  return {
    ...facetMeta(
      producer,
      `${FACETS_BASE}/1-0-0/NominalTimeRunFacet.json#/$defs/NominalTimeRunFacet`
    ),
    nominalStartTime: start,
    ...(end ? { nominalEndTime: end } : {}),
  };
}

export function processingEngineFacet(
  producer: string,
  name: string,
  version: string,
  adapterVersion: string
) {
  return {
    ...facetMeta(
      producer,
      `${FACETS_BASE}/1-1-1/ProcessingEngineRunFacet.json#/$defs/ProcessingEngineRunFacet`
    ),
    name,
    version,
    openlineageAdapterVersion: adapterVersion,
  };
}

export function errorMessageFacet(
  producer: string,
  message: string,
  programmingLanguage: string,
  stackTrace?: string
) {
  return {
    ...facetMeta(
      producer,
      `${FACETS_BASE}/1-0-0/ErrorMessageRunFacet.json#/$defs/ErrorMessageRunFacet`
    ),
    message,
    programmingLanguage,
    ...(stackTrace ? { stackTrace } : {}),
  };
}

export function jobTypeFacet(
  producer: string,
  integration: "AIRFLOW" | "SPARK",
  jobType: "DAG" | "TASK" | "JOB" | "SQL_JOB",
  processingType: "BATCH" | "STREAMING" = "BATCH"
) {
  return {
    ...facetMeta(producer, `${FACETS_BASE}/2-0-3/JobTypeJobFacet.json#/$defs/JobTypeJobFacet`),
    processingType,
    integration,
    jobType,
  };
}

export function sqlFacet(producer: string, query: string, dialect = "awsathena") {
  return {
    ...facetMeta(producer, `${FACETS_BASE}/1-0-0/SQLJobFacet.json#/$defs/SQLJobFacet`),
    query,
    dialect,
  };
}

export function ownershipFacet(producer: string, owner: string) {
  return {
    ...facetMeta(producer, `${FACETS_BASE}/1-0-0/OwnershipJobFacet.json#/$defs/OwnershipJobFacet`),
    owners: [{ name: `user:${owner}`, type: "MAINTAINER" }],
  };
}

export function documentationFacet(producer: string, description: string) {
  return {
    ...facetMeta(
      producer,
      `${FACETS_BASE}/1-0-0/DocumentationJobFacet.json#/$defs/DocumentationJobFacet`
    ),
    description,
  };
}

export function schemaFacet(producer: string, fields: Array<{ name: string; type: string }>) {
  return {
    ...facetMeta(
      producer,
      `${FACETS_BASE}/1-1-1/SchemaDatasetFacet.json#/$defs/SchemaDatasetFacet`
    ),
    fields,
  };
}

export function dataSourceFacet(producer: string, name: string, uri: string) {
  return {
    ...facetMeta(
      producer,
      `${FACETS_BASE}/1-0-0/DatasourceDatasetFacet.json#/$defs/DatasourceDatasetFacet`
    ),
    name,
    uri,
  };
}

export function symlinksFacet(
  producer: string,
  identifiers: Array<{ namespace: string; name: string; type: string }>
) {
  return {
    ...facetMeta(
      producer,
      `${FACETS_BASE}/1-0-0/SymlinksDatasetFacet.json#/$defs/SymlinksDatasetFacet`
    ),
    identifiers,
  };
}

export function outputStatisticsFacet(
  producer: string,
  rowCount: number,
  size: number,
  fileCount?: number
) {
  return {
    ...facetMeta(
      producer,
      `${FACETS_BASE}/1-0-2/OutputStatisticsOutputDatasetFacet.json#/$defs/OutputStatisticsOutputDatasetFacet`
    ),
    rowCount,
    size,
    ...(fileCount !== undefined ? { fileCount } : {}),
  };
}

export function columnLineageFacet(
  producer: string,
  fields: Record<string, Array<{ namespace: string; name: string; field: string }>>
) {
  const out: Record<string, unknown> = {};
  for (const [col, inputFields] of Object.entries(fields)) {
    out[col] = { inputFields, transformationType: "IDENTITY" };
  }
  return {
    ...facetMeta(
      producer,
      `${FACETS_BASE}/1-2-0/ColumnLineageDatasetFacet.json#/$defs/ColumnLineageDatasetFacet`
    ),
    fields: out,
  };
}

// ── Airflow provider facets ─────────────────────────────────────────────────

export function airflowRunFacets(o: {
  dagId: string;
  airflowRunId: string;
  taskId: string;
  taskUuid: string;
  operatorClass: string;
  tryNumber?: number;
  parentRunId: string;
  namespace: string;
  nominalStart: string;
  owner: string;
  schedule?: string;
}) {
  return {
    airflow: {
      ...facetMeta(AIRFLOW_PRODUCER, `${AIRFLOW_FACET_BASE}/AirflowRunFacet.json`),
      dag: {
        dag_id: o.dagId,
        owner: o.owner,
        schedule_interval: o.schedule ?? "@daily",
        start_date: "2024-01-01T00:00:00+00:00",
        tags: "['data-platform']",
        timetable: { expression: o.schedule ?? "@daily", timezone: "UTC" },
      },
      dagRun: {
        conf: {},
        dag_id: o.dagId,
        data_interval_start: o.nominalStart,
        data_interval_end: o.nominalStart,
        external_trigger: false,
        run_id: o.airflowRunId,
        run_type: "scheduled",
        start_date: o.nominalStart,
      },
      task: {
        task_id: o.taskId,
        operator_class: o.operatorClass,
        depends_on_past: false,
        retries: 1,
        trigger_rule: "all_success",
        is_setup: false,
        is_teardown: false,
        mapped: false,
        multiple_outputs: false,
        owner: o.owner,
        priority_weight: 1,
        queue: "default",
      },
      taskInstance: {
        try_number: o.tryNumber ?? 1,
        pool: "default_pool",
        queue: "default",
        map_index: -1,
      },
      taskUuid: o.taskUuid,
    },
    // For a task the DAG run is both the parent and the root.
    parent: parentFacet(AIRFLOW_PRODUCER, o.parentRunId, o.namespace, o.dagId, {
      runId: o.parentRunId,
      jobNamespace: o.namespace,
      jobName: o.dagId,
    }),
    nominalTime: nominalTimeFacet(AIRFLOW_PRODUCER, o.nominalStart),
    processing_engine: processingEngineFacet(
      AIRFLOW_PRODUCER,
      "Airflow",
      AIRFLOW_VERSION,
      AIRFLOW_PROVIDER_VERSION
    ),
  };
}

export function airflowDagRunFacets(o: {
  nominalStart: string;
  finalState?: "success" | "failed";
  tasksState?: Record<string, string>;
}) {
  return {
    nominalTime: nominalTimeFacet(AIRFLOW_PRODUCER, o.nominalStart),
    processing_engine: processingEngineFacet(
      AIRFLOW_PRODUCER,
      "Airflow",
      AIRFLOW_VERSION,
      AIRFLOW_PROVIDER_VERSION
    ),
    ...(o.finalState
      ? {
          airflowState: {
            ...facetMeta(AIRFLOW_PRODUCER, `${AIRFLOW_FACET_BASE}/AirflowStateRunFacet.json`),
            dagRunState: o.finalState,
            tasksState: o.tasksState ?? {},
          },
        }
      : {}),
  };
}

export function airflowJobFacets(o: {
  jobType: "DAG" | "TASK";
  owner: string;
  description?: string;
  sql?: string;
}) {
  return {
    jobType: jobTypeFacet(AIRFLOW_PRODUCER, "AIRFLOW", o.jobType),
    ownership: ownershipFacet(AIRFLOW_PRODUCER, o.owner),
    ...(o.description
      ? { documentation: documentationFacet(AIRFLOW_PRODUCER, o.description) }
      : {}),
    ...(o.sql ? { sql: sqlFacet(AIRFLOW_PRODUCER, o.sql, "awsathena") } : {}),
  };
}

// ── Spark listener facets ───────────────────────────────────────────────────

export function sparkRunFacets(o: {
  applicationId: string;
  appName: string;
  master: string;
  deployMode: "cluster" | "client";
  driverHost: string;
  parent?: OlParentRef & { root?: OlParentRef };
  properties?: Record<string, string>;
}) {
  return {
    spark_applicationDetails: {
      ...facetMeta(SPARK_PRODUCER, RUN_FACET_GENERIC),
      master: o.master,
      appName: o.appName,
      applicationId: o.applicationId,
      deployMode: o.deployMode,
      driverHost: o.driverHost,
      userName: "hadoop",
      uiWebUrl: `http://${o.driverHost}:4040`,
    },
    spark_properties: {
      ...facetMeta(SPARK_PRODUCER, RUN_FACET_GENERIC),
      properties: {
        "spark.master": o.master,
        "spark.app.name": o.appName,
        "spark.submit.deployMode": o.deployMode,
        "spark.sql.avro.compression.codec": "snappy",
        "spark.sql.parquet.compression.codec": "snappy",
        ...(o.properties ?? {}),
      },
    },
    processing_engine: processingEngineFacet(
      SPARK_PRODUCER,
      "spark",
      SPARK_VERSION,
      OPENLINEAGE_SPARK_VERSION
    ),
    ...(o.parent
      ? {
          parent: parentFacet(
            SPARK_PRODUCER,
            o.parent.runId,
            o.parent.jobNamespace,
            o.parent.jobName,
            o.parent.root
          ),
        }
      : {}),
  };
}

export function sparkJobFacets() {
  return { jobType: jobTypeFacet(SPARK_PRODUCER, "SPARK", "JOB") };
}

/**
 * OpenLineage Spark job naming: `<appName>.<execution_node>.<output_dataset>`
 * (spark.openlineage.jobName.appendDatasetName defaults to true).
 */
export function sparkJobName(appName: string, outputNamespace: string, outputName: string): string {
  const ds = `${outputNamespace.replace(/^[a-z0-9]+:\/\//, "")}${outputName}`
    .replace(/^\/+|\/+$/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .toLowerCase();
  return `${appName.replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase()}.execute_insert_into_hadoop_fs_relation_command.${ds}`;
}

// ── Dataset naming (OpenLineage naming spec) ────────────────────────────────

export function s3Dataset(
  bucket: string,
  key: string,
  facets?: Record<string, unknown>,
  extra?: Pick<OlDataset, "inputFacets" | "outputFacets">
): OlDataset {
  const name = key.startsWith("/") ? key : `/${key}`;
  return { namespace: `s3://${bucket}`, name, ...(facets ? { facets } : {}), ...(extra ?? {}) };
}

export function athenaTableDataset(
  region: string,
  database: string,
  table: string,
  facets?: Record<string, unknown>
): OlDataset {
  return {
    namespace: `awsathena://athena.${region}.amazonaws.com`,
    name: `${database}.${table}`,
    ...(facets ? { facets } : {}),
  };
}

export function datasetUri(d: OlDataset): string {
  return d.name.startsWith("/") ? `${d.namespace}${d.name}` : `${d.namespace}/${d.name}`;
}

// ── ECS document (post-pipeline shape) ──────────────────────────────────────

export interface OlEcsContext {
  region: string;
  acct: { id: string; name: string };
  /** cloud.service.name of the emitter — "mwaa" for Airflow, "emr" for Spark */
  cloudServiceName: "mwaa" | "emr";
  labels?: Record<string, unknown>;
  /** eventTime of the matching START event — enables run.duration_ms + event.duration on terminal events */
  startedAt?: string;
}

/**
 * Turn a RunEvent into the ECS document the `logs-aws.openlineage-default`
 * pipeline produces. The raw event is preserved verbatim in `message`.
 */
export function olEcsDoc(ev: OlRunEvent, ctx: OlEcsContext): EcsDocument {
  const rf = ev.run.facets as Record<string, any>;
  const jf = ev.job.facets as Record<string, any>;
  const terminal =
    ev.eventType === "COMPLETE" || ev.eventType === "FAIL" || ev.eventType === "ABORT";
  const durationMs =
    terminal && ctx.startedAt
      ? Math.max(0, new Date(ev.eventTime).getTime() - new Date(ctx.startedAt).getTime())
      : undefined;

  const inputs = ev.inputs.map(datasetUri);
  const outputs = ev.outputs.map(datasetUri);
  const firstOut = ev.outputs[0];
  const stats = firstOut?.outputFacets?.outputStatistics as Record<string, any> | undefined;
  const outSchema = (firstOut?.facets?.schema as Record<string, any> | undefined)?.fields as
    | Array<{ name: string; type: string }>
    | undefined;

  const integration: "AIRFLOW" | "SPARK" = jf.jobType?.integration ?? "AIRFLOW";
  const owner: string | undefined = jf.ownership?.owners?.[0]?.name?.replace(/^user:/, "");
  const parent = rf.parent as Record<string, any> | undefined;
  // Run key precedence: root (top-level DAG run) → immediate parent → this run.
  const pipelineRunId: string = parent?.root?.run?.runId ?? parent?.run?.runId ?? ev.run.runId;

  const eventType =
    ev.eventType === "START" || ev.eventType === "RUNNING"
      ? ["start"]
      : ev.eventType === "COMPLETE"
        ? ["end"]
        : ["end", "error"];
  const outcome =
    ev.eventType === "COMPLETE"
      ? "success"
      : ev.eventType === "FAIL" || ev.eventType === "ABORT"
        ? "failure"
        : "unknown";

  const ol: Record<string, unknown> = {
    event_type: ev.eventType,
    event_time: ev.eventTime,
    producer: ev.producer,
    schema_url: ev.schemaURL,
    run: {
      id: ev.run.runId,
      ...(durationMs !== undefined ? { duration_ms: durationMs } : {}),
      ...(parent
        ? {
            parent: {
              id: parent.run.runId,
              job_name: parent.job.name,
              job_namespace: parent.job.namespace,
            },
          }
        : {}),
      ...(parent?.root
        ? { root: { id: parent.root.run.runId, job_name: parent.root.job.name } }
        : {}),
      ...(rf.nominalTime?.nominalStartTime
        ? { nominal_start_time: rf.nominalTime.nominalStartTime }
        : {}),
      ...(rf.nominalTime?.nominalEndTime
        ? { nominal_end_time: rf.nominalTime.nominalEndTime }
        : {}),
    },
    job: {
      namespace: ev.job.namespace,
      name: ev.job.name,
      type: jf.jobType?.jobType,
      integration,
      processing_type: jf.jobType?.processingType ?? "BATCH",
    },
    ...(rf.processing_engine
      ? {
          processing_engine: {
            name: rf.processing_engine.name,
            version: rf.processing_engine.version,
          },
        }
      : {}),
    ...(rf.airflow || rf.airflowState
      ? {
          airflow: {
            ...(rf.airflow
              ? {
                  dag_id: rf.airflow.dag.dag_id,
                  run_id: rf.airflow.dagRun.run_id,
                  task_id: rf.airflow.task.task_id,
                  operator_class: rf.airflow.task.operator_class,
                  try_number: rf.airflow.taskInstance.try_number,
                }
              : { dag_id: ev.job.name }),
            ...(rf.airflowState ? { dag_run_state: rf.airflowState.dagRunState } : {}),
          },
        }
      : {}),
    ...(rf.spark_applicationDetails
      ? {
          spark: {
            application_id: rf.spark_applicationDetails.applicationId,
            app_name: rf.spark_applicationDetails.appName,
            master: rf.spark_applicationDetails.master,
            deploy_mode: rf.spark_applicationDetails.deployMode,
          },
        }
      : {}),
    inputs,
    outputs,
    input_count: inputs.length,
    output_count: outputs.length,
    ...(stats
      ? {
          output_statistics: {
            row_count: stats.rowCount,
            size: stats.size,
            ...(stats.fileCount !== undefined ? { file_count: stats.fileCount } : {}),
          },
        }
      : {}),
    ...(outSchema ? { output_schema_fields: outSchema.map((f) => `${f.name}:${f.type}`) } : {}),
    ...(jf.sql ? { sql: { query: jf.sql.query, dialect: jf.sql.dialect } } : {}),
  };

  const err = rf.errorMessage as Record<string, any> | undefined;

  return {
    __dataset: "aws.openlineage",
    "@timestamp": ev.eventTime,
    cloud: {
      provider: "aws",
      region: ctx.region,
      account: { id: ctx.acct.id, name: ctx.acct.name },
      service: { name: ctx.cloudServiceName },
    },
    aws: { openlineage: ol },
    event: {
      kind: "event",
      category: ["process"],
      type: eventType,
      action: ev.eventType,
      outcome,
      dataset: "aws.openlineage",
      provider:
        integration === "SPARK" ? "elasticmapreduce.amazonaws.com" : "airflow.amazonaws.com",
      ...(durationMs !== undefined ? { duration: durationMs * 1_000_000 } : {}),
    },
    ...(owner ? { user: { name: owner } } : {}),
    ...(err
      ? {
          error: {
            message: err.message,
            type: String(err.message).split(":")[0]?.trim() || "RuntimeError",
            ...(err.stackTrace ? { stack_trace: err.stackTrace } : {}),
          },
        }
      : {}),
    message: JSON.stringify(ev),
    log: { level: outcome === "failure" ? "error" : "info" },
    // Chain-supplied labels win (they carry the authoritative run id); the
    // derived value is the standalone/ingest-pipeline fallback.
    labels: { pipeline_run_id: pipelineRunId, ...(ctx.labels ?? {}) },
  } as EcsDocument;
}

// ── Standalone generator (single event) ─────────────────────────────────────

const OL_DAGS = [
  "data_pipeline_daily",
  "analytics_etl_hourly",
  "warehouse_refresh",
  "customer_360_pipeline",
  "clickstream_processing",
];

const OL_TASKS: Array<{
  taskId: string;
  operatorClass: string;
  inputs: (region: string, dag: string) => OlDataset[];
  outputs: (region: string, dag: string) => OlDataset[];
  sql?: (dag: string) => string;
}> = [
  {
    taskId: "wait_for_source_file",
    operatorClass: "airflow.providers.amazon.aws.sensors.s3.S3KeySensor",
    inputs: () => [s3Dataset("analytics-raw-data", "events/2025/04/16/hourly_events.avro")],
    outputs: () => [],
  },
  {
    taskId: "spark_avro_to_parquet",
    operatorClass: "airflow.providers.amazon.aws.operators.emr.EmrAddStepsOperator",
    inputs: () => [],
    outputs: () => [],
  },
  {
    taskId: "write_run_manifest",
    operatorClass: "airflow.operators.python.PythonOperator",
    inputs: () => [],
    outputs: (_r, dag) => [s3Dataset("etl-run-manifests", `runs/${dag}/2025-04-16/manifest.json`)],
  },
  {
    // GlueJobOperator running the EvaluateDataQuality job; the Parquet prefix is a
    // task inlet, so the provider reports it as the task INPUT.
    taskId: "glue_dq_evaluate",
    operatorClass: "airflow.providers.amazon.aws.operators.glue.GlueJobOperator",
    inputs: (_r, dag) => [s3Dataset("analytics-processed", `processed/${dag}/2025-04-16`)],
    outputs: () => [],
  },
];

/**
 * Standalone OpenLineage generator — one RunEvent per call, mixing Airflow
 * task events (70%) and Spark listener events (30%). Use the Data Pipeline
 * chain for fully correlated end-to-end runs.
 */
export function generateOpenLineageLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const namespace = `mwaa-${acct.name}`;
  const dagId = rand(OL_DAGS);
  const dagRunId = randUUID(); // the pipeline run (root)
  const parentRunId = randUUID(); // Airflow task run that launched Spark
  const runId = randUUID();
  const isFail = Math.random() < er;
  const eventType: OlEventType = isFail ? "FAIL" : Math.random() < 0.45 ? "START" : "COMPLETE";
  const startedAt = eventType === "START" ? undefined : plusMs(ts, -randInt(5_000, 900_000));
  const owner = rand(["jordan.chen", "priya.sharma", "sam.wilson", "maya.patel"]);

  if (Math.random() < 0.3) {
    // Spark listener event (parent = an Airflow task run)
    const outBucket = rand(["analytics-processed", "curated-data-lake", "warehouse-staging"]);
    const outName = `/processed/${dagId}/2025-04-16`;
    const appName = "avro_to_parquet";
    const appId = `application_${Date.now() - randInt(0, 3_600_000)}_${randInt(1000, 9999)}`;
    const rows = randInt(100_000, 10_000_000);
    const ev = buildRunEvent({
      ts,
      eventType,
      runId,
      jobNamespace: namespace,
      jobName: sparkJobName(appName, `s3://${outBucket}`, outName),
      producer: SPARK_PRODUCER,
      runFacets: {
        ...sparkRunFacets({
          applicationId: appId,
          appName,
          master: "yarn",
          deployMode: "cluster",
          driverHost: `ip-10-0-${randInt(1, 254)}-${randInt(1, 254)}.${region}.compute.internal`,
          parent: {
            runId: parentRunId,
            jobNamespace: namespace,
            jobName: `${dagId}.spark_avro_to_parquet`,
            root: { runId: dagRunId, jobNamespace: namespace, jobName: dagId },
          },
        }),
        ...(isFail
          ? {
              errorMessage: errorMessageFacet(
                SPARK_PRODUCER,
                "org.apache.avro.AvroParseException: Not an Avro data file",
                "JAVA"
              ),
            }
          : {}),
      },
      jobFacets: sparkJobFacets(),
      inputs: [
        s3Dataset("analytics-raw-data", "events/2025/04/16/hourly_events.avro", {
          dataSource: dataSourceFacet(
            SPARK_PRODUCER,
            "s3://analytics-raw-data",
            "s3://analytics-raw-data"
          ),
          schema: schemaFacet(SPARK_PRODUCER, [
            { name: "event_id", type: "string" },
            { name: "customer_id", type: "string" },
            { name: "amount", type: "int" },
            { name: "event_ts", type: "timestamp" },
          ]),
        }),
      ],
      outputs:
        eventType === "START"
          ? []
          : [
              s3Dataset(
                outBucket,
                outName,
                {
                  dataSource: dataSourceFacet(
                    SPARK_PRODUCER,
                    `s3://${outBucket}`,
                    `s3://${outBucket}`
                  ),
                  schema: schemaFacet(SPARK_PRODUCER, [
                    { name: "event_id", type: "string" },
                    { name: "customer_id", type: "string" },
                    { name: "amount", type: "int" },
                    { name: "event_ts", type: "timestamp" },
                    { name: "dt", type: "string" },
                  ]),
                },
                {
                  outputFacets: {
                    outputStatistics: outputStatisticsFacet(
                      SPARK_PRODUCER,
                      isFail ? 0 : rows,
                      isFail ? 0 : rows * randInt(80, 240),
                      isFail ? 0 : randInt(4, 64)
                    ),
                  },
                }
              ),
            ],
    });
    return olEcsDoc(ev, { region, acct, cloudServiceName: "emr", startedAt });
  }

  const task = rand(OL_TASKS);
  const nominal = plusMs(ts, -randInt(60_000, 3_600_000));
  const ev = buildRunEvent({
    ts,
    eventType,
    runId,
    jobNamespace: namespace,
    jobName: `${dagId}.${task.taskId}`,
    producer: AIRFLOW_PRODUCER,
    runFacets: {
      ...airflowRunFacets({
        dagId,
        airflowRunId: `scheduled__${nominal.replace(/[:.]/g, "_")}`,
        taskId: task.taskId,
        taskUuid: runId,
        operatorClass: task.operatorClass,
        parentRunId: dagRunId,
        namespace,
        nominalStart: nominal,
        owner,
      }),
      ...(isFail
        ? {
            errorMessage: errorMessageFacet(
              AIRFLOW_PRODUCER,
              rand([
                "botocore.exceptions.ClientError: An error occurred (AccessDenied) when calling the GetObject operation",
                "airflow.exceptions.AirflowException: EMR step failed: s-3K2J9X8L0P1Q2",
                "airflow.exceptions.AirflowSensorTimeout: Sensor has timed out",
              ]),
              "python"
            ),
          }
        : {}),
    },
    jobFacets: airflowJobFacets({
      jobType: "TASK",
      owner,
      ...(task.sql ? { sql: task.sql(dagId) } : {}),
    }),
    inputs: task.inputs(region, dagId),
    outputs: eventType === "START" ? [] : task.outputs(region, dagId),
  });
  return olEcsDoc(ev, { region, acct, cloudServiceName: "mwaa", startedAt });
}
