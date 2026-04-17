// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { PIPELINE_REGISTRY } from "../../installer/azure-custom-pipelines/pipelines/registry.mjs";
import type {
  AlertRuleFile,
  CloudSetupBundle,
  DashboardDef,
  MlJobFile,
  PipelineEntry,
} from "./types";
import { valuesFromEagerJsonGlob } from "./globJson";

const rawMlJobModules = import.meta.glob("../../installer/azure-custom-ml-jobs/jobs/*.json", {
  eager: true,
}) as Record<string, unknown>;

const rawDashboardModules = import.meta.glob(
  "../../installer/azure-custom-dashboards/*-dashboard.json",
  { eager: true }
) as Record<string, unknown>;

const rawRuleModules = import.meta.glob("../../installer/azure-custom-rules/*.json", {
  eager: true,
}) as Record<string, unknown>;

export const AZURE_SETUP_BUNDLE: CloudSetupBundle = {
  pipelines: PIPELINE_REGISTRY as PipelineEntry[],
  mlJobFiles: valuesFromEagerJsonGlob<MlJobFile>(rawMlJobModules),
  dashboards: valuesFromEagerJsonGlob<DashboardDef>(rawDashboardModules),
  alertRuleFiles: valuesFromEagerJsonGlob<AlertRuleFile>(rawRuleModules),
  fleetPackage: "azure",
  fleetPackageLabel: "Azure Integration",
  showApmToggle: true,
};
