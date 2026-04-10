import { describe, it, expect } from "vitest";
import { validateElasticUrl, validateApiKey, validateIndexPrefix } from "./validation";

describe("validateElasticUrl", () => {
  it("rejects empty", () => {
    expect(validateElasticUrl("").valid).toBe(false);
    expect(validateElasticUrl("   ").valid).toBe(false);
  });

  it("accepts valid HTTPS URL", () => {
    expect(validateElasticUrl("https://my-deployment.es.us-east-1.aws.elastic.cloud").valid).toBe(
      true
    );
    expect(validateElasticUrl("https://my-deployment.es.us-east-1.aws.elastic.cloud/").valid).toBe(
      true
    );
  });

  it("rejects HTTP for non-local hosts", () => {
    const r = validateElasticUrl("http://example.com");
    expect(r.valid).toBe(false);
    expect(r.message).toMatch(/HTTP is only allowed|local development/i);
  });

  it("allows HTTP for localhost", () => {
    expect(validateElasticUrl("http://localhost:9200").valid).toBe(true);
    expect(validateElasticUrl("http://127.0.0.1:9200").valid).toBe(true);
  });

  it("allows HTTPS for localhost without a multi-part domain", () => {
    expect(validateElasticUrl("https://localhost:9200").valid).toBe(true);
  });

  it("rejects hostname without domain (non-local)", () => {
    expect(validateElasticUrl("https://not-a-host").valid).toBe(false);
  });
});

describe("validateApiKey", () => {
  it("rejects empty", () => {
    expect(validateApiKey("").valid).toBe(false);
    expect(validateApiKey("   ").valid).toBe(false);
  });

  it("rejects too short", () => {
    expect(validateApiKey("short").valid).toBe(false);
    expect(validateApiKey("a".repeat(19)).valid).toBe(false);
  });

  it("accepts long base64-like string", () => {
    expect(validateApiKey("a".repeat(32)).valid).toBe(true);
    expect(validateApiKey("VnVhQ2pDTmpNNjpOdkRTR0R4R2F1bXBRYzRZ").valid).toBe(true);
  });

  it("rejects invalid characters", () => {
    expect(validateApiKey("a@b#c" + "x".repeat(20)).valid).toBe(false);
  });
});

describe("validateIndexPrefix", () => {
  it("rejects empty", () => {
    expect(validateIndexPrefix("").valid).toBe(false);
  });

  it("accepts valid prefix", () => {
    expect(validateIndexPrefix("logs-aws").valid).toBe(true);
    expect(validateIndexPrefix("metrics-aws").valid).toBe(true);
    expect(validateIndexPrefix("my_index").valid).toBe(true);
  });

  it("rejects prefix starting with hyphen", () => {
    expect(validateIndexPrefix("-logs").valid).toBe(false);
  });

  it("rejects prefix with invalid chars", () => {
    expect(validateIndexPrefix("logs.aws").valid).toBe(false);
    expect(validateIndexPrefix("logs aws").valid).toBe(false);
  });
});
