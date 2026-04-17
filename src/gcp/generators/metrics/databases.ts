/**
 * GCP database metric generators: Cloud SQL, Spanner, Bigtable.
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
import { rand } from "../helpers.js";
import type { EcsDocument } from "../../../aws/generators/types.js";

const SQL_IDS = [
  "globex-prod-a1b2c3:sql-primary",
  "globex-prod-a1b2c3:sql-replica",
  "globex-staging-d4e5f6:sql-1",
];
const SPANNER_INSTANCES = ["spanner-prod", "spanner-staging", "spanner-analytics"];
const SPANNER_DBS = ["inventory", "orders", "reporting"];
const BT_CLUSTERS = ["bt-events", "bt-sessions", "bt-telemetry"];
const BT_TABLES = ["events_raw", "sessions", "metrics_hourly"];

export function generateCloudSqlMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["cloud-sql"]!;
  const database_id = SQL_IDS[randInt(0, SQL_IDS.length - 1)];
  const hot = Math.random() < er;
  const res = { project_id: project.id, database_id, region };
  const cpu = hot ? jitter(0.91, 0.05, 0.78, 1) : jitter(0.39, 0.24, 0.05, 0.88);
  const rx = randInt(2_000_000, hot ? 180_000_000_000 : 120_000_000_000);
  const tx = randInt(1_500_000, hot ? 140_000_000_000 : 95_000_000_000);
  const conns = randInt(hot ? 120 : 8, hot ? 920 : 620);
  const qps = randInt(800, hot ? 2_200_000 : 1_600_000);
  const readOps = randInt(200, hot ? 180_000 : 120_000);

  return [
    gcpMetricDoc(ts, "cloud-sql", dataset, region, project, {
      metricType: "cloudsql.googleapis.com/database/cpu/utilization",
      resourceType: "cloudsql_database",
      resourceLabels: res,
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: { doubleValue: dp(cpu) },
    }),
    gcpMetricDoc(ts, "cloud-sql", dataset, region, project, {
      metricType: "cloudsql.googleapis.com/database/memory/utilization",
      resourceType: "cloudsql_database",
      resourceLabels: res,
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: { doubleValue: dp(jitter(0.62, 0.16, 0.18, 0.94)) },
    }),
    gcpMetricDoc(ts, "cloud-sql", dataset, region, project, {
      metricType: "cloudsql.googleapis.com/database/disk/utilization",
      resourceType: "cloudsql_database",
      resourceLabels: res,
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: { doubleValue: dp(jitter(hot ? 0.82 : 0.52, 0.18, 0.12, 0.93)) },
    }),
    gcpMetricDoc(ts, "cloud-sql", dataset, region, project, {
      metricType: "cloudsql.googleapis.com/database/network/received_bytes_count",
      resourceType: "cloudsql_database",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(rx) },
    }),
    gcpMetricDoc(ts, "cloud-sql", dataset, region, project, {
      metricType: "cloudsql.googleapis.com/database/network/sent_bytes_count",
      resourceType: "cloudsql_database",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(tx) },
    }),
    gcpMetricDoc(ts, "cloud-sql", dataset, region, project, {
      metricType: "cloudsql.googleapis.com/database/postgresql/num_backends",
      resourceType: "cloudsql_database",
      resourceLabels: res,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(conns) },
    }),
    gcpMetricDoc(ts, "cloud-sql", dataset, region, project, {
      metricType: "cloudsql.googleapis.com/database/mysql/queries",
      resourceType: "cloudsql_database",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(qps) },
    }),
    gcpMetricDoc(ts, "cloud-sql", dataset, region, project, {
      metricType: "cloudsql.googleapis.com/database/disk/read_ops_count",
      resourceType: "cloudsql_database",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(readOps) },
    }),
  ];
}

export function generateCloudSpannerMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["cloud-spanner"]!;
  const instance_id = SPANNER_INSTANCES[randInt(0, SPANNER_INSTANCES.length - 1)];
  const database = SPANNER_DBS[randInt(0, SPANNER_DBS.length - 1)];
  const slow = Math.random() < er;
  const instRes = { project_id: project.id, instance_id };
  const dbRes = { project_id: project.id, instance_id, database };
  const apiLatMs = slow ? jitter(140, 85, 2, 6000) : jitter(22, 14, 0.5, 220);
  const distN = randInt(300, 9000);

  return [
    gcpMetricDoc(ts, "cloud-spanner", dataset, region, project, {
      metricType: "spanner.googleapis.com/instance/cpu/utilization",
      resourceType: "spanner_instance",
      resourceLabels: instRes,
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: { doubleValue: dp(jitter(0.46, 0.28, 0.04, 0.98)) },
    }),
    gcpMetricDoc(ts, "cloud-spanner", dataset, region, project, {
      metricType: "spanner.googleapis.com/instance/storage/used_bytes",
      resourceType: "spanner_instance",
      resourceLabels: instRes,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(randInt(12_000_000_000, 7_200_000_000_000)) },
    }),
    gcpMetricDoc(ts, "cloud-spanner", dataset, region, project, {
      metricType: "spanner.googleapis.com/api/request_count",
      resourceType: "spanner_instance",
      resourceLabels: instRes,
      metricLabels: { method: "/google.spanner.v1.Spanner/ExecuteSql" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(randInt(5000, 3_800_000)) },
    }),
    gcpMetricDoc(ts, "cloud-spanner", dataset, region, project, {
      metricType: "spanner.googleapis.com/api/request_latencies",
      resourceType: "spanner_instance",
      resourceLabels: instRes,
      metricLabels: { method: "/google.spanner.v1.Spanner/Read" },
      metricKind: "DELTA",
      valueType: "DISTRIBUTION",
      point: distributionFromMs(apiLatMs, distN, slow),
    }),
    gcpMetricDoc(ts, "cloud-spanner", dataset, region, project, {
      metricType: "spanner.googleapis.com/instance/session_count",
      resourceType: "spanner_database",
      resourceLabels: dbRes,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(randInt(40, slow ? 4800 : 2200)) },
    }),
  ];
}

export function generateBigtableMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP.bigtable!;
  const instance = BT_CLUSTERS[randInt(0, BT_CLUSTERS.length - 1)];
  const cluster = `${instance}-c1`;
  const table = BT_TABLES[randInt(0, BT_TABLES.length - 1)];
  const zone = `${region}-${rand(["a", "b"])}`;
  const slow = Math.random() < er;
  const clusterRes = { project_id: project.id, instance, cluster, zone };
  const tableRes = { project_id: project.id, instance, cluster, table, zone };
  const latMs = slow ? jitter(95, 58, 1, 2500) : jitter(16, 10, 0.5, 120);
  const distN = randInt(500, 12000);

  return [
    gcpMetricDoc(ts, "bigtable", dataset, region, project, {
      metricType: "bigtable.googleapis.com/cluster/cpu_load",
      resourceType: "bigtable_cluster",
      resourceLabels: clusterRes,
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: { doubleValue: dp(jitter(slow ? 0.78 : 0.42, 0.18, 0.05, 0.98)) },
    }),
    gcpMetricDoc(ts, "bigtable", dataset, region, project, {
      metricType: "bigtable.googleapis.com/server/modified_rows_count",
      resourceType: "bigtable_table",
      resourceLabels: tableRes,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(randInt(2000, slow ? 48_000_000 : 32_000_000)) },
    }),
    gcpMetricDoc(ts, "bigtable", dataset, region, project, {
      metricType: "bigtable.googleapis.com/server/latencies",
      resourceType: "bigtable_table",
      resourceLabels: tableRes,
      metricKind: "DELTA",
      valueType: "DISTRIBUTION",
      point: distributionFromMs(latMs, distN, slow),
    }),
    gcpMetricDoc(ts, "bigtable", dataset, region, project, {
      metricType: "bigtable.googleapis.com/cluster/storage_utilization",
      resourceType: "bigtable_cluster",
      resourceLabels: clusterRes,
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: { doubleValue: dp(jitter(0.68, 0.14, 0.2, 0.94)) },
    }),
  ];
}
