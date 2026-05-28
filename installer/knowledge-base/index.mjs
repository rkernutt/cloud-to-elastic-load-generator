#!/usr/bin/env node

/**
 * Knowledge Base installer for Agent Builder.
 *
 * Creates an Elasticsearch index with semantic_text support (or plain text
 * fallback) and bulk-indexes runbooks, chain references, SOC guides, and
 * embedded rule investigation guides.
 *
 * Usage:
 *   npm run setup:knowledge-base
 *   node installer/knowledge-base/index.mjs
 */

import { createInterface } from "readline";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { generate } from "./generate-kb-documents.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const KB_INDEX = "kb-cloudloadgen-soc";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

function banner() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║   Knowledge Base Installer — Agent Builder SOC Enhancement    ║
╚═══════════════════════════════════════════════════════════════╝

Indexes runbooks, chain references, and investigation guides into
Elasticsearch so Agent Builder assistants can retrieve contextual
knowledge when investigating security incidents.

Index: ${KB_INDEX}
`);
}

const MAPPING_SEMANTIC = {
  mappings: {
    properties: {
      "@timestamp": { type: "date" },
      id: { type: "keyword" },
      title: { type: "text", fields: { keyword: { type: "keyword" } } },
      parent_title: { type: "text", fields: { keyword: { type: "keyword" } } },
      content: { type: "semantic_text" },
      source: { type: "keyword" },
      category: { type: "keyword" },
      tags: { type: "keyword" },
      severity: { type: "keyword" },
      risk_score: { type: "integer" },
      mitre_tactic: { type: "keyword" },
      mitre_technique: { type: "keyword" },
      rule_name: { type: "text", fields: { keyword: { type: "keyword" } } },
      rule_id: { type: "keyword" },
    },
  },
  settings: {
    number_of_shards: 1,
    number_of_replicas: 0,
  },
};

const MAPPING_TEXT = {
  mappings: {
    properties: {
      "@timestamp": { type: "date" },
      id: { type: "keyword" },
      title: { type: "text", fields: { keyword: { type: "keyword" } } },
      parent_title: { type: "text", fields: { keyword: { type: "keyword" } } },
      content: { type: "text" },
      source: { type: "keyword" },
      category: { type: "keyword" },
      tags: { type: "keyword" },
      severity: { type: "keyword" },
      risk_score: { type: "integer" },
      mitre_tactic: { type: "keyword" },
      mitre_technique: { type: "keyword" },
      rule_name: { type: "text", fields: { keyword: { type: "keyword" } } },
      rule_id: { type: "keyword" },
    },
  },
  settings: {
    number_of_shards: 1,
    number_of_replicas: 0,
  },
};

async function main() {
  banner();

  const deployType = await ask(
    "Select deployment type:\n  1. Self-Managed\n  2. Elastic Cloud Hosted\n  3. Elastic Serverless\n\nEnter 1, 2, or 3: "
  );

  if (deployType.trim() === "1") {
    const tls = await ask("\nSkip TLS verification? (y/N): ");
    if (tls.trim().toLowerCase() === "y") {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
      console.log("  ⚠  TLS verification disabled.\n");
    }
  }

  const esUrl = (await ask("\nElasticsearch URL: ")).trim().replace(/\/+$/, "");
  const apiKey = (await ask("API Key: ")).trim();

  const headers = {
    Authorization: `ApiKey ${apiKey}`,
    "Content-Type": "application/json",
  };

  // Test connection
  console.log("\nTesting connection…");
  try {
    const res = await fetch(esUrl, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const info = await res.json();
    console.log(`  ✓ Connected to Elasticsearch ${info.version?.number || "unknown"}\n`);
  } catch (e) {
    console.error(`  ✗ Connection failed: ${e.message}`);
    rl.close();
    process.exit(1);
  }

  // Check for ELSER / inference endpoint
  const useSemantic = await ask(
    "Use semantic_text field? Requires ELSER or an inference endpoint.\n" +
      "  y = semantic_text (vector search, requires ML node)\n" +
      "  n = plain text (BM25 keyword search, works everywhere)\n" +
      "\nUse semantic_text? (y/N): "
  );
  const semantic = useSemantic.trim().toLowerCase() === "y";

  if (semantic) {
    console.log("\n  Using semantic_text — Agent Builder will use vector search for retrieval.");
    console.log("  Make sure ELSER v2 is deployed or a compatible inference endpoint exists.\n");
  } else {
    console.log("\n  Using plain text — Agent Builder will use keyword (BM25) search.\n");
  }

  // Generate documents
  console.log("Generating KB documents from project content…\n");
  const docs = generate();

  // Check if index exists
  const indexExists = await fetch(`${esUrl}/${KB_INDEX}`, {
    method: "HEAD",
    headers,
  });

  if (indexExists.ok) {
    const overwrite = await ask(
      `\nIndex "${KB_INDEX}" already exists. Delete and recreate? (y/N): `
    );
    if (overwrite.trim().toLowerCase() !== "y") {
      console.log("Aborted.");
      rl.close();
      return;
    }
    await fetch(`${esUrl}/${KB_INDEX}`, { method: "DELETE", headers });
    console.log(`  ✓ Deleted existing index.`);
  }

  // Create index
  const mapping = semantic ? MAPPING_SEMANTIC : MAPPING_TEXT;
  const createRes = await fetch(`${esUrl}/${KB_INDEX}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(mapping),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    if (semantic && err.includes("semantic_text")) {
      console.log("\n  ⚠ semantic_text not available — falling back to plain text mapping.");
      const fallbackRes = await fetch(`${esUrl}/${KB_INDEX}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(MAPPING_TEXT),
      });
      if (!fallbackRes.ok) {
        console.error(`  ✗ Index creation failed: ${await fallbackRes.text()}`);
        rl.close();
        process.exit(1);
      }
      console.log(`  ✓ Index created with text mapping (fallback).`);
    } else {
      console.error(`  ✗ Index creation failed: ${err}`);
      rl.close();
      process.exit(1);
    }
  } else {
    console.log(
      `  ✓ Index "${KB_INDEX}" created with ${semantic ? "semantic_text" : "text"} mapping.`
    );
  }

  // Bulk index
  const ndjsonPath = join(__dirname, "kb-documents.ndjson");
  if (!existsSync(ndjsonPath)) {
    console.error("  ✗ NDJSON file not found. Generation may have failed.");
    rl.close();
    process.exit(1);
  }

  const ndjson = readFileSync(ndjsonPath, "utf8");
  console.log(`\nBulk indexing ${docs.length} documents…`);

  const CHUNK_SIZE = 500;
  const lines = ndjson.trim().split("\n");
  let indexed = 0;
  let errors = 0;

  for (let i = 0; i < lines.length; i += CHUNK_SIZE * 2) {
    const chunk = lines.slice(i, i + CHUNK_SIZE * 2).join("\n") + "\n";

    const bulkRes = await fetch(`${esUrl}/_bulk`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/x-ndjson" },
      body: chunk,
    });

    if (bulkRes.ok) {
      const result = await bulkRes.json();
      const chunkItems = result.items || [];
      for (const item of chunkItems) {
        if (item.index?.error) {
          errors++;
          if (errors <= 3) {
            console.log(`  ✗ ${item.index._id}: ${item.index.error.reason?.slice(0, 100)}`);
          }
        } else {
          indexed++;
        }
      }
    } else {
      const err = await bulkRes.text();
      console.error(`  ✗ Bulk request failed: ${err.slice(0, 200)}`);
      errors += CHUNK_SIZE;
    }
  }

  console.log(`\n  ✓ Indexed: ${indexed}, Errors: ${errors}, Total: ${docs.length}`);

  // Refresh
  await fetch(`${esUrl}/${KB_INDEX}/_refresh`, { method: "POST", headers });

  // Verify count
  const countRes = await fetch(`${esUrl}/${KB_INDEX}/_count`, { headers });
  if (countRes.ok) {
    const count = await countRes.json();
    console.log(`  ✓ Verified: ${count.count} documents in index.`);
  }

  console.log(`
Done! The Agent Builder SOC Analyst can now search "${KB_INDEX}"
for investigation guides, runbooks, and detection rule context.

Next steps:
  1. The setup wizard auto-registers the KB search tool with Agent Builder
  2. Open Agent Builder → SOC Analyst → ask about investigation procedures
  3. Example: "How do I investigate an IAM privilege escalation?"
  4. Example: "What containment steps should I take for data exfiltration?"
  5. Example: "Show me the MITRE ATT&CK mapping for our detection rules"
`);

  rl.close();
}

main().catch((e) => {
  console.error(e);
  rl.close();
  process.exit(1);
});
