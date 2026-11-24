import {
  rand,
  randInt,
  randFloat,
  randId,
  randUUID,
  randAccount,
  REGIONS,
  randIamUser,
} from "../../helpers";
import type { EcsDocument } from "./types.js";

export { generateSageMakerLog } from "./sagemakerLog.js";

function generateBedrockLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const scenario = rand([
    "model_invoke_streaming",
    "guardrail_check",
    "knowledge_base_query",
    "agent_orchestration",
    "fine_tune_job",
    "invoke_sync",
  ] as const);
  const models = [
    "anthropic.claude-3-5-sonnet-20241022-v2:0",
    "anthropic.claude-3-haiku-20240307-v1:0",
    "amazon.titan-text-express-v1",
    "meta.llama3-70b-instruct-v1:0",
    "mistral.mixtral-8x7b-instruct-v0:1",
    "amazon.nova-pro-v1:0",
  ];
  const model = rand(models);
  const modelFamily = model.split(".")[0];
  const maxOutputByFamily = { anthropic: 8192, amazon: 4096, meta: 8192, mistral: 32768 };
  const maxOut = maxOutputByFamily[modelFamily as keyof typeof maxOutputByFamily] || 4096;
  const inputTokens = randInt(50, 8000);
  const outputTokens = isErr ? 0 : Math.min(randInt(50, 2000), maxOut);
  const isStreaming =
    scenario === "model_invoke_streaming" ||
    Math.random() < (scenario === "invoke_sync" ? 0.2 : 0.5);
  const ttftMs =
    scenario === "model_invoke_streaming" || isStreaming
      ? modelFamily === "anthropic"
        ? randInt(100, 800)
        : randInt(50, 400)
      : null;
  const lat = Number(randFloat(0.5, isErr ? 30 : 15));
  const latencyMs = Math.round(lat * 1000);
  const inputTokensPerSec =
    isStreaming && !isErr ? parseFloat((inputTokens / lat).toFixed(1)) : null;
  const operationByScenario: Record<typeof scenario, string> = {
    model_invoke_streaming: "InvokeModelWithResponseStream",
    guardrail_check: "ApplyGuardrail",
    knowledge_base_query: "Retrieve",
    agent_orchestration: "InvokeAgent",
    fine_tune_job: "CreateModelCustomizationJob",
    invoke_sync: Math.random() < 0.5 ? "InvokeModel" : "Converse",
  };
  const operation = operationByScenario[scenario];
  const kbId = `KB${randId(9).toUpperCase()}`;
  const agentId = `T${randId(11).toUpperCase()}`;
  const customizationJobArn =
    scenario === "fine_tune_job"
      ? `arn:aws:bedrock:${region}:${acct.id}:model-customization-job/${randId(12).toLowerCase()}`
      : null;

  const errPool = [
    "ThrottlingException",
    "ModelTimeoutException",
    "ValidationException",
    "AccessDeniedException",
    "ModelStreamErrorException",
  ] as const;
  const errCode = isErr ? rand([...errPool]) : null;

  const schemaType = "ModelInvocationLog";
  const schemaVersion = "1.0";
  const clip = (obj: unknown, maxLen: number) => {
    const s = JSON.stringify(obj);
    return s.length > maxLen ? `${s.slice(0, maxLen)}...` : s;
  };
  const inputBody =
    scenario === "guardrail_check"
      ? {
          guardrailIdentifier: `gr-${randId(10).toLowerCase()}`,
          source: "OUTPUT",
          content: [{ text: rand(["Support answer draft…", "Generated SQL…"]) }],
        }
      : scenario === "knowledge_base_query"
        ? {
            knowledgeBaseId: kbId,
            retrievalQuery: { text: rand(["PTO policy", "device RMA steps", "SOC2 controls"]) },
            retrievalConfiguration: {
              vectorSearchConfiguration: { numberOfResults: randInt(3, 12) },
            },
          }
        : scenario === "agent_orchestration"
          ? {
              agentId,
              sessionId: randId(32).toLowerCase(),
              inputText: rand([
                "Reset my password",
                "Open ticket INC-123",
                "List S3 buckets in prod",
              ]),
              enableTrace: true,
            }
          : scenario === "fine_tune_job"
            ? {
                jobName: `custom-${randId(8).toLowerCase()}`,
                baseModelIdentifier: model,
                trainingDataConfig: {
                  s3Uri: `s3://bedrock-fine-tune-${acct.id}/train/${randId(6)}/`,
                },
                outputDataConfig: { s3Uri: `s3://bedrock-fine-tune-${acct.id}/out/` },
              }
            : operation === "Converse"
              ? {
                  messages: [
                    {
                      role: "user",
                      content: [
                        {
                          text: rand([
                            "Summarize the Q3 results.",
                            "Draft a reply to the customer.",
                            "Extract invoice fields from the attached text.",
                          ]),
                        },
                      ],
                    },
                  ],
                  inferenceConfig: {
                    maxTokens: randInt(256, 4096),
                    temperature: Number(randFloat(0, 1)),
                  },
                }
              : {
                  anthropic_version: "bedrock-2023-05-31",
                  max_tokens: randInt(256, 4096),
                  messages: [
                    {
                      role: "user",
                      content: rand([
                        "Explain zero trust in two paragraphs.",
                        "Classify: refund vs exchange.",
                        "Return JSON with keys a,b,c.",
                      ]),
                    },
                  ],
                };
  const outputBody = isErr
    ? { message: "Invocation failed", __type: errCode }
    : scenario === "knowledge_base_query"
      ? {
          retrievalResults: [
            {
              content: { text: "Excerpt from internal wiki…" },
              location: { s3Location: { uri: `s3://kb-${randId(6)}/doc.pdf` } },
              score: Number(randFloat(0.4, 0.99)),
            },
          ],
        }
      : scenario === "agent_orchestration"
        ? {
            completion: "Agent completed tool calls and returned final answer.",
            trace: { orchestration: { modelInvocation: { modelId: model } } },
          }
        : scenario === "fine_tune_job"
          ? {
              jobArn: customizationJobArn,
              status: "InProgress",
              trainingStartTime: new Date(ts).toISOString(),
            }
          : scenario === "guardrail_check"
            ? { action: rand(["NONE", "INTERVENED"]), assessments: [] }
            : operation === "Converse"
              ? {
                  output: {
                    message: {
                      role: "assistant",
                      content: [
                        {
                          text: "Here is a concise summary based on the provided context and figures.".repeat(
                            Math.min(3, Math.ceil(outputTokens / 80))
                          ),
                        },
                      ],
                    },
                  },
                  stopReason: rand(["end_turn", "max_tokens"]),
                  usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
                }
              : {
                  id: `msg_${randId(24).toLowerCase()}`,
                  type: "message",
                  role: "assistant",
                  content: [
                    {
                      type: "text",
                      text: "Response text synthesized for the requested task.".repeat(
                        Math.min(2, Math.ceil(outputTokens / 120))
                      ),
                    },
                  ],
                  stop_reason: rand(["end_turn", "max_tokens", "stop_sequence"]),
                  usage: { input_tokens: inputTokens, output_tokens: outputTokens },
                };
  const inputBodyJson = clip(inputBody, 4096);
  const outputBodyJson = clip(outputBody, 4096);
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
        modelId: model,
        inputTokenCount: inputTokens,
        outputTokenCount: outputTokens,
        inputBodyJson,
        outputBodyJson,
        invocationLatency: latencyMs,
        operation,
        scenario,
        knowledge_base_id: scenario === "knowledge_base_query" ? kbId : null,
        agent_id: scenario === "agent_orchestration" ? agentId : null,
        customization_job_arn: scenario === "fine_tune_job" ? customizationJobArn : null,
        schemaType,
        schemaVersion,
        model_id: model,
        invocation_latency_ms: latencyMs,
        input_token_count: inputTokens,
        output_token_count: outputTokens,
        total_token_count: inputTokens + outputTokens,
        stop_reason: isErr ? null : rand(["end_turn", "max_tokens", "stop_sequence"]),
        error_code: errCode,
        use_case:
          scenario === "guardrail_check"
            ? "content-safety"
            : scenario === "knowledge_base_query"
              ? "rag-retrieval"
              : scenario === "fine_tune_job"
                ? "fine-tuning"
                : rand(["text-generation", "summarization", "classification", "extraction", "qa"]),
        guardrail_action:
          scenario === "guardrail_check"
            ? rand(["NONE", "NONE", "INTERVENED"])
            : rand(["NONE", "NONE", "NONE", "INTERVENED"]),
        streaming: isStreaming,
        time_to_first_token_ms: ttftMs,
        input_tokens_per_sec: inputTokensPerSec,
        model_family: modelFamily,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.bedrock",
      provider: "bedrock.amazonaws.com",
      duration: lat * 1e9,
    },
    message: JSON.stringify({
      schemaType,
      schemaVersion,
      timestamp: ts,
      accountId: acct.id,
      region,
      requestId: randId(32).toLowerCase(),
      operation,
      modelId: model,
      input: { inputContentType: "application/json", inputBodyJson, inputTokenCount: inputTokens },
      output: {
        outputContentType: "application/json",
        outputBodyJson,
        outputTokenCount: outputTokens,
      },
      ...(isErr ? { errorCode: errCode } : {}),
    }),
    log: { level: isErr ? "error" : lat > 10 ? "warn" : "info" },
    ...(isErr && errCode
      ? {
          error: {
            code: errCode,
            message: rand([
              "Bedrock streamed response terminated early",
              "Input failed guardrail precondition checks",
              "Training data bucket policy denied Bedrock principal",
              "Foundation model throughput limit reached",
            ]),
            type: "aws",
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
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.bedrockagent",
      provider: "bedrock-agent-runtime.amazonaws.com",
      duration: dur * 1e9,
    },
    message: JSON.stringify({
      eventType: action,
      agentId,
      agentAliasId: aliasId,
      sessionId,
      inputTokenCount: inputTokens,
      outputTokenCount: outputTokens,
      invocationLatencyMs: latencyMs,
      timestamp: new Date(ts).toISOString(),
      ...(isErr
        ? { status: "Failed", errorCode: rand(["ValidationException", "ThrottlingException"]) }
        : { status: "Succeeded" }),
    }),
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
    "CompareFaces",
    "IndexFaces",
    "SearchFaces",
    "DetectCustomLabels",
    "StartFaceDetection",
    "GetFaceDetection",
  ]);
  const level = isErr ? "error" : "info";
  const dur = Number(randFloat(50, isErr ? 5000 : 1000));
  const confidence = Number(randFloat(70, 99));
  const faceDetail = (withFaceId: boolean) => ({
    BoundingBox: {
      Width: Number(randFloat(0.08, 0.45)),
      Height: Number(randFloat(0.1, 0.5)),
      Left: Number(randFloat(0, 0.6)),
      Top: Number(randFloat(0, 0.55)),
    },
    Confidence: Number(randFloat(92, 99.9)),
    Landmarks: [
      { Type: "eyeLeft", X: Number(randFloat(0.2, 0.8)), Y: Number(randFloat(0.2, 0.8)) },
    ],
    Pose: {
      Roll: Number(randFloat(-8, 8)),
      Yaw: Number(randFloat(-12, 12)),
      Pitch: Number(randFloat(-6, 6)),
    },
    Quality: { Brightness: Number(randFloat(40, 95)), Sharpness: Number(randFloat(50, 99)) },
    ...(withFaceId ? { FaceId: randId(32).toLowerCase() } : {}),
  });
  const nFaces = isErr ? 0 : randInt(1, 5);
  const isFaceOp = op === "DetectFaces" || op === "CompareFaces" || op === "IndexFaces";
  const faceDetails = isFaceOp
    ? Array.from({ length: nFaces }, () => faceDetail(op === "CompareFaces" || op === "IndexFaces"))
    : [];
  const labelsSummary =
    op === "DetectLabels" || op === "RecognizeCelebrities" || op === "DetectModerationLabels"
      ? {
          LabelCount: isErr ? 0 : randInt(3, 40),
          TopLabels: isErr
            ? []
            : [
                {
                  Name: rand(["Person", "Car", "Desk", "Computer", "Dog"]),
                  Confidence: Number(randFloat(85, 99)),
                },
                {
                  Name: rand(["Indoor", "Office", "Outdoor", "Building"]),
                  Confidence: Number(randFloat(72, 96)),
                },
              ],
        }
      : null;
  const textDetections =
    op === "DetectText"
      ? {
          TextDetectionCount: isErr ? 0 : randInt(2, 35),
          Detections: isErr
            ? []
            : [
                {
                  DetectedText: rand(["INVOICE", "TOTAL", "USD 1,240.00", "Suite 400"]),
                  Type: rand(["LINE", "WORD"]),
                  Confidence: Number(randFloat(80, 99)),
                  Geometry: { BoundingBox: { Width: 0.22, Height: 0.04, Left: 0.12, Top: 0.18 } },
                },
              ],
        }
      : null;
  const compareFacesSummary =
    op === "CompareFaces" && !isErr
      ? {
          SourceImageFace: {
            BoundingBox: { Width: 0.18, Height: 0.22, Left: 0.35, Top: 0.28 },
            Confidence: Number(randFloat(95, 99.5)),
          },
          FaceMatches: [
            {
              Similarity: Number(randFloat(88, 99.9)),
              Face: {
                FaceId: randId(32).toLowerCase(),
                BoundingBox: { Width: 0.19, Height: 0.23, Left: 0.34, Top: 0.27 },
                Confidence: Number(randFloat(94, 99.4)),
              },
            },
          ],
          UnmatchedFaces: [],
        }
      : op === "CompareFaces" && isErr
        ? { SourceImageFace: null, FaceMatches: [], UnmatchedFaces: [] }
        : null;
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
        FaceDetails: faceDetails,
        Labels: labelsSummary,
        TextDetections: textDetections,
        CompareFaces: compareFacesSummary,
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
      },
    },
    event: {
      duration: dur * 1e6,
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.rekognition",
      provider: "rekognition.amazonaws.com",
    },
    message: JSON.stringify({
      eventType: op,
      operation: op,
      durationMs: Math.round(dur),
      labelsDetected: isErr ? 0 : randInt(1, 50),
      facesDetected: isErr ? 0 : randInt(0, 20),
      maxConfidence: isErr ? 0 : confidence,
      timestamp: new Date(ts).toISOString(),
      ...(isErr ? { status: "Failed" } : { status: "Succeeded" }),
    }),
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
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process", "file"],
      dataset: "aws.textract",
      provider: "textract.amazonaws.com",
    },
    message: JSON.stringify({
      eventType: op,
      documentType: docType,
      pagesProcessed: pages,
      wordsDetected: pages * randInt(50, 500),
      confidenceMean: Number(randFloat(85, 99)),
      timestamp: new Date(ts).toISOString(),
      ...(isErr ? { status: "Failed" } : { status: "Succeeded" }),
    }),
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
  const isBatch = op.startsWith("Start");
  const jobId = isBatch ? randId(36).toLowerCase() : null;
  const sentimentDetection =
    !isErr && (op === "DetectSentiment" || op === "StartSentimentDetectionJob")
      ? {
          Sentiment: sentiment,
          SentimentScore: {
            Positive: Number(randFloat(0, 0.95)),
            Negative: Number(randFloat(0, 0.85)),
            Neutral: Number(randFloat(0, 0.9)),
            Mixed: Number(randFloat(0, 0.6)),
          },
        }
      : null;
  const entityRecognition =
    !isErr && (op === "DetectEntities" || op === "StartEntitiesDetectionJob")
      ? {
          Entities: [
            {
              Text: rand(["Acme Corp", "Seattle", "USD 2.4M", "Jane Doe"]),
              Score: Number(randFloat(0.82, 0.99)),
              Type: rand(["ORGANIZATION", "LOCATION", "QUANTITY", "PERSON"]),
            },
            {
              Text: rand(["Q3 2025", "invoice", "renewal"]),
              Score: Number(randFloat(0.75, 0.97)),
              Type: rand(["DATE", "OTHER", "EVENT"]),
            },
          ],
        }
      : null;
  const keyPhraseDetection =
    !isErr && op === "DetectKeyPhrases"
      ? {
          KeyPhrases: [
            {
              Text: rand(["customer churn", "service level agreement", "quarterly revenue"]),
              Score: Number(randFloat(0.78, 0.98)),
            },
            {
              Text: rand(["renewal window", "support ticket backlog"]),
              Score: Number(randFloat(0.7, 0.95)),
            },
          ],
        }
      : null;
  const batchAnalysis =
    isBatch && !isErr
      ? {
          JobId: jobId,
          JobStatus: rand(["SUBMITTED", "IN_PROGRESS", "COMPLETED"]),
          LanguageCode: lang,
          DocumentCount: randInt(50, 5000),
          DocumentsProcessed: randInt(10, 4500),
          OutputDataConfig: { S3Uri: `s3://comprehend-out-${acct.id}/${jobId}/` },
        }
      : isBatch && isErr
        ? {
            JobId: jobId,
            JobStatus: "FAILED",
            LanguageCode: lang,
            DocumentCount: 0,
            DocumentsProcessed: 0,
            OutputDataConfig: null,
          }
        : null;
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
        LanguageCode: lang,
        language_code: lang,
        text_bytes: randInt(100, 100000),
        sentiment: op === "DetectSentiment" ? sentiment : null,
        entities_detected: op === "DetectEntities" ? randInt(0, 20) : 0,
        key_phrases_detected: op === "DetectKeyPhrases" ? randInt(0, 30) : 0,
        pii_entities_detected: op === "DetectPiiEntities" ? randInt(0, 10) : 0,
        SentimentDetection: sentimentDetection,
        EntityRecognition: entityRecognition,
        KeyPhraseDetection: keyPhraseDetection,
        BatchAnalysis: batchAnalysis,
        error_code: isErr
          ? rand(["TextSizeLimitExceededException", "UnsupportedLanguageException"])
          : null,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.comprehend",
      provider: "comprehend.amazonaws.com",
    },
    message: JSON.stringify({
      eventType: op,
      languageCode: lang,
      textBytes: randInt(100, 100000),
      sentiment: op === "DetectSentiment" ? sentiment : null,
      entitiesDetected: op === "DetectEntities" ? randInt(0, 20) : 0,
      timestamp: new Date(ts).toISOString(),
      ...(isErr ? { status: "Failed" } : { status: "Succeeded" }),
    }),
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
    message: JSON.stringify({
      eventType: action,
      entitiesDetected: entityCount,
      phiEntities: phiCount,
      textCharacters: randInt(100, 10000),
      timestamp: new Date(ts).toISOString(),
      ...(isErr ? { status: "Failed" } : { status: "Succeeded" }),
    }),
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
      },
    },
    event: {
      duration: dur * 1e6,
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.translate",
      provider: "translate.amazonaws.com",
    },
    message: JSON.stringify({
      eventType: "TranslateText",
      sourceLanguageCode: srcLang,
      targetLanguageCode: tgtLang,
      charactersTranslated: chars,
      durationMs: Math.round(dur),
      timestamp: new Date(ts).toISOString(),
      ...(isErr ? { status: "Failed" } : { status: "Succeeded" }),
    }),
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
  const mediaFormat = rand(["mp3", "mp4", "wav", "flac", "ogg"]);
  const sampleRate = rand([8000, 16000, 22050, 44100, 48000]);
  const jobStatus = isErr ? "FAILED" : rand(["COMPLETED", "COMPLETED", "IN_PROGRESS"]);
  const outputLocationType = rand(["SERVICE_BUCKET", "CUSTOMER_BUCKET"]);
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
        TranscriptionJobName: jobName,
        TranscriptionJobStatus: jobStatus,
        LanguageCode: lang,
        MediaFormat: mediaFormat,
        MediaSampleRateHertz: sampleRate,
        OutputLocationType: outputLocationType,
        transcription_job_name: jobName,
        transcription_job_status: jobStatus,
        language_code: lang,
        media_format: mediaFormat,
        media_sample_rate_hertz: sampleRate,
        output_location_type: outputLocationType,
        media_uri: `s3://audio-bucket/${jobName}.mp3`,
        audio_duration_minutes: audioMins,
        word_count: isErr ? 0 : Math.round(audioMins * 150),
        vocabulary_name: rand([null, "custom-medical-terms", "legal-terminology"]),
        speaker_count: rand([null, 1, 2, rand([3, 4])]),
        content_redaction_enabled: Math.random() > 0.7,
        error_code: isErr
          ? rand(["InternalFailure", "BadRequestException", "LimitExceededException"])
          : null,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.transcribe",
      provider: "transcribe.amazonaws.com",
    },
    message: JSON.stringify({
      eventType: "TranscriptionJobStateChange",
      transcriptionJobName: jobName,
      transcriptionJobStatus: jobStatus,
      languageCode: lang,
      mediaFormat,
      audioDurationMinutes: audioMins,
      wordCount: isErr ? 0 : Math.round(audioMins * 150),
      timestamp: new Date(ts).toISOString(),
      ...(isErr ? { status: "Failed" } : { status: "Succeeded" }),
    }),
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
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.polly",
      provider: "polly.amazonaws.com",
    },
    message: JSON.stringify({
      eventType: pollyOp,
      voiceId: voice,
      engine,
      charactersSynthesized: chars,
      outputFormat: rand(["mp3", "ogg_vorbis", "pcm"]),
      timestamp: new Date(ts).toISOString(),
      ...(isErr ? { status: "Failed" } : { status: "Succeeded" }),
    }),
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? { error: { code: "PollyError", message: "Polly synthesis failed", type: "ml" } }
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
    message: JSON.stringify({
      eventType: action,
      campaignName: campaign,
      userId,
      numResultsReturned: numResults,
      durationMs: Math.round(dur),
      timestamp: new Date(ts).toISOString(),
      ...(isErr ? { status: "Failed" } : { status: "Succeeded" }),
    }),
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
    message: JSON.stringify({
      eventType: "IntentRecognition",
      botName: bot,
      botId,
      intentName: intent,
      intentNluConfidenceScore: nluScore,
      dialogState: isErr ? "Failed" : "Fulfilled",
      inputTranscript: rand([
        "I want to order a product",
        "What is my order status",
        "Cancel my order",
      ]),
      timestamp: new Date(ts).toISOString(),
      ...(isErr ? { status: "Failed" } : { status: "Succeeded" }),
    }),
    log: { level: isErr ? "error" : nluScore < 0.7 ? "warn" : "info" },
    ...(isErr ? { error: { code: "LexError", message: "Lex intent failed", type: "ml" } } : {}),
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
  const user = randIamUser();
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
    message: JSON.stringify({
      eventType,
      applicationName: appName,
      applicationId: appId,
      conversationId,
      userId: user,
      inputTokenCount: inputTokens,
      outputTokenCount: outputTokens,
      retrievedDocuments: retrievedDocs,
      responseLatencyMs: latencyMs,
      guardrailAction: guardrailBlocked ? "BLOCKED" : "NONE",
      timestamp: new Date(ts).toISOString(),
      ...(isErr ? { status: "Failed" } : { status: "Succeeded" }),
    }),
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
    message: JSON.stringify({
      eventType: action,
      humanLoopName: loopName,
      humanLoopStatus: loopStatus,
      confidenceThreshold: threshold,
      confidence,
      humanReviewRequired: thresholdBreach || action === "ConditionThresholdBreached",
      reviewerCount,
      taskCount,
      timestamp: new Date(ts).toISOString(),
      ...(isErr ? { status: "Failed" } : { status: "Succeeded" }),
    }),
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
    message: JSON.stringify({
      eventType: action,
      datastoreName,
      resourceType,
      responseCode,
      latencyMs,
      fhirVersion: "R4",
      timestamp: new Date(ts).toISOString(),
      ...(isErr ? { status: "Failed" } : { status: "Succeeded" }),
    }),
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
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.nova",
      provider: "bedrock.amazonaws.com",
      duration: latMs * 1e6,
    },
    message: JSON.stringify({
      eventType: "ModelInvocation",
      modelId: model.id,
      modelTier: model.tier,
      modality,
      inputTokenCount: inputTokens,
      outputTokenCount: outputTokens,
      cacheReadInputTokenCount: cacheReadTokens,
      invocationLatencyMs: latMs,
      streaming: isStreaming,
      timestamp: new Date(ts).toISOString(),
      ...(isErr ? { status: "Failed", errorCode } : { status: "Succeeded" }),
    }),
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
    message: JSON.stringify({
      eventType,
      projectName,
      modelVersion,
      isAnomalous: isAnomaly,
      confidence,
      anomalyLabel,
      inferenceLatencyMs: eventType === "DetectAnomalies" ? inferenceMs : null,
      timestamp: new Date(ts).toISOString(),
      ...(isErr ? { status: "Failed" } : { status: "Succeeded" }),
    }),
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
    message: JSON.stringify({
      eventType: "WorkflowRunStateChange",
      workflowId,
      runId,
      engine,
      runStatus,
      tasksCompleted,
      tasksFailed,
      storageGbUsed,
      timestamp: new Date(ts).toISOString(),
      ...(isErr ? { status: "Failed", errorCode } : { status: "Succeeded" }),
    }),
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
    message: JSON.stringify({
      eventType: "DataAutomationInvocation",
      projectId,
      invocationId,
      inputType,
      blueprintId,
      invocationStatus: status,
      pagesProcessed,
      tokensUsed,
      confidenceScore,
      timestamp: new Date(ts).toISOString(),
      ...(isErr ? { outcome: "Failed", errorCode } : { outcome: "Succeeded" }),
    }),
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
    message: JSON.stringify({
      eventType: ev,
      modelName: model,
      anomalyDetected: isErr,
      diagnosticsScore: randFloat(0, 1),
      dataPointsIngested: randInt(100, 50000),
      inferenceLatencyMs: randInt(50, isErr ? 5000 : 500),
      timestamp: new Date(ts).toISOString(),
      ...(isErr ? { status: "Failed" } : { status: "Succeeded" }),
    }),
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
    message: JSON.stringify({
      eventType: "SensorReading",
      projectName: project,
      sensorId: sensor,
      machineCondition: condition,
      vibrationIsoRms: randFloat(0.1, isErr ? 25 : 4),
      temperatureCelsius: randFloat(20, isErr ? 95 : 60),
      batteryLevelPct: randInt(10, 100),
      timestamp: new Date(ts).toISOString(),
      ...(isErr ? { status: "Failed" } : { status: "Succeeded" }),
    }),
  };
}

export {
  generateBedrockLog,
  generateBedrockAgentLog,
  generateRekognitionLog,
  generateTextractLog,
  generateComprehendLog,
  generateComprehendMedicalLog,
  generateTranslateLog,
  generateTranscribeLog,
  generatePollyLog,
  generatePersonalizeLog,
  generateLexLog,
  generateQBusinessLog,
  generateA2iLog,
  generateHealthLakeLog,
  generateNovaLog,
  generateLookoutVisionLog,
  generateHealthOmicsLog,
  generateBedrockDataAutomationLog,
  generateLookoutEquipmentLog,
  generateMonitronLog,
};
