/**
 * GCP compute-family log generators (Compute Engine, Batch, sole-tenant, VMware Engine, etc.).
 */

import {
  type EcsDocument,
  rand,
  randInt,
  randFloat,
  randId,
  gcpCloud,
  makeGcpSetup,
  randZone,
  randGceInstance,
  randNetworkTag,
  randServiceAccount,
  randOperationId,
  randSeverity,
  randIp,
} from "./helpers.js";

const GCE_MACHINE_TYPES = [
  "e2-micro",
  "e2-medium",
  "n2-standard-4",
  "n2-standard-8",
  "c2-standard-8",
  "c3-highcpu-22",
  "m3-megamem-128",
] as const;

function insertId(): string {
  return randId(12).toUpperCase();
}

function auditPrincipalEmail(project: ReturnType<typeof makeGcpSetup>["project"]): string {
  const org = project.id.split("-")[0];
  return Math.random() < 0.45
    ? randServiceAccount(project)
    : rand([
        `admin@${org}.example.com`,
        `sre@${org}.example.com`,
        `ci-bot@${project.id}.iam.gserviceaccount.com`,
      ]);
}

export function generateComputeEngineLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const instance = randGceInstance();
  const zone = randZone(region);
  const machineType = rand(GCE_MACHINE_TYPES);
  const networkTags = Array.from({ length: randInt(1, 4) }, () => randNetworkTag());
  const preemptible = Math.random() < 0.22;
  const diskSizeGb = randInt(20, 2000);
  const style = randInt(0, 4);
  const resourceName = `projects/${project.id}/zones/${zone}/instances/${instance.name}`;
  const defaultLogName = `projects/${project.id}/logs/${rand(["compute.googleapis.com%2Factivity", "cloudaudit.googleapis.com%2Factivity", "syslog"])}`;
  const baseLabels: Record<string, string> = {
    instance_id: instance.id,
    zone,
    machine_type: machineType,
    ...(preemptible ? { scheduling: "preemptible" } : {}),
  };

  let message: string;
  let severity: string;
  let eventType: string;
  let status: string;
  let outcome: "success" | "failure";
  let duration: number;
  const extra: Record<string, unknown> = {};
  let metrics: Record<string, number> | undefined;

  if (style === 0) {
    const action = rand(["started", "stopped", "deleted", "suspended", "reset"] as const);
    const bootLine = isErr
      ? rand([
          "kernel: [    0.000000] ACPI: _OSC evaluation for CPUs failed, trying _PDC",
          "systemd[1]: Failed to start google-osconfig-agent.service",
          "cloud-init[1234]: Failed to fetch metadata: timeout",
        ])
      : rand([
          "kernel: [    0.000000] Linux version 6.1.0-28-cloud-amd64",
          "systemd[1]: Started google-guest-agent.service",
          "google_metadata_script_runner[890]: startup-script exit status 0",
        ]);
    message = isErr
      ? `${bootLine} | GCE instance '${instance.name}' in ${zone} reported fault during ${action}`
      : `GCE instance '${instance.name}' was ${action} in ${zone} (${machineType}). ${bootLine}`;
    severity = isErr ? rand(["ERROR", "WARNING"] as const) : rand(["INFO", "NOTICE"] as const);
    eventType = "SERIAL_CONSOLE";
    status = isErr ? "DEGRADED" : rand(["RUNNING", "STOPPING", "TERMINATED"] as const);
    outcome = isErr ? "failure" : "success";
    duration = randInt(200, isErr ? 120_000 : 8000);
    extra.textPayload = message;
  } else if (style === 1) {
    const methodName = rand([
      "compute.instances.insert",
      "compute.instances.setMetadata",
      "compute.instances.delete",
      "compute.instances.stop",
      "compute.instances.attachDisk",
    ] as const);
    const principalEmail = auditPrincipalEmail(project);
    message = isErr
      ? `${principalEmail} denied on ${methodName} for ${resourceName}: ${rand(["PERMISSION_DENIED", "QUOTA_EXCEEDED", "INVALID_ARGUMENT"])}`
      : `${principalEmail} invoked ${methodName} on ${resourceName}`;
    severity = isErr ? "ERROR" : "NOTICE";
    eventType = methodName;
    status = isErr ? "FAILED" : "OK";
    outcome = isErr ? "failure" : "success";
    duration = randInt(120, isErr ? 90_000 : 25_000);
    extra.protoPayload = {
      "@type": "type.googleapis.com/google.cloud.audit.AuditLog",
      methodName,
      resourceName,
      authenticationInfo: { principalEmail },
      requestMetadata: {
        callerIp: randIp(),
        callerSuppliedUserAgent: rand([
          "gcloud/492.0.0 command/ssh-login",
          "Terraform/1.7.5",
          "google-api-python-client/2.142.0",
        ]),
        requestAttributes: { time: ts },
      },
      serviceName: "compute.googleapis.com",
      status: isErr
        ? { code: rand([3, 7, 8]), message: rand(["Permission denied", "Quota exceeded"]) }
        : {},
    };
  } else if (style === 2) {
    const agentLine = isErr
      ? `ops-agent health: instance ${instance.name} failed disk check (${zone})`
      : `ops-agent: collected ${randInt(120, 4000)} metric points for ${instance.name}; heartbeat ok`;
    message = agentLine;
    severity = isErr ? "WARNING" : "INFO";
    eventType = "OPS_AGENT";
    status = isErr ? "UNHEALTHY" : "HEALTHY";
    outcome = isErr ? "failure" : "success";
    duration = randInt(500, 60_000);
    metrics = {
      cpu_utilization:
        Math.round((isErr ? randFloat(0.85, 0.99) : randFloat(0.05, 0.45)) * 1000) / 10,
      memory_used_percent: Math.round((isErr ? randFloat(92, 99) : randFloat(35, 78)) * 10) / 10,
      disk_read_iops: randInt(50, isErr ? 8000 : 1200),
    };
    extra.jsonPayload = {
      agentVersion: rand(["2.46.0", "2.47.1", "2.48.0"]),
      metrics,
      host: instance.name,
    };
  } else if (style === 3) {
    const kind = rand(["preemption", "live_migration", "maintenance"] as const);
    if (kind === "preemption") {
      message = isErr
        ? `Preemption notice: ${instance.name} (${zone}) will be reclaimed in 30s: RESOURCE_UNAVAILABLE`
        : `Preemption notice: ${instance.name} (${zone}) will be reclaimed in 30s: SPOT_PREEMPTED`;
      eventType = "PREEMPT_NOTICE";
    } else if (kind === "live_migration") {
      message = isErr
        ? `Live migration on ${instance.name} (${zone}) failed: source host unhealthy`
        : `Live migration completed for ${instance.name} in ${zone}: migration id ${randOperationId()}`;
      eventType = "LIVE_MIGRATION";
    } else {
      message = isErr
        ? `Maintenance event deferred for ${instance.name} (${zone}): incompatible disk layout`
        : `Scheduled maintenance window starting for ${instance.name} (${zone}); live migration will follow`;
      eventType = "MAINTENANCE_EVENT";
    }
    severity = isErr ? "ERROR" : "NOTICE";
    status = isErr ? "FAILED" : "SCHEDULED";
    outcome = isErr ? "failure" : "success";
    duration = randInt(2000, isErr ? 600_000 : 180_000);
  } else {
    const src = rand(["payments-api", "inventory-worker", "batch-etl"]);
    message = isErr
      ? JSON.stringify({
          severity: "ERROR",
          source: src,
          message: rand([
            "connection reset by peer",
            "deadline exceeded",
            "out of file descriptors",
          ]),
          traceId: randId(16),
        })
      : JSON.stringify({
          severity: "INFO",
          source: src,
          message: rand(["request completed", "cache warm", "leader elected"]),
          latencyMs: randInt(2, 180),
        });
    severity = isErr ? "ERROR" : "INFO";
    eventType = "STRUCTURED_APPLICATION";
    status = isErr ? "ERROR" : "OK";
    outcome = isErr ? "failure" : "success";
    duration = randInt(5, isErr ? 30_000 : 4000);
    try {
      extra.jsonPayload = JSON.parse(message);
    } catch {
      extra.jsonPayload = { raw: message };
    }
  }

  const computeEngine: Record<string, unknown> = {
    instance_id: instance.id,
    instance_name: instance.name,
    machine_type: machineType,
    zone,
    status,
    preemptible,
    network_tags: networkTags,
    event_type: eventType,
    disk_size_gb: diskSizeGb,
    ...(metrics ? { metrics } : {}),
  };

  return {
    "@timestamp": ts,
    severity,
    labels: baseLabels,
    logName:
      style === 1
        ? `projects/${project.id}/logs/cloudaudit.googleapis.com%2Factivity`
        : defaultLogName,
    insertId: insertId(),
    resource: {
      type: "gce_instance",
      labels: {
        project_id: project.id,
        instance_id: instance.id,
        zone,
      },
    },
    cloud: gcpCloud(region, project, "compute.googleapis.com"),
    gcp: {
      compute_engine: computeEngine,
    },
    event: {
      outcome,
      duration,
    },
    message,
    ...extra,
  };
}

