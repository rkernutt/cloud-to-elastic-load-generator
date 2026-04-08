#!/usr/bin/env node
/**
 * GCP → Elastic Custom Pipeline Installer
 *
 * Installs Elasticsearch ingest pipelines for GCP load-generator data streams
 * (logs-gcp.{dataset}-default), including services beyond a minimal subset.
 *
 * Run with:  node index.mjs
 *            npm run setup:gcp-pipelines
 *
 * Registry is generated from src/gcp/data — see scripts/generate-gcp-pipeline-registry.mjs
 *
 * No external dependencies — uses Node.js built-ins only.
 */

import readline from "readline";
import { createElasticClient } from "./elastic.mjs";
import { getPipelinesByGroup, getGroups } from "./pipelines/index.mjs";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createReadline() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function prompt(rl, question) {
  return new Promise((resolve) => {
    rl.write(null, { ctrl: true, name: "u" });
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function printHeader() {
  console.log("");
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║     GCP → Elastic Custom Pipeline Installer          ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log("");
  console.log("Installs ingest pipelines for logs-gcp.* data streams");
  console.log("(GCP Elastic Load Generator and aligned ingestion).");
  console.log("");
}

// ─── Deployment type ─────────────────────────────────────────────────────────

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

function getUrlExample(deploymentType) {
  if (deploymentType === "self-managed")
    return "http://localhost:9200  or  https://elasticsearch.yourdomain.internal:9200";
  if (deploymentType === "serverless")
    return "https://my-deployment.es.eu-west-2.aws.elastic.cloud";
  return "https://my-deployment.es.us-east-1.aws.elastic-cloud.com:9243";
}

async function maybeSKipTls(rl, deploymentType) {
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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  printHeader();

  const rl = createReadline();

  // 1. Deployment type
  const deploymentType = await promptDeploymentType(rl);
  console.log("");

  // 2. TLS (self-managed only)
  await maybeSKipTls(rl, deploymentType);

  // 3. Elasticsearch URL
  const esUrl = await prompt(rl, `Elasticsearch URL (e.g. ${getUrlExample(deploymentType)}):\n> `);

  if (!esUrl) {
    console.error("No URL provided. Exiting.");
    rl.close();
    process.exit(1);
  }

  if (deploymentType === "self-managed") {
    if (!esUrl.startsWith("http://") && !esUrl.startsWith("https://")) {
      console.error("URL must start with http:// or https://. Exiting.");
      rl.close();
      process.exit(1);
    }
  } else {
    if (!esUrl.startsWith("https://")) {
      console.error("URL must start with https://. Exiting.");
      rl.close();
      process.exit(1);
    }
  }

  // 4. API Key
  const apiKey = await prompt(rl, "\nElastic API Key:\n> ");

  if (!apiKey) {
    console.error("No API key provided. Exiting.");
    rl.close();
    process.exit(1);
  }

  // 5. Test connection
  console.log("\nTesting connection...");
  const client = createElasticClient(esUrl, apiKey);

  let clusterInfo;
  try {
    clusterInfo = await client.testConnection();
    const clusterName = clusterInfo?.cluster_name ?? "(unknown)";
    const version = clusterInfo?.version?.number ?? "";
    console.log(`  Connected to cluster: ${clusterName}${version ? ` (${version})` : ""}`);
  } catch (err) {
    console.error(`  Connection failed: ${err.message}`);
    rl.close();
    process.exit(1);
  }

  // 6. Mode selection
  console.log("\nWhat would you like to do?\n");
  console.log("  1. Install pipelines");
  console.log("  2. Delete pipelines");
  console.log("  3. Delete then reinstall pipelines");
  console.log("");

  let mode;
  while (true) {
    const input = await prompt(rl, "Enter 1, 2, or 3:\n> ");
    if (input === "1") {
      mode = "install";
      break;
    }
    if (input === "2") {
      mode = "delete";
      break;
    }
    if (input === "3") {
      mode = "reinstall";
      break;
    }
    console.error("  Please enter 1, 2, or 3.");
  }
  console.log("");

  // 7. Group selection menu
  const groups = getGroups();
  const modeLabel = mode === "install" ? "install" : mode === "delete" ? "delete" : "reinstall";
  console.log(`\nAvailable pipeline groups (${modeLabel}):`);
  console.log("");

  groups.forEach((group, i) => {
    const pipelines = getPipelinesByGroup(group);
    console.log(
      `  ${i + 1}. ${group}  (${pipelines.length} pipeline${pipelines.length !== 1 ? "s" : ""})`
    );
  });
  const allIndex = groups.length + 1;
  console.log(`  ${allIndex}. all  (${modeLabel} every group)`);
  console.log("");

  const selectionInput = await prompt(rl, `Enter number(s) comma-separated, or "all":\n> `);

  rl.close();

  // Parse selection
  let selectedPipelines = [];

  if (selectionInput.toLowerCase() === "all") {
    selectedPipelines = getPipelinesByGroup("all");
  } else {
    const tokens = selectionInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const selectedGroups = new Set();

    for (const token of tokens) {
      const num = parseInt(token, 10);
      if (isNaN(num) || num < 1 || num > allIndex) {
        console.warn(`  Warning: invalid selection "${token}" — skipping.`);
        continue;
      }
      if (num === allIndex) {
        selectedPipelines = getPipelinesByGroup("all");
        selectedGroups.clear();
        break;
      }
      const group = groups[num - 1];
      if (!selectedGroups.has(group)) {
        selectedGroups.add(group);
        selectedPipelines.push(...getPipelinesByGroup(group));
      }
    }
  }

  if (selectedPipelines.length === 0) {
    console.log("\nNo pipelines selected. Exiting.");
    process.exit(0);
  }

  // ── Delete pass (delete and reinstall modes) ────────────────────────────────
  if (mode === "delete" || mode === "reinstall") {
    console.log(`\nDeleting ${selectedPipelines.length} pipeline(s)...\n`);
    let deletedCount = 0,
      notFoundCount = 0,
      deleteFailedCount = 0;

    for (const { id } of selectedPipelines) {
      try {
        const existing = await client.getPipeline(id);
        if (existing === null) {
          console.log(`  – ${id} — not installed, skipping`);
          notFoundCount++;
          continue;
        }
        await client.deletePipeline(id);
        console.log(`  ✓ ${id} — deleted`);
        deletedCount++;
      } catch (err) {
        console.error(`  ✗ ${id} — FAILED: ${err.message}`);
        deleteFailedCount++;
      }
    }

    console.log("");
    console.log(
      `Deleted ${deletedCount} / ${selectedPipelines.length} pipeline(s).` +
        (notFoundCount > 0 ? ` (${notFoundCount} not installed, skipped)` : "") +
        (deleteFailedCount > 0 ? ` (${deleteFailedCount} failed)` : "")
    );

    if (mode === "delete") {
      console.log("Done.");
      return;
    }
    console.log("");
  }

  // ── Install pass (install and reinstall modes) ──────────────────────────────
  console.log(`Installing ${selectedPipelines.length} pipeline(s)...\n`);

  let installedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const pipeline of selectedPipelines) {
    const { id, processors, description } = pipeline;

    try {
      const existing = await client.getPipeline(id);

      if (existing !== null) {
        console.log(`  ✓ ${id} — already installed, skipping`);
        skippedCount++;
        continue;
      }

      await client.putPipeline(id, { description, processors });

      console.log(`  ✓ ${id} — installed`);
      installedCount++;
    } catch (err) {
      console.error(`  ✗ ${id} — FAILED: ${err.message}`);
      failedCount++;
    }
  }

  const total = selectedPipelines.length;
  console.log("");
  console.log(
    `Installed ${installedCount} / ${total} pipelines.` +
      (skippedCount > 0 ? ` (${skippedCount} already installed, skipped)` : "") +
      (failedCount > 0 ? ` (${failedCount} failed)` : "")
  );
  console.log("Done.");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
