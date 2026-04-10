import { describe, it, expect } from "vitest";
import { GCP_GENERATORS } from "./index.js";
import { GCP_METRICS_GENERATORS } from "./metrics/index.js";

const TS = "2024-06-01T12:00:00.000Z";
const ER = 0.05;

function assertLogDocument(serviceId: string, raw: unknown) {
  const doc = Array.isArray(raw) ? raw[0] : raw;
  expect.soft(doc, serviceId).toBeTruthy();
  expect.soft(typeof doc, serviceId).toBe("object");
  expect
    .soft(doc && typeof (doc as Record<string, unknown>)["@timestamp"], serviceId)
    .toBe("string");
}

function assertMetricDocuments(serviceId: string, raw: unknown) {
  expect.soft(Array.isArray(raw), `${serviceId}: metrics must return an array`).toBe(true);
  const arr = raw as unknown[];
  expect.soft(arr.length, serviceId).toBeGreaterThan(0);
  for (let i = 0; i < arr.length; i++) {
    const doc = arr[i] as Record<string, unknown>;
    expect.soft(typeof doc?.["@timestamp"], `${serviceId}[${i}]`).toBe("string");
  }
}

describe("GCP generator smoke", () => {
  it("every log generator returns an ECS-shaped root with @timestamp", () => {
    for (const id of Object.keys(GCP_GENERATORS)) {
      const gen = GCP_GENERATORS[id]!;
      const raw = gen(TS, ER);
      assertLogDocument(id, raw);
    }
  });

  it("every metric generator returns non-empty @timestamp metric rows", () => {
    for (const id of Object.keys(GCP_METRICS_GENERATORS)) {
      const gen = GCP_METRICS_GENERATORS[id]!;
      const raw = gen(TS, ER);
      assertMetricDocuments(id, raw);
    }
  });
});
