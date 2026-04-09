/**
 * Refresh src/data/elasticOfficialIntegrationDatasets.json from the public
 * elastic/integrations repo (AWS, GCP, Azure packages).
 *
 * Uses a shallow sparse clone under .cache/elastic-integrations unless
 * ELASTIC_INTEGRATIONS_PATH points at an existing checkout.
 *
 * Dataset resolution order per data_stream folder:
 * 1. sample_event.json → event.dataset or data_stream.dataset
 * 2. Fallback: {packageName}.{folder_name} (e.g. azure.application_gateway)
 *
 * Run: npx vite-node scripts/sync-elastic-official-integrations.mjs
 */
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outPath = path.join(root, "src/data/elasticOfficialIntegrationDatasets.json");
const defaultCache = path.join(root, ".cache/elastic-integrations");

function ensureRepo(repoPath) {
  if (existsSync(path.join(repoPath, ".git"))) return;
  mkdirSync(path.dirname(repoPath), { recursive: true });
  execSync(
    `git clone --depth 1 --filter=blob:none --sparse https://github.com/elastic/integrations.git "${repoPath}"`,
    { stdio: "inherit" }
  );
  execSync("git sparse-checkout set packages/aws packages/gcp packages/azure", {
    cwd: repoPath,
    stdio: "inherit",
  });
}

function readPackageVersion(pkgDir) {
  const manifest = path.join(pkgDir, "manifest.yml");
  if (!existsSync(manifest)) return null;
  const text = readFileSync(manifest, "utf8");
  const m = text.match(/^version:\s*"?([^"\s#]+)"?/m);
  return m ? m[1] : null;
}

function datasetsForPackage(repoRoot, pkgName) {
  const pkgDir = path.join(repoRoot, "packages", pkgName);
  const dsRoot = path.join(pkgDir, "data_stream");
  if (!existsSync(dsRoot)) return { version: null, dataStreams: [] };
  const version = readPackageVersion(pkgDir);
  const dataStreams = [];
  for (const folder of readdirSync(dsRoot).sort()) {
    const samplePath = path.join(dsRoot, folder, "sample_event.json");
    let dataset = null;
    let title = null;
    let dataStreamType = null;
    if (existsSync(samplePath)) {
      try {
        const ev = JSON.parse(readFileSync(samplePath, "utf8"));
        dataset = ev.event?.dataset || ev.data_stream?.dataset || null;
        dataStreamType = ev.data_stream?.type || null;
      } catch {
        /* ignore */
      }
    }
    if (!dataset) dataset = `${pkgName}.${folder}`;
    const manifestPath = path.join(dsRoot, folder, "manifest.yml");
    if (existsSync(manifestPath)) {
      const mt = readFileSync(manifestPath, "utf8");
      const tm = mt.match(/^title:\s*(.+)$/m);
      if (tm) title = tm[1].replace(/^["']|["']$/g, "").trim();
      const ty = mt.match(/^type:\s*(\S+)/m);
      if (ty && !dataStreamType) dataStreamType = ty[1];
    }
    dataStreams.push({
      folder,
      dataset,
      dataStreamType: dataStreamType || "unknown",
      title: title || folder,
    });
  }
  return { version, dataStreams };
}

const repoPath = process.env.ELASTIC_INTEGRATIONS_PATH || defaultCache;
if (!existsSync(path.join(repoPath, ".git")) && process.env.ELASTIC_INTEGRATIONS_PATH) {
  throw new Error(
    `ELASTIC_INTEGRATIONS_PATH must be a git checkout of elastic/integrations: ${repoPath}`
  );
}
ensureRepo(repoPath);

const generatedAt = new Date().toISOString();
const doc = {
  generatedAt,
  sourceRepository: "https://github.com/elastic/integrations",
  localCheckoutHint: "Set ELASTIC_INTEGRATIONS_PATH or use default .cache/elastic-integrations",
  packages: {
    aws: datasetsForPackage(repoPath, "aws"),
    gcp: datasetsForPackage(repoPath, "gcp"),
    azure: datasetsForPackage(repoPath, "azure"),
  },
};

const datasetsFlat = [];
for (const pkg of ["aws", "gcp", "azure"]) {
  for (const row of doc.packages[pkg].dataStreams) {
    datasetsFlat.push({ package: pkg, ...row });
  }
}
doc.datasets = datasetsFlat;

writeFileSync(outPath, JSON.stringify(doc, null, 2) + "\n", "utf8");
console.log(`Wrote ${datasetsFlat.length} data streams to ${path.relative(root, outPath)}`);
