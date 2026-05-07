import {
  type EcsDocument,
  rand,
  randInt,
  randFloat,
  randId,
  randIp,
  azureCloud,
  makeAzureSetup,
  randUUID,
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

function armStorageAccount(sub: string, rg: string, acct: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Storage/storageAccounts/${acct}`;
}

function armStorageSync(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.StorageSync/storageSyncServices/${name}`;
}

function armNetAppVolume(sub: string, rg: string, acct: string, pool: string, vol: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.NetApp/netAppAccounts/${acct}/capacityPools/${pool}/volumes/${vol}`;
}

function armHpcCache(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.StorageCache/caches/${name}`;
}

function armSqlMi(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Sql/managedInstances/${name}`;
}

function armRedis(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Cache/Redis/${name}`;
}

function armPostgreSql(sub: string, rg: string, server: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.DBforPostgreSQL/flexibleServers/${server}`;
}

function armMySql(sub: string, rg: string, server: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.DBforMySQL/flexibleServers/${server}`;
}

function armMariaDb(sub: string, rg: string, server: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.DBforMariaDB/servers/${server}`;
}

function armPurview(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Purview/accounts/${name}`;
}

function armDataFactory(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.DataFactory/factories/${name}`;
}

function armStreamAnalytics(sub: string, rg: string, job: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.StreamAnalytics/streamingjobs/${job}`;
}

function armDigitalTwins(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.DigitalTwins/digitalTwinsInstances/${name}`;
}

function armHdInsight(sub: string, rg: string, cluster: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.HDInsight/clusters/${cluster}`;
}

function armAnalysisServices(sub: string, rg: string, server: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.AnalysisServices/servers/${server}`;
}

function armPowerBiEmbedded(sub: string, rg: string, cap: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.PowerBIDedicated/capacities/${cap}`;
}

function armFabricCapacity(sub: string, rg: string, cap: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Fabric/capacities/${cap}`;
}

/** Azure Files — share snapshots, SMB/NFS, quota. */
export function generateFileStorageLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const account = `st${randId(8).toLowerCase()}`;
  const share = `share-${rand(["data", "home", "app"])}-${randId(4).toLowerCase()}`;
  const resourceId = `${armStorageAccount(subscription.id, resourceGroup, account)}/fileServices/default`;
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["snapshot", "protocol", "quota"] as const);

  if (variant === "snapshot") {
    const snap = `snap-${randId(10).toLowerCase()}`;
    const props = {
      shareName: share,
      snapshotName: snap,
      operation: isErr ? "DeleteShareSnapshot" : "CreateShareSnapshot",
      statusCode: isErr ? rand([409, 500]) : 201,
      usedBytes: randInt(1e9, 8e11),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: props.operation,
      category: "StorageFileShareSnapshots",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts/fileServices"),
      azure: {
        file_storage: {
          storage_account: account,
          share,
          resource_group: resourceGroup,
          category: "StorageFileShareSnapshots",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(2e7, 4e9) },
      message: isErr
        ? `Files ${account}/${share}: snapshot ${snap} failed`
        : `Files ${account}/${share}: snapshot ${snap} created`,
    };
  }

  if (variant === "protocol") {
    const proto = rand(["SMB", "NFS"] as const);
    const props = {
      shareName: share,
      protocol: proto,
      operationName: isErr
        ? proto === "SMB"
          ? "CreateFile"
          : "Create"
        : proto === "SMB"
          ? "ReadFile"
          : "Read",
      clientIP: callerIp,
      statusCode: isErr ? rand([403, 404]) : 200,
      readLatencyMs: isErr ? randInt(500, 8000) : randInt(2, 45),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: props.operationName as string,
      category: "StorageFileReadWrite",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts/fileServices"),
      azure: {
        file_storage: {
          storage_account: account,
          share,
          resource_group: resourceGroup,
          category: "StorageFileReadWrite",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e6, 5e8) },
      message: isErr
        ? `${proto} I/O failed on //${account}.file.core.windows.net/${share}`
        : `${proto} read on share ${share} OK (${props.readLatencyMs}ms)`,
    };
  }

  const props = {
    shareName: share,
    previousQuotaGiB: randInt(512, 2048),
    newQuotaGiB: isErr ? randInt(512, 2048) : randInt(2049, 10240),
    status: isErr ? "Failed" : "Succeeded",
    reason: isErr ? "Quota increase exceeds subscription file share tier limit" : "",
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.Storage/storageAccounts/fileServices/shares/write",
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.status,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts/fileServices"),
    azure: {
      file_storage: {
        storage_account: account,
        share,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 2e9) },
    message: isErr
      ? `Quota change rejected for ${share}: ${props.reason}`
      : `Share ${share} quota ${props.previousQuotaGiB} GiB -> ${props.newQuotaGiB} GiB`,
  };
}

/** Queue Storage — enqueue, dequeue, poison. */
export function generateQueueStorageLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const account = `st${randId(8).toLowerCase()}`;
  const queue = `q-${rand(["jobs", "events", "dlq"])}-${randId(4).toLowerCase()}`;
  const resourceId = `${armStorageAccount(subscription.id, resourceGroup, account)}/queueServices/default`;
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["enqueue", "dequeue", "poison"] as const);
  const msgId = randUUID();

  if (variant === "enqueue") {
    const props = {
      queueName: queue,
      operationName: "PutMessage",
      messageId: msgId,
      insertionTime: time,
      sizeBytes: randInt(120, 65536),
      statusCode: isErr ? rand([403, 413]) : 201,
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "PutMessage",
      category: "StorageQueueLogs",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts/queueServices"),
      azure: {
        queue_storage: {
          storage_account: account,
          queue,
          resource_group: resourceGroup,
          category: "StorageQueueLogs",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e5, 2e8) },
      message: isErr
        ? `Enqueue failed on ${queue} HTTP ${props.statusCode}`
        : `Enqueued message ${msgId} to ${queue}`,
    };
  }

  if (variant === "dequeue") {
    const props = {
      queueName: queue,
      operationName: "GetMessages",
      messageId: msgId,
      dequeueCount: isErr ? randInt(1, 3) : 1,
      visibilityTimeoutSec: 30,
      statusCode: isErr ? 404 : 200,
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "GetMessages",
      category: "StorageQueueLogs",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Information" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts/queueServices"),
      azure: {
        queue_storage: {
          storage_account: account,
          queue,
          resource_group: resourceGroup,
          category: "StorageQueueLogs",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(3e5, 1e8) },
      message: isErr
        ? `Dequeue: no visible messages in ${queue}`
        : `Dequeued ${msgId} from ${queue}`,
    };
  }

  const props = {
    queueName: queue,
    deadLetterQueue: `${queue}-poison`,
    messageId: msgId,
    dequeueCount: isErr ? randInt(8, 20) : randInt(5, 9),
    reason: isErr
      ? "Message moved to poison queue after max dequeue attempts"
      : "Poison message handler archived payload to blob",
    statusCode: isErr ? 200 : 200,
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "UpdateMessage",
    category: "StorageQueuePoisonMessages",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: "PoisonQueue",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts/queueServices"),
    azure: {
      queue_storage: {
        storage_account: account,
        queue,
        resource_group: resourceGroup,
        category: "StorageQueuePoisonMessages",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e6, 4e8) },
    message: `Queue ${queue}: ${props.reason} (dequeueCount=${props.dequeueCount})`,
  };
}

