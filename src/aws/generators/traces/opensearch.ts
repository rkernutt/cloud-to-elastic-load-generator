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
    name: "search-api",
    language: "java",
    framework: "Spring Web",
    runtimeName: "OpenJDK",
    runtimeVersion: "21.0.3",
  },
  {
    name: "catalog-query",
    language: "python",
    framework: "Django",
    runtimeName: "CPython",
    runtimeVersion: "3.12.3",
  },
  {
    name: "log-analytics",
    language: "nodejs",
    framework: "NestJS",
    runtimeName: "node",
    runtimeVersion: "20.15.1",
  },
];

const OPS = [
  ["OpenSearch.search", "OpenSearch.msearch"],
  ["OpenSearch.index", "OpenSearch.refresh"],
  ["OpenSearch.bulk", "OpenSearch.count"],
];

export function generateOpenSearchTrace(ts: string, er: number) {
  const cfg = rand(APPS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "staging", "dev"]);
  const isErr = Math.random() < er;
  const domain = `${rand(["app", "logs", "commerce"])}-search`;
  const opList = rand(OPS);

  const svcBlock = serviceBlock(
    cfg.name,
    env,
    cfg.language,
    cfg.framework,
    cfg.runtimeName,
    cfg.runtimeVersion
  );
  const { agent, telemetry } = otelBlocks(cfg.language as "python" | "nodejs" | "java", "elastic");

  let offsetMs = randInt(1, 6);
  const spans: Record<string, unknown>[] = [];
  let sumUs = 0;
  for (let i = 0; i < opList.length; i++) {
    const name = opList[i]!;
    const sid = newSpanId();
    const us = randInt(1_500, 280_000);
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
        type: "db",
        subtype: "elasticsearch",
        name,
        duration: { us },
        action: name.includes("bulk") ? "execute" : "query",
        db: {
          type: "elasticsearch",
          statement: `${name} ${rand(["products_v2", "orders-*", "nginx-logs-*"])}`,
        },
        destination: { service: { resource: "elasticsearch", type: "db", name: "opensearch" } },
      },
      labels: { "aws.opensearch.domain_name": domain },
      event: { outcome: spanErr ? "failure" : "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    });
    offsetMs += Math.max(1, Math.round(us / 1000));
  }

  const totalUs = sumUs + randInt(2_000, 18_000);
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: rand(["ProductSearch", "LogFacetQuery", "IndexOrderDocument"]),
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
      service: { name: "opensearch" },
    },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  return [txDoc, ...spans];
}
