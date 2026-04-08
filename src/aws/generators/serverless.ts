/**
 * Serverless & core AWS log generators (Lambda, API Gateway, App Sync, App Runner, Fargate).
 * Each generator returns a single ECS-shaped document for the given timestamp and error rate.
 * @module aws/generators/serverless
 */

import {
  rand,
  randInt,
  randFloat,
  randId,
  randIp,
  randUUID,
  randAccount,
  REGIONS,
  ACCOUNTS,
  USER_AGENTS,
  HTTP_METHODS,
  HTTP_PATHS,
  PROTOCOLS,
} from "../../helpers";
import type { EcsDocument } from "./types.js";

/**
 * Generates a synthetic AWS Lambda log event (function invocation, metrics, optional trace ID).
 * @param ts - ISO timestamp for @timestamp.
 * @param er - Error rate in [0,1]; influences level and error count.
 * @returns ECS-style document with cloud, aws.lambda, log, message, event.
 */
export function generateLambdaLog(ts: string, er: number): EcsDocument {
  const fn = rand([
    "user-auth",
    "payment-processor",
    "image-resizer",
    "notification-sender",
    "data-pipeline",
    "api-handler",
  ]);
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const level = isErr
    ? "ERROR"
    : Math.random() < 0.15
      ? "WARN"
      : Math.random() < 0.1
        ? "DEBUG"
        : "INFO";
  const rid = randUUID();
  const dur = Number(randFloat(1, 3000));
  const billedDur = Math.ceil(dur / 100) * 100;
  const memSize = rand([128, 256, 512, 1024, 2048, 3008]);
  const memUsed = randInt(Math.floor(memSize * 0.2), memSize);
  const invocations = randInt(1, 500);
  const errors = isErr ? randInt(1, Math.max(1, Math.floor(invocations * er))) : 0;
  const throttles = Math.random() < 0.05 ? randInt(1, 10) : 0;
  const hasMapping = Math.random() > 0.5;
  const isColdStart = Math.random() < 0.05;
  const initDur = isColdStart ? Number(randFloat(50, 800)) : null;
  const MSGS: Record<string, string[]> = {
    INFO: ["Request received", "Processing complete", "Cache hit", "Event processed"],
    WARN: ["Retry attempt 1/3", "Memory usage at 80%", "Slow query detected"],
    ERROR: ["Unhandled exception", "DB connection refused", "Timeout after 30000ms"],
    DEBUG: ["Entering handler", "Parsed request body", "Exiting with status 200"],
  };
  const logGroup = `/aws/lambda/${fn}`;
  const logStream = `${new Date(ts).toISOString().slice(0, 10)}/[$LATEST]${randId(32).toLowerCase()}`;
  const traceId =
    Math.random() < 0.5 ? `1-${randId(8).toLowerCase()}-${randId(24).toLowerCase()}` : null;

  // Randomly emit one of: START, application log, END, or REPORT — matching real Lambda log patterns
  const logEventType = rand(["start", "app", "app", "app", "end", "report"]);
  const hasXray = logEventType === "report" && Math.random() < 0.2;
  let message: string;
  if (logEventType === "start") {
    message = `START RequestId: ${rid} Version: $LATEST`;
  } else if (logEventType === "end") {
    message = `END RequestId: ${rid}`;
  } else if (logEventType === "report") {
    message = `REPORT RequestId: ${rid}\tDuration: ${dur.toFixed(2)} ms\tBilled Duration: ${billedDur} ms\tMemory Size: ${memSize} MB\tMax Memory Used: ${memUsed} MB${isColdStart ? `\tInit Duration: ${initDur!.toFixed(2)} ms` : ""}${hasXray ? `\tXRay TraceId: 1-${randId(8).toLowerCase()}-${randId(24).toLowerCase()}\tSegmentId: ${randId(16).toLowerCase()}\tSampled: true` : ""}`;
  } else {
    const useStructuredLogging = Math.random() < 0.6;
    message = useStructuredLogging
      ? JSON.stringify({
          requestId: rid,
          level,
          message: rand(MSGS[level]),
          timestamp: new Date(ts).toISOString(),
          duration_ms: Math.round(dur),
          memory_used_mb: memUsed,
          ...(traceId ? { traceId } : {}),
        })
      : `[${level}]\t${rid}\t${rand(MSGS[level])}`;
  }

  const LAMBDA_ERROR_CODES = [
    "ResourceConflictException",
    "RequestTooLargeException",
    "ENILimitReachedException",
    "EFSIOException",
    "SubnetIPAddressLimitReachedException",
    "InvalidParameterValueException",
    "ServiceException",
    "TooManyRequestsException",
    "CodeStorageExceededException",
  ];
  void errors; // computed but intentionally unused in output (mirrors original)
  void ACCOUNTS;
  void PROTOCOLS;
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "lambda" },
    },
    ...(traceId ? { trace: { id: traceId } } : {}),
    aws: {
      dimensions: {
        FunctionName: fn,
        Resource: `${fn}:$LATEST`,
        ExecutedVersion: "$LATEST",
        ...(hasMapping ? { EventSourceMappingUUID: randUUID() } : {}),
      },
      cloudwatch: { log_group: logGroup, log_stream: logStream },
      lambda: {
        function: {
          name: fn,
          version: "$LATEST",
          arn: `arn:aws:lambda:${region}:${acct.id}:function:${fn}`,
        },
        request_id: rid,
        trace_id: traceId,
        event_type: logEventType,
        cold_start: logEventType === "report" ? isColdStart : null,
        ...(isErr
          ? {
              error: {
                message: rand([
                  "Unhandled exception",
                  "DB connection refused",
                  "Timeout after 30000ms",
                ]),
                stack_trace: `Error: Unhandled exception\n    at handler (index.js:${randInt(10, 200)}:${randInt(5, 30)})\n    at Runtime.handler`,
              },
            }
          : {}),
        metrics: {
          Invocations: { sum: 1, avg: 1 },
          Errors: { sum: isErr ? 1 : 0, avg: isErr ? 1 : 0 },
          Throttles: { sum: throttles, avg: throttles },
          Duration: { avg: dur, max: dur * 1.2 },
          ConcurrentExecutions: { avg: randInt(1, 500) },
          UnreservedConcurrentExecutions: { avg: randInt(1, 1000) },
          DeadLetterErrors: { sum: Math.random() < 0.02 ? randInt(1, 5) : 0, avg: 0 },
          IteratorAge: { avg: isErr ? randInt(10000, 3600000) : 0 },
          AsyncEventsReceived: { sum: randInt(0, 100) },
          AsyncEventAge: { avg: randInt(0, 5000) },
          duration_ms: logEventType === "report" ? dur : null,
          billed_duration_ms: logEventType === "report" ? billedDur : null,
          init_duration_ms: logEventType === "report" && isColdStart ? initDur : null,
          memory_size_mb: memSize,
          max_memory_used_mb: memUsed,
          instance_max_memory: memSize,
          ...(hasMapping
            ? {
                PolledEventCount: { sum: randInt(0, 1000) },
                InvokedEventCount: { sum: randInt(0, 1000) },
                FilteredOutEventCount: { sum: randInt(0, 50) },
                FailedInvokeEventCount: { sum: isErr ? randInt(1, 10) : 0 },
                DeletedEventCount: { sum: randInt(0, 10) },
                OnFailureDestinationDeliveredEventCount: { sum: isErr ? randInt(0, 5) : 0 },
              }
            : {}),
        },
      },
    },
    log: { level: level.toLowerCase() },
    message: message,
    event: {
      duration: dur * 1000000,
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      type: isErr ? ["error"] : ["info"],
      dataset: "aws.lambda",
      provider: "lambda.amazonaws.com",
    },
    service: { name: fn, type: "lambda" },
    ...(isErr
      ? {
          error: {
            code: rand(LAMBDA_ERROR_CODES),
            message: rand([
              "Unhandled exception",
              "DB connection refused",
              "Timeout after 30000ms",
            ]),
            type: "lambda",
          },
        }
      : {}),
  };
}

