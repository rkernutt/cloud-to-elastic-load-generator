/**
 * Dimensional metric generators for AWS database and storage services:
 * RDS, Aurora, DynamoDB, ElastiCache, Redshift, S3, DocumentDB,
 * OpenSearch, Neptune, Keyspaces, MemoryDB, EBS, EFS, FSx, Timestream.
 */

import {
  REGIONS,
  ACCOUNTS,
  rand,
  randInt,
  randId,
  dp,
  stat,
  counter,
  metricDoc,
  pickCloudContext,
  jitter,
  sample,
} from "./helpers.js";

type RdsInstanceRow = { id: string; engine: string; cls: string };

// ─── RDS / Aurora ─────────────────────────────────────────────────────────────

const RDS_INSTANCES = [
  { id: "orders-db-1", engine: "mysql", cls: "db.r6g.xlarge" },
  { id: "analytics-db-1", engine: "postgres", cls: "db.r6g.2xlarge" },
  { id: "users-db-1", engine: "postgres", cls: "db.m6g.large" },
  { id: "billing-db-1", engine: "mysql", cls: "db.r6g.large" },
  { id: "reporting-db-1", engine: "postgres", cls: "db.r6g.2xlarge" },
  { id: "auth-db-1", engine: "mysql", cls: "db.m6g.medium" },
  { id: "inventory-db-1", engine: "postgres", cls: "db.r6g.large" },
  { id: "notifications-db-1", engine: "mysql", cls: "db.m6g.large" },
];

const AURORA_INSTANCES = [
  { id: "aurora-orders-cluster", engine: "aurora-postgresql", cls: "db.r6g.xlarge" },
  { id: "aurora-analytics-cluster", engine: "aurora-mysql", cls: "db.r6g.2xlarge" },
  { id: "aurora-global-cluster", engine: "aurora-postgresql", cls: "db.r6g.4xlarge" },
];

function rdsMetrics(ts, er, instances: readonly RdsInstanceRow[], engine: string | null, dataset) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample([...instances], randInt(2, 4)).map((inst) => {
    const cpu = Math.random() < er ? jitter(80, 12, 60, 100) : jitter(30, 20, 5, 90);
    const conns = randInt(5, 500);
    const freeGb = Math.random() < er ? jitter(5, 3, 0.5, 20) : jitter(80, 40, 10, 500);
    const readLat = jitter(2, 1.5, 0.1, 50);
    const writeLat = jitter(3, 2, 0.1, 80);
    return metricDoc(
      ts,
      engine ?? inst.engine,
      dataset,
      region,
      account,
      { DBInstanceIdentifier: inst.id, DBClusterIdentifier: inst.id.replace(/-\d+$/, "-cluster") },
      {
        CPUUtilization: stat(dp(cpu)),
        DatabaseConnections: counter(conns),
        FreeStorageSpace: stat(dp(freeGb * 1_073_741_824)),
        FreeableMemory: stat(dp(jitter(2_000_000_000, 1_500_000_000, 100_000_000, 16_000_000_000))),
        ReadLatency: stat(dp(readLat / 1000)),
        WriteLatency: stat(dp(writeLat / 1000)),
        ReadIOPS: counter(randInt(0, 5_000)),
        WriteIOPS: counter(randInt(0, 3_000)),
        ReadThroughput: counter(randInt(0, 500_000_000)),
        WriteThroughput: counter(randInt(0, 300_000_000)),
        NetworkReceiveThroughput: counter(randInt(100_000, 100_000_000)),
        NetworkTransmitThroughput: counter(randInt(100_000, 100_000_000)),
        DiskQueueDepth: stat(
          dp(Math.random() < er ? jitter(5, 4, 0.5, 30) : jitter(0.2, 0.15, 0, 2))
        ),
        ReplicaLag: stat(
          dp(Math.random() < er ? jitter(5000, 4000, 100, 60000) : jitter(200, 150, 0, 1000))
        ),
        BinLogDiskUsage: counter(randInt(0, 10_000_000_000)),
      }
    );
  });
}

export function generateRdsMetrics(ts, er) {
  return rdsMetrics(ts, er, RDS_INSTANCES, "rds", "aws.rds");
}
export function generateAuroraMetrics(ts, er) {
  return rdsMetrics(ts, er, AURORA_INSTANCES, "aurora", "aws.rds");
}

