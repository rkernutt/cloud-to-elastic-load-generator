/**
 * Dedicated Azure metric generators for services that previously fell back
 * to generic implementations.
 */

import { randInt, jitter, dp, stat, counter, azureMetricDoc, pickAzureContext } from "./helpers.js";
import type { EcsDocument } from "../../../aws/generators/types.js";

// ---------------------------------------------------------------------------
// IoT Hub
// ---------------------------------------------------------------------------

export function generateIotHubMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dims = ["device-001", "device-002", "sensor-fleet-1"];
  const numDims = Math.min(randInt(1, 3), dims.length);

  return Array.from({ length: numDims }, (_, i) => {
    const deviceId = dims[i];
    return azureMetricDoc(
      ts,
      "iot_hub",
      "azure.iot_hub_metrics",
      region,
      subscription,
      resourceGroup,
      { device_id: deviceId },
      {
        d2c_messages_sent: counter(randInt(0, 50_000)),
        c2d_commands_sent: counter(randInt(0, 5_000)),
        jobs_failed: counter(Math.random() < er ? randInt(1, 100) : 0),
        routing_deliveries: counter(randInt(0, 40_000)),
        twin_queries: counter(randInt(0, 10_000)),
      }
    );
  });
}

// ---------------------------------------------------------------------------
// Logic Apps
// ---------------------------------------------------------------------------

export function generateLogicAppsMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dims = ["order-flow", "approval-chain", "notification-relay"];
  const numDims = Math.min(randInt(1, 3), dims.length);

  return Array.from({ length: numDims }, (_, i) => {
    const workflowName = dims[i];
    return azureMetricDoc(
      ts,
      "logic_apps",
      "azure.logic_apps_metrics",
      region,
      subscription,
      resourceGroup,
      { workflow_name: workflowName },
      {
        runs_started: counter(randInt(0, 10_000)),
        runs_succeeded: counter(randInt(0, 9_500)),
        runs_failed: counter(Math.random() < er ? randInt(1, 500) : 0),
        trigger_fires: counter(randInt(0, 10_000)),
        billable_action_executions: counter(randInt(0, 500_000)),
        latency_ms: stat(dp(jitter(800, 600, 10, 120_000))),
      }
    );
  });
}

// ---------------------------------------------------------------------------
// API Management
// ---------------------------------------------------------------------------

export function generateApiManagementMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dims = ["orders-api", "users-api", "payments-api"];
  const numDims = Math.min(randInt(1, 3), dims.length);

  return Array.from({ length: numDims }, (_, i) => {
    const apiId = dims[i];
    return azureMetricDoc(
      ts,
      "api_management",
      "azure.api_management_metrics",
      region,
      subscription,
      resourceGroup,
      { api_id: apiId },
      {
        requests: counter(randInt(0, 2_000_000)),
        successful_requests: counter(randInt(0, 1_900_000)),
        failed_requests: counter(Math.random() < er ? randInt(1, 100_000) : 0),
        other_requests: counter(randInt(0, 50_000)),
        duration_ms: stat(dp(jitter(120, 100, 1, 30_000))),
        bandwidth: counter(randInt(0, 10_000_000_000)),
      }
    );
  });
}

// ---------------------------------------------------------------------------
// Event Grid
// ---------------------------------------------------------------------------

export function generateEventGridMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dims = ["blob-events", "custom-events", "domain-events"];
  const numDims = Math.min(randInt(1, 3), dims.length);

  return Array.from({ length: numDims }, (_, i) => {
    const topicName = dims[i];
    return azureMetricDoc(
      ts,
      "event_grid",
      "azure.event_grid_metrics",
      region,
      subscription,
      resourceGroup,
      { topic_name: topicName },
      {
        publish_success: counter(randInt(0, 5_000_000)),
        publish_fail: counter(Math.random() < er ? randInt(1, 50_000) : 0),
        delivery_success: counter(randInt(0, 4_900_000)),
        delivery_fail: counter(Math.random() < er ? randInt(1, 50_000) : 0),
        matched_events: counter(randInt(0, 5_000_000)),
        dropped_events: counter(Math.random() < er ? randInt(1, 10_000) : 0),
      }
    );
  });
}

