/**
 * GCP IoT Core log generator.
 */

import {
  type EcsDocument,
  rand,
  randInt,
  randId,
  gcpCloud,
  makeGcpSetup,
  randSeverity,
} from "./helpers.js";

const GRPC_RPC_STATUSES = [
  "INTERNAL",
  "DEADLINE_EXCEEDED",
  "PERMISSION_DENIED",
  "RESOURCE_EXHAUSTED",
  "NOT_FOUND",
  "ALREADY_EXISTS",
  "UNAVAILABLE",
] as const;

type GrpcRpcStatus = (typeof GRPC_RPC_STATUSES)[number];

const GRPC_MESSAGES: Partial<Record<GrpcRpcStatus, string>> = {
  INTERNAL: "Device manager internal error processing request",
  DEADLINE_EXCEEDED: "Config push or MQTT bridge deadline exceeded",
  PERMISSION_DENIED: "Missing cloudiot.devices.sync or MQTT publish ACL",
  RESOURCE_EXHAUSTED: "Per-registry device attach or MQTT rate limit exhausted",
  NOT_FOUND: "Device, registry, or config version not found",
  ALREADY_EXISTS: "Device identifier already provisioned under registry",
  UNAVAILABLE: "MQTT bridge temporarily unavailable — retry Subscribe",
};

function grpcStructuredFault(isErr: boolean): {
  spread: Record<string, unknown>;
  rpcLabel: Record<string, string>;
} {
  if (!isErr) return { spread: {}, rpcLabel: {} };
  const status_code = rand(GRPC_RPC_STATUSES);
  return {
    spread: {
      "gcp.rpc": { status_code },
      error: {
        code: status_code,
        message: GRPC_MESSAGES[status_code] ?? `RPC ${status_code}`,
        type: "gcp",
      },
    },
    rpcLabel: { "gcp.rpc.status_code": status_code },
  };
}

