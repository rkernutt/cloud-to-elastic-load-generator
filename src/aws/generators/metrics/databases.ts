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

function rdsMetrics(
  ts: string,
  er: number,
  instances: readonly RdsInstanceRow[],
  engine: string | null,
  dataset: string
) {
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

export function generateRdsMetrics(ts: string, er: number) {
  const baseDocs = rdsMetrics(ts, er, RDS_INSTANCES, "rds", "aws.rds");
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);

  // Performance Insights metrics (separate dimension set, ~50% of instances)
  const piDocs: ReturnType<typeof metricDoc>[] = [];
  for (const inst of sample([...RDS_INSTANCES], randInt(1, 3))) {
    if (Math.random() < 0.5) continue;
    const dbLoad = Math.random() < er ? jitter(8, 5, 2, 30) : jitter(1.5, 1, 0.1, 5);
    const vcpus = rand([2, 4, 8, 16]);
    piDocs.push(
      metricDoc(
        ts,
        "rds",
        "aws.rds",
        region,
        account,
        {
          DBInstanceIdentifier: inst.id,
          EngineName: inst.engine,
          MetricType: "PerformanceInsights",
        },
        {
          "db.load.avg": stat(dp(dbLoad)),
          "db.load.max": stat(dp(dbLoad * jitter(2, 1, 1.2, 5))),
          "db.load.nonCPU.avg": stat(dp(Math.max(0, dbLoad - vcpus * 0.5))),
          "db.sampledload.avg": stat(dp(dbLoad * jitter(0.95, 0.04, 0.8, 1))),
          "os.cpuUtilization.total.avg": stat(
            dp(Math.random() < er ? jitter(80, 12, 60, 100) : jitter(30, 20, 5, 90))
          ),
          "os.memory.free.avg": stat(
            dp(jitter(2_000_000_000, 1_500_000_000, 100_000_000, 16_000_000_000))
          ),
          "os.diskIO.readIOsPS.avg": stat(dp(jitter(500, 400, 0, 5000))),
          "os.diskIO.writeIOsPS.avg": stat(dp(jitter(800, 600, 0, 8000))),
          "os.diskIO.avgQueueLen.avg": stat(
            dp(Math.random() < er ? jitter(5, 4, 0.5, 30) : jitter(0.2, 0.15, 0, 2))
          ),
          "os.diskIO.await.avg": stat(
            dp(Math.random() < er ? jitter(50, 40, 1, 200) : jitter(2, 1.5, 0.1, 10))
          ),
          DBLoadCPU: stat(dp(Math.min(dbLoad, vcpus))),
          DBLoadNonCPU: stat(dp(Math.max(0, dbLoad - vcpus * 0.3))),
          vCPUs: stat(vcpus),
        }
      )
    );
  }

  return [...baseDocs, ...piDocs];
}
export function generateAuroraMetrics(ts: string, er: number) {
  const base = rdsMetrics(ts, er, AURORA_INSTANCES, "aurora", "aws.rds");
  return base.map((doc) => {
    const aws = doc.aws as { aurora: { metrics: Record<string, unknown> } };
    const m = aws.aurora.metrics;
    const lagMs = Math.random() < er ? jitter(8000, 6000, 50, 120_000) : jitter(45, 35, 0, 800);
    const serverless = Math.random() < 0.3;
    const cap = serverless ? jitter(48, 32, 2, 128) : 0;
    Object.assign(m, {
      AuroraReplicaLag: stat(dp(lagMs)),
      AuroraReplicaLagMaximum: stat(dp(lagMs * jitter(1.8, 0.3, 1, 4))),
      AuroraReplicaLagMinimum: stat(dp(lagMs * jitter(0.35, 0.12, 0, 1))),
      AuroraBinlogReplicaLag: stat(
        dp(Math.random() < er ? jitter(90, 70, 0, 3600) : jitter(0.4, 0.25, 0, 8))
      ),
      AuroraGlobalDBReplicatedWriteIO: counter(randInt(0, 50_000_000)),
      AuroraGlobalDBDataTransferBytes: counter(randInt(0, 8_000_000_000)),
      AuroraGlobalDBReplicationLag: stat(
        dp(Math.random() < er ? jitter(3500, 2500, 200, 60_000) : jitter(120, 90, 0, 2000))
      ),
      BacktrackChangeRecordsCreationRate: stat(dp(jitter(25, 20, 0, 5000))),
      BacktrackChangeRecordsStored: stat(dp(randInt(0, 500_000_000))),
      VolumeBytesUsed: stat(dp(randInt(20_000_000_000, 600_000_000_000))),
      VolumeReadIOPs: counter(randInt(0, 80_000)),
      VolumeWriteIOPs: counter(randInt(0, 50_000)),
      ServerlessDatabaseCapacity: stat(dp(cap), {
        max: serverless ? dp(jitter(cap * 1.2, cap * 0.1, cap, 128)) : 0,
      }),
    });
    return doc;
  });
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

export function generateDynamodbMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(DYNAMO_TABLES, randInt(3, 7)).map((table) => {
    const rcuConsumed = randInt(0, 10_000);
    const wcuConsumed = randInt(0, 5_000);
    const readThrottled = Math.random() < er ? randInt(50, 8000) : randInt(0, 8);
    const writeThrottled =
      readThrottled > 0
        ? Math.round(readThrottled * jitter(0.65, 0.15, 0, 1))
        : randInt(0, er ? 500 : 3);
    const globalTable = Math.random() < 0.2;
    const onDemand = Math.random() < 0.55;
    const latAvg = jitter(5, 4, 0.5, er ? 800 : 120);
    const latMax = latAvg * jitter(4, 2, 1.2, 25);
    const provR = Math.max(rcuConsumed * 1.5, 5);
    const provW = Math.max(wcuConsumed * 1.5, 5);
    return metricDoc(
      ts,
      "dynamodb",
      "aws.dynamodb",
      region,
      account,
      {
        TableName: table,
        Operation: rand([
          "GetItem",
          "PutItem",
          "Query",
          "Scan",
          "UpdateItem",
          "DeleteItem",
          "BatchGetItem",
          "BatchWriteItem",
          "TransactWriteItems",
        ]),
        ...(globalTable ? { ReceivingRegion: rand(REGIONS) } : {}),
      },
      {
        ConsumedReadCapacityUnits: stat(rcuConsumed, { sum: rcuConsumed * 60 }),
        ConsumedWriteCapacityUnits: stat(wcuConsumed, { sum: wcuConsumed * 60 }),
        ProvisionedReadCapacityUnits: stat(dp(provR)),
        ProvisionedWriteCapacityUnits: stat(dp(provW)),
        ReadThrottleEvents: counter(readThrottled),
        WriteThrottleEvents: counter(writeThrottled),
        OnDemandReadRequestCount: counter(onDemand ? randInt(0, 5_000_000) : 0),
        OnDemandWriteRequestCount: counter(onDemand ? randInt(0, 2_000_000) : 0),
        ReturnedItemCount: counter(randInt(0, 5000)),
        SystemErrors: counter(Math.random() < er * 0.5 ? randInt(1, 80) : 0),
        UserErrors: counter(randInt(0, 25)),
        TransactionConflict: counter(Math.random() < er ? randInt(0, 200) : randInt(0, 3)),
        ReplicationLatency: stat(
          dp(
            globalTable
              ? Math.random() < er
                ? jitter(900, 700, 50, 15_000)
                : jitter(120, 90, 5, 2000)
              : 0
          )
        ),
        PendingReplicationCount: stat(globalTable ? randInt(0, Math.random() < er ? 5000 : 80) : 0),
        AccountMaxTableLevelReads: stat(randInt(40_000, 400_000)),
        AccountMaxTableLevelWrites: stat(randInt(40_000, 200_000)),
        SuccessfulRequestLatency: stat(dp(latAvg), { max: dp(latMax), sum: dp(latAvg * 60) }),
        TimeToLiveDeletedItemCount: counter(randInt(0, 50_000)),
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

export function generateElasticacheMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(CACHE_CLUSTERS, randInt(1, 3)).map((cluster) => {
    const hits = randInt(1_000, 500_000);
    const misses = randInt(100, 50_000);
    const hitRate = dp((hits / (hits + misses)) * 100);
    const cpu = Math.random() < er ? jitter(70, 15, 50, 100) : jitter(15, 10, 1, 60);
    const engineCpu = Math.random() < er ? jitter(65, 18, 40, 100) : jitter(12, 8, 1, 55);
    const memPct = Math.random() < er ? jitter(85, 10, 70, 100) : jitter(40, 20, 5, 75);
    const isRedis = cluster.engine === "redis";
    const evict = Math.random() < er ? randInt(500, 80_000) : randInt(0, 200);
    return metricDoc(
      ts,
      "elasticache",
      "aws.elasticache",
      region,
      account,
      { CacheClusterId: cluster.id, CacheNodeId: "0001" },
      {
        CPUUtilization: stat(dp(cpu)),
        EngineCPUUtilization: stat(dp(engineCpu)),
        DatabaseMemoryUsagePercentage: stat(dp(memPct)),
        FreeableMemory: stat(dp(jitter(500_000_000, 400_000_000, 10_000_000, 8_000_000_000))),
        CacheHits: counter(hits),
        CacheMisses: counter(misses),
        CacheHitRate: stat(hitRate),
        CurrConnections: counter(randInt(10, 5_000)),
        NewConnections: counter(randInt(5, 2_000)),
        BytesUsedForCache: stat(dp(randInt(50_000_000, 12_000_000_000))),
        Evictions: counter(evict),
        NetworkBytesIn: counter(randInt(1_000_000, 5_000_000_000)),
        NetworkBytesOut: counter(randInt(1_000_000, 5_000_000_000)),
        ReplicationLag: stat(
          dp(
            isRedis ? (Math.random() < er ? jitter(800, 600, 20, 8000) : jitter(25, 20, 0, 400)) : 0
          ) / 1000
        ),
        CurrItems: counter(randInt(100, 10_000_000)),
        StringBasedCmds: counter(randInt(1_000, 2_000_000)),
        HashBasedCmds: counter(randInt(500, 800_000)),
        ListBasedCmds: counter(randInt(200, 400_000)),
        SetBasedCmds: counter(randInt(100, 300_000)),
        SortedSetBasedCmds: counter(randInt(100, 500_000)),
        SaveInProgress: stat(Math.random() < er * 0.08 ? 1 : 0),
        GetTypeCmds: counter(randInt(1_000, 1_000_000)),
        SetTypeCmds: counter(randInt(100, 100_000)),
      }
    );
  });
}

// ─── Redshift ─────────────────────────────────────────────────────────────────

const REDSHIFT_CLUSTERS = ["analytics-cluster", "reporting-dw", "bi-cluster", "data-warehouse"];

export function generateRedshiftMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(REDSHIFT_CLUSTERS, randInt(1, 2)).flatMap((clusterId) => {
    const cpu = Math.random() < er ? jitter(75, 15, 50, 100) : jitter(30, 20, 5, 80);
    const docs = [];

    // Cluster-level metrics (Leader node)
    docs.push(
      metricDoc(
        ts,
        "redshift",
        "aws.redshift",
        region,
        account,
        { ClusterIdentifier: clusterId, NodeID: "Leader" },
        {
          CPUUtilization: stat(dp(cpu)),
          PercentageDiskSpaceUsed: stat(dp(jitter(45, 25, 5, 95))),
          DatabaseConnections: counter(randInt(1, 500)),
          HealthStatus: stat(Math.random() < er ? 0 : 1),
          MaintenanceMode: stat(0),
          QueryDuration: stat(dp(jitter(500, 400, 10, 300_000)), {
            max: dp(jitter(30_000, 20_000, 1_000, 600_000)),
          }),
          QueriesCompletedPerSecond: stat(dp(jitter(5, 4, 0, 100))),
          NumExceededSchemaQuotas: counter(Math.random() < er ? randInt(1, 10) : 0),
          ReadLatency: stat(dp(jitter(0.01, 0.008, 0.001, 1))),
          WriteLatency: stat(dp(jitter(0.05, 0.04, 0.001, 5))),
          ReadIOPS: counter(randInt(100, 50_000)),
          WriteIOPS: counter(randInt(100, 30_000)),
          ReadThroughput: counter(randInt(1_000_000, 5_000_000_000)),
          WriteThroughput: counter(randInt(1_000_000, 2_000_000_000)),
          NetworkReceiveThroughput: counter(randInt(1_000_000, 10_000_000_000)),
          NetworkTransmitThroughput: counter(randInt(1_000_000, 10_000_000_000)),
          CommitQueueLength: stat(
            dp(Math.random() < er ? jitter(5, 4, 0, 20) : jitter(0.5, 0.4, 0, 3))
          ),
          ConcurrencyScalingActiveClusters: stat(Math.random() < er ? randInt(1, 5) : 0),
          ConcurrencyScalingSeconds: stat(dp(Math.random() < er ? jitter(300, 200, 0, 3600) : 0)),
          MaxConfiguredConcurrencyScalingClusters: stat(5),
          TotalTableCount: stat(randInt(100, 10000)),
        }
      )
    );

    // WLM queue metrics
    const wlmQueues = ["etl_queue", "analyst_queue", "default_queue"];
    for (const queue of sample(wlmQueues, randInt(1, 3))) {
      docs.push(
        metricDoc(
          ts,
          "redshift",
          "aws.redshift",
          region,
          account,
          { ClusterIdentifier: clusterId, service_class: String(randInt(6, 14)), QueueName: queue },
          {
            WLMQueriesCompletedPerSecond: stat(dp(jitter(2, 1.5, 0, 50))),
            WLMQueryDuration: stat(dp(jitter(5_000, 4_000, 100, 300_000))),
            WLMQueueLength: stat(Math.random() < er ? randInt(1, 50) : randInt(0, 3)),
            WLMQueueWaitTime: stat(
              dp(
                Math.random() < er ? jitter(10_000, 8_000, 100, 60_000) : jitter(100, 80, 0, 2_000)
              )
            ),
            WLMRunningQueries: stat(randInt(0, 15)),
          }
        )
      );
    }

    // Spectrum metrics (if applicable)
    if (Math.random() < 0.3) {
      docs.push(
        metricDoc(
          ts,
          "redshift",
          "aws.redshift",
          region,
          account,
          { ClusterIdentifier: clusterId, NodeID: "Leader", QueryType: "Spectrum" },
          {
            SpectrumScanRowCount: counter(randInt(0, 100_000_000)),
            SpectrumScanSizeInMB: counter(dp(jitter(500, 400, 0, 50_000))),
          }
        )
      );
    }

    return docs;
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

export function generateS3Metrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(S3_BUCKETS, randInt(3, 7)).map((bucket) => {
    const storageGb = randInt(500, 800_000);
    const err4 = Math.random() < er ? randInt(50, 50_000) : randInt(0, 2_000);
    const err5 = Math.random() < er ? randInt(1, 2_000) : 0;
    const fblAvg = Math.random() < er ? jitter(800, 400, 50, 8000) : jitter(45, 35, 5, 400);
    const fblMax = fblAvg * jitter(3, 1.5, 1.2, 12);
    const trlAvg = Math.random() < er ? jitter(1200, 600, 100, 15000) : jitter(120, 80, 10, 800);
    const trlMax = trlAvg * jitter(2.5, 1, 1.1, 8);
    const selectScanned = randInt(0, 50_000_000_000);
    const selectReturned = Math.min(selectScanned, randInt(0, 5_000_000_000));
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
        NumberOfObjects: stat(randInt(10_000, 500_000_000)),
        AllRequests: counter(randInt(0, 10_000_000)),
        GetRequests: counter(randInt(0, 8_000_000)),
        PutRequests: counter(randInt(0, 2_000_000)),
        DeleteRequests: counter(randInt(0, 500_000)),
        HeadRequests: counter(randInt(0, 1_000_000)),
        PostRequests: counter(randInt(0, 200_000)),
        SelectRequests: counter(randInt(0, 50_000)),
        ListRequests: counter(randInt(0, 500_000)),
        "4xxErrors": counter(err4),
        "5xxErrors": counter(err5),
        FirstByteLatency: stat(dp(fblAvg), { max: dp(fblMax) }),
        TotalRequestLatency: stat(dp(trlAvg), { max: dp(trlMax) }),
        BytesDownloaded: counter(randInt(0, 1_000_000_000_000)),
        BytesUploaded: counter(randInt(0, 500_000_000_000)),
        SelectScannedBytes: counter(selectScanned),
        SelectReturnedBytes: counter(selectReturned),
      }
    );
  });
}

// ─── DocumentDB ───────────────────────────────────────────────────────────────

export function generateDocdbMetrics(ts: string, er: number) {
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
        DatabaseConnections: counter(randInt(5, 400)),
        DatabaseCursors: counter(randInt(0, 5000)),
        FreeableMemory: stat(dp(jitter(2_000_000_000, 1_000_000_000, 100_000_000, 8_000_000_000))),
        ReadLatency: stat(dp(jitter(2, 1.5, 0.1, 50) / 1000)),
        WriteLatency: stat(dp(jitter(3, 2, 0.1, 80) / 1000)),
        ReadIOPS: counter(randInt(0, 5_000)),
        WriteIOPS: counter(randInt(0, 2_000)),
        NetworkReceiveThroughput: counter(randInt(100_000, 100_000_000)),
        OpcountersCommand: counter(randInt(50, 50_000)),
        OpcountersQuery: counter(randInt(100, 100_000)),
        OpcountersInsert: counter(randInt(10, 10_000)),
        OpcountersUpdate: counter(randInt(10, 5_000)),
        OpcountersDelete: counter(randInt(0, 1_000)),
        BufferCacheHitRatio: stat(
          dp(Math.random() < er ? jitter(0.75, 0.15, 0.2, 0.99) : jitter(0.985, 0.01, 0.92, 0.999))
        ),
        VolumeBytesUsed: stat(dp(randInt(8_000_000_000, 80_000_000_000_000))),
        VolumeReadIOPs: counter(randInt(0, 40_000)),
        VolumeWriteIOPs: counter(randInt(0, 25_000)),
        DocumentsDeleted: counter(randInt(0, 50_000)),
        DocumentsInserted: counter(randInt(0, 80_000)),
        DocumentsReturned: counter(randInt(0, 500_000)),
        DocumentsUpdated: counter(randInt(0, 40_000)),
      }
    ),
  ];
}

