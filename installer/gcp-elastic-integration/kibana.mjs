/**
 * Kibana Fleet API client.
 *
 * Usage:
 *   import createKibanaClient from './kibana.mjs';
 *   const client = createKibanaClient('https://my-deployment.kb.us-east-1.aws.elastic-cloud.com:9243', '<apiKey>');
 */

const EPR_BASE_URL = "https://epr.elastic.co";

/**
 * Creates a Kibana Fleet API client.
 *
 * @param {string} baseUrl - Kibana base URL
 * @param {string} apiKey  - Base64-encoded Elastic API key
 * @returns {object} Client with getInstalledPackage, installPackage, and getLatestVersion methods
 */
export default function createKibanaClient(baseUrl, apiKey) {
  const base = baseUrl.replace(/\/$/, "");

  const commonHeaders = {
    "kbn-xsrf": "true",
    Authorization: `ApiKey ${apiKey}`,
  };

  /**
   * Shared fetch helper. Throws a descriptive error for non-2xx responses.
   */
  async function apiFetch(url, options = {}) {
    let response;
    try {
      response = await fetch(url, options);
    } catch (networkErr) {
      throw new Error(`Network error while reaching ${url}: ${networkErr.message}`);
    }

    if (!response.ok) {
      let body = "";
      try {
        body = await response.text();
      } catch (_) {
        // ignore body read errors
      }
      const err = new Error(
        `HTTP ${response.status} ${response.statusText} — ${url}\n${body}`.trim()
      );
      err.status = response.status;
      err.body = body;
      throw err;
    }

    return response.json();
  }

  return {
    /**
     * Returns the installed package metadata for the given package name, or
     * null if the package is not found (404).
     */
    async getInstalledPackage(packageName) {
      const url = `${base}/api/fleet/epm/packages/${encodeURIComponent(packageName)}`;
      try {
        return await apiFetch(url, {
          method: "GET",
          headers: commonHeaders,
        });
      } catch (err) {
        if (err.status === 404) return null;
        throw err;
      }
    },

    /**
     * Installs a specific version of a package via the Fleet EPM API.
     */
    async installPackage(packageName, version) {
      const url = `${base}/api/fleet/epm/packages/${encodeURIComponent(packageName)}/${encodeURIComponent(version)}`;
      return apiFetch(url, {
        method: "POST",
        headers: {
          ...commonHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ force: false }),
      });
    },

    /**
     * Resolves the latest published version of a package.
     *
     * Strategy:
     *   1. Ask Kibana's Fleet API — works for all deployments, including
     *      air-gapped / network-restricted on-premises environments.
     *   2. Fall back to the public Elastic Package Registry (epr.elastic.co)
     *      if the Kibana Fleet API does not return a latestVersion field.
     */
    async getLatestVersion(packageName) {
      // 1. Try the Kibana Fleet API first
      try {
        const url = `${base}/api/fleet/epm/packages/${encodeURIComponent(packageName)}`;
        const data = await apiFetch(url, { method: "GET", headers: commonHeaders });
        const version = data?.item?.latestVersion;
        if (version) return version;
      } catch (_) {
        // Fall through to EPR
      }

      // 2. Fall back to the public Elastic Package Registry
      const eprUrl = `${EPR_BASE_URL}/search?package=${encodeURIComponent(packageName)}`;
      let results;
      try {
        results = await fetch(eprUrl);
      } catch (networkErr) {
        throw new Error(
          `Network error while reaching Elastic Package Registry: ${networkErr.message}`
        );
      }

      if (!results.ok) {
        const body = await results.text().catch(() => "");
        throw new Error(
          `Failed to query Elastic Package Registry (HTTP ${results.status}): ${body}`.trim()
        );
      }

      const data = await results.json();

      if (!Array.isArray(data) || data.length === 0) {
        throw new Error(`No packages found for "${packageName}" in the Elastic Package Registry.`);
      }

      const version = data[0]?.version;
      if (!version) {
        throw new Error(
          `Could not parse version from Elastic Package Registry response for "${packageName}".`
        );
      }

      return version;
    },
  };
}
