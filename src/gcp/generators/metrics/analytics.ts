/**
 * GCP analytics metric generators: BigQuery, Dataproc, Cloud Composer.
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
