import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { errMsg, dryRunResponse, fetchWithRetry } from "./bulk";

describe("bulk helpers", () => {
  it("errMsg stringifies non-Errors", () => {
    expect(errMsg(new Error("x"))).toBe("x");
    expect(errMsg("plain")).toBe("plain");
    expect(errMsg({ code: 1 })).toBe("[object Object]");
  });

  it("dryRunResponse returns parseable ok json", async () => {
    const res = dryRunResponse();
    expect(res.ok).toBe(true);
    const json = await res.json();
    expect(json.errors).toBe(false);
    expect(Array.isArray(json.items)).toBe(true);
  });

  describe("fetchWithRetry", () => {
    const mockFetch = vi.fn();
    beforeEach(() => {
      vi.stubGlobal("fetch", mockFetch);
    });
    afterEach(() => {
      vi.unstubAllGlobals();
      mockFetch.mockReset();
    });

    it("returns 4xx without retrying", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 400 });
      const res = await fetchWithRetry("http://x", {});
      expect(res.status).toBe(400);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("retries on 503 then succeeds", async () => {
      const jsonHeaders = {
        get: (k: string) => (k === "content-type" ? "application/json" : null),
      };
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 503 })
        .mockResolvedValueOnce({ ok: true, status: 200, headers: jsonHeaders });
      const res = await fetchWithRetry("http://x", {}, 2);
      expect(res.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("retries when proxy returns HTML instead of JSON", async () => {
      const htmlHeaders = { get: (k: string) => (k === "content-type" ? "text/html" : null) };
      const jsonHeaders = {
        get: (k: string) => (k === "content-type" ? "application/json" : null),
      };
      mockFetch
        .mockResolvedValueOnce({ ok: true, status: 200, headers: htmlHeaders })
        .mockResolvedValueOnce({ ok: true, status: 200, headers: jsonHeaders });
      const res = await fetchWithRetry("http://x", {}, 2);
      expect(res.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
