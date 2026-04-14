import type { CloudId } from "../cloud/types";
import type { DashboardDef, MlJobEntry, MlJobFile, PipelineEntry } from "./types";

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

/**
 * AWS dashboard titles whose em-dash fragment is not a service slug (e.g. "CI/CD" vs codebuild).
 * Full-title hints align Setup grouping with the Services catalog.
 */
function awsDashboardTitleExtraMatchKeys(fullTitle: string): string[] {
  const t = fullTitle.toLowerCase();
  const keys: string[] = [];
  if (
    t.includes("codepipeline") ||
    t.includes("codebuild") ||
    /\bcicd\b/.test(t) ||
    t.includes("ci/cd")
  ) {
    keys.push("codepipeline", "codebuild", "cicd");
  }
  if (t.includes("augmented ai") || t.includes("augmentedai") || /\ba2i\b/.test(t)) {
    keys.push("a2i");
  }
  if (t.includes("app recovery controller") || t.includes("recovery controller")) {
    keys.push("arc");
  }
  return keys;
}

/** Candidate strings to match against `serviceIds` (exact or squish). */
export function dashboardInferredMatchKeys(d: DashboardDef, cloudId: CloudId): string[] {
  const keys = new Set<string>();
  const frag = dashboardTitleServiceFragment(d, cloudId);
  if (frag) {
    keys.add(frag.toLowerCase());
    keys.add(frag.toLowerCase().replace(/\s+/g, "-"));
    keys.add(squishId(frag));
    for (const w of frag.toLowerCase().split(/\s+/)) {
      if (w.length > 1) keys.add(w);
    }
  }
  const title = d.title?.trim() ?? "";
  if (cloudId === "aws" && title) {
    for (const k of awsDashboardTitleExtraMatchKeys(title)) {
      keys.add(k);
      keys.add(squishId(k));
    }
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

function inferredKeysMatchSelectedServices(
  keys: string[],
  selectedServiceIds: Set<string>
): boolean {
  if (selectedServiceIds.size === 0) return false;
  for (const key of keys) {
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
  return inferredKeysMatchSelectedServices(
    dashboardInferredMatchKeys(d, cloudId),
    selectedServiceIds
  );
}

/**
 * `event.dataset`-style segments that do not match catalog ids (e.g. vpcflow vs vpc, rdscustom vs rds).
 */
const AWS_ML_DATASET_SEGMENT_ALIASES: Record<string, string[]> = {
  vpcflow: ["vpc"],
  rdscustom: ["rds"],
  s3_intelligent_tiering: ["s3"],
  pcs: ["parallelcomputing"],
  /** CloudWatch Kafka metrics / MSK-adjacent datasets → MSK (Kafka) in Streaming & Messaging */
  kafka_metrics: ["msk"],
  /** WAF v2 logs align with classic WAF under Networking & CDN */
  wafv2: ["waf"],
  /** Classic ELB / ALB access logs (`aws.elb_logs`) */
  elb_logs: ["alb"],
  /** ECS CloudWatch metrics (`aws.ecs_metrics`) — ECS lives under Serverless & Core */
  ecs_metrics: ["ecs"],
  /** Network Firewall (`aws.firewall_logs`) */
  firewall_logs: ["networkfirewall"],
};

function addKeysFromAwsMlSegment(seg: string, keys: Set<string>): void {
  keys.add(seg);
  keys.add(squishId(seg));
  if (seg.includes("_")) keys.add(seg.replace(/_/g, ""));
  const aliases = AWS_ML_DATASET_SEGMENT_ALIASES[seg];
  if (!aliases) return;
  for (const a of aliases) {
    keys.add(a);
    keys.add(squishId(a));
  }
}

/**
 * Candidate slugs from an ML job (id, description, datafeed query, job config) for service alignment.
 * AWS: `aws.<service>` segments in serialized config (e.g. event.dataset aws.kendra → kendra).
 */
export function mlJobInferredMatchKeys(j: MlJobEntry, cloudId: CloudId): string[] {
  const keys = new Set<string>();
  const idPart = (j.id ?? "").toLowerCase();
  const desc = (j.description ?? "").toLowerCase();
  const feed = JSON.stringify(j.datafeed ?? {}).toLowerCase();
  const jobSpec = JSON.stringify(j.job ?? {}).toLowerCase();
  const blob = `${idPart} ${desc} ${feed} ${jobSpec}`;

  const cloudPrefix =
    cloudId === "azure" ? "azure" : cloudId === "gcp" ? "gcp" : cloudId === "aws" ? "aws" : null;
  if (cloudPrefix) {
    const re = new RegExp(`\\b${cloudPrefix}\\.([a-z0-9_]+)`, "g");
    for (const m of blob.matchAll(re)) {
      addKeysFromAwsMlSegment(m[1], keys);
    }
  }

  // Avoid id tokens like "metrics" / "failure" fuzzy-matching unrelated services when dataset is explicit.
  const useIdDerivedTokens = cloudId !== "aws" || !feed.includes("event.dataset");
  if (useIdDerivedTokens) {
    for (const part of idPart.split(/[^a-z0-9]+/)) {
      if (part.length >= 2 && part !== "aws" && part !== "gcp" && part !== "azure") keys.add(part);
    }
  }
  return [...keys].filter(Boolean);
}

/** Single ML job aligns with at least one selected service id (same fuzzy rules as dashboards). */
export function mlJobEntryMatchesSelectedServices(
  j: MlJobEntry,
  cloudId: CloudId,
  selectedServiceIds: Set<string>
): boolean {
  return inferredKeysMatchSelectedServices(mlJobInferredMatchKeys(j, cloudId), selectedServiceIds);
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
