import type { ServiceGroup } from "../data/serviceGroups";
import { serviceIdsInGroup } from "../data/serviceGroups";

export const FINDINGS_GROUP_ID = "findings";

export function findingsServiceIdSet(serviceGroups: ServiceGroup[]): Set<string> {
  const g = serviceGroups.find((x) => x.id === FINDINGS_GROUP_ID);
  return new Set(g ? serviceIdsInGroup(g) : []);
}

export function buildWizardStepIds(includeSecurityPatterns: boolean): string[] {
  if (includeSecurityPatterns) {
    return ["connection", "setup", "services", "security", "config", "ship"];
  }
  return ["connection", "setup", "services", "config", "ship"];
}

export const WIZARD_STEP_TITLE: Record<string, string> = {
  connection: "Start",
  setup: "Setup",
  services: "Service Selection",
  security: "Security/Attack Patterns",
  config: "Configure",
  ship: "Ship",
};
