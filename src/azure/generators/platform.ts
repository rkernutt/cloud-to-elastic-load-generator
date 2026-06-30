import {
  type EcsDocument,
  rand,
  randInt,
  randFloat,
  randId,
  HTTP_METHODS,
  HTTP_PATHS,
  USER_AGENTS,
  azureCloud,
  makeAzureSetup,
  randUUID,
  randIp,
  randPublicIp,
  randAzureOrgEmail,
  randAzureOnMicrosoftEmail,
  azureDiagnosticTime,
  azureLogEvent,
} from "./helpers.js";

function armSite(subId: string, rg: string, app: string): string {
  return `/subscriptions/${subId}/resourceGroups/${rg}/providers/Microsoft.Web/sites/${app}`;
}

function armServiceBusNs(subId: string, rg: string, ns: string): string {
  return `/subscriptions/${subId}/resourceGroups/${rg}/providers/Microsoft.ServiceBus/namespaces/${ns}`;
}

function armEventHubNs(subId: string, rg: string, ns: string, hub?: string): string {
  const base = `/subscriptions/${subId}/resourceGroups/${rg}/providers/Microsoft.EventHub/namespaces/${ns}`;
  return hub ? `${base}/eventhubs/${hub}` : base;
}

function armKeyVault(subId: string, rg: string, vault: string): string {
  return `/subscriptions/${subId}/resourceGroups/${rg}/providers/Microsoft.KeyVault/vaults/${vault}`;
}

export function generateAppServiceLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const app = `app-${rand(["api", "web", "admin"])}-${randId(4).toLowerCase()}`;
  const resourceId = armSite(subscription.id, resourceGroup, app);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["http", "app", "platform", "audit", "http"] as const);
  const armOp = rand([
    "Microsoft.Web/sites/write",
    "Microsoft.Web/sites/delete",
    "Microsoft.Web/sites/start/action",
    "Microsoft.Web/sites/stop/action",
  ] as const);

  if (variant === "http") {
    const method = rand(HTTP_METHODS);
    const path = rand(HTTP_PATHS);
    const sc = isErr ? rand([500, 502, 503, 504]) : 200;
    const timeTaken = randFloat(isErr ? 2.5 : 0.02, isErr ? 120.0 : 1.8);
    const sPort = rand([80, 443]);
    const csBytes = randInt(120, 48_000);
    const scBytes = isErr ? randInt(200, 900) : randInt(800, 2_400_000);
    const ua = rand(USER_AGENTS);
    const referer = isErr ? "-" : `https://${app}.azurewebsites.net/`;
    const props = {
      CsMethod: method,
      CsUriStem: path,
      ScStatus: sc,
      TimeTaken: Math.round(timeTaken * 1000) / 1000,
      CsHost: `${app}.azurewebsites.net`,
      SPort: sPort,
      CsBytes: csBytes,
      ScBytes: scBytes,
      UserAgent: ua,
      Referer: referer,
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Web/sites/log",
      category: "AppServiceHTTPLogs",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(sc),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Web/sites"),
      azure: {
        app_service: {
          app_name: app,
          resource_group: resourceGroup,
          host: `${app}.azurewebsites.net`,
          request_method: method,
          url_path: path,
          status_code: sc,
          latency_ms: Math.round(timeTaken * 1000),
          category: "AppServiceHTTPLogs",
          operation_name: "Microsoft.Web/sites/log",
          correlation_id: correlationId,
          caller_ip: callerIp,
          properties: props,
        },
      },
      event: azureLogEvent(
        isErr,
        randInt(1e6, 1e9),
        "Microsoft.Web/sites/log",
        ["process"],
        isErr ? ["error"] : ["start"]
      ),
      message: `${method} ${path} ${sc} ${(timeTaken * 1000) | 0}ms ${callerIp} ${ua}`,
    };
  }

  if (variant === "app") {
    const level = isErr
      ? rand(["Error", "Critical"] as const)
      : rand(["Information", "Warning"] as const);
    const exType = isErr
      ? rand([
          "System.TimeoutException",
          "Microsoft.Data.SqlClient.SqlException",
          "Newtonsoft.Json.JsonReaderException",
        ])
      : "";
    const msg = isErr
      ? rand([
          "Unhandled exception in middleware pipeline",
          "Database command exceeded command timeout",
          "Failed to deserialize configuration section",
        ])
      : rand([
          "Request pipeline completed",
          "Health check endpoint responded OK",
          "Background sync job finished",
        ]);
    const stack = isErr
      ? `   at Contoso.Api.Middleware.ExceptionFilter.OnException(ExceptionContext ctx) in /src/Api/Middleware/ExceptionFilter.cs:line 42\n   at Microsoft.AspNetCore.Mvc.Filters.ResourceInvoker.Next()\n   at Program.<>c__DisplayClass0_0.<<Main>$>b__0(HttpContext ctx) in /src/Program.cs:line 118`
      : "";
    const props = {
      Level: level,
      Message: msg,
      ExceptionDetails: isErr ? `${exType}: ${msg}` : "",
      StackTrace: stack,
      ProcessId: randInt(1200, 8900),
      ThreadId: randInt(1, 128),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Web/sites/log",
      category: "AppServiceAppLogs",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "500" : "0",
      callerIpAddress: callerIp,
      correlationId,
      level,
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Web/sites"),
      azure: {
        app_service: {
          app_name: app,
          resource_group: resourceGroup,
          host: `${app}.azurewebsites.net`,
          category: "AppServiceAppLogs",
          operation_name: "Microsoft.Web/sites/log",
          correlation_id: correlationId,
          caller_ip: callerIp,
          log_level: level,
          message: msg,
          properties: props,
        },
      },
      event: azureLogEvent(
        isErr,
        randInt(1e6, 1e9),
        "Microsoft.Web/sites/log",
        ["process"],
        isErr ? ["error"] : ["start"]
      ),
      message: `[${level}] ${msg}`,
    };
  }

  if (variant === "platform") {
    const evt = isErr
      ? rand(["SiteStopFailed", "ContainerStartTimeout", "DeploymentFailed"])
      : rand([
          "ContainerStarted",
          "SiteStarted",
          "InstanceReady",
          "DeploymentSuccessful",
          "AppUpdated",
        ]);
    const msg = isErr
      ? `Failed to start site container: exit code ${randInt(125, 137)}`
      : `Linux consumption container ${randId(8).toLowerCase()} listening on port ${rand([8080, 3000])}`;
    const props = {
      EventName: evt,
      Level: isErr ? "Error" : "Information",
      Message: msg,
      ContainerImage: `mcr.microsoft.com/appsvc/dotnetcore:${rand(["8.0", "7.0"])}`,
      InstanceId: randId(16).toLowerCase(),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Web/sites/log",
      category: "AppServicePlatformLogs",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "1" : "0",
      callerIpAddress: "127.0.0.1",
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Web/sites"),
      azure: {
        app_service: {
          app_name: app,
          resource_group: resourceGroup,
          host: `${app}.azurewebsites.net`,
          category: "AppServicePlatformLogs",
          operation_name: "Microsoft.Web/sites/log",
          correlation_id: correlationId,
          platform_event: evt,
          properties: props,
        },
      },
      event: azureLogEvent(
        isErr,
        randInt(1e6, 1e9),
        "Microsoft.Web/sites/log",
        ["process"],
        isErr ? ["error"] : ["start"]
      ),
      message: `${evt}: ${msg}`,
    };
  }

  const props = {
    statusCode: isErr ? "Conflict" : "OK",
    serviceRequestId: randUUID(),
    eventCategory: "Administrative",
    entity: `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Web/sites/${app}`,
    httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: armOp,
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? rand(["409", "403"]) : "200",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.Web/sites"),
    azure: {
      app_service: {
        app_name: app,
        resource_group: resourceGroup,
        host: `${app}.azurewebsites.net`,
        category: "Administrative",
        operation_name: armOp,
        correlation_id: correlationId,
        caller_ip: callerIp,
        properties: props,
      },
    },
    event: azureLogEvent(
      isErr,
      randInt(1e6, 1e9),
      String(armOp),
      ["process"],
      isErr ? ["error"] : ["start"]
    ),
    message: isErr
      ? `Activity failed: ${armOp} on ${app}`
      : `Activity succeeded: ${armOp} on ${app}`,
  };
}

