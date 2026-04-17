/**
 * GCP compute metric generators: Compute Engine, GKE.
 */

import { GCP_METRICS_DATASET_MAP } from "../../data/elasticMaps.js";
import {
  randInt,
  jitter,
  dp,
  gcpMetricDoc,
  pickGcpCloudContext,
  toInt64String,
} from "./helpers.js";
import { randGceInstance, randGkeCluster, randGkeNamespace, randGkePod, rand } from "../helpers.js";
import type { EcsDocument } from "../../../aws/generators/types.js";

const ZONES = ["a", "b", "c"];

function gceInstanceMetrics(
  ts: string,
  er: number,
  region: string,
  project: ReturnType<typeof pickGcpCloudContext>["project"],
  dataset: string,
  inst: ReturnType<typeof randGceInstance>
): EcsDocument[] {
  const zone = `${region}-${rand(ZONES)}`;
  const res = {
    project_id: project.id,
    instance_id: inst.id,
    zone,
  };
  const extra = { instance_name: inst.name };
  const stressed = Math.random() < er;
  const cpu = stressed ? jitter(0.88, 0.06, 0.72, 1) : jitter(0.34, 0.2, 0.03, 0.94);
  const readB = randInt(stressed ? 8_000_000 : 0, stressed ? 120_000_000 : 80_000_000);
  const writeB = randInt(stressed ? 5_000_000 : 0, stressed ? 95_000_000 : 90_000_000);
  const rxB = randInt(50_000_000, stressed ? 520_000_000_000 : 420_000_000_000);
  const txB = randInt(30_000_000, stressed ? 310_000_000_000 : 280_000_000_000);

  return [
    gcpMetricDoc(ts, "compute-engine", dataset, region, project, {
      metricType: "compute.googleapis.com/instance/cpu/utilization",
      resourceType: "gce_instance",
      resourceLabels: res,
      extraServiceLabels: extra,
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: { doubleValue: dp(cpu) },
    }),
    gcpMetricDoc(ts, "compute-engine", dataset, region, project, {
      metricType: "compute.googleapis.com/instance/disk/read_bytes_count",
      resourceType: "gce_instance",
      resourceLabels: res,
      extraServiceLabels: extra,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(readB) },
    }),
    gcpMetricDoc(ts, "compute-engine", dataset, region, project, {
      metricType: "compute.googleapis.com/instance/disk/write_bytes_count",
      resourceType: "gce_instance",
      resourceLabels: res,
      extraServiceLabels: extra,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(writeB) },
    }),
    gcpMetricDoc(ts, "compute-engine", dataset, region, project, {
      metricType: "compute.googleapis.com/instance/network/received_bytes_count",
      resourceType: "gce_instance",
      resourceLabels: res,
      extraServiceLabels: extra,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(rxB) },
    }),
    gcpMetricDoc(ts, "compute-engine", dataset, region, project, {
      metricType: "compute.googleapis.com/instance/network/sent_bytes_count",
      resourceType: "gce_instance",
      resourceLabels: res,
      extraServiceLabels: extra,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(txB) },
    }),
  ];
}

export function generateComputeEngineMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["compute-engine"]!;
  const n = randInt(1, 2);
  return Array.from({ length: n }, () =>
    gceInstanceMetrics(ts, er, region, project, dataset, randGceInstance())
  ).flat();
}

export function generateGkeMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP.gke!;
  const cluster_name = randGkeCluster();
  const namespace = randGkeNamespace();
  const pod_name = randGkePod();
  const container_name = rand(["app", "nginx", "worker", "collector", "redis"]);
  const podStress = Math.random() < er;
  const location = region;

  const containerRes = {
    project_id: project.id,
    location,
    cluster_name,
    namespace_name: namespace,
    pod_name,
    container_name,
  };

  const podRes = {
    project_id: project.id,
    location,
    cluster_name,
    namespace_name: namespace,
    pod_name,
  };

  const nsRes = {
    project_id: project.id,
    location,
    cluster_name,
    namespace_name: namespace,
  };

  const cpuUtil = podStress ? jitter(0.92, 0.06, 0.55, 1.05) : jitter(0.38, 0.22, 0.04, 0.92);
  const memBytes = podStress ? jitter(1.85e9, 4e8, 6e8, 3.1e9) : jitter(6.5e8, 2.8e8, 1.2e8, 2.1e9);
  const rx = randInt(50_000_000, podStress ? 480_000_000_000 : 360_000_000_000);
  const coreUsage = jitter(podStress ? 18.5 : 4.2, podStress ? 6 : 2.5, 0.1, 120);

  return [
    gcpMetricDoc(ts, "gke", dataset, region, project, {
      metricType: "kubernetes.io/container/cpu/request_utilization",
      resourceType: "k8s_container",
      resourceLabels: containerRes,
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: { doubleValue: dp(cpuUtil) },
    }),
    gcpMetricDoc(ts, "gke", dataset, region, project, {
      metricType: "kubernetes.io/container/memory/used_bytes",
      resourceType: "k8s_container",
      resourceLabels: containerRes,
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: { doubleValue: dp(memBytes) },
    }),
    gcpMetricDoc(ts, "gke", dataset, region, project, {
      metricType: "kubernetes.io/pod/network/received_bytes_count",
      resourceType: "k8s_pod",
      resourceLabels: podRes,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(rx) },
    }),
    gcpMetricDoc(ts, "gke", dataset, region, project, {
      metricType: "kubernetes.io/container/cpu/core_usage_time",
      resourceType: "k8s_container",
      resourceLabels: containerRes,
      metricKind: "CUMULATIVE",
      valueType: "DOUBLE",
      point: { doubleValue: dp(coreUsage) },
    }),
    gcpMetricDoc(ts, "gke", dataset, region, project, {
      metricType: "kubernetes.io/namespace/pod_count",
      resourceType: "k8s_namespace",
      resourceLabels: nsRes,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(randInt(8, 400)) },
    }),
  ];
}
