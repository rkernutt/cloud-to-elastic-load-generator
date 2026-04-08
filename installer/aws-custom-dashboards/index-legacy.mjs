#!/usr/bin/env node
/**
 * AWS → Elastic Custom Dashboard Installer (Legacy / Kibana 8.11+)
 *
 * Imports Kibana dashboards via the Saved Objects API using pre-generated
 * .ndjson files. Compatible with Kibana 8.11+ (earlier than 9.4).
 *
 * Run with:  node index-legacy.mjs
 *            npm run setup:dashboards:legacy
 *
 * No external dependencies — uses Node.js built-ins only.
 */

import readline from "readline";
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const NDJSON_DIR = join(__dirname, "ndjson");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createReadline() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function prompt(rl, question) {
  return new Promise((resolve) => rl.question(question, (a) => resolve(a.trim())));
}

function printHeader() {
  console.log("");
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  AWS → Elastic Custom Dashboard Installer (Legacy)   ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log("");
  console.log("Imports Kibana dashboards via Saved Objects API.");
  console.log("Compatible with Kibana 8.11+.");
  console.log("");
}

// ─── Dashboard discovery ─────────────────────────────────────────────────────

function loadNdjsonFiles() {
  let files;
  try {
    files = readdirSync(NDJSON_DIR).filter((f) => f.endsWith(".ndjson"));
  } catch {
    console.error(`No ndjson/ directory found. Run this first:\n  node generate-ndjson.mjs`);
    process.exit(1);
  }

  return files.map((file) => {
    const raw = readFileSync(join(NDJSON_DIR, file), "utf-8").trim();
    const obj = JSON.parse(raw);
    return { file, id: obj.id, title: obj.attributes.title, raw };
  });
}

// ─── Kibana client ───────────────────────────────────────────────────────────

function createKibanaClient(baseUrl, apiKey) {
  const base = baseUrl.replace(/\/$/, "");
  const headers = {
    Authorization: `ApiKey ${apiKey}`,
    "kbn-xsrf": "true",
  };

  async function request(method, path, body, extraHeaders = {}) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { ...headers, ...extraHeaders },
      body,
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      let text;
      try {
        text = await res.text();
      } catch {
        text = "(unable to read response)";
      }
      throw new Error(`Kibana ${method} ${path} → HTTP ${res.status}\n${text}`);
    }
    return res.json();
  }

  return {
    async testConnection() {
      return request("GET", "/api/status");
    },

    /**
     * Check whether a saved object with the given type + id already exists.
     */
    async getSavedObject(type, id) {
      return request("GET", `/api/saved_objects/${type}/${encodeURIComponent(id)}`);
    },

    /**
     * Import a single saved object via the bulk import API.
     * `overwrite: false` means existing objects are skipped, not replaced.
     */
    async importSavedObject(ndjsonString, overwrite = false) {
      const body = new Blob([ndjsonString], { type: "application/ndjson" });

      // Build form-data manually — no external deps
      const boundary = `----FormBoundary${Math.random().toString(36).slice(2)}`;
      const crlf = "\r\n";
      const encoded = Buffer.from(ndjsonString);

      const parts = Buffer.concat([
        Buffer.from(
          `--${boundary}${crlf}` +
            `Content-Disposition: form-data; name="file"; filename="import.ndjson"${crlf}` +
            `Content-Type: application/ndjson${crlf}${crlf}`
        ),
        encoded,
        Buffer.from(`${crlf}--${boundary}--${crlf}`),
      ]);

      return request("POST", `/api/saved_objects/_import?overwrite=${overwrite}`, parts, {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      });
    },
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  printHeader();

  const dashboards = loadNdjsonFiles();

  if (dashboards.length === 0) {
    console.log("No .ndjson files found in ndjson/. Run node generate-ndjson.mjs first.");
    process.exit(0);
  }

  const rl = createReadline();

  const kibanaUrl = await prompt(
    rl,
    "Kibana URL (e.g. https://my-deployment.kb.us-east-1.aws.elastic-cloud.com:9243):\n> "
  );
  if (!kibanaUrl) {
    console.error("No URL provided. Exiting.");
    rl.close();
    process.exit(1);
  }

  const apiKey = await prompt(rl, "\nElastic API Key:\n> ");
  if (!apiKey) {
    console.error("No API key provided. Exiting.");
    rl.close();
    process.exit(1);
  }

  console.log("\nTesting connection...");
  const client = createKibanaClient(kibanaUrl, apiKey);

  try {
    const status = await client.testConnection();
    const version = status?.version?.number ?? "";
    const name = status?.name ?? "(unknown)";
    console.log(`  Connected to Kibana: ${name}${version ? ` (${version})` : ""}`);
  } catch (err) {
    console.error(`  Connection failed: ${err.message}`);
    rl.close();
    process.exit(1);
  }

  // Dashboard selection
  console.log("\nAvailable dashboards:\n");
  dashboards.forEach((d, i) => console.log(`  ${i + 1}. ${d.title}`));
  const allIndex = dashboards.length + 1;
  console.log(`  ${allIndex}. all  (install every dashboard)`);
  console.log("");

  const selectionInput = await prompt(rl, `Enter number(s) comma-separated, or "all":\n> `);
  rl.close();

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
      if (!seen.has(d.id)) {
        seen.add(d.id);
        selected.push(d);
      }
    }
  }

  if (selected.length === 0) {
    console.log("\nNo dashboards selected. Exiting.");
    process.exit(0);
  }

  // Install
  console.log(`\nInstalling ${selected.length} dashboard(s)...\n`);

  let installedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const { id, title, raw } of selected) {
    try {
      const existing = await client.getSavedObject("dashboard", id);

      if (existing !== null) {
        console.log(`  ✓ "${title}" — already installed, skipping`);
        skippedCount++;
        continue;
      }

      const result = await client.importSavedObject(raw, false);

      const success = result?.success === true || result?.successResults?.some((r) => r.id === id);

      if (success) {
        console.log(`  ✓ "${title}" — installed (id: ${id})`);
        installedCount++;
      } else {
        const errors = result?.errors ?? result?.successResults ?? result;
        console.error(
          `  ✗ "${title}" — import returned unexpected result:`,
          JSON.stringify(errors)
        );
        failedCount++;
      }
    } catch (err) {
      console.error(`  ✗ "${title}" — FAILED: ${err.message}`);
      failedCount++;
    }
  }

  console.log("");
  console.log(
    `Installed ${installedCount} / ${selected.length} dashboard(s).` +
      (skippedCount > 0 ? ` (${skippedCount} already installed, skipped)` : "") +
      (failedCount > 0 ? ` (${failedCount} failed)` : "")
  );
  console.log("Done.");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
