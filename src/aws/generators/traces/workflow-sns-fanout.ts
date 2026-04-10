/**
 * SNS fan-out workflow trace generator.
 *
 * Simulates an event-driven fan-out pattern where an API Gateway receives an
 * event, invokes a publisher Lambda that publishes to SNS, which then fans out
 * concurrently to three subscriber Lambda functions.
 *
 * Topology:
 *   TX: api-events (API Gateway / nodejs20.x)
 *     └── SPAN: Lambda.Invoke event-publisher
 *          └── TX: event-publisher (Lambda / python3.12, pubsub trigger)
 *               └── SPAN: SNS.Publish events-notifications-${topic}
 *                    ├── TX: order-processor-subscriber (Lambda / python3.12, pubsub trigger)
 *                    │    └── SPAN: DynamoDB.PutItem orders
 *                    ├── TX: notification-subscriber (Lambda / python3.12, pubsub trigger)
 *                    │    └── SPAN: SES.SendEmail
 *                    └── TX: audit-archiver-subscriber (Lambda / nodejs20.x, pubsub trigger)
 *                         └── SPAN: S3.PutObject audit-logs
 *
 * Lambda instrumentation options (selected randomly per trace):
 *   EDOT: Elastic Distro for OTel — telemetry.distro.name = "elastic"
 *   ADOT: AWS Distro for OTel   — telemetry.distro.name = "aws-otel"
 *         ADOT traces also carry aws.xray.trace_id / aws.xray.segment_id labels
 *         so the same invocation is findable in both APM and X-Ray.
 *
 * Cold start (~8 % of Lambda invocations):
 *   When faas.coldstart is true an extra "Lambda init" span is emitted as a
 *   child of the Lambda transaction. The TX duration is inflated to include init.
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
import type {
  WorkflowCloudBlock,
  WorkflowTxDocArgs,
  WorkflowSpanDocArgs,
  WorkflowErrorDocArgs,
} from "./workflow-internal.js";

// ─── Shared constants ─────────────────────────────────────────────────────────

const ENVS = ["production", "production", "staging", "dev"];

const RUNTIME_VERSION = {
  "python3.11": "3.11.9",
  "python3.12": "3.12.3",
  "nodejs18.x": "18.20.4",
  "nodejs20.x": "20.15.1",
  java21: "21.0.3",
} as const;

// ─── Low-level document builders ─────────────────────────────────────────────

/**
 * Build a transaction document for a service entry point.
 * `parentId` is undefined for the root service; set it to the invoking span ID
 * for downstream services so APM can stitch the distributed trace.
 */
function txDoc({
  ts,
  traceId,
  txId,
  parentId,
  serviceName,
  environment,
  language,
  runtime,
  framework,
  txType,
  txName,
  durationUs,
  isErr,
  spanCount,
  cloud,
  faas,
  labels,
  distro = "elastic",
}: WorkflowTxDocArgs) {
  const svcBlock = serviceBlock(
    serviceName,
    environment,
    language,
    framework ?? null,
    runtime,
    RUNTIME_VERSION[runtime as keyof typeof RUNTIME_VERSION] ?? "1.0.0"
  );
  const { agent, telemetry } = otelBlocks(language, distro);

  return {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    ...(parentId ? { parent: { id: parentId } } : {}),
    transaction: {
      id: txId,
      name: txName,
      type: txType,
      duration: { us: durationUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: spanCount ?? 1, dropped: 0 },
      ...(faas ? { faas: faas } : {}),
    },
    ...(faas ? { faas: faas } : {}),
    service: svcBlock,
    agent: agent,
    telemetry: telemetry,
    cloud: cloud,
    ...(labels || distro === "aws"
      ? {
          labels: {
            ...(labels ?? {}),
            ...(distro === "aws"
              ? {
                  "aws.xray.trace_id": `1-${randHex(8)}-${randHex(24)}`,
                  "aws.xray.segment_id": randHex(16),
                }
              : {}),
          },
        }
      : {}),
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };
}

/**
 * Build a span document.
 * `txId`     = the transaction this span belongs to (for grouping in APM).
 * `parentId` = the immediate parent (could be txId or another span's id).
 */
