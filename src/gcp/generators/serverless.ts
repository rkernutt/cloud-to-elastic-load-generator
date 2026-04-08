/**
 * GCP serverless and event-driven log generators (Cloud Functions, Cloud Run, App Engine, etc.).
 * Each generator returns one ECS-shaped document for the given timestamp and error rate.
 */

import {
  type EcsDocument,
  rand,
  randInt,
  randId,
  randIp,
  HTTP_METHODS,
  HTTP_PATHS,
  gcpCloud,
  makeGcpSetup,
  randHttpStatus,
  randLatencyMs,
} from "./helpers.js";

const CF_RUNTIMES = ["nodejs20", "python312", "go122", "java17"] as const;
const CF_TRIGGERS = ["http", "pubsub", "cloud-storage", "firestore"] as const;

export function generateCloudFunctionsLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const functionName = `${rand(["ingest", "transform", "notify", "validate", "webhook"])}-${randId(4).toLowerCase()}`;
  const executionId = `projects/${project.id}/locations/${region}/functions/${functionName}/executions/${randId(12).toLowerCase()}`;
  const memoryMb = rand([128, 256, 512, 1024, 2048, 4096]);
  const triggerType = rand(CF_TRIGGERS);
  const status = isErr ? rand(["error", "timeout", "crash"]) : rand(["ok", "success", "completed"]);
  const executionTimeMs = randLatencyMs(randInt(20, 800), isErr);
  const message = isErr
    ? `Function ${functionName} failed: ${rand(["Unhandled exception", "Memory limit exceeded", "Deadline exceeded", "Cold start init failed"])} (execution ${executionId.slice(-12)})`
    : `Function ${functionName} completed successfully via ${triggerType} trigger in ${executionTimeMs}ms`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "cloudfunctions.googleapis.com"),
    gcp: {
      cloud_functions: {
        function_name: functionName,
        runtime: rand(CF_RUNTIMES),
        execution_id: executionId,
        memory_mb: memoryMb,
        trigger_type: triggerType,
        status,
        execution_time_ms: executionTimeMs,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(executionTimeMs, executionTimeMs + randInt(0, 50)),
    },
    message,
  };
}

export function generateCloudRunLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const serviceName = `${rand(["api", "worker", "bff", "render"])}-${randId(5).toLowerCase()}`;
  const revision = `${serviceName}-${randId(8).toLowerCase()}`;
  const containerPort = rand([8080, 8080, 3000, 9443]);
  const requestMethod = rand(HTTP_METHODS);
  const urlPath = rand(HTTP_PATHS);
  const responseStatus = randHttpStatus(isErr);
  const latencyMs = randLatencyMs(randInt(15, 400), isErr);
  const concurrency = randInt(1, isErr ? 80 : 200);
  const message = isErr
    ? `Cloud Run ${serviceName} request ${requestMethod} ${urlPath} failed with HTTP ${responseStatus} after ${latencyMs}ms (client ${randIp()})`
    : `Cloud Run ${serviceName} served ${requestMethod} ${urlPath} in ${latencyMs}ms (status ${responseStatus}, concurrency ${concurrency})`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "run.googleapis.com"),
    gcp: {
      cloud_run: {
        service_name: serviceName,
        revision,
        container_port: containerPort,
        request_method: requestMethod,
        url_path: urlPath,
        response_status: responseStatus,
        latency_ms: latencyMs,
        concurrency,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(latencyMs, latencyMs + randInt(5, 120)),
    },
    message,
  };
}

export function generateAppEngineLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const service = rand(["default", "api", "frontend", "batch"]);
  const versionId = `v${randInt(1, 42)}-${randId(4).toLowerCase()}`;
  const instanceId = `aef-${service}-${randId(10).toLowerCase()}`;
  const requestMethod = rand(HTTP_METHODS);
  const resourcePath = rand(HTTP_PATHS);
  const responseStatus = randHttpStatus(isErr);
  const latencyMs = randLatencyMs(randInt(25, 600), isErr);
  const trafficSplitPct = randInt(1, 100);
  const message = isErr
    ? `App Engine ${service}/${versionId}: ${requestMethod} ${resourcePath} returned ${responseStatus} (${latencyMs}ms)`
    : `App Engine ${service}/${versionId} handled ${requestMethod} ${resourcePath} in ${latencyMs}ms (${trafficSplitPct}% traffic slice)`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "appengine.googleapis.com"),
    gcp: {
      app_engine: {
        service,
        version_id: versionId,
        instance_id: instanceId,
        request_method: requestMethod,
        resource_path: resourcePath,
        response_status: responseStatus,
        latency_ms: latencyMs,
        traffic_split_pct: trafficSplitPct,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(latencyMs, latencyMs + randInt(10, 200)),
    },
    message,
  };
}

