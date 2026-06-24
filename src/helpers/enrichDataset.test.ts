import { describe, expect, it } from "vitest";
import { enrichDocument } from "./enrich";

type LooseDoc = Record<string, unknown>;

function logDataset(serviceId: string, doc: LooseDoc, source?: string) {
  const out = enrichDocument({ ...doc }, { serviceId, eventType: "logs", ingestionSource: source });
  return {
    event: (out.event as LooseDoc)?.dataset as string | undefined,
    stream: (out.data_stream as LooseDoc)?.dataset as string | undefined,
    routed: out.__dataset as string | undefined,
  };
}

describe("AWS log dataset resolution (audit fixes)", () => {
  it("pins dedicated services to their real Elastic dataset, fixing generator mismatches", () => {
    expect(logDataset("ec2", { event: { dataset: "aws.ec2" } }).event).toBe("aws.ec2_logs");
    expect(logDataset("s3", { event: { dataset: "aws.s3" } }).event).toBe("aws.s3access");
    expect(logDataset("inspector", { event: { dataset: "aws.inspector2" } }).event).toBe(
      "aws.inspector"
    );
    expect(logDataset("route53", { event: { dataset: "aws.route53" } }).event).toBe(
      "aws.route53_public_logs"
    );
  });

  it("keeps project-specific datasets on the CloudWatch default path", () => {
    expect(logDataset("glue", { event: { dataset: "aws.glue" } }).event).toBe("aws.glue");
    expect(logDataset("ecs", { event: { dataset: "aws.ecs" } }).event).toBe("aws.ecs");
  });

  it("switches bespoke datasets to the generic stream when S3/Firehose ingestion is selected", () => {
    expect(logDataset("glue", { event: { dataset: "aws.glue" } }, "s3").event).toBe(
      "aws_logs.generic"
    );
    expect(logDataset("glue", { event: { dataset: "aws.glue" } }, "firehose").event).toBe(
      "awsfirehose"
    );
  });

  it("keeps event.dataset, data_stream.dataset and __dataset routing consistent", () => {
    const def = logDataset("data-pipeline", { __dataset: "aws.glue" });
    expect(def).toEqual({ event: "aws.glue", stream: "aws.glue", routed: "aws.glue" });

    const viaS3 = logDataset("data-pipeline", { __dataset: "aws.glue" }, "s3");
    expect(viaS3).toEqual({
      event: "aws_logs.generic",
      stream: "aws_logs.generic",
      routed: "aws_logs.generic",
    });
  });

  it("preserves bespoke datasets for services whose native ingestion is S3 (no override)", () => {
    // wafv2/elb/storagelens default to S3 and ship custom pipelines on their
    // bespoke dataset — they must NOT switch to the generic stream by default.
    expect(logDataset("wafv2", { event: { dataset: "aws.wafv2" } }).event).toBe("aws.wafv2");
    expect(logDataset("elb", { event: { dataset: "aws.elb" } }).event).toBe("aws.elb");
    expect(logDataset("storagelens", { event: { dataset: "aws.s3storagelens" } }).event).toBe(
      "aws.s3storagelens"
    );
  });

  it("keeps dedicated services on their real dataset even under an explicit S3 override", () => {
    expect(logDataset("ec2", { event: { dataset: "aws.ec2" } }, "s3").event).toBe("aws.ec2_logs");
    expect(logDataset("cloudtrail", { event: { dataset: "aws.cloudtrail" } }, "s3").event).toBe(
      "aws.cloudtrail"
    );
  });

  it("preserves real datasets used by security chains (Attack Discovery)", () => {
    const ct = logDataset("iam-privesc-chain", { __dataset: "aws.cloudtrail" });
    expect(ct).toEqual({
      event: "aws.cloudtrail",
      stream: "aws.cloudtrail",
      routed: "aws.cloudtrail",
    });
  });
});
