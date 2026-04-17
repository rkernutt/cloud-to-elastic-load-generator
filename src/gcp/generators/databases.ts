import {
  type EcsDocument,
  rand,
  randInt,
  randFloat,
  randId,
  gcpCloud,
  makeGcpSetup,
  randZone,
  randLatencyMs,
  randSeverity,
  randPrincipal,
} from "./helpers.js";

function eventBlock(isErr: boolean, durationNs: number) {
  return {
    outcome: isErr ? ("failure" as const) : ("success" as const),
    duration: durationNs,
  };
}

export function generateCloudSqlLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const databaseType = rand(["POSTGRES", "MYSQL"] as const);
  const tier = rand([
    "db-f1-micro",
    "db-g1-small",
    "db-n1-standard-4",
    "db-custom-8-32768",
  ] as const);
  const instanceName = `sql-${rand(["prod", "stg"])}-${randId(4).toLowerCase()}`;
  const databaseId = rand(["app", "reporting", "auth", "inventory"]);
  const connectionCount = isErr ? randInt(80, 500) : randInt(2, 120);
  const cpuUtilization = isErr ? randFloat(0.88, 0.99) : randFloat(0.05, 0.62);
  const diskUtilization = isErr ? randFloat(0.94, 0.999) : randFloat(0.12, 0.72);
  const variant = isErr
    ? rand(["error", "slow", "audit", "lifecycle", "query"] as const)
    : rand(["query", "audit", "slow", "lifecycle", "query"] as const);

  let message = "";
  let severity = randSeverity(isErr);
  const durationMs = randLatencyMs(randInt(2, 800), isErr);
  const durationNs = durationMs * 1e6;

  if (variant === "query") {
    const stmt =
      databaseType === "POSTGRES"
        ? `LOG: statement: SELECT u.id, u.email FROM users u WHERE u.id = $1`
        : `LOG: statement: SELECT * FROM orders WHERE status = ? AND created_at > ?`;
    const durLine = `LOG: duration: ${randFloat(0.008, 45).toFixed(3)} ms`;
    message = isErr
      ? `${stmt}\n${durLine}\nERROR: canceling statement due to user request`
      : `${stmt}\n${durLine}`;
    severity = isErr ? "ERROR" : "INFO";
  } else if (variant === "audit") {
    const method = rand([
      "cloudsql.instances.create",
      "cloudsql.instances.update",
      "cloudsql.databases.create",
    ] as const);
    message = `protoPayload.methodName="${method}" protoPayload.resourceName="projects/${project.id}/instances/${instanceName}" principal_email="${randPrincipal(project)}"`;
    severity = "NOTICE";
  } else if (variant === "error") {
    message = rand([
      `FATAL: connection to server at "10.${randInt(1, 254)}.${randInt(0, 255)}.${randInt(1, 254)}", port 5432 failed: Connection refused`,
      `Out of memory: Kill process ${randInt(1000, 99999)} (postgres) score ${randInt(800, 999)} or sacrifice child`,
      `replication lag ${randInt(30, 900)}s exceeds threshold on replica ${instanceName}-replica-1`,
      `PANIC: could not write to file "base/pgsql_tmp/pgsql_tmp${randInt(1000, 9999)}": No space left on device`,
    ]);
    severity = "ERROR";
  } else if (variant === "slow") {
    const execMs = randFloat(1200, 8500).toFixed(1);
    message = `Slow query: duration=${execMs}ms rows_sent=${randInt(1, 5000)} rows_examined=${randInt(50_000, 2_000_000)} plan_rows=${randInt(10_000, 500_000)} database=${databaseId}`;
    severity = "WARNING";
  } else {
    message = rand([
      `Cloud SQL instance ${instanceName}: state changed to STOPPED (user initiated)`,
      `Cloud SQL instance ${instanceName}: failover completed; new primary zone=${randZone(region)}`,
      `Maintenance window started for ${instanceName}; applying security patch`,
      `Cloud SQL instance ${instanceName}: state changed to RUNNABLE`,
    ]);
    severity = "INFO";
  }

  return {
    "@timestamp": ts,
    severity,
    labels: {
      database_id: databaseId,
      instance_id: instanceName,
    },
    cloud: gcpCloud(region, project, "cloud-sql"),
    gcp: {
      cloud_sql: {
        instance_name: instanceName,
        database_id: databaseId,
        database_type: databaseType,
        tier,
        connection_count: connectionCount,
        cpu_utilization: Math.round(cpuUtilization * 1000) / 1000,
        disk_utilization: Math.round(diskUtilization * 1000) / 1000,
      },
    },
    event: eventBlock(isErr, durationNs),
    message,
  };
}

