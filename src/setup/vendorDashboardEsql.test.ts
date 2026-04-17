import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * ES|QL verifies every referenced column against index mappings. Load-generator dashboards
 * must not depend on optional ECS fields (e.g. log.level) or cloud.region alone for bucketing.
 */
function dashboardFiles(dir: string): string[] {
  const root = path.join(process.cwd(), dir);
  return fs.readdirSync(root).filter((f) => f.endsWith("-dashboard.json"));
}

describe("Azure/GCP dashboard ES|QL guardrails", () => {
  for (const vendor of ["installer/azure-custom-dashboards", "installer/gcp-custom-dashboards"]) {
    it(`${vendor}: queries must not reference log.level (use event.outcome + enricher)`, () => {
      for (const file of dashboardFiles(vendor)) {
        const text = fs.readFileSync(path.join(process.cwd(), vendor, file), "utf8");
        expect(text, file).not.toMatch(/log\.level/);
      }
    });

    it(`${vendor}: must not use COALESCE(cloud.region — breaks ES|QL when unmapped`, () => {
      for (const file of dashboardFiles(vendor)) {
        const text = fs.readFileSync(path.join(process.cwd(), vendor, file), "utf8");
        expect(text, file).not.toMatch(/COALESCE\(cloud\.region/);
      }
    });
  }
});