/** Table Storage — entity and partition operations. */
export function generateTableStorageLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const account = `st${randId(8).toLowerCase()}`;
  const table = `tbl${randId(6)}`;
  const partitionKey = `pk-${rand(["orders", "users", "sessions"])}`;
  const resourceId = `${armStorageAccount(subscription.id, resourceGroup, account)}/tableServices/default`;
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["entity", "partition", "admin"] as const);

  if (variant === "entity") {
    const op = isErr ? "MergeEntity" : rand(["InsertEntity", "UpdateEntity", "DeleteEntity"]);
    const props = {
      tableName: table,
      operationName: op,
      partitionKey,
      rowKey: randId(12),
      etag: `"0x${randId(14).toUpperCase()}"`,
      statusCode: isErr ? rand([409, 412]) : 204,
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: op,
      category: "StorageTableLogs",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts/tableServices"),
      azure: {
        table_storage: {
          storage_account: account,
          table,
          resource_group: resourceGroup,
          category: "StorageTableLogs",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(4e5, 3e8) },
      message: isErr
        ? `Table ${table}: ${op} failed (PK=${partitionKey})`
        : `Table ${table}: ${op} succeeded`,
    };
  }

  if (variant === "partition") {
    const props = {
      tableName: table,
      event: isErr ? "PartitionServerThrottled" : "PartitionLoadBalanced",
      partitionKey,
      serverLatencyMs: isErr ? randInt(2000, 15000) : randInt(5, 80),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "QueryEntities",
      category: "StorageTablePartitionEvents",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.event,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts/tableServices"),
      azure: {
        table_storage: {
          storage_account: account,
          table,
          resource_group: resourceGroup,
          category: "StorageTablePartitionEvents",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e6, 6e8) },
      message: `Table ${table}: ${props.event} on partition ${partitionKey}`,
    };
  }

  const props = {
    eventCategory: "Administrative",
    status: isErr ? "Failed" : "Succeeded",
    tableName: table,
    httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.Storage/storageAccounts/tableServices/write",
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.status,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts/tableServices"),
    azure: {
      table_storage: {
        storage_account: account,
        table,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(8e7, 2e9) },
    message: isErr
      ? `Table service config update failed on ${account}`
      : `Table service ${account} updated`,
  };
}

/** ADLS Gen2 — filesystem ops, ACL, lifecycle. */
export function generateDataLakeStorageLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const account = `dl${randId(8).toLowerCase()}`;
  const fs = `fs-${rand(["raw", "curated", "sandbox"])}`;
  const path = `${rand(["tenant", "project"])}/${randId(4)}/part-${randInt(0, 99)}.parquet`;
  const resourceId = `${armStorageAccount(subscription.id, resourceGroup, account)}/blobServices/default`;
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["fs", "acl", "lifecycle"] as const);

  if (variant === "fs") {
    const op = isErr ? "DeletePath" : rand(["CreateFilesystem", "RenamePath", "Flush"]);
    const props = {
      filesystem: fs,
      path,
      operation: op,
      statusCode: isErr ? rand([403, 404]) : 200,
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: `dfs.${op}`,
      category: "StorageDfsLogs",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts"),
      azure: {
        data_lake_storage: {
          storage_account: account,
          filesystem: fs,
          resource_group: resourceGroup,
          category: "StorageDfsLogs",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e5, 4e8) },
      message: isErr
        ? `ADLS ${account}/${fs}: ${op} failed on ${path}`
        : `ADLS ${op} OK ${fs}/${path}`,
    };
  }

  if (variant === "acl") {
    const props = {
      filesystem: fs,
      path,
      aclChange: isErr ? "SetAccessControlRecursiveFailed" : "SetAccessControlRecursive",
      entriesChanged: isErr ? 0 : randInt(12, 8000),
      error: isErr ? "POSIX ACL depth limit exceeded on path" : "",
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "dfs.SetAccessControlRecursive",
      category: "StorageAclEvents",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.aclChange,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts"),
      azure: {
        data_lake_storage: {
          storage_account: account,
          filesystem: fs,
          resource_group: resourceGroup,
          category: "StorageAclEvents",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(2e8, 9e9) },
      message: isErr
        ? `ACL recursive failed on abfs://${account}.dfs.core.windows.net/${fs}/${path}`
        : `ACL updated ${props.entriesChanged} entries under ${path}`,
    };
  }

  const props = {
    filesystem: fs,
    action: isErr ? "TierChangeFailed" : "BlobDeleted",
    ruleId: `lifecycle-${randId(6)}`,
    tier: isErr ? "" : rand(["Cool", "Archive"]),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "StorageLifecycleManagement",
    category: "StorageLifecycleManagement",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.action,
    callerIpAddress: "169.254.169.254",
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts"),
    azure: {
      data_lake_storage: {
        storage_account: account,
        filesystem: fs,
        resource_group: resourceGroup,
        category: "StorageLifecycleManagement",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(5e7, 2e9) },
    message: isErr
      ? `Blob lifecycle on ${fs} failed rule ${props.ruleId}`
      : `Lifecycle applied tier ${props.tier} under ${fs}`,
  };
}

/** Azure File Sync — sessions, tiering, cloud endpoint. */
export function generateStorageSyncLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const svc = `afs-${randId(5).toLowerCase()}`;
  const resourceId = armStorageSync(subscription.id, resourceGroup, svc);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["session", "tier", "endpoint"] as const);

  if (variant === "session") {
    const props = {
      syncGroup: `sg-${randId(4)}`,
      serverEndpoint: `\\FILESRV${randInt(1, 9)}\\share`,
      sessionId: randUUID(),
      status: isErr ? "Failed" : "Succeeded",
      bytesTransferred: isErr ? 0 : randInt(1e7, 5e11),
      detail: isErr
        ? "Sync session aborted: ETag conflict on cloud tiered file"
        : "Incremental sync completed",
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.StorageSync/storageSyncServices/syncGroups/syncSessions/write",
      category: "StorageSyncSession",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.status,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.StorageSync/storageSyncServices"),
      azure: {
        storage_sync: {
          service: svc,
          resource_group: resourceGroup,
          category: "StorageSyncSession",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(3e8, 1.2e10) },
      message: `Storage Sync ${svc}: ${props.detail}`,
    };
  }

  if (variant === "tier") {
    const props = {
      syncGroup: `sg-${randId(4)}`,
      filePath: `\\data\\archive\\file-${randId(6)}.bin`,
      fromTier: isErr ? "Cloud" : "Hot",
      toTier: isErr ? "Hot" : "Cloud",
      status: isErr ? "RecallFailed" : "Tiered",
      reason: isErr ? "Recall bandwidth cap exceeded" : "",
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.StorageSync/storageSyncServices/cloudTiering/write",
      category: "StorageSyncTiering",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.status,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.StorageSync/storageSyncServices"),
      azure: {
        storage_sync: {
          service: svc,
          resource_group: resourceGroup,
          category: "StorageSyncTiering",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 4e9) },
      message: isErr
        ? `Cloud tiering recall failed: ${props.reason}`
        : `Tiered file to ${props.toTier}: ${props.filePath}`,
    };
  }

  const props = {
    syncGroup: `sg-${randId(4)}`,
    cloudEndpoint: `https://${`st${randId(6)}`}.dfs.core.windows.net/${rand(["fs1", "fs2"])}`,
    status: isErr ? "Offline" : "Healthy",
    lastSync: time,
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.StorageSync/storageSyncServices/syncGroups/cloudEndpoints/read",
    category: "StorageSyncCloudEndpoint",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.status,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.StorageSync/storageSyncServices"),
    azure: {
      storage_sync: {
        service: svc,
        resource_group: resourceGroup,
        category: "StorageSyncCloudEndpoint",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(2e8, 2e9) },
    message: isErr
      ? `Cloud endpoint unhealthy for ${svc}/${props.syncGroup}`
      : `Cloud endpoint OK for ${props.cloudEndpoint}`,
  };
}

/** Azure NetApp Files — snapshots, pool resize, replication. */
export function generateNetappFilesLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const acct = `netapp-${randId(4)}`;
  const pool = `pool-${rand(["gold", "silver"])}`;
  const vol = `vol-${randId(5)}`;
  const resourceId = armNetAppVolume(subscription.id, resourceGroup, acct, pool, vol);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["snapshot", "pool", "repl"] as const);

  if (variant === "snapshot") {
    const snap = `snapshot-${randId(8)}`;
    const props = {
      volumeId: vol,
      snapshotName: snap,
      state: isErr ? "Failed" : "Available",
      sizeTiB: rand([2, 4, 8, 16]),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.NetApp/netAppAccounts/capacityPools/volumes/snapshots/write",
      category: "NetAppVolumeSnapshot",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.state,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.NetApp/netAppAccounts"),
      azure: {
        netapp_files: {
          account: acct,
          pool,
          volume: vol,
          resource_group: resourceGroup,
          category: "NetAppVolumeSnapshot",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(4e8, 8e9) },
      message: isErr
        ? `NetApp ${vol}: snapshot ${snap} failed`
        : `NetApp snapshot ${snap} created on ${vol}`,
    };
  }

  if (variant === "pool") {
    const props = {
      poolName: pool,
      previousSizeTiB: randInt(4, 32),
      newSizeTiB: isErr ? randInt(4, 32) : randInt(33, 128),
      state: isErr ? "Failed" : "Succeeded",
      reason: isErr ? "Insufficient regional NetApp quota for capacity pool expansion" : "",
    };
    const poolPath = `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.NetApp/netAppAccounts/${acct}/capacityPools/${pool}`;
    return {
      "@timestamp": ts,
      time,
      resourceId: poolPath,
      operationName: "Microsoft.NetApp/netAppAccounts/capacityPools/write",
      category: "NetAppCapacityPoolResize",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.state,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.NetApp/netAppAccounts"),
      azure: {
        netapp_files: {
          account: acct,
          pool,
          volume: vol,
          resource_group: resourceGroup,
          category: "NetAppCapacityPoolResize",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(2e8, 6e9) },
      message: isErr
        ? `NetApp pool resize failed: ${props.reason}`
        : `Capacity pool ${pool} resized ${props.previousSizeTiB}TiB -> ${props.newSizeTiB}TiB`,
    };
  }

  const props = {
    destinationRegion: rand(["eastus2", "westeurope"]),
    replicationStatus: isErr ? "Broken" : "Mirrored",
    lagSec: isErr ? randInt(300, 3600) : randInt(0, 45),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.NetApp/netAppAccounts/capacityPools/volumes/replication/write",
    category: "NetAppReplication",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.replicationStatus,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.NetApp/netAppAccounts"),
    azure: {
      netapp_files: {
        account: acct,
        pool,
        volume: vol,
        resource_group: resourceGroup,
        category: "NetAppReplication",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(3e8, 4e9) },
    message: isErr
      ? `Cross-region replication broken on ${vol}, lag ${props.lagSec}s`
      : `Replication healthy for ${vol} (lag ${props.lagSec}s)`,
  };
}

/** HPC Cache — mount targets, storage targets. */
export function generateHpcCacheLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const cache = `hpc-${randId(5).toLowerCase()}`;
  const resourceId = armHpcCache(subscription.id, resourceGroup, cache);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["mount", "target", "admin"] as const);

  if (variant === "mount") {
    const props = {
      mountTarget: `${cache}-mt-${randInt(1, 4)}`,
      state: isErr ? "Degraded" : "Healthy",
      nfsClients: randInt(4, 120),
      detail: isErr
        ? "Backend storage target RPC timeout during health probe"
        : "All mount IPs responding",
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.StorageCache/caches/mountTargets/read",
      category: "HpcCacheMountTargetHealth",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.state,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.StorageCache/caches"),
      azure: {
        hpc_cache: {
          cache_name: cache,
          resource_group: resourceGroup,
          category: "HpcCacheMountTargetHealth",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 2e9) },
      message: `HPC Cache ${cache} mount ${props.mountTarget}: ${props.detail}`,
    };
  }

  if (variant === "target") {
    const props = {
      storageTarget: `blob-${randId(4)}`,
      operation: isErr ? "DeleteStorageTarget" : rand(["AddStorageTarget", "Refresh", "Flush"]),
      status: isErr ? "Failed" : "Succeeded",
      usedBytes: randInt(1e11, 9e12),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: `Microsoft.StorageCache/caches/storageTargets/${props.operation === "DeleteStorageTarget" ? "delete" : "write"}`,
      category: "HpcCacheStorageTarget",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.status,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.StorageCache/caches"),
      azure: {
        hpc_cache: {
          cache_name: cache,
          resource_group: resourceGroup,
          category: "HpcCacheStorageTarget",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(3e8, 7e9) },
      message: isErr
        ? `Storage target ${props.storageTarget} operation failed on ${cache}`
        : `Storage target ${props.storageTarget}: ${props.operation} OK`,
    };
  }

  const props = {
    eventCategory: "Administrative",
    status: isErr ? "Failed" : "Succeeded",
    httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.StorageCache/caches/write",
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.status,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.StorageCache/caches"),
    azure: {
      hpc_cache: {
        cache_name: cache,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(2e8, 4e9) },
    message: isErr
      ? `HPC Cache ${cache}: ARM update failed`
      : `HPC Cache ${cache}: configuration updated`,
  };
}

/** SQL Managed Instance — auto-tuning, failover, backup. */
export function generateSqlManagedInstanceLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const mi = `mi-${randId(5).toLowerCase()}`;
  const resourceId = armSqlMi(subscription.id, resourceGroup, mi);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["tuning", "failover", "backup"] as const);

  if (variant === "tuning") {
    const props = {
      recommendation: isErr ? "FORCE_LAST_GOOD_PLAN" : "DROP_INDEX",
      state: isErr ? "VerificationFailed" : "Success",
      schema: "dbo",
      objectName: isErr ? "IX_orders_status" : "IX_stale_covering_01",
      cpuGainPercent: isErr ? 0 : randFloat(12, 45),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "AUTOMATIC_TUNING",
      category: "AutomaticTuning",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.state as string,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Sql/managedInstances"),
      azure: {
        sql_managed_instance: {
          instance: mi,
          resource_group: resourceGroup,
          category: "AutomaticTuning",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 3e9) },
      message: isErr
        ? `MI ${mi}: auto-tuning could not verify ${props.objectName}`
        : `MI ${mi}: applied tuning ${props.recommendation} on ${props.objectName}`,
    };
  }

  if (variant === "failover") {
    const props = {
      role: isErr ? "Primary" : "Secondary",
      failoverType: isErr ? "Forced" : "Planned",
      state: isErr ? "Failed" : "Completed",
      durationSec: isErr ? randInt(30, 180) : randInt(45, 240),
      detail: isErr
        ? "Automatic failover to secondary replica aborted: log block gap"
        : "Failover completed; clients reconnected to new primary",
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "FailoverManagedInstance",
      category: "InstanceFailoverGroup",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.state,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Sql/managedInstances"),
      azure: {
        sql_managed_instance: {
          instance: mi,
          resource_group: resourceGroup,
          category: "InstanceFailoverGroup",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(3e9, 5e10) },
      message: isErr
        ? `SQL MI ${mi}: failover (${props.failoverType}) failed`
        : `SQL MI ${mi}: ${props.failoverType} failover done in ${props.durationSec}s`,
    };
  }

  const props = {
    backupType: rand(["FULL", "DIFF", "LOG"]),
    status: isErr ? "Failed" : "Succeeded",
    sizeMB: isErr ? 0 : randInt(50_000, 900_000),
    retentionDays: randInt(7, 35),
    error: isErr ? "Backup service could not write to storage account (403)" : "",
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "ManagedInstanceBackupCompleted",
    category: "ManagedBackup",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.status,
    callerIpAddress: "169.254.169.254",
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.Sql/managedInstances"),
    azure: {
      sql_managed_instance: {
        instance: mi,
        resource_group: resourceGroup,
        category: "ManagedBackup",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(2e9, 3.6e10) },
    message: isErr
      ? `MI ${mi}: ${props.backupType} backup failed: ${props.error}`
      : `MI ${mi}: ${props.backupType} backup ${props.sizeMB} MB`,
  };
}

/** Azure Cache for Redis — connection, eviction, persistence. */
export function generateCacheForRedisLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const redis = `redis-${randId(5).toLowerCase()}`;
  const resourceId = armRedis(subscription.id, resourceGroup, redis);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["conn", "evict", "persist"] as const);

  if (variant === "conn") {
    const props = {
      clientId: randInt(1000, 99999),
      ip: callerIp,
      event: isErr ? "AUTH_FAILED" : "AUTH_OK",
      tls: true,
      db: randInt(0, 15),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "RedisConnectionEvent",
      category: "ConnectedClientList",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.event,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Cache/Redis"),
      azure: {
        cache_for_redis: {
          cache_name: redis,
          resource_group: resourceGroup,
          category: "ConnectedClientList",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e5, 2e7) },
      message: isErr
        ? `Redis ${redis}: client ${props.clientId} auth failed from ${props.ip}`
        : `Redis ${redis}: client ${props.clientId} connected (db ${props.db})`,
    };
  }

  if (variant === "evict") {
    const props = {
      policy: rand(["allkeys-lru", "volatile-lru"]),
      evictedKeys: isErr ? 0 : randInt(50, 50000),
      maxmemoryPolicyViolation: isErr,
      usedMemoryMB: randInt(1200, 14000),
      detail: isErr ? "Eviction stalled: replica sync backlog high" : "",
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "RedisEviction",
      category: "MemoryPressure",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.policy,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Cache/Redis"),
      azure: {
        cache_for_redis: {
          cache_name: redis,
          resource_group: resourceGroup,
          category: "MemoryPressure",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e6, 4e8) },
      message: isErr
        ? `Redis ${redis}: eviction issue — ${props.detail}`
        : `Redis ${redis}: evicted ${props.evictedKeys} keys (${props.policy})`,
    };
  }

  const props = {
    persistence: rand(["RDB", "AOF"]),
    operation: isErr ? "BGSAVE_FAILED" : "BGSAVE_OK",
    lastSaveOffset: isErr ? 0 : randInt(1e6, 1e10),
    error: isErr ? "Background save child process exited with signal 9" : "",
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "RedisPersistenceEvent",
    category: "Persistence",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.operation,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.Cache/Redis"),
    azure: {
      cache_for_redis: {
        cache_name: redis,
        resource_group: resourceGroup,
        category: "Persistence",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 5e9) },
    message: isErr
      ? `Redis ${redis}: ${props.persistence} ${props.operation} ${props.error}`
      : `Redis ${redis}: ${props.persistence} snapshot OK (offset ${props.lastSaveOffset})`,
  };
}

