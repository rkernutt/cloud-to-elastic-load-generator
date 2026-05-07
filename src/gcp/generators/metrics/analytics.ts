/**
 * GCP analytics & data/ML API metric generators: BigQuery, Dataproc, Composer,
 * Data Catalog, Data Fusion, DMS, Dataplex, Dataprep, Datastream, Analytics Hub,
 * Looker, and Cloud AI API surfaces (Language, Speech, Translate, Vision, Video,
 * Retail, Document AI, Healthcare, Dialogflow, Contact Center AI).
 */

import { GCP_METRICS_DATASET_MAP } from "../../data/elasticMaps.js";
import {
  randInt,
  jitter,
  dp,
  gcpMetricDoc,
  pickGcpCloudContext,
  toInt64String,
  distributionFromMs,
} from "./helpers.js";
import { rand, randBigQueryDataset } from "../helpers.js";
import type { EcsDocument } from "../../../aws/generators/types.js";

const DATAPROC_CLUSTERS = ["analytics-spark", "etl-daily", "ml-preprocess", "batch-export"];

export function generateBigQueryMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP.bigquery!;
  const project_id = project.id;
  const dataset_id = randBigQueryDataset();
  const slotPressure = Math.random() < er;
  const projRes = { project_id };
  const dsRes = { project_id, dataset_id };
  const scanned = randInt(2_000_000_000, slotPressure ? 420_000_000_000_000 : 180_000_000_000_000);
  const qCount = randInt(600, slotPressure ? 2_400_000 : 1_800_000);
  const slotsAlloc = randInt(slotPressure ? 2800 : 120, slotPressure ? 4000 : 3600);
  const slotsAvail = randInt(slotPressure ? 0 : 400, slotPressure ? 120 : 3400);
  const stored = randInt(900_000_000_000, 78_000_000_000_000_000);
  const billed = randInt(500_000_000, slotPressure ? 48_000_000_000_000 : 28_000_000_000_000);
  const tableCount = randInt(40, slotPressure ? 120_000 : 85_000);

  return [
    gcpMetricDoc(ts, "bigquery", dataset, region, project, {
      metricType: "bigquery.googleapis.com/query/scanned_bytes",
      resourceType: "bigquery_project",
      resourceLabels: projRes,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(scanned) },
    }),
    gcpMetricDoc(ts, "bigquery", dataset, region, project, {
      metricType: "bigquery.googleapis.com/query/count",
      resourceType: "bigquery_project",
      resourceLabels: projRes,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(qCount) },
    }),
    gcpMetricDoc(ts, "bigquery", dataset, region, project, {
      metricType: "bigquery.googleapis.com/slots/allocated",
      resourceType: "bigquery_project",
      resourceLabels: projRes,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(slotsAlloc) },
    }),
    gcpMetricDoc(ts, "bigquery", dataset, region, project, {
      metricType: "bigquery.googleapis.com/slots/available",
      resourceType: "bigquery_project",
      resourceLabels: projRes,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(slotsAvail) },
    }),
    gcpMetricDoc(ts, "bigquery", dataset, region, project, {
      metricType: "bigquery.googleapis.com/storage/stored_bytes",
      resourceType: "bigquery_dataset",
      resourceLabels: dsRes,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(stored) },
    }),
    gcpMetricDoc(ts, "bigquery", dataset, region, project, {
      metricType: "bigquery.googleapis.com/query/billed_bytes",
      resourceType: "bigquery_project",
      resourceLabels: projRes,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(billed) },
    }),
    gcpMetricDoc(ts, "bigquery", dataset, region, project, {
      metricType: "bigquery.googleapis.com/storage/table_count",
      resourceType: "bigquery_dataset",
      resourceLabels: dsRes,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(tableCount) },
    }),
  ];
}

