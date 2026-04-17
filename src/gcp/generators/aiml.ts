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
  randSeverity,
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

const VERTEX_FRAMEWORKS = ["tensorflow", "pytorch", "jax", "sklearn", "xgboost", "custom"] as const;

function vertexBaseIds(projectId: string, region: string) {
  const mid = randId(10).toLowerCase();
  const eid = randId(8).toLowerCase();
  return {
    model_id: `projects/${projectId}/locations/${region}/models/${mid}`,
    endpoint_id: `projects/${projectId}/locations/${region}/endpoints/${eid}`,
    pipeline_run_id: `projects/${projectId}/locations/${region}/pipelineJobs/pipeline-${randId(6).toLowerCase()}-${randId(8).toLowerCase()}`,
  };
}

export function generateVertexAiLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const { model_id, endpoint_id, pipeline_run_id } = vertexBaseIds(project.id, region);
  const framework = rand(VERTEX_FRAMEWORKS);
  const scenario = isErr
    ? rand(["error", "error", "prediction_err", "pipeline_err"] as const)
    : rand(["training", "training", "prediction", "pipeline", "audit", "prediction"] as const);
  const severity = randSeverity(isErr);
  let message = "";
  const labels: Record<string, string> = {
    "resource.type": "aiplatform.googleapis.com/CustomJob",
    location: region,
  };
  let pipeline_run_id_out: string | null = pipeline_run_id;
  let job_type_out: string = "training";
  const epoch = randInt(1, 80);
  const loss = randFloat(0.01, 2.4);
  const acc = randFloat(0.55, 0.995);
  const latencyMs = randLatencyMs(randInt(40, 1200), isErr);

  if (scenario === "error" || scenario === "prediction_err" || scenario === "pipeline_err") {
    if (scenario === "pipeline_err") {
      job_type_out = "pipeline";
      labels["resource.type"] = "aiplatform.googleapis.com/PipelineJob";
      message = `Pipeline task failed: ${rand(["Executor pod OOMKilled", "Artifact gs:// path not writable", "Upstream CustomJob FAILED"])} run=${pipeline_run_id.split("/").pop()}`;
    } else if (scenario === "prediction_err") {
      job_type_out = rand(["online_prediction", "batch_prediction"] as const);
      pipeline_run_id_out = job_type_out === "batch_prediction" ? pipeline_run_id : null;
      const errKind = rand(["oom", "invalid_input", "quota"] as const);
      labels["error.type"] = errKind;
      if (errKind === "oom") {
        message = `Training worker exited with code 137: CUDA out of memory after ${epoch} epochs (batch_size=${randInt(8, 128)}, framework=${framework})`;
        job_type_out = "training";
        pipeline_run_id_out = null;
      } else if (errKind === "invalid_input") {
        message = `Prediction request rejected: input tensor shape [${randInt(1, 8)},${randInt(8, 512)}] incompatible with model signature; expected [1,${randInt(128, 2048)}]`;
      } else {
        message = `Quota 'AiplatformApiOnlinePredictionRequestsPerMinutePerBaseModel' exceeded for project ${project.number} region ${region}; retry after 60s`;
      }
    } else {
      job_type_out = "error";
      const errKind = rand(["oom", "invalid_input", "quota"] as const);
      labels["error.type"] = errKind;
      if (errKind === "oom") {
        message = `Training worker exited with code 137: CUDA out of memory after ${epoch} epochs (batch_size=${randInt(8, 128)}, framework=${framework})`;
        job_type_out = "training";
        pipeline_run_id_out = null;
      } else if (errKind === "invalid_input") {
        message = `Prediction request rejected: input tensor shape [${randInt(1, 8)},${randInt(8, 512)}] incompatible with model signature; expected [1,${randInt(128, 2048)}]`;
        job_type_out = "online_prediction";
        pipeline_run_id_out = null;
      } else {
        message = `Quota 'AiplatformApiOnlinePredictionRequestsPerMinutePerBaseModel' exceeded for project ${project.number} region ${region}; retry after 60s`;
        pipeline_run_id_out = Math.random() < 0.4 ? pipeline_run_id : null;
      }
    }
  } else if (scenario === "training") {
    job_type_out = "training";
    pipeline_run_id_out = null;
    labels["resource.type"] = "aiplatform.googleapis.com/CustomJob";
    const phase = rand(["start", "epoch", "complete"] as const);
    if (phase === "start") {
      message = `Training job started: job_id=customjob-${randId(12).toLowerCase()} replica_count=${randInt(1, 8)} machine_type=${rand(VERTEX_MACHINE_TYPES)} accelerator=${rand(ACCELERATORS)}`;
    } else if (phase === "epoch") {
      const denom = randInt(Math.max(epoch, 1), 100);
      message = `Epoch ${epoch}/${denom}: loss=${loss.toFixed(4)} accuracy=${acc.toFixed(4)} step=${randInt(100, 5000)} lr=${randFloat(1e-6, 1e-2).toExponential(2)}`;
    } else {
      message = `Training completed: final_val_loss=${loss.toFixed(4)} val_accuracy=${acc.toFixed(4)} total_wall_time=${randInt(1200, 86400)}s checkpoint_uri=gs://${project.id}-vertex/out/${randId(8).toLowerCase()}`;
    }
  } else if (scenario === "pipeline") {
    job_type_out = "pipeline";
    const step = rand(["preprocess", "train", "evaluate", "export_model", "deploy_endpoint"]);
    const sub = rand(["artifact", "cache", "step"] as const);
    labels["pipeline.step"] = step;
    if (sub === "artifact") {
      message = `Pipeline step "${step}" produced artifact uri=gs://${project.id}-pipelines/artifacts/${randId(10).toLowerCase()}/model.tar.gz (content_type=application/x-tar)`;
    } else if (sub === "cache") {
      message = `Step "${step}" cache hit: skipping execution (fingerprint=${randId(16).toLowerCase()}, saved ~${randInt(2, 45)}m)`;
    } else {
      message = `Executing pipeline task "${step}" run_id=${pipeline_run_id.split("/").pop()} state=RUNNING`;
    }
  } else if (scenario === "audit") {
    job_type_out = "audit";
    pipeline_run_id_out = Math.random() < 0.5 ? pipeline_run_id : null;
    const method = rand(["aiplatform.endpoints.deploy", "aiplatform.models.upload"] as const);
    labels["protoPayload.methodName"] = method;
    message =
      method === "aiplatform.endpoints.deploy"
        ? `Cloud Audit Logs: ${method} on ${endpoint_id} by serviceAccount:vertex-sa@${project.id}.iam.gserviceaccount.com`
        : `Cloud Audit Logs: ${method} model=${model_id} display_name=${rand(["churn-v3", "embed-prod", "ranker"])}`;
  } else {
    job_type_out = rand(["online_prediction", "batch_prediction"]);
    pipeline_run_id_out = job_type_out === "batch_prediction" ? pipeline_run_id : null;
    const inShape = `[${randInt(1, 32)},${randInt(32, 768)}]`;
    const outShape = `[${randInt(1, 16)},${randInt(8, 256)}]`;
    message = `${job_type_out === "online_prediction" ? "Online" : "Batch"} prediction: model_version=${randInt(1, 12)} latency_ms=${latencyMs} input_shape=${inShape} output_shape=${outShape} instances=${randInt(1, 500)}`;
  }

  return {
    "@timestamp": ts,
    severity,
    labels,
    cloud: gcpCloud(region, project, "aiplatform.googleapis.com"),
    gcp: {
      vertex_ai: {
        model_id,
        endpoint_id,
        pipeline_run_id: pipeline_run_id_out,
        job_type: job_type_out,
        framework,
        model_name: model_id.split("/").pop(),
        model_version: `v${randInt(1, 12)}`,
        prediction_type:
          job_type_out === "online_prediction" || job_type_out === "batch_prediction"
            ? job_type_out.replace("_prediction", "")
            : null,
        instances_count: randInt(1, 128),
        latency_ms: latencyMs,
        training_job_id:
          job_type_out === "training" ? `customjob-${randId(12).toLowerCase()}` : null,
        training_state:
          job_type_out === "training"
            ? rand(["RUNNING", "SUCCEEDED", "FAILED", "CANCELLING"])
            : null,
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
  const model = rand([
    "gemini-1.5-pro",
    "gemini-1.5-flash",
    "gemini-2.0-flash",
    "gemini-2.0-flash-thinking-exp",
  ] as const);
  const input_tokens = randInt(120, 8192);
  const output_tokens = randInt(32, 4096);
  const total_tokens = input_tokens + output_tokens;
  const latencyMs = randLatencyMs(randInt(200, 2500), isErr);
  const severity = randSeverity(isErr);
  const labels: Record<string, string> = {
    "resource.type": "generativelanguage.googleapis.com/Model",
    location: region,
  };

  let message = "";
  let finish_reason: string = "STOP";

  if (isErr && Math.random() < 0.35) {
    const kind = rand(["rate", "safety", "upstream"] as const);
    labels["generativelanguage.reason"] = kind;
    if (kind === "rate") {
      finish_reason = "OTHER";
      message = `GenerateContent quota exceeded for publisher model=${model}; requests_per_minute_per_project_per_base_model limit; RetryInfo: retry_delay { seconds: ${randInt(4, 60)} }`;
      labels["retry_after_seconds"] = String(randInt(4, 60));
    } else if (kind === "safety") {
      finish_reason = "SAFETY";
      message = `FinishReason.SAFETY: blocked categories=[${rand(["HARM_CATEGORY_HARASSMENT", "HARM_CATEGORY_DANGEROUS_CONTENT", "HARM_CATEGORY_SEXUALLY_EXPLICIT"])}] probability=${rand(["MEDIUM", "HIGH"])}`;
    } else {
      finish_reason = rand(["MAX_TOKENS", "OTHER"]);
      message = `Streaming GenerateContent failed mid-stream: code=UNAVAILABLE upstream_model=${model} after ${output_tokens} output tokens`;
    }
  } else if (!isErr && Math.random() < 0.2) {
    labels["generativelanguage.mode"] = "stream";
    const chunkMs = randFloat(8, 120);
    finish_reason = "STOP";
    message = `Stream chunk delivered: cumulative_output_tokens=${output_tokens} inter_chunk_latency_ms=${chunkMs.toFixed(1)} model=${model}`;
  } else if (!isErr && Math.random() < 0.25) {
    labels["generativelanguage.mode"] = "safety_ok";
    finish_reason = "STOP";
    message = `GenerateContent response: finish_reason=STOP safety_ratings all categories=NEGLIGIBLE total_latency_ms=${latencyMs}`;
  } else {
    finish_reason = isErr ? rand(["MAX_TOKENS", "OTHER"]) : "STOP";
    message = isErr
      ? `GenerateContent: finish_reason=${finish_reason}; ${rand(["Token limit reached", "Upstream model error", "Invalid JSON in response_schema"])}`
      : `POST /v1beta/models/${model}:generateContent 200 OK latency_ms=${latencyMs} prompt_tokens=${input_tokens} candidates_tokens=${output_tokens} total=${total_tokens}`;
  }

  const safetyRatings = [
    { category: "HARM_CATEGORY_HARASSMENT", probability: rand(["NEGLIGIBLE", "LOW", "MEDIUM"]) },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", probability: rand(["NEGLIGIBLE", "LOW"]) },
  ];

  return {
    "@timestamp": ts,
    severity,
    labels,
    cloud: gcpCloud(region, project, "generativelanguage.googleapis.com"),
    gcp: {
      gemini: {
        model,
        input_tokens,
        output_tokens,
        total_tokens,
        finish_reason,
        prompt_token_count: input_tokens,
        candidates_token_count: output_tokens,
        total_token_count: total_tokens,
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
  const severity = randSeverity(isErr);
  const message = isErr
    ? `vision.googleapis.com/v1/images:annotate INVALID_ARGUMENT: ${rand(["Image format not supported", "Image exceeds 20MB limit", "Permission denied on object"])} resource=${imageUri}`
    : `images:annotate OK feature=${features} file=${imageUri} labels=${labelsDetected} max_confidence=${confidenceMax.toFixed(3)} latency_ms=${latencyMs}`;

  return {
    "@timestamp": ts,
    severity,
    labels: {
      "resource.type": "vision.googleapis.com/Image",
      "logging.googleapis.com/timestamp": ts,
    },
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
  const severity = randSeverity(isErr);
  const message = isErr
    ? `language.googleapis.com/v1/documents:${operation} FAILED_PRECONDITION: ${rand(["Document size exceeds limit", "Unsupported language code", "Internal error"])} document_characters=${textLength}`
    : `documents:${operation} OK language=${languageDetected} entities=${entitiesCount} sentiment=${sentimentScore.toFixed(3)} magnitude=${magnitude.toFixed(3)}`;

  return {
    "@timestamp": ts,
    severity,
    labels: { "resource.type": "language.googleapis.com/Document", method: operation },
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
  const severity = randSeverity(isErr);
  const message = isErr
    ? `translate.googleapis.com/v3/projects/${project.id}:translateText RESOURCE_EXHAUSTED: Quota exceeded for quota metric 'Characters'`
    : `translateText OK source=${sourceLanguage} target=${targetLanguage} model=${model} chars=${charactersTranslated} glossary_config=${glossaryUsed ? `projects/${project.id}/locations/global/glossaries/gloss-${randId(4)}` : "none"} latency_ms=${latencyMs}`;

  return {
    "@timestamp": ts,
    severity,
    labels: { "resource.type": "translate.googleapis.com/Project" },
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
  const severity = randSeverity(isErr);
  const message = isErr
    ? `speech.googleapis.com/v1/speech:recognize FAILED: ${rand(["Audio encoding mismatch", "No speech detected in audio", "Corrupt FLAC header"])} model=${model}`
    : `LongRunningRecognize completed operation=op-${randId(12).toLowerCase()} words=${wordCount} audio_sec=${audioDurationSeconds.toFixed(2)} confidence=${confidence.toFixed(3)} encoding=${encoding}`;

  return {
    "@timestamp": ts,
    severity,
    labels: { "resource.type": "speech.googleapis.com/Recognizer", model },
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
  const voiceName = rand([
    "en-US-Wavenet-D",
    "en-GB-Neural2-A",
    "es-ES-Neural2-C",
    "de-DE-Wavenet-B",
  ]);
  const audioEncoding = rand(["MP3", "LINEAR16", "OGG_OPUS"] as const);
  const speakingRate = Math.round((0.85 + Math.random() * 0.5) * 100) / 100;
  const pitch = randInt(-6, 6);
  const audioDurationSeconds = isErr ? 0 : randFloat(0.5, textLength / 18);
  const severity = randSeverity(isErr);
  const message = isErr
    ? `texttospeech.googleapis.com/v1/text:synthesize INVALID_ARGUMENT: ${rand(["SSML parse error", "Voice en-xx not found for project", "Quota exceeded for character count"])}`
    : `text:synthesize OK voice=${voiceName} encoding=${audioEncoding} input_chars=${textLength} audio_duration_sec=${audioDurationSeconds.toFixed(2)} speaking_rate=${speakingRate} pitch=${pitch}`;

  return {
    "@timestamp": ts,
    severity,
    labels: { "resource.type": "texttospeech.googleapis.com/Voice" },
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
  const intentName = rand([
    "Default Welcome Intent",
    "Order.Status",
    "Handoff.Agent",
    "SmallTalk.Hello",
  ]);
  const intentConfidence = isErr ? randFloat(0.1, 0.45) : randFloat(0.65, 0.99);
  const queryText = rand([
    "Track my order",
    "I need a human",
    "What are your hours?",
    "Cancel subscription",
  ]);
  const responseTextLength = randInt(isErr ? 0 : 40, 2000);
  const fulfillmentWebhookCalled = Math.random() < 0.55;
  const sentimentScore = randFloat(-0.4, 0.9);
  const language = rand(["en", "es", "de"]);
  const severity = randSeverity(isErr);
  const message = isErr
    ? `DetectIntent projects/${project.id}/agent/${agentName}: webhook deadline exceeded for intent="${intentName}" session=${sessionId}`
    : `DetectIntent OK session=${sessionId} intent="${intentName}" confidence=${intentConfidence.toFixed(3)} fulfillment_webhook=${fulfillmentWebhookCalled} language=${language}`;

  return {
    "@timestamp": ts,
    severity,
    labels: { "resource.type": "dialogflow.googleapis.com/Agent", "dialogflow.session": sessionId },
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
  const processorType = rand([
    "FORM_PARSER",
    "OCR",
    "INVOICE_PARSER",
    "ID_PROOFING",
    "EXPENSE_PARSER",
  ] as const);
  const processorName = `${processorType.toLowerCase()}-${randId(6).toLowerCase()}`;
  const documentPages = randInt(1, 120);
  const entitiesExtracted = isErr ? randInt(0, 4) : randInt(5, 400);
  const confidenceAvg = isErr ? randFloat(0.35, 0.62) : randFloat(0.78, 0.97);
  const processingTimeMs = randLatencyMs(randInt(200, 4000), isErr);
  const severity = randSeverity(isErr);
  const message = isErr
    ? `documentai.googleapis.com/v1/projects/${project.id}/locations/${region}/processors/${processorName}:process FAILED_PRECONDITION: ${rand(["Unsupported PDF encryption", "Processor not found", "OCR engine transient error"])}`
    : `process OK processor=${processorName} type=${processorType} pages=${documentPages} entities=${entitiesExtracted} avg_confidence=${confidenceAvg.toFixed(3)} duration_ms=${processingTimeMs}`;

  return {
    "@timestamp": ts,
    severity,
    labels: { "resource.type": "documentai.googleapis.com/Processor", processor: processorName },
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
  const eventType = rand([
    "detail-page-view",
    "add-to-cart",
    "purchase-complete",
    "search",
  ] as const);
  const userId = `user_${randId(10)}`;
  const recommendationCount = isErr ? 0 : randInt(4, 24);
  const servingConfig = `servingConfigs/${rand(["default", "trending", "similar-items"])}`;
  const modelId = `model-${randId(8).toLowerCase()}`;
  const severity = randSeverity(isErr);
  const message = isErr
    ? `retail.googleapis.com/v2/${catalogName}/userEvents:write INVALID_ARGUMENT: ${rand(["Catalog item not found", "Invalid user event payload", "Model not ready for serving"])}`
    : `predict OK catalog=${catalogName} user_event=${eventType} user=${userId} rec_count=${recommendationCount} serving_config=${servingConfig} model=${modelId}`;

  return {
    "@timestamp": ts,
    severity,
    labels: { "resource.type": "retail.googleapis.com/Catalog", catalog: catalogName },
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
  const severity = randSeverity(isErr);
  const message = isErr
    ? `discoveryengine.googleapis.com/v1/${servingConfig}:search INVALID_ARGUMENT: ${rand(["Malformed filter", "Serving config not found", "Deadline exceeded"])}`
    : `search OK engine=${engineName} type=${searchType} query="${query}" results=${resultsCount} session=${sessionId} latency_ms=${latencyMs}`;

  return {
    "@timestamp": ts,
    severity,
    labels: { "resource.type": "discoveryengine.googleapis.com/Engine", engine: engineName },
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
  const trainingHours =
    operation === "TRAINING" || operation === "EVALUATING" ? randFloat(0.5, 48) : 0;
  const evaluationMetricName = rand(["accuracy", "auPRC", "f1_score", "mean_absolute_error"]);
  const evaluationMetricValue = isErr ? randFloat(0.2, 0.55) : randFloat(0.72, 0.98);
  const nodeCount = randInt(1, 32);
  const severity = randSeverity(isErr);
  const message = isErr
    ? `automl.googleapis.com/v1/projects/${project.id}/locations/${region}/models/${modelName}: operation FAILED: ${rand(["Insufficient training examples", "Severe label imbalance", "Export to GCS failed"])}`
    : `AutoMLTables ${operation} state=${status} dataset=${datasetName} workers=${nodeCount} ${evaluationMetricName}=${evaluationMetricValue.toFixed(4)} train_hours=${trainingHours.toFixed(2)}`;

  return {
    "@timestamp": ts,
    severity,
    labels: { "resource.type": "automl.googleapis.com/Model" },
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
  const status = isErr
    ? rand(["PROVISIONING", "STOPPED"] as const)
    : rand(["ACTIVE", "STOPPED", "PROVISIONING"] as const);
  const idleTimeoutMin = randInt(15, 240);
  const userEmail = rand([
    `analyst@${project.id.split("-")[0]}.example.com`,
    `ds@${project.id}.example.com`,
  ]);
  const severity = randSeverity(isErr);
  const message = isErr
    ? `notebooks.googleapis.com/v1/projects/${project.id}/locations/${region}/instances/${instanceName}: start FAILED: ${framework} image pull timeout on ${machineType}`
    : `Workbench instance ${instanceName} status=${status} machine=${machineType} accelerator=${gpuType} framework=${framework} idle_timeout_min=${idleTimeoutMin} principal=${userEmail}`;

  return {
    "@timestamp": ts,
    severity,
    labels: { "resource.type": "notebooks.googleapis.com/Instance", instance: instanceName },
    cloud: gcpCloud(region, project, "notebooks.googleapis.com"),
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
  const state = isErr
    ? rand(["FAILED", "RUNNING"] as const)
    : rand(["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"] as const);
  const inputArtifacts = randInt(1, 12);
  const outputArtifacts = isErr ? randInt(0, 2) : randInt(1, 20);
  const executionTimeSeconds = randInt(isErr ? 30 : 60, isErr ? 7200 : 14_400);
  const severity = randSeverity(isErr || state === "FAILED" || state === "CANCELLED");
  const message =
    isErr || state === "FAILED"
      ? `PipelineJob ${pipelineName} run=${runId} task=${componentName} state=${state}: ${rand(["Executor pod OOMKilled", "Artifact URI not writable", "Upstream training job failed"])}`
      : `Pipeline task "${componentName}" state=${state} run_id=${runId} elapsed_sec=${executionTimeSeconds} input_artifacts=${inputArtifacts} output_artifacts=${outputArtifacts}`;

  return {
    "@timestamp": ts,
    severity,
    labels: {
      "resource.type": "aiplatform.googleapis.com/PipelineJob",
      "ml.googleapis.com/pipeline_job_id": runId,
    },
    cloud: gcpCloud(region, project, "aiplatform.googleapis.com"),
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
  const severity = randSeverity(isErr);
  const message = isErr
    ? `featurestores/${featurestoreName}/entityTypes/${entityType}:batchReadFeatureValues FAILED: deadline exceeded after ${onlineServingLatencyMs.toFixed(1)}ms`
    : `Online serving OK featurestore=${featurestoreName} entity_type=${entityType} feature=${featureName} op=${operation} latency_ms=${onlineServingLatencyMs.toFixed(2)} values_ingested=${featureValuesIngested}`;

  return {
    "@timestamp": ts,
    severity,
    labels: {
      "resource.type": "aiplatform.googleapis.com/Featurestore",
      featurestore: featurestoreName,
    },
    cloud: gcpCloud(region, project, "aiplatform.googleapis.com"),
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
      duration: onlineServingLatencyMs,
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
  const severity = randSeverity(isErr);
  const message = isErr
    ? `MatchingEngine indexEndpoint ${endpointName}: ${operation} UNAVAILABLE neighbor_count=${approximateNeighborsCount} recall=${recallRate.toFixed(3)}`
    : `findNeighbors OK index=${indexName} endpoint=${endpointName} op=${operation} dim=${dimensions} neighbors=${approximateNeighborsCount} recall@10=${recallRate.toFixed(3)} latency_ms=${latencyMs.toFixed(2)}`;

  return {
    "@timestamp": ts,
    severity,
    labels: { "resource.type": "aiplatform.googleapis.com/IndexEndpoint", index: indexName },
    cloud: gcpCloud(region, project, "aiplatform.googleapis.com"),
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
  const severity = randSeverity(isErr);
  const message = isErr
    ? `tensorboard.googleapis.com: WriteTimeSeries FAILED for experiment=${experimentName} run=${runName} tag=${tag}: permission denied on gs://${project.id}-tb/${runName}`
    : `WriteTimeSeries OK experiment=${experimentName} run=${runName} plugin=${plugin} tag=${tag} points=${dataPointsWritten} storage_bytes=${storageUsedBytes}`;

  return {
    "@timestamp": ts,
    severity,
    labels: {
      "resource.type": "aiplatform.googleapis.com/TensorboardRun",
      experiment: experimentName,
    },
    cloud: gcpCloud(region, project, "aiplatform.googleapis.com"),
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
  const severity = randSeverity(isErr);
  const message = isErr
    ? `ContactCenterAI AnalyzeConversation conversation_id=${conversationId} sentiment=${sentimentScore.toFixed(2)} outcome=ESCALATION transfer_to_human=${transferToHuman}`
    : `AnalyzeConversation OK project=${projectName} conversation=${conversationId} intent=${intentName} turns=${turnCount} csat=${csatScore} agent_type=${agentType}`;

  return {
    "@timestamp": ts,
    severity,
    labels: {
      "resource.type": "contactcenterai.googleapis.com/Conversation",
      conversation: conversationId,
    },
    cloud: gcpCloud(region, project, "contactcenterai.googleapis.com"),
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
  const severity = randSeverity(isErr);
  const message = isErr
    ? `healthcare.googleapis.com/v1/projects/${project.id}/locations/${region}/datasets/${datasetName}/fhirStores/default:fhir.search FAILED_PRECONDITION: consent ${consentEnforcement}`
    : `fhir.${operation.toLowerCase()} OK store=${storeType} dataset=${datasetName} resource=${resourceType} count=${resourcesAffected} consent=${consentEnforcement}`;

  return {
    "@timestamp": ts,
    severity,
    labels: { "resource.type": "healthcare.googleapis.com/Dataset", dataset: datasetName },
    cloud: gcpCloud(region, project, "healthcare.googleapis.com"),
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
  const severity = randSeverity(isErr);
  const message = isErr
    ? `retail.googleapis.com/v2/${catalogName}/prediction:predict PERMISSION_DENIED: service account lacks retail.editor on ${catalogName}`
    : `predict OK catalog=${catalogName} event=${eventType} product=${productId} recs=${recommendationCount} ${servingConfig} attribution_token=${attributionToken}`;

  return {
    "@timestamp": ts,
    severity,
    labels: { "resource.type": "retail.googleapis.com/Catalog", catalog: catalogName },
    cloud: gcpCloud(region, project, "retail.googleapis.com"),
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
