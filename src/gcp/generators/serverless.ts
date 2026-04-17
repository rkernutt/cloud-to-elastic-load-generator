/**
 * GCP serverless and event-driven log generators.
 */

import {
  type EcsDocument,
  rand,
  randInt,
  randFloat,
  randId,
  randIp,
  randUUID,
  HTTP_METHODS,
  HTTP_PATHS,
  USER_AGENTS,
  gcpCloud,
  makeGcpSetup,
  randHttpStatus,
  randLatencyMs,
  randTraceId,
  randSpanId,
  randServiceAccount,
  randPrincipal,
  randOperationId,
} from "./helpers.js";

const CF_RUNTIMES = ["nodejs20", "python312", "go122", "java17"] as const;
const CF_TRIGGERS = ["http", "pubsub", "cloud-storage", "firestore"] as const;

function gcpTrace(projectId: string, traceId: string): string {
  return `projects/${projectId}/traces/${traceId}`;
}

function latencySecondsStr(ms: number): string {
  return `${(ms / 1000).toFixed(3)}s`;
}

function cfNodeErrorStack(): string {
  const msg = rand([
    "Cannot read properties of undefined (reading 'data')",
    "connect ECONNREFUSED 127.0.0.1:6379",
    "Unexpected token } in JSON",
  ]);
  return `Error: ${msg}\n    at exports.${rand(["handler", "onRequest", "processMessage"])} (/workspace/index.js:${randInt(12, 220)}:${randInt(5, 40)})\n    at cloudFunction (/workspace/node_modules/@google-cloud/functions-framework/build/src/function_wrappers.js:${randInt(40, 120)}:${randInt(5, 20)})\n    at process.processTicksAndRejections (node:internal/process/task_queues:${randInt(90, 110)}:5)`;
}

function cfPythonErrorStack(): string {
  return `Traceback (most recent call last):\n  File "/workspace/main.py", line ${randInt(24, 180)}, in ${rand(["handler", "process_event", "invoke"])}\n    ${rand(["result = client.get(key)", "data = json.loads(body)", "resp.raise_for_status()"])}\n  File "/layers/google.python.pip/pip/lib/python3.12/site-packages/google/cloud/${rand(["storage", "firestore", "pubsub_v1"])}/client.py", line ${randInt(200, 520)}, in ${rand(["_retry", "api_call", "get"])}\n${rand(["google.api_core.exceptions.DeadlineExceeded: 504 The request deadline has been exceeded.", "KeyError: 'userId'", "ValueError: invalid literal for int() with base 10: 'nan'"])}`;
}

function cfGoErrorStack(): string {
  return `panic: ${rand(["runtime error: index out of range", "assignment to entry in nil map", "send on closed channel"])}\n\ngoroutine ${randInt(1, 99)} [running]:\nmain.${rand(["Handler", "process", "dispatch"])}(...)\n\t/workspace/main.go:${randInt(15, 200)} +0x${randId(3).toLowerCase()}\nreflect.Value.call({0x${randId(6).toLowerCase()}?, 0x${randId(6).toLowerCase()}?}, ...)\n\t/usr/local/go/src/reflect/value.go:${randInt(500, 620)} +0x${randId(3).toLowerCase()}`;
}