function spanDoc({
  ts,
  traceId,
  txId,
  parentId,
  spanId,
  spanType,
  spanSubtype,
  spanName,
  spanAction,
  durationUs,
  isErr,
  db,
  destination,
  labels,
  serviceName,
  environment,
  language,
  runtime,
  distro = "elastic",
}: WorkflowSpanDocArgs) {
  const svcBlock = serviceBlock(
    serviceName,
    environment,
    language,
    null,
    runtime,
    RUNTIME_VERSION[runtime as keyof typeof RUNTIME_VERSION] ?? "1.0.0"
  );
  const { agent, telemetry } = otelBlocks(language, distro);

  return {
    "@timestamp": ts,
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: parentId },
    span: {
      id: spanId,
      type: spanType,
      subtype: spanSubtype,
      name: spanName,
      duration: { us: durationUs },
      action: spanAction,
      ...(db ? { db: db } : {}),
      ...(destination
        ? { destination: { service: { resource: destination, type: spanType, name: destination } } }
        : {}),
    },
    service: svcBlock,
    agent: agent,
    telemetry: telemetry,
    ...(labels ? { labels: labels } : {}),
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };
}

/** Build the standard AWS cloud block. */
function cloudBlock(
  region: string,
  account: { id: string; name: string },
  awsService: string
): WorkflowCloudBlock {
  return {
    provider: "aws",
    region: region,
    account: { id: account.id, name: account.name },
    service: { name: awsService },
  };
}

/**
 * Build an APM error document.
 * Errors land in logs-apm.error-* (data_stream.type = "logs").
 * The parent.id ties the error to the tx or span where it occurred.
 */
function errorDoc({
  ts,
  traceId,
  txId,
  txType,
  parentId,
  exceptionType,
  exceptionMessage,
  culprit,
  handled = false,
  frames = [],
  serviceName,
  environment,
  language,
  runtime,
  distro = "elastic",
}: WorkflowErrorDocArgs) {
  const svcBlock = serviceBlock(
    serviceName,
    environment,
    language,
    null,
    runtime,
    RUNTIME_VERSION[runtime as keyof typeof RUNTIME_VERSION] ?? "1.0.0"
  );
  const { agent, telemetry } = otelBlocks(language, distro);
  return {
    "@timestamp": ts,
    processor: { name: "error", event: "error" },
    trace: { id: traceId },
    transaction: { id: txId, type: txType, sampled: true },
    parent: { id: parentId },
    error: {
      id: randHex(32),
      grouping_key: randHex(32),
      culprit,
      exception: [
        {
          type: exceptionType,
          message: exceptionMessage,
          handled,
          stacktrace: frames,
        },
      ],
    },
    service: svcBlock,
    agent,
    telemetry,
    data_stream: { type: "logs", dataset: "apm.error", namespace: "default" },
  };
}

// ─── Stacktrace frame sets ────────────────────────────────────────────────────

const FRAMES = {
  // Python Lambda — task timeout (Runtime.ExitError)
  python_timeout: (fn: string) => [
    { function: "handler", filename: `${fn}.py`, lineno: 47, library_frame: false },
    { function: "_execute", filename: `${fn}.py`, lineno: 31, library_frame: false },
    { function: "invoke", filename: "botocore/endpoint.py", lineno: 174, library_frame: true },
  ],
  // Python — DynamoDB ProvisionedThroughputExceededException
  python_dynamo_throttle: (fn: string) => [
    {
      function: "_make_api_call",
      filename: "botocore/client.py",
      lineno: 960,
      library_frame: true,
    },
    {
      function: "_convert_input_params",
      filename: "botocore/serialize.py",
      lineno: 289,
      library_frame: true,
    },
    { function: "write_record", filename: `${fn}.py`, lineno: 38, library_frame: false },
    { function: "handler", filename: `${fn}.py`, lineno: 14, library_frame: false },
  ],
};

// ─── Utility helpers ──────────────────────────────────────────────────────────

/**
 * Cold start init duration by runtime. JVM classloading (java21) takes 2–8 s;
 * Python and Node cold starts are 300 ms–2.5 s and 150 ms–1.2 s respectively.
 * Only called when faas.coldstart is true (~8 % of invocations).
 */
function coldStartInitUs(runtime: string) {
  if (runtime === "java21") return randInt(2000, 8000) * 1000;
  if (runtime === "nodejs18.x" || runtime === "nodejs20.x") return randInt(150, 1200) * 1000;
  return randInt(300, 2500) * 1000; // Python default
}

