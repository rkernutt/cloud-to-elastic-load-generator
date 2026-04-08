/**
 * Generates installer/azure-custom-pipelines/pipelines/registry.mjs from
 * src/azure/data/elasticMaps.ts + serviceGroups.ts.
 *
 * Run: npx vite-node scripts/generate-azure-pipeline-registry.mjs
 */
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "installer/azure-custom-pipelines/pipelines");
const outPath = path.join(outDir, "registry.mjs");
mkdirSync(outDir, { recursive: true });

const { AZURE_ELASTIC_DATASET_MAP } = await import(path.join(root, "src/azure/data/elasticMaps.ts"));
const { AZURE_SERVICE_GROUPS } = await import(path.join(root, "src/azure/data/serviceGroups.ts"));

const sidToGroup = {};
for (const g of AZURE_SERVICE_GROUPS) {
  for (const s of g.services) sidToGroup[s.id] = g.id;
}

const seen = new Set();
const entries = [];
for (const [sid, full] of Object.entries(AZURE_ELASTIC_DATASET_MAP)) {
  if (typeof full !== "string" || !full.startsWith("azure.")) continue;
  const suf = full.slice(6);
  if (seen.has(suf)) continue;
  seen.add(suf);
  entries.push({ suf, full, sid, group: sidToGroup[sid] ?? "misc" });
}
entries.sort((a, b) => a.suf.localeCompare(b.suf));

const header = `/**
 * Custom ingest pipelines for Azure load-generator data streams logs-azure.{suffix}-default.
 * Parses JSON from the message field into azure.parsed when present.
 *
 * Generated — run: npx vite-node scripts/generate-azure-pipeline-registry.mjs
 */

`;

const body =
  `export const PIPELINE_REGISTRY = [\n` +
  entries
    .map(
      (e) => `  {
    id: "logs-azure.${e.suf}-default",
    dataset: "${e.full}",
    group: "${e.group}",
    description: "Parse JSON from message for ${e.full} (${e.sid})",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },`
    )
    .join("\n") +
  `\n];\n`;

writeFileSync(outPath, header + body, "utf8");
console.log(`Wrote ${entries.length} pipelines to ${path.relative(root, outPath)}`);
