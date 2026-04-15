/**
 * Elastic metadata enrichment for GCP and Azure synthetic documents.
 * Avoids AWS-only fields (S3, CloudWatch, event.module aws, etc.).
 */

import { randId } from "./index";
import type { EnrichOptions } from "./enrich";
import { enrichDocument as enrichAwsDocument } from "./enrich";
import {
  applyOtelTraceIngestionPatch,
  buildOtelLogTelemetry,
  isOtelPipelineSource,
  otelCollectorAgentName,
  otelCollectorAgentVersion,
  patchOtelIngestionLabels,
} from "./otelPipeline";
import {
  attachAzureResourceLogEnvelope,
  attachGcpLoggingApiEnvelope,
} from "./cloudNativeLogEnvelope";
import {
  attachAzureApplicationInsightsFragment,
  attachAzureMonitorMetricFragment,
  attachGcpCloudTraceFragment,
  attachGcpMonitoringTimeSeriesFragment,
} from "./cloudNativeMetricsTraces";
import { clampGlobalIngestionOverride } from "./ingestionCompatibility";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseDoc = Record<string, any>;

type MetricsIntegrationKind = "azure_monitor" | "o365_metrics";

/** When parent generators blend flavors, derive the actual gcp.* block for cloud-native envelopes. */
function inferGcpFlavorServiceId(doc: LooseDoc, selectedId: string): string {
  if (!doc.gcp || typeof doc.gcp !== "object") return selectedId;
  const keys = Object.keys(doc.gcp).filter((k) => k !== "metrics" && k !== "labels");
  if (keys.length !== 1) return selectedId;
  return keys[0]!.replace(/_/g, "-");
}

function inferAzureFlavorServiceId(doc: LooseDoc, selectedId: string): string {
  if (!doc.azure || typeof doc.azure !== "object") return selectedId;
  const keys = Object.keys(doc.azure).filter((k) => k !== "metrics" && k !== "labels");
  if (keys.length !== 1) return selectedId;
  return keys[0]!.replace(/_/g, "-");
}

const ECS_VERSION = "8.11.0";
const AGENT_VERSION = "8.18.0";

export interface GcpAzureEnrichContext {
  cloudModule: "gcp" | "azure";
  elasticDatasetMap: Record<string, string>;
  elasticMetricsDatasetMap: Record<string, string>;
  serviceIngestionDefaults: Record<string, string>;
  /** Must include keys used by services; fallback key `default` optional */
  ingestionMeta: Record<string, { label: string; color: string; inputType?: string }>;
  /** Region pool when doc.cloud.region missing */
  regions: readonly string[];
  /** Default ingestion when service not in defaults */
  defaultIngestion: string;
  /**
   * Matches {@link CloudAppConfig.fallbackIngestionSource} for Azure — unknown services use
   * Monitor-style metadata on the Start page; enrich uses this before `defaultIngestion`.
   */
  ingestionUiFallback?: string;
  /**
   * When `o365_metrics`, synthetic metric docs use the Office 365 Metrics integration shape
   * (filebeat / CEL, `event.module` o365_metrics) instead of Azure Monitor metricbeat.
   * Prefer `metricsIntegrationByServiceId` for mixed Azure Monitor + o365_metrics in one config.
   */
  metricsIntegration?: "azure_monitor" | "o365_metrics";
  /** Per–service-id override for metrics integration (takes precedence over `metricsIntegration`). */
  metricsIntegrationByServiceId?: Record<string, "o365_metrics">;
}

function resolveMetricsIntegration(
  ctx: GcpAzureEnrichContext,
  eventType: string,
  flavorId: string,
  serviceId: string
): MetricsIntegrationKind {
  if (eventType !== "metrics") return "azure_monitor";
  const mapped =
    ctx.metricsIntegrationByServiceId?.[flavorId] ?? ctx.metricsIntegrationByServiceId?.[serviceId];
  if (mapped === "o365_metrics") return "o365_metrics";
  if (ctx.metricsIntegration === "o365_metrics") return "o365_metrics";
  return "azure_monitor";
}