/** Azure DB for PostgreSQL — query performance, connections. */
export function generateDatabaseForPostgresqlLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const srv = `psql-${randId(5).toLowerCase()}`;
  const resourceId = armPostgreSql(subscription.id, resourceGroup, srv);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["perf", "conn"] as const);

  if (variant === "perf") {
    const props = {
      database: rand(["app", "analytics"]),
      queryId: randId(12).toLowerCase(),
      meanTimeMs: isErr ? randFloat(8000, 120000) : randFloat(2, 85),
      calls: randInt(12, 50000),
      sharedBlksHit: randInt(100, 5_000_000),
      waitEvent: isErr ? rand(["IO", "Lock", "Client"]) : "CPU",
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "pg_stat_statements_sample",
      category: "PostgreSQLLogs",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.waitEvent as string,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.DBforPostgreSQL/servers"),
      azure: {
        database_for_postgresql: {
          server: srv,
          resource_group: resourceGroup,
          category: "PostgreSQLLogs",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e7, 2e9) },
      message: isErr
        ? `PostgreSQL ${srv}: slow query mean ${props.meanTimeMs.toFixed(0)}ms (${props.waitEvent})`
        : `PostgreSQL ${srv}: query stats OK mean ${props.meanTimeMs.toFixed(1)}ms`,
    };
  }

  const props = {
    database: rand(["app", "postgres"]),
    event: isErr ? "connection_failed" : "connection_authorized",
    user: rand(["app_rw", "reader"]),
    application: rand(["node-pg", "psql", "django"]),
    detail: isErr
      ? "password authentication failed for user"
      : "connection authorized: user mapping OK",
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "connection_log",
    category: "PostgreSQLLogs",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.event,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.DBforPostgreSQL/servers"),
    azure: {
      database_for_postgresql: {
        server: srv,
        resource_group: resourceGroup,
        category: "PostgreSQLLogs",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(2e5, 5e7) },
    message: `PostgreSQL ${srv}: ${props.event} ${props.user} from ${callerIp}`,
  };
}

