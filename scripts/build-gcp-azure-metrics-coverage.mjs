/**
 * Build metrics field manifests + inject hybrid metrics panels into GCP/Azure
 * dashboards + migrate metric-intent ML jobs onto metrics-* streams.
 *
 * Usage:
 *   npx vite-node scripts/build-gcp-azure-metrics-coverage.mjs
 *   npx vite-node scripts/build-gcp-azure-metrics-coverage.mjs --dry-run
 *   npx vite-node scripts/build-gcp-azure-metrics-coverage.mjs --dashboards-only
 *   npx vite-node scripts/build-gcp-azure-metrics-coverage.mjs --ml-only
 *   npx vite-node scripts/build-gcp-azure-metrics-coverage.mjs --rewrite
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writePrettierJson } from "./write-prettier-json.mjs";

import { GCP_METRICS_GENERATORS } from "../src/gcp/generators/metrics/index.ts";
import { GCP_METRICS_DATASET_MAP } from "../src/gcp/data/elasticMaps.ts";
import { AZURE_METRICS_GENERATORS } from "../src/azure/generators/metrics/index.ts";
import { AZURE_METRICS_DATASET_MAP } from "../src/azure/data/elasticMaps.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = new Set(process.argv.slice(2));
const dryRun = argv.has("--dry-run");
const dashboardsOnly = argv.has("--dashboards-only");
const mlOnly = argv.has("--ml-only");
const rewritePanels = argv.has("--rewrite");

const TS = "2026-01-15T12:00:00.000Z";
const PROBE_SAMPLES = 24;

function matchesServiceKey(key, id) {
  const wantKey = id.replace(/-/g, "_");
  return key === wantKey || key === id || key.replace(/_/g, "-") === id;
}

function isCounterMetric(name, hasSum) {
  if (!hasSum) return false;
  // Gauges that happen to expose .sum must not be treated as counters
  if (
    /available|utilization|percent|latency|duration|depth|queue|capacity|free|used.?%|connectedclients|usedmemory/i.test(
      name
    )
  )
    return false;
  return (
    /(?:^|\/|_)(?:count|request|error|fail|hit|evict|message|invocation|execution|run)s?(?:$|\/|_)/i.test(
      name
    ) ||
    /hits?$|misses?$|evicted|operationsPerSecond|bytes_count|read_bytes|write_bytes|network.*(in|out)|throughput/i.test(
      name
    )
  );
}

function fieldPathExpr(cloud, serviceKeys, metricName, stat) {
  const keys = [...new Set(serviceKeys)].sort();
  if (keys.length === 1) return `${cloud}.${keys[0]}.metrics.${metricName}.${stat}`;
  return `COALESCE(${keys.map((k) => `\`${cloud}.${k}.metrics.${metricName}.${stat}\``).join(", ")})`;
}

function wrapFieldExpr(expr) {
  // COALESCE(...) already includes per-path backticks; bare paths need wrapping
  return expr.startsWith("COALESCE(") ? expr : `\`${expr}\``;
}

function probeService(gens, cloud, id, preferredDataset = null) {
  const gen = gens[id];
  if (!gen) return null;

  /** @type {Array<object>} */
  const docs = [];
  for (let i = 0; i < PROBE_SAMPLES; i++) {
    try {
      const out = gen(TS, 0.15 + (i % 5) * 0.05);
      const arr = Array.isArray(out) ? out : [out];
      docs.push(...arr.filter(Boolean));
    } catch (e) {
      if (i === 0) console.warn(`  skip probe ${cloud}/${id}: ${e.message}`);
      break;
    }
  }
  if (!docs.length) return null;

  // Prefer the mapped dataset when the generator emits mixed variant datasets
  const byDataset = new Map();
  for (const d of docs) {
    const ds = d.data_stream?.dataset || "_none";
    if (!byDataset.has(ds)) byDataset.set(ds, []);
    byDataset.get(ds).push(d);
  }
  let dataset =
    (preferredDataset && byDataset.has(preferredDataset) && preferredDataset) ||
    [...byDataset.entries()].sort((a, b) => b[1].length - a[1].length)[0]?.[0] ||
    null;
  if (dataset === "_none") dataset = preferredDataset || null;
  const pool = (dataset && byDataset.get(dataset)) || docs;

  // metricName -> { stats:Set, serviceKeys:Set, preferSum }
  const metricMap = new Map();
  const canonicalKeys = new Set();
  for (const d of pool) {
    const rootObj = d[cloud] || {};
    for (const [svc, body] of Object.entries(rootObj)) {
      if (!body?.metrics || typeof body.metrics !== "object") continue;
      if (matchesServiceKey(svc, id)) canonicalKeys.add(svc);
      for (const [name, stats] of Object.entries(body.metrics)) {
        if (!stats || typeof stats !== "object") continue;
        const keys = Object.keys(stats);
        if (!keys.length) continue;
        if (!metricMap.has(name)) {
          metricMap.set(name, { stats: new Set(), serviceKeys: new Set(), preferSum: false });
        }
        const entry = metricMap.get(name);
        keys.forEach((k) => entry.stats.add(k));
        entry.serviceKeys.add(svc);
        if (isCounterMetric(name, keys.includes("sum"))) entry.preferSum = true;
      }
    }
  }
  if (!metricMap.size) return null;

  const fields = [];
  for (const [name, entry] of metricMap) {
    const keys = [...entry.stats];
    const pref = entry.preferSum
      ? "sum"
      : keys.includes("avg")
        ? "avg"
        : keys.includes("sum")
          ? "sum"
          : keys.includes("max")
            ? "max"
            : keys[0];
    fields.push({
      name,
      stat: pref,
      path: fieldPathExpr(cloud, [...entry.serviceKeys], name, pref),
      preferSum: entry.preferSum,
      serviceKeys: [...entry.serviceKeys],
      underCanonical: [...entry.serviceKeys].some((k) => matchesServiceKey(k, id)),
    });
  }

  // Prefer one counter + one gauge for dashboard KPIs
  const counters = fields.filter((f) => f.preferSum);
  const gauges = fields.filter((f) => !f.preferSum && f.stat === "avg");
  // Prefer latency/cpu gauges when available; prefer metrics under the canonical
  // service key and metrics shared across variants (better COALESCE coverage).
  gauges.sort((a, b) => {
    const score = (f) => {
      let s = 0;
      if (/cpu|util|latency|duration|percent|memory/i.test(f.name)) s += 5;
      if (/instance\/cpu\/utilization|Percentage CPU/i.test(f.name)) s += 8;
      if (/uptime$/i.test(f.name)) s -= 3;
      if (/node_group\//i.test(f.name)) s -= 2;
      if (f.underCanonical) s += 6;
      s += Math.min(f.serviceKeys?.length || 1, 5);
      return s;
    };
    return score(b) - score(a);
  });
  counters.sort((a, b) => {
    const score = (f) => {
      let s = /request|execution|invocation|error|count/i.test(f.name) ? 3 : 0;
      if (f.underCanonical) s += 6;
      if (/serviceruntime\.googleapis\.com\/api\/request_count/i.test(f.name)) s -= 4;
      s += Math.min(f.serviceKeys?.length || 1, 3);
      return s;
    };
    return score(b) - score(a);
  });

  const pick = [];
  const pushUnique = (f) => {
    if (!f) return;
    if (pick.some((p) => p.name === f.name)) return;
    pick.push(f);
  };
  pushUnique(counters[0] || null);
  pushUnique(gauges[0] || null);
  for (const f of fields) {
    if (pick.length >= 2) break;
    pushUnique(f);
  }

  const serviceKey =
    [...canonicalKeys][0] ||
    pick[0]?.serviceKeys?.[0] ||
    [...metricMap.values()][0]?.serviceKeys?.values?.().next?.().value ||
    null;

  return {
    serviceId: id,
    dataset,
    serviceKey,
    fields: pick.slice(0, 2),
    allFields: fields,
    allFieldCount: fields.length,
    variantKeys: [...new Set([...metricMap.values()].flatMap((e) => [...e.serviceKeys]))],
  };
}

