// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — installer dir paths
import { PIPELINE_REGISTRY } from "../../installer/aws-custom-pipelines/pipelines/registry.mjs";
import type { CloudSetupBundle, DashboardDef, MlJobFile, PipelineEntry } from "./types";
import { valuesFromEagerJsonGlob } from "./globJson";

const rawMlJobModules = import.meta.glob("../../installer/aws-custom-ml-jobs/jobs/*.json", {
  eager: true,
}) as Record<string, unknown>;

const rawDashboardModules = import.meta.glob(
  "../../installer/aws-custom-dashboards/*-dashboard.json",
  { eager: true }
) as Record<string, unknown>;

export const AWS_SETUP_BUNDLE: CloudSetupBundle = {
  pipelines: PIPELINE_REGISTRY as PipelineEntry[],
  mlJobFiles: valuesFromEagerJsonGlob<MlJobFile>(rawMlJobModules),
  dashboards: valuesFromEagerJsonGlob<DashboardDef>(rawDashboardModules),
  fleetPackage: "aws",
  fleetPackageLabel: "AWS Integration",
  showApmToggle: true,
};
