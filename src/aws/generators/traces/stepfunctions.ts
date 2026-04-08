/**
 * Step Functions OTel trace generator.
 *
 * Simulates AWS Step Functions state machine executions instrumented via the
 * AWS SDK OTel instrumentation on the calling application (typically a Python
 * Lambda orchestrator). Produces one APM transaction document (the
 * ExecuteStateMachine call) plus one span per state in the execution.
 *
 * Real-world instrumentation path:
 *   Python Lambda (orchestrator) + EDOT OTel layer
 *     → OTLP gRPC/HTTP → Elastic APM Server / OTel Collector
 *       → traces-apm-default
 */

import {
  TRACE_REGIONS,
  TRACE_ACCOUNTS,
  randHex,
  newTraceId,
  newSpanId,
  rand,
  randInt,
  offsetTs,
  serviceBlock,
  otelBlocks,
} from "./helpers.js";

// ─── State machine definitions ────────────────────────────────────────────────
// Each config lists the ordered states that will execute, plus optional
// lambda function names for Task states that invoke Lambda.
const MACHINE_CONFIGS = [
  {
    name: "OrderProcessingWorkflow",
    states: [
      { name: "ValidateOrder", type: "Task", lambda: "order-validator" },
      { name: "CheckInventory", type: "Task", lambda: "inventory-checker" },
      { name: "InStockChoice", type: "Choice" },
      { name: "ProcessPayment", type: "Task", lambda: "payment-processor" },
      { name: "UpdateInventory", type: "Task", lambda: "inventory-updater" },
      { name: "SendConfirmation", type: "Task", lambda: "notification-sender" },
    ],
    failState: { name: "OutOfStock", type: "Task", lambda: null },
  },
  {
    name: "DataIngestionPipeline",
    states: [
      { name: "FetchFromS3", type: "Task", lambda: "s3-fetcher" },
      { name: "TransformData", type: "Task", lambda: "data-transformer" },
      { name: "ValidateSchema", type: "Task", lambda: "schema-validator" },
      { name: "LoadToDynamoDB", type: "Task", lambda: "dynamo-loader" },
      { name: "NotifyCompletion", type: "Task", lambda: "notification-sender" },
    ],
    failState: null,
  },
  {
    name: "UserOnboardingWorkflow",
    states: [
      { name: "CreateAccount", type: "Task", lambda: "account-creator" },
      { name: "SendVerificationEmail", type: "Task", lambda: "notification-sender" },
      { name: "WaitForVerification", type: "Wait" },
      { name: "CheckVerified", type: "Task", lambda: "verification-checker" },
      { name: "VerifiedChoice", type: "Choice" },
      { name: "ActivateAccount", type: "Task", lambda: "account-activator" },
    ],
    failState: null,
  },
  {
    name: "MLTrainingPipeline",
    states: [
      { name: "PrepareDataset", type: "Task", lambda: "dataset-preparer" },
      { name: "TrainModel", type: "Task", lambda: "model-trainer" },
      { name: "EvaluateModel", type: "Task", lambda: "model-evaluator" },
      { name: "AccuracyChoice", type: "Choice" },
      { name: "DeployModel", type: "Task", lambda: "model-deployer" },
    ],
    failState: { name: "RejectModel", type: "Task", lambda: null },
  },
  {
    name: "BackupWorkflow",
    states: [
      { name: "TriggerBackup", type: "Task", lambda: "backup-trigger" },
      { name: "WaitForBackup", type: "Wait" },
      { name: "VerifyBackup", type: "Task", lambda: "backup-verifier" },
      { name: "TagResource", type: "Task", lambda: "resource-tagger" },
    ],
    failState: null,
  },
];

// Convert PascalCase machine name to kebab-case service name.
function toKebabCase(name) {
  return name
    .replace(/([A-Z])/g, (_m, c, i) => (i === 0 ? c : "-" + c).toLowerCase())
    .toLowerCase();
}

/**
 * Generates a Step Functions OTel trace: 1 transaction + N state spans.
 * @param {string} ts  - ISO timestamp string (base time for the execution start)
 * @param {number} er  - error rate 0.0–1.0
 * @returns {Object[]} array of APM documents (transaction first, then spans)
 */
export function generateStepFunctionsTrace(ts, er) {
  const cfg = rand(MACHINE_CONFIGS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const isErr = Math.random() < er;
  const env = rand(["production", "production", "staging", "dev"]);

  // When the trace is an error and there is a failState, execute that path
  // instead of the last normal state.
  const executedStates =
    isErr && cfg.failState ? [...cfg.states.slice(0, -1), cfg.failState] : cfg.states;

  // Total workflow duration: 5 s – 15 min in µs
  const totalUs = randInt(5_000, 900_000) * 1000;

  const machineName = cfg.name;
  const executionId = randHex(8);
  const executionArn = `arn:aws:states:${region}:${account.id}:execution:${machineName}:${executionId}`;
  const machineArn = `arn:aws:states:${region}:${account.id}:stateMachine:${machineName}`;
  const execStatus = isErr ? "FAILED" : "SUCCEEDED";

  // Shared labels applied to every document in the trace.
  const sharedLabels = {
    execution_arn: executionArn,
    state_machine_arn: machineArn,
    execution_status: execStatus,
  };

  const serviceName = toKebabCase(machineName);
  const svcBlock = serviceBlock(serviceName, env, "python", undefined, "python", "3.12.3");
  const { agent, telemetry } = otelBlocks("python", "elastic");

  const cloudBlock = {
    provider: "aws",
    region,
    account: { id: account.id, name: account.name },
    service: { name: "states" },
  };

  // ── Root transaction (ExecuteStateMachine call) ──────────────────────────────
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: machineName,
      type: "workflow",
      duration: { us: totalUs },
      result: execStatus,
      sampled: true,
      span_count: { started: executedStates.length, dropped: 0 },
    },
    labels: { ...sharedLabels },
    service: svcBlock,
    agent: agent,
    telemetry: telemetry,
    cloud: cloudBlock,
    event: { outcome: isErr ? "failure" : "success" },
    message: isErr ? "Execution failed" : "Execution succeeded",
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  // ── State spans ──────────────────────────────────────────────────────────────
  // Distribute total duration across states (sequential, with small gaps).
  const spans: any[] = [];
  let offsetMs = 0;
  const stateUsSlice = Math.floor(totalUs / executedStates.length);

  for (let i = 0; i < executedStates.length; i++) {
    const state = executedStates[i];
    const spanId = newSpanId();
    // Each state takes between 20% and 90% of its time slice
    const spanUs = randInt(Math.floor(stateUsSlice * 0.2), Math.floor(stateUsSlice * 0.9));
    const spanIsErr = isErr && i === executedStates.length - 1;
    const stateLabels = {
      ...sharedLabels,
      state_type: state.type,
      ...(state.lambda ? { lambda_function_name: state.lambda } : {}),
    };

    const spanDoc = {
      "@timestamp": offsetTs(new Date(ts), offsetMs),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: spanId,
        type: "workflow",
        subtype: "stepfunctions",
        name: state.name,
        duration: { us: spanUs },
      },
      labels: stateLabels,
      service: svcBlock,
      agent: agent,
      telemetry: telemetry,
      cloud: cloudBlock,
      event: { outcome: spanIsErr ? "failure" : "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    };

    spans.push(spanDoc);
    offsetMs += spanUs / 1000 + randInt(10, 200); // small gap between states (ms)
  }

  return [txDoc, ...spans];
}
