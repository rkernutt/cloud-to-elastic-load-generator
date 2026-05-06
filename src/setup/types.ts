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
  /**
   * Optional list of dashboard titles to link to this rule via Kibana's
   * `artifacts.dashboards` schema. The installer resolves each title to its
   * deterministic dashboard saved-object ID at install time and emits an
   * `artifacts: { dashboards: [{ id }] }` block on the POSTed rule, so the
   * Alert Details page surfaces these dashboards under a "Related dashboards"
   * tab whenever a rule fires. Unknown titles are skipped silently — useful
   * for clusters where the user opted out of installing some dashboards.
   *
   * Available from Kibana 8.19 / 9.1+; older Kibana versions ignore the field.
   * See https://github.com/elastic/kibana/pull/216292 for the schema.
   */
  relatedDashboards?: string[];
  /**
   * Markdown investigation guide shown on the rule's Details page in Kibana.
   * Sent as `artifacts.investigationGuide.blob` alongside `artifacts.dashboards`.
   * Available from Kibana 8.19 / 9.1+; older versions ignore the field.
   */
  investigationGuide?: string;
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
