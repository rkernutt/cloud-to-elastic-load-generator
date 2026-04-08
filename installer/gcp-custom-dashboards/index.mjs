#!/usr/bin/env node
/**
 * GCP → Elastic Custom Dashboard Installer
 *
 * Interactive CLI that installs Kibana dashboards for GCP services monitored
 * by the GCP load generator (ES|QL over logs-gcp.*).
 *
 * Run with:  node index.mjs
 *            npm run setup:gcp-dashboards
 *
 * No external dependencies — uses Node.js built-ins only.
 *
 * Install strategy (tried in order):
 *   1. POST /api/dashboards  (Kibana 9.4+ — Cloud Hosted, Self-Managed)
 *   2. POST /api/saved_objects/_import  (Kibana 8.11+ — fallback for Serverless)
 */

import readline from "readline";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const NDJSON_DIR = join(__dirname, "ndjson");

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
  console.log("║     GCP → Elastic Custom Dashboard Installer         ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log("");
  console.log("Installs Kibana dashboards for GCP services (logs-gcp.*).");
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

// ─── Dashboard discovery ─────────────────────────────────────────────────────

function loadDashboards() {
  const files = readdirSync(__dirname).filter((f) => f.endsWith("-dashboard.json"));
  return files.map((file) => {
    const def = JSON.parse(readFileSync(join(__dirname, file), "utf-8"));

    // Load matching pre-generated ndjson for fallback import
    let ndjson = null;
    const ndjsonPath = join(NDJSON_DIR, file.replace("-dashboard.json", "-dashboard.ndjson"));
    if (existsSync(ndjsonPath)) {
      const raw = readFileSync(ndjsonPath, "utf-8").trim();
      const obj = JSON.parse(raw);
      ndjson = { raw, id: obj.id };
    }

    return { file, title: def.title, definition: def, ndjson };
  });
}

// ─── Kibana client ───────────────────────────────────────────────────────────

function createKibanaClient(baseUrl, apiKey) {
  const base = baseUrl.replace(/\/$/, "");
  const authHeaders = {
    Authorization: `ApiKey ${apiKey}`,
    "kbn-xsrf": "true",
  };

  async function request(method, path, body, extraHeaders = {}) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...authHeaders, ...extraHeaders },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 404) return null;

    if (!res.ok) {
      let text;
      try {
        text = await res.text();
      } catch {
        text = "(unable to read response)";
      }
      throw new Error(`Kibana request failed: ${method} ${path} → HTTP ${res.status}\n${text}`);
    }

    return res.json();
  }

  return {
    async testConnection() {
      return request("GET", "/api/status");
    },

    /** Find a dashboard by title via saved objects search. Returns null if unavailable. */
    async findDashboardByTitle(title) {
      const encoded = encodeURIComponent(title);
      try {
        const result = await request(
          "GET",
          `/api/saved_objects/_find?type=dashboard&search_fields=title&search=${encoded}&per_page=10`
        );
        if (!result?.saved_objects) return null;
        return result.saved_objects.find((obj) => obj.attributes?.title === title) ?? null;
      } catch (err) {
        if (isUnavailable(err)) return null; // API not available on this deployment
        throw err;
      }
    },

    /** Find a dashboard by its deterministic ID. Returns null if not found or API unavailable. */
    async getSavedObjectById(type, id) {
      try {
        return await request("GET", `/api/saved_objects/${type}/${encodeURIComponent(id)}`);
      } catch (err) {
        if (isUnavailable(err)) return null;
        throw err;
      }
    },

    /** Find a data view by its index pattern title. Returns null if not found. */
    async findDataView(title) {
      try {
        const result = await request("GET", "/api/data_views");
        const views = result?.data_view ?? [];
        return views.find((v) => v.title === title) ?? null;
      } catch (err) {
        if (isUnavailable(err)) return null;
        throw err;
      }
    },

    /** Create a data view. Returns the created data view or throws. */
    async createDataView(title, timeFieldName = "@timestamp", name = "") {
      return request("POST", "/api/data_views/data_view", {
        data_view: { title, timeFieldName, name: name || title },
      });
    },

    /** Create via Kibana Dashboards API (9.4+). */
    async createDashboard(definition) {
      const { id, spaces, ...body } = definition;
      return request("POST", "/api/dashboards", body, { "Elastic-Api-Version": "1" });
    },

    /** Delete a dashboard by saved-object ID. Returns null if not found. */
    async deleteDashboard(id) {
      return request("DELETE", `/api/saved_objects/dashboard/${encodeURIComponent(id)}`);
    },

    /** Import via Saved Objects API (8.11+). Builds multipart form-data manually. */
    async importSavedObject(ndjsonString) {
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

      const res = await fetch(`${base}/api/saved_objects/_import?overwrite=false`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": `multipart/form-data; boundary=${boundary}` },
        body: parts,
      });

      if (!res.ok) {
        let text;
        try {
          text = await res.text();
        } catch {
          text = "(unable to read response)";
        }
        throw new Error(
          `Kibana request failed: POST /api/saved_objects/_import → HTTP ${res.status}\n${text}`
        );
      }
      return res.json();
    },
  };
}

/** Returns true when the error is an "endpoint exists but unavailable" 400. */
function isUnavailable(err) {
  return (
    err.message.includes("HTTP 400") &&
    (err.message.includes("not available") || err.message.includes("configuration"))
  );
}

