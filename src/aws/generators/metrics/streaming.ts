/**
 * Dimensional metric generators for AWS messaging and streaming services:
 * SQS, Kinesis Data Streams, MSK, SNS, Kinesis Firehose, EventBridge, AmazonMQ.
 */

import {
  REGIONS,
  ACCOUNTS,
  rand,
  randInt,
  dp,
  stat,
  counter,
  metricDoc,
  pickCloudContext,
  jitter,
  sample,
} from "./helpers.js";

// ─── SQS ──────────────────────────────────────────────────────────────────────

const SQS_QUEUES = [
  "orders-queue",
  "notifications-queue",
  "email-queue",
  "payment-events",
  "audit-queue",
  "dlq-orders",
  "dlq-notifications",
  "batch-jobs",
  "scheduled-tasks",
  "webhook-delivery",
];

export function generateSqsMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(SQS_QUEUES, randInt(2, 6)).map((queue) => {
    const sent = randInt(0, 100_000);
    const deleted = Math.round(sent * jitter(0.9, 0.08, 0.5, 1));
    const visible = randInt(0, 5_000);
    const notVisible = randInt(0, visible);
    const delayed = randInt(0, Math.min(2_000, visible + notVisible));
    const isDLQ = queue.startsWith("dlq-");
    const highAge = Math.random() < er || (isDLQ && Math.random() < 0.35);
    const oldestSec = highAge ? jitter(7200, 5000, 120, 86400) : jitter(45, 35, 0, 600);
    const sizeAvg = jitter(2048, 1500, 64, 262144);
    return metricDoc(
      ts,
      "sqs",
      "aws.sqs",
      region,
      account,
      { QueueName: queue },
      {
        NumberOfMessagesSent: counter(sent),
        NumberOfMessagesReceived: counter(Math.round(sent * jitter(0.95, 0.04, 0.5, 1))),
        NumberOfMessagesDeleted: counter(deleted),
        ApproximateNumberOfMessagesVisible: counter(visible),
        ApproximateNumberOfMessagesNotVisible: counter(notVisible),
        ApproximateNumberOfMessagesDelayed: counter(delayed),
        ApproximateAgeOfOldestMessage: stat(dp(oldestSec), {
          max: dp(oldestSec * jitter(1.8, 0.4, 1, 4)),
          min: dp(oldestSec * jitter(0.2, 0.1, 0, 0.95)),
        }),
        NumberOfEmptyReceives: counter(randInt(0, 10_000)),
        SentMessageSize: stat(dp(sizeAvg), {
          max: dp(sizeAvg * jitter(2.2, 0.6, 1.05, 6)),
          min: dp(sizeAvg * jitter(0.35, 0.15, 0.05, 1)),
        }),
      }
    );
  });
}

// ─── Kinesis Data Streams ─────────────────────────────────────────────────────

const KINESIS_STREAMS = [
  "clickstream",
  "transaction-events",
  "user-activity",
  "sensor-data",
  "log-stream",
  "audit-trail",
  "order-events",
  "payment-stream",
];

