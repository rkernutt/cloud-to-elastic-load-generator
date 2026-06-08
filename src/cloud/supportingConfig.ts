import {
  SUPPORTING_ELASTIC_DATASET_MAP,
  SUPPORTING_METRICS_DATASET_MAP,
  SUPPORTING_METRICS_SUPPORTED_SERVICE_IDS,
} from "../supporting/data/elasticMaps";
import {
  SUPPORTING_INGESTION_DEFAULTS,
  SUPPORTING_INGESTION_META,
} from "../supporting/data/ingestion";
import {
  SUPPORTING_SERVICE_GROUPS,
  SUPPORTING_ALL_SERVICE_IDS,
} from "../supporting/data/serviceGroups";
import type { CloudAppConfig } from "./types";
import type { ServiceGroup } from "../data/serviceGroups";
import type { CloudSetupBundle } from "../setup/types";
import { o365MetricsBulkIndex } from "./indexNaming";
import { publicUrl } from "../utils/publicUrl";

const SUPPORTING_ICON_BASE = publicUrl("azure-icons");

const SUPPORTING_SETUP_BUNDLE: CloudSetupBundle = {
  pipelines: [],
  mlJobFiles: [],
  dashboards: [],
  alertRuleFiles: [],
  fleetPackage: "m365_defender",
  fleetPackageLabel: "Microsoft 365 Defender",
  showApmToggle: false,
};

export const SUPPORTING_CONFIG: CloudAppConfig = {
  id: "supporting",
  htmlTitle: "Supporting Services → Elastic Load Generator",
  branding: {
    headerLogoSrc: publicUrl("icons/supporting-vendor.svg"),
    headerLogoAlt: "Supporting Services",
  },
  lsKey: "supportingElasticConfig",
  defaultLogsIndexPrefix: "logs-supporting",
  defaultMetricsIndexPrefix: "metrics-supporting",
  defaultSelectedLogServices: ["entra-id", "servicenow_cmdb"],
  defaultSelectedTraceServices: [],
  serviceGroups: SUPPORTING_SERVICE_GROUPS as ServiceGroup[],
  allServiceIds: SUPPORTING_ALL_SERVICE_IDS,
  elasticDatasetMap: SUPPORTING_ELASTIC_DATASET_MAP,
  elasticMetricsDatasetMap: SUPPORTING_METRICS_DATASET_MAP,
  metricsSupportedServiceIds: SUPPORTING_METRICS_SUPPORTED_SERVICE_IDS,
  serviceIngestionDefaults: SUPPORTING_INGESTION_DEFAULTS,
  fallbackIngestionSource: "api",
  ingestionMeta: SUPPORTING_INGESTION_META,
  ingestionOverrideOptions: [
    { id: "default", label: "Default" },
    ...Object.entries(SUPPORTING_INGESTION_META).map(([id, m]) => ({ id, label: m.label })),
  ],
  traceServices: [],
  loadLogGenerators: () => import("../supporting/generators").then((m) => m.SUPPORTING_GENERATORS),
  loadMetricsGenerators: () =>
    import("../supporting/generators/metrics").then((m) => m.SUPPORTING_METRICS_GENERATORS),
  loadTraceGenerators: () => Promise.resolve({}),
  enrichContext: { kind: "supporting" },
  setupBundle: SUPPORTING_SETUP_BUNDLE,
  serviceIcons: {
    mode: "file-icons",
    serviceFiles: {},
    categoryFiles: {},
    iconBaseUrl: SUPPORTING_ICON_BASE,
  },
  formatBulkIndexName: (_prefix, dataset) => {
    if (dataset.startsWith("o365_metrics.")) return o365MetricsBulkIndex(dataset);
    if (dataset.startsWith("azure.") || dataset.startsWith("gcp.")) {
      const vendor = dataset.startsWith("azure.") ? "azure" : "gcp";
      const suffix = dataset.replace(new RegExp(`^${vendor}\\.`), "");
      return `logs-${vendor}.${suffix}-default`;
    }
    return `logs-${dataset}-default`;
  },
  formatDocDatasetIndex: (_prefix, ds) => {
    if (ds === "apm") return "traces-apm-default";
    return `logs-${ds}-default`;
  },
  fallbackDatasetForService: (serviceId: string) => `supporting.${serviceId.replace(/-/g, "_")}`,
};
