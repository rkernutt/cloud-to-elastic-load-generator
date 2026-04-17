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

  it("uses official AWS product names for service pack labels", () => {
    expect(polishSetupCategoryLabel("lambda")).toBe("AWS Lambda");
    expect(polishSetupCategoryLabel("transitgateway")).toBe("AWS Transit Gateway");
    expect(polishSetupCategoryLabel("dynamodb")).toBe("Amazon DynamoDB");
    expect(polishSetupCategoryLabel("stepfunctions")).toBe("AWS Step Functions");
    expect(polishSetupCategoryLabel("sagemaker")).toBe("Amazon SageMaker");
    expect(polishSetupCategoryLabel("bedrock")).toBe("Amazon Bedrock");
    expect(polishSetupCategoryLabel("cloudfront")).toBe("Amazon CloudFront");
    expect(polishSetupCategoryLabel("guardduty")).toBe("Amazon GuardDuty");
    expect(polishSetupCategoryLabel("elasticbeanstalk")).toBe("AWS Elastic Beanstalk");
    expect(polishSetupCategoryLabel("storagelens")).toBe("Amazon S3 Storage Lens");
    expect(polishSetupCategoryLabel("xray")).toBe("AWS X-Ray");
    expect(polishSetupCategoryLabel("iotcore")).toBe("AWS IoT Core");
    expect(polishSetupCategoryLabel("freertos")).toBe("FreeRTOS");
    expect(polishSetupCategoryLabel("securityhub")).toBe("AWS Security Hub");
    expect(polishSetupCategoryLabel("msk")).toBe("Amazon MSK");
    expect(polishSetupCategoryLabel("eks")).toBe("Amazon EKS");
    expect(polishSetupCategoryLabel("cloudwatch")).toBe("Amazon CloudWatch");
  });

  it("uses cloud-prefixed overrides for shared service IDs", () => {
    expect(polishSetupCategoryLabel("batch", "aws")).toBe("AWS Batch");
    expect(polishSetupCategoryLabel("batch", "azure")).toBe("Azure Batch");
    expect(polishSetupCategoryLabel("batch", "gcp")).toBe("Google Cloud Batch");
    expect(polishSetupCategoryLabel("backup", "aws")).toBe("AWS Backup");
    expect(polishSetupCategoryLabel("backup", "azure")).toBe("Azure Backup");
  });

  it("uses official Azure product names for service pack labels", () => {
    expect(polishSetupCategoryLabel("virtual-machines", "azure")).toBe("Azure Virtual Machines");
    expect(polishSetupCategoryLabel("aks", "azure")).toBe("Azure Kubernetes Service (AKS)");
    expect(polishSetupCategoryLabel("cosmos-db", "azure")).toBe("Azure Cosmos DB");
    expect(polishSetupCategoryLabel("openai", "azure")).toBe("Azure OpenAI Service");
    expect(polishSetupCategoryLabel("key-vault", "azure")).toBe("Azure Key Vault");
    expect(polishSetupCategoryLabel("app-service", "azure")).toBe("Azure App Service");
    expect(polishSetupCategoryLabel("sql-database", "azure")).toBe("Azure SQL Database");
  });

  it("uses official GCP product names for service pack labels", () => {
    expect(polishSetupCategoryLabel("cloud-functions", "gcp")).toBe("Cloud Functions");
    expect(polishSetupCategoryLabel("gke", "gcp")).toBe("Google Kubernetes Engine (GKE)");
    expect(polishSetupCategoryLabel("bigquery", "gcp")).toBe("BigQuery");
    expect(polishSetupCategoryLabel("vertex-ai", "gcp")).toBe("Vertex AI");
    expect(polishSetupCategoryLabel("cloud-sql", "gcp")).toBe("Cloud SQL");
    expect(polishSetupCategoryLabel("pubsub", "gcp")).toBe("Pub/Sub");
    expect(polishSetupCategoryLabel("cloud-storage", "gcp")).toBe("Cloud Storage");
  });
});
