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

/** Hostnames where HTTP is allowed (local Elasticsearch). */
function isLocalDevHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "0.0.0.0" ||
    h === "::1" ||
    h.startsWith("[::1]") ||
    h === "[::1]"
  );
}

/**
 * Validates Elasticsearch / Elastic Cloud URL.
 * HTTPS is required except on localhost-style hosts, where HTTP is allowed for local clusters.
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
    if (u.protocol !== "https:" && u.protocol !== "http:") {
      return { valid: false, message: "URL must use HTTP or HTTPS." };
    }
    if (u.protocol === "http:" && !isLocalDevHost(u.hostname)) {
      return {
        valid: false,
        message:
          "HTTP is only allowed for local development (e.g. http://localhost:9200). Use HTTPS elsewhere.",
      };
    }
    if (!u.hostname || u.hostname.length < 2) {
      return { valid: false, message: "Invalid hostname." };
    }
    const relaxedLocal = isLocalDevHost(u.hostname);
    if (!relaxedLocal && u.hostname.length < 4) {
      return { valid: false, message: "Invalid hostname." };
    }
    if (!relaxedLocal && !u.hostname.includes(".")) {
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
 * Uses GET / on the cluster (read-only, no index footprint).
 */
export async function testConnection(
  elasticUrl: string,
  apiKey: string
): Promise<ValidationResult & { version?: string; isServerless?: boolean }> {
  try {
    const url = elasticUrl.replace(/\/$/, "");
    const res = await fetch(`/proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-elastic-url": url,
        "x-elastic-key": apiKey,
        "x-elastic-path": "/",
        "x-elastic-method": "GET",
      },
      body: "",
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
    if (res.status < 200 || res.status >= 300) {
      return {
        valid: false,
        message: `Unexpected response (${res.status}) — check the URL and cluster availability.`,
      };
    }
    let version: string | undefined;
    let isServerless: boolean | undefined;
    try {
      const data = (await res.json()) as {
        version?: { number?: string; build_flavor?: string };
      };
      const n = data?.version?.number;
      if (typeof n === "string" && n.length > 0) version = n;
      if (data?.version?.build_flavor === "serverless") isServerless = true;
    } catch {
      /* non-JSON body — still connected */
    }
    return {
      valid: true,
      ...(version ? { version } : {}),
      ...(isServerless ? { isServerless } : {}),
    };
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
