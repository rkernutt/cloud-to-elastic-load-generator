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
    name: "auth-gateway",
    language: "nodejs",
    framework: "Express",
    runtimeName: "node",
    runtimeVersion: "20.15.1",
  },
  {
    name: "identity-bff",
    language: "go",
    framework: "chi",
    runtimeName: "go",
    runtimeVersion: "1.22.5",
  },
];

/** error metadata keyed by failing span index (mod length) */
const FAIL_BY_IDX = [
  {
    errorType: "NotAuthorizedException",
    errorMessage: "Incorrect username or password.",
    txResult: "HTTP 401",
    labels: { "aws.cognito.failure": "wrong_password" },
  },
  {
    errorType: "UserNotFoundException",
    errorMessage: "User does not exist.",
    txResult: "HTTP 404",
    labels: { "aws.cognito.failure": "user_not_found" },
  },
  {
    errorType: "ExpiredCodeException",
    errorMessage: "Your software token has expired.",
    txResult: "HTTP 401",
    labels: { "aws.cognito.failure": "mfa_timeout" },
  },
  {
    errorType: "TooManyRequestsException",
    errorMessage: "Attempts exceeded; account temporarily locked.",
    txResult: "HTTP 429",
    labels: { "aws.cognito.failure": "account_locked" },
  },
  {
    errorType: "NotAuthorizedException",
    errorMessage: "Access Token has expired or is invalid.",
    txResult: "HTTP 401",
    labels: { "aws.cognito.failure": "invalid_token" },
  },
] as const;

type CognitoResource = "cognito-idp" | "cognito-identity";

type SpanSpec = {
  name: string;
  action: string;
  resource: CognitoResource;
  extraLabels?: Record<string, string>;
};

function pickFlow(isMfa: boolean): SpanSpec[] {
  const baseIdp: SpanSpec[] = [
    {
      name: "Cognito.InitiateAuth",
      action: "InitiateAuth",
      resource: "cognito-idp",
      extraLabels: { "aws.cognito.auth_flow": "USER_PASSWORD_AUTH" },
    },
    {
      name: "Cognito.AdminGetUser",
      action: "AdminGetUser",
      resource: "cognito-idp",
      extraLabels: { "aws.cognito.operation_context": "user_pool_lookup" },
    },
    {
      name: "Cognito.DescribeUserPool",
      action: "DescribeUserPool",
      resource: "cognito-idp",
      extraLabels: { "aws.cognito.operation_context": "pool_metadata" },
    },
    {
      name: "Cognito.GetUser",
      action: "GetUser",
      resource: "cognito-idp",
      extraLabels: { "aws.cognito.operation_context": "token_introspection" },
    },
  ];

  if (isMfa) {
    const mfaFlow: SpanSpec[] = [
      baseIdp[0]!,
      {
        name: "Cognito.AdminGetUser",
        action: "AdminGetUser",
        resource: "cognito-idp",
        extraLabels: { "aws.cognito.operation_context": "pre_mfa_identity" },
      },
      {
        name: "Cognito.RespondToAuthChallenge",
        action: "RespondToAuthChallenge",
        resource: "cognito-idp",
        extraLabels: {
          "aws.cognito.auth_flow": "USER_PASSWORD_AUTH",
          "aws.cognito.challenge_name": rand(["SMS_MFA", "SOFTWARE_TOKEN_MFA"]),
        },
      },
      {
        name: "Cognito.GetUser",
        action: "GetUser",
        resource: "cognito-idp",
        extraLabels: { "aws.cognito.operation_context": "post_challenge_validation" },
      },
      {
        name: "CognitoIdentity.GetId",
        action: "GetId",
        resource: "cognito-identity",
        extraLabels: { "aws.cognito.operation_context": "identity_pool_exchange" },
      },
      {
        name: "Cognito.DescribeUserPoolClient",
        action: "DescribeUserPoolClient",
        resource: "cognito-idp",
        extraLabels: { "aws.cognito.operation_context": "session_client_binding" },
      },
    ];
    return mfaFlow.slice(0, randInt(5, 6));
  }

  const tailChoices: SpanSpec[][] = [
    [
      {
        name: "CognitoIdentity.GetCredentialsForIdentity",
        action: "GetCredentialsForIdentity",
        resource: "cognito-identity",
        extraLabels: { "aws.cognito.identity_pool_id": "placeholder" },
      },
    ],
    [
      {
        name: "Cognito.DescribeUserPoolClient",
        action: "DescribeUserPoolClient",
        resource: "cognito-idp",
        extraLabels: { "aws.cognito.operation_context": "session_client_binding" },
      },
    ],
  ];
  const tail = rand(tailChoices);

  const merged: SpanSpec[] = [...baseIdp, ...tail];
  return merged.slice(0, randInt(5, 6));
}

export function generateCognitoTrace(ts: string, er: number) {
  const cfg = rand(APPS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "staging", "dev"]);
  const isErr = Math.random() < er;
  const poolId = `${region}_${newTraceId().slice(0, 9)}`;
  const clientId = newTraceId().slice(0, 16);
  const identityPoolId = `${region}:${newTraceId().slice(0, 12)}`;

  const flow = pickFlow(Math.random() < 0.45);
  const spanCount = flow.length;
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
  const { agent, telemetry } = otelBlocks(cfg.language as "nodejs" | "go", "elastic");

  let offsetMs = randInt(1, 6);
  const spans: Record<string, unknown>[] = [];
  let sumUs = 0;

  for (let i = 0; i < flow.length; i++) {
    const step = flow[i]!;
    const sid = newSpanId();
    const us = randInt(400, 95_000);
    sumUs += us;
    const spanErr = failIdx === i;
    const extra = { ...step.extraLabels };
    if (extra["aws.cognito.identity_pool_id"] === "placeholder") {
      extra["aws.cognito.identity_pool_id"] = identityPoolId;
    }

    const errLabels = spanErr
      ? {
          ...failMeta?.labels,
          ...awsSpanErrorLabels(failMeta?.errorMessage ?? "Cognito request failed."),
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
        name: step.name,
        duration: { us },
        action: step.action,
        destination: {
          service: {
            resource: step.resource,
            type: "external",
            name: step.resource,
          },
        },
      },
      service: svcBlock,
      agent,
      telemetry,
      labels: {
        "aws.cognito.user_pool_id": poolId,
        "aws.cognito.client_id": clientId,
        "aws.cognito.region": region,
        ...extra,
        ...errLabels,
      },
      event: { outcome: spanErr ? "failure" : "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    });
    offsetMs += Math.max(1, Math.round(us / 1000));
  }

  const totalUs = sumUs + randInt(1_000, 15_000);
  const txErr = failIdx >= 0;
  const txResult = txErr ? (failMeta?.txResult ?? "HTTP 401") : rand(["HTTP 200", "HTTP 204"]);

  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: rand(["POST /oauth/token", "GET /session", "POST /refresh"]),
      type: "request",
      duration: { us: totalUs },
      result: txResult,
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
      service: { name: "cognito" },
    },
    labels: {
      "aws.cognito.user_pool_id": poolId,
      ...(txErr && failMeta ? failMeta.labels : {}),
    },
    event: { outcome: txErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  return [txDoc, ...spans];
}
