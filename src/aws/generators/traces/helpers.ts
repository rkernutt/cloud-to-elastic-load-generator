/**
 * Shared helpers for APM/OTel trace document generation.
 */

export const TRACE_REGIONS = [
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
];

export const TRACE_ACCOUNTS = [
  { id: "123456789012", name: "prod-aws" },
  { id: "234567890123", name: "staging-aws" },
  { id: "345678901234", name: "dev-aws" },
];

/** Lowercase hex string of `len` characters (len = 2× byte count). */
export function randHex(len: number) {
  let h = "";
  for (let i = 0; i < len; i++) h += Math.floor(Math.random() * 16).toString(16);
  return h;
}

/** 32-char hex trace ID (16 bytes, OTel spec). */
export function newTraceId() {
  return randHex(32);
}

/** 16-char hex span ID (8 bytes, OTel spec). */
export function newSpanId() {
  return randHex(16);
}

export function rand<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
export function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
export function randFloat(min: number, max: number, dp = 2) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(dp));
}

/** Offset a Date by +ms and return ISO string. */
export function offsetTs(baseDate: Date, offsetMs: number) {
  return new Date(baseDate.getTime() + offsetMs).toISOString();
}

/**
 * Build the common service block for all APM docs in a trace.
 * language: "python" | "nodejs" | "java" | "go"
 */
export function serviceBlock(
  name: string,
  environment: string,
  language: string,
  framework: string | null | undefined,
  runtimeName: string,
  runtimeVersion: string
) {
  return {
    name,
    environment,
    version: "1.0.0",
    language: { name: language },
    runtime: { name: runtimeName, version: runtimeVersion },
    framework: framework ? { name: framework } : undefined,
  };
}

/**
 * Build the agent + telemetry blocks for OTel (OTLP) ingestion via EDOT.
 * distro: "elastic" (EDOT) | "aws" (ADOT)
 */
export type OtelLang = "python" | "nodejs" | "java" | "go";
type OtelDistro = "elastic" | "aws";

export function otelBlocks(language: string, distro: string = "elastic") {
  const sdkVersions = { python: "1.29.0", nodejs: "1.30.1", java: "2.12.0", go: "1.32.0" } as const;
  const distroVersions = {
    elastic: { python: "0.6.0", nodejs: "1.4.0", java: "1.6.0", go: "0.5.0" },
    aws: { python: "1.0.4", nodejs: "1.30.1", java: "1.32.2", go: "1.32.0" },
  } as const;
  const d: OtelDistro = distro === "aws" ? "aws" : "elastic";
  const lang = language as OtelLang;
  return {
    ecs: { version: "8.11.0" },
    agent: { name: "otlp", version: distroVersions[d][lang] ?? "1.0.0" },
    input: { type: "opentelemetry" },
    telemetry: {
      sdk: { name: "opentelemetry", language, version: sdkVersions[lang] ?? "1.0.0" },
      distro: {
        name: d === "elastic" ? "elastic" : "aws-otel",
        version: distroVersions[d][lang] ?? "1.0.0",
      },
    },
  };
}
