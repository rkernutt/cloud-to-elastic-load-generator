/**
 * Dedicated metric generators for METRIC_MERGE_VARIANTS sub-service IDs.
 * Each uses native Cloud Monitoring metric types and monitored resources.
 */

import { GCP_METRICS_DATASET_MAP } from "../../data/elasticMaps.js";
import {
  randInt,
  jitter,
  dp,
  gcpMetricDoc,
  pickGcpCloudContext,
  toInt64String,
  distributionFromMs,
} from "./helpers.js";
import { rand, randGceInstance, randGkeCluster } from "../helpers.js";
import type { EcsDocument } from "../../../aws/generators/types.js";

const ZONES = ["a", "b", "c"];

function vpcZone(region: string): string {
  return `${region}-${ZONES[randInt(0, ZONES.length - 1)]!}`;
}

/* —— compute-engine merge variants —— */

export function generateSoleTenantNodesMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["compute-engine"]!;
  const zone = vpcZone(region);
  const node_group_id = rand(["sole-tenant-pci", "st-oracle-batch", "st-sap-ha"]);
  const res = {
    project_id: project.id,
    node_group_id,
    zone,
  };
  const stressed = Math.random() < er;
  const nodeName = rand(["st-node-aa", "st-node-ab", "st-node-ba"]);
  const groupName = rand(["ng-prod-fin", "ng-analytics", "ng-compliance"]);
  const nodes = randInt(stressed ? 2 : 4, stressed ? 12 : 22);
  const cpuUtilPct = stressed ? jitter(92, 6, 45, 100) : jitter(54, 18, 8, 88);
  const schedCpu = randInt(stressed ? 60 : 20, stressed ? 220 : 120);

  return [
    gcpMetricDoc(ts, "sole-tenant-nodes", dataset, region, project, {
      metricType: "compute.googleapis.com/node_group/nodes",
      resourceType: "gce_node_group",
      resourceLabels: res,
      metricLabels: {
        node_name: nodeName,
        node_group_name: groupName,
        status: stressed ? "unhealthy" : "healthy",
      },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(nodes) },
    }),
    gcpMetricDoc(ts, "sole-tenant-nodes", dataset, region, project, {
      metricType: "compute.googleapis.com/node_group/cpu/utilization",
      resourceType: "gce_node_group",
      resourceLabels: res,
      metricLabels: { node_name: nodeName, node_group_name: groupName },
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: { doubleValue: dp(cpuUtilPct) },
    }),
    gcpMetricDoc(ts, "sole-tenant-nodes", dataset, region, project, {
      metricType: "compute.googleapis.com/node_group/cpu/scheduled",
      resourceType: "gce_node_group",
      resourceLabels: res,
      metricLabels: { node_name: nodeName, node_group_name: groupName },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(schedCpu) },
    }),
  ];
}

export function generateSpotVmsMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["compute-engine"]!;
  const inst = randGceInstance();
  const zone = vpcZone(region);
  const res = { project_id: project.id, instance_id: inst.id, zone };
  const extra = { instance_name: inst.name };
  const interrupted = Math.random() < er;
  const uptimeDelta = interrupted ? jitter(45, 30, 0.5, 900) : jitter(58, 2, 52, 60);
  const cpuUtil = interrupted ? jitter(0.92, 0.08, 0.05, 1) : jitter(0.42, 0.25, 0.02, 0.94);
  const rx = randInt(400_000, interrupted ? 180_000_000_000 : 320_000_000_000);

  return [
    gcpMetricDoc(ts, "spot-vms", dataset, region, project, {
      metricType: "compute.googleapis.com/instance/uptime",
      resourceType: "gce_instance",
      resourceLabels: res,
      extraServiceLabels: extra,
      metricKind: "DELTA",
      valueType: "DOUBLE",
      point: { doubleValue: dp(uptimeDelta) },
    }),
    gcpMetricDoc(ts, "spot-vms", dataset, region, project, {
      metricType: "compute.googleapis.com/instance/cpu/utilization",
      resourceType: "gce_instance",
      resourceLabels: res,
      extraServiceLabels: extra,
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: { doubleValue: dp(cpuUtil) },
    }),
    gcpMetricDoc(ts, "spot-vms", dataset, region, project, {
      metricType: "compute.googleapis.com/instance/network/received_bytes_count",
      resourceType: "gce_instance",
      resourceLabels: res,
      extraServiceLabels: extra,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(rx) },
    }),
  ];
}

