import { generateEntraIdDedicatedExtendedMetrics } from "../../azure/generators/metrics/dedicatedExtended.js";
import { generateManagedAdMetrics } from "../../gcp/generators/metrics/governance.js";

export const SUPPORTING_METRICS_GENERATORS: Record<
  string,
  (ts: string, er: number) => unknown | unknown[]
> = {
  "entra-id": generateEntraIdDedicatedExtendedMetrics,
  "managed-ad": generateManagedAdMetrics,
};
