/**
 * GCP streaming / data processing metric generators: Pub/Sub, Dataflow.
 */

import { GCP_METRICS_DATASET_MAP } from "../../data/elasticMaps.js";
import { randInt, jitter, dp, stat, counter, gcpMetricDoc, pickGcpCloudContext } from "./helpers.js";
import type { EcsDocument } from "../../../aws/generators/types.js";

const TOPICS = ["events-ingest", "orders", "audit", "telemetry"];
const SUBSCRIPTIONS = ["events-sub", "orders-worker", "audit-archive", "telemetry-dlq"];

export function generatePubSubMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP.pubsub!;
  const n = randInt(1, 3);
  return Array.from({ length: n }, (_, i) => {
    const topic = TOPICS[i % TOPICS.length];
    const subscription = SUBSCRIPTIONS[i % SUBSCRIPTIONS.length];
    const backlog = Math.random() < er;
    return gcpMetricDoc(ts, "pubsub", dataset, region, project, { topic, subscription }, {
      publish_message_count: counter(randInt(1_000, 8_000_000)),
      pull_message_count: counter(randInt(800, 7_500_000)),
      oldest_unacked_message_age: stat(dp(jitter(backlog ? 900 : 12, backlog ? 400 : 8, 0, 7200))),
      subscription_backlog_bytes: counter(
        backlog ? randInt(50_000_000, 5_000_000_000) : randInt(0, 50_000_000)
      ),
    });
  });
}

const DATAFLOW_JOBS = ["etl-pipeline", "stream-enrich", "window-agg", "export-daily"];
const STEPS = ["ReadFromPubSub", "ParDo-Parse", "GroupByKey", "WriteToBigQuery"];

export function generateDataflowMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP.dataflow!;
  const n = randInt(1, 3);
  return Array.from({ length: n }, (_, i) => {
    const job_name = DATAFLOW_JOBS[i % DATAFLOW_JOBS.length];
    const step = STEPS[i % STEPS.length];
    const laggy = Math.random() < er;
    return gcpMetricDoc(ts, "dataflow", dataset, region, project, { job_name, step }, {
      system_lag: stat(dp(jitter(laggy ? 420 : 8, laggy ? 200 : 5, 0, 3600))),
      data_watermark_lag: stat(dp(jitter(laggy ? 380 : 5, laggy ? 150 : 3, 0, 1800))),
      elements_produced: counter(randInt(100_000, 500_000_000)),
      current_num_vcpus: counter(randInt(4, 400)),
    });
  });
}
