import { describe, it, expect } from "vitest";
import { deriveEventAction, applyEventAction, normalizeAction } from "./eventAction.js";
import { GENERATORS } from "./index.js";
import type { EcsDocument } from "./types.js";

const TS = "2026-09-22T09:00:00.000Z";
const doc = (o: Record<string, unknown>) => o as unknown as EcsDocument;

describe("ECS event.action derivation", () => {
  it("keeps the service's own spelling rather than re-casing it", () => {
    // Elastic's AWS integrations surface CloudTrail's "TerminateInstances" and
    // S3's "REST.GET.OBJECT" verbatim; re-casing would make us less like the real thing.
    expect(normalizeAction("REST.GET.OBJECT")).toBe("REST.GET.OBJECT");
    expect(normalizeAction("TerminateInstances")).toBe("TerminateInstances");
  });

  it("ignores empty, overlong and non-scalar values", () => {
    expect(normalizeAction("")).toBeUndefined();
    expect(normalizeAction("   ")).toBeUndefined();
    expect(normalizeAction("x".repeat(81))).toBeUndefined();
    expect(normalizeAction({})).toBeUndefined();
    expect(normalizeAction(undefined)).toBeUndefined();
  });

  it("never overwrites an action the generator already set", () => {
    const d = doc({ event: { action: "AssumeRole" }, aws: { iam: { operation: "ListUsers" } } });
    expect(deriveEventAction(d)).toBe("AssumeRole");
    applyEventAction(d);
    expect((d as Record<string, any>).event.action).toBe("AssumeRole");
  });

  it("derives from the service's native operation field", () => {
    expect(deriveEventAction(doc({ aws: { s3access: { operation: "REST.PUT.OBJECT" } } }))).toBe(
      "REST.PUT.OBJECT"
    );
    expect(deriveEventAction(doc({ aws: { glue: { event_type: "JobRunStarted" } } }))).toBe(
      "JobRunStarted"
    );
  });

  it("prefers a verb over a subject field", () => {
    const d = doc({ aws: { svc: { finding_type: "Policy:IAMUser", operation: "GetFindings" } } });
    expect(deriveEventAction(d)).toBe("GetFindings");
  });

  it("falls back to a subject field only when no verb exists", () => {
    expect(deriveEventAction(doc({ aws: { macie: { finding_type: "SensitiveData:S3" } } }))).toBe(
      "SensitiveData:S3"
    );
  });

  it("ignores generic type/status/state, which describe the resource or outcome", () => {
    // An ALB's type is "application" and a job's status is "SUCCESS" — neither is an action.
    expect(deriveEventAction(doc({ aws: { alb: { type: "application" } } }))).toBeUndefined();
    expect(deriveEventAction(doc({ aws: { datasync: { status: "SUCCESS" } } }))).toBeUndefined();
    expect(deriveEventAction(doc({ aws: { vpn: { state: "UP" } } }))).toBeUndefined();
  });

  it("skips shared envelopes so routing metadata is never mistaken for an action", () => {
    const d = doc({ aws: { dimensions: { Operation: "PutItem" }, cloudwatch: { api: "x" } } });
    expect(deriveEventAction(d)).toBeUndefined();
  });

  it("leaves the field unset when the document has nothing action-like", () => {
    const d = doc({ event: { outcome: "success" }, aws: { acm: { days_to_expiry: 30 } } });
    expect(deriveEventAction(d)).toBeUndefined();
    applyEventAction(d);
    expect((d as Record<string, any>).event.action).toBeUndefined();
  });

  it("uses CloudTrail's event name as the action", () => {
    expect(deriveEventAction(doc({ aws: { cloudtrail: { event_name: "DeleteBucket" } } }))).toBe(
      "DeleteBucket"
    );
  });

  it("is applied to every generator through the registry wrapper", () => {
    // Spot-check services whose documents carry a native operation field.
    const gens = GENERATORS as Record<string, (ts: string, er: number) => unknown>;
    for (const key of ["s3", "vpc", "ecr", "apigateway"]) {
      let seen: string | undefined;
      for (let i = 0; i < 30 && !seen; i++) {
        const out = gens[key](TS, 0.3);
        for (const d of (Array.isArray(out) ? out : [out]) as Record<string, any>[]) {
          if (d?.event?.action) seen = String(d.event.action);
        }
      }
      expect(seen, `${key} should carry event.action`).toBeTruthy();
    }
  });
});