// ─── OpenSearch / Elasticsearch ───────────────────────────────────────────────

export function generateOpensearchMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const domain = rand(["search-prod", "logs-cluster", "analytics-os", "observability-os"]);
  const red = Math.random() < er * 0.12 ? 1 : 0;
  const yellow = !red && Math.random() < er * 0.35 ? 1 : 0;
  const green = red || yellow ? 0 : 1;
  const idxLat = jitter(12, 9, 0.5, er ? 2000 : 200);
  const searchLat = jitter(8, 6, 0.3, er ? 1500 : 150);
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
        JVMGCYoungCollectionCount: counter(randInt(10, 50_000)),
        JVMGCOldCollectionCount: counter(randInt(0, 500)),
        FreeStorageSpace: stat(dp(jitter(50_000, 40_000, 5_000, 1_000_000))),
        ClusterUsedSpace: stat(dp(jitter(500_000_000_000, 200_000_000_000, 1e9, 5e12))),
        IndexingRate: stat(dp(jitter(1_000, 800, 0, 100_000))),
        SearchRate: stat(dp(jitter(500, 400, 0, 50_000))),
        IndexingLatency: stat(dp(idxLat), { max: dp(idxLat * jitter(5, 2, 2, 30)) }),
        SearchLatency: stat(dp(searchLat), { max: dp(searchLat * jitter(6, 2, 2, 40)) }),
        "ClusterStatus.green": stat(green),
        "ClusterStatus.yellow": stat(yellow),
        "ClusterStatus.red": stat(red),
        ClusterStatus_green: stat(green),
        ClusterStatus_yellow: stat(yellow),
        ClusterStatus_red: stat(red),
        Nodes: stat(randInt(3, 24)),
        SearchableDocuments: stat(randInt(100_000, 2_000_000_000)),
        DeletedDocuments: stat(randInt(0, 50_000_000)),
        "2xx": counter(randInt(1_000_000, 80_000_000)),
        "3xx": counter(randInt(0, 500_000)),
        "4xx": counter(randInt(0, er ? 500_000 : 50_000)),
        "5xx": counter(randInt(0, er ? 200_000 : 5_000)),
        MasterReachableFromNode: stat(Math.random() < er * 0.05 ? 0 : 1),
        AutomatedSnapshotFailure: counter(Math.random() < er ? 1 : 0),
        ClusterIndexWritesBlocked: counter(Math.random() < er * 0.2 ? 1 : 0),
        ThreadpoolSearchQueue: stat(randInt(0, er ? 5000 : 200)),
        ThreadpoolWriteQueue: stat(randInt(0, er ? 3000 : 120)),
        ThreadpoolForcemergeQueue: stat(randInt(0, er ? 200 : 10)),
        CoordinatingWriteRejected: counter(Math.random() < er ? randInt(0, 5000) : 0),
        PrimaryWriteRejected: counter(Math.random() < er ? randInt(0, 3000) : 0),
        ReplicaWriteRejected: counter(Math.random() < er ? randInt(0, 2000) : 0),
      }
    ),
  ];
}

