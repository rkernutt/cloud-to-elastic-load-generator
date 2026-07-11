/**
 * Contract: log generators must not embed CloudWatch / Cloud Monitoring metric payloads.
 * Metrics belong in dedicated metrics generators (metrics-* datasets) or chain scenarios
 * that route via __dataset.
 */
import { describe, it, expect } from "vitest";
import { GENERATORS as AWS_GENERATORS } from "../aws/generators/index.js";
import { GCP_GENERATORS } from "../gcp/generators/index.js";
import { AZURE_GENERATORS } from "../azure/generators/index.js";

const TS = "2026-01-15T12:00:00.000Z";
const SAMPLES_PER_SERVICE = 12;

const CLOUD_PREFIXES = ["aws", "gcp", "azure"] as const;

const RDS_CW_METRIC_FIELDS = [
  "cpu",
  "freeable_memory",
  "free_storage",
  "database_connections",
  "read_io",
  "write_io",
  "throughput",
  "replica_lag",
  "swap_usage",
  "enhanced_monitoring",
  "disk_usage",
] as const;

const SKIP_SERVICE_IDS = new Set(["servicenow_cmdb", "cspm", "kspm", "azure-cspm", "azure-kspm"]);

type LooseDoc = Record<string, unknown>;

function isChainScenario(id: string): boolean {
  return id.endsWith("-chain") || id.includes("-chain");
}

function isNonLogDoc(doc: LooseDoc): boolean {
  const ds = doc.__dataset;
  const dsType = (doc.data_stream as { type?: string } | undefined)?.type;
  if (ds === "apm") return true;
  if (typeof ds === "string" && /^(metrics|traces)-/.test(ds)) return true;
  return dsType === "metrics" || dsType === "traces";
}

function rawLogDocs(gen: (t: string, e: number) => unknown, ts: string): LooseDoc[] {
  const raw = gen(ts, 0) as unknown;
  const arr = Array.isArray(raw) ? raw : [raw];
  return (arr as LooseDoc[]).filter((d) => !isNonLogDoc(d));
}

function findEmbeddedMetrics(doc: LooseDoc): string | null {
  if (doc.metrics != null && typeof doc.metrics === "object") {
    return "top-level metrics";
  }

  for (const prefix of CLOUD_PREFIXES) {
    const cloud = doc[prefix];
    if (!cloud || typeof cloud !== "object") continue;
    for (const [svc, svcVal] of Object.entries(cloud as Record<string, unknown>)) {
      if (svc === "dimensions" || svc === "cloudwatch" || svc === "rpc") continue;
      if (
        svcVal &&
        typeof svcVal === "object" &&
        (svcVal as Record<string, unknown>).metrics != null
      ) {
        return `${prefix}.${svc}.metrics`;
      }
    }
  }

  const rds = (doc.aws as Record<string, unknown> | undefined)?.rds;
  if (rds && typeof rds === "object") {
    for (const field of RDS_CW_METRIC_FIELDS) {
      if (field in (rds as Record<string, unknown>)) {
        return `aws.rds.${field}`;
      }
    }
  }

  if (typeof doc.message === "string") {
    try {
      const parsed = JSON.parse(doc.message) as Record<string, unknown>;
      if (parsed.metrics != null && typeof parsed.metrics === "object") {
        return "message.metrics";
      }
    } catch {
      /* plain-text log line */
    }
  }

  const jsonPayload = doc.jsonPayload;
  if (jsonPayload && typeof jsonPayload === "object") {
    if ((jsonPayload as Record<string, unknown>).metrics != null) {
      return "jsonPayload.metrics";
    }
  }

  return null;
}

function assertNoEmbeddedMetrics(cloud: string, serviceId: string, docs: LooseDoc[]): void {
  for (const doc of docs) {
    const violation = findEmbeddedMetrics(doc);
    expect(violation, `${cloud}/${serviceId}: ${violation ?? "ok"}`).toBeNull();
  }
}

describe("noMetricsInLogs contract", () => {
  it("AWS log generators do not embed metrics", () => {
    for (const [id, gen] of Object.entries(AWS_GENERATORS)) {
      if (isChainScenario(id) || SKIP_SERVICE_IDS.has(id)) continue;
      const docs: LooseDoc[] = [];
      for (let i = 0; i < SAMPLES_PER_SERVICE; i++) {
        docs.push(...rawLogDocs(gen, TS));
      }
      assertNoEmbeddedMetrics("aws", id, docs);
    }
  });

  it("GCP log generators do not embed metrics", () => {
    for (const [id, gen] of Object.entries(GCP_GENERATORS)) {
      if (isChainScenario(id)) continue;
      const docs: LooseDoc[] = [];
      for (let i = 0; i < SAMPLES_PER_SERVICE; i++) {
        docs.push(...rawLogDocs(gen, TS));
      }
      assertNoEmbeddedMetrics("gcp", id, docs);
    }
  });

  it("Azure log generators do not embed metrics", () => {
    for (const [id, gen] of Object.entries(AZURE_GENERATORS)) {
      if (isChainScenario(id) || SKIP_SERVICE_IDS.has(id)) continue;
      const docs: LooseDoc[] = [];
      for (let i = 0; i < SAMPLES_PER_SERVICE; i++) {
        docs.push(...rawLogDocs(gen as (t: string, e: number) => unknown, TS));
      }
      assertNoEmbeddedMetrics("azure", id, docs);
    }
  });
});
