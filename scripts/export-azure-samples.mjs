/**
 * Export sample Azure logs/metrics/traces to samples/azure/{logs,metrics,traces}/.
 * Run: npx vite-node scripts/export-azure-samples.mjs
 */
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { writePrettierJson } from "./write-prettier-json.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const logsDir = path.join(rootDir, "samples", "azure", "logs");
const metricsDir = path.join(rootDir, "samples", "azure", "metrics");
const tracesDir = path.join(rootDir, "samples", "azure", "traces");

const ts = "2026-04-07T12:00:00.000Z";
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

const { AZURE_GENERATORS } = await import("../src/azure/generators/index.ts");
const { AZURE_METRICS_GENERATORS } = await import("../src/azure/generators/metrics/index.ts");
const { AZURE_TRACE_GENERATORS } = await import("../src/azure/generators/traces/index.ts");
const { enrichForCloud } = await import("../src/helpers/enrichGcpAzure.ts");
const { AZURE_CONFIG } = await import("../src/cloud/azureConfig.ts");

function azureIngestion(id) {
  return AZURE_CONFIG.serviceIngestionDefaults[id] ?? AZURE_CONFIG.fallbackIngestionSource;
}

fs.mkdirSync(logsDir, { recursive: true });
fs.mkdirSync(metricsDir, { recursive: true });
fs.mkdirSync(tracesDir, { recursive: true });
cleanJsonDir(logsDir);
cleanJsonDir(metricsDir);
cleanJsonDir(tracesDir);

let logCount = 0;
for (const [id, fn] of Object.entries(AZURE_GENERATORS)) {
  const result = fn(ts, errorRate);
  const raw = Array.isArray(result) ? result[0] : result;
  const enrichedWithMarker = enrichForCloud(
    stripNulls(raw),
    { serviceId: id, eventType: "logs", ingestionSource: azureIngestion(id) },
    AZURE_CONFIG.enrichContext
  );
  // Strip the internal `__dataset` routing marker AFTER enrichment so the
  // cross-cloud short-circuit in `enrichGcpAzureDocument` can detect it.
  const { __dataset: _omitDataset, ...enriched } = enrichedWithMarker;
  await writePrettierJson(path.join(logsDir, `${id}.json`), enriched);
  logCount++;
}

let metricsCount = 0;
for (const [id, fn] of Object.entries(AZURE_METRICS_GENERATORS)) {
  const docs = fn(ts, errorRate);
  const raw = stripNulls(Array.isArray(docs) ? docs[0] : docs);
  const enriched = enrichForCloud(
    raw,
    { serviceId: id, eventType: "metrics", ingestionSource: azureIngestion(id) },
    AZURE_CONFIG.enrichContext
  );
  await writePrettierJson(path.join(metricsDir, `${id}.json`), enriched);
  metricsCount++;
}

let tracesCount = 0;
for (const [id, fn] of Object.entries(AZURE_TRACE_GENERATORS)) {
  const docs = fn(ts, errorRate);
  const raw = stripNulls(Array.isArray(docs) ? docs[0] : docs);
  const enriched = enrichForCloud(
    raw,
    { serviceId: id, eventType: "traces", ingestionSource: "otel" },
    AZURE_CONFIG.enrichContext
  );
  await writePrettierJson(path.join(tracesDir, `${id}.json`), enriched);
  tracesCount++;
}

console.log(
  `Wrote ${logCount} Azure log(s), ${metricsCount} metric(s), ${tracesCount} trace(s) under samples/azure/`
);
