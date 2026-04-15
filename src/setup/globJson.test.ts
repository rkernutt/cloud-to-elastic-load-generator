import { describe, it, expect } from "vitest";
import { valuesFromEagerJsonGlob } from "./globJson";

describe("valuesFromEagerJsonGlob", () => {
  it("unwraps Vite/Rollup JSON namespace with default + hoisted keys", () => {
    const mod = {
      default: { title: "T", panels: [] },
      title: "T",
      panels: [],
    };
    const [one] = valuesFromEagerJsonGlob<{ title: string; panels: unknown[] }>({ a: mod });
    expect(one).toEqual({ title: "T", panels: [] });
    expect(one).not.toHaveProperty("default");
  });

  it("unwraps classic { default, __esModule } interop", () => {
    const mod = { default: { group: "g", description: "d", jobs: [] }, __esModule: true };
    const [one] = valuesFromEagerJsonGlob<{ group: string; jobs: unknown[] }>({ a: mod });
    expect(one).toEqual({ group: "g", description: "d", jobs: [] });
  });

  it("keeps plain multi-key JSON object without default", () => {
    const mod = { title: "T", panels: [{ x: 1 }] };
    const [one] = valuesFromEagerJsonGlob<typeof mod>({ a: mod });
    expect(one).toBe(mod);
  });

  it("uses namespace panels when default is empty but panels are hoisted", () => {
    const mod = {
      default: {},
      title: "T",
      panels: [{ x: 1 }],
      __esModule: true,
    };
    const [one] = valuesFromEagerJsonGlob<{ title: string; panels: unknown[] }>({ a: mod });
    expect(one).toEqual(mod);
    expect((one as { panels: unknown[] }).panels).toHaveLength(1);
  });
});
