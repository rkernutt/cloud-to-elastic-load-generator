import { describe, it, expect } from "vitest";
import type { PipelineEntry } from "./types";
import {
  pipelineInferredServiceIds,
  pipelineMatchesSelectedServices,
  squishId,
  dashboardMatchesSelectedServices,
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
});