export function generateCloudSpannerLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const operation = rand(["read", "write", "commit", "rollback"] as const);
  const apiMethod = rand(["StreamingRead", "Commit", "BatchWrite", "ExecuteSql"] as const);
  const readColumns = randInt(1, 40);
  const bytesReturned = isErr ? randInt(0, 1000) : randInt(500, 50_000_000);
  const commitTimestamp = ts;
  const sessionCount = isErr ? randInt(0, 5) : randInt(10, 5000);
  const durationNs = randLatencyMs(randInt(5, 250), isErr) * 1e6;
  const instanceId = `spanner-${randId(6).toLowerCase()}`;
  const database = rand(["ledger", "catalog", "identity"]);
  const severity = randSeverity(isErr);
  const message = isErr
    ? `Cloud Spanner ${instanceId}/${database} ${operation} ABORTED — transaction conflict on commit`
    : `Cloud Spanner ${instanceId} ${database} ${apiMethod} op=${operation} bytes=${bytesReturned}`;

  return {
    "@timestamp": ts,
    severity,
    labels: { instance_id: instanceId, database },
    cloud: gcpCloud(region, project, "cloud-spanner"),
    gcp: {
      cloud_spanner: {
        instance_id: instanceId,
        database,
        operation,
        api_method: apiMethod,
        read_columns: readColumns,
        bytes_returned: bytesReturned,
        commit_timestamp: commitTimestamp,
        session_count: sessionCount,
      },
    },
    event: eventBlock(isErr, durationNs),
    message,
  };
}

export function generateFirestoreLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const dbOp = rand(["CREATE", "READ", "UPDATE", "DELETE", "QUERY"] as const);
  const documentsReturned = isErr ? 0 : randInt(1, 500);
  const indexUsed =
    dbOp === "QUERY" && !isErr
      ? rand(["composite_idx_users_email", "single_field_created_at"])
      : null;
  const readConsistency = rand(["strong", "eventual"] as const);
  const durationNs = randLatencyMs(randInt(3, 150), isErr) * 1e6;
  const databaseId = `(default)`;
  const collection = rand(["users", "orders", "sessions", "devices"]);
  const documentId = randId(12).toLowerCase();
  const severity = randSeverity(isErr);
  const message = isErr
    ? `Firestore ${collection}/${documentId} ${dbOp} FAILED — permission denied on database ${databaseId}`
    : `Firestore ${dbOp} ${collection}/${documentId} docs=${documentsReturned} consistency=${readConsistency}`;

  return {
    "@timestamp": ts,
    severity,
    labels: { database_id: databaseId, collection_id: collection },
    cloud: gcpCloud(region, project, "firestore"),
    gcp: {
      firestore: {
        database_id: databaseId,
        collection,
        document_id: documentId,
        operation: dbOp,
        documents_returned: documentsReturned,
        index_used: indexUsed,
        read_consistency: readConsistency,
      },
    },
    event: eventBlock(isErr, durationNs),
    message,
  };
}

export function generateBigtableLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const operation = rand(["ReadRows", "MutateRow", "CheckAndMutateRow", "SampleRowKeys"] as const);
  const rowsRead = isErr ? randInt(0, 5) : randInt(10, 500_000);
  const cellsModified =
    operation === "MutateRow" || operation === "CheckAndMutateRow" ? randInt(1, 10_000) : 0;
  const latencyMs = randLatencyMs(randInt(4, 120), isErr);
  const zone = randZone(region);
  const instanceId = `bt-${randId(5).toLowerCase()}`;
  const clusterId = `c-${randId(4).toLowerCase()}`;
  const tableName = `projects/${project.id}/instances/${instanceId}/tables/${rand(["events", "features", "telemetry"])}`;
  const severity = randSeverity(isErr);
  const message = isErr
    ? `Bigtable ${instanceId} ${operation} deadline exceeded after ${latencyMs.toFixed(1)}ms`
    : `Bigtable ${operation} ${instanceId}/${clusterId} rows=${rowsRead} cells=${cellsModified} ${latencyMs.toFixed(1)}ms`;

  return {
    "@timestamp": ts,
    severity,
    labels: { instance_id: instanceId, cluster_id: clusterId },
    cloud: gcpCloud(region, project, "bigtable"),
    gcp: {
      bigtable: {
        instance_id: instanceId,
        cluster_id: clusterId,
        table_name: tableName,
        operation,
        rows_read: rowsRead,
        cells_modified: cellsModified,
        latency_ms: latencyMs,
        zone,
      },
    },
    event: eventBlock(isErr, latencyMs * 1e6),
    message,
  };
}

