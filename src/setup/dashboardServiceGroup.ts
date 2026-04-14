import type { CloudId } from "../cloud/types";
import type { ServiceGroup } from "../data/serviceGroups";
import { serviceIdsInGroup } from "../data/serviceGroups";
import type { DashboardDef, MlJobEntry, MlJobFile } from "./types";
import {
  dashboardMatchesSelectedServices,
  mlJobEntryMatchesSelectedServices,
} from "./setupAssetMatch";

/** Unique service ids, longest first so e.g. `apigateway` wins over shorter fuzzy matches. */
function uniqueServiceIdsLongestFirst(groups: ServiceGroup[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const g of groups) {
    for (const id of serviceIdsInGroup(g)) {
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
  }
  ids.sort((a, b) => b.length - a.length);
  return ids;
}

function groupLabelForServiceId(serviceId: string, groups: ServiceGroup[]): string | null {
  for (const g of groups) {
    if (serviceIdsInGroup(g).includes(serviceId)) return g.label;
  }
  return null;
}

/**
 * Maps a dashboard definition to the **Services** wizard group label (e.g. "Compute & Containers")
 * using the same fuzzy matching as "Align with Services".
 */
export function inferDashboardServiceGroupLabel(
  d: DashboardDef,
  cloudId: CloudId,
  serviceGroups: ServiceGroup[]
): string {
  if (serviceGroups.length === 0) return "Uncategorized";
  for (const sid of uniqueServiceIdsLongestFirst(serviceGroups)) {
    if (dashboardMatchesSelectedServices(d, cloudId, new Set([sid]))) {
      return groupLabelForServiceId(sid, serviceGroups) ?? "Uncategorized";
    }
  }
  return "Uncategorized";
}

/**
 * Maps an ML job to the **Services** wizard group label using job id / datafeed / analysis config,
 * same ordering rules as {@link inferDashboardServiceGroupLabel}.
 */
/** When no service matches, bucket AWS ML jobs under Additional Services (not a separate Uncategorized section). */
function mlJobUnmatchedGroupLabel(serviceGroups: ServiceGroup[]): string {
  const additional = serviceGroups.find((g) => g.id === "additional");
  return additional?.label ?? "Uncategorized";
}

export function inferMlJobServiceGroupLabel(
  j: MlJobEntry,
  cloudId: CloudId,
  serviceGroups: ServiceGroup[]
): string {
  if (serviceGroups.length === 0) return "Uncategorized";
  for (const sid of uniqueServiceIdsLongestFirst(serviceGroups)) {
    if (mlJobEntryMatchesSelectedServices(j, cloudId, new Set([sid]))) {
      return groupLabelForServiceId(sid, serviceGroups) ?? mlJobUnmatchedGroupLabel(serviceGroups);
    }
  }
  return mlJobUnmatchedGroupLabel(serviceGroups);
}

/** Partitions ML jobs under ordered service-type headings (for Setup sub-sections). */
export function groupMlJobsByServiceType(
  jobs: MlJobEntry[],
  cloudId: CloudId,
  serviceGroups: ServiceGroup[]
): { label: string; jobs: MlJobEntry[] }[] {
  const byLabel = new Map<string, MlJobEntry[]>();
  for (const j of jobs) {
    const label = inferMlJobServiceGroupLabel(j, cloudId, serviceGroups);
    const arr = byLabel.get(label) ?? [];
    arr.push(j);
    byLabel.set(label, arr);
  }
  const labels = sortDashboardServiceGroupLabels([...byLabel.keys()], serviceGroups);
  return labels.map((label) => {
    const list = [...(byLabel.get(label) ?? [])].sort((a, b) => a.id.localeCompare(b.id));
    return { label, jobs: list };
  });
}

export type MlJobRef = { file: MlJobFile; job: MlJobEntry };

/** Like {@link groupMlJobsByServiceType} but keeps source file on each row (for unified Setup ML lists). */
export function groupMlJobRefsByServiceType(
  refs: MlJobRef[],
  cloudId: CloudId,
  serviceGroups: ServiceGroup[]
): { label: string; refs: MlJobRef[] }[] {
  const byLabel = new Map<string, MlJobRef[]>();
  for (const r of refs) {
    const label = inferMlJobServiceGroupLabel(r.job, cloudId, serviceGroups);
    const arr = byLabel.get(label) ?? [];
    arr.push(r);
    byLabel.set(label, arr);
  }
  const labels = sortDashboardServiceGroupLabels([...byLabel.keys()], serviceGroups);
  return labels.map((label) => ({
    label,
    refs: [...(byLabel.get(label) ?? [])].sort((a, b) => a.job.id.localeCompare(b.job.id)),
  }));
}

/**
 * Order dashboard sections like the Services page; unknown labels last; "Uncategorized" / "Other" last.
 * When `serviceGroups` is empty (fragment-based grouping), sort alphabetically with "Other" last.
 */
export function sortDashboardServiceGroupLabels(
  labels: string[],
  serviceGroups: ServiceGroup[]
): string[] {
  if (serviceGroups.length === 0) {
    return [...labels].sort((a, b) => {
      if (a === "Other") return 1;
      if (b === "Other") return -1;
      return a.localeCompare(b);
    });
  }
  const order = new Map(serviceGroups.map((g, i) => [g.label, i]));
  return [...labels].sort((a, b) => {
    if (a === "Uncategorized") return 1;
    if (b === "Uncategorized") return -1;
    const ia = order.get(a);
    const ib = order.get(b);
    if (ia !== undefined && ib !== undefined && ia !== ib) return ia - ib;
    if (ia !== undefined && ib === undefined) return -1;
    if (ia === undefined && ib !== undefined) return 1;
    return a.localeCompare(b);
  });
}
