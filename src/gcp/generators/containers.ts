/**
 * GCP container and Kubernetes-family log generators (GKE, Anthos, registries).
 */

import {
  type EcsDocument,
  rand,
  randInt,
  randFloat,
  randId,
  gcpCloud,
  makeGcpSetup,
  randGkeCluster,
  randGkePod,
  randGkeNamespace,
  randSeverity,
} from "./helpers.js";

export function generateGkeLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const cluster = randGkeCluster();
  const namespace = randGkeNamespace();
  const pod = randGkePod();
  const containerName = rand(["app", "sidecar", "istio-proxy", "metrics", "worker"]);
  const nodeName = `gke-${cluster}-${randId(4).toLowerCase()}-${rand(["abc", "def", "ghi"])}-${randInt(0, 9)}-${randId(4).toLowerCase()}`;
  const eventType = isErr
    ? rand(["Unhealthy", "Evicted", "OOMKilled", "Pulling"] as const)
    : rand(["PodScheduled", "Pulling", "Created", "Started"] as const);
  const severity = randSeverity(isErr);
  const message = isErr
    ? `GKE ${cluster}/${namespace}: pod ${pod} on ${nodeName} — ${eventType} (${severity}): ${rand(["Liveness probe failed", "Back-off pulling image", "Container OOMKilled", "Evicted due to disk pressure"])}`
    : `GKE ${cluster}/${namespace}: ${eventType} for pod ${pod} container ${containerName} on ${nodeName}`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "container.googleapis.com"),
    gcp: {
      gke: {
        cluster,
        namespace,
        pod,
        container_name: containerName,
        node_name: nodeName,
        event_type: eventType,
        severity,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(50, isErr ? 300_000 : 30_000),
    },
    message,
  };
}

export function generateAnthosLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const clusterName = rand(["on-prem-edge", "aws-attached", "azure-attached", "baremetal-1"]);
  const membershipName = `projects/${project.id}/locations/global/memberships/${clusterName}`;
  const location = rand([region, "global", "us-west1"]);
  const fleetNamespace = rand(["fleet-default", "config-management-system", "anthos-identity"]);
  const feature = rand(["serviceMesh", "configManagement", "policyController"] as const);
  const eventType = isErr
    ? rand(["SYNC_FAILURE", "POLICY_VIOLATION", "MESH_CERT_ERROR"])
    : rand(["SYNC_OK", "FEATURE_ENABLED", "HEALTH_CHECK", "UPGRADE_STARTED"]);
  const status = isErr ? rand(["ERROR", "DEGRADED"]) : rand(["HEALTHY", "RUNNING", "OK"]);
  const message = isErr
    ? `Anthos ${feature} on ${clusterName} (${location}): ${eventType} — ${status} in ${fleetNamespace}`
    : `Anthos membership ${membershipName}: ${feature} ${eventType} (${status})`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "anthos.googleapis.com"),
    gcp: {
      anthos: {
        cluster_name: clusterName,
        membership_name: membershipName,
        location,
        fleet_namespace: fleetNamespace,
        feature,
        event_type: eventType,
        status,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(2000, isErr ? 600_000 : 120_000),
    },
    message,
  };
}

export function generateArtifactRegistryLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const repository = `${rand(["apps", "base", "ml", "security"])}-${randId(4).toLowerCase()}`;
  const format = rand(["docker", "npm", "python", "maven", "apt"] as const);
  const packageName =
    format === "docker"
      ? `${region}-docker.pkg.dev/${project.id}/${repository}/api`
      : rand(["@corp/api-client", "internal-tools", "ml-inference", "billing-core"]);
  const tagOrVersion =
    format === "docker"
      ? rand(["latest", `v${randInt(1, 9)}.${randInt(0, 20)}.${randInt(0, 99)}`])
      : rand(["1.4.2", "2.0.0-rc1", "0.0.0-sha." + randId(7).toLowerCase()]);
  const action = isErr
    ? rand(["scan", "push", "pull"] as const)
    : rand(["push", "pull", "delete", "scan"] as const);
  const vulnerabilityCount = action === "scan" ? (isErr ? randInt(1, 50) : randInt(0, 3)) : 0;
  const message =
    action === "scan"
      ? isErr
        ? `Artifact Registry scan of ${packageName}:${tagOrVersion} found ${vulnerabilityCount} vulnerabilities (${format})`
        : `Artifact Registry scan completed for ${packageName}:${tagOrVersion} (${vulnerabilityCount} findings, ${format})`
      : isErr
        ? `Artifact Registry ${action} failed for ${packageName}@${tagOrVersion} (${format})`
        : `Artifact Registry ${action} succeeded: ${packageName}@${tagOrVersion} (${format})`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "artifactregistry.googleapis.com"),
    gcp: {
      artifact_registry: {
        repository,
        format,
        package_name: packageName,
        tag_or_version: tagOrVersion,
        action,
        vulnerability_count: vulnerabilityCount,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(100, action === "scan" ? 120_000 : 8000),
    },
    message,
  };
}

