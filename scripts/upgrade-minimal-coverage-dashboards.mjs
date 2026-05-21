/**
 * Upgrades top-10 GCP and Azure minimal-coverage dashboards to rich ES|QL panels.
 * Run: node scripts/upgrade-minimal-coverage-dashboards.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const BUCKET = "BUCKET(`@timestamp````@timestamp`, 75, ?_tstart, ?_tend)";

function metric(uid, x, col, query) {
  return {
    type: "lens",
    uid,
    grid: { x, y: 0, w: 12, h: 5 },
    config: {
      title: "",
      attributes: {
        type: "metric",
        dataset: { type: "esql", query },
        metrics: [{ type: "primary", operation: "value", column: col }],
      },
    },
  };
}

function donut(uid, x, title, query, metricCol, groupCol) {
  return {
    type: "lens",
    uid,
    grid: { x, y: 5, w: 16, h: 10 },
    config: {
      title,
      attributes: {
        type: "donut",
        dataset: { type: "esql", query },
        metrics: [{ operation: "value", column: metricCol }],
        group_by: [{ operation: "value", column: groupCol }],
      },
    },
  };
}

function xyLine(uid, x, y, w, title, query, xCol, yCols) {
  return {
    type: "lens",
    uid,
    grid: { x, y, w, h: 10 },
    config: {
      title,
      attributes: {
        type: "xy",
        axis: {
          x: { title: { visible: false } },
          left: { title: { visible: false } },
        },
        layers: [
          {
            type: "line",
            dataset: { type: "esql", query },
            x: { operation: "value", column: xCol },
            y: yCols.map(({ col, label }) => ({ operation: "value", column: col, label })),
          },
        ],
      },
    },
  };
}

function xyBarH(uid, x, y, title, query, xCol, yCol, yLabel) {
  return {
    type: "lens",
    uid,
    grid: { x, y, w: 24, h: 10 },
    config: {
      title,
      attributes: {
        type: "xy",
        axis: {
          x: { title: { visible: false } },
          left: { title: { visible: false } },
        },
        layers: [
          {
            type: "bar_horizontal",
            dataset: { type: "esql", query },
            x: { operation: "value", column: xCol },
            y: [{ operation: "value", column: yCol, label: yLabel }],
          },
        ],
      },
    },
  };
}

function dataTable(uid, y, title, query, columns) {
  return {
    type: "lens",
    uid,
    grid: { x: 0, y, w: 48, h: 12 },
    config: {
      title,
      attributes: {
        type: "datatable",
        dataset: { type: "esql", query },
        metrics: columns.map(({ col, label }) => ({ operation: "value", column: col, label })),
        rows: [],
      },
    },
  };
}

function dash(title, panels) {
  return JSON.stringify({ title, time_range: { from: "now-24h", to: "now" }, panels }, null, 2);
}

const errPct = (idx) =>
  `FROM ${idx} | EVAL is_err = CASE(event.outcome == "failure", 1, 0) | STATS e = AVG(is_err) | EVAL \`Error %\` = ROUND(e * 100, 1)`;

const dashboards = [];

// ── GCP Cloud Storage ─────────────────────────────────────────────────────────
const I_GCS = "logs-gcp.gcs*";
dashboards.push([
  "installer/gcp-custom-dashboards/cloud-storage-dashboard.json",
  dash("GCP Cloud Storage — Objects & Access", [
    metric("gcp-gcs-k1", 0, "Operations", `FROM ${I_GCS} | STATS Operations = COUNT()`),
    metric(
      "gcp-gcs-k2",
      12,
      "Buckets",
      `FROM ${I_GCS} | STATS Buckets = COUNT_DISTINCT(\`gcp.cloud_storage.bucket_name\`)`
    ),
    metric(
      "gcp-gcs-k3",
      24,
      "GB stored",
      `FROM ${I_GCS} | STATS gb = SUM(\`gcp.cloud_storage.object_size\`) | EVAL \`GB stored\` = ROUND(gb / 1073741824.0, 2)`
    ),
    metric("gcp-gcs-k4", 36, "Error %", errPct(I_GCS)),
    donut(
      "gcp-gcs-d1",
      0,
      "Storage class",
      `FROM ${I_GCS} | STATS c = COUNT() BY sc = \`gcp.cloud_storage.storage_class\` | SORT \`\`c DESC`,
      "c",
      "sc"
    ),
    donut(
      "gcp-gcs-d2",
      16,
      "Operation",
      `FROM ${I_GCS} | STATS c = COUNT() BY op = \`gcp.cloud_storage.operation\` | SORT \`\`c DESC | LIMIT 10`,
      "c",
      "op"
    ),
    donut(
      "gcp-gcs-d3",
      32,
      "Outcome",
      `FROM ${I_GCS} | STATS c = COUNT() BY o = event.outcome | SORT \`\`c DESC`,
      "c",
      "o"
    ),
    xyLine(
      "gcp-gcs-l1",
      0,
      15,
      48,
      "Operations over time",
      `FROM ${I_GCS} | STATS c = COUNT() BY b = ${BUCKET} | SORT \`\`b`,
      "b",
      [{ col: "c", label: "Operations" }]
    ),
    xyLine(
      "gcp-gcs-l2",
      0,
      25,
      24,
      "Errors by bucket",
      `FROM ${I_GCS} | WHERE event.outcome == "failure" | STATS e = COUNT() BY b = ${BUCKET} | SORT \`\`b`,
      "b",
      [{ col: "e", label: "Errors" }]
    ),
    xyBarH(
      "gcp-gcs-b1",
      24,
      25,
      "Top buckets by errors",
      `FROM ${I_GCS} | WHERE event.outcome == "failure" | STATS c = COUNT() BY bucket = \`gcp.cloud_storage.bucket_name\` | SORT \`\`c DESC | LIMIT 10`,
      "bucket",
      "c",
      "Errors"
    ),
    dataTable(
      "gcp-gcs-t1",
      35,
      "Recent operations",
      `FROM ${I_GCS} | KEEP \`@timestamp\`\`@timestamp\`, \`gcp.cloud_storage.bucket_name\`, \`gcp.cloud_storage.object_name\`, \`gcp.cloud_storage.operation\`, \`gcp.cloud_storage.storage_class\`, \`gcp.cloud_storage.object_size\`, event.outcome, message | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "gcp.cloud_storage.bucket_name", label: "Bucket" },
        { col: "gcp.cloud_storage.object_name", label: "Object" },
        { col: "gcp.cloud_storage.operation", label: "Operation" },
        { col: "gcp.cloud_storage.storage_class", label: "Class" },
        { col: "gcp.cloud_storage.object_size", label: "Size" },
        { col: "event.outcome", label: "Outcome" },
        { col: "message", label: "Message" },
      ]
    ),
  ]),
]);

// ── GCP Cloud Armor ───────────────────────────────────────────────────────────
const I_ARMOR = "logs-gcp.cloudarmor*";
dashboards.push([
  "installer/gcp-custom-dashboards/cloud-armor-dashboard.json",
  dash("GCP Cloud Armor — WAF & Edge Protection", [
    metric("gcp-armor-k1", 0, "Requests", `FROM ${I_ARMOR} | STATS Requests = COUNT()`),
    metric(
      "gcp-armor-k2",
      12,
      "Blocked",
      `FROM ${I_ARMOR} | STATS Blocked = SUM(CASE(\`gcp.cloud_armor.action\` IN ("DENY", "DENY_403", "RATE_LIMITED"), 1, 0))`
    ),
    metric(
      "gcp-armor-k3",
      24,
      "Block %",
      `FROM ${I_ARMOR} | STATS total = COUNT(), blocked = SUM(CASE(\`gcp.cloud_armor.action\` IN ("DENY", "DENY_403", "RATE_LIMITED"), 1, 0)) | EVAL \`Block %\` = ROUND(blocked * 100.0 / total, 1)`
    ),
    metric(
      "gcp-armor-k4",
      36,
      "Source IPs",
      `FROM ${I_ARMOR} | STATS \`Source IPs\` = COUNT_DISTINCT(\`gcp.cloud_armor.source_ip\`)`
    ),
    donut(
      "gcp-armor-d1",
      0,
      "Action",
      `FROM ${I_ARMOR} | STATS c = COUNT() BY a = \`gcp.cloud_armor.action\` | SORT \`\`c DESC`,
      "c",
      "a"
    ),
    donut(
      "gcp-armor-d2",
      16,
      "Rule",
      `FROM ${I_ARMOR} | STATS c = COUNT() BY r = \`gcp.cloud_armor.rule_name\` | SORT \`\`c DESC | LIMIT 10`,
      "c",
      "r"
    ),
    donut(
      "gcp-armor-d3",
      32,
      "Region",
      `FROM ${I_ARMOR} | STATS c = COUNT() BY reg = COALESCE(cloud.region, "unknown") | SORT \`\`c DESC | LIMIT 10`,
      "c",
      "reg"
    ),
    xyLine(
      "gcp-armor-l1",
      0,
      15,
      48,
      "Requests over time",
      `FROM ${I_ARMOR} | STATS c = COUNT() BY b = ${BUCKET} | SORT \`\`b`,
      "b",
      [{ col: "c", label: "Requests" }]
    ),
    xyLine(
      "gcp-armor-l2",
      0,
      25,
      24,
      "Blocked over time",
      `FROM ${I_ARMOR} | STATS blocked = SUM(CASE(\`gcp.cloud_armor.action\` IN ("DENY", "DENY_403", "RATE_LIMITED"), 1, 0)) BY b = ${BUCKET} | SORT \`\`b`,
      "b",
      [{ col: "blocked", label: "Blocked" }]
    ),
    xyBarH(
      "gcp-armor-b1",
      24,
      25,
      "Top blocked IPs",
      `FROM ${I_ARMOR} | WHERE \`gcp.cloud_armor.action\` IN ("DENY", "DENY_403", "RATE_LIMITED") | STATS c = COUNT() BY ip = \`gcp.cloud_armor.source_ip\` | SORT \`\`c DESC | LIMIT 15`,
      "ip",
      "c",
      "Blocks"
    ),
    dataTable(
      "gcp-armor-t1",
      35,
      "Recent WAF events",
      `FROM ${I_ARMOR} | KEEP \`@timestamp\`\`@timestamp\`, \`gcp.cloud_armor.source_ip\`, \`gcp.cloud_armor.action\`, \`gcp.cloud_armor.rule_name\`, \`gcp.cloud_armor.policy_name\`, \`gcp.cloud_armor.matched_expression\`, cloud.region, event.outcome | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "gcp.cloud_armor.source_ip", label: "Source IP" },
        { col: "gcp.cloud_armor.action", label: "Action" },
        { col: "gcp.cloud_armor.rule_name", label: "Rule" },
        { col: "gcp.cloud_armor.policy_name", label: "Policy" },
        { col: "gcp.cloud_armor.matched_expression", label: "Expression" },
        { col: "cloud.region", label: "Region" },
        { col: "event.outcome", label: "Outcome" },
      ]
    ),
  ]),
]);

// ── GCP Memorystore ───────────────────────────────────────────────────────────
const I_MS = "logs-gcp.memorystore*";
dashboards.push([
  "installer/gcp-custom-dashboards/memorystore-dashboard.json",
  dash("GCP Memorystore — Cache Performance", [
    metric(
      "gcp-ms-k1",
      0,
      "Avg memory (MB)",
      `FROM ${I_MS} | STATS \`Avg memory (MB)\` = ROUND(AVG(\`gcp.memorystore.memory_used_mb\`), 0)`
    ),
    metric(
      "gcp-ms-k2",
      12,
      "Avg clients",
      `FROM ${I_MS} | STATS \`Avg clients\` = ROUND(AVG(\`gcp.memorystore.connected_clients\`), 0)`
    ),
    metric(
      "gcp-ms-k3",
      24,
      "Evictions",
      `FROM ${I_MS} | STATS Evictions = SUM(\`gcp.memorystore.evicted_keys\`)`
    ),
    metric("gcp-ms-k4", 36, "Error %", errPct(I_MS)),
    donut(
      "gcp-ms-d1",
      0,
      "Engine",
      `FROM ${I_MS} | STATS c = COUNT() BY e = \`gcp.memorystore.engine\` | SORT \`\`c DESC`,
      "c",
      "e"
    ),
    donut(
      "gcp-ms-d2",
      16,
      "Operation",
      `FROM ${I_MS} | STATS c = COUNT() BY op = \`gcp.memorystore.operation\` | SORT \`\`c DESC`,
      "c",
      "op"
    ),
    donut(
      "gcp-ms-d3",
      32,
      "Outcome",
      `FROM ${I_MS} | STATS c = COUNT() BY o = event.outcome | SORT \`\`c DESC`,
      "c",
      "o"
    ),
    xyLine(
      "gcp-ms-l1",
      0,
      15,
      48,
      "Memory usage over time (MB)",
      `FROM ${I_MS} | STATS mem = AVG(\`gcp.memorystore.memory_used_mb\`) BY b = ${BUCKET} | SORT \`\`b`,
      "b",
      [{ col: "mem", label: "Memory (MB)" }]
    ),
    xyLine(
      "gcp-ms-l2",
      0,
      25,
      24,
      "Evictions over time",
      `FROM ${I_MS} | STATS ev = SUM(\`gcp.memorystore.evicted_keys\`) BY b = ${BUCKET} | SORT \`\`b`,
      "b",
      [{ col: "ev", label: "Evictions" }]
    ),
    xyBarH(
      "gcp-ms-b1",
      24,
      25,
      "Top instances by evictions",
      `FROM ${I_MS} | STATS ev = SUM(\`gcp.memorystore.evicted_keys\`) BY inst = \`gcp.memorystore.instance_id\` | SORT \`\`ev DESC | LIMIT 10`,
      "inst",
      "ev",
      "Evictions"
    ),
    dataTable(
      "gcp-ms-t1",
      35,
      "Recent events",
      `FROM ${I_MS} | KEEP \`@timestamp\`\`@timestamp\`, \`gcp.memorystore.instance_id\`, \`gcp.memorystore.engine\`, \`gcp.memorystore.operation\`, \`gcp.memorystore.memory_used_mb\`, \`gcp.memorystore.connected_clients\`, \`gcp.memorystore.evicted_keys\`, event.outcome | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "gcp.memorystore.instance_id", label: "Instance" },
        { col: "gcp.memorystore.engine", label: "Engine" },
        { col: "gcp.memorystore.operation", label: "Operation" },
        { col: "gcp.memorystore.memory_used_mb", label: "Memory MB" },
        { col: "gcp.memorystore.connected_clients", label: "Clients" },
        { col: "gcp.memorystore.evicted_keys", label: "Evicted" },
        { col: "event.outcome", label: "Outcome" },
      ]
    ),
  ]),
]);

// ── GCP Cloud Tasks ───────────────────────────────────────────────────────────
const I_CT = "logs-gcp.cloudtasks*";
dashboards.push([
  "installer/gcp-custom-dashboards/cloud-tasks-dashboard.json",
  dash("GCP Cloud Tasks — Queues & Execution", [
    metric("gcp-ct-k1", 0, "Task attempts", `FROM ${I_CT} | STATS \`Task attempts\` = COUNT()`),
    metric(
      "gcp-ct-k2",
      12,
      "Avg queue depth",
      `FROM ${I_CT} | STATS \`Avg queue depth\` = ROUND(AVG(\`gcp.cloud_tasks.metrics.queue_depth.avg\`), 0)`
    ),
    metric(
      "gcp-ct-k3",
      24,
      "Retry %",
      `FROM ${I_CT} | STATS total = COUNT(), retries = SUM(CASE(\`gcp.cloud_tasks.dispatch_count\` > 1, 1, 0)) | EVAL \`Retry %\` = ROUND(retries * 100.0 / total, 1)`
    ),
    metric("gcp-ct-k4", 36, "Error %", errPct(I_CT)),
    donut(
      "gcp-ct-d1",
      0,
      "Queue",
      `FROM ${I_CT} | STATS c = COUNT() BY q = \`gcp.cloud_tasks.queue_name\` | SORT \`\`c DESC | LIMIT 10`,
      "c",
      "q"
    ),
    donut(
      "gcp-ct-d2",
      16,
      "Response code",
      `FROM ${I_CT} | STATS c = COUNT() BY rc = TO_STRING(\`gcp.cloud_tasks.response_code\`) | SORT \`\`c DESC | LIMIT 10`,
      "c",
      "rc"
    ),
    donut(
      "gcp-ct-d3",
      32,
      "Outcome",
      `FROM ${I_CT} | STATS c = COUNT() BY o = event.outcome | SORT \`\`c DESC`,
      "c",
      "o"
    ),
    xyLine(
      "gcp-ct-l1",
      0,
      15,
      48,
      "Executions over time",
      `FROM ${I_CT} | STATS c = COUNT() BY b = ${BUCKET} | SORT \`\`b`,
      "b",
      [{ col: "c", label: "Attempts" }]
    ),
    xyLine(
      "gcp-ct-l2",
      0,
      25,
      24,
      "Queue depth over time",
      `FROM ${I_CT} | STATS depth = AVG(\`gcp.cloud_tasks.metrics.queue_depth.avg\`) BY b = ${BUCKET} | SORT \`\`b`,
      "b",
      [{ col: "depth", label: "Depth" }]
    ),
    xyBarH(
      "gcp-ct-b1",
      24,
      25,
      "Latency by queue (ms)",
      `FROM ${I_CT} | STATS lat = ROUND(AVG(\`gcp.cloud_tasks.attempt_latency_ms\`), 0) BY q = \`gcp.cloud_tasks.queue_name\` | SORT \`\`lat DESC | LIMIT 10`,
      "q",
      "lat",
      "Avg ms"
    ),
    dataTable(
      "gcp-ct-t1",
      35,
      "Recent tasks",
      `FROM ${I_CT} | KEEP \`@timestamp\`\`@timestamp\`, \`gcp.cloud_tasks.queue_name\`, \`gcp.cloud_tasks.task_name\`, \`gcp.cloud_tasks.dispatch_count\`, \`gcp.cloud_tasks.response_code\`, \`gcp.cloud_tasks.attempt_latency_ms\`, event.outcome, message | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "gcp.cloud_tasks.queue_name", label: "Queue" },
        { col: "gcp.cloud_tasks.task_name", label: "Task" },
        { col: "gcp.cloud_tasks.dispatch_count", label: "Dispatch" },
        { col: "gcp.cloud_tasks.response_code", label: "HTTP" },
        { col: "gcp.cloud_tasks.attempt_latency_ms", label: "Latency ms" },
        { col: "event.outcome", label: "Outcome" },
        { col: "message", label: "Message" },
      ]
    ),
  ]),
]);

// ── GCP AlloyDB ───────────────────────────────────────────────────────────────
const I_ALLOY = "logs-gcp.alloydb*";
dashboards.push([
  "installer/gcp-custom-dashboards/alloydb-dashboard.json",
  dash("GCP AlloyDB — Queries & Replication", [
    metric(
      "gcp-alloy-k1",
      0,
      "Avg latency (ms)",
      `FROM ${I_ALLOY} | STATS \`Avg latency (ms)\` = ROUND(AVG(\`gcp.alloy_db.query_duration_ms\`), 1)`
    ),
    metric(
      "gcp-alloy-k2",
      12,
      "Avg connections",
      `FROM ${I_ALLOY} | STATS \`Avg connections\` = ROUND(AVG(\`gcp.alloy_db.connection_count\`), 0)`
    ),
    metric(
      "gcp-alloy-k3",
      24,
      "Avg CPU %",
      `FROM ${I_ALLOY} | STATS \`Avg CPU %\` = ROUND(AVG(\`gcp.alloy_db.cpu_utilization\`) * 100, 1)`
    ),
    metric("gcp-alloy-k4", 36, "Error %", errPct(I_ALLOY)),
    donut(
      "gcp-alloy-d1",
      0,
      "Query type",
      `FROM ${I_ALLOY} | STATS c = COUNT() BY qt = \`gcp.alloy_db.query_type\` | SORT \`\`c DESC`,
      "c",
      "qt"
    ),
    donut(
      "gcp-alloy-d2",
      16,
      "Cluster",
      `FROM ${I_ALLOY} | STATS c = COUNT() BY cl = \`gcp.alloy_db.cluster_name\` | SORT \`\`c DESC | LIMIT 10`,
      "c",
      "cl"
    ),
    donut(
      "gcp-alloy-d3",
      32,
      "Outcome",
      `FROM ${I_ALLOY} | STATS c = COUNT() BY o = event.outcome | SORT \`\`c DESC`,
      "c",
      "o"
    ),
    xyLine(
      "gcp-alloy-l1",
      0,
      15,
      48,
      "Query latency over time (ms)",
      `FROM ${I_ALLOY} | STATS lat = AVG(\`gcp.alloy_db.query_duration_ms\`) BY b = ${BUCKET} | SORT \`\`b`,
      "b",
      [{ col: "lat", label: "Latency ms" }]
    ),
    xyLine(
      "gcp-alloy-l2",
      0,
      25,
      24,
      "Connections over time",
      `FROM ${I_ALLOY} | STATS conn = AVG(\`gcp.alloy_db.connection_count\`) BY b = ${BUCKET} | SORT \`\`b`,
      "b",
      [{ col: "conn", label: "Connections" }]
    ),
    xyBarH(
      "gcp-alloy-b1",
      24,
      25,
      "Storage by cluster (MB)",
      `FROM ${I_ALLOY} | STATS mem = ROUND(AVG(\`gcp.alloy_db.memory_utilization\`) * 100, 1) BY cl = \`gcp.alloy_db.cluster_name\` | SORT \`\`mem DESC | LIMIT 10`,
      "cl",
      "mem",
      "Memory %"
    ),
    dataTable(
      "gcp-alloy-t1",
      35,
      "Recent queries",
      `FROM ${I_ALLOY} | KEEP \`@timestamp\`\`@timestamp\`, \`gcp.alloy_db.cluster_name\`, \`gcp.alloy_db.instance_name\`, \`gcp.alloy_db.query_type\`, \`gcp.alloy_db.query_duration_ms\`, \`gcp.alloy_db.connection_count\`, \`gcp.alloy_db.rows_returned\`, event.outcome | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "gcp.alloy_db.cluster_name", label: "Cluster" },
        { col: "gcp.alloy_db.instance_name", label: "Instance" },
        { col: "gcp.alloy_db.query_type", label: "Query" },
        { col: "gcp.alloy_db.query_duration_ms", label: "Latency ms" },
        { col: "gcp.alloy_db.connection_count", label: "Connections" },
        { col: "gcp.alloy_db.rows_returned", label: "Rows" },
        { col: "event.outcome", label: "Outcome" },
      ]
    ),
  ]),
]);

// ── GCP Cloud KMS ─────────────────────────────────────────────────────────────
const I_KMS = "logs-gcp.kms*";
dashboards.push([
  "installer/gcp-custom-dashboards/cloud-kms-dashboard.json",
  dash("GCP Cloud KMS — Key Operations", [
    metric("gcp-kms-k1", 0, "Operations", `FROM ${I_KMS} | STATS Operations = COUNT()`),
    metric(
      "gcp-kms-k2",
      12,
      "Encrypt",
      `FROM ${I_KMS} | STATS Encrypt = SUM(CASE(\`gcp.cloud_kms.operation\` == "Encrypt", 1, 0))`
    ),
    metric(
      "gcp-kms-k3",
      24,
      "Decrypt",
      `FROM ${I_KMS} | STATS Decrypt = SUM(CASE(\`gcp.cloud_kms.operation\` == "Decrypt", 1, 0))`
    ),
    metric("gcp-kms-k4", 36, "Error %", errPct(I_KMS)),
    donut(
      "gcp-kms-d1",
      0,
      "Operation",
      `FROM ${I_KMS} | STATS c = COUNT() BY op = \`gcp.cloud_kms.operation\` | SORT \`\`c DESC`,
      "c",
      "op"
    ),
    donut(
      "gcp-kms-d2",
      16,
      "Key ring",
      `FROM ${I_KMS} | STATS c = COUNT() BY kr = \`gcp.cloud_kms.key_ring\` | SORT \`\`c DESC | LIMIT 10`,
      "c",
      "kr"
    ),
    donut(
      "gcp-kms-d3",
      32,
      "Outcome",
      `FROM ${I_KMS} | STATS c = COUNT() BY o = event.outcome | SORT \`\`c DESC`,
      "c",
      "o"
    ),
    xyLine(
      "gcp-kms-l1",
      0,
      15,
      48,
      "Operations over time",
      `FROM ${I_KMS} | STATS c = COUNT() BY b = ${BUCKET} | SORT \`\`b`,
      "b",
      [{ col: "c", label: "Ops" }]
    ),
    xyLine(
      "gcp-kms-l2",
      0,
      25,
      24,
      "Errors over time",
      `FROM ${I_KMS} | WHERE event.outcome == "failure" | STATS e = COUNT() BY b = ${BUCKET} | SORT \`\`b`,
      "b",
      [{ col: "e", label: "Errors" }]
    ),
    xyBarH(
      "gcp-kms-b1",
      24,
      25,
      "Errors by key ring",
      `FROM ${I_KMS} | WHERE event.outcome == "failure" | STATS c = COUNT() BY kr = \`gcp.cloud_kms.key_ring\` | SORT \`\`c DESC | LIMIT 10`,
      "kr",
      "c",
      "Errors"
    ),
    dataTable(
      "gcp-kms-t1",
      35,
      "Recent operations",
      `FROM ${I_KMS} | KEEP \`@timestamp\`\`@timestamp\`, \`gcp.cloud_kms.key_ring\`, \`gcp.cloud_kms.crypto_key\`, \`gcp.cloud_kms.operation\`, \`gcp.cloud_kms.caller\`, \`gcp.cloud_kms.algorithm\`, event.outcome, message | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "gcp.cloud_kms.key_ring", label: "Key ring" },
        { col: "gcp.cloud_kms.crypto_key", label: "Key" },
        { col: "gcp.cloud_kms.operation", label: "Operation" },
        { col: "gcp.cloud_kms.caller", label: "Caller" },
        { col: "gcp.cloud_kms.algorithm", label: "Algorithm" },
        { col: "event.outcome", label: "Outcome" },
        { col: "message", label: "Message" },
      ]
    ),
  ]),
]);

// ── GCP Secret Manager ────────────────────────────────────────────────────────
const I_SM = "logs-gcp.secretmanager*";
dashboards.push([
  "installer/gcp-custom-dashboards/secret-manager-dashboard.json",
  dash("GCP Secret Manager — Access & Rotation", [
    metric("gcp-sm-k1", 0, "Access events", `FROM ${I_SM} | STATS \`Access events\` = COUNT()`),
    metric(
      "gcp-sm-k2",
      12,
      "Secrets",
      `FROM ${I_SM} | STATS Secrets = COUNT_DISTINCT(\`gcp.secret_manager.secret_name\`)`
    ),
    metric(
      "gcp-sm-k3",
      24,
      "Rotations",
      `FROM ${I_SM} | STATS Rotations = SUM(CASE(\`gcp.secret_manager.action\` == "AddSecretVersion", 1, 0))`
    ),
    metric("gcp-sm-k4", 36, "Error %", errPct(I_SM)),
    donut(
      "gcp-sm-d1",
      0,
      "Action",
      `FROM ${I_SM} | STATS c = COUNT() BY a = \`gcp.secret_manager.action\` | SORT \`\`c DESC`,
      "c",
      "a"
    ),
    donut(
      "gcp-sm-d2",
      16,
      "Top secrets",
      `FROM ${I_SM} | STATS c = COUNT() BY s = \`gcp.secret_manager.secret_name\` | SORT \`\`c DESC | LIMIT 10`,
      "c",
      "s"
    ),
    donut(
      "gcp-sm-d3",
      32,
      "Outcome",
      `FROM ${I_SM} | STATS c = COUNT() BY o = event.outcome | SORT \`\`c DESC`,
      "c",
      "o"
    ),
    xyLine(
      "gcp-sm-l1",
      0,
      15,
      48,
      "Access rate over time",
      `FROM ${I_SM} | STATS c = COUNT() BY b = ${BUCKET} | SORT \`\`b`,
      "b",
      [{ col: "c", label: "Access" }]
    ),
    xyLine(
      "gcp-sm-l2",
      0,
      25,
      24,
      "Rotation events over time",
      `FROM ${I_SM} | STATS r = SUM(CASE(\`gcp.secret_manager.action\` == "AddSecretVersion", 1, 0)) BY b = ${BUCKET} | SORT \`\`b`,
      "b",
      [{ col: "r", label: "Rotations" }]
    ),
    xyBarH(
      "gcp-sm-b1",
      24,
      25,
      "Access by secret",
      `FROM ${I_SM} | STATS c = COUNT() BY s = \`gcp.secret_manager.secret_name\` | SORT \`\`c DESC | LIMIT 10`,
      "s",
      "c",
      "Access"
    ),
    dataTable(
      "gcp-sm-t1",
      35,
      "Recent access",
      `FROM ${I_SM} | KEEP \`@timestamp\`\`@timestamp\`, \`gcp.secret_manager.secret_name\`, \`gcp.secret_manager.version\`, \`gcp.secret_manager.action\`, \`gcp.secret_manager.accessor\`, \`gcp.secret_manager.replication\`, event.outcome | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "gcp.secret_manager.secret_name", label: "Secret" },
        { col: "gcp.secret_manager.version", label: "Version" },
        { col: "gcp.secret_manager.action", label: "Action" },
        { col: "gcp.secret_manager.accessor", label: "Accessor" },
        { col: "gcp.secret_manager.replication", label: "Replication" },
        { col: "event.outcome", label: "Outcome" },
      ]
    ),
  ]),
]);

// ── GCP Eventarc ──────────────────────────────────────────────────────────────
const I_EA = "logs-gcp.eventarc*";
dashboards.push([
  "installer/gcp-custom-dashboards/eventarc-dashboard.json",
  dash("GCP Eventarc — Event Delivery", [
    metric("gcp-ea-k1", 0, "Deliveries", `FROM ${I_EA} | STATS Deliveries = COUNT()`),
    metric(
      "gcp-ea-k2",
      12,
      "Failures",
      `FROM ${I_EA} | STATS Failures = SUM(CASE(event.outcome == "failure", 1, 0))`
    ),
    metric(
      "gcp-ea-k3",
      24,
      "Avg latency (ms)",
      `FROM ${I_EA} | STATS \`Avg latency (ms)\` = ROUND(AVG(\`gcp.eventarc.metrics.delivery_latency_ms.avg\`), 0)`
    ),
    metric(
      "gcp-ea-k4",
      36,
      "DLQ redirects",
      `FROM ${I_EA} | STATS \`DLQ redirects\` = SUM(\`gcp.eventarc.metrics.dlq_redirects.sum\`)`
    ),
    donut(
      "gcp-ea-d1",
      0,
      "Event type",
      `FROM ${I_EA} | STATS c = COUNT() BY et = \`gcp.eventarc.event_type\` | SORT \`\`c DESC | LIMIT 10`,
      "c",
      "et"
    ),
    donut(
      "gcp-ea-d2",
      16,
      "Trigger",
      `FROM ${I_EA} | STATS c = COUNT() BY tr = \`gcp.eventarc.trigger_name\` | SORT \`\`c DESC | LIMIT 10`,
      "c",
      "tr"
    ),
    donut(
      "gcp-ea-d3",
      32,
      "Delivery status",
      `FROM ${I_EA} | STATS c = COUNT() BY ds = \`gcp.eventarc.delivery_status\` | SORT \`\`c DESC`,
      "c",
      "ds"
    ),
    xyLine(
      "gcp-ea-l1",
      0,
      15,
      48,
      "Delivery rate over time",
      `FROM ${I_EA} | STATS c = COUNT() BY b = ${BUCKET} | SORT \`\`b`,
      "b",
      [{ col: "c", label: "Events" }]
    ),
    xyLine(
      "gcp-ea-l2",
      0,
      25,
      24,
      "Failures over time",
      `FROM ${I_EA} | STATS f = SUM(CASE(event.outcome == "failure", 1, 0)) BY b = ${BUCKET} | SORT \`\`b`,
      "b",
      [{ col: "f", label: "Failures" }]
    ),
    xyBarH(
      "gcp-ea-b1",
      24,
      25,
      "Latency by trigger (ms)",
      `FROM ${I_EA} | STATS lat = ROUND(AVG(\`gcp.eventarc.metrics.delivery_latency_ms.avg\`), 0) BY tr = \`gcp.eventarc.trigger_name\` | SORT \`\`lat DESC | LIMIT 10`,
      "tr",
      "lat",
      "Avg ms"
    ),
    dataTable(
      "gcp-ea-t1",
      35,
      "Recent deliveries",
      `FROM ${I_EA} | KEEP \`@timestamp\`\`@timestamp\`, \`gcp.eventarc.trigger_name\`, \`gcp.eventarc.event_type\`, \`gcp.eventarc.destination\`, \`gcp.eventarc.delivery_status\`, \`gcp.eventarc.metrics.delivery_latency_ms.avg\`, event.outcome, message | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "gcp.eventarc.trigger_name", label: "Trigger" },
        { col: "gcp.eventarc.event_type", label: "Event type" },
        { col: "gcp.eventarc.destination", label: "Destination" },
        { col: "gcp.eventarc.delivery_status", label: "Status" },
        { col: "gcp.eventarc.metrics.delivery_latency_ms.avg", label: "Latency ms" },
        { col: "event.outcome", label: "Outcome" },
        { col: "message", label: "Message" },
      ]
    ),
  ]),
]);

// ── GCP Artifact Registry ─────────────────────────────────────────────────────
const I_AR = "logs-gcp.artifactregistry*";
dashboards.push([
  "installer/gcp-custom-dashboards/artifact-registry-dashboard.json",
  dash("GCP Artifact Registry — Images & Scans", [
    metric("gcp-ar-k1", 0, "Operations", `FROM ${I_AR} | STATS Operations = COUNT()`),
    metric(
      "gcp-ar-k2",
      12,
      "Pushes",
      `FROM ${I_AR} | STATS Pushes = SUM(CASE(\`gcp.artifact_registry.action\` == "push", 1, 0))`
    ),
    metric(
      "gcp-ar-k3",
      24,
      "Pulls",
      `FROM ${I_AR} | STATS Pulls = SUM(CASE(\`gcp.artifact_registry.action\` == "pull", 1, 0))`
    ),
    metric(
      "gcp-ar-k4",
      36,
      "Scan failures",
      `FROM ${I_AR} | STATS \`Scan failures\` = SUM(CASE(\`gcp.artifact_registry.action\` == "scan" AND event.outcome == "failure", 1, 0))`
    ),
    donut(
      "gcp-ar-d1",
      0,
      "Action",
      `FROM ${I_AR} | STATS c = COUNT() BY a = \`gcp.artifact_registry.action\` | SORT \`\`c DESC`,
      "c",
      "a"
    ),
    donut(
      "gcp-ar-d2",
      16,
      "Format",
      `FROM ${I_AR} | STATS c = COUNT() BY f = \`gcp.artifact_registry.format\` | SORT \`\`c DESC`,
      "c",
      "f"
    ),
    donut(
      "gcp-ar-d3",
      32,
      "Repository",
      `FROM ${I_AR} | STATS c = COUNT() BY r = \`gcp.artifact_registry.repository\` | SORT \`\`c DESC | LIMIT 10`,
      "c",
      "r"
    ),
    xyLine(
      "gcp-ar-l1",
      0,
      15,
      48,
      "Push & pull over time",
      `FROM ${I_AR} | STATS push = SUM(CASE(\`gcp.artifact_registry.action\` == "push", 1, 0)), pull = SUM(CASE(\`gcp.artifact_registry.action\` == "pull", 1, 0)) BY b = ${BUCKET} | SORT \`\`b`,
      "b",
      [
        { col: "push", label: "Push" },
        { col: "pull", label: "Pull" },
      ]
    ),
    xyLine(
      "gcp-ar-l2",
      0,
      25,
      24,
      "Scan findings over time",
      `FROM ${I_AR} | WHERE \`gcp.artifact_registry.action\` == "scan" | STATS vuln = SUM(\`gcp.artifact_registry.vulnerability_count\`) BY b = ${BUCKET} | SORT \`\`b`,
      "b",
      [{ col: "vuln", label: "Findings" }]
    ),
    xyBarH(
      "gcp-ar-b1",
      24,
      25,
      "Repository activity",
      `FROM ${I_AR} | STATS c = COUNT() BY r = \`gcp.artifact_registry.repository\` | SORT \`\`c DESC | LIMIT 10`,
      "r",
      "c",
      "Ops"
    ),
    dataTable(
      "gcp-ar-t1",
      35,
      "Recent operations",
      `FROM ${I_AR} | KEEP \`@timestamp\`\`@timestamp\`, \`gcp.artifact_registry.repository\`, \`gcp.artifact_registry.package_name\`, \`gcp.artifact_registry.action\`, \`gcp.artifact_registry.format\`, \`gcp.artifact_registry.vulnerability_count\`, event.outcome, message | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "gcp.artifact_registry.repository", label: "Repository" },
        { col: "gcp.artifact_registry.package_name", label: "Package" },
        { col: "gcp.artifact_registry.action", label: "Action" },
        { col: "gcp.artifact_registry.format", label: "Format" },
        { col: "gcp.artifact_registry.vulnerability_count", label: "Vulns" },
        { col: "event.outcome", label: "Outcome" },
        { col: "message", label: "Message" },
      ]
    ),
  ]),
]);

// ── GCP Composer ──────────────────────────────────────────────────────────────
const I_COMP = "logs-gcp.composer*";
dashboards.push([
  "installer/gcp-custom-dashboards/composer-dashboard.json",
  dash("GCP Composer — Airflow DAGs & Scheduler", [
    metric("gcp-comp-k1", 0, "DAG runs", `FROM ${I_COMP} | STATS \`DAG runs\` = COUNT()`),
    metric(
      "gcp-comp-k2",
      12,
      "Success %",
      `FROM ${I_COMP} | STATS total = COUNT(), ok = SUM(CASE(\`gcp.composer.state\` IN ("success", "running"), 1, 0)) | EVAL \`Success %\` = ROUND(ok * 100.0 / total, 1)`
    ),
    metric(
      "gcp-comp-k3",
      24,
      "Avg duration (s)",
      `FROM ${I_COMP} | STATS \`Avg duration (s)\` = ROUND(AVG(\`gcp.composer.duration_seconds\`), 0)`
    ),
    metric(
      "gcp-comp-k4",
      36,
      "Failed tasks",
      `FROM ${I_COMP} | STATS \`Failed tasks\` = SUM(CASE(\`gcp.composer.state\` == "failed", 1, 0))`
    ),
    donut(
      "gcp-comp-d1",
      0,
      "DAG state",
      `FROM ${I_COMP} | STATS c = COUNT() BY st = \`gcp.composer.state\` | SORT \`\`c DESC`,
      "c",
      "st"
    ),
    donut(
      "gcp-comp-d2",
      16,
      "Operator",
      `FROM ${I_COMP} | STATS c = COUNT() BY op = \`gcp.composer.operator\` | SORT \`\`c DESC | LIMIT 10`,
      "c",
      "op"
    ),
    donut(
      "gcp-comp-d3",
      32,
      "Top DAGs",
      `FROM ${I_COMP} | STATS c = COUNT() BY dag = \`gcp.composer.dag_id\` | SORT \`\`c DESC | LIMIT 10`,
      "c",
      "dag"
    ),
    xyLine(
      "gcp-comp-l1",
      0,
      15,
      48,
      "Task duration over time (s)",
      `FROM ${I_COMP} | STATS dur = AVG(\`gcp.composer.duration_seconds\`) BY b = ${BUCKET} | SORT \`\`b`,
      "b",
      [{ col: "dur", label: "Duration s" }]
    ),
    xyLine(
      "gcp-comp-l2",
      0,
      25,
      24,
      "Failures over time",
      `FROM ${I_COMP} | STATS f = SUM(CASE(\`gcp.composer.state\` == "failed", 1, 0)) BY b = ${BUCKET} | SORT \`\`b`,
      "b",
      [{ col: "f", label: "Failed" }]
    ),
    xyBarH(
      "gcp-comp-b1",
      24,
      25,
      "Duration by DAG (s)",
      `FROM ${I_COMP} | STATS dur = ROUND(AVG(\`gcp.composer.duration_seconds\`), 0) BY dag = \`gcp.composer.dag_id\` | SORT \`\`dur DESC | LIMIT 10`,
      "dag",
      "dur",
      "Avg s"
    ),
    dataTable(
      "gcp-comp-t1",
      35,
      "Recent DAG tasks",
      `FROM ${I_COMP} | KEEP \`@timestamp\`\`@timestamp\`, \`gcp.composer.dag_id\`, \`gcp.composer.task_id\`, \`gcp.composer.state\`, \`gcp.composer.operator\`, \`gcp.composer.duration_seconds\`, \`gcp.composer.try_number\`, \`gcp.composer.environment_name\` | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "gcp.composer.dag_id", label: "DAG" },
        { col: "gcp.composer.task_id", label: "Task" },
        { col: "gcp.composer.state", label: "State" },
        { col: "gcp.composer.operator", label: "Operator" },
        { col: "gcp.composer.duration_seconds", label: "Duration s" },
        { col: "gcp.composer.try_number", label: "Try" },
        { col: "gcp.composer.environment_name", label: "Environment" },
      ]
    ),
  ]),
]);

// ── Azure Blob Storage ────────────────────────────────────────────────────────
const I_BLOB = "logs-azure.blob_storage*";
dashboards.push([
  "installer/azure-custom-dashboards/blob-storage-dashboard.json",
  dash("Azure Blob Storage — Operations & Throughput", [
    metric("az-blob-k1", 0, "Operations", `FROM ${I_BLOB} | STATS Operations = COUNT()`),
    metric(
      "az-blob-k2",
      12,
      "Throughput (MB)",
      `FROM ${I_BLOB} | STATS mb = SUM(\`azure.blob_storage.bytes\`) / 1048576 | EVAL \`Throughput (MB)\` = ROUND(mb, 1)`
    ),
    metric(
      "az-blob-k3",
      24,
      "Avg latency (ms)",
      `FROM ${I_BLOB} | STATS \`Avg latency (ms)\` = ROUND(AVG(\`azure.blob_storage.e2e_latency_ms\`), 0)`
    ),
    metric("az-blob-k4", 36, "Error %", errPct(I_BLOB)),
    donut(
      "az-blob-d1",
      0,
      "Operation",
      `FROM ${I_BLOB} | STATS c = COUNT() BY op = \`azure.blob_storage.operation\` | SORT \`\`c DESC | LIMIT 10`,
      "c",
      "op"
    ),
    donut(
      "az-blob-d2",
      16,
      "Container",
      `FROM ${I_BLOB} | STATS c = COUNT() BY ct = \`azure.blob_storage.container\` | SORT \`\`c DESC | LIMIT 10`,
      "c",
      "ct"
    ),
    donut(
      "az-blob-d3",
      32,
      "Outcome",
      `FROM ${I_BLOB} | STATS c = COUNT() BY o = event.outcome | SORT \`\`c DESC`,
      "c",
      "o"
    ),
    xyLine(
      "az-blob-l1",
      0,
      15,
      48,
      "Operations over time",
      `FROM ${I_BLOB} | STATS c = COUNT() BY b = ${BUCKET} | SORT \`\`b`,
      "b",
      [{ col: "c", label: "Ops" }]
    ),
    xyLine(
      "az-blob-l2",
      0,
      25,
      24,
      "Throughput over time (MB)",
      `FROM ${I_BLOB} | STATS mb = SUM(\`azure.blob_storage.bytes\`) / 1048576 BY b = ${BUCKET} | SORT \`\`b`,
      "b",
      [{ col: "mb", label: "MB" }]
    ),
    xyBarH(
      "az-blob-b1",
      24,
      25,
      "Error rate by container",
      `FROM ${I_BLOB} | STATS err = SUM(CASE(event.outcome == "failure", 1, 0)), total = COUNT() BY ct = \`azure.blob_storage.container\` | EVAL rate = ROUND(err * 100.0 / total, 1) | SORT \`\`rate DESC | LIMIT 10`,
      "ct",
      "rate",
      "Error %"
    ),
    dataTable(
      "az-blob-t1",
      35,
      "Recent operations",
      `FROM ${I_BLOB} | KEEP \`@timestamp\`\`@timestamp\`, \`azure.blob_storage.storage_account\`, \`azure.blob_storage.container\`, \`azure.blob_storage.blob\`, \`azure.blob_storage.operation\`, \`azure.blob_storage.bytes\`, \`azure.blob_storage.e2e_latency_ms\`, event.outcome | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "azure.blob_storage.storage_account", label: "Account" },
        { col: "azure.blob_storage.container", label: "Container" },
        { col: "azure.blob_storage.blob", label: "Blob" },
        { col: "azure.blob_storage.operation", label: "Operation" },
        { col: "azure.blob_storage.bytes", label: "Bytes" },
        { col: "azure.blob_storage.e2e_latency_ms", label: "Latency ms" },
        { col: "event.outcome", label: "Outcome" },
      ]
    ),
  ]),
]);

// ── Azure Cache for Redis ─────────────────────────────────────────────────────
const I_REDIS = "logs-azure.redis_cache*";
const M_REDIS = "metrics-azure.redis_cache_metrics*";
dashboards.push([
  "installer/azure-custom-dashboards/cache-for-redis-dashboard.json",
  dash("Azure Cache for Redis — Hit Ratio & Memory", [
    metric("az-redis-k1", 0, "Events", `FROM ${I_REDIS} | STATS Events = COUNT()`),
    metric(
      "az-redis-k2",
      12,
      "Hit ratio %",
      `FROM ${M_REDIS} | STATS hits = SUM(\`azure.metrics.cachehits\`), misses = SUM(\`azure.metrics.cachemisses\`) | EVAL \`Hit ratio %\` = ROUND(hits * 100.0 / (hits + misses), 1)`
    ),
    metric(
      "az-redis-k3",
      24,
      "Avg memory (GB)",
      `FROM ${M_REDIS} | STATS \`Avg memory (GB)\` = ROUND(AVG(\`azure.metrics.usedmemory\`) / 1073741824.0, 2)`
    ),
    metric(
      "az-redis-k4",
      36,
      "Evictions",
      `FROM ${M_REDIS} | STATS Evictions = SUM(\`azure.metrics.evictedkeys\`)`
    ),
    donut(
      "az-redis-d1",
      0,
      "Category",
      `FROM ${I_REDIS} | STATS c = COUNT() BY cat = \`azure.cache_for_redis.category\` | SORT \`\`c DESC`,
      "c",
      "cat"
    ),
    donut(
      "az-redis-d2",
      16,
      "Cache",
      `FROM ${I_REDIS} | STATS c = COUNT() BY cn = \`azure.cache_for_redis.cache_name\` | SORT \`\`c DESC | LIMIT 10`,
      "c",
      "cn"
    ),
    donut(
      "az-redis-d3",
      32,
      "Outcome",
      `FROM ${I_REDIS} | STATS c = COUNT() BY o = event.outcome | SORT \`\`c DESC`,
      "c",
      "o"
    ),
    xyLine(
      "az-redis-l1",
      0,
      15,
      48,
      "Connections over time",
      `FROM ${M_REDIS} | STATS conn = AVG(\`azure.metrics.connectedclients\`) BY b = ${BUCKET} | SORT \`\`b`,
      "b",
      [{ col: "conn", label: "Clients" }]
    ),
    xyLine(
      "az-redis-l2",
      0,
      25,
      24,
      "Evictions over time",
      `FROM ${M_REDIS} | STATS ev = SUM(\`azure.metrics.evictedkeys\`) BY b = ${BUCKET} | SORT \`\`b`,
      "b",
      [{ col: "ev", label: "Evictions" }]
    ),
    xyBarH(
      "az-redis-b1",
      24,
      25,
      "Memory by cache (GB)",
      `FROM ${M_REDIS} | STATS gb = ROUND(AVG(\`azure.metrics.usedmemory\`) / 1073741824.0, 2) BY cn = \`azure.resource.name\` | SORT \`\`gb DESC | LIMIT 10`,
      "cn",
      "gb",
      "GB"
    ),
    dataTable(
      "az-redis-t1",
      35,
      "Recent events",
      `FROM ${I_REDIS} | KEEP \`@timestamp\`\`@timestamp\`, \`azure.cache_for_redis.cache_name\`, \`azure.cache_for_redis.category\`, operationName, resultType, event.outcome, message | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "azure.cache_for_redis.cache_name", label: "Cache" },
        { col: "azure.cache_for_redis.category", label: "Category" },
        { col: "operationName", label: "Operation" },
        { col: "resultType", label: "Result" },
        { col: "event.outcome", label: "Outcome" },
        { col: "message", label: "Message" },
      ]
    ),
  ]),
]);

// ── Azure Cosmos DB ───────────────────────────────────────────────────────────
const I_COSMOS = "logs-azure.cosmos_db*";
dashboards.push([
  "installer/azure-custom-dashboards/cosmos-db-dashboard.json",
  dash("Azure Cosmos DB — RU & Request Latency", [
    metric("az-cosmos-k1", 0, "Requests", `FROM ${I_COSMOS} | STATS Requests = COUNT()`),
    metric(
      "az-cosmos-k2",
      12,
      "RU consumed",
      `FROM ${I_COSMOS} | STATS \`RU consumed\` = ROUND(SUM(\`azure.cosmos_db.ru_consumed\`), 0)`
    ),
    metric(
      "az-cosmos-k3",
      24,
      "Throttled",
      `FROM ${I_COSMOS} | STATS Throttled = SUM(CASE(\`azure.cosmos_db.status_code\` == 429, 1, 0))`
    ),
    metric("az-cosmos-k4", 36, "Error %", errPct(I_COSMOS)),
    donut(
      "az-cosmos-d1",
      0,
      "Operation",
      `FROM ${I_COSMOS} | STATS c = COUNT() BY op = operationName | SORT \`\`c DESC | LIMIT 10`,
      "c",
      "op"
    ),
    donut(
      "az-cosmos-d2",
      16,
      "Container",
      `FROM ${I_COSMOS} | STATS c = COUNT() BY ct = \`azure.cosmos_db.container\` | SORT \`\`c DESC | LIMIT 10`,
      "c",
      "ct"
    ),
    donut(
      "az-cosmos-d3",
      32,
      "Status",
      `FROM ${I_COSMOS} | STATS c = COUNT() BY sc = TO_STRING(\`azure.cosmos_db.status_code\`) | SORT \`\`c DESC`,
      "c",
      "sc"
    ),
    xyLine(
      "az-cosmos-l1",
      0,
      15,
      48,
      "Request rate over time",
      `FROM ${I_COSMOS} | STATS c = COUNT() BY b = ${BUCKET} | SORT \`\`b`,
      "b",
      [{ col: "c", label: "Requests" }]
    ),
    xyLine(
      "az-cosmos-l2",
      0,
      25,
      24,
      "RU consumption over time",
      `FROM ${I_COSMOS} | STATS ru = SUM(\`azure.cosmos_db.ru_consumed\`) BY b = ${BUCKET} | SORT \`\`b`,
      "b",
      [{ col: "ru", label: "RU" }]
    ),
    xyBarH(
      "az-cosmos-b1",
      24,
      25,
      "Latency by collection (ms)",
      `FROM ${I_COSMOS} | STATS lat = ROUND(AVG(event.duration) / 1000000.0, 1) BY ct = \`azure.cosmos_db.container\` | SORT \`\`lat DESC | LIMIT 10`,
      "ct",
      "lat",
      "Avg ms"
    ),
    dataTable(
      "az-cosmos-t1",
      35,
      "Recent requests",
      `FROM ${I_COSMOS} | KEEP \`@timestamp\`\`@timestamp\`, \`azure.cosmos_db.account\`, \`azure.cosmos_db.database\`, \`azure.cosmos_db.container\`, operationName, \`azure.cosmos_db.ru_consumed\`, \`azure.cosmos_db.status_code\`, event.outcome | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "azure.cosmos_db.account", label: "Account" },
        { col: "azure.cosmos_db.database", label: "Database" },
        { col: "azure.cosmos_db.container", label: "Container" },
        { col: "operationName", label: "Operation" },
        { col: "azure.cosmos_db.ru_consumed", label: "RU" },
        { col: "azure.cosmos_db.status_code", label: "Status" },
        { col: "event.outcome", label: "Outcome" },
      ]
    ),
  ]),
]);

// ── Azure Container Apps ──────────────────────────────────────────────────────
const I_CA = "logs-azure.container_apps*";
dashboards.push([
  "installer/azure-custom-dashboards/container-apps-dashboard.json",
  dash("Azure Container Apps — Requests & Scaling", [
    metric("az-ca-k1", 0, "Events", `FROM ${I_CA} | STATS Events = COUNT()`),
    metric(
      "az-ca-k2",
      12,
      "Ingress requests",
      `FROM ${I_CA} | WHERE \`azure.container_apps.category\` == "ContainerAppIngressLogs" | STATS \`Ingress requests\` = COUNT()`
    ),
    metric(
      "az-ca-k3",
      24,
      "Scaling events",
      `FROM ${I_CA} | WHERE \`azure.container_apps.category\` == "ContainerAppRevisionProvisioning" | STATS \`Scaling events\` = COUNT()`
    ),
    metric("az-ca-k4", 36, "Error %", errPct(I_CA)),
    donut(
      "az-ca-d1",
      0,
      "Category",
      `FROM ${I_CA} | STATS c = COUNT() BY cat = \`azure.container_apps.category\` | SORT \`\`c DESC`,
      "c",
      "cat"
    ),
    donut(
      "az-ca-d2",
      16,
      "Revision",
      `FROM ${I_CA} | STATS c = COUNT() BY rev = \`azure.container_apps.revision\` | SORT \`\`c DESC | LIMIT 10`,
      "c",
      "rev"
    ),
    donut(
      "az-ca-d3",
      32,
      "Outcome",
      `FROM ${I_CA} | STATS c = COUNT() BY o = event.outcome | SORT \`\`c DESC`,
      "c",
      "o"
    ),
    xyLine(
      "az-ca-l1",
      0,
      15,
      48,
      "Request rate over time",
      `FROM ${I_CA} | WHERE \`azure.container_apps.category\` == "ContainerAppIngressLogs" | STATS c = COUNT() BY b = ${BUCKET} | SORT \`\`b`,
      "b",
      [{ col: "c", label: "Requests" }]
    ),
    xyLine(
      "az-ca-l2",
      0,
      25,
      24,
      "Errors over time",
      `FROM ${I_CA} | WHERE event.outcome == "failure" | STATS e = COUNT() BY b = ${BUCKET} | SORT \`\`b`,
      "b",
      [{ col: "e", label: "Errors" }]
    ),
    xyBarH(
      "az-ca-b1",
      24,
      25,
      "Traffic by app",
      `FROM ${I_CA} | STATS c = COUNT() BY app = \`azure.container_apps.app_name\` | SORT \`\`c DESC | LIMIT 10`,
      "app",
      "c",
      "Events"
    ),
    dataTable(
      "az-ca-t1",
      35,
      "Recent events",
      `FROM ${I_CA} | KEEP \`@timestamp\`\`@timestamp\`, \`azure.container_apps.app_name\`, \`azure.container_apps.revision\`, \`azure.container_apps.category\`, operationName, event.outcome, message | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "azure.container_apps.app_name", label: "App" },
        { col: "azure.container_apps.revision", label: "Revision" },
        { col: "azure.container_apps.category", label: "Category" },
        { col: "operationName", label: "Operation" },
        { col: "event.outcome", label: "Outcome" },
        { col: "message", label: "Message" },
      ]
    ),
  ]),
]);

// ── Azure Key Vault ───────────────────────────────────────────────────────────
const I_KV = "logs-azure.key_vault*";
dashboards.push([
  "installer/azure-custom-dashboards/key-vault-dashboard.json",
  dash("Azure Key Vault — Secrets & Certificates", [
    metric("az-kv-k1", 0, "Operations", `FROM ${I_KV} | STATS Operations = COUNT()`),
    metric(
      "az-kv-k2",
      12,
      "Distinct ops",
      `FROM ${I_KV} | STATS \`Distinct ops\` = COUNT_DISTINCT(\`azure.key_vault.operation\`)`
    ),
    metric(
      "az-kv-k3",
      24,
      "Forbidden",
      `FROM ${I_KV} | STATS Forbidden = SUM(CASE(\`azure.key_vault.result\` == "Forbidden", 1, 0))`
    ),
    metric("az-kv-k4", 36, "Error %", errPct(I_KV)),
    donut(
      "az-kv-d1",
      0,
      "Operation",
      `FROM ${I_KV} | STATS c = COUNT() BY op = \`azure.key_vault.operation\` | SORT \`\`c DESC`,
      "c",
      "op"
    ),
    donut(
      "az-kv-d2",
      16,
      "HTTP status",
      `FROM ${I_KV} | STATS c = COUNT() BY sc = TO_STRING(\`azure.key_vault.http_status_code\`) | SORT \`\`c DESC`,
      "c",
      "sc"
    ),
    donut(
      "az-kv-d3",
      32,
      "Outcome",
      `FROM ${I_KV} | STATS c = COUNT() BY o = event.outcome | SORT \`\`c DESC`,
      "c",
      "o"
    ),
    xyLine(
      "az-kv-l1",
      0,
      15,
      48,
      "Operations over time",
      `FROM ${I_KV} | STATS c = COUNT() BY b = ${BUCKET} | SORT \`\`b`,
      "b",
      [{ col: "c", label: "Ops" }]
    ),
    xyLine(
      "az-kv-l2",
      0,
      25,
      24,
      "Errors over time",
      `FROM ${I_KV} | WHERE event.outcome == "failure" | STATS e = COUNT() BY b = ${BUCKET} | SORT \`\`b`,
      "b",
      [{ col: "e", label: "Errors" }]
    ),
    xyBarH(
      "az-kv-b1",
      24,
      25,
      "Operations by vault",
      `FROM ${I_KV} | STATS c = COUNT() BY v = \`azure.key_vault.vault_name\` | SORT \`\`c DESC | LIMIT 10`,
      "v",
      "c",
      "Ops"
    ),
    dataTable(
      "az-kv-t1",
      35,
      "Recent operations",
      `FROM ${I_KV} | KEEP \`@timestamp\`\`@timestamp\`, \`azure.key_vault.vault_name\`, \`azure.key_vault.operation\`, \`azure.key_vault.result\`, \`azure.key_vault.http_status_code\`, \`azure.key_vault.caller_ip\`, event.outcome | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "azure.key_vault.vault_name", label: "Vault" },
        { col: "azure.key_vault.operation", label: "Operation" },
        { col: "azure.key_vault.result", label: "Result" },
        { col: "azure.key_vault.http_status_code", label: "HTTP" },
        { col: "azure.key_vault.caller_ip", label: "Caller IP" },
        { col: "event.outcome", label: "Outcome" },
      ]
    ),
  ]),
]);

// ── Azure Event Hubs ──────────────────────────────────────────────────────────
const I_EH = "logs-azure.event_hubs*";
dashboards.push([
  "installer/azure-custom-dashboards/event-hubs-dashboard.json",
  dash("Azure Event Hubs — Throughput & Consumer Lag", [
    metric("az-eh-k1", 0, "Events", `FROM ${I_EH} | STATS Events = COUNT()`),
    metric(
      "az-eh-k2",
      12,
      "Incoming (MB)",
      `FROM ${I_EH} | STATS mb = SUM(\`azure.event_hubs.incoming_bytes\`) / 1048576 | EVAL \`Incoming (MB)\` = ROUND(mb, 1)`
    ),
    metric(
      "az-eh-k3",
      24,
      "Throttled",
      `FROM ${I_EH} | STATS Throttled = SUM(CASE(\`azure.event_hubs.server_busy\` == true, 1, 0))`
    ),
    metric(
      "az-eh-k4",
      36,
      "Namespaces",
      `FROM ${I_EH} | STATS Namespaces = COUNT_DISTINCT(\`azure.event_hubs.namespace\`)`
    ),
    donut(
      "az-eh-d1",
      0,
      "Event hub",
      `FROM ${I_EH} | STATS c = COUNT() BY hub = \`azure.event_hubs.eventhub\` | SORT \`\`c DESC | LIMIT 10`,
      "c",
      "hub"
    ),
    donut(
      "az-eh-d2",
      16,
      "Partition",
      `FROM ${I_EH} | STATS c = COUNT() BY p = TO_STRING(\`azure.event_hubs.partition\`) | SORT \`\`c DESC | LIMIT 10`,
      "c",
      "p"
    ),
    donut(
      "az-eh-d3",
      32,
      "Outcome",
      `FROM ${I_EH} | STATS c = COUNT() BY o = event.outcome | SORT \`\`c DESC`,
      "c",
      "o"
    ),
    xyLine(
      "az-eh-l1",
      0,
      15,
      48,
      "Message rate over time",
      `FROM ${I_EH} | STATS c = COUNT() BY b = ${BUCKET} | SORT \`\`b`,
      "b",
      [{ col: "c", label: "Events" }]
    ),
    xyLine(
      "az-eh-l2",
      0,
      25,
      24,
      "Incoming bytes over time (MB)",
      `FROM ${I_EH} | STATS mb = SUM(\`azure.event_hubs.incoming_bytes\`) / 1048576 BY b = ${BUCKET} | SORT \`\`b`,
      "b",
      [{ col: "mb", label: "MB" }]
    ),
    xyBarH(
      "az-eh-b1",
      24,
      25,
      "Throughput by namespace (MB)",
      `FROM ${I_EH} | STATS mb = ROUND(SUM(\`azure.event_hubs.incoming_bytes\`) / 1048576.0, 1) BY ns = \`azure.event_hubs.namespace\` | SORT \`\`mb DESC | LIMIT 10`,
      "ns",
      "mb",
      "MB"
    ),
    dataTable(
      "az-eh-t1",
      35,
      "Recent events",
      `FROM ${I_EH} | KEEP \`@timestamp\`\`@timestamp\`, \`azure.event_hubs.namespace\`, \`azure.event_hubs.eventhub\`, \`azure.event_hubs.partition\`, \`azure.event_hubs.incoming_bytes\`, \`azure.event_hubs.server_busy\`, event.outcome | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "azure.event_hubs.namespace", label: "Namespace" },
        { col: "azure.event_hubs.eventhub", label: "Hub" },
        { col: "azure.event_hubs.partition", label: "Partition" },
        { col: "azure.event_hubs.incoming_bytes", label: "Bytes" },
        { col: "azure.event_hubs.server_busy", label: "Throttled" },
        { col: "event.outcome", label: "Outcome" },
      ]
    ),
  ]),
]);

// ── Azure Logic Apps ──────────────────────────────────────────────────────────
const I_LA = "logs-azure.logic_apps*";
dashboards.push([
  "installer/azure-custom-dashboards/logic-apps-dashboard.json",
  dash("Azure Logic Apps — Workflow Runs", [
    metric("az-la-k1", 0, "Executions", `FROM ${I_LA} | STATS Executions = COUNT()`),
    metric(
      "az-la-k2",
      12,
      "Success %",
      `FROM ${I_LA} | STATS total = COUNT(), ok = SUM(CASE(\`azure.logic_apps.status\` IN ("Succeeded", "Completed"), 1, 0)) | EVAL \`Success %\` = ROUND(ok * 100.0 / total, 1)`
    ),
    metric(
      "az-la-k3",
      24,
      "Avg duration (ms)",
      `FROM ${I_LA} | STATS \`Avg duration (ms)\` = ROUND(AVG(\`azure.logic_apps.duration_ms\`), 0)`
    ),
    metric(
      "az-la-k4",
      36,
      "Action failures",
      `FROM ${I_LA} | STATS \`Action failures\` = SUM(CASE(event.outcome == "failure", 1, 0))`
    ),
    donut(
      "az-la-d1",
      0,
      "Status",
      `FROM ${I_LA} | STATS c = COUNT() BY st = \`azure.logic_apps.status\` | SORT \`\`c DESC`,
      "c",
      "st"
    ),
    donut(
      "az-la-d2",
      16,
      "Action type",
      `FROM ${I_LA} | STATS c = COUNT() BY at = \`azure.logic_apps.action_type\` | SORT \`\`c DESC | LIMIT 10`,
      "c",
      "at"
    ),
    donut(
      "az-la-d3",
      32,
      "Workflow",
      `FROM ${I_LA} | STATS c = COUNT() BY wf = \`azure.logic_apps.workflow_name\` | SORT \`\`c DESC | LIMIT 10`,
      "c",
      "wf"
    ),
    xyLine(
      "az-la-l1",
      0,
      15,
      48,
      "Executions over time",
      `FROM ${I_LA} | STATS c = COUNT() BY b = ${BUCKET} | SORT \`\`b`,
      "b",
      [{ col: "c", label: "Runs" }]
    ),
    xyLine(
      "az-la-l2",
      0,
      25,
      24,
      "Run duration over time (ms)",
      `FROM ${I_LA} | STATS d = AVG(\`azure.logic_apps.duration_ms\`) BY b = ${BUCKET} | SORT \`\`b`,
      "b",
      [{ col: "d", label: "Duration ms" }]
    ),
    xyBarH(
      "az-la-b1",
      24,
      25,
      "Failures by action",
      `FROM ${I_LA} | WHERE event.outcome == "failure" | STATS c = COUNT() BY act = \`azure.logic_apps.action_name\` | SORT \`\`c DESC | LIMIT 10`,
      "act",
      "c",
      "Failures"
    ),
    dataTable(
      "az-la-t1",
      35,
      "Recent runs",
      `FROM ${I_LA} | KEEP \`@timestamp\`\`@timestamp\`, \`azure.logic_apps.workflow_name\`, \`azure.logic_apps.run_id\`, \`azure.logic_apps.action_name\`, \`azure.logic_apps.action_type\`, \`azure.logic_apps.status\`, \`azure.logic_apps.duration_ms\`, event.outcome | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "azure.logic_apps.workflow_name", label: "Workflow" },
        { col: "azure.logic_apps.run_id", label: "Run ID" },
        { col: "azure.logic_apps.action_name", label: "Action" },
        { col: "azure.logic_apps.action_type", label: "Type" },
        { col: "azure.logic_apps.status", label: "Status" },
        { col: "azure.logic_apps.duration_ms", label: "Duration ms" },
        { col: "event.outcome", label: "Outcome" },
      ]
    ),
  ]),
]);

// ── Azure Databricks ──────────────────────────────────────────────────────────
const I_DBR = "logs-azure.databricks*";
dashboards.push([
  "installer/azure-custom-dashboards/databricks-dashboard.json",
  dash("Azure Databricks — Clusters & Spark Jobs", [
    metric("az-dbr-k1", 0, "Events", `FROM ${I_DBR} | STATS Events = COUNT()`),
    metric(
      "az-dbr-k2",
      12,
      "Job success %",
      `FROM ${I_DBR} | STATS total = COUNT(), ok = SUM(CASE(\`azure.databricks.state\` == "SUCCEEDED", 1, 0)) | EVAL \`Job success %\` = ROUND(ok * 100.0 / total, 1)`
    ),
    metric(
      "az-dbr-k3",
      24,
      "Avg duration (ms)",
      `FROM ${I_DBR} | STATS \`Avg duration (ms)\` = ROUND(AVG(\`azure.databricks.duration_ms\`), 0)`
    ),
    metric(
      "az-dbr-k4",
      36,
      "Records read",
      `FROM ${I_DBR} | STATS \`Records read\` = SUM(\`azure.databricks.spark.records_read\`)`
    ),
    donut(
      "az-dbr-d1",
      0,
      "State",
      `FROM ${I_DBR} | STATS c = COUNT() BY st = \`azure.databricks.state\` | SORT \`\`c DESC`,
      "c",
      "st"
    ),
    donut(
      "az-dbr-d2",
      16,
      "Workspace",
      `FROM ${I_DBR} | STATS c = COUNT() BY ws = \`azure.databricks.workspace_name\` | SORT \`\`c DESC | LIMIT 10`,
      "c",
      "ws"
    ),
    donut(
      "az-dbr-d3",
      32,
      "Outcome",
      `FROM ${I_DBR} | STATS c = COUNT() BY o = event.outcome | SORT \`\`c DESC`,
      "c",
      "o"
    ),
    xyLine(
      "az-dbr-l1",
      0,
      15,
      48,
      "Cluster utilization events",
      `FROM ${I_DBR} | STATS c = COUNT() BY b = ${BUCKET} | SORT \`\`b`,
      "b",
      [{ col: "c", label: "Events" }]
    ),
    xyLine(
      "az-dbr-l2",
      0,
      25,
      24,
      "Spark records over time",
      `FROM ${I_DBR} | STATS read = SUM(\`azure.databricks.spark.records_read\`), written = SUM(\`azure.databricks.spark.records_written\`) BY b = ${BUCKET} | SORT \`\`b`,
      "b",
      [
        { col: "read", label: "Read" },
        { col: "written", label: "Written" },
      ]
    ),
    xyBarH(
      "az-dbr-b1",
      24,
      25,
      "Stage latency by cluster (ms)",
      `FROM ${I_DBR} | STATS lat = ROUND(AVG(\`azure.databricks.duration_ms\`), 0) BY cl = \`azure.databricks.cluster_id\` | SORT \`\`lat DESC | LIMIT 10`,
      "cl",
      "lat",
      "Avg ms"
    ),
    dataTable(
      "az-dbr-t1",
      35,
      "Recent jobs",
      `FROM ${I_DBR} | KEEP \`@timestamp\`\`@timestamp\`, \`azure.databricks.workspace_name\`, \`azure.databricks.cluster_id\`, \`azure.databricks.job_id\`, \`azure.databricks.state\`, \`azure.databricks.duration_ms\`, \`azure.databricks.spark.records_read\`, event.outcome | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "azure.databricks.workspace_name", label: "Workspace" },
        { col: "azure.databricks.cluster_id", label: "Cluster" },
        { col: "azure.databricks.job_id", label: "Job" },
        { col: "azure.databricks.state", label: "State" },
        { col: "azure.databricks.duration_ms", label: "Duration ms" },
        { col: "azure.databricks.spark.records_read", label: "Records read" },
        { col: "event.outcome", label: "Outcome" },
      ]
    ),
  ]),
]);

// ── Azure Machine Learning ────────────────────────────────────────────────────
const I_AML = "logs-azure.machine_learning*";
dashboards.push([
  "installer/azure-custom-dashboards/machine-learning-dashboard.json",
  dash("Azure Machine Learning — Experiments & Deployments", [
    metric("az-aml-k1", 0, "Events", `FROM ${I_AML} | STATS Events = COUNT()`),
    metric(
      "az-aml-k2",
      12,
      "Experiment runs",
      `FROM ${I_AML} | WHERE \`azure.machine_learning.category\` == "AmlRunStatus" | STATS \`Experiment runs\` = COUNT()`
    ),
    metric(
      "az-aml-k3",
      24,
      "Deployments",
      `FROM ${I_AML} | WHERE \`azure.machine_learning.category\` == "AmlDeploymentEvent" | STATS Deployments = COUNT()`
    ),
    metric("az-aml-k4", 36, "Error %", errPct(I_AML)),
    donut(
      "az-aml-d1",
      0,
      "Category",
      `FROM ${I_AML} | STATS c = COUNT() BY cat = \`azure.machine_learning.category\` | SORT \`\`c DESC`,
      "c",
      "cat"
    ),
    donut(
      "az-aml-d2",
      16,
      "Workspace",
      `FROM ${I_AML} | STATS c = COUNT() BY ws = \`azure.machine_learning.workspace\` | SORT \`\`c DESC | LIMIT 10`,
      "c",
      "ws"
    ),
    donut(
      "az-aml-d3",
      32,
      "Outcome",
      `FROM ${I_AML} | STATS c = COUNT() BY o = event.outcome | SORT \`\`c DESC`,
      "c",
      "o"
    ),
    xyLine(
      "az-aml-l1",
      0,
      15,
      48,
      "Experiment runs over time",
      `FROM ${I_AML} | WHERE \`azure.machine_learning.category\` == "AmlRunStatus" | STATS c = COUNT() BY b = ${BUCKET} | SORT \`\`b`,
      "b",
      [{ col: "c", label: "Runs" }]
    ),
    xyLine(
      "az-aml-l2",
      0,
      25,
      24,
      "Training duration over time (ms)",
      `FROM ${I_AML} | STATS d = AVG(event.duration) / 1000000.0 BY b = ${BUCKET} | SORT \`\`b`,
      "b",
      [{ col: "d", label: "Duration ms" }]
    ),
    xyBarH(
      "az-aml-b1",
      24,
      25,
      "Inference latency by workspace (ms)",
      `FROM ${I_AML} | WHERE \`azure.machine_learning.category\` == "Inferencing" | STATS lat = ROUND(AVG(event.duration) / 1000000.0, 1) BY ws = \`azure.machine_learning.workspace\` | SORT \`\`lat DESC | LIMIT 10`,
      "ws",
      "lat",
      "Avg ms"
    ),
    dataTable(
      "az-aml-t1",
      35,
      "Recent ML events",
      `FROM ${I_AML} | KEEP \`@timestamp\`\`@timestamp\`, \`azure.machine_learning.workspace\`, \`azure.machine_learning.category\`, operationName, resultType, event.outcome, message | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "azure.machine_learning.workspace", label: "Workspace" },
        { col: "azure.machine_learning.category", label: "Category" },
        { col: "operationName", label: "Operation" },
        { col: "resultType", label: "Result" },
        { col: "event.outcome", label: "Outcome" },
        { col: "message", label: "Message" },
      ]
    ),
  ]),
]);

// ── Azure OpenAI ──────────────────────────────────────────────────────────────
const I_OAI = "logs-azure.openai*";
dashboards.push([
  "installer/azure-custom-dashboards/openai-dashboard.json",
  dash("Azure OpenAI — Tokens & Model Latency", [
    metric("az-oai-k1", 0, "Requests", `FROM ${I_OAI} | STATS Requests = COUNT()`),
    metric(
      "az-oai-k2",
      12,
      "Tokens",
      `FROM ${I_OAI} | STATS \`Tokens\` = SUM(\`azure.openai.prompt_tokens\`) + SUM(\`azure.openai.completion_tokens\`)`
    ),
    metric(
      "az-oai-k3",
      24,
      "Avg latency (ms)",
      `FROM ${I_OAI} | STATS \`Avg latency (ms)\` = ROUND(AVG(event.duration) / 1000000.0, 0)`
    ),
    metric("az-oai-k4", 36, "Error %", errPct(I_OAI)),
    donut(
      "az-oai-d1",
      0,
      "Model",
      `FROM ${I_OAI} | STATS c = COUNT() BY m = \`azure.openai.model\` | SORT \`\`c DESC | LIMIT 10`,
      "c",
      "m"
    ),
    donut(
      "az-oai-d2",
      16,
      "Deployment",
      `FROM ${I_OAI} | STATS c = COUNT() BY d = \`azure.openai.deployment\` | SORT \`\`c DESC | LIMIT 10`,
      "c",
      "d"
    ),
    donut(
      "az-oai-d3",
      32,
      "Finish reason",
      `FROM ${I_OAI} | STATS c = COUNT() BY fr = \`azure.openai.finish_reason\` | SORT \`\`c DESC`,
      "c",
      "fr"
    ),
    xyLine(
      "az-oai-l1",
      0,
      15,
      48,
      "Request rate over time",
      `FROM ${I_OAI} | STATS c = COUNT() BY b = ${BUCKET} | SORT \`\`b`,
      "b",
      [{ col: "c", label: "Requests" }]
    ),
    xyLine(
      "az-oai-l2",
      0,
      25,
      24,
      "Token usage over time",
      `FROM ${I_OAI} | STATS tok = SUM(\`azure.openai.prompt_tokens\`) + SUM(\`azure.openai.completion_tokens\`) BY b = ${BUCKET} | SORT \`\`b`,
      "b",
      [{ col: "tok", label: "Tokens" }]
    ),
    xyBarH(
      "az-oai-b1",
      24,
      25,
      "Latency by model (ms)",
      `FROM ${I_OAI} | STATS lat = ROUND(AVG(event.duration) / 1000000.0, 0) BY m = \`azure.openai.model\` | SORT \`\`lat DESC | LIMIT 10`,
      "m",
      "lat",
      "Avg ms"
    ),
    dataTable(
      "az-oai-t1",
      35,
      "Recent requests",
      `FROM ${I_OAI} | KEEP \`@timestamp\`\`@timestamp\`, \`azure.openai.deployment\`, \`azure.openai.model\`, \`azure.openai.prompt_tokens\`, \`azure.openai.completion_tokens\`, \`azure.openai.finish_reason\`, event.outcome, message | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "azure.openai.deployment", label: "Deployment" },
        { col: "azure.openai.model", label: "Model" },
        { col: "azure.openai.prompt_tokens", label: "Prompt tokens" },
        { col: "azure.openai.completion_tokens", label: "Completion tokens" },
        { col: "azure.openai.finish_reason", label: "Finish" },
        { col: "event.outcome", label: "Outcome" },
        { col: "message", label: "Message" },
      ]
    ),
  ]),
]);

for (const [rel, body] of dashboards) {
  const fp = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, body + "\n", "utf8");
}
console.log("Wrote", dashboards.length, "dashboard(s)");