export function generateShieldedVmsMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["compute-engine"]!;
  const inst = randGceInstance();
  const zone = vpcZone(region);
  const res = { project_id: project.id, instance_id: inst.id, zone };
  const extra = { instance_name: inst.name };
  const failedIntegrity = Math.random() < er;

  return [
    gcpMetricDoc(ts, "shielded-vms", dataset, region, project, {
      metricType: "compute.googleapis.com/instance/integrity/early_boot_validation_status",
      resourceType: "gce_instance",
      resourceLabels: res,
      extraServiceLabels: extra,
      metricLabels: { status: failedIntegrity ? "failed" : "passed" },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(1) },
    }),
    gcpMetricDoc(ts, "shielded-vms", dataset, region, project, {
      metricType: "compute.googleapis.com/instance/integrity/late_boot_validation_status",
      resourceType: "gce_instance",
      resourceLabels: res,
      extraServiceLabels: extra,
      metricLabels: { status: failedIntegrity ? "unknown" : "passed" },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(1) },
    }),
    gcpMetricDoc(ts, "shielded-vms", dataset, region, project, {
      metricType: "compute.googleapis.com/instance/cpu/utilization",
      resourceType: "gce_instance",
      resourceLabels: res,
      extraServiceLabels: extra,
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: { doubleValue: dp(jitter(0.38, 0.2, 0.02, 0.9)) },
    }),
  ];
}

export function generateConfidentialComputingMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["compute-engine"]!;
  const inst = randGceInstance();
  const zone = vpcZone(region);
  const res = { project_id: project.id, instance_id: inst.id, zone };
  const extra = { instance_name: inst.name };
  const stressed = Math.random() < er;
  const cpu = stressed ? jitter(0.86, 0.08, 0.12, 1) : jitter(0.36, 0.18, 0.02, 0.85);
  const readB = randInt(stressed ? 6_000_000 : 0, stressed ? 95_000_000 : 72_000_000);
  const sentB = randInt(25_000_000, stressed ? 210_000_000_000 : 150_000_000_000);

  return [
    gcpMetricDoc(ts, "confidential-computing", dataset, region, project, {
      metricType: "compute.googleapis.com/instance/cpu/utilization",
      resourceType: "gce_instance",
      resourceLabels: res,
      extraServiceLabels: extra,
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: { doubleValue: dp(cpu) },
    }),
    gcpMetricDoc(ts, "confidential-computing", dataset, region, project, {
      metricType: "compute.googleapis.com/instance/disk/read_bytes_count",
      resourceType: "gce_instance",
      resourceLabels: res,
      extraServiceLabels: extra,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(readB) },
    }),
    gcpMetricDoc(ts, "confidential-computing", dataset, region, project, {
      metricType: "compute.googleapis.com/instance/network/sent_bytes_count",
      resourceType: "gce_instance",
      resourceLabels: res,
      extraServiceLabels: extra,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(sentB) },
    }),
  ];
}

