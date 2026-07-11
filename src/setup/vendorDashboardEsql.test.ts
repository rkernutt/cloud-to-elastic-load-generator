import { describe, it, expect } from "vitest";
import { VENDOR_DASHBOARD_DIRS, dashboardFiles, readDashboardFile } from "./esqlDashboardContract";

/**
 * ES|QL verifies every referenced column against index mappings. Load-generator dashboards
 * must not depend on optional ECS fields (e.g. log.level) or cloud.region alone for bucketing.
 */
describe("Vendor dashboard ES|QL guardrails", () => {
  for (const vendor of VENDOR_DASHBOARD_DIRS) {
    const isAws = vendor.includes("/aws-");

    if (!isAws) {
      it(`${vendor}: queries must not reference log.level (use event.outcome + enricher)`, () => {
        for (const file of dashboardFiles(vendor)) {
          const text = readDashboardFile(vendor, file);
          expect(text, file).not.toMatch(/log\.level/);
        }
      });
    }

    it(`${vendor}: must not use COALESCE(cloud.region — breaks ES|QL when unmapped`, () => {
      for (const file of dashboardFiles(vendor)) {
        const text = readDashboardFile(vendor, file);
        expect(text, file).not.toMatch(/COALESCE\(cloud\.region/);
      }
    });

    it(`${vendor}: must not use COALESCE(cloud.project.id — breaks ES|QL when unmapped`, () => {
      for (const file of dashboardFiles(vendor)) {
        const text = readDashboardFile(vendor, file);
        expect(text, file).not.toMatch(/COALESCE\(`?cloud\.project\.id/);
      }
    });

    it(`${vendor}: must not use COALESCE(cloud.account.id — breaks ES|QL when unmapped`, () => {
      for (const file of dashboardFiles(vendor)) {
        const text = readDashboardFile(vendor, file);
        expect(text, file).not.toMatch(/COALESCE\(`?cloud\.account\.id/);
      }
    });
  }
});
