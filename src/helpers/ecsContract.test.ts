/**
 * ECS contract tests — validates that generated documents across all three
 * vendors conform to expected ECS field shapes. Generators produce vendor-native
 * data; the ingest pipeline normalises it to ECS. These tests verify that the
 * raw generator output contains the vendor fields the pipeline expects and that
 * any pre-set ECS fields use correct types (arrays for event.category/type).
 */
import { describe, it, expect } from "vitest";

import { GENERATORS as AWS_LOG_GENERATORS } from "../aws/generators/index.js";
import { METRICS_GENERATORS as AWS_METRICS_GENERATORS } from "../aws/generators/metrics/index.js";
import { GCP_GENERATORS } from "../gcp/generators/index.js";
import { GCP_METRICS_GENERATORS } from "../gcp/generators/metrics/index.js";
import { AZURE_GENERATORS as AZURE_LOG_GENERATORS } from "../azure/generators/index.js";
import { AZURE_METRICS_GENERATORS } from "../azure/generators/metrics/index.js";

const TS = "2025-01-15T09:30:00.000Z";
const ER = 0.05;

type AnyDoc = Record<string, any>;

type GenMap = Record<string, (...args: any[]) => any>;

function firstDoc(raw: unknown): AnyDoc {
  return (Array.isArray(raw) ? raw[0] : raw) as AnyDoc;
}

// ─── Log contract ───────────────────────────────────────────────────────────

function assertLogContract(vendor: string, serviceId: string, raw: unknown) {
  const doc = firstDoc(raw);
  if (!doc) return;

  // @timestamp is always required
  expect.soft(doc["@timestamp"], `${vendor}/${serviceId}: missing @timestamp`).toBeTruthy();

  // cloud.provider must match vendor
  const expectedProvider = vendor === "aws" ? "aws" : vendor === "gcp" ? "gcp" : "azure";
  if (doc.cloud?.provider) {
    expect
      .soft(doc.cloud.provider, `${vendor}/${serviceId}: wrong cloud.provider`)
      .toBe(expectedProvider);
  }

  // If event.category is present, it must be an array
  if (doc.event?.category !== undefined) {
    expect
      .soft(
        Array.isArray(doc.event.category),
        `${vendor}/${serviceId}: event.category must be an array, got ${typeof doc.event.category}: ${JSON.stringify(doc.event.category)}`
      )
      .toBe(true);
  }

  // If event.type is present, it must be an array
  if (doc.event?.type !== undefined) {
    expect
      .soft(
        Array.isArray(doc.event.type),
        `${vendor}/${serviceId}: event.type must be an array, got ${typeof doc.event.type}: ${JSON.stringify(doc.event.type)}`
      )
      .toBe(true);
  }

  // event.outcome must be "success", "failure", or "unknown" when present
  if (doc.event?.outcome !== undefined) {
    expect
      .soft(
        ["success", "failure", "unknown"].includes(doc.event.outcome),
        `${vendor}/${serviceId}: invalid event.outcome "${doc.event.outcome}"`
      )
      .toBe(true);
  }

  // message should be a string (vendor-native log line for the pipeline to parse)
  if (doc.message !== undefined) {
    expect
      .soft(typeof doc.message, `${vendor}/${serviceId}: message must be string`)
      .toBe("string");
  }
}

// ─── Metric contract ────────────────────────────────────────────────────────

function assertMetricContract(vendor: string, serviceId: string, raw: unknown) {
  expect.soft(Array.isArray(raw), `${vendor}/${serviceId}: metrics must return array`).toBe(true);
  if (!Array.isArray(raw) || raw.length === 0) return;

  for (const doc of raw as AnyDoc[]) {
    expect
      .soft(doc["@timestamp"], `${vendor}/${serviceId}: metric doc missing @timestamp`)
      .toBeTruthy();

    // Metric docs should have data_stream.type = "metrics"
    if (doc.data_stream?.type) {
      expect
        .soft(doc.data_stream.type, `${vendor}/${serviceId}: metric data_stream.type`)
        .toBe("metrics");
    }

    // If event.outcome is present on a metric doc, it must be a valid value
    if (doc.event?.outcome !== undefined) {
      expect
        .soft(
          ["success", "failure", "unknown"].includes(doc.event.outcome),
          `${vendor}/${serviceId}: metric event.outcome must be valid if present`
        )
        .toBe(true);
    }
  }
}

// ─── Realism: IPs must be realistic ─────────────────────────────────────────

const PRIVATE_PREFIXES = [
  "10.",
  "172.16.",
  "172.17.",
  "172.18.",
  "172.19.",
  "172.2",
  "172.3",
  "192.168.",
];

