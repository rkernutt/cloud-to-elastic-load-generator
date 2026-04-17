/**
 * Shared Kibana dashboard install helpers (used by index.mjs and aws-loadgen-packs).
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

export const KIBANA_ELASTIC_API_VERSION = process.env.ELASTIC_KIBANA_API_VERSION || "2023-10-31";

/** Load *-dashboard.json from `dashboardDir` and optional matching ndjson/ files. */
export function loadDashboards(dashboardDir) {
  const ndjsonDir = join(dashboardDir, "ndjson");
  const files = readdirSync(dashboardDir).filter((f) => f.endsWith("-dashboard.json"));
  return files.map((file) => {
    const def = JSON.parse(readFileSync(join(dashboardDir, file), "utf-8"));

    let ndjson = null;
    const ndjsonPath = join(ndjsonDir, file.replace("-dashboard.json", "-dashboard.ndjson"));
    if (existsSync(ndjsonPath)) {
      const fullRaw = readFileSync(ndjsonPath, "utf-8").trim();
      const lines = fullRaw.split("\n").filter((line) => line.length > 0);
      if (lines.length === 1) {
        const obj = JSON.parse(lines[0]);
        ndjson = { raw: lines[0], id: obj.id };
      } else {
        const dashboardLineIndex = lines.findIndex((line) => {
          try {
            return JSON.parse(line).type === "dashboard";
          } catch {
            return false;
          }
        });
        if (dashboardLineIndex >= 0) {
          const obj = JSON.parse(lines[dashboardLineIndex]);
          ndjson = { lines, dashboardLineIndex, id: obj.id };
        }
      }
    }

    return { file, title: def.title, definition: def, ndjson };
  });
}

export function createKibanaClient(baseUrl, apiKey) {
  const base = baseUrl.replace(/\/$/, "");
  const authHeaders = {
    Authorization: `ApiKey ${apiKey}`,
    "kbn-xsrf": "true",
    "Elastic-Api-Version": KIBANA_ELASTIC_API_VERSION,
  };

  async function request(method, path, body, extraHeaders = {}) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...authHeaders, ...extraHeaders },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 404) return null;

    if (!res.ok) {
      let text;
      try {
        text = await res.text();
      } catch {
        text = "(unable to read response)";
      }
      throw new Error(`Kibana request failed: ${method} ${path} → HTTP ${res.status}\n${text}`);
    }

    return res.json();
  }

  return {
    async testConnection() {
      return request("GET", "/api/status");
    },

    async findDashboardByTitle(title) {
      const encoded = encodeURIComponent(title);
      try {
        const result = await request(
          "GET",
          `/api/saved_objects/_find?type=dashboard&search_fields=title&search=${encoded}&per_page=10`
        );
        if (!result?.saved_objects) return null;
        return result.saved_objects.find((obj) => obj.attributes?.title === title) ?? null;
      } catch (err) {
        if (isUnavailable(err)) return null;
        throw err;
      }
    },

    async getSavedObjectById(type, id) {
      try {
        return await request("GET", `/api/saved_objects/${type}/${encodeURIComponent(id)}`);
      } catch (err) {
        if (isUnavailable(err)) return null;
        throw err;
      }
    },

    async findDataView(title) {
      try {
        const result = await request("GET", "/api/data_views");
        const views = result?.data_view ?? [];
        return views.find((v) => v.title === title) ?? null;
      } catch (err) {
        if (isUnavailable(err)) return null;
        throw err;
      }
    },

    async createDataView(title, timeFieldName = "@timestamp", name = "") {
      return request("POST", "/api/data_views/data_view", {
        data_view: { title, timeFieldName, name: name || title },
      });
    },

    async createDashboard(definition) {
      const { id, spaces, ...body } = definition;
      return request("POST", "/api/dashboards", body);
    },

    async deleteDashboard(id) {
      return request("DELETE", `/api/saved_objects/dashboard/${encodeURIComponent(id)}`);
    },

    async importSavedObject(ndjsonString) {
      const boundary = `----FormBoundary${Math.random().toString(36).slice(2)}`;
      const crlf = "\r\n";
      const encoded = Buffer.from(ndjsonString);
      const parts = Buffer.concat([
        Buffer.from(
          `--${boundary}${crlf}` +
            `Content-Disposition: form-data; name="file"; filename="import.ndjson"${crlf}` +
            `Content-Type: application/ndjson${crlf}${crlf}`
        ),
        encoded,
        Buffer.from(`${crlf}--${boundary}--${crlf}`),
      ]);

      const res = await fetch(`${base}/api/saved_objects/_import?overwrite=false`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": `multipart/form-data; boundary=${boundary}` },
        body: parts,
      });

      if (!res.ok) {
        let text;
        try {
          text = await res.text();
        } catch {
          text = "(unable to read response)";
        }
        throw new Error(
          `Kibana request failed: POST /api/saved_objects/_import → HTTP ${res.status}\n${text}`
        );
      }
      return res.json();
    },
  };
}

