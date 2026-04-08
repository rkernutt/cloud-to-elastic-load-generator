/**
 * GCP AI/ML log generators (Vertex AI, Gemini, Vision, NL, Speech, Dialogflow, etc.).
 */

import {
  type EcsDocument,
  rand,
  randInt,
  randId,
  randFloat,
  gcpCloud,
  makeGcpSetup,
  randLatencyMs,
} from "./helpers.js";

const ACCELERATORS = [
  "NVIDIA_TESLA_T4",
  "NVIDIA_TESLA_A100",
  "NVIDIA_L4",
  "NVIDIA_H100",
  "TPU_V4",
  "TPU_V5E",
] as const;

const VERTEX_MACHINE_TYPES = [
  "n1-standard-4",
  "n1-highmem-8",
  "a2-highgpu-1g",
  "g2-standard-4",
  "e2-standard-8",
] as const;

export function generateVertexAiLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const predictionType = rand(["online", "batch"] as const);
  const isTraining = Math.random() < 0.25;
  const latencyMs = randLatencyMs(randInt(40, 800), isErr);
  const message = isErr
    ? `Vertex AI ${predictionType} prediction failed for endpoint ${randId(6)}: ${rand(["Model unavailable", "Quota exceeded", "Invalid input tensor shape", "Deadline exceeded"])}`
    : `Vertex AI ${predictionType} prediction completed (${randInt(1, 64)} instances, ${latencyMs}ms)`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "aiplatform.googleapis.com"),
    gcp: {
      vertex_ai: {
        endpoint_id: `ep-${randId(8).toLowerCase()}`,
        model_name: rand(["tabular-classifier", "image-embedder", "text-bison", "chirp"]),
        model_version: `v${randInt(1, 12)}`,
        prediction_type: predictionType,
        instances_count: randInt(1, 128),
        latency_ms: latencyMs,
        training_job_id: isTraining ? `train-${randId(10).toLowerCase()}` : null,
        training_state: isTraining ? rand(["RUNNING", "SUCCEEDED", "FAILED", "CANCELLING"]) : null,
        accelerator_type: rand(ACCELERATORS),
        machine_type: rand(VERTEX_MACHINE_TYPES),
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: latencyMs * randInt(1, 4),
    },
    message,
  };
}

export function generateGeminiLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const model = rand(["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0"] as const);
  const promptTokens = randInt(120, 8192);
  const candidatesTokens = randInt(32, 4096);
  const totalTokens = promptTokens + candidatesTokens;
  const finishReason = isErr ? rand(["MAX_TOKENS", "SAFETY", "OTHER"]) : "STOP";
  const latencyMs = randLatencyMs(randInt(200, 2500), isErr);
  const safetyRatings = [
    { category: "HARM_CATEGORY_HARASSMENT", probability: rand(["NEGLIGIBLE", "LOW", "MEDIUM"]) },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", probability: rand(["NEGLIGIBLE", "LOW"]) },
  ];
  const message = isErr
    ? `Gemini generation blocked for ${model}: finish_reason=${finishReason}; ${rand(["Safety filter triggered", "Token limit reached", "Upstream model error"])}`
    : `Gemini ${model} generation completed (${totalTokens} tokens, ${latencyMs}ms, grounding=${Math.random() < 0.35})`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "generativelanguage.googleapis.com"),
    gcp: {
      gemini: {
        model,
        prompt_token_count: promptTokens,
        candidates_token_count: candidatesTokens,
        total_token_count: totalTokens,
        finish_reason: finishReason,
        safety_ratings: safetyRatings,
        latency_ms: latencyMs,
        grounding_used: !isErr && Math.random() < 0.35,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: latencyMs,
    },
    message,
  };
}

