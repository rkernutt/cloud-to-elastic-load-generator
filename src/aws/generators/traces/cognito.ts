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

const OPS = [
  ["Cognito.InitiateAuth", "Cognito.GetUser"],
  ["Cognito.AdminGetUser", "Cognito.InitiateAuth"],
  ["Cognito.RespondToAuthChallenge", "Cognito.GetUser"],
];

export function generateCognitoTrace(ts: string, er: number) {
  const cfg = rand(APPS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "staging", "dev"]);
  const isErr = Math.random() < er;
  const poolId = `${region}_${newTraceId().slice(0, 9)}`;
  const opList = rand(OPS);

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
  for (let i = 0; i < opList.length; i++) {
    const name = opList[i]!;
    const sid = newSpanId();
    const us = randInt(400, 95_000);
    sumUs += us;
    const spanErr = isErr && i === opList.length - 1;
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
        action: name.split(".")[1] || "call",
        destination: { service: { resource: "cognito", type: "external", name: "cognito" } },
      },
      labels: { "aws.cognito.user_pool_id": poolId },
      event: { outcome: spanErr ? "failure" : "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    });
    offsetMs += Math.max(1, Math.round(us / 1000));
  }

  const totalUs = sumUs + randInt(1_000, 15_000);
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: rand(["POST /oauth/token", "GET /session", "POST /refresh"]),
      type: "request",
      duration: { us: totalUs },
      result: isErr ? "HTTP 401" : "HTTP 2xx",
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
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  return [txDoc, ...spans];
}
