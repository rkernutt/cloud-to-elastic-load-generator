#!/usr/bin/env node

/**
 * Elastic Security detection rule installer.
 *
 * Installs custom detection rules via the Detection Engine API so they produce
 * alerts in `.alerts-security.alerts-*` — required for Attack Discovery.
 *
 * Usage:
 *   npm run setup:security-detection-rules
 *   node installer/security-detection-rules/index.mjs
 */

import { createInterface } from "readline";
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

function banner() {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║   Elastic Security Detection Rules — Attack Discovery Installer ║
╚══════════════════════════════════════════════════════════════════╝

Installs detection rules via the Detection Engine API.
Alerts land in .alerts-security.alerts-* for Attack Discovery.
Requires an API key with Security > All privileges.
`);
}

async function main() {
  banner();

  const deployType = await ask(
    "Select deployment type:\n  1. Self-Managed\n  2. Elastic Cloud Hosted\n  3. Elastic Serverless\n\nEnter 1, 2, or 3: "
  );
  const dt = deployType.trim();

  let skipTls = false;
  if (dt === "1") {
    const ans = await ask(
      "\nSkip TLS certificate verification? Required for self-signed / internal CA certs. (y/N): "
    );
    if (ans.trim().toLowerCase() === "y") {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
      skipTls = true;
      console.log("  ⚠  TLS verification disabled.\n");
    }
  }

  const kibanaUrl = (await ask("\nKibana URL: ")).trim().replace(/\/+$/, "");
  const apiKey = (await ask("API Key (Kibana, with Security > All): ")).trim();

  console.log("\nTesting connection...");
  const headers = {
    Authorization: `ApiKey ${apiKey}`,
    "Content-Type": "application/json",
    "kbn-xsrf": "true",
    "elastic-api-version": "2023-10-31",
  };

  try {
    const statusRes = await fetch(`${kibanaUrl}/api/status`, { headers });
    if (!statusRes.ok) throw new Error(`Status ${statusRes.status}`);
    const status = await statusRes.json();
    console.log(
      `  Connected to Kibana: ${status.name || "OK"} (${status.version?.number || "unknown"})\n`
    );
  } catch (e) {
    console.error(`  ✗ Connection failed: ${e.message}`);
    rl.close();
    process.exit(1);
  }

  const rulesDir = join(__dirname, "rules");
  const ruleFiles = readdirSync(rulesDir).filter((f) => f.endsWith(".json"));

  const allRules = [];
  for (const f of ruleFiles) {
    const data = JSON.parse(readFileSync(join(rulesDir, f), "utf8"));
    allRules.push(...data.rules);
  }

  console.log(`Found ${allRules.length} detection rules across ${ruleFiles.length} rule files.\n`);

  console.log("Rule files:");
  for (const f of ruleFiles) {
    const data = JSON.parse(readFileSync(join(rulesDir, f), "utf8"));
    console.log(`  ${f}: ${data.rules.length} rules`);
  }

  const confirm = await ask(`\nInstall all ${allRules.length} rules? (Y/n): `);
  if (confirm.trim().toLowerCase() === "n") {
    console.log("Aborted.");
    rl.close();
    return;
  }

  let installed = 0;
  let skipped = 0;
  let failed = 0;

  for (const rule of allRules) {
    const body = { ...rule };

    try {
      const res = await fetch(`${kibanaUrl}/api/detection_engine/rules`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (res.ok) {
        console.log(`  ✓ ${rule.name}`);
        installed++;
      } else if (res.status === 409) {
        console.log(`  ⊘ ${rule.name} (already exists)`);
        skipped++;
      } else {
        const err = await res.text();
        console.log(`  ✗ ${rule.name} — ${res.status}: ${err.slice(0, 200)}`);
        failed++;
      }
    } catch (e) {
      console.log(`  ✗ ${rule.name} — ${e.message}`);
      failed++;
    }
  }

  console.log(`\nDone: ${installed} installed, ${skipped} skipped, ${failed} failed.`);

  if (installed > 0) {
    console.log(`
Next steps for Attack Discovery:
  1. Ship data using the IAM PrivEsc, Security Finding, and Data Exfil chain generators
  2. Wait for rules to fire (5-minute intervals) — check Security → Alerts
  3. Once 50+ alerts accumulate, open Security → Attack Discovery
  4. Attack Discovery will group the alerts into correlated attack patterns
`);
  }

  rl.close();
}

main().catch((e) => {
  console.error(e);
  rl.close();
  process.exit(1);
});
