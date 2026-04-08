/**
 * Generates installer/gcp-custom-pipelines/pipelines/registry.mjs from
 * src/gcp/data/elasticMaps.ts + serviceGroups.ts (single source of truth).
 *
 * Run: npx vite-node scripts/generate-gcp-pipeline-registry.mjs
 */
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "installer/gcp-custom-pipelines/pipelines");
const outPath = path.join(outDir, "registry.mjs");
mkdirSync(outDir, { recursive: true });

const { GCP_ELASTIC_DATASET_MAP } = await import(path.join(root, "src/gcp/data/elasticMaps.ts"));
const { GCP_SERVICE_GROUPS } = await import(path.join(root, "src/gcp/data/serviceGroups.ts"));

/** @type {Record<string, string>} */
const sidToGroup = {};
for (const g of GCP_SERVICE_GROUPS) {
  for (const s of g.services) sidToGroup[s.id] = g.id;
}

const seen = new Set();
const entries = [];
for (const [sid, full] of Object.entries(GCP_ELASTIC_DATASET_MAP)) {
  if (typeof full !== "string" || !full.startsWith("gcp.")) continue;
  const suf = full.slice(4);
  if (seen.has(suf)) continue;
  seen.add(suf);
  entries.push({
    suf,
    full,
    sid,
    group: sidToGroup[sid] ?? "misc",
  });
}
entries.sort((a, b) => a.suf.localeCompare(b.suf));

const header = `/**
 * Registry of custom Elasticsearch ingest pipelines for GCP data streams
 * produced by the GCP load generator (logs-gcp.{suffix}-default).
 *
 * Processors: parse JSON from \`message\` into \`gcp.parsed\` when present.
 *
 * **Generated file** — edit src/gcp/data/elasticMaps.ts or serviceGroups.ts,
 * then run:  npx vite-node scripts/generate-gcp-pipeline-registry.mjs
 */

`;

const body =
  `export const PIPELINE_REGISTRY = [\n` +
  entries
    .map(
      (e) => `  {
    id: "logs-gcp.${e.suf}-default",
    dataset: "${e.full}",
    group: "${e.group}",
    description: "Parse JSON from message field for ${e.full} (service ${e.sid})",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },`
    )
    .join("\n") +
  `\n];\n`;

writeFileSync(outPath, header + body, "utf8");
console.log(`Wrote ${entries.length} pipeline entries to ${path.relative(root, outPath)}`);
