/**
 * Writes installer/azure-custom-dashboards/*-dashboard.json
 * Run: npx vite-node scripts/generate-azure-dashboards.mjs
 */
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "installer/azure-custom-dashboards");
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

const I_VM = "logs-azure.virtual_machines*";
writeDash("virtual-machines-dashboard.json", "Azure Virtual Machines — Operations", [
  lensMetric("az-vm-k1", { x: 0, y: 0, w: 12, h: 5 }, q(I_VM, "STATS c = COUNT()"), "c"),
  lensDonut(
    "az-vm-d1",
    { x: 0, y: 5, w: 16, h: 10 },
    "Outcome",
    q(I_VM, "STATS c = COUNT() BY o = event.outcome"),
    "c",
    "o"
  ),
  lensLine(
    "az-vm-l1",
    { x: 0, y: 15, w: 48, h: 10 },
    "Events",
    q(I_VM, "STATS c = COUNT() BY b = BUCKET(@timestamp, 75, ?_tstart, ?_tend) | SORT b"),
    "b",
    [["c", "Events"]]
  ),
  lensTable(
    "az-vm-t1",
    { x: 0, y: 25, w: 48, h: 12 },
    "Recent",
    q(
      I_VM,
      "KEEP @timestamp, `azure.virtual_machines.vm_name`, `azure.virtual_machines.operation`, `azure.virtual_machines.status`, event.outcome, message | SORT @timestamp DESC | LIMIT 100"
    ),
    [
      ["@timestamp", "Time"],
      ["azure.virtual_machines.vm_name", "VM"],
      ["azure.virtual_machines.operation", "Op"],
      ["azure.virtual_machines.status", "Status"],
      ["event.outcome", "Outcome"],
      ["message", "Message"],
    ]
  ),
]);

const I_AKS = "logs-azure.kubernetes*";
writeDash("aks-dashboard.json", "Azure Kubernetes Service — Events", [
  lensMetric("az-aks-k1", { x: 0, y: 0, w: 12, h: 5 }, q(I_AKS, "STATS c = COUNT()"), "c"),
  lensLine(
    "az-aks-l1",
    { x: 0, y: 5, w: 48, h: 10 },
    "Volume",
    q(I_AKS, "STATS c = COUNT() BY b = BUCKET(@timestamp, 75, ?_tstart, ?_tend) | SORT b"),
    "b",
    [["c", "Events"]]
  ),
  lensTable(
    "az-aks-t1",
    { x: 0, y: 15, w: 48, h: 12 },
    "Recent",
    q(
      I_AKS,
      "KEEP @timestamp, `azure.kubernetes.cluster_name`, `azure.kubernetes.namespace`, `azure.kubernetes.pod`, event.outcome, message | SORT @timestamp DESC | LIMIT 100"
    ),
    [
      ["@timestamp", "Time"],
      ["azure.kubernetes.cluster_name", "Cluster"],
      ["azure.kubernetes.namespace", "NS"],
      ["azure.kubernetes.pod", "Pod"],
      ["event.outcome", "Outcome"],
      ["message", "Message"],
    ]
  ),
]);

const I_APPSVC = "logs-azure.app_service*";
writeDash("app-service-dashboard.json", "Azure App Service — Requests", [
  lensMetric("az-as-k1", { x: 0, y: 0, w: 12, h: 5 }, q(I_APPSVC, "STATS c = COUNT()"), "c"),
  lensDonut(
    "az-as-d1",
    { x: 0, y: 5, w: 16, h: 10 },
    "Status",
    q(
      I_APPSVC,
      "STATS c = COUNT() BY s = `azure.app_service.status_code` | SORT c DESC | LIMIT 12"
    ),
    "c",
    "s"
  ),
  lensTable(
    "az-as-t1",
    { x: 0, y: 15, w: 48, h: 12 },
    "Recent",
    q(
      I_APPSVC,
      "KEEP @timestamp, `azure.app_service.app_name`, `azure.app_service.request_method`, `azure.app_service.url_path`, `azure.app_service.latency_ms`, event.outcome, message | SORT @timestamp DESC | LIMIT 100"
    ),
    [
      ["@timestamp", "Time"],
      ["azure.app_service.app_name", "App"],
      ["azure.app_service.request_method", "Method"],
      ["azure.app_service.url_path", "Path"],
      ["azure.app_service.latency_ms", "Latency ms"],
      ["event.outcome", "Outcome"],
      ["message", "Message"],
    ]
  ),
]);

const I_FUN = "logs-azure.functions*";
writeDash("functions-dashboard.json", "Azure Functions — Invocations", [
  lensMetric("az-fn-k1", { x: 0, y: 0, w: 12, h: 5 }, q(I_FUN, "STATS c = COUNT()"), "c"),
  lensLine(
    "az-fn-l1",
    { x: 0, y: 5, w: 48, h: 10 },
    "Invocations",
    q(I_FUN, "STATS c = COUNT() BY b = BUCKET(@timestamp, 75, ?_tstart, ?_tend) | SORT b"),
    "b",
    [["c", "Invocations"]]
  ),
  lensTable(
    "az-fn-t1",
    { x: 0, y: 15, w: 48, h: 12 },
    "Recent",
    q(
      I_FUN,
      "KEEP @timestamp, `azure.functions.function_name`, `azure.functions.trigger`, `azure.functions.duration_ms`, event.outcome, message | SORT @timestamp DESC | LIMIT 100"
    ),
    [
      ["@timestamp", "Time"],
      ["azure.functions.function_name", "Function"],
      ["azure.functions.trigger", "Trigger"],
      ["azure.functions.duration_ms", "Duration ms"],
      ["event.outcome", "Outcome"],
      ["message", "Message"],
    ]
  ),
]);

const I_SB = "logs-azure.service_bus*";
writeDash("service-bus-dashboard.json", "Azure Service Bus — Messages", [
  lensMetric("az-sb-k1", { x: 0, y: 0, w: 12, h: 5 }, q(I_SB, "STATS c = COUNT()"), "c"),
  lensTable(
    "az-sb-t1",
    { x: 0, y: 5, w: 48, h: 12 },
    "Recent",
    q(
      I_SB,
      "KEEP @timestamp, `azure.service_bus.namespace`, `azure.service_bus.entity`, `azure.service_bus.operation`, event.outcome, message | SORT @timestamp DESC | LIMIT 100"
    ),
    [
      ["@timestamp", "Time"],
      ["azure.service_bus.namespace", "Namespace"],
      ["azure.service_bus.entity", "Entity"],
      ["azure.service_bus.operation", "Op"],
      ["event.outcome", "Outcome"],
      ["message", "Message"],
    ]
  ),
]);

console.log(`Wrote Azure dashboards to ${path.relative(root, outDir)}/`);
