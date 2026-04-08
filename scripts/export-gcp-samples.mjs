/**
 * Export one sample log per GCP service to samples/gcp/logs/, one sample metrics
 * doc per metrics-supported service to samples/gcp/metrics/, and one sample trace
 * doc per trace-supported service to samples/gcp/traces/.
 * Run: npx vite-node scripts/export-gcp-samples.mjs
 */
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const logsDir = path.join(rootDir, "samples", "gcp", "logs");
const metricsDir = path.join(rootDir, "samples", "gcp", "metrics");
const tracesDir = path.join(rootDir, "samples", "gcp", "traces");

/** Fixed timestamp for reproducible sample files */
const ts = "2026-04-04T12:00:00.000Z";
const errorRate = 0.05;

function cleanJsonDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith(".json")) fs.unlinkSync(path.join(dir, f));
  }
}

function stripNulls(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(stripNulls);
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (v != null) out[k] = stripNulls(v);
  return out;
}

const { GCP_GENERATORS } = await import("../src/gcp/generators/index.ts");
const { GCP_METRICS_GENERATORS } = await import("../src/gcp/generators/metrics/index.ts");
const { GCP_TRACE_GENERATORS } = await import("../src/gcp/generators/traces/index.ts");
const { enrichForCloud } = await import("../src/helpers/enrichGcpAzure.ts");
const { GCP_CONFIG } = await import("../src/cloud/gcpConfig.ts");

function gcpIngestion(id) {
  return GCP_CONFIG.serviceIngestionDefaults[id] ?? GCP_CONFIG.fallbackIngestionSource;
}

fs.mkdirSync(logsDir, { recursive: true });
fs.mkdirSync(metricsDir, { recursive: true });
fs.mkdirSync(tracesDir, { recursive: true });
cleanJsonDir(logsDir);
cleanJsonDir(metricsDir);
cleanJsonDir(tracesDir);

// ── Log samples ───────────────────────────────────────────────────────────────
let logCount = 0;
for (const [id, fn] of Object.entries(GCP_GENERATORS)) {
  const result = fn(ts, errorRate);
  const raw = Array.isArray(result) ? result[0] : result;
  const { __dataset: _omitDataset, ...cleaned } = stripNulls(raw);
  const enriched = enrichForCloud(
    cleaned,
    { serviceId: id, eventType: "logs", ingestionSource: gcpIngestion(id) },
    GCP_CONFIG.enrichContext
  );
  fs.writeFileSync(path.join(logsDir, `${id}.json`), JSON.stringify(enriched, null, 2), "utf8");
  logCount++;
}

// ── Metrics samples ───────────────────────────────────────────────────────────
let metricsCount = 0;
for (const [id, fn] of Object.entries(GCP_METRICS_GENERATORS)) {
  const docs = fn(ts, errorRate);
  const raw = stripNulls(Array.isArray(docs) ? docs[0] : docs);
  const enriched = enrichForCloud(
    raw,
    { serviceId: id, eventType: "metrics", ingestionSource: gcpIngestion(id) },
    GCP_CONFIG.enrichContext
  );
  fs.writeFileSync(path.join(metricsDir, `${id}.json`), JSON.stringify(enriched, null, 2), "utf8");
  metricsCount++;
}

// ── Traces samples — first span doc from each trace generator ───────────────
let tracesCount = 0;
for (const [id, fn] of Object.entries(GCP_TRACE_GENERATORS)) {
  const docs = fn(ts, errorRate);
  const raw = stripNulls(Array.isArray(docs) ? docs[0] : docs);
  const enriched = enrichForCloud(
    raw,
    { serviceId: id, eventType: "traces", ingestionSource: "otel" },
    GCP_CONFIG.enrichContext
  );
  fs.writeFileSync(path.join(tracesDir, `${id}.json`), JSON.stringify(enriched, null, 2), "utf8");
  tracesCount++;
}

console.log(
  `Wrote ${logCount} sample log(s) to samples/gcp/logs/, ${metricsCount} sample metric(s) to samples/gcp/metrics/, and ${tracesCount} sample trace(s) to samples/gcp/traces/`
);
