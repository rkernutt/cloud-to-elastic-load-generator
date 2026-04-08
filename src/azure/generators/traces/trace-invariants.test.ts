import { describe, it, expect } from "vitest";
import { AZURE_TRACE_GENERATORS } from "./index.js";

/**
 * Multi-service chain scenarios aligned with AWS workflow-style invariants.
 * (Older Azure trace generators use mixed root shapes; we validate new chains only.)
 */
const MULTI_SERVICE_CHAIN_IDS = [
  "workflow-servicebus-fanout",
  "workflow-eventgrid-blob",
  "workflow-durable-orchestration",
] as const satisfies ReadonlyArray<keyof typeof AZURE_TRACE_GENERATORS>;

const TS = new Date().toISOString();

type Doc = Record<string, unknown>;

function spanAndTxIds(docs: Doc[]): Set<string> {
  const ids = new Set<string>();
  for (const d of docs) {
    const tx = d.transaction as { id?: string } | undefined;
    const sp = d.span as { id?: string } | undefined;
    if (tx?.id) ids.add(tx.id);
    if (sp?.id) ids.add(sp.id);
  }
  return ids;
}

describe("Azure multi-service trace chains — structural invariants", () => {
  for (const name of MULTI_SERVICE_CHAIN_IDS) {
    it(`${name}: single trace.id · root transaction · parent refs resolve`, () => {
      const gen = AZURE_TRACE_GENERATORS[name];
      const docs = gen(TS, 0) as Doc[];
      expect(docs.length).toBeGreaterThanOrEqual(2);
      const traceIds = new Set(docs.map((d) => (d.trace as { id?: string })?.id).filter(Boolean));
      expect(traceIds.size).toBe(1);
      const firstProc = docs[0].processor as { event?: string } | undefined;
      expect(firstProc?.event).toBe("transaction");
      const rootParent = docs[0].parent as { id?: string } | undefined;
      expect(rootParent?.id).toBeUndefined();
      const allIds = spanAndTxIds(docs);
      for (const d of docs) {
        const par = d.parent as { id?: string } | undefined;
        if (par?.id) expect(allIds.has(par.id)).toBe(true);
      }
    });
  }
});
