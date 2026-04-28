export interface PipelineEntry {
  id: string;
  /** Present on generated Azure / M365 ingest pipeline entries */
  dataset?: string;
  group: string;
  description: string;
  processors: unknown[];
  on_failure?: unknown[];
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

export interface AlertRuleEntry {
  id: string;
  name: string;
  rule_type_id: string;
  consumer: string;
  schedule: { interval: string };
  tags: string[];
  enabled: boolean;
  params: Record<string, unknown>;
  actions: unknown[];
  notify_when: string;
}

export interface AlertRuleFile {
  group: string;
  description: string;
  rules: AlertRuleEntry[];
}

export interface CloudSetupBundle {
  pipelines: PipelineEntry[];
  mlJobFiles: MlJobFile[];
  dashboards: DashboardDef[];
  alertRuleFiles: AlertRuleFile[];
  fleetPackage: string;
  fleetPackageLabel: string;
  showApmToggle: boolean;
}
