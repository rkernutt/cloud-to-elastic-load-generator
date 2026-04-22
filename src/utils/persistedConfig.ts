/**
 * Browser localStorage for non-sensitive UI preferences only.
 * Elasticsearch URL and API key must never be stored here.
 */

import { validateIndexPrefix } from "./validation";

/** New sessions and imports without a boolean `scheduleEnabled` stay off unless the user opts in. */
export const DEFAULT_SCHEDULE_ENABLED = false;

export type ServerlessProjectType = "observability" | "security" | "elasticsearch";
export const SERVERLESS_PROJECT_TYPES: ServerlessProjectType[] = [
  "observability",
  "security",
  "elasticsearch",
];

export const PERSISTED_CONFIG_KEYS = [
  "logsIndexPrefix",
  "metricsIndexPrefix",
  "logsPerService",
  "tracesPerService",
  "errorRate",
  "batchSize",
  "batchDelayMs",
  "ingestionSource",
  "eventType",
  "injectAnomalies",
  "scheduleEnabled",
  "scheduleTotalRuns",
  "scheduleIntervalMin",
  "deploymentType",
  "serverlessProjectType",
] as const;

export type PersistedConfigKey = (typeof PERSISTED_CONFIG_KEYS)[number];

export const ALLOWED_LS_KEYS = new Set<string>(PERSISTED_CONFIG_KEYS);

export type PersistedConfigShape = Partial<{
  logsIndexPrefix: string;
  metricsIndexPrefix: string;
  logsPerService: number;
  tracesPerService: number;
  errorRate: number;
  batchSize: number;
  batchDelayMs: number;
  ingestionSource: string;
  eventType: string;
  injectAnomalies: boolean;
  scheduleEnabled: boolean;
  scheduleTotalRuns: number;
  scheduleIntervalMin: number;
  deploymentType: string;
  serverlessProjectType: string;
}>;

/** Live React state shape — same keys as persisted (for save effect). */
export type PersistedStateSlice = {
  logsIndexPrefix: string;
  metricsIndexPrefix: string;
  logsPerService: number;
  tracesPerService: number;
  errorRate: number;
  batchSize: number;
  batchDelayMs: number;
  ingestionSource: string;
  eventType: string;
  injectAnomalies: boolean;
  scheduleEnabled: boolean;
  scheduleTotalRuns: number;
  scheduleIntervalMin: number;
  deploymentType: string;
  serverlessProjectType: string;
};

/** Compile-time guard: PersistedStateSlice keys must match PERSISTED_CONFIG_KEYS exactly. */
type _SliceKey = keyof PersistedStateSlice;
type _AssertKeysMatch =
  Exclude<_SliceKey, PersistedConfigKey> extends never
    ? Exclude<PersistedConfigKey, _SliceKey> extends never
      ? true
      : never
    : never;
const _persistedKeysAligned: _AssertKeysMatch = true;
void _persistedKeysAligned;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Parse stored JSON into validated fields. Unknown keys are ignored; invalid types fall back to defaults.
 */