function isRealisticIp(ip: string): boolean {
  if (PRIVATE_PREFIXES.some((p) => ip.startsWith(p))) return true;
  const first = parseInt(ip.split(".")[0]!, 10);
  return first >= 1 && first <= 254 && first !== 0 && first !== 255;
}

function assertRealisticIps(vendor: string, serviceId: string, doc: AnyDoc) {
  const ips = [doc.source?.ip, doc.destination?.ip, doc.client?.ip, doc.callerIpAddress].filter(
    (v) => typeof v === "string"
  );
  for (const ip of ips) {
    expect.soft(isRealisticIp(ip), `${vendor}/${serviceId}: unrealistic IP "${ip}"`).toBe(true);
  }
}

// ─── AWS resource IDs must be hex ───────────────────────────────────────────

function assertHexResourceIds(serviceId: string, doc: AnyDoc) {
  const candidates: string[] = [];
  const walk = (obj: unknown, depth = 0) => {
    if (depth > 4 || obj == null) return;
    if (typeof obj === "string") candidates.push(obj);
    else if (typeof obj === "object" && !Array.isArray(obj)) {
      for (const v of Object.values(obj as Record<string, unknown>)) walk(v, depth + 1);
    }
  };
  walk(doc.aws);
  const patterns = [
    /\bi-([0-9a-zA-Z]{17})\b/g,
    /\bvol-([0-9a-zA-Z]{17})\b/g,
    /\bsg-([0-9a-zA-Z]{17})\b/g,
  ];
  for (const val of candidates) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(val)) !== null) {
        expect
          .soft(
            /^[0-9a-f]+$/.test(match[1]!),
            `${serviceId}: resource ID should be hex, got "${match[0]}"`
          )
          .toBe(true);
      }
    }
  }
}

// ═══ Test suites ════════════════════════════════════════════════════════════

const awsLogs: GenMap = AWS_LOG_GENERATORS;
const awsMetrics: GenMap = AWS_METRICS_GENERATORS;

describe("ECS contract — AWS logs", () => {
  it.each(Object.keys(awsLogs).map((id) => [id]))(
    "%s conforms to ECS log contract",
    (serviceId) => {
      const raw = awsLogs[serviceId]!(TS, ER);
      assertLogContract("aws", serviceId, raw);
      const doc = firstDoc(raw);
      if (doc) {
        assertRealisticIps("aws", serviceId, doc);
        assertHexResourceIds(serviceId, doc);
      }
    }
  );
});

describe("ECS contract — AWS metrics", () => {
  it.each(Object.keys(awsMetrics).map((id) => [id]))(
    "%s conforms to ECS metric contract",
    (serviceId) => {
      const raw = awsMetrics[serviceId]!(TS, ER);
      assertMetricContract("aws", serviceId, raw);
    }
  );
});

const gcpLogs: GenMap = GCP_GENERATORS;
const gcpMetrics: GenMap = GCP_METRICS_GENERATORS;
const azureLogs: GenMap = AZURE_LOG_GENERATORS;
const azureMetrics: GenMap = AZURE_METRICS_GENERATORS;

describe("ECS contract — GCP logs", () => {
  it.each(Object.keys(gcpLogs).map((id) => [id]))(
    "%s conforms to ECS log contract",
    (serviceId) => {
      const raw = gcpLogs[serviceId]!(TS, ER);
      assertLogContract("gcp", serviceId, raw);
      const doc = firstDoc(raw);
      if (doc) assertRealisticIps("gcp", serviceId, doc);
    }
  );
});

describe("ECS contract — GCP metrics", () => {
  it.each(Object.keys(gcpMetrics).map((id) => [id]))(
    "%s conforms to ECS metric contract",
    (serviceId) => {
      const raw = gcpMetrics[serviceId]!(TS, ER);
      assertMetricContract("gcp", serviceId, raw);
    }
  );
});

describe("ECS contract — Azure logs", () => {
  it.each(Object.keys(azureLogs).map((id) => [id]))(
    "%s conforms to ECS log contract",
    (serviceId) => {
      const raw = azureLogs[serviceId]!(TS, ER);
      assertLogContract("azure", serviceId, raw);
      const doc = firstDoc(raw);
      if (doc) assertRealisticIps("azure", serviceId, doc);
    }
  );
});

describe("ECS contract — Azure metrics", () => {
  it.each(Object.keys(azureMetrics).map((id) => [id]))(
    "%s conforms to ECS metric contract",
    (serviceId) => {
      const raw = azureMetrics[serviceId]!(TS, ER);
      assertMetricContract("azure", serviceId, raw);
    }
  );
});
