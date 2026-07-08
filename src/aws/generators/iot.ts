import {
  rand,
  randInt,
  randFloat,
  randId,
  randIp,
  randUUID,
  randAccount,
  REGIONS,
} from "../../helpers";
import type { EcsDocument } from "./types.js";

function generateIotCoreLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const scenario = rand([
    "device_connectivity",
    "device_provisioning",
    "fleet_indexing",
    "job_execution",
    "shadow_update",
  ] as const);
  const device = rand([
    "sensor-001",
    "gateway-prod-1",
    "thermostat-floor-3",
    "camera-entrance",
    "robot-arm-7",
  ]);
  const eventType =
    scenario === "device_provisioning"
      ? rand(["Provisioning", "RegisterThing", "CreateCertificateFromCsr"])
      : scenario === "fleet_indexing"
        ? rand(["Indexing", "SearchIndex"])
        : scenario === "job_execution"
          ? rand(["JobExecution", "DescribeJob"])
          : scenario === "shadow_update"
            ? rand(["UpdateThingShadow", "GetThingShadow"])
            : rand(["Connect", "Subscribe", "Publish", "Disconnect", "RuleMatch"]);
  const topic = rand([
    "dt/factory/sensors/temperature",
    "dt/home/thermostat/status",
    "cmd/device/update",
    "telemetry/metrics",
    "$aws/things/+/shadow/update",
  ]);
  const protocolRaw = rand(["MQTT", "HTTPS", "WSS"]);
  const protocol = protocolRaw === "WSS" ? "WebSocket" : protocolRaw === "MQTT" ? "MQTT" : "HTTPS";
  const logLevel = isErr ? "ERROR" : rand(["INFO", "INFO", "DEBUG"]);
  const traceId = randUUID().replace(/-/g, "").slice(0, 32);
  const principalId = rand([
    `AROAI${randId(20).toUpperCase()}:session-name`,
    `AIDAI${randId(16).toUpperCase()}`,
    `${acct.id}:thing/${device}`,
  ]);
  const status = isErr ? "Failure" : "Success";
  const topicName = eventType === "Connect" || eventType === "Disconnect" ? "" : topic;
  const logPayload = {
    logLevel,
    traceId,
    accountId: acct.id,
    status,
    eventType,
    protocol,
    clientId: device,
    topicName,
    principalId,
    clientIp: randIp(),
    reason: isErr ? rand(["AUTHORIZATION_FAILURE", "THROTTLE", "CERTIFICATE_REVOKED"]) : undefined,
  };
  const useStructuredLogging = true;
  const message = JSON.stringify(logPayload);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "iotcore" },
    },
    aws: {
      dimensions: { Protocol: protocol },
      iotcore: {
        scenario,
        provisioning_template:
          scenario === "device_provisioning" ? rand(["sensor-fleet", "camera-onboarding"]) : null,
        job_id: scenario === "job_execution" ? `job-${randId(10).toLowerCase()}` : null,
        shadow_name: scenario === "shadow_update" ? rand(["classic", "production", ""]) : null,
        fleet_index_query:
          scenario === "fleet_indexing"
            ? "thingGroupNames:warehouse-* AND connectivity:CONNECTED"
            : null,
        client_id: device,
        thing_name: device,
        thing_group: rand(["factory-sensors", "home-devices", "fleet", "building-management"]),
        action: eventType.toUpperCase(),
        event_type: eventType,
        log_level: logLevel,
        trace_id: traceId,
        account_id: acct.id,
        status,
        principal_id: principalId,
        topic,
        topic_name: topicName,
        protocol,
        qos: rand([0, 1]),
        message_bytes: randInt(20, 65536),
        policy_name: rand(["IoTDevicePolicy", "FleetPolicy", "SensorPolicy"]),
        structured_logging: useStructuredLogging,
        error_code: isErr
          ? rand(["UnauthorizedException", "ThrottlingException", "DeviceDisconnected"])
          : null,
        rules_evaluated: eventType === "RuleMatch" ? randInt(1, 5) : randInt(0, 2),
      },
    },
    source: { ip: randIp() },
    event: {
      action: eventType,
      outcome: isErr ? "failure" : "success",
      category: ["network", "process"],
      type: ["connection"],
      dataset: "aws.iot",
      provider: "iot.amazonaws.com",
      duration: randInt(1, isErr ? 5000 : 200) * 1e6,
    },
    message: message,
    log: { level: isErr ? "error" : logLevel === "DEBUG" ? "debug" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "UnauthorizedException",
              "ThrottlingException",
              "CertificateConflictException",
              "InvalidRequestException",
              "ResourceAlreadyExistsException",
            ]),
            message:
              scenario === "shadow_update"
                ? "MQTT publish rejected: rejected version mismatch on thing shadow"
                : scenario === "job_execution"
                  ? "DescribeJob denied: fleet policy missing iot:DescribeJob"
                  : scenario === "device_provisioning"
                    ? "Fleet provisioning failed: template disallows this claim"
                    : "IoT data plane authorization failure",
            type: "aws",
          },
        }
      : {}),
  };
}

function generateIotGreengrassLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const group = rand(["factory-edge", "home-hub", "retail-kiosk", "vehicle-edge"]);
  const component = rand([
    "com.example.temperature-monitor",
    "com.aws.greengrass.Nucleus",
    "com.example.inference",
    "com.aws.greengrass.StreamManager",
  ]);
  const lifecycleState = isErr
    ? rand(["ERRORED", "BROKEN"])
    : rand(["RUNNING", "RUNNING", "FINISHED"]);
  const deploymentStatus = isErr
    ? rand(["FAILED", "ROLLED_BACK"])
    : rand(["SUCCEEDED", "IN_PROGRESS", "QUEUED"]);
  const eventCategory = rand([
    "component_lifecycle",
    "component_lifecycle",
    "deployment",
    "ipc",
    "lambda_invoke",
  ]);
  const deploymentId = randId(36).toLowerCase();
  const ipcOp = rand([
    "SubscribeToTopic",
    "PublishToIoTCore",
    "InvokeComponent",
    "DeferComponentUpdate",
  ]);
  const lambdaName = rand(["ShadowUpdater", "StreamProcessor", "RulesEngineBridge"]);
  const MSGS = {
    error: [
      "Component failed to start: missing dependency",
      "Deployment rollback initiated",
      "Kernel connection lost",
      "OOM: component process killed",
    ],
    warn: [
      "Component health check failed, retrying",
      "Certificate expiring in 7 days",
      "Disk space below 10%",
    ],
    info: [
      "Component started successfully",
      "Deployment completed",
      "Health check passed",
      "Nucleus updated to 2.12.0",
    ],
  };
  const level = isErr ? "error" : Math.random() < 0.1 ? "warn" : "info";
  const structured = {
    eventCategory,
    coreDevice: group,
    componentName: component,
    componentVersion: `${randInt(1, 3)}.${randInt(0, 10)}.${randInt(0, 10)}`,
    lifecycleState,
    deploymentId,
    deploymentStatus,
    ...(eventCategory === "ipc"
      ? {
          ipcOperation: ipcOp,
          ipcNamespace: rand(["aws.greengrass.ipc.pubsub", "aws.greengrass.ipc.mqttproxy"]),
          topic: rand(["hello/world", "dt/telemetry", "cmd/control"]),
        }
      : {}),
    ...(eventCategory === "lambda_invoke"
      ? {
          lambdaArn: `arn:aws:lambda:${region}:${acct.id}:function:${lambdaName}`,
          invocationPhase: rand(["START", "END"]),
          durationMs: randInt(5, isErr ? 30000 : 3000),
        }
      : {}),
    timestamp: new Date(ts).toISOString(),
  };
  const message = JSON.stringify(structured);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "greengrass" },
    },
    aws: {
      dimensions: { CoreDeviceName: group },
      greengrass: {
        core_device_name: group,
        component_name: component,
        component_version: `${randInt(1, 3)}.${randInt(0, 10)}.${randInt(0, 10)}`,
        nucleus_version: "2.12.0",
        platform: rand(["linux/amd64", "linux/arm64", "linux/armv7l"]),
        deployment_id: deploymentId,
        deployment_status: deploymentStatus,
        component_lifecycle_state: lifecycleState,
        event_category: eventCategory,
        ipc_operation: eventCategory === "ipc" ? ipcOp : null,
        lambda_function_name: eventCategory === "lambda_invoke" ? lambdaName : null,
        status: isErr ? "FAILED" : "COMPLETED",
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process", "host"],
      type: ["info"],
      dataset: "aws.greengrass",
      provider: "greengrass.amazonaws.com",
      duration: randInt(5, isErr ? 600 : 120) * 1e9,
    },
    message,
    log: { level },
    ...(level === "error"
      ? { error: { code: "GreengrassError", message: rand(MSGS.error), type: "aws" } }
      : {}),
  };
}

function generateIotAnalyticsLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const channel = rand(["temperature-channel", "gps-channel", "metrics-channel", "alerts-channel"]);
  const pipeline = rand([
    "enrichment-pipeline",
    "filter-pipeline",
    "math-pipeline",
    "device-registry-enrich",
  ]);
  const msgs = randInt(100, isErr ? 0 : 100000);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "iotanalytics" },
    },
    aws: {
      dimensions: { ChannelName: channel, PipelineName: pipeline },
      iotanalytics: {
        channel_name: channel,
        pipeline_name: pipeline,
        dataset_name: rand(["daily-aggregates", "anomaly-detection-output", "fleet-summary"]),
        messages_processed: msgs,
        bytes_processed: msgs * randInt(50, 500),
        activity_name: rand(["lambda-enrich", "filter", "math", "selectAttributes"]),
        pipeline_status: isErr ? "REPROCESSING_FAILED" : "SUCCEEDED",
        error_message: isErr
          ? rand(["Pipeline activity failed", "Lambda timeout", "Query error"])
          : null,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      type: ["info"],
      dataset: "aws.iotanalytics",
      provider: "iotanalytics.amazonaws.com",
      duration: randInt(500, isErr ? 120000 : 30000) * 1e6,
    },
    message: JSON.stringify({
      channelName: channel,
      pipelineName: pipeline,
      datasetName: rand(["daily-aggregates", "anomaly-detection-output", "fleet-summary"]),
      activityName: rand(["lambda-enrich", "filter", "math", "selectAttributes"]),
      pipelineActivityStatus: isErr ? "FAILED" : "SUCCEEDED",
      messagesProcessed: msgs,
      bytesProcessed: msgs * randInt(50, 500),
      errorMessage: isErr
        ? rand(["Pipeline activity failed", "Lambda timeout", "Query error"])
        : null,
      timestamp: new Date(ts).toISOString(),
    }),
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? { error: { code: "PipelineError", message: "IoT Analytics pipeline failed", type: "aws" } }
      : {}),
  };
}

function generateIotDefenderLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const thingName = rand([
    "sensor-001",
    "gateway-prod",
    "controller-a4",
    "camera-lobby",
    "valve-plant-2",
  ]);
  const auditFinding = rand([
    "DEVICE_CERTIFICATE_EXPIRING",
    "REVOKED_CA_CERTIFICATE",
    "IOT_POLICY_OVERLY_PERMISSIVE",
    "UNAUTHENTICATED_COGNITO_ROLE_OVERLY_PERMISSIVE",
    "AUTHENTICATION_FAILURES",
    "LOGGING_DISABLED",
  ]);
  const severity = rand(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);
  const violationType = rand([
    "large-msg-size",
    "blanket-request",
    "authorization-failure",
    "device-cert-expiring",
    "cell-data-transfer",
  ]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "iotdefender" },
    },
    aws: {
      dimensions: { CheckName: auditFinding },
      iotdefender: {
        thing_name: thingName,
        audit_check_name: auditFinding,
        finding_id: randId(36).toLowerCase(),
        severity,
        violation_id: randId(36).toLowerCase(),
        violation_type: violationType,
        security_profile_name: rand([
          "baseline-security-profile",
          "factory-floor-profile",
          "critical-devices",
        ]),
        behavior_name: rand(["authorized-ip-range", "msg-size", "data-bytes-out"]),
        current_value: randInt(1, 1000),
        threshold_value: randInt(1, 100),
        consecutive_datapoints_to_alarm: randInt(2, 5),
        error_code: isErr
          ? rand(["ResourceNotFoundException", "ThrottlingException", "InternalFailureException"])
          : null,
      },
    },
    event: {
      kind: "alert",
      outcome: isErr ? "failure" : "success",
      category: ["intrusion_detection", "vulnerability"],
      type: ["info"],
      dataset: "aws.iotdefender",
      provider: "iot.amazonaws.com",
      duration: randInt(30, isErr ? 600 : 300) * 1e9,
    },
    message: JSON.stringify({
      thingName,
      securityProfileName: rand([
        "baseline-security-profile",
        "factory-floor-profile",
        "critical-devices",
      ]),
      behaviorName: rand(["authorized-ip-range", "msg-size", "data-bytes-out"]),
      violationType,
      severity,
      auditCheckName: auditFinding,
      findingId: randId(36).toLowerCase(),
      violationId: randId(36).toLowerCase(),
      metricValue: { count: randInt(1, 1000) },
      metricThreshold: { count: randInt(1, 100) },
      consecutiveDatapointsToAlarm: randInt(2, 5),
      status: isErr ? "ERROR" : "VIOLATION_DETECTED",
      errorCode: isErr
        ? rand(["ResourceNotFoundException", "ThrottlingException", "InternalFailureException"])
        : null,
      timestamp: new Date(ts).toISOString(),
    }),
    log: { level: isErr ? "error" : ["CRITICAL", "HIGH"].includes(severity) ? "warn" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "ResourceNotFoundException",
              "ThrottlingException",
              "InternalFailureException",
            ]),
            message: "IoT Defender audit error",
            type: "aws",
          },
        }
      : {}),
  };
}

function generateIotEventsLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const model = rand([
    "temperature-alert-model",
    "motor-health-detector",
    "pressure-monitor",
    "door-sensor-model",
    "conveyor-fault",
  ]);
  const detector = rand(["unit-01", "unit-02", "zone-A", "zone-B", "machine-prod-1"]);
  const event = rand([
    "StateTransition",
    "AlarmActivated",
    "AlarmAcknowledged",
    "AlarmReset",
    "ActionExecuted",
    "TriggerFired",
  ]);
  const fromState = rand(["Normal", "Warning", "Alarm", "Acknowledged"]);
  const toState = isErr ? rand(["Error", "Alarm"]) : rand(["Normal", "Warning", "Alarm"]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "iotevents" },
    },
    aws: {
      dimensions: { DetectorModelName: model, KeyValue: detector },
      iotevents: {
        detector_model_name: model,
        detector_id: detector,
        key_value: detector,
        event_name: event,
        from_state: fromState,
        to_state: toState,
        input_name: rand(["SensorInput", "CommandInput", "HealthCheck"]),
        action_type: rand(["SetVariable", "SetTimer", "SNS", "Lambda", "SQS"]),
        timer_name: rand([null, "idleTimer", "alarmTimer"]),
        condition_expression: rand([
          null,
          "$input.SensorInput.temperature > 85",
          "$input.data.value < threshold",
        ]),
        error_code: isErr
          ? rand(["ResourceNotFound", "ThrottlingException", "InvalidRequestException"])
          : null,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      type: ["info"],
      dataset: "aws.iotevents",
      provider: "iotevents.amazonaws.com",
      duration: randInt(1, isErr ? 5000 : 500) * 1e6,
    },
    message: JSON.stringify({
      detectorModelName: model,
      detectorName: detector,
      keyValue: detector,
      eventName: event,
      fromStateName: fromState,
      toStateName: toState,
      inputName: rand(["SensorInput", "CommandInput", "HealthCheck"]),
      actionType: rand(["SetVariable", "SetTimer", "SNS", "Lambda", "SQS"]),
      status: isErr ? "ERROR" : "SUCCESS",
      errorCode: isErr
        ? rand(["ResourceNotFound", "ThrottlingException", "InvalidRequestException"])
        : null,
      timestamp: new Date(ts).toISOString(),
    }),
    log: { level: isErr ? "error" : toState === "Alarm" ? "warn" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand(["ResourceNotFound", "ThrottlingException", "InvalidRequestException"]),
            message: "IoT Events error",
            type: "aws",
          },
        }
      : {}),
  };
}

function generateIotSiteWiseLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const assetId = randId(36).toLowerCase();
  const asset = rand([
    "conveyor-belt-1",
    "hvac-unit-prod",
    "pump-station-2",
    "solar-array-roof",
    "turbine-gen-3",
  ]);
  const property = rand([
    "Temperature",
    "Pressure",
    "RPM",
    "PowerOutput",
    "FlowRate",
    "Vibration",
    "OEE",
    "MTBF",
  ]);
  const quality = isErr ? rand(["BAD", "UNCERTAIN"]) : rand(["GOOD", "GOOD", "GOOD"]);
  const value = Number(randFloat(isErr ? -999 : 0, isErr ? 9999 : 500));
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "iotsitewise" },
    },
    aws: {
      dimensions: { AssetId: assetId, PropertyId: randId(36).toLowerCase() },
      iotsitewise: {
        asset_id: assetId,
        asset_name: asset,
        asset_model_id: randId(36).toLowerCase(),
        property_alias: `/company/plant/${asset}/${property.toLowerCase()}`,
        property_name: property,
        data_type: rand(["DOUBLE", "INTEGER", "BOOLEAN", "STRING"]),
        value,
        quality,
        timestamp_offset_ms: randInt(0, 1000),
        gateway_id: rand([`gateway-${randId(8).toLowerCase()}`, null]),
        portal_id: randId(36).toLowerCase(),
        error: isErr
          ? rand(["BatchPutAssetPropertyValue failed", "Property not found", "Quota exceeded"])
          : null,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process", "host"],
      type: ["info"],
      dataset: "aws.iotsitewise",
      provider: "iotsitewise.amazonaws.com",
      duration: randInt(1, isErr ? 2000 : 200) * 1e6,
    },
    message: JSON.stringify({
      assetId,
      assetName: asset,
      propertyId: randId(36).toLowerCase(),
      propertyName: property,
      propertyAlias: `/company/plant/${asset}/${property.toLowerCase()}`,
      entry: {
        assetId,
        propertyId: randId(36).toLowerCase(),
        propertyValues: [
          {
            value: { doubleValue: value },
            timestamp: {
              timeInSeconds: Math.floor(new Date(ts).getTime() / 1000),
              offsetInNanos: randInt(0, 999999999),
            },
            quality,
          },
        ],
      },
      gatewayId: rand([`gateway-${randId(8).toLowerCase()}`, null]),
      status: isErr ? "FAILURE" : "SUCCESS",
      errorMessage: isErr
        ? rand(["BatchPutAssetPropertyValue failed", "Property not found", "Quota exceeded"])
        : null,
    }),
    log: { level: isErr ? "error" : quality === "UNCERTAIN" ? "warn" : "info" },
    ...(isErr
      ? { error: { code: "SiteWiseError", message: "IoT SiteWise quality/error", type: "aws" } }
      : {}),
  };
}

function generateIotTwinMakerLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const workspaceId = rand([
    "factory-floor-ws",
    "smart-building-ws",
    "wind-farm-ws",
    "oil-refinery-ws",
    "data-center-ws",
  ]);
  const entityId = `entity-${randId(8).toLowerCase()}`;
  const entityName = rand([
    "ConveyorBelt-01",
    "HVAC-Unit-07",
    "WindTurbine-12",
    "PumpStation-03",
    "ServerRack-B4",
  ]);
  const componentType = rand([
    "com.example.temperature",
    "com.example.pressure",
    "com.example.vibration",
    "com.example.flow",
    "com.example.power",
  ]);
  const propertyName = rand([
    "Temperature",
    "Pressure",
    "Vibration",
    "FlowRate",
    "PowerConsumption",
    "OperationalStatus",
  ]);
  const propertyValue = isErr ? null : Number(randFloat(0, 1000));
  const action = rand([
    "CreateWorkspace",
    "CreateEntity",
    "UpdateEntity",
    "GetPropertyValue",
    "BatchPutPropertyValues",
    "ExecuteQuery",
    "CreateScene",
  ]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "iottwinmaker" },
    },
    aws: {
      dimensions: { WorkspaceId: workspaceId },
      iottwinmaker: {
        workspace_id: workspaceId,
        entity_id: entityId,
        entity_name: entityName,
        component_type_id: componentType,
        property_name: propertyName,
        property_value: propertyValue,
        scene_id: `scene-${randId(8).toLowerCase()}`,
        sync_source: rand(["SITEWISE", "IOT_DEVICE_DATA", "CUSTOM"]),
        update_reason: rand([
          "ASSET_CREATED",
          "ASSET_UPDATED",
          "VALUE_CHANGED",
          "CONNECTIVITY_CHANGE",
        ]),
      },
    },
    event: {
      action,
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      type: ["info"],
      dataset: "aws.iottwinmaker",
      provider: "iottwinmaker.amazonaws.com",
    },
    message: JSON.stringify({
      eventType: action,
      workspaceId,
      entityId,
      entityName,
      componentTypeId: componentType,
      propertyName,
      propertyValue: propertyValue !== null ? { doubleValue: propertyValue } : null,
      syncSource: rand(["SITEWISE", "IOT_DEVICE_DATA", "CUSTOM"]),
      updateReason: rand([
        "ASSET_CREATED",
        "ASSET_UPDATED",
        "VALUE_CHANGED",
        "CONNECTIVITY_CHANGE",
      ]),
      status: isErr ? "FAILED" : "SUCCESS",
      timestamp: new Date(ts).toISOString(),
    }),
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "ResourceNotFoundException",
              "ValidationException",
              "TooManyTagsException",
            ]),
            message: "IoT TwinMaker operation failed",
            type: "aws",
          },
        }
      : {}),
  };
}

function generateIotFleetWiseLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const fleetId = rand([
    "commercial-trucks",
    "delivery-vans",
    "field-service",
    "executive-fleet",
    "test-vehicles",
  ]);
  const vehicleId = `VIN-${randId(17).toUpperCase()}`;
  const campaignName = rand([
    "engine-diagnostics",
    "battery-monitoring",
    "safety-systems",
    "fuel-efficiency",
    "predictive-maintenance",
  ]);
  const campaignStatus = isErr
    ? "SUSPENDED"
    : rand(["RUNNING", "CREATING", "WAITING_FOR_APPROVAL"]);
  const signalName = rand([
    "Vehicle.Chassis.Axle.Row1.Wheel.Left.Tire.Pressure",
    "Vehicle.Powertrain.TractionBattery.StateOfCharge",
    "Vehicle.OBD.EngineLoad",
    "Vehicle.Speed",
    "Vehicle.CurrentLocation.Latitude",
  ]);
  const signalValue = isErr ? null : Number(randFloat(0, 100));
  const action = rand([
    "CreateCampaign",
    "UpdateCampaign",
    "CreateVehicle",
    "UpdateVehicle",
    "CreateFleet",
    "AssociateVehicleFleet",
    "CreateSignalCatalog",
  ]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "iotfleetwise" },
    },
    aws: {
      dimensions: { FleetId: fleetId, CampaignName: campaignName },
      iotfleetwise: {
        fleet_id: fleetId,
        vehicle_id: vehicleId,
        campaign_name: campaignName,
        campaign_status: campaignStatus,
        signal_name: signalName,
        signal_value: signalValue,
        collection_scheme: rand(["TIME_BASED", "CONDITION_BASED", "EVENT_BASED"]),
        compression: rand(["OFF", "SNAPPY"]),
        data_destination: rand(["S3", "TIMESTREAM", "IOT_SITERISE"]),
      },
    },
    event: {
      action,
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      type: ["info"],
      dataset: "aws.iotfleetwise",
      provider: "iotfleetwise.amazonaws.com",
    },
    message: JSON.stringify({
      eventType: action,
      fleetId,
      vehicleId,
      campaignName,
      campaignArn: `arn:aws:iotfleetwise:${region}:${acct.id}:campaign/${campaignName}`,
      campaignStatus,
      signalName,
      signalValue: signalValue !== null ? { doubleValue: signalValue } : null,
      collectionScheme: rand(["TIME_BASED", "CONDITION_BASED", "EVENT_BASED"]),
      dataDestination: rand(["S3", "TIMESTREAM", "IOT_SITERISE"]),
      vehicleState: isErr ? "SUSPENDED" : "ACTIVE",
      timestamp: new Date(ts).toISOString(),
    }),
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "ResourceNotFoundException",
              "InvalidSignalsException",
              "ThrottlingException",
            ]),
            message: "IoT FleetWise operation failed",
            type: "aws",
          },
        }
      : {}),
  };
}

function generateGroundStationLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const contactId = `contact-${randId(10).toLowerCase()}`;
  const groundStationId = rand(["Dubbo", "Punta Arenas", "AWS_GROUND_STATION_US_EAST_1"]);
  const satelliteArn = `arn:aws:groundstation::${acct.id}:satellite/satellite-${randId(8).toLowerCase()}`;
  const missionProfileId = `profile-${randId(8).toLowerCase()}`;
  const contactStatus = isErr ? "FAILED" : rand(["COMPLETED", "SCHEDULED", "COMPLETED"]);
  const dataReceivedMb = isErr ? 0 : Number(randFloat(10, 5000));
  const elevationDegrees = Number(randFloat(5, 90));
  const contactDurationSec = isErr ? randInt(5, 60) : randInt(300, 1800);
  const errorCode = rand(["ContactFailed", "AntennaDepointing"]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "groundstation" },
    },
    aws: {
      dimensions: { GroundStationId: groundStationId, ContactId: contactId },
      groundstation: {
        contact_id: contactId,
        ground_station_id: groundStationId,
        satellite_arn: satelliteArn,
        mission_profile_id: missionProfileId,
        contact_status: contactStatus,
        error_code: isErr ? errorCode : null,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["network"],
      type: ["connection"],
      dataset: "aws.groundstation",
      provider: "groundstation.amazonaws.com",
      duration: contactDurationSec * 1e9,
    },
    data_stream: { type: "logs", dataset: "aws.groundstation", namespace: "default" },
    message: JSON.stringify({
      contactId,
      groundStationId,
      satelliteArn,
      missionProfileArn: `arn:aws:groundstation:${region}:${acct.id}:mission-profile/${missionProfileId}`,
      contactStatus,
      startTime: new Date(new Date(ts).getTime() - contactDurationSec * 1000).toISOString(),
      endTime: new Date(ts).toISOString(),
      elevation: { startDegrees: elevationDegrees - 5, endDegrees: elevationDegrees },
      dataReceivedMb,
      contactDurationSeconds: contactDurationSec,
      errorCode: isErr ? errorCode : null,
    }),
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: errorCode,
            message: `Ground Station contact failed at ${groundStationId}`,
            type: "aws",
          },
        }
      : {}),
  };
}

// ─── Kinesis Video Streams ────────────────────────────────────────────────
function generateKinesisVideoLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const streams = [
    "lobby-cam-01",
    "warehouse-feed",
    "doorbell-pro",
    "drone-feed",
    "traffic-monitor",
  ];
  const stream = rand(streams);
  const events = [
    "PutMedia",
    "GetMedia",
    "GetMediaForFragmentList",
    "GetClip",
    "GetDASHStreamingSessionURL",
    "GetHLSStreamingSessionURL",
  ];
  const ev = rand(events);
  const errMsgs = [
    "ConnectionLimitExceededException",
    "NotAuthorizedException",
    "ResourceNotFoundException",
    "ClientLimitExceededException",
  ];
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "kinesis-video" },
    },
    aws: {
      kinesis_video: {
        stream_name: stream,
        stream_arn: `arn:aws:kinesisvideo:${region}:${acct.id}:stream/${stream}`,
        event_type: ev,
        fragment_number: randId(20),
        producer_timestamp_ms: Date.now(),
        server_timestamp_ms: Date.now() + randInt(0, 500),
        ingestion_rate_mbps: randFloat(0.5, 10),
        fragment_duration_ms: randInt(2000, 6000),
        resolution: rand(["1920x1080", "1280x720", "3840x2160", "640x480"]),
        codec: rand(["H.264", "H.265"]),
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e4, 6e6) },
    message: JSON.stringify({
      streamName: stream,
      streamArn: `arn:aws:kinesisvideo:${region}:${acct.id}:stream/${stream}`,
      eventType: ev,
      fragmentNumber: randId(20),
      producerTimestamp: Date.now(),
      serverTimestamp: Date.now() + randInt(0, 500),
      fragmentDurationMs: randInt(2000, 6000),
      ingestionRateMbps: randFloat(0.5, 10),
      codec: rand(["H.264", "H.265"]),
      resolution: rand(["1920x1080", "1280x720", "3840x2160", "640x480"]),
      status: isErr ? "FAILED" : "SUCCESS",
      errorCode: isErr ? rand(errMsgs) : null,
    }),
    ...(isErr
      ? {
          error: {
            code: rand(errMsgs),
            message: `Amazon Kinesis Video Streams ${ev} refused connection or quota exceeded`,
            type: "aws",
          },
        }
      : {}),
  };
}

export {
  generateIotCoreLog,
  generateIotGreengrassLog,
  generateIotAnalyticsLog,
  generateIotDefenderLog,
  generateIotEventsLog,
  generateIotSiteWiseLog,
  generateIotTwinMakerLog,
  generateIotFleetWiseLog,
  generateGroundStationLog,
  generateKinesisVideoLog,
};