export function generateMigrateToVmsMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["compute-engine"]!;
  const inst = randGceInstance();
  const zone = vpcZone(region);
  const gceRes = { project_id: project.id, instance_id: inst.id, zone };
  const extra = { instance_name: inst.name };
  const stressed = Math.random() < er;
  const apiReq = randInt(stressed ? 80 : 200, stressed ? 12_000 : 4_200);
  const readB = randInt(
    stressed ? 40_000_000 : 2_000_000,
    stressed ? 180_000_000_000 : 42_000_000_000
  );
  /* Control-plane API plus data-plane disk read while a cutover/staging VM hydrates. */
  return [
    gcpMetricDoc(ts, "migrate-to-vms", dataset, region, project, {
      metricType: "serviceruntime.googleapis.com/api/request_count",
      resourceType: "consumed_api",
      resourceLabels: {
        project_id: project.id,
        service: "vmmigration.googleapis.com",
        method: "/google.cloud.vmmigration.v1.VmMigrationService/GetMigratingVm",
        version: "v1",
        location: "global",
        credential_id: "",
      },
      metricLabels: {
        protocol: "grpc",
        response_code_class: stressed ? "4xx" : "2xx",
      },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(apiReq) },
    }),
    gcpMetricDoc(ts, "migrate-to-vms", dataset, region, project, {
      metricType: "compute.googleapis.com/instance/disk/read_bytes_count",
      resourceType: "gce_instance",
      resourceLabels: gceRes,
      extraServiceLabels: extra,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(readB) },
    }),
    gcpMetricDoc(ts, "migrate-to-vms", dataset, region, project, {
      metricType: "compute.googleapis.com/instance/network/received_bytes_count",
      resourceType: "gce_instance",
      resourceLabels: gceRes,
      extraServiceLabels: extra,
      metricKind: "DELTA",
      valueType: "INT64",
      point: {
        int64Value: toInt64String(randInt(8_000_000, stressed ? 120_000_000_000 : 82_000_000_000)),
      },
    }),
  ];
}

/* —— gke variant —— */

export function generateConfigConnectorMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP.gke!;
  const cluster_name = randGkeCluster();
  const container_name = "manager";
  const controller_ns = "cnrm-system";
  const pod_name = rand([
    "cnrm-controller-manager-0",
    "cnrm-resource-stats-recorder-xx",
    "cnrm-webhook-xx",
  ]);
  const ctlRes = {
    project_id: project.id,
    location: region,
    cluster_name,
    namespace_name: controller_ns,
    pod_name,
    container_name,
  };
  const stressed = Math.random() < er;

  return [
    gcpMetricDoc(ts, "config-connector", dataset, region, project, {
      metricType: "kubernetes.io/container/cpu/request_utilization",
      resourceType: "k8s_container",
      resourceLabels: ctlRes,
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: {
        doubleValue: dp(stressed ? jitter(0.94, 0.05, 0.52, 1.05) : jitter(0.41, 0.22, 0.04, 0.92)),
      },
    }),
    gcpMetricDoc(ts, "config-connector", dataset, region, project, {
      metricType: "kubernetes.io/container/memory/used_bytes",
      resourceType: "k8s_container",
      resourceLabels: ctlRes,
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: {
        doubleValue: dp(
          stressed ? jitter(1.4e9, 3e8, 5e8, 2.6e9) : jitter(6.8e8, 2e8, 1.8e8, 1.4e9)
        ),
      },
    }),
    gcpMetricDoc(ts, "config-connector", dataset, region, project, {
      metricType: "kubernetes.io/container/restart_count",
      resourceType: "k8s_container",
      resourceLabels: ctlRes,
      metricKind: "CUMULATIVE",
      valueType: "INT64",
      point: { int64Value: toInt64String(randInt(stressed ? 2 : 0, stressed ? 18 : 4)) },
    }),
  ];
}

/* —— vpc-flow variants —— */

export function generatePacketMirroringMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["vpc-flow"]!;
  const zone = vpcZone(region);
  const instance_id = String(randInt(1000_000_000, 9999_999_999));
  const res = { project_id: project.id, instance_id, zone };
  const stressed = Math.random() < er;

  const mirroredPackets = randInt(800_000, stressed ? 118_000_000 : 44_000_000);
  const mirroredBytes = randInt(90_000_000, stressed ? 210_000_000_000 : 94_000_000_000);
  const dropped = randInt(stressed ? 800 : 0, stressed ? 2_800_000 : 22_000);

  return [
    gcpMetricDoc(ts, "packet-mirroring", dataset, region, project, {
      metricType: "networking.googleapis.com/mirroring/mirrored_packets_count",
      resourceType: "gce_instance",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(mirroredPackets) },
    }),
    gcpMetricDoc(ts, "packet-mirroring", dataset, region, project, {
      metricType: "networking.googleapis.com/mirroring/mirrored_bytes_count",
      resourceType: "gce_instance",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(mirroredBytes) },
    }),
    gcpMetricDoc(ts, "packet-mirroring", dataset, region, project, {
      metricType: "networking.googleapis.com/mirroring/dropped_packets_count",
      resourceType: "gce_instance",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(dropped) },
    }),
  ];
}

export function generateNetworkServiceTiersMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["vpc-flow"]!;
  const stressed = Math.random() < er;
  const tier = stressed ? "STANDARD" : "PREMIUM";
  const locRes = {
    project_id: project.id,
    location: region,
  };
  const zone = vpcZone(region);
  const instance_id = String(randInt(1000_000_000, 9999_999_999));
  const instRes = { project_id: project.id, instance_id, zone };
  const net = rand(["default", "vpc-app", "vpc-data"]);
  const subnet = rand(["subnet-edge-01", "subnet-app-02"]);
  const nic = rand(["nic0", "ens4"]);
  const egress = randInt(12_000_000, stressed ? 95_000_000_000 : 48_000_000_000);

  const tierFlowLabels = {
    local_network: net,
    local_subnetwork: subnet,
    local_network_interface: nic,
    network_tier: tier,
    remote_continent: "America",
    remote_country: "US",
    remote_region: "NOT_APPLICABLE",
    remote_city: "NOT_APPLICABLE",
    remote_location_type: "EXTERNAL",
    protocol: "TCP",
  };
  const latMs = stressed ? jitter(180, 72, 24, 820) : jitter(48, 38, 8, 420);
  const distN = randInt(400, 9200);

  return [
    gcpMetricDoc(ts, "network-service-tiers", dataset, region, project, {
      metricType: "networking.googleapis.com/region/external_rtt",
      resourceType: "networking.googleapis.com/Location",
      resourceLabels: locRes,
      metricLabels: {
        network_tier: tier,
        remote_continent: "America",
        remote_country: "US",
        remote_region: "NOT_APPLICABLE",
        remote_city: "NOT_APPLICABLE",
        remote_location_type: "EXTERNAL",
        protocol: "TCP",
      },
      metricKind: "DELTA",
      valueType: "DISTRIBUTION",
      point: distributionFromMs(latMs, distN, stressed),
    }),
    gcpMetricDoc(ts, "network-service-tiers", dataset, region, project, {
      metricType: "networking.googleapis.com/vm_flow/external_rtt",
      resourceType: "gce_instance",
      resourceLabels: instRes,
      metricLabels: tierFlowLabels,
      metricKind: "DELTA",
      valueType: "DISTRIBUTION",
      point: distributionFromMs(latMs * 1.05, distN, stressed),
    }),
    gcpMetricDoc(ts, "network-service-tiers", dataset, region, project, {
      metricType: "networking.googleapis.com/vm_flow/egress_bytes_count",
      resourceType: "gce_instance",
      resourceLabels: instRes,
      metricLabels: {
        local_network: net,
        local_subnetwork: subnet,
        local_network_interface: nic,
        network_tier: tier,
        remote_country: "US",
        remote_continent: "America",
        remote_project_id: "REMOTE_IS_EXTERNAL",
        remote_zone: "",
        remote_location_type: "EXTERNAL",
        remote_network: "",
        remote_subnetwork: "",
        protocol: "TCP",
      },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(egress) },
    }),
  ];
}

/* —— cloud-lb variant —— */

