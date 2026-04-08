#!/usr/bin/env node
/**
 * Generates Kibana Saved Objects .ndjson files from the simplified dashboard
 * JSON definitions in this directory.
 *
 * Compatible with Kibana 8.11+ (ES|QL support via textBased datasource).
 * The ndjson files can be imported via:
 *   - Kibana UI: Stack Management → Saved Objects → Import
 *   - npm run setup:aws-dashboards:legacy  (uses /api/saved_objects/_import)
 *
 * Usage:
 *   node generate-ndjson.mjs
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "ndjson");

// ─── Deterministic UUID from a seed string ──────────────────────────────────

function seededUUID(seed) {
  const hash = createHash("sha1").update(seed).digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    "4" + hash.slice(13, 16), // version 4
    ((parseInt(hash[16], 16) & 3) | 8).toString(16) + hash.slice(17, 20), // variant
    hash.slice(20, 32),
  ].join("-");
}

// ─── Column type inference ───────────────────────────────────────────────────

/** Returns "date" when `col` is assigned from BUCKET(@timestamp, ...) in the query. */
function inferXType(col, query) {
  if (!query) return "string";
  const re = new RegExp(`\\b${col}\\s*=\\s*BUCKET\\s*\\(\\s*@timestamp`, "i");
  if (re.test(query)) return "date";
  const trunc = new RegExp(
    `\\b${col}\\s*=\\s*DATE_TRUNC\\s*\\([^)]+@timestamp`,
    "i"
  );
  if (trunc.test(query)) return "date";
  return "string";
}

/** Infers ES field type for datatable columns by field name. */
function inferFieldType(fieldName) {
  if (fieldName === "@timestamp") return "date";
  const numericPatterns =
    /duration|bytes|packets|count|latency|loss|accuracy|epoch|pct|utilization|sum|avg|min|max/i;
  if (numericPatterns.test(fieldName)) return "number";
  return "string";
}

// ─── Lens state builders ─────────────────────────────────────────────────────

function buildPartitionLens(attrs, panelTitle) {
  const { dataset, metrics, group_by = [] } = attrs;
  const layerId = seededUUID(`layer:${panelTitle}:${dataset.query}`);

  // Extract index pattern title from ES|QL FROM clause; use SHA-256 as adHocDataView ID
  const fromMatch = dataset.query.match(/FROM\s+([^\s|]+)/i);
  const indexTitle = fromMatch ? fromMatch[1] : "logs-aws.*";
  const indexId = createHash("sha256").update(indexTitle).digest("hex");

  // Kibana 10.x: metric columns FIRST with rich metadata, then group columns
  const metricCols = metrics.map((m) => ({
    columnId: m.column,
    fieldName: m.column,
    label: m.column,
    customLabel: false,
    meta: {
      type: "number",
      esType: "long",
      sourceParams: { indexPattern: indexTitle, sourceField: m.column },
      params: { id: "number" },
    },
    inMetricDimension: true,
  }));
  const groupCols = group_by.map((g) => ({
    columnId: g.column,
    fieldName: g.column,
    label: g.column,
    customLabel: false,
    meta: {
      type: "string",
      esType: "text",
      sourceParams: { indexPattern: indexTitle, sourceField: g.column },
      params: { id: "string" },
    },
  }));

  const colorMapping = {
    assignments: [],
    specialAssignments: [{ rules: [{ type: "other" }], color: { type: "loop" }, touched: false }],
    paletteId: "default",
    colorMode: { type: "categorical" },
  };

  return {
    title: panelTitle || "",
    description: "",
    visualizationType: "lnsPie",
    type: "lens",
    version: 2,
    references: [],
    state: {
      datasourceStates: {
        textBased: {
          layers: {
            [layerId]: {
              index: indexId,
              query: { esql: dataset.query },
              columns: [...metricCols, ...groupCols], // metric FIRST in 10.x
            },
          },
          indexPatternRefs: [{ id: indexId, title: indexTitle }], // top-level in 10.x
        },
      },
      visualization: {
        shape: "pie", // Kibana 10.x uses "pie" for all partition charts
        layers: [
          {
            layerId,
            primaryGroups: groupCols.map((c) => c.columnId),
            metrics: metrics.map((m) => m.column), // array in 10.x, not string
            numberDisplay: "percent",
            categoryDisplay: "default",
            legendDisplay: "default",
            nestedLegend: false,
            layerType: "data",
            colorMapping,
          },
        ],
      },
      query: { esql: dataset.query }, // ES|QL query at state level in 10.x
      filters: [],
      adHocDataViews: {
        [indexId]: {
          id: indexId,
          title: indexTitle,
          sourceFilters: [],
          type: "esql",
          fieldFormats: {},
          runtimeFieldMap: {},
          allowNoIndex: false,
          name: indexTitle,
          allowHidden: false,
          managed: false,
        },
      },
    },
  };
}

