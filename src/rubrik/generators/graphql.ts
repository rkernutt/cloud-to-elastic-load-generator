/**
 * Rubrik GraphQL-shaped event generator (activitySeries / userAudit nodes).
 *
 * Payload shape matches what CEL Custom API would hand to rubrik-graphql-events.
 * UI ship wraps to ECS; CLI can emit raw nodes for Agent / file staging.
 */

import type { EcsDocument } from "../../aws/generators/types.js";
import { generateAnomalyRansomwareRaw, generateRawRubrikEvent } from "./raw.js";
import { wrapRawAsEcs } from "./ecsWrap.js";

export function generateRubrikGraphqlLog(ts: string, er: number): EcsDocument | EcsDocument[] {
  const forceAnomaly = Math.random() < 0.14 + er * 0.2;
  const raw = forceAnomaly
    ? generateAnomalyRansomwareRaw(ts, "graphql")
    : generateRawRubrikEvent(ts, er, "graphql");
  return wrapRawAsEcs(raw, ts);
}
