import { describe, it, expect } from "vitest";
import { AZURE_GENERATORS } from "./index.js";

const TS = "2024-06-01T12:00:00.000Z";

type Doc = Record<string, unknown>;

const CHAIN_IDS = [
  "azure-security-chain",
  "azure-iam-privesc-chain",
  "azure-data-exfil-chain",
  "azure-data-pipeline-chain",
];

describe("Azure chain generators — structural invariants", () => {
  for (const chainId of CHAIN_IDS) {
    describe(chainId, () => {
      it("returns an array of 2+ correlated documents", () => {
        const gen = AZURE_GENERATORS[chainId]!;
        expect(gen, `${chainId} not in registry`).toBeDefined();
        const docs = gen(TS, 0.05) as Doc[];
        expect(Array.isArray(docs)).toBe(true);
        expect(docs.length).toBeGreaterThanOrEqual(2);
      });

      it("every doc has @timestamp", () => {
        const gen = AZURE_GENERATORS[chainId]!;
        const docs = gen(TS, 0.05) as Doc[];
        for (const doc of docs) {
          expect(typeof doc["@timestamp"]).toBe("string");
        }
      });

      it("produces docs with __dataset routing field", () => {
        const gen = AZURE_GENERATORS[chainId]!;
        const docs = gen(TS, 0.05) as Doc[];
        const withDataset = docs.filter((d) => d.__dataset);
        expect(withDataset.length).toBeGreaterThan(0);
      });
    });
  }
});

describe("Azure data pipeline chain — correlation", () => {
  it("includes APM trace documents", () => {
    const gen = AZURE_GENERATORS["azure-data-pipeline-chain"]!;
    const docs = gen(TS, 0) as Doc[];
    const traceDocs = docs.filter(
      (d) => (d.data_stream as Record<string, unknown>)?.type === "traces"
    );
    expect(traceDocs.length).toBeGreaterThanOrEqual(2);
  });

  it("trace docs share a single trace.id", () => {
    const gen = AZURE_GENERATORS["azure-data-pipeline-chain"]!;
    const docs = gen(TS, 0) as Doc[];
    const traceDocs = docs.filter(
      (d) => (d.data_stream as Record<string, unknown>)?.type === "traces"
    );
    const traceIds = new Set(
      traceDocs.map((d) => (d.trace as Record<string, unknown>)?.id).filter(Boolean)
    );
    expect(traceIds.size).toBe(1);
  });

  it("error mode produces at least one failure or error doc", () => {
    const gen = AZURE_GENERATORS["azure-data-pipeline-chain"]!;
    let found = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      const docs = gen(TS, 1.0) as Doc[];
      const hasFailure = docs.some((d) => {
        const ev = d.event as Record<string, unknown> | undefined;
        const err = d.error as Record<string, unknown> | undefined;
        return ev?.outcome === "failure" || err?.type;
      });
      if (hasFailure) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});
