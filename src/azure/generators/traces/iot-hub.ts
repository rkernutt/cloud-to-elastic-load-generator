import type { EcsDocument } from "../helpers.js";
import { rand, randInt, azureCloud, makeAzureSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { azureServiceBase, enrichAzureTraceDoc } from "./trace-kit.js";

function cd(region: string, rg: string, sub: string, extra: Record<string, string> = {}) {
  return {
    customDimensions: {
      azure_region: region,
      azure_resource_group: rg,
      azure_subscription_id: sub,
      ...extra,
    },
  };
}

export function generateIotHubTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const svc = azureServiceBase("device-telemetry-bridge", env, "java", {
    framework: "spring-boot",
    runtimeName: "java",
    runtimeVersion: "21",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);
  const cloud = azureCloud(region, subscription, "Microsoft.Devices/IotHubs");
  const hub = rand(["iothub-prod-01", "iothub-edge", "iothub-telemetry"]);
  const failIdx = isErr ? randInt(0, 3) : -1;

  const ops = [
    { name: `IoTHub.DeviceToCloudMessage ${hub}`, us: randInt(4_000, 120_000) },
    { name: `IoTHub.RouteMessage ${hub}`, us: randInt(2_000, 45_000) },
    { name: "IoTHub.EndpointDelivery eventhub-endpoint", us: randInt(10_000, 220_000) },
    { name: "IoTHub.AckDelivery", us: randInt(800, 35_000) },
  ];

  let ms = randInt(1, 6);
  const spans: EcsDocument[] = [];
  let sum = 0;
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]!;
    const sid = randSpanId();
    sum += op.us;
    const spanErr = failIdx === i;
    spans.push(
      enrichAzureTraceDoc(
        {
          "@timestamp": offsetTs(base, ms),
          processor: { name: "transaction", event: "span" },
          trace: { id: traceId },
          transaction: { id: txId },
          parent: { id: txId },
          span: {
            id: sid,
            type: "messaging",
            subtype: "azure-iot-hub",
            name: op.name,
            duration: { us: op.us },
            action: i === 0 ? "send" : i === 3 ? "consume" : "process",
            destination: { service: { resource: "iot-hub", type: "messaging", name: "iot-hub" } },
            labels: spanErr
              ? { "azure.iot.error": "throttled" }
              : { device_id: rand(["dev-12a", "gw-9f2", "sensor-44"]) },
          },
          service: svc,
          cloud,
          event: { outcome: spanErr ? "failure" : "success" },
          ...dim({ dependency_type: "Azure IoT Hub", hub }),
        },
        traceId,
        "java"
      )
    );
    ms += Math.max(1, Math.round(op.us / 1000));
  }

  const totalUs = sum + randInt(1_000, 20_000);
  const txErr = failIdx >= 0;
  const txDoc = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: `telemetry ingest ${hub}`,
        type: "messaging",
        duration: { us: totalUs },
        result: txErr ? "failure" : "success",
        sampled: true,
        span_count: { started: spans.length, dropped: 0 },
      },
      service: svc,
      cloud,
      event: { outcome: txErr ? "failure" : "success" },
      ...dim({}),
    },
    traceId,
    "java"
  );

  return [txDoc, ...spans];
}
