/**
 * Raw Rubrik-shaped payloads (pre-pipeline) for webhook, GraphQL, and syslog.
 *
 * These match what RSC / CDM emit before Elastic Agent + rubrik-* ingest pipelines.
 * Critical anomaly samples intentionally use status Success + severity critical
 * (RansomwareStrainDetected) so SIEM rules can key on severity, not outcome.
 */

import { rand, randInt, randIp } from "../../helpers/index.js";
import {
  eventLink,
  newIds,
  ORG,
  pickCluster,
  pickObject,
  pickUser,
  type RubrikCluster,
  type RubrikObject,
} from "./payloads.js";

export type WebhookFlavor = "pdcef" | "custom_event" | "custom_audit";
export type GraphqlFlavor = "activity" | "audit";
export type RubrikScenario =
  | "anomaly_ransomware"
  | "backup_failure"
  | "backup_success"
  | "threat_hunt"
  | "audit_login"
  | "audit_config";

export interface RawEventBundle {
  scenario: RubrikScenario;
  path: "webhook" | "graphql" | "syslog";
  flavor: string;
  /** Object/array suitable for JSON HTTP or NDJSON */
  payload: unknown;
  /** Syslog line when path is syslog; otherwise undefined */
  line?: string;
}

function pickScenario(er: number): RubrikScenario {
  const r = Math.random();
  // Bias anomalies into the mix even at low error rates — PoC needs SIEM signals.
  if (r < 0.18 + er * 0.15) return "anomaly_ransomware";
  if (r < 0.3 + er * 0.25) return "backup_failure";
  if (r < 0.42) return "threat_hunt";
  if (r < 0.55) return "audit_login";
  if (r < 0.68) return "audit_config";
  return "backup_success";
}

function scenarioMeta(scenario: RubrikScenario) {
  switch (scenario) {
    case "anomaly_ransomware":
      return {
        className: "Anomaly",
        activityType: "ANOMALY",
        eventName: "RansomwareStrainDetected",
        severity: "critical" as const,
        gqlSeverity: "SEVERITY_CRITICAL",
        status: "Success",
        message:
          "Detected potential ransomware strain on object — encryption-like change rate exceeded baseline.",
        isAudit: false,
      };
    case "backup_failure":
      return {
        className: "Backup",
        activityType: "BACKUP",
        eventName: "Snapshot.BackupFailed",
        severity: "critical" as const,
        gqlSeverity: "SEVERITY_CRITICAL",
        status: "Failure",
        message: "Failed backup of protected object.",
        isAudit: false,
        error: {
          errorId: "RBK-BK-0042",
          errorCode: "BACKUP_FAILED",
          errorReason: "VMware snapshot creation timed out",
          errorRemedy: "Retry backup; verify vCenter connectivity and snapshot consolidation",
          errorMessage: "Snapshot creation timed out after 30 minutes",
        },
      };
    case "backup_success":
      return {
        className: "Backup",
        activityType: "BACKUP",
        eventName: "Snapshot.BackupSucceeded",
        severity: "info" as const,
        gqlSeverity: "SEVERITY_INFO",
        status: "Success",
        message: "Backup completed successfully.",
        isAudit: false,
      };
    case "threat_hunt":
      return {
        className: "Threat Hunt",
        activityType: "THREAT_HUNT",
        eventName: "ThreatHunt.MatchFound",
        severity: "warning" as const,
        gqlSeverity: "SEVERITY_WARNING",
        status: "Success",
        message: "Threat hunt matched IOC hash on protected object.",
        isAudit: false,
      };
    case "audit_login":
      return {
        className: "Audit",
        activityType: "Audit",
        eventName: "User.Login",
        auditType: "LOGIN",
        severity: "info" as const,
        gqlSeverity: "SEVERITY_INFO",
        status: "Success",
        message: "User logged in to Rubrik Security Cloud.",
        isAudit: true,
      };
    case "audit_config":
      return {
        className: "Audit",
        activityType: "Audit",
        eventName: "SlaDomain.Updated",
        auditType: "CONFIG_CHANGE",
        severity: "info" as const,
        gqlSeverity: "SEVERITY_INFO",
        status: "Success",
        message: "Changed SLA domain configuration.",
        isAudit: true,
      };
  }
}

