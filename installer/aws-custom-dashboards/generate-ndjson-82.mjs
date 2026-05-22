#!/usr/bin/env node
/**
 * Generates Kibana 8.2-compatible Saved Objects .ndjson files from simplified
 * dashboard JSON definitions (ES|QL → indexpattern Lens aggregations).
 *
 * Usage:
 *   node generate-ndjson-82.mjs
 *   npm run generate:aws-dashboards:ndjson-82
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "ndjson-82");

// ─── Deterministic UUID from a seed string ──────────────────────────────────

function seededUUID(seed) {
  const hash = createHash("sha1").update(seed).digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    "4" + hash.slice(13, 16),
    ((parseInt(hash[16], 16) & 3) | 8).toString(16) + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join("-");
}

const LOAD_GENERATOR_KIBANA_TAG_NAME = "cloudloadgen";
const LOAD_GENERATOR_KIBANA_TAG_ID = seededUUID("kibana-tag:cloudloadgen");
const LOAD_GENERATOR_KIBANA_TAG_REF_NAME = "tag-ref-cloudloadgen";

function loadGeneratorTagSavedObject() {
  return {
    id: LOAD_GENERATOR_KIBANA_TAG_ID,
    type: "tag",
    namespaces: ["default"],
    attributes: {
      name: LOAD_GENERATOR_KIBANA_TAG_NAME,
      description:
        "Installed by Cloud Loadgen for Elastic — filter this tag in Kibana to find or remove these assets.",
    },
    references: [],
    coreMigrationVersion: "8.2.0",
    typeMigrationVersion: "8.0.0",
  };
}

function indexPatternSavedObject(title) {
  const id = seededUUID(`index-pattern:${title}`);
  return {
    id,
    type: "index-pattern",
    namespaces: ["default"],
    attributes: {
      title,
      timeFieldName: "@timestamp",
    },
    references: [],
    coreMigrationVersion: "8.2.0",
    typeMigrationVersion: "8.0.0",
  };
}

function indexPatternRefName(layerId) {
  return `indexpattern-datasource-layer-${layerId}`;
}

// ─── ES|QL parsing (best-effort) ───────────────────────────────────────────

function extractIndexTitle(query) {
  const m = query.match(/FROM\s+([^\s|]+)/i);
  return m ? m[1] : "logs-aws.*";
}

function stripBackticks(s) {
  const t = s.trim();
  const m = t.match(/^`([^`]+)`$/);
  return m ? m[1] : t;
}

function splitAssignments(part) {
  const items = [];
  let depth = 0;
  let current = "";
  for (const ch of part) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      if (current.trim()) items.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) items.push(current.trim());
  return items;
}

function cleanFieldName(raw) {
  let field = stripBackticks(raw.trim());
  if (field.includes("@timestamp")) return "@timestamp";
  return field;
}

function isComplexExpression(expr) {
  return /\b(EVAL|CASE|ROUND|COALESCE|WHERE|BUCKET|DATE_TRUNC)\b/i.test(expr);
}

function parseMetricAssignment(assign) {
  const named = assign.match(/^(`[^`]+`|\w[\w\s%().-]*)\s*=\s*(.+)$/s);
  if (!named) {
    return { alias: "count", op: "count", field: "___records___", complex: false };
  }
  const alias = stripBackticks(named[1]);
  const expr = named[2].trim();
  if (isComplexExpression(expr) && !/^COUNT\s*\(/i.test(expr)) {
    return { alias, op: "count", field: "___records___", complex: true };
  }
  if (/^COUNT\s*\(\s*\)/i.test(expr)) {
    return { alias, op: "count", field: "___records___", complex: false };
  }
  const avg = expr.match(/^AVG\s*\(\s*([^)]+)\s*\)/i);
  if (avg) return { alias, op: "average", field: cleanFieldName(avg[1]), complex: false };
  const sum = expr.match(/^SUM\s*\(\s*([^)]+)\s*\)/i);
  if (sum) return { alias, op: "sum", field: cleanFieldName(sum[1]), complex: false };
  const min = expr.match(/^MIN\s*\(\s*([^)]+)\s*\)/i);
  if (min) return { alias, op: "min", field: cleanFieldName(min[1]), complex: false };
  const max = expr.match(/^MAX\s*\(\s*([^)]+)\s*\)/i);
  if (max) return { alias, op: "max", field: cleanFieldName(max[1]), complex: false };
  const median = expr.match(/^MEDIAN\s*\(\s*([^)]+)\s*\)/i);
  if (median) return { alias, op: "median", field: cleanFieldName(median[1]), complex: false };
  const distinct = expr.match(/^COUNT_DISTINCT\s*\(\s*([^)]+)\s*\)/i);
  if (distinct) {
    return { alias, op: "unique_count", field: cleanFieldName(distinct[1]), complex: false };
  }
  const pct = expr.match(/^PERCENTILE\s*\(\s*([^,]+)\s*,\s*(\d+(?:\.\d+)?)\s*\)/i);
  if (pct) {
    return {
      alias,
      op: "percentile",
      field: cleanFieldName(pct[1]),
      percentile: Number(pct[2]),
      complex: false,
    };
  }
  return { alias, op: "count", field: "___records___", complex: true };
}

function parseDimensionAssignment(assign) {
  const bucket = assign.match(/^\s*(`[^`]+`|\w+)\s*=\s*BUCKET\s*\(/i);
  if (bucket) {
    return {
      alias: stripBackticks(bucket[1]),
      op: "date_histogram",
      field: "@timestamp",
    };
  }
  const trunc = assign.match(/^\s*(`[^`]+`|\w+)\s*=\s*DATE_TRUNC\s*\(/i);
  if (trunc) {
    return {
      alias: stripBackticks(trunc[1]),
      op: "date_histogram",
      field: "@timestamp",
    };
  }
  const named = assign.match(/^\s*(`[^`]+`|\w+)\s*=\s*(.+)$/s);
  if (named) {
    let field = named[2].trim();
    const coalesce = field.match(/^COALESCE\s*\(\s*([^,]+)/i);
    if (coalesce) field = coalesce[1].trim();
    field = cleanFieldName(field);
    return { alias: stripBackticks(named[1]), op: "terms", field };
  }
  const bare = stripBackticks(assign);
  return { alias: bare, op: "terms", field: bare };
}

function parseStatsFromQuery(query) {
  const parts = query.split("|").map((s) => s.trim());
  let statsPart = null;
  let keepFields = null;
  let useFallback = false;

  for (const part of parts) {
    if (/^STATS\b/i.test(part)) statsPart = part;
    if (/^KEEP\b/i.test(part)) {
      const keepBody = part.replace(/^KEEP\s+/i, "");
      keepFields = splitAssignments(keepBody).map(cleanFieldName);
    }
    if (/^(EVAL|WHERE)\b/i.test(part) && /\b(CASE|EVAL)\b/i.test(part)) useFallback = true;
  }

  if (!statsPart) {
    return {
      metrics: [{ alias: "count", op: "count", field: "___records___" }],
      dimensions: [],
      keepFields,
      useFallback: true,
    };
  }

  const body = statsPart.replace(/^STATS\s+/i, "");
  const byIdx = body.search(/\s+BY\s+/i);
  let metricsPart;
  let dimsPart = "";
  if (byIdx >= 0) {
    metricsPart = body.slice(0, byIdx).trim();
    dimsPart = body.slice(byIdx + 4).trim();
  } else {
    metricsPart = body;
  }

  const metrics = splitAssignments(metricsPart).map(parseMetricAssignment);
  const dimensions = dimsPart ? splitAssignments(dimsPart).map(parseDimensionAssignment) : [];

  if (metrics.some((m) => m.complex)) useFallback = true;
  if (parts.some((p) => /^EVAL\b/i.test(p))) useFallback = true;
  if (useFallback) {
    return {
      metrics: [{ alias: "count", op: "count", field: "___records___" }],
      dimensions,
      keepFields,
      useFallback: true,
    };
  }

  return { metrics, dimensions, keepFields, useFallback: false };
}

function inferFieldDataType(field) {
  if (field === "@timestamp" || field.includes("timestamp")) return "date";
  if (
    /duration|bytes|packets|count|latency|loss|accuracy|epoch|pct|utilization|sum|avg|min|max|errors|throttles/i.test(
      field
    )
  ) {
    return "number";
  }
  return "string";
}

// ─── Indexpattern column builders ────────────────────────────────────────────

let colCounter = 0;
function nextColId() {
  colCounter += 1;
  return `col-${colCounter}`;
}

function resetColCounter() {
  colCounter = 0;
}

function buildMetricColumn(id, spec, label) {
  const base = {
    label: label || spec.alias,
    dataType: "number",
    isBucketed: false,
    scale: "ratio",
    sourceField: spec.field,
  };
  switch (spec.op) {
    case "average":
      return { ...base, operationType: "average" };
    case "sum":
      return { ...base, operationType: "sum" };
    case "min":
      return { ...base, operationType: "min" };
    case "max":
      return { ...base, operationType: "max" };
    case "median":
      return { ...base, operationType: "median" };
    case "unique_count":
      return { ...base, operationType: "unique_count" };
    case "percentile":
      return {
        ...base,
        operationType: "percentile",
        params: { percentile: spec.percentile ?? 50 },
      };
    case "count":
    default:
      return {
        label: label || spec.alias || "Count",
        dataType: "number",
        operationType: "count",
        isBucketed: false,
        scale: "ratio",
        sourceField: "___records___",
      };
  }
}

function buildBucketColumn(id, dim, orderByColId, size = 10) {
  if (dim.op === "date_histogram") {
    return {
      label: dim.alias || dim.field,
      dataType: "date",
      operationType: "date_histogram",
      sourceField: dim.field,
      isBucketed: true,
      scale: "interval",
      params: { interval: "auto" },
    };
  }
  const dataType = inferFieldDataType(dim.field);
  return {
    label: dim.alias || dim.field,
    dataType,
    operationType: "terms",
    scale: "ordinal",
    sourceField: dim.field,
    isBucketed: true,
    params: {
      size,
      orderBy: orderByColId ? { columnId: orderByColId, type: "column" } : undefined,
      orderDirection: "desc",
    },
  };
}

function buildLastValueColumn(id, field, label, termsColId) {
  return {
    label: label || field,
    dataType: inferFieldDataType(field),
    operationType: "last_value",
    sourceField: field,
    isBucketed: false,
    scale: "ordinal",
    params: {
      sortField: "@timestamp",
      sortOrder: "desc",
      size: 1,
    },
  };
}

function buildIndexPatternLayer(query, indexPatternId, options = {}) {
  resetColCounter();
  const parsed = parseStatsFromQuery(query);
  const columns = {};
  const columnOrder = [];

  const metricSpecs = parsed.useFallback
    ? [{ alias: "count", op: "count", field: "___records___" }]
    : parsed.metrics.length
      ? parsed.metrics
      : [{ alias: "count", op: "count", field: "___records___" }];

  const metricColIds = metricSpecs.map((spec) => {
    const id = nextColId();
    columns[id] = buildMetricColumn(id, spec);
    return id;
  });

  const primaryMetricId = metricColIds[0];
  const bucketDims = parsed.dimensions.length ? parsed.dimensions : options.extraDimensions || [];

  const bucketColIds = bucketDims.map((dim) => {
    const id = nextColId();
    columns[id] = buildBucketColumn(id, dim, primaryMetricId, options.termsSize ?? 10);
    columnOrder.push(id);
    return id;
  });

  for (const id of metricColIds) {
    columnOrder.push(id);
  }

  if (options.keepFields?.length) {
    const termsId =
      bucketColIds[0] ??
      (() => {
        const id = nextColId();
        columns[id] = buildBucketColumn(
          id,
          { alias: "_id", op: "terms", field: "_id" },
          primaryMetricId,
          options.termsSize ?? 100
        );
        columnOrder.unshift(id);
        return id;
      })();

    for (const field of options.keepFields) {
      const id = nextColId();
      columns[id] = buildLastValueColumn(id, field, field, termsId);
      columnOrder.push(id);
    }
  }

  return {
    columns,
    columnOrder,
    primaryMetricId,
    metricColIds,
    bucketColIds,
    parsed,
  };
}

// ─── Lens state builders (indexpattern datasource) ───────────────────────────

function baseLensState(datasourceLayer, visualization, indexPatternId, layerId) {
  return {
    datasourceStates: {
      indexpattern: {
        layers: {
          [layerId]: {
            ...datasourceLayer,
            indexPatternId,
            incompleteColumns: {},
          },
        },
      },
    },
    visualization,
    query: { query: "", language: "kuery" },
    filters: [],
  };
}

function lensReferences(indexPatternId, layerIds) {
  return layerIds.map((layerId) => ({
    type: "index-pattern",
    id: indexPatternId,
    name: indexPatternRefName(layerId),
  }));
}

function buildMetricLens(attrs, panelTitle) {
  const { dataset, metrics } = attrs;
  const query = dataset.query;
  const indexTitle = extractIndexTitle(query);
  const indexPatternId = seededUUID(`index-pattern:${indexTitle}`);
  const layerId = seededUUID(`layer:${panelTitle}:${query}`);
  const metricLabel = metrics[0]?.column || "Count";
  const layer = buildIndexPatternLayer(query, indexPatternId);
  const metricColId = layer.primaryMetricId;

  return {
    lens: {
      title: panelTitle || "",
      description: "",
      visualizationType: "lnsMetric",
      type: "lens",
      references: lensReferences(indexPatternId, [layerId]),
      state: baseLensState(
        { columns: layer.columns, columnOrder: layer.columnOrder },
        {
          layerId,
          layerType: "data",
          accessor: metricColId,
        },
        indexPatternId,
        layerId
      ),
    },
    indexTitle,
    indexPatternId,
    layerIds: [layerId],
  };
}

function buildPartitionLens(attrs, panelTitle, shape = "donut") {
  const { dataset, metrics, group_by = [] } = attrs;
  const query = dataset.query;
  const indexTitle = extractIndexTitle(query);
  const indexPatternId = seededUUID(`index-pattern:${indexTitle}`);
  const layerId = seededUUID(`layer:${panelTitle}:${query}`);

  let layer = buildIndexPatternLayer(query, indexPatternId, { termsSize: 10 });
  if (!layer.bucketColIds.length && group_by.length) {
    const dims = group_by.map((g) => ({
      alias: g.column,
      op: "terms",
      field: g.column,
    }));
    layer = buildIndexPatternLayer(query, indexPatternId, { extraDimensions: dims, termsSize: 10 });
  }

  const groupColId = layer.bucketColIds[0];
  const metricColId = layer.primaryMetricId;

  return {
    lens: {
      title: panelTitle || "",
      description: "",
      visualizationType: "lnsPie",
      type: "lens",
      references: lensReferences(indexPatternId, [layerId]),
      state: baseLensState(
        { columns: layer.columns, columnOrder: layer.columnOrder },
        {
          shape,
          layers: [
            {
              layerId,
              groups: groupColId ? [groupColId] : [],
              metric: metricColId,
              numberDisplay: "percent",
              categoryDisplay: "default",
              legendDisplay: "default",
              nestedLegend: false,
              layerType: "data",
            },
          ],
        },
        indexPatternId,
        layerId
      ),
    },
    indexTitle,
    indexPatternId,
    layerIds: [layerId],
  };
}

function buildXYLens(attrs, panelTitle) {
  const { layers } = attrs;
  const dsLayers = {};
  const vizLayers = [];
  const allLayerIds = [];
  const layerIndexPatternIds = [];
  const indexTitles = new Set();
  const indexPatternIds = new Set();
  const lensRefs = [];

  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    const layerId = seededUUID(`layer:${panelTitle}:${i}:${layer.dataset.query}`);
    const query = layer.dataset.query;
    const indexTitle = extractIndexTitle(query);
    const indexPatternId = seededUUID(`index-pattern:${indexTitle}`);
    indexTitles.add(indexTitle);
    indexPatternIds.add(indexPatternId);
    allLayerIds.push(layerId);
    layerIndexPatternIds.push(indexPatternId);
    lensRefs.push({
      type: "index-pattern",
      id: indexPatternId,
      name: indexPatternRefName(layerId),
    });

    const parsed = parseStatsFromQuery(query);
    let ipLayer = buildIndexPatternLayer(query, indexPatternId);

    const xCol = layer.x?.column;
    const hasXBucket = ipLayer.bucketColIds.some(
      (_, idx) => parsed.dimensions[idx]?.alias === xCol
    );
    if (xCol && !hasXBucket) {
      const isDate = inferXTypeFromQuery(xCol, query) === "date";
      const dim = isDate
        ? { alias: xCol, op: "date_histogram", field: "@timestamp" }
        : { alias: xCol, op: "terms", field: xCol };
      ipLayer = buildIndexPatternLayer(query, indexPatternId, { extraDimensions: [dim] });
    }

    const xAccessor = ipLayer.bucketColIds[0];
    const yAccessors = ipLayer.metricColIds.length
      ? ipLayer.metricColIds
      : [ipLayer.primaryMetricId];

    dsLayers[layerId] = {
      columns: ipLayer.columns,
      columnOrder: ipLayer.columnOrder,
      indexPatternId,
      incompleteColumns: {},
    };

    vizLayers.push({
      layerId,
      accessors: yAccessors,
      position: "top",
      seriesType: layer.type,
      showGridlines: false,
      layerType: "data",
      xAccessor,
    });
  }

  return {
    lens: {
      title: panelTitle || "",
      description: "",
      visualizationType: "lnsXY",
      type: "lens",
      references: lensRefs,
      state: {
        datasourceStates: { indexpattern: { layers: dsLayers } },
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
    },
    indexTitles: [...indexTitles],
    indexPatternIds: [...indexPatternIds],
    layerIds: allLayerIds,
    layerIndexPatternIds,
  };
}

function inferXTypeFromQuery(col, query) {
  const re = new RegExp(`\\b${col}\\s*=\\s*BUCKET\\s*\\(\\s*\`?@timestamp\`?`, "i");
  if (re.test(query)) return "date";
  const trunc = new RegExp(`\\b${col}\\s*=\\s*DATE_TRUNC\\s*\\([^)]+\`?@timestamp\`?`, "i");
  if (trunc.test(query)) return "date";
  return "string";
}

function buildStackedBarLens(attrs, panelTitle) {
  const { dataset, xAxis, breakdown } = attrs;
  const query = dataset.query;
  const indexTitle = extractIndexTitle(query);
  const indexPatternId = seededUUID(`index-pattern:${indexTitle}`);
  const layerId = seededUUID(`layer:${panelTitle}:${query}`);

  let layer = buildIndexPatternLayer(query, indexPatternId, { termsSize: 10 });
  if (!layer.bucketColIds.length && xAxis) {
    const xDim =
      xAxis.type === "date" || inferXTypeFromQuery(xAxis.column, query) === "date"
        ? { alias: xAxis.column, op: "date_histogram", field: "@timestamp" }
        : { alias: xAxis.column, op: "terms", field: xAxis.column };
    const breakdownDim = breakdown
      ? { alias: breakdown.column, op: "terms", field: breakdown.column }
      : null;
    const extraDimensions = breakdownDim ? [xDim, breakdownDim] : [xDim];
    layer = buildIndexPatternLayer(query, indexPatternId, { extraDimensions, termsSize: 10 });
  }

  const xAccessor = layer.bucketColIds[0];
  const splitAccessor =
    breakdown && layer.bucketColIds.length > 1 ? layer.bucketColIds[1] : undefined;
  const metricColId = layer.primaryMetricId;

  return {
    lens: {
      title: panelTitle || "",
      description: "",
      visualizationType: "lnsXY",
      type: "lens",
      references: lensReferences(indexPatternId, [layerId]),
      state: baseLensState(
        { columns: layer.columns, columnOrder: layer.columnOrder },
        {
          preferredSeriesType: "bar_stacked",
          legend: { isVisible: true, position: "right" },
          valueLabels: "hide",
          axisTitlesVisibilitySettings: { x: false, yLeft: false, yRight: false },
          layers: [
            {
              layerId,
              accessors: [metricColId],
              position: "top",
              seriesType: "bar_stacked",
              showGridlines: false,
              layerType: "data",
              xAccessor,
              ...(splitAccessor ? { splitAccessor } : {}),
            },
          ],
        },
        indexPatternId,
        layerId
      ),
    },
    indexTitle,
    indexPatternId,
    layerIds: [layerId],
  };
}

function buildDatatableLens(attrs, panelTitle) {
  const { dataset, metrics } = attrs;
  const query = dataset.query;
  const indexTitle = extractIndexTitle(query);
  const indexPatternId = seededUUID(`index-pattern:${indexTitle}`);
  const layerId = seededUUID(`layer:${panelTitle}:${query}`);

  const parsed = parseStatsFromQuery(query);
  const keepFields =
    parsed.keepFields ?? metrics.map((m) => cleanFieldName(m.column)).filter(Boolean);

  const layer = buildIndexPatternLayer(query, indexPatternId, {
    keepFields,
    termsSize: 100,
  });

  const tableColumns = layer.columnOrder.map((columnId) => ({
    columnId,
    isTransposable: false,
  }));

  return {
    lens: {
      title: panelTitle || "",
      description: "",
      visualizationType: "lnsDatatable",
      type: "lens",
      references: lensReferences(indexPatternId, [layerId]),
      state: baseLensState(
        { columns: layer.columns, columnOrder: layer.columnOrder },
        {
          layerId,
          layerType: "data",
          columns: tableColumns,
          rowHeight: "auto",
          rowHeightLines: 1,
        },
        indexPatternId,
        layerId
      ),
    },
    indexTitle,
    indexPatternId,
    layerIds: [layerId],
  };
}

function buildLensAttributes(config) {
  const attrs = config.attributes ?? config;
  const title = config.title || "";
  if (attrs.type === "metric") return buildMetricLens(attrs, title);
  if (attrs.type === "donut" || attrs.type === "pie") {
    return buildPartitionLens(attrs, title, attrs.type === "pie" ? "pie" : "donut");
  }
  if (attrs.type === "xy") return buildXYLens(attrs, title);
  if (attrs.type === "bar_stacked") return buildStackedBarLens(attrs, title);
  if (attrs.type === "datatable") return buildDatatableLens(attrs, title);
  throw new Error(`Unsupported chart type: ${attrs.type}`);
}

// ─── Panel & dashboard builders ──────────────────────────────────────────────

function buildPanel(panel, dashTitle, index) {
  const panelId = seededUUID(`panel:${dashTitle}:${index}`);
  const built = buildLensAttributes(panel.config);

  return {
    panel: {
      type: "lens",
      gridData: { x: panel.grid.x, y: panel.grid.y, w: panel.grid.w, h: panel.grid.h, i: panelId },
      panelIndex: panelId,
      embeddableConfig: {
        attributes: built.lens,
        enhancements: {},
      },
      title: panel.config.title || "",
    },
    meta: built,
  };
}

function dashboardToSavedObject(def) {
  const id = seededUUID(`dashboard:${def.title}`);
  const builtPanels = def.panels.map((p, i) => buildPanel(p, def.title, i));
  const panels = builtPanels.map((b) => b.panel);

  const indexPatternByTitle = new Map();
  const dashboardReferences = [
    { type: "tag", id: LOAD_GENERATOR_KIBANA_TAG_ID, name: LOAD_GENERATOR_KIBANA_TAG_REF_NAME },
  ];
  const seenRef = new Set();

  for (const { meta } of builtPanels) {
    const titles = meta.indexTitles ?? (meta.indexTitle ? [meta.indexTitle] : []);
    const layerIds = meta.layerIds ?? [];
    const layerIpIds =
      meta.layerIndexPatternIds ??
      (meta.indexPatternId ? layerIds.map(() => meta.indexPatternId) : []);

    for (const title of titles) {
      if (!indexPatternByTitle.has(title)) {
        indexPatternByTitle.set(title, indexPatternSavedObject(title));
      }
    }

    for (let i = 0; i < layerIds.length; i++) {
      const layerId = layerIds[i];
      const title = titles[i] ?? titles[0];
      const ipId = layerIpIds[i] ?? seededUUID(`index-pattern:${title}`);
      const refName = indexPatternRefName(layerId);
      const key = `${ipId}:${refName}`;
      if (!seenRef.has(key)) {
        seenRef.add(key);
        dashboardReferences.push({
          type: "index-pattern",
          id: ipId,
          name: refName,
        });
      }
    }
  }

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
    savedObject: {
      id,
      type: "dashboard",
      namespaces: ["default"],
      attributes,
      references: dashboardReferences,
      coreMigrationVersion: "8.2.0",
      typeMigrationVersion: "8.0.0",
    },
    indexPatterns: [...indexPatternByTitle.values()],
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
  const { savedObject, indexPatterns } = dashboardToSavedObject(def);
  const outFile = join(OUTPUT_DIR, file.replace(".json", ".ndjson"));

  const lines = [
    JSON.stringify(loadGeneratorTagSavedObject()),
    ...indexPatterns.map((ip) => JSON.stringify(ip)),
    JSON.stringify(savedObject),
  ];

  writeFileSync(outFile, lines.join("\n") + "\n");
  console.log(
    `  ✓ ${outFile.replace(__dirname + "/", "")} (${indexPatterns.length} index pattern(s))`
  );
}

console.log(`\nGenerated ${files.length} ndjson file(s) in ndjson-82/`);
console.log("Import via Kibana: Stack Management → Saved Objects → Import");
