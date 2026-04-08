import { describe, it, expect } from "vitest";
import { generateLambdaLog, generateApiGatewayLog } from "./serverless.js";

describe("generateLambdaLog", () => {
  it("returns object with required top-level fields", () => {
    const ts = new Date().toISOString();
    const doc: any = generateLambdaLog(ts, 0);
    expect(doc).toHaveProperty("@timestamp", ts);
    expect(doc).toHaveProperty("cloud");
    expect(doc.cloud).toHaveProperty("provider", "aws");
    expect(doc.cloud).toHaveProperty("region");
    expect(doc.cloud).toHaveProperty("account");
    expect(doc).toHaveProperty("aws");
    expect(doc.aws).toHaveProperty("lambda");
    expect(doc.aws.lambda).toHaveProperty("function");
    expect(doc.aws.lambda).toHaveProperty("request_id");
    expect(doc).toHaveProperty("message");
    expect(doc).toHaveProperty("event");
    expect(doc.event).toHaveProperty("dataset", "aws.lambda");
  });

  it("includes metrics when present", () => {
    const doc: any = generateLambdaLog(new Date().toISOString(), 0);
    expect(doc.aws.lambda).toHaveProperty("metrics");
    expect(doc.aws.lambda.metrics).toHaveProperty("Invocations");
    expect(doc.aws.lambda.metrics).toHaveProperty("Duration");
  });
});

describe("generateApiGatewayLog", () => {
  it("returns object with required top-level fields", () => {
    const ts = new Date().toISOString();
    const doc: any = generateApiGatewayLog(ts, 0);
    expect(doc).toHaveProperty("@timestamp", ts);
    expect(doc).toHaveProperty("cloud");
    expect(doc.cloud).toHaveProperty("provider", "aws");
    expect(doc).toHaveProperty("aws");
    expect(doc.aws).toHaveProperty("apigateway");
    expect(doc.aws.apigateway).toHaveProperty("request_id");
    expect(doc.aws.apigateway).toHaveProperty("api_id");
    expect(doc).toHaveProperty("http");
    expect(doc).toHaveProperty("message");
    expect(doc).toHaveProperty("event");
  });
});
