import {
  type EcsDocument,
  rand,
  randInt,
  randId,
  randIp,
  gcpCloud,
  makeGcpSetup,
  randZone,
  randBucket,
  randHttpStatus,
  randLatencyMs,
} from "./helpers.js";

function eventBlock(isErr: boolean, durationNs: number) {
  return {
    outcome: isErr ? ("failure" as const) : ("success" as const),
    duration: durationNs,
  };
}

export function generateCloudStorageLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const operation = rand(["GET", "PUT", "DELETE", "LIST", "COPY"] as const);
  const storageClass = rand(["STANDARD", "NEARLINE", "COLDLINE", "ARCHIVE"] as const);
  const sizeBytes = randInt(256, 500_000_000);
  const responseCode = randHttpStatus(isErr);
  const latencyMs = randLatencyMs(randInt(5, 200), isErr);
  const bucket = randBucket();
  const objectName = `${rand(["exports", "uploads", "logs"])}/${randId(8).toLowerCase()}.bin`;
  const message = isErr
    ? `GCS ${operation} gs://${bucket}/${objectName} failed ${responseCode} — checksum mismatch`
    : `GCS ${operation} gs://${bucket}/${objectName} ${sizeBytes}B class=${storageClass} ${responseCode}`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "cloud-storage"),
    gcp: {
      cloud_storage: {
        bucket,
        object_name: objectName,
        operation,
        size_bytes: sizeBytes,
        storage_class: storageClass,
        requester_ip: randIp(),
        response_code: responseCode,
      },
    },
    event: eventBlock(isErr, latencyMs * 1e6),
    message,
  };
}

export function generatePersistentDiskLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const diskType = rand(["pd-standard", "pd-ssd", "pd-balanced", "pd-extreme"] as const);
  const sizeGb = randInt(10, 2000);
  const operation = rand(["CREATE", "RESIZE", "SNAPSHOT", "ATTACH", "DETACH"] as const);
  const zone = randZone(region);
  const iops = diskType === "pd-extreme" ? randInt(5000, 120_000) : randInt(100, 15_000);
  const throughputMbps = randInt(40, 1200);
  const durationNs = randLatencyMs(randInt(200, 8000), isErr) * 1e6;
  const diskName = `pd-${rand(["data", "boot", "scratch"])}-${randId(5).toLowerCase()}`;
  const message = isErr
    ? `Persistent Disk ${operation} ${diskName} failed in ${zone} — quota exceeded`
    : `Persistent Disk ${operation} ${diskName} ${diskType} ${sizeGb}GB zone=${zone} iops=${iops}`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "persistent-disk"),
    gcp: {
      persistent_disk: {
        disk_name: diskName,
        disk_type: diskType,
        size_gb: sizeGb,
        zone,
        operation,
        iops,
        throughput_mbps: throughputMbps,
      },
    },
    event: eventBlock(isErr, durationNs),
    message,
  };
}

export function generateFilestoreLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const tier = rand(["BASIC_HDD", "BASIC_SSD", "HIGH_SCALE_SSD", "ENTERPRISE"] as const);
  const capacityGb = randInt(1024, 102_400);
  const protocol = "NFS" as const;
  const operation = rand(["CREATE", "BACKUP", "RESTORE", "EXPAND", "DELETE_SNAPSHOT"] as const);
  const connectedClients = isErr ? randInt(0, 3) : randInt(4, 180);
  const durationNs = randLatencyMs(randInt(50, 2500), isErr) * 1e6;
  const instanceName = `fs-${rand(["analytics", "hpc", "render"])}-${randId(4).toLowerCase()}`;
  const message = isErr
    ? `Filestore ${instanceName} ${operation} error — capacity ${capacityGb}GB tier ${tier} unreachable from control plane`
    : `Filestore ${instanceName} ${operation} ${tier} ${capacityGb}GB ${protocol} clients=${connectedClients}`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "filestore"),
    gcp: {
      filestore: {
        instance_name: instanceName,
        tier,
        capacity_gb: capacityGb,
        protocol,
        operation,
        connected_clients: connectedClients,
      },
    },
    event: eventBlock(isErr, durationNs),
    message,
  };
}

export function generateStorageTransferLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const status = isErr ? "FAILED" : rand(["IN_PROGRESS", "SUCCESS"] as const);
  const transferType = rand(["gcs-to-gcs", "aws-to-gcs", "azure-to-gcs"] as const);
  const bytesTransferred = isErr ? randInt(0, 50_000_000) : randInt(10_000_000, 5_000_000_000_000);
  const objectsTransferred = isErr ? randInt(0, 5000) : randInt(5000, 50_000_000);
  const durationNs = randLatencyMs(randInt(500, 120_000), isErr) * 1e6;
  const jobName = `transferJobs/${randId(10)}`;
  const sourceBucket =
    transferType === "aws-to-gcs"
      ? `s3://source-${randId(6)}`
      : transferType === "azure-to-gcs"
        ? `https://${randId(6)}.blob.core.windows.net/raw`
        : `gs://${randBucket()}`;
  const destinationBucket = `gs://${randBucket()}`;
  const message = isErr
    ? `Storage Transfer ${jobName} ${status} — ${transferType} credential or listing error after ${objectsTransferred} objects`
    : `Storage Transfer ${jobName} ${status} ${transferType} ${bytesTransferred}B ${objectsTransferred} objects`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "storage-transfer-service"),
    gcp: {
      storage_transfer: {
        job_name: jobName,
        source_bucket: sourceBucket,
        destination_bucket: destinationBucket,
        bytes_transferred: bytesTransferred,
        objects_transferred: objectsTransferred,
        status,
        transfer_type: transferType,
      },
    },
    event: eventBlock(isErr, durationNs),
    message,
  };
}

export function generateBackupDrLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const resourceType = rand(["compute", "cloud-sql", "gke", "filestore"] as const);
  const status = isErr ? "FAILED" : rand(["CREATING", "SUCCEEDED"] as const);
  const sizeGb = isErr ? randInt(0, 50) : randInt(5, 8000);
  const recoveryPoint = new Date(Date.now() - randInt(60_000, 86_400_000)).toISOString();
  const durationNs = randLatencyMs(randInt(300, 20_000), isErr) * 1e6;
  const backupPlan = `bp-${resourceType}-${randId(4).toLowerCase()}`;
  const backupVault = `bv-${region}-${randId(4).toLowerCase()}`;
  const message = isErr
    ? `Backup and DR ${backupPlan} ${status} for ${resourceType} — vault ${backupVault} writer unavailable`
    : `Backup and DR ${backupPlan} ${status} ${resourceType} ${sizeGb}GB rp=${recoveryPoint}`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "backup-dr"),
    gcp: {
      backup_dr: {
        backup_plan: backupPlan,
        backup_vault: backupVault,
        resource_type: resourceType,
        status,
        size_gb: sizeGb,
        recovery_point: recoveryPoint,
      },
    },
    event: eventBlock(isErr, durationNs),
    message,
  };
}
