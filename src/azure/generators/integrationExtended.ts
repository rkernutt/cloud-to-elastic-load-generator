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

const INTEGRATION_EXTENDED_ERR_CODES = [
  "ServiceBusNamespaceNotFound",
  "EventHubQuotaExceeded",
  "LogicAppTriggerNotFound",
  "ApiManagementGatewayTimeout",
  "AuthorizationFailed",
  "QuotaExceeded",
  "InternalServerError",
  "ConflictError",
] as const;

type IntegrationExtendedErr = {
  code: (typeof INTEGRATION_EXTENDED_ERR_CODES)[number];
  message: string;
  type: "azure";
};

function integrationExtendedErrFields(
  isErr: boolean,
  message: string,
  scope: "data" | "adminOrProvision"
): { error?: IntegrationExtendedErr; statusMessage?: { error: IntegrationExtendedErr } } {
  if (!isErr) return {};
  const error: IntegrationExtendedErr = {
    code: rand([...INTEGRATION_EXTENDED_ERR_CODES]),
    message,
    type: "azure",
  };
  return scope === "adminOrProvision" ? { error, statusMessage: { error } } : { error };
}

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

function armRelayNs(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Relay/namespaces/${name}`;
}

function armIotCentral(sub: string, rg: string, app: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.IoTCentral/iotApps/${app}`;
}

function armDps(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Devices/provisioningServices/${name}`;
}

function armMedia(sub: string, rg: string, acct: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Media/mediaServices/${acct}`;
}

function armAcs(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Communication/communicationServices/${name}`;
}

function armSignalR(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.SignalRService/SignalR/${name}`;
}

function armNotificationHubNs(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.NotificationHubs/namespaces/${name}`;
}

function armAutomation(sub: string, rg: string, acct: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Automation/automationAccounts/${acct}`;
}

function armAppConfig(sub: string, rg: string, store: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.AppConfiguration/configurationStores/${store}`;
}

function armDevCenterProjectEnv(
  sub: string,
  rg: string,
  dc: string,
  proj: string,
  env: string
): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.DevCenter/devcenters/${dc}/projects/${proj}/environments/${env}`;
}

function armMaps(sub: string, rg: string, acct: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Maps/accounts/${acct}`;
}

function armRsvVault(sub: string, rg: string, vault: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.RecoveryServices/vaults/${vault}`;
}

function armMigrateProj(sub: string, rg: string, proj: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Migrate/assessmentProjects/${proj}`;
}

function armDataBoxJob(sub: string, rg: string, job: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.DataBox/jobs/${job}`;
}

function armDevCenter(sub: string, rg: string, dc: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.DevCenter/devcenters/${dc}`;
}

function armLabPlan(sub: string, rg: string, plan: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.LabServices/labPlans/${plan}`;
}

function armLoadTest(sub: string, rg: string, test: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.LoadTestService/loadTests/${test}`;
}

function armDevOpsPipeline(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.DevOps/pipelines/${name}`;
}

