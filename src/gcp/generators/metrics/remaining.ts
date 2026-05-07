/**
 * Dedicated GCP Monitoring metric generators for services that previously
 * fell through to the generic template (access policy, Lite, Media CDN,
 * Vertex sub-products, VMware Engine, etc.).
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
import { rand, randGceInstance } from "../helpers.js";
import type { EcsDocument } from "../../../aws/generators/types.js";
import type { GcpProject } from "../helpers.js";

function consumedApiRequests(
  ts: string,
  svcKey: string,
  dataset: string,
  region: string,
  project: GcpProject,
  apiService: string,
  method: string,
  stressed: boolean
): EcsDocument {
  return gcpMetricDoc(ts, svcKey, dataset, region, project, {
    metricType: "serviceruntime.googleapis.com/api/request_count",
    resourceType: "consumed_api",
    resourceLabels: {
      project_id: project.id,
      service: apiService,
      method,
    },
    metricLabels: { response_code: stressed ? "UNAVAILABLE" : "OK" },
    metricKind: "DELTA",
    valueType: "INT64",
    point: {
      int64Value: toInt64String(randInt(stressed ? 80 : 400, stressed ? 42_000 : 220_000)),
    },
  });
}

export function generatePubsubLiteMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["pubsub-lite"]!;
  const zone = `${region}-${rand(["a", "b", "c"])}`;
  const topic_id = rand(["lite-audit", "lite-events", "lite-orders"]);
  const subscription_id = rand(["lite-worker", "lite-archive", "lite-dlq"]);
  const partition_id = String(randInt(0, 7));
  const stressed = Math.random() < er;
  const topicRes = { project_id: project.id, location: zone, topic_id, partition_id };
  const subRes = {
    project_id: project.id,
    location: zone,
    topic_id,
    subscription_id,
    partition_id,
  };
  const published = randInt(800, stressed ? 8_800_000 : 5_200_000);
  const backlog = stressed ? randInt(20_000, 4_200_000) : randInt(0, 120_000);
  const sent = randInt(600, stressed ? 7_200_000 : 4_800_000);
  const oldestSec = stressed ? randInt(120, 7200) : randInt(0, 85);

  return [
    gcpMetricDoc(ts, "pubsub-lite", dataset, region, project, {
      metricType: "pubsublite.googleapis.com/topic/publish_message_count",
      resourceType: "pubsublite_topic_partition",
      resourceLabels: topicRes,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(published) },
    }),
    gcpMetricDoc(ts, "pubsub-lite", dataset, region, project, {
      metricType: "pubsublite.googleapis.com/subscription/backlog_message_count",
      resourceType: "pubsublite_subscription_partition",
      resourceLabels: subRes,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(backlog) },
    }),
    gcpMetricDoc(ts, "pubsub-lite", dataset, region, project, {
      metricType: "pubsublite.googleapis.com/subscription/sent_message_count",
      resourceType: "pubsublite_subscription_partition",
      resourceLabels: subRes,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(sent) },
    }),
    gcpMetricDoc(ts, "pubsub-lite", dataset, region, project, {
      metricType: "pubsublite.googleapis.com/subscription/oldest_unacked_message_age",
      resourceType: "pubsublite_subscription_partition",
      resourceLabels: subRes,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(oldestSec) },
    }),
  ];
}

export function generatePersistentDiskMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["persistent-disk"]!;
  const inst = randGceInstance();
  const zone = `${region}-${rand(["a", "b", "c"])}`;
  const stressed = Math.random() < er;
  const res = { project_id: project.id, instance_id: inst.id, zone };
  const readOps = randInt(stressed ? 8_000 : 800, stressed ? 920_000 : 420_000);
  const writeOps = randInt(stressed ? 5_000 : 600, stressed ? 620_000 : 280_000);
  const provisioned = randInt(50_000_000_000, 4_500_000_000_000);
  return [
    gcpMetricDoc(ts, "persistent-disk", dataset, region, project, {
      metricType: "compute.googleapis.com/instance/disk/read_ops_count",
      resourceType: "gce_instance",
      resourceLabels: res,
      extraServiceLabels: { instance_name: inst.name },
      metricLabels: {
        device_name: "persistent-disk-0",
        storage_type: stressed ? "pd-ssd" : "pd-balanced",
        device_type: "permanent",
      },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(readOps) },
    }),
    gcpMetricDoc(ts, "persistent-disk", dataset, region, project, {
      metricType: "compute.googleapis.com/instance/disk/write_ops_count",
      resourceType: "gce_instance",
      resourceLabels: res,
      extraServiceLabels: { instance_name: inst.name },
      metricLabels: {
        device_name: "persistent-disk-0",
        storage_type: stressed ? "pd-ssd" : "pd-balanced",
        device_type: "permanent",
      },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(writeOps) },
    }),
    gcpMetricDoc(ts, "persistent-disk", dataset, region, project, {
      metricType: "compute.googleapis.com/instance/disk/provisioning/size",
      resourceType: "gce_instance",
      resourceLabels: res,
      extraServiceLabels: { instance_name: inst.name },
      metricLabels: {
        device_name: "persistent-disk-0",
        storage_type: "pd-balanced",
      },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(provisioned) },
    }),
  ];
}

export function generateFilestoreMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP.filestore!;
  const instance_name = rand(["nfs-prod", "sap-files", "hpc-scratch"]);
  const file_share = rand(["vol1", "sapdata", "scratch"]);
  const zone = `${region}-${rand(["a", "b", "c"])}`;
  const stressed = Math.random() < er;
  const res = { project_id: project.id, instance_name, location: zone };
  const free = stressed ? randInt(2e9, 8e9) : randInt(12e9, 42e9);
  const metaOps = randInt(400, stressed ? 420_000 : 180_000);
  const readLat = stressed ? jitter(22, 12, 2, 280) : jitter(2.8, 1.4, 0.2, 45);

  return [
    gcpMetricDoc(ts, "filestore", dataset, region, project, {
      metricType: "file.googleapis.com/nfs/server/free_bytes",
      resourceType: "filestore_instance",
      resourceLabels: res,
      metricLabels: { file_share },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(free) },
    }),
    gcpMetricDoc(ts, "filestore", dataset, region, project, {
      metricType: "file.googleapis.com/nfs/server/metadata_ops_count",
      resourceType: "filestore_instance",
      resourceLabels: res,
      metricLabels: { file_share },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(metaOps) },
    }),
    gcpMetricDoc(ts, "filestore", dataset, region, project, {
      metricType: "file.googleapis.com/nfs/server/average_read_latency",
      resourceType: "filestore_instance",
      resourceLabels: res,
      metricLabels: { file_share },
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: { doubleValue: dp(readLat) },
    }),
  ];
}

export function generateCloudBuildMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["cloud-build"]!;
  const stressed = Math.random() < er;
  const locRes = { resource_container: project.id, location: region };
  const cpuUsage = randInt(stressed ? 120 : 2, stressed ? 920 : 520);
  return [
    gcpMetricDoc(ts, "cloud-build", dataset, region, project, {
      metricType: "cloudbuild.googleapis.com/quota/concurrent_public_pool_build_cpus/usage",
      resourceType: "cloudbuild.googleapis.com/Location",
      resourceLabels: locRes,
      metricLabels: { limit_name: "default", build_origin: "CLOUD_CONSOLE" },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(cpuUsage) },
    }),
    consumedApiRequests(
      ts,
      "cloud-build",
      dataset,
      region,
      project,
      "cloudbuild.googleapis.com",
      "google.devtools.cloudbuild.v1.CloudBuild.CreateBuild",
      stressed
    ),
  ];
}

export function generateIotCoreMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["iot-core"]!;
  const device_registry_id = rand(["registry-main", "sensors-north", "partners-edge"]);
  const stressed = Math.random() < er;
  const res = { project_id: project.id, device_registry_id, location: region };
  const active = randInt(stressed ? 400 : 2_000, stressed ? 180_000 : 96_000);
  return [
    gcpMetricDoc(ts, "iot-core", dataset, region, project, {
      metricType: "cloudiot.googleapis.com/device/active_device_count",
      resourceType: "cloudiot_device_registry",
      resourceLabels: res,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(active) },
    }),
    consumedApiRequests(
      ts,
      "iot-core",
      dataset,
      region,
      project,
      "cloudiot.googleapis.com",
      "google.cloud.iot.v1.DeviceManager.ListDevices",
      stressed
    ),
  ];
}

export function generateGkeEnterpriseMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["gke-enterprise"]!;
  const cluster_name = rand(["fleet-analytics", "fleet-ml", "fleet-partners"]);
  const stressed = Math.random() < er;
  const clusterRes = { project_id: project.id, location: region, cluster_name };
  const nodeUsage = randInt(stressed ? 42 : 3, stressed ? 180 : 96);
  return [
    gcpMetricDoc(ts, "gke-enterprise", dataset, region, project, {
      metricType: "container.googleapis.com/quota/quota/nodes_per_cluster/usage",
      resourceType: "container.googleapis.com/Cluster",
      resourceLabels: clusterRes,
      metricLabels: { limit_name: "default" },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(nodeUsage) },
    }),
    consumedApiRequests(
      ts,
      "gke-enterprise",
      dataset,
      region,
      project,
      "gkehub.googleapis.com",
      "google.cloud.gkehub.v1.GkeHub.ListMemberships",
      stressed
    ),
  ];
}

export function generateAutomlMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP.automl!;
  const stressed = Math.random() < er;
  return [
    consumedApiRequests(
      ts,
      "automl",
      dataset,
      region,
      project,
      "automl.googleapis.com",
      "google.cloud.automl.v1.PredictionService.Predict",
      stressed
    ),
    consumedApiRequests(
      ts,
      "automl",
      dataset,
      region,
      project,
      "automl.googleapis.com",
      "google.cloud.automl.v1.AutoMl.CreateModel",
      stressed
    ),
  ];
}

export function generateAccessContextManagerMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["access-context-manager"]!;
  const stressed = Math.random() < er;
  return [
    consumedApiRequests(
      ts,
      "access-context-manager",
      dataset,
      region,
      project,
      "accesscontextmanager.googleapis.com",
      "google.identity.accesscontextmanager.v1.AccessContextManager.ListAccessPolicies",
      stressed
    ),
    consumedApiRequests(
      ts,
      "access-context-manager",
      dataset,
      region,
      project,
      "accesscontextmanager.googleapis.com",
      "google.identity.accesscontextmanager.v1.AccessContextManager.GetAccessLevel",
      stressed
    ),
  ];
}

export function generateActiveAssistMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["active-assist"]!;
  const stressed = Math.random() < er;
  return [
    consumedApiRequests(
      ts,
      "active-assist",
      dataset,
      region,
      project,
      "recommender.googleapis.com",
      "google.cloud.recommender.v1.Recommender.ListRecommendations",
      stressed
    ),
    consumedApiRequests(
      ts,
      "active-assist",
      dataset,
      region,
      project,
      "recommender.googleapis.com",
      "google.cloud.recommender.v1.Recommender.GetRecommendation",
      stressed
    ),
  ];
}

export function generateApigeeMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP.apigee!;
  const environment = rand(["prod", "staging", "dev-portal"]);
  const api_proxy = rand(["payments-api", "oauth2", "partner-catalog"]);
  const stressed = Math.random() < er;
  const res = {
    resource_container: project.id,
    location: region,
    environment,
    api_proxy,
  };
  const reqs = randInt(2000, stressed ? 12_000_000 : 6_200_000);
  const latMs = stressed ? jitter(380, 190, 24, 9000) : jitter(42, 22, 4, 820);
  const distN = randInt(200, 4800);
  return [
    gcpMetricDoc(ts, "apigee", dataset, region, project, {
      metricType: "apigee.googleapis.com/proxy/request_count",
      resourceType: "apigee.googleapis.com/Proxy",
      resourceLabels: res,
      metricLabels: { method: rand(["GET", "POST", "PUT"]) },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(reqs) },
    }),
    gcpMetricDoc(ts, "apigee", dataset, region, project, {
      metricType: "apigee.googleapis.com/proxy/latencies",
      resourceType: "apigee.googleapis.com/Proxy",
      resourceLabels: res,
      metricLabels: { method: "GET" },
      metricKind: "DELTA",
      valueType: "DISTRIBUTION",
      point: distributionFromMs(latMs, distN, stressed),
    }),
  ];
}

export function generateBackupDrMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["backup-dr"]!;
  const backup_vault_id = rand(["vault-prod-us", "vault-dr-eu", "vault-sql-1"]);
  const stressed = Math.random() < er;
  const res = { resource_container: project.id, location: region, backup_vault_id };
  const stored = randInt(8_000_000_000_000, stressed ? 920_000_000_000_000 : 480_000_000_000_000);
  return [
    gcpMetricDoc(ts, "backup-dr", dataset, region, project, {
      metricType: "backupdr.googleapis.com/storage/stored_bytes",
      resourceType: "backupdr.googleapis.com/BackupVault",
      resourceLabels: res,
      metricLabels: {
        resource_type: stressed ? "SQLInstance" : "GCPInstance",
        backup_schedule_type: "BackupPlan",
      },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(stored) },
    }),
    gcpMetricDoc(ts, "backup-dr", dataset, region, project, {
      metricType: "backupdr.googleapis.com/jobs/job_trend",
      resourceType: "backupdr.googleapis.com/ManagementConsole",
      resourceLabels: {
        resource_container: project.id,
        location: region,
        backup_recovery_appliance_name: rand(["appl-globex-1", "appl-dr-2"]),
      },
      metricLabels: {
        job_status: stressed ? "failed" : "successful",
        job_type: "Snapshot",
        resource_type: "GCPInstance",
      },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(randInt(stressed ? 2 : 0, stressed ? 42 : 18)) },
    }),
  ];
}

export function generateBareMetalMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["bare-metal"]!;
  const instance = rand(["bm-gpu-p9js", "bm-db-o2st", "bm-sap-01"]);
  const volume = rand(["vol-data", "vol-log", "vol-sap"]);
  const stressed = Math.random() < er;
  const volRes = {
    resource_container: project.id,
    location: region,
    instance,
    volume,
  };
  const bytes = randInt(stressed ? 8e8 : 2e9, stressed ? 28e11 : 12e11);
  const ops = randInt(stressed ? 4000 : 8000, stressed ? 820_000 : 420_000);
  return [
    gcpMetricDoc(ts, "bare-metal", dataset, region, project, {
      metricType: "baremetalsolution.googleapis.com/volume/size",
      resourceType: "baremetalsolution.googleapis.com/Volume",
      resourceLabels: volRes,
      metricLabels: { type: stressed ? "USED" : "AVAILABLE" },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(bytes) },
    }),
    gcpMetricDoc(ts, "bare-metal", dataset, region, project, {
      metricType: "baremetalsolution.googleapis.com/volume/operation_count",
      resourceType: "baremetalsolution.googleapis.com/Volume",
      resourceLabels: volRes,
      metricLabels: { direction: stressed ? "WRITE" : "READ" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(ops) },
    }),
  ];
}

export function generateBeyondcorpMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP.beyondcorp!;
  const stressed = Math.random() < er;
  return [
    consumedApiRequests(
      ts,
      "beyondcorp",
      dataset,
      region,
      project,
      "beyondcorp.googleapis.com",
      "google.cloud.beyondcorp.appconnectors.v1.AppConnectorsService.ListAppConnectors",
      stressed
    ),
    consumedApiRequests(
      ts,
      "beyondcorp",
      dataset,
      region,
      project,
      "beyondcorp.googleapis.com",
      "google.cloud.beyondcorp.appgateways.v1.AppGatewaysService.ListAppGateways",
      stressed
    ),
  ];
}

export function generateBillingMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP.billing!;
  const billing_account_id = rand(["01ABCD-01ABCD-01ABCD", "02EFGH-02EFGH-02EFGH"]);
  const stressed = Math.random() < er;
  const locRes = { resource_container: project.id, location: "global" };
  return [
    gcpMetricDoc(ts, "billing", dataset, region, project, {
      metricType: "billingbudgets.googleapis.com/quota/budget_count/usage",
      resourceType: "billingbudgets.googleapis.com/Location",
      resourceLabels: locRes,
      metricLabels: {
        limit_name: "default",
        billing_account_id,
      },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(randInt(stressed ? 8 : 2, stressed ? 42 : 24)) },
    }),
    consumedApiRequests(
      ts,
      "billing",
      dataset,
      region,
      project,
      "cloudbilling.googleapis.com",
      "google.cloud.billing.v1.CloudBilling.GetBillingAccount",
      stressed
    ),
  ];
}

export function generateCloudAssetInventoryMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["cloud-asset-inventory"]!;
  const stressed = Math.random() < er;
  return [
    consumedApiRequests(
      ts,
      "cloud-asset-inventory",
      dataset,
      region,
      project,
      "cloudasset.googleapis.com",
      "google.cloud.asset.v1.AssetService.BatchGetAssetsHistory",
      stressed
    ),
    consumedApiRequests(
      ts,
      "cloud-asset-inventory",
      dataset,
      region,
      project,
      "cloudasset.googleapis.com",
      "google.cloud.asset.v1.AssetService.SearchAllResources",
      stressed
    ),
  ];
}

export function generateCloudDomainsMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["cloud-domains"]!;
  const stressed = Math.random() < er;
  return [
    consumedApiRequests(
      ts,
      "cloud-domains",
      dataset,
      region,
      project,
      "domains.googleapis.com",
      "google.cloud.domains.v1.DomainsService.SearchDomains",
      stressed
    ),
    consumedApiRequests(
      ts,
      "cloud-domains",
      dataset,
      region,
      project,
      "domains.googleapis.com",
      "google.cloud.domains.v1.DomainsService.RetrieveRegisterParameters",
      stressed
    ),
  ];
}

export function generateMediaCdnMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["media-cdn"]!;
  const route_name = rand(["vod-manifests", "live-linear", "api-cache-edge"]);
  const stressed = Math.random() < er;
  const res = { resource_container: project.id, location: region, route_name };
  const reqs = randInt(8000, stressed ? 28_000_000 : 14_000_000);
  const bytes = randInt(120_000_000, stressed ? 22_000_000_000_000 : 12_000_000_000_000);
  const ttfbMs = stressed ? jitter(420, 180, 40, 9200) : jitter(38, 22, 4, 900);
  const distN = randInt(400, 9000);
  return [
    gcpMetricDoc(ts, "media-cdn", dataset, region, project, {
      metricType: "edgecache.googleapis.com/edge_cache_route_rule/request_count",
      resourceType: "edgecache.googleapis.com/EdgeCacheRouteRule",
      resourceLabels: res,
      metricLabels: {
        response_code_class: stressed ? "5xx" : "2xx",
        cache_result: stressed ? "MISS" : "HIT",
        protocol: "HTTP/2",
      },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(reqs) },
    }),
    gcpMetricDoc(ts, "media-cdn", dataset, region, project, {
      metricType: "edgecache.googleapis.com/edge_cache_route_rule/request_bytes_count",
      resourceType: "edgecache.googleapis.com/EdgeCacheRouteRule",
      resourceLabels: res,
      metricLabels: { protocol: "HTTP/2", cache_result: "HIT" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(bytes) },
    }),
    gcpMetricDoc(ts, "media-cdn", dataset, region, project, {
      metricType: "edgecache.googleapis.com/edge_cache_route_rule/http_ttfb",
      resourceType: "edgecache.googleapis.com/EdgeCacheRouteRule",
      resourceLabels: res,
      metricLabels: {
        response_code_class: "2xx",
        tls_version: "TLS 1.3",
        ip_protocol: "IPv4",
        cache_result: "HIT",
        protocol: "HTTP/2",
      },
      metricKind: "DELTA",
      valueType: "DISTRIBUTION",
      point: distributionFromMs(ttfbMs, distN, stressed),
    }),
  ];
}

export function generateTranscoderMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP.transcoder!;
  const stressed = Math.random() < er;
  return [
    consumedApiRequests(
      ts,
      "transcoder",
      dataset,
      region,
      project,
      "transcoder.googleapis.com",
      "google.cloud.video.transcoder.v1.TranscoderService.CreateJob",
      stressed
    ),
    consumedApiRequests(
      ts,
      "transcoder",
      dataset,
      region,
      project,
      "transcoder.googleapis.com",
      "google.cloud.video.transcoder.v1.TranscoderService.GetJob",
      stressed
    ),
  ];
}

export function generateVertexAiWorkbenchMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["vertex-ai-workbench"]!;
  const stressed = Math.random() < er;
  return [
    consumedApiRequests(
      ts,
      "vertex-ai-workbench",
      dataset,
      region,
      project,
      "notebooks.googleapis.com",
      "google.cloud.notebooks.v1.NotebookService.ListInstances",
      stressed
    ),
    consumedApiRequests(
      ts,
      "vertex-ai-workbench",
      dataset,
      region,
      project,
      "notebooks.googleapis.com",
      "google.cloud.notebooks.v1.NotebookService.StartInstance",
      stressed
    ),
  ];
}

export function generateVertexAiPipelinesMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["vertex-ai-pipelines"]!;
  const locRes = { resource_container: project.id, location: region };
  const pipeline_job_id = rand(["pipeline-train-01", "pipeline-batch-bq", "pipeline-deploy"]);
  const jobRes = { ...locRes, pipeline_job_id };
  const stressed = Math.random() < er;
  const running = randInt(stressed ? 4 : 0, stressed ? 22 : 12);
  const durSec = randInt(stressed ? 1800 : 120, stressed ? 14_400 : 3600);
  const tasks = randInt(stressed ? 8 : 40, stressed ? 420 : 280);
  return [
    gcpMetricDoc(ts, "vertex-ai-pipelines", dataset, region, project, {
      metricType: "aiplatform.googleapis.com/executing_vertexai_pipeline_jobs",
      resourceType: "aiplatform.googleapis.com/Location",
      resourceLabels: locRes,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(running) },
    }),
    gcpMetricDoc(ts, "vertex-ai-pipelines", dataset, region, project, {
      metricType: "aiplatform.googleapis.com/pipelinejob/duration",
      resourceType: "aiplatform.googleapis.com/PipelineJob",
      resourceLabels: jobRes,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(durSec) },
    }),
    gcpMetricDoc(ts, "vertex-ai-pipelines", dataset, region, project, {
      metricType: "aiplatform.googleapis.com/pipelinejob/task_completed_count",
      resourceType: "aiplatform.googleapis.com/PipelineJob",
      resourceLabels: jobRes,
      metricKind: "CUMULATIVE",
      valueType: "INT64",
      point: { int64Value: toInt64String(tasks) },
    }),
  ];
}

export function generateVertexAiFeatureStoreMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["vertex-ai-feature-store"]!;
  const featurestore_id = rand(["fs-prod", "fs-risk", "fs-partner"]);
  const entity_type_id = rand(["user", "account", "device"]);
  const stressed = Math.random() < er;
  const res = { resource_container: project.id, location: region, featurestore_id };
  const reqs = randInt(400, stressed ? 2_800_000 : 1_400_000);
  const latMs = stressed ? jitter(320, 140, 18, 6200) : jitter(28, 14, 2, 420);
  const distN = randInt(80, 2400);
  const stored = randInt(800_000_000, stressed ? 180_000_000_000_000 : 96_000_000_000_000);
  return [
    gcpMetricDoc(ts, "vertex-ai-feature-store", dataset, region, project, {
      metricType: "aiplatform.googleapis.com/featurestore/online_serving/request_count",
      resourceType: "aiplatform.googleapis.com/Featurestore",
      resourceLabels: res,
      metricLabels: {
        entity_type_id,
        method: "ReadFeatureValues",
        error_code: stressed ? "INTERNAL" : "OK",
      },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(reqs) },
    }),
    gcpMetricDoc(ts, "vertex-ai-feature-store", dataset, region, project, {
      metricType: "aiplatform.googleapis.com/featurestore/online_serving/latencies",
      resourceType: "aiplatform.googleapis.com/Featurestore",
      resourceLabels: res,
      metricLabels: { entity_type_id, method: "ReadFeatureValues" },
      metricKind: "DELTA",
      valueType: "DISTRIBUTION",
      point: distributionFromMs(latMs, distN, stressed),
    }),
    gcpMetricDoc(ts, "vertex-ai-feature-store", dataset, region, project, {
      metricType: "aiplatform.googleapis.com/featurestore/storage/stored_bytes",
      resourceType: "aiplatform.googleapis.com/Featurestore",
      resourceLabels: res,
      metricLabels: { storage_type: "ONLINE" },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(stored) },
    }),
  ];
}

export function generateVertexAiMatchingEngineMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["vertex-ai-matching-engine"]!;
  const index_endpoint_id = rand(["idx-embed-prod", "idx-similarity", "idx-products"]);
  const deployed_index_id = rand(["dep-idx-v2", "dep-idx-staging"]);
  const stressed = Math.random() < er;
  const res = { resource_container: project.id, location: region, index_endpoint_id };
  const reqs = randInt(200, stressed ? 1_800_000 : 920_000);
  const latMs = stressed ? jitter(95, 48, 8, 2400) : jitter(12, 8, 1, 180);
  const distN = randInt(60, 1800);
  const replicas = randInt(stressed ? 2 : 4, stressed ? 14 : 28);
  return [
    gcpMetricDoc(ts, "vertex-ai-matching-engine", dataset, region, project, {
      metricType: "aiplatform.googleapis.com/matching_engine/query/request_count",
      resourceType: "aiplatform.googleapis.com/IndexEndpoint",
      resourceLabels: res,
      metricLabels: {
        deployed_index_id,
        method: "findNeighbors",
        response_code: stressed ? "INTERNAL" : "OK",
        is_private_endpoint: "false",
        candidate_name: "default",
        index_type: "dense",
      },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(reqs) },
    }),
    gcpMetricDoc(ts, "vertex-ai-matching-engine", dataset, region, project, {
      metricType: "aiplatform.googleapis.com/matching_engine/query/latencies",
      resourceType: "aiplatform.googleapis.com/IndexEndpoint",
      resourceLabels: res,
      metricLabels: {
        deployed_index_id,
        method: "findNeighbors",
        response_code: "OK",
        index_type: "dense",
        candidate_name: "default",
      },
      metricKind: "DELTA",
      valueType: "DISTRIBUTION",
      point: distributionFromMs(latMs, distN, stressed),
    }),
    gcpMetricDoc(ts, "vertex-ai-matching-engine", dataset, region, project, {
      metricType: "aiplatform.googleapis.com/matching_engine/current_replicas",
      resourceType: "aiplatform.googleapis.com/IndexEndpoint",
      resourceLabels: res,
      metricLabels: { deployed_index_id },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(replicas) },
    }),
  ];
}

export function generateVertexAiTensorboardMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["vertex-ai-tensorboard"]!;
  const stressed = Math.random() < er;
  return [
    consumedApiRequests(
      ts,
      "vertex-ai-tensorboard",
      dataset,
      region,
      project,
      "aiplatform.googleapis.com",
      "google.cloud.aiplatform.v1.TensorboardService.ReadTensorboardTimeSeriesData",
      stressed
    ),
    consumedApiRequests(
      ts,
      "vertex-ai-tensorboard",
      dataset,
      region,
      project,
      "aiplatform.googleapis.com",
      "google.cloud.aiplatform.v1.TensorboardService.CreateTensorboardExperiment",
      stressed
    ),
  ];
}

export function generateVmwareEngineMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["vmware-engine"]!;
  const vmware_engine_network = rand(["vpc-vmw-prod", "net-dr-secondary"]);
  const stressed = Math.random() < er;
  const res = { resource_container: project.id, location: region, vmware_engine_network };
  const utilization = stressed ? jitter(82, 14, 40, 100) : jitter(38, 18, 8, 72);
  const mbps = stressed ? jitter(6200, 2200, 400, 18000) : jitter(820, 280, 80, 5200);
  return [
    gcpMetricDoc(ts, "vmware-engine", dataset, region, project, {
      metricType: "vmwareengine.googleapis.com/network/max_utilization_percentage",
      resourceType: "vmwareengine.googleapis.com/VmwareEngineNetwork",
      resourceLabels: res,
      metricLabels: {
        datacenter_zone: `${region}-a`,
        private_connection_name: "default-pc",
      },
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: { doubleValue: dp(utilization) },
    }),
    gcpMetricDoc(ts, "vmware-engine", dataset, region, project, {
      metricType: "vmwareengine.googleapis.com/network/utilization",
      resourceType: "vmwareengine.googleapis.com/VmwareEngineNetwork",
      resourceLabels: res,
      metricLabels: {
        datacenter_zone: `${region}-b`,
        private_connection_name: "default-pc",
      },
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: { doubleValue: dp(mbps) },
    }),
  ];
}
