import { describe, it, expect } from "vitest";
import { TRACE_GENERATORS } from "./index.js";
import { TRACE_SERVICES } from "./services.js";
import { GENERATORS } from "../index.js";

describe("TRACE_GENERATORS ↔ TRACE_SERVICES registry parity", () => {
  it("every trace generator has trace UI metadata", () => {
    const genIds = Object.keys(TRACE_GENERATORS).sort();
    const uiIds = TRACE_SERVICES.map((s) => s.id);
    expect(genIds.every((id) => uiIds.includes(id))).toBe(true);
  });

  it("every trace UI entry is either a trace generator or a multi-signal chain scenario", () => {
    const genIds = new Set(Object.keys(TRACE_GENERATORS));
    const extras = TRACE_SERVICES.map((s) => s.id).filter((id) => !genIds.has(id));
    // Extras are chain scenarios served by the self-routing scenario pass, which
    // sources them from the logs generator map.
    for (const id of extras) {
      expect(typeof (GENERATORS as Record<string, unknown>)[id]).toBe("function");
    }
  });
});
