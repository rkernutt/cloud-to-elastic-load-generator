import type { SimpleIcon } from "simple-icons";
import type { CloudEnrichContext } from "../helpers/enrichGcpAzure";
import type { ServiceGroup } from "../data/serviceGroups";
import type { CloudSetupBundle } from "../setup/types";

export type CloudId = "aws" | "gcp" | "azure";

export interface TraceServiceMeta {
  id: string;
  label: string;
  desc: string;
  icon: string;
  group: string;
}

export type ServiceIconMode =
  | {
      /** SVG/PNG: flat names under `public/aws-icons`, `public/gcp-icons`, `public/azure-icons`. */
      mode: "file-icons";
      serviceFiles: Record<string, string>;
      categoryFiles: Record<string, string>;
      iconBaseUrl: string;
    }
  | {
      mode: "simple-icon";
      getServiceIcon: (serviceId: string) => SimpleIcon;
      getCategoryIcon: (groupId: string) => SimpleIcon;
    };

export interface CloudAppConfig {
  id: CloudId;
  htmlTitle: string;
  branding: {
    headerLogoSrc: string;
    headerLogoAlt: string;
  };
  lsKey: string;
  defaultLogsIndexPrefix: string;
  defaultMetricsIndexPrefix: string;
  defaultSelectedLogServices: string[];
  defaultSelectedTraceServices: string[];
  serviceGroups: ServiceGroup[];
  allServiceIds: readonly string[];
  elasticDatasetMap: Record<string, string>;
  elasticMetricsDatasetMap: Record<string, string>;
  metricsSupportedServiceIds: Set<string>;
  serviceIngestionDefaults: Record<string, string>;
  /** When a service has no default in serviceIngestionDefaults (e.g. cloudwatch / cloud-logging / default). */
  fallbackIngestionSource: string;
  ingestionMeta: Record<string, { label: string; color: string; inputType?: string }>;
  /** Connection page “override ingestion” button group (includes Default first). */
  ingestionOverrideOptions: { id: string; label: string }[];
  traceServices: TraceServiceMeta[];
  loadLogGenerators: () => Promise<Record<string, (ts: string, er: number) => unknown | unknown[]>>;
  loadMetricsGenerators: () => Promise<
    Record<string, (ts: string, er: number) => unknown | unknown[]>
  >;
  loadTraceGenerators: () => Promise<
    Record<string, (ts: string, er: number) => Record<string, unknown>[]>
  >;
  enrichContext: CloudEnrichContext;
  setupBundle: CloudSetupBundle;
  serviceIcons: ServiceIconMode;
  formatBulkIndexName: (indexPrefix: string, dataset: string) => string;
  formatDocDatasetIndex: (indexPrefix: string, __dataset: string) => string;
  /** When service id is missing from elastic maps (should be rare). */
  fallbackDatasetForService: (serviceId: string) => string;
}
