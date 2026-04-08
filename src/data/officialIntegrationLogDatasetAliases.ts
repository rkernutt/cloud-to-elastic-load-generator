/**
 * Maps **synthetic** log `event.dataset` values (from ELASTIC_*_DATASET_MAP) to
 * **Fleet / elastic/integrations** log datasets when names differ but the load
 * generator is modeling the same telemetry family.
 *
 * Used by `scripts/generate-minimal-coverage-installer-assets.mjs` so we do not
 * emit redundant minimal dashboards or ML jobs where the official package
 * already ships a logs data stream.
 *
 * - Value is a single official dataset, or an array → treated as covered if
 *   **any** listed dataset exists as an official **logs** stream in the package.
 *
 * Sources: `elastic/integrations` package manifests + sample_event datasets
 * (`src/data/elasticOfficialIntegrationDatasets.json`).
 */

export const OFFICIAL_LOG_DATASET_ALIASES: Record<
  "aws" | "gcp" | "azure",
  Record<string, string | string[]>
> = {
  aws: {},

  gcp: {
    /** Load generator uses `gcp.loadbalancing`; Fleet stream is `gcp.loadbalancing_logs`. */
    "gcp.loadbalancing": "gcp.loadbalancing_logs",
  },

  azure: {
    /** Synthetic slug vs Fleet dataset naming */
    "azure.activity_log": "azure.activitylogs",
    "azure.firewall": "azure.firewall_logs",
    "azure.spring_apps": "azure.springcloudlogs",
    "azure.event_hubs": "azure.eventhub",

    /**
     * Single Entra simulator vs multiple Entra / Graph streams in the Azure package.
     * If any of these official streams exists, treat Entra-shaped synthetic logs as covered.
     */
    "azure.entra_id": [
      "azure.signinlogs",
      "azure.auditlogs",
      "azure.graphactivitylogs",
      "azure.identity_protection",
      "azure.provisioning",
    ],

    /** Subscription / control-plane style events — closest match is Activity Logs. */
    "azure.policy": "azure.activitylogs",

    /** Diagnostic / platform telemetry stream in Fleet. */
    "azure.monitor": "azure.platformlogs",

    /**
     * Microsoft 365 unified audit simulator → closest Fleet stream for Graph-style activity.
     * (Narrower than full M365 audit; still avoids a duplicate “minimal” asset.)
     */
    "azure.microsoft_365": "azure.graphactivitylogs",
  },
};

/**
 * True if `syntheticDataset` is exactly an official logs dataset, or aliases to one
 * (per OFFICIAL_LOG_DATASET_ALIASES) that appears in `officialLogDatasets`.
 */
export function isSyntheticDatasetCoveredByOfficialLogs(
  vendor: "aws" | "gcp" | "azure",
  syntheticDataset: string,
  officialLogDatasets: ReadonlySet<string>
): boolean {
  if (officialLogDatasets.has(syntheticDataset)) return true;
  const alias = OFFICIAL_LOG_DATASET_ALIASES[vendor][syntheticDataset];
  if (alias == null) return false;
  const candidates = Array.isArray(alias) ? alias : [alias];
  return candidates.some((d) => officialLogDatasets.has(d));
}
