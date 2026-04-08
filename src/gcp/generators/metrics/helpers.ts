/**
 * Shared utilities for per-label GCP Cloud Monitoring metric document generation.
 * Each metric doc matches an Elastic GCP integration–style shape.
 */

export {
  GCP_REGIONS,
  GCP_PROJECTS,
  rand,
  randInt,
  randFloat,
  randId,
} from "../helpers.js";
import { rand, randId, GCP_REGIONS, randProject } from "../helpers.js";
import type { GcpProject } from "../helpers.js";
import type { EcsDocument } from "../../../aws/generators/types.js";

/**
 * Build a single GCP Monitoring metric document.
 *
 * @param ts       - ISO timestamp string
 * @param service  - metricset name / service key (e.g. "compute-engine")
 * @param dataset  - data_stream.dataset (e.g. "gcp.compute_metrics")
 * @param region   - GCP region
 * @param project  - GCP project
 * @param labels   - resource / metric label key/value pairs
 * @param metrics  - metric name → stat object (avg, sum, count, max, min)
 * @param period   - collection period ms (default 60 000)
 */
export function gcpMetricDoc(
  ts: string,
  service: string,
  dataset: string,
  region: string,
  project: GcpProject,
  labels: Record<string, unknown>,
  metrics: Record<string, unknown>,
  period = 60_000
): EcsDocument {
  return {
    "@timestamp": ts,
    ecs: { version: "8.11.0" },
    cloud: {
      provider: "gcp",
      region,
      project: { id: project.id, name: project.name },
      account: { id: project.number, name: project.name },
    },
    agent: {
      type: "metricbeat",
      version: "8.18.0",
      name: `metricbeat-gcp-${region}`,
      ephemeral_id: randId(36).toLowerCase(),
    },
    gcp: {
      [service]: {
        metrics,
        labels,
      },
    },
    metricset: { name: service, period },
    data_stream: { type: "metrics", dataset, namespace: "default" },
    input: { type: "gcp-monitoring" },
    event: { dataset, module: "gcp" },
  };
}

/** Pick n unique items from arr (or all if n >= arr.length). */
export function sample<T>(arr: T[], n: number): T[] {
  const copy = [...arr].sort(() => Math.random() - 0.5);
  return copy.slice(0, Math.min(n, copy.length));
}

/** Gaussian-ish float: center ± spread, clamped to [min, max]. */
export function jitter(center: number, spread: number, min = 0, max = Infinity): number {
  const v = center + (Math.random() - 0.5) * 2 * spread;
  return Math.max(min, Math.min(max, v));
}

/** Round to dp decimal places. */
export function dp(v: number, places = 2): number {
  return parseFloat(v.toFixed(places));
}

/** Metric stat object with avg, sum, count (and optional max/min). */
export function stat(
  avg: number,
  { sum, count = 1, max, min }: { sum?: number; count?: number; max?: number; min?: number } = {}
): Record<string, number> {
  const s: Record<string, number> = { avg: dp(avg), sum: dp(sum ?? avg), count };
  if (max !== undefined) s.max = dp(max);
  if (min !== undefined) s.min = dp(min);
  return s;
}

/** Simple counter stat (avg = sum = value, count = 1). */
export function counter(value: number): Record<string, number> {
  return stat(value, { sum: value });
}

/** Pick a random region+project pair (same for all docs in one generator call). */
export function pickGcpCloudContext(): { region: string; project: GcpProject } {
  return { region: rand(GCP_REGIONS), project: randProject() };
}