/** Build a FaaS block for Lambda transactions. */
function faasBlock(funcName: string, region: string, accountId: string, trigger = "other") {
  const executionId = `${randHex(8)}-${randHex(4)}-${randHex(4)}-${randHex(4)}-${randHex(12)}`;
  const coldStart = Math.random() < 0.08;
  return {
    name: funcName,
    id: `arn:aws:lambda:${region}:${accountId}:function:${funcName}`,
    version: "$LATEST",
    coldstart: coldStart,
    execution: executionId,
    trigger: { type: trigger },
  };
}

// ─── SNS Fan-out Workflow ─────────────────────────────────────────────────────
//
//  TX: api-events (API Gateway / nodejs20.x)
//    └── SPAN: Lambda.Invoke event-publisher
//         └── TX: event-publisher (Lambda / python3.12, pubsub trigger)
//              └── SPAN: SNS.Publish events-notifications-${topic}
//                   ├── TX: order-processor-subscriber (Lambda / python3.12, pubsub trigger)
//                   │    └── SPAN: DynamoDB.PutItem orders
//                   ├── TX: notification-subscriber (Lambda / python3.12, pubsub trigger)
//                   │    └── SPAN: SES.SendEmail
//                   └── TX: audit-archiver-subscriber (Lambda / nodejs20.x, pubsub trigger)
//                        └── SPAN: S3.PutObject audit-logs

