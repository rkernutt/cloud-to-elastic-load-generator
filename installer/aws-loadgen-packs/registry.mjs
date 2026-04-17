/**
 * Per-service "loadgen integration packs": ingest pipeline + Kibana dashboard + ML jobs.
 * Asset membership is derived from installer assets and src/data/elasticMaps.ts.
 *
 * Each pack bundles:
 *   - Ingest pipeline(s) — both log parsers and cloudloadgen-tagged metric pipelines
 *   - Kibana dashboard(s) — targeting data streams, tagged with cloudloadgen
 *   - ML anomaly detection jobs — grouped under cloudloadgen, datafeeds on data streams
 */

import { readFileSync, readdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { PIPELINE_REGISTRY } from "../aws-custom-pipelines/pipelines/registry.mjs";
import { loadDashboards } from "../aws-custom-dashboards/installLib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "../..");
const ELASTIC_MAPS_TS = join(REPO_ROOT, "src/data/elasticMaps.ts");
const ML_JOBS_DIR = join(REPO_ROOT, "installer/aws-custom-ml-jobs/jobs");
const DASHBOARDS_DIR = join(REPO_ROOT, "installer/aws-custom-dashboards");

/** Pipeline registry `dataset` values that do not reverse-resolve from elasticMaps; map to loadgen service IDs. */
const DATASET_TO_SERVICE_FALLBACK = {
  "aws.s3storagelens": ["storagelens"],
};

/**
 * Parse `ELASTIC_DATASET_MAP` and `ELASTIC_METRICS_DATASET_MAP` object literals from elasticMaps.ts.
 */
export function parseElasticMapsFile(path = ELASTIC_MAPS_TS) {
  const lines = readFileSync(path, "utf8").split("\n");
  const logsMap = {};
  const metricsMap = {};
  let mode = null;
  const keyVal = /^\s*([a-zA-Z0-9_]+)\s*:\s*"([^"]+)"\s*,?\s*$/;

  for (const line of lines) {
    if (line.includes("const ELASTIC_DATASET_MAP = {")) {
      mode = "logs";
      continue;
    }
    if (mode === "logs" && /^\s*\}\s*;\s*$/.test(line)) {
      mode = null;
      continue;
    }
    if (line.includes("const ELASTIC_METRICS_DATASET_MAP = {")) {
      mode = "metrics";
      continue;
    }
    if (mode === "metrics" && /^\s*\}\s*;\s*$/.test(line)) {
      break;
    }
    const m = line.match(keyVal);
    if (m && mode === "logs") logsMap[m[1]] = m[2];
    if (m && mode === "metrics") metricsMap[m[1]] = m[2];
  }

  return { logsMap, metricsMap };
}

export function buildDatasetToServiceIds(logsMap, metricsMap) {
  const inv = new Map();
  const add = (dataset, serviceId) => {
    if (!inv.has(dataset)) inv.set(dataset, []);
    const arr = inv.get(dataset);
    if (!arr.includes(serviceId)) arr.push(serviceId);
  };
  for (const [serviceId, ds] of Object.entries(logsMap)) add(ds, serviceId);
  for (const [serviceId, ds] of Object.entries(metricsMap)) add(ds, serviceId);
  return inv;
}

/** Recursively collect `event.dataset` / `data_stream.dataset` values from a datafeed query. */
export function collectDatasetsFromQuery(query) {
  const out = new Set();
  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (node.term && typeof node.term === "object") {
      for (const [k, v] of Object.entries(node.term)) {
        if ((k === "event.dataset" || k === "data_stream.dataset") && typeof v === "string") {
          out.add(v);
        }
      }
    }
    for (const x of Object.values(node)) {
      if (Array.isArray(x)) x.forEach(walk);
      else if (x && typeof x === "object") walk(x);
    }
  }
  walk(query);
  return [...out];
}

