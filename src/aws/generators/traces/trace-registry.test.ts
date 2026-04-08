import { describe, it, expect } from "vitest";
import { TRACE_GENERATORS } from "./index.js";
import { TRACE_SERVICES } from "./services.js";

describe("TRACE_GENERATORS ↔ TRACE_SERVICES registry parity", () => {
  it("every generator key has trace UI metadata and vice versa", () => {
    const genIds = Object.keys(TRACE_GENERATORS).sort();
    const uiIds = TRACE_SERVICES.map((s) => s.id).sort();
    expect(uiIds).toEqual(genIds);
  });
});
