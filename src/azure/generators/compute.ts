import {
  type EcsDocument,
  rand,
  randInt,
  randId,
  azureCloud,
  makeAzureSetup,
  randCorrelationId,
} from "./helpers.js";

const VM_SIZES = ["Standard_D2s_v5", "Standard_E4s_v5", "Standard_B2ms", "Standard_F4s_v2"] as const;

export function generateVirtualMachinesLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const vmName = `vm-${rand(["web", "app", "db", "batch"])}-${randId(4).toLowerCase()}`;
  const op = isErr ? rand(["PowerOff", "Deallocate", "Restart"]) : rand(["Start", "Create", "Redeploy"]);
  const status = isErr ? rand(["PowerState/unknown", "VMExtensionProvisioningError"]) : "Succeeded";
  return {
    "@timestamp": ts,
    cloud: azureCloud(region, subscription, "Microsoft.Compute/virtualMachines"),
    azure: {
      virtual_machines: {
        vm_name: vmName,
        resource_group: resourceGroup,
        operation: op,
        vm_size: rand(VM_SIZES),
        status,
        correlation_id: randCorrelationId(),
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, isErr ? 6e9 : 3e9) },
    message: isErr
      ? `VM ${vmName}: ${op} failed — ${status}`
      : `VM ${vmName}: ${op} completed in ${resourceGroup}`,
  };
}

export function generateVmScaleSetsLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const name = `vmss-${randId(6).toLowerCase()}`;
  const op = isErr ? "RollingUpgradeFailed" : rand(["ScaleOut", "ScaleIn", "Reimage", "Upgrade"]);
  return {
    "@timestamp": ts,
    cloud: azureCloud(region, subscription, "Microsoft.Compute/virtualMachineScaleSets"),
    azure: {
      vm_scale_sets: {
        name,
        resource_group: resourceGroup,
        operation: op,
        capacity: isErr ? randInt(2, 8) : randInt(8, 80),
        correlation_id: randCorrelationId(),
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(2e8, 8e9) },
    message: isErr
      ? `VMSS ${name}: rolling upgrade failed`
      : `VMSS ${name}: ${op} applied`,
  };
}

export function generateBatchLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const pool = `pool-${randId(4).toLowerCase()}`;
  const task = `task-${randId(8).toLowerCase()}`;
  return {
    "@timestamp": ts,
    cloud: azureCloud(region, subscription, "Microsoft.Batch/batchAccounts"),
    azure: {
      batch: {
        pool_id: pool,
        task_id: task,
        resource_group: resourceGroup,
        job_state: isErr ? "disabled" : "active",
        exit_code: isErr ? randInt(-1, 255) : 0,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e9, isErr ? 7.2e12 : 3.6e11) },
    message: isErr
      ? `Batch task ${task} on pool ${pool} failed`
      : `Batch task ${task} completed on ${pool}`,
  };
}

export function generateAksLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const cluster = `aks-${rand(["prod", "stg", "dev"])}-${randId(4).toLowerCase()}`;
  const nodePool = rand(["system", "user", "gpu"]);
  return {
    "@timestamp": ts,
    cloud: azureCloud(region, subscription, "Microsoft.ContainerService/managedClusters"),
    azure: {
      kubernetes: {
        cluster_name: cluster,
        resource_group: resourceGroup,
        node_pool: nodePool,
        reason: isErr ? rand(["ImagePullBackOff", "CrashLoopBackOff", "OOMKilled"]) : "NodeReady",
        namespace: rand(["kube-system", "production", "staging"]),
        pod: `${rand(["api", "worker"])}-${randId(5).toLowerCase()}`,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(5e7, isErr ? 3e10 : 2e9) },
    message: isErr
      ? `AKS ${cluster}: pod ${nodePool} issue`
      : `AKS ${cluster}: control plane health OK`,
  };
}
