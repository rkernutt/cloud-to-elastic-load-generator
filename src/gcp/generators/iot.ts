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

export function generateIotCoreLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const registryPrefix = rand(["sensors", "fleet", "factory", "hvac"] as const);
  const registryName = `reg-${registryPrefix}-${randId(4)}`;
  const deviceId = `dev-${randId(10)}`;
  const eventType = rand([
    "CONNECT",
    "DISCONNECT",
    "PUBLISH",
    "SUBSCRIBE",
    "CONFIG_SEND",
    "COMMAND_SEND",
  ] as const);
  const protocol = rand(["MQTT", "HTTP"] as const);
  const payloadSizeBytes = isErr ? 0 : randInt(16, 1_048_576);
  const gatewayId = Math.random() < 0.35 ? `gw-${randId(8)}` : "";
  const connectionDurationSeconds =
    eventType === "CONNECT" || eventType === "DISCONNECT"
      ? randInt(0, isErr ? 30 : 86_400)
      : randInt(0, 7200);
  const firmwareVersion = `${randInt(1, 5)}.${randInt(0, 20)}.${randInt(0, 99)}`;
  const severity = randSeverity(isErr);
  const resourcePath = `projects/${project.id}/locations/${region}/registries/${registryName}/devices/${deviceId}`;
  const message = isErr
    ? `cloudiot.googleapis.com: ${eventType} FAILED device=${deviceId} registry=${registryName} protocol=${protocol}: ${rand(["MQTT CONNACK 5 Not authorized", "PUBLISH topic not allowed by IAM", "HTTP 413 payload too large", "Certificate not active"])}`
    : `Device ${eventType}: ${resourcePath} protocol=${protocol} payload_bytes=${payloadSizeBytes} firmware=${firmwareVersion} connection_duration_s=${connectionDurationSeconds}${gatewayId ? ` gateway_id=${gatewayId}` : ""}`;

  return {
    "@timestamp": ts,
    severity,
    labels: {
      "resource.type": "cloudiot.googleapis.com/Device",
      device_id: deviceId,
      registry_id: registryName,
    },
    cloud: gcpCloud(region, project, "cloudiot.googleapis.com"),
    gcp: {
      iot_core: {
        registry_name: registryName,
        device_id: deviceId,
        event_type: eventType,
        protocol,
        payload_size_bytes: payloadSizeBytes,
        gateway_id: gatewayId || null,
        connection_duration_seconds: connectionDurationSeconds,
        firmware_version: firmwareVersion,
        last_heartbeat: ts,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(10, isErr ? 30_000 : 5000),
    },
    message,
  };
}
