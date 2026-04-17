import type { EcsDocument } from "../helpers.js";

export const APM_DS = { type: "traces", dataset: "apm", namespace: "default" } as const;

export type AzureOtelLang = "nodejs" | "python" | "java" | "go" | "dotnet";

const SDK_VERSIONS: Record<AzureOtelLang, string> = {
  nodejs: "1.30.1",
  python: "1.29.0",
  java: "2.12.0",
  go: "1.32.0",
  dotnet: "1.31.0",
};

export function azureOtelMeta(lang: AzureOtelLang) {
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

export function appInsightsMeta(
  traceId: string,
  parentId: string | undefined,
  spanId: string | undefined,
  name: string | undefined
) {
  const opId = traceId.replace(/-/g, "").slice(0, 32);
  const opPar = parentId ? parentId.replace(/-/g, "").slice(0, 32) : "";
  return {
    applicationInsights: {
      operation_Id: opId,
      operation_ParentId: opPar,
      ...(spanId ? { id: spanId.replace(/-/g, "").slice(0, 16) } : {}),
      ...(name ? { name } : {}),
    },
  };
}

export function azureServiceBase(
  name: string,
  environment: string | undefined,
  language: string,
  opts?: { framework?: string; runtimeName?: string; runtimeVersion?: string }
) {
  return {
    name,
    ...(environment ? { environment } : {}),
    version: "1.0.0",
    language: { name: language },
    ...(opts?.framework ? { framework: { name: opts.framework } } : {}),
    ...(opts?.runtimeName
      ? { runtime: { name: opts.runtimeName, version: opts.runtimeVersion ?? "" } }
      : {}),
  };
}

export function enrichAzureTraceDoc(
  doc: Record<string, unknown>,
  traceId: string,
  lang: AzureOtelLang = "nodejs"
): EcsDocument {
  const spanId = (doc.span as { id?: string } | undefined)?.id;
  const txId = (doc.transaction as { id?: string } | undefined)?.id;
  const parentId = (doc.parent as { id?: string } | undefined)?.id;
  const name =
    (doc.span as { name?: string } | undefined)?.name ??
    (doc.transaction as { name?: string } | undefined)?.name;
  return {
    ...doc,
    data_stream: APM_DS,
    ...azureOtelMeta(lang),
    ...appInsightsMeta(traceId, parentId, spanId ?? txId, name),
  } as EcsDocument;
}

export function azureCustomDimensions(
  region: string,
  resourceGroup: string,
  subscriptionId: string,
  extra?: Record<string, string>
) {
  return {
    customDimensions: {
      azure_region: region,
      azure_resource_group: resourceGroup,
      azure_subscription_id: subscriptionId,
      ...extra,
    },
  };
}
