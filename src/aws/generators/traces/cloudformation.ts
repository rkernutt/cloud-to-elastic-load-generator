/**
 * AWS CloudFormation OTel trace generator.
 *
 * Simulates stack create/update: template validation, resource provisioning, completion.
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

const TOOLS = [
  {
    name: "platform-iac",
    language: "python" as const,
    framework: "CDK",
    runtimeName: "CPython",
    runtimeVersion: "3.12.3",
  },
  {
    name: "infra-controller",
    language: "go" as const,
    framework: null as string | null,
    runtimeName: "go",
    runtimeVersion: "1.22.5",
  },
];

export function generateCloudformationTrace(ts: string, er: number) {
  const cfg = rand(TOOLS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "staging", "dev"]);
  const isErr = Math.random() < er;
  const stackName = rand(["network-vpc", "app-datastore", "edge-cdn", "observability-base"]);
  const stackId = `arn:aws:cloudformation:${region}:${account.id}:stack/${stackName}/${newTraceId().slice(0, 13)}`;

  const svcBlock = serviceBlock(
    cfg.name,
    env,
    cfg.language,
    cfg.framework,
    cfg.runtimeName,
    cfg.runtimeVersion
  );
  const { agent, telemetry } = otelBlocks(cfg.language, "elastic");

  const resources = rand([
    ["AWS::S3::Bucket", "AWS::IAM::Role", "AWS::Lambda::Function"],
    ["AWS::DynamoDB::Table", "AWS::SQS::Queue", "AWS::SNS::Topic"],
    ["AWS::ECS::Service", "AWS::ElasticLoadBalancingV2::TargetGroup", "AWS::Logs::LogGroup"],
  ]);

  const phases = [
    {
      name: "CloudFormation.validate-template",
      us: randInt(200_000, 8_000_000),
      labels: { template_format: rand(["JSON", "YAML"]) },
    },
    ...resources.map((rtype, idx) => ({
      name: `CloudFormation.create-resource ${rtype}`,
      us: randInt(1_500_000, 45_000_000),
      labels: { resource_type: rtype, logical_id: `${rtype.split("::").pop()}-${idx}` },
    })),
    {
      name: "CloudFormation.stack-completion",
      us: randInt(300_000, 12_000_000),
      labels: { stack_status: rand(["CREATE_COMPLETE", "UPDATE_COMPLETE"]) },
    },
  ];

  let offsetMs = randInt(10, 45);
  const spans: Record<string, unknown>[] = [];
  let sumUs = 0;
  for (let i = 0; i < phases.length; i++) {
    const ph = phases[i]!;
    const spanErr = isErr && i === phases.length - 1;
    const du = spanErr ? randInt(20_000_000, 90_000_000) : ph.us;
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
        subtype: "cloudformation",
        name: ph.name,
        duration: { us: du },
        action: rand(["validate", "create", "complete"]),
        destination: {
          service: { resource: "cloudformation", type: "app", name: "cloudformation" },
        },
      },
      labels: { "aws.cloudformation.stack_id": stackId, ...ph.labels },
      event: { outcome: spanErr ? "failure" : "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    });
    offsetMs += Math.max(10, Math.min(25_000, Math.round(du / 1000 / 80))) + randInt(5, 40);
  }

  const totalUs = sumUs + randInt(200_000, 4_000_000);
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: rand([`CreateStack ${stackName}`, `UpdateStack ${stackName}`]),
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
      service: { name: "cloudformation" },
    },
    labels: { "aws.cloudformation.stack_id": stackId, "aws.cloudformation.stack_name": stackName },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  return [txDoc, ...spans];
}