export function generateServerlessNegMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["cloud-lb"]!;
  const backend_service_id = rand(["be-sneg-cr-public", "be-sneg-ae-api", "be-sneg-fn-webhook"]);
  const res = {
    project_id: project.id,
    backend_service_id,
    location: region,
  };
  const stressed = Math.random() < er;
  const req = randInt(1200, stressed ? 6_200_000 : 3_800_000);
  const beLatMs = stressed ? jitter(520, 260, 25, 9800) : jitter(78, 62, 6, 2100);
  const distN = randInt(380, 8400);
  const bytes = randInt(40_000_000, stressed ? 180_000_000_000 : 120_000_000_000);

  const commonMetricLabels = {
    protocol: "HTTP/2.0",
    response_code_class: stressed ? "500" : "200",
    response_code: stressed ? "500" : "200",
    cache_result: "UNKNOWN",
    matcher_type: "PATH_MATCHER",
    matcher_name: "default",
    backend_scope: rand(["zones/" + vpcZone(region), region]),
    backend_scope_type: "ZONE",
    backend_target_name: rand(["run-svc-cart", "ae-svc-catalog", "neg-cloudrun-batch"]),
    backend_target_type: "NETWORK_ENDPOINT_GROUP",
  };

  return [
    gcpMetricDoc(ts, "serverless-neg", dataset, region, project, {
      metricType: "loadbalancing.googleapis.com/https/backend_request_count",
      resourceType: "gce_backend_service",
      resourceLabels: res,
      metricLabels: commonMetricLabels,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(req) },
    }),
    gcpMetricDoc(ts, "serverless-neg", dataset, region, project, {
      metricType: "loadbalancing.googleapis.com/https/backend_latencies",
      resourceType: "gce_backend_service",
      resourceLabels: res,
      metricLabels: commonMetricLabels,
      metricKind: "DELTA",
      valueType: "DISTRIBUTION",
      point: distributionFromMs(beLatMs, distN, stressed),
    }),
    gcpMetricDoc(ts, "serverless-neg", dataset, region, project, {
      metricType: "loadbalancing.googleapis.com/https/backend_sent_bytes_count",
      resourceType: "gce_backend_service",
      resourceLabels: res,
      metricLabels: commonMetricLabels,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(bytes) },
    }),
  ];
}

/* —— cloud-storage variant —— */

export function generateStorageTransferMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["cloud-storage"]!;
  const job_id = rand([
    "transferJobs/s3tobq-991",
    "transferJobs/gcs-dr-snapshot",
    "transferJobs/azcopy-weekly",
  ]);
  const jobRes = { project_id: project.id, job_id };
  const agentRes = {
    project_id: project.id,
    agent_pool: rand(["agentPool/on-prem-datacenter-A", "agentPool/partner-colocation"]),
    agent_id: rand(["agent-7f2aad", "agent-19cc01", "agent-aa9012"]),
  };
  const stressed = Math.random() < er;

  return [
    gcpMetricDoc(ts, "storage-transfer", dataset, region, project, {
      metricType: "storagetransfer.googleapis.com/transferjob/found_bytes_count",
      resourceType: "storage_transfer_job",
      resourceLabels: jobRes,
      metricLabels: { origin: "source" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(randInt(stressed ? 2e8 : 4e8, stressed ? 2.2e12 : 9e11)) },
    }),
    gcpMetricDoc(ts, "storage-transfer", dataset, region, project, {
      metricType: "storagetransfer.googleapis.com/agent/transferred_bytes_count",
      resourceType: "transfer_service_agent",
      resourceLabels: agentRes,
      metricKind: "DELTA",
      valueType: "INT64",
      point: {
        int64Value: toInt64String(
          randInt(stressed ? 12_000_000 : 120_000_000, stressed ? 8e11 : 2.4e11)
        ),
      },
    }),
    gcpMetricDoc(ts, "storage-transfer", dataset, region, project, {
      metricType: "storagetransfer.googleapis.com/transferjob/copied_bytes_count",
      resourceType: "storage_transfer_job",
      resourceLabels: jobRes,
      metricLabels: { status: stressed ? "failed" : "succeeded" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: {
        int64Value: toInt64String(
          randInt(stressed ? 800_000 : 40_000_000, stressed ? 42_000_000_000 : 180_000_000_000)
        ),
      },
    }),
  ];
}