// ─── Neptune ──────────────────────────────────────────────────────────────────

export function generateNeptuneMetrics(ts: string, er: number) {
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
        GremlinErrors: counter(Math.random() < er ? randInt(1, 500) : randInt(0, 5)),
        SparqlRequestsPerSec: stat(dp(jitter(50, 40, 0, 5_000))),
        SparqlErrors: counter(Math.random() < er ? randInt(1, 200) : randInt(0, 3)),
        LoaderRequestsPerSec: stat(dp(jitter(5, 4, 0, 500))),
        VolumeBytesUsed: stat(dp(randInt(6_000_000_000, 400_000_000_000))),
        VolumeReadIOPs: counter(randInt(0, 60_000)),
        VolumeWriteIOPs: counter(randInt(0, 40_000)),
        BufferCacheHitRatio: stat(
          dp(Math.random() < er ? jitter(0.82, 0.12, 0.3, 0.99) : jitter(0.992, 0.005, 0.94, 0.999))
        ),
        GremlinWebSocketOpenConnections: stat(randInt(0, 8000)),
        NetworkReceiveThroughput: counter(randInt(100_000, 500_000_000)),
        NetworkTransmitThroughput: counter(randInt(100_000, 500_000_000)),
      }
    ),
  ];
}

// ─── Keyspaces (Managed Cassandra) ────────────────────────────────────────────