export function generateBatchLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const jobId = `batch-job-${randId(10).toLowerCase()}`;
  const taskGroup = `group${randInt(0, 5)}`;
  const taskIndex = randInt(0, 127);
  const status = isErr
    ? rand(["FAILED", "FAILED", "QUEUED"])
    : rand(["QUEUED", "RUNNING", "SUCCEEDED"]);
  const machineType = rand(["n1-standard-4", "n2-standard-8", "c2-standard-16", "e2-highmem-8"]);
  const provisioningModel = rand(["standard", "spot"] as const);
  const severity = randSeverity(isErr);
  const zone = randZone(region);
  const message = isErr
    ? `batch.googleapis.com: Job "${jobId}" task "${taskGroup}-${taskIndex}" in ${zone} ${status}: ${rand(["Preemption", "OOM", "Startup script failed", "Image pull error"])}`
    : `batch.googleapis.com: Task "${taskGroup}-${taskIndex}" for job "${jobId}" is ${status} on ${machineType} (${provisioningModel}, ${zone})`;

  return {
    "@timestamp": ts,
    severity,
    labels: { job_uid: jobId, task_group: taskGroup, zone },
    insertId: insertId(),
    resource: {
      type: "batch.googleapis.com/Job",
      labels: { project_id: project.id, location: region, job_id: jobId },
    },
    cloud: gcpCloud(region, project, "batch.googleapis.com"),
    gcp: {
      batch: {
        job_id: jobId,
        task_group: taskGroup,
        task_index: taskIndex,
        status,
        machine_type: machineType,
        provisioning_model: provisioningModel,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(2000, isErr ? 3_600_000 : 900_000),
    },
    message,
  };
}

