import { rand, randInt, randFloat, randId, randIp, randAccount, REGIONS } from "../../helpers";
import type { EcsDocument } from "./types.js";

function generateDynamoDbLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const hasTrace = Math.random() < 0.4;
  const traceId = hasTrace ? randId(32) : null;
  const tables = ["users", "sessions", "products", "orders", "events", "cache"];
  const table = rand(tables);
  const op = rand([
    "GetItem",
    "PutItem",
    "Query",
    "Scan",
    "UpdateItem",
    "DeleteItem",
    "BatchGetItem",
    "BatchWriteItem",
    "TransactGetItems",
    "TransactWriteItems",
  ]);
  const rcu = Number(randFloat(0.5, isErr ? 500 : 50));
  const wcu = Number(randFloat(0.5, 50));
  const latencyMs = Math.round(Number(randFloat(0.5, isErr ? 8000 : 120)));
  const returnedItems = isErr ? 0 : randInt(0, op.includes("Batch") ? 500 : 100);
  const dynamoErrCodes = [
    "ConditionalCheckFailedException",
    "ItemCollectionSizeLimitExceededException",
    "LimitExceededException",
    "MissingAuthenticationToken",
    "ProvisionedThroughputExceededException",
    "RequestLimitExceeded",
    "ResourceInUseException",
    "ResourceNotFoundException",
    "ThrottlingException",
    "TransactionCanceledException",
    "TransactionConflictException",
    "TransactionInProgressException",
    "ValidationException",
  ];
  const plainMessage = isErr
    ? `DynamoDB ${op} table=${table} latency_ms=${latencyMs} returned_items=${returnedItems}: ${rand(dynamoErrCodes)}`
    : `DynamoDB ${op} table=${table} consumed_rcu=${rcu} consumed_wcu=${wcu} returned_items=${returnedItems} latency_ms=${latencyMs}`;
  const useStructuredLogging = Math.random() < 0.55;
  const message = useStructuredLogging
    ? JSON.stringify({
        table,
        operation: op,
        consumedReadCapacityUnits: rcu,
        consumedWriteCapacityUnits: wcu,
        returnedItemCount: returnedItems,
        latencyMs,
        timestamp: new Date(ts).toISOString(),
      })
    : plainMessage;
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "dynamodb" },
    },
    aws: {
      dimensions: { TableName: table, Operation: op },
      dynamodb: {
        table_name: table,
        operation: op,
        consumed_read_capacity_units: rcu,
        consumed_write_capacity_units: wcu,
        returned_item_count: returnedItems,
        latency_ms: latencyMs,
        items_count: randInt(0, 1000),
        structured_logging: useStructuredLogging,
        error_code: isErr ? rand(dynamoErrCodes) : null,
        metrics: {
          AccountMaxReads: { max: randInt(1000, 1e6) },
          AccountMaxWrites: { max: randInt(1000, 1e6) },
          AccountMaxTableLevelReads: { max: randInt(100, 100000) },
          AccountMaxTableLevelWrites: { max: randInt(100, 100000) },
          AccountProvisionedReadCapacityUtilization: {
            avg: Number(randFloat(5, isErr ? 95 : 60)),
          },
          ConsumedReadCapacityUnits: { sum: randInt(1, 1000) },
          ConsumedWriteCapacityUnits: { sum: randInt(1, 500) },
          ProvisionedReadCapacityUnits: { avg: randInt(5, 10000) },
          ProvisionedWriteCapacityUnits: { avg: randInt(5, 5000) },
          ReadThrottleEvents: { sum: isErr ? randInt(1, 100) : 0 },
          WriteThrottleEvents: { sum: isErr ? randInt(1, 100) : 0 },
          SystemErrors: { sum: isErr ? 1 : 0 },
          UserErrors: { sum: isErr ? randInt(1, 5) : 0 },
          SuccessfulRequestLatency: {
            avg: Number(randFloat(0.1, isErr ? 50 : 5)),
            max: Number(randFloat(1, isErr ? 200 : 20)),
          },
          ThrottledRequests: { sum: isErr ? randInt(1, 100) : 0 },
          TransactionConflict: { sum: isErr && Math.random() > 0.5 ? randInt(1, 10) : 0 },
          ReturnedItemCount: { avg: randInt(1, 1000) },
          ReturnedBytes: { avg: randInt(100, 1e6) },
        },
      },
    },
    db: { name: table, operation: op, type: "nosql" },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["database"],
      type: isErr ? ["error"] : ["access"],
      dataset: "aws.dynamodb",
      provider: "dynamodb.amazonaws.com",
      duration: latencyMs * 1e6,
    },
    message: message,
    log: { level: isErr ? "error" : rcu > 100 ? "warn" : "info" },
    ...(isErr
      ? { error: { code: rand(dynamoErrCodes), message: `DynamoDB ${op} failed`, type: "db" } }
      : {}),
    ...(hasTrace ? { trace: { id: traceId } } : {}),
    ...(hasTrace ? { transaction: { id: randId(16) } } : {}),
  };
}

function generateElastiCacheLog(ts: string, er: number): EcsDocument {
  // ~12% chance of generating a Global Datastore event
  if (Math.random() < 0.12) {
    const r = rand(REGIONS);
    const a = randAccount();
    const e = Math.random() < er;
    const globalDs = rand(["global-session-store", "global-leaderboard", "global-feature-flags"]);
    const ev = rand([
      "CreateGlobalReplicationGroup",
      "IncreaseNodeGroupCount",
      "Failover",
      "RebalanceSlotsInGlobalReplicationGroup",
      "DisassociateGlobalReplicationGroup",
    ]);
    const errMsgs = [
      "Cross-region replication lag exceeded 10s",
      "Failover target unavailable",
      "Slot migration in progress",
      "Maximum regions reached",
    ];
    const secondaryRegions = ["eu-west-1", "ap-northeast-1", "us-west-2"];
    return {
      __dataset: "aws.elasticacheglobal",
      "@timestamp": ts,
      cloud: {
        provider: "aws",
        region: r,
        account: { id: a.id, name: a.name },
        service: { name: "elasticache-global" },
      },
      aws: {
        elasticacheglobal: {
          global_datastore_name: globalDs,
          event_type: ev,
          primary_region: r,
          secondary_regions: secondaryRegions.filter((reg) => reg !== r),
          replication_lag_ms: randFloat(0.5, e ? 15000 : 50),
          cross_region_bandwidth_mbps: randFloat(1, 500),
          global_node_groups: randInt(1, 5),
          status: e ? "modifying" : "available",
        },
      },
      event: { outcome: e ? "failure" : "success", duration: randInt(1e5, 3e7) },
      message: e
        ? `ElastiCache Global ${globalDs}: ${ev} failed — ${rand(errMsgs)}`
        : `ElastiCache Global ${globalDs}: ${ev} completed`,
    };
  }
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const clusterId = `prod-redis-${randInt(1, 5)}`;
  const nodeId = `${randInt(1, 5).toString().padStart(4, "0")}`;
  const cmd = rand([
    "GET",
    "SET",
    "DEL",
    "EXPIRE",
    "HGET",
    "HSET",
    "LPUSH",
    "RPOP",
    "ZADD",
    "ZRANGE",
    "SCAN",
  ]);
  const lat = Number(randFloat(0.01, isErr ? 5000 : 50));
  const replicationGroupId = "prod-cache";
  const logFlavor = rand(["cmd", "slowlog", "engine", "replication", "failover"]);
  const redisPid = randInt(1, 32);
  const slowUsecs = randInt(15_000, 8_000_000);
  const tsHuman = new Date(ts).toISOString().replace("T", " ").slice(0, 23);
  const elastiCacheErrCodes = [
    "CacheClusterNotFound",
    "CacheParameterGroupNotFound",
    "CacheSecurityGroupNotFound",
    "CacheSubnetGroupNotFoundFault",
    "ClusterQuotaForCustomerExceeded",
    "InsufficientCacheClusterCapacity",
    "InvalidCacheClusterState",
    "InvalidSubnet",
    "NodeGroupsPerReplicationGroupQuotaExceeded",
    "NodeQuotaForClusterExceeded",
    "ReplicationGroupAlreadyExists",
    "ReplicationGroupNotFound",
    "SnapshotAlreadyExistsFault",
  ];
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "elasticache" },
    },
    aws: {
      dimensions: {
        CacheClusterId: clusterId,
        CacheNodeId: nodeId,
        ReplicationGroupId: replicationGroupId,
      },
      elasticache: {
        cluster_id: clusterId,
        node_id: nodeId,
        engine: "redis",
        engine_version: "7.1.0",
        replication_group_id: replicationGroupId,
        command: cmd,
        latency_us: lat,
        cache_hit: !isErr && Math.random() > 0.3,
        connected_clients: randInt(10, 500),
        used_memory_mb: randInt(256, 16384),
        metrics: {
          BytesUsedForCache: { avg: randInt(1e6, 8e9) },
          CacheHits: { sum: randInt(100, 100000) },
          CacheMisses: { sum: randInt(1, 1000) },
          CacheHitRate: { avg: Number(randFloat(0.85, 0.99)) },
          CurrConnections: { avg: randInt(10, 1000) },
          NewConnections: { sum: randInt(1, 100) },
          Evictions: { sum: isErr ? randInt(1, 1000) : 0 },
          Reclaimed: { sum: randInt(0, 100) },
          ReplicationBytes: { avg: randInt(0, 1e7) },
          ReplicationLag: { avg: randInt(0, isErr ? 10 : 1) },
          SaveInProgress: { avg: 0 },
          CurrItems: { avg: randInt(1000, 1e6) },
          NewItems: { sum: randInt(1, 10000) },
          NetworkBytesIn: { avg: randInt(1000, 1e8) },
          NetworkBytesOut: { avg: randInt(1000, 1e8) },
          CPUUtilization: { avg: Number(randFloat(1, isErr ? 90 : 40)) },
          EngineCPUUtilization: { avg: Number(randFloat(1, isErr ? 80 : 30)) },
          FreeableMemory: { avg: randInt(1e8, 8e9) },
          SwapUsage: { avg: randInt(0, 5e7) },
          DatabaseMemoryUsagePercentage: { avg: Number(randFloat(10, isErr ? 95 : 70)) },
          TrafficBasedCmdsLatency: { avg: Number(randFloat(0.01, isErr ? 10 : 1)) },
        },
      },
    },
    db: { type: "keyvalue", operation: cmd },
    event: {
      duration: lat * 1000,
      outcome: isErr ? "failure" : "success",
      category: ["database", "network"],
      dataset: "aws.elasticache",
      provider: "elasticache.amazonaws.com",
    },
    message: (() => {
      if (isErr) {
        return `Redis ${cmd} failed: ${rand(["LOADING", "READONLY", "OOM command not allowed"])}`;
      }
      if (logFlavor === "slowlog") {
        return `${redisPid}:M ${tsHuman} * ${slowUsecs} ${cmd} ${rand(["user:*", "session:*", "idx:products:*"])}`;
      }
      if (logFlavor === "engine") {
        return `[${redisPid}] ${tsHuman} # ${rand(["WARN", "INFO"])} ${rand(["Replica is read-only", "AOF rewrite finished", "RDB: 0 MB of memory used by copy-on-write", "Overcommit_memory is set to 0"])}`;
      }
      if (logFlavor === "replication") {
        return `[${redisPid}] ${tsHuman} # INFO Partial resynchronization request accepted. Sending ${randInt(1, 500)} bytes of backlog starting from offset ${randInt(1000, 9_000_000_000)}.`;
      }
      if (logFlavor === "failover") {
        return `[${redisPid}] ${tsHuman} # NOTICE Failover auth granted to replica ${clusterId}-002.${region}.cache.amazonaws.com:6379 for epoch ${randInt(1, 50)}`;
      }
      return `Redis ${cmd} ${lat.toFixed(2)}us`;
    })(),
    log: { level: isErr ? "error" : lat > 1000 ? "warn" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand(elastiCacheErrCodes),
            message: rand(["LOADING", "READONLY", "OOM command not allowed"]),
            type: "db",
          },
        }
      : {}),
  };
}

function generateRedshiftLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const dbName = rand(["analytics", "warehouse", "prod_dw", "dev_dw"]);
  const schema = rand(["public", "staging", "analytics", "raw"]);
  const tables = [
    "fact_events",
    "fact_sales",
    "dim_products",
    "dim_customers",
    "staging_orders",
    "raw_orders",
    "clickstream",
    "user_sessions",
  ];
  const table = rand(tables);
  const queries = [
    `SELECT COUNT(*) FROM ${schema}.${table} WHERE event_date >= CURRENT_DATE - 7`,
    `INSERT INTO ${schema}.staging_orders SELECT * FROM ${schema}.raw_orders WHERE processed_at IS NULL`,
    `COPY ${schema}.${table} FROM 's3://data-lake/${table}/2024/' IAM_ROLE 'arn:aws:iam::${acct.id}:role/RedshiftCopyRole' FORMAT AS PARQUET`,
    `UNLOAD ('SELECT * FROM ${schema}.fact_sales WHERE sale_date = CURRENT_DATE') TO 's3://exports/sales/${new Date(ts).toISOString().slice(0, 10)}/' IAM_ROLE 'arn:aws:iam::${acct.id}:role/RedshiftUnloadRole' PARQUET ALLOWOVERWRITE`,
    `VACUUM DELETE ONLY ${schema}.${table} TO 95 PERCENT`,
    `ANALYZE ${schema}.${table} PREDICATE COLUMNS`,
    `CREATE TEMP TABLE tmp_${table} AS SELECT * FROM ${schema}.${table} WHERE dt = CURRENT_DATE`,
    `SELECT a.user_id, COUNT(DISTINCT a.session_id), SUM(b.revenue) FROM ${schema}.user_sessions a JOIN ${schema}.fact_sales b ON a.user_id = b.user_id WHERE a.dt >= CURRENT_DATE - 30 GROUP BY 1 ORDER BY 3 DESC LIMIT 1000`,
  ];
  const query = rand(queries);
  const dur = Number(randFloat(0.1, isErr ? 300 : 60));
  const durMicro = Math.round(dur * 1000000);
  const dbUser = rand([
    "etl_user",
    "analyst",
    "bi_service",
    "dbt_runner",
    "looker_user",
    "redshift_admin",
  ]);
  const clusterId = rand(["prod-dw", "analytics-cluster", "reporting-cluster"]);
  const nodeType = rand(["ra3.xlplus", "ra3.4xlarge", "ra3.16xlarge", "dc2.large", "dc2.8xlarge"]);
  const numNodes = rand([2, 4, 8, 16]);
  const pid = randInt(10000, 99999);
  const xid = randInt(100000, 9999999);
  const queryId = randInt(1000000, 9999999);
  const nodeId = rand(["Leader", ...Array.from({ length: numNodes }, (_, i) => `Compute-${i}`)]);

  // Redshift has 4 log types: connectionlog, userlog, useractivitylog, and system tables
  const logType = rand([
    "connectionlog",
    "useractivitylog",
    "useractivitylog",
    "useractivitylog",
    "userlog",
  ]);
  const logGroup = `/aws/redshift/cluster/${clusterId}/${logType}`;
  const logStream = `${clusterId}/${logType}/${new Date(ts).toISOString().slice(0, 10)}`;

  const sourceIp = randIp();
  const sourcePort = randInt(1024, 65535);
  const queryType = query.trim().split(/\s+/)[0].toUpperCase();
  const wlmQueue = rand([
    "superuser",
    "etl_queue",
    "analyst_queue",
    "default_queue",
    "short_query_queue",
  ]);
  const wlmSlot = randInt(1, 15);
  const wlmWaitMs = isErr ? randInt(10000, 300000) : randInt(0, 5000);

  let message: string;
  if (logType === "connectionlog") {
    if (Math.random() < 0.5) {
      message = `initiating session ${pid} from ${sourceIp} port ${sourcePort} to ${clusterId}.${randId(8).toLowerCase()}.${region}.redshift.amazonaws.com port 5439 using SSL: version=TLSv1.2 cipher=ECDHE-RSA-AES256-GCM-SHA384 bits=256 pid=${pid} dbname=${dbName} user=${dbUser} application_name=${rand(["Amazon Redshift JDBC Driver", "psql", "dbt", "Looker", "Python"])}`;
    } else {
      message = `disconnecting session ${pid} user=${dbUser} db=${dbName} duration=${Math.round(dur)}s`;
    }
  } else if (logType === "useractivitylog") {
    // Matches real Redshift user activity log format: "'timestamp UTC [ db=... user=... pid=... userid=... xid=... ]' LOG: SQL_TEXT"
    const tsUtc = new Date(ts).toISOString().replace("T", " ").replace("Z", " UTC");
    message = `'${tsUtc} [ db=${dbName} user=${dbUser} pid=${pid} userid=${randInt(100, 999)} xid=${xid} ]' LOG: ${query}`;
  } else {
    // userlog: DDL changes, user creation, etc.
    const userlogAction = rand([
      `create user ${rand(["new_analyst", "etl_svc", "readonly_user"])} password '***' createdb nocreateuser`,
      `alter user ${dbUser} set search_path to '${schema}'`,
      `grant select on all tables in schema ${schema} to ${rand(["analyst_group", "readonly_group"])}`,
      `alter user ${dbUser} connection limit ${randInt(10, 100)}`,
    ]);
    message = `'${new Date(ts).toISOString().replace("T", " ").replace("Z", " UTC")} [ db=${dbName} user=rdsdb pid=${pid} userid=1 xid=${xid} ]' LOG: ${userlogAction}`;
  }

  const rowsReturned = isErr ? 0 : randInt(0, 5000000);
  const rowsAffected = queryType === "SELECT" ? 0 : rowsReturned;
  const bytesScanned = randInt(1024, 10737418240);

  const redshiftErrCodes = [
    "QUERY_TIMED_OUT",
    "DISK_FULL",
    "SERIALIZABLE_ISOLATION_VIOLATION",
    "LOCK_TIMEOUT",
    "OUT_OF_MEMORY",
    "PERMISSION_DENIED",
    "COPY_LOAD_ERROR",
    "INTERNAL_ERROR",
  ];
  const redshiftErrMsgs: Record<string, string> = {
    QUERY_TIMED_OUT: `ERROR: Query (${queryId}) cancelled by the system. Maximum query time exceeded.`,
    DISK_FULL: `ERROR: Disk Full on ${nodeId}: Cannot write to temp space. (${queryId})`,
    SERIALIZABLE_ISOLATION_VIOLATION: `ERROR: 1023 DETAIL: Serializable isolation violation on table ${schema}.${table}`,
    LOCK_TIMEOUT: `ERROR: Lock timeout on table ${schema}.${table}: ${dbUser} waiting for AccessExclusiveLock`,
    OUT_OF_MEMORY: `ERROR: ${queryId}: out of memory. (${nodeId})`,
    PERMISSION_DENIED: `ERROR: permission denied for relation ${schema}.${table}`,
    COPY_LOAD_ERROR: `ERROR: Load into table '${table}' failed.  Check 'stl_load_errors' for details.`,
    INTERNAL_ERROR: `ERROR: Spectrum Scan Error (${queryId})`,
  };
  const errCode = isErr ? rand(redshiftErrCodes) : null;

  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "redshift" },
    },
    aws: {
      dimensions: { ClusterIdentifier: clusterId, NodeID: nodeId },
      cloudwatch: { log_group: logGroup, log_stream: logStream },
      redshift: {
        cluster_id: clusterId,
        node_type: nodeType,
        number_of_nodes: numNodes,
        database: dbName,
        schema,
        user: dbUser,
        pid,
        xid,
        query_id: queryId,
        log_type: logType,
        duration_microseconds: durMicro,
        rows_returned: rowsReturned,
        rows_affected: rowsAffected,
        bytes_scanned: bytesScanned,
        error_code: errCode,
        error_message: errCode ? redshiftErrMsgs[errCode] : null,
        query_type: queryType,
        source_ip: sourceIp,
        source_port: sourcePort,
        application_name: rand(["Amazon Redshift JDBC Driver", "psql", "dbt", "Looker", "Python"]),
        wlm: {
          queue_name: wlmQueue,
          slot_count: wlmSlot,
          queue_wait_ms: wlmWaitMs,
          service_class: randInt(6, 14),
        },
        metrics: {
          CPUUtilization: { avg: Number(randFloat(1, isErr ? 90 : 60)) },
          PercentageDiskSpaceUsed: { avg: Number(randFloat(10, isErr ? 95 : 70)) },
          DatabaseConnections: { avg: randInt(1, 500) },
          HealthStatus: { avg: isErr ? 0 : 1 },
          MaintenanceMode: { avg: 0 },
          NetworkReceiveThroughput: { avg: randInt(1000, 1e9) },
          NetworkTransmitThroughput: { avg: randInt(1000, 1e9) },
          QueriesCompletedPerSecond: { avg: Number(randFloat(1, 1000)) },
          QueryDuration: { avg: Number(randFloat(100, isErr ? 120000 : 30000)) },
          QueryRuntimeBreakdown: { avg: Number(randFloat(100, 30000)) },
          ReadIOPS: { avg: randInt(100, 10000) },
          ReadLatency: { avg: Number(randFloat(0.001, isErr ? 1 : 0.1)) },
          ReadThroughput: { avg: randInt(1e6, 1e9) },
          WLMQueriesCompletedPerSecond: { avg: Number(randFloat(1, 500)) },
          WLMQueryDuration: { avg: Number(randFloat(100, 60000)) },
          WLMRunningSlotCount: { avg: randInt(1, 50) },
          WLMQueueLength: { avg: isErr ? randInt(5, 50) : randInt(0, 5) },
          WLMQueueWaitTime: {
            avg: isErr ? Number(randFloat(5000, 60000)) : Number(randFloat(0, 1000)),
          },
          WriteIOPS: { avg: randInt(100, 5000) },
          WriteLatency: { avg: Number(randFloat(0.001, isErr ? 1 : 0.1)) },
          WriteThroughput: { avg: randInt(1e6, 5e8) },
        },
      },
    },
    db: { user: { name: dbUser }, name: dbName, statement: query, type: "sql" },
    source: { ip: sourceIp, port: sourcePort },
    event: {
      duration: dur * 1e9,
      outcome: isErr ? "failure" : "success",
      category: ["database"],
      dataset: "aws.redshift",
      provider: "redshift.amazonaws.com",
    },
    message,
    log: { level: isErr ? "error" : dur > 60 ? "warn" : "info" },
    ...(isErr && errCode
      ? {
          error: {
            code: errCode,
            message: redshiftErrMsgs[errCode] || "Redshift query failed",
            type: "db",
          },
        }
      : {}),
  };
}

function generateOpenSearchLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const indices = ["logs-2024", "metrics", "traces", "audit-events", "app-logs"];
  const idx = rand(indices);
  const op = rand(["index", "search", "bulk", "delete", "update", "get", "msearch"]);
  const dur = Number(randFloat(1, isErr ? 30000 : 2000));
  const status = isErr ? rand([400, 429, 500, 503]) : rand([200, 200, 201]);
  const domainName = `prod-search-${region}`;
  const totalShards = randInt(5, 50);
  const variant = rand([
    "http",
    "index_mgmt",
    "allocation",
    "cluster_health",
    "slow_query",
    "gc",
    "circuit_breaker",
  ]);
  const queryBody =
    '{"query":{"bool":{"filter":[{"range":{"@timestamp":{"gte":"now-1h"}}}],"must":[{"match":{"service.name":"checkout"}}]}},"size":500}';
  const gcLine = `[${new Date(ts).toISOString()}][INFO ][o.e.m.j.JvmGcMonitorService] [${rand(["data-0", "master-1", "ingest-2"])}] [gc][${randInt(100, 9999)}] overhead, spent [${Number(randFloat(200, isErr ? 5000 : 800)).toFixed(1)}ms] collecting in the last [1s]`;
  const cbLine = `[${new Date(ts).toISOString()}][WARN ][o.e.i.b.request.RequestBreaker] [${rand(["data-0", "data-1"])}] breaking incoming request: [parent] Data too large, data for [<reused_arrays>] would be [${randInt(512, 4096)}mb], which is larger than the limit of [${randInt(256, 2048)}mb]`;
  let message: string;
  let operation = op;
  let logExtras: Record<string, unknown> = {};
  if (variant === "index_mgmt") {
    operation = rand(["create_index", "delete_index", "close_index", "open_index"]);
    message = `[${new Date(ts).toISOString()}] cluster=${domainName} action=${operation} index=${idx} ack=${isErr ? "false" : "true"}`;
  } else if (variant === "allocation") {
    operation = "shard_allocation";
    message = `[${new Date(ts).toISOString()}] reroute started: allocate replica shard [${idx}][${randInt(0, 9)}] on node [${rand(["i-0abc", "i-0def"])}] reason=CLUSTER_RECOVERED`;
    logExtras = { allocation_explanation: isErr ? "NO_VALID_SHARD_COPY" : "ALLOCATED" };
  } else if (variant === "cluster_health") {
    operation = "cluster_health";
    const health = isErr ? rand(["red", "yellow"]) : "green";
    message = `[${new Date(ts).toISOString()}] cluster health changed: ${health} (active_shards=${randInt(40, 200)}, relocating_shards=${randInt(0, 5)}, unassigned_shards=${isErr ? randInt(1, 20) : 0})`;
    logExtras = { cluster_health: health };
  } else if (variant === "slow_query") {
    operation = "slow_search";
    message = `[${new Date(ts).toISOString()}] [index.search.slowlog.query] [${idx}] took[${dur.toFixed(1)}ms], took_millis[${Math.round(dur)}], types[], stats[], search_type[QUERY_THEN_FETCH], total_shards[${totalShards}], source[${queryBody}]`;
    logExtras = { slow_query_source: queryBody };
  } else if (variant === "gc") {
    operation = "jvm_gc";
    message = gcLine;
    logExtras = { gc_event: true };
  } else if (variant === "circuit_breaker") {
    operation = "circuit_breaker";
    message = cbLine;
    logExtras = { circuit_breaker: "parent" };
  } else {
    message = isErr
      ? `OpenSearch ${op} on ${idx} failed [${status}] after ${dur.toFixed(0)}ms`
      : `OpenSearch ${op} on ${idx}: ${dur.toFixed(0)}ms`;
  }
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "opensearch" },
    },
    aws: {
      dimensions: { DomainName: domainName, ClientId: acct.id },
      opensearch: {
        domain_name: domainName,
        index: idx,
        operation,
        took_ms: Math.round(dur),
        shards: {
          total: totalShards,
          successful: isErr ? randInt(1, totalShards - 1) : totalShards,
          failed: isErr ? randInt(1, 3) : 0,
          active: isErr ? randInt(totalShards - 5, Math.max(1, totalShards - 1)) : totalShards,
          initializing: isErr ? randInt(0, 3) : 0,
          relocating: isErr ? randInt(0, 2) : 0,
          unassigned: isErr ? randInt(1, 5) : 0,
        },
        hits_total: isErr ? 0 : randInt(0, 100000),
        status_code: status,
        ...logExtras,
        metrics: {
          CPUUtilization: { avg: Number(randFloat(5, isErr ? 95 : 60)) },
          FreeStorageSpace: { avg: randInt(5e9, 500e9) },
          ClusterStatus: (() => {
            const red = isErr && Math.random() > 0.5 ? 1 : 0;
            return { green: isErr ? 0 : 1, yellow: isErr && !red ? 1 : 0, red };
          })(),
          Nodes: { avg: randInt(3, 20) },
          SearchableDocuments: { avg: randInt(1e6, 1e9) },
          IndexingLatency: { avg: randInt(1, isErr ? 5000 : 500) },
          SearchLatency: { avg: randInt(1, isErr ? 10000 : 1000) },
          IndexingRate: { avg: randInt(100, 100000) },
          SearchRate: { avg: randInt(10, 10000) },
          JVMMemoryPressure: { avg: Number(randFloat(10, isErr ? 95 : 70)) },
          AutomatedSnapshotFailure: { sum: isErr ? 1 : 0 },
          CoordinatingWriteRejected: { sum: isErr ? randInt(0, 1000) : 0 },
          PrimaryWriteRejected: { sum: isErr ? randInt(0, 500) : 0 },
          ReplicaWriteRejected: { sum: isErr ? randInt(0, 200) : 0 },
          WarmStorageSpaceUsage: { avg: Number(randFloat(10, 90)) },
          DeletedDocuments: { avg: randInt(0, 100000) },
        },
      },
    },
    http: { response: { status_code: status } },
    event: {
      duration: dur * 1e6,
      outcome: isErr ? "failure" : "success",
      category: "database",
      dataset: "aws.opensearch",
      provider: "es.amazonaws.com",
    },
    message,
    log: { level: isErr ? "error" : dur > 5000 ? "warn" : "info" },
    ...(isErr
      ? { error: { code: String(status), message: `OpenSearch ${op} failed`, type: "db" } }
      : {}),
  };
}

function generateDocumentDbLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const op = rand(["find", "insert", "update", "delete", "aggregate", "createIndex"]);
  const col = rand(["users", "orders", "products", "sessions", "events"]);
  const dur = Number(randFloat(0.1, isErr ? 10000 : 500));
  const clusterId = `docdb-${region}-cluster`;
  const docdbErrCodes = [
    "DBClusterNotFoundFault",
    "DBClusterAlreadyExistsFault",
    "DBInstanceNotFound",
    "InvalidDBClusterStateFault",
    "InsufficientDBClusterCapacityFault",
    "StorageQuotaExceeded",
    "DBSubnetGroupDoesNotCoverEnoughAZs",
    "DBClusterParameterGroupNotFound",
    "SnapshotQuotaExceeded",
    "InvalidDBSubnetGroupStateFault",
    "GlobalClusterNotFoundFault",
  ];
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "docdb" },
    },
    aws: {
      dimensions: { DBClusterIdentifier: clusterId, Role: rand(["WRITER", "READER"]) },
      docdb: {
        cluster_id: clusterId,
        database: "appdb",
        collection: col,
        operation: op,
        duration_ms: Math.round(dur),
        documents_affected: isErr ? 0 : randInt(1, 1000),
        error: isErr
          ? rand(["CursorNotFound", "DuplicateKey", "WriteConflict", "ExceededTimeLimit"])
          : null,
        metrics: {
          CPUUtilization: { avg: Number(randFloat(2, isErr ? 95 : 60)) },
          DatabaseConnections: { avg: randInt(1, isErr ? 500 : 100) },
          FreeLocalStorage: { avg: randInt(1e9, 100e9) },
          FreeableMemory: { avg: randInt(500e6, 8e9) },
          ReadIOPS: { avg: randInt(0, 5000) },
          WriteIOPS: { avg: randInt(0, 5000) },
          ReadLatency: { avg: Number(randFloat(0.1, isErr ? 50 : 5)) },
          WriteLatency: { avg: Number(randFloat(0.1, isErr ? 50 : 5)) },
          DocumentsInserted: { sum: op === "insert" ? randInt(1, 1000) : 0 },
          DocumentsDeleted: { sum: op === "delete" ? randInt(1, 100) : 0 },
          DocumentsUpdated: { sum: op === "update" ? randInt(1, 500) : 0 },
          DocumentsReturned: { sum: op === "find" || op === "aggregate" ? randInt(0, 10000) : 0 },
        },
      },
    },
    db: { name: "appdb", operation: op, type: "document" },
    event: {
      duration: dur * 1e6,
      outcome: isErr ? "failure" : "success",
      category: ["database"],
      dataset: "aws.docdb",
      provider: "docdb.amazonaws.com",
    },
    message: isErr
      ? `DocumentDB ${op} on ${col} failed: ${rand(["DuplicateKey", "WriteConflict"])}`
      : `DocumentDB ${op} on ${col}: ${dur.toFixed(1)}ms`,
    log: { level: isErr ? "error" : dur > 1000 ? "warn" : "info" },
    ...(isErr
      ? { error: { code: rand(docdbErrCodes), message: `DocumentDB ${op} failed`, type: "db" } }
      : {}),
  };
}

function generateAuroraLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const engine = rand(["aurora-mysql", "aurora-postgresql"]);
  const cluster = rand(["prod-aurora-cluster", "staging-aurora", "analytics-aurora"]);
  const instanceId = `${cluster}-instance-${randInt(1, 5)}`;
  const dbUser = rand(["app_rw", "analytics", "rds_superuser", "migration"]);
  const dbName = rand(["appdb", "warehouse", "events"]);
  const clientIp = randIp();
  const auditAction = rand(["QUERY", "CONNECT", "DISCONNECT"]);
  const sql = rand([
    `SELECT id, status FROM orders WHERE updated_at > NOW() - INTERVAL 1 HOUR LIMIT 500`,
    `UPDATE inventory SET qty = qty - 1 WHERE sku = '${randId(8)}'`,
    `INSERT INTO audit_log (actor, action) VALUES ('${dbUser}', 'checkout')`,
  ]);
  const tsAudit = new Date(ts).toISOString().replace("T", " ").replace("Z", " UTC");
  const isMysql = engine.includes("mysql");
  const logKind = rand(["audit", "slow", "engine_error", "failover", "generic"]);
  let message: string;
  let level: "error" | "warn" | "info";
  if (logKind === "audit") {
    message =
      auditAction === "CONNECT"
        ? `${tsAudit},${clientIp},${dbUser},${dbName},${randInt(10000, 99999)},CONNECT,,,0`
        : auditAction === "DISCONNECT"
          ? `${tsAudit},${clientIp},${dbUser},${dbName},${randInt(10000, 99999)},DISCONNECT,,,0`
          : `${tsAudit},${clientIp},${dbUser},${dbName},${randInt(10000, 99999)},QUERY,${sql},0`;
    level = "info";
  } else if (logKind === "slow") {
    const qt = Number(randFloat(1.2, isErr ? 120 : 12));
    level = isErr ? "error" : "warn";
    message = isMysql
      ? `# Time: ${tsAudit}\n# User@Host: ${dbUser}[${dbUser}] @ ${clientIp} [${clientIp}]  Id: ${randInt(1000, 99999)}\n# Query_time: ${qt.toFixed(6)}  Lock_time: 0.000045  Rows_sent: ${randInt(0, 5000)}  Rows_examined: ${randInt(100, 500000)}\n${sql};`
      : `${tsAudit} UTC:${clientIp}(${randInt(30000, 65000)}):${dbUser}@${dbName}:[${randInt(1000, 99999)}]:LOG:  duration: ${(qt * 1000).toFixed(3)} ms  statement: ${sql}`;
  } else if (logKind === "engine_error") {
    level = "error";
    message = isMysql
      ? `${tsAudit} ${randInt(1000, 99999)} [ERROR] [MY-${randInt(10000, 99999)}] [Server] ${isErr ? "Replica SQL thread stopped because of error" : "InnoDB: Warning: long semaphore wait"}`
      : `${tsAudit} UTC:${clientIp}(${randInt(30000, 65000)}):${dbUser}@${dbName}:[${randInt(1000, 99999)}]:ERROR:  ${isErr ? "canceling statement due to conflict with recovery" : "checkpoint request timed out"}\nSTATEMENT:  ${sql}`;
  } else if (logKind === "failover") {
    level = isErr ? "error" : "warn";
    message = `[AuroraFailover] cluster=${cluster} old_primary=${instanceId} new_primary=${cluster}-instance-${randInt(1, 5)} reason=${isErr ? "UNRESPONSIVE_PRIMARY" : "USER_INITIATED_SWITCHOVER"} duration_sec=${randInt(8, 95)}`;
  } else {
    const MSGS = {
      error: [
        "Aurora failover initiated: primary instance unhealthy",
        "ERROR 2013: Lost connection to MySQL",
        "Replica lag exceeded 60 seconds",
        "Deadlock detected",
        "Storage auto-scaling failed",
      ],
      warn: [
        "Aurora replica lag: 8.4 seconds",
        "Long-running query: 45s",
        "Connections approaching max_connections",
        "Slow query: full table scan",
      ],
      info: [
        "Aurora auto-scaling: adding replica",
        "Multi-AZ failover completed in 22s",
        "Global Database replication lag: 0.8s",
        "Cluster endpoint updated",
      ],
    };
    level = isErr ? "error" : Math.random() < 0.12 ? "warn" : "info";
    message = rand(MSGS[level]);
  }
  const durationSec = isErr ? randInt(5, 300) : randInt(1, 60);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "aurora" },
    },
    aws: {
      aurora: {
        cluster_id: cluster,
        instance_id: instanceId,
        engine,
        engine_version: engine.includes("mysql") ? "8.0.36" : "15.4",
        replica_lag_seconds: isErr ? randInt(30, 3600) : Number(randFloat(0, 5)),
        db_connections: randInt(10, isErr ? 1000 : 500),
        max_connections: 1000,
        failover_in_progress: isErr && Math.random() > 0.5,
        metrics: {
          AuroraBinlogReplicaLag: { avg: randInt(0, isErr ? 3600 : 10) },
          AuroraGlobalDBReplicatedWriteIO: { sum: randInt(0, 1e8) },
          AuroraGlobalDBDataTransferBytes: { sum: randInt(0, 1e9) },
          AuroraGlobalDBProgressLag: { avg: randInt(0, isErr ? 60000 : 1000) },
          BacktrackChangeRecordsCreationRate: { avg: randInt(0, 10000) },
          BacktrackChangeRecordsStored: { avg: randInt(0, 1e9) },
          BacktrackWindowActual: { avg: randInt(0, 86400) },
          BacktrackWindowAlert: { avg: isErr && Math.random() > 0.7 ? 1 : 0 },
          ServerlessDatabaseCapacity: { avg: Number(randFloat(0.5, 128)) },
          ACUUtilization: { avg: Number(randFloat(1, isErr ? 95 : 70)) },
        },
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["database"],
      dataset: "aws.aurora",
      provider: "rds.amazonaws.com",
      duration: durationSec * 1e9,
    },
    message,
    log: { level },
    ...(isErr
      ? {
          error: {
            code: "AuroraError",
            message: rand([
              "Aurora failover initiated: primary instance unhealthy",
              "ERROR 2013: Lost connection to MySQL",
              "Replica lag exceeded 60 seconds",
              "Deadlock detected",
              "Storage auto-scaling failed",
            ]),
            type: "db",
          },
        }
      : {}),
  };
}

function generateNeptuneLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const cluster = rand(["prod-neptune", "knowledge-graph", "fraud-graph", "recommendation-engine"]);
  const queryLang = rand(["Gremlin", "SPARQL", "openCypher"]);
  const dur = Number(randFloat(1, isErr ? 30000 : 5000));
  const QUERIES = {
    Gremlin: [
      "g.V().hasLabel('user').out('follows').count()",
      "g.V(userId).repeat(out('knows')).times(3).path()",
    ],
    SPARQL: [
      "SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 100",
      "SELECT ?entity WHERE { ?entity rdf:type :Product }",
    ],
    openCypher: [
      "MATCH (u:User)-[:FOLLOWS]->(f:User) RETURN count(f)",
      "MATCH (n)-[r]->(m) WHERE n.id=$id RETURN n,r,m",
    ],
  };
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "neptune" },
    },
    aws: {
      neptune: {
        cluster_id: cluster,
        query_language: queryLang,
        query: rand(QUERIES[queryLang as keyof typeof QUERIES]),
        duration_ms: Math.round(dur),
        http_status: isErr ? rand([400, 429, 500]) : 200,
        db_connections: randInt(1, isErr ? 500 : 200),
        error_code: isErr
          ? rand(["QueryTimeout", "ReadOnlyEngineException", "ConcurrentModificationException"])
          : null,
        metrics: {
          CPUUtilization: { avg: Number(randFloat(1, isErr ? 95 : 60)) },
          FreeableMemory: { avg: randInt(1e8, 8e9) },
          DatabaseConnections: { avg: randInt(1, isErr ? 500 : 200) },
          GremlinRequestsPerSec: {
            avg: Number(randFloat(0, queryLang === "Gremlin" ? 1000 : 0)),
          },
          SparqlRequestsPerSec: { avg: Number(randFloat(0, queryLang === "SPARQL" ? 500 : 0)) },
          ServerlessDBCapacity: { avg: Number(randFloat(1, 128)) },
        },
      },
    },
    event: {
      duration: dur * 1e6,
      outcome: isErr ? "failure" : "success",
      category: ["database"],
      dataset: "aws.neptune",
      provider: "neptune.amazonaws.com",
    },
    message: isErr
      ? `Neptune ${queryLang} FAILED after ${dur.toFixed(0)}ms: ${rand(["QueryTimeout", "ConcurrentModification"])}`
      : `Neptune ${queryLang}: ${dur.toFixed(0)}ms`,
    log: { level: isErr ? "error" : dur > 5000 ? "warn" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "QueryTimeout",
              "ReadOnlyEngineException",
              "ConcurrentModificationException",
            ]),
            message: "Neptune query failed",
            type: "db",
          },
        }
      : {}),
  };
}

function generateTimestreamLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const db = rand(["iot-metrics", "infra-metrics", "application-telemetry", "financial-ticks"]);
  const table = rand(["device_telemetry", "cpu_metrics", "api_latency", "sensor_readings"]);
  const op = rand(["WriteRecords", "Query", "Query", "DescribeTable"]);
  const dur = Number(randFloat(1, isErr ? 10000 : 2000));
  const records = isErr ? 0 : randInt(100, 50000);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "timestream" },
    },
    aws: {
      timestream: {
        database_name: db,
        table_name: table,
        operation: op,
        records_ingested: op === "WriteRecords" ? records : 0,
        rows_returned: op === "Query" ? randInt(0, 10000) : 0,
        duration_ms: Math.round(dur),
        error_code: isErr
          ? rand(["ThrottlingException", "ResourceNotFoundException", "RejectedRecordsException"])
          : null,
      },
    },
    event: {
      duration: dur * 1e6,
      outcome: isErr ? "failure" : "success",
      category: "database",
      dataset: "aws.timestream",
      provider: "timestream.amazonaws.com",
    },
    message: isErr
      ? `Timestream ${op} FAILED on ${db}.${table}: ${rand(["RejectedRecords", "Throttling", "Not found"])}`
      : `Timestream ${op} on ${db}.${table}: ${op === "WriteRecords" ? records + " records" : dur.toFixed(0) + "ms"}`,
    log: { level: isErr ? "error" : dur > 5000 ? "warn" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "ThrottlingException",
              "ResourceNotFoundException",
              "RejectedRecordsException",
            ]),
            message: "Timestream operation failed",
            type: "db",
          },
        }
      : {}),
  };
}

function generateQldbLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const ledger = rand([
    "vehicle-registrations",
    "supply-chain",
    "financial-records",
    "audit-trail",
  ]);
  const table = rand(["Vehicles", "Orders", "Transactions", "Users"]);
  const op = rand(["INSERT", "UPDATE", "SELECT", "CREATE_INDEX", "HISTORY"]);
  const dur = Number(randFloat(1, isErr ? 5000 : 500));
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "qldb" },
    },
    aws: {
      qldb: {
        ledger_name: ledger,
        table_name: table,
        operation: op,
        transaction_id: randId(22).toLowerCase(),
        document_id: randId(22).toLowerCase(),
        revision_hash: randId(44).toLowerCase(),
        duration_ms: Math.round(dur),
        error_code: isErr
          ? rand(["TransactionExpiredException", "OccConflictException", "InvalidSessionException"])
          : null,
      },
    },
    event: {
      duration: dur * 1e6,
      outcome: isErr ? "failure" : "success",
      category: "database",
      dataset: "aws.qldb",
      provider: "qldb.amazonaws.com",
    },
    message: isErr
      ? `QLDB ${op} on ${ledger}.${table} FAILED: ${rand(["OCC conflict", "Transaction expired"])}`
      : `QLDB ${op} on ${ledger}.${table}: ${dur.toFixed(0)}ms`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "TransactionExpiredException",
              "OccConflictException",
              "InvalidSessionException",
            ]),
            message: "QLDB transaction failed",
            type: "db",
          },
        }
      : {}),
  };
}

function generateKeyspacesLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const keyspace = rand(["prod_keyspace", "analytics", "user_data", "sensor_data"]);
  const table = rand(["users", "sessions", "time_series", "inventory"]);
  const op = rand(["SELECT", "INSERT", "UPDATE", "DELETE", "BATCH"]);
  const dur = Number(randFloat(1, isErr ? 5000 : 200));
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "keyspaces" },
    },
    aws: {
      keyspaces: {
        keyspace_name: keyspace,
        table_name: table,
        operation: op,
        read_capacity_units: isErr ? 0 : Number(randFloat(0.5, 50)),
        write_capacity_units: isErr ? 0 : Number(randFloat(0.5, 50)),
        rows_returned: op === "SELECT" ? randInt(0, 10000) : 0,
        duration_ms: Math.round(dur),
        cql_version: "3.11.2",
        error_code: isErr
          ? rand([
              "ProvisionedThroughputExceededException",
              "WriteConflictException",
              "TimeoutException",
            ])
          : null,
      },
    },
    event: {
      duration: dur * 1e6,
      outcome: isErr ? "failure" : "success",
      category: "database",
      dataset: "aws.keyspaces",
      provider: "cassandra.amazonaws.com",
    },
    message: isErr
      ? `Keyspaces ${op} on ${keyspace}.${table} FAILED: ${rand(["Throughput exceeded", "Write conflict", "Timeout"])}`
      : `Keyspaces ${op} on ${keyspace}.${table}: ${dur.toFixed(0)}ms`,
    log: { level: isErr ? "error" : dur > 1000 ? "warn" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "ProvisionedThroughputExceededException",
              "WriteConflictException",
              "TimeoutException",
            ]),
            message: "Keyspaces operation failed",
            type: "db",
          },
        }
      : {}),
  };
}

function generateMemoryDbLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const cluster = rand(["prod-memorydb", "session-store", "leaderboard", "rate-limiter"]);
  const cmd = rand(["GET", "SET", "ZADD", "ZRANGE", "HSET", "XADD", "SETEX", "INCR", "DEL"]);
  const lat = Number(randFloat(0.01, isErr ? 2000 : 50));
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "memorydb" },
    },
    aws: {
      memorydb: {
        cluster_name: cluster,
        node_name: `${cluster}-0001-001`,
        engine_version: "7.1",
        command: cmd,
        latency_us: lat,
        cache_hit_rate: isErr ? 0 : Number(randFloat(80, 99)),
        connected_clients: randInt(10, 500),
        used_memory_mb: randInt(256, 65536),
        replication_lag_ms: randInt(0, isErr ? 5000 : 100),
        error_code: isErr ? rand(["READONLY", "OOM", "WRONGTYPE"]) : null,
      },
    },
    event: {
      duration: lat * 1000,
      outcome: isErr ? "failure" : "success",
      category: "database",
      dataset: "aws.memorydb",
      provider: "memory-db.amazonaws.com",
    },
    message: isErr
      ? `MemoryDB ${cluster} ${cmd} FAILED: ${rand(["READONLY replica", "OOM", "WRONGTYPE"])}`
      : `MemoryDB ${cluster} ${cmd}: ${lat.toFixed(2)}us`,
    log: { level: isErr ? "error" : lat > 500 ? "warn" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand(["READONLY", "OOM", "WRONGTYPE"]),
            message: "MemoryDB command failed",
            type: "db",
          },
        }
      : {}),
  };
}

