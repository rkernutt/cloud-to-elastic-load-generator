/**
 * Default ingestion source for synthetic Azure logs (conceptual — maps to Elastic Agent / Monitor paths).
 */

const AZURE_SERVICE_INGESTION_DEFAULTS: Record<string, string> = {
  monitor: "azure-monitor",
  "activity-log": "azure-monitor",
  "entra-id": "entra",
  m365: "m365",
  "active-users-services": "o365-cel",
  "teams-user-activity": "o365-cel",
  "outlook-activity": "o365-cel",
  "onedrive-usage-storage": "o365-cel",
};

const AZURE_INGESTION_META: Record<string, { label: string; color: string; inputType: string }> = {
  default: { label: "Azure platform logs", color: "#0078D4", inputType: "azure-eventhub" },
  "azure-monitor": { label: "Azure Monitor", color: "#0078D4", inputType: "azure-eventhub" },
  entra: { label: "Microsoft Entra ID", color: "#0078D4", inputType: "httpjson" },
  m365: { label: "Microsoft 365 audit", color: "#0078D4", inputType: "httpjson" },
  "o365-cel": {
    label: "Microsoft 365 metrics (Graph / CEL)",
    color: "#0078D4",
    inputType: "cel",
  },
  api: { label: "API", color: "#00BFB3", inputType: "http_endpoint" },
  "event-hubs": { label: "Event Hubs", color: "#EA8600", inputType: "azure-eventhub" },
  "blob-storage": { label: "Blob archives", color: "#FBBC04", inputType: "logfile" },
  otel: { label: "OTel", color: "#93C90E", inputType: "opentelemetry" },
  "otel-edot-collector": { label: "EDOT Collector", color: "#93C90E", inputType: "opentelemetry" },
  "otel-csp-edot-gateway": {
    label: "Azure Monitor Distro → EDOT GW",
    color: "#FEC514",
    inputType: "opentelemetry",
  },
  agent: { label: "Elastic Agent", color: "#8144CC", inputType: "logfile" },
};

export { AZURE_SERVICE_INGESTION_DEFAULTS, AZURE_INGESTION_META };
