import { rand, randInt, randFloat, randId, randAccount, REGIONS, randUUID } from "../../helpers";
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
        metrics: {
          GetRecords_Bytes: { avg: randInt(1000, 1e6) },
          GetRecords_IteratorAgeMilliseconds: {
            avg: isErr ? randInt(10000, 3600000) : randInt(0, 1000),
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
      dataset: "aws.kinesis",
      provider: "kinesis.amazonaws.com",
      duration: randInt(1, isErr ? 60000 : 5000) * 1e6,
    },
    message: isErr
      ? `Kinesis WriteProvisionedThroughputExceeded on ${stream}`
      : `Kinesis ${stream}: ${randInt(1, 10000)} records ingested`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "ExpiredIteratorException",
              "InvalidArgumentException",
              "KMSAccessDeniedException",
              "KMSDisabledException",
              "KMSInvalidStateException",
              "KMSNotFoundException",
              "KMSOptInRequired",
              "KMSThrottlingException",
              "LimitExceededException",
              "ProvisionedThroughputExceededException",
              "ResourceInUseException",
              "ResourceNotFoundException",
            ]),
            message: "Kinesis stream error",
            type: "stream",
          },
        }
      : {}),
  };
}

function generateFirehoseLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const stream = rand([
    "logs-to-s3",
    "events-to-redshift",
    "metrics-to-opensearch",
    "clickstream-backup",
  ]);
  const dest = rand(["S3", "Redshift", "OpenSearch", "HTTPEndpoint"]);
  const recs = randInt(100, 50000);
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
        incoming_records: recs,
        incoming_bytes: recs * randInt(200, 2000),
        delivery_success: !isErr,
        delivery_records: isErr ? 0 : recs,
        data_freshness_seconds: randInt(60, isErr ? 3600 : 300),
        metrics: {
          "DeliveryToS3.Bytes": { sum: randInt(1000, 1e8) },
          "DeliveryToS3.DataFreshness": { avg: randInt(60, 3600) },
          "DeliveryToS3.Records": { sum: randInt(1, 10000) },
          "DeliveryToS3.Success": { avg: isErr ? 0 : 1 },
          IncomingBytes: { sum: randInt(1000, 1e8) },
          IncomingRecords: { sum: randInt(1, 10000) },
          "BackupToS3.Bytes": { sum: randInt(0, 1e6) },
          "BackupToS3.Records": { sum: randInt(0, 1000) },
          "BackupToS3.Success": { avg: 1 },
          "DataReadFromKinesisStream.Bytes": { sum: randInt(1000, 1e8) },
          "DataReadFromKinesisStream.Records": { sum: randInt(1, 10000) },
          ThrottledGetRecords: { sum: isErr ? randInt(1, 10) : 0 },
          ThrottledGetShardIterator: { sum: 0 },
        },
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.firehose",
      provider: "firehose.amazonaws.com",
      duration: randInt(1, isErr ? 300 : 60) * 1e9,
    },
    message: isErr
      ? `Firehose ${stream} delivery failure: ${rand(["S3 PutObject failed", "Conversion error", "Buffer full"])}`
      : `Firehose ${stream}: ${recs} records delivered`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? { error: { code: "DeliveryFailure", message: "Firehose delivery failed", type: "stream" } }
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
      category: "process",
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
        consumer_group: rand(["analytics-consumer", "etl-pipeline", "alerting-service"]),
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
      dataset: "aws.msk",
      provider: "kafka.amazonaws.com",
      duration: randInt(1, isErr ? 5000 : 100) * 1e6,
    },
    message: isErr
      ? `MSK broker issue: under-replicated partitions on ${topic}`
      : `MSK ${topic}[${partition}] offset=${randInt(0, 100000000)}`,
    log: { level: isErr ? "error" : "info" },
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
  const queue = rand([
    "order-processing",
    "email-queue",
    "notification-dlq",
    "webhook-events",
    "job-queue",
  ]);
  const isDlq = queue.includes("dlq");
  const sent = randInt(1, 10000);
  const received = randInt(0, sent);
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
        queue: { name: queue },
        oldest_message_age: { sec: randInt(0, isErr ? 86400 : 300) },
        messages: {
          delayed: randInt(0, 500),
          not_visible: randInt(0, 1000),
          visible: randInt(0, isErr ? 100000 : 1000),
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
      dataset: "aws.sqs",
      provider: "sqs.amazonaws.com",
      duration: randInt(1, isErr ? 30000 : 500) * 1e6,
    },
    message:
      isErr || isDlq
        ? `SQS ${queue}: ${randInt(1, 1000)} messages dead-lettered after max retries`
        : `SQS ${queue}: ${sent} sent, ${received} received`,
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
            message: "SQS operation failed",
            type: "queue",
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
  const topic = rand([
    "order-notifications",
    "user-alerts",
    "system-events",
    "security-alarms",
    "deployment-events",
  ]);
  const protocol = rand(["email", "sqs", "lambda", "http", "sms"]);
  const published = randInt(1, 10000);
  const delivered = isErr ? randInt(0, Math.floor(published * 0.9)) : published;
  const deliveryLatencyMs = Number(randFloat(5, isErr ? 30000 : 500));
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
      dataset: "aws.sns",
      provider: "sns.amazonaws.com",
      duration: deliveryLatencyMs * 1e6,
    },
    message: isErr
      ? `SNS delivery FAILED: ${topic} -> ${protocol}: ${rand(["Endpoint disabled", "Timeout", "Lambda error"])}`
      : `SNS delivered: ${topic} -> ${protocol} (${randInt(100, 50000)}B)`,
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
              "InvalidSecurityException",
              "KMSAccessDeniedException",
              "KMSDisabledException",
              "KMSInvalidStateException",
              "KMSNotFoundException",
              "KMSOptInRequired",
              "KMSThrottlingException",
              "NotFoundException",
              "OptedOutException",
              "PlatformApplicationDisabledException",
              "StaleTagException",
              "TagLimitExceededException",
              "ThrottledException",
              "TopicLimitExceededException",
            ]),
            message: "SNS delivery failed",
            type: "messaging",
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
  const plainMessage = isErr
    ? `EventBridge rule ${rule}: target invocations failed`
    : `EventBridge event routed: ${source} -> ${rule}`;
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
            message: "EventBridge target invocations failed",
            type: "event",
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
  // Express: max 5 min; Standard: can run for days
  const maxDurS = isExpress ? 300 : isErr ? 3600 : 86400;
  const dur = Number(randFloat(0.1, isErr ? Math.min(60, maxDurS) : Math.min(maxDurS, 30)));
  const stateDur = Number(randFloat(0.01, dur));
  const executionArn = `arn:aws:states:${region}:${acct.id}:execution:${machine}:${randId(8).toLowerCase()}`;
  const startTime = new Date(new Date(ts).getTime() - dur * 1000).toISOString();
  const stepMsgPool = isErr
    ? [
        "Execution failed",
        `Step Functions ${machine} FAILED at state ${state}: ${rand(["Lambda error", "Timeout", "States.TaskFailed"])}`,
      ]
    : [
        "Execution started",
        "Execution succeeded",
        `Step Functions ${machine} SUCCEEDED in ${dur.toFixed(1)}s`,
      ];
  const plainMessage = rand(stepMsgPool);
  const useStructuredLogging = Math.random() < 0.55;
  const message = useStructuredLogging
    ? JSON.stringify({
        executionArn,
        stateMachine: machine,
        workflowType,
        state,
        status: isErr ? "FAILED" : "SUCCEEDED",
        durationSeconds: dur,
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
        StateMachineArn: `arn:aws:states:${region}:${acct.id}:stateMachine:${machine}`,
      },
      stepfunctions: {
        state_machine_name: machine,
        state_machine_arn: `arn:aws:states:${region}:${acct.id}:stateMachine:${machine}`,
        execution_arn: executionArn,
        workflow_type: workflowType,
        execution_start_time: startTime,
        state_name: state,
        state_duration_seconds: stateDur,
        status: isErr ? "FAILED" : "SUCCEEDED",
        duration_seconds: dur,
        structured_logging: useStructuredLogging,
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
      category: "process",
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
