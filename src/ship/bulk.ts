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

/** Fetch with exponential-backoff retry for transient network errors and 5xx responses. */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok || (res.status >= 400 && res.status < 500)) return res;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
  throw lastErr;
}
