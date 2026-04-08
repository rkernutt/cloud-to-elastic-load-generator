import { describe, it, expect } from "vitest";
import { TRACE_GENERATORS } from "./index.js";
import {
  generatePipelineS3SqsChainedTrace,
  generatePipelineStepFunctionsOrchestratedTrace,
} from "./pipeline-workflows";

const TS = new Date().toISOString();
const ER = 0.05;

describe("data pipeline trace workflows", () => {
  it("registers workflow-pipeline-s3sqs and workflow-pipeline-sfn", () => {
    expect(TRACE_GENERATORS["workflow-pipeline-s3sqs"]).toBe(generatePipelineS3SqsChainedTrace);
    expect(TRACE_GENERATORS["workflow-pipeline-sfn"]).toBe(
      generatePipelineStepFunctionsOrchestratedTrace
    );
  });

  it("workflow-pipeline-s3sqs: single trace.id and valid parent refs", () => {
    const docs = generatePipelineS3SqsChainedTrace(TS, ER) as Record<string, unknown>[];
    expect(docs.length).toBeGreaterThan(5);
    const traceIds = new Set(docs.map((d) => (d.trace as { id?: string })?.id).filter(Boolean));
    expect(traceIds.size).toBe(1);
    const allIds = new Set<string>();
    for (const d of docs) {
      const tx = d.transaction as { id?: string } | undefined;
      const sp = d.span as { id?: string } | undefined;
      if (tx?.id) allIds.add(tx.id);
      if (sp?.id) allIds.add(sp.id);
    }
    for (const d of docs) {
      const par = d.parent as { id?: string } | undefined;
      if (par?.id) expect(allIds.has(par.id)).toBe(true);
    }
    expect((docs[0].processor as { event?: string })?.event).toBe("transaction");
  });

  it("workflow-pipeline-sfn: single trace.id and Step Functions workflow present", () => {
    const docs = generatePipelineStepFunctionsOrchestratedTrace(TS, ER) as Record<
      string,
      unknown
    >[];
    expect(docs.length).toBeGreaterThan(6);
    const traceIds = new Set(docs.map((d) => (d.trace as { id?: string })?.id).filter(Boolean));
    expect(traceIds.size).toBe(1);
    const hasSfnState = docs.some((d) => {
      const sp = d.span as { subtype?: string; name?: string } | undefined;
      return (
        sp?.subtype === "stepfunctions" && typeof sp?.name === "string" && sp.name.includes("Glue")
      );
    });
    expect(hasSfnState).toBe(true);
  });
});
