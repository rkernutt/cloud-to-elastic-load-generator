import {
  rand,
  randInt,
  randFloat,
  randId,
  randAccount,
  REGIONS,
  randUUID,
  randPersonEmail,
} from "../../helpers";
import type { EcsDocument } from "./types.js";

function generateKinesisStreamsLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const stream = rand([
    "clickstream",
    "user-events",
    "transaction-feed",
    "iot-telemetry",
    "audit-trail",
  ]);
  const shardId = `shardId-0000000000${randInt(0, 9)}`;
  const scenario = rand([
    "shard_split",
    "shard_merge",
    "enhanced_fanout",
    "throughput_exceeded",
    "iterator_expired",
    "data_plane_put_get",
  ] as const);
  const throughputOp = rand(["PutRecords", "PutRecord", "GetRecords"]);
  const op =
    scenario === "shard_split"
      ? "SplitShard"
      : scenario === "shard_merge"
        ? "MergeShards"
        : scenario === "enhanced_fanout"
          ? "SubscribeToShard"
          : scenario === "throughput_exceeded"
            ? throughputOp
            : scenario === "iterator_expired"
              ? "GetRecords"
              : rand(["PutRecord", "PutRecords", "GetRecords", "SubscribeToShard"]);
  const putBatch = randInt(1, 500);
  const efoConsumers = randInt(0, isErr ? 120 : 40);
  const iteratorAgeMs = randInt(isErr ? 360000 : 500, isErr ? 7200000 : 120000);
  const throughputLine = `Throughput throttled (${scenario}) WriteProvisionedThroughputExceeded stream=${stream} shard=${shardId} attempts=${randInt(3, 20)}`;

  let controlPlaneMsg: string;
  if (scenario === "shard_split") {
    controlPlaneMsg = `SplitShard parent=${shardId} -> child shards shardId-0000000000${randInt(0, 9)},shardId-0000000000${randInt(
      0,
      9
    )} on ${stream}`;
  } else if (scenario === "shard_merge") {
    controlPlaneMsg = `MergeShards adjacent shards into target=${shardId} stream=${stream} completed`;
  } else if (scenario === "enhanced_fanout") {
    controlPlaneMsg = `SubscribeToShard consumerARN=arn:aws:kinesis:${region}:${acct.id}:stream-consumer/${stream}/consumer-${randId(
      8
    ).toLowerCase()} shard=${shardId} concurrent=${efoConsumers}`;
  } else if (scenario === "throughput_exceeded") {
    controlPlaneMsg =
      op === "PutRecords"
        ? `PutRecords partially failed (${putBatch} records) ProvisionedThroughputExceeded ${stream}`
        : op === "PutRecord"
          ? `PutRecord throttled pk=${randId(6)} ${stream}`
          : `GetRecords throttled iteratorAge=${iteratorAgeMs}ms ${shardId}`;
  } else if (scenario === "iterator_expired") {
    controlPlaneMsg = `GetRecords ${stream}/${shardId} sequence=${randInt(1e12, 9e15)} ExpiredIteratorException — refresh ShardIterator`;
  } else {
    controlPlaneMsg =
      op === "PutRecords"
        ? `PutRecords succeeded: ${putBatch} records (${randInt(1024, 4_000_000)} bytes) to ${stream}/${shardId}`
        : op === "PutRecord"
          ? `PutRecord succeeded: partitionKey=${randId(6)} sequenceNumber=${randInt(1e12, 9e15)} stream=${stream}`
          : op === "SubscribeToShard"
            ? `SubscribeToShard: consumer ${randId(8).toLowerCase()} connected (${efoConsumers} concurrent)`
            : `GetRecords returned ${randInt(1, 2000)} records from ${stream}/${shardId}`;
  }

  const useStructuredFailure = isErr && Math.random() < 0.42;
  const errCodeRand = rand([
    "ExpiredIteratorException",
    "ProvisionedThroughputExceededException",
    "InvalidArgumentException",
    "KMSThrottlingException",
    "ResourceNotFoundException",
    "LimitExceededException",
  ]);

  const message =
    useStructuredFailure && isErr
      ? JSON.stringify({
          __type: errCodeRand,
          message:
            scenario === "iterator_expired"
              ? "Iterator expired — call GetShardIterator"
              : throughputLine,
          streamName: stream,
          shardId,
          operation: op,
          scenario,
        })
      : isErr
        ? `${controlPlaneMsg} [${errCodeRand}]`
        : controlPlaneMsg;
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "kinesis" },
    },
    aws: {
      dimensions: { StreamName: stream },
      kinesis: {
        operation: op,
        scenario,
        shard_id: shardId,
        enhanced_fan_out_subscribers: efoConsumers,
        metrics: {
          GetRecords_Bytes: { avg: randInt(1000, 1e6) },
          GetRecords_IteratorAgeMilliseconds: {
            avg:
              scenario === "iterator_expired" || scenario === "throughput_exceeded"
                ? iteratorAgeMs
                : isErr
                  ? randInt(10000, 3600000)
                  : randInt(0, 1000),
          },
          GetRecords_Latency: { avg: randInt(1, 50) },
          GetRecords_Records: { avg: randInt(1, 1000), sum: randInt(1, 1000) },
          GetRecords_Success: { sum: isErr ? 0 : 1 },
          IncomingBytes: { avg: randInt(1000, 1e7) },
          IncomingRecords: { avg: randInt(1, 10000) },
          PutRecord_Bytes: { avg: randInt(100, 1e6) },
          PutRecord_Latency: { avg: randInt(1, 100) },
          PutRecords_Latency: { avg: randInt(1, 200) },
          PutRecord_Success: { avg: isErr ? 0 : 1 },
          PutRecords_Bytes: { avg: randInt(1000, 1e7) },
          PutRecords_FailedRecords: { sum: isErr ? randInt(1, 100) : 0 },
          PutRecords_SuccessfulRecords: { sum: randInt(1, 1000) },
          PutRecords_ThrottledRecords: { sum: isErr ? randInt(1, 10) : 0 },
          ReadProvisionedThroughputExceeded: { avg: isErr ? randInt(1, 10) : 0 },
          WriteProvisionedThroughputExceeded: { avg: isErr ? randInt(1, 10) : 0 },
        },
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["network"],
      type: ["connection"],
      dataset: "aws.kinesis",
      provider: "kinesis.amazonaws.com",
      duration: randInt(1, isErr ? 60000 : 5000) * 1e6,
    },
    message,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: errCodeRand,
            message:
              scenario === "iterator_expired"
                ? "Shard iterator expired; clients must obtain a new iterator"
                : scenario === "throughput_exceeded"
                  ? "Kinesis stream exceeded provisioned writes or reads"
                  : `Kinesis ${op} failed (${scenario})`,
            type: "aws",
          },
        }
      : {}),
  };
}

function generateFirehoseLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const stream = rand([
    "logs-to-s3",
    "events-to-redshift",
    "metrics-to-opensearch",
    "clickstream-backup",
    "security-lake-feed",
  ]);
  const dest = rand(["S3", "Redshift", "OpenSearch", "HTTPEndpoint", "Splunk"]);
  const recs = randInt(100, 50000);
  const incomingBytes = recs * randInt(200, 2000);
  const bufferingHintMb = rand([1, 3, 5, 15, 64, 128]);
  const r = randFloat(0, 1);
  const scenario =
    r < 0.32
      ? "delivery_ok"
      : r < 0.48
        ? "buffer_flush"
        : r < 0.62
          ? "s3_backup"
          : r < 0.76
            ? "transformation_lambda_invoke"
            : r < 0.88
              ? "delivery_failure"
              : "format_conversion_error";
  const scenarioIsFailure =
    scenario === "delivery_failure" || scenario === "format_conversion_error";
  const isErr = scenarioIsFailure || (!scenarioIsFailure && Math.random() < er);
  const op = rand(["PutRecord", "PutRecordBatch", "CreateDeliveryStream"]);
  const lambdaArn = `arn:aws:lambda:${region}:${acct.id}:function:${rand(["fh-transform", "decompress-json", "enrich-records"])}`;
  const errCode = rand([
    "ServiceUnavailableException",
    "ResourceNotFoundException",
    "InvalidArgumentException",
  ] as const);
  const scenarioMessages: Record<string, string> = {
    delivery_ok:
      op === "PutRecordBatch"
        ? `PutRecordBatch: accepted ${randInt(50, 500)} records for ${stream} (${incomingBytes.toLocaleString()} IncomingBytes)`
        : op === "PutRecord"
          ? `PutRecord: buffered partitionKey=${randId(8)} DeliveryStream=${stream}`
          : `CreateDeliveryStream: ACTIVE ${stream} destination=${dest}`,
    buffer_flush: `Flush triggered: BufferingHints SizeInMB=${bufferingHintMb} IntervalSeconds=${randInt(60, 300)} stream=${stream}`,
    s3_backup: `DeliveryToS3 backup prefix s3://${rand(["corp-logs", "fh-archive"])}/${acct.id}/${stream}/year=${randInt(2024, 2026)}/${isErr ? "failed/" : ""}${randId(6)}/`,
    transformation_lambda_invoke: `Lambda processing ${lambdaArn}: ${randInt(1, 200)} batches, IncomingRecords=${recs}`,
    delivery_failure: `Destination delivery failed for ${stream}: DeliveryStreamBufferingHintSizeInMB=${bufferingHintMb} exceeded before ack; ${dest} PutObject throttled`,
    format_conversion_error: `Format conversion ${rand(["ORC", "Parquet", "JSON"])} failed for ${stream}: schema mismatch on ${rand(["ts", "event_id", "dimensions"])}`,
  };
  const message = isErr
    ? scenarioIsFailure
      ? `${scenarioMessages[scenario]} [${errCode}]`
      : `${scenarioMessages[scenario]} — throttled: ${errCode}`
    : scenarioMessages[scenario];
  const execProcMs = randInt(50, scenario === "transformation_lambda_invoke" ? 8000 : 1200);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "firehose" },
    },
    aws: {
      dimensions: { DeliveryStreamName: stream },
      firehose: {
        delivery_stream_name: stream,
        destination: dest,
        operation: op,
        scenario,
        incoming_records: recs,
        incoming_bytes: incomingBytes,
        delivery_success: !isErr,
        delivery_records:
          isErr && scenario === "delivery_failure" ? 0 : Math.min(recs, randInt(recs >> 1, recs)),
        data_freshness_seconds: randInt(30, isErr ? 7200 : 240),
        transformation: {
          lambda_arn:
            scenario === "transformation_lambda_invoke" || dest === "S3"
              ? rand([lambdaArn, null])
              : null,
          buffer_size_mb: bufferingHintMb,
          interval_seconds: randInt(60, 900),
          compression: rand(["SNAPPY", "GZIP", "UNCOMPRESSED"]),
        },
        s3_delivery: {
          prefix_template: "!{timestamp:yyyy/MM/dd}/",
          error_prefix: scenario === "s3_backup" && isErr ? `errors/${stream}/` : null,
          encryption: rand(["SSE_S3", "SSE_KMS", "NONE"]),
        },
        metrics: {
          IncomingBytes: { sum: incomingBytes },
          IncomingRecords: { sum: recs },
          "DeliveryToS3.Success": { avg: isErr && scenario !== "s3_backup" ? 0 : 1 },
          "DeliveryToS3.Bytes": { sum: randInt(1000, Math.max(1000, incomingBytes)) },
          "DeliveryToS3.DataFreshness": { avg: randInt(30, isErr ? 3600 : 180) },
          "DeliveryToS3.Records": { sum: isErr ? randInt(0, recs) : recs },
          "ExecuteProcessing.Duration": { avg: execProcMs, max: execProcMs + randInt(0, 400) },
          "ExecuteProcessing.Success": {
            avg:
              scenario === "format_conversion_error" ||
              (isErr && scenario === "transformation_lambda_invoke")
                ? 0
                : 1,
          },
          "BackupToS3.Bytes": {
            sum: scenario === "s3_backup" ? randInt(1e4, 1e7) : randInt(0, 1e5),
          },
          "BackupToS3.Records": {
            sum: scenario === "s3_backup" ? randInt(10, 5000) : randInt(0, 100),
          },
          "BackupToS3.Success": {
            avg: scenario === "s3_backup" && !isErr ? 1 : scenario === "s3_backup" ? 0 : 1,
          },
          "DataReadFromKinesisStream.Bytes": { sum: randInt(1000, 1e8) },
          "DataReadFromKinesisStream.Records": { sum: randInt(1, 10000) },
          ThrottledGetRecords: { sum: isErr ? randInt(1, 10) : 0 },
          ThrottledGetShardIterator: { sum: 0 },
        },
      },
    },
    event: {
      action: scenario,
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      type: ["info"],
      dataset: "aws.firehose",
      provider: "firehose.amazonaws.com",
      duration:
        (scenario === "transformation_lambda_invoke" ? execProcMs : randInt(1, isErr ? 300 : 90)) *
        1e9,
    },
    message,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: errCode,
            message:
              scenario === "format_conversion_error"
                ? "Record format conversion could not be applied"
                : scenario === "delivery_failure"
                  ? `Firehose could not deliver to ${dest} (buffering hint ${bufferingHintMb}MB)`
                  : `Firehose ${op} rejected for ${stream}`,
            type: "aws",
          },
        }
      : {}),
  };
}

function generateKinesisAnalyticsLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const app = rand([
    "clickstream-analytics",
    "fraud-detection-stream",
    "real-time-metrics",
    "session-aggregator",
    "anomaly-detector",
  ]);
  const rps = randInt(100, isErr ? 50000 : 10000);
  const lagMs = randInt(0, isErr ? 60000 : 1000);
  const kinesisAnalyticsMsgs = isErr
    ? [
        "Application failed",
        "Checkpoint failed",
        `Kinesis Analytics ${app} error: ${rand(["CheckpointFailure", "KPU_LIMIT_EXCEEDED", "OOM"])}`,
      ]
    : [
        "Application started",
        "Checkpoint completed",
        `Kinesis Analytics ${app}: ${rps} rec/s, lag ${randInt(0, 500)}ms`,
      ];
  const plainMessage = rand(kinesisAnalyticsMsgs);
  const useStructuredLogging = Math.random() < 0.6;
  const message = useStructuredLogging
    ? JSON.stringify({
        applicationName: app,
        recordsPerSecond: rps,
        inputWatermarkLagMs: lagMs,
        level: isErr ? "error" : "info",
        message: plainMessage,
        timestamp: new Date(ts).toISOString(),
      })
    : plainMessage;
  const metrics = {
    records_in_per_second: rps,
    input_watermark_lag_ms: lagMs,
    kpu_utilization_pct: randInt(20, isErr ? 99 : 80),
    checkpoint_duration_ms: randInt(100, isErr ? 30000 : 2000),
  };
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "kinesisanalytics" },
    },
    aws: {
      kinesisanalytics: {
        application_name: app,
        application_arn: `arn:aws:kinesisanalytics:${region}:${acct.id}:application/${app}`,
        runtime: rand(["FLINK-1_18", "FLINK-1_15", "SQL-1_0"]),
        records_per_second: rps,
        input_watermark_lag_ms: lagMs,
        checkpointing_enabled: true,
        last_checkpoint_duration_ms: randInt(100, isErr ? 30000 : 2000),
        kpu_count: randInt(1, 64),
        structured_logging: useStructuredLogging,
        metrics,
        error: isErr ? rand(["CheckpointFailure", "OutOfMemory", "KPU_LIMIT_EXCEEDED"]) : null,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      type: ["info"],
      dataset: "aws.kinesisanalytics",
      provider: "kinesisanalytics.amazonaws.com",
      duration: randInt(100, isErr ? 30000 : 2000) * 1e6,
    },
    message: message,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand(["CheckpointFailure", "OutOfMemory", "KPU_LIMIT_EXCEEDED"]),
            message: "Kinesis Analytics application error",
            type: "stream",
          },
        }
      : {}),
  };
}

function generateMskLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const topic = rand([
    "user-events",
    "order-updates",
    "inventory-changes",
    "notifications",
    "payments",
  ]);
  const partition = randInt(0, 23);
  const clusterName = `prod-kafka-${region}`;
  const brokerId = randInt(1, 6);
  const tsBracket = ts.replace("T", " ").replace("Z", "");
  const level = isErr ? "ERROR" : Math.random() < 0.12 ? "WARN" : "INFO";
  const component = rand([
    "ReplicaFetcherManager",
    "ReplicaManager",
    "GroupCoordinator",
    "KafkaApi",
    "Controller",
    "LogManager",
  ]);
  const kafkaClass = rand([
    "kafka.server.ReplicaFetcherManager",
    "kafka.server.ReplicaManager",
    "kafka.coordinator.group.GroupCoordinator",
    "kafka.server.KafkaApis",
    "kafka.controller.KafkaController",
    "kafka.log.LogManager",
  ]);
  const cg = rand(["analytics-consumer", "etl-pipeline", "alerting-service"]);
  const brokerLine =
    level === "ERROR" && Math.random() < 0.5
      ? `[${tsBracket}] ${level} [${component} broker=${brokerId}] Error processing fetch for partition ${topic}-${partition} (kafka.server.ReplicaManager)`
      : level === "WARN" || (isErr && Math.random() < 0.4)
        ? `[${tsBracket}] WARN [${component} broker=${brokerId}] ISR shrink: partition ${topic}-${partition} isr=[${brokerId},${(brokerId % 3) + 1}] -> [${brokerId}] (${kafkaClass})`
        : Math.random() < 0.25
          ? `[${tsBracket}] INFO [${component} broker=${brokerId}] Created topic "${topic}" with ${randInt(3, 24)} partitions, replication factor 3 (${kafkaClass})`
          : Math.random() < 0.35
            ? `[${tsBracket}] INFO [${component}] [GroupCoordinator ${brokerId}]: Preparing to rebalance group ${cg} with old generation ${randInt(1, 40)} (${kafkaClass})`
            : `[${tsBracket}] INFO [${component} broker=${brokerId}] Completed fetch of ${randInt(1, 5000)} messages for partition ${topic}-${partition} at offset ${randInt(0, 1e9)} (${kafkaClass})`;
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "msk" },
    },
    aws: {
      dimensions: { "Cluster Name": clusterName, "Broker ID": String(brokerId), Topic: topic },
      msk: {
        cluster_name: clusterName,
        broker_id: brokerId,
        kafka_version: "3.5.1",
        topic,
        partition,
        offset: randInt(0, 100000000),
        consumer_group: cg,
        lag: isErr ? randInt(10000, 1000000) : randInt(0, 100),
        under_replicated_partitions: isErr ? randInt(1, 20) : 0,
        metrics: {
          BytesInPerSec: { avg: randInt(1000, 1e7) },
          BytesOutPerSec: { avg: randInt(1000, 1e7) },
          MessagesInPerSec: { avg: randInt(1, 10000) },
          FetchConsumerTotalTimeMsMean: { avg: randInt(1, 100) },
          ProduceTotalTimeMsMean: { avg: randInt(1, 50) },
          UnderReplicatedPartitions: { avg: isErr ? randInt(1, 5) : 0 },
          UnderMinIsrPartitionCount: { avg: isErr ? randInt(1, 3) : 0 },
          OfflinePartitionsCount: { avg: isErr ? randInt(0, 2) : 0 },
          ActiveControllerCount: { avg: 1 },
          GlobalPartitionCount: { avg: randInt(10, 1000) },
          GlobalTopicCount: { avg: randInt(1, 100) },
          KafkaDataLogsDiskUsed: { avg: randFloat(10, 90) },
          CPUUser: { avg: randFloat(1, 80) },
          CPUSystem: { avg: randFloat(1, 20) },
          NetworkRxDropped: { sum: 0 },
          NetworkTxDropped: { sum: 0 },
        },
      },
    },
    kafka: { topic, partition },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process", "network"],
      type: ["connection"],
      dataset: "aws.msk",
      provider: "kafka.amazonaws.com",
      duration: randInt(1, isErr ? 5000 : 100) * 1e6,
    },
    message: brokerLine,
    log: { level: level === "ERROR" ? "error" : level === "WARN" ? "warn" : "info" },
    ...(isErr
      ? {
          error: {
            code: "UnderReplicatedPartitions",
            message: "MSK partition replication lag",
            type: "stream",
          },
        }
      : {}),
  };
}

function generateSqsLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const hasTrace = Math.random() < 0.6;
  const traceId = hasTrace ? randId(32) : null;
  const scenario = rand([
    "dead_letter_redrive",
    "fifo_deduplication",
    "visibility_timeout",
    "long_polling",
    "batch_action",
    "standard_send_receive",
  ] as const);
  const queue =
    scenario === "fifo_deduplication"
      ? rand(["orders.fifo", "payments.fifo", "events.fifo"])
      : rand([
          "order-processing",
          "email-queue",
          "notification-dlq",
          "webhook-events",
          "job-queue",
        ]);
  const isDlq = queue.includes("dlq");
  const sent = randInt(1, 10000);
  const received = randInt(0, sent);
  const queueUrl = `https://sqs.${region}.amazonaws.com/${acct.id}/${queue}`;
  const operation =
    scenario === "dead_letter_redrive"
      ? "StartMessageMoveTask"
      : scenario === "fifo_deduplication"
        ? "SendMessage"
        : scenario === "visibility_timeout"
          ? "ChangeMessageVisibility"
          : scenario === "long_polling"
            ? "ReceiveMessage"
            : scenario === "batch_action"
              ? rand(["ReceiveMessage", "DeleteMessage", "SendMessageBatch", "DeleteMessageBatch"])
              : rand(["SendMessage", "ReceiveMessage", "DeleteMessage", "ChangeMessageVisibility"]);
  const approxVisible = randInt(0, isErr ? 250_000 : 8_000);
  const approxNotVisible = randInt(0, Math.min(approxVisible, 4_000));
  const approxDelayed = randInt(0, 1_200);
  const batch =
    operation === "ReceiveMessage"
      ? randInt(1, 10)
      : operation === "DeleteMessage" || operation === "DeleteMessageBatch"
        ? randInt(1, 10)
        : operation === "SendMessageBatch"
          ? randInt(2, 10)
          : 1;
  const visibilityTimeout = operation === "ChangeMessageVisibility" ? randInt(0, 900) : null;
  const waitSeconds = scenario === "long_polling" ? 20 : 0;
  const dedupeId = scenario === "fifo_deduplication" ? `dedup-${randId(32).toLowerCase()}` : null;
  const opLine =
    operation === "SendMessage"
      ? scenario === "fifo_deduplication"
        ? `SQS SendMessage FIFO queue=${queueUrl} MessageDeduplicationId=${dedupeId} MessageGroupId=${rand(["a", "b", "checkout"])} bodyBytes=${randInt(120, 240_000)}`
        : `SQS SendMessage queue=${queueUrl} sent=${sent} approximate_total=${approxVisible + approxNotVisible + approxDelayed} bodyBytes=${randInt(120, 240_000)}`
      : operation === "SendMessageBatch"
        ? `SQS SendMessageBatch queue=${queueUrl} entries=${batch} failed=${isErr ? randInt(1, batch) : 0}`
        : operation === "ReceiveMessage"
          ? `SQS ReceiveMessage queue=${queueUrl} WaitTimeSeconds=${waitSeconds} messages_returned=${batch} long_poll=${waitSeconds > 0}`
          : operation === "DeleteMessage"
            ? `SQS DeleteMessage queue=${queueUrl} deleted=${batch} remaining_visible≈${Math.max(0, approxVisible - batch)}`
            : operation === "DeleteMessageBatch"
              ? `SQS DeleteMessageBatch queue=${queueUrl} successful=${isErr ? 0 : batch} failed=${isErr ? randInt(1, batch) : 0}`
              : operation === "ChangeMessageVisibility"
                ? `SQS ChangeMessageVisibility queue=${queueUrl} receipt_batches=${batch} new_timeout_sec=${visibilityTimeout} visible≈${approxVisible}`
                : operation === "StartMessageMoveTask"
                  ? `SQS StartMessageMoveTask source=${queueUrl} destination=https://sqs.${region}.amazonaws.com/${acct.id}/${rand(["main-queue", "replay-queue"])} maxMessages=${randInt(100, 10000)}`
                  : `SQS PurgeQueue queue=${queueUrl} purged_inflight_hint visible≈${approxVisible} notVisible≈${approxNotVisible}`;
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "sqs" },
    },
    aws: {
      dimensions: { QueueName: queue },
      sqs: {
        queue: { name: queue, url: queueUrl },
        operation,
        scenario,
        fifo: queue.endsWith(".fifo"),
        long_poll_wait_seconds: waitSeconds,
        message_deduplication_id: dedupeId,
        oldest_message_age: { sec: randInt(0, isErr ? 86400 : 300) },
        messages: {
          delayed: approxDelayed,
          not_visible: approxNotVisible,
          visible: approxVisible,
          deleted: randInt(1, 1000),
          received: Math.max(1, received),
          sent: sent,
        },
        empty_receives: randInt(0, 100),
        sent_message_size: { bytes: randInt(1, 256000) },
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      type: ["info"],
      dataset: "aws.sqs",
      provider: "sqs.amazonaws.com",
      duration: randInt(1, isErr ? 30000 : 500) * 1e6,
    },
    message:
      isErr && Math.random() < 0.38
        ? JSON.stringify({
            __type: rand([
              "ReceiptHandleIsInvalid",
              "AWS.SimpleQueueService.TooManyEntriesInBatchRequest",
              "UnsupportedOperation",
            ]),
            messagePlain: opLine,
            scenario,
          })
        : isErr || isDlq
          ? `${opLine} | error: ${randInt(1, 1000)} messages dead-lettered after max retries`
          : opLine,
    log: { level: isErr || isDlq ? "warn" : "info" },
    ...(isErr || isDlq
      ? {
          error: {
            code: rand([
              "AWS.SimpleQueueService.NonExistentQueue",
              "InvalidMessageContents",
              "MessageNotInflight",
              "OverLimit",
              "QueueAlreadyExists",
              "QueueDeletedRecently",
              "QueueDoesNotExist",
              "ReceiptHandleIsInvalid",
              "UnsupportedOperation",
              "AWS.SimpleQueueService.TooManyEntriesInBatchRequest",
            ]),
            message:
              scenario === "dead_letter_redrive"
                ? "Message move task failed: destination policy denies sqs:SendMessage"
                : scenario === "fifo_deduplication"
                  ? "Duplicate MessageDeduplicationId within deduplication interval"
                  : "SQS API rejected the request",
            type: "aws",
          },
        }
      : {}),
    ...(hasTrace ? { trace: { id: traceId } } : {}),
    ...(hasTrace ? { transaction: { id: randId(16) } } : {}),
  };
}

function generateSnsLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const scenario = rand([
    "platform_endpoint_create",
    "topic_subscription",
    "delivery_failure_logging",
    "filter_policy_match",
    "publish_delivery",
  ] as const);
  const topic = rand([
    "order-notifications",
    "user-alerts",
    "system-events",
    "security-alarms",
    "deployment-events",
  ]);
  const protocol = rand(["email", "sqs", "lambda", "http", "sms", "application"]);
  const published = randInt(1, 10000);
  const delivered = isErr ? randInt(0, Math.floor(published * 0.9)) : published;
  const deliveryLatencyMs = Number(randFloat(5, isErr ? 30000 : 500));
  const snsOperation =
    scenario === "platform_endpoint_create"
      ? "CreatePlatformEndpoint"
      : scenario === "topic_subscription"
        ? "Subscribe"
        : scenario === "delivery_failure_logging"
          ? "GetTopicAttributes"
          : scenario === "filter_policy_match"
            ? "Publish"
            : "Publish";
  const topicArn = `arn:aws:sns:${region}:${acct.id}:${topic}`;
  const platformAppArn =
    scenario === "platform_endpoint_create"
      ? `arn:aws:sns:${region}:${acct.id}:app/GCM/mobile-push`
      : null;
  const endpointArn =
    scenario === "platform_endpoint_create"
      ? `arn:aws:sns:${region}:${acct.id}:endpoint/GCM/mobile-app/${randId(10)}`
      : `arn:aws:sns:${region}:${acct.id}:endpoint/APNS/production/${randId(8)}`;
  const subscriptionArn =
    scenario === "topic_subscription"
      ? `arn:aws:sns:${region}:${acct.id}:${topic}:${randId(8)}-sub`
      : `arn:aws:sns:${region}:${acct.id}:${topic}:${randUUID().slice(0, 12)}`;

  let message: string;
  if (scenario === "platform_endpoint_create") {
    message = isErr
      ? `SNS CreatePlatformEndpoint FAILED Token=*** PlatformApplicationArn=${platformAppArn} InvalidParameter`
      : `SNS CreatePlatformEndpoint OK EndpointArn=${endpointArn}`;
  } else if (scenario === "topic_subscription") {
    message = isErr
      ? `SNS Subscribe topic=${topicArn} Protocol=${protocol} FAILED (InvalidParameter)`
      : `SNS Subscribe confirmed SubscriptionArn=${subscriptionArn} Owner=${acct.id}`;
  } else if (scenario === "delivery_failure_logging") {
    message =
      JSON.stringify({
        notification: { messageId: randUUID(), topicArn },
        delivery: {
          statusCode: isErr ? rand([502, 503]) : 200,
          providerResponse: isErr ? "Endpoint disabled or unreachable" : "OK",
          destination: rand([`mailto:${randPersonEmail()}`, "lambda arn"]),
        },
        status: isErr ? "FAILURE" : "SUCCESS",
      }) + ` [DeliveryStatusLogging]`;
  } else if (scenario === "filter_policy_match") {
    message = isErr
      ? `Publish to ${topic} filtered out — no subscriber filter policy matched attributes tier=premium`
      : `Delivered Publish messageId=${randUUID()} matched filter policy subscriber=${subscriptionArn}`;
  } else {
    message = isErr
      ? `SNS Publish delivery FAILED: ${topic} -> ${protocol}: ${rand(["EndpointDisabledException", "Throttled"])}`
      : `SNS Publish delivered to ${protocol} (${randInt(100, 50000)}B)`;
  }

  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "sns" },
    },
    aws: {
      dimensions: { TopicName: topic },
      sns: {
        scenario,
        operation: snsOperation,
        topic_arn: topicArn,
        platform_application_arn: platformAppArn,
        endpoint_arn:
          scenario === "platform_endpoint_create" || protocol === "application"
            ? endpointArn
            : null,
        subscription_arn: subscriptionArn,
        protocol,
        filter_policy:
          scenario === "filter_policy_match"
            ? JSON.stringify({
                tier: ["premium", "enterprise"],
                region: [{ prefix: "us-" }],
              })
            : null,
        metrics: {
          NumberOfMessagesPublished: { sum: published },
          NumberOfNotificationsDelivered: { sum: delivered },
          NumberOfNotificationsFailed: { sum: published - delivered },
          NumberOfNotificationsFilteredOut: { sum: Math.random() < 0.1 ? 1 : 0 },
          "NumberOfNotificationsFilteredOut-InvalidAttributes": { sum: 0 },
          "NumberOfNotificationsFilteredOut-NoMessageAttributes": { sum: 0 },
          NumberOfNotificationsRedrivenToDlq: { sum: isErr ? randInt(0, 5) : 0 },
          NumberOfNotificationsFailedToRedriveToDlq: { sum: 0 },
          PublishSize: { avg: randInt(1, 256000) },
          SMSSuccessRate: { avg: protocol === "sms" ? (Math.random() > 0.05 ? 1 : 0) : null },
          SMSMonthToDateSpentUSD: { sum: protocol === "sms" ? Number(randFloat(0, 50)) : 0 },
        },
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      type: ["info"],
      dataset: "aws.sns",
      provider: "sns.amazonaws.com",
      duration: deliveryLatencyMs * 1e6,
    },
    message,
    log: { level: isErr ? "warn" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "AuthorizationErrorException",
              "EndpointDisabledException",
              "InternalErrorException",
              "InvalidParameterException",
              "InvalidParameterValueException",
              "ThrottledException",
              "NotFoundException",
            ]),
            message:
              scenario === "platform_endpoint_create"
                ? "SNS rejected mobile device registration token"
                : scenario === "topic_subscription"
                  ? "ConfirmSubscription or IAM denied Subscribe"
                  : scenario === "filter_policy_match"
                    ? "Message attributes incompatible with subscriber filter policies"
                    : "SNS endpoint delivery failed",
            type: "aws",
          },
        }
      : {}),
  };
}

function generateAmazonMqLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const brokerType = rand(["ActiveMQ", "RabbitMQ"]);
  const broker = rand(["prod-broker", "events-broker", "order-processor"]);
  const queue = rand(["order.queue", "notification.exchange", "payment.queue", "dlq.orders"]);
  const MSGS = {
    error: [
      "Broker disk usage exceeded 90%",
      "Connection to secondary broker lost",
      "Message redelivery limit: DLQ",
      "JVM heap exhausted",
    ],
    warn: [
      "Queue depth above threshold: 45000 messages",
      "Slow consumer: 10 msg/s",
      "Broker memory usage: 78%",
    ],
    info: [
      "Message consumed successfully",
      "Producer connected",
      "Consumer registered",
      "Queue purged",
    ],
  };
  const level = isErr ? "error" : Math.random() < 0.1 ? "warn" : "info";
  const messagesIn = randInt(0, 10000);
  const messagesOut = randInt(0, 10000);
  const queueDepth = isErr ? randInt(50000, 500000) : randInt(0, 5000);
  const brokerMemPct = isErr ? randInt(80, 100) : randInt(20, 70);
  const durSec = Number(randFloat(0.01, isErr ? 30 : 2));
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "amazonmq" },
    },
    aws: {
      amazonmq: {
        broker_id: `b-${randId(8)}-${randId(4)}`.toLowerCase(),
        broker_name: broker,
        broker_engine: brokerType,
        engine_version: brokerType === "ActiveMQ" ? "5.17.6" : "3.12.1",
        deployment_mode: rand(["SINGLE_INSTANCE", "ACTIVE_STANDBY_MULTI_AZ"]),
        queue_name: queue,
        messages_in: messagesIn,
        messages_out: messagesOut,
        queue_depth: queueDepth,
        broker_memory_percent: brokerMemPct,
        metrics: {
          ConsumerCount: { avg: randInt(1, 100) },
          ProducerCount: { avg: randInt(1, 50) },
          QueueSize: { avg: randInt(0, 10000) },
          EnqueueCount: { sum: randInt(1, 10000) },
          DequeueCount: { sum: randInt(1, 10000) },
          InFlightCount: { avg: randInt(0, 500) },
          DispatchCount: { sum: randInt(1, 10000) },
          ExpiredCount: { sum: randInt(0, 100) },
          NetworkConnectorStarted: { sum: Math.random() > 0.9 ? 1 : 0 },
          HeapUsage: { avg: randFloat(10, 80) },
          StorePercentUsage: { avg: randFloat(5, 70) },
          TotalEnqueueCount: { sum: randInt(1000, 1e6) },
          TotalDequeueCount: { sum: randInt(1000, 1e6) },
          TotalConsumerCount: { avg: randInt(1, 100) },
          TotalProducerCount: { avg: randInt(1, 50) },
        },
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process", "network"],
      type: ["connection"],
      dataset: "aws.amazonmq",
      provider: "mq.amazonaws.com",
      duration: durSec * 1e9,
    },
    message: rand(MSGS[level]),
    log: { level },
    ...(isErr
      ? { error: { code: "BrokerError", message: rand(MSGS.error), type: "messaging" } }
      : {}),
  };
}

function generateEventBridgeLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const targetsInvoked = randInt(1, 5);
  const rule = rand([
    "order-created-rule",
    "user-signup-trigger",
    "scheduled-cleanup",
    "cost-alert-rule",
    "security-event-forwarder",
  ]);
  const source = rand(["aws.ec2", "aws.s3", "custom.app", "aws.health", "com.partner.events"]);
  const eventBus = rand(["default", "custom-events", "app-events"]);
  const eventId = randUUID();
  const logKind = rand([
    "rule_match",
    "target_delivery",
    "archive_replay",
    "schema_discovery",
    "pipe_enrichment",
  ] as const);
  const targetArn = `arn:aws:lambda:${region}:${acct.id}:function:${rand(["processOrder", "emitMetric", "fanOut"])}`;
  const dlqArn = `arn:aws:sqs:${region}:${acct.id}:${rand(["eb-dlq", "rules-dlq"])}`;
  const pipeName = rand(["orders-to-lambda", "audit-to-sqs", "metrics-to-kinesis"]);
  const registryName = rand(["partner-events", "internal-schemas"]);
  const archiveArn = `arn:aws:events:${region}:${acct.id}:archive/${rand(["audit", "security"])}-${randId(6)}`;
  const enrichmentArn = `arn:aws:lambda:${region}:${acct.id}:function:${rand(["enrichOrder", "maskPii", "addGeo"])}`;
  const plainMessage =
    logKind === "rule_match"
      ? `EventBridge RuleMatch rule=${rule} bus=${eventBus} matched_events=${randInt(1, 500)} pattern_matched=true eventId=${eventId}`
      : logKind === "target_delivery"
        ? `EventBridge TargetDelivery rule=${rule} target=${targetArn} status=${isErr ? "FAILED" : "SUCCESS"} httpStatus=${isErr ? rand([502, 503, 504, 429]) : 200} attempt=${randInt(1, 4)}`
        : logKind === "archive_replay"
          ? `EventBridge StartReplay replay_name=${randId(8).toLowerCase()} archive_arn=${archiveArn} event_count=${randInt(100, 50000)} destination_bus=${eventBus} state=${isErr ? "FAILED" : "COMPLETED"}`
          : logKind === "schema_discovery"
            ? `EventBridge SchemaDiscovery registry=${registryName} discovered_type=${rand(["OrderPlaced@v2", "InvoicePaid@v1"])} revision=${randInt(1, 12)}`
            : `EventBridge Pipe enrichment pipe=${pipeName} stage=Enrichment enrichment=${enrichmentArn} records_transformed=${randInt(0, 5000)} transform=${isErr ? "ERROR" : "OK"}`;
  const useStructuredLogging = Math.random() < 0.6;
  const message = useStructuredLogging
    ? JSON.stringify({
        id: eventId,
        source,
        detailType: rand([
          "EC2 Instance State-change Notification",
          "Object Created",
          "Order Placed",
          "Health Event",
        ]),
        rule,
        eventBus,
        log_kind: logKind,
        target_arn: logKind === "target_delivery" ? targetArn : undefined,
        archive_arn: logKind === "archive_replay" ? archiveArn : undefined,
        pipe: logKind === "pipe_enrichment" ? pipeName : undefined,
        enrichment_arn: logKind === "pipe_enrichment" ? enrichmentArn : undefined,
        schema_registry: logKind === "schema_discovery" ? registryName : undefined,
        dlq_arn: dlqArn,
        message: plainMessage,
        timestamp: new Date(ts).toISOString(),
      })
    : plainMessage;
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "events" },
    },
    aws: {
      dimensions: { EventBusName: eventBus, RuleName: rule },
      eventbridge: {
        event_bus: eventBus,
        rule,
        source,
        detail_type: rand([
          "EC2 Instance State-change Notification",
          "Object Created",
          "Order Placed",
          "Health Event",
        ]),
        targets_invoked: targetsInvoked,
        targets_failed: isErr ? randInt(1, Math.min(3, targetsInvoked)) : 0,
        event_id: eventId,
        log_kind: logKind,
        archive_arn: logKind === "archive_replay" ? archiveArn : null,
        enrichment_arn: logKind === "pipe_enrichment" ? enrichmentArn : null,
        pipe_name: logKind === "pipe_enrichment" ? pipeName : null,
        structured_logging: useStructuredLogging,
        metrics: {
          Invocations: { sum: 1 },
          FailedInvocations: { sum: isErr ? 1 : 0 },
          TriggeredRules: { sum: 1 },
          MatchedEvents: { sum: randInt(1, 100) },
          ThrottledRules: { sum: isErr ? randInt(1, 5) : 0 },
          DeadLetterInvocations: { sum: isErr && Math.random() > 0.5 ? 1 : 0 },
        },
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      type: [rand(["info", "creation", "deletion", "change"])],
      dataset: "aws.eventbridge",
      provider: "events.amazonaws.com",
      duration: randInt(1, isErr ? 5000 : 200) * 1e6,
    },
    message: message,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "ConcurrentModificationException",
              "IllegalStatusException",
              "InternalException",
              "InvalidEventPatternException",
              "InvalidStateException",
              "LimitExceededException",
              "ManagedRuleException",
              "OperationDisabledException",
              "PolicyLengthExceededException",
              "ResourceAlreadyExistsException",
              "ResourceNotFoundException",
            ]),
            message:
              logKind === "archive_replay"
                ? "StartReplay failed: IAM events:Replay permissions missing on archive"
                : logKind === "pipe_enrichment"
                  ? "Pipe enrichment Lambda returned non-200 or payload too large"
                  : "EventBridge target invocations failed",
            type: "aws",
          },
        }
      : {}),
  };
}

function generateStepFunctionsLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const machine = rand([
    "order-fulfillment",
    "user-onboarding",
    "data-pipeline",
    "approval-workflow",
    "batch-processor",
  ]);
  const state = rand([
    "ValidateInput",
    "ProcessPayment",
    "SendNotification",
    "UpdateDatabase",
    "HandleError",
  ]);
  const workflowType = rand(["STANDARD", "EXPRESS", "EXPRESS"]);
  const isExpress = workflowType === "EXPRESS";
  const maxDurS = isExpress ? 300 : isErr ? 3600 : 86400;
  const dur = Number(randFloat(0.1, isErr ? Math.min(60, maxDurS) : Math.min(maxDurS, 30)));
  const stateDur = Number(randFloat(0.01, dur));
  const stateMachineArn = `arn:aws:states:${region}:${acct.id}:stateMachine:${machine}`;
  const executionArn = `arn:aws:states:${region}:${acct.id}:execution:${machine}:${randId(8).toLowerCase()}`;
  const startTime = new Date(new Date(ts).getTime() - dur * 1000).toISOString();
  const eventId = randInt(2, 500);
  const prevEventId = eventId - 1;
  const nextEventId = eventId + 1;
  const histType = rand([
    "TaskStateEntered",
    "TaskStateExited",
    "LambdaFunctionScheduled",
    "LambdaFunctionSucceeded",
    "LambdaFunctionFailed",
    "ExecutionStarted",
    "ExecutionSucceeded",
    "ExecutionFailed",
    "PassStateEntered",
    "PassStateExited",
  ]);
  const entered = histType.endsWith("Entered") || histType === "ExecutionStarted";
  const inputPayload = JSON.stringify({
    orderId: `ord-${randId(6)}`,
    amount: randInt(10, 5000),
    traceHeader: randId(16),
  });
  const outputPayload = entered
    ? ""
    : JSON.stringify({
        status: isErr ? "error" : "ok",
        correlationId: randUUID(),
      });
  const failureOutput = JSON.stringify({
    error: "States.TaskFailed",
    cause: rand(["Lambda.Timeout", "States.Timeout"]),
  });
  const outputResolved =
    histType === "ExecutionFailed" || histType === "LambdaFunctionFailed"
      ? failureOutput
      : !entered && histType !== "ExecutionStarted"
        ? outputPayload
        : undefined;
  const executionHistoryEvent = {
    id: eventId,
    previousEventId: histType === "ExecutionStarted" ? undefined : prevEventId,
    nextEventId: entered ? nextEventId : undefined,
    timestamp: new Date(ts).toISOString(),
    type: histType,
    executionArn,
    stateMachineArn,
    name: state,
    input: entered ? inputPayload : undefined,
    output: outputResolved,
  };
  const plainMessage = JSON.stringify(executionHistoryEvent);
  const useStructuredLogging = Math.random() < 0.55;
  const message = useStructuredLogging
    ? JSON.stringify({
        executionArn,
        stateMachineArn,
        name: machine,
        workflowType,
        state,
        status: isErr ? "FAILED" : "SUCCEEDED",
        durationSeconds: dur,
        executionHistoryEvent,
        timestamp: new Date(ts).toISOString(),
      })
    : plainMessage;
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "states" },
    },
    aws: {
      dimensions: {
        StateMachineArn: stateMachineArn,
      },
      stepfunctions: {
        state_machine_name: machine,
        state_machine_arn: stateMachineArn,
        execution_arn: executionArn,
        workflow_type: workflowType,
        execution_start_time: startTime,
        state_name: state,
        state_duration_seconds: stateDur,
        status: isErr ? "FAILED" : "SUCCEEDED",
        duration_seconds: dur,
        structured_logging: useStructuredLogging,
        execution_history_event: executionHistoryEvent,
        metrics: isExpress
          ? {
              // Express workflows: high-volume, async, no history retention
              ExecutionsStarted: { sum: randInt(100, 100000) },
              ExecutionsSucceeded: { sum: isErr ? 0 : randInt(100, 100000) },
              ExecutionsFailed: { sum: isErr ? randInt(1, 1000) : 0 },
              ExecutionThrottled: { sum: isErr ? randInt(0, 500) : 0 },
              ExecutionTime: { avg: dur * 1000, p99: dur * 3000 },
              ExecutionsTimedOut: { sum: isErr ? randInt(0, 50) : 0 },
            }
          : {
              // Standard workflows: lower volume, exactly-once, full history
              ExecutionsStarted: { sum: randInt(1, 1000) },
              ExecutionsSucceeded: { sum: isErr ? 0 : randInt(1, 1000) },
              ExecutionsFailed: { sum: isErr ? randInt(1, 50) : 0 },
              ExecutionsAborted: { sum: randInt(0, 5) },
              ExecutionsTimedOut: { sum: isErr ? randInt(0, 10) : 0 },
              ExecutionThrottled: { sum: isErr ? randInt(0, 20) : 0 },
              ExecutionTime: { avg: dur * 1000, max: dur * 2000 },
            },
      },
    },
    event: {
      duration: dur * 1e9,
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      type: ["info"],
      dataset: "aws.stepfunctions",
      provider: "states.amazonaws.com",
    },
    message: message,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "States.TaskFailed",
              "States.Timeout",
              "States.Permissions",
              "States.BranchFailed",
            ]),
            message: `Step Functions failed at ${state}`,
            type: "workflow",
          },
        }
      : {}),
  };
}

function generateMskConnectLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const connectorName = rand([
    "s3-sink-connector",
    "jdbc-source-connector",
    "opensearch-sink",
    "debezium-postgres-source",
    "kinesis-streams-sink",
  ]);
  const connectorArn = `arn:aws:kafkaconnect:${region}:${acct.id}:connector/${connectorName}/${randId(8).toLowerCase()}`;
  const connectorState = isErr ? rand(["FAILED", "DEGRADED"]) : "RUNNING";
  const capacityType = rand(["MCU_1X", "MCU_2X", "MCU_4X", "MCU_8X"]);
  const workerCount = randInt(1, isErr ? 2 : 10);
  const bootstrapServers = `b-1.prod-kafka-${region}.amazonaws.com:9092,b-2.prod-kafka-${region}.amazonaws.com:9092`;
  const connectorClasses = [
    "io.debezium.connector.postgresql.PostgresConnector",
    "org.apache.kafka.connect.s3.S3SinkConnector",
    "io.confluent.connect.elasticsearch.ElasticsearchSinkConnector",
    "com.amazon.kinesis.kafka.AmazonKinesisSinkConnector",
  ];
  const taskStatuses = isErr ? rand(["FAILED", "PAUSED"]) : "RUNNING";
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "mskconnect" },
    },
    aws: {
      dimensions: { ConnectorName: connectorName },
      mskconnect: {
        connector_name: connectorName,
        connector_arn: connectorArn,
        connector_state: connectorState,
        worker_count: workerCount,
        capacity_type: capacityType,
        kafka_cluster_bootstrap_servers: bootstrapServers,
        connector_class: rand(connectorClasses),
        tasks_status: taskStatuses,
        offset_lag: isErr ? randInt(10000, 5000000) : randInt(0, 500),
        record_count: randInt(0, isErr ? 1000 : 100000),
      },
    },
    event: {
      action: rand([
        "ConnectorCreated",
        "ConnectorRunning",
        "ConnectorFailed",
        "ConnectorDeleted",
        "WorkerAutoScaled",
        "TaskFailed",
        "TaskRestarted",
        "OffsetCommit",
      ]),
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      type: ["info"],
      dataset: "aws.mskconnect",
      provider: "kafkaconnect.amazonaws.com",
      duration: randInt(1, isErr ? 60000 : 5000) * 1e6,
    },
    message: isErr
      ? `MSK Connect ${connectorName}: ${connectorState} - ${rand(["Task failed", "Worker crashed", "Connector config error", "Offset commit failed"])}`
      : `MSK Connect ${connectorName}: ${taskStatuses}, lag=${randInt(0, 500)}`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: connectorState,
            message: `MSK Connect connector ${connectorState.toLowerCase()}`,
            type: "stream",
          },
        }
      : {}),
  };
}

function generateEndUserMessagingLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const originationIdentity = `orig-${randId(10).toLowerCase()}`;
  const messageId = `msg-${randId(12).toLowerCase()}`;
  const channel = rand(["SMS", "MMS", "VOICE", "PUSH"]);
  const destinationCountry = rand(["US", "GB", "DE", "FR", "AU"]);
  const messageStatus = isErr ? "FAILED" : rand(["DELIVERED", "PENDING", "DELIVERED"]);
  const messagesSent = isErr ? 0 : randInt(1, 100000);
  const deliveryRate = isErr ? Number(randFloat(0, 0.5)) : Number(randFloat(0.9, 1.0));
  const optOutRate = Number(randFloat(0, isErr ? 0.1 : 0.02));
  const errorCode = rand(["DeliveryFailed", "NumberBlocked"]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "end-user-messaging" },
    },
    aws: {
      dimensions: { OriginationIdentity: originationIdentity, Channel: channel },
      endusermessaging: {
        origination_identity: originationIdentity,
        message_id: messageId,
        channel,
        destination_country: destinationCountry,
        message_status: messageStatus,
        metrics: {
          messages_sent: messagesSent,
          delivery_rate: deliveryRate,
          opt_out_rate: optOutRate,
        },
        error_code: isErr ? errorCode : null,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["network"],
      type: ["connection"],
      dataset: "aws.endusermessaging",
      provider: "sms-voice.amazonaws.com",
      duration: randInt(10, isErr ? 10000 : 1000) * 1e6,
    },
    data_stream: { type: "logs", dataset: "aws.endusermessaging", namespace: "default" },
    message: isErr
      ? `End User Messaging ${channel}: ${errorCode} for ${destinationCountry} (${originationIdentity})`
      : `End User Messaging ${channel}: ${messagesSent} sent to ${destinationCountry}, delivery_rate=${(deliveryRate * 100).toFixed(1)}%`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: errorCode,
            message: `End User Messaging delivery failed for ${channel} to ${destinationCountry}`,
            type: "network",
          },
        }
      : {}),
  };
}

export {
  generateKinesisStreamsLog,
  generateFirehoseLog,
  generateKinesisAnalyticsLog,
  generateMskLog,
  generateSqsLog,
  generateSnsLog,
  generateAmazonMqLog,
  generateEventBridgeLog,
  generateStepFunctionsLog,
  generateMskConnectLog,
  generateEndUserMessagingLog,
};