/**
 * Generates a synthetic API Gateway access log event (request/response, latency, optional trace ID).
 * @param ts - ISO timestamp for @timestamp.
 * @param er - Error rate in [0,1]; influences HTTP status and error block.
 * @returns ECS-style document with cloud, aws.apigateway, http, url, event.
 */
export function generateApiGatewayLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const method = rand(HTTP_METHODS);
  const path = rand(HTTP_PATHS);
  const isErr = Math.random() < er;
  const status = isErr
    ? rand([400, 401, 403, 404, 429, 500, 502, 503])
    : rand([200, 200, 201, 204]);
  const lat = randInt(5, isErr ? 5000 : 800);
  const integrationLat = Math.floor(lat * Number(randFloat(0.55, 0.9)));
  const apiId = randId(10).toLowerCase();
  const apiName = rand(["prod-api", "internal-api", "partner-api", "mobile-api"]);
  const stage = rand(["prod", "v1", "v2", "staging"]);
  const requestId = `${randId(8)}-${randId(4)}`.toLowerCase();
  const traceId =
    Math.random() < 0.5 ? `1-${randId(8).toLowerCase()}-${randId(24).toLowerCase()}` : null;
  const apiType = rand(["REST", "HTTP", "HTTP", "WEBSOCKET"]);
  const isWebSocket = apiType === "WEBSOCKET";
  const isRest = apiType === "REST";
  const wsRouteKey = isWebSocket
    ? rand(["$connect", "$disconnect", "$default", "message", "subscribe"])
    : null;
  const cacheEnabled = isRest && Math.random() < 0.4;
  const cacheHit = cacheEnabled && Math.random() < 0.7;
  const GEO_DATA = [
    {
      country_iso_code: "US",
      country_name: "United States",
      region_name: "Virginia",
      city_name: "Ashburn",
    },
    {
      country_iso_code: "GB",
      country_name: "United Kingdom",
      region_name: "London",
      city_name: "London",
    },
    {
      country_iso_code: "DE",
      country_name: "Germany",
      region_name: "Frankfurt",
      city_name: "Frankfurt",
    },
    { country_iso_code: "FR", country_name: "France", region_name: "Paris", city_name: "Paris" },
    { country_iso_code: "JP", country_name: "Japan", region_name: "Tokyo", city_name: "Tokyo" },
    {
      country_iso_code: "AU",
      country_name: "Australia",
      region_name: "Sydney",
      city_name: "Sydney",
    },
    {
      country_iso_code: "CA",
      country_name: "Canada",
      region_name: "Ontario",
      city_name: "Toronto",
    },
    { country_iso_code: "IN", country_name: "India", region_name: "Mumbai", city_name: "Mumbai" },
    {
      country_iso_code: "BR",
      country_name: "Brazil",
      region_name: "São Paulo",
      city_name: "São Paulo",
    },
    {
      country_iso_code: "SG",
      country_name: "Singapore",
      region_name: "Singapore",
      city_name: "Singapore",
    },
  ];
  const geo = rand(GEO_DATA);
  const APIGW_ERROR_CODES: Record<number, string> = {
    400: "BadRequestException",
    401: "UnauthorizedException",
    403: "AccessDeniedException",
    404: "NotFoundException",
    409: "ConflictException",
    429: "TooManyRequestsException",
    500: "ServiceUnavailableException",
    502: "ServiceUnavailableException",
    503: "ServiceUnavailableException",
    504: "LimitExceededException",
  };
  const plainMessage = `${method} ${path} ${status} ${lat}ms`;
  const useStructuredLogging = Math.random() < 0.55;
  const message = useStructuredLogging
    ? JSON.stringify({
        requestId,
        requestMethod: method,
        requestPath: path,
        status: status,
        responseLatency: lat,
        integrationLatency: integrationLat,
        timestamp: new Date(ts).toISOString(),
        ...(traceId ? { traceId } : {}),
      })
    : plainMessage;
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "apigateway" },
    },
    ...(traceId ? { trace: { id: traceId } } : {}),
    aws: {
      dimensions: { ApiName: apiName, Stage: stage, Method: method, Resource: path },
      apigateway: {
        request_id: requestId,
        api_id: apiId,
        domain_name: `${apiId}.execute-api.${rand(["us-east-1", "us-west-2", "eu-west-1"])}.amazonaws.com`,
        stage,
        http_method: method,
        resource_path: path,
        protocol: "HTTP/1.1",
        route_key: `${method} ${path}`,
        status,
        response_length: randInt(200, 10000),
        ip_address: randIp(),
        caller: rand([null, `arn:aws:iam::${acct.id}:user/api-user`]),
        user: rand([null, "api-user"]),
        connection_id: rand([null, randId(20)]),
        event_type: rand(["MESSAGE", "CONNECT", "DISCONNECT"]),
        request_time: ts,
        api_type: apiType,
        integration_latency: integrationLat,
        ...(isWebSocket ? { websocket_route_key: wsRouteKey, connection_id: randId(20) } : {}),
        ...(cacheEnabled ? { cache_hit: cacheHit, cache_miss: !cacheHit } : {}),
        metrics: {
          Count: { sum: 1 },
          Latency: { avg: lat, p99: lat * 3 },
          IntegrationLatency: { avg: integrationLat },
          "4XXError": { sum: status >= 400 && status < 500 ? 1 : 0 },
          "5XXError": { sum: status >= 500 ? 1 : 0 },
          ...(cacheEnabled
            ? {
                CacheHitCount: { sum: cacheHit ? 1 : 0 },
                CacheMissCount: { sum: !cacheHit ? 1 : 0 },
              }
            : {}),
        },
      },
    },
    http: {
      request: { method, id: requestId, bytes: randInt(100, 5000) },
      response: { status_code: status, bytes: randInt(200, 10000) },
    },
    url: { path, domain: `${apiId}.execute-api.${region}.amazonaws.com` },
    client: { ip: randIp(), geo },
    user_agent: { original: rand(USER_AGENTS) },
    event: {
      duration: lat * 1000000,
      outcome: status >= 400 ? "failure" : "success",
      category: ["web"],
      type: ["access"],
      dataset: "aws.apigateway_logs",
      provider: "apigateway.amazonaws.com",
    },
    message: message,
    log: { level: status >= 500 ? "error" : status >= 400 ? "warn" : "info" },
    ...(status >= 400
      ? {
          error: {
            code: APIGW_ERROR_CODES[status] || "BadRequestException",
            message: `HTTP ${status}`,
            type: "server",
          },
        }
      : {}),
  };
}