/** Azure Relay — hybrid connections, listener connect/disconnect. */
export function generateRelayLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const ns = `relay-${randId(6).toLowerCase()}`;
  const hc = `hc-${rand(["api", "edge", "agent"])}-${randId(4).toLowerCase()}`;
  const resourceId = armRelayNs(subscription.id, resourceGroup, ns);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["hybrid", "listener", "sender", "throughput", "health", "admin"] as const);

  if (variant === "hybrid") {
    const props = {
      hybridConnectionName: hc,
      bytesTransferred: isErr ? 0 : randInt(1_024, 50_000_000),
      listenerCount: isErr ? 0 : randInt(1, 8),
      status: isErr ? "Disconnected" : "Connected",
      remoteEndpoint: `${callerIp}:${randInt(1024, 65500)}`,
      ...integrationExtendedErrFields(
        isErr,
        "Hybrid connection rendezvous failed or session dropped unexpectedly",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: isErr
        ? "Microsoft.Relay/namespaces/hybridConnections/relaySession/failed"
        : "Microsoft.Relay/namespaces/hybridConnections/relaySession/write",
      category: "HybridConnectionEvents",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.status,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Relay/namespaces"),
      azure: {
        relay: {
          namespace: ns,
          hybrid_connection: hc,
          resource_group: resourceGroup,
          category: "HybridConnectionEvents",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String(isErr),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e6, 4e8),
      },
      message: isErr
        ? `Relay ${ns}: hybrid connection ${hc} session failed`
        : `Relay ${ns}: hybrid connection ${hc} active listeners=${props.listenerCount}`,
    };
  }

  if (variant === "listener") {
    const props = {
      hybridConnectionName: hc,
      eventType: isErr
        ? "ListenerDisconnected"
        : rand(["ListenerConnected", "ListenerDisconnected"]),
      clientRole: rand(["sender", "receiver"]),
      reason: isErr ? "authorization token expired during rendezvous" : "listener closed cleanly",
      ...integrationExtendedErrFields(
        isErr,
        "Listener connect or disconnect operation failed due to auth or network error",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName:
        props.eventType === "ListenerConnected"
          ? "Microsoft.Relay/namespaces/hybridConnections/listeners/connect"
          : "Microsoft.Relay/namespaces/hybridConnections/listeners/disconnect",
      category: "HybridConnectionListener",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.eventType,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Relay/namespaces"),
      azure: {
        relay: {
          namespace: ns,
          hybrid_connection: hc,
          resource_group: resourceGroup,
          category: "HybridConnectionListener",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("azure-activity"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e6, 2e8),
      },
      message: `Relay ${ns}/${hc}: listener ${props.eventType} (${props.clientRole})`,
    };
  }

  if (variant === "sender") {
    const props = {
      hybridConnectionName: hc,
      senderId: `snd-${randId(8).toLowerCase()}`,
      bytesPending: isErr ? randInt(50_000, 2_000_000) : randInt(0, 8_000),
      sendOutcome: isErr ? "rejected" : "accepted",
      ...integrationExtendedErrFields(
        isErr,
        "Sender frame rejected or broker returned error for hybrid connection path",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Relay/namespaces/hybridConnections/sender/write",
      category: "HybridConnectionSender",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.sendOutcome,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Relay/namespaces"),
      azure: {
        relay: {
          namespace: ns,
          hybrid_connection: hc,
          resource_group: resourceGroup,
          category: "HybridConnectionSender",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Relay/namespaces/hybridConnections/sender/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(8e5, 2e8),
      },
      message: isErr
        ? `Relay ${ns}/${hc}: sender ${props.senderId} rejected`
        : `Relay ${ns}: sender ${props.senderId} bytesPending=${props.bytesPending}`,
    };
  }

  if (variant === "throughput") {
    const props = {
      hybridConnectionName: hc,
      windowSec: randInt(30, 300),
      messagesPerSec: isErr ? randFloat(0.1, 4) : randFloat(20, 900),
      quotaBreached: isErr,
      ...integrationExtendedErrFields(
        isErr,
        "Relay namespace throughput exceeded configured quota for hybrid connections",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Relay/namespaces/hybridConnections/metrics/throttle",
      category: "HybridConnectionQuota",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.quotaBreached ? "throttled" : "within_quota",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Relay/namespaces"),
      azure: {
        relay: {
          namespace: ns,
          hybrid_connection: hc,
          resource_group: resourceGroup,
          category: "HybridConnectionQuota",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Relay/namespaces/hybridConnections/metrics/throttle"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e6, 4e8),
      },
      message: isErr
        ? `Relay ${ns}: throughput cap hit on ${hc}`
        : `Relay ${ns}: throughput healthy mps=${props.messagesPerSec.toFixed(1)}`,
    };
  }

  if (variant === "health") {
    const props = {
      hybridConnectionName: hc,
      probeName: rand(["edge-rendezvous", "listener-ping", "control-plane"]),
      healthy: !isErr,
      latencyMs: isErr ? randInt(500, 8000) : randInt(5, 120),
      ...integrationExtendedErrFields(
        isErr,
        "Relay health probe failed or exceeded latency SLO for namespace",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Relay/namespaces/health/read",
      category: "HybridConnectionHealth",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.healthy ? "up" : "down",
      callerIpAddress: "127.0.0.1",
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Relay/namespaces"),
      azure: {
        relay: {
          namespace: ns,
          hybrid_connection: hc,
          resource_group: resourceGroup,
          category: "HybridConnectionHealth",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Relay/namespaces/health/read"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e5, 9e7),
      },
      message: isErr
        ? `Relay ${ns}: health ${props.probeName} failed`
        : `Relay ${ns}: ${props.probeName} OK ${props.latencyMs}ms`,
    };
  }

  const props = {
    eventCategory: "Administrative",
    status: isErr ? "Failed" : "Succeeded",
    httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
    ...integrationExtendedErrFields(
      isErr,
      "ARM update of Relay namespace failed due to conflict or policy",
      "adminOrProvision"
    ),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.Relay/namespaces/write",
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "409" : "200",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.Relay/namespaces"),
    azure: {
      relay: {
        namespace: ns,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["process"],
      type: isErr ? ["error"] : ["info"],
      action: String("Microsoft.Relay/namespaces/write"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(1e8, 3e9),
    },
    message: isErr ? `Relay namespace ${ns}: ARM update failed` : `Relay namespace ${ns}: updated`,
  };
}

/** IoT Central — device provisioning, telemetry, rule triggers. */
export function generateIotCentralLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const app = `iotc-${randId(6).toLowerCase()}`;
  const resourceId = armIotCentral(subscription.id, resourceGroup, app);
  const deviceId = `dev-${randId(8).toLowerCase()}`;
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "provision",
    "telemetry",
    "rule",
    "export",
    "deviceCommand",
    "dashboard",
  ] as const);

  if (variant === "provision") {
    const props = {
      deviceId,
      templateId: rand(["thermostat", "sensor-pack", "gateway"]),
      provisioningStatus: isErr ? "failed" : "provisioned",
      attestationType: rand(["sas", "x509"]),
      ...integrationExtendedErrFields(
        isErr,
        "IoT Central device provisioning failed due to template or attestation rejection",
        "adminOrProvision"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: isErr
        ? "Microsoft.IoTCentral/iotApps/devices/write"
        : "Microsoft.IoTCentral/iotApps/devices/provision",
      category: "DeviceProvisioning",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.provisioningStatus,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.IoTCentral/iotApps"),
      azure: {
        iot_central: {
          app_name: app,
          resource_group: resourceGroup,
          device_id: deviceId,
          category: "DeviceProvisioning",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String(isErr),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e7, 5e8),
      },
      message: isErr
        ? `IoT Central ${app}: provision ${deviceId} failed`
        : `IoT Central ${app}: device ${deviceId} provisioned (${props.templateId})`,
    };
  }

  if (variant === "telemetry") {
    const props = {
      deviceId,
      schema: rand(["dtmi:meridiantech:Sensor;1", "dtmi:demo:Gateway;2"]),
      pointCount: isErr ? 0 : randInt(1, 120),
      ingressLatencyMs: isErr ? -1 : randInt(5, 800),
      dropped: isErr,
      ...integrationExtendedErrFields(
        isErr,
        "Telemetry ingress failed throttling validation or parsing for device batch",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.IoTCentral/iotApps/telemetry/ingress",
      category: "TelemetryIngress",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "throttled" : "accepted",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.IoTCentral/iotApps"),
      azure: {
        iot_central: {
          app_name: app,
          resource_group: resourceGroup,
          device_id: deviceId,
          category: "TelemetryIngress",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.IoTCentral/iotApps/telemetry/ingress"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e6, 3e8),
      },
      message: isErr
        ? `IoT Central ${app}: telemetry drop from ${deviceId}`
        : `IoT Central ${app}: telemetry ingested from ${deviceId} points=${props.pointCount}`,
    };
  }

  if (variant === "rule") {
    const props = {
      ruleId: `rule-${randId(8).toLowerCase()}`,
      ruleName: rand(["high-temp", "battery-low", "motion-detected"]),
      fired: !isErr,
      actionsDispatched: isErr ? 0 : randInt(1, 4),
      actionDetail: isErr ? "webhook destination returned HTTP 502" : "",
      ...integrationExtendedErrFields(
        isErr,
        "Rule evaluation succeeded but action webhook or workflow step failed",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.IoTCentral/iotApps/rules/evaluate",
      category: "RuleTrigger",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.fired ? "fired" : "skipped",
      callerIpAddress: "169.254.169.254",
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.IoTCentral/iotApps"),
      azure: {
        iot_central: {
          app_name: app,
          resource_group: resourceGroup,
          category: "RuleTrigger",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.IoTCentral/iotApps/rules/evaluate"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e6, 5e8),
      },
      message: isErr
        ? `IoT Central ${app}: rule ${props.ruleName} action failed`
        : `IoT Central ${app}: rule ${props.ruleName} triggered actions=${props.actionsDispatched}`,
    };
  }

  if (variant === "export") {
    const props = {
      deviceId,
      exportJob: `exp-${randId(6).toLowerCase()}`,
      destination: rand(["blob", "eventHub", "api"]),
      rowsExported: isErr ? randInt(0, 400) : randInt(800, 900_000),
      ...integrationExtendedErrFields(
        isErr,
        "Continuous data export job failed copying telemetry to downstream sink",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.IoTCentral/iotApps/dataExport/write",
      category: "DataExport",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "failed" : "running",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.IoTCentral/iotApps"),
      azure: {
        iot_central: {
          app_name: app,
          resource_group: resourceGroup,
          device_id: deviceId,
          category: "DataExport",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.IoTCentral/iotApps/dataExport/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e8, 4e10),
      },
      message: isErr
        ? `IoT Central ${app}: export ${props.exportJob} stalled`
        : `IoT Central ${app}: export ${props.destination} rows=${props.rowsExported}`,
    };
  }

  if (variant === "deviceCommand") {
    const props = {
      deviceId,
      commandName: rand(["reboot", "set-config", "firmware-update"]),
      deliveryStatus: isErr ? "rejected" : "delivered",
      ackLatencyMs: isErr ? -1 : randInt(20, 4000),
      ...integrationExtendedErrFields(
        isErr,
        "Cloud-to-device command was rejected expired or unreachable on device edge",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.IoTCentral/iotApps/devices/commands/send",
      category: "DeviceCommand",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.deliveryStatus,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.IoTCentral/iotApps"),
      azure: {
        iot_central: {
          app_name: app,
          resource_group: resourceGroup,
          device_id: deviceId,
          category: "DeviceCommand",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.IoTCentral/iotApps/devices/commands/send"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e7, 5e8),
      },
      message: isErr
        ? `IoT Central ${app}: command ${props.commandName} failed for ${deviceId}`
        : `IoT Central ${app}: ${props.commandName} ack ${props.ackLatencyMs}ms`,
    };
  }

  const props = {
    dashboardId: `dash-${randId(6).toLowerCase()}`,
    tilesRefreshed: isErr ? 0 : randInt(4, 80),
    queryErrors: isErr ? randInt(1, 12) : 0,
    ...integrationExtendedErrFields(
      isErr,
      "Operations dashboard aggregate query timed out or returned partial data",
      "data"
    ),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.IoTCentral/iotApps/dashboards/read",
    category: "DashboardQuery",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "degraded" : "ok",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.IoTCentral/iotApps"),
    azure: {
      iot_central: {
        app_name: app,
        resource_group: resourceGroup,
        category: "DashboardQuery",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["process"],
      type: isErr ? ["error"] : ["info"],
      action: String("Microsoft.IoTCentral/iotApps/dashboards/read"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(2e7, 6e8),
    },
    message: isErr
      ? `IoT Central ${app}: dashboard ${props.dashboardId} query failures=${props.queryErrors}`
      : `IoT Central ${app}: dashboard ${props.dashboardId} tiles=${props.tilesRefreshed}`,
  };
}

/** Device Provisioning Service — enrollment attestation, registration. */
export function generateDeviceProvisioningLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const dps = `dps-${randId(6).toLowerCase()}`;
  const resourceId = armDps(subscription.id, resourceGroup, dps);
  const regId = `reg-${randId(10).toLowerCase()}`;
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "enrollment",
    "register",
    "admin",
    "reenrollment",
    "allocation",
    "policy",
  ] as const);

  if (variant === "enrollment") {
    const props = {
      enrollmentGroup: `grp-${rand(["prod", "field"])}`,
      attestationType: rand(["x509", "tpm", "symmetricKey"]),
      attestationResult: isErr ? "invalid" : "verified",
      rejectionReason: isErr ? "certificate chain untrusted" : "",
      ...integrationExtendedErrFields(
        isErr,
        "Enrollment group attestation rejected due to invalid certificate or key mismatch",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Devices/provisioningServices/enrollmentGroups/attestation",
      category: "EnrollmentAttestation",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.attestationResult,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Devices/provisioningServices"),
      azure: {
        device_provisioning: {
          dps_name: dps,
          resource_group: resourceGroup,
          category: "EnrollmentAttestation",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Devices/provisioningServices/enrollmentGroups/attestation"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e6, 4e8),
      },
      message: isErr
        ? `DPS ${dps}: enrollment attestation failed (${props.rejectionReason})`
        : `DPS ${dps}: enrollment attestation OK for ${props.enrollmentGroup}`,
    };
  }

  if (variant === "register") {
    const props = {
      registrationId: regId,
      deviceId: `iot-${randId(8).toLowerCase()}`,
      assignedHub: `iothub-${randId(4).toLowerCase()}.azure-devices.net`,
      status: isErr ? "failed" : "assigned",
      errorCode: isErr ? rand([400201, 401002]) : 200,
      ...integrationExtendedErrFields(
        isErr,
        "Device registration to IoT Hub assignment failed during DPS handshake",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Devices/provisioningServices/registrations/register",
      category: "DeviceRegistration",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.errorCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Devices/provisioningServices"),
      azure: {
        device_provisioning: {
          dps_name: dps,
          resource_group: resourceGroup,
          category: "DeviceRegistration",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Devices/provisioningServices/registrations/register"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e6, 6e8),
      },
      message: isErr
        ? `DPS ${dps}: registration ${regId} failed code=${props.errorCode}`
        : `DPS ${dps}: device ${props.deviceId} registered to ${props.assignedHub}`,
    };
  }

  if (variant === "reenrollment") {
    const props = {
      registrationId: regId,
      previousDeviceId: `iot-${randId(6).toLowerCase()}`,
      rotationReason: rand(["cert-rollover", "lost-device", "inventory-refresh"]),
      status: isErr ? "aborted" : "completed",
      ...integrationExtendedErrFields(
        isErr,
        "Re-enrollment workflow aborted because prior registration state was inconsistent",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Devices/provisioningServices/registrations/renew",
      category: "Reenrollment",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.status,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Devices/provisioningServices"),
      azure: {
        device_provisioning: {
          dps_name: dps,
          resource_group: resourceGroup,
          category: "Reenrollment",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Devices/provisioningServices/registrations/renew"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e6, 5e8),
      },
      message: isErr
        ? `DPS ${dps}: reenroll ${regId} ${props.status}`
        : `DPS ${dps}: reenrolled ${regId} (${props.rotationReason})`,
    };
  }

  if (variant === "allocation") {
    const props = {
      hubPartition: `hub-${randInt(0, 3)}`,
      devicesPending: isErr ? randInt(50, 400) : randInt(0, 30),
      throughputUnits: isErr ? randFloat(0.2, 2) : randFloat(4, 40),
      ...integrationExtendedErrFields(
        isErr,
        "Hub allocation policy could not place device load within linked IoT Hub capacity",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Devices/provisioningServices/allocationPolicy/evaluate",
      category: "AllocationPolicy",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "backpressure" : "balanced",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Devices/provisioningServices"),
      azure: {
        device_provisioning: {
          dps_name: dps,
          resource_group: resourceGroup,
          category: "AllocationPolicy",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Devices/provisioningServices/allocationPolicy/evaluate"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e7, 8e8),
      },
      message: isErr
        ? `DPS ${dps}: allocation backlog devices=${props.devicesPending}`
        : `DPS ${dps}: allocation healthy partition=${props.hubPartition}`,
    };
  }

  if (variant === "policy") {
    const props = {
      policyName: `dps-pol-${randId(4).toLowerCase()}`,
      customAllocationWebhook: isErr ? "timeout contacting function" : "ok",
      enforced: !isErr,
      ...integrationExtendedErrFields(
        isErr,
        "Custom allocation webhook or Azure function policy step returned error",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Devices/provisioningServices/policies/run",
      category: "ProvisioningPolicy",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.enforced ? "enforced" : "violation",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Devices/provisioningServices"),
      azure: {
        device_provisioning: {
          dps_name: dps,
          resource_group: resourceGroup,
          category: "ProvisioningPolicy",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Devices/provisioningServices/policies/run"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e7, 6e8),
      },
      message: isErr
        ? `DPS ${dps}: policy ${props.policyName} webhook issue`
        : `DPS ${dps}: policy ${props.policyName} applied`,
    };
  }

  const props = {
    eventCategory: "Administrative",
    status: isErr ? "Failed" : "Succeeded",
    httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
    ...integrationExtendedErrFields(
      isErr,
      "DPS ARM configuration update failed quota or linked hub validation",
      "adminOrProvision"
    ),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.Devices/provisioningServices/write",
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "500" : "200",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.Devices/provisioningServices"),
    azure: {
      device_provisioning: {
        dps_name: dps,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["process"],
      type: isErr ? ["error"] : ["info"],
      action: String("Microsoft.Devices/provisioningServices/write"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(1e8, 4e9),
    },
    message: isErr ? `DPS ${dps}: ARM update failed` : `DPS ${dps}: configuration updated`,
  };
}

/** Media Services — encoding jobs, streaming endpoints, live events. */
export function generateMediaServicesLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const acct = `mediasvc-${randId(5).toLowerCase()}`;
  const resourceId = armMedia(subscription.id, resourceGroup, acct);
  const jobName = `job-${randId(8).toLowerCase()}`;
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["encode", "stream", "live", "asset", "drm", "liveOutput"] as const);

  if (variant === "encode") {
    const props = {
      transform: `transform-${rand(["h264", "aac"])}`,
      jobName,
      outputAsset: `output-${randId(6).toLowerCase()}`,
      state: isErr ? "Error" : "Finished",
      progressPercent: isErr ? randInt(5, 60) : 100,
      ...integrationExtendedErrFields(
        isErr,
        "Media encoding job terminated with transformer or codec pipeline error",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: isErr
        ? "Microsoft.Media/mediaServices/transforms/jobs/write"
        : "Microsoft.Media/mediaServices/transforms/jobs/complete",
      category: "EncodingJob",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.state,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Media/mediaServices"),
      azure: {
        media_services: {
          account: acct,
          resource_group: resourceGroup,
          category: "EncodingJob",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String(isErr),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e9, 4e11),
      },
      message: isErr
        ? `Media ${acct}: encode job ${jobName} failed at ${props.progressPercent}%`
        : `Media ${acct}: encode job ${jobName} completed`,
    };
  }

  if (variant === "stream") {
    const props = {
      streamingEndpoint: `se-${randId(4).toLowerCase()}`,
      manifestRequests: isErr ? randInt(0, 50) : randInt(200, 50_000),
      statusCode: isErr ? rand([502, 503]) : 200,
      cdnStatus: isErr ? "origin_error" : "hit",
      ...integrationExtendedErrFields(
        isErr,
        "Streaming endpoint returned gateway error talking to Media Services origin",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Media/mediaServices/streamingEndpoints/request",
      category: "StreamingEndpoint",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Media/mediaServices"),
      azure: {
        media_services: {
          account: acct,
          resource_group: resourceGroup,
          category: "StreamingEndpoint",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Media/mediaServices/streamingEndpoints/request"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e6, 5e8),
      },
      message: isErr
        ? `Media ${acct}: streaming endpoint ${props.streamingEndpoint} HTTP ${props.statusCode}`
        : `Media ${acct}: streaming endpoint ${props.streamingEndpoint} reqs=${props.manifestRequests}`,
    };
  }

  if (variant === "live") {
    const props = {
      liveEventName: `live-${randId(5).toLowerCase()}`,
      ingestProtocol: rand(["RTMP", "SRT"]),
      state: isErr ? "Stopped" : "Running",
      bitrateKbps: isErr ? 0 : randInt(2_000, 12_000),
      ...integrationExtendedErrFields(
        isErr,
        "Live event ingest dropped frames or encoder disconnected unexpectedly",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: isErr
        ? "Microsoft.Media/mediaServices/liveEvents/start/action"
        : "Microsoft.Media/mediaServices/liveEvents/ingest/heartbeat",
      category: "LiveEvent",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.state,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Media/mediaServices"),
      azure: {
        media_services: {
          account: acct,
          resource_group: resourceGroup,
          category: "LiveEvent",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String(isErr),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e8, 3e9),
      },
      message: isErr
        ? `Media ${acct}: live event ${props.liveEventName} ingest failure`
        : `Media ${acct}: live event ${props.liveEventName} ${props.ingestProtocol} OK`,
    };
  }

  if (variant === "asset") {
    const props = {
      assetName: `asset-${randId(6).toLowerCase()}`,
      filesIndexed: isErr ? randInt(0, 8) : randInt(4, 400),
      storageAccount: `st${randId(6).toLowerCase()}`,
      ...integrationExtendedErrFields(
        isErr,
        "Asset index or blob copy failed during Media Services storage sync",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Media/mediaServices/assets/write",
      category: "AssetIngest",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "corrupt" : "indexed",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Media/mediaServices"),
      azure: {
        media_services: {
          account: acct,
          resource_group: resourceGroup,
          category: "AssetIngest",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Media/mediaServices/assets/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e8, 2e10),
      },
      message: isErr
        ? `Media ${acct}: asset ${props.assetName} ingest failed`
        : `Media ${acct}: asset ${props.assetName} files=${props.filesIndexed}`,
    };
  }

  if (variant === "drm") {
    const props = {
      contentKeyPolicy: `ckp-${randId(4).toLowerCase()}`,
      licenseDelivery: isErr ? "denied" : "issued",
      drmSystem: rand(["Widevine", "PlayReady", "FairPlay"]),
      ...integrationExtendedErrFields(
        isErr,
        "DRM license delivery failed due to token or key policy mismatch",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Media/mediaServices/streamingPolicies/drm/issue",
      category: "DrmLicense",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.licenseDelivery,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Media/mediaServices"),
      azure: {
        media_services: {
          account: acct,
          resource_group: resourceGroup,
          category: "DrmLicense",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Media/mediaServices/streamingPolicies/drm/issue"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e6, 4e8),
      },
      message: isErr
        ? `Media ${acct}: ${props.drmSystem} license ${props.licenseDelivery}`
        : `Media ${acct}: DRM policy ${props.contentKeyPolicy} OK`,
    };
  }

  const props = {
    liveOutputName: `lo-${randId(5).toLowerCase()}`,
    archiveWindowMin: randInt(30, 480),
    segmentsWritten: isErr ? 0 : randInt(200, 50_000),
    ...integrationExtendedErrFields(
      isErr,
      "Live output archival failed writing fragments to blob storage",
      "data"
    ),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.Media/mediaServices/liveEvents/liveOutputs/write",
    category: "LiveOutput",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "failed" : "recording",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.Media/mediaServices"),
    azure: {
      media_services: {
        account: acct,
        resource_group: resourceGroup,
        category: "LiveOutput",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["process"],
      type: isErr ? ["error"] : ["info"],
      action: String("Microsoft.Media/mediaServices/liveEvents/liveOutputs/write"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(3e8, 4e9),
    },
    message: isErr
      ? `Media ${acct}: live output ${props.liveOutputName} archive error`
      : `Media ${acct}: live output ${props.liveOutputName} segments=${props.segmentsWritten}`,
  };
}

/** Communication Services — calls, chat, SMS delivery. */
export function generateCommunicationServicesLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const svc = `acs-${randId(6).toLowerCase()}`;
  const resourceId = armAcs(subscription.id, resourceGroup, svc);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["call", "chat", "sms", "email", "relay", "participant"] as const);

  if (variant === "call") {
    const props = {
      callId: randUUID(),
      modality: rand(["audio", "video"]),
      durationSec: isErr ? randInt(0, 5) : randInt(30, 3600),
      endReason: isErr ? rand(["dropped", "signupRequired", "busy"]) : "completedNormally",
      ...integrationExtendedErrFields(
        isErr,
        "ACS call terminated abnormally signaling or media path failure",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Communication/callDiagnostics/summary",
      category: "CallDiagnostics",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.endReason,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Communication/communicationServices"),
      azure: {
        communication_services: {
          service_name: svc,
          resource_group: resourceGroup,
          category: "CallDiagnostics",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: "Microsoft.Communication/callDiagnostics/summary",
        outcome: isErr ? "failure" : "success",
        duration: props.durationSec * 1e9,
      },
      message: isErr
        ? `ACS ${svc}: call ${props.callId} ended ${props.endReason}`
        : `ACS ${svc}: call ${props.modality} ${props.durationSec}s`,
    };
  }

  if (variant === "chat") {
    const props = {
      threadId: `thread-${randId(10).toLowerCase()}`,
      messageCount: isErr ? 0 : randInt(1, 200),
      operation: rand(["SendMessage", "ListMessages", "UpdateThread"]),
      httpStatus: isErr ? rand([401, 429]) : 200,
      ...integrationExtendedErrFields(
        isErr,
        "Chat REST API returned unauthorized throttled or server error",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: `Microsoft.Communication/chat/${props.operation}`,
      category: "ChatOperational",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.httpStatus),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Communication/communicationServices"),
      azure: {
        communication_services: {
          service_name: svc,
          resource_group: resourceGroup,
          category: "ChatOperational",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String(`Microsoft.Communication/chat/${props.operation}`),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e6, 8e8),
      },
      message: isErr
        ? `ACS ${svc}: chat ${props.operation} failed HTTP ${props.httpStatus}`
        : `ACS ${svc}: chat thread ${props.threadId} msgs=${props.messageCount}`,
    };
  }

  if (variant === "sms") {
    const props = {
      messageId: randUUID(),
      to: `+1${randInt(200_000_0000, 999_999_9999)}`,
      deliveryStatus: isErr ? rand(["failed", "undelivered"]) : "delivered",
      carrier: rand(["Twilio", "Infobip"]),
      ...integrationExtendedErrFields(
        isErr,
        "SMS outbound delivery failed upstream carrier rejection or congestion",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Communication/sms/outboundDelivery",
      category: "SmsOutbound",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.deliveryStatus,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Communication/communicationServices"),
      azure: {
        communication_services: {
          service_name: svc,
          resource_group: resourceGroup,
          category: "SmsOutbound",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Communication/sms/outboundDelivery"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e8, 6e9),
      },
      message: isErr
        ? `ACS ${svc}: SMS to ${props.to} ${props.deliveryStatus}`
        : `ACS ${svc}: SMS ${props.messageId} delivered via ${props.carrier}`,
    };
  }

  if (variant === "email") {
    const props = {
      messageId: randUUID(),
      domain: rand(["mail.meridiantech.io", "noreply-cascadeops.io"]),
      status: isErr ? "blocked" : "sent",
      ...integrationExtendedErrFields(
        isErr,
        "Email send blocked by ACS domain verification or SMTP policy rejection",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Communication/email/outbound/send",
      category: "EmailOperational",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.status,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Communication/communicationServices"),
      azure: {
        communication_services: {
          service_name: svc,
          resource_group: resourceGroup,
          category: "EmailOperational",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Communication/email/outbound/send"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e7, 5e8),
      },
      message: isErr
        ? `ACS ${svc}: email ${props.messageId} ${props.status}`
        : `ACS ${svc}: routed mail via ${props.domain}`,
    };
  }

  if (variant === "relay") {
    const props = {
      pstnCorrelationId: randUUID(),
      routeType: rand(["sip", "direct-routing"]),
      established: !isErr,
      ...integrationExtendedErrFields(
        isErr,
        "Inter-op relay PSTN handshake failed SIP response or codec mismatch",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Communication/telephony/relay/connect",
      category: "TelephonyRelay",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.established ? "connected" : "failed",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Communication/communicationServices"),
      azure: {
        communication_services: {
          service_name: svc,
          resource_group: resourceGroup,
          category: "TelephonyRelay",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Communication/telephony/relay/connect"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e8, 2e9),
      },
      message: isErr
        ? `ACS ${svc}: telephony relay ${props.routeType} failed`
        : `ACS ${svc}: relay ${props.pstnCorrelationId} UP`,
    };
  }

  const props = {
    roomId: `room-${randId(8).toLowerCase()}`,
    participantMsisdn: `+1${randInt(200_000_0000, 999_999_9999)}`,
    muteState: isErr ? rand(["moderation_blocked", "consent_denied"]) : "active",
    ...integrationExtendedErrFields(
      isErr,
      "Meeting participant moderation or consent gates blocked ACS join lifecycle",
      "data"
    ),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.Communication/meetings/participants/action",
    category: "MeetingParticipant",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.muteState,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.Communication/communicationServices"),
    azure: {
      communication_services: {
        service_name: svc,
        resource_group: resourceGroup,
        category: "MeetingParticipant",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["process"],
      type: isErr ? ["error"] : ["info"],
      action: String("Microsoft.Communication/meetings/participants/action"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(3e8, 2e9),
    },
    message: isErr
      ? `ACS ${svc}: participant join issue ${props.muteState}`
      : `ACS ${svc}: room ${props.roomId} participant active`,
  };
}

/** Azure SignalR — connection events, message throughput. */
export function generateSignalRLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const hub = `sigr-${randId(5).toLowerCase()}`;
  const resourceId = armSignalR(subscription.id, resourceGroup, hub);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["conn", "message", "admin", "negotiate", "scale", "upstream"] as const);

  if (variant === "conn") {
    const props = {
      hubName: rand(["chat", "telemetry", "dashboard"]),
      connectionId: randId(16).toLowerCase(),
      event: isErr ? "connect_failed" : rand(["connected", "disconnected"]),
      transport: rand(["websockets", "sse", "longpolling"]),
      ...integrationExtendedErrFields(
        isErr,
        "SignalR hub connection rejected by auth or transport negotiation",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.SignalRService/SignalR/hub/connection",
      category: "ConnectivityLogs",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.event,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.SignalRService/SignalR"),
      azure: {
        signalr: {
          service_name: hub,
          resource_group: resourceGroup,
          category: "ConnectivityLogs",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.SignalRService/SignalR/hub/connection"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e6, 2e8),
      },
      message: `SignalR ${hub}/${props.hubName}: ${props.event} transport=${props.transport}`,
    };
  }

  if (variant === "message") {
    const props = {
      hubName: rand(["chat", "orders"]),
      messagesSent: isErr ? randInt(0, 50) : randInt(1_000, 8_000_000),
      messagesDropped: isErr ? randInt(100, 50_000) : randInt(0, 10),
      rateLimitHit: isErr,
      ...integrationExtendedErrFields(
        isErr,
        "SignalR service rate limited or dropped ingress messages for hub",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.SignalRService/SignalR/metrics/ingress",
      category: "MessagingLogs",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.rateLimitHit ? "limited" : "ok",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.SignalRService/SignalR"),
      azure: {
        signalr: {
          service_name: hub,
          resource_group: resourceGroup,
          category: "MessagingLogs",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.SignalRService/SignalR/metrics/ingress"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e7, 2e9),
      },
      message: isErr
        ? `SignalR ${hub}: messaging degraded drops=${props.messagesDropped}`
        : `SignalR ${hub}: message throughput ${props.messagesSent} in window`,
    };
  }

  if (variant === "negotiate") {
    const props = {
      hubName: rand(["chat", "orders"]),
      negotiationTokenValid: !isErr,
      clientVersion: rand(["7.0", "6.0"]),
      ...integrationExtendedErrFields(
        isErr,
        "SignalR negotiate endpoint returned error building access token payload",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.SignalRService/SignalR/negotiate",
      category: "NegotiateLogs",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.negotiationTokenValid ? "ok" : "invalid",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.SignalRService/SignalR"),
      azure: {
        signalr: {
          service_name: hub,
          resource_group: resourceGroup,
          category: "NegotiateLogs",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.SignalRService/SignalR/negotiate"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(8e5, 9e7),
      },
      message: isErr
        ? `SignalR ${hub}: negotiate failed for ${props.hubName}`
        : `SignalR ${hub}: negotiate client ${props.clientVersion}`,
    };
  }

  if (variant === "scale") {
    const props = {
      unitCount: isErr ? randInt(1, 2) : randInt(3, 20),
      targetSku: rand(["Standard_S1", "Standard_S2"]),
      scaleState: isErr ? "stuck" : "steady",
      ...integrationExtendedErrFields(
        isErr,
        "SignalR vertical scale operation blocked or failed quota check",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.SignalRService/SignalR/scale/action",
      category: "ScalingEvent",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.scaleState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.SignalRService/SignalR"),
      azure: {
        signalr: {
          service_name: hub,
          resource_group: resourceGroup,
          category: "ScalingEvent",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.SignalRService/SignalR/scale/action"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e9, 2e10),
      },
      message: isErr
        ? `SignalR ${hub}: scale ${props.targetSku} incomplete`
        : `SignalR ${hub}: units=${props.unitCount}`,
    };
  }

  if (variant === "upstream") {
    const props = {
      functionApp: `fa-${randId(4).toLowerCase()}`,
      httpStatusFromUpstream: isErr ? rand([500, 504]) : 200,
      attempts: isErr ? randInt(2, 6) : 1,
      ...integrationExtendedErrFields(
        isErr,
        "SignalR upstream Azure Function returned error during serverless hub invocation",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.SignalRService/SignalR/upstream/call",
      category: "UpstreamLogs",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.httpStatusFromUpstream),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.SignalRService/SignalR"),
      azure: {
        signalr: {
          service_name: hub,
          resource_group: resourceGroup,
          category: "UpstreamLogs",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.SignalRService/SignalR/upstream/call"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e7, 4e8),
      },
      message: isErr
        ? `SignalR ${hub}: upstream ${props.functionApp} HTTP ${props.httpStatusFromUpstream}`
        : `SignalR ${hub}: upstream invocation OK`,
    };
  }

  const props = {
    eventCategory: "Administrative",
    status: isErr ? "Failed" : "Succeeded",
    httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
    ...integrationExtendedErrFields(
      isErr,
      "SignalR ARM service update failed SKU or name conflict",
      "adminOrProvision"
    ),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.SignalRService/SignalR/write",
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "409" : "200",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.SignalRService/SignalR"),
    azure: {
      signalr: {
        service_name: hub,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["process"],
      type: isErr ? ["error"] : ["info"],
      action: String("Microsoft.SignalRService/SignalR/write"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(1e8, 4e9),
    },
    message: isErr ? `SignalR ${hub}: service update failed` : `SignalR ${hub}: service updated`,
  };
}

/** Notification Hubs — push send, registration management. */
export function generateNotificationHubsLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const ns = `nh-ns-${randId(5).toLowerCase()}`;
  const hub = `hub-${randId(6).toLowerCase()}`;
  const resourceId = `${armNotificationHubNs(subscription.id, resourceGroup, ns)}/notificationHubs/${hub}`;
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["push", "reg", "admin", "telemetry", "schedule", "installation"] as const);

  if (variant === "push") {
    const props = {
      platform: rand(["apns", "fcm", "wns", "mpns"]),
      batchSize: isErr ? randInt(1, 50) : randInt(100, 50_000),
      successCount: isErr ? randInt(0, 20) : randInt(80, 49_000),
      failureCount: isErr ? randInt(30, 500) : randInt(0, 200),
      ...integrationExtendedErrFields(
        isErr,
        "Notification Hub push batch failed due to PNS credential or token issues",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.NotificationHubs/namespaces/notificationHubs/send",
      category: "PushSend",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.platform,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.NotificationHubs/namespaces"),
      azure: {
        notification_hubs: {
          namespace: ns,
          hub,
          resource_group: resourceGroup,
          category: "PushSend",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.NotificationHubs/namespaces/notificationHubs/send"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e7, 8e8),
      },
      message: isErr
        ? `Notification Hub ${hub}: ${props.platform} send failures=${props.failureCount}`
        : `Notification Hub ${hub}: ${props.platform} batch ok success=${props.successCount}`,
    };
  }

  if (variant === "reg") {
    const props = {
      registrationId: randUUID(),
      operation: isErr ? "DeleteRegistration" : rand(["CreateRegistration", "UpdateRegistration"]),
      pnsHandlePrefix: isErr ? "invalid:" : rand(["apns:", "fcm:"]),
      outcome: isErr ? "failed" : "succeeded",
      ...integrationExtendedErrFields(
        isErr,
        "Device registration create update or delete failed validation against PNS handle",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: `Microsoft.NotificationHubs/registrations/${props.operation}`,
      category: "RegistrationManagement",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.outcome,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.NotificationHubs/namespaces"),
      azure: {
        notification_hubs: {
          namespace: ns,
          hub,
          resource_group: resourceGroup,
          category: "RegistrationManagement",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String(`Microsoft.NotificationHubs/registrations/${props.operation}`),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e6, 4e8),
      },
      message: isErr
        ? `Notification Hub ${hub}: registration ${props.operation} failed`
        : `Notification Hub ${hub}: registration ${props.operation} OK`,
    };
  }

  if (variant === "telemetry") {
    const props = {
      activeRegistrations: isErr ? randInt(0, 200) : randInt(500, 90_000),
      deregistrationRatePerMin: isErr ? randFloat(20, 120) : randFloat(0, 8),
      anomaliesDetected: isErr,
      ...integrationExtendedErrFields(
        isErr,
        "Notification Hub telemetry pipeline detected abnormal churn or delivery skew",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.NotificationHubs/namespaces/notificationHubs/telemetry",
      category: "OperationalMetrics",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.anomaliesDetected ? "alarm" : "nominal",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.NotificationHubs/namespaces"),
      azure: {
        notification_hubs: {
          namespace: ns,
          hub,
          resource_group: resourceGroup,
          category: "OperationalMetrics",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.NotificationHubs/namespaces/notificationHubs/telemetry"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e7, 9e8),
      },
      message: isErr
        ? `NH ${hub}: telemetry anomaly activeRegs=${props.activeRegistrations}`
        : `NH ${hub}: telemetry healthy`,
    };
  }

  if (variant === "schedule") {
    const props = {
      scheduledPushId: randUUID(),
      fireTimeUtc: ts,
      suppressed: isErr,
      reasonCode: isErr ? "policy_block" : "",
      ...integrationExtendedErrFields(
        isErr,
        "Scheduled silent push was suppressed by NH policy or stale registration set",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.NotificationHubs/namespaces/notificationHubs/schedule",
      category: "ScheduledNotification",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.suppressed ? "skipped" : "queued",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.NotificationHubs/namespaces"),
      azure: {
        notification_hubs: {
          namespace: ns,
          hub,
          resource_group: resourceGroup,
          category: "ScheduledNotification",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.NotificationHubs/namespaces/notificationHubs/schedule"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e7, 6e8),
      },
      message: isErr
        ? `NH ${hub}: schedule ${props.scheduledPushId} ${props.reasonCode}`
        : `NH ${hub}: scheduled push queued`,
    };
  }

  if (variant === "installation") {
    const props = {
      platform: rand(["fcm", "apns"]),
      installId: randUUID(),
      fidelity: isErr ? "mismatched" : "verified",
      ...integrationExtendedErrFields(
        isErr,
        "FCM or APNS installation record could not be synchronized with NH hub",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.NotificationHubs/installations/write",
      category: "InstallationSync",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.fidelity,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.NotificationHubs/namespaces"),
      azure: {
        notification_hubs: {
          namespace: ns,
          hub,
          resource_group: resourceGroup,
          category: "InstallationSync",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.NotificationHubs/installations/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e6, 3e8),
      },
      message: isErr
        ? `NH ${hub}: installation sync ${props.installId} failed`
        : `NH ${hub}: ${props.platform} installation OK`,
    };
  }

  const props = {
    eventCategory: "Administrative",
    status: isErr ? "Failed" : "Succeeded",
    httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
    ...integrationExtendedErrFields(
      isErr,
      "Notification Hubs namespace ARM update denied or conflicted with SKU rules",
      "adminOrProvision"
    ),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.NotificationHubs/namespaces/write",
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "400" : "200",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.NotificationHubs/namespaces"),
    azure: {
      notification_hubs: {
        namespace: ns,
        hub,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["process"],
      type: isErr ? ["error"] : ["info"],
      action: String("Microsoft.NotificationHubs/namespaces/write"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(1e8, 3e9),
    },
    message: isErr
      ? `Notification Hubs namespace ${ns}: update failed`
      : `NH namespace ${ns}: updated`,
  };
}

/** Azure Automation — runbooks, DSC, jobs. */
export function generateAutomationAccountLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const acct = `auto-${randId(6).toLowerCase()}`;
  const resourceId = armAutomation(subscription.id, resourceGroup, acct);
  const runbook = `rb-${rand(["patch", "audit", "cleanup"])}`;
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["runbook", "dsc", "job", "webhook", "module", "inventory"] as const);

  if (variant === "runbook") {
    const props = {
      runbookName: runbook,
      jobId: randUUID(),
      runOn: rand(["Azure", "hybrid-worker-01"]),
      status: isErr ? "Failed" : "Completed",
      outputLines: isErr ? randInt(0, 20) : randInt(5, 400),
      ...integrationExtendedErrFields(
        isErr,
        "Runbook job terminated with unhandled exception or sandbox limit",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Automation/automationAccounts/runbooks/jobs/create",
      category: "JobLogs",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.status,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Automation/automationAccounts"),
      azure: {
        automation: {
          account: acct,
          resource_group: resourceGroup,
          category: "JobLogs",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Automation/automationAccounts/runbooks/jobs/create"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e9, 1.2e11),
      },
      message: isErr
        ? `Automation ${acct}: runbook ${runbook} job failed`
        : `Automation ${acct}: runbook ${runbook} completed lines=${props.outputLines}`,
    };
  }

  if (variant === "dsc") {
    const props = {
      nodeName: `vm-${randId(5).toLowerCase()}`,
      configuration: rand(["baseline", "domain-join", "iis"]),
      compileStatus: isErr ? "Failed" : "Succeeded",
      errorCount: isErr ? randInt(1, 8) : 0,
      ...integrationExtendedErrFields(
        isErr,
        "Desired State Configuration compile failed due to syntax or module resolution",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Automation/automationAccounts/configurations/compile",
      category: "DscCompilation",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.compileStatus,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Automation/automationAccounts"),
      azure: {
        automation: {
          account: acct,
          resource_group: resourceGroup,
          category: "DscCompilation",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Automation/automationAccounts/configurations/compile"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e8, 3e10),
      },
      message: isErr
        ? `Automation ${acct}: DSC compile failed errors=${props.errorCount}`
        : `Automation ${acct}: DSC ${props.configuration} compiled for ${props.nodeName}`,
    };
  }

  if (variant === "webhook") {
    const props = {
      webhookName: `hook-${randId(4).toLowerCase()}`,
      httpStatus: isErr ? rand([401, 503]) : 202,
      retries: isErr ? randInt(2, 8) : 0,
      ...integrationExtendedErrFields(
        isErr,
        "Automation webhook subscriber endpoint returned error or timed out",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Automation/automationAccounts/webhooks/trigger",
      category: "WebhookDelivery",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.httpStatus),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Automation/automationAccounts"),
      azure: {
        automation: {
          account: acct,
          resource_group: resourceGroup,
          category: "WebhookDelivery",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Automation/automationAccounts/webhooks/trigger"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e7, 8e8),
      },
      message: isErr
        ? `Automation ${acct}: webhook ${props.webhookName} HTTP ${props.httpStatus}`
        : `Automation ${acct}: webhook invoked ${props.webhookName}`,
    };
  }

  if (variant === "module") {
    const props = {
      moduleName: rand(["Az.Compute", "NetworkingDsc"]),
      moduleVersion: rand(["4.2.0", "9.1.0"]),
      importState: isErr ? "Failed" : "Succeeded",
      ...integrationExtendedErrFields(
        isErr,
        "PowerShell Gallery module import failed signature or network error",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Automation/automationAccounts/modules/write",
      category: "ModuleImport",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.importState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Automation/automationAccounts"),
      azure: {
        automation: {
          account: acct,
          resource_group: resourceGroup,
          category: "ModuleImport",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Automation/automationAccounts/modules/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(8e8, 6e10),
      },
      message: isErr
        ? `Automation ${acct}: module ${props.moduleName} import failed`
        : `Automation ${acct}: module ${props.moduleName}@${props.moduleVersion} imported`,
    };
  }

  if (variant === "inventory") {
    const props = {
      source: rand(["LogAnalytics", "AzureResourceGraph"]),
      recordsIngested: isErr ? randInt(0, 200) : randInt(2_000, 900_000),
      batchState: isErr ? "partial" : "complete",
      ...integrationExtendedErrFields(
        isErr,
        "Automation change tracking inventory ingestion failed or was partial",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Automation/automationAccounts/softwareInventories/sync",
      category: "InventorySync",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.batchState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Automation/automationAccounts"),
      azure: {
        automation: {
          account: acct,
          resource_group: resourceGroup,
          category: "InventorySync",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Automation/automationAccounts/softwareInventories/sync"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e9, 3e11),
      },
      message: isErr
        ? `Automation ${acct}: inventory sync from ${props.source} ${props.batchState}`
        : `Automation ${acct}: inventory +${props.recordsIngested}`,
    };
  }

  const props = {
    jobType: rand(["UpdateManagement", "ChangeTracking", "Patch"]),
    status: isErr ? "Failed" : "Completed",
    machinesTargeted: randInt(5, 500),
    machinesFailed: isErr ? randInt(1, 80) : randInt(0, 3),
    ...integrationExtendedErrFields(
      isErr,
      "Software update management run failed against subset of targeted machines",
      "data"
    ),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.Automation/automationAccounts/softwareUpdateConfigurations/run",
    category: "AutomationJob",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.jobType,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.Automation/automationAccounts"),
    azure: {
      automation: {
        account: acct,
        resource_group: resourceGroup,
        category: "AutomationJob",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["process"],
      type: isErr ? ["error"] : ["info"],
      action: String("Microsoft.Automation/automationAccounts/softwareUpdateConfigurations/run"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(6e9, 2e11),
    },
    message: isErr
      ? `Automation ${acct}: ${props.jobType} job failed on ${props.machinesFailed} hosts`
      : `Automation ${acct}: ${props.jobType} completed targets=${props.machinesTargeted}`,
  };
}

/** App Configuration — key-value ops, feature flags. */
export function generateAppConfigurationLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const store = `appcs-${randId(6).toLowerCase()}`;
  const resourceId = armAppConfig(subscription.id, resourceGroup, store);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["kv", "feature", "admin", "snapshot", "replica", "sentinel"] as const);

  if (variant === "kv") {
    const props = {
      key: rand(["api:timeout", "cache:ttl", "payments:provider"]),
      label: rand(["", "prod", "stg"]),
      operation: isErr ? "delete" : rand(["set", "get"]),
      etag: `"${randId(8).toLowerCase()}"`,
      ...integrationExtendedErrFields(
        isErr,
        "Key-value precondition failed concurrent write or sentinel revision mismatch",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: `Microsoft.AppConfiguration/configurationStores/keyValues/${props.operation}`,
      category: "HttpRequest",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "412" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.AppConfiguration/configurationStores"),
      azure: {
        app_configuration: {
          store,
          resource_group: resourceGroup,
          category: "HttpRequest",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String(
          `Microsoft.AppConfiguration/configurationStores/keyValues/${props.operation}`
        ),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e6, 2e8),
      },
      message: isErr
        ? `App Config ${store}: ${props.operation} ${props.key} failed (precondition)`
        : `App Config ${store}: ${props.operation} ${props.key}`,
    };
  }

  if (variant === "feature") {
    const props = {
      featureFlag: rand(["DarkMode", "NewCheckout", "BetaApi"]),
      enabled: !isErr && Math.random() > 0.3,
      changeType: isErr ? "rejected" : rand(["updated", "created"]),
      client: rand(USER_AGENTS),
      ...integrationExtendedErrFields(
        isErr,
        "Feature flag change rejected by RBAC sentinel or lifecycle policy gate",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.AppConfiguration/configurationStores/featureFlags/write",
      category: "FeatureFlagAudit",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.changeType,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.AppConfiguration/configurationStores"),
      azure: {
        app_configuration: {
          store,
          resource_group: resourceGroup,
          category: "FeatureFlagAudit",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.AppConfiguration/configurationStores/featureFlags/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e7, 4e8),
      },
      message: isErr
        ? `App Config ${store}: feature ${props.featureFlag} change rejected`
        : `App Config ${store}: feature ${props.featureFlag} enabled=${props.enabled}`,
    };
  }

  if (variant === "snapshot") {
    const props = {
      snapshotLabel: rand(["rollback-202605", "golden-prod"]),
      keysCaptured: isErr ? randInt(0, 20) : randInt(120, 9_000),
      signedEtagOk: !isErr,
      ...integrationExtendedErrFields(
        isErr,
        "Configuration snapshot export failed KMS signing or quota limit",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.AppConfiguration/configurationStores/snapshots/write",
      category: "ConfigurationSnapshot",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.signedEtagOk ? "sealed" : "unsigned",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.AppConfiguration/configurationStores"),
      azure: {
        app_configuration: {
          store,
          resource_group: resourceGroup,
          category: "ConfigurationSnapshot",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.AppConfiguration/configurationStores/snapshots/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e8, 5e10),
      },
      message: isErr
        ? `App Config ${store}: snapshot ${props.snapshotLabel} failed`
        : `App Config ${store}: snapshot ${props.snapshotLabel} keys=${props.keysCaptured}`,
    };
  }

  if (variant === "replica") {
    const props = {
      replicaLocation: rand(["eastus2", "westeurope"]),
      lagSeconds: isErr ? randFloat(45, 600) : randFloat(0.2, 8),
      healthy: !isErr,
      ...integrationExtendedErrFields(
        isErr,
        "Geo-replica sync lag exceeded SLA for App Configuration secondary region",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.AppConfiguration/configurationStores/replicas/status",
      category: "GeoReplication",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.healthy ? "synced" : "delayed",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.AppConfiguration/configurationStores"),
      azure: {
        app_configuration: {
          store,
          resource_group: resourceGroup,
          category: "GeoReplication",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.AppConfiguration/configurationStores/replicas/status"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e8, 2e10),
      },
      message: isErr
        ? `App Config ${store}: replica ${props.replicaLocation} lag=${props.lagSeconds.toFixed(1)}s`
        : `App Config ${store}: replicas healthy`,
    };
  }

  if (variant === "sentinel") {
    const props = {
      sentinelKey: ".appconfig.featureflag/__sentinel__",
      refreshClients: randInt(8, 2000),
      watchExpired: isErr,
      ...integrationExtendedErrFields(
        isErr,
        "Sentinel-based refresh watch expired before clients polled latest revision",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.AppConfiguration/configurationStores/events/sentinel",
      category: "SentinelEvent",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.watchExpired ? "stale_clients" : "broadcast",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Information" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.AppConfiguration/configurationStores"),
      azure: {
        app_configuration: {
          store,
          resource_group: resourceGroup,
          category: "SentinelEvent",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.AppConfiguration/configurationStores/events/sentinel"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e7, 2e8),
      },
      message: isErr
        ? `App Config ${store}: sentinel watch gap clients=${props.refreshClients}`
        : `App Config ${store}: sentinel broadcast OK`,
    };
  }

  const props = {
    eventCategory: "Administrative",
    status: isErr ? "Failed" : "Succeeded",
    httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
    ...integrationExtendedErrFields(
      isErr,
      "ARM write to configuration store denied by managed identity locks",
      "adminOrProvision"
    ),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.AppConfiguration/configurationStores/write",
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "403" : "200",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.AppConfiguration/configurationStores"),
    azure: {
      app_configuration: {
        store,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["process"],
      type: isErr ? ["error"] : ["info"],
      action: String("Microsoft.AppConfiguration/configurationStores/write"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(1e8, 3e9),
    },
    message: isErr
      ? `App Configuration ${store}: ARM failed`
      : `App Configuration ${store}: updated`,
  };
}

/** Deployment Environments — environment lifecycle, catalog sync. */
export function generateDeploymentEnvironmentsLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const dc = `dc-${randId(5).toLowerCase()}`;
  const proj = `proj-${randId(5).toLowerCase()}`;
  const env = `env-${rand(["dev", "qa", "sandbox"])}-${randId(4).toLowerCase()}`;
  const resourceId = armDevCenterProjectEnv(subscription.id, resourceGroup, dc, proj, env);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "lifecycle",
    "catalog",
    "admin",
    "pool",
    "entitlement",
    "network",
  ] as const);

  if (variant === "lifecycle") {
    const props = {
      environmentType: rand(["Sandbox", "Standard"]),
      action: isErr ? "delete_failed" : rand(["create", "delete"]),
      state: isErr ? "Failed" : "Succeeded",
      ...integrationExtendedErrFields(
        isErr,
        "Deployment environment create or delete operation failed provisioning steps",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName:
        props.action === "delete" || props.action === "delete_failed"
          ? "Microsoft.DevCenter/projects/environments/delete"
          : "Microsoft.DevCenter/projects/environments/write",
      category: "DeploymentEnvironment",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.state,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.DevCenter/projects/environments"),
      azure: {
        deployment_environments: {
          dev_center: dc,
          project: proj,
          environment: env,
          resource_group: resourceGroup,
          category: "DeploymentEnvironment",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("azure-activity"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e9, 4e11),
      },
      message: isErr
        ? `Deployment Env ${env}: operation failed in ${proj}`
        : `Deployment Env ${dc}/${proj}/${env}: ${props.action} ${props.state}`,
    };
  }

  if (variant === "catalog") {
    const props = {
      catalogItem: rand(["web-template", "api-starter", "data-science-vm"]),
      syncStatus: isErr ? "Failed" : "Succeeded",
      definitionsAdded: isErr ? 0 : randInt(1, 12),
      catalogDetail: isErr ? "catalog repository unreachable (403)" : "",
      ...integrationExtendedErrFields(
        isErr,
        "Dev Center catalog synchronization failed cloning IaC blueprint repository",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.DevCenter/devcenters/catalogs/sync/action",
      category: "CatalogSync",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.syncStatus,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.DevCenter/devcenters"),
      azure: {
        deployment_environments: {
          dev_center: dc,
          project: proj,
          environment: env,
          resource_group: resourceGroup,
          category: "CatalogSync",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.DevCenter/devcenters/catalogs/sync/action"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(8e8, 2e10),
      },
      message: isErr
        ? `Dev Center ${dc}: catalog sync failed — ${props.catalogDetail}`
        : `Dev Center ${dc}: catalog synced +${props.definitionsAdded} definitions`,
    };
  }

  if (variant === "pool") {
    const props = {
      poolName: `pool-${randId(4).toLowerCase()}`,
      availableSlots: isErr ? randInt(0, 3) : randInt(15, 200),
      demandSpike: isErr,
      ...integrationExtendedErrFields(
        isErr,
        "Developer machine pool exhausted causing queued environment provisioning",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.DevCenter/projects/developerMachinePools/read",
      category: "PoolCapacity",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "starved" : "healthy",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.DevCenter/projects/environments"),
      azure: {
        deployment_environments: {
          dev_center: dc,
          project: proj,
          environment: env,
          resource_group: resourceGroup,
          category: "PoolCapacity",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.DevCenter/projects/developerMachinePools/read"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e9, 2e11),
      },
      message: isErr
        ? `Dev Center ${dc}: pool ${props.poolName} slots=${props.availableSlots}`
        : `Dev Center ${dc}: pool ${props.poolName} ready`,
    };
  }

  if (variant === "entitlement") {
    const props = {
      licenseSku: rand(["VisualStudioEnterprise", "MSDNPlatforms"]),
      seatsUsed: isErr ? randInt(95, 120) : randInt(5, 80),
      seatsQuota: 100,
      ...integrationExtendedErrFields(
        isErr,
        "Dev Center entitlement license seats exceeded blocking new environment actions",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.DevCenter/projects/entitlements/check",
      category: "EntitlementCheck",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "overallocated" : "allowed",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.DevCenter/projects"),
      azure: {
        deployment_environments: {
          dev_center: dc,
          project: proj,
          environment: env,
          resource_group: resourceGroup,
          category: "EntitlementCheck",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.DevCenter/projects/entitlements/check"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e8, 5e9),
      },
      message: isErr
        ? `Dev Center ${proj}: entitlement ${props.licenseSku} over limit`
        : `Dev Center ${proj}: entitlement OK`,
    };
  }

  if (variant === "network") {
    const props = {
      vnetAttachment: `vnet-${randId(4).toLowerCase()}`,
      peeringState: isErr ? "Disconnected" : "Connected",
      dnsResolutionMs: isErr ? randInt(800, 6000) : randInt(4, 120),
      ...integrationExtendedErrFields(
        isErr,
        "Attached VNet peering or private DNS resolution failed for environment segment",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.DevCenter/projects/environments/network/diagnostic",
      category: "NetworkAttachment",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.peeringState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.DevCenter/projects/environments"),
      azure: {
        deployment_environments: {
          dev_center: dc,
          project: proj,
          environment: env,
          resource_group: resourceGroup,
          category: "NetworkAttachment",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.DevCenter/projects/environments/network/diagnostic"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e8, 8e9),
      },
      message: isErr
        ? `Deployment Env ${env}: VNet ${props.vnetAttachment} unhealthy`
        : `Deployment Env ${env}: network OK ${props.dnsResolutionMs}ms`,
    };
  }

  const props = {
    eventCategory: "Administrative",
    status: isErr ? "Failed" : "Succeeded",
    httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
    ...integrationExtendedErrFields(
      isErr,
      "Dev Center project ARM update blocked by catalog lock or policy",
      "adminOrProvision"
    ),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.DevCenter/projects/write",
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "409" : "200",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.DevCenter/projects"),
    azure: {
      deployment_environments: {
        dev_center: dc,
        project: proj,
        environment: env,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["process"],
      type: isErr ? ["error"] : ["info"],
      action: String("Microsoft.DevCenter/projects/write"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(1e8, 5e9),
    },
    message: isErr
      ? `Dev Center project ${proj}: update failed`
      : `Dev Center project ${proj}: updated`,
  };
}

/** Azure Maps — search, route, render API events. */
export function generateMapsLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const acct = `maps-${randId(6).toLowerCase()}`;
  const resourceId = armMaps(subscription.id, resourceGroup, acct);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["search", "route", "render", "geocode", "traffic", "timezone"] as const);

  if (variant === "search") {
    const props = {
      api: "search",
      queryLength: randInt(4, 40),
      resultsCount: isErr ? 0 : randInt(1, 25),
      httpStatus: isErr ? rand([400, 429]) : 200,
      ...integrationExtendedErrFields(
        isErr,
        "Maps search fuzzy match API returned client error rate limit or malformed query",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Maps/search/searchAddress",
      category: "MapsRequests",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.httpStatus),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Maps/accounts"),
      azure: {
        maps: {
          account: acct,
          resource_group: resourceGroup,
          category: "MapsRequests",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Maps/search/searchAddress"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e6, 4e8),
      },
      message: isErr
        ? `Maps ${acct}: search failed HTTP ${props.httpStatus}`
        : `Maps ${acct}: search returned ${props.resultsCount} results`,
    };
  }

  if (variant === "route") {
    const props = {
      api: "route",
      distanceMeters: isErr ? 0 : randInt(500, 500_000),
      durationSec: isErr ? -1 : randInt(60, 7200),
      httpStatus: isErr ? 503 : 200,
      ...integrationExtendedErrFields(
        isErr,
        "Routing engine unavailable or snapped road network returned no path",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Maps/route/directions",
      category: "MapsRequests",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.httpStatus),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Maps/accounts"),
      azure: {
        maps: {
          account: acct,
          resource_group: resourceGroup,
          category: "MapsRequests",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Maps/route/directions"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e7, 6e8),
      },
      message: isErr
        ? `Maps ${acct}: routing unavailable`
        : `Maps ${acct}: route ${props.distanceMeters} m in ${props.durationSec}s`,
    };
  }

  if (variant === "render") {
    const props = {
      api: "render",
      tileZoom: randInt(8, 16),
      tilesRendered: isErr ? 0 : randInt(1, 64),
      httpStatus: isErr ? rand([500, 502]) : 200,
      ...integrationExtendedErrFields(
        isErr,
        "Map tile render service returned upstream error fetching style or raster tiles",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Maps/render/maptile",
      category: "MapsRequests",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.httpStatus),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Maps/accounts"),
      azure: {
        maps: {
          account: acct,
          resource_group: resourceGroup,
          category: "MapsRequests",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Maps/render/maptile"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e7, 3e8),
      },
      message: isErr
        ? `Maps ${acct}: render failed HTTP ${props.httpStatus}`
        : `Maps ${acct}: rendered ${props.tilesRendered} tiles z=${props.tileZoom}`,
    };
  }

  if (variant === "geocode") {
    const props = {
      structuredQueryParts: randInt(2, 5),
      matchScore: isErr ? 0 : randFloat(0.75, 0.99),
      ambiguities: isErr ? randInt(8, 40) : randInt(0, 3),
      ...integrationExtendedErrFields(
        isErr,
        "Batch geocoder could not resolve address due to ambiguity or stale reference data",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Maps/search/geocode/batch",
      category: "MapsGeocode",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "unresolved" : "matched",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Maps/accounts"),
      azure: {
        maps: {
          account: acct,
          resource_group: resourceGroup,
          category: "MapsGeocode",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Maps/search/geocode/batch"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e7, 4e9),
      },
      message: isErr
        ? `Maps ${acct}: geocode batch ambiguities=${props.ambiguities}`
        : `Maps ${acct}: geocode score=${props.matchScore.toFixed(2)}`,
    };
  }

  if (variant === "traffic") {
    const props = {
      flowCoverageKm: isErr ? 0 : randInt(120, 12_000),
      incidentCount: isErr ? randInt(5, 40) : randInt(0, 15),
      httpStatus: isErr ? rand([408, 503]) : 200,
      ...integrationExtendedErrFields(
        isErr,
        "Traffic flow overlay API timed out assembling vector incident layers",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Maps/traffic/flow/segment",
      category: "MapsTraffic",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.httpStatus),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Maps/accounts"),
      azure: {
        maps: {
          account: acct,
          resource_group: resourceGroup,
          category: "MapsTraffic",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Maps/traffic/flow/segment"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e7, 5e8),
      },
      message: isErr
        ? `Maps ${acct}: traffic flow HTTP ${props.httpStatus}`
        : `Maps ${acct}: incidents=${props.incidentCount}`,
    };
  }

  const props = {
    api: "timezone",
    windowsResolved: isErr ? 0 : randInt(1, 180),
    ianaZone: isErr ? "" : rand(["America/Los_Angeles", "Europe/Amsterdam"]),
    ...integrationExtendedErrFields(
      isErr,
      "Timezone by position lookup failed latitude longitude out of supported dataset",
      "data"
    ),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.Maps/timezone/byCoordinates",
    category: "MapsTimezone",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.ianaZone || "none",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.Maps/accounts"),
    azure: {
      maps: {
        account: acct,
        resource_group: resourceGroup,
        category: "MapsTimezone",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["process"],
      type: isErr ? ["error"] : ["info"],
      action: String("Microsoft.Maps/timezone/byCoordinates"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(8e6, 2e8),
    },
    message: isErr
      ? `Maps ${acct}: timezone lookup failed`
      : `Maps ${acct}: TZ ${props.ianaZone} rows=${props.windowsResolved}`,
  };
}

/** Azure Backup — jobs, restore, policy compliance. */
export function generateBackupLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const vault = `rsv-${randId(6).toLowerCase()}`;
  const resourceId = armRsvVault(subscription.id, resourceGroup, vault);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["job", "restore", "policy", "alert", "immutability", "rpCopy"] as const);

  if (variant === "job") {
    const props = {
      backupItem: rand(["VM;iaasvmcontainerv2", "AzureFiles", "SQLDataBase"]),
      jobType: rand(["Backup", "LogBackup"]),
      status: isErr ? "Failed" : "Completed",
      dataTransferredMB: isErr ? randInt(0, 50) : randInt(200, 800_000),
      ...integrationExtendedErrFields(
        isErr,
        "Backup job failed extension crash storage throttling or VSS snapshot error",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.RecoveryServices/vaults/backupJobs/write",
      category: "AzureBackupReport",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.status,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.RecoveryServices/vaults"),
      azure: {
        backup: {
          vault,
          resource_group: resourceGroup,
          category: "AzureBackupReport",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.RecoveryServices/vaults/backupJobs/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(6e9, 3e11),
      },
      message: isErr
        ? `Backup vault ${vault}: ${props.jobType} job failed for ${props.backupItem}`
        : `Backup vault ${vault}: ${props.jobType} completed ${props.dataTransferredMB} MB`,
    };
  }

  if (variant === "restore") {
    const props = {
      restorePoint: `rp-${randId(10).toLowerCase()}`,
      target: rand(["original", "alternate"]),
      status: isErr ? "Failed" : "Completed",
      restoredSizeMB: isErr ? 0 : randInt(1024, 400_000),
      ...integrationExtendedErrFields(
        isErr,
        "Item-level or full VM restore terminated disk attach or datastore mount error",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.RecoveryServices/vaults/backupJobs/restore",
      category: "RestoreJob",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.status,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.RecoveryServices/vaults"),
      azure: {
        backup: {
          vault,
          resource_group: resourceGroup,
          category: "RestoreJob",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.RecoveryServices/vaults/backupJobs/restore"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e9, 6e11),
      },
      message: isErr
        ? `Backup vault ${vault}: restore from ${props.restorePoint} failed`
        : `Backup vault ${vault}: restore to ${props.target} OK`,
    };
  }

  if (variant === "policy") {
    const props = {
      policyName: `policy-${rand(["daily", "weekly", "tiered"])}`,
      compliant: !isErr,
      issues: isErr ? rand(["retentionWindowExceeded", "missingBackupExtension"]) : "",
      ...integrationExtendedErrFields(
        isErr,
        "Backup policy compliance scanner found gap in schedule or workload coverage",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.RecoveryServices/vaults/backupPolicies/compliance/read",
      category: "PolicyCompliance",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.compliant ? "compliant" : "non_compliant",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.RecoveryServices/vaults"),
      azure: {
        backup: {
          vault,
          resource_group: resourceGroup,
          category: "PolicyCompliance",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.RecoveryServices/vaults/backupPolicies/compliance/read"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e8, 4e9),
      },
      message: isErr
        ? `Backup vault ${vault}: policy ${props.policyName} non-compliant (${props.issues})`
        : `Backup vault ${vault}: policy ${props.policyName} compliant`,
    };
  }

  if (variant === "alert") {
    const props = {
      alertRule: `br-${randId(4).toLowerCase()}`,
      firedBecause: isErr ? "MissedBackupWindow" : "HealthyHeartbeat",
      impactedItems: isErr ? randInt(3, 80) : 0,
      ...integrationExtendedErrFields(
        isErr,
        "Backup Monitoring alert fired for missed RPO or backup job overrun",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.RecoveryServices/vaults/backupAlerts/fire",
      category: "BackupMonitoring",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.firedBecause,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.RecoveryServices/vaults"),
      azure: {
        backup: {
          vault,
          resource_group: resourceGroup,
          category: "BackupMonitoring",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.RecoveryServices/vaults/backupAlerts/fire"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(8e8, 3e10),
      },
      message: isErr
        ? `Backup vault ${vault}: alert ${props.alertRule} items=${props.impactedItems}`
        : `Backup vault ${vault}: alert pipeline OK`,
    };
  }

  if (variant === "immutability") {
    const props = {
      lockedRetentionDays: randInt(7, 90),
      mutateAttemptBlocked: isErr,
      solicitor: rand(["arm", "cli", "portal"]),
      ...integrationExtendedErrFields(
        isErr,
        "Attempt to shorten immutability window or delete immutable RP was denied",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.RecoveryServices/vaults/backupSecurity/immutability",
      category: "ImmutabilityGuard",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.mutateAttemptBlocked ? "blocked" : "compliant",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.RecoveryServices/vaults"),
      azure: {
        backup: {
          vault,
          resource_group: resourceGroup,
          category: "ImmutabilityGuard",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.RecoveryServices/vaults/backupSecurity/immutability"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e9, 2e11),
      },
      message: isErr
        ? `Backup vault ${vault}: immutability violation via ${props.solicitor}`
        : `Backup vault ${vault}: immutability ${props.lockedRetentionDays}d enforced`,
    };
  }

  const props = {
    sourceRegion: region,
    targetRegion: rand(["eastus2", "westus3"]),
    copyJobPercent: isErr ? randInt(5, 60) : 100,
    ...integrationExtendedErrFields(
      isErr,
      "Geo-redundant RP copy stalled cross-region replication throttle",
      "data"
    ),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.RecoveryServices/vaults/backupJobs/geoCopy",
    category: "RecoveryPointReplication",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: `${props.copyJobPercent}%`,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.RecoveryServices/vaults"),
    azure: {
      backup: {
        vault,
        resource_group: resourceGroup,
        category: "RecoveryPointReplication",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["process"],
      type: isErr ? ["error"] : ["info"],
      action: String("Microsoft.RecoveryServices/vaults/backupJobs/geoCopy"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(9e10, 4e11),
    },
    message: isErr
      ? `Backup vault ${vault}: RP geo copy lag ${props.sourceRegion}->${props.targetRegion}`
      : `Backup vault ${vault}: RP copy complete`,
  };
}

/** Site Recovery — replication health, failover. */
export function generateSiteRecoveryLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const vault = `asr-${randId(6).toLowerCase()}`;
  const resourceId = armRsvVault(subscription.id, resourceGroup, vault);
  const vm = `vm-${randId(5).toLowerCase()}`;
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "replication",
    "failover",
    "admin",
    "testRecovery",
    "capacity",
    "drift",
  ] as const);

  if (variant === "replication") {
    const props = {
      protectedItem: vm,
      rpoMinutes: isErr ? randInt(45, 240) : randInt(2, 15),
      health: isErr ? "Critical" : "Healthy",
      lastSuccessfulSync: isErr ? "" : time,
      ...integrationExtendedErrFields(
        isErr,
        "Replication cycle missed crash consistent point or change rate exceeded SLA",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.RecoveryServices/vaults/replicationHealth/read",
      category: "ReplicationHealth",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.health,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.RecoveryServices/vaults"),
      azure: {
        site_recovery: {
          vault,
          resource_group: resourceGroup,
          category: "ReplicationHealth",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.RecoveryServices/vaults/replicationHealth/read"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e7, 2e9),
      },
      message: isErr
        ? `Site Recovery ${vault}: replication unhealthy for ${vm} RPO=${props.rpoMinutes}m`
        : `Site Recovery ${vault}: ${vm} replicating RPO=${props.rpoMinutes}m`,
    };
  }

  if (variant === "failover") {
    const props = {
      recoveryPlan: `rp-${randId(6).toLowerCase()}`,
      direction: rand(["PrimaryToRecovery", "RecoveryToPrimary"]),
      status: isErr ? "Failed" : "Succeeded",
      step: rand(["ShutdownSource", "CreateVm", "AttachNic", "Finalize"]),
      ...integrationExtendedErrFields(
        isErr,
        "Failover orchestration halted on recovery plan checkpoint error",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.RecoveryServices/vaults/replicationFabrics/failover/action",
      category: "FailoverEvent",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.status,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.RecoveryServices/vaults"),
      azure: {
        site_recovery: {
          vault,
          resource_group: resourceGroup,
          category: "FailoverEvent",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.RecoveryServices/vaults/replicationFabrics/failover/action"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(6e9, 4e11),
      },
      message: isErr
        ? `Site Recovery ${vault}: failover ${props.recoveryPlan} failed at ${props.step}`
        : `Site Recovery ${vault}: failover ${props.direction} ${props.status}`,
    };
  }

  if (variant === "testRecovery") {
    const props = {
      isolationNetwork: `vnet-asr-${randId(3)}`,
      testVmName: `test-${vm}`,
      cleanupStatus: isErr ? "stuck" : "removed",
      ...integrationExtendedErrFields(
        isErr,
        "Test failover cleanup could not purge isolated NICs or test resource group",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.RecoveryServices/vaults/replicationProtectedItems/testFailover",
      category: "TestFailover",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.cleanupStatus,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.RecoveryServices/vaults"),
      azure: {
        site_recovery: {
          vault,
          resource_group: resourceGroup,
          category: "TestFailover",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.RecoveryServices/vaults/replicationProtectedItems/testFailover"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e10, 3e11),
      },
      message: isErr
        ? `Site Recovery ${vault}: TFO cleanup ${props.testVmName}`
        : `Site Recovery ${vault}: TFO in ${props.isolationNetwork}`,
    };
  }

  if (variant === "capacity") {
    const props = {
      reservedCoresRecovery: randInt(8, 64),
      burstingOvercommit: isErr,
      churningVms: isErr ? randInt(120, 400) : randInt(5, 80),
      ...integrationExtendedErrFields(
        isErr,
        "Recovery vault fabric reported CPU commit overage blocking new protections",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.RecoveryServices/vaults/capacity/report",
      category: "FabricCapacity",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.burstingOvercommit ? "over" : "nominal",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.RecoveryServices/vaults"),
      azure: {
        site_recovery: {
          vault,
          resource_group: resourceGroup,
          category: "FabricCapacity",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.RecoveryServices/vaults/capacity/report"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e10, 3e11),
      },
      message: isErr
        ? `Site Recovery ${vault}: churn VMs=${props.churningVms}`
        : `Site Recovery ${vault}: reserved cores=${props.reservedCoresRecovery}`,
    };
  }

  if (variant === "drift") {
    const props = {
      configDriftPct: isErr ? randFloat(12, 40) : randFloat(0, 4),
      baselineTag: rand(["feb2026", "asr-sync"]),
      autoRemediated: !isErr,
      ...integrationExtendedErrFields(
        isErr,
        "Detected configuration drift between primary VM extensions and replicated profile",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.RecoveryServices/vaults/replicationProviders/driftScan",
      category: "ConfigDrift",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.autoRemediated ? "healed" : "manual_review",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Information" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.RecoveryServices/vaults"),
      azure: {
        site_recovery: {
          vault,
          resource_group: resourceGroup,
          category: "ConfigDrift",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.RecoveryServices/vaults/replicationProviders/driftScan"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e11, 6e11),
      },
      message: isErr
        ? `Site Recovery ${vault}: drift ${props.configDriftPct.toFixed(1)}% (${props.baselineTag})`
        : `Site Recovery ${vault}: baseline aligned`,
    };
  }

  const props = {
    eventCategory: "Administrative",
    status: isErr ? "Failed" : "Succeeded",
    httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
    ...integrationExtendedErrFields(
      isErr,
      "Recovery Services vault ARM metadata update conflicted replication locks",
      "adminOrProvision"
    ),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.RecoveryServices/vaults/write",
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "409" : "200",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.RecoveryServices/vaults"),
    azure: {
      site_recovery: {
        vault,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["process"],
      type: isErr ? ["error"] : ["info"],
      action: String("Microsoft.RecoveryServices/vaults/write"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(1e8, 5e9),
    },
    message: isErr ? `ASR vault ${vault}: ARM update failed` : `ASR vault ${vault}: updated`,
  };
}

/** Azure Migrate — assessment, discovery, migration status. */
export function generateMigrateLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const proj = `migr-${randId(6).toLowerCase()}`;
  const resourceId = armMigrateProj(subscription.id, resourceGroup, proj);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "assess",
    "discover",
    "replicate",
    "dependencyMap",
    "cutover",
    "rightsizing",
  ] as const);

  if (variant === "assess") {
    const props = {
      assessmentName: `asmt-${randId(6).toLowerCase()}`,
      readiness: isErr ? "Unknown" : rand(["Ready", "ReadyWithConditions", "NotReady"]),
      monthlyCostUSD: isErr ? -1 : randInt(400, 25_000),
      ...integrationExtendedErrFields(
        isErr,
        "Azure Migrate assessment engine failed loading performance counters export",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Migrate/assessmentProjects/assessments/evaluate",
      category: "Assessment",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.readiness,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Migrate/assessmentProjects"),
      azure: {
        migrate: {
          project: proj,
          resource_group: resourceGroup,
          category: "Assessment",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Migrate/assessmentProjects/assessments/evaluate"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e9, 2e11),
      },
      message: isErr
        ? `Migrate ${proj}: assessment ${props.assessmentName} failed`
        : `Migrate ${proj}: assessment ${props.assessmentName} readiness=${props.readiness}`,
    };
  }

  if (variant === "discover") {
    const props = {
      appliance: `appl-${randId(4).toLowerCase()}`,
      machinesDiscovered: isErr ? randInt(0, 5) : randInt(12, 500),
      oSHits: isErr ? 0 : randInt(1, 30),
      lastDiscovery: time,
      ...integrationExtendedErrFields(
        isErr,
        "Lightweight appliance collector could not authenticate to vCenter Hypervisor host",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Migrate/assessmentProjects/discoveredMachines/read",
      category: "Discovery",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.machinesDiscovered),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Migrate/assessmentProjects"),
      azure: {
        migrate: {
          project: proj,
          resource_group: resourceGroup,
          category: "Discovery",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Migrate/assessmentProjects/discoveredMachines/read"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e8, 9e9),
      },
      message: isErr
        ? `Migrate ${proj}: discovery via ${props.appliance} degraded`
        : `Migrate ${proj}: discovered ${props.machinesDiscovered} machines`,
    };
  }

  if (variant === "replicate") {
    const props = {
      machine: `srv-${randId(6).toLowerCase()}`,
      replicationState: isErr ? "Error" : rand(["Replicating", "Synced", "TestFailoverComplete"]),
      progressPercent: isErr ? randInt(0, 40) : 100,
      ...integrationExtendedErrFields(
        isErr,
        "Replication agent on source server backlog or IR channel dropped blocks",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Migrate/replicationFabrics/replicationProtectionItems/read",
      category: "MigrationStatus",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.replicationState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Migrate/assessmentProjects"),
      azure: {
        migrate: {
          project: proj,
          resource_group: resourceGroup,
          category: "MigrationStatus",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Migrate/replicationFabrics/replicationProtectionItems/read"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e9, 5e10),
      },
      message: isErr
        ? `Migrate ${proj}: replication error for ${props.machine}`
        : `Migrate ${proj}: ${props.machine} ${props.replicationState}`,
    };
  }

  if (variant === "dependencyMap") {
    const props = {
      mapId: `deps-${randId(6)}`,
      edgesResolved: isErr ? randInt(0, 120) : randInt(400, 12_000),
      unresolvedPorts: isErr ? randInt(4, 90) : randInt(0, 6),
      ...integrationExtendedErrFields(
        isErr,
        "Dependency visualization missed TCP flows due to packet capture gap on appliance",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Migrate/assessmentProjects/dependencyGroups/build",
      category: "DependencyMap",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "incomplete" : "complete",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Migrate/assessmentProjects"),
      azure: {
        migrate: {
          project: proj,
          resource_group: resourceGroup,
          category: "DependencyMap",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Migrate/assessmentProjects/dependencyGroups/build"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(8e9, 3e11),
      },
      message: isErr
        ? `Migrate ${proj}: dependency map ${props.mapId} unresolved=${props.unresolvedPorts}`
        : `Migrate ${proj}: deps edges=${props.edgesResolved}`,
    };
  }

  if (variant === "cutover") {
    const props = {
      plannedDowntimeMin: randInt(10, 240),
      finalizeState: isErr ? "RollbackInitiated" : "Committed",
      ...integrationExtendedErrFields(
        isErr,
        "Cutover validation script failed storage mount on Azure target VM",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Migrate/replicationFabrics/cutover/action",
      category: "MigrationCutover",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.finalizeState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Migrate/assessmentProjects"),
      azure: {
        migrate: {
          project: proj,
          resource_group: resourceGroup,
          category: "MigrationCutover",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.Migrate/replicationFabrics/cutover/action"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e10, 9e11),
      },
      message: isErr
        ? `Migrate ${proj}: cutover aborted ${props.finalizeState}`
        : `Migrate ${proj}: cutover ${props.plannedDowntimeMin}m window OK`,
    };
  }

  const props = {
    vmSizeTarget: rand(["Standard_D8s_v5", "Standard_E16s_v5"]),
    coresDelta: isErr ? randInt(-4, 2) : randInt(8, 48),
    licensingNotes: isErr ? "SQL BYOL conflict" : "",
    ...integrationExtendedErrFields(
      isErr,
      "Rightsizing recommendation blocked by reserved instance or license bundle conflict",
      "data"
    ),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.Migrate/assessmentProjects/rightsizing/recommend",
    category: "Rightsizing",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.vmSizeTarget,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.Migrate/assessmentProjects"),
    azure: {
      migrate: {
        project: proj,
        resource_group: resourceGroup,
        category: "Rightsizing",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["process"],
      type: isErr ? ["error"] : ["info"],
      action: String("Microsoft.Migrate/assessmentProjects/rightsizing/recommend"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(2e9, 8e10),
    },
    message: isErr
      ? `Migrate ${proj}: rightsizing issue ${props.licensingNotes}`
      : `Migrate ${proj}: recommend ${props.vmSizeTarget} Δcores=${props.coresDelta}`,
  };
}

/** Azure Data Box — order lifecycle, copy progress, shipping. */
export function generateDataBoxLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const job = `databox-${randId(6).toLowerCase()}`;
  const resourceId = armDataBoxJob(subscription.id, resourceGroup, job);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["order", "copy", "ship", "validate", "erase", "handoff"] as const);

  if (variant === "order") {
    const props = {
      sku: rand(["DataBox", "DataBoxHeavy", "DataBoxDisk"]),
      stage: isErr ? "Cancelled" : rand(["DeviceOrdered", "DevicePrepared", "Delivered"]),
      trackingNumber: isErr ? "" : `1Z${randId(12).toUpperCase()}`,
      ...integrationExtendedErrFields(
        isErr,
        "Data Box logistics order cancelled carrier exception or address verification failed",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.DataBox/jobs/write",
      category: "OrderLifecycle",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.stage,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.DataBox/jobs"),
      azure: {
        data_box: {
          job,
          resource_group: resourceGroup,
          category: "OrderLifecycle",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.DataBox/jobs/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e10, 6e11),
      },
      message: isErr
        ? `Data Box ${job}: order lifecycle stalled (${props.stage})`
        : `Data Box ${job}: order ${props.sku} stage=${props.stage}`,
    };
  }

  if (variant === "copy") {
    const props = {
      bytesCopied: isErr ? randInt(0, 1e9) : randInt(50e9, 2e12),
      filesErrored: isErr ? randInt(10, 5000) : randInt(0, 5),
      percentComplete: isErr ? randInt(5, 60) : 100,
      ...integrationExtendedErrFields(
        isErr,
        "On-appliance copy utility hit checksum mismatch or USB backplane IO error",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.DataBox/jobs/copy/status",
      category: "CopyProgress",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: `${props.percentComplete}%`,
      callerIpAddress: "169.254.169.254",
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.DataBox/jobs"),
      azure: {
        data_box: {
          job,
          resource_group: resourceGroup,
          category: "CopyProgress",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.DataBox/jobs/copy/status"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(6e9, 3e11),
      },
      message: isErr
        ? `Data Box ${job}: copy errors=${props.filesErrored} at ${props.percentComplete}%`
        : `Data Box ${job}: copy complete bytes=${props.bytesCopied}`,
    };
  }

  if (variant === "validate") {
    const props = {
      manifestFiles: isErr ? randInt(0, 800) : randInt(2_000, 900_000),
      hashMismatches: isErr ? randInt(2, 600) : randInt(0, 2),
      ...integrationExtendedErrFields(
        isErr,
        "Pre-upload manifest validation failed BLAKE or MD5 mismatch versus cloud catalog",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.DataBox/jobs/validate/action",
      category: "PrecheckValidation",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "rejected" : "passed",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.DataBox/jobs"),
      azure: {
        data_box: {
          job,
          resource_group: resourceGroup,
          category: "PrecheckValidation",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.DataBox/jobs/validate/action"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(7e9, 4e11),
      },
      message: isErr
        ? `Data Box ${job}: validate mismatches=${props.hashMismatches}`
        : `Data Box ${job}: manifest files=${props.manifestFiles}`,
    };
  }

  if (variant === "erase") {
    const props = {
      wipePasses: isErr ? randInt(1, 2) : randInt(3, 7),
      tpmLockState: isErr ? "pending" : "cleared",
      ...integrationExtendedErrFields(
        isErr,
        "Secure erase routine did not complete NIST 800-88 verification on appliance disks",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.DataBox/jobs/erase/action",
      category: "SecureErase",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.tpmLockState,
      callerIpAddress: "127.0.0.1",
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.DataBox/jobs"),
      azure: {
        data_box: {
          job,
          resource_group: resourceGroup,
          category: "SecureErase",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.DataBox/jobs/erase/action"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e11, 9e11),
      },
      message: isErr
        ? `Data Box ${job}: erase incomplete passes=${props.wipePasses}`
        : `Data Box ${job}: disks wiped`,
    };
  }

  if (variant === "handoff") {
    const props = {
      datacenterHandoff: rand(["AM3", "SN4", "DM2"]),
      receiptAck: isErr ? "missing" : "signed",
      ...integrationExtendedErrFields(
        isErr,
        "Azure DC receiving team did not acknowledge chain-of-custody handoff scan",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.DataBox/jobs/receiving/ack",
      category: "DcHandoff",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.receiptAck,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.DataBox/jobs"),
      azure: {
        data_box: {
          job,
          resource_group: resourceGroup,
          category: "DcHandoff",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.DataBox/jobs/receiving/ack"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e10, 4e11),
      },
      message: isErr
        ? `Data Box ${job}: handoff ${props.datacenterHandoff} ${props.receiptAck}`
        : `Data Box ${job}: received at ${props.datacenterHandoff}`,
    };
  }

  const props = {
    carrierEvent: isErr ? "delivery_exception" : "picked_up",
    hub: rand(["SJC", "DFW", "AMS"]),
    etaDays: isErr ? -1 : randInt(2, 9),
    ...integrationExtendedErrFields(
      isErr,
      "Carrier logistics update reported exception or lost scan for Data Box shipment",
      "data"
    ),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.DataBox/jobs/shipping/update",
    category: "Shipping",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.carrierEvent,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.DataBox/jobs"),
    azure: {
      data_box: {
        job,
        resource_group: resourceGroup,
        category: "Shipping",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["process"],
      type: isErr ? ["error"] : ["info"],
      action: String("Microsoft.DataBox/jobs/shipping/update"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(8e10, 4e11),
    },
    message: isErr
      ? `Data Box ${job}: shipping event ${props.carrierEvent} at ${props.hub}`
      : `Data Box ${job}: in transit via ${props.hub} ETA ${props.etaDays}d`,
  };
}

/** Dev Center — dev boxes, catalog sync. */
export function generateDevcenterLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const dc = `devc-${randId(5).toLowerCase()}`;
  const resourceId = armDevCenter(subscription.id, resourceGroup, dc);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "devbox",
    "catalog",
    "admin",
    "quota",
    "identities",
    "connectivity",
  ] as const);

  if (variant === "devbox") {
    const props = {
      devBoxName: `db-${randId(6).toLowerCase()}`,
      projectName: `proj-${randId(4).toLowerCase()}`,
      action: isErr ? "hibernate_failed" : rand(["start", "stop", "provision"]),
      state: isErr ? "Failed" : "Succeeded",
      ...integrationExtendedErrFields(
        isErr,
        "Dev Center dev box lifecycle action failed power orchestration networking or quota",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.DevCenter/devcenters/devboxes/action",
      category: "DevBoxOperation",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.state,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.DevCenter/devcenters"),
      azure: {
        dev_center: {
          dev_center: dc,
          resource_group: resourceGroup,
          category: "DevBoxOperation",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.DevCenter/devcenters/devboxes/action"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e9, 5e10),
      },
      message: isErr
        ? `Dev Center ${dc}: dev box ${props.devBoxName} ${props.action}`
        : `Dev Center ${dc}: ${props.devBoxName} ${props.action} ${props.state}`,
    };
  }

  if (variant === "catalog") {
    const props = {
      catalogName: rand(["default", "engineering"]),
      imagesSynced: isErr ? 0 : randInt(1, 40),
      syncStatus: isErr ? "Failed" : "Succeeded",
      detail: isErr ? "git credential unauthorized for image builder repo" : "",
      ...integrationExtendedErrFields(
        isErr,
        "Dev Center gallery catalog sync failed pulling image definitions from SCM",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.DevCenter/devcenters/galleries/sync",
      category: "CatalogSync",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.syncStatus,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.DevCenter/devcenters"),
      azure: {
        dev_center: {
          dev_center: dc,
          resource_group: resourceGroup,
          category: "CatalogSync",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.DevCenter/devcenters/galleries/sync"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e8, 2e10),
      },
      message: isErr
        ? `Dev Center ${dc}: catalog ${props.catalogName} sync failed`
        : `Dev Center ${dc}: catalog ${props.catalogName} synced ${props.imagesSynced} images`,
    };
  }

  if (variant === "quota") {
    const props = {
      devBoxQuota: randInt(40, 200),
      consumed: isErr ? randInt(195, 220) : randInt(5, 90),
      ...integrationExtendedErrFields(
        isErr,
        "Dev Center pooled dev box vCPU entitlement exceeded blocking new allocations",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.DevCenter/devcenters/quotas/read",
      category: "QuotaUtilization",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: `${props.consumed}/${props.devBoxQuota}`,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.DevCenter/devcenters"),
      azure: {
        dev_center: {
          dev_center: dc,
          resource_group: resourceGroup,
          category: "QuotaUtilization",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.DevCenter/devcenters/quotas/read"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e10, 2e11),
      },
      message: isErr ? `Dev Center ${dc}: quota saturated` : `Dev Center ${dc}: quota OK`,
    };
  }

  if (variant === "identities") {
    const props = {
      principalType: rand(["User", "Group"]),
      rbacAssignmentsSynced: isErr ? randInt(0, 4) : randInt(40, 400),
      ...integrationExtendedErrFields(
        isErr,
        "Entra-backed identity sync for Dev Center stalled on Graph API throttle",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.DevCenter/devcenters/access/identities/sync",
      category: "IdentitySync",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "stale_rbac" : "synced",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.DevCenter/devcenters"),
      azure: {
        dev_center: {
          dev_center: dc,
          resource_group: resourceGroup,
          category: "IdentitySync",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.DevCenter/devcenters/access/identities/sync"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e11, 4e11),
      },
      message: isErr ? `Dev Center ${dc}: identity sync degraded` : `Dev Center ${dc}: RBAC ok`,
    };
  }

  if (variant === "connectivity") {
    const props = {
      fqdnResolved: !isErr,
      privateEndpointState: isErr ? "Disconnected" : "Approved",
      ...integrationExtendedErrFields(
        isErr,
        "Private endpoint NIC for Dev Center service lost BGP route propagation",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.DevCenter/devcenters/network/connectivity/read",
      category: "ConnectivityProbe",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.privateEndpointState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.DevCenter/devcenters"),
      azure: {
        dev_center: {
          dev_center: dc,
          resource_group: resourceGroup,
          category: "ConnectivityProbe",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.DevCenter/devcenters/network/connectivity/read"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e8, 9e10),
      },
      message: isErr ? `Dev Center ${dc}: private link unhealthy` : `Dev Center ${dc}: PEP OK`,
    };
  }

  const props = {
    eventCategory: "Administrative",
    status: isErr ? "Failed" : "Succeeded",
    httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
    ...integrationExtendedErrFields(
      isErr,
      "ARM update to Dev Center failed attached network or MSI validation",
      "adminOrProvision"
    ),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.DevCenter/devcenters/write",
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "400" : "200",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.DevCenter/devcenters"),
    azure: {
      dev_center: {
        dev_center: dc,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["process"],
      type: isErr ? ["error"] : ["info"],
      action: String("Microsoft.DevCenter/devcenters/write"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(2e8, 5e9),
    },
    message: isErr ? `Dev Center ${dc}: update failed` : `Dev Center ${dc}: configuration updated`,
  };
}

/** Lab Services — lab provisioning, VM claim/unclaim. */
export function generateLabServicesLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const plan = `labplan-${randId(5).toLowerCase()}`;
  const resourceId = armLabPlan(subscription.id, resourceGroup, plan);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["provision", "claim", "admin", "image", "schedule", "usage"] as const);

  if (variant === "provision") {
    const props = {
      labName: `lab-${randId(4).toLowerCase()}`,
      capacity: randInt(20, 120),
      provisioningState: isErr ? "Failed" : "Succeeded",
      reason: isErr ? "quota exceeded for lab SKU in region" : "",
      ...integrationExtendedErrFields(
        isErr,
        "Lab plan could not provision VMs because regional lab SKU quota exhausted",
        "adminOrProvision"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.LabServices/labPlans/labs/write",
      category: "LabProvisioning",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.provisioningState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.LabServices/labPlans"),
      azure: {
        lab_services: {
          lab_plan: plan,
          resource_group: resourceGroup,
          category: "LabProvisioning",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.LabServices/labPlans/labs/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(6e8, 2e10),
      },
      message: isErr
        ? `Lab Services ${plan}: lab ${props.labName} provision failed (${props.reason})`
        : `Lab Services ${plan}: lab ${props.labName} provisioned capacity=${props.capacity}`,
    };
  }

  if (variant === "claim") {
    const props = {
      studentId: `stu-${randId(6).toLowerCase()}`,
      vmName: `student-vm-${randInt(1, 40)}`,
      action: isErr ? "unclaim_failed" : rand(["claim", "unclaim"]),
      outcome: isErr ? "Failed" : "Succeeded",
      ...integrationExtendedErrFields(
        isErr,
        "Student VM claim or unclaim rejected due to quota or lab schedule window",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.LabServices/labs/virtualMachines/action",
      category: "VmClaim",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.outcome,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.LabServices/labPlans"),
      azure: {
        lab_services: {
          lab_plan: plan,
          resource_group: resourceGroup,
          category: "VmClaim",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.LabServices/labs/virtualMachines/action"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e8, 6e9),
      },
      message: isErr
        ? `Lab Services ${plan}: ${props.action} for ${props.studentId} failed`
        : `Lab Services ${plan}: ${props.studentId} ${props.action} ${props.vmName}`,
    };
  }

  if (variant === "image") {
    const props = {
      galleryImage: rand(["win11-dev", "ubuntu-22-lab"]),
      publishState: isErr ? "Failed" : "Succeeded",
      ...integrationExtendedErrFields(
        isErr,
        "Custom lab image publish to compute gallery failed sysprep validation",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.LabServices/labPlans/images/publish",
      category: "ImagePublish",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.publishState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.LabServices/labPlans"),
      azure: {
        lab_services: {
          lab_plan: plan,
          resource_group: resourceGroup,
          category: "ImagePublish",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.LabServices/labPlans/images/publish"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(9e10, 6e11),
      },
      message: isErr
        ? `Lab Services ${plan}: image ${props.galleryImage} publish failed`
        : `Lab Services ${plan}: published ${props.galleryImage}`,
    };
  }

  if (variant === "schedule") {
    const props = {
      quietHoursEnforced: !isErr || Math.random() > 0.5,
      violatedByUser: isErr,
      ...integrationExtendedErrFields(
        isErr,
        "Lab schedule policy blocked VM start outside allowed teaching hours",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.LabServices/labs/schedules/action",
      category: "LabSchedule",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.quietHoursEnforced ? "enforced" : "violation",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.LabServices/labPlans"),
      azure: {
        lab_services: {
          lab_plan: plan,
          resource_group: resourceGroup,
          category: "LabSchedule",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.LabServices/labs/schedules/action"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e8, 4e10),
      },
      message: isErr
        ? `Lab Services ${plan}: schedule violation user=${props.violatedByUser}`
        : `Lab Services ${plan}: schedule OK`,
    };
  }

  if (variant === "usage") {
    const props = {
      coreHoursConsumed: isErr ? randFloat(120, 400) : randFloat(4, 110),
      quotaCoreHours: 200,
      ...integrationExtendedErrFields(
        isErr,
        "Lab usage meter shows students exceeded purchased core-hour bundle",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.LabServices/labPlans/usage/read",
      category: "Metering",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: `${props.coreHoursConsumed.toFixed(1)}/${props.quotaCoreHours}`,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.LabServices/labPlans"),
      azure: {
        lab_services: {
          lab_plan: plan,
          resource_group: resourceGroup,
          category: "Metering",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.LabServices/labPlans/usage/read"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e10, 9e10),
      },
      message: isErr
        ? `Lab Services ${plan}: usage exceeds quota`
        : `Lab Services ${plan}: metering healthy`,
    };
  }

  const props = {
    eventCategory: "Administrative",
    status: isErr ? "Failed" : "Succeeded",
    httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
    ...integrationExtendedErrFields(
      isErr,
      "Lab plan ARM metadata update failed conflicting template or region lock",
      "adminOrProvision"
    ),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.LabServices/labPlans/write",
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "409" : "200",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.LabServices/labPlans"),
    azure: {
      lab_services: {
        lab_plan: plan,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["process"],
      type: isErr ? ["error"] : ["info"],
      action: String("Microsoft.LabServices/labPlans/write"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(1e8, 4e9),
    },
    message: isErr ? `Lab plan ${plan}: update failed` : `Lab plan ${plan}: updated`,
  };
}

/** Azure Load Testing — test runs, metrics collection. */
export function generateLoadTestingLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const test = `load-${randId(5).toLowerCase()}`;
  const resourceId = armLoadTest(subscription.id, resourceGroup, test);
  const runId = randUUID();
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["run", "metrics", "admin", "artifact", "subnet", "capacity"] as const);

  if (variant === "run") {
    const props = {
      testRunId: runId,
      vus: isErr ? randInt(50, 200) : randInt(200, 5000),
      durationSec: randInt(60, 3600),
      outcome: isErr ? "Failed" : "Completed",
      errorRate: isErr ? randFloat(15, 80) : randFloat(0, 2.5),
      ...integrationExtendedErrFields(
        isErr,
        "Load test run aborted high client error rate against target endpoint",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.LoadTestService/loadTests/testRuns/write",
      category: "TestRun",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.outcome,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.LoadTestService/loadTests"),
      azure: {
        load_testing: {
          test,
          resource_group: resourceGroup,
          category: "TestRun",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: "Microsoft.LoadTestService/loadTests/testRuns/write",
        outcome: isErr ? "failure" : "success",
        duration: props.durationSec * 1e9,
      },
      message: isErr
        ? `Load test ${test}: run ${runId} failed errorRate=${props.errorRate.toFixed(1)}%`
        : `Load test ${test}: run ${runId} completed VUs=${props.vus}`,
    };
  }

  if (variant === "metrics") {
    const props = {
      testRunId: runId,
      samplesIngested: isErr ? randInt(0, 500) : randInt(50_000, 12_000_000),
      aggregatorLagSec: isErr ? randFloat(30, 180) : randFloat(0.2, 4),
      status: isErr ? "degraded" : "healthy",
      ...integrationExtendedErrFields(
        isErr,
        "Metrics ingestion backlog for load test engine aggregator partition",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.LoadTestService/loadTests/metrics/ingest",
      category: "MetricsCollection",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.status,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.LoadTestService/loadTests"),
      azure: {
        load_testing: {
          test,
          resource_group: resourceGroup,
          category: "MetricsCollection",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.LoadTestService/loadTests/metrics/ingest"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e8, 5e9),
      },
      message: isErr
        ? `Load test ${test}: metrics pipeline lag ${props.aggregatorLagSec.toFixed(1)}s`
        : `Load test ${test}: ingested ${props.samplesIngested} metric samples`,
    };
  }

  if (variant === "artifact") {
    const props = {
      jmxAsset: `test-${randId(4)}.jmx`,
      parseValid: !isErr,
      ...integrationExtendedErrFields(
        isErr,
        "Test plan artifact parser rejected JMX referencing unavailable datasets",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.LoadTestService/loadTests/testFiles/validate",
      category: "TestArtifact",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.parseValid ? "ok" : "invalid",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.LoadTestService/loadTests"),
      azure: {
        load_testing: {
          test,
          resource_group: resourceGroup,
          category: "TestArtifact",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.LoadTestService/loadTests/testFiles/validate"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e8, 8e9),
      },
      message: isErr
        ? `Load test ${test}: artifact ${props.jmxAsset} invalid`
        : `Load test ${test}: artifact validated`,
    };
  }

  if (variant === "subnet") {
    const props = {
      injectedSubnetId: `/subscriptions/.../ subnets/snet-${randId(3)}`,
      privateLinkOk: !isErr,
      ...integrationExtendedErrFields(
        isErr,
        "Engine VNet injection subnet missing service delegation for load testing",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.LoadTestService/loadTests/network/validate",
      category: "EngineNetworking",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.privateLinkOk ? "delegated" : "misconfigured",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.LoadTestService/loadTests"),
      azure: {
        load_testing: {
          test,
          resource_group: resourceGroup,
          category: "EngineNetworking",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.LoadTestService/loadTests/network/validate"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(9e8, 7e10),
      },
      message: isErr
        ? `Load test ${test}: subnet validation failed`
        : `Load test ${test}: subnet OK`,
    };
  }

  if (variant === "capacity") {
    const props = {
      maxVUsAllowed: randInt(200, 8000),
      requestedVUs: isErr ? randInt(9000, 20_000) : randInt(100, 3500),
      ...integrationExtendedErrFields(
        isErr,
        "Requested virtual user concurrency exceeds subscription load testing quota",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.LoadTestService/loadTests/limits/check",
      category: "ServiceQuota",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "denied" : "approved",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.LoadTestService/loadTests"),
      azure: {
        load_testing: {
          test,
          resource_group: resourceGroup,
          category: "ServiceQuota",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.LoadTestService/loadTests/limits/check"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(6e8, 9e9),
      },
      message: isErr
        ? `Load test ${test}: quota cap ${props.maxVUsAllowed}`
        : `Load test ${test}: VU request ${props.requestedVUs}`,
    };
  }

  const props = {
    eventCategory: "Administrative",
    status: isErr ? "Failed" : "Succeeded",
    httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
    ...integrationExtendedErrFields(
      isErr,
      "Load test ARM resource update failed identity or location constraints",
      "adminOrProvision"
    ),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.LoadTestService/loadTests/write",
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "403" : "200",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.LoadTestService/loadTests"),
    azure: {
      load_testing: {
        test,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["process"],
      type: isErr ? ["error"] : ["info"],
      action: String("Microsoft.LoadTestService/loadTests/write"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(1e8, 3e9),
    },
    message: isErr ? `Load test resource ${test}: update failed` : `Load test ${test}: updated`,
  };
}

/** Azure DevOps Pipelines (resource shape) — runs, stages. */
export function generatePipelineLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const name = `pipeline-${rand(["api", "web", "etl"])}-${randId(4).toLowerCase()}`;
  const resourceId = armDevOpsPipeline(subscription.id, resourceGroup, name);
  const runId = randInt(10_000, 999_999);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["run", "stage", "admin", "approval", "queue", "check"] as const);

  if (variant === "run") {
    const props = {
      runId,
      sourceBranch: rand(["main", "release/2026.05", "users/jane/feature"]),
      reason: rand(["manual", "schedule", "ci"]),
      result: isErr ? "failed" : "succeeded",
      totalDurationMin: isErr ? randInt(2, 45) : randInt(5, 120),
      ...integrationExtendedErrFields(
        isErr,
        "Pipeline run failed downstream template expression or service connection auth",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.DevOps/pipelines/runs/complete",
      category: "PipelineRun",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.result,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.DevOps/pipelines"),
      azure: {
        devops_pipeline: {
          pipeline: name,
          resource_group: resourceGroup,
          category: "PipelineRun",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: "Microsoft.DevOps/pipelines/runs/complete",
        outcome: isErr ? "failure" : "success",
        duration: props.totalDurationMin * 60e9,
      },
      message: isErr
        ? `Pipeline ${name}: run ${runId} failed (${props.reason})`
        : `Pipeline ${name}: run ${runId} ${props.result} in ${props.totalDurationMin}m`,
    };
  }

  if (variant === "stage") {
    const props = {
      runId,
      stageName: rand(["Build", "Deploy_Prod", "IntegrationTests"]),
      jobName: rand(["compile", "publish_artifact", "helm_upgrade"]),
      result: isErr ? "failed" : "succeeded",
      durationSec: isErr ? randInt(30, 400) : randInt(45, 900),
      ...integrationExtendedErrFields(
        isErr,
        "Stage job failed agent lost communication or script returned non-zero exit",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.DevOps/pipelines/stages/complete",
      category: "PipelineStage",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.stageName,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.DevOps/pipelines"),
      azure: {
        devops_pipeline: {
          pipeline: name,
          resource_group: resourceGroup,
          category: "PipelineStage",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: "Microsoft.DevOps/pipelines/stages/complete",
        outcome: isErr ? "failure" : "success",
        duration: props.durationSec * 1e9,
      },
      message: isErr
        ? `Pipeline ${name}: stage ${props.stageName}/${props.jobName} failed`
        : `Pipeline ${name}: stage ${props.stageName} job ${props.jobName} OK`,
    };
  }

  if (variant === "approval") {
    const props = {
      runId,
      environmentName: rand(["staging-gate", "prod-cab"]),
      decision: isErr ? "rejected" : "approved",
      approverGroup: rand(["release-managers", "security-champions"]),
      ...integrationExtendedErrFields(
        isErr,
        "Manual validation deployment gate rejected CAB sign-off prerequisites",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.DevOps/pipelines/approvals/complete",
      category: "PipelineApproval",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.decision,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.DevOps/pipelines"),
      azure: {
        devops_pipeline: {
          pipeline: name,
          resource_group: resourceGroup,
          category: "PipelineApproval",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.DevOps/pipelines/approvals/complete"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e10, 5e11),
      },
      message: isErr
        ? `Pipeline ${name}: approval ${props.environmentName} ${props.decision}`
        : `Pipeline ${name}: ${props.approverGroup} OK`,
    };
  }

  if (variant === "queue") {
    const props = {
      poolName: rand(["Azure Pipelines", "meridiantech-ss-linux"]),
      waitingJobs: isErr ? randInt(180, 800) : randInt(0, 25),
      ...integrationExtendedErrFields(
        isErr,
        "Agent pool queue depth spike blocked pipeline scheduling SLA",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.DevOps/pipelines/agents/queueDepth",
      category: "AgentQueue",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: `${props.waitingJobs}`,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.DevOps/pipelines"),
      azure: {
        devops_pipeline: {
          pipeline: name,
          resource_group: resourceGroup,
          category: "AgentQueue",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.DevOps/pipelines/agents/queueDepth"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e11, 6e11),
      },
      message: isErr
        ? `Pipeline ${name}: pool ${props.poolName} backlog=${props.waitingJobs}`
        : `Pipeline ${name}: queue healthy`,
    };
  }

  if (variant === "check") {
    const props = {
      policyName: rand(["branch-protection", "secret-scan-required"]),
      checkStatus: isErr ? "blocked" : "passed",
      ...integrationExtendedErrFields(
        isErr,
        "Branch policy advanced security check vetoed commits before run start",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.DevOps/pipelines/policyEvaluations/read",
      category: "PolicyCheck",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.checkStatus,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.DevOps/pipelines"),
      azure: {
        devops_pipeline: {
          pipeline: name,
          resource_group: resourceGroup,
          category: "PolicyCheck",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["process"],
        type: isErr ? ["error"] : ["info"],
        action: String("Microsoft.DevOps/pipelines/policyEvaluations/read"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e9, 4e10),
      },
      message: isErr
        ? `Pipeline ${name}: policy ${props.policyName} ${props.checkStatus}`
        : `Pipeline ${name}: checks green`,
    };
  }

  const props = {
    eventCategory: "Administrative",
    status: isErr ? "Failed" : "Succeeded",
    httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
    ...integrationExtendedErrFields(
      isErr,
      "Pipeline definition ARM write failed validation or duplicate name",
      "adminOrProvision"
    ),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.DevOps/pipelines/write",
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "400" : "200",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.DevOps/pipelines"),
    azure: {
      devops_pipeline: {
        pipeline: name,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["process"],
      type: isErr ? ["error"] : ["info"],
      action: String("Microsoft.DevOps/pipelines/write"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(1e8, 4e9),
    },
    message: isErr ? `Pipeline ${name}: ARM update failed` : `Pipeline ${name}: definition updated`,
  };
}