export function generateVisionAiLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const features = rand([
    "LABEL_DETECTION",
    "TEXT_DETECTION",
    "FACE_DETECTION",
    "OBJECT_LOCALIZATION",
    "SAFE_SEARCH_DETECTION",
  ] as const);
  const labelsDetected = randInt(isErr ? 0 : 3, 40);
  const confidenceMax = isErr ? randFloat(0.1, 0.45) : randFloat(0.72, 0.99);
  const latencyMs = randLatencyMs(randInt(80, 600), isErr);
  const imageUri = `gs://${project.id}-assets/vision/${randId(8).toLowerCase()}.jpg`;
  const message = isErr
    ? `Vision API ${features} failed for ${imageUri}: ${rand(["Invalid image format", "Image too large", "Permission denied on bucket"])}`
    : `Vision API ${features} found ${labelsDetected} labels (max confidence ${confidenceMax.toFixed(3)}) in ${latencyMs}ms`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "vision.googleapis.com"),
    gcp: {
      vision_ai: {
        image_uri: imageUri,
        features,
        labels_detected: labelsDetected,
        confidence_max: Math.round(confidenceMax * 1000) / 1000,
        latency_ms: latencyMs,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: latencyMs,
    },
    message,
  };
}

export function generateNaturalLanguageLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const operation = rand([
    "analyzeSentiment",
    "analyzeEntities",
    "classifyText",
    "analyzeSyntax",
  ] as const);
  const textLength = randInt(40, 12000);
  const languageDetected = rand(["en", "es", "de", "fr", "ja", "pt", "it"]);
  const entitiesCount = randInt(0, 80);
  const sentimentScore = isErr ? 0 : randFloat(-1, 1);
  const magnitude = randFloat(0, 6);
  const message = isErr
    ? `Natural Language ${operation} failed (${textLength} chars): ${rand(["Unsupported language", "Document too large", "Internal error"])}`
    : `Natural Language ${operation} completed: lang=${languageDetected}, entities=${entitiesCount}, score=${sentimentScore.toFixed(2)}`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "language.googleapis.com"),
    gcp: {
      natural_language: {
        text_length: textLength,
        operation,
        language_detected: languageDetected,
        entities_count: entitiesCount,
        sentiment_score: Math.round(sentimentScore * 1000) / 1000,
        magnitude: Math.round(magnitude * 1000) / 1000,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(30, isErr ? 8000 : 1200),
    },
    message,
  };
}

export function generateTranslationLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const sourceLanguage = rand(["en", "es", "de", "ja", "zh", "fr"]);
  const targetLanguage = rand(["en", "es", "de", "ja", "pt", "ko"]);
  const model = rand(["nmt", "base"] as const);
  const charactersTranslated = randInt(50, 50000);
  const glossaryUsed = Math.random() < 0.2;
  const latencyMs = randLatencyMs(randInt(25, 400), isErr);
  const message = isErr
    ? `Translate API failed ${sourceLanguage}->${targetLanguage}: ${rand(["Invalid glossary", "Quota exceeded", "Bad request"])}`
    : `Translated ${charactersTranslated} characters (${sourceLanguage}->${targetLanguage}, model=${model}, glossary=${glossaryUsed}) in ${latencyMs}ms`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "translate.googleapis.com"),
    gcp: {
      translation: {
        source_language: sourceLanguage,
        target_language: targetLanguage,
        model,
        characters_translated: charactersTranslated,
        glossary_used: glossaryUsed,
        latency_ms: latencyMs,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: latencyMs,
    },
    message,
  };
}

export function generateSpeechToTextLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const encoding = rand(["FLAC", "LINEAR16", "MULAW", "OGG_OPUS"] as const);
  const model = rand(["latest_long", "latest_short", "phone_call"] as const);
  const audioDurationSeconds = randFloat(0.5, 3600);
  const alternativesCount = randInt(1, 5);
  const confidence = isErr ? randFloat(0.2, 0.55) : randFloat(0.82, 0.99);
  const wordCount = randInt(0, isErr ? 40 : 800);
  const message = isErr
    ? `Speech-to-Text ${model} failed (${encoding}): ${rand(["Audio corrupted", "No speech detected", "Encoding mismatch"])}`
    : `Speech-to-Text recognized ${wordCount} words (${audioDurationSeconds.toFixed(1)}s audio, confidence ${confidence.toFixed(2)})`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "speech.googleapis.com"),
    gcp: {
      speech_to_text: {
        audio_duration_seconds: Math.round(audioDurationSeconds * 100) / 100,
        encoding,
        language_code: rand(["en-US", "en-GB", "es-ES", "de-DE", "ja-JP"]),
        model,
        alternatives_count: alternativesCount,
        confidence: Math.round(confidence * 1000) / 1000,
        word_count: wordCount,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(100, isErr ? 15000 : 4000),
    },
    message,
  };
}