export function generateAppSyncLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const api = rand(["prod-graphql-api", "mobile-api", "partner-api"]);
  const op = rand(["query", "mutation", "subscription"]);
  const resolver = rand([
    "getUserById",
    "listOrders",
    "createProduct",
    "updateInventory",
    "searchItems",
  ]);
  const dur = Number(randFloat(1, isErr ? 5000 : 500));
  const status = isErr ? rand([400, 401, 403, 500]) : 200;
  const requestCount = randInt(1, 5000);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "appsync" },
    },
    aws: {
      appsync: {
        api_id: randId(26),
        api_name: api,
        operation_type: op,
        operation_name: resolver,
        data_source_type: rand(["AMAZON_DYNAMODB", "AWS_LAMBDA", "HTTP", "AMAZON_ELASTICSEARCH"]),
        duration_ms: Math.round(dur),
        status_code: status,
        error_type: isErr
          ? rand([
              "UnauthorizedException",
              "MappingTemplate",
              "ExecutionTimeout",
              "DatasourceError",
            ])
          : null,
        metrics: {
          RequestCount: { sum: requestCount },
          "4XXError": {
            sum: status >= 400 && status < 500 ? randInt(1, Math.floor(requestCount * 0.1)) : 0,
          },
          "5XXError": { sum: status >= 500 ? randInt(1, Math.floor(requestCount * 0.05)) : 0 },
          Latency: {
            avg: dur,
            p99: parseFloat((dur * Number(randFloat(1.5, 4.0))).toFixed(1)),
          },
        },
      },
    },
    http: { response: { status_code: status } },
    event: {
      duration: dur * 1e6,
      outcome: isErr ? "failure" : "success",
      category: "api",
      dataset: "aws.appsync",
      provider: "appsync.amazonaws.com",
    },
    message: isErr
      ? `AppSync ${op}.${resolver} FAILED [${status}]: ${rand(["Unauthorized", "MappingTemplate error", "DatasourceError"])}`
      : `AppSync ${op}.${resolver}: ${dur.toFixed(0)}ms [${api}]`,
    log: { level: isErr ? "error" : dur > 1000 ? "warn" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "UnauthorizedException",
              "MappingTemplate",
              "ExecutionTimeout",
              "DatasourceError",
            ]),
            message: "AppSync operation failed",
            type: "api",
          },
        }
      : {}),
  };
}