function generateRdsLog(ts: string, er: number): EcsDocument {
  // ~15% chance of generating an RDS Proxy event
  if (Math.random() < 0.15) {
    const r = rand(REGIONS);
    const a = randAccount();
    const e = Math.random() < er;
    const proxies = ["my-app-proxy", "api-proxy", "read-proxy", "writer-proxy"];
    const proxy = rand(proxies);
    const tg = rand(["default", "read-only", "writer"]);
    const connId = randInt(1000, 99999);
    const action = rand([
      "Connect",
      "Disconnect",
      "Query",
      "BorrowConnection",
      "ReturnConnection",
      "FailoverTarget",
    ]);
    const errCodes = [
      "ConnectionBorrowTimeout",
      "TargetNotFound",
      "InternalServiceError",
      "InvalidCredentials",
      "TooManyConnections",
    ];
    return {
      __dataset: "aws.rdsproxy",
      "@timestamp": ts,
      cloud: {
        provider: "aws",
        region: r,
        account: { id: a.id, name: a.name },
        service: { name: "rds-proxy" },
      },
      aws: {
        rdsproxy: {
          proxy_name: proxy,
          target_group: tg,
          db_user: rand(["app_user", "admin", "readonly_user", "migration_user"]),
          connection_id: connId,
          action,
          active_connections: randInt(1, e ? 500 : 100),
          max_connections: 200,
          borrow_timeout_ms: randInt(50, e ? 30000 : 500),
          client_connections: randInt(10, 300),
          error_code: e ? rand(errCodes) : null,
        },
      },
      event: { outcome: e ? "failure" : "success", duration: randInt(1e5, e ? 3e7 : 5e6) },
      message: e
        ? `RDS Proxy ${proxy}: ${action} failed — ${rand(errCodes)}`
        : `RDS Proxy ${proxy}: ${action} on ${tg} (conn ${connId})`,
    };
  }
  // ~10% chance of generating an RDS Custom event
  if (Math.random() < 0.1) {
    const r = rand(REGIONS);
    const a = randAccount();
    const e = Math.random() < er;
    const engine = rand(["custom-oracle-ee", "custom-sqlserver-ee", "custom-oracle-se2"]);
    const instance = rand(["orcl-prod-01", "sqlsrv-analytics", "orcl-migration", "sqlsrv-legacy"]);
    const ev = rand([
      "ApplyCustomPatch",
      "CreateCEV",
      "ModifyInstance",
      "CreateSnapshot",
      "RestoreFromSnapshot",
      "AutomationExecution",
    ]);
    const errMsgs = [
      "Patch incompatible with CEV version",
      "Insufficient storage for snapshot",
      "SSM automation failed",
      "OS patch conflict detected",
    ];
    return {
      __dataset: "aws.rdscustom",
      "@timestamp": ts,
      cloud: {
        provider: "aws",
        region: r,
        account: { id: a.id, name: a.name },
        service: { name: "rds-custom" },
      },
      aws: {
        rdscustom: {
          instance_id: instance,
          engine,
          cev_id: `cev-${randId(8).toLowerCase()}`,
          event_type: ev,
          automation_id: `exec-${randId(17).toLowerCase()}`,
          pause_automation: Math.random() < 0.1,
          os_patch_level: `${randInt(2023, 2025)}.${randInt(1, 12)}.${randInt(1, 30)}`,
        },
      },
      event: { outcome: e ? "failure" : "success", duration: randInt(5e5, e ? 6e8 : 3e8) },
      message: e
        ? `RDS Custom ${instance}: ${ev} failed — ${rand(errMsgs)}`
        : `RDS Custom ${instance}: ${ev} completed (${engine})`,
    };
  }
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const hasTrace = Math.random() < 0.35;
  const traceId = hasTrace ? randId(32) : null;
  const qt = Number(randFloat(0.001, isErr ? 30 : 2));
  const dbUser = rand(["appuser", "readonly", "admin", "replica", "dba", "migration_user"]);
  const instanceId = `prod-db-${rand(["primary", "replica", "analytics", "reporting"])}`;
  const engine = rand([
    "mysql",
    "mysql",
    "postgres",
    "postgres",
    "aurora-mysql",
    "aurora-postgresql",
  ]);
  const isPostgres = engine.includes("postgres");
  const instanceClass = rand([
    "db.t3.medium",
    "db.t3.large",
    "db.r5.large",
    "db.r5.xlarge",
    "db.r6g.xlarge",
    "db.r6g.2xlarge",
    "db.m5.large",
  ]);
  const useEnhancedMonitoring = Math.random() < 0.55;
  const dbName = rand(["appdb", "analytics", "users_db", "events_db", "ecommerce"]);
  const sourceIp = randIp();
  const pid = randInt(1000, 99999);

  // Real RDS CloudWatch log group naming: /aws/rds/instance/<id>/<log-type> or /aws/rds/cluster/<id>/<log-type>
  const isCluster = engine.startsWith("aurora");
  const logTypeByEngine: Record<string, string[]> = {
    mysql: ["error", "general", "slowquery", "audit"],
    "aurora-mysql": ["error", "general", "slowquery", "audit"],
    postgres: ["postgresql"],
    "aurora-postgresql": ["postgresql"],
  };
  const logTypes = logTypeByEngine[engine] || ["error"];
  const logType = rand(logTypes);
  const logGroup = isCluster
    ? `/aws/rds/cluster/${instanceId}/${logType}`
    : `/aws/rds/instance/${instanceId}/${logType}`;
  const logStream = instanceId;

  // Enhanced Monitoring (RDSOSMetrics) — OS-level metrics published every 1–60 s
  const osMetrics = useEnhancedMonitoring
    ? {
        cpuUtilization: (() => {
          const guest = Number(randFloat(0, 2));
          const irq = Number(randFloat(0, 1));
          const system = Number(randFloat(0.5, isErr ? 30 : 10));
          const wait = Number(randFloat(0, isErr ? 20 : 5));
          const user = Number(randFloat(1, isErr ? 60 : 40));
          const total = parseFloat(Math.min(100, guest + irq + system + wait + user).toFixed(1));
          const idle = parseFloat(Math.max(0, 100 - total).toFixed(1));
          return { guest, irq, system, wait, idle, user, total };
        })(),
        memory: {
          total: randInt(4e9, 64e9),
          free: randInt(isErr ? 100e6 : 1e9, 8e9),
          cached: randInt(500e6, 8e9),
          active: randInt(1e9, 16e9),
          inactive: randInt(500e6, 4e9),
          buffers: randInt(50e6, 500e6),
        },
        disk: {
          readIOsPS: Number(randFloat(0, 3000)),
          writeIOsPS: Number(randFloat(0, 3000)),
          readKbPS: Number(randFloat(0, 512000)),
          writeKbPS: Number(randFloat(0, 512000)),
          avgQueueLen: Number(randFloat(0, isErr ? 64 : 8)),
          await: Number(randFloat(0.1, isErr ? 200 : 20)),
        },
        network: {
          rx: randInt(0, 100e6),
          tx: randInt(0, 100e6),
        },
        numVCPUs: rand([2, 4, 8, 16, 32, 64]),
        uptime: `${randInt(0, 99)} days, ${randInt(0, 23)}:${randInt(0, 59).toString().padStart(2, "0")}:${randInt(0, 59).toString().padStart(2, "0")}`,
      }
    : null;

  const tableName = rand([
    "users",
    "orders",
    "products",
    "sessions",
    "events",
    "inventory",
    "transactions",
    "customers",
  ]);
  const tsFormatted = new Date(ts).toISOString().replace("T", " ").replace("Z", "");

  // Realistic log messages matching actual RDS log format per engine/log type
  let message: string;
  let dbStatement: string;

  if (isPostgres) {
    // PostgreSQL log format: timestamp UTC:host(port):user@db:[pid]:LOG/ERROR/FATAL: message
    const pgPrefix = `${tsFormatted} UTC:${sourceIp}(${randInt(30000, 65000)}):${dbUser}@${dbName}:[${pid}]:`;
    const pgStatements = [
      `SELECT * FROM ${tableName} WHERE id = ${randInt(1, 1000000)}`,
      `SELECT t1.*, t2.name FROM ${tableName} t1 JOIN customers t2 ON t1.customer_id = t2.id WHERE t1.created_at > now() - interval '1 day' ORDER BY t1.id LIMIT 100`,
      `INSERT INTO ${tableName} (name, email, created_at) VALUES ($1, $2, now())`,
      `UPDATE ${tableName} SET updated_at = now(), status = $1 WHERE id = $2`,
      `DELETE FROM ${tableName} WHERE created_at < now() - interval '90 days'`,
      `BEGIN; UPDATE inventory SET quantity = quantity - $1 WHERE product_id = $2 AND quantity >= $1; COMMIT;`,
    ];
    dbStatement = rand(pgStatements);

    if (isErr) {
      message = rand([
        `${pgPrefix}ERROR:  deadlock detected\nDETAIL:  Process ${pid} waits for ShareLock on transaction ${randInt(100000, 9999999)}; blocked by process ${randInt(1000, 99999)}.\nProcess ${randInt(1000, 99999)} waits for ShareLock on transaction ${randInt(100000, 9999999)}; blocked by process ${pid}.\nHINT:  See server log for query details.\nCONTEXT:  while updating tuple (${randInt(0, 100)},${randInt(1, 50)}) in relation "${tableName}"\nSTATEMENT:  ${dbStatement}`,
        `${pgPrefix}FATAL:  too many connections for role "${dbUser}"\nDETAIL:  The server currently has ${randInt(90, 120)} connections to database "${dbName}" from role "${dbUser}".`,
        `${pgPrefix}ERROR:  relation "${rand(["nonexistent_table", "old_table", "temp_" + tableName])}" does not exist at character ${randInt(15, 80)}\nSTATEMENT:  SELECT * FROM nonexistent_table`,
        `${pgPrefix}FATAL:  password authentication failed for user "${dbUser}"`,
        `${pgPrefix}ERROR:  canceling statement due to statement timeout\nSTATEMENT:  ${dbStatement}`,
        `${pgPrefix}ERROR:  could not extend file "base/${randInt(10000, 99999)}/${randInt(10000, 99999)}": No space left on device\nHINT:  Check free disk space.`,
        `${pgPrefix}LOG:  checkpoints are occurring too frequently (${randInt(5, 29)} seconds apart)\nHINT:  Consider increasing the configuration parameter "max_wal_size".`,
      ]);
    } else if (logType === "postgresql" && Math.random() < 0.4) {
      // Slow query log style
      message = `${pgPrefix}LOG:  duration: ${(qt * 1000).toFixed(3)} ms  ${Math.random() < 0.3 ? "parse" : Math.random() < 0.5 ? "bind" : "execute"} <unnamed>: ${dbStatement}`;
    } else {
      message = rand([
        `${pgPrefix}LOG:  duration: ${(qt * 1000).toFixed(3)} ms  statement: ${dbStatement}`,
        `${pgPrefix}LOG:  connection authorized: user=${dbUser} database=${dbName} SSL enabled (protocol=TLSv1.3, cipher=TLS_AES_256_GCM_SHA384, bits=256)`,
        `${pgPrefix}LOG:  disconnection: session time: ${randInt(0, 24)}:${randInt(0, 59).toString().padStart(2, "0")}:${randInt(0, 59).toString().padStart(2, "0")}.${randInt(0, 999).toString().padStart(3, "0")} user=${dbUser} database=${dbName} host=${sourceIp} port=${randInt(30000, 65000)}`,
        `${pgPrefix}LOG:  checkpoint starting: time`,
        `${pgPrefix}LOG:  checkpoint complete: wrote ${randInt(100, 10000)} buffers (${Number(randFloat(0.1, 15)).toFixed(1)}%); 0 WAL file(s) added, ${randInt(0, 5)} removed, ${randInt(0, 10)} recycled; write=${Number(randFloat(0.1, 30)).toFixed(3)} s, sync=${Number(randFloat(0.001, 5)).toFixed(3)} s, total=${Number(randFloat(0.1, 35)).toFixed(3)} s; sync files=${randInt(10, 500)}, longest=${Number(randFloat(0.001, 2)).toFixed(3)} s, average=${Number(randFloat(0.001, 0.1)).toFixed(6)} s; distance=${randInt(1000, 500000)} kB, estimate=${randInt(1000, 500000)} kB`,
        `${pgPrefix}LOG:  automatic vacuum of table "${dbName}.public.${tableName}": index scans: ${randInt(0, 3)}, pages: ${randInt(0, 1000)} removed, ${randInt(100, 50000)} remain, ${randInt(0, 5000)} are dead but not yet removable`,
        `${pgPrefix}LOG:  automatic analyze of table "${dbName}.public.${tableName}"`,
      ]);
    }
  } else {
    // MySQL log formats vary by log type
    const mysqlStatements = [
      `SELECT * FROM ${tableName} WHERE id = ${randInt(1, 1000000)}`,
      `INSERT INTO ${tableName} (name, email) VALUES ('${rand(["alice", "bob", "carol"])}', '${rand(["a", "b", "c"])}@example.com')`,
      `UPDATE ${tableName} SET status = 'active' WHERE user_id = ${randInt(1, 100000)}`,
      `SELECT o.*, p.name FROM orders o INNER JOIN products p ON o.product_id = p.id WHERE o.created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)`,
    ];
    dbStatement = rand(mysqlStatements);

    if (logType === "slowquery") {
      const lockTime = Number(randFloat(0, isErr ? 5 : 0.01));
      const rowsSent = randInt(0, isErr ? 0 : 10000);
      const rowsExamined = randInt(rowsSent, rowsSent * 100 + 1);
      message = `# Time: ${tsFormatted}\n# User@Host: ${dbUser}[${dbUser}] @ ${sourceIp} [${sourceIp}]  Id: ${pid}\n# Query_time: ${qt.toFixed(6)}  Lock_time: ${lockTime.toFixed(6)} Rows_sent: ${rowsSent}  Rows_examined: ${rowsExamined}\nSET timestamp=${Math.floor(new Date(ts).getTime() / 1000)};\n${dbStatement};`;
    } else if (logType === "error") {
      if (isErr) {
        message = rand([
          `${tsFormatted} ${pid} [ERROR] [MY-${randInt(10000, 99999)}] [Repl] Replica SQL for channel '': Could not execute Write_rows event on table ${dbName}.${tableName}; Duplicate entry '${randInt(1, 100000)}' for key 'PRIMARY', Error_code: 1062; handler error HA_ERR_FOUND_DUPP_KEY; the event's master log ${instanceId}-bin.${randInt(1, 999).toString().padStart(6, "0")}, end_log_pos ${randInt(10000, 99999999)}`,
          `${tsFormatted} ${pid} [ERROR] [MY-${randInt(10000, 99999)}] [Server] InnoDB: The innodb_system tablespace must be at least ${randInt(10, 100)} MB. Current size: ${randInt(5, 9)} MB.`,
          `${tsFormatted} ${pid} [ERROR] [MY-${randInt(10000, 99999)}] [Server] Got error ${randInt(1, 200)} from storage engine`,
          `${tsFormatted} ${pid} [Warning] [MY-${randInt(10000, 99999)}] [Server] Aborted connection ${randInt(1000, 99999)} to db: '${dbName}' user: '${dbUser}' host: '${sourceIp}' (Got an error reading communication packets)`,
        ]);
      } else {
        message = rand([
          `${tsFormatted} ${pid} [Note] [MY-${randInt(10000, 99999)}] [Server] /rdsdbbin/mysql/bin/mysqld: ready for connections. Version: '8.0.${randInt(32, 40)}'  socket: '/tmp/mysql.sock'  port: 3306`,
          `${tsFormatted} ${pid} [Note] [MY-${randInt(10000, 99999)}] [InnoDB] Buffer pool(s) load completed at ${tsFormatted}`,
          `${tsFormatted} ${pid} [Note] [MY-${randInt(10000, 99999)}] [Server] Event Scheduler: Loaded ${randInt(0, 10)} events`,
        ]);
      }
    } else if (logType === "general") {
      message = `${tsFormatted}\t${pid} ${rand(["Query", "Connect", "Init DB", "Quit"])}\t${dbStatement}`;
    } else {
      // audit log
      message = `${tsFormatted},${sourceIp},${dbUser},${dbName},${pid},${randInt(10000, 99999)},QUERY,${dbStatement},0`;
    }
  }

  const cpuPct = Number(randFloat(1, isErr ? 95 : 60));
  const rdsErrCodes = [
    "DBInstanceNotFound",
    "DBInstanceAlreadyExists",
    "InvalidDBInstanceState",
    "InsufficientDBInstanceCapacity",
    "StorageQuotaExceeded",
    "DBParameterGroupNotFound",
    "DBSecurityGroupNotFound",
    "DBSnapshotAlreadyExists",
    "DBSubnetGroupDoesNotCoverEnoughAZs",
    "AuthorizationNotFound",
    "ProvisionedIopsNotAvailableInAZ",
    "OptionGroupNotFoundFault",
    "StorageTypeNotSupported",
  ];

  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "rds" },
    },
    aws: {
      dimensions: {
        DBInstanceIdentifier: instanceId,
        DatabaseClass: instanceClass,
        EngineName: engine,
        SourceRegion: region,
      },
      cloudwatch: { log_group: logGroup, log_stream: logStream },
      rds: {
        db_instance: {
          identifier: instanceId,
          class: instanceClass,
          engine_name: engine,
          engine_version: isPostgres
            ? `${rand(["14", "15", "16"])}.${randInt(1, 8)}`
            : `8.0.${randInt(32, 40)}`,
          arn: `arn:aws:rds:${region}:${acct.id}:db:${instanceId}`,
          status: isErr ? rand(["failed", "incompatible-parameters", "storage-full"]) : "available",
          role: rand(["instance", "read-replica"]),
          multi_az: Math.random() < 0.5,
          storage_type: rand(["gp3", "io1", "io2"]),
          allocated_storage_gb: rand([100, 200, 500, 1000, 2000]),
        },
        log_type: logType,
        cpu: { total: { pct: parseFloat((cpuPct / 100).toFixed(4)) } },
        freeable_memory: { bytes: randInt(1e8, 8e9) },
        free_storage: { bytes: randInt(1e9, 500e9) },
        database_connections: randInt(1, 500),
        read_io: { ops_per_sec: Number(randFloat(0, 3000)) },
        write_io: { ops_per_sec: Number(randFloat(0, 3000)) },
        latency: {
          read: Number(randFloat(0.001, isErr ? 0.5 : 0.02)),
          write: Number(randFloat(0.001, isErr ? 0.5 : 0.01)),
        },
        throughput: {
          read: randInt(1000, 1e8),
          write: randInt(1000, 1e8),
          network_receive: randInt(1000, 1e8),
          network_transmit: randInt(1000, 1e8),
        },
        replica_lag: { sec: Number(randFloat(0, isErr ? 10000 : 100)) },
        swap_usage: { bytes: randInt(0, 1e8) },
        disk_usage: { bin_log: { bytes: randInt(0, 1e9) } },
        ...(osMetrics ? { enhanced_monitoring: osMetrics } : {}),
      },
    },
    db: {
      user: { name: dbUser },
      name: dbName,
      statement: dbStatement,
      type: "sql",
    },
    source: { ip: sourceIp },
    event: {
      duration: qt * 1000000000,
      outcome: isErr ? "failure" : "success",
      category: ["database"],
      type: isErr ? ["error"] : ["info", "access"],
      dataset: "aws.rds",
      provider: "rds.amazonaws.com",
    },
    message: message,
    log: { level: isErr ? "error" : qt > 5 ? "warn" : "info" },
    ...(isErr
      ? { error: { code: rand(rdsErrCodes), message: message.split("\n")[0], type: "db" } }
      : {}),
    ...(hasTrace ? { trace: { id: traceId } } : {}),
    ...(hasTrace ? { transaction: { id: randId(16) } } : {}),
  };
}

function generateDaxLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const clusterName = rand(["prod-dax", "analytics-dax", "session-dax"]);
  const nodeId = `${clusterName}-${rand(["a", "b", "c"])}`;
  const operation = rand(["GetItem", "PutItem", "Query", "Scan", "BatchGetItem", "BatchWriteItem"]);
  const cacheHit = !isErr && Math.random() > 0.25;
  const itemSizeBytes = randInt(50, 102400);
  const requestLatencyMs = randInt(1, isErr ? 5000 : 50);
  const errorCode = isErr
    ? rand([
        "ItemCollectionSizeLimitExceededException",
        "ProvisionedThroughputExceededException",
        "RequestLimitExceeded",
        "ClusterNotFoundFault",
      ])
    : null;
  const consumedReadCapacityUnits = Number(randFloat(0.5, 5).toFixed(1));
  const tableName = rand(["users", "sessions", "products", "orders", "inventory"]);
  const action = rand([
    "CacheHit",
    "CacheMiss",
    "WriteThrough",
    "Invalidation",
    "NodeRestart",
    "ClusterScaling",
  ]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "dax" },
    },
    aws: {
      dimensions: { ClusterName: clusterName, NodeId: nodeId },
      dax: {
        cluster_name: clusterName,
        node_id: nodeId,
        operation,
        cache_hit: cacheHit,
        item_size_bytes: itemSizeBytes,
        request_latency_ms: requestLatencyMs,
        consumed_read_capacity_units: consumedReadCapacityUnits,
        table_name: tableName,
        ...(isErr ? { error_code: errorCode } : {}),
      },
    },
    event: {
      action,
      outcome: isErr ? "failure" : "success",
      category: ["database"],
      dataset: "aws.dax",
      provider: "dax.amazonaws.com",
      duration: requestLatencyMs * 1e6,
    },
    message: isErr
      ? `DAX ${clusterName}: ${operation} failed — ${errorCode}`
      : `DAX ${clusterName}: ${operation} ${cacheHit ? "CACHE_HIT" : "CACHE_MISS"} ${requestLatencyMs}ms`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? { error: { code: errorCode, message: `DAX ${operation} failed`, type: "database" } }
      : {}),
  };
}

function generateNeptuneAnalyticsLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const graphId = `g-${randId(9).toLowerCase()}`;
  const queryId = `query-${randId(8).toLowerCase()}`;
  const algorithm = rand([
    "PageRank",
    "BetweennessCentrality",
    "LouvainCommunityDetection",
    "LabelPropagation",
    "ShortestPath",
  ]);
  const nodesProcessed = randInt(1000, 5000000);
  const edgesProcessed = randInt(5000, 50000000);
  const durationMs = isErr ? randInt(30000, 300000) : randInt(100, 60000);
  const errorCode = rand(["GraphAlgorithmTimeout", "InsufficientGraphCapacity"]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "neptune-graph" },
    },
    aws: {
      dimensions: { GraphId: graphId },
      neptuneanalytics: {
        graph_id: graphId,
        query_id: queryId,
        algorithm,
        metrics: {
          nodes_processed: nodesProcessed,
          edges_processed: edgesProcessed,
          duration_ms: durationMs,
        },
        error_code: isErr ? errorCode : null,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["database"],
      dataset: "aws.neptuneanalytics",
      provider: "neptune-graph.amazonaws.com",
      duration: durationMs * 1e6,
    },
    data_stream: { type: "logs", dataset: "aws.neptuneanalytics", namespace: "default" },
    message: isErr
      ? `Neptune Analytics graph ${graphId}: ${errorCode} running ${algorithm}`
      : `Neptune Analytics graph ${graphId}: ${algorithm} processed ${nodesProcessed} nodes, ${edgesProcessed} edges in ${durationMs}ms`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: errorCode,
            message: `Neptune Analytics ${algorithm} failed on graph ${graphId}`,
            type: "database",
          },
        }
      : {}),
  };
}

function generateAuroraDsqlLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const clusterId = `dsql-${randId(10).toLowerCase()}`;
  const linkedClusterArns = [
    `arn:aws:dsql:us-east-1:${acct.id}:cluster/dsql-${randId(8).toLowerCase()}`,
    `arn:aws:dsql:us-west-2:${acct.id}:cluster/dsql-${randId(8).toLowerCase()}`,
  ].slice(0, randInt(1, 2));
  const transactionId = `txn-${randId(12).toLowerCase()}`;
  const regionMode = rand(["primary", "replica"]);
  const tps = isErr ? 0 : Number(randFloat(10, 10000));
  const storageGb = Number(randFloat(1, 500));
  const replicationLagMs = regionMode === "replica" ? randInt(1, isErr ? 5000 : 100) : 0;
  const errorCode = rand(["ConflictError", "TransactionAborted"]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "dsql" },
    },
    aws: {
      dimensions: { ClusterId: clusterId, RegionMode: regionMode },
      auroradsql: {
        cluster_id: clusterId,
        linked_cluster_arns: linkedClusterArns,
        transaction_id: transactionId,
        region_mode: regionMode,
        metrics: {
          transactions_per_sec: tps,
          storage_used_gb: storageGb,
          replication_lag_ms: replicationLagMs,
        },
        error_code: isErr ? errorCode : null,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["database"],
      dataset: "aws.auroradsql",
      provider: "dsql.amazonaws.com",
      duration: randInt(1, isErr ? 5000 : 200) * 1e6,
    },
    data_stream: { type: "logs", dataset: "aws.auroradsql", namespace: "default" },
    message: isErr
      ? `Aurora DSQL cluster ${clusterId}: ${errorCode} (${regionMode})`
      : `Aurora DSQL cluster ${clusterId}: ${tps.toFixed(0)} TPS, storage=${storageGb.toFixed(1)}GB, replication_lag=${replicationLagMs}ms`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: errorCode,
            message: `Aurora DSQL transaction failed on cluster ${clusterId}`,
            type: "database",
          },
        }
      : {}),
  };
}

export {
  generateDynamoDbLog,
  generateElastiCacheLog,
  generateRedshiftLog,
  generateOpenSearchLog,
  generateDocumentDbLog,
  generateAuroraLog,
  generateNeptuneLog,
  generateTimestreamLog,
  generateQldbLog,
  generateKeyspacesLog,
  generateMemoryDbLog,
  generateRdsLog,
  generateDaxLog,
  generateNeptuneAnalyticsLog,
  generateAuroraDsqlLog,
};