function datasetSlug(dataset) {
  // gcp.cloudfunctions_metrics → cloudfunctions_metrics
  // azure.functions_metrics → functions_metrics
  return String(dataset || "").replace(/^(gcp|azure)\./, "");
}

function metricsIndex(vendor, dataset) {
  return `metrics-${vendor}.${datasetSlug(dataset)}*`;
}

function shortLabel(metricName) {
  const parts = String(metricName).split(/[./]/);
  const last = parts[parts.length - 1] || metricName;
  return last
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, 40);
}

function lensMetric(uid, grid, query, column) {
  return {
    type: "lens",
    uid,
    grid,
    config: {
      title: "",
      attributes: {
        type: "metric",
        dataset: { type: "esql", query },
        metrics: [{ type: "primary", operation: "value", column }],
      },
    },
  };
}

function lensLine(uid, grid, title, query, xCol, yCol, yLabel) {
  return {
    type: "lens",
    uid,
    grid,
    config: {
      title,
      attributes: {
        type: "xy",
        axis: {
          x: { title: { visible: false } },
          left: { title: { visible: false } },
        },
        layers: [
          {
            type: "line",
            dataset: { type: "esql", query },
            x: { operation: "value", column: xCol },
            y: [{ operation: "value", column: yCol, label: yLabel }],
          },
        ],
      },
    },
  };
}

