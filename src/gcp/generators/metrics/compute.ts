/**
 * GCP compute metric generators: Compute Engine, GKE.
 */

import { GCP_METRICS_DATASET_MAP } from "../../data/elasticMaps.js";
import {
  randInt,
  jitter,
  dp,
  stat,
  counter,
  gcpMetricDoc,
  pickGcpCloudContext,
} from "./helpers.js";
import { randGceInstance, randGkeCluster, randGkeNamespace } from "../helpers.js";
import type { EcsDocument } from "../../../aws/generators/types.js";

export function generateComputeEngineMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["compute-engine"]!;
  const n = randInt(1, 3);
  return Array.from({ length: n }, () => {
    const { name } = randGceInstance();
    const cpu = Math.random() < er ? jitter(88, 8, 75, 100) : jitter(32, 22, 2, 95);
    return gcpMetricDoc(
      ts,
      "compute-engine",
      dataset,
      region,
      project,
      { instance_name: name },
      {
        cpu_utilization: stat(dp(cpu)),
        disk_read_bytes: counter(randInt(0, 60_000_000)),
        disk_write_bytes: counter(randInt(0, 90_000_000)),
        network_received_bytes: counter(randInt(5_000, 500_000_000)),
        network_sent_bytes: counter(randInt(3_000, 300_000_000)),
      }
    );
  });
}

export function generateGkeMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP.gke!;
  const n = randInt(1, 3);
  return Array.from({ length: n }, () => {
    const cluster_name = randGkeCluster();
    const namespace = randGkeNamespace();
    const podStress = Math.random() < er;
    return gcpMetricDoc(
      ts,
      "gke",
      dataset,
      region,
      project,
      { cluster_name, namespace },
      {
        container_cpu_usage: stat(
          dp(podStress ? jitter(0.85, 0.12, 0.5, 1.2) : jitter(0.35, 0.2, 0.05, 0.95))
        ),
        container_memory_usage: stat(
          dp(podStress ? jitter(1.8e9, 4e8, 5e8, 3e9) : jitter(6e8, 3e8, 1e8, 2e9))
        ),
        pod_count: counter(randInt(8, 400)),
        node_cpu_allocatable: stat(dp(jitter(32, 8, 4, 96))),
      }
    );
  });
}
