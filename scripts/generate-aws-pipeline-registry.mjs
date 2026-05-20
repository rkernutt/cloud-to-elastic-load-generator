/**
 * Generates installer/aws-custom-pipelines/pipelines/registry.mjs from
 * installer/aws-custom-pipelines/pipelines/manifest.json (service/dataset mappings).
 *
 * Each pipeline uses buildPipeline() from installer/shared/pipeline-processors.mjs:
 *   • ECS version + JSE00001 event.original handling
 *   • JSON parse from event.original → {ns}.parsed
 *   • Group-aware ECS normalisation
 *   • GeoIP, user-agent, related fields, duration conversion
 *   • on_failure error tagging (append error.message, pipeline_error, preserve_original_event)
 *
 * Run: npx vite-node scripts/generate-aws-pipeline-registry.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "installer/aws-custom-pipelines/pipelines");
const manifestPath = path.join(outDir, "manifest.json");
const outPath = path.join(outDir, "registry.mjs");
mkdirSync(outDir, { recursive: true });

const { buildPipeline, rename } = await import(
  path.join(root, "installer/shared/pipeline-processors.mjs")
);

/** @type {{ id: string, dataset: string, group: string, description: string }[]} */
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

/** AWS-specific processors inserted after JSON parse (keyed by dataset). */
const CUSTOM_BY_DATASET = {
  "aws.lambda_logs": [
    {
      grok: {
        field: "event.original",
        tag: "grok_lambda_log_lines",
        patterns: [
          "^REPORT RequestId: %{DATA:lambda.request_id}\\s+Duration: %{NUMBER:lambda.duration_ms:float} ms\\s+Billed Duration: %{NUMBER:lambda.billed_duration_ms:float} ms\\s+Memory Size: %{NUMBER:lambda.memory_size_mb:int} MB\\s+Max Memory Used: %{NUMBER:lambda.max_memory_used_mb:int} MB$",
          "^START RequestId: %{DATA:lambda.request_id}\\s+Version: %{DATA:lambda.version}$",
          "^END RequestId: %{DATA:lambda.request_id}$",
        ],
        ignore_failure: true,
        ignore_missing: true,
      },
    },
    {
      script: {
        lang: "painless",
        description: "Convert Lambda billed duration to event.duration (nanoseconds)",
        tag: "script_lambda_billed_duration",
        source:
          "if (ctx.lambda != null && ctx.lambda.billed_duration_ms != null && (ctx.event == null || ctx.event.duration == null)) { if (ctx.event == null) { ctx.event = new HashMap(); } ctx.event.duration = (long)(ctx.lambda.billed_duration_ms * 1000000L); }",
        ignore_failure: true,
      },
    },
    {
      script: {
        lang: "painless",
        description: "Calculate Lambda memory utilisation percentage",
        tag: "script_lambda_memory_utilization",
        source:
          "if (ctx.lambda != null && ctx.lambda.memory_size_mb != null && ctx.lambda.max_memory_used_mb != null && ctx.lambda.memory_size_mb > 0) { ctx.lambda.memory_utilization_pct = Math.round((ctx.lambda.max_memory_used_mb * 10000.0) / ctx.lambda.memory_size_mb) / 100.0; }",
        ignore_failure: true,
      },
    },
  ],
  "aws.athena": [
    rename("athena.parsed.queryId", "athena.query_id"),
    rename("athena.parsed.workgroup", "athena.workgroup"),
    rename("athena.parsed.database", "athena.database"),
    rename("athena.parsed.state", "athena.state"),
    rename("athena.parsed.durationSeconds", "athena.duration_seconds"),
    {
      script: {
        lang: "painless",
        description: "Convert Athena query duration to event.duration (nanoseconds)",
        tag: "script_athena_duration_seconds",
        source:
          "if (ctx.athena != null && ctx.athena.duration_seconds != null && (ctx.event == null || ctx.event.duration == null)) { if (ctx.event == null) { ctx.event = new HashMap(); } ctx.event.duration = (long)(ctx.athena.duration_seconds * 1000000000L); }",
        ignore_failure: true,
      },
    },
  ],
};

function datasetToNs(dataset) {
  if (!dataset.startsWith("aws.")) {
    throw new Error(`Expected aws.* dataset, got ${dataset}`);
  }
  return dataset.slice(4);
}

const entries = [];
for (const { id, dataset, group, description } of manifest) {
  const ns = datasetToNs(dataset);
  const custom = CUSTOM_BY_DATASET[dataset] ?? [];
  const { processors, on_failure } = buildPipeline({
    cloud: "aws",
    ns,
    group,
    pipelineId: id,
    custom,
  });
  entries.push({ id, dataset, group, description, processors, on_failure });
}
entries.sort((a, b) => a.dataset.localeCompare(b.dataset));

const header = `/**
 * Registry of custom Elasticsearch ingest pipelines for AWS services
 * not covered by the official Elastic AWS integration.
 *
 * Pipeline naming convention:  logs-aws.{dataset_suffix}-default
 * This matches the index pattern the load generator writes documents into,
 * so pipelines are applied automatically on ingest.
 *
 * Each pipeline includes:
 *   • ECS version + JSE00001 event.original handling
 *   • JSON parse from event.original → service-specific field extraction
 *   • Group-aware ECS normalisation (event.kind / category / type)
 *   • Log-level normalisation (lowercase)
 *   • Duration → nanosecond conversion via painless script
 *   • GeoIP enrichment on source.ip / client.ip / destination.ip
 *   • User-agent parsing on user_agent.original
 *   • related.ip / related.user / related.hosts population
 *   • Outcome-driven event.type override (failure → error)
 *   • Error field extraction from parsed JSON
 *   • Cleanup of intermediate fields
 *   • on_failure error tagging
 *
 * Services already covered by the official Elastic AWS integration are omitted:
 * cloudtrail, vpcflow, alb/nlb, guardduty, s3access, apigateway, cloudfront,
 * networkfirewall, securityhub, waf, rds (official), route53, emr (official),
 * ec2 (official), ecs, config, inspector, dynamodb, redshift, ebs, kinesis,
 * msk/kafka, sns, sqs, transitgateway, vpn, awshealth, billing, natgateway.
 *
 * **Generated file** — edit installer/aws-custom-pipelines/pipelines/manifest.json,
 * then run:  npx vite-node scripts/generate-aws-pipeline-registry.mjs
 */

`;

const body = `export const PIPELINE_REGISTRY = ${JSON.stringify(
  entries.map((e) => ({
    id: e.id,
    dataset: e.dataset,
    group: e.group,
    description: e.description,
    processors: e.processors,
    on_failure: e.on_failure,
  })),
  null,
  2
)};\n`;

writeFileSync(outPath, header + body, "utf8");
console.log(`Wrote ${entries.length} enhanced pipeline entries to ${path.relative(root, outPath)}`);
