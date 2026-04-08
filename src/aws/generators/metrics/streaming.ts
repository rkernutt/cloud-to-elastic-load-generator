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

export function generateSqsMetrics(ts, er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(SQS_QUEUES, randInt(2, 6)).map((queue) => {
    const sent = randInt(0, 100_000);
    const deleted = Math.round(sent * jitter(0.9, 0.08, 0.5, 1));
    const visible = randInt(0, 5_000);
    const isDLQ = queue.startsWith("dlq-");
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
        ApproximateNumberOfMessagesNotVisible: counter(randInt(0, visible)),
        ApproximateAgeOfOldestMessage: stat(
          isDLQ && Math.random() < er ? jitter(7200, 5000, 100, 86400) : jitter(30, 20, 0, 300)
        ),
        NumberOfEmptyReceives: counter(randInt(0, 10_000)),
        SentMessageSize: stat(dp(jitter(2048, 1500, 64, 262144))),
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

export function generateKinesisMetrics(ts, er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(KINESIS_STREAMS, randInt(2, 4)).map((stream) => {
    const shards = randInt(1, 20);
    const recIn = randInt(100, 500_000);
    const bytesIn = Math.round(recIn * jitter(512, 400, 64, 50000));
    const iterAge =
      Math.random() < er
        ? jitter(3_600_000, 2_000_000, 100_000, 86_400_000)
        : jitter(5_000, 4_000, 0, 60_000);
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
        }),
        "GetRecords.Records": counter(Math.round(recIn * 0.9)),
        "GetRecords.Success": counter(randInt(0, 10_000)),
        IncomingBytes: counter(bytesIn),
        IncomingRecords: counter(recIn),
        "PutRecord.Bytes": counter(Math.round(bytesIn * 0.5)),
        "PutRecord.Success": counter(randInt(0, 5_000)),
        "PutRecords.Bytes": counter(Math.round(bytesIn * 0.5)),
        "PutRecords.Records": counter(Math.round(recIn * 0.5)),
        "PutRecords.Success": counter(randInt(0, 5_000)),
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

export function generateMskMetrics(ts, er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const cluster = rand(MSK_CLUSTERS);
  const broker = randInt(1, 3);
  return sample(MSK_TOPICS, randInt(2, 5)).map((topic) => {
    return metricDoc(
      ts,
      "kafka",
      "aws.kafka_metrics",
      region,
      account,
      { "Cluster Name": cluster, "Broker ID": String(broker), Topic: topic },
      {
        BytesInPerSec: stat(dp(jitter(1_000_000, 800_000, 1_000, 100_000_000))),
        BytesOutPerSec: stat(dp(jitter(2_000_000, 1_500_000, 1_000, 200_000_000))),
        MessagesInPerSec: stat(dp(jitter(1_000, 800, 10, 500_000))),
        FetchMessageConversionsPerSec: stat(dp(jitter(100, 80, 0, 10_000))),
        ProduceMessageConversionsPerSec: stat(dp(jitter(50, 40, 0, 5_000))),
        OfflinePartitionsCount: stat(Math.random() < er * 0.3 ? randInt(1, 10) : 0),
        UnderReplicatedPartitions: stat(Math.random() < er ? randInt(1, 20) : 0),
        ActiveControllerCount: stat(1),
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

export function generateSnsMetrics(ts, er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(SNS_TOPICS, randInt(2, 5)).map((topic) => {
    const published = randInt(0, 100_000);
    const delivered = Math.round(published * jitter(0.95, 0.04, 0.7, 1));
    const failed = Math.round(
      published *
        (Math.random() < er ? jitter(0.05, 0.04, 0.001, 0.3) : jitter(0.001, 0.0008, 0, 0.005))
    );
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
        NumberOfNotificationsFilteredOut: counter(randInt(0, Math.round(published * 0.1))),
        PublishSize: stat(dp(jitter(1024, 800, 64, 262144))),
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

export function generateFirehoseMetrics(ts, er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(FIREHOSE_STREAMS, randInt(1, 3)).map((stream) => {
    const bytesIn = randInt(1_000_000, 50_000_000_000);
    return metricDoc(
      ts,
      "firehose",
      "aws.firehose",
      region,
      account,
      { DeliveryStreamName: stream },
      {
        IncomingBytes: counter(bytesIn),
        IncomingRecords: counter(randInt(1_000, 10_000_000)),
        DeliveryToS3_Bytes: counter(Math.round(bytesIn * 0.98)),
        DeliveryToS3_Records: counter(randInt(1_000, 10_000_000)),
        DeliveryToS3_Success: stat(
          dp(Math.random() < er ? jitter(85, 10, 50, 100) : jitter(99.9, 0.08, 99, 100))
        ),
        DeliveryToS3_DataFreshness: stat(dp(jitter(60, 45, 5, 900))),
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

export function generateEventbridgeMetrics(ts, er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(EB_BUSES, randInt(1, 3)).map((bus) => {
    const events = randInt(100, 1_000_000);
    return metricDoc(
      ts,
      "events",
      "aws.eventbridge",
      region,
      account,
      { EventBusName: bus },
      {
        Invocations: counter(events),
        MatchedEvents: counter(Math.round(events * jitter(0.7, 0.2, 0.1, 1))),
        FailedInvocations: counter(Math.random() < er ? randInt(1, Math.round(events * 0.05)) : 0),
        ThrottledRules: counter(Math.random() < er * 0.2 ? randInt(1, 50) : 0),
        TriggeredRules: counter(randInt(0, Math.round(events * 0.9))),
        DeadLetterInvocations: counter(Math.random() < er ? randInt(0, 100) : 0),
        EventBusLatency: stat(dp(jitter(20, 15, 1, 1000))),
      }
    );
  });
}

// ─── AmazonMQ ─────────────────────────────────────────────────────────────────

export function generateAmazonmqMetrics(ts, er) {
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
        ExpiredCount: counter(Math.random() < er ? randInt(0, 1_000) : 0),
        DispatchCount: counter(randInt(0, 100_000)),
        ConsumerCount: counter(randInt(1, 50)),
        ProducerCount: counter(randInt(1, 100)),
        TotalConsumerCount: counter(randInt(1, 200)),
        TotalProducerCount: counter(randInt(1, 100)),
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

export function generateKinesisanalyticsMetrics(ts, er) {
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
        Uptime: counter(randInt(0, 86_400_000)),
        DowntimeRecords: counter(Math.random() < er ? randInt(1, 100) : 0),
        InputRecords: counter(randInt(1_000, 10_000_000)),
        OutputRecords: counter(randInt(1_000, 10_000_000)),
        InputBytes: counter(randInt(1_000_000, 10_000_000_000)),
        OutputBytes: counter(randInt(1_000_000, 10_000_000_000)),
        LateRecords: counter(Math.random() < er ? randInt(0, 1_000) : 0),
        MillisBehindLatest: stat(
          dp(
            Math.random() < er
              ? jitter(60_000, 50_000, 1_000, 3_600_000)
              : jitter(500, 400, 0, 5_000)
          )
        ),
      }
    ),
  ];
}