export function generateDataprocMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP.dataproc!;
  const cluster_name = DATAPROC_CLUSTERS[randInt(0, DATAPROC_CLUSTERS.length - 1)]!;
  const cluster_uuid = `${cluster_name}-${randInt(1000, 9999)}`;
  const stressed = Math.random() < er;
  const res = { project_id: project.id, cluster_name, cluster_uuid, region };
  const yarnMem = jitter(stressed ? 2.2e9 : 11e9, stressed ? 1.1e9 : 3.8e9, 1e8, 22e9);
  const yarnCores = jitter(stressed ? 5.5 : 46, stressed ? 3.2 : 14, 0, 512);
  const hdfsCap = randInt(8_000_000_000_000, stressed ? 480_000_000_000_000 : 420_000_000_000_000);
  const running = randInt(stressed ? 2 : 8, stressed ? 180 : 220);

  return [
    gcpMetricDoc(ts, "dataproc", dataset, region, project, {
      metricType: "dataproc.googleapis.com/cluster/yarn/available_memory",
      resourceType: "cloud_dataproc_cluster",
      resourceLabels: res,
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: { doubleValue: dp(yarnMem) },
    }),
    gcpMetricDoc(ts, "dataproc", dataset, region, project, {
      metricType: "dataproc.googleapis.com/cluster/yarn/nodes/running",
      resourceType: "cloud_dataproc_cluster",
      resourceLabels: res,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(running) },
    }),
    gcpMetricDoc(ts, "dataproc", dataset, region, project, {
      metricType: "dataproc.googleapis.com/cluster/yarn/vcores",
      resourceType: "cloud_dataproc_cluster",
      resourceLabels: res,
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: { doubleValue: dp(yarnCores) },
    }),
    gcpMetricDoc(ts, "dataproc", dataset, region, project, {
      metricType: "dataproc.googleapis.com/cluster/hdfs/dfs_capacity",
      resourceType: "cloud_dataproc_cluster",
      resourceLabels: res,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(hdfsCap) },
    }),
  ];
}

const COMPOSER_ENVS = ["airflow-prod", "etl-composer-1", "analytics-composer"];
const COMPOSER_DAGS = ["daily_curate", "ingest_raw", "export_mart", "ml_features"];

export function generateComposerMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP.composer!;
  const environment_name = rand(COMPOSER_ENVS);
  const workflow_name = rand(COMPOSER_DAGS);
  const image_version = rand(["composer-3-airflow-2.7", "composer-2-airflow-2.5"]);
  const envRes = {
    project_id: project.id,
    location: region,
    environment_name,
  };
  const wfRes = {
    project_id: project.id,
    location: region,
    workflow_name,
  };
  const fail = Math.random() < er;
  const dagRuns = randInt(fail ? 40 : 120, fail ? 2_400 : 900);
  const taskDurMs = fail
    ? jitter(420_000, 180_000, 12_000, 3_600_000)
    : jitter(95_000, 42_000, 2000, 900_000);
  const dagProcMs = fail
    ? jitter(520_000, 200_000, 60_000, 3_600_000)
    : jitter(90_000, 45_000, 5000, 900_000);
  const distN = randInt(30, 400);
  const heartbeats = randInt(fail ? 400 : 2_000, fail ? 9_000 : 28_000);
  const workers = randInt(fail ? 2 : 3, fail ? 14 : 22);

  return [
    gcpMetricDoc(ts, "composer", dataset, region, project, {
      metricType: "composer.googleapis.com/workflow/run_count",
      resourceType: "cloud_composer_workflow",
      resourceLabels: wfRes,
      metricLabels: { state: fail ? "failed" : "success", image_version },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(dagRuns) },
    }),
    gcpMetricDoc(ts, "composer", dataset, region, project, {
      metricType: "composer.googleapis.com/workflow/task_instance/run_duration",
      resourceType: "cloud_composer_workflow",
      resourceLabels: wfRes,
      metricLabels: {
        state: fail ? "failed" : "success",
        image_version,
        task_id: `task_${randInt(1, 80)}`,
      },
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: { doubleValue: dp(taskDurMs) },
    }),
    gcpMetricDoc(ts, "composer", dataset, region, project, {
      metricType: "composer.googleapis.com/environment/dag_processing_duration",
      resourceType: "cloud_composer_environment",
      resourceLabels: envRes,
      metricLabels: { image_version },
      metricKind: "DELTA",
      valueType: "DISTRIBUTION",
      point: distributionFromMs(dagProcMs, distN, fail),
    }),
    gcpMetricDoc(ts, "composer", dataset, region, project, {
      metricType: "composer.googleapis.com/environment/scheduler_heartbeat_count",
      resourceType: "cloud_composer_environment",
      resourceLabels: envRes,
      metricLabels: { image_version },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(heartbeats) },
    }),
    gcpMetricDoc(ts, "composer", dataset, region, project, {
      metricType: "composer.googleapis.com/environment/num_celery_workers",
      resourceType: "cloud_composer_environment",
      resourceLabels: envRes,
      metricLabels: { image_version },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(workers) },
    }),
  ];
}

