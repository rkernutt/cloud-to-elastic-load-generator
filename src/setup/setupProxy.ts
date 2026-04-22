/**
 * Shared Kibana/Elasticsearch calls via POST /proxy (see proxy.cjs).
 */

export function isKibanaFeatureUnavailable(msg: string): boolean {
  return (
    msg.includes("HTTP 400") && (msg.includes("not available") || msg.includes("configuration"))
  );
}

/** Appends to Setup log lines when Kibana returns the “not available with the current configuration” pattern. */
export function kibanaFeatureBlockedExplanation(msg: string): string {
  if (!isKibanaFeatureUnavailable(msg)) return "";
  return " — Kibana is blocking this API for this deployment (typical on Elastic Cloud Serverless). Use the Kibana UI where possible; details: docs/SETUP-WIZARD-AND-UNINSTALL.md.";
}

/**
 * `POST /api/dashboards` may not exist (404) or may reject our payload (400). Fall back to
 * saved-object create/update when any of these conditions match.
 */
export function shouldUseSavedObjectDashboardInstall(msg: string): boolean {
  if (isKibanaFeatureUnavailable(msg)) return true;
  if (msg.includes("HTTP 404")) return true;
  if (!msg.includes("HTTP 400")) return false;
  if (msg.includes("types that failed validation")) return true;
  if (msg.includes("request body.panels")) return true;
  return false;
}

export function isMlResourceAlreadyExists(msg: string): boolean {
  return (
    msg.includes("resource_already_exists_exception") ||
    msg.includes("The Id is already used") ||
    (msg.includes("datafeed") && msg.includes("already exists"))
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
  /** JSON object or array (e.g. saved_objects bulk_delete expects an array body). */
  body?: Record<string, unknown> | Array<Record<string, unknown>>;
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
    const upper = (method ?? "PUT").toUpperCase();
    // Only Fleet package install uses 409 as “already there”. Kibana saved-object PUT uses 409 for version conflicts.
    if (res.status === 409 && path.includes("/api/fleet/epm/packages/") && upper === "POST") {
      return { alreadyInstalled: true };
    }
    if (allow404 && res.status === 404) return null;
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json().catch(() => ({}));
}

type BulkDeleteStatus = { success?: boolean; error?: { statusCode?: number; message?: string } };

/** Shown when both single-object and bulk Saved Object deletes are disabled (e.g. some Serverless projects). */
export const SAVED_OBJECT_DELETE_UNSUPPORTED_HINT =
  "This deployment’s Kibana does not allow Saved Object delete APIs (Kibana feature block, e.g. some Serverless projects). Remove dashboards in the UI (Management → Saved Objects, or the Dashboards app), or use a stack where those APIs are enabled. See docs/SETUP-WIZARD-AND-UNINSTALL.md.";

export type DeleteKibanaDashboardOutcome =
  | { result: "deleted" | "not_found" }
  | { result: "api_disabled"; message: string }
  | { result: "error"; message: string };

/**
 * Remove a dashboard saved object. Stateful Kibana accepts DELETE /api/saved_objects/dashboard/:id;
 * some deployments allow POST /api/saved_objects/_bulk_delete when DELETE is blocked.
 * Serverless may disable both; then {@link SAVED_OBJECT_DELETE_UNSUPPORTED_HINT} applies.
 */
export async function deleteKibanaDashboard(
  baseUrl: string,
  apiKey: string,
  dashboardId: string
): Promise<DeleteKibanaDashboardOutcome> {
  const kb = baseUrl.replace(/\/$/, "");
  const enc = encodeURIComponent(dashboardId);

  try {
    const r = await proxyCall({
      baseUrl: kb,
      apiKey,
      path: `/api/saved_objects/dashboard/${enc}?force=true`,
      method: "DELETE",
      allow404: true,
    });
    if (r === null) return { result: "not_found" };
    return { result: "deleted" };
  } catch (e) {
    const msg = String(e);
    if (!isKibanaFeatureUnavailable(msg)) {
      return { result: "error", message: msg };
    }
  }

  try {
    const raw = (await proxyCall({
      baseUrl: kb,
      apiKey,
      path: `/api/saved_objects/_bulk_delete?force=true`,
      method: "POST",
      body: [{ type: "dashboard", id: dashboardId }],
    })) as { statuses?: BulkDeleteStatus[] };
    const st = raw?.statuses?.[0];
    if (st?.success) return { result: "deleted" };
    if (st?.error?.statusCode === 404) return { result: "not_found" };
    const errMsg = (st?.error?.message ?? JSON.stringify(st?.error ?? raw)).slice(0, 320);
    if (isKibanaFeatureUnavailable(errMsg)) {
      return { result: "api_disabled", message: SAVED_OBJECT_DELETE_UNSUPPORTED_HINT };
    }
    return { result: "error", message: errMsg };
  } catch (e2) {
    const msg2 = String(e2);
    if (isKibanaFeatureUnavailable(msg2)) {
      return { result: "api_disabled", message: SAVED_OBJECT_DELETE_UNSUPPORTED_HINT };
    }
    return { result: "error", message: msg2 };
  }
}
