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

const GRPC_ERROR_STATUSES = [
  "INTERNAL",
  "DEADLINE_EXCEEDED",
  "PERMISSION_DENIED",
  "RESOURCE_EXHAUSTED",
  "NOT_FOUND",
  "UNAVAILABLE",
] as const;

function grpcStructuredFault(isErr: boolean): {
  spread: Record<string, unknown>;
  rpcLabel: Record<string, string>;
} {
  if (!isErr) return { spread: {}, rpcLabel: {} };
  const code = rand([...GRPC_ERROR_STATUSES]);
  return {
    spread: {
      "gcp.rpc": { status_code: code },
      error: { code, message: `${code}: operation failed`, type: "gcp" },
    },
    rpcLabel: { "gcp.rpc.status_code": code },
  };
}

function eventBlock(isErr: boolean, durationNs: number) {
  return {
    outcome: isErr ? ("failure" as const) : ("success" as const),
    duration: durationNs,
  };
}

function databaseEvent(
  isErr: boolean,
  durationNs: number,
  action: string,
  type?: readonly (
    | "access"
    | "change"
    | "connection"
    | "creation"
    | "error"
    | "info"
    | "start"
    | "end"
  )[]
) {
  return {
    kind: "event" as const,
    category: ["database"] as const,
    type: type ?? (isErr ? (["error"] as const) : (["access"] as const)),
    action,
    ...eventBlock(isErr, durationNs),
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
  let auditAction = `pubsub.${variant}`;
  let eventTypes: readonly ("access" | "change" | "connection" | "creation" | "error")[] = isErr
    ? ["error"]
    : ["connection"];

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
    auditAction = map[method];
    eventTypes = isErr ? ["error"] : method.includes("Create") ? ["creation"] : ["change"];
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

  const { spread: faultSpread, rpcLabel } = grpcStructuredFault(isErr);
  const faultErr =
    faultSpread.error && typeof faultSpread.error === "object"
      ? (faultSpread.error as Record<string, string>)
      : undefined;

  const doc: EcsDocument = {
    "@timestamp": ts,
    severity,
    log: { level: isErr ? "error" : "info" },
    ...(faultSpread["gcp.rpc"] ? { "gcp.rpc": faultSpread["gcp.rpc"] } : {}),
    labels: {
      topic_id: topicShort,
      subscription_id: subShort,
      ...rpcLabel,
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
    event: databaseEvent(isErr, durationNs, auditAction, eventTypes),
    message,
  };

  if (isErr) {
    doc.error = faultErr
      ? variant !== "audit"
        ? {
            ...faultErr,
            type: variant === "dlq" ? "DeadLetterExceeded" : "DeadlineExceeded",
            message:
              variant === "dlq"
                ? "Max delivery attempts exceeded"
                : "Ack deadline elapsed before subscriber acknowledged",
          }
        : faultErr
      : undefined;
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

  const { spread: faultSpread, rpcLabel } = grpcStructuredFault(isErr);
  const faultErr =
    faultSpread.error && typeof faultSpread.error === "object"
      ? (faultSpread.error as Record<string, string>)
      : undefined;

  const doc: EcsDocument = {
    "@timestamp": ts,
    severity,
    log: { level: isErr ? "error" : "info" },
    ...(faultSpread["gcp.rpc"] ? { "gcp.rpc": faultSpread["gcp.rpc"] } : {}),
    labels: { job_id: jobId, job_name: jobName, ...rpcLabel },
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
    event: databaseEvent(
      isErr,
      durationNs,
      `dataflow.${variant}`,
      isErr ? ["error"] : currentState === "JOB_STATE_DONE" ? ["end"] : ["start"]
    ),
    message,
  };

  if (isErr && faultErr) {
    doc.error = {
      ...faultErr,
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

  const { spread: faultSpread, rpcLabel } = grpcStructuredFault(isErr);
  const faultErr =
    faultSpread.error && typeof faultSpread.error === "object"
      ? (faultSpread.error as Record<string, string>)
      : undefined;

  const doc: EcsDocument = {
    "@timestamp": ts,
    severity,
    log: { level: isErr ? "error" : "info" },
    ...(faultSpread["gcp.rpc"] ? { "gcp.rpc": faultSpread["gcp.rpc"] } : {}),
    labels: { zone, topic_id: topicShort, ...rpcLabel },
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
    event: databaseEvent(
      isErr,
      durationNs,
      "pubsub-lite.throughput",
      isErr ? ["error"] : ["connection"]
    ),
    message,
  };

  if (isErr && faultErr) {
    doc.error = {
      ...faultErr,
      type: "BacklogPressure",
      message: `Partition throughput insufficient; ${subscriberCount} subscribers active`,
    };
  }

  return doc;
}
