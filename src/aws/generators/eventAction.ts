/**
 * ECS `event.action` normalisation for AWS log documents.
 *
 * Real Elastic AWS integrations populate `event.action` from whatever the service
 * calls its operation — CloudTrail's `eventName`, S3's `operation`, a job's
 * `event_type`, and so on. Our generators emit those native fields but most of them
 * never mapped one onto `event.action`, so dashboards that group or count by it
 * failed with "Unknown column" rather than rendering.
 *
 * This module performs that mapping once, centrally, from fields the document
 * already carries. It never invents a value where the document has nothing to say:
 * `deriveEventAction` returns undefined and the caller leaves the field unset.
 *
 * Ordering matters. `ACTION_FIELDS` are true verbs ("PutObject", "StartJobRun").
 * `SUBJECT_FIELDS` are the discrete event subject a service uses in place of a verb
 * (a Macie finding type, a Backup job phase); they are only consulted when no verb
 * exists, which mirrors how those integrations label the event.
 */

import type { EcsDocument } from "./types.js";

/** Native field names that hold a verb. Checked first, in this order. */
const ACTION_FIELDS = [
  "event_name",
  "eventName",
  "operation",
  "operation_name",
  "operation_type",
  "api_call",
  "api_name",
  "api",
  "action",
  "action_type",
  "command",
  "verb",
  "request_type",
  "request_method",
  "method",
  "event_type",
  "event_subtype",
  "event_code",
  "activity_type",
];

/**
 * Discrete subject a service uses in place of a verb. Checked second, and kept
 * deliberately narrow: generic `type` / `status` / `state` fields are excluded
 * because they describe the resource or the outcome, not the event. Treating an
 * ALB's `type` ("application") or a job's `status` ("SUCCESS") as an action
 * produces a field that reads plausibly but means nothing.
 */
const SUBJECT_FIELDS = [
  "finding_type",
  "behavior_type",
  "log_kind",
  "log_line_kind",
  "message_type",
  "notification_type",
  "record_type",
  "change_type",
  "job_phase",
  "lifecycle",
  "alarm_state",
];

/**
 * Take the native value as-is. Elastic's AWS integrations keep the service's own
 * spelling — CloudTrail's `event.action` is "TerminateInstances", S3's is
 * "REST.GET.OBJECT" — so re-casing here would make our documents less like the
 * real thing, not more.
 */
export function normalizeAction(raw: unknown): string | undefined {
  if (typeof raw !== "string" && typeof raw !== "number") return undefined;
  const s = String(raw).trim();
  if (!s || s.length > 80) return undefined;
  return s;
}

/** The per-service `aws.<key>` object on a document, ignoring shared envelopes. */
function serviceBlocks(doc: Record<string, unknown>): Record<string, unknown>[] {
  const aws = doc.aws;
  if (!aws || typeof aws !== "object") return [];
  const out: Record<string, unknown>[] = [];
  for (const [k, v] of Object.entries(aws as Record<string, unknown>)) {
    if (k === "dimensions" || k === "cloudwatch" || k === "s3" || k === "kinesis") continue;
    if (v && typeof v === "object" && !Array.isArray(v)) out.push(v as Record<string, unknown>);
  }
  return out;
}

function pick(blocks: Record<string, unknown>[], names: readonly string[]): string | undefined {
  for (const name of names) {
    for (const b of blocks) {
      const hit = normalizeAction(b[name]);
      if (hit) return hit;
    }
  }
  return undefined;
}

/**
 * Derive ECS `event.action` for a document, or undefined when the document carries
 * nothing that describes an action. Existing values are always preserved.
 */
export function deriveEventAction(doc: EcsDocument): string | undefined {
  const d = doc as unknown as Record<string, unknown>;
  const ev = d.event as Record<string, unknown> | undefined;
  if (ev && typeof ev.action === "string" && ev.action) return ev.action;

  const blocks = serviceBlocks(d);
  // CloudTrail is the canonical case: the API name is the action.
  const ct = (d.aws as Record<string, unknown> | undefined)?.cloudtrail as
    | Record<string, unknown>
    | undefined;
  if (ct) {
    const name = normalizeAction(ct.event_name ?? ct.eventName);
    if (name) return name;
  }
  return pick(blocks, ACTION_FIELDS) ?? pick(blocks, SUBJECT_FIELDS);
}

/** Set `event.action` in place when it is missing and derivable. Returns the doc. */
export function applyEventAction<T extends EcsDocument>(doc: T): T {
  const d = doc as unknown as Record<string, unknown>;
  const ev = d.event as Record<string, unknown> | undefined;
  if (ev && typeof ev.action === "string" && ev.action) return doc;
  const action = deriveEventAction(doc);
  if (!action) return doc;
  if (ev && typeof ev === "object") ev.action = action;
  else d.event = { action };
  return doc;
}
