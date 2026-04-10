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
    ? `DynamoDB ${op} ${table}: ${rand(dynamoErrCodes)}`
    : `DynamoDB ${op} ${table}: consumed ${rcu} RCU, ${wcu} WCU`;
  const useStructuredLogging = Math.random() < 0.55;
  const message = useStructuredLogging
    ? JSON.stringify({
        table,
        operation: op,
        consumedReadCapacityUnits: rcu,
        consumedWriteCapacityUnits: wcu,
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
      duration: randInt(1, isErr ? 500 : 50) * 1e6,
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
    message: isErr
      ? `Redis ${cmd} failed: ${rand(["LOADING", "READONLY", "OOM command not allowed"])}`
      : `Redis ${cmd} ${lat.toFixed(2)}us`,
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
  const queries = [
    "SELECT COUNT(*) FROM fact_events WHERE event_date >= CURRENT_DATE - 7",
    "INSERT INTO staging_orders SELECT * FROM raw_orders WHERE processed_at IS NULL",
    "COPY events FROM 's3://data-lake/events/2024/' IAM_ROLE 'arn:aws:iam::123456789:role/RedshiftS3' FORMAT AS PARQUET",
    "UNLOAD ('SELECT * FROM fact_sales WHERE sale_date = CURRENT_DATE') TO 's3://exports/sales/' IAM_ROLE 'arn:aws:iam::123456789:role/RedshiftS3' PARQUET ALLOWOVERWRITE",
    "VACUUM DELETE ONLY dim_products TO 95 PERCENT",
    "ANALYZE dim_customers PREDICATE COLUMNS",
  ];
  const dur = Number(randFloat(0.1, isErr ? 300 : 60));
  const dbUser = rand(["etl_user", "analyst", "bi_service", "dbt_runner"]);
  const clusterId = `prod-dw-${region}`;
  const redshiftErrCodes = [
    "AuthorizationAlreadyExists",
    "AuthorizationNotFound",
    "ClusterAlreadyExists",
    "ClusterNotFound",
    "ClusterParameterGroupNotFound",
    "ClusterSecurityGroupNotFound",
    "ClusterSubnetGroupNotFound",
    "HsmClientCertificateNotFound",
    "InsufficientClusterCapacity",
    "InvalidClusterState",
    "InvalidClusterSubnetGroupStateFault",
    "LimitExceededException",
    "SnapshotIdentifierNotFound",
  ];
  const nodeId = rand(["Leader", "Compute-0", "Compute-1"]);
  const queryType = rand(["SELECT", "SELECT", "INSERT", "COPY", "UNLOAD", "VACUUM", "ANALYZE"]);
  const wlmQueue = rand(["superuser", "etl_queue", "analyst_queue", "default_queue"]);
  const wlmWaitSec = isErr ? Number(randFloat(10, 300)) : Number(randFloat(0, 5));
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
      redshift: {
        cluster_id: clusterId,
        database: "analytics",
        user: dbUser,
        pid: randInt(10000, 99999),
        query_id: randInt(1000000, 9999999),
        duration_seconds: dur,
        rows_returned: isErr ? 0 : randInt(0, 5000000),
        error_code: isErr ? rand(redshiftErrCodes) : null,
        query_type: queryType,
        wlm: {
          queue_name: wlmQueue,
          queue_wait_seconds: wlmWaitSec,
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
    db: { user: { name: dbUser }, name: "analytics", statement: rand(queries), type: "sql" },
    event: {
      duration: dur * 1e9,
      outcome: isErr ? "failure" : "success",
      category: ["database"],
      dataset: "aws.redshift",
      provider: "redshift.amazonaws.com",
    },
    message: isErr
      ? `Redshift query failed after ${dur}s`
      : `Redshift query completed in ${dur.toFixed(2)}s`,
    log: { level: isErr ? "error" : dur > 60 ? "warn" : "info" },
    ...(isErr
      ? { error: { code: rand(redshiftErrCodes), message: "Redshift query failed", type: "db" } }
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
        operation: op,
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
    message: isErr
      ? `OpenSearch ${op} on ${idx} failed [${status}] after ${dur.toFixed(0)}ms`
      : `OpenSearch ${op} on ${idx}: ${dur.toFixed(0)}ms`,
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
  const level = isErr ? "error" : Math.random() < 0.12 ? "warn" : "info";
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
        instance_id: `${cluster}-instance-${randInt(1, 5)}`,
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
    message: rand(MSGS[level]),
    log: { level },
    ...(isErr ? { error: { code: "AuroraError", message: rand(MSGS.error), type: "db" } } : {}),
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
  const dbUser = rand(["appuser", "readonly", "admin", "replica"]);
  const instanceId = `prod-db-${rand(["primary", "replica", "analytics"])}`;
  const engine = rand(["mysql", "postgres", "aurora-mysql"]);
  const useEnhancedMonitoring = Math.random() < 0.55;

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

  const mysqlErrMessages = [
    `ERROR 1045 (28000): Access denied for user '${dbUser}'@'${randIp()}' (using password: YES)`,
    `ERROR 1213 (40001): Deadlock found when trying to get lock; try restarting transaction`,
    `[Warning] Aborted connection ${randInt(1000, 9999)} to db: 'mydb' user: '${dbUser}' host: '${randIp()}' (Got an error reading communication packets)`,
  ];
  const postgresErrMessages = [
    `FATAL: role "${dbUser}" does not exist`,
    `ERROR: deadlock detected`,
    `FATAL: password authentication failed for user "${dbUser}"`,
    `LOG: duration: ${Number(randFloat(1000, 30000)).toFixed(3)} ms statement: SELECT * FROM orders WHERE customer_id = ${randInt(1, 1e6)}`,
  ];
  const engineErrMessages = engine === "postgres" ? postgresErrMessages : mysqlErrMessages;
  const plainMessage = isErr
    ? rand(engineErrMessages)
    : engine === "postgres"
      ? `LOG: duration: ${(qt * 1000).toFixed(3)} ms statement: SELECT * FROM ${rand(["users", "orders", "products"])} WHERE id = ${randInt(1, 1e6)}`
      : `Query_time: ${qt.toFixed(6)}  Lock_time: ${Number(randFloat(0, 0.01)).toFixed(6)}  Rows_sent: ${randInt(0, 1000)}  Rows_examined: ${randInt(0, 100000)}`;
  const message = useEnhancedMonitoring
    ? JSON.stringify({
        instanceId,
        engine,
        userId: dbUser,
        queryTime: qt,
        error: isErr ? plainMessage : null,
        timestamp: new Date(ts).toISOString(),
        osMetrics,
      })
    : plainMessage;

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
        DatabaseClass: rand(["db.t3.medium", "db.r5.large", "db.r6g.xlarge"]),
        EngineName: engine,
        SourceRegion: region,
      },
      rds: {
        db_instance: {
          identifier: instanceId,
          class: rand(["db.t3.medium", "db.r5.large", "db.r6g.xlarge"]),
          engine_name: engine,
          arn: `arn:aws:rds:${region}:${acct.id}:db:${instanceId}`,
          status: isErr ? rand(["failed", "incompatible-parameters", "storage-full"]) : "available",
          role: rand(["instance", "read-replica"]),
        },
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
      },
    },
    db: {
      user: { name: dbUser },
      name: rand(["appdb", "analytics", "users", "events"]),
      statement:
        rand([
          "SELECT * FROM users WHERE",
          "INSERT INTO orders VALUES",
          "UPDATE products SET price",
          "DELETE FROM sessions WHERE",
        ]) + ` ${randId(6)}`,
      type: "sql",
    },
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
      ? { error: { code: rand(rdsErrCodes), message: rand(engineErrMessages), type: "db" } }
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