/* —— vertex-ai variant —— */

export function generateVertexAiSearchMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["vertex-ai"]!;
  const locRes = {
    resource_container: project.id,
    location: region,
  };
  const stressed = Math.random() < er;
  const searchReq = randInt(stressed ? 60 : 400, stressed ? 8_800 : 38_000);
  const datastoreCount = randInt(stressed ? 2 : 4, stressed ? 22 : 12);
  const engines = randInt(stressed ? 1 : 2, stressed ? 18 : 8);

  return [
    gcpMetricDoc(ts, "vertex-ai-search", dataset, region, project, {
      metricType: "discoveryengine.googleapis.com/search_requests_regional",
      resourceType: "discoveryengine.googleapis.com/Location",
      resourceLabels: locRes,
      metricLabels: { regional_location: region },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(searchReq) },
    }),
    gcpMetricDoc(ts, "vertex-ai-search", dataset, region, project, {
      metricType: "discoveryengine.googleapis.com/data_stores_regional",
      resourceType: "discoveryengine.googleapis.com/Location",
      resourceLabels: locRes,
      metricLabels: { regional_location: region },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(datastoreCount) },
    }),
    gcpMetricDoc(ts, "vertex-ai-search", dataset, region, project, {
      metricType: "discoveryengine.googleapis.com/engines_regional",
      resourceType: "discoveryengine.googleapis.com/Location",
      resourceLabels: locRes,
      metricLabels: { regional_location: region },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(engines) },
    }),
  ];
}

/* —— cloud-build variant —— */

export function generateSourceRepositoriesMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["cloud-build"]!;
  const noisy = Math.random() < er;
  const clones = randInt(noisy ? 40 : 200, noisy ? 12_000 : 4_800);

  return [
    gcpMetricDoc(ts, "source-repositories", dataset, region, project, {
      metricType: "serviceruntime.googleapis.com/api/request_count",
      resourceType: "consumed_api",
      resourceLabels: {
        project_id: project.id,
        service: "sourcerepo.googleapis.com",
        method: "/google.devtools.sourcerepo.v1.SourceRepo.FetchRepo",
        version: "v1",
        location: "global",
        credential_id: "",
      },
      metricLabels: {
        protocol: "grpc",
        response_code: noisy ? "7" : "0",
        response_code_class: noisy ? "4xx" : "2xx",
      },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(clones) },
    }),
    gcpMetricDoc(ts, "source-repositories", dataset, region, project, {
      metricType: "serviceruntime.googleapis.com/api/request_count",
      resourceType: "consumed_api",
      resourceLabels: {
        project_id: project.id,
        service: "sourcerepo.googleapis.com",
        method: "/google.devtools.source.v2.Source.FetchBlob",
        version: "v2",
        location: "global",
        credential_id: "",
      },
      metricLabels: {
        protocol: "grpc",
        response_code: "0",
        response_code_class: "2xx",
      },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(randInt(120, noisy ? 6_800 : 2_200)) },
    }),
  ];
}

/* —— cloud-monitoring variants —— */

export function generateCloudTraceMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["cloud-monitoring"]!;
  const globalRes = { project_id: project.id };
  const stressed = Math.random() < er;
  const ingest = randInt(stressed ? 40_000 : 120_000, stressed ? 2_600_000 : 920_000);
  const mtd = randInt(stressed ? 18_000_000 : 120_000_000, stressed ? 220_000_000 : 480_000_000);
  const exportOk = randInt(stressed ? 200 : 4_000, stressed ? 90_000 : 28_000);

  return [
    gcpMetricDoc(ts, "cloud-trace", dataset, region, project, {
      metricType: "cloudtrace.googleapis.com/billing/spans_ingested",
      resourceType: "global",
      resourceLabels: globalRes,
      metricLabels: {
        service: rand(["gke.io", "run.googleapis.com", "cloudfunctions.googleapis.com"]),
        chargeable: stressed ? "false" : "true",
      },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(ingest) },
    }),
    gcpMetricDoc(ts, "cloud-trace", dataset, region, project, {
      metricType: "cloudtrace.googleapis.com/billing/monthly_spans_ingested",
      resourceType: "global",
      resourceLabels: globalRes,
      metricLabels: {
        service: "gke.io",
        chargeable: "true",
      },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(mtd) },
    }),
    gcpMetricDoc(ts, "cloud-trace", dataset, region, project, {
      metricType: "cloudtrace.googleapis.com/bigquery_export/exported_span_count",
      resourceType: "cloudtrace.googleapis.com/CloudtraceProject",
      resourceLabels: { project_id: project.id },
      metricLabels: { status: stressed ? "WRITE_ERROR" : "OK" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(exportOk) },
    }),
  ];
}

