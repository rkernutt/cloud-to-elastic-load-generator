import {
  type EcsDocument,
  rand,
  randInt,
  randFloat,
  randId,
  azureCloud,
  makeAzureSetup,
  randCorrelationId,
  randUUID,
} from "./helpers.js";

export function generateSqlDatabaseLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const server = `sql-${randId(6).toLowerCase()}`;
  const db = rand(["app", "reporting", "auth", "inventory", "billing"]);
  const correlationId = randCorrelationId();
  const callerIp = `${randInt(10, 223)}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`;
  const resourceId = `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Sql/servers/${server}/databases/${db}`;
  const style = rand([
    "SQLInsights",
    "DatabaseWaitStatistics",
    "Errors",
    "Audit",
    "AutomaticTuning",
  ] as const);
  const failed = isErr || style === "Errors";

  let category = "SQLInsights";
  let operationName = "SQLInsights";
  let resultType: string = failed ? "Failed" : "Succeeded";
  let level = failed ? "Error" : "Informational";
  let message = "";
  const properties: Record<string, unknown> = { resourceId, elastic_pool_name: null };

  if (style === "SQLInsights") {
    category = "SQLInsights";
    operationName = "QueryStoreRuntimeStatistics";
    const durationMs = randFloat(failed ? 5000 : 2, failed ? 120_000 : 800);
    properties.QueryText = failed
      ? "SELECT * FROM orders WITH (NOLOCK) WHERE status = @p0 OPTION (RECOMPILE)"
      : "UPDATE dbo.customers SET last_login_utc = SYSUTCDATETIME() WHERE customer_id = @id";
    properties.Duration = Math.round(durationMs * 1000);
    properties.WaitType = failed
      ? rand(["PAGEIOLATCH_SH", "LCK_M_S", "CXPACKET", "RESOURCE_SEMAPHORE"])
      : "SOS_SCHEDULER_YIELD";
    properties.CPUTime = failed ? randInt(50_000_000, 900_000_000) : randInt(500_000, 45_000_000);
    properties.LogicalReads = failed ? randInt(500_000, 12_000_000) : randInt(200, 80_000);
    properties.PhysicalReads = failed ? randInt(10_000, 2_000_000) : randInt(0, 5000);
    properties.query_hash = randId(16).toLowerCase();
    message = failed
      ? `Long-running query on ${server}/${db}: wait type ${properties.WaitType}, duration ${durationMs.toFixed(0)}ms`
      : `Query completed on ${server}/${db}: cpu ${(Number(properties.CPUTime) / 1e6).toFixed(2)}ms, logical reads ${properties.LogicalReads}`;
  } else if (style === "DatabaseWaitStatistics") {
    category = "DatabaseWaitStatistics";
    operationName = "DatabaseWaitStatistics";
    resultType = "Succeeded";
    level = "Informational";
    const waitType = rand([
      "WRITELOG",
      "PAGEIOLATCH_EX",
      "ASYNC_NETWORK_IO",
      "CXCONSUMER",
      "LCK_M_U",
    ]);
    properties.wait_type = waitType;
    properties.wait_time_ms = randInt(1_000_000, 80_000_000);
    properties.signal_wait_time_ms = randInt(50_000, 8_000_000);
    properties.waiting_tasks_count = randInt(1, 120);
    message = `Wait statistics snapshot on ${server}/${db}: ${waitType} total wait ${properties.wait_time_ms} ms`;
  } else if (style === "Errors") {
    category = "Errors";
    operationName = rand(["Error", "Deadlock", "Timeout"] as const);
    resultType = "Failed";
    level = "Error";
    const err = operationName === "Deadlock" ? 1205 : operationName === "Timeout" ? -2 : 18456;
    properties.error_number = err;
    properties.error_severity = operationName === "Deadlock" ? 13 : 14;
    properties.error_state = randInt(1, 8);
    properties.error_message =
      operationName === "Deadlock"
        ? "Transaction (Process ID 62) was deadlocked on lock resources with another process and has been chosen as the deadlock victim."
        : operationName === "Timeout"
          ? "Execution Timeout Expired. The timeout period elapsed prior to completion of the operation."
          : "Login failed for user 'app_reader'. Reason: Password did not match that for the login provided.";
    properties.session_id = randInt(50, 400);
    message =
      operationName === "Deadlock"
        ? `Deadlock detected on ${server}/${db} (victim session ${properties.session_id})`
        : operationName === "Timeout"
          ? `Query timeout on ${server}/${db} after ${randInt(30, 300)}s`
          : `Connection failed to ${server}/${db}: login validation error`;
  } else if (style === "Audit") {
    category = "SQLSecurityAuditEvents";
    operationName = rand([
      "DATABASE AUTHENTICATION SUCCEEDED",
      "DATABASE AUTHENTICATION FAILED",
      "SCHEMA OBJECT CHANGE",
      "DATABASE OBJECT PERMISSION CHANGE",
    ] as const);
    resultType = operationName.includes("FAILED") ? "Failed" : "Succeeded";
    level = operationName.includes("FAILED") ? "Warning" : "Informational";
    properties.action_id = operationName.includes("AUTHENTICATION")
      ? operationName.includes("FAILED")
        ? "LGIF"
        : "LGIS"
      : "SC";
    properties.session_server_principal_name = rand([
      "app_svc",
      "dba_admin",
      "deploy_bot",
      "report_reader",
    ]);
    properties.database_principal_name = operationName.includes("AUTHENTICATION")
      ? "dbo"
      : rand(["dbo", "app_role"]);
    properties.schema_name = operationName.includes("SCHEMA") ? "dbo" : "";
    properties.object_name = operationName.includes("SCHEMA")
      ? rand(["customers", "orders", "audit_log"])
      : "";
    properties.statement = operationName.includes("PERMISSION")
      ? "GRANT SELECT ON SCHEMA::staging TO [reader_role]"
      : operationName.includes("SCHEMA")
        ? "ALTER TABLE dbo.orders ADD CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES dbo.customers(id)"
        : "";
    message =
      operationName === "DATABASE AUTHENTICATION FAILED"
        ? `Audit: failed login to ${server}/${db} from ${callerIp}`
        : operationName === "DATABASE AUTHENTICATION SUCCEEDED"
          ? `Audit: successful login to ${server}/${db} principal ${properties.session_server_principal_name}`
          : `Audit: ${operationName} on ${server}/${db}`;
  } else {
    category = "AutomaticTuning";
    operationName = rand(["INDEX_RECOMMENDATION", "FORCE_LAST_GOOD_PLAN"] as const);
    resultType = failed ? "Failed" : "Succeeded";
    level = failed ? "Warning" : "Informational";
    properties.option_name =
      operationName === "INDEX_RECOMMENDATION" ? "CREATE_INDEX" : "FORCE_LAST_GOOD_PLAN";
    properties.state = failed ? "VerificationFailed" : rand(["Active", "Pending", "Success"]);
    properties.implementation_details =
      operationName === "INDEX_RECOMMENDATION"
        ? `Missing index on dbo.line_items (covering) estimated impact ${randFloat(12, 88).toFixed(1)}%`
        : `Plan regression detected for query_id ${randInt(1000, 999999)}; reverting to last known good plan`;
    message =
      operationName === "INDEX_RECOMMENDATION"
        ? `Automatic tuning on ${server}/${db}: index recommendation ${String(properties.state).toLowerCase()}`
        : `Automatic tuning on ${server}/${db}: plan regression handling ${String(properties.state).toLowerCase()}`;
  }

  return {
    "@timestamp": ts,
    time: ts,
    resourceId,
    cloud: azureCloud(region, subscription, "Microsoft.Sql/servers"),
    category,
    operationName,
    resultType,
    level,
    correlationId,
    callerIpAddress: callerIp,
    properties,
    azure: {
      sql_database: {
        server,
        database: db,
        resource_group: resourceGroup,
        diagnostic_category: category,
        dtu_percent: failed && style === "SQLInsights" ? randFloat(92, 100) : randFloat(8, 72),
        deadlocks: style === "Errors" && operationName === "Deadlock" ? randInt(1, 5) : 0,
        failed_connections:
          style === "Errors" && operationName === "Error" ? randInt(1, 40) : randInt(0, 2),
      },
    },
    event: {
      outcome: failed ? "failure" : "success",
      duration: randInt(1e6, failed ? 9e9 : 8e8),
    },
    message,
  };
}

