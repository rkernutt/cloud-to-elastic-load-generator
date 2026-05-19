import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

const GEMINI_MODELS = ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.0-ultra"] as const;

const FAIL_BY_IDX = [
  {
    code: "FAILED_PRECONDITION",
    labels: { "gemini.failure": "safety_blocked", policy: "blocked_harm_categories" },
  },
  {
    code: "RESOURCE_EXHAUSTED",
    labels: { "gemini.failure": "quota.tokens_per_minute" },
  },
  {
    code: "DEADLINE_EXCEEDED",
    labels: { "gemini.failure": "stream_stall_inference" },
  },
  {
    code: "INVALID_ARGUMENT",
    labels: { "gemini.failure": "grounding_config_malformed" },
  },
  {
    code: "ABORTED",
    labels: { "gemini.failure": "assembler_partial_truncation" },
  },
] as const;

export function generateGeminiTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "production", "staging", "dev"]);
  const model = rand(GEMINI_MODELS);
  const otel = gcpOtelMeta("python");
  const svc = gcpServiceBase("ai-assistant-api", env, "python", {
    runtimeName: "python",
    runtimeVersion: "3.12",
  });
  const genCloud = gcpCloud(region, project, "generativelanguage.googleapis.com");

  const promptTokens = randInt(50, 4096);
  const completionTokens = isErr ? randInt(0, 128) : randInt(10, 2048);

  const spansDef = [
    {
      key: "preprocess",
      name: "Gemini.prompt_preprocess",
      subtype: "internal",
      us: randInt(1_500, 35_000),
      labels: {
        model,
        "gcp.vertexai.phase": "preprocess",
        tokenizer: "sentencepiece",
      },
      dest: { resource: "generativelanguage.googleapis.com", type: "external", name: "gemini" },
    },
    {
      key: "safety",
      name: "Gemini.SafetyRatings.evaluate",
      subtype: "gemini",
      us: randInt(2_000, 120_000),
      labels: {
        model,
        "gcp.vertexai.phase": "safety_filter",
        "gemini.threshold": "BLOCK_MEDIUM_AND_ABOVE",
      },
      dest: { resource: "generativelanguage.googleapis.com", type: "external", name: "gemini" },
    },
    {
      key: "infer",
      name: "Gemini.GenerateContent.predict",
      subtype: "gemini",
      us: randInt(80_000, 2_200_000),
      labels: {
        model,
        "gcp.vertexai.phase": "model_inference",
        prompt_token_estimate: String(promptTokens),
      },
      dest: { resource: "generativelanguage.googleapis.com", type: "external", name: "gemini" },
    },
    {
      key: "stream",
      name: "Gemini.streamGenerateContent.tokens",
      subtype: "gemini",
      us: randInt(20_000, 900_000),
      labels: {
        model,
        "gcp.vertexai.phase": "token_stream",
        streamed_tokens: String(completionTokens),
      },
      dest: { resource: "generativelanguage.googleapis.com", type: "external", name: "gemini" },
    },
    {
      key: "ground",
      name: "Gemini.grounding.FetchAndRank",
      subtype: "gemini",
      us: randInt(15_000, 400_000),
      labels: {
        model,
        "gcp.vertexai.phase": "grounding",
        source: rand(["VERTEX_AI_SEARCH", "GOOGLE_SEARCH_RETRIEVAL"]),
      },
      dest: { resource: "generativelanguage.googleapis.com", type: "external", name: "gemini" },
    },
    {
      key: "assemble",
      name: "Gemini.response_assembler",
      subtype: "internal",
      us: randInt(1_000, 45_000),
      labels: {
        model,
        "gcp.vertexai.phase": "response_assembly",
        finish_reason: "STOP",
      },
      dest: { resource: "generativelanguage.googleapis.com", type: "external", name: "gemini" },
    },
  ];

  const spanCount = spansDef.length;
  const failIdx = isErr ? randInt(0, spanCount - 1) : -1;
  const failMeta = failIdx >= 0 ? FAIL_BY_IDX[failIdx % FAIL_BY_IDX.length]! : null;

  let offsetMs = randInt(0, 4);
  const spanDocs: EcsDocument[] = [];
  let totalUs = 0;

  for (let i = 0; i < spanCount; i++) {
    const def = spansDef[i]!;
    const sid = randSpanId();
    totalUs += def.us;
    const spanErr = failIdx === i;
    spanDocs.push({
      "@timestamp": offsetTs(base, offsetMs),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sid,
        type: "external",
        subtype: def.subtype,
        name: def.name,
        duration: { us: def.us },
        action: "infer",
        destination: { service: def.dest },
        labels: def.labels,
      },
      service: svc,
      cloud: genCloud,
      data_stream: APM_DS,
      labels: {
        ...def.labels,
        "gcp.generative_ai.product": "gemini",
        ...(spanErr
          ? {
              "gcp.rpc.status_code": failMeta!.code,
              "error.type": `gemini.${failMeta!.labels["gemini.failure"]}`,
              "error.message": `Gemini pipeline failed at ${def.labels["gcp.vertexai.phase"]}`,
              ...failMeta!.labels,
            }
          : {}),
      },
      event: { outcome: spanErr ? "failure" : "success" },
      ...otel,
      ...gcpCloudTraceMeta(project.id, traceId, sid),
    });
    offsetMs += Math.max(1, Math.round(def.us / 1000));
  }

  const txOverhead = randInt(100, 1000) * 1000;
  const txErr = failIdx >= 0;

  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: "gemini streamGenerateContent",
      type: "request",
      duration: { us: totalUs + txOverhead },
      result: txErr ? "failure" : "success",
      sampled: true,
      span_count: { started: spanDocs.length, dropped: 0 },
    },
    service: svc,
    cloud: genCloud,
    labels: {
      model,
      "gcp.generative_ai.product": "gemini",
      prompt_token_count: String(promptTokens),
      completion_token_count: String(completionTokens),
      ...(txErr && failMeta ? failMeta.labels : {}),
    },
    data_stream: APM_DS,
    event: { outcome: txErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, ...spanDocs];
}
