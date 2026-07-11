/**
 * Bulk-fix ES|QL dashboard contract violations:
 *  A) Strip aws.*.metrics.* column bindings from panels querying FROM logs-aws.*
 *  B) Azure Redis: azure.metrics.* → azure.cache_for_redis.metrics.*
 *  C) BUCKET(@timestamp → BUCKET(`@timestamp`
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writePrettierJson } from "./write-prettier-json.mjs";

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const VENDOR_DIRS = [
  "installer/aws-custom-dashboards",
  "installer/azure-custom-dashboards",
  "installer/gcp-custom-dashboards",
];

const AWS_METRICS_COLUMN = /aws\.[^.]+\.metrics\./;
const GCP_METRICS_COLUMN = /gcp\.[^.]+\.metrics\./;
const AZURE_METRICS_COLUMN = /azure\.[^.]+\.metrics\./;
const LOGS_FROM = /\bFROM\s+logs-/i;
const BUCKET_UNQUOTED_TS = /BUCKET\(@timestamp/g;
const AZURE_FLAT_METRICS = /`azure\.metrics\./g;
const AWS_COALESCE_REGION = /COALESCE\(cloud\.region,\s*"unknown"\)/g;
const GCP_COALESCE_PROJECT = /COALESCE\(`cloud\.project\.id`,\s*"unknown"\)/g;
const GCP_COALESCE_PROJECT_PLAIN = /COALESCE\(cloud\.project\.id,\s*"unknown"\)/g;
const COALESCE_ACCOUNT = /COALESCE\(`?cloud\.account\.id`?,\s*"unknown"\)/g;

/** @param {string} col */
function isMetricsColumn(col) {
  if (typeof col !== "string") return false;
  const bare = col.replace(/^`|`$/g, "");
  return (
    AWS_METRICS_COLUMN.test(bare) ||
    GCP_METRICS_COLUMN.test(bare) ||
    AZURE_METRICS_COLUMN.test(bare) ||
    /\.metrics\./.test(bare)
  );
}

/** @param {unknown} obj */
function isPlainObject(obj) {
  return obj !== null && typeof obj === "object" && !Array.isArray(obj);
}

/**
 * Remove column bindings that reference aws.*.metrics.* from arrays/objects
 * that hold Lens column specs (metrics, group_by, y, breakdowns, etc.).
 * @param {unknown} node
 * @returns {{ changed: boolean, removed: number }}
 */
function stripAwsMetricsColumns(node) {
  let changed = false;
  let removed = 0;

  if (Array.isArray(node)) {
    const kept = [];
    for (const item of node) {
      if (isPlainObject(item) && typeof item.column === "string" && isMetricsColumn(item.column)) {
        changed = true;
        removed += 1;
        continue;
      }
      const sub = stripAwsMetricsColumns(item);
      changed = changed || sub.changed;
      removed += sub.removed;
      kept.push(item);
    }
    if (changed) {
      node.length = 0;
      node.push(...kept);
    }
    return { changed, removed };
  }

  if (isPlainObject(node)) {
    for (const key of Object.keys(node)) {
      const sub = stripAwsMetricsColumns(node[key]);
      if (sub.changed) {
        changed = true;
        removed += sub.removed;
      }
    }
  }

  return { changed, removed };
}

/**
 * Remove metrics field references from logs ES|QL KEEP clauses.
 * @param {string} query
 * @returns {{ query: string, changed: boolean }}
 */
function stripMetricsFromLogsKeep(query) {
  if (!LOGS_FROM.test(query) || !/\bKEEP\b/.test(query)) {
    return { query, changed: false };
  }
  const next = query.replace(
    /(`[^`]*\.metrics\.[^`]*`|[^`,\s]+\.metrics\.[^`,\s]+)(\s*,\s*|\s*,)?/g,
    (match, _field, trailingComma) => (trailingComma?.includes(",") ? "" : "")
  );
  return { query: next, changed: next !== query };
}

/**
 * @param {Record<string, unknown>} attributes
 * @returns {number}
 */
function fixLogsMetricBindings(attributes) {
  let removed = 0;

  const query = attributes?.dataset?.query;
  if (typeof query === "string" && LOGS_FROM.test(query)) {
    const keepFix = stripMetricsFromLogsKeep(query);
    if (keepFix.changed) {
      attributes.dataset.query = keepFix.query;
    }
    for (const key of ["metrics", "group_by", "breakdown", "breakdowns"]) {
      if (attributes[key] !== undefined) {
        const result = stripAwsMetricsColumns(attributes[key]);
        if (result.changed) removed += result.removed;
      }
    }
  }

  const layers = attributes?.layers;
  if (Array.isArray(layers)) {
    for (const layer of layers) {
      if (!isPlainObject(layer)) continue;
      const layerQuery = layer.dataset?.query;
      if (typeof layerQuery !== "string" || !LOGS_FROM.test(layerQuery)) continue;
      const keepFix = stripMetricsFromLogsKeep(layerQuery);
      if (keepFix.changed) {
        layer.dataset.query = keepFix.query;
      }
      for (const key of ["metrics", "group_by", "x", "y", "breakdown", "breakdowns"]) {
        if (layer[key] !== undefined) {
          const result = stripAwsMetricsColumns(layer[key]);
          if (result.changed) removed += result.removed;
        }
      }
    }
  }

  return removed;
}

/**
 * @param {Record<string, unknown>} dashboard
 * @returns {number}
 */
function fixLogsMetricColumns(dashboard) {
  let removed = 0;
  const panels = dashboard.panels;
  if (!Array.isArray(panels)) return 0;

  for (const panel of panels) {
    const attributes = panel?.config?.attributes;
    if (!isPlainObject(attributes)) continue;
    removed += fixLogsMetricBindings(attributes);
  }

  return removed;
}

