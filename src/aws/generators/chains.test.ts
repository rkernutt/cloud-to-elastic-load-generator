import { describe, it, expect } from "vitest";
import { generateDataPipelineChain } from "./dataPipelineChain.js";
import { GENERATORS } from "./index.js";

const TS = "2024-06-01T12:00:00.000Z";

type Doc = Record<string, unknown>;

const CHAIN_IDS = [
  "security-chain",
  "iam-privesc-chain",
  "data-exfil-chain",
  "data-pipeline-chain",
];

describe("AWS chain generators — structural invariants", () => {
  for (const chainId of CHAIN_IDS) {
    describe(chainId, () => {
      it("returns an array of 2+ correlated documents", () => {
        const gen = GENERATORS[chainId as keyof typeof GENERATORS]!;
        const docs = gen(TS, 0.05) as Doc[];
        expect(Array.isArray(docs)).toBe(true);
        expect(docs.length).toBeGreaterThanOrEqual(2);
      });

      it("every doc has @timestamp", () => {
        const gen = GENERATORS[chainId as keyof typeof GENERATORS]!;
        const docs = gen(TS, 0.05) as Doc[];
        for (const doc of docs) {
          expect(typeof doc["@timestamp"]).toBe("string");
        }
      });

      it("produces docs with __dataset routing field", () => {
        const gen = GENERATORS[chainId as keyof typeof GENERATORS]!;
        const docs = gen(TS, 0.05) as Doc[];
        const withDataset = docs.filter((d) => d.__dataset);
        expect(withDataset.length).toBeGreaterThan(0);
      });
    });
  }
});

describe("AWS data pipeline chain — orchestration modes", () => {
  it("produces correlated docs with shared pipeline_run_id", () => {
    const docs = generateDataPipelineChain(TS, 0) as Doc[];
    const labels = docs
      .map((d) => (d.labels as Record<string, unknown>)?.pipeline_run_id)
      .filter(Boolean);
    expect(labels.length).toBeGreaterThan(0);
    const unique = new Set(labels);
    expect(unique.size).toBe(1);
  });

  it("includes APM trace documents", () => {
    const docs = generateDataPipelineChain(TS, 0) as Doc[];
    const traceDocs = docs.filter(
      (d) => (d.data_stream as Record<string, unknown>)?.type === "traces"
    );
    expect(traceDocs.length).toBeGreaterThanOrEqual(2);
  });

  it("trace docs share a single trace.id", () => {
    const docs = generateDataPipelineChain(TS, 0) as Doc[];
    const traceDocs = docs.filter(
      (d) => (d.data_stream as Record<string, unknown>)?.type === "traces"
    );
    const traceIds = new Set(
      traceDocs.map((d) => (d.trace as Record<string, unknown>)?.id).filter(Boolean)
    );
    expect(traceIds.size).toBe(1);
  });

  it("co-emits correlated CloudWatch metrics routed to metrics-aws.*", () => {
    const docs = generateDataPipelineChain(TS, 0.3) as Doc[];
    const metricDocs = docs.filter(
      (d) => (d.data_stream as Record<string, unknown>)?.type === "metrics"
    );
    expect(metricDocs.length).toBeGreaterThan(0);
    for (const m of metricDocs) {
      // Routed to a fully-qualified metrics stream so it lands in metrics-aws.*
      // even though the scenario ships over the logs path.
      expect(String(m.__dataset)).toMatch(/^metrics-aws\./);
      // Correlated with the rest of the run.
      expect((m.labels as Record<string, unknown>)?.pipeline_run_id).toBeTruthy();
    }
    // Metric docs share the single run id used by logs + traces.
    const runIds = new Set(
      docs.map((d) => (d.labels as Record<string, unknown>)?.pipeline_run_id).filter(Boolean)
    );
    expect(runIds.size).toBe(1);
  });

  it("error mode produces at least one failure or error doc", () => {
    let found = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      const docs = generateDataPipelineChain(TS, 1.0) as Doc[];
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
