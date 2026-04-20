/**
 * GCP database metric generators: Cloud SQL, Spanner, Bigtable, Firestore, AlloyDB, Memorystore.
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

const FIRESTORE_DBS = ["(default)", "inventory-db", "sessions-db"];

export function generateFirestoreMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP.firestore!;
  const database_id = rand(FIRESTORE_DBS);
  const hot = Math.random() < er;
  const dbRes = {
    resource_container: project.id,
    location: region,
    database_id,
  };
  const readType = rand(["LOOKUP", "QUERY"]);
  const reads = randInt(hot ? 8_000 : 400, hot ? 2_800_000 : 1_200_000);
  const writes = randInt(hot ? 2_000 : 120, hot ? 420_000 : 180_000);
  const deletes = randInt(hot ? 200 : 10, hot ? 48_000 : 8_000);
  const conns = randInt(hot ? 2_200 : 40, hot ? 18_000 : 2_800);
  const listeners = randInt(hot ? 800 : 20, hot ? 12_000 : 2_400);
  const compositeIdx = randInt(12, hot ? 420 : 180);

  return [
    gcpMetricDoc(ts, "firestore", dataset, region, project, {
      metricType: "firestore.googleapis.com/document/read_count",
      resourceType: "firestore.googleapis.com/Database",
      resourceLabels: dbRes,
      metricLabels: { type: readType },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(reads) },
    }),
    gcpMetricDoc(ts, "firestore", dataset, region, project, {
      metricType: "firestore.googleapis.com/document/write_count",
      resourceType: "firestore.googleapis.com/Database",
      resourceLabels: dbRes,
      metricLabels: { op: rand(["CREATE", "UPDATE"]) },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(writes) },
    }),
    gcpMetricDoc(ts, "firestore", dataset, region, project, {
      metricType: "firestore.googleapis.com/document/delete_count",
      resourceType: "firestore.googleapis.com/Database",
      resourceLabels: dbRes,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(deletes) },
    }),
    gcpMetricDoc(ts, "firestore", dataset, region, project, {
      metricType: "firestore.googleapis.com/network/active_connections",
      resourceType: "firestore.googleapis.com/Database",
      resourceLabels: dbRes,
      metricLabels: { module: "default", version: "v1" },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(conns) },
    }),
    gcpMetricDoc(ts, "firestore", dataset, region, project, {
      metricType: "firestore.googleapis.com/network/snapshot_listeners",
      resourceType: "firestore.googleapis.com/Database",
      resourceLabels: dbRes,
      metricLabels: { module: "default", version: "v1" },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(listeners) },
    }),
    gcpMetricDoc(ts, "firestore", dataset, region, project, {
      metricType: "firestore.googleapis.com/composite_indexes_per_database",
      resourceType: "firestore.googleapis.com/Database",
      resourceLabels: dbRes,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(compositeIdx) },
    }),
  ];
}

const ALLOYDB_CLUSTERS = ["loyalty-primary", "orders-ha", "analytics-ro"];
const ALLOYDB_INSTANCES = ["primary-01", "primary-02", "readpool-01"];

export function generateAlloyDbMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP.alloydb!;
  const cluster_id = rand(ALLOYDB_CLUSTERS);
  const instance_id = rand(ALLOYDB_INSTANCES);
  const database = rand(["postgres", "app", "reporting"]);
  const stressed = Math.random() < er;
  const instRes = {
    resource_container: project.id,
    location: region,
    cluster_id,
    instance_id,
  };
  const clusterRes = { resource_container: project.id, location: region, cluster_id };
  const dbRes = {
    resource_container: project.id,
    location: region,
    cluster_id,
    instance_id,
    database,
  };
  const cpu = stressed ? jitter(88, 8, 55, 100) : jitter(38, 22, 4, 92);
  const conns = randInt(stressed ? 220 : 12, stressed ? 4_200 : 900);
  const qLatMs = stressed ? jitter(420, 220, 8, 9000) : jitter(28, 18, 1, 420);
  const distN = randInt(200, 6000);
  const iops = randInt(stressed ? 12_000 : 800, stressed ? 480_000 : 120_000);
  const storageBytes = randInt(8_000_000_000, stressed ? 42_000_000_000_000 : 18_000_000_000_000);
  const replLagMs = stressed ? randInt(800, 45_000) : randInt(4, 900);

  return [
    gcpMetricDoc(ts, "alloydb", dataset, region, project, {
      metricType: "alloydb.googleapis.com/instance/cpu/average_utilization",
      resourceType: "alloydb.googleapis.com/Instance",
      resourceLabels: instRes,
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: { doubleValue: dp(cpu) },
    }),
    gcpMetricDoc(ts, "alloydb", dataset, region, project, {
      metricType: "alloydb.googleapis.com/instance/postgres/total_connections",
      resourceType: "alloydb.googleapis.com/Instance",
      resourceLabels: instRes,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(conns) },
    }),
    gcpMetricDoc(ts, "alloydb", dataset, region, project, {
      metricType: "alloydb.googleapis.com/database/postgresql/query_latencies",
      resourceType: "alloydb.googleapis.com/Database",
      resourceLabels: dbRes,
      metricLabels: {
        user: "app_user",
        client_addr: "10.0.0.12",
        querystring: "SELECT ...",
        query_hash: "qh-8a2f",
      },
      metricKind: "DELTA",
      valueType: "DISTRIBUTION",
      point: distributionFromMs(qLatMs, distN, stressed),
    }),
    gcpMetricDoc(ts, "alloydb", dataset, region, project, {
      metricType: "alloydb.googleapis.com/instance/postgresql/blks_read",
      resourceType: "alloydb.googleapis.com/Instance",
      resourceLabels: instRes,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(iops) },
    }),
    gcpMetricDoc(ts, "alloydb", dataset, region, project, {
      metricType: "alloydb.googleapis.com/cluster/storage/usage",
      resourceType: "alloydb.googleapis.com/Cluster",
      resourceLabels: clusterRes,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(storageBytes) },
    }),
    gcpMetricDoc(ts, "alloydb", dataset, region, project, {
      metricType: "alloydb.googleapis.com/instance/postgres/replication/maximum_lag",
      resourceType: "alloydb.googleapis.com/Instance",
      resourceLabels: instRes,
      metricLabels: { replica_instance_id: `${instance_id}-replica` },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(replLagMs) },
    }),
  ];
}

const REDIS_INSTANCES = ["cache-sessions", "cache-rates", "cache-catalog"];

export function generateMemorystoreMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP.memorystore!;
  const instance_id = rand(REDIS_INSTANCES);
  const role = rand(["primary", "replica"]);
  const stressed = Math.random() < er;
  const res = {
    project_id: project.id,
    region,
    instance_id,
    node_id: "node-0",
  };
  const hitRatio = stressed ? jitter(0.72, 0.12, 0.35, 0.96) : jitter(0.91, 0.06, 0.62, 0.995);
  const clients = randInt(stressed ? 1_800 : 40, stressed ? 14_000 : 2_400);
  const memBytes = randInt(1_000_000_000, stressed ? 22_000_000_000 : 8_500_000_000);
  const evicted = randInt(stressed ? 800 : 0, stressed ? 180_000 : 12_000);
  const hits = randInt(40_000, stressed ? 8_000_000 : 5_000_000);
  const misses = randInt(stressed ? 2_200 : 200, stressed ? 900_000 : 120_000);

  return [
    gcpMetricDoc(ts, "memorystore", dataset, region, project, {
      metricType: "redis.googleapis.com/stats/cache_hit_ratio",
      resourceType: "redis_instance",
      resourceLabels: res,
      metricLabels: { role },
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: { doubleValue: dp(hitRatio) },
    }),
    gcpMetricDoc(ts, "memorystore", dataset, region, project, {
      metricType: "redis.googleapis.com/clients/connected",
      resourceType: "redis_instance",
      resourceLabels: res,
      metricLabels: { role },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(clients) },
    }),
    gcpMetricDoc(ts, "memorystore", dataset, region, project, {
      metricType: "redis.googleapis.com/stats/memory/usage",
      resourceType: "redis_instance",
      resourceLabels: res,
      metricLabels: { role },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(Math.round(memBytes)) },
    }),
    gcpMetricDoc(ts, "memorystore", dataset, region, project, {
      metricType: "redis.googleapis.com/stats/evicted_keys",
      resourceType: "redis_instance",
      resourceLabels: res,
      metricLabels: { role },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(evicted) },
    }),
    gcpMetricDoc(ts, "memorystore", dataset, region, project, {
      metricType: "redis.googleapis.com/stats/keyspace_hits",
      resourceType: "redis_instance",
      resourceLabels: res,
      metricLabels: { role },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(hits) },
    }),
    gcpMetricDoc(ts, "memorystore", dataset, region, project, {
      metricType: "redis.googleapis.com/stats/keyspace_misses",
      resourceType: "redis_instance",
      resourceLabels: res,
      metricLabels: { role },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(misses) },
    }),
  ];
}