export function generateIotCoreLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const registryPrefix = rand(["sensors", "fleet", "factory", "hvac"] as const);
  const registryName = `reg-${registryPrefix}-${randId(4)}`;
  const deviceId = `dev-${randId(10)}`;
  const protocol = rand(["MQTT", "HTTP"] as const);
  const payloadSizeBytes = isErr ? 0 : randInt(16, 1_048_576);
  const gatewayId = Math.random() < 0.35 ? `gw-${randId(8)}` : "";
  const firmwareVersion = `${randInt(1, 5)}.${randInt(0, 20)}.${randInt(0, 99)}`;

  const SCENARIOS = [
    "devices_create",
    "devices_get",
    "devices_patch",
    "modify_cloud_config",
    "send_command",
    "connection_event",
  ] as const;
  const scenario = rand(SCENARIOS);

  const basePath = `projects/${project.id}/locations/${region}/registries/${registryName}/devices/${deviceId}`;

  let eventType:
    | "CONNECT"
    | "DISCONNECT"
    | "PUBLISH"
    | "SUBSCRIBE"
    | "CONFIG_SEND"
    | "COMMAND_SEND" = rand([
    "CONNECT",
    "DISCONNECT",
    "PUBLISH",
    "SUBSCRIBE",
    "CONFIG_SEND",
    "COMMAND_SEND",
  ]);
  let apiMethod = "";
  let message = "";
  let connectionDurationSeconds = randInt(0, 7200);

  if (scenario === "devices_create") {
    eventType = "CONNECT";
    apiMethod = `cloudiot.googleapis.com/v1/projects/${project.id}/locations/${region}/registries/${registryName}/devices`;
    connectionDurationSeconds = 0;
    message = isErr
      ? `HTTP 403 CreateDevice DENIED registry=${registryName} body={"error":"public_key_conflict"}grpc=${rand(GRPC_RPC_STATUSES)}`
      : `CreateDevice OK deviceId=${deviceId} credentials=x509_cn=*.iot.example`;
  } else if (scenario === "devices_get") {
    apiMethod = `cloudiot.googleapis.com/v1/${basePath}`;
    eventType = "SUBSCRIBE";
    message = isErr
      ? `HTTP 404 mqtt_topic=/devices/${deviceId}/… GetDevice FAILED: NOT_FOUND`
      : `GetDevice blocked=${rand([false, true])} last_config_version=${randInt(0, 400)}`;
  } else if (scenario === "devices_patch") {
    apiMethod = `cloudiot.googleapis.com/v1/${basePath}?updateMask=blocked,credentials`;
    eventType = "DISCONNECT";
    message = isErr
      ? `MQTT CONNACK rc=5 Not authorized on devices/${deviceId}/config — PERMISSION_DENIED`
      : `PatchDevice metadata updated firmware_ack=${firmwareVersion}`;
  } else if (scenario === "modify_cloud_config") {
    apiMethod = `cloudiot.googleapis.com/v1/${basePath}:modifyCloudToDeviceConfig`;
    eventType = "CONFIG_SEND";
    message = isErr
      ? `ModifyCloudToDeviceConfig FAILED binaryData too large — HTTP 413 payload_too_large / gRPC RESOURCE_EXHAUSTED`
      : `Config push version=${randInt(1, 500)} size_bytes=${randInt(64, 8000)} subs_topic=/devices/${deviceId}/config`;
  } else if (scenario === "send_command") {
    apiMethod = `cloudiot.googleapis.com/v1/${basePath}:sendCommandToDevice`;
    eventType = "COMMAND_SEND";
    message = isErr
      ? `SendCommandToDevice FAILED subfolder=cmd — device offline UNAVAILABLE (HTTP 503 bridge)`
      : `Command delivered subfolder=${rand(["reboot", "apply", "ping"])} ack_deadline_s=${randInt(5, 120)}`;
  } else {
    eventType = rand(["CONNECT", "PUBLISH", "DISCONNECT"]);
    apiMethod =
      protocol === "MQTT"
        ? `cloudiot.googleapis.com/v1/${basePath}:mqttSession`
        : `cloudiot.googleapis.com/v1/${basePath}:bindDevice`;
    connectionDurationSeconds =
      eventType === "CONNECT" || eventType === "DISCONNECT"
        ? randInt(0, isErr ? 30 : 86_400)
        : randInt(0, 7200);
    message = isErr
      ? protocol === "MQTT"
        ? `MQTT PUBLISH /devices/${deviceId}/events denied rc=134 topic ACL — ${rand(["CONNACK_REFUSED_IDENT", "PUBACK_NOT_AUTHORIZED"])} grpc=${rand(GRPC_RPC_STATUSES)}`
        : `HTTP POST /v1/${basePath}:publishEvent FAILED 401 Bearer invalid_audience grpc=UNAUTHENTICATED`
      : protocol === "MQTT"
        ? `MQTT ${eventType}: clientId=${deviceId} keepalive=${randInt(20, 300)} qos=${rand([0, 1])}`
        : `HTTP telemetry POST 204 device=${deviceId} content-type=application/octet-stream`;
  }

  const { spread: faultSpread, rpcLabel } = grpcStructuredFault(isErr);
  const severity = randSeverity(isErr);
  const resourcePath = basePath;

  return {
    "@timestamp": ts,
    severity,
    log: { level: severity.toLowerCase() },
    labels: {
      "resource.type": "cloudiot.googleapis.com/Device",
      device_id: deviceId,
      registry_id: registryName,
      api_method: apiMethod,
      iot_scenario: scenario,
      ...rpcLabel,
    },
    cloud: gcpCloud(region, project, "cloudiot.googleapis.com"),
    gcp: {
      iot_core: {
        scenario,
        api_method: apiMethod,
        registry_name: registryName,
        device_id: deviceId,
        event_type: eventType,
        protocol,
        payload_size_bytes: payloadSizeBytes,
        gateway_id: gatewayId || null,
        connection_duration_seconds: connectionDurationSeconds,
        firmware_version: firmwareVersion,
        last_heartbeat: ts,
        resource_path: resourcePath,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(10, isErr ? 30_000 : 5000),
    },
    message,
    ...faultSpread,
  };
}
