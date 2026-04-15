import { describe, expect, it } from "vitest";
import { enrichDocument } from "./enrich";
import { enrichGcpAzureDocument } from "./enrichGcpAzure";
import { GCP_CONFIG } from "../cloud/gcpConfig";

describe("enrich ensures cloud.region for ES|QL dashboards", () => {
  it("enrichGcpAzureDocument sets cloud.region when cloud is absent", () => {
    const out = enrichGcpAzureDocument(
      { gcp: { cloud_functions: { function_name: "fn" } } },
      { serviceId: "cloud-functions", eventType: "logs" },
      GCP_CONFIG.enrichContext.ctx
    );
    expect(typeof out.cloud?.region).toBe("string");
    expect(String(out.cloud.region).length).toBeGreaterThan(0);
  });

  it("enrichDocument sets cloud.region when cloud is absent (AWS)", () => {
    const out = enrichDocument({ message: "x" }, { serviceId: "lambda", eventType: "logs" });
    expect(typeof out.cloud?.region).toBe("string");
    expect(String(out.cloud.region).length).toBeGreaterThan(0);
  });
});