function maxPanelY(panels) {
  let max = 0;
  for (const p of panels || []) {
    const g = p.grid || {};
    max = Math.max(max, (g.y || 0) + (g.h || 0));
  }
  return max;
}

function buildMetricsPanels(vendor, probe, y0) {
  const idx = metricsIndex(vendor, probe.dataset);
  const panels = [];
  const f0 = probe.fields[0];
  const f1 = probe.fields[1] || probe.fields[0];
  if (!f0) return panels;

  const agg0 = f0.stat === "sum" || f0.preferSum ? "SUM" : "AVG";
  const label0 = shortLabel(f0.name);
  const col0 = `Metric ${label0}`;
  panels.push(
    lensMetric(
      `${vendor}-mx-k1-${probe.serviceId}`,
      { x: 0, y: y0, w: 24, h: 5 },
      `FROM ${idx} | STATS \`${col0}\` = ROUND(${agg0}(${wrapFieldExpr(f0.path)}), 2)`,
      col0
    )
  );

  if (f1 && f1.name !== f0.name) {
    const agg1 = f1.stat === "sum" || f1.preferSum ? "SUM" : "AVG";
    const label1 = shortLabel(f1.name);
    const col1 = `Metric ${label1}`;
    panels.push(
      lensMetric(
        `${vendor}-mx-k2-${probe.serviceId}`,
        { x: 24, y: y0, w: 24, h: 5 },
        `FROM ${idx} | STATS \`${col1}\` = ROUND(${agg1}(${wrapFieldExpr(f1.path)}), 2)`,
        col1
      )
    );
  }

  // Prefer a gauge timeseries when KPI1 is a counter
  const seriesField = f1 && (f0.preferSum || f0.stat === "sum") && !f1.preferSum ? f1 : f0;
  const seriesY = y0 + 5;
  const seriesLabel = shortLabel(seriesField.name);
  const seriesCol = "m";
  const seriesAgg = seriesField.stat === "sum" || seriesField.preferSum ? "SUM" : "AVG";
  panels.push(
    lensLine(
      `${vendor}-mx-ts-${probe.serviceId}`,
      { x: 0, y: seriesY, w: 48, h: 10 },
      `${seriesLabel} over time`,
      `FROM ${idx} | STATS ${seriesCol} = ${seriesAgg}(${wrapFieldExpr(seriesField.path)}) BY b = BUCKET(\`@timestamp\`, 75, ?_tstart, ?_tend) | SORT b`,
      "b",
      seriesCol,
      seriesLabel
    )
  );

  return panels;
}