function unitScoreDistribution(meanScore: number, count: number, stressed: boolean) {
  const c = Math.max(1, Math.round(count));
  const mean = Math.max(0.01, Math.min(0.99, meanScore));
  const spread = stressed ? 0.22 : 0.12;
  return {
    distributionValue: {
      count: String(c),
      mean,
      sumOfSquaredDeviation: dp(spread * spread * c * 0.25),
      bucketCounts: [
        "0",
        toInt64String(c * (stressed ? 0.35 : 0.15)),
        toInt64String(c * 0.4),
        toInt64String(c * 0.2),
        toInt64String(c * 0.05),
      ],
    },
  };
}

export function generateDataCatalogMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["data-catalog"]!;
  const entry_group = rand(["prod-metadata", "analytics-glossary", "compliance-tags"]);
  const stressed = Math.random() < er;
  const reqs = randInt(200, stressed ? 420_000 : 190_000);
  const entries = randInt(800, stressed ? 2_800_000 : 1_400_000);
  return [
    gcpMetricDoc(ts, "data-catalog", dataset, region, project, {
      metricType: "datacatalog.googleapis.com/api/request_count",
      resourceType: "project",
      resourceLabels: { project_id: project.id },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(reqs) },
    }),
    gcpMetricDoc(ts, "data-catalog", dataset, region, project, {
      metricType: "datacatalog.googleapis.com/entry_count",
      resourceType: "datacatalog.googleapis.com/EntryGroup",
      resourceLabels: {
        resource_container: project.id,
        location: region,
        entry_group: `projects/${project.id}/locations/${region}/entryGroups/${entry_group}`,
      },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(entries) },
    }),
  ];
}

export function generateDataFusionMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["data-fusion"]!;
  const instance_id = rand(["df-globex-prod", "df-etl-staging", "df-analytics"]);
  const pipeline = rand(["daily-curated", "ingest-raw", "ml-features"]);
  const stressed = Math.random() < er;
  const res = {
    resource_container: project.id,
    location: region,
    instance_id,
  };
  const runs = randInt(40, stressed ? 12_000 : 6_200);
  const runMs = stressed
    ? jitter(480_000, 220_000, 60_000, 3_600_000)
    : jitter(95_000, 48_000, 8000, 900_000);
  const distN = randInt(25, 380);
  return [
    gcpMetricDoc(ts, "data-fusion", dataset, region, project, {
      metricType: "datafusion.googleapis.com/pipeline/execution_count",
      resourceType: "datafusion.googleapis.com/Instance",
      resourceLabels: res,
      metricLabels: { pipeline_name: pipeline },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(runs) },
    }),
    gcpMetricDoc(ts, "data-fusion", dataset, region, project, {
      metricType: "datafusion.googleapis.com/pipeline/run_duration",
      resourceType: "datafusion.googleapis.com/Instance",
      resourceLabels: res,
      metricLabels: { pipeline_name: pipeline },
      metricKind: "DELTA",
      valueType: "DISTRIBUTION",
      point: distributionFromMs(runMs, distN, stressed),
    }),
  ];
}