export function generateContainerRegistryLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const imageName = `gcr.io/${project.id}/${rand(["api", "worker", "batch", "cron"])}-${randId(4).toLowerCase()}`;
  const tag = rand([
    "latest",
    `build-${randId(8).toLowerCase()}`,
    `v${randInt(1, 5)}.${randInt(0, 30)}`,
  ]);
  const digest = `sha256:${Array.from({ length: 64 }, () => randInt(0, 15).toString(16)).join("")}`;
  const action = rand(["push", "pull", "delete"] as const);
  const sizeBytes = randInt(5_000_000, 900_000_000);
  const message = isErr
    ? `gcr.io ${action} failed for ${imageName}:${tag} (${digest.slice(0, 19)}…): ${rand(["denied", "manifest unknown", "quota exceeded"])}`
    : `gcr.io ${action} ${imageName}:${tag} (${Math.round(sizeBytes / 1_048_576)}MiB, ${digest.slice(0, 19)}…)`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "containerregistry.googleapis.com"),
    gcp: {
      container_registry: {
        image_name: imageName,
        tag,
        digest,
        action,
        size_bytes: sizeBytes,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(200, isErr ? 60_000 : 25_000),
    },
    message,
  };
}

export function generateGkeAutopilotLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const cluster = `${randGkeCluster()}-autopilot`;
  const namespace = randGkeNamespace();
  const pod = randGkePod();
  const workloadType = rand(["Deployment", "Job", "CronJob"] as const);
  const resourceRequestCpu = `${randInt(1, 8)}${rand(["", "m"])}`;
  const resourceRequestMemory = `${randInt(128, 8192)}Mi`;
  const scalingEvent = isErr
    ? rand(["SCALE_DOWN_BLOCKED", "CAPACITY_ERROR", "ADMISSION_DENIED"])
    : rand(["SCALE_UP", "SCALE_DOWN", "POD_SCHEDULED", "NODE_POOL_RESIZED"]);
  const message = isErr
    ? `GKE Autopilot ${cluster}: ${scalingEvent} for ${workloadType} ${pod} in ${namespace} (requests ${resourceRequestCpu}/${resourceRequestMemory})`
    : `GKE Autopilot ${cluster} ${scalingEvent}: ${workloadType} ${pod} (${namespace}) sized to ${resourceRequestCpu} CPU, ${resourceRequestMemory} RAM`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "container.googleapis.com"),
    gcp: {
      gke_autopilot: {
        cluster,
        namespace,
        pod,
        workload_type: workloadType,
        resource_request_cpu: resourceRequestCpu,
        resource_request_memory: resourceRequestMemory,
        scaling_event: scalingEvent,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(500, isErr ? 180_000 : 45_000),
    },
    message,
  };
}

export function generateAnthosServiceMeshLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const meshName = `mesh-${randId(5).toLowerCase()}`;
  const service = rand(["payments.checkout", "catalog.items", "auth.tokens", "orders.api"]);
  const sourceWorkload = `${randGkeNamespace()}/${randGkePod()}`;
  const destWorkload = `${randGkeNamespace()}/${randGkePod()}`;
  const requestCount = isErr ? randInt(10, 500) : randInt(500, 500_000);
  const latencyP99Ms = isErr ? randInt(800, 8000) : randInt(20, 400);
  const errorRate = isErr ? randFloat(0.05, 0.4) : randFloat(0, 0.02);
  const protocol = rand(["HTTP", "gRPC"] as const);
  const message = isErr
    ? `Anthos Service Mesh ${meshName} ${service}: p99=${latencyP99Ms}ms err=${(errorRate * 100).toFixed(2)}% ${protocol}`
    : `Anthos Service Mesh ${meshName} ${sourceWorkload} -> ${destWorkload} rq=${requestCount} p99=${latencyP99Ms}ms`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "anthos-service-mesh"),
    gcp: {
      anthos_service_mesh: {
        mesh_name: meshName,
        service,
        source_workload: sourceWorkload,
        dest_workload: destWorkload,
        request_count: requestCount,
        latency_p99_ms: latencyP99Ms,
        error_rate: Math.round(errorRate * 10_000) / 10_000,
        protocol,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(1000, isErr ? 120_000 : 30_000),
    },
    message,
  };
}

export function generateAnthosConfigMgmtLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const cluster = randGkeCluster();
  const repoUrl = `https://source.developers.google.com/p/${project.id}/r/config-${randId(4)}`;
  const syncStatus = isErr
    ? rand(["ERROR", "PENDING"] as const)
    : rand(["SYNCED", "ERROR", "PENDING"] as const);
  const commitSha = Array.from({ length: 7 }, () => randInt(0, 15).toString(16)).join("");
  const policyViolations = isErr ? randInt(3, 40) : randInt(0, 5);
  const lastSyncTime = new Date(new Date(ts).getTime() - randInt(60_000, 3_600_000)).toISOString();
  const message = isErr
    ? `Anthos Config Management ${cluster}: ${syncStatus} — ${policyViolations} policy controller violations (commit ${commitSha})`
    : `Anthos Config Management ${cluster} ${syncStatus} at ${lastSyncTime} (${policyViolations} violations)`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "anthos-config-mgmt"),
    gcp: {
      anthos_config_mgmt: {
        cluster,
        repo_url: repoUrl,
        sync_status: syncStatus,
        commit_sha: commitSha,
        policy_controller_violations: policyViolations,
        last_sync_time: lastSyncTime,
      },
    },
    event: {
      outcome: isErr || syncStatus === "ERROR" ? "failure" : "success",
      duration: randInt(2000, isErr ? 300_000 : 60_000),
    },
    message,
  };
}

export function generateGkeEnterpriseLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const fleetName = `fleet-${rand(["prod", "platform", "edge"])}-${randId(4).toLowerCase()}`;
  const membership = `projects/${project.id}/locations/global/memberships/${randGkeCluster()}`;
  const feature = rand(["policyController", "configSync", "serviceDirectory"] as const);
  const complianceState = isErr
    ? rand(["NON_COMPLIANT", "UNKNOWN"] as const)
    : rand(["COMPLIANT", "PARTIAL", "NON_COMPLIANT"] as const);
  const violationCount = isErr ? randInt(5, 200) : randInt(0, 12);
  const message = isErr
    ? `GKE Enterprise fleet ${fleetName}: feature ${feature} ${complianceState} (${violationCount} violations)`
    : `GKE Enterprise ${fleetName} membership ${membership.split("/").pop()}: ${feature} ${complianceState}`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "gke-enterprise"),
    gcp: {
      gke_enterprise: {
        fleet_name: fleetName,
        membership,
        feature,
        compliance_state: complianceState,
        violation_count: violationCount,
      },
    },
    event: {
      outcome: isErr || complianceState === "NON_COMPLIANT" ? "failure" : "success",
      duration: randInt(1500, isErr ? 240_000 : 90_000),
    },
    message,
  };
}

export function generateMigrateToContainersLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const sourceVm = `vm-${rand(["legacy", "monolith"])}-${randId(5).toLowerCase()}`;
  const targetImage = `gcr.io/${project.id}/migrated/${rand(["api", "worker"])}:${randId(6).toLowerCase()}`;
  const migrationPlan = `plan-${randId(8).toLowerCase()}`;
  const phase = rand(["DISCOVER", "GENERATE_ARTIFACTS", "DEPLOY"] as const);
  const status = isErr
    ? rand(["FAILED", "RUNNING"] as const)
    : rand(["SUCCEEDED", "RUNNING", "PENDING"] as const);
  const fitScore = isErr ? randFloat(0.2, 0.55) : randFloat(0.65, 0.98);
  const message = isErr
    ? `Migrate to Containers ${migrationPlan} phase ${phase} ${status}: fit score ${(fitScore * 100).toFixed(0)}`
    : `Migrate to Containers ${sourceVm} -> ${targetImage} ${phase} ${status} (fit ${(fitScore * 100).toFixed(0)})`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "migrate-to-containers"),
    gcp: {
      migrate_to_containers: {
        source_vm: sourceVm,
        target_image: targetImage,
        migration_plan: migrationPlan,
        phase,
        status,
        fit_assessment_score: Math.round(fitScore * 1000) / 1000,
      },
    },
    event: {
      outcome: isErr || status === "FAILED" ? "failure" : "success",
      duration: randInt(10_000, isErr ? 7_200_000 : 1_800_000),
    },
    message,
  };
}
