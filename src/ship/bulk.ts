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
 * Fetch with exponential-backoff retry for transient network errors, 5xx responses,
 * and non-JSON proxy error pages (nginx 502/504 returning HTML).
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
      } else if (res.ok) {
        const ct = res.headers.get("content-type") ?? "";
        if (!ct.includes("json") && !ct.includes("ndjson")) {
          lastErr = new Error(`Proxy returned non-JSON response (${ct || "no content-type"})`);
        } else {
          return res;
        }
      } else {
        return res;
      }
    } catch (e) {
      lastErr = e;
    }
    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
  throw lastErr;
}
