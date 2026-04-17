#!/usr/bin/env node
/**
 * AWS → Elastic Custom Dashboard Installer
 *
 * Interactive CLI that installs Kibana dashboards for AWS services monitored
 * by the AWS → Elastic Load Generator (15 dashboards: Glue, SageMaker, EMR, Athena,
 * X-Ray, Lambda, EKS, Step Functions, Bedrock, Aurora, ElastiCache, OpenSearch,
 * CI/CD, Cognito, Kinesis Streams).
 *
 * Run with:  node index.mjs
 *            npm run setup:aws-dashboards
 *
 * No external dependencies — uses Node.js built-ins only.
 *
 * Install strategy (tried in order):
 *   1. POST /api/dashboards  (Kibana 9.4+ — Cloud Hosted, Self-Managed)
 *   2. POST /api/saved_objects/_import  (Kibana 8.11+ — fallback for Serverless
 *      and deployments where the Dashboards API is unavailable)
 */

import readline from "readline";
import { dirname } from "path";
import { fileURLToPath } from "url";
import {
  loadDashboards as loadDashboardsFromDir,
  createKibanaClient,
  installOne,
} from "./installLib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createReadline() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function prompt(rl, question) {
  return new Promise((resolve) => {
    rl.write(null, { ctrl: true, name: "u" });
    rl.question(question, (a) => resolve(a.trim()));
  });
}

