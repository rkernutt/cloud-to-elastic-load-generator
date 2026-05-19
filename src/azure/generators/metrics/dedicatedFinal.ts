import {
  randInt,
  jitter,
  dp,
  stat,
  counter,
  azureMetricDoc,
  pickAzureContext,
  randId,
  rand,
} from "./helpers.js";
import type { EcsDocument } from "../../../aws/generators/types.js";
import type { AzureSubscription } from "../helpers.js";
import { AZURE_ELASTIC_DATASET_MAP, AZURE_METRICS_DATASET_MAP } from "../../data/elasticMaps.js";

function metricsDatasetFor(svcId: string): string {
  return (
    AZURE_METRICS_DATASET_MAP[svcId] ??
    AZURE_ELASTIC_DATASET_MAP[svcId] ??
    `azure.${svcId.replace(/-/g, "_")}_metrics`
  );
}

type Ctx = { region: string; subscription: AzureSubscription; resourceGroup: string };

function vmLikeMetrics(er: number): Record<string, Record<string, number>> {
  const stress = er * 40;
  return {
    "Percentage CPU": stat(dp(jitter(32 + stress, 28, 1, 100))),
    "Available Memory Bytes": stat(dp(jitter(5e9 - stress * 1.5e7, 1.5e9, 4e8, 16e9))),
    "Disk Read Bytes": counter(randInt(5_000_000, 12_000_000_000)),
    "Disk Write Bytes": counter(randInt(4_000_000, 8_000_000_000)),
    "Network In Total": counter(randInt(50_000_000, 4_000_000_000)),
    "Network Out Total": counter(randInt(40_000_000, 2_500_000_000)),
  };
}

function multiDoc(
  ts: string,
  er: number,
  ctx: Ctx,
  dataset: string,
  nestedKey: string,
  dimVals: string[],
  mk: (
    dimVal: string,
    i: number
  ) => {
    namespace: string;
    resourceName: string;
    armProviderSegments: string[];
    dimensions: Record<string, string>;
    metrics: Record<string, Record<string, number>>;
  }
): EcsDocument[] {
  const { region, subscription, resourceGroup } = ctx;
  const maxPerCall = Math.min(dimVals.length, Math.random() < er ? dimVals.length : 3);
  const n = Math.min(dimVals.length, randInt(1, Math.max(maxPerCall, 1)));
  return Array.from({ length: n }, (_, i) => {
    const dimVal = dimVals[i]!;
    const p = mk(dimVal, i);
    return azureMetricDoc(ts, nestedKey, dataset, region, subscription, resourceGroup, p);
  });
}

export function generateAcrDedicatedFinalMetrics(ts: string, er: number): EcsDocument[] {
  const ctx = pickAzureContext();
  const dataset = metricsDatasetFor("acr");
  const repos = ["payments-api", "web-spa", "batch-worker"];
  return multiDoc(ts, er, ctx, dataset, "acr", repos, (repo) => {
    const reg = `cr${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return {
      namespace: "Microsoft.ContainerRegistry/registries",
      resourceName: reg,
      armProviderSegments: ["Microsoft.ContainerRegistry", "registries", reg],
      dimensions: { Repository: repo, ImageTag: rand(["latest", "v1.4.2", "sha-abc"]) },
      metrics: {
        SuccessfulPullCount: counter(randInt(0, 800_000)),
        SuccessfulPushCount: counter(randInt(0, 40_000)),
        TotalPullCount: counter(randInt(0, 900_000)),
        StorageUsed: stat(dp(jitter(12e9 + (fail ? 2e9 : 0), 4e9, 1e8, 80e9))),
      },
    };
  });
}

export function generateDedicatedHostDedicatedFinalMetrics(ts: string, er: number): EcsDocument[] {
  const ctx = pickAzureContext();
  const dataset = metricsDatasetFor("dedicated-host");
  const hosts = ["host-0", "host-1", "host-2"];
  return multiDoc(ts, er, ctx, dataset, "dedicated_host", hosts, (h) => {
    const hg = `hg-${randId(4).toLowerCase()}`;
    return {
      namespace: "Microsoft.Compute/hostGroups",
      resourceName: hg,
      armProviderSegments: ["Microsoft.Compute", "hostGroups", hg, "hosts", h],
      dimensions: { hostGroup: hg, host: h },
      metrics: vmLikeMetrics(er),
    };
  });
}

export function generateCapacityReservationDedicatedFinalMetrics(
  ts: string,
  er: number
): EcsDocument[] {
  const ctx = pickAzureContext();
  const dataset = metricsDatasetFor("capacity-reservation");
  const crs = ["cr-general", "cr-compute", "cr-memory"];
  return multiDoc(ts, er, ctx, dataset, "capacity_reservation", crs, (cr) => {
    const crg = `crg-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return {
      namespace: "Microsoft.Compute/capacityReservations",
      resourceName: cr,
      armProviderSegments: [
        "Microsoft.Compute",
        "capacityReservationGroups",
        crg,
        "capacityReservations",
        cr,
      ],
      dimensions: { capacityReservationGroup: crg, capacityReservation: cr },
      metrics: {
        "Used vCPUs": stat(dp(jitter(48 + (fail ? 12 : 0), fail ? 32 : 20, 0, 512))),
        "Reserved vCPUs": stat(dp(jitter(64, 8, 1, 512))),
        "Utilization %": stat(dp(jitter(72 + (fail ? -18 : 0), fail ? 28 : 18, 0, 100))),
      },
    };
  });
}