export function generateKeyspacesMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const ks = rand(["prod_keyspace", "analytics", "sessions", "events"]);
  const readCap = randInt(0, 12_000);
  const writeCap = randInt(0, 6_000);
  const storageBytes = randInt(50_000_000, 12_000_000_000_000);
  const successful = randInt(5_000, 2_000_000);
  return [
    metricDoc(
      ts,
      "keyspaces",
      "aws.keyspaces",
      region,
      account,
      { Keyspace: ks, TableName: rand(["orders", "users", "sessions", "events"]) },
      {
        ConsumedReadCapacityUnits: counter(readCap),
        ConsumedWriteCapacityUnits: counter(writeCap),
        ReadThrottleEvents: counter(Math.random() < er ? randInt(1, 200) : 0),
        WriteThrottleEvents: counter(Math.random() < er ? randInt(1, 150) : 0),
        SuccessfulRequestCount: counter(successful),
        SuccessfulRequestLatency: stat(dp(jitter(3, 2, 0.5, 100)), {
          max: dp(jitter(25, 18, 1, er ? 800 : 200)),
        }),
        SystemErrors: counter(Math.random() < er ? randInt(1, 50) : 0),
        UserErrors: counter(randInt(0, 10)),
        ConditionalCheckFailedRequests: counter(randInt(0, 500)),
        TableSizeInBytes: stat(dp(storageBytes)),
        PartitionCount: stat(randInt(1, 500_000)),
      }
    ),
  ];
}

