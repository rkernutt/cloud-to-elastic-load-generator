#!/usr/bin/env node
/**
 * AWS Alerting Rules Installer (Kibana 8.2)
 *
 * Installs rules from installer/aws-custom-rules-82/ via the Alerting API.
 * No Elastic-Api-Version header; rules use consumer "stackAlerts".
 *
 * Run: npm run setup:aws-rules:82
 */

import readline from "readline";
import { readFileSync, readdirSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { join, dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES_DIR = __dirname;

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
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║   AWS Alerting Rules Installer (Kibana 8.2)          ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log("");
  console.log("Installs CloudLoadGen AWS alerting rules (stackAlerts consumer).");
  console.log("Generate 8.2 rule files first: npm run generate:aws-rules:82");
  console.log("");
}

function normalizeBaseUrl(url) {
  return url.replace(/\/+$/, "");
}

function createKibanaClient(baseUrl, apiKey) {
  const base = normalizeBaseUrl(baseUrl);
  const commonHeaders = {
    Authorization: `ApiKey ${apiKey}`,
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

    if (!text) return null;

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
  };
}

function loadRuleGroups() {
  if (!existsSync(RULES_DIR)) {
    throw new Error(`Rules directory not found: ${RULES_DIR}`);
  }

  const files = readdirSync(RULES_DIR).filter((f) => f.endsWith("-rules.json"));
  if (files.length === 0) {
    throw new Error(`No *-rules.json in ${RULES_DIR}. Run: npm run generate:aws-rules:82`);
  }

  const groups = [];
  for (const file of files.sort()) {
    const raw = readFileSync(join(RULES_DIR, file), "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.rules)) {
      throw new Error(`Invalid rules file (missing rules array): ${file}`);
    }
    groups.push({
      name: parsed.group,
      description: parsed.description ?? "",
      rules: parsed.rules,
      sourceFile: file,
    });
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
    if (!r?.id || typeof r.id !== "string") continue;
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

async function main() {
  printHeader();

  let groups;
  try {
    groups = loadRuleGroups();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const allRules = dedupeRulesById(groups.flatMap((g) => g.rules));
  console.log(`Loaded ${allRules.length} rule(s) from ${groups.length} bundle(s).\n`);

  const rl = createReadline();

  const kbUrl = await prompt(
    rl,
    "Kibana base URL (e.g. https://my-deployment.kb.us-east-1.aws.elastic-cloud.com:9243):\n> "
  );
  if (!kbUrl) {
    console.error("No URL provided. Exiting.");
    rl.close();
    process.exit(1);
  }

  const apiKey = await prompt(rl, "\nElastic API Key (needs create/read alerting rules):\n> ");
  if (!apiKey) {
    console.error("No API key provided. Exiting.");
    rl.close();
    process.exit(1);
  }

  rl.close();

  const client = createKibanaClient(kbUrl, apiKey);

  console.log("\nTesting connection...");
  try {
    const status = await client.testConnection();
    const version = status?.version?.number ?? "";
    const name = status?.name ?? "Kibana";
    console.log(`  Connected to ${name}${version ? ` (${version})` : ""}.`);
  } catch (err) {
    console.error(`  Connection failed: ${err.message}`);
    process.exit(1);
  }

  console.log(`\nInstalling ${allRules.length} rule(s)...\n`);

  let installedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const rule of allRules) {
    const { id, ...ruleBody } = rule;
    const labelName = typeof rule.name === "string" ? rule.name : "";

    try {
      const existing = await client.getRule(id);
      if (ruleExistsResponse(existing)) {
        console.log(`  ✓ ${id}${labelName ? ` — ${labelName}` : ""} — already installed, skipping`);
        skippedCount++;
        continue;
      }

      await client.createRule(id, ruleBody);
      console.log(`  ✓ ${id}${labelName ? ` — ${labelName}` : ""} — installed`);
      installedCount++;
    } catch (err) {
      const msg = err.message ?? String(err);
      if (msg.includes("409") || msg.toLowerCase().includes("already exists")) {
        console.log(`  ✓ ${id}${labelName ? ` — ${labelName}` : ""} — already installed, skipping`);
        skippedCount++;
      } else {
        console.error(`  ✗ ${id} — FAILED: ${msg}`);
        failedCount++;
      }
    }
  }

  const total = allRules.length;
  console.log("");
  console.log(
    `Installed ${installedCount} / ${total} rule(s).` +
      (skippedCount > 0 ? ` (${skippedCount} already installed, skipped)` : "") +
      (failedCount > 0 ? ` (${failedCount} failed)` : "")
  );
  console.log("Done.");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
