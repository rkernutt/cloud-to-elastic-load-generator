/**
 * Cloud-native metric and trace shapes alongside ECS / Elastic APM fields.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseDoc = Record<string, any>;

/** Monitored resource type hints for metrics (subset; align with logging where possible). */
const GCP_METRIC_RESOURCE_TYPE: Record<string, string> = {
  "compute-engine": "gce_instance",
  "cloud-functions": "cloud_function",
  "cloud-run": "cloud_run_revision",
  gke: "k8s_container",
  "cloud-sql": "cloudsql_database",
  bigquery: "bigquery_dataset",
  pubsub: "pubsub_topic",
  "cloud-storage": "gcs_bucket",
};

function gcpMetricResourceLabels(
  serviceId: string,
  doc: LooseDoc,
  projectId: string,
  region: string
): LooseDoc {
  const zone = doc.gcp?.compute_engine?.zone ?? `${region}-a`;
  const base = { project_id: projectId };
  switch (GCP_METRIC_RESOURCE_TYPE[serviceId] ?? "") {
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
        location: region,
      };
    default:
      return { ...base, region };
  }
}

function firstGcpMetricPoint(
  doc: LooseDoc,
  serviceId: string
): { metricTypeSuffix: string; value: number } | null {
  const block = doc.gcp?.[serviceId];
  if (!block?.metrics || typeof block.metrics !== "object") return null;
  const entries = Object.entries(block.metrics as Record<string, unknown>);
  if (entries.length === 0) return null;
  const [name, raw] = entries[0]!;
  let value = 0;
  if (raw && typeof raw === "object" && "avg" in raw) value = Number((raw as { avg: number }).avg);
  return { metricTypeSuffix: name, value };
}

/** TimeSeries-like metric document fragment @see Google Cloud Monitoring API v3 */
export function attachGcpMonitoringTimeSeriesFragment(
  doc: LooseDoc,
  serviceId: string,
  projectId: string,
  region: string
): void {
  const sample = firstGcpMetricPoint(doc, serviceId);
  if (!sample) return;
  const resourceType = GCP_METRIC_RESOURCE_TYPE[serviceId] ?? "global";
  const ts = typeof doc["@timestamp"] === "string" ? doc["@timestamp"] : new Date().toISOString();
  doc.monitoringTimeSeries = doc.monitoringTimeSeries ?? {
    metric: {
      type: `custom.googleapis.com/opentelemetry/elastic/samples/${serviceId}/${sample.metricTypeSuffix.replace(/[^a-zA-Z0-9/_-]/g, "_")}`,
      labels: {},
    },
    resource: {
      type: resourceType,
      labels: gcpMetricResourceLabels(serviceId, doc, projectId, region),
    },
    metricKind: "GAUGE",
    valueType: "DOUBLE",
    points: [
      {
        interval: { endTime: ts },
        value: { doubleValue: sample.value },
      },
    ],
  };
}

function firstAzureMetricPoint(
  doc: LooseDoc,
  serviceId: string
): { name: string; value: number } | null {
  const key = serviceId.replace(/-/g, "_");
  const block = doc.azure?.[key];
  if (!block?.metrics || typeof block.metrics !== "object") return null;
  const entries = Object.entries(block.metrics as Record<string, unknown>);
  if (entries.length === 0) return null;
  const [name, raw] = entries[0]!;
  let value = 0;
  if (raw && typeof raw === "object" && "avg" in raw) value = Number((raw as { avg: number }).avg);
  return { name, value };
}

/** Azure Monitor metrics list / resource metric shape (simplified). */
export function attachAzureMonitorMetricFragment(
  doc: LooseDoc,
  serviceId: string,
  subscriptionId: string
): void {
  const sample = firstAzureMetricPoint(doc, serviceId);
  if (!sample) return;
  const rg =
    doc.azure?.virtual_machines?.resource_group ??
    doc.azure?.kubernetes?.resource_group ??
    `rg-${serviceId}`;
  doc.azureMonitorMetric = doc.azureMonitorMetric ?? {
    time: doc["@timestamp"],
    metricName: sample.name,
    resourceGroup: rg,
    subscriptionId,
    timeseries: [
      {
        data: [{ average: sample.value, count: 1 }],
      },
    ],
  };
}

/** Cloud Trace resource name @see https://cloud.google.com/trace/docs/reference/v2/rest/v2/projects.traces */
export function attachGcpCloudTraceFragment(doc: LooseDoc, projectId: string): void {
  const traceId = doc.trace?.id;
  if (typeof traceId !== "string" || traceId.length === 0) return;
  const spanId = doc.span?.id ?? doc.transaction?.id;
  doc.gcpCloudTrace = doc.gcpCloudTrace ?? {
    trace: `projects/${projectId}/traces/${traceId}`,
    ...(typeof spanId === "string" ? { spanId } : {}),
  };
}

/** Application Insights–style correlation (partial) for trace exports */
export function attachAzureApplicationInsightsFragment(doc: LooseDoc): void {
  const opId = doc.trace?.id;
  if (typeof opId !== "string") return;
  doc.applicationInsights = doc.applicationInsights ?? {
    operation_Id: opId.replace(/-/g, "").slice(0, 32),
    operation_ParentId:
      typeof doc.parent?.id === "string" ? doc.parent.id.replace(/-/g, "").slice(0, 32) : "",
    id: typeof doc.span?.id === "string" ? doc.span.id.replace(/-/g, "").slice(0, 16) : undefined,
    name: doc.span?.name ?? doc.transaction?.name,
  };
}
