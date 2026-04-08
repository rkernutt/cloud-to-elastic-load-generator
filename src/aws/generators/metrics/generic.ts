/**
 * Generic CloudWatch metric document generator — fallback for any service
 * that doesn't have a dedicated dimensional generator.
 * Produces plausible-looking CloudWatch-shaped documents with synthetic metrics.
 */

import {
  REGIONS,
  ACCOUNTS,
  randInt,
  dp,
  stat,
  counter,
  metricDoc,
  pickCloudContext,
  jitter,
} from "./helpers.js";
import type { MetricGenerator } from "../types.js";

// Generic metric shapes keyed by service family
const SERVICE_METRIC_TEMPLATES: Record<
  string,
  Array<{ dim: string; vals: string[] } | { metrics: (er: number) => Record<string, unknown> }>
> = {
  // IoT-like
  iot: [
    { dim: "Protocol", vals: ["MQTT", "HTTPS", "WSS"] },
    {
      metrics: (er) => ({
        Connect_Success: counter(randInt(0, 50_000)),
        Connect_Failure: counter(Math.random() < er ? randInt(1, 1_000) : 0),
        Publish_Success: counter(randInt(0, 1_000_000)),
        RulesExecuted: counter(randInt(0, 500_000)),
      }),
    },
  ],
  // Management-like
  management: [
    { dim: "Region", vals: ["us-east-1", "us-west-2", "eu-west-1"] },
    {
      metrics: (er) => ({
        RequestCount: counter(randInt(0, 1_000_000)),
        ErrorCount: counter(Math.random() < er ? randInt(1, 10_000) : 0),
        SuccessCount: counter(randInt(0, 1_000_000)),
      }),
    },
  ],
  // Analytics-like
  analytics: [
    { dim: "JobName", vals: ["etl-job", "transform", "aggregation", "cleanup"] },
    {
      metrics: (er) => ({
        RecordsProcessed: counter(randInt(0, 10_000_000)),
        BytesProcessed: counter(randInt(0, 100_000_000_000)),
        ExecutionTime: stat(dp(jitter(30_000, 25_000, 1_000, 3_600_000))),
        ErrorCount: counter(Math.random() < er ? randInt(1, 100) : 0),
      }),
    },
  ],
  // Default / fallback
  default: [
    { dim: "Resource", vals: ["resource-1", "resource-2", "resource-3"] },
    {
      metrics: (er) => ({
        RequestCount: counter(randInt(0, 100_000)),
        ErrorCount: counter(Math.random() < er ? randInt(1, 1_000) : 0),
        Latency: stat(dp(jitter(100, 80, 5, 10_000))),
        ThrottleCount: counter(Math.random() < er * 0.2 ? randInt(1, 500) : 0),
      }),
    },
  ],
};

// Which template each service maps to
const TEMPLATE_MAP: Record<string, string> = {
  iotgreengrass: "iot",
  iotanalytics: "analytics",
  iotevents: "iot",
  iotsitewise: "iot",
  iotdefender: "iot",
  controltower: "management",
  organizations: "management",
  servicecatalog: "management",
  servicequotas: "management",
  computeoptimizer: "management",
  budgets: "management",
  resiliencehub: "management",
  migrationhub: "management",
  identitycenter: "management",
  detective: "management",
  verifiedaccess: "management",
  securitylake: "management",
  mediaconvert: "analytics",
  medialive: "analytics",
  managedblockchain: "management",
  frauddetector: "analytics",
  locationservice: "management",
  appstream: "management",
  codeguru: "analytics",
  qbusiness: "analytics",
  comprehendmedical: "analytics",
  networkmanager: "management",
  // v12.0 — confirmed CloudWatch metric emitters
  mskconnect: "analytics",
  mwaa: "analytics",
  cleanrooms: "analytics",
  kendra: "analytics",
  healthlake: "analytics",
  iottwinmaker: "iot",
  iotfleetwise: "iot",
  fis: "management",
  managedgrafana: "management",
  appconfig: "management",
  licensemanager: "management",
  deadlinecloud: "management",
};

/**
 * Generic metric generator for services without a dedicated generator.
 * @param serviceId - app service identifier (e.g. "iotgreengrass")
 * @param dataset   - data_stream.dataset (e.g. "aws.iotgreengrass")
 */
export function makeGenericGenerator(serviceId: string, dataset: string): MetricGenerator {
  const templateKey = TEMPLATE_MAP[serviceId] ?? "default";
  const template = SERVICE_METRIC_TEMPLATES[templateKey];
  const dimEntry = template.find((t): t is { dim: string; vals: string[] } => "dim" in t);
  const metricsFn =
    template.find((t): t is { metrics: (er: number) => Record<string, unknown> } => "metrics" in t)
      ?.metrics ?? (() => ({ RequestCount: counter(randInt(0, 100_000)) }));

  return function genericMetricGenerator(ts: string, er: number) {
    const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
    const dimKey = dimEntry?.dim ?? "Resource";
    const dimVals = dimEntry?.vals ?? ["resource-1", "resource-2"];
    const numDims = Math.min(randInt(1, 3), dimVals.length);

    return Array.from({ length: numDims }, (_, i) => {
      const dimVal = dimVals[i % dimVals.length];
      return metricDoc(
        ts,
        serviceId,
        dataset,
        region,
        account,
        { [dimKey]: dimVal },
        metricsFn(er)
      );
    });
  };
}
