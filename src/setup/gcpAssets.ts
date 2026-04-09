// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { PIPELINE_REGISTRY } from "../../installer/gcp-custom-pipelines/pipelines/registry.mjs";
import type { CloudSetupBundle, DashboardDef, MlJobFile, PipelineEntry } from "./types";
import { valuesFromEagerJsonGlob } from "./globJson";

const rawMlJobModules = import.meta.glob("../../installer/gcp-custom-ml-jobs/jobs/*.json", {
  eager: true,
}) as Record<string, unknown>;

const rawDashboardModules = import.meta.glob(
  "../../installer/gcp-custom-dashboards/*-dashboard.json",
  { eager: true }
) as Record<string, unknown>;

export const GCP_SETUP_BUNDLE: CloudSetupBundle = {
  pipelines: PIPELINE_REGISTRY as PipelineEntry[],
  mlJobFiles: valuesFromEagerJsonGlob<MlJobFile>(rawMlJobModules),
  dashboards: valuesFromEagerJsonGlob<DashboardDef>(rawDashboardModules),
  fleetPackage: "gcp",
  fleetPackageLabel: "GCP Integration",
  showApmToggle: true,
};