export function generateSoleTenantNodesLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const nodeGroup = `sole-${rand(["prod", "data", "sap"])}-${randId(4).toLowerCase()}`;
  const nodeType = rand(["n2-node-80-640", "m2-node-416-11776", "c2-node-112-896"]);
  const nodeId = `node-${randId(12).toLowerCase()}`;
  const status = isErr
    ? rand(["ERROR", "MAINTENANCE_FAILED"])
    : rand(["READY", "PROVISIONING", "RUNNING"]);
  const vmsCount = randInt(0, isErr ? 40 : 80);
  const cpuOvercommitRatios = [1, 1.5, 2, 2.5] as const;
  const cpuOvercommitRatio = cpuOvercommitRatios[randInt(0, cpuOvercommitRatios.length - 1)];
  const severity = randSeverity(isErr);
  const zone = randZone(region);
  const message = isErr
    ? `compute.googleapis.com SoleTenantNode ${nodeId} (${nodeType}) in ${nodeGroup} (${zone}): ${status}; ${vmsCount} VMs impacted`
    : `compute.googleapis.com SoleTenantNodeGroup "${nodeGroup}": node ${nodeId} (${nodeType}) healthy in ${zone} — ${vmsCount} VMs, CPU overcommit ${cpuOvercommitRatio}x`;

  return {
    "@timestamp": ts,
    severity,
    labels: { node_group: nodeGroup, node_id: nodeId, zone },
    insertId: insertId(),
    resource: {
      type: "gce_instance",
      labels: { project_id: project.id, zone },
    },
    cloud: gcpCloud(region, project, "compute.googleapis.com"),
    gcp: {
      sole_tenant_nodes: {
        node_group: nodeGroup,
        node_type: nodeType,
        node_id: nodeId,
        status,
        vms_count: vmsCount,
        cpu_overcommit_ratio: cpuOvercommitRatio,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(10_000, isErr ? 7200_000 : 1200_000),
    },
    message,
  };
}

