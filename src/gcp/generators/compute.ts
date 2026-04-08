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

const GCE_EVENTS = ["INSERT", "DELETE", "START", "STOP", "RESET", "SUSPEND"] as const;

export function generateComputeEngineLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const instance = randGceInstance();
  const zone = randZone(region);
  const machineType = rand(GCE_MACHINE_TYPES);
  const eventType = rand(GCE_EVENTS);
  const status = isErr
    ? rand(["ERROR", "FAILED", "TERMINATED"])
    : rand(["RUNNING", "STAGING", "DONE", "OK"]);
  const networkTags = Array.from({ length: randInt(1, 4) }, () => randNetworkTag());
  const diskSizeGb = randInt(20, 2000);
  const message = isErr
    ? `Compute Engine ${eventType} on ${instance.name} (${zone}, ${machineType}) failed: ${rand(["Quota exceeded", "Invalid machine type", "Disk attach error", "Zone resource exhausted"])}`
    : `Compute Engine ${eventType} completed for ${instance.name} in ${zone} (${machineType}, ${diskSizeGb}GB disk)`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "compute.googleapis.com"),
    gcp: {
      compute_engine: {
        instance_name: instance.name,
        instance_id: instance.id,
        zone,
        machine_type: machineType,
        event_type: eventType,
        status,
        network_tags: networkTags,
        disk_size_gb: diskSizeGb,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(500, isErr ? 180_000 : 45_000),
    },
    message,
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
  const message = isErr
    ? `Batch job ${jobId} task ${taskGroup}[${taskIndex}] ${status.toLowerCase()}: ${rand(["Preemption", "OOM", "Startup script failed", "Image pull error"])}`
    : `Batch job ${jobId} task ${taskGroup}[${taskIndex}] is ${status} on ${machineType} (${provisioningModel})`;

  return {
    "@timestamp": ts,
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
  const message = isErr
    ? `Sole-tenant node ${nodeId} (${nodeType}) in group ${nodeGroup} reported ${status}; ${vmsCount} VMs affected`
    : `Sole-tenant node group ${nodeGroup}: node ${nodeId} ${nodeType} healthy (${vmsCount} VMs, CPU overcommit ${cpuOvercommitRatio}x)`;

  return {
    "@timestamp": ts,
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
  const message = isErr
    ? `VMware Engine ${privateCloud}/${clusterName}: ${eventType} — ${status} (${nodeType})`
    : `VMware Engine ${privateCloud}/${clusterName}: ${eventType} (${status}, nodes ${nodeType})`;

  return {
    "@timestamp": ts,
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
  const message = isErr
    ? `Bare Metal ${instanceName}: ${eventType} on ${networkName} / ${lunId} (${machineType}) — ${status}`
    : `Bare Metal ${instanceName} (${machineType}): ${eventType}; LUN ${lunId} on ${networkName} (${status})`;

  return {
    "@timestamp": ts,
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
  const message = isErr
    ? `Spot VM ${instance.name} (${zone}, ${machineType}) preempted: ${preemptionReason}; uptime ${uptimeSeconds}s`
    : `Spot VM ${instance.name} running in ${zone} on ${machineType}; uptime ${uptimeSeconds}s, price $${spotPrice}/hr`;

  return {
    "@timestamp": ts,
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
  const message = isErr
    ? `Cloud TPU ${nodeName} (${tpuType}, ${framework}) ${status}: utilization ${(utilizationPct * 100).toFixed(1)}% — ${healthState}`
    : `Cloud TPU ${nodeName} ${tpuType} running ${framework} accelerators=${acceleratorCount} util=${(utilizationPct * 100).toFixed(1)}%`;

  return {
    "@timestamp": ts,
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
  const message = isErr
    ? `Cloud Workstations ${action} failed for ${workstationName} (${clusterName}): ${rand(["Quota exceeded", "Config invalid", "Policy denied"])}`
    : `Cloud Workstations ${action} ${workstationName} on ${clusterName} (${configName}, ${machineType}, idle ${idleTimeoutMin}m)`;

  return {
    "@timestamp": ts,
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
  const message = isErr
    ? `Shielded VM ${instance.name}: ${eventType} integrity=${integrityStatus} policy=${policyUpdate}`
    : `Shielded VM ${instance.name}: ${eventType} OK (${integrityStatus}, policy ${policyUpdate})`;

  return {
    "@timestamp": ts,
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
  const technology = rand(["AMD_SEV", "AMD_SEV_SNP", "INTEL_TDX"] as const);
  const attestationStatus = isErr
    ? rand(["FAILED", "REJECTED"] as const)
    : rand(["VERIFIED", "PENDING", "ACCEPTED"] as const);
  const launchMeasurement = `0x${Array.from({ length: 16 }, () => randInt(0, 15).toString(16)).join("")}`;
  const guestPolicy = rand(["STRICT_LAUNCH", "FLEXIBLE_MEASUREMENT", "CUSTOM_POLICY"]);
  const message = isErr
    ? `Confidential Computing ${instance.name} (${technology}) attestation ${attestationStatus}: measurement mismatch`
    : `Confidential Computing ${instance.name} ${technology} attestation ${attestationStatus} (${guestPolicy})`;

  return {
    "@timestamp": ts,
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
  const message = isErr
    ? `Migrate to VMs ${sourceName} (${sourceType}) stalled: status ${migrationStatus}, cycle ${replicationCycle}`
    : `Migrate to VMs ${sourceName} -> ${targetInstance} ${migrationStatus} cycle ${replicationCycle} (${dataReplicatedGb.toFixed(1)} GB replicated)`;

  return {
    "@timestamp": ts,
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
