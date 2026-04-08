#!/usr/bin/env node
/**
 * GCP → Elastic Integration Installer
 *
 * Installs the Elastic Google Cloud Platform integration package via the Kibana Fleet API.
 *
 * Run with:
 *   node index.mjs
 *   npm run setup:gcp-integration
 *
 * Requirements:
 *   - Node.js 18+ (uses native fetch and readline/promises)
 *   - A running Kibana instance reachable over HTTP/HTTPS
 *   - A valid Elastic API key (from Kibana → Stack Management → API Keys)
 */

import readline from "readline";
import process from "process";
import createKibanaClient from "./kibana.mjs";

const PACKAGE_NAME = "gcp";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createPrompter() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = (question) =>
    new Promise((resolve) => {
      rl.question(question, (answer) => resolve(answer.trim()));
    });

  const close = () => rl.close();

  return { prompt, close };
}

// ---------------------------------------------------------------------------
// Deployment type
// ---------------------------------------------------------------------------

const DEPLOYMENT_TYPES = [
  { id: "self-managed", label: "Self-Managed  (on-premises, Docker, VM)" },
  { id: "cloud-hosted", label: "Elastic Cloud Hosted  (cloud.elastic.co)" },
  { id: "serverless", label: "Elastic Serverless  (cloud.elastic.co/serverless)" },
];

async function promptDeploymentType(prompt) {
  console.log("Select your Elastic deployment type:");
  console.log("");
  DEPLOYMENT_TYPES.forEach(({ label }, i) => console.log(`  ${i + 1}. ${label}`));
  console.log("");

  while (true) {
    const input = await prompt("Enter 1, 2, or 3:\n> ");
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

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateKibanaUrl(raw, deploymentType) {
  if (!raw) return { valid: false, message: "Kibana URL must not be empty." };

  if (deploymentType === "self-managed") {
    if (!raw.startsWith("http://") && !raw.startsWith("https://"))
      return { valid: false, message: "URL must start with http:// or https://." };
  } else {
    if (!raw.startsWith("https://"))
      return { valid: false, message: "URL must start with https://." };
  }

  try {
    new URL(raw);
  } catch (_) {
    return { valid: false, message: `"${raw}" is not a valid URL.` };
  }

  return { valid: true };
}

function validateApiKey(raw) {
  if (!raw) return { valid: false, message: "API key must not be empty." };
  return { valid: true };
}

// ---------------------------------------------------------------------------
// TLS
// ---------------------------------------------------------------------------

async function maybeSKipTls(prompt, deploymentType) {
  if (deploymentType !== "self-managed") return;

  const answer = await prompt(
    "Skip TLS certificate verification? Required for self-signed / internal CA certs. (y/N):\n> "
  );
  if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    console.log("  ⚠  TLS verification disabled — ensure you trust this endpoint.");
  }
  console.log("");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("");
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   GCP → Elastic Integration Installer       ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log("");

  const { prompt, close } = createPrompter();

  let kibanaUrl;
  let apiKey;

  try {
    const deploymentType = await promptDeploymentType(prompt);
    console.log("");

    await maybeSKipTls(prompt, deploymentType);

    while (true) {
      const raw = await prompt(`Kibana URL (e.g. ${getUrlExample(deploymentType)}): `);
      const { valid, message } = validateKibanaUrl(raw, deploymentType);
      if (valid) {
        kibanaUrl = raw.replace(/\/$/, "");
        break;
      }
      console.error(`  ✗ ${message}`);
    }

    while (true) {
      const raw = await prompt("\nElastic API key (from Kibana → Stack Management → API Keys): ");
      const { valid, message } = validateApiKey(raw);
      if (valid) {
        apiKey = raw;
        break;
      }
      console.error(`  ✗ ${message}`);
    }
  } finally {
    close();
  }

  console.log("");

  const client = createKibanaClient(kibanaUrl, apiKey);

  let installed = null;
  try {
    console.log(`Checking whether the ${PACKAGE_NAME.toUpperCase()} integration is already installed...`);
    installed = await client.getInstalledPackage(PACKAGE_NAME);
  } catch (err) {
    console.error(`✗ Failed to query Kibana: ${err.message}`);
    process.exit(1);
  }

  if (installed && installed.item?.status === "installed") {
    const version = installed.item?.version ?? "unknown";
    console.log(`✓ GCP integration already installed (v${version}) — skipping.`);
    console.log("");
    console.log("Done.");
    process.exit(0);
  }

  let latestVersion;
  try {
    console.log("Fetching latest GCP integration version...");
    latestVersion = await client.getLatestVersion(PACKAGE_NAME);
  } catch (err) {
    console.error(`✗ Could not determine latest package version: ${err.message}`);
    process.exit(1);
  }

  try {
    console.log(`Installing GCP integration v${latestVersion}...`);
    await client.installPackage(PACKAGE_NAME, latestVersion);
  } catch (err) {
    console.error(`✗ Installation failed: ${err.message}`);
    process.exit(1);
  }

  console.log(`✓ GCP integration installed successfully (v${latestVersion})`);
  console.log("  Index templates, ILM policies, and dashboards are now available in Kibana.");
  console.log("");
  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(`✗ Unexpected error: ${err.message}`);
  process.exit(1);
});
