#!/usr/bin/env node
/**
 * Converts AWS alerting rule bundles from installer/aws-custom-rules/
 * to Kibana 8.2-compatible JSON in installer/aws-custom-rules-82/.
 *
 * Run: npm run generate:aws-rules:82
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = join(__dirname, "../aws-custom-rules");
const OUTPUT_DIR = __dirname;

const STRIP_FIELDS = ["investigationGuide", "relatedDashboards", "artifacts"];

function transformRule(rule) {
  const out = { ...rule };

  if (out.consumer === "alerts") {
    out.consumer = "stackAlerts";
  }

  for (const field of STRIP_FIELDS) {
    delete out[field];
  }

  return out;
}

function transformBundle(bundle) {
  return {
    ...bundle,
    rules: bundle.rules.map(transformRule),
  };
}

function main() {
  if (!existsSync(SOURCE_DIR)) {
    console.error(`Source directory not found: ${SOURCE_DIR}`);
    process.exit(1);
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });

  const files = readdirSync(SOURCE_DIR).filter((f) => f.endsWith("-rules.json"));
  if (files.length === 0) {
    console.error(`No *-rules.json files in ${SOURCE_DIR}`);
    process.exit(1);
  }

  console.log(`Converting ${files.length} rule bundle(s) for Kibana 8.2...\n`);

  for (const file of files.sort()) {
    const srcPath = join(SOURCE_DIR, file);
    const raw = readFileSync(srcPath, "utf8");
    const bundle = JSON.parse(raw);

    if (!Array.isArray(bundle.rules)) {
      console.error(`  ✗ ${file} — missing rules array`);
      process.exit(1);
    }

    const converted = transformBundle(bundle);
    const outPath = join(OUTPUT_DIR, file);
    writeFileSync(outPath, `${JSON.stringify(converted, null, 2)}\n`, "utf8");
    console.log(`  ✓ ${file} — ${converted.rules.length} rule(s)`);
  }

  console.log(`\nWrote ${files.length} file(s) to ${OUTPUT_DIR}`);
}

main();
