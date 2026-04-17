/**
 * Storage AWS log generators (S3, S3 Storage Lens, EBS, EFS, FSx, DataSync, Backup, Storage Gateway).
 * Each generator returns a single ECS-shaped document for the given timestamp and error rate.
 * @module aws/generators/storage
 */

import {
  rand,
  randInt,
  randFloat,
  randId,
  randIp,
  randAccount,
  REGIONS,
  USER_AGENTS,
} from "../../helpers";
import type { EcsDocument } from "./types.js";

function formatS3AccessLogTime(isoTs: string): string {
  const d = new Date(isoTs);
  if (Number.isNaN(d.getTime())) return "[01/Jan/1970:00:00:00 +0000]";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][
    d.getUTCMonth()
  ];
  const yyyy = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `[${dd}/${mon}/${yyyy}:${hh}:${mm}:${ss} +0000]`;
}

/**
 * Generates a synthetic S3 server access log event (bucket, key, operation, optional JSON message).
 * @param {string} ts - ISO timestamp for @timestamp.
 * @param {number} er - Error rate in [0,1]; influences http_status and error block.
 * @returns {Object} ECS-style document with cloud, aws.s3access, aws.s3, http, event, message.
 */
function generateS3Log(ts: string, er: number) {
  // ~10% chance of generating an Intelligent-Tiering event
  if (Math.random() < 0.1) {
    const r = rand(REGIONS);
    const a = randAccount();
    const e = Math.random() < er;
    const bucket = rand(["data-lake-raw", "analytics-archive", "ml-datasets", "application-logs"]);
    const tiers = [
      "FREQUENT_ACCESS",
      "INFREQUENT_ACCESS",
      "ARCHIVE_INSTANT_ACCESS",
      "ARCHIVE_ACCESS",
      "DEEP_ARCHIVE_ACCESS",
    ];
    const fromTier = rand(tiers);
    const toTier = rand(tiers.filter((t) => t !== fromTier));
    const ev = rand([
      "TierTransition",
      "ArchiveRestore",
      "ConfigurationUpdate",
      "MonitoringStatus",
    ]);
    return {
      __dataset: "aws.s3_intelligent_tiering",
      "@timestamp": ts,
      cloud: {
        provider: "aws",
        region: r,
        account: { id: a.id, name: a.name },
        service: { name: "s3-intelligent-tiering" },
      },
      aws: {
        s3_intelligent_tiering: {
          bucket_name: bucket,
          event_type: ev,
          from_tier: fromTier,
          to_tier: toTier,
          objects_transitioned: randInt(1, e ? 0 : 10000),
          bytes_transitioned: randInt(1024, 1e10),
          monitoring_enabled: true,
          archive_access_days: 90,
          deep_archive_days: 180,
          cost_savings_pct: randFloat(10, 75),
        },
      },
      event: { outcome: e ? "failure" : "success", duration: randInt(1e5, 3e7) },
      message: e
        ? `S3 Intelligent-Tiering ${bucket}: transition failed`
        : `S3 Intelligent-Tiering ${bucket}: ${randInt(1, 10000)} objects ${fromTier} → ${toTier}`,
    };
  }
  // ~10% chance of generating a Batch Operations event
  if (Math.random() < 0.1) {
    const r = rand(REGIONS);
    const a = randAccount();
    const e = Math.random() < er;
    const op = rand([
      "S3PutObjectCopy",
      "S3PutObjectTagging",
      "S3DeleteObjectTagging",
      "S3InitiateRestoreObject",
      "LambdaInvoke",
      "S3PutObjectLegalHold",
      "S3PutObjectRetention",
    ]);
    const status = e ? rand(["Failed", "Cancelled"]) : rand(["Complete", "Active"]);
    const errMsgs = [
      "Manifest file not found",
      "Insufficient permissions on target bucket",
      "Lambda invocation failed",
      "Object key not found",
    ];
    return {
      __dataset: "aws.s3_batch_operations",
      "@timestamp": ts,
      cloud: {
        provider: "aws",
        region: r,
        account: { id: a.id, name: a.name },
        service: { name: "s3-batch-operations" },
      },
      aws: {
        s3_batch_operations: {
          job_id: randId(36).toLowerCase(),
          operation: op,
          status,
          objects_total: randInt(100, 1e6),
          objects_succeeded: e ? randInt(0, 100) : randInt(100, 1e6),
          objects_failed: e ? randInt(10, 1000) : 0,
          manifest_key: `manifests/batch-${randId(8).toLowerCase()}.csv`,
          priority: randInt(1, 100),
          report_bucket: `s3-batch-reports-${a.id}`,
          elapsed_seconds: randInt(10, 86400),
        },
      },
      event: { outcome: e ? "failure" : "success", duration: randInt(1e7, 8.64e10) },
      message: e
        ? `S3 Batch Ops job ${status}: ${op} — ${rand(errMsgs)}`
        : `S3 Batch Ops job ${status}: ${op} on ${randInt(100, 1e6).toLocaleString()} objects`,
    };
  }
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const bucket = rand(["prod-assets", "raw-data", "backups", "logs", "media-uploads", "artifacts"]);
  const op = rand([
    "REST.GET.OBJECT",
    "REST.PUT.OBJECT",
    "REST.DELETE.OBJECT",
    "REST.HEAD.OBJECT",
    "REST.GET.BUCKET",
  ]);
  const key = `${rand(["data", "uploads", "exports", "reports"])}/${randId(8).toLowerCase()}.${rand(["json", "csv", "parquet", "gz", "zip"])}`;
  const status = isErr ? rand([400, 403, 404, 500, 503]) : rand([200, 200, 204, 206]);
  const bucketName = `${bucket}-${region}`;
  const remoteIp = randIp();
  const requestId = randId(16).toUpperCase();
  const bytesSent = randInt(0, 1073741824);
  const totalTime = randInt(1, isErr ? 5000 : 500);
  const turnAroundTime = Math.floor(totalTime * Number(randFloat(0.55, 0.98)));
  const requester = Math.random() < 0.1 ? "-" : `AIDA${randId(20).toUpperCase()}`;
  const logTime = formatS3AccessLogTime(ts);
  const opParts = op.split(".");
  const httpMethod = opParts.length >= 2 ? opParts[1] : "GET";
  const objectKey = op.includes("BUCKET") ? "-" : key;
  const requestUri =
    objectKey === "-"
      ? `${httpMethod} /${bucketName}/ HTTP/1.1`
      : `${httpMethod} /${bucketName}/${objectKey} HTTP/1.1`;
  const objectSize =
    op.includes("GET") || op.includes("HEAD")
      ? String(randInt(1024, 1073741824))
      : op.includes("PUT")
        ? String(randInt(512, 1073741824))
        : "-";
  const errorCodeStr = isErr
    ? rand(["NoSuchKey", "AccessDenied", "InvalidRequest", "InternalError", "SlowDown"])
    : "-";
  const referrer = Math.random() < 0.3 ? "https://console.aws.amazon.com/s3/" : "-";
  const ua = rand(USER_AGENTS);
  const versionId = Math.random() < 0.15 ? randId(32).toLowerCase() : "-";
  const hostId = `${randId(12)}+${randId(6)}`;
  const accessPointArn =
    Math.random() < 0.12
      ? `arn:aws:s3:${region}:${acct.id}:accesspoint/${rand(["ap-logs", "ap-analytics", "ap-media"])}`
      : "-";
  const authType = requester === "-" ? "-" : "AuthHeader";
  const accessLogLine = [
    acct.id,
    bucketName,
    logTime,
    remoteIp,
    requester,
    requestId,
    op,
    objectKey,
    requestUri,
    String(status),
    errorCodeStr,
    String(bytesSent),
    objectSize,
    String(totalTime),
    String(turnAroundTime),
    referrer === "-" ? "-" : `"${referrer}"`,
    `"${ua.replace(/"/g, "'")}"`,
    versionId,
    hostId,
    "SigV4",
    "ECDHE-RSA-AES128-GCM-SHA256",
    authType,
    `${bucketName}.s3.${region}.amazonaws.com`,
    "TLSv1.2",
    accessPointArn,
  ].join(" ");
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "s3" },
    },
    aws: {
      dimensions: {
        BucketName: bucketName,
        StorageType: rand(["StandardStorage", "IntelligentTieringStorage", "GlacierStorage"]),
        FilterId: rand(["EntireBucket", "prefix-filter", "tag-filter"]),
        aws_account_number: acct.id,
        aws_region: region,
        bucket_name: bucketName,
        record_type: rand(["BUCKET", "PREFIX"]),
        storage_class: rand([
          "STANDARD",
          "INTELLIGENT_TIERING",
          "GLACIER",
          "DEEP_ARCHIVE",
          "STANDARD_IA",
        ]),
      },
      s3access: {
        bucket_owner: acct.id,
        bucket: bucketName,
        time: logTime,
        remote_ip: remoteIp,
        requester,
        request_id: requestId,
        operation: op,
        key: objectKey,
        request_uri: requestUri,
        http_status: status,
        error_code: errorCodeStr,
        bytes_sent: bytesSent,
        object_size: objectSize === "-" ? "-" : Number(objectSize),
        total_time: totalTime,
        turn_around_time: turnAroundTime,
        referrer,
        user_agent: ua,
        version_id: versionId,
        host_id: hostId,
        signature_version: "SigV4",
        cipher_suite: "ECDHE-RSA-AES128-GCM-SHA256",
        authentication_type: authType,
        host_header: `${bucketName}.s3.${region}.amazonaws.com`,
        tls_version: "TLSv1.2",
        access_point_arn: accessPointArn,
        access_log_line: accessLogLine,
      },
      s3: {
        bucket: { name: bucketName, arn: `arn:aws:s3:::${bucketName}` },
        object: {
          key: objectKey === "-" ? "" : objectKey,
          size: objectKey === "-" ? 0 : randInt(1024, 1073741824),
          etag: randId(32).toLowerCase(),
        },
        operation: op,
        request_id: requestId,
        error_code: isErr ? errorCodeStr : null,
        metrics: {
          BucketSizeBytes: { avg: randInt(1e6, 1e12) },
          NumberOfObjects: { avg: randInt(1, 1e6) },
          AllRequests: { sum: randInt(1, 100000) },
          GetRequests: { sum: randInt(1, 50000) },
          PutRequests: { sum: randInt(1, 10000) },
          DeleteRequests: { sum: randInt(0, 1000) },
          HeadRequests: { sum: randInt(1, 5000) },
          PostRequests: { sum: randInt(0, 1000) },
          ListRequests: { sum: randInt(1, 5000) },
          SelectRequests: { sum: randInt(0, 500) },
          SelectScannedBytes: { sum: randInt(0, 1e9) },
          SelectReturnedBytes: { sum: randInt(0, 1e8) },
          BytesDownloaded: { sum: randInt(1000, 1e10) },
          BytesUploaded: { sum: randInt(1000, 1e9) },
          "4xxErrors": { sum: isErr ? randInt(1, 100) : 0 },
          "5xxErrors": { sum: isErr ? randInt(1, 10) : 0 },
          FirstByteLatency: {
            avg: Number(randFloat(1, isErr ? 2000 : 100)),
            p99: Number(randFloat(10, isErr ? 5000 : 500)),
          },
          TotalRequestLatency: {
            avg: Number(randFloat(5, isErr ? 5000 : 500)),
            p99: Number(randFloat(50, isErr ? 10000 : 2000)),
          },
        },
      },
      s3_request: {
        uploaded: { bytes: randInt(0, 1e9) },
        downloaded: { bytes: randInt(0, 1e10) },
        requests: {
          total: randInt(1, 100000),
          get: randInt(1, 50000),
          put: randInt(1, 10000),
          delete: randInt(0, 1000),
          head: randInt(1, 5000),
          post: randInt(0, 1000),
          select: randInt(0, 500),
          list: randInt(1, 5000),
          select_scanned: { bytes: randInt(0, 1e9) },
          select_returned: { bytes: randInt(0, 1e8) },
        },
        errors: { "4xx": isErr ? randInt(1, 100) : 0, "5xx": isErr ? randInt(1, 10) : 0 },
        latency: {
          total_request: { ms: Number(randFloat(5, isErr ? 5000 : 500)) },
          first_byte: { ms: Number(randFloat(1, isErr ? 2000 : 100)) },
        },
      },
      s3_daily_storage: {
        bucket: { size: { bytes: randInt(1e6, 1e12) } },
        number_of_objects: randInt(1, 1e6),
      },
      s3_storage_lens: {
        metrics: {
          StorageBytes: { avg: randInt(1e6, 1e12) },
          ObjectCount: { avg: randInt(1, 1e6) },
          DeleteMarkerObjectCount: { avg: randInt(0, 1000) },
          CurrentVersionStorageBytes: { avg: randInt(1e6, 1e11) },
          NonCurrentVersionStorageBytes: { avg: randInt(0, 1e10) },
          EncryptedStorageBytes: { avg: randInt(1e6, 1e12) },
          IncompleteMultipartUploadStorageBytes: { avg: randInt(0, 1e8) },
        },
      },
    },
    http: { response: { status_code: status, bytes: bytesSent } },
    client: { ip: remoteIp },
    user_agent: { original: rand(USER_AGENTS) },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["web", "file"],
      dataset: "aws.s3",
      provider: "s3.amazonaws.com",
      duration: totalTime * 1e6,
    },
    message:
      Math.random() < 0.65
        ? accessLogLine
        : Math.random() < 0.5
          ? JSON.stringify({
              bucket: bucketName,
              key: op.includes("BUCKET") ? null : key,
              operation: op,
              http_status: status,
              request_id: requestId,
              bytes_sent: bytesSent,
              total_time_ms: totalTime,
              timestamp: new Date(ts).toISOString(),
            })
          : `${op} s3://${bucketName}/${key} ${status}`,
    log: { level: isErr ? "warn" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "NoSuchKey",
              "AccessDenied",
              "InvalidRequest",
              "InternalError",
              "SlowDown",
            ]),
            message: `S3 ${op} failed: ${status}`,
            type: "storage",
          },
        }
      : {}),
  };
}

