/**
 * Elasticsearch API client for the custom pipeline installer.
 * Uses native fetch — no external dependencies.
 */

export function createElasticClient(baseUrl, apiKey) {
  const base = baseUrl.replace(/\/$/, "");
  const headers = {
    "Content-Type": "application/json",
    Authorization: `ApiKey ${apiKey}`,
  };

  async function request(method, path, body) {
    const url = `${base}${path}`;
    const options = { method, headers };
    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }

    const res = await fetch(url, options);

    if (res.status === 404) {
      return null;
    }

    if (!res.ok) {
      let text;
      try {
        text = await res.text();
      } catch {
        text = "(unable to read response body)";
      }
      throw new Error(
        `Elasticsearch request failed: ${method} ${path} → HTTP ${res.status}\n${text}`
      );
    }

    return res.json();
  }

  return {
    /**
     * GET /_ingest/pipeline/{pipelineId}
     * Returns the pipeline object or null if not found (404).
     */
    async getPipeline(pipelineId) {
      return request("GET", `/_ingest/pipeline/${encodeURIComponent(pipelineId)}`);
    },

    /**
     * PUT /_ingest/pipeline/{pipelineId}
     * Installs or replaces an ingest pipeline.
     * Returns the Elasticsearch response JSON.
     */
    async putPipeline(pipelineId, body) {
      return request("PUT", `/_ingest/pipeline/${encodeURIComponent(pipelineId)}`, body);
    },

    /**
     * DELETE /_ingest/pipeline/{pipelineId}
     * Deletes an ingest pipeline. Returns null if not found (404).
     */
    async deletePipeline(pipelineId) {
      return request("DELETE", `/_ingest/pipeline/${encodeURIComponent(pipelineId)}`);
    },

    /**
     * GET /
     * Verifies connectivity.  Returns cluster info or throws on failure.
     */
    async testConnection() {
      return request("GET", "/");
    },
  };
}
