import { describe, it, expect } from "vitest";
import { GCP_TRACE_GENERATORS, GCP_TRACE_SERVICES } from "./index.js";
import { GCP_GENERATORS } from "../index.js";

describe("GCP_TRACE_GENERATORS ↔ GCP_TRACE_SERVICES registry parity", () => {
  it("every trace generator has trace UI metadata", () => {
    const genIds = Object.keys(GCP_TRACE_GENERATORS).sort();
    const uiIds = GCP_TRACE_SERVICES.map((s) => s.id);
    expect(genIds.every((id) => uiIds.includes(id))).toBe(true);
  });

  it("every trace UI entry is either a trace generator or a multi-signal chain scenario", () => {
    const genIds = new Set(Object.keys(GCP_TRACE_GENERATORS));
    const extras = GCP_TRACE_SERVICES.map((s) => s.id).filter((id) => !genIds.has(id));
    for (const id of extras) {
      expect(typeof (GCP_GENERATORS as Record<string, unknown>)[id]).toBe("function");
    }
  });
});
