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
} from "./helpers.js";

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
  const message = isErr
    ? `Transcoder job ${jobId} ${state}: ${rand(["Invalid input container", "Output bucket not writable", "Hardware encoder unavailable"])}`
    : `Transcoder job ${jobId} ${state} ${progressPercent}% (${codec}, ${resolution}, ${bitrateKbps} kbps, ${durationSeconds.toFixed(0)}s)`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "transcoder.googleapis.com"),
    gcp: {
      transcoder: {
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
  };
}

export function generateLiveStreamLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const channelTopic = rand(["news", "sports", "corporate", "events"] as const);
  const channelId = `ch-${channelTopic}-${randId(5)}`;
  const inputKind = rand(["primary", "backup", "srt-ingest"] as const);
  const inputName = `input-${inputKind}`;
  const eventType = rand([
    "CHANNEL_STARTED",
    "CHANNEL_STOPPED",
    "INPUT_CONNECTED",
    "INPUT_DISCONNECTED",
    "FAILOVER",
  ] as const);
  const streamProtocol = rand(["RTMP", "SRT"] as const);
  const resolution = rand(["1920x1080", "1280x720", "3840x2160"]);
  const bitrateMbps = randFloat(3, isErr ? 8 : 25);
  const frameRates = [24, 25, 29.97, 30, 50, 60] as const;
  const frameRate = frameRates[randInt(0, frameRates.length - 1)]!;
  const message = isErr
    ? `Live Stream ${eventType} on ${channelId}: ${rand(["Input signal lost", "Keyframe interval invalid", "Failover to backup failed"])}`
    : `Live Stream ${eventType} — ${channelId}/${inputName} (${streamProtocol}, ${resolution}@${frameRate}fps, ${bitrateMbps.toFixed(1)} Mbps)`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "livestream.googleapis.com"),
    gcp: {
      live_stream: {
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
  const message = isErr
    ? `Video Intelligence operation ${operationId} failed (${features}): ${rand(["Unsupported codec", "Object not found", "Analysis timeout"])}`
    : `Video Intelligence ${operationId} completed: ${features} on ${videoDurationSeconds.toFixed(0)}s video (${segmentsAnalyzed} segments, ${annotationsCount} annotations)`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "videointelligence.googleapis.com"),
    gcp: {
      video_intelligence: {
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
  };
}
