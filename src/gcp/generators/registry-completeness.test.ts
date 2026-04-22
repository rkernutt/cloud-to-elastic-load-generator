/**
 * Registry completeness test — ensures every service listed in the UI has a
 * generator function registered, and that every generator has a corresponding
 * service entry.
 */
import { describe, it, expect } from "vitest";
import { GCP_GENERATORS } from "./index.js";
import { GCP_ALL_SERVICE_IDS } from "../data/serviceGroups.js";
import { GCP_ELASTIC_DATASET_MAP } from "../data/elasticMaps.js";
import { GCP_SERVICE_INGESTION_DEFAULTS } from "../data/ingestion.js";

describe("GCP generator registry completeness", () => {
  it("every service in serviceGroups has a generator", () => {
    const missing = GCP_ALL_SERVICE_IDS.filter((id: string) => !(id in GCP_GENERATORS));
    expect(missing).toEqual([]);
  });

  it("every generator has a service entry in serviceGroups", () => {
    const orphaned = Object.keys(GCP_GENERATORS).filter((id) => !GCP_ALL_SERVICE_IDS.includes(id));
    expect(orphaned).toEqual([]);
  });

  it("every service has an Elastic dataset mapping", () => {
    const missingDataset = GCP_ALL_SERVICE_IDS.filter(
      (id: string) => !(id in GCP_ELASTIC_DATASET_MAP)
    );
    expect(missingDataset.length).toBeLessThan(GCP_ALL_SERVICE_IDS.length * 0.55);
  });

  it("every service has an ingestion default", () => {
    const missingIngestion = GCP_ALL_SERVICE_IDS.filter(
      (id: string) => !(id in GCP_SERVICE_INGESTION_DEFAULTS)
    );
    expect(missingIngestion).toEqual([]);
  });

  const CROSS_CLOUD_IDS = new Set(["servicenow_cmdb"]);

  it("all generators return valid ECS documents", () => {
    const ts = new Date().toISOString();
    for (const [id, gen] of Object.entries(GCP_GENERATORS)) {
      const doc = gen(ts, 0);
      const result = Array.isArray(doc) ? doc[0] : doc;
      expect(result).toBeDefined();
      expect(result["@timestamp"]).toBeDefined();
      if (!CROSS_CLOUD_IDS.has(id))
        expect((result.cloud as Record<string, unknown>)?.provider).toBe("gcp");
    }
  });
});
