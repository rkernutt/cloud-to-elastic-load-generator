/**
 * Route 53 DNS resolution OTel trace generator.
 *
 * Simulates application-side DNS lookups instrumented via EDOT:
 * resolver query → hosted zone lookup → record set resolution → response.
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
  awsSpanErrorLabels,
} from "./helpers.js";

const APPS = [
  {
    name: "service-mesh-proxy",
    language: "go",
    framework: null,
    runtimeName: "go",
    runtimeVersion: "1.23.4",
  },
  {
    name: "api-resolver",
    language: "java",
    framework: "Spring Boot",
    runtimeName: "OpenJDK",
    runtimeVersion: "21.0.3",
  },
  {
    name: "edge-worker",
    language: "nodejs",
    framework: "Express",
    runtimeName: "node",
    runtimeVersion: "20.15.1",
  },
];

const RECORD_TYPES = ["A", "AAAA", "CNAME", "TXT", "MX"] as const;

export function generateRoute53Trace(ts: string, er: number) {
  const cfg = rand(APPS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "production", "staging", "dev"]);
  const isErr = Math.random() < er;
  const hostedZoneId = `Z${newTraceId().slice(0, 12).toUpperCase()}`;
  const fqdn = rand([
    "api.prod.internal.",
    "db-primary.cluster.local.",
    "cdn.assets.example.com.",
    "auth.sso.example.com.",
  ]);
  const rtype = rand(RECORD_TYPES);

  const svcBlock = serviceBlock(
    cfg.name,
    env,
    cfg.language,
    cfg.framework,
    cfg.runtimeName,
    cfg.runtimeVersion
  );
  const { agent, telemetry } = otelBlocks(cfg.language as "go" | "java" | "nodejs", "elastic");

  const phases: Array<{
    name: string;
    type: string;
    subtype: string;
    action: string;
    resource: string;
    us: number;
    labels: Record<string, string>;
  }> = [
    {
      name: `Route53.ListHostedZonesByName ${fqdn}`,
      type: "external",
      subtype: "dns",
      action: "query",
      resource: "route53",
      us: randInt(2_000, 35_000),
      labels: { "aws.route53.operation": "ListHostedZonesByName", "dns.question.name": fqdn },
    },
    {
      name: `Route53.GetHostedZone ${hostedZoneId}`,
      type: "external",
      subtype: "dns",
      action: "access",
      resource: "route53",
      us: randInt(1_500, 28_000),
      labels: { "aws.route53.hosted_zone_id": hostedZoneId },
    },
    {
      name: `Route53.ListResourceRecordSets ${rtype}`,
      type: "external",
      subtype: "dns",
      action: "query",
      resource: "route53",
      us: randInt(3_000, 55_000),
      labels: { "aws.route53.record_type": rtype, "dns.question.type": rtype },
    },
    {
      name: "DNS.resolve",
      type: "external",
      subtype: "dns",
      action: "resolve",
      resource: "dns",
      us: randInt(500, 18_000),
      labels: { "dns.rcode": isErr ? "SERVFAIL" : "NOERROR" },
    },
  ];

  let offsetMs = randInt(1, 5);
  const spans: Record<string, unknown>[] = [];
  let sumUs = 0;
  for (let i = 0; i < phases.length; i++) {
    const ph = phases[i]!;
    const spanErr = isErr && i === phases.length - 1;
    const du = spanErr ? randInt(50_000, 200_000) : ph.us;
    sumUs += du;
    spans.push({
      "@timestamp": offsetTs(new Date(ts), offsetMs),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: newSpanId(),
        type: ph.type,
        subtype: ph.subtype,
        name: ph.name,
        duration: { us: du },
        action: ph.action,
        destination: { service: { resource: ph.resource, type: ph.type, name: ph.resource } },
      },
      service: svcBlock,
      agent,
      telemetry,
      labels: { ...ph.labels, ...(spanErr ? awsSpanErrorLabels() : {}) },
      event: { outcome: spanErr ? "failure" : "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    });
    offsetMs += Math.max(1, Math.round(du / 1000)) + randInt(1, 6);
  }

  const totalUs = sumUs + randInt(1_000, 8_000);
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `Resolve ${fqdn.replace(/\.$/, "")} (${rtype})`,
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
      service: { name: "route53" },
    },
    labels: { "aws.route53.hosted_zone_id": hostedZoneId, "dns.fqdn": fqdn },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  return [txDoc, ...spans];
}
