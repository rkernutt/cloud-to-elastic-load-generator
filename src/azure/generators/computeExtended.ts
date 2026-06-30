import {
  type EcsDocument,
  rand,
  randInt,
  randFloat,
  randId,
  randHexId,
  randIp,
  azureCloud,
  makeAzureSetup,
  randUUID,
  USER_AGENTS,
  azureDiagnosticTime,
} from "./helpers.js";

type AzureTopError = { code: string; message: string; type: "azure" };

const COMPUTE_ERR_CODES = [
  "VMExtensionProvisioningError",
  "AllocationFailed",
  "OverconstrainedAllocationRequest",
  "OperationNotAllowed",
] as const;

function computeErrMessage(code: (typeof COMPUTE_ERR_CODES)[number]): string {
  switch (code) {
    case "VMExtensionProvisioningError":
      return "VM extension handler returned a failure; extension provisioning could not complete.";
    case "AllocationFailed":
      return "Allocation failed: insufficient capacity for the requested SKU in the selected zone.";
    case "OverconstrainedAllocationRequest":
      return "Overconstrained allocation request could not be satisfied with zone/PPG constraints.";
    default:
      return "Operation is not allowed on the resource while it is locked or updating.";
  }
}

/** Top-level Azure error + optional ARM statusMessage for control-plane style variants. */
function withComputeAzureErrors(
  isErr: boolean,
  variant: string,
  props: Record<string, unknown>
): { properties: Record<string, unknown>; error?: AzureTopError } {
  if (!isErr) return { properties: props };
  const code = rand([...COMPUTE_ERR_CODES]);
  const message = computeErrMessage(code);
  const armStatusEligible =
    variant === "admin" ||
    variant === "arm" ||
    variant === "lifecycle" ||
    variant === "member" ||
    variant === "update" ||
    variant.includes("provision");
  return {
    properties: armStatusEligible
      ? {
          ...props,
          statusMessage: {
            error: {
              code,
              message: `Long-running operation status: ${message}`,
            },
          },
        }
      : props,
    error: { code, message, type: "azure" },
  };
}

function armContainerApp(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.App/containerApps/${name}`;
}

function armContainerGroup(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.ContainerInstance/containerGroups/${name}`;
}

function armFleet(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.ContainerService/fleets/${name}`;
}

function armAcr(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.ContainerRegistry/registries/${name}`;
}

function armStaticSite(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Web/staticSites/${name}`;
}

function armSpring(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.AppPlatform/Spring/${name}`;
}

function armDedicatedHost(sub: string, rg: string, hg: string, host: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Compute/hostGroups/${hg}/hosts/${host}`;
}

function armCapacityReservation(sub: string, rg: string, group: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Compute/capacityReservationGroups/${group}/capacityReservations/${name}`;
}

function armPpg(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Compute/proximityPlacementGroups/${name}`;
}

function armGalleryImageVersion(
  sub: string,
  rg: string,
  gallery: string,
  image: string,
  version: string
): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Compute/galleries/${gallery}/images/${image}/versions/${version}`;
}

function armGallery(sub: string, rg: string, gallery: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Compute/galleries/${gallery}`;
}

function armVm(sub: string, rg: string, vm: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Compute/virtualMachines/${vm}`;
}

function armImageTemplate(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.VirtualMachineImages/imageTemplates/${name}`;
}

function armAvs(sub: string, rg: string, cloud: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.AVS/privateClouds/${cloud}`;
}

function armOracleExadata(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Oracle.Database/cloudExadataInfrastructures/${name}`;
}

function armSapVi(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Workloads/sapVirtualInstances/${name}`;
}

