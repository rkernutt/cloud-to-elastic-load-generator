/**
 * Randomly pick among variant generators so parent services emit blended shapes
 * (e.g. Compute Engine logs include standard, Spot, Shielded, etc.).
 */
import { rand } from "../../helpers";
import type { MetricGenerator } from "../../aws/generators/types.js";

export function mergeGcpLogVariants(
  variants: Array<(ts: string, er: number) => Record<string, unknown>>
): (ts: string, er: number) => Record<string, unknown> {
  return (ts, er) => rand(variants)(ts, er);
}

export function mergeGcpTraceVariants(
  variants: Array<(ts: string, er: number) => Record<string, unknown>[]>
): (ts: string, er: number) => Record<string, unknown>[] {
  return (ts, er) => rand(variants)(ts, er);
}

export function mergeGcpMetricVariants(variants: MetricGenerator[]): MetricGenerator {
  return (ts, er) => rand(variants)(ts, er);
}