export function generateAppRunnerLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const svc = rand(["web-api", "frontend", "admin-portal", "webhook-handler"]);
  const svcId = randId(32).toLowerCase();
  const status = isErr ? rand([500, 502, 503, 504]) : rand([200, 200, 201, 204]);
  const latMs = randInt(5, isErr ? 8000 : 500);
  const APP_RUNNER_ERROR_CODES = [
    "InternalServerError",
    "BadGateway",
    "ServiceUnavailable",
    "GatewayTimeout",
  ];
  const plainMessage = `${rand(HTTP_METHODS)} ${rand(HTTP_PATHS)} ${status} ${latMs}ms`;
  const useStructuredLogging = Math.random() < 0.55;
  const message = useStructuredLogging
    ? JSON.stringify({
        service: svc,
        status,
        latency_ms: latMs,
        timestamp: new Date(ts).toISOString(),
      })
    : plainMessage;
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "apprunner" },
    },
    aws: {
      dimensions: { ServiceName: svc, ServiceId: svcId },
      apprunner: {
        service_name: svc,
        service_arn: `arn:aws:apprunner:${region}:${acct.id}:service/${svc}/${svcId}`,
        auto_scaling: {
          min_size: rand([1, 0, 0]),
          max_size: rand([10, 25, 50]),
          desired_count: randInt(1, 10),
          scale_from_zero: Math.random() < 0.1,
        },
        structured_logging: useStructuredLogging,
        metrics: {
          Requests: { sum: 1 },
          "2xxStatusResponses": { sum: status < 300 ? 1 : 0 },
          "4xxStatusResponses": { sum: status >= 400 && status < 500 ? 1 : 0 },
          "5xxStatusResponses": { sum: status >= 500 ? 1 : 0 },
          HttpStatusCode2XX: { sum: status < 300 ? 1 : 0 },
          RequestLatency: { avg: latMs, p99: latMs * 3 },
          ActiveInstances: { avg: randInt(1, 10) },
          ConcurrentRequests: { avg: randInt(1, 50) },
          CPUUtilization: { avg: Number(randFloat(5, isErr ? 95 : 60)) },
          MemoryUtilization: { avg: Number(randFloat(10, isErr ? 90 : 70)) },
        },
      },
    },
    http: {
      request: { method: rand(HTTP_METHODS), bytes: randInt(100, 5000) },
      response: { status_code: status, bytes: randInt(200, 8000) },
    },
    url: { path: rand(HTTP_PATHS) },
    client: { ip: randIp() },
    event: {
      duration: latMs * 1000000,
      outcome: status >= 400 ? "failure" : "success",
      category: ["web", "process"],
      dataset: "aws.apprunner",
      provider: "apprunner.amazonaws.com",
    },
    message: message,
    log: { level: status >= 500 ? "error" : status >= 400 ? "warn" : "info" },
    ...(status >= 500
      ? { error: { code: rand(APP_RUNNER_ERROR_CODES), message: `HTTP ${status}`, type: "server" } }
      : {}),
  };
}