// ─── DynamoDB ─────────────────────────────────────────────────────────────────

const DYNAMO_TABLES = [
  "orders",
  "users",
  "sessions",
  "products",
  "inventory",
  "events",
  "audit-log",
  "feature-flags",
  "rate-limits",
  "notifications",
  "messages",
  "carts",
  "payments",
];

export function generateDynamodbMetrics(ts, er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(DYNAMO_TABLES, randInt(3, 7)).map((table) => {
    const rcuConsumed = randInt(0, 10_000);
    const wcuConsumed = randInt(0, 5_000);
    const throttled = Math.random() < er ? randInt(1, 500) : 0;
    return metricDoc(
      ts,
      "dynamodb",
      "aws.dynamodb",
      region,
      account,
      {
        TableName: table,
        Operation: rand(["GetItem", "PutItem", "Query", "Scan", "UpdateItem", "DeleteItem"]),
      },
      {
        ConsumedReadCapacityUnits: stat(rcuConsumed, { sum: rcuConsumed * 60 }),
        ConsumedWriteCapacityUnits: stat(wcuConsumed, { sum: wcuConsumed * 60 }),
        ProvisionedReadCapacityUnits: stat(Math.max(rcuConsumed * 1.5, 5)),
        ProvisionedWriteCapacityUnits: stat(Math.max(wcuConsumed * 1.5, 5)),
        ReadThrottleEvents: counter(throttled),
        WriteThrottleEvents: counter(throttled > 0 ? Math.round(throttled * 0.6) : 0),
        SystemErrors: counter(Math.random() < er * 0.5 ? randInt(1, 50) : 0),
        UserErrors: counter(randInt(0, 20)),
        SuccessfulRequestLatency: stat(dp(jitter(5, 4, 0.5, 200))),
        ReturnedItemCount: counter(randInt(0, 1000)),
        TransactionConflict: counter(Math.random() < er ? randInt(0, 100) : 0),
      }
    );
  });
}

// ─── ElastiCache ──────────────────────────────────────────────────────────────

const CACHE_CLUSTERS = [
  { id: "session-cache", engine: "redis" },
  { id: "product-cache", engine: "redis" },
  { id: "rate-limit-cache", engine: "redis" },
  { id: "memcached-app", engine: "memcached" },
];

export function generateElasticacheMetrics(ts, er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(CACHE_CLUSTERS, randInt(1, 3)).map((cluster) => {
    const hits = randInt(1_000, 500_000);
    const misses = randInt(100, 50_000);
    const hitRate = dp((hits / (hits + misses)) * 100);
    const cpu = Math.random() < er ? jitter(70, 15, 50, 100) : jitter(15, 10, 1, 60);
    const memPct = Math.random() < er ? jitter(85, 10, 70, 100) : jitter(40, 20, 5, 75);
    return metricDoc(
      ts,
      "elasticache",
      "aws.elasticache",
      region,
      account,
      { CacheClusterId: cluster.id, CacheNodeId: "0001" },
      {
        CPUUtilization: stat(dp(cpu)),
        DatabaseMemoryUsagePercentage: stat(dp(memPct)),
        FreeableMemory: stat(dp(jitter(500_000_000, 400_000_000, 10_000_000, 8_000_000_000))),
        CacheHits: counter(hits),
        CacheMisses: counter(misses),
        CacheHitRate: stat(hitRate),
        CurrConnections: counter(randInt(10, 1_000)),
        Evictions: counter(Math.random() < er * 0.5 ? randInt(1, 10_000) : 0),
        NetworkBytesIn: counter(randInt(1_000_000, 5_000_000_000)),
        NetworkBytesOut: counter(randInt(1_000_000, 5_000_000_000)),
        ReplicationLag: stat(
          dp(Math.random() < er ? jitter(500, 400, 10, 5000) : jitter(10, 8, 0, 100)) / 1000
        ),
        CurrItems: counter(randInt(100, 10_000_000)),
        GetTypeCmds: counter(randInt(1_000, 1_000_000)),
        SetTypeCmds: counter(randInt(100, 100_000)),
      }
    );
  });
}

// ─── Redshift ─────────────────────────────────────────────────────────────────

const REDSHIFT_CLUSTERS = ["analytics-cluster", "reporting-dw", "bi-cluster", "data-warehouse"];

