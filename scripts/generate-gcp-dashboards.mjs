/**
 * Writes installer/gcp-custom-dashboards/*-dashboard.json (Kibana Dashboards API format).
 * Run: npx vite-node scripts/generate-gcp-dashboards.mjs
 */
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "installer/gcp-custom-dashboards");
mkdirSync(outDir, { recursive: true });

function lensMetric(uid, grid, query, column) {
  return {
    type: "lens",
    uid,
    grid,
    config: {
      title: "",
      attributes: {
        type: "metric",
        dataset: { type: "esql", query },
        metrics: [{ type: "primary", operation: "value", column }],
      },
    },
  };
}

function lensDonut(uid, grid, title, query, metricCol, groupCol) {
  return {
    type: "lens",
    uid,
    grid,
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

function lensLine(uid, grid, title, query, xCol, ySpec) {
  return {
    type: "lens",
    uid,
    grid,
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
            y: ySpec.map(([col, label]) => ({ operation: "value", column: col, label })),
          },
        ],
      },
    },
  };
}

function lensBarH(uid, grid, title, query, xCol, yCol, yLabel) {
  return {
    type: "lens",
    uid,
    grid,
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

function lensTable(uid, grid, title, query, metrics) {
  return {
    type: "lens",
    uid,
    grid,
    config: {
      title,
      attributes: {
        type: "datatable",
        dataset: { type: "esql", query },
        metrics: metrics.map(([col, label]) => ({ operation: "value", column: col, label })),
        rows: [],
      },
    },
  };
}

function writeDash(filename, title, panels) {
  writeFileSync(
    path.join(outDir, filename),
    JSON.stringify({ title, time_range: { from: "now-24h", to: "now" }, panels }, null, 2) + "\n",
    "utf8"
  );
}

const q = (idx, sql) => `FROM ${idx} | ${sql}`;

// ── Cloud Functions ───────────────────────────────────────────────────────────
const I_CF = "logs-gcp.cloudfunctions*";
writeDash("cloud-functions-dashboard.json", "GCP Cloud Functions — Invocations & Performance", [
  lensMetric("gcp-cf-k1", { x: 0, y: 0, w: 12, h: 5 }, q(I_CF, "STATS `Total` = COUNT()"), "Total"),
  lensMetric(
    "gcp-cf-k2",
    { x: 12, y: 0, w: 12, h: 5 },
    q(
      I_CF,
      'EVAL is_err = CASE(event.outcome == "failure", 1, 0) | STATS e = AVG(is_err) | EVAL `Err %` = ROUND(e * 100, 1)'
    ),
    "Err %"
  ),
  lensMetric(
    "gcp-cf-k3",
    { x: 24, y: 0, w: 12, h: 5 },
    q(I_CF, "STATS m = AVG(event.duration) | EVAL `Avg dur (ms)` = ROUND(m, 1)"),
    "Avg dur (ms)"
  ),
  lensDonut(
    "gcp-cf-d1",
    { x: 0, y: 5, w: 16, h: 10 },
    "Outcome",
    q(I_CF, "STATS c = COUNT() BY o = event.outcome"),
    "c",
    "o"
  ),
  lensDonut(
    "gcp-cf-d2",
    { x: 16, y: 5, w: 16, h: 10 },
    "Runtime",
    q(I_CF, "STATS c = COUNT() BY r = `gcp.cloud_functions.runtime` | SORT c DESC | LIMIT 8"),
    "c",
    "r"
  ),
  lensDonut(
    "gcp-cf-d3",
    { x: 32, y: 5, w: 16, h: 10 },
    "Top functions",
    q(
      I_CF,
      "STATS c = COUNT() BY f = `gcp.cloud_functions.function_name` | SORT c DESC | LIMIT 10"
    ),
    "c",
    "f"
  ),
  lensLine(
    "gcp-cf-l1",
    { x: 0, y: 15, w: 48, h: 10 },
    "Events over time",
    q(I_CF, "STATS c = COUNT() BY b = BUCKET(@timestamp, 75, ?_tstart, ?_tend) | SORT b"),
    "b",
    [["c", "Events"]]
  ),
  lensBarH(
    "gcp-cf-b1",
    { x: 0, y: 25, w: 24, h: 10 },
    "Avg duration by function (ms)",
    q(
      I_CF,
      "STATS a = AVG(event.duration) BY f = `gcp.cloud_functions.function_name` | SORT a DESC | LIMIT 10"
    ),
    "f",
    "a",
    "Avg ms"
  ),
  lensTable(
    "gcp-cf-t1",
    { x: 0, y: 35, w: 48, h: 12 },
    "Recent events",
    q(
      I_CF,
      "KEEP @timestamp, `gcp.cloud_functions.function_name`, `gcp.cloud_functions.runtime`, `gcp.cloud_functions.status`, event.outcome, event.duration, message | SORT @timestamp DESC | LIMIT 100"
    ),
    [
      ["@timestamp", "Time"],
      ["gcp.cloud_functions.function_name", "Function"],
      ["gcp.cloud_functions.runtime", "Runtime"],
      ["gcp.cloud_functions.status", "Status"],
      ["event.outcome", "Outcome"],
      ["event.duration", "Duration"],
      ["message", "Message"],
    ]
  ),
]);

// ── Cloud Run ─────────────────────────────────────────────────────────────────
const I_CR = "logs-gcp.cloudrun*";
writeDash("cloud-run-dashboard.json", "GCP Cloud Run — Requests & Latency", [
  lensMetric(
    "gcp-cr-k1",
    { x: 0, y: 0, w: 12, h: 5 },
    q(I_CR, "STATS `Requests` = COUNT()"),
    "Requests"
  ),
  lensMetric(
    "gcp-cr-k2",
    { x: 12, y: 0, w: 12, h: 5 },
    q(
      I_CR,
      'EVAL is_err = CASE(event.outcome == "failure", 1, 0) | STATS e = AVG(is_err) | EVAL `Err %` = ROUND(e * 100, 1)'
    ),
    "Err %"
  ),
  lensMetric(
    "gcp-cr-k3",
    { x: 24, y: 0, w: 12, h: 5 },
    q(I_CR, "STATS m = AVG(event.duration) | EVAL `Avg dur (ms)` = ROUND(m, 1)"),
    "Avg dur (ms)"
  ),
  lensDonut(
    "gcp-cr-d1",
    { x: 0, y: 5, w: 16, h: 10 },
    "HTTP status",
    q(I_CR, "STATS c = COUNT() BY s = `gcp.cloud_run.response_status` | SORT c DESC | LIMIT 12"),
    "c",
    "s"
  ),
  lensDonut(
    "gcp-cr-d2",
    { x: 16, y: 5, w: 16, h: 10 },
    "Top services",
    q(I_CR, "STATS c = COUNT() BY svc = `gcp.cloud_run.service_name` | SORT c DESC | LIMIT 10"),
    "c",
    "svc"
  ),
  lensLine(
    "gcp-cr-l1",
    { x: 0, y: 15, w: 48, h: 10 },
    "Request volume",
    q(I_CR, "STATS c = COUNT() BY b = BUCKET(@timestamp, 75, ?_tstart, ?_tend) | SORT b"),
    "b",
    [["c", "Requests"]]
  ),
  lensTable(
    "gcp-cr-t1",
    { x: 0, y: 25, w: 48, h: 12 },
    "Recent requests",
    q(
      I_CR,
      "KEEP @timestamp, `gcp.cloud_run.service_name`, `gcp.cloud_run.request_method`, `gcp.cloud_run.url_path`, `gcp.cloud_run.response_status`, event.outcome, event.duration, message | SORT @timestamp DESC | LIMIT 100"
    ),
    [
      ["@timestamp", "Time"],
      ["gcp.cloud_run.service_name", "Service"],
      ["gcp.cloud_run.request_method", "Method"],
      ["gcp.cloud_run.url_path", "Path"],
      ["gcp.cloud_run.response_status", "Status"],
      ["event.outcome", "Outcome"],
      ["event.duration", "Duration"],
      ["message", "Message"],
    ]
  ),
]);

// ── GKE ──────────────────────────────────────────────────────────────────────
const I_GKE = "logs-gcp.gke*";
writeDash("gke-dashboard.json", "GCP GKE — Pod & Cluster Events", [
  lensMetric(
    "gcp-gke-k1",
    { x: 0, y: 0, w: 12, h: 5 },
    q(I_GKE, "STATS `Events` = COUNT()"),
    "Events"
  ),
  lensMetric(
    "gcp-gke-k2",
    { x: 12, y: 0, w: 12, h: 5 },
    q(
      I_GKE,
      'EVAL is_err = CASE(event.outcome == "failure", 1, 0) | STATS e = AVG(is_err) | EVAL `Fail %` = ROUND(e * 100, 1)'
    ),
    "Fail %"
  ),
  lensDonut(
    "gcp-gke-d1",
    { x: 0, y: 5, w: 16, h: 10 },
    "Event type",
    q(I_GKE, "STATS c = COUNT() BY t = `gcp.gke.event_type` | SORT c DESC | LIMIT 12"),
    "c",
    "t"
  ),
  lensDonut(
    "gcp-gke-d2",
    { x: 16, y: 5, w: 16, h: 10 },
    "Namespace",
    q(I_GKE, "STATS c = COUNT() BY n = `gcp.gke.namespace` | SORT c DESC | LIMIT 10"),
    "c",
    "n"
  ),
  lensLine(
    "gcp-gke-l1",
    { x: 0, y: 15, w: 48, h: 10 },
    "Events over time",
    q(I_GKE, "STATS c = COUNT() BY b = BUCKET(@timestamp, 75, ?_tstart, ?_tend) | SORT b"),
    "b",
    [["c", "Events"]]
  ),
  lensTable(
    "gcp-gke-t1",
    { x: 0, y: 25, w: 48, h: 12 },
    "Recent pod events",
    q(
      I_GKE,
      "KEEP @timestamp, `gcp.gke.cluster`, `gcp.gke.namespace`, `gcp.gke.pod`, `gcp.gke.event_type`, `gcp.gke.severity`, event.outcome, message | SORT @timestamp DESC | LIMIT 100"
    ),
    [
      ["@timestamp", "Time"],
      ["gcp.gke.cluster", "Cluster"],
      ["gcp.gke.namespace", "Namespace"],
      ["gcp.gke.pod", "Pod"],
      ["gcp.gke.event_type", "Event"],
      ["gcp.gke.severity", "Severity"],
      ["event.outcome", "Outcome"],
      ["message", "Message"],
    ]
  ),
]);

// ── BigQuery ──────────────────────────────────────────────────────────────────
const I_BQ = "logs-gcp.bigquery*";
writeDash("bigquery-dashboard.json", "GCP BigQuery — Jobs & Slot Usage", [
  lensMetric("gcp-bq-k1", { x: 0, y: 0, w: 12, h: 5 }, q(I_BQ, "STATS `Jobs` = COUNT()"), "Jobs"),
  lensMetric(
    "gcp-bq-k2",
    { x: 12, y: 0, w: 12, h: 5 },
    q(
      I_BQ,
      'EVAL is_err = CASE(event.outcome == "failure", 1, 0) | STATS e = AVG(is_err) | EVAL `Fail %` = ROUND(e * 100, 1)'
    ),
    "Fail %"
  ),
  lensMetric(
    "gcp-bq-k3",
    { x: 24, y: 0, w: 12, h: 5 },
    q(
      I_BQ,
      "STATS tb = SUM(`gcp.bigquery.total_bytes_processed`) | EVAL `TB scanned` = ROUND(tb / 1099511627776.0, 2)"
    ),
    "TB scanned"
  ),
  lensDonut(
    "gcp-bq-d1",
    { x: 0, y: 5, w: 16, h: 10 },
    "Job type",
    q(I_BQ, "STATS c = COUNT() BY j = `gcp.bigquery.job_type`"),
    "c",
    "j"
  ),
  lensDonut(
    "gcp-bq-d2",
    { x: 16, y: 5, w: 16, h: 10 },
    "Statement",
    q(I_BQ, "STATS c = COUNT() BY s = `gcp.bigquery.statement_type` | SORT c DESC | LIMIT 10"),
    "c",
    "s"
  ),
  lensLine(
    "gcp-bq-l1",
    { x: 0, y: 15, w: 48, h: 10 },
    "Jobs over time",
    q(I_BQ, "STATS c = COUNT() BY b = BUCKET(@timestamp, 75, ?_tstart, ?_tend) | SORT b"),
    "b",
    [["c", "Jobs"]]
  ),
  lensTable(
    "gcp-bq-t1",
    { x: 0, y: 25, w: 48, h: 12 },
    "Recent jobs",
    q(
      I_BQ,
      "KEEP @timestamp, `gcp.bigquery.job_id`, `gcp.bigquery.job_type`, `gcp.bigquery.dataset`, `gcp.bigquery.statement_type`, `gcp.bigquery.total_bytes_processed`, event.outcome, message | SORT @timestamp DESC | LIMIT 100"
    ),
    [
      ["@timestamp", "Time"],
      ["gcp.bigquery.job_id", "Job"],
      ["gcp.bigquery.job_type", "Type"],
      ["gcp.bigquery.dataset", "Dataset"],
      ["gcp.bigquery.statement_type", "Statement"],
      ["gcp.bigquery.total_bytes_processed", "Bytes"],
      ["event.outcome", "Outcome"],
      ["message", "Message"],
    ]
  ),
]);

// ── Cloud SQL ─────────────────────────────────────────────────────────────────
const I_SQL = "logs-gcp.cloudsql*";
writeDash("cloud-sql-dashboard.json", "GCP Cloud SQL — Queries & Connections", [
  lensMetric(
    "gcp-sql-k1",
    { x: 0, y: 0, w: 12, h: 5 },
    q(I_SQL, "STATS `Queries` = COUNT()"),
    "Queries"
  ),
  lensMetric(
    "gcp-sql-k2",
    { x: 12, y: 0, w: 12, h: 5 },
    q(
      I_SQL,
      'EVAL is_err = CASE(event.outcome == "failure", 1, 0) | STATS e = AVG(is_err) | EVAL `Fail %` = ROUND(e * 100, 1)'
    ),
    "Fail %"
  ),
  lensMetric(
    "gcp-sql-k3",
    { x: 24, y: 0, w: 12, h: 5 },
    q(
      I_SQL,
      "STATS m = AVG(`gcp.cloud_sql.query_duration_ms`) | EVAL `Avg query (ms)` = ROUND(m, 2)"
    ),
    "Avg query (ms)"
  ),
  lensDonut(
    "gcp-sql-d1",
    { x: 0, y: 5, w: 16, h: 10 },
    "Engine",
    q(I_SQL, "STATS c = COUNT() BY e = `gcp.cloud_sql.database_engine`"),
    "c",
    "e"
  ),
  lensDonut(
    "gcp-sql-d2",
    { x: 16, y: 5, w: 16, h: 10 },
    "Query type",
    q(I_SQL, "STATS c = COUNT() BY t = `gcp.cloud_sql.query_type` | SORT c DESC | LIMIT 8"),
    "c",
    "t"
  ),
  lensLine(
    "gcp-sql-l1",
    { x: 0, y: 15, w: 48, h: 10 },
    "Volume",
    q(I_SQL, "STATS c = COUNT() BY b = BUCKET(@timestamp, 75, ?_tstart, ?_tend) | SORT b"),
    "b",
    [["c", "Queries"]]
  ),
  lensTable(
    "gcp-sql-t1",
    { x: 0, y: 25, w: 48, h: 12 },
    "Recent",
    q(
      I_SQL,
      "KEEP @timestamp, `gcp.cloud_sql.instance_name`, `gcp.cloud_sql.database_engine`, `gcp.cloud_sql.query_type`, `gcp.cloud_sql.query_duration_ms`, event.outcome, message | SORT @timestamp DESC | LIMIT 100"
    ),
    [
      ["@timestamp", "Time"],
      ["gcp.cloud_sql.instance_name", "Instance"],
      ["gcp.cloud_sql.database_engine", "Engine"],
      ["gcp.cloud_sql.query_type", "Query"],
      ["gcp.cloud_sql.query_duration_ms", "Dur ms"],
      ["event.outcome", "Outcome"],
      ["message", "Message"],
    ]
  ),
]);

// ── Pub/Sub ───────────────────────────────────────────────────────────────────
const I_PS = "logs-gcp.pubsub*";
writeDash("pubsub-dashboard.json", "GCP Pub/Sub — Publish & Subscribe", [
  lensMetric("gcp-ps-k1", { x: 0, y: 0, w: 12, h: 5 }, q(I_PS, "STATS c = COUNT()"), "c"),
  lensMetric(
    "gcp-ps-k2",
    { x: 12, y: 0, w: 12, h: 5 },
    q(
      I_PS,
      'EVAL is_err = CASE(event.outcome == "failure", 1, 0) | STATS e = AVG(is_err) | EVAL `Fail %` = ROUND(e * 100, 1)'
    ),
    "Fail %"
  ),
  lensDonut(
    "gcp-ps-d1",
    { x: 0, y: 5, w: 16, h: 10 },
    "Action",
    q(I_PS, "STATS c = COUNT() BY a = `gcp.pubsub.action`"),
    "c",
    "a"
  ),
  lensLine(
    "gcp-ps-l1",
    { x: 0, y: 15, w: 48, h: 10 },
    "Events",
    q(I_PS, "STATS c = COUNT() BY b = BUCKET(@timestamp, 75, ?_tstart, ?_tend) | SORT b"),
    "b",
    [["c", "Events"]]
  ),
  lensTable(
    "gcp-ps-t1",
    { x: 0, y: 25, w: 48, h: 12 },
    "Recent",
    q(
      I_PS,
      "KEEP @timestamp, `gcp.pubsub.topic_name`, `gcp.pubsub.subscription_name`, `gcp.pubsub.action`, `gcp.pubsub.message_size_bytes`, event.outcome, message | SORT @timestamp DESC | LIMIT 100"
    ),
    [
      ["@timestamp", "Time"],
      ["gcp.pubsub.topic_name", "Topic"],
      ["gcp.pubsub.subscription_name", "Sub"],
      ["gcp.pubsub.action", "Action"],
      ["gcp.pubsub.message_size_bytes", "Bytes"],
      ["event.outcome", "Outcome"],
      ["message", "Message"],
    ]
  ),
]);

// ── Dataflow ──────────────────────────────────────────────────────────────────
const I_DF = "logs-gcp.dataflow*";
writeDash("dataflow-dashboard.json", "GCP Dataflow — Jobs & Lag", [
  lensMetric("gcp-df-k1", { x: 0, y: 0, w: 12, h: 5 }, q(I_DF, "STATS c = COUNT()"), "c"),
  lensMetric(
    "gcp-df-k2",
    { x: 12, y: 0, w: 12, h: 5 },
    q(
      I_DF,
      "STATS m = AVG(`gcp.dataflow.watermark_lag_seconds`) | EVAL `Avg watermark lag (s)` = ROUND(m, 1)"
    ),
    "Avg watermark lag (s)"
  ),
  lensDonut(
    "gcp-df-d1",
    { x: 0, y: 5, w: 16, h: 10 },
    "Job type",
    q(I_DF, "STATS c = COUNT() BY t = `gcp.dataflow.job_type`"),
    "c",
    "t"
  ),
  lensLine(
    "gcp-df-l1",
    { x: 0, y: 15, w: 48, h: 10 },
    "Events",
    q(I_DF, "STATS c = COUNT() BY b = BUCKET(@timestamp, 75, ?_tstart, ?_tend) | SORT b"),
    "b",
    [["c", "Events"]]
  ),
  lensTable(
    "gcp-df-t1",
    { x: 0, y: 25, w: 48, h: 12 },
    "Recent",
    q(
      I_DF,
      "KEEP @timestamp, `gcp.dataflow.job_name`, `gcp.dataflow.job_type`, `gcp.dataflow.worker_count`, `gcp.dataflow.watermark_lag_seconds`, event.outcome, message | SORT @timestamp DESC | LIMIT 100"
    ),
    [
      ["@timestamp", "Time"],
      ["gcp.dataflow.job_name", "Job"],
      ["gcp.dataflow.job_type", "Type"],
      ["gcp.dataflow.worker_count", "Workers"],
      ["gcp.dataflow.watermark_lag_seconds", "Lag s"],
      ["event.outcome", "Outcome"],
      ["message", "Message"],
    ]
  ),
]);

// ── Vertex AI ─────────────────────────────────────────────────────────────────
const I_VX = "logs-gcp.vertexai*";
writeDash("vertex-ai-dashboard.json", "GCP Vertex AI — Predictions & Latency", [
  lensMetric("gcp-vx-k1", { x: 0, y: 0, w: 12, h: 5 }, q(I_VX, "STATS c = COUNT()"), "c"),
  lensMetric(
    "gcp-vx-k2",
    { x: 12, y: 0, w: 12, h: 5 },
    q(I_VX, "STATS m = AVG(`gcp.vertex_ai.latency_ms`) | EVAL `Avg latency (ms)` = ROUND(m, 1)"),
    "Avg latency (ms)"
  ),
  lensDonut(
    "gcp-vx-d1",
    { x: 0, y: 5, w: 16, h: 10 },
    "Model",
    q(I_VX, "STATS c = COUNT() BY m = `gcp.vertex_ai.model_name` | SORT c DESC | LIMIT 10"),
    "c",
    "m"
  ),
  lensLine(
    "gcp-vx-l1",
    { x: 0, y: 15, w: 48, h: 10 },
    "Events",
    q(I_VX, "STATS c = COUNT() BY b = BUCKET(@timestamp, 75, ?_tstart, ?_tend) | SORT b"),
    "b",
    [["c", "Events"]]
  ),
  lensTable(
    "gcp-vx-t1",
    { x: 0, y: 25, w: 48, h: 12 },
    "Recent",
    q(
      I_VX,
      "KEEP @timestamp, `gcp.vertex_ai.endpoint_id`, `gcp.vertex_ai.model_name`, `gcp.vertex_ai.prediction_type`, `gcp.vertex_ai.latency_ms`, event.outcome, message | SORT @timestamp DESC | LIMIT 100"
    ),
    [
      ["@timestamp", "Time"],
      ["gcp.vertex_ai.endpoint_id", "Endpoint"],
      ["gcp.vertex_ai.model_name", "Model"],
      ["gcp.vertex_ai.prediction_type", "Type"],
      ["gcp.vertex_ai.latency_ms", "Latency ms"],
      ["event.outcome", "Outcome"],
      ["message", "Message"],
    ]
  ),
]);

// ── Compute Engine ────────────────────────────────────────────────────────────
const I_CE = "logs-gcp.compute*";
writeDash("compute-engine-dashboard.json", "GCP Compute Engine — Instance Events", [
  lensMetric("gcp-ce-k1", { x: 0, y: 0, w: 12, h: 5 }, q(I_CE, "STATS c = COUNT()"), "c"),
  lensDonut(
    "gcp-ce-d1",
    { x: 0, y: 5, w: 16, h: 10 },
    "Event type",
    q(I_CE, "STATS c = COUNT() BY t = `gcp.compute_engine.event_type` | SORT c DESC | LIMIT 10"),
    "c",
    "t"
  ),
  lensLine(
    "gcp-ce-l1",
    { x: 0, y: 15, w: 48, h: 10 },
    "Events",
    q(I_CE, "STATS c = COUNT() BY b = BUCKET(@timestamp, 75, ?_tstart, ?_tend) | SORT b"),
    "b",
    [["c", "Events"]]
  ),
  lensTable(
    "gcp-ce-t1",
    { x: 0, y: 25, w: 48, h: 12 },
    "Recent",
    q(
      I_CE,
      "KEEP @timestamp, `gcp.compute_engine.instance_name`, `gcp.compute_engine.zone`, `gcp.compute_engine.machine_type`, `gcp.compute_engine.event_type`, event.outcome, message | SORT @timestamp DESC | LIMIT 100"
    ),
    [
      ["@timestamp", "Time"],
      ["gcp.compute_engine.instance_name", "Instance"],
      ["gcp.compute_engine.zone", "Zone"],
      ["gcp.compute_engine.machine_type", "Type"],
      ["gcp.compute_engine.event_type", "Event"],
      ["event.outcome", "Outcome"],
      ["message", "Message"],
    ]
  ),
]);

// ── VPC Flow ──────────────────────────────────────────────────────────────────
const I_VPC = "logs-gcp.vpcflow*";
writeDash("vpc-flow-dashboard.json", "GCP VPC Flow — Traffic & Denials", [
  lensMetric("gcp-vpc-k1", { x: 0, y: 0, w: 12, h: 5 }, q(I_VPC, "STATS c = COUNT()"), "c"),
  lensMetric(
    "gcp-vpc-k2",
    { x: 12, y: 0, w: 12, h: 5 },
    q(
      I_VPC,
      'EVAL is_deny = CASE(`gcp.vpc_flow.action` == "DENY", 1, 0) | STATS d = AVG(is_deny) | EVAL `Deny %` = ROUND(d * 100, 1)'
    ),
    "Deny %"
  ),
  lensDonut(
    "gcp-vpc-d1",
    { x: 0, y: 5, w: 16, h: 10 },
    "Action",
    q(I_VPC, "STATS c = COUNT() BY a = `gcp.vpc_flow.action`"),
    "c",
    "a"
  ),
  lensDonut(
    "gcp-vpc-d2",
    { x: 16, y: 5, w: 16, h: 10 },
    "Direction",
    q(I_VPC, "STATS c = COUNT() BY d = `gcp.vpc_flow.direction`"),
    "c",
    "d"
  ),
  lensLine(
    "gcp-vpc-l1",
    { x: 0, y: 15, w: 48, h: 10 },
    "Flows",
    q(I_VPC, "STATS c = COUNT() BY b = BUCKET(@timestamp, 75, ?_tstart, ?_tend) | SORT b"),
    "b",
    [["c", "Flows"]]
  ),
  lensTable(
    "gcp-vpc-t1",
    { x: 0, y: 25, w: 48, h: 12 },
    "Recent",
    q(
      I_VPC,
      "KEEP @timestamp, `gcp.vpc_flow.src_ip`, `gcp.vpc_flow.dst_ip`, `gcp.vpc_flow.dst_port`, `gcp.vpc_flow.protocol`, `gcp.vpc_flow.action`, event.outcome, message | SORT @timestamp DESC | LIMIT 100"
    ),
    [
      ["@timestamp", "Time"],
      ["gcp.vpc_flow.src_ip", "Src"],
      ["gcp.vpc_flow.dst_ip", "Dst"],
      ["gcp.vpc_flow.dst_port", "Port"],
      ["gcp.vpc_flow.protocol", "Proto"],
      ["gcp.vpc_flow.action", "Action"],
      ["event.outcome", "Outcome"],
      ["message", "Message"],
    ]
  ),
]);

// ── Cloud Build ───────────────────────────────────────────────────────────────
const I_CB = "logs-gcp.cloudbuild*";
writeDash("cloud-build-dashboard.json", "GCP Cloud Build — Pipeline Steps", [
  lensMetric("gcp-cb-k1", { x: 0, y: 0, w: 12, h: 5 }, q(I_CB, "STATS c = COUNT()"), "c"),
  lensMetric(
    "gcp-cb-k2",
    { x: 12, y: 0, w: 12, h: 5 },
    q(
      I_CB,
      'EVAL is_err = CASE(event.outcome == "failure", 1, 0) | STATS e = AVG(is_err) | EVAL `Fail %` = ROUND(e * 100, 1)'
    ),
    "Fail %"
  ),
  lensDonut(
    "gcp-cb-d1",
    { x: 0, y: 5, w: 16, h: 10 },
    "Status",
    q(I_CB, "STATS c = COUNT() BY s = `gcp.cloud_build.status` | SORT c DESC | LIMIT 10"),
    "c",
    "s"
  ),
  lensLine(
    "gcp-cb-l1",
    { x: 0, y: 15, w: 48, h: 10 },
    "Builds",
    q(I_CB, "STATS c = COUNT() BY b = BUCKET(@timestamp, 75, ?_tstart, ?_tend) | SORT b"),
    "b",
    [["c", "Builds"]]
  ),
  lensTable(
    "gcp-cb-t1",
    { x: 0, y: 25, w: 48, h: 12 },
    "Recent",
    q(
      I_CB,
      "KEEP @timestamp, `gcp.cloud_build.build_id`, `gcp.cloud_build.trigger_name`, `gcp.cloud_build.step_name`, `gcp.cloud_build.status`, `gcp.cloud_build.build_duration_seconds`, event.outcome, message | SORT @timestamp DESC | LIMIT 100"
    ),
    [
      ["@timestamp", "Time"],
      ["gcp.cloud_build.build_id", "Build"],
      ["gcp.cloud_build.trigger_name", "Trigger"],
      ["gcp.cloud_build.step_name", "Step"],
      ["gcp.cloud_build.status", "Status"],
      ["gcp.cloud_build.build_duration_seconds", "Sec"],
      ["event.outcome", "Outcome"],
      ["message", "Message"],
    ]
  ),
]);

const names = [
  "cloud-functions-dashboard.json",
  "cloud-run-dashboard.json",
  "gke-dashboard.json",
  "bigquery-dashboard.json",
  "cloud-sql-dashboard.json",
  "pubsub-dashboard.json",
  "dataflow-dashboard.json",
  "vertex-ai-dashboard.json",
  "compute-engine-dashboard.json",
  "vpc-flow-dashboard.json",
  "cloud-build-dashboard.json",
];
console.log(`Wrote ${names.length} dashboards to ${path.relative(root, outDir)}/`);