/** Azure DB for MySQL — slow queries, connection audit. */
export function generateDatabaseForMysqlLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const srv = `mysql-${randId(5).toLowerCase()}`;
  const resourceId = armMySql(subscription.id, resourceGroup, srv);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["slow", "audit"] as const);

  if (variant === "slow") {
    const props = {
      schema: rand(["orders", "catalog"]),
      queryTimeSec: isErr ? randFloat(8, 120) : randFloat(0.02, 2),
      rowsExamined: isErr ? randInt(5e6, 5e8) : randInt(10, 5000),
      sqlText: isErr
        ? "SELECT * FROM line_items WHERE YEAR(created_at) = 2026"
        : "SELECT id FROM customers WHERE email = ? LIMIT 1",
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "slow_query",
      category: "MySqlSlowLogs",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(Math.round((props.queryTimeSec as number) * 1000)),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.DBforMySQL/servers"),
      azure: {
        database_for_mysql: {
          server: srv,
          resource_group: resourceGroup,
          category: "MySqlSlowLogs",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e7, 5e8) },
      message: isErr
        ? `MySQL ${srv}: slow query ${props.queryTimeSec.toFixed(2)}s rows=${props.rowsExamined}`
        : `MySQL ${srv}: query within threshold (${props.queryTimeSec.toFixed(3)}s)`,
    };
  }

  const props = {
    action: isErr ? "CONNECT_FAILED" : "CONNECT",
    user: rand(["app", "etl"]),
    ssl: true,
    detail: isErr ? "Access denied for user 'app'@'%'" : "SSL connection using TLS1.2",
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "audit_log_connection",
    category: "MySqlAuditLogs",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.action,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.DBforMySQL/servers"),
    azure: {
      database_for_mysql: {
        server: srv,
        resource_group: resourceGroup,
        category: "MySqlAuditLogs",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e5, 3e7) },
    message: `MySQL ${srv}: ${props.action} ${props.user} — ${props.detail}`,
  };
}

