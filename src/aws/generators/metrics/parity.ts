/**
 * Metric parity augmentation.
 *
 * Dashboards / ML jobs / rules historically read a handful of CloudWatch metrics
 * out of `logs-aws.*` (they were embedded in log documents). Those embeds have been
 * removed so logs match the real Elastic AWS integration. This module re-emits the
 * SAME real CloudWatch metric fields from the metrics generators (into `metrics-aws.*`),
 * so the repointed assets resolve against real metric data streams — both here and on
 * a real deployment where these fields are genuine CloudWatch metrics.
 *
 * Only real CloudWatch metric names are added here. Application-level values that AWS
 * does not publish to CloudWatch (e.g. Spark/YARN task counters, model accuracy) are
 * intentionally NOT re-emitted; their asset references are dropped instead.
 *
 * Keyed by METRICS_GENERATORS service id; merged (fill-missing, never overwrite) into
 * the document's `aws.<service>.metrics` object by {@link applyMetricParity}.
 */

import { stat, counter, dp, jitter } from "./helpers.js";
import { randInt, randFloat } from "../../../helpers";

type ParityFn = (er: number) => Record<string, unknown>;

/** Stat object carrying extra percentile keys (p50/p90/p95/p99) alongside avg/sum/count. */
function pstat(avg: number, percentiles: Record<string, number>): Record<string, number> {
  const base = stat(avg);
  for (const [k, v] of Object.entries(percentiles)) base[k] = dp(v);
  return base;
}

/** true with probability p (error-gated events). */
const chance = (p: number) => Math.random() < p;

