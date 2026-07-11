import fs from "node:fs";
import path from "node:path";

export const VENDOR_DASHBOARD_DIRS = [
  "installer/aws-custom-dashboards",
  "installer/azure-custom-dashboards",
  "installer/gcp-custom-dashboards",
] as const;

export function dashboardFiles(dir: string): string[] {
  const root = path.join(process.cwd(), dir);
  return fs.readdirSync(root).filter((f) => f.endsWith("-dashboard.json"));
}

export function readDashboardFile(vendorDir: string, file: string): string {
  return fs.readFileSync(path.join(process.cwd(), vendorDir, file), "utf8");
}

export function readDashboardJson(vendorDir: string, file: string): Record<string, unknown> {
  return JSON.parse(readDashboardFile(vendorDir, file)) as Record<string, unknown>;
}

const LOGS_FROM = /\bFROM\s+logs-/i;
const AWS_METRICS_COLUMN = /aws\.[^.]+\.metrics\./;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function bareColumn(col: string): string {
  return col.replace(/^`|`$/g, "");
}

export function isAwsMetricsColumn(col: string): boolean {
  return AWS_METRICS_COLUMN.test(bareColumn(col));
}

export function isLogsQuery(query: string): boolean {
  return LOGS_FROM.test(query);
}

function collectColumnBindings(node: unknown, out: string[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectColumnBindings(item, out);
    return;
  }
  if (!isPlainObject(node)) return;

  if (typeof node.column === "string") {
    out.push(node.column);
  }
  for (const value of Object.values(node)) {
    if (value !== node.column) collectColumnBindings(value, out);
  }
}

export type PanelViolation = {
  panelUid?: string;
  reason: string;
  query?: string;
  columns?: string[];
};

function inspectAttributes(
  attributes: Record<string, unknown>,
  panelUid: string | undefined,
  violations: PanelViolation[]
): void {
  const query = (attributes.dataset as { query?: string } | undefined)?.query;
  if (typeof query === "string" && isLogsQuery(query)) {
    if (/\.metrics\.|cloudwatch_metrics/.test(query)) {
      violations.push({
        panelUid,
        reason: "logs query references metrics fields in ES|QL",
        query,
      });
    }
    const columns: string[] = [];
    for (const key of ["metrics", "group_by", "breakdown", "breakdowns", "x", "y"]) {
      if (attributes[key] !== undefined) collectColumnBindings(attributes[key], columns);
    }
    const metricColumns = columns.filter((c) => /\.metrics\./.test(bareColumn(c)));
    if (metricColumns.length > 0) {
      violations.push({
        panelUid,
        reason: "logs query panel binds metrics columns",
        query,
        columns: metricColumns,
      });
    }
  }

  const layers = attributes.layers;
  if (!Array.isArray(layers)) return;

  for (const layer of layers) {
    if (!isPlainObject(layer)) continue;
    const layerQuery = (layer.dataset as { query?: string } | undefined)?.query;
    if (typeof layerQuery !== "string" || !isLogsQuery(layerQuery)) continue;

    if (/\.metrics\.|cloudwatch_metrics/.test(layerQuery)) {
      violations.push({
        panelUid,
        reason: "logs layer references metrics fields in ES|QL",
        query: layerQuery,
      });
    }
    const columns: string[] = [];
    for (const key of ["metrics", "group_by", "breakdown", "breakdowns", "x", "y"]) {
      if (layer[key] !== undefined) collectColumnBindings(layer[key], columns);
    }
    const metricColumns = columns.filter((c) => /\.metrics\./.test(bareColumn(c)));
    if (metricColumns.length > 0) {
      violations.push({
        panelUid,
        reason: "logs layer binds metrics columns",
        query: layerQuery,
        columns: metricColumns,
      });
    }
  }
}

export function findLogsMetricsMismatches(dashboard: Record<string, unknown>): PanelViolation[] {
  const violations: PanelViolation[] = [];
  const panels = dashboard.panels;
  if (!Array.isArray(panels)) return violations;

  for (const panel of panels) {
    if (!isPlainObject(panel)) continue;
    const attributes = (panel.config as { attributes?: Record<string, unknown> } | undefined)
      ?.attributes;
    if (!attributes) continue;
    inspectAttributes(
      attributes,
      typeof panel.uid === "string" ? panel.uid : undefined,
      violations
    );
  }

  return violations;
}

export function findUnquotedBucketTimestamp(text: string): boolean {
  return /BUCKET\(@timestamp/.test(text);
}

export function findAzureRedisFlatMetrics(text: string): string[] {
  const matches = text.match(/`azure\.metrics\.[a-zA-Z0-9_]+`/g);
  return matches ?? [];
}