function pdcefPayload(
  ts: string,
  meta: ReturnType<typeof scenarioMeta>,
  obj: RubrikObject,
  cluster: RubrikCluster,
  ids: { eventId: string; seriesId: string },
  user = pickUser()
) {
  const summary =
    meta.className === "Anomaly"
      ? `Detected potential ransomware strain on '${obj.name}'.`
      : meta.className === "Backup" && meta.status === "Failure"
        ? `Failed backup of ${obj.type} '${obj.name}'.`
        : meta.message;

  const custom_details: Record<string, unknown> = {
    seriesId: ids.seriesId,
    id: ids.eventId,
    type: meta.isAudit ? "Audit" : "Event",
    objectId: obj.id,
    objectName: obj.name,
    objectType: obj.type,
    status: meta.status,
    clusterId: cluster.id,
    clusterName: cluster.name,
    eventName: meta.eventName,
    location: obj.location,
    url: "",
  };

  if ("error" in meta && meta.error) {
    Object.assign(custom_details, {
      errorId: meta.error.errorId,
      errorCode: meta.error.errorCode,
      errorReason: meta.error.errorReason,
      errorRemedy: meta.error.errorRemedy,
    });
  }

  if (meta.isAudit) {
    Object.assign(custom_details, {
      auditUserName: user.name,
      auditUserId: user.id,
      auditType: meta.auditType,
      auditSeriesId: ids.seriesId,
    });
  }

  return {
    summary,
    source: "Rubrik Security Cloud",
    severity: meta.severity,
    timestamp: ts,
    class: meta.className,
    custom_details,
  };
}

function customEventPayload(
  ts: string,
  meta: ReturnType<typeof scenarioMeta>,
  obj: RubrikObject,
  cluster: RubrikCluster,
  ids: { eventId: string; seriesId: string }
) {
  const message =
    meta.className === "Anomaly"
      ? `Detected potential ransomware strain on object '${obj.name}' (${obj.type}).`
      : meta.className === "Backup" && meta.status === "Failure"
        ? `Failed backup of ${obj.type} '${obj.name}'.`
        : meta.message;

  const err = "error" in meta ? meta.error : undefined;

  return {
    eventId: ids.eventId,
    seriesId: ids.seriesId,
    eventType: meta.activityType,
    class: meta.className,
    status: meta.status,
    severity: meta.severity,
    message,
    timestamp: ts,
    objectId: obj.id,
    objectName: obj.name,
    objectType: obj.type,
    clusterId: cluster.id,
    clusterName: cluster.name,
    location: obj.location,
    url: "",
    eventLink: eventLink(ids.seriesId, cluster.id),
    errorCode: err?.errorCode ?? "",
    errorMessage: err?.errorMessage ?? "",
    errorReason: err?.errorReason ?? "",
    errorRemedy: err?.errorRemedy ?? "",
    errorId: err?.errorId ?? "",
    eventInfo:
      meta.className === "Anomaly"
        ? {
            strain: "generic_encryptor",
            confidence: rand(["high", "medium"]),
            filesChanged: randInt(120, 8500),
          }
        : {},
  };
}

function customAuditPayload(
  ts: string,
  meta: ReturnType<typeof scenarioMeta>,
  obj: RubrikObject,
  cluster: RubrikCluster,
  ids: { eventId: string; seriesId: string }
) {
  const user = pickUser();
  return {
    eventId: ids.eventId,
    seriesId: ids.seriesId,
    eventType: "Audit",
    auditType: meta.auditType ?? "LOGIN",
    auditSeriesId: ids.seriesId,
    status: meta.status,
    severity: meta.severity,
    message: meta.message,
    timestamp: ts,
    objectId: meta.auditType === "CONFIG_CHANGE" ? obj.id : "",
    objectName: meta.auditType === "CONFIG_CHANGE" ? obj.name : "",
    objectType: meta.auditType === "CONFIG_CHANGE" ? obj.type : "",
    clusterId: cluster.id,
    clusterName: cluster.name,
    location: "",
    eventLink: eventLink(ids.seriesId, cluster.id),
    userName: user.name,
    userId: user.id,
    ipAddress: randIp(),
    orgId: ORG.id,
    auditInfo:
      meta.auditType === "CONFIG_CHANGE"
        ? { field: "snapshotFrequency", oldValue: "Daily", newValue: "Hourly" }
        : { method: "SAML", mfa: true },
  };
}

function graphqlActivity(
  ts: string,
  meta: ReturnType<typeof scenarioMeta>,
  obj: RubrikObject,
  cluster: RubrikCluster,
  ids: { eventId: string; seriesId: string }
) {
  const message =
    meta.className === "Anomaly"
      ? `Detected potential ransomware strain on object '${obj.name}'.`
      : meta.message;
  const err = "error" in meta ? meta.error : undefined;

  return {
    fid: ids.seriesId,
    id: ids.eventId,
    objectId: obj.id,
    objectName: obj.name,
    objectType: obj.type,
    location: obj.location,
    lastActivityType: meta.activityType,
    lastActivityMessage: message,
    severity: meta.gqlSeverity,
    lastUpdated: ts,
    status: meta.status,
    failureReason: err?.errorReason ?? "",
    causeErrorCode: err?.errorCode ?? "",
    causeErrorMessage: err?.errorMessage ?? "",
    causeErrorReason: err?.errorReason ?? "",
    causeErrorRemedy: err?.errorRemedy ?? "",
    progress: meta.status === "Success" || meta.status === "Failure" ? 100 : randInt(10, 90),
    clusterId: cluster.id,
    clusterName: cluster.name,
    activityConnection: {
      nodes: [
        {
          status: meta.status,
          type: meta.eventName,
          message,
          time: ts,
        },
      ],
    },
  };
}

