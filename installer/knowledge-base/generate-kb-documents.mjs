#!/usr/bin/env node

/**
 * Knowledge Base document generator.
 *
 * Reads runbooks, chain references, SOC guides, and embedded rule
 * investigation guides and chunks them into documents suitable for
 * indexing into Elasticsearch for Agent Builder retrieval.
 *
 * Each document has:
 *   - title, content, source, category, tags, metadata
 *   - Chunked by h2 section so each rule/topic is a separate document
 *
 * Usage:
 *   node installer/knowledge-base/generate-kb-documents.mjs
 *   # Writes kb-documents.ndjson to installer/knowledge-base/
 */

import { readFileSync, readdirSync, writeFileSync } from "fs";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");

// ── Markdown chunker ────────────────────────────────────────────────────────

function chunkMarkdownByH2(content, source, baseCategory, baseTags) {
  const lines = content.split("\n");
  const docs = [];
  let currentTitle = null;
  let currentLines = [];
  let h1Title = null;

  function flush() {
    if (currentTitle && currentLines.length > 0) {
      const text = currentLines.join("\n").trim();
      if (text.length > 50) {
        const tags = [...baseTags];
        if (text.match(/containment|remediation/i)) tags.push("remediation");
        if (text.match(/ES\|QL|esql|FROM logs/i)) tags.push("esql-query");
        if (text.match(/escalat/i)) tags.push("escalation");
        if (text.match(/MITRE|ATT&CK|TA\d{4}|T\d{4}/i)) tags.push("mitre-attack");
        if (text.match(/IAM|PrivEsc|privilege/i)) tags.push("iam");
        if (text.match(/GuardDuty/i)) tags.push("guardduty");
        if (text.match(/exfil/i)) tags.push("exfiltration");
        if (text.match(/CloudTrail/i)) tags.push("cloudtrail");
        if (text.match(/ServiceNow|CMDB/i)) tags.push("cmdb");

        const severity = text.match(/Critical/i)
          ? "critical"
          : text.match(/\bHigh\b/i)
            ? "high"
            : text.match(/\bMedium\b/i)
              ? "medium"
              : text.match(/\bLow\b/i)
                ? "low"
                : null;

        const mitreTactic = text.match(/TA\d{4}/g);
        const mitreTechnique = text.match(/T\d{4}(?:\.\d{3})?/g);

        docs.push({
          title: currentTitle,
          parent_title: h1Title,
          content: text,
          source,
          category: baseCategory,
          tags: [...new Set(tags)],
          ...(severity && { severity }),
          ...(mitreTactic && { mitre_tactic: [...new Set(mitreTactic)] }),
          ...(mitreTechnique && { mitre_technique: [...new Set(mitreTechnique)] }),
        });
      }
    }
  }

  for (const line of lines) {
    const h1Match = line.match(/^#\s+(.+)/);
    const h2Match = line.match(/^##\s+(.+)/);

    if (h1Match && !h1Title) {
      h1Title = h1Match[1].trim();
      continue;
    }

    if (h2Match) {
      flush();
      currentTitle = h2Match[1].trim();
      currentLines = [];
      continue;
    }

    currentLines.push(line);
  }

  flush();

  if (docs.length === 0 && content.trim().length > 50) {
    docs.push({
      title: h1Title || basename(source, ".md"),
      parent_title: null,
      content: content.trim(),
      source,
      category: baseCategory,
      tags: baseTags,
    });
  }

  return docs;
}

// ── Rule investigation guide extractor ──────────────────────────────────────

function extractRuleGuides(rulesDir, category, cloudTags) {
  const docs = [];
  let files;
  try {
    files = readdirSync(rulesDir).filter((f) => f.endsWith(".json"));
  } catch {
    return docs;
  }

  for (const f of files) {
    const data = JSON.parse(readFileSync(join(rulesDir, f), "utf8"));
    const rules = data.rules || data;
    const rulesArr = Array.isArray(rules) ? rules : [rules];

    for (const rule of rulesArr) {
      const guide = rule.note || rule.investigationGuide || rule.investigation_guide;
      if (!guide || guide.length < 30) continue;

      const tags = [...cloudTags];
      if (rule.tags) tags.push(...rule.tags);
      if (rule.name) {
        if (rule.name.match(/IAM|PrivEsc/i)) tags.push("iam");
        if (rule.name.match(/GuardDuty/i)) tags.push("guardduty");
        if (rule.name.match(/Exfil/i)) tags.push("exfiltration");
        if (rule.name.match(/Pipeline/i)) tags.push("data-pipeline");
      }

      const threat = rule.threat?.[0];
      const mitreTactic = threat?.tactic?.id ? [threat.tactic.id] : undefined;
      const mitreTechnique = threat?.technique?.[0]?.id ? [threat.technique[0].id] : undefined;

      docs.push({
        title: rule.name || rule.id || "Unknown rule",
        parent_title: `${category} detection rules`,
        content: guide,
        source: `${rulesDir.replace(ROOT + "/", "")}/${f}`,
        category: "detection-rule-guide",
        tags: [...new Set(tags)],
        ...(rule.severity && { severity: rule.severity }),
        ...(rule.risk_score && { risk_score: rule.risk_score }),
        ...(mitreTactic && { mitre_tactic: mitreTactic }),
        ...(mitreTechnique && { mitre_technique: mitreTechnique }),
        rule_name: rule.name,
        rule_id: rule.rule_id || rule.id,
      });
    }
  }
  return docs;
}

// ── Main ────────────────────────────────────────────────────────────────────

function generate() {
  const allDocs = [];

  console.log("Generating KB documents…\n");

  // 1. Runbooks
  const runbooksDir = join(ROOT, "docs/runbooks");
  const runbookFiles = readdirSync(runbooksDir).filter(
    (f) => f.endsWith(".md") && f !== "README.md"
  );
  for (const f of runbookFiles) {
    const content = readFileSync(join(runbooksDir, f), "utf8");
    const docs = chunkMarkdownByH2(content, `docs/runbooks/${f}`, "runbook", [
      "investigation",
      "triage",
    ]);
    allDocs.push(...docs);
    console.log(`  Runbook ${f}: ${docs.length} sections`);
  }

  // 2. Chained event references
  const chainsDir = join(ROOT, "docs/chained-events");
  try {
    const chainFiles = readdirSync(chainsDir).filter((f) => f.endsWith(".md"));
    for (const f of chainFiles) {
      const content = readFileSync(join(chainsDir, f), "utf8");
      const docs = chunkMarkdownByH2(content, `docs/chained-events/${f}`, "chain-reference", [
        "chain-scenario",
        "correlation",
      ]);
      allDocs.push(...docs);
      console.log(`  Chain ref ${f}: ${docs.length} sections`);
    }
  } catch {
    console.log("  (no chained-events directory)");
  }

  // 3. SOC Demo guide
  const socGuide = join(ROOT, "docs/SOC-DEMO-SETUP.md");
  try {
    const content = readFileSync(socGuide, "utf8");
    const docs = chunkMarkdownByH2(content, "docs/SOC-DEMO-SETUP.md", "soc-guide", [
      "soc",
      "attack-discovery",
      "agent-builder",
      "demo",
    ]);
    allDocs.push(...docs);
    console.log(`  SOC guide: ${docs.length} sections`);
  } catch {
    console.log("  (no SOC-DEMO-SETUP.md)");
  }

  // 4. Workflow deployment guide
  const wfGuide = join(ROOT, "docs/workflow-deployment.md");
  try {
    const content = readFileSync(wfGuide, "utf8");
    const docs = chunkMarkdownByH2(content, "docs/workflow-deployment.md", "workflow-guide", [
      "workflow",
      "enrichment",
      "notification",
    ]);
    allDocs.push(...docs);
    console.log(`  Workflow guide: ${docs.length} sections`);
  } catch {
    console.log("  (no workflow-deployment.md)");
  }

  // 5. Advanced data types
  const advGuide = join(ROOT, "docs/advanced-data-types.md");
  try {
    const content = readFileSync(advGuide, "utf8");
    const docs = chunkMarkdownByH2(content, "docs/advanced-data-types.md", "reference", [
      "chains",
      "cspm",
      "cmdb",
      "architecture",
    ]);
    allDocs.push(...docs);
    console.log(`  Advanced data types: ${docs.length} sections`);
  } catch {
    console.log("  (no advanced-data-types.md)");
  }

  // 6. Security detection rule investigation guides
  const secRulesDir = join(ROOT, "installer/security-detection-rules/rules");
  const secDocs = extractRuleGuides(secRulesDir, "Security", [
    "security",
    "detection-rule",
    "attack-discovery",
  ]);
  allDocs.push(...secDocs);
  console.log(`  Security detection rules: ${secDocs.length} guides`);

  // 7. AWS alerting rule investigation guides
  const awsRulesDir = join(ROOT, "installer/aws-custom-rules");
  const awsDocs = extractRuleGuides(awsRulesDir, "AWS", ["aws", "alerting-rule"]);
  allDocs.push(...awsDocs);
  console.log(`  AWS alerting rules: ${awsDocs.length} guides`);

  // 8. GCP alerting rule investigation guides
  const gcpRulesDir = join(ROOT, "installer/gcp-custom-rules");
  const gcpDocs = extractRuleGuides(gcpRulesDir, "GCP", ["gcp", "alerting-rule"]);
  allDocs.push(...gcpDocs);
  console.log(`  GCP alerting rules: ${gcpDocs.length} guides`);

  // 9. Azure alerting rule investigation guides
  const azureRulesDir = join(ROOT, "installer/azure-custom-rules");
  const azureDocs = extractRuleGuides(azureRulesDir, "Azure", ["azure", "alerting-rule"]);
  allDocs.push(...azureDocs);
  console.log(`  Azure alerting rules: ${azureDocs.length} guides`);

  // Add timestamps and IDs
  const now = new Date().toISOString();
  for (let i = 0; i < allDocs.length; i++) {
    allDocs[i]["@timestamp"] = now;
    allDocs[i].id = `kb-${i.toString().padStart(4, "0")}`;
  }

  // Write NDJSON
  const outPath = join(__dirname, "kb-documents.ndjson");
  const ndjson =
    allDocs
      .map(
        (doc) =>
          JSON.stringify({ index: { _index: "kb-cloudloadgen-soc", _id: doc.id } }) +
          "\n" +
          JSON.stringify(doc)
      )
      .join("\n") + "\n";

  writeFileSync(outPath, ndjson);

  console.log(`\nGenerated ${allDocs.length} KB documents → ${outPath}`);
  console.log(`\nBreakdown:`);
  const cats = {};
  for (const d of allDocs) {
    cats[d.category] = (cats[d.category] || 0) + 1;
  }
  for (const [cat, count] of Object.entries(cats).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count}`);
  }

  return allDocs;
}

export { generate, chunkMarkdownByH2, extractRuleGuides };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generate();
}