function buildXYLens(attrs, panelTitle) {
  const { layers } = attrs;

  const dsLayers = {};
  const vizLayers = [];

  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    const layerId = seededUUID(`layer:${panelTitle}:${i}:${layer.dataset.query}`);
    const { type: seriesType, dataset, x, y } = layer;

    const xCols = x
      ? [
          {
            columnId: x.column,
            fieldName: x.column,
            meta: { type: inferXType(x.column, dataset.query) },
          },
        ]
      : [];
    const yCols = y.map((ref) => ({
      columnId: ref.column,
      fieldName: ref.column,
      meta: { type: "number" },
    }));

    dsLayers[layerId] = {
      index: layerId,
      query: { esql: dataset.query },
      columns: [...xCols, ...yCols],
      timeField: "@timestamp",
      indexPatternRefs: [],
    };

    vizLayers.push({
      layerId,
      accessors: yCols.map((c) => c.columnId),
      seriesType,
      xAccessor: x?.column,
      layerType: "data",
      yConfig: yCols.map((c, yi) => ({
        forAccessor: c.columnId,
        ...(y[yi]?.label ? { axisMode: "left" } : {}),
      })),
    });
  }

  return {
    title: panelTitle || "",
    description: "",
    visualizationType: "lnsXY",
    type: "lens",
    references: [],
    state: {
      datasourceStates: {
        textBased: {
          layers: dsLayers,
        },
      },
      visualization: {
        preferredSeriesType: layers[0].type,
        legend: { isVisible: true, position: "right" },
        valueLabels: "hide",
        axisTitlesVisibilitySettings: { x: false, yLeft: false, yRight: false },
        layers: vizLayers,
      },
      query: { query: "", language: "kuery" },
      filters: [],
    },
  };
}

function buildMetricLens(attrs, panelTitle) {
  const { dataset, metrics } = attrs;
  const layerId = seededUUID(`layer:${panelTitle}:${dataset.query}`);
  const col = metrics[0].column;

  return {
    title: panelTitle || "",
    description: "",
    visualizationType: "lnsMetric",
    type: "lens",
    references: [],
    state: {
      datasourceStates: {
        textBased: {
          layers: {
            [layerId]: {
              index: layerId,
              query: { esql: dataset.query },
              columns: [{ columnId: col, fieldName: col, meta: { type: "number" } }],
              timeField: "@timestamp",
              indexPatternRefs: [],
            },
          },
        },
      },
      visualization: {
        layerId,
        layerType: "data",
        metricAccessor: col,
      },
      query: { query: "", language: "kuery" },
      filters: [],
    },
  };
}

function buildDatatableLens(attrs, panelTitle) {
  const { dataset, metrics } = attrs;
  const layerId = seededUUID(`layer:${panelTitle}:${dataset.query}`);

  const columns = metrics.map((m) => ({
    columnId: m.column,
    fieldName: m.column,
    meta: { type: inferFieldType(m.column) },
  }));

  return {
    title: panelTitle || "",
    description: "",
    visualizationType: "lnsDatatable",
    type: "lens",
    references: [],
    state: {
      datasourceStates: {
        textBased: {
          layers: {
            [layerId]: {
              index: layerId,
              query: { esql: dataset.query },
              columns,
              timeField: "@timestamp",
              indexPatternRefs: [],
            },
          },
        },
      },
      visualization: {
        layerId,
        layerType: "data",
        columns: columns.map((c) => ({ columnId: c.columnId, isTransposable: false })),
        rowHeight: "auto",
        rowHeightLines: 1,
      },
      query: { query: "", language: "kuery" },
      filters: [],
    },
  };
}

