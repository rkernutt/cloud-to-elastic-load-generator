/**
 * Dimensional metric generators for AWS analytics, ML, and AI services:
 * Glue, EMR, Athena, SageMaker, Bedrock, BedrockAgent, LakeFormation,
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
  return sample(GLUE_JOBS, randInt(1, 3)).map((job) => {
    const runId = `jr_${Math.random().toString(36).substring(2)}`;
    return metricDoc(
      ts,
      "glue",
      "aws.glue",
      region,
      account,
      { JobName: job, JobRunId: runId, Type: rand(["ETL", "PYTHON_SHELL"]) },
      {
        glue_ALL_executors: stat(randInt(2, 20)),
        glue_FAILED_executors: stat(Math.random() < er ? randInt(1, 5) : 0),
        glue_WAITING_executors: stat(randInt(0, 5)),
        glue_driver_jvm_heap_usage: stat(dp(jitter(40, 25, 5, 90))),
        glue_driver_aggregate_bytesRead: stat(dp(randInt(100_000_000, 100_000_000_000))),
        glue_driver_aggregate_bytesWritten: stat(dp(randInt(50_000_000, 50_000_000_000))),
        glue_driver_aggregate_recordsRead: stat(dp(randInt(100_000, 1_000_000_000))),
        glue_driver_aggregate_numFiles: stat(randInt(1, 10_000)),
        glue_driver_aggregate_elapsedTime: stat(dp(jitter(300_000, 250_000, 10_000, 3_600_000))),
      }
    );
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
  return [
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
        ContainerAllocated: stat(randInt(coreNodes + taskNodes, (coreNodes + taskNodes) * 8)),
        ContainerReserved: stat(randInt(0, 50)),
        ContainerPending: stat(Math.random() < er ? randInt(1, 100) : 0),
        MRActiveNodes: stat(coreNodes + taskNodes),
        YARNMemoryAvailablePercentage: stat(
          dp(Math.random() < er ? jitter(10, 8, 0, 30) : jitter(60, 25, 10, 95))
        ),
      }
    ),
  ];
}

// ─── Athena ───────────────────────────────────────────────────────────────────

const ATHENA_WORKGROUPS = ["primary", "analytics", "reporting", "data-science", "etl"];

export function generateAthenaMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(ATHENA_WORKGROUPS, randInt(1, 3)).map((wg) => {
    const queries = randInt(0, 5_000);
    return metricDoc(
      ts,
      "athena",
      "aws.athena",
      region,
      account,
      { WorkGroup: wg },
      {
        TotalExecutionTime: stat(dp(jitter(10_000, 8_000, 100, 3_600_000))),
        QueryPlanningTime: stat(dp(jitter(500, 400, 50, 30_000))),
        QueryQueueTime: stat(dp(jitter(200, 150, 10, 10_000))),
        ServicePreProcessingTime: stat(dp(jitter(100, 80, 10, 5_000))),
        EngineExecutionTime: stat(dp(jitter(8_000, 6_000, 50, 3_600_000))),
        DataScannedInBytes: stat(dp(randInt(0, 10_000_000_000_000))),
        ProcessedBytes: stat(dp(randInt(0, 10_000_000_000_000))),
        ExecutionRequestsCount: counter(queries),
        CanceledExecutionRequestsCount: counter(Math.random() < er * 0.3 ? randInt(0, 50) : 0),
        FailedExecutionRequestsCount: counter(Math.random() < er ? randInt(0, 200) : 0),
        SuccessfulExecutionRequestsCount: counter(queries),
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
  return sample(SAGEMAKER_ENDPOINTS, randInt(1, 3)).map((ep) => {
    const invocations = randInt(0, 100_000);
    const modelErr = Math.round(
      invocations *
        (Math.random() < er ? jitter(0.05, 0.04, 0.001, 0.3) : jitter(0.001, 0.0008, 0, 0.005))
    );
    return metricDoc(
      ts,
      "sagemaker",
      "aws.sagemaker",
      region,
      account,
      { EndpointName: ep.name, VariantName: "AllTraffic" },
      {
        Invocations: counter(invocations),
        InvocationsPerInstance: counter(Math.round(invocations / randInt(1, 5))),
        ModelLatency: stat(dp(jitter(50, 40, 5, 5000)), { max: dp(jitter(500, 400, 50, 10000)) }),
        OverheadLatency: stat(dp(jitter(5, 4, 0.5, 100))),
        Invocation4XXErrors: counter(randInt(0, 100)),
        Invocation5XXErrors: counter(modelErr),
        ModelErrors: counter(modelErr),
        CPUUtilization: stat(
          dp(Math.random() < er ? jitter(85, 10, 60, 100) : jitter(40, 25, 5, 80))
        ),
        MemoryUtilization: stat(dp(jitter(55, 25, 10, 95))),
        GPUUtilization: ep.instance.includes("g4dn")
          ? stat(dp(jitter(70, 20, 10, 100)))
          : undefined,
        DiskUtilization: stat(dp(jitter(20, 15, 1, 80))),
      }
    );
  });
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
    return metricDoc(
      ts,
      "bedrock",
      "aws.bedrock",
      region,
      account,
      { ModelId: modelId },
      {
        Invocations: counter(invocations),
        InvocationLatency: stat(dp(jitter(1500, 1200, 100, 30_000)), {
          max: dp(jitter(15_000, 10_000, 2_000, 120_000)),
        }),
        InvocationClientErrors: counter(randInt(0, 50)),
        InvocationServerErrors: counter(Math.random() < er ? randInt(1, 100) : 0),
        InvocationThrottles: counter(Math.random() < er * 0.3 ? randInt(1, 500) : 0),
        InputTokenCount: counter(inputTokens),
        OutputTokenCount: counter(outputTokens),
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
        Throttles: counter(Math.random() < er * 0.2 ? randInt(1, 50) : 0),
        KnowledgeBaseRetrievals: counter(Math.round(sessions * jitter(2, 1.5, 0, 10))),
        ActionGroupInvocations: counter(Math.round(sessions * jitter(3, 2, 0, 15))),
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
    "RecognizeCelebrities",
    "DetectModerationLabels",
  ];
  return sample(ops, randInt(2, 4)).map((op) => {
    const calls = randInt(0, 10_000);
    return metricDoc(
      ts,
      "rekognition",
      "aws.rekognition",
      region,
      account,
      { Operation: op },
      {
        SuccessfulAPIRequests: counter(calls),
        ThrottledAPIRequests: counter(Math.random() < er ? randInt(0, 200) : 0),
        DetectedFaceCount: op.includes("Face") ? stat(dp(jitter(3, 2, 0, 50))) : undefined,
        DetectedLabelCount: op.includes("Label") ? stat(dp(jitter(8, 5, 0, 100))) : undefined,
      }
    );
  });
}

// ─── Transcribe ───────────────────────────────────────────────────────────────

export function generateTranscribeMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "transcribe",
      "aws.transcribe",
      region,
      account,
      { Region: region },
      {
        TotalRequestCount: counter(randInt(0, 5_000)),
        ProcessingTime: stat(dp(jitter(30_000, 25_000, 1_000, 3_600_000))),
        ThrottledCount: counter(Math.random() < er ? randInt(1, 100) : 0),
        ErrorCount: counter(Math.random() < er ? randInt(1, 50) : 0),
        AudioDurationTime: stat(dp(randInt(60, 7_200))),
      }
    ),
  ];
}

// ─── Translate ────────────────────────────────────────────────────────────────

export function generateTranslateMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "translate",
      "aws.translate",
      region,
      account,
      {
        Operation: "TranslateText",
        SourceLanguageCode: rand(["en", "es", "fr", "de", "zh"]),
        TargetLanguageCode: rand(["fr", "de", "ja", "pt", "ar"]),
      },
      {
        CharacterCount: counter(randInt(0, 5_000_000)),
        SuccessfulRequestCount: counter(randInt(0, 10_000)),
        ThrottledCount: counter(Math.random() < er ? randInt(1, 100) : 0),
        SystemErrorCount: counter(Math.random() < er ? randInt(0, 20) : 0),
        ResponseTime: stat(dp(jitter(200, 150, 10, 5_000))),
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
    return metricDoc(
      ts,
      "comprehend",
      "aws.comprehend",
      region,
      account,
      { Operation: op },
      {
        ResponseTime: stat(dp(jitter(50, 40, 5, 2_000))),
        SuccessfulRequestCount: counter(randInt(0, 10_000)),
        ThrottledCount: counter(Math.random() < er ? randInt(1, 100) : 0),
        NumberOfInputUnits: counter(randInt(0, 1_000_000)),
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
    return metricDoc(
      ts,
      "lex",
      "aws.lex",
      region,
      account,
      { BotName: bot, BotVersion: "$LATEST", Operation: "PostContent" },
      {
        RuntimeRequestCount: counter(reqs),
        RuntimeSuccessfulRequestLatency: stat(dp(jitter(300, 250, 50, 5_000))),
        RuntimeThrottledRequests: counter(Math.random() < er ? randInt(1, 200) : 0),
        RuntimeSystemErrors: counter(Math.random() < er ? randInt(1, 50) : 0),
        MissedUtteranceCount: counter(missed),
        RuntimeInvalidLambdaResponses: counter(Math.random() < er ? randInt(0, 20) : 0),
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

// ─── QuickSight ───────────────────────────────────────────────────────────────

export function generateQuicksightMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
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
        DashboardsViewed: counter(randInt(0, 10_000)),
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

export function generateXrayMetrics(ts: string, _er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "xray",
      "aws.xray",
      region,
      account,
      { Region: region },
      {
        TracesReceived: counter(randInt(0, 100_000)),
        TracesSampled: counter(randInt(0, 10_000)),
        TraceSegmentsReceived: counter(randInt(0, 500_000)),
        TracesStoredAsLinkages: counter(randInt(0, 50_000)),
      }
    ),
  ];
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