// ─── MemoryDB ─────────────────────────────────────────────────────────────────

export function generateMemorydbMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const hits = randInt(50_000, 2_000_000);
  const misses = randInt(500, 120_000);
  const memPct = Math.random() < er ? jitter(88, 8, 70, 100) : jitter(52, 22, 12, 88);
  const replLagSec = Math.random() < er ? jitter(12, 8, 0.5, 120) : jitter(0.08, 0.06, 0, 2.5);
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
        EngineCPUUtilization: stat(
          dp(Math.random() < er ? jitter(65, 18, 40, 100) : jitter(18, 12, 1, 55))
        ),
        DatabaseMemoryUsagePercentage: stat(dp(memPct)),
        FreeableMemory: stat(dp(jitter(2_000_000_000, 1_000_000_000, 100_000_000, 8_000_000_000))),
        NetworkBytesIn: counter(randInt(1_000_000, 5_000_000_000)),
        NetworkBytesOut: counter(randInt(1_000_000, 5_000_000_000)),
        CacheHits: counter(hits),
        CacheMisses: counter(misses),
        CurrConnections: counter(randInt(10, 5_000)),
        CurrItems: counter(randInt(1_000, 50_000_000)),
        BytesUsedForData: stat(dp(randInt(100_000_000, 40_000_000_000))),
        ReplicationLag: stat(dp(replLagSec), {
          max: dp(replLagSec * jitter(4, 1.5, 1.5, 12)),
          min: dp(0),
        }),
        Evictions: counter(Math.random() < er ? randInt(1, 10_000) : randInt(0, 80)),
      }
    ),
  ];
}

