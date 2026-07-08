import { describe, it, expect } from "vitest";
import { AZURE_TRACE_GENERATORS, AZURE_TRACE_SERVICES } from "./index.js";
import { AZURE_GENERATORS } from "../index.js";

describe("AZURE_TRACE_GENERATORS ↔ AZURE_TRACE_SERVICES registry parity", () => {
  it("every trace generator has trace UI metadata", () => {
    const genIds = Object.keys(AZURE_TRACE_GENERATORS).sort();
    const uiIds = AZURE_TRACE_SERVICES.map((s) => s.id) as string[];
    expect(genIds.every((id) => uiIds.includes(id))).toBe(true);
  });

  it("every trace UI entry is either a trace generator or a multi-signal chain scenario", () => {
    const genIds = new Set(Object.keys(AZURE_TRACE_GENERATORS));
    const extras = (AZURE_TRACE_SERVICES.map((s) => s.id) as string[]).filter(
      (id) => !genIds.has(id)
    );
    for (const id of extras) {
      expect(typeof (AZURE_GENERATORS as Record<string, unknown>)[id]).toBe("function");
    }
  });
});
