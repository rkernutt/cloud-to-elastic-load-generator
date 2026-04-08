// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { PIPELINE_REGISTRY } from "../../installer/gcp-custom-pipelines/pipelines/registry.mjs";
import type { CloudSetupBundle, DashboardDef, MlJobFile, PipelineEntry } from "./types";

const rawMlJobModules = import.meta.glob<{ default: MlJobFile }>(
  "../../installer/gcp-custom-ml-jobs/jobs/*.json",
  { eager: true }
);

const rawDashboardModules = import.meta.glob<{ default: DashboardDef }>(
  "../../installer/gcp-custom-dashboards/*-dashboard.json",
  { eager: true }
);

export const GCP_SETUP_BUNDLE: CloudSetupBundle = {
  pipelines: PIPELINE_REGISTRY as PipelineEntry[],
  mlJobFiles: Object.values(rawMlJobModules).map((m) => m.default),
  dashboards: Object.values(rawDashboardModules).map((m) => m.default),
  fleetPackage: "gcp",
  fleetPackageLabel: "GCP Integration",
  showApmToggle: true,
};
