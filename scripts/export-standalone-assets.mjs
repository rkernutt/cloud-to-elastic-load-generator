#!/usr/bin/env node
/**
 * Exports all installer assets (pipelines, ML jobs, rules, dashboards) into
 * individual standalone JSON files under the `assets/` directory tree.
 *
 * Usage:  node scripts/export-standalone-assets.mjs
 *
 * Output structure:
 *   assets/
 *     aws/
 *       pipelines/   — one JSON per ingest pipeline (PUT _ingest/pipeline/{id})
 *       ml-jobs/     — one JSON per ML job (PUT _ml/anomaly_detectors/{id})
 *       rules/       — one JSON per alerting rule (POST api/alerting/rule)
 *       dashboards/  — one JSON per Kibana dashboard (saved-object NDJSON)
 *     gcp/           — same structure
 *     azure/         — same structure
 */

import { mkdir, writeFile, readFile, readdir, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "../..");
const ASSETS = join(ROOT, "assets");

const CLOUDS = [
  { id: "aws", pipelineReg: "installer/aws-custom-pipelines/pipelines/registry.mjs" },
  { id: "gcp", pipelineReg: "installer/gcp-custom-pipelines/pipelines/registry.mjs" },
  { id: "azure", pipelineReg: "installer/azure-custom-pipelines/pipelines/registry.mjs" },
];

function safeFilename(id) {
  return id.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

async function writeJson(filePath, obj) {
  await writeFile(filePath, JSON.stringify(obj, null, 2) + "\n");
}

// ── Pipelines ─────────────────────────────────────────────────────────────────

async function exportPipelines(cloud) {
  const regPath = join(ROOT, cloud.pipelineReg);
  const mod = await import(regPath);
  const registry = mod.PIPELINE_REGISTRY;
  const dir = join(ASSETS, cloud.id, "pipelines");
  await ensureDir(dir);

  let count = 0;
  for (const entry of registry) {
    const body = {
      description: entry.description || `Ingest pipeline for ${entry.dataset}`,
      processors: entry.processors,
    };
    if (entry.on_failure) body.on_failure = entry.on_failure;

    const filename = `${safeFilename(entry.id)}.json`;
    await writeJson(join(dir, filename), {
      _meta: {
        pipeline_id: entry.id,
        dataset: entry.dataset,
        group: entry.group,
        api: `PUT _ingest/pipeline/${entry.id}`,
      },
      ...body,
    });
    count++;
  }
  return count;
}

// ── ML Jobs ───────────────────────────────────────────────────────────────────

async function exportMlJobs(cloud) {
  const jobDir = join(ROOT, `installer/${cloud.id}-custom-ml-jobs/jobs`);
  const outDir = join(ASSETS, cloud.id, "ml-jobs");
  await ensureDir(outDir);

  let files;
  try {
    files = (await readdir(jobDir)).filter((f) => f.endsWith(".json"));
  } catch {
    return 0;
  }

  let count = 0;
  for (const file of files) {
    const data = JSON.parse(await readFile(join(jobDir, file), "utf-8"));
    const jobs = data.jobs || [];
    for (const entry of jobs) {
      const jobBody = {
        _meta: {
          job_id: entry.id,
          group: data.group,
          api_job: `PUT _ml/anomaly_detectors/${entry.id}`,
          api_datafeed: `PUT _ml/datafeeds/datafeed-${entry.id}`,
          api_open: `POST _ml/anomaly_detectors/${entry.id}/_open`,
          api_start: `POST _ml/datafeeds/datafeed-${entry.id}/_start`,
        },
        job: entry.job,
        datafeed: {
          datafeed_id: `datafeed-${entry.id}`,
          job_id: entry.id,
          ...entry.datafeed,
        },
      };
      const filename = `${safeFilename(entry.id)}.json`;
      await writeJson(join(outDir, filename), jobBody);
      count++;
    }
  }
  return count;
}

// ── Alerting Rules ────────────────────────────────────────────────────────────

async function exportRules(cloud) {
  const ruleDir = join(ROOT, `installer/${cloud.id}-custom-rules`);
  const outDir = join(ASSETS, cloud.id, "rules");
  await ensureDir(outDir);

  let files;
  try {
    files = (await readdir(ruleDir)).filter((f) => f.endsWith(".json"));
  } catch {
    return 0;
  }

  let count = 0;
  for (const file of files) {
    const data = JSON.parse(await readFile(join(ruleDir, file), "utf-8"));
    const rules = data.rules || [];
    for (const rule of rules) {
      const { id, ...ruleBody } = rule;
      const out = {
        _meta: {
          rule_id: id,
          group: data.group,
          api: "POST /api/alerting/rule",
        },
        ...ruleBody,
      };
      const filename = `${safeFilename(id || rule.name)}.json`;
      await writeJson(join(outDir, filename), out);
      count++;
    }
  }
  return count;
}

// ── Dashboards ────────────────────────────────────────────────────────────────

async function exportDashboards(cloud) {
  const srcDir = join(ROOT, `installer/${cloud.id}-custom-dashboards`);
  const outDir = join(ASSETS, cloud.id, "dashboards");
  await ensureDir(outDir);

  let files;
  try {
    files = (await readdir(srcDir)).filter((f) => f.endsWith(".json"));
  } catch {
    return 0;
  }

  let count = 0;
  for (const file of files) {
    await copyFile(join(srcDir, file), join(outDir, file));
    count++;
  }
  return count;
}

// ── Workflows ─────────────────────────────────────────────────────────────────

async function exportWorkflows() {
  const srcDir = join(ROOT, "workflows");
  const outDir = join(ASSETS, "workflows");
  await ensureDir(outDir);

  let files;
  try {
    files = (await readdir(srcDir)).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  } catch {
    return 0;
  }

  let count = 0;
  for (const file of files) {
    await copyFile(join(srcDir, file), join(outDir, file));
    count++;
  }
  return count;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Exporting standalone assets to assets/ …\n");

  const totals = { pipelines: 0, mlJobs: 0, rules: 0, dashboards: 0, workflows: 0 };

  for (const cloud of CLOUDS) {
    const p = await exportPipelines(cloud);
    const m = await exportMlJobs(cloud);
    const r = await exportRules(cloud);
    const d = await exportDashboards(cloud);
    totals.pipelines += p;
    totals.mlJobs += m;
    totals.rules += r;
    totals.dashboards += d;
    console.log(`  ${cloud.id}: ${p} pipelines, ${m} ML jobs, ${r} rules, ${d} dashboards`);
  }

  totals.workflows = await exportWorkflows();
  console.log(`  workflows: ${totals.workflows} Kibana Workflow YAML(s)`);

  console.log(
    `\nTotal: ${totals.pipelines} pipelines, ${totals.mlJobs} ML jobs, ${totals.rules} rules, ${totals.dashboards} dashboards, ${totals.workflows} workflows`
  );
  console.log(`Output: ${ASSETS}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
