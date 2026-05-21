import { describe, it, expect } from "vitest";
import { AZURE_TRACE_GENERATORS, AZURE_TRACE_SERVICES } from "./index.js";

describe("AZURE_TRACE_GENERATORS ↔ AZURE_TRACE_SERVICES registry parity", () => {
  it("every generator key has trace UI metadata and vice versa", () => {
    const genIds = Object.keys(AZURE_TRACE_GENERATORS).sort();
    const uiIds = AZURE_TRACE_SERVICES.map((s) => s.id).sort();
    expect(uiIds).toEqual(genIds);
  });
});
