/**
 * Default ingestion source for synthetic Azure logs (conceptual — maps to Elastic Agent / Monitor paths).
 */

const AZURE_SERVICE_INGESTION_DEFAULTS: Record<string, string> = {
  monitor: "azure-monitor",
  "activity-log": "azure-monitor",
  "entra-id": "entra",
};

const AZURE_INGESTION_META: Record<string, { label: string; color: string; inputType: string }> = {
  "azure-monitor": { label: "Azure Monitor", color: "#0078D4", inputType: "azure-eventhub" },
  entra: { label: "Microsoft Entra ID", color: "#0078D4", inputType: "httpjson" },
  default: { label: "Azure platform logs", color: "#0078D4", inputType: "azure-eventhub" },
};

export { AZURE_SERVICE_INGESTION_DEFAULTS, AZURE_INGESTION_META };
