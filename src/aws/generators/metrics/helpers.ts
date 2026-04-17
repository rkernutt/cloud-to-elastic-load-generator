/**
 * Shared utilities for per-dimension CloudWatch metric document generation.
 * Each metric doc matches the shape produced by the Elastic AWS integration.
 */

export { REGIONS, ACCOUNTS, rand, randInt, randFloat, randId } from "../../../helpers";
import { rand, randId } from "../../../helpers";

/**
 * Build a single CloudWatch metric document.
 *
 * The document shape matches the Elastic AWS integration (Metricbeat/CloudWatch input).
 * The enrichment layer (`enrich.ts`) will patch agent/input/telemetry fields based on
 * the user's selected ingestion source, so generators should use the default CloudWatch
 * shape and let enrichment handle the rest.
 *
 * @param ts         - ISO timestamp string
 * @param service    - metricset name / AWS service key (e.g. "lambda")
 * @param dataset    - data_stream.dataset  (e.g. "aws.lambda")
 * @param region     - AWS region
 * @param account    - { id, name }
 * @param dimensions - CloudWatch dimension key/value pairs
 * @param metrics    - metric name → { avg, sum, count, max, min } (omit unused stats)
 * @param period     - collection period ms (default 60 000)
 */
export function metricDoc(
  ts: string,
  service: string,
  dataset: string,
  region: string,
  account: { id: string; name: string },
  dimensions: Record<string, unknown>,
  metrics: Record<string, unknown>,
  period = 60_000
): Record<string, unknown> {
  return {
    "@timestamp": ts,
    ecs: { version: "8.11.0" },
    cloud: {
      provider: "aws",
      region: region,
      account: { id: account.id, name: account.name },
    },
    agent: {
      type: "metricbeat",
      version: "8.18.0",
      name: `metricbeat-aws-${region}`,
      ephemeral_id: randId(36).toLowerCase(),
    },
    aws: {
      [service]: {
        metrics: metrics,
        dimensions: dimensions,
      },
    },
    metricset: { name: service, period: period },
    data_stream: { type: "metrics", dataset: dataset, namespace: "default" },
    input: { type: "aws-cloudwatch" },
    event: { dataset: dataset, module: "aws" },
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

/** Pick a random region+account pair (same for all docs in one generator call). */
export function pickCloudContext(
  REGIONS: readonly string[],
  ACCOUNTS: readonly { id: string; name: string }[]
): { region: string; account: { id: string; name: string } } {
  return { region: rand(REGIONS), account: rand(ACCOUNTS) };
}
