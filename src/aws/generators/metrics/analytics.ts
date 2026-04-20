/**
 * Dimensional metric generators for AWS analytics, ML, and AI services:
 * Glue, EMR, Athena, SageMaker, Bedrock, BedrockAgent, LakeFormation, MWAA,
 * QuickSight, DataBrew, AppFlow, Rekognition, Transcribe, Translate,
 * Comprehend, Polly, Forecast, Personalize, Lex, LookoutMetrics, Textract.
 */

import {
  REGIONS,
  ACCOUNTS,
  rand,
  randInt,
  dp,
  stat,
  counter,
  metricDoc,
  pickCloudContext,
  jitter,
  sample,
} from "./helpers.js";

// ─── Glue ─────────────────────────────────────────────────────────────────────

const GLUE_JOBS = [
  "s3-to-redshift-etl",
  "raw-data-transformer",
  "data-quality-checker",
  "daily-aggregation",
  "catalog-crawler",
  "parquet-converter",
  "ml-feature-prep",
];

export function generateGlueMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(GLUE_JOBS, randInt(1, 3)).flatMap((job) => {
    const runId = `jr_${Math.random().toString(36).substring(2)}`;
    const jobType = rand(["ETL", "PYTHON_SHELL"]);
    const isEtl = jobType === "ETL";
    const executorCount = isEtl ? randInt(2, 50) : 1;
    const heapUsedPct = jitter(50, 30, 10, 95);
    const diskUsedPct = jitter(30, 20, 5, 80);
    const bytesRead = randInt(100_000_000, 100_000_000_000);
    const bytesWritten = randInt(50_000_000, 50_000_000_000);
    const completedTasks = randInt(10, 5000);
    const failedTasks = Math.random() < er ? randInt(1, 50) : 0;
    const completedStages = randInt(1, 20);

    const docs = [
      metricDoc(
        ts,
        "glue",
        "aws.glue",
        region,
        account,
        { JobName: job, JobRunId: runId, Type: jobType },
        {
          // Executor counts
          "glue.ALL.executors.numberAllExecutors": stat(executorCount),
          "glue.ALL.executors.numberMaxNeededExecutors": stat(
            randInt(executorCount, executorCount * 2)
          ),
          "glue.driver.ExecutorAllocationManager.executors.numberAllExecutors": stat(executorCount),
          "glue.driver.ExecutorAllocationManager.executors.numberMaxNeededExecutors": stat(
            randInt(executorCount, executorCount * 2)
          ),

          // Driver memory (heap)
          "glue.driver.jvm.heap.usage": stat(dp(heapUsedPct / 100)),
          "glue.driver.jvm.heap.used": stat(dp(randInt(512, 8192) * 1_000_000)),
          "glue.driver.jvm.heap.max": stat(dp(randInt(8192, 16384) * 1_000_000)),
          "glue.driver.jvm.non-heap.used": stat(dp(randInt(64, 512) * 1_000_000)),

          // Driver disk
          "glue.driver.disk.available_GB": stat(dp(jitter(200, 100, 10, 800))),
          "glue.driver.disk.used_GB": stat(dp(jitter(50, 40, 1, 400))),
          "glue.driver.disk.used.percentage": stat(dp(diskUsedPct)),
          "glue.driver.BlockManager.disk.diskSpaceUsed_MB": stat(dp(randInt(0, 4096))),

          // Driver aggregate (Spark task counters)
          "glue.driver.aggregate.bytesRead": stat(dp(bytesRead)),
          "glue.driver.aggregate.bytesWritten": stat(dp(bytesWritten)),
          "glue.driver.aggregate.recordsRead": stat(dp(randInt(100_000, 1_000_000_000))),
          "glue.driver.aggregate.recordsWritten": stat(dp(randInt(100_000, 900_000_000))),
          "glue.driver.aggregate.numFiles": stat(randInt(1, 10_000)),
          "glue.driver.aggregate.elapsedTime": stat(
            dp(jitter(300_000, 250_000, 10_000, 3_600_000))
          ),
          "glue.driver.aggregate.numCompletedStages": stat(completedStages),
          "glue.driver.aggregate.numCompletedTasks": stat(completedTasks),
          "glue.driver.aggregate.numFailedTasks": stat(failedTasks),
          "glue.driver.aggregate.numKilledTasks": stat(Math.random() < er ? randInt(0, 5) : 0),
          "glue.driver.aggregate.shuffleBytesWritten": stat(dp(randInt(0, bytesRead * 0.8))),
          "glue.driver.aggregate.shuffleLocalBytesRead": stat(dp(randInt(0, bytesRead * 0.7))),

          // Driver S3 I/O
          "glue.driver.s3.filesystem.read_bytes": stat(dp(randInt(0, bytesRead))),
          "glue.driver.s3.filesystem.write_bytes": stat(dp(randInt(0, bytesWritten))),

          // Driver system
          "glue.driver.system.cpuSystemLoad": stat(dp(jitter(0.3, 0.2, 0.01, 0.95))),

          // Observability: skewness (job performance)
          "glue.driver.skewness.stage": stat(dp(jitter(0.5, 0.4, 0, 5))),
          "glue.driver.skewness.job": stat(dp(jitter(0.4, 0.3, 0, 4))),

          // Worker utilization
          "glue.driver.workerUtilization": stat(dp(jitter(0.6, 0.25, 0.1, 1))),
        }
      ),
    ];

    // ALL executors aggregate metrics (separate dimension)
    if (isEtl) {
      docs.push(
        metricDoc(
          ts,
          "glue",
          "aws.glue",
          region,
          account,
          { JobName: job, JobRunId: runId, Type: jobType, Component: "ALL" },
          {
            "glue.ALL.jvm.heap.usage": stat(dp(jitter(50, 25, 10, 90) / 100)),
            "glue.ALL.jvm.heap.used": stat(dp(executorCount * randInt(512, 4096) * 1_000_000)),
            "glue.ALL.jvm.non-heap.used": stat(dp(executorCount * randInt(64, 256) * 1_000_000)),
            "glue.ALL.s3.filesystem.read_bytes": stat(dp(randInt(0, bytesRead))),
            "glue.ALL.s3.filesystem.write_bytes": stat(dp(randInt(0, bytesWritten))),
            "glue.ALL.system.cpuSystemLoad": stat(dp(jitter(0.4, 0.25, 0.05, 0.95))),
            "glue.ALL.disk.available_GB": stat(dp(executorCount * jitter(100, 60, 10, 400))),
            "glue.ALL.disk.used_GB": stat(dp(executorCount * jitter(30, 20, 1, 200))),
            "glue.ALL.disk.used.percentage": stat(dp(jitter(30, 20, 5, 80))),
          }
        )
      );
    }

    return docs;
  });
}