export function generateDatabaseMigrationMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["database-migration"]!;
  const migration_job_id = rand(["job-mysql-pg-01", "job-oracle-bq-02", "job-sqlserver-csql-03"]);
  const stressed = Math.random() < er;
  const res = {
    resource_container: project.id,
    location: region,
    migration_job_id,
  };
  const jobs = randInt(1, stressed ? 42 : 18);
  const lagSeconds = stressed ? jitter(420, 280, 2, 7200) : jitter(8.5, 6.2, 0.1, 120);
  return [
    gcpMetricDoc(ts, "database-migration", dataset, region, project, {
      metricType: "datamigration.googleapis.com/migration_job_count",
      resourceType: "datamigration.googleapis.com/MigrationJob",
      resourceLabels: res,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(jobs) },
    }),
    gcpMetricDoc(ts, "database-migration", dataset, region, project, {
      metricType: "datamigration.googleapis.com/replication_lag",
      resourceType: "datamigration.googleapis.com/MigrationJob",
      resourceLabels: res,
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: { doubleValue: dp(lagSeconds) },
    }),
  ];
}

export function generateDataplexMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP.dataplex!;
  const lake_id = rand(["lake-sales", "lake-operations", "lake-security"]);
  const task_id = rand(["profile-daily", "quality-scan", "lineage-export"]);
  const stressed = Math.random() < er;
  const res = {
    resource_container: project.id,
    location: region,
    lake_id,
    task_id,
  };
  const execs = randInt(12, stressed ? 8_800 : 4_200);
  const score = stressed ? 0.58 : 0.88;
  const distN = randInt(40, 600);
  return [
    gcpMetricDoc(ts, "dataplex", dataset, region, project, {
      metricType: "dataplex.googleapis.com/task/execution_count",
      resourceType: "dataplex.googleapis.com/Task",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(execs) },
    }),
    gcpMetricDoc(ts, "dataplex", dataset, region, project, {
      metricType: "dataplex.googleapis.com/task/data_quality_score",
      resourceType: "dataplex.googleapis.com/Task",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "DISTRIBUTION",
      point: unitScoreDistribution(score, distN, stressed),
    }),
  ];
}

export function generateDataprepMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP.dataprep!;
  const job_id = rand(["job-curate-01", "job-standardize", "job-pii-mask"]);
  const stressed = Math.random() < er;
  const res = {
    resource_container: project.id,
    location: region,
    job_name: job_id,
  };
  const runs = randInt(30, stressed ? 6_200 : 3_400);
  const rows = randInt(200_000, stressed ? 920_000_000_000 : 410_000_000_000);
  return [
    gcpMetricDoc(ts, "dataprep", dataset, region, project, {
      metricType: "dataprep.googleapis.com/job/execution_count",
      resourceType: "dataprep.googleapis.com/Job",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(runs) },
    }),
    gcpMetricDoc(ts, "dataprep", dataset, region, project, {
      metricType: "dataprep.googleapis.com/job/rows_processed",
      resourceType: "dataprep.googleapis.com/Job",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(rows) },
    }),
  ];
}

export function generateDatastreamMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP.datastream!;
  const stream_id = rand(["stream-oltp-bq", "stream-pg-gcs", "stream-mysql-csql"]);
  const stressed = Math.random() < er;
  const res = {
    resource_container: project.id,
    location: region,
    stream_id,
  };
  const freshness = stressed ? jitter(85, 45, 1.2, 900) : jitter(4.2, 2.8, 0.05, 45);
  const events = randInt(8_000, stressed ? 48_000_000 : 22_000_000);
  return [
    gcpMetricDoc(ts, "datastream", dataset, region, project, {
      metricType: "datastream.googleapis.com/stream/freshness_age",
      resourceType: "datastream.googleapis.com/Stream",
      resourceLabels: res,
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: { doubleValue: dp(freshness) },
    }),
    gcpMetricDoc(ts, "datastream", dataset, region, project, {
      metricType: "datastream.googleapis.com/stream/events_forwarded",
      resourceType: "datastream.googleapis.com/Stream",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(events) },
    }),
  ];
}

export function generateAnalyticsHubMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["analytics-hub"]!;
  const listing_id = rand(["listing-sales-curated", "listing-pci-summary", "listing-partner-feed"]);
  const data_exchange_id = rand(["globex_exchange", "partner_analytics", "internal_marts"]);
  const stressed = Math.random() < er;
  const subs = randInt(stressed ? 2 : 24, stressed ? 420 : 8200);
  return [
    gcpMetricDoc(ts, "analytics-hub", dataset, region, project, {
      metricType: "analyticshub.googleapis.com/listing/subscription_count",
      resourceType: "analyticshub.googleapis.com/Listing",
      resourceLabels: {
        resource_container: project.id,
        location: region,
        listing_id,
        data_exchange_id,
      },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(subs) },
    }),
  ];
}

