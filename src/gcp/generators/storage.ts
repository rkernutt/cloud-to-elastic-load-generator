import {
  type EcsDocument,
  rand,
  randInt,
  randId,
  randPublicIp,
  randSourceIp,
  gcpStatusMessage,
  gcpCloud,
  makeGcpSetup,
  randZone,
  randBucket,
  randHttpStatus,
  randLatencyMs,
  randSeverity,
  randPrincipal,
  randOperationId,
} from "./helpers.js";

function eventBlock(isErr: boolean, durationNs: number) {
  return {
    outcome: isErr ? ("failure" as const) : ("success" as const),
    duration: durationNs,
  };
}

function fileEvent(isErr: boolean, durationNs: number, action: string) {
  return {
    kind: "event" as const,
    category: ["file"] as const,
    type: isErr ? (["error"] as const) : (["access"] as const),
    action,
    ...eventBlock(isErr, durationNs),
  };
}

const GRPC_ERROR_STATUSES = [
  "INTERNAL",
  "DEADLINE_EXCEEDED",
  "PERMISSION_DENIED",
  "RESOURCE_EXHAUSTED",
  "NOT_FOUND",
  "UNAVAILABLE",
] as const;

function grpcStructuredFault(
  isErr: boolean,
  resource = "resource"
): {
  spread: Record<string, unknown>;
  rpcLabel: Record<string, string>;
} {
  if (!isErr) return { spread: {}, rpcLabel: {} };
  const code = rand([...GRPC_ERROR_STATUSES]);
  return {
    spread: {
      "gcp.rpc": { status_code: code },
      error: { code, message: gcpStatusMessage(code, resource), type: "gcp" },
    },
    rpcLabel: { "gcp.rpc.status_code": code },
  };
}

export function generateCloudStorageLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const bucketName = randBucket();
  const storageResource = `projects/${project.id}/buckets/${bucketName}`;
  const { spread: faultSpread, rpcLabel } = grpcStructuredFault(isErr, storageResource);
  const objectName = `${rand(["exports", "uploads", "logs"])}/${randId(8).toLowerCase()}.bin`;
  const objectSize = randInt(256, 500_000_000);
  const storageClass = rand(["STANDARD", "NEARLINE", "COLDLINE", "ARCHIVE"] as const);
  const contentType = rand([
    "application/octet-stream",
    "text/csv",
    "application/json",
    "image/png",
  ] as const);
  const generation = `${Date.now()}${randInt(100000, 999999)}`;
  const latencyMs = randLatencyMs(randInt(5, 200), isErr);
  const variant = isErr
    ? rand(["data_access", "audit", "lifecycle"] as const)
    : rand(["data_access", "audit", "lifecycle", "data_access"] as const);

  let message = "";
  let operation = "";
  let severity = randSeverity(isErr);

  if (variant === "data_access") {
    operation = rand([
      "storage.objects.get",
      "storage.objects.create",
      "storage.objects.delete",
      "storage.objects.list",
    ] as const);
    const status = randHttpStatus(isErr);
    message = isErr
      ? `jsonPayload.@type=type.googleapis.com/google.cloud.audit.AuditLog methodName="${operation}" resourceName="projects/_/buckets/${bucketName}/objects/${objectName}" status.code=${status} status.message="Checksum mismatch"`
      : `jsonPayload.@type=type.googleapis.com/google.cloud.audit.AuditLog methodName="${operation}" resourceName="projects/_/buckets/${bucketName}/objects/${objectName}" status.code=${status}`;
    severity = isErr ? "ERROR" : "INFO";
  } else if (variant === "audit") {
    operation = rand([
      "storage.buckets.create",
      "storage.buckets.update",
      "storage.buckets.setIamPolicy",
    ] as const);
    message = `protoPayload.methodName="${operation}" protoPayload.authenticationInfo.principalEmail="${randPrincipal(project)}" resource.labels.bucket_name="${bucketName}" operation.id=${randOperationId()}`;
    severity = "NOTICE";
  } else {
    operation = rand([
      "lifecycle.delete",
      "lifecycle.transition",
      "lifecycle.setStorageClass",
    ] as const);
    message = rand([
      `Lifecycle rule "archive-after-90d" transitioned gs://${bucketName}/${objectName} to NEARLINE`,
      `Lifecycle action DELETE executed on gs://${bucketName}/${objectName} (generation=${generation})`,
      `Object gs://${bucketName}/${objectName} storage class changed STANDARD -> COLDLINE`,
    ]);
    severity = "INFO";
  }

  return {
    "@timestamp": ts,
    log: { level: isErr ? "error" : "info" },
    ...faultSpread,
    severity,
    labels: {
      bucket_name: bucketName,
      location: region,
      ...rpcLabel,
    },
    cloud: gcpCloud(region, project, "cloud-storage"),
    gcp: {
      cloud_storage: {
        bucket_name: bucketName,
        object_name: objectName,
        object_size: objectSize,
        storage_class: storageClass,
        operation,
        content_type: contentType,
        generation,
        requester_ip: Math.random() < 0.7 ? randSourceIp() : randPublicIp(),
      },
    },
    event: fileEvent(isErr, latencyMs * 1e6, "storage"),
    message,
  };
}

