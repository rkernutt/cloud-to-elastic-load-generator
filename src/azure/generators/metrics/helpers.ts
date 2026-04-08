/**
 * Azure Monitor–style synthetic metric documents.
 */

export {
  AZURE_REGIONS,
  AZURE_SUBSCRIPTIONS,
  rand,
  randInt,
  randFloat,
  randId,
} from "../helpers.js";
import { rand, randId, AZURE_REGIONS, randSubscription } from "../helpers.js";
import type { AzureSubscription } from "../helpers.js";
import type { EcsDocument } from "../../../aws/generators/types.js";

export function azureMetricDoc(
  ts: string,
  serviceKey: string,
  dataset: string,
  region: string,
  subscription: AzureSubscription,
  resourceGroup: string,
  labels: Record<string, unknown>,
  metrics: Record<string, unknown>,
  period = 60_000
): EcsDocument {
  return {
    "@timestamp": ts,
    ecs: { version: "8.11.0" },
    cloud: {
      provider: "azure",
      region,
      account: { id: subscription.id, name: subscription.name },
    },
    agent: {
      type: "metricbeat",
      version: "8.18.0",
      name: `metricbeat-azure-${region}`,
      ephemeral_id: randId(36).toLowerCase(),
    },
    azure: {
      [serviceKey.replace(/-/g, "_")]: {
        metrics,
        labels: { resource_group: resourceGroup, ...labels },
      },
    },
    metricset: { name: serviceKey, period },
    data_stream: { type: "metrics", dataset, namespace: "default" },
    input: { type: "azure-monitor" },
    event: { dataset, module: "azure" },
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

export function pickAzureContext(): {
  region: string;
  subscription: AzureSubscription;
  resourceGroup: string;
} {
  const sub = randSubscription();
  return {
    region: rand(AZURE_REGIONS),
    subscription: sub,
    resourceGroup: `rg-${rand(["prod", "shared", "data"])}-${randId(5).toLowerCase()}`,
  };
}
