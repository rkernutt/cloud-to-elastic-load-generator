#!/usr/bin/env node
/**
 * AWS → Elastic Custom Dashboard Installer (Kibana 8.2)
 *
 * Imports pre-built .ndjson saved objects via POST /api/saved_objects/_import.
 * Compatible with Kibana 8.2 (no Dashboard API, no Elastic-Api-Version header).
 *
 * Run with:  node index-82.mjs
 *            npm run setup:aws-dashboards:82
 *
 * NDJSON files live in installer/aws-custom-dashboards/ndjson-82/
 * (coreMigrationVersion: "8.2.0").
 */

import readline from "readline";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const NDJSON_DIR = join(__dirname, "ndjson-82");

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
  console.log("║   AWS → Elastic Dashboard Installer (Kibana 8.2)     ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log("");
  console.log("Imports dashboards via Saved Objects import API.");
  console.log("Reads .ndjson files from ndjson-82/ (overwrite=true).");
  console.log("");
}

function loadNdjsonFiles() {
  if (!existsSync(NDJSON_DIR)) {
    console.error(`No ndjson-82/ directory found at:\n  ${NDJSON_DIR}`);
    process.exit(1);
  }

  const files = readdirSync(NDJSON_DIR).filter((f) => f.endsWith(".ndjson"));
  if (files.length === 0) {
    console.error(`No .ndjson files in ndjson-82/. Add 8.2-compatible exports first.`);
    process.exit(1);
  }

  return files.map((file) => {
    const raw = readFileSync(join(NDJSON_DIR, file), "utf-8").trim();
    let title = file;
    let id = file.replace(/\.ndjson$/, "");
    try {
      const obj = JSON.parse(raw);
      title = obj.attributes?.title ?? title;
      id = obj.id ?? id;
    } catch {
      // use filename fallback
    }
    return { file, id, title, raw };
  });
}

function createKibanaClient(baseUrl, apiKey) {
  const base = baseUrl.replace(/\/+$/, "");
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
    if (!res.ok) {
      let text;
      try {
        text = await res.text();
      } catch {
        text = "(unable to read response)";
      }
      throw new Error(`Kibana ${method} ${path} → HTTP ${res.status}\n${text}`);
    }
    const text = await res.text();
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

    async importNdjson(ndjsonString) {
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

      return request("POST", "/api/saved_objects/_import?overwrite=true", parts, {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      });
    },
  };
}

function importSucceeded(result, expectedId) {
  if (result?.success === true) return true;
  if (Array.isArray(result?.successResults)) {
    return result.successResults.some((r) => r.id === expectedId || r.type === "dashboard");
  }
  if (Array.isArray(result?.successCount) && result.successCount > 0) return true;
  return false;
}

async function main() {
  printHeader();

  const dashboards = loadNdjsonFiles();
  console.log(`Found ${dashboards.length} dashboard file(s) in ndjson-82/.\n`);

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

  rl.close();

  console.log("\nTesting connection...");
  const client = createKibanaClient(kibanaUrl, apiKey);

  try {
    const status = await client.testConnection();
    const version = status?.version?.number ?? "";
    const name = status?.name ?? "(unknown)";
    console.log(`  Connected to Kibana: ${name}${version ? ` (${version})` : ""}`);
  } catch (err) {
    console.error(`  Connection failed: ${err.message}`);
    process.exit(1);
  }

  console.log(`\nImporting ${dashboards.length} dashboard(s) (overwrite=true)...\n`);

  let successCount = 0;
  let failedCount = 0;

  for (const { file, id, title, raw } of dashboards) {
    try {
      const result = await client.importNdjson(raw);
      if (importSucceeded(result, id)) {
        console.log(`  ✓ "${title}" — imported (${file})`);
        successCount++;
      } else {
        const detail = result?.errors ?? result;
        console.error(`  ✗ "${title}" — unexpected import result:`, JSON.stringify(detail));
        failedCount++;
      }
    } catch (err) {
      console.error(`  ✗ "${title}" — FAILED: ${err.message}`);
      failedCount++;
    }
  }

  console.log("");
  console.log(
    `Import complete: ${successCount} succeeded, ${failedCount} failed (${dashboards.length} total).`
  );
  console.log("Done.");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
