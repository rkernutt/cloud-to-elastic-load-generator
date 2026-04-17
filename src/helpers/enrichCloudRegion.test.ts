import { describe, expect, it } from "vitest";
import { enrichDocument } from "./enrich";
import { enrichGcpAzureDocument } from "./enrichGcpAzure";
import { GCP_CONFIG } from "../cloud/gcpConfig";

const gcpCtx =
  GCP_CONFIG.enrichContext.kind === "gcp-azure" ? GCP_CONFIG.enrichContext.ctx : undefined;

describe("GCP/Azure metrics data_stream.dataset", () => {
  it("pins data_stream.dataset to the ship target service, not a merged metric variant", () => {
    const doc = {
      "@timestamp": "2026-01-01T00:00:00.000Z",
      gcp: {
        "config-connector": {
          metrics: { request_count: { sum: 1 } },
          labels: {},
        },
      },
      data_stream: {
        type: "metrics",
        dataset: "gcp.configconnector",
        namespace: "default",
      },
      event: { module: "gcp", dataset: "gcp.configconnector" },
    };
    const out = enrichGcpAzureDocument(doc, { serviceId: "gke", eventType: "metrics" }, gcpCtx!);
    expect(out.data_stream?.dataset).toBe("gcp.gke_metrics");
    expect(out.event?.dataset).toBe("gcp.gke_metrics");
  });
});

describe("enrich ensures cloud.region for ES|QL dashboards", () => {
  it("enrichGcpAzureDocument sets cloud.region when cloud is absent", () => {
    const out = enrichGcpAzureDocument(
      { gcp: { cloud_functions: { function_name: "fn" } } },
      { serviceId: "cloud-functions", eventType: "logs" },
      gcpCtx!
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
