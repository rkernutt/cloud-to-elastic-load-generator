/**
 * Export one sample log per service to samples/aws/logs/, one metrics doc per
 * metrics-supported service to samples/aws/metrics/, and one trace doc per
 * trace-supported service to samples/aws/traces/. Run: npm run samples
 */
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const awsSamples = path.join(rootDir, "samples", "aws");
const logsDir = path.join(awsSamples, "logs");
const metricsDir = path.join(awsSamples, "metrics");
const tracesDir = path.join(awsSamples, "traces");

const ts = new Date().toISOString();
const errorRate = 0.1;

function stripNulls(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(stripNulls);
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (v != null) out[k] = stripNulls(v);
  return out;
}

const { GENERATORS } = await import("../src/aws/generators/index.ts");
const { METRICS_GENERATORS } = await import("../src/aws/generators/metrics/index.ts");
const { TRACE_GENERATORS } = await import("../src/aws/generators/traces/index.ts");
const { enrichDocument } = await import("../src/helpers/enrich.ts");
const { SERVICE_INGESTION_DEFAULTS } = await import("../src/data/ingestion.ts");

function getSource(svcId) {
  return SERVICE_INGESTION_DEFAULTS[svcId] || "cloudwatch";
}

fs.mkdirSync(awsSamples, { recursive: true });
fs.mkdirSync(logsDir, { recursive: true });
fs.mkdirSync(metricsDir, { recursive: true });
fs.mkdirSync(tracesDir, { recursive: true });

// ── Log samples ───────────────────────────────────────────────────────────────
let logCount = 0;
for (const [id, fn] of Object.entries(GENERATORS)) {
  const result = fn(ts, errorRate);
  // Chain generators return arrays — write first doc; strip __dataset routing key
  const raw = Array.isArray(result) ? result[0] : result;
  const { __dataset: _omitDataset, ...cleaned } = stripNulls(raw);
  const doc = enrichDocument(cleaned, {
    serviceId: id,
    ingestionSource: getSource(id),
    eventType: "logs",
  });
  fs.writeFileSync(path.join(logsDir, `${id}.json`), JSON.stringify(doc, null, 2), "utf8");
  logCount++;
}

// ── Metrics samples — use dimensional generators for true CloudWatch shape ────
let metricsCount = 0;
for (const [id, fn] of Object.entries(METRICS_GENERATORS)) {
  const docs = fn(ts, errorRate);
  const raw = stripNulls(Array.isArray(docs) ? docs[0] : docs);
  const doc = enrichDocument(raw, {
    serviceId: id,
    ingestionSource: getSource(id),
    eventType: "metrics",
  });
  fs.writeFileSync(path.join(metricsDir, `${id}.json`), JSON.stringify(doc, null, 2), "utf8");
  metricsCount++;
}

// ── Traces samples — write first span doc from each trace generator ───────────
let tracesCount = 0;
for (const [id, fn] of Object.entries(TRACE_GENERATORS)) {
  const docs = fn(ts, errorRate);
  const raw = stripNulls(Array.isArray(docs) ? docs[0] : docs);
  const doc = enrichDocument(raw, { serviceId: id, ingestionSource: "otel", eventType: "traces" });
  fs.writeFileSync(path.join(tracesDir, `${id}.json`), JSON.stringify(doc, null, 2), "utf8");
  tracesCount++;
}

console.log(
  `Wrote ${logCount} sample log(s) to samples/aws/logs/, ${metricsCount} sample metric(s) to samples/aws/metrics/, and ${tracesCount} sample trace(s) to samples/aws/traces/`
);
