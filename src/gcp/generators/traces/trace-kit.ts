import type { EcsDocument } from "../helpers.js";

export const APM_DS = { type: "traces", dataset: "apm", namespace: "default" } as const;

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
    version: "1.0.0",
    language: { name: language },
    ...(opts?.framework ? { framework: { name: opts.framework } } : {}),
    ...(opts?.runtimeName
      ? { runtime: { name: opts.runtimeName, version: opts.runtimeVersion ?? "" } }
      : {}),
  };
}
