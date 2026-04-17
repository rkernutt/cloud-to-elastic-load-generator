import {
  type EcsDocument,
  rand,
  randInt,
  randFloat,
  randId,
  gcpCloud,
  makeGcpSetup,
  randLatencyMs,
  randZone,
  randSeverity,
  randPrincipal,
} from "./helpers.js";

function eventOutcome(isErr: boolean, durationNs: number) {
  return {
    outcome: isErr ? ("failure" as const) : ("success" as const),
    duration: durationNs,
  };
}

export function generatePubSubLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const topicShort = `${rand(["events", "orders", "audit", "telemetry", "clicks"])}-${randId(4)}`;
  const subShort = `${rand(["worker", "indexer", "export"])}-${randId(4)}`;
  const topic = `projects/${project.id}/topics/${topicShort}`;
  const subscription = `projects/${project.id}/subscriptions/${subShort}`;
  const messageId = randId(22);
  const publishTime = new Date(Date.now() - randInt(0, 3_600_000)).toISOString();
  const deliveryAttempt = isErr ? randInt(5, 10) : randInt(1, 3);
  const durationNs = randLatencyMs(randInt(8, 120), isErr) * 1e6;
  const variant = isErr
    ? rand(["delivery", "dlq", "audit", "metrics"] as const)
    : rand(["audit", "delivery", "metrics", "delivery"] as const);

  let message = "";
  let severity = randSeverity(isErr);

  if (variant === "audit") {
    const method = rand([
      "google.pubsub.v1.Publisher.Publish",
      "google.pubsub.v1.Subscriber.Acknowledge",
      "google.pubsub.v1.Publisher.CreateTopic",
    ] as const);
    const map: Record<string, string> = {
      "google.pubsub.v1.Publisher.Publish": "pubsub.topics.publish",
      "google.pubsub.v1.Subscriber.Acknowledge": "pubsub.subscriptions.acknowledge",
      "google.pubsub.v1.Publisher.CreateTopic": "pubsub.topics.create",
    };
    message = `protoPayload.methodName="${map[method]}" protoPayload.serviceName="pubsub.googleapis.com" resource.labels.topic_id="${topicShort}" authenticationInfo.principalEmail="${randPrincipal(project)}"`;
    severity = "NOTICE";
  } else if (variant === "delivery") {
    const evt = isErr
      ? rand(["nack", "deadline_exceeded"] as const)
      : rand(["published", "delivered", "acknowledged"] as const);
    if (evt === "published") {
      message = `pubsub.googleapis.com/${topic}: Publish messageId=${messageId} publishTime=${publishTime} messageSizeBytes=${randInt(64, 65536)}`;
      severity = "INFO";
    } else if (evt === "delivered") {
      message = `pubsub.googleapis.com/${subscription}: Delivered messageId=${messageId} deliveryAttempt=${deliveryAttempt} ackId=${randId(16)}`;
      severity = "DEBUG";
    } else if (evt === "acknowledged") {
      message = `pubsub.googleapis.com/${subscription}: Acknowledged messageId=${messageId} latencyMs=${randFloat(5, 180).toFixed(2)}`;
      severity = "INFO";
    } else if (evt === "nack") {
      message = `pubsub.googleapis.com/${subscription}: ModifyAckDeadline messageId=${messageId} nack deliveryAttempt=${deliveryAttempt}`;
      severity = "WARNING";
    } else {
      message = `pubsub.googleapis.com/${subscription}: messageId=${messageId} moved to dead-letter topic projects/${project.id}/topics/${topicShort}-dlq after maxDeliveryAttempts`;
      severity = "ERROR";
    }
  } else if (variant === "dlq") {
    message = `DeadLetterPolicy: message ${messageId} published to dead letter topic ${topicShort}-dlq subscription=${subShort} deliveryAttempt=${deliveryAttempt}`;
    severity = "ERROR";
  } else {
    const oldestUnackedSec = isErr ? randInt(600, 7200) : randInt(0, 45);
    const backlog = isErr ? randInt(500_000, 20_000_000) : randInt(0, 25_000);
    message = `subscription/${subShort}: oldest_unacked_message_age=${oldestUnackedSec}s num_undelivered_messages=${backlog} push_endpoint_health=OK`;
    severity = isErr ? "WARNING" : "INFO";
  }

  const doc: EcsDocument = {
    "@timestamp": ts,
    severity,
    labels: {
      topic_id: topicShort,
      subscription_id: subShort,
    },
    cloud: gcpCloud(region, project, "pubsub"),
    gcp: {
      pubsub: {
        topic,
        subscription,
        message_id: messageId,
        publish_time: publishTime,
        delivery_attempt: deliveryAttempt,
      },
    },
    event: eventOutcome(isErr, durationNs),
    message,
  };

  if (isErr && variant !== "audit") {
    doc.error = {
      type: variant === "dlq" ? "DeadLetterExceeded" : "DeadlineExceeded",
      message:
        variant === "dlq"
          ? "Max delivery attempts exceeded"
          : "Ack deadline elapsed before subscriber acknowledged",
    };
  }

  return doc;
}