export function generateCloudTasksLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const queueName = `${rand(["default", "email", "exports", "webhooks"])}-${randId(3).toLowerCase()}`;
  const taskName = `projects/${project.id}/locations/${region}/queues/${queueName}/tasks/${randId(16).toLowerCase()}`;
  const dispatchCount = isErr ? randInt(2, 8) : randInt(0, 2);
  const responseCode = isErr ? rand([408, 429, 500, 503]) : rand([200, 200, 204]);
  const base = new Date(ts).getTime();
  const scheduleTime = new Date(base + randInt(-3600_000, 3600_000)).toISOString();
  const createTime = new Date(base - randInt(60_000, 3_600_000)).toISOString();
  const message = isErr
    ? `Cloud Tasks task ${taskName} failed after ${dispatchCount} dispatch(es); HTTP ${responseCode}`
    : `Cloud Tasks enqueued and delivered task ${taskName} (queue ${queueName}, response ${responseCode})`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "cloudtasks.googleapis.com"),
    gcp: {
      cloud_tasks: {
        queue_name: queueName,
        task_name: taskName,
        dispatch_count: dispatchCount,
        response_code: responseCode,
        schedule_time: scheduleTime,
        create_time: createTime,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(50, isErr ? 9000 : 2000),
    },
    message,
  };
}

export function generateCloudSchedulerLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const jobName = `${rand(["nightly", "hourly", "sync", "purge"])}-${randId(4).toLowerCase()}`;
  const schedule = rand(["0 * * * *", "0 3 * * *", "*/15 * * * *", "30 9 * * 1-5"]);
  const targetType = rand(["http", "pubsub", "app-engine"] as const);
  const status = isErr ? rand(["FAILED", "DEADLINE_EXCEEDED", "PERMISSION_DENIED"]) : rand(["SUCCESS", "OK", "COMPLETED"]);
  const attemptCount = isErr ? randInt(2, 5) : 1;
  const message = isErr
    ? `Cloud Scheduler job ${jobName} (${schedule}) targeting ${targetType} failed after ${attemptCount} attempt(s): ${status}`
    : `Cloud Scheduler job ${jobName} fired on ${schedule} and delivered to ${targetType} (${status})`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "cloudscheduler.googleapis.com"),
    gcp: {
      cloud_scheduler: {
        job_name: jobName,
        schedule,
        target_type: targetType,
        status,
        attempt_count: attemptCount,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(200, isErr ? 120_000 : 5000),
    },
    message,
  };
}

export function generateWorkflowsLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const workflowName = `${rand(["orders", "onboarding", "etl", "approval"])}-workflow`;
  const executionId = `projects/${project.id}/locations/${region}/workflows/${workflowName}/executions/${randId(10).toLowerCase()}`;
  const state = isErr ? rand(["FAILED", "CANCELLED", "TIMEOUT"]) : rand(["ACTIVE", "SUCCEEDED", "COMPLETED"]);
  const stepName = rand(["validateInput", "callPaymentApi", "notifyUser", "transformPayload", "waitHuman"]);
  const startTime = new Date(new Date(ts).getTime() - randInt(1000, 600_000)).toISOString();
  const durationMs = randLatencyMs(randInt(500, 8000), isErr);
  const message = isErr
    ? `Workflow ${workflowName} execution ${executionId} failed in step ${stepName} (${state}, ${durationMs}ms)`
    : `Workflow ${workflowName} execution ${executionId} progressed through ${stepName} (${state}) in ${durationMs}ms`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "workflows.googleapis.com"),
    gcp: {
      workflows: {
        workflow_name: workflowName,
        execution_id: executionId,
        state,
        step_name: stepName,
        start_time: startTime,
        duration_ms: durationMs,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(durationMs, durationMs + randInt(0, 500)),
    },
    message,
  };
}

