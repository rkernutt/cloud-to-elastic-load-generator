/**
 * GCP storage metric generators: Cloud Storage.
 */

import { GCP_METRICS_DATASET_MAP } from "../../data/elasticMaps.js";
import { randInt, counter, gcpMetricDoc, pickGcpCloudContext } from "./helpers.js";
import { rand } from "../helpers.js";
import type { EcsDocument } from "../../../aws/generators/types.js";

const BUCKET_NAMES = ["assets-prod", "data-lake-raw", "backups", "ml-training-data"];

export function generateCloudStorageMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["cloud-storage"]!;
  const n = randInt(1, 3);
  return Array.from({ length: n }, () => {
    const bucket_name = rand(BUCKET_NAMES);
    const isErr = Math.random() < er;
    return gcpMetricDoc(
      ts,
      "cloud-storage",
      dataset,
      region,
      project,
      { bucket_name },
      {
        total_bytes: counter(randInt(100_000_000, 500_000_000_000)),
        object_count: counter(randInt(100, 10_000_000)),
        request_count: counter(randInt(0, 100_000)),
        network_sent_bytes: counter(randInt(0, 5_000_000_000)),
        received_bytes: counter(randInt(0, 1_000_000_000)),
        read_bytes: counter(randInt(0, 2_000_000_000)),
        write_bytes: counter(randInt(0, 500_000_000)),
        error_count: counter(isErr ? randInt(1, 50) : 0),
      }
    );
  });
}
