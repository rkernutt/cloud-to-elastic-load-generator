import {
  GCP_ELASTIC_DATASET_MAP,
  GCP_METRICS_DATASET_MAP,
  GCP_METRICS_SUPPORTED_SERVICE_IDS,
} from "../gcp/data/elasticMaps";
import { GCP_SERVICE_INGESTION_DEFAULTS, GCP_INGESTION_META } from "../gcp/data/ingestion";
import { GCP_SERVICE_GROUPS, GCP_ALL_SERVICE_IDS } from "../gcp/data/serviceGroups";
import { GCP_TRACE_SERVICES } from "../gcp/generators/traces/services";
import { GCP_REGIONS } from "../gcp/generators/helpers.js";
import { GCP_SETUP_BUNDLE } from "../setup/gcpAssets";
import type { CloudAppConfig, TraceServiceMeta } from "./types";
import type { ServiceGroup } from "../data/serviceGroups";
import { genericVendorBulkIndex, genericVendorDocDataset } from "./indexNaming";
import { publicUrl } from "../utils/publicUrl";
import {
  GCP_VENDOR_CATEGORY_ICONS,
  GCP_VENDOR_FALLBACK,
  GCP_VENDOR_SERVICE_ICONS,
} from "./generated/vendorFileIcons";

const GCP_ICON_BASE = publicUrl("gcp-icons");

const gcpVendorServiceFiles = Object.fromEntries(
  GCP_ALL_SERVICE_IDS.map((id) => [id, GCP_VENDOR_SERVICE_ICONS[id] ?? GCP_VENDOR_FALLBACK])
);

const gcpVendorCategoryFiles = Object.fromEntries(
  GCP_SERVICE_GROUPS.map((g) => [g.id, GCP_VENDOR_CATEGORY_ICONS[g.id] ?? GCP_VENDOR_FALLBACK])
);

export const GCP_CONFIG: CloudAppConfig = {
  id: "gcp",
  htmlTitle: "GCP → Elastic Load Generator",
  branding: {
    headerLogoSrc: publicUrl("gcp-logo-header.svg"),
    headerLogoAlt: "Google Cloud",
  },
  lsKey: "gcpElasticConfig",
  defaultLogsIndexPrefix: "logs-gcp",
  defaultMetricsIndexPrefix: "metrics-gcp",
  defaultSelectedLogServices: ["cloud-functions", "cloud-run"],
  defaultSelectedTraceServices: ["cloud-functions", "gke"],
  serviceGroups: GCP_SERVICE_GROUPS as ServiceGroup[],
  allServiceIds: GCP_ALL_SERVICE_IDS,
  elasticDatasetMap: GCP_ELASTIC_DATASET_MAP as Record<string, string>,
  elasticMetricsDatasetMap: GCP_METRICS_DATASET_MAP,
  metricsSupportedServiceIds: GCP_METRICS_SUPPORTED_SERVICE_IDS,
  serviceIngestionDefaults: GCP_SERVICE_INGESTION_DEFAULTS,
  fallbackIngestionSource: "cloud-logging",
  ingestionMeta: GCP_INGESTION_META,
  ingestionOverrideOptions: [
    { id: "default", label: "Default" },
    ...Object.entries(GCP_INGESTION_META).map(([id, m]) => ({ id, label: m.label })),
  ],
  traceServices: GCP_TRACE_SERVICES as TraceServiceMeta[],
  loadLogGenerators: () => import("../gcp/generators").then((m) => m.GCP_GENERATORS),
  loadMetricsGenerators: () => import("../gcp/generators/metrics").then((m) => m.GCP_METRICS_GENERATORS),
  loadTraceGenerators: () => import("../gcp/generators/traces").then((m) => m.GCP_TRACE_GENERATORS),
  enrichContext: {
    kind: "gcp-azure",
    ctx: {
      cloudModule: "gcp",
      elasticDatasetMap: GCP_ELASTIC_DATASET_MAP as Record<string, string>,
      elasticMetricsDatasetMap: GCP_METRICS_DATASET_MAP,
      serviceIngestionDefaults: GCP_SERVICE_INGESTION_DEFAULTS,
      ingestionMeta: GCP_INGESTION_META as Record<string, { label: string; color: string; inputType?: string }>,
      regions: GCP_REGIONS,
      defaultIngestion: "cloud-logging",
    },
  },
  setupBundle: GCP_SETUP_BUNDLE,
  serviceIcons: {
    mode: "file-icons",
    serviceFiles: gcpVendorServiceFiles,
    categoryFiles: gcpVendorCategoryFiles,
    iconBaseUrl: GCP_ICON_BASE,
  },
  formatBulkIndexName: (prefix, dataset) => genericVendorBulkIndex(prefix, dataset, "gcp"),
  formatDocDatasetIndex: (prefix, ds) => genericVendorDocDataset(prefix, ds, "gcp"),
  fallbackDatasetForService: (serviceId: string) => `gcp.${serviceId.replace(/-/g, "")}`,
};
