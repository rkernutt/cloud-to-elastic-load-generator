/**
 * Generates installer/azure-custom-pipelines/pipelines/registry.mjs from
 * src/azure/data/elasticMaps.ts + serviceGroups.ts.
 *
 * Each pipeline includes:
 *   • JSON parse from message → Azure field extraction
 *   • Azure identity extraction (identity.claims → user.email, callerIpAddress → source.ip)
 *   • Group-aware ECS normalisation
 *   • GeoIP, user-agent, related fields, duration conversion
 *   • on_failure error tagging
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

const { AZURE_ELASTIC_DATASET_MAP } = await import(
  path.join(root, "src/azure/data/elasticMaps.ts")
);
const { AZURE_SERVICE_GROUPS } = await import(path.join(root, "src/azure/data/serviceGroups.ts"));
const { buildPipeline } = await import(path.join(root, "installer/shared/pipeline-processors.mjs"));

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
  const group = sidToGroup[sid] ?? "misc";
  const pipelineId = `logs-azure.${suf}-default`;
  const { processors, on_failure } = buildPipeline({
    cloud: "azure",
    ns: "azure",
    group,
    pipelineId,
  });
  entries.push({ suf, full, sid, group, pipelineId, processors, on_failure });
}
entries.sort((a, b) => a.suf.localeCompare(b.suf));

const header = `/**
 * Custom ingest pipelines for Azure load-generator data streams logs-azure.{suffix}-default.
 *
 * Each pipeline includes:
 *   • JSON parse from message → Azure field extraction
 *   • Azure identity extraction (identity.claims → user.email, callerIpAddress → source.ip)
 *   • Group-aware ECS normalisation (event.kind / category / type)
 *   • Log-level normalisation (lowercase)
 *   • Duration → nanosecond conversion
 *   • GeoIP enrichment on source.ip / client.ip / destination.ip
 *   • User-agent parsing on user_agent.original
 *   • related.ip / related.user / related.hosts population
 *   • Outcome-driven event.type override (failure → error)
 *   • Error field extraction from parsed JSON
 *   • Cleanup of intermediate fields
 *   • on_failure error tagging
 *
 * Generated — run: npx vite-node scripts/generate-azure-pipeline-registry.mjs
 */

`;

const body = `export const PIPELINE_REGISTRY = ${JSON.stringify(
  entries.map((e) => ({
    id: e.pipelineId,
    dataset: e.full,
    group: e.group,
    description: `Enrich and normalise Azure ${e.full.replace("azure.", "")} logs (${e.sid})`,
    processors: e.processors,
    on_failure: e.on_failure,
  })),
  null,
  2
)};\n`;

writeFileSync(outPath, header + body, "utf8");
console.log(`Wrote ${entries.length} enhanced pipelines to ${path.relative(root, outPath)}`);
