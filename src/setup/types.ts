export interface PipelineEntry {
  id: string;
  /** Present on generated Azure / M365 ingest pipeline entries */
  dataset?: string;
  group: string;
  description: string;
  processors: unknown[];
}

export interface MlJobEntry {
  id: string;
  description: string;
  job: Record<string, unknown>;
  datafeed: Record<string, unknown>;
}

export interface MlJobFile {
  group: string;
  description: string;
  jobs: MlJobEntry[];
}

export interface DashboardDef {
  title: string;
  id?: string;
  spaces?: string[];
  [key: string]: unknown;
}

export interface CloudSetupBundle {
  pipelines: PipelineEntry[];
  mlJobFiles: MlJobFile[];
  dashboards: DashboardDef[];
  fleetPackage: string;
  fleetPackageLabel: string;
  showApmToggle: boolean;
}
