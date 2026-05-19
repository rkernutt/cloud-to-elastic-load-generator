/**
 * GCP media processing log generators (Transcoder, Live Stream, Video Intelligence).
 */

import {
  type EcsDocument,
  rand,
  randInt,
  randId,
  randFloat,
  gcpCloud,
  makeGcpSetup,
  randOperationId,
  randSeverity,
} from "./helpers.js";

const GRPC_RPC_STATUSES = [
  "INTERNAL",
  "DEADLINE_EXCEEDED",
  "PERMISSION_DENIED",
  "RESOURCE_EXHAUSTED",
  "NOT_FOUND",
  "ALREADY_EXISTS",
  "UNAVAILABLE",
] as const;

type GrpcRpcStatus = (typeof GRPC_RPC_STATUSES)[number];

const GRPC_MESSAGES: Partial<Record<GrpcRpcStatus, string>> = {
  INTERNAL: "Media API internal error",
  DEADLINE_EXCEEDED: "Processing deadline exceeded for this media job",
  PERMISSION_DENIED: "Caller lacks required transcoder or storage permissions",
  RESOURCE_EXHAUSTED: "Regional encoder or API quota exhausted",
  NOT_FOUND: "Job, input URI, or channel resource was not found",
  ALREADY_EXISTS: "Resource with the same identifier already exists",
  UNAVAILABLE: "Media control plane temporarily unavailable",
};

function grpcStructuredFault(isErr: boolean): {
  spread: Record<string, unknown>;
  rpcLabel: Record<string, string>;
} {
  if (!isErr) return { spread: {}, rpcLabel: {} };
  const status_code = rand(GRPC_RPC_STATUSES);
  return {
    spread: {
      "gcp.rpc": { status_code },
      error: {
        code: status_code,
        message: GRPC_MESSAGES[status_code] ?? `RPC ${status_code}`,
        type: "gcp",
      },
    },
    rpcLabel: { "gcp.rpc.status_code": status_code },
  };
}

export function generateTranscoderLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const jobId = `transcoder-job-${randId(12).toLowerCase()}`;
  const presetKind = rand(["1080p", "720p", "social", "podcast"] as const);
  const templateId = `preset-${presetKind}-${randId(4)}`;
  const inputUri = `gs://${project.id}-media/raw/${randId(8)}.mp4`;
  const outputUri = `gs://${project.id}-media/out/${randId(8)}/`;
  const state = isErr ? rand(["FAILED", "PENDING"]) : rand(["PENDING", "RUNNING", "SUCCEEDED"]);
  const progressPercent = isErr ? randInt(0, 40) : randInt(45, 100);
  const codec = rand(["h264", "h265", "vp9", "av1"] as const);
  const resolution = rand(["1280x720", "1920x1080", "3840x2160", "854x480"]);
  const bitrateKbps = randInt(800, 25_000);
  const durationSeconds = isErr ? 0 : randFloat(12, 7200);

  const SCENARIOS = [
    "create_job",
    "list_jobs",
    "get_job",
    "delete_job",
    "job_template_create",
    "ad_break_insert",
  ] as const;
  const scenario = rand(SCENARIOS);

  let apiMethod = "";
  let message = "";
  if (scenario === "create_job") {
    apiMethod = `transcoder.googleapis.com/v1/projects/${project.id}/locations/${region}/jobs`;
    message = isErr
      ? `TranscoderService.CreateJob FAILED Job.state=${state} input=${inputUri}: ${GRPC_MESSAGES.PERMISSION_DENIED}`
      : `CreateJob SUCCESS job=${jobId} preset=${templateId} input=${inputUri}`;
  } else if (scenario === "list_jobs") {
    apiMethod = `transcoder.googleapis.com/v1/projects/${project.id}/locations/${region}/jobs`;
    message = isErr
      ? `ListJobs FAILED page_size=${randInt(1, 100)} UNAVAILABLE`
      : `ListJobs returned ${randInt(0, 120)} jobs nextPageToken=present`;
  } else if (scenario === "get_job") {
    apiMethod = `transcoder.googleapis.com/v1/projects/${project.id}/locations/${region}/jobs/${jobId}`;
    message = isErr
      ? `GetJob FAILED ${jobId}: NOT_FOUND`
      : `GetJob ${jobId} state=${state} progress=${progressPercent}%`;
  } else if (scenario === "delete_job") {
    apiMethod = `transcoder.googleapis.com/v1/projects/${project.id}/locations/${region}/jobs/${jobId}`;
    message = isErr
      ? `DeleteJob FAILED ${jobId}: FAILED_PRECONDITION (job running)`
      : `DeleteJob completed job=${jobId}`;
  } else if (scenario === "job_template_create") {
    apiMethod = `transcoder.googleapis.com/v1/projects/${project.id}/locations/${region}/jobTemplates`;
    message = isErr
      ? `CreateJobTemplate FAILED template_id=${templateId}: ALREADY_EXISTS`
      : `CreateJobTemplate ${templateId} elements=${randInt(2, 12)}`;
  } else {
    apiMethod = `transcoder.googleapis.com/v1/projects/${project.id}/locations/${region}/jobs/${jobId}:insertAdBreak`;
    message = isErr
      ? `InsertAdBreak FAILED job=${jobId} splice_event_id=${randId(6)} RESOURCE_EXHAUSTED`
      : `Ad break inserted job=${jobId} cue=${rand(["pre-roll", "mid-roll"])} output_uri=${outputUri}`;
  }

  const { spread: faultSpread, rpcLabel } = grpcStructuredFault(isErr);
  const severity = randSeverity(isErr);

  return {
    "@timestamp": ts,
    severity,
    log: { level: severity.toLowerCase() },
    labels: {
      "resource.type": "transcoder.googleapis.com/Job",
      job_id: jobId,
      api_method: apiMethod,
      transcoder_scenario: scenario,
      ...rpcLabel,
    },
    cloud: gcpCloud(region, project, "transcoder.googleapis.com"),
    gcp: {
      transcoder: {
        scenario,
        api_method: apiMethod,
        job_id: jobId,
        template_id: templateId,
        input_uri: inputUri,
        output_uri: outputUri,
        state,
        progress_percent: progressPercent,
        codec,
        resolution,
        bitrate_kbps: bitrateKbps,
        duration_seconds: Math.round(durationSeconds * 100) / 100,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(2000, isErr ? 3_600_000 : 1_200_000),
    },
    message,
    ...faultSpread,
  };
}

