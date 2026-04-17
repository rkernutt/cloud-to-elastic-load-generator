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
    name: "cdn-edge",
    language: "nodejs",
    framework: "Lambda@Edge",
    runtimeName: "node",
    runtimeVersion: "20.x",
  },
];

export function generateCloudFrontTrace(ts: string, er: number) {
  const cfg = rand(APPS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "staging", "dev"]);
  const isErr = Math.random() < er;
  const distId = `E${newTraceId().slice(0, 12).toUpperCase()}`;

  const svcBlock = serviceBlock(
    cfg.name,
    env,
    cfg.language,
    cfg.framework,
    cfg.runtimeName,
    cfg.runtimeVersion
  );
  const { agent, telemetry } = otelBlocks("nodejs", "elastic");

  const phases = [
    {
      name: "CloudFront.viewer-request",
      type: "app",
      subtype: "cloudfront",
      us: randInt(500, 25_000),
    },
    {
      name: `HTTP ${rand(["GET", "HEAD"])} origin`,
      type: "external",
      subtype: "http",
      us: randInt(5_000, 450_000),
    },
    {
      name: "CloudFront.origin-response",
      type: "app",
      subtype: "cloudfront",
      us: randInt(300, 40_000),
    },
  ];

  let offsetMs = randInt(1, 5);
  const spans: Record<string, unknown>[] = [];
  let sumUs = 0;
  for (let i = 0; i < phases.length; i++) {
    const ph = phases[i]!;
    const sid = newSpanId();
    sumUs += ph.us;
    const spanErr = isErr && i === phases.length - 1;
    const nm = ph.name;
    spans.push({
      "@timestamp": offsetTs(new Date(ts), offsetMs),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sid,
        type: ph.type,
        subtype: ph.subtype,
        name: nm,
        duration: { us: ph.us },
        action: ph.type === "external" ? "call" : "process",
        destination: {
          service: {
            resource: ph.type === "external" ? "http" : "cloudfront",
            type: ph.type,
            name: ph.type === "external" ? "http" : "cloudfront",
          },
        },
      },
      labels: {
        "aws.cloudfront.distribution_id": distId,
        ...(ph.type === "external"
          ? { "http.url": `https://origin.${rand(["api", "assets"])}.internal/` }
          : {}),
      },
      event: { outcome: spanErr ? "failure" : "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    });
    offsetMs += Math.max(1, Math.round(ph.us / 1000));
  }

  const totalUs = sumUs + randInt(1_000, 12_000);
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: rand(["GET /static/*", "GET /api/config.json", "HEAD /health"]),
      type: "request",
      duration: { us: totalUs },
      result: isErr ? "HTTP 504" : "HTTP 2xx",
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
      service: { name: "cloudfront" },
    },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  return [txDoc, ...spans];
}
