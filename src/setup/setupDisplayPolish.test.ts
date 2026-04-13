import { describe, it, expect } from "vitest";
import {
  polishAwsDashboardGroupHeading,
  polishDashboardFragmentForGrouping,
  polishDashboardGroupKeyFirstWord,
  polishSetupCategoryLabel,
  polishSetupDashboardTitle,
} from "./setupDisplayPolish";

describe("setupDisplayPolish", () => {
  it("polishes AWS dashboard titles (acronyms and product names)", () => {
    expect(polishSetupDashboardTitle("AWS Evs — overview", "aws")).toBe("AWS EVS — overview");
    expect(polishSetupDashboardTitle("AWS VPC IPAM — overview", "aws")).toBe(
      "AWS VPC IPAM — overview"
    );
    expect(polishSetupDashboardTitle("AWS Lambda — Invocations", "aws")).toBe(
      "AWS Lambda — Invocations"
    );
  });

  it("polishes GCP dashboard titles (acronyms in fragment)", () => {
    expect(polishSetupDashboardTitle("GCP Compute Engine — Events", "gcp")).toBe(
      "GCP Compute Engine — Events"
    );
    expect(polishSetupDashboardTitle("GCP Vertex Ai Pipelines — overview", "gcp")).toBe(
      "GCP Vertex AI Pipelines — overview"
    );
    expect(polishSetupDashboardTitle("GCP Gke Autopilot — overview", "gcp")).toBe(
      "GCP GKE Autopilot — overview"
    );
  });

  it("polishes Azure dashboard titles", () => {
    expect(polishSetupDashboardTitle("Azure Cosmos Db — overview", "azure")).toBe(
      "Azure Cosmos DB — overview"
    );
    expect(polishSetupDashboardTitle("Azure Iot Hub — overview", "azure")).toBe(
      "Azure IoT Hub — overview"
    );
    expect(polishSetupDashboardTitle("Azure Acr — overview", "azure")).toBe("Azure ACR — overview");
    expect(polishSetupDashboardTitle("Azure Hdinsight — overview", "azure")).toBe(
      "Azure HDInsight — overview"
    );
    expect(polishDashboardGroupKeyFirstWord("Acr", "azure")).toBe("ACR");
    expect(polishDashboardGroupKeyFirstWord("Hdinsight", "azure")).toBe("HDInsight");
    expect(polishSetupDashboardTitle("Azure Sap On Azure — overview", "azure")).toBe(
      "Azure SAP On Azure — overview"
    );
    expect(polishSetupDashboardTitle("Azure Signalr — overview", "azure")).toBe(
      "Azure SignalR — overview"
    );
    expect(polishSetupDashboardTitle("Azure Waf Policy — overview", "azure")).toBe(
      "Azure WAF Policy — overview"
    );
    expect(polishSetupDashboardTitle("Azure Hpc Cache — overview", "azure")).toBe(
      "Azure HPC Cache — overview"
    );
    expect(polishSetupDashboardTitle("Azure Ddos Protection — overview", "azure")).toBe(
      "Azure DDoS Protection — overview"
    );
  });

  it("normalizes dashboard group keys per cloud (Gke vs GKE)", () => {
    expect(polishDashboardGroupKeyFirstWord("Gke", "gcp")).toBe("GKE");
    expect(polishDashboardGroupKeyFirstWord("GKE", "gcp")).toBe("GKE");
    expect(polishAwsDashboardGroupHeading("Evs")).toBe("EVS");
    expect(polishAwsDashboardGroupHeading("Msk")).toBe("MSK");
  });

  it("uses full AWS fragments for dashboard grouping (unambiguous headings)", () => {
    expect(polishDashboardFragmentForGrouping("Cloud Map", "aws")).toBe("Cloud Map");
    expect(polishDashboardFragmentForGrouping("Clean Rooms", "aws")).toBe("Clean Rooms");
    expect(polishDashboardFragmentForGrouping("Augmented AI", "aws")).toBe("Augmented AI");
    expect(polishDashboardFragmentForGrouping("Audit Manager", "aws")).toBe("Audit Manager");
    expect(polishDashboardFragmentForGrouping("App Mesh", "aws")).toBe("App Mesh");
    expect(polishDashboardFragmentForGrouping("End User Messaging", "aws")).toBe(
      "End User Messaging"
    );
  });

  it("polishes pipeline / ML category ids", () => {
    expect(polishSetupCategoryLabel("compute")).toBe("Compute");
    expect(polishSetupCategoryLabel("data-ai")).toBe("Data AI");
    expect(polishSetupCategoryLabel("aiml")).toBe("AIML");
    expect(polishSetupCategoryLabel("compute-extended")).toBe("Compute Extended");
    expect(polishSetupCategoryLabel("aws-ml-data-ml-operations")).toBe("AWS ML Data ML Operations");
    expect(polishSetupCategoryLabel("datawarehouse")).toBe("Data Warehouse");
  });
});
