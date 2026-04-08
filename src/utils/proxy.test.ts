/**
 * Unit tests for proxy retry and backoff logic.
 * Tests the exponential backoff calculation and retry conditions
 * without requiring a running Node.js server.
 */
import { describe, it, expect } from "vitest";

// ── Retry helpers (extracted from proxy.cjs logic) ────────────────────────────

const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1000;

function getRetryDelay(retryCount) {
  return BACKOFF_BASE_MS * Math.pow(2, retryCount);
}

function isRetryableStatusCode(statusCode, retryCount) {
  return statusCode >= 500 && retryCount < MAX_RETRIES;
}

function isRetryableError(code, retryCount) {
  return (
    (code === "ECONNRESET" || code === "ETIMEDOUT" || code === "ECONNREFUSED") &&
    retryCount < MAX_RETRIES
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Proxy exponential backoff", () => {
  it("retry 0 → 1000ms delay", () => {
    expect(getRetryDelay(0)).toBe(1000);
  });

  it("retry 1 → 2000ms delay", () => {
    expect(getRetryDelay(1)).toBe(2000);
  });

  it("retry 2 → 4000ms delay", () => {
    expect(getRetryDelay(2)).toBe(4000);
  });

  it("delay doubles each retry attempt", () => {
    const delays = [0, 1, 2].map(getRetryDelay);
    expect(delays[1]).toBe(delays[0] * 2);
    expect(delays[2]).toBe(delays[1] * 2);
  });
});

describe("Proxy retry conditions - status codes", () => {
  it("retries on 500 when retry count < MAX_RETRIES", () => {
    expect(isRetryableStatusCode(500, 0)).toBe(true);
    expect(isRetryableStatusCode(500, 2)).toBe(true);
  });

  it("retries on 503 when retry count < MAX_RETRIES", () => {
    expect(isRetryableStatusCode(503, 0)).toBe(true);
  });

  it("does NOT retry when retry count reaches MAX_RETRIES", () => {
    expect(isRetryableStatusCode(503, MAX_RETRIES)).toBe(false);
  });

  it("does NOT retry on 4xx status codes", () => {
    expect(isRetryableStatusCode(400, 0)).toBe(false);
    expect(isRetryableStatusCode(401, 0)).toBe(false);
    expect(isRetryableStatusCode(404, 0)).toBe(false);
    expect(isRetryableStatusCode(429, 0)).toBe(false);
  });

  it("does NOT retry on 2xx status codes", () => {
    expect(isRetryableStatusCode(200, 0)).toBe(false);
    expect(isRetryableStatusCode(201, 0)).toBe(false);
  });
});

describe("Proxy retry conditions - network errors", () => {
  it("retries ECONNRESET when retry count < MAX_RETRIES", () => {
    expect(isRetryableError("ECONNRESET", 0)).toBe(true);
    expect(isRetryableError("ECONNRESET", 2)).toBe(true);
  });

  it("retries ETIMEDOUT when retry count < MAX_RETRIES", () => {
    expect(isRetryableError("ETIMEDOUT", 0)).toBe(true);
  });

  it("retries ECONNREFUSED when retry count < MAX_RETRIES", () => {
    expect(isRetryableError("ECONNREFUSED", 0)).toBe(true);
  });

  it("does NOT retry ECONNRESET when at MAX_RETRIES", () => {
    expect(isRetryableError("ECONNRESET", MAX_RETRIES)).toBe(false);
  });

  it("does NOT retry unknown error codes", () => {
    expect(isRetryableError("ENOENT", 0)).toBe(false);
    expect(isRetryableError("EPIPE", 0)).toBe(false);
  });
});

describe("Proxy max retry limit", () => {
  it("MAX_RETRIES is 3", () => {
    expect(MAX_RETRIES).toBe(3);
  });

  it("at most 3 retries before giving up (retry indices 0,1,2 are retryable; 3 is not)", () => {
    const retryable = [0, 1, 2].every((n) => isRetryableStatusCode(500, n));
    const exhausted = !isRetryableStatusCode(500, 3);
    expect(retryable).toBe(true);
    expect(exhausted).toBe(true);
  });
});
