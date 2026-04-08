/**
 * Generic Azure metric generator — templates by category.
 */

import { randInt } from "./helpers.js";
import { azureMetricDoc, pickAzureContext, jitter, dp, stat, counter } from "./helpers.js";
import type { MetricGenerator } from "../../../aws/generators/types.js";

type TemplatePart =
  | { dim: string; vals: string[] }
  | { metrics: (er: number) => Record<string, unknown> };

const AZURE_METRIC_TEMPLATES: Record<string, TemplatePart[]> = {
  compute: [
    { dim: "instance_id", vals: ["vm-1", "vm-2", "vmss-node-3"] },
    {
      metrics: (er) => ({
        cpu_percent: stat(dp(jitter(40, 35, 5, 99))),
        network_in: counter(randInt(0, 400_000_000)),
        network_out: counter(randInt(0, 250_000_000)),
        disk_ops: counter(Math.random() < er ? randInt(1, 5000) : randInt(0, 500)),
      }),
    },
  ],
  kubernetes: [
    { dim: "node_name", vals: ["nodepool-0", "nodepool-1", "system-2"] },
    {
      metrics: (er) => ({
        pod_count: counter(randInt(5, 500)),
        cpu_usage: stat(dp(jitter(55, 30, 5, 100))),
        failed_pods: counter(Math.random() < er ? randInt(1, 20) : 0),
      }),
    },
  ],
  database: [
    { dim: "database_name", vals: ["appdb", "reportdb", "authdb"] },
    {
      metrics: (er) => ({
        dtu_percent: stat(dp(jitter(45, 40, 5, 100))),
        connections: counter(randInt(0, 2000)),
        deadlocks: counter(Math.random() < er ? randInt(1, 50) : 0),
      }),
    },
  ],
  networking: [
    { dim: "frontend_id", vals: ["fe-prod", "fe-staging", "fe-internal"] },
    {
      metrics: (er) => ({
        byte_count: counter(randInt(0, 900_000_000)),
        packet_count: counter(randInt(0, 12_000_000)),
        health_probe_failed: counter(Math.random() < er ? randInt(1, 100) : 0),
      }),
    },
  ],
  storage: [
    { dim: "account_name", vals: ["stprod", "stdatalake", "stlogs"] },
    {
      metrics: (er) => ({
        used_capacity: counter(randInt(1_000_000, 50_000_000_000)),
        transactions: counter(randInt(0, 5_000_000)),
        server_errors: counter(Math.random() < er ? randInt(1, 2000) : 0),
      }),
    },
  ],
  messaging: [
    { dim: "entity_name", vals: ["orders", "events", "audit"] },
    {
      metrics: (er) => ({
        incoming_messages: counter(randInt(0, 2_000_000)),
        outgoing_messages: counter(randInt(0, 1_900_000)),
        dead_letter_errors: counter(Math.random() < er ? randInt(1, 500) : 0),
      }),
    },
  ],
  ml: [
    { dim: "deployment", vals: ["gpt-deploy", "embed-1", "classifier"] },
    {
      metrics: (er) => ({
        token_count: counter(randInt(0, 20_000_000)),
        latency_ms: stat(dp(jitter(120, 100, 5, 30_000))),
        rate_limit_errors: counter(Math.random() < er ? randInt(1, 1000) : 0),
      }),
    },
  ],
  observability: [
    { dim: "workspace", vals: ["law-prod", "law-stg"] },
    {
      metrics: (er) => ({
        ingestion_volume: counter(randInt(0, 50_000_000_000)),
        query_count: counter(randInt(0, 800_000)),
        ingestion_errors: counter(Math.random() < er ? randInt(1, 5000) : 0),
      }),
    },
  ],
  security: [
    { dim: "vault_name", vals: ["kv-prod", "kv-shared"] },
    {
      metrics: (er) => ({
        api_call_count: counter(randInt(0, 500_000)),
        forbidden_count: counter(Math.random() < er ? randInt(1, 2000) : 0),
      }),
    },
  ],
  default: [
    { dim: "resource_id", vals: ["res-a", "res-b", "res-c"] },
    {
      metrics: (er) => ({
        request_count: counter(randInt(0, 500_000)),
        error_count: counter(Math.random() < er ? randInt(1, 5000) : 0),
        duration_ms: stat(dp(jitter(80, 70, 2, 15_000))),
      }),
    },
  ],
};

const AZURE_TEMPLATE_MAP: Record<string, string> = {
  "virtual-machines": "compute",
  "vm-scale-sets": "compute",
  aks: "kubernetes",
  "container-apps": "kubernetes",
  "app-service": "compute",
  functions: "compute",
  "load-balancer": "networking",
  "application-gateway": "networking",
  "virtual-network": "networking",
  "network-security-groups": "networking",
  "azure-firewall": "networking",
  "blob-storage": "storage",
  "file-storage": "storage",
  "sql-database": "database",
  "cosmos-db": "database",
  "cache-for-redis": "database",
  "database-for-postgresql": "database",
  "event-hubs": "messaging",
  "service-bus": "messaging",
  "data-factory": "default",
  "synapse-workspace": "default",
  monitor: "observability",
  "key-vault": "security",
  openai: "ml",
  "machine-learning": "ml",
  "stream-analytics": "default",
  acr: "default",
  "defender-for-cloud": "security",
  "storage-sync": "storage",
  databricks: "default",
};

export function makeAzureGenericMetricGenerator(
  serviceId: string,
  dataset: string
): MetricGenerator {
  const templateKey = AZURE_TEMPLATE_MAP[serviceId] ?? "default";
  const template = AZURE_METRIC_TEMPLATES[templateKey] ?? AZURE_METRIC_TEMPLATES.default;
  const dimEntry = template.find((t): t is { dim: string; vals: string[] } => "dim" in t);
  const metricsFn =
    template.find((t): t is { metrics: (er: number) => Record<string, unknown> } => "metrics" in t)
      ?.metrics ?? (() => ({ request_count: counter(randInt(0, 100_000)) }));

  return (ts: string, er: number) => {
    const { region, subscription, resourceGroup } = pickAzureContext();
    const dimKey = dimEntry?.dim ?? "resource_id";
    const dimVals = dimEntry?.vals ?? ["r1", "r2"];
    const numDims = Math.min(randInt(1, 3), dimVals.length);
    const serviceKey = serviceId.replace(/-/g, "_");

    return Array.from({ length: numDims }, (_, i) => {
      const dimVal = dimVals[i % dimVals.length];
      return azureMetricDoc(
        ts,
        serviceKey,
        dataset,
        region,
        subscription,
        resourceGroup,
        { [dimKey]: dimVal },
        metricsFn(er)
      );
    });
  };
}
