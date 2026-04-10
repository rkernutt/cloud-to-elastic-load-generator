/**
 * Data pipeline multi-service trace generators (S3→SQS chain + EventBridge→SFN).
 * Shared builders: ./workflow-internal.js
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
  spike,
  coldStartInitUs,
  faasBlock,
} from "./workflow-internal.js";

// ─── Workflow 6: S3 event notification → SQS → Lambda → Glue → S3 + Redshift + SageMaker
//
//  TX: pipeline-sqs-handler (Lambda) — SQS event from bucket notification
//    ├── SPAN: SQS.ReceiveMessage (landing-zone notifications queue)
//    ├── SPAN: parse S3 event notification payload
//    └── SPAN: Glue.StartJobRun
//         └── TX: lakehouse-curated-etl (Glue job — Spark)
//              ├── SPAN: read raw zone (S3)
//              ├── SPAN: transform & Iceberg commit
//              └── SPAN: write curated Parquet (S3)
//                   └── TX: warehouse-loader (Lambda) — COPY to Redshift
//                        └── SPAN: Redshift COPY
//                             └── TX: sm-pipeline-feature-prep (SageMaker Processing)

function workflowPipelineS3SqsChained(ts: string, er: number) {
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const env = rand(ENVS);
  const base = new Date(ts);
  const traceId = newTraceId();
  const lambdaDistro = rand(["elastic", "aws"]);

  const rawBucket = `${account.name}-landing-raw`;
  const curatedBucket = `${account.name}-curated-parquet`;
  const queueName = `s3-lake-notifications-${rand(["prod", "staging"])}`;
  const glueJobName = rand([
    "lakehouse-curated-etl",
    "bronze-to-silver-promote",
    "pipeline-merge-small-files",
  ]);
  const redshiftCluster = rand(["rs-analytics-prod", "rs-datalake-staging", "rs-unified-studio"]);
  const smProcessingJob = `sm-processing-${randHex(6)}`;

  const glueFail = Math.random() < er * 0.55;
  const redshiftFail = Math.random() < er * 0.45 && !glueFail;
  const dlqFail = Math.random() < er * 0.15 && !glueFail && !redshiftFail;
  const rootErr = glueFail || redshiftFail || dlqFail;

  const lambdaTxId = newSpanId();
  const sqsRecvSpanId = newSpanId();
  const parseEventSpanId = newSpanId();
  const glueStartSpanId = newSpanId();
  const glueJobTxId = newSpanId();
  const readRawSpanId = newSpanId();
  const transformSpanId = newSpanId();
  const writeCuratedSpanId = newSpanId();
  const lambdaInvokeSpanId = newSpanId();
  const whLoaderTxId = newSpanId();
  const redshiftSpanId = newSpanId();
  const smCreateSpanId = newSpanId();
  const smTxId = newSpanId();
  const smInternalSpanId = newSpanId();
  const dlqQueueName = `${queueName}-dlq`;
  const dlqRecvSpanId = newSpanId();
  const dlqProcessorTxId2 = newSpanId();
  const dlqS3LogSpanId = newSpanId();

  const lambdaInvokeUs = randInt(80, 250) * 1000; // API call only — sub-second
  const smCreateUs = randInt(100, 350) * 1000; // CreateProcessingJob API — sub-second
  // Long-running stages get realistic minute-range durations with occasional spikes
  // modelling DPU resource contention or partition skew
  const readRawUs = spike(randInt(30, 180) * 1000 * 1000); // 30s–3min
  const transformUs = spike(randInt(45, 300) * 1000 * 1000, 0.08); // 45s–5min (higher spike prob — skew-prone)
  const writeCurUs = spike(randInt(20, 120) * 1000 * 1000); // 20s–2min
  const redshiftUs = spike(randInt(15, 180) * 1000 * 1000, 0.08, 3, 6); // 15s–3min (queue-wait spikes)
  const smInternalUs = spike(randInt(60, 600) * 1000 * 1000, 0.05, 2, 3.5); // 1–10min
  const whLoaderUs = redshiftUs + smCreateUs + randInt(50, 150) * 1000;
  const glueJobUs =
    readRawUs + transformUs + writeCurUs + lambdaInvokeUs + randInt(500, 2000) * 1000;
  const glueApiUs = randInt(150, 600) * 1000;
  const parseUs = randInt(15, 80) * 1000;
  const sqsRecvUs = randInt(40, 200) * 1000;
  // Lambda exits after submitting the Glue job asynchronously — it does not wait for
  // Glue, the warehouse loader, or SageMaker. Downstream transactions carry their own
  // wall-clock offsets from the trace base timestamp.
  const lambdaTotalUs = sqsRecvUs + parseUs + glueApiUs + randInt(200, 800) * 1000;

  const dlqRecvUs = randInt(40, 150) * 1000;
  const dlqProcessUs = randInt(200, 800) * 1000;
  const dlqS3LogUs = randInt(30, 100) * 1000;
  const dlqTotalUs = dlqRecvUs + dlqProcessUs + dlqS3LogUs + randInt(50, 150) * 1000;
  // DLQ delivery happens after MaxReceiveCount × visibilityTimeout — model as ~30–90 s later
  const dlqLambdaOffset = 3 + randInt(30000, 90000);
  const dlqRecvOffset = dlqLambdaOffset + 3;
  const dlqS3LogOffset = dlqRecvOffset + dlqRecvUs / 1000 + dlqProcessUs / 1000 + 5;

  let ms = 3;
  const lambdaStartMs = ms;
  ms += 2;
  const sqsOffset = ms;
  ms += sqsRecvUs / 1000 + 2;
  const parseOffset = ms;
  ms += parseUs / 1000 + 2;
  const glueApiOffset = ms;
  ms += glueApiUs / 1000 + randInt(300, 1200);
  const glueJobStartOffset = ms;
  ms += 10;
  const readRawOffset = ms;
  ms += readRawUs / 1000 + 5;
  const transformOffset = ms;
  ms += transformUs / 1000 + 5;
  const writeCurOffset = ms;
  ms += writeCurUs / 1000 + randInt(200, 800);
  const lambdaInvokeOffset = ms;
  ms += lambdaInvokeUs / 1000 + randInt(50, 150);
  const whLoaderOffset = ms;
  ms += 15;
  const redshiftOffset = ms;
  ms += redshiftUs / 1000 + randInt(100, 400);
  const smCreateOffset = ms;
  ms += smCreateUs / 1000 + randInt(50, 150);
  const smTxOffset = ms;
  ms += 8;
  const smInternalOffset = ms;

  const pipelineHandlerFaas = faasBlock("pipeline-sqs-handler", region, account.id, "pubsub");
  const lambdaHandlerInitUs = pipelineHandlerFaas.coldstart ? coldStartInitUs("python3.12") : 0;
  const glueSvcBlock = serviceBlock(glueJobName, env, "java", "Spark", "java21", "21.0.3");
  (glueSvcBlock as Record<string, any>).framework = { name: "Spark", version: "3.5.1" };
  const { agent: glueAgent, telemetry: glueTelemetry } = otelBlocks("java", "elastic");

  const loaderFaas = faasBlock("warehouse-loader", region, account.id, "other");
  // SageMaker Processing is only triggered ~40% of the time — not every ETL run produces
  // features that need refreshing, and the Glue/Redshift stages must succeed first.
  const includeSm = !glueFail && !redshiftFail && Math.random() < 0.4;
  const smSvcBlock = serviceBlock(
    "sm-pipeline-feature-prep",
    env,
    "python",
    null,
    "python3.11",
    "3.11.9"
  );
  const { agent: smAgent, telemetry: smTelemetry } = otelBlocks("python", "elastic");

  const docs: any[] = [];

  docs.push(
    txDoc({
      ts: offsetTs(base, lambdaStartMs),
      traceId,
      txId: lambdaTxId,
      serviceName: "pipeline-sqs-handler",
      environment: env,
      language: "python",
      runtime: "python3.12",
      framework: "AWS Lambda",
      txType: "messaging",
      txName: "pipeline-sqs-handler",
      durationUs: lambdaTotalUs + lambdaHandlerInitUs,
      isErr: rootErr,
      spanCount: 3,
      cloud: cloudBlock(region, account, "lambda"),
      faas: pipelineHandlerFaas,
      labels: {
        s3_notification_prefix: "raw/",
        sqs_queue: queueName,
        landing_bucket: rawBucket,
        sqs_message_id: `${randHex(8)}-${randHex(4)}-${randHex(4)}-${randHex(4)}-${randHex(12)}`,
      },
      distro: lambdaDistro,
    })
  );
  if (pipelineHandlerFaas.coldstart) {
    docs.push(
      spanDoc({
        ts: offsetTs(base, lambdaStartMs),
        traceId,
        txId: lambdaTxId,
        parentId: lambdaTxId,
        spanId: newSpanId(),
        spanType: "app",
        spanSubtype: "cold-start",
        spanName: "Lambda init: pipeline-sqs-handler",
        spanAction: "init",
        durationUs: lambdaHandlerInitUs,
        isErr: false,
        serviceName: "pipeline-sqs-handler",
        environment: env,
        language: "python",
        runtime: "python3.12",
        distro: lambdaDistro,
      })
    );
  }

  docs.push(
    spanDoc({
      ts: offsetTs(base, sqsOffset),
      traceId,
      txId: lambdaTxId,
      parentId: lambdaTxId,
      spanId: sqsRecvSpanId,
      spanType: "messaging",
      spanSubtype: "sqs",
      spanName: `SQS.ReceiveMessage ${queueName}`,
      spanAction: "receive",
      durationUs: sqsRecvUs,
      isErr: false,
      destination: "sqs",
      labels: {
        messaging_destination: queueName,
        trigger: "s3_object_created",
      },
      serviceName: "pipeline-sqs-handler",
      environment: env,
      language: "python",
      runtime: "python3.12",
      distro: lambdaDistro,
    })
  );

  docs.push(
    spanDoc({
      ts: offsetTs(base, parseOffset),
      traceId,
      txId: lambdaTxId,
      parentId: lambdaTxId,
      spanId: parseEventSpanId,
      spanType: "app",
      spanSubtype: "internal",
      spanName: "Parse S3 event notification JSON",
      spanAction: "parse",
      durationUs: parseUs,
      isErr: false,
      labels: { s3_bucket: rawBucket, event_name: "ObjectCreated:Put" },
      serviceName: "pipeline-sqs-handler",
      environment: env,
      language: "python",
      runtime: "python3.12",
      distro: lambdaDistro,
    })
  );

  docs.push(
    spanDoc({
      ts: offsetTs(base, glueApiOffset),
      traceId,
      txId: lambdaTxId,
      parentId: lambdaTxId,
      spanId: glueStartSpanId,
      spanType: "external",
      spanSubtype: "glue",
      spanName: `Glue.StartJobRun ${glueJobName}`,
      spanAction: "StartJobRun",
      durationUs: glueApiUs,
      isErr: false,
      destination: "glue",
      labels: { glue_job_name: glueJobName },
      serviceName: "pipeline-sqs-handler",
      environment: env,
      language: "python",
      runtime: "python3.12",
      distro: lambdaDistro,
    })
  );

  docs.push({
    "@timestamp": offsetTs(base, glueJobStartOffset),
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    parent: { id: glueStartSpanId },
    transaction: {
      id: glueJobTxId,
      name: `${glueJobName} [Glue Spark]`,
      type: "job",
      duration: { us: glueJobUs },
      result: glueFail ? "failure" : "success",
      sampled: true,
      span_count: { started: 4, dropped: 0 },
    },
    service: glueSvcBlock,
    agent: glueAgent,
    telemetry: glueTelemetry,
    cloud: cloudBlock(region, account, "glue"),
    labels: { glue_job_name: glueJobName, output_bucket: curatedBucket },
    event: { outcome: glueFail ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  });

  docs.push({
    "@timestamp": offsetTs(base, readRawOffset),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: glueJobTxId },
    parent: { id: glueJobTxId },
    span: {
      id: readRawSpanId,
      type: "storage",
      subtype: "s3",
      name: "Read raw objects (landing zone)",
      duration: { us: readRawUs },
      action: "read",
    },
    service: glueSvcBlock,
    agent: glueAgent,
    telemetry: glueTelemetry,
    labels: { s3_bucket: rawBucket },
    event: { outcome: "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  });

  docs.push({
    "@timestamp": offsetTs(base, transformOffset),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: glueJobTxId },
    parent: { id: glueJobTxId },
    span: {
      id: transformSpanId,
      type: "compute",
      subtype: "glue",
      name: "Transform & dedupe to curated schema",
      duration: { us: transformUs },
      action: "execute",
    },
    service: glueSvcBlock,
    agent: glueAgent,
    telemetry: glueTelemetry,
    event: { outcome: "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  });

  docs.push({
    "@timestamp": offsetTs(base, writeCurOffset),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: glueJobTxId },
    parent: { id: glueJobTxId },
    span: {
      id: writeCuratedSpanId,
      type: "storage",
      subtype: "s3",
      name: "Write curated Parquet (Silver zone)",
      duration: { us: writeCurUs },
      action: "write",
    },
    service: glueSvcBlock,
    agent: glueAgent,
    telemetry: glueTelemetry,
    labels: { s3_bucket: curatedBucket },
    event: { outcome: glueFail ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  });

  // Glue calls warehouse-loader via Boto3 lambda.invoke() — this is how the Glue job
  // hands off to the next stage without polling; the span represents the synchronous API
  // call only (Lambda executes independently afterwards).
  docs.push({
    "@timestamp": offsetTs(base, lambdaInvokeOffset),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: glueJobTxId },
    parent: { id: writeCuratedSpanId },
    span: {
      id: lambdaInvokeSpanId,
      type: "external",
      subtype: "lambda",
      name: "Lambda.Invoke warehouse-loader",
      duration: { us: lambdaInvokeUs },
      action: "invoke",
    },
    service: glueSvcBlock,
    agent: glueAgent,
    telemetry: glueTelemetry,
    labels: { function_name: "warehouse-loader" },
    event: { outcome: glueFail ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  });

  const whLoaderInitUs = loaderFaas.coldstart ? coldStartInitUs("python3.12") : 0;
  docs.push(
    txDoc({
      ts: offsetTs(base, whLoaderOffset),
      traceId,
      txId: whLoaderTxId,
      parentId: glueFail ? glueStartSpanId : lambdaInvokeSpanId,
      serviceName: "warehouse-loader",
      environment: env,
      language: "python",
      runtime: "python3.12",
      framework: "AWS Lambda",
      txType: "lambda",
      txName: "warehouse-loader",
      durationUs: whLoaderUs + whLoaderInitUs,
      isErr: redshiftFail || glueFail,
      spanCount: 2,
      cloud: cloudBlock(region, account, "lambda"),
      faas: loaderFaas,
      labels: { redshift_cluster: redshiftCluster, source_bucket: curatedBucket },
      distro: lambdaDistro,
    })
  );
  if (loaderFaas.coldstart) {
    docs.push(
      spanDoc({
        ts: offsetTs(base, whLoaderOffset),
        traceId,
        txId: whLoaderTxId,
        parentId: whLoaderTxId,
        spanId: newSpanId(),
        spanType: "app",
        spanSubtype: "cold-start",
        spanName: "Lambda init: warehouse-loader",
        spanAction: "init",
        durationUs: whLoaderInitUs,
        isErr: false,
        serviceName: "warehouse-loader",
        environment: env,
        language: "python",
        runtime: "python3.12",
        distro: lambdaDistro,
      })
    );
  }

  docs.push(
    spanDoc({
      ts: offsetTs(base, redshiftOffset),
      traceId,
      txId: whLoaderTxId,
      parentId: whLoaderTxId,
      spanId: redshiftSpanId,
      spanType: "db",
      spanSubtype: "redshift",
      spanName: "Redshift COPY from S3 manifest",
      spanAction: "execute",
      durationUs: redshiftUs,
      isErr: redshiftFail,
      db: {
        type: "sql",
        statement: `COPY analytics.fact_events FROM 's3://${curatedBucket}/manifest.json' IAM_ROLE DEFAULT FORMAT AS PARQUET`,
      },
      destination: "redshift",
      labels: { redshift_cluster: redshiftCluster },
      serviceName: "warehouse-loader",
      environment: env,
      language: "python",
      runtime: "python3.12",
      distro: lambdaDistro,
    })
  );

  // warehouse-loader calls SageMaker.CreateProcessingJob via Boto3 to kick off the
  // feature engineering job; the API call returns immediately (job runs async).
  docs.push(
    spanDoc({
      ts: offsetTs(base, smCreateOffset),
      traceId,
      txId: whLoaderTxId,
      parentId: whLoaderTxId,
      spanId: smCreateSpanId,
      spanType: "external",
      spanSubtype: "sagemaker",
      spanName: `SageMaker.CreateProcessingJob ${smProcessingJob}`,
      spanAction: "CreateProcessingJob",
      durationUs: smCreateUs,
      isErr: false,
      destination: "sagemaker",
      labels: { processing_job: smProcessingJob },
      serviceName: "warehouse-loader",
      environment: env,
      language: "python",
      runtime: "python3.12",
      distro: lambdaDistro,
    })
  );

  if (includeSm) {
    docs.push({
      "@timestamp": offsetTs(base, smTxOffset),
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      parent: { id: smCreateSpanId },
      transaction: {
        id: smTxId,
        name: smProcessingJob,
        type: "job",
        duration: { us: smInternalUs + randInt(50, 200) * 1000 },
        result: glueFail || redshiftFail ? "failure" : "success",
        sampled: true,
        span_count: { started: 1, dropped: 0 },
      },
      service: smSvcBlock,
      agent: smAgent,
      telemetry: smTelemetry,
      cloud: cloudBlock(region, account, "sagemaker"),
      labels: {
        sagemaker_processing_job: smProcessingJob,
        unified_studio_visible: "true",
        feature_store: "pipeline-features",
      },
      event: { outcome: "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    });

    docs.push({
      "@timestamp": offsetTs(base, smInternalOffset),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: smTxId },
      parent: { id: smTxId },
      span: {
        id: smInternalSpanId,
        type: "ml",
        subtype: "sagemaker",
        name: "Processing — feature engineering for Unified Studio",
        duration: { us: smInternalUs },
        action: "process",
      },
      service: smSvcBlock,
      agent: smAgent,
      telemetry: smTelemetry,
      event: { outcome: "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    });
  } // end if (includeSm)

  if (dlqFail) {
    const dlqHandlerFaas = faasBlock("pipeline-dlq-processor", region, account.id, "pubsub");
    const dlqInitUs = dlqHandlerFaas.coldstart ? coldStartInitUs("python3.12") : 0;
    docs.push(
      txDoc({
        ts: offsetTs(base, dlqLambdaOffset),
        traceId,
        txId: dlqProcessorTxId2,
        parentId: lambdaTxId,
        serviceName: "pipeline-dlq-processor",
        environment: env,
        language: "python",
        runtime: "python3.12",
        framework: "AWS Lambda",
        txType: "messaging",
        txName: "pipeline-dlq-processor",
        durationUs: dlqTotalUs + dlqInitUs,
        isErr: false,
        spanCount: 2,
        cloud: cloudBlock(region, account, "lambda"),
        faas: dlqHandlerFaas,
        labels: { sqs_queue: dlqQueueName, dlq_reason: "MaxReceiveCount exceeded" },
        distro: lambdaDistro,
      })
    );
    if (dlqHandlerFaas.coldstart) {
      docs.push(
        spanDoc({
          ts: offsetTs(base, dlqLambdaOffset),
          traceId,
          txId: dlqProcessorTxId2,
          parentId: dlqProcessorTxId2,
          spanId: newSpanId(),
          spanType: "app",
          spanSubtype: "cold-start",
          spanName: "Lambda init: pipeline-dlq-processor",
          spanAction: "init",
          durationUs: dlqInitUs,
          isErr: false,
          serviceName: "pipeline-dlq-processor",
          environment: env,
          language: "python",
          runtime: "python3.12",
          distro: lambdaDistro,
        })
      );
    }
    docs.push(
      spanDoc({
        ts: offsetTs(base, dlqRecvOffset),
        traceId,
        txId: dlqProcessorTxId2,
        parentId: dlqProcessorTxId2,
        spanId: dlqRecvSpanId,
        spanType: "messaging",
        spanSubtype: "sqs",
        spanName: `SQS.ReceiveMessage ${dlqQueueName}`,
        spanAction: "receive",
        durationUs: dlqRecvUs,
        isErr: false,
        destination: "sqs",
        labels: { messaging_destination: dlqQueueName, dlq: "true" },
        serviceName: "pipeline-dlq-processor",
        environment: env,
        language: "python",
        runtime: "python3.12",
        distro: lambdaDistro,
      })
    );
    docs.push(
      spanDoc({
        ts: offsetTs(base, dlqS3LogOffset),
        traceId,
        txId: dlqProcessorTxId2,
        parentId: dlqProcessorTxId2,
        spanId: dlqS3LogSpanId,
        spanType: "storage",
        spanSubtype: "s3",
        spanName: `S3.PutObject dead-letter-logs/${rawBucket}`,
        spanAction: "PutObject",
        durationUs: dlqS3LogUs,
        isErr: false,
        destination: "s3",
        labels: { s3_bucket: `${account.name}-pipeline-dead-letters`, source_queue: dlqQueueName },
        serviceName: "pipeline-dlq-processor",
        environment: env,
        language: "python",
        runtime: "python3.12",
        distro: lambdaDistro,
      })
    );
  }

  // Error documents — distinct exception per failure branch
  if (glueFail) {
    docs.push(
      errorDoc({
        ts: offsetTs(base, glueJobStartOffset + glueJobUs / 1000 - 2),
        traceId,
        txId: glueJobTxId,
        txType: "job",
        parentId: writeCuratedSpanId,
        exceptionType: "JobRunFailedException",
        exceptionMessage: `Job run failed: ${glueJobName}. Error: Exception in thread "main" org.apache.spark.SparkException: Job aborted due to stage failure: Task ${randInt(0, 63)} in stage 1.0 failed 4 times. Most recent failure: FetchFailed(null, shuffleId=${randInt(0, 9)}, mapIndex=${randInt(0, 31)}, mapTaskId=${randInt(100, 999)}, reduceId=${randInt(0, 15)}, message=\norg.apache.spark.shuffle.FetchFailedException: Failed to connect to host)`,
        culprit: "LakehouseEtlJob.run in LakehouseEtlJob.scala",
        handled: false,
        frames: FRAMES.java_glue(),
        serviceName: glueJobName,
        environment: env,
        language: "java",
        runtime: "java21",
        distro: "elastic",
      })
    );
  }

  if (redshiftFail) {
    docs.push(
      errorDoc({
        ts: offsetTs(base, whLoaderOffset + whLoaderUs / 1000 - 2),
        traceId,
        txId: whLoaderTxId,
        txType: "lambda",
        parentId: redshiftSpanId,
        exceptionType: "S3ServiceException",
        exceptionMessage: `An error occurred (S3ServiceException) during Redshift COPY from 's3://${curatedBucket}/manifest.json': Access Denied. Check IAM role attached to the Redshift cluster has s3:GetObject on the curated bucket.`,
        culprit: "run_copy in warehouse_loader.py",
        handled: false,
        frames: FRAMES.python_redshift("warehouse_loader"),
        serviceName: "warehouse-loader",
        environment: env,
        language: "python",
        runtime: "python3.12",
        distro: lambdaDistro,
      })
    );
  }

  if (dlqFail) {
    docs.push(
      errorDoc({
        ts: offsetTs(base, lambdaStartMs + lambdaTotalUs / 1000 - 2),
        traceId,
        txId: lambdaTxId,
        txType: "messaging",
        parentId: parseEventSpanId,
        exceptionType: "EventSchemaValidationError",
        exceptionMessage: `Failed to validate S3 event notification payload: missing required field 'Records[0].s3.object.key'. Raw message archived to s3://${account.name}-pipeline-dead-letters/. Queue: ${queueName}`,
        culprit: "validate_event in pipeline_handler.py",
        handled: false,
        frames: [
          {
            function: "validate_event",
            filename: "pipeline_handler.py",
            lineno: 28,
            library_frame: false,
          },
          {
            function: "handler",
            filename: "pipeline_handler.py",
            lineno: 12,
            library_frame: false,
          },
        ],
        serviceName: "pipeline-sqs-handler",
        environment: env,
        language: "python",
        runtime: "python3.12",
        distro: lambdaDistro,
      })
    );
  }

  return docs;
}

// ─── Workflow 7: EventBridge → Step Functions — data pipeline (Glue, S3, Redshift, SageMaker)
//
//  TX: EventBridge (scheduled pipeline trigger)
//    └── TX: data-lake-pipeline-sfn (Step Functions)
//         ├── SPAN: StartGlueETL (Task)
//         │    └── TX: dw-glue-spark-job
//         │         ├── SPAN: extract
//         │         └── SPAN: load S3 curated
//         ├── SPAN: ParallelExport (parallel branch — S3 export task)
//         │    └── TX: s3-export-worker (Lambda)
//         │         └── SPAN: S3 PutObject archive
//         ├── SPAN: ParallelWarehouseLoad (parallel branch — Redshift)
//         │    └── TX: redshift-staging-loader (Lambda)
//         │         └── SPAN: Redshift COPY
//         └── SPAN: SageMakerFeaturePrep (Task)
//              └── TX: sm-unified-prep (SageMaker Processing)

function workflowPipelineSfnData(ts: string, er: number) {
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const env = rand(ENVS);
  const base = new Date(ts);
  const traceId = newTraceId();
  const lambdaDistro = rand(["elastic", "aws"]);

  // Distinct failure modes produce different waterfall shapes — mirroring Pipeline 1
  const glueFail = Math.random() < er * 0.5;
  const redshiftFail = Math.random() < er * 0.4 && !glueFail;
  const smThrottle = !glueFail && !redshiftFail && Math.random() < er * 0.2;
  const isErr = glueFail || redshiftFail || smThrottle;

  const smName = rand([
    "DataLakeOrchestrationPipeline",
    "LakehousePromoteWorkflow",
    "AnalyticsETLStateMachine",
  ]);
  const smArn = `arn:aws:states:${region}:${account.id}:stateMachine:${smName}`;
  const execArn = `${smArn.replace("stateMachine", "execution")}:exec-${randHex(8)}`;
  const curatedBucket = `${account.name}-orchestrated-curated`;
  const rsCluster = rand(["rs-analytics-prod", "rs-datalake-staging", "rs-unified-studio"]);

  const ebTxId = newSpanId();
  const ebSfnSpanId = newSpanId();
  const sfnTxId = newSpanId();
  const glueTaskSpanId = newSpanId();
  const glueSparkTxId = newSpanId();
  const glueExtractSpanId = newSpanId();
  const glueTransformSpanId = newSpanId();
  const glueLoadS3SpanId = newSpanId();
  const parS3StateSpanId = newSpanId();
  const s3WorkerTxId = newSpanId();
  const s3PutSpanId = newSpanId();
  const parRsStateSpanId = newSpanId();
  const rsWorkerTxId = newSpanId();
  const rsCopySpanId = newSpanId();
  const smStateSpanId = newSpanId();
  const smProcTxId = newSpanId();
  const smSpanId = newSpanId();

  const s3PutUs = randInt(40, 180) * 1000; // S3 archive write — sub-second ✓
  const s3WorkerUs = s3PutUs + randInt(30, 100) * 1000;
  const parS3Us = s3WorkerUs + randInt(20, 80) * 1000;

  const rsCopyUs = spike(randInt(15, 180) * 1000 * 1000, 0.08, 3, 6); // 15s–3min with queue-wait spikes
  const rsWorkerUs = rsCopyUs + randInt(40, 120) * 1000;
  const parRsUs = rsWorkerUs + randInt(20, 80) * 1000;

  const ebSfnUs = randInt(80, 250) * 1000; // StartExecution API — sub-second ✓
  const glueExtractUs = spike(randInt(30, 180) * 1000 * 1000); // 30s–3min
  const glueTransformUs = spike(randInt(45, 300) * 1000 * 1000, 0.08); // 45s–5min
  const glueLoadUs = spike(randInt(20, 120) * 1000 * 1000); // 20s–2min
  const glueSparkUs = glueExtractUs + glueTransformUs + glueLoadUs + randInt(500, 2000) * 1000;
  const glueTaskUs = glueSparkUs + randInt(100, 400) * 1000;

  const smInnerUs = spike(randInt(60, 600) * 1000 * 1000, 0.05, 2, 3.5); // 1–10min
  const smStateUs = smInnerUs + randInt(80, 250) * 1000;

  const parallelOverlap = Math.max(parS3Us, parRsUs);
  const sfnTotalUs = glueTaskUs + parallelOverlap + smStateUs + randInt(300, 900) * 1000;
  const ebTotalUs = sfnTotalUs + randInt(50, 200) * 1000;

  const ebSfnOffset = randInt(3, 10);
  // SFN TX starts after EB emits the StepFunctions.StartExecution span
  const sfnOffset = ebSfnOffset + ebSfnUs / 1000 + randInt(5, 20);
  const glueTaskOffset = sfnOffset + randInt(10, 25);
  const glueSparkOffset = glueTaskOffset + randInt(3, 10);
  const extractOffset = glueSparkOffset + randInt(5, 15);
  const glueTransformOffset = extractOffset + glueExtractUs / 1000 + randInt(5, 15);
  const loadS3Offset = glueTransformOffset + glueTransformUs / 1000 + randInt(10, 30);
  const parS3Offset = glueTaskOffset + glueTaskUs / 1000 + randInt(20, 80);
  const s3WorkerOffset = parS3Offset + randInt(3, 10);
  const s3PutOffset = s3WorkerOffset + randInt(3, 10);
  const parRsOffset = glueTaskOffset + glueTaskUs / 1000 + randInt(30, 90);
  const rsWorkerOffset = parRsOffset + randInt(3, 10);
  const rsCopyOffset = rsWorkerOffset + randInt(3, 10);
  const smStateOffset =
    glueTaskOffset + glueTaskUs / 1000 + parallelOverlap / 1000 + randInt(50, 150);
  const smProcOffset = smStateOffset + randInt(5, 15);
  const smInnerOffset = smProcOffset + randInt(4, 12);

  const glueSparkSvc = serviceBlock("dw-glue-spark-job", env, "java", "Spark", "java21", "21.0.3");
  (glueSparkSvc as Record<string, any>).framework = { name: "Spark", version: "3.5.1" };
  const { agent: gjAgent, telemetry: gjTelemetry } = otelBlocks("java", "elastic");
  const s3wFaas = faasBlock("s3-export-worker", region, account.id, "other");
  const rswFaas = faasBlock("redshift-staging-loader", region, account.id, "other");
  const smSvc2 = serviceBlock("sm-unified-prep", env, "python", null, "python3.11", "3.11.9");
  const { agent: smA2, telemetry: smT2 } = otelBlocks("python", "elastic");

  const sfnSvc = serviceBlock(
    "data-lake-pipeline-sfn",
    env,
    "nodejs",
    null,
    "nodejs20.x",
    "20.15.1"
  );

  const docs: any[] = [];

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
      txName: "scheduled pipeline.tick",
      durationUs: ebTotalUs,
      isErr,
      spanCount: 1,
      cloud: cloudBlock(region, account, "events"),
      labels: { rule_name: `pipeline-daily-${region}`, bus: "default" },
    })
  );

  // EventBridge calls StepFunctions.StartExecution as its target — the SFN TX then
  // parents to this span so the waterfall shows EB → StartExecution → SFN workflow.
  docs.push(
    spanDoc({
      ts: offsetTs(base, ebSfnOffset),
      traceId,
      txId: ebTxId,
      parentId: ebTxId,
      spanId: ebSfnSpanId,
      spanType: "external",
      spanSubtype: "stepfunctions",
      spanName: `StepFunctions.StartExecution ${smName}`,
      spanAction: "StartExecution",
      durationUs: ebSfnUs,
      isErr: false,
      destination: "states",
      labels: { state_machine_arn: smArn },
      serviceName: "eventbridge",
      environment: env,
      language: "nodejs",
      runtime: "nodejs20.x",
    })
  );

  docs.push({
    "@timestamp": offsetTs(base, sfnOffset),
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    parent: { id: ebSfnSpanId },
    transaction: {
      id: sfnTxId,
      name: smName,
      type: "workflow",
      duration: { us: sfnTotalUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: 4, dropped: 0 },
    },
    service: sfnSvc,
    ...otelBlocks("nodejs", "elastic"),
    cloud: cloudBlock(region, account, "states"),
    labels: { execution_arn: execArn, state_machine_arn: smArn, pattern: "data_pipeline" },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  });

  docs.push(
    spanDoc({
      ts: offsetTs(base, glueTaskOffset),
      traceId,
      txId: sfnTxId,
      parentId: sfnTxId,
      spanId: glueTaskSpanId,
      spanType: "workflow",
      spanSubtype: "stepfunctions",
      spanName: "StartGlueETL",
      spanAction: "invoke",
      durationUs: glueTaskUs,
      isErr: false,
      destination: "states",
      serviceName: "data-lake-pipeline-sfn",
      environment: env,
      language: "nodejs",
      runtime: "nodejs20.x",
    })
  );

  docs.push({
    "@timestamp": offsetTs(base, glueSparkOffset),
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    parent: { id: glueTaskSpanId },
    transaction: {
      id: glueSparkTxId,
      name: "dw-glue-spark-job [orchestrated]",
      type: "job",
      duration: { us: glueSparkUs },
      result: glueFail ? "failure" : "success",
      sampled: true,
      span_count: { started: 3, dropped: 0 },
    },
    service: glueSparkSvc,
    agent: gjAgent,
    telemetry: gjTelemetry,
    cloud: cloudBlock(region, account, "glue"),
    labels: { glue_job_name: "dw-glue-spark-job" },
    event: { outcome: glueFail ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  });

  docs.push({
    "@timestamp": offsetTs(base, extractOffset),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: glueSparkTxId },
    parent: { id: glueSparkTxId },
    span: {
      id: glueExtractSpanId,
      type: "storage",
      subtype: "s3",
      name: "Extract source partitions",
      duration: { us: glueExtractUs },
      action: "read",
    },
    service: glueSparkSvc,
    agent: gjAgent,
    telemetry: gjTelemetry,
    event: { outcome: "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  });

  docs.push({
    "@timestamp": offsetTs(base, glueTransformOffset),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: glueSparkTxId },
    parent: { id: glueSparkTxId },
    span: {
      id: glueTransformSpanId,
      type: "compute",
      subtype: "glue",
      name: "Transform & apply business rules",
      duration: { us: glueTransformUs },
      action: "execute",
    },
    service: glueSparkSvc,
    agent: gjAgent,
    telemetry: gjTelemetry,
    event: { outcome: "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  });

  docs.push({
    "@timestamp": offsetTs(base, loadS3Offset),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: glueSparkTxId },
    parent: { id: glueSparkTxId },
    span: {
      id: glueLoadS3SpanId,
      type: "storage",
      subtype: "s3",
      name: "Load curated tables to S3",
      duration: { us: glueLoadUs },
      action: "write",
    },
    service: glueSparkSvc,
    agent: gjAgent,
    telemetry: gjTelemetry,
    labels: { s3_bucket: curatedBucket },
    event: { outcome: "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  });

  docs.push(
    spanDoc({
      ts: offsetTs(base, parS3Offset),
      traceId,
      txId: sfnTxId,
      parentId: sfnTxId,
      spanId: parS3StateSpanId,
      spanType: "workflow",
      spanSubtype: "stepfunctions",
      spanName: "ParallelExportToColdArchive",
      spanAction: "invoke",
      durationUs: parS3Us,
      isErr: false,
      destination: "states",
      labels: { branch: "s3_archive" },
      serviceName: "data-lake-pipeline-sfn",
      environment: env,
      language: "nodejs",
      runtime: "nodejs20.x",
    })
  );

  const s3WorkerInitUs = s3wFaas.coldstart ? coldStartInitUs("python3.12") : 0;
  docs.push(
    txDoc({
      ts: offsetTs(base, s3WorkerOffset),
      traceId,
      txId: s3WorkerTxId,
      parentId: parS3StateSpanId,
      serviceName: "s3-export-worker",
      environment: env,
      language: "python",
      runtime: "python3.12",
      framework: "AWS Lambda",
      txType: "lambda",
      txName: "s3-export-worker",
      durationUs: s3WorkerUs + s3WorkerInitUs,
      isErr: false,
      spanCount: 1,
      cloud: cloudBlock(region, account, "lambda"),
      faas: s3wFaas,
      distro: lambdaDistro,
    })
  );
  if (s3wFaas.coldstart) {
    docs.push(
      spanDoc({
        ts: offsetTs(base, s3WorkerOffset),
        traceId,
        txId: s3WorkerTxId,
        parentId: s3WorkerTxId,
        spanId: newSpanId(),
        spanType: "app",
        spanSubtype: "cold-start",
        spanName: "Lambda init: s3-export-worker",
        spanAction: "init",
        durationUs: s3WorkerInitUs,
        isErr: false,
        serviceName: "s3-export-worker",
        environment: env,
        language: "python",
        runtime: "python3.12",
        distro: lambdaDistro,
      })
    );
  }

  docs.push(
    spanDoc({
      ts: offsetTs(base, s3PutOffset),
      traceId,
      txId: s3WorkerTxId,
      parentId: s3WorkerTxId,
      spanId: s3PutSpanId,
      spanType: "storage",
      spanSubtype: "s3",
      spanName: "S3.PutObject cold archive",
      spanAction: "PutObject",
      durationUs: s3PutUs,
      isErr: false,
      destination: "s3",
      labels: { s3_bucket: `${account.name}-cold-archive` },
      serviceName: "s3-export-worker",
      environment: env,
      language: "python",
      runtime: "python3.12",
      distro: lambdaDistro,
    })
  );

  docs.push(
    spanDoc({
      ts: offsetTs(base, parRsOffset),
      traceId,
      txId: sfnTxId,
      parentId: sfnTxId,
      spanId: parRsStateSpanId,
      spanType: "workflow",
      spanSubtype: "stepfunctions",
      spanName: "ParallelWarehouseLoad",
      spanAction: "invoke",
      durationUs: parRsUs,
      isErr: false,
      destination: "states",
      labels: { branch: "redshift_staging" },
      serviceName: "data-lake-pipeline-sfn",
      environment: env,
      language: "nodejs",
      runtime: "nodejs20.x",
    })
  );

  const rsWorkerInitUs = rswFaas.coldstart ? coldStartInitUs("java21") : 0;
  docs.push(
    txDoc({
      ts: offsetTs(base, rsWorkerOffset),
      traceId,
      txId: rsWorkerTxId,
      parentId: parRsStateSpanId,
      serviceName: "redshift-staging-loader",
      environment: env,
      language: "java",
      runtime: "java21",
      framework: "AWS Lambda",
      txType: "lambda",
      txName: "redshift-staging-loader",
      durationUs: rsWorkerUs + rsWorkerInitUs,
      isErr: redshiftFail,
      spanCount: 1,
      cloud: cloudBlock(region, account, "lambda"),
      faas: rswFaas,
      distro: lambdaDistro,
    })
  );
  if (rswFaas.coldstart) {
    docs.push(
      spanDoc({
        ts: offsetTs(base, rsWorkerOffset),
        traceId,
        txId: rsWorkerTxId,
        parentId: rsWorkerTxId,
        spanId: newSpanId(),
        spanType: "app",
        spanSubtype: "cold-start",
        spanName: "Lambda init: redshift-staging-loader",
        spanAction: "init",
        durationUs: rsWorkerInitUs,
        isErr: false,
        serviceName: "redshift-staging-loader",
        environment: env,
        language: "java",
        runtime: "java21",
        distro: lambdaDistro,
      })
    );
  }

  docs.push(
    spanDoc({
      ts: offsetTs(base, rsCopyOffset),
      traceId,
      txId: rsWorkerTxId,
      parentId: rsWorkerTxId,
      spanId: rsCopySpanId,
      spanType: "db",
      spanSubtype: "redshift",
      spanName: "Redshift COPY staging",
      spanAction: "execute",
      durationUs: rsCopyUs,
      isErr: redshiftFail,
      db: {
        type: "sql",
        statement: `COPY staging.fact_pipeline FROM 's3://${curatedBucket}/' ...`,
      },
      destination: "redshift",
      labels: { redshift_cluster: rsCluster },
      serviceName: "redshift-staging-loader",
      environment: env,
      language: "java",
      runtime: "java21",
      distro: lambdaDistro,
    })
  );

  docs.push(
    spanDoc({
      ts: offsetTs(base, smStateOffset),
      traceId,
      txId: sfnTxId,
      parentId: sfnTxId,
      spanId: smStateSpanId,
      spanType: "workflow",
      spanSubtype: "stepfunctions",
      spanName: "SageMakerFeaturePrep",
      spanAction: "invoke",
      durationUs: smStateUs,
      isErr: false,
      destination: "states",
      labels: { target: "sagemaker:CreateProcessingJob" },
      serviceName: "data-lake-pipeline-sfn",
      environment: env,
      language: "nodejs",
      runtime: "nodejs20.x",
    })
  );

  docs.push({
    "@timestamp": offsetTs(base, smProcOffset),
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    parent: { id: smStateSpanId },
    transaction: {
      id: smProcTxId,
      name: "sm-unified-prep",
      type: "job",
      duration: { us: smInnerUs + randInt(40, 150) * 1000 },
      result: smThrottle ? "failure" : "success",
      sampled: true,
      span_count: { started: 1, dropped: 0 },
    },
    service: smSvc2,
    agent: smA2,
    telemetry: smT2,
    cloud: cloudBlock(region, account, "sagemaker"),
    labels: {
      unified_studio_pipeline: "true",
      processing_job: `prep-${randHex(5)}`,
    },
    event: { outcome: smThrottle ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  });

  docs.push({
    "@timestamp": offsetTs(base, smInnerOffset),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: smProcTxId },
    parent: { id: smProcTxId },
    span: {
      id: smSpanId,
      type: "ml",
      subtype: "sagemaker",
      name: "ProcessingJob — features for Unified Studio",
      duration: { us: smInnerUs },
      action: "process",
    },
    service: smSvc2,
    agent: smA2,
    telemetry: smT2,
    event: { outcome: smThrottle ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  });

  // Error documents — distinct exception per failure branch
  if (glueFail) {
    docs.push(
      errorDoc({
        ts: offsetTs(base, glueSparkOffset + glueSparkUs / 1000 - 2),
        traceId,
        txId: glueSparkTxId,
        txType: "job",
        parentId: glueLoadS3SpanId,
        exceptionType: "JobRunFailedException",
        exceptionMessage: `Job run failed: dw-glue-spark-job. Error: Exception in thread "main" org.apache.spark.SparkException: Job aborted due to stage failure: Task ${randInt(0, 63)} in stage 2.0 failed 4 times. Most recent failure: FetchFailed(null, shuffleId=${randInt(0, 9)}, mapIndex=${randInt(0, 31)}, reduceId=${randInt(0, 15)})`,
        culprit: "LakehouseEtlJob.run in LakehouseEtlJob.scala",
        handled: false,
        frames: FRAMES.java_glue(),
        serviceName: "dw-glue-spark-job",
        environment: env,
        language: "java",
        runtime: "java21",
        distro: "elastic",
      })
    );
  }

  if (redshiftFail) {
    docs.push(
      errorDoc({
        ts: offsetTs(base, rsWorkerOffset + rsWorkerUs / 1000 - 2),
        traceId,
        txId: rsWorkerTxId,
        txType: "lambda",
        parentId: rsCopySpanId,
        exceptionType: "RedshiftDataException",
        exceptionMessage: `Load into table 'staging.fact_pipeline' failed. Check 'stl_load_errors' system table for details. COPY from 's3://${curatedBucket}/' aborted: ERROR: Spectrum scan error. The specified S3 prefix does not exist.`,
        culprit: "RedshiftLoader.executeCopy in RedshiftLoader.java",
        handled: false,
        frames: FRAMES.java_redshift(),
        serviceName: "redshift-staging-loader",
        environment: env,
        language: "java",
        runtime: "java21",
        distro: lambdaDistro,
      })
    );
  }

  if (smThrottle) {
    docs.push(
      errorDoc({
        ts: offsetTs(base, smProcOffset + smInnerUs / 1000 - 2),
        traceId,
        txId: smProcTxId,
        txType: "job",
        parentId: smSpanId,
        exceptionType: "ResourceLimitExceeded",
        exceptionMessage: `ResourceLimitExceeded: The account-level service limit 'ml.m5.xlarge for processing job usage' is 4 Instances. Current utilization is 4 Instances. Request to increase the limit can be made to AWS through AWS Support.`,
        culprit: "start_job in sm_prep.py",
        handled: false,
        frames: FRAMES.python_sagemaker_throttle("sm_prep"),
        serviceName: "sm-unified-prep",
        environment: env,
        language: "python",
        runtime: "python3.11",
        distro: "elastic",
      })
    );
  }

  return docs;
}

/** S3 notification → SQS → Lambda → Glue → S3 curated + Redshift + SageMaker Processing */
export function generatePipelineS3SqsChainedTrace(ts: string, er: number) {
  return workflowPipelineS3SqsChained(ts, er);
}

/** EventBridge → Step Functions → Glue + parallel S3/Redshift + SageMaker (data lake pipeline) */
export function generatePipelineStepFunctionsOrchestratedTrace(ts: string, er: number) {
  return workflowPipelineSfnData(ts, er);
}
