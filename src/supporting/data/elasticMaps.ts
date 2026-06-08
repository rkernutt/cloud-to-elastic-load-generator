export const SUPPORTING_ELASTIC_DATASET_MAP: Record<string, string> = {
  "entra-id": "azure.entra_id",
  m365: "microsoft_365.audit",
  "managed-ad": "gcp.managed_ad",
  "active-users-services": "o365_metrics.active_users_services_user_counts",
  "teams-user-activity": "o365_metrics.teams_user_activity_user_counts",
  "outlook-activity": "o365_metrics.outlook_activity",
  "onedrive-usage-storage": "o365_metrics.onedrive_usage_storage",
  servicenow_cmdb: "servicenow.event",
};

export const SUPPORTING_METRICS_DATASET_MAP: Record<string, string> = {
  "active-users-services": "o365_metrics.active_users_services_user_counts",
  "teams-user-activity": "o365_metrics.teams_user_activity_user_counts",
  "outlook-activity": "o365_metrics.outlook_activity",
  "onedrive-usage-storage": "o365_metrics.onedrive_usage_storage",
  "entra-id": "azure.entra_id_metrics",
  "managed-ad": "gcp.managed_ad_metrics",
};

export const SUPPORTING_METRICS_SUPPORTED_SERVICE_IDS = new Set([
  "active-users-services",
  "teams-user-activity",
  "outlook-activity",
  "onedrive-usage-storage",
  "entra-id",
  "managed-ad",
]);
