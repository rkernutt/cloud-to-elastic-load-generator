import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  ALLOWED_LS_KEYS,
  loadAndScrubSavedConfig,
  parsePersistedRecord,
  toPersistedStorageObject,
  PERSISTED_CONFIG_KEYS,
} from "./persistedConfig";

describe("parsePersistedRecord", () => {
  it("strips unknown keys by omission (only valid fields returned)", () => {
    const out = parsePersistedRecord({
      elasticUrl: "https://evil.example",
      apiKey: "supersecret",
      logsPerService: 100,
      bogus: 1,
    });
    expect(out).not.toHaveProperty("elasticUrl");
    expect(out).not.toHaveProperty("apiKey");
    expect(out.logsPerService).toBe(100);
    expect(out).not.toHaveProperty("bogus");
  });

  it("clamps numeric fields", () => {
    const out = parsePersistedRecord({
      logsPerService: 999999,
      errorRate: 99,
      scheduleTotalRuns: 0,
    });
    expect(out.logsPerService).toBe(5000);
    expect(out.errorRate).toBe(0.5);
    expect(out.scheduleTotalRuns).toBe(1);
  });

  it("rejects invalid eventType", () => {
    const out = parsePersistedRecord({ eventType: "hax" });
    expect(out.eventType).toBeUndefined();
  });

  it("accepts valid eventType", () => {
    expect(parsePersistedRecord({ eventType: "traces" }).eventType).toBe("traces");
  });

  it("rejects invalid index prefix", () => {
    const out = parsePersistedRecord({ logsIndexPrefix: "bad space" });
    expect(out.logsIndexPrefix).toBeUndefined();
  });

  it("ignores non-number and non-boolean types", () => {
    const out = parsePersistedRecord({
      injectAnomalies: "yes" as unknown as boolean,
      batchSize: "250" as unknown as number,
    });
    expect(out.injectAnomalies).toBeUndefined();
    expect(out.batchSize).toBeUndefined();
  });
});

describe("toPersistedStorageObject", () => {
  it("includes exactly the allowlisted keys", () => {
    const slice = {
      logsIndexPrefix: "logs-aws",
      metricsIndexPrefix: "metrics-aws",
      logsPerService: 500,
      tracesPerService: 100,
      errorRate: 0.05,
      batchSize: 250,
      batchDelayMs: 20,
      ingestionSource: "default",
      eventType: "logs",
      injectAnomalies: false,
      scheduleEnabled: false,
      scheduleTotalRuns: 12,
      scheduleIntervalMin: 15,
      deploymentType: "cloud-hosted",
    };
    const obj = toPersistedStorageObject(slice);
    const keys = Object.keys(obj).sort();
    expect(keys).toEqual([...PERSISTED_CONFIG_KEYS].sort());
    expect(ALLOWED_LS_KEYS.size).toBe(PERSISTED_CONFIG_KEYS.length);
  });
});

describe("loadAndScrubSavedConfig", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rewrites storage when disallowed keys exist", () => {
    const getItem = vi.mocked(localStorage.getItem);
    const setItem = vi.mocked(localStorage.setItem);
    getItem.mockReturnValue(
      JSON.stringify({ logsPerService: 200, elasticUrl: "https://x", apiKey: "k" })
    );
    const out = loadAndScrubSavedConfig("k");
    expect(out.logsPerService).toBe(200);
    expect(setItem).toHaveBeenCalled();
    const written = JSON.parse(setItem.mock.calls[0][1] as string);
    expect(written.elasticUrl).toBeUndefined();
    expect(written.apiKey).toBeUndefined();
  });
});
