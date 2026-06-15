import { describe, it, expect } from "vitest";
import { getSloDefinitions } from "../../installer/slos/sloDefinitions";
import {
  getAgentDef,
  getSecurityAgentDef,
  getAgentTools,
  getSecurityTools,
} from "../../installer/agent-builder/agentDefinitions";
import { buildAgentBuilderBody } from "./runSetupInstall";

/**
 * These tests pin the exact request-body shapes expected by the Kibana
 * Observability SLO API and the Agent Builder API. Both contracts use
 * camelCase and a specific nesting that has regressed before:
 *   - SLO: `timeWindow`, `budgetingMethod`, `indicator.params.timestampField`
 *   - Agent: `configuration.instructions` + `configuration.tools[].tool_ids`
 */
describe("SLO definitions payload shape", () => {
  for (const vendor of ["aws", "gcp", "azure"]) {
    describe(vendor, () => {
      const slos = getSloDefinitions(vendor);

      it("produces availability and pipeline-availability SLOs", () => {
        expect(slos).toHaveLength(2);
        expect(slos.map((s) => s.id)).toEqual([
          `cloudloadgen-${vendor}-availability`,
          `cloudloadgen-${vendor}-pipeline-availability`,
        ]);
      });

      it("uses camelCase top-level keys the Kibana SLO API requires", () => {
        for (const slo of slos) {
          // camelCase present
          expect(slo).toHaveProperty("timeWindow");
          expect(slo).toHaveProperty("budgetingMethod");
          expect(slo.timeWindow).toMatchObject({ duration: "30d", type: "rolling" });
          expect(typeof slo.budgetingMethod).toBe("string");
          // snake_case absent (the regression we are guarding against)
          expect(slo).not.toHaveProperty("time_window");
          expect(slo).not.toHaveProperty("budgeting_method");
        }
      });

      it("nests timestampField (camelCase) inside indicator.params", () => {
        for (const slo of slos) {
          const params = (slo.indicator as { params: Record<string, unknown> }).params;
          expect(params.timestampField).toBe("@timestamp");
          expect(params).not.toHaveProperty("timestamp_field");
        }
      });
    });
  }
});

describe("Agent Builder request body shape", () => {
  it("nests instructions and tool_ids under configuration", () => {
    const body = buildAgentBuilderBody(getAgentDef("aws")) as {
      id: string;
      configuration?: { instructions?: string; tools?: { tool_ids: string[] }[] };
      instructions?: unknown;
      tool_ids?: unknown;
    };

    expect(body.id).toBe("cloudloadgen-aws-analyst");
    expect(body.configuration?.instructions).toBeTypeOf("string");
    expect(body.configuration?.tools?.[0]?.tool_ids.length).toBeGreaterThan(0);

    // The old flat shape (top-level instructions / tool_ids) must not be sent.
    expect(body.instructions).toBeUndefined();
    expect(body.tool_ids).toBeUndefined();
  });

  it("includes every defined tool id plus the platform core tools", () => {
    const agent = getAgentDef("gcp");
    const toolIds = getAgentTools("gcp").map((t) => t.id);
    for (const id of toolIds) {
      expect(agent.toolIds).toContain(id);
    }
    expect(agent.toolIds).toContain("platform.core.esql");
  });

  it("builds a valid body for the SOC analyst agent too", () => {
    const body = buildAgentBuilderBody(getSecurityAgentDef()) as {
      id: string;
      configuration?: { tools?: { tool_ids: string[] }[] };
    };
    const securityToolIds = getSecurityTools().map((t) => t.id);
    expect(body.id).toBe("cloudloadgen-soc-analyst");
    const sentIds = body.configuration?.tools?.[0]?.tool_ids ?? [];
    for (const id of securityToolIds) {
      expect(sentIds).toContain(id);
    }
  });
});
