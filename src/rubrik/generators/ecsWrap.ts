/**
 * Wrap raw Rubrik payloads into ECS + rubrik.* documents for Elasticsearch
 * _bulk shipping (UI Ship step), matching post-pipeline expectations from
 * docs/rubrik-ecs-field-mapping.md so Discover works without Agent.
 *
 * Raw JSON is preserved in `message` / `event.original` for fidelity checks.
 */

import type { EcsDocument } from "../../aws/generators/types.js";
import { LOADGEN_ECS_VERSION } from "../../ship/esBulkCompat.js";
import type { RawEventBundle, RubrikScenario } from "./raw.js";

function severityNum(s: string): number {
  const n = s.toLowerCase();
  if (n.includes("critical")) return 90;
  if (n.includes("warning")) return 50;
  return 20;
}

function normalizeSeverity(s: string): "critical" | "warning" | "info" {
  const n = s.toLowerCase();
  if (n.includes("critical")) return "critical";
  if (n.includes("warning")) return "warning";
  return "info";
}

function outcomeFromStatus(status: string): "success" | "failure" | "unknown" {
  if (status === "Success" || status === "TaskSuccess") return "success";
  if (status === "Failure" || status === "TaskFailure") return "failure";
  return "unknown";
}

function categorize(
  classOrType: string,
  severity: string
): { kind: string; category: string[]; type: string[] } {
  const c = classOrType.toUpperCase();
  const sev = normalizeSeverity(severity);
  const security =
    c.includes("ANOMALY") ||
    c.includes("THREAT") ||
    c.includes("RANSOMWARE") ||
    c.includes("SECURITY") ||
    c.includes("IDENTITY");

  if (security && (sev === "critical" || sev === "warning")) {
    if (c.includes("ANOMALY") || c.includes("RANSOMWARE")) {
      return { kind: "alert", category: ["malware", "intrusion_detection"], type: ["indicator"] };
    }
    return { kind: "alert", category: ["intrusion_detection", "threat"], type: ["indicator"] };
  }
  if (c.includes("AUDIT") || c.includes("LOGIN") || c.includes("CONFIG")) {
    return { kind: "event", category: ["iam", "configuration"], type: ["admin", "change", "user"] };
  }
  if (c.includes("BACKUP") || c.includes("RECOVERY") || c.includes("REPLICATION")) {
    return {
      kind: "event",
      category: ["file"],
      type: sev === "critical" ? ["error"] : ["info"],
    };
  }
  return { kind: "event", category: ["file"], type: ["info"] };
}

