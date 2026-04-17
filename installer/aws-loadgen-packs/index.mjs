#!/usr/bin/env node
/**
 * AWS loadgen integration packs — install ingest pipeline, Kibana dashboard, and ML jobs
 * for one or more services in a single flow.
 *
 * Run: node installer/aws-loadgen-packs/index.mjs
 *      npm run setup:aws-loadgen-packs
 */

import readline from "readline";
import { createElasticClient as createEsPipelineClient } from "../aws-custom-pipelines/elastic.mjs";
import { createElasticClient as createMlClient } from "../aws-custom-ml-jobs/mlClient.mjs";
import {
  createKibanaClient,
  installOne as installDashboardOne,
} from "../aws-custom-dashboards/installLib.mjs";
import { buildPackIndex, listServiceIds, packSummary } from "./registry.mjs";

function createReadline() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function prompt(rl, question) {
  return new Promise((resolve) => {
    rl.write(null, { ctrl: true, name: "u" });
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function printHeader() {
  console.log("");
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║   AWS loadgen integration packs (pipeline + dash + ML)    ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log("Installs, per service: custom ingest pipeline (if any), Kibana");
  console.log("dashboard (if any), and ML anomaly jobs tied to that service.");
  console.log("");
}

const DEPLOYMENT_TYPES = [
  { id: "self-managed", label: "Self-Managed  (on-premises, Docker, VM)" },
  { id: "cloud-hosted", label: "Elastic Cloud Hosted  (cloud.elastic.co)" },
  { id: "serverless", label: "Elastic Serverless  (cloud.elastic.co/serverless)" },
];

async function promptDeploymentType(rl) {
  console.log("Select your Elastic deployment type:");
  console.log("");
  DEPLOYMENT_TYPES.forEach(({ label }, i) => console.log(`  ${i + 1}. ${label}`));
  console.log("");

  while (true) {
    const input = await prompt(rl, "Enter 1, 2, or 3:\n> ");
    const idx = parseInt(input, 10) - 1;
    if (idx >= 0 && idx < DEPLOYMENT_TYPES.length) return DEPLOYMENT_TYPES[idx].id;
    console.error("  Please enter 1, 2, or 3.");
  }
}

function getEsUrlExample(deploymentType) {
  if (deploymentType === "self-managed")
    return "http://localhost:9200  or  https://elasticsearch.yourdomain.internal:9200";
  if (deploymentType === "serverless")
    return "https://my-deployment.es.eu-west-2.aws.elastic.cloud";
  return "https://my-deployment.es.us-east-1.aws.elastic-cloud.com:9243";
}

function getKibanaUrlExample(deploymentType) {
  if (deploymentType === "self-managed")
    return "http://localhost:5601  or  https://kibana.yourdomain.internal:5601";
  if (deploymentType === "serverless")
    return "https://my-deployment.kb.eu-west-2.aws.elastic.cloud";
  return "https://my-deployment.kibana.us-east-1.aws.elastic-cloud.com:9243";
}

async function maybeSkipTls(rl, deploymentType) {
  if (deploymentType !== "self-managed") return;

  const answer = await prompt(
    rl,
    "Skip TLS certificate verification? Required for self-signed / internal CA certs. (y/N):\n> "
  );
  if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    console.log("  ⚠  TLS verification disabled — ensure you trust this endpoint.");
  }
  console.log("");
}

/**
 * Create TSDS-compatible component templates and composable index templates
 * for cloudloadgen metrics data streams. These enable time_series mode for
 * metrics-aws.* indices with proper dimension and metric field routing.
 */
async function ensureTsdsTemplates(esClient, packs) {
  console.log("\n── TSDS index templates ──\n");
  let ok = 0,
    skip = 0,
    fail = 0;

  // Common TSDS settings component template
  const tsdsComponentId = "cloudloadgen-tsds-settings";
  try {
    const existing = await esClient.getComponentTemplate(tsdsComponentId);
    if (existing !== null) {
      console.log(`  ✓ ${tsdsComponentId} — already exists`);
      skip++;
    } else {
      await esClient.putComponentTemplate(tsdsComponentId, {
        template: {
          settings: {
            index: {
              mode: "time_series",
              routing_path: ["cloud.account.id", "cloud.region"],
              sort: { field: ["@timestamp"], order: ["desc"] },
            },
          },
        },
        _meta: {
          created_by: "cloudloadgen",
          description: "TSDS settings for cloudloadgen metrics",
        },
      });
      console.log(`  ✓ ${tsdsComponentId} — created`);
      ok++;
    }
  } catch (err) {
    console.warn(`  ⚠  ${tsdsComponentId}: ${err.message}`);
    fail++;
  }

  // Per-service TSDS index templates
  const metricsServices = new Set();
  for (const pack of packs) {
    const pipelines = pack.pipelines?.length ? pack.pipelines : [];
    for (const p of pipelines) {
      if (p.group === "cloudloadgen-metrics" && p.dataset) {
        metricsServices.add({ serviceId: pack.serviceId, dataset: p.dataset });
      }
    }
  }

  for (const { serviceId, dataset } of metricsServices) {
    const templateId = `metrics-${dataset}-cloudloadgen`;
    try {
      const existing = await esClient.getIndexTemplate(templateId);
      if (existing !== null) {
        console.log(`  ✓ ${serviceId}: ${templateId} — already exists`);
        skip++;
        continue;
      }
      await esClient.putIndexTemplate(templateId, {
        index_patterns: [`metrics-${dataset}-*`],
        data_stream: {},
        composed_of: [tsdsComponentId],
        priority: 200,
        _meta: { created_by: "cloudloadgen", service: serviceId },
      });
      console.log(`  ✓ ${serviceId}: ${templateId} — created`);
      ok++;
    } catch (err) {
      console.warn(`  ⚠  ${serviceId}: ${templateId} — ${err.message} (TSDS may not be supported)`);
      fail++;
    }
  }

  if (metricsServices.size === 0) console.log("  (no TSDS templates needed)");
  console.log("");
  return { ok, skip, fail };
}

async function ensureDataViews(kibana) {
  const DATA_VIEWS = [
    { title: "logs-*", name: "Logs (all)" },
    { title: "metrics-*", name: "Metrics (all)" },
  ];
  for (const { title, name } of DATA_VIEWS) {
    try {
      const existing = await kibana.findDataView(title);
      if (existing) console.log(`  ✓ ${title} — already exists`);
      else {
        await kibana.createDataView(title, "@timestamp", name);
        console.log(`  ✓ ${title} — created`);
      }
    } catch (err) {
      console.warn(`  ⚠  Could not create data view "${title}": ${err.message}`);
    }
  }
}

async function installPipelinesForPacks(esClient, packs) {
  console.log("\n── Ingest pipelines ──\n");
  let ok = 0,
    skip = 0,
    fail = 0;
  for (const pack of packs) {
    const pipelines = pack.pipelines?.length
      ? pack.pipelines
      : pack.pipeline
        ? [pack.pipeline]
        : [];
    if (pipelines.length === 0) continue;
    for (const pipeline of pipelines) {
      const { id, processors, description } = pipeline;
      try {
        const existing = await esClient.getPipeline(id);
        if (existing !== null) {
          console.log(`  ✓ ${pack.serviceId}: ${id} — already installed, skipping`);
          skip++;
          continue;
        }
        await esClient.putPipeline(id, { description, processors });
        console.log(`  ✓ ${pack.serviceId}: ${id} — installed`);
        ok++;
      } catch (err) {
        console.error(`  ✗ ${pack.serviceId}: ${id} — ${err.message}`);
        fail++;
      }
    }
  }
  const hasPipelines = packs.some((p) => p.pipelines?.length || p.pipeline);
  if (!hasPipelines) console.log("  (no pipelines for selected services)");
  console.log("");
  return { ok, skip, fail };
}

async function installDashboardsForPacks(kibana, kibanaVersion, packs) {
  console.log("── Kibana dashboards ──\n");
  let ok = 0,
    skip = 0,
    fail = 0;
  for (const pack of packs) {
    if (!pack.dashboard) continue;
    const { title, definition, ndjson } = pack.dashboard;
    try {
      const outcome = await installDashboardOne(kibana, title, definition, ndjson, kibanaVersion);
      if (outcome.status === "skipped") {
        console.log(`  ✓ ${pack.serviceId}: "${title}" — already installed, skipping`);
        skip++;
      } else {
        console.log(
          `  ✓ ${pack.serviceId}: "${title}" — installed (${outcome.via}, id: ${outcome.id})`
        );
        ok++;
      }
    } catch (err) {
      console.error(`  ✗ ${pack.serviceId}: "${title}" — ${err.message}`);
      fail++;
    }
  }
  if (!packs.some((p) => p.dashboard)) console.log("  (no dashboards for selected services)");
  console.log("");
  return { ok, skip, fail };
}

async function installMlJobsForPackSelection(mlClient, allJobDefs) {
  console.log("── ML anomaly detection jobs ──\n");
  if (allJobDefs.length === 0) {
    console.log("  (no ML jobs for selected services)\n");
    return { installed: 0, skipped: 0, failed: 0, newlyInstalled: [] };
  }

  let installed = 0,
    skipped = 0,
    failed = 0;
  const newlyInstalled = [];

  for (const jobDef of allJobDefs) {
    const { id, job: jobConfig, datafeed: datafeedConfig } = jobDef;
    try {
      const existing = await mlClient.getJob(id);
      if (existing !== null) {
        console.log(`  ✓ ${id} — already installed, skipping`);
        skipped++;
        continue;
      }
      await mlClient.putJob(id, jobConfig);
      await mlClient.putDatafeed(id, { ...datafeedConfig, job_id: id });
      console.log(`  ✓ ${id} — installed`);
      installed++;
      newlyInstalled.push(id);
    } catch (err) {
      console.error(`  ✗ ${id} — ${err.message}`);
      failed++;
    }
  }
  console.log("");
  return { installed, skipped, failed, newlyInstalled };
}

async function maybeOpenMlJobs(mlClient, jobIds) {
  if (jobIds.length === 0) return;
  const rl = createReadline();
  const openAnswer = await new Promise((resolve) => {
    rl.question("Open new ML jobs and start datafeeds? (y/N):\n> ", (a) => {
      rl.close();
      resolve(a.trim().toLowerCase());
    });
  });

  if (openAnswer !== "y" && openAnswer !== "yes") {
    console.log(
      "\nJobs installed but not started. In Kibana: Machine Learning → Anomaly Detection → Jobs.\n"
    );
    return;
  }

  console.log("");
  for (const id of jobIds) {
    try {
      process.stdout.write(`  Opening ${id}...`);
      await mlClient.openJob(id);
      process.stdout.write(" starting datafeed...");
      await mlClient.startDatafeed(id);
      console.log(" done.");
    } catch (err) {
      console.log(` FAILED: ${err.message}`);
    }
  }
}

async function main() {
  printHeader();

  const packMap = buildPackIndex();
  const serviceIds = listServiceIds(packMap);
  if (serviceIds.length === 0) {
    console.log("No integration packs found. Exiting.");
    process.exit(0);
  }

  const rl = createReadline();

  const deploymentType = await promptDeploymentType(rl);
  console.log("");
  await maybeSkipTls(rl, deploymentType);

  const esUrl = await prompt(
    rl,
    `Elasticsearch URL (e.g. ${getEsUrlExample(deploymentType)}):\n> `
  );
  if (!esUrl) {
    console.error("No Elasticsearch URL. Exiting.");
    rl.close();
    process.exit(1);
  }
  if (deploymentType === "self-managed") {
    if (!esUrl.startsWith("http://") && !esUrl.startsWith("https://")) {
      console.error("URL must start with http:// or https://. Exiting.");
      rl.close();
      process.exit(1);
    }
  } else if (!esUrl.startsWith("https://")) {
    console.error("URL must start with https://. Exiting.");
    rl.close();
    process.exit(1);
  }

  const kibanaUrl = await prompt(
    rl,
    `\nKibana URL (e.g. ${getKibanaUrlExample(deploymentType)}):\n> `
  );
  if (!kibanaUrl) {
    console.error("No Kibana URL. Exiting.");
    rl.close();
    process.exit(1);
  }
  if (deploymentType === "self-managed") {
    if (!kibanaUrl.startsWith("http://") && !kibanaUrl.startsWith("https://")) {
      console.error("Kibana URL must start with http:// or https://. Exiting.");
      rl.close();
      process.exit(1);
    }
  } else if (!kibanaUrl.startsWith("https://")) {
    console.error("Kibana URL must start with https://. Exiting.");
    rl.close();
    process.exit(1);
  }

  const esApiKey = await prompt(rl, "\nElasticsearch API key (ingest + ML):\n> ");
  if (!esApiKey) {
    console.error("No API key. Exiting.");
    rl.close();
    process.exit(1);
  }

  const kibanaApiKey = await prompt(rl, "\nKibana API key (saved objects / dashboards):\n> ");
  if (!kibanaApiKey) {
    console.error("No Kibana API key. Exiting.");
    rl.close();
    process.exit(1);
  }

  const esClient = createEsPipelineClient(esUrl, esApiKey);
  const mlClient = createMlClient(esUrl, esApiKey);
  const kibana = createKibanaClient(kibanaUrl, kibanaApiKey);

  console.log("\nTesting Elasticsearch...");
  let isServerless = false;
  try {
    const clusterInfo = await mlClient.testConnection();
    const clusterName = clusterInfo?.cluster_name ?? "(unknown)";
    const version = clusterInfo?.version?.number ?? "";
    isServerless = clusterInfo?.version?.build_flavor === "serverless";
    console.log(
      `  Connected: ${clusterName}${version ? ` (${version})` : ""}${isServerless ? " [serverless]" : ""}`
    );
  } catch (err) {
    console.error(`  Connection failed: ${err.message}`);
    rl.close();
    process.exit(1);
  }

  if (isServerless) {
    console.log(
      "  Serverless — skipping strict ML preflight; unsupported stacks will fail per job."
    );
  } else {
    console.log("  Checking ML availability...");
    try {
      const mlInfo = await mlClient.getMlInfo();
      if (mlInfo === null || mlInfo?._not_available) {
        console.warn(
          "  ⚠  ML may be unavailable on this cluster. Job creation might fail without a suitable licence/project."
        );
      } else {
        console.log("  ML is available.");
      }
    } catch (err) {
      console.warn(`  ⚠  Could not verify ML: ${err.message}`);
    }
  }

  let kibanaVersion = "";
  console.log("\nTesting Kibana...");
  try {
    const status = await kibana.testConnection();
    kibanaVersion = status?.version?.number ?? "";
    const name = status?.name ?? "(unknown)";
    console.log(`  Connected: ${name}${kibanaVersion ? ` (${kibanaVersion})` : ""}`);
  } catch (err) {
    console.error(`  Connection failed: ${err.message}`);
    rl.close();
    process.exit(1);
  }

  console.log("\nIntegration packs (service → assets):\n");
  serviceIds.forEach((sid, i) => {
    const p = packMap.get(sid);
    console.log(`  ${String(i + 1).padStart(3)}. ${sid.padEnd(28)} ${packSummary(p)}`);
  });
  const allIdx = serviceIds.length + 1;
  console.log(`  ${String(allIdx).padStart(3)}. all services`);
  console.log("");

  const selectionInput = await prompt(rl, `Enter number(s) comma-separated, or "all":\n> `);
  rl.close();

  let selectedIds = [];
  if (selectionInput.toLowerCase() === "all") {
    selectedIds = [...serviceIds];
  } else {
    const tokens = selectionInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const seen = new Set();
    for (const token of tokens) {
      const num = parseInt(token, 10);
      if (isNaN(num) || num < 1 || num > allIdx) {
        console.warn(`  Warning: invalid selection "${token}" — skipping.`);
        continue;
      }
      if (num === allIdx) {
        selectedIds = [...serviceIds];
        break;
      }
      const sid = serviceIds[num - 1];
      if (!seen.has(sid)) {
        seen.add(sid);
        selectedIds.push(sid);
      }
    }
  }

  if (selectedIds.length === 0) {
    console.log("\nNothing selected. Exiting.");
    process.exit(0);
  }

  const selectedPacks = selectedIds.map((sid) => packMap.get(sid)).filter(Boolean);

  const mlById = new Map();
  for (const pack of selectedPacks) {
    for (const j of pack.mlJobs) mlById.set(j.id, j);
  }
  const mergedMlJobs = [...mlById.values()];

  console.log(`\nInstalling packs for: ${selectedIds.join(", ")}`);
  console.log("");

  await installPipelinesForPacks(esClient, selectedPacks);

  // TSDS index templates for cloudloadgen metrics
  await ensureTsdsTemplates(esClient, selectedPacks);

  console.log("── Data views ──\n");
  await ensureDataViews(kibana);
  console.log("");

  await installDashboardsForPacks(kibana, kibanaVersion, selectedPacks);

  const mlOutcome = await installMlJobsForPackSelection(mlClient, mergedMlJobs);
  console.log(
    `ML summary: ${mlOutcome.installed} installed, ${mlOutcome.skipped} skipped, ${mlOutcome.failed} failed.`
  );

  await maybeOpenMlJobs(mlClient, mlOutcome.newlyInstalled);
  console.log("Done.");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
