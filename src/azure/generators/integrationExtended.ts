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

function armRelayNs(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Relay/namespaces/${name}`;
}

function armIotCentral(sub: string, rg: string, app: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.IoTCentral/iotApps/${app}`;
}

function armDps(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Devices/provisioningServices/${name}`;
}

function armTsi(sub: string, rg: string, env: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.TimeSeriesInsights/environments/${env}`;
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
  const variant = rand(["hybrid", "listener", "admin"] as const);

  if (variant === "hybrid") {
    const props = {
      hybridConnectionName: hc,
      bytesTransferred: isErr ? 0 : randInt(1_024, 50_000_000),
      listenerCount: isErr ? 0 : randInt(1, 8),
      status: isErr ? "Disconnected" : "Connected",
      remoteEndpoint: `${callerIp}:${randInt(1024, 65500)}`,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e6, 4e8) },
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e6, 2e8) },
      message: `Relay ${ns}/${hc}: listener ${props.eventType} (${props.clientRole})`,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 3e9) },
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
  const variant = rand(["provision", "telemetry", "rule"] as const);

  if (variant === "provision") {
    const props = {
      deviceId,
      templateId: rand(["thermostat", "sensor-pack", "gateway"]),
      provisioningStatus: isErr ? "failed" : "provisioned",
      attestationType: rand(["sas", "x509"]),
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(2e7, 5e8) },
      message: isErr
        ? `IoT Central ${app}: provision ${deviceId} failed`
        : `IoT Central ${app}: device ${deviceId} provisioned (${props.templateId})`,
    };
  }

  if (variant === "telemetry") {
    const props = {
      deviceId,
      schema: rand(["dtmi:contoso:Sensor;1", "dtmi:demo:Gateway;2"]),
      pointCount: isErr ? 0 : randInt(1, 120),
      ingressLatencyMs: isErr ? -1 : randInt(5, 800),
      dropped: isErr,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e6, 3e8) },
      message: isErr
        ? `IoT Central ${app}: telemetry drop from ${deviceId}`
        : `IoT Central ${app}: telemetry ingested from ${deviceId} points=${props.pointCount}`,
    };
  }

  const props = {
    ruleId: `rule-${randId(8).toLowerCase()}`,
    ruleName: rand(["high-temp", "battery-low", "motion-detected"]),
    fired: !isErr,
    actionsDispatched: isErr ? 0 : randInt(1, 4),
    error: isErr ? "webhook destination returned HTTP 502" : "",
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(5e6, 5e8) },
    message: isErr
      ? `IoT Central ${app}: rule ${props.ruleName} action failed`
      : `IoT Central ${app}: rule ${props.ruleName} triggered actions=${props.actionsDispatched}`,
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
  const variant = rand(["enrollment", "register", "admin"] as const);

  if (variant === "enrollment") {
    const props = {
      enrollmentGroup: `grp-${rand(["prod", "field"])}`,
      attestationType: rand(["x509", "tpm", "symmetricKey"]),
      attestationResult: isErr ? "invalid" : "verified",
      rejectionReason: isErr ? "certificate chain untrusted" : "",
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(2e6, 4e8) },
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(3e6, 6e8) },
      message: isErr
        ? `DPS ${dps}: registration ${regId} failed code=${props.errorCode}`
        : `DPS ${dps}: device ${props.deviceId} registered to ${props.assignedHub}`,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 4e9) },
    message: isErr ? `DPS ${dps}: ARM update failed` : `DPS ${dps}: configuration updated`,
  };
}

