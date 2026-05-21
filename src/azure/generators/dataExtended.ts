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
  randAzurePersonEmail,
} from "./helpers.js";

const DATA_EXTENDED_ERR_CODES = [
  "StorageAccountAlreadyExists",
  "ContainerQuotaExceeded",
  "BlobAccessTierNotAllowed",
  "DataLakeStorageAccountNotFound",
  "SynapseWorkspaceNotFound",
  "AuthorizationFailed",
  "InternalServerError",
  "QuotaExceeded",
] as const;

type DataExtendedTopError = { code: string; message: string; type: "azure" };

function dataExtendedErrMessage(code: (typeof DATA_EXTENDED_ERR_CODES)[number]): string {
  switch (code) {
    case "StorageAccountAlreadyExists":
      return "The storage account name is already registered in Azure.";
    case "ContainerQuotaExceeded":
      return "Subscription container quota was exceeded.";
    case "BlobAccessTierNotAllowed":
      return "Changing blob tier is blocked by account policy.";
    case "DataLakeStorageAccountNotFound":
      return "Azure Data Lake storage account was not found in the subscription.";
    case "SynapseWorkspaceNotFound":
      return "The Synapse workspace resource could not be resolved.";
    case "AuthorizationFailed":
      return "Caller lacks permission on the targeted resource.";
    case "InternalServerError":
      return "The storage backend returned an unexpected error.";
    default:
      return "Regional subscription quota prevented this operation.";
  }
}

/** Top-level ECS error blob; reused for ARM statusMessage.code when provisioning style. */
function dataExtendedPickError(isErr: boolean): DataExtendedTopError | undefined {
  if (!isErr) return undefined;
  const code = rand([...DATA_EXTENDED_ERR_CODES]);
  return { code, message: dataExtendedErrMessage(code), type: "azure" };
}