export function generateLookerMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP.looker!;
  const instance_id = rand(["globex-bi", "finance-embed", "partner-analytics"]);
  const stressed = Math.random() < er;
  const res = {
    resource_container: project.id,
    location: region,
    instance_id,
  };
  const queries = randInt(400, stressed ? 2_200_000 : 1_100_000);
  const users = randInt(stressed ? 4 : 120, stressed ? 420 : 2800);
  return [
    gcpMetricDoc(ts, "looker", dataset, region, project, {
      metricType: "looker.googleapis.com/instance/query_count",
      resourceType: "looker.googleapis.com/Instance",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(queries) },
    }),
    gcpMetricDoc(ts, "looker", dataset, region, project, {
      metricType: "looker.googleapis.com/instance/active_users",
      resourceType: "looker.googleapis.com/Instance",
      resourceLabels: res,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(users) },
    }),
  ];
}

export function generateNaturalLanguageMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["natural-language"]!;
  const stressed = Math.random() < er;
  const proj = { project_id: project.id };
  const sentimentReq = randInt(80, stressed ? 620_000 : 340_000);
  const totalReq = randInt(sentimentReq + 200, stressed ? 1_800_000 : 980_000);
  return [
    gcpMetricDoc(ts, "natural-language", dataset, region, project, {
      metricType: "language.googleapis.com/api/request_count",
      resourceType: "project",
      resourceLabels: proj,
      metricLabels: { feature: "sentiment", response_code: stressed ? "INVALID_ARGUMENT" : "OK" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(sentimentReq) },
    }),
    gcpMetricDoc(ts, "natural-language", dataset, region, project, {
      metricType: "language.googleapis.com/api/request_count",
      resourceType: "project",
      resourceLabels: proj,
      metricLabels: { feature: "all", response_code: stressed ? "DEADLINE_EXCEEDED" : "OK" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(totalReq) },
    }),
  ];
}

export function generateSpeechToTextMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["speech-to-text"]!;
  const model = rand(["latest_long", "phone_call", "latest_short"]);
  const stressed = Math.random() < er;
  const proj = { project_id: project.id };
  const recog = randInt(120, stressed ? 480_000 : 260_000);
  const audioSec = randInt(800, stressed ? 220_000_000 : 120_000_000);
  return [
    gcpMetricDoc(ts, "speech-to-text", dataset, region, project, {
      metricType: "speech.googleapis.com/recognition_count",
      resourceType: "project",
      resourceLabels: proj,
      metricLabels: { model },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(recog) },
    }),
    gcpMetricDoc(ts, "speech-to-text", dataset, region, project, {
      metricType: "speech.googleapis.com/audio_duration",
      resourceType: "project",
      resourceLabels: proj,
      metricLabels: { model },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(audioSec) },
    }),
  ];
}

export function generateTextToSpeechMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["text-to-speech"]!;
  const voice = rand(["en-US-Wavenet-D", "en-GB-Neural2-A"]);
  const stressed = Math.random() < er;
  const proj = { project_id: project.id };
  const synth = randInt(200, stressed ? 620_000 : 340_000);
  const chars = randInt(4_000, stressed ? 180_000_000 : 96_000_000);
  return [
    gcpMetricDoc(ts, "text-to-speech", dataset, region, project, {
      metricType: "texttospeech.googleapis.com/synthesis_count",
      resourceType: "project",
      resourceLabels: proj,
      metricLabels: { voice_type: voice },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(synth) },
    }),
    gcpMetricDoc(ts, "text-to-speech", dataset, region, project, {
      metricType: "texttospeech.googleapis.com/character_count",
      resourceType: "project",
      resourceLabels: proj,
      metricLabels: { voice_type: voice },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(chars) },
    }),
  ];
}

