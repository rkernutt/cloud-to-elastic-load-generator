/**
 * Multi-service workflow trace generator.
 *
 * Each call produces a correlated set of APM documents (transactions + spans)
 * that all share ONE trace.id, simulating a real distributed request flowing
 * through multiple AWS services. The resulting flame graph in Elastic APM will
 * show the full end-to-end chain.
 *
 * Five core workflow patterns are defined in this module; data-pipeline traces
 * (S3→SQS chain and EventBridge→Step Functions) live in `workflow-pipelines.js`.
 *
 * Workflow patterns supported here:
 *
 *   1. E-commerce Order Flow
 *      API Gateway → Lambda (order-processor) → DynamoDB + SQS
 *        → Lambda (notification-sender) → SES
 *
 *   2. ML Inference Pipeline
 *      API Gateway → Lambda (inference-router) → S3 + Bedrock
 *        → DynamoDB (results cache)
 *
 *   3. Data Ingestion Pipeline
 *      Kinesis (producer) → Lambda (stream-processor) → S3 + Glue
 *        → EMR (etl-job) with Spark stage spans
 *
 *   4. Step Functions Orchestration
 *      EventBridge → Step Functions → Lambda (validate) → DynamoDB
 *        → Lambda (payment) → RDS → Lambda (notification) → SES
 *
 *   5. Cascading Failure
 *      API Gateway (api-payments) → Lambda (payment-handler)
 *        → DynamoDB throttle (×2 retries) → SQS DLQ
 *        → Lambda (dlq-processor) → DynamoDB (success on 3rd attempt)
 *
 * Real-world instrumentation path:
 *   Each service runs its own OTel SDK instance (EDOT layer / EDOT Java agent).
 *   W3C traceparent header carries the same trace.id across HTTP / SDK calls.
 *   OTLP → Elastic APM Server → traces-apm-default
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
 *
 * (Data pipeline DLQ / Glue / Redshift / SageMaker patterns — see workflow-pipelines.js.)
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
import {
  ENVS,
  txDoc,
  spanDoc,
  cloudBlock,
  errorDoc,
  FRAMES,
  coldStartInitUs,
  faasBlock,
} from "./workflow-internal.js";

// ─── Workflow 1: E-commerce Order Flow ───────────────────────────────────────
//
//  API Gateway (api-orders)
//    └── SPAN: Lambda invoke → order-processor
//         └── TX: order-processor (Lambda)
//              ├── SPAN: DynamoDB.PutItem
//              └── SPAN: SQS.SendMessage
//                   └── TX: notification-sender (Lambda)
//                        └── SPAN: SES.SendEmail

function workflowEcommerceOrder(ts, er) {
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const env = rand(ENVS);
  const isErr = Math.random() < er;
  const base = new Date(ts);
  const traceId = newTraceId();
  const lambdaDistro = rand(["elastic", "aws"]);

  // Span / TX IDs
  const apigwTxId = newSpanId();
  const lambdaInvokeSpanId = newSpanId();
  const orderProcessorTxId = newSpanId();
  const dynamoSpanId = newSpanId();
  const sqsSpanId = newSpanId();
  const notifTxId = newSpanId();
  const sesSpanId = newSpanId();

  // Durations (µs) — outer wraps inner
  const sesUs = randInt(80, 300) * 1000;
  const notifTotalUs = sesUs + randInt(20, 80) * 1000;
  const sqsUs = randInt(30, 120) * 1000;
  const dynamoUs = randInt(5, 40) * 1000;
  const orderExecUs = dynamoUs + sqsUs + notifTotalUs + randInt(50, 150) * 1000;
  const lambdaInvUs = orderExecUs + randInt(20, 60) * 1000;
  const apigwTotalUs = lambdaInvUs + randInt(30, 100) * 1000;

  // Timestamp offsets (ms)
  const lambdaInvOffset = randInt(2, 10);
  const orderTxOffset = lambdaInvOffset + randInt(1, 5);
  const dynamoOffset = orderTxOffset + randInt(2, 8);
  const sqsOffset = dynamoOffset + dynamoUs / 1000 + randInt(1, 5);
  const notifTxOffset = sqsOffset + sqsUs / 1000 + randInt(5, 20);
  const sesOffset = notifTxOffset + randInt(2, 8);

  const docs: any[] = [];

  // 1. TX — API Gateway root
  docs.push(
    txDoc({
      ts: base.toISOString(),
      traceId,
      txId: apigwTxId,
      serviceName: "api-orders",
      environment: env,
      language: "nodejs",
      runtime: "nodejs20.x",
      framework: "AWS API Gateway",
      txType: "request",
      txName: "POST /orders",
      durationUs: apigwTotalUs,
      isErr,
      spanCount: 1,
      cloud: cloudBlock(region, account, "apigateway"),
    })
  );

  // 2. SPAN — API GW invokes order-processor Lambda
  docs.push(
    spanDoc({
      ts: offsetTs(base, lambdaInvOffset),
      traceId,
      txId: apigwTxId,
      parentId: apigwTxId,
      spanId: lambdaInvokeSpanId,
      spanType: "external",
      spanSubtype: "lambda",
      spanName: "Lambda invoke order-processor",
      spanAction: "invoke",
      durationUs: lambdaInvUs,
      isErr: false,
      destination: "lambda",
      serviceName: "api-orders",
      environment: env,
      language: "nodejs",
      runtime: "nodejs20.x",
    })
  );

  // 3. TX — order-processor Lambda (parent = invoke span)
  const orderFaas = faasBlock("order-processor", region, account.id, "other");
  const orderInitUs = orderFaas.coldstart ? coldStartInitUs("python3.12") : 0;
  docs.push(
    txDoc({
      ts: offsetTs(base, orderTxOffset),
      traceId,
      txId: orderProcessorTxId,
      parentId: lambdaInvokeSpanId,
      serviceName: "order-processor",
      environment: env,
      language: "python",
      runtime: "python3.12",
      framework: "AWS Lambda",
      txType: "lambda",
      txName: "order-processor",
      durationUs: orderExecUs + orderInitUs,
      isErr,
      spanCount: 2,
      cloud: cloudBlock(region, account, "lambda"),
      faas: orderFaas,
      distro: lambdaDistro,
    })
  );
  if (orderFaas.coldstart) {
    docs.push(
      spanDoc({
        ts: offsetTs(base, orderTxOffset),
        traceId,
        txId: orderProcessorTxId,
        parentId: orderProcessorTxId,
        spanId: newSpanId(),
        spanType: "app",
        spanSubtype: "cold-start",
        spanName: "Lambda init: order-processor",
        spanAction: "init",
        durationUs: orderInitUs,
        isErr: false,
        serviceName: "order-processor",
        environment: env,
        language: "python",
        runtime: "python3.12",
        distro: lambdaDistro,
      })
    );
  }

  // 4. SPAN — DynamoDB PutItem
  docs.push(
    spanDoc({
      ts: offsetTs(base, dynamoOffset),
      traceId,
      txId: orderProcessorTxId,
      parentId: orderProcessorTxId,
      spanId: dynamoSpanId,
      spanType: "db",
      spanSubtype: "dynamodb",
      spanName: "DynamoDB.PutItem",
      spanAction: "PutItem",
      durationUs: dynamoUs,
      isErr: false,
      db: { type: "nosql", statement: "PutItem orders" },
      destination: "dynamodb",
      serviceName: "order-processor",
      environment: env,
      language: "python",
      runtime: "python3.12",
      distro: lambdaDistro,
    })
  );

  // 5. SPAN — SQS SendMessage
  docs.push(
    spanDoc({
      ts: offsetTs(base, sqsOffset),
      traceId,
      txId: orderProcessorTxId,
      parentId: orderProcessorTxId,
      spanId: sqsSpanId,
      spanType: "messaging",
      spanSubtype: "sqs",
      spanName: "SQS.SendMessage notification-queue",
      spanAction: "send",
      durationUs: sqsUs,
      isErr: false,
      destination: "sqs",
      labels: { messaging_destination: "notification-queue" },
      serviceName: "order-processor",
      environment: env,
      language: "python",
      runtime: "python3.12",
      distro: lambdaDistro,
    })
  );

  // 6. TX — notification-sender Lambda (parent = SQS span, triggered by queue)
  const notifFaas = faasBlock("notification-sender", region, account.id, "pubsub");
  const notifInitUs = notifFaas.coldstart ? coldStartInitUs("python3.12") : 0;
  docs.push(
    txDoc({
      ts: offsetTs(base, notifTxOffset),
      traceId,
      txId: notifTxId,
      parentId: sqsSpanId,
      serviceName: "notification-sender",
      environment: env,
      language: "python",
      runtime: "python3.12",
      framework: "AWS Lambda",
      txType: "lambda",
      txName: "notification-sender",
      durationUs: notifTotalUs + notifInitUs,
      isErr: false,
      spanCount: 1,
      cloud: cloudBlock(region, account, "lambda"),
      faas: notifFaas,
      labels: {
        sqs_message_id: `${randHex(8)}-${randHex(4)}-${randHex(4)}-${randHex(4)}-${randHex(12)}`,
      },
      distro: lambdaDistro,
    })
  );
  if (notifFaas.coldstart) {
    docs.push(
      spanDoc({
        ts: offsetTs(base, notifTxOffset),
        traceId,
        txId: notifTxId,
        parentId: notifTxId,
        spanId: newSpanId(),
        spanType: "app",
        spanSubtype: "cold-start",
        spanName: "Lambda init: notification-sender",
        spanAction: "init",
        durationUs: notifInitUs,
        isErr: false,
        serviceName: "notification-sender",
        environment: env,
        language: "python",
        runtime: "python3.12",
        distro: lambdaDistro,
      })
    );
  }

  // 7. SPAN — SES SendEmail
  docs.push(
    spanDoc({
      ts: offsetTs(base, sesOffset),
      traceId,
      txId: notifTxId,
      parentId: notifTxId,
      spanId: sesSpanId,
      spanType: "messaging",
      spanSubtype: "ses",
      spanName: "SES.SendEmail",
      spanAction: "send",
      durationUs: sesUs,
      isErr: false,
      destination: "ses",
      serviceName: "notification-sender",
      environment: env,
      language: "python",
      runtime: "python3.12",
      distro: lambdaDistro,
    })
  );

  // Error document — emitted when order-processor fails (DynamoDB throttle or timeout)
  if (isErr) {
    const useDynamoErr = Math.random() < 0.6;
    docs.push(
      errorDoc({
        ts: offsetTs(base, orderTxOffset + orderExecUs / 1000 - 2),
        traceId,
        txId: orderProcessorTxId,
        txType: "lambda",
        parentId: useDynamoErr ? dynamoSpanId : orderProcessorTxId,
        exceptionType: useDynamoErr
          ? "ProvisionedThroughputExceededException"
          : "Runtime.ExitError",
        exceptionMessage: useDynamoErr
          ? "An error occurred (ProvisionedThroughputExceededException) when calling the PutItem operation: The level of configured provisioned throughput for the table was exceeded."
          : `RequestId: ${randHex(8)}-${randHex(4)}-${randHex(4)}-${randHex(4)}-${randHex(12)} Error: Task timed out after 30.00 seconds`,
        culprit: useDynamoErr
          ? "write_record in order_processor.py"
          : "handler in order_processor.py",
        handled: false,
        frames: useDynamoErr
          ? FRAMES.python_dynamo_throttle("order_processor")
          : FRAMES.python_timeout("order_processor"),
        serviceName: "order-processor",
        environment: env,
        language: "python",
        runtime: "python3.12",
        distro: lambdaDistro,
      })
    );
  }

  return docs;
}

// ─── Workflow 2: ML Inference Pipeline ───────────────────────────────────────
//
//  API Gateway (api-ml)
//    └── SPAN: Lambda invoke → inference-router
//         └── TX: inference-router (Lambda)
//              ├── SPAN: S3.GetObject (fetch input data)
//              ├── SPAN: Bedrock.InvokeModel (Claude)
//              └── SPAN: DynamoDB.PutItem (cache result)

function workflowMlInference(ts, er) {
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const env = rand(ENVS);
  const isErr = Math.random() < er;
  const base = new Date(ts);
  const traceId = newTraceId();
  const lambdaDistro = rand(["elastic", "aws"]);

  const BEDROCK_MODELS = [
    "anthropic.claude-3-5-sonnet-20241022-v2:0",
    "anthropic.claude-3-haiku-20240307-v1:0",
    "amazon.titan-text-express-v1",
    "meta.llama3-70b-instruct-v1:0",
  ];

  const apigwTxId = newSpanId();
  const lambdaInvokeSpanId = newSpanId();
  const routerTxId = newSpanId();
  const s3SpanId = newSpanId();
  const bedrockSpanId = newSpanId();
  const dynamoSpanId = newSpanId();

  const bedrockUs = randInt(2000, 15000) * 1000; // 2–15 s for model inference
  const s3Us = randInt(40, 200) * 1000;
  const dynamoCacheUs = randInt(8, 40) * 1000;
  const routerExecUs = s3Us + bedrockUs + dynamoCacheUs + randInt(50, 200) * 1000;
  const lambdaInvUs = routerExecUs + randInt(20, 60) * 1000;
  const apigwTotalUs = lambdaInvUs + randInt(30, 100) * 1000;

  const lambdaInvOffset = randInt(2, 10);
  const routerTxOffset = lambdaInvOffset + randInt(1, 5);
  const s3Offset = routerTxOffset + randInt(2, 8);
  const bedrockOffset = s3Offset + s3Us / 1000 + randInt(2, 10);
  const dynamoOffset = bedrockOffset + bedrockUs / 1000 + randInt(2, 10);

  const model = rand(BEDROCK_MODELS);
  const inputTokens = randInt(128, 4096);
  const outputTokens = randInt(64, 2048);

  const docs: any[] = [];

  // 1. TX — API Gateway root
  docs.push(
    txDoc({
      ts: base.toISOString(),
      traceId,
      txId: apigwTxId,
      serviceName: "api-ml",
      environment: env,
      language: "nodejs",
      runtime: "nodejs20.x",
      framework: "AWS API Gateway",
      txType: "request",
      txName: "POST /inference",
      durationUs: apigwTotalUs,
      isErr,
      spanCount: 1,
      cloud: cloudBlock(region, account, "apigateway"),
    })
  );

  // 2. SPAN — API GW invokes inference-router Lambda
  docs.push(
    spanDoc({
      ts: offsetTs(base, lambdaInvOffset),
      traceId,
      txId: apigwTxId,
      parentId: apigwTxId,
      spanId: lambdaInvokeSpanId,
      spanType: "external",
      spanSubtype: "lambda",
      spanName: "Lambda invoke inference-router",
      spanAction: "invoke",
      durationUs: lambdaInvUs,
      isErr: false,
      destination: "lambda",
      serviceName: "api-ml",
      environment: env,
      language: "nodejs",
      runtime: "nodejs20.x",
    })
  );

  // 3. TX — inference-router Lambda
  const routerFaas = faasBlock("inference-router", region, account.id, "other");
  const routerInitUs = routerFaas.coldstart ? coldStartInitUs("python3.12") : 0;
  docs.push(
    txDoc({
      ts: offsetTs(base, routerTxOffset),
      traceId,
      txId: routerTxId,
      parentId: lambdaInvokeSpanId,
      serviceName: "inference-router",
      environment: env,
      language: "python",
      runtime: "python3.12",
      framework: "AWS Lambda",
      txType: "lambda",
      txName: "inference-router",
      durationUs: routerExecUs + routerInitUs,
      isErr,
      spanCount: 3,
      cloud: cloudBlock(region, account, "lambda"),
      faas: routerFaas,
      distro: lambdaDistro,
    })
  );
  if (routerFaas.coldstart) {
    docs.push(
      spanDoc({
        ts: offsetTs(base, routerTxOffset),
        traceId,
        txId: routerTxId,
        parentId: routerTxId,
        spanId: newSpanId(),
        spanType: "app",
        spanSubtype: "cold-start",
        spanName: "Lambda init: inference-router",
        spanAction: "init",
        durationUs: routerInitUs,
        isErr: false,
        serviceName: "inference-router",
        environment: env,
        language: "python",
        runtime: "python3.12",
        distro: lambdaDistro,
      })
    );
  }

  // 4. SPAN — S3 GetObject (fetch input data)
  docs.push(
    spanDoc({
      ts: offsetTs(base, s3Offset),
      traceId,
      txId: routerTxId,
      parentId: routerTxId,
      spanId: s3SpanId,
      spanType: "storage",
      spanSubtype: "s3",
      spanName: "S3.GetObject",
      spanAction: "GetObject",
      durationUs: s3Us,
      isErr: false,
      destination: "s3",
      labels: { s3_bucket: `${account.name}-ml-input-data` },
      serviceName: "inference-router",
      environment: env,
      language: "python",
      runtime: "python3.12",
      distro: lambdaDistro,
    })
  );

  // 5. SPAN — Bedrock InvokeModel
  docs.push(
    spanDoc({
      ts: offsetTs(base, bedrockOffset),
      traceId,
      txId: routerTxId,
      parentId: routerTxId,
      spanId: bedrockSpanId,
      spanType: "gen_ai",
      spanSubtype: "bedrock",
      spanName: `Bedrock.InvokeModel ${model}`,
      spanAction: "InvokeModel",
      durationUs: bedrockUs,
      isErr: false,
      destination: "bedrock",
      labels: {
        gen_ai_request_model: model,
        gen_ai_usage_input_tokens: String(inputTokens),
        gen_ai_usage_output_tokens: String(outputTokens),
      },
      serviceName: "inference-router",
      environment: env,
      language: "python",
      runtime: "python3.12",
      distro: lambdaDistro,
    })
  );

  // 6. SPAN — DynamoDB PutItem (cache result)
  docs.push(
    spanDoc({
      ts: offsetTs(base, dynamoOffset),
      traceId,
      txId: routerTxId,
      parentId: routerTxId,
      spanId: dynamoSpanId,
      spanType: "db",
      spanSubtype: "dynamodb",
      spanName: "DynamoDB.PutItem",
      spanAction: "PutItem",
      durationUs: dynamoCacheUs,
      isErr: false,
      db: { type: "nosql", statement: "PutItem inference-results-cache" },
      destination: "dynamodb",
      serviceName: "inference-router",
      environment: env,
      language: "python",
      runtime: "python3.12",
      distro: lambdaDistro,
    })
  );

  // Error document — Bedrock throttle (60%) or Lambda timeout (40%)
  if (isErr) {
    const useBedrockErr = Math.random() < 0.6;
    docs.push(
      errorDoc({
        ts: offsetTs(base, routerTxOffset + routerExecUs / 1000 - 2),
        traceId,
        txId: routerTxId,
        txType: "lambda",
        parentId: useBedrockErr ? bedrockSpanId : routerTxId,
        exceptionType: useBedrockErr ? "ThrottlingException" : "Runtime.ExitError",
        exceptionMessage: useBedrockErr
          ? `An error occurred (ThrottlingException) when calling the InvokeModel operation: Rate exceeded for model ${model}`
          : `RequestId: ${randHex(8)}-${randHex(4)}-${randHex(4)}-${randHex(4)}-${randHex(12)} Error: Task timed out after 30.00 seconds`,
        culprit: useBedrockErr
          ? "invoke_model in inference_router.py"
          : "handler in inference_router.py",
        handled: false,
        frames: useBedrockErr
          ? FRAMES.python_bedrock_throttle("inference_router")
          : FRAMES.python_timeout("inference_router"),
        serviceName: "inference-router",
        environment: env,
        language: "python",
        runtime: "python3.12",
        distro: lambdaDistro,
      })
    );
  }

  return docs;
}

// ─── Workflow 3: Data Ingestion Pipeline ─────────────────────────────────────
//
//  Kinesis (kinesis-stream) — producer TX
//    └── TX: stream-processor (Lambda)
//         ├── SPAN: S3.PutObject (archive raw)
//         └── SPAN: Glue.StartJobRun (trigger ETL)
//              └── TX: etl-job (Spark on EMR)
//                   ├── SPAN: Stage 0 (Read Kinesis)
//                   ├── SPAN: Stage 1 (Parse & Validate)
//                   └── SPAN: Stage 2 (Write to S3)

function workflowDataIngestion(ts, er) {
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const env = rand(ENVS);
  const isErr = Math.random() < er;
  const base = new Date(ts);
  const traceId = newTraceId();
  const lambdaDistro = rand(["elastic", "aws"]);

  const STREAM_NAMES = ["clickstream-events", "order-events", "iot-telemetry", "app-logs"];
  const SHARD_IDS = ["shardId-000000000000", "shardId-000000000001", "shardId-000000000002"];
  const ETL_JOBS = ["clickstream-aggregation", "order-enrichment", "telemetry-normalisation"];

  const streamName = rand(STREAM_NAMES);
  const shardId = rand(SHARD_IDS);
  const etlJobName = rand(ETL_JOBS);
  const recordCount = randInt(100, 5000);

  // Spark stage durations (µs)
  const stage0Us = randInt(30, 90) * 1000 * 1000; // Read shard — 30–90 s
  const stage1Us = randInt(10, 40) * 1000 * 1000; // Parse & validate
  const stage2Us = randInt(15, 60) * 1000 * 1000; // Write to S3
  const emrTotalUs = stage0Us + stage1Us + stage2Us + randInt(5, 20) * 1000 * 1000;

  const glueUs = randInt(200, 800) * 1000; // Glue API call itself
  const s3PutUs = randInt(50, 200) * 1000;
  const processorExecUs = s3PutUs + glueUs + randInt(50, 150) * 1000;
  const processorTotalUs = processorExecUs + randInt(20, 80) * 1000;
  const kinesisTxUs = processorTotalUs + emrTotalUs + randInt(100, 500) * 1000;

  // IDs
  const kinesisTxId = newSpanId();
  const processorTxId = newSpanId();
  const s3SpanId = newSpanId();
  const glueSpanId = newSpanId();
  const emrTxId = newSpanId();
  const stage0SpanId = newSpanId();
  const stage1SpanId = newSpanId();
  const stage2SpanId = newSpanId();

  // Offsets (ms)
  const processorTxOffset = randInt(5, 20);
  const s3Offset = processorTxOffset + randInt(2, 8);
  const glueOffset = s3Offset + s3PutUs / 1000 + randInt(2, 8);
  const emrTxOffset = glueOffset + glueUs / 1000 + randInt(500, 2000);
  const stage0Offset = emrTxOffset + randInt(2000, 10000);
  const stage1Offset = stage0Offset + stage0Us / 1000 + randInt(500, 2000);
  const stage2Offset = stage1Offset + stage1Us / 1000 + randInt(500, 2000);

  const clusterId = `j-${randHex(13).toUpperCase()}`;
  const appId = `application_${Date.now()}_${randInt(1000, 9999)}`;

  const docs: any[] = [];

  // 1. TX — Kinesis producer / stream consumer entry point
  docs.push(
    txDoc({
      ts: base.toISOString(),
      traceId,
      txId: kinesisTxId,
      serviceName: "kinesis-stream",
      environment: env,
      language: "python",
      runtime: "python3.12",
      framework: null,
      txType: "messaging",
      txName: "clickstream process",
      durationUs: kinesisTxUs,
      isErr,
      spanCount: 1,
      cloud: cloudBlock(region, account, "kinesis"),
      labels: {
        stream_name: streamName,
        shard_id: shardId,
        record_count: String(recordCount),
      },
    })
  );

  // 2. TX — stream-processor Lambda (Kinesis trigger)
  const processorFaas = faasBlock("stream-processor", region, account.id, "pubsub");
  const processorInitUs = processorFaas.coldstart ? coldStartInitUs("nodejs20.x") : 0;
  docs.push(
    txDoc({
      ts: offsetTs(base, processorTxOffset),
      traceId,
      txId: processorTxId,
      parentId: kinesisTxId,
      serviceName: "stream-processor",
      environment: env,
      language: "nodejs",
      runtime: "nodejs20.x",
      framework: "AWS Lambda",
      txType: "lambda",
      txName: "stream-processor",
      durationUs: processorTotalUs + processorInitUs,
      isErr,
      spanCount: 2,
      cloud: cloudBlock(region, account, "lambda"),
      faas: processorFaas,
      labels: {
        kinesis_sequence_number: `${randHex(16)}${randHex(16)}${randHex(8)}`,
        kinesis_shard_id: shardId,
      },
      distro: lambdaDistro,
    })
  );
  if (processorFaas.coldstart) {
    docs.push(
      spanDoc({
        ts: offsetTs(base, processorTxOffset),
        traceId,
        txId: processorTxId,
        parentId: processorTxId,
        spanId: newSpanId(),
        spanType: "app",
        spanSubtype: "cold-start",
        spanName: "Lambda init: stream-processor",
        spanAction: "init",
        durationUs: processorInitUs,
        isErr: false,
        serviceName: "stream-processor",
        environment: env,
        language: "nodejs",
        runtime: "nodejs20.x",
        distro: lambdaDistro,
      })
    );
  }

  // 3. SPAN — S3 PutObject (archive raw)
  docs.push(
    spanDoc({
      ts: offsetTs(base, s3Offset),
      traceId,
      txId: processorTxId,
      parentId: processorTxId,
      spanId: s3SpanId,
      spanType: "storage",
      spanSubtype: "s3",
      spanName: "S3.PutObject",
      spanAction: "PutObject",
      durationUs: s3PutUs,
      isErr: false,
      destination: "s3",
      labels: { s3_bucket: `${account.name}-raw-events-archive` },
      serviceName: "stream-processor",
      environment: env,
      language: "nodejs",
      runtime: "nodejs20.x",
      distro: lambdaDistro,
    })
  );

  // 4. SPAN — Glue StartJobRun (trigger ETL)
  docs.push(
    spanDoc({
      ts: offsetTs(base, glueOffset),
      traceId,
      txId: processorTxId,
      parentId: processorTxId,
      spanId: glueSpanId,
      spanType: "external",
      spanSubtype: "glue",
      spanName: `Glue.StartJobRun ${etlJobName}`,
      spanAction: "StartJobRun",
      durationUs: glueUs,
      isErr: false,
      destination: "glue",
      labels: { glue_job_name: etlJobName },
      serviceName: "stream-processor",
      environment: env,
      language: "nodejs",
      runtime: "nodejs20.x",
      distro: lambdaDistro,
    })
  );

  // 5. TX — etl-job (Spark on EMR); parent = Glue span
  const emrSvcBlock = serviceBlock("etl-job", env, "java", "Spark", "OpenJDK", "21.0.3");
  (emrSvcBlock as Record<string, any>).framework = { name: "Spark", version: "3.5.1" };
  const { agent: emrAgent, telemetry: emrTelemetry } = otelBlocks("java", "elastic");

  docs.push({
    "@timestamp": offsetTs(base, emrTxOffset),
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    parent: { id: glueSpanId },
    transaction: {
      id: emrTxId,
      name: `${etlJobName} [ETL]`,
      type: "spark_job",
      duration: { us: emrTotalUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: 3, dropped: 0 },
    },
    service: emrSvcBlock,
    agent: emrAgent,
    telemetry: emrTelemetry,
    cloud: cloudBlock(region, account, "emr"),
    labels: {
      emr_cluster_id: clusterId,
      spark_app_id: appId,
    },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  });

  // Spark stage spans — they belong to the emr TX
  const stages = [
    {
      id: stage0SpanId,
      offset: stage0Offset,
      us: stage0Us,
      name: "Stage 0: Read Kinesis Shard",
      type: "messaging",
      subtype: "kinesis",
      stageIdx: "0",
    },
    {
      id: stage1SpanId,
      offset: stage1Offset,
      us: stage1Us,
      name: "Stage 1: Parse & Validate Events",
      type: "compute",
      subtype: "spark",
      stageIdx: "1",
    },
    {
      id: stage2SpanId,
      offset: stage2Offset,
      us: stage2Us,
      name: "Stage 2: Write Enriched to S3",
      type: "storage",
      subtype: "s3",
      stageIdx: "2",
    },
  ];

  for (const [i, stage] of stages.entries()) {
    docs.push({
      "@timestamp": offsetTs(base, stage.offset),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: emrTxId },
      parent: { id: emrTxId },
      span: {
        id: stage.id,
        type: stage.type,
        subtype: stage.subtype,
        name: stage.name,
        duration: { us: stage.us },
        action:
          stage.type === "storage" ? "write" : stage.type === "messaging" ? "receive" : "execute",
      },
      service: emrSvcBlock,
      agent: emrAgent,
      telemetry: emrTelemetry,
      labels: {
        spark_stage_id: stage.stageIdx,
        spark_stage_attempt: "0",
        spark_input_records: String(randInt(10000, 500000)),
      },
      event: { outcome: isErr && i === stages.length - 1 ? "failure" : "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    });
  }

  // Error document — Spark stage failure on the EMR job
  if (isErr) {
    docs.push(
      errorDoc({
        ts: offsetTs(base, emrTxOffset + emrTotalUs / 1000 - 2),
        traceId,
        txId: emrTxId,
        txType: "spark_job",
        parentId: stage2SpanId,
        exceptionType: "SparkException",
        exceptionMessage: `Job aborted due to stage failure: Task ${randInt(0, 127)} in stage 2.0 failed 4 times. Most recent failure: Lost task ${randInt(0, 31)} in stage 2.0 (TID ${randInt(100, 999)}, executor ${randInt(0, 8)}): org.apache.spark.SparkException: Failed to write data to S3: Access Denied`,
        culprit: "LakehouseEtlJob.run in LakehouseEtlJob.scala",
        handled: false,
        frames: FRAMES.java_glue(),
        serviceName: "etl-job",
        environment: env,
        language: "java",
        runtime: "OpenJDK",
        distro: "elastic",
      })
    );
  }

  return docs;
}

// ─── Workflow 4: Step Functions Orchestration ─────────────────────────────────
//
//  EventBridge (eventbridge) → TX
//    └── TX: order-processing-workflow (Step Functions execution)
//         ├── SPAN: state ValidateOrder
//         │    └── TX: order-validator (Lambda)
//         │         └── SPAN: DynamoDB.GetItem
//         ├── SPAN: state ProcessPayment
//         │    └── TX: payment-processor (Lambda)
//         │         └── SPAN: PostgreSQL INSERT
//         └── SPAN: state SendConfirmation
//              └── TX: notification-sender (Lambda)
//                   └── SPAN: SES.SendEmail

function workflowStepFunctions(ts, er) {
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const env = rand(ENVS);
  const isErr = Math.random() < er;
  const base = new Date(ts);
  const traceId = newTraceId();
  const lambdaDistro = rand(["elastic", "aws"]);

  // IDs
  const ebTxId = newSpanId();
  const sfnTxId = newSpanId();
  const validateStateSpanId = newSpanId();
  const validatorTxId = newSpanId();
  const dynamoGetSpanId = newSpanId();
  const paymentStateSpanId = newSpanId();
  const paymentTxId = newSpanId();
  const rdsSpanId = newSpanId();
  const confirmStateSpanId = newSpanId();
  const notifTxId = newSpanId();
  const sesSpanId = newSpanId();

  // Durations (µs) — innermost first
  const sesUs = randInt(80, 300) * 1000;
  const notifUs = sesUs + randInt(30, 100) * 1000;
  const confirmUs = notifUs + randInt(20, 60) * 1000; // state wraps Lambda

  const rdsUs = randInt(10, 80) * 1000;
  const paymentUs = rdsUs + randInt(50, 200) * 1000;
  const paymentStateUs = paymentUs + randInt(20, 60) * 1000;

  const dynamoUs = randInt(5, 30) * 1000;
  const validatorUs = dynamoUs + randInt(30, 120) * 1000;
  const validateStateUs = validatorUs + randInt(20, 60) * 1000;

  const sfnTotalUs = validateStateUs + paymentStateUs + confirmUs + randInt(200, 800) * 1000;
  const ebTotalUs = sfnTotalUs + randInt(50, 200) * 1000;

  // Offsets (ms)
  const sfnOffset = randInt(5, 20);
  const validateStateOffset = sfnOffset + randInt(10, 30);
  const validatorTxOffset = validateStateOffset + randInt(2, 8);
  const dynamoOffset = validatorTxOffset + randInt(2, 8);
  const paymentStateOffset = validateStateOffset + validateStateUs / 1000 + randInt(50, 200);
  const paymentTxOffset = paymentStateOffset + randInt(2, 8);
  const rdsOffset = paymentTxOffset + randInt(2, 8);
  const confirmStateOffset = paymentStateOffset + paymentStateUs / 1000 + randInt(50, 200);
  const notifTxOffset = confirmStateOffset + randInt(2, 8);
  const sesOffset = notifTxOffset + randInt(2, 8);

  const smName = rand(["OrderProcessingWorkflow", "CheckoutWorkflow", "FulfillmentPipeline"]);
  const smArn = `arn:aws:states:${region}:${account.id}:stateMachine:${smName}`;
  const execArn = `${smArn.replace("stateMachine", "execution")}:exec-${randHex(8)}`;

  const docs: any[] = [];

  // 1. TX — EventBridge event trigger
  docs.push(
    txDoc({
      ts: base.toISOString(),
      traceId,
      txId: ebTxId,
      serviceName: "eventbridge",
      environment: env,
      language: "nodejs",
      runtime: "nodejs20.x",
      framework: null,
      txType: "messaging",
      txName: "order.created process",
      durationUs: ebTotalUs,
      isErr,
      spanCount: 1,
      cloud: cloudBlock(region, account, "events"),
    })
  );

  // 2. TX — Step Functions execution (parent = EB TX)
  docs.push({
    "@timestamp": offsetTs(base, sfnOffset),
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    parent: { id: ebTxId },
    transaction: {
      id: sfnTxId,
      name: smName,
      type: "workflow",
      duration: { us: sfnTotalUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: 3, dropped: 0 },
    },
    service: serviceBlock(
      "order-processing-workflow",
      env,
      "nodejs",
      null,
      "nodejs20.x",
      "20.15.1"
    ),
    ...otelBlocks("nodejs", "aws"),
    cloud: cloudBlock(region, account, "states"),
    labels: {
      execution_arn: execArn,
      state_machine_arn: smArn,
    },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  });

  // 3. SPAN — state: ValidateOrder
  docs.push(
    spanDoc({
      ts: offsetTs(base, validateStateOffset),
      traceId,
      txId: sfnTxId,
      parentId: sfnTxId,
      spanId: validateStateSpanId,
      spanType: "workflow",
      spanSubtype: "stepfunctions",
      spanName: "ValidateOrder",
      spanAction: "invoke",
      durationUs: validateStateUs,
      isErr: false,
      destination: "states",
      serviceName: "order-processing-workflow",
      environment: env,
      language: "nodejs",
      runtime: "nodejs20.x",
    })
  );

  // 4. TX — order-validator Lambda (parent = ValidateOrder state span)
  const validatorFaas = faasBlock("order-validator", region, account.id, "other");
  const validatorInitUs = validatorFaas.coldstart ? coldStartInitUs("python3.11") : 0;
  docs.push(
    txDoc({
      ts: offsetTs(base, validatorTxOffset),
      traceId,
      txId: validatorTxId,
      parentId: validateStateSpanId,
      serviceName: "order-validator",
      environment: env,
      language: "python",
      runtime: "python3.11",
      framework: "AWS Lambda",
      txType: "lambda",
      txName: "order-validator",
      durationUs: validatorUs + validatorInitUs,
      isErr: false,
      spanCount: 1,
      cloud: cloudBlock(region, account, "lambda"),
      faas: validatorFaas,
      distro: lambdaDistro,
    })
  );
  if (validatorFaas.coldstart) {
    docs.push(
      spanDoc({
        ts: offsetTs(base, validatorTxOffset),
        traceId,
        txId: validatorTxId,
        parentId: validatorTxId,
        spanId: newSpanId(),
        spanType: "app",
        spanSubtype: "cold-start",
        spanName: "Lambda init: order-validator",
        spanAction: "init",
        durationUs: validatorInitUs,
        isErr: false,
        serviceName: "order-validator",
        environment: env,
        language: "python",
        runtime: "python3.11",
        distro: lambdaDistro,
      })
    );
  }

  // 5. SPAN — DynamoDB GetItem (from validator)
  docs.push(
    spanDoc({
      ts: offsetTs(base, dynamoOffset),
      traceId,
      txId: validatorTxId,
      parentId: validatorTxId,
      spanId: dynamoGetSpanId,
      spanType: "db",
      spanSubtype: "dynamodb",
      spanName: "DynamoDB.GetItem",
      spanAction: "GetItem",
      durationUs: dynamoUs,
      isErr: false,
      db: { type: "nosql", statement: "GetItem orders" },
      destination: "dynamodb",
      serviceName: "order-validator",
      environment: env,
      language: "python",
      runtime: "python3.11",
      distro: lambdaDistro,
    })
  );

  // 6. SPAN — state: ProcessPayment
  docs.push(
    spanDoc({
      ts: offsetTs(base, paymentStateOffset),
      traceId,
      txId: sfnTxId,
      parentId: sfnTxId,
      spanId: paymentStateSpanId,
      spanType: "workflow",
      spanSubtype: "stepfunctions",
      spanName: "ProcessPayment",
      spanAction: "invoke",
      durationUs: paymentStateUs,
      isErr: false,
      destination: "states",
      serviceName: "order-processing-workflow",
      environment: env,
      language: "nodejs",
      runtime: "nodejs20.x",
    })
  );

  // 7. TX — payment-processor Lambda (parent = ProcessPayment state span)
  const paymentFaas = faasBlock("payment-processor", region, account.id, "other");
  const paymentInitUs = paymentFaas.coldstart ? coldStartInitUs("java21") : 0;
  docs.push(
    txDoc({
      ts: offsetTs(base, paymentTxOffset),
      traceId,
      txId: paymentTxId,
      parentId: paymentStateSpanId,
      serviceName: "payment-processor",
      environment: env,
      language: "java",
      runtime: "java21",
      framework: "AWS Lambda",
      txType: "lambda",
      txName: "payment-processor",
      durationUs: paymentUs + paymentInitUs,
      isErr,
      spanCount: 1,
      cloud: cloudBlock(region, account, "lambda"),
      faas: paymentFaas,
      distro: lambdaDistro,
    })
  );
  if (paymentFaas.coldstart) {
    docs.push(
      spanDoc({
        ts: offsetTs(base, paymentTxOffset),
        traceId,
        txId: paymentTxId,
        parentId: paymentTxId,
        spanId: newSpanId(),
        spanType: "app",
        spanSubtype: "cold-start",
        spanName: "Lambda init: payment-processor",
        spanAction: "init",
        durationUs: paymentInitUs,
        isErr: false,
        serviceName: "payment-processor",
        environment: env,
        language: "java",
        runtime: "java21",
        distro: lambdaDistro,
      })
    );
  }

  // 8. SPAN — RDS INSERT (from payment processor)
  docs.push(
    spanDoc({
      ts: offsetTs(base, rdsOffset),
      traceId,
      txId: paymentTxId,
      parentId: paymentTxId,
      spanId: rdsSpanId,
      spanType: "db",
      spanSubtype: "postgresql",
      spanName: "PostgreSQL INSERT",
      spanAction: "execute",
      durationUs: rdsUs,
      isErr,
      db: {
        type: "sql",
        statement:
          "INSERT INTO payments (order_id, amount, status, created_at) VALUES ($1, $2, $3, NOW())",
      },
      destination: "postgresql",
      serviceName: "payment-processor",
      environment: env,
      language: "java",
      runtime: "java21",
      distro: lambdaDistro,
    })
  );

  // 9. SPAN — state: SendConfirmation
  docs.push(
    spanDoc({
      ts: offsetTs(base, confirmStateOffset),
      traceId,
      txId: sfnTxId,
      parentId: sfnTxId,
      spanId: confirmStateSpanId,
      spanType: "workflow",
      spanSubtype: "stepfunctions",
      spanName: "SendConfirmation",
      spanAction: "invoke",
      durationUs: confirmUs,
      isErr: false,
      destination: "states",
      serviceName: "order-processing-workflow",
      environment: env,
      language: "nodejs",
      runtime: "nodejs20.x",
    })
  );

  // 10. TX — notification-sender Lambda (parent = SendConfirmation state span)
  const notifFaas = faasBlock("notification-sender", region, account.id, "other");
  const notifInitUs = notifFaas.coldstart ? coldStartInitUs("python3.12") : 0;
  docs.push(
    txDoc({
      ts: offsetTs(base, notifTxOffset),
      traceId,
      txId: notifTxId,
      parentId: confirmStateSpanId,
      serviceName: "notification-sender",
      environment: env,
      language: "python",
      runtime: "python3.12",
      framework: "AWS Lambda",
      txType: "lambda",
      txName: "notification-sender",
      durationUs: notifUs + notifInitUs,
      isErr: false,
      spanCount: 1,
      cloud: cloudBlock(region, account, "lambda"),
      faas: notifFaas,
      distro: lambdaDistro,
    })
  );
  if (notifFaas.coldstart) {
    docs.push(
      spanDoc({
        ts: offsetTs(base, notifTxOffset),
        traceId,
        txId: notifTxId,
        parentId: notifTxId,
        spanId: newSpanId(),
        spanType: "app",
        spanSubtype: "cold-start",
        spanName: "Lambda init: notification-sender",
        spanAction: "init",
        durationUs: notifInitUs,
        isErr: false,
        serviceName: "notification-sender",
        environment: env,
        language: "python",
        runtime: "python3.12",
        distro: lambdaDistro,
      })
    );
  }

  // 11. SPAN — SES SendEmail
  docs.push(
    spanDoc({
      ts: offsetTs(base, sesOffset),
      traceId,
      txId: notifTxId,
      parentId: notifTxId,
      spanId: sesSpanId,
      spanType: "messaging",
      spanSubtype: "ses",
      spanName: "SES.SendEmail",
      spanAction: "send",
      durationUs: sesUs,
      isErr: false,
      destination: "ses",
      serviceName: "notification-sender",
      environment: env,
      language: "python",
      runtime: "python3.12",
      distro: lambdaDistro,
    })
  );

  // Error document — RDS PSQLException on payment-processor
  if (isErr) {
    docs.push(
      errorDoc({
        ts: offsetTs(base, paymentTxOffset + paymentUs / 1000 - 2),
        traceId,
        txId: paymentTxId,
        txType: "lambda",
        parentId: rdsSpanId,
        exceptionType: "PSQLException",
        exceptionMessage: `ERROR: deadlock detected\n  Detail: Process ${randInt(10000, 99999)} waits for ShareLock on transaction ${randInt(1000, 9999)}; blocked by process ${randInt(10000, 99999)}.\n  Hint: See server log for query details.`,
        culprit: "PaymentRepository.insertTransaction in PaymentRepository.java",
        handled: false,
        frames: FRAMES.java_rds(),
        serviceName: "payment-processor",
        environment: env,
        language: "java",
        runtime: "java21",
        distro: lambdaDistro,
      })
    );
  }

  return docs;
}

// ─── Workflow 5: Cascading Failure ────────────────────────────────────────────
//
//  API Gateway (api-payments)                [TX — always isErr = true]
//    └── SPAN: Lambda invoke → payment-handler
//         └── TX: payment-handler (Lambda)
//              ├── SPAN: DynamoDB.GetItem     [SUCCESS]
//              ├── SPAN: DynamoDB.PutItem     [FAIL — ProvisionedThroughputExceededException]
//              ├── SPAN: DynamoDB.PutItem retry [FAIL again]
//              └── SPAN: SQS.SendMessage DLQ
//                   └── TX: dlq-processor (Lambda)
//                        └── SPAN: DynamoDB.PutItem (3rd attempt) [SUCCESS]

function workflowCascadingFailure(ts, _er) {
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const env = rand(ENVS);
  // Root is always an error — the payment request failed from the client's perspective
  const isErr = true;
  const base = new Date(ts);
  const traceId = newTraceId();
  const lambdaDistro = rand(["elastic", "aws"]);

  // IDs
  const apigwTxId = newSpanId();
  const lambdaInvokeSpanId = newSpanId();
  const paymentHandlerTxId = newSpanId();
  const dynamoGetSpanId = newSpanId();
  const dynamoPut1SpanId = newSpanId();
  const dynamoPut2SpanId = newSpanId();
  const sqsDlqSpanId = newSpanId();
  const dlqProcessorTxId = newSpanId();
  const dynamoPut3SpanId = newSpanId();

  // Durations (µs) — throttled DynamoDB spans are slow (200–800 ms each)
  const dynamoGetUs = randInt(5, 30) * 1000;
  const dynamoPut1Us = randInt(200, 800) * 1000; // throttled — slow
  const dynamoPut2Us = randInt(200, 800) * 1000; // throttled — slow (retry)
  const sqsDlqUs = randInt(500, 2000) * 1000; // DLQ delivery delay
  const dynamoPut3Us = randInt(5, 40) * 1000; // success after backoff
  const dlqProcessorUs = dynamoPut3Us + randInt(30, 100) * 1000;
  const paymentHandlerUs =
    dynamoGetUs + dynamoPut1Us + dynamoPut2Us + sqsDlqUs + dlqProcessorUs + randInt(50, 150) * 1000;
  const lambdaInvUs = paymentHandlerUs + randInt(20, 60) * 1000;
  const apigwTotalUs = lambdaInvUs + randInt(30, 100) * 1000;

  // Offsets (ms)
  const lambdaInvOffset = randInt(2, 10);
  const paymentTxOffset = lambdaInvOffset + randInt(1, 5);
  const dynamoGetOffset = paymentTxOffset + randInt(2, 8);
  const dynamoPut1Offset = dynamoGetOffset + dynamoGetUs / 1000 + randInt(1, 5);
  const dynamoPut2Offset = dynamoPut1Offset + dynamoPut1Us / 1000 + randInt(5, 20);
  const sqsDlqOffset = dynamoPut2Offset + dynamoPut2Us / 1000 + randInt(5, 20);
  const dlqProcessorOffset = sqsDlqOffset + sqsDlqUs / 1000 + randInt(10, 50);
  const dynamoPut3Offset = dlqProcessorOffset + randInt(2, 8);

  const throttleLabels = {
    error_code: "ProvisionedThroughputExceededException",
    error_message: "Rate exceeded for table orders",
  };

  const docs: any[] = [];

  // 1. TX — API Gateway root (always failure)
  docs.push(
    txDoc({
      ts: base.toISOString(),
      traceId,
      txId: apigwTxId,
      serviceName: "api-payments",
      environment: env,
      language: "nodejs",
      runtime: "nodejs20.x",
      framework: "AWS API Gateway",
      txType: "request",
      txName: "POST /payments",
      durationUs: apigwTotalUs,
      isErr,
      spanCount: 1,
      cloud: cloudBlock(region, account, "apigateway"),
    })
  );

  // 2. SPAN — API GW invokes payment-handler Lambda
  docs.push(
    spanDoc({
      ts: offsetTs(base, lambdaInvOffset),
      traceId,
      txId: apigwTxId,
      parentId: apigwTxId,
      spanId: lambdaInvokeSpanId,
      spanType: "external",
      spanSubtype: "lambda",
      spanName: "Lambda invoke payment-handler",
      spanAction: "invoke",
      durationUs: lambdaInvUs,
      isErr: false,
      destination: "lambda",
      serviceName: "api-payments",
      environment: env,
      language: "nodejs",
      runtime: "nodejs20.x",
    })
  );

  // 3. TX — payment-handler Lambda (parent = invoke span)
  const paymentFaas = faasBlock("payment-handler", region, account.id, "other");
  const paymentHandlerInitUs = paymentFaas.coldstart ? coldStartInitUs("python3.12") : 0;
  docs.push(
    txDoc({
      ts: offsetTs(base, paymentTxOffset),
      traceId,
      txId: paymentHandlerTxId,
      parentId: lambdaInvokeSpanId,
      serviceName: "payment-handler",
      environment: env,
      language: "python",
      runtime: "python3.12",
      framework: "AWS Lambda",
      txType: "lambda",
      txName: "payment-handler",
      durationUs: paymentHandlerUs + paymentHandlerInitUs,
      isErr: true,
      spanCount: 4,
      cloud: cloudBlock(region, account, "lambda"),
      faas: paymentFaas,
      distro: lambdaDistro,
    })
  );
  if (paymentFaas.coldstart) {
    docs.push(
      spanDoc({
        ts: offsetTs(base, paymentTxOffset),
        traceId,
        txId: paymentHandlerTxId,
        parentId: paymentHandlerTxId,
        spanId: newSpanId(),
        spanType: "app",
        spanSubtype: "cold-start",
        spanName: "Lambda init: payment-handler",
        spanAction: "init",
        durationUs: paymentHandlerInitUs,
        isErr: false,
        serviceName: "payment-handler",
        environment: env,
        language: "python",
        runtime: "python3.12",
        distro: lambdaDistro,
      })
    );
  }

  // 4. SPAN — DynamoDB.GetItem (SUCCESS — initial read before write)
  docs.push(
    spanDoc({
      ts: offsetTs(base, dynamoGetOffset),
      traceId,
      txId: paymentHandlerTxId,
      parentId: paymentHandlerTxId,
      spanId: dynamoGetSpanId,
      spanType: "db",
      spanSubtype: "dynamodb",
      spanName: "DynamoDB.GetItem",
      spanAction: "GetItem",
      durationUs: dynamoGetUs,
      isErr: false,
      db: { type: "nosql", statement: "GetItem orders" },
      destination: "dynamodb",
      serviceName: "payment-handler",
      environment: env,
      language: "python",
      runtime: "python3.12",
      distro: lambdaDistro,
    })
  );

  // 5. SPAN — DynamoDB.PutItem attempt 1 (FAIL — throttled)
  docs.push(
    spanDoc({
      ts: offsetTs(base, dynamoPut1Offset),
      traceId,
      txId: paymentHandlerTxId,
      parentId: paymentHandlerTxId,
      spanId: dynamoPut1SpanId,
      spanType: "db",
      spanSubtype: "dynamodb",
      spanName: "DynamoDB.PutItem",
      spanAction: "PutItem",
      durationUs: dynamoPut1Us,
      isErr: true,
      db: { type: "nosql", statement: "PutItem orders" },
      destination: "dynamodb",
      labels: throttleLabels,
      serviceName: "payment-handler",
      environment: env,
      language: "python",
      runtime: "python3.12",
      distro: lambdaDistro,
    })
  );

  // 6. SPAN — DynamoDB.PutItem attempt 2 / Lambda retry (FAIL — throttled again)
  docs.push(
    spanDoc({
      ts: offsetTs(base, dynamoPut2Offset),
      traceId,
      txId: paymentHandlerTxId,
      parentId: paymentHandlerTxId,
      spanId: dynamoPut2SpanId,
      spanType: "db",
      spanSubtype: "dynamodb",
      spanName: "DynamoDB.PutItem retry",
      spanAction: "PutItem",
      durationUs: dynamoPut2Us,
      isErr: true,
      db: { type: "nosql", statement: "PutItem orders" },
      destination: "dynamodb",
      labels: { ...throttleLabels, retry_attempt: "2" },
      serviceName: "payment-handler",
      environment: env,
      language: "python",
      runtime: "python3.12",
      distro: lambdaDistro,
    })
  );

  // 7. SPAN — SQS.SendMessage to DLQ (routes message after repeated failure)
  docs.push(
    spanDoc({
      ts: offsetTs(base, sqsDlqOffset),
      traceId,
      txId: paymentHandlerTxId,
      parentId: paymentHandlerTxId,
      spanId: sqsDlqSpanId,
      spanType: "messaging",
      spanSubtype: "sqs",
      spanName: "SQS.SendMessage payment-dlq.fifo",
      spanAction: "send",
      durationUs: sqsDlqUs,
      isErr: false,
      destination: "sqs",
      labels: {
        queue_name: "payment-dlq.fifo",
        dlq_trigger: "true",
      },
      serviceName: "payment-handler",
      environment: env,
      language: "python",
      runtime: "python3.12",
      distro: lambdaDistro,
    })
  );

  // 8. TX — dlq-processor Lambda (parent = SQS DLQ span; processing succeeds)
  const dlqFaas = faasBlock("dlq-processor", region, account.id, "pubsub");
  const dlqProcessorInitUs = dlqFaas.coldstart ? coldStartInitUs("python3.12") : 0;
  docs.push(
    txDoc({
      ts: offsetTs(base, dlqProcessorOffset),
      traceId,
      txId: dlqProcessorTxId,
      parentId: sqsDlqSpanId,
      serviceName: "dlq-processor",
      environment: env,
      language: "python",
      runtime: "python3.12",
      framework: "AWS Lambda",
      txType: "lambda",
      txName: "dlq-processor",
      durationUs: dlqProcessorUs + dlqProcessorInitUs,
      isErr: false,
      spanCount: 1,
      cloud: cloudBlock(region, account, "lambda"),
      faas: dlqFaas,
      distro: lambdaDistro,
    })
  );
  if (dlqFaas.coldstart) {
    docs.push(
      spanDoc({
        ts: offsetTs(base, dlqProcessorOffset),
        traceId,
        txId: dlqProcessorTxId,
        parentId: dlqProcessorTxId,
        spanId: newSpanId(),
        spanType: "app",
        spanSubtype: "cold-start",
        spanName: "Lambda init: dlq-processor",
        spanAction: "init",
        durationUs: dlqProcessorInitUs,
        isErr: false,
        serviceName: "dlq-processor",
        environment: env,
        language: "python",
        runtime: "python3.12",
        distro: lambdaDistro,
      })
    );
  }

  // 9. SPAN — DynamoDB.PutItem attempt 3 (SUCCESS after backoff)
  docs.push(
    spanDoc({
      ts: offsetTs(base, dynamoPut3Offset),
      traceId,
      txId: dlqProcessorTxId,
      parentId: dlqProcessorTxId,
      spanId: dynamoPut3SpanId,
      spanType: "db",
      spanSubtype: "dynamodb",
      spanName: "DynamoDB.PutItem",
      spanAction: "PutItem",
      durationUs: dynamoPut3Us,
      isErr: false,
      db: { type: "nosql", statement: "PutItem orders" },
      destination: "dynamodb",
      labels: { retry_attempt: "3" },
      serviceName: "dlq-processor",
      environment: env,
      language: "python",
      runtime: "python3.12",
      distro: lambdaDistro,
    })
  );

  // Error document — DynamoDB ProvisionedThroughputExceededException on payment-handler
  // (always errors — cascading failure scenario)
  docs.push(
    errorDoc({
      ts: offsetTs(base, paymentTxOffset + paymentHandlerUs / 1000 - 2),
      traceId,
      txId: paymentHandlerTxId,
      txType: "lambda",
      parentId: dynamoPut2SpanId,
      exceptionType: "ProvisionedThroughputExceededException",
      exceptionMessage:
        "An error occurred (ProvisionedThroughputExceededException) when calling the PutItem operation: The level of configured provisioned throughput for the table was exceeded. Consider increasing your provisioning level with the UpdateTable API.",
      culprit: "write_record in payment_handler.py",
      handled: false,
      frames: FRAMES.python_dynamo_throttle("payment_handler"),
      serviceName: "payment-handler",
      environment: env,
      language: "python",
      runtime: "python3.12",
      distro: lambdaDistro,
    })
  );

  return docs;
}

// ─── Public exports ───────────────────────────────────────────────────────────

/** E-commerce Order Flow: API Gateway → Lambda → DynamoDB + SQS → Lambda → SES */
export function generateEcommerceOrderTrace(ts, er) {
  return workflowEcommerceOrder(ts, er);
}

/** ML Inference Pipeline: API Gateway → Lambda → S3 + Bedrock → DynamoDB */
export function generateMlInferenceTrace(ts, er) {
  return workflowMlInference(ts, er);
}

/** Data Ingestion Pipeline: Kinesis → Lambda → S3 + Glue → EMR Spark */
export function generateDataIngestionTrace(ts, er) {
  return workflowDataIngestion(ts, er);
}

/** Step Functions Orchestration: EventBridge → Step Functions → Lambda (×3) → DynamoDB + RDS + SES */
export function generateStepFunctionsWorkflowTrace(ts, er) {
  return workflowStepFunctions(ts, er);
}

/** Cascading Failure: API Gateway → Lambda → DynamoDB throttle → DLQ → Lambda recovery */
export function generateCascadingFailureTrace(ts, er) {
  return workflowCascadingFailure(ts, er);
}
