/**
 * OpenTelemetry ingestion variants for synthetic documents.
 * Models EDOT Collector vs CSP-managed collector exporting to EDOT Gateway (OTLP).
 */

import { randHex } from "../aws/generators/traces/helpers.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseDoc = Record<string, any>;

export const OTEL_PIPELINE_SOURCES = new Set([
  "otel",
  "otel-edot-collector",
  "otel-csp-edot-gateway",
]);

export function isOtelPipelineSource(source: string): boolean {
  return OTEL_PIPELINE_SOURCES.has(source);
}

const OTEL_COLLECTOR_SEMVER = "0.115.0";

type CloudKind = "aws" | "gcp" | "azure";

/**
 * Build `telemetry` object for logs when ingestion uses an OTel pipeline override.
 * Fill-don't-clobber: preserves generator-provided `telemetry.*` where set.
 */
export function buildOtelLogTelemetry(
  doc: LooseDoc,
  cloud: CloudKind,
  source: string,
  elasticStackVersion: string
): LooseDoc {
  const prev = doc.telemetry && typeof doc.telemetry === "object" ? { ...doc.telemetry } : {};
  const svcLang =
    typeof doc.service?.language?.name === "string" ? doc.service.language.name : undefined;
  const defaultSdk = {
    name: "opentelemetry",
    language: svcLang ?? "go",
    version:
      svcLang === "python"
        ? "1.29.0"
        : svcLang === "nodejs"
          ? "1.30.1"
          : svcLang === "java"
            ? "2.12.0"
            : svcLang === "go"
              ? "1.32.0"
              : "1.31.0",
  };
  const sdk = prev.sdk ?? defaultSdk;

  if (source === "otel-edot-collector") {
    return {
      ...prev,
      sdk,
      distro: prev.distro ?? { name: "elastic", version: elasticStackVersion },
      otel_pipeline: {
        ...(typeof prev.otel_pipeline === "object" ? prev.otel_pipeline : {}),
        hop: "edot_collector",
        export_protocol: "otlp",
        destination: "elastic_managed",
      },
    };
  }

  if (source === "otel-csp-edot-gateway") {
    const distro =
      prev.distro ??
      (cloud === "aws"
        ? { name: "ADOT", version: "0.41.1" }
        : cloud === "gcp"
          ? { name: "otelopscol", version: "1.7.0" }
          : { name: "Azure Monitor Distro", version: "1.2.0" });

    const collectorFamily =
      cloud === "aws" ? "ADOT" : cloud === "gcp" ? "otelopscol" : "Azure Monitor Distro";

    return {
      ...prev,
      sdk,
      distro,
      otel_pipeline: {
        ...(typeof prev.otel_pipeline === "object" ? prev.otel_pipeline : {}),
        hop: "csp_managed_collector",
        collector_family: collectorFamily,
        export_protocol: "otlp",
        destination: "edot_gateway",
      },
    };
  }

  // Generic "otel"
  return {
    ...prev,
    sdk,
    distro: prev.distro ?? { name: "elastic", version: elasticStackVersion },
    otel_pipeline: {
      ...(typeof prev.otel_pipeline === "object" ? prev.otel_pipeline : {}),
      hop: "otel_collector",
      export_protocol: "otlp",
      destination: "elastic_managed",
    },
  };
}

export function otelCollectorAgentName(cloud: CloudKind, source: string, region: string): string {
  if (source === "otel-edot-collector") return `edot-collector-${region}`;
  if (source === "otel-csp-edot-gateway") {
    if (cloud === "aws") return `adot-collector-${region}`;
    if (cloud === "gcp") return `otelopscol-collector-${region}`;
    return `azure-monitor-distro-collector-${region}`;
  }
  return `otel-collector-${region}`;
}

export function otelCollectorAgentVersion(): string {
  return OTEL_COLLECTOR_SEMVER;
}

