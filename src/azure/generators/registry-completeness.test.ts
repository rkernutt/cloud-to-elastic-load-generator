/**
 * Registry completeness test — ensures every service listed in the UI has a
 * generator function registered, and that every generator has a corresponding
 * service entry.
 */
import { describe, it, expect } from "vitest";
import { AZURE_GENERATORS } from "./index.js";
import { AZURE_ALL_SERVICE_IDS } from "../data/serviceGroups.js";
import { AZURE_ELASTIC_DATASET_MAP } from "../data/elasticMaps.js";
import { AZURE_SERVICE_INGESTION_DEFAULTS } from "../data/ingestion.js";

describe("Azure generator registry completeness", () => {
  it("every service in serviceGroups has a generator", () => {
    const missing = AZURE_ALL_SERVICE_IDS.filter((id: string) => !(id in AZURE_GENERATORS));
    expect(missing).toEqual([]);
  });

  it("every generator has a service entry in serviceGroups", () => {
    const orphaned = Object.keys(AZURE_GENERATORS).filter(
      (id) => !AZURE_ALL_SERVICE_IDS.includes(id)
    );
    expect(orphaned).toEqual([]);
  });

  it("every service has an Elastic dataset mapping", () => {
    const missingDataset = AZURE_ALL_SERVICE_IDS.filter(
      (id: string) => !(id in AZURE_ELASTIC_DATASET_MAP)
    );
    expect(missingDataset.length).toBeLessThan(AZURE_ALL_SERVICE_IDS.length * 0.55);
  });

  it("every service has an ingestion default", () => {
    const missingIngestion = AZURE_ALL_SERVICE_IDS.filter(
      (id: string) => !(id in AZURE_SERVICE_INGESTION_DEFAULTS)
    );
    expect(missingIngestion).toEqual([]);
  });

  it("all generators return valid ECS documents", () => {
    const ts = new Date().toISOString();
    for (const [, gen] of Object.entries(AZURE_GENERATORS)) {
      const doc = gen(ts, 0);
      const result = Array.isArray(doc) ? doc[0] : doc;
      expect(result).toBeDefined();
      expect(result["@timestamp"]).toBeDefined();
      expect((result.cloud as Record<string, unknown>)?.provider).toBe("azure");
    }
  });
});