export function generateCloudProfilerMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["cloud-monitoring"]!;
  const stressed = Math.random() < er;
  const createProfile = randInt(stressed ? 20 : 80, stressed ? 4_200 : 1_400);
  const listProfile = randInt(40, stressed ? 8_800 : 2_800);

  return [
    gcpMetricDoc(ts, "cloud-profiler", dataset, region, project, {
      metricType: "serviceruntime.googleapis.com/api/request_count",
      resourceType: "consumed_api",
      resourceLabels: {
        project_id: project.id,
        service: "cloudprofiler.googleapis.com",
        method: "/google.devtools.cloudprofiler.v2.ProfilerService/CreateProfile",
        version: "v2",
        location: "global",
        credential_id: "",
      },
      metricLabels: {
        protocol: "grpc",
        response_code_class: stressed ? "4xx" : "2xx",
      },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(createProfile) },
    }),
    gcpMetricDoc(ts, "cloud-profiler", dataset, region, project, {
      metricType: "serviceruntime.googleapis.com/api/request_count",
      resourceType: "consumed_api",
      resourceLabels: {
        project_id: project.id,
        service: "cloudprofiler.googleapis.com",
        method: "/google.devtools.cloudprofiler.v2.ProfilerService/ListProfiles",
        version: "v2",
        location: "global",
        credential_id: "",
      },
      metricLabels: {
        protocol: "grpc",
        response_code_class: "2xx",
      },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(listProfile) },
    }),
  ];
}

/* —— api-gateway variant —— */

export function generateApiHubMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["api-gateway"]!;
  const hubRes = {
    resource_container: project.id,
    location: region,
    gateway_type: rand(["API_GATEWAY_PROXY", "API_GATEWAY_HYBRID"]),
    gateway_id: rand(["apidp-prod-globex", "apidp-partner-b2b", "apidp-public-devportal"]),
    deployment_id: rand(["deploy-stable-042", "deploy-canary-018", "deploy-dr-905"]),
  };
  const stressed = Math.random() < er;

  return [
    gcpMetricDoc(ts, "api-hub", dataset, region, project, {
      metricType: "apigee.googleapis.com/apihub/security/score",
      resourceType: "apigee.googleapis.com/APIHubDeployment",
      resourceLabels: hubRes,
      metricLabels: {
        security_profile_id: stressed ? "weak-oauth-scope" : "pci-api-baseline-2026",
      },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(randInt(stressed ? 62 : 86, stressed ? 78 : 98)) },
    }),
    gcpMetricDoc(ts, "api-hub", dataset, region, project, {
      metricType: "serviceruntime.googleapis.com/api/request_count",
      resourceType: "consumed_api",
      resourceLabels: {
        project_id: project.id,
        service: "apihub.googleapis.com",
        method: "/google.cloud.apihub.v1.ApiHub/LookupApiHubInstance",
        version: "v1",
        location: "global",
        credential_id: "",
      },
      metricLabels: {
        protocol: "grpc",
        response_code_class: stressed ? "5xx" : "2xx",
      },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(randInt(stressed ? 120 : 400, stressed ? 8_200 : 3_600)) },
    }),
  ];
}
