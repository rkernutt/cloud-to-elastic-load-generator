#!/usr/bin/env node
/**
 * Kibana Alert-enrichment Workflow Installer
 *
 * Installs, deletes, or reinstalls the bundled
 * `data-pipeline-alert-enrichment.yaml` Kibana Workflow on any Stack 9.3+
 * deployment. Mirrors the wizard's behaviour so headless / CI installs stay
 * in sync with the UI:
 *   - text-replace overrides for `notifyTo` / `emailConnector` inputs
 *   - auto-detect Kibana 9.4+ → swap legacy step for `cases.createCase`
 *   - pre-flight warns if the email connector is missing on this deployment
 *
 * Run with:  node installer/workflow-installer/index.mjs
 *            or: npm run setup:workflow
 *
 * Node 18+, no external dependencies.
 */

import readline from "readline";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { join, dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── YAML load + override helpers ────────────────────────────────────────────

const WORKFLOW_YAML_PATH = join(
  __dirname,
  "..",
  "..",
  "workflows",
  "data-pipeline-alert-enrichment.yaml"
);

function loadWorkflowYaml() {
  return readFileSync(WORKFLOW_YAML_PATH, "utf8");
}

const DEFAULT_WORKFLOW_NAME = "Data Pipeline Alert — CMDB Enrichment & Notification";

function replaceInputDefault(yaml, inputName, value) {
  const escapedKey = inputName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedVal = value.replace(/"/g, '\\"');
  const re = new RegExp(
    `(^\\s*-\\s+name:\\s*${escapedKey}\\s*\\n(?:\\s+\\S.*\\n)*?\\s+default:\\s*)["']?[^"'\\n]+["']?`,
    "m"
  );
  return yaml.replace(re, `$1"${escapedVal}"`);
}

const LEGACY_CASE_STEP_START =
  "      - name: create_case\n        type: kibana.createCaseDefaultSpace\n";
const ALT_BLOCK_START = "      # ─── Stack 9.4+ alternative ";
const ALT_BLOCK_END = "syncAlerts: false";

function swap94CaseStep(yaml) {
  const startIdx = yaml.indexOf(LEGACY_CASE_STEP_START);
  if (startIdx < 0) return yaml;
  const altIdx = yaml.indexOf(ALT_BLOCK_START, startIdx);
  if (altIdx < 0) return yaml;
  const altEndMarker = yaml.indexOf(ALT_BLOCK_END, altIdx);
  if (altEndMarker < 0) return yaml;
  const altEndOfLine = yaml.indexOf("\n", altEndMarker);
  if (altEndOfLine < 0) return yaml;

  const replacement =
    "      - name: create_case\n" +
    "        type: cases.createCase\n" +
    "        with:\n" +
    '          owner: "observability"\n' +
    '          title: "Pipeline Alert Escalation: {{ event.alerts[0].kibana.alert.rule.name }}"\n' +
    "          description: |\n" +
    "            ## Alert Details\n" +
    "            **Rule:** {{ event.alerts[0].kibana.alert.rule.name }}\n" +
    "            **Message:** {{ event.alerts[0].message }}\n" +
    "\n" +
    "            ## Affected Infrastructure\n" +
    "            **CI:** {{ steps.lookup_affected_ci.output.hits.hits[0]._source.servicenow.event.name.value }}\n" +
    "            **Owner:** {{ steps.lookup_affected_ci.output.hits.hits[0]._source.servicenow.event.owned_by.display_value }}\n" +
    "            **Support Group:** {{ steps.lookup_affected_ci.output.hits.hits[0]._source.servicenow.event.support_group.display_value }}\n" +
    "\n" +
    "            ## Pipeline User\n" +
    "            **Triggered by:** {{ steps.find_pipeline_user.output.hits.hits[0]._source.user.name }}\n" +
    "            **Email:** {{ steps.lookup_servicenow_user.output.hits.hits[0]._source.servicenow.event.email.value }}\n" +
    "            **Phone:** {{ steps.lookup_servicenow_user.output.hits.hits[0]._source.servicenow.event.phone.value }}\n" +
    "\n" +
    "            ## Open Incidents ({{ steps.find_open_incidents.output.hits.total.value }})\n" +
    "            This CI has multiple open incidents. Escalating for review.\n" +
    '          severity: "high"\n' +
    "          tags: [data-pipeline, escalation, workflow-generated]\n" +
    "          settings:\n" +
    "            syncAlerts: false";

  let trailingNewlines = altEndOfLine + 1;
  while (yaml[trailingNewlines] === "\n") trailingNewlines++;
  return yaml.slice(0, startIdx) + replacement + "\n\n" + yaml.slice(trailingNewlines);
}

function applyOverrides(yaml, { notifyTo, emailConnector, use94CasesStep }) {
  let out = yaml;
  if (notifyTo) out = replaceInputDefault(out, "notifyTo", notifyTo);
  if (emailConnector) out = replaceInputDefault(out, "emailConnector", emailConnector);
  if (use94CasesStep) out = swap94CaseStep(out);
  return out;
}

// ─── Kibana client ──────────────────────────────────────────────────────────

function createReadline() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function prompt(rl, question) {
  return new Promise((resolve) => rl.question(question, (a) => resolve(a.trim())));
}

function normalizeBaseUrl(u) {
  return u.replace(/\/+$/, "");
}

function createKibanaClient(baseUrl, apiKey) {
  const base = normalizeBaseUrl(baseUrl);
  const headers = {
    Authorization: `ApiKey ${apiKey}`,
    "Elastic-Api-Version": "2023-10-31",
    "kbn-xsrf": "true",
  };

  async function request(method, path, { body, allow404 = false } = {}) {
    const url = `${base}${path}`;
    const opts = { method, headers: { ...headers } };
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    const text = await res.text();
    if (allow404 && res.status === 404) return { _status: 404, _body: null };
    if (!res.ok) {
      throw new Error(
        `Kibana ${method} ${path} → HTTP ${res.status}\n${text.slice(0, 500) || "(empty body)"}`
      );
    }
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  return {
    async testConnection() {
      return request("GET", "/api/status");
    },
    async getConnector(id) {
      return request("GET", `/api/actions/connector/${encodeURIComponent(id)}`, { allow404: true });
    },
    async findWorkflowByName(name) {
      // 9.5+ exposes the list at /api/workflows; we filter by name client-side
      // so we don't depend on a server-side `?search=` query that's still in flux.
      const raw = await request("GET", "/api/workflows", { allow404: true });
      if (!raw || raw._status === 404) return null;
      const list = raw.results ?? raw.data ?? [];
      for (const entry of list) {
        if (entry && entry.name === name && typeof entry.id === "string") return entry.id;
      }
      return null;
    },
    async createWorkflow(body) {
      // Stack 9.5+ replaced the legacy singular POST /api/workflows/_workflows with
      // a bulk create at POST /api/workflows that takes { workflows: [...] }. We
      // wrap a single create so callers don't need to know the shape difference.
      const raw = await request("POST", "/api/workflows", {
        body: { workflows: [body] },
      });
      const created = raw?.created?.[0];
      if (!created) {
        const err = raw?.errors?.[0];
        if (err)
          throw new Error(`Workflows API rejected create: ${err.error ?? JSON.stringify(err)}`);
        throw new Error("Workflows API returned no id on create");
      }
      return created;
    },
    async updateWorkflow(id, body) {
      return request("PUT", `/api/workflows/workflow/${encodeURIComponent(id)}`, { body });
    },
    async setWorkflowEnabled(id, enabled) {
      // Workflows on Kibana 9.5 silently drop the `enabled` field when it's
      // bundled with `yaml` in a full PUT body (elastic/kibana#252676).
      // Sending a *partial* PUT with only `{ enabled }` works reliably.
      return request("PUT", `/api/workflows/workflow/${encodeURIComponent(id)}`, {
        body: { enabled: !!enabled },
      });
    },
    async deleteWorkflow(id) {
      return request("DELETE", `/api/workflows/workflow/${encodeURIComponent(id)}`, {
        allow404: true,
      });
    },
    async listPreconfiguredEmailConnectors() {
      // Used to auto-suggest a working `emailConnector` when the bundled default
      // (e.g. `elastic-cloud-email`) is not present on the user's deployment.
      const list = await request("GET", "/api/actions/connectors", { allow404: true });
      if (!Array.isArray(list)) return [];
      return list.filter((c) => c?.connector_type_id === ".email" && c?.is_preconfigured === true);
    },
  };
}

// ─── Deployment / TLS helpers (mirrors alert-rules-installer) ───────────────

const DEPLOYMENT_TYPES = [
  { id: "self-managed", label: "Self-Managed  (on-premises, Docker, VM)" },
  { id: "cloud-hosted", label: "Elastic Cloud Hosted  (cloud.elastic.co)" },
  { id: "serverless", label: "Elastic Serverless  (cloud.elastic.co/serverless)" },
];

async function promptDeploymentType(rl) {
  console.log("\nSelect your Elastic deployment type:\n");
  DEPLOYMENT_TYPES.forEach(({ label }, i) => console.log(`  ${i + 1}. ${label}`));
  console.log("");
  while (true) {
    const input = await prompt(rl, "Enter 1, 2, or 3:\n> ");
    const idx = parseInt(input, 10) - 1;
    if (idx >= 0 && idx < DEPLOYMENT_TYPES.length) return DEPLOYMENT_TYPES[idx].id;
    console.error("  Please enter 1, 2, or 3.");
  }
}

async function maybeSkipTls(rl, deploymentType) {
  if (deploymentType !== "self-managed") return;
  const answer = await prompt(
    rl,
    "Skip TLS certificate verification? (self-signed / internal CA) (y/N):\n> "
  );
  if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    console.log("  ⚠  TLS verification disabled.\n");
  }
}

function getKibanaUrlExample(t) {
  if (t === "self-managed") return "http://localhost:5601";
  if (t === "serverless") return "https://my-deployment.kibana.elastic.cloud";
  return "https://my-deployment.kibana.us-east-1.aws.elastic-cloud.com:9243";
}

function detectMajorMinor(versionStr) {
  if (typeof versionStr !== "string") return null;
  const m = versionStr.match(/^(\d+)\.(\d+)/);
  if (!m) return null;
  return { major: parseInt(m[1], 10), minor: parseInt(m[2], 10) };
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("");
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║       Kibana Alert-Enrichment Workflow Installer     ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log("");
  console.log("Installs the bundled data-pipeline-alert-enrichment Kibana Workflow.");
  console.log("Requires Stack 9.3+ with the Workflows plugin enabled and an Enterprise");
  console.log("licence. Self-hosted clusters also need `workflows:ui:enabled = true`.");
  console.log("");

  const rl = createReadline();
  const deploymentType = await promptDeploymentType(rl);
  await maybeSkipTls(rl, deploymentType);

  const kbUrl = await prompt(
    rl,
    `\nKibana base URL (e.g. ${getKibanaUrlExample(deploymentType)}):\n> `
  );
  if (!kbUrl) {
    console.error("No URL provided. Exiting.");
    rl.close();
    process.exit(1);
  }
  if (
    deploymentType === "self-managed" ? !/^https?:\/\//.test(kbUrl) : !kbUrl.startsWith("https://")
  ) {
    console.error("Invalid URL scheme. Exiting.");
    rl.close();
    process.exit(1);
  }

  const apiKey = await prompt(
    rl,
    "\nElastic API Key (Kibana, with Workflows + Connectors privileges):\n> "
  );
  if (!apiKey) {
    console.error("No API key provided. Exiting.");
    rl.close();
    process.exit(1);
  }

  const client = createKibanaClient(kbUrl, apiKey);

  console.log("\nTesting connection...");
  let kbVersion = null;
  try {
    const status = await client.testConnection();
    const verStr =
      status?.version?.number ?? (typeof status?.version === "string" ? status.version : "");
    kbVersion = detectMajorMinor(verStr);
    console.log(`  Connected to ${status?.name ?? "Kibana"}${verStr ? ` (${verStr})` : ""}.`);
  } catch (err) {
    console.error(`  Connection failed: ${err.message}`);
    rl.close();
    process.exit(1);
  }

  console.log("\nWhat would you like to do?\n");
  console.log("  1. Install workflow");
  console.log("  2. Delete workflow");
  console.log("  3. Reinstall (delete then install)");
  console.log("");
  let mode = null;
  while (mode === null) {
    const input = await prompt(rl, "Enter 1, 2, or 3:\n> ");
    if (input === "1") mode = "install";
    else if (input === "2") mode = "delete";
    else if (input === "3") mode = "reinstall";
    else console.error("  Please enter 1, 2, or 3.");
  }
  console.log("");

  let notifyTo = "data-platform-oncall@example.com";
  let emailConnector = "elastic-cloud-email";
  let use94CasesStep = !!(
    kbVersion &&
    (kbVersion.major > 9 || (kbVersion.major === 9 && kbVersion.minor >= 4))
  );

  if (mode !== "delete") {
    const customise = await prompt(
      rl,
      "Override default notifyTo / emailConnector inputs? (y/N)\n> "
    );
    if (customise.toLowerCase() === "y" || customise.toLowerCase() === "yes") {
      const a = await prompt(rl, `  emailConnector [${emailConnector}]:\n  > `);
      if (a) emailConnector = a;
      const b = await prompt(rl, `  notifyTo [${notifyTo}]:\n  > `);
      if (b) notifyTo = b;
    }
    if (kbVersion) {
      console.log(
        `\nDetected Kibana ${kbVersion.major}.${kbVersion.minor} — using ${
          use94CasesStep
            ? "cases.createCase (9.4+)"
            : "kibana.createCaseDefaultSpace (9.3-compatible)"
        } step.`
      );
    }
  }

  rl.close();

  // ── Delete / Reinstall: delete phase ──────────────────────────────────────
  if (mode === "delete" || mode === "reinstall") {
    console.log("\nLooking up existing workflow...");
    try {
      const id = await client.findWorkflowByName(DEFAULT_WORKFLOW_NAME);
      if (!id) {
        console.log(`  – Workflow "${DEFAULT_WORKFLOW_NAME}" not found, nothing to delete.`);
      } else {
        await client.deleteWorkflow(id);
        console.log(`  ✓ Deleted workflow id=${id}`);
      }
    } catch (err) {
      console.error(`  ✗ Delete failed: ${err.message}`);
      if (mode === "delete") process.exit(1);
    }
    if (mode === "delete") {
      console.log("\nDone.");
      return;
    }
  }

  // ── Install / Reinstall: install phase ───────────────────────────────────
  let yaml;
  try {
    yaml = loadWorkflowYaml();
  } catch (err) {
    console.error(`Failed to read ${WORKFLOW_YAML_PATH}: ${err.message}`);
    process.exit(1);
  }
  yaml = applyOverrides(yaml, { notifyTo, emailConnector, use94CasesStep });

  console.log("\nPre-flighting email connector...");
  try {
    const conn = await client.getConnector(emailConnector);
    if (!conn || conn._status === 404) {
      // Default is missing — try to find a preconfigured email connector and offer to use it
      // (Cloud Hosted ships `elastic-cloud-email`, Serverless ships `Elastic-Cloud-SMTP`,
      // self-hosted deployments only have what the operator preconfigures in kibana.yml).
      let alternates = [];
      try {
        alternates = await client.listPreconfiguredEmailConnectors();
      } catch {
        /* enumeration failed — fall through to the warning */
      }
      if (alternates.length > 0) {
        const ids = alternates.map((c) => c.id).join(", ");
        console.warn(
          `  ⚠ Connector "${emailConnector}" not found, but ${alternates.length} preconfigured ` +
            `email connector(s) are available: ${ids}.`
        );
        const swap = await prompt(rl, `Use "${alternates[0].id}" for this install? (Y/n):\n> `);
        if (swap.toLowerCase() !== "n" && swap.toLowerCase() !== "no") {
          emailConnector = alternates[0].id;
          console.log(`  ✓ Using preconfigured connector "${emailConnector}".`);
        } else {
          console.warn(
            `    Keeping "${emailConnector}". The workflow will install but its first run will ` +
              `abort at the pre-flight step until the connector exists.`
          );
        }
      } else {
        console.warn(
          `  ⚠ Connector "${emailConnector}" not found on this deployment, and no preconfigured\n` +
            `    email connector was advertised by /api/actions/connectors.\n` +
            `    The workflow will install but its first run will abort at the pre-flight step.\n` +
            `    Self-hosted: preconfigure the connector in kibana.yml or pass a different ID next run.`
        );
      }
    } else {
      console.log(`  ✓ Connector "${emailConnector}" found.`);
    }
  } catch (err) {
    console.warn(`  ⚠ Could not verify connector "${emailConnector}": ${err.message}`);
  }

  console.log("\nInstalling workflow...");
  try {
    const existingId = await client.findWorkflowByName(DEFAULT_WORKFLOW_NAME);
    const body = {
      name: DEFAULT_WORKFLOW_NAME,
      description: "",
      yaml,
      // Install DISABLED — users must explicitly enable in Kibana after
      // reviewing the notification step and attaching the workflow to rules.
      enabled: false,
      tags: ["data-pipeline", "servicenow", "enrichment", "automated-response"],
    };
    let installedId;
    if (existingId) {
      await client.updateWorkflow(existingId, body);
      // Kibana #252676 — full PUT silently keeps the previous enabled state
      // when `yaml` is in the body. Force-disable with a partial PUT.
      await client.setWorkflowEnabled(existingId, false);
      installedId = existingId;
      console.log(`  ✓ Updated existing workflow (id=${existingId}, DISABLED).`);
    } else {
      const created = await client.createWorkflow(body);
      installedId = created?.id ?? created?.workflow?.id ?? null;
      console.log(`  ✓ Created workflow (id=${installedId ?? "(unknown)"}, DISABLED).`);
    }
    console.log("");
    console.log("Next steps (manual, in order):");
    console.log("  1) Review the notify_email step in Kibana → Stack Management → Workflows,");
    console.log("     or switch to Slack/Teams/PagerDuty/etc. by uncommenting one of the");
    console.log("     alternative blocks in the YAML.");
    console.log("  2) Attach the workflow to your alerting rules — every Cloud Loadgen rule");
    console.log("     installs with actions=[], so it only fires once you wire it up under");
    console.log("     Stack Management → Rules → <rule> → Actions → Workflow.");
    console.log(
      "  3) Only then flip the workflow's Enabled toggle in Stack Management → Workflows."
    );
    console.log("  The install is intentionally disabled so a misconfigured connector or");
    console.log("  unintended notification cascade can never fire from a fresh install.");
    console.log("");
    console.log("Done.");
  } catch (err) {
    console.error(`  ✗ Install failed: ${err.message}`);
    if (err.message.includes("404")) {
      console.error(
        "    The Workflows API was not found. Stack 9.3+ is required, and self-hosted clusters\n" +
          "    must enable `workflows:ui:enabled = true` in Advanced Settings or kibana.yml."
      );
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
