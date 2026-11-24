import { rand, randInt, randFloat, randId, randAccount, REGIONS } from "../../helpers";
import type { EcsDocument } from "./types.js";

const ENDPOINTS = [
  "fraud-detection-prod",
  "sentiment-analysis",
  "product-recommend",
  "image-classifier",
  "forecasting-prod",
];

const JOB_STEMS = ["xgboost", "bert", "resnet50", "lstm", "deepar"];

type Workload = "training" | "processing" | "transform" | "endpoint";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Official built-in algorithm line. The bracket time is not @timestamp. */
function algorithmLine(ts: string, level: "INFO" | "ERROR", text: string): string {
  const d = new Date(ts);
  const stamp = `${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  return `[${stamp} ${level} ${randInt(100000000000, 999999999999)} train.py:${randInt(12, 90)}] ${text}`;
}

function jobName(stem: string, ts: string): string {
  const day = new Date(ts).toISOString().slice(0, 10).replace(/-/g, "");
  return `${stem}-${day}-${randId(6).toLowerCase()}`;
}

/**
 * CloudWatch container log in the shape the aws_sagemaker ingest pipeline indexes.
 * Message text is plaintext. Feature Store, Model Monitor, and fake pipeline logs
 * are not emitted here; those are not part of the integration.
 */
export function generateSageMakerLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const failed = Math.random() < er;
  const roll = Math.random();
  const workload: Workload =
    roll < 0.4 ? "training" : roll < 0.6 ? "processing" : roll < 0.75 ? "transform" : "endpoint";
  const stem = rand(JOB_STEMS);
  const name = jobName(stem, ts);
  const epoch = String(Math.floor(new Date(ts).getTime() / 1000));
  const member = String(randInt(1, 4));
  const endpoint = rand(ENDPOINTS);
  const variant = "AllTraffic";
  const instanceId = `i-${randId(16).toLowerCase()}`;

  let logGroup: string;
  let logStream: string;
  let message: string;
  const sagemaker: Record<string, unknown> = { workload };

  if (workload === "training") {
    logGroup = "/aws/sagemaker/TrainingJobs";
    logStream = `${name}/algo-${member}-${epoch}`;
    sagemaker.job = { name };
    sagemaker.instance = { member };
    sagemaker.stream = { epoch };
    if (failed) {
      message = rand([
        algorithmLine(
          ts,
          "ERROR",
          "Additional properties are not allowed (u'mini_batch_siz' was unexpected)"
        ),
        `FailureReason: AlgorithmError: framework error from container: ${rand(["OOM", "NCCL timeout", "CUDA driver error"])}`,
        'Traceback (most recent call last):\n  File "train.py", line 48, in <module>\nRuntimeError: CUDA out of memory',
      ]);
    } else {
      message = rand([
        "Starting - Starting the training job...",
        "Downloading - Downloading input data",
        `Train_error=${Number(randFloat(0.05, 0.4)).toFixed(6)};  Valid_error=${Number(randFloat(0.1, 0.5)).toFixed(6)};`,
        algorithmLine(ts, "INFO", "Training image download completed. Training in progress."),
      ]);
    }
  } else if (workload === "processing") {
    logGroup = "/aws/sagemaker/ProcessingJobs";
    const host = `algo-${member}-${epoch}`;
    const withSuffix = Math.random() < 0.3;
    logStream = withSuffix ? `${name}/${host}/data-log` : `${name}/${host}`;
    sagemaker.job = { name };
    sagemaker.host = host;
    if (withSuffix) sagemaker.stream = { suffix: "data-log" };
    message = failed
      ? "FailureReason: AlgorithmError: Exit code 1"
      : rand(["Starting processing job...", "Downloading input data", "Processing data..."]);
  } else if (workload === "transform") {
    logGroup = "/aws/sagemaker/TransformJobs";
    const host = `${instanceId}-${epoch}`;
    logStream = `${name}/${host}`;
    sagemaker.job = { name };
    sagemaker.host = host;
    message = failed
      ? "FailureReason: ClientError: Data download failed"
      : rand(["Starting transform job...", `Processing ${randInt(100, 10000)} records...`]);
  } else {
    logGroup = `/aws/sagemaker/Endpoints/${endpoint}`;
    logStream = `${variant}/${instanceId}`;
    sagemaker.endpoint = { name: endpoint };
    sagemaker.variant = { name: variant };
    sagemaker.host = { name: instanceId };
    message = failed
      ? rand([
          "FailureReason: ModelError: health check timeout after 300 seconds",
          algorithmLine(ts, "ERROR", "Worker failed to load model"),
        ])
      : rand(["Starting the inference server", "Model loaded", "Listening on port 8080"]);
  }

  const level = failed ? "error" : "info";
  return {
    __dataset: "aws_sagemaker.logs",
    "@timestamp": ts,
    ecs: { version: "9.3.0" },
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "sagemaker" },
    },
    data_stream: { type: "logs", dataset: "aws_sagemaker.logs", namespace: "default" },
    aws: { cloudwatch: { log_group: logGroup, log_stream: logStream } },
    aws_sagemaker: sagemaker,
    log: { level, logger: logGroup },
    event: {
      kind: "event",
      category: ["process"],
      type: ["info"],
      dataset: "aws_sagemaker.logs",
      module: "aws_sagemaker",
      outcome: failed ? "failure" : "success",
    },
    message,
  };
}