function printHeader() {
  console.log("");
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║     AWS → Elastic Custom Dashboard Installer         ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log("");
  console.log("Installs Kibana dashboards for AWS services monitored");
  console.log("by the AWS → Elastic Load Generator.");
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
    return "http://localhost:5601  or  https://kibana.yourdomain.internal:5601";
  if (deploymentType === "serverless")
    return "https://my-deployment.kb.eu-west-2.aws.elastic.cloud";
  return "https://my-deployment.kb.us-east-1.aws.elastic-cloud.com:9243";
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

function loadDashboards() {
  return loadDashboardsFromDir(__dirname);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  printHeader();

  const dashboards = loadDashboards();

  if (dashboards.length === 0) {
    console.log("No dashboard JSON files found in this directory. Exiting.");
    process.exit(0);
  }

  const rl = createReadline();

  // 1. Deployment type
  const deploymentType = await promptDeploymentType(rl);
  console.log("");

  // 2. TLS (self-managed only)
  await maybeSKipTls(rl, deploymentType);

  // 3. Kibana URL
  const kibanaUrl = await prompt(rl, `Kibana URL (e.g. ${getUrlExample(deploymentType)}):\n> `);

  if (!kibanaUrl) {
    console.error("No URL provided. Exiting.");
    rl.close();
    process.exit(1);
  }

  if (deploymentType === "self-managed") {
    if (!kibanaUrl.startsWith("http://") && !kibanaUrl.startsWith("https://")) {
      console.error("URL must start with http:// or https://. Exiting.");
      rl.close();
      process.exit(1);
    }
  } else {
    if (!kibanaUrl.startsWith("https://")) {
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
  const client = createKibanaClient(kibanaUrl, apiKey);

  let kibanaVersion = "";
  try {
    const status = await client.testConnection();
    kibanaVersion = status?.version?.number ?? "";
    const name = status?.name ?? "(unknown)";
    console.log(`  Connected to Kibana: ${name}${kibanaVersion ? ` (${kibanaVersion})` : ""}`);
  } catch (err) {
    console.error(`  Connection failed: ${err.message}`);
    rl.close();
    process.exit(1);
  }

  // 6. Ensure required data views exist
  console.log("\nChecking data views...");
  const DATA_VIEWS = [
    { title: "logs-*", name: "Logs (all)" },
    { title: "metrics-*", name: "Metrics (all)" },
  ];
  for (const { title, name } of DATA_VIEWS) {
    try {
      const existing = await client.findDataView(title);
      if (existing) {
        console.log(`  ✓ ${title} — already exists`);
      } else {
        await client.createDataView(title, "@timestamp", name);
        console.log(`  ✓ ${title} — created`);
      }
    } catch (err) {
      console.warn(`  ⚠  Could not create data view "${title}": ${err.message}`);
      console.warn("     Dashboard panels may show errors if this data view is missing.");
    }
  }

  // 7. Mode selection
  console.log("\nWhat would you like to do?\n");
  console.log("  1. Install dashboards");
  console.log("  2. Delete dashboards");
  console.log("  3. Delete then reinstall dashboards");
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
  const modeLabel = { install: "install", delete: "delete", reinstall: "reinstall" }[mode];

  // 8. Dashboard selection menu
  console.log(`\nAvailable dashboards (${modeLabel}):\n`);
  dashboards.forEach((d, i) => {
    console.log(`  ${i + 1}. ${d.title}`);
  });
  const allIndex = dashboards.length + 1;
  console.log(`  ${allIndex}. all  (${modeLabel} every dashboard)`);
  console.log("");

  const selectionInput = await prompt(rl, `Enter number(s) comma-separated, or "all":\n> `);
  rl.close();

  // Parse selection
  let selected = [];

  if (selectionInput.toLowerCase() === "all") {
    selected = dashboards;
  } else {
    const tokens = selectionInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const seen = new Set();
    for (const token of tokens) {
      const num = parseInt(token, 10);
      if (isNaN(num) || num < 1 || num > allIndex) {
        console.warn(`  Warning: invalid selection "${token}" — skipping.`);
        continue;
      }
      if (num === allIndex) {
        selected = dashboards;
        break;
      }
      const d = dashboards[num - 1];
      if (!seen.has(d.title)) {
        seen.add(d.title);
        selected.push(d);
      }
    }
  }

  if (selected.length === 0) {
    console.log("\nNo dashboards selected. Exiting.");
    process.exit(0);
  }

  // ── Delete pass (delete and reinstall modes) ────────────────────────────────
  if (mode === "delete" || mode === "reinstall") {
    console.log(`\nDeleting ${selected.length} dashboard(s)...\n`);
    let deletedCount = 0,
      notFoundCount = 0,
      deleteFailedCount = 0;

    for (const { title, ndjson, definition } of selected) {
      try {
        // Resolve ID: prefer ndjson ID, then look up by title via saved objects
        let dashId = ndjson?.id;
        if (!dashId) {
          const found = await client.findDashboardByTitle(title);
          dashId = found?.id ?? null;
        }
        if (!dashId) {
          console.log(`  – "${title}" — not installed, skipping`);
          notFoundCount++;
          continue;
        }
        await client.deleteDashboard(dashId);
        console.log(`  ✓ "${title}" — deleted`);
        deletedCount++;
      } catch (err) {
        console.error(`  ✗ "${title}" — FAILED: ${err.message}`);
        deleteFailedCount++;
      }
    }

    console.log("");
    console.log(
      `Deleted ${deletedCount} / ${selected.length} dashboard(s).` +
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
  console.log(`Installing ${selected.length} dashboard(s)...\n`);

  let installedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const { title, definition, ndjson } of selected) {
    try {
      const outcome = await installOne(client, title, definition, ndjson, kibanaVersion);
      if (outcome.status === "skipped") {
        console.log(`  ✓ "${title}" — already installed, skipping`);
        skippedCount++;
      } else {
        const patchNote = outcome.patched ? ` [patched for Kibana ${kibanaVersion}]` : "";
        console.log(
          `  ✓ "${title}" — installed via ${outcome.via} (id: ${outcome.id})${patchNote}`
        );
        installedCount++;
      }
    } catch (err) {
      console.error(`  ✗ "${title}" — FAILED: ${err.message}`);
      failedCount++;
    }
  }

  // Summary
  const total = selected.length;
  console.log("");
  console.log(
    `Installed ${installedCount} / ${total} dashboard(s).` +
      (skippedCount > 0 ? ` (${skippedCount} already installed, skipped)` : "") +
      (failedCount > 0 ? ` (${failedCount} failed)` : "")
  );

  if (failedCount > 0) {
    console.log(
      "\nIf the error above mentions 'not available with the current configuration',\n" +
        "your deployment may not support either the Dashboards API or Saved Objects import.\n" +
        "Import manually: Kibana → Stack Management → Saved Objects → Import\n" +
        "and select a file from installer/aws-custom-dashboards/ndjson/"
    );
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
