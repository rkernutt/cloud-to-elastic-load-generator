/**
 * GCP platform & infrastructure orchestration metric generators: Cloud Run Jobs,
 * Cloud Scheduler, Cloud Shell, TPU, Cloud Workstations, Batch, Deployment Manager,
 * Eventarc, Workflows, Firebase, Cloud Endpoints, API Gateway, Application Integration,
 * Serverless VPC Access, Service Directory, Private Service Connect, NCC, NIC,
 * Traffic Director, and audit logging metrics.
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
import { rand } from "../helpers.js";
import type { EcsDocument } from "../../../aws/generators/types.js";

const CR_JOB_NAMES = ["etl-nightly", "report-builder", "batch-validator", "ml-export-job"];
const SCHEDULER_JOBS = ["invoice-sync", "cache-refresh", "snapshots-daily", "drill-healthcheck"];
const BATCH_JOBS = ["array-render-prod", "genomics-variant", "data-prep-staging"];
const DM_DEPLOYMENTS = ["core-network-prod", "data-plane-v2", "logging-baseline"];
const EVENTARC_TRIGGERS = ["audit-to-run", "storage-pubsub-bridge", "firestore-workflow"];
const WORKFLOW_IDS = ["order-fulfillment", "onboarding-kyc", "incident-notify"];
const FIREBASE_SITES = ["globex-web", "partner-portal", "internal-docs"];
const APIGW_GATEWAYS = ["public-api-gw", "partner-b2b-gw", "mobile-edge-gw"];
const INTEGRATIONS = ["salesforce-sync", "jira-escalation", "slack-notify-flow"];
const VPC_CONNECTORS = ["serverless-egress", "private-sql-bridge", "redis-sidecar"];
const SVC_DIR_SERVICES = ["payments.internal", "catalog.internal", "auth.discovery"];
const NCC_HUBS = ["prod-mesh-hub", "partner-interconnect-hub"];

export function generateCloudRunJobsMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["cloud-run-jobs"]!;
  const job_name = rand(CR_JOB_NAMES);
  const stressed = Math.random() < er;
  const res = { project_id: project.id, location: region, job_name };
  const execs = randInt(stressed ? 8 : 40, stressed ? 2_800 : 9_800);
  const completed = randInt(stressed ? 2 : 120, stressed ? 48_000 : 220_000);
  return [
    gcpMetricDoc(ts, "cloud-run-jobs", dataset, region, project, {
      metricType: "run.googleapis.com/job/execution_count",
      resourceType: "cloud_run_job",
      resourceLabels: res,
      metricLabels: { result: stressed ? "failed" : "succeeded" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(execs) },
    }),
    gcpMetricDoc(ts, "cloud-run-jobs", dataset, region, project, {
      metricType: "run.googleapis.com/job/completed_task_attempt_count",
      resourceType: "cloud_run_job",
      resourceLabels: res,
      metricLabels: { result: stressed ? "failed" : "succeeded" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(completed) },
    }),
  ];
}

export function generateCloudSchedulerMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["cloud-scheduler"]!;
  const job_id = rand(SCHEDULER_JOBS);
  const stressed = Math.random() < er;
  const res = { project_id: project.id, location: region, job_id };
  const attempts = randInt(stressed ? 40 : 200, stressed ? 12_000 : 48_000);
  const latMs = stressed ? jitter(8_500, 4_200, 400, 120_000) : jitter(420, 180, 50, 9_000);
  const distN = randInt(40, 520);
  return [
    gcpMetricDoc(ts, "cloud-scheduler", dataset, region, project, {
      metricType: "cloudscheduler.googleapis.com/job/attempt_count",
      resourceType: "cloud_scheduler_job",
      resourceLabels: res,
      metricLabels: { response_code: stressed ? "4xx" : "success" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(attempts) },
    }),
    gcpMetricDoc(ts, "cloud-scheduler", dataset, region, project, {
      metricType: "cloudscheduler.googleapis.com/job/execution_latency",
      resourceType: "cloud_scheduler_job",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "DISTRIBUTION",
      point: distributionFromMs(latMs, distN, stressed),
    }),
  ];
}

export function generateCloudTpuMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["cloud-tpu"]!;
  const node_id = `tpu-node-${randInt(1, 99)}`;
  const accelerator_type = rand(["v5litepod-16", "v4-8", "v3-8"]);
  const stressed = Math.random() < er;
  const res = {
    project_id: project.id,
    zone: region,
    node_id,
    accelerator_type,
  };
  const duty = stressed ? jitter(0.92, 0.08, 0.55, 1) : jitter(0.38, 0.14, 0.02, 0.88);
  const memBytes = stressed ? jitter(62e9, 8e9, 40e9, 128e9) : jitter(18e9, 4e9, 4e9, 64e9);
  return [
    gcpMetricDoc(ts, "cloud-tpu", dataset, region, project, {
      metricType: "tpu.googleapis.com/accelerator/duty_cycle",
      resourceType: "cloud_tpu",
      resourceLabels: res,
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: { doubleValue: dp(duty) },
    }),
    gcpMetricDoc(ts, "cloud-tpu", dataset, region, project, {
      metricType: "tpu.googleapis.com/accelerator/memory_usage",
      resourceType: "cloud_tpu",
      resourceLabels: res,
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: { doubleValue: dp(memBytes) },
    }),
  ];
}

export function generateCloudWorkstationsMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["cloud-workstations"]!;
  const workstation_cluster_id = rand(["eng-primary", "data-science-pool", "sec-review"]);
  const workstation_id = rand([
    "ws-jchen",
    "ws-mwilliams",
    "ws-kpatel",
    "ws-ci-builder",
    "ws-agarcia",
  ]);
  const stressed = Math.random() < er;
  const res = {
    resource_container: project.id,
    location: region,
    workstation_cluster_id,
    workstation_id,
  };
  const active = randInt(stressed ? 0 : 2, stressed ? 85 : 320);
  const sessions = randInt(stressed ? 8 : 40, stressed ? 4_200 : 18_000);
  return [
    gcpMetricDoc(ts, "cloud-workstations", dataset, region, project, {
      metricType: "workstations.googleapis.com/workstation/active_count",
      resourceType: "workstations.googleapis.com/Workstation",
      resourceLabels: res,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(active) },
    }),
    gcpMetricDoc(ts, "cloud-workstations", dataset, region, project, {
      metricType: "workstations.googleapis.com/workstation/session_count",
      resourceType: "workstations.googleapis.com/Workstation",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(sessions) },
    }),
  ];
}

export function generateBatchMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP.batch!;
  const job_name = rand(BATCH_JOBS);
  const job_uid = `${job_name}-${randInt(1000, 9999)}`;
  const stressed = Math.random() < er;
  const res = {
    resource_container: project.id,
    location: region,
    job_name,
    job_uid,
  };
  const stateCount = randInt(stressed ? 12 : 2, stressed ? 900 : 220);
  const taskDurMs = stressed
    ? jitter(920_000, 380_000, 60_000, 7_200_000)
    : jitter(95_000, 52_000, 5_000, 1_800_000);
  const distN = randInt(30, 400);
  return [
    gcpMetricDoc(ts, "batch", dataset, region, project, {
      metricType: "batch.googleapis.com/job/state_count",
      resourceType: "batch.googleapis.com/Job",
      resourceLabels: res,
      metricLabels: { state: stressed ? "FAILED" : "SUCCEEDED" },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(stateCount) },
    }),
    gcpMetricDoc(ts, "batch", dataset, region, project, {
      metricType: "batch.googleapis.com/job/task_duration",
      resourceType: "batch.googleapis.com/Job",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "DISTRIBUTION",
      point: distributionFromMs(taskDurMs, distN, stressed),
    }),
  ];
}

export function generateDeploymentManagerMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["deployment-manager"]!;
  const deployment_name = rand(DM_DEPLOYMENTS);
  const stressed = Math.random() < er;
  const res = {
    project_id: project.id,
    deployment_name,
  };
  const depCount = randInt(stressed ? 6 : 14, stressed ? 120 : 85);
  const ops = randInt(stressed ? 40 : 120, stressed ? 9_000 : 4_200);
  return [
    gcpMetricDoc(ts, "deployment-manager", dataset, region, project, {
      metricType: "deploymentmanager.googleapis.com/deployment_count",
      resourceType: "deploymentmanager.googleapis.com/Deployment",
      resourceLabels: res,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(depCount) },
    }),
    gcpMetricDoc(ts, "deployment-manager", dataset, region, project, {
      metricType: "deploymentmanager.googleapis.com/operation_count",
      resourceType: "deploymentmanager.googleapis.com/Deployment",
      resourceLabels: res,
      metricLabels: { operation_type: stressed ? "delete" : "insert" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(ops) },
    }),
  ];
}

export function generateEventarcMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP.eventarc!;
  const trigger_id = rand(EVENTARC_TRIGGERS);
  const stressed = Math.random() < er;
  const res = {
    resource_container: project.id,
    location: region,
    trigger_id,
  };
  const events = randInt(stressed ? 400 : 2_000, stressed ? 2_800_000 : 1_200_000);
  const delMs = stressed ? jitter(2_400, 1_100, 120, 45_000) : jitter(180, 95, 8, 4_200);
  const distN = randInt(50, 600);
  return [
    gcpMetricDoc(ts, "eventarc", dataset, region, project, {
      metricType: "eventarc.googleapis.com/trigger/event_count",
      resourceType: "eventarc.googleapis.com/Trigger",
      resourceLabels: res,
      metricLabels: { response_code: stressed ? "unavailable" : "ok" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(events) },
    }),
    gcpMetricDoc(ts, "eventarc", dataset, region, project, {
      metricType: "eventarc.googleapis.com/trigger/delivery_latency",
      resourceType: "eventarc.googleapis.com/Trigger",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "DISTRIBUTION",
      point: distributionFromMs(delMs, distN, stressed),
    }),
  ];
}

export function generateWorkflowsMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP.workflows!;
  const workflow_id = rand(WORKFLOW_IDS);
  const stressed = Math.random() < er;
  const res = {
    project_id: project.id,
    location: region,
    workflow_id,
  };
  const execs = randInt(stressed ? 20 : 80, stressed ? 18_000 : 52_000);
  const durMs = stressed
    ? jitter(420_000, 180_000, 30_000, 3_600_000)
    : jitter(48_000, 28_000, 2_000, 420_000);
  const distN = randInt(35, 480);
  return [
    gcpMetricDoc(ts, "workflows", dataset, region, project, {
      metricType: "workflowexecutions.googleapis.com/execution_count",
      resourceType: "workflows.googleapis.com/Workflow",
      resourceLabels: res,
      metricLabels: { status: stressed ? "FAILED" : "SUCCEEDED" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(execs) },
    }),
    gcpMetricDoc(ts, "workflows", dataset, region, project, {
      metricType: "workflowexecutions.googleapis.com/execution_duration",
      resourceType: "workflows.googleapis.com/Workflow",
      resourceLabels: res,
      metricLabels: { status: stressed ? "FAILED" : "SUCCEEDED" },
      metricKind: "DELTA",
      valueType: "DISTRIBUTION",
      point: distributionFromMs(durMs, distN, stressed),
    }),
  ];
}

export function generateFirebaseMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP.firebase!;
  const site_id = rand(FIREBASE_SITES);
  const stressed = Math.random() < er;
  const hostingRes = {
    project_id: project.id,
    location: "global",
    site_id,
  };
  const hostingReq = randInt(stressed ? 800 : 4_000, stressed ? 12_000_000 : 48_000_000);
  const dbRes = {
    project_id: project.id,
    location: region,
    database_id: "default",
  };
  const dbReq = randInt(stressed ? 400 : 2_000, stressed ? 2_400_000 : 9_000_000);
  return [
    gcpMetricDoc(ts, "firebase", dataset, region, project, {
      metricType: "firebase.googleapis.com/hosting/request_count",
      resourceType: "firebase_domain",
      resourceLabels: hostingRes,
      metricLabels: { response_code: stressed ? "5xx" : "200" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(hostingReq) },
    }),
    gcpMetricDoc(ts, "firebase", dataset, region, project, {
      metricType: "firebase.googleapis.com/database/request_count",
      resourceType: "firebasedatabase.googleapis.com/Instance",
      resourceLabels: dbRes,
      metricLabels: { operation_type: rand(["read", "write", "connect"]) },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(dbReq) },
    }),
  ];
}

export function generateCloudEndpointsMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["cloud-endpoints"]!;
  const stressed = Math.random() < er;
  const service = `${rand(["globex", "partner", "internal"])}-api.endpoints.${project.id}.cloud.goog`;
  const res = {
    project_id: project.id,
    service,
    method: rand(["GET /v1/orders", "POST /v1/events", "GET /health"]),
  };
  const reqs = randInt(stressed ? 400 : 2_000, stressed ? 4_200_000 : 18_000_000);
  return [
    gcpMetricDoc(ts, "cloud-endpoints", dataset, region, project, {
      metricType: "serviceruntime.googleapis.com/api/request_count",
      resourceType: "consumed_api",
      resourceLabels: res,
      metricLabels: { response_code: stressed ? "503" : "200" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(reqs) },
    }),
  ];
}

export function generateApiGatewayMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["api-gateway"]!;
  const gateway_id = rand(APIGW_GATEWAYS);
  const stressed = Math.random() < er;
  const res = {
    resource_container: project.id,
    location: region,
    gateway_id,
  };
  const reqs = randInt(stressed ? 200 : 900, stressed ? 2_800_000 : 11_000_000);
  const latMs = stressed ? jitter(1_200, 520, 90, 25_000) : jitter(85, 48, 4, 2_400);
  const distN = randInt(60, 800);
  return [
    gcpMetricDoc(ts, "api-gateway", dataset, region, project, {
      metricType: "apigateway.googleapis.com/request_count",
      resourceType: "apigateway.googleapis.com/Gateway",
      resourceLabels: res,
      metricLabels: { response_code_class: stressed ? "5xx" : "2xx" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(reqs) },
    }),
    gcpMetricDoc(ts, "api-gateway", dataset, region, project, {
      metricType: "apigateway.googleapis.com/latency",
      resourceType: "apigateway.googleapis.com/Gateway",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "DISTRIBUTION",
      point: distributionFromMs(latMs, distN, stressed),
    }),
  ];
}

export function generateApplicationIntegrationMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["application-integration"]!;
  const integration = rand(INTEGRATIONS);
  const stressed = Math.random() < er;
  const res = {
    resource_container: project.id,
    location: region,
    integration,
  };
  const execs = randInt(stressed ? 20 : 80, stressed ? 8_800 : 42_000);
  const steps = randInt(stressed ? 240 : 900, stressed ? 180_000 : 620_000);
  return [
    gcpMetricDoc(ts, "application-integration", dataset, region, project, {
      metricType: "integrations.googleapis.com/execution_count",
      resourceType: "integrations.googleapis.com/Integration",
      resourceLabels: res,
      metricLabels: { status: stressed ? "ERROR" : "SUCCESS" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(execs) },
    }),
    gcpMetricDoc(ts, "application-integration", dataset, region, project, {
      metricType: "integrations.googleapis.com/step_count",
      resourceType: "integrations.googleapis.com/Integration",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(steps) },
    }),
  ];
}

export function generateServerlessVpcAccessMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["serverless-vpc-access"]!;
  const connector_id = rand(VPC_CONNECTORS);
  const stressed = Math.random() < er;
  const res = {
    project_id: project.id,
    location: region,
    connector_id,
  };
  const sent = randInt(stressed ? 80_000 : 400_000, stressed ? 920_000_000 : 4_200_000_000);
  const recv = randInt(stressed ? 120_000 : 620_000, stressed ? 1_100_000_000 : 5_800_000_000);
  return [
    gcpMetricDoc(ts, "serverless-vpc-access", dataset, region, project, {
      metricType: "vpcaccess.googleapis.com/connector/sent_bytes_count",
      resourceType: "vpcaccess.googleapis.com/Connector",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(sent) },
    }),
    gcpMetricDoc(ts, "serverless-vpc-access", dataset, region, project, {
      metricType: "vpcaccess.googleapis.com/connector/received_bytes_count",
      resourceType: "vpcaccess.googleapis.com/Connector",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(recv) },
    }),
  ];
}

export function generateServiceDirectoryMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["service-directory"]!;
  const namespace = rand(["prod-internal", "shared-services", "pci-scoped"]);
  const service_id = rand(SVC_DIR_SERVICES);
  const stressed = Math.random() < er;
  const res = {
    resource_container: project.id,
    location: region,
    namespace_name: namespace,
    service_name: service_id,
  };
  const regs = randInt(stressed ? 2 : 8, stressed ? 420 : 180);
  const resolves = randInt(stressed ? 400 : 2_000, stressed ? 8_800_000 : 42_000_000);
  return [
    gcpMetricDoc(ts, "service-directory", dataset, region, project, {
      metricType: "servicedirectory.googleapis.com/service/registration_count",
      resourceType: "servicedirectory.googleapis.com/Service",
      resourceLabels: res,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(regs) },
    }),
    gcpMetricDoc(ts, "service-directory", dataset, region, project, {
      metricType: "servicedirectory.googleapis.com/service/resolve_count",
      resourceType: "servicedirectory.googleapis.com/Service",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(resolves) },
    }),
  ];
}

export function generatePrivateServiceConnectMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["private-service-connect"]!;
  const stressed = Math.random() < er;
  const endpoint_id = rand(["psc-payments", "psc-analytics", "psc-partner-saas"]);
  const res = {
    resource_container: project.id,
    location: region,
    endpoint_id,
  };
  const conns = randInt(stressed ? 4 : 18, stressed ? 2_400 : 820);
  return [
    gcpMetricDoc(ts, "private-service-connect", dataset, region, project, {
      metricType: "privateca.googleapis.com/endpoint/connection_count",
      resourceType: "privateca.googleapis.com/CaPool",
      resourceLabels: { ...res, ca_pool_id: "psc-style-pool" },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(conns) },
    }),
  ];
}

export function generateNetworkConnectivityCenterMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["network-connectivity-center"]!;
  const hub_id = rand(NCC_HUBS);
  const stressed = Math.random() < er;
  const res = {
    resource_container: project.id,
    location: "global",
    hub_id,
  };
  const spokes = randInt(stressed ? 2 : 6, stressed ? 180 : 420);
  const bytes = randInt(
    stressed ? 80_000_000 : 400_000_000,
    stressed ? 48_000_000_000_000 : 22_000_000_000_000
  );
  return [
    gcpMetricDoc(ts, "network-connectivity-center", dataset, region, project, {
      metricType: "networkconnectivity.googleapis.com/hub/spoke_count",
      resourceType: "networkconnectivity.googleapis.com/Hub",
      resourceLabels: res,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(spokes) },
    }),
    gcpMetricDoc(ts, "network-connectivity-center", dataset, region, project, {
      metricType: "networkconnectivity.googleapis.com/hub/data_transfer_bytes",
      resourceType: "networkconnectivity.googleapis.com/Hub",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(bytes) },
    }),
  ];
}

export function generateNetworkIntelligenceCenterMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["network-intelligence-center"]!;
  const connectivity_test_id = rand(["path-to-saas", "vpc-peering-health", "hybrid-vpn-check"]);
  const stressed = Math.random() < er;
  const res = {
    resource_container: project.id,
    location: "global",
    connectivity_test_id,
  };
  const tests = randInt(stressed ? 20 : 80, stressed ? 4_200 : 18_000);
  return [
    gcpMetricDoc(ts, "network-intelligence-center", dataset, region, project, {
      metricType: "networkmanagement.googleapis.com/connectivity_test_count",
      resourceType: "networkmanagement.googleapis.com/ConnectivityTest",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(tests) },
    }),
  ];
}

export function generateTrafficDirectorMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["traffic-director"]!;
  const mesh_uid = rand(["mesh-prod-east", "mesh-partner", "mesh-staging"]);
  const stressed = Math.random() < er;
  const res = {
    project_id: project.id,
    location: region,
    mesh_uid,
  };
  const clients = randInt(stressed ? 40 : 200, stressed ? 48_000 : 220_000);
  const reqs = randInt(stressed ? 800 : 4_000, stressed ? 12_000_000 : 52_000_000);
  return [
    gcpMetricDoc(ts, "traffic-director", dataset, region, project, {
      metricType: "trafficdirector.googleapis.com/xds/connected_clients",
      resourceType: "trafficdirector.googleapis.com/Mesh",
      resourceLabels: res,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(clients) },
    }),
    gcpMetricDoc(ts, "traffic-director", dataset, region, project, {
      metricType: "trafficdirector.googleapis.com/request_count",
      resourceType: "trafficdirector.googleapis.com/Mesh",
      resourceLabels: res,
      metricLabels: { response_code_class: stressed ? "5xx" : "2xx" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(reqs) },
    }),
  ];
}

export function generateCloudAuditLogsMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["cloud-audit-logs"]!;
  const stressed = Math.random() < er;
  const proj = { project_id: project.id };
  const audits = randInt(stressed ? 8_000 : 40_000, stressed ? 22_000_000 : 9_000_000);
  const bytes = randInt(
    stressed ? 40_000_000 : 180_000_000,
    stressed ? 120_000_000_000_000 : 52_000_000_000_000
  );
  return [
    gcpMetricDoc(ts, "cloud-audit-logs", dataset, region, project, {
      metricType: "logging.googleapis.com/audit_log_count",
      resourceType: "project",
      resourceLabels: proj,
      metricLabels: { log_type: stressed ? "DATA_WRITE" : "ADMIN_READ" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(audits) },
    }),
    gcpMetricDoc(ts, "cloud-audit-logs", dataset, region, project, {
      metricType: "logging.googleapis.com/bytes_ingested",
      resourceType: "project",
      resourceLabels: proj,
      metricLabels: { log: "cloudaudit.googleapis.com/activity" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(bytes) },
    }),
  ];
}