export function generateRedshiftMetrics(ts, er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(REDSHIFT_CLUSTERS, randInt(1, 2)).map((clusterId) => {
    const cpu = Math.random() < er ? jitter(75, 15, 50, 100) : jitter(30, 20, 5, 80);
    return metricDoc(
      ts,
      "redshift",
      "aws.redshift",
      region,
      account,
      { ClusterIdentifier: clusterId, NodeID: `Leader` },
      {
        CPUUtilization: stat(dp(cpu)),
        PercentageDiskSpaceUsed: stat(dp(jitter(45, 25, 5, 95))),
        DatabaseConnections: counter(randInt(1, 100)),
        HealthStatus: stat(Math.random() < er ? 0 : 1),
        MaintenanceMode: stat(0),
        QueryDuration: stat(dp(jitter(500, 400, 10, 300_000))),
        QueriesCompletedPerSecond: stat(dp(jitter(5, 4, 0, 100))),
        NumExceededSchemaQuotas: counter(Math.random() < er ? randInt(1, 10) : 0),
        ReadLatency: stat(dp(jitter(0.01, 0.008, 0.001, 1))),
        WriteLatency: stat(dp(jitter(0.05, 0.04, 0.001, 5))),
        NetworkReceiveThroughput: counter(randInt(1_000_000, 10_000_000_000)),
        NetworkTransmitThroughput: counter(randInt(1_000_000, 10_000_000_000)),
      }
    );
  });
}

// ─── S3 ───────────────────────────────────────────────────────────────────────

const S3_BUCKETS = [
  "prod-assets",
  "data-lake",
  "logs-archive",
  "ml-datasets",
  "backups",
  "static-content",
  "media-uploads",
  "reports",
  "audit-logs",
  "raw-events",
];

export function generateS3Metrics(ts, er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(S3_BUCKETS, randInt(3, 7)).map((bucket) => {
    const storageGb = randInt(1, 50_000);
    return metricDoc(
      ts,
      "s3",
      "aws.s3_daily_storage",
      region,
      account,
      {
        BucketName: bucket,
        StorageType: rand([
          "StandardStorage",
          "IntelligentTieringFAStorage",
          "StandardIAStorage",
          "GlacierStorage",
        ]),
      },
      {
        BucketSizeBytes: stat(dp(storageGb * 1_073_741_824)),
        NumberOfObjects: stat(randInt(100, 100_000_000)),
        AllRequests: counter(randInt(0, 10_000_000)),
        GetRequests: counter(randInt(0, 8_000_000)),
        PutRequests: counter(randInt(0, 2_000_000)),
        DeleteRequests: counter(randInt(0, 500_000)),
        HeadRequests: counter(randInt(0, 1_000_000)),
        BytesDownloaded: counter(randInt(0, 1_000_000_000_000)),
        BytesUploaded: counter(randInt(0, 500_000_000_000)),
        "4xxErrors": counter(randInt(0, 5_000)),
        "5xxErrors": counter(Math.random() < er ? randInt(1, 1000) : 0),
      }
    );
  });
}

// ─── DocumentDB ───────────────────────────────────────────────────────────────

export function generateDocdbMetrics(ts, er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "docdb",
      "aws.docdb",
      region,
      account,
      {
        DBClusterIdentifier: rand(["docdb-prod", "docdb-staging", "docdb-analytics"]),
        DBInstanceIdentifier: `docdb-instance-${randInt(1, 3)}`,
      },
      {
        CPUUtilization: stat(
          dp(Math.random() < er ? jitter(75, 15, 50, 100) : jitter(25, 15, 5, 70))
        ),
        DatabaseConnections: counter(randInt(5, 200)),
        FreeableMemory: stat(dp(jitter(2_000_000_000, 1_000_000_000, 100_000_000, 8_000_000_000))),
        ReadLatency: stat(dp(jitter(2, 1.5, 0.1, 50) / 1000)),
        WriteLatency: stat(dp(jitter(3, 2, 0.1, 80) / 1000)),
        ReadIOPS: counter(randInt(0, 5_000)),
        WriteIOPS: counter(randInt(0, 2_000)),
        NetworkReceiveThroughput: counter(randInt(100_000, 100_000_000)),
        OpcountersQuery: counter(randInt(100, 100_000)),
        OpcountersInsert: counter(randInt(10, 10_000)),
        OpcountersUpdate: counter(randInt(10, 5_000)),
        OpcountersDelete: counter(randInt(0, 1_000)),
      }
    ),
  ];
}