export function generateVmwareEngineLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const privateCloud = `pc-${rand(["prod", "dr", "lab"])}-${randId(5).toLowerCase()}`;
  const clusterName = `cluster-${randInt(1, 6)}`;
  const nodeType = rand(["ve1-standard-72", "ve1-standard-96", "ve2-standard-112"]);
  const eventType = isErr
    ? rand([
        "VMWARE_CLUSTER_CREATING_FAILED",
        "NODE_ADDED_FAILED",
        "MAINTENANCE_DEFERRED",
        "STRETCHED_NETWORK_ERROR",
      ])
    : rand([
        "VMWARE_CLUSTER_CREATING",
        "NODE_ADDED",
        "MAINTENANCE",
        "UPGRADE_COMPLETED",
        "NSXT_CONFIG_UPDATED",
      ]);
  const status = isErr ? rand(["ERROR", "FAILED"]) : rand(["RUNNING", "SUCCEEDED", "IN_PROGRESS"]);
  const severity = randSeverity(isErr);
  const message = isErr
    ? `vmwareengine.googleapis.com/${privateCloud}/${clusterName}: ${eventType} — ${status} (${nodeType}, ${region})`
    : `vmwareengine.googleapis.com PrivateCloud "${privateCloud}" cluster "${clusterName}": ${eventType} ${status} (${nodeType})`;

  return {
    "@timestamp": ts,
    severity,
    labels: { private_cloud: privateCloud, cluster_name: clusterName },
    insertId: insertId(),
    resource: {
      type: "vmwareengine.googleapis.com/PrivateCloud",
      labels: { project_id: project.id, location: `region/${region}`, private_cloud: privateCloud },
    },
    cloud: gcpCloud(region, project, "vmwareengine.googleapis.com"),
    gcp: {
      vmware_engine: {
        private_cloud: privateCloud,
        cluster_name: clusterName,
        node_type: nodeType,
        event_type: eventType,
        status,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(60_000, isErr ? 14_400_000 : 3_600_000),
    },
    message,
  };
}

export function generateBareMetalLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const instanceName = `bm-${rand(["db", "hpc", "gpu"])}-${randId(6).toLowerCase()}`;
  const machineType = rand([
    "o2-standard-16-metal",
    "m3-megamem-128-metal",
    "n2-standard-80-metal",
  ]);
  const lunId = `lun-${randInt(0, 15)}`;
  const networkName = rand(["baremetal-vpc", "prod-bm-net", "storage-net"]);
  const eventType = isErr
    ? rand(["LUN_PATH_DOWN", "NIC_LINK_FLAP", "FIRMWARE_UPDATE_FAILED"])
    : rand(["INSTANCE_READY", "LUN_ATTACHED", "NETWORK_CONFIGURED", "HEALTH_CHECK_OK"]);
  const status = isErr ? rand(["DEGRADED", "FAILED"]) : rand(["OK", "HEALTHY"]);
  const severity = randSeverity(isErr);
  const message = isErr
    ? `baremetalsolution.googleapis.com Instance "${instanceName}": ${eventType} on ${networkName} / ${lunId} (${machineType}) — ${status}`
    : `baremetalsolution.googleapis.com Instance "${instanceName}" (${machineType}): ${eventType}; LUN ${lunId} on ${networkName} (${status})`;

  return {
    "@timestamp": ts,
    severity,
    labels: { instance_name: instanceName, lun_id: lunId, network: networkName },
    insertId: insertId(),
    resource: {
      type: "baremetalsolution.googleapis.com/Instance",
      labels: { project_id: project.id, location: region, instance: instanceName },
    },
    cloud: gcpCloud(region, project, "baremetalsolution.googleapis.com"),
    gcp: {
      bare_metal: {
        instance_name: instanceName,
        machine_type: machineType,
        lun_id: lunId,
        network_name: networkName,
        event_type: eventType,
        status,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(5000, isErr ? 900_000 : 120_000),
    },
    message,
  };
}

