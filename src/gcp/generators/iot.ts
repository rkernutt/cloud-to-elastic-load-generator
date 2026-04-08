/**
 * GCP IoT Core log generator.
 */

import { type EcsDocument, rand, randInt, randId, gcpCloud, makeGcpSetup } from "./helpers.js";

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
  const lastHeartbeat = ts;
  const message = isErr
    ? `IoT Core ${eventType} failed for device ${deviceId} (${protocol}): ${rand(["Authentication failed", "Topic not authorized", "Payload too large", "Registry misconfigured"])}`
    : `IoT Core ${eventType} device=${deviceId} registry=${registryName} (${payloadSizeBytes} bytes${gatewayId ? ` via gateway ${gatewayId}` : ""})`;

  return {
    "@timestamp": ts,
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
        last_heartbeat: lastHeartbeat,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(10, isErr ? 30_000 : 5000),
    },
    message,
  };
}