// ─── EMR ──────────────────────────────────────────────────────────────────────

const EMR_CLUSTERS = [
  { id: "j-ABCDEF123456", name: "spark-etl-prod", apps: ["Spark", "Hadoop"] },
  { id: "j-BCDEF1234567", name: "hive-analytics", apps: ["Hive", "Pig"] },
  { id: "j-CDEF12345678", name: "presto-cluster", apps: ["Presto"] },
  { id: "j-DEF123456789", name: "flink-streaming", apps: ["Flink"] },
];

export function generateEmrMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const cluster = rand(EMR_CLUSTERS);
  const coreNodes = randInt(2, 50);
  const taskNodes = randInt(0, 30);
  const totalNodes = coreNodes + taskNodes;
  const isSpark = cluster.apps.includes("Spark");
  const executorCount = isSpark ? randInt(totalNodes, totalNodes * 4) : 0;

  const docs = [
    metricDoc(
      ts,
      "emr",
      "aws.emr_metrics",
      region,
      account,
      { JobFlowId: cluster.id, JobFlowName: cluster.name },
      {
        CoreNodesRunning: stat(coreNodes),
        CoreNodesPending: stat(Math.random() < er ? randInt(1, 5) : 0),
        TaskNodesRunning: stat(taskNodes),
        TaskNodesPending: stat(Math.random() < er ? randInt(1, 5) : 0),
        HDFSUtilization: stat(
          dp(Math.random() < er ? jitter(85, 10, 60, 99) : jitter(40, 25, 5, 80))
        ),
        HDFSBytesRead: stat(dp(randInt(1_000_000, 100_000_000_000))),
        HDFSBytesWritten: stat(dp(randInt(1_000_000, 50_000_000_000))),
        ContainerAllocated: stat(randInt(totalNodes, totalNodes * 8)),
        ContainerReserved: stat(randInt(0, 50)),
        ContainerPending: stat(Math.random() < er ? randInt(1, 100) : 0),
        MRActiveNodes: stat(totalNodes),
        YARNMemoryAvailablePercentage: stat(
          dp(Math.random() < er ? jitter(10, 8, 0, 30) : jitter(60, 25, 10, 95))
        ),
        IsIdle: stat(Math.random() < 0.05 ? 1 : 0),
        S3BytesRead: stat(dp(randInt(0, 100_000_000_000))),
        S3BytesWritten: stat(dp(randInt(0, 50_000_000_000))),
        TotalLoad: stat(dp(jitter(totalNodes * 2, totalNodes, 0, totalNodes * 10))),
        MemoryTotalMB: stat(totalNodes * randInt(8192, 65536)),
        MemoryAllocatedMB: stat(
          dp(jitter(totalNodes * 16384, totalNodes * 8192, 0, totalNodes * 65536))
        ),
        MemoryAvailableMB: stat(
          dp(jitter(totalNodes * 8192, totalNodes * 4096, 0, totalNodes * 32768))
        ),
        MemoryReservedMB: stat(
          dp(jitter(totalNodes * 2048, totalNodes * 1024, 0, totalNodes * 8192))
        ),
        AppsRunning: stat(randInt(0, 5)),
        AppsPending: stat(Math.random() < er ? randInt(1, 10) : 0),
        AppsCompleted: stat(randInt(0, 100)),
        AppsFailed: stat(Math.random() < er ? randInt(1, 10) : 0),
        AppsKilled: stat(Math.random() < er ? randInt(0, 5) : 0),
      }
    ),
  ];

  // Spark-specific metrics (when Spark is the application)
  if (isSpark) {
    const appId = `application_${Date.now()}_${randInt(1000, 9999)}`;
    const completedStages = randInt(0, 50);
    const failedStages = Math.random() < er ? randInt(1, 5) : 0;
    const activeStages = randInt(0, 5);
    const completedTasks = randInt(10, 10000);
    const failedTasks = Math.random() < er ? randInt(1, 100) : 0;
    const activeTasks = randInt(0, executorCount * 2);
    const heapUsed = randInt(512, 8192);
    const heapMax = randInt(heapUsed, heapUsed * 2);
    const shuffleRead = randInt(0, 100_000_000_000);
    const shuffleWrite = randInt(0, 50_000_000_000);

    // Driver metrics
    docs.push(
      metricDoc(
        ts,
        "emr",
        "aws.emr_metrics",
        region,
        account,
        { JobFlowId: cluster.id, ApplicationId: appId, Component: "driver" },
        {
          "spark.driver.jvm.heap.used": stat(dp(heapUsed * 1_000_000)),
          "spark.driver.jvm.heap.max": stat(dp(heapMax * 1_000_000)),
          "spark.driver.jvm.heap.usage": stat(dp((heapUsed / heapMax) * 100)),
          "spark.driver.jvm.non-heap.used": stat(dp(randInt(64, 512) * 1_000_000)),
          "spark.driver.BlockManager.memory.memUsed_MB": stat(dp(randInt(100, 4096))),
          "spark.driver.BlockManager.memory.maxMem_MB": stat(dp(randInt(4096, 16384))),
          "spark.driver.BlockManager.memory.remainingMem_MB": stat(dp(randInt(512, 8192))),
          "spark.driver.BlockManager.disk.diskSpaceUsed_MB": stat(dp(randInt(0, 2048))),
          "spark.driver.DAGScheduler.stage.completedStages": stat(completedStages),
          "spark.driver.DAGScheduler.stage.failedStages": stat(failedStages),
          "spark.driver.DAGScheduler.stage.runningStages": stat(activeStages),
          "spark.driver.DAGScheduler.stage.waitingStages": stat(randInt(0, 10)),
          "spark.driver.LiveListenerBus.numEventsPosted": stat(randInt(100, 100000)),
          "spark.driver.LiveListenerBus.queue.executorManagement.numDroppedEvents": stat(
            Math.random() < er ? randInt(1, 100) : 0
          ),
          "spark.driver.jvm.total.used": stat(dp((heapUsed + randInt(64, 512)) * 1_000_000)),
        }
      )
    );

    // Executor aggregate metrics
    docs.push(
      metricDoc(
        ts,
        "emr",
        "aws.emr_metrics",
        region,
        account,
        { JobFlowId: cluster.id, ApplicationId: appId, Component: "executors" },
        {
          "spark.executor.activeTasks": stat(activeTasks),
          "spark.executor.completedTasks": stat(completedTasks),
          "spark.executor.failedTasks": stat(failedTasks),
          "spark.executor.totalInputBytes": stat(dp(randInt(0, 500_000_000_000))),
          "spark.executor.totalShuffleRead": stat(dp(shuffleRead)),
          "spark.executor.totalShuffleWrite": stat(dp(shuffleWrite)),
          "spark.executor.totalGCTime": stat(dp(randInt(1000, 300000))),
          "spark.executor.maxMemory": stat(dp(executorCount * randInt(4096, 16384) * 1_000_000)),
          "spark.executor.memoryUsed": stat(dp(executorCount * randInt(1024, 8192) * 1_000_000)),
          "spark.executor.diskUsed": stat(dp(executorCount * randInt(0, 2048) * 1_000_000)),
          "spark.executor.jvm.heap.usage": stat(
            dp(Math.random() < er ? jitter(85, 10, 60, 99) : jitter(50, 25, 10, 80))
          ),
          "spark.executor.cpuTime": stat(dp(randInt(10000, 10_000_000))),
          "spark.executor.runTime": stat(dp(randInt(10000, 10_000_000))),
          "spark.executors.count": stat(executorCount),
          "spark.executors.active": stat(randInt(0, executorCount)),
          "spark.executors.dead": stat(Math.random() < er ? randInt(1, 5) : 0),
        }
      )
    );

    // Streaming metrics (if applicable — ~20% of Spark clusters)
    if (Math.random() < 0.2) {
      docs.push(
        metricDoc(
          ts,
          "emr",
          "aws.emr_metrics",
          region,
          account,
          { JobFlowId: cluster.id, ApplicationId: appId, Component: "streaming" },
          {
            "spark.streaming.totalCompletedBatches": stat(randInt(0, 10000)),
            "spark.streaming.totalProcessedRecords": stat(randInt(0, 100_000_000)),
            "spark.streaming.totalReceivedRecords": stat(randInt(0, 100_000_000)),
            "spark.streaming.lastCompletedBatch_processingDelay": stat(
              dp(jitter(500, 400, 10, 30000))
            ),
            "spark.streaming.lastCompletedBatch_schedulingDelay": stat(dp(jitter(50, 40, 0, 5000))),
            "spark.streaming.lastCompletedBatch_totalDelay": stat(dp(jitter(550, 450, 10, 35000))),
            "spark.streaming.unprocessedBatches": stat(Math.random() < er ? randInt(1, 50) : 0),
            "spark.streaming.waitingBatches": stat(randInt(0, 5)),
            "spark.streaming.runningBatches": stat(randInt(0, 2)),
          }
        )
      );
    }
  }

  return docs;
}