export function generateKinesisMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(KINESIS_STREAMS, randInt(2, 4)).map((stream) => {
    const shards = randInt(1, 20);
    const recIn = randInt(100, 500_000);
    const bytesIn = Math.round(recIn * jitter(512, 400, 64, 50000));
    const iterAge =
      Math.random() < er
        ? jitter(3_600_000, 2_000_000, 100_000, 86_400_000)
        : jitter(5_000, 4_000, 0, 60_000);
    const putTotal = Math.round(recIn * 0.52);
    const putFailed = Math.random() < er ? randInt(1, Math.max(1, Math.round(putTotal * 0.08))) : 0;
    const putThrottled = Math.random() < er ? randInt(0, Math.round(putTotal * 0.05)) : 0;
    const putSuccessful = Math.max(0, putTotal - putFailed);
    return metricDoc(
      ts,
      "kinesis",
      "aws.kinesis",
      region,
      account,
      { StreamName: stream, ShardId: `shardId-00000000000${randInt(0, shards - 1)}` },
      {
        "GetRecords.Bytes": counter(Math.round(bytesIn * 0.9)),
        "GetRecords.IteratorAgeMilliseconds": stat(dp(iterAge), {
          max: dp(iterAge * jitter(3, 1.5, 1.5, 10)),
          min: dp(iterAge * jitter(0.05, 0.02, 0, 0.5)),
        }),
        "GetRecords.Records": counter(Math.round(recIn * 0.9)),
        "GetRecords.Success": counter(randInt(0, 10_000)),
        IteratorAgeMilliseconds: stat(dp(iterAge), {
          max: dp(iterAge * jitter(2.5, 1, 1, 8)),
          min: dp(iterAge * jitter(0.08, 0.03, 0, 0.4)),
        }),
        IncomingBytes: counter(bytesIn),
        IncomingRecords: counter(recIn),
        "PutRecord.Bytes": counter(Math.round(bytesIn * 0.5)),
        "PutRecord.Success": counter(randInt(0, 5_000)),
        "PutRecords.Bytes": counter(Math.round(bytesIn * 0.5)),
        "PutRecords.Records": counter(Math.round(recIn * 0.5)),
        "PutRecords.TotalRecords": counter(putTotal),
        "PutRecords.SuccessfulRecords": counter(putSuccessful),
        "PutRecords.FailedRecords": counter(putFailed),
        "PutRecords.ThrottledRecords": counter(putThrottled),
        "PutRecords.Success": counter(randInt(0, 5_000)),
        "SubscribeToShard.RateExceeded": counter(Math.random() < er ? randInt(1, 500) : 0),
        WriteProvisionedThroughputExceeded: counter(Math.random() < er ? randInt(1, 1_000) : 0),
        ReadProvisionedThroughputExceeded: counter(Math.random() < er ? randInt(1, 500) : 0),
      }
    );
  });
}

// ─── MSK (Managed Kafka) ──────────────────────────────────────────────────────

const MSK_CLUSTERS = ["prod-kafka", "events-cluster", "streaming-msk", "analytics-kafka"];
const MSK_TOPICS = [
  "orders",
  "payments",
  "user-events",
  "clickstream",
  "notifications",
  "audit",
  "metrics",
  "logs",
];

export function generateMskMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const cluster = rand(MSK_CLUSTERS);
  const broker = randInt(1, 3);
  const consumerGroup = rand([
    "analytics-consumer",
    "etl-pipeline",
    "orders-shipper",
    "audit-indexer",
  ]);
  const globalTopics = randInt(20, 400);
  const globalParts = randInt(200, 8_000);
  const topicParts = randInt(3, 48);
  const brokerParts = randInt(40, globalParts);
  const underRep = Math.random() < er ? randInt(1, 25) : 0;
  const underMinIsr = Math.random() < er ? randInt(0, 8) : 0;
  const offlineParts = Math.random() < er * 0.35 ? randInt(1, 6) : 0;
  const maxLag = Math.random() < er ? randInt(50_000, 5_000_000) : randInt(0, 5_000);
  const sumLag = Math.round(maxLag * jitter(8, 4, 2, 40));
  return sample(MSK_TOPICS, randInt(2, 5)).map((topic) => {
    return metricDoc(
      ts,
      "kafka",
      "aws.kafka_metrics",
      region,
      account,
      {
        "Cluster Name": cluster,
        "Broker ID": String(broker),
        Topic: topic,
        "Consumer Group": consumerGroup,
      },
      {
        BytesInPerSec: stat(dp(jitter(1_000_000, 800_000, 1_000, 100_000_000))),
        BytesOutPerSec: stat(dp(jitter(2_000_000, 1_500_000, 1_000, 200_000_000))),
        MessagesInPerSec: stat(dp(jitter(1_000, 800, 10, 500_000))),
        FetchMessageConversionsPerSec: stat(dp(jitter(100, 80, 0, 10_000))),
        ProduceMessageConversionsPerSec: stat(dp(jitter(50, 40, 0, 5_000))),
        KafkaBrokerPartitionCount: stat(brokerParts),
        KafkaTopicPartitionCount: stat(topicParts),
        GlobalPartitionCount: stat(globalParts),
        GlobalTopicCount: stat(globalTopics),
        UnderReplicatedPartitions: stat(underRep),
        UnderMinIsrPartitionCount: stat(underMinIsr),
        OfflinePartitionsCount: stat(offlineParts),
        ActiveControllerCount: stat(1),
        ZooKeeperRequestLatencyMsMean: stat(
          dp(Math.random() < er ? jitter(120, 80, 20, 800) : jitter(8, 5, 1, 80))
        ),
        KafkaDataLogsDiskUsed: stat(
          dp(Math.random() < er ? jitter(88, 8, 70, 99) : jitter(42, 20, 10, 85))
        ),
        EstimatedMaxTimeLag: stat(
          dp(Math.random() < er ? jitter(600, 400, 30, 7200) : jitter(4, 3, 0, 120))
        ),
        MaxOffsetLag: stat(maxLag),
        SumOffsetLag: stat(sumLag),
        ConsumerGroupMessageLag: stat(Math.round(maxLag * jitter(0.4, 0.2, 0.05, 1.2))),
        CPUUser: stat(dp(Math.random() < er ? jitter(75, 15, 50, 100) : jitter(25, 20, 1, 70))),
        MemoryUsed: stat(dp(jitter(4_000_000_000, 2_000_000_000, 500_000_000, 16_000_000_000))),
        NetworkRxDropped: counter(Math.random() < er ? randInt(1, 1_000) : 0),
        NetworkTxDropped: counter(Math.random() < er ? randInt(1, 500) : 0),
      }
    );
  });
}

