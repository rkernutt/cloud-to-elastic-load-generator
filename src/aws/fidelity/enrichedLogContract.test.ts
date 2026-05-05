/**
 * Contract tests for AWS logs: raw generator output + `enrichDocument` (CloudWatch-style path).
 * Expand assertions as Phase 1 native-fidelity work tightens (log group patterns, ARNs, etc.).
 */
import { describe, it, expect } from "vitest";
import { GENERATORS } from "../generators/index.js";
import { enrichDocument } from "../../helpers/enrich.js";

function rawDocs(gen: (t: string, e: number) => unknown, ts: string): Record<string, unknown>[] {
  const raw = gen(ts, 0) as unknown;
  const arr = Array.isArray(raw) ? raw : [raw];
  return (arr as Record<string, unknown>[]).filter(
    (d) => (d as { __dataset?: string }).__dataset !== "apm"
  );
}

describe("AWS log native / integration contract (generator + enrich)", () => {
  const ts = "2026-01-15T12:00:00.000Z";

  it("every generator returns a string message on raw output (each doc)", () => {
    for (const [id, gen] of Object.entries(GENERATORS)) {
      for (const doc of rawDocs(gen, ts)) {
        expect(
          typeof doc.message === "string" && (doc.message as string).length > 0,
          `${id} message`
        ).toBe(true);
      }
    }
  });

  const CROSS_CLOUD_IDS = new Set([
    "servicenow_cmdb",
    "cspm",
    "kspm",
  ]);

  it("after CloudWatch enrichment: cloud.provider, aws.cloudwatch, data_stream, event.module", () => {
    for (const [id, gen] of Object.entries(GENERATORS)) {
      if (CROSS_CLOUD_IDS.has(id)) continue;
      for (const raw of rawDocs(gen, ts)) {
        const out = enrichDocument(raw, {
          serviceId: id,
          eventType: "logs",
          ingestionSource: "cloudwatch",
        });

        expect(out.cloud?.provider, id).toBe("aws");
        expect(typeof out.aws?.cloudwatch?.log_group === "string", id).toBe(true);
        expect(typeof out.aws?.cloudwatch?.log_stream === "string", id).toBe(true);
        expect(out.data_stream?.type, id).toBe("logs");
        expect(typeof out.data_stream?.dataset === "string", id).toBe(true);
        expect(out.event?.module, id).toBe("aws");
        expect(typeof out.event?.dataset === "string", id).toBe(true);
      }
    }
  });
});
