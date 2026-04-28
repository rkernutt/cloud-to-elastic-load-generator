/**
 * Generates installer/gcp-custom-pipelines/pipelines/registry.mjs from
 * src/gcp/data/elasticMaps.ts + serviceGroups.ts (single source of truth).
 *
 * Each pipeline includes:
 *   • JSON parse from message → field extraction
 *   • GCP identity extraction (protoPayload.authenticationInfo → user.email)
 *   • Group-aware ECS normalisation
 *   • GeoIP, user-agent, related fields, duration conversion
 *   • on_failure error tagging
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
const { buildPipeline } = await import(path.join(root, "installer/shared/pipeline-processors.mjs"));

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
  const group = sidToGroup[sid] ?? "misc";
  const pipelineId = `logs-gcp.${suf}-default`;
  const { processors, on_failure } = buildPipeline({
    cloud: "gcp",
    ns: "gcp",
    group,
    pipelineId,
  });
  entries.push({ suf, full, sid, group, pipelineId, processors, on_failure });
}
entries.sort((a, b) => a.suf.localeCompare(b.suf));

const header = `/**
 * Registry of custom Elasticsearch ingest pipelines for GCP data streams
 * produced by the GCP load generator (logs-gcp.{suffix}-default).
 *
 * Each pipeline includes:
 *   • JSON parse from message → GCP field extraction
 *   • GCP identity extraction (protoPayload → user.email / source.ip)
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
 * **Generated file** — edit src/gcp/data/elasticMaps.ts or serviceGroups.ts,
 * then run:  npx vite-node scripts/generate-gcp-pipeline-registry.mjs
 */

`;

const body = `export const PIPELINE_REGISTRY = ${JSON.stringify(
  entries.map((e) => ({
    id: e.pipelineId,
    dataset: e.full,
    group: e.group,
    description: `Enrich and normalise GCP ${e.full.replace("gcp.", "")} logs (service ${e.sid})`,
    processors: e.processors,
    on_failure: e.on_failure,
  })),
  null,
  2
)};\n`;

writeFileSync(outPath, header + body, "utf8");
console.log(`Wrote ${entries.length} enhanced pipeline entries to ${path.relative(root, outPath)}`);
