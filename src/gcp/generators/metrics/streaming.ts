/**
 * GCP streaming / data processing metric generators: Pub/Sub, Dataflow.
 */

import { GCP_METRICS_DATASET_MAP } from "../../data/elasticMaps.js";
import {
  randInt,
  jitter,
  dp,
  gcpMetricDoc,
  pickGcpCloudContext,
  toInt64String,
  distributionFromMs,
} from "./helpers.js";
import type { EcsDocument } from "../../../aws/generators/types.js";

const TOPICS = ["events-ingest", "orders", "audit", "telemetry"];
const SUBSCRIPTIONS = ["events-sub", "orders-worker", "audit-archive", "telemetry-dlq"];

export function generatePubSubMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP.pubsub!;
  const topic_id = TOPICS[randInt(0, TOPICS.length - 1)]!;
  const subscription_id = SUBSCRIPTIONS[randInt(0, SUBSCRIPTIONS.length - 1)]!;
  const backlog = Math.random() < er;
  const topicRes = { project_id: project.id, topic_id };
  const subRes = { project_id: project.id, subscription_id };
  const sendOp = randInt(1200, backlog ? 9_000_000 : 7_500_000);
  const msgSizeMs = backlog ? jitter(420, 180, 5, 9000) : jitter(14, 9, 1, 220);
  const undelivered = backlog ? randInt(50_000, 8_000_000) : randInt(0, 85_000);
  const oldestAge = jitter(backlog ? 880 : 14, backlog ? 380 : 9, 0, 7200);
  const pullAck = randInt(900, backlog ? 7_200_000 : 6_800_000);
  const sent = randInt(800, backlog ? 6_800_000 : 6_400_000);

  return [
    gcpMetricDoc(ts, "pubsub", dataset, region, project, {
      metricType: "pubsub.googleapis.com/topic/send_message_operation_count",
      resourceType: "pubsub_topic",
      resourceLabels: topicRes,
      metricLabels: { response_code: "success" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(sendOp) },
    }),
    gcpMetricDoc(ts, "pubsub", dataset, region, project, {
      metricType: "pubsub.googleapis.com/topic/message_sizes",
      resourceType: "pubsub_topic",
      resourceLabels: topicRes,
      metricKind: "DELTA",
      valueType: "DISTRIBUTION",
      point: distributionFromMs(msgSizeMs, randInt(400, 9000), backlog),
    }),
    gcpMetricDoc(ts, "pubsub", dataset, region, project, {
      metricType: "pubsub.googleapis.com/subscription/num_undelivered_messages",
      resourceType: "pubsub_subscription",
      resourceLabels: subRes,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(undelivered) },
    }),
    gcpMetricDoc(ts, "pubsub", dataset, region, project, {
      metricType: "pubsub.googleapis.com/subscription/oldest_unacked_message_age",
      resourceType: "pubsub_subscription",
      resourceLabels: subRes,
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: { doubleValue: dp(oldestAge) },
    }),
    gcpMetricDoc(ts, "pubsub", dataset, region, project, {
      metricType: "pubsub.googleapis.com/subscription/pull_ack_message_operation_count",
      resourceType: "pubsub_subscription",
      resourceLabels: subRes,
      metricLabels: { response_code: "success" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(pullAck) },
    }),
    gcpMetricDoc(ts, "pubsub", dataset, region, project, {
      metricType: "pubsub.googleapis.com/subscription/sent_message_count",
      resourceType: "pubsub_subscription",
      resourceLabels: subRes,
      metricLabels: { response_code: "success" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(sent) },
    }),
  ];
}

const DATAFLOW_JOBS = ["etl-pipeline", "stream-enrich", "window-agg", "export-daily"];

export function generateDataflowMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP.dataflow!;
  const job_name = DATAFLOW_JOBS[randInt(0, DATAFLOW_JOBS.length - 1)]!;
  const laggy = Math.random() < er;
  const res = { project_id: project.id, job_name, region };
  const sysLag = jitter(laggy ? 410 : 7.5, laggy ? 190 : 4.5, 0, 3600);
  const wmLag = jitter(laggy ? 360 : 4.8, laggy ? 140 : 2.8, 0, 1800);
  const elems = randInt(120_000, laggy ? 520_000_000 : 420_000_000);
  const vcpu = randInt(laggy ? 32 : 4, laggy ? 420 : 320);

  return [
    gcpMetricDoc(ts, "dataflow", dataset, region, project, {
      metricType: "dataflow.googleapis.com/job/system_lag",
      resourceType: "dataflow_job",
      resourceLabels: res,
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: { doubleValue: dp(sysLag) },
    }),
    gcpMetricDoc(ts, "dataflow", dataset, region, project, {
      metricType: "dataflow.googleapis.com/job/data_watermark_age",
      resourceType: "dataflow_job",
      resourceLabels: res,
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: { doubleValue: dp(wmLag) },
    }),
    gcpMetricDoc(ts, "dataflow", dataset, region, project, {
      metricType: "dataflow.googleapis.com/job/elements_produced_count",
      resourceType: "dataflow_job",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(elems) },
    }),
    gcpMetricDoc(ts, "dataflow", dataset, region, project, {
      metricType: "dataflow.googleapis.com/job/current_vcpu_count",
      resourceType: "dataflow_job",
      resourceLabels: res,
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: { doubleValue: dp(vcpu) },
    }),
  ];
}