function workflowSnsEventFanout(ts: string, er: number) {
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const env = rand(ENVS);
  const isErr = Math.random() < er;
  const base = new Date(ts);
  const traceId = newTraceId();
  const lambdaDistro = rand(["elastic", "aws"]);

  const snsTopic = rand(["order-events", "user-activity", "inventory-changes"]);
  const snsTopicName = `events-notifications-${snsTopic}`;

  // Helper to generate an SNS subscription ARN
  const snsSubscriptionArn = (_subscriberName: string) =>
    `arn:aws:sns:${region}:${account.id}:${snsTopicName}:${randHex(8)}-${randHex(4)}-${randHex(4)}-${randHex(4)}-${randHex(12)}`;

  // Helper to generate an SQS-style message ID (used on SNS-triggered Lambdas)
  const newMsgId = () => `${randHex(8)}-${randHex(4)}-${randHex(4)}-${randHex(4)}-${randHex(12)}`;

  // ── Span / TX IDs ────────────────────────────────────────────────────────────
  const apiEventsTxId = newSpanId();
  const lambdaInvokeSpanId = newSpanId();
  const eventPublisherTxId = newSpanId();
  const snsPublishSpanId = newSpanId();

  const orderProcessorTxId = newSpanId();
  const dynamoPutSpanId = newSpanId();

  const notificationTxId = newSpanId();
  const sesSpanId = newSpanId();

  const auditArchiverTxId = newSpanId();
  const s3PutSpanId = newSpanId();

  // ── Durations (µs) ───────────────────────────────────────────────────────────
  const sesUs = randInt(80, 300) * 1000;
  const s3PutUs = randInt(20, 100) * 1000;
  const dynamoPutUs = randInt(5, 40) * 1000;
  const snsPublishUs = randInt(30, 150) * 1000;

  // Subscriber total durations (Lambda exec wrapping their child span)
  const orderProcessorExecUs = dynamoPutUs + randInt(50, 260) * 1000;
  const notificationExecUs = sesUs + randInt(20, 80) * 1000;
  const auditArchiverExecUs = s3PutUs + randInt(30, 120) * 1000;

  // event-publisher exec time: SNS publish + small overhead
  const eventPublisherExecUs = snsPublishUs + randInt(20, 80) * 1000;

  // Lambda invoke span wraps event-publisher
  const lambdaInvUs = eventPublisherExecUs + randInt(20, 60) * 1000;

  // API Gateway total: wraps Lambda invoke + overhead
  const apiEventsTotalUs = lambdaInvUs + randInt(30, 100) * 1000;

  // ── Timestamp offsets (ms from base) ─────────────────────────────────────────
  // base+0ms: api-events TX timestamp (toISOString of base)
  // base+2ms: api-events TX (root) — use 2ms as the api-events root offset
  const apiEventsOffset = 2;
  const lambdaInvokeOffset = 3;
  const eventPublisherOffset = 5;
  const snsPublishOffset = 6;
  const subscriberStartOffset = 10; // all 3 subscribers start concurrently
  const subscriberSpanOffset = 11; // DynamoDB, SES, S3 spans start 1ms after their TX

  // ── Cloud blocks ─────────────────────────────────────────────────────────────
  const apigwCloud = cloudBlock(region, account, "apigateway");
  const lambdaCloud = cloudBlock(region, account, "lambda");

  type SnsFanoutTraceDoc =
    | ReturnType<typeof txDoc>
    | ReturnType<typeof spanDoc>
    | ReturnType<typeof errorDoc>;
  const docs: SnsFanoutTraceDoc[] = [];

  // ── 1. TX — api-events root (API Gateway, nodejs20.x) ────────────────────────
  docs.push(
    txDoc({
      ts: offsetTs(base, apiEventsOffset),
      traceId,
      txId: apiEventsTxId,
      // no parentId — this is the root TX
      serviceName: "api-events",
      environment: env,
      language: "nodejs",
      runtime: "nodejs20.x",
      framework: "AWS API Gateway",
      txType: "request",
      txName: "POST /events",
      durationUs: apiEventsTotalUs,
      isErr,
      spanCount: 1,
      cloud: apigwCloud,
    })
  );

  // ── 2. SPAN — API GW invokes event-publisher Lambda ──────────────────────────
  docs.push(
    spanDoc({
      ts: offsetTs(base, lambdaInvokeOffset),
      traceId,
      txId: apiEventsTxId,
      parentId: apiEventsTxId,
      spanId: lambdaInvokeSpanId,
      spanType: "external",
      spanSubtype: "lambda",
      spanName: "Lambda invoke event-publisher",
      spanAction: "invoke",
      durationUs: lambdaInvUs,
      isErr: false,
      destination: "lambda",
      serviceName: "api-events",
      environment: env,
      language: "nodejs",
      runtime: "nodejs20.x",
    })
  );

  // ── 3. TX — event-publisher Lambda (parent = invoke span) ────────────────────
  const eventPublisherFaas = faasBlock("event-publisher", region, account.id, "pubsub");
  const eventPublisherInitUs = eventPublisherFaas.coldstart ? coldStartInitUs("python3.12") : 0;
  docs.push(
    txDoc({
      ts: offsetTs(base, eventPublisherOffset),
      traceId,
      txId: eventPublisherTxId,
      parentId: lambdaInvokeSpanId,
      serviceName: "event-publisher",
      environment: env,
      language: "python",
      runtime: "python3.12",
      framework: "AWS Lambda",
      txType: "pubsub",
      txName: "event-publisher",
      durationUs: eventPublisherExecUs + eventPublisherInitUs,
      isErr,
      spanCount: 1,
      cloud: lambdaCloud,
      faas: eventPublisherFaas,
      distro: lambdaDistro,
      labels: {
        sqs_message_id: newMsgId(),
      },
    })
  );
  if (eventPublisherFaas.coldstart) {
    docs.push(
      spanDoc({
        ts: offsetTs(base, eventPublisherOffset),
        traceId,
        txId: eventPublisherTxId,
        parentId: eventPublisherTxId,
        spanId: newSpanId(),
        spanType: "app",
        spanSubtype: "cold-start",
        spanName: "Lambda init: event-publisher",
        spanAction: "init",
        durationUs: eventPublisherInitUs,
        isErr: false,
        serviceName: "event-publisher",
        environment: env,
        language: "python",
        runtime: "python3.12",
        distro: lambdaDistro,
      })
    );
  }

  // ── 4. SPAN — SNS.Publish ─────────────────────────────────────────────────────
  docs.push(
    spanDoc({
      ts: offsetTs(base, snsPublishOffset),
      traceId,
      txId: eventPublisherTxId,
      parentId: eventPublisherTxId,
      spanId: snsPublishSpanId,
      spanType: "messaging",
      spanSubtype: "sns",
      spanName: `SNS.Publish ${snsTopicName}`,
      spanAction: "publish",
      durationUs: snsPublishUs,
      isErr: false,
      destination: "sns",
      labels: { sns_topic_name: snsTopicName },
      serviceName: "event-publisher",
      environment: env,
      language: "python",
      runtime: "python3.12",
      distro: lambdaDistro,
    })
  );

  // ── 5. TX — order-processor-subscriber Lambda ─────────────────────────────────
  const orderProcessorFaas = faasBlock("order-processor-subscriber", region, account.id, "pubsub");
  const orderProcessorInitUs = orderProcessorFaas.coldstart ? coldStartInitUs("python3.12") : 0;
  docs.push(
    txDoc({
      ts: offsetTs(base, subscriberStartOffset),
      traceId,
      txId: orderProcessorTxId,
      parentId: snsPublishSpanId,
      serviceName: "order-processor-subscriber",
      environment: env,
      language: "python",
      runtime: "python3.12",
      framework: "AWS Lambda",
      txType: "pubsub",
      txName: "order-processor-subscriber",
      durationUs: orderProcessorExecUs + orderProcessorInitUs,
      isErr,
      spanCount: 1,
      cloud: lambdaCloud,
      faas: orderProcessorFaas,
      distro: lambdaDistro,
      labels: {
        sqs_message_id: newMsgId(),
        sns_subscription_arn: snsSubscriptionArn("order-processor-subscriber"),
      },
    })
  );
  if (orderProcessorFaas.coldstart) {
    docs.push(
      spanDoc({
        ts: offsetTs(base, subscriberStartOffset),
        traceId,
        txId: orderProcessorTxId,
        parentId: orderProcessorTxId,
        spanId: newSpanId(),
        spanType: "app",
        spanSubtype: "cold-start",
        spanName: "Lambda init: order-processor-subscriber",
        spanAction: "init",
        durationUs: orderProcessorInitUs,
        isErr: false,
        serviceName: "order-processor-subscriber",
        environment: env,
        language: "python",
        runtime: "python3.12",
        distro: lambdaDistro,
      })
    );
  }

  // ── 6. SPAN — DynamoDB.PutItem (order-processor-subscriber) ──────────────────
  docs.push(
    spanDoc({
      ts: offsetTs(base, subscriberSpanOffset),
      traceId,
      txId: orderProcessorTxId,
      parentId: orderProcessorTxId,
      spanId: dynamoPutSpanId,
      spanType: "db",
      spanSubtype: "dynamodb",
      spanName: "DynamoDB.PutItem orders",
      spanAction: "PutItem",
      durationUs: dynamoPutUs,
      isErr,
      db: { type: "nosql", statement: "PutItem orders" },
      destination: "dynamodb",
      serviceName: "order-processor-subscriber",
      environment: env,
      language: "python",
      runtime: "python3.12",
      distro: lambdaDistro,
    })
  );

  // ── 7. TX — notification-subscriber Lambda ────────────────────────────────────
  const notificationFaas = faasBlock("notification-subscriber", region, account.id, "pubsub");
  const notificationInitUs = notificationFaas.coldstart ? coldStartInitUs("python3.12") : 0;
  docs.push(
    txDoc({
      ts: offsetTs(base, subscriberStartOffset),
      traceId,
      txId: notificationTxId,
      parentId: snsPublishSpanId,
      serviceName: "notification-subscriber",
      environment: env,
      language: "python",
      runtime: "python3.12",
      framework: "AWS Lambda",
      txType: "pubsub",
      txName: "notification-subscriber",
      durationUs: notificationExecUs + notificationInitUs,
      isErr: false,
      spanCount: 1,
      cloud: lambdaCloud,
      faas: notificationFaas,
      distro: lambdaDistro,
      labels: {
        sqs_message_id: newMsgId(),
        sns_subscription_arn: snsSubscriptionArn("notification-subscriber"),
      },
    })
  );
  if (notificationFaas.coldstart) {
    docs.push(
      spanDoc({
        ts: offsetTs(base, subscriberStartOffset),
        traceId,
        txId: notificationTxId,
        parentId: notificationTxId,
        spanId: newSpanId(),
        spanType: "app",
        spanSubtype: "cold-start",
        spanName: "Lambda init: notification-subscriber",
        spanAction: "init",
        durationUs: notificationInitUs,
        isErr: false,
        serviceName: "notification-subscriber",
        environment: env,
        language: "python",
        runtime: "python3.12",
        distro: lambdaDistro,
      })
    );
  }

  // ── 8. SPAN — SES.SendEmail (notification-subscriber) ────────────────────────
  docs.push(
    spanDoc({
      ts: offsetTs(base, subscriberSpanOffset),
      traceId,
      txId: notificationTxId,
      parentId: notificationTxId,
      spanId: sesSpanId,
      spanType: "messaging",
      spanSubtype: "ses",
      spanName: "SES.SendEmail",
      spanAction: "send",
      durationUs: sesUs,
      isErr: false,
      destination: "ses",
      serviceName: "notification-subscriber",
      environment: env,
      language: "python",
      runtime: "python3.12",
      distro: lambdaDistro,
    })
  );

  // ── 9. TX — audit-archiver-subscriber Lambda ──────────────────────────────────
  const auditArchiverFaas = faasBlock("audit-archiver-subscriber", region, account.id, "pubsub");
  const auditArchiverInitUs = auditArchiverFaas.coldstart ? coldStartInitUs("nodejs20.x") : 0;
  docs.push(
    txDoc({
      ts: offsetTs(base, subscriberStartOffset),
      traceId,
      txId: auditArchiverTxId,
      parentId: snsPublishSpanId,
      serviceName: "audit-archiver-subscriber",
      environment: env,
      language: "nodejs",
      runtime: "nodejs20.x",
      framework: "AWS Lambda",
      txType: "pubsub",
      txName: "audit-archiver-subscriber",
      durationUs: auditArchiverExecUs + auditArchiverInitUs,
      isErr: false,
      spanCount: 1,
      cloud: lambdaCloud,
      faas: auditArchiverFaas,
      distro: lambdaDistro,
      labels: {
        sqs_message_id: newMsgId(),
        sns_subscription_arn: snsSubscriptionArn("audit-archiver-subscriber"),
      },
    })
  );
  if (auditArchiverFaas.coldstart) {
    docs.push(
      spanDoc({
        ts: offsetTs(base, subscriberStartOffset),
        traceId,
        txId: auditArchiverTxId,
        parentId: auditArchiverTxId,
        spanId: newSpanId(),
        spanType: "app",
        spanSubtype: "cold-start",
        spanName: "Lambda init: audit-archiver-subscriber",
        spanAction: "init",
        durationUs: auditArchiverInitUs,
        isErr: false,
        serviceName: "audit-archiver-subscriber",
        environment: env,
        language: "nodejs",
        runtime: "nodejs20.x",
        distro: lambdaDistro,
      })
    );
  }

  // ── 10. SPAN — S3.PutObject (audit-archiver-subscriber) ──────────────────────
  docs.push(
    spanDoc({
      ts: offsetTs(base, subscriberSpanOffset),
      traceId,
      txId: auditArchiverTxId,
      parentId: auditArchiverTxId,
      spanId: s3PutSpanId,
      spanType: "storage",
      spanSubtype: "s3",
      spanName: "S3.PutObject audit-logs",
      spanAction: "PutObject",
      durationUs: s3PutUs,
      isErr: false,
      destination: "s3",
      serviceName: "audit-archiver-subscriber",
      environment: env,
      language: "nodejs",
      runtime: "nodejs20.x",
      distro: lambdaDistro,
    })
  );

  // ── Error document — order-processor-subscriber DynamoDB throttle ─────────────
  if (isErr) {
    docs.push(
      errorDoc({
        ts: offsetTs(base, subscriberSpanOffset + dynamoPutUs / 1000 - 1),
        traceId,
        txId: orderProcessorTxId,
        txType: "pubsub",
        parentId: dynamoPutSpanId,
        exceptionType: "ProvisionedThroughputExceededException",
        exceptionMessage:
          "An error occurred (ProvisionedThroughputExceededException) when calling the PutItem operation: The level of configured provisioned throughput for the table was exceeded.",
        culprit: "write_record in order_processor_subscriber.py",
        handled: false,
        frames: FRAMES.python_dynamo_throttle("order_processor_subscriber"),
        serviceName: "order-processor-subscriber",
        environment: env,
        language: "python",
        runtime: "python3.12",
        distro: lambdaDistro,
      })
    );
  }

  return docs;
}

// ─── Public exports ───────────────────────────────────────────────────────────

/** SNS fan-out: API Gateway → Lambda → SNS Publish → 3× Lambda subscribers (concurrent) */
export function generateSnsEventFanoutTrace(ts: string, er: number) {
  return workflowSnsEventFanout(ts, er);
}
