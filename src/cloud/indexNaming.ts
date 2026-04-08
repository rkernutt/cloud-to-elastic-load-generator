import type { CloudId } from "./types";

export function awsBulkIndexName(indexPrefix: string, dataset: string): string {
  const dsPrefix = dataset === "aws.xray" ? "traces-aws" : indexPrefix;
  return `${dsPrefix}.${dataset.replace(/^aws\./, "")}-default`;
}

export function awsDocDatasetIndex(indexPrefix: string, __dataset: string): string {
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
  const suffix = dataset.replace(/^(gcp|azure)\./, "");
  return `${indexPrefix}.${suffix}-default`;
}

/** Bulk index for Elastic `o365_metrics` data streams (package prefix is fixed by the integration). */
export function o365MetricsBulkIndex(dataset: string): string {
  const suffix = dataset.startsWith("o365_metrics.") ? dataset.slice("o365_metrics.".length) : dataset;
  return `metrics-o365_metrics.${suffix}-default`;
}

export function genericVendorDocDataset(
  indexPrefix: string,
  __dataset: string,
  vendor: CloudId
): string {
  if (vendor === "aws") return awsDocDatasetIndex(indexPrefix, __dataset);
  return `logs-${__dataset}-default`;
}
