/**
 * Node helpers that mirror src/setup/dashboardToImportNdjson.ts's
 * `seededUUID('dashboard:<title>')` so the .mjs CLI installer and asset
 * exporter resolve dashboard saved-object IDs identically to the wizard.
 *
 * Used by:
 *   - installer/alert-rules-installer/index.mjs (resolves relatedDashboards
 *     → artifacts.dashboards before POSTing each rule).
 *   - scripts/export-standalone-assets.mjs (rewrites relatedDashboards to
 *     artifacts.dashboards so the `assets/` mirror is paste-ready).
 *
 * Important: the byte-for-byte hash format must match the TS version because
 * dashboards installed by the wizard use SHA-1(seed) → UUID v4-shaped
 * strings as their saved-object IDs. Any drift here would produce broken
 * `artifacts.dashboards` references on rules.
 */

import { createHash } from "node:crypto";

function sha1Hex(message) {
  return createHash("sha1").update(message, "utf8").digest("hex");
}

/**
 * Produce a deterministic UUID-v4-shaped ID from a seed string.
 * Mirrors `seededUUID(seed)` in src/setup/dashboardToImportNdjson.ts.
 */
export function seededUUID(seed) {
  const hash = sha1Hex(seed);
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    "4" + hash.slice(13, 16),
    ((parseInt(hash[16], 16) & 3) | 8).toString(16) + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join("-");
}

/** Same shape as `dashboardDefToSavedObjectId({ title })` in TS. */
export function dashboardSavedObjectId(title) {
  return seededUUID(`dashboard:${title}`);
}

/**
 * Translate a rule's optional `relatedDashboards` array (titles) into the
 * Kibana `artifacts.dashboards` shape. Returns null when there are no
 * resolvable dashboards so callers can omit the field entirely.
 */
export function buildArtifactsFromRelatedDashboards(relatedDashboards) {
  if (!Array.isArray(relatedDashboards) || relatedDashboards.length === 0) {
    return null;
  }
  const dashboards = relatedDashboards
    .filter((t) => typeof t === "string" && t.length > 0)
    .map((title) => ({ id: dashboardSavedObjectId(title) }));
  if (dashboards.length === 0) return null;
  return { dashboards };
}
