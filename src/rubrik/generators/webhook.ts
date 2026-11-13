/**
 * Rubrik webhook log generator (Supporting Services).
 *
 * Emits ECS-wrapped docs for UI → Elasticsearch _bulk, with raw PD-CEF or
 * custom Elastic webhook JSON preserved in `message` / `event.original`.
 * Mix includes Anomaly + Success + critical (RansomwareStrainDetected).
 */

import type { EcsDocument } from "../../aws/generators/types.js";
import { generateAnomalyRansomwareRaw, generateRawRubrikEvent } from "./raw.js";
import { wrapRawAsEcs } from "./ecsWrap.js";

/**
 * Generate one or more Rubrik webhook documents.
 * Every ~7th call (or when er is high) forces a ransomware anomaly sample.
 */
export function generateRubrikWebhookLog(ts: string, er: number): EcsDocument | EcsDocument[] {
  const forceAnomaly = Math.random() < 0.14 + er * 0.2;
  const raw = forceAnomaly
    ? generateAnomalyRansomwareRaw(ts, "webhook")
    : generateRawRubrikEvent(ts, er, "webhook");
  return wrapRawAsEcs(raw, ts);
}