// ─── EBS ──────────────────────────────────────────────────────────────────────

export function generateEbsMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return Array.from({ length: randInt(2, 6) }, () => {
    const volId = `vol-${randId(17).toLowerCase()}`;
    const queueDepth = Math.random() < er ? jitter(20, 15, 1, 64) : jitter(0.5, 0.4, 0, 5);
    const volTypes = ["gp3", "gp2", "io1", "io2", "st1", "sc1"] as const;
    const volType = Math.random() < 0.4 ? "gp2" : rand([...volTypes]);
    const provisionedIops =
      volType === "io1" || volType === "io2"
        ? randInt(3000, 64_000)
        : volType === "gp3"
          ? randInt(3000, 16_000)
          : 3000;
    const consumedOps =
      Math.random() < er
        ? jitter(provisionedIops * 1.05, 2000, 0, provisionedIops * 2)
        : jitter(provisionedIops * 0.55, 1500, 0, provisionedIops);
    const throughputPct =
      volType === "gp3" || volType === "io2" || volType === "io1"
        ? Math.random() < er
          ? jitter(88, 10, 40, 100)
          : jitter(35, 25, 5, 95)
        : jitter(12, 8, 0, 40);
    const metrics: Record<string, unknown> = {
      VolumeReadOps: counter(randInt(0, 10_000)),
      VolumeWriteOps: counter(randInt(0, 20_000)),
      VolumeReadBytes: counter(randInt(0, 500_000_000)),
      VolumeWriteBytes: counter(randInt(0, 1_000_000_000)),
      VolumeTotalReadTime: stat(dp(jitter(0.01, 0.008, 0.001, 2))),
      VolumeTotalWriteTime: stat(dp(jitter(0.02, 0.015, 0.001, 5))),
      VolumeIdleTime: stat(dp(jitter(55, 30, 0, 60))),
      VolumeQueueLength: stat(dp(queueDepth)),
      VolumeThroughputPercentage: stat(dp(throughputPct)),
      VolumeConsumedReadWriteOps: counter(dp(consumedOps)),
    };
    if (volType === "gp2") {
      metrics.BurstBalance = stat(
        dp(Math.random() < er ? jitter(20, 15, 0, 50) : jitter(90, 8, 50, 100))
      );
    }
    return metricDoc(
      ts,
      "ebs",
      "aws.ebs",
      region,
      account,
      { VolumeId: volId, VolumeType: volType },
      metrics
    );
  });
}

// ─── EFS ──────────────────────────────────────────────────────────────────────