// ─── Athena ───────────────────────────────────────────────────────────────────

const ATHENA_WORKGROUPS = ["primary", "analytics", "reporting", "data-science", "etl"];

export function generateAthenaMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(ATHENA_WORKGROUPS, randInt(1, 3)).map((wg) => {
    const totalQueries = randInt(0, 5_000);
    const failedQueries =
      Math.random() < er ? randInt(0, Math.floor(totalQueries * 0.1)) : randInt(0, 5);
    const canceledQueries = Math.random() < er * 0.3 ? randInt(0, 50) : 0;
    const successQueries = Math.max(0, totalQueries - failedQueries - canceledQueries);
    const dataScanned = randInt(0, 10_000_000_000_000);
    const engineExecTime = jitter(8_000, 6_000, 50, 3_600_000);
    const planningTime = jitter(500, 400, 50, 30_000);
    const queueTime = jitter(200, 150, 10, 10_000);
    const servicePreprocessing = jitter(100, 80, 10, 5_000);
    const serviceProcessing = jitter(50, 40, 5, 2_000);
    const totalExecTime =
      engineExecTime + planningTime + queueTime + servicePreprocessing + serviceProcessing;

    return metricDoc(
      ts,
      "athena",
      "aws.athena",
      region,
      account,
      { WorkGroup: wg },
      {
        TotalExecutionTime: stat(dp(totalExecTime), {
          max: dp(totalExecTime * 2),
          min: dp(totalExecTime * 0.1),
        }),
        QueryPlanningTime: stat(dp(planningTime), { max: dp(planningTime * 3) }),
        QueryQueueTime: stat(dp(queueTime), { max: dp(queueTime * 5) }),
        ServicePreProcessingTime: stat(dp(servicePreprocessing)),
        ServiceProcessingTime: stat(dp(serviceProcessing)),
        EngineExecutionTime: stat(dp(engineExecTime), {
          max: dp(engineExecTime * 2),
          min: dp(engineExecTime * 0.05),
        }),
        DataScannedInBytes: stat(dp(dataScanned)),
        ProcessedBytes: stat(dp(dataScanned)),
        ExecutionRequestsCount: counter(totalQueries),
        CanceledExecutionRequestsCount: counter(canceledQueries),
        FailedExecutionRequestsCount: counter(failedQueries),
        SuccessfulExecutionRequestsCount: counter(successQueries),
        ResultReuseCount: counter(
          Math.random() < 0.1 ? randInt(0, Math.floor(totalQueries * 0.05)) : 0
        ),
        DataManifestFilesScanned: counter(randInt(0, 1000)),
      }
    );
  });
}

