import { describe, expect, it } from "vitest";
import {
  analyzeIngestionConflicts,
  clampGlobalIngestionOverride,
  naturalAwsIngestion,
  naturalAzureIngestion,
  naturalGcpIngestion,
} from "./ingestionCompatibility";
import { AZURE_SERVICE_INGESTION_DEFAULTS } from "../azure/data/ingestion";
import { GCP_SERVICE_INGESTION_DEFAULTS } from "../gcp/data/ingestion";

const azureClampCtx = {
  serviceIngestionDefaults: AZURE_SERVICE_INGESTION_DEFAULTS,
  defaultIngestion: "default",
  ingestionUiFallback: "azure-monitor",
} as const;

describe("ingestionCompatibility", () => {
  it("clamps Azure Entra override away from AKS", () => {
    const { source, clampedFrom } = clampGlobalIngestionOverride(
      "azure",
      "aks",
      "aks",
      "entra",
      azureClampCtx
    );
    expect(clampedFrom).toBe("entra");
    expect(source).toBe("azure-monitor");
  });

  it("keeps Entra override for entra-id", () => {
    const { source, clampedFrom } = clampGlobalIngestionOverride(
      "azure",
      "entra-id",
      "entra-id",
      "entra",
      azureClampCtx
    );
    expect(clampedFrom).toBeNull();
    expect(source).toBe("entra");
  });

  it("clamps AWS S3 override away from Lambda", () => {
    const { source, clampedFrom } = clampGlobalIngestionOverride(
      "aws",
      "lambda",
      "lambda",
      "s3",
      null
    );
    expect(clampedFrom).toBe("s3");
    expect(source).toBe("cloudwatch");
  });

  it("keeps S3 override for CloudTrail", () => {
    const { source, clampedFrom } = clampGlobalIngestionOverride(
      "aws",
      "cloudtrail",
      "cloudtrail",
      "s3",
      null
    );
    expect(clampedFrom).toBeNull();
    expect(source).toBe("s3");
  });

  it("clamps GCP pubsub override away from GKE", () => {
    const { source, clampedFrom } = clampGlobalIngestionOverride("gcp", "gke", "gke", "pubsub", {
      serviceIngestionDefaults: GCP_SERVICE_INGESTION_DEFAULTS as Record<string, string>,
      defaultIngestion: "cloud-logging",
    });
    expect(clampedFrom).toBe("pubsub");
    expect(source).toBe("cloud-logging");
  });

  it("analyzeIngestionConflicts lists incompatible Azure services", () => {
    const r = analyzeIngestionConflicts("azure", "entra", ["aks", "entra-id"], azureClampCtx);
    expect(r.hasConflict).toBe(true);
    expect(r.incompatibleServiceIds).toContain("aks");
    expect(r.incompatibleServiceIds).not.toContain("entra-id");
  });

  it("OTel override always valid on Azure AKS", () => {
    const { clampedFrom } = clampGlobalIngestionOverride(
      "azure",
      "aks",
      "aks",
      "otel",
      azureClampCtx
    );
    expect(clampedFrom).toBeNull();
  });

  it("natural helpers", () => {
    expect(naturalAwsIngestion("lambda")).toBe("cloudwatch");
    expect(naturalGcpIngestion("gke")).toBe("cloud-logging");
    expect(naturalGcpIngestion("pubsub")).toBe("pubsub");
    expect(
      naturalAzureIngestion("aks", AZURE_SERVICE_INGESTION_DEFAULTS, "default", "azure-monitor")
    ).toBe("azure-monitor");
  });
});
