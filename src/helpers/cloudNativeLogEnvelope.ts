/**
 * Adds cloud-native log envelope fields alongside ECS/Elastic shapes so synthetic
 * documents better match exported GCP Logging API and Azure resource log JSON.
 */

import { randId } from "./index";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseDoc = Record<string, any>;

/** GCP monitored resource types commonly seen in log entries (subset). */
const GCP_LOG_RESOURCE_TYPE: Record<string, string> = {
  "cloud-functions": "cloud_function",
  "cloud-run": "cloud_run_revision",
  "cloud-run-jobs": "cloud_run_job",
  "app-engine": "gae_app",
  "compute-engine": "gce_instance",
  batch: "global",
  gke: "k8s_container",
  "gke-autopilot": "k8s_container",
  "cloud-sql": "cloudsql_database",
  "cloud-spanner": "spanner_instance",
  firestore: "firestore_database",
  bigquery: "bigquery_resource",
  pubsub: "pubsub_topic",
  "cloud-storage": "gcs_bucket",
  "vpc-flow": "gce_subnetwork",
  "cloud-lb": "http_load_balancer",
  "cloud-armor": "security_policy",
  "vertex-ai": "aiplatform.googleapis.com/Endpoint",
  dataflow: "dataflow_step",
  dataproc: "cloud_dataproc_cluster",
  composer: "cloud_composer_environment",
};

const DEFAULT_GCP_RESOURCE = "global";

function gcpSeverity(doc: LooseDoc): string {
  const lvl = String(doc.log?.level ?? "info").toLowerCase();
  if (lvl === "error" || lvl === "fatal") return "ERROR";
  if (lvl === "warn" || lvl === "warning") return "WARNING";
  if (lvl === "debug") return "DEBUG";
  if (lvl === "trace") return "DEBUG";
  return "INFO";
}

function gcpResourceLabels(
  serviceId: string,
  doc: LooseDoc,
  projectId: string,
  region: string
): LooseDoc {
  const zone = doc.gcp?.compute_engine?.zone ?? `${region}-a`;
  const base = { project_id: projectId };
  switch (GCP_LOG_RESOURCE_TYPE[serviceId] ?? "") {
    case "gce_instance":
      return {
        ...base,
        instance_id:
          doc.gcp?.compute_engine?.instance_id ?? String(Math.floor(Math.random() * 1e12)),
        zone,
      };
    case "cloud_function":
      return {
        ...base,
        function_name: doc.gcp?.cloud_functions?.function_name ?? `fn-${serviceId}`,
        region,
      };
    case "cloud_run_revision":
      return {
        ...base,
        service_name: doc.gcp?.cloud_run?.service_name ?? "svc",
        revision_name: doc.gcp?.cloud_run?.revision_name ?? "svc-00001",
        location: region,
      };
    case "k8s_container":
      return {
        ...base,
        cluster_name: doc.gcp?.gke?.cluster_name ?? doc.gcp?.kubernetes?.cluster_name ?? "cluster",
        location: region,
        namespace_name: doc.kubernetes?.namespace ?? doc.gcp?.gke?.namespace ?? "default",
        pod_name: doc.kubernetes?.pod?.name ?? doc.gcp?.gke?.pod_name ?? "pod",
        container_name: doc.kubernetes?.container?.name ?? "app",
      };
    case "cloudsql_database":
      return {
        ...base,
        database_id: `${projectId}:${region}:db`,
        region,
      };
    default:
      return { ...base, region };
  }
}

/** @see https://cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry */
export function attachGcpLoggingApiEnvelope(
  doc: LooseDoc,
  serviceId: string,
  projectId: string,
  region: string
): void {
  const resourceType = GCP_LOG_RESOURCE_TYPE[serviceId] ?? DEFAULT_GCP_RESOURCE;
  const safeLogId = serviceId.replace(/\//g, "_");
  doc.logName = doc.logName ?? `projects/${projectId}/logs/${encodeURIComponent(safeLogId)}`;
  doc.resource = doc.resource ?? {
    type: resourceType,
    labels: gcpResourceLabels(serviceId, doc, projectId, region),
  };
  doc.severity = doc.severity ?? gcpSeverity(doc);
  doc.insertId = doc.insertId ?? randId(12);
  if (doc.jsonPayload == null && (doc.message != null || doc.gcp != null)) {
    doc.jsonPayload = {
      ...(typeof doc.gcp === "object" && doc.gcp != null ? doc.gcp : {}),
      ...(doc.message != null ? { message: doc.message } : {}),
    };
  }
}

const AZURE_CATEGORY: Record<string, string> = {
  "virtual-machines": "Administrative",
  aks: "kube-audit",
  functions: "FunctionAppLogs",
  "app-service": "AppServiceHTTPLogs",
  "sql-database": "SQLInsights",
  "blob-storage": "StorageRead",
  monitor: "Metric",
};

/** Resource log–like fields @see https://learn.microsoft.com/en-us/azure/azure-monitor/essentials/resource-logs-schema */
export function attachAzureResourceLogEnvelope(
  doc: LooseDoc,
  serviceId: string,
  subscriptionId: string
): void {
  const rg =
    firstResourceGroup(doc.azure) ??
    doc.azure?.virtual_machines?.resource_group ??
    doc.azure?.kubernetes?.resource_group ??
    "rg-app";
  const provider = String(doc.cloud?.service?.name ?? `Microsoft.Resources/${serviceId}`).replace(
    /\s+/g,
    ""
  );
  doc.category = doc.category ?? AZURE_CATEGORY[serviceId] ?? "Administrative";
  doc.resourceId =
    doc.resourceId ??
    `/subscriptions/${subscriptionId}/resourcegroups/${rg}/providers/${provider}/${
      doc.azure?.virtual_machines?.vm_name ?? serviceId
    }`;
  doc.operationName = doc.operationName ?? {
    localizedValue: doc.event?.action ?? "Write",
    value: `${serviceId}/action`,
  };
  if (doc.properties == null && doc.azure != null) {
    doc.properties = { ...doc.azure };
  }
  const cid = doc.correlationId ?? doc.azure?.virtual_machines?.correlation_id;
  if (cid != null) doc.correlationId = cid;
}

function firstResourceGroup(azure: LooseDoc | undefined): string | undefined {
  if (!azure || typeof azure !== "object") return undefined;
  for (const v of Object.values(azure)) {
    if (v && typeof v === "object" && "resource_group" in (v as object)) {
      const rg = (v as { resource_group?: string }).resource_group;
      if (typeof rg === "string") return rg;
    }
  }
  return undefined;
}
