import {
  type EcsDocument,
  rand,
  randInt,
  randFloat,
  randId,
  azureCloud,
  makeAzureSetup,
  randUUID,
  randIp,
  USER_AGENTS,
} from "./helpers.js";

const VM_SIZES = [
  "Standard_D2s_v5",
  "Standard_E4s_v5",
  "Standard_B2ms",
  "Standard_F4s_v2",
] as const;

function azureDiagnosticTime(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) {
    const base = ts.replace(/Z$/i, "").split(".")[0] ?? ts;
    return `${base}.0000000Z`;
  }
  const iso = d.toISOString();
  const m = /^(.+)T(.+)\.(\d+)Z$/.exec(iso);
  if (!m) return `${iso.slice(0, 19)}.0000000Z`;
  const frac = m[3]!.padEnd(7, "0").slice(0, 7);
  return `${m[1]}T${m[2]}.${frac}Z`;
}

function armVm(subId: string, rg: string, vm: string): string {
  return `/subscriptions/${subId}/resourceGroups/${rg}/providers/Microsoft.Compute/virtualMachines/${vm}`;
}

function armVmss(subId: string, rg: string, name: string): string {
  return `/subscriptions/${subId}/resourceGroups/${rg}/providers/Microsoft.Compute/virtualMachineScaleSets/${name}`;
}

function armBatch(subId: string, rg: string, acct: string): string {
  return `/subscriptions/${subId}/resourceGroups/${rg}/providers/Microsoft.Batch/batchAccounts/${acct}`;
}

function armAks(subId: string, rg: string, cluster: string): string {
  return `/subscriptions/${subId}/resourceGroups/${rg}/providers/Microsoft.ContainerService/managedClusters/${cluster}`;
}