export function generateCloudFunctionsLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const functionName = `${rand(["ingest", "transform", "notify", "validate", "webhook"])}-${randId(4).toLowerCase()}`;
  const executionShort = randId(12).toLowerCase();
  const executionId = `projects/${project.id}/locations/${region}/functions/${functionName}/executions/${executionShort}`;
  const memoryMb = rand([128, 256, 512, 1024, 2048, 4096]);
  const triggerType = rand(CF_TRIGGERS);
  const runtime = rand(CF_RUNTIMES);
  const isNode = runtime.startsWith("nodejs");
  const isPython = runtime.startsWith("python");
  const isGo = runtime.startsWith("go");
  const executionTimeMs = randLatencyMs(randInt(20, 800), isErr);
  const coldStart = Math.random() < 0.08;
  const traceId = randTraceId();
  const spanId = randSpanId();
  const withTrace = Math.random() < 0.55;
  const trace = withTrace ? gcpTrace(project.id, traceId) : undefined;
  const style = isErr
    ? rand(["platform_end", "structured_json", "plain", "error_stack", "error_stack", "audit"])
    : rand([
        "platform_start",
        "platform_end",
        "platform_boost",
        "structured_json",
        "structured_json",
        "plain",
        "plain",
        "error_stack",
        "audit",
      ]);
  const status = isErr ? rand(["error", "timeout", "crash"]) : rand(["ok", "success", "completed"]);
  let message: string;
  let severity: string;
  let jsonPayload: Record<string, unknown> | undefined;
  let protoPayload: Record<string, unknown> | undefined;
  let explicitText: string | undefined;

  if (style === "platform_start") {
    message = `Function execution started for ${functionName} with execution ID ${executionShort}`;
    severity = "INFO";
    explicitText = message;
  } else if (style === "platform_end") {
    message = `Function execution took ${executionTimeMs} ms, finished with status: '${isErr ? "error" : "ok"}'`;
    severity = isErr ? "ERROR" : "INFO";
    explicitText = message;
  } else if (style === "platform_boost") {
    message = "Default STARTUP CPU boost enabled for this function execution";
    severity = "DEBUG";
    explicitText = message;
  } else if (style === "structured_json") {
    const sev = isErr ? "ERROR" : "INFO";
    const body: Record<string, unknown> = {
      severity: sev,
      message: isErr
        ? rand([
            "Downstream timeout calling Firestore",
            "Pub/Sub publish failed",
            "Invalid signature on webhook",
          ])
        : rand(["Processing request...", "Validated payload", "Published result to topic"]),
      execution_id: executionShort,
      function_name: functionName,
      cold_start: coldStart,
      memory_mb: memoryMb,
      trigger: triggerType,
    };
    if (withTrace) {
      body["logging.googleapis.com/trace"] = trace;
      body["logging.googleapis.com/spanId"] = spanId;
    }
    message = JSON.stringify(body);
    severity = sev;
    jsonPayload = body;
  } else if (style === "plain") {
    const line = isPython
      ? `[${isErr ? "ERROR" : "INFO"}] ${ts} ${executionShort} ${rand(["handler invoked", "flush complete", "skipping noop update", "emitted metric custom/invocations"])}`
      : `${ts}  ${isErr ? "ERROR" : "INFO"} ${executionShort} ${rand(["User authenticated", "Cache miss for key", "Wrote object gs://", "Forwarding to downstream"])}`;
    message = line;
    severity = isErr ? "ERROR" : "INFO";
    explicitText = line;
  } else if (style === "error_stack") {
    const stack = isNode
      ? cfNodeErrorStack()
      : isPython
        ? cfPythonErrorStack()
        : isGo
          ? cfGoErrorStack()
          : cfNodeErrorStack();
    const errObj = {
      severity: "ERROR",
      message: "Unhandled error",
      execution_id: executionShort,
      function_name: functionName,
      stack_trace: stack,
    };
    message = isErr
      ? stack
      : JSON.stringify({ ...errObj, message: "Recovered non-fatal error", severity: "WARNING" });
    severity = isErr ? "ERROR" : "WARNING";
    jsonPayload = isErr
      ? errObj
      : { ...errObj, message: "Recovered non-fatal error", severity: "WARNING" };
  } else {
    protoPayload = {
      "@type": "type.googleapis.com/google.cloud.audit.AuditLog",
      authenticationInfo: {
        principalEmail: randServiceAccount(project),
        principalSubject: randPrincipal(project),
      },
      authorizationInfo: [
        {
          resource: `projects/${project.id}/locations/${region}/functions/${functionName}`,
          permission: "cloudfunctions.functions.update",
          granted: true,
        },
      ],
      methodName: "google.cloud.functions.v2.FunctionService.UpdateFunction",
      resourceName: `projects/${project.id}/locations/${region}/functions/${functionName}`,
      request: {
        "@type": "type.googleapis.com/google.cloud.functions.v2.UpdateFunctionRequest",
        function: {
          name: `projects/${project.id}/locations/${region}/functions/${functionName}`,
          build_config: { runtime },
        },
      },
      response: {
        "@type": "type.googleapis.com/google.longrunning.Operation",
        name: randOperationId(),
        done: !isErr,
      },
    };
    message = `audit_log, method: "${protoPayload.methodName}", resource_name: "${protoPayload.resourceName}"`;
    severity = isErr ? "ERROR" : "NOTICE";
  }

  const labels: Record<string, string> = {
    execution_id: executionShort,
    function_name: functionName,
    region,
    runtime,
  };

  return {
    "@timestamp": ts,
    severity,
    ...(trace ? { trace, spanId } : {}),
    labels,
    ...(explicitText != null ? { textPayload: explicitText } : {}),
    ...(jsonPayload != null ? { jsonPayload } : {}),
    ...(protoPayload != null ? { protoPayload } : {}),
    log: { level: severity.toLowerCase() },
    cloud: gcpCloud(region, project, "cloudfunctions.googleapis.com"),
    gcp: {
      cloud_functions: {
        function_name: functionName,
        runtime,
        execution_id: executionId,
        memory_mb: memoryMb,
        trigger_type: triggerType,
        status,
        execution_time_ms: executionTimeMs,
        cold_start: coldStart,
        log_style: style,
        ...(withTrace ? { trace: gcpTrace(project.id, traceId), span_id: spanId } : {}),
        metrics: {
          execution_count: { sum: 1, avg: 1 },
          user_memory_bytes: {
            avg: randInt(memoryMb * 50_000, memoryMb * 900_000),
            max: memoryMb * 1_000_000,
          },
          execution_times_ms: { avg: executionTimeMs, max: Math.round(executionTimeMs * 1.25) },
          active_instances: { avg: randInt(1, coldStart ? 8 : 40) },
          billable_instance_time_ms: { sum: executionTimeMs + (coldStart ? randInt(80, 900) : 0) },
        },
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
  const revisionName = `${serviceName}-${randId(8).toLowerCase()}`;
  const containerPort = rand([8080, 8080, 3000, 9443]);
  const requestMethod = rand(HTTP_METHODS);
  const urlPath = rand(HTTP_PATHS);
  const responseStatus = randHttpStatus(isErr);
  const latencyMs = randLatencyMs(randInt(15, 400), isErr);
  const concurrency = randInt(1, isErr ? 80 : 200);
  const maxInstances = randInt(10, 200);
  const traceId = randTraceId();
  const spanId = randSpanId();
  const withTrace = Math.random() < 0.6;
  const trace = withTrace ? gcpTrace(project.id, traceId) : undefined;
  const coldContainer = Math.random() < 0.07;
  const billedInstanceMs = latencyMs + (coldContainer ? randInt(120, 2000) : randInt(0, 80));
  const cpuMillis = randInt(50, 800);
  const style = isErr
    ? rand(["http_json", "stderr", "revision", "app_json"])
    : rand([
        "http_json",
        "http_json",
        "app_json",
        "app_json",
        "stdout_plain",
        "revision",
        "cold_start",
        "stderr",
      ]);

  let message: string;
  let severity: string;
  let jsonPayload: Record<string, unknown> | undefined;
  let textPayload: string | undefined;
  let httpRequest: Record<string, unknown> | undefined;

  const host = `${serviceName}-${randId(6).toLowerCase()}-${region}.a.run.app`;
  const fullUrl = `https://${host}${urlPath}`;

  if (style === "http_json") {
    httpRequest = {
      requestMethod,
      requestUrl: fullUrl,
      requestSize: String(randInt(120, 45_000)),
      status: responseStatus,
      responseSize: String(randInt(200, 2_000_000)),
      userAgent: rand(USER_AGENTS),
      remoteIp: randIp(),
      serverIp: randIp(),
      latency: latencySecondsStr(latencyMs),
      protocol: rand(["HTTP/1.1", "HTTP/1.1", "HTTP/2"]),
      referer:
        Math.random() < 0.25
          ? `https://${rand(["app", "portal", "admin"])}.${rand(["example.com", "corp.internal"])}${rand(HTTP_PATHS)}`
          : undefined,
    };
    message = JSON.stringify({ httpRequest, trace: withTrace ? trace : undefined });
    severity = responseStatus >= 500 ? "ERROR" : responseStatus >= 400 ? "WARNING" : "INFO";
  } else if (style === "app_json") {
    jsonPayload = {
      level: isErr ? "error" : "info",
      msg: isErr
        ? rand([
            "upstream 503 from payments",
            "validation failed on line",
            "context deadline exceeded",
          ])
        : rand(["Handling request", "commit ok", "cache refreshed"]),
      trace_id: traceId,
      span_id: spanId,
      service: serviceName,
      revision: revisionName,
    };
    message = JSON.stringify(jsonPayload);
    severity = isErr ? "ERROR" : "INFO";
  } else if (style === "stdout_plain") {
    textPayload = `${ts}\t${serviceName}\t${requestMethod}\t${urlPath}\t${responseStatus}\t${latencyMs}ms`;
    message = textPayload;
    severity = "INFO";
  } else if (style === "stderr") {
    const panic = `panic: ${rand(["invalid memory address or nil pointer dereference", "runtime error: slice bounds out of range", "concurrent map writes"])}`;
    const stack = `goroutine ${randInt(1, 64)} [running]:\nnet/http.(*conn).serve(0x${randId(8).toLowerCase()})\n\t/usr/local/go/src/net/http/server.go:${randInt(3000, 3300)} +0x${randId(3).toLowerCase()}\nmain.main()\n\t/app/cmd/server/main.go:${randInt(40, 220)} +0x${randId(3).toLowerCase()}`;
    textPayload = isErr
      ? `${panic}\n\n${stack}`
      : `2026/04/16 ${randInt(10, 23)}:${randInt(10, 59)}:${randInt(10, 59)} [WARN] slow query ${latencyMs}ms`;
    message = textPayload;
    severity = isErr ? "ERROR" : "WARNING";
  } else if (style === "revision") {
    message = isErr
      ? `Revision '${revisionName}' is not yet ready. Latest Ready Revision may be unhealthy.`
      : rand([
          `Activating revision '${revisionName}' for service ${serviceName}.`,
          `Revision '${revisionName}' deployed and serving ${randInt(0, 100)}% of traffic.`,
        ]);
    severity = isErr ? "ERROR" : "NOTICE";
    textPayload = message;
  } else {
    message = `Container started in ${randInt(180, 4200)} ms for revision ${revisionName} (cold start)`;
    severity = "INFO";
    textPayload = message;
  }

  const labels: Record<string, string> = {
    service_name: serviceName,
    revision_name: revisionName,
    location: region,
    configuration_name: serviceName,
  };

  return {
    "@timestamp": ts,
    severity,
    ...(trace ? { trace, spanId } : {}),
    labels,
    ...(httpRequest != null ? { httpRequest } : {}),
    ...(jsonPayload != null ? { jsonPayload } : {}),
    ...(textPayload != null ? { textPayload } : {}),
    log: { level: severity.toLowerCase() },
    cloud: gcpCloud(region, project, "run.googleapis.com"),
    gcp: {
      cloud_run: {
        service_name: serviceName,
        revision: revisionName,
        revision_name: revisionName,
        container_port: containerPort,
        request_method: requestMethod,
        url_path: urlPath,
        response_status: responseStatus,
        latency_ms: latencyMs,
        concurrency,
        max_instance_count: maxInstances,
        billed_instance_time_ms: billedInstanceMs,
        cpu_allocation_milli: cpuMillis,
        request_count: randInt(1, isErr ? 50 : 5000),
        log_style: style,
        ...(withTrace ? { trace: gcpTrace(project.id, traceId), span_id: spanId } : {}),
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
  const moduleId = rand(["default", "api", "frontend", "batch"]);
  const versionId = `v${randInt(1, 42)}-${randId(4).toLowerCase()}`;
  const instanceId = `aef-${moduleId}-${randId(10).toLowerCase()}`;
  const requestMethod = rand(HTTP_METHODS);
  const resourcePath = rand(HTTP_PATHS);
  const responseStatus = randHttpStatus(isErr);
  const latencyMs = randLatencyMs(randInt(25, 600), isErr);
  const trafficSplitPct = randInt(1, 100);
  const traceId = randTraceId();
  const spanId = randSpanId();
  const withTrace = Math.random() < 0.5;
  const trace = withTrace ? gcpTrace(project.id, traceId) : undefined;
  const style = isErr
    ? rand(["request_proto", "app_json", "scaling"])
    : rand(["request_proto", "request_proto", "app_json", "deploy", "scaling", "scaling"]);

  let message: string;
  let severity: string;
  let protoPayload: Record<string, unknown> | undefined;
  let jsonPayload: Record<string, unknown> | undefined;
  let textPayload: string | undefined;

  if (style === "request_proto") {
    protoPayload = {
      "@type": "type.googleapis.com/google.appengine.logging.v1.RequestLog",
      appId: `s~${project.id}`,
      moduleId,
      versionId,
      requestId: randUUID().replace(/-/g, "").slice(0, 24),
      ip: randIp(),
      startTime: ts,
      endTime: new Date(new Date(ts).getTime() + latencyMs).toISOString(),
      latency: latencySecondsStr(latencyMs),
      method: requestMethod,
      resource: resourcePath,
      httpVersion: rand(["HTTP/1.1", "HTTP/2"]),
      status: responseStatus,
      responseSize: String(randInt(500, 4_000_000)),
      urlMapEntry: `${rand(["default", "api"])}.${rand(["dot", "automatic"])}.application`,
      finished: !isErr,
    };
    message = `${requestMethod} ${resourcePath} HTTP/1.1" ${responseStatus} ${protoPayload.responseSize}`;
    severity = responseStatus >= 500 ? "ERROR" : "INFO";
  } else if (style === "app_json") {
    jsonPayload = {
      severity: isErr ? "ERROR" : "INFO",
      logger: rand(["root", "app.request", "werkzeug", "com.example.api"]),
      message: isErr
        ? rand(["Datastore timeout", "Memcache miss storm", "Thread pool exhausted"])
        : rand(["served static asset", "rendered template", "RPC ok"]),
      module: moduleId,
      version: versionId,
      instance: instanceId,
    };
    message = JSON.stringify(jsonPayload);
    severity = isErr ? "ERROR" : "INFO";
  } else if (style === "deploy") {
    message = `Deploying version ${versionId} to service ${moduleId} (${region}) — traffic split ${trafficSplitPct}% canary`;
    severity = "NOTICE";
    textPayload = message;
  } else {
    message = isErr
      ? `Instance ${instanceId} shut down due to unhealthy checks after ${randInt(2, 9)} failures`
      : rand([
          `Instance ${instanceId} started for module ${moduleId}/${versionId}`,
          `Instance ${instanceId} shut down due to low traffic`,
        ]);
    severity = isErr ? "ERROR" : "INFO";
    textPayload = message;
  }

  const labels: Record<string, string> = {
    module_id: moduleId,
    version_id: versionId,
    instance_id: instanceId,
    region,
  };

  return {
    "@timestamp": ts,
    severity,
    moduleId,
    versionId,
    instanceId,
    ...(trace ? { trace, spanId } : {}),
    labels,
    ...(protoPayload != null ? { protoPayload } : {}),
    ...(jsonPayload != null ? { jsonPayload } : {}),
    ...(textPayload != null ? { textPayload } : {}),
    log: { level: severity.toLowerCase() },
    cloud: gcpCloud(region, project, "appengine.googleapis.com"),
    gcp: {
      app_engine: {
        service: moduleId,
        version_id: versionId,
        instance_id: instanceId,
        request_method: requestMethod,
        resource_path: resourcePath,
        response_status: responseStatus,
        latency_ms: latencyMs,
        traffic_split_pct: trafficSplitPct,
        log_style: style,
        ...(withTrace ? { trace: gcpTrace(project.id, traceId), span_id: spanId } : {}),
        metrics: {
          instance_count: { avg: randInt(2, 80), max: randInt(5, 120) },
          qps: { avg: randFloat(0.5, 420), max: randFloat(10, 1200) },
          latency_ms: { avg: latencyMs, p95: Math.round(latencyMs * 1.8) },
        },
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
  const taskId = randId(16).toLowerCase();
  const taskName = `projects/${project.id}/locations/${region}/queues/${queueName}/tasks/${taskId}`;
  const dispatchCount = isErr ? randInt(2, 8) : randInt(0, 2);
  const responseCode = isErr ? rand([408, 429, 500, 503]) : rand([200, 200, 204]);
  const base = new Date(ts).getTime();
  const scheduleTime = new Date(base + randInt(-3600_000, 3600_000)).toISOString();
  const createTime = new Date(base - randInt(60_000, 3_600_000)).toISOString();
  const traceId = randTraceId();
  const withTrace = Math.random() < 0.45;
  const trace = withTrace ? gcpTrace(project.id, traceId) : undefined;
  const spanId = randSpanId();
  const style = isErr
    ? rand(["task_failed", "attempt", "audit"])
    : rand(["enqueue", "delivered", "delivered", "attempt", "audit"]);

  let message: string;
  let severity: string;
  let protoPayload: Record<string, unknown> | undefined;
  let jsonPayload: Record<string, unknown> | undefined;
  let textPayload: string | undefined;

  if (style === "audit") {
    protoPayload = {
      "@type": "type.googleapis.com/google.cloud.audit.AuditLog",
      authenticationInfo: { principalEmail: randServiceAccount(project) },
      methodName: "google.cloud.tasks.v2.CloudTasks.CreateTask",
      resourceName: `projects/${project.id}/locations/${region}/queues/${queueName}`,
      request: {
        task: {
          name: taskName,
          httpRequest: {
            url: `https://${rand(["worker", "hooks"])}.${project.id}.example.com${rand(HTTP_PATHS)}`,
            httpMethod: rand(HTTP_METHODS),
          },
        },
      },
    };
    message = `cloudaudit.googleapis.com/activity: ${protoPayload.methodName}`;
    severity = "NOTICE";
  } else if (style === "task_failed" || style === "delivered") {
    jsonPayload = {
      task: taskName,
      queue: queueName,
      dispatchCount,
      responseCode,
      scheduleTime,
      createTime,
      targetType: rand(["HTTP", "HTTP", "OIDC", "AppEngineHttpRequest"]),
      lastAttempt: {
        scheduleTime: ts,
        responseStatus: responseCode,
        responseTime: latencySecondsStr(randLatencyMs(randInt(40, 2000), isErr)),
      },
    };
    message = JSON.stringify(jsonPayload);
    severity = isErr ? "ERROR" : "INFO";
  } else {
    textPayload =
      style === "enqueue"
        ? `Enqueued task ${taskId} on queue ${queueName} (ETA ${scheduleTime})`
        : `Attempt ${dispatchCount} for task ${taskId}: HTTP ${responseCode} in ${randLatencyMs(randInt(30, 900), isErr)}ms`;
    message = textPayload;
    severity = dispatchCount > 2 ? "WARNING" : "INFO";
  }

  const labels: Record<string, string> = {
    queue_id: queueName,
    task_id: taskId,
    location: region,
  };

  return {
    "@timestamp": ts,
    severity,
    ...(trace ? { trace, spanId } : {}),
    labels,
    ...(protoPayload != null ? { protoPayload } : {}),
    ...(jsonPayload != null ? { jsonPayload } : {}),
    ...(textPayload != null ? { textPayload } : {}),
    log: { level: severity.toLowerCase() },
    cloud: gcpCloud(region, project, "cloudtasks.googleapis.com"),
    gcp: {
      cloud_tasks: {
        queue_name: queueName,
        task_name: taskName,
        dispatch_count: dispatchCount,
        response_code: responseCode,
        schedule_time: scheduleTime,
        create_time: createTime,
        attempt_latency_ms: randLatencyMs(randInt(50, 4000), isErr),
        log_style: style,
        ...(withTrace ? { trace: gcpTrace(project.id, traceId), span_id: spanId } : {}),
        metrics: {
          task_attempt_count: { sum: dispatchCount, max: dispatchCount },
          queue_depth: { avg: randInt(0, isErr ? 50_000 : 800), max: randInt(100, 120_000) },
          task_latency_ms: { avg: randInt(120, 8000), p95: randInt(500, 25_000) },
        },
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
  const status = isErr
    ? rand(["FAILED", "DEADLINE_EXCEEDED", "PERMISSION_DENIED"])
    : rand(["SUCCESS", "OK", "COMPLETED"]);
  const attemptCount = isErr ? randInt(2, 5) : 1;
  const traceId = randTraceId();
  const withTrace = Math.random() < 0.35;
  const trace = withTrace ? gcpTrace(project.id, traceId) : undefined;
  const spanId = randSpanId();
  const style = isErr
    ? rand(["status", "audit", "json"])
    : rand(["status", "status", "audit", "json", "plain"]);

  let message: string;
  let severity: string;
  let protoPayload: Record<string, unknown> | undefined;
  let jsonPayload: Record<string, unknown> | undefined;
  let textPayload: string | undefined;

  if (style === "audit") {
    protoPayload = {
      "@type": "type.googleapis.com/google.cloud.audit.AuditLog",
      authenticationInfo: { principalEmail: randServiceAccount(project) },
      methodName: "google.cloud.scheduler.v1.CloudScheduler.UpdateJob",
      resourceName: `projects/${project.id}/locations/${region}/jobs/${jobName}`,
      request: {
        job: { name: `projects/${project.id}/locations/${region}/jobs/${jobName}`, schedule },
      },
    };
    message = `Audit: updated Cloud Scheduler job ${jobName}`;
    severity = "NOTICE";
  } else if (style === "json") {
    jsonPayload = {
      jobName: `projects/${project.id}/locations/${region}/jobs/${jobName}`,
      schedule,
      targetType,
      status,
      attemptCount,
      debugInfo: isErr
        ? rand(["URL_UNREACHABLE", "OAUTH_TOKEN_EXPIRED", "PUBSUB_PERMISSION_DENIED"])
        : "NONE",
    };
    message = JSON.stringify(jsonPayload);
    severity = isErr ? "ERROR" : "INFO";
  } else if (style === "plain") {
    textPayload = `Cloud Scheduler: job=${jobName} fired; delivery=${status}; target=${targetType}`;
    message = textPayload;
    severity = "INFO";
  } else {
    message = isErr
      ? `Job ${jobName} execution failed after ${attemptCount} attempts: ${status} (${targetType})`
      : `Job ${jobName} completed successfully (${schedule}) → ${targetType}`;
    severity = isErr ? "ERROR" : "INFO";
    textPayload = message;
  }

  const labels: Record<string, string> = {
    job_id: jobName,
    location: region,
    target_type: targetType,
  };

  return {
    "@timestamp": ts,
    severity,
    ...(trace ? { trace, spanId } : {}),
    labels,
    ...(protoPayload != null ? { protoPayload } : {}),
    ...(jsonPayload != null ? { jsonPayload } : {}),
    ...(textPayload != null ? { textPayload } : {}),
    log: { level: severity.toLowerCase() },
    cloud: gcpCloud(region, project, "cloudscheduler.googleapis.com"),
    gcp: {
      cloud_scheduler: {
        job_name: jobName,
        schedule,
        target_type: targetType,
        status,
        attempt_count: attemptCount,
        log_style: style,
        ...(withTrace ? { trace: gcpTrace(project.id, traceId), span_id: spanId } : {}),
        metrics: {
          job_run_latency_ms: {
            avg: randInt(200, isErr ? 90_000 : 4000),
            max: randInt(500, 120_000),
          },
          delivery_errors: { sum: isErr ? attemptCount - 1 : 0 },
          scheduled_invocations: { sum: randInt(1, 48) },
        },
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
  const executionShort = randId(10).toLowerCase();
  const executionId = `projects/${project.id}/locations/${region}/workflows/${workflowName}/executions/${executionShort}`;
  const state = isErr
    ? rand(["FAILED", "CANCELLED", "TIMEOUT"])
    : rand(["ACTIVE", "SUCCEEDED", "COMPLETED"]);
  const stepName = rand([
    "validateInput",
    "callPaymentApi",
    "notifyUser",
    "transformPayload",
    "waitHuman",
  ]);
  const startTime = new Date(new Date(ts).getTime() - randInt(1000, 600_000)).toISOString();
  const durationMs = randLatencyMs(randInt(500, 8000), isErr);
  const traceId = randTraceId();
  const withTrace = Math.random() < 0.65;
  const trace = withTrace ? gcpTrace(project.id, traceId) : undefined;
  const spanId = randSpanId();
  const style = isErr
    ? rand(["step_error", "state", "platform"])
    : rand(["step_ok", "state", "state", "platform", "platform", "step_timing"]);

  let message: string;
  let severity: string;
  let jsonPayload: Record<string, unknown> | undefined;
  let textPayload: string | undefined;

  if (style === "platform") {
    message = isErr
      ? `Workflow execution ${executionShort}: state=${state}; step=${stepName}; error=${rand(["HTTP 502 from connector", "expression evaluation failed", "subworkflow timeout"])}`
      : `Workflow execution ${executionShort}: started at ${startTime}; current step=${stepName}`;
    severity = isErr ? "ERROR" : "INFO";
    textPayload = message;
  } else if (style === "state" || style === "step_ok" || style === "step_error") {
    jsonPayload = {
      workflow: workflowName,
      executionId,
      state,
      step: stepName,
      durationMs,
      attempt: randInt(1, isErr ? 4 : 1),
      ...(isErr && style === "step_error"
        ? {
            error: {
              code: rand([3, 5, 8, 10]),
              message: rand([
                "Step returned non-JSON body",
                "Variable undefined: $.order.id",
                "Exceeded max retries",
              ]),
              position: { line: randInt(1, 80), column: randInt(1, 40) },
            },
          }
        : {}),
    };
    message = JSON.stringify(jsonPayload);
    severity = isErr ? "ERROR" : "INFO";
  } else {
    message = `Step ${stepName} completed in ${durationMs}ms`;
    severity = "DEBUG";
    textPayload = message;
  }

  const labels: Record<string, string> = {
    workflow_id: workflowName,
    execution_id: executionShort,
    region,
  };

  return {
    "@timestamp": ts,
    severity,
    ...(trace ? { trace, spanId } : {}),
    labels,
    ...(jsonPayload != null ? { jsonPayload } : {}),
    ...(textPayload != null ? { textPayload } : {}),
    log: { level: severity.toLowerCase() },
    cloud: gcpCloud(region, project, "workflows.googleapis.com"),
    gcp: {
      workflows: {
        workflow_name: workflowName,
        execution_id: executionId,
        state,
        step_name: stepName,
        start_time: startTime,
        duration_ms: durationMs,
        log_style: style,
        ...(withTrace ? { trace: gcpTrace(project.id, traceId), span_id: spanId } : {}),
        metrics: {
          step_duration_ms: { avg: durationMs, max: Math.round(durationMs * 2.2) },
          state_transitions: { sum: randInt(3, 40) },
          external_calls: { sum: randInt(0, 25), errors: isErr ? randInt(1, 8) : 0 },
        },
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
  const deliveryStatus = isErr
    ? rand(["FAILED", "INVALID_PAYLOAD", "DESTINATION_UNAVAILABLE"])
    : rand(["DELIVERED", "ACKNOWLEDGED", "SUCCESS"]);
  const traceId = randTraceId();
  const withTrace = Math.random() < 0.5;
  const trace = withTrace ? gcpTrace(project.id, traceId) : undefined;
  const spanId = randSpanId();
  const style = isErr
    ? rand(["delivery", "cloud_event", "audit"])
    : rand(["delivery", "delivery", "cloud_event", "audit"]);

  let message: string;
  let severity: string;
  let jsonPayload: Record<string, unknown> | undefined;
  let protoPayload: Record<string, unknown> | undefined;
  let textPayload: string | undefined;

  if (style === "cloud_event") {
    jsonPayload = {
      specversion: "1.0",
      type: eventType,
      source: `//${rand(["storage.googleapis.com", "firestore.googleapis.com", "pubsub.googleapis.com"])}/projects/_/buckets/${randId(6).toLowerCase()}`,
      id: randUUID(),
      time: ts,
      deliveryAttempt: randInt(1, isErr ? 6 : 1),
      data: { bucket: `${project.id}-data`, name: `objects/${randId(8).toLowerCase()}.json` },
    };
    message = JSON.stringify(jsonPayload);
    severity = isErr ? "ERROR" : "INFO";
  } else if (style === "audit") {
    protoPayload = {
      "@type": "type.googleapis.com/google.cloud.audit.AuditLog",
      authenticationInfo: { principalEmail: randServiceAccount(project) },
      methodName: "google.cloud.eventarc.v1.Eventarc.CreateTrigger",
      resourceName: `projects/${project.id}/locations/${region}/triggers/${triggerName}`,
    };
    message = `Eventarc admin activity on trigger ${triggerName}`;
    severity = "NOTICE";
  } else {
    textPayload = `eventarc.googleapis.com/${destination}: type=${eventType} status=${deliveryStatus} channel=${channel}`;
    message = textPayload;
    severity = isErr ? "ERROR" : "INFO";
  }

  const labels: Record<string, string> = {
    trigger_name: triggerName,
    channel_id: channel.split("/").pop() ?? triggerName,
    destination,
  };

  return {
    "@timestamp": ts,
    severity,
    ...(trace ? { trace, spanId } : {}),
    labels,
    ...(protoPayload != null ? { protoPayload } : {}),
    ...(jsonPayload != null ? { jsonPayload } : {}),
    ...(textPayload != null ? { textPayload } : {}),
    log: { level: severity.toLowerCase() },
    cloud: gcpCloud(region, project, "eventarc.googleapis.com"),
    gcp: {
      eventarc: {
        trigger_name: triggerName,
        event_type: eventType,
        channel,
        destination,
        delivery_status: deliveryStatus,
        log_style: style,
        ...(withTrace ? { trace: gcpTrace(project.id, traceId), span_id: spanId } : {}),
        metrics: {
          delivery_latency_ms: { avg: randInt(25, isErr ? 8000 : 900), p99: randInt(200, 12_000) },
          events_delivered: { sum: isErr ? randInt(0, 5) : randInt(10, 5000) },
          dlq_redirects: { sum: isErr ? randInt(0, 3) : 0 },
        },
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
  const status = isErr
    ? rand(["FAILED", "RUNNING"] as const)
    : rand(["PENDING", "RUNNING", "SUCCEEDED", "FAILED"] as const);
  const timeoutSeconds = randInt(300, 86400);
  const parallelism = randInt(1, Math.min(10, taskCount));
  const containerImage = `${region}-docker.pkg.dev/${project.id}/jobs/${jobName}:${rand(["latest", `v${randInt(1, 3)}.${randInt(0, 9)}`])}`;
  const traceId = randTraceId();
  const withTrace = Math.random() < 0.4;
  const trace = withTrace ? gcpTrace(project.id, traceId) : undefined;
  const spanId = randSpanId();
  const style = isErr
    ? rand(["task_log", "controller", "pull"])
    : rand(["task_log", "task_log", "controller", "startup", "pull"]);

  let message: string;
  let severity: string;
  let jsonPayload: Record<string, unknown> | undefined;
  let textPayload: string | undefined;
  let protoPayload: Record<string, unknown> | undefined;

  if (style === "controller") {
    jsonPayload = {
      severity: isErr ? "ERROR" : "INFO",
      job: jobName,
      execution: executionId,
      taskIndex,
      taskCount,
      status,
      parallelism,
      containerImage,
    };
    message = JSON.stringify(jsonPayload);
    severity = isErr || status === "FAILED" ? "ERROR" : "INFO";
  } else if (style === "task_log") {
    textPayload = isErr
      ? `task ${taskIndex}: ${rand(["Container terminated on OOMKilled (137)", "non-zero exit: 1", "DeadlineExceeded: context deadline exceeded"])}`
      : `task ${taskIndex}/${taskCount}: processed batch ${randInt(1, 500)} rows in ${randLatencyMs(randInt(200, 8000), false)}ms`;
    message = textPayload;
    severity = isErr ? "ERROR" : "INFO";
  } else if (style === "startup") {
    textPayload = `Pulling image ${containerImage}: resolved digest sha256:${randId(64).toLowerCase()} in ${randInt(800, 6000)}ms`;
    message = textPayload;
    severity = "INFO";
  } else {
    protoPayload = {
      "@type": "type.googleapis.com/google.cloud.audit.AuditLog",
      methodName: "google.cloud.run.v2.Jobs.RunJob",
      resourceName: `projects/${project.id}/locations/${region}/jobs/${jobName}`,
      authenticationInfo: { principalEmail: randServiceAccount(project) },
    };
    message = `Cloud Run Jobs API: ${protoPayload.methodName}`;
    severity = "NOTICE";
  }

  const labels: Record<string, string> = {
    job_name: jobName,
    execution_name: executionId,
    region,
  };

  return {
    "@timestamp": ts,
    severity,
    ...(trace ? { trace, spanId } : {}),
    labels,
    ...(protoPayload != null ? { protoPayload } : {}),
    ...(jsonPayload != null ? { jsonPayload } : {}),
    ...(textPayload != null ? { textPayload } : {}),
    log: { level: severity.toLowerCase() },
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
        log_style: style,
        ...(withTrace ? { trace: gcpTrace(project.id, traceId), span_id: spanId } : {}),
        metrics: {
          task_cpu_seconds: { sum: randFloat(0.5, isErr ? 400 : 120), max: randFloat(10, 900) },
          task_retries: { sum: isErr ? randInt(1, 5) : 0 },
          image_pull_seconds: { avg: randFloat(0.2, 8), max: randFloat(5, 45) },
        },
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
  const status = isErr
    ? rand(["ERROR", "DEGRADED"] as const)
    : rand(["READY", "RUNNING", "UPDATING"] as const);
  const instancesActive = isErr ? randInt(0, 2) : randInt(2, 100);
  const packetsForwarded = isErr ? randInt(0, 5000) : randInt(10_000, 50_000_000);
  const traceId = randTraceId();
  const withTrace = Math.random() < 0.25;
  const trace = withTrace ? gcpTrace(project.id, traceId) : undefined;
  const spanId = randSpanId();
  const style = isErr
    ? rand(["health", "forwarding", "audit"])
    : rand(["health", "forwarding", "scaling", "audit"]);

  let message: string;
  let severity: string;
  let jsonPayload: Record<string, unknown> | undefined;
  let textPayload: string | undefined;
  let protoPayload: Record<string, unknown> | undefined;

  if (style === "audit") {
    protoPayload = {
      "@type": "type.googleapis.com/google.cloud.audit.AuditLog",
      methodName: "google.cloud.vpcaccess.v1.VpcAccessService.CreateConnector",
      resourceName: `projects/${project.id}/locations/${region}/connectors/${connectorName}`,
      authenticationInfo: { principalEmail: randPrincipal(project) },
    };
    message = `VPC Access connector admin: ${connectorName}`;
    severity = "NOTICE";
  } else if (style === "forwarding") {
    jsonPayload = {
      connector: connectorName,
      network,
      ipCidrRange: ipRange,
      throughput,
      packetsForwarded,
      droppedPackets: isErr ? randInt(10, 5000) : randInt(0, 20),
      natPortAllocationErrors: isErr ? randInt(1, 400) : 0,
    };
    message = JSON.stringify(jsonPayload);
    severity = isErr ? "ERROR" : "INFO";
  } else if (style === "scaling") {
    textPayload = `Scaling connector ${connectorName}: min_instances=${randInt(2, 8)} max_instances=${randInt(10, 300)} (region ${region})`;
    message = textPayload;
    severity = "INFO";
  } else {
    textPayload = isErr
      ? `Connector ${connectorName} health=${status}: packet forwarding stalled after ${randInt(200, 5000)}ms idle; forwarded=${packetsForwarded}`
      : `Connector ${connectorName} status=${status} active_instances=${instancesActive} forwarded_pkts=${packetsForwarded}`;
    message = textPayload;
    severity = isErr ? "ERROR" : "INFO";
  }

  const labels: Record<string, string> = {
    connector_name: connectorName,
    network,
    region,
  };

  return {
    "@timestamp": ts,
    severity,
    ...(trace ? { trace, spanId } : {}),
    labels,
    ...(protoPayload != null ? { protoPayload } : {}),
    ...(jsonPayload != null ? { jsonPayload } : {}),
    ...(textPayload != null ? { textPayload } : {}),
    log: { level: severity.toLowerCase() },
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
        log_style: style,
        ...(withTrace ? { trace: gcpTrace(project.id, traceId), span_id: spanId } : {}),
        metrics: {
          forwarded_packets_per_sec: {
            avg: randFloat(100, isErr ? 2000 : 120_000),
            max: randFloat(1000, 500_000),
          },
          connector_instance_count: { avg: instancesActive, max: instancesActive + randInt(0, 20) },
          egress_bytes: { sum: randInt(50_000, isErr ? 2_000_000 : 900_000_000) },
        },
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(500, isErr ? 60_000 : 8000),
    },
    message,
  };
}