export function generateEventarcLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const triggerName = `trigger-${rand(["storage", "audit", "firestore", "pubsub"])}-${randId(5).toLowerCase()}`;
  const eventType = rand([
    "google.cloud.storage.object.v1.finalized",
    "google.cloud.audit.log.v1.written",
    "google.cloud.firestore.document.v1.written",
    "google.cloud.pubsub.topic.v1.messagePublished",
  ]);
  const channel = `projects/${project.id}/locations/${region}/channels/${randId(8).toLowerCase()}`;
  const destination = rand(["cloud-run", "workflows", "cloud-functions"] as const);
  const deliveryStatus = isErr ? rand(["FAILED", "INVALID_PAYLOAD", "DESTINATION_UNAVAILABLE"]) : rand(["DELIVERED", "ACKNOWLEDGED", "SUCCESS"]);
  const message = isErr
    ? `Eventarc delivery to ${destination} failed for ${eventType} (${deliveryStatus}, trigger ${triggerName})`
    : `Eventarc routed ${eventType} to ${destination} via ${triggerName} (${deliveryStatus})`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "eventarc.googleapis.com"),
    gcp: {
      eventarc: {
        trigger_name: triggerName,
        event_type: eventType,
        channel,
        destination,
        delivery_status: deliveryStatus,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(30, isErr ? 8000 : 1200),
    },
    message,
  };
}

export function generateCloudRunJobsLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const jobName = `job-${rand(["etl", "batch", "report", "purge"])}-${randId(5).toLowerCase()}`;
  const executionId = `exec-${randId(12).toLowerCase()}`;
  const taskCount = randInt(1, 32);
  const taskIndex = randInt(0, Math.max(0, taskCount - 1));
  const status = isErr ? rand(["FAILED", "RUNNING"] as const) : rand(["PENDING", "RUNNING", "SUCCEEDED", "FAILED"] as const);
  const timeoutSeconds = randInt(300, 86400);
  const parallelism = randInt(1, Math.min(10, taskCount));
  const containerImage = `${region}-docker.pkg.dev/${project.id}/jobs/${jobName}:${rand(["latest", `v${randInt(1, 3)}.${randInt(0, 9)}`])}`;
  const message = isErr
    ? `Cloud Run Job ${jobName} execution ${executionId} task ${taskIndex}/${taskCount} ${status}: ${rand(["Container crash", "Deadline exceeded", "Image pull failed"])}`
    : `Cloud Run Job ${jobName} ${executionId} task ${taskIndex}/${taskCount} ${status} (parallelism ${parallelism}, timeout ${timeoutSeconds}s)`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "cloud-run-jobs"),
    gcp: {
      cloud_run_jobs: {
        job_name: jobName,
        execution_id: executionId,
        task_index: taskIndex,
        task_count: taskCount,
        status,
        timeout_seconds: timeoutSeconds,
        parallelism,
        container_image: containerImage,
      },
    },
    event: {
      outcome: isErr || status === "FAILED" ? "failure" : "success",
      duration: randInt(1000, isErr ? 900_000 : 120_000),
    },
    message,
  };
}

export function generateServerlessVpcAccessLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const connectorName = `vpc-conn-${randId(6).toLowerCase()}`;
  const network = rand(["default", "prod-vpc", "serverless-net", "shared-vpc"]);
  const ipRange = `10.${randInt(8, 31)}.${randInt(0, 255)}.0/28`;
  const throughput = rand(["MIN", "DEFAULT", "MAX"] as const);
  const status = isErr ? rand(["ERROR", "DEGRADED"] as const) : rand(["READY", "RUNNING", "UPDATING"] as const);
  const instancesActive = isErr ? randInt(0, 2) : randInt(2, 100);
  const packetsForwarded = isErr ? randInt(0, 5000) : randInt(10_000, 50_000_000);
  const message = isErr
    ? `Serverless VPC Access ${connectorName} on ${network} ${status}: packet forwarding stalled (${packetsForwarded} pkts)`
    : `Serverless VPC Access ${connectorName} ${network} ${ipRange} throughput=${throughput} active=${instancesActive} forwarded=${packetsForwarded}`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "serverless-vpc-access"),
    gcp: {
      serverless_vpc_access: {
        connector_name: connectorName,
        network,
        ip_range: ipRange,
        throughput,
        status,
        instances_active: instancesActive,
        packets_forwarded: packetsForwarded,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(500, isErr ? 60_000 : 8000),
    },
    message,
  };
}
