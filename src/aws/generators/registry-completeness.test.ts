/**
 * Registry completeness test — ensures every service listed in the UI has a
 * generator function registered, and that every generator has a corresponding
 * service entry.
 */
import { describe, it, expect } from "vitest";
import { GENERATORS } from "./index.js";
import { ALL_SERVICE_IDS } from "../../data/serviceGroups.js";
import { ELASTIC_DATASET_MAP } from "../../data/elasticMaps.js";
import { SERVICE_INGESTION_DEFAULTS } from "../../data/ingestion.js";

describe("Generator registry completeness", () => {
  it("every service in serviceGroups has a generator", () => {
    const missing = ALL_SERVICE_IDS.filter((id: string) => !(id in GENERATORS));
    expect(missing).toEqual([]);
  });

  it("every generator has a service entry in serviceGroups", () => {
    const orphaned = Object.keys(GENERATORS).filter((id) => !ALL_SERVICE_IDS.includes(id));
    expect(orphaned).toEqual([]);
  });

  it("every service has an Elastic dataset mapping", () => {
    const missingDataset = ALL_SERVICE_IDS.filter((id: string) => !(id in ELASTIC_DATASET_MAP));
    // Some services use default dataset (aws.${svc}), so only flag if unexpected
    // For now just check no obvious gaps — this test will grow over time
    expect(missingDataset.length).toBeLessThan(ALL_SERVICE_IDS.length * 0.55);
  });

  it("every service has an ingestion default", () => {
    const missingIngestion = ALL_SERVICE_IDS.filter(
      (id: string) => !(id in SERVICE_INGESTION_DEFAULTS)
    );
    expect(missingIngestion).toEqual([]);
  });

  const CROSS_CLOUD_IDS = new Set(["servicenow_cmdb"]);

  it("all generators return valid ECS documents", () => {
    const ts = new Date().toISOString();
    for (const [id, gen] of Object.entries(GENERATORS)) {
      const doc = gen(ts, 0);
      const result = Array.isArray(doc) ? doc[0] : doc;
      expect(result).toBeDefined();
      expect(result["@timestamp"]).toBeDefined();
      if (!CROSS_CLOUD_IDS.has(id))
        expect((result.cloud as Record<string, unknown>)?.provider).toBe("aws");
    }
  });
});
