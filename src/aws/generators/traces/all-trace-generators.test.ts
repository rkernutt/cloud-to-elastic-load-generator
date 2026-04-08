import { describe, it, expect } from "vitest";
import { TRACE_GENERATORS } from "./index.js";

const TS = new Date().toISOString();

const WORKFLOW_IDS = [
  "workflow-ecommerce",
  "workflow-ml",
  "workflow-ingestion",
  "workflow-stepfunctions",
  "workflow-cascading",
  "workflow-pipeline-s3sqs",
  "workflow-pipeline-sfn",
  "workflow-sns-fanout",
];

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

describe("All TRACE_GENERATORS — structural invariants", () => {
  for (const [name, gen] of Object.entries(TRACE_GENERATORS)) {
    it(`${name}: single trace.id · root has no parent · all parent refs resolve`, () => {
      const docs = gen(TS, 0) as Doc[];

      // Must produce at least 2 documents
      expect(docs.length).toBeGreaterThanOrEqual(2);

      // All docs share exactly one trace.id
      const traceIds = new Set(docs.map((d) => (d.trace as { id?: string })?.id).filter(Boolean));
      expect(traceIds.size).toBe(1);

      // First doc is a transaction (root)
      const firstProc = docs[0].processor as { event?: string } | undefined;
      expect(firstProc?.event).toBe("transaction");

      // Root transaction has no parent.id
      const rootParent = docs[0].parent as { id?: string } | undefined;
      expect(rootParent?.id).toBeUndefined();

      // All parent.id references resolve to a known span/tx ID
      const allIds = spanAndTxIds(docs);
      for (const d of docs) {
        const par = d.parent as { id?: string } | undefined;
        if (par?.id) {
          expect(allIds.has(par.id)).toBe(true);
        }
      }
    });
  }
});

describe("Workflow generators — error branch at er=1", () => {
  for (const name of WORKFLOW_IDS) {
    it(`${name}: errorRate=1 produces structurally valid error documents`, () => {
      const gen = TRACE_GENERATORS[name as keyof typeof TRACE_GENERATORS];
      expect(gen).toBeDefined();

      // Run up to 10 times — some workflows use probability so retry to find an error doc
      let errorDocs: Doc[] = [];
      for (let attempt = 0; attempt < 10; attempt++) {
        const docs = gen(TS, 1) as Doc[];
        const found = docs.filter((d) => (d.processor as { event?: string })?.event === "error");
        if (found.length > 0) {
          errorDocs = found;
          break;
        }
      }

      expect(errorDocs.length).toBeGreaterThan(0);

      for (const errDoc of errorDocs) {
        // data_stream routing
        const ds = errDoc.data_stream as { type?: string; dataset?: string } | undefined;
        expect(ds?.type).toBe("logs");
        expect(ds?.dataset).toBe("apm.error");

        // trace context
        const traceId = (errDoc.trace as { id?: string })?.id;
        expect(typeof traceId).toBe("string");
        expect((traceId as string).length).toBe(32);

        const txId = (errDoc.transaction as { id?: string })?.id;
        expect(typeof txId).toBe("string");
        expect((txId as string).length).toBeGreaterThanOrEqual(16);

        const parentId = (errDoc.parent as { id?: string })?.id;
        expect(typeof parentId).toBe("string");
        expect((parentId as string).length).toBeGreaterThanOrEqual(16);

        // error structure
        const err = errDoc.error as
          | {
              id?: string;
              grouping_key?: string;
              culprit?: string;
              exception?: Array<{
                type?: string;
                message?: string;
                handled?: boolean;
                stacktrace?: unknown[];
              }>;
            }
          | undefined;

        expect(typeof err?.id).toBe("string");
        expect((err?.id as string).length).toBe(32);
        expect(typeof err?.grouping_key).toBe("string");
        expect(Array.isArray(err?.exception)).toBe(true);

        const exc = err?.exception?.[0];
        expect(typeof exc?.type).toBe("string");
        expect((exc?.type as string).length).toBeGreaterThan(0);
        expect(typeof exc?.message).toBe("string");
        expect((exc?.message as string).length).toBeGreaterThan(0);
      }
    });
  }
});
