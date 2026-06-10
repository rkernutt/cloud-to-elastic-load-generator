/** Shared helpers for bulk indexing via /proxy/_bulk */

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Simulated response for dry-run mode. */
export function dryRunResponse(): Response {
  return new Response(JSON.stringify({ took: 0, errors: false, items: [] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * HTTP status codes that indicate a permanent client error where retrying the
 * identical request will never succeed.
 */
const NON_RETRYABLE_STATUS = new Set([400, 401, 403, 404, 405, 409, 413, 422, 429]);

/**
 * Fetch with exponential-backoff retry for transient network errors, 5xx responses,
 * and non-JSON proxy error pages (nginx 502/504 returning HTML).
 * Permanent 4xx errors (400, 401, 403, 404, 413, etc.) are never retried.
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status}`);
      } else if (NON_RETRYABLE_STATUS.has(res.status)) {
        throw new Error(`HTTP ${res.status}`);
      } else {
        const ct = res.headers.get("content-type") ?? "";
        if (!ct.includes("json") && !ct.includes("ndjson")) {
          lastErr = new Error(
            `Proxy returned non-JSON response (HTTP ${res.status}, ${ct || "no content-type"})`
          );
        } else {
          return res;
        }
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("HTTP ") && NON_RETRYABLE_STATUS.has(Number(e.message.slice(5)))) {
        throw e;
      }
      lastErr = e;
    }
    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
  throw lastErr;
}
