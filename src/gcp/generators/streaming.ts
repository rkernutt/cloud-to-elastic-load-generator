import {
  type EcsDocument,
  rand,
  randInt,
  randId,
  gcpCloud,
  makeGcpSetup,
  randLatencyMs,
  randZone,
} from "./helpers.js";

export function generatePubSubLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const topicName = `projects/${project.id}/topics/${rand(["events", "orders", "audit", "telemetry", "clicks"])}-${randId(4)}`;
  const subscriptionName = `projects/${project.id}/subscriptions/${rand(["worker", "indexer", "export"])}-${randId(4)}`;
  const messageId = randId(22);
  const action = rand(["publish", "pull", "acknowledge", "modifyAckDeadline"]);
  const messageSizeBytes = randInt(64, isErr ? 1_048_576 : 512_000);
  const orderingKey = rand(["user-123", "shard-7", "partition-a", ""]);
  const deliveryAttempt = isErr ? randInt(3, 10) : randInt(1, 3);
  const ackDeadlineSeconds = randInt(10, 600);
  const deadLetter = isErr && action !== "publish";
  const durationNs = randLatencyMs(action === "publish" ? 12 : 45, isErr) * 1e6;
  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "pubsub"),
    gcp: {
      pubsub: {
        topic_name: topicName,
        subscription_name: subscriptionName,
        message_id: messageId,
        action,
        message_size_bytes: messageSizeBytes,
        ...(orderingKey ? { ordering_key: orderingKey } : {}),
        delivery_attempt: deliveryAttempt,
        ack_deadline_seconds: ackDeadlineSeconds,
        dead_letter: deadLetter,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: durationNs,
    },
    message: isErr
      ? deadLetter
        ? `Pub/Sub message ${messageId} sent to dead-letter topic after ${deliveryAttempt} failed ${action} attempts`
        : `Pub/Sub ${action} failed: deadline expired for subscription ${subscriptionName.split("/").pop()}`
      : `Pub/Sub ${action}: msg ${messageId} (${messageSizeBytes} B) on ${topicName.split("/").pop()}`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            type: deadLetter ? "DeadLetterExceeded" : "DeadlineExceeded",
            message: deadLetter
              ? "Max delivery attempts exceeded; message published to dead letter"
              : "Ack deadline elapsed before subscriber acknowledged",
          },
        }
      : {}),
  };
}

export function generateDataflowLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const jobName = rand(["clickstream-sessions", "etl-orders", "log-parser", "metrics-rollups"]);
  const jobId = `${new Date().getFullYear()}-${randInt(1, 12)}-${randInt(10, 28)}_${randInt(0, 23)}_${randInt(10, 59)}_${randInt(10, 59)}-${randId(6)}`;
  const jobType = rand(["STREAMING", "BATCH"]);
  const stepName = rand([
    "ReadFromPubSub",
    "ParseJson",
    "GroupByKey",
    "WriteToBigQuery",
    "WindowIntoSessions",
  ]);
  const workerCount = isErr ? randInt(1, 4) : randInt(4, 80);
  const elementsProduced = isErr ? randInt(0, 1000) : randInt(50_000, 50_000_000);
  const bytesProduced = isErr ? randInt(0, 1_000_000) : randInt(10_000_000, 8_000_000_000);
  const watermarkLagSeconds = isErr ? randInt(600, 7200) : randInt(0, 45);
  const systemLagSeconds = isErr ? randInt(120, 3600) : randInt(0, 20);
  const currentVcpu = workerCount * randInt(1, 4);
  const currentMemoryMb = workerCount * randInt(4, 16) * 1024;
  const durationNs = randLatencyMs(2000, isErr) * 1e6;
  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "dataflow"),
    gcp: {
      dataflow: {
        job_name: jobName,
        job_id: jobId,
        job_type: jobType,
        step_name: stepName,
        worker_count: workerCount,
        elements_produced: elementsProduced,
        bytes_produced: bytesProduced,
        watermark_lag_seconds: watermarkLagSeconds,
        system_lag_seconds: systemLagSeconds,
        current_vCPU: currentVcpu,
        current_memory_mb: currentMemoryMb,
        region,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: durationNs,
    },
    message: isErr
      ? `Dataflow job ${jobName} (${jobId}) stalled on ${stepName}: watermark lag ${watermarkLagSeconds}s`
      : `Dataflow ${jobType} job ${jobName}: ${stepName} produced ${elementsProduced.toLocaleString()} elements`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            type: "ResourceExhausted",
            message: `Step ${stepName} exceeded backlog threshold; workers=${workerCount}`,
          },
        }
      : {}),
  };
}

export function generatePubSubLiteLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const zone = randZone(region);
  const topicName = `projects/${project.id}/locations/${zone}/topics/${rand(["lite-events", "lite-audit"])}-${randId(3)}`;
  const subscriptionName = `projects/${project.id}/locations/${zone}/subscriptions/${rand(["sub-a", "sub-b"])}-${randId(3)}`;
  const partitionCount = randInt(2, 32);
  const messageThroughputBytesPerSec = isErr ? randInt(0, 50_000) : randInt(100_000, 12_000_000);
  const subscriberCount = isErr ? randInt(0, 2) : randInt(2, 40);
  const backlogMessageCount = isErr ? randInt(500_000, 50_000_000) : randInt(0, 25_000);
  const durationNs = randLatencyMs(30, isErr) * 1e6;
  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "pubsub-lite"),
    gcp: {
      pubsub_lite: {
        topic_name: topicName,
        subscription_name: subscriptionName,
        partition_count: partitionCount,
        zone,
        message_throughput_bytes_per_sec: messageThroughputBytesPerSec,
        subscriber_count: subscriberCount,
        backlog_message_count: backlogMessageCount,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: durationNs,
    },
    message: isErr
      ? `Pub/Sub Lite subscription backlog critical: ${backlogMessageCount.toLocaleString()} messages in ${zone}`
      : `Pub/Sub Lite ${zone}: throughput ${(messageThroughputBytesPerSec / 1e6).toFixed(2)} MB/s, backlog ${backlogMessageCount}`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            type: "BacklogPressure",
            message: `Partition throughput insufficient; ${subscriberCount} subscribers active`,
          },
        }
      : {}),
  };
}
