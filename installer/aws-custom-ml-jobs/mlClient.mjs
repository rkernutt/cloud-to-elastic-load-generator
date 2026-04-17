/**
 * Elasticsearch ML API client (shared by ML installer and loadgen integration packs).
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

    if (res.status === 410) {
      return { _not_available: true, status: 410 };
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
    async testConnection() {
      return request("GET", "/");
    },

    async getMlInfo() {
      return request("GET", "/_ml/info");
    },

    async getJob(jobId) {
      return request("GET", `/_ml/anomaly_detectors/${encodeURIComponent(jobId)}`);
    },

    async putJob(jobId, body) {
      return request("PUT", `/_ml/anomaly_detectors/${encodeURIComponent(jobId)}`, body);
    },

    async putDatafeed(jobId, body) {
      return request("PUT", `/_ml/datafeeds/${encodeURIComponent(`datafeed-${jobId}`)}`, body);
    },

    async openJob(jobId) {
      return request("POST", `/_ml/anomaly_detectors/${encodeURIComponent(jobId)}/_open`);
    },

    async startDatafeed(jobId) {
      return request("POST", `/_ml/datafeeds/${encodeURIComponent(`datafeed-${jobId}`)}/_start`);
    },

    async stopDatafeed(jobId) {
      return request("POST", `/_ml/datafeeds/${encodeURIComponent(`datafeed-${jobId}`)}/_stop`);
    },

    async closeJob(jobId) {
      return request("POST", `/_ml/anomaly_detectors/${encodeURIComponent(jobId)}/_close`);
    },

    async deleteDatafeed(jobId) {
      return request("DELETE", `/_ml/datafeeds/${encodeURIComponent(`datafeed-${jobId}`)}`);
    },

    async deleteJob(jobId) {
      return request("DELETE", `/_ml/anomaly_detectors/${encodeURIComponent(jobId)}`);
    },
  };
}