export function generatePersistentDiskLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const { spread: faultSpread, rpcLabel } = grpcStructuredFault(isErr);
  const diskType = rand(["pd-standard", "pd-ssd", "pd-balanced", "pd-extreme"] as const);
  const sizeGb = randInt(10, 2000);
  const operation = rand(["CREATE", "RESIZE", "SNAPSHOT", "ATTACH", "DETACH"] as const);
  const zone = randZone(region);
  const iops = diskType === "pd-extreme" ? randInt(5000, 120_000) : randInt(100, 15_000);
  const throughputMbps = randInt(40, 1200);
  const durationNs = randLatencyMs(randInt(200, 8000), isErr) * 1e6;
  const diskName = `pd-${rand(["data", "boot", "scratch"])}-${randId(5).toLowerCase()}`;
  const severity = randSeverity(isErr);
  const message = isErr
    ? `compute.googleapis.com/projects/${project.id}/zones/${zone}/disks/${diskName}: ${operation} FAILED — Quota 'SSD_TOTAL_GB' exceeded`
    : `Persistent Disk ${operation} completed disk=${diskName} type=${diskType} sizeGb=${sizeGb} zone=${zone} iops=${iops}`;

  return {
    "@timestamp": ts,
    log: { level: isErr ? "error" : "info" },
    ...faultSpread,
    severity,
    labels: { disk_name: diskName, zone, ...rpcLabel },
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
    event: fileEvent(isErr, durationNs, "storage"),
    message,
  };
}

export function generateFilestoreLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const { spread: faultSpread, rpcLabel } = grpcStructuredFault(isErr);
  const tier = rand(["BASIC_HDD", "BASIC_SSD", "HIGH_SCALE_SSD", "ENTERPRISE"] as const);
  const capacityGb = randInt(1024, 102_400);
  const protocol = "NFS" as const;
  const operation = rand(["CREATE", "BACKUP", "RESTORE", "EXPAND", "DELETE_SNAPSHOT"] as const);
  const connectedClients = isErr ? randInt(0, 3) : randInt(4, 180);
  const durationNs = randLatencyMs(randInt(50, 2500), isErr) * 1e6;
  const instanceName = `fs-${rand(["analytics", "hpc", "render"])}-${randId(4).toLowerCase()}`;
  const severity = randSeverity(isErr);
  const message = isErr
    ? `file.googleapis.com/${instanceName}: ${operation} error — control plane unreachable tier=${tier} capacityGb=${capacityGb}`
    : `Filestore instance ${instanceName} ${operation} OK tier=${tier} capacityGb=${capacityGb} ${protocol} clients=${connectedClients}`;

  return {
    "@timestamp": ts,
    log: { level: isErr ? "error" : "info" },
    ...faultSpread,
    severity,
    labels: { instance_name: instanceName, ...rpcLabel },
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
    event: fileEvent(isErr, durationNs, "storage"),
    message,
  };
}

export function generateStorageTransferLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const { spread: faultSpread, rpcLabel } = grpcStructuredFault(isErr);
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
  const severity = randSeverity(isErr);
  const message = isErr
    ? `storagetransfer.googleapis.com/${jobName}: ${status} ${transferType} — PERMISSION_DENIED listing source after ${objectsTransferred} objects`
    : `storagetransfer.googleapis.com/${jobName}: ${status} ${transferType} bytesTransferred=${bytesTransferred} objectsTransferred=${objectsTransferred}`;

  return {
    "@timestamp": ts,
    log: { level: isErr ? "error" : "info" },
    ...faultSpread,
    severity,
    labels: { job_name: jobName, ...rpcLabel },
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
    event: fileEvent(isErr, durationNs, "storage"),
    message,
  };
}

export function generateBackupDrLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const { spread: faultSpread, rpcLabel } = grpcStructuredFault(isErr);
  const resourceType = rand(["compute", "cloud-sql", "gke", "filestore"] as const);
  const status = isErr ? "FAILED" : rand(["CREATING", "SUCCEEDED"] as const);
  const sizeGb = isErr ? randInt(0, 50) : randInt(5, 8000);
  const recoveryPoint = new Date(Date.now() - randInt(60_000, 86_400_000)).toISOString();
  const durationNs = randLatencyMs(randInt(300, 20_000), isErr) * 1e6;
  const backupPlan = `bp-${resourceType}-${randId(4).toLowerCase()}`;
  const backupVault = `bv-${region}-${randId(4).toLowerCase()}`;
  const severity = randSeverity(isErr);
  const message = isErr
    ? `backupdr.googleapis.com/${backupPlan}: ${status} resourceType=${resourceType} vault=${backupVault} — backup writer UNAVAILABLE`
    : `backupdr.googleapis.com/${backupPlan}: ${status} resourceType=${resourceType} sizeGb=${sizeGb} recoveryPoint=${recoveryPoint}`;

  return {
    "@timestamp": ts,
    log: { level: isErr ? "error" : "info" },
    ...faultSpread,
    severity,
    labels: { backup_plan: backupPlan, backup_vault: backupVault, ...rpcLabel },
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
    event: fileEvent(isErr, durationNs, "storage"),
    message,
  };
}