/**
 * Generates a synthetic EBS log event (performance, state change, snapshot, or modification).
 * @param {string} ts - ISO timestamp for @timestamp.
 * @param {number} er - Error rate in [0,1].
 * @returns {Object} ECS-style document with cloud, aws.ebs, event, message.
 */
function generateEbsLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const az = `${region}${rand(["a", "b", "c"])}`;
  const volumeId = `vol-${randId(17).toLowerCase()}`;
  const volumeTypes = ["gp3", "gp2", "io1", "io2", "st1", "sc1"];
  const volType = rand(volumeTypes);
  const sizeGb = rand([8, 20, 50, 100, 200, 500, 1000, 2000]);
  const provisionedIops =
    volType === "io1" || volType === "io2"
      ? randInt(3000, 64000)
      : volType === "gp3"
        ? randInt(3000, 16000)
        : null;
  const instanceId = `i-${randId(17).toLowerCase()}`;
  const device = rand([
    "/dev/xvda",
    "/dev/xvdb",
    "/dev/sdf",
    "/dev/sdg",
    "/dev/nvme0n1",
    "/dev/nvme1n1",
  ]);

  const eventType = rand([
    "performance",
    "state_change",
    "snapshot",
    "modification",
    "alarm",
    "fast_snapshot_restore",
  ]);

  let eventData = {};
  let message = "";
  let level = "info";

  if (eventType === "performance") {
    const iopsConsumed = randInt(
      100,
      isErr ? (provisionedIops || 16000) * 1.1 : (provisionedIops || 3000) * 0.8
    );
    const throughputMbps = Number(randFloat(1, isErr ? 1200 : 500));
    const queueDepth = randInt(0, isErr ? 64 : 8);
    const latencyMs = Number(randFloat(0.1, isErr ? 50 : 5));
    const burstBalance =
      volType === "gp2" || volType === "st1" || volType === "sc1"
        ? randInt(isErr ? 0 : 50, 100)
        : null;
    level = isErr ? "warn" : queueDepth > 32 ? "warn" : "info";
    eventData = {
      volume_id: volumeId,
      volume_type: volType,
      size_gb: sizeGb,
      attached_instance: instanceId,
      device,
      iops_consumed: iopsConsumed,
      provisioned_iops: provisionedIops,
      throughput_mbps: throughputMbps,
      queue_depth: queueDepth,
      latency_ms: latencyMs,
      burst_balance_percent: burstBalance,
      read_ops: randInt(0, 5000),
      write_ops: randInt(0, 5000),
      read_bytes: randInt(0, 536870912),
      write_bytes: randInt(0, 536870912),
    };
    message = isErr
      ? `EBS ${volumeId} IOPS throttled: consumed ${Math.round(iopsConsumed)} vs provisioned ${provisionedIops || 3000}, queue depth ${queueDepth}`
      : `EBS ${volumeId} performance: ${Math.round(iopsConsumed)} IOPS, ${throughputMbps.toFixed(1)} MB/s, latency ${latencyMs.toFixed(2)}ms`;
  } else if (eventType === "state_change") {
    const okChain = rand([
      ["creating", "available"],
      ["available", "in-use"],
      ["in-use", "in-use"],
      ["in-use", "available"],
      ["available", "deleting"],
      ["deleting", "deleted"],
      ["creating", "available", "in-use"],
    ]);
    const multi = okChain.length === 3;
    const fromState = isErr
      ? rand(["creating", "available", "in-use", "deleting"])
      : multi
        ? okChain[1]!
        : okChain[0]!;
    const toState = isErr ? rand(["error", "error-deleting"]) : multi ? okChain[2]! : okChain[1]!;
    const lifecycle = isErr ? [fromState, toState] : okChain;
    level = isErr ? "error" : "info";
    eventData = {
      volume_id: volumeId,
      volume_type: volType,
      size_gb: sizeGb,
      availability_zone: az,
      previous_state: fromState,
      current_state: toState,
      state_transition_chain: lifecycle,
      attached_instance: toState === "in-use" ? instanceId : null,
      device: toState === "in-use" ? device : null,
    };
    message = isErr
      ? `EBS volume ${volumeId} entered error state from ${fromState}: ${rand(["I/O error", "hardware failure", "data integrity issue"])}`
      : `EBS volume ${volumeId} state change: ${fromState} -> ${toState}${toState === "in-use" ? " on " + instanceId + " (" + device + ")" : ""}`;
  } else if (eventType === "snapshot") {
    const snapshotId = `snap-${randId(17).toLowerCase()}`;
    const snapshotState = isErr ? "error" : rand(["pending", "completed", "completed"]);
    const progress =
      snapshotState === "completed"
        ? "100%"
        : snapshotState === "pending"
          ? `${randInt(10, 90)}%`
          : "0%";
    const duration = randInt(30, isErr ? 3600 : 900);
    level = isErr ? "error" : snapshotState === "pending" ? "info" : "info";
    eventData = {
      volume_id: volumeId,
      volume_type: volType,
      size_gb: sizeGb,
      snapshot_id: snapshotId,
      snapshot_state: snapshotState,
      progress,
      duration_seconds: duration,
      fast_snapshot_restore_state: rand(["optimizing", "enabled", "disabled", "disabling"]),
      fast_snapshot_restore_azs: [`${region}a`, `${region}b`].filter(() => Math.random() > 0.3),
      encrypted: rand([true, true, false]),
      kms_key_id: rand([
        `arn:aws:kms:${region}:${acct.id}:key/${randId(8)}-${randId(4)}`.toLowerCase(),
        null,
      ]),
    };
    message = isErr
      ? `EBS snapshot ${snapshotId} of volume ${volumeId} FAILED: ${rand(["Insufficient permissions", "Volume in use by unsupported configuration", "Concurrent snapshot limit exceeded"])}`
      : `EBS snapshot ${snapshotId} of volume ${volumeId} [${sizeGb}GB]: ${snapshotState} (${progress})`;
  } else if (eventType === "modification") {
    const oldType = rand(volumeTypes);
    const newType = rand(volumeTypes);
    const oldSize = sizeGb;
    const newSize = oldSize + rand([0, 0, 50, 100, 200]);
    const oldIops = randInt(3000, 16000);
    const newIops = randInt(3000, 16000);
    const modState = isErr ? "failed" : rand(["modifying", "optimizing", "completed"]);
    level = isErr ? "error" : "info";
    eventData = {
      volume_id: volumeId,
      modification_state: modState,
      modification_phase: rand(["volume-type", "iops", "throughput", "size", "multi-attach"]),
      original_volume_type: oldType,
      target_volume_type: newType,
      original_size_gb: oldSize,
      target_size_gb: newSize,
      original_iops: oldIops,
      target_iops: newIops,
      target_throughput_mbps: randInt(125, 1000),
      progress_percent:
        modState === "completed" ? 100 : modState === "failed" ? 0 : randInt(10, 90),
    };
    message = isErr
      ? `EBS volume modification FAILED for ${volumeId}: ${rand(["Instance type does not support requested volume type", "Insufficient capacity for io2 in AZ", "IOPS exceeds maximum for volume size"])}`
      : `EBS volume ${volumeId} modification: ${oldType}/${oldSize}GB -> ${newType}/${newSize}GB [${modState}]`;
  } else if (eventType === "fast_snapshot_restore") {
    const snapId = `snap-${randId(17).toLowerCase()}`;
    const fsrState = isErr
      ? "create-failed"
      : rand(["enabling", "optimizing", "enabled", "disabled"]);
    level = isErr ? "error" : "info";
    eventData = {
      volume_id: volumeId,
      volume_type: volType,
      size_gb: sizeGb,
      snapshot_id: snapId,
      fast_snapshot_restore_state: fsrState,
      source_availability_zones: [`${region}a`, `${region}b`, `${region}c`].slice(0, randInt(1, 3)),
      owner_id: acct.id,
    };
    message = isErr
      ? `EBS fast snapshot restore FAILED for ${snapId} in ${region}: ${rand(["Insufficient capacity", "Snapshot not completed", "Invalid snapshot state"])}`
      : `EBS fast snapshot restore ${fsrState} for ${snapId} (${volumeId})`;
  } else {
    const metric = rand([
      "VolumeQueueLength",
      "BurstBalance",
      "VolumeReadOps",
      "VolumeWriteOps",
      "VolumeThroughputPercentage",
      "VolumeConsumedReadWriteOps",
    ]);
    const alarmState = isErr ? rand(["ALARM", "INSUFFICIENT_DATA"]) : "OK";
    level = alarmState === "ALARM" ? "warn" : "info";
    eventData = {
      volume_id: volumeId,
      volume_type: volType,
      size_gb: sizeGb,
      alarm_name: `ebs-${metric.toLowerCase()}-${volumeId}`,
      alarm_state: alarmState,
      metric_name: metric,
      threshold: randInt(1, 100),
      current_value: alarmState === "ALARM" ? randInt(80, 200) : randInt(0, 60),
    };
    message =
      alarmState === "ALARM"
        ? `EBS CloudWatch alarm TRIGGERED: ${metric} on ${volumeId} exceeded threshold`
        : `EBS CloudWatch alarm OK: ${metric} on ${volumeId} within normal range`;
  }

  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      availability_zone: az,
      account: { id: acct.id, name: acct.name },
      service: { name: "ebs" },
    },
    aws: {
      dimensions: { VolumeId: volumeId, VolumeType: volType },
      ebs: {
        ...eventData,
        event_type: eventType,
        metrics: {
          VolumeReadOps: { avg: randInt(0, 10000) },
          VolumeWriteOps: { avg: randInt(0, 10000) },
          VolumeReadBytes: { avg: randInt(0, 536870912) },
          VolumeWriteBytes: { avg: randInt(0, 536870912) },
          VolumeTotalReadTime: { sum: Number(randFloat(0, 10)) },
          VolumeTotalWriteTime: { sum: Number(randFloat(0, 10)) },
          VolumeIdleTime: { sum: Number(randFloat(0, 60)) },
          VolumeQueueLength: { avg: randInt(0, isErr ? 64 : 8) },
          VolumeThroughputPercentage: { avg: Number(randFloat(10, isErr ? 100 : 80)) },
          VolumeConsumedReadWriteOps: {
            avg: randInt(
              100,
              isErr ? (provisionedIops || 16000) * 1.1 : (provisionedIops || 3000) * 0.8
            ),
          },
          BurstBalance: {
            avg:
              volType === "gp2" || volType === "st1" || volType === "sc1"
                ? randInt(isErr ? 0 : 50, 100)
                : null,
          },
        },
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["host", "file"],
      dataset: "aws.ebs",
      provider: "ec2.amazonaws.com",
      duration: randInt(1, isErr ? 60000 : 5000) * 1e6,
    },
    message: message,
    log: { level },
    ...(isErr ? { error: { code: "EbsError", message, type: "storage" } } : {}),
  };
}

function generateEfsLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const fsId = `fs-${randId(8).toLowerCase()}`;
  const storageClass = rand(["Standard", "InfrequentAccess"]);
  const az = `${region}${rand(["a", "b", "c"])}`;
  const throughput = Number(randFloat(1, isErr ? 500 : 200));
  const eventKind = rand([
    "io_metrics",
    "mount_target",
    "throughput_mode",
    "lifecycle",
    "access_point",
  ]);
  const mountSubnet = `subnet-${randId(8).toLowerCase()}`;
  const mountEni = `eni-${randId(8).toLowerCase()}`;
  const apId = `fsap-${randId(17).toLowerCase()}`;
  const prevMode = rand(["bursting", "provisioned", "elastic"]);
  const newMode = rand(["bursting", "provisioned", "elastic"].filter((m) => m !== prevMode));
  const lifecyclePolicy = rand([
    "AFTER_14_DAYS",
    "AFTER_30_DAYS",
    "AFTER_60_DAYS",
    "AFTER_90_DAYS",
  ]);
  const extra: Record<string, unknown> = { event_kind: eventKind };
  const newThroughputMode = newMode[0] ?? "provisioned";
  if (eventKind === "mount_target") {
    extra.mount_target_event = isErr
      ? "MountTargetDeleted"
      : rand(["MountTargetCreated", "MountTargetAvailable"]);
    extra.mount_target_id = `fsmt-${randId(8).toLowerCase()}`;
    extra.subnet_id = mountSubnet;
    extra.network_interface_id = mountEni;
    extra.ip_address = randIp();
  } else if (eventKind === "throughput_mode") {
    extra.throughput_mode_change = {
      previous_mode: prevMode,
      new_mode: newThroughputMode,
      transition_state: isErr ? "failed" : rand(["pending", "in-progress", "completed"]),
    };
  } else if (eventKind === "lifecycle") {
    extra.lifecycle_management = {
      transition_to_ia: lifecyclePolicy,
      transition_to_primary: rand(["AFTER_1_ACCESS", "NONE"]),
      state: isErr ? "misconfigured" : rand(["applied", "updating"]),
    };
  } else if (eventKind === "access_point") {
    extra.access_point = {
      access_point_id: apId,
      posix_user: { uid: randInt(1000, 65000), gid: randInt(1000, 65000) },
      root_directory: rand(["/data", "/app", "/shared"]),
      event: isErr ? "CreateAccessPointFailed" : "CreateAccessPoint",
    };
  }
  const efsMessage =
    eventKind === "mount_target"
      ? `EFS ${fsId}: mount target ${isErr ? "delete failed" : "created"} in ${az}`
      : eventKind === "throughput_mode"
        ? `EFS ${fsId}: throughput mode ${prevMode} -> ${newThroughputMode}`
        : eventKind === "lifecycle"
          ? `EFS ${fsId}: lifecycle transition to IA ${lifecyclePolicy}`
          : eventKind === "access_point"
            ? `EFS ${fsId}: access point ${apId} ${isErr ? "creation failed" : "created"}`
            : isErr
              ? `EFS ${fsId}: ${rand(["ThroughputLimitExceeded", "I/O limit reached"])}`
              : `EFS ${fsId}: ${throughput.toFixed(1)} MB/s, ${randInt(1, 500)} connections`;
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "efs" },
    },
    aws: {
      dimensions: { FileSystemId: fsId, StorageClass: storageClass },
      efs: {
        file_system_id: fsId,
        file_system_name: rand(["prod-shared", "jenkins-home", "wordpress-content", "ml-datasets"]),
        mount_target_id: `fsmt-${randId(8).toLowerCase()}`,
        availability_zone: az,
        throughput_mode: rand(["bursting", "provisioned", "elastic"]),
        performance_mode: rand(["generalPurpose", "maxIO"]),
        throughput_mbps: throughput,
        iops: randInt(100, isErr ? 50000 : 5000),
        client_connections: randInt(1, 500),
        percent_io_limit: isErr ? randInt(90, 100) : randInt(10, 80),
        error_code: isErr ? rand(["ThroughputLimitExceeded", "FileLimitExceeded"]) : null,
        ...extra,
        metrics: {
          BurstCreditBalance: { avg: randInt(0, 2e12) },
          ClientConnections: { avg: randInt(1, 500) },
          DataReadIOBytes: { sum: randInt(1000, 1e9) },
          DataWriteIOBytes: { sum: randInt(1000, 1e9) },
          MetadataIOBytes: { sum: randInt(100, 1e7) },
          TotalIOBytes: { sum: randInt(1000, 1e9) },
          PermittedThroughput: { avg: Number(randFloat(1, 3000)) },
          MeteredIOBytes: { sum: randInt(1000, 1e9) },
          StorageBytes: { avg: randInt(1e6, 1e12) },
          PercentIOLimit: { avg: Number(randFloat(1, isErr ? 95 : 40)) },
          DataReadIOBytesWithQuota: { sum: randInt(1000, 1e9) },
          DataWriteIOBytesWithQuota: { sum: randInt(1000, 1e9) },
        },
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["host", "file"],
      dataset: "aws.efs",
      provider: "elasticfilesystem.amazonaws.com",
      duration: randInt(1, isErr ? 5000 : 200) * 1e6,
    },
    message: efsMessage,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand(["ThroughputLimitExceeded", "FileLimitExceeded"]),
            message: "EFS operation failed",
            type: "storage",
          },
        }
      : {}),
  };
}

function generateFsxLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const fsType = rand(["WINDOWS", "LUSTRE", "NETAPP_ONTAP", "OPENZFS"]);
  const fsId = `fs-${randId(17).toLowerCase()}`;
  const MSGS = {
    error: [
      "Storage capacity critically low (<10%)",
      "Backup failed: snapshot error",
      "Self-managed AD connectivity lost",
      "Replication lag exceeded threshold",
    ],
    warn: [
      "Storage utilization above 80%",
      "Throughput utilization above 70%",
      "Backup RPO threshold approaching",
    ],
    info: [
      "Backup completed successfully",
      "Storage capacity scaling complete",
      "File system available",
      "Snapshot created",
    ],
  };
  const level = isErr ? "error" : Math.random() < 0.1 ? "warn" : "info";
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "fsx" },
    },
    aws: {
      dimensions: { FileSystemId: fsId },
      fsx: {
        file_system_id: fsId,
        file_system_type: fsType,
        deployment_type:
          fsType === "LUSTRE"
            ? rand(["PERSISTENT_2", "SCRATCH_2"])
            : rand(["MULTI_AZ_1", "SINGLE_AZ_2"]),
        storage_capacity_gb: rand([1200, 2400, 4800, 9600]),
        throughput_capacity_mbps: rand([128, 256, 512, 1024, 2048]),
        storage_used_percent: isErr ? randInt(90, 100) : randInt(10, 80),
        metrics: {
          DataReadBytes: { sum: randInt(1000, 1e9) },
          DataWriteBytes: { sum: randInt(1000, 1e9) },
          DataReadOperations: { sum: randInt(1, 10000) },
          DataWriteOperations: { sum: randInt(1, 10000) },
          MetadataOperations: { sum: randInt(1, 5000) },
          FreeStorageCapacity: { avg: randInt(1e9, 100e9) },
          StorageCapacity: { avg: randInt(10e9, 1000e9) },
          CPUUtilization: { avg: Number(randFloat(1, 80)) },
          NetworkThroughputUtilization: { avg: Number(randFloat(1, 80)) },
        },
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["host", "file"],
      dataset: "aws.fsx",
      provider: "fsx.amazonaws.com",
      duration: randInt(100, isErr ? 30000 : 5000) * 1e6,
    },
    message: rand(MSGS[level]),
    log: { level },
    ...(isErr ? { error: { code: "FsxError", message: rand(MSGS.error), type: "storage" } } : {}),
  };
}

function generateDataSyncLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const src = rand(["nfs://on-prem-server/data", "s3://source-bucket", "smb://file-server/share"]);
  const dst = rand(["s3://prod-backup", "efs://fs-prod/backup", "s3://archive-bucket"]);
  const filesXfr = isErr ? 0 : randInt(100, 1000000);
  const durationSec = randInt(10, isErr ? 600 : 3600);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "datasync" },
    },
    aws: {
      datasync: {
        task_arn: `arn:aws:datasync:${region}:${acct.id}:task/task-${randId(17).toLowerCase()}`,
        source_location_uri: src,
        destination_location_uri: dst,
        status: isErr ? "ERROR" : "SUCCESS",
        files_transferred: filesXfr,
        bytes_transferred: filesXfr * randInt(1024, 1048576),
        files_failed: isErr ? randInt(1, 100) : 0,
        duration_seconds: durationSec,
        error_code: isErr ? rand(["InvalidS3Config", "NfsPermissionError", "NetworkError"]) : null,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["file"],
      dataset: "aws.datasync",
      provider: "datasync.amazonaws.com",
      duration: durationSec * 1e9,
    },
    message: isErr
      ? `DataSync FAILED: ${rand(["NFS permission denied", "S3 access denied", "Network timeout"])}`
      : `DataSync: ${filesXfr.toLocaleString()} files transferred from ${src.split("//")[0]}`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand(["InvalidS3Config", "NfsPermissionError", "NetworkError"]),
            message: "DataSync task failed",
            type: "storage",
          },
        }
      : {}),
  };
}

function generateBackupLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const resource = rand([
    "ec2/i-prod",
    "rds/prod-db",
    "dynamodb/users-table",
    "efs/fs-prod",
    "fsx/fs-prod",
  ]);
  const plan = rand([
    "daily-backup-plan",
    "critical-data-plan",
    "compliance-backup",
    "weekly-cold",
  ]);
  const vault = rand(["Default", "prod-vault", "compliance-vault"]);
  const eventSubtype = rand(["backup_job", "restore_job", "plan_execution", "vault_lock"]);
  const jobStatus =
    eventSubtype === "restore_job"
      ? isErr
        ? "FAILED"
        : rand(["COMPLETED", "RUNNING", "PENDING"])
      : isErr
        ? rand(["FAILED", "ABORTED", "EXPIRED"])
        : rand(["COMPLETED", "COMPLETED", "RUNNING"]);
  const backupSizeGb = isErr && eventSubtype === "backup_job" ? 0 : Number(randFloat(0.1, 2000));
  const durationSec = randInt(60, isErr ? 3600 : 7200);
  const lifecycleChain = isErr
    ? (["CREATED", "PENDING", "RUNNING", "FAILED"] as const)
    : (["CREATED", "PENDING", "RUNNING", "COMPLETED"] as const);
  const restoreLifecycle = isErr
    ? (["CREATED", "PENDING", "RUNNING", "FAILED"] as const)
    : (["CREATED", "PENDING", "RUNNING", "COMPLETED"] as const);
  const backupLifecyclePhase = isErr
    ? rand(["PENDING", "RUNNING", "FAILED"])
    : rand(["CREATED", "PENDING", "RUNNING", "COMPLETED"]);
  const restoreLifecyclePhase = isErr
    ? rand(["PENDING", "RUNNING", "FAILED"])
    : rand(["CREATED", "PENDING", "RUNNING", "COMPLETED"]);
  const vaultLock = {
    compliance_lock_enabled: Math.random() < 0.25,
    governance_lock_enabled: Math.random() < 0.35,
    lock_event: rand([
      "VaultLockConfigurationApplied",
      "ComplianceModeCoolingPeriod",
      "GovernanceModeUnlocked",
    ]),
    max_retention_days: rand([35, 90, 365, 2555]),
  };
  const planRun = {
    execution_id: `${randId(8)}-${randId(4)}`.toLowerCase(),
    rules_matched: randInt(1, 8),
    resources_evaluated: randInt(1, 200),
    next_window_utc: new Date(Date.now() + randInt(3600, 86400) * 1000).toISOString(),
  };
  const backupMessage =
    eventSubtype === "restore_job"
      ? isErr
        ? `AWS Backup restore FAILED for ${resource}: ${rand(["IAM role insufficient", "Target volume busy", "Snapshot corrupted"])}`
        : `AWS Backup restore ${jobStatus}: ${resource} from ${vault}`
      : eventSubtype === "plan_execution"
        ? `AWS Backup plan "${plan}" execution ${planRun.execution_id}: ${planRun.resources_evaluated} resources`
        : eventSubtype === "vault_lock"
          ? `AWS Backup vault ${vault}: ${vaultLock.lock_event} governance=${vaultLock.governance_lock_enabled} compliance=${vaultLock.compliance_lock_enabled}`
          : isErr
            ? `AWS Backup FAILED for ${resource}: ${rand(["IAM role insufficient", "Resource locked", "Vault full"])}`
            : `AWS Backup ${jobStatus}: ${resource} -> ${vault} (${backupSizeGb.toFixed(1)}GB)`;
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "backup" },
    },
    aws: {
      backup: {
        event_subtype: eventSubtype,
        backup_job_id: `${randId(8)}-${randId(4)}-${randId(4)}`.toLowerCase(),
        restore_job_id:
          eventSubtype === "restore_job"
            ? `${randId(8)}-${randId(4)}-${randId(4)}`.toLowerCase()
            : null,
        backup_plan_name: plan,
        backup_plan_execution: eventSubtype === "plan_execution" ? planRun : null,
        resource_arn: `arn:aws:backup:${region}:${acct.id}:recovery-point:${randId(12).toLowerCase()}`,
        resource_type: rand(["EC2", "RDS", "DynamoDB", "EFS", "FSx"]),
        backup_vault_name: vault,
        job_phase:
          eventSubtype === "backup_job"
            ? backupLifecyclePhase
            : eventSubtype === "restore_job"
              ? restoreLifecyclePhase
              : null,
        job_lifecycle: eventSubtype === "backup_job" ? lifecycleChain : null,
        restore_job_lifecycle: eventSubtype === "restore_job" ? restoreLifecycle : null,
        status: jobStatus,
        backup_size_gb: backupSizeGb,
        lifecycle_delete_after_days: rand([7, 30, 90, 365]),
        vault_lock: eventSubtype === "vault_lock" ? vaultLock : null,
        error_code: isErr ? rand(["LIMIT_EXCEEDED", "IAM_ROLE_ERROR", "RESOURCE_NOT_FOUND"]) : null,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.backup",
      provider: "backup.amazonaws.com",
      duration: durationSec * 1e9,
    },
    message: backupMessage,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand(["LIMIT_EXCEEDED", "IAM_ROLE_ERROR", "RESOURCE_NOT_FOUND"]),
            message: "Backup job failed",
            type: "storage",
          },
        }
      : {}),
  };
}

function generateStorageGatewayLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const gwType = rand(["FILE_S3", "FILE_FSX", "VOLUME", "TAPE"]);
  const gwId = `sgw-${randId(8).toLowerCase()}`;
  const gwName = `prod-sgw-${rand(["primary", "backup", "office"])}`;
  const MSGS = {
    error: [
      "Gateway offline: connection to AWS lost",
      "Cache disk error: I/O failure",
      "Upload buffer full",
      "SMB authentication failed",
    ],
    warn: [
      "Cache disk usage above 80%",
      "Upload buffer usage above 75%",
      "Bandwidth throttling active",
    ],
    info: [
      "File uploaded to S3 successfully",
      "Gateway activated",
      "Cache refreshed",
      "Volume snapshot complete",
    ],
  };
  const level = isErr ? "error" : Math.random() < 0.1 ? "warn" : "info";
  const cacheHitPct = Number(randFloat(60, 99));
  const cacheMissPct = parseFloat((100 - cacheHitPct).toFixed(2));
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "storagegateway" },
    },
    aws: {
      dimensions: { GatewayId: gwId, GatewayName: gwName },
      storagegateway: {
        gateway_id: gwId,
        gateway_name: gwName,
        gateway_type: gwType,
        cache_used_percent: isErr ? randInt(90, 100) : randInt(10, 70),
        upload_buffer_used_percent: isErr ? randInt(85, 100) : randInt(5, 60),
        cloud_bytes_uploaded: randInt(0, 1e9),
        metrics: {
          "CacheHit.Percent": { avg: cacheHitPct },
          "CacheMiss.Percent": { avg: cacheMissPct },
          "CacheUsed.Percent": { avg: Number(randFloat(10, 90)) },
          CloudBytesDownloaded: { sum: randInt(1000, 1e9) },
          CloudBytesUploaded: { sum: randInt(1000, 1e9) },
          CloudDownloadLatency: { avg: Number(randFloat(10, 5000)) },
          ReadBytes: { sum: randInt(1000, 1e9) },
          WriteBytes: { sum: randInt(1000, 1e9) },
          QueuedWrites: { avg: randInt(0, 1000) },
          UploadBufferUsed: { avg: randInt(0, 1e9) },
          UploadBufferFree: { avg: randInt(0, 1e9) },
          CacheHits: { sum: randInt(100, 100000) },
          CacheMisses: { sum: randInt(1, 1000) },
          CachePercentDirty: { avg: Number(randFloat(0, 20)) },
          CachePercentUsed: { avg: Number(randFloat(10, 90)) },
        },
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["host", "file"],
      dataset: "aws.storagegateway",
      provider: "storagegateway.amazonaws.com",
      duration: randInt(100, isErr ? 10000 : 2000) * 1e6,
    },
    message: rand(MSGS[level]),
    log: { level },
    ...(isErr
      ? { error: { code: "GatewayError", message: rand(MSGS.error), type: "storage" } }
      : {}),
  };
}

