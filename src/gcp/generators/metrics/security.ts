/**
 * GCP security metric generators: Security Command Center (sample metrics shape).
 */

import { randInt, counter, gcpMetricDoc, pickGcpCloudContext } from "./helpers.js";
import type { EcsDocument } from "../../../aws/generators/types.js";

const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const CATEGORIES = ["THREAT", "VULNERABILITY", "MISCONFIGURATION", "IAM"];

const SCC_METRICS_DATASET = "gcp.scc_metrics";

/** SCC is not in the GCP metrics supported service ID set; exported for reuse / demos. */
export function generateSccMetrics(ts: string, _er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = SCC_METRICS_DATASET;
  const n = Math.min(3, SEVERITIES.length);
  return Array.from({ length: n }, (_, i) => {
    const severity = SEVERITIES[i % SEVERITIES.length];
    const category = CATEGORIES[i % CATEGORIES.length];
    return gcpMetricDoc(
      ts,
      "security-command-center",
      dataset,
      region,
      project,
      { severity, category },
      {
        active_findings_count: counter(randInt(0, 5_000)),
        muted_findings_count: counter(randInt(0, 800)),
      }
    );
  });
}
