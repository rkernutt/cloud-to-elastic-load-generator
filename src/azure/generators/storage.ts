import { type EcsDocument, rand, randInt, randId, azureCloud, makeAzureSetup } from "./helpers.js";

export function generateBlobStorageLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const account = `st${randId(10).toLowerCase()}`;
  const container = rand(["raw", "curated", "exports", "logs"]);
  const blob = `${randId(8).toLowerCase()}.parquet`;
  const op = rand(["GetBlob", "PutBlob", "DeleteBlob", "ListBlobs"]);
  return {
    "@timestamp": ts,
    cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts"),
    azure: {
      blob_storage: {
        storage_account: account,
        resource_group: resourceGroup,
        container,
        blob,
        operation: op,
        bytes: isErr ? 0 : randInt(1024, 500_000_000),
        e2e_latency_ms: randInt(isErr ? 500 : 5, isErr ? 60_000 : 300),
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e6, isErr ? 6e10 : 4e8) },
    message: isErr
      ? `Blob ${account}/${container}/${blob}: ${op} failed`
      : `Blob ${account}: ${op} ${blob}`,
  };
}
