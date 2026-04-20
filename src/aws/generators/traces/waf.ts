/**
 * AWS WAF OTel trace generator.
 *
 * Simulates HTTP request inspection: rule groups, IP sets, rate limiting, and allow/block outcome.
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

const APPS = [
  {
    name: "edge-api",
    language: "nodejs" as const,
    framework: "Express",
    runtimeName: "node",
    runtimeVersion: "20.15.1",
  },
  {
    name: "public-website",
    language: "python" as const,
    framework: "FastAPI",
    runtimeName: "CPython",
    runtimeVersion: "3.12.3",
  },
];

export function generateWafTrace(ts: string, er: number) {
  const cfg = rand(APPS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "staging", "dev"]);
  const isErr = Math.random() < er;
  const webAclId = rand(["regional-api-acl", "cf-edge-acl", "api-baseline-acl"]);

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
      name: "WAF.rule-group-evaluation",
      us: randInt(500, 35_000),
      labels: {
        "aws.waf.web_acl": webAclId,
        rule_group: rand(["AWSManagedRulesCommonRuleSet", "CustomRG-API"]),
      },
    },
    {
      name: "WAF.ip-set-check",
      us: randInt(200, 18_000),
      labels: { "aws.waf.ip_set": rand(["allowlist-office", "blocklist-abuse", "geo-restrict"]) },
    },
    {
      name: "WAF.rate-limit-check",
      us: randInt(300, 22_000),
      labels: { rate_limit_key: rand(["ip", "header:Authorization", "cookie:session"]) },
    },
  ];

  let offsetMs = randInt(1, 4);
  const spans: Record<string, unknown>[] = [];
  let sumUs = 0;
  for (let i = 0; i < phases.length; i++) {
    const ph = phases[i]!;
    const spanErr = isErr && i === phases.length - 1;
    const du = spanErr ? randInt(80_000, 500_000) : ph.us;
    sumUs += du;
    spans.push({
      "@timestamp": offsetTs(new Date(ts), offsetMs),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: newSpanId(),
        type: "app",
        subtype: "waf",
        name: ph.name,
        duration: { us: du },
        action: "evaluate",
        destination: { service: { resource: "waf", type: "app", name: "waf" } },
      },
      labels: ph.labels,
      event: { outcome: spanErr ? "failure" : "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    });
    offsetMs += Math.max(1, Math.round(du / 1000)) + randInt(1, 6);
  }

  const blocked = isErr && Math.random() < 0.55;
  const totalUs = sumUs + randInt(1_000, 15_000);
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: blocked ? "WAF blocked request" : "WAF allow request",
      type: "request",
      duration: { us: totalUs },
      result: isErr ? (blocked ? "HTTP 403" : "failure") : "HTTP 2xx",
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
      service: { name: "waf" },
    },
    labels: {
      "aws.waf.web_acl": webAclId,
      waf_action: blocked ? "block" : rand(["allow", "allow", "count"]),
    },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  return [txDoc, ...spans];
}