// ─── OpenSearch / Elasticsearch ───────────────────────────────────────────────

export function generateOpensearchMetrics(ts, er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const domain = rand(["search-prod", "logs-cluster", "analytics-os", "observability-os"]);
  return [
    metricDoc(
      ts,
      "opensearch",
      "aws.opensearch",
      region,
      account,
      { DomainName: domain, ClientId: account.id },
      {
        CPUUtilization: stat(
          dp(Math.random() < er ? jitter(80, 12, 60, 100) : jitter(35, 20, 5, 80))
        ),
        JVMMemoryPressure: stat(
          dp(Math.random() < er ? jitter(85, 10, 70, 98) : jitter(40, 20, 10, 75))
        ),
        FreeStorageSpace: stat(dp(jitter(50_000, 40_000, 5_000, 1_000_000))),
        IndexingRate: stat(dp(jitter(1_000, 800, 0, 100_000))),
        SearchRate: stat(dp(jitter(500, 400, 0, 50_000))),
        IndexingLatency: stat(dp(jitter(10, 8, 1, 500))),
        SearchLatency: stat(dp(jitter(5, 4, 0.5, 200))),
        ClusterStatus_green: stat(Math.random() < er ? 0 : 1),
        ClusterStatus_yellow: stat(Math.random() < er * 0.4 ? 1 : 0),
        ClusterStatus_red: stat(Math.random() < er * 0.1 ? 1 : 0),
        Nodes: stat(randInt(3, 20)),
        AutomatedSnapshotFailure: counter(Math.random() < er ? 1 : 0),
        ClusterIndexWritesBlocked: counter(Math.random() < er * 0.2 ? 1 : 0),
      }
    ),
  ];
}

// ─── Neptune ──────────────────────────────────────────────────────────────────

export function generateNeptuneMetrics(ts, er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "neptune",
      "aws.neptune",
      region,
      account,
      {
        DBClusterIdentifier: rand(["graph-prod", "knowledge-graph", "recommendation-graph"]),
        DBInstanceIdentifier: "neptune-instance-1",
      },
      {
        CPUUtilization: stat(
          dp(Math.random() < er ? jitter(75, 15, 50, 100) : jitter(30, 20, 5, 70))
        ),
        DatabaseConnections: counter(randInt(1, 100)),
        FreeableMemory: stat(dp(jitter(4_000_000_000, 2_000_000_000, 100_000_000, 30_000_000_000))),
        GremlinRequestsPerSec: stat(dp(jitter(100, 80, 0, 10_000))),
        SPARQLRequestsPerSec: stat(dp(jitter(50, 40, 0, 5_000))),
        LoaderRequestsPerSec: stat(dp(jitter(5, 4, 0, 500))),
        NetworkReceiveThroughput: counter(randInt(100_000, 500_000_000)),
        NetworkTransmitThroughput: counter(randInt(100_000, 500_000_000)),
      }
    ),
  ];
}

// ─── Keyspaces (Managed Cassandra) ────────────────────────────────────────────

export function generateKeyspacesMetrics(ts, er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const ks = rand(["prod_keyspace", "analytics", "sessions", "events"]);
  return [
    metricDoc(
      ts,
      "keyspaces",
      "aws.keyspaces",
      region,
      account,
      { Keyspace: ks, TableName: rand(["orders", "users", "sessions", "events"]) },
      {
        ConsumedReadCapacityUnits: counter(randInt(0, 10_000)),
        ConsumedWriteCapacityUnits: counter(randInt(0, 5_000)),
        SuccessfulRequestLatency: stat(dp(jitter(3, 2, 0.5, 100))),
        SystemErrors: counter(Math.random() < er ? randInt(1, 50) : 0),
        UserErrors: counter(randInt(0, 10)),
      }
    ),
  ];
}

// ─── MemoryDB ─────────────────────────────────────────────────────────────────

