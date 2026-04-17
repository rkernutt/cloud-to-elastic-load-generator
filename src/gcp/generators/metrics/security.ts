/**
 * GCP security metric generators: Security Command Center (synthetic Monitoring shape).
 */

import { randInt, gcpMetricDoc, pickGcpCloudContext, toInt64String } from "./helpers.js";
import type { EcsDocument } from "../../../aws/generators/types.js";

const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const CATEGORIES = ["THREAT", "VULNERABILITY", "MISCONFIGURATION", "IAM"];

const SCC_METRICS_DATASET = "gcp.scc_metrics";

export function generateSccMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = SCC_METRICS_DATASET;
  const severity = SEVERITIES[randInt(0, SEVERITIES.length - 1)]!;
  const category = CATEGORIES[randInt(0, CATEGORIES.length - 1)]!;
  const noisy = Math.random() < er;
  const res = { project_id: project.id };
  const active = randInt(noisy ? 800 : 0, noisy ? 12_000 : 4200);
  const muted = randInt(0, noisy ? 2200 : 800);
  const ingested = randInt(2000, noisy ? 900_000 : 520_000);

  return [
    gcpMetricDoc(ts, "security-command-center", dataset, region, project, {
      metricType: "securitycenter.googleapis.com/sources/findings_count",
      resourceType: "project",
      resourceLabels: res,
      metricLabels: { severity, category, state: "ACTIVE" },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(active) },
    }),
    gcpMetricDoc(ts, "security-command-center", dataset, region, project, {
      metricType: "securitycenter.googleapis.com/sources/muted_findings_count",
      resourceType: "project",
      resourceLabels: res,
      metricLabels: { severity, category },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(muted) },
    }),
    gcpMetricDoc(ts, "security-command-center", dataset, region, project, {
      metricType: "logging.googleapis.com/log_entry_count",
      resourceType: "project",
      resourceLabels: res,
      metricLabels: { log: "security_center", severity: noisy ? "ERROR" : "INFO" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(ingested) },
    }),
  ];
}
