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
    "order-validator",
    "inventory-sync",
    "webhook-receiver",
    "report-generator",
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
  const runtime = rand([
    "nodejs20.x",
    "nodejs20.x",
    "python3.12",
    "python3.12",
    "java21",
    "dotnet8",
    "go1.x",
  ]);
  const isNode = runtime.startsWith("nodejs");
  const isPython = runtime.startsWith("python");
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
  const logGroup = `/aws/lambda/${fn}`;
  const logStream = `${new Date(ts).toISOString().slice(0, 10).replace(/-/g, "/")}[$LATEST]${randId(32).toLowerCase()}`;
  const xrayTraceId = `1-${Math.floor(new Date(ts).getTime() / 1000).toString(16)}-${randId(24).toLowerCase()}`;
  const traceId = Math.random() < 0.5 ? xrayTraceId : null;

  const logEventType = rand(["start", "app", "app", "app", "end", "report"]);
  const hasXray = logEventType === "report" && Math.random() < 0.3;
  let message: string;

  if (logEventType === "start") {
    message = `START RequestId: ${rid} Version: $LATEST`;
  } else if (logEventType === "end") {
    message = `END RequestId: ${rid}`;
  } else if (logEventType === "report") {
    message = `REPORT RequestId: ${rid}\tDuration: ${dur.toFixed(2)} ms\tBilled Duration: ${billedDur} ms\tMemory Size: ${memSize} MB\tMax Memory Used: ${memUsed} MB${isColdStart ? `\tInit Duration: ${initDur!.toFixed(2)} ms` : ""}${hasXray ? `\tXRay TraceId: ${xrayTraceId}\tSegmentId: ${randId(16).toLowerCase()}\tSampled: true` : ""}`;
  } else {
    const loggingStyle = Math.random();
    if (loggingStyle < 0.35) {
      // Lambda Powertools structured logging (most common in production)
      const powertoolsMsg = isErr
        ? rand([
            "Failed to process request",
            "DynamoDB conditional check failed",
            "Downstream service timeout",
            "Invalid payload schema",
          ])
        : rand([
            "Request processed successfully",
            "Item created in DynamoDB",
            "Cache hit for user session",
            "Event dispatched to SQS",
          ]);
      message = JSON.stringify({
        level: level,
        location: isPython
          ? `${rand(["handler", "process_event", "validate_input"])}:${randInt(15, 200)}`
          : `${rand(["handler.ts", "service.ts", "processor.ts"])}:${rand(["handler", "processEvent", "validateInput"])}`,
        message: powertoolsMsg,
        timestamp: new Date(ts).toISOString(),
        service: fn,
        cold_start: isColdStart,
        function_name: fn,
        function_memory_size: memSize,
        function_arn: `arn:aws:lambda:${region}:${acct.id}:function:${fn}`,
        function_request_id: rid,
        ...(traceId ? { xray_trace_id: traceId } : {}),
        ...(isErr
          ? {
              exception: isPython
                ? `Traceback (most recent call last):\n  File "/var/task/handler.py", line ${randInt(20, 150)}, in handler\n    result = process_event(event)\n  File "/var/task/handler.py", line ${randInt(50, 200)}, in process_event\n    raise ${rand(["ValueError", "KeyError", "ConnectionError", "TimeoutError"])}("${powertoolsMsg}")`
                : `${rand(["Error", "TypeError", "ReferenceError"])}: ${powertoolsMsg}\n    at handler (/var/task/index.js:${randInt(10, 200)}:${randInt(5, 30)})\n    at Runtime.exports.handler (/var/runtime/index.mjs:${randInt(1, 50)}:${randInt(5, 20)})`,
              exception_name: isPython
                ? rand(["ValueError", "KeyError", "ConnectionError", "TimeoutError"])
                : rand(["Error", "TypeError", "ReferenceError"]),
            }
          : {}),
        sampling_rate: 0,
      });
    } else if (loggingStyle < 0.55) {
      // Lambda native JSON structured logging (Lambda runtime 2023+ feature)
      const nativeMsg = isErr
        ? rand([
            "Task timed out after 30.00 seconds",
            "Runtime.UnhandledPromiseRejection",
            "module initialization error",
            "RequestId: " + rid + " Error: ENOMEM",
          ])
        : rand([
            "Processing batch of 25 records",
            "Successfully wrote to S3",
            "DynamoDB query returned 142 items",
            "SNS notification sent",
          ]);
      message = JSON.stringify({
        timestamp: new Date(ts).toISOString(),
        level: level,
        requestId: rid,
        message: nativeMsg,
      });
    } else if (loggingStyle < 0.75) {
      // Plain-text tab-delimited (classic Lambda console.log / print)
      const plainMsg = isErr
        ? rand([
            `${new Date(ts).toISOString()}\t${rid}\tERROR\tUnhandled exception in handler`,
            `${new Date(ts).toISOString()}\t${rid}\tERROR\tTask timed out after 30.00 seconds`,
            `[ERROR]\t${new Date(ts).toISOString()}\t${rid}\tRuntime.HandlerNotFound: ${fn}.handler is undefined or not exported`,
          ])
        : rand([
            `${new Date(ts).toISOString()}\t${rid}\tINFO\tProcessing event from ${rand(["API Gateway", "SQS", "SNS", "EventBridge", "S3"])}`,
            `${new Date(ts).toISOString()}\t${rid}\tINFO\tCompleted in ${Math.round(dur)}ms`,
            `[${level}]\t${new Date(ts).toISOString()}\t${rid}\t${rand(["Handler invoked", "Processing complete", "Event dispatched"])}`,
          ]);
      message = plainMsg;
    } else {
      // Runtime error output (unhandled exceptions from Lambda runtime)
      if (isErr) {
        message = isNode
          ? `${new Date(ts).toISOString()}\t${rid}\tERROR\tInvoke Error \t${JSON.stringify({
              errorType: rand([
                "Runtime.UnhandledPromiseRejection",
                "Runtime.UserCodeSyntaxError",
                "Error",
                "TypeError",
              ]),
              errorMessage: rand([
                "Cannot read properties of undefined (reading 'id')",
                "connect ECONNREFUSED 10.0.1.5:5432",
                "Unexpected token u in JSON at position 0",
                "ETIMEDOUT",
              ]),
              stack: [
                `Error: ${rand(["Connection refused", "Timeout", "Parse error"])}`,
                `    at handler (/var/task/index.js:${randInt(10, 200)}:${randInt(5, 30)})`,
                `    at Runtime.exports.handler (/var/runtime/index.mjs:${randInt(1, 50)}:${randInt(5, 20)})`,
              ],
            })}`
          : isPython
            ? `[ERROR] ${new Date(ts).toISOString()} ${rid} ${rand([
                `Traceback (most recent call last):\n  File "/var/task/handler.py", line ${randInt(20, 150)}, in handler\n    response = table.get_item(Key={'id': event['pathParameters']['id']})\n  File "/var/runtime/botocore/client.py", line ${randInt(200, 500)}, in _api_call\n    raise ClientError(parsed_response, operation_name)\nbotocore.exceptions.ClientError: An error occurred (ConditionalCheckFailedException)`,
                `Traceback (most recent call last):\n  File "/var/task/handler.py", line ${randInt(20, 150)}, in handler\n    result = json.loads(event['body'])\njson.decoder.JSONDecodeError: Expecting value: line 1 column 1 (char 0)`,
              ])}`
            : `[ERROR] ${new Date(ts).toISOString()} ${rid} Runtime error: ${rand(["OutOfMemoryError", "Connection timeout", "Serialization failed"])}`;
      } else {
        message = isNode
          ? `${new Date(ts).toISOString()}\t${rid}\tINFO\t${rand(["Request processed", "Batch complete", "Event forwarded to downstream"])}`
          : `[INFO]\t${new Date(ts).toISOString()}\t${rid}\t${rand(["Handler execution complete", "Records processed successfully", "Response sent"])}`;
      }
    }
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
    "Runtime.HandlerNotFound",
    "Runtime.ImportModuleError",
    "Runtime.UserCodeSyntaxError",
  ];
  void errors;
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
          runtime,
          handler: isNode
            ? "index.handler"
            : isPython
              ? "handler.handler"
              : "com.example.Handler::handleRequest",
        },
        request_id: rid,
        trace_id: traceId,
        event_type: logEventType,
        cold_start: logEventType === "report" ? isColdStart : null,
        ...(isErr
          ? {
              error: {
                message: isNode
                  ? rand([
                      "Cannot read properties of undefined",
                      "connect ECONNREFUSED",
                      "Task timed out after 30.00 seconds",
                      "ENOMEM: not enough memory",
                    ])
                  : isPython
                    ? rand([
                        "ClientError: ConditionalCheckFailedException",
                        "JSONDecodeError: Expecting value",
                        "ConnectionError: Max retries exceeded",
                        "TimeoutError: Task timed out",
                      ])
                    : rand([
                        "OutOfMemoryError",
                        "NullPointerException",
                        "ConnectionTimeoutException",
                      ]),
                type: isNode
                  ? rand(["Runtime.UnhandledPromiseRejection", "Error", "TypeError"])
                  : isPython
                    ? rand(["ClientError", "ValueError", "ConnectionError", "TimeoutError"])
                    : rand(["java.lang.OutOfMemoryError", "java.lang.NullPointerException"]),
                stack_trace: isNode
                  ? `Error: ${rand(["Connection refused", "Timeout", "Parse error"])}\n    at handler (/var/task/index.js:${randInt(10, 200)}:${randInt(5, 30)})\n    at Runtime.exports.handler (/var/runtime/index.mjs:${randInt(1, 50)}:${randInt(5, 20)})`
                  : isPython
                    ? `Traceback (most recent call last):\n  File "/var/task/handler.py", line ${randInt(20, 150)}, in handler\n    result = process_event(event)\n  File "/var/task/handler.py", line ${randInt(50, 200)}, in process_event\n    raise ValueError("${rand(["Invalid input", "Missing required field", "Schema validation failed"])}")`
                    : `java.lang.${rand(["OutOfMemoryError", "NullPointerException"])}\n\tat com.example.Handler.handleRequest(Handler.java:${randInt(10, 200)})`,
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
            message: isNode
              ? rand([
                  "Cannot read properties of undefined",
                  "connect ECONNREFUSED",
                  "Task timed out",
                  "ENOMEM",
                ])
              : isPython
                ? rand(["ClientError", "JSONDecodeError", "ConnectionError", "TimeoutError"])
                : rand(["OutOfMemoryError", "NullPointerException"]),
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
  const requestId = randUUID();
  const clientIp = randIp();
  const caller = rand([
    `-`,
    `arn:aws:iam::${acct.id}:user/api-user`,
    `AROAI${randId(20).toUpperCase()}:session`,
  ]);
  const user = caller === `-` ? `-` : rand([`api-user`, `cognito:username`, `authenticated`]);
  const dReq = new Date(ts);
  const mons = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ] as const;
  const requestTime = `${String(dReq.getUTCDate()).padStart(2, "0")}/${mons[dReq.getUTCMonth()]}/${dReq.getUTCFullYear()}:${String(dReq.getUTCHours()).padStart(2, "0")}:${String(dReq.getUTCMinutes()).padStart(2, "0")}:${String(dReq.getUTCSeconds()).padStart(2, "0")} +0000`;
  const protocol = rand(["HTTP/1.1", "HTTP/2"]);
  const responseLength = randInt(0, isErr ? 512 : 10000);
  const integrationStatus = isErr ? rand([502, 503, 504, 500]) : 200;
  const integrationError =
    isErr && Math.random() > 0.4
      ? rand([
          "Internal server error",
          "Execution failed due to configuration error",
          "Network error connecting to endpoint",
        ])
      : null;
  const authorizerSub = Math.random() > 0.35 ? `sub|${randUUID()}` : null;
  const errorMessage =
    isErr && status >= 500
      ? rand([
          "Internal server error",
          "Execution failed due to a deployment error",
          "Endpoint request timed out",
        ])
      : isErr
        ? rand(["Forbidden", "Unauthorized", "Not found", "Too many requests"])
        : null;
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
  const clfMessage = `${requestId} ${clientIp} ${caller} ${user} [${requestTime}] "${method} ${path} ${protocol}" ${status} ${responseLength} ${integrationLat}`;
  const jsonAccess: Record<string, unknown> = {
    requestId,
    ip: clientIp,
    caller,
    user,
    requestTime,
    httpMethod: method,
    resourcePath: path,
    status,
    protocol,
    responseLength,
    integrationLatency: integrationLat,
    integration: {
      status: integrationStatus,
      error: integrationError,
    },
  };
  if (authorizerSub) jsonAccess["authorizer.claims.sub"] = authorizerSub;
  if (errorMessage) jsonAccess["error.message"] = errorMessage;
  if (traceId) jsonAccess.traceId = traceId;
  const logFormat = rand(["json", "json", "json", "clf"]);
  const message = logFormat === "clf" ? clfMessage : JSON.stringify(jsonAccess);
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
        protocol,
        route_key: `${method} ${path}`,
        status,
        response_length: responseLength,
        ip_address: clientIp,
        caller: caller === `-` ? null : caller,
        user: user === `-` ? null : user,
        authorizer_claims_sub: authorizerSub,
        integration_status: integrationStatus,
        integration_error: integrationError,
        error_message: errorMessage,
        connection_id: rand([null, randId(20)]),
        event_type: rand(["MESSAGE", "CONNECT", "DISCONNECT"]),
        request_time: requestTime,
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
      response: { status_code: status, bytes: responseLength },
    },
    url: { path, domain: `${apiId}.execute-api.${region}.amazonaws.com` },
    client: { ip: clientIp, geo },
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
  const requestId = randUUID();
  const graphQLAPIId = randId(12) + randId(14);
  const parentType = rand(["Query", "Mutation", "Subscription"]);
  const returnType = rand(["AWSJSON", "User", "[Order]", "Boolean", "ID"]);
  const t0 = new Date(new Date(ts).getTime() - dur).toISOString();
  const t1 = new Date(ts).toISOString();
  const resolverArn = `arn:aws:appsync:${region}:${acct.id}:apis/${graphQLAPIId}/types/${parentType}/resolvers/${resolver}`;
  const logType = rand(["RequestMapping", "ResponseMapping"]);
  const errors =
    isErr && logType === "ResponseMapping"
      ? [
          {
            message: rand(["Unauthorized", "MappingTemplate error", "DatasourceError"]),
            errorType: "UnauthorizedException",
            path: [resolver],
            locations: [{ line: randInt(1, 40), column: randInt(1, 120), sourceName: null }],
          },
        ]
      : isErr && logType === "RequestMapping"
        ? [
            {
              message: "Template transformation yielded invalid input",
              errorType: "MappingTemplate",
              path: null,
            },
          ]
        : [];
  const resolverLogPayload = {
    requestId,
    graphQLAPIId,
    fieldName: resolver,
    parentType,
    returnType,
    startTime: t0,
    endTime: t1,
    duration: Math.round(dur),
    resolverArn,
    logType,
    errors,
  };
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
        request_id: requestId,
        graph_ql_api_id: graphQLAPIId,
        field_name: resolver,
        parent_type: parentType,
        return_type: returnType,
        start_time: t0,
        end_time: t1,
        log_type: logType,
        resolver_arn: resolverArn,
        resolver_errors: errors,
        api_id: graphQLAPIId,
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
    message: JSON.stringify(resolverLogPayload),
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
  const eventKind = rand([
    "application_http",
    "application_http",
    "deployment",
    "health_check",
    "autoscaling",
    "build",
  ]);
  const deploymentId = randId(12).toLowerCase();
  const operationId = randId(12).toLowerCase();
  const healthState = isErr ? "unhealthy" : rand(["healthy", "healthy", "unknown"]);
  const scaleAction = rand(["scale_out", "scale_in", "none"]);
  const buildPhase = rand(["DOWNLOAD_SOURCE", "BUILD", "DEPLOY", "COMPLETE"]);
  const buildProgress = randInt(0, 100);
  let plainMessage: string;
  let structuredPayload: Record<string, unknown>;
  if (eventKind === "deployment") {
    plainMessage = `[AppRunner] Deployment ${deploymentId} on service ${svc}: ${isErr ? "FAILED" : "SUCCEEDED"}`;
    structuredPayload = {
      eventType: "DeploymentStatusChange",
      serviceName: svc,
      serviceId: svcId,
      deploymentId,
      status: isErr ? "FAILED" : rand(["ROLLBACK_SUCCEEDED", "SUCCEEDED", "IN_PROGRESS"]),
      operationId,
      message: plainMessage,
      timestamp: new Date(ts).toISOString(),
    };
  } else if (eventKind === "health_check") {
    plainMessage = `[AppRunner] Health check ${healthState} for instance ${randId(8)} target port ${rand([8080, 3000, 443])}`;
    structuredPayload = {
      eventType: "HealthCheck",
      serviceName: svc,
      serviceId: svcId,
      healthStatus: healthState,
      httpStatusCode: isErr ? rand([503, 502]) : 200,
      latencyMs: latMs,
      path: rand(["/health", "/ready", "/"]),
      timestamp: new Date(ts).toISOString(),
    };
  } else if (eventKind === "autoscaling") {
    plainMessage = `[AppRunner] Auto scaling ${scaleAction}: desired ${randInt(1, 8)} min ${rand([0, 1])} max ${rand([5, 10, 25])}`;
    structuredPayload = {
      eventType: "AutoScalingConfigurationRevision",
      serviceName: svc,
      serviceId: svcId,
      action: scaleAction,
      desiredCount: randInt(1, 8),
      activeInstanceCount: randInt(1, 10),
      timestamp: new Date(ts).toISOString(),
    };
  } else if (eventKind === "build") {
    plainMessage = `[AppRunner] Build ${buildPhase} ${buildProgress}% for ${svc}`;
    structuredPayload = {
      eventType: "ServiceBuildProgress",
      serviceName: svc,
      serviceId: svcId,
      phase: buildPhase,
      percentComplete: buildProgress,
      logStream: `deployment/${operationId}/build/logs`,
      timestamp: new Date(ts).toISOString(),
    };
  } else {
    plainMessage = `${rand(HTTP_METHODS)} ${rand(HTTP_PATHS)} ${status} ${latMs}ms`;
    structuredPayload = {
      eventType: "Request",
      service: svc,
      status,
      latency_ms: latMs,
      timestamp: new Date(ts).toISOString(),
    };
  }
  const useStructuredLogging = Math.random() < 0.55;
  const message = useStructuredLogging ? JSON.stringify(structuredPayload) : plainMessage;
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
        event_kind: eventKind,
        deployment_id: eventKind === "deployment" ? deploymentId : null,
        health_status: eventKind === "health_check" ? healthState : null,
        autoscaling_action: eventKind === "autoscaling" ? scaleAction : null,
        build_phase: eventKind === "build" ? buildPhase : null,
        build_percent: eventKind === "build" ? buildProgress : null,
        auto_scaling: {
          min_size: rand([1, 0, 0]),
          max_size: rand([10, 25, 50]),
          desired_count: randInt(1, 10),
          scale_from_zero: Math.random() < 0.1,
        },
        structured_logging: useStructuredLogging,
        metrics: {
          Requests: { sum: eventKind === "application_http" ? 1 : 0 },
          "2xxStatusResponses": { sum: status < 300 && eventKind === "application_http" ? 1 : 0 },
          "4xxStatusResponses": {
            sum: status >= 400 && status < 500 && eventKind === "application_http" ? 1 : 0,
          },
          "5xxStatusResponses": { sum: status >= 500 && eventKind === "application_http" ? 1 : 0 },
          HttpStatusCode2XX: { sum: status < 300 && eventKind === "application_http" ? 1 : 0 },
          RequestLatency: { avg: latMs, p99: latMs * 3 },
          ActiveInstances: { avg: randInt(1, 10) },
          ConcurrentRequests: { avg: randInt(1, 50) },
          CPUUtilization: { avg: Number(randFloat(5, isErr ? 95 : 60)) },
          MemoryUtilization: { avg: Number(randFloat(10, isErr ? 90 : 70)) },
          HealthyHostCount: { avg: eventKind === "health_check" && !isErr ? randInt(1, 6) : 0 },
          UnHealthyHostCount: { avg: eventKind === "health_check" && isErr ? randInt(1, 3) : 0 },
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
      outcome: status >= 400 || (eventKind === "health_check" && isErr) ? "failure" : "success",
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