export function generateFargateLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const level = Math.random() < er ? "error" : Math.random() < 0.12 ? "warn" : "info";
  const task = rand(["web-frontend", "api-backend", "worker", "data-processor", "scheduler"]);
  const cluster = rand(["prod", "staging", "batch-workers"]);
  const clusterName = `${cluster}-cluster`;
  const taskId = randId(32).toLowerCase();
  const taskDef = `${task}:${randInt(1, 50)}`;
  const MSGS: Record<string, string[]> = {
    error: [
      "Task stopped with exit code 1",
      "Container health check failed 3 times",
      "OOMKilled: resource limits exceeded",
      "Failed to pull image: rate limit exceeded",
      "Task failed to reach RUNNING state",
    ],
    warn: [
      "CPU utilization: 87%",
      "Memory utilization: 91%",
      "Task approaching resource limits",
      "Network throughput spike detected",
    ],
    info: [
      "Task started successfully",
      "Container is healthy",
      "Task registered with load balancer",
      "Scaling event: desired 3->5",
      "Task deregistered gracefully",
    ],
  };
  const FARGATE_ERROR_CODES = [
    "TaskStopped",
    "HealthCheckFailed",
    "OOMKilled",
    "ImagePullFailed",
    "TaskStartFailed",
  ];
  const durationSec = randInt(10, level === "error" ? 600 : 3600);
  const plainMessage = rand(MSGS[level]);
  const useStructuredLogging = Math.random() < 0.6;
  const message = useStructuredLogging
    ? JSON.stringify({
        cluster: clusterName,
        taskId,
        taskDefinition: taskDef,
        container: task,
        level,
        message: plainMessage,
        timestamp: new Date(ts).toISOString(),
      })
    : plainMessage;
  const cpuPct = level === "error" ? randInt(90, 100) : randInt(10, 80);
  const fargateMemReservation = Number(randFloat(20, 70));
  const memPct = randFloat(10, Math.min(fargateMemReservation, level === "error" ? 99 : 80));
  const svc = task;
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "fargate" },
    },
    aws: {
      dimensions: { ServiceName: svc, ClusterName: clusterName, TaskDefinitionFamily: task },
      ecs: {
        metrics: {
          CPUUtilization: { avg: cpuPct },
          CPUReservation: { avg: Number(randFloat(10, 80)) },
          MemoryUtilization: { avg: memPct },
          MemoryReservation: { avg: fargateMemReservation },
          GPUReservation: { avg: 0 },
        },
      },
    },
    container: {
      id: randId(12).toLowerCase(),
      name: task,
      image: { name: `myrepo/${task}:latest`, tag: "latest" },
      runtime: "docker",
    },
    process: { pid: randInt(1, 65535), name: task },
    log: { level },
    event: {
      outcome: level === "error" ? "failure" : "success",
      category: ["process", "container"],
      dataset: "aws.ecs_fargate",
      provider: "ecs.amazonaws.com",
      duration: durationSec * 1e9,
    },
    message: message,
    ...(level === "error"
      ? { error: { code: rand(FARGATE_ERROR_CODES), message: rand(MSGS.error), type: "container" } }
      : {}),
  };
}
