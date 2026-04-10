import { rand, randInt, randFloat, randId, randUUID, randAccount, REGIONS } from "../../helpers";
import type { EcsDocument } from "./types.js";

function generateSageMakerLog(ts: string, er: number): EcsDocument {
  // ~12% chance of generating a Feature Store event
  if (Math.random() < 0.12) {
    const r = rand(REGIONS);
    const a = randAccount();
    const e = Math.random() < er;
    const fg = rand([
      "customer-features",
      "product-embeddings",
      "fraud-signals",
      "session-features",
      "recommendation-features",
    ]);
    const op = rand([
      "PutRecord",
      "GetRecord",
      "BatchGetRecord",
      "DeleteRecord",
      "CreateFeatureGroup",
      "DescribeFeatureGroup",
    ]);
    const errCodes = [
      "ResourceNotFound",
      "ValidationError",
      "AccessDeniedException",
      "InternalFailure",
      "ThrottlingException",
    ];
    return {
      __dataset: "aws.sagemaker_featurestore",
      "@timestamp": ts,
      cloud: {
        provider: "aws",
        region: r,
        account: { id: a.id, name: a.name },
        service: { name: "sagemaker-featurestore" },
      },
      aws: {
        sagemaker_featurestore: {
          feature_group_name: fg,
          operation: op,
          record_identifier: randId(12).toLowerCase(),
          online_store_latency_ms: randFloat(1, e ? 500 : 20),
          offline_store_status: rand(["Active", "Creating", "Deleting"]),
          feature_count: randInt(5, 50),
          record_count: randInt(1, 100),
          ttl_duration_seconds: randInt(3600, 86400 * 30),
        },
      },
      event: { outcome: e ? "failure" : "success", duration: randInt(1e4, e ? 5e6 : 2e5) },
      message: e
        ? `SageMaker Feature Store ${fg}: ${op} failed — ${rand(errCodes)}`
        : `SageMaker Feature Store ${fg}: ${op} OK (${randInt(1, 100)} records)`,
    };
  }
  // ~12% chance of generating a Pipelines event
  if (Math.random() < 0.12) {
    const r = rand(REGIONS);
    const a = randAccount();
    const e = Math.random() < er;
    const pipeline = rand([
      "training-pipeline",
      "etl-feature-pipeline",
      "batch-inference",
      "model-retraining",
      "data-quality-check",
    ]);
    const step = rand([
      "Processing",
      "Training",
      "Transform",
      "RegisterModel",
      "Condition",
      "Callback",
      "QualityCheck",
      "ClarifyCheck",
    ]);
    const status = e ? rand(["Failed", "Stopped"]) : rand(["Succeeded", "Executing"]);
    const errMsgs = [
      "Step timed out after 3600s",
      "Training job failed: OOM",
      "Data quality check below threshold",
      "Model registry conflict",
    ];
    return {
      __dataset: "aws.sagemaker_pipelines",
      "@timestamp": ts,
      cloud: {
        provider: "aws",
        region: r,
        account: { id: a.id, name: a.name },
        service: { name: "sagemaker-pipelines" },
      },
      aws: {
        sagemaker_pipelines: {
          pipeline_name: pipeline,
          pipeline_execution_id: `exec-${randId(12).toLowerCase()}`,
          step_name: `${step}-${randInt(1, 5)}`,
          step_type: step,
          status,
          execution_duration_seconds: randInt(10, e ? 3600 : 7200),
          parallelism: randInt(1, 10),
          retry_count: e ? randInt(1, 3) : 0,
          cache_hit: !e && Math.random() < 0.3,
        },
      },
      event: { outcome: e ? "failure" : "success", duration: randInt(1e7, 7.2e9) },
      message: e
        ? `SageMaker Pipeline ${pipeline}: step ${step} ${status} — ${rand(errMsgs)}`
        : `SageMaker Pipeline ${pipeline}: step ${step} ${status}`,
    };
  }
  // ~10% chance of generating a Model Monitor event
  if (Math.random() < 0.1) {
    const r = rand(REGIONS);
    const a = randAccount();
    const e = Math.random() < er;
    const endpoint = rand([
      "fraud-detector-v2",
      "recommendation-engine",
      "churn-predictor",
      "pricing-model",
    ]);
    const monType = rand(["DataQuality", "ModelQuality", "ModelBias", "ModelExplainability"]);
    const violations = [
      "feature_baseline_drift",
      "prediction_accuracy_below_threshold",
      "bias_metric_exceeded",
      "missing_feature_values",
    ];
    return {
      __dataset: "aws.sagemaker_modelmonitor",
      "@timestamp": ts,
      cloud: {
        provider: "aws",
        region: r,
        account: { id: a.id, name: a.name },
        service: { name: "sagemaker-model-monitor" },
      },
      aws: {
        sagemaker_model_monitor: {
          endpoint_name: endpoint,
          monitoring_type: monType,
          monitoring_schedule: `${endpoint}-${monType.toLowerCase()}-schedule`,
          execution_status: e ? "CompletedWithViolations" : "Completed",
          violation_count: e ? randInt(1, 15) : 0,
          violation_types: e ? [rand(violations)] : [],
          baseline_statistics_uri: `s3://sagemaker-${r}/baselines/${endpoint}/statistics.json`,
          constraints_uri: `s3://sagemaker-${r}/baselines/${endpoint}/constraints.json`,
          data_captured_count: randInt(100, 10000),
          features_analyzed: randInt(10, 100),
        },
      },
      event: { outcome: e ? "failure" : "success", duration: randInt(6e7, 9e8) },
      message: e
        ? `Model Monitor ${endpoint}: ${monType} completed with ${randInt(1, 15)} violations`
        : `Model Monitor ${endpoint}: ${monType} passed (${randInt(100, 10000)} samples)`,
    };
  }
  const region = rand(REGIONS);
  const acct = randAccount();
  const level = Math.random() < er ? "error" : Math.random() < 0.12 ? "warn" : "info";
  const domain = rand(["ds-platform", "ml-research", "cv-team", "nlp-experiments", "risk-models"]);
  const domainId = `d-${randId(10).toLowerCase()}`;
  const user = rand(["alice-ds", "bob-ml", "carol-research", "dan-platform"]);
  const model = rand([
    "xgboost-classifier",
    "bert-finetuned",
    "resnet50-custom",
    "lstm-timeseries",
    "llama-finetuned",
  ]);
  const jobType = rand([
    "Training",
    "Processing",
    "Transform",
    "HyperparameterTuning",
    "Pipeline",
    "Endpoint",
  ]);
  const jobName = `${model}-${jobType.toLowerCase()}-${randId(6).toLowerCase()}`;
  const isErr = level === "error";
  const isStudio = Math.random() < 0.45;
  const STUDIO_APP_TYPES = [
    "JupyterServer",
    "KernelGateway",
    "JupyterLab",
    "CodeEditor",
    "RStudio",
    "RSession",
  ];
  const STUDIO_SPACES = ["ml-research", "cv-team", "ds-platform", "nlp-experiments", "risk-models"];
  const CLASSIC_ACTIONS = [
    "TrainingJobStarted",
    "TrainingJobCompleted",
    "ProcessingJobStarted",
    "EndpointInService",
    "PipelineExecutionStarted",
    "ModelRegistered",
  ];
  const STUDIO_ACTIONS = [
    "AppCreated",
    "AppReady",
    "AppDeleted",
    "LifecycleConfigOnStart",
    "SpaceCreated",
  ];
  const action = isStudio ? rand(STUDIO_ACTIONS) : rand(CLASSIC_ACTIONS);
  const lifecycleConfig = isStudio && action === "LifecycleConfigOnStart";
  const durationSec = Number(randFloat(isErr ? 5 : 60, isErr ? 600 : 14400));
  const ERROR_CODES = [
    "CapacityError",
    "ResourceNotFound",
    "ValidationException",
    "InternalServerError",
  ];
  const ERROR_MSGS = [
    "Training job failed: CUDA out of memory",
    "Endpoint creation failed: No capacity for ml.p4d.24xlarge",
    "Model deployment failed: health check timeout",
  ];
  // Lifecycle message pool: explicit started/succeeded/failed per job type (Glue/EMR-style consistency)
  const lifecycleByType = {
    Training: {
      start: ["Training job started", "Training job started on ml.p3.2xlarge (4 GPUs)"],
      success: ["Training job succeeded", "Training job completed successfully"],
      fail: ["Training job failed"],
    },
    Processing: {
      start: ["Processing job started", "Processing job started"],
      success: ["Processing job succeeded", "Processing job completed successfully"],
      fail: ["Processing job failed"],
    },
    Transform: {
      start: ["Transform job started"],
      success: ["Transform job succeeded"],
      fail: ["Transform job failed"],
    },
    HyperparameterTuning: {
      start: ["Hyperparameter tuning job started"],
      success: ["Hyperparameter tuning job succeeded"],
      fail: ["Hyperparameter tuning job failed"],
    },
    Pipeline: {
      start: ["Pipeline execution started", "Pipeline execution started"],
      success: ["Pipeline execution succeeded", "Pipeline execution completed successfully"],
      fail: ["Pipeline execution failed"],
    },
    Endpoint: {
      start: ["Endpoint creation started", "Endpoint deployment started"],
      success: ["Endpoint creation succeeded", "Endpoint InService: latency p50=12ms p99=47ms"],
      fail: ["Endpoint creation failed", "Endpoint deployment failed"],
    },
  };
  const life = lifecycleByType[jobType as keyof typeof lifecycleByType] || lifecycleByType.Training;
  const infoLifecycle = [...life.start, ...life.success];
  const infoOther = [
    "Epoch 12/50 - loss: 0.2341, val_loss: 0.2518, accuracy: 0.9124",
    "Model artifact uploaded to s3://models/output/",
    "Feature Store ingestion complete: 4,829,201 records",
    "Model registered: fraud-detector v12 (AUC: 0.9923)",
  ];
  const errorLifecycle = [...life.fail, ...ERROR_MSGS];
  const MSGS = {
    info: [...infoLifecycle, ...infoOther],
    warn: [
      "GPU utilization low: 34%",
      "Training loss plateau detected at epoch 28",
      "Model drift detected: PSI=0.18",
      "Spot instance interruption, checkpointing...",
    ],
    error: errorLifecycle,
  };
  const plainMessage = rand(MSGS[level]);
  const spaceName = rand(STUDIO_SPACES);
  const appType = rand(STUDIO_APP_TYPES);
  const useStudioLogging = isStudio && Math.random() < 0.55;
  const message = useStudioLogging
    ? JSON.stringify({
        domainId,
        space: spaceName,
        appType,
        user,
        level: level.toUpperCase(),
        message: plainMessage,
        timestamp: new Date(ts).toISOString(),
        event: action,
      })
    : plainMessage;
  const isTrainingJob = jobType === "Training" || jobType === "HyperparameterTuning";
  const trainingMetrics = isTrainingJob
    ? {
        training_loss: parseFloat((Math.random() * 0.8 + 0.05).toFixed(4)),
        accuracy: parseFloat((Math.random() * 0.3 + 0.7).toFixed(4)),
        epoch: randInt(1, 100),
        gpu_utilization_pct: randInt(40, 99),
        cpu_utilization_pct: randInt(30, 90),
      }
    : { gpu_utilization_pct: randInt(10, 80), cpu_utilization_pct: randInt(20, 75) };
  const invocations = randInt(1, 5000);
  const modelLatencyMs = randInt(5, isErr ? 5000 : 200);
  const gpuUtil = randInt(40, isErr ? 99 : 85);
  const cpuUtil = randInt(30, isErr ? 95 : 75);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "sagemaker" },
    },
    aws: {
      dimensions: { TrainingJobName: jobName, JobType: jobType },
      sagemaker: {
        domain_id: domainId,
        domain_name: domain,
        user_profile: user,
        job: {
          name: jobName,
          type: jobType,
          arn: `arn:aws:sagemaker:${region}:${acct.id}:training-job/${jobName}`,
        },
        model: { name: model, version: randInt(1, 25) },
        pipeline: {
          name: rand(["feature-engineering-pipeline", "model-training-pipeline"]),
          execution_id: `pipe-${randId(12).toLowerCase()}`,
        },
        instance: {
          type: rand(["ml.p3.2xlarge", "ml.g4dn.xlarge", "ml.m5.xlarge"]),
          count: rand([1, 1, 2, 4]),
        },
        metrics: trainingMetrics,
        studio: isStudio
          ? {
              space_name: spaceName,
              app_type: appType,
              app_name: rand(["default", `instance-${randId(8).toLowerCase()}`]),
              lifecycle_config: lifecycleConfig,
              continuous_logging: useStudioLogging,
            }
          : {
              space_name: null,
              app_type: null,
              app_name: null,
              lifecycle_config: false,
              continuous_logging: false,
            },
        cloudwatch_metrics: {
          Invocations: { sum: invocations },
          ModelLatency: { avg: modelLatencyMs },
          GPUUtilization: { avg: gpuUtil },
          CPUUtilization: { avg: cpuUtil },
          DiskUtilization: { avg: randInt(10, isErr ? 95 : 60) },
          MemoryUtilization: { avg: randInt(50, isErr ? 98 : 80) },
          Invocations4XXError: { sum: isErr && Math.random() < 0.3 ? randInt(1, 50) : 0 },
          Invocations5XXError: { sum: isErr ? randInt(1, 100) : 0 },
        },
      },
    },
    log: { level },
    user: { name: user },
    event: {
      action,
      duration: durationSec * 1e9,
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.sagemaker",
      provider: "sagemaker.amazonaws.com",
    },
    message: message,
    ...(isErr
      ? { error: { code: rand(ERROR_CODES), message: rand(ERROR_MSGS), type: "service" } }
      : {}),
  };
}

function generateBedrockLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const models = [
    "anthropic.claude-3-5-sonnet-20241022-v2:0",
    "anthropic.claude-3-haiku-20240307-v1:0",
    "amazon.titan-text-express-v1",
    "meta.llama3-70b-instruct-v1:0",
    "mistral.mixtral-8x7b-instruct-v0:1",
    "amazon.nova-pro-v1:0",
  ];
  const model = rand(models);
  const modelFamily = model.split(".")[0]; // anthropic, amazon, meta, mistral
  // Token ratios vary by model family: claude tends verbose, titan is concise
  const maxOutputByFamily = { anthropic: 8192, amazon: 4096, meta: 8192, mistral: 32768 };
  const maxOut = maxOutputByFamily[modelFamily as keyof typeof maxOutputByFamily] || 4096;
  const inputTokens = randInt(50, 8000);
  const outputTokens = isErr ? 0 : Math.min(randInt(50, 2000), maxOut);
  const isStreaming = Math.random() < 0.6;
  // Time to first token: lower for small models, higher for large
  const ttftMs = isStreaming
    ? modelFamily === "anthropic"
      ? randInt(100, 800)
      : randInt(50, 400)
    : null;
  const lat = Number(randFloat(0.5, isErr ? 30 : 15));
  const invocations = randInt(1, 500);
  const latencyMs = Math.round(lat * 1000);
  const inputTokensPerSec =
    isStreaming && !isErr ? parseFloat((inputTokens / lat).toFixed(1)) : null;
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "bedrock" },
    },
    aws: {
      dimensions: { ModelId: model },
      bedrock: {
        model_id: model,
        invocation_latency_ms: latencyMs,
        input_token_count: inputTokens,
        output_token_count: outputTokens,
        total_token_count: inputTokens + outputTokens,
        stop_reason: isErr ? null : rand(["end_turn", "max_tokens", "stop_sequence"]),
        error_code: isErr
          ? rand(["ThrottlingException", "ModelTimeoutException", "ModelErrorException"])
          : null,
        use_case: rand(["text-generation", "summarization", "classification", "extraction", "qa"]),
        guardrail_action: rand(["NONE", "NONE", "NONE", "INTERVENED"]),
        streaming: isStreaming,
        time_to_first_token_ms: ttftMs,
        input_tokens_per_sec: inputTokensPerSec,
        model_family: modelFamily,
        metrics: {
          Invocations: { sum: invocations },
          InvocationLatency: { avg: latencyMs, p99: latencyMs * 2 },
          InputTokenCount: { sum: inputTokens },
          OutputTokenCount: { sum: outputTokens },
          Throttles: { sum: isErr ? randInt(1, 20) : 0 },
        },
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.bedrock",
      provider: "bedrock.amazonaws.com",
      duration: lat * 1e9,
    },
    message: isErr
      ? `Bedrock ${model.split(".")[1].split("-")[0]} invocation FAILED: ${rand(["ThrottlingException", "ModelTimeoutException"])}`
      : `Bedrock ${model.split(".")[1].split("-")[0]} ${inputTokens}->${outputTokens} tokens ${lat.toFixed(2)}s`,
    log: { level: isErr ? "error" : lat > 10 ? "warn" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand(["ThrottlingException", "ModelTimeoutException", "ModelErrorException"]),
            message: "Bedrock invocation failed",
            type: "ml",
          },
        }
      : {}),
  };
}

function generateBedrockAgentLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const agentId = `T${randId(11).toUpperCase()}`;
  const aliasId = rand(["TSTALIASID", "LIVE"]);
  const sessionId = randId(32).toLowerCase();
  const action = rand(["InvokeAgent", "Retrieve", "InvokeAgentWithResponseStream"]);
  const kbId = `KB${randId(9).toUpperCase()}`;
  const inputTokens = randInt(100, 4000);
  const outputTokens = randInt(50, isErr ? 0 : 2000);
  const dur = Number(randFloat(0.3, isErr ? 15 : 8));
  const latencyMs = Math.round(dur * 1000);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "bedrock-agent" },
    },
    aws: {
      dimensions: { AgentId: agentId, Operation: action },
      bedrockagent: {
        agent_id: agentId,
        agent_alias_id: aliasId,
        session_id: sessionId,
        action,
        knowledge_base_id: action === "Retrieve" ? kbId : null,
        input_token_count: inputTokens,
        output_token_count: outputTokens,
        invocation_latency_ms: latencyMs,
        orchestration_trace: rand([
          null,
          {
            model_invocation: {
              model_arn: `arn:aws:bedrock:${region}::foundation-model/anthropic.claude-3-5-sonnet-v2`,
            },
          },
        ]),
        guardrail_action: rand(["NONE", "NONE", "INTERVENED"]),
        error_code: isErr
          ? rand(["ValidationException", "ThrottlingException", "ServiceQuotaExceededException"])
          : null,
        metrics: {
          Invocations: { sum: randInt(1, 200) },
          InvocationLatency: { avg: latencyMs, p99: latencyMs * 2 },
          InputTokenCount: { sum: inputTokens },
          OutputTokenCount: { sum: outputTokens },
        },
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.bedrockagent",
      provider: "bedrock-agent-runtime.amazonaws.com",
      duration: dur * 1e9,
    },
    message: isErr
      ? `Bedrock Agent ${agentId} ${action} FAILED`
      : `Bedrock Agent ${agentId}: ${action} ${inputTokens}\u2192${outputTokens} tokens ${dur.toFixed(2)}s`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? { error: { code: "BedrockAgentError", message: "Agent invocation failed", type: "ml" } }
      : {}),
  };
}

function generateRekognitionLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const op = rand([
    "DetectFaces",
    "RecognizeCelebrities",
    "DetectLabels",
    "DetectModerationLabels",
    "DetectText",
    "IndexFaces",
    "SearchFaces",
    "DetectCustomLabels",
    "StartFaceDetection",
    "GetFaceDetection",
  ]);
  const level = isErr ? "error" : "info";
  const dur = Number(randFloat(50, isErr ? 5000 : 1000));
  const confidence = Number(randFloat(70, 99));
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "rekognition" },
    },
    aws: {
      dimensions: { Operation: op },
      rekognition: {
        operation: op,
        input_source: rand(["S3Object", "Base64Image", "Video"]),
        image_bytes: randInt(10000, 10485760),
        duration_ms: Math.round(dur),
        labels_detected: isErr ? 0 : randInt(1, 50),
        faces_detected: isErr ? 0 : randInt(0, 20),
        max_confidence: isErr ? 0 : confidence,
        confidence_threshold: 70,
        moderation_labels:
          op === "DetectModerationLabels" && !isErr
            ? [rand(["Explicit Content", "Violence"])]
            : null,
        error_code: isErr
          ? rand([
              "InvalidS3ObjectException",
              "AccessDeniedException",
              "ThrottlingException",
              "ImageTooLargeException",
            ])
          : null,
        metrics: {
          SuccessfulRequestCount: { sum: 1 },
          ThrottledCount: { sum: isErr ? 1 : 0 },
          UserErrorCount: { sum: isErr ? randInt(1, 5) : 0 },
          ServerErrorCount: { sum: 0 },
          ResponseTime: { avg: Number(randFloat(100, isErr ? 5000 : 1000)) },
        },
      },
    },
    event: {
      duration: dur * 1e6,
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.rekognition",
      provider: "rekognition.amazonaws.com",
    },
    message: isErr
      ? `Rekognition ${op} FAILED: ${rand(["Image too large", "Access denied", "Throttled"])}`
      : `Rekognition ${op}: ${randInt(1, 50)} results, ${confidence.toFixed(1)}% confidence`,
    log: { level },
    ...(isErr
      ? { error: { code: "RekognitionError", message: "Rekognition operation failed", type: "ml" } }
      : {}),
  };
}

function generateTextractLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const op = rand([
    "AnalyzeDocument",
    "DetectDocumentText",
    "StartDocumentAnalysis",
    "GetDocumentAnalysis",
    "StartExpenseAnalysis",
    "GetExpenseAnalysis",
  ]);
  const docType = rand(["invoice", "tax-form", "id-card", "contract", "receipt", "bank-statement"]);
  const pages = isErr ? 0 : randInt(1, 50);
  const level = isErr ? "error" : "info";
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "textract" },
    },
    aws: {
      dimensions: { Operation: op },
      textract: {
        operation: op,
        document_type: docType,
        job_id: op.startsWith("Start") || op.startsWith("Get") ? randId(36).toLowerCase() : null,
        job_status: op.startsWith("Get") ? (isErr ? "FAILED" : "SUCCEEDED") : null,
        pages_processed: pages,
        blocks_detected: pages * randInt(10, 200),
        words_detected: pages * randInt(50, 500),
        form_key_value_pairs: op === "AnalyzeDocument" ? randInt(0, 50) : 0,
        tables_detected: op === "AnalyzeDocument" ? randInt(0, 10) : 0,
        confidence_mean: Number(randFloat(85, 99)),
        error_code: isErr
          ? rand([
              "UnsupportedDocumentException",
              "DocumentTooLargeException",
              "BadDocumentException",
            ])
          : null,
        metrics: {
          DocumentsProcessed: { sum: 1 },
          ThrottledRequests: { sum: isErr ? 1 : 0 },
          ResponseTime: { avg: Number(randFloat(500, isErr ? 30000 : 5000)) },
          SuccessfulRequests: { sum: isErr ? 0 : 1 },
          UserErrorRequests: { sum: isErr ? randInt(1, 5) : 0 },
          ServerErrorRequests: { sum: 0 },
        },
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process", "file"],
      dataset: "aws.textract",
      provider: "textract.amazonaws.com",
    },
    message: isErr
      ? `Textract ${op} FAILED on ${docType}: ${rand(["Unsupported format", "Document too large"])}`
      : `Textract ${op}: ${docType}, ${pages} pages, ${pages * randInt(50, 500)} words`,
    log: { level },
    ...(isErr
      ? { error: { code: "TextractError", message: "Textract operation failed", type: "ml" } }
      : {}),
  };
}

function generateComprehendLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const op = rand([
    "DetectSentiment",
    "DetectEntities",
    "DetectKeyPhrases",
    "DetectDominantLanguage",
    "ClassifyDocument",
    "DetectPiiEntities",
    "StartSentimentDetectionJob",
    "StartEntitiesDetectionJob",
  ]);
  const lang = rand(["en", "es", "fr", "de", "it", "pt", "ja", "zh"]);
  const sentiment = rand(["POSITIVE", "NEGATIVE", "NEUTRAL", "MIXED"]);
  const level = isErr ? "error" : "info";
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "comprehend" },
    },
    aws: {
      dimensions: { Operation: op },
      comprehend: {
        operation: op,
        language_code: lang,
        text_bytes: randInt(100, 100000),
        sentiment: op === "DetectSentiment" ? sentiment : null,
        entities_detected: op === "DetectEntities" ? randInt(0, 20) : 0,
        key_phrases_detected: op === "DetectKeyPhrases" ? randInt(0, 30) : 0,
        pii_entities_detected: op === "DetectPiiEntities" ? randInt(0, 10) : 0,
        error_code: isErr
          ? rand(["TextSizeLimitExceededException", "UnsupportedLanguageException"])
          : null,
        metrics: {
          NumberOfSuccessfulRequest: { sum: 1 },
          NumberOfFailedRequest: { sum: isErr ? 1 : 0 },
          ResponseTime: { avg: Number(randFloat(100, isErr ? 5000 : 500)) },
        },
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.comprehend",
      provider: "comprehend.amazonaws.com",
    },
    message: isErr
      ? `Comprehend ${op} FAILED: ${rand(["Text too large", "Unsupported language"])}`
      : `Comprehend ${op}: lang=${lang}${op === "DetectSentiment" ? `, sentiment=${sentiment}` : ""}`,
    log: { level },
    ...(isErr
      ? { error: { code: "ComprehendError", message: "Comprehend operation failed", type: "ml" } }
      : {}),
  };
}

function generateComprehendMedicalLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const action = rand([
    "DetectEntitiesV2",
    "DetectPHI",
    "InferICD10CM",
    "InferRxNorm",
    "InferSNOMEDCT",
    "StartEntitiesDetectionV2Job",
  ]);
  const entityCount = randInt(2, 50);
  const phiCount = isErr ? 0 : randInt(0, 10);
  const level = isErr ? "error" : phiCount > 5 ? "warn" : "info";
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "comprehendmedical" },
    },
    aws: {
      dimensions: { Operation: action },
      comprehendmedical: {
        operation: action,
        entities_detected: entityCount,
        phi_entities: phiCount,
        icd10_concepts: action.includes("ICD") ? randInt(1, 20) : null,
        rxnorm_concepts: action.includes("Rx") ? randInt(1, 15) : null,
        snomedct_concepts: action.includes("SNOMED") ? randInt(1, 30) : null,
        text_characters: randInt(100, 10000),
        job_id: action.includes("Job") ? randId(36).toLowerCase() : null,
        data_access_role_arn: `arn:aws:iam::${acct.id}:role/ComprehendMedicalRole`,
        s3_bucket: rand(["medical-records", "clinical-notes", "ehr-processed"]),
        error_code: isErr
          ? rand([
              "InvalidRequestException",
              "TextSizeLimitExceededException",
              "TooManyRequestsException",
            ])
          : null,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.comprehendmedical",
      provider: "comprehendmedical.amazonaws.com",
    },
    message: isErr
      ? `Comprehend Medical ${action} FAILED: ${rand(["Text too long", "Invalid request", "Rate limit exceeded"])}`
      : `Comprehend Medical ${action}: ${entityCount} entities, ${phiCount} PHI`,
    log: { level },
    ...(isErr
      ? {
          error: {
            code: rand([
              "InvalidRequestException",
              "TextSizeLimitExceededException",
              "TooManyRequestsException",
            ]),
            message: "Comprehend Medical failed",
            type: "ml",
          },
        }
      : {}),
  };
}

function generateTranslateLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const langs = ["en", "es", "fr", "de", "it", "pt", "ja", "zh", "ko", "ar", "ru", "hi"];
  const srcLang = rand(langs);
  const tgtLang = rand(langs.filter((l) => l !== srcLang));
  const chars = randInt(100, isErr ? 0 : 500000);
  const dur = Number(randFloat(50, isErr ? 5000 : 1000));
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "translate" },
    },
    aws: {
      dimensions: { SourceLanguage: srcLang, TargetLanguage: tgtLang },
      translate: {
        source_language_code: srcLang,
        target_language_code: tgtLang,
        characters_translated: chars,
        applied_terminology: rand([null, "tech-glossary", "product-terms"]),
        formality: rand([null, "FORMAL", "INFORMAL"]),
        duration_ms: Math.round(dur),
        error_code: isErr
          ? rand(["DetectedLanguageLowConfidenceException", "UnsupportedLanguagePairException"])
          : null,
        metrics: {
          SuccessfulRequestCount: { sum: 1 },
          ThrottledCount: { sum: isErr ? 1 : 0 },
          UserErrorCount: { sum: isErr ? randInt(1, 5) : 0 },
          ServerErrorCount: { sum: 0 },
          CharacterCount: { sum: randInt(1, 5000) },
          ResponseTime: { avg: Number(randFloat(100, isErr ? 2000 : 300)) },
        },
      },
    },
    event: {
      duration: dur * 1e6,
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.translate",
      provider: "translate.amazonaws.com",
    },
    message: isErr
      ? `Translate FAILED (${srcLang}->${tgtLang}): ${rand(["Unsupported pair", "Low confidence"])}`
      : `Translate ${srcLang}->${tgtLang}: ${chars.toLocaleString()} chars in ${dur.toFixed(0)}ms`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? { error: { code: "TranslateError", message: "Translate failed", type: "ml" } }
      : {}),
  };
}

function generateTranscribeLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const jobName = `transcribe-${randId(8).toLowerCase()}`;
  const lang = rand(["en-US", "en-GB", "es-US", "fr-FR", "de-DE", "ja-JP"]);
  const audioMins = Number(randFloat(0.5, isErr ? 0 : 120));
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "transcribe" },
    },
    aws: {
      dimensions: { Operation: "TranscriptionJob", LanguageCode: lang },
      transcribe: {
        transcription_job_name: jobName,
        transcription_job_status: isErr ? "FAILED" : "COMPLETED",
        language_code: lang,
        media_format: rand(["mp3", "mp4", "wav", "flac", "ogg"]),
        media_uri: `s3://audio-bucket/${jobName}.mp3`,
        audio_duration_minutes: audioMins,
        word_count: isErr ? 0 : Math.round(audioMins * 150),
        vocabulary_name: rand([null, "custom-medical-terms", "legal-terminology"]),
        speaker_count: rand([null, 1, 2, rand([3, 4])]),
        content_redaction_enabled: Math.random() > 0.7,
        error_code: isErr
          ? rand(["InternalFailure", "BadRequestException", "LimitExceededException"])
          : null,
        metrics: {
          TranscriptionJobsCompleted: { sum: isErr ? 0 : 1 },
          TranscriptionJobsFailed: { sum: isErr ? 1 : 0 },
          TranscriptionJobsPending: { avg: randInt(0, 10) },
          TranscriptionJobsRunning: { avg: randInt(0, 5) },
        },
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.transcribe",
      provider: "transcribe.amazonaws.com",
    },
    message: isErr
      ? `Transcribe job ${jobName} FAILED (${lang}): ${rand(["Audio too noisy", "Unsupported codec", "Access denied"])}`
      : `Transcribe job ${jobName}: ${audioMins.toFixed(1)} min audio (${lang})`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? { error: { code: "TranscribeError", message: "Transcribe job failed", type: "ml" } }
      : {}),
  };
}

function generatePollyLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const voice = rand(["Joanna", "Matthew", "Amy", "Brian", "Celine", "Hans", "Mizuki", "Lupe"]);
  const chars = isErr ? 0 : randInt(50, 100000);
  const engine = rand(["standard", "neural", "long-form"]);
  const pollyOp = rand([
    "SynthesizeSpeech",
    "StartSpeechSynthesisTask",
    "GetSpeechSynthesisTask",
    "ListSpeechSynthesisTasks",
  ]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "polly" },
    },
    aws: {
      dimensions: { Operation: pollyOp },
      polly: {
        voice_id: voice,
        engine,
        operation: pollyOp,
        language_code: rand(["en-US", "en-GB", "fr-FR", "de-DE", "es-US"]),
        output_format: rand(["mp3", "ogg_vorbis", "pcm"]),
        text_type: rand(["text", "ssml"]),
        characters_synthesized: chars,
        sample_rate: rand(["8000", "16000", "22050", "24000"]),
        error_code: isErr
          ? rand([
              "TextLengthExceededException",
              "InvalidSsmlException",
              "LanguageNotSupportedException",
            ])
          : null,
        metrics: {
          RequestCharacters: { sum: randInt(1, 3000) },
          ResponseLatency: { avg: Number(randFloat(100, isErr ? 2000 : 500)) },
          "2XXCount": { sum: isErr ? 0 : 1 },
          "4XXCount": { sum: isErr ? randInt(1, 5) : 0 },
          "5XXCount": { sum: 0 },
        },
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.polly",
      provider: "polly.amazonaws.com",
    },
    message: isErr
      ? `Polly SynthesizeSpeech FAILED (${voice}): ${rand(["Text too long", "Invalid SSML", "Language not supported"])}`
      : `Polly SynthesizeSpeech: ${voice} (${engine}), ${chars} chars`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? { error: { code: "PollyError", message: "Polly synthesis failed", type: "ml" } }
      : {}),
  };
}

function generateForecastLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const dataset = rand([
    "demand-forecast",
    "sales-prediction",
    "energy-consumption",
    "web-traffic",
  ]);
  const action = rand([
    "CreatePredictor",
    "CreateForecast",
    "CreateDatasetImportJob",
    "GetAccuracyMetrics",
  ]);
  const dur = randInt(300, isErr ? 86400 : 7200);
  const wql = Number(randFloat(0.05, 0.25));
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "forecast" },
    },
    aws: {
      dimensions: { DatasetGroup: dataset, Operation: action },
      forecast: {
        dataset_group: dataset,
        predictor_name: isErr ? null : `${dataset}-predictor-v${randInt(1, 20)}`,
        action,
        algorithm: rand(["AutoML", "CNN-QR", "DeepAR+", "NPTS", "Prophet", "ETS"]),
        forecast_horizon: rand([7, 14, 30, 60, 90]),
        weighted_quantile_loss: isErr ? null : wql,
        duration_seconds: dur,
        status: isErr ? "FAILED" : "ACTIVE",
        error_message: isErr
          ? rand(["Insufficient training data", "AutoML timed out", "Invalid target field"])
          : null,
      },
    },
    event: {
      duration: dur * 1e9,
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.forecast",
      provider: "forecast.amazonaws.com",
    },
    message: isErr
      ? `Forecast ${action} FAILED for ${dataset}: ${rand(["Insufficient data", "Training timeout"])}`
      : `Forecast ${action}: ${dataset}, WQL=${wql.toFixed(3)}`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? { error: { code: "ForecastError", message: "Forecast operation failed", type: "ml" } }
      : {}),
  };
}

function generatePersonalizeLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const campaign = rand([
    "product-recommendations",
    "content-discovery",
    "similar-items",
    "personalized-ranking",
  ]);
  const userId = `user-${randId(8).toLowerCase()}`;
  const action = rand([
    "GetRecommendations",
    "GetPersonalizedRanking",
    "CreateSolution",
    "PutEvents",
    "CreateCampaign",
  ]);
  const numResults = isErr ? 0 : randInt(5, 25);
  const dur = Number(randFloat(10, isErr ? 5000 : 300));
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "personalize" },
    },
    aws: {
      dimensions: { CampaignArn: campaign, Operation: action },
      personalize: {
        campaign_name: campaign,
        action,
        user_id: userId,
        num_results_returned: numResults,
        recipe: rand(["aws-similar-items", "aws-user-personalization", "aws-hrnn"]),
        solution_version: rand(["1.0.0", "1.1.2", "2.0.0"]),
        duration_ms: Math.round(dur),
        error_code: isErr ? rand(["ResourceNotFoundException", "InvalidInputException"]) : null,
      },
    },
    user: { name: userId },
    event: {
      duration: dur * 1e6,
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.personalize",
      provider: "personalize.amazonaws.com",
    },
    message: isErr
      ? `Personalize ${action} FAILED for ${campaign}`
      : `Personalize ${action}: ${numResults} recs for ${userId} in ${dur.toFixed(0)}ms`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? { error: { code: "PersonalizeError", message: "Personalize operation failed", type: "ml" } }
      : {}),
  };
}

function generateLexLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const bot = rand(["customer-service-bot", "order-bot", "faq-bot", "booking-assistant"]);
  const intent = rand([
    "OrderProduct",
    "CheckStatus",
    "CancelOrder",
    "GetHelp",
    "BookAppointment",
    "TransferToAgent",
  ]);
  const nluScore = Number(randFloat(0.6, 0.99));
  const botId = randId(10);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "lex" },
    },
    aws: {
      dimensions: { BotName: bot, Operation: intent },
      lex: {
        bot_id: botId,
        bot_name: bot,
        bot_version: rand(["DRAFT", "1", "2"]),
        locale_id: rand(["en_US", "en_GB", "es_US", "fr_FR"]),
        session_id: randId(36).toLowerCase(),
        input_transcript: rand([
          "I want to order a product",
          "What is my order status",
          "Cancel my order",
        ]),
        intent_name: intent,
        intent_nlu_confidence_score: nluScore,
        dialog_state: isErr ? "Failed" : "Fulfilled",
        sentiment: rand(["POSITIVE", "NEUTRAL", "NEGATIVE"]),
        error_code: isErr ? rand(["NoSuchBotException", "BadRequestException"]) : null,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.lex",
      provider: "lex.amazonaws.com",
    },
    message: isErr
      ? `Lex ${bot} FAILED: intent ${intent} - ${rand(["NLU confidence too low", "Slot validation failed"])}`
      : `Lex ${bot}: intent=${intent} (${(nluScore * 100).toFixed(0)}%)`,
    log: { level: isErr ? "error" : nluScore < 0.7 ? "warn" : "info" },
    ...(isErr ? { error: { code: "LexError", message: "Lex intent failed", type: "ml" } } : {}),
  };
}

function generateLookoutMetricsLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const detector = rand([
    "revenue-anomaly",
    "traffic-spike-detector",
    "error-rate-monitor",
    "latency-outlier",
    "conversion-drop",
  ]);
  const metric = rand([
    "revenue",
    "page_views",
    "error_rate",
    "p99_latency",
    "conversion_rate",
    "api_calls",
  ]);
  const severity = isErr ? rand(["HIGH", "MEDIUM"]) : rand(["LOW", "MEDIUM"]);
  const anomalyScore = isErr ? Number(randFloat(70, 99)) : Number(randFloat(0, 40));
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "lookoutmetrics" },
    },
    aws: {
      dimensions: { AnomalyDetector: detector, Metric: metric },
      lookoutmetrics: {
        anomaly_detector_arn: `arn:aws:lookoutmetrics:${region}:${acct.id}:AnomalyDetector:${detector}`,
        anomaly_group_id: randId(36).toLowerCase(),
        metric_name: metric,
        severity,
        anomaly_score: anomalyScore,
        relevant_dates: rand([3, 7, 14, 30]),
        impact_value: Number(randFloat(-50, 200)),
        expected_value: Number(randFloat(100, 10000)),
        actual_value: Number(randFloat(50, 15000)),
        dimension: rand([
          { region: "us-east-1" },
          { service: "checkout" },
          { environment: "prod" },
        ]),
        sensitivity: rand(["LOW", "MEDIUM", "HIGH"]),
        action_taken: isErr ? rand(["SNS_ALERT", "LAMBDA_TRIGGER"]) : null,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.lookoutmetrics",
      provider: "lookoutmetrics.amazonaws.com",
    },
    message: isErr
      ? `Lookout for Metrics ANOMALY [${detector}]: ${metric} score=${anomalyScore.toFixed(0)} [${severity}]`
      : `Lookout for Metrics [${detector}]: ${metric} anomaly_score=${anomalyScore.toFixed(0)}`,
    log: { level: isErr ? "warn" : "info" },
    ...(isErr
      ? {
          error: {
            code: "AnomalyDetected",
            message: "Lookout for Metrics anomaly",
            type: "process",
          },
        }
      : {}),
  };
}

function generateQBusinessLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const appId = `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`.toLowerCase();
  const appName = rand([
    "company-assistant",
    "dev-help",
    "hr-bot",
    "support-assistant",
    "it-helpdesk",
  ]);
  const user = rand(["alice", "bob", "carol", "dan", "eve", "svc-account"]);
  const eventType = rand([
    "QUERY",
    "QUERY",
    "DOCUMENT_RETRIEVAL",
    "PLUGIN_INVOCATION",
    "FEEDBACK",
    "CONVERSATION_START",
  ]);
  const conversationId = randUUID();
  const inputTokens = randInt(20, 500);
  const outputTokens = eventType === "QUERY" ? (isErr ? 0 : randInt(50, 800)) : 0;
  const retrievedDocs =
    eventType === "DOCUMENT_RETRIEVAL" ? randInt(0, 10) : eventType === "QUERY" ? randInt(0, 5) : 0;
  const pluginName =
    eventType === "PLUGIN_INVOCATION" ? rand(["Jira", "ServiceNow", "Salesforce", "GitHub"]) : null;
  const guardrailBlocked = Math.random() < 0.05;
  const latencyMs = randInt(100, isErr ? 30000 : 5000);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "qbusiness" },
    },
    aws: {
      dimensions: { ApplicationId: appId },
      qbusiness: {
        application_id: appId,
        application_name: appName,
        conversation_id: conversationId,
        message_id: randUUID(),
        user_id: user,
        event_type: eventType,
        response_latency_ms: latencyMs,
        ...(eventType === "QUERY" || eventType === "DOCUMENT_RETRIEVAL"
          ? {
              query: {
                input_token_count: inputTokens,
                output_token_count: outputTokens,
                retrieved_documents: retrievedDocs,
                source_attributions: retrievedDocs,
                guardrail_action: guardrailBlocked ? "BLOCKED" : "NONE",
              },
            }
          : {}),
        ...(eventType === "PLUGIN_INVOCATION"
          ? {
              plugin: {
                name: pluginName,
                action: rand(["CreateTicket", "SearchIssues", "UpdateRecord", "ListRecords"]),
                success: !isErr,
              },
            }
          : {}),
        metrics: {
          ConversationCount: { sum: 1 },
          MessageCount: { sum: 1 },
          InputTokenCount: { sum: inputTokens },
          OutputTokenCount: { sum: outputTokens },
          FailedResponses: { sum: isErr ? 1 : 0 },
          GuardrailIntervened: { sum: guardrailBlocked ? 1 : 0 },
          DocumentsRetrieved: { sum: retrievedDocs },
        },
      },
    },
    user: { name: user },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.qbusiness",
      provider: "qbusiness.amazonaws.com",
      duration: latencyMs * 1e6,
    },
    message: isErr
      ? `Q Business ${appName}: ${eventType} FAILED for ${user}`
      : `Q Business ${appName}: ${user} ${eventType.toLowerCase()} (${retrievedDocs} docs retrieved)`,
    log: { level: isErr ? "error" : guardrailBlocked ? "warn" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "InternalServerException",
              "ThrottlingException",
              "ValidationException",
              "AccessDeniedException",
            ]),
            message: "Q Business operation failed",
            type: "ai",
          },
        }
      : {}),
  };
}

function generateKendraLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const indexName = rand([
    "hr-docs",
    "legal-kb",
    "product-catalog",
    "support-articles",
    "company-wiki",
  ]);
  const indexId = `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`.toLowerCase();
  const action = rand([
    "QueryIndex",
    "BatchPutDocument",
    "CreateDataSource",
    "StartDataSourceSyncJob",
    "SyncJobSucceeded",
    "SyncJobFailed",
  ]);
  const queryId = randUUID
    ? randUUID()
    : `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`;
  const queryText = rand([
    "how to reset password",
    "onboarding policy",
    "product return policy",
    "escalation process",
    "configure SSO",
  ]);
  const resultCount = isErr ? 0 : randInt(0, 20);
  const responseTimeMs = randInt(50, isErr ? 10000 : 1500);
  const relevanceScore = isErr ? 0 : Number(randFloat(0.3, 0.99));
  const dsType = rand(["S3", "Confluence", "SharePoint", "Salesforce", "ServiceNow"]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "kendra" },
    },
    aws: {
      dimensions: { IndexId: indexId, Operation: action },
      kendra: {
        index_id: indexId,
        index_name: indexName,
        query_id: action === "QueryIndex" ? queryId : null,
        query_text: action === "QueryIndex" ? queryText : null,
        result_count: resultCount,
        response_time_ms: responseTimeMs,
        relevance_score: action === "QueryIndex" ? relevanceScore : null,
        document_count: randInt(100, 500000),
        data_source_id: `ds-${randId(10).toLowerCase()}`,
        data_source_type: dsType,
      },
    },
    log: { level: isErr ? "error" : "info" },
    event: {
      action,
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.kendra",
      provider: "kendra.amazonaws.com",
      duration: responseTimeMs * 1e6,
    },
    message: isErr
      ? `Kendra ${action} FAILED [${indexName}]: ${rand(["Index not found", "Access denied", "Throttled", "Service unavailable"])}`
      : `Kendra ${action}: index=${indexName}${action === "QueryIndex" ? `, results=${resultCount}, score=${relevanceScore.toFixed(2)}` : ""}`,
    ...(isErr
      ? {
          error: {
            code: rand([
              "ResourceNotFoundException",
              "AccessDeniedException",
              "ThrottlingException",
              "InternalServerException",
            ]),
            message: "Kendra operation failed",
            type: "search",
          },
        }
      : {}),
  };
}

function generateA2iLog(ts: string, er: number) {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const flowType = rand([
    "fraud-review",
    "id-verification",
    "content-moderation",
    "medical-review",
  ]);
  const flowDefArn = `arn:aws:sagemaker:${region}:${acct.id}:flow-definition/${flowType}`;
  const loopName = `loop-${randId(12).toLowerCase()}`;
  const action = rand([
    "CreateHumanLoop",
    "StopHumanLoop",
    "HumanLoopCompleted",
    "ConditionThresholdBreached",
    "TaskTimedOut",
  ]);
  const confidence = Number(randFloat(0.6, 0.99));
  const threshold = 0.85;
  const thresholdBreach = confidence < threshold;
  const reviewerCount = randInt(1, 5);
  const taskCount = randInt(1, reviewerCount);
  const statusMap = {
    CreateHumanLoop: "InProgress",
    StopHumanLoop: "Stopped",
    HumanLoopCompleted: "Completed",
    ConditionThresholdBreached: "InProgress",
    TaskTimedOut: "Failed",
  };
  const loopStatus = isErr ? "Failed" : statusMap[action as keyof typeof statusMap] || "InProgress";
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "a2i" },
    },
    aws: {
      dimensions: { FlowDefinitionArn: flowDefArn, Operation: action },
      a2i: {
        flow_definition_arn: flowDefArn,
        human_loop_name: loopName,
        human_loop_status: loopStatus,
        input_content_type: rand(["application/json", "image/jpeg", "image/png"]),
        condition_threshold: threshold,
        human_review_required: thresholdBreach || action === "ConditionThresholdBreached",
        reviewer_count: reviewerCount,
        task_count: taskCount,
        task_completed: isErr ? 0 : taskCount,
        confidence_threshold_breach: thresholdBreach,
      },
    },
    log: {
      level: isErr ? "error" : action === "TaskTimedOut" || thresholdBreach ? "warn" : "info",
    },
    event: {
      action,
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.a2i",
      provider: "sagemaker.amazonaws.com",
    },
    message: isErr
      ? `A2I ${action} FAILED [${loopName}]: ${rand(["Loop not found", "Task timed out", "Access denied"])}`
      : `A2I ${action}: loop=${loopName}, status=${loopStatus}${thresholdBreach ? `, confidence=${confidence.toFixed(2)}<${threshold} REVIEW REQUIRED` : ""}`,
    ...(isErr
      ? {
          error: {
            code: rand(["ResourceNotFoundException", "ValidationException", "ThrottlingException"]),
            message: "A2I human loop failed",
            type: "process",
          },
        }
      : {}),
  };
}

function generateHealthLakeLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const datastoreId =
    `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`.toLowerCase();
  const datastoreName = rand([
    "patient-records",
    "clinical-trials",
    "ehr-primary",
    "diagnostics-lake",
    "pharmacy-db",
  ]);
  const resourceType = rand([
    "Patient",
    "Observation",
    "Condition",
    "MedicationRequest",
    "Encounter",
    "DiagnosticReport",
  ]);
  const action = rand([
    "CreateResource",
    "ReadResource",
    "SearchWithGet",
    "StartFHIRImportJob",
    "StartFHIRExportJob",
    "DeleteResource",
  ]);
  const responseCode = isErr ? rand([400, 403, 404, 500, 503]) : 200;
  const latencyMs = randInt(10, isErr ? 5000 : 500);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "healthlake" },
    },
    aws: {
      dimensions: { DatastoreId: datastoreId, ResourceType: resourceType },
      healthlake: {
        datastore_id: datastoreId,
        datastore_name: datastoreName,
        resource_type: resourceType,
        operation: action,
        request_id: `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`,
        response_code: responseCode,
        import_job_id:
          action === "StartFHIRImportJob" ? `import-${randId(12).toLowerCase()}` : null,
        export_job_id:
          action === "StartFHIRExportJob" ? `export-${randId(12).toLowerCase()}` : null,
        fhir_version: "R4",
      },
    },
    log: { level: isErr ? "error" : "info" },
    event: {
      action,
      outcome: isErr ? "failure" : "success",
      category: ["process", "database"],
      dataset: "aws.healthlake",
      provider: "healthlake.amazonaws.com",
      duration: latencyMs * 1e6,
    },
    message: isErr
      ? `HealthLake ${action} FAILED [${datastoreName}/${resourceType}]: HTTP ${responseCode} - ${rand(["Resource not found", "Access denied", "Invalid FHIR resource", "Service unavailable"])}`
      : `HealthLake ${action}: datastore=${datastoreName}, resource=${resourceType}, ${latencyMs}ms`,
    ...(isErr
      ? {
          error: {
            code: rand([
              "ResourceNotFoundException",
              "AccessDeniedException",
              "ValidationException",
              "InternalServerException",
            ]),
            message: "HealthLake FHIR operation failed",
            type: "database",
          },
        }
      : {}),
  };
}

function generateNovaLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const NOVA_MODELS = [
    { id: "amazon.nova-micro-v1:0", tier: "micro", maxOut: 5120 },
    { id: "amazon.nova-lite-v1:0", tier: "lite", maxOut: 5120 },
    { id: "amazon.nova-pro-v1:0", tier: "pro", maxOut: 5120 },
    { id: "amazon.nova-premier-v1:0", tier: "premier", maxOut: 10240 },
  ];
  const model = rand(NOVA_MODELS);
  const modality = rand(["text", "text", "text", "image", "document"]);
  const inputTokens = randInt(50, 10000);
  const outputTokens = isErr ? 0 : Math.min(randInt(50, 3000), model.maxOut);
  const cacheReadTokens = Math.random() < 0.3 ? randInt(100, inputTokens) : 0;
  const isStreaming = Math.random() < 0.5;
  const latMs =
    model.tier === "micro"
      ? randInt(50, isErr ? 5000 : 1500)
      : model.tier === "premier"
        ? randInt(300, isErr ? 30000 : 8000)
        : randInt(100, isErr ? 10000 : 3000);
  const ttftMs = isStreaming ? randInt(30, 400) : null;
  const throughputTokensPerSec =
    isStreaming && !isErr ? parseFloat((outputTokens / (latMs / 1000)).toFixed(1)) : null;
  const useCase = rand([
    "text-generation",
    "summarization",
    "code-generation",
    "document-qa",
    "image-understanding",
    "agentic-reasoning",
  ]);
  const guardrail = rand(["NONE", "NONE", "NONE", "NONE", "INTERVENED"]);
  const errorCode = rand([
    "ThrottlingException",
    "ModelTimeoutException",
    "ValidationException",
    "ContextWindowExceededException",
  ]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "bedrock" },
    },
    aws: {
      dimensions: { ModelId: model.id, ModelTier: model.tier },
      nova: {
        model_id: model.id,
        model_tier: model.tier,
        modality,
        input_token_count: inputTokens,
        output_token_count: outputTokens,
        cache_read_input_token_count: cacheReadTokens,
        total_token_count: inputTokens + outputTokens,
        invocation_latency_ms: latMs,
        time_to_first_token_ms: ttftMs,
        throughput_tokens_per_sec: throughputTokensPerSec,
        streaming: isStreaming,
        use_case: useCase,
        guardrail_action: guardrail,
        stop_reason: isErr ? null : rand(["end_turn", "max_tokens", "stop_sequence"]),
        error_code: isErr ? errorCode : null,
        metrics: {
          Invocations: { sum: randInt(1, 1000) },
          InvocationLatency: { avg: latMs, p99: Math.round(latMs * 2.5) },
          InputTokenCount: { sum: inputTokens },
          OutputTokenCount: { sum: outputTokens },
          CacheReadInputTokenCount: { sum: cacheReadTokens },
          Throttles: { sum: isErr ? randInt(1, 50) : 0 },
        },
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.nova",
      provider: "bedrock.amazonaws.com",
      duration: latMs * 1e6,
    },
    message: isErr
      ? `Nova ${model.tier} [${model.id}] FAILED: ${errorCode}`
      : `Nova ${model.tier} ${inputTokens}->${outputTokens} tokens ${(latMs / 1000).toFixed(2)}s${cacheReadTokens ? ` (${cacheReadTokens} cache hits)` : ""}`,
    log: { level: isErr ? "error" : latMs > 5000 ? "warn" : "info" },
    ...(isErr
      ? { error: { code: errorCode, message: `Nova model invocation failed`, type: "ml" } }
      : {}),
  };
}

function generateLookoutVisionLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const projectName = rand([
    "circuit-board-inspection",
    "bottle-cap-defect",
    "weld-quality-check",
    "pcb-solder-inspection",
    "fabric-anomaly-detector",
    "turbine-blade-check",
  ]);
  const modelVersion = `${randInt(1, 5)}.0`;
  const modelArn = `arn:aws:lookoutvision:${region}:${acct.id}:model/${projectName}/${modelVersion}`;
  const eventType = rand([
    "DetectAnomalies",
    "StartModelPackagingJob",
    "StartModelTrainingJob",
    "StopModel",
    "StartModel",
    "DescribeModelPackagingJob",
  ]);
  const isAnomaly = isErr ? true : Math.random() < 0.08;
  const confidence = isAnomaly ? Number(randFloat(0.65, 0.99)) : Number(randFloat(0.88, 1.0));
  const inferenceMs = randInt(20, isErr ? 5000 : 300);
  const imageSource = rand(["s3", "camera-stream", "local-file"]);
  const imageKey = `inspections/${projectName}/${randId(12).toLowerCase()}.jpg`;
  const anomalyMask = isAnomaly
    ? `s3://lookoutvision-masks-${acct.id}/${projectName}/${randId(8).toLowerCase()}.png`
    : null;
  const anomalyLabel = isAnomaly
    ? rand([
        "scratch",
        "dent",
        "crack",
        "missing-component",
        "solder-bridge",
        "delamination",
        "foreign-object",
      ])
    : null;
  const trainingStatus = eventType.includes("Training")
    ? rand(["TRAINED", "TRAINING", "TRAINING_FAILED"])
    : null;
  const f1Score = trainingStatus === "TRAINED" ? Number(randFloat(0.92, 0.999)) : null;
  const recall = f1Score ? Number(randFloat(0.9, 0.999)) : null;
  const precision = f1Score ? Number(randFloat(0.91, 0.999)) : null;
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "lookoutvision" },
    },
    aws: {
      dimensions: { ProjectName: projectName, ModelVersion: modelVersion },
      lookoutvision: {
        project_name: projectName,
        model_version: modelVersion,
        model_arn: modelArn,
        event_type: eventType,
        image_source: imageSource,
        image_key: imageSource === "s3" ? imageKey : null,
        is_anomalous: isAnomaly,
        confidence,
        anomaly_label: anomalyLabel,
        anomaly_mask_uri: anomalyMask,
        inference_latency_ms: eventType === "DetectAnomalies" ? inferenceMs : null,
        training: trainingStatus
          ? {
              status: trainingStatus,
              f1_score: f1Score,
              recall,
              precision,
            }
          : null,
        error_code: isErr
          ? rand([
              "ResourceNotFoundException",
              "ServiceQuotaExceededException",
              "ThrottlingException",
              "InternalServerException",
            ])
          : null,
      },
    },
    event: {
      outcome: isErr ? "failure" : isAnomaly ? "success" : "success",
      category: ["process"],
      dataset: "aws.lookoutvision",
      provider: "lookoutvision.amazonaws.com",
      duration: inferenceMs * 1e6,
    },
    message: isErr
      ? `Lookout for Vision [${projectName} v${modelVersion}] ${eventType} FAILED: ${rand(["Model not running", "Quota exceeded", "Invalid image format"])}`
      : isAnomaly
        ? `Lookout for Vision [${projectName}] ANOMALY DETECTED: ${anomalyLabel} confidence=${confidence.toFixed(3)}`
        : `Lookout for Vision [${projectName}] OK confidence=${confidence.toFixed(3)} ${inferenceMs}ms`,
    log: { level: isErr ? "error" : isAnomaly ? "warn" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand(["ResourceNotFoundException", "ServiceQuotaExceededException"]),
            message: `Lookout for Vision operation failed`,
            type: "process",
          },
        }
      : {}),
  };
}

function generateHealthOmicsLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const workflowId = `wfl-${randId(10).toLowerCase()}`;
  const runId = `run-${randId(10).toLowerCase()}`;
  const workflowType = rand(["READY2RUN", "PRIVATE"]);
  const engine = rand(["WDL", "CWL", "NEXTFLOW"]);
  const runStatus = isErr ? "FAILED" : rand(["COMPLETED", "RUNNING", "COMPLETED"]);
  const tasksCompleted = isErr ? randInt(0, 10) : randInt(1, 200);
  const tasksFailed = isErr ? randInt(1, 10) : 0;
  const storageGbUsed = Number(randFloat(1, 5000));
  const errorCode = rand(["WorkflowRunFailed", "StorageCapacityExceeded"]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "omics" },
    },
    aws: {
      dimensions: { WorkflowId: workflowId, RunId: runId },
      healthomics: {
        workflow_id: workflowId,
        run_id: runId,
        workflow_type: workflowType,
        engine,
        run_status: runStatus,
        metrics: {
          tasks_completed: tasksCompleted,
          tasks_failed: tasksFailed,
          storage_gb_used: storageGbUsed,
        },
        error_code: isErr ? errorCode : null,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.healthomics",
      provider: "omics.amazonaws.com",
      duration: randInt(60, isErr ? 7200 : 86400) * 1e9,
    },
    data_stream: { type: "logs", dataset: "aws.healthomics", namespace: "default" },
    message: isErr
      ? `HealthOmics workflow ${workflowId} run ${runId}: ${errorCode} (${engine})`
      : `HealthOmics workflow ${workflowId}: status=${runStatus}, tasks=${tasksCompleted}, storage=${storageGbUsed.toFixed(1)}GB`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: errorCode,
            message: `HealthOmics workflow run ${runId} failed`,
            type: "process",
          },
        }
      : {}),
  };
}

function generateBedrockDataAutomationLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const projectId = `proj-${randId(8).toLowerCase()}`;
  const invocationId = `inv-${randId(10).toLowerCase()}`;
  const inputType = rand(["pdf", "image", "video", "audio"]);
  const blueprintId = `bp-${randId(8).toLowerCase()}`;
  const status = isErr ? "Failed" : rand(["Success", "PartialSuccess", "Success"]);
  const pagesProcessed = isErr ? 0 : randInt(1, 500);
  const tokensUsed = isErr ? 0 : randInt(100, 100000);
  const confidenceScore = isErr ? 0 : Number(randFloat(0.5, 1.0));
  const errorCode = rand(["ExtractionFailed", "BlueprintMismatch"]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "bedrock-data-automation" },
    },
    aws: {
      dimensions: { ProjectId: projectId, InvocationId: invocationId },
      bedrockdataautomation: {
        project_id: projectId,
        invocation_id: invocationId,
        input_type: inputType,
        blueprint_id: blueprintId,
        status,
        metrics: {
          pages_processed: pagesProcessed,
          tokens_used: tokensUsed,
          confidence_score: confidenceScore,
        },
        error_code: isErr ? errorCode : null,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.bedrockdataautomation",
      provider: "bedrock-data-automation.amazonaws.com",
      duration: randInt(100, isErr ? 30000 : 5000) * 1e6,
    },
    data_stream: { type: "logs", dataset: "aws.bedrockdataautomation", namespace: "default" },
    message: isErr
      ? `Bedrock Data Automation project ${projectId}: ${errorCode} for ${inputType} input`
      : `Bedrock Data Automation project ${projectId}: ${status}, pages=${pagesProcessed}, tokens=${tokensUsed}, confidence=${confidenceScore.toFixed(3)}`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: errorCode,
            message: `Bedrock Data Automation extraction failed for project ${projectId}`,
            type: "process",
          },
        }
      : {}),
  };
}

// ─── Lookout for Equipment ────────────────────────────────────────────────
function generateLookoutEquipmentLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const models = [
    "turbine-vibration-model",
    "compressor-health",
    "pump-anomaly-detector",
    "hvac-efficiency",
  ];
  const model = rand(models);
  const events = [
    "InferenceExecution",
    "CreateModel",
    "StartInferenceScheduler",
    "ImportDataset",
    "DescribeModel",
  ];
  const ev = rand(events);
  const sensors = ["vibration_x", "vibration_y", "temperature", "pressure", "flow_rate", "rpm"];
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "lookoutequipment" },
    },
    aws: {
      lookoutequipment: {
        model_name: model,
        event_type: ev,
        inference_scheduler: `${model}-scheduler`,
        anomaly_detected: isErr,
        anomalous_sensors: isErr ? [rand(sensors), rand(sensors)] : [],
        diagnostics_score: randFloat(0, 1),
        data_points_ingested: randInt(100, 50000),
        inference_latency_ms: randInt(50, isErr ? 5000 : 500),
        dataset_arn: `arn:aws:lookoutequipment:${region}:${acct.id}:dataset/${model}-data`,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(5e4, 5e6) },
    message: isErr
      ? `Lookout Equipment ${model}: anomaly detected in ${rand(sensors)}`
      : `Lookout Equipment ${model}: ${ev} completed normally`,
  };
}

// ─── Amazon Monitron ──────────────────────────────────────────────────────
function generateMonitronLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const projects = ["factory-floor-A", "warehouse-hvac", "production-line-3", "motor-bank"];
  const project = rand(projects);
  const sensors = ["sensor-001", "sensor-002", "sensor-003", "sensor-004", "sensor-005"];
  const sensor = rand(sensors);
  const positions = ["bearing_1", "bearing_2", "gearbox", "motor_drive_end", "motor_non_drive_end"];
  const conditions = isErr ? ["ALARM", "WARNING"] : ["HEALTHY", "HEALTHY", "WARNING"];
  const condition = rand(conditions);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "monitron" },
    },
    aws: {
      monitron: {
        project_name: project,
        sensor_id: sensor,
        position: rand(positions),
        machine_condition: condition,
        vibration_iso_rms: randFloat(0.1, isErr ? 25 : 4),
        temperature_celsius: randFloat(20, isErr ? 95 : 60),
        vibration_x_peak: randFloat(0.01, isErr ? 30 : 5),
        vibration_z_peak: randFloat(0.01, isErr ? 25 : 4),
        gateway_id: `gw-${randId(6).toLowerCase()}`,
        battery_level_pct: randInt(10, 100),
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e4, 1e5) },
    message: isErr
      ? `Monitron ${project}/${sensor}: ${condition} — vibration/temperature anomaly`
      : `Monitron ${project}/${sensor}: ${condition} (temp ${randFloat(20, 50).toFixed(1)}°C)`,
  };
}

export {
  generateSageMakerLog,
  generateBedrockLog,
  generateBedrockAgentLog,
  generateRekognitionLog,
  generateTextractLog,
  generateComprehendLog,
  generateComprehendMedicalLog,
  generateTranslateLog,
  generateTranscribeLog,
  generatePollyLog,
  generateForecastLog,
  generatePersonalizeLog,
  generateLexLog,
  generateLookoutMetricsLog,
  generateQBusinessLog,
  generateKendraLog,
  generateA2iLog,
  generateHealthLakeLog,
  generateNovaLog,
  generateLookoutVisionLog,
  generateHealthOmicsLog,
  generateBedrockDataAutomationLog,
  generateLookoutEquipmentLog,
  generateMonitronLog,
};