export function generateAlloyDbLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const clusterName = `alloy-${rand(["oltp", "analytics"])}-${randId(4).toLowerCase()}`;
  const instanceName = `primary-${randId(4).toLowerCase()}`;
  const database = rand(["payments", "subscriptions", "reporting"]);
  const queryType = rand(["SELECT", "INSERT", "UPDATE", "DELETE"] as const);
  const queryDurationMs = randLatencyMs(randInt(2, 500), isErr);
  const rowsReturned = isErr ? 0 : randInt(1, 50_000);
  const cpuUtilization = isErr ? randFloat(0.92, 0.995) : randFloat(0.08, 0.72);
  const memoryUtilization = isErr ? randFloat(0.88, 0.99) : randFloat(0.35, 0.78);
  const connectionCount = isErr ? randInt(900, 5000) : randInt(5, 400);
  const severity = randSeverity(isErr);
  const message = isErr
    ? `AlloyDB ${clusterName} high CPU ${(cpuUtilization * 100).toFixed(1)}% — connection storm (${connectionCount})`
    : `AlloyDB ${instanceName}/${database} ${queryType} ${queryDurationMs.toFixed(1)}ms rows=${rowsReturned}`;

  return {
    "@timestamp": ts,
    severity,
    labels: { cluster_name: clusterName, instance_name: instanceName },
    cloud: gcpCloud(region, project, "alloydb"),
    gcp: {
      alloy_db: {
        cluster_name: clusterName,
        instance_name: instanceName,
        database,
        query_type: queryType,
        query_duration_ms: queryDurationMs,
        rows_returned: rowsReturned,
        cpu_utilization: Math.round(cpuUtilization * 1000) / 1000,
        memory_utilization: Math.round(memoryUtilization * 1000) / 1000,
        connection_count: connectionCount,
      },
    },
    event: eventBlock(isErr, queryDurationMs * 1e6),
    message,
  };
}

export function generateMemorystoreLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const tier = rand(["BASIC", "STANDARD_HA"] as const);
  const engine = rand(["REDIS", "MEMCACHED"] as const);
  const version =
    engine === "REDIS" ? rand(["6.2", "7.0", "7.2"] as const) : rand(["1.6"] as const);
  const operation = rand(["GET", "SET", "DEL", "EXPIRE"] as const);
  const memoryUsedMb = randInt(128, 26_000);
  const connectedClients = isErr ? randInt(2000, 8000) : randInt(5, 800);
  const evictedKeys = isErr ? randInt(1000, 500_000) : randInt(0, 200);
  const durationNs = randLatencyMs(randInt(1, 25), isErr) * 1e6;
  const instanceId = `mem-${randId(6).toLowerCase()}`;
  const severity = randSeverity(isErr);
  const message = isErr
    ? `Memorystore ${engine} ${instanceId} OOM risk — evicted_keys=${evictedKeys} clients=${connectedClients}`
    : `Memorystore ${engine} ${operation} ${instanceId} mem=${memoryUsedMb}MB clients=${connectedClients}`;

  return {
    "@timestamp": ts,
    severity,
    labels: { instance_id: instanceId },
    cloud: gcpCloud(region, project, "memorystore"),
    gcp: {
      memorystore: {
        instance_id: instanceId,
        tier,
        engine,
        version,
        operation,
        memory_used_mb: memoryUsedMb,
        connected_clients: connectedClients,
        evicted_keys: evictedKeys,
      },
    },
    event: eventBlock(isErr, durationNs),
    message,
  };
}

