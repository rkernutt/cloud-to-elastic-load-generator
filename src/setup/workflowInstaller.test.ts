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

  it("rewrites notifyTo in both the inputs block and the step", () => {
    const out = applyWorkflowOverrides(ALERT_ENRICHMENT_WORKFLOW_YAML, {
      notifyTo: "ops@example.org",
    });
    expect(out).toMatch(/- name: notifyTo[\s\S]*?default:\s+"ops@example\.org"/);
    expect(out).not.toMatch(/soc-oncall@example\.com/);
  });

  it("rewrites emailConnector in both the inputs block and the connector-id", () => {
    const out = applyWorkflowOverrides(ALERT_ENRICHMENT_WORKFLOW_YAML, {
      emailConnector: "internal-smtp",
    });
    expect(out).toMatch(/- name: emailConnector[\s\S]*?default:\s+"internal-smtp"/);
    expect(out).toMatch(/connector-id:\s+"internal-smtp"/);
    expect(out).not.toMatch(/connector-id:\s+"\{\{ inputs\.emailConnector \}\}"/);
  });

  it("escapes quotes inside override values to keep the YAML valid", () => {
    const out = applyWorkflowOverrides(ALERT_ENRICHMENT_WORKFLOW_YAML, {
      notifyTo: 'oncall"+team@example.org',
    });
    expect(out).toContain('default: "oncall\\"+team@example.org"');
  });

  it("does not contain validate_email_connector or create_case steps", () => {
    const out = applyWorkflowOverrides(ALERT_ENRICHMENT_WORKFLOW_YAML);
    expect(out).not.toMatch(/validate_email_connector/);
    expect(out).not.toMatch(/create_case/);
    expect(out).not.toMatch(/kibana\.createCaseDefaultSpace/);
    expect(out).not.toMatch(/cases\.createCase/);
  });

  it("produces valid YAML for every override combination", () => {
    const combos = [
      {},
      { notifyTo: "ops@example.org" },
      { emailConnector: "internal-smtp" },
      { notifyTo: "ops@example.org", emailConnector: "internal-smtp" },
    ];
    for (const c of combos) {
      const transformed = applyWorkflowOverrides(ALERT_ENRICHMENT_WORKFLOW_YAML, c);
      expect(() => yaml.load(transformed)).not.toThrow();
    }
  });
});