export function generateVirtualMachinesLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const vmName = `vm-${rand(["web", "app", "db", "batch"])}-${randId(4).toLowerCase()}`;
  const resourceId = armVm(subscription.id, resourceGroup, vmName);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["activity", "guest_perf", "guest_event", "boot", "extension"] as const);

  if (variant === "activity") {
    const op = isErr
      ? rand([
          "Microsoft.Compute/virtualMachines/powerOff/action",
          "Microsoft.Compute/virtualMachines/delete",
        ])
      : rand([
          "Microsoft.Compute/virtualMachines/start/action",
          "Microsoft.Compute/virtualMachines/write",
          "Microsoft.Compute/virtualMachines/redeploy/action",
        ]);
    const status = isErr
      ? rand(["PowerState/unknown", "VMExtensionProvisioningError", "Conflict"])
      : "Succeeded";
    const props = {
      entity: resourceId,
      eventCategory: "Administrative",
      status: isErr ? "Failed" : "Succeeded",
      subStatus: isErr ? status : "",
      operationId: randUUID(),
      httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "POST" },
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: op,
      category: "Administrative",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? rand(["409", "500"]) : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Compute/virtualMachines"),
      azure: {
        virtual_machines: {
          vm_name: vmName,
          resource_group: resourceGroup,
          operation: op.split("/").pop()?.replace("/action", "") ?? op,
          vm_size: rand(VM_SIZES),
          status,
          correlation_id: correlationId,
          category: "Administrative",
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, isErr ? 6e9 : 3e9) },
      message: isErr
        ? `Activity log: ${op} failed on ${vmName} (${status})`
        : `Activity log: ${op} succeeded on ${vmName}`,
    };
  }

  if (variant === "guest_perf") {
    const counter = rand([
      "\\Processor(_Total)\\% Processor Time",
      "\\Memory\\Available MBytes",
      "\\PhysicalDisk(_Total)\\Disk Reads/sec",
    ]);
    const val =
      isErr && counter.includes("Memory")
        ? randInt(40, 180)
        : counter.includes("Processor")
          ? randFloat(5, isErr ? 99 : 72)
          : randInt(100, 9000);
    const props = {
      CounterName: counter,
      CounterValue: val,
      Instance: "_Total",
      Computer: vmName,
      ResourceId: resourceId,
      CollectionTime: time,
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Compute/virtualMachines/metrics/write",
      category: "PerformanceCounters",
      resultType: "Success",
      resultSignature: "0",
      callerIpAddress: "127.0.0.1",
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Compute/virtualMachines"),
      azure: {
        virtual_machines: {
          vm_name: vmName,
          resource_group: resourceGroup,
          operation: "GuestPerf",
          vm_size: rand(VM_SIZES),
          status: isErr ? "Degraded" : "Collecting",
          correlation_id: correlationId,
          category: "PerformanceCounters",
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 3e9) },
      message: `Guest metrics ${counter}=${val} on ${vmName}`,
    };
  }

  if (variant === "guest_event") {
    const channel = rand(["Application", "System", "Security"]);
    const evtId =
      channel === "Security"
        ? rand([4624, 4625, 4672, 4768])
        : channel === "System"
          ? rand([6005, 6006, 1074])
          : rand([1000, 1001, 1026]);
    const props = {
      Channel: channel,
      EventId: evtId,
      Level: isErr ? "Error" : "Information",
      ProviderName:
        channel === "Security" ? "Microsoft-Windows-Security-Auditing" : "Application Error",
      Message: isErr
        ? `Faulting application name: svchost.exe, version 10.0.${randInt(19041, 22631)}.${randInt(1000, 4500)}`
        : `The Windows Modules Installer service entered the running state.`,
      Computer: vmName,
      Task: randInt(0, 255),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Compute/virtualMachines/eventLogs/write",
      category: "WindowsEvent",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(evtId),
      callerIpAddress: "127.0.0.1",
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Compute/virtualMachines"),
      azure: {
        virtual_machines: {
          vm_name: vmName,
          resource_group: resourceGroup,
          operation: "GuestEvent",
          vm_size: rand(VM_SIZES),
          status: channel,
          correlation_id: correlationId,
          category: "WindowsEvent",
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 3e9) },
      message: `[${channel}] EventID=${evtId} on ${vmName}`,
    };
  }

  if (variant === "boot") {
    const lines = isErr
      ? [
          `[    0.000000] Linux version 5.15.0-${randInt(1000, 1080)}-azure (buildd@lcy02-amd64-0${randInt(1, 9)})`,
          `[    2.${randInt(1, 9)}] ACPI: Interpreter enabled`,
          `[   12.${randInt(10, 99)}] cloud-init[${randInt(400, 999)}]: Failed to fetch metadata: HTTPConnectionPool timeout`,
        ]
      : [
          `[    0.000000] Linux version 5.15.0-${randInt(1000, 1080)}-azure`,
          `[    3.${randInt(1, 9)}] systemd[1]: Started Serial Getty on ttyS0.`,
          `[   18.${randInt(10, 99)}] cloud-init[${randInt(400, 999)}]: SSH host keys generated.`,
        ];
    const props = {
      SerialOutput: lines.join("\n"),
      BootDiagnosticsStorageUri: `https://${randId(6)}bootdiag.blob.core.windows.net/`,
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Compute/virtualMachines/retrieveBootDiagnosticsData/action",
      category: "SerialConsole",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "504" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Compute/virtualMachines"),
      azure: {
        virtual_machines: {
          vm_name: vmName,
          resource_group: resourceGroup,
          operation: "BootDiagnostics",
          vm_size: rand(VM_SIZES),
          status: isErr ? "BootDiagnosticsFetchFailed" : "Ready",
          correlation_id: correlationId,
          category: "SerialConsole",
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 3e9) },
      message: `Boot diagnostics serial snippet for ${vmName}`,
    };
  }

  const extName = rand(["AzureMonitorWindowsAgent", "CustomScript", "DependencyAgentWindows"]);
  const props = {
    ExtensionName: extName,
    ExtensionType: `Microsoft.${rand(["Azure", "Compute"])}.${extName}`,
    ProvisioningState: isErr ? "Failed" : "Succeeded",
    StatusMessage: isErr
      ? `VM has reported failure as seen in logs: 'Enable failed with exit code ${randInt(1, 255)}'`
      : "Extension handler provisioning succeeded",
    HandlerExecutionStage: isErr ? "Enable" : "Commit",
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.Compute/virtualMachines/extensions/write",
    category: "VMExtensionProvisioning",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "500" : "200",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.Compute/virtualMachines"),
    azure: {
      virtual_machines: {
        vm_name: vmName,
        resource_group: resourceGroup,
        operation: extName,
        vm_size: rand(VM_SIZES),
        status: props.ProvisioningState as string,
        correlation_id: correlationId,
        category: "VMExtensionProvisioning",
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 3e9) },
    message: `VM extension ${extName} on ${vmName}: ${props.StatusMessage}`,
  };
}