// ─── SageMaker ────────────────────────────────────────────────────────────────

const SAGEMAKER_ENDPOINTS = [
  { name: "fraud-detection-prod", model: "xgboost-fraud-v3", instance: "ml.m5.xlarge" },
  { name: "sentiment-analysis", model: "bert-sentiment-v2", instance: "ml.g4dn.xlarge" },
  { name: "product-recommend", model: "factorization-prod-v1", instance: "ml.c5.2xlarge" },
  { name: "image-classifier", model: "resnet50-custom-v5", instance: "ml.g4dn.2xlarge" },
  { name: "forecasting-prod", model: "deepar-forecast-v4", instance: "ml.m5.2xlarge" },
];

export function generateSagemakerMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const docs: ReturnType<typeof metricDoc>[] = [];

  // Endpoint invocation metrics
  for (const ep of sample(SAGEMAKER_ENDPOINTS, randInt(1, 3))) {
    const invocations = randInt(0, 100_000);
    const instanceCount = randInt(1, 5);
    const modelErr = Math.round(
      invocations *
        (Math.random() < er ? jitter(0.05, 0.04, 0.001, 0.3) : jitter(0.001, 0.0008, 0, 0.005))
    );
    const hasGpu =
      ep.instance.includes("g4dn") || ep.instance.includes("g5") || ep.instance.includes("p3");
    docs.push(
      metricDoc(
        ts,
        "sagemaker",
        "aws.sagemaker",
        region,
        account,
        { EndpointName: ep.name, VariantName: "AllTraffic" },
        {
          Invocations: counter(invocations),
          InvocationsPerInstance: counter(Math.round(invocations / instanceCount)),
          ModelLatency: stat(dp(jitter(50_000, 40_000, 5_000, 5_000_000)), {
            max: dp(jitter(500_000, 400_000, 50_000, 10_000_000)),
          }),
          OverheadLatency: stat(dp(jitter(5_000, 4_000, 500, 100_000))),
          Invocation4XXErrors: counter(randInt(0, 100)),
          Invocation5XXErrors: counter(modelErr),
          InvocationModelErrors: counter(modelErr),
          ModelSetupTime: stat(dp(jitter(2000, 1500, 100, 10000))),
          CPUUtilization: stat(
            dp(Math.random() < er ? jitter(85, 10, 60, 100) : jitter(40, 25, 5, 80))
          ),
          MemoryUtilization: stat(dp(jitter(55, 25, 10, 95))),
          ...(hasGpu
            ? {
                GPUUtilization: stat(dp(jitter(70, 20, 10, 100))),
                GPUMemoryUtilization: stat(dp(jitter(60, 25, 10, 95))),
              }
            : {}),
          DiskUtilization: stat(dp(jitter(20, 15, 1, 80))),
        }
      )
    );
  }

  // Training job metrics (separate dimension set)
  if (Math.random() < 0.5) {
    const trainingJobName = `${rand(["xgboost", "bert", "resnet", "lstm"])}-training-${Math.random().toString(36).substring(2, 8)}`;
    const epoch = randInt(1, 100);
    docs.push(
      metricDoc(
        ts,
        "sagemaker",
        "aws.sagemaker",
        region,
        account,
        { TrainingJobName: trainingJobName, Host: "algo-1" },
        {
          "train:loss": stat(dp(jitter(0.3, 0.25, 0.01, 2))),
          "train:accuracy": stat(dp(jitter(0.85, 0.1, 0.5, 0.99))),
          "validation:loss": stat(dp(jitter(0.35, 0.25, 0.02, 2.5))),
          "validation:accuracy": stat(dp(jitter(0.83, 0.1, 0.45, 0.99))),
          "train:epoch": stat(epoch),
          CPUUtilization: stat(dp(jitter(50, 30, 5, 100))),
          MemoryUtilization: stat(dp(jitter(60, 25, 10, 95))),
          GPUUtilization: stat(dp(jitter(75, 20, 10, 100))),
          GPUMemoryUtilization: stat(dp(jitter(65, 25, 10, 95))),
          DiskUtilization: stat(dp(jitter(25, 20, 1, 90))),
        }
      )
    );
  }

  return docs;
}

// ─── Bedrock ──────────────────────────────────────────────────────────────────

const BEDROCK_MODELS = [
  "anthropic.claude-3-5-sonnet-20241022-v2:0",
  "anthropic.claude-3-haiku-20240307-v1:0",
  "amazon.titan-embed-text-v2:0",
  "meta.llama3-2-90b-instruct-v1:0",
  "amazon.nova-pro-v1:0",
];

export function generateBedrockMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(BEDROCK_MODELS, randInt(1, 3)).map((modelId) => {
    const invocations = randInt(0, 10_000);
    const inputTokens = Math.round(invocations * jitter(500, 400, 50, 10_000));
    const outputTokens = Math.round(invocations * jitter(200, 150, 20, 4_000));
    const latAvg = dp(jitter(1500, 1200, 100, 30_000));
    const latMax = dp(jitter(15_000, 10_000, 2_000, 120_000));
    const inPrice = dp(jitter(0.000003, 0.000002, 5e-7, 0.00002), 8);
    const outPrice = dp(jitter(0.000015, 0.00001, 1e-6, 0.00008), 8);
    const modelDlAvg = dp(jitter(800, 600, 0, 45_000));
    const modelDlMax = dp(jitter(12_000, 10_000, 100, 180_000));
    const isImageCapable = /nova|titan-image|stability|anthropic\.claude-3-5|llama/i.test(modelId);
    const inputImages = isImageCapable && Math.random() < 0.25 ? randInt(0, 3) : 0;
    const outputImages =
      isImageCapable && modelId.includes("nova") && Math.random() < 0.15 ? randInt(0, 2) : 0;
    return metricDoc(
      ts,
      "bedrock",
      "aws.bedrock",
      region,
      account,
      { ModelId: modelId },
      {
        Invocations: counter(invocations),
        InvocationLatency: stat(latAvg, {
          max: latMax,
        }),
        InvocationClientErrors: counter(randInt(0, 50)),
        InvocationServerErrors: counter(Math.random() < er ? randInt(1, 100) : 0),
        InvocationThrottles: counter(Math.random() < er * 0.3 ? randInt(1, 500) : 0),
        InputTokenCount: counter(inputTokens),
        OutputTokenCount: counter(outputTokens),
        InputTokenPrice: stat(inPrice, { max: dp(inPrice * 3, 8) }),
        OutputTokenPrice: stat(outPrice, { max: dp(outPrice * 3, 8) }),
        ModelDownloadingTime: stat(modelDlAvg, { max: modelDlMax }),
        InputImageCount: counter(inputImages),
        OutputImageCount: counter(outputImages),
        LegacyModelInvocations: counter(0),
      }
    );
  });
}