export function generateFunctionsLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const fnApp = `func-${rand(["http", "timer", "queue"])}-${randId(4).toLowerCase()}`;
  const resourceId = armSite(subscription.id, resourceGroup, fnApp);
  const callerIp = randIp();
  const correlationId = randUUID();
  const invocationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["exec", "host", "error", "runtime", "trigger"] as const);
  const fnName = rand(["OrderProcessor", "TelemetryIngest", "NightlyReport", "WebhookHandler"]);
  const trigger = rand([
    "httpTrigger",
    "timerTrigger",
    "serviceBusTrigger",
    "blobTrigger",
    "eventHubTrigger",
    "queueTrigger",
  ] as const);
  const armOp = "Microsoft.Web/sites/functions/log/action";

  if (variant === "host") {
    const cold = !isErr && Math.random() > 0.65;
    const evt = isErr
      ? "FunctionExecutionFailed"
      : cold
        ? "FunctionExecutionStarted"
        : "FunctionExecutionCompleted";
    const props = {
      FunctionName: fnName,
      InvocationId: invocationId,
      HostInstanceId: randId(32).toLowerCase(),
      Level: isErr ? "Error" : "Information",
      Message: isErr
        ? `Executed 'Functions.${fnName}' (Failed, Id=${invocationId}, Duration=${randInt(200, 900)}ms)`
        : cold
          ? `Starting Host (cold), OperationId=${correlationId}`
          : `Executed 'Functions.${fnName}' (Succeeded, Id=${invocationId}, Duration=${randInt(12, 400)}ms)`,
      EventName: evt,
      IsColdStart: cold,
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Web/sites/functions/log/action",
      category: "FunctionAppLogs",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "500" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Web/sites"),
      azure: {
        functions: {
          function_name: fnName,
          function_app: fnApp,
          resource_group: resourceGroup,
          trigger,
          invocation_id: invocationId,
          memory_mb: rand([128, 256, 512, 1536]),
          duration_ms: randInt(5, isErr ? 10 * 60 * 1000 : 8000),
          category: "FunctionAppLogs",
          operation_name: "Microsoft.Web/sites/functions/log/action",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: azureLogEvent(
        isErr,
        randInt(1e6, 9e9),
        String(armOp),
        ["process"],
        isErr ? ["error"] : ["start"]
      ),
      message: String(props.Message),
    };
  }

  if (variant === "error") {
    const kind = rand(["binding", "timeout", "oom"] as const);
    const props =
      kind === "binding"
        ? {
            FunctionName: fnName,
            InvocationId: invocationId,
            Level: "Error",
            Message: `Error binding parameter '${rand(["order", "payload", "blob"])}' of type '${rand(["Order", "JObject", "Stream"])}'.`,
            ExceptionDetails: `Microsoft.Azure.WebJobs.Host.FunctionInvocationException: Exception while executing function: Functions.${fnName}`,
            StackTrace: `   at Microsoft.Azure.WebJobs.Script.Description.WorkerFunctionInvoker.InvokeCore(Object[] parameters)\n   at async Microsoft.Azure.WebJobs.Host.Executors.FunctionExecutor.InvokeWithTimeoutAsync(IFunctionInvoker invoker, CancellationToken token)`,
            TriggerType: trigger,
          }
        : kind === "timeout"
          ? {
              FunctionName: fnName,
              InvocationId: invocationId,
              Level: "Error",
              Message: `Timeout value of ${randInt(3, 9)} minutes was exceeded by function 'Functions.${fnName}'`,
              ExceptionDetails: "System.TimeoutException: The operation has timed out.",
              StackTrace: `   at System.Threading.CancellationToken.ThrowIfCancellationRequested()\n   at Microsoft.Azure.WebJobs.Host.Executors.FunctionExecutor.ExecuteWithWatchersAsync(...)`,
              TriggerType: trigger,
            }
          : {
              FunctionName: fnName,
              InvocationId: invocationId,
              Level: "Critical",
              Message: "Function was aborted (out of memory).",
              ExceptionDetails:
                "System.OutOfMemoryException: Exception of type 'System.OutOfMemoryException' was thrown.",
              StackTrace: `   at System.GC.AllocateNewArray(IntPtr typeHandle, Int32 length)\n   at Functions.${fnName}.Run(...)`,
              TriggerType: trigger,
            };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Web/sites/functions/log/action",
      category: "FunctionAppLogs",
      resultType: "Failure",
      resultSignature: kind === "timeout" ? "504" : "500",
      callerIpAddress: callerIp,
      correlationId,
      level: kind === "oom" ? "Critical" : "Error",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Web/sites"),
      azure: {
        functions: {
          function_name: fnName,
          function_app: fnApp,
          resource_group: resourceGroup,
          trigger,
          invocation_id: invocationId,
          memory_mb: 1536,
          duration_ms: randInt(60_000, 540_000),
          category: "FunctionAppLogs",
          correlation_id: correlationId,
          error_kind: kind,
          properties: props,
        },
      },
      event: azureLogEvent(true, randInt(1e6, 9e9), String(kind), ["process"], ["error"]),
      error: {
        code: kind === "timeout" ? "TimeoutException" : "OutOfMemoryException",
        message: String(props.Message),
        type: "azure",
      },
      message: String(props.Message),
    };
  }

  if (variant === "runtime") {
    const runtime = rand(["node", "python", "dotnet"] as const);
    const props =
      runtime === "node"
        ? {
            FunctionName: fnName,
            InvocationId: invocationId,
            Level: "Error",
            Message: isErr
              ? "UnhandledPromiseRejectionWarning: connect ECONNREFUSED 10.0.1.4:5432"
              : "DeprecationWarning: Buffer() is deprecated",
            ExceptionDetails: isErr
              ? "Error: connect ECONNREFUSED 10.0.1.4:5432\n    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1555:16)"
              : "(node:42) DeprecationWarning: Buffer() is deprecated due to security and usability issues.",
            StackTrace: isErr
              ? "    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1555:16)\n    at Object.handler (/home/site/wwwroot/dist/handler.js:88:19)"
              : "",
            WorkerRuntime: "node",
            NodeVersion: "20.11.1",
          }
        : runtime === "python"
          ? {
              FunctionName: fnName,
              InvocationId: invocationId,
              Level: isErr ? "Error" : "Warning",
              Message: isErr
                ? "azure.functions.exceptions.FunctionLoadError: cannot import name 'main' from 'function_app'"
                : "UserWarning: pandas deprecated option",
              ExceptionDetails: isErr
                ? "Traceback (most recent call last):\n  File \"/azure-functions-host/workers/python/3.11/.../worker.py\", line 412, in load_function\nImportError: cannot import name 'main'"
                : "",
              StackTrace: "",
              WorkerRuntime: "python",
              PythonVersion: "3.11.8",
            }
          : {
              FunctionName: fnName,
              InvocationId: invocationId,
              Level: isErr ? "Error" : "Information",
              Message: isErr
                ? "System.IO.IOException: The process cannot access the file 'D:\\local\\Temp\\cache.bin' because it is being used by another process."
                : "Microsoft.Azure.WebJobs.Hosting.OptionsLoggingService: Function timeout configuration: 00:10:00",
              ExceptionDetails: isErr
                ? "System.IO.IOException: The process cannot access the file..."
                : "",
              StackTrace: isErr
                ? "   at System.IO.FileStream.Init(String path, FileMode mode)\n   at Microsoft.Azure.WebJobs.Script.FileHelpers.ReadAllBytes(String path)"
                : "",
              WorkerRuntime: "dotnet-isolated",
              DotNetVersion: "8.0.2",
            };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Web/sites/functions/log/action",
      category: "FunctionAppLogs",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "500" : "0",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : runtime === "python" ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Web/sites"),
      azure: {
        functions: {
          function_name: fnName,
          function_app: fnApp,
          resource_group: resourceGroup,
          trigger,
          invocation_id: invocationId,
          memory_mb: rand([256, 512]),
          duration_ms: randInt(5, 2000),
          category: "FunctionAppLogs",
          correlation_id: correlationId,
          worker_runtime: runtime,
          properties: props,
        },
      },
      event: azureLogEvent(
        isErr,
        randInt(1e6, 9e9),
        String(armOp),
        ["process"],
        isErr ? ["error"] : ["start"]
      ),
      message: String(props.Message),
    };
  }

  if (variant === "trigger") {
    const detail =
      trigger === "httpTrigger"
        ? {
            Method: rand(HTTP_METHODS),
            Uri: rand(HTTP_PATHS),
            UserAgent: rand(USER_AGENTS),
            ClientIp: callerIp,
          }
        : trigger === "timerTrigger"
          ? {
              Schedule: "0 */5 * * * *",
              Next: azureDiagnosticTime(ts),
              Last: azureDiagnosticTime(ts),
            }
          : trigger === "queueTrigger"
            ? {
                QueueName: rand(["orders", "jobs", "ingest"]),
                MessageId: randUUID(),
                DequeueCount: randInt(1, 6),
              }
            : trigger === "blobTrigger"
              ? {
                  Container: rand(["raw", "landing", "exports"]),
                  BlobPath: `${rand(["2024", "2025"])}/${randId(6)}.json`,
                  ETag: `"${randId(16)}"`,
                }
              : trigger === "eventHubTrigger"
                ? {
                    EventHub: rand(["telemetry", "clicks"]),
                    ConsumerGroup: "$Default",
                    PartitionId: String(randInt(0, 31)),
                    SequenceNumber: randInt(1000, 9_000_000),
                  }
                : {
                    Topic: rand(["orders", "events"]),
                    Subscription: "processing",
                    SessionId: randId(8),
                  };
    const props = {
      FunctionName: fnName,
      InvocationId: invocationId,
      Level: "Information",
      Message: `Trigger fired for Functions.${fnName}`,
      TriggerType: trigger,
      TriggerDetail: detail,
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Web/sites/functions/log/action",
      category: "FunctionAppLogs",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: "200",
      callerIpAddress: callerIp,
      correlationId,
      level: "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Web/sites"),
      azure: {
        functions: {
          function_name: fnName,
          function_app: fnApp,
          resource_group: resourceGroup,
          trigger,
          invocation_id: invocationId,
          memory_mb: rand([128, 256, 512]),
          duration_ms: randInt(20, 4000),
          category: "FunctionAppLogs",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: azureLogEvent(
        isErr,
        randInt(1e6, 9e9),
        String(armOp),
        ["process"],
        isErr ? ["error"] : ["start"]
      ),
      message: `Trigger ${trigger} for ${fnName}`,
    };
  }

  const props = {
    FunctionName: fnName,
    InvocationId: invocationId,
    Level: isErr ? "Error" : "Information",
    Message: isErr
      ? `Exception while executing function: Functions.${fnName}`
      : `Executed 'Functions.${fnName}' (Succeeded, Id=${invocationId}, Duration=${randInt(5, 800)}ms)`,
    TriggerType: trigger,
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.Web/sites/functions/log/action",
    category: "FunctionAppLogs",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "500" : "200",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.Web/sites"),
    azure: {
      functions: {
        function_name: fnName,
        function_app: fnApp,
        resource_group: resourceGroup,
        trigger,
        invocation_id: invocationId,
        memory_mb: rand([128, 256, 512, 1536]),
        duration_ms: randInt(5, isErr ? 10 * 60 * 1000 : 8000),
        category: "FunctionAppLogs",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: azureLogEvent(
      isErr,
      randInt(1e6, 9e9),
      String(armOp),
      ["process"],
      isErr ? ["error"] : ["start"]
    ),
    message: String(props.Message),
  };
}

export function generateServiceBusLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const nsShort = `sb-${randId(6).toLowerCase()}`;
  const nsFqdn = `${nsShort}.servicebus.windows.net`;
  const resourceId = armServiceBusNs(subscription.id, resourceGroup, nsShort);
  const ent = rand(["orders", "events", "audit"]);
  const op = rand(["Send", "Receive", "Complete", "Abandon"]);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const props = {
    ActivityId: randUUID(),
    EventSubscriptionName: "RootManageSharedAccessKey",
    "Entity Name": ent,
    MessagingOperation: op,
    SequenceNumber: randInt(1, 9_000_000_000),
    DeliveryCount: isErr ? randInt(5, 50) : randInt(0, 3),
    DeadLetterReason: isErr && Math.random() > 0.4 ? "MaxDeliveryCountExceeded" : "",
    MessageId: randUUID(),
    PartitionId: randInt(0, 3),
    ServerBusy: isErr && Math.random() > 0.5,
  };
  const operationName = `Microsoft.ServiceBus/namespaces/messages/${op.toLowerCase()}/action`;
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName,
    category: "OperationalLogs",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "500" : "200",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.ServiceBus/namespaces"),
    azure: {
      service_bus: {
        namespace: nsFqdn,
        resource_group: resourceGroup,
        entity: ent,
        operation: op,
        delivery_count: props.DeliveryCount,
        dead_letter: Boolean(props.DeadLetterReason),
        category: "OperationalLogs",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: azureLogEvent(
      isErr,
      randInt(1e6, 5e8),
      operationName,
      ["process"],
      isErr ? ["error"] : ["start"]
    ),
    message: isErr
      ? `Service Bus namespace ${nsFqdn}: ${op} failed on entity '${ent}' (deliveryCount=${props.DeliveryCount})`
      : `Service Bus namespace ${nsFqdn}: ${op} succeeded for '${ent}'`,
  };
}

export function generateEventHubsLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const ns = `evhns-${randId(5).toLowerCase()}`;
  const hub = rand(["telemetry", "clicks", "logs"]);
  const partition = `partition-${randInt(0, 31)}`;
  const resourceId = armEventHubNs(subscription.id, resourceGroup, ns, hub);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const incoming = isErr ? randInt(0, 1000) : randInt(50_000, 80_000_000);
  const props = {
    EventHubName: hub,
    PartitionId: partition.replace("partition-", ""),
    IncomingBytes: incoming,
    OutgoingMessages: isErr ? randInt(0, 50) : randInt(200, 500_000),
    ServerBusy: isErr,
    ConsumerGroup: rand(["$Default", "analytics", "stream"]),
    OperationResult: isErr ? "ThrottlingError" : "Success",
    ThroughputUnits: randInt(1, 20),
  };
  const operationName = isErr
    ? "Microsoft.EventHub/namespaces/throttling"
    : "Microsoft.EventHub/namespaces/ingress";
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName,
    category: "OperationalLogs",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "503" : "200",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.EventHub/namespaces"),
    azure: {
      event_hubs: {
        namespace: `${ns}.servicebus.windows.net`,
        resource_group: resourceGroup,
        eventhub: hub,
        partition,
        incoming_bytes: incoming,
        server_busy: isErr,
        category: "OperationalLogs",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: azureLogEvent(
      isErr,
      randInt(5e5, 4e8),
      operationName,
      ["process"],
      isErr ? ["error"] : ["start"]
    ),
    message: isErr
      ? `Event Hubs '${hub}' throttling detected on ${partition}`
      : `Event Hubs '${hub}' ingress healthy (${incoming} bytes)`,
  };
}

export function generateKeyVaultLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const vault = `kv-${randId(8).toLowerCase()}`;
  const resourceId = armKeyVault(subscription.id, resourceGroup, vault);
  const callerIp = randPublicIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const op = rand([
    "SecretGet",
    "SecretSet",
    "KeySign",
    "KeyDecrypt",
    "CertificateCreate",
  ] as const);
  const useSp = Math.random() > 0.45;
  let identity:
    | { claim: { appid: string; oid: string; tid: string } }
    | { claim: { upn: string; oid: string; tid: string } };
  let callerLabel: string;
  if (useSp) {
    const appid = randUUID();
    identity = { claim: { appid, oid: randUUID(), tid: subscription.id } };
    callerLabel = appid;
  } else {
    const upn = `svc-${randId(4)}@${rand(["meridiantech", "cascadeops"])}.com`;
    identity = { claim: { upn, oid: randUUID(), tid: subscription.id } };
    callerLabel = upn;
  }
  const httpStatus = isErr ? rand([401, 403]) : 200;
  const resultDesc = isErr ? rand(["Forbidden", "Unauthorized", "Caller is not authorized"]) : "OK";
  const resourceKind = op.startsWith("Secret")
    ? "secrets"
    : op.startsWith("Key")
      ? "keys"
      : "certificates";
  const secretName = `prod-${randId(4)}`;
  const requestUri =
    op === "SecretGet" || op === "KeySign" || op === "KeyDecrypt"
      ? `https://${vault}.vault.azure.net/${resourceKind}/${secretName}?api-version=7.4`
      : `https://${vault}.vault.azure.net/${resourceKind}/${secretName}/versions/${randUUID()}?api-version=7.4`;
  const props = {
    id: randUUID(),
    httpStatusCode: httpStatus,
    resultType: isErr ? "Failure" : "Success",
    resultSignature: String(httpStatus),
    resultDescription: resultDesc,
    durationMs: randFloat(2, isErr ? 180 : 45),
    callerIpAddress: callerIp,
    identity,
    requestUri,
    clientInfo: `Azure-SDK-For-${rand(["NET", "Python", "Java"])}`,
  };
  const operationName = `Microsoft.KeyVault/vaults/${op.toLowerCase()}/action`;
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName,
    category: "AuditEvent",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: String(httpStatus),
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.KeyVault/vaults"),
    azure: {
      key_vault: {
        vault_name: vault,
        resource_group: resourceGroup,
        operation: op,
        result: isErr ? "Forbidden" : "Success",
        caller_ip: callerIp,
        http_status_code: httpStatus,
        result_description: resultDesc,
        identity,
        category: "AuditEvent",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: azureLogEvent(
      isErr,
      randInt(5e5, 4e7),
      operationName,
      ["process"],
      isErr ? ["error"] : ["start"]
    ),
    message: isErr
      ? `KeyVault audit: ${op} denied (${httpStatus}) caller=${callerLabel}`
      : `KeyVault audit: ${op} succeeded vault=${vault}`,
  };
}

const ENTRA_WELL_KNOWN_APPS = [
  { id: "00000003-0000-0ff1-ce00-000000000000", name: "Office 365 Exchange Online" },
  { id: "00000006-0000-0ff1-ce00-000000000000", name: "Microsoft Office 365 Portal" },
  { id: "c44b4083-3bb0-49c1-b47d-974e53cbdf3c", name: "Azure Portal" },
  { id: "1fec8e78-bce4-4aaf-ab1b-5451cc387264", name: "Microsoft Teams" },
  { id: "00000003-0000-0000-c000-000000000000", name: "Microsoft Graph" },
  { id: "de8bc8b5-d9f9-48b1-a8ad-b748da725064", name: "Microsoft 365 Compliance Center" },
  { id: "89bee1f7-5e6e-4d8a-9f3d-ecd601259da7", name: "Office365 Shell WCSS-Client" },
  { id: "4765445b-32c6-49b0-83e6-1d93765276ca", name: "Microsoft 365 Defender Portal" },
] as const;

const ENTRA_SIGN_IN_ERROR_MAP: Record<number, string> = {
  50055: "The password has expired.",
  50126: "Error validating credentials due to invalid username or password.",
  50053:
    "Account is locked because the user tried to sign in too many times with an incorrect user ID or password.",
  50057: "The user account is disabled.",
  700016: "Application with identifier was not found in the directory.",
  530032: "User blocked due to risk on home tenant.",
  50074: "Strong authentication (MFA) is required.",
};
const ENTRA_SIGN_IN_ERROR_CODES = Object.keys(ENTRA_SIGN_IN_ERROR_MAP).map(Number);

const ENTRA_LOCATIONS = [
  {
    city: "Seattle",
    state: "Washington",
    countryOrRegion: "US",
    geoCoordinates: { latitude: 47.6062, longitude: -122.3321 },
  },
  {
    city: "London",
    state: "England",
    countryOrRegion: "GB",
    geoCoordinates: { latitude: 51.5074, longitude: -0.1278 },
  },
  {
    city: "Singapore",
    state: "Singapore",
    countryOrRegion: "SG",
    geoCoordinates: { latitude: 1.3521, longitude: 103.8198 },
  },
  {
    city: "New York",
    state: "New York",
    countryOrRegion: "US",
    geoCoordinates: { latitude: 40.7128, longitude: -74.006 },
  },
  {
    city: "Frankfurt",
    state: "Hessen",
    countryOrRegion: "DE",
    geoCoordinates: { latitude: 50.1109, longitude: 8.6821 },
  },
  {
    city: "Sydney",
    state: "New South Wales",
    countryOrRegion: "AU",
    geoCoordinates: { latitude: -33.8688, longitude: 151.2093 },
  },
  {
    city: "Toronto",
    state: "Ontario",
    countryOrRegion: "CA",
    geoCoordinates: { latitude: 43.6532, longitude: -79.3832 },
  },
  {
    city: "Tokyo",
    state: "Tokyo",
    countryOrRegion: "JP",
    geoCoordinates: { latitude: 35.6762, longitude: 139.6503 },
  },
  {
    city: "Mumbai",
    state: "Maharashtra",
    countryOrRegion: "IN",
    geoCoordinates: { latitude: 19.076, longitude: 72.8777 },
  },
  {
    city: "São Paulo",
    state: "São Paulo",
    countryOrRegion: "BR",
    geoCoordinates: { latitude: -23.5505, longitude: -46.6333 },
  },
] as const;

const ENTRA_DEVICE_OS = ["Windows 10", "Windows 11", "MacOS", "iOS 17.5", "Android 14"] as const;
const ENTRA_BROWSERS = [
  "Chrome 125.0.0",
  "Edge 125.0.2535",
  "Safari 17.5",
  "Firefox 126.0",
  "Mobile Safari 17.5",
] as const;

const ENTRA_AUDIT_ACTIVITIES: {
  name: string;
  category: string;
  loggedByService: string;
  operationType: string;
  targetType: string;
}[] = [
  {
    name: "Add member to group",
    category: "GroupManagement",
    loggedByService: "Core Directory",
    operationType: "Add",
    targetType: "Group",
  },
  {
    name: "Update user",
    category: "UserManagement",
    loggedByService: "Core Directory",
    operationType: "Update",
    targetType: "User",
  },
  {
    name: "Add app role assignment grant to user",
    category: "ApplicationManagement",
    loggedByService: "Core Directory",
    operationType: "Add",
    targetType: "ServicePrincipal",
  },
  {
    name: "Add owner to application",
    category: "ApplicationManagement",
    loggedByService: "Core Directory",
    operationType: "Add",
    targetType: "Application",
  },
  {
    name: "Delete user",
    category: "UserManagement",
    loggedByService: "Core Directory",
    operationType: "Delete",
    targetType: "User",
  },
  {
    name: "Reset user password",
    category: "UserManagement",
    loggedByService: "Self-service Password Management",
    operationType: "Update",
    targetType: "User",
  },
  {
    name: "Add member to role",
    category: "RoleManagement",
    loggedByService: "PIM",
    operationType: "Add",
    targetType: "Role",
  },
  {
    name: "Remove member from group",
    category: "GroupManagement",
    loggedByService: "Core Directory",
    operationType: "Delete",
    targetType: "Group",
  },
  {
    name: "Add service principal",
    category: "ApplicationManagement",
    loggedByService: "Core Directory",
    operationType: "Add",
    targetType: "ServicePrincipal",
  },
  {
    name: "Consent to application",
    category: "ApplicationManagement",
    loggedByService: "Core Directory",
    operationType: "Add",
    targetType: "ServicePrincipal",
  },
];

const ENTRA_RISK_TYPES = [
  "unfamiliarFeatures",
  "anonymizedIPAddress",
  "maliciousIPAddress",
  "impossibleTravel",
  "leakedCredentials",
  "suspiciousIPAddress",
  "investigationsThreatIntelligence",
] as const;

export function generateEntraIdLog(ts: string, er: number): EcsDocument {
  const { region, subscription, isErr } = makeAzureSetup(er);
  const user = randAzureOrgEmail();
  const firstName = user.split(".")[0] ?? "User";
  const lastName = (user.split(".")[1] ?? "Unknown").split("@")[0] ?? "Unknown";
  const userDisplayName = `${firstName.charAt(0).toUpperCase()}${firstName.slice(1)} ${lastName.charAt(0).toUpperCase()}${lastName.slice(1)}`;
  const userId = randUUID();
  const tenantId = randUUID();
  const callerIp = randPublicIp();
  const correlationId = randUUID();
  const originalRequestId = randUUID();
  const time = azureDiagnosticTime(ts);
  const cat = rand(["SignInLogs", "AuditLogs", "RiskDetection"] as const);
  const resourceId = `/tenants/${tenantId}/providers/microsoft.aadiam`;

  let props: Record<string, unknown>;
  let operationName: string;
  let eventCategory: string[];
  let eventType: string[];
  let conditionalAccess: string;
  let appId: string | undefined = undefined;
  let appDisplayName: string | undefined = undefined;

  if (cat === "SignInLogs") {
    const app = rand(ENTRA_WELL_KNOWN_APPS);
    const loc = rand(ENTRA_LOCATIONS);
    const errCode = isErr ? rand(ENTRA_SIGN_IN_ERROR_CODES) : 0;
    const failureReason = isErr ? (ENTRA_SIGN_IN_ERROR_MAP[errCode] ?? "") : "";
    const caStatus = isErr ? rand(["failure", "notApplied"]) : rand(["success", "notApplied"]);
    const isInteractive = Math.random() > 0.2;
    const clientApp = rand(["Browser", "Mobile Apps and Desktop clients", "Exchange ActiveSync"]);
    const authReq =
      Math.random() > 0.6 ? "multiFactorAuthentication" : "singleFactorAuthentication";
    const deviceOs = rand(ENTRA_DEVICE_OS);
    const browser = rand(ENTRA_BROWSERS);

    props = {
      id: randUUID(),
      createdDateTime: time,
      userPrincipalName: user,
      userDisplayName,
      userId,
      appId: app.id,
      appDisplayName: app.name,
      ipAddress: callerIp,
      isInteractive,
      clientAppUsed: clientApp,
      userAgent: rand(USER_AGENTS),
      resourceDisplayName: rand([
        "Microsoft Graph",
        "Windows Azure Active Directory",
        "Office 365 Exchange Online",
      ]),
      resourceId: randUUID(),
      authenticationRequirement: authReq,
      tokenIssuerType: "AzureAD",
      tokenIssuerName: "",
      location: {
        city: loc.city,
        state: loc.state,
        countryOrRegion: loc.countryOrRegion,
        geoCoordinates: loc.geoCoordinates,
      },
      status: { errorCode: errCode, failureReason },
      deviceDetail: {
        deviceId: "",
        displayName: "",
        operatingSystem: deviceOs,
        browser,
        isCompliant: false,
        isManaged: false,
      },
      conditionalAccessStatus: caStatus,
      originalRequestId,
      correlationId,
      riskDetail: isErr ? "none" : "none",
      riskLevelAggregated: "none",
      riskLevelDuringSignIn: "none",
      riskState: "none",
      riskEventTypes_v2: [],
      authenticationDetails: [
        {
          authenticationStepDateTime: time,
          authenticationMethod:
            authReq === "multiFactorAuthentication" ? "Microsoft Authenticator App" : "Password",
          authenticationMethodDetail:
            authReq === "multiFactorAuthentication" ? "Notification" : "Password in the cloud",
          succeeded: !isErr,
          authenticationStepResultDetail: isErr ? failureReason : "MFA completed in Azure AD",
          authenticationStepRequirement:
            authReq === "multiFactorAuthentication"
              ? "Primary and secondary authentication"
              : "Primary authentication",
        },
      ],
      homeTenantId: tenantId,
    };
    operationName = "Sign-in activity";
    eventCategory = ["authentication"];
    eventType = ["info"];
    conditionalAccess = caStatus;
    appId = app.id;
    appDisplayName = app.name;
  } else if (cat === "AuditLogs") {
    const act = rand(ENTRA_AUDIT_ACTIVITIES);
    const targetName =
      act.targetType === "Group"
        ? `grp-${randId(4)}`
        : act.targetType === "User"
          ? user
          : `app-${randId(6)}`;

    props = {
      id: `Directory_${randId(12)}`,
      activityDateTime: time,
      activityDisplayName: act.name,
      category: act.category,
      loggedByService: act.loggedByService,
      operationType: act.operationType,
      correlationId,
      initiatedBy: {
        user: {
          id: userId,
          displayName: userDisplayName,
          userPrincipalName: user,
          ipAddress: callerIp,
        },
      },
      targetResources: [
        {
          id: randUUID(),
          displayName: targetName,
          type: act.targetType,
          modifiedProperties: [
            {
              displayName: act.operationType === "Add" ? "member" : "displayName",
              oldValue: act.operationType === "Add" ? "[]" : `"${targetName}"`,
              newValue: act.operationType === "Delete" ? "[]" : `"${targetName}"`,
            },
          ],
        },
      ],
      result: isErr ? "failure" : "success",
      resultReason: isErr ? "Microsoft.Online.Administration.InsufficientPrivilegesException" : "",
    };
    operationName = act.name;
    eventCategory = ["iam"];
    eventType = isErr
      ? ["admin"]
      : [
          act.operationType === "Delete"
            ? "deletion"
            : act.operationType === "Add"
              ? "creation"
              : "change",
        ];
    conditionalAccess = isErr ? "failure" : "success";
  } else {
    const riskType = rand(ENTRA_RISK_TYPES);
    const loc = rand(ENTRA_LOCATIONS);
    const riskLevel = isErr ? rand(["high", "medium"]) : rand(["low", "medium"]);
    const detectionTiming = rand(["realtime", "offline"]);

    props = {
      id: randUUID(),
      requestId: originalRequestId,
      correlationId,
      riskType,
      riskEventType: riskType,
      riskLevel,
      riskState: isErr ? "atRisk" : "remediated",
      riskDetail: isErr ? "none" : "aiConfirmedSigninSafe",
      userPrincipalName: user,
      userDisplayName,
      userId,
      ipAddress: callerIp,
      detectedDateTime: time,
      lastUpdatedDateTime: time,
      location: {
        city: loc.city,
        state: loc.state,
        countryOrRegion: loc.countryOrRegion,
        geoCoordinates: loc.geoCoordinates,
      },
      source: "Identity Protection",
      detectionTimingType: detectionTiming,
      activity: "signin",
      tokenIssuerType: "AzureAD",
    };
    operationName = "Risk detection";
    eventCategory = ["intrusion_detection"];
    eventType = ["info"];
    conditionalAccess = isErr ? "atRisk" : "remediated";
  }

  const resultType = isErr ? "Failure" : "Success";

  return {
    "@timestamp": ts,
    time,
    tenantId,
    resourceId,
    operationName,
    operationVersion: "1.0",
    category: cat,
    resultType,
    resultSignature: isErr ? "1" : "0",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "microsoft.aadiam"),
    azure: {
      entra_id: {
        category: cat,
        user,
        user_display_name: userDisplayName,
        user_id: userId,
        app_id: appId,
        app_display_name: appDisplayName,
        ip_address: callerIp,
        result: resultType,
        conditional_access: conditionalAccess,
        tenant_id: tenantId,
        correlation_id: correlationId,
        properties: props,
      },
    },
    user: { name: userDisplayName, email: user, id: userId },
    source: { ip: callerIp },
    event: {
      kind: "event",
      category: eventCategory,
      type: eventType,
      action: operationName,
      outcome: isErr ? "failure" : "success",
      duration: randInt(5e5, 2e8),
    },
    message: JSON.stringify(props),
  };
}

const M365_WORKLOADS = [
  "Exchange",
  "SharePoint",
  "MicrosoftTeams",
  "OneDrive",
  "AzureActiveDirectory",
] as const;

const M365_RECORD_BY_WORKLOAD: Record<(typeof M365_WORKLOADS)[number], readonly string[]> = {
  Exchange: ["MailItemsAccessed", "Send", "SearchQueryPerformed"],
  SharePoint: ["FileDownloaded", "FileUploaded", "SharingSet"],
  MicrosoftTeams: ["TeamsSessionStarted", "MessageSent", "MemberAdded"],
  OneDrive: ["FileDownloaded", "FileSynced", "SharingSet"],
  AzureActiveDirectory: ["UserLoggedIn", "AddedToGroup", "Add member to role"],
};

export function generateM365Log(ts: string, er: number): EcsDocument {
  const { region, subscription, isErr } = makeAzureSetup(er);
  const user = randAzureOnMicrosoftEmail();
  const workload = rand(M365_WORKLOADS);
  const recordType = rand(M365_RECORD_BY_WORKLOAD[workload]);
  const callerIp = randPublicIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const orgId = randId(8).toUpperCase();
  const resourceId = `/organization/${orgId}/subscriptions/${subscription.id}/Microsoft.Office365/${workload}`;
  const props = {
    RecordType: recordType,
    Workload: workload,
    UserId: user,
    ClientIP: callerIp,
    OrganizationId: orgId,
    ResultStatus: isErr ? rand(["Failed", "PartiallySucceeded"]) : "Succeeded",
    ObjectId: randUUID(),
    AuditLogRecordType: 1,
    ExtendedProperties: { SessionId: randUUID(), ApplicationId: randUUID() },
  };
  const operationName = `Microsoft.Office365/${workload}/${recordType}`;
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName,
    category: "Audit.General",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "Failed" : "Succeeded",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.Office365"),
    azure: {
      microsoft_365: {
        workload,
        record_type: recordType,
        user_id: user,
        client_ip: callerIp,
        organization_id: orgId,
        result: isErr ? rand(["Failed", "PartiallySucceeded"]) : "Succeeded",
        category: "Audit.General",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: azureLogEvent(
      isErr,
      randInt(5e5, 2e8),
      operationName,
      ["process"],
      isErr ? ["error"] : ["start"]
    ),
    message: isErr
      ? `Microsoft 365 ${workload}: ${recordType} failed for ${user}`
      : `Microsoft 365 ${workload}: ${recordType} by ${user}`,
  };
}
