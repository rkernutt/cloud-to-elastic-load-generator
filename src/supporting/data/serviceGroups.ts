import type { ServiceGroup } from "../../data/serviceGroups";

export const SUPPORTING_SERVICE_GROUPS: ServiceGroup[] = [
  {
    id: "identity",
    label: "Identity & Access",
    color: "#D94585",
    icon: "🔑",
    services: [
      {
        id: "entra-id",
        label: "Microsoft Entra ID",
        icon: "🔑",
        desc: "Directory audit & sign-in",
      },
      {
        id: "managed-ad",
        label: "Managed Active Directory",
        icon: "⊞",
        desc: "AD domain controller logs",
      },
    ],
  },
  {
    id: "productivity",
    label: "Productivity & Collaboration",
    color: "#0077D4",
    icon: "📧",
    services: [
      {
        id: "m365",
        label: "Microsoft 365 (unified audit)",
        icon: "📧",
        desc: "One stream — workload field separates Exchange, Teams, SharePoint, etc.",
      },
      {
        id: "active-users-services",
        label: "Active users by workload",
        icon: "👥",
        desc: "o365_metrics.active_users_services_user_counts",
      },
      {
        id: "teams-user-activity",
        label: "Teams user activity",
        icon: "💬",
        desc: "o365_metrics.teams_user_activity_user_counts",
      },
      {
        id: "outlook-activity",
        label: "Outlook activity",
        icon: "📬",
        desc: "o365_metrics.outlook_activity",
      },
      {
        id: "onedrive-usage-storage",
        label: "OneDrive usage & storage",
        icon: "☁️",
        desc: "o365_metrics.onedrive_usage_storage",
      },
    ],
  },
  {
    id: "itsm",
    label: "ITSM & Asset Management",
    color: "#54B399",
    icon: "⎈",
    services: [
      {
        id: "servicenow_cmdb",
        label: "ServiceNow CMDB",
        icon: "⎈",
        desc: "CMDB configuration items, incidents, change requests, users, and support groups for asset enrichment",
      },
    ],
  },
];

export const SUPPORTING_ALL_SERVICE_IDS = SUPPORTING_SERVICE_GROUPS.flatMap((g) =>
  g.services.map((s) => s.id)
);

export { type ServiceGroup };