// ─── BedrockAgent ─────────────────────────────────────────────────────────────

const BEDROCK_AGENTS = [
  "customer-support-agent",
  "research-assistant",
  "code-reviewer",
  "data-analyst",
];

export function generateBedrockagentMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(BEDROCK_AGENTS, randInt(1, 2)).map((agentName) => {
    const sessions = randInt(0, 1_000);
    const invLat = dp(jitter(1200, 900, 80, 55_000));
    const invLatMax = dp(jitter(25_000, 20_000, 500, 150_000));
    const retLat = dp(jitter(350, 280, 15, 12_000));
    const retLatMax = dp(jitter(8_000, 6_000, 100, 45_000));
    const throttled = Math.random() < er * 0.2 ? randInt(1, 50) : 0;
    const svcErr = Math.random() < er ? randInt(0, 35) : 0;
    const stepDur = dp(jitter(520, 400, 30, 28_000));
    const stepDurMax = dp(jitter(10_000, 8_000, 200, 90_000));
    return metricDoc(
      ts,
      "bedrockagent",
      "aws.bedrockagent",
      region,
      account,
      {
        AgentId: `AGT${Math.random().toString(36).substring(2, 12).toUpperCase()}`,
        AgentName: agentName,
      },
      {
        NumberOfInvocations: counter(sessions),
        NumberOfSessions: counter(sessions),
        SessionDuration: stat(dp(jitter(45, 35, 2, 1800))),
        ClientErrors: counter(randInt(0, 20)),
        Throttles: counter(throttled),
        KnowledgeBaseRetrievals: counter(Math.round(sessions * jitter(2, 1.5, 0, 10))),
        ActionGroupInvocations: counter(Math.round(sessions * jitter(3, 2, 0, 15))),
        InvocationLatency: stat(invLat, { max: invLatMax }),
        RetrievalLatency: stat(retLat, { max: retLatMax }),
        Invocations: counter(sessions),
        ThrottledInvocations: counter(throttled),
        ServiceErrors: counter(svcErr),
        StepDuration: stat(stepDur, { max: stepDurMax }),
        ActionsPerInvocation: stat(dp(jitter(4.2, 3, 0, 28))),
        RetrievedDocuments: counter(Math.round(sessions * jitter(6, 5, 0, 45))),
      }
    );
  });
}

// ─── Rekognition ──────────────────────────────────────────────────────────────

export function generateRekognitionMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const ops = [
    "DetectLabels",
    "DetectFaces",
    "DetectText",
    "CompareFaces",
    "RecognizeCelebrities",
    "DetectModerationLabels",
  ];
  return sample(ops, randInt(2, 4)).map((op) => {
    const calls = randInt(0, 10_000);
    const throttled = Math.random() < er ? randInt(0, 200) : 0;
    const serverErr = Math.random() < er ? randInt(0, 50) : 0;
    const userErr = Math.random() < er * 0.5 ? randInt(0, 80) : 0;
    const successful = Math.max(0, calls - throttled - serverErr - userErr);
    const respAvg = dp(jitter(180, 140, 25, 4_000));
    const respMax = dp(jitter(2_500, 2_000, 200, 25_000));
    const faces =
      op === "DetectFaces" || op === "CompareFaces"
        ? stat(dp(jitter(2.5, 2, 0, 45)), { max: dp(60) })
        : stat(0);
    const labels =
      op === "DetectLabels" || op === "RecognizeCelebrities" || op === "DetectModerationLabels"
        ? stat(dp(jitter(12, 8, 0, 120)), { max: dp(200) })
        : stat(0);
    const text = op === "DetectText" ? stat(dp(jitter(24, 18, 0, 200)), { max: dp(400) }) : stat(0);
    return metricDoc(
      ts,
      "rekognition",
      "aws.rekognition",
      region,
      account,
      { Operation: op },
      {
        SuccessfulRequestCount: counter(successful),
        ThrottledCount: counter(throttled),
        ServerErrorCount: counter(serverErr),
        UserErrorCount: counter(userErr),
        ResponseTime: stat(respAvg, { max: respMax }),
        DetectedFaces: faces,
        DetectedLabels: labels,
        DetectedText: text,
      }
    );
  });
}

// ─── Transcribe ───────────────────────────────────────────────────────────────

export function generateTranscribeMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const total = randInt(0, 5_000);
  const throttled = Math.random() < er ? randInt(1, 100) : 0;
  const failed = Math.random() < er ? randInt(1, 50) : 0;
  const successful = Math.max(0, total - throttled - failed);
  const successRate = total > 0 ? dp((successful / total) * 100) : 100;
  return [
    metricDoc(
      ts,
      "transcribe",
      "aws.transcribe",
      region,
      account,
      { Region: region },
      {
        TotalRequestCount: counter(total),
        SuccessfulRequestCount: counter(successful),
        ThrottledCount: counter(throttled),
        AudioDurationTime: stat(dp(randInt(60, 7_200)), {
          max: dp(randInt(120, 14_400)),
        }),
        TranscriptionSuccessRate: stat(successRate, { max: 100, min: 0 }),
        ContentRedactedWords: counter(randInt(0, Math.max(1, successful * 50))),
        ProcessingTime: stat(dp(jitter(30_000, 25_000, 1_000, 3_600_000))),
        ErrorCount: counter(failed),
      }
    ),
  ];
}