export function generateTextToSpeechLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const textLength = randInt(20, 8000);
  const voiceName = rand(["en-US-Wavenet-D", "en-GB-Neural2-A", "es-ES-Neural2-C", "de-DE-Wavenet-B"]);
  const audioEncoding = rand(["MP3", "LINEAR16", "OGG_OPUS"] as const);
  const speakingRate = Math.round((0.85 + Math.random() * 0.5) * 100) / 100;
  const pitch = randInt(-6, 6);
  const audioDurationSeconds = isErr ? 0 : randFloat(0.5, textLength / 18);
  const message = isErr
    ? `Text-to-Speech synthesis failed for voice ${voiceName}: ${rand(["SSML parse error", "Voice not found", "Quota exceeded"])}`
    : `Synthesized ${textLength} chars to ${audioEncoding} (${voiceName}, ${audioDurationSeconds.toFixed(1)}s output)`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "texttospeech.googleapis.com"),
    gcp: {
      text_to_speech: {
        text_length: textLength,
        voice_name: voiceName,
        audio_encoding: audioEncoding,
        speaking_rate: speakingRate,
        pitch,
        audio_duration_seconds: Math.round(audioDurationSeconds * 100) / 100,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(50, isErr ? 6000 : 1500),
    },
    message,
  };
}

export function generateDialogflowLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const agentName = `agent-${rand(["support", "sales", "faq", "booking"])}-${randId(4).toLowerCase()}`;
  const sessionId = `sess-${randId(12).toLowerCase()}`;
  const intentName = rand(["Default Welcome Intent", "Order.Status", "Handoff.Agent", "SmallTalk.Hello"]);
  const intentConfidence = isErr ? randFloat(0.1, 0.45) : randFloat(0.65, 0.99);
  const queryText = rand(["Track my order", "I need a human", "What are your hours?", "Cancel subscription"]);
  const responseTextLength = randInt(isErr ? 0 : 40, 2000);
  const fulfillmentWebhookCalled = Math.random() < 0.55;
  const sentimentScore = randFloat(-0.4, 0.9);
  const language = rand(["en", "es", "de"]);
  const message = isErr
    ? `Dialogflow session ${sessionId} error on intent "${intentName}": ${rand(["Webhook timeout", "NLU parse failure", "Missing parameter"])}`
    : `Dialogflow matched "${intentName}" (confidence ${intentConfidence.toFixed(2)}) for session ${sessionId}`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "dialogflow.googleapis.com"),
    gcp: {
      dialogflow: {
        agent_name: agentName,
        session_id: sessionId,
        intent_name: intentName,
        intent_confidence: Math.round(intentConfidence * 1000) / 1000,
        query_text: queryText,
        response_text_length: responseTextLength,
        fulfillment_webhook_called: fulfillmentWebhookCalled,
        sentiment_score: Math.round(sentimentScore * 1000) / 1000,
        language,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(80, isErr ? 12000 : 2500),
    },
    message,
  };
}