export function generateLiveStreamLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const channelTopic = rand(["news", "sports", "corporate", "events"] as const);
  const channelId = `ch-${channelTopic}-${randId(5)}`;
  const inputKind = rand(["primary", "backup", "srt-ingest"] as const);
  const inputName = `input-${inputKind}`;
  const streamProtocol = rand(["RTMP", "SRT"] as const);
  const resolution = rand(["1920x1080", "1280x720", "3840x2160"]);
  const frameRates = [24, 25, 29.97, 30, 50, 60] as const;
  const frameRate = frameRates[randInt(0, frameRates.length - 1)]!;
  const bitrateMbps = randFloat(3, isErr ? 8 : 25);

  const SCENARIOS = [
    "create_channel",
    "start_channel",
    "create_input",
    "create_event",
    "failover",
    "stop_channel",
  ] as const;
  const scenario = rand(SCENARIOS);

  let apiMethod = "";
  let message = "";
  let eventType = rand([
    "CHANNEL_STARTED",
    "CHANNEL_STOPPED",
    "INPUT_CONNECTED",
    "INPUT_DISCONNECTED",
    "FAILOVER",
  ] as const);

  if (scenario === "create_channel") {
    apiMethod = `livestream.googleapis.com/v1/projects/${project.id}/locations/${region}/channels`;
    eventType = "CHANNEL_STOPPED";
    message = isErr
      ? `CreateChannel FAILED ${channelId}: PERMISSION_DENIED`
      : `CreateChannel ${channelId} input_attachments=${randInt(1, 3)}`;
  } else if (scenario === "start_channel") {
    apiMethod = `livestream.googleapis.com/v1/projects/${project.id}/locations/${region}/channels/${channelId}:start`;
    eventType = "CHANNEL_STARTED";
    message = isErr
      ? `StartChannel FAILED ${channelId}: UNAVAILABLE`
      : `StartChannel ${channelId} rtmp_key_suffix=****`;
  } else if (scenario === "create_input") {
    apiMethod = `livestream.googleapis.com/v1/projects/${project.id}/locations/${region}/inputs`;
    eventType = "INPUT_CONNECTED";
    message = isErr
      ? `CreateInput FAILED ${inputName}: ALREADY_EXISTS`
      : `CreateInput ${inputName} tier=${rand(["SD", "HD", "UHD"])}`;
  } else if (scenario === "create_event") {
    apiMethod = `livestream.googleapis.com/v1/projects/${project.id}/locations/${region}/channels/${channelId}/events`;
    eventType = rand(["CHANNEL_STARTED", "INPUT_CONNECTED"]);
    message = isErr
      ? `CreateEvent FAILED channel=${channelId}: DEADLINE_EXCEEDED`
      : `CreateEvent ad_break=${rand(["enabled", "disabled"])} slate_uri=gs://...`;
  } else if (scenario === "failover") {
    apiMethod = `livestream.googleapis.com/v1/projects/${project.id}/locations/${region}/channels/${channelId}:failover`;
    eventType = "FAILOVER";
    message = isErr
      ? `FAILOVER FAILED channel=${channelId}: Primary input signal lost; backup attach error INTERNAL`
      : `FAILOVER completed channel=${channelId} from=${inputName} protocol=${streamProtocol}`;
  } else {
    apiMethod = `livestream.googleapis.com/v1/projects/${project.id}/locations/${region}/channels/${channelId}:stop`;
    eventType = "CHANNEL_STOPPED";
    message = isErr
      ? `StopChannel FAILED ${channelId}: NOT_FOUND`
      : `StopChannel graceful ${channelId} drain_s=${randInt(2, 45)}`;
  }

  const { spread: faultSpread, rpcLabel } = grpcStructuredFault(isErr);
  const severity = randSeverity(isErr);

  return {
    "@timestamp": ts,
    severity,
    log: { level: severity.toLowerCase() },
    labels: {
      "resource.type": "livestream.googleapis.com/Channel",
      channel_id: channelId,
      api_method: apiMethod,
      live_stream_scenario: scenario,
      ...rpcLabel,
    },
    cloud: gcpCloud(region, project, "livestream.googleapis.com"),
    gcp: {
      live_stream: {
        scenario,
        api_method: apiMethod,
        channel_id: channelId,
        input_name: inputName,
        event_type: eventType,
        stream_protocol: streamProtocol,
        resolution,
        bitrate_mbps: Math.round(bitrateMbps * 10) / 10,
        frame_rate: frameRate,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(500, 600_000),
    },
    message,
    ...faultSpread,
  };
}