// ─── Translate ────────────────────────────────────────────────────────────────

export function generateTranslateMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const src = rand(["en", "es", "fr", "de", "zh"]);
  const respMs = dp(jitter(220, 170, 12, 5_500));
  return [
    metricDoc(
      ts,
      "translate",
      "aws.translate",
      region,
      account,
      {
        Operation: "TranslateText",
        SourceLanguageCode: src,
        TargetLanguageCode: rand(["fr", "de", "ja", "pt", "ar"]),
      },
      {
        CharacterCount: counter(randInt(0, 5_000_000)),
        SuccessfulRequestCount: counter(randInt(0, 10_000)),
        ThrottledCount: counter(Math.random() < er ? randInt(1, 100) : 0),
        UserErrorCount: counter(Math.random() < er * 0.6 ? randInt(0, 40) : 0),
        SystemErrorCount: counter(Math.random() < er ? randInt(0, 20) : 0),
        ResponseTime: stat(respMs, { max: dp(respMs * 4), min: dp(respMs * 0.05) }),
        SourceLanguagesDetected: counter(randInt(0, 4)),
      }
    ),
  ];
}

// ─── Polly ────────────────────────────────────────────────────────────────────

export function generatePollyMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "polly",
      "aws.polly",
      region,
      account,
      { Operation: rand(["SynthesizeSpeech", "StartSpeechSynthesisTask"]) },
      {
        RequestCharacters: counter(randInt(0, 1_000_000)),
        ResponseLatency: stat(dp(jitter(300, 250, 50, 10_000))),
        RequestErrors: counter(Math.random() < er ? randInt(1, 50) : 0),
        ThrottledRequests: counter(Math.random() < er ? randInt(1, 100) : 0),
      }
    ),
  ];
}

// ─── Comprehend ───────────────────────────────────────────────────────────────

export function generateComprehendMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const ops = [
    "DetectSentiment",
    "DetectEntities",
    "DetectKeyPhrases",
    "DetectLanguage",
    "ClassifyDocument",
  ];
  return sample(ops, randInt(2, 3)).map((op) => {
    const resp = dp(jitter(55, 42, 8, 2_200));
    const sentimentScore =
      op === "DetectSentiment" ? stat(dp(jitter(0.78, 0.18, 0, 1)), { max: 1, min: 0 }) : stat(0);
    const entities =
      op === "DetectEntities" ? stat(dp(jitter(8, 5, 0, 60)), { max: dp(120) }) : stat(0);
    const keyPhrases =
      op === "DetectKeyPhrases" ? stat(dp(jitter(6, 4, 0, 40)), { max: dp(80) }) : stat(0);
    return metricDoc(
      ts,
      "comprehend",
      "aws.comprehend",
      region,
      account,
      { Operation: op },
      {
        ResponseTime: stat(resp, { max: dp(resp * 5), min: dp(resp * 0.05) }),
        SuccessfulRequestCount: counter(randInt(0, 10_000)),
        ThrottledCount: counter(Math.random() < er ? randInt(1, 100) : 0),
        ServerErrorCount: counter(Math.random() < er ? randInt(0, 25) : 0),
        NumberOfInputUnits: counter(randInt(0, 1_000_000)),
        SentimentScore: sentimentScore,
        EntitiesDetected: entities,
        KeyPhrasesDetected: keyPhrases,
      }
    );
  });
}

// ─── Lex ──────────────────────────────────────────────────────────────────────

export function generateLexMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const bots = ["BookHotelBot", "OrderPizzaBot", "SupportBot", "ScheduleMeetingBot"];
  return sample(bots, randInt(1, 2)).map((bot) => {
    const reqs = randInt(0, 50_000);
    const missed = Math.round(
      reqs * (Math.random() < er ? jitter(0.2, 0.15, 0.05, 0.6) : jitter(0.05, 0.04, 0, 0.2))
    );
    const throttled = Math.random() < er ? randInt(1, 200) : 0;
    const sysErr = Math.random() < er ? randInt(1, 50) : 0;
    const successful = Math.max(0, reqs - throttled - sysErr);
    const convDurSec = dp(jitter(45, 35, 2, 1_800));
    const convDurMax = dp(jitter(600, 400, 30, 7_200));
    const intentConf = dp(jitter(0.86, 0.12, 0.35, 1), 3);
    const sentimentScore = dp(jitter(0.72, 0.2, 0, 1), 3);
    return metricDoc(
      ts,
      "lex",
      "aws.lex",
      region,
      account,
      { BotName: bot, BotVersion: "$LATEST", Operation: "PostContent" },
      {
        RuntimeRequestCount: counter(reqs),
        RuntimeSuccessfulRequestCount: counter(successful),
        RuntimeSuccessfulRequestLatency: stat(dp(jitter(300, 250, 50, 5_000))),
        RuntimeThrottledRequests: counter(throttled),
        RuntimeThrottledCount: counter(throttled),
        RuntimeSystemErrors: counter(sysErr),
        MissedUtteranceCount: counter(missed),
        RuntimeInvalidLambdaResponses: counter(Math.random() < er ? randInt(0, 20) : 0),
        ConversationDuration: stat(convDurSec, { max: convDurMax }),
        IntentDetectionConfidence: stat(intentConf, { max: 1, min: 0 }),
        SentimentScore: stat(sentimentScore, { max: 1, min: 0 }),
      }
    );
  });
}

// ─── Forecast ─────────────────────────────────────────────────────────────────

export function generateForecastMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "forecast",
      "aws.forecast",
      region,
      account,
      { DatasetGroupName: rand(["sales-forecast", "demand-planning", "inventory-forecast"]) },
      {
        CreateForecastJobCount: counter(randInt(0, 10)),
        ForecastJobsSucceeded: counter(randInt(0, 10)),
        ForecastJobsFailed: counter(Math.random() < er ? randInt(0, 3) : 0),
        TrainingJobCount: counter(randInt(0, 5)),
        TrainingJobsSucceeded: counter(randInt(0, 5)),
        TrainingJobsFailed: counter(Math.random() < er ? randInt(0, 2) : 0),
      }
    ),
  ];
}