export function generateDocumentAiLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const processorType = rand(["FORM_PARSER", "OCR", "INVOICE_PARSER", "ID_PROOFING", "EXPENSE_PARSER"] as const);
  const processorName = `${processorType.toLowerCase()}-${randId(6).toLowerCase()}`;
  const documentPages = randInt(1, 120);
  const entitiesExtracted = isErr ? randInt(0, 4) : randInt(5, 400);
  const confidenceAvg = isErr ? randFloat(0.35, 0.62) : randFloat(0.78, 0.97);
  const processingTimeMs = randLatencyMs(randInt(200, 4000), isErr);
  const message = isErr
    ? `Document AI processor ${processorName} failed: ${rand(["Unsupported PDF", "Processor not enabled", "OCR engine error"])}`
    : `Document AI ${processorType} extracted ${entitiesExtracted} entities across ${documentPages} pages (${processingTimeMs}ms)`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "documentai.googleapis.com"),
    gcp: {
      document_ai: {
        processor_name: processorName,
        processor_type: processorType,
        document_pages: documentPages,
        entities_extracted: entitiesExtracted,
        confidence_avg: Math.round(confidenceAvg * 1000) / 1000,
        processing_time_ms: processingTimeMs,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: processingTimeMs,
    },
    message,
  };
}

export function generateRecommendationsAiLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const catalogName = `catalog-${rand(["prod", "media", "fashion"])}-${randId(4).toLowerCase()}`;
  const eventType = rand(["detail-page-view", "add-to-cart", "purchase-complete", "search"] as const);
  const userId = `user_${randId(10)}`;
  const recommendationCount = isErr ? 0 : randInt(4, 24);
  const servingConfig = `servingConfigs/${rand(["default", "trending", "similar-items"])}`;
  const modelId = `model-${randId(8).toLowerCase()}`;
  const message = isErr
    ? `Recommendations AI event ${eventType} failed for catalog ${catalogName}: ${rand(["Catalog item missing", "Invalid user event", "Model not ready"])}`
    : `Recommendations AI returned ${recommendationCount} items for ${eventType} (user ${userId}, ${modelId})`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "retail.googleapis.com"),
    gcp: {
      recommendations_ai: {
        catalog_name: catalogName,
        event_type: eventType,
        user_id: userId,
        recommendation_count: recommendationCount,
        serving_config: servingConfig,
        model_id: modelId,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(20, isErr ? 5000 : 800),
    },
    message,
  };
}

export function generateVertexAiSearchLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const engineName = `search-${rand(["prod", "docs", "commerce"])}-${randId(4).toLowerCase()}`;
  const query = rand(["running shoes", "api authentication", "return policy", "project id format"]);
  const resultsCount = isErr ? 0 : randInt(3, 50);
  const searchType = rand(["SEARCH", "BROWSE", "RECOMMEND"] as const);
  const servingConfig = `projects/${project.id}/locations/global/collections/default_collection/engines/${engineName}/servingConfigs/default_search`;
  const latencyMs = randLatencyMs(randInt(30, 500), isErr);
  const sessionId = `search-${randId(12).toLowerCase()}`;
  const message = isErr
    ? `Vertex AI Search query failed on engine ${engineName}: ${rand(["Invalid filter syntax", "Serving config not found", "Deadline exceeded"])}`
    : `Vertex AI Search ${searchType} returned ${resultsCount} results for "${query}" (${latencyMs}ms)`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "discoveryengine.googleapis.com"),
    gcp: {
      vertex_ai_search: {
        engine_name: engineName,
        query,
        results_count: resultsCount,
        search_type: searchType,
        serving_config: servingConfig,
        latency_ms: latencyMs,
        session_id: sessionId,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: latencyMs,
    },
    message,
  };
}