export function generateSpotVmsLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const instance = randGceInstance();
  const zone = randZone(region);
  const machineType = rand(["n2-standard-4", "c2-standard-8", "n2d-standard-16"]);
  const preemptionReason = isErr
    ? rand([
        "SPOT_PREEMPTED",
        "INSTANCE_TERMINATED_BY_SERVICE",
        "MAINTENANCE_EVENT",
        "RESOURCE_UNAVAILABLE",
      ])
    : null;
  const uptimeSeconds = isErr ? randInt(30, 3600) : randInt(3600, 864_000);
  const spotPrice = Number((randInt(5, 120) / 10000).toFixed(4));
  const severity = randSeverity(isErr);
  const message = isErr
    ? `compute.googleapis.com: Spot VM "${instance.name}" (${zone}, ${machineType}) preempted: ${preemptionReason}; uptime ${uptimeSeconds}s`
    : `compute.googleapis.com: Spot VM "${instance.name}" running in ${zone} on ${machineType}; uptime ${uptimeSeconds}s, effective price $${spotPrice}/hr`;

  return {
    "@timestamp": ts,
    severity,
    labels: { instance_id: instance.id, zone, preemptible: "true" },
    insertId: insertId(),
    resource: {
      type: "gce_instance",
      labels: { project_id: project.id, instance_id: instance.id, zone },
    },
    cloud: gcpCloud(region, project, "compute.googleapis.com"),
    gcp: {
      spot_vms: {
        instance_name: instance.name,
        instance_id: instance.id,
        zone,
        machine_type: machineType,
        ...(preemptionReason ? { preemption_reason: preemptionReason } : {}),
        uptime_seconds: uptimeSeconds,
        spot_price: spotPrice,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(1000, uptimeSeconds * 1000),
    },
    message,
  };
}

export function generateCloudTpuLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const nodeName = `tpu-node-${randId(8).toLowerCase()}`;
  const tpuType = rand(["v2-8", "v3-8", "v4-8", "v5litepod-1"] as const);
  const framework = rand(["tensorflow", "jax", "pytorch"] as const);
  const status = isErr
    ? rand(["ERROR", "FAILED"] as const)
    : rand(["READY", "CREATING", "RUNNING"] as const);
  const acceleratorCount = randInt(1, 8);
  const utilizationPct = isErr ? randFloat(0.05, 0.35) : randFloat(0.4, 0.98);
  const healthState = isErr
    ? rand(["UNHEALTHY", "DEGRADED"] as const)
    : rand(["HEALTHY", "OK"] as const);
  const severity = randSeverity(isErr);
  const zone = randZone(region);
  const message = isErr
    ? `tpu.googleapis.com Node "${nodeName}" (${tpuType}, ${framework}) ${status} in ${zone}: chip utilization ${(utilizationPct * 100).toFixed(1)}% — ${healthState}`
    : `tpu.googleapis.com Node "${nodeName}" ${tpuType} in ${zone} running ${framework}; accelerators=${acceleratorCount} util=${(utilizationPct * 100).toFixed(1)}%`;

  return {
    "@timestamp": ts,
    severity,
    labels: { node_name: nodeName, zone, tpu_type: tpuType },
    insertId: insertId(),
    resource: {
      type: "cloud_tpu",
      labels: { project_id: project.id, zone, node_name: nodeName },
    },
    cloud: gcpCloud(region, project, "cloud-tpu"),
    gcp: {
      cloud_tpu: {
        node_name: nodeName,
        tpu_type: tpuType,
        framework,
        status,
        accelerator_count: acceleratorCount,
        utilization_pct: Math.round(utilizationPct * 1000) / 10,
        health_state: healthState,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(2000, isErr ? 600_000 : 120_000),
    },
    message,
  };
}

