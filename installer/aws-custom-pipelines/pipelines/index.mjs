/**
 * Public API for the pipeline registry.
 * Provides helpers to query pipelines by group and to list all groups.
 */

import { PIPELINE_REGISTRY } from "./registry.mjs";

/**
 * Returns all pipelines belonging to `groupName`.
 * Pass "all" to receive the complete registry.
 *
 * @param {string} groupName
 * @returns {Array}
 */
export function getPipelinesByGroup(groupName) {
  if (groupName === "all") {
    return PIPELINE_REGISTRY;
  }
  return PIPELINE_REGISTRY.filter((p) => p.group === groupName);
}

/**
 * Returns a sorted array of unique group names present in the registry.
 *
 * @returns {string[]}
 */
export function getGroups() {
  const groups = new Set(PIPELINE_REGISTRY.map((p) => p.group));
  return [...groups].sort();
}

export { PIPELINE_REGISTRY };
