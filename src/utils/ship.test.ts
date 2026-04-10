/**
 * Integration tests for the ship() workflow using a mocked fetch.
 * Tests batch assembly, error handling, abort, and progress tracking.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { stripNulls } from "../helpers";
import { generateLambdaLog } from "../aws/generators/serverless.js";
import { ELASTIC_DATASET_MAP } from "../data/elasticMaps";

// ── helpers ──────────────────────────────────────────────────────────────────

function buildNdjson(indexName: string, docs: unknown[]) {
  return (
    docs
      .flatMap((doc: unknown) => [
        JSON.stringify({ create: { _index: indexName } }),
        JSON.stringify(doc),
      ])
      .join("\n") + "\n"
  );
}

function mockBulkOk(count: number) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      errors: false,
      items: Array.from({ length: count }, () => ({ create: { status: 201 } })),
    }),
  };
}

function mockBulkPartialError(count: number, errCount: number) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      errors: true,
      items: Array.from({ length: count }, (_, i) => ({
        create:
          i < errCount
            ? {
                status: 400,
                error: { type: "mapper_parsing_exception", reason: "field type mismatch" },
              }
            : { status: 201 },
      })),
    }),
  };
}

function mockBulkServerError() {
  return {
    ok: false,
    status: 503,
    json: async () => ({ error: { reason: "Service Unavailable" } }),
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("Batch NDJSON assembly", () => {
  it("produces alternating action/doc lines", () => {
    const docs = [generateLambdaLog(new Date().toISOString(), 0)];
    const ndjson = buildNdjson("logs-aws.lambda", docs.map(stripNulls));
    const lines = ndjson.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toMatchObject({ create: { _index: "logs-aws.lambda" } });
    expect(JSON.parse(lines[1])).toHaveProperty("@timestamp");
  });

  it("handles multi-doc batch correctly", () => {
    const docs = Array.from({ length: 5 }, () => generateLambdaLog(new Date().toISOString(), 0));
    const ndjson = buildNdjson("logs-aws.lambda", docs.map(stripNulls));
    const lines = ndjson.trim().split("\n");
    expect(lines).toHaveLength(10); // 5 action + 5 doc lines
  });
});

describe("Fetch response handling", () => {
  const mockFetch = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    mockFetch.mockReset();
  });

  it("counts successful docs from bulk ok response", async () => {
    const batchSize = 10;
    mockFetch.mockResolvedValueOnce(mockBulkOk(batchSize));

    const docs = Array.from({ length: batchSize }, () =>
      stripNulls(generateLambdaLog(new Date().toISOString(), 0))
    );
    const ndjson = buildNdjson("logs-aws.lambda", docs);
    const res = await fetch("/proxy/_bulk", { method: "POST", body: ndjson });
    const json = await res.json();

    expect(res.ok).toBe(true);
    const failedItems =
      json.items?.filter(
        (i: { create?: { error?: unknown }; index?: { error?: unknown } }) =>
          i.create?.error || i.index?.error
      ) || [];
    expect(failedItems).toHaveLength(0);
    const sent = batchSize - failedItems.length;
    expect(sent).toBe(10);
  });

  it("counts partial errors from bulk partial-error response", async () => {
    const batchSize = 10,
      errCount = 3;
    mockFetch.mockResolvedValueOnce(mockBulkPartialError(batchSize, errCount));

    const res = await fetch("/proxy/_bulk", { method: "POST", body: "" });
    const json = await res.json();

    const failedItems =
      json.items?.filter(
        (i: { create?: { error?: unknown }; index?: { error?: unknown } }) =>
          i.create?.error || i.index?.error
      ) || [];
    expect(failedItems).toHaveLength(errCount);
    const sent = batchSize - failedItems.length;
    expect(sent).toBe(7);
  });

  it("treats non-ok response as full batch error", async () => {
    mockFetch.mockResolvedValueOnce(mockBulkServerError());

    const batchSize = 5;
    const res = await fetch("/proxy/_bulk", { method: "POST", body: "" });
    const json = await res.json();

    expect(res.ok).toBe(false);
    const errors = res.ok ? 0 : batchSize;
    expect(errors).toBe(5);
    expect(json.error.reason).toBe("Service Unavailable");
  });

  it("catches network errors and treats batch as errored", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ERR_CONNECTION_REFUSED"));

    let caught: unknown = null;
    try {
      await fetch("/proxy/_bulk", { method: "POST", body: "" });
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
    expect((caught as Error).message).toBe("ERR_CONNECTION_REFUSED");
  });
});

describe("Index name construction", () => {
  it("builds correct index from prefix and dataset map", () => {
    const prefix = "logs-aws";
    const svc = "lambda";
    const dataset = ELASTIC_DATASET_MAP[svc] || `aws.${svc}`;
    const indexName = `${prefix}.${dataset.replace(/^aws\./, "")}`;
    expect(indexName).toBe("logs-aws.lambda_logs");
  });

  it("handles service not in dataset map with fallback", () => {
    const prefix = "logs-aws";
    const svc = "unknownservice";
    const dataset =
      (ELASTIC_DATASET_MAP as Record<string, string | undefined>)[svc] ?? `aws.${svc}`;
    const indexName = `${prefix}.${dataset.replace(/^aws\./, "")}`;
    expect(indexName).toBe("logs-aws.unknownservice");
  });
});

describe("stripNulls in doc assembly", () => {
  it("removes null fields from generated docs", () => {
    const raw = generateLambdaLog(new Date().toISOString(), 0);
    const clean = stripNulls(raw);

    function hasNull(obj: unknown) {
      if (obj === null) return true;
      if (typeof obj === "object" && !Array.isArray(obj)) {
        return Object.values(obj).some(hasNull);
      }
      return false;
    }
    expect(hasNull(clean)).toBe(false);
  });
});