export function generateCloudWorkstationsLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const clusterName = `ws-cluster-${randId(5).toLowerCase()}`;
  const configName = `config-${rand(["dev", "data", "gpu"])}-${randId(4).toLowerCase()}`;
  const workstationName = `ws-${rand(["alice", "bob", "build"])}-${randId(4).toLowerCase()}`;
  const action = isErr
    ? rand(["STOP", "DELETE"] as const)
    : rand(["START", "STOP", "CREATE", "DELETE"] as const);
  const machineType = rand(["e2-standard-4", "n1-standard-8", "n1-highgpu-4"]);
  const idleTimeoutMin = randInt(30, 480);
  const userEmail = rand([
    `dev@${project.id.split("-")[0]}.example.com`,
    `engineer@${project.id}.example.com`,
  ]);
  const severity = randSeverity(isErr);
  const message = isErr
    ? `workstations.googleapis.com: ${action} failed for workstation "${workstationName}" (cluster ${clusterName}): ${rand(["Quota exceeded", "Config invalid", "Policy denied"])}`
    : `workstations.googleapis.com: ${action} workstation "${workstationName}" on cluster "${clusterName}" (config ${configName}, ${machineType}, idle timeout ${idleTimeoutMin}m, user ${userEmail})`;

  return {
    "@timestamp": ts,
    severity,
    labels: {
      cluster_name: clusterName,
      workstation_name: workstationName,
      user: userEmail.split("@")[0],
    },
    insertId: insertId(),
    resource: {
      type: "workstations.googleapis.com/Workstation",
      labels: { project_id: project.id, location: region, cluster: clusterName },
    },
    cloud: gcpCloud(region, project, "cloud-workstations"),
    gcp: {
      cloud_workstations: {
        cluster_name: clusterName,
        config_name: configName,
        workstation_name: workstationName,
        action,
        machine_type: machineType,
        idle_timeout_min: idleTimeoutMin,
        user_email: userEmail,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(1000, isErr ? 180_000 : 45_000),
    },
    message,
  };
}

export function generateShieldedVmsLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const instance = randGceInstance();
  const zone = randZone(region);
  const eventType = rand([
    "INTEGRITY_VIOLATION",
    "SECURE_BOOT_FAILED",
    "VTPM_ATTESTATION",
    "POLICY_EVALUATION",
  ] as const);
  const integrityStatus = isErr
    ? rand(["VIOLATED", "UNKNOWN"] as const)
    : rand(["PASS", "TRUSTED", "VERIFIED"] as const);
  const policyUpdate = isErr
    ? rand(["UEFI_VARS_MODIFIED", "BOOT_POLICY_MISMATCH"] as const)
    : rand(["NONE", "REFRESHED", "COMPLIANT"] as const);
  const severity = isErr ? "ERROR" : "INFO";
  const message = isErr
    ? `compute.googleapis.com/shieldedvm: instance ${instance.name} (${zone}) ${eventType} integrity=${integrityStatus} policy=${policyUpdate}`
    : `compute.googleapis.com/shieldedvm: instance ${instance.name} (${zone}) ${eventType} OK (${integrityStatus}, policy ${policyUpdate})`;

  return {
    "@timestamp": ts,
    severity,
    labels: { instance_name: instance.name, instance_id: instance.id, zone },
    insertId: insertId(),
    resource: {
      type: "gce_instance",
      labels: { project_id: project.id, instance_id: instance.id, zone },
    },
    cloud: gcpCloud(region, project, "shielded-vms"),
    gcp: {
      shielded_vms: {
        instance_name: instance.name,
        event_type: eventType,
        integrity_status: integrityStatus,
        policy_update: policyUpdate,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(500, isErr ? 30_000 : 5000),
    },
    message,
  };
}

