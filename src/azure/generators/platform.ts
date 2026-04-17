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
} from "./helpers.js";

function azureDiagnosticTime(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) {
    const base = ts.replace(/Z$/i, "").split(".")[0] ?? ts;
    return `${base}.0000000Z`;
  }
  const iso = d.toISOString();
  const m = /^(.+)T(.+)\.(\d+)Z$/.exec(iso);
  if (!m) return `${iso.slice(0, 19)}.0000000Z`;
  const frac = m[3]!.padEnd(7, "0").slice(0, 7);
  return `${m[1]}T${m[2]}.${frac}Z`;
}

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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e6, 1e9) },
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e6, 1e9) },
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e6, 1e9) },
      message: `${evt}: ${msg}`,
    };
  }

  const armOp = rand([
    "Microsoft.Web/sites/write",
    "Microsoft.Web/sites/delete",
    "Microsoft.Web/sites/start/action",
    "Microsoft.Web/sites/stop/action",
  ] as const);
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e6, 1e9) },
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
      callerIpAddress: trigger === "httpTrigger" ? callerIp : "0.0.0.0",
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e6, 9e9) },
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
      event: { outcome: "failure", duration: randInt(1e6, 9e9) },
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e6, 9e9) },
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e6, 9e9) },
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e6, 9e9) },
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
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: `Microsoft.ServiceBus/namespaces/messages/${op.toLowerCase()}/action`,
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
        delivery_count: props.DeliveryCount as number,
        dead_letter: Boolean(props.DeadLetterReason),
        category: "OperationalLogs",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e6, 5e8) },
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
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: isErr
      ? "Microsoft.EventHub/namespaces/throttling"
      : "Microsoft.EventHub/namespaces/ingress",
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(5e5, 4e8) },
    message: isErr
      ? `Event Hubs '${hub}' throttling detected on ${partition}`
      : `Event Hubs '${hub}' ingress healthy (${incoming} bytes)`,
  };
}

export function generateKeyVaultLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const vault = `kv-${randId(8).toLowerCase()}`;
  const resourceId = armKeyVault(subscription.id, resourceGroup, vault);
  const callerIp = `203.0.113.${randInt(1, 200)}`;
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
  const identity = useSp
    ? { claim: { appid: randUUID(), oid: randUUID(), tid: subscription.id } }
    : {
        claim: {
          upn: `svc-${randId(4)}@${rand(["contoso", "fabrikam"])}.com`,
          oid: randUUID(),
          tid: subscription.id,
        },
      };
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
  const callerLabel = useSp
    ? (identity.claim as { appid: string }).appid
    : (identity.claim as { upn: string }).upn;
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: `Microsoft.KeyVault/vaults/${op.toLowerCase()}/action`,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(5e5, 4e7) },
    message: isErr
      ? `KeyVault audit: ${op} denied (${httpStatus}) caller=${callerLabel}`
      : `KeyVault audit: ${op} succeeded vault=${vault}`,
  };
}

export function generateEntraIdLog(ts: string, er: number): EcsDocument {
  const { region, subscription, isErr } = makeAzureSetup(er);
  const user = `user${randInt(1000, 9999)}@${rand(["contoso", "fabrikam"])}.com`;
  const tenantId = randUUID();
  const callerIp = `198.51.100.${randInt(2, 250)}`;
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const cat = rand(["SignInLogs", "AuditLogs", "RiskDetection"] as const);
  const resourceId = `/tenants/${tenantId}/providers/Microsoft.Identity/signInActivity`;
  const props =
    cat === "SignInLogs"
      ? {
          userPrincipalName: user,
          userId: randUUID(),
          appId: randId(8).toLowerCase(),
          appDisplayName: rand(["Office 365 Exchange Online", "Azure Portal", "Microsoft Teams"]),
          ipAddress: callerIp,
          location: {
            city: rand(["Seattle", "London", "Singapore"]),
            countryOrRegion: rand(["US", "GB", "SG"]),
          },
          status: {
            errorCode: isErr ? rand([50055, 50126, 700016]) : 0,
            failureReason: isErr ? "Invalid username or password" : "",
          },
          deviceDetail: { deviceId: "", displayName: rand(["Windows 11", "iPhone", "Chrome"]) },
          conditionalAccessStatus: rand(["success", "failure", "notApplied"]),
        }
      : cat === "AuditLogs"
        ? {
            activityDisplayName: rand([
              "Add member to group",
              "Update user",
              "Add app role assignment",
            ]),
            category: rand(["GroupManagement", "UserManagement", "ApplicationManagement"]),
            initiatedBy: { user: { userPrincipalName: user, ipAddress: callerIp } },
            targetResources: [{ displayName: `grp-${randId(4)}`, type: "Group" }],
            result: isErr ? "Failure" : "Success",
            resultReason: isErr ? "Insufficient privileges" : "",
          }
        : {
            riskType: rand(["unfamiliarFeatures", "anonymizedIPAddress", "maliciousIPAddress"]),
            riskLevel: isErr ? "high" : rand(["low", "medium"]),
            riskState: isErr ? "atRisk" : "remediated",
            userPrincipalName: user,
            ipAddress: callerIp,
          };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName:
      cat === "SignInLogs"
        ? "Sign-in activity"
        : cat === "AuditLogs"
          ? "Audit activity"
          : "Risk detection",
    category: cat,
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "1" : "0",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.Authorization"),
    azure: {
      entra_id: {
        category: cat,
        user,
        app_id: randId(8).toLowerCase(),
        ip_address: callerIp,
        result: isErr ? rand(["Failure", "Interrupted"]) : "Success",
        conditional_access: rand(["Success", "Failure", "Not applied"]),
        tenant_id: tenantId,
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(5e5, 2e8) },
    message: isErr ? `Entra ${cat}: failure for ${user}` : `Entra ${cat}: success for ${user}`,
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
  const user = `user${randInt(100, 999)}@${rand(["contoso", "fabrikam"])}.onmicrosoft.com`;
  const workload = rand(M365_WORKLOADS);
  const recordType = rand(M365_RECORD_BY_WORKLOAD[workload]);
  const callerIp = `198.51.100.${randInt(2, 250)}`;
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
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: `Microsoft.Office365/${workload}/${recordType}`,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(5e5, 2e8) },
    message: isErr
      ? `Microsoft 365 ${workload}: ${recordType} failed for ${user}`
      : `Microsoft 365 ${workload}: ${recordType} by ${user}`,
  };
}