export function parsePersistedRecord(raw: Record<string, unknown>): PersistedConfigShape {
  const out: PersistedConfigShape = {};
  if ("logsIndexPrefix" in raw && typeof raw.logsIndexPrefix === "string") {
    const t = raw.logsIndexPrefix.trim();
    if (validateIndexPrefix(t).valid) out.logsIndexPrefix = t;
  }
  if ("metricsIndexPrefix" in raw && typeof raw.metricsIndexPrefix === "string") {
    const t = raw.metricsIndexPrefix.trim();
    if (validateIndexPrefix(t).valid) out.metricsIndexPrefix = t;
  }
  if (
    "logsPerService" in raw &&
    typeof raw.logsPerService === "number" &&
    Number.isFinite(raw.logsPerService)
  ) {
    out.logsPerService = Math.round(clamp(raw.logsPerService, 50, 5000));
  }
  if (
    "tracesPerService" in raw &&
    typeof raw.tracesPerService === "number" &&
    Number.isFinite(raw.tracesPerService)
  ) {
    out.tracesPerService = Math.round(clamp(raw.tracesPerService, 10, 500));
  }
  if ("errorRate" in raw && typeof raw.errorRate === "number" && Number.isFinite(raw.errorRate)) {
    out.errorRate = clamp(raw.errorRate, 0, 0.5);
  }
  if ("batchSize" in raw && typeof raw.batchSize === "number" && Number.isFinite(raw.batchSize)) {
    out.batchSize = Math.round(clamp(raw.batchSize, 50, 1000));
  }
  if (
    "batchDelayMs" in raw &&
    typeof raw.batchDelayMs === "number" &&
    Number.isFinite(raw.batchDelayMs)
  ) {
    out.batchDelayMs = Math.round(clamp(raw.batchDelayMs, 0, 2000));
  }
  if ("ingestionSource" in raw && typeof raw.ingestionSource === "string") {
    const t = raw.ingestionSource.trim();
    if (t.length > 0) out.ingestionSource = t;
  }
  if ("eventType" in raw) {
    const v = raw.eventType;
    if (v === "logs" || v === "metrics" || v === "traces") out.eventType = v;
  }
  if ("injectAnomalies" in raw && typeof raw.injectAnomalies === "boolean") {
    out.injectAnomalies = raw.injectAnomalies;
  }
  if ("scheduleEnabled" in raw && typeof raw.scheduleEnabled === "boolean") {
    out.scheduleEnabled = raw.scheduleEnabled;
  }
  if (
    "scheduleTotalRuns" in raw &&
    typeof raw.scheduleTotalRuns === "number" &&
    Number.isFinite(raw.scheduleTotalRuns)
  ) {
    out.scheduleTotalRuns = Math.round(clamp(raw.scheduleTotalRuns, 1, 24));
  }
  if (
    "scheduleIntervalMin" in raw &&
    typeof raw.scheduleIntervalMin === "number" &&
    Number.isFinite(raw.scheduleIntervalMin)
  ) {
    out.scheduleIntervalMin = Math.round(clamp(raw.scheduleIntervalMin, 5, 60));
  }
  if ("deploymentType" in raw) {
    const v = raw.deploymentType;
    if (v === "self-managed" || v === "cloud-hosted" || v === "serverless") out.deploymentType = v;
  }
  if ("serverlessProjectType" in raw) {
    const v = raw.serverlessProjectType;
    if (v === "observability" || v === "security" || v === "elasticsearch")
      out.serverlessProjectType = v;
  }
  return out;
}

export function loadAndScrubSavedConfig(lsKey: string): PersistedConfigShape {
  try {
    const stored = localStorage.getItem(lsKey);
    if (stored == null) return {};
    const raw: unknown = JSON.parse(stored);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      localStorage.removeItem(lsKey);
      return {};
    }
    const record = raw as Record<string, unknown>;
    const hasDisallowedKeys = Object.keys(record).some((k) => !ALLOWED_LS_KEYS.has(k));
    const sanitized = parsePersistedRecord(record);
    if (hasDisallowedKeys) {
      try {
        localStorage.setItem(lsKey, JSON.stringify(sanitized));
      } catch (e) {
        if (import.meta.env.DEV) console.warn("[LS] Failed to scrub saved config:", e);
      }
    }
    return sanitized;
  } catch (e) {
    if (import.meta.env.DEV) console.warn("[LS] Failed to read saved config:", e);
    return {};
  }
}

/** Serializes only allowlisted keys from full app state (must stay aligned with PERSISTED_CONFIG_KEYS). */
export function toPersistedStorageObject(s: PersistedStateSlice): PersistedConfigShape {
  const out = {} as PersistedConfigShape;
  for (const k of PERSISTED_CONFIG_KEYS) {
    (out as Record<string, string | number | boolean>)[k] = s[k];
  }
  return out;
}
