/**
 * Convert the generator's Elastic APM-schema trace documents into a real
 * OTLP/HTTP JSON `ExportTraceServiceRequest`, so traces can be shipped over the
 * true OpenTelemetry wire protocol (POST <endpoint>/v1/traces) to an APM Server
 * / EDOT (or ADOT) collector — exercising genuine OTLP intake — instead of only
 * being bulk-indexed into `traces-apm-*`.
 *
 * OTLP/JSON encoding notes (opentelemetry-proto JSON mapping):
 *  - trace_id / span_id are hex-encoded strings (already how the generators emit them).
 *  - timestamps are unsigned-int nanoseconds encoded as decimal strings.
 *  - span.kind is the numeric enum (1=INTERNAL, 2=SERVER, 3=CLIENT, 4=PRODUCER, 5=CONSUMER).
 *  - status.code is 0=UNSET, 1=OK, 2=ERROR.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LooseDoc = Record<string, any>;

export type OtlpAttribute = { key: string; value: OtlpAnyValue };
type OtlpAnyValue =
  | { stringValue: string }
  | { boolValue: boolean }
  | { intValue: string }
  | { doubleValue: number };

export interface OtlpSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: OtlpAttribute[];
  status: { code: number; message?: string };
}

export interface OtlpScopeSpans {
  scope: { name: string; version?: string };
  spans: OtlpSpan[];
}

export interface OtlpResourceSpans {
  resource: { attributes: OtlpAttribute[] };
  scopeSpans: OtlpScopeSpans[];
}

export interface OtlpTraceRequest {
  resourceSpans: OtlpResourceSpans[];
}

const SPAN_KIND_ENUM: Record<string, number> = {
  INTERNAL: 1,
  SERVER: 2,
  CLIENT: 3,
  PRODUCER: 4,
  CONSUMER: 5,
};

function anyValue(v: unknown): OtlpAnyValue {
  if (typeof v === "boolean") return { boolValue: v };
  if (typeof v === "number") {
    return Number.isInteger(v) ? { intValue: String(v) } : { doubleValue: v };
  }
  return { stringValue: String(v) };
}

function attrs(map: Record<string, unknown>): OtlpAttribute[] {
  const out: OtlpAttribute[] = [];
  for (const [key, value] of Object.entries(map)) {
    if (value === undefined || value === null || value === "") continue;
    out.push({ key, value: anyValue(value) });
  }
  return out;
}

/** ISO timestamp → unsigned-int nanoseconds as a decimal string. */
export function isoToUnixNano(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "0";
  // Preserve ms precision, pad to ns.
  return `${ms}000000`;
}

/** duration in microseconds → nanoseconds, added to a start (ns) decimal string. */
function endNano(startNano: string, durationUs: number): string {
  const start = BigInt(startNano || "0");
  const durNs = BigInt(Math.max(0, Math.round(durationUs)) * 1000);
  return (start + durNs).toString();
}

function spanKind(doc: LooseDoc): number {
  if (doc.span && typeof doc.span.kind === "string" && SPAN_KIND_ENUM[doc.span.kind]) {
    return SPAN_KIND_ENUM[doc.span.kind];
  }
  if (doc.transaction) {
    return doc.transaction.type === "messaging" ? SPAN_KIND_ENUM.CONSUMER : SPAN_KIND_ENUM.SERVER;
  }
  return SPAN_KIND_ENUM.INTERNAL;
}

/**
 * Stable resource identity key for grouping spans into resourceSpans. Service
 * name + deployment environment is the OTLP resource identity; we deliberately
 * do not include version/telemetry so all spans of a trace stay in one resource
 * even if a doc omits those optional blocks.
 */
function resourceKey(doc: LooseDoc): string {
  return [doc.service?.name ?? "unknown", doc.service?.environment ?? ""].join("|");
}

function resourceAttributes(doc: LooseDoc): OtlpAttribute[] {
  const lang = doc.service?.language?.name;
  return attrs({
    "service.name": doc.service?.name,
    "service.version": doc.service?.version,
    "deployment.environment": doc.service?.environment,
    "telemetry.sdk.name": doc.telemetry?.sdk?.name ?? "opentelemetry",
    "telemetry.sdk.language": doc.telemetry?.sdk?.language ?? lang,
    "telemetry.sdk.version": doc.telemetry?.sdk?.version,
    "telemetry.distro.name": doc.telemetry?.distro?.name,
    "telemetry.distro.version": doc.telemetry?.distro?.version,
    "cloud.provider": doc.cloud?.provider ?? "aws",
    "cloud.region": doc.cloud?.region,
    "cloud.account.id": doc.cloud?.account?.id,
    "process.runtime.name": doc.service?.runtime?.name,
    "process.runtime.version": doc.service?.runtime?.version,
  });
}

