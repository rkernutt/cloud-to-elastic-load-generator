/**
 * Randomly blend Azure child service log/metric shapes under a parent resource.
 */
import { rand } from "../../helpers";
import type { EcsDocument } from "./helpers.js";
import type { MetricGenerator } from "../../aws/generators/types.js";

export function mergeAzureLogVariants(
  variants: Array<(ts: string, er: number) => EcsDocument>
): (ts: string, er: number) => EcsDocument {
  return (ts: string, er: number) => rand(variants)(ts, er);
}

export function mergeAzureMetricVariants(variants: MetricGenerator[]): MetricGenerator {
  return (ts: string, er: number) => rand(variants)(ts, er);
}
