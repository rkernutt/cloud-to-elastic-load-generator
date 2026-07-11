import { describe, it, expect } from "vitest";
import {
  VENDOR_DASHBOARD_DIRS,
  dashboardFiles,
  readDashboardFile,
  readDashboardJson,
  findLogsMetricsMismatches,
  findUnquotedBucketTimestamp,
  findAzureRedisFlatMetrics,
  isAwsMetricsColumn,
} from "./esqlDashboardContract";

describe("ES|QL dashboard fidelity contracts", () => {
  for (const vendorDir of VENDOR_DASHBOARD_DIRS) {
    it(`${vendorDir}: logs panels must not bind *.metrics.* columns`, () => {
      for (const file of dashboardFiles(vendorDir)) {
        const dashboard = readDashboardJson(vendorDir, file);
        const violations = findLogsMetricsMismatches(dashboard);
        expect(violations, file).toEqual([]);
      }
    });

    it(`${vendorDir}: BUCKET(@timestamp must use backticks`, () => {
      for (const file of dashboardFiles(vendorDir)) {
        const text = readDashboardFile(vendorDir, file);
        expect(findUnquotedBucketTimestamp(text), file).toBe(false);
      }
    });
  }

  it("Azure Redis dashboard uses azure.cache_for_redis.metrics.* field paths", () => {
    const file = "cache-for-redis-dashboard.json";
    const vendorDir = "installer/azure-custom-dashboards";
    const text = readDashboardFile(vendorDir, file);
    const flat = findAzureRedisFlatMetrics(text);
    expect(flat, file).toEqual([]);
    expect(text, file).toMatch(/azure\.cache_for_redis\.metrics\./);
    expect(text, file).toMatch(/azure\.cache_for_redis\.metrics\.cachehits\.sum/);
    expect(text, file).not.toMatch(/`azure\.cache_for_redis\.metrics\.cachehits`(?!\.)/);
  });

  it("AWS dashboards: no logs-aws datatable column bindings for aws.*.metrics.*", () => {
    const vendorDir = "installer/aws-custom-dashboards";
    for (const file of dashboardFiles(vendorDir)) {
      const text = readDashboardFile(vendorDir, file);
      const matches = text.match(/"column": "aws\.[^"]*\.metrics\.[^"]*"/g) ?? [];
      for (const match of matches) {
        const col = match.match(/"column": "([^"]+)"/)?.[1] ?? "";
        expect(isAwsMetricsColumn(col), `${file}: ${col}`).toBe(false);
      }
    }
  });

  it("GCP and Azure service dashboards include metrics-* panels when a metrics generator exists", () => {
    // Spot-check high-traffic services that previously had logs-only dashboards.
    const required: Array<[string, string]> = [
      ["installer/gcp-custom-dashboards", "cloud-functions-dashboard.json"],
      ["installer/gcp-custom-dashboards", "cloud-run-dashboard.json"],
      ["installer/gcp-custom-dashboards", "compute-engine-dashboard.json"],
      ["installer/gcp-custom-dashboards", "bigquery-dashboard.json"],
      ["installer/azure-custom-dashboards", "functions-dashboard.json"],
      ["installer/azure-custom-dashboards", "app-service-dashboard.json"],
      ["installer/azure-custom-dashboards", "virtual-machines-dashboard.json"],
      ["installer/azure-custom-dashboards", "sql-database-dashboard.json"],
      ["installer/azure-custom-dashboards", "openai-dashboard.json"],
    ];
    for (const [dir, file] of required) {
      const text = readDashboardFile(dir, file);
      expect(text, file).toMatch(/FROM metrics-(gcp|azure)\./);
    }
  });

  it("compute-engine metrics panels cover multi-variant CPU via COALESCE", () => {
    const text = readDashboardFile(
      "installer/gcp-custom-dashboards",
      "compute-engine-dashboard.json"
    );
    expect(text).toMatch(/FROM metrics-gcp\.compute_metrics/);
    expect(text).toMatch(/cpu\/utilization/);
    expect(text).toMatch(/COALESCE\(/);
  });

  it("Azure virtual-machines metrics panels use virtual_machines_metrics CPU", () => {
    const text = readDashboardFile(
      "installer/azure-custom-dashboards",
      "virtual-machines-dashboard.json"
    );
    expect(text).toMatch(/FROM metrics-azure\.virtual_machines_metrics/);
    expect(text).toMatch(/Percentage CPU/);
  });
});