/** Derive OTel semconv-ish span attributes from the APM span/transaction doc + labels. */
function spanAttributes(doc: LooseDoc): OtlpAttribute[] {
  const map: Record<string, unknown> = {};

  // Correlation labels carry most of the AWS/OTel semconv-style attributes already.
  if (doc.labels && typeof doc.labels === "object") {
    for (const [k, v] of Object.entries(doc.labels as Record<string, unknown>)) {
      // labels use dotted keys already (e.g. "db.system", "rpc.system", "aws.xray.trace_id")
      map[k] = v;
    }
  }

  const span = doc.span;
  if (span) {
    if (span.type === "db" || span.subtype) map["db.system"] = map["db.system"] ?? span.subtype;
    if (span.action) map["db.operation"] = map["db.operation"] ?? span.action;
    if (span.type === "external" || span.type === "http") {
      map["rpc.system"] = map["rpc.system"] ?? "aws-api";
    }
    if (span.destination?.service?.resource) {
      map["peer.service"] = map["peer.service"] ?? span.destination.service.resource;
    }
  }
  const tx = doc.transaction;
  if (tx?.result) map["http.response.status_code"] = map["http.response.status_code"] ?? tx.result;
  return attrs(map);
}

function spanStatus(doc: LooseDoc): { code: number; message?: string } {
  const outcome = doc.event?.outcome;
  if (outcome === "failure" || doc.error) {
    const message =
      (typeof doc.error?.message === "string" && doc.error.message) ||
      (typeof doc.labels?.["error.message"] === "string" && doc.labels["error.message"]) ||
      undefined;
    return { code: 2, message };
  }
  if (outcome === "success") return { code: 1 };
  return { code: 0 };
}

/** Convert one APM trace document into a single OTLP span. */
export function apmDocToOtlpSpan(doc: LooseDoc): OtlpSpan {
  const traceId = String(doc.trace?.id ?? "");
  const spanId = String(doc.span?.id ?? doc.transaction?.id ?? "");
  const parentSpanId =
    typeof doc.parent?.id === "string" && doc.parent.id ? String(doc.parent.id) : undefined;
  const name = String(doc.span?.name ?? doc.transaction?.name ?? doc.span?.action ?? "span");
  const start = isoToUnixNano(String(doc["@timestamp"] ?? ""));
  const durationUs =
    typeof doc.span?.duration?.us === "number"
      ? doc.span.duration.us
      : typeof doc.transaction?.duration?.us === "number"
        ? doc.transaction.duration.us
        : 0;
  return {
    traceId,
    spanId,
    ...(parentSpanId ? { parentSpanId } : {}),
    name,
    kind: spanKind(doc),
    startTimeUnixNano: start,
    endTimeUnixNano: endNano(start, durationUs),
    attributes: spanAttributes(doc),
    status: spanStatus(doc),
  };
}

/**
 * Convert a batch of APM-schema trace docs into an OTLP/HTTP JSON
 * ExportTraceServiceRequest, grouping spans by resource (service identity).
 */
export function apmDocsToOtlp(docs: LooseDoc[], scopeVersion = "1.0.0"): OtlpTraceRequest {
  const groups = new Map<string, { resource: OtlpAttribute[]; spans: OtlpSpan[]; scope: string }>();
  for (const doc of docs) {
    if (!doc || typeof doc !== "object") continue;
    const key = resourceKey(doc);
    let g = groups.get(key);
    if (!g) {
      g = {
        resource: resourceAttributes(doc),
        spans: [],
        scope: doc.telemetry?.sdk?.name ?? "opentelemetry",
      };
      groups.set(key, g);
    }
    g.spans.push(apmDocToOtlpSpan(doc));
  }
  return {
    resourceSpans: [...groups.values()].map((g) => ({
      resource: { attributes: g.resource },
      scopeSpans: [{ scope: { name: g.scope, version: scopeVersion }, spans: g.spans }],
    })),
  };
}
