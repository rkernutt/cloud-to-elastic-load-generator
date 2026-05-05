import type { CloudId } from "./types";

const VENDOR_DATASET_PREFIXES = ["aws.", "gcp.", "azure."] as const;

function isVendorDataset(dataset: string, vendor: CloudId): boolean {
  return dataset.startsWith(`${vendor}.`);
}

function isCrossCloudDataset(dataset: string): boolean {
  return !VENDOR_DATASET_PREFIXES.some((p) => dataset.startsWith(p));
}

export function awsBulkIndexName(indexPrefix: string, dataset: string): string {
  if (dataset === "aws.xray") return `traces-aws.xray-default`;
  if (isVendorDataset(dataset, "aws")) {
    return `${indexPrefix}.${dataset.slice("aws.".length)}-default`;
  }
  if (isCrossCloudDataset(dataset)) return `logs-${dataset}-default`;
  return `${indexPrefix}.${dataset}-default`;
}

export function awsDocDatasetIndex(indexPrefix: string, __dataset: string): string {
  if (__dataset === "apm") return "traces-apm-default";
  if (__dataset.startsWith("aws.")) {
    return awsBulkIndexName(indexPrefix, __dataset);
  }
  return `logs-${__dataset}-default`;
}

export function genericVendorBulkIndex(
  indexPrefix: string,
  dataset: string,
  vendor: CloudId
): string {
  if (vendor === "aws") return awsBulkIndexName(indexPrefix, dataset);
  if (isCrossCloudDataset(dataset)) return `logs-${dataset}-default`;
  const suffix = dataset.replace(/^(gcp|azure)\./, "");
  return `${indexPrefix}.${suffix}-default`;
}

/** Bulk index for Elastic `o365_metrics` data streams (package prefix is fixed by the integration). */
export function o365MetricsBulkIndex(dataset: string): string {
  const suffix = dataset.startsWith("o365_metrics.")
    ? dataset.slice("o365_metrics.".length)
    : dataset;
  return `metrics-o365_metrics.${suffix}-default`;
}

export function genericVendorDocDataset(
  indexPrefix: string,
  __dataset: string,
  vendor: CloudId
): string {
  if (__dataset === "apm") return "traces-apm-default";
  if (vendor === "aws") return awsDocDatasetIndex(indexPrefix, __dataset);
  return `logs-${__dataset}-default`;
}
