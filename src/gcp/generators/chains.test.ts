import { describe, it, expect } from "vitest";
import { GCP_GENERATORS } from "./index.js";

const TS = "2024-06-01T12:00:00.000Z";

type Doc = Record<string, unknown>;

const CHAIN_IDS = [
  "gcp-security-chain",
  "gcp-iam-privesc-chain",
  "gcp-data-exfil-chain",
  "gcp-data-pipeline-chain",
  "gcp-cost-spike-chain",
];

describe("GCP chain generators — structural invariants", () => {
  for (const chainId of CHAIN_IDS) {
    describe(chainId, () => {
      it("returns an array of 2+ correlated documents", () => {
        const gen = GCP_GENERATORS[chainId]!;
        expect(gen, `${chainId} not in registry`).toBeDefined();
        const docs = gen(TS, 0.05) as Doc[];
        expect(Array.isArray(docs)).toBe(true);
        expect(docs.length).toBeGreaterThanOrEqual(2);
      });

      it("every doc has @timestamp", () => {
        const gen = GCP_GENERATORS[chainId]!;
        const docs = gen(TS, 0.05) as Doc[];
        for (const doc of docs) {
          expect(typeof doc["@timestamp"]).toBe("string");
        }
      });

      it("produces docs with __dataset routing field", () => {
        const gen = GCP_GENERATORS[chainId]!;
        const docs = gen(TS, 0.05) as Doc[];
        const withDataset = docs.filter((d) => d.__dataset);
        expect(withDataset.length).toBeGreaterThan(0);
      });
    });
  }
});

describe("GCP data pipeline chain — correlation", () => {
  it("includes APM trace documents", () => {
    const gen = GCP_GENERATORS["gcp-data-pipeline-chain"]!;
    const docs = gen(TS, 0) as Doc[];
    const traceDocs = docs.filter(
      (d) => (d.data_stream as Record<string, unknown>)?.type === "traces"
    );
    expect(traceDocs.length).toBeGreaterThanOrEqual(2);
  });

  it("trace docs share a single trace.id", () => {
    const gen = GCP_GENERATORS["gcp-data-pipeline-chain"]!;
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
    const gen = GCP_GENERATORS["gcp-data-pipeline-chain"]!;
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

describe("GCP cost spike chain — Cloud Functions burst correlated with billing anomaly", () => {
  it("produces a burst of gcp.cloudfunctions docs sharing one function/project/region", () => {
    const gen = GCP_GENERATORS["gcp-cost-spike-chain"]!;
    const docs = gen(TS, 0.05) as Doc[];
    const fnDocs = docs.filter((d) => d.__dataset === "gcp.cloudfunctions");
    expect(fnDocs.length).toBeGreaterThanOrEqual(150);

    const fns = new Set(
      fnDocs.map((d) => (d.gcp as Record<string, any>)?.cloud_functions?.function_name)
    );
    const projectIds = new Set(fnDocs.map((d) => (d.cloud as Record<string, any>)?.project?.id));
    const regions = new Set(fnDocs.map((d) => (d.cloud as Record<string, any>)?.region));
    expect(fns.size).toBe(1);
    expect(projectIds.size).toBe(1);
    expect(regions.size).toBe(1);
  });

  it("produces exactly one gcp.billing anomaly doc rooted in the same function/project", () => {
    const gen = GCP_GENERATORS["gcp-cost-spike-chain"]!;
    const docs = gen(TS, 0.05) as Doc[];
    const fnDocs = docs.filter((d) => d.__dataset === "gcp.cloudfunctions");
    const billingDocs = docs.filter((d) => d.__dataset === "gcp.billing");
    expect(billingDocs.length).toBe(1);

    const billingDoc = billingDocs[0]!;
    const fn = (fnDocs[0]!.gcp as Record<string, any>).cloud_functions.function_name;
    const projectId = (fnDocs[0]!.cloud as Record<string, any>).project.id;
    const region = (fnDocs[0]!.cloud as Record<string, any>).region;

    expect((billingDoc.cloud as Record<string, any>).project.id).toBe(projectId);
    expect((billingDoc.cloud as Record<string, any>).region).toBe(region);
    expect((billingDoc.gcp as Record<string, any>).billing.project_id).toBe(projectId);

    const rootCause = (billingDoc.gcp as Record<string, any>).billing.anomaly.root_cause;
    expect(rootCause.function_name).toBe(fn);
    expect(rootCause.region).toBe(region);
    expect(rootCause.project_id).toBe(projectId);
  });

  it("no invented join key — correlation is purely via shared dimensions", () => {
    // True-to-life: real billing data carries no event-level correlation id. Assert
    // the chain doesn't smuggle one in under `labels` the way the other chains do.
    const gen = GCP_GENERATORS["gcp-cost-spike-chain"]!;
    const docs = gen(TS, 0.05) as Doc[];
    for (const d of docs) {
      const labels = d.labels as Record<string, unknown> | undefined;
      expect(labels?.chain_id).toBeUndefined();
      expect(labels?.cost_spike_id).toBeUndefined();
    }
  });

  it("billing anomaly lands after the burst window (models real billing lag)", () => {
    const gen = GCP_GENERATORS["gcp-cost-spike-chain"]!;
    const docs = gen(TS, 0.05) as Doc[];
    const fnDocs = docs.filter((d) => d.__dataset === "gcp.cloudfunctions");
    const billingDoc = docs.find((d) => d.__dataset === "gcp.billing")!;
    const latestFnTs = Math.max(
      ...fnDocs.map((d) => new Date(d["@timestamp"] as string).getTime())
    );
    expect(new Date(billingDoc["@timestamp"] as string).getTime()).toBeGreaterThan(latestFnTs);
  });
});
