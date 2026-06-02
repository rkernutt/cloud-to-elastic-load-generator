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
const BASE36 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const randId = (len = 8) => {
  let s = "";
  for (let i = 0; i < len; i++) s += BASE36[(Math.random() * 36) | 0];
  return s;
};
export const randIp = () =>
  `${randInt(1, 254)}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`;
/** RFC1918 private IP weighted toward 10.x (cloud VPC), then 172.16–31.x, then 192.168.x */
export function randPrivateIp(): string {
  const r = Math.random();
  if (r < 0.7) return `10.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`;
  if (r < 0.9) return `172.${randInt(16, 31)}.${randInt(0, 255)}.${randInt(1, 254)}`;
  return `192.168.${randInt(0, 255)}.${randInt(1, 254)}`;
}
export function randHexId(len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += "0123456789abcdef"[Math.floor(Math.random() * 16)];
  return s;
}
/** EC2 private DNS: ip-10-42-1-5.us-east-1.compute.internal */
export function ec2PrivateDns(ip: string, region: string): string {
  return `ip-${ip.replace(/\./g, "-")}.${region}.compute.internal`;
}
export const randPublicIp = () => {
  const first = rand([
    13, 18, 20, 23, 34, 35, 40, 44, 50, 51, 52, 54, 63, 64, 65, 68, 72, 76, 99, 100, 104, 108, 128,
    130, 132, 134, 136, 140, 142, 144, 146, 148, 150, 152, 154, 156, 157, 158, 159, 160, 161, 162,
    163, 164, 165, 166, 168, 170, 171, 193, 194, 195, 196, 198, 199, 200, 201, 202, 203, 204, 205,
    206, 207, 208, 209, 210, 211, 212, 213, 214, 216, 217, 218, 219, 220, 221, 222, 223,
  ]);
  return `${first}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`;
};
export const randTs = (start: Date, end: Date) =>
  new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime())).toISOString();
export const PROTOCOLS: Record<number, string> = { 6: "TCP", 17: "UDP", 1: "ICMP" };
export const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;
export const HTTP_PATHS = [
  // API endpoints
  "/api/v1/users",
  "/api/v1/orders",
  "/api/v1/products",
  "/api/v2/search",
  "/api/v2/analytics",
  "/api/v2/events",
  "/graphql",
  "/webhooks/stripe",
  "/webhooks/github",
  "/auth/login",
  "/auth/token",
  "/auth/refresh",
  "/internal/metrics",
  "/internal/status",
  "/.well-known/openid-configuration",
  // Static assets (common in ALB/CloudFront traffic)
  "/static/js/main.chunk.js",
  "/static/css/app.css",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  "/images/logo.png",
  // Health checks (ELB, Route53, uptime monitors)
  "/health",
  "/healthz",
  "/ping",
  "/_status",
  "/ready",
  // Common scanner / opportunistic probe paths (realistic noise in WAF/ALB logs)
  "/.env",
  "/wp-login.php",
  "/wp-admin/",
  "/admin",
  "/phpinfo.php",
  "/.git/config",
] as const;
export const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.2478.97",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36",
  "aws-sdk-java/2.25.12 ua/2.0 os/Linux lang/java/21.0.2 md/OpenJDK_64-Bit_Server_VM cfg/retry-mode/standard",
  "Boto3/1.34.84 md/Botocore#1.34.84 ua/2.0 os/linux#6.5.0-1016-aws md/arch#x86_64 lang/python#3.12.3",
] as const;

export const SQL_SNIPPETS = [
  "SELECT id, status, updated_at FROM orders WHERE region = $1 LIMIT 100",
  "INSERT INTO events (user_id, action, ts) VALUES ($1, $2, NOW())",
  "SELECT COUNT(*) FROM sessions WHERE created_at > CURRENT_DATE - INTERVAL '7 days'",
  "SELECT customer_id, SUM(amount) FROM invoices WHERE status = 'open' GROUP BY 1",
  "UPDATE inventory SET qty = qty - $1 WHERE sku = $2 AND warehouse_id = $3",
  "DELETE FROM staging_events WHERE ingested_at < NOW() - INTERVAL '30 days'",
] as const;

export const randSqlSnippet = () => rand(SQL_SNIPPETS);

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
  { id: "472918364052", name: "globex-data-platform" },
  { id: "631827495103", name: "globex-networking" },
  { id: "957483012647", name: "globex-sandbox" },
  { id: "283746150928", name: "globex-log-archive" },
  { id: "746392018574", name: "globex-identity" },
  { id: "391827465039", name: "globex-payments-prod" },
  { id: "528174630291", name: "globex-ml-platform" },
];
export const randAccount = () => rand(ACCOUNTS);

