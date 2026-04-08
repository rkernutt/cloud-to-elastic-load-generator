/**
 * GCP database metric generators: Cloud SQL, Spanner, Bigtable.
 */

import { GCP_METRICS_DATASET_MAP } from "../../data/elasticMaps.js";
import {
  randInt,
  jitter,
  dp,
  stat,
  counter,
  gcpMetricDoc,
  pickGcpCloudContext,
} from "./helpers.js";
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
  const n = randInt(1, 3);
  return Array.from({ length: n }, (_, i) => {
    const database_id = SQL_IDS[i % SQL_IDS.length];
    const hot = Math.random() < er;
    return gcpMetricDoc(
      ts,
      "cloud-sql",
      dataset,
      region,
      project,
      { database_id },
      {
        cpu_utilization: stat(dp(hot ? jitter(92, 5, 80, 100) : jitter(38, 25, 5, 90))),
        memory_utilization: stat(dp(jitter(62, 18, 20, 95))),
        disk_utilization: stat(dp(jitter(55, 20, 15, 92))),
        connections: counter(randInt(5, 800)),
        queries: counter(randInt(1_000, 2_000_000)),
      }
    );
  });
}

export function generateCloudSpannerMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["cloud-spanner"]!;
  const n = randInt(1, 3);
  return Array.from({ length: n }, (_, i) => {
    const instance_id = SPANNER_INSTANCES[i % SPANNER_INSTANCES.length];
    const database = SPANNER_DBS[i % SPANNER_DBS.length];
    const slow = Math.random() < er;
    return gcpMetricDoc(
      ts,
      "cloud-spanner",
      dataset,
      region,
      project,
      { instance_id, database },
      {
        cpu_utilization: stat(dp(jitter(45, 30, 5, 98))),
        storage_used: counter(randInt(10_000_000_000, 8_000_000_000_000)),
        api_request_count: counter(randInt(5_000, 4_000_000)),
        api_request_latencies: stat(dp(jitter(slow ? 120 : 25, slow ? 80 : 18, 1, 5_000))),
      }
    );
  });
}

export function generateBigtableMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP.bigtable!;
  const n = randInt(1, 3);
  return Array.from({ length: n }, (_, i) => {
    const cluster = BT_CLUSTERS[i % BT_CLUSTERS.length];
    const table = BT_TABLES[i % BT_TABLES.length];
    const slow = Math.random() < er;
    return gcpMetricDoc(
      ts,
      "bigtable",
      dataset,
      region,
      project,
      { cluster, table },
      {
        server_latencies: stat(dp(jitter(slow ? 95 : 18, slow ? 60 : 12, 1, 2_000))),
        request_count: counter(randInt(10_000, 50_000_000)),
        storage_utilization: stat(dp(jitter(68, 15, 20, 95))),
      }
    );
  });
}