function dashboardPathForService(vendor, serviceId) {
  const dir =
    vendor === "gcp"
      ? path.join(root, "installer/gcp-custom-dashboards")
      : path.join(root, "installer/azure-custom-dashboards");
  const candidates = [
    `${serviceId}-dashboard.json`,
    // some azure ids differ
    serviceId.replace(/_/g, "-") + "-dashboard.json",
  ];
  for (const c of candidates) {
    const p = path.join(dir, c);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function alreadyHasMetricsPanels(dashboard) {
  const text = JSON.stringify(dashboard);
  return /FROM\s+metrics-(gcp|azure)\./i.test(text);
}

function hasOurMetricsPanels(dashboard, vendor, serviceId) {
  const prefix = `${vendor}-mx-`;
  return (dashboard.panels || []).some((p) => {
    const uid = String(p.uid || "");
    return uid.startsWith(prefix) && (uid.includes(`-${serviceId}`) || uid.endsWith(serviceId));
  });
}

function stripInjectedMetricsPanels(dashboard, vendor, serviceId) {
  const prefix = `${vendor}-mx-`;
  const before = (dashboard.panels || []).length;
  dashboard.panels = (dashboard.panels || []).filter((p) => {
    const uid = String(p.uid || "");
    if (!uid.startsWith(prefix)) return true;
    return !(uid.includes(`-${serviceId}`) || uid.endsWith(serviceId));
  });
  return before - dashboard.panels.length;
}

async function injectDashboards(vendor, gens, datasetMap) {
  const stats = {
    probed: 0,
    injected: 0,
    rewritten: 0,
    skippedHasMetrics: 0,
    skippedNoDash: 0,
    skippedNoFields: 0,
  };
  const manifest = {};

  for (const id of Object.keys(gens).sort()) {
    const probe = probeService(gens, vendor, id, datasetMap[id] || null);
    stats.probed++;
    if (!probe || !probe.fields.length) {
      stats.skippedNoFields++;
      continue;
    }
    // Prefer map dataset if probe missing
    if (!probe.dataset) probe.dataset = datasetMap[id];
    if (!probe.dataset) {
      stats.skippedNoFields++;
      continue;
    }
    manifest[id] = probe;

    const dashPath = dashboardPathForService(vendor, id);
    if (!dashPath) {
      stats.skippedNoDash++;
      continue;
    }
    const dashboard = JSON.parse(fs.readFileSync(dashPath, "utf8"));
    const hasAnyMetrics = alreadyHasMetricsPanels(dashboard);
    const hasOurs = hasOurMetricsPanels(dashboard, vendor, id);

    // Never overwrite hand-authored metrics dashboards; only rewrite our mx-* panels.
    if (hasAnyMetrics && !hasOurs) {
      stats.skippedHasMetrics++;
      continue;
    }
    if (hasOurs && !rewritePanels) {
      stats.skippedHasMetrics++;
      continue;
    }

    if (hasOurs && rewritePanels) {
      stripInjectedMetricsPanels(dashboard, vendor, id);
      stats.rewritten++;
    }

    const y0 = maxPanelY(dashboard.panels) + 1;
    const panels = buildMetricsPanels(vendor, probe, y0);
    if (!panels.length) {
      stats.skippedNoFields++;
      continue;
    }
    dashboard.panels = [...(dashboard.panels || []), ...panels];
    if (!dryRun) await writePrettierJson(dashPath, dashboard);
    stats.injected++;
    console.log(
      `  + metrics panels → ${path.relative(root, dashPath)} (${probe.fields.map((f) => f.name).join(", ")})`
    );
  }

  const manifestPath = path.join(
    root,
    `installer/${vendor}-custom-dashboards/metrics-panel-manifest.json`
  );
  if (!dryRun) {
    await writePrettierJson(manifestPath, {
      generatedAt: new Date().toISOString(),
      vendor,
      services: manifest,
    });
  }
  return stats;
}

/** Heuristic: job is metric-intent if it uses high_mean/high_sum on a numeric service field (not event.duration alone on failure spikes). */
function isMetricIntentJob(job) {
  const dets = job?.job?.analysis_config?.detectors || [];
  if (!dets.length) return false;
  const fn = dets[0].function || "";
  const field = dets[0].field_name || "";
  if (!field) return false;
  // Already on metrics
  const indices = job?.datafeed?.indices || [];
  if (indices.some((i) => String(i).startsWith("metrics-"))) return false;
  if (fn === "high_count" && !field) return false;
  if (fn === "high_count") return false; // failure spikes
  if (fn === "high_mean" || fn === "high_sum" || fn === "mean" || fn === "sum") {
    // event.duration alone can be log latency — still migrate if we have a metrics twin
    return true;
  }
  return false;
}

function findBestMetricsField(probe, jobField, jobId) {
  const pool = probe?.allFields?.length ? probe.allFields : probe?.fields;
  if (!pool?.length) return null;
  const jf = `${jobField || ""} ${jobId || ""}`.toLowerCase();

  const score = (f) => {
    const n = f.name.toLowerCase();
    let s = 0;
    if (
      /latency|duration|response.?time|round.?trip/i.test(jf) &&
      /latency|duration|response|rtt/i.test(n)
    )
      s += 10;
    if (
      /connection|connect|backend|num_backend/i.test(jf) &&
      /connection|backend|client|connect/i.test(n)
    )
      s += 10;
    if (
      /cpu|utilization|dtu|memory|ru.?consum|slot/i.test(jf) &&
      /cpu|util|dtu|memory|ru|slot|percent/i.test(n)
    )
      s += 10;
    if (/error|fail|throttl|deny/i.test(jf) && /error|fail|throttl|denied|blocked/i.test(n)) s += 8;
    if (
      /byte|throughput|ingress|egress|scanned/i.test(jf) &&
      /byte|throughput|ingress|egress|scanned|bandwidth/i.test(n)
    )
      s += 8;
    if (/request|invocation|message|count/i.test(jf) && /request|invocation|message|count/i.test(n))
      s += 5;
    if (/watermark|lag|port/i.test(jf) && /watermark|lag|port/i.test(n)) s += 10;
    // Prefer avg gauges for latency/cpu jobs
    if (/latency|duration|cpu|util|percent|dtu/i.test(jf) && f.stat === "avg") s += 2;
    if (/count|byte|error|fail|message/i.test(jf) && (f.stat === "sum" || f.preferSum)) s += 2;
    return s;
  };

  const ranked = [...pool].sort((a, b) => score(b) - score(a));
  if (score(ranked[0]) > 0) return ranked[0];
  return probe.fields[0] || ranked[0];
}

function serviceIdFromJob(job, vendor) {
  // Try event.dataset filter
  const q = JSON.stringify(job?.datafeed?.query || {});
  const m = q.match(/"(gcp|azure)\.([a-z0-9_]+)"/);
  if (m) {
    const ds = m[2].replace(/_metrics$/, "").replace(/_/g, "-");
    // map common aliases
    const aliases = {
      cloudsql: "cloud-sql",
      cloudrun: "cloud-run",
      cloudfunctions: "cloud-functions",
      cloudtasks: "cloud-tasks",
      gcs: "cloud-storage",
      loadbalancing: "cloud-lb",
      nat: "cloud-nat",
      vertexai: "vertex-ai",
      redis_cache: "cache-for-redis",
      sql_database: "sql-database",
      cosmos_db: "cosmos-db",
      app_service: "app-service",
      virtual_machines: "virtual-machines",
      event_hubs: "event-hubs",
      service_bus: "service-bus",
      data_factory: "data-factory",
      application_gateway: "application-gateway",
      blob_storage: "blob-storage",
      load_balancer: "load-balancer",
    };
    return aliases[ds] || aliases[m[2]] || ds;
  }
  // From job id: gcp-cloud-run-latency-anomaly → cloud-run
  const id = job.id || "";
  const prefix = vendor === "gcp" ? "gcp-" : "azure-";
  if (id.startsWith(prefix)) {
    let rest = id.slice(prefix.length);
    rest = rest
      .replace(/-anomaly$/, "")
      .replace(/-spike$/, "")
      .replace(/-latency$/, "")
      .replace(/-duration$/, "")
      .replace(/-throughput$/, "")
      .replace(/-consumption$/, "")
      .replace(/-exhaustion$/, "")
      .replace(/-usage$/, "")
      .replace(/-connection$/, "")
      .replace(/-port$/, "")
      .replace(/-slot$/, "")
      .replace(/-bytes$/, "")
      .replace(/-ru$/, "")
      .replace(/-dtu$/, "")
      .replace(/-slow-query$/, "")
      .replace(/-request$/, "")
      .replace(/-failure$/, "")
      .replace(/-error$/, "");
    // resolveServiceId shortens progressively against known generators
    return rest;
  }
  return null;
}

async function migrateMlJobs(vendor, gens, datasetMap, probes) {
  const dir =
    vendor === "gcp"
      ? path.join(root, "installer/gcp-custom-ml-jobs/jobs")
      : path.join(root, "installer/azure-custom-ml-jobs/jobs");
  const stats = { files: 0, migrated: 0, skipped: 0 };
  const serviceIds = Object.keys(gens);

  function resolveServiceId(hint) {
    if (!hint) return null;
    if (gens[hint]) return hint;
    // try progressive shortening
    const parts = hint.split("-");
    for (let i = parts.length; i >= 1; i--) {
      const cand = parts.slice(0, i).join("-");
      if (gens[cand]) return cand;
    }
    // fuzzy contains
    const hit = serviceIds.find((s) => hint.startsWith(s) || s.startsWith(hint));
    return hit || null;
  }

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const abs = path.join(dir, file);
    const data = JSON.parse(fs.readFileSync(abs, "utf8"));
    if (!Array.isArray(data.jobs)) continue;
    stats.files++;
    let changed = false;
    for (const job of data.jobs) {
      if (!isMetricIntentJob(job)) {
        stats.skipped++;
        continue;
      }
      const hint = serviceIdFromJob(job, vendor);
      const sid = resolveServiceId(hint);
      if (!sid) {
        stats.skipped++;
        continue;
      }
      const probe = probes[sid] || probeService(gens, vendor, sid);
      if (!probe?.fields?.length || !probe.dataset) {
        stats.skipped++;
        continue;
      }
      const det = job.job.analysis_config.detectors[0];
      const field = findBestMetricsField(probe, det.field_name, job.id);
      if (!field) {
        stats.skipped++;
        continue;
      }
      // ML needs a concrete field path (no COALESCE). Prefer canonical service key.
      const wantStat = det.function === "high_sum" || det.function === "sum" ? "sum" : "avg";
      const svcKeys = field.serviceKeys?.length
        ? field.serviceKeys
        : probe.serviceKey
          ? [probe.serviceKey]
          : [];
      const svcKey =
        svcKeys.find((k) => matchesServiceKey(k, sid)) || svcKeys[0] || probe.serviceKey;
      if (!svcKey) {
        stats.skipped++;
        continue;
      }
      const pathField = `${vendor}.${svcKey}.metrics.${field.name}.${wantStat}`;

      det.field_name = pathField;
      det.detector_description = `${det.function}(${pathField})`;
      // Drop partition if log-style and we don't know metrics partition — keep influencers cloud.region
      const influencers = job.job.analysis_config.influencers || [];
      job.job.analysis_config.influencers = influencers.filter(
        (i) => i === "cloud.region" || i.startsWith("gcp.") || i.startsWith("azure.")
      );
      if (!job.job.analysis_config.influencers.includes("cloud.region")) {
        job.job.analysis_config.influencers.push("cloud.region");
      }
      // Clear partition if it looks like a log-only field that won't exist on metrics
      if (det.partition_field_name && !/labels|dimensions/i.test(det.partition_field_name)) {
        // try labels.job_name style for gcp
        if (vendor === "gcp" && probe.serviceKey) {
          // Keep generic — many GCP metrics have labels but vary; safer to remove partition than break
          delete det.partition_field_name;
        } else if (vendor === "azure") {
          delete det.partition_field_name;
        }
      }

      job.datafeed.indices = [metricsIndex(vendor, probe.dataset)];
      job.datafeed.query = {
        bool: {
          filter: [{ term: { "event.dataset": probe.dataset } }, { exists: { field: pathField } }],
        },
      };
      if (!job.datafeed.query_delay) job.datafeed.query_delay = "120s";
      changed = true;
      stats.migrated++;
      console.log(`  ML ${job.id} → ${job.datafeed.indices[0]} field=${pathField}`);
    }
    if (changed && !dryRun) await writePrettierJson(abs, data);
  }
  return stats;
}

async function main() {
  console.log(`Building GCP/Azure metrics coverage${dryRun ? " (dry-run)" : ""}…`);

  const gcpProbes = {};
  const azureProbes = {};

  if (!mlOnly) {
    console.log("\n=== GCP dashboards ===");
    const gcpDash = await injectDashboards("gcp", GCP_METRICS_GENERATORS, GCP_METRICS_DATASET_MAP);
    console.log(JSON.stringify(gcpDash));

    console.log("\n=== Azure dashboards ===");
    const azDash = await injectDashboards(
      "azure",
      AZURE_METRICS_GENERATORS,
      AZURE_METRICS_DATASET_MAP
    );
    console.log(JSON.stringify(azDash));

    // Rebuild probes for ML from manifests if written
    for (const id of Object.keys(GCP_METRICS_GENERATORS)) {
      const p = probeService(GCP_METRICS_GENERATORS, "gcp", id, GCP_METRICS_DATASET_MAP[id]);
      if (p) {
        if (!p.dataset) p.dataset = GCP_METRICS_DATASET_MAP[id];
        gcpProbes[id] = p;
      }
    }
    for (const id of Object.keys(AZURE_METRICS_GENERATORS)) {
      const p = probeService(AZURE_METRICS_GENERATORS, "azure", id, AZURE_METRICS_DATASET_MAP[id]);
      if (p) {
        if (!p.dataset) p.dataset = AZURE_METRICS_DATASET_MAP[id];
        azureProbes[id] = p;
      }
    }
  } else {
    for (const id of Object.keys(GCP_METRICS_GENERATORS)) {
      const p = probeService(GCP_METRICS_GENERATORS, "gcp", id, GCP_METRICS_DATASET_MAP[id]);
      if (p) {
        if (!p.dataset) p.dataset = GCP_METRICS_DATASET_MAP[id];
        gcpProbes[id] = p;
      }
    }
    for (const id of Object.keys(AZURE_METRICS_GENERATORS)) {
      const p = probeService(AZURE_METRICS_GENERATORS, "azure", id, AZURE_METRICS_DATASET_MAP[id]);
      if (p) {
        if (!p.dataset) p.dataset = AZURE_METRICS_DATASET_MAP[id];
        azureProbes[id] = p;
      }
    }
  }

  if (!dashboardsOnly) {
    console.log("\n=== GCP ML migration ===");
    const gcpMl = await migrateMlJobs(
      "gcp",
      GCP_METRICS_GENERATORS,
      GCP_METRICS_DATASET_MAP,
      gcpProbes
    );
    console.log(JSON.stringify(gcpMl));

    console.log("\n=== Azure ML migration ===");
    const azMl = await migrateMlJobs(
      "azure",
      AZURE_METRICS_GENERATORS,
      AZURE_METRICS_DATASET_MAP,
      azureProbes
    );
    console.log(JSON.stringify(azMl));
  }

  // Fix known cloud-tasks broken backtick if present
  const ct = path.join(root, "installer/gcp-custom-dashboards/cloud-tasks-dashboard.json");
  if (fs.existsSync(ct)) {
    let t = fs.readFileSync(ct, "utf8");
    const bad = "`gcp.cloud-tasks.metrics.cloudtasks.googleapis.com/queue/depth`.avg";
    const good = "`gcp.cloud-tasks.metrics.cloudtasks.googleapis.com/queue/depth.avg`";
    if (t.includes(bad)) {
      t = t.replaceAll(bad, good);
      if (!dryRun) fs.writeFileSync(ct, t);
      console.log("\nFixed cloud-tasks broken backtick field path");
    }
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