// ─── Identity & domain pools (realistic org data) ───────────────────────────
export const IAM_USERS = [
  "jchen",
  "mwilliams",
  "kpatel",
  "agarcia",
  "lkim",
  "svc-deploy-prod",
  "svc-monitoring",
  "svc-cicd-runner",
  "breakglass-ops",
  "platform-admin",
] as const;

export const EMAIL_DOMAINS = [
  "globex.io",
  "cascadeops.com",
  "meridiantech.io",
  "northwind-infra.net",
  "bluepeak.dev",
] as const;

export const FIRST_NAMES = [
  "james",
  "maria",
  "kenji",
  "priya",
  "alex",
  "sarah",
  "omar",
  "lin",
  "daniel",
  "emma",
] as const;

export const LAST_NAMES = [
  "chen",
  "williams",
  "patel",
  "garcia",
  "kim",
  "johnson",
  "ali",
  "zhang",
  "brown",
  "murphy",
] as const;

export const APP_SUBDOMAINS = ["api", "app", "www", "mail", "cdn", "auth", "dashboard"] as const;

export const APP_DOMAINS = [
  "api.globex.io",
  "app.cascadeops.com",
  "www.meridiantech.io",
  "mail.northwind-infra.net",
  "cdn.bluepeak.dev",
  "auth.globex.io",
  "dashboard.cascadeops.com",
] as const;

export interface IspOrg {
  asn: string;
  asnOrg: string;
  isp: string;
  org: string;
}

export const ISP_ORGS: readonly IspOrg[] = [
  {
    asn: "7922",
    asnOrg: "Comcast Cable",
    isp: "Comcast Cable",
    org: "Comcast Cable Communications",
  },
  {
    asn: "7018",
    asnOrg: "AT&T Services",
    isp: "AT&T Internet Services",
    org: "AT&T Services, Inc.",
  },
  {
    asn: "16509",
    asnOrg: "Amazon.com Inc.",
    isp: "Amazon Data Services",
    org: "Amazon.com, Inc.",
  },
  {
    asn: "13335",
    asnOrg: "Cloudflare Inc.",
    isp: "Cloudflare",
    org: "Cloudflare, Inc.",
  },
  {
    asn: "20940",
    asnOrg: "Akamai Technologies",
    isp: "Akamai International",
    org: "Akamai Technologies, Inc.",
  },
  {
    asn: "6461",
    asnOrg: "Zayo Bandwidth",
    isp: "Zayo Group",
    org: "Zayo Bandwidth",
  },
];

export const randIamUser = () => rand(IAM_USERS);
export const randEmailDomain = () => rand(EMAIL_DOMAINS);
export const randPersonEmail = () =>
  `${rand(FIRST_NAMES)}.${rand(LAST_NAMES)}@${rand(EMAIL_DOMAINS)}`;
export const randEmail = (user?: string) => `${user ?? rand(IAM_USERS)}@${rand(EMAIL_DOMAINS)}`;
export const randFqdn = (subdomain?: string) =>
  `${subdomain ?? rand(APP_SUBDOMAINS)}.${rand(EMAIL_DOMAINS)}`;
export const randAppDomain = () => rand(APP_DOMAINS);
export const randIspOrg = () => rand(ISP_ORGS);
export const randVpcCidr16 = () => `10.${randInt(16, 250)}.0.0/16`;
/** EC2/EMR private DNS name: ip-10-42-1-5.us-east-1.compute.internal */
export const emrExecutorHostname = (region: string) => {
  const ip = randPrivateIp();
  return ec2PrivateDns(ip, region);
};
export const randUUID = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`.toLowerCase();

/**
 * Returns common per-document setup values used by every generator.
 */
export function makeSetup(er: number) {
  const clampedEr = Math.min(1, Math.max(0, er));
  return { region: rand(REGIONS), acct: randAccount(), isErr: Math.random() < clampedEr };
}

/** Recursively delete object keys whose value is null — mutates in-place to avoid cloning. */
export function stripNulls(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) stripNulls(obj[i]);
    return obj;
  }
  const rec = obj as Record<string, unknown>;
  for (const k in rec) {
    if (rec[k] === null) delete rec[k];
    else if (typeof rec[k] === "object") stripNulls(rec[k]);
  }
  return rec;
}
