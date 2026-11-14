import { describe, expect, it } from "vitest";
import {
  BULK_CONTENT_TYPE,
  buildCreateBulkNdjson,
  LOADGEN_ECS_VERSION,
  parseElasticMajorVersion,
  prepareDocForDataStreamBulk,
  resolveDocTimestamp,
  rubrikDataStream,
  rubrikPipelineForPath,
  RUBRIK_PIPELINE_IDS,
} from "./esBulkCompat.js";

describe("esBulkCompat (Elastic 9.0+)", () => {
  it("maps Rubrik paths to ingest pipeline ids used by rubrik-elastic-ingest", () => {
    expect(rubrikPipelineForPath("webhook")).toBe(RUBRIK_PIPELINE_IDS.webhook);
    expect(rubrikPipelineForPath("graphql")).toBe(RUBRIK_PIPELINE_IDS.graphql);
    expect(rubrikPipelineForPath("syslog")).toBe(RUBRIK_PIPELINE_IDS.syslog);
    expect(rubrikDataStream("webhook")).toBe("logs-rubrik.webhook-default");
  });

  it("strips __dataset and ensures @timestamp for data-stream create", () => {
    const out = prepareDocForDataStreamBulk(
      {
        __dataset: "rubrik.webhook",
        timestamp: "2025-02-22T12:00:00.000Z",
        summary: "backup failed",
      },
      "2025-01-01T00:00:00.000Z"
    );
    expect(out).not.toHaveProperty("__dataset");
    expect(out["@timestamp"]).toBe("2025-02-22T12:00:00.000Z");
    expect(out.summary).toBe("backup failed");
  });

  it("falls back through GraphQL activity node time then fallbackIso", () => {
    expect(
      resolveDocTimestamp(
        { activityConnection: { nodes: [{ time: "2025-03-01T01:02:03.000Z" }] } },
        "fallback"
      )
    ).toBe("2025-03-01T01:02:03.000Z");
    expect(resolveDocTimestamp({}, "2025-01-01T00:00:00.000Z")).toBe("2025-01-01T00:00:00.000Z");
  });

  it("builds create-only NDJSON with trailing newline", () => {
    const ndjson = buildCreateBulkNdjson("logs-rubrik.webhook-default", [
      { "@timestamp": "2025-02-22T12:00:00.000Z", message: "a" },
    ]);
    const lines = ndjson.trimEnd().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toEqual({
      create: { _index: "logs-rubrik.webhook-default" },
    });
    expect(ndjson.endsWith("\n")).toBe(true);
    expect(BULK_CONTENT_TYPE).toBe("application/x-ndjson");
    expect(LOADGEN_ECS_VERSION).toBe("8.11.0");
  });

  it("parses Elasticsearch major version from GET /", () => {
    expect(parseElasticMajorVersion({ version: { number: "9.0.4" } })).toBe(9);
    expect(parseElasticMajorVersion({ version: { number: "8.19.0" } })).toBe(8);
    expect(parseElasticMajorVersion({})).toBeNull();
  });
});