export function resolveServiceIdsForDataset(dataset, inv) {
  if (inv.has(dataset)) return inv.get(dataset);
  const fb = DATASET_TO_SERVICE_FALLBACK[dataset];
  if (fb) return [...fb];

  if (!dataset.startsWith("aws.")) return [];

  const tail = dataset.slice(4);
  const variants = new Set([
    tail,
    tail.replace(/_logs$/, ""),
    tail.replace(/_metrics$/, ""),
    tail.replace(/_findings$/, ""),
  ]);

  const out = [];
  for (const v of variants) {
    if (/^[a-z0-9]+$/.test(v)) out.push(v);
  }
  return [...new Set(out)];
}

function loadAllMlJobDefs() {
  const files = readdirSync(ML_JOBS_DIR).filter((f) => f.endsWith("-jobs.json"));
  const jobs = [];
  for (const file of files.sort()) {
    const parsed = JSON.parse(readFileSync(join(ML_JOBS_DIR, file), "utf8"));
    for (const j of parsed.jobs ?? []) {
      jobs.push(j);
    }
  }
  return jobs;
}

/**
 * @returns {Map<string, { serviceId: string, pipeline: object | null, dashboard: object | null, mlJobs: object[] }>}
 */
export function buildPackIndex() {
  const { logsMap, metricsMap } = parseElasticMapsFile();
  const inv = buildDatasetToServiceIds(logsMap, metricsMap);

  const dashboards = loadDashboards(DASHBOARDS_DIR);
  const dashByService = new Map();
  for (const d of dashboards) {
    const sid = d.file.replace(/-dashboard\.json$/, "");
    dashByService.set(sid, d);
  }

  const packs = new Map();

  function ensurePack(serviceId) {
    if (!packs.has(serviceId)) {
      packs.set(serviceId, {
        serviceId,
        pipeline: null,
        pipelines: [],
        dashboard: dashByService.get(serviceId) ?? null,
        mlJobs: [],
      });
    }
    return packs.get(serviceId);
  }

  for (const sid of dashByService.keys()) {
    ensurePack(sid);
  }

  for (const pipeline of PIPELINE_REGISTRY) {
    const datasets = [pipeline.dataset].filter(Boolean);
    const serviceIds = new Set();
    for (const ds of datasets) {
      for (const sid of resolveServiceIdsForDataset(ds, inv)) serviceIds.add(sid);
    }
    for (const sid of serviceIds) {
      const p = ensurePack(sid);
      if (!p.pipeline) p.pipeline = pipeline;
      // Collect all pipelines (including cloudloadgen-tagged ones)
      if (!p.pipelines.some((existing) => existing.id === pipeline.id)) {
        p.pipelines.push(pipeline);
      }
    }
  }

  for (const jobDef of loadAllMlJobDefs()) {
    const datasets = collectDatasetsFromQuery(jobDef.datafeed?.query);
    const serviceIds = new Set();
    for (const ds of datasets) {
      for (const sid of resolveServiceIdsForDataset(ds, inv)) serviceIds.add(sid);
    }
    for (const sid of serviceIds) {
      const p = ensurePack(sid);
      p.mlJobs.push(jobDef);
    }
  }

  for (const p of packs.values()) {
    const seen = new Set();
    p.mlJobs = p.mlJobs.filter((j) => {
      if (seen.has(j.id)) return false;
      seen.add(j.id);
      return true;
    });
  }

  return packs;
}

export function listServiceIds(packs = buildPackIndex()) {
  return [...packs.keys()].sort((a, b) => a.localeCompare(b));
}

/** Summarize what a pack would install (for menu labels). */
export function packSummary(pack) {
  const parts = [];
  const pipelineCount = pack.pipelines?.length || (pack.pipeline ? 1 : 0);
  if (pipelineCount > 0) parts.push(`${pipelineCount} pipeline(s)`);
  if (pack.dashboard) parts.push("dashboard");
  if (pack.mlJobs.length) parts.push(`${pack.mlJobs.length} ML job(s)`);
  return parts.length ? parts.join(", ") : "empty";
}