export function generateVideoIntelligenceLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const operationId = randOperationId();
  const inputUri = `gs://${project.id}-video/source/${randId(10)}.mp4`;
  const features = rand([
    "LABEL_DETECTION",
    "SHOT_CHANGE_DETECTION",
    "EXPLICIT_CONTENT_DETECTION",
    "SPEECH_TRANSCRIPTION",
    "TEXT_DETECTION",
    "OBJECT_TRACKING",
  ] as const);
  const videoDurationSeconds = randFloat(5, 7200);
  const segmentsAnalyzed = isErr ? randInt(0, 3) : randInt(8, 2000);
  const annotationsCount = isErr ? randInt(0, 20) : randInt(50, 500_000);

  const SCENARIOS = [
    "annotate_video",
    "detect_person",
    "detect_object",
    "track_shot",
    "speech_transcribe",
    "longrunning_get",
  ] as const;
  const scenario = rand(SCENARIOS);

  let apiMethod = "";
  let message = "";
  if (scenario === "annotate_video") {
    apiMethod = `videointelligence.googleapis.com/v1/videos:annotate`;
    message = isErr
      ? `VideoIntelligence.AnnotateVideo FAILED operation=${operationId} feature=${features}: ${GRPC_MESSAGES.RESOURCE_EXHAUSTED}`
      : `AnnotateVideo LRO started operation=${operationId} features=${features} input_uri=${inputUri}`;
  } else if (scenario === "detect_person") {
    apiMethod = `videointelligence.googleapis.com/v1/videos:annotatePerson`;
    message = isErr
      ? `Person detection FAILED ${operationId}: PERMISSION_DENIED on input object`
      : `PersonDetection tracks=${randInt(0, 80)} confidence_min=${randFloat(0.4, 0.95).toFixed(2)}`;
  } else if (scenario === "detect_object") {
    apiMethod = `videointelligence.googleapis.com/v1/videos:annotateObject`;
    message = isErr
      ? `Object tracking FAILED ${operationId}: INVALID_INPUT_URI`
      : `ObjectTracking entities=${annotationsCount} segments=${segmentsAnalyzed}`;
  } else if (scenario === "track_shot") {
    apiMethod = `videointelligence.googleapis.com/v1/videos:annotateShotChange`;
    message = isErr
      ? `ShotChangeDetection FAILED DEADLINE_EXCEEDED operation=${operationId}`
      : `ShotChangeDetection cuts=${randInt(3, 900)} duration_sec=${videoDurationSeconds.toFixed(0)}`;
  } else if (scenario === "speech_transcribe") {
    apiMethod = `videointelligence.googleapis.com/v1/videos:annotateSpeechTranscription`;
    message = isErr
      ? `SpeechTranscription FAILED ${operationId}: Unsupported audio codec`
      : `SpeechTranscription transcripts=${randInt(1, 220)} language=${rand(["en-US", "es-ES", "de-DE"])}`;
  } else {
    apiMethod = `videointelligence.googleapis.com/v1/operations/${operationId}`;
    message = isErr
      ? `operations.get FAILED ${operationId}: NOT_FOUND`
      : `operations.get DONE annotations=${annotationsCount} progress=100%`;
  }

  const { spread: faultSpread, rpcLabel } = grpcStructuredFault(isErr);
  const severity = randSeverity(isErr);

  return {
    "@timestamp": ts,
    severity,
    log: { level: severity.toLowerCase() },
    labels: {
      "resource.type": "videointelligence.googleapis.com/Operation",
      operation: operationId,
      api_method: apiMethod,
      video_intel_scenario: scenario,
      ...rpcLabel,
    },
    cloud: gcpCloud(region, project, "videointelligence.googleapis.com"),
    gcp: {
      video_intelligence: {
        scenario,
        api_method: apiMethod,
        operation_id: operationId,
        input_uri: inputUri,
        features,
        video_duration_seconds: Math.round(videoDurationSeconds * 100) / 100,
        segments_analyzed: segmentsAnalyzed,
        annotations_count: annotationsCount,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(5000, isErr ? 3_600_000 : 900_000),
    },
    message,
    ...faultSpread,
  };
}
