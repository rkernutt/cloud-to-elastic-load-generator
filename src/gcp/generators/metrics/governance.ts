/**
 * GCP governance, DevOps, platform control plane, and related security metric generators:
 * Cloud Deploy, Logging, Monitoring, Cloud Identity, IAM, Org Policy, Resource Manager,
 * Essential Contacts, Error Reporting, Assured Workloads, container/artifact registries,
 * DLP, Anthos (fleet, Config Management, service mesh), Migrate to Containers,
 * Security Command Center, Chronicle / Security Operations, and Managed Microsoft AD.
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

const CD_PIPELINES = ["payments-release", "data-plane-rollout-analytics", "edge-services-canary"];
const LOG_SINKS = ["_Default", "audit-to-bq", "vpc-flows-gcs", "sec-central"];
const SA_IDS = ["web-backend-sa", "etl-worker", "deploy-bot", "partner-hook"];
const CONSTRAINTS = [
  "constraints/iam.allowedPolicyMemberDomains",
  "constraints/compute.vmExternalIpAccess",
];
const ERR_SERVICES = ["checkout-api", "ingest-worker", "reporting-ui"];
const WORKLOADS = ["pci-scope-eu", "fedramp-moderate", "hipaa-clinical"];
const GCR_REPOS = ["gcr.io/images/api", "gcr.io/images/batch-jobs"];
const AR_REPOS = ["globex-docker/api", "globex-docker/ml", "partner-scans/shared"];
const DLP_TEMPLATES = ["pii-scan-prod", "dlp-credit-cards", "dlp-phi"];
const MESH_SERVICES = ["checkout.checkout-ns", "orders.orders-ns", "payments.pay-ns"];
const SCC_SOURCES = ["Event Threat Detection", "Security Health Analytics", "Web Security Scanner"];

export function generateCloudDeployMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["cloud-deploy"]!;
  const pipeline_id = rand(CD_PIPELINES);
  const stressed = Math.random() < er;
  const res = { resource_container: project.id, location: region, pipeline_id };
  const releases = randInt(stressed ? 2 : 12, stressed ? 1_200 : 480);
  const rolloutMs = stressed
    ? jitter(900_000, 420_000, 120_000, 7_200_000)
    : jitter(120_000, 55_000, 8000, 1_800_000);
  const distN = randInt(25, 320);
  return [
    gcpMetricDoc(ts, "cloud-deploy", dataset, region, project, {
      metricType: "clouddeploy.googleapis.com/release_count",
      resourceType: "clouddeploy.googleapis.com/DeliveryPipeline",
      resourceLabels: res,
      metricLabels: { result: stressed ? "FAILED" : "SUCCEEDED" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(releases) },
    }),
    gcpMetricDoc(ts, "cloud-deploy", dataset, region, project, {
      metricType: "clouddeploy.googleapis.com/rollout_duration",
      resourceType: "clouddeploy.googleapis.com/DeliveryPipeline",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "DISTRIBUTION",
      point: distributionFromMs(rolloutMs, distN, stressed),
    }),
  ];
}

export function generateCloudLoggingMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["cloud-logging"]!;
  const sink_name = rand(LOG_SINKS);
  const stressed = Math.random() < er;
  const sinkRes = { project_id: project.id, sink_name };
  const proj = { project_id: project.id };
  const exportBytes = randInt(
    stressed ? 40_000_000 : 200_000_000,
    stressed ? 920_000_000_000 : 420_000_000_000
  );
  const entries = randInt(stressed ? 80_000 : 400_000, stressed ? 48_000_000 : 22_000_000);
  return [
    gcpMetricDoc(ts, "cloud-logging", dataset, region, project, {
      metricType: "logging.googleapis.com/exports/byte_count",
      resourceType: "logging.googleapis.com/LogSink",
      resourceLabels: sinkRes,
      metricLabels: { state: stressed ? "WRITE_FAILED" : "OK" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(exportBytes) },
    }),
    gcpMetricDoc(ts, "cloud-logging", dataset, region, project, {
      metricType: "logging.googleapis.com/log_entry_count",
      resourceType: "project",
      resourceLabels: proj,
      metricLabels: { log: stressed ? "stderr" : "application" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(entries) },
    }),
  ];
}

export function generateCloudMonitoringMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["cloud-monitoring"]!;
  const workspace_id = rand(["global", "ws-prod", "ws-security"]);
  const stressed = Math.random() < er;
  const wsRes = { project_id: project.id, workspace_id };
  const collBytes = randInt(
    stressed ? 200_000_000 : 1_200_000_000,
    stressed ? 42_000_000_000_000 : 18_000_000_000_000
  );
  const uptimeChecks = randInt(stressed ? 400 : 2_000, stressed ? 180_000 : 92_000);
  return [
    gcpMetricDoc(ts, "cloud-monitoring", dataset, region, project, {
      metricType: "monitoring.googleapis.com/collection/byte_count",
      resourceType: "monitoring.googleapis.com/Workspace",
      resourceLabels: wsRes,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(collBytes) },
    }),
    gcpMetricDoc(ts, "cloud-monitoring", dataset, region, project, {
      metricType: "monitoring.googleapis.com/uptime_check/check_count",
      resourceType: "uptime_url",
      resourceLabels: {
        project_id: project.id,
        host: rand(["api.globex.internal", "status.partner.io", "health.data-plane"]),
      },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(uptimeChecks) },
    }),
  ];
}

export function generateCloudIdentityMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["cloud-identity"]!;
  const customer_id = `C${randInt(10_000_000, 99_999_999)}`;
  const stressed = Math.random() < er;
  const res = { resource_container: project.id, customer_id };
  const users = randInt(stressed ? 40 : 800, stressed ? 48_000 : 22_000);
  const authn = randInt(stressed ? 8_000 : 40_000, stressed ? 2_800_000 : 1_200_000);
  return [
    gcpMetricDoc(ts, "cloud-identity", dataset, region, project, {
      metricType: "cloudidentity.googleapis.com/user_count",
      resourceType: "cloudidentity.googleapis.com/Customer",
      resourceLabels: res,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(users) },
    }),
    gcpMetricDoc(ts, "cloud-identity", dataset, region, project, {
      metricType: "cloudidentity.googleapis.com/authentication_count",
      resourceType: "cloudidentity.googleapis.com/Customer",
      resourceLabels: res,
      metricLabels: { method: stressed ? "FAILED_OAUTH" : "SAML_SSO" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(authn) },
    }),
  ];
}

function digits(len: number): string {
  return Array.from({ length: len }, () => String(randInt(0, 9))).join("");
}

export function generateIamMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP.iam!;
  const unique_id = digits(21);
  const account_id = rand(SA_IDS);
  const stressed = Math.random() < er;
  const res = { project_id: project.id, unique_id };
  const authCount = randInt(stressed ? 400 : 2_000, stressed ? 8_800_000 : 4_200_000);
  const keyAgeDays = stressed ? jitter(420, 180, 90, 730) : jitter(42, 28, 1, 120);
  return [
    gcpMetricDoc(ts, "iam", dataset, region, project, {
      metricType: "iam.googleapis.com/service_account/authentication_count",
      resourceType: "iam_service_account",
      resourceLabels: res,
      metricLabels: { account_id, response_code: stressed ? "PERMISSION_DENIED" : "OK" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(authCount) },
    }),
    gcpMetricDoc(ts, "iam", dataset, region, project, {
      metricType: "iam.googleapis.com/service_account/key_age",
      resourceType: "iam_service_account",
      resourceLabels: res,
      metricLabels: { account_id, key_id: `key-${randInt(1, 9)}` },
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: { doubleValue: dp(keyAgeDays) },
    }),
  ];
}

export function generateOrgPolicyMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["org-policy"]!;
  const constraint = rand(CONSTRAINTS);
  const stressed = Math.random() < er;
  const res = { project_id: project.id };
  const evals = randInt(stressed ? 8_000 : 40_000, stressed ? 2_200_000 : 980_000);
  return [
    gcpMetricDoc(ts, "org-policy", dataset, region, project, {
      metricType: "orgpolicy.googleapis.com/constraint/evaluation_count",
      resourceType: "project",
      resourceLabels: res,
      metricLabels: { constraint, result: stressed ? "VIOLATION" : "COMPLIANT" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(evals) },
    }),
  ];
}

export function generateResourceManagerMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["resource-manager"]!;
  const organization_id = `organizations/${randInt(100_000_000_000, 999_999_999_999)}`;
  const stressed = Math.random() < er;
  const orgRes = { organization_id };
  const projRes = { project_id: project.id };
  const projects = randInt(stressed ? 40 : 120, stressed ? 4_200 : 2_400);
  const ops = randInt(stressed ? 400 : 1_200, stressed ? 48_000 : 22_000);
  return [
    gcpMetricDoc(ts, "resource-manager", dataset, region, project, {
      metricType: "cloudresourcemanager.googleapis.com/project_count",
      resourceType: "cloudresourcemanager.googleapis.com/Organization",
      resourceLabels: orgRes,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(projects) },
    }),
    gcpMetricDoc(ts, "resource-manager", dataset, region, project, {
      metricType: "cloudresourcemanager.googleapis.com/operation_count",
      resourceType: "project",
      resourceLabels: projRes,
      metricLabels: { operation_type: stressed ? "DELETE_PROJECT" : "CREATE_PROJECT" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(ops) },
    }),
  ];
}

export function generateEssentialContactsMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["essential-contacts"]!;
  const contact = rand([
    "sec@globex.example",
    "platform@globex.example",
    "compliance@globex.example",
  ]);
  const stressed = Math.random() < er;
  const res = {
    resource_container: project.id,
    contact,
  };
  const notifications = randInt(stressed ? 20 : 80, stressed ? 4_200 : 1_800);
  return [
    gcpMetricDoc(ts, "essential-contacts", dataset, region, project, {
      metricType: "essentialcontacts.googleapis.com/notification_count",
      resourceType: "essentialcontacts.googleapis.com/Contact",
      resourceLabels: res,
      metricLabels: {
        category: stressed ? "LEGAL" : "SECURITY",
        result: stressed ? "FAILED" : "DELIVERED",
      },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(notifications) },
    }),
  ];
}

export function generateErrorReportingMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["error-reporting"]!;
  const serviceName = rand(ERR_SERVICES);
  const stressed = Math.random() < er;
  const proj = { project_id: project.id };
  const events = randInt(stressed ? 2_000 : 400, stressed ? 920_000 : 380_000);
  const groups = randInt(stressed ? 12 : 2, stressed ? 420 : 85);
  return [
    gcpMetricDoc(ts, "error-reporting", dataset, region, project, {
      metricType: "clouderrorreporting.googleapis.com/error/count",
      resourceType: "clouderrorreporting.googleapis.com/Project",
      resourceLabels: proj,
      metricLabels: { service_name: serviceName, response_code: stressed ? "500" : "200" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(events) },
    }),
    gcpMetricDoc(ts, "error-reporting", dataset, region, project, {
      metricType: "clouderrorreporting.googleapis.com/error/group_count",
      resourceType: "clouderrorreporting.googleapis.com/Project",
      resourceLabels: proj,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(groups) },
    }),
  ];
}

export function generateAssuredWorkloadsMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["assured-workloads"]!;
  const workload_id = rand(WORKLOADS);
  const stressed = Math.random() < er;
  const res = {
    resource_container: project.id,
    location: region,
    workload_id,
  };
  const violations = randInt(stressed ? 8 : 0, stressed ? 420 : 28);
  return [
    gcpMetricDoc(ts, "assured-workloads", dataset, region, project, {
      metricType: "assuredworkloads.googleapis.com/violation_count",
      resourceType: "assuredworkloads.googleapis.com/Workload",
      resourceLabels: res,
      metricLabels: { compliance_regime: stressed ? "PCI_DSS" : "FEDRAMP_MODERATE" },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(violations) },
    }),
  ];
}

export function generateContainerRegistryMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["container-registry"]!;
  const repository = rand(GCR_REPOS);
  const stressed = Math.random() < er;
  const res = { project_id: project.id, repository };
  const pulls = randInt(stressed ? 400 : 2_000, stressed ? 2_800_000 : 11_000_000);
  const pushes = randInt(stressed ? 40 : 200, stressed ? 180_000 : 82_000);
  return [
    gcpMetricDoc(ts, "container-registry", dataset, region, project, {
      metricType: "containerregistry.googleapis.com/pull_count",
      resourceType: "gcr.io/Repository",
      resourceLabels: res,
      metricLabels: { response_code: stressed ? "DENIED" : "OK" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(pulls) },
    }),
    gcpMetricDoc(ts, "container-registry", dataset, region, project, {
      metricType: "containerregistry.googleapis.com/push_count",
      resourceType: "gcr.io/Repository",
      resourceLabels: res,
      metricLabels: { response_code: stressed ? "QUOTA_EXCEEDED" : "OK" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(pushes) },
    }),
  ];
}

export function generateArtifactRegistryMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["artifact-registry"]!;
  const repository_id = rand(AR_REPOS);
  const stressed = Math.random() < er;
  const res = {
    resource_container: project.id,
    location: region,
    repository_id,
  };
  const reqs = randInt(stressed ? 800 : 4_000, stressed ? 8_800_000 : 42_000_000);
  const sizeBytes = randInt(stressed ? 8e9 : 40e9, stressed ? 420e12 : 180e12);
  return [
    gcpMetricDoc(ts, "artifact-registry", dataset, region, project, {
      metricType: "artifactregistry.googleapis.com/repository/request_count",
      resourceType: "artifactregistry.googleapis.com/Repository",
      resourceLabels: res,
      metricLabels: { response_code: stressed ? "RESOURCE_EXHAUSTED" : "OK" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(reqs) },
    }),
    gcpMetricDoc(ts, "artifact-registry", dataset, region, project, {
      metricType: "artifactregistry.googleapis.com/repository/size_bytes",
      resourceType: "artifactregistry.googleapis.com/Repository",
      resourceLabels: res,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(sizeBytes) },
    }),
  ];
}

export function generateDlpMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP.dlp!;
  const inspect_template_id = rand(DLP_TEMPLATES);
  const stressed = Math.random() < er;
  const res = {
    resource_container: project.id,
    location: region,
    inspect_template_id,
  };
  const findings = randInt(stressed ? 80 : 0, stressed ? 12_000 : 620);
  const inspected = randInt(stressed ? 2e9 : 8e9, stressed ? 480e12 : 120e12);
  return [
    gcpMetricDoc(ts, "dlp", dataset, region, project, {
      metricType: "dlp.googleapis.com/finding_count",
      resourceType: "dlp.googleapis.com/InspectTemplate",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(findings) },
    }),
    gcpMetricDoc(ts, "dlp", dataset, region, project, {
      metricType: "dlp.googleapis.com/bytes_inspected",
      resourceType: "dlp.googleapis.com/InspectTemplate",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(inspected) },
    }),
  ];
}

export function generateAnthosMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP.anthos!;
  const membership_id = rand(["globex-prod-east", "globex-dr-central", "partner-edge-1"]);
  const stressed = Math.random() < er;
  const res = { resource_container: project.id, location: region, membership_id };
  const clusters = randInt(stressed ? 2 : 8, stressed ? 180 : 92);
  const reconciles = randInt(stressed ? 400 : 2_000, stressed ? 180_000 : 82_000);
  return [
    gcpMetricDoc(ts, "anthos", dataset, region, project, {
      metricType: "anthos.googleapis.com/cluster_count",
      resourceType: "anthos.googleapis.com/Membership",
      resourceLabels: res,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(clusters) },
    }),
    gcpMetricDoc(ts, "anthos", dataset, region, project, {
      metricType: "anthos.googleapis.com/reconciliation_count",
      resourceType: "anthos.googleapis.com/Membership",
      resourceLabels: res,
      metricLabels: { result: stressed ? "ERROR" : "SYNCED" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(reconciles) },
    }),
  ];
}

export function generateAnthosConfigMgmtMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["anthos-config-mgmt"]!;
  const cluster_name = rand(["config-mgmt-prod", "policy-guardian", "fleet-sync-a"]);
  const stressed = Math.random() < er;
  const res = {
    resource_container: project.id,
    location: region,
    cluster_name,
  };
  const syncs = randInt(stressed ? 400 : 2_000, stressed ? 92_000 : 42_000);
  const errors = randInt(stressed ? 20 : 0, stressed ? 1_800 : 28);
  return [
    gcpMetricDoc(ts, "anthos-config-mgmt", dataset, region, project, {
      metricType: "configmanagement.googleapis.com/sync_count",
      resourceType: "anthosconfigmanagement.googleapis.com/Membership",
      resourceLabels: res,
      metricLabels: { status: stressed ? "ERROR" : "SYNCED" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(syncs) },
    }),
    gcpMetricDoc(ts, "anthos-config-mgmt", dataset, region, project, {
      metricType: "configmanagement.googleapis.com/error_count",
      resourceType: "anthosconfigmanagement.googleapis.com/Membership",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(errors) },
    }),
  ];
}

export function generateAnthosServiceMeshMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["anthos-service-mesh"]!;
  const canonical_service = rand(MESH_SERVICES);
  const mesh_uid = rand(["mesh-prod", "mesh-staging", "mesh-partner"]);
  const stressed = Math.random() < er;
  const res = {
    project_id: project.id,
    location: region,
    mesh_uid,
    canonical_service_name: canonical_service.split(".")[0]!,
    canonical_service_namespace: canonical_service.split(".")[1] ?? "default",
  };
  const reqs = randInt(stressed ? 800 : 4_000, stressed ? 12_000_000 : 52_000_000);
  const latMs = stressed ? jitter(420, 180, 48, 9_000) : jitter(28, 14, 2, 420);
  const distN = randInt(80, 900);
  return [
    gcpMetricDoc(ts, "anthos-service-mesh", dataset, region, project, {
      metricType: "istio.io/service/server/request_count",
      resourceType: "istio_canonical_service",
      resourceLabels: res,
      metricLabels: { response_code: stressed ? "503" : "200" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(reqs) },
    }),
    gcpMetricDoc(ts, "anthos-service-mesh", dataset, region, project, {
      metricType: "istio.io/service/server/latency",
      resourceType: "istio_canonical_service",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "DISTRIBUTION",
      point: distributionFromMs(latMs, distN, stressed),
    }),
  ];
}

export function generateMigrateToContainersMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["migrate-to-containers"]!;
  const migration_job = rand(["m2c-web-tier-01", "m2c-batch-jobs-02", "m2c-mysql-workloads"]);
  const stressed = Math.random() < er;
  const res = {
    resource_container: project.id,
    location: region,
    migration_job_name: migration_job,
  };
  const migrations = randInt(stressed ? 2 : 8, stressed ? 420 : 180);
  return [
    gcpMetricDoc(ts, "migrate-to-containers", dataset, region, project, {
      metricType: "migrate.googleapis.com/container/migration_count",
      resourceType: "migrate.googleapis.com/MigrationJob",
      resourceLabels: res,
      metricLabels: { phase: stressed ? "FAILED" : "RUNNING" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(migrations) },
    }),
  ];
}

export function generateSecurityCommandCenterMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["security-command-center"]!;
  const source = rand(SCC_SOURCES);
  const stressed = Math.random() < er;
  const proj = { project_id: project.id };
  const findings = randInt(stressed ? 120 : 0, stressed ? 8_200 : 1_800);
  const sources = randInt(stressed ? 4 : 8, stressed ? 42 : 18);
  return [
    gcpMetricDoc(ts, "security-command-center", dataset, region, project, {
      metricType: "securitycenter.googleapis.com/finding/count",
      resourceType: "project",
      resourceLabels: proj,
      metricLabels: { category: rand(["THREAT", "VULNERABILITY", "MISCONFIGURATION"]), source },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(findings) },
    }),
    gcpMetricDoc(ts, "security-command-center", dataset, region, project, {
      metricType: "securitycenter.googleapis.com/source_count",
      resourceType: "project",
      resourceLabels: proj,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(sources) },
    }),
  ];
}

export function generateSecurityOperationsMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["security-operations"]!;
  const rule_name = rand(["lateral_movement_proxy", "gcp_sa_key_create", "o365_phishing_reply"]);
  const stressed = Math.random() < er;
  const res = {
    resource_container: project.id,
    location: region,
    chronicle_instance: "globex-secops",
  };
  const detections = randInt(stressed ? 40 : 8, stressed ? 2_200 : 620);
  const logBytes = randInt(stressed ? 40e9 : 200e9, stressed ? 22e12 : 9e12);
  return [
    gcpMetricDoc(ts, "security-operations", dataset, region, project, {
      metricType: "chronicle.googleapis.com/rule/detection_count",
      resourceType: "chronicle.googleapis.com/Instance",
      resourceLabels: res,
      metricLabels: { rule_name, severity: stressed ? "HIGH" : "LOW" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(detections) },
    }),
    gcpMetricDoc(ts, "security-operations", dataset, region, project, {
      metricType: "chronicle.googleapis.com/log_ingestion_bytes",
      resourceType: "chronicle.googleapis.com/Instance",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(logBytes) },
    }),
  ];
}

export function generateManagedAdMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["managed-ad"]!;
  const domain_name = rand(["corp.globex.example", "partner.ad.example", "finance.ad.example"]);
  const stressed = Math.random() < er;
  const res = {
    resource_container: project.id,
    location: region,
    domain_name,
  };
  const logins = randInt(stressed ? 400 : 2_000, stressed ? 420_000 : 180_000);
  const replMs = stressed ? jitter(8_500, 4_200, 800, 120_000) : jitter(120, 55, 10, 4_200);
  return [
    gcpMetricDoc(ts, "managed-ad", dataset, region, project, {
      metricType: "managedidentities.googleapis.com/domain/login_count",
      resourceType: "managedidentities.googleapis.com/GoogleManagedActiveDirectoryDomain",
      resourceLabels: res,
      metricLabels: { result: stressed ? "FAILURE" : "SUCCESS" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(logins) },
    }),
    gcpMetricDoc(ts, "managed-ad", dataset, region, project, {
      metricType: "managedidentities.googleapis.com/domain/replication_latency",
      resourceType: "managedidentities.googleapis.com/GoogleManagedActiveDirectoryDomain",
      resourceLabels: res,
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: { doubleValue: dp(replMs) },
    }),
  ];
}
