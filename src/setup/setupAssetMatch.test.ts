import { describe, it, expect } from "vitest";
import { SERVICE_GROUPS } from "../data/serviceGroups";
import type { PipelineEntry } from "./types";
import {
  inferDashboardServiceGroupLabel,
  inferMlJobServiceGroupLabel,
} from "./dashboardServiceGroup";
import {
  pipelineInferredServiceIds,
  pipelineMatchesSelectedServices,
  squishId,
  dashboardMatchesSelectedServices,
  dashboardTitleServiceFragment,
  mlJobInferredMatchKeys,
  mlJobEntryMatchesSelectedServices,
} from "./setupAssetMatch";

describe("setupAssetMatch", () => {
  it("infers AWS pipeline slugs from id and dataset", () => {
    const p = {
      id: "logs-aws.lambda_logs-default",
      dataset: "aws.lambda_logs",
      group: "compute",
      description: "",
      processors: [],
    } as PipelineEntry;
    expect(pipelineInferredServiceIds(p)).toContain("lambda_logs");
    expect(pipelineInferredServiceIds(p)).toContain("lambda");
  });

  it("matches selected service lambda", () => {
    const p = {
      id: "logs-aws.lambda_logs-default",
      dataset: "aws.lambda_logs",
      group: "compute",
      description: "",
      processors: [],
    } as PipelineEntry;
    expect(pipelineMatchesSelectedServices(p, new Set(["lambda"]))).toBe(true);
  });

  it("squishId normalizes labels", () => {
    expect(squishId("API Gateway")).toBe("apigateway");
  });

  it("matches AWS Lambda dashboard title to lambda", () => {
    const d = { title: "AWS Lambda — Invocations & Performance" };
    expect(dashboardMatchesSelectedServices(d, "aws", new Set(["lambda"]))).toBe(true);
  });

  it("parses Amazon-prefixed AWS dashboard titles for grouping and service match", () => {
    const d = { title: "Amazon Nova — Foundation Model Invocations" };
    expect(dashboardTitleServiceFragment(d, "aws")).toBe("Nova");
    expect(dashboardMatchesSelectedServices(d, "aws", new Set(["nova"]))).toBe(true);
  });

  it("maps AWS CI/CD, Augmented AI, and ARC dashboard titles to catalog groups", () => {
    expect(
      inferDashboardServiceGroupLabel(
        { title: "AWS CI/CD — CodePipeline & CodeBuild" },
        "aws",
        SERVICE_GROUPS
      )
    ).toBe("Developer & CI/CD");
    expect(
      inferDashboardServiceGroupLabel(
        { title: "Amazon Augmented AI — Human Review" },
        "aws",
        SERVICE_GROUPS
      )
    ).toBe("AI & Machine Learning");
    expect(
      inferDashboardServiceGroupLabel(
        { title: "Amazon App Recovery Controller — Zonal Shifts" },
        "aws",
        SERVICE_GROUPS
      )
    ).toBe("Additional Services");
  });

  it("maps AWS ML dataset segments to catalog ids for grouping (vpcflow, rdscustom, s3_intelligent_tiering, pcs)", () => {
    const vpcflow = {
      id: "aws-vpcflow-high-bytes-tx",
      description: "",
      job: {},
      datafeed: { query: { bool: { filter: [{ term: { "event.dataset": "aws.vpcflow" } }] } } },
    };
    expect(inferMlJobServiceGroupLabel(vpcflow, "aws", SERVICE_GROUPS)).toBe("Networking & CDN");
    const rdscustom = {
      id: "aws-rdscustom-patch-failure-spike",
      description: "",
      job: {},
      datafeed: { query: { bool: { filter: [{ term: { "event.dataset": "aws.rdscustom" } }] } } },
    };
    expect(inferMlJobServiceGroupLabel(rdscustom, "aws", SERVICE_GROUPS)).toBe(
      "Storage & Databases"
    );
    const s3it = {
      id: "aws-s3intelligenttier-transition-failure-spike",
      description: "",
      job: {},
      datafeed: {
        query: { bool: { filter: [{ term: { "event.dataset": "aws.s3_intelligent_tiering" } }] } },
      },
    };
    expect(inferMlJobServiceGroupLabel(s3it, "aws", SERVICE_GROUPS)).toBe("Storage & Databases");
    const pcs = {
      id: "aws-hpc-pcs-job-failure-rate",
      description: "HPC PCS",
      job: {},
      datafeed: { query: { bool: { filter: [{ term: { "event.dataset": "aws.pcs" } }] } } },
    };
    expect(inferMlJobServiceGroupLabel(pcs, "aws", SERVICE_GROUPS)).toBe("Compute & Containers");
  });

  it("infers AWS ML job slugs from event.dataset and matches services", () => {
    const j = {
      id: "aws-kendra-query-failure-spike",
      description: "Kendra failures",
      job: {},
      datafeed: {
        query: {
          bool: {
            filter: [{ term: { "event.dataset": "aws.kendra" } }],
          },
        },
      },
    };
    expect(mlJobInferredMatchKeys(j, "aws")).toContain("kendra");
    expect(mlJobEntryMatchesSelectedServices(j, "aws", new Set(["kendra"]))).toBe(true);
  });
});
