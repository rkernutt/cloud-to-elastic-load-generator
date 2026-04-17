/**
 * AWS native-fidelity overhaul — execution order and alignment targets.
 *
 * Phase 1 (this repo): **generators** — shapes as close as practical to telemetry that
 * reaches Elasticsearch after real AWS → Elastic ingest (CloudWatch, S3, Firehose, Agent),
 * without claiming byte-for-byte parity with every API version.
 *
 * Phase 2: **installer/aws-custom-pipelines** — processors keyed on generator `message` /
 * service namespaces; tighten rename/json to match official Elastic AWS integration
 * behaviour where we mirror those datasets.
 *
 * Phase 3: **installer/aws-custom-dashboards** — ES|QL / field names validated against
 * Phase 1–2 output.
 *
 * Phase 4: **installer/aws-custom-ml-jobs** — datafeed queries and field names aligned
 * with indexed documents.
 *
 * Reference for field names and ingest behaviour (pin a version for production work):
 * - Elastic Integrations: `aws` package (logs + metrics datasets).
 * - AWS: CloudWatch Logs export / subscription JSON, S3 access log formats, etc.
 *
 * Use cluster + Kibana APIs (see project Elasticsearch skill) to diff mappings and
 * sample docs from a reference stack against `samples/aws/**` after export.
 */

export const AWS_FIDELITY_PHASES = ["generators", "pipelines", "dashboards", "ml_jobs"] as const;

export type AwsFidelityPhase = (typeof AWS_FIDELITY_PHASES)[number];

/** Ordered generator work: high-traffic services first, then breadth. */
export const AWS_GENERATOR_ROLLOUT_ORDER: readonly string[] = [
  "lambda",
  "apigateway",
  "ecs",
  "eks",
  "ec2",
  "s3",
  "dynamodb",
  "rds",
  "sns",
  "sqs",
  "kinesis",
  "cloudtrail",
  "vpc",
  "alb",
  "cloudfront",
  "waf",
  "guardduty",
  "securityhub",
  "config",
  // Remaining ids follow ALL_SERVICE_IDS order in tests / docs; expand as needed.
];