// ─── Personalize ──────────────────────────────────────────────────────────────

export function generatePersonalizeMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "personalize",
      "aws.personalize",
      region,
      account,
      { CampaignArn: `arn:aws:personalize:${region}:${account.id}:campaign/prod-recommendations` },
      {
        GetRecommendationRequestCount: counter(randInt(0, 100_000)),
        GetRecommendationLatency: stat(dp(jitter(50, 40, 5, 1_000))),
        GetRecommendationError: counter(Math.random() < er ? randInt(1, 500) : 0),
        PutEventsRequestCount: counter(randInt(0, 1_000_000)),
      }
    ),
  ];
}

// ─── LookoutMetrics ───────────────────────────────────────────────────────────

export function generateLookoutmetricsMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "lookoutmetrics",
      "aws.lookoutmetrics",
      region,
      account,
      {
        AnomalyDetectorName: rand([
          "sales-anomaly-detector",
          "traffic-anomalies",
          "fraud-detector",
        ]),
      },
      {
        ExecutionCount: counter(randInt(0, 288)),
        ExecutionError: counter(Math.random() < er ? randInt(0, 10) : 0),
        AnomaliesFound: counter(randInt(0, 50)),
      }
    ),
  ];
}

// ─── Textract ─────────────────────────────────────────────────────────────────

export function generateTextractMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const ops = [
    "DetectDocumentText",
    "AnalyzeDocument",
    "StartDocumentAnalysis",
    "GetDocumentAnalysis",
  ];
  return sample(ops, randInt(1, 3)).map((op) => {
    return metricDoc(
      ts,
      "textract",
      "aws.textract",
      region,
      account,
      { Operation: op },
      {
        SuccessfulRequestCount: counter(randInt(0, 5_000)),
        ThrottledRequestCount: counter(Math.random() < er ? randInt(1, 200) : 0),
        ResponseTime: stat(dp(jitter(2_000, 1_500, 200, 30_000))),
        PagesProcessed: counter(randInt(0, 50_000)),
      }
    );
  });
}

// ─── LakeFormation ────────────────────────────────────────────────────────────

export function generateLakeformationMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "lakeformation",
      "aws.lakeformation",
      region,
      account,
      { Region: region },
      {
        AccessDenied: counter(Math.random() < er ? randInt(0, 100) : 0),
        AllowedAccesses: counter(randInt(0, 50_000)),
        DataAccessCount: counter(randInt(0, 100_000)),
        TableRegistrationCount: counter(randInt(0, 10)),
      }
    ),
  ];
}

// ─── MWAA (Managed Workflows for Apache Airflow) ──────────────────────────────

const MWAA_ENVS = ["prod-airflow", "analytics-mwaa", "etl-orchestration", "data-platform-mwaa"];

export function generateMwaaMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(MWAA_ENVS, randInt(1, 2)).map((envName) => {
    const heartbeat = Math.random() < er ? jitter(95, 35, 45, 300) : jitter(4.2, 2.5, 0.5, 25);
    const running = randInt(0, 48);
    const succeeded = randInt(0, 500);
    const failed = Math.random() < er ? randInt(1, 80) : randInt(0, 6);
    const dagDur = jitter(120, 90, 5, 14_400);
    return metricDoc(
      ts,
      "mwaa",
      "aws.mwaa",
      region,
      account,
      { EnvironmentName: envName },
      {
        SchedulerHeartbeat: stat(dp(heartbeat), {
          max: dp(heartbeat * jitter(2.2, 0.6, 1.1, 5)),
          min: dp(Math.min(heartbeat * 0.3, 5)),
        }),
        TaskInstanceRunning: stat(running),
        TaskInstanceSuccess: counter(succeeded),
        TaskInstanceFailed: counter(failed),
        TaskInstanceScheduled: counter(randInt(0, succeeded + failed + running + 20)),
        DAGProcessingDuration: stat(dp(dagDur), {
          max: dp(dagDur * jitter(3.5, 1.2, 1.5, 12)),
          min: dp(dagDur * jitter(0.08, 0.05, 0.02, 0.35)),
        }),
        DAGDuration: stat(dp(dagDur * jitter(0.92, 0.08, 0.75, 1.05))),
        OpenSlots: stat(randInt(0, 32)),
        QueuedTasks: stat(Math.random() < er ? randInt(5, 400) : randInt(0, 35)),
        CPUUtilization: stat(
          dp(Math.random() < er ? jitter(78, 14, 55, 100) : jitter(34, 22, 4, 82))
        ),
        MemoryUtilization: stat(
          dp(Math.random() < er ? jitter(81, 12, 58, 100) : jitter(46, 24, 8, 86))
        ),
        DatabaseConnections: counter(randInt(2, 120)),
      }
    );
  });
}

// ─── QuickSight ───────────────────────────────────────────────────────────────

