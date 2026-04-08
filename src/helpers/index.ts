export { enrichDocument, type EnrichOptions } from "./enrich";

// ─── Helpers ───────────────────────────────────────────────────────────────
export const REGIONS = [
  // US
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  // Canada
  "ca-central-1",
  "ca-west-1",
  // South America
  "sa-east-1",
  // Europe
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "eu-central-1",
  "eu-central-2",
  "eu-north-1",
  "eu-south-1",
  "eu-south-2",
  // Middle East & Africa
  "me-south-1",
  "me-central-1",
  "af-south-1",
  "il-central-1",
  // Asia Pacific
  "ap-east-1",
  "ap-south-1",
  "ap-south-2",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-southeast-3",
  "ap-southeast-4",
  "ap-northeast-1",
  "ap-northeast-2",
  "ap-northeast-3",
] as const;
export const rand = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
export const randInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;
/** Uniform random float in [min, max]. */
export const randFloat = (min: number, max: number): number => Math.random() * (max - min) + min;
export const randId = (len = 8) =>
  Math.random()
    .toString(36)
    .substring(2, 2 + len)
    .toUpperCase();
export const randIp = () =>
  `${randInt(1, 254)}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`;
export const randTs = (start: Date, end: Date) =>
  new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime())).toISOString();
export const PROTOCOLS: Record<number, string> = { 6: "TCP", 17: "UDP", 1: "ICMP" };
export const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;
export const HTTP_PATHS = [
  "/api/v1/users",
  "/api/v1/products",
  "/api/v1/orders",
  "/api/v1/auth/login",
  "/api/v1/search",
  "/health",
  "/api/v2/events",
] as const;
export const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  "curl/7.68.0",
  "python-requests/2.27.1",
  "Go-http-client/1.1",
] as const;

// ─── AWS Account Pool ───────────────────────────────────────────────────────
export interface AwsAccount {
  id: string;
  name: string;
}
export const ACCOUNTS: AwsAccount[] = [
  { id: "814726593401", name: "globex-production" },
  { id: "293847561023", name: "globex-staging" },
  { id: "738291046572", name: "globex-development" },
  { id: "501938274650", name: "globex-security-tooling" },
  { id: "164820739518", name: "globex-shared-services" },
];
export const randAccount = () => rand(ACCOUNTS);
export const randUUID = () =>
  `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`.toLowerCase();

/**
 * Returns common per-document setup values used by every generator.
 */
export function makeSetup(er: number) {
  const clampedEr = Math.min(1, Math.max(0, er));
  return { region: rand(REGIONS), acct: randAccount(), isErr: Math.random() < clampedEr };
}

/** Recursively remove object keys whose value is null so output has no pointless null fields. */
export function stripNulls(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(stripNulls);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null) continue;
    out[k] = stripNulls(v);
  }
  return out;
}