function resolveDataset(
  ctx: GcpAzureEnrichContext,
  serviceId: string,
  eventType: string,
  metricsKind: MetricsIntegrationKind
): string {
  if (eventType === "metrics") {
    const fromMap = ctx.elasticMetricsDatasetMap[serviceId] ?? ctx.elasticDatasetMap[serviceId];
    if (fromMap) return fromMap;
    if (metricsKind === "o365_metrics") {
      return `o365_metrics.${serviceId.replace(/-/g, "_")}`;
    }
    return `${ctx.cloudModule}.${serviceId.replace(/-/g, "_")}`;
  }
  return ctx.elasticDatasetMap[serviceId] ?? `${ctx.cloudModule}.${serviceId.replace(/-/g, "_")}`;
}

function resolveSource(
  ctx: GcpAzureEnrichContext,
  flavorId: string,
  uiServiceId: string,
  override?: string
): string {
  const cloudId = ctx.cloudModule === "gcp" ? "gcp" : "azure";
  return clampGlobalIngestionOverride(cloudId, flavorId, uiServiceId, override, {
    serviceIngestionDefaults: ctx.serviceIngestionDefaults,
    defaultIngestion: ctx.defaultIngestion,
    ingestionUiFallback: ctx.ingestionUiFallback,
  }).source;
}

function buildInputType(ctx: GcpAzureEnrichContext, source: string): string | undefined {
  return ctx.ingestionMeta[source]?.inputType;
}

function buildAgentMeta(
  ctx: GcpAzureEnrichContext,
  source: string,
  eventType: string,
  region: string,
  metricsKind: MetricsIntegrationKind
): LooseDoc {
  if (eventType === "traces") return {};
  if (eventType === "metrics") {
    if (metricsKind === "o365_metrics") {
      const agentId = randId(36).toLowerCase();
      return {
        type: "filebeat",
        version: AGENT_VERSION,
        name: `elastic-agent-o365-${region}`,
        id: agentId,
        ephemeral_id: randId(36).toLowerCase(),
      };
    }
    return {
      type: "metricbeat",
      version: AGENT_VERSION,
      name: `metricbeat-${ctx.cloudModule}-${region}`,
      ephemeral_id: randId(36).toLowerCase(),
    };
  }
  if (isOtelPipelineSource(source)) {
    return {
      type: "otel",
      version: otelCollectorAgentVersion(),
      name: otelCollectorAgentName(ctx.cloudModule, source, region),
    };
  }
  return {
    type: "elastic-agent",
    version: AGENT_VERSION,
    name: `elastic-agent-${ctx.cloudModule}-${region}`,
    id: randId(36).toLowerCase(),
  };
}

/**
 * Enrich GCP or Azure docs for Agent / integration-shaped metadata.
 */