/**
 * @param {string} text
 * @returns {{ text: string, count: number }}
 */
function fixBucketTimestamp(text) {
  const matches = text.match(BUCKET_UNQUOTED_TS);
  if (!matches) return { text, count: 0 };
  return {
    text: text.replace(BUCKET_UNQUOTED_TS, "BUCKET(`@timestamp`"),
    count: matches.length,
  };
}

/**
 * @param {string} text
 * @returns {{ text: string, count: number }}
 */
function fixAzureRedisMetrics(text) {
  const matches = text.match(AZURE_FLAT_METRICS);
  if (!matches) return { text, count: 0 };
  return {
    text: text.replace(AZURE_FLAT_METRICS, "`azure.cache_for_redis.metrics."),
    count: matches.length,
  };
}

/**
 * @param {string} text
 * @returns {{ text: string, count: number }}
 */
function fixCoalesceCloudFields(text) {
  let next = text;
  let count = 0;
  const replacements = [
    [AWS_COALESCE_REGION, "cloud.region"],
    [GCP_COALESCE_PROJECT, "`cloud.project.id`"],
    [GCP_COALESCE_PROJECT_PLAIN, "`cloud.project.id`"],
    [COALESCE_ACCOUNT, "cloud.account.id"],
  ];
  for (const [pattern, repl] of replacements) {
    pattern.lastIndex = 0;
    const matches = next.match(pattern);
    if (!matches) continue;
    count += matches.length;
    next = next.replace(pattern, repl);
  }
  return { text: next, count };
}

/**
 * Recursively fix query strings in dashboard JSON (BUCKET + Azure Redis + AWS COALESCE).
 * @param {unknown} node
 * @param {string} fileName
 * @param {string} vendorKey
 * @returns {{ bucketFixes: number, azureRedisFixes: number, coalesceFixes: number }}
 */
function fixQueryStrings(node, fileName, vendorKey) {
  let bucketFixes = 0;
  let azureRedisFixes = 0;
  let coalesceFixes = 0;
  const isRedis = fileName === "cache-for-redis-dashboard.json";

  if (Array.isArray(node)) {
    for (const item of node) {
      const sub = fixQueryStrings(item, fileName, vendorKey);
      bucketFixes += sub.bucketFixes;
      azureRedisFixes += sub.azureRedisFixes;
      coalesceFixes += sub.coalesceFixes;
    }
    return { bucketFixes, azureRedisFixes, coalesceFixes };
  }

  if (!isPlainObject(node)) return { bucketFixes, azureRedisFixes, coalesceFixes };

  for (const [key, value] of Object.entries(node)) {
    if (key === "query" && typeof value === "string") {
      let next = value;
      const bucket = fixBucketTimestamp(next);
      if (bucket.count > 0) {
        next = bucket.text;
        bucketFixes += bucket.count;
      }
      if (isRedis) {
        const azure = fixAzureRedisMetrics(next);
        if (azure.count > 0) {
          next = azure.text;
          azureRedisFixes += azure.count;
        }
      }
      if (vendorKey === "aws") {
        const coalesce = fixCoalesceCloudFields(next);
        if (coalesce.count > 0) {
          next = coalesce.text;
          coalesceFixes += coalesce.count;
        }
      }
      if (next !== value) node[key] = next;
    } else {
      const sub = fixQueryStrings(value, fileName, vendorKey);
      bucketFixes += sub.bucketFixes;
      azureRedisFixes += sub.azureRedisFixes;
      coalesceFixes += sub.coalesceFixes;
    }
  }

  return { bucketFixes, azureRedisFixes, coalesceFixes };
}

async function main() {
  const stats = {
    filesChanged: 0,
    logsMetricFiles: 0,
    logsColumnsRemoved: 0,
    bucketFixes: 0,
    azureRedisFixes: 0,
    coalesceFixes: 0,
    byVendor: { aws: 0, azure: 0, gcp: 0 },
  };

  for (const vendorDir of VENDOR_DIRS) {
    const absDir = path.join(rootDir, vendorDir);
    if (!fs.existsSync(absDir)) continue;

    const vendorKey = vendorDir.includes("/aws-")
      ? "aws"
      : vendorDir.includes("/azure-")
        ? "azure"
        : "gcp";

    for (const file of fs.readdirSync(absDir).filter((f) => f.endsWith("-dashboard.json"))) {
      const absPath = path.join(absDir, file);
      const dashboard = JSON.parse(fs.readFileSync(absPath, "utf8"));
      let changed = false;

      const removed = fixLogsMetricColumns(dashboard);
      if (removed > 0) {
        changed = true;
        stats.logsMetricFiles += 1;
        stats.logsColumnsRemoved += removed;
      }

      const queryFixes = fixQueryStrings(dashboard, file, vendorKey);
      if (
        queryFixes.bucketFixes > 0 ||
        queryFixes.azureRedisFixes > 0 ||
        queryFixes.coalesceFixes > 0
      ) {
        changed = true;
        stats.bucketFixes += queryFixes.bucketFixes;
        stats.azureRedisFixes += queryFixes.azureRedisFixes;
        stats.coalesceFixes += queryFixes.coalesceFixes;
      }

      if (changed) {
        await writePrettierJson(absPath, dashboard);
        stats.filesChanged += 1;
        stats.byVendor[vendorKey] += 1;
        console.log(`fixed ${path.relative(rootDir, absPath)}`);
      }
    }
  }

  console.log("\nSummary:");
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