export const AWS_METRIC_PARITY: Record<string, ParityFn> = {
  // ── Databases & storage ────────────────────────────────────────────────────
  aurora: (er) => ({
    // Aurora Serverless v2 capacity utilization + Global DB recovery-point lag.
    ACUUtilization: stat(dp(jitter(35, 25, 1, 100))),
    AuroraGlobalDBProgressLag: stat(
      dp(chance(er) ? jitter(3000, 2000, 200, 60_000) : jitter(150, 100, 0, 2000))
    ),
  }),
  elasticache: () => ({
    TrafficBasedCmdsLatency: stat(dp(jitter(120, 90, 10, 5000))),
  }),
  fsx: () => ({
    CPUUtilization: stat(dp(jitter(30, 22, 1, 100))),
  }),
  storagegateway: () => ({
    CloudDownloadLatency: stat(dp(jitter(45, 35, 1, 2000))),
  }),

  // ── Analytics & AI / ML ────────────────────────────────────────────────────
  athena: () => {
    const eng = jitter(4200, 3000, 50, 120_000);
    return {
      EngineExecutionTimeInMillis: stat(dp(eng), { max: dp(eng * jitter(2, 0.4, 1, 5)) }),
      QueryPlanningTimeInMillis: stat(dp(jitter(180, 140, 5, 5000))),
      QueryQueueTimeInMillis: stat(dp(jitter(90, 80, 0, 10_000))),
    };
  },
  bedrock: (er) => {
    const lat = jitter(850, 600, 50, 15_000);
    return {
      InvocationLatency: pstat(dp(lat), { p99: dp(lat * jitter(2.5, 0.4, 1.2, 6)) }),
      Throttles: counter(chance(er) ? randInt(1, 80) : 0),
    };
  },
  medialive: (er) => ({
    ActiveAlerts: stat(chance(er) ? randInt(1, 6) : 0),
    ChannelInputErrorSeconds: counter(chance(er) ? randInt(1, 600) : 0),
  }),
  appflow: () => ({ DurationMs: stat(dp(jitter(4200, 3500, 100, 120_000))) }),
  databrew: () => ({ DurationSeconds: stat(dp(jitter(180, 150, 5, 7200))) }),
  quicksight: () => ({ EmbedCallCount: counter(randInt(0, 5000)) }),
  xray: () => {
    const l = jitter(0.25, 0.2, 0.005, 10);
    return {
      Latency: pstat(dp(l), {
        p50: dp(l * 0.8),
        p90: dp(l * 1.6),
        p95: dp(l * 2.1),
        p99: dp(l * 3.2),
      }),
    };
  },
  textract: (er) => ({ UserErrorRequests: counter(chance(er) ? randInt(1, 50) : 0) }),
  transcribe: (er) => ({ TranscriptionJobsFailed: counter(chance(er) ? randInt(1, 20) : 0) }),
  comprehend: (er) => ({ NumberOfFailedRequest: counter(chance(er) ? randInt(1, 40) : 0) }),
  lakeformation: () => ({ GrantCount: counter(randInt(0, 500)) }),
  mediaconvert: () => ({ JobsCompletedCount: counter(randInt(0, 2000)) }),
  firehose: () => ({ ExecuteProcessing: { Duration: stat(dp(jitter(120, 90, 1, 5000))) } }),
  // AWS Glue publishes Spark driver/executor job metrics to the "Glue" CloudWatch
  // namespace (scalar gauges), read directly (no stat sub-object).
  glue: (er) => ({
    driver: {
      aggregate: {
        elapsedTime: randInt(60_000, 9_000_000),
        numFailedTasks: chance(er) ? randInt(1, 50) : 0,
        numKilledTasks: randInt(0, 5),
        numRecords: randInt(0, 80_000_000),
      },
      jvm: { heap: { usage: dp(randFloat(0.1, 0.9), 2) } },
      ExecutorAllocationManager: { executors: { numberAllExecutors: randInt(2, 120) } },
    },
  }),

  // ── Security & management ──────────────────────────────────────────────────
  config: () => ({
    ComplianceByConfigRule: stat(dp(randFloat(60, 100))),
    CompliantRules: counter(randInt(0, 500)),
    ConfigurationItemsRecorded: counter(randInt(0, 20_000)),
  }),
  cognito: (er) => ({
    CompromisedCredentialsRisk: counter(chance(er) ? randInt(1, 30) : 0),
    ThrottleCount: counter(chance(er) ? randInt(1, 100) : 0),
  }),
  codepipeline: (er) => ({
    ActionFailureCount: counter(chance(er) ? randInt(1, 20) : 0),
    PipelineFailureCount: counter(chance(er) ? randInt(1, 10) : 0),
    PipelineSuccessCount: counter(randInt(0, 200)),
  }),
  cloudformation: (er) => ({ ErroredStack: stat(chance(er) ? randInt(1, 5) : 0) }),
  autoscaling: () => ({ GroupMinSize: stat(randInt(1, 10)) }),
  kms: (er) => ({ SecretsManagerCrossAccountBlocking: counter(chance(er) ? randInt(1, 10) : 0) }),
  appsync: () => ({ RequestCount: counter(randInt(0, 500_000)) }),
  imagebuilder: () => ({ BuildDuration: stat(dp(jitter(900, 600, 60, 7200))) }),
  gamelift: () => ({ PlacementsStarted: stat(randInt(0, 5000)) }),
  pinpoint: () => ({ DeliveryAttempts: counter(randInt(0, 1_000_000)) }),
  // Inspector2 resource coverage gauge (CriticalFindings already emitted).
  inspector: () => ({ CoveredResources: stat(randInt(50, 5000)) }),

  // ── Streaming & messaging ──────────────────────────────────────────────────
  kinesis: (er) => ({
    GetRecords: { Latency: stat(dp(jitter(30, 25, 1, 5000))) },
    PutRecords: { Latency: stat(dp(jitter(15, 12, 1, 3000))) },
    GetRecords_IteratorAgeMilliseconds: stat(
      dp(chance(er) ? jitter(60_000, 50_000, 0, 600_000) : jitter(500, 400, 0, 5000))
    ),
    PutRecords_FailedRecords: counter(chance(er) ? randInt(1, 500) : 0),
  }),
  // Step Functions ExecutionTime — add p99 percentile alongside existing avg/sum.
  stepfunctions: () => ({ ExecutionTime: { p99: dp(jitter(15_000, 8000, 500, 120_000)) } }),

  // ── Compute ────────────────────────────────────────────────────────────────
  ecr: () => ({ ImageCount: stat(randInt(1, 500)) }),
  elasticbeanstalk: () => ({ ApplicationLatencyP10: stat(dp(jitter(0.02, 0.015, 0.001, 2))) }),

  // ── IoT & Kubernetes (Container Insights) ──────────────────────────────────
  eks: () => ({
    pod_network_rx_bytes: counter(randInt(1000, 50_000_000)),
    pod_network_tx_bytes: counter(randInt(1000, 50_000_000)),
  }),
  iotcore: (er) => ({ PublishIn: { ClientError: counter(chance(er) ? randInt(1, 200) : 0) } }),
  iotsitewise: () => ({ GatewayDataStreamPartitionCount: stat(randInt(1, 50)) }),
  greengrass: () => ({ ComponentDeployedCount: counter(randInt(0, 200)) }),

  // ── Previously generic / management ────────────────────────────────────────
  appstream: () => ({ ActiveSessions: stat(randInt(0, 500)) }),
  detective: () => ({ TotalFindingCount: stat(randInt(0, 2000)) }),
};

/** Recursively add keys from src that are missing in target; never overwrite. */
function fillMissing(target: Record<string, unknown>, src: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(src)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      if (!target[k] || typeof target[k] !== "object") target[k] = {};
      fillMissing(target[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else if (!(k in target)) {
      target[k] = v;
    }
  }
}

/**
 * Merge parity metric fields into a metric document's `aws.<service>.metrics`.
 * `id` is the METRICS_GENERATORS service id; parity fields are merged into whichever
 * `aws.<key>` in the doc actually carries a `metrics` object.
 */
export function applyMetricParity(
  doc: Record<string, unknown>,
  id: string,
  er: number
): Record<string, unknown> {
  const parity = AWS_METRIC_PARITY[id];
  if (!parity) return doc;
  const aws = doc.aws as Record<string, { metrics?: Record<string, unknown> }> | undefined;
  if (!aws) return doc;
  for (const key of Object.keys(aws)) {
    const metrics = aws[key]?.metrics;
    if (metrics && typeof metrics === "object") {
      fillMissing(metrics, parity(er));
      break;
    }
  }
  return doc;
}
