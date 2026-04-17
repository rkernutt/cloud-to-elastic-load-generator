/**
 * Build a single-line Kibana Saved Object (dashboard) for POST /api/saved_objects/_import.
 * Ported from installer/aws-custom-dashboards/generate-ndjson.mjs — same panel JSON shape as GCP/AWS defs.
 */

import type { DashboardDef } from "./types";

const sha1Cache = new Map<string, Promise<string>>();

function sha1Hex(message: string): Promise<string> {
  const hit = sha1Cache.get(`sha1:${message}`);
  if (hit) return hit;
  const p = crypto.subtle
    .digest("SHA-1", new TextEncoder().encode(message))
    .then((buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join(""));
  sha1Cache.set(`sha1:${message}`, p);
  return p;
}

const sha256Cache = new Map<string, Promise<string>>();

function sha256Hex(message: string): Promise<string> {
  const hit = sha256Cache.get(message);
  if (hit) return hit;
  const p = crypto.subtle
    .digest("SHA-256", new TextEncoder().encode(message))
    .then((buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join(""));
  sha256Cache.set(message, p);
  return p;
}

async function seededUUID(seed: string): Promise<string> {
  const hash = await sha1Hex(seed);
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    "4" + hash.slice(13, 16),
    ((parseInt(hash[16]!, 16) & 3) | 8).toString(16) + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join("-");
}

/** Kibana tag shown in Saved Objects / Dashboards — filter on this to bulk-select installer assets. */
export const LOAD_GENERATOR_KIBANA_TAG_NAME = "cloudloadgen";

const LOAD_GENERATOR_KIBANA_TAG_SEED = "kibana-tag:cloudloadgen";
const LOAD_GENERATOR_KIBANA_TAG_REF_NAME = "tag-ref-cloudloadgen";

export async function loadGeneratorKibanaTagId(): Promise<string> {
  return seededUUID(LOAD_GENERATOR_KIBANA_TAG_SEED);
}

/** One NDJSON line: `tag` saved object (import before dashboards that reference it). */
export async function buildLoadGeneratorKibanaTagNdjsonLine(): Promise<string> {
  const id = await loadGeneratorKibanaTagId();
  const obj = {
    id,
    type: "tag",
    namespaces: ["default"],
    attributes: {
      name: LOAD_GENERATOR_KIBANA_TAG_NAME,
      description:
        "Installed by Cloud to Elastic Load Generator — filter this tag in Kibana to find or remove these assets.",
    },
    references: [] as unknown[],
    coreMigrationVersion: "8.8.0",
    typeMigrationVersion: "8.0.0",
  };
  return JSON.stringify(obj) + "\n";
}

/** Same deterministic id as dashboardDefToImportNdjsonLine (saved object import path). */
export async function dashboardDefToSavedObjectId(def: DashboardDef): Promise<string> {
  return seededUUID(`dashboard:${def.title}`);
}

function inferXType(col: string, query: string | undefined): "string" | "date" {
  if (!query) return "string";
  const re = new RegExp(`\\b${col}\\s*=\\s*BUCKET\\s*\\(\\s*\`?@timestamp\`?`, "i");
  if (re.test(query)) return "date";
  const trunc = new RegExp(`\\b${col}\\s*=\\s*DATE_TRUNC\\s*\\([^)]+\`?@timestamp\`?`, "i");
  if (trunc.test(query)) return "date";
  return "string";
}

function inferFieldType(fieldName: string): "date" | "number" | "string" {
  if (fieldName === "@timestamp") return "date";
  const numericPatterns =
    /duration|bytes|packets|count|latency|loss|accuracy|epoch|pct|utilization|sum|avg|min|max/i;
  if (numericPatterns.test(fieldName)) return "number";
  return "string";
}

interface MetricSpec {
  column: string;
  type?: string;
  operation?: string;
}

interface GroupBySpec {
  column: string;
  operation?: string;
}

interface DatasetSpec {
  type: string;
  query: string;
}

interface PartitionAttrs {
  type: "metric" | "donut" | "pie";
  dataset: DatasetSpec;
  metrics: MetricSpec[];
  group_by?: GroupBySpec[];
}

/** Parse `FROM logs-foo.bar*` → stable data view id + title (same as Kibana ES|QL text-based panels). */
async function esqlIndexFromQuery(query: string): Promise<{ indexId: string; indexTitle: string }> {
  const fromMatch = query.match(/FROM\s+([^\s|]+)/i);
  const indexTitle = fromMatch ? fromMatch[1]! : "logs-gcp.*";
  const indexId = await sha256Hex(indexTitle);
  return { indexId, indexTitle };
}

function adHocEsqlDataView(indexId: string, indexTitle: string) {
  return {
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
  };
}

async function buildPartitionLens(attrs: PartitionAttrs, panelTitle: string) {
  const { dataset, metrics, group_by = [] } = attrs;
  const layerId = await seededUUID(`layer:${panelTitle}:${dataset.query}`);

  const { indexId, indexTitle } = await esqlIndexFromQuery(dataset.query);

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
    references: [] as unknown[],
    state: {
      datasourceStates: {
        textBased: {
          layers: {
            [layerId]: {
              index: indexId,
              query: { esql: dataset.query },
              columns: [...metricCols, ...groupCols],
            },
          },
          indexPatternRefs: [{ id: indexId, title: indexTitle }],
        },
      },
      visualization: {
        shape: "pie",
        layers: [
          {
            layerId,
            primaryGroups: groupCols.map((c) => c.columnId),
            metrics: metrics.map((m) => m.column),
            numberDisplay: "percent",
            categoryDisplay: "default",
            legendDisplay: "default",
            nestedLegend: false,
            layerType: "data",
            colorMapping,
          },
        ],
      },
      query: { esql: dataset.query },
      filters: [],
      adHocDataViews: {
        [indexId]: adHocEsqlDataView(indexId, indexTitle),
      },
    },
  };
}

interface XYLayerSpec {
  type: string;
  dataset: DatasetSpec;
  x?: { column: string };
  y: Array<{ column: string; label?: string }>;
}

interface XYAttrs {
  type: "xy";
  layers: XYLayerSpec[];
}

async function buildXYLens(attrs: XYAttrs, panelTitle: string) {
  const { layers } = attrs;
  const dsLayers: Record<string, unknown> = {};
  const vizLayers: unknown[] = [];
  const adHocDataViews: Record<string, ReturnType<typeof adHocEsqlDataView>> = {};

  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i]!;
    const layerId = await seededUUID(`layer:${panelTitle}:${i}:${layer.dataset.query}`);
    const { type: seriesType, dataset, x, y } = layer;
    const { indexId, indexTitle } = await esqlIndexFromQuery(dataset.query);
    adHocDataViews[indexId] = adHocEsqlDataView(indexId, indexTitle);

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
      index: indexId,
      query: { esql: dataset.query },
      columns: [...xCols, ...yCols],
      timeField: "@timestamp",
      indexPatternRefs: [{ id: indexId, title: indexTitle }],
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
    references: [] as unknown[],
    state: {
      datasourceStates: { textBased: { layers: dsLayers } },
      visualization: {
        preferredSeriesType: layers[0]!.type,
        legend: { isVisible: true, position: "right" },
        valueLabels: "hide",
        axisTitlesVisibilitySettings: { x: false, yLeft: false, yRight: false },
        layers: vizLayers,
      },
      query: { query: "", language: "kuery" },
      filters: [],
      adHocDataViews,
    },
  };
}