function extractFromPayload(bundle: RawEventBundle): {
  timestamp: string;
  message: string;
  severity: string;
  status: string;
  className: string;
  activityName: string;
  eventId: string;
  seriesId: string;
  object: { id?: string; name?: string; type?: string; location?: string };
  cluster: { id?: string; name?: string };
  user?: { name?: string; id?: string };
  sourceIp?: string;
  eventUrl?: string;
  recordType: "event" | "audit";
  error?: { code?: string; message?: string; reason?: string; remedy?: string; id?: string };
} {
  const p = bundle.payload as Record<string, unknown>;
  const str = (v: unknown) => (v == null ? "" : String(v));

  if (bundle.path === "syslog" && bundle.line) {
    // Parse MSG portion for rubrik.* (same pattern as pipeline grok)
    const msgMatch = bundle.line.match(
      /rubrik:\s*([^:]+):\s*(\w+):\s*([^\s]+)\s+on object '([^']+)'\s*\(([^)]+)\):\s*(.*)$/
    );
    return {
      timestamp: new Date().toISOString(),
      message: msgMatch ? msgMatch[0].replace(/^.*rubrik:\s*/, "") : bundle.line,
      severity: msgMatch?.[2] ?? "info",
      status: "Success",
      className: msgMatch?.[1]?.trim() ?? "Diagnostic",
      activityName: msgMatch?.[3] ?? "Unknown",
      eventId: "",
      seriesId: "",
      object: { name: msgMatch?.[4], type: msgMatch?.[5] },
      cluster: { name: bundle.line.split(/\s+/)[2] },
      recordType: "event",
    };
  }

  if (bundle.path === "graphql") {
    if (p.auditType) {
      const cluster = (p.cluster as Record<string, unknown> | undefined) ?? {};
      return {
        timestamp: str(p.time),
        message: str(p.message),
        severity: str(p.severity),
        status: str(p.status),
        className: str(p.auditType),
        activityName: str(p.auditType),
        eventId: str(p.id),
        seriesId: str(p.seriesId ?? p.id),
        object: { id: str(p.objectId), name: str(p.objectName), type: str(p.objectType) },
        cluster: { id: str(cluster.id), name: str(cluster.name) },
        user: { name: str(p.userName) },
        sourceIp: str(p.ipAddress),
        recordType: "audit",
      };
    }
    const activityConnection = p.activityConnection as
      | { nodes?: Array<Record<string, unknown>> }
      | undefined;
    const node = activityConnection?.nodes?.[0];
    return {
      timestamp: str(node?.time ?? p.lastUpdated),
      message: str(node?.message ?? p.lastActivityMessage),
      severity: str(p.severity),
      status: str(node?.status ?? p.status),
      className: str(p.lastActivityType),
      activityName: str(node?.type ?? p.lastActivityType),
      eventId: str(p.id),
      seriesId: str(p.fid),
      object: {
        id: str(p.objectId),
        name: str(p.objectName),
        type: str(p.objectType),
        location: str(p.location),
      },
      cluster: { id: str(p.clusterId), name: str(p.clusterName) },
      recordType: "event",
      error: p.causeErrorCode
        ? {
            code: str(p.causeErrorCode),
            message: str(p.causeErrorMessage),
            reason: str(p.causeErrorReason),
            remedy: str(p.causeErrorRemedy),
          }
        : undefined,
    };
  }

  // webhook — PD-CEF or custom
  if (p.custom_details && typeof p.custom_details === "object") {
    const cd = p.custom_details as Record<string, unknown>;
    return {
      timestamp: str(p.timestamp),
      message: str(p.summary),
      severity: str(p.severity),
      status: str(cd.status),
      className: str(p.class),
      activityName: str(cd.eventName ?? p.class),
      eventId: str(cd.id),
      seriesId: str(cd.seriesId),
      object: {
        id: str(cd.objectId),
        name: str(cd.objectName),
        type: str(cd.objectType),
        location: str(cd.location),
      },
      cluster: { id: str(cd.clusterId), name: str(cd.clusterName) },
      user: cd.auditUserName ? { name: str(cd.auditUserName), id: str(cd.auditUserId) } : undefined,
      recordType: cd.type === "Audit" || cd.auditType ? "audit" : "event",
      error: cd.errorCode
        ? {
            id: str(cd.errorId),
            code: str(cd.errorCode),
            reason: str(cd.errorReason),
            remedy: str(cd.errorRemedy),
          }
        : undefined,
    };
  }

  // flat custom template
  return {
    timestamp: str(p.timestamp),
    message: str(p.message),
    severity: str(p.severity),
    status: str(p.status),
    className: str(p.class ?? p.auditType ?? p.eventType),
    activityName: str(p.class ?? p.auditType ?? p.eventType),
    eventId: str(p.eventId),
    seriesId: str(p.seriesId ?? p.auditSeriesId),
    object: {
      id: str(p.objectId),
      name: str(p.objectName),
      type: str(p.objectType),
      location: str(p.location),
    },
    cluster: { id: str(p.clusterId), name: str(p.clusterName) },
    user: p.userName ? { name: str(p.userName), id: str(p.userId) } : undefined,
    sourceIp: p.ipAddress ? str(p.ipAddress) : undefined,
    eventUrl: p.eventLink ? str(p.eventLink) : undefined,
    recordType: p.eventType === "Audit" || p.auditType ? "audit" : "event",
    error: p.errorCode
      ? {
          id: str(p.errorId),
          code: str(p.errorCode),
          message: str(p.errorMessage),
          reason: str(p.errorReason),
          remedy: str(p.errorRemedy),
        }
      : undefined,
  };
}

