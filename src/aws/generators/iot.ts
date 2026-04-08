import { rand, randInt, randFloat, randId, randIp, randAccount, REGIONS } from "../../helpers";
import type { EcsDocument } from "./types.js";

function generateIotCoreLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const device = rand([
    "sensor-001",
    "gateway-prod-1",
    "thermostat-floor-3",
    "camera-entrance",
    "robot-arm-7",
  ]);
  const action = rand(["CONNECT", "DISCONNECT", "PUBLISH", "SUBSCRIBE", "RECEIVE", "REJECT"]);
  const topic = rand([
    "dt/factory/sensors/temperature",
    "dt/home/thermostat/status",
    "cmd/device/update",
    "telemetry/metrics",
  ]);
  const plainMessage = isErr
    ? `IoT Core ${action} FAILED for ${device}: ${rand(["Unauthorized", "Certificate revoked", "Rate limited"])}`
    : `IoT Core ${action}: ${device} on ${topic}`;
  const useStructuredLogging = Math.random() < 0.55;
  const message = useStructuredLogging
    ? JSON.stringify({
        clientId: device,
        action,
        topic,
        message: plainMessage,
        timestamp: new Date(ts).toISOString(),
      })
    : plainMessage;
  const protocol = rand(["MQTT", "HTTPS", "WSS", "MQTT-SN"]);
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
        client_id: device,
        thing_name: device,
        thing_group: rand(["factory-sensors", "home-devices", "fleet", "building-management"]),
        action,
        topic,
        protocol,
        qos: rand([0, 1]),
        message_bytes: randInt(20, 65536),
        policy_name: rand(["IoTDevicePolicy", "FleetPolicy", "SensorPolicy"]),
        structured_logging: useStructuredLogging,
        error_code: isErr
          ? rand(["UnauthorizedException", "ThrottlingException", "DeviceDisconnected"])
          : null,
        rules_evaluated: randInt(0, 5),
        metrics: {
          "Connect.Success": { sum: randInt(1, 1000) },
          "Connect.Failure": { sum: isErr ? randInt(1, 100) : 0 },
          "PublishIn.Success": { sum: randInt(1, 10000) },
          "PublishIn.ClientError": { sum: isErr ? randInt(1, 500) : 0 },
          "PublishIn.ServerError": { sum: isErr ? randInt(1, 100) : 0 },
          "PublishOut.Success": { sum: randInt(1, 10000) },
          "Publish.Success": { sum: randInt(1, 10000) },
          "Publish.Failure": { sum: isErr ? randInt(1, 1000) : 0 },
          "Subscribe.Success": { sum: randInt(1, 5000) },
          "Subscribe.Failure": { sum: isErr ? randInt(1, 100) : 0 },
          "Unsubscribe.Success": { sum: randInt(1, 1000) },
          "Ping.Success": { sum: randInt(1, 10000) },
          "Throttle.Success": { sum: randInt(0, 200) },
          RulesMatched: { sum: randInt(0, 1000) },
          RulesFailed: { sum: isErr ? randInt(1, 100) : 0 },
          RulesNotMatched: { sum: randInt(0, 100) },
          TopicMatch: { sum: randInt(1, 10000) },
          ClientConnections: { avg: randInt(1, 100000) },
        },
      },
    },
    source: { ip: randIp() },
    event: {
      action,
      outcome: isErr ? "failure" : "success",
      category: ["network", "process"],
      dataset: "aws.iot",
      provider: "iot.amazonaws.com",
      duration: randInt(1, isErr ? 5000 : 200) * 1e6,
    },
    message: message,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand(["UnauthorizedException", "ThrottlingException", "DeviceDisconnected"]),
            message: "IoT Core operation failed",
            type: "iot",
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
        deployment_id: randId(36).toLowerCase(),
        status: isErr ? "FAILED" : "COMPLETED",
        metrics: {
          ComponentDeployedCount: { sum: randInt(0, 50) },
          ComponentBrokenCount: { sum: isErr ? randInt(1, 10) : 0 },
          StreamManagerMemoryUsage: { avg: Number(randFloat(10, 512)) },
          StreamManagerBytesAppended: { sum: randInt(0, 10485760) },
          NucleusRestartCount: { sum: isErr ? randInt(1, 5) : 0 },
          DeploymentQueueSize: { avg: Number(randFloat(0, 20)) },
        },
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process", "host"],
      dataset: "aws.greengrass",
      provider: "greengrass.amazonaws.com",
      duration: randInt(5, isErr ? 600 : 120) * 1e9,
    },
    message: rand(MSGS[level]),
    log: { level },
    ...(level === "error"
      ? { error: { code: "GreengrassError", message: rand(MSGS.error), type: "iot" } }
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
      dataset: "aws.iotanalytics",
      provider: "iotanalytics.amazonaws.com",
      duration: randInt(500, isErr ? 120000 : 30000) * 1e6,
    },
    message: isErr
      ? `IoT Analytics FAILED in ${pipeline}: ${rand(["Activity error", "Lambda timeout"])}`
      : `IoT Analytics: ${msgs.toLocaleString()} messages via ${pipeline}`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? { error: { code: "PipelineError", message: "IoT Analytics pipeline failed", type: "iot" } }
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
      dataset: "aws.iotdefender",
      provider: "iot.amazonaws.com",
      duration: randInt(30, isErr ? 600 : 300) * 1e9,
    },
    message: isErr
      ? `IoT Defender audit ERROR [${thingName}]: ${rand(["Internal failure", "Resource not found"])}`
      : `IoT Defender ${severity} [${thingName}]: ${auditFinding}`,
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
            type: "iot",
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
      dataset: "aws.iotevents",
      provider: "iotevents.amazonaws.com",
      duration: randInt(1, isErr ? 5000 : 500) * 1e6,
    },
    message: isErr
      ? `IoT Events ${model}/${detector} ERROR: ${rand(["State machine error", "Action failed", "Input validation error"])}`
      : `IoT Events ${model}/${detector}: ${fromState} \u2192 ${toState} [${event}]`,
    log: { level: isErr ? "error" : toState === "Alarm" ? "warn" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand(["ResourceNotFound", "ThrottlingException", "InvalidRequestException"]),
            message: "IoT Events error",
            type: "iot",
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
        metrics: {
          GatewayDataStreamPartitionCount: { avg: Number(randFloat(1, 64)) },
          AssetPropertyValueCount: { sum: randInt(1, 100000) },
        },
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process", "host"],
      dataset: "aws.iotsitewise",
      provider: "iotsitewise.amazonaws.com",
      duration: randInt(1, isErr ? 2000 : 200) * 1e6,
    },
    message: isErr
      ? `IoT SiteWise ${asset}/${property} BAD quality: ${rand(["Sensor offline", "Out of range", "Connection lost"])}`
      : `IoT SiteWise ${asset}/${property}: ${value} [${quality}]`,
    log: { level: isErr ? "error" : quality === "UNCERTAIN" ? "warn" : "info" },
    ...(isErr
      ? { error: { code: "SiteWiseError", message: "IoT SiteWise quality/error", type: "iot" } }
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
      category: ["iot", "process"],
      dataset: "aws.iottwinmaker",
      provider: "iottwinmaker.amazonaws.com",
    },
    message: isErr
      ? `IoT TwinMaker ${action} FAILED [${workspaceId}/${entityName}]: ${rand(["Entity not found", "Workspace limit exceeded", "Property sync failed"])}`
      : `IoT TwinMaker ${action}: workspace=${workspaceId}, entity=${entityName}, ${propertyName}=${propertyValue}`,
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
            type: "iot",
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
      category: ["iot", "process"],
      dataset: "aws.iotfleetwise",
      provider: "iotfleetwise.amazonaws.com",
    },
    message: isErr
      ? `IoT FleetWise ${action} FAILED [${fleetId}/${vehicleId}]: ${rand(["Vehicle not found", "Campaign suspended", "Signal not in catalog", "Data collection paused"])}`
      : `IoT FleetWise ${action}: fleet=${fleetId}, vehicle=${vehicleId}, campaign=${campaignName} ${campaignStatus}`,
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
            type: "iot",
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
        metrics: {
          data_received_mb: dataReceivedMb,
          elevation_degrees: elevationDegrees,
          contact_duration_sec: contactDurationSec,
        },
        error_code: isErr ? errorCode : null,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["network"],
      dataset: "aws.groundstation",
      provider: "groundstation.amazonaws.com",
      duration: contactDurationSec * 1e9,
    },
    data_stream: { type: "logs", dataset: "aws.groundstation", namespace: "default" },
    message: isErr
      ? `Ground Station ${groundStationId}: ${errorCode} for contact ${contactId}`
      : `Ground Station ${groundStationId}: contact ${contactId} ${contactStatus}, received=${dataReceivedMb.toFixed(1)}MB, elevation=${elevationDegrees.toFixed(1)}°`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: errorCode,
            message: `Ground Station contact failed at ${groundStationId}`,
            type: "network",
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
    message: isErr
      ? `Kinesis Video ${stream}: ${ev} failed — ${rand(errMsgs)}`
      : `Kinesis Video ${stream}: ${ev} (${randFloat(0.5, 10).toFixed(1)} Mbps)`,
  };
}

