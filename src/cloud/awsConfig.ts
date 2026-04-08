import {
  ELASTIC_DATASET_MAP,
  ELASTIC_METRICS_DATASET_MAP,
  METRICS_SUPPORTED_SERVICE_IDS,
} from "../data/elasticMaps";
import { SERVICE_INGESTION_DEFAULTS, INGESTION_META } from "../data/ingestion";
import { SERVICE_GROUPS, ALL_SERVICE_IDS, type ServiceGroup } from "../data/serviceGroups";
import { TRACE_SERVICES } from "../aws/generators/traces/services";
import { AWS_SETUP_BUNDLE } from "../setup/awsAssets";
import { CATEGORY_ICON_MAP, AWS_SERVICE_ICON_MAP } from "../data/iconMap";
import type { CloudAppConfig, TraceServiceMeta } from "./types";
import { awsBulkIndexName, awsDocDatasetIndex } from "./indexNaming";
import { publicUrl } from "../utils/publicUrl";

export const AWS_CONFIG: CloudAppConfig = {
  id: "aws",
  htmlTitle: "AWS → Elastic Load Generator",
  branding: {
    headerLogoSrc: publicUrl("icons/aws-on-dark.svg"),
    headerLogoAlt: "Amazon Web Services",
  },
  lsKey: "awsElasticConfig",
  defaultLogsIndexPrefix: "logs-aws",
  defaultMetricsIndexPrefix: "metrics-aws",
  defaultSelectedLogServices: ["lambda", "apigateway"],
  defaultSelectedTraceServices: ["lambda", "emr"],
  serviceGroups: SERVICE_GROUPS as ServiceGroup[],
  allServiceIds: ALL_SERVICE_IDS,
  elasticDatasetMap: ELASTIC_DATASET_MAP,
  elasticMetricsDatasetMap: ELASTIC_METRICS_DATASET_MAP,
  metricsSupportedServiceIds: METRICS_SUPPORTED_SERVICE_IDS,
  serviceIngestionDefaults: SERVICE_INGESTION_DEFAULTS,
  fallbackIngestionSource: "cloudwatch",
  ingestionMeta: INGESTION_META,
  ingestionOverrideOptions: [
    { id: "default", label: "Default" },
    { id: "s3", label: "S3" },
    { id: "cloudwatch", label: "CloudWatch" },
    { id: "firehose", label: "Firehose" },
    { id: "api", label: "API" },
    { id: "otel", label: "OTel" },
    { id: "otel-edot-collector", label: "EDOT Collector" },
    { id: "otel-csp-edot-gateway", label: "ADOT → EDOT GW" },
    { id: "agent", label: "Elastic Agent" },
  ],
  traceServices: TRACE_SERVICES as TraceServiceMeta[],
  loadLogGenerators: () => import("../aws/generators").then((m) => m.GENERATORS),
  loadMetricsGenerators: () =>
    import("../aws/generators/metrics").then((m) => m.METRICS_GENERATORS),
  loadTraceGenerators: () => import("../aws/generators/traces").then((m) => m.TRACE_GENERATORS),
  enrichContext: { kind: "aws" },
  setupBundle: AWS_SETUP_BUNDLE,
  serviceIcons: {
    mode: "file-icons",
    serviceFiles: AWS_SERVICE_ICON_MAP,
    categoryFiles: CATEGORY_ICON_MAP,
    iconBaseUrl: publicUrl("aws-icons"),
  },
  formatBulkIndexName: awsBulkIndexName,
  formatDocDatasetIndex: awsDocDatasetIndex,
  fallbackDatasetForService: (serviceId: string) => `aws.${serviceId}`,
};