export function generateCosmosDbLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const account = `cosmos-${randId(6).toLowerCase()}`;
  const databaseName = rand(["main", "events", "catalog", "telemetry"]);
  const containerName = rand(["items", "orders", "profiles", "sessions"]);
  const pk = `/partition${randInt(0, 31)}`;
  const correlationId = randCorrelationId();
  const callerIp = `${randInt(10, 223)}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`;
  const resourceId = `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.DocumentDB/databaseAccounts/${account}`;
  const style = rand([
    "DataPlaneRequests",
    "ControlPlaneRequests",
    "Throttling",
    "QueryMetrics",
  ] as const);
  const throttled = isErr || style === "Throttling";

  let category = "DataPlaneRequests";
  let operationName = "Read";
  let resultType = throttled ? "Failed" : "Succeeded";
  let level = throttled ? "Warning" : "Informational";
  const properties: Record<string, unknown> = {
    resourceId,
    databaseName,
    collectionName: containerName,
    activityId: randUUID(),
  };
  let message = "";

  if (style === "DataPlaneRequests") {
    category = "DataPlaneRequests";
    operationName = rand(["Create", "Read", "Upsert", "Delete", "Execute", "Patch"] as const);
    const statusCode = throttled ? 429 : rand([200, 201, 204, 404]);
    properties.statusCode = statusCode;
    properties.requestCharge = throttled ? randFloat(5, 50) : randFloat(0.2, 24);
    properties.duration = throttled ? randFloat(1200, 9000) : randFloat(0.8, 85);
    properties.partitionKey = pk;
    properties.requestResourceType = rand(["Document", "StoredProcedure", "Collection"]);
    properties.requestResourceId = randId(12).toLowerCase();
    properties.region = region;
    message = throttled
      ? `Cosmos DB ${account}: ${operationName} throttled (429) RU=${Number(properties.requestCharge).toFixed(2)} activity=${properties.activityId}`
      : `Cosmos DB ${account}: ${operationName} completed status=${statusCode} RU=${Number(properties.requestCharge).toFixed(2)} in ${Number(properties.duration).toFixed(1)}ms`;
  } else if (style === "ControlPlaneRequests") {
    category = "ControlPlaneRequests";
    operationName = rand(["Create", "Delete", "Replace", "Patch"] as const);
    properties.statusCode = throttled ? 409 : rand([200, 202]);
    properties.duration = randFloat(200, 45_000);
    properties.properties = throttled
      ? { code: "Conflict", message: "Resource already exists" }
      : { provisioningState: "Succeeded" };
    properties.requestResourceType = rand(["Database", "Collection", "Offer"]);
    properties.requestResourceId = `${databaseName}/${containerName}`;
    resultType = throttled ? "Failed" : "Succeeded";
    level = throttled ? "Warning" : "Informational";
    message = throttled
      ? `Cosmos DB control plane ${account}: ${operationName} ${properties.requestResourceType} conflict`
      : `Cosmos DB control plane ${account}: ${operationName} ${properties.requestResourceType} ${properties.requestResourceId} succeeded`;
  } else if (style === "Throttling") {
    category = "DataPlaneRequests";
    operationName = "Execute";
    properties.statusCode = 429;
    properties.substatus = 3200;
    properties.requestCharge = randFloat(0, 2);
    properties.duration = randFloat(2, 40);
    properties.partitionKey = pk;
    properties.retryAfterInMs = randInt(5, 500);
    message = `Cosmos DB ${account}: request rate is large (429) partition ${pk} retryAfterMs=${properties.retryAfterInMs}`;
  } else {
    category = "QueryRuntimeStatistics";
    operationName = "Query";
    properties.queryText = "SELECT * FROM c WHERE c.region = @region ORDER BY c._ts DESC";
    properties.indexUtilizationRatio = throttled ? randFloat(0.05, 0.35) : randFloat(0.65, 0.99);
    properties.retrievedDocumentCount = randInt(50, 50_000);
    properties.retrievedDocumentSize = randInt(10_000, 40_000_000);
    properties.outputDocumentCount = randInt(1, 5000);
    properties.vmExecutionTimeMs = randFloat(12, throttled ? 8000 : 400);
    properties.totalQueryExecutionTimeMs = properties.vmExecutionTimeMs;
    properties.crossPartition = throttled || rand([true, false]);
    properties.statusCode = throttled ? 400 : 200;
    resultType = throttled ? "Failed" : "Succeeded";
    level = throttled ? "Warning" : "Informational";
    message = throttled
      ? `Cosmos DB ${account}: cross-partition query high latency indexUtil=${Number(properties.indexUtilizationRatio).toFixed(2)}`
      : `Cosmos DB ${account}: query completed retrieved=${properties.retrievedDocumentCount} indexUtil=${Number(properties.indexUtilizationRatio).toFixed(2)}`;
  }

  return {
    "@timestamp": ts,
    time: ts,
    resourceId,
    cloud: azureCloud(region, subscription, "Microsoft.DocumentDB/databaseAccounts"),
    category,
    operationName,
    resultType,
    level,
    correlationId,
    callerIpAddress: callerIp,
    properties,
    azure: {
      cosmos_db: {
        account,
        resource_group: resourceGroup,
        database: databaseName,
        container: containerName,
        partition_key: pk,
        ru_consumed: Number(
          (properties as { requestCharge?: number }).requestCharge ?? randInt(1, 4000)
        ),
        status_code: (properties as { statusCode?: number }).statusCode ?? (throttled ? 429 : 200),
      },
    },
    event: {
      outcome: throttled || resultType === "Failed" ? "failure" : "success",
      duration: randInt(2e6, throttled ? 5e9 : 2e8),
    },
    message,
  };
}