interface MetricLensAttrs {
  type: "metric";
  dataset: DatasetSpec;
  metrics: MetricSpec[];
}

async function buildMetricLens(attrs: MetricLensAttrs, panelTitle: string) {
  const { dataset, metrics } = attrs;
  const layerId = await seededUUID(`layer:${panelTitle}:${dataset.query}`);
  const col = metrics[0]!.column;
  const { indexId, indexTitle } = await esqlIndexFromQuery(dataset.query);

  return {
    title: panelTitle || "",
    description: "",
    visualizationType: "lnsMetric",
    type: "lens",
    references: [] as unknown[],
    state: {
      datasourceStates: {
        textBased: {
          layers: {
            [layerId]: {
              index: indexId,
              query: { esql: dataset.query },
              columns: [{ columnId: col, fieldName: col, meta: { type: "number" } }],
              timeField: "@timestamp",
              indexPatternRefs: [{ id: indexId, title: indexTitle }],
            },
          },
        },
      },
      visualization: { layerId, layerType: "data", metricAccessor: col },
      query: { query: "", language: "kuery" },
      filters: [],
      adHocDataViews: {
        [indexId]: adHocEsqlDataView(indexId, indexTitle),
      },
    },
  };
}

interface DatatableAttrs {
  type: "datatable";
  dataset: DatasetSpec;
  metrics: Array<{ column: string }>;
}

