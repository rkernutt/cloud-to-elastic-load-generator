import {
  type EcsDocument,
  rand,
  randInt,
  randId,
  azureCloud,
  makeAzureSetup,
  randCorrelationId,
} from "./helpers.js";

export function generateBlobStorageLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const account = `st${randId(10).toLowerCase()}`;
  const container = rand(["raw", "curated", "exports", "logs", "archive"]);
  const blob = `${randId(8).toLowerCase()}.parquet`;
  const correlationId = randCorrelationId();
  const callerIp = `${randInt(10, 223)}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`;
  const resourceId = `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Storage/storageAccounts/${account}`;
  const style = rand([
    "StorageRead",
    "StorageWrite",
    "StorageDelete",
    "Authentication",
    "Lifecycle",
  ] as const);
  const failed = isErr || style === "Authentication";

  const opMap: Record<typeof style, string> = {
    StorageRead: "GetBlob",
    StorageWrite: "PutBlob",
    StorageDelete: "DeleteBlob",
    Authentication: "GetBlob",
    Lifecycle: rand(["SetBlobTier", "DeleteBlob", "UndeleteBlob"]),
  };
  const operationName = style === "Lifecycle" ? opMap.Lifecycle : opMap[style];
  const category = style === "Lifecycle" ? "StorageLifecycleManagement" : "StorageReadWriteDelete";
  const statusCode = failed ? rand([403, 404, 409, 500, 503]) : rand([200, 201, 202, 204]);
  const resultType = statusCode >= 400 ? "Failed" : "Succeeded";
  const level = statusCode >= 500 ? "Error" : statusCode >= 400 ? "Warning" : "Informational";
  const objectKey = `${container}/${blob}`;
  const requestBodySize = operationName === "PutBlob" ? randInt(0, 256_000_000) : 0;
  const responseBodySize =
    operationName === "GetBlob"
      ? failed
        ? randInt(0, 200)
        : randInt(1024, 120_000_000)
      : randInt(0, 500);

  const properties: Record<string, unknown> = {
    resourceUri: resourceId,
    accountName: account,
    operationName,
    statusCode,
    statusText: failed ? rand(["AuthorizationFailure", "BlobNotFound", "ServerBusy"]) : "Success",
    etag: `"0x${randId(16).toUpperCase()}"`,
    serviceType: "blob",
    objectKey,
    requestBodySize,
    responseBodySize,
    requestMd5: operationName === "PutBlob" ? randId(22) : "",
    serverLatencyMs: failed ? randInt(200, 8000) : randInt(2, 120),
    transactionId: randId(24).toUpperCase(),
    userAgentHeader: rand([
      "Azure-Storage/12.26.0 (.NET CLR)",
      "azsdk-net-Storage.Blobs/12.19.0",
      "curl/8.5.0",
    ]),
    authenticationType:
      style === "Authentication"
        ? failed
          ? "OAuth"
          : "SAS"
        : rand(["accountKey", "OAuth", "SAS", "Anonymous"]),
    requesterAccountName: failed ? rand(["unknown-principal", ""]) : `${account}-access`,
    tlsVersion: "TLS 1.2",
    uri: `https://${account}.blob.core.windows.net/${objectKey}`,
  };

  let message = "";

  if (style === "Lifecycle") {
    properties.operationName = operationName;
    properties.tierChange =
      operationName === "SetBlobTier" ? rand(["Hot", "Cool", "Archive", "Cold"]) : null;
    properties.deleteType = operationName === "DeleteBlob" ? "LifecyclePolicy" : null;
    properties.policyRunId = randId(12).toLowerCase();
    message =
      operationName === "SetBlobTier"
        ? `Storage lifecycle: tier change on ${account}/${objectKey} to ${properties.tierChange}`
        : `Storage lifecycle: deleted ${account}/${objectKey} by policy run ${properties.policyRunId}`;
  } else if (style === "Authentication") {
    properties.authenticationErrorDetail = failed
      ? "Signature fields not well formed."
      : "Authenticated via Microsoft Entra ID user delegation SAS.";
    message = failed
      ? `Storage authentication failed on ${account}: ${properties.statusText} key=${objectKey}`
      : `Storage request authenticated on ${account} type=${properties.authenticationType}`;
  } else {
    message = failed
      ? `Blob ${operationName} failed on ${account}/${objectKey} HTTP ${statusCode}`
      : `Blob ${operationName} ${account}/${objectKey} status=${statusCode} tx=${properties.transactionId}`;
  }

  return {
    "@timestamp": ts,
    cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts"),
    category,
    operationName,
    resultType,
    level,
    correlationId,
    callerIpAddress: callerIp,
    properties,
    azure: {
      blob_storage: {
        storage_account: account,
        resource_group: resourceGroup,
        container,
        blob,
        operation: operationName,
        bytes: failed ? 0 : randInt(1024, 500_000_000),
        e2e_latency_ms: Number(properties.serverLatencyMs) + randInt(0, 40),
      },
    },
    event: {
      outcome: failed ? "failure" : "success",
      duration: randInt(1e6, failed ? 6e10 : 4e8),
    },
    message,
  };
}