/**
 * Generates a synthetic S3 Storage Lens metrics/report event (config, bucket counts, storage totals).
 * @param {string} ts - ISO timestamp for @timestamp.
 * @param {number} er - Error rate in [0,1]; influences outcome and message.
 * @returns {Object} ECS-style document with cloud, aws.s3storagelens, event, message.
 */
function generateS3StorageLensLog(ts: string, er: number) {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const configId = rand(["default", "entire-account", "prod-buckets", "cost-optimization"]);
  const bucketCount = randInt(5, 500);
  const totalBytes = randInt(1e10, 1e14);
  const objectCount = randInt(1e6, 1e10);
  const storageType = rand([
    "Standard",
    "IntelligentTiering",
    "Glacier",
    "GlacierIR",
    "DeepArchive",
  ]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "s3" },
    },
    aws: {
      dimensions: { StorageLensConfigurationId: configId, StorageType: storageType },
      s3storagelens: {
        config_id: configId,
        bucket_count: bucketCount,
        total_storage_bytes: totalBytes,
        total_object_count: objectCount,
        storage_type: storageType,
        metrics: {
          BucketCount: { avg: bucketCount },
          TotalStorageBytes: { sum: totalBytes },
          TotalObjectCount: { sum: objectCount },
          BytesUsed: { sum: totalBytes },
          ObjectCount: { sum: objectCount },
        },
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["metric"],
      dataset: "aws.s3_storage_lens",
      provider: "s3.amazonaws.com",
      duration: randInt(60, 300) * 1e9,
    },
    message: isErr
      ? `S3 Storage Lens ${configId}: report generation failed`
      : `S3 Storage Lens ${configId}: ${bucketCount} buckets, ${(totalBytes / 1e9).toFixed(1)} GB, ${objectCount} objects`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: "ReportGenerationFailed",
            message: "Storage Lens report failed",
            type: "storage",
          },
        }
      : {}),
  };
}

export {
  generateS3Log,
  generateEbsLog,
  generateEfsLog,
  generateFsxLog,
  generateDataSyncLog,
  generateBackupLog,
  generateStorageGatewayLog,
  generateS3StorageLensLog,
};
