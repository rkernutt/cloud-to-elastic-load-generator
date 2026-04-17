/**
 * Shared utilities for GCP Cloud Monitoring–style metric documents.
 */

export { GCP_REGIONS, GCP_PROJECTS, rand, randInt, randFloat, randId } from "../helpers.js";
import { rand, randId, GCP_REGIONS, randProject } from "../helpers.js";
import type { GcpProject } from "../helpers.js";
import type { EcsDocument } from "../../../aws/generators/types.js";

export type MonitoringMetricKind = "GAUGE" | "DELTA" | "CUMULATIVE";
export type MonitoringValueType = "DOUBLE" | "INT64" | "DISTRIBUTION";

export type MonitoringPointValue =
  | { doubleValue: number }
  | { int64Value: string }
  | {
      distributionValue: {
        count: string;
        mean: number;
        sumOfSquaredDeviation?: number;
        bucketCounts?: string[];
      };
    };

export type GcpMonitoringMetricSpec = {
  metricType: string;
  metricLabels?: Record<string, string>;
  resourceType: string;
  resourceLabels: Record<string, string>;
  metricKind: MonitoringMetricKind;
  valueType: MonitoringValueType;
  point: MonitoringPointValue;
  period?: number;
  extraServiceLabels?: Record<string, string>;
};

export function toInt64String(n: number): string {
  return String(Math.max(0, Math.round(n)));
}

function pointToServiceMetrics(
  metricType: string,
  point: MonitoringPointValue
): Record<string, unknown> {
  if ("doubleValue" in point) {
    const v = dp(point.doubleValue);
    return { [metricType]: stat(v, { sum: v, count: 1 }) };
  }
  if ("int64Value" in point) {
    const n = Number(point.int64Value);
    return { [metricType]: counter(Number.isFinite(n) ? n : 0) };
  }
  const d = point.distributionValue;
  const c = Math.max(1, Number(d.count) || 1);
  const m = dp(d.mean);
  return {
    [metricType]: stat(m, {
      sum: dp(m * c),
      count: c,
      max: dp(m * 2.2),
      min: dp(Math.max(0, m * 0.35)),
    }),
  };
}

export function gcpMetricDoc(
  ts: string,
  service: string,
  dataset: string,
  region: string,
  project: GcpProject,
  spec: GcpMonitoringMetricSpec
): EcsDocument {
  const metricLabels = spec.metricLabels ?? {};
  const extra = spec.extraServiceLabels ?? {};
  const mergedLabels: Record<string, unknown> = {
    ...spec.resourceLabels,
    ...metricLabels,
    ...extra,
  };

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
    monitoringTimeSeries: {
      metric: {
        type: spec.metricType,
        labels: metricLabels,
      },
      resource: {
        type: spec.resourceType,
        labels: spec.resourceLabels,
      },
      metricKind: spec.metricKind,
      valueType: spec.valueType,
      points: [{ interval: { endTime: ts }, value: spec.point }],
    },
    gcp: {
      [service]: {
        labels: mergedLabels,
        metrics: pointToServiceMetrics(spec.metricType, spec.point),
      },
    },
    metricset: { name: service, period: spec.period ?? 60_000 },
    data_stream: { type: "metrics", dataset, namespace: "default" },
    input: { type: "gcp-monitoring" },
    event: { dataset, module: "gcp" },
  };
}

export function sample<T>(arr: T[], n: number): T[] {
  const copy = [...arr].sort(() => Math.random() - 0.5);
  return copy.slice(0, Math.min(n, copy.length));
}

export function jitter(center: number, spread: number, min = 0, max = Infinity): number {
  const v = center + (Math.random() - 0.5) * 2 * spread;
  return Math.max(min, Math.min(max, v));
}

export function dp(v: number, places = 2): number {
  return parseFloat(v.toFixed(places));
}

export function stat(
  avg: number,
  { sum, count = 1, max, min }: { sum?: number; count?: number; max?: number; min?: number } = {}
): Record<string, number> {
  const s: Record<string, number> = { avg: dp(avg), sum: dp(sum ?? avg), count };
  if (max !== undefined) s.max = dp(max);
  if (min !== undefined) s.min = dp(min);
  return s;
}

export function counter(value: number): Record<string, number> {
  return stat(value, { sum: value });
}

export function pickGcpCloudContext(): { region: string; project: GcpProject } {
  return { region: rand(GCP_REGIONS), project: randProject() };
}

export function distributionFromMs(
  meanMs: number,
  count: number,
  stressed: boolean
): MonitoringPointValue {
  const c = Math.max(1, Math.round(count));
  const mean = Math.max(0.001, meanMs / 1000);
  const spread = stressed ? mean * 1.2 : mean * 0.45;
  return {
    distributionValue: {
      count: String(c),
      mean,
      sumOfSquaredDeviation: dp(spread * spread * c * 0.25),
      bucketCounts: [
        "0",
        toInt64String(c * 0.55),
        toInt64String(c * 0.25),
        toInt64String(c * 0.12),
        toInt64String(c * 0.08),
      ],
    },
  };
}