export function generateEfsMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const dataRead = jitter(50_000_000, 40_000_000, 0, 500_000_000_000);
  const dataWrite = jitter(25_000_000, 20_000_000, 0, 200_000_000_000);
  const metaIo = jitter(5_000_000, 4_000_000, 0, 50_000_000_000);
  const totalIo = dataRead + dataWrite + metaIo;
  const storageBytes = randInt(50_000_000_000, 80_000_000_000_000);
  return [
    metricDoc(
      ts,
      "efs",
      "aws.efs",
      region,
      account,
      { FileSystemId: `fs-${randId(8).toLowerCase()}` },
      {
        TotalIOBytes: stat(dp(totalIo)),
        DataReadIOBytes: stat(dp(dataRead)),
        DataWriteIOBytes: stat(dp(dataWrite)),
        MetadataIOBytes: stat(dp(metaIo)),
        PercentIOLimit: stat(
          dp(Math.random() < er ? jitter(92, 6, 75, 100) : jitter(22, 18, 0, 65))
        ),
        BurstCreditBalance: stat(
          dp(
            Math.random() < er
              ? jitter(500_000_000, 400_000_000, 0, 2_000_000_000)
              : jitter(1_500_000_000_000, 500_000_000_000, 0, 2_300_000_000_000)
          )
        ),
        PermittedThroughput: stat(dp(jitter(200, 80, 1, 3072))),
        ClientConnections: counter(randInt(1, 5000)),
        StorageBytes: stat(dp(storageBytes)),
      }
    ),
  ];
}

// ─── Timestream ───────────────────────────────────────────────────────────────

export function generateTimestreamMetrics(ts: string, er: number) {
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
        SystemErrors: counter(Math.random() < er ? randInt(1, 20) : 0),
        UserErrors: counter(randInt(0, 5)),
        SuccessfulRequestLatency: stat(dp(jitter(20, 15, 1, 500)), {
          max: dp(jitter(800, 500, 5, er ? 8000 : 2000)),
        }),
        CumulativeBytesMetered: counter(randInt(1_000_000, 500_000_000_000)),
        MagneticStoreWriteRecordsSucceeded: counter(randInt(0, 50_000_000)),
        MemoryStoreWriteRecordsSucceeded: counter(randInt(0, 200_000_000)),
        MagneticStoreRejectedRecordCount: counter(Math.random() < er ? randInt(1, 2000) : 0),
        WriteRecords: counter(randInt(0, 100_000)),
      }
    ),
  ];
}

// ─── Backup ───────────────────────────────────────────────────────────────────

export function generateBackupMetrics(ts: string, er: number) {
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
        NumberOfBackupJobsCompleted: counter(randInt(0, 500)),
        NumberOfBackupJobsFailed: counter(Math.random() < er ? randInt(1, 50) : randInt(0, 2)),
        NumberOfBackupJobsExpired: counter(randInt(0, 30)),
        NumberOfCopyJobsCompleted: counter(randInt(0, 200)),
        NumberOfCopyJobsFailed: counter(Math.random() < er ? randInt(1, 20) : 0),
        NumberOfRestoreJobsCompleted: counter(randInt(0, 80)),
        NumberOfRestoreJobsFailed: counter(Math.random() < er ? randInt(1, 15) : 0),
      }
    ),
  ];
}

// ─── FSx ──────────────────────────────────────────────────────────────────────

export function generateFsxMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const freeCap = jitter(120_000_000_000, 60_000_000_000, 5_000_000_000, 900_000_000_000);
  const freeData = jitter(80_000_000_000, 40_000_000_000, 1_000_000_000, 600_000_000_000);
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
        MetadataOperations: counter(randInt(0, 250_000)),
        FreeStorageCapacity: stat(dp(freeCap)),
        FreeDataStorageCapacity: stat(dp(freeData)),
        StorageUsed: stat(dp(jitter(4_000_000_000_000, 2_000_000_000_000, 0, 40_000_000_000_000))),
        FileServerCPUUtilization: stat(
          dp(Math.random() < er ? jitter(82, 12, 55, 100) : jitter(32, 20, 5, 75))
        ),
        DiskIopsUtilization: stat(
          dp(Math.random() < er ? jitter(88, 10, 55, 100) : jitter(35, 25, 5, 85))
        ),
      }
    ),
  ];
}

// ─── StorageLens ──────────────────────────────────────────────────────────────