function graphqlAudit(
  ts: string,
  meta: ReturnType<typeof scenarioMeta>,
  obj: RubrikObject,
  cluster: RubrikCluster,
  ids: { eventId: string; seriesId: string }
) {
  const user = pickUser();
  return {
    id: ids.eventId,
    time: ts,
    message: meta.message,
    severity: meta.gqlSeverity,
    status: meta.status,
    auditType: meta.auditType ?? "LOGIN",
    userName: user.name,
    ipAddress: randIp(),
    objectId: meta.auditType === "CONFIG_CHANGE" ? obj.id : "",
    objectName: meta.auditType === "CONFIG_CHANGE" ? obj.name : "",
    objectType: meta.auditType === "CONFIG_CHANGE" ? obj.type : "",
    orgName: ORG.name,
    orgId: ORG.id,
    cluster: { name: cluster.name, id: cluster.id },
    // series id available for correlation in samples
    seriesId: ids.seriesId,
  };
}

function syslogLine(
  ts: string,
  meta: ReturnType<typeof scenarioMeta>,
  obj: RubrikObject,
  cluster: RubrikCluster
): string {
  // PRI: facility local0 (16) + severity. critical→2, warning→4, info→6
  const sevCode = meta.severity === "critical" ? 2 : meta.severity === "warning" ? 4 : 6;
  const pri = 16 * 8 + sevCode;
  const d = new Date(ts);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const headerTime = `${months[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, " ")} ${d
    .toISOString()
    .slice(11, 19)}`;
  const msg = `${meta.className}: ${meta.severity}: ${meta.eventName} on object '${obj.name}' (${obj.type}): ${meta.message}`;
  // RFC 3164-style line (Agent syslog decode → message = MSG body)
  return `<${pri}>${headerTime} ${cluster.name} rubrik: ${msg}`;
}

/**
 * Build one raw Rubrik event for the given ingest path.
 * Pass `forceScenario` to pin SIEM test cases (e.g. anomaly_ransomware).
 */
export function generateRawRubrikEvent(
  ts: string,
  er: number,
  path: "webhook" | "graphql" | "syslog",
  opts?: { forceScenario?: RubrikScenario; webhookFlavor?: WebhookFlavor }
): RawEventBundle {
  let scenario = opts?.forceScenario ?? pickScenario(er);
  // Syslog path is CDM activity — prefer non-audit for default
  if (path === "syslog" && scenario.startsWith("audit") && !opts?.forceScenario) {
    scenario = Math.random() < 0.5 ? "anomaly_ransomware" : "backup_success";
  }

  const meta = scenarioMeta(scenario);
  const cluster = pickCluster();
  const obj = scenario === "audit_config" ? pickObject(false) : pickObject(true);
  const ids = newIds();

  if (path === "syslog") {
    const line = syslogLine(ts, meta, obj, cluster);
    return { scenario, path, flavor: "rfc3164", payload: { message: line }, line };
  }

  if (path === "graphql") {
    if (meta.isAudit) {
      return {
        scenario,
        path,
        flavor: "audit",
        payload: graphqlAudit(ts, meta, obj, cluster, ids),
      };
    }
    return {
      scenario,
      path,
      flavor: "activity",
      payload: graphqlActivity(ts, meta, obj, cluster, ids),
    };
  }

  // webhook
  let flavor: WebhookFlavor = opts?.webhookFlavor ?? "pdcef";
  if (!opts?.webhookFlavor) {
    if (meta.isAudit) flavor = Math.random() < 0.5 ? "custom_audit" : "pdcef";
    else flavor = Math.random() < 0.45 ? "custom_event" : "pdcef";
  }

  if (flavor === "custom_audit" || (meta.isAudit && flavor === "custom_event")) {
    return {
      scenario,
      path,
      flavor: "custom_audit",
      payload: customAuditPayload(ts, meta, obj, cluster, ids),
    };
  }
  if (flavor === "custom_event") {
    return {
      scenario,
      path,
      flavor: "custom_event",
      payload: customEventPayload(ts, meta, obj, cluster, ids),
    };
  }
  return {
    scenario,
    path,
    flavor: "pdcef",
    payload: pdcefPayload(ts, meta, obj, cluster, ids),
  };
}

/** Guaranteed critical anomaly with Success status — for SIEM PoC smoke tests. */
export function generateAnomalyRansomwareRaw(
  ts: string,
  path: "webhook" | "graphql" | "syslog" = "webhook"
): RawEventBundle {
  return generateRawRubrikEvent(ts, 0, path, {
    forceScenario: "anomaly_ransomware",
    webhookFlavor: path === "webhook" ? "pdcef" : undefined,
  });
}