/** Simplified bar_stacked panels (xAxis + breakdown + one metric column). */
function buildStackedBarLens(attrs, panelTitle) {
  const { dataset, xAxis, metrics } = attrs;
  const y =
    metrics?.map((m) => ({
      column: m.column,
      label: attrs.breakdown?.column ? String(attrs.breakdown.column) : "",
    })) ?? [];
  return buildXYLens(
    {
      type: "xy",
      layers: [
        {
          type: "bar_stacked",
          dataset,
          x: { column: xAxis.column },
          y,
        },
      ],
    },
    panelTitle
  );
}

function buildLensAttributes(config) {
  const attrs = config.attributes ?? config;
  const title = config.title || "";
  if (attrs.type === "metric") return buildMetricLens(attrs, title);
  if (attrs.type === "donut" || attrs.type === "pie") return buildPartitionLens(attrs, title);
  if (attrs.type === "xy") return buildXYLens(attrs, title);
  if (attrs.type === "bar_stacked") return buildStackedBarLens(attrs, title);
  if (attrs.type === "datatable") return buildDatatableLens(attrs, title);
  throw new Error(`Unsupported chart type: ${attrs.type}`);
}

// ─── Panel builder ───────────────────────────────────────────────────────────

function buildPanel(panel, dashTitle, index) {
  const panelId = seededUUID(`panel:${dashTitle}:${index}`);
  const lensAttrs = buildLensAttributes(panel.config);

  return {
    type: "lens",
    gridData: { x: panel.grid.x, y: panel.grid.y, w: panel.grid.w, h: panel.grid.h, i: panelId },
    panelIndex: panelId,
    embeddableConfig: {
      attributes: lensAttrs,
      enhancements: {},
    },
    title: panel.config.title || "",
  };
}

// ─── Dashboard → ndjson line ─────────────────────────────────────────────────

function dashboardToSavedObject(def) {
  const id = seededUUID(`dashboard:${def.title}`);
  const panels = def.panels.map((p, i) => buildPanel(p, def.title, i));

  const attributes = {
    title: def.title,
    description: "",
    panelsJSON: JSON.stringify(panels),
    optionsJSON: JSON.stringify({
      useMargins: true,
      syncColors: false,
      syncCursor: true,
      syncTooltips: false,
      hidePanelTitles: false,
    }),
    timeRestore: !!def.time_range,
    ...(def.time_range ? { timeFrom: def.time_range.from, timeTo: def.time_range.to } : {}),
    kibanaSavedObjectMeta: {
      searchSourceJSON: JSON.stringify({
        query: { query: "", language: "kuery" },
        filter: [],
      }),
    },
  };

  return {
    id,
    type: "dashboard",
    namespaces: ["default"],
    attributes,
    references: [],
    coreMigrationVersion: "8.8.0",
    typeMigrationVersion: "10.3.0",
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

mkdirSync(OUTPUT_DIR, { recursive: true });

const files = readdirSync(__dirname).filter((f) => f.endsWith("-dashboard.json"));

if (files.length === 0) {
  console.log("No *-dashboard.json files found.");
  process.exit(0);
}

for (const file of files) {
  const def = JSON.parse(readFileSync(join(__dirname, file), "utf-8"));
  const obj = dashboardToSavedObject(def);
  const outFile = join(OUTPUT_DIR, file.replace(".json", ".ndjson"));

  writeFileSync(outFile, JSON.stringify(obj) + "\n");
  console.log(`  ✓ ${outFile.replace(__dirname + "/", "")}`);
}

console.log(`\nGenerated ${files.length} ndjson file(s) in ndjson/`);
console.log("Import via Kibana: Stack Management → Saved Objects → Import");
console.log("Import via CLI:    npm run setup:aws-dashboards:legacy");