export function generateFirebaseRtdbLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const dbOp = rand(["read", "write", "update", "delete", "listen"] as const);
  const rulesEvaluated = randInt(1, 80);
  const bandwidthBytes = isErr ? randInt(100, 5000) : randInt(10_000, 200_000_000);
  const concurrentConnections = isErr ? randInt(8000, 50_000) : randInt(50, 4000);
  const durationNs = randLatencyMs(randInt(2, 80), isErr) * 1e6;
  const databaseUrl = `https://${project.id}-default-rtdb.firebaseio.com`;
  const path = `/${rand(["presence", "scores", "chat", "carts"])}/${randId(8).toLowerCase()}`;
  const severity = randSeverity(isErr);
  const message = isErr
    ? `Firebase RTDB ${path} ${dbOp} denied — rules evaluated=${rulesEvaluated} burst bandwidth`
    : `Firebase RTDB ${dbOp} ${path} bw=${bandwidthBytes}B rules=${rulesEvaluated} conns=${concurrentConnections}`;

  return {
    "@timestamp": ts,
    severity,
    labels: { database_url: databaseUrl },
    cloud: gcpCloud(region, project, "firebase-rtdb"),
    gcp: {
      firebase_rtdb: {
        database_url: databaseUrl,
        path,
        operation: dbOp,
        rules_evaluated: rulesEvaluated,
        bandwidth_bytes: bandwidthBytes,
        concurrent_connections: concurrentConnections,
      },
    },
    event: eventBlock(isErr, durationNs),
    message,
  };
}

export function generateDatabaseMigrationLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const sourceEngine = rand(["MYSQL", "POSTGRES", "SQLSERVER", "ORACLE"] as const);
  const destinationEngine = rand(["POSTGRES", "MYSQL"] as const);
  const phase = rand(["FULL_DUMP", "CDC", "PROMOTE"] as const);
  const status = isErr ? "FAILED" : rand(["RUNNING", "SUCCEEDED"] as const);
  const objectsMigrated = isErr ? randInt(0, 120) : randInt(200, 50_000);
  const latencySeconds = randInt(isErr ? 300 : 30, isErr ? 7200 : 3600);
  const durationNs = latencySeconds * 1e9;
  const migrationJob = `migrationJobs/${randId(12)}`;
  const severity = randSeverity(isErr);
  const message = isErr
    ? `datamigration.googleapis.com/${migrationJob}: replication error ${phase} ${status} ${sourceEngine} -> ${destinationEngine}`
    : `datamigration.googleapis.com/${migrationJob}: ${phase} ${status} objects=${objectsMigrated} lag=${latencySeconds}s`;

  return {
    "@timestamp": ts,
    severity,
    labels: { migration_job: migrationJob },
    cloud: gcpCloud(region, project, "database-migration-service"),
    gcp: {
      database_migration: {
        migration_job: migrationJob,
        source_engine: sourceEngine,
        destination_engine: destinationEngine,
        phase,
        status,
        objects_migrated: objectsMigrated,
        latency_seconds: latencySeconds,
      },
    },
    event: eventBlock(isErr, durationNs),
    message,
  };
}

export function generateBareMetalOracleLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const serverName = `bm-oracle-${randId(6).toLowerCase()}`;
  const oracleVersion = rand(["19c", "21c", "23ai"]);
  const databaseName = rand(["ERP", "OLTP", "DW", "HR"]);
  const operation = rand(["QUERY", "BACKUP", "PATCH", "MAINTENANCE"] as const);
  const sessionsActive = isErr ? randInt(200, 2000) : randInt(5, 400);
  const tablespaceUsedPct = isErr ? randFloat(0.92, 0.995) : randFloat(0.35, 0.85);
  const redoLogSwitches = isErr ? randInt(20, 120) : randInt(1, 30);
  const durationNs = randLatencyMs(randInt(50, 2000), isErr) * 1e6;
  const severity = randSeverity(isErr);
  const message = isErr
    ? `Bare Metal Oracle ${serverName}/${databaseName} ${operation}: tablespace ${(tablespaceUsedPct * 100).toFixed(1)}% redo_switches=${redoLogSwitches}`
    : `Bare Metal Oracle ${oracleVersion} ${serverName} ${databaseName} ${operation} sessions=${sessionsActive}`;

  return {
    "@timestamp": ts,
    severity,
    labels: { server_name: serverName },
    cloud: gcpCloud(region, project, "bare-metal-oracle"),
    gcp: {
      bare_metal_oracle: {
        server_name: serverName,
        oracle_version: oracleVersion,
        database_name: databaseName,
        operation,
        sessions_active: sessionsActive,
        tablespace_used_pct: Math.round(tablespaceUsedPct * 1000) / 10,
        redo_log_switches: redoLogSwitches,
      },
    },
    event: eventBlock(isErr, durationNs),
    message,
  };
}