/** Azure DB for MariaDB — connections, replication lag. */
export function generateDatabaseForMariadbLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const srv = `mdb-${randId(5).toLowerCase()}`;
  const resourceId = armMariaDb(subscription.id, resourceGroup, srv);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["conn", "repl"] as const);

  if (variant === "conn") {
    const props = {
      threadId: randInt(10000, 999999),
      user: rand(["support", "app"]),
      database: rand(["inventory", "auth"]),
      status: isErr ? "Aborted_connection" : "Connect_OK",
      detail: isErr ? "Got timeout reading communication packets" : "",
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "MariaDBConnection",
      category: "MySqlAuditLogs",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.status,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.DBforMariaDB/servers"),
      azure: {
        database_for_mariadb: {
          server: srv,
          resource_group: resourceGroup,
          category: "MySqlAuditLogs",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(2e5, 2e7) },
      message: isErr
        ? `MariaDB ${srv}: ${props.status} (${props.detail})`
        : `MariaDB ${srv}: connection thread ${props.threadId} OK`,
    };
  }

  const props = {
    role: isErr ? "Replica" : "Replica",
    secondsBehindMaster: isErr ? randInt(120, 7200) : randInt(0, 8),
    ioRunning: isErr ? "No" : "Yes",
    sqlRunning: isErr ? "No" : "Yes",
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "replication_health",
    category: "MariaDBReplicationLag",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: String(props.secondsBehindMaster),
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.DBforMariaDB/servers"),
    azure: {
      database_for_mariadb: {
        server: srv,
        resource_group: resourceGroup,
        category: "MariaDBReplicationLag",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(5e8, 3e9) },
    message: isErr
      ? `MariaDB ${srv}: replication lag ${props.secondsBehindMaster}s (IO=${props.ioRunning})`
      : `MariaDB ${srv}: replication within SLA (${props.secondsBehindMaster}s)`,
  };
}

/** Microsoft Purview — scan, classification, catalog. */
export function generatePurviewLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const acct = `purview-${randId(5).toLowerCase()}`;
  const resourceId = armPurview(subscription.id, resourceGroup, acct);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["scan", "classify", "catalog"] as const);

  if (variant === "scan") {
    const props = {
      dataSource: `adl://${`dl${randId(4)}`}.dfs.core.windows.net/fs`,
      scanId: randUUID(),
      status: isErr ? "Failed" : "Succeeded",
      assetsScanned: isErr ? randInt(0, 200) : randInt(500, 50000),
      detail: isErr ? "Scan rule set evaluation error: timeout contacting data plane" : "",
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Purview/accounts/scans/write",
      category: "PurviewScanRun",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.status,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Purview/accounts"),
      azure: {
        purview: {
          account: acct,
          resource_group: resourceGroup,
          category: "PurviewScanRun",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(6e9, 4e11) },
      message: isErr
        ? `Purview ${acct}: scan ${props.scanId} failed — ${props.detail}`
        : `Purview scan completed: ${props.assetsScanned} assets from ${props.dataSource}`,
    };
  }

  if (variant === "classify") {
    const props = {
      classification: rand(["MICROSOFT.PERSONAL.NAME", "MICROSOFT.FINANCIAL.CREDIT_CARD"]),
      confidence: isErr ? randFloat(0.2, 0.5) : randFloat(0.82, 0.99),
      columnName: isErr ? "unknown_raw" : "customer_full_name",
      status: isErr ? "Rejected" : "Accepted",
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "PurviewClassificationResult",
      category: "PurviewClassification",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.status,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Information" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Purview/accounts"),
      azure: {
        purview: {
          account: acct,
          resource_group: resourceGroup,
          category: "PurviewClassification",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(2e7, 8e8) },
      message: isErr
        ? `Purview: low-confidence classification on ${props.columnName}`
        : `Purview classified ${props.classification} on ${props.columnName}`,
    };
  }

  const props = {
    operationUser: `entra:${rand(["analyst", "steward"])}@contoso.com`,
    entityType: rand(["azure_sql_table", "abfss_path"]),
    entityId: `/subscriptions/.../${randId(8)}`,
    changeType: isErr ? "DeleteDenied" : "UpsertEntity",
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.Purview/accounts/catalog/write",
    category: "PurviewCatalog",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.changeType,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.Purview/accounts"),
    azure: {
      purview: {
        account: acct,
        resource_group: resourceGroup,
        category: "PurviewCatalog",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(2e8, 4e9) },
    message: isErr
      ? `Purview catalog: ${props.changeType} denied for ${props.entityId}`
      : `Purview catalog: ${props.changeType} for ${props.entityType}`,
  };
}

/** Azure Data Factory — pipelines, activities, triggers. */
export function generateDataFactoryLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const factory = `adf-${randId(5).toLowerCase()}`;
  const resourceId = armDataFactory(subscription.id, resourceGroup, factory);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["pipeline", "activity", "trigger"] as const);

  if (variant === "pipeline") {
    const runId = randUUID();
    const props = {
      pipelineName: `pl_${rand(["ingest", "curate", "export"])}`,
      runId,
      status: isErr ? "Failed" : "Succeeded",
      durationMs: isErr ? randInt(5000, 600000) : randInt(120000, 8_640_000),
      error: isErr ? "Self-hosted IR offline; cannot reach SQL MI" : "",
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "PipelineRun",
      category: "PipelineRuns",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.status,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.DataFactory/factories"),
      azure: {
        data_factory: {
          factory,
          resource_group: resourceGroup,
          category: "PipelineRuns",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        outcome: isErr ? "failure" : "success",
        duration: (props.durationMs as number) * 1e6,
      },
      message: isErr
        ? `ADF ${factory}: pipeline ${props.pipelineName} failed (${runId})`
        : `ADF ${factory}: pipeline ${props.pipelineName} OK in ${props.durationMs}ms`,
    };
  }

  if (variant === "activity") {
    const props = {
      activityName: rand(["CopyData1", "LookupKeys", "ExecuteStoredProc"]),
      activityType: rand(["Copy", "Lookup", "SqlServerStoredProcedure"]),
      status: isErr ? "Failed" : "Succeeded",
      integrationRuntime: `ir-${rand(["shared", "prod"])}`,
      detail: isErr ? "Sink write throttled by destination DWU cap" : "",
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ActivityRun",
      category: "ActivityRuns",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.status,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.DataFactory/factories"),
      azure: {
        data_factory: {
          factory,
          resource_group: resourceGroup,
          category: "ActivityRuns",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(2e8, 9e10) },
      message: isErr
        ? `ADF activity ${props.activityName} failed: ${props.detail}`
        : `ADF activity ${props.activityName} (${props.activityType}) completed`,
    };
  }

  const props = {
    triggerName: `tr_${rand(["daily", "tumble"])}_${randId(4)}`,
    triggerType: rand(["ScheduleTrigger", "BlobEventsTrigger"]),
    fired: !isErr,
    schedule: "0 15 * * *",
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "TriggerRun",
    category: "TriggerRuns",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.fired ? "Fired" : "Skipped",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.DataFactory/factories"),
    azure: {
      data_factory: {
        factory,
        resource_group: resourceGroup,
        category: "TriggerRuns",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e7, 5e8) },
    message: isErr
      ? `ADF trigger ${props.triggerName} did not fire (validation error)`
      : `ADF trigger ${props.triggerName} fired (${props.triggerType})`,
  };
}

/** Stream Analytics — job lifecycle, I/O, watermark. */
export function generateStreamAnalyticsLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const job = `asa-${randId(5).toLowerCase()}`;
  const resourceId = armStreamAnalytics(subscription.id, resourceGroup, job);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["lifecycle", "io", "watermark"] as const);

  if (variant === "lifecycle") {
    const props = {
      operation: isErr ? "StopJob" : rand(["StartJob", "StopJob"]),
      state: isErr ? "Failed" : rand(["Running", "Stopped"]),
      detail: isErr ? "Job failed to stop: output sink checkpoint lock" : "",
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: `Microsoft.StreamAnalytics/streamingjobs/${props.operation === "StartJob" ? "start" : "stop"}`,
      category: "StreamingJobLifecycle",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.state as string,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.StreamAnalytics/streamingjobs"),
      azure: {
        stream_analytics: {
          job,
          resource_group: resourceGroup,
          category: "StreamingJobLifecycle",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e8, 1.2e10) },
      message: isErr
        ? `ASA ${job}: lifecycle ${props.operation} failed — ${props.detail}`
        : `ASA ${job}: ${props.operation} -> ${props.state}`,
    };
  }

  if (variant === "io") {
    const props = {
      direction: rand(["Input", "Output"] as const),
      alias: isErr ? "blob_out" : "eventhub_in",
      records: isErr ? 0 : randInt(100, 5_000_000),
      errors: isErr ? randInt(50, 5000) : 0,
      detail: isErr ? "Serialization failure converting JSON field 'amount'" : "",
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "StreamingIO",
      category: "StreamingIOEvents",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.direction,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.StreamAnalytics/streamingjobs"),
      azure: {
        stream_analytics: {
          job,
          resource_group: resourceGroup,
          category: "StreamingIOEvents",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(3e7, 4e8) },
      message: isErr
        ? `ASA ${job}: ${props.direction} ${props.alias} errors=${props.errors} ${props.detail}`
        : `ASA ${job}: processed ${props.records} records on ${props.alias}`,
    };
  }

  const props = {
    watermark: `2026-05-0${randInt(1, 7)}T${randInt(10, 18)}:${randInt(10, 59)}:00Z`,
    latenessSec: isErr ? randInt(120, 900) : randInt(0, 12),
    state: isErr ? "Backpressure" : "Current",
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "StreamingWatermark",
    category: "StreamingDiagnostics",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.state,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.StreamAnalytics/streamingjobs"),
    azure: {
      stream_analytics: {
        job,
        resource_group: resourceGroup,
        category: "StreamingDiagnostics",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 2e9) },
    message: isErr
      ? `ASA ${job}: watermark behind; lateness ${props.latenessSec}s (${props.state})`
      : `ASA ${job}: watermark ${props.watermark} within tolerance`,
  };
}