// ─── SNS ──────────────────────────────────────────────────────────────────────

const SNS_TOPICS = [
  "order-notifications",
  "payment-alerts",
  "system-alerts",
  "user-signups",
  "dlq-notifications",
  "push-notifications",
  "email-delivery",
  "sms-delivery",
];

export function generateSnsMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(SNS_TOPICS, randInt(2, 5)).map((topic) => {
    const published = randInt(0, 100_000);
    const failRate =
      Math.random() < er ? jitter(0.08, 0.06, 0.002, 0.35) : jitter(0.0012, 0.0009, 0, 0.006);
    const failed = Math.min(published, Math.round(published * failRate));
    const delivered = Math.max(0, published - failed);
    const filtered = randInt(0, Math.round(published * 0.08));
    const filteredNoAttrs = randInt(0, Math.round(filtered * 0.4));
    const publishAvg = jitter(1536, 900, 64, 262144);
    const smsTopic = Math.random() < 0.3;
    return metricDoc(
      ts,
      "sns",
      "aws.sns",
      region,
      account,
      { TopicName: topic },
      {
        NumberOfMessagesPublished: counter(published),
        NumberOfNotificationsDelivered: counter(delivered),
        NumberOfNotificationsFailed: counter(failed),
        NumberOfNotificationsFilteredOut: counter(filtered),
        "NumberOfNotificationsFilteredOut-NoMessageAttributes": counter(filteredNoAttrs),
        NumberOfNotificationsRedrivenToDlq: counter(
          Math.random() < er ? randInt(0, Math.min(500, published)) : randInt(0, 20)
        ),
        PublishSize: stat(dp(publishAvg), {
          max: dp(publishAvg * jitter(2.4, 0.7, 1, 5)),
          min: dp(publishAvg * jitter(0.3, 0.12, 0.02, 1)),
        }),
        ...(smsTopic
          ? {
              SMSSuccessRate: stat(
                dp(Math.random() < er * 0.4 ? jitter(72, 18, 20, 99) : jitter(96.5, 3, 85, 100)),
                { max: dp(100), min: dp(Math.random() < er ? 15 : 78) }
              ),
            }
          : {}),
      }
    );
  });
}

// ─── Kinesis Firehose ─────────────────────────────────────────────────────────

const FIREHOSE_STREAMS = [
  "clickstream-to-s3",
  "logs-to-opensearch",
  "events-to-redshift",
  "metrics-to-s3",
  "audit-to-splunk",
  "traces-to-s3",
];

