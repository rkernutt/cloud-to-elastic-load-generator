import { describe, it, expect } from "vitest";
import {
  stripNulls,
  rand,
  randInt,
  randFloat,
  randId,
  randIp,
  randTs,
  randAccount,
  randUUID,
  REGIONS,
  ACCOUNTS,
} from "./index";

describe("stripNulls", () => {
  it("returns primitives unchanged", () => {
    expect(stripNulls(null)).toBe(null);
    expect(stripNulls(1)).toBe(1);
    expect(stripNulls("a")).toBe("a");
  });

  it("strips null values from objects", () => {
    expect(stripNulls({ a: 1, b: null, c: "x" })).toEqual({ a: 1, c: "x" });
  });

  it("strips nested nulls", () => {
    expect(stripNulls({ a: { b: null, c: 2 } })).toEqual({ a: { c: 2 } });
  });

  it("processes arrays", () => {
    expect(stripNulls([1, null, { x: null, y: 3 }])).toEqual([1, null, { y: 3 }]);
  });
});

describe("rand", () => {
  it("returns an element from the array", () => {
    const arr = [1, 2, 3];
    for (let i = 0; i < 20; i++) {
      expect(arr).toContain(rand(arr));
    }
  });
});

describe("randInt", () => {
  it("returns integer in [min, max] inclusive", () => {
    for (let i = 0; i < 50; i++) {
      const n = randInt(5, 10);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(5);
      expect(n).toBeLessThanOrEqual(10);
    }
  });
});

describe("randFloat", () => {
  it("returns a number in [min, max]", () => {
    const n = randFloat(0, 1);
    expect(typeof n).toBe("number");
    expect(n).toBeGreaterThanOrEqual(0);
    expect(n).toBeLessThanOrEqual(1);
  });
});

describe("randId", () => {
  it("returns non-empty string with length at most requested", () => {
    expect(typeof randId(8)).toBe("string");
    expect(randId(8).length).toBeLessThanOrEqual(8);
    expect(randId(8).length).toBeGreaterThan(0);
  });
});

describe("randIp", () => {
  it("returns dotted quad", () => {
    expect(randIp()).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
  });
});

describe("randTs", () => {
  it("returns ISO string between start and end", () => {
    const start = new Date("2024-01-01");
    const end = new Date("2024-01-02");
    const ts = randTs(start, end);
    const t = new Date(ts).getTime();
    expect(t).toBeGreaterThanOrEqual(start.getTime());
    expect(t).toBeLessThanOrEqual(end.getTime());
  });
});

describe("randAccount", () => {
  it("returns object with id and name", () => {
    const acct = randAccount();
    expect(acct).toHaveProperty("id");
    expect(acct).toHaveProperty("name");
    expect(ACCOUNTS).toContainEqual(acct);
  });
});

describe("randUUID", () => {
  it("returns uuid-like string with 5 segments", () => {
    const u = randUUID();
    const parts = u.split("-");
    expect(parts.length).toBe(5);
    expect(parts.every((p) => p.length > 0)).toBe(true);
    expect(u).toMatch(/^[a-zA-Z0-9-]+$/);
  });
});

describe("REGIONS", () => {
  it("is non-empty array", () => {
    expect(Array.isArray(REGIONS)).toBe(true);
    expect(REGIONS.length).toBeGreaterThan(0);
  });
});
