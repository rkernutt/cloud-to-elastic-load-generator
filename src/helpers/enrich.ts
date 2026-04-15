/**
 * Shared document enrichment — adds Elastic integration metadata fields
 * (agent, ecs, data_stream, input, host, etc.) so generated documents match
 * what real Elastic Agent / Filebeat / Metricbeat output looks like.
 *
 * Fill-don't-overwrite: if a generator already set a field, we keep it.
 */

import { rand, randId, randIp, REGIONS } from "./index";
import { ELASTIC_DATASET_MAP, ELASTIC_METRICS_DATASET_MAP } from "../data/elasticMaps";
import { INGESTION_META } from "../data/ingestion";
import { clampGlobalIngestionOverride } from "./ingestionCompatibility";
import {
  applyOtelTraceIngestionPatch,
  buildOtelLogTelemetry,
  isOtelPipelineSource,
  otelCollectorAgentName,
  otelCollectorAgentVersion,
  patchOtelIngestionLabels,
} from "./otelPipeline";

// ─── Types ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseDoc = Record<string, any>;

export interface EnrichOptions {
  serviceId: string;
  /** Override ingestion source; clamped per service when incompatible */
  ingestionSource?: string;
  eventType: "logs" | "metrics" | "traces";
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ECS_VERSION = "8.11.0";
const AGENT_VERSION = "8.18.0";

/**
 * Services whose logs originate from compute hosts — these get `host.*` fields.
 */
const COMPUTE_SERVICES = new Set([
  "ec2",
  "ecs",
  "eks",
  "fargate",
  "lambda",
  "apprunner",
  "batch",
  "elasticbeanstalk",
  "lightsail",
  "outposts",
  "wavelength",
  "workspaces",
  "appstream",
  "gamelift",
  "mainframemodernization",
  "parallelcomputing",
  "evs",
  "simspaceweaver",
  "robomaker",
]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveDataset(serviceId: string, eventType: string): string {
  if (eventType === "metrics") {
    return (
      (ELASTIC_METRICS_DATASET_MAP as LooseDoc)[serviceId] ??
      (ELASTIC_DATASET_MAP as LooseDoc)[serviceId] ??
      `aws.${serviceId}`
    );
  }
  return (ELASTIC_DATASET_MAP as LooseDoc)[serviceId] || `aws.${serviceId}`;
}

function resolveSource(serviceId: string, override?: string): string {
  return clampGlobalIngestionOverride("aws", serviceId, serviceId, override, null).source;
}

function buildAgentMeta(source: string, eventType: string, region: string): LooseDoc {
  if (eventType === "traces") {
    // Traces keep the OTel agent block set by otelBlocks() — return nothing
    return {};
  }
  if (eventType === "metrics") {
    return {
      type: "metricbeat",
      version: AGENT_VERSION,
      name: `metricbeat-aws-${region}`,
      ephemeral_id: randId(36).toLowerCase(),
    };
  }
  // Logs — varies by ingestion source
  if (isOtelPipelineSource(source)) {
    return {
      type: "otel",
      version: otelCollectorAgentVersion(),
      name: otelCollectorAgentName("aws", source, region),
    };
  }
  switch (source) {
    case "agent":
      return {
        type: "elastic-agent",
        version: AGENT_VERSION,
        name: `elastic-agent-${region}`,
        id: randId(36).toLowerCase(),
      };
    default:
      return {
        type: "filebeat",
        version: AGENT_VERSION,
        name: `filebeat-aws-${region}`,
        ephemeral_id: randId(36).toLowerCase(),
      };
  }
}

function buildInputType(source: string): string | undefined {
  return (INGESTION_META as LooseDoc)[source]?.inputType;
}

// ─── Main enrichment function ────────────────────────────────────────────────

/**
 * Enrich a raw generator document with Elastic integration metadata.
 * Uses fill-don't-overwrite semantics — generator-set values are preserved.
 */
export function enrichDocument(doc: LooseDoc, opts: EnrichOptions): LooseDoc {
  const { serviceId, eventType } = opts;
  const source = resolveSource(serviceId, opts.ingestionSource);
  const region = doc.cloud?.region || rand(REGIONS);
  const accountId = doc.cloud?.account?.id || "814726593401";
  const dataset = resolveDataset(serviceId, eventType);

  // ── ecs.version ────────────────────────────────────────────────────────────
  const ecs = doc.ecs ?? { version: ECS_VERSION };

  // ── data_stream ────────────────────────────────────────────────────────────
  const dsType = eventType === "metrics" ? "metrics" : eventType === "traces" ? "traces" : "logs";
  const dataStream = doc.data_stream ?? {
    type: dsType,
    dataset,
    namespace: "default",
  };

  // ── agent ──────────────────────────────────────────────────────────────────
  const agentMeta = doc.agent ?? buildAgentMeta(source, eventType, region);

  // ── input.type ─────────────────────────────────────────────────────────────
  const inputType = buildInputType(
    eventType === "traces" ? (isOtelPipelineSource(source) ? source : "otel") : source
  );
  const input = doc.input ?? (inputType ? { type: inputType } : undefined);

  // ── event enrichment ───────────────────────────────────────────────────────
  const event = {
    ...doc.event,
    module: doc.event?.module || "aws",
    dataset: doc.event?.dataset || dataset,
  };

  // ── S3 / CloudWatch context (logs only) — skip synthetic pull-path fields for OTLP pipelines
  let awsContext: LooseDoc | undefined;
  if (eventType === "logs") {
    if (isOtelPipelineSource(source)) {
      awsContext = doc.aws && typeof doc.aws === "object" ? { ...doc.aws } : undefined;
    } else {
      const bucket = `aws-${serviceId}-logs-${accountId}`;
      const key = `AWSLogs/${accountId}/${serviceId}/${region}/${new Date().toISOString().slice(0, 10).replace(/-/g, "/")}/${serviceId}_${randId(20)}.log.gz`;
      const logGroup = `/aws/${serviceId}/logs`;
      const logStream = `${region}/${randId(8).toLowerCase()}`;

      awsContext = {
        ...doc.aws,
        s3: doc.aws?.s3 ?? {
          bucket: { name: bucket, arn: `arn:aws:s3:::${bucket}` },
          object: { key },
        },
        cloudwatch: doc.aws?.cloudwatch ?? {
          log_group: logGroup,
          log_stream: logStream,
          ingestion_time: new Date().toISOString(),
        },
      };

      if (source === "firehose") {
        awsContext!.firehose = doc.aws?.firehose ?? {
          arn: `arn:aws:firehose:${region}:${accountId}:deliverystream/aws-${serviceId}-stream`,
          request_id: randId(36).toLowerCase(),
        };
      }
    }
  }

  // ── ECS baseline fields (logs only) ────────────────────────────────────────
  const baseline: LooseDoc = {
    cloud: {
      ...(typeof doc.cloud === "object" && doc.cloud !== null ? doc.cloud : {}),
      region,
    },
  };
  if (eventType === "logs") {
    if (COMPUTE_SERVICES.has(serviceId) && !doc.host?.name) {
      baseline.host = {
        ...doc.host,
        name: `ip-${randIp().replace(/\./g, "-")}.ec2.internal`,
        hostname: `${serviceId}-${randId(8).toLowerCase()}`,
      };
    }
    if (!doc.service?.name) {
      baseline.service = {
        ...doc.service,
        name: serviceId,
        type: doc.service?.type ?? "aws",
      };
    }
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

  // ── OTel fields for otel-sourced logs ──────────────────────────────────────
  let otelFields: LooseDoc = {};
  if (isOtelPipelineSource(source) && eventType === "logs") {
    otelFields = {
      telemetry: buildOtelLogTelemetry(doc, "aws", source, AGENT_VERSION),
    };
  }

  // ── Assemble ───────────────────────────────────────────────────────────────
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
  if (awsContext) enriched.aws = awsContext;

  if (eventType === "logs" && isOtelPipelineSource(source)) {
    patchOtelIngestionLabels(enriched, "aws", source);
  }

  if (eventType === "traces" && isOtelPipelineSource(source)) {
    applyOtelTraceIngestionPatch(enriched, "aws", source, AGENT_VERSION);
  }

  return enriched;
}
