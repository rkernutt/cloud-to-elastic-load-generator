/**
 * Adds baseline installer assets for load-generator services that do not yet have
 * a custom dashboard (and optional ML failure-spike jobs) for their log dataset.
 *
 * Does not remove or overwrite existing *-dashboard.json files.
 *
 * Usage:
 *   npx vite-node scripts/generate-minimal-coverage-installer-assets.mjs
 *   npx vite-node scripts/generate-minimal-coverage-installer-assets.mjs --dashboards-only
 *   npx vite-node scripts/generate-minimal-coverage-installer-assets.mjs --vendor aws
 *
 * After adding AWS dashboards, run: npm run generate:aws-dashboards:ndjson
 *
 * Skips services whose log \`event.dataset\` already has an official Elastic
 * Fleet **logs** data stream (see src/data/elasticOfficialIntegrationDatasets.json),
 * including **aliases** in src/data/officialIntegrationLogDatasetAliases.ts when
 * the simulator uses a different suffix than the Fleet package.
 *
 * On each run, redundant **minimal** dashboards (title suffix ` — overview`) and
 * stale rows in minimal-coverage ML job files are removed when coverage applies.
 */
import { writeFileSync, existsSync, readFileSync, mkdirSync, unlinkSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = new Set(process.argv.slice(2));
const dashboardsOnly = argv.has("--dashboards-only");
const vendorArg = [...argv].find((a) => a.startsWith("--vendor="));
const vendorFilter = vendorArg ? vendorArg.split("=")[1] : null;

function humanTitle(vendor, sid) {
  const words = sid.split(/[-_]/g).filter(Boolean);
  const h = words.map((w) => w.slice(0, 1).toUpperCase() + w.slice(1)).join(" ");
  const prefix = vendor === "aws" ? "AWS" : vendor === "gcp" ? "GCP" : "Azure";
  return `${prefix} ${h} — overview`;
}

function lensMetric(uid, grid, query, column) {
  return {
    type: "lens",
    uid,
    grid,
    config: {
      title: "",
      attributes: {
        type: "metric",
        dataset: { type: "esql", query },
        metrics: [{ type: "primary", operation: "value", column }],
      },
    },
  };
}

function lensDonut(uid, grid, title, query, metricCol, groupCol) {
  return {
    type: "lens",
    uid,
    grid,
    config: {
      title,
      attributes: {
        type: "donut",
        dataset: { type: "esql", query },
        metrics: [{ operation: "value", column: metricCol }],
        group_by: [{ operation: "value", column: groupCol }],
      },
    },
  };
}

function lensLine(uid, grid, title, query, xCol, ySpec) {
  return {
    type: "lens",
    uid,
    grid,
    config: {
      title,
      attributes: {
        type: "xy",
        axis: {
          x: { title: { visible: false } },
          left: { title: { visible: false } },
        },
        layers: [
          {
            type: "line",
            dataset: { type: "esql", query },
            x: { operation: "value", column: xCol },
            y: ySpec.map(([col, label]) => ({ operation: "value", column: col, label })),
          },
        ],
      },
    },
  };
}

function lensTable(uid, grid, title, query, metrics) {
  return {
    type: "lens",
    uid,
    grid,
    config: {
      title,
      attributes: {
        type: "datatable",
        dataset: { type: "esql", query },
        metrics: metrics.map(([col, label]) => ({ operation: "value", column: col, label })),
        rows: [],
      },
    },
  };
}

function minimalDashboard(vendor, sid, dataset) {
  const idx = `logs-${dataset}*`;
  const q = (sql) => `FROM ${idx} | ${sql}`;
  const slug = sid.replace(/[^a-z0-9]+/gi, "").slice(0, 12) || "svc";
  const pfx = `${vendor.charAt(0)}${slug}`;
  return {
    title: humanTitle(vendor, sid),
    time_range: { from: "now-24h", to: "now" },
    panels: [
      lensMetric(`${pfx}k1`, { x: 0, y: 0, w: 12, h: 5 }, q("STATS c = COUNT()"), "c"),
      lensDonut(
        `${pfx}d1`,
        { x: 0, y: 5, w: 16, h: 10 },
        "Outcome",
        q("STATS c = COUNT() BY o = event.outcome"),
        "c",
        "o"
      ),
      lensLine(
        `${pfx}l1`,
        { x: 0, y: 15, w: 48, h: 10 },
        "Event volume",
        q("STATS c = COUNT() BY b = BUCKET(@timestamp, 75, ?_tstart, ?_tend) | SORT b"),
        "b",
        [["c", "Events"]]
      ),
      lensTable(
        `${pfx}t1`,
        { x: 0, y: 25, w: 48, h: 12 },
        "By region",
        q(
          "STATS c = COUNT() BY region = COALESCE(cloud.region, \"unknown\") | SORT c DESC | LIMIT 15"
        ),
        [
          ["region", "Region"],
          ["c", "Count"],
        ]
      ),
    ],
  };
}

/** @param {unknown} job */
function extractDatasetFromMinimalMlJob(job) {
  if (!job || typeof job !== "object") return null;
  const created = job.job?.custom_settings?.created_by;
  if (typeof created !== "string" || !created.endsWith("-load-generator-minimal-coverage"))
    return null;
  const filters = job.datafeed?.query?.bool?.filter;
  if (!Array.isArray(filters)) return null;
  for (const f of filters) {
    if (f?.term && typeof f.term["event.dataset"] === "string") return f.term["event.dataset"];
  }
  return null;
}

function loadOfficialLogDatasets(vendor) {
  const p = path.join(root, "src/data/elasticOfficialIntegrationDatasets.json");
  if (!existsSync(p)) {
    throw new Error(
      `Missing ${p}; run: npx vite-node scripts/sync-elastic-official-integrations.mjs`
    );
  }
  const doc = JSON.parse(readFileSync(p, "utf8"));
  const streams = doc.packages?.[vendor]?.dataStreams ?? [];
  return new Set(streams.filter((r) => r.dataStreamType === "logs").map((r) => r.dataset));
}

function mlJob(vendor, sid, dataset) {
  const prefix = vendor === "aws" ? "aws" : vendor === "gcp" ? "gcp" : "azure";
  const indices = [`logs-${prefix}.*`];
  const safeId = `${prefix}-${sid}`.replace(/[^a-z0-9-]+/gi, "-").replace(/-+/g, "-").toLowerCase();
  const jobId = `${safeId}-failure-spike`.slice(0, 100);
  return {
    id: jobId,
    description: `Unusual spike in failure events for ${dataset} (load generator baseline)`,
    job: {
      description: `Unusual spike in failure events for ${dataset}`,
      groups: [prefix, "minimal-coverage"],
      analysis_config: {
        bucket_span: "15m",
        detectors: [
          {
            detector_description: `high_count partitionfield=cloud.region ${dataset}`,
            function: "high_count",
            partition_field_name: "cloud.region",
            detector_index: 0,
          },
        ],
        influencers: ["cloud.region", "event.outcome"],
      },
      allow_lazy_open: true,
      analysis_limits: { model_memory_limit: "32mb" },
      data_description: { time_field: "@timestamp" },
      custom_settings: { created_by: `${prefix}-load-generator-minimal-coverage` },
    },
    datafeed: {
      indices,
      max_empty_searches: 10,
      query: {
        bool: {
          filter: [{ term: { "event.dataset": dataset } }, { term: { "event.outcome": "failure" } }],
        },
      },
      chunking_config: { mode: "auto" },
      query_delay: "60s",
      delayed_data_check_config: { enabled: true },
    },
  };
}

async function runVendor(vendor, generatorsMod, mapMod, dashDir, mlRelDir) {
  const officialLogs = loadOfficialLogDatasets(vendor);
  const { isSyntheticDatasetCoveredByOfficialLogs } = await import(
    path.join(root, "src/data/officialIntegrationLogDatasetAliases.ts")
  );
  const gens = await import(generatorsMod);
  const maps = await import(mapMod);
  const GENERATORS =
    vendor === "aws"
      ? gens.GENERATORS
      : vendor === "gcp"
        ? gens.GCP_GENERATORS
        : gens.AZURE_GENERATORS;
  const ELASTIC_DATASET_MAP =
    vendor === "aws"
      ? maps.ELASTIC_DATASET_MAP
      : vendor === "gcp"
        ? maps.GCP_ELASTIC_DATASET_MAP
        : maps.AZURE_ELASTIC_DATASET_MAP;

  const prefix = vendor === "aws" ? "aws" : vendor === "gcp" ? "gcp" : "azure";
  let dashCount = 0;
  let prunedDash = 0;
  const newJobs = [];

  mkdirSync(path.join(root, dashDir), { recursive: true });

  for (const sid of Object.keys(GENERATORS).sort()) {
    const ds = ELASTIC_DATASET_MAP[sid];
    if (typeof ds !== "string" || !ds.startsWith(`${prefix}.`)) continue;
    if (!isSyntheticDatasetCoveredByOfficialLogs(vendor, ds, officialLogs)) continue;
    const outFile = path.join(root, dashDir, `${sid}-dashboard.json`);
    if (!existsSync(outFile)) continue;
    try {
      const parsed = JSON.parse(readFileSync(outFile, "utf8"));
      if (typeof parsed.title === "string" && parsed.title.endsWith(" — overview")) {
        unlinkSync(outFile);
        prunedDash++;
      }
    } catch {
      /* keep */
    }
  }

  for (const sid of Object.keys(GENERATORS).sort()) {
    const ds = ELASTIC_DATASET_MAP[sid];
    if (typeof ds !== "string" || !ds.startsWith(`${prefix}.`)) continue;
    if (isSyntheticDatasetCoveredByOfficialLogs(vendor, ds, officialLogs)) continue;
    const outFile = path.join(root, dashDir, `${sid}-dashboard.json`);
    if (existsSync(outFile)) continue;
    const dash = minimalDashboard(vendor, sid, ds);
    writeFileSync(outFile, JSON.stringify(dash, null, 2) + "\n", "utf8");
    dashCount++;
    if (!dashboardsOnly) newJobs.push(mlJob(vendor, sid, ds));
  }

  if (!dashboardsOnly) {
    const mlDir = path.join(root, mlRelDir);
    const groupPath = path.join(mlDir, "minimal-coverage-jobs.json");
    let existing = [];
    if (existsSync(groupPath)) {
      try {
        existing = JSON.parse(readFileSync(groupPath, "utf8")).jobs || [];
      } catch {
        existing = [];
      }
    }
    let merged = existing.filter((job) => {
      const jobDs = extractDatasetFromMinimalMlJob(job);
      if (!jobDs) return true;
      return !isSyntheticDatasetCoveredByOfficialLogs(vendor, jobDs, officialLogs);
    });
    const seen = new Set(merged.map((j) => j.id));
    for (const j of newJobs) {
      if (!seen.has(j.id)) {
        seen.add(j.id);
        merged.push(j);
      }
    }
    const doc = {
      group: "minimal-coverage",
      description:
        "Auto-generated baseline ML jobs (failure count by region) for services that received minimal dashboards",
      jobs: merged,
    };
    mkdirSync(mlDir, { recursive: true });
    writeFileSync(groupPath, JSON.stringify(doc, null, 2) + "\n", "utf8");
    console.log(`${vendor}: wrote ${merged.length} ML job(s) in ${path.relative(root, groupPath)}`);
  }

  const pruneMsg = prunedDash ? `, pruned ${prunedDash} redundant minimal dashboard(s)` : "";
  console.log(`${vendor}: created ${dashCount} minimal dashboard(s) under ${dashDir}${pruneMsg}`);
}

const vendors = vendorFilter ? [vendorFilter] : ["aws", "gcp", "azure"];

for (const v of vendors) {
  if (v === "aws") {
    await runVendor(
      "aws",
      path.join(root, "src/aws/generators/index.ts"),
      path.join(root, "src/data/elasticMaps.ts"),
      "installer/aws-custom-dashboards",
      "installer/aws-custom-ml-jobs/jobs"
    );
  } else if (v === "gcp") {
    await runVendor(
      "gcp",
      path.join(root, "src/gcp/generators/index.ts"),
      path.join(root, "src/gcp/data/elasticMaps.ts"),
      "installer/gcp-custom-dashboards",
      "installer/gcp-custom-ml-jobs/jobs"
    );
  } else if (v === "azure") {
    await runVendor(
      "azure",
      path.join(root, "src/azure/generators/index.ts"),
      path.join(root, "src/azure/data/elasticMaps.ts"),
      "installer/azure-custom-dashboards",
      "installer/azure-custom-ml-jobs/jobs"
    );
  } else {
    console.error("Unknown vendor:", v);
    process.exit(1);
  }
}
