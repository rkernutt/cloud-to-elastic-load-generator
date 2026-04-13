import type { CloudId } from "../cloud/types";
import type { DashboardDef, MlJobFile, PipelineEntry } from "./types";

/** Normalize for fuzzy comparison (e.g. "API Gateway" vs apigateway). */
export function squishId(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Dataset suffix or pipeline id core as candidate service slugs (e.g. lambda_logs → lambda_logs, lambda).
 */
export function pipelineInferredServiceIds(p: PipelineEntry): string[] {
  const out = new Set<string>();
  if (p.dataset && typeof p.dataset === "string") {
    const dot = p.dataset.lastIndexOf(".");
    if (dot >= 0) out.add(p.dataset.slice(dot + 1).toLowerCase());
  }
  const m = p.id.match(/^logs-(?:aws|gcp|azure)\.([^-]+)-default$/);
  if (m) {
    const core = m[1].toLowerCase();
    out.add(core);
    out.add(core.replace(/_logs$/, ""));
    out.add(core.replace(/_/g, ""));
  }
  return [...out].filter(Boolean);
}

export function dashboardTitlePrefix(cloudId: CloudId): "AWS" | "GCP" | "Azure" {
  if (cloudId === "azure") return "Azure";
  if (cloudId === "gcp") return "GCP";
  return "AWS";
}

/**
 * Infer title fragment after cloud prefix (e.g. "Lambda" from "AWS Lambda — …").
 * AWS dashboards use both "AWS …" and "Amazon …" prefixes.
 */
export function dashboardTitleServiceFragment(d: DashboardDef, cloudId: CloudId): string | null {
  const t = d.title?.trim() ?? "";
  if (cloudId === "aws") {
    const awsRe = /^AWS\s+(.+?)\s+[\u2014\u2013-]/i;
    const amzRe = /^Amazon\s+(.+?)\s+[\u2014\u2013-]/i;
    const m = t.match(awsRe) ?? t.match(amzRe);
    return m ? m[1].trim() : null;
  }
  const prefix = dashboardTitlePrefix(cloudId);
  const re = new RegExp(`^${prefix}\\s+(.+?)\\s+[\\u2014\\u2013-]`, "i");
  const m = t.match(re);
  return m ? m[1].trim() : null;
}

/** Candidate strings to match against `serviceIds` (exact or squish). */
export function dashboardInferredMatchKeys(d: DashboardDef, cloudId: CloudId): string[] {
  const frag = dashboardTitleServiceFragment(d, cloudId);
  if (!frag) return [];
  const keys = new Set<string>();
  keys.add(frag.toLowerCase());
  keys.add(frag.toLowerCase().replace(/\s+/g, "-"));
  keys.add(squishId(frag));
  for (const w of frag.toLowerCase().split(/\s+/)) {
    if (w.length > 1) keys.add(w);
  }
  return [...keys].filter(Boolean);
}

function selectedHasSlug(selected: Set<string>, slug: string): boolean {
  const sl = slug.toLowerCase();
  if (selected.has(sl)) return true;
  const sq = squishId(slug);
  for (const s of selected) {
    const l = s.toLowerCase();
    if (l === sl) return true;
    if (squishId(s) === sq && sq.length >= 3) return true;
  }
  return false;
}

/** Pipeline is relevant to at least one selected ship service id. */
export function pipelineMatchesSelectedServices(
  p: PipelineEntry,
  selectedServiceIds: Set<string>
): boolean {
  if (selectedServiceIds.size === 0) return false;
  for (const id of pipelineInferredServiceIds(p)) {
    if (selectedHasSlug(selectedServiceIds, id)) return true;
  }
  return false;
}

/** Dashboard title aligns with at least one selected service id. */
export function dashboardMatchesSelectedServices(
  d: DashboardDef,
  cloudId: CloudId,
  selectedServiceIds: Set<string>
): boolean {
  if (selectedServiceIds.size === 0) return false;
  for (const key of dashboardInferredMatchKeys(d, cloudId)) {
    if (selectedHasSlug(selectedServiceIds, key)) return true;
    const sk = squishId(key);
    for (const s of selectedServiceIds) {
      if (sk && (sk === squishId(s) || sk.includes(squishId(s)) || squishId(s).includes(sk))) {
        if (Math.min(sk.length, squishId(s).length) >= 4) return true;
      }
    }
  }
  return false;
}

/** ML job file mentions selected services in ids, descriptions, or group. */
export function mlJobFileMatchesSelectedServices(
  f: MlJobFile,
  selectedServiceIds: Set<string>
): boolean {
  if (selectedServiceIds.size === 0) return false;
  const blob =
    `${f.group} ${f.description} ` +
    f.jobs
      .map((j) => `${j.id} ${j.description ?? ""}`)
      .join(" ")
      .toLowerCase();
  for (const s of selectedServiceIds) {
    const sl = s.toLowerCase();
    if (!sl) continue;
    if (blob.includes(sl)) return true;
    const squ = sl.replace(/-/g, "");
    if (squ.length >= 3 && blob.replace(/-/g, "").includes(squ)) return true;
  }
  return false;
}

export function pipelineMatchesQuery(p: PipelineEntry, q: string): boolean {
  if (!q.trim()) return true;
  const n = q.trim().toLowerCase();
  const hay =
    `${p.id} ${p.description} ${p.group} ${pipelineInferredServiceIds(p).join(" ")}`.toLowerCase();
  return hay.includes(n);
}

export function dashboardMatchesQuery(d: DashboardDef, i: number, q: string): boolean {
  if (!q.trim()) return true;
  const n = q.trim().toLowerCase();
  const title = (d.title ?? `Dashboard ${i + 1}`).toLowerCase();
  return title.includes(n);
}

export function mlJobFileMatchesQuery(f: MlJobFile, q: string): boolean {
  if (!q.trim()) return true;
  const n = q.trim().toLowerCase();
  const hay = `${f.group} ${f.description} ${f.jobs.map((j) => j.id).join(" ")}`.toLowerCase();
  return hay.includes(n);
}

export function mlJobEntryMatchesQuery(
  j: { id: string; description?: string },
  q: string
): boolean {
  if (!q.trim()) return true;
  const n = q.trim().toLowerCase();
  return `${j.id} ${j.description ?? ""}`.toLowerCase().includes(n);
}