export function generateStoragelensMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const totalBytes = randInt(5_000_000_000_000, 400_000_000_000_000);
  const curVer = Math.floor(totalBytes * jitter(0.72, 0.12, 0.35, 0.98));
  const nonCur = Math.floor(totalBytes * jitter(0.12, 0.06, 0, 0.35));
  const enc = Math.floor(totalBytes * jitter(0.85, 0.08, 0.4, 1));
  return [
    metricDoc(
      ts,
      "s3_storage_lens",
      "aws.s3_storage_lens",
      region,
      account,
      { StorageLensConfigurationId: "default-account-dashboard", AwsOrg: "" },
      {
        ObjectCount: stat(randInt(100_000, 1_000_000_000)),
        StorageBytes: stat(dp(totalBytes)),
        CurrentVersionStorageBytes: stat(dp(curVer)),
        NonCurrentVersionStorageBytes: stat(dp(nonCur)),
        EncryptedStorageBytes: stat(dp(enc)),
        DeleteMarkerObjectCount: stat(randInt(0, 5_000_000)),
        ActiveBucketCount: stat(randInt(5, 200)),
        GetRequestCount: counter(randInt(0, 50_000_000)),
        PutRequestCount: counter(randInt(0, 10_000_000)),
        BytesDownloaded: counter(randInt(0, 10_000_000_000_000)),
        BytesUploaded: counter(randInt(0, 1_000_000_000_000)),
        "4xxErrorRequestCount": counter(randInt(0, 100_000)),
        "5xxErrorRequestCount": counter(Math.random() < er ? randInt(1, 10_000) : 0),
        IncompleteMultipartUploadStorageBytes: stat(dp(randInt(0, 50_000_000_000_000))),
        IncompleteMultipartUploadObjectCount: stat(randInt(0, 2_000_000)),
      }
    ),
  ];
}

// ─── DataSync ─────────────────────────────────────────────────────────────────

export function generateDatasyncMetrics(ts: string, _er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const bytesXfr = randInt(0, 80_000_000_000);
  const prepSrc = Math.floor(bytesXfr * jitter(1.02, 0.08, 1, 1.25));
  const prepDst = Math.floor(bytesXfr * jitter(0.99, 0.06, 0.92, 1.05));
  const filesXfr = randInt(0, 1_000_000);
  const filesPrepSrc = filesXfr + randInt(0, 500_000);
  const filesPrepDst = filesXfr + randInt(0, 200_000);
  return [
    metricDoc(
      ts,
      "datasync",
      "aws.datasync",
      region,
      account,
      { TaskId: `task-${randId(17).toLowerCase()}` },
      {
        BytesTransferred: counter(bytesXfr),
        BytesPreparedSource: counter(prepSrc),
        BytesPreparedDestination: counter(prepDst),
        FilesPreparedSource: counter(filesPrepSrc),
        FilesPreparedDestination: counter(filesPrepDst),
        FilesTransferred: counter(filesXfr),
        BytesVerifiedSource: counter(Math.floor(prepSrc * jitter(0.98, 0.02, 0.9, 1))),
        BytesVerifiedDestination: counter(Math.floor(prepDst * jitter(0.98, 0.02, 0.9, 1))),
      }
    ),
  ];
}

// ─── Storage Gateway ──────────────────────────────────────────────────────────

export function generateStoragegatewayMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const cachePctUsed = Math.random() < er ? jitter(88, 8, 70, 100) : jitter(42, 22, 8, 75);
  const cacheDirty = jitter(6, 5, 0, 35);
  const workingFree = jitter(80_000_000_000, 40_000_000_000, 2_000_000_000, 200_000_000_000);
  const workingPctUsed = Math.random() < er ? jitter(78, 12, 55, 100) : jitter(38, 22, 5, 72);
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
        CachePercentUsed: stat(dp(cachePctUsed)),
        CachePercentDirty: stat(dp(cacheDirty)),
        CloudBytesUploaded: counter(randInt(0, 50_000_000_000)),
        CloudBytesDownloaded: counter(randInt(0, 40_000_000_000)),
        ReadBytes: counter(randInt(0, 10_000_000_000)),
        WriteBytes: counter(randInt(0, 5_000_000_000)),
        ReadTime: stat(dp(jitter(0.08, 0.05, 0.001, 2))),
        WriteTime: stat(dp(jitter(0.12, 0.08, 0.001, 3))),
        WorkingStorageFree: stat(dp(workingFree)),
        WorkingStoragePercentUsed: stat(dp(workingPctUsed)),
        CacheFree: stat(dp(jitter(50_000_000_000, 30_000_000_000, 1_000_000_000, 200_000_000_000))),
        CacheUsed: stat(dp(jitter(20_000_000_000, 15_000_000_000, 0, 100_000_000_000))),
      }
    ),
  ];
}

// ─── QLDB ─────────────────────────────────────────────────────────────────────

export function generateQldbMetrics(ts: string, er: number) {
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
        JournalStorage: stat(dp(jitter(5_000_000_000, 2_000_000_000, 0, 100_000_000_000))),
        IndexedStorage: stat(dp(jitter(2_000_000_000, 800_000_000, 0, 50_000_000_000))),
        OccConflictExceptions: counter(Math.random() < er ? randInt(0, 200) : randInt(0, 5)),
      }
    ),
  ];
}