// ─── Version-aware NDJSON patching ───────────────────────────────────────────

/**
 * Parse a Kibana version string into { major, minor, patch }.
 * Returns { major: 0, minor: 0, patch: 0 } when the version is unknown.
 */
function parseVersion(versionStr) {
  const [major = 0, minor = 0, patch = 0] = (versionStr ?? "0.0.0")
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
  return { major, minor, patch };
}

/**
 * Patch a pre-generated NDJSON saved-object string so that lnsPie (pie/donut)
 * visualizations include all fields required by the detected Kibana version.
 *
 * Known version differences for lnsPie (confirmed from export analysis):
 *   8.0–8.12   baseline — no colorMapping
 *   8.13–9.x   layers need legendStats[], truncateLegend, maxLegendLines
 *   10.0+      layers need colorMapping (replaces palette/legendStats approach)
 *
 * If the NDJSON cannot be parsed this function returns it unchanged.
 */
function patchNdjsonForVersion(ndjsonString, kibanaVersion) {
  const v = parseVersion(kibanaVersion);

  let obj;
  try {
    obj = JSON.parse(ndjsonString);
  } catch {
    return ndjsonString;
  }

  if (!obj.attributes?.panelsJSON) return ndjsonString;

  let panels;
  try {
    panels = JSON.parse(obj.attributes.panelsJSON);
  } catch {
    return ndjsonString;
  }

  let changed = false;

  for (const panel of panels) {
    const attrs = panel.embeddableConfig?.attributes;
    if (!attrs || attrs.visualizationType !== "lnsPie") continue;

    const viz = attrs.state?.visualization;
    if (!viz || !Array.isArray(viz.layers)) continue;

    for (const layer of viz.layers) {
      // 10.0+ — colorMapping required on each layer
      if (v.major >= 10 && !layer.colorMapping) {
        layer.colorMapping = {
          assignments: [],
          specialAssignments: [
            { rules: [{ type: "other" }], color: { type: "loop" }, touched: false },
          ],
          paletteId: "default",
          colorMode: { type: "categorical" },
        };
        changed = true;
      }

      // 8.13–9.x — legendStats / truncateLegend / maxLegendLines required
      if ((v.major === 8 && v.minor >= 13) || v.major === 9) {
        if (!("legendStats" in layer)) {
          layer.legendStats = [];
          changed = true;
        }
        if (!("truncateLegend" in layer)) {
          layer.truncateLegend = true;
          changed = true;
        }
        if (!("maxLegendLines" in layer)) {
          layer.maxLegendLines = 1;
          changed = true;
        }
      }
    }
  }

  if (changed) {
    obj.attributes.panelsJSON = JSON.stringify(panels);
    obj.typeMigrationVersion = kibanaVersion;
  }

  return JSON.stringify(obj);
}

// ─── Install one dashboard ────────────────────────────────────────────────────
//
// Install strategy by Kibana version:
//
//   9.4+   Dashboards API first → patched NDJSON import fallback
//   <9.4   Patched NDJSON import first → Dashboards API fallback
//   unknown  Dashboards API first → NDJSON import fallback (original behaviour)

async function installOne(client, title, definition, ndjson, kibanaVersion = "") {
  // 1. Check for existing dashboard by title
  const existing = await client.findDashboardByTitle(title);
  if (existing !== null) return { status: "skipped" };

  const v = parseVersion(kibanaVersion);
  const is94Plus = kibanaVersion && (v.major > 9 || (v.major === 9 && v.minor >= 4));
  const useNdjsonFirst = !!(ndjson && kibanaVersion && !is94Plus);

  // 2a. Dashboards API — primary for 9.4+ and unknown versions
  if (!useNdjsonFirst) {
    try {
      const result = await client.createDashboard(definition);
      const id = result?.id ?? result?.data?.id ?? "(unknown id)";
      return { status: "installed", id, via: "Dashboards API" };
    } catch (err) {
      if (!isUnavailable(err)) throw err;
      // Not available on this deployment — fall through to NDJSON import
    }
  }

  // 2b. Patched NDJSON import — primary for <9.4, fallback for 9.4+/unknown
  if (!ndjson) {
    throw new Error(
      "Dashboards API unavailable on this deployment and no pre-generated ndjson found.\n" +
        "       Run 'npm run gen:gcp-dashboards' (or regenerate ndjson) then retry."
    );
  }

  const existingById = await client.getSavedObjectById("dashboard", ndjson.id);
  if (existingById !== null) return { status: "skipped" };

  const patchedRaw = kibanaVersion ? patchNdjsonForVersion(ndjson.raw, kibanaVersion) : ndjson.raw;
  const wasPatched = patchedRaw !== ndjson.raw;

  const result = await client.importSavedObject(patchedRaw);
  const success =
    result?.success === true || result?.successResults?.some((r) => r.id === ndjson.id);

  if (!success) {
    const errors = result?.errors ?? result?.successResults ?? result;
    throw new Error(`Import returned unexpected result: ${JSON.stringify(errors)}`);
  }

  // 2c. If NDJSON was primary (<9.4) and succeeded, we're done.
  //     If it was the fallback (9.4+/unknown), also done.
  return { status: "installed", id: ndjson.id, via: "Saved Objects import", patched: wasPatched };
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
    { title: "logs-gcp.*", name: "GCP logs (load generator)" },
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
        "and generate ndjson from installer/gcp-custom-dashboards/ if needed."
    );
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