export function generateVmScaleSetsLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const name = `vmss-${randId(6).toLowerCase()}`;
  const resourceId = armVmss(subscription.id, resourceGroup, name);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["activity", "rolling", "instance", "capacity"] as const);
  const capacity = isErr ? randInt(2, 8) : randInt(8, 80);

  if (variant === "activity") {
    const op = isErr
      ? "Microsoft.Compute/virtualMachineScaleSets/write"
      : rand([
          "Microsoft.Compute/virtualMachineScaleSets/virtualMachines/delete",
          "Microsoft.Compute/virtualMachineScaleSets/start/action",
          "Microsoft.Compute/virtualMachineScaleSets/manualupgrade/action",
        ]);
    const props = {
      sku: { capacity, name: rand(VM_SIZES), tier: "Standard" },
      eventCategory: "Administrative",
      status: isErr ? "Failed" : "Succeeded",
      httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: op,
      category: "Administrative",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "409" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Compute/virtualMachineScaleSets"),
      azure: {
        vm_scale_sets: {
          name,
          resource_group: resourceGroup,
          operation: op,
          capacity,
          correlation_id: correlationId,
          category: "Administrative",
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(2e8, 8e9) },
      message: isErr
        ? `VMSS ${name}: activity failed during scale operation`
        : `VMSS ${name}: ${op} completed`,
    };
  }

  if (variant === "rolling") {
    const op = isErr ? "RollingUpgradeFailed" : "RollingUpgradeCompleted";
    const props = {
      RollingUpgradePolicy: { maxBatchInstancePercent: 20, maxUnhealthyInstancePercent: 20 },
      FailedInstances: isErr ? [`${name}_4`, `${name}_7`] : [],
      UpgradeMode: "Rolling",
      Message: isErr
        ? "Health probe failed on backend port 443 for instances 4,7"
        : "All instances passed health checks",
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Compute/virtualMachineScaleSets/rollingUpgrade/action",
      category: "AutoscaleEvaluations",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "1" : "0",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Compute/virtualMachineScaleSets"),
      azure: {
        vm_scale_sets: {
          name,
          resource_group: resourceGroup,
          operation: op,
          capacity,
          correlation_id: correlationId,
          category: "AutoscaleEvaluations",
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(2e8, 8e9) },
      message: isErr
        ? `VMSS ${name}: rolling upgrade failed`
        : `VMSS ${name}: rolling upgrade completed`,
    };
  }

  if (variant === "instance") {
    const inst = `${name}_${randInt(0, capacity - 1)}`;
    const props = {
      instanceId: inst,
      event: isErr ? "Unhealthy" : "HealthyStateChange",
      healthStatus: isErr ? "Unhealthy" : "Healthy",
      healthProbe: "/health",
      details: isErr
        ? "TCP connect to 10.0.2.12:8080 timed out"
        : "HTTP 200 from http://127.0.0.1:8080/health",
    };
    return {
      "@timestamp": ts,
      time,
      resourceId: `${resourceId}/virtualMachines/${inst}`,
      operationName: "Microsoft.Compute/virtualMachineScaleSets/virtualMachines/read",
      category: "ResourceHealth",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "503" : "200",
      callerIpAddress: "169.254.169.254",
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Compute/virtualMachineScaleSets"),
      azure: {
        vm_scale_sets: {
          name,
          resource_group: resourceGroup,
          operation: "InstanceHealth",
          capacity,
          correlation_id: correlationId,
          category: "ResourceHealth",
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(2e8, 8e9) },
      message: `VMSS instance ${inst}: ${props.healthStatus}`,
    };
  }

  const props = {
    ObservedCapacity: capacity,
    DesiredCapacity: capacity + (isErr ? 0 : randInt(-2, 4)),
    Profile: "default",
    Reason: isErr ? "Scaling blocked by policy" : "CPU > 70% for 5m",
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.Insights/autoscaleSettings/evaluate",
    category: "AutoscaleScaleActions",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "0" : "1",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.Compute/virtualMachineScaleSets"),
    azure: {
      vm_scale_sets: {
        name,
        resource_group: resourceGroup,
        operation: "ScaleOut",
        capacity,
        correlation_id: correlationId,
        category: "AutoscaleScaleActions",
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(2e8, 8e9) },
    message: `VMSS ${name}: autoscale evaluation ${isErr ? "blocked" : "triggered"}`,
  };
}

export function generateBatchLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const acct = `batch${randId(5).toLowerCase()}`;
  const pool = `pool-${randId(4).toLowerCase()}`;
  const task = `task-${randId(8).toLowerCase()}`;
  const job = `job-${randId(6).toLowerCase()}`;
  const resourceId = armBatch(subscription.id, resourceGroup, acct);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const exitCode = isErr ? randInt(-1, 255) : 0;
  const props: Record<string, unknown> = {
    PoolId: pool,
    JobId: job,
    TaskId: task,
    TaskState: isErr ? "failed" : "completed",
    ExitCode: exitCode,
    NodeId: `tvmps_${randId(24).toLowerCase()}`,
    Result: isErr ? "Failure" : "Success",
    AffinityId: randUUID(),
  };
  if (isErr) {
    props.SchedulingError = {
      category: "UserError",
      code: "TaskEnded",
      message: "The task process exited with code 1",
    };
  }
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: isErr
      ? "Microsoft.Batch/batchAccounts/tasks/fail"
      : "Microsoft.Batch/batchAccounts/tasks/complete",
    category: "ServiceLog",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: String(exitCode),
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.Batch/batchAccounts"),
    azure: {
      batch: {
        pool_id: pool,
        task_id: task,
        batch_account: acct,
        resource_group: resourceGroup,
        job_state: isErr ? "disabled" : "active",
        exit_code: exitCode,
        category: "ServiceLog",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(1e9, isErr ? 7.2e12 : 3.6e11),
    },
    message: isErr
      ? `Batch account ${acct}: task ${task} failed on pool ${pool} (exit ${exitCode})`
      : `Batch account ${acct}: task ${task} completed on ${pool}`,
  };
}

export function generateAksLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const cluster = `aks-${rand(["prod", "stg", "dev"])}-${randId(4).toLowerCase()}`;
  const resourceId = armAks(subscription.id, resourceGroup, cluster);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const nodePool = rand(["system", "user", "gpu"]);
  const ns = rand(["kube-system", "production", "staging"]);
  const pod = `${rand(["api", "worker"])}-${randId(5).toLowerCase()}`;
  const variant = rand(["audit", "container", "event", "policy"] as const);

  if (variant === "audit") {
    const verb = rand(["create", "update", "patch", "delete", "get", "list"] as const);
    const resource = rand(["deployments", "pods", "secrets", "configmaps", "services"]);
    const code = isErr ? rand([401, 403, 422, 500]) : rand([200, 201, 204]);
    const auditFailed = code >= 400;
    const user = rand([
      `system:serviceaccount:${ns}:default`,
      "masterclient",
      "aks-admin",
      `system:node:${cluster}-vmss00000${randInt(0, 9)}`,
    ]);
    const props = {
      verb,
      auditID: randUUID(),
      level: isErr ? "Metadata" : "Request",
      stage: "ResponseComplete",
      requestURI: `/api/v1/namespaces/${ns}/${resource}/${pod}`,
      user: { username: user, uid: randUUID(), groups: ["system:authenticated"] },
      objectRef: { resource, namespace: ns, name: pod, apiGroup: "apps", apiVersion: "v1" },
      responseStatus: {
        code,
        status: code < 400 ? "Success" : "Failure",
        reason: isErr ? "Forbidden" : "",
      },
      sourceIPs: [callerIp],
      userAgent: rand(USER_AGENTS),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.ContainerService/managedClusters/diagnosticLogs/read",
      category: "kube-audit",
      resultType: auditFailed ? "Failure" : "Success",
      resultSignature: String(code),
      callerIpAddress: callerIp,
      correlationId,
      level: auditFailed ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.ContainerService/managedClusters"),
      azure: {
        kubernetes: {
          cluster_name: cluster,
          resource_group: resourceGroup,
          node_pool: nodePool,
          reason: auditFailed ? "Forbidden" : "AuditOK",
          namespace: ns,
          pod,
          category: "kube-audit",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        outcome: auditFailed ? "failure" : "success",
        duration: randInt(5e7, isErr ? 3e10 : 2e9),
      },
      message: `kube-audit ${verb} ${resource}/${pod} ${code} user=${user}`,
    };
  }

  if (variant === "container") {
    const stream = isErr ? "stderr" : "stdout";
    const logLine = isErr
      ? `Error: connect ECONNREFUSED 127.0.0.1:${randInt(3000, 9000)}\n    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1555:16)`
      : `{"level":"info","msg":"request completed","path":"/api/v1/orders","status":200,"latency_ms":${randInt(4, 120)}}`;
    const props = {
      ContainerName: pod,
      PodName: pod,
      Namespace: ns,
      LogEntry: logLine,
      Stream: stream,
      ContainerID: `docker://${randId(64)}`,
      Image: rand([
        "mcr.microsoft.com/oss/nginx/nginx:1.25",
        `ghcr.io/contoso/api:${rand(["1.4.2", "2.0.0-rc1"])}`,
      ]),
      RestartCount: isErr ? randInt(3, 18) : 0,
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.ContainerService/managedClusters/containerLogs/read",
      category: "ContainerInsights",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: "0",
      callerIpAddress: "169.254.169.254",
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.ContainerService/managedClusters"),
      azure: {
        kubernetes: {
          cluster_name: cluster,
          resource_group: resourceGroup,
          node_pool: nodePool,
          reason: isErr ? rand(["CrashLoopBackOff", "OOMKilled", "Error"]) : "Running",
          namespace: ns,
          pod,
          category: "ContainerInsights",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e7, isErr ? 3e10 : 2e9) },
      message: `container ${stream} ${ns}/${pod}: ${logLine.slice(0, 120)}`,
    };
  }

  if (variant === "event") {
    const kind = rand(["Node", "Pod", "Cluster"] as const);
    const reason = isErr
      ? rand(["FailedScheduling", "ImagePullBackOff", "NodeNotReady", "Evicted"])
      : rand(["ScaledUpGroup", "NodeReady", "SuccessfulAttachVolume", "UpgradeComplete"]);
    const props = {
      type: isErr ? "Warning" : "Normal",
      reason,
      message:
        kind === "Node"
          ? isErr
            ? `Node ${cluster}-vmss00000${randInt(0, 9)} is not ready: PLEG is not healthy`
            : `Node ${cluster}-vmss00000${randInt(0, 9)} status is now: NodeReady`
          : kind === "Pod"
            ? isErr
              ? `Failed to pull image "${rand(["bad.registry/api", "contoso.azurecr.io/api"])}": rpc error: code = NotFound`
              : `Started container ${pod} in namespace ${ns}`
            : `Cluster autoscaler scaled node group ${nodePool} from ${randInt(2, 6)} to ${randInt(7, 18)}`,
      involvedObject: {
        kind,
        name: kind === "Node" ? `${cluster}-vmss00000${randInt(0, 9)}` : pod,
        namespace: kind === "Pod" ? ns : "",
      },
      firstTimestamp: time,
      lastTimestamp: time,
      count: randInt(1, isErr ? 120 : 8),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.ContainerService/managedClusters/events/write",
      category: "kube-events",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "1" : "0",
      callerIpAddress: "127.0.0.1",
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.ContainerService/managedClusters"),
      azure: {
        kubernetes: {
          cluster_name: cluster,
          resource_group: resourceGroup,
          node_pool: nodePool,
          reason,
          namespace: ns,
          pod,
          category: "kube-events",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e7, isErr ? 3e10 : 2e9) },
      message: `cluster event ${reason} on ${cluster}`,
    };
  }

  const policy = rand([
    "kubernetes-service-loadbalancer-no-publicips",
    "container-no-privileged",
    "aks-enforce-labels",
  ]);
  const props = {
    policyAssignmentId: `/subscriptions/${subscription.id}/providers/Microsoft.Authorization/policyAssignments/${randId(8)}`,
    policyDefinitionName: policy,
    complianceState: isErr ? "NonCompliant" : "Compliant",
    resourceId: `${resourceId}/providers/Microsoft.Network/loadBalancers/${rand(["kubernetes", "internal"])}`,
    denialReason: isErr ? "LoadBalancer service must not allocate a public IP" : "",
    deploymentMode: "Incremental",
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: isErr
      ? "Microsoft.PolicyInsights/policyEvents/write"
      : "Microsoft.PolicyInsights/policyStates/read",
    category: "Guard",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "Deny" : "Audit",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.ContainerService/managedClusters"),
    azure: {
      kubernetes: {
        cluster_name: cluster,
        resource_group: resourceGroup,
        node_pool: nodePool,
        reason: isErr ? "PolicyViolation" : "Compliant",
        namespace: ns,
        pod,
        category: "Guard",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(5e7, isErr ? 3e10 : 2e9) },
    message: isErr
      ? `Azure Policy deny on ${cluster}: ${policy}`
      : `Azure Policy audit passed for ${cluster}`,
  };
}
