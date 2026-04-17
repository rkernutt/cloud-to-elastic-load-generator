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
    name: "graph-recommendations",
    language: "python",
    framework: "gremlinpython",
    runtimeName: "CPython",
    runtimeVersion: "3.12.3",
  },
  {
    name: "fraud-graph",
    language: "java",
    framework: "TinkerPop",
    runtimeName: "OpenJDK",
    runtimeVersion: "21.0.3",
  },
];

export function generateNeptuneTrace(ts: string, er: number) {
  const cfg = rand(APPS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "staging", "dev"]);
  const isErr = Math.random() < er;
  const cluster = `neptune-${rand(["prod", "stg"])}-${randInt(1, 4)}`;

  const svcBlock = serviceBlock(
    cfg.name,
    env,
    cfg.language,
    cfg.framework,
    cfg.runtimeName,
    cfg.runtimeVersion
  );
  const { agent, telemetry } = otelBlocks(cfg.language as "python" | "java", "elastic");

  const isGremlin = cfg.language === "python";
  const stmts = isGremlin
    ? [
        "g.V().hasLabel('user').has('id', uid).out('purchased').limit(50)",
        "g.V(edgeId).bothE().otherV().path()",
      ]
    : [
        "SELECT ?product WHERE { ?product a :Offering ; :sku ?sku }",
        "SELECT (COUNT(?x) AS ?c) WHERE { ?x a :Transaction }",
      ];

  let offsetMs = randInt(1, 6);
  const spans: Record<string, unknown>[] = [];
  let sumUs = 0;
  for (let i = 0; i < stmts.length; i++) {
    const sid = newSpanId();
    const us = randInt(2_000, 380_000);
    sumUs += us;
    const spanErr = isErr && i === stmts.length - 1;
    spans.push({
      "@timestamp": offsetTs(new Date(ts), offsetMs),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sid,
        type: "db",
        subtype: isGremlin ? "neo4j" : "sparql",
        name: isGremlin ? "Neptune Gremlin query" : "Neptune SPARQL query",
        duration: { us },
        action: "query",
        db: { type: "other", statement: stmts[i] },
        destination: { service: { resource: "neptune", type: "db", name: "neptune" } },
      },
      labels: { "aws.neptune.db_cluster_identifier": cluster },
      event: { outcome: spanErr ? "failure" : "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    });
    offsetMs += Math.max(1, Math.round(us / 1000));
  }

  const totalUs = sumUs + randInt(2_000, 20_000);
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: rand(["RelatedProducts", "FraudNeighborhood", "EntityResolution"]),
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
      service: { name: "neptune" },
    },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  return [txDoc, ...spans];
}
