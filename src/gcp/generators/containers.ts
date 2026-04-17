/**
 * GCP container and Kubernetes-family log generators (GKE, Anthos, registries).
 */

import {
  type EcsDocument,
  rand,
  randInt,
  randFloat,
  randId,
  randUUID,
  gcpCloud,
  makeGcpSetup,
  randGkeCluster,
  randGkePod,
  randGkeNamespace,
  randSeverity,
  randHttpStatus,
  randLatencyMs,
  randTraceId,
  randSpanId,
  randIp,
  HTTP_METHODS,
  HTTP_PATHS,
  USER_AGENTS,
} from "./helpers.js";

function insertId(): string {
  return randId(12).toUpperCase();
}

function kubeletDatePrefix(ts: string): { prefix: string; clock: string } {
  const d = new Date(ts);
  const mon = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  const ms = String(d.getUTCMilliseconds()).padStart(3, "0");
  return { prefix: `I${mon}${day}`, clock: `${hh}:${mm}:${ss}.${ms}` };
}

export function generateGkeLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const clusterName = randGkeCluster();
  const namespace = randGkeNamespace();
  const podName = randGkePod();
  const containerName = rand(["app", "sidecar", "istio-proxy", "metrics", "worker"]);
  const nodePool = rand([
    "default-pool",
    `pool-${randId(4).toLowerCase()}`,
    "system-pool",
    "spot-pool",
  ]);
  const nodeName = `gke-${clusterName}-${nodePool}-${randId(4).toLowerCase()}-${rand(["abc", "def", "ghi"])}-${randInt(0, 9)}-${randId(4).toLowerCase()}`;
  const podUid = randUUID();
  const style = randInt(0, 6);
  const location = region;
  const padPid = (n: number) => String(n).padStart(5, "0");

  let message: string;
  let eventType: string;
  let severity: string;
  let outcome: "success" | "failure";
  let duration: number;
  let auditLogName: string | undefined;
  const extra: Record<string, unknown> = {};

  if (style === 0) {
    const payload = isErr
      ? {
          level: "error",
          msg: rand(["unhandled rejection", "ETIMEDOUT connecting to redis", "5xx from upstream"]),
          trace_id: randTraceId(),
        }
      : {
          level: "info",
          msg: rand(["request handled", "batch commit ok", "cache hit"]),
          latency_ms: randInt(3, 120),
        };
    message = JSON.stringify(payload);
    eventType = "CONTAINER_STDOUT";
    severity = isErr ? "ERROR" : "INFO";
    outcome = isErr ? "failure" : "success";
    duration = randInt(5, isErr ? 60_000 : 8000);
  } else if (style === 1) {
    const reason = isErr
      ? rand(["FailedScheduling", "FailedMount", "Unhealthy", "OOMKilled"])
      : rand(["Pulling", "Pulled", "Started", "Created", "Scheduled"]);
    const ktype = isErr ? "Warning" : "Normal";
    message = isErr
      ? `${ktype} ${reason} pod/${podName} (${reason}) — ${rand(["0/5 nodes are available: insufficient cpu", "MountVolume.SetUp failed", "Back-off restarting failed container", "Memory limit exceeded"])}`
      : `${ktype} ${reason} pod/${podName} (${rand(["kubelet", "kube-scheduler", "attachdetach-controller"])}) Message: ${rand(["Successfully pulled image", "Started container", "Pulling image", "Successfully assigned"])}`;
    eventType = "KUBERNETES_EVENT";
    severity = isErr ? "WARNING" : "INFO";
    outcome = isErr ? "failure" : "success";
    duration = randInt(50, isErr ? 300_000 : 30_000);
    extra.jsonPayload = {
      involvedObject: { kind: "Pod", name: podName, namespace },
      type: ktype,
      reason,
    };
  } else if (style === 2) {
    const { prefix, clock } = kubeletDatePrefix(ts);
    const pid = randInt(10000, 65535);
    message = isErr
      ? `kubelet[${pid}]: ${prefix} ${clock}    ${padPid(pid)} kubelet.go:${randInt(2000, 4200)}] E${prefix.slice(1)} ${clock} ${randInt(100, 999)} pod_workers.go:${randInt(100, 999)}] Error syncing pod ${namespace}/${podName}, skipping: CrashLoopBackOff for container ${containerName}`
      : `kubelet[${pid}]: ${prefix} ${clock}    ${padPid(pid)} kubelet.go:${randInt(2000, 4200)}] SyncLoop (PLEG): event for pod "${namespace}/${podName}"`;
    eventType = "KUBELET";
    severity = isErr ? "ERROR" : "INFO";
    outcome = isErr ? "failure" : "success";
    duration = randInt(20, 120_000);
  } else if (style === 3) {
    const methodName = rand([
      "io.k8s.core.v1.pods.create",
      "io.k8s.core.v1.pods.delete",
      "container.clusters.update",
      "io.k8s.core.v1.services.patch",
    ] as const);
    const principal = rand([
      `system:serviceaccount:${namespace}:default`,
      `user:cluster-admin@${project.id.split("-")[0]}.example.com`,
      `system:serviceaccount:kube-system:replicaset-controller`,
    ]);
    const resourceName = rand([
      `projects/${project.id}/locations/${location}/clusters/${clusterName}/k8s/namespaces/${namespace}/pods/${podName}`,
      `projects/${project.id}/zones/${location}/clusters/${clusterName}`,
    ]);
    message = isErr
      ? `cloudaudit.googleapis.com/activity: ${methodName} denied for ${principal} on ${resourceName}`
      : `cloudaudit.googleapis.com/activity: ${methodName} by ${principal} on ${resourceName}`;
    eventType = "AUDIT";
    severity = isErr ? "ERROR" : "NOTICE";
    outcome = isErr ? "failure" : "success";
    duration = randInt(80, 45_000);
    extra.protoPayload = {
      "@type": "type.googleapis.com/google.cloud.audit.AuditLog",
      methodName,
      resourceName,
      authenticationInfo: {
        principalEmail: principal.startsWith("user:") ? principal.slice(5) : principal,
      },
      serviceName: methodName.startsWith("container.") ? "container.googleapis.com" : "k8s.io",
      status: isErr ? { code: 7, message: "PERMISSION_DENIED" } : {},
    };
    auditLogName = `projects/${project.id}/logs/cloudaudit.googleapis.com%2Factivity`;
  } else if (style === 4) {
    message = isErr
      ? `node-problem-detector[${randInt(1000, 9999)}]: Condition MemoryPressure is now: True, reason: KubeletHasInsufficientMemory on node ${nodeName}`
      : `cluster-autoscaler: Scale-up: group https://www.googleapis.com/compute/v1/projects/${project.id}/zones/${location}/instanceGroups/${nodePool} size set to ${randInt(3, 12)}`;
    eventType = "NODE_EVENT";
    severity = isErr ? "WARNING" : "INFO";
    outcome = isErr ? "failure" : "success";
    duration = randInt(500, 180_000);
  } else if (style === 5) {
    const method = rand(HTTP_METHODS);
    const path = rand(HTTP_PATHS);
    const statusCode = randHttpStatus(isErr);
    const lat = randLatencyMs(randInt(8, 120), isErr);
    const upstream = rand([
      "outbound|8080||catalog.production.svc.cluster.local",
      "outbound|443||payments.production.svc.cluster.local",
    ]);
    message = `[${ts}] "${method} ${path} HTTP/1.1" ${statusCode} - via_upstream - "${rand(USER_AGENTS)}" ${lat}ms ${upstream} ${randIp()}`;
    eventType = "ENVOY_ACCESS";
    severity = isErr ? "WARNING" : "INFO";
    outcome = isErr ? "failure" : "success";
    duration = lat;
  } else {
    const traceId = randTraceId();
    const spanId = randSpanId();
    message = isErr
      ? `Error from server (Invalid): error when applying patch: Operation cannot be fulfilled on deployments.apps "api-gateway": the object has been modified`
      : `deployment.apps/${podName.split("-")[0]} configured`;
    eventType = "APISERVER";
    severity = isErr ? "ERROR" : "INFO";
    outcome = isErr ? "failure" : "success";
    duration = randInt(30, 20_000);
    extra.jsonPayload = {
      traceId,
      spanId,
      component: "apiserver",
      auditId: randId(16).toLowerCase(),
    };
  }

  const gkeBlock = {
    cluster: clusterName,
    cluster_name: clusterName,
    namespace,
    pod: podName,
    pod_name: podName,
    container_name: containerName,
    node_name: nodeName,
    node_pool: nodePool,
    event_type: eventType,
    severity,
  };

  return {
    "@timestamp": ts,
    severity,
    labels: {
      project_id: project.id,
      cluster_name: clusterName,
      location,
      namespace_name: namespace,
      pod_name: podName,
      container_name: containerName,
      node_name: nodeName,
    },
    insertId: insertId(),
    logName:
      auditLogName ??
      `projects/${project.id}/logs/${rand(["container.googleapis.com%2Fcluster-autoscaler-visibility", "stdout"])}`,
    resource: {
      type: "k8s_container",
      labels: {
        project_id: project.id,
        cluster_name: clusterName,
        location,
        namespace_name: namespace,
        pod_name: podName,
        container_name: containerName,
      },
    },
    cloud: gcpCloud(region, project, "container.googleapis.com"),
    kubernetes: {
      namespace,
      pod: { name: podName, uid: podUid },
      container: { name: containerName },
      node: { name: nodeName },
    },
    gcp: {
      gke: gkeBlock,
    },
    event: {
      outcome,
      duration,
    },
    message,
    ...extra,
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
  const severity = randSeverity(isErr);
  const message = isErr
    ? `anthos.googleapis.com: membership "${clusterName}" (${location}) feature ${feature}: ${eventType} — ${status} in namespace ${fleetNamespace}`
    : `anthos.googleapis.com: ${membershipName} — ${feature} ${eventType} (${status})`;

  return {
    "@timestamp": ts,
    severity,
    labels: { membership: clusterName, feature, fleet_namespace: fleetNamespace },
    insertId: insertId(),
    resource: {
      type: "gke_hub_membership",
      labels: { project_id: project.id, location: "global", membership_name: clusterName },
    },
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
  const severity = randSeverity(isErr);
  const message =
    action === "scan"
      ? isErr
        ? `artifactregistry.googleapis.com: vulnerability scan FAILED for ${packageName}:${tagOrVersion} (${format}) — ${vulnerabilityCount} critical/high findings`
        : `artifactregistry.googleapis.com: scan completed ${packageName}:${tagOrVersion} (${format}); ${vulnerabilityCount} low/info findings`
      : isErr
        ? `artifactregistry.googleapis.com: ${action} FAILED ${packageName}@${tagOrVersion} (${format}): ${rand(["DENIED", "NOT_FOUND", "QUOTA_EXCEEDED"])}`
        : `artifactregistry.googleapis.com: ${action} OK ${packageName}@${tagOrVersion} (${format})`;

  return {
    "@timestamp": ts,
    severity,
    labels: { repository, format, action },
    insertId: insertId(),
    resource: {
      type: "artifactregistry.googleapis.com/Repository",
      labels: { project_id: project.id, location: region, repository },
    },
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
  const severity = randSeverity(isErr);
  const message = isErr
    ? `containerregistry.googleapis.com: ${action} denied for ${imageName}:${tag} (${digest.slice(0, 19)}…): ${rand(["denied", "manifest unknown", "quota exceeded"])}`
    : `containerregistry.googleapis.com: ${action} ${imageName}:${tag} size=${Math.round(sizeBytes / 1_048_576)}MiB digest=${digest.slice(0, 19)}…`;

  return {
    "@timestamp": ts,
    severity,
    labels: { image: imageName.split("/").pop() ?? "image", action },
    insertId: insertId(),
    resource: {
      type: "gcr.io",
      labels: { project_id: project.id, bucket_name: "artifacts." + project.id + ".appspot.com" },
    },
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
  const severity = randSeverity(isErr);
  const message = isErr
    ? `container.googleapis.com/autopilot: cluster "${cluster}" ${scalingEvent} for ${workloadType}/${pod} in ${namespace} (requests ${resourceRequestCpu}/${resourceRequestMemory})`
    : `container.googleapis.com/autopilot: cluster "${cluster}" ${scalingEvent}: ${workloadType} ${pod} (${namespace}) sized to ${resourceRequestCpu} CPU, ${resourceRequestMemory} RAM`;

  return {
    "@timestamp": ts,
    severity,
    labels: { cluster_name: cluster, namespace_name: namespace, scaling_event: scalingEvent },
    insertId: insertId(),
    resource: {
      type: "k8s_cluster",
      labels: { project_id: project.id, location: region, cluster_name: cluster },
    },
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
  const severity = randSeverity(isErr);
  const message = isErr
    ? `istio.io/telemetry: mesh=${meshName} service=${service} p99=${latencyP99Ms}ms err_rate=${(errorRate * 100).toFixed(2)}% protocol=${protocol}`
    : `istio.io/telemetry: mesh=${meshName} ${sourceWorkload} -> ${destWorkload} rq=${requestCount} p99=${latencyP99Ms}ms`;

  return {
    "@timestamp": ts,
    severity,
    labels: { mesh_name: meshName, service },
    insertId: insertId(),
    resource: {
      type: "k8s_cluster",
      labels: { project_id: project.id, location: region, cluster_name: meshName },
    },
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
  const severity = randSeverity(isErr || syncStatus === "ERROR");
  const message = isErr
    ? `configmanagement.gke.io: cluster "${cluster}" sync ${syncStatus} — policy-controller reports ${policyViolations} violations (commit ${commitSha})`
    : `configmanagement.gke.io: cluster "${cluster}" ${syncStatus} at ${lastSyncTime} (${policyViolations} open violations)`;

  return {
    "@timestamp": ts,
    severity,
    labels: { cluster_name: cluster, sync_status: syncStatus },
    insertId: insertId(),
    resource: {
      type: "k8s_cluster",
      labels: { project_id: project.id, location: region, cluster_name: cluster },
    },
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
  const severity = randSeverity(isErr || complianceState === "NON_COMPLIANT");
  const message = isErr
    ? `gkehub.googleapis.com: fleet "${fleetName}" feature ${feature} state=${complianceState} violations=${violationCount}`
    : `gkehub.googleapis.com: fleet "${fleetName}" membership ${membership.split("/").pop()}: ${feature} ${complianceState}`;

  return {
    "@timestamp": ts,
    severity,
    labels: { fleet_name: fleetName, feature },
    insertId: insertId(),
    resource: {
      type: "gke_hub_fleet",
      labels: { project_id: project.id, location: "global", fleet: fleetName },
    },
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
  const severity = randSeverity(isErr);
  const message = isErr
    ? `migrate.kubernetes.io: plan "${migrationPlan}" phase ${phase} ${status}: fit score ${(fitScore * 100).toFixed(0)} (${sourceVm})`
    : `migrate.kubernetes.io: ${sourceVm} -> ${targetImage} phase ${phase} ${status} (fit ${(fitScore * 100).toFixed(0)})`;

  return {
    "@timestamp": ts,
    severity,
    labels: { migration_plan: migrationPlan, phase, source_vm: sourceVm },
    insertId: insertId(),
    resource: {
      type: "gce_instance",
      labels: { project_id: project.id, instance_id: sourceVm },
    },
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
