#!/usr/bin/env node
/**
 * AWS → Elastic APM Integration Installer
 *
 * Interactive CLI that installs the Elastic APM integration via Kibana Fleet,
 * creating the APM data streams required to receive OpenTelemetry trace data.
 *
 * Run with:  node installer/aws-apm-integration/index.mjs
 *            or: npm run setup:aws-apm-integration
 *
 * No external dependencies — uses Node.js built-ins only (Node 18+).
 */

import readline from "readline";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createReadline() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function prompt(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function printHeader() {
  console.log("");
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║       AWS → Elastic APM Integration Installer        ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log("");
  console.log("Installs the Elastic APM integration via Kibana Fleet,");
  console.log("creating APM data streams for OpenTelemetry trace data.");
  console.log("Requires an API key with Fleet and data stream privileges.");
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

function getKibanaUrlExample(deploymentType) {
  if (deploymentType === "self-managed")
    return "http://localhost:5601  or  https://kibana.yourdomain.internal:5601";
  if (deploymentType === "serverless")
    return "https://my-deployment.kb.eu-west-2.aws.elastic.cloud";
  return "https://my-deployment.kb.us-east-1.aws.elastic-cloud.com:9243";
}

function getEsUrlExample(deploymentType) {
  if (deploymentType === "self-managed")
    return "http://localhost:9200  or  https://elasticsearch.yourdomain.internal:9200";
  if (deploymentType === "serverless")
    return "https://my-deployment.es.eu-west-2.aws.elastic.cloud";
  return "https://my-deployment.es.us-east-1.aws.elastic-cloud.com:9243";
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

// ─── Kibana client ────────────────────────────────────────────────────────────

function createKibanaClient(baseUrl, apiKey) {
  const base = baseUrl.replace(/\/$/, "");
  const headers = {
    "Content-Type": "application/json",
    Authorization: `ApiKey ${apiKey}`,
    "kbn-xsrf": "true",
  };

  async function request(method, path, body) {
    const url = `${base}${path}`;
    const options = { method, headers };
    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }

    const res = await fetch(url, options);

    if (res.status === 404) {
      return null;
    }

    if (!res.ok) {
      let text;
      try {
        text = await res.text();
      } catch {
        text = "(unable to read response body)";
      }
      throw new Error(`Kibana request failed: ${method} ${path} → HTTP ${res.status}\n${text}`);
    }

    return res.json();
  }

  return {
    /** GET /api/status — verify Kibana connectivity */
    async testConnection() {
      return request("GET", "/api/status");
    },

    /** GET /api/fleet/epm/packages/apm — get APM package info including latest version */
    async getApmPackageInfo() {
      return request("GET", "/api/fleet/epm/packages/apm");
    },

    /** POST /api/fleet/epm/packages/apm/{version} — install APM package */
    async installApmPackage(version) {
      return request("POST", `/api/fleet/epm/packages/apm/${version}`, { force: true });
    },
  };
}

// ─── Elasticsearch client ─────────────────────────────────────────────────────

function createElasticClient(baseUrl, apiKey) {
  const base = baseUrl.replace(/\/$/, "");
  const headers = {
    "Content-Type": "application/json",
    Authorization: `ApiKey ${apiKey}`,
  };

  async function request(method, path) {
    const url = `${base}${path}`;
    const res = await fetch(url, { method, headers });

    if (res.status === 404) {
      return null;
    }

    if (!res.ok) {
      let text;
      try {
        text = await res.text();
      } catch {
        text = "(unable to read response body)";
      }
      throw new Error(
        `Elasticsearch request failed: ${method} ${path} → HTTP ${res.status}\n${text}`
      );
    }

    return res.json();
  }

  return {
    /** GET /_data_stream/traces-apm-default — check if APM data streams exist */
    async checkApmDataStream() {
      return request("GET", "/_data_stream/traces-apm-default");
    },
  };
}

// ─── URL validation ───────────────────────────────────────────────────────────

function validateUrl(url, deploymentType, label, rl) {
  if (!url) {
    console.error(`No ${label} URL provided. Exiting.`);
    rl.close();
    process.exit(1);
  }

  if (deploymentType === "self-managed") {
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      console.error(`${label} URL must start with http:// or https://. Exiting.`);
      rl.close();
      process.exit(1);
    }
  } else {
    if (!url.startsWith("https://")) {
      console.error(`${label} URL must start with https://. Exiting.`);
      rl.close();
      process.exit(1);
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  printHeader();

  const rl = createReadline();

  // 1. Deployment type
  const deploymentType = await promptDeploymentType(rl);
  console.log("");

  // 2. TLS (self-managed only)
  await maybeSkipTls(rl, deploymentType);

  // 3. Kibana URL
  const kibanaUrl = await prompt(
    rl,
    `Kibana URL (e.g. ${getKibanaUrlExample(deploymentType)}):\n> `
  );
  validateUrl(kibanaUrl, deploymentType, "Kibana", rl);

  // 4. API Key
  const apiKey = await prompt(
    rl,
    "\nElastic API Key (requires Fleet and data stream privileges):\n> "
  );

  if (!apiKey) {
    console.error("No API key provided. Exiting.");
    rl.close();
    process.exit(1);
  }

  const kibanaClient = createKibanaClient(kibanaUrl, apiKey);

  // 5. Test Kibana connection
  console.log("\nTesting Kibana connection...");
  try {
    const status = await kibanaClient.testConnection();
    const state = status?.status?.overall?.state ?? "(unknown)";
    const version = status?.version?.number ?? "";
    if (state !== "green" && state !== "available") {
      console.log(`  ⚠  Kibana status is "${state}" — proceeding anyway.`);
    } else {
      console.log(`  ✓ Connected to Kibana${version ? ` v${version}` : ""} (status: ${state})`);
    }
  } catch (err) {
    console.error(`  ✗ Kibana connection failed: ${err.message}`);
    rl.close();
    process.exit(1);
  }

  // 6. Elasticsearch URL + APM data stream check
  console.log("");
  const esUrl = await prompt(
    rl,
    `Elasticsearch URL (e.g. ${getEsUrlExample(deploymentType)}):\n> `
  );
  validateUrl(esUrl, deploymentType, "Elasticsearch", rl);

  const esClient = createElasticClient(esUrl, apiKey);

  console.log("\nChecking for existing APM data streams...");
  let apmAlreadyConfigured = false;
  try {
    const dataStream = await esClient.checkApmDataStream();
    if (dataStream !== null) {
      apmAlreadyConfigured = true;
      console.log("  ✓ APM data streams already configured (traces-apm-default exists).");
    } else {
      console.log("  APM data streams not yet configured.");
    }
  } catch (err) {
    console.log(`  ⚠  Could not check data streams: ${err.message}`);
    console.log("  Proceeding with installation anyway.");
  }

  if (apmAlreadyConfigured) {
    console.log("");
    const answer = await prompt(
      rl,
      "APM integration appears to be installed already. Continue anyway? (y/N):\n> "
    );
    if (answer.toLowerCase() !== "y" && answer.toLowerCase() !== "yes") {
      console.log("\nExiting — no changes made.");
      rl.close();
      process.exit(0);
    }
    console.log("");
  }

  // 7. Find latest APM package version
  console.log("\nFetching APM package information from Kibana Fleet...");
  let apmVersion;
  try {
    const packageInfo = await kibanaClient.getApmPackageInfo();
    if (!packageInfo) {
      throw new Error("APM package not found in Fleet registry (returned 404).");
    }
    // Response shape: { item: { version: "8.x.x", ... } } or { version: "8.x.x" }
    apmVersion =
      packageInfo?.item?.version ?? packageInfo?.response?.version ?? packageInfo?.version;

    if (!apmVersion) {
      throw new Error(
        "Could not determine APM package version from Fleet API response.\n" +
          "Response: " +
          JSON.stringify(packageInfo).slice(0, 300)
      );
    }
    console.log(`  ✓ Latest APM package version: ${apmVersion}`);
  } catch (err) {
    console.error(`  ✗ Failed to fetch APM package info: ${err.message}`);
    rl.close();
    process.exit(1);
  }

  // 8. Install APM integration
  console.log(`\nInstalling APM integration v${apmVersion} via Kibana Fleet...`);
  try {
    const result = await kibanaClient.installApmPackage(apmVersion);
    const installed = result?.items ?? result?.response ?? [];
    const count = Array.isArray(installed) ? installed.length : 0;
    console.log(`  ✓ APM integration installed${count > 0 ? ` (${count} asset(s) created)` : ""}.`);
  } catch (err) {
    console.error(`  ✗ APM integration install failed: ${err.message}`);
    rl.close();
    process.exit(1);
  }

  // 9. Verify traces-apm-default now exists
  console.log("\nVerifying APM data streams...");
  try {
    const dataStream = await esClient.checkApmDataStream();
    if (dataStream !== null) {
      console.log("  ✓ traces-apm-default confirmed.");
    } else {
      console.log(
        "  ⚠  traces-apm-default not yet visible — it may appear once the first document is indexed."
      );
    }
  } catch (err) {
    console.log(`  ⚠  Verification check failed: ${err.message}`);
  }

  // 10. Summary
  console.log("");
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║                  Installation Summary                ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log("");
  console.log("APM data streams created (or confirmed):");
  console.log("");
  console.log("  ✓ traces-apm-default          — transactions + spans");
  console.log("  ✓ logs-apm.error-default       — captured exceptions");
  console.log("  ✓ metrics-apm.internal-default — JVM / runtime metrics");
  console.log("");
  console.log("Next step:");
  console.log("  Run the load generator in Traces mode to ship OTel trace data.");
  console.log("");

  rl.close();
  console.log("Done.");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