export function generateTranslationMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP.translation!;
  const stressed = Math.random() < er;
  const proj = { project_id: project.id };
  const translations = randInt(400, stressed ? 920_000 : 510_000);
  const chars = randInt(8_000, stressed ? 240_000_000 : 130_000_000);
  return [
    gcpMetricDoc(ts, "translation", dataset, region, project, {
      metricType: "translate.googleapis.com/translation_count",
      resourceType: "project",
      resourceLabels: proj,
      metricLabels: { target_language: rand(["es", "fr", "de", "ja"]) },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(translations) },
    }),
    gcpMetricDoc(ts, "translation", dataset, region, project, {
      metricType: "translate.googleapis.com/character_count",
      resourceType: "project",
      resourceLabels: proj,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(chars) },
    }),
  ];
}

export function generateVideoIntelligenceMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["video-intelligence"]!;
  const feature = rand(["LABEL_DETECTION", "SHOT_CHANGE_DETECTION", "EXPLICIT_CONTENT_DETECTION"]);
  const stressed = Math.random() < er;
  const proj = { project_id: project.id };
  const annot = randInt(40, stressed ? 180_000 : 95_000);
  return [
    gcpMetricDoc(ts, "video-intelligence", dataset, region, project, {
      metricType: "videointelligence.googleapis.com/annotation_count",
      resourceType: "project",
      resourceLabels: proj,
      metricLabels: { feature },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(annot) },
    }),
  ];
}

export function generateVisionAiMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["vision-ai"]!;
  const feature = rand(["LABEL_DETECTION", "TEXT_DETECTION", "FACE_DETECTION"]);
  const stressed = Math.random() < er;
  const proj = { project_id: project.id };
  const annot = randInt(200, stressed ? 520_000 : 280_000);
  const reqs = randInt(annot + 50, stressed ? 680_000 : 360_000);
  return [
    gcpMetricDoc(ts, "vision-ai", dataset, region, project, {
      metricType: "vision.googleapis.com/annotation_count",
      resourceType: "project",
      resourceLabels: proj,
      metricLabels: { feature },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(annot) },
    }),
    gcpMetricDoc(ts, "vision-ai", dataset, region, project, {
      metricType: "vision.googleapis.com/request_count",
      resourceType: "project",
      resourceLabels: proj,
      metricLabels: { feature, response_code: stressed ? "RESOURCE_EXHAUSTED" : "OK" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(reqs) },
    }),
  ];
}

export function generateRecommendationsAiMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["recommendations-ai"]!;
  const catalog_id = rand(["globex-web", "globex-mobile", "partner-reco"]);
  const stressed = Math.random() < er;
  const res = {
    resource_container: project.id,
    location: "global",
    catalog_id,
  };
  const preds = randInt(400, stressed ? 4_200_000 : 2_200_000);
  const ctr = stressed ? jitter(0.012, 0.008, 0.001, 0.06) : jitter(0.048, 0.022, 0.008, 0.14);
  return [
    gcpMetricDoc(ts, "recommendations-ai", dataset, region, project, {
      metricType: "retail.googleapis.com/prediction_count",
      resourceType: "retail.googleapis.com/Catalog",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(preds) },
    }),
    gcpMetricDoc(ts, "recommendations-ai", dataset, region, project, {
      metricType: "retail.googleapis.com/recommendation_click_through",
      resourceType: "retail.googleapis.com/Catalog",
      resourceLabels: res,
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: { doubleValue: dp(ctr) },
    }),
  ];
}

export function generateRetailApiMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["retail-api"]!;
  const catalog_id = rand(["globex-primary", "outlet-seasonal", "b2b-catalog"]);
  const stressed = Math.random() < er;
  const res = {
    resource_container: project.id,
    location: "global",
    catalog_id,
  };
  const searches = randInt(800, stressed ? 8_800_000 : 4_800_000);
  const events = randInt(2_000, stressed ? 22_000_000 : 12_000_000);
  return [
    gcpMetricDoc(ts, "retail-api", dataset, region, project, {
      metricType: "retail.googleapis.com/search_count",
      resourceType: "retail.googleapis.com/Catalog",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(searches) },
    }),
    gcpMetricDoc(ts, "retail-api", dataset, region, project, {
      metricType: "retail.googleapis.com/product_event_count",
      resourceType: "retail.googleapis.com/Catalog",
      resourceLabels: res,
      metricLabels: { event_type: rand(["detail-page-view", "add-to-cart", "purchase-complete"]) },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(events) },
    }),
  ];
}