export function generateConfidentialComputingLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const instance = randGceInstance();
  const zone = randZone(region);
  const technology = rand(["AMD_SEV", "AMD_SEV_SNP", "INTEL_TDX"] as const);
  const attestationStatus = isErr
    ? rand(["FAILED", "REJECTED"] as const)
    : rand(["VERIFIED", "PENDING", "ACCEPTED"] as const);
  const launchMeasurement = `0x${Array.from({ length: 16 }, () => randInt(0, 15).toString(16)).join("")}`;
  const guestPolicy = rand(["STRICT_LAUNCH", "FLEXIBLE_MEASUREMENT", "CUSTOM_POLICY"]);
  const severity = isErr ? "ERROR" : "NOTICE";
  const message = isErr
    ? `confidentialcomputing.googleapis.com: ${instance.name} (${zone}, ${technology}) attestation ${attestationStatus}: measurement mismatch`
    : `confidentialcomputing.googleapis.com: ${instance.name} (${zone}) ${technology} attestation ${attestationStatus} (${guestPolicy})`;

  return {
    "@timestamp": ts,
    severity,
    labels: { instance_name: instance.name, zone, technology },
    insertId: insertId(),
    resource: {
      type: "gce_instance",
      labels: { project_id: project.id, instance_id: instance.id, zone },
    },
    cloud: gcpCloud(region, project, "confidential-computing"),
    gcp: {
      confidential_computing: {
        instance_name: instance.name,
        technology,
        attestation_status: attestationStatus,
        launch_measurement: launchMeasurement,
        guest_policy: guestPolicy,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(800, isErr ? 120_000 : 25_000),
    },
    message,
  };
}

export function generateMigrateToVmsLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const sourceName = `src-${rand(["vmware-dc1", "aws-ec2-pool", "azure-rg", "rack-42"])}-${randId(4).toLowerCase()}`;
  const sourceType = rand(["VMWARE", "AWS", "AZURE", "PHYSICAL"] as const);
  const targetInstance = `mig-${randGceInstance().name}`;
  const migrationStatus = isErr
    ? rand(["REPLICATING", "IDLE"] as const)
    : rand(["IDLE", "REPLICATING", "CUTOVER", "COMPLETED"] as const);
  const replicationCycle = randInt(1, isErr ? 3 : 500);
  const dataReplicatedGb = isErr ? randFloat(0.5, 20) : randFloat(50, 8000);
  const severity = randSeverity(isErr);
  const message = isErr
    ? `vmmigration.googleapis.com Source "${sourceName}" (${sourceType}): replication stalled — status ${migrationStatus}, cycle ${replicationCycle}`
    : `vmmigration.googleapis.com Source "${sourceName}" -> target "${targetInstance}" status ${migrationStatus}, cycle ${replicationCycle}, ${dataReplicatedGb.toFixed(1)} GB replicated`;

  return {
    "@timestamp": ts,
    severity,
    labels: { source_name: sourceName, source_type: sourceType, migration_status: migrationStatus },
    insertId: insertId(),
    resource: {
      type: "vmmigration.googleapis.com/Source",
      labels: { project_id: project.id, location: region, source: sourceName },
    },
    cloud: gcpCloud(region, project, "migrate-to-vms"),
    gcp: {
      migrate_to_vms: {
        source_name: sourceName,
        source_type: sourceType,
        target_instance: targetInstance,
        migration_status: migrationStatus,
        replication_cycle: replicationCycle,
        data_replicated_gb: Math.round(dataReplicatedGb * 10) / 10,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(5000, isErr ? 3_600_000 : 900_000),
    },
    message,
  };
}
