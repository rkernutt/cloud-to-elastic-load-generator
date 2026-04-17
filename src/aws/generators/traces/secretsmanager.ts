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

const APPS = [
  {
    name: "bootstrap-job",
    language: "python",
    framework: "boto3",
    runtimeName: "CPython",
    runtimeVersion: "3.12.3",
  },
  {
    name: "api-worker",
    language: "java",
    framework: "AWS SDK v2",
    runtimeName: "OpenJDK",
    runtimeVersion: "21.0.3",
  },
];

export function generateSecretsManagerTrace(ts: string, er: number) {
  const cfg = rand(APPS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "staging", "dev"]);
  const isErr = Math.random() < er;
  const secretId = rand(["prod/db/credentials", "app/oauth/client", "tls/internal-cert"]);

  const svcBlock = serviceBlock(
    cfg.name,
    env,
    cfg.language,
    cfg.framework,
    cfg.runtimeName,
    cfg.runtimeVersion
  );
  const { agent, telemetry } = otelBlocks(cfg.language as "python" | "java", "elastic");

  const n = randInt(2, 4);
  let offsetMs = randInt(1, 6);
  const spans: Record<string, unknown>[] = [];
  let sumUs = 0;
  for (let i = 0; i < n; i++) {
    const sid = newSpanId();
    const us = randInt(300, 85_000);
    sumUs += us;
    const spanErr = isErr && i === n - 1;
    spans.push({
      "@timestamp": offsetTs(new Date(ts), offsetMs),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sid,
        type: "external",
        subtype: "aws",
        name:
          i === 0
            ? "SecretsManager.GetSecretValue"
            : rand(["SecretsManager.GetSecretValue", "SecretsManager.DescribeSecret"]),
        duration: { us },
        action: "GetSecretValue",
        destination: {
          service: { resource: "secretsmanager", type: "external", name: "secretsmanager" },
        },
      },
      labels: { "aws.secretsmanager.secret_id": secretId },
      event: { outcome: spanErr ? "failure" : "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    });
    offsetMs += Math.max(1, Math.round(us / 1000));
  }

  const totalUs = sumUs + randInt(1_000, 14_000);
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: rand(["StartupConfig", "RotateDbPassword", "FetchSigningKey"]),
      type: "request",
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
      service: { name: "secretsmanager" },
    },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  return [txDoc, ...spans];
}
