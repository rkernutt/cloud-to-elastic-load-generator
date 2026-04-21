/**
 * Shared helpers for generating realistic CSPM/KSPM findings documents
 * that match the exact schema produced by Elastic's cloudbeat agent.
 *
 * The `cloud_security_posture` integration uses cloudbeat to evaluate cloud
 * resources against CIS benchmarks. This module generates findings documents
 * identical to what cloudbeat would produce, using the real CIS rule UUIDs,
 * names, sections, and benchmark metadata from elastic/cloudbeat.
 *
 * @see https://github.com/elastic/cloudbeat
 */

import type { CisBenchmarkRule } from "./cisBenchmarkRules.js";

export interface CspFindingResource {
  id: string;
  name: string;
  type: string;
  sub_type: string;
  raw?: Record<string, unknown>;
}

export interface CspFinding {
  "@timestamp": string;
  __dataset: "cloud_security_posture.findings";
  data_stream: {
    dataset: "cloud_security_posture.findings";
    namespace: "default";
    type: "logs";
  };
  cloud: Record<string, unknown>;
  orchestrator?: Record<string, unknown>;
  resource: CspFindingResource;
  rule: {
    id: string;
    name: string;
    section: string;
    description: string;
    tags: string[];
    benchmark: {
      id: string;
      name: string;
      version: string;
      rule_number: string;
      posture_type: "cspm" | "kspm";
    };
    profile_applicability: string;
    impact?: string;
    remediation?: string;
  };
  result: {
    evaluation: "passed" | "failed";
    evidence?: Record<string, unknown>;
  };
  event: {
    kind: "state";
    category: ["configuration"];
    type: ["info"];
    outcome: "success" | "failure";
    dataset: "cloud_security_posture.findings";
    provider: string;
    module: string;
  };
  message: string;
  log: { level: string };
}

/**
 * Build a findings document from a CIS rule, evaluation result, and resource.
 * This produces the exact schema that cloudbeat writes to
 * `logs-cloud_security_posture.findings-default`.
 */
export function buildCspFinding(opts: {
  ts: string;
  rule: CisBenchmarkRule;
  isFailed: boolean;
  cloud: Record<string, unknown>;
  resource: CspFindingResource;
  evidence?: Record<string, unknown>;
  orchestrator?: Record<string, unknown>;
  cloudModule: string;
}): CspFinding {
  const evaluation = opts.isFailed ? "failed" : "passed";
  const provider = opts.rule.benchmark.posture_type === "cspm" ? "elastic_cspm" : "elastic_kspm";

  return {
    "@timestamp": opts.ts,
    __dataset: "cloud_security_posture.findings",
    data_stream: {
      dataset: "cloud_security_posture.findings",
      namespace: "default",
      type: "logs",
    },
    cloud: opts.cloud,
    ...(opts.orchestrator ? { orchestrator: opts.orchestrator } : {}),
    resource: opts.resource,
    rule: {
      id: opts.rule.id,
      name: opts.rule.name,
      section: opts.rule.benchmark.rule_number,
      description: opts.rule.description,
      tags: [...opts.rule.tags],
      benchmark: {
        id: opts.rule.benchmark.id,
        name: opts.rule.benchmark.name,
        version: opts.rule.benchmark.version,
        rule_number: opts.rule.benchmark.rule_number,
        posture_type: opts.rule.benchmark.posture_type,
      },
      profile_applicability: `* ${opts.rule.profile}`,
      ...(opts.isFailed
        ? {
            impact: `Non-compliance with ${opts.rule.benchmark.name} ${opts.rule.benchmark.rule_number} — ${opts.rule.name}`,
            remediation: `Remediate per ${opts.rule.benchmark.name} ${opts.rule.benchmark.version} section ${opts.rule.benchmark.rule_number}.`,
          }
        : {}),
    },
    result: {
      evaluation,
      ...(opts.evidence ? { evidence: opts.evidence } : {}),
    },
    event: {
      kind: "state",
      category: ["configuration"],
      type: ["info"],
      outcome: opts.isFailed ? "failure" : "success",
      dataset: "cloud_security_posture.findings",
      provider,
      module: opts.cloudModule,
    },
    message: `[${opts.rule.benchmark.id}/${opts.rule.benchmark.rule_number}] ${evaluation}: ${opts.rule.name}`,
    log: { level: opts.isFailed ? "warn" : "info" },
  } as CspFinding;
}

/**
 * Pick a random item from an array.
 */
export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randHex(len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

export function randBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
