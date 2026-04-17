/**
 * GCP storage metric generators: Cloud Storage.
 */

import { GCP_METRICS_DATASET_MAP } from "../../data/elasticMaps.js";
import { randInt, gcpMetricDoc, pickGcpCloudContext, toInt64String } from "./helpers.js";
import { rand } from "../helpers.js";
import type { EcsDocument } from "../../../aws/generators/types.js";

const BUCKET_NAMES = ["assets-prod", "data-lake-raw", "backups", "ml-training-data"];

export function generateCloudStorageMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["cloud-storage"]!;
  const bucket_name = rand(BUCKET_NAMES);
  const isErr = Math.random() < er;
  const location = region;
  const res = { project_id: project.id, bucket_name, location };
  const method = isErr ? rand(["GET", "PUT", "DELETE"]) : "GET";
  const reqs = randInt(isErr ? 200 : 800, isErr ? 120_000 : 95_000);
  const errReqs = isErr ? randInt(2, 120) : 0;

  return [
    gcpMetricDoc(ts, "cloud-storage", dataset, region, project, {
      metricType: "storage.googleapis.com/api/request_count",
      resourceType: "gcs_bucket",
      resourceLabels: res,
      metricLabels: { method, response_code: isErr ? "403" : "200" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(reqs) },
    }),
    gcpMetricDoc(ts, "cloud-storage", dataset, region, project, {
      metricType: "storage.googleapis.com/storage/total_bytes",
      resourceType: "gcs_bucket",
      resourceLabels: res,
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: { doubleValue: randInt(120_000_000, 520_000_000_000) },
    }),
    gcpMetricDoc(ts, "cloud-storage", dataset, region, project, {
      metricType: "storage.googleapis.com/storage/object_count",
      resourceType: "gcs_bucket",
      resourceLabels: res,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(randInt(800, 9_500_000)) },
    }),
    gcpMetricDoc(ts, "cloud-storage", dataset, region, project, {
      metricType: "storage.googleapis.com/network/sent_bytes_count",
      resourceType: "gcs_bucket",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(randInt(0, isErr ? 8_000_000_000 : 5_000_000_000)) },
    }),
    gcpMetricDoc(ts, "cloud-storage", dataset, region, project, {
      metricType: "storage.googleapis.com/network/received_bytes_count",
      resourceType: "gcs_bucket",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(randInt(0, isErr ? 2_200_000_000 : 1_200_000_000)) },
    }),
    gcpMetricDoc(ts, "cloud-storage", dataset, region, project, {
      metricType: "storage.googleapis.com/api/request_count",
      resourceType: "gcs_bucket",
      resourceLabels: res,
      metricLabels: { method: "GET", response_code: "500" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(errReqs) },
    }),
  ];
}