async function buildDatatableLens(attrs: DatatableAttrs, panelTitle: string) {
  const { dataset, metrics } = attrs;
  const layerId = await seededUUID(`layer:${panelTitle}:${dataset.query}`);
  const { indexId, indexTitle } = await esqlIndexFromQuery(dataset.query);

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
    references: [] as unknown[],
    state: {
      datasourceStates: {
        textBased: {
          layers: {
            [layerId]: {
              index: indexId,
              query: { esql: dataset.query },
              columns,
              timeField: "@timestamp",
              indexPatternRefs: [{ id: indexId, title: indexTitle }],
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
      adHocDataViews: {
        [indexId]: adHocEsqlDataView(indexId, indexTitle),
      },
    },
  };
}

interface BarStackedAttrs {
  type: "bar_stacked";
  dataset: DatasetSpec;
  xAxis: { column: string };
  metrics: MetricSpec[];
  breakdown?: { column: string };
}

async function buildStackedBarLens(attrs: BarStackedAttrs, panelTitle: string) {
  const { dataset, xAxis, metrics } = attrs;
  const y =
    metrics?.map((m) => ({
      column: m.column,
      label: attrs.breakdown?.column ? String(attrs.breakdown.column) : "",
    })) ?? [];
  return buildXYLens(
    {
      type: "xy",
      layers: [{ type: "bar_stacked", dataset, x: { column: xAxis.column }, y }],
    },
    panelTitle
  );
}

async function buildLensAttributes(config: {
  title?: string;
  attributes?: unknown;
}): Promise<unknown> {
  const attrs = (config.attributes ?? config) as Record<string, unknown>;
  const title = config.title || "";
  const t = attrs.type as string;
  if (t === "metric") return buildMetricLens(attrs as unknown as MetricLensAttrs, title);
  if (t === "donut" || t === "pie")
    return buildPartitionLens(attrs as unknown as PartitionAttrs, title);
  if (t === "xy") return buildXYLens(attrs as unknown as XYAttrs, title);
  if (t === "bar_stacked") return buildStackedBarLens(attrs as unknown as BarStackedAttrs, title);
  if (t === "datatable") return buildDatatableLens(attrs as unknown as DatatableAttrs, title);
  throw new Error(`Unsupported chart type: ${t}`);
}

interface PanelShape {
  type: string;
  grid: { x: number; y: number; w: number; h: number };
  config: { title?: string; attributes?: unknown };
}

async function buildPanel(panel: PanelShape, dashTitle: string, index: number) {
  const panelId = await seededUUID(`panel:${dashTitle}:${index}`);
  const lensAttrs = await buildLensAttributes(panel.config);

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

export type DashboardSavedObjectPayload = {
  id: string;
  attributes: Record<string, unknown>;
  references: unknown[];
  coreMigrationVersion: string;
  typeMigrationVersion: string;
};

/** Full saved-object shape for NDJSON import and for PUT /api/saved_objects/dashboard/:id (Serverless). */
export async function buildDashboardSavedObjectPayload(
  def: DashboardDef
): Promise<DashboardSavedObjectPayload> {
  const panelsRaw = def.panels;
  if (!Array.isArray(panelsRaw)) {
    throw new Error("Dashboard definition missing panels array");
  }
  const id = await seededUUID(`dashboard:${def.title}`);
  const tagId = await loadGeneratorKibanaTagId();
  const panels = await Promise.all(
    panelsRaw.map((p, i) => buildPanel(p as PanelShape, def.title, i))
  );

  const timeRange = def.time_range as { from: string; to: string } | undefined;

  const attributes: Record<string, unknown> = {
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
    timeRestore: !!timeRange,
    ...(timeRange ? { timeFrom: timeRange.from, timeTo: timeRange.to } : {}),
    kibanaSavedObjectMeta: {
      searchSourceJSON: JSON.stringify({
        query: { query: "", language: "kuery" },
        filter: [],
      }),
    },
  };

  return {
    id,
    attributes,
    references: [{ type: "tag", id: tagId, name: LOAD_GENERATOR_KIBANA_TAG_REF_NAME }],
    coreMigrationVersion: "8.8.0",
    typeMigrationVersion: "10.3.0",
  };
}

/** Dashboard saved-object line only (no tag line). */
export async function dashboardDefToDashboardNdjsonLineOnly(def: DashboardDef): Promise<string> {
  const { id, attributes, references, coreMigrationVersion, typeMigrationVersion } =
    await buildDashboardSavedObjectPayload(def);
  const obj = {
    id,
    type: "dashboard",
    namespaces: ["default"],
    attributes,
    references,
    coreMigrationVersion,
    typeMigrationVersion,
  };

  return JSON.stringify(obj) + "\n";
}

/** Tag line + dashboard line for `POST /api/saved_objects/_import` (tag must precede dashboard). */
export async function dashboardDefToImportNdjsonLine(def: DashboardDef): Promise<string> {
  const tagLine = await buildLoadGeneratorKibanaTagNdjsonLine();
  const dashLine = await dashboardDefToDashboardNdjsonLineOnly(def);
  return tagLine + dashLine;
}
