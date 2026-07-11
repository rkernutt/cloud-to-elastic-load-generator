import {
  rand,
  randInt,
  randFloat,
  randId,
  randHexId,
  randIp,
  randAccount,
  REGIONS,
  randIamUser,
  randPersonEmail,
} from "../../helpers";
import type { EcsDocument } from "./types.js";

function generateDynamoDbLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const hasTrace = Math.random() < 0.4;
  const traceId = hasTrace ? randHexId(32) : null;
  const tables = ["users", "sessions", "products", "orders", "events", "cache"];
  const table = rand(tables);
  const scenario = rand([
    "table_crud",
    "stream_processing",
    "global_table_replication",
    "backup_restore",
    "capacity_autoscale",
    "ttl_deletion",
  ] as const);
  const opsByScenario: Record<typeof scenario, string[]> = {
    table_crud: [
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
    ],
    stream_processing: ["GetRecords", "GetShardIterator", "DescribeStream", "ListStreams"],
    global_table_replication: [
      "UpdateTable",
      "DescribeTable",
      "DescribeGlobalTable",
      "CreateGlobalTable",
    ],
    backup_restore: [
      "CreateBackup",
      "RestoreTableFromBackup",
      "DescribeBackup",
      "DescribeContinuousBackups",
      "UpdateContinuousBackups",
    ],
    capacity_autoscale: ["DescribeScalingPolicies", "RegisterScalableTarget", "DescribeTable"],
    ttl_deletion: ["UpdateTimeToLive", "DescribeTimeToLive", "DeleteItem"],
  };
  const op = rand(opsByScenario[scenario]);
  const rcu = Number(randFloat(0.5, isErr ? 500 : 50));
  const wcu = Number(randFloat(0.5, 50));
  const latencyMs = Math.round(Number(randFloat(0.5, isErr ? 8000 : 120)));
  const returnedItems = isErr ? 0 : randInt(0, op.includes("Batch") ? 500 : 100);
  const scenarioErrPools: Record<typeof scenario, string[]> = {
    table_crud: [
      "ConditionalCheckFailedException",
      "ItemCollectionSizeLimitExceededException",
      "ProvisionedThroughputExceededException",
      "TransactionConflictException",
      "ValidationException",
    ],
    stream_processing: [
      "TrimmedDataAccessException",
      "ExpiredIteratorException",
      "LimitExceededException",
      "InternalServerError",
    ],
    global_table_replication: [
      "LimitExceededException",
      "InternalServerError",
      "TableAlreadyExistsException",
      "ReplicaAlreadyExistsException",
      "ResourceInUseException",
    ],
    backup_restore: [
      "BackupInUseException",
      "BackupNotFoundException",
      "LimitExceededException",
      "TableNotFoundException",
    ],
    capacity_autoscale: [
      "LimitExceededException",
      "ValidationException",
      "ResourceNotFoundException",
    ],
    ttl_deletion: [
      "ConditionalCheckFailedException",
      "ValidationException",
      "ResourceNotFoundException",
    ],
  };
  const errForScenario = (): string =>
    rand(
      scenarioErrPools[scenario].concat([
        "ProvisionedThroughputExceededException",
        "TransactionConflictException",
        "ConditionalCheckFailedException",
        "ItemCollectionSizeLimitExceededException",
      ])
    );
  const errCodeResolved = isErr ? errForScenario() : null;
  const message = JSON.stringify({
    eventVersion: "1.1",
    eventSource: "dynamodb.amazonaws.com",
    eventName: op,
    awsRegion: region,
    requestParameters: {
      tableName: table,
      ...(scenario === "stream_processing"
        ? {
            streamArn: `arn:aws:dynamodb:${region}:${acct.id}:table/${table}/stream/${new Date(ts).toISOString()}`,
          }
        : {}),
    },
    responseElements: isErr
      ? null
      : { tableDescription: { tableName: table, tableStatus: "ACTIVE" } },
    ...(isErr
      ? {
          errorCode: errCodeResolved,
          errorMessage: `${errCodeResolved}: Operation ${op} failed on table ${table}`,
        }
      : {}),
    userIdentity: {
      type: "IAMUser",
      principalId: `${acct.id}:dynamodb-user`,
      arn: `arn:aws:iam::${acct.id}:user/dynamodb-user`,
    },
    eventTime: new Date(ts).toISOString(),
    consumedCapacity: {
      tableName: table,
      capacityUnits: rcu + wcu,
      readCapacityUnits: rcu,
      writeCapacityUnits: wcu,
    },
  });
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
        scenario,
        stream_shard_id:
          scenario === "stream_processing"
            ? `shardId-${String(randInt(100000000000, 999999999999)).padStart(12, "0")}`
            : null,
        global_table_name: scenario === "global_table_replication" ? `${table}-global` : null,
        backup_window: scenario === "backup_restore" ? `PT${randInt(1, 24)}H` : null,
        ttl_attribute:
          scenario === "ttl_deletion" ? rand(["expiresAt", "ttl", "expiration"]) : null,
        consumed_read_capacity_units: rcu,
        consumed_write_capacity_units: wcu,
        returned_item_count: returnedItems,
        latency_ms: latencyMs,
        items_count: randInt(0, 1000),
        structured_logging: true,
        error_code: isErr ? errCodeResolved : null,
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
    ...(isErr && errCodeResolved
      ? {
          error: {
            code: errCodeResolved,
            message:
              scenario === "stream_processing"
                ? `Streams ${op}: iterator or throughput issue on ${table}`
                : scenario === "global_table_replication"
                  ? `Global table ${op}: replication coordinator rejected request`
                  : scenario === "backup_restore"
                    ? `Backup/restore ${op} failed for ${table}`
                    : scenario === "capacity_autoscale"
                      ? `Scaling policy invocation failed (${op})`
                      : scenario === "ttl_deletion"
                        ? `TTL or conditional write failed (${op})`
                        : `DynamoDB ${op} failed (${scenario})`,
            type: "aws",
          },
        }
      : {}),
    ...(hasTrace ? { trace: { id: traceId } } : {}),
    ...(hasTrace ? { transaction: { id: randHexId(16) } } : {}),
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
      message: JSON.stringify({
        eventSource: "elasticache.amazonaws.com",
        eventName: ev,
        globalReplicationGroupId: globalDs,
        primaryRegion: r,
        secondaryRegions: secondaryRegions.filter((reg) => reg !== r),
        replicationLagMs: Math.round(randFloat(0.5, e ? 15000 : 50)),
        status: e ? "FAILED" : "COMPLETE",
        ...(e ? { errorMessage: rand(errMsgs) } : {}),
      }),
      ...(e
        ? {
            error: {
              code: rand([
                "GlobalReplicationGroupNotFoundFault",
                "InvalidGlobalReplicationGroupStateFault",
              ]),
              message: rand(errMsgs),
              type: "aws",
            },
          }
        : {}),
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
  const scenario = rand([
    "redis_command",
    "replication_group_failover",
    "snapshot_create",
    "scaling_event",
    "engine_update",
  ] as const);
  const apiOpByScenario: Record<typeof scenario, string> = {
    redis_command: "DataPlaneRedis",
    replication_group_failover: "FailoverShard",
    snapshot_create: "CreateSnapshot",
    scaling_event: "ModifyReplicationGroupShardConfiguration",
    engine_update: "ModifyReplicationGroup",
  };
  const apiOp = apiOpByScenario[scenario];
  const apiErrCodes = [
    "ReplicationGroupNotFoundFault",
    "CacheClusterNotFoundFault",
    "NodeQuotaForClusterExceededException",
    "InvalidReplicationGroupStateFault",
    "SnapshotAlreadyExistsFault",
    "InsufficientCacheClusterCapacityFault",
  ];
  const apiErrResolved = isErr && scenario !== "redis_command" ? rand(apiErrCodes) : null;
  const redisEngineErrCodes = ["LOADING", "READONLY", "OOM command not allowed"];
  const structuredJson =
    scenario !== "redis_command" && Math.random() < 0.45
      ? JSON.stringify({
          replicationGroupId,
          scenario,
          operation: apiOp,
          clusterId,
          ...(scenario === "snapshot_create"
            ? { snapshotName: `snap-${randHexId(10)}`, retention: randInt(1, 35) }
            : {}),
          ...(scenario === "scaling_event"
            ? { shardCount: randInt(2, 8), appliedStrategy: rand(["preferred", "none"]) }
            : {}),
          ...(scenario === "engine_update"
            ? {
                engineVersionTarget: rand(["7.1.0", "7.2.6"]),
                applyImmediately: Math.random() > 0.5,
              }
            : {}),
          status: isErr ? "FAILED" : "COMPLETE",
          timestamp: new Date(ts).toISOString(),
          ...(isErr
            ? { awsException: apiErrResolved, messagePlain: rand(redisEngineErrCodes) }
            : {}),
        })
      : null;
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
        scenario,
        api_operation: scenario === "redis_command" ? null : apiOp,
        command: scenario === "redis_command" ? cmd : null,
        latency_us: lat,
        cache_hit: !isErr && Math.random() > 0.3,
        connected_clients: randInt(10, 500),
        used_memory_mb: randInt(256, 16384),
      },
    },
    db: { type: "keyvalue", operation: scenario === "redis_command" ? cmd : apiOp },
    event: {
      duration: lat * 1000,
      outcome: isErr ? "failure" : "success",
      category: ["database", "network"],
      type: ["connection"],
      dataset: "aws.elasticache",
      provider: "elasticache.amazonaws.com",
    },
    message: (() => {
      const redisKey = rand(["user:*", "session:*", "idx:products:*"]);
      if (scenario === "redis_command") {
        return JSON.stringify({
          id: randInt(1, 999999),
          timestamp: Math.floor(new Date(ts).getTime()),
          duration: Math.round(lat),
          command: [cmd, redisKey],
          key: redisKey,
          clusterId,
          replicationGroupId,
          ...(isErr ? { error: rand(redisEngineErrCodes), status: "failed" } : { status: "ok" }),
        });
      }
      if (structuredJson) return structuredJson;
      return JSON.stringify({
        replicationGroupId,
        scenario,
        operation: apiOp,
        clusterId,
        timestamp: new Date(ts).toISOString(),
        status: isErr ? "FAILED" : "COMPLETE",
        ...(scenario === "snapshot_create"
          ? { snapshotName: `snap-${randHexId(10)}`, retention: randInt(1, 35) }
          : {}),
        ...(scenario === "scaling_event"
          ? { shardCount: randInt(2, 8), appliedStrategy: rand(["preferred", "none"]) }
          : {}),
        ...(scenario === "engine_update"
          ? {
              engineVersionTarget: rand(["7.1.0", "7.2.6"]),
              applyImmediately: Math.random() > 0.5,
            }
          : {}),
        ...(isErr ? { awsException: apiErrResolved } : {}),
      });
    })(),
    log: { level: isErr ? "error" : lat > 1000 ? "warn" : "info" },
    ...(isErr
      ? {
          error: {
            code:
              scenario === "redis_command"
                ? rand([
                    "CacheClusterNotFoundFault",
                    "ReplicationGroupNotFoundFault",
                    "NodeQuotaForClusterExceededException",
                  ])
                : (apiErrResolved ?? "ReplicationGroupNotFoundFault"),
            message:
              scenario === "redis_command"
                ? rand(redisEngineErrCodes)
                : `${apiOp} rejected for replication group ${replicationGroupId}`,
            type: "aws",
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
  const scenario = rand([
    "query_execution",
    "spectrum_scan",
    "concurrency_scaling",
    "maintenance_window",
    "wlm_queue",
    "connection_session",
  ] as const);
  const spectrumTable = `spectrum.${schema}.ext_${table}`;
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
  const spectrumQueries = [
    `SELECT event_id, payload FROM ${spectrumTable} WHERE dt='${new Date(ts).toISOString().slice(0, 10)}' LIMIT 100000`,
    `SELECT COUNT(*) FROM ${spectrumTable} s JOIN ${schema}.${table} l ON s.id = l.id`,
  ];
  const query =
    scenario === "spectrum_scan"
      ? rand(spectrumQueries)
      : scenario === "concurrency_scaling"
        ? `/* concurrency_scaling */ ${rand(queries)}`
        : rand(queries);
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

  const logType =
    scenario === "connection_session"
      ? "connectionlog"
      : scenario === "maintenance_window"
        ? "userlog"
        : "useractivitylog";
  const logGroup = `/aws/redshift/cluster/${clusterId}/${logType}`;
  const logStream = `${clusterId}/${logType}/${new Date(ts).toISOString().slice(0, 10)}`;

  const sourceIp = randIp();
  const sourcePort = randInt(1024, 65535);
  const queryType = query
    .trim()
    .replace(/\/\*[^*]*\*\//, "")
    .trim()
    .split(/\s+/)[0]
    .toUpperCase();
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
    if (isErr) {
      message = `connection to server at "${clusterId}.${region}.redshift.amazonaws.com" (${sourceIp}), port 5439 failed: FATAL: database "${dbName}" does not exist [ClusterNotFoundFault sim]`;
    }
  } else if (logType === "useractivitylog") {
    const tsUtc = new Date(ts).toISOString().replace("T", " ").replace("Z", " UTC");
    const wlmPrefix =
      scenario === "wlm_queue"
        ? `[WLM queue=${wlmQueue} slots=${wlmSlot} service_class=${randInt(6, 14)} wait_ms=${wlmWaitMs}] `
        : scenario === "concurrency_scaling"
          ? `[concurrency_scaling cluster_used cs-${randInt(1, 5)} s3_scanned_gb=${Number(randFloat(1, 400)).toFixed(1)}] `
          : "";
    message = `'${tsUtc} [ db=${dbName} user=${dbUser} pid=${pid} userid=${randInt(100, 999)} xid=${xid} ]' LOG: ${wlmPrefix}${query}`;
  } else {
    const userlogAction =
      scenario === "maintenance_window"
        ? rand([
            `padb maintenance: track ${rand(["current", "trailing"])} — pending reboot node ${nodeId}`,
            `vacuum delete only scheduled during maintenance window mw-${randInt(100, 999)}`,
            `resize operation queued: ${nodeType} target_nodes=${numNodes}`,
          ])
        : rand([
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
    "ClusterNotFoundFault",
    "QueryExecutionFailed",
  ];
  const redshiftErrMsgs: Record<string, string> = {
    QUERY_TIMED_OUT: `ERROR: Query (${queryId}) cancelled by the system. Maximum query time exceeded.`,
    DISK_FULL: `ERROR: Disk Full on ${nodeId}: Cannot write to temp space. (${queryId})`,
    SERIALIZABLE_ISOLATION_VIOLATION: `ERROR: 1023 DETAIL: Serializable isolation violation on table ${schema}.${table}`,
    LOCK_TIMEOUT: `ERROR: Lock timeout on table ${schema}.${table}: ${dbUser} waiting for AccessExclusiveLock`,
    OUT_OF_MEMORY: `ERROR: ${queryId}: out of memory. (${nodeId})`,
    PERMISSION_DENIED: `ERROR: permission denied for relation ${schema}.${table}`,
    COPY_LOAD_ERROR: `ERROR: Load into table '${table}' failed.  Check 'stl_load_errors' for details.`,
    INTERNAL_ERROR: `ERROR: Spectrum Scan Error (${queryId}) on ${spectrumTable}`,
    ClusterNotFoundFault: `ERROR: Cluster '${clusterId}' not found (DescribeClusters)`,
    QueryExecutionFailed: `ERROR: Statement ${queryId} failed: ${scenario === "spectrum_scan" ? "Spectrum nested query abort" : "Execution stopping after parse"}`,
  };
  const errCode = isErr
    ? scenario === "connection_session"
      ? "ClusterNotFoundFault"
      : scenario === "spectrum_scan"
        ? rand(["QueryExecutionFailed", "INTERNAL_ERROR", "PERMISSION_DENIED"])
        : rand(redshiftErrCodes.filter((c) => c !== "ClusterNotFoundFault"))
    : null;

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
        scenario,
        spectrum_external_table: scenario === "spectrum_scan" ? spectrumTable : null,
        concurrency_scaling: scenario === "concurrency_scaling",
        maintenance_window_active: scenario === "maintenance_window",
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
      },
    },
    db: { user: { name: dbUser }, name: dbName, statement: query, type: "sql" },
    source: { ip: sourceIp, port: sourcePort },
    event: {
      duration: dur * 1e9,
      outcome: isErr ? "failure" : "success",
      category: ["database"],
      type: ["access"],
      dataset: "aws.redshift",
      provider: "redshift.amazonaws.com",
    },
    message:
      isErr && errCode && logType === "useractivitylog" && Math.random() < 0.45
        ? `${message}\n${redshiftErrMsgs[errCode]}`
        : message,
    log: { level: isErr ? "error" : dur > 60 ? "warn" : "info" },
    ...(isErr && errCode
      ? {
          error: {
            code: errCode,
            message: redshiftErrMsgs[errCode] || "Redshift query failed",
            type: "aws",
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
    "index_rotation",
    "snapshot_lifecycle",
    "blue_green_deploy",
    "warm_migration",
  ]);
  const querySource = {
    query: {
      bool: {
        filter: [{ range: { "@timestamp": { gte: "now-1h" } } }],
        must: [{ match: { "service.name": "checkout" } }],
      },
    },
    size: 500,
  };
  const awsOsErrCodes = [
    "ClusterBlockException",
    "SnapshotMissingException",
    "IndexNotFoundException",
    "SearchPhaseExecutionException",
    "SnapshotRestoreException",
  ];
  const resolvedOsErr = isErr ? rand(awsOsErrCodes) : null;
  const tsIso = new Date(ts).toISOString();
  let operation = op;
  let logExtras: Record<string, unknown> = {};
  let messagePayload: Record<string, unknown>;
  if (variant === "index_mgmt") {
    operation = rand(["create_index", "delete_index", "close_index", "open_index"]);
    messagePayload = {
      type: "cluster_index_management",
      timestamp: tsIso,
      cluster: domainName,
      action: operation,
      index: idx,
      acknowledged: !isErr,
    };
  } else if (variant === "allocation") {
    operation = "shard_allocation";
    const allocationExplanation = isErr ? "NO_VALID_SHARD_COPY" : "ALLOCATED";
    messagePayload = {
      type: "shard_allocation",
      timestamp: tsIso,
      index: idx,
      shard: randInt(0, 9),
      node: `i-${randHexId(17)}`,
      reason: "CLUSTER_RECOVERED",
      allocation_explanation: allocationExplanation,
    };
    logExtras = { allocation_explanation: allocationExplanation };
  } else if (variant === "cluster_health") {
    operation = "cluster_health";
    const health = isErr ? rand(["red", "yellow"]) : "green";
    messagePayload = {
      type: "cluster_health",
      timestamp: tsIso,
      status: health,
      active_shards: randInt(40, 200),
      relocating_shards: randInt(0, 5),
      unassigned_shards: isErr ? randInt(1, 20) : 0,
    };
    logExtras = { cluster_health: health };
  } else if (variant === "slow_query") {
    operation = "slow_search";
    messagePayload = {
      type: "index_search_slowlog",
      timestamp: tsIso,
      index: idx,
      took_millis: Math.round(dur),
      search_type: "QUERY_THEN_FETCH",
      total_shards: totalShards,
      source: querySource,
      latency_ms: Math.round(dur),
      status: isErr ? "failed" : "success",
    };
    logExtras = { slow_query_source: JSON.stringify(querySource) };
  } else if (variant === "gc") {
    operation = "jvm_gc";
    messagePayload = {
      type: "jvm_gc",
      timestamp: tsIso,
      node: rand(["data-0", "master-1", "ingest-2"]),
      gc_overhead_ms: Number(randFloat(200, isErr ? 5000 : 800).toFixed(1)),
      collection_interval_ms: 1000,
    };
    logExtras = { gc_event: true };
  } else if (variant === "circuit_breaker") {
    operation = "circuit_breaker";
    messagePayload = {
      type: "circuit_breaker",
      timestamp: tsIso,
      node: rand(["data-0", "data-1"]),
      breaker: "parent",
      bytes_requested_mb: randInt(512, 4096),
      limit_mb: randInt(256, 2048),
      status: "tripped",
    };
    logExtras = { circuit_breaker: "parent" };
  } else if (variant === "index_rotation") {
    operation = "rollover_index";
    const newIdx = `${idx}-${tsIso.slice(0, 10).replace(/-/g, ".")}-000001`;
    messagePayload = isErr
      ? {
          acknowledged: false,
          error: {
            type: resolvedOsErr,
            reason: `rollover for [${idx}] failed: rollover target already exists`,
          },
        }
      : {
          type: "ilm_rollover",
          timestamp: tsIso,
          index: idx,
          new_index: newIdx,
          conditions: { max_age: "30d", min_docs: randInt(1e6, 5e7) },
          met: true,
        };
    logExtras = {
      ilm_policy: rand(["logs-policy", "metrics-ilm", "traces-hot-warm"]),
      new_index: newIdx,
    };
  } else if (variant === "snapshot_lifecycle") {
    operation = rand(["CREATE_SNAPSHOT", "DELETE_SNAPSHOT"]);
    messagePayload = {
      type: "slm_snapshot",
      timestamp: tsIso,
      repository: rand(["daily-snap", "cs-automated"]),
      snapshot: `${idx}-snapshot-${randId(6)}`,
      state: isErr ? "FAILED" : "SUCCESS",
    };
    logExtras = {
      snapshot_repository: rand(["s3-repo-prod", "fs-backup"]),
      slm_retention_days: randInt(7, 90),
    };
  } else if (variant === "blue_green_deploy") {
    operation = "blue_green_deploy";
    messagePayload = {
      type: "blue_green_deploy",
      timestamp: tsIso,
      domain: domainName,
      changeId: randId(10),
      status: isErr ? "failed" : "succeeded",
      step: rand(["CREATE_NEW_ENV", "MIGRATE_SHARDS", "CUTOVER"]),
    };
    logExtras = {
      deployment_type: "BlueGreen",
      configuration_change_status: isErr ? "failed" : "completed",
    };
  } else if (variant === "warm_migration") {
    operation = "migrate_to_warm_tier";
    messagePayload = isErr
      ? {
          type: "warm_migration",
          index: idx,
          status: "blocked",
          error: { type: resolvedOsErr },
        }
      : {
          type: "warm_migration",
          timestamp: tsIso,
          index: idx,
          shard: randInt(0, 5),
          target_node: `warm-${randInt(0, 3)}`,
          status: "relocated",
        };
    logExtras = { warm_tier_enabled: true, ultra_warm: Math.random() > 0.5 };
  } else {
    messagePayload = isErr
      ? {
          status,
          error: { type: resolvedOsErr, reason: `OpenSearch ${op} on ${idx} rejected` },
        }
      : {
          type: "http_request",
          timestamp: tsIso,
          method: op,
          index: idx,
          took_millis: Math.round(dur),
          status,
          latency_ms: Math.round(dur),
        };
  }
  const message = JSON.stringify(messagePayload);
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
        scenario: variant,
        aws_api_operation: rand([
          "DescribeDomain",
          "UpdateDomainConfig",
          "ESHttpGet",
          "ESHttpPost",
        ]),
        ...logExtras,
      },
    },
    http: { response: { status_code: status } },
    event: {
      duration: dur * 1e6,
      outcome: isErr ? "failure" : "success",
      category: ["database"],
      type: ["access"],
      dataset: "aws.opensearch",
      provider: "es.amazonaws.com",
    },
    message,
    log: { level: isErr ? "error" : dur > 5000 ? "warn" : "info" },
    ...(isErr && resolvedOsErr
      ? {
          error: {
            code: resolvedOsErr,
            message:
              variant === "index_rotation"
                ? "ILM rollover could not complete"
                : variant === "warm_migration"
                  ? "Warm tier shard migration rejected"
                  : `OpenSearch ${operation} failed on ${idx}`,
            type: "aws",
          },
        }
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
      },
    },
    db: { name: "appdb", operation: op, type: "document" },
    event: {
      duration: dur * 1e6,
      outcome: isErr ? "failure" : "success",
      category: ["database"],
      type: ["access"],
      dataset: "aws.docdb",
      provider: "docdb.amazonaws.com",
    },
    message: JSON.stringify({
      atype: isErr ? "authCheck" : op,
      ts: { $date: new Date(ts).toISOString() },
      uuid: { $binary: { base64: randId(16), subType: "04" } },
      local: { ip: randIp(), port: randInt(1024, 65535) },
      remote: { ip: randIp(), port: randInt(30000, 65000) },
      users: [{ user: randIamUser(), db: "appdb" }],
      param: {
        command: {
          op,
          ns: `appdb.${col}`,
          ...(op === "find" ? { filter: { status: "active" } } : {}),
        },
        latency_ms: Math.round(dur),
        documentsAffected: isErr ? 0 : randInt(1, 1000),
      },
      result: isErr
        ? rand(["CursorNotFound", "DuplicateKey", "WriteConflict", "ExceededTimeLimit"])
        : 0,
    }),
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
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["database"],
      type: ["access"],
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
  const query = rand(QUERIES[queryLang as keyof typeof QUERIES]);
  const neptuneErr = isErr
    ? rand(["QueryTimeout", "ReadOnlyEngineException", "ConcurrentModificationException"])
    : null;
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
        query,
        duration_ms: Math.round(dur),
        http_status: isErr ? rand([400, 429, 500]) : 200,
        db_connections: randInt(1, isErr ? 500 : 200),
        error_code: neptuneErr,
      },
    },
    event: {
      duration: dur * 1e6,
      outcome: isErr ? "failure" : "success",
      category: ["database"],
      type: ["access"],
      dataset: "aws.neptune",
      provider: "neptune.amazonaws.com",
    },
    message: JSON.stringify({
      eventType: "neptune_audit",
      clusterId: cluster,
      queryLanguage: queryLang,
      query,
      latency_ms: Math.round(dur),
      status: isErr ? "failed" : "success",
      ...(isErr ? { errorCode: neptuneErr } : {}),
    }),
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
      category: ["database"],
      type: ["access"],
      dataset: "aws.timestream",
      provider: "timestream.amazonaws.com",
    },
    message: JSON.stringify({
      eventType: op === "WriteRecords" ? "timestream_write" : "timestream_query",
      databaseName: db,
      tableName: table,
      operation: op,
      latency_ms: Math.round(dur),
      status: isErr ? "failed" : "success",
      ...(op === "WriteRecords"
        ? { recordsIngested: records }
        : { rowsReturned: randInt(0, 10000) }),
      ...(isErr
        ? {
            errorCode: rand([
              "ThrottlingException",
              "ResourceNotFoundException",
              "RejectedRecordsException",
            ]),
          }
        : {}),
    }),
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
      category: ["database"],
      type: ["access"],
      dataset: "aws.keyspaces",
      provider: "cassandra.amazonaws.com",
    },
    message: JSON.stringify({
      eventType: "cql_operation",
      keyspace,
      table,
      operation: op,
      query: `${op} FROM ${keyspace}.${table} WHERE id = ?`,
      latency_ms: Math.round(dur),
      status: isErr ? "failed" : "success",
      cqlVersion: "3.11.2",
      ...(isErr
        ? {
            errorCode: rand([
              "ProvisionedThroughputExceededException",
              "WriteConflictException",
              "TimeoutException",
            ]),
          }
        : {}),
    }),
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
      category: ["database"],
      type: ["access"],
      dataset: "aws.memorydb",
      provider: "memory-db.amazonaws.com",
    },
    message: JSON.stringify({
      id: randInt(1, 999999),
      timestamp: Math.floor(new Date(ts).getTime()),
      duration: Math.round(lat),
      command: [cmd, rand(["user:*", "session:*", `leaderboard:${randInt(1, 9999)}`])],
      key: rand(["user:*", "session:*", `leaderboard:${randInt(1, 9999)}`]),
      clusterName: cluster,
      status: isErr ? "failed" : "ok",
      ...(isErr ? { error: rand(["READONLY", "OOM", "WRONGTYPE"]) } : {}),
    }),
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
    const proxies = ["api-proxy", "read-proxy", "writer-proxy", "analytics-proxy"];
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
  const traceId = hasTrace ? randHexId(32) : null;
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
      `INSERT INTO ${tableName} (name, email) VALUES ('${randIamUser()}', '${randPersonEmail()}')`,
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
    ...(hasTrace ? { transaction: { id: randHexId(16) } } : {}),
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
      type: ["access"],
      dataset: "aws.dax",
      provider: "dax.amazonaws.com",
      duration: requestLatencyMs * 1e6,
    },
    message: JSON.stringify({
      eventType: "dax_cluster_event",
      clusterName,
      nodeId,
      operation,
      tableName,
      cacheHit,
      itemSizeBytes,
      latency_ms: requestLatencyMs,
      consumedReadCapacityUnits,
      status: isErr ? "failed" : "success",
      ...(isErr ? { errorCode } : {}),
    }),
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
        error_code: isErr ? errorCode : null,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["database"],
      type: ["access"],
      dataset: "aws.neptuneanalytics",
      provider: "neptune-graph.amazonaws.com",
      duration: durationMs * 1e6,
    },
    data_stream: { type: "logs", dataset: "aws.neptuneanalytics", namespace: "default" },
    message: JSON.stringify({
      eventType: "neptune_analytics_query",
      graphId,
      queryId,
      algorithm,
      query: `${algorithm}(graph='${graphId}')`,
      latency_ms: durationMs,
      nodesProcessed,
      edgesProcessed,
      status: isErr ? "failed" : "success",
      ...(isErr ? { errorCode } : {}),
    }),
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
        error_code: isErr ? errorCode : null,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["database"],
      type: ["access"],
      dataset: "aws.auroradsql",
      provider: "dsql.amazonaws.com",
      duration: randInt(1, isErr ? 5000 : 200) * 1e6,
    },
    data_stream: { type: "logs", dataset: "aws.auroradsql", namespace: "default" },
    message: JSON.stringify({
      eventType: "aurora_dsql_event",
      clusterId,
      transactionId,
      regionMode,
      linkedClusterArns,
      query: `BEGIN TRANSACTION /* ${transactionId} */`,
      latency_ms: randInt(1, isErr ? 5000 : 200),
      status: isErr ? "failed" : "success",
      ...(isErr ? { errorCode } : {}),
    }),
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
  generateKeyspacesLog,
  generateMemoryDbLog,
  generateRdsLog,
  generateDaxLog,
  generateNeptuneAnalyticsLog,
  generateAuroraDsqlLog,
};
