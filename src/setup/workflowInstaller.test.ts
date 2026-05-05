import { describe, it, expect } from "vitest";
import yaml from "js-yaml";
import { ALERT_ENRICHMENT_WORKFLOW_YAML } from "./workflowYaml";
import { applyWorkflowOverrides } from "./workflowInstaller";

describe("applyWorkflowOverrides", () => {
  it("returns the original YAML untouched when no overrides are passed", () => {
    expect(applyWorkflowOverrides(ALERT_ENRICHMENT_WORKFLOW_YAML)).toBe(
      ALERT_ENRICHMENT_WORKFLOW_YAML
    );
  });

  it("rewrites notifyTo and emailConnector defaults inside the inputs block", () => {
    const out = applyWorkflowOverrides(ALERT_ENRICHMENT_WORKFLOW_YAML, {
      notifyTo: "ops@example.org",
      emailConnector: "internal-smtp",
    });
    expect(out).toMatch(/- name: notifyTo[\s\S]*?default:\s+"ops@example\.org"/);
    expect(out).toMatch(/- name: emailConnector[\s\S]*?default:\s+"internal-smtp"/);
    expect(out).not.toMatch(/data-platform-oncall@example\.com/);
    expect(out).not.toMatch(/default:\s+"elastic-cloud-email"/);
  });

  it("escapes quotes inside override values to keep the YAML valid", () => {
    const out = applyWorkflowOverrides(ALERT_ENRICHMENT_WORKFLOW_YAML, {
      notifyTo: 'oncall"+team@example.org',
    });
    expect(out).toContain('default: "oncall\\"+team@example.org"');
  });

  it("swaps the legacy case step for cases.createCase when use94CasesStep is true", () => {
    const out = applyWorkflowOverrides(ALERT_ENRICHMENT_WORKFLOW_YAML, {
      use94CasesStep: true,
    });
    expect(out).toMatch(/type:\s+cases\.createCase/);
    expect(out).not.toMatch(/type:\s+kibana\.createCaseDefaultSpace/);
    expect(out).not.toMatch(/Stack 9\.4\+ alternative/);
  });

  it("leaves the legacy case step in place by default", () => {
    const out = applyWorkflowOverrides(ALERT_ENRICHMENT_WORKFLOW_YAML);
    expect(out).toMatch(/type:\s+kibana\.createCaseDefaultSpace/);
    expect(out).toMatch(/Stack 9\.4\+ alternative/);
  });

  it("produces valid YAML for every override combination", () => {
    const combos = [
      {},
      { notifyTo: "ops@example.org" },
      { emailConnector: "internal-smtp" },
      { use94CasesStep: true },
      { notifyTo: "ops@example.org", emailConnector: "internal-smtp", use94CasesStep: true },
    ];
    for (const c of combos) {
      const transformed = applyWorkflowOverrides(ALERT_ENRICHMENT_WORKFLOW_YAML, c);
      expect(() => yaml.load(transformed)).not.toThrow();
    }
  });
});
