import type { EcsDocument } from "../helpers.js";
import { rand } from "../helpers.js";

export const APM_DS = { type: "traces", dataset: "apm", namespace: "default" } as const;

const SERVICE_VERSIONS = ["2.14.3", "2.14.2", "2.13.8", "3.0.1", "1.42.0", "2026.04.1"] as const;

const GCP_SPAN_RPC_FAIL_CODES = [
  "INTERNAL",
  "DEADLINE_EXCEEDED",
  "UNAVAILABLE",
  "RESOURCE_EXHAUSTED",
] as const;

const GCP_SPAN_ERROR_MESSAGES = [
  "upstream connect error or disconnect/reset before headers",
  "deadline exceeded after 30.0s waiting for connection",
  "connection reset by peer while reading response body",
  "quota exceeded for project: rate limit on concurrent requests",
  "permission denied on resource: caller lacks iam.serviceAccounts.actAs",
  "backend service unavailable: no healthy instances in instance group",
  "context deadline exceeded while waiting for metadata server",
  "failed to authenticate: invalid OAuth2 access token",
] as const;

export function gcpSpanFailureLabels(message?: string): Record<string, string> {
  return {
    "gcp.rpc.status_code": rand(GCP_SPAN_RPC_FAIL_CODES),
    "error.type": "gcp",
    "error.message": message ?? rand(GCP_SPAN_ERROR_MESSAGES),
  };
}

export type GcpOtelLang = "nodejs" | "python" | "java" | "go" | "cpp";

const SDK_VERSIONS: Record<GcpOtelLang, string> = {
  nodejs: "1.30.1",
  python: "1.29.0",
  java: "2.12.0",
  go: "1.32.0",
  cpp: "1.18.0",
};

export function gcpOtelMeta(lang: GcpOtelLang) {
  return {
    ecs: { version: "8.11.0" },
    input: { type: "opentelemetry" },
    agent: { name: `opentelemetry/${lang}`, version: "1.x" },
    telemetry: {
      sdk: { name: "opentelemetry", language: lang, version: SDK_VERSIONS[lang] },
      distro: { name: "elastic", version: "8.18.0" },
      otel_pipeline: {
        hop: "otel_collector",
        export_protocol: "otlp",
        destination: "elastic_managed",
      },
    },
  };
}

export function gcpCloudTraceMeta(projectId: string, traceId: string, spanId?: string) {
  return {
    gcpCloudTrace: {
      trace: `projects/${projectId}/traces/${traceId}`,
      ...(spanId ? { spanId } : {}),
    },
  };
}

export function enrichGcpTraceDoc(
  doc: Record<string, unknown>,
  projectId: string,
  traceId: string,
  lang: GcpOtelLang = "nodejs"
): EcsDocument {
  const spanId = (doc.span as { id?: string } | undefined)?.id;
  const txId = (doc.transaction as { id?: string } | undefined)?.id;
  return {
    ...doc,
    data_stream: APM_DS,
    ...gcpOtelMeta(lang),
    ...gcpCloudTraceMeta(projectId, traceId, spanId ?? txId),
  } as EcsDocument;
}

export function gcpServiceBase(
  name: string,
  environment: string,
  language: string,
  opts?: { framework?: string; runtimeName?: string; runtimeVersion?: string }
) {
  return {
    name,
    environment,
    version: rand(SERVICE_VERSIONS),
    language: { name: language },
    ...(opts?.framework ? { framework: { name: opts.framework } } : {}),
    ...(opts?.runtimeName
      ? { runtime: { name: opts.runtimeName, version: opts.runtimeVersion ?? "" } }
      : {}),
  };
}
