import { rand, randInt, randFloat, randId, randIp, randAccount, REGIONS } from "../../helpers";
import type { EcsDocument } from "./types.js";

function generateEmrLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const app = rand(["spark", "hive", "flink", "presto", "hadoop"]);
  const job = rand([
    "etl-daily-aggregation",
    "clickstream-processing",
    "ml-feature-pipeline",
    "log-enrichment",
    "revenue-attribution",
  ]);
  const level = Math.random() < er ? "error" : Math.random() < 0.15 ? "warn" : "info";
  const clusterId = `j-${randId(13)}`;
  const appId = `application_${Date.now()}_${randInt(1000, 9999)}`;
  const executorCount = randInt(4, 64);
  const runState =
    level === "error"
      ? "FAILED"
      : level === "warn" && Math.random() < 0.2
        ? "WAITING"
        : Math.random() < 0.03
          ? "RUNNING"
          : "SUCCEEDED";
  const durationSec = randInt(60, level === "error" ? 7200 : 3600);
  const numCompletedTasks = randInt(10, 500);
  const numFailedTasks = level === "error" ? randInt(1, 20) : 0;
  const sparkStageMsg = () =>
    `Stage ${randInt(0, 8)} (runJob) finished in ${randFloat(1.2, 45.5)} s`;
  const sparkShuffleMsg = () =>
    `Shuffle read: ${Number(randFloat(0.1, 5.2)).toFixed(1)} GB, Shuffle write: ${Number(randFloat(0.1, 4.8)).toFixed(1)} GB`;
  const infoBase = [
    "Job run started",
    "Job submitted to YARN ResourceManager",
    "Writing Parquet to s3://data-lake/processed/",
  ];
  const infoSpark = [
    "Job run succeeded",
    "Stage 0 (Map) completed in 12.4s",
    sparkStageMsg(),
    sparkShuffleMsg(),
    "Executor 7 registered with 4 cores and 8.0 GB RAM",
  ];
  const infoMsgs =
    app === "spark" ? [...infoBase, ...infoSpark] : [...infoBase, "Job run succeeded"];
  const errorMsgs = [
    "Job run failed",
    "ExecutorLostFailure: Executor 11 exited with code 137 (OOMKilled)",
    "Job aborted due to stage failure: Stage 3 failed 4 times",
    "S3 access denied: s3://restricted-bucket/data/",
    "YARN: Container killed on request. Exit code is 143",
  ];
  const MSGS = {
    info: infoMsgs,
    warn: [
      "GC overhead limit approaching: 88% heap used",
      "Executor 3 lost, rescheduling 12 tasks",
      "Shuffle spill to disk: 4.1 GB (insufficient memory)",
    ],
    error: errorMsgs,
  };
  const plainMessage = rand(MSGS[level]);
  const useStructuredLogging = Math.random() < 0.6;
  const message = useStructuredLogging
    ? JSON.stringify({
        clusterId,
        applicationId: appId,
        containerId: `container_${Date.now()}_${randInt(1, 9999)}_01_${randInt(100000, 999999)}`,
        logLevel: level.toUpperCase(),
        message: plainMessage,
        timestamp: new Date(ts).toISOString(),
        component: rand(["driver", "executor", "yarn", "spark"]),
      })
    : plainMessage;
  const heapUsage = randInt(25, 92) / 100;
  const emrMetrics = {
    executor_count: executorCount,
    running_step_count: level === "error" ? 0 : randInt(1, 5),
    failed_step_count: level === "error" ? randInt(1, 3) : 0,
    hdfs_utilization_pct: randInt(20, 95),
    yarn_memory_used_mb: randInt(1024, 65536),
    elapsedTime: durationSec * 1000,
    numCompletedTasks,
    numFailedTasks,
    jvm_heap_usage: heapUsage,
    gc_time_ms: randInt(500, 45000),
    numberAllExecutors: randInt(executorCount, executorCount * 2),
  };
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "emr" },
    },
    aws: {
      dimensions: { JobFlowId: clusterId },
      emr: {
        cluster_id: clusterId,
        cluster_name: `${job}-cluster`,
        application: app,
        release: `emr-6.${randInt(8, 15)}.0`,
        instance_group: rand(["MASTER", "CORE", "TASK"]),
        executor_count: executorCount,
        job: { name: job, id: appId, run_state: runState },
        structured_logging: useStructuredLogging,
        metrics: emrMetrics,
      },
      elasticmapreduce: {
        metrics: {
          S3BytesWritten: { sum: randInt(1e6, 1e12) },
          S3BytesRead: { sum: randInt(1e6, 1e12) },
          HDFSUtilization: { avg: emrMetrics.hdfs_utilization_pct },
          HDFSBytesRead: { sum: randInt(1e6, 1e11) },
          HDFSBytesWritten: { sum: randInt(1e6, 1e11) },
          TotalNodesRunning: { avg: executorCount + 1 },
          YARNMemoryAvailablePercentage: { avg: Number(randFloat(5, 80)) },
          CoreNodesRunning: { avg: randInt(2, executorCount) },
          CoreNodesPending: { avg: level === "error" ? randInt(1, 5) : 0 },
          TaskNodesRunning: { avg: randInt(0, executorCount) },
          LiveDataNodes: { avg: randInt(2, executorCount) },
          CapacityRemainingGB: { avg: Number(randFloat(10, 5000)) },
          MemoryAvailableMB: { sum: emrMetrics.yarn_memory_used_mb },
          MemoryReservedMB: { avg: randInt(512, 32768) },
          MemoryTotalMB: { sum: randInt(8192, 131072) },
          ContainersPending: { avg: level === "error" ? randInt(1, 20) : 0 },
          ContainerPendingRatio: {
            avg: level === "error" ? Number(randFloat(0.5, 5.0)) : Number(randFloat(0, 0.5)),
          },
          ContainersAllocated: { avg: randInt(1, executorCount * 2) },
          AppsCompleted: { sum: randInt(1, 100) },
          AppsFailed: { sum: level === "error" ? randInt(1, 10) : 0 },
          AppsKilled: { sum: level === "error" ? randInt(0, 5) : 0 },
          AppsPending: { avg: randInt(0, 5) },
          AppsRunning: { avg: level === "error" ? 0 : randInt(1, 5) },
        },
      },
    },
    process: {
      name: rand([
        "SparkSubmit",
        "YARNAppMaster",
        "HiveMetastore",
        "PrestoCoordinator",
        "FlinkTaskManager",
      ]),
    },
    log: { level },
    event: {
      outcome: level === "error" ? "failure" : "success",
      category: ["process"],
      dataset: "aws.emr",
      provider: "elasticmapreduce.amazonaws.com",
      duration: durationSec * 1e9,
    },
    message: message,
    ...(level === "error"
      ? { error: { code: "JobFailed", message: rand(MSGS.error), type: "process" } }
      : {}),
  };
}

function generateGlueLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const level = Math.random() < er ? "error" : Math.random() < 0.12 ? "warn" : "info";
  const job = rand([
    "s3-to-redshift-etl",
    "raw-to-curated",
    "pii-masking",
    "schema-handler",
    "incremental-sync",
    "data-quality",
  ]);
  const runId = `jr_${randId(20).toLowerCase()}`;
  const jobType = rand(["glueetl", "pythonshell", "gluestreaming"]);
  const db = rand(["raw_data", "curated", "analytics", "staging"]);
  const dpus = rand([2, 5, 10, 20, 50]);
  const recordsRead = randInt(10000, 50000000);
  const recordsWritten = Math.floor(recordsRead * 0.99);
  const recordsFailed = level === "error" ? randInt(1, 1000) : 0;
  const runState =
    level === "error"
      ? "FAILED"
      : level === "warn" && Math.random() < 0.3
        ? "STOPPED"
        : Math.random() < 0.05
          ? "RUNNING"
          : "SUCCEEDED";
  const durationSec = level === "error" ? randInt(10, 300) : randInt(60, 7200);
  const ERROR_CODES = [
    "GlueException",
    "AccessDenied",
    "ConnectionFailure",
    "ResourceNotFound",
    "ValidationException",
  ];
  const ERROR_MSGS = [
    "Access Denied calling getDynamicFrame",
    "ClassCastException: StringType to LongType",
    "Connection to Redshift failed: max_connections exceeded",
    "GlueException: Could not find table",
  ];
  const isErr = level === "error";
  const sparkStageMsg = () =>
    `Stage ${randInt(0, 8)} (runJob) finished in ${randFloat(1.2, 45.5)} s`;
  const sparkShuffleMsg = () =>
    `Shuffle read: ${Number(randFloat(0.1, 5.2)).toFixed(1)} GB, Shuffle write: ${Number(randFloat(0.1, 4.8)).toFixed(1)} GB`;
  const infoBase = [
    "Job run started with 10 DPUs",
    "Job run started",
    "Reading from S3 path: s3://data-lake/raw/",
    "Schema inferred: 47 columns detected",
    "Writing 2,847,291 records to target",
    "Crawler completed: 3 tables updated",
    "Bookmark updated: processed up to offset 9823741",
  ];
  const infoSpark = [
    "Job run succeeded",
    "Stage 0 (runJob) finished in 12.456 s",
    sparkStageMsg(),
    sparkShuffleMsg(),
    "Executor 3 registered with 4 cores and 8.0 GB RAM",
    "Writing Parquet to s3://data-lake/processed/",
  ];
  const infoMsgs = jobType === "glueetl" ? [...infoBase, ...infoSpark] : infoBase;
  const warnSpark = [
    "GC overhead limit approaching: 88% heap used",
    "Shuffle spill to disk: 4.1 GB (insufficient memory)",
  ];
  const MSGS = {
    info: infoMsgs,
    warn: [
      "Schema mismatch: column type changed",
      "Null values in non-nullable column",
      "DPU utilization at 94%",
      "Duplicate primary keys detected",
      ...(jobType === "glueetl" ? warnSpark : []),
    ],
    error: [...ERROR_MSGS, "Job run failed"],
  };
  const plainMessage = rand(MSGS[level]);
  // Continuous logging: emit JSON in message so ingest pipeline can parse into glue.parsed
  const useContinuousLogging = Math.random() < 0.65;
  const message = useContinuousLogging
    ? JSON.stringify({
        jobName: job,
        jobRunId: runId,
        level: level.toUpperCase(),
        message: plainMessage,
        timestamp: new Date(ts).toISOString(),
        thread: `driver-${randId(8).toLowerCase()}`,
        logger: rand(["org.apache.spark", "com.amazonaws.glue", "org.apache.hadoop"]),
        ...(isErr ? { errorCode: rand(ERROR_CODES) } : {}),
      })
    : plainMessage;
  // Job metrics (when "Enable job metrics" is on in Glue) — align with AWS Glue Observability metric names
  const heapUsedPct = randInt(25, 92) / 100;
  const diskUsedPct = randInt(15, 85) / 100;
  const diskUsedGB = randInt(20, 400);
  const diskAvailGB = Math.round((diskUsedGB / diskUsedPct) * (1 - diskUsedPct));
  const heapUsedBytes = randInt(512 * 1e6, 4 * 1e9);
  const heapAvailBytes = Math.round((heapUsedBytes * (1 - heapUsedPct)) / heapUsedPct);
  const numCompletedTasks = randInt(10, 500);
  const numFailedTasks = isErr ? randInt(1, 20) : 0;
  const numKilledTasks = isErr ? randInt(0, 5) : 0;
  const numCompletedStages = randInt(1, 12);
  const numberAllExecutors = randInt(dpus, dpus * 2);
  const numberMaxNeededExecutors = randInt(numberAllExecutors, dpus * 3);
  const bytesRead = Math.floor(recordsRead * randInt(50, 500)); // synthetic bytes from records
  const bytesWritten = Math.floor(recordsWritten * randInt(50, 500));
  const glueMetrics = {
    driver: {
      aggregate: {
        numRecords: recordsRead,
        numFailedRecords: recordsFailed,
        elapsedTime: durationSec * 1000, // CloudWatch: glue.driver.aggregate.elapsedTime in milliseconds
        numCompletedTasks,
        numFailedTasks,
        numKilledTasks,
        numCompletedStages,
        bytesRead,
        shuffleBytesWritten: randInt(0, Math.floor(bytesRead * 0.8)),
        shuffleLocalBytesRead: randInt(0, Math.floor(bytesRead * 0.7)),
        gc_time_ms: randInt(500, 45000),
      },
      // AWS Glue Observability: glue.driver.memory.heap.* and glue.driver.memory.heap.used.percentage
      memory: {
        heap: {
          available: heapAvailBytes,
          used: heapUsedBytes,
          used_percentage: Math.round(heapUsedPct * 100),
        },
        "non-heap": {
          available: randInt(64e6, 256e6),
          used: randInt(32e6, 128e6),
          used_percentage: randInt(20, 60),
        },
      },
      // Alias for dashboards expecting jvm.heap.usage (0–1)
      jvm: { heap: { usage: heapUsedPct } },
      // AWS Glue Observability: glue.driver.disk.available_GB, used_GB, used.percentage; plus Spark-style diskSpaceUsed_MB
      disk: {
        available_GB: diskAvailGB,
        used_GB: diskUsedGB,
        used_percentage: Math.round(diskUsedPct * 100),
        diskSpaceUsed_MB: randInt(128, 2048),
      },
      BlockManager: { disk: { diskSpaceUsed_MB: randInt(128, 2048) } },
      ExecutorAllocationManager: {
        executors: {
          numberAllExecutors,
          numberMaxNeededExecutors: numberMaxNeededExecutors,
        },
      },
      // glue.driver.s3.filesystem.read_bytes / write_bytes (delta since last report)
      s3: {
        filesystem: { read_bytes: randInt(0, bytesRead), write_bytes: randInt(0, bytesWritten) },
      },
      // glue.driver.system.cpuSystemLoad (0–1)
      system: { cpuSystemLoad: randInt(15, 85) / 100 },
      workerUtilization: randInt(40, 95) / 100,
      // AWS Glue Observability: glue.driver.skewness.stage, glue.driver.skewness.job (job_performance)
      skewness: {
        stage: Number(randFloat(0, 2.5)), // 0 = no skew; higher = max/median task duration ratio
        job: Number(randFloat(0, 2.2)), // job-level skew (max weighted stage skewness)
      },
    },
    executor: {
      aggregate: { numCompletedTasks, numFailedTasks, gc_time_ms: randInt(200, 60000) },
    },
    // glue.ALL (executors aggregate) — same structure for executor memory/disk; jvm.heap.usage for dashboards
    ALL: {
      memory: {
        heap: {
          available: randInt(1e9, 16e9),
          used: randInt(512e6, 12e9),
          used_percentage: randInt(35, 88),
        },
        "non-heap": {
          available: randInt(128e6, 512e6),
          used: randInt(64e6, 256e6),
          used_percentage: randInt(25, 55),
        },
      },
      jvm: { heap: { usage: randInt(35, 88) / 100 } },
      disk: {
        available_GB: randInt(100, 800),
        used_GB: randInt(50, 400),
        used_percentage: randInt(20, 75),
        diskSpaceUsed_MB: randInt(512, 4096),
      },
      s3: {
        filesystem: { read_bytes: randInt(0, bytesRead), write_bytes: randInt(0, bytesWritten) },
      },
      system: { cpuSystemLoad: randInt(20, 90) / 100 },
    },
  };
  // Observability error category when job fails (see monitor-observability.html error categories)
  const OBSERVABILITY_ERROR_CATEGORIES = [
    "OUT_OF_MEMORY_ERROR",
    "PERMISSION_ERROR",
    "CONNECTION_ERROR",
    "RESOURCE_NOT_FOUND_ERROR",
    "THROTTLING_ERROR",
    "SYNTAX_ERROR",
    "GLUE_OPERATION_TIMEOUT_ERROR",
    "S3_ERROR",
    "UNCLASSIFIED_SPARK_ERROR",
  ];
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "glue" },
    },
    aws: {
      dimensions: { JobName: job, JobRunId: runId, Type: jobType },
      glue: {
        ...(isErr ? { error_category: rand(OBSERVABILITY_ERROR_CATEGORIES) } : {}),
        job: { name: job, run_id: runId, type: jobType, run_state: runState },
        database: db,
        table: rand(["events", "users", "transactions", "sessions", "products"]),
        dpu_seconds: dpus * durationSec,
        worker: { type: rand(["G.1X", "G.2X", "G.4X"]), count: dpus },
        records: { read: recordsRead, written: recordsWritten, errors: recordsFailed },
        glue_version: rand(["3.0", "4.0"]),
        crawler_name:
          Math.random() < 0.3
            ? rand(["raw-crawler", "curated-crawler", "analytics-crawler"])
            : null,
        connection_name:
          Math.random() < 0.25 ? rand(["redshift-prod", "jdbc-staging", "s3-data"]) : null,
        continuous_logging: useContinuousLogging,
        metrics: glueMetrics,
      },
    },
    log: { level },
    event: {
      duration: durationSec * 1e9,
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.glue",
      provider: "glue.amazonaws.com",
    },
    message: message,
    ...(isErr
      ? { error: { code: rand(ERROR_CODES), message: rand(ERROR_MSGS), type: "service" } }
      : {}),
  };
}

function generateAthenaLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const queries = [
    "SELECT date_trunc('day', event_time), count(*) FROM events GROUP BY 1",
    "SELECT user_id, sum(revenue) FROM transactions WHERE dt >= '2024-01-01' GROUP BY 1",
    "CREATE TABLE analytics.daily_summary AS SELECT * FROM raw.events",
    "SELECT p.name, count(o.id) FROM products p JOIN orders o ON p.id = o.product_id GROUP BY 1",
  ];
  const dur = Number(randFloat(0.5, isErr ? 300 : 60));
  const dataScanned = isErr ? 0 : randInt(1024, 10737418240);
  const queryId = `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}`.toLowerCase();
  const workgroup = rand(["primary", "analytics", "bi-users"]);
  const database = rand(["analytics", "raw", "staging"]);
  const athenaMsgs = isErr
    ? [
        "Query failed",
        "Query failed",
        `Athena query FAILED after ${dur.toFixed(1)}s: ${rand(["QUERY_TIMED_OUT", "TABLE_NOT_FOUND", "PERMISSION_DENIED"])}`,
      ]
    : [
        "Query started",
        "Query succeeded",
        "Query started",
        "Query succeeded",
        `Athena query SUCCEEDED in ${dur.toFixed(1)}s, scanned ${Math.round(dataScanned / 1048576)}MB`,
      ];
  const plainMessage = rand(athenaMsgs);
  const useStructuredLogging = Math.random() < 0.55;
  const message = useStructuredLogging
    ? JSON.stringify({
        queryId,
        workgroup,
        database,
        state: isErr ? "FAILED" : "SUCCEEDED",
        durationSeconds: dur,
        dataScannedBytes: dataScanned,
        timestamp: new Date(ts).toISOString(),
      })
    : plainMessage;
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "athena" },
    },
    aws: {
      athena: {
        query_id: queryId,
        workgroup,
        database,
        state: isErr ? "FAILED" : "SUCCEEDED",
        duration_seconds: dur,
        data_scanned_bytes: dataScanned,
        data_scanned_mb: Math.round(dataScanned / 1048576),
        engine_version: rand(["Athena engine version 3", "DuckDB 0.9.1"]),
        structured_logging: useStructuredLogging,
        error_code: isErr
          ? rand(["QUERY_TIMED_OUT", "PERMISSION_DENIED", "TABLE_NOT_FOUND"])
          : null,
        metrics: {
          DataScannedInBytes: { sum: dataScanned },
          EngineExecutionTimeInMillis: { avg: Math.round(dur * 1000), max: Math.round(dur * 1500) },
          ProcessedBytes: { sum: dataScanned },
          QueryQueueTimeInMillis: { avg: randInt(10, 500) },
          TotalExecutionTimeInMillis: { avg: Math.round(dur * 1000) },
          QueryPlanningTimeInMillis: { avg: randInt(5, 200) },
        },
      },
    },
    db: { statement: rand(queries), type: "sql" },
    event: {
      duration: dur * 1e9,
      outcome: isErr ? "failure" : "success",
      category: ["database", "process"],
      dataset: "aws.athena",
      provider: "athena.amazonaws.com",
    },
    message: message,
    log: { level: isErr ? "error" : dur > 30 ? "warn" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand(["QUERY_TIMED_OUT", "PERMISSION_DENIED", "TABLE_NOT_FOUND"]),
            message: "Athena query failed",
            type: "db",
          },
        }
      : {}),
  };
}

function generateLakeFormationLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const db = rand(["analytics", "raw_data", "curated", "data_lake"]);
  const table = rand(["events", "users", "transactions", "products", "clickstream"]);
  const action = rand([
    "Grant",
    "Revoke",
    "BatchGrantPermissions",
    "GetDataAccess",
    "CreateLakeFormationTag",
  ]);
  const perms = rand([["SELECT"], ["SELECT", "INSERT"], ["ALL"], ["DESCRIBE"]]);
  const principalArn = `arn:aws:iam::${acct.id}:${rand(["role/analyst-role", "user/alice", "role/glue-role"])}`;
  const resourceArn = `arn:aws:glue:${region}:${acct.id}:table/${db}/${table}`;
  const durationMs = randInt(50, isErr ? 5000 : 1000);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "lakeformation" },
    },
    aws: {
      dimensions: { ResourceArn: resourceArn, Principal: principalArn },
      lakeformation: {
        database: db,
        table: table,
        action,
        principal_arn: principalArn,
        resource_arn: resourceArn,
        permissions: perms,
        lf_tag_key: rand(["team", "environment", "classification", "pii"]),
        lf_tag_values: rand([["prod"], ["dev", "staging"], ["pii"]]),
        error_code: isErr ? rand(["AccessDeniedException", "EntityNotFoundException"]) : null,
        metrics: {
          // AWS Lake Formation CloudWatch metrics
          GrantCount: { sum: isErr ? 0 : randInt(1, 50) },
          DatabaseCount: { avg: randInt(1, 20) },
          TableCount: { avg: randInt(1, 200) },
          DataLakeSettings: { avg: 1 },
        },
      },
    },
    event: {
      action,
      duration: durationMs * 1e6,
      outcome: isErr ? "failure" : "success",
      category: ["database", "iam"],
      dataset: "aws.lakeformation",
      provider: "lakeformation.amazonaws.com",
    },
    message: isErr
      ? `Lake Formation ${action} FAILED on ${db}.${table}: ${rand(["Access denied", "Entity not found"])}`
      : `Lake Formation ${action}: ${perms.join(",")} on ${db}.${table}`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand(["AccessDeniedException", "EntityNotFoundException"]),
            message: "Lake Formation operation failed",
            type: "access",
          },
        }
      : {}),
  };
}

function generateQuickSightLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const dashboard = rand([
    "sales-dashboard",
    "executive-overview",
    "marketing-funnel",
    "ops-metrics",
  ]);
  const user = rand(["alice@corp.com", "bob@corp.com", "carol@corp.com"]);
  const action = rand([
    "DescribeDashboard",
    "GetDashboardEmbedUrl",
    "CreateAnalysis",
    "RefreshDataSet",
    "ListDashboards",
  ]);
  const dur = randInt(200, isErr ? 30000 : 5000);
  const dashboardId = randId(36).toLowerCase();
  const dataSetId = randId(36).toLowerCase();
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "quicksight" },
    },
    aws: {
      dimensions: { DashboardId: dashboardId, DataSetId: dataSetId },
      quicksight: {
        dashboard_id: dashboardId,
        dashboard_name: dashboard,
        dataset_id: dataSetId,
        action,
        user_name: user,
        data_source_type: rand(["AURORA", "ATHENA", "S3", "REDSHIFT", "RDS"]),
        query_duration_ms: dur,
        rows_returned: randInt(0, 100000),
        error_code: isErr
          ? rand(["AccessDeniedException", "ResourceNotFoundException", "ThrottlingException"])
          : null,
        metrics: {
          // AWS QuickSight CloudWatch metrics
          DashboardViewEvents: { sum: randInt(1, 1000) },
          SessionEvent: { sum: randInt(1, 500) },
          // SPICECapacityUsed is a numeric percentage — must be a number, not a string
          SPICECapacityUsed: { avg: Number(randFloat(10, 90)) },
          // Additional real QuickSight CloudWatch metrics
          SPICECapacityScheduled: { avg: Number(randFloat(10, 100)) },
          EmbedCallCount: { sum: randInt(0, 500) },
          ClientError: { sum: isErr ? randInt(1, 50) : 0 },
          RowLevelSecurityEnabled: { avg: Math.random() < 0.4 ? 1 : 0 },
        },
      },
    },
    user: { name: user },
    event: {
      duration: dur * 1e6,
      outcome: isErr ? "failure" : "success",
      category: ["web", "process"],
      dataset: "aws.quicksight",
      provider: "quicksight.amazonaws.com",
    },
    message: isErr
      ? `QuickSight ${action} FAILED: ${dashboard} for ${user}`
      : `QuickSight ${action}: ${dashboard} loaded in ${dur}ms for ${user}`,
    log: { level: isErr ? "error" : dur > 10000 ? "warn" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "AccessDeniedException",
              "ResourceNotFoundException",
              "ThrottlingException",
            ]),
            message: "QuickSight operation failed",
            type: "bi",
          },
        }
      : {}),
  };
}

function generateDataBrewLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const dataset = rand(["customer-data", "sales-csv", "product-catalog", "event-logs"]);
  const recipe = rand(["clean-customer-data", "normalize-dates", "remove-pii", "fix-encoding"]);
  const dur = randInt(30, isErr ? 3600 : 600);
  const rowsProcessed = isErr ? 0 : randInt(1000, 10000000);
  const runState = isErr ? "FAILED" : Math.random() < 0.02 ? "RUNNING" : "SUCCEEDED";
  const transformSteps = randInt(3, 25);
  const databrewMsgs = isErr
    ? [
        "Job run failed",
        `DataBrew job ${recipe} FAILED on ${dataset}: ${rand(["Type mismatch", "Access denied", "Schema error"])}`,
      ]
    : [
        "Job run started",
        "Job run succeeded",
        `DataBrew job ${recipe}: ${rowsProcessed.toLocaleString()} rows in ${dur}s`,
      ];
  const plainMessage = rand(databrewMsgs);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "databrew" },
    },
    aws: {
      dimensions: { JobName: `${recipe}-job`, DatasetName: dataset },
      databrew: {
        project_name: `${dataset}-project`,
        recipe_name: recipe,
        job_name: `${recipe}-job`,
        job_type: rand(["RECIPE", "PROFILE"]),
        dataset_name: dataset,
        job_status: isErr ? "FAILED" : "SUCCEEDED",
        run_state: runState,
        duration_seconds: dur,
        rows_processed: rowsProcessed,
        transform_steps: transformSteps,
        output_location: `s3://databrew-output/${dataset}/`,
        error_message: isErr
          ? rand(["Input dataset not found", "Data type mismatch", "Access denied"])
          : null,
        metrics: {
          RowsProcessed: { sum: rowsProcessed },
          DurationSeconds: { avg: dur },
          TransformSteps: { avg: transformSteps },
          JobSuccessCount: { sum: isErr ? 0 : 1 },
          JobFailureCount: { sum: isErr ? 1 : 0 },
        },
      },
    },
    event: {
      duration: dur * 1e9,
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.databrew",
      provider: "databrew.amazonaws.com",
    },
    message: plainMessage,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? { error: { code: "JobFailed", message: "DataBrew job failed", type: "process" } }
      : {}),
  };
}

function generateAppFlowLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const flow = rand(["salesforce-to-s3", "hubspot-sync", "zendesk-export", "marketo-to-redshift"]);
  const src = rand(["Salesforce", "HubSpot", "Zendesk", "Marketo", "ServiceNow", "Slack"]);
  const dst = rand(["S3", "Redshift", "Snowflake", "Salesforce", "EventBridge"]);
  const records = isErr ? 0 : randInt(100, 1000000);
  const durationMs = randInt(500, isErr ? 30000 : 60000);
  const appflowMsgs = isErr
    ? [
        "Flow run failed",
        `AppFlow ${flow} (${src}->${dst}) FAILED: ${rand(["Credentials expired", "Rate limit", "Schema mismatch"])}`,
      ]
    : [
        "Flow run started",
        "Flow run succeeded",
        `AppFlow ${flow}: ${records.toLocaleString()} records ${src}->${dst}`,
      ];
  const plainMessage = rand(appflowMsgs);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "appflow" },
    },
    aws: {
      dimensions: { FlowName: flow },
      appflow: {
        flow_name: flow,
        flow_arn: `arn:aws:appflow:${region}:${acct.id}:flow/${flow}`,
        source_connector_type: src,
        destination_connector_type: dst,
        trigger_type: rand(["Scheduled", "Event", "OnDemand"]),
        execution_status: isErr ? "ExecutionFailed" : "ExecutionSuccessful",
        records_processed: records,
        duration_ms: durationMs,
        error_message: isErr
          ? rand(["Credentials expired", "Rate limit exceeded", "Schema mismatch"])
          : null,
        metrics: {
          RecordsProcessed: { sum: records },
          DurationMs: { avg: durationMs },
          ExecutionSuccessCount: { sum: isErr ? 0 : 1 },
          ExecutionFailureCount: { sum: isErr ? 1 : 0 },
        },
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.appflow",
      provider: "appflow.amazonaws.com",
      duration: durationMs * 1e6,
    },
    message: plainMessage,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: "ExecutionFailed",
            message: "AppFlow execution failed",
            type: "integration",
          },
        }
      : {}),
  };
}

function generateMwaaLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const envName = rand([
    "prod-airflow",
    "staging-airflow",
    "data-platform",
    "etl-orchestrator",
    "ml-pipelines",
  ]);
  const dagId = rand([
    "etl_daily_load",
    "ml_training_pipeline",
    "data_quality_check",
    "report_generation",
    "s3_to_redshift",
  ]);
  const runId = `scheduled__${new Date(new Date(ts).getTime() - randInt(0, 3600) * 1000).toISOString()}`;
  const taskId = rand(["extract", "transform", "load", "validate", "notify", "cleanup"]);
  const state = isErr
    ? rand(["failed", "upstream_failed"])
    : rand(["success", "running", "queued"]);
  const durationSec = randInt(1, isErr ? 3600 : 600);
  const workerCount = randInt(1, 10);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "mwaa" },
    },
    aws: {
      dimensions: { EnvironmentName: envName },
      mwaa: {
        environment_name: envName,
        dag_id: dagId,
        run_id: runId,
        task_id: taskId,
        run_state: state,
        duration_seconds: durationSec,
        worker_count: workerCount,
        queue_name: rand(["default", "high_priority", "ml_queue"]),
        airflow_version: rand(["2.6.3", "2.7.3", "2.8.1", "2.9.3"]),
      },
    },
    event: {
      action: rand([
        "TaskInstanceStateChanged",
        "DagRunStateChanged",
        "SchedulerHeartbeat",
        "WorkerScaleUp",
        "WorkerScaleDown",
      ]),
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.mwaa",
      provider: "airflow.amazonaws.com",
      duration: durationSec * 1e9,
    },
    message: isErr
      ? `MWAA ${envName}: DAG ${dagId} task ${taskId} ${state}`
      : `MWAA ${envName}: DAG ${dagId} task ${taskId} ${state} (${durationSec}s)`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: "TaskFailed",
            message: `Airflow task ${taskId} failed in DAG ${dagId}`,
            type: "process",
          },
        }
      : {}),
  };
}

function generateCleanRoomsLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const collabId =
    `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`.toLowerCase();
  const collabName = rand([
    "retail-analytics-collab",
    "ad-measurement-collab",
    "fraud-detection-collab",
    "healthcare-insights-collab",
  ]);
  const tableName = rand([
    "customer_transactions",
    "ad_impressions",
    "product_catalog",
    "health_records",
    "loyalty_events",
  ]);
  const queryStatus = isErr ? rand(["FAILED", "CANCELLED"]) : rand(["SUCCESS", "RUNNING"]);
  const rowsReturned = isErr ? 0 : randInt(0, 100000);
  const queryType = rand(["SELECT", "AGGREGATE", "JOIN"]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "cleanrooms" },
    },
    aws: {
      dimensions: { CollaborationId: collabId },
      cleanrooms: {
        collaboration_id: collabId,
        collaboration_name: collabName,
        configured_table_name: tableName,
        protected_query_id: `pq-${randId(16).toLowerCase()}`,
        query_status: queryStatus,
        protected_query_type: queryType,
        rows_returned: rowsReturned,
        member_account_id: randAccount().id,
      },
    },
    event: {
      action: rand([
        "StartProtectedQuery",
        "GetProtectedQuery",
        "BatchGetCollaborationAnalysisTemplate",
        "CreateConfiguredTable",
      ]),
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.cleanrooms",
      provider: "cleanrooms.amazonaws.com",
    },
    message: isErr
      ? `Clean Rooms ${collabName}: query ${queryStatus} on ${tableName}`
      : `Clean Rooms ${collabName}: ${queryType} on ${tableName} returned ${rowsReturned} rows`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand(["AccessDeniedException", "ValidationException", "InternalServerException"]),
            message: "Clean Rooms protected query failed",
            type: "process",
          },
        }
      : {}),
  };
}

function generateDataZoneLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const domainId = `dzd_${randId(12).toLowerCase()}`;
  const domainName = rand([
    "data-mesh-prod",
    "enterprise-catalog",
    "analytics-domain",
    "ml-data-domain",
  ]);
  const projectName = rand([
    "marketing-analytics",
    "customer-360",
    "risk-modeling",
    "supply-chain-analytics",
    "finance-reporting",
  ]);
  const assetName = rand([
    "customer_transactions",
    "product_catalog",
    "ad_spend",
    "inventory_levels",
    "revenue_data",
  ]);
  const assetType = rand([
    "GlueTableViewType",
    "RedshiftTableViewType",
    "AthenaTableViewType",
    "S3ObjectViewType",
  ]);
  const action = rand([
    "CreateAsset",
    "PublishAsset",
    "SubscribeToAsset",
    "ApproveSubscription",
    "RevokeSubscription",
    "CreateGlossaryTerm",
  ]);
  const subStatus = isErr ? "REJECTED" : rand(["APPROVED", "PENDING", "ACTIVE"]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "datazone" },
    },
    aws: {
      dimensions: { DomainId: domainId },
      datazone: {
        domain_id: domainId,
        domain_name: domainName,
        project_name: projectName,
        asset_name: assetName,
        asset_type: assetType,
        subscription_status: subStatus,
        glossary_term: rand(["PII", "Sensitive", "Internal", "Public", "Confidential"]),
        environment_id: `env-${randId(12).toLowerCase()}`,
      },
    },
    event: {
      action,
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.datazone",
      provider: "datazone.amazonaws.com",
    },
    message: isErr
      ? `DataZone ${action} FAILED [${domainName}]: ${rand(["Access denied", "Asset not found", "Subscription rejected"])}`
      : `DataZone ${action}: domain=${domainName}, project=${projectName}, asset=${assetName}`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "AccessDeniedException",
              "ResourceNotFoundException",
              "ValidationException",
            ]),
            message: "DataZone operation failed",
            type: "process",
          },
        }
      : {}),
  };
}

function generateEntityResolutionLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const workflowName = rand([
    "customer-dedup",
    "product-matching",
    "address-resolution",
    "entity-linking",
    "contact-merge",
  ]);
  const workflowId =
    `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`.toLowerCase();
  const jobId = `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`.toLowerCase();
  const jobStatus = isErr
    ? rand(["FAILED", "QUEUED_FOR_DELETION"])
    : rand(["SUCCEEDED", "RUNNING", "QUEUED"]);
  const inputRecords = randInt(1000, 10000000);
  const matchedRecords = isErr
    ? 0
    : randInt(Math.floor(inputRecords * 0.1), Math.floor(inputRecords * 0.9));
  const uniqueRecords = isErr ? 0 : randInt(Math.floor(matchedRecords * 0.5), matchedRecords);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "entityresolution" },
    },
    aws: {
      dimensions: { WorkflowName: workflowName },
      entityresolution: {
        matching_workflow_id: workflowId,
        matching_workflow_name: workflowName,
        job_id: jobId,
        job_status: jobStatus,
        matched_record_count: matchedRecords,
        input_record_count: inputRecords,
        unique_record_count: uniqueRecords,
        schema_name: rand(["customer-schema", "product-schema", "contact-schema"]),
        matching_technique: rand(["RULE_MATCHING", "ML_MATCHING", "PROVIDER_SERVICE"]),
      },
    },
    event: {
      action: rand([
        "CreateMatchingWorkflow",
        "StartMatchingJob",
        "GetMatchingJob",
        "ListMatchingJobs",
      ]),
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.entityresolution",
      provider: "entityresolution.amazonaws.com",
    },
    message: isErr
      ? `Entity Resolution ${workflowName}: job ${jobStatus}`
      : `Entity Resolution ${workflowName}: matched ${matchedRecords}/${inputRecords} records → ${uniqueRecords} unique`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "ResourceNotFoundException",
              "ValidationException",
              "InternalServerException",
            ]),
            message: "Entity resolution job failed",
            type: "process",
          },
        }
      : {}),
  };
}

function generateDataExchangeLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const datasetId =
    `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`.toLowerCase();
  const datasetName = rand([
    "US-Weather-Data",
    "Financial-Market-Feed",
    "Traffic-Analytics",
    "Healthcare-Claims",
    "Retail-POS-Data",
  ]);
  const datasetType = rand(["S3", "REDSHIFT", "API_GATEWAY", "LAKE_FORMATION"]);
  const jobType = rand([
    "IMPORT_ASSETS_FROM_S3",
    "EXPORT_ASSETS_TO_S3",
    "IMPORT_ASSET_FROM_API_GATEWAY",
    "EXPORT_REVISIONS_TO_S3",
  ]);
  const jobStatus = isErr
    ? rand(["ERROR", "CANCELLED"])
    : rand(["COMPLETED", "IN_PROGRESS", "WAITING"]);
  const assetCount = randInt(1, 500);
  const providerAcct = randAccount();
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "dataexchange" },
    },
    aws: {
      dimensions: { DataSetId: datasetId },
      dataexchange: {
        dataset_id: datasetId,
        dataset_name: datasetName,
        data_set_type: datasetType,
        revision_id:
          `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`.toLowerCase(),
        job_id: `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`.toLowerCase(),
        job_type: jobType,
        job_status: jobStatus,
        provider_account_id: providerAcct.id,
        subscriber_account_id: acct.id,
        asset_count: assetCount,
      },
    },
    event: {
      action: rand([
        "CreateJob",
        "StartJob",
        "CancelJob",
        "CreateRevision",
        "PublishDataSet",
        "SubscribeToDataSet",
      ]),
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.dataexchange",
      provider: "dataexchange.amazonaws.com",
    },
    message: isErr
      ? `Data Exchange ${datasetName}: job ${jobStatus}`
      : `Data Exchange ${datasetName}: ${jobType} ${jobStatus}, ${assetCount} assets`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "ResourceNotFoundException",
              "AccessDeniedException",
              "InternalServerException",
            ]),
            message: "Data Exchange job failed",
            type: "process",
          },
        }
      : {}),
  };
}

function generateAppFabricLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const appBundle = rand(["prod-bundle", "saas-audit-bundle", "security-bundle"]);
  const application = rand([
    "Salesforce",
    "Microsoft365",
    "Slack",
    "Zoom",
    "Okta",
    "GitHub",
    "Jira",
    "ServiceNow",
  ]);
  const eventType = rand([
    "userSignIn",
    "userSignOut",
    "fileDownload",
    "settingChanged",
    "userCreated",
    "permissionGranted",
    "dataExport",
    "apiAccess",
  ]);
  const normalizedUser = `user-${randId(8)}@example.com`;
  const sourceIp = randIp();
  const ingestionStatus = isErr ? rand(["FAILED", "PARTIAL"]) : "ACTIVE";
  const ocsfClass = rand([
    "ACCOUNT_CHANGE",
    "AUTHENTICATION",
    "NETWORK_ACTIVITY",
    "FILE_ACTIVITY",
    "API_ACTIVITY",
  ]);
  const action = rand([
    "IngestAuditLog",
    "NormalizeEvent",
    "DeliverToFIREHOSE",
    "DeliverToS3",
    "UpdateIngestion",
  ]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "appfabric" },
    },
    aws: {
      dimensions: { AppBundle: appBundle, Application: application },
      appfabric: {
        app_bundle_arn: `arn:aws:appfabric:${region}:${acct.id}:appbundle/${appBundle}`,
        application,
        event_type: eventType,
        normalized_user: normalizedUser,
        source_ip: sourceIp,
        ingestion_status: ingestionStatus,
        tenant_id: `tenant-${randId(8)}`,
        ocsf_class: ocsfClass,
      },
    },
    event: {
      action,
      outcome: isErr ? "failure" : "success",
      category: ["audit"],
      dataset: "aws.appfabric",
      provider: "appfabric.amazonaws.com",
    },
    message: isErr
      ? `AppFabric ${application}: ingestion ${ingestionStatus} for ${eventType}`
      : `AppFabric ${application}: ${eventType} by ${normalizedUser} normalized as OCSF ${ocsfClass}`,
    log: { level: isErr ? "error" : "info" },
    user: { email: normalizedUser },
    source: { ip: sourceIp },
    ...(isErr
      ? {
          error: {
            code: rand([
              "ResourceNotFoundException",
              "ValidationException",
              "AccessDeniedException",
            ]),
            message: "AppFabric ingestion failed",
            type: "audit",
          },
        }
      : {}),
  };
}

function generateB2biLog(ts: string, er: number) {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const partnerName = rand([
    "Supplier-Corp",
    "RetailChain-Inc",
    "Logistics-Partner",
    "HealthcareProvider-LLC",
  ]);
  const transactionId = `txn-${randId(16)}`;
  const documentType = rand([
    "X12_204",
    "X12_210",
    "X12_214",
    "X12_820",
    "X12_850",
    "X12_856",
    "X12_997",
    "EDIFACT_ORDERS",
  ]);
  const processingStatus = isErr
    ? rand(["FAILED", "SPLIT_FAILED", "PROCESSING_WITH_ERRORS"])
    : rand(["SUCCEEDED", "SUCCEEDED", "DELIVERED"]);
  const transactionCount = randInt(1, 500);
  const action = rand([
    "StartTransformation",
    "CompleteTransformation",
    "DeliverEDI",
    "AcknowledgeFunctional",
    "CreatePartnership",
    "CreateTransformer",
  ]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "b2bi" },
    },
    aws: {
      dimensions: { PartnerName: partnerName, DocumentType: documentType },
      b2bi: {
        partnership_id: `ps-${randId(17)}`,
        partner_name: partnerName,
        transaction_id: transactionId,
        document_type: documentType,
        processing_status: processingStatus,
        transformer_id: `tr-${randId(17)}`,
        input_file_size_bytes: randInt(1024, 524288),
        transaction_count: transactionCount,
        interchange_control_number: randInt(100000000, 999999999),
      },
    },
    event: {
      action,
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.b2bi",
      provider: "b2bi.amazonaws.com",
    },
    message: isErr
      ? `B2B Data Interchange ${documentType} from ${partnerName}: ${processingStatus}`
      : `B2B Data Interchange ${documentType} from ${partnerName}: ${processingStatus} (${transactionCount} transactions)`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "ResourceNotFoundException",
              "ValidationException",
              "InternalServerException",
            ]),
            message: "B2B Data Interchange transformation failed",
            type: "process",
          },
        }
      : {}),
  };
}

export {
  generateEmrLog,
  generateGlueLog,
  generateAthenaLog,
  generateLakeFormationLog,
  generateQuickSightLog,
  generateDataBrewLog,
  generateAppFlowLog,
  generateMwaaLog,
  generateCleanRoomsLog,
  generateDataZoneLog,
  generateEntityResolutionLog,
  generateDataExchangeLog,
  generateAppFabricLog,
  generateB2biLog,
};
