export const SUPPORTING_INGESTION_DEFAULTS: Record<string, string> = {
  "entra-id": "entra",
  m365: "m365",
  "managed-ad": "api",
  "active-users-services": "o365-cel",
  "teams-user-activity": "o365-cel",
  "outlook-activity": "o365-cel",
  "onedrive-usage-storage": "o365-cel",
  servicenow_cmdb: "api",
  rubrik_webhook: "http_endpoint",
  rubrik_graphql: "cel_api",
  rubrik_syslog: "syslog_tcp",
};

export const SUPPORTING_INGESTION_META: Record<
  string,
  { label: string; color: string; inputType?: string }
> = {
  api: { label: "REST API", color: "#343741" },
  entra: { label: "MS Graph / Entra", color: "#0077D4" },
  m365: { label: "MS 365 Management API", color: "#D83B01" },
  "o365-cel": { label: "Office 365 CEL", color: "#0078D4" },
  http_endpoint: {
    label: "Custom HTTP Endpoint",
    color: "#F04E98",
    inputType: "http_endpoint",
  },
  cel_api: { label: "CEL Custom API", color: "#F04E98", inputType: "cel" },
  syslog_tcp: { label: "Custom TCP Syslog", color: "#F04E98", inputType: "tcp" },
};