// ---------------------------------------------------------------------------
// Synapse Workspace
// ---------------------------------------------------------------------------

export function generateSynapseWorkspaceMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dims = ["sql-pool-1", "spark-pool-main", "serverless"];
  const numDims = Math.min(randInt(1, 3), dims.length);

  return Array.from({ length: numDims }, (_, i) => {
    const poolName = dims[i];
    return azureMetricDoc(
      ts,
      "synapse_workspace",
      "azure.synapse_workspace_metrics",
      region,
      subscription,
      resourceGroup,
      { pool_name: poolName },
      {
        dpu_used: stat(dp(jitter(60, 40, 0, 500))),
        cpu_percent: stat(dp(jitter(45, 30, 0, 100))),
        memory_percent: stat(dp(jitter(55, 35, 0, 100))),
        jobs_submitted: counter(randInt(0, 1_000)),
        jobs_failed: counter(Math.random() < er ? randInt(1, 50) : 0),
        data_processed_bytes: counter(randInt(0, 500_000_000_000)),
      }
    );
  });
}

// ---------------------------------------------------------------------------
// Databricks
// ---------------------------------------------------------------------------

export function generateDatabricksMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dims = ["job-cluster-1", "interactive-1", "automl-cluster"];
  const numDims = Math.min(randInt(1, 3), dims.length);

  return Array.from({ length: numDims }, (_, i) => {
    const clusterId = dims[i];
    return azureMetricDoc(
      ts,
      "databricks",
      "azure.databricks_metrics",
      region,
      subscription,
      resourceGroup,
      { cluster_id: clusterId },
      {
        active_jobs: counter(randInt(0, 20)),
        failed_tasks: counter(Math.random() < er ? randInt(1, 200) : 0),
        dbu_consumed: counter(randInt(0, 10_000)),
        disk_read_bytes: counter(randInt(0, 50_000_000_000)),
        disk_write_bytes: counter(randInt(0, 30_000_000_000)),
        jvm_heap_used: stat(dp(jitter(60, 30, 0, 100))),
      }
    );
  });
}

// ---------------------------------------------------------------------------
// Cosmos DB (dedicated — replaces generic database template)
// ---------------------------------------------------------------------------

export function generateCosmosDbDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dims = ["appdb", "catalog", "analytics"];
  const numDims = Math.min(randInt(1, 3), dims.length);

  return Array.from({ length: numDims }, (_, i) => {
    const databaseName = dims[i];
    return azureMetricDoc(
      ts,
      "cosmos_db",
      "azure.cosmos_db_metrics",
      region,
      subscription,
      resourceGroup,
      { database_name: databaseName },
      {
        request_units: stat(dp(jitter(500, 400, 1, 1_000_000))),
        document_count: counter(randInt(0, 100_000_000)),
        data_usage: counter(randInt(0, 500_000_000_000)),
        provisioned_throughput: stat(dp(jitter(1000, 500, 400, 10_000))),
        throttled_requests: counter(Math.random() < er ? randInt(1, 5_000) : 0),
        replication_latency_ms: stat(dp(jitter(12, 8, 1, 200))),
      }
    );
  });
}

// ---------------------------------------------------------------------------
// Event Hubs (dedicated — replaces generic messaging template)
// ---------------------------------------------------------------------------

export function generateEventHubsDedicatedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dims = ["telemetry", "clicks", "audit-log"];
  const numDims = Math.min(randInt(1, 3), dims.length);

  return Array.from({ length: numDims }, (_, i) => {
    const eventhubName = dims[i];
    return azureMetricDoc(
      ts,
      "event_hubs",
      "azure.event_hubs_metrics",
      region,
      subscription,
      resourceGroup,
      { eventhub_name: eventhubName },
      {
        incoming_messages: counter(randInt(0, 10_000_000)),
        outgoing_messages: counter(randInt(0, 9_800_000)),
        incoming_bytes: counter(randInt(0, 80_000_000_000)),
        outgoing_bytes: counter(randInt(0, 75_000_000_000)),
        throttled_requests: counter(Math.random() < er ? randInt(1, 10_000) : 0),
        active_connections: counter(randInt(0, 5_000)),
        capture_backlog: counter(Math.random() < er ? randInt(1, 100_000) : 0),
      }
    );
  });
}
