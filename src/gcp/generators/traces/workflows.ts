import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

const STEP_NAMES_2 = ["step_validate", "step_call_api"] as const;
const STEP_NAMES_3 = ["step_validate", "step_transform", "step_notify"] as const;

export function generateWorkflowsTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging", "dev"]);
  const workflow = rand(["order-fulfillment", "invoice-retry", "data-promote"]);
  const otel = gcpOtelMeta("python");
  const svc = gcpServiceBase("workflow-orchestrator", env, "python", {
    runtimeName: "python",
    runtimeVersion: "3.12",
  });
  const cloud = gcpCloud(region, project, "workflows.googleapis.com");

  const stepCount = randInt(2, 3);
  const stepNamePool = stepCount === 2 ? STEP_NAMES_2 : STEP_NAMES_3;
  const uTrigger = randInt(800, 40_000);
  const uSteps = stepNamePool.map(() => randInt(5_000, 400_000) * (isErr ? randInt(2, 4) : 1));
  const uComplete = randInt(1_000, 55_000);

  const failIdx = isErr ? randInt(0, stepCount + 1) : -1;
  let offsetMs = 0;

  const sTrigger = randSpanId();
  const spanTrigger: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: sTrigger,
      type: "messaging",
      subtype: "http",
      name: `Workflows.trigger ${workflow}`,
      duration: { us: uTrigger },
      action: "send",
      destination: { service: { resource: "workflows", type: "messaging", name: "workflows" } },
      labels: failIdx === 0 ? { "gcp.rpc.status_code": "INVALID_ARGUMENT" } : {},
    },
    service: svc,
    cloud,
    data_stream: APM_DS,
    event: { outcome: failIdx === 0 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, sTrigger),
  };
  offsetMs += Math.max(1, Math.round(uTrigger / 1000));

  const stepDocs: EcsDocument[] = [];
  let parentId = sTrigger;
  for (let i = 0; i < stepCount; i++) {
    const sid = randSpanId();
    const stepName = stepNamePool[i] ?? `step_${i + 1}`;
    const us = uSteps[i] ?? randInt(10_000, 200_000);
    stepDocs.push({
      "@timestamp": offsetTs(base, offsetMs),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: parentId },
      span: {
        id: sid,
        type: "request",
        subtype: "http",
        name: `Workflows.execute ${stepName}`,
        duration: { us: us },
        action: "invoke",
        destination: {
          service: { resource: "workflow_step", type: "request", name: "workflow_step" },
        },
        labels: {
          "gcp.workflows.execution_step": String(i + 1),
          ...(failIdx === i + 1 ? { "gcp.rpc.status_code": "DEADLINE_EXCEEDED" } : {}),
        },
      },
      service: svc,
      cloud,
      data_stream: APM_DS,
      event: { outcome: failIdx === i + 1 ? "failure" : "success" },
      ...otel,
      ...gcpCloudTraceMeta(project.id, traceId, sid),
    });
    offsetMs += Math.max(1, Math.round(us / 1000));
    parentId = sid;
  }

  const sDone = randSpanId();
  const spanComplete: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: parentId },
    span: {
      id: sDone,
      type: "app",
      subtype: "workflows",
      name: "Workflows.completion",
      duration: { us: uComplete },
      action: "process",
      destination: { service: { resource: "workflows", type: "app", name: "workflows" } },
      labels: failIdx === stepCount + 1 ? { "gcp.rpc.status_code": "INTERNAL" } : {},
    },
    service: svc,
    cloud,
    data_stream: APM_DS,
    event: { outcome: failIdx === stepCount + 1 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, sDone),
  };

  const started = 1 + stepCount + 1;
  const totalUs =
    uTrigger +
    uSteps.slice(0, stepCount).reduce((a, b) => a + b, 0) +
    uComplete +
    randInt(300, 4000) * 1000;
  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `Workflow ${workflow}`,
      type: "request",
      duration: { us: totalUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started, dropped: 0 },
    },
    service: svc,
    cloud,
    labels: { "gcp.workflows.name": workflow, "gcp.workflows.step_count": String(stepCount) },
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, spanTrigger, ...stepDocs, spanComplete];
}
