// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { PIPELINE_REGISTRY } from "../../installer/azure-custom-pipelines/pipelines/registry.mjs";
import type { CloudSetupBundle, DashboardDef, MlJobFile, PipelineEntry } from "./types";

const rawMlJobModules = import.meta.glob<{ default: MlJobFile }>(
  "../../installer/azure-custom-ml-jobs/jobs/*.json",
  { eager: true }
);

const rawDashboardModules = import.meta.glob<{ default: DashboardDef }>(
  "../../installer/azure-custom-dashboards/*-dashboard.json",
  { eager: true }
);

export const AZURE_SETUP_BUNDLE: CloudSetupBundle = {
  pipelines: PIPELINE_REGISTRY as PipelineEntry[],
  mlJobFiles: Object.values(rawMlJobModules).map((m) => m.default),
  dashboards: Object.values(rawDashboardModules).map((m) => m.default),
  fleetPackage: "azure",
  fleetPackageLabel: "Azure Integration",
  showApmToggle: true,
};
