/**
 * GCP analytics metric generators: BigQuery, Dataproc.
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
import { randBigQueryDataset } from "../helpers.js";
import type { EcsDocument } from "../../../aws/generators/types.js";

const DATAPROC_CLUSTERS = ["analytics-spark", "etl-daily", "ml-preprocess", "batch-export"];

export function generateBigQueryMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP.bigquery!;
  const n = randInt(1, 3);
  return Array.from({ length: n }, () => {
    const project_id = project.id;
    const dataset_id = randBigQueryDataset();
    const slotPressure = Math.random() < er;
    return gcpMetricDoc(
      ts,
      "bigquery",
      dataset,
      region,
      project,
      { project_id, dataset_id },
      {
        slots_total: counter(randInt(100, 4000)),
        slots_available: counter(slotPressure ? randInt(0, 80) : randInt(200, 3500)),
        query_count: counter(randInt(500, 2_000_000)),
        stored_bytes: counter(randInt(500_000_000, 80_000_000_000_000)),
      }
    );
  });
}

export function generateDataprocMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP.dataproc!;
  const n = randInt(1, 3);
  return Array.from({ length: n }, (_, i) => {
    const cluster_name = DATAPROC_CLUSTERS[i % DATAPROC_CLUSTERS.length];
    const stressed = Math.random() < er;
    return gcpMetricDoc(
      ts,
      "dataproc",
      dataset,
      region,
      project,
      { cluster_name },
      {
        yarn_memory_available: stat(
          dp(jitter(stressed ? 2e9 : 12e9, stressed ? 1e9 : 4e9, 1e8, 20e9))
        ),
        yarn_vcores_available: stat(dp(jitter(stressed ? 4 : 48, stressed ? 3 : 16, 0, 512))),
        hdfs_capacity: counter(randInt(5_000_000_000_000, 500_000_000_000_000)),
      }
    );
  });
}
