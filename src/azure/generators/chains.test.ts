import { describe, it, expect } from "vitest";
import { AZURE_GENERATORS } from "./index.js";

const TS = "2024-06-01T12:00:00.000Z";

type Doc = Record<string, unknown>;

const CHAIN_IDS = [
  "azure-security-chain",
  "azure-iam-privesc-chain",
  "azure-data-exfil-chain",
  "azure-data-pipeline-chain",
  "azure-cost-spike-chain",
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

describe("Azure cost spike chain — Functions burst correlated with billing anomaly", () => {
  it("produces a burst of azure.functions docs sharing one function app/subscription/resource group/region", () => {
    const gen = AZURE_GENERATORS["azure-cost-spike-chain"]!;
    const docs = gen(TS, 0.05) as Doc[];
    const fnDocs = docs.filter((d) => d.__dataset === "azure.functions");
    expect(fnDocs.length).toBeGreaterThanOrEqual(150);

    const fnNames = new Set(
      fnDocs.map((d) => (d.azure as Record<string, any>)?.functions?.function_name)
    );
    const fnApps = new Set(
      fnDocs.map((d) => (d.azure as Record<string, any>)?.functions?.function_app)
    );
    const subs = new Set(fnDocs.map((d) => (d.cloud as Record<string, any>)?.account?.id));
    const resourceGroups = new Set(
      fnDocs.map((d) => (d.azure as Record<string, any>)?.functions?.resource_group)
    );
    const regions = new Set(fnDocs.map((d) => (d.cloud as Record<string, any>)?.region));
    expect(fnNames.size).toBe(1);
    expect(fnApps.size).toBe(1);
    expect(subs.size).toBe(1);
    expect(resourceGroups.size).toBe(1);
    expect(regions.size).toBe(1);
  });

  it("produces exactly one azure.cost_management anomaly doc rooted in the same function app/subscription/resource group", () => {
    const gen = AZURE_GENERATORS["azure-cost-spike-chain"]!;
    const docs = gen(TS, 0.05) as Doc[];
    const fnDocs = docs.filter((d) => d.__dataset === "azure.functions");
    const billingDocs = docs.filter((d) => d.__dataset === "azure.cost_management");
    expect(billingDocs.length).toBe(1);

    const billingDoc = billingDocs[0]!;
    const fnName = (fnDocs[0]!.azure as Record<string, any>).functions.function_name;
    const fnApp = (fnDocs[0]!.azure as Record<string, any>).functions.function_app;
    const resourceGroup = (fnDocs[0]!.azure as Record<string, any>).functions.resource_group;
    const subId = (fnDocs[0]!.cloud as Record<string, any>).account.id;
    const region = (fnDocs[0]!.cloud as Record<string, any>).region;

    expect((billingDoc.cloud as Record<string, any>).account.id).toBe(subId);
    expect((billingDoc.cloud as Record<string, any>).region).toBe(region);
    expect((billingDoc.azure as Record<string, any>).cost_management.resource_group).toBe(
      resourceGroup
    );

    const props = (billingDoc.azure as Record<string, any>).cost_management.properties;
    expect(props.functionApp).toBe(fnApp);
    expect(props.functionName).toBe(fnName);
  });

  it("no invented join key — correlation is purely via shared dimensions", () => {
    // True-to-life: real Cost Management data carries no event-level correlation id
    // shared with invocation docs. Assert the chain doesn't smuggle one in, and that
    // Azure's own per-document correlationId is not forced identical across docs.
    const gen = AZURE_GENERATORS["azure-cost-spike-chain"]!;
    const docs = gen(TS, 0.05) as Doc[];
    for (const d of docs) {
      const labels = d.labels as Record<string, unknown> | undefined;
      expect(labels?.chain_id).toBeUndefined();
      expect(labels?.cost_spike_id).toBeUndefined();
    }

    const fnDocs = docs.filter((d) => d.__dataset === "azure.functions");
    const billingDoc = docs.find((d) => d.__dataset === "azure.cost_management")!;
    const correlationIds = new Set(fnDocs.map((d) => d.correlationId as string));
    expect(correlationIds.has(billingDoc.correlationId as string)).toBe(false);
  });

  it("billing anomaly lands after the burst window (models real billing lag)", () => {
    const gen = AZURE_GENERATORS["azure-cost-spike-chain"]!;
    const docs = gen(TS, 0.05) as Doc[];
    const fnDocs = docs.filter((d) => d.__dataset === "azure.functions");
    const billingDoc = docs.find((d) => d.__dataset === "azure.cost_management")!;
    const latestFnTs = Math.max(
      ...fnDocs.map((d) => new Date(d["@timestamp"] as string).getTime())
    );
    expect(new Date(billingDoc["@timestamp"] as string).getTime()).toBeGreaterThan(latestFnTs);
  });
});
