import {
  type EcsDocument,
  rand,
  randInt,
  randFloat,
  randId,
  randIp,
  azureCloud,
  makeAzureSetup,
  randUUID,
  USER_AGENTS,
} from "./helpers.js";

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
  const variant = rand(["admin", "console", "ingress", "scale"] as const);

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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 4e9) },
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e7, 2e9) },
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e6, 5e8) },
      message: `Ingress ${props.RequestMethod} ${props.RequestPath} -> ${code} for ${app}`,
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
    properties: props,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 3e9) },
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
  const variant = rand(["lifecycle", "exec", "event"] as const);

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
          image: `${rand(["contoso", "fabrikam"])}.azurecr.io/app:${rand(["1.2", "2.0"])}`,
        },
      ],
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
      resultSignature: isErr ? rand(["400", "409"]) : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(2e8, 6e9) },
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e7, 2e9) },
      message: isErr
        ? `ACI exec failed on ${group}/${container}: ${props.Reason}`
        : `ACI attach/exec session ended cleanly on ${group}/${container}`,
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
    properties: props,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(5e7, 1e9) },
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
  const variant = rand(["member", "update", "admin"] as const);

  if (variant === "member") {
    const props = {
      memberClusterResourceId: member,
      joinState: isErr ? "Failed" : "Succeeded",
      lastTransitionTime: time,
      message: isErr
        ? "Fleet hub could not validate cluster credentials (unauthorized against hub apiserver)"
        : "Member cluster registered and heartbeat OK",
    };
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(2e8, 5e9) },
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e8, 1.2e10) },
      message: isErr
        ? `Fleet ${fleet}: deployment run ${props.updateRunName} failed at ${props.stageName}`
        : `Fleet ${fleet}: update run ${props.updateRunName} succeeded (${props.clustersUpdated} clusters)`,
    };
  }

  const op = "Microsoft.ContainerService/fleets/write";
  const props = {
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
    resultSignature: isErr ? "500" : "200",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: props,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 4e9) },
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
  const variant = rand(["event", "scan", "admin"] as const);

  if (variant === "event") {
    const action = isErr ? rand(["Pull", "Push"]) : rand(["Push", "Pull", "Delete"]);
    const digest = `sha256:${randId(64).toLowerCase()}`;
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
      properties: { ...props, digest },
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e6, 5e8) },
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(3e9, 1.8e10) },
      message: isErr
        ? `ACR vulnerability scan failed for ${repo}:${tag}`
        : `ACR scan completed for ${repo} (critical=${props.severitySummary.critical})`,
    };
  }

  const props = {
    eventCategory: "Administrative",
    sourceRegistry: `source${randId(4).toLowerCase()}.azurecr.io`,
    targetImage: `${repo}:${tag}`,
    status: isErr ? "Failed" : "Succeeded",
  };
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
    properties: props,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e9, 6e9) },
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
  const variant = rand(["workflow", "deployment", "domain"] as const);

  if (variant === "workflow") {
    const props = {
      workflowId: `wt-${randId(10)}`,
      job: rand(["build_and_deploy", "validate_pr"]),
      conclusion: isErr ? "failure" : "success",
      runner: `GitHub-Actions-${randInt(100, 999)}`,
      logUrl: `https://github.com/contoso/${site}/actions/runs/${randInt(1e9, 9e9)}`,
    };
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(3e9, 2.4e10) },
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(8e8, 9e9) },
      message: isErr
        ? `SWA ${site}: content deployment ${props.deploymentId} failed`
        : `SWA ${site}: deployed to ${props.environment} (${props.hostname})`,
    };
  }

  const props = {
    hostname: isErr ? `bad.${site}.contoso.com` : `www.${site}.contoso.com`,
    validationMethod: "cname-delegation",
    status: isErr ? "ValidationFailed" : "Ready",
    error: isErr ? "DNS TXT record _dnsauth not found or mismatched" : "",
  };
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
    properties: props,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(2e8, 4e9) },
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
  const variant = rand(["arm", "runtime", "jvm"] as const);

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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(3e8, 8e9) },
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e6, 2e8) },
      message: `Spring Apps ${service}/${app}: ${line.slice(0, 90)}`,
    };
  }

  const props = {
    AppName: app,
    heapUsedPercent: isErr ? randFloat(92, 99) : randFloat(45, 78),
    gcPauseMs: isErr ? randInt(800, 4000) : randInt(20, 180),
    alert: isErr ? "Heap usage above 95% sustained for 5m" : "",
  };
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
    properties: props,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 1e9) },
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
  const variant = rand(["admin", "health", "maint"] as const);

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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(2e8, 6e9) },
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e7, 8e8) },
      message: `Dedicated host ${host}: ${props.availabilityState} — ${props.reason}`,
    };
  }

  const props = {
    maintenanceScope: "Host",
    impact: isErr ? "Unexpected reboot required within 24h" : "Planned maintenance completed",
    window: `2026-0${randInt(5, 8)}-${randInt(10, 28)}T02:00:00Z`,
    status: isErr ? "PendingCustomerAction" : "Completed",
  };
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
    properties: props,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e9, 4e9) },
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
  const variant = rand(["util", "admin"] as const);

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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 1e9) },
      message: isErr
        ? `Capacity reservation ${cr}: utilization check failed — ${props.message}`
        : `Capacity reservation ${cr}: ${used}/${total} slots utilized (${props.utilizationPercent.toFixed(1)}%)`,
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
    properties: props,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(2e8, 5e9) },
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

  const variant = rand(["member", "admin"] as const);
  if (variant === "admin") {
    const props = {
      eventCategory: "Administrative",
      status: isErr ? "Failed" : "Succeeded",
      intent: rand(["Cluster", "Standard"]),
      httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
    };
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 3e9) },
      message: isErr
        ? `PPG ${ppg}: update failed (intent / zone constraint)`
        : `PPG ${ppg}: configuration updated`,
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
    properties: props,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 2e9) },
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
  const variant = rand(["publish", "replica", "admin"] as const);

  if (variant === "publish") {
    const props = {
      galleryName: gallery,
      galleryImageName: image,
      galleryImageVersionName: version,
      publishingState: isErr ? "Failed" : "Succeeded",
      replicationProgress: isErr ? randInt(0, 40) : 100,
      errorMessage: isErr ? "Source managed disk snapshot not found or reader access denied" : "",
    };
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e8, 2e10) },
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(8e8, 1.5e10) },
      message: isErr
        ? `Gallery replication to ${targetRegion} failed for ${gallery}/${image}:${version}`
        : `Gallery image ${image}:${version} replicated to ${targetRegion}`,
    };
  }

  const props = {
    eventCategory: "Administrative",
    status: isErr ? "Failed" : "Succeeded",
    httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
  };
  const galOnly = armGallery(subscription.id, resourceGroup, gallery);
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
    properties: props,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 4e9) },
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
  const variant = rand(["attest", "secureboot", "admin"] as const);

  if (variant === "attest") {
    const props = {
      attestationType: "SEV-SNP",
      attestationReportStatus: isErr ? "Invalid" : "Verified",
      complianceStatus: isErr ? "NonCompliant" : "Compliant",
      quoteDigest: `sha384:${randId(48).toLowerCase()}`,
      error: isErr ? "Guest attestation quote verification failed: measurement mismatch" : "",
    };
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e7, 2e9) },
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e7, 1e9) },
      message: isErr
        ? `Confidential VM ${vmName}: secure boot violation — ${props.detail}`
        : `Confidential VM ${vmName}: secure boot and vTPM policy OK`,
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
    properties: props,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(2e8, 6e9) },
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
  const variant = rand(["run", "customize", "distribute", "admin"] as const);

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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(6e9, 3.6e11) },
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(3e8, 5e9) },
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(2e9, 1.2e11) },
      message: isErr
        ? `Image Builder ${tmpl}: distribute failed — ${props.message}`
        : `Image Builder ${tmpl}: distributed to ${props.targetRegions.join(", ")}`,
    };
  }

  const props = {
    eventCategory: "Administrative",
    status: isErr ? "Failed" : "Succeeded",
    httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
  };
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
    properties: props,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 3e9) },
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
  const variant = rand(["admin", "nsx", "vcenter"] as const);

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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e8, 1.8e10) },
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(2e8, 4e9) },
      message: `AVS ${cloudName} NSX: ${props.eventType} — ${props.message}`,
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
    properties: props,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(3e8, 8e9) },
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
  const variant = rand(["provision", "db", "maintenance"] as const);

  if (variant === "provision") {
    const props = {
      provisioningState: isErr ? "Failed" : "Succeeded",
      shape: rand(["Exadata.X9M", "Exadata.X11M"]),
      storageSizeTb: rand([100, 200, 400]),
      message: isErr
        ? "Oracle.Database resource provider: subnet delegation missing for OracleNetworkLinks"
        : "Cloud Exadata infrastructure provisioning completed",
    };
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(6e9, 4.32e11) },
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(3e8, 9e9) },
      message: isErr
        ? `Oracle@Azure DB ${db}: ${props.operation} failed ${props.oracleError}`
        : `Oracle@Azure DB ${db}: ${props.operation} completed on ${exa}`,
    };
  }

  const props = {
    windowId: `mw-${randId(8)}`,
    status: isErr ? "Failed" : "Completed",
    description: isErr
      ? "Exadata patch prerequisite check failed: cell connectivity test timeout"
      : "Quarterly patch bundle applied to storage cells and compute nodes",
  };
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
    properties: props,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1.2e10, 8.64e11) },
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
  const variant = rand(["lifecycle", "startstop", "ha"] as const);

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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e8, 5e10) },
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(3e9, 2.7e10) },
      message: isErr
        ? `SAP VI ${svi}: ${action} failed — ${props.error}`
        : `SAP VI ${svi}: ${action} -> ${props.sapInstanceState}`,
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
    properties: props,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(2e8, 2e9) },
    message: isErr
      ? `SAP HANA SR on ${svi}: ${props.detail}`
      : `SAP HANA SR on ${svi}: ${props.detail}`,
  };
}