export function generateDataflowLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const jobName = rand(["clickstream-sessions", "etl-orders", "log-parser", "metrics-rollups"]);
  const jobId = `${new Date().getFullYear()}-${randInt(1, 12)}-${randInt(10, 28)}_${randInt(0, 23)}_${randInt(10, 59)}_${randInt(10, 59)}-${randId(6)}`;
  const jobType = rand(["STREAMING", "BATCH"] as const);
  const workerCount = isErr ? randInt(1, 4) : randInt(4, 80);
  const elementsCount = isErr ? randInt(0, 50_000) : randInt(50_000, 50_000_000);
  const durationNs = randLatencyMs(2000, isErr) * 1e6;
  const variant = isErr
    ? rand(["lifecycle", "worker", "pipeline", "error"] as const)
    : rand(["lifecycle", "worker", "pipeline", "lifecycle"] as const);

  let currentState = "JOB_STATE_RUNNING";
  let message = "";
  let severity = randSeverity(isErr);

  if (variant === "lifecycle") {
    currentState = isErr
      ? "JOB_STATE_FAILED"
      : rand(["JOB_STATE_RUNNING", "JOB_STATE_DONE", "JOB_STATE_UPDATED"] as const);
    message =
      currentState === "JOB_STATE_DONE"
        ? `dataflow.googleapis.com/projects/${project.id}/locations/${region}/jobs/${jobId}: Job ${jobName} transitioned to ${currentState}`
        : `dataflow.googleapis.com/projects/${project.id}/locations/${region}/jobs/${jobId}: Worker pool status ${currentState} jobName=${jobName}`;
    severity = currentState === "JOB_STATE_FAILED" ? "ERROR" : "INFO";
  } else if (variant === "worker") {
    currentState = "JOB_STATE_RUNNING";
    const from = randInt(2, 8);
    const to = isErr ? from : randInt(from + 1, 40);
    message = isErr
      ? `Worker harness OOMKilled on ${jobName} — last good state autoscaling workers from ${from} to ${to}`
      : `Autoscaling: raising number of workers from ${from} to ${to} for job ${jobId}`;
    severity = isErr ? "ERROR" : "INFO";
  } else if (variant === "pipeline") {
    currentState = "JOB_STATE_RUNNING";
    const wm = randFloat(0.0, 0.99).toFixed(4);
    message = `Step ${rand(["ReadFromPubSub/Map", "GroupByKey/Combine", "WriteToBigQuery"])} completed; watermark=${wm} elementsProcessed=${elementsCount.toLocaleString()}`;
    severity = "INFO";
  } else {
    currentState = "JOB_STATE_FAILED";
    message = rand([
      `Shuffle service UNAVAILABLE: Alluxio block read failed job=${jobId}`,
      `Workflow failed: org.apache.beam.runners.dataflow.DataflowJobCanceledException quota 'CPUS' exceeded`,
      `Processing stuck in ${rand(["GroupByKey", "CoGroupByKey"])} — suspected data skew / corruption in bundle`,
    ]);
    severity = "ERROR";
  }

  const doc: EcsDocument = {
    "@timestamp": ts,
    severity,
    labels: { job_id: jobId, job_name: jobName },
    cloud: gcpCloud(region, project, "dataflow"),
    gcp: {
      dataflow: {
        job_id: jobId,
        job_name: jobName,
        job_type: jobType,
        current_state: currentState,
        worker_count: workerCount,
        elements_count: elementsCount,
        region,
      },
    },
    event: eventOutcome(isErr, durationNs),
    message,
  };

  if (isErr) {
    doc.error = {
      type: "JobFailed",
      message: `Dataflow job ${jobName} in state ${currentState}`,
    };
  }

  return doc;
}

export function generatePubSubLiteLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const zone = randZone(region);
  const topicShort = `${rand(["lite-events", "lite-audit"])}-${randId(3)}`;
  const subShort = `${rand(["sub-a", "sub-b"])}-${randId(3)}`;
  const topicName = `projects/${project.id}/locations/${zone}/topics/${topicShort}`;
  const subscriptionName = `projects/${project.id}/locations/${zone}/subscriptions/${subShort}`;
  const partitionCount = randInt(2, 32);
  const messageThroughputBytesPerSec = isErr ? randInt(0, 50_000) : randInt(100_000, 12_000_000);
  const subscriberCount = isErr ? randInt(0, 2) : randInt(2, 40);
  const backlogMessageCount = isErr ? randInt(500_000, 50_000_000) : randInt(0, 25_000);
  const durationNs = randLatencyMs(30, isErr) * 1e6;
  const severity = randSeverity(isErr);
  const message = isErr
    ? `pubsublite.googleapis.com/${subscriptionName}: backlog_message_count=${backlogMessageCount} partition_throughput_insufficient subscribers=${subscriberCount}`
    : `pubsublite.googleapis.com/${topicName}: throughput_bytes_per_sec=${messageThroughputBytesPerSec} zone=${zone} partitions=${partitionCount}`;

  const doc: EcsDocument = {
    "@timestamp": ts,
    severity,
    labels: { zone, topic_id: topicShort },
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
    event: eventOutcome(isErr, durationNs),
    message,
  };

  if (isErr) {
    doc.error = {
      type: "BacklogPressure",
      message: `Partition throughput insufficient; ${subscriberCount} subscribers active`,
    };
  }

  return doc;
}