/** 32-char hex → lowercase GUID shape (Application Insights style operation ids). */
function hex32ToGuidLoose(hex: string): string {
  const h = hex.replace(/-/g, "").toLowerCase().slice(0, 32).padEnd(32, "0");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function tracePrimarySpanId(doc: LooseDoc): string | undefined {
  return doc.transaction?.id ?? doc.span?.id;
}

/**
 * Align CSP correlation `labels` with the selected OTel ingestion mode (traces and logs).
 * Mutates `doc` in place.
 */
export function patchOtelIngestionLabels(
  doc: LooseDoc,
  cloud: CloudKind,
  ingestionSource: string
): void {
  if (!isOtelPipelineSource(ingestionSource)) return;

  const cloneLabels = (): LooseDoc =>
    doc.labels && typeof doc.labels === "object" ? { ...doc.labels } : ({} as LooseDoc);

  if (cloud === "aws") {
    const labels = cloneLabels();
    if (ingestionSource === "otel-csp-edot-gateway") {
      if (!labels["aws.xray.trace_id"]) {
        labels["aws.xray.trace_id"] = `1-${randHex(8)}-${randHex(24)}`;
      }
      if (!labels["aws.xray.segment_id"]) {
        labels["aws.xray.segment_id"] = randHex(16);
      }
      labels["aws.otel.csp_distro"] = "ADOT";
      doc.labels = labels;
    } else {
      delete labels["aws.xray.trace_id"];
      delete labels["aws.xray.segment_id"];
      delete labels["aws.otel.csp_distro"];
      if (Object.keys(labels).length === 0) delete doc.labels;
      else doc.labels = labels;
    }
  } else if (cloud === "gcp") {
    const labels = cloneLabels();
    if (ingestionSource === "otel-csp-edot-gateway") {
      const tid = typeof doc.trace?.id === "string" ? doc.trace.id : randHex(32);
      const sid = tracePrimarySpanId(doc) ?? randHex(16);
      if (!labels["gcp.cloud_trace.trace_id"]) labels["gcp.cloud_trace.trace_id"] = tid;
      if (!labels["gcp.cloud_trace.span_id"]) labels["gcp.cloud_trace.span_id"] = sid;
      labels["gcp.google_cloud_otel.propagator"] = "cloud_trace_context";
      labels["gcp.otel.csp_distro"] = "otelopscol";
      doc.labels = labels;
    } else {
      delete labels["gcp.cloud_trace.trace_id"];
      delete labels["gcp.cloud_trace.span_id"];
      delete labels["gcp.google_cloud_otel.propagator"];
      delete labels["gcp.otel.csp_distro"];
      if (Object.keys(labels).length === 0) delete doc.labels;
      else doc.labels = labels;
    }
  } else {
    /* azure */
    const labels = cloneLabels();
    if (ingestionSource === "otel-csp-edot-gateway") {
      const tid = typeof doc.trace?.id === "string" ? doc.trace.id : randHex(32);
      const sid = tracePrimarySpanId(doc) ?? randHex(16);
      if (!labels["azure.application_insights.operation_id"]) {
        labels["azure.application_insights.operation_id"] = hex32ToGuidLoose(tid);
      }
      if (!labels["azure.monitor.trace_id"]) labels["azure.monitor.trace_id"] = tid;
      if (!labels["azure.monitor.span_id"]) labels["azure.monitor.span_id"] = sid;
      labels["azure.monitor.opentelemetry.dist"] = "Azure Monitor Distro";
      doc.labels = labels;
    } else {
      delete labels["azure.application_insights.operation_id"];
      delete labels["azure.monitor.trace_id"];
      delete labels["azure.monitor.span_id"];
      delete labels["azure.monitor.opentelemetry.dist"];
      if (Object.keys(labels).length === 0) delete doc.labels;
      else doc.labels = labels;
    }
  }
}

/**
 * After APM/OTel trace docs are assembled, align `telemetry`, `input`, and CSP correlation
 * (`labels`) with the selected OTel ingestion mode. Mutates `doc` in place.
 */
export function applyOtelTraceIngestionPatch(
  doc: LooseDoc,
  cloud: CloudKind,
  ingestionSource: string,
  elasticStackVersion: string
): void {
  if (!isOtelPipelineSource(ingestionSource)) return;

  doc.telemetry = buildOtelLogTelemetry(doc, cloud, ingestionSource, elasticStackVersion);
  patchOtelIngestionLabels(doc, cloud, ingestionSource);

  doc.input =
    doc.input && typeof doc.input === "object"
      ? { ...doc.input, type: "opentelemetry" }
      : { type: "opentelemetry" };
}