export function generateProximityPlacementDedicatedFinalMetrics(
  ts: string,
  er: number
): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const dataset = metricsDatasetFor("proximity-placement");
  const ppg = `ppg-${randId(5).toLowerCase()}`;
  const load = er * 20;
  return [
    azureMetricDoc(ts, "proximity_placement", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Compute/proximityPlacementGroups",
      resourceName: ppg,
      armProviderSegments: ["Microsoft.Compute", "proximityPlacementGroups", ppg],
      dimensions: { proximityPlacementGroup: ppg },
      metrics: {
        "Standard SKU Family vCPUs": stat(dp(jitter(24 + load, 12, 0, 96))),
        "Standard D Family vCPUs": stat(dp(jitter(32 + load, 16, 0, 128))),
        "Standard E Family vCPUs": stat(dp(jitter(16 + load * 0.5, 10, 0, 64))),
      },
    }),
  ];
}

export function generateConfidentialVmDedicatedFinalMetrics(ts: string, er: number): EcsDocument[] {
  const ctx = pickAzureContext();
  const dataset = metricsDatasetFor("confidential-vm");
  const vms = ["cvm-web-01", "cvm-app-02", "cvm-batch-03"];
  return multiDoc(ts, er, ctx, dataset, "confidential_vm", vms, (vmName) => ({
    namespace: "Microsoft.Compute/virtualMachines",
    resourceName: vmName,
    armProviderSegments: ["Microsoft.Compute", "virtualMachines", vmName],
    dimensions: { VMName: vmName },
    metrics: vmLikeMetrics(er),
  }));
}

export function generateComputeGalleryDedicatedFinalMetrics(ts: string, er: number): EcsDocument[] {
  const ctx = pickAzureContext();
  const dataset = metricsDatasetFor("compute-gallery");
  const defs = ["img-win-2022", "img-ubuntu-2204", "img-aks-golden"];
  return multiDoc(ts, er, ctx, dataset, "compute_gallery", defs, (def) => {
    const gal = `gal-${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return {
      namespace: "Microsoft.Compute/galleries",
      resourceName: gal,
      armProviderSegments: ["Microsoft.Compute", "galleries", gal],
      dimensions: { GalleryImage: def, Version: rand(["1.0.0", "2024.04.1", "latest"]) },
      metrics: {
        ReplicationLagSeconds: stat(dp(jitter(fail ? 420 : 45, 40, 0, 3_600))),
        ImageVersionCount: stat(dp(jitter(12 + (fail ? -2 : 0), 4, 0, 256))),
        ReplicationCompletedCount: counter(randInt(50, fail ? 180_000 : 120_000)),
      },
    };
  });
}

export function generateImageBuilderDedicatedFinalMetrics(ts: string, er: number): EcsDocument[] {
  const ctx = pickAzureContext();
  const dataset = metricsDatasetFor("image-builder");
  const templates = ["tpl-web-golden", "tpl-db-baseline", "tpl-secure-hardened"];
  return multiDoc(ts, er, ctx, dataset, "image_builder", templates, (tpl) => {
    const name = `it-${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return {
      namespace: "Microsoft.VirtualMachineImages/imageTemplates",
      resourceName: name,
      armProviderSegments: ["Microsoft.VirtualMachineImages", "imageTemplates", name],
      dimensions: { Template: tpl, LastRunStatus: fail ? "Failed" : "Succeeded" },
      metrics: {
        BuildDurationSeconds: stat(dp(jitter(480 + (fail ? 900 : 0), 360, 60, 14_400))),
        ProvisioningErrorCount: counter(fail ? randInt(1, 12) : 0),
        OutputImageCount: counter(randInt(1, fail ? 3 : 8)),
        DiskUsageBytes: stat(dp(jitter(28e9, 12e9, 1e9, 200e9))),
      },
    };
  });
}

export function generatePipelineDedicatedFinalMetrics(ts: string, er: number): EcsDocument[] {
  const ctx = pickAzureContext();
  const dataset = metricsDatasetFor("pipeline");
  const pipelines = ["ci-api-main", "deploy-prod", "infra-terraform"];
  return multiDoc(ts, er, ctx, dataset, "devops_pipeline", pipelines, (pipe) => {
    const org = `ado-org-${randId(4).toLowerCase()}`;
    const proj = "platform-engineering";
    const fail = Math.random() < er;
    return {
      namespace: "Microsoft.CloudBuild/pipelines",
      resourceName: pipe,
      armProviderSegments: [
        "Microsoft.CloudBuild",
        "organizations",
        org,
        "projects",
        proj,
        "pipelines",
        pipe,
      ],
      dimensions: { PipelineName: pipe, Branch: rand(["main", "release/2.x", "develop"]) },
      metrics: {
        RunsSucceeded: counter(randInt(0, fail ? 800 : 1200)),
        RunsFailed: counter(fail ? randInt(1, 180) : randInt(0, 6)),
        QueueDurationSeconds: stat(dp(jitter(28 + (fail ? 400 : 0), 24, 0, 7_200))),
        TotalDurationSeconds: stat(dp(jitter(420 + (fail ? 1200 : 0), 300, 30, 28_800))),
      },
    };
  });
}
