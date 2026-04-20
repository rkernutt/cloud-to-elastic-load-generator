#!/usr/bin/env node
/**
 * Kibana Alerting Rules Installer
 *
 * Interactive CLI that installs, deletes, or reinstalls Kibana alerting rules
 * from aws-custom-rules, gcp-custom-rules, and azure-custom-rules bundles.
 *
 * Run with:  node installer/alert-rules-installer/index.mjs
 *            or: npm run setup:alert-rules
 *
 * No external dependencies — uses Node.js built-ins only (Node 18+).
 */

import readline from "readline";
import { readFileSync, readdirSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { join, dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
  console.log("║       Kibana Alerting Rules Installer                ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log("");
  console.log("Manages Kibana alerting rules for CloudLoadGen chained-event scenarios.");
  console.log("Requires a Kibana URL and an API key with alerting rule privileges.");
  console.log("");
}

function normalizeBaseUrl(url) {
  return url.replace(/\/+$/, "");
}

function createKibanaClient(baseUrl, apiKey) {
  const base = normalizeBaseUrl(baseUrl);
  const commonHeaders = {
    Authorization: `ApiKey ${apiKey}`,
    "Elastic-Api-Version": "2023-10-31",
    "kbn-xsrf": "true",
  };

  async function request(method, path, { body, allow404 = false } = {}) {
    const url = `${base}${path}`;
    const headers = { ...commonHeaders };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const options = { method, headers };
    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }

    const res = await fetch(url, options);

    if (allow404 && res.status === 404) {
      await res.text().catch(() => "");
      return { _status: 404, _body: null };
    }

    const text = await res.text();

    if (!res.ok) {
      throw new Error(
        `Kibana request failed: ${method} ${path} → HTTP ${res.status}\n${text || "(empty body)"}`
      );
    }

    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Kibana returned non-JSON (${method} ${path}): ${text.slice(0, 200)}`);
    }
  }

  return {
    async testConnection() {
      return request("GET", "/api/status");
    },

    /** @returns {Promise<object|null>} Parsed rule, or null if not found (404). */
    async getRule(ruleId) {
      const path = `/api/alerting/rule/${encodeURIComponent(ruleId)}`;
      const result = await request("GET", path, { allow404: true });
      if (result && result._status === 404) return null;
      return result;
    },

    async createRule(ruleId, ruleBody) {
      const path = `/api/alerting/rule/${encodeURIComponent(ruleId)}`;
      return request("POST", path, { body: ruleBody });
    },

    /** @returns {Promise<'deleted'|'not_found'>} */
    async deleteRule(ruleId) {
      const path = `/api/alerting/rule/${encodeURIComponent(ruleId)}`;
      const result = await request("DELETE", path, { allow404: true });
      if (result && result._status === 404) return "not_found";
      return "deleted";
    },
  };
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

function getKibanaUrlExample(deploymentType) {
  if (deploymentType === "self-managed")
    return "http://localhost:5601  or  https://kibana.yourdomain.internal:5601";
  if (deploymentType === "serverless") return "https://my-deployment.kibana.elastic.cloud";
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

// ─── Rule definitions loader ────────────────────────────────────────────────

const RULE_SOURCE_DIRS = [
  { cloud: "aws", rel: "../aws-custom-rules" },
  { cloud: "gcp", rel: "../gcp-custom-rules" },
  { cloud: "azure", rel: "../azure-custom-rules" },
];

function loadRuleGroups() {
  const groups = [];

  for (const { cloud, rel } of RULE_SOURCE_DIRS) {
    const dir = join(__dirname, rel);
    if (!existsSync(dir)) {
      console.warn(`  Warning: rules directory not found, skipping: ${dir}`);
      continue;
    }

    const files = readdirSync(dir).filter((f) => f.endsWith("-rules.json"));
    for (const file of files.sort()) {
      const raw = readFileSync(join(dir, file), "utf8");
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.rules)) {
        throw new Error(`Invalid rules file (missing rules array): ${join(dir, file)}`);
      }
      groups.push({
        cloud,
        name: parsed.group,
        description: parsed.description ?? "",
        rules: parsed.rules,
        sourceFile: file,
      });
    }
  }

  if (groups.length === 0) {
    throw new Error(
      `No *-rules.json files found under aws-custom-rules, gcp-custom-rules, or azure-custom-rules`
    );
  }

  return groups;
}

function ruleExistsResponse(existing) {
  return (
    existing !== null &&
    typeof existing === "object" &&
    !("_status" in existing) &&
    "id" in existing
  );
}

function dedupeRulesById(rules) {
  const seen = new Set();
  const out = [];
  for (const r of rules) {
    if (!r || typeof r.id !== "string" || !r.id) {
      console.warn("  Warning: skipping entry without a string id.");
      continue;
    }
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  printHeader();

  const rl = createReadline();

  const deploymentType = await promptDeploymentType(rl);
  console.log("");

  await maybeSkipTls(rl, deploymentType);

  const kbUrl = await prompt(
    rl,
    `Kibana base URL (e.g. ${getKibanaUrlExample(deploymentType)}):\n> `
  );

  if (!kbUrl) {
    console.error("No URL provided. Exiting.");
    rl.close();
    process.exit(1);
  }

  if (deploymentType === "self-managed") {
    if (!kbUrl.startsWith("http://") && !kbUrl.startsWith("https://")) {
      console.error("URL must start with http:// or https://. Exiting.");
      rl.close();
      process.exit(1);
    }
  } else {
    if (!kbUrl.startsWith("https://")) {
      console.error("URL must start with https://. Exiting.");
      rl.close();
      process.exit(1);
    }
  }

  const apiKey = await prompt(
    rl,
    "\nElastic API Key (must work for Kibana; needs create/read/delete alerting rules):\n> "
  );

  if (!apiKey) {
    console.error("No API key provided. Exiting.");
    rl.close();
    process.exit(1);
  }

  const client = createKibanaClient(kbUrl, apiKey);

  console.log("\nTesting connection...");
  try {
    const status = await client.testConnection();
    const version = status?.version?.number ?? status?.version ?? "";
    const name = status?.name ?? "Kibana";
    console.log(`  Connected to ${name}${version ? ` (${version})` : ""}.`);
  } catch (err) {
    console.error(`  Connection failed: ${err.message}`);
    rl.close();
    process.exit(1);
  }

  console.log("\nWhat would you like to do?\n");
  console.log("  1. Install rules");
  console.log("  2. Delete rules");
  console.log("  3. Delete then reinstall rules");
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

  let groups;
  try {
    groups = loadRuleGroups();
  } catch (err) {
    console.error(`\nFailed to load rule definitions: ${err.message}`);
    rl.close();
    process.exit(1);
  }

  const modeLabel = { install: "install", delete: "delete", reinstall: "reinstall" }[mode];
  console.log(`Available rule groups (${modeLabel}):\n`);

  groups.forEach((group, i) => {
    const count = group.rules.length;
    const pad = String(i + 1).padStart(2, " ");
    const label = `${group.cloud} / ${group.name}`.padEnd(22);
    console.log(
      `  ${pad}. ${label}(${count} rule${count !== 1 ? "s" : ""})  — ${group.description}`
    );
  });

  const allIndex = groups.length + 1;
  console.log(
    `  ${String(allIndex).padStart(2, " ")}. all                    (${modeLabel} every group)`
  );
  console.log("");

  const selectionInput = await prompt(rl, `Enter number(s) comma-separated, or "all":\n> `);

  rl.close();

  let selectedRules = [];

  if (selectionInput.toLowerCase() === "all" || selectionInput === String(allIndex)) {
    selectedRules = groups.flatMap((g) => g.rules);
  } else {
    const tokens = selectionInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const seen = new Set();
    let expandedAll = false;

    for (const token of tokens) {
      if (expandedAll) break;

      const num = parseInt(token, 10);
      if (isNaN(num) || num < 1 || num > allIndex) {
        console.warn(`  Warning: invalid selection "${token}" — skipping.`);
        continue;
      }
      if (num === allIndex) {
        selectedRules = groups.flatMap((g) => g.rules);
        expandedAll = true;
        break;
      }
      const group = groups[num - 1];
      if (!seen.has(`${group.cloud}:${group.name}:${group.sourceFile}`)) {
        seen.add(`${group.cloud}:${group.name}:${group.sourceFile}`);
        selectedRules.push(...group.rules);
      }
    }
  }

  selectedRules = dedupeRulesById(selectedRules);

  if (selectedRules.length === 0) {
    console.log("\nNo rules selected. Exiting.");
    process.exit(0);
  }

  // ── Delete / Reinstall: delete phase ───────────────────────────────────────
  if (mode === "delete" || mode === "reinstall") {
    console.log(`\nDeleting ${selectedRules.length} rule(s)...\n`);

    let deletedCount = 0;
    let notFoundCount = 0;
    let failedCount = 0;

    for (const rule of selectedRules) {
      const { id } = rule;
      const labelName = typeof rule.name === "string" ? rule.name : "";
      try {
        const existing = await client.getRule(id);
        if (!ruleExistsResponse(existing)) {
          console.log(`  – ${id}${labelName ? ` — ${labelName}` : ""} — not installed, skipping`);
          notFoundCount++;
          continue;
        }

        const outcome = await client.deleteRule(id);
        if (outcome === "not_found") {
          console.log(
            `  – ${id}${labelName ? ` — ${labelName}` : ""} — not found on delete, skipping`
          );
          notFoundCount++;
        } else {
          console.log(`  ✓ ${id}${labelName ? ` — ${labelName}` : ""} — deleted`);
          deletedCount++;
        }
      } catch (err) {
        console.error(`  ✗ ${id} — FAILED: ${err.message}`);
        failedCount++;
      }
    }

    console.log("");
    console.log(
      `Deleted ${deletedCount} / ${selectedRules.length} rule(s).` +
        (notFoundCount > 0 ? ` (${notFoundCount} not installed, skipped)` : "") +
        (failedCount > 0 ? ` (${failedCount} failed)` : "")
    );

    if (mode === "delete") {
      console.log("\nDone.");
      return;
    }
    console.log("");
  }

  // ── Install / Reinstall: install phase ────────────────────────────────────
  if (mode === "install" || mode === "reinstall") {
    console.log(`\nInstalling ${selectedRules.length} rule(s)...\n`);

    let installedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const rule of selectedRules) {
      const { id, ...ruleBody } = rule;
      const labelName = typeof rule.name === "string" ? rule.name : "";

      try {
        const existing = await client.getRule(id);
        if (ruleExistsResponse(existing)) {
          console.log(
            `  ✓ ${id}${labelName ? ` — ${labelName}` : ""} — already installed, skipping`
          );
          skippedCount++;
          continue;
        }

        await client.createRule(id, ruleBody);
        console.log(`  ✓ ${id}${labelName ? ` — ${labelName}` : ""} — installed`);
        installedCount++;
      } catch (err) {
        const msg = err.message ?? String(err);
        if (msg.includes("409") || msg.toLowerCase().includes("already exists")) {
          console.log(
            `  ✓ ${id}${labelName ? ` — ${labelName}` : ""} — already installed, skipping`
          );
          skippedCount++;
        } else {
          console.error(`  ✗ ${id} — FAILED: ${msg}`);
          failedCount++;
        }
      }
    }

    const total = selectedRules.length;
    console.log("");
    console.log(
      `Installed ${installedCount} / ${total} rule(s).` +
        (skippedCount > 0 ? ` (${skippedCount} already installed, skipped)` : "") +
        (failedCount > 0 ? ` (${failedCount} failed)` : "")
    );
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
