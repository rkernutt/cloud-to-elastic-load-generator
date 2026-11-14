/**
 * Elastic 9.0+–stable helpers for data-stream `_bulk` shipping.
 *
 * Contract (works on every Elastic 9.x, not only latest):
 * - Action: `create` only (data streams reject `index`/`update`)
 * - Content-Type: `application/x-ndjson` (no `compatible-with=` pin)
 * - Auth: `Authorization: ApiKey …`
 * - Pipeline: optional `?pipeline=` query param (ingest runs before write)
 * - Docs must include `@timestamp` before the data-stream write
 * - Strip loadgen-only `__dataset` (routing metadata, not an ECS field)
 *
 * Avoid: `require_data_stream`, version-locked Accept headers, `index` actions
 * on `logs-*` streams, and stack features that need 9.1+/9.3+/9.4+.
 */

/** ECS version stamped by this loadgen (stable across Elastic 9.0+). */
export const LOADGEN_ECS_VERSION = "8.11.0";

/** Pipeline `_id`s in rkernutt/rubrik-elastic-ingest — keep names aligned. */
export const RUBRIK_PIPELINE_IDS = {
  common: "rubrik-common-ecs",
  webhook: "rubrik-webhook",
  graphql: "rubrik-graphql-events",
  syslog: "rubrik-syslog",
} as const;

export type RubrikPath = "webhook" | "graphql" | "syslog";

export function rubrikPipelineForPath(path: RubrikPath): string {
  return RUBRIK_PIPELINE_IDS[path];
}

export function rubrikDataStream(path: RubrikPath, namespace = "default"): string {
  return `logs-rubrik.${path}-${namespace}`;
}

type JsonDoc = Record<string, unknown>;

/**
 * Pick a timestamp from common Rubrik raw shapes, else `fallbackIso`.
 */
export function resolveDocTimestamp(doc: JsonDoc, fallbackIso: string): string {
  if (typeof doc["@timestamp"] === "string" && doc["@timestamp"]) {
    return doc["@timestamp"];
  }
  if (typeof doc.timestamp === "string" && doc.timestamp) return doc.timestamp;
  if (typeof doc.lastUpdated === "string" && doc.lastUpdated) return doc.lastUpdated;
  if (typeof doc.time === "string" && doc.time) return doc.time;
  const activity = doc.activityConnection as { nodes?: Array<{ time?: unknown }> } | undefined;
  const nodeTime = activity?.nodes?.[0]?.time;
  if (typeof nodeTime === "string" && nodeTime) return nodeTime;
  return fallbackIso;
}

/**
 * Prepare a document for `_bulk` `create` into a data stream on Elastic 9.0+.
 * Strips `__dataset` and guarantees `@timestamp`.
 */
export function prepareDocForDataStreamBulk(
  doc: JsonDoc,
  fallbackIso: string = new Date().toISOString()
): JsonDoc {
  const { __dataset: _routing, ...rest } = doc;
  const out: JsonDoc = { ...rest };
  if (typeof out["@timestamp"] !== "string" || !out["@timestamp"]) {
    out["@timestamp"] = resolveDocTimestamp(rest, fallbackIso);
  }
  return out;
}

/**
 * Build NDJSON for data-stream-safe bulk create. Batches are the caller's job.
 */
export function buildCreateBulkNdjson(index: string, docs: JsonDoc[]): string {
  const lines: string[] = [];
  for (const doc of docs) {
    lines.push(JSON.stringify({ create: { _index: index } }));
    lines.push(JSON.stringify(doc));
  }
  return lines.join("\n") + "\n";
}

/** Stable Content-Type for `_bulk` on Elastic 9.0+ (and 8.x). */
export const BULK_CONTENT_TYPE = "application/x-ndjson";

/**
 * Soft-parse Elasticsearch `version.number` from GET /. Returns major or null.
 */
export function parseElasticMajorVersion(rootJson: unknown): number | null {
  if (!rootJson || typeof rootJson !== "object") return null;
  const version = (rootJson as { version?: { number?: unknown } }).version;
  const number = version?.number;
  if (typeof number !== "string") return null;
  const major = Number(number.split(".")[0]);
  return Number.isFinite(major) ? major : null;
}