/** Azure Digital Twins — models, twin lifecycle, routing. */
export function generateDigitalTwinsLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const inst = `adt-${randId(5).toLowerCase()}`;
  const resourceId = armDigitalTwins(subscription.id, resourceGroup, inst);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["model", "twin", "route"] as const);

  if (variant === "model") {
    const props = {
      modelId: `dtmi:contoso:${rand(["Factory", "Sensor"])};${randInt(1, 3)}`,
      operation: isErr ? "CreateModels" : rand(["CreateModels", "DeleteModels"]),
      status: isErr ? "InvalidModel" : "OK",
      detail: isErr ? "DTDL validation: duplicate property ids in interface" : "",
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.DigitalTwins/models/write",
      category: "Models",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.status,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.DigitalTwins/digitalTwinsInstances"),
      azure: {
        digital_twins: {
          instance: inst,
          resource_group: resourceGroup,
          category: "Models",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(2e8, 5e9) },
      message: isErr
        ? `Digital Twins ${inst}: model ${props.modelId} invalid — ${props.detail}`
        : `Digital Twins ${inst}: ${props.operation} ${props.modelId}`,
    };
  }

  if (variant === "twin") {
    const props = {
      twinId: `twin-${randId(8)}`,
      operation: isErr ? "PatchTwin" : rand(["CreateTwin", "DeleteTwin"]),
      status: isErr ? "Conflict" : "OK",
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.DigitalTwins/twins/write",
      category: "TwinLifecycle",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.status,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.DigitalTwins/digitalTwinsInstances"),
      azure: {
        digital_twins: {
          instance: inst,
          resource_group: resourceGroup,
          category: "TwinLifecycle",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 3e9) },
      message: isErr
        ? `ADT ${inst}: twin ${props.twinId} patch conflict`
        : `ADT ${inst}: ${props.operation} ${props.twinId}`,
    };
  }

  const props = {
    endpoint: `https://func-${randId(4)}.azurewebsites.net/api/twin-notification`,
    delivered: !isErr,
    retryCount: isErr ? randInt(3, 12) : 0,
    detail: isErr ? "Event Grid delivery failed with HTTP 503" : "",
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.DigitalTwins/eventRoutes/write",
    category: "Routing",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.delivered ? "Delivered" : "Failed",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.DigitalTwins/digitalTwinsInstances"),
    azure: {
      digital_twins: {
        instance: inst,
        resource_group: resourceGroup,
        category: "Routing",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(5e7, 2e9) },
    message: isErr
      ? `ADT route to ${props.endpoint} failed after ${props.retryCount} retries`
      : `ADT routing delivered to ${props.endpoint}`,
  };
}

/** HDInsight — scaling, health, Spark/Hive. */
export function generateHdinsightLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const cluster = `hdi-${rand(["spark", "kafka", "hive"])}-${randId(4)}`;
  const resourceId = armHdInsight(subscription.id, resourceGroup, cluster);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["scale", "health", "workload"] as const);

  if (variant === "scale") {
    const props = {
      previousWorkers: randInt(3, 12),
      targetWorkers: isErr ? randInt(3, 12) : randInt(13, 36),
      status: isErr ? "Failed" : "Succeeded",
      detail: isErr ? "Scale-up blocked: insufficient quota for Standard_D8s_v5 in region" : "",
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.HDInsight/clusters/resize",
      category: "ClusterResize",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.status,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.HDInsight/clusters"),
      azure: {
        hdinsight: {
          cluster,
          resource_group: resourceGroup,
          category: "ClusterResize",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(4e9, 6e10) },
      message: isErr
        ? `HDInsight ${cluster}: resize failed — ${props.detail}`
        : `HDInsight ${cluster}: workers ${props.previousWorkers} -> ${props.targetWorkers}`,
    };
  }

  if (variant === "health") {
    const props = {
      component: rand(["HeadNode", "WorkerNode", "Zookeeper"]),
      state: isErr ? "Unhealthy" : "Healthy",
      detail: isErr ? ambariUnhealthy() : "Ambari heartbeats OK",
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.HDInsight/clusters/read",
      category: "ClusterHealth",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.state,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.HDInsight/clusters"),
      azure: {
        hdinsight: {
          cluster,
          resource_group: resourceGroup,
          category: "ClusterHealth",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(4e8, 3e9) },
      message: `HDInsight ${cluster} ${props.component}: ${props.state} — ${props.detail}`,
    };
  }

  const props = {
    engine: rand(["Spark", "Hive"]),
    operation: rand(["SELECT", "INSERT_OVERWRITE"]),
    appId: `application_${randInt(1e9, 2e9)}`,
    durationSec: isErr ? randInt(30, 600) : randInt(8, 400),
    status: isErr ? "FAILED" : "SUCCEEDED",
    detail: isErr ? "Container killed by YARN for exceeding memory limits" : "",
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: `${props.engine}Application`,
    category: "WorkloadDiagnostics",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.status,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.HDInsight/clusters"),
    azure: {
      hdinsight: {
        cluster,
        resource_group: resourceGroup,
        category: "WorkloadDiagnostics",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: (props.durationSec as number) * 1e9,
    },
    message: isErr
      ? `HDInsight ${props.engine} app ${props.appId} ${props.status}: ${props.detail}`
      : `HDInsight ${props.engine} ${props.operation} finished in ${props.durationSec}s`,
  };
}

function ambariUnhealthy(): string {
  return rand([
    "Ambari agent lost heartbeat for 180s",
    "HDFS NameNode safe mode",
    "Metrics collector unreachable",
  ]);
}

/** Analysis Services — query, refresh, suspend/resume. */
export function generateAnalysisServicesLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const server = `as-${randId(5).toLowerCase()}`;
  const resourceId = armAnalysisServices(subscription.id, resourceGroup, server);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["query", "refresh", "power"] as const);

  if (variant === "query") {
    const props = {
      database: rand(["Finance", "Sales"]),
      durationMs: isErr ? randInt(8000, 120000) : randInt(20, 2500),
      cpuMs: randInt(5, 800),
      rowCount: isErr ? 0 : randInt(100, 2_000_000),
      error: isErr ? "Query cancelled: memory limit for session exceeded" : "",
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "QUERY_END",
      category: "Query",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.durationMs),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.AnalysisServices/servers"),
      azure: {
        analysis_services: {
          server,
          resource_group: resourceGroup,
          category: "Query",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        outcome: isErr ? "failure" : "success",
        duration: (props.durationMs as number) * 1e6,
      },
      message: isErr
        ? `AAS ${server}: query error — ${props.error}`
        : `AAS ${server}: query on ${props.database} ${props.durationMs}ms rows=${props.rowCount}`,
    };
  }

  if (variant === "refresh") {
    const props = {
      model: rand(["SalesModel", "OpsSemantic"]),
      status: isErr ? "Failed" : "Succeeded",
      tablesRefreshed: isErr ? randInt(0, 3) : randInt(4, 80),
      durationSec: isErr ? randInt(60, 600) : randInt(120, 7200),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "REFRESH",
      category: "Model",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.status,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.AnalysisServices/servers"),
      azure: {
        analysis_services: {
          server,
          resource_group: resourceGroup,
          category: "Model",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        outcome: isErr ? "failure" : "success",
        duration: (props.durationSec as number) * 1e9,
      },
      message: isErr
        ? `AAS ${server}: model refresh ${props.model} failed`
        : `AAS ${server}: refreshed ${props.tablesRefreshed} tables on ${props.model}`,
    };
  }

  const props = {
    operation: isErr ? "resume" : rand(["suspend", "resume"] as const),
    state: isErr ? "Failed" : rand(["paused", "succeeded"] as const),
    detail: isErr ? "Server could not resume: transient ARM lock" : "",
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: `Microsoft.AnalysisServices/servers/${props.operation}`,
    category: "Resource",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.state as string,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.AnalysisServices/servers"),
    azure: {
      analysis_services: {
        server,
        resource_group: resourceGroup,
        category: "Resource",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(3e8, 6e9) },
    message: isErr
      ? `AAS ${server}: ${props.operation} failed — ${props.detail}`
      : `AAS ${server}: ${props.operation} -> ${props.state}`,
  };
}

/** Power BI Embedded — capacity, dataset. */
export function generatePowerBiEmbeddedLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const cap = `pbi-${randId(5).toLowerCase()}`;
  const resourceId = armPowerBiEmbedded(subscription.id, resourceGroup, cap);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["capacity", "dataset"] as const);

  if (variant === "capacity") {
    const props = {
      operation: isErr
        ? "ScaleCapacity"
        : rand(["ResumeCapacity", "PauseCapacity", "ScaleCapacity"]),
      skuTier: rand(["A1", "A3", "A6"]),
      targetSku: isErr ? "A1" : rand(["A3", "A6"]),
      state: isErr ? "Failed" : "Succeeded",
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: `Microsoft.PowerBIDedicated/capacities/${props.operation}`,
      category: "Administrative",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.state,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.PowerBIDedicated/capacities"),
      azure: {
        power_bi_embedded: {
          capacity: cap,
          resource_group: resourceGroup,
          category: "Administrative",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(4e8, 1.2e10) },
      message: isErr
        ? `Power BI Embedded ${cap}: ${props.operation} failed`
        : `Power BI Embedded ${cap}: ${props.operation} ${props.skuTier} -> ${props.targetSku}`,
    };
  }

  const props = {
    workspaceId: randUUID(),
    datasetName: rand(["Sales", "Ops", "FinanceMetrics"]),
    operation: rand(["RefreshDataset", "Import"]),
    status: isErr ? "Failed" : "Completed",
    durationSec: isErr ? randInt(30, 400) : randInt(10, 180),
    detail: isErr ? "Refresh failed: gateway not reachable" : "",
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: props.operation,
    category: "DatasetOperations",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.status,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.PowerBIDedicated/capacities"),
    azure: {
      power_bi_embedded: {
        capacity: cap,
        resource_group: resourceGroup,
        category: "DatasetOperations",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: (props.durationSec as number) * 1e9,
    },
    message: isErr
      ? `PBI dataset ${props.datasetName} refresh failed: ${props.detail}`
      : `PBI dataset ${props.datasetName} ${props.operation} in ${props.durationSec}s`,
  };
}

/** Microsoft Fabric — capacity, workspace. */
export function generateMicrosoftFabricLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const cap = `fabric-cap-${randId(4)}`;
  const resourceId = armFabricCapacity(subscription.id, resourceGroup, cap);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["capacity", "workspace"] as const);

  if (variant === "capacity") {
    const props = {
      operation: isErr
        ? "UpdateCapacity"
        : rand(["CreateCapacity", "SuspendCapacity", "ResumeCapacity"]),
      capacityUnit: rand([2, 4, 8, 16, 32]),
      state: isErr ? "Failed" : "Succeeded",
      detail: isErr ? "Capacity SKU not available in selected region" : "",
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: `Microsoft.Fabric/capacities/${props.operation}`,
      category: "FabricCapacityManagement",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.state,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Fabric/capacities"),
      azure: {
        microsoft_fabric: {
          capacity: cap,
          resource_group: resourceGroup,
          category: "FabricCapacityManagement",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e8, 1.5e10) },
      message: isErr
        ? `Fabric capacity ${cap}: ${props.operation} failed — ${props.detail}`
        : `Fabric capacity ${cap}: ${props.operation} OK (units=${props.capacityUnit})`,
    };
  }

  const props = {
    workspaceId: randUUID(),
    workspaceName: `ws-${rand(["analytics", "finance", "eng"])}-${randId(3)}`,
    event: isErr ? "AssignmentFailed" : rand(["Created", "Updated", "RoleChanged"]),
    principal: `group:${randUUID()}`,
    detail: isErr ? "Workspace RBAC propagation failed downstream" : "",
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.Fabric/workspaces/write",
    category: "FabricWorkspaceEvents",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.event,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.Fabric/capacities"),
    azure: {
      microsoft_fabric: {
        capacity: cap,
        resource_group: resourceGroup,
        category: "FabricWorkspaceEvents",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(2e8, 5e9) },
    message: isErr
      ? `Fabric workspace ${props.workspaceName}: ${props.event} ${props.detail}`
      : `Fabric workspace ${props.workspaceName}: ${props.event} for ${props.principal}`,
  };
}