// ─── AWS Panorama ─────────────────────────────────────────────────────────
function generatePanoramaLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const devices = ["panorama-appliance-01", "factory-edge-01", "retail-cam-hub"];
  const device = rand(devices);
  const events = [
    "DeployApplication",
    "RemoveApplication",
    "DescribeDevice",
    "CreateNodeFromTemplateJob",
    "ListApplicationInstances",
  ];
  const ev = rand(events);
  const models = ["people-counter", "defect-detector", "ppe-compliance", "vehicle-tracker"];
  const statuses = isErr ? ["DEPLOYMENT_FAILED", "ERROR"] : ["DEPLOYMENT_SUCCEEDED", "RUNNING"];
  const errMsgs = [
    "Model compilation failed",
    "Camera stream unreachable",
    "GPU memory exceeded",
    "Application container crash loop",
  ];
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "panorama" },
    },
    aws: {
      panorama: {
        device_id: `device-${randId(12).toLowerCase()}`,
        device_name: device,
        event_type: ev,
        application_name: rand(models),
        status: rand(statuses),
        inference_fps: randFloat(1, isErr ? 0 : 30),
        camera_streams: randInt(1, 8),
        gpu_utilization_pct: randFloat(10, isErr ? 100 : 85),
        uptime_hours: randFloat(0, 720),
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e5, 6e8) },
    message: isErr
      ? `Panorama ${device}: ${ev} failed — ${rand(errMsgs)}`
      : `Panorama ${device}: ${ev} (${rand(models)}, ${randFloat(10, 30).toFixed(1)} FPS)`,
  };
}