export function generateMemorydbMetrics(ts, er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "memorydb",
      "aws.memorydb",
      region,
      account,
      {
        ClusterName: rand(["session-store", "leaderboard", "realtime-cache"]),
        NodeName: "cluster-0001-0001",
      },
      {
        CPUUtilization: stat(
          dp(Math.random() < er ? jitter(70, 15, 50, 100) : jitter(20, 15, 1, 60))
        ),
        FreeableMemory: stat(dp(jitter(2_000_000_000, 1_000_000_000, 100_000_000, 8_000_000_000))),
        NetworkBytesIn: counter(randInt(1_000_000, 5_000_000_000)),
        NetworkBytesOut: counter(randInt(1_000_000, 5_000_000_000)),
        CurrConnections: counter(randInt(10, 5_000)),
        Evictions: counter(Math.random() < er ? randInt(1, 10_000) : 0),
      }
    ),
  ];
}

// ─── EBS ──────────────────────────────────────────────────────────────────────

export function generateEbsMetrics(ts, er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return Array.from({ length: randInt(2, 6) }, () => {
    const volId = `vol-${randId(17).toLowerCase()}`;
    const queueDepth = Math.random() < er ? jitter(20, 15, 1, 64) : jitter(0.5, 0.4, 0, 5);
    return metricDoc(
      ts,
      "ebs",
      "aws.ebs",
      region,
      account,
      { VolumeId: volId },
      {
        VolumeReadBytes: counter(randInt(0, 500_000_000)),
        VolumeWriteBytes: counter(randInt(0, 1_000_000_000)),
        VolumeReadOps: counter(randInt(0, 10_000)),
        VolumeWriteOps: counter(randInt(0, 20_000)),
        VolumeTotalReadTime: stat(dp(jitter(0.01, 0.008, 0.001, 2))),
        VolumeTotalWriteTime: stat(dp(jitter(0.02, 0.015, 0.001, 5))),
        VolumeIdleTime: stat(dp(jitter(55, 30, 0, 60))),
        VolumeQueueLength: stat(dp(queueDepth)),
        BurstBalance: stat(dp(Math.random() < er ? jitter(20, 15, 0, 50) : jitter(90, 8, 50, 100))),
      }
    );
  });
}

// ─── EFS ──────────────────────────────────────────────────────────────────────

export function generateEfsMetrics(ts, er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "efs",
      "aws.efs",
      region,
      account,
      { FileSystemId: `fs-${randId(8).toLowerCase()}` },
      {
        BurstCreditBalance: stat(
          dp(
            Math.random() < er
              ? jitter(500_000_000, 400_000_000, 0, 2_000_000_000)
              : jitter(1_500_000_000_000, 500_000_000_000, 0, 2_300_000_000_000)
          )
        ),
        ClientConnections: counter(randInt(1, 500)),
        DataReadIOBytes: stat(dp(jitter(1_000_000, 800_000, 0, 100_000_000))),
        DataWriteIOBytes: stat(dp(jitter(500_000, 400_000, 0, 50_000_000))),
        MetaDataIOBytes: stat(dp(jitter(100_000, 80_000, 0, 10_000_000))),
        PercentIOLimit: stat(
          dp(Math.random() < er ? jitter(80, 15, 50, 100) : jitter(20, 15, 0, 60))
        ),
      }
    ),
  ];
}

// ─── Timestream ───────────────────────────────────────────────────────────────

export function generateTimestreamMetrics(ts, er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "timestream",
      "aws.timestream",
      region,
      account,
      {
        DatabaseName: rand(["iot-timeseries", "metrics-db", "telemetry"]),
        TableName: rand(["sensors", "metrics", "events", "logs"]),
      },
      {
        SuccessfulRequestLatency: stat(dp(jitter(20, 15, 1, 500))),
        SystemErrors: counter(Math.random() < er ? randInt(1, 20) : 0),
        UserErrors: counter(randInt(0, 5)),
        WriteRecords: counter(randInt(0, 100_000)),
      }
    ),
  ];
}

// ─── Backup ───────────────────────────────────────────────────────────────────

export function generateBackupMetrics(ts, er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "backup",
      "aws.backup",
      region,
      account,
      { BackupVaultName: rand(["default", "prod-vault", "compliance-vault"]) },
      {
        NumberOfBackupJobsCompleted: counter(randInt(0, 100)),
        NumberOfBackupJobsFailed: counter(Math.random() < er ? randInt(1, 10) : 0),
        NumberOfRestoreJobsCompleted: counter(randInt(0, 5)),
        NumberOfRestoreJobsFailed: counter(Math.random() < er ? randInt(0, 2) : 0),
      }
    ),
  ];
}

