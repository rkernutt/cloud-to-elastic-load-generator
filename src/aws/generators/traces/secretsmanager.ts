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
  awsSpanErrorLabels,
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

type FlowDef = {
  name: string;
  transactionName: string;
  spans: string[];
};

const FLOWS: FlowDef[] = [
  {
    name: "read_secret",
    transactionName: "FetchSigningKey",
    spans: [
      "SecretsManager.DescribeSecret",
      "SecretsManager.GetSecretValue",
      "KMS.Decrypt",
      "SecretsManager.EmitAuditRecord",
      "SecretsManager.CompleteResponse",
    ],
  },
  {
    name: "write_secret",
    transactionName: "PublishRotatedCredential",
    spans: [
      "SecretsManager.DescribeSecret",
      "SecretsManager.PutSecretValue",
      "KMS.GenerateDataKey",
      "SecretsManager.EmitAuditRecord",
      "SecretsManager.CompleteResponse",
    ],
  },
  {
    name: "rotate",
    transactionName: "RotateDbPassword",
    spans: [
      "SecretsManager.DescribeSecret",
      "SecretsManager.RotateSecret",
      "SecretsManager.GetSecretValue",
      "SecretsManager.PutSecretValue",
      "SecretsManager.EmitAuditRecord",
    ],
  },
  {
    name: "bootstrap",
    transactionName: "StartupConfig",
    spans: [
      "SecretsManager.CreateSecret",
      "KMS.GenerateDataKey",
      "SecretsManager.TagResource",
      "SecretsManager.GetSecretValue",
      "SecretsManager.EmitAuditRecord",
    ],
  },
];

const FAIL_BY_IDX = [
  {
    errorType: "ResourceNotFoundException",
    errorMessage: "Secrets Manager can't find the specified secret.",
    labels: { "aws.secretsmanager.failure": "ResourceNotFoundException" },
  },
  {
    errorType: "DecryptionFailure",
    errorMessage: "KMS failed to decrypt the protected secret.",
    labels: { "aws.secretsmanager.failure": "DecryptionFailure" },
  },
  {
    errorType: "InvalidParameterException",
    errorMessage: "The parameter name or value is invalid.",
    labels: { "aws.secretsmanager.failure": "InvalidParameterException" },
  },
  {
    errorType: "InternalServiceError",
    errorMessage: "An error on the server side prevented processing.",
    labels: { "aws.secretsmanager.failure": "InternalServiceError" },
  },
] as const;

function spanResource(spanName: string): string {
  if (spanName.startsWith("KMS.")) return "kms";
  return "secretsmanager";
}

export function generateSecretsManagerTrace(ts: string, er: number) {
  const cfg = rand(APPS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "staging", "dev"]);
  const isErr = Math.random() < er;
  const secretId = rand(["prod/db/credentials", "app/oauth/client", "tls/internal-cert"]);
  const versionId = newTraceId().slice(0, 32);

  const flow = rand(FLOWS);
  const spanNames = flow.spans;
  const spanCount = spanNames.length;
  const failIdx = isErr ? randInt(0, spanCount - 1) : -1;
  const failMeta = failIdx >= 0 ? FAIL_BY_IDX[failIdx % FAIL_BY_IDX.length]! : null;

  const svcBlock = serviceBlock(
    cfg.name,
    env,
    cfg.language,
    cfg.framework,
    cfg.runtimeName,
    cfg.runtimeVersion
  );
  const { agent, telemetry } = otelBlocks(cfg.language as "python" | "java", "elastic");

  let offsetMs = randInt(1, 6);
  const spans: Record<string, unknown>[] = [];
  let sumUs = 0;

  for (let i = 0; i < spanCount; i++) {
    const name = spanNames[i]!;
    const resource = spanResource(name);
    const sid = newSpanId();
    const us = randInt(300, 85_000);
    sumUs += us;
    const spanErr = failIdx === i;
    const action = name.includes(".") ? name.split(".").slice(1).join(".") : name;

    const errLabels = spanErr
      ? {
          ...failMeta?.labels,
          ...awsSpanErrorLabels(failMeta?.errorMessage ?? "Secrets Manager error."),
        }
      : {};

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
        name,
        duration: { us },
        action: action || "call",
        destination: { service: { resource, type: "external", name: resource } },
      },
      service: svcBlock,
      agent,
      telemetry,
      labels: {
        "aws.secretsmanager.secret_id": secretId,
        "aws.secretsmanager.version_id": versionId,
        "aws.secretsmanager.flow": flow.name,
        ...(resource === "kms" ? { "aws.kms.context": "secrets_manager_envelope" } : {}),
        ...errLabels,
      },
      event: { outcome: spanErr ? "failure" : "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    });
    offsetMs += Math.max(1, Math.round(us / 1000));
  }

  const totalUs = sumUs + randInt(1_000, 14_000);
  const txErr = failIdx >= 0;

  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: flow.transactionName,
      type: "request",
      duration: { us: totalUs },
      result: txErr ? "failure" : "success",
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
    labels: {
      "aws.secretsmanager.secret_id": secretId,
      "aws.secretsmanager.flow": flow.name,
      ...(txErr && failMeta ? failMeta.labels : {}),
    },
    event: { outcome: txErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  return [txDoc, ...spans];
}