/**
 * Build an ECS document suitable for `logs-rubrik.*` data streams via _bulk.
 */
export function wrapRawAsEcs(bundle: RawEventBundle, ts: string): EcsDocument {
  const x = extractFromPayload(bundle);
  const sev = normalizeSeverity(String(x.severity ?? "info"));
  const status = String(x.status ?? "Success");
  const cats = categorize(String(x.className ?? ""), sev);
  const dataset =
    bundle.path === "webhook"
      ? "rubrik.webhook"
      : bundle.path === "graphql"
        ? "rubrik.graphql"
        : "rubrik.syslog";

  const rawStr =
    bundle.path === "syslog" && bundle.line ? bundle.line : JSON.stringify(bundle.payload);

  const timestamp = x.timestamp || ts;

  const doc: EcsDocument = {
    __dataset: dataset,
    "@timestamp": timestamp,
    // Align with loadgen enrich + Elastic 9.0+ ECS field (pipeline sets 8.17 with override:false)
    ecs: { version: LOADGEN_ECS_VERSION },
    data_stream: {
      type: "logs",
      dataset,
      namespace: "default",
    },
    message: bundle.path === "syslog" ? x.message || rawStr : rawStr,
    event: {
      module: "rubrik",
      dataset,
      kind: cats.kind,
      category: cats.category,
      type: cats.type,
      action: x.activityName || x.className,
      outcome: outcomeFromStatus(status),
      severity: severityNum(sev),
      id: x.eventId || undefined,
      url: x.eventUrl || undefined,
      reason: x.error?.reason || undefined,
      original: rawStr,
    },
    observer: {
      vendor: "Rubrik",
      product: bundle.path === "syslog" ? "CDM" : "RSC",
      name: x.cluster.name || undefined,
    },
    log: { level: sev },
    labels: {
      rubrik_record_type: x.recordType,
      rubrik_scenario: bundle.scenario as RubrikScenario,
    },
    tags: ["rubrik", bundle.path, "forwarded", `rubrik-${bundle.flavor}`],
    rubrik: {
      ingest: { path: bundle.path },
      severity: sev,
      status,
      class: x.className,
      activity: {
        type: x.recordType === "audit" ? "Audit" : "Event",
        name: x.activityName,
      },
      event: { id: x.eventId },
      series: { id: x.seriesId },
      object: {
        id: x.object.id,
        name: x.object.name,
        type: x.object.type,
        location: x.object.location,
      },
      cluster: { id: x.cluster.id, name: x.cluster.name },
      ...(x.recordType === "audit"
        ? { audit: { type: x.className, series: { id: x.seriesId } } }
        : {}),
      ...(x.error
        ? {
            error: {
              id: x.error.id,
              code: x.error.code,
              remedy: x.error.remedy,
            },
          }
        : {}),
    },
  };

  if (x.user?.name) {
    doc.user = { name: x.user.name, id: x.user.id };
  }
  if (x.sourceIp) {
    doc.source = { ip: x.sourceIp };
  }
  if (x.error?.code || x.error?.message) {
    doc.error = {
      code: x.error.code,
      message: x.error.message || x.error.reason,
    };
  }
  if (bundle.path === "syslog" && bundle.line) {
    const priMatch = bundle.line.match(/^<(\d+)>/);
    const pri = priMatch ? Number(priMatch[1]) : 134;
    doc.log = {
      ...((doc.log as object) || {}),
      level: sev,
      syslog: {
        priority: pri,
        facility: { code: Math.floor(pri / 8), name: "local0" },
        severity: { code: pri % 8, name: sev },
      },
    };
  }

  return doc;
}