export function enrichGcpAzureDocument(
  doc: LooseDoc,
  opts: EnrichOptions,
  ctx: GcpAzureEnrichContext
): LooseDoc {
  const { serviceId, eventType } = opts;
  const flavorId =
    ctx.cloudModule === "gcp"
      ? inferGcpFlavorServiceId(doc, serviceId)
      : inferAzureFlavorServiceId(doc, serviceId);
  const metricsKind = resolveMetricsIntegration(ctx, eventType, flavorId, serviceId);
  const source = resolveSource(ctx, flavorId, serviceId, opts.ingestionSource);
  const resolvedRegion =
    doc.cloud?.region ?? ctx.regions[Math.floor(Math.random() * ctx.regions.length)];
  const dataset = resolveDataset(ctx, flavorId, eventType, metricsKind);

  const ecs = doc.ecs ?? { version: ECS_VERSION };
  const dsType = eventType === "metrics" ? "metrics" : eventType === "traces" ? "traces" : "logs";
  const dataStream = doc.data_stream ?? {
    type: dsType,
    dataset,
    namespace: "default",
  };

  const agentMeta = doc.agent ?? buildAgentMeta(ctx, source, eventType, resolvedRegion, metricsKind);
  const inputType = buildInputType(
    ctx,
    eventType === "traces" ? (isOtelPipelineSource(source) ? source : "otel") : source
  );
  const input = doc.input ?? (inputType ? { type: inputType } : undefined);

  const eventModule =
    doc.event?.module ??
    (eventType === "metrics" && metricsKind === "o365_metrics" ? "o365_metrics" : ctx.cloudModule);
  const event = {
    ...doc.event,
    module: eventModule,
    dataset: doc.event?.dataset || dataset,
  };

  const baseline: LooseDoc = {
    cloud: {
      ...(typeof doc.cloud === "object" && doc.cloud !== null ? doc.cloud : {}),
      region: resolvedRegion,
    },
  };
  if (eventType === "logs" && !doc.service?.name) {
    baseline.service = {
      ...doc.service,
      name: flavorId,
      type: doc.service?.type ?? ctx.cloudModule,
    };
  }
  if (eventType === "logs") {
    const levelFromOutcome = (): string => {
      const o = doc.event?.outcome;
      if (o === "failure") return "error";
      if (o === "success") return "info";
      return "info";
    };
    if (!doc.log) {
      baseline.log = { level: levelFromOutcome() };
    } else if (typeof doc.log === "object" && doc.log !== null && doc.log.level == null) {
      baseline.log = { ...doc.log, level: levelFromOutcome() };
    }
  }

  let otelFields: LooseDoc = {};
  if (isOtelPipelineSource(source) && eventType === "logs") {
    otelFields = {
      telemetry: buildOtelLogTelemetry(doc, ctx.cloudModule, source, AGENT_VERSION),
    };
  }

  const enriched: LooseDoc = {
    ...doc,
    ...baseline,
    ...otelFields,
    ecs,
    data_stream: dataStream,
    event,
  };

  if (Object.keys(agentMeta).length > 0) enriched.agent = agentMeta;
  if (input) enriched.input = input;

  if (
    eventType === "metrics" &&
    metricsKind === "o365_metrics" &&
    enriched.agent?.id &&
    !enriched.elastic_agent
  ) {
    enriched.elastic_agent = {
      id: enriched.agent.id,
      version: AGENT_VERSION,
      snapshot: false,
    };
  }

  if (eventType === "logs") {
    const projectId = enriched.cloud?.project?.id ?? "project-unknown";
    const logRegion =
      enriched.cloud?.region ?? ctx.regions[Math.floor(Math.random() * ctx.regions.length)];
    if (!isOtelPipelineSource(source)) {
      if (ctx.cloudModule === "gcp") {
        attachGcpLoggingApiEnvelope(
          enriched,
          inferGcpFlavorServiceId(enriched, serviceId),
          projectId,
          logRegion
        );
      } else {
        const subId = enriched.cloud?.account?.id ?? "00000000-0000-0000-0000-000000000000";
        attachAzureResourceLogEnvelope(
          enriched,
          inferAzureFlavorServiceId(enriched, serviceId),
          subId
        );
      }
    }
  }

  if (eventType === "metrics" && metricsKind !== "o365_metrics") {
    if (ctx.cloudModule === "gcp") {
      const projectId = enriched.cloud?.project?.id ?? "project-unknown";
      const metricRegion =
        enriched.cloud?.region ?? ctx.regions[Math.floor(Math.random() * ctx.regions.length)];
      attachGcpMonitoringTimeSeriesFragment(
        enriched,
        inferGcpFlavorServiceId(enriched, serviceId),
        projectId,
        metricRegion
      );
    } else {
      const subId = enriched.cloud?.account?.id ?? "00000000-0000-0000-0000-000000000000";
      attachAzureMonitorMetricFragment(
        enriched,
        inferAzureFlavorServiceId(enriched, serviceId),
        subId
      );
    }
  }

  if (eventType === "traces") {
    if (ctx.cloudModule === "gcp") {
      const projectId = enriched.cloud?.project?.id ?? "project-unknown";
      attachGcpCloudTraceFragment(enriched, projectId);
    } else {
      attachAzureApplicationInsightsFragment(enriched);
    }
  }

  if (eventType === "logs" && isOtelPipelineSource(source)) {
    patchOtelIngestionLabels(enriched, ctx.cloudModule, source);
  }

  if (eventType === "traces" && isOtelPipelineSource(source)) {
    applyOtelTraceIngestionPatch(enriched, ctx.cloudModule, source, AGENT_VERSION);
  }

  return enriched;
}

export type CloudEnrichContext =
  | { kind: "aws" }
  | { kind: "gcp-azure"; ctx: GcpAzureEnrichContext };

/** Unified enricher for load generator UIs — AWS delegates to existing enrich.ts */
export function enrichForCloud(
  doc: LooseDoc,
  opts: EnrichOptions,
  cloud: CloudEnrichContext
): LooseDoc {
  if (cloud.kind === "aws") return enrichAwsDocument(doc, opts);
  return enrichGcpAzureDocument(doc, opts, cloud.ctx);
}