/** Azure Container Apps — revisions, scaling, ingress. */
export function generateContainerAppsLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const app = `ca-${rand(["api", "worker", "web"])}-${randId(5).toLowerCase()}`;
  const resourceId = armContainerApp(subscription.id, resourceGroup, app);
  const rev = `${app}--${randId(8).toLowerCase()}`;
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "admin",
    "console",
    "ingress",
    "scale",
    "revision",
    "dapr_sidecar",
  ] as const);

  if (variant === "admin") {
    const op = isErr
      ? rand([
          "Microsoft.App/containerApps/write",
          "Microsoft.App/containerApps/revisions/restart/action",
        ])
      : rand([
          "Microsoft.App/containerApps/write",
          "Microsoft.App/containerApps/delete",
          "Microsoft.App/containerApps/start/action",
        ]);
    const props = {
      entity: resourceId,
      eventCategory: "Administrative",
      status: isErr ? "Failed" : "Succeeded",
      revisionName: rev,
      httpRequest: {
        clientRequestId: randUUID(),
        clientIpAddress: callerIp,
        method: rand(["PUT", "POST"]),
      },
    };
    const { properties, error } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
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
      properties,
      ...(error ? { error } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.App/containerApps"),
      azure: {
        container_apps: {
          app_name: app,
          resource_group: resourceGroup,
          revision: rev,
          category: "Administrative",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String(op),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e8, 4e9),
      },
      message: isErr
        ? `Container App ${app}: ${op} failed (${props.status})`
        : `Container App ${app}: deployment operation ${op} succeeded`,
    };
  }

  if (variant === "console") {
    const replica = `${app}-replica-${randInt(0, 3)}-${randId(4)}`;
    const line = isErr
      ? `System.TimeoutException: Readiness probe failed: connect refused 0.0.0.0:${randInt(3000, 9000)}`
      : `Listening on http://0.0.0.0:${randInt(8080, 9000)} environment=${rand(["prod", "stg"])}`;
    const props = {
      ContainerAppName: app,
      RevisionName: rev,
      ReplicaName: replica,
      Log: line,
      Stream: isErr ? "stderr" : "stdout",
    };
    const { properties: consoleProps, error: consoleErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.App/containerApps/logStream/read",
      category: "ContainerAppConsoleLogs",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: "0",
      callerIpAddress: "169.254.169.254",
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: consoleProps,
      ...(consoleErr ? { error: consoleErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.App/containerApps"),
      azure: {
        container_apps: {
          app_name: app,
          resource_group: resourceGroup,
          revision: rev,
          replica,
          category: "ContainerAppConsoleLogs",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.App/containerApps/logStream/read"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e7, 2e9),
      },
      message: `ContainerApps console ${app}/${rev}: ${line.slice(0, 100)}`,
    };
  }

  if (variant === "ingress") {
    const props = {
      RequestMethod: rand(["GET", "POST", "PUT"]),
      RequestPath: rand(["/api/orders", "/healthz", "/v1/webhook"]),
      Scheme: "https",
      StatusCode: isErr ? rand([502, 503, 504]) : rand([200, 201, 204]),
      UserAgent: rand(USER_AGENTS),
      ClientIP: callerIp,
      RevisionName: rev,
    };
    const code = props.StatusCode as number;
    const { properties: ingProps, error: ingErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.App/containerApps/httpLogs/write",
      category: "ContainerAppIngressLogs",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(code),
      callerIpAddress: callerIp,
      correlationId,
      level: code >= 500 ? "Warning" : "Information",
      properties: ingProps,
      ...(ingErr ? { error: ingErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.App/containerApps"),
      azure: {
        container_apps: {
          app_name: app,
          resource_group: resourceGroup,
          revision: rev,
          category: "ContainerAppIngressLogs",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.App/containerApps/httpLogs/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e6, 5e8),
      },
      message: `Ingress ${props.RequestMethod} ${props.RequestPath} -> ${code} for ${app}`,
    };
  }

  if (variant === "revision") {
    const trafficWeight = isErr ? randInt(0, 40) : 100;
    const props = {
      activeRevisionName: rev,
      candidateRevisionName: `${app}--${randId(8).toLowerCase()}`,
      trafficSplitPercent: trafficWeight,
      healthState: isErr ? "Unhealthy" : "Healthy",
      lastTransitionReason: isErr
        ? "Readiness probe failures exceeded threshold on candidate revision"
        : "Candidate revision passed container probes and received 100% traffic",
      minReplicas: randInt(1, 3),
      maxReplicas: randInt(6, 30),
    };
    const { properties: revProps, error: revErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.App/containerApps/revisions/write",
      category: "ContainerAppRevisionProvisioning",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.healthState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: revProps,
      ...(revErr ? { error: revErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.App/containerApps"),
      azure: {
        container_apps: {
          app_name: app,
          resource_group: resourceGroup,
          revision: rev,
          category: "ContainerAppRevisionProvisioning",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.App/containerApps/revisions/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e8, 6e9),
      },
      message: isErr
        ? `[revision] Activation stalled for ${app}: ${props.lastTransitionReason}`
        : `[revision] Traffic shift complete on ${app} (${props.activeRevisionName})`,
    };
  }

  if (variant === "dapr_sidecar") {
    const actorId = `actor-${randId(8).toLowerCase()}`;
    const props = {
      DaprAppId: app,
      Component: rand([
        "secretstores.azure.keyvault",
        "state.azure.cosmosdb",
        "pubsub.azure.servicebus",
      ]),
      Operation: rand(["GET", "PUT", "PUBLISH"]),
      Scope: `/invoke/${rand(["checkout", "cart"])}/method/${rand(["Reserve", "Cancel"])}`,
      Status: isErr ? "ERROR" : "OK",
      mTLS: true,
      traceParent: `00-${randHexId(32)}-${randHexId(16)}-01`,
      detail: isErr
        ? "Dapr sidecar: failed to resolve Azure Key Vault secret reference (403 from MSI)"
        : "Dapr sidecar: state save completed with etag match",
    };
    const { properties: daprProps, error: daprErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.App/containerApps/diagnostics/write",
      category: "ContainerAppSystemLogs",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.Status,
      callerIpAddress: "169.254.169.254",
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: daprProps,
      ...(daprErr ? { error: daprErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.App/containerApps"),
      azure: {
        container_apps: {
          app_name: app,
          resource_group: resourceGroup,
          revision: rev,
          dapr_actor_id: actorId,
          category: "ContainerAppSystemLogs",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.App/containerApps/diagnostics/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e7, 4e8),
      },
      message: isErr
        ? `Dapr ${props.Component} ${props.Operation} failed on ${app}: ${props.detail}`
        : `Dapr ${props.Operation} ok for ${app} (${props.Component})`,
    };
  }

  const props = {
    From: isErr ? randInt(4, 8) : randInt(2, 6),
    To: isErr ? randInt(2, 4) : randInt(6, 24),
    Reason: isErr
      ? "KEDA scaler failed: unable to resolve metric from monitoring workspace"
      : "CPU average exceeded target for 120s",
    CurrentReplicas: isErr ? randInt(2, 4) : randInt(6, 12),
  };
  const { properties: scaleProps, error: scaleErr } = withComputeAzureErrors(
    isErr,
    variant,
    props as Record<string, unknown>
  );
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: isErr
      ? "Microsoft.App/containerApps/write"
      : "Microsoft.App/containerApps/scalingRules/evaluate",
    category: "ContainerAppScaleEvents",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "ScaleBlocked" : "Scaled",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: scaleProps,
    ...(scaleErr ? { error: scaleErr } : {}),
    cloud: azureCloud(region, subscription, "Microsoft.App/containerApps"),
    azure: {
      container_apps: {
        app_name: app,
        resource_group: resourceGroup,
        category: "ContainerAppScaleEvents",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["host"],
      type: isErr ? ["error"] : ["info"],
      action: isErr
        ? "Microsoft.App/containerApps/write"
        : "Microsoft.App/containerApps/scalingRules/evaluate",
      outcome: isErr ? "failure" : "success",
      duration: randInt(1e8, 3e9),
    },
    message: isErr
      ? `Scale-out blocked for ${app}: ${props.Reason}`
      : `Scaled ${app} replicas ${props.From} -> ${props.To}`,
  };
}

/** Azure Container Instances — lifecycle, exec, attach. */
export function generateContainerInstancesLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const group = `aci-${randId(6).toLowerCase()}`;
  const resourceId = armContainerGroup(subscription.id, resourceGroup, group);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const container = `cnt-${randId(4).toLowerCase()}`;
  const variant = rand([
    "lifecycle",
    "exec",
    "event",
    "network_profile",
    "image_pull",
    "metrics",
  ] as const);

  if (variant === "lifecycle") {
    const op = isErr
      ? rand([
          "Microsoft.ContainerInstance/containerGroups/write",
          "Microsoft.ContainerInstance/containerGroups/start/action",
        ])
      : rand([
          "Microsoft.ContainerInstance/containerGroups/write",
          "Microsoft.ContainerInstance/containerGroups/delete",
          "Microsoft.ContainerInstance/containerGroups/stop/action",
        ]);
    const props = {
      containers: [
        {
          name: container,
          image: `${rand(["meridiantech", "cascadeops"])}.azurecr.io/app:${rand(["1.2", "2.0"])}`,
        },
      ],
      eventCategory: "Administrative",
      status: isErr ? "Failed" : "Succeeded",
      httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
    };
    const { properties: lcProps, error: lcErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: op,
      category: "Administrative",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? rand(["400", "409"]) : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: lcProps,
      ...(lcErr ? { error: lcErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.ContainerInstance/containerGroups"),
      azure: {
        container_instances: {
          container_group: group,
          container_name: container,
          resource_group: resourceGroup,
          category: "Administrative",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String(op),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e8, 6e9),
      },
      message: isErr
        ? `ACI group ${group}: provisioning failed during ${op}`
        : `ACI group ${group}: ${op} completed`,
    };
  }

  if (variant === "exec") {
    const props = {
      ContainerName: container,
      Command: rand([
        ["/bin/sh", "-c", "ps aux"],
        ["curl", "-sf", "http://127.0.0.1:8080/health"],
      ]),
      TerminalSize: { rows: 24, cols: 120 },
      ExitCode: isErr ? randInt(1, 127) : 0,
      Reason: isErr ? "exec session terminated: OCI runtime exceeded timeout" : "exec completed",
    };
    const { properties: execProps, error: execErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: isErr
        ? "Microsoft.ContainerInstance/containerGroups/containers/exec/action"
        : "Microsoft.ContainerInstance/containerGroups/containers/attach/action",
      category: "ContainerEvent",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.ExitCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: execProps,
      ...(execErr ? { error: execErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.ContainerInstance/containerGroups"),
      azure: {
        container_instances: {
          container_group: group,
          container_name: container,
          resource_group: resourceGroup,
          category: "ContainerEvent",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: isErr
          ? "Microsoft.ContainerInstance/containerGroups/containers/exec/action"
          : "Microsoft.ContainerInstance/containerGroups/containers/attach/action",
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e7, 2e9),
      },
      message: isErr
        ? `ACI exec failed on ${group}/${container}: ${props.Reason}`
        : `ACI attach/exec session ended cleanly on ${group}/${container}`,
    };
  }

  if (variant === "network_profile") {
    const props = {
      profileName: `aci-net-${randId(4).toLowerCase()}`,
      delegatedSubnetId: `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/virtualNetworks/vnet-aci/subnets/aci-delegated`,
      dnsNameLabel: `${group}-pip`,
      ports: [
        { protocol: "TCP", port: 80 },
        { protocol: "TCP", port: 443 },
      ],
      ipProvisioningState: isErr ? "Failed" : "Succeeded",
      detail: isErr
        ? "container group IP assignment failed: delegated subnet has no remaining private IPs"
        : "public IP and DNS label registered for container group ingress",
    };
    const { properties: netProps, error: netErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.ContainerInstance/containerGroups/write",
      category: "ContainerInstanceNetworkProfile",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.ipProvisioningState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: netProps,
      ...(netErr ? { error: netErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.ContainerInstance/containerGroups"),
      azure: {
        container_instances: {
          container_group: group,
          container_name: container,
          resource_group: resourceGroup,
          category: "ContainerInstanceNetworkProfile",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.ContainerInstance/containerGroups/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e8, 5e9),
      },
      message: isErr
        ? `ACI ${group}: network profile ${props.profileName} failed — ${props.detail}`
        : `ACI ${group}: ${props.detail}`,
    };
  }

  if (variant === "image_pull") {
    const props = {
      image: `${rand(["meridiantech", "cascadeops"])}.azurecr.io/${rand(["api", "batch"])}:${rand(["prod", "staging"])}`,
      registryServer: `${rand(["meridiantech", "cascadeops"])}.azurecr.io`,
      pullPolicy: "IfNotPresent",
      credentialSource: "managedIdentity",
      cachedLayersHitRatio: isErr ? randFloat(0, 0.35) : randFloat(0.72, 0.99),
      criMessage: isErr
        ? `manifest unknown: repository name not known to registry (${rand(["401", "403"])})`
        : `Pulling fs layers: total size ${randInt(120, 980)}MB`,
    };
    const { properties: pullProps, error: pullErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.ContainerInstance/containerGroups/containers/write",
      category: "ContainerInstanceImagePull",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "ImagePullBackOff" : "Pulled",
      callerIpAddress: "169.254.169.254",
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: pullProps,
      ...(pullErr ? { error: pullErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.ContainerInstance/containerGroups"),
      azure: {
        container_instances: {
          container_group: group,
          container_name: container,
          resource_group: resourceGroup,
          category: "ContainerInstanceImagePull",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.ContainerInstance/containerGroups/containers/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(8e7, 4e9),
      },
      message: isErr
        ? `ACI image pull failed for ${group}/${container}: ${props.criMessage}`
        : `ACI pulled ${props.image} (${(props.cachedLayersHitRatio as number).toFixed(2)} cache hit)`,
    };
  }

  if (variant === "metrics") {
    const cpuMw = isErr ? randFloat(850, 995) : randFloat(120, 620);
    const props = {
      MetricNamespace: "microsoft.containerinstance/containergroups",
      MetricName: rand(["CpuUsage", "MemoryUsage", "NetworkBytesTransmittedOut"]),
      TimeGrain: "PT1M",
      Average: cpuMw,
      Max: cpuMw * randFloat(1.05, 1.4),
      Dimensions: { containerName: container },
      alertBreached: isErr,
    };
    const { properties: mProps, error: mErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName:
        "Microsoft.ContainerInstance/containerGroups/providers/microsoft.insights/metrics/read",
      category: "ContainerInstanceMetrics",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "ThresholdExceeded" : "WithinSLO",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: mProps,
      ...(mErr ? { error: mErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.ContainerInstance/containerGroups"),
      azure: {
        container_instances: {
          container_group: group,
          container_name: container,
          resource_group: resourceGroup,
          category: "ContainerInstanceMetrics",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("azure-activity"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e7, 8e8),
      },
      message: isErr
        ? `[metrics] ACI ${group}: ${props.MetricName} sustained above budget (${cpuMw.toFixed(1)}mW)`
        : `[metrics] ${props.MetricName} nominal on ${group}/${container}`,
    };
  }

  const props = {
    type: isErr ? "Warning" : "Normal",
    reason: isErr ? rand(["BackOff", "Failed", "Unhealthy"]) : "Started",
    message: isErr
      ? `Container ${container} failed liveness probe (HTTP 503)`
      : `Successfully pulled image and started container ${container}`,
    count: 1,
  };
  const { properties: evtProps, error: evtErr } = withComputeAzureErrors(
    isErr,
    variant,
    props as Record<string, unknown>
  );
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.ContainerInstance/containerGroups/events/write",
    category: "ContainerInstanceLog",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.reason as string,
    callerIpAddress: "127.0.0.1",
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: evtProps,
    ...(evtErr ? { error: evtErr } : {}),
    cloud: azureCloud(region, subscription, "Microsoft.ContainerInstance/containerGroups"),
    azure: {
      container_instances: {
        container_group: group,
        container_name: container,
        resource_group: resourceGroup,
        category: "ContainerInstanceLog",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["host"],
      type: isErr ? ["error"] : ["info"],
      action: String("Microsoft.ContainerInstance/containerGroups/events/write"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(5e7, 1e9),
    },
    message: `ACI event on ${group}: ${props.reason} — ${props.message}`,
  };
}

/** Kubernetes Fleet — member updates, fleet deployments. */
export function generateKubernetesFleetLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const fleet = `fleet-${rand(["prod", "platform"])}-${randId(4).toLowerCase()}`;
  const resourceId = armFleet(subscription.id, resourceGroup, fleet);
  const member = `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.ContainerService/managedClusters/aks-${randId(4).toLowerCase()}`;
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "member",
    "update",
    "admin",
    "workload_placement",
    "hub_health",
    "auto_upgrade_profile",
  ] as const);

  if (variant === "member") {
    const props = {
      memberClusterResourceId: member,
      joinState: isErr ? "Failed" : "Succeeded",
      lastTransitionTime: time,
      message: isErr
        ? "Fleet hub could not validate cluster credentials (unauthorized against hub apiserver)"
        : "Member cluster registered and heartbeat OK",
    };
    const { properties: membProps, error: membErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: isErr
        ? "Microsoft.ContainerService/fleets/members/write"
        : "Microsoft.ContainerService/fleets/members/join/action",
      category: "FleetMemberUpdate",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.joinState as string,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: membProps,
      ...(membErr ? { error: membErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.ContainerService/fleets"),
      azure: {
        kubernetes_fleet: {
          fleet_name: fleet,
          resource_group: resourceGroup,
          member_cluster_id: member,
          category: "FleetMemberUpdate",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String(isErr),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e8, 5e9),
      },
      message: isErr
        ? `Fleet ${fleet}: member update failed for ${member.split("/").pop()}`
        : `Fleet ${fleet}: member cluster joined successfully`,
    };
  }

  if (variant === "update") {
    const props = {
      updateRunName: `ur-${randId(8).toLowerCase()}`,
      stage: isErr ? "Failed" : "Succeeded",
      stageName: rand(["PreValidation", "Update", "PostValidation"]),
      clustersUpdated: isErr ? randInt(0, 2) : randInt(3, 12),
      message: isErr
        ? "Fleet resource update run failed: staged rollout aborted after node drain timeout"
        : "Multi-cluster rollout completed across fleet members",
    };
    const { properties: updProps, error: updErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: isErr
        ? "Microsoft.ContainerService/fleets/updateRuns/write"
        : "Microsoft.ContainerService/fleets/updateRuns/start/action",
      category: "FleetDeployment",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.stage as string,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: updProps,
      ...(updErr ? { error: updErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.ContainerService/fleets"),
      azure: {
        kubernetes_fleet: {
          fleet_name: fleet,
          resource_group: resourceGroup,
          category: "FleetDeployment",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String(isErr),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e8, 1.2e10),
      },
      message: isErr
        ? `Fleet ${fleet}: deployment run ${props.updateRunName} failed at ${props.stageName}`
        : `Fleet ${fleet}: update run ${props.updateRunName} succeeded (${props.clustersUpdated} clusters)`,
    };
  }

  if (variant === "workload_placement") {
    const props = {
      resourceKind: rand(["clusters", "azure.vm", "StatefulSet"]),
      namespace: rand(["fleet-workloads", "platform", "tenants"]),
      name: `${rand(["checkout", "cart"])}-${randId(4).toLowerCase()}`,
      placementDecision: isErr ? "Rejected" : "Accepted",
      targetMember: member.split("/").pop(),
      violatedConstraints: isErr
        ? ["taints:noSchedule", `requiredTopologies:failure-domain.beta.kubernetes.io/zone`]
        : [],
      kubeEvents: isErr
        ? "FailedScheduling: 0/X nodes insufficient cpu"
        : "Scheduled on member via fleet scheduler",
    };
    const { properties: wpProps, error: wpErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.ContainerService/fleets/workloads/write",
      category: "FleetWorkloadPlacement",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.placementDecision,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: wpProps,
      ...(wpErr ? { error: wpErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.ContainerService/fleets"),
      azure: {
        kubernetes_fleet: {
          fleet_name: fleet,
          resource_group: resourceGroup,
          category: "FleetWorkloadPlacement",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.ContainerService/fleets/workloads/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(8e8, 6e9),
      },
      message: isErr
        ? `Fleet ${fleet}: placement rejected for ${props.namespace}/${props.name}`
        : `Fleet ${fleet}: workload ${props.name} placed on ${props.targetMember}`,
    };
  }

  if (variant === "hub_health") {
    const props = {
      hubFqdn: `hub-${fleet}.${region}.trafficmanager.net`,
      apiserverLatencyMs: isErr ? randInt(820, 4000) : randInt(12, 85),
      kubeconfigRefreshStatus: isErr ? "StaleOrInvalid" : "Current",
      lastSuccessfulProbe: time,
      details: isErr
        ? "hub apiserver TLS handshake reset; member operations may backlog"
        : "all SLO probes green for fleet control plane endpoints",
    };
    const { properties: hhProps, error: hhErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.ContainerService/fleets/read",
      category: "FleetHubHealth",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.kubeconfigRefreshStatus,
      callerIpAddress: "169.254.169.254",
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: hhProps,
      ...(hhErr ? { error: hhErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.ContainerService/fleets"),
      azure: {
        kubernetes_fleet: {
          fleet_name: fleet,
          resource_group: resourceGroup,
          category: "FleetHubHealth",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.ContainerService/fleets/read"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e8, 2e9),
      },
      message: isErr
        ? `[hub] Fleet ${fleet} unhealthy: ${props.details}`
        : `[hub] Fleet ${fleet}: latency ${props.apiserverLatencyMs}ms`,
    };
  }

  if (variant === "auto_upgrade_profile") {
    const props = {
      profileName: `upgrade-${rand(["stable", "rapid"])}`,
      kubernetesVersionChannel: rand(["stable", "auto"]),
      reconcileState: isErr ? "Failed" : "Succeeded",
      stagedPatchVersion: `1.${randInt(26, 30)}.${randInt(0, 8)}`,
      memberCountEligible: randInt(2, 18),
      membersBlockedByPolicy: isErr ? randInt(1, 4) : 0,
      message: isErr
        ? "auto-upgrade profile halted: PDB / maintenance window prevented drain on guarded pools"
        : "auto-upgrade profile evaluated; no guarded pools blocking channel advance",
    };
    const { properties: augProps, error: augErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.ContainerService/fleets/autoUpgradeProfiles/write",
      category: "FleetAutoUpgradeProfile",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.reconcileState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: augProps,
      ...(augErr ? { error: augErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.ContainerService/fleets"),
      azure: {
        kubernetes_fleet: {
          fleet_name: fleet,
          resource_group: resourceGroup,
          category: "FleetAutoUpgradeProfile",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.ContainerService/fleets/autoUpgradeProfiles/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e9, 8e9),
      },
      message: isErr
        ? `Fleet ${fleet}: ${props.profileName} reconcile failed (${props.membersBlockedByPolicy} blocked)`
        : `Fleet ${fleet}: auto-upgrade OK toward ${props.stagedPatchVersion}`,
    };
  }

  const op = "Microsoft.ContainerService/fleets/write";
  const props = {
    eventCategory: "Administrative",
    status: isErr ? "Failed" : "Succeeded",
    httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
  };
  const { properties: fleetAdmProps, error: fleetAdmErr } = withComputeAzureErrors(
    isErr,
    variant,
    props as Record<string, unknown>
  );
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: op,
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "500" : "200",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: fleetAdmProps,
    ...(fleetAdmErr ? { error: fleetAdmErr } : {}),
    cloud: azureCloud(region, subscription, "Microsoft.ContainerService/fleets"),
    azure: {
      kubernetes_fleet: {
        fleet_name: fleet,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["host"],
      type: isErr ? ["error"] : ["info"],
      action: String(op),
      outcome: isErr ? "failure" : "success",
      duration: randInt(1e8, 4e9),
    },
    message: isErr
      ? `Fleet resource ${fleet}: ARM write failed`
      : `Fleet ${fleet}: configuration updated`,
  };
}

/** Azure Container Registry — push/pull/import, Defender scans. */
export function generateAcrLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const registry = `cr${randId(8).toLowerCase()}`;
  const resourceId = armAcr(subscription.id, resourceGroup, registry);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const repo = rand(["api", "worker", "frontend"]);
  const tag = rand(["latest", `v${randInt(1, 5)}.${randInt(0, 9)}.${randInt(0, 20)}`]);
  const variant = rand([
    "event",
    "scan",
    "admin",
    "geo_replicate",
    "webhook_dispatch",
    "task_agent",
  ] as const);

  if (variant === "event") {
    const action = isErr ? rand(["Pull", "Push"]) : rand(["Push", "Pull", "Delete"]);
    const digest = `sha256:${randHexId(64)}`;
    const props = {
      repository: `${repo}:${tag}`,
      action,
      identity: `appid=${randUUID()}`,
      loginServer: `${registry}.azurecr.io`,
      result: isErr
        ? rand(["Unauthorized", "ManifestUnknown", "Throttled"])
        : rand(["Succeeded", "Accepted"]),
      requestUri: `https://${registry}.azurecr.io/v2/${repo}/manifests/${tag}`,
    };
    const flatProps = { ...props, digest };
    const { properties: acrEvProps, error: acrEvErr } = withComputeAzureErrors(
      isErr,
      variant,
      flatProps as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: isErr
        ? `Microsoft.ContainerRegistry/registries/${action.toLowerCase()}Manifest/failed`
        : `Microsoft.ContainerRegistry/registries/${action.toLowerCase()}Manifest/write`,
      category: "ContainerRegistryRepositoryEvents",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.result as string,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: acrEvProps,
      ...(acrEvErr ? { error: acrEvErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.ContainerRegistry/registries"),
      azure: {
        container_registry: {
          registry_name: registry,
          repository: repo,
          tag,
          digest,
          resource_group: resourceGroup,
          category: "ContainerRegistryRepositoryEvents",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String(isErr),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e6, 5e8),
      },
      message: isErr
        ? `ACR ${registry}: ${action} failed for ${repo}:${tag} (${props.result})`
        : `ACR ${registry}: ${action} ${repo}:${tag} (${digest.slice(0, 19)}...)`,
    };
  }

  if (variant === "scan") {
    const props = {
      scanStatus: isErr ? "Failed" : "Finished",
      severitySummary: isErr
        ? { critical: randInt(1, 4), high: randInt(2, 8), medium: randInt(0, 15) }
        : { critical: 0, high: 0, medium: randInt(0, 3) },
      artifact: `${registry}.azurecr.io/${repo}@${tag}`,
      runId: randUUID(),
      error: isErr ? "Microsoft Defender for Cloud: vulnerability data provider timeout" : "",
    };
    const { properties: scanProps, error: scanErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: isErr
        ? "Microsoft.Security/securityStatuses/write"
        : "Microsoft.ContainerRegistry/registries/scanResults/read",
      category: "ContainerRegistryVulnerabilityScan",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.scanStatus,
      callerIpAddress: "52.239.0.0",
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: scanProps,
      ...(scanErr ? { error: scanErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.ContainerRegistry/registries"),
      azure: {
        container_registry: {
          registry_name: registry,
          repository: repo,
          tag,
          resource_group: resourceGroup,
          category: "ContainerRegistryVulnerabilityScan",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String(isErr),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e9, 1.8e10),
      },
      message: isErr
        ? `ACR vulnerability scan failed for ${repo}:${tag}`
        : `ACR scan completed for ${repo} (critical=${props.severitySummary.critical})`,
    };
  }

  if (variant === "geo_replicate") {
    const tgt = rand(["westeurope", "uksouth", "australiaeast"]);
    const props = {
      replicationName: `${registry}-repl-${tgt}`,
      destinationRegion: tgt,
      synchronizationStatus: isErr ? "Failed" : "Ready",
      lastSyncLagSeconds: isErr ? randInt(600, 14400) : randInt(2, 90),
      commitManifestDigest: `sha256:${randHexId(64)}`,
      message: isErr
        ? "geo-replication: blob copy stalled (destination registry storage throttled)"
        : "geo-replication: manifest replicated to paired region endpoint",
    };
    const { properties: geoProps, error: geoErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.ContainerRegistry/registries/replications/write",
      category: "ContainerRegistryGeoReplication",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.synchronizationStatus,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: geoProps,
      ...(geoErr ? { error: geoErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.ContainerRegistry/registries"),
      azure: {
        container_registry: {
          registry_name: registry,
          repository: repo,
          tag,
          resource_group: resourceGroup,
          category: "ContainerRegistryGeoReplication",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.ContainerRegistry/registries/replications/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e9, 9e9),
      },
      message: isErr
        ? `ACR geo-replicate to ${tgt} failed for ${repo}:${tag}`
        : `ACR ${registry}: synced ${(props.commitManifestDigest as string).slice(0, 22)}... to ${tgt}`,
    };
  }

  if (variant === "webhook_dispatch") {
    const hookId = randUUID();
    const props = {
      webhookId: hookId,
      action: rand(["push", "delete", "chart_push"]),
      targetUri: `https://${rand(["jenkins", "argocd"])}.meridiantech.io/hooks/acr-${registry}`,
      responseCode: isErr ? rand([401, 403, 502, 504]) : 202,
      attempt: randInt(1, 5),
      bodyPreview: `{"repository":"${repo}","tag":"${tag}"}`,
      detail: isErr
        ? "delivery failed: webhook endpoint unreachable after retries"
        : "webhook ACK received from consumer",
    };
    const { properties: whProps, error: whErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.ContainerRegistry/registries/webhooks/events/write",
      category: "ContainerRegistryWebhook",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.responseCode),
      callerIpAddress: "168.63.129.16",
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: whProps,
      ...(whErr ? { error: whErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.ContainerRegistry/registries"),
      azure: {
        container_registry: {
          registry_name: registry,
          repository: repo,
          tag,
          resource_group: resourceGroup,
          category: "ContainerRegistryWebhook",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.ContainerRegistry/registries/webhooks/events/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e8, 2e9),
      },
      message: isErr
        ? `ACR webhook ${hookId} delivery failed (${props.responseCode})`
        : `ACR webhook dispatched for ${props.action} on ${repo}`,
    };
  }

  if (variant === "task_agent") {
    const runName = `task-${randId(8).toLowerCase()}`;
    const props = {
      taskRunName: runName,
      agentPool: rand(["tier-basic", "tier-standard"]),
      imageRef: `${registry}.azurecr.io/${repo}:${tag}`,
      step: rand(["build", "push", "scan"]),
      stdoutTail: isErr
        ? "ERROR: denied: requested access to resource is denied by tag immutability policy"
        : "Successfully tagged and pushed multi-arch manifest list",
      exitCode: isErr ? randInt(1, 127) : 0,
    };
    const { properties: taskProps, error: taskErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.ContainerRegistry/registries/runs/write",
      category: "ContainerRegistryTaskRun",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "TaskFailed" : "TaskSucceeded",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: taskProps,
      ...(taskErr ? { error: taskErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.ContainerRegistry/registries"),
      azure: {
        container_registry: {
          registry_name: registry,
          repository: repo,
          tag,
          resource_group: resourceGroup,
          category: "ContainerRegistryTaskRun",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.ContainerRegistry/registries/runs/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e9, 4.5e10),
      },
      message: isErr
        ? `ACR task ${runName} failed at step ${props.step}`
        : `ACR task ${runName}: ${props.step} completed (exit ${props.exitCode})`,
    };
  }

  const props = {
    eventCategory: "Administrative",
    sourceRegistry: `source${randId(4).toLowerCase()}.azurecr.io`,
    targetImage: `${repo}:${tag}`,
    status: isErr ? "Failed" : "Succeeded",
  };
  const { properties: impProps, error: impErr } = withComputeAzureErrors(
    isErr,
    variant,
    props as Record<string, unknown>
  );
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.ContainerRegistry/registries/importImage/action",
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "400" : "202",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: impProps,
    ...(impErr ? { error: impErr } : {}),
    cloud: azureCloud(region, subscription, "Microsoft.ContainerRegistry/registries"),
    azure: {
      container_registry: {
        registry_name: registry,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["host"],
      type: isErr ? ["error"] : ["info"],
      action: String("Microsoft.ContainerRegistry/registries/importImage/action"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(1e9, 6e9),
    },
    message: isErr
      ? `ACR import failed into ${registry} (${props.sourceRegistry})`
      : `ACR import queued for ${registry} image ${repo}:${tag}`,
  };
}

/** Static Web Apps — build/deploy, custom domains. */
export function generateStaticWebAppsLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const site = `swa-${rand(["docs", "app", "portal"])}-${randId(5).toLowerCase()}`;
  const resourceId = armStaticSite(subscription.id, resourceGroup, site);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "workflow",
    "deployment",
    "domain",
    "staging_slot",
    "edge_fn",
    "auth_redirect",
  ] as const);

  if (variant === "workflow") {
    const props = {
      workflowId: `wt-${randId(10)}`,
      job: rand(["build_and_deploy", "validate_pr"]),
      conclusion: isErr ? "failure" : "success",
      runner: `GitHub-Actions-${randInt(100, 999)}`,
      logUrl: `https://github.com/meridiantech/${site}/actions/runs/${randInt(1e9, 9e9)}`,
    };
    const { properties: wfProps, error: wfErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: isErr
        ? "Microsoft.Web/staticSites/workflows/run/failed"
        : "Microsoft.Web/staticSites/builds/complete",
      category: "StaticSiteBuildLogs",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.conclusion,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: wfProps,
      ...(wfErr ? { error: wfErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Web/staticSites"),
      azure: {
        static_web_apps: {
          site_name: site,
          resource_group: resourceGroup,
          category: "StaticSiteBuildLogs",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String(isErr),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e9, 2.4e10),
      },
      message: isErr
        ? `Static Web App ${site}: workflow ${props.job} failed`
        : `Static Web App ${site}: build ${props.workflowId} succeeded`,
    };
  }

  if (variant === "deployment") {
    const props = {
      deploymentId: `d-${randId(12)}`,
      environment: rand(["production", "preview"]),
      hostname: `${site}.${rand(["azurestaticapps", "preview"])}.net`,
      provider: "GitHub",
      status: isErr ? "Failed" : "Ready",
    };
    const { properties: depProps, error: depErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: isErr
        ? "Microsoft.Web/staticSites/deployments/write"
        : "Microsoft.Web/staticSites/deployments/write",
      category: "StaticSiteContentUpdate",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.status,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: depProps,
      ...(depErr ? { error: depErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Web/staticSites"),
      azure: {
        static_web_apps: {
          site_name: site,
          resource_group: resourceGroup,
          category: "StaticSiteContentUpdate",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String(isErr),
        outcome: isErr ? "failure" : "success",
        duration: randInt(8e8, 9e9),
      },
      message: isErr
        ? `SWA ${site}: content deployment ${props.deploymentId} failed`
        : `SWA ${site}: deployed to ${props.environment} (${props.hostname})`,
    };
  }

  if (variant === "staging_slot") {
    const props = {
      slotName: rand(["staging", "canary"]),
      swapOperationId: `swap-${randUUID()}`,
      sourceRevision: `${site}:${rand(["prod", "main"])}`,
      targetRevision: `${site}:${rand(["staging", "next"])}`,
      warmUpStatus: isErr ? "Failed" : "Succeeded",
      appLocation: `/tmp/swa_${randInt(1000, 9999)}`,
      detail: isErr
        ? "slot swap aborted: warmup health check returned 502 from API route /api/ping"
        : "slot warmed; traffic routed to target revision safely",
    };
    const { properties: ssProps, error: ssErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Web/staticSites/hostNameBindings/write",
      category: "StaticSiteSlotSwap",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.warmUpStatus,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: ssProps,
      ...(ssErr ? { error: ssErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Web/staticSites"),
      azure: {
        static_web_apps: {
          site_name: site,
          resource_group: resourceGroup,
          category: "StaticSiteSlotSwap",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Web/staticSites/hostNameBindings/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(6e8, 6e9),
      },
      message: isErr
        ? `SWA ${site}: ${props.slotName} swap failed`
        : `SWA ${site}: swap ${props.slotName} completed`,
    };
  }

  if (variant === "edge_fn") {
    const props = {
      ApiRoute: rand(["/api/checkout", "/api/webhook"]),
      FunctionName: `${site.replace(/-/g, "_")}_${rand(["handler", "sync"])}`,
      InvocationsPerMinute: randInt(10, 4000),
      DurationMs: isErr ? randInt(8500, 25000) : randInt(8, 120),
      Status: isErr ? "Failed" : "Succeeded",
      SubError: isErr ? "UnhandledWorkerException: Cosmos client throttled RU/s" : "",
    };
    const { properties: efProps, error: efErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Web/staticSites/functions/write",
      category: "StaticSiteFunctionsLogs",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.Status,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: efProps,
      ...(efErr ? { error: efErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Web/staticSites"),
      azure: {
        static_web_apps: {
          site_name: site,
          resource_group: resourceGroup,
          category: "StaticSiteFunctionsLogs",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Web/staticSites/functions/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e7, 4e8),
      },
      message: isErr
        ? `SWA Functions ${props.FunctionName}: ${props.SubError}`
        : `SWA Functions ${props.ApiRoute} ok (${props.DurationMs}ms)`,
    };
  }

  if (variant === "auth_redirect") {
    const props = {
      provider: rand(["github", "aad", "google"]),
      allowedAudiences: [`api://${site}`, `https://${site}.meridiantech.io`],
      redirectUri: `https://${site}.${rand(["azurestaticapps", "preview"])}.net/.auth/login/aad/callback`,
      authorizationResult: isErr ? "Denied" : "Granted",
      clientPrincipalDebug: isErr
        ? "roles claim missing for required scope"
        : "standard claims issued",
      httpStatus: isErr ? 403 : 302,
    };
    const { properties: arProps, error: arErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Web/staticSites/config/authsettings/write",
      category: "StaticSiteAuthentication",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.httpStatus),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: arProps,
      ...(arErr ? { error: arErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Web/staticSites"),
      azure: {
        static_web_apps: {
          site_name: site,
          resource_group: resourceGroup,
          category: "StaticSiteAuthentication",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Web/staticSites/config/authsettings/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e8, 2e9),
      },
      message: isErr
        ? `SWA auth (${props.provider}) blocked: ${props.clientPrincipalDebug}`
        : `SWA auth redirect issued for ${props.provider}`,
    };
  }

  const props = {
    hostname: isErr ? `bad.${site}.meridiantech.io` : `www.${site}.meridiantech.io`,
    validationMethod: "cname-delegation",
    status: isErr ? "ValidationFailed" : "Ready",
    error: isErr ? "DNS TXT record _dnsauth not found or mismatched" : "",
  };
  const { properties: domProps, error: domErr } = withComputeAzureErrors(
    isErr,
    variant,
    props as Record<string, unknown>
  );
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.Web/staticSites/customDomains/write",
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.status,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: domProps,
    ...(domErr ? { error: domErr } : {}),
    cloud: azureCloud(region, subscription, "Microsoft.Web/staticSites"),
    azure: {
      static_web_apps: {
        site_name: site,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["host"],
      type: isErr ? ["error"] : ["info"],
      action: String("Microsoft.Web/staticSites/customDomains/write"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(2e8, 4e9),
    },
    message: isErr
      ? `SWA custom domain binding failed for ${props.hostname}`
      : `SWA custom domain ${props.hostname} validated and active`,
  };
}

/** Azure Spring Apps — app lifecycle and deployments. */
export function generateSpringAppsLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const service = `as-${rand(["prod", "dev"])}-${randId(4).toLowerCase()}`;
  const resourceId = armSpring(subscription.id, resourceGroup, service);
  const app = `app-${rand(["catalog", "order", "payment"])}`;
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "arm",
    "runtime",
    "jvm",
    "config_refresh",
    "svc_binding",
    "buildpack_diag",
  ] as const);

  if (variant === "arm") {
    const op = isErr
      ? rand([
          "Microsoft.AppPlatform/Spring/apps/write",
          "Microsoft.AppPlatform/Spring/apps/deployments/write",
        ])
      : rand([
          "Microsoft.AppPlatform/Spring/write",
          "Microsoft.AppPlatform/Spring/apps/start/action",
          "Microsoft.AppPlatform/Spring/apps/stop/action",
        ]);
    const props = {
      eventCategory: "Administrative",
      status: isErr ? "Failed" : "Succeeded",
      appName: app,
      deployment: `default`,
      httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
    };
    const { properties: spArmProps, error: spArmErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
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
      properties: spArmProps,
      ...(spArmErr ? { error: spArmErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.AppPlatform/Spring"),
      azure: {
        spring_apps: {
          service_name: service,
          app_name: app,
          resource_group: resourceGroup,
          category: "Administrative",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String(op),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e8, 8e9),
      },
      message: isErr
        ? `Spring Apps ${service}/${app}: ${op} failed`
        : `Spring Apps ${service}: ${op} succeeded`,
    };
  }

  if (variant === "runtime") {
    const line = isErr
      ? `org.springframework.web.client.ResourceAccessException: I/O error on GET request for "http://config-server:8888"`
      : `Started ${rand(["CatalogApplication", "OrderService"])} in ${randFloat(3, 12).toFixed(2)} seconds`;
    const props = {
      AppName: app,
      Instance: `${service}-${app}-${randInt(1, 5)}`,
      Log: line,
      Level: isErr ? "ERROR" : "INFO",
    };
    const { properties: spRtProps, error: spRtErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.AppPlatform/Spring/apps/logStream/read",
      category: "ApplicationConsole",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: "0",
      callerIpAddress: "169.254.169.254",
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: spRtProps,
      ...(spRtErr ? { error: spRtErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.AppPlatform/Spring"),
      azure: {
        spring_apps: {
          service_name: service,
          app_name: app,
          resource_group: resourceGroup,
          category: "ApplicationConsole",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.AppPlatform/Spring/apps/logStream/read"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e6, 2e8),
      },
      message: `Spring Apps ${service}/${app}: ${line.slice(0, 90)}`,
    };
  }

  if (variant === "config_refresh") {
    const props = {
      AppName: app,
      ConfigServerEndpoint: `https://${service}-config.${region}.azurecontainer.io`,
      Profile: rand(["default", "k8s", "staging"]),
      refreshStatus: isErr ? "Failed" : "Refreshed",
      keysLoaded: randInt(8, 120),
      decryptedSecrets: randInt(0, 15),
      busEventId: randUUID(),
      fault: isErr
        ? "Fetch error: actuator/env returned 503 from config server quorum member"
        : "Property sources order stable; composite index applied",
    };
    const { properties: cfProps, error: cfErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.AppPlatform/Spring/apps/refresh/action",
      category: "SpringCloudConfig",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.refreshStatus,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: cfProps,
      ...(cfErr ? { error: cfErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.AppPlatform/Spring"),
      azure: {
        spring_apps: {
          service_name: service,
          app_name: app,
          resource_group: resourceGroup,
          category: "SpringCloudConfig",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.AppPlatform/Spring/apps/refresh/action"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e8, 4e9),
      },
      message: isErr
        ? `Spring config refresh failed for ${app}: ${props.fault}`
        : `Spring config refreshed (${props.keysLoaded} keys)`,
    };
  }

  if (variant === "svc_binding") {
    const redisNameStr = `r-${randId(6).toLowerCase()}`;
    const props = {
      AppName: app,
      ServiceType: rand(["mysql", "redis", "kafka"]),
      BindingOperation: rand(["CREATE", "DELETE", "UPDATE"]),
      targetResourceId: `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Cache/redis/${redisNameStr}`,
      operatorResult: isErr ? "Rejected" : "Bound",
      openServiceBrokerStatus: isErr ? 422 : 201,
      detail: isErr
        ? "bind request failed: MSI token audience mismatch with target Azure AD app"
        : "binding credentials rotated and injected into SPRING_APPLICATION_JSON",
    };
    const { properties: bindProps, error: bindErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.AppPlatform/Spring/apps/bindings/write",
      category: "SpringCloudServiceBindings",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.operatorResult,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: bindProps,
      ...(bindErr ? { error: bindErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.AppPlatform/Spring"),
      azure: {
        spring_apps: {
          service_name: service,
          app_name: app,
          resource_group: resourceGroup,
          category: "SpringCloudServiceBindings",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.AppPlatform/Spring/apps/bindings/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e8, 6e9),
      },
      message: isErr
        ? `Service binding ${props.BindingOperation} failed (${props.ServiceType})`
        : `${props.ServiceType} binding ready for ${app}`,
    };
  }

  if (variant === "buildpack_diag") {
    const props = {
      BuildpackId: rand(["paketo-buildpacks/spring-boot", "tanzu/sca-java"]),
      layerCacheHitRatio: isErr ? randFloat(0.1, 0.45) : randFloat(0.65, 0.94),
      buildDurationMs: randInt(45_000, 540_000),
      sbomUploaded: !isErr,
      failurePhase: isErr ? rand(["DETECT", "RESTORE", "EXPORT"]) : "",
      analyzerLine: isErr
        ? "ERROR: launcher process failed reading /workspace/META-INF/MANIFEST.MF"
        : `INFO: Reusing cached layer paketo/spring-boot:latest`,
    };
    const { properties: bpProps, error: bpErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.AppPlatform/Spring/apps/build/write",
      category: "SpringCloudBuildService",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? props.failurePhase : "DONE",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: bpProps,
      ...(bpErr ? { error: bpErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.AppPlatform/Spring"),
      azure: {
        spring_apps: {
          service_name: service,
          app_name: app,
          resource_group: resourceGroup,
          category: "SpringCloudBuildService",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.AppPlatform/Spring/apps/build/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e9, 4e10),
      },
      message: isErr
        ? `Buildpack build failed during ${props.failurePhase}`
        : `Buildpack reused layers (${props.layerCacheHitRatio.toFixed(2)} hit ratio)`,
    };
  }

  const props = {
    AppName: app,
    heapUsedPercent: isErr ? randFloat(92, 99) : randFloat(45, 78),
    gcPauseMs: isErr ? randInt(800, 4000) : randInt(20, 180),
    alert: isErr ? "Heap usage above 95% sustained for 5m" : "",
  };
  const { properties: jvmProps, error: jvmErr } = withComputeAzureErrors(
    isErr,
    variant,
    props as Record<string, unknown>
  );
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.AppPlatform/Spring/apps/metrics/write",
    category: "SpringCloudGateway",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "HighMemory" : "OK",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: jvmProps,
    ...(jvmErr ? { error: jvmErr } : {}),
    cloud: azureCloud(region, subscription, "Microsoft.AppPlatform/Spring"),
    azure: {
      spring_apps: {
        service_name: service,
        app_name: app,
        resource_group: resourceGroup,
        category: "SpringCloudGateway",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["host"],
      type: isErr ? ["error"] : ["info"],
      action: String("Microsoft.AppPlatform/Spring/apps/metrics/write"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(1e8, 1e9),
    },
    message: isErr
      ? `Spring Apps JVM pressure on ${service}/${app}: heap ${props.heapUsedPercent.toFixed(1)}%`
      : `Spring Apps ${app} JVM heap ${props.heapUsedPercent.toFixed(1)}% within limits`,
  };
}

/** Dedicated Host — allocation and maintenance. */
export function generateDedicatedHostLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const hg = `hostg-${randId(4).toLowerCase()}`;
  const host = `host-${randId(6).toLowerCase()}`;
  const resourceId = armDedicatedHost(subscription.id, resourceGroup, hg, host);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "admin",
    "health",
    "maint",
    "allocation_queue",
    "license_cap",
    "host_binpack",
  ] as const);

  if (variant === "admin") {
    const op = isErr
      ? "Microsoft.Compute/hostGroups/hosts/write"
      : rand([
          "Microsoft.Compute/hostGroups/hosts/allocate/action",
          "Microsoft.Compute/hostGroups/hosts/deallocate/action",
        ]);
    const props = {
      eventCategory: "Administrative",
      status: isErr ? "Failed" : "Succeeded",
      hostGroup: hg,
      sku: rand(["DSv3-Type1", "ESv3-Type2"]),
      httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "POST" },
    };
    const { properties: dhAdmProps, error: dhAdmErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
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
      properties: dhAdmProps,
      ...(dhAdmErr ? { error: dhAdmErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Compute/hostGroups/hosts"),
      azure: {
        dedicated_host: {
          host_group: hg,
          host_name: host,
          resource_group: resourceGroup,
          category: "Administrative",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String(op),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e8, 6e9),
      },
      message: isErr
        ? `Dedicated host ${host} in ${hg}: allocation failed (capacity / SKU constraint)`
        : `Dedicated host ${host}: ${op.split("/").pop()} completed`,
    };
  }

  if (variant === "health") {
    const props = {
      availabilityState: isErr ? "Unhealthy" : "Healthy",
      provisioningState: isErr ? "Failed" : "Succeeded",
      reason: isErr
        ? "Host hardware fault detected; VMs will be migrated when safe"
        : "Host passed hardware health checks",
    };
    const { properties: dhHlthProps, error: dhHlthErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Compute/hostGroups/hosts/read",
      category: "ResourceHealth",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.availabilityState,
      callerIpAddress: "169.254.169.254",
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: dhHlthProps,
      ...(dhHlthErr ? { error: dhHlthErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Compute/hostGroups/hosts"),
      azure: {
        dedicated_host: {
          host_group: hg,
          host_name: host,
          resource_group: resourceGroup,
          category: "ResourceHealth",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Compute/hostGroups/hosts/read"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e7, 8e8),
      },
      message: `Dedicated host ${host}: ${props.availabilityState} — ${props.reason}`,
    };
  }

  if (variant === "allocation_queue") {
    const props = {
      queueDepth: isErr ? randInt(12, 80) : randInt(0, 4),
      requestedSku: rand(["DSv3-Type1", "ESv3-Type2"]),
      regionCapacitySignal: isErr ? "Constrained" : "Normal",
      estimatedWaitMinutes: isErr ? randInt(45, 720) : randInt(0, 12),
      hubOperation: "Microsoft.Compute/hostGroups/hosts/allocate/action",
      detail: isErr
        ? "Allocation queued behind higher-priority host group; placement SLA at risk"
        : "Host allocation advanced from queue to active provisioning",
    };
    const { properties: aqProps, error: aqErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: props.hubOperation,
      category: "DedicatedHostAllocationQueue",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.regionCapacitySignal,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: aqProps,
      ...(aqErr ? { error: aqErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Compute/hostGroups/hosts"),
      azure: {
        dedicated_host: {
          host_group: hg,
          host_name: host,
          resource_group: resourceGroup,
          category: "DedicatedHostAllocationQueue",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String(props.hubOperation),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e8, 5e9),
      },
      message: isErr
        ? `Dedicated host queue ${host}: ${props.detail}`
        : `Dedicated host ${host}: ${props.detail}`,
    };
  }

  if (variant === "license_cap") {
    const props = {
      licenseType: rand(["Windows_Server", "RedHat"]),
      socketsAllocated: randInt(1, 4),
      socketsCap: randInt(2, 8),
      enforcementMode: rand(["audit", "strict"]),
      complianceState: isErr ? "Violation" : "Compliant",
      detail: isErr
        ? "BYOS license reconciliation failed; Microsoft.Host infrastructure usage blocked new VM sizes"
        : "License inventory reconciled against installed guests",
    };
    const { properties: lcProps, error: lcErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Compute/hostGroups/hosts/read",
      category: "DedicatedHostLicensing",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.complianceState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: lcProps,
      ...(lcErr ? { error: lcErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Compute/hostGroups/hosts"),
      azure: {
        dedicated_host: {
          host_group: hg,
          host_name: host,
          resource_group: resourceGroup,
          category: "DedicatedHostLicensing",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Compute/hostGroups/hosts/read"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e8, 9e8),
      },
      message: `Dedicated host licensing ${props.licenseType}: ${props.detail}`,
    };
  }

  if (variant === "host_binpack") {
    const props = {
      usedCores: isErr ? randInt(52, 64) : randInt(24, 48),
      totalCores: 64,
      vmCount: randInt(4, 22),
      fragmentationScore: isErr ? randFloat(0.72, 0.95) : randFloat(0.12, 0.45),
      recommendation: isErr
        ? "Defragment: migrate two Standard_E8s_v5 instances to consolidate NUMA locality"
        : "Binpack score nominal; defer maintenance",
      measurementWindow: "PT15M",
    };
    const { properties: bpProps, error: bpErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Compute/hostGroups/hosts/instanceView/read",
      category: "DedicatedHostPlacementAnalytics",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(Math.round((props.fragmentationScore as number) * 100)),
      callerIpAddress: "169.254.169.254",
      correlationId,
      level: isErr ? "Information" : "Information",
      properties: bpProps,
      ...(bpErr ? { error: bpErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Compute/hostGroups/hosts"),
      azure: {
        dedicated_host: {
          host_group: hg,
          host_name: host,
          resource_group: resourceGroup,
          category: "DedicatedHostPlacementAnalytics",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Compute/hostGroups/hosts/instanceView/read"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e7, 6e8),
      },
      message: isErr
        ? `Dedicated host binpack risk on ${host}: ${props.recommendation}`
        : `Dedicated host binpack OK (${props.usedCores}/${props.totalCores} cores used)`,
    };
  }

  const props = {
    maintenanceScope: "Host",
    impact: isErr ? "Unexpected reboot required within 24h" : "Planned maintenance completed",
    window: `2026-0${randInt(5, 8)}-${randInt(10, 28)}T02:00:00Z`,
    status: isErr ? "PendingCustomerAction" : "Completed",
  };
  const { properties: maintProps, error: maintErr } = withComputeAzureErrors(
    isErr,
    variant,
    props as Record<string, unknown>
  );
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.Compute/hostGroups/hosts/maintenance/schedule",
    category: "ScheduledEvents",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.status,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: maintProps,
    ...(maintErr ? { error: maintErr } : {}),
    cloud: azureCloud(region, subscription, "Microsoft.Compute/hostGroups/hosts"),
    azure: {
      dedicated_host: {
        host_group: hg,
        host_name: host,
        resource_group: resourceGroup,
        category: "ScheduledEvents",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["host"],
      type: isErr ? ["error"] : ["info"],
      action: String("Microsoft.Compute/hostGroups/hosts/maintenance/schedule"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(1e9, 4e9),
    },
    message: isErr
      ? `Dedicated host ${host}: maintenance event requires action — ${props.impact}`
      : `Dedicated host ${host}: ${props.impact}`,
  };
}

/** Capacity Reservation — utilization and allocation changes. */
export function generateCapacityReservationLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const crg = `crg-${randId(5).toLowerCase()}`;
  const cr = `res-${rand(["prod", "batch"])}-${randId(4).toLowerCase()}`;
  const resourceId = armCapacityReservation(subscription.id, resourceGroup, crg, cr);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const total = randInt(16, 128);
  const used = isErr ? total : randInt(4, total - 4);
  const variant = rand([
    "util",
    "admin",
    "split_share",
    "forecast_commit",
    "tagging",
    "cross_sub",
  ] as const);

  if (variant === "util") {
    const props = {
      reservedVmSlots: total,
      utilizedVmSlots: used,
      utilizationPercent: (used / total) * 100,
      sku: rand(["Standard_DASv5", "Standard_E16s_v5"]),
      message: isErr
        ? "Overcommit risk: requested VM size family not compatible with reservation SKU"
        : "Utilization within expected bounds for billing window",
    };
    const { properties: crUProps, error: crUErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName:
        "Microsoft.Compute/capacityReservationGroups/capacityReservations/metrics/write",
      category: "CapacityReservationUtilization",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(Math.round(props.utilizationPercent as number)),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: crUProps,
      ...(crUErr ? { error: crUErr } : {}),
      cloud: azureCloud(
        region,
        subscription,
        "Microsoft.Compute/capacityReservationGroups/capacityReservations"
      ),
      azure: {
        capacity_reservation: {
          group: crg,
          name: cr,
          resource_group: resourceGroup,
          category: "CapacityReservationUtilization",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("azure-activity"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e8, 1e9),
      },
      message: isErr
        ? `Capacity reservation ${cr}: utilization check failed — ${props.message}`
        : `Capacity reservation ${cr}: ${used}/${total} slots utilized (${props.utilizationPercent.toFixed(1)}%)`,
    };
  }

  if (variant === "split_share") {
    const props = {
      parentReservationId: resourceId,
      shareName: `share-${randId(6).toLowerCase()}`,
      splitPercentToChild: randInt(20, 60),
      childReservationName: `${cr}-child`,
      reconcileState: isErr ? "Failed" : "Succeeded",
      armOperation: "Microsoft.Compute/capacityReservationGroups/capacityReservations/shares/write",
      detail: isErr
        ? "split share violated minimum slot floor; ARM rejected nested reservation"
        : "capacity share applied; billing owner retained on parent CRG",
    };
    const { properties: ssProps, error: ssErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: props.armOperation,
      category: "CapacityReservationShare",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.reconcileState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: ssProps,
      ...(ssErr ? { error: ssErr } : {}),
      cloud: azureCloud(
        region,
        subscription,
        "Microsoft.Compute/capacityReservationGroups/capacityReservations"
      ),
      azure: {
        capacity_reservation: {
          group: crg,
          name: cr,
          resource_group: resourceGroup,
          category: "CapacityReservationShare",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String(props.armOperation),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e8, 5e9),
      },
      message: isErr
        ? `CR share failed: ${props.detail}`
        : `CR ${cr}: shared ${props.splitPercentToChild}% to ${props.childReservationName}`,
    };
  }

  if (variant === "forecast_commit") {
    const props = {
      forecastHorizonDays: rand([30, 90, 180]),
      recommendedQuantityDelta: isErr ? 0 : randInt(4, 32),
      confidence: isErr ? randFloat(0.35, 0.55) : randFloat(0.78, 0.94),
      skuFamily: rand(["Dv5", "Ev5"]),
      plannerMessage: isErr
        ? "forecast engine could not converge: insufficient historical utilization"
        : "forecast suggests incremental commit before next EA true-up",
    };
    const { properties: fcProps, error: fcErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName:
        "Microsoft.Compute/capacityReservationGroups/capacityReservations/providers/Microsoft.Advisor/recommendations/read",
      category: "CapacityReservationForecast",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "NoRecommendation" : "CommitMore",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Information" : "Information",
      properties: fcProps,
      ...(fcErr ? { error: fcErr } : {}),
      cloud: azureCloud(
        region,
        subscription,
        "Microsoft.Compute/capacityReservationGroups/capacityReservations"
      ),
      azure: {
        capacity_reservation: {
          group: crg,
          name: cr,
          resource_group: resourceGroup,
          category: "CapacityReservationForecast",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("azure-activity"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e8, 2e9),
      },
      message: isErr
        ? `CR forecast ${cr}: ${props.plannerMessage}`
        : `CR forecast ${cr}: +${props.recommendedQuantityDelta} slots (${props.skuFamily})`,
    };
  }

  if (variant === "tagging") {
    const props = {
      operation: "Microsoft.Compute/capacityReservationGroups/capacityReservations/tags/write",
      tags: { costCenter: `cc-${randId(4)}`, owner: `team-${rand(["core", "data"])}` },
      policyEvaluation: isErr ? "NonCompliant" : "Compliant",
      missingRequired: isErr ? ["Environment"] : [],
    };
    const { properties: tagProps, error: tagErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: props.operation,
      category: "CapacityReservationPolicy",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.policyEvaluation,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: tagProps,
      ...(tagErr ? { error: tagErr } : {}),
      cloud: azureCloud(
        region,
        subscription,
        "Microsoft.Compute/capacityReservationGroups/capacityReservations"
      ),
      azure: {
        capacity_reservation: {
          group: crg,
          name: cr,
          resource_group: resourceGroup,
          category: "CapacityReservationPolicy",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String(props.operation),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e8, 8e8),
      },
      message: isErr
        ? `CR ${cr}: tag policy violation ${props.missingRequired.join(",")}`
        : `CR ${cr}: tags applied for chargeback`,
    };
  }

  if (variant === "cross_sub") {
    const props = {
      operation:
        "Microsoft.Compute/capacityReservationGroups/capacityReservations/sharingProfiles/write",
      subscriberSubscriptionId: randUUID(),
      sharingProfileName: `shareprof-${randId(4).toLowerCase()}`,
      state: isErr ? "Revoked" : "Active",
      detail: isErr
        ? "cross-subscription sharing profile blocked: billing account mismatch"
        : "capacity visible to linked subscription for VM placement",
    };
    const { properties: xsProps, error: xsErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: props.operation,
      category: "CapacityReservationSharing",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.state,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: xsProps,
      ...(xsErr ? { error: xsErr } : {}),
      cloud: azureCloud(
        region,
        subscription,
        "Microsoft.Compute/capacityReservationGroups/capacityReservations"
      ),
      azure: {
        capacity_reservation: {
          group: crg,
          name: cr,
          resource_group: resourceGroup,
          category: "CapacityReservationSharing",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String(props.operation),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e8, 4e9),
      },
      message: isErr
        ? `CR cross-sub share failed: ${props.detail}`
        : `CR ${cr}: sharing profile ${props.state.toLowerCase()}`,
    };
  }

  const delta = isErr ? 0 : randInt(-8, 16);
  const props = {
    previousQuantity: total,
    newQuantity: total + delta,
    status: isErr ? "Failed" : "Succeeded",
    reason: isErr
      ? "Allocation request would exceed regional quota for reserved VM family"
      : "Capacity reservation quantity updated per scale plan",
  };
  const { properties: crWProps, error: crWErr } = withComputeAzureErrors(
    isErr,
    variant,
    props as Record<string, unknown>
  );
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.Compute/capacityReservationGroups/capacityReservations/write",
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "403" : "200",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: crWProps,
    ...(crWErr ? { error: crWErr } : {}),
    cloud: azureCloud(
      region,
      subscription,
      "Microsoft.Compute/capacityReservationGroups/capacityReservations"
    ),
    azure: {
      capacity_reservation: {
        group: crg,
        name: cr,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["host"],
      type: isErr ? ["error"] : ["info"],
      action: String("Microsoft.Compute/capacityReservationGroups/capacityReservations/write"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(2e8, 5e9),
    },
    message: isErr
      ? `Capacity reservation ${cr}: write failed — ${props.reason}`
      : `Capacity reservation ${cr}: quantity ${props.previousQuantity} -> ${props.newQuantity}`,
  };
}

/** Proximity Placement Group — membership changes. */
export function generateProximityPlacementLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const ppg = `ppg-${randId(6).toLowerCase()}`;
  const resourceId = armPpg(subscription.id, resourceGroup, ppg);
  const vm = `vm-${randId(5).toLowerCase()}`;
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);

  const variant = rand([
    "member",
    "admin",
    "colocation_audit",
    "zone_balance",
    "maintenance_eject",
    "arm_lock",
  ] as const);
  if (variant === "admin") {
    const props = {
      eventCategory: "Administrative",
      status: isErr ? "Failed" : "Succeeded",
      intent: rand(["Cluster", "Standard"]),
      httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
    };
    const { properties: ppgAdmProps, error: ppgAdmErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Compute/proximityPlacementGroups/write",
      category: "Administrative",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "400" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: ppgAdmProps,
      ...(ppgAdmErr ? { error: ppgAdmErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Compute/proximityPlacementGroups"),
      azure: {
        proximity_placement_groups: {
          name: ppg,
          resource_group: resourceGroup,
          category: "Administrative",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Compute/proximityPlacementGroups/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e8, 3e9),
      },
      message: isErr
        ? `PPG ${ppg}: update failed (intent / zone constraint)`
        : `PPG ${ppg}: configuration updated`,
    };
  }

  if (variant === "colocation_audit") {
    const props = {
      vmResourceId: armVm(subscription.id, resourceGroup, vm),
      latencyP99MsSameRack: isErr ? randFloat(1.2, 4.8) : randFloat(0.05, 0.35),
      latencyP99MsCrossZone: isErr ? randFloat(6, 28) : randFloat(0.4, 2.1),
      colocationScore: isErr ? randInt(32, 58) : randInt(82, 98),
      detail: isErr
        ? "PPG colocation audit failed: eastus-2 traffic hairpinning across availability zones"
        : "PPG members within expected network proximity for storage traffic class",
    };
    const { properties: caProps, error: caErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Compute/proximityPlacementGroups/instanceView/read",
      category: "ProximityPlacementColocationAudit",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.colocationScore),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: caProps,
      ...(caErr ? { error: caErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Compute/proximityPlacementGroups"),
      azure: {
        proximity_placement_groups: {
          name: ppg,
          vm_name: vm,
          resource_group: resourceGroup,
          category: "ProximityPlacementColocationAudit",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Compute/proximityPlacementGroups/instanceView/read"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e8, 12e8),
      },
      message: props.detail,
    };
  }

  if (variant === "zone_balance") {
    const props = {
      zones: ["1", "2", "3"],
      imbalanceRatio: isErr ? randFloat(0.45, 0.82) : randFloat(0.05, 0.22),
      suggestion: isErr
        ? "rebalance: drain zone 1 before next scale-out to respect PPG skew policy"
        : "zone spread within policy; no reschedule required",
      evaluatedVms: randInt(8, 120),
    };
    const { properties: zbProps, error: zbErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Compute/proximityPlacementGroups/virtualMachines/read",
      category: "ProximityPlacementZoneBalance",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "Imbalanced" : "Balanced",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Information" : "Information",
      properties: zbProps,
      ...(zbErr ? { error: zbErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Compute/proximityPlacementGroups"),
      azure: {
        proximity_placement_groups: {
          name: ppg,
          vm_name: vm,
          resource_group: resourceGroup,
          category: "ProximityPlacementZoneBalance",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Compute/proximityPlacementGroups/virtualMachines/read"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(8e7, 9e8),
      },
      message: `[ppg] Zone balance ${ppg}: ${props.suggestion}`,
    };
  }

  if (variant === "maintenance_eject") {
    const props = {
      eventId: randUUID(),
      impact: isErr
        ? "VMs still pinned to host under maintenance"
        : "VMs evacuated from impacted host",
      hostId: `host-${randId(6).toLowerCase()}`,
      rescheduleAttempts: isErr ? randInt(2, 8) : randInt(0, 1),
    };
    const { properties: meProps, error: meErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Compute/proximityPlacementGroups/scheduledEvents/read",
      category: "ProximityPlacementMaintenance",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.impact.slice(0, 12),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: meProps,
      ...(meErr ? { error: meErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Compute/proximityPlacementGroups"),
      azure: {
        proximity_placement_groups: {
          name: ppg,
          vm_name: vm,
          resource_group: resourceGroup,
          category: "ProximityPlacementMaintenance",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Compute/proximityPlacementGroups/scheduledEvents/read"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e9, 8e9),
      },
      message: `PPG maintenance on ${props.hostId}: ${props.impact}`,
    };
  }

  if (variant === "arm_lock") {
    const props = {
      lockId: `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Authorization/locks/ppg-${ppg}`,
      lockLevel: "CanNotDelete",
      mutatingCaller: rand(["deploymentScript", "terraform-provider-azurerm"]),
      blockedOperation: "Microsoft.Compute/proximityPlacementGroups/delete",
      detail: isErr
        ? "delete blocked by resource lock; remove CanNotDelete before PPG teardown"
        : "lock validated; destructive changes prevented during change window",
    };
    const { properties: lkProps, error: lkErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: isErr
        ? props.blockedOperation
        : "Microsoft.Compute/proximityPlacementGroups/read",
      category: "Administrative",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "409" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: lkProps,
      ...(lkErr ? { error: lkErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Compute/proximityPlacementGroups"),
      azure: {
        proximity_placement_groups: {
          name: ppg,
          vm_name: vm,
          resource_group: resourceGroup,
          category: "Administrative",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String(isErr),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e8, 2e9),
      },
      message: props.detail,
    };
  }

  const props = {
    resourceId: armVm(subscription.id, resourceGroup, vm),
    action: isErr ? "Remove" : "Add",
    outcome: isErr ? "Failed" : "Succeeded",
    message: isErr
      ? `Cannot add VM ${vm}: not colocated in allowed region/zone for PPG ${ppg}`
      : `VM ${vm} associated with proximity placement group ${ppg}`,
  };
  const { properties: membOutProps, error: membOutErr } = withComputeAzureErrors(
    isErr,
    variant,
    props as Record<string, unknown>
  );
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.Compute/proximityPlacementGroups/virtualMachines/join/action",
    category: "ProximityPlacementGroupEvents",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.action,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: membOutProps,
    ...(membOutErr ? { error: membOutErr } : {}),
    cloud: azureCloud(region, subscription, "Microsoft.Compute/proximityPlacementGroups"),
    azure: {
      proximity_placement_groups: {
        name: ppg,
        vm_name: vm,
        resource_group: resourceGroup,
        category: "ProximityPlacementGroupEvents",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["host"],
      type: isErr ? ["error"] : ["info"],
      action: String("Microsoft.Compute/proximityPlacementGroups/virtualMachines/join/action"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(1e8, 2e9),
    },
    message: props.message as string,
  };
}

/** Compute Gallery — image version publish and replication. */
export function generateComputeGalleryLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const gallery = `gal${randId(6).toLowerCase()}`;
  const image = `img-${rand(["ubuntu", "win", "rhel"])}-${randId(3)}`;
  const version = `${randInt(0, 3)}.${randInt(0, 9)}.${randInt(0, 40)}`;
  const resourceId = armGalleryImageVersion(
    subscription.id,
    resourceGroup,
    gallery,
    image,
    version
  );
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "publish",
    "replica",
    "admin",
    "signing_jws",
    "deprecation_schedule",
    "rbac_share_grant",
  ] as const);

  if (variant === "publish") {
    const props = {
      galleryName: gallery,
      galleryImageName: image,
      galleryImageVersionName: version,
      publishingState: isErr ? "Failed" : "Succeeded",
      replicationProgress: isErr ? randInt(0, 40) : 100,
      errorMessage: isErr ? "Source managed disk snapshot not found or reader access denied" : "",
    };
    const { properties: gpProps, error: gpErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Compute/galleries/images/versions/write",
      category: "GalleryImageVersionPublish",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.publishingState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: gpProps,
      ...(gpErr ? { error: gpErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Compute/galleries"),
      azure: {
        compute_gallery: {
          gallery_name: gallery,
          image_name: image,
          version,
          resource_group: resourceGroup,
          category: "GalleryImageVersionPublish",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Compute/galleries/images/versions/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e8, 2e10),
      },
      message: isErr
        ? `Gallery ${gallery}: image ${image}:${version} publish failed`
        : `Gallery ${gallery}: published ${image} version ${version}`,
    };
  }

  if (variant === "replica") {
    const targetRegion = rand(["eastus2", "westeurope", "uksouth"]);
    const props = {
      targetRegion,
      replicationState: isErr ? "Failed" : "Completed",
      progressPercent: isErr ? randInt(5, 60) : 100,
      failureReason: isErr ? "Blob copy timed out in target region (storage throttling)" : "",
    };
    const { properties: grProps, error: grErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Compute/galleries/images/versions/replicate/action",
      category: "GalleryReplicationStatus",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.replicationState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: grProps,
      ...(grErr ? { error: grErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Compute/galleries"),
      azure: {
        compute_gallery: {
          gallery_name: gallery,
          image_name: image,
          version,
          resource_group: resourceGroup,
          category: "GalleryReplicationStatus",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Compute/galleries/images/versions/replicate/action"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(8e8, 1.5e10),
      },
      message: isErr
        ? `Gallery replication to ${targetRegion} failed for ${gallery}/${image}:${version}`
        : `Gallery image ${image}:${version} replicated to ${targetRegion}`,
    };
  }

  if (variant === "signing_jws") {
    const props = {
      imageVersionFullyQualifiedId: `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Compute/galleries/${gallery}/images/${image}/versions/${version}`,
      kmsKeyVersionId: `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.KeyVault/vaults/kv-${randId(4)}/keys/gallery-sign/versions/${rand(["1", "2"])}`,
      jwsKid: randUUID(),
      signatureValid: !isErr,
      cosignEquivalent: rand(["Fulcio", "ADCS"]),
      reason: isErr
        ? "JWT signature verification failed: key rollover mismatch"
        : "Dual-signed manifest accepted by regional gallery frontdoor",
    };
    const { properties: sgProps, error: sgErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Compute/galleries/images/versions/startSigning/action",
      category: "GallerySigning",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.signatureValid ? "Signed" : "InvalidSignature",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: sgProps,
      ...(sgErr ? { error: sgErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Compute/galleries"),
      azure: {
        compute_gallery: {
          gallery_name: gallery,
          image_name: image,
          version,
          resource_group: resourceGroup,
          category: "GallerySigning",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Compute/galleries/images/versions/startSigning/action"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(8e8, 5e9),
      },
      message: isErr
        ? `Gallery signing failed: ${props.reason}`
        : `Gallery ${gallery}: ${image}:${version} signed`,
    };
  }

  if (variant === "deprecation_schedule") {
    const props = {
      imageVersionName: `${image}:${version}`,
      scheduledDeprecateOn: `${randInt(2026, 2027)}-${String(randInt(1, 12)).padStart(2, "0")}-15`,
      replacementVersionHint: `${image}:${randInt(0, 3)}.${randInt(0, 9)}.${randInt(0, 41)}`,
      complianceTag: rand(["SOC2", "PCI"]),
      revokeNewDeploysAfter: "+P30D",
      state: isErr ? "RollbackRequired" : "Scheduled",
      detail: isErr
        ? "deprecation window conflicts with sovereign cloud export hold"
        : "users notified via subscription activity log advisory",
    };
    const { properties: dsProps, error: dsErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Compute/galleries/images/versions/endOfLife/action",
      category: "GalleryDeprecation",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.state,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: dsProps,
      ...(dsErr ? { error: dsErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Compute/galleries"),
      azure: {
        compute_gallery: {
          gallery_name: gallery,
          image_name: image,
          version,
          resource_group: resourceGroup,
          category: "GalleryDeprecation",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Compute/galleries/images/versions/endOfLife/action"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(6e8, 4e9),
      },
      message: `Gallery deprecation ${gallery}/${props.imageVersionName}: ${props.detail}`,
    };
  }

  if (variant === "rbac_share_grant") {
    const props = {
      shareName: `share-${gallery}-${randId(4).toLowerCase()}`,
      targetTenantId: randUUID(),
      roleDefinitionId: `/subscriptions/${subscription.id}/providers/Microsoft.Authorization/roleDefinitions/${randUUID()}`,
      operation: "Microsoft.Compute/galleries/providers/Microsoft.Authorization/permissions/write",
      state: isErr ? "Failed" : "Granted",
      detail: isErr
        ? "cross-tenant RBAC propagation blocked by policy Deny.GalleryShare.Outbound"
        : "fine-grained actions Compute.Gallery.Artifact/read granted to consumer tenant",
    };
    const { properties: rbProps, error: rbErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: props.operation,
      category: "GalleryDirectSharedGallery",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.state,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: rbProps,
      ...(rbErr ? { error: rbErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Compute/galleries"),
      azure: {
        compute_gallery: {
          gallery_name: gallery,
          image_name: image,
          version,
          resource_group: resourceGroup,
          category: "GalleryDirectSharedGallery",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String(props.operation),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e9, 7e9),
      },
      message: isErr
        ? `Gallery share RBAC failed: ${props.detail}`
        : `Gallery share ${props.shareName} granted`,
    };
  }

  const props = {
    eventCategory: "Administrative",
    status: isErr ? "Failed" : "Succeeded",
    httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
  };
  const galOnly = armGallery(subscription.id, resourceGroup, gallery);
  const { properties: gadProps, error: gadErr } = withComputeAzureErrors(
    isErr,
    variant,
    props as Record<string, unknown>
  );
  return {
    "@timestamp": ts,
    time,
    resourceId: galOnly,
    operationName: "Microsoft.Compute/galleries/write",
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "409" : "200",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: gadProps,
    ...(gadErr ? { error: gadErr } : {}),
    cloud: azureCloud(region, subscription, "Microsoft.Compute/galleries"),
    azure: {
      compute_gallery: {
        gallery_name: gallery,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["host"],
      type: isErr ? ["error"] : ["info"],
      action: String("Microsoft.Compute/galleries/write"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(1e8, 4e9),
    },
    message: isErr
      ? `Compute gallery ${gallery}: create/update failed`
      : `Compute gallery ${gallery}: ARM write succeeded`,
  };
}

/** Confidential VM — attestation and guest policy. */
export function generateConfidentialVmLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const vmName = `ccvm-${randId(5).toLowerCase()}`;
  const resourceId = armVm(subscription.id, resourceGroup, vmName);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "attest",
    "secureboot",
    "admin",
    "policy_audit",
    "key_release",
    "defender_addon",
  ] as const);

  if (variant === "attest") {
    const props = {
      attestationType: "SEV-SNP",
      attestationReportStatus: isErr ? "Invalid" : "Verified",
      complianceStatus: isErr ? "NonCompliant" : "Compliant",
      quoteDigest: `sha384:${randId(48).toLowerCase()}`,
      error: isErr ? "Guest attestation quote verification failed: measurement mismatch" : "",
    };
    const { properties: ccaProps, error: ccaErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Compute/virtualMachines/guestAttestationStatus/read",
      category: "ConfidentialVmAttestation",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.attestationReportStatus,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: ccaProps,
      ...(ccaErr ? { error: ccaErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Compute/virtualMachines"),
      azure: {
        confidential_vm: {
          vm_name: vmName,
          resource_group: resourceGroup,
          category: "ConfidentialVmAttestation",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Compute/virtualMachines/guestAttestationStatus/read"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e7, 2e9),
      },
      message: isErr
        ? `Confidential VM ${vmName}: attestation invalid (${props.error})`
        : `Confidential VM ${vmName}: attestation verified (${props.attestationType})`,
    };
  }

  if (variant === "secureboot") {
    const props = {
      secureBootEnabled: true,
      vTpmEnabled: true,
      state: isErr ? "Violation" : "Compliant",
      firmwareSigner: isErr ? "UNTRUSTED" : "Microsoft Windows UEFI CA 2023",
      detail: isErr
        ? "Secure Boot forbids loading unauthorized kernel module during boot"
        : "Measured boot chain matched expected PCR policy",
    };
    const { properties: sbProps, error: sbErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Compute/virtualMachines/instanceView/read",
      category: "ConfidentialVmSecurity",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.state,
      callerIpAddress: "169.254.169.254",
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: sbProps,
      ...(sbErr ? { error: sbErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Compute/virtualMachines"),
      azure: {
        confidential_vm: {
          vm_name: vmName,
          resource_group: resourceGroup,
          category: "ConfidentialVmSecurity",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Compute/virtualMachines/instanceView/read"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e7, 1e9),
      },
      message: isErr
        ? `Confidential VM ${vmName}: secure boot violation — ${props.detail}`
        : `Confidential VM ${vmName}: secure boot and vTPM policy OK`,
    };
  }

  if (variant === "policy_audit") {
    const props = {
      policyAssignment:
        "/providers/Microsoft.Authorization/policyAssignments/confidential-vm-baseline",
      complianceState: isErr ? "NonCompliant" : "Compliant",
      evaluatedRules: [
        "encryptionAtHost",
        "securityTypeRequiresConfidentialVM",
        "disablePasswordAuth-linux",
      ],
      failedRules: isErr ? ["encryptionAtHost"] : [],
      remediation: isErr
        ? "enforce encryptionAtHost on underlying OS disk SKU"
        : "no drift detected",
      extensionExpectedVersion: rand(["1.2.4", "1.3.0"]),
    };
    const { properties: paProps, error: paErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.PolicyInsights/policyTrackedResources/read",
      category: "ConfidentialVmCompliance",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.complianceState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: paProps,
      ...(paErr ? { error: paErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Compute/virtualMachines"),
      azure: {
        confidential_vm: {
          vm_name: vmName,
          resource_group: resourceGroup,
          category: "ConfidentialVmCompliance",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.PolicyInsights/policyTrackedResources/read"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e8, 2e9),
      },
      message: isErr
        ? `Confidential VM ${vmName}: policy audit failed (${props.failedRules.join(",")})`
        : `Confidential VM ${vmName}: policy baseline OK`,
    };
  }

  if (variant === "key_release") {
    const props = {
      keyVaultReference: `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.KeyVault/vaults/kv-${randId(4)}/secrets/disk-kek`,
      releaseAuthority: "AzureAttestation",
      releaseTicket: randUUID(),
      unwrapStatus: isErr ? "Denied" : "Issued",
      maaUrl: `https://maanamespace.${region}.attest.azure.net`,
      reason: isErr
        ? "key release denied: attestation claims did not include expected security version"
        : "disk KEK unwrapped to guest via secure channel",
    };
    const { properties: krProps, error: krErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Compute/virtualMachines/extensions/write",
      category: "ConfidentialVmKeyRelease",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.unwrapStatus,
      callerIpAddress: "169.254.169.254",
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: krProps,
      ...(krErr ? { error: krErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Compute/virtualMachines"),
      azure: {
        confidential_vm: {
          vm_name: vmName,
          resource_group: resourceGroup,
          category: "ConfidentialVmKeyRelease",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Compute/virtualMachines/extensions/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e8, 4e9),
      },
      message: isErr
        ? `Key release failed for ${vmName}: ${props.reason}`
        : `Key release ticket ${props.releaseTicket} consumed`,
    };
  }

  if (variant === "defender_addon") {
    const props = {
      extensionName: "AzureSecurityLinuxAgent",
      channel: "Confidential",
      scanMode: rand(["quick", "full"]),
      findings: isErr ? randInt(2, 12) : 0,
      quarantineState: isErr ? "Pending" : "Clear",
      detail: isErr
        ? "MDE sensor could not load eBPF helper on CVM kernel line"
        : "sensor healthy; no active threats in enclave boundary",
    };
    const { properties: defProps, error: defErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName:
        "Microsoft.Compute/virtualMachines/extensions/Microsoft.Azure.AzureDefenderForServers/write",
      category: "ConfidentialVmDefender",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.quarantineState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: defProps,
      ...(defErr ? { error: defErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Compute/virtualMachines"),
      azure: {
        confidential_vm: {
          vm_name: vmName,
          resource_group: resourceGroup,
          category: "ConfidentialVmDefender",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("azure-activity"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e8, 3e9),
      },
      message: isErr
        ? `Defender on CVM ${vmName}: ${props.detail}`
        : `Defender scan (${props.scanMode}) clean on ${vmName}`,
    };
  }

  const op = isErr
    ? "Microsoft.Compute/virtualMachines/write"
    : "Microsoft.Compute/virtualMachines/start/action";
  const props = {
    securityType: "ConfidentialVM",
    encryptionAtHost: true,
    eventCategory: "Administrative",
    status: isErr ? "Failed" : "Succeeded",
    httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
  };
  const { properties: ccAdmProps, error: ccAdmErr } = withComputeAzureErrors(
    isErr,
    variant,
    props as Record<string, unknown>
  );
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: op,
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "400" : "200",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: ccAdmProps,
    ...(ccAdmErr ? { error: ccAdmErr } : {}),
    cloud: azureCloud(region, subscription, "Microsoft.Compute/virtualMachines"),
    azure: {
      confidential_vm: {
        vm_name: vmName,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["host"],
      type: isErr ? ["error"] : ["info"],
      action: String(op),
      outcome: isErr ? "failure" : "success",
      duration: randInt(2e8, 6e9),
    },
    message: isErr
      ? `Confidential VM ${vmName}: control-plane operation failed`
      : `Confidential VM ${vmName}: ${op} succeeded`,
  };
}

/** Image Builder — template run, customize, distribute. */
export function generateImageBuilderLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const tmpl = `imgtmpl-${randId(6).toLowerCase()}`;
  const resourceId = armImageTemplate(subscription.id, resourceGroup, tmpl);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const runId = randUUID();
  const variant = rand([
    "run",
    "customize",
    "distribute",
    "admin",
    "validate_sources",
    "sysprep_specialize",
  ] as const);

  if (variant === "run") {
    const props = {
      runState: isErr ? "Failed" : "Succeeded",
      runId,
      sourceImage: `MicrosoftWindowsServer:WindowsServer:2022-datacenter-azure-edition:latest`,
      buildTimeoutMinutes: 120,
      error: isErr
        ? "ProvisioningStep failed: Azure VM agent did not report ready within timeout"
        : "",
    };
    const { properties: ibRProps, error: ibRErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.VirtualMachineImages/imageTemplates/run/action",
      category: "ImageTemplateBuild",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.runState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: ibRProps,
      ...(ibRErr ? { error: ibRErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.VirtualMachineImages/imageTemplates"),
      azure: {
        image_builder: {
          template_name: tmpl,
          resource_group: resourceGroup,
          category: "ImageTemplateBuild",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.VirtualMachineImages/imageTemplates/run/action"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(6e9, 3.6e11),
      },
      message: isErr
        ? `Image Builder ${tmpl}: run ${runId} failed — ${props.error}`
        : `Image Builder ${tmpl}: template run ${runId} completed`,
    };
  }

  if (variant === "customize") {
    const props = {
      step: rand(["shell", "windows-update", "powershell"]),
      stepState: isErr ? "Failed" : "Succeeded",
      durationSeconds: randInt(30, 900),
      detail: isErr
        ? "Customizing step exited with non-zero status: DISM component store repair failed"
        : "Customization phase completed without errors",
    };
    const { properties: ibCProps, error: ibCErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.VirtualMachineImages/imageTemplates/customize/write",
      category: "ImageTemplateCustomize",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.stepState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: ibCProps,
      ...(ibCErr ? { error: ibCErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.VirtualMachineImages/imageTemplates"),
      azure: {
        image_builder: {
          template_name: tmpl,
          resource_group: resourceGroup,
          category: "ImageTemplateCustomize",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.VirtualMachineImages/imageTemplates/customize/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e8, 5e9),
      },
      message: isErr
        ? `Image Builder ${tmpl}: customize step '${props.step}' failed`
        : `Image Builder ${tmpl}: customize step '${props.step}' ok`,
    };
  }

  if (variant === "distribute") {
    const destGallery = `gal${randId(4).toLowerCase()}`;
    const props = {
      targetRegions: [region, rand(["eastus2", "westus2"])],
      galleryImageId: `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Compute/galleries/${destGallery}/images/${tmpl}`,
      distributionState: isErr ? "Failed" : "Succeeded",
      message: isErr
        ? "Distribute step failed: destination gallery Image Definition not found"
        : "Managed image and gallery version artifacts published",
    };
    const { properties: ibDProps, error: ibDErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.VirtualMachineImages/imageTemplates/distribute/action",
      category: "ImageTemplateDistribute",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.distributionState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: ibDProps,
      ...(ibDErr ? { error: ibDErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.VirtualMachineImages/imageTemplates"),
      azure: {
        image_builder: {
          template_name: tmpl,
          resource_group: resourceGroup,
          category: "ImageTemplateDistribute",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.VirtualMachineImages/imageTemplates/distribute/action"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e9, 1.2e11),
      },
      message: isErr
        ? `Image Builder ${tmpl}: distribute failed — ${props.message}`
        : `Image Builder ${tmpl}: distributed to ${props.targetRegions.join(", ")}`,
    };
  }

  if (variant === "validate_sources") {
    const props = {
      validatedChecks: rand([
        ["vhdChecksum", "planInfo", "hyperVGeneration"],
        ["sigImagePermissions", "replicationReplicas"],
      ]),
      checksumAlgorithm: rand(["SHA256", "CRC64"]),
      validationState: isErr ? "Rejected" : "Accepted",
      sourceResourceId: `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Compute/disks/src-${randId(4)}`,
      detail: isErr
        ? "source disk generation V1 incompatible with ConfidentialVM trusted launch target"
        : "checksum and license plan validation passed prior to provisioning VM",
    };
    const { properties: ivProps, error: ivErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.VirtualMachineImages/imageTemplates/read",
      category: "ImageTemplateValidation",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.validationState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: ivProps,
      ...(ivErr ? { error: ivErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.VirtualMachineImages/imageTemplates"),
      azure: {
        image_builder: {
          template_name: tmpl,
          resource_group: resourceGroup,
          category: "ImageTemplateValidation",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.VirtualMachineImages/imageTemplates/read"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e8, 3e9),
      },
      message: isErr
        ? `Image template validate failed: ${props.detail}`
        : `Image template ${tmpl}: preflight OK`,
    };
  }

  if (variant === "sysprep_specialize") {
    const props = {
      specializePass: "offlineServicing",
      unattendXmlDigest: `sha256:${randHexId(64)}`,
      guestOs: rand(["Windows-Server2022-Azure", "Windows-11-multi"]),
      specializationState: isErr ? "Failed" : "Succeeded",
      lastProviderError: isErr
        ? "SYSPREP specialize: provisioning plugin AzureGuestAgent stalled on KMS activation"
        : "",
      provisioningMs: randInt(120000, 900000),
    };
    const { properties: syProps, error: syErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.VirtualMachineImages/imageTemplates/run/action",
      category: "ImageTemplateSysprep",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.specializationState,
      callerIpAddress: "169.254.169.254",
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: syProps,
      ...(syErr ? { error: syErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.VirtualMachineImages/imageTemplates"),
      azure: {
        image_builder: {
          template_name: tmpl,
          resource_group: resourceGroup,
          category: "ImageTemplateSysprep",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.VirtualMachineImages/imageTemplates/run/action"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e9, 9e10),
      },
      message: isErr
        ? `Sysprep specialize failed on ${props.guestOs}: ${props.lastProviderError}`
        : `Sysprep specialize completed (${props.specializePass})`,
    };
  }

  const props = {
    eventCategory: "Administrative",
    status: isErr ? "Failed" : "Succeeded",
    httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
  };
  const { properties: ibAProps, error: ibAErr } = withComputeAzureErrors(
    isErr,
    variant,
    props as Record<string, unknown>
  );
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.VirtualMachineImages/imageTemplates/write",
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "400" : "200",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: ibAProps,
    ...(ibAErr ? { error: ibAErr } : {}),
    cloud: azureCloud(region, subscription, "Microsoft.VirtualMachineImages/imageTemplates"),
    azure: {
      image_builder: {
        template_name: tmpl,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["host"],
      type: isErr ? ["error"] : ["info"],
      action: String("Microsoft.VirtualMachineImages/imageTemplates/write"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(1e8, 3e9),
    },
    message: isErr
      ? `Image template ${tmpl}: ARM template write failed`
      : `Image template ${tmpl}: create or update succeeded`,
  };
}

/** Azure VMware Solution — private cloud and NSX / vCenter style events. */
export function generateVmwareSolutionLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const cloudName = `avs-${rand(["prod", "dr"])}-${randId(4).toLowerCase()}`;
  const resourceId = armAvs(subscription.id, resourceGroup, cloudName);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "admin",
    "nsx",
    "vcenter",
    "hcx_extend",
    "srm_protect",
    "ops_insights",
  ] as const);

  if (variant === "admin") {
    const op = isErr
      ? "Microsoft.AVS/privateClouds/write"
      : rand([
          "Microsoft.AVS/privateClouds/write",
          "Microsoft.AVS/privateClouds/rotateNsxtPassword/action",
          "Microsoft.AVS/privateClouds/rotateVcenterPassword/action",
        ]);
    const props = {
      eventCategory: "Administrative",
      status: isErr ? "Failed" : "Succeeded",
      clusterSize: rand([16, 32, 64]),
      httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
    };
    const { properties: avsAdProps, error: avsAdErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: op,
      category: "Administrative",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "500" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: avsAdProps,
      ...(avsAdErr ? { error: avsAdErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.AVS/privateClouds"),
      azure: {
        vmware_solution: {
          private_cloud: cloudName,
          resource_group: resourceGroup,
          category: "Administrative",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String(op),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e8, 1.8e10),
      },
      message: isErr
        ? `AVS private cloud ${cloudName}: ${op} failed`
        : `AVS private cloud ${cloudName}: ${op} completed`,
    };
  }

  if (variant === "nsx") {
    const props = {
      component: "NSX-T",
      eventType: isErr ? "RoutingAdvertisementFailure" : "SegmentCreated",
      tier0: `T0-${randId(4)}`,
      message: isErr
        ? "BGP neighbor x.x.x.x down: hold timer expired"
        : `Tier-1 gateway linked to segment Web-${randInt(1, 9)}`,
    };
    const { properties: nxProps, error: nxErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.AVS/privateClouds/workloadNetworks/write",
      category: "AVSNetworkDiagnostics",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.eventType,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: nxProps,
      ...(nxErr ? { error: nxErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.AVS/privateClouds"),
      azure: {
        vmware_solution: {
          private_cloud: cloudName,
          resource_group: resourceGroup,
          category: "AVSNetworkDiagnostics",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.AVS/privateClouds/workloadNetworks/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e8, 4e9),
      },
      message: `AVS ${cloudName} NSX: ${props.eventType} — ${props.message}`,
    };
  }

  if (variant === "hcx_extend") {
    const props = {
      tunnelId: `hcx-${randId(10)}`,
      remoteEndpoint: rand(["OnPrem-datacenter-west", "AVS-peer-eastus"]),
      replicationRpoMinutes: isErr ? randInt(45, 240) : randInt(5, 20),
      linkState: isErr ? "Disconnected" : "Connected",
      detail: isErr
        ? "HCX WAN optimization tunnel reset: MTU negotiated below minimum for bulk migration"
        : "HCX interconnect healthy; WAN compression enabled",
      bytesReplicatedTb: randFloat(0.5, 42),
    };
    const { properties: hxProps, error: hxErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.AVS/privateClouds/hcxEnterpriseSites/write",
      category: "AVSHcxOperations",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.linkState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: hxProps,
      ...(hxErr ? { error: hxErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.AVS/privateClouds"),
      azure: {
        vmware_solution: {
          private_cloud: cloudName,
          resource_group: resourceGroup,
          category: "AVSHcxOperations",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.AVS/privateClouds/hcxEnterpriseSites/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e9, 1.2e10),
      },
      message: `HCX ${cloudName}: ${props.detail}`,
    };
  }

  if (variant === "srm_protect") {
    const props = {
      protectionGroup: `PG-${randInt(100, 999)}`,
      recoveryPlan: rand(["Gold-RP", "Tier1-RPO15"]),
      rpState: isErr ? "NeedsAttention" : "Protected",
      lastTestResult: isErr ? "Cancelled" : "Succeeded",
      rpoViolatedMinutes: isErr ? randInt(20, 300) : 0,
      message: isErr
        ? "SRM replication stalled: datastore pair lost transient paths for 240s"
        : "protection group replicated per policy; RPO SLA met",
    };
    const { properties: srProps, error: srErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.AVS/privateClouds/scriptExecutions/write",
      category: "AVSSiteRecovery",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.rpState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: srProps,
      ...(srErr ? { error: srErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.AVS/privateClouds"),
      azure: {
        vmware_solution: {
          private_cloud: cloudName,
          resource_group: resourceGroup,
          category: "AVSSiteRecovery",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.AVS/privateClouds/scriptExecutions/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e9, 2e11),
      },
      message: `AVS SRM (${props.protectionGroup}): ${props.message}`,
    };
  }

  if (variant === "ops_insights") {
    const props = {
      dataSource: "AzureVMwareSolutions/metricsAndLogs",
      activeAlerts: isErr ? randInt(3, 18) : randInt(0, 2),
      cpuReadyMsAvg: isErr ? randFloat(85, 350) : randFloat(3, 40),
      datastoreLatencyMs: isErr ? randFloat(28, 120) : randFloat(1.2, 8.8),
      detail: isErr
        ? "AVS Insight: datastore latency SLA breach persists >15m across cluster hosts"
        : "cluster KPIs nominal; anomaly detector quiet",
      workspaceResourceId: `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.OperationalInsights/workspaces/log-${randId(4)}`,
    };
    const { properties: opProps, error: opErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "microsoft.insights/diagnosticSettings/write",
      category: "AVSOpsInsights",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "Degraded" : "Healthy",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: opProps,
      ...(opErr ? { error: opErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.AVS/privateClouds"),
      azure: {
        vmware_solution: {
          private_cloud: cloudName,
          resource_group: resourceGroup,
          category: "AVSOpsInsights",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("microsoft.insights/diagnosticSettings/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e8, 9e9),
      },
      message: props.detail,
    };
  }

  const props = {
    component: "vCenter",
    task: isErr ? "ClusterRemediationFailed" : "HostEnteredMaintenanceMode",
    cluster: `Cluster-${randInt(1, 4)}`,
    host: `esxi-${randInt(10, 99)}.${cloudName}.local`,
    details: isErr
      ? "DRS cannot vMotion VMs: incompatible CPU on target host"
      : "Successfully evacuated 12 VMs from host prior to patch window",
  };
  const { properties: vcProps, error: vcErr } = withComputeAzureErrors(
    isErr,
    variant,
    props as Record<string, unknown>
  );
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.AVS/privateClouds/scriptExecutions/write",
    category: "AVSVCenterOperations",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.task,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: vcProps,
    ...(vcErr ? { error: vcErr } : {}),
    cloud: azureCloud(region, subscription, "Microsoft.AVS/privateClouds"),
    azure: {
      vmware_solution: {
        private_cloud: cloudName,
        resource_group: resourceGroup,
        category: "AVSVCenterOperations",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["host"],
      type: isErr ? ["error"] : ["info"],
      action: String("Microsoft.AVS/privateClouds/scriptExecutions/write"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(3e8, 8e9),
    },
    message: `AVS ${cloudName} vCenter: ${props.task} on ${props.cluster}`,
  };
}

/** Oracle on Azure — Exadata infrastructure and DB operations. */
export function generateOracleOnAzureLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const exa = `exa-${randId(5).toLowerCase()}`;
  const resourceId = armOracleExadata(subscription.id, resourceGroup, exa);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "provision",
    "db",
    "maintenance",
    "cell_mesh",
    "rman_backup",
    "license_audit",
  ] as const);

  if (variant === "provision") {
    const props = {
      provisioningState: isErr ? "Failed" : "Succeeded",
      shape: rand(["Exadata.X9M", "Exadata.X11M"]),
      storageSizeTb: rand([100, 200, 400]),
      message: isErr
        ? "Oracle.Database resource provider: subnet delegation missing for OracleNetworkLinks"
        : "Cloud Exadata infrastructure provisioning completed",
    };
    const { properties: oePrProps, error: oePrErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Oracle.Database/cloudExadataInfrastructures/write",
      category: "OracleExadataProvisioning",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.provisioningState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: oePrProps,
      ...(oePrErr ? { error: oePrErr } : {}),
      cloud: azureCloud(region, subscription, "Oracle.Database/cloudExadataInfrastructures"),
      azure: {
        oracle_on_azure: {
          exadata_name: exa,
          resource_group: resourceGroup,
          category: "OracleExadataProvisioning",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Oracle.Database/cloudExadataInfrastructures/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(6e9, 4.32e11),
      },
      message: isErr
        ? `Oracle Exadata ${exa}: provisioning failed — ${props.message}`
        : `Oracle Exadata ${exa}: ${props.shape} ready (${props.storageSizeTb} TB storage)`,
    };
  }

  if (variant === "db") {
    const db = `ORCL${randInt(1, 9)}`;
    const props = {
      pdbName: `PDB${randInt(1, 9)}`,
      operation: rand(["OPEN", "BACKUP", "PATCH"]),
      status: isErr ? "Failed" : "Succeeded",
      oracleError: isErr
        ? `ORA-${randInt(1200, 1250)}: TNS:listener does not currently know of service requested`
        : "",
    };
    const { properties: oeDbProps, error: oeDbErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Oracle.Database/cloudVmClusters/databases/write",
      category: "OracleDbWorkload",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.operation,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: oeDbProps,
      ...(oeDbErr ? { error: oeDbErr } : {}),
      cloud: azureCloud(region, subscription, "Oracle.Database/cloudExadataInfrastructures"),
      azure: {
        oracle_on_azure: {
          exadata_name: exa,
          db_name: db,
          resource_group: resourceGroup,
          category: "OracleDbWorkload",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Oracle.Database/cloudVmClusters/databases/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e8, 9e9),
      },
      message: isErr
        ? `Oracle@Azure DB ${db}: ${props.operation} failed ${props.oracleError}`
        : `Oracle@Azure DB ${db}: ${props.operation} completed on ${exa}`,
    };
  }

  if (variant === "cell_mesh") {
    const props = {
      cellCliCommand: rand(["CELLCLI - LIST GRIDDISK", "DCLI - LIST ALERTHISTORY"]),
      cellNode: `${exa}-cel0${randInt(1, 3)}`,
      ibLinkState: isErr ? "Degraded" : "Up",
      flashCacheHitRatio: isErr ? randFloat(0.4, 0.72) : randFloat(0.88, 0.995),
      message: isErr
        ? "storage cell quorum lost transient RDMA path to DB node 3"
        : "all passive memory PMEM banks healthy across rack",
      rackPdu: rand(["PDU-A", "PDU-B"]),
    };
    const { properties: ocProps, error: ocErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Oracle.Database/cloudExadataInfrastructures/cells/read",
      category: "OracleCellHealth",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.ibLinkState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: ocProps,
      ...(ocErr ? { error: ocErr } : {}),
      cloud: azureCloud(region, subscription, "Oracle.Database/cloudExadataInfrastructures"),
      azure: {
        oracle_on_azure: {
          exadata_name: exa,
          resource_group: resourceGroup,
          category: "OracleCellHealth",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Oracle.Database/cloudExadataInfrastructures/cells/read"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e9, 8e10),
      },
      message: `[cell] ${props.cellNode} ${props.cellCliCommand}: ${props.message}`,
    };
  }

  if (variant === "rman_backup") {
    const props = {
      channelCount: randInt(4, 32),
      compressedTb: randFloat(8, 640),
      tag: rand(["FULL_WEEKLY", "INCR_DAILY"]),
      status: isErr ? "FAILED" : "COMPLETED",
      oraErrorStack: isErr
        ? "ORA-19502: Backup piece handle write failed — Azure Blob throttle"
        : "",
      channelDeviceType: rand(["DISK-SBT", "DISK"]),
    };
    const { properties: bkProps, error: bkErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Oracle.Database/cloudVmClusters/backup/action",
      category: "OracleRmBackup",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.status,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: bkProps,
      ...(bkErr ? { error: bkErr } : {}),
      cloud: azureCloud(region, subscription, "Oracle.Database/cloudExadataInfrastructures"),
      azure: {
        oracle_on_azure: {
          exadata_name: exa,
          resource_group: resourceGroup,
          category: "OracleRmBackup",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Oracle.Database/cloudVmClusters/backup/action"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e11, 2e12),
      },
      message: isErr
        ? `RMAN ${props.tag} failed ${props.oraErrorStack}`
        : `RMAN ${props.tag}: ${props.compressedTb.toFixed(1)} TB to object storage`,
    };
  }

  if (variant === "license_audit") {
    const props = {
      metric: rand(["processor", "namedUserPlus"]),
      consumed: isErr ? randFloat(820, 1200) : randFloat(120, 600),
      entitled: randFloat(500, 1000),
      compliance: isErr ? "Over-deployed" : "WithinLimits",
      ulaEndDate: "2027-12-31",
      detail: isErr
        ? "Oracle LMS Collection Tool mismatch vs vCPU cores on clustered VMs"
        : "BYOL inventory reconciled successfully",
    };
    const { properties: olProps, error: olErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Oracle.Database/cloudVmClusters/licenseReports/read",
      category: "OracleLicenseAudit",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.compliance,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: olProps,
      ...(olErr ? { error: olErr } : {}),
      cloud: azureCloud(region, subscription, "Oracle.Database/cloudExadataInfrastructures"),
      azure: {
        oracle_on_azure: {
          exadata_name: exa,
          resource_group: resourceGroup,
          category: "OracleLicenseAudit",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Oracle.Database/cloudVmClusters/licenseReports/read"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e10, 2e11),
      },
      message: `Oracle license (${props.metric}): ${props.detail}`,
    };
  }

  const props = {
    windowId: `mw-${randId(8)}`,
    status: isErr ? "Failed" : "Completed",
    description: isErr
      ? "Exadata patch prerequisite check failed: cell connectivity test timeout"
      : "Quarterly patch bundle applied to storage cells and compute nodes",
  };
  const { properties: oeMProps, error: oeMErr } = withComputeAzureErrors(
    isErr,
    variant,
    props as Record<string, unknown>
  );
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Oracle.Database/cloudExadataInfrastructures/maintenance/action",
    category: "OracleExadataMaintenance",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.status,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: oeMProps,
    ...(oeMErr ? { error: oeMErr } : {}),
    cloud: azureCloud(region, subscription, "Oracle.Database/cloudExadataInfrastructures"),
    azure: {
      oracle_on_azure: {
        exadata_name: exa,
        resource_group: resourceGroup,
        category: "OracleExadataMaintenance",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["host"],
      type: isErr ? ["error"] : ["info"],
      action: String("Oracle.Database/cloudExadataInfrastructures/maintenance/action"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(1.2e10, 8.64e11),
    },
    message: isErr
      ? `Oracle Exadata ${exa}: maintenance ${props.windowId} failed`
      : `Oracle Exadata ${exa}: maintenance ${props.windowId} completed`,
  };
}

/** SAP on Azure — virtual instance lifecycle. */
export function generateSapOnAzureLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const svi = `svi-${rand(["s4", "bw"])}-${randId(5).toLowerCase()}`;
  const resourceId = armSapVi(subscription.id, resourceGroup, svi);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "lifecycle",
    "startstop",
    "ha",
    "transport_enqueue",
    "sapinst_trace",
    "nw_http",
  ] as const);

  if (variant === "lifecycle") {
    const op = isErr
      ? "Microsoft.Workloads/sapVirtualInstances/write"
      : rand([
          "Microsoft.Workloads/sapVirtualInstances/write",
          "Microsoft.Workloads/sapVirtualInstances/delete",
        ]);
    const props = {
      environment: rand(["Production", "NonProd"]),
      sid: rand(["S4P", "BW1", "ERP"]),
      product: rand(["S4HANA", "SAP NetWeaver"]),
      status: isErr ? "Failed" : "Succeeded",
      httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
    };
    const { properties: sapLcProps, error: sapLcErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: op,
      category: "Administrative",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "500" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: sapLcProps,
      ...(sapLcErr ? { error: sapLcErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Workloads/sapVirtualInstances"),
      azure: {
        sap_on_azure: {
          virtual_instance: svi,
          resource_group: resourceGroup,
          category: "Administrative",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String(op),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e8, 5e10),
      },
      message: isErr
        ? `SAP VI ${svi} (${props.sid}): ARM operation failed`
        : `SAP VI ${svi} (${props.sid}): ${op.split("/").pop()} completed`,
    };
  }

  if (variant === "startstop") {
    const action = isErr ? "stop" : rand(["start", "stop"]);
    const props = {
      action,
      sapInstanceState: isErr ? "Failed" : action === "stop" ? "Stopped" : "Running",
      startTimeoutSec: 900,
      error: isErr ? "SAPStartSrv did not report STARTED within timeout (ASCS not reachable)" : "",
    };
    const op =
      action === "stop"
        ? "Microsoft.Workloads/sapVirtualInstances/stop/action"
        : "Microsoft.Workloads/sapVirtualInstances/start/action";
    const { properties: sapSSProps, error: sapSSErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: op,
      category: "SapVirtualInstanceControl",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.sapInstanceState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: sapSSProps,
      ...(sapSSErr ? { error: sapSSErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Workloads/sapVirtualInstances"),
      azure: {
        sap_on_azure: {
          virtual_instance: svi,
          resource_group: resourceGroup,
          category: "SapVirtualInstanceControl",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String(op),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e9, 2.7e10),
      },
      message: isErr
        ? `SAP VI ${svi}: ${action} failed — ${props.error}`
        : `SAP VI ${svi}: ${action} -> ${props.sapInstanceState}`,
    };
  }

  if (variant === "transport_enqueue") {
    const props = {
      trkorr: `${rand(["DEV", "QAS"])}K${randInt(100000, 999999)}`,
      targetClient: rand(["100", "200"]),
      queuePosition: isErr ? randInt(40, 200) : randInt(1, 12),
      tpState: isErr ? "LOCKED" : "READY",
      detail: isErr
        ? "tp import blocked: cross-client dependencies on locked objects in namespace /S4P/BC"
        : "transport buffer healthy; next import window scheduled",
      ascsHost: `ascs-${svi}-${randInt(0, 1)}`,
    };
    const { properties: stProps, error: stErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Workloads/sapApplicationServerInstances/extensionRequests/write",
      category: "SapTransportManagement",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.tpState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: stProps,
      ...(stErr ? { error: stErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Workloads/sapVirtualInstances"),
      azure: {
        sap_on_azure: {
          virtual_instance: svi,
          resource_group: resourceGroup,
          category: "SapTransportManagement",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Workloads/sapApplicationServerInstances/extensionRequests/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e9, 8e10),
      },
      message: `[STMS] TR ${props.trkorr}: ${props.detail}`,
    };
  }

  if (variant === "sapinst_trace") {
    const props = {
      phase: rand(["EXEARCHIVE_EXTRACTING", "HDB_UPGRADE_PREP"]),
      sapinstPid: randInt(4000, 32000),
      logTail: isErr
        ? "ERROR com.sap.hdb.hdbrun failed exit code 1 — disk /hana/log 96% full"
        : `INFO sapinst_Main: phase completed elapsedSec=${randInt(120, 900)}`,
      hostRole: rand(["PAS", "AAS"]),
    };
    const { properties: siProps, error: siErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Workloads/sapVirtualInstances/startInstallation/action",
      category: "SapInstallationTrace",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "BLOCKED" : "PHASE_OK",
      callerIpAddress: "169.254.169.254",
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: siProps,
      ...(siErr ? { error: siErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Workloads/sapVirtualInstances"),
      azure: {
        sap_on_azure: {
          virtual_instance: svi,
          resource_group: resourceGroup,
          category: "SapInstallationTrace",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Workloads/sapVirtualInstances/startInstallation/action"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e8, 3e11),
      },
      message: `[sapinst] ${props.hostRole}: ${props.logTail}`,
    };
  }

  if (variant === "nw_http") {
    const props = {
      icmThread: randInt(0, 31),
      httpStatus: isErr ? rand([502, 503]) : rand([200, 201]),
      requestUri: `/sap/bc/icf/service${randInt(100, 999)}`,
      clientIp: randIp(),
      workerQueueDepth: isErr ? randInt(800, 5000) : randInt(0, 80),
      message: isErr
        ? "ICM backlog: enqueue timeout hit for external RFC destination"
        : "ICM routed request to dispatcher group 02",
    };
    const { properties: nwProps, error: nwErr } = withComputeAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Workloads/sapCentralServicesInstances/http/read",
      category: "SapIcmDiagnostics",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.httpStatus),
      callerIpAddress: props.clientIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: nwProps,
      ...(nwErr ? { error: nwErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Workloads/sapVirtualInstances"),
      azure: {
        sap_on_azure: {
          virtual_instance: svi,
          resource_group: resourceGroup,
          category: "SapIcmDiagnostics",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["host"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Workloads/sapCentralServicesInstances/http/read"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e8, 2e10),
      },
      message: `ICM HTTP ${props.httpStatus} ${props.requestUri}: ${props.message}`,
    };
  }

  const props = {
    scenario: "HANA System Replication",
    replicationStatus: isErr ? "ERROR" : "SYNC",
    primaryNode: `hanadb-${svi}-0`,
    secondaryNode: `hanadb-${svi}-1`,
    detail: isErr
      ? "Replication channel broken: log shipping blocked on secondary"
      : "RPO within SLA; takeover readiness OK",
  };
  const { properties: sapHaProps, error: sapHaErr } = withComputeAzureErrors(
    isErr,
    variant,
    props as Record<string, unknown>
  );
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.Workloads/sapVirtualInstances/databaseInstances/read",
    category: "SapHanaReplication",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.replicationStatus,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: sapHaProps,
    ...(sapHaErr ? { error: sapHaErr } : {}),
    cloud: azureCloud(region, subscription, "Microsoft.Workloads/sapVirtualInstances"),
    azure: {
      sap_on_azure: {
        virtual_instance: svi,
        resource_group: resourceGroup,
        category: "SapHanaReplication",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["host"],
      type: isErr ? ["error"] : ["info"],
      action: String("Microsoft.Workloads/sapVirtualInstances/databaseInstances/read"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(2e8, 2e9),
    },
    message: isErr
      ? `SAP HANA SR on ${svi}: ${props.detail}`
      : `SAP HANA SR on ${svi}: ${props.detail}`,
  };
}