// ─── FSx ──────────────────────────────────────────────────────────────────────

export function generateFsxMetrics(ts, _er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "fsx",
      "aws.fsx",
      region,
      account,
      { FileSystemId: `fs-${randId(8).toLowerCase()}` },
      {
        DataReadBytes: counter(randInt(0, 10_000_000_000)),
        DataWriteBytes: counter(randInt(0, 5_000_000_000)),
        DataReadOperations: counter(randInt(0, 100_000)),
        DataWriteOperations: counter(randInt(0, 50_000)),
        FreeStorageCapacity: stat(
          dp(jitter(100_000_000_000, 50_000_000_000, 1_000_000_000, 1_000_000_000_000))
        ),
      }
    ),
  ];
}

// ─── StorageLens ──────────────────────────────────────────────────────────────

export function generateStoragelensMetrics(ts, er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "s3_storage_lens",
      "aws.s3_storage_lens",
      region,
      account,
      { StorageLensConfigurationId: "default-account-dashboard", AwsOrg: "" },
      {
        StorageBytes: stat(dp(randInt(1_000_000_000_000, 500_000_000_000_000))),
        ObjectCount: stat(randInt(100_000, 1_000_000_000)),
        ActiveBucketCount: stat(randInt(5, 200)),
        GetRequestCount: counter(randInt(0, 50_000_000)),
        PutRequestCount: counter(randInt(0, 10_000_000)),
        BytesDownloaded: counter(randInt(0, 10_000_000_000_000)),
        BytesUploaded: counter(randInt(0, 1_000_000_000_000)),
        "4xxErrorRequestCount": counter(randInt(0, 100_000)),
        "5xxErrorRequestCount": counter(Math.random() < er ? randInt(1, 10_000) : 0),
      }
    ),
  ];
}

// ─── DataSync ─────────────────────────────────────────────────────────────────

export function generateDatasyncMetrics(ts, _er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "datasync",
      "aws.datasync",
      region,
      account,
      { TaskId: `task-${randId(17).toLowerCase()}` },
      {
        FilesTransferred: counter(randInt(0, 1_000_000)),
        BytesTransferred: counter(randInt(0, 100_000_000_000)),
        FilesVerified: counter(randInt(0, 1_000_000)),
        FilesDeleted: counter(randInt(0, 10_000)),
        FilesPrepared: counter(randInt(0, 2_000_000)),
        FilesSkipped: counter(randInt(0, 100_000)),
      }
    ),
  ];
}

// ─── Storage Gateway ──────────────────────────────────────────────────────────

export function generateStoragegatewayMetrics(ts, er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "storagegateway",
      "aws.storagegateway",
      region,
      account,
      {
        GatewayId: `sgw-${randId(8)}`,
        GatewayName: rand(["prod-gateway", "backup-gw", "file-gw"]),
      },
      {
        CacheHitPercent: stat(
          dp(Math.random() < er ? jitter(40, 25, 0, 70) : jitter(90, 8, 70, 100))
        ),
        CacheFree: stat(dp(jitter(50_000_000_000, 30_000_000_000, 1_000_000_000, 200_000_000_000))),
        CacheUsed: stat(dp(jitter(20_000_000_000, 15_000_000_000, 0, 100_000_000_000))),
        ReadBytes: counter(randInt(0, 10_000_000_000)),
        WriteBytes: counter(randInt(0, 5_000_000_000)),
      }
    ),
  ];
}

// ─── QLDB ─────────────────────────────────────────────────────────────────────

export function generateQldbMetrics(ts, er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "qldb",
      "aws.qldb",
      region,
      account,
      { LedgerName: rand(["vehicle-registration", "supply-chain", "financial-ledger"]) },
      {
        CommandsCount: counter(randInt(0, 10_000)),
        SessionsCount: counter(randInt(0, 1_000)),
        SystemErrors: counter(Math.random() < er ? randInt(1, 100) : 0),
        UserErrors: counter(randInt(0, 20)),
        TransactionSuccess: counter(randInt(0, 10_000)),
        TransactionAbort: counter(Math.random() < er ? randInt(0, 500) : 0),
      }
    ),
  ];
}
