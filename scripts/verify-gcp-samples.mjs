/**
 * Fail if samples/gcp/logs|metrics|traces are missing files for any registered GCP generator.
 * Run: npm run samples:verify (includes GCP)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

function idsInDir(relDir, ext = ".json") {
  const dir = path.join(rootDir, relDir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(ext))
    .map((f) => f.slice(0, -ext.length));
}

function assertMatch(name, expectedKeys, actualIds, samplesDir) {
  const actual = new Set(actualIds);
  const missing = expectedKeys.filter((k) => !actual.has(k));
  const extra = [...actual].filter((k) => !expectedKeys.includes(k));
  if (missing.length || extra.length) {
    console.error(`\n[samples:verify / gcp / ${name}] mismatch under ${samplesDir}/`);
    if (missing.length) console.error("  Missing files:", missing.join(", "));
    if (extra.length) console.error("  Unexpected files:", extra.join(", "));
    process.exit(1);
  }
}

const { GCP_GENERATORS } = await import("../src/gcp/generators/index.ts");
const { GCP_METRICS_GENERATORS } = await import("../src/gcp/generators/metrics/index.ts");
const { GCP_TRACE_GENERATORS } = await import("../src/gcp/generators/traces/index.ts");

const logKeys = Object.keys(GCP_GENERATORS).sort();
const metricKeys = Object.keys(GCP_METRICS_GENERATORS).sort();
const traceKeys = Object.keys(GCP_TRACE_GENERATORS).sort();

assertMatch("logs", logKeys, idsInDir("samples/gcp/logs"), "samples/gcp/logs");
assertMatch("metrics", metricKeys, idsInDir("samples/gcp/metrics"), "samples/gcp/metrics");
assertMatch("traces", traceKeys, idsInDir("samples/gcp/traces"), "samples/gcp/traces");

console.log(
  `GCP samples OK — logs: ${logKeys.length}, metrics: ${metricKeys.length}, traces: ${traceKeys.length}`
);
