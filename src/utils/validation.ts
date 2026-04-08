/**
 * Input validation for Elastic Cloud connection form fields.
 */

const API_KEY_MIN_LENGTH = 20;

/** Index prefix: alphanumeric, hyphens, underscores only; 1–80 chars. */
const INDEX_PREFIX_REGEX = /^[a-zA-Z0-9_-]{1,80}$/;

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

/**
 * Validates Elasticsearch / Elastic Cloud URL.
 */
export function validateElasticUrl(value: unknown): ValidationResult {
  if (!value || typeof value !== "string") {
    return { valid: false, message: "Elasticsearch URL is required." };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { valid: false, message: "Elasticsearch URL is required." };
  }
  try {
    const u = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    if (u.protocol !== "https:") {
      return { valid: false, message: "URL must use HTTPS." };
    }
    if (!u.hostname || u.hostname.length < 4) {
      return { valid: false, message: "Invalid hostname." };
    }
    if (!u.hostname.includes(".")) {
      return {
        valid: false,
        message: "Enter a valid Elasticsearch URL (hostname should contain a domain).",
      };
    }
    return { valid: true };
  } catch {
    return {
      valid: false,
      message: "Enter a valid URL (e.g. https://my-deployment.es.us-east-1.aws.elastic.cloud).",
    };
  }
}

/**
 * Validates Elastic API key (base64-like, minimum length).
 */
export function validateApiKey(value: unknown): ValidationResult {
  if (value == null) {
    return { valid: false, message: "API key is required." };
  }
  const s = String(value).trim();
  if (!s) {
    return { valid: false, message: "API key is required." };
  }
  if (s.length < API_KEY_MIN_LENGTH) {
    return { valid: false, message: "API key is too short (check it’s the full base64 key)." };
  }
  if (!/^[A-Za-z0-9+/=_-]+$/.test(s)) {
    return { valid: false, message: "API key contains invalid characters." };
  }
  return { valid: true };
}

/**
 * Tests connectivity to an Elasticsearch cluster via the proxy.
 * Sends a lightweight GET / request and validates the response.
 * Returns { valid: true, version } on success or { valid: false, message } on failure.
 */
export async function testConnection(
  elasticUrl: string,
  apiKey: string
): Promise<ValidationResult & { version?: string }> {
  try {
    const url = elasticUrl.replace(/\/$/, "");
    const res = await fetch(`/proxy/_bulk`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-ndjson",
        "x-elastic-url": url,
        "x-elastic-key": apiKey,
      },
      // Send empty body — Elasticsearch responds with an error but proves connectivity + auth
      body: '{"index":{"_index":"_test_connection_probe"}}\n{"@timestamp":"2024-01-01T00:00:00Z"}\n',
    });
    if (res.status === 401 || res.status === 403) {
      return { valid: false, message: "Authentication failed — check your API key." };
    }
    if (res.status === 502 || res.status === 504) {
      const json = await res.json().catch(() => ({}));
      return {
        valid: false,
        message: `Cannot reach Elasticsearch — ${(json as Record<string, string>).error || res.statusText}`,
      };
    }
    // Any 2xx or even a 400 (bad index) means the cluster is reachable and auth works
    return { valid: true };
  } catch (e) {
    return {
      valid: false,
      message: `Connection failed — ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/**
 * Validates index prefix (data stream / index name prefix).
 */
export function validateIndexPrefix(value: unknown): ValidationResult {
  if (value == null) {
    return { valid: false, message: "Index prefix is required." };
  }
  const s = String(value).trim();
  if (!s) {
    return { valid: false, message: "Index prefix is required." };
  }
  if (!INDEX_PREFIX_REGEX.test(s)) {
    return {
      valid: false,
      message: "Use only letters, numbers, hyphens, and underscores (1–80 characters).",
    };
  }
  if (/^[-_]|[-_]$/.test(s)) {
    return {
      valid: false,
      message: "Index prefix cannot start or end with a hyphen or underscore.",
    };
  }
  return { valid: true };
}
