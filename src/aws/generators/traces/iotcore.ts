/**
 * AWS IoT Core OTel trace generator.
 *
 * Simulates MQTT publish through rule engine evaluation and action dispatch.
 */

import {
  TRACE_REGIONS,
  TRACE_ACCOUNTS,
  newTraceId,
  newSpanId,
  rand,
  randInt,
  offsetTs,
  serviceBlock,
  otelBlocks,
} from "./helpers.js";

const BRIDGE_SERVICES = [
  {
    name: "device-bridge",
    language: "python" as const,
    framework: "MQTT client",
    runtimeName: "CPython",
    runtimeVersion: "3.12.3",
  },
  {
    name: "telemetry-router",
    language: "nodejs" as const,
    framework: "AWS SDK v3",
    runtimeName: "node",
    runtimeVersion: "20.15.1",
  },
];

export function generateIotcoreTrace(ts: string, er: number) {
  const cfg = rand(BRIDGE_SERVICES);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "staging", "dev"]);
  const isErr = Math.random() < er;
  const topic = rand(["factory/line1/telemetry", "home/sensor/temp", "fleet/gps/updates"]);

  const svcBlock = serviceBlock(
    cfg.name,
    env,
    cfg.language,
    cfg.framework,
    cfg.runtimeName,
    cfg.runtimeVersion
  );
  const { agent, telemetry } = otelBlocks(cfg.language, "elastic");

  const phases = [
    {
      name: "IoT.MQTT.receive",
      us: randInt(800, 45_000),
      labels: { mqtt_qos: String(randInt(0, 1)), topic },
    },
    {
      name: "IoT.RuleEngine.evaluate",
      us: randInt(2_000, 120_000),
      labels: { rule_name: rand(["routeToTimestream", "fanoutToSqs", "filterHighTemp"]) },
    },
    {
      name: "IoT.Action.dispatch",
      us: randInt(3_000, 200_000),
      labels: { action: rand(["SQS", "Lambda", "Kinesis", "S3"]) },
    },
  ];

  let offsetMs = randInt(1, 5);
  const spans: Record<string, unknown>[] = [];
  let sumUs = 0;
  for (let i = 0; i < phases.length; i++) {
    const ph = phases[i]!;
    const spanErr = isErr && i === phases.length - 1;
    const du = spanErr ? randInt(150_000, 900_000) : ph.us;
    sumUs += du;
    spans.push({
      "@timestamp": offsetTs(new Date(ts), offsetMs),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: newSpanId(),
        type: "messaging",
        subtype: "mqtt",
        name: ph.name,
        duration: { us: du },
        action: rand(["receive", "evaluate", "dispatch"]),
        destination: { service: { resource: "iot", type: "messaging", name: "iot" } },
      },
      labels: ph.labels,
      event: { outcome: spanErr ? "failure" : "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    });
    offsetMs += Math.max(1, Math.round(du / 1000)) + randInt(1, 8);
  }

  const totalUs = sumUs + randInt(2_000, 25_000);
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `MQTT publish ${topic.split("/").pop()}`,
      type: "messaging",
      duration: { us: totalUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: spans.length, dropped: 0 },
    },
    service: svcBlock,
    agent,
    telemetry,
    cloud: {
      provider: "aws",
      region,
      account: { id: account.id, name: account.name },
      service: { name: "iotcore" },
    },
    labels: { "aws.iot.topic": topic },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  return [txDoc, ...spans];
}
