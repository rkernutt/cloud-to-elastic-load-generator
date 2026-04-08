/**
 * Fail if samples/azure/* are missing files for any registered generator.
 * Run: npm run samples:verify (includes Azure)
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
    console.error(`\n[samples:verify / azure / ${name}] mismatch under ${samplesDir}/`);
    if (missing.length) console.error("  Missing files:", missing.join(", "));
    if (extra.length) console.error("  Unexpected files:", extra.join(", "));
    process.exit(1);
  }
}

const { AZURE_GENERATORS } = await import("../src/azure/generators/index.ts");
const { AZURE_METRICS_GENERATORS } = await import("../src/azure/generators/metrics/index.ts");
const { AZURE_TRACE_GENERATORS } = await import("../src/azure/generators/traces/index.ts");

const logKeys = Object.keys(AZURE_GENERATORS).sort();
const metricKeys = Object.keys(AZURE_METRICS_GENERATORS).sort();
const traceKeys = Object.keys(AZURE_TRACE_GENERATORS).sort();

assertMatch("logs", logKeys, idsInDir("samples/azure/logs"), "samples/azure/logs");
assertMatch("metrics", metricKeys, idsInDir("samples/azure/metrics"), "samples/azure/metrics");
assertMatch("traces", traceKeys, idsInDir("samples/azure/traces"), "samples/azure/traces");

console.log(
  `Azure samples OK — logs: ${logKeys.length}, metrics: ${metricKeys.length}, traces: ${traceKeys.length}`
);