// ─── FreeRTOS ─────────────────────────────────────────────────────────────
function generateFreeRtosLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const things = [
    "sensor-node-01",
    "actuator-03",
    "gateway-edge",
    "wearable-device",
    "industrial-plc",
  ];
  const thing = rand(things);
  const events = [
    "OTA_UPDATE",
    "MQTT_CONNECT",
    "MQTT_DISCONNECT",
    "SHADOW_UPDATE",
    "DEFENDER_REPORT",
    "FLEET_PROVISIONING",
  ];
  const ev = rand(events);
  const boards = ["ESP32", "STM32L4", "NXP-LPC55S69", "Infineon-PSoC6", "Renesas-RX65N"];
  const errMsgs = [
    "OTA firmware validation failed",
    "TLS handshake timeout",
    "MQTT keepalive expired",
    "Flash write error",
    "Certificate rotation failed",
  ];
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "freertos" },
    },
    aws: {
      freertos: {
        thing_name: thing,
        event_type: ev,
        board: rand(boards),
        firmware_version: `${randInt(1, 5)}.${randInt(0, 9)}.${randInt(0, 20)}`,
        heap_free_bytes: randInt(1024, isErr ? 512 : 65536),
        stack_high_water_mark: randInt(128, 4096),
        uptime_seconds: randInt(0, 86400 * 30),
        mqtt_messages_sent: randInt(0, 10000),
        mqtt_messages_received: randInt(0, 5000),
        ota_status: ev === "OTA_UPDATE" ? (isErr ? "FAILED" : "SUCCEEDED") : null,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e3, 3e6) },
    message: isErr
      ? `FreeRTOS ${thing}: ${ev} failed — ${rand(errMsgs)}`
      : `FreeRTOS ${thing}: ${ev} OK (${rand(boards)})`,
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
  generatePanoramaLog,
  generateFreeRtosLog,
};
