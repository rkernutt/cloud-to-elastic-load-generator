import {
  AZURE_ELASTIC_DATASET_MAP,
  AZURE_METRICS_DATASET_MAP,
  AZURE_METRICS_SUPPORTED_SERVICE_IDS,
} from "../azure/data/elasticMaps";
import { AZURE_SERVICE_INGESTION_DEFAULTS, AZURE_INGESTION_META } from "../azure/data/ingestion";
import { AZURE_SERVICE_GROUPS, AZURE_ALL_SERVICE_IDS } from "../azure/data/serviceGroups";
import { AZURE_TRACE_SERVICES } from "../azure/generators/traces/services.js";
import { AZURE_REGIONS } from "../azure/generators/helpers.js";
import { AZURE_SETUP_BUNDLE } from "../setup/azureAssets";
import type { CloudAppConfig, TraceServiceMeta } from "./types";
import type { ServiceGroup } from "../data/serviceGroups";
import { genericVendorBulkIndex, genericVendorDocDataset } from "./indexNaming";
import { publicUrl } from "../utils/publicUrl";
import {
  AZURE_VENDOR_CATEGORY_ICONS,
  AZURE_VENDOR_FALLBACK,
  AZURE_VENDOR_SERVICE_ICONS,
} from "./generated/vendorFileIcons";

const AZURE_ICON_BASE = publicUrl("azure-icons");

const azureVendorServiceFiles = Object.fromEntries(
  AZURE_ALL_SERVICE_IDS.map((id) => [id, AZURE_VENDOR_SERVICE_ICONS[id] ?? AZURE_VENDOR_FALLBACK])
);

const azureVendorCategoryFiles = Object.fromEntries(
  AZURE_SERVICE_GROUPS.map((g) => [
    g.id,
    AZURE_VENDOR_CATEGORY_ICONS[g.id] ?? AZURE_VENDOR_FALLBACK,
  ])
);

const AZURE_TRACE_UI: TraceServiceMeta[] = AZURE_TRACE_SERVICES.map((s) => ({
  id: s.id,
  label: s.label.includes(" — ") ? s.label.split(" — ")[0]! : s.label,
  desc: s.label,
  icon: "◇",
  group: "Scenarios",
}));

export const AZURE_CONFIG: CloudAppConfig = {
  id: "azure",
  htmlTitle: "Azure → Elastic Load Generator",
  branding: {
    headerLogoSrc: publicUrl("icons/azure-vendor.svg"),
    headerLogoAlt: "Microsoft Azure",
  },
  lsKey: "azureElasticConfig",
  defaultLogsIndexPrefix: "logs-azure",
  defaultMetricsIndexPrefix: "metrics-azure",
  defaultSelectedLogServices: ["app-service", "functions"],
  defaultSelectedTraceServices: ["functions", "aks"],
  serviceGroups: AZURE_SERVICE_GROUPS as ServiceGroup[],
  allServiceIds: AZURE_ALL_SERVICE_IDS,
  elasticDatasetMap: AZURE_ELASTIC_DATASET_MAP as Record<string, string>,
  elasticMetricsDatasetMap: AZURE_METRICS_DATASET_MAP,
  metricsSupportedServiceIds: AZURE_METRICS_SUPPORTED_SERVICE_IDS,
  serviceIngestionDefaults: AZURE_SERVICE_INGESTION_DEFAULTS,
  fallbackIngestionSource: "default",
  ingestionMeta: AZURE_INGESTION_META as Record<
    string,
    { label: string; color: string; inputType?: string }
  >,
  ingestionOverrideOptions: [
    { id: "default", label: "Default" },
    ...Object.entries(AZURE_INGESTION_META)
      .filter(([id]) => id !== "default")
      .map(([id, m]) => ({ id, label: m.label })),
  ],
  traceServices: AZURE_TRACE_UI,
  loadLogGenerators: () => import("../azure/generators").then((m) => m.AZURE_GENERATORS),
  loadMetricsGenerators: () =>
    import("../azure/generators/metrics").then((m) => m.AZURE_METRICS_GENERATORS),
  loadTraceGenerators: () =>
    import("../azure/generators/traces").then((m) => m.AZURE_TRACE_GENERATORS),
  enrichContext: {
    kind: "gcp-azure",
    ctx: {
      cloudModule: "azure",
      elasticDatasetMap: AZURE_ELASTIC_DATASET_MAP as Record<string, string>,
      elasticMetricsDatasetMap: AZURE_METRICS_DATASET_MAP,
      serviceIngestionDefaults: AZURE_SERVICE_INGESTION_DEFAULTS,
      ingestionMeta: AZURE_INGESTION_META as Record<
        string,
        { label: string; color: string; inputType?: string }
      >,
      regions: AZURE_REGIONS,
      defaultIngestion: "default",
    },
  },
  setupBundle: AZURE_SETUP_BUNDLE,
  serviceIcons: {
    mode: "file-icons",
    serviceFiles: azureVendorServiceFiles,
    categoryFiles: azureVendorCategoryFiles,
    iconBaseUrl: AZURE_ICON_BASE,
  },
  formatBulkIndexName: (prefix, dataset) => genericVendorBulkIndex(prefix, dataset, "azure"),
  formatDocDatasetIndex: (prefix, ds) => genericVendorDocDataset(prefix, ds, "azure"),
  fallbackDatasetForService: (serviceId: string) => `azure.${serviceId.replace(/-/g, "_")}`,
};
