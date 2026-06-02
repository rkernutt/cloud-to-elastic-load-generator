/**
 * GCP-specific helpers for all generators.
 * Mirrors src/helpers/index.ts patterns but for Google Cloud.
 */

export {
  rand,
  randInt,
  randFloat,
  randId,
  randIp,
  randPublicIp,
  randPrivateIp,
  randHexId,
  randTs,
  randUUID,
  stripNulls,
  HTTP_METHODS,
  HTTP_PATHS,
  USER_AGENTS,
  PROTOCOLS,
  IAM_USERS,
  EMAIL_DOMAINS,
  randEmail,
  randFqdn,
  randAppDomain,
  randIamUser,
  APP_DOMAINS,
  SQL_SNIPPETS,
  randSqlSnippet,
} from "../../helpers";
import { rand, randInt, randId, randEmail, EMAIL_DOMAINS } from "../../helpers";
export { randSourceIp } from "../../helpers/identity.js";

export function gcpStatusMessage(code: string, resource: string): string {
  switch (code) {
    case "PERMISSION_DENIED":
      return `Permission denied on resource '${resource}'`;
    case "NOT_FOUND":
      return `Resource '${resource}' not found`;
    case "ALREADY_EXISTS":
      return `Resource '${resource}' already exists`;
    case "INTERNAL":
      return `Internal error occurred while processing request for '${resource}'`;
    case "DEADLINE_EXCEEDED":
      return `Deadline exceeded while waiting for response from '${resource}'`;
    case "UNAVAILABLE":
      return `Service temporarily unavailable for '${resource}'`;
    case "RESOURCE_EXHAUSTED":
      return `Quota exceeded for resource '${resource}'`;
    default:
      return `Operation failed: ${code}`;
  }
}

export type {
  EcsDocument,
  LogGenerator,
  MetricGenerator,
  TraceGenerator,
} from "../../aws/generators/types";

export const GCP_REGIONS = [
  "us-central1",
  "us-east1",
  "us-east4",
  "us-east5",
  "us-south1",
  "us-west1",
  "us-west2",
  "us-west3",
  "us-west4",
  "northamerica-northeast1",
  "northamerica-northeast2",
  "southamerica-east1",
  "southamerica-west1",
  "europe-west1",
  "europe-west2",
  "europe-west3",
  "europe-west4",
  "europe-west6",
  "europe-west8",
  "europe-west9",
  "europe-west12",
  "europe-north1",
  "europe-central2",
  "europe-southwest1",
  "asia-east1",
  "asia-east2",
  "asia-northeast1",
  "asia-northeast2",
  "asia-northeast3",
  "asia-south1",
  "asia-south2",
  "asia-southeast1",
  "asia-southeast2",
  "australia-southeast1",
  "australia-southeast2",
  "me-west1",
  "me-central1",
  "me-central2",
  "africa-south1",
] as const;

export const GCP_ZONE_SUFFIXES = ["a", "b", "c", "f"] as const;

export function randZone(region?: string): string {
  const r = region ?? rand(GCP_REGIONS);
  return `${r}-${rand(GCP_ZONE_SUFFIXES)}`;
}

export interface GcpProject {
  id: string;
  name: string;
  number: string;
}

export const GCP_PROJECTS: GcpProject[] = [
  { id: "globex-prod-482910", name: "Globex Production", number: "482910375621" },
  { id: "globex-stg-739158", name: "Globex Staging", number: "739158264830" },
  { id: "globex-dev-615094", name: "Globex Development", number: "615094738261" },
  { id: "globex-sec-847293", name: "Globex Security", number: "847293615048" },
  { id: "globex-shared-529384", name: "Globex Shared Services", number: "529384716205" },
];

export const randProject = (): GcpProject => rand(GCP_PROJECTS);

export function randServiceAccount(project?: GcpProject): string {
  const p = project ?? randProject();
  const names = [
    "default",
    "gke-workload-sa",
    "cloud-run-ingest-sa",
    "dataflow-etl-sa",
    "composer-orchestration-sa",
    "deployer-sa",
    "monitoring-sa",
    "gke-node-pool-sa",
  ];
  return `${rand(names)}@${p.id}.iam.gserviceaccount.com`;
}

export function randPrincipal(project?: GcpProject): string {
  const p = project ?? randProject();
  const types = [
    `user:${randEmail("platform-admin")}`,
    `user:${randEmail()}`,
    `serviceAccount:${randServiceAccount(p)}`,
    `group:engineering@${rand(EMAIL_DOMAINS)}`,
  ];
  return rand(types);
}

