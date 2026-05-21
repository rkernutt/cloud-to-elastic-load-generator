import { describe, it, expect } from "vitest";
import { GCP_TRACE_GENERATORS, GCP_TRACE_SERVICES } from "./index.js";

describe("GCP_TRACE_GENERATORS ↔ GCP_TRACE_SERVICES registry parity", () => {
  it("every generator key has trace UI metadata and vice versa", () => {
    const genIds = Object.keys(GCP_TRACE_GENERATORS).sort();
    const uiIds = GCP_TRACE_SERVICES.map((s) => s.id).sort();
    expect(uiIds).toEqual(genIds);
  });
});
