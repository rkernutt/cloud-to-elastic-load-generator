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
    name: "token-service",
    language: "nodejs",
    framework: "Express",
    runtimeName: "node",
    runtimeVersion: "20.15.1",
  },
  {
    name: "pii-pipeline",
    language: "python",
    framework: "FastAPI",
    runtimeName: "CPython",
    runtimeVersion: "3.12.3",
  },
];

type KmsScenario = {
  primaryOp: string;
  /** Human-readable flow name */
  flow: string;
  spanNames: [string, string, string, string, string];
};

const KMS_SCENARIOS: KmsScenario[] = [
  {
    primaryOp: "Encrypt",
    flow: "env_encrypt",
    spanNames: [
      "KMS.Encrypt",
      "KMS.DescribeKey",
      "KMS.CryptographicOperation",
      "KMS.EmitAuditEvent",
      "KMS.CompleteRequest",
    ],
  },
  {
    primaryOp: "Decrypt",
    flow: "env_decrypt",
    spanNames: [
      "KMS.Decrypt",
      "KMS.DescribeKey",
      "KMS.CryptographicOperation",
      "KMS.EmitAuditEvent",
      "KMS.CompleteRequest",
    ],
  },
  {
    primaryOp: "GenerateDataKey",
    flow: "data_key",
    spanNames: [
      "KMS.GenerateDataKey",
      "KMS.DescribeKey",
      "KMS.CryptographicOperation",
      "KMS.EmitAuditEvent",
      "KMS.CompleteRequest",
    ],
  },
  {
    primaryOp: "Sign",
    flow: "jwt_sign",
    spanNames: [
      "KMS.Sign",
      "KMS.DescribeKey",
      "KMS.GetPublicKey",
      "KMS.EmitAuditEvent",
      "KMS.CompleteRequest",
    ],
  },
  {
    primaryOp: "ReEncrypt",
    flow: "re_encrypt",
    spanNames: [
      "KMS.ReEncrypt",
      "KMS.DescribeKey",
      "KMS.CryptographicOperation",
      "KMS.EmitAuditEvent",
      "KMS.CompleteRequest",
    ],
  },
  {
    primaryOp: "CreateGrant",
    flow: "delegate_grant",
    spanNames: [
      "KMS.CreateGrant",
      "KMS.DescribeKey",
      "KMS.ListGrants",
      "KMS.EmitAuditEvent",
      "KMS.CompleteRequest",
    ],
  },
];

const FAIL_BY_IDX = [
  {
    errorType: "KeyDisabledException",
    errorMessage: "The key is disabled and cannot be used for crypto operations.",
    labels: { "aws.kms.failure_mode": "KeyDisabledException" },
  },
  {
    errorType: "InvalidKeyUsageException",
    errorMessage: "Key usage does not permit this algorithm or operation.",
    labels: { "aws.kms.failure_mode": "InvalidKeyUsageException" },
  },
  {
    errorType: "KMSInternalException",
    errorMessage: "An internal error occurred in KMS; retry the request.",
    labels: { "aws.kms.failure_mode": "KMSInternalException" },
  },
  {
    errorType: "DependencyTimeoutException",
    errorMessage: "A dependency timed out while talking to the HSM partition.",
    labels: { "aws.kms.failure_mode": "DependencyTimeoutException" },
  },
] as const;

export function generateKmsTrace(ts: string, er: number) {
  const cfg = rand(APPS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "staging", "dev"]);
  const isErr = Math.random() < er;
  const keyId = newTraceId()
    .replace(/[^0-9a-f]/g, "")
    .slice(0, 32);
  const cmkArn = `arn:aws:kms:${region}:${account.id}:key/${keyId}`;
  const aliasName = rand(["app-data", "jwt-signing", "pii-envelope"]);
  const scenario = rand(KMS_SCENARIOS);
  const spanNames = scenario.spanNames;
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
  const { agent, telemetry } = otelBlocks(cfg.language as "python" | "nodejs", "elastic");

  let offsetMs = randInt(1, 6);
  const spans: Record<string, unknown>[] = [];
  let sumUs = 0;

  for (let i = 0; i < spanCount; i++) {
    const name = spanNames[i]!;
    const sid = newSpanId();
    const us = randInt(400, 120_000);
    sumUs += us;
    const spanErr = failIdx === i;
    const action = name.includes(".") ? name.split(".").slice(1).join(".") : name;

    const errLabels = spanErr
      ? {
          ...failMeta?.labels,
          ...awsSpanErrorLabels(failMeta?.errorMessage ?? "KMS request failed."),
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
        destination: { service: { resource: "kms", type: "external", name: "kms" } },
      },
      service: svcBlock,
      agent,
      telemetry,
      labels: {
        "aws.kms.key_arn": cmkArn,
        "aws.kms.key_id": keyId,
        "aws.kms.key_alias": `alias/${aliasName}`,
        "aws.kms.operation": scenario.primaryOp,
        "aws.kms.flow": scenario.flow,
        "aws.kms.span_phase": String(i),
        ...errLabels,
      },
      event: { outcome: spanErr ? "failure" : "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    });
    offsetMs += Math.max(1, Math.round(us / 1000));
  }

  const totalUs = sumUs + randInt(1_000, 16_000);
  const txErr = failIdx >= 0;

  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: rand([
        "IssueSessionToken",
        "EnvelopeEncryptField",
        "RotateDataKey",
        "SignJwtAssertion",
      ]),
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
      service: { name: "kms" },
    },
    labels: {
      "aws.kms.key_arn": cmkArn,
      "aws.kms.operation": scenario.primaryOp,
      ...(txErr && failMeta ? failMeta.labels : {}),
    },
    event: { outcome: txErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  return [txDoc, ...spans];
}