/** Time Series Insights — ingestion and query execution. */
export function generateTimeSeriesInsightsLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const env = `tsi-${randId(6).toLowerCase()}`;
  const resourceId = armTsi(subscription.id, resourceGroup, env);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["ingest", "query", "admin"] as const);

  if (variant === "ingest") {
    const props = {
      sourceEventHub: `eh-${randId(4).toLowerCase()}`,
      eventsReceived: isErr ? randInt(0, 50) : randInt(500, 500_000),
      eventsDropped: isErr ? randInt(10, 5000) : randInt(0, 5),
      lagSeconds: isErr ? randFloat(120, 900) : randFloat(0.5, 12),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.TimeSeriesInsights/environments/ingress/pipeline",
      category: "Ingress",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "degraded" : "healthy",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.TimeSeriesInsights/environments"),
      azure: {
        time_series_insights: {
          environment: env,
          resource_group: resourceGroup,
          category: "Ingress",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e7, 2e9) },
      message: isErr
        ? `TSI ${env}: ingress lag ${props.lagSeconds.toFixed(1)}s drops=${props.eventsDropped}`
        : `TSI ${env}: ingested ${props.eventsReceived} events`,
    };
  }

  if (variant === "query") {
    const props = {
      api: rand(["TSQL", "GET_EVENTS"]),
      span: isErr ? "0ms" : `${randInt(20, 8000)}ms`,
      scannedIntervals: isErr ? 0 : randInt(10, 10_000),
      rowCount: isErr ? 0 : randInt(1, 500_000),
      error: isErr ? "partial result: shard timeout" : "",
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.TimeSeriesInsights/environments/query/execute",
      category: "QueryExecution",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.api,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.TimeSeriesInsights/environments"),
      azure: {
        time_series_insights: {
          environment: env,
          resource_group: resourceGroup,
          category: "QueryExecution",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e7, 9e9) },
      message: isErr
        ? `TSI ${env}: query ${props.api} failed (${props.error})`
        : `TSI ${env}: query ${props.api} rows=${props.rowCount} in ${props.span}`,
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
    operationName: "Microsoft.TimeSeriesInsights/environments/write",
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "400" : "200",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.TimeSeriesInsights/environments"),
    azure: {
      time_series_insights: {
        environment: env,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(2e8, 5e9) },
    message: isErr ? `TSI environment ${env}: update failed` : `TSI environment ${env}: updated`,
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
  const variant = rand(["encode", "stream", "live"] as const);

  if (variant === "encode") {
    const props = {
      transform: `transform-${rand(["h264", "aac"])}`,
      jobName,
      outputAsset: `output-${randId(6).toLowerCase()}`,
      state: isErr ? "Error" : "Finished",
      progressPercent: isErr ? randInt(5, 60) : 100,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(3e9, 4e11) },
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e6, 5e8) },
      message: isErr
        ? `Media ${acct}: streaming endpoint ${props.streamingEndpoint} HTTP ${props.statusCode}`
        : `Media ${acct}: streaming endpoint ${props.streamingEndpoint} reqs=${props.manifestRequests}`,
    };
  }

  const props = {
    liveEventName: `live-${randId(5).toLowerCase()}`,
    ingestProtocol: rand(["RTMP", "SRT"]),
    state: isErr ? "Stopped" : "Running",
    bitrateKbps: isErr ? 0 : randInt(2_000, 12_000),
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(2e8, 3e9) },
    message: isErr
      ? `Media ${acct}: live event ${props.liveEventName} ingest failure`
      : `Media ${acct}: live event ${props.liveEventName} ${props.ingestProtocol} OK`,
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
  const variant = rand(["call", "chat", "sms"] as const);

  if (variant === "call") {
    const props = {
      callId: randUUID(),
      modality: rand(["audio", "video"]),
      durationSec: isErr ? randInt(0, 5) : randInt(30, 3600),
      endReason: isErr ? rand(["dropped", "signupRequired", "busy"]) : "completedNormally",
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
      event: { outcome: isErr ? "failure" : "success", duration: props.durationSec * 1e9 },
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e6, 8e8) },
      message: isErr
        ? `ACS ${svc}: chat ${props.operation} failed HTTP ${props.httpStatus}`
        : `ACS ${svc}: chat thread ${props.threadId} msgs=${props.messageCount}`,
    };
  }

  const props = {
    messageId: randUUID(),
    to: `+1${randInt(200_000_0000, 999_999_9999)}`,
    deliveryStatus: isErr ? rand(["failed", "undelivered"]) : "delivered",
    carrier: rand(["Twilio", "Infobip"]),
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 6e9) },
    message: isErr
      ? `ACS ${svc}: SMS to ${props.to} ${props.deliveryStatus}`
      : `ACS ${svc}: SMS ${props.messageId} delivered via ${props.carrier}`,
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
  const variant = rand(["conn", "message", "admin"] as const);

  if (variant === "conn") {
    const props = {
      hubName: rand(["chat", "telemetry", "dashboard"]),
      connectionId: randId(16).toLowerCase(),
      event: isErr ? "connect_failed" : rand(["connected", "disconnected"]),
      transport: rand(["websockets", "sse", "longpolling"]),
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e6, 2e8) },
      message: `SignalR ${hub}/${props.hubName}: ${props.event} transport=${props.transport}`,
    };
  }

  if (variant === "message") {
    const props = {
      hubName: rand(["chat", "orders"]),
      messagesSent: isErr ? randInt(0, 50) : randInt(1_000, 8_000_000),
      messagesDropped: isErr ? randInt(100, 50_000) : randInt(0, 10),
      rateLimitHit: isErr,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(3e7, 2e9) },
      message: isErr
        ? `SignalR ${hub}: messaging degraded drops=${props.messagesDropped}`
        : `SignalR ${hub}: message throughput ${props.messagesSent} in window`,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 4e9) },
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
  const variant = rand(["push", "reg", "admin"] as const);

  if (variant === "push") {
    const props = {
      platform: rand(["apns", "fcm", "wns", "mpns"]),
      batchSize: isErr ? randInt(1, 50) : randInt(100, 50_000),
      successCount: isErr ? randInt(0, 20) : randInt(80, 49_000),
      failureCount: isErr ? randInt(30, 500) : randInt(0, 200),
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(2e7, 8e8) },
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e6, 4e8) },
      message: isErr
        ? `Notification Hub ${hub}: registration ${props.operation} failed`
        : `Notification Hub ${hub}: registration ${props.operation} OK`,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 3e9) },
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
  const variant = rand(["runbook", "dsc", "job"] as const);

  if (variant === "runbook") {
    const props = {
      runbookName: runbook,
      jobId: randUUID(),
      runOn: rand(["Azure", "hybrid-worker-01"]),
      status: isErr ? "Failed" : "Completed",
      outputLines: isErr ? randInt(0, 20) : randInt(5, 400),
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(3e9, 1.2e11) },
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e8, 3e10) },
      message: isErr
        ? `Automation ${acct}: DSC compile failed errors=${props.errorCount}`
        : `Automation ${acct}: DSC ${props.configuration} compiled for ${props.nodeName}`,
    };
  }

  const props = {
    jobType: rand(["UpdateManagement", "ChangeTracking", "Patch"]),
    status: isErr ? "Failed" : "Completed",
    machinesTargeted: randInt(5, 500),
    machinesFailed: isErr ? randInt(1, 80) : randInt(0, 3),
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(6e9, 2e11) },
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
  const variant = rand(["kv", "feature", "admin"] as const);

  if (variant === "kv") {
    const props = {
      key: rand(["api:timeout", "cache:ttl", "payments:provider"]),
      label: rand(["", "prod", "stg"]),
      operation: isErr ? "delete" : rand(["set", "get"]),
      etag: `"${randId(8).toLowerCase()}"`,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e6, 2e8) },
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e7, 4e8) },
      message: isErr
        ? `App Config ${store}: feature ${props.featureFlag} change rejected`
        : `App Config ${store}: feature ${props.featureFlag} enabled=${props.enabled}`,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 3e9) },
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
  const variant = rand(["lifecycle", "catalog", "admin"] as const);

  if (variant === "lifecycle") {
    const props = {
      environmentType: rand(["Sandbox", "Standard"]),
      action: isErr ? "delete_failed" : rand(["create", "delete"]),
      state: isErr ? "Failed" : "Succeeded",
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(4e9, 4e11) },
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
      error: isErr ? "catalog repository unreachable (403)" : "",
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(8e8, 2e10) },
      message: isErr
        ? `Dev Center ${dc}: catalog sync failed — ${props.error}`
        : `Dev Center ${dc}: catalog synced +${props.definitionsAdded} definitions`,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 5e9) },
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
  const variant = rand(["search", "route", "render"] as const);

  if (variant === "search") {
    const props = {
      api: "search",
      queryLength: randInt(4, 40),
      resultsCount: isErr ? 0 : randInt(1, 25),
      httpStatus: isErr ? rand([400, 429]) : 200,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e6, 4e8) },
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(2e7, 6e8) },
      message: isErr
        ? `Maps ${acct}: routing unavailable`
        : `Maps ${acct}: route ${props.distanceMeters} m in ${props.durationSec}s`,
    };
  }

  const props = {
    api: "render",
    tileZoom: randInt(8, 16),
    tilesRendered: isErr ? 0 : randInt(1, 64),
    httpStatus: isErr ? rand([500, 502]) : 200,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e7, 3e8) },
    message: isErr
      ? `Maps ${acct}: render failed HTTP ${props.httpStatus}`
      : `Maps ${acct}: rendered ${props.tilesRendered} tiles z=${props.tileZoom}`,
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
  const variant = rand(["job", "restore", "policy"] as const);

  if (variant === "job") {
    const props = {
      backupItem: rand(["VM;iaasvmcontainerv2", "AzureFiles", "SQLDataBase"]),
      jobType: rand(["Backup", "LogBackup"]),
      status: isErr ? "Failed" : "Completed",
      dataTransferredMB: isErr ? randInt(0, 50) : randInt(200, 800_000),
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(6e9, 3e11) },
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(4e9, 6e11) },
      message: isErr
        ? `Backup vault ${vault}: restore from ${props.restorePoint} failed`
        : `Backup vault ${vault}: restore to ${props.target} OK`,
    };
  }

  const props = {
    policyName: `policy-${rand(["daily", "weekly", "tiered"])}`,
    compliant: !isErr,
    issues: isErr ? rand(["retentionWindowExceeded", "missingBackupExtension"]) : "",
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(2e8, 4e9) },
    message: isErr
      ? `Backup vault ${vault}: policy ${props.policyName} non-compliant (${props.issues})`
      : `Backup vault ${vault}: policy ${props.policyName} compliant`,
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
  const variant = rand(["replication", "failover", "admin"] as const);

  if (variant === "replication") {
    const props = {
      protectedItem: vm,
      rpoMinutes: isErr ? randInt(45, 240) : randInt(2, 15),
      health: isErr ? "Critical" : "Healthy",
      lastSuccessfulSync: isErr ? "" : time,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e7, 2e9) },
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(6e9, 4e11) },
      message: isErr
        ? `Site Recovery ${vault}: failover ${props.recoveryPlan} failed at ${props.step}`
        : `Site Recovery ${vault}: failover ${props.direction} ${props.status}`,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 5e9) },
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
  const variant = rand(["assess", "discover", "replicate"] as const);

  if (variant === "assess") {
    const props = {
      assessmentName: `asmt-${randId(6).toLowerCase()}`,
      readiness: isErr ? "Unknown" : rand(["Ready", "ReadyWithConditions", "NotReady"]),
      monthlyCostUSD: isErr ? -1 : randInt(400, 25_000),
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(3e9, 2e11) },
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(4e8, 9e9) },
      message: isErr
        ? `Migrate ${proj}: discovery via ${props.appliance} degraded`
        : `Migrate ${proj}: discovered ${props.machinesDiscovered} machines`,
    };
  }

  const props = {
    machine: `srv-${randId(6).toLowerCase()}`,
    replicationState: isErr ? "Error" : rand(["Replicating", "Synced", "TestFailoverComplete"]),
    progressPercent: isErr ? randInt(0, 40) : 100,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e9, 5e10) },
    message: isErr
      ? `Migrate ${proj}: replication error for ${props.machine}`
      : `Migrate ${proj}: ${props.machine} ${props.replicationState}`,
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
  const variant = rand(["order", "copy", "ship"] as const);

  if (variant === "order") {
    const props = {
      sku: rand(["DataBox", "DataBoxHeavy", "DataBoxDisk"]),
      stage: isErr ? "Cancelled" : rand(["DeviceOrdered", "DevicePrepared", "Delivered"]),
      trackingNumber: isErr ? "" : `1Z${randId(12).toUpperCase()}`,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(4e10, 6e11) },
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(6e9, 3e11) },
      message: isErr
        ? `Data Box ${job}: copy errors=${props.filesErrored} at ${props.percentComplete}%`
        : `Data Box ${job}: copy complete bytes=${props.bytesCopied}`,
    };
  }

  const props = {
    carrierEvent: isErr ? "delivery_exception" : "picked_up",
    hub: rand(["SJC", "DFW", "AMS"]),
    etaDays: isErr ? -1 : randInt(2, 9),
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(8e10, 4e11) },
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
  const variant = rand(["devbox", "catalog", "admin"] as const);

  if (variant === "devbox") {
    const props = {
      devBoxName: `db-${randId(6).toLowerCase()}`,
      projectName: `proj-${randId(4).toLowerCase()}`,
      action: isErr ? "hibernate_failed" : rand(["start", "stop", "provision"]),
      state: isErr ? "Failed" : "Succeeded",
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(4e9, 5e10) },
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e8, 2e10) },
      message: isErr
        ? `Dev Center ${dc}: catalog ${props.catalogName} sync failed`
        : `Dev Center ${dc}: catalog ${props.catalogName} synced ${props.imagesSynced} images`,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(2e8, 5e9) },
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
  const variant = rand(["provision", "claim", "admin"] as const);

  if (variant === "provision") {
    const props = {
      labName: `lab-${randId(4).toLowerCase()}`,
      capacity: randInt(20, 120),
      provisioningState: isErr ? "Failed" : "Succeeded",
      reason: isErr ? "quota exceeded for lab SKU in region" : "",
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(6e8, 2e10) },
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(3e8, 6e9) },
      message: isErr
        ? `Lab Services ${plan}: ${props.action} for ${props.studentId} failed`
        : `Lab Services ${plan}: ${props.studentId} ${props.action} ${props.vmName}`,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 4e9) },
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
  const variant = rand(["run", "metrics", "admin"] as const);

  if (variant === "run") {
    const props = {
      testRunId: runId,
      vus: isErr ? randInt(50, 200) : randInt(200, 5000),
      durationSec: randInt(60, 3600),
      outcome: isErr ? "Failed" : "Completed",
      errorRate: isErr ? randFloat(15, 80) : randFloat(0, 2.5),
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
      event: { outcome: isErr ? "failure" : "success", duration: props.durationSec * 1e9 },
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(2e8, 5e9) },
      message: isErr
        ? `Load test ${test}: metrics pipeline lag ${props.aggregatorLagSec.toFixed(1)}s`
        : `Load test ${test}: ingested ${props.samplesIngested} metric samples`,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 3e9) },
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
  const variant = rand(["run", "stage", "admin"] as const);

  if (variant === "run") {
    const props = {
      runId,
      sourceBranch: rand(["main", "release/2026.05", "users/jane/feature"]),
      reason: rand(["manual", "schedule", "ci"]),
      result: isErr ? "failed" : "succeeded",
      totalDurationMin: isErr ? randInt(2, 45) : randInt(5, 120),
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
      event: { outcome: isErr ? "failure" : "success", duration: props.totalDurationMin * 60e9 },
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
      event: { outcome: isErr ? "failure" : "success", duration: props.durationSec * 1e9 },
      message: isErr
        ? `Pipeline ${name}: stage ${props.stageName}/${props.jobName} failed`
        : `Pipeline ${name}: stage ${props.stageName} job ${props.jobName} OK`,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 4e9) },
    message: isErr ? `Pipeline ${name}: ARM update failed` : `Pipeline ${name}: definition updated`,
  };
}
