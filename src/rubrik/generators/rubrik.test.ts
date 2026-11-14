import { describe, expect, it } from "vitest";
import {
  generateAnomalyRansomwareRaw,
  generateRawRubrikEvent,
  generateRubrikWebhookLog,
  generateRubrikGraphqlLog,
  generateRubrikSyslogLog,
  wrapRawAsEcs,
} from "./index.js";

const ts = "2025-02-22T12:00:00.000Z";

describe("Rubrik raw payloads", () => {
  it("emits PD-CEF anomaly with Success + critical + RansomwareStrainDetected", () => {
    const raw = generateAnomalyRansomwareRaw(ts, "webhook");
    expect(raw.scenario).toBe("anomaly_ransomware");
    const p = raw.payload as Record<string, any>;
    expect(p.severity).toBe("critical");
    expect(p.class).toBe("Anomaly");
    expect(p.custom_details.status).toBe("Success");
    expect(p.custom_details.eventName).toBe("RansomwareStrainDetected");
  });

  it("emits GraphQL activity node with SEVERITY_CRITICAL and Success", () => {
    const raw = generateAnomalyRansomwareRaw(ts, "graphql");
    const p = raw.payload as Record<string, any>;
    expect(p.severity).toBe("SEVERITY_CRITICAL");
    expect(p.lastActivityType).toBe("ANOMALY");
    expect(p.status).toBe("Success");
    expect(p.activityConnection.nodes[0].type).toBe("RansomwareStrainDetected");
  });

  it("emits syslog MSG matching pipeline grok pattern", () => {
    const raw = generateAnomalyRansomwareRaw(ts, "syslog");
    expect(raw.line).toMatch(
      /Anomaly:\s*critical:\s*RansomwareStrainDetected on object '[^']+' \([^)]+\):/
    );
  });

  it("produces custom audit webhook when forced via scenario mix", () => {
    let found = false;
    for (let i = 0; i < 40; i++) {
      const raw = generateRawRubrikEvent(ts, 0.1, "webhook", {
        forceScenario: "audit_login",
        webhookFlavor: "custom_audit",
      });
      const p = raw.payload as Record<string, any>;
      if (p.eventType === "Audit" && p.userName && p.ipAddress) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});

describe("Rubrik ECS wrap + UI generators", () => {
  it("wraps webhook raw into rubrik.webhook dataset", () => {
    const raw = generateAnomalyRansomwareRaw(ts, "webhook");
    const doc = wrapRawAsEcs(raw, ts);
    expect(doc.__dataset).toBe("rubrik.webhook");
    expect((doc as any).ecs.version).toBe("8.11.0");
    expect((doc as any).data_stream).toEqual({
      type: "logs",
      dataset: "rubrik.webhook",
      namespace: "default",
    });
    expect((doc.event as any).module).toBe("rubrik");
    expect((doc.event as any).kind).toBe("alert");
    expect((doc.event as any).outcome).toBe("success");
    expect((doc.event as any).severity).toBe(90);
    expect((doc.rubrik as any).severity).toBe("critical");
    expect((doc.rubrik as any).status).toBe("Success");
    expect((doc.rubrik as any).activity.name).toBe("RansomwareStrainDetected");
  });

  it("UI generators return documents with __dataset", () => {
    const wh = generateRubrikWebhookLog(ts, 0.2);
    const gq = generateRubrikGraphqlLog(ts, 0.2);
    const sy = generateRubrikSyslogLog(ts, 0.2);
    for (const doc of [wh, gq, sy].flat()) {
      expect((doc as any).__dataset).toMatch(/^rubrik\./);
      expect((doc as any).event.module).toBe("rubrik");
      expect((doc as any).observer.vendor).toBe("Rubrik");
      expect((doc as any)["@timestamp"]).toBeTruthy();
      expect((doc as any).data_stream.dataset).toMatch(/^rubrik\./);
    }
  });
});