function mergeDataExtendedArmProps(
  isErr: boolean,
  armProvisioning: boolean,
  props: Record<string, unknown>,
  err: DataExtendedTopError | undefined
): Record<string, unknown> {
  if (!isErr || !armProvisioning || !err) return props;
  return {
    ...props,
    statusMessage: {
      error: {
        code: err.code,
        message: `ARM-level description: ${err.message}`,
      },
    },
  };
}

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
  const variant = rand(["snapshot", "protocol", "quota", "lease", "metadata", "listing"] as const);

  if (variant === "snapshot") {
    const docErr = dataExtendedPickError(isErr);
    const snap = `snap-${randId(10).toLowerCase()}`;
    const props = {
      shareName: share,
      snapshotName: snap,
      operation: isErr ? "DeleteShareSnapshot" : "CreateShareSnapshot",
      statusCode: isErr ? rand([409, 500]) : 201,
      usedBytes: randInt(1e9, 8e11),
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts/fileServices"),
      azure: {
        file_storage: {
          storage_account: account,
          share,
          resource_group: resourceGroup,
          category: "StorageFileShareSnapshots",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String(props.operation),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e7, 4e9),
      },
      message: isErr
        ? `Files ${account}/${share}: snapshot ${snap} failed`
        : `Files ${account}/${share}: snapshot ${snap} created`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "protocol") {
    const docErr = dataExtendedPickError(isErr);
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
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts/fileServices"),
      azure: {
        file_storage: {
          storage_account: account,
          share,
          resource_group: resourceGroup,
          category: "StorageFileReadWrite",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String(props.operationName as string),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e6, 5e8),
      },
      message: isErr
        ? `${proto} I/O failed on //${account}.file.core.windows.net/${share}`
        : `${proto} read on share ${share} OK (${props.readLatencyMs}ms)`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "lease") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      shareName: share,
      filePath: `reports/${randId(6)}.csv`,
      operation: isErr ? "BreakLease" : "AcquireLease",
      leaseId: randUUID(),
      statusCode: isErr ? rand([409, 412]) : 201,
      leaseDurationSec: rand([15, -1]),
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: `File.${props.operation}`,
      category: "StorageFileLease",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts/fileServices"),
      azure: {
        file_storage: {
          storage_account: account,
          share,
          resource_group: resourceGroup,
          category: "StorageFileLease",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String(`File.${props.operation}`),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e5, 2e8),
      },
      message: isErr
        ? `Files lease ${props.operation} failed on ${share}/${props.filePath}`
        : `Files lease acquired on ${share}/${props.filePath}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "metadata") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      shareName: share,
      filePath: `_logs/${randId(5)}.ndjson`,
      operation: "SetFileMetadata",
      metadataKeys: randInt(2, 24),
      statusCode: isErr ? rand([403, 413]) : 200,
      contentEncoding: rand(["gzip", "identity"]),
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: props.operation,
      category: "StorageFileMetadata",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts/fileServices"),
      azure: {
        file_storage: {
          storage_account: account,
          share,
          resource_group: resourceGroup,
          category: "StorageFileMetadata",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String(props.operation),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e5, 2e8),
      },
      message: isErr
        ? `File metadata write failed under ${share}`
        : `File metadata updated (${props.metadataKeys} keys) on ${share}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "listing") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      shareName: share,
      prefix: rand(["incoming/", "finance/", "staging/"]),
      entriesReturned: isErr ? 0 : randInt(1, 5000),
      continuationToken: isErr ? "" : randId(16),
      statusCode: isErr ? rand([403, 500]) : 200,
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ListFilesAndDirectories",
      category: "StorageFileListing",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts/fileServices"),
      azure: {
        file_storage: {
          storage_account: account,
          share,
          resource_group: resourceGroup,
          category: "StorageFileListing",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("ListFilesAndDirectories"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(6e5, 3e8),
      },
      message: isErr
        ? `Directory listing failed on ${share} prefix ${props.prefix}`
        : `Listed ${props.entriesReturned} entries under ${share}/${props.prefix}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  const docErr = dataExtendedPickError(isErr);
  const props = {
    shareName: share,
    previousQuotaGiB: randInt(512, 2048),
    newQuotaGiB: isErr ? randInt(512, 2048) : randInt(2049, 10240),
    status: isErr ? "Failed" : "Succeeded",
    reason: isErr ? "Quota increase exceeds subscription file share tier limit" : "",
  };
  const propsForDoc = mergeDataExtendedArmProps(isErr, true, props, docErr);
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
    properties: propsForDoc,
    cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts/fileServices"),
    azure: {
      file_storage: {
        storage_account: account,
        share,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: propsForDoc,
      },
    },
    event: {
      kind: "event",
      category: ["database"],
      type: isErr ? ["error"] : ["access"],
      action: String("Microsoft.Storage/storageAccounts/fileServices/shares/write"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(1e8, 2e9),
    },
    message: isErr
      ? `Quota change rejected for ${share}: ${props.reason}`
      : `Share ${share} quota ${props.previousQuotaGiB} GiB -> ${props.newQuotaGiB} GiB`,
    ...(docErr ? { error: docErr } : {}),
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
  const variant = rand(["enqueue", "dequeue", "poison", "peek", "clear", "metadata"] as const);
  const msgId = randUUID();

  if (variant === "enqueue") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      queueName: queue,
      operationName: "PutMessage",
      messageId: msgId,
      insertionTime: time,
      sizeBytes: randInt(120, 65536),
      statusCode: isErr ? rand([403, 413]) : 201,
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts/queueServices"),
      azure: {
        queue_storage: {
          storage_account: account,
          queue,
          resource_group: resourceGroup,
          category: "StorageQueueLogs",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("PutMessage"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e5, 2e8),
      },
      message: isErr
        ? `Enqueue failed on ${queue} HTTP ${props.statusCode}`
        : `Enqueued message ${msgId} to ${queue}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "dequeue") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      queueName: queue,
      operationName: "GetMessages",
      messageId: msgId,
      dequeueCount: isErr ? randInt(1, 3) : 1,
      visibilityTimeoutSec: 30,
      statusCode: isErr ? 404 : 200,
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts/queueServices"),
      azure: {
        queue_storage: {
          storage_account: account,
          queue,
          resource_group: resourceGroup,
          category: "StorageQueueLogs",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("GetMessages"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e5, 1e8),
      },
      message: isErr
        ? `Dequeue: no visible messages in ${queue}`
        : `Dequeued ${msgId} from ${queue}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "peek") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      queueName: queue,
      operationName: "PeekMessages",
      messagesPeeked: isErr ? 0 : randInt(1, 32),
      peekLock: false,
      statusCode: isErr ? rand([403, 500]) : 200,
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "PeekMessages",
      category: "StorageQueueLogs",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts/queueServices"),
      azure: {
        queue_storage: {
          storage_account: account,
          queue,
          resource_group: resourceGroup,
          category: "StorageQueuePeek",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("PeekMessages"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e5, 9e7),
      },
      message: isErr
        ? `Peek failed on queue ${queue}`
        : `Peeked ${props.messagesPeeked} message(s) on ${queue}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "clear") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      queueName: queue,
      operationName: "ClearMessages",
      messagesRemoved: isErr ? 0 : randInt(0, 50_000),
      statusCode: isErr ? rand([409, 500]) : 204,
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ClearMessages",
      category: "StorageQueueAdmin",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts/queueServices"),
      azure: {
        queue_storage: {
          storage_account: account,
          queue,
          resource_group: resourceGroup,
          category: "StorageQueueClear",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("ClearMessages"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e5, 2e8),
      },
      message: isErr
        ? `Clear queue rejected for ${queue}`
        : `Cleared queue ${queue} removed=${props.messagesRemoved}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "metadata") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      queueName: queue,
      operationName: "SetQueueMetadata",
      metadataKeys: randInt(1, 8),
      statusCode: isErr ? rand([403, 400]) : 200,
      approximateMessageCount: isErr ? -1 : randInt(0, 1e6),
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "SetQueueMetadata",
      category: "StorageQueueLogs",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts/queueServices"),
      azure: {
        queue_storage: {
          storage_account: account,
          queue,
          resource_group: resourceGroup,
          category: "StorageQueueMetadata",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("SetQueueMetadata"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e5, 9e7),
      },
      message: isErr
        ? `Queue metadata update failed on ${queue}`
        : `Queue metadata updated on ${queue} (${props.metadataKeys} keys)`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "poison") {
    const docErr = dataExtendedPickError(isErr);
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
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts/queueServices"),
      azure: {
        queue_storage: {
          storage_account: account,
          queue,
          resource_group: resourceGroup,
          category: "StorageQueuePoisonMessages",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("UpdateMessage"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e6, 4e8),
      },
      message: `Queue ${queue}: ${props.reason} (dequeueCount=${props.dequeueCount})`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  throw new Error("generateQueueStorageLog: exhaustive variant mismatch");
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
  const variant = rand(["entity", "partition", "admin", "batch", "sas", "throttle"] as const);

  if (variant === "entity") {
    const docErr = dataExtendedPickError(isErr);
    const op = isErr ? "MergeEntity" : rand(["InsertEntity", "UpdateEntity", "DeleteEntity"]);
    const props = {
      tableName: table,
      operationName: op,
      partitionKey,
      rowKey: randId(12),
      etag: `"0x${randId(14).toUpperCase()}"`,
      statusCode: isErr ? rand([409, 412]) : 204,
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts/tableServices"),
      azure: {
        table_storage: {
          storage_account: account,
          table,
          resource_group: resourceGroup,
          category: "StorageTableLogs",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String(op),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e5, 3e8),
      },
      message: isErr
        ? `Table ${table}: ${op} failed (PK=${partitionKey})`
        : `Table ${table}: ${op} succeeded`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "partition") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      tableName: table,
      event: isErr ? "PartitionServerThrottled" : "PartitionLoadBalanced",
      partitionKey,
      serverLatencyMs: isErr ? randInt(2000, 15000) : randInt(5, 80),
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts/tableServices"),
      azure: {
        table_storage: {
          storage_account: account,
          table,
          resource_group: resourceGroup,
          category: "StorageTablePartitionEvents",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("QueryEntities"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e6, 6e8),
      },
      message: `Table ${table}: ${props.event} on partition ${partitionKey}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "batch") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      tableName: table,
      batchSize: randInt(10, 100),
      operationsSucceeded: isErr ? randInt(0, 4) : randInt(10, 100),
      statusCode: isErr ? rand([400, 413]) : 202,
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "BatchCommit",
      category: "StorageTableBatch",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts/tableServices"),
      azure: {
        table_storage: {
          storage_account: account,
          table,
          resource_group: resourceGroup,
          category: "StorageTableBatch",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("BatchCommit"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(8e5, 5e8),
      },
      message: isErr
        ? `Table ${table}: batch commit partially failed`
        : `Table ${table}: batch committed ${props.operationsSucceeded}/${props.batchSize}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "sas") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      tableName: table,
      authType: "SAS",
      signedPermission: rand(["r", "raud"]),
      statusCode: isErr ? rand([403, 403]) : 200,
      signedExpiryUtc: time,
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "QueryEntities",
      category: "StorageTableAuth",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts/tableServices"),
      azure: {
        table_storage: {
          storage_account: account,
          table,
          resource_group: resourceGroup,
          category: "StorageTableSas",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("QueryEntities"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e5, 2e8),
      },
      message: isErr
        ? `SAS-authenticated table query rejected on ${table}`
        : `SAS query OK ${table}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "throttle") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      tableName: table,
      retryAfterMs: isErr ? randInt(500, 8000) : 0,
      serverBusy: isErr,
      requestCount: randInt(100, 9000),
      statusCode: isErr ? 503 : 200,
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "QueryEntities",
      category: "StorageTableThrottling",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts/tableServices"),
      azure: {
        table_storage: {
          storage_account: account,
          table,
          resource_group: resourceGroup,
          category: "StorageTableThrottle",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("QueryEntities"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e5, 2e8),
      },
      message: isErr
        ? `Table ${table}: server busy throttling (retry ${props.retryAfterMs}ms)`
        : `Table ${table}: throughput within burst limits`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  const docErr = dataExtendedPickError(isErr);
  const props = {
    eventCategory: "Administrative",
    status: isErr ? "Failed" : "Succeeded",
    tableName: table,
    httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
  };
  const propsForDoc = mergeDataExtendedArmProps(isErr, true, props, docErr);
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
    properties: propsForDoc,
    cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts/tableServices"),
    azure: {
      table_storage: {
        storage_account: account,
        table,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: propsForDoc,
      },
    },
    event: {
      kind: "event",
      category: ["database"],
      type: isErr ? ["error"] : ["access"],
      action: String("Microsoft.Storage/storageAccounts/tableServices/write"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(8e7, 2e9),
    },
    message: isErr
      ? `Table service config update failed on ${account}`
      : `Table service ${account} updated`,
    ...(docErr ? { error: docErr } : {}),
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
  const variant = rand(["fs", "acl", "lifecycle", "mkdir", "checksum", "capacity"] as const);

  if (variant === "fs") {
    const docErr = dataExtendedPickError(isErr);
    const op = isErr ? "DeletePath" : rand(["CreateFilesystem", "RenamePath", "Flush"]);
    const props = {
      filesystem: fs,
      path,
      operation: op,
      statusCode: isErr ? rand([403, 404]) : 200,
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts"),
      azure: {
        data_lake_storage: {
          storage_account: account,
          filesystem: fs,
          resource_group: resourceGroup,
          category: "StorageDfsLogs",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String(`dfs.${op}`),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e5, 4e8),
      },
      message: isErr
        ? `ADLS ${account}/${fs}: ${op} failed on ${path}`
        : `ADLS ${op} OK ${fs}/${path}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "acl") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      filesystem: fs,
      path,
      aclChange: isErr ? "SetAccessControlRecursiveFailed" : "SetAccessControlRecursive",
      entriesChanged: isErr ? 0 : randInt(12, 8000),
      error: isErr ? "POSIX ACL depth limit exceeded on path" : "",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts"),
      azure: {
        data_lake_storage: {
          storage_account: account,
          filesystem: fs,
          resource_group: resourceGroup,
          category: "StorageAclEvents",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("dfs.SetAccessControlRecursive"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e8, 9e9),
      },
      message: isErr
        ? `ACL recursive failed on abfs://${account}.dfs.core.windows.net/${fs}/${path}`
        : `ACL updated ${props.entriesChanged} entries under ${path}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "lifecycle") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      filesystem: fs,
      action: isErr ? "TierChangeFailed" : "BlobDeleted",
      ruleId: `lifecycle-${randId(6)}`,
      tier: isErr ? "" : rand(["Cool", "Archive"]),
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts"),
      azure: {
        data_lake_storage: {
          storage_account: account,
          filesystem: fs,
          resource_group: resourceGroup,
          category: "StorageLifecycleManagement",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("StorageLifecycleManagement"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e7, 2e9),
      },
      message: isErr
        ? `Blob lifecycle on ${fs} failed rule ${props.ruleId}`
        : `Lifecycle applied tier ${props.tier} under ${fs}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "mkdir") {
    const docErr = dataExtendedPickError(isErr);
    const dirPath = `${rand(["tenant", "project"])}/${randId(4)}/staging`;
    const props = {
      filesystem: fs,
      path: dirPath,
      operation: "CreateDirectory",
      umask: "0022",
      statusCode: isErr ? rand([409, 412]) : 201,
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "dfs.CreateDirectory",
      category: "StorageDfsLogs",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts"),
      azure: {
        data_lake_storage: {
          storage_account: account,
          filesystem: fs,
          resource_group: resourceGroup,
          category: "StorageDfsMkdir",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("dfs.CreateDirectory"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e5, 2e8),
      },
      message: isErr
        ? `ADLS mkdir failed under ${fs}/${dirPath}`
        : `ADLS directory created ${fs}/${dirPath}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "checksum") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      filesystem: fs,
      path,
      readCrc64: isErr ? "" : randId(16),
      verified: !isErr,
      statusCode: isErr ? rand([500, 404]) : 200,
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "dfs.PathRead",
      category: "StorageDfsIntegrity",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts"),
      azure: {
        data_lake_storage: {
          storage_account: account,
          filesystem: fs,
          resource_group: resourceGroup,
          category: "StorageDfsChecksum",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("dfs.PathRead"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(6e5, 6e8),
      },
      message: isErr ? `ADLS read checksum mismatch on ${path}` : `ADLS checksum OK for ${path}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "capacity") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      filesystem: fs,
      usedBytes: randInt(1e11, 9e12),
      softQuotaBytes: randInt(8e12, 2e13),
      breached: isErr,
      statusCode: isErr ? 507 : 200,
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "dfs.GetFilesystemProperties",
      category: "StorageDfsCapacity",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.statusCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts"),
      azure: {
        data_lake_storage: {
          storage_account: account,
          filesystem: fs,
          resource_group: resourceGroup,
          category: "StorageDfsCapacity",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("dfs.GetFilesystemProperties"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e7, 9e8),
      },
      message: isErr
        ? `ADLS filesystem ${fs} over soft quota (${props.usedBytes} bytes)`
        : `ADLS capacity within limits for ${fs}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  throw new Error("generateDataLakeStorageLog: exhaustive variant mismatch");
}

/** Azure File Sync — sessions, tiering, cloud endpoint. */
export function generateStorageSyncLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const svc = `afs-${randId(5).toLowerCase()}`;
  const resourceId = armStorageSync(subscription.id, resourceGroup, svc);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["session", "tier", "endpoint", "drift", "conflict", "register"] as const);

  if (variant === "session") {
    const docErr = dataExtendedPickError(isErr);
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
    const propsForDoc = mergeDataExtendedArmProps(isErr, true, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.StorageSync/storageSyncServices"),
      azure: {
        storage_sync: {
          service: svc,
          resource_group: resourceGroup,
          category: "StorageSyncSession",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("Microsoft.StorageSync/storageSyncServices/syncGroups/syncSessions/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e8, 1.2e10),
      },
      message: `Storage Sync ${svc}: ${props.detail}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "tier") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      syncGroup: `sg-${randId(4)}`,
      filePath: `\\data\\archive\\file-${randId(6)}.bin`,
      fromTier: isErr ? "Cloud" : "Hot",
      toTier: isErr ? "Hot" : "Cloud",
      status: isErr ? "RecallFailed" : "Tiered",
      reason: isErr ? "Recall bandwidth cap exceeded" : "",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, true, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.StorageSync/storageSyncServices"),
      azure: {
        storage_sync: {
          service: svc,
          resource_group: resourceGroup,
          category: "StorageSyncTiering",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("Microsoft.StorageSync/storageSyncServices/cloudTiering/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e8, 4e9),
      },
      message: isErr
        ? `Cloud tiering recall failed: ${props.reason}`
        : `Tiered file to ${props.toTier}: ${props.filePath}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "endpoint") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      syncGroup: `sg-${randId(4)}`,
      cloudEndpoint: `https://${`st${randId(6)}`}.dfs.core.windows.net/${rand(["fs1", "fs2"])}`,
      status: isErr ? "Offline" : "Healthy",
      lastSync: time,
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.StorageSync/storageSyncServices"),
      azure: {
        storage_sync: {
          service: svc,
          resource_group: resourceGroup,
          category: "StorageSyncCloudEndpoint",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("Microsoft.StorageSync/storageSyncServices/syncGroups/cloudEndpoints/read"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e8, 2e9),
      },
      message: isErr
        ? `Cloud endpoint unhealthy for ${svc}/${props.syncGroup}`
        : `Cloud endpoint OK for ${props.cloudEndpoint}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "drift") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      syncGroup: `sg-${randId(4)}`,
      divergenceFiles: isErr ? randInt(50, 5000) : randInt(0, 40),
      lastFullScanUtc: time,
      status: isErr ? "DriftDetected" : "InSync",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "StorageSync.SyncDriftCheck",
      category: "StorageSyncDrift",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.status,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.StorageSync/storageSyncServices"),
      azure: {
        storage_sync: {
          service: svc,
          resource_group: resourceGroup,
          category: "StorageSyncDrift",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("StorageSync.SyncDriftCheck"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e8, 4e9),
      },
      message: isErr
        ? `Sync drift detected: ${props.divergenceFiles} files out of alignment`
        : `Sync drift check OK for ${svc}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "conflict") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      syncGroup: `sg-${randId(4)}`,
      conflictPath: `\\data\\${randId(6)}.docx`,
      resolution: isErr ? "Unresolved" : "CloudWins",
      attempts: isErr ? randInt(3, 12) : randInt(0, 2),
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "StorageSync.FileConflictEvent",
      category: "StorageSyncConflict",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.resolution,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.StorageSync/storageSyncServices"),
      azure: {
        storage_sync: {
          service: svc,
          resource_group: resourceGroup,
          category: "StorageSyncConflict",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("StorageSync.FileConflictEvent"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e8, 2e9),
      },
      message: isErr
        ? `File sync conflict persists on ${props.conflictPath}`
        : `Conflict resolved (${props.resolution}) for ${props.conflictPath}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  const docErr = dataExtendedPickError(isErr);
  const props = {
    operation: "RegisterServerEndpoint",
    serverName: `FILESRV${randInt(1, 9)}`,
    provisioningState: isErr ? "Failed" : "Succeeded",
    tlsVersion: "1.2",
  };
  const propsForDoc = mergeDataExtendedArmProps(isErr, true, props, docErr);
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.StorageSync/storageSyncServices/registerServers/write",
    category: "StorageSyncProvisioning",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.provisioningState,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: propsForDoc,
    cloud: azureCloud(region, subscription, "Microsoft.StorageSync/storageSyncServices"),
    azure: {
      storage_sync: {
        service: svc,
        resource_group: resourceGroup,
        category: "StorageSyncRegister",
        correlation_id: correlationId,
        properties: propsForDoc,
      },
    },
    event: {
      kind: "event",
      category: ["database"],
      type: isErr ? ["error"] : ["access"],
      action: String("Microsoft.StorageSync/storageSyncServices/registerServers/write"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(3e8, 6e9),
    },
    message: isErr
      ? `Server endpoint registration failed for ${props.serverName}`
      : `Registered server endpoint ${props.serverName} on ${svc}`,
    ...(docErr ? { error: docErr } : {}),
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
  const variant = rand(["snapshot", "pool", "repl", "backup", "clone", "throughput"] as const);

  if (variant === "snapshot") {
    const docErr = dataExtendedPickError(isErr);
    const snap = `snapshot-${randId(8)}`;
    const props = {
      volumeId: vol,
      snapshotName: snap,
      state: isErr ? "Failed" : "Available",
      sizeTiB: rand([2, 4, 8, 16]),
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, true, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.NetApp/netAppAccounts"),
      azure: {
        netapp_files: {
          account: acct,
          pool,
          volume: vol,
          resource_group: resourceGroup,
          category: "NetAppVolumeSnapshot",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("Microsoft.NetApp/netAppAccounts/capacityPools/volumes/snapshots/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e8, 8e9),
      },
      message: isErr
        ? `NetApp ${vol}: snapshot ${snap} failed`
        : `NetApp snapshot ${snap} created on ${vol}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "pool") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      poolName: pool,
      previousSizeTiB: randInt(4, 32),
      newSizeTiB: isErr ? randInt(4, 32) : randInt(33, 128),
      state: isErr ? "Failed" : "Succeeded",
      reason: isErr ? "Insufficient regional NetApp quota for capacity pool expansion" : "",
    };
    const poolPath = `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.NetApp/netAppAccounts/${acct}/capacityPools/${pool}`;
    const propsForDoc = mergeDataExtendedArmProps(isErr, true, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.NetApp/netAppAccounts"),
      azure: {
        netapp_files: {
          account: acct,
          pool,
          volume: vol,
          resource_group: resourceGroup,
          category: "NetAppCapacityPoolResize",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("Microsoft.NetApp/netAppAccounts/capacityPools/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e8, 6e9),
      },
      message: isErr
        ? `NetApp pool resize failed: ${props.reason}`
        : `Capacity pool ${pool} resized ${props.previousSizeTiB}TiB -> ${props.newSizeTiB}TiB`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "repl") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      destinationRegion: rand(["eastus2", "westeurope"]),
      replicationStatus: isErr ? "Broken" : "Mirrored",
      lagSec: isErr ? randInt(300, 3600) : randInt(0, 45),
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, true, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.NetApp/netAppAccounts"),
      azure: {
        netapp_files: {
          account: acct,
          pool,
          volume: vol,
          resource_group: resourceGroup,
          category: "NetAppReplication",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("Microsoft.NetApp/netAppAccounts/capacityPools/volumes/replication/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e8, 4e9),
      },
      message: isErr
        ? `Cross-region replication broken on ${vol}, lag ${props.lagSec}s`
        : `Replication healthy for ${vol} (lag ${props.lagSec}s)`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "backup") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      vaultName: `anf-vault-${randId(4)}`,
      backupId: randUUID(),
      bytesTransferred: isErr ? 0 : randInt(1e9, 5e11),
      state: isErr ? "Failed" : "Transferred",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.NetApp/netAppAccounts/backupBuckets/backup/action",
      category: "NetAppBackupVault",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.state,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.NetApp/netAppAccounts"),
      azure: {
        netapp_files: {
          account: acct,
          pool,
          volume: vol,
          resource_group: resourceGroup,
          category: "NetAppBackup",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("Microsoft.NetApp/netAppAccounts/backupBuckets/backup/action"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e8, 1.2e10),
      },
      message: isErr
        ? `NetApp vault backup failed for volume ${vol}`
        : `NetApp backup vault transfer completed (${props.bytesTransferred} bytes)`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "clone") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      sourceVolume: vol,
      cloneName: `clone-${randId(5)}`,
      splitPercent: isErr ? 0 : randInt(0, 100),
      state: isErr ? "Failed" : "Created",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, true, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.NetApp/netAppAccounts/capacityPools/volumes/clone/write",
      category: "NetAppVolumeClone",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.state,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.NetApp/netAppAccounts"),
      azure: {
        netapp_files: {
          account: acct,
          pool,
          volume: vol,
          resource_group: resourceGroup,
          category: "NetAppClone",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("Microsoft.NetApp/netAppAccounts/capacityPools/volumes/clone/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e8, 7e9),
      },
      message: isErr
        ? `NetApp flexclone create failed from ${vol}`
        : `NetApp clone ${props.cloneName} created from ${vol}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  const docErr = dataExtendedPickError(isErr);
  const props = {
    volume: vol,
    maxMbps: randInt(128, 4500),
    observedMbps: isErr ? randInt(0, 50) : randInt(200, 4000),
    qosPolicy: rand(["auto", "manual"]),
  };
  const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.NetApp/netAppAccounts/capacityPools/volumes/qos/write",
    category: "NetAppThroughput",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "Throttled" : "OK",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: propsForDoc,
    cloud: azureCloud(region, subscription, "Microsoft.NetApp/netAppAccounts"),
    azure: {
      netapp_files: {
        account: acct,
        pool,
        volume: vol,
        resource_group: resourceGroup,
        category: "NetAppThroughput",
        correlation_id: correlationId,
        properties: propsForDoc,
      },
    },
    event: {
      kind: "event",
      category: ["database"],
      type: isErr ? ["error"] : ["access"],
      action: String("Microsoft.NetApp/netAppAccounts/capacityPools/volumes/qos/write"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(2e8, 3e9),
    },
    message: isErr
      ? `NetApp volume ${vol} throughput below policy minimum`
      : `NetApp throughput ${props.observedMbps}/${props.maxMbps} Mbps`,
    ...(docErr ? { error: docErr } : {}),
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
  const variant = rand(["mount", "target", "admin", "warmup", "dns", "metering"] as const);

  if (variant === "mount") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      mountTarget: `${cache}-mt-${randInt(1, 4)}`,
      state: isErr ? "Degraded" : "Healthy",
      nfsClients: randInt(4, 120),
      detail: isErr
        ? "Backend storage target RPC timeout during health probe"
        : "All mount IPs responding",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.StorageCache/caches"),
      azure: {
        hpc_cache: {
          cache_name: cache,
          resource_group: resourceGroup,
          category: "HpcCacheMountTargetHealth",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("Microsoft.StorageCache/caches/mountTargets/read"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e8, 2e9),
      },
      message: `HPC Cache ${cache} mount ${props.mountTarget}: ${props.detail}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "target") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      storageTarget: `blob-${randId(4)}`,
      operation: isErr ? "DeleteStorageTarget" : rand(["AddStorageTarget", "Refresh", "Flush"]),
      status: isErr ? "Failed" : "Succeeded",
      usedBytes: randInt(1e11, 9e12),
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, true, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.StorageCache/caches"),
      azure: {
        hpc_cache: {
          cache_name: cache,
          resource_group: resourceGroup,
          category: "HpcCacheStorageTarget",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String(
          `Microsoft.StorageCache/caches/storageTargets/${props.operation === "DeleteStorageTarget" ? "delete" : "write"}`
        ),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e8, 7e9),
      },
      message: isErr
        ? `Storage target ${props.storageTarget} operation failed on ${cache}`
        : `Storage target ${props.storageTarget}: ${props.operation} OK`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "warmup") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      cacheName: cache,
      warmupPercent: isErr ? randInt(0, 40) : randInt(85, 100),
      filesWarmed: isErr ? randInt(0, 200) : randInt(500, 50000),
      state: isErr ? "Stalled" : "Complete",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.StorageCache/caches/warmup/status",
      category: "HpcCacheWarmup",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.state,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.StorageCache/caches"),
      azure: {
        hpc_cache: {
          cache_name: cache,
          resource_group: resourceGroup,
          category: "HpcCacheWarmup",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("Microsoft.StorageCache/caches/warmup/status"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e8, 5e9),
      },
      message: isErr
        ? `HPC Cache ${cache} warmup stalled at ${props.warmupPercent}%`
        : `HPC Cache ${cache} warmup complete (${props.filesWarmed} files)`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "dns") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      fqdn: `${cache}.cache.azure.net`,
      dnsResolutionMs: isErr ? randInt(500, 4000) : randInt(2, 45),
      nxdomain: isErr,
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "HpcCache.DnsResolution",
      category: "HpcCacheDns",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.nxdomain ? "NXDOMAIN" : "OK",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.StorageCache/caches"),
      azure: {
        hpc_cache: {
          cache_name: cache,
          resource_group: resourceGroup,
          category: "HpcCacheDns",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("HpcCache.DnsResolution"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e6, 5e8),
      },
      message: isErr
        ? `HPC Cache DNS failure for ${props.fqdn}`
        : `HPC Cache DNS OK ${props.fqdn} (${props.dnsResolutionMs}ms)`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "metering") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      billingPeriod: "2026-05",
      cacheGbHours: randInt(1e4, 8e5),
      egressBytes: isErr ? 0 : randInt(1e8, 5e11),
      status: isErr ? "MeteringFailed" : "Reported",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.StorageCache/caches/metering/report",
      category: "HpcCacheMetering",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.status,
      callerIpAddress: "169.254.169.254",
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.StorageCache/caches"),
      azure: {
        hpc_cache: {
          cache_name: cache,
          resource_group: resourceGroup,
          category: "HpcCacheMetering",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("Microsoft.StorageCache/caches/metering/report"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e7, 2e9),
      },
      message: isErr
        ? `HPC Cache ${cache} usage metering failed`
        : `HPC Cache ${cache} metering reported ${props.cacheGbHours} GB-hrs`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  const docErr = dataExtendedPickError(isErr);
  const props = {
    eventCategory: "Administrative",
    status: isErr ? "Failed" : "Succeeded",
    httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
  };
  const propsForDoc = mergeDataExtendedArmProps(isErr, true, props, docErr);
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
    properties: propsForDoc,
    cloud: azureCloud(region, subscription, "Microsoft.StorageCache/caches"),
    azure: {
      hpc_cache: {
        cache_name: cache,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: propsForDoc,
      },
    },
    event: {
      kind: "event",
      category: ["database"],
      type: isErr ? ["error"] : ["access"],
      action: String("Microsoft.StorageCache/caches/write"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(2e8, 4e9),
    },
    message: isErr
      ? `HPC Cache ${cache}: ARM update failed`
      : `HPC Cache ${cache}: configuration updated`,
    ...(docErr ? { error: docErr } : {}),
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
  const variant = rand(["tuning", "failover", "backup", "patching", "deadlock", "io"] as const);

  if (variant === "tuning") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      recommendation: isErr ? "FORCE_LAST_GOOD_PLAN" : "DROP_INDEX",
      state: isErr ? "VerificationFailed" : "Success",
      schema: "dbo",
      objectName: isErr ? "IX_orders_status" : "IX_stale_covering_01",
      cpuGainPercent: isErr ? 0 : randFloat(12, 45),
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Sql/managedInstances"),
      azure: {
        sql_managed_instance: {
          instance: mi,
          resource_group: resourceGroup,
          category: "AutomaticTuning",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("AUTOMATIC_TUNING"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e8, 3e9),
      },
      message: isErr
        ? `MI ${mi}: auto-tuning could not verify ${props.objectName}`
        : `MI ${mi}: applied tuning ${props.recommendation} on ${props.objectName}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "failover") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      role: isErr ? "Primary" : "Secondary",
      failoverType: isErr ? "Forced" : "Planned",
      state: isErr ? "Failed" : "Completed",
      durationSec: isErr ? randInt(30, 180) : randInt(45, 240),
      detail: isErr
        ? "Automatic failover to secondary replica aborted: log block gap"
        : "Failover completed; clients reconnected to new primary",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Sql/managedInstances"),
      azure: {
        sql_managed_instance: {
          instance: mi,
          resource_group: resourceGroup,
          category: "InstanceFailoverGroup",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("FailoverManagedInstance"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e9, 5e10),
      },
      message: isErr
        ? `SQL MI ${mi}: failover (${props.failoverType}) failed`
        : `SQL MI ${mi}: ${props.failoverType} failover done in ${props.durationSec}s`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "backup") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      backupType: rand(["FULL", "DIFF", "LOG"]),
      status: isErr ? "Failed" : "Succeeded",
      sizeMB: isErr ? 0 : randInt(50_000, 900_000),
      retentionDays: randInt(7, 35),
      backupErrorDetail: isErr ? "Backup service could not write to storage account (403)" : "",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Sql/managedInstances"),
      azure: {
        sql_managed_instance: {
          instance: mi,
          resource_group: resourceGroup,
          category: "ManagedBackup",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("ManagedInstanceBackupCompleted"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e9, 3.6e10),
      },
      message: isErr
        ? `MI ${mi}: ${props.backupType} backup failed: ${props.backupErrorDetail}`
        : `MI ${mi}: ${props.backupType} backup ${props.sizeMB} MB`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "patching") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      kbArticle: `KB${randInt(5000000, 5099999)}`,
      patchingWindow: rand(["SUN-02", "SAT-03"]),
      state: isErr ? "RolledBack" : "Applied",
      durationMin: isErr ? randInt(15, 90) : randInt(25, 120),
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, true, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Sql/managedInstances/maintenanceConfiguration/write",
      category: "SqlMiPatching",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.state,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Sql/managedInstances"),
      azure: {
        sql_managed_instance: {
          instance: mi,
          resource_group: resourceGroup,
          category: "SqlMiPatching",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("Microsoft.Sql/managedInstances/maintenanceConfiguration/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e9, 2e10),
      },
      message: isErr
        ? `MI ${mi}: patch ${props.kbArticle} rolled back`
        : `MI ${mi}: patch applied ${props.kbArticle} (${props.durationMin}m)`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "deadlock") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      victimSession: randInt(50, 200),
      graphXmlBytes: randInt(200, 8000),
      database: rand(["payments", "orders"]),
      deadlockCount: isErr ? randInt(3, 40) : randInt(0, 2),
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "DeadlockCaptured",
      category: "SqlMiDeadlocks",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.deadlockCount),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Sql/managedInstances"),
      azure: {
        sql_managed_instance: {
          instance: mi,
          resource_group: resourceGroup,
          category: "SqlMiDeadlocks",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("DeadlockCaptured"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e7, 4e9),
      },
      message: isErr
        ? `MI ${mi}: elevated deadlocks (${props.deadlockCount}) in ${props.database}`
        : `MI ${mi}: routine deadlock telemetry OK`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  const docErr = dataExtendedPickError(isErr);
  const props = {
    metric: "AvgDataIoLatencyMs",
    value: isErr ? randFloat(800, 12000) : randFloat(1, 180),
    fileId: randInt(1, 32000),
    databaseId: randInt(5, 50),
    thresholdExceeded: isErr,
  };
  const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "ManagedInstancePerfAlert",
    category: "SqlMiIoAlerts",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.metric,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: propsForDoc,
    cloud: azureCloud(region, subscription, "Microsoft.Sql/managedInstances"),
    azure: {
      sql_managed_instance: {
        instance: mi,
        resource_group: resourceGroup,
        category: "SqlMiIo",
        correlation_id: correlationId,
        properties: propsForDoc,
      },
    },
    event: {
      kind: "event",
      category: ["database"],
      type: isErr ? ["error"] : ["access"],
      action: String("ManagedInstancePerfAlert"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(8e8, 4e10),
    },
    message: isErr
      ? `MI ${mi}: data IO latency ${props.value.toFixed(0)}ms exceeded SLA`
      : `MI ${mi}: IO latency within bounds (${props.value.toFixed(1)}ms)`,
    ...(docErr ? { error: docErr } : {}),
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
  const variant = rand(["conn", "evict", "persist", "replication", "cluster", "patch"] as const);

  if (variant === "conn") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      clientId: randInt(1000, 99999),
      ip: callerIp,
      event: isErr ? "AUTH_FAILED" : "AUTH_OK",
      tls: true,
      db: randInt(0, 15),
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Cache/Redis"),
      azure: {
        cache_for_redis: {
          cache_name: redis,
          resource_group: resourceGroup,
          category: "ConnectedClientList",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("RedisConnectionEvent"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e5, 2e7),
      },
      message: isErr
        ? `Redis ${redis}: client ${props.clientId} auth failed from ${props.ip}`
        : `Redis ${redis}: client ${props.clientId} connected (db ${props.db})`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "evict") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      policy: rand(["allkeys-lru", "volatile-lru"]),
      evictedKeys: isErr ? 0 : randInt(50, 50000),
      maxmemoryPolicyViolation: isErr,
      usedMemoryMB: randInt(1200, 14000),
      detail: isErr ? "Eviction stalled: replica sync backlog high" : "",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Cache/Redis"),
      azure: {
        cache_for_redis: {
          cache_name: redis,
          resource_group: resourceGroup,
          category: "MemoryPressure",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("RedisEviction"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e6, 4e8),
      },
      message: isErr
        ? `Redis ${redis}: eviction issue — ${props.detail}`
        : `Redis ${redis}: evicted ${props.evictedKeys} keys (${props.policy})`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "persist") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      persistence: rand(["RDB", "AOF"]),
      operation: isErr ? "BGSAVE_FAILED" : "BGSAVE_OK",
      lastSaveOffset: isErr ? 0 : randInt(1e6, 1e10),
      error: isErr ? "Background save child process exited with signal 9" : "",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Cache/Redis"),
      azure: {
        cache_for_redis: {
          cache_name: redis,
          resource_group: resourceGroup,
          category: "Persistence",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("RedisPersistenceEvent"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e8, 5e9),
      },
      message: isErr
        ? `Redis ${redis}: ${props.persistence} ${props.operation} ${props.error}`
        : `Redis ${redis}: ${props.persistence} snapshot OK (offset ${props.lastSaveOffset})`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "replication") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      lagMs: isErr ? randInt(5000, 120000) : randInt(0, 450),
      replicationRole: isErr ? "Replica" : "Replica",
      replOffsetDelta: isErr ? randInt(1024, 500000) : randInt(0, 200),
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "RedisReplicationHealth",
      category: "Replication",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.lagMs),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Cache/Redis"),
      azure: {
        cache_for_redis: {
          cache_name: redis,
          resource_group: resourceGroup,
          category: "Replication",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("RedisReplicationHealth"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e7, 4e9),
      },
      message: isErr
        ? `Redis ${redis}: replication lag ${props.lagMs}ms`
        : `Redis ${redis}: replication lag healthy`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "cluster") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      slot: randInt(0, 16383),
      nodeId: randId(40),
      migrating: isErr,
      reshardingPhase: rand(["NONE", "STABLE"]),
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Redis.ClusterSlotAudit",
      category: "ClusterOps",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.reshardingPhase,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Cache/Redis"),
      azure: {
        cache_for_redis: {
          cache_name: redis,
          resource_group: resourceGroup,
          category: "ClusterOps",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("Redis.ClusterSlotAudit"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e8, 3e9),
      },
      message: isErr
        ? `Redis ${redis}: inconsistent slot assignment for ${props.slot}`
        : `Redis ${redis}: cluster topology stable`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  const docErr = dataExtendedPickError(isErr);
  const props = {
    skuTier: rand(["Premium", "Standard"]),
    targetShardCount: randInt(1, 3),
    state: isErr ? "Failed" : "Succeeded",
  };
  const propsForDoc = mergeDataExtendedArmProps(isErr, true, props, docErr);
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.Cache/Redis/write",
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.state,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: propsForDoc,
    cloud: azureCloud(region, subscription, "Microsoft.Cache/Redis"),
    azure: {
      cache_for_redis: {
        cache_name: redis,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: propsForDoc,
      },
    },
    event: {
      kind: "event",
      category: ["database"],
      type: isErr ? ["error"] : ["access"],
      action: String("Microsoft.Cache/Redis/write"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(2e9, 1.2e10),
    },
    message: isErr
      ? `Redis ${redis}: SKU / shard patch failed (${props.targetShardCount})`
      : `Redis ${redis}: configuration patch completed`,
    ...(docErr ? { error: docErr } : {}),
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
  const variant = rand(["perf", "conn", "vacuum", "checkpoint", "lock", "admin"] as const);

  if (variant === "perf") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      database: rand(["app", "analytics"]),
      queryId: randId(12).toLowerCase(),
      meanTimeMs: isErr ? randFloat(8000, 120000) : randFloat(2, 85),
      calls: randInt(12, 50000),
      sharedBlksHit: randInt(100, 5_000_000),
      waitEvent: isErr ? rand(["IO", "Lock", "Client"]) : "CPU",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.DBforPostgreSQL/servers"),
      azure: {
        database_for_postgresql: {
          server: srv,
          resource_group: resourceGroup,
          category: "PostgreSQLLogs",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("pg_stat_statements_sample"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e7, 2e9),
      },
      message: isErr
        ? `PostgreSQL ${srv}: slow query mean ${props.meanTimeMs.toFixed(0)}ms (${props.waitEvent})`
        : `PostgreSQL ${srv}: query stats OK mean ${props.meanTimeMs.toFixed(1)}ms`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "conn") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      database: rand(["app", "postgres"]),
      event: isErr ? "connection_failed" : "connection_authorized",
      user: rand(["app_rw", "reader"]),
      application: rand(["node-pg", "psql", "django"]),
      detail: isErr
        ? "password authentication failed for user"
        : "connection authorized: user mapping OK",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.DBforPostgreSQL/servers"),
      azure: {
        database_for_postgresql: {
          server: srv,
          resource_group: resourceGroup,
          category: "PostgreSQLLogs",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("connection_log"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e5, 5e7),
      },
      message: `PostgreSQL ${srv}: ${props.event} ${props.user} from ${callerIp}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "vacuum") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      database: rand(["app", "analytics"]),
      phase: isErr ? "ERROR" : rand(["scan heap", "truncate heap"]),
      deadTuples: isErr ? randInt(5e6, 2e8) : randInt(0, 8000),
      durationSec: randInt(2, 400),
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "autovacuum_log",
      category: "PostgreSQLLogs",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.phase,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.DBforPostgreSQL/servers"),
      azure: {
        database_for_postgresql: {
          server: srv,
          resource_group: resourceGroup,
          category: "PostgreSQLVacuum",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("autovacuum_log"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e9, 4e10),
      },
      message: isErr
        ? `PostgreSQL ${srv}: autovacuum error on ${props.database}`
        : `PostgreSQL ${srv}: vacuum ${props.phase} OK`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "checkpoint") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      buffersWritten: isErr ? randInt(0, 200) : randInt(5000, 500000),
      checkpointLagSec: isErr ? randFloat(120, 900) : randFloat(0.2, 35),
      walSizeMb: randInt(8, 8000),
      reason: isErr ? "Checkpoint request failed" : "time",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "checkpoint_complete",
      category: "PostgreSQLLogs",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.reason,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.DBforPostgreSQL/servers"),
      azure: {
        database_for_postgresql: {
          server: srv,
          resource_group: resourceGroup,
          category: "PostgreSQLCheckpoint",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("checkpoint_complete"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e9, 2e10),
      },
      message: isErr
        ? `PostgreSQL ${srv}: checkpoint lag ${props.checkpointLagSec}s`
        : `PostgreSQL ${srv}: checkpoint complete buffers=${props.buffersWritten}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "lock") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      relation: rand(["orders", "invoices"]),
      lockMode: isErr ? "ExclusiveLock" : "AccessShareLock",
      waitMs: isErr ? randInt(60000, 900000) : randInt(0, 250),
      blockedPid: randInt(10000, 50000),
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "blocked_session",
      category: "PostgreSQLLogs",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.lockMode,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.DBforPostgreSQL/servers"),
      azure: {
        database_for_postgresql: {
          server: srv,
          resource_group: resourceGroup,
          category: "PostgreSQLLocks",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("blocked_session"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e9, 3e11),
      },
      message: isErr
        ? `PostgreSQL ${srv}: session blocked ${props.waitMs}ms on ${props.relation}`
        : `PostgreSQL ${srv}: locks healthy on ${props.relation}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  const docErr = dataExtendedPickError(isErr);
  const props = {
    operation: rand(["restart", "skuChange"]),
    targetSku: rand(["GP_Standard_D4s_v3", "MO_Standard_E8ds_v4"]),
    state: isErr ? "Failed" : "Succeeded",
  };
  const propsForDoc = mergeDataExtendedArmProps(isErr, true, props, docErr);
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.DBforPostgreSQL/flexibleServers/write",
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.state,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: propsForDoc,
    cloud: azureCloud(region, subscription, "Microsoft.DBforPostgreSQL/servers"),
    azure: {
      database_for_postgresql: {
        server: srv,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: propsForDoc,
      },
    },
    event: {
      kind: "event",
      category: ["database"],
      type: isErr ? ["error"] : ["access"],
      action: String("Microsoft.DBforPostgreSQL/flexibleServers/write"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(4e10, 2e11),
    },
    message: isErr
      ? `PostgreSQL ${srv}: administrative ${props.operation} failed`
      : `PostgreSQL ${srv}: ${props.operation} -> ${props.state}`,
    ...(docErr ? { error: docErr } : {}),
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
  const variant = rand(["slow", "audit", "replica", "kill", "ddl", "admin"] as const);

  if (variant === "slow") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      schema: rand(["orders", "catalog"]),
      queryTimeSec: isErr ? randFloat(8, 120) : randFloat(0.02, 2),
      rowsExamined: isErr ? randInt(5e6, 5e8) : randInt(10, 5000),
      sqlText: isErr
        ? "SELECT * FROM line_items WHERE YEAR(created_at) = 2026"
        : "SELECT id FROM customers WHERE email = ? LIMIT 1",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.DBforMySQL/servers"),
      azure: {
        database_for_mysql: {
          server: srv,
          resource_group: resourceGroup,
          category: "MySqlSlowLogs",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("slow_query"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e7, 5e8),
      },
      message: isErr
        ? `MySQL ${srv}: slow query ${props.queryTimeSec.toFixed(2)}s rows=${props.rowsExamined}`
        : `MySQL ${srv}: query within threshold (${props.queryTimeSec.toFixed(3)}s)`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "audit") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      action: isErr ? "CONNECT_FAILED" : "CONNECT",
      user: rand(["app", "etl"]),
      ssl: true,
      detail: isErr ? "Access denied for user 'app'@'%'" : "SSL connection using TLS1.2",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.DBforMySQL/servers"),
      azure: {
        database_for_mysql: {
          server: srv,
          resource_group: resourceGroup,
          category: "MySqlAuditLogs",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("audit_log_connection"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e5, 3e7),
      },
      message: `MySQL ${srv}: ${props.action} ${props.user} — ${props.detail}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "replica") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      ioThread: isErr ? "Not running" : "Running",
      sqlThread: isErr ? "Not running" : "Running",
      lagSec: isErr ? randInt(60, 6000) : randInt(0, 25),
      lastError: isErr ? "Error 1236: log event entry exceeded max_allowed_packet" : "",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "SHOW_REPLICA_STATUS",
      category: "MySqlReplicationLogs",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.ioThread,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.DBforMySQL/servers"),
      azure: {
        database_for_mysql: {
          server: srv,
          resource_group: resourceGroup,
          category: "MySqlReplication",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("SHOW_REPLICA_STATUS"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e8, 3e10),
      },
      message: isErr
        ? `MySQL ${srv}: replication broken lag=${props.lagSec}s`
        : `MySQL ${srv}: replica healthy lag=${props.lagSec}s`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "kill") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      victimThread: randInt(1000, 500000),
      killedBy: isErr ? "watchdog_timeout" : "user",
      queryTimeSecBeforeKill: randFloat(1, 400),
      status: isErr ? "KillIgnored" : "Killed",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "mysql_kill_thread",
      category: "MySqlAdminLogs",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.status,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.DBforMySQL/servers"),
      azure: {
        database_for_mysql: {
          server: srv,
          resource_group: resourceGroup,
          category: "MySqlKill",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("mysql_kill_thread"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e8, 2e9),
      },
      message: isErr
        ? `MySQL ${srv}: kill ignored for thread ${props.victimThread}`
        : `MySQL ${srv}: terminated long query thread ${props.victimThread}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "ddl") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      ddlType: rand(["ALTER TABLE", "CREATE INDEX"]),
      tableName: rand(["customers", "line_items"]),
      durationSec: isErr ? randInt(300, 7200) : randInt(1, 90),
      lockWaitTimeout: isErr,
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ddl_audit",
      category: "MySqlSlowLogs",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.ddlType,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.DBforMySQL/servers"),
      azure: {
        database_for_mysql: {
          server: srv,
          resource_group: resourceGroup,
          category: "MySqlDdl",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("ddl_audit"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e10, 3e13),
      },
      message: isErr
        ? `MySQL ${srv}: DDL blocked on ${props.tableName}`
        : `MySQL ${srv}: ${props.ddlType} completed (${props.durationSec}s)`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  const docErr = dataExtendedPickError(isErr);
  const props = {
    sku: rand(["GP_Standard_D2ds_v4", "MO_Standard_E4ds_v4"]),
    state: isErr ? "Failed" : "Succeeded",
    operationType: rand(["MaintenanceWindowResize", "ParameterUpdate"]),
  };
  const propsForDoc = mergeDataExtendedArmProps(isErr, true, props, docErr);
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.DBforMySQL/flexibleServers/write",
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.state,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: propsForDoc,
    cloud: azureCloud(region, subscription, "Microsoft.DBforMySQL/servers"),
    azure: {
      database_for_mysql: {
        server: srv,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: propsForDoc,
      },
    },
    event: {
      kind: "event",
      category: ["database"],
      type: isErr ? ["error"] : ["access"],
      action: String("Microsoft.DBforMySQL/flexibleServers/write"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(2e11, 4e11),
    },
    message: isErr
      ? `MySQL ${srv}: administrative ${props.operationType} failed`
      : `MySQL ${srv}: ${props.operationType} ${props.state}`,
    ...(docErr ? { error: docErr } : {}),
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
  const variant = rand(["conn", "repl", "failover", "ddl", "tls", "admin"] as const);

  if (variant === "conn") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      threadId: randInt(10000, 999999),
      user: rand(["support", "app"]),
      database: rand(["inventory", "auth"]),
      status: isErr ? "Aborted_connection" : "Connect_OK",
      detail: isErr ? "Got timeout reading communication packets" : "",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.DBforMariaDB/servers"),
      azure: {
        database_for_mariadb: {
          server: srv,
          resource_group: resourceGroup,
          category: "MySqlAuditLogs",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("MariaDBConnection"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e5, 2e7),
      },
      message: isErr
        ? `MariaDB ${srv}: ${props.status} (${props.detail})`
        : `MariaDB ${srv}: connection thread ${props.threadId} OK`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "repl") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      role: "Replica",
      secondsBehindMaster: isErr ? randInt(120, 7200) : randInt(0, 8),
      ioRunning: isErr ? "No" : "Yes",
      sqlRunning: isErr ? "No" : "Yes",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.DBforMariaDB/servers"),
      azure: {
        database_for_mariadb: {
          server: srv,
          resource_group: resourceGroup,
          category: "MariaDBReplicationLag",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("replication_health"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e8, 3e9),
      },
      message: isErr
        ? `MariaDB ${srv}: replication lag ${props.secondsBehindMaster}s (IO=${props.ioRunning})`
        : `MariaDB ${srv}: replication within SLA (${props.secondsBehindMaster}s)`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "failover") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      event: rand(["planned_switchover", "unplanned"]),
      state: isErr ? "Rollback" : "Complete",
      cutoverSeconds: isErr ? randInt(90, 600) : randInt(8, 90),
      binlogGap: isErr ? randInt(1, 50) : 0,
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "MariaDB.FailoverOrchestration",
      category: "MariaDBReplicationLag",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.state,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.DBforMariaDB/servers"),
      azure: {
        database_for_mariadb: {
          server: srv,
          resource_group: resourceGroup,
          category: "MariaDBFailover",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("MariaDB.FailoverOrchestration"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e10, 2e11),
      },
      message: isErr
        ? `MariaDB ${srv}: failover ${props.event} failed (binlog_gap=${props.binlogGap})`
        : `MariaDB ${srv}: failover ${props.event} in ${props.cutoverSeconds}s`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "ddl") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      ddl: rand(["ALTER", "DROP INDEX"]),
      objectName: rand(["orders", "users"]),
      waitLockSec: isErr ? randFloat(300, 2500) : randFloat(0, 40),
      mdLConflict: isErr,
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "MariaDB.MetaDataLockAudit",
      category: "MySqlAuditLogs",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.ddl,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.DBforMariaDB/servers"),
      azure: {
        database_for_mariadb: {
          server: srv,
          resource_group: resourceGroup,
          category: "MariaDBDdl",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("MariaDB.MetaDataLockAudit"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e9, 9e11),
      },
      message: isErr
        ? `MariaDB ${srv}: MDL contention on ${props.objectName}`
        : `MariaDB ${srv}: ${props.ddl} completed without escalation`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "tls") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      cipher: isErr ? "" : rand(["ECDHE-RSA-AES256-GCM-SHA384"]),
      tlsVersionOffered: rand(["TLSv1", "TLSv1.3"]),
      handshakeResult: isErr ? "CERT_VERIFY_FAILED" : "OK",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "MariaDB.TlsHandshake",
      category: "MySqlAuditLogs",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.handshakeResult,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.DBforMariaDB/servers"),
      azure: {
        database_for_mariadb: {
          server: srv,
          resource_group: resourceGroup,
          category: "MariaDBTls",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("MariaDB.TlsHandshake"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e6, 4e9),
      },
      message: isErr
        ? `MariaDB ${srv}: TLS handshake ${props.handshakeResult}`
        : `MariaDB ${srv}: TLS ${props.tlsVersionOffered} negotiated (${props.cipher})`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  const docErr = dataExtendedPickError(isErr);
  const props = {
    sku: rand(["GP_Gen5_4", "BC_Gen5_8"]),
    state: isErr ? "Failed" : "Succeeded",
  };
  const propsForDoc = mergeDataExtendedArmProps(isErr, true, props, docErr);
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.DBforMariaDB/servers/write",
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.state,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: propsForDoc,
    cloud: azureCloud(region, subscription, "Microsoft.DBforMariaDB/servers"),
    azure: {
      database_for_mariadb: {
        server: srv,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: propsForDoc,
      },
    },
    event: {
      kind: "event",
      category: ["database"],
      type: isErr ? ["error"] : ["access"],
      action: String("Microsoft.DBforMariaDB/servers/write"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(3e11, 5e11),
    },
    message: isErr
      ? `MariaDB ${srv}: provisioning update failed`
      : `MariaDB ${srv}: administrative update succeeded`,
    ...(docErr ? { error: docErr } : {}),
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
  const variant = rand(["scan", "classify", "catalog", "glossary", "lineage", "admin"] as const);

  if (variant === "scan") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      dataSource: `adl://${`dl${randId(4)}`}.dfs.core.windows.net/fs`,
      scanId: randUUID(),
      status: isErr ? "Failed" : "Succeeded",
      assetsScanned: isErr ? randInt(0, 200) : randInt(500, 50000),
      detail: isErr ? "Scan rule set evaluation error: timeout contacting data plane" : "",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, true, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Purview/accounts"),
      azure: {
        purview: {
          account: acct,
          resource_group: resourceGroup,
          category: "PurviewScanRun",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("Microsoft.Purview/accounts/scans/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(6e9, 4e11),
      },
      message: isErr
        ? `Purview ${acct}: scan ${props.scanId} failed — ${props.detail}`
        : `Purview scan completed: ${props.assetsScanned} assets from ${props.dataSource}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "classify") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      classification: rand(["MICROSOFT.PERSONAL.NAME", "MICROSOFT.FINANCIAL.CREDIT_CARD"]),
      confidence: isErr ? randFloat(0.2, 0.5) : randFloat(0.82, 0.99),
      columnName: isErr ? "unknown_raw" : "customer_full_name",
      status: isErr ? "Rejected" : "Accepted",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Purview/accounts"),
      azure: {
        purview: {
          account: acct,
          resource_group: resourceGroup,
          category: "PurviewClassification",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("PurviewClassificationResult"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e7, 8e8),
      },
      message: isErr
        ? `Purview: low-confidence classification on ${props.columnName}`
        : `Purview classified ${props.classification} on ${props.columnName}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "catalog") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      operationUser: `entra:${randAzurePersonEmail()}`,
      entityType: rand(["azure_sql_table", "abfss_path"]),
      entityId: `/subscriptions/.../${randId(8)}`,
      changeType: isErr ? "DeleteDenied" : "UpsertEntity",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, true, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Purview/accounts"),
      azure: {
        purview: {
          account: acct,
          resource_group: resourceGroup,
          category: "PurviewCatalog",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("Microsoft.Purview/accounts/catalog/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e8, 4e9),
      },
      message: isErr
        ? `Purview catalog: ${props.changeType} denied for ${props.entityId}`
        : `Purview catalog: ${props.changeType} for ${props.entityType}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "glossary") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      termName: `term-${randId(5)}`,
      stewardGroup: rand(["data-gov", "privacy"]),
      publishState: isErr ? "ValidationFailed" : "Published",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Purview.GlossaryPublish",
      category: "PurviewGlossary",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.publishState,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Purview/accounts"),
      azure: {
        purview: {
          account: acct,
          resource_group: resourceGroup,
          category: "PurviewGlossary",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("Purview.GlossaryPublish"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e8, 3e9),
      },
      message: isErr
        ? `Purview glossary term ${props.termName} blocked`
        : `Purview glossary term ${props.termName} ${props.publishState}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "lineage") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      sourceEntity: `adf://pl_${randId(4)}`,
      sinkEntity: `synapse://pool1`,
      edgesMaterialized: isErr ? 0 : randInt(4, 400),
      parseErrors: isErr ? randInt(1, 80) : 0,
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Purview.LineageIngestion",
      category: "PurviewLineage",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.edgesMaterialized),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Purview/accounts"),
      azure: {
        purview: {
          account: acct,
          resource_group: resourceGroup,
          category: "PurviewLineage",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("Purview.LineageIngestion"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e8, 7e9),
      },
      message: isErr
        ? `Purview lineage ingest failed parseErrors=${props.parseErrors}`
        : `Purview lineage updated ${props.edgesMaterialized} edges`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  const docErr = dataExtendedPickError(isErr);
  const props = {
    sku: rand(["Standard", "Premium"]),
    state: isErr ? "Failed" : "Succeeded",
    privateEndpoint: rand(["pe-purview-1", "pe-purview-2"]),
  };
  const propsForDoc = mergeDataExtendedArmProps(isErr, true, props, docErr);
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.Purview/accounts/write",
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.state,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: propsForDoc,
    cloud: azureCloud(region, subscription, "Microsoft.Purview/accounts"),
    azure: {
      purview: {
        account: acct,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: propsForDoc,
      },
    },
    event: {
      kind: "event",
      category: ["database"],
      type: isErr ? ["error"] : ["access"],
      action: String("Microsoft.Purview/accounts/write"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(3e9, 1.5e11),
    },
    message: isErr
      ? `Purview account ${acct}: provisioning update failed`
      : `Purview account ${acct}: ${props.state}`,
    ...(docErr ? { error: docErr } : {}),
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
  const variant = rand(["pipeline", "activity", "trigger", "ir", "linked", "admin"] as const);

  if (variant === "pipeline") {
    const docErr = dataExtendedPickError(isErr);
    const runId = randUUID();
    const props = {
      pipelineName: `pl_${rand(["ingest", "curate", "export"])}`,
      runId,
      status: isErr ? "Failed" : "Succeeded",
      durationMs: isErr ? randInt(5000, 600000) : randInt(120000, 8_640_000),
      error: isErr ? "Self-hosted IR offline; cannot reach SQL MI" : "",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.DataFactory/factories"),
      azure: {
        data_factory: {
          factory,
          resource_group: resourceGroup,
          category: "PipelineRuns",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        outcome: isErr ? "failure" : "success",
        duration: (props.durationMs as number) * 1e6,
      },
      message: isErr
        ? `ADF ${factory}: pipeline ${props.pipelineName} failed (${runId})`
        : `ADF ${factory}: pipeline ${props.pipelineName} OK in ${props.durationMs}ms`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "activity") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      activityName: rand(["CopyData1", "LookupKeys", "ExecuteStoredProc"]),
      activityType: rand(["Copy", "Lookup", "SqlServerStoredProcedure"]),
      status: isErr ? "Failed" : "Succeeded",
      integrationRuntime: `ir-${rand(["shared", "prod"])}`,
      detail: isErr ? "Sink write throttled by destination DWU cap" : "",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.DataFactory/factories"),
      azure: {
        data_factory: {
          factory,
          resource_group: resourceGroup,
          category: "ActivityRuns",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("ActivityRun"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e8, 9e10),
      },
      message: isErr
        ? `ADF activity ${props.activityName} failed: ${props.detail}`
        : `ADF activity ${props.activityName} (${props.activityType}) completed`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "trigger") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      triggerName: `tr_${rand(["daily", "tumble"])}_${randId(4)}`,
      triggerType: rand(["ScheduleTrigger", "BlobEventsTrigger"]),
      fired: !isErr,
      schedule: "0 15 * * *",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.DataFactory/factories"),
      azure: {
        data_factory: {
          factory,
          resource_group: resourceGroup,
          category: "TriggerRuns",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("TriggerRun"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e7, 5e8),
      },
      message: isErr
        ? `ADF trigger ${props.triggerName} did not fire (validation error)`
        : `ADF trigger ${props.triggerName} fired (${props.triggerType})`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "ir") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      irName: `ir-${rand(["sh", "prod"])}-${randId(3)}`,
      status: isErr ? "Offline" : "Online",
      registeredNodes: isErr ? 0 : randInt(1, 8),
      lastHeartbeatSec: isErr ? randInt(120, 3600) : randInt(1, 45),
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, true, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.DataFactory/factories/integrationRuntimes/write",
      category: "IntegrationRuntime",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.status,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.DataFactory/factories"),
      azure: {
        data_factory: {
          factory,
          resource_group: resourceGroup,
          category: "IntegrationRuntime",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("Microsoft.DataFactory/factories/integrationRuntimes/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e8, 6e9),
      },
      message: isErr
        ? `ADF IR ${props.irName} offline (no heartbeat ${props.lastHeartbeatSec}s)`
        : `ADF IR ${props.irName} healthy nodes=${props.registeredNodes}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "linked") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      linkedService: `ls_${rand(["sqlmi", "blob", "kv"])}`,
      testConnection: isErr ? "Failed" : "Succeeded",
      detail: isErr ? "Token refresh failed for Key Vault linked service" : "",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "LinkedService.TestConnection",
      category: "LinkedServices",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.testConnection,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.DataFactory/factories"),
      azure: {
        data_factory: {
          factory,
          resource_group: resourceGroup,
          category: "LinkedServices",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("LinkedService.TestConnection"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e7, 4e9),
      },
      message: isErr
        ? `ADF linked service ${props.linkedService} test failed: ${props.detail}`
        : `ADF linked service ${props.linkedService} OK`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  const docErr = dataExtendedPickError(isErr);
  const props = {
    change: rand(["gitModeToggle", "managedVnetEnable"]),
    state: isErr ? "Failed" : "Succeeded",
  };
  const propsForDoc = mergeDataExtendedArmProps(isErr, true, props, docErr);
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.DataFactory/factories/write",
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.state,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: propsForDoc,
    cloud: azureCloud(region, subscription, "Microsoft.DataFactory/factories"),
    azure: {
      data_factory: {
        factory,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: propsForDoc,
      },
    },
    event: {
      kind: "event",
      category: ["database"],
      type: isErr ? ["error"] : ["access"],
      action: String("Microsoft.DataFactory/factories/write"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(5e9, 1.8e11),
    },
    message: isErr
      ? `ADF factory ${factory}: administrative ${props.change} failed`
      : `ADF factory ${factory}: ${props.change} ${props.state}`,
    ...(docErr ? { error: docErr } : {}),
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
  const variant = rand(["lifecycle", "io", "watermark", "compile", "autoscale", "compat"] as const);

  if (variant === "lifecycle") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      operation: isErr ? "StopJob" : rand(["StartJob", "StopJob"]),
      state: isErr ? "Failed" : rand(["Running", "Stopped"]),
      detail: isErr ? "Job failed to stop: output sink checkpoint lock" : "",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, true, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.StreamAnalytics/streamingjobs"),
      azure: {
        stream_analytics: {
          job,
          resource_group: resourceGroup,
          category: "StreamingJobLifecycle",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String(
          `Microsoft.StreamAnalytics/streamingjobs/${props.operation === "StartJob" ? "start" : "stop"}`
        ),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e8, 1.2e10),
      },
      message: isErr
        ? `ASA ${job}: lifecycle ${props.operation} failed — ${props.detail}`
        : `ASA ${job}: ${props.operation} -> ${props.state}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "io") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      direction: rand(["Input", "Output"] as const),
      alias: isErr ? "blob_out" : "eventhub_in",
      records: isErr ? 0 : randInt(100, 5_000_000),
      errors: isErr ? randInt(50, 5000) : 0,
      detail: isErr ? "Serialization failure converting JSON field 'amount'" : "",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.StreamAnalytics/streamingjobs"),
      azure: {
        stream_analytics: {
          job,
          resource_group: resourceGroup,
          category: "StreamingIOEvents",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("StreamingIO"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e7, 4e8),
      },
      message: isErr
        ? `ASA ${job}: ${props.direction} ${props.alias} errors=${props.errors} ${props.detail}`
        : `ASA ${job}: processed ${props.records} records on ${props.alias}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "watermark") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      watermark: `2026-05-0${randInt(1, 7)}T${randInt(10, 18)}:${randInt(10, 59)}:00Z`,
      latenessSec: isErr ? randInt(120, 900) : randInt(0, 12),
      state: isErr ? "Backpressure" : "Current",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.StreamAnalytics/streamingjobs"),
      azure: {
        stream_analytics: {
          job,
          resource_group: resourceGroup,
          category: "StreamingDiagnostics",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("StreamingWatermark"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e8, 2e9),
      },
      message: isErr
        ? `ASA ${job}: watermark behind; lateness ${props.latenessSec}s (${props.state})`
        : `ASA ${job}: watermark ${props.watermark} within tolerance`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "compile") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      queryHash: randId(24),
      diagnostics: isErr ? "Column 'foo' not recognized" : "",
      state: isErr ? "Failed" : "Succeeded",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ASA.CompileQuery",
      category: "StreamingCompile",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.state,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.StreamAnalytics/streamingjobs"),
      azure: {
        stream_analytics: {
          job,
          resource_group: resourceGroup,
          category: "StreamingCompile",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("ASA.CompileQuery"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e7, 9e8),
      },
      message: isErr
        ? `ASA ${job}: query compile failed (${props.diagnostics})`
        : `ASA ${job}: compile OK hash=${props.queryHash}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "autoscale") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      suBefore: rand([3, 6, 12]),
      suAfter: isErr ? rand([3, 6, 12]) : rand([18, 24, 36]),
      reason: isErr ? "Scaling blocked by subscription cap" : "Ingress spike",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, true, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.StreamAnalytics/streamingjobs/scale",
      category: "StreamingAutoscale",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.suAfter),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.StreamAnalytics/streamingjobs"),
      azure: {
        stream_analytics: {
          job,
          resource_group: resourceGroup,
          category: "StreamingAutoscale",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("Microsoft.StreamAnalytics/streamingjobs/scale"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e8, 5e9),
      },
      message: isErr
        ? `ASA ${job}: autoscale failed — ${props.reason}`
        : `ASA ${job}: streaming units ${props.suBefore} -> ${props.suAfter}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  const docErr = dataExtendedPickError(isErr);
  const props = {
    runtime: rand(["1.2", "1.5"]),
    udfCompatibility: isErr ? "BreakingChange" : "OK",
    detail: isErr ? "Obsolete built-in AVG overload removed" : "",
  };
  const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "ASA.RuntimeCompatibilityScan",
    category: "StreamingDiagnostics",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.udfCompatibility,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: propsForDoc,
    cloud: azureCloud(region, subscription, "Microsoft.StreamAnalytics/streamingjobs"),
    azure: {
      stream_analytics: {
        job,
        resource_group: resourceGroup,
        category: "StreamingCompat",
        correlation_id: correlationId,
        properties: propsForDoc,
      },
    },
    event: {
      kind: "event",
      category: ["database"],
      type: isErr ? ["error"] : ["access"],
      action: String("ASA.RuntimeCompatibilityScan"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(3e7, 2e9),
    },
    message: isErr
      ? `ASA ${job}: runtime ${props.runtime} incompatible — ${props.detail}`
      : `ASA ${job}: compatibility scan OK (${props.runtime})`,
    ...(docErr ? { error: docErr } : {}),
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
  const variant = rand(["model", "twin", "route", "query", "relationship", "admin"] as const);

  if (variant === "model") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      modelId: `dtmi:meridiantech:${rand(["Factory", "Sensor"])};${randInt(1, 3)}`,
      operation: isErr ? "CreateModels" : rand(["CreateModels", "DeleteModels"]),
      status: isErr ? "InvalidModel" : "OK",
      detail: isErr ? "DTDL validation: duplicate property ids in interface" : "",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, true, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.DigitalTwins/digitalTwinsInstances"),
      azure: {
        digital_twins: {
          instance: inst,
          resource_group: resourceGroup,
          category: "Models",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("Microsoft.DigitalTwins/models/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e8, 5e9),
      },
      message: isErr
        ? `Digital Twins ${inst}: model ${props.modelId} invalid — ${props.detail}`
        : `Digital Twins ${inst}: ${props.operation} ${props.modelId}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "twin") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      twinId: `twin-${randId(8)}`,
      operation: isErr ? "PatchTwin" : rand(["CreateTwin", "DeleteTwin"]),
      status: isErr ? "Conflict" : "OK",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, true, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.DigitalTwins/digitalTwinsInstances"),
      azure: {
        digital_twins: {
          instance: inst,
          resource_group: resourceGroup,
          category: "TwinLifecycle",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("Microsoft.DigitalTwins/twins/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e8, 3e9),
      },
      message: isErr
        ? `ADT ${inst}: twin ${props.twinId} patch conflict`
        : `ADT ${inst}: ${props.operation} ${props.twinId}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "route") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      endpoint: `https://func-${randId(4)}.azurewebsites.net/api/twin-notification`,
      delivered: !isErr,
      retryCount: isErr ? randInt(3, 12) : 0,
      detail: isErr ? "Event Grid delivery failed with HTTP 503" : "",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.DigitalTwins/digitalTwinsInstances"),
      azure: {
        digital_twins: {
          instance: inst,
          resource_group: resourceGroup,
          category: "Routing",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("Microsoft.DigitalTwins/eventRoutes/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e7, 2e9),
      },
      message: isErr
        ? `ADT route to ${props.endpoint} failed after ${props.retryCount} retries`
        : `ADT routing delivered to ${props.endpoint}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "query") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      queryChars: randInt(40, 4000),
      resultCount: isErr ? -1 : randInt(0, 500),
      throttleCode: isErr ? "TooManyRequests" : "OK",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ADT.Query",
      category: "QueryService",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.throttleCode,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.DigitalTwins/digitalTwinsInstances"),
      azure: {
        digital_twins: {
          instance: inst,
          resource_group: resourceGroup,
          category: "AdtQuery",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("ADT.Query"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e7, 3e10),
      },
      message: isErr
        ? `ADT ${inst}: twin graph query rejected (${props.throttleCode})`
        : `ADT ${inst}: query returned ${props.resultCount} twins`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "relationship") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      relationshipId: `rel-${randId(12)}`,
      sourceTwin: `twin-${randId(6)}`,
      targetTwin: `twin-${randId(6)}`,
      status: isErr ? "CardinalityViolation" : "Created",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, true, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.DigitalTwins/relationships/write",
      category: "Relationships",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.status,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.DigitalTwins/digitalTwinsInstances"),
      azure: {
        digital_twins: {
          instance: inst,
          resource_group: resourceGroup,
          category: "Relationships",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("Microsoft.DigitalTwins/relationships/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(8e8, 4e9),
      },
      message: isErr
        ? `ADT ${inst}: relationship create failed (${props.relationshipId})`
        : `ADT ${inst}: relationship ${props.status} ${props.relationshipId}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  const docErr = dataExtendedPickError(isErr);
  const props = {
    sku: rand(["S1", "S2"]),
    publicNetworkAccess: isErr ? "DisabledConflict" : "Enabled",
    state: isErr ? "Failed" : "Succeeded",
  };
  const propsForDoc = mergeDataExtendedArmProps(isErr, true, props, docErr);
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.DigitalTwins/digitalTwinsInstances/write",
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.state,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: propsForDoc,
    cloud: azureCloud(region, subscription, "Microsoft.DigitalTwins/digitalTwinsInstances"),
    azure: {
      digital_twins: {
        instance: inst,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: propsForDoc,
      },
    },
    event: {
      kind: "event",
      category: ["database"],
      type: isErr ? ["error"] : ["access"],
      action: String("Microsoft.DigitalTwins/digitalTwinsInstances/write"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(2e9, 9e11),
    },
    message: isErr
      ? `ADT ${inst}: administrative update failed (${props.publicNetworkAccess})`
      : `ADT ${inst}: instance patched ${props.sku}`,
    ...(docErr ? { error: docErr } : {}),
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
  const variant = rand(["scale", "health", "workload", "script", "disk", "upgrade"] as const);

  if (variant === "scale") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      previousWorkers: randInt(3, 12),
      targetWorkers: isErr ? randInt(3, 12) : randInt(13, 36),
      status: isErr ? "Failed" : "Succeeded",
      detail: isErr ? "Scale-up blocked: insufficient quota for Standard_D8s_v5 in region" : "",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, true, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.HDInsight/clusters"),
      azure: {
        hdinsight: {
          cluster,
          resource_group: resourceGroup,
          category: "ClusterResize",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("Microsoft.HDInsight/clusters/resize"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e9, 6e10),
      },
      message: isErr
        ? `HDInsight ${cluster}: resize failed — ${props.detail}`
        : `HDInsight ${cluster}: workers ${props.previousWorkers} -> ${props.targetWorkers}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "health") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      component: rand(["HeadNode", "WorkerNode", "Zookeeper"]),
      state: isErr ? "Unhealthy" : "Healthy",
      detail: isErr ? ambariUnhealthy() : "Ambari heartbeats OK",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.HDInsight/clusters"),
      azure: {
        hdinsight: {
          cluster,
          resource_group: resourceGroup,
          category: "ClusterHealth",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("Microsoft.HDInsight/clusters/read"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e8, 3e9),
      },
      message: `HDInsight ${cluster} ${props.component}: ${props.state} — ${props.detail}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "workload") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      engine: rand(["Spark", "Hive"]),
      operation: rand(["SELECT", "INSERT_OVERWRITE"]),
      appId: `application_${randInt(1e9, 2e9)}`,
      durationSec: isErr ? randInt(30, 600) : randInt(8, 400),
      status: isErr ? "FAILED" : "SUCCEEDED",
      detail: isErr ? "Container killed by YARN for exceeding memory limits" : "",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.HDInsight/clusters"),
      azure: {
        hdinsight: {
          cluster,
          resource_group: resourceGroup,
          category: "WorkloadDiagnostics",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        outcome: isErr ? "failure" : "success",
        duration: (props.durationSec as number) * 1e9,
      },
      message: isErr
        ? `HDInsight ${props.engine} app ${props.appId} ${props.status}: ${props.detail}`
        : `HDInsight ${props.engine} ${props.operation} finished in ${props.durationSec}s`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "script") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      scriptUri: `https://st${randId(6)}.blob.core.windows.net/scripts/init-${randId(4)}.sh`,
      exitCode: isErr ? randInt(1, 127) : 0,
      runOn: rand(["worker", "head"]),
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.HDInsight/clusters/extensions/scriptAction",
      category: "ScriptAction",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.exitCode),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.HDInsight/clusters"),
      azure: {
        hdinsight: {
          cluster,
          resource_group: resourceGroup,
          category: "ScriptAction",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("Microsoft.HDInsight/clusters/extensions/scriptAction"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e9, 4e10),
      },
      message: isErr
        ? `HDInsight ${cluster}: script action failed exit=${props.exitCode}`
        : `HDInsight ${cluster}: script action OK on ${props.runOn}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "disk") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      mountPoint: rand(["/mnt/resource", "/tmp"]),
      usedPercent: isErr ? randInt(92, 100) : randInt(40, 75),
      inodePercent: isErr ? randInt(95, 100) : randInt(5, 60),
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "HDInsight.DiskMonitor",
      category: "ClusterHealth",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(props.usedPercent),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.HDInsight/clusters"),
      azure: {
        hdinsight: {
          cluster,
          resource_group: resourceGroup,
          category: "DiskPressure",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("HDInsight.DiskMonitor"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e8, 2e9),
      },
      message: isErr
        ? `HDInsight ${cluster}: disk pressure ${props.mountPoint} ${props.usedPercent}%`
        : `HDInsight ${cluster}: disk usage OK ${props.mountPoint}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  const docErr = dataExtendedPickError(isErr);
  const props = {
    fromVersion: rand(["5.1", "4.0"]),
    toVersion: rand(["5.1", "5.2"]),
    state: isErr ? "RolledBack" : "Completed",
  };
  const propsForDoc = mergeDataExtendedArmProps(isErr, true, props, docErr);
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.HDInsight/clusters/upgrade",
    category: "ClusterUpgrade",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.state,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: propsForDoc,
    cloud: azureCloud(region, subscription, "Microsoft.HDInsight/clusters"),
    azure: {
      hdinsight: {
        cluster,
        resource_group: resourceGroup,
        category: "ClusterUpgrade",
        correlation_id: correlationId,
        properties: propsForDoc,
      },
    },
    event: {
      kind: "event",
      category: ["database"],
      type: isErr ? ["error"] : ["access"],
      action: String("Microsoft.HDInsight/clusters/upgrade"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(6e10, 3e12),
    },
    message: isErr
      ? `HDInsight ${cluster}: upgrade ${props.fromVersion}->${props.toVersion} rolled back`
      : `HDInsight ${cluster}: runtime upgrade ${props.state}`,
    ...(docErr ? { error: docErr } : {}),
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
  const variant = rand(["query", "refresh", "power", "trace", "partition", "admin"] as const);

  if (variant === "query") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      database: rand(["Finance", "Sales"]),
      durationMs: isErr ? randInt(8000, 120000) : randInt(20, 2500),
      cpuMs: randInt(5, 800),
      rowCount: isErr ? 0 : randInt(100, 2_000_000),
      error: isErr ? "Query cancelled: memory limit for session exceeded" : "",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.AnalysisServices/servers"),
      azure: {
        analysis_services: {
          server,
          resource_group: resourceGroup,
          category: "Query",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        outcome: isErr ? "failure" : "success",
        duration: (props.durationMs as number) * 1e6,
      },
      message: isErr
        ? `AAS ${server}: query error — ${props.error}`
        : `AAS ${server}: query on ${props.database} ${props.durationMs}ms rows=${props.rowCount}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "refresh") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      model: rand(["SalesModel", "OpsSemantic"]),
      status: isErr ? "Failed" : "Succeeded",
      tablesRefreshed: isErr ? randInt(0, 3) : randInt(4, 80),
      durationSec: isErr ? randInt(60, 600) : randInt(120, 7200),
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.AnalysisServices/servers"),
      azure: {
        analysis_services: {
          server,
          resource_group: resourceGroup,
          category: "Model",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        outcome: isErr ? "failure" : "success",
        duration: (props.durationSec as number) * 1e9,
      },
      message: isErr
        ? `AAS ${server}: model refresh ${props.model} failed`
        : `AAS ${server}: refreshed ${props.tablesRefreshed} tables on ${props.model}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "power") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      operation: isErr ? "resume" : rand(["suspend", "resume"] as const),
      state: isErr ? "Failed" : rand(["paused", "succeeded"] as const),
      detail: isErr ? "Server could not resume: transient ARM lock" : "",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, true, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.AnalysisServices/servers"),
      azure: {
        analysis_services: {
          server,
          resource_group: resourceGroup,
          category: "Resource",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String(`Microsoft.AnalysisServices/servers/${props.operation}`),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e8, 6e9),
      },
      message: isErr
        ? `AAS ${server}: ${props.operation} failed — ${props.detail}`
        : `AAS ${server}: ${props.operation} -> ${props.state}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "trace") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      severity: rand(["Medium", "High"]),
      subsystem: rand(["Connectivity", "StorageEngine"]),
      text: isErr ? "OLE DB error: Named pipe handshake failed" : "Profiler trace started",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "TraceEvent",
      category: "Engine",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.severity,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.AnalysisServices/servers"),
      azure: {
        analysis_services: {
          server,
          resource_group: resourceGroup,
          category: "Trace",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("TraceEvent"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(8e8, 2e10),
      },
      message: isErr
        ? `AAS ${server}: subsystem ${props.subsystem} logged error`
        : `AAS ${server}: ${props.text}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "partition") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      tablePartition: `[Sales].[FactOrders].[${randId(4)}]`,
      mode: rand(["Incremental", "Full"]),
      rowsProcessed: isErr ? 0 : randInt(1e4, 2e9),
      status: isErr ? "Error" : "Completed",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "TABULAR_PARTITION_PROCESS",
      category: "Model",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.status,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.AnalysisServices/servers"),
      azure: {
        analysis_services: {
          server,
          resource_group: resourceGroup,
          category: "PartitionProcessing",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("TABULAR_PARTITION_PROCESS"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e11, 3e13),
      },
      message: isErr
        ? `AAS ${server}: partition process failed (${props.tablePartition})`
        : `AAS ${server}: partition ${props.mode} rows=${props.rowsProcessed}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  const docErr = dataExtendedPickError(isErr);
  const props = {
    sku: rand(["S0", "S2", "S4"]),
    state: isErr ? "Failed" : "Succeeded",
    backupStorageRedundancy: rand(["GeoRedundant", "LocallyRedundant"]),
  };
  const propsForDoc = mergeDataExtendedArmProps(isErr, true, props, docErr);
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.AnalysisServices/servers/write",
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.state,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: propsForDoc,
    cloud: azureCloud(region, subscription, "Microsoft.AnalysisServices/servers"),
    azure: {
      analysis_services: {
        server,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: propsForDoc,
      },
    },
    event: {
      kind: "event",
      category: ["database"],
      type: isErr ? ["error"] : ["access"],
      action: String("Microsoft.AnalysisServices/servers/write"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(2e11, 4e11),
    },
    message: isErr
      ? `AAS ${server}: server provisioning update failed`
      : `AAS ${server}: patch applied ${props.sku}`,
    ...(docErr ? { error: docErr } : {}),
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
  const variant = rand([
    "capacity",
    "dataset",
    "workspace",
    "gateway",
    "export",
    "semantic",
  ] as const);

  if (variant === "capacity") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      operation: isErr
        ? "ScaleCapacity"
        : rand(["ResumeCapacity", "PauseCapacity", "ScaleCapacity"]),
      skuTier: rand(["A1", "A3", "A6"]),
      targetSku: isErr ? "A1" : rand(["A3", "A6"]),
      state: isErr ? "Failed" : "Succeeded",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, true, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.PowerBIDedicated/capacities"),
      azure: {
        power_bi_embedded: {
          capacity: cap,
          resource_group: resourceGroup,
          category: "Administrative",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String(`Microsoft.PowerBIDedicated/capacities/${props.operation}`),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e8, 1.2e10),
      },
      message: isErr
        ? `Power BI Embedded ${cap}: ${props.operation} failed`
        : `Power BI Embedded ${cap}: ${props.operation} ${props.skuTier} -> ${props.targetSku}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "dataset") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      workspaceId: randUUID(),
      datasetName: rand(["Sales", "Ops", "FinanceMetrics"]),
      operation: rand(["RefreshDataset", "Import"]),
      status: isErr ? "Failed" : "Completed",
      durationSec: isErr ? randInt(30, 400) : randInt(10, 180),
      detail: isErr ? "Refresh failed: gateway not reachable" : "",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.PowerBIDedicated/capacities"),
      azure: {
        power_bi_embedded: {
          capacity: cap,
          resource_group: resourceGroup,
          category: "DatasetOperations",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        outcome: isErr ? "failure" : "success",
        duration: (props.durationSec as number) * 1e9,
      },
      message: isErr
        ? `PBI dataset ${props.datasetName} refresh failed: ${props.detail}`
        : `PBI dataset ${props.datasetName} ${props.operation} in ${props.durationSec}s`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "workspace") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      workspaceName: `ws-${randId(5)}`,
      adminGroup: rand(["bi-admins", "finance-readers"]),
      assignSuccess: !isErr,
      detail: isErr ? "License assignment capped for Premium Per User" : "",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "PowerBI.WorkspaceRbacAudit",
      category: "WorkspaceOps",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.assignSuccess ? "OK" : "Denied",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.PowerBIDedicated/capacities"),
      azure: {
        power_bi_embedded: {
          capacity: cap,
          resource_group: resourceGroup,
          category: "WorkspaceOps",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("PowerBI.WorkspaceRbacAudit"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(6e8, 3e10),
      },
      message: isErr
        ? `PBI workspace ${props.workspaceName}: RBAC issue — ${props.detail}`
        : `PBI workspace ${props.workspaceName}: role assigned`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "gateway") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      gatewayCluster: `gw-${randId(4)}`,
      memberStatus: isErr ? "Unreachable" : "Online",
      lastSuccessfulQueryUtc: time,
      errors24h: isErr ? randInt(10, 500) : randInt(0, 12),
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.PowerBIDedicated/capacities/gatewayHealth",
      category: "GatewayHealth",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.memberStatus,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.PowerBIDedicated/capacities"),
      azure: {
        power_bi_embedded: {
          capacity: cap,
          resource_group: resourceGroup,
          category: "GatewayHealth",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("Microsoft.PowerBIDedicated/capacities/gatewayHealth"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e10, 3e11),
      },
      message: isErr
        ? `PBI gateway ${props.gatewayCluster} unhealthy (${props.errors24h} errors)`
        : `PBI gateway cluster ${props.gatewayCluster}: members OK`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "export") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      format: rand(["CSV", "Parquet"]),
      rowsExported: isErr ? 0 : randInt(1000, 5e6),
      exportId: randUUID(),
      status: isErr ? "TimedOut" : "Completed",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "PowerBI.ExportReport",
      category: "Exports",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.status,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.PowerBIDedicated/capacities"),
      azure: {
        power_bi_embedded: {
          capacity: cap,
          resource_group: resourceGroup,
          category: "Export",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("PowerBI.ExportReport"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e10, 2e13),
      },
      message: isErr
        ? `PBI export ${props.exportId} ${props.status}`
        : `PBI export OK ${props.rowsExported} rows as ${props.format}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  const docErr = dataExtendedPickError(isErr);
  const props = {
    semanticModelId: randUUID(),
    daxCompilationMs: isErr ? randInt(8000, 120000) : randInt(5, 400),
    status: isErr ? "CompileError" : "OK",
    errorLine: isErr ? randInt(1, 200) : 0,
  };
  const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "SemanticModel.CompileTelemetry",
    category: "SemanticModelOps",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.status,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: propsForDoc,
    cloud: azureCloud(region, subscription, "Microsoft.PowerBIDedicated/capacities"),
    azure: {
      power_bi_embedded: {
        capacity: cap,
        resource_group: resourceGroup,
        category: "SemanticCompilation",
        correlation_id: correlationId,
        properties: propsForDoc,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: (props.daxCompilationMs as number) * 1e6,
    },
    message: isErr
      ? `PBI semantic compile error line ${props.errorLine}`
      : `PBI semantic model compile ${props.status} (${props.daxCompilationMs}ms)`,
    ...(docErr ? { error: docErr } : {}),
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
  const variant = rand([
    "capacity",
    "workspace",
    "lakehouse",
    "pipeline",
    "eventstream",
    "dom",
  ] as const);

  if (variant === "capacity") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      operation: isErr
        ? "UpdateCapacity"
        : rand(["CreateCapacity", "SuspendCapacity", "ResumeCapacity"]),
      capacityUnit: rand([2, 4, 8, 16, 32]),
      state: isErr ? "Failed" : "Succeeded",
      detail: isErr ? "Capacity SKU not available in selected region" : "",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, true, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Fabric/capacities"),
      azure: {
        microsoft_fabric: {
          capacity: cap,
          resource_group: resourceGroup,
          category: "FabricCapacityManagement",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String(`Microsoft.Fabric/capacities/${props.operation}`),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e8, 1.5e10),
      },
      message: isErr
        ? `Fabric capacity ${cap}: ${props.operation} failed — ${props.detail}`
        : `Fabric capacity ${cap}: ${props.operation} OK (units=${props.capacityUnit})`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "workspace") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      workspaceId: randUUID(),
      workspaceName: `ws-${rand(["analytics", "finance", "eng"])}-${randId(3)}`,
      event: isErr ? "AssignmentFailed" : rand(["Created", "Updated", "RoleChanged"]),
      principal: `group:${randUUID()}`,
      detail: isErr ? "Workspace RBAC propagation failed downstream" : "",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, true, props, docErr);
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
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Fabric/capacities"),
      azure: {
        microsoft_fabric: {
          capacity: cap,
          resource_group: resourceGroup,
          category: "FabricWorkspaceEvents",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("Microsoft.Fabric/workspaces/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e8, 5e9),
      },
      message: isErr
        ? `Fabric workspace ${props.workspaceName}: ${props.event} ${props.detail}`
        : `Fabric workspace ${props.workspaceName}: ${props.event} for ${props.principal}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "lakehouse") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      lakehouse: `lh-${randId(4)}`,
      filesIngested: isErr ? 0 : randInt(1000, 2e9),
      commitStatus: isErr ? "Rejected" : "Committed",
      deltaLogs: randInt(1, 400),
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Fabric.LakehouseTableMaintenance",
      category: "LakehouseMaintenance",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.commitStatus,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Fabric/capacities"),
      azure: {
        microsoft_fabric: {
          capacity: cap,
          resource_group: resourceGroup,
          category: "Lakehouse",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("Fabric.LakehouseTableMaintenance"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e10, 3e13),
      },
      message: isErr
        ? `Fabric lakehouse ${props.lakehouse}: optimization commit ${props.commitStatus}`
        : `Fabric lakehouse ${props.lakehouse}: ingested ${props.filesIngested} files`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "pipeline") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      orchestrationId: randUUID(),
      activityCount: randInt(3, 80),
      status: isErr ? "ChildFailed" : "Succeeded",
      failedActivity: isErr ? "Copy_Activity_ToLake" : "",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Fabric.PipelineRunTelemetry",
      category: "DataFactoryCompat",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.status,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Fabric/capacities"),
      azure: {
        microsoft_fabric: {
          capacity: cap,
          resource_group: resourceGroup,
          category: "FabricPipeline",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("Fabric.PipelineRunTelemetry"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e11, 2e13),
      },
      message: isErr
        ? `Fabric pipeline orchestration failed on ${props.failedActivity}`
        : `Fabric pipeline OK activities=${props.activityCount}`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  if (variant === "eventstream") {
    const docErr = dataExtendedPickError(isErr);
    const props = {
      streamName: `es_${randId(5)}`,
      throughputKbps: isErr ? randInt(10, 200) : randInt(500, 45000),
      lagMs: isErr ? randInt(5000, 120000) : randInt(0, 500),
      state: isErr ? "Throttle" : "Healthy",
    };
    const propsForDoc = mergeDataExtendedArmProps(isErr, false, props, docErr);
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Fabric.EventStream.Health",
      category: "EventStreamTelemetry",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.state,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Information",
      properties: propsForDoc,
      cloud: azureCloud(region, subscription, "Microsoft.Fabric/capacities"),
      azure: {
        microsoft_fabric: {
          capacity: cap,
          resource_group: resourceGroup,
          category: "Eventstream",
          correlation_id: correlationId,
          properties: propsForDoc,
        },
      },
      event: {
        kind: "event",
        category: ["database"],
        type: isErr ? ["error"] : ["access"],
        action: String("Fabric.EventStream.Health"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e11, 3e13),
      },
      message: isErr
        ? `Fabric eventstream ${props.streamName} backlog ${props.lagMs}ms`
        : `Fabric eventstream ${props.streamName} throughput ${props.throughputKbps} KB/s`,
      ...(docErr ? { error: docErr } : {}),
    };
  }

  const docErr = dataExtendedPickError(isErr);
  const props = {
    domainId: randUUID(),
    domainName: rand(["engineering", "sales-analytics"]),
    publishState: isErr ? "BlockPolicy" : "Ready",
    itemCount: isErr ? randInt(0, 50) : randInt(120, 5000),
  };
  const propsForDoc = mergeDataExtendedArmProps(isErr, true, props, docErr);
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.Fabric/domains/write",
    category: "FabricDomainProvisioning",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: props.publishState,
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Information",
    properties: propsForDoc,
    cloud: azureCloud(region, subscription, "Microsoft.Fabric/capacities"),
    azure: {
      microsoft_fabric: {
        capacity: cap,
        resource_group: resourceGroup,
        category: "FabricDomain",
        correlation_id: correlationId,
        properties: propsForDoc,
      },
    },
    event: {
      kind: "event",
      category: ["database"],
      type: isErr ? ["error"] : ["access"],
      action: String("Microsoft.Fabric/domains/write"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(2e11, 3e13),
    },
    message: isErr
      ? `Fabric domain ${props.domainName} publish blocked (${props.publishState})`
      : `Fabric domain ${props.domainName} staged ${props.itemCount} endorsed items`,
    ...(docErr ? { error: docErr } : {}),
  };
}