export function generateFirehoseMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(FIREHOSE_STREAMS, randInt(1, 3)).map((stream) => {
    const bytesIn = randInt(1_000_000, 50_000_000_000);
    const recIn = randInt(1_000, 10_000_000);
    const convFail = Math.random() < er ? randInt(1, Math.round(bytesIn * 0.02)) : 0;
    const convRecFail = Math.random() < er ? randInt(1, Math.round(recIn * 0.03)) : 0;
    const deliveredBytes = Math.round(bytesIn * jitter(0.98, 0.02, 0.85, 1));
    const freshness = Math.random() < er ? jitter(420, 280, 60, 7200) : jitter(55, 40, 5, 480);
    return metricDoc(
      ts,
      "firehose",
      "aws.firehose",
      region,
      account,
      { DeliveryStreamName: stream },
      {
        IncomingBytes: counter(bytesIn),
        IncomingRecords: counter(recIn),
        "DeliveryToS3.Bytes": counter(deliveredBytes),
        "DeliveryToS3.Records": counter(Math.max(0, recIn - convRecFail)),
        "DeliveryToS3.Success": stat(
          dp(Math.random() < er ? jitter(86, 10, 45, 100) : jitter(99.9, 0.08, 99, 100)),
          { max: dp(100), min: dp(Math.random() < er ? 40 : 99) }
        ),
        "DeliveryToS3.DataFreshness": stat(dp(freshness), {
          max: dp(freshness * jitter(2.2, 0.6, 1, 5)),
          min: dp(freshness * jitter(0.25, 0.1, 0, 0.9)),
        }),
        ThrottledRecords: counter(Math.random() < er ? randInt(1, 50_000) : randInt(0, 200)),
        "FailedConversion.Bytes": counter(convFail),
        "FailedConversion.Records": counter(convRecFail),
        "BackupToS3.Bytes": counter(
          Math.random() < er * 0.25
            ? randInt(10_000, bytesIn)
            : randInt(0, Math.round(bytesIn * 0.05))
        ),
        KinesisMillisBehindLatest: stat(
          dp(
            Math.random() < er
              ? jitter(300_000, 200_000, 10_000, 3_600_000)
              : jitter(5_000, 4_000, 0, 30_000)
          )
        ),
        ThrottledGetShardIterator: counter(Math.random() < er ? randInt(1, 100) : 0),
      }
    );
  });
}

// ─── EventBridge ──────────────────────────────────────────────────────────────

const EB_BUSES = ["default", "orders-bus", "payments-bus", "notifications-bus", "custom-events"];

export function generateEventbridgeMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(EB_BUSES, randInt(1, 3)).map((bus) => {
    const events = randInt(100, 1_000_000);
    const matched = Math.round(events * jitter(0.72, 0.18, 0.1, 1));
    const triggered = randInt(0, Math.round(events * 0.92));
    const failed =
      Math.random() < er
        ? randInt(1, Math.max(1, Math.round(events * 0.08)))
        : randInt(0, Math.round(events * 0.002));
    return metricDoc(
      ts,
      "events",
      "aws.eventbridge",
      region,
      account,
      { EventBusName: bus },
      {
        Invocations: counter(events),
        MatchedEvents: counter(matched),
        TriggeredRules: counter(triggered),
        FailedInvocations: counter(failed),
        ThrottledRules: counter(Math.random() < er * 0.25 ? randInt(1, 80) : randInt(0, 5)),
        DeadLetterInvocations: counter(Math.random() < er ? randInt(1, 500) : randInt(0, 20)),
        InvocationCreated: counter(randInt(0, Math.round(events * 1.05))),
        RetryAttempts: counter(
          Math.random() < er
            ? randInt(1, Math.round(failed * 3))
            : randInt(0, Math.round(events * 0.01))
        ),
        IngestionToInvocationStartLatency: stat(
          dp(Math.random() < er ? jitter(850, 400, 120, 8000) : jitter(35, 22, 2, 400))
        ),
        EventBusLatency: stat(dp(jitter(22, 16, 1, 1000))),
      }
    );
  });
}

