/**
 * Rubrik CDM syslog generator.
 *
 * Raw output is RFC 3164-style lines for Custom TCP/UDP Logs.
 * UI ship wraps decoded-looking ECS docs for logs-rubrik.syslog-*.
 */

import type { EcsDocument } from "../../aws/generators/types.js";
import { generateAnomalyRansomwareRaw, generateRawRubrikEvent } from "./raw.js";
import { wrapRawAsEcs } from "./ecsWrap.js";

export function generateRubrikSyslogLog(ts: string, er: number): EcsDocument | EcsDocument[] {
  const forceAnomaly = Math.random() < 0.14 + er * 0.2;
  const raw = forceAnomaly
    ? generateAnomalyRansomwareRaw(ts, "syslog")
    : generateRawRubrikEvent(ts, er, "syslog");
  return wrapRawAsEcs(raw, ts);
}