export function generateQuicksightMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const views = randInt(0, 10_000);
  const dsLoad = dp(jitter(800, 600, 50, 45_000));
  const dsLoadMax = dp(jitter(12_000, 9_000, 200, 120_000));
  const visualLoad = dp(jitter(400, 320, 30, 25_000));
  const visualLoadMax = dp(jitter(8_000, 6_000, 100, 90_000));
  const dashLoad = dp(jitter(520, 400, 40, 38_000));
  const dashLoadMax = dp(jitter(14_000, 10_000, 200, 140_000));
  const queryExec = dp(jitter(600, 480, 40, 35_000));
  const queryExecMax = dp(jitter(15_000, 12_000, 200, 150_000));
  const spiceGb = dp(jitter(12.5, 8, 0.1, 500));
  const spiceIngestGb = dp(jitter(2.4, 1.8, 0, 180));
  const concurrentSessions = randInt(1, 800);
  return [
    metricDoc(
      ts,
      "quicksight",
      "aws.quicksight",
      region,
      account,
      { AwsAccountId: account.id },
      {
        DashboardsCreated: counter(randInt(0, 20)),
        DashboardsPublished: counter(randInt(0, 10)),
        DashboardsViewed: counter(views),
        DashboardViewCount: counter(views),
        DashboardUserLoadTime: stat(dashLoad, { max: dashLoadMax }),
        DataSetLoadTime: stat(dsLoad, { max: dsLoadMax }),
        SPICEUsedCapacity: stat(spiceGb, { max: dp(spiceGb * 1.2) }),
        SPICEIngestionSizeInBytes: stat(dp(spiceIngestGb * 1_073_741_824)),
        VisualLoadTime: stat(visualLoad, { max: visualLoadMax }),
        QueryExecutionTime: stat(queryExec, { max: queryExecMax }),
        ConcurrentUserSessions: stat(concurrentSessions, {
          max: dp(concurrentSessions * jitter(1.4, 0.2, 1.05, 2)),
        }),
        ActiveUsers: stat(dp(jitter(42, 28, 1, 500)), { max: dp(800) }),
        ReaderSessionCount: counter(randInt(0, 5_000)),
        QueriesCount: counter(randInt(0, 50_000)),
        QueryDuration: stat(dp(jitter(500, 400, 50, 30_000))),
        QueryErrors: counter(Math.random() < er ? randInt(0, 100) : 0),
        SPICEIngestionErrors: counter(Math.random() < er ? randInt(0, 10) : 0),
      }
    ),
  ];
}

// ─── AppFlow ──────────────────────────────────────────────────────────────────

export function generateAppflowMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "appflow",
      "aws.appflow",
      region,
      account,
      { FlowName: rand(["salesforce-to-s3", "zendesk-sync", "marketo-etl", "servicenow-import"]) },
      {
        RecordsProcessed: counter(randInt(0, 1_000_000)),
        FlowExecutionsStarted: counter(randInt(0, 100)),
        FlowExecutionsFailed: counter(Math.random() < er ? randInt(0, 10) : 0),
        FlowExecutionsCanceled: counter(Math.random() < er ? randInt(0, 5) : 0),
        FlowExecutionTime: stat(dp(jitter(30_000, 25_000, 1_000, 3_600_000))),
      }
    ),
  ];
}

// ─── DataBrew ─────────────────────────────────────────────────────────────────

export function generateDatabrewMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "databrew",
      "aws.databrew",
      region,
      account,
      { ProjectName: rand(["data-quality-project", "customer-profiling", "sales-cleansing"]) },
      {
        ProfileJobsRun: counter(randInt(0, 20)),
        ProfileJobsSucceeded: counter(randInt(0, 20)),
        ProfileJobsFailed: counter(Math.random() < er ? randInt(0, 5) : 0),
        RecipeJobsRun: counter(randInt(0, 50)),
        RecipeJobsSucceeded: counter(randInt(0, 50)),
        RecipeJobsFailed: counter(Math.random() < er ? randInt(0, 10) : 0),
      }
    ),
  ];
}

// ─── XRay ─────────────────────────────────────────────────────────────────────

export function generateXrayMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const serviceNames = [
    "api-gateway",
    "user-auth-function",
    "order-processor",
    "payment-service",
    "user-service",
  ];
  const tracesReceived = randInt(100, 100_000);
  const segmentsReceived = randInt(tracesReceived, tracesReceived * 5);

  const docs = [
    metricDoc(
      ts,
      "xray",
      "aws.xray",
      region,
      account,
      { Region: region },
      {
        TracesReceived: counter(tracesReceived),
        TracesSampled: counter(Math.round(tracesReceived * jitter(0.1, 0.08, 0.01, 0.5))),
        TraceSegmentsReceived: counter(segmentsReceived),
        TracesStoredAsLinkages: counter(randInt(0, Math.round(tracesReceived * 0.5))),
        TraceSamplingDecisions: counter(tracesReceived),
        TraceSamplingDecisionsNot: counter(Math.round(tracesReceived * jitter(0.05, 0.04, 0, 0.2))),
      }
    ),
  ];

  // Per-service group metrics
  for (const svcName of sample(serviceNames, randInt(2, 4))) {
    const totalCount = randInt(100, 50_000);
    const faultRate = Math.random() < er ? jitter(5, 4, 0.5, 30) : jitter(0.5, 0.4, 0, 2);
    const errorRate = jitter(2, 1.5, 0, 10);
    const throttleRate = jitter(0.5, 0.4, 0, 5);
    const avgLatency = jitter(200, 150, 5, 5000);

    docs.push(
      metricDoc(
        ts,
        "xray",
        "aws.xray",
        region,
        account,
        { GroupName: "Default", ServiceName: svcName, ServiceType: "AWS::Lambda::Function" },
        {
          ApproximateTraceCount: counter(totalCount),
          FaultRate: stat(dp(faultRate)),
          ErrorRate: stat(dp(errorRate)),
          ThrottleRate: stat(dp(throttleRate)),
          OkRate: stat(dp(Math.max(0, 100 - faultRate - errorRate - throttleRate))),
          ResponseTime: stat(dp(avgLatency), {
            max: dp(avgLatency * jitter(3, 2, 1.5, 10)),
            min: dp(avgLatency * jitter(0.1, 0.08, 0.01, 0.5)),
          }),
        }
      )
    );
  }

  return docs;
}

// ─── SES ──────────────────────────────────────────────────────────────────────

export function generateSesMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const sent = randInt(0, 100_000);
  return [
    metricDoc(
      ts,
      "ses",
      "aws.ses",
      region,
      account,
      { Region: region },
      {
        Send: counter(sent),
        Delivery: counter(Math.round(sent * jitter(0.96, 0.03, 0.8, 1))),
        Bounce: counter(
          Math.round(
            sent *
              (Math.random() < er ? jitter(0.05, 0.04, 0.001, 0.2) : jitter(0.003, 0.002, 0, 0.01))
          )
        ),
        Complaint: counter(Math.round(sent * jitter(0.001, 0.0008, 0, 0.005))),
        Reject: counter(Math.random() < er ? randInt(1, 100) : 0),
        RenderingFailure: counter(Math.random() < er ? randInt(0, 20) : 0),
      }
    ),
  ];
}