// ─── AmazonMQ ─────────────────────────────────────────────────────────────────

export function generateAmazonmqMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const brokerId = `b-${rand(["1a2b3c4d", "5e6f7a8b", "9c0d1e2f"])}-${randInt(1, 3)}`;
  return [
    metricDoc(
      ts,
      "amazonmq",
      "aws.amazonmq",
      region,
      account,
      { Broker: brokerId, Queue: rand(["orders", "payments", "notifications", "dlq"]) },
      {
        EnqueueCount: counter(randInt(0, 100_000)),
        DequeueCount: counter(randInt(0, 100_000)),
        QueueSize: counter(randInt(0, 10_000)),
        TotalMessageCount: counter(randInt(0, 500_000)),
        ExpiredCount: counter(Math.random() < er ? randInt(0, 1_000) : 0),
        DispatchCount: counter(randInt(0, 100_000)),
        ConsumerCount: counter(randInt(1, 50)),
        ProducerCount: counter(randInt(1, 100)),
        TotalConsumerCount: counter(randInt(1, 200)),
        TotalProducerCount: counter(randInt(1, 100)),
        TotalConnectionCount: counter(randInt(5, 2_000)),
        CurrentConnectionsCount: counter(randInt(2, 800)),
        MemoryUsage: stat(dp(Math.random() < er ? jitter(86, 10, 65, 99) : jitter(48, 22, 18, 82))),
        StorePercentUsage: stat(
          dp(Math.random() < er ? jitter(82, 12, 55, 99) : jitter(38, 18, 8, 78))
        ),
        CpuUtilization: stat(
          dp(Math.random() < er ? jitter(78, 14, 45, 100) : jitter(28, 18, 5, 72))
        ),
        BurstBalance: stat(dp(Math.random() < er ? jitter(18, 12, 0, 55) : jitter(92, 8, 40, 100))),
        HeapUsage: stat(dp(jitter(40, 25, 5, 95))),
        CPUCreditBalance: stat(
          dp(Math.random() < er ? jitter(20, 15, 0, 50) : jitter(200, 100, 50, 576))
        ),
        NetworkIn: counter(randInt(1_000_000, 5_000_000_000)),
        NetworkOut: counter(randInt(1_000_000, 5_000_000_000)),
      }
    ),
  ];
}

// ─── Kinesis Analytics ────────────────────────────────────────────────────────

export function generateKinesisanalyticsMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "kinesisanalytics",
      "aws.kinesisanalytics",
      region,
      account,
      {
        Application: rand([
          "anomaly-detection",
          "stream-aggregator",
          "real-time-etl",
          "fraud-scorer",
        ]),
      },
      {
        KPUs: counter(randInt(1, 64)),
        uptime: counter(randInt(3_600_000, 86_400_000)),
        downtime: counter(Math.random() < er ? randInt(30_000, 3_600_000) : 0),
        inputRecords: counter(randInt(1_000, 10_000_000)),
        outputRecords: counter(randInt(1_000, 10_000_000)),
        inputBytes: counter(randInt(1_000_000, 10_000_000_000)),
        outputBytes: counter(randInt(1_000_000, 10_000_000_000)),
        millisBehindLatest: stat(
          dp(
            Math.random() < er
              ? jitter(120_000, 80_000, 5_000, 7_200_000)
              : jitter(420, 320, 0, 8_000)
          ),
          {
            max: dp(
              Math.random() < er
                ? jitter(400_000, 200_000, 50_000, 10_000_000)
                : jitter(2_000, 1_200, 50, 20_000)
            ),
          }
        ),
        lastCheckpointDuration: stat(
          dp(
            Math.random() < er
              ? jitter(18_000, 10_000, 2_000, 120_000)
              : jitter(900, 500, 80, 12_000)
          )
        ),
        lastCheckpointSize: stat(
          dp(Math.random() < er ? jitter(48e6, 20e6, 5e5, 250e6) : jitter(4e6, 2e6, 5e4, 80e6))
        ),
        LateRecords: counter(Math.random() < er ? randInt(0, 1_000) : 0),
      }
    ),
  ];
}