export function randGceInstance(): { name: string; id: string } {
  const prefixes = ["web", "api", "worker", "db", "cache", "proxy", "batch", "node"];
  return {
    name: `${rand(prefixes)}-${randId(4).toLowerCase()}`,
    id: `${randInt(1000000000000, 9999999999999)}`,
  };
}

export function randGkeCluster(): string {
  const names = [
    "gke-prod-us-central1-01",
    "gke-staging-europe-west1",
    "gke-dev-us-east1",
    "gke-data-us-west1",
    "gke-ml-asia-southeast1",
    "gke-edge-europe-west4",
  ];
  return rand(names);
}

export function randGkePod(): string {
  const deploys = ["nginx", "api-server", "worker", "redis", "postgres", "envoy", "collector"];
  return `${rand(deploys)}-${randId(5).toLowerCase()}-${randId(5).toLowerCase()}`;
}

export function randGkeNamespace(): string {
  return rand(["default", "kube-system", "production", "staging", "monitoring", "data-pipeline"]);
}

export function randNetworkTag(): string {
  return rand(["allow-http", "allow-https", "allow-ssh", "internal-only", "bastion", "egress-nat"]);
}

export function randSubnet(region?: string, project?: GcpProject): string {
  const r = region ?? rand(GCP_REGIONS);
  const p = project ?? randProject();
  const names = ["default", "private", "public", "gke-pods", "gke-services", "data"];
  return `projects/${p.id}/regions/${r}/subnetworks/${rand(names)}`;
}

export function randVpcNetwork(): string {
  return rand(["default", "prod-vpc", "staging-vpc", "shared-vpc", "data-vpc"]);
}

export function randBucket(): string {
  const p = randProject();
  const suffixes = ["data", "logs", "backups", "assets", "uploads", "exports", "staging", "raw"];
  return `${p.id}-${rand(suffixes)}`;
}

export function randBigQueryDataset(): string {
  return rand([
    "analytics",
    "raw_events",
    "reporting",
    "ml_features",
    "data_warehouse",
    "audit_logs",
    "billing_export",
  ]);
}

export function randBigQueryTable(): string {
  return rand([
    "events",
    "users",
    "transactions",
    "page_views",
    "sessions",
    "orders",
    "inventory",
    "clickstream",
  ]);
}

export function gcpCloud(region: string, project: GcpProject, serviceName: string) {
  return {
    provider: "gcp",
    region,
    project: { id: project.id, name: project.name },
    account: { id: project.number, name: project.name },
    service: { name: serviceName },
  };
}

export function makeGcpSetup(er: number) {
  const clampedEr = Math.min(1, Math.max(0, er));
  return {
    region: rand(GCP_REGIONS),
    project: randProject(),
    isErr: Math.random() < clampedEr,
  };
}

export function randOperationId(): string {
  return `operation-${randId(8).toLowerCase()}-${randId(4).toLowerCase()}-${randId(4).toLowerCase()}`;
}

export function randTraceId(): string {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

export function randSpanId(): string {
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

export function randLatencyMs(baseMs: number, isErr: boolean): number {
  const factor = isErr ? randInt(3, 15) : 1;
  return Math.round(baseMs * factor * (0.5 + Math.random()));
}

export function randSeverity(isErr: boolean): string {
  if (isErr) return rand(["ERROR", "CRITICAL", "WARNING"] as const);
  return rand(["INFO", "NOTICE", "DEBUG"] as const);
}

export function randHttpStatus(isErr: boolean): number {
  if (isErr) return rand([400, 401, 403, 404, 429, 500, 502, 503, 504]);
  return rand([200, 200, 200, 201, 204, 301, 302]);
}

export type GcpEventCategory =
  | "api"
  | "authentication"
  | "configuration"
  | "database"
  | "file"
  | "host"
  | "iam"
  | "network"
  | "process"
  | "web";

export type GcpEventType =
  | "access"
  | "admin"
  | "change"
  | "connection"
  | "creation"
  | "deletion"
  | "error"
  | "info"
  | "start"
  | "end";

/** ECS event block for GCP log generators (category/type are always arrays). */
export function gcpLogEvent(
  isErr: boolean,
  duration: number,
  action: string,
  category: readonly GcpEventCategory[],
  type?: readonly GcpEventType[]
) {
  return {
    kind: "event" as const,
    category,
    type: type ?? (isErr ? (["error"] as const) : (["access"] as const)),
    action,
    outcome: isErr ? ("failure" as const) : ("success" as const),
    duration,
  };
}