export function generateAutoMlLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const datasetName = `dataset-${rand(["images", "tabular", "text"])}-${randId(5).toLowerCase()}`;
  const modelName = `model-${randId(8).toLowerCase()}`;
  const operation = rand(["TRAINING", "EVALUATING", "DEPLOYING", "PREDICTING"] as const);
  const status = isErr ? rand(["FAILED", "CANCELLED"]) : rand(["RUNNING", "SUCCEEDED", "QUEUED"]);
  const trainingHours = operation === "TRAINING" || operation === "EVALUATING" ? randFloat(0.5, 48) : 0;
  const evaluationMetricName = rand(["accuracy", "auPRC", "f1_score", "mean_absolute_error"]);
  const evaluationMetricValue = isErr ? randFloat(0.2, 0.55) : randFloat(0.72, 0.98);
  const nodeCount = randInt(1, 32);
  const message = isErr
    ? `AutoML ${operation} for ${modelName} ${status.toLowerCase()}: ${rand(["Insufficient training data", "Label imbalance", "Export failed"])}`
    : `AutoML ${operation} ${status} on ${datasetName} (${nodeCount} workers, metric ${evaluationMetricName}=${evaluationMetricValue.toFixed(3)})`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "automl.googleapis.com"),
    gcp: {
      automl: {
        dataset_name: datasetName,
        model_name: modelName,
        operation,
        status,
        training_hours: Math.round(trainingHours * 100) / 100,
        evaluation_metric_name: evaluationMetricName,
        evaluation_metric_value: Math.round(evaluationMetricValue * 1000) / 1000,
        node_count: nodeCount,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(1000, isErr ? 3_600_000 : 900_000),
    },
    message,
  };
}

export function generateVertexAiWorkbenchLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const instanceName = `wb-${rand(["ml", "data", "research"])}-${randId(5).toLowerCase()}`;
  const machineType = rand(VERTEX_MACHINE_TYPES);
  const framework = rand(["tensorflow", "pytorch", "jax"] as const);
  const gpuType = rand(["NVIDIA_TESLA_T4", "NVIDIA_L4", "NVIDIA_A100", "NONE"] as const);
  const status = isErr ? rand(["PROVISIONING", "STOPPED"] as const) : rand(["ACTIVE", "STOPPED", "PROVISIONING"] as const);
  const idleTimeoutMin = randInt(15, 240);
  const userEmail = rand([`analyst@${project.id.split("-")[0]}.example.com`, `ds@${project.id}.example.com`]);
  const message = isErr
    ? `Vertex AI Workbench ${instanceName} ${status}: ${framework} on ${machineType} failed to start`
    : `Vertex AI Workbench ${instanceName} ${status} (${machineType}, ${gpuType}, ${framework}, idle ${idleTimeoutMin}m)`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "vertex-ai-workbench"),
    gcp: {
      vertex_ai_workbench: {
        instance_name: instanceName,
        machine_type: machineType,
        framework,
        gpu_type: gpuType,
        status,
        idle_timeout_min: idleTimeoutMin,
        user_email: userEmail,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(2000, isErr ? 600_000 : 120_000),
    },
    message,
  };
}

export function generateVertexAiPipelinesLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const pipelineName = `pipeline-${rand(["train", "batch", "deploy"])}-${randId(5).toLowerCase()}`;
  const runId = `run-${randId(12).toLowerCase()}`;
  const componentName = rand(["preprocess", "train", "evaluate", "export_model", "deploy"]);
  const state = isErr ? rand(["FAILED", "RUNNING"] as const) : rand(["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"] as const);
  const inputArtifacts = randInt(1, 12);
  const outputArtifacts = isErr ? randInt(0, 2) : randInt(1, 20);
  const executionTimeSeconds = randInt(isErr ? 30 : 60, isErr ? 7200 : 14_400);
  const message = isErr
    ? `Vertex AI Pipelines ${pipelineName} ${runId} component ${componentName} ${state}`
    : `Vertex AI Pipelines ${pipelineName} ${componentName} ${state} in ${executionTimeSeconds}s (in=${inputArtifacts} out=${outputArtifacts})`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "vertex-ai-pipelines"),
    gcp: {
      vertex_ai_pipelines: {
        pipeline_name: pipelineName,
        run_id: runId,
        component_name: componentName,
        state,
        input_artifacts: inputArtifacts,
        output_artifacts: outputArtifacts,
        execution_time_seconds: executionTimeSeconds,
      },
    },
    event: {
      outcome: isErr || state === "FAILED" || state === "CANCELLED" ? "failure" : "success",
      duration: executionTimeSeconds * 1000,
    },
    message,
  };
}

export function generateVertexAiFeatureStoreLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const featurestoreName = `fs-${rand(["prod", "reco", "fraud"])}-${randId(4).toLowerCase()}`;
  const entityType = rand(["user", "session", "product", "merchant"]);
  const featureName = rand(["click_count_7d", "avg_order_value", "risk_score", "embedding_v2"]);
  const operation = rand(["SERVE", "INGEST", "EXPORT"] as const);
  const onlineServingLatencyMs = randLatencyMs(randInt(2, 80), isErr);
  const featureValuesIngested = isErr ? randInt(0, 500) : randInt(1000, 50_000_000);
  const message = isErr
    ? `Vertex AI Feature Store ${featurestoreName}/${entityType}.${featureName} ${operation} failed (${onlineServingLatencyMs.toFixed(1)}ms)`
    : `Vertex AI Feature Store ${operation} ${featureName} entity=${entityType} latency=${onlineServingLatencyMs.toFixed(1)}ms values=${featureValuesIngested}`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "vertex-ai-feature-store"),
    gcp: {
      vertex_ai_feature_store: {
        featurestore_name: featurestoreName,
        entity_type: entityType,
        feature_name: featureName,
        operation,
        online_serving_latency_ms: onlineServingLatencyMs,
        feature_values_ingested: featureValuesIngested,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: onlineServingLatencyMs * 1000,
    },
    message,
  };
}

export function generateVertexAiMatchingEngineLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const indexName = `idx-${rand(["embed", "prod", "doc"])}-${randId(6).toLowerCase()}`;
  const endpointName = `ep-matching-${randId(5).toLowerCase()}`;
  const operation = rand(["QUERY", "UPSERT", "REMOVE"] as const);
  const dimensions = randInt(128, 768);
  const approximateNeighborsCount = isErr ? randInt(0, 5) : randInt(5, 100);
  const recallRate = isErr ? randFloat(0.4, 0.75) : randFloat(0.85, 0.99);
  const latencyMs = randLatencyMs(randInt(5, 120), isErr);
  const message = isErr
    ? `Vertex AI Matching Engine ${endpointName} ${operation} failed: recall ${recallRate.toFixed(3)}`
    : `Matching Engine ${indexName} ${operation} dim=${dimensions} neighbors=${approximateNeighborsCount} recall=${recallRate.toFixed(3)} ${latencyMs.toFixed(1)}ms`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "vertex-ai-matching-engine"),
    gcp: {
      vertex_ai_matching_engine: {
        index_name: indexName,
        endpoint_name: endpointName,
        operation,
        dimensions,
        approximate_neighbors_count: approximateNeighborsCount,
        recall_rate: Math.round(recallRate * 1000) / 1000,
        latency_ms: latencyMs,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: latencyMs,
    },
    message,
  };
}

export function generateVertexAiTensorBoardLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const experimentName = `exp-${rand(["churn", "vision", "nlp"])}-${randId(4).toLowerCase()}`;
  const runName = `run-${randId(8).toLowerCase()}`;
  const tag = rand(["loss", "accuracy", "learning_rate", "val_auc"]);
  const plugin = rand(["scalars", "images", "histograms", "text"] as const);
  const dataPointsWritten = isErr ? randInt(0, 50) : randInt(100, 5_000_000);
  const storageUsedBytes = isErr ? randInt(1_000, 50_000) : randInt(5_000_000, 8_000_000_000);
  const message = isErr
    ? `Vertex AI TensorBoard ${experimentName}/${runName} write failed for ${tag} (${plugin})`
    : `TensorBoard ${experimentName} ${runName} wrote ${dataPointsWritten} points (${plugin}/${tag}, ${storageUsedBytes} bytes)`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "vertex-ai-tensorboard"),
    gcp: {
      vertex_ai_tensorboard: {
        experiment_name: experimentName,
        run_name: runName,
        tag,
        plugin,
        data_points_written: dataPointsWritten,
        storage_used_bytes: storageUsedBytes,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(500, isErr ? 120_000 : 30_000),
    },
    message,
  };
}