export function isUnavailable(err) {
  return (
    err.message.includes("HTTP 400") &&
    (err.message.includes("not available") || err.message.includes("configuration"))
  );
}

export function parseVersion(versionStr) {
  const [major = 0, minor = 0, patch = 0] = (versionStr ?? "0.0.0")
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
  return { major, minor, patch };
}

export function patchNdjsonForVersion(ndjsonString, kibanaVersion) {
  const v = parseVersion(kibanaVersion);

  let obj;
  try {
    obj = JSON.parse(ndjsonString);
  } catch {
    return ndjsonString;
  }

  if (!obj.attributes?.panelsJSON) return ndjsonString;

  let panels;
  try {
    panels = JSON.parse(obj.attributes.panelsJSON);
  } catch {
    return ndjsonString;
  }

  let changed = false;

  for (const panel of panels) {
    const attrs = panel.embeddableConfig?.attributes;
    if (!attrs || attrs.visualizationType !== "lnsPie") continue;

    const viz = attrs.state?.visualization;
    if (!viz || !Array.isArray(viz.layers)) continue;

    for (const layer of viz.layers) {
      if (v.major >= 10 && !layer.colorMapping) {
        layer.colorMapping = {
          assignments: [],
          specialAssignments: [
            { rules: [{ type: "other" }], color: { type: "loop" }, touched: false },
          ],
          paletteId: "default",
          colorMode: { type: "categorical" },
        };
        changed = true;
      }

      if ((v.major === 8 && v.minor >= 13) || v.major === 9) {
        if (!("legendStats" in layer)) {
          layer.legendStats = [];
          changed = true;
        }
        if (!("truncateLegend" in layer)) {
          layer.truncateLegend = true;
          changed = true;
        }
        if (!("maxLegendLines" in layer)) {
          layer.maxLegendLines = 1;
          changed = true;
        }
      }
    }
  }

  if (changed) {
    obj.attributes.panelsJSON = JSON.stringify(panels);
    obj.typeMigrationVersion = kibanaVersion;
  }

  return JSON.stringify(obj);
}

/** Build NDJSON file body for Kibana import (single-object or tag+dashboard bundle). */
function buildNdjsonImportPayload(ndjson, kibanaVersion) {
  if (ndjson.lines && typeof ndjson.dashboardLineIndex === "number") {
    const lines = [...ndjson.lines];
    const origDash = lines[ndjson.dashboardLineIndex];
    const patchedDash = kibanaVersion ? patchNdjsonForVersion(origDash, kibanaVersion) : origDash;
    lines[ndjson.dashboardLineIndex] = patchedDash;
    return { payload: `${lines.join("\n")}\n`, wasPatched: patchedDash !== origDash };
  }
  const raw = ndjson.raw;
  const patched = kibanaVersion ? patchNdjsonForVersion(raw, kibanaVersion) : raw;
  return { payload: patched, wasPatched: patched !== raw };
}

export async function installOne(client, title, definition, ndjson, kibanaVersion = "") {
  const existing = await client.findDashboardByTitle(title);
  if (existing !== null) return { status: "skipped" };

  const v = parseVersion(kibanaVersion);
  const is94Plus = kibanaVersion && (v.major > 9 || (v.major === 9 && v.minor >= 4));
  const useNdjsonFirst = !!(ndjson && kibanaVersion && !is94Plus);

  if (!useNdjsonFirst) {
    try {
      const result = await client.createDashboard(definition);
      const id = result?.id ?? result?.data?.id ?? "(unknown id)";
      return { status: "installed", id, via: "Dashboards API" };
    } catch (err) {
      if (!isUnavailable(err)) throw err;
    }
  }

  if (!ndjson) {
    throw new Error(
      "Dashboards API unavailable on this deployment and no pre-generated ndjson found.\n" +
        "       Run 'npm run generate:aws-dashboards:ndjson' then retry."
    );
  }

  const existingById = await client.getSavedObjectById("dashboard", ndjson.id);
  if (existingById !== null) return { status: "skipped" };

  const { payload: patchedRaw, wasPatched } = buildNdjsonImportPayload(ndjson, kibanaVersion);

  const result = await client.importSavedObject(patchedRaw);
  const success =
    result?.success === true || result?.successResults?.some((r) => r.id === ndjson.id);

  if (!success) {
    const errors = result?.errors ?? result?.successResults ?? result;
    throw new Error(`Import returned unexpected result: ${JSON.stringify(errors)}`);
  }

  return { status: "installed", id: ndjson.id, via: "Saved Objects import", patched: wasPatched };
}
