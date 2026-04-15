/**
 * Normalize eager JSON modules from import.meta.glob.
 * Vite may return either the parsed JSON object or an ESM interop object
 * `{ default: ParsedJson, __esModule?: true }`. Blindly reading `.default`
 * breaks the common case where the module *is* the JSON (multi-key object),
 * producing `undefined` for every entry and empty AWS/GCP/Azure setup lists.
 *
 * Only unwrap when the object looks like an ESM default export namespace,
 * not when `default` is just another field on real JSON (multiple top-level keys).
 */
export function valuesFromEagerJsonGlob<T>(modules: Record<string, unknown>): T[] {
  return Object.values(modules).map((mod) => {
    if (mod == null || typeof mod !== "object") return mod as T;
    const o = mod as Record<string, unknown>;
    if (!("default" in o) || o.default === undefined || typeof o.default !== "object") {
      return mod as T;
    }
    const inner = o.default as Record<string, unknown>;
    /** Vite/Rollup JSON modules: `default` holds the doc; extra keys mirror named exports. */
    if (Array.isArray(inner.panels) || Array.isArray(inner.jobs)) {
      return o.default as T;
    }
    /** Vite JSON interop: `panels` / `jobs` on the namespace while `default` is empty or incomplete. */
    if (Array.isArray(o.panels) || Array.isArray(o.jobs)) {
      return mod as T;
    }
    const keys = Object.keys(o);
    const looksLikeEsmDefaultExport =
      (keys.length === 1 && keys[0] === "default") ||
      (keys.length === 2 && keys.includes("default") && keys.includes("__esModule"));
    if (looksLikeEsmDefaultExport) return o.default as T;
    return mod as T;
  });
}