export function generateContactCenterAiLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const projectName = project.id;
  const conversationId = `conv-${randId(12).toLowerCase()}`;
  const agentType = rand(["VIRTUAL", "HUMAN"] as const);
  const sentimentScore = isErr ? randFloat(-0.8, -0.1) : randFloat(-0.2, 0.9);
  const intentName = rand(["billing.support", "order.status", "escalate.agent", "faq.hours"]);
  const turnCount = isErr ? randInt(1, 4) : randInt(3, 40);
  const csatScore = isErr ? randInt(1, 5) : randInt(3, 5);
  const transferToHuman = isErr || (agentType === "VIRTUAL" && Math.random() < 0.25);
  const message = isErr
    ? `Contact Center AI ${conversationId} ${agentType}: low sentiment ${sentimentScore.toFixed(2)} transfer=${transferToHuman}`
    : `Contact Center AI ${conversationId} intent=${intentName} turns=${turnCount} CSAT=${csatScore}`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "contact-center-ai"),
    gcp: {
      contact_center_ai: {
        project_name: projectName,
        conversation_id: conversationId,
        agent_type: agentType,
        sentiment_score: Math.round(sentimentScore * 1000) / 1000,
        intent_name: intentName,
        turn_count: turnCount,
        csat_score: csatScore,
        transfer_to_human: transferToHuman,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(2000, isErr ? 300_000 : 90_000),
    },
    message,
  };
}

export function generateHealthcareApiLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const datasetName = `healthcare-${rand(["dicom", "fhir", "hl7"])}-${randId(4).toLowerCase()}`;
  const storeType = rand(["FHIR", "HL7v2", "DICOM"] as const);
  const operation = rand(["CREATE", "READ", "SEARCH", "IMPORT", "EXPORT", "DEIDENTIFY"] as const);
  const resourceType = rand(["Patient", "Observation", "ImagingStudy", "Message", "Study"]);
  const resourcesAffected = isErr ? randInt(0, 2) : randInt(1, 5000);
  const consentEnforcement = rand(["ENFORCED", "NOT_REQUIRED", "DEFERRED"] as const);
  const message = isErr
    ? `Healthcare API ${operation} on ${storeType} store ${datasetName} failed: consent ${consentEnforcement}`
    : `Healthcare API ${operation} ${resourceType} x${resourcesAffected} (${storeType}, ${consentEnforcement})`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "healthcare-api"),
    gcp: {
      healthcare_api: {
        dataset_name: datasetName,
        store_type: storeType,
        operation,
        resource_type: resourceType,
        resources_affected: resourcesAffected,
        consent_enforcement: consentEnforcement,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(100, isErr ? 60_000 : 8000),
    },
    message,
  };
}

export function generateRetailApiLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const catalogName = `catalog-${rand(["global", "seasonal", "b2b"])}-${randId(4).toLowerCase()}`;
  const eventType = rand([
    "detail-page-view",
    "add-to-cart",
    "purchase-complete",
    "search",
    "home-page-view",
  ] as const);
  const productId = `sku-${randId(8).toLowerCase()}`;
  const recommendationCount = isErr ? 0 : randInt(1, 24);
  const servingConfig = `servingConfigs/${rand(["default", "similar", "trending"])}`;
  const attributionToken = `attrib-${randId(16).toLowerCase()}`;
  const message = isErr
    ? `Retail API ${eventType} failed for ${productId} in ${catalogName}`
    : `Retail API ${eventType} ${productId} recs=${recommendationCount} (${servingConfig})`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "retail-api"),
    gcp: {
      retail_api: {
        catalog_name: catalogName,
        event_type: eventType,
        product_id: productId,
        recommendation_count: recommendationCount,
        serving_config: servingConfig,
        attribution_token: attributionToken,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(20, isErr ? 5000 : 800),
    },
    message,
  };
}