export function generateDocumentAiMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["document-ai"]!;
  const processor_id = rand(["invoice-parser", "id-proofing", "form-extraction"]);
  const stressed = Math.random() < er;
  const res = {
    resource_container: project.id,
    location: region,
    processor_id,
  };
  const reqs = randInt(60, stressed ? 420_000 : 220_000);
  const pages = randInt(200, stressed ? 1_800_000 : 960_000);
  return [
    gcpMetricDoc(ts, "document-ai", dataset, region, project, {
      metricType: "documentai.googleapis.com/processor/request_count",
      resourceType: "documentai.googleapis.com/Processor",
      resourceLabels: res,
      metricLabels: { response_code: stressed ? "INVALID_ARGUMENT" : "OK" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(reqs) },
    }),
    gcpMetricDoc(ts, "document-ai", dataset, region, project, {
      metricType: "documentai.googleapis.com/processor/page_count",
      resourceType: "documentai.googleapis.com/Processor",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(pages) },
    }),
  ];
}

export function generateHealthcareApiMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["healthcare-api"]!;
  const dataset_id = rand(["dataset-clinical-prod", "dataset-research", "dataset-claims"]);
  const stressed = Math.random() < er;
  const res = {
    resource_container: project.id,
    location: region,
    dataset_id,
  };
  const reqs = randInt(120, stressed ? 680_000 : 360_000);
  const resources = randInt(400, stressed ? 2_200_000 : 1_100_000);
  return [
    gcpMetricDoc(ts, "healthcare-api", dataset, region, project, {
      metricType: "healthcare.googleapis.com/store/request_count",
      resourceType: "healthcare.googleapis.com/Dataset",
      resourceLabels: res,
      metricLabels: { store_type: rand(["fhir", "dicom", "hl7v2"]) },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(reqs) },
    }),
    gcpMetricDoc(ts, "healthcare-api", dataset, region, project, {
      metricType: "healthcare.googleapis.com/store/resource_count",
      resourceType: "healthcare.googleapis.com/Dataset",
      resourceLabels: res,
      metricLabels: { store_type: "fhir" },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(resources) },
    }),
  ];
}

export function generateDialogflowMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP.dialogflow!;
  const agent_id = rand(["agent-support-bot", "agent-booking", "agent-status"]);
  const stressed = Math.random() < er;
  const res = {
    resource_container: project.id,
    location: region,
    agent_id,
  };
  const intents = randInt(400, stressed ? 2_800_000 : 1_500_000);
  const sessions = randInt(80, stressed ? 420_000 : 220_000);
  return [
    gcpMetricDoc(ts, "dialogflow", dataset, region, project, {
      metricType: "dialogflow.googleapis.com/agent/intent_detection_count",
      resourceType: "dialogflow.googleapis.com/Agent",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(intents) },
    }),
    gcpMetricDoc(ts, "dialogflow", dataset, region, project, {
      metricType: "dialogflow.googleapis.com/agent/session_count",
      resourceType: "dialogflow.googleapis.com/Agent",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(sessions) },
    }),
  ];
}

export function generateContactCenterAiMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["contact-center-ai"]!;
  const conversation_model = rand(["model-quality-prod", "model-sales-coach", "model-compliance"]);
  const stressed = Math.random() < er;
  const res = {
    resource_container: project.id,
    location: region,
    conversation_model_id: conversation_model,
  };
  const analyses = randInt(20, stressed ? 280_000 : 150_000);
  return [
    gcpMetricDoc(ts, "contact-center-ai", dataset, region, project, {
      metricType: "contactcenteraiinsights.googleapis.com/conversation/analysis_count",
      resourceType: "contactcenteraiinsights.googleapis.com/ConversationModel",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(analyses) },
    }),
  ];
}
