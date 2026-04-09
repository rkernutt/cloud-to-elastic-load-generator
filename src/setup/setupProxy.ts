/**
 * Shared Kibana/Elasticsearch calls via POST /proxy (see proxy.cjs).
 */

export function isKibanaFeatureUnavailable(msg: string): boolean {
  return (
    msg.includes("HTTP 400") && (msg.includes("not available") || msg.includes("configuration"))
  );
}

export function isMlResourceAlreadyExists(msg: string): boolean {
  return (
    msg.includes("resource_already_exists_exception") || msg.includes("The Id is already used")
  );
}

export async function resolveFleetPackageVersion(
  kb: string,
  apiKey: string,
  pkgName: string
): Promise<string | null> {
  try {
    const data = (await proxyCall({
      baseUrl: kb,
      apiKey,
      path: `/api/fleet/epm/packages/${pkgName}`,
      method: "GET",
    })) as { item?: { latestVersion?: string } } | null;
    if (data?.item?.latestVersion) return data.item.latestVersion;
  } catch {
    /* EPR fallback */
  }
  try {
    const epr = await fetch(`https://epr.elastic.co/search?package=${encodeURIComponent(pkgName)}`);
    const data = (await epr.json()) as Array<{ version?: string }>;
    return data?.[0]?.version ?? null;
  } catch {
    return null;
  }
}

export async function proxyCall(opts: {
  baseUrl: string;
  apiKey: string;
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: Record<string, unknown>;
  /** Wraps as multipart file upload for POST /api/saved_objects/_import (handled by proxy.cjs). */
  kibanaSavedObjectsNdjson?: string;
  /** For Elasticsearch/Kibana GET/DELETE: return null on 404 instead of throwing. */
  allow404?: boolean;
}): Promise<unknown | null> {
  const { baseUrl, apiKey, path, method = "PUT", body, kibanaSavedObjectsNdjson, allow404 } = opts;
  const payload =
    kibanaSavedObjectsNdjson !== undefined
      ? {
          __proxyMultipart: "kibana_saved_objects_import",
          ndjson: kibanaSavedObjectsNdjson,
        }
      : body;
  let res: Response;
  try {
    res = await fetch("/proxy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-elastic-url": baseUrl.replace(/\/$/, ""),
        "x-elastic-key": apiKey,
        "x-elastic-path": path,
        "x-elastic-method": method,
      },
      body: payload !== undefined ? JSON.stringify(payload) : "{}",
    });
  } catch (e) {
    if (e instanceof TypeError) {
      throw new TypeError(
        `${e.message} (Setup uses POST /proxy — run \`node proxy.cjs\`, use \`npm run dev\`/\`preview\` with proxy enabled, or rebuild Docker after nginx routes /proxy to the proxy process.)`
      );
    }
    throw e;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 409) return { alreadyInstalled: true };
    if (allow404 && res.status === 404) return null;
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json().catch(() => ({}));
}
