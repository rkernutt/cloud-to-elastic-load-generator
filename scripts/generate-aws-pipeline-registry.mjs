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
  // OpenLineage RunEvents (Airflow provider / Spark listener) arriving over the
  // Elastic Agent HTTP Endpoint input. Curated aws.openlineage.* contract is
  // documented in src/aws/generators/openlineage.ts and
  // docs/chained-events/data-pipeline-lineage.md.
  "aws.openlineage": [
    rename("openlineage.parsed.eventType", "openlineage.event_type"),
    rename("openlineage.parsed.eventTime", "openlineage.event_time"),
    rename("openlineage.parsed.producer", "openlineage.producer"),
    rename("openlineage.parsed.schemaURL", "openlineage.schema_url"),
    rename("openlineage.parsed.run.runId", "openlineage.run.id"),
    rename("openlineage.parsed.run.facets.parent.run.runId", "openlineage.run.parent.id"),
    rename("openlineage.parsed.run.facets.parent.job.name", "openlineage.run.parent.job_name"),
    rename(
      "openlineage.parsed.run.facets.parent.job.namespace",
      "openlineage.run.parent.job_namespace"
    ),
    rename("openlineage.parsed.run.facets.parent.root.run.runId", "openlineage.run.root.id"),
    rename("openlineage.parsed.run.facets.parent.root.job.name", "openlineage.run.root.job_name"),
    rename(
      "openlineage.parsed.run.facets.nominalTime.nominalStartTime",
      "openlineage.run.nominal_start_time"
    ),
    rename(
      "openlineage.parsed.run.facets.nominalTime.nominalEndTime",
      "openlineage.run.nominal_end_time"
    ),
    rename("openlineage.parsed.job.namespace", "openlineage.job.namespace"),
    rename("openlineage.parsed.job.name", "openlineage.job.name"),
    rename("openlineage.parsed.job.facets.jobType.jobType", "openlineage.job.type"),
    rename("openlineage.parsed.job.facets.jobType.integration", "openlineage.job.integration"),
    rename(
      "openlineage.parsed.job.facets.jobType.processingType",
      "openlineage.job.processing_type"
    ),
    rename("openlineage.parsed.job.facets.sql.query", "openlineage.sql.query"),
    rename("openlineage.parsed.job.facets.sql.dialect", "openlineage.sql.dialect"),
    rename(
      "openlineage.parsed.run.facets.processing_engine.name",
      "openlineage.processing_engine.name"
    ),
    rename(
      "openlineage.parsed.run.facets.processing_engine.version",
      "openlineage.processing_engine.version"
    ),
    rename("openlineage.parsed.run.facets.airflow.dag.dag_id", "openlineage.airflow.dag_id"),
    rename("openlineage.parsed.run.facets.airflow.dagRun.run_id", "openlineage.airflow.run_id"),
    rename("openlineage.parsed.run.facets.airflow.task.task_id", "openlineage.airflow.task_id"),
    rename(
      "openlineage.parsed.run.facets.airflow.task.operator_class",
      "openlineage.airflow.operator_class"
    ),
    rename(
      "openlineage.parsed.run.facets.airflow.taskInstance.try_number",
      "openlineage.airflow.try_number"
    ),
    rename(
      "openlineage.parsed.run.facets.airflowState.dagRunState",
      "openlineage.airflow.dag_run_state"
    ),
    rename(
      "openlineage.parsed.run.facets.spark_applicationDetails.applicationId",
      "openlineage.spark.application_id"
    ),
    rename(
      "openlineage.parsed.run.facets.spark_applicationDetails.appName",
      "openlineage.spark.app_name"
    ),
    rename(
      "openlineage.parsed.run.facets.spark_applicationDetails.master",
      "openlineage.spark.master"
    ),
    rename(
      "openlineage.parsed.run.facets.spark_applicationDetails.deployMode",
      "openlineage.spark.deploy_mode"
    ),
    rename("openlineage.parsed.run.facets.errorMessage.message", "error.message"),
    rename("openlineage.parsed.run.facets.errorMessage.stackTrace", "error.stack_trace"),
    rename(
      "openlineage.parsed.run.facets.errorMessage.programmingLanguage",
      "openlineage.error.programming_language"
    ),
    {
      date: {
        field: "openlineage.event_time",
        target_field: "@timestamp",
        formats: ["ISO8601"],
        ignore_failure: true,
        tag: "date_openlineage_event_time",
      },
    },
    {
      script: {
        lang: "painless",
        tag: "script_openlineage_datasets",
        description:
          "Flatten OpenLineage inputs/outputs to dataset URIs; lift outputStatistics and output schema",
        source: [
          "def ol = ctx.openlineage; if (ol == null) return; def p = ol.parsed; if (p == null) return;",
          "def ins = new ArrayList(); def outs = new ArrayList();",
          "if (p.inputs instanceof List) { for (def d : p.inputs) { if (d.namespace != null && d.name != null) { String n = d.name.toString(); ins.add(n.startsWith('/') ? d.namespace + n : d.namespace + '/' + n); } } }",
          "if (p.outputs instanceof List) { for (def d : p.outputs) {",
          "  if (d.namespace != null && d.name != null) { String n = d.name.toString(); outs.add(n.startsWith('/') ? d.namespace + n : d.namespace + '/' + n); }",
          "  if (d.outputFacets != null && d.outputFacets.outputStatistics != null) { def s = d.outputFacets.outputStatistics; def st = new HashMap(); if (s.rowCount != null) st.put('row_count', s.rowCount); if (s.size != null) st.put('size', s.size); if (s.fileCount != null) st.put('file_count', s.fileCount); ol.put('output_statistics', st); }",
          "  if (d.facets != null && d.facets.schema != null && d.facets.schema.fields instanceof List) { def f = new ArrayList(); for (def fld : d.facets.schema.fields) { f.add(fld.name + ':' + fld.type); } ol.put('output_schema_fields', f); }",
          "} }",
          "ol.put('inputs', ins); ol.put('outputs', outs); ol.put('input_count', ins.size()); ol.put('output_count', outs.size());",
        ].join(" "),
        ignore_failure: true,
      },
    },
    {
      script: {
        lang: "painless",
        tag: "script_openlineage_ecs",
        description:
          "Derive ECS event.action/type/outcome and labels.pipeline_run_id (parent run) from the RunEvent",
        source: [
          "def ol = ctx.openlineage; if (ol == null || ol.event_type == null) return; String et = ol.event_type.toString();",
          "if (ctx.event == null) ctx.event = new HashMap();",
          "ctx.event.action = et; ctx.event.kind = 'event'; ctx.event.category = ['process'];",
          "if (et == 'START' || et == 'RUNNING') { ctx.event.type = ['start']; ctx.event.outcome = 'unknown'; }",
          "else if (et == 'COMPLETE') { ctx.event.type = ['end']; ctx.event.outcome = 'success'; }",
          "else { ctx.event.type = ['end', 'error']; ctx.event.outcome = 'failure'; }",
          "String prid = null; if (ol.run != null) { if (ol.run.root != null && ol.run.root.id != null) prid = ol.run.root.id.toString(); else if (ol.run.parent != null && ol.run.parent.id != null) prid = ol.run.parent.id.toString(); else if (ol.run.id != null) prid = ol.run.id.toString(); }",
          "if (prid != null) { if (ctx.labels == null) ctx.labels = new HashMap(); if (ctx.labels.pipeline_run_id == null) ctx.labels.pipeline_run_id = prid; }",
          "if (ctx.error != null && ctx.error.message != null && ctx.error.type == null) { String m = ctx.error.message.toString(); int i = m.indexOf(':'); ctx.error.type = i > 0 ? m.substring(0, i).trim() : 'RuntimeError'; }",
        ].join(" "),
        ignore_failure: true,
      },
    },
  ],
  // Glue Data Quality results (GetDataQualityResult JSON) consumed from the
  // customer's Confluent topic by the Elastic Agent Kafka input. Curated
  // aws.glue_dataquality.* contract is documented in src/aws/generators/glueDataQuality.ts.
  "aws.glue_dataquality": [
    rename("glue_dataquality.parsed.ResultId", "glue_dataquality.result_id"),
    rename("glue_dataquality.parsed.Score", "glue_dataquality.score"),
    rename("glue_dataquality.parsed.RulesetName", "glue_dataquality.ruleset_name"),
    rename("glue_dataquality.parsed.EvaluationContext", "glue_dataquality.evaluation_context"),
    rename("glue_dataquality.parsed.StartedOn", "glue_dataquality.started_on"),
    rename("glue_dataquality.parsed.CompletedOn", "glue_dataquality.completed_on"),
    rename("glue_dataquality.parsed.JobName", "glue_dataquality.job.name"),
    rename("glue_dataquality.parsed.JobRunId", "glue_dataquality.job.run_id"),
    rename(
      "glue_dataquality.parsed.RulesetEvaluationRunId",
      "glue_dataquality.ruleset_evaluation_run_id"
    ),
    {
      date: {
        field: "glue_dataquality.completed_on",
        target_field: "@timestamp",
        formats: ["ISO8601"],
        ignore_failure: true,
        tag: "date_glue_dataquality_completed_on",
      },
    },
    {
      script: {
        lang: "painless",
        tag: "script_glue_dataquality_rules",
        description:
          "Flatten RuleResults to snake_case, derive counts/state/score, failed_rules and failed_rule_types",
        source: [
          "def dq = ctx.glue_dataquality; if (dq == null) return; def p = dq.parsed; if (p == null) return;",
          "def rr = new ArrayList(); def failed = new ArrayList(); def failedTypes = new ArrayList(); int pass = 0; int fail = 0; int skip = 0;",
          "if (p.RuleResults instanceof List) { for (def r : p.RuleResults) {",
          "  def m = new HashMap(); if (r.Name != null) m.put('name', r.Name); if (r.Description != null) m.put('description', r.Description);",
          "  String rule = r.EvaluatedRule != null ? r.EvaluatedRule.toString() : (r.Description != null ? r.Description.toString() : null);",
          "  if (rule != null) { m.put('evaluated_rule', rule); String[] parts = /\\s+/.split(rule.trim()); if (parts.length > 0) m.put('rule_type', parts[0]); }",
          "  String res = r.Result != null ? r.Result.toString() : 'UNKNOWN'; m.put('result', res);",
          "  if (r.EvaluationMessage != null) m.put('evaluation_message', r.EvaluationMessage); if (r.EvaluatedMetrics != null) m.put('evaluated_metrics', r.EvaluatedMetrics); if (r.Labels != null) m.put('labels', r.Labels);",
          "  if (res == 'PASS') pass++; else if (res == 'FAIL') { fail++; if (rule != null) { failed.add(rule); if (m.rule_type != null && !failedTypes.contains(m.rule_type)) failedTypes.add(m.rule_type); } } else skip++;",
          "  rr.add(m);",
          "} }",
          "dq.put('rule_results', rr); dq.put('failed_rules', failed); dq.put('failed_rule_types', failedTypes);",
          "def counts = new HashMap(); counts.put('passed', pass); counts.put('failed', fail); counts.put('skipped', skip); counts.put('total', rr.size()); dq.put('rules', counts);",
          "dq.put('state', fail == 0 ? 'SUCCEEDED' : 'FAILED');",
          "if (dq.started_on != null && dq.completed_on != null) { try { long a = ZonedDateTime.parse(dq.started_on.toString()).toInstant().toEpochMilli(); long b = ZonedDateTime.parse(dq.completed_on.toString()).toInstant().toEpochMilli(); if (b >= a) { dq.put('duration_ms', b - a); if (ctx.event == null) ctx.event = new HashMap(); ctx.event.duration = (b - a) * 1000000L; } } catch (Exception e) {} }",
          "if (ctx.event == null) ctx.event = new HashMap(); ctx.event.kind = 'event'; ctx.event.category = ['database']; ctx.event.action = 'data-quality-evaluation';",
          "if (fail == 0) { ctx.event.outcome = 'success'; ctx.event.type = ['info']; } else { ctx.event.outcome = 'failure'; ctx.event.type = ['error']; if (ctx.error == null) { ctx.error = new HashMap(); ctx.error.type = 'DataQualityRuleFailure'; ctx.error.message = fail + ' of ' + rr.size() + ' rules failed (score ' + dq.score + '): ' + String.join('; ', failed); } }",
        ].join(" "),
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

// ═══════════════════════════════════════════════════════════════════════════
// REROUTE PIPELINES
// Entry-point pipelines for generic ingestion paths (CloudWatch Logs, S3,
// Firehose) that detect the AWS service from metadata and reroute docs to
// the correct service-specific data stream + pipeline.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build the Painless map literal that maps AWS service slugs (extracted from
 * CloudWatch log group, S3 key, etc.) to the project's dataset names.
 *
 * Most services are `aws.{slug}` but some have suffixes like `_logs`.
 * We only emit entries where the slug differs from the dataset suffix.
 */
function buildServiceRouteMap() {
  const map = {};
  for (const { dataset } of manifest) {
    if (!dataset.startsWith("aws.")) continue;
    const suffix = dataset.slice(4);
    const slug = suffix.replace(/_logs$/, "");
    map[slug] = dataset;
    if (slug !== suffix) map[suffix] = dataset;
  }
  return map;
}

const routeMap = buildServiceRouteMap();

function painlessMapLiteral(obj) {
  const pairs = Object.entries(obj).map(([k, v]) => `'${k}': '${v}'`);
  return `[${pairs.join(", ")}]`;
}

const routeMapLiteral = painlessMapLiteral(routeMap);

const CW_REROUTE_SCRIPT = [
  "String lg = ctx.aws?.cloudwatch?.log_group;",
  "if (lg == null || lg.length() == 0) return;",
  `Map routes = ${routeMapLiteral};`,
  "Matcher m = /^\\/aws\\/([^\\/]+)/.matcher(lg);",
  "if (m.find()) {",
  "  String svc = m.group(1);",
  "  if (routes.containsKey(svc)) {",
  "    ctx._target_dataset = routes.get(svc);",
  "    return;",
  "  }",
  "}",
  "Matcher ecs = /^\\/ecs\\//.matcher(lg);",
  "if (ecs.find() && routes.containsKey('fargate')) {",
  "  ctx._target_dataset = routes.get('fargate');",
  "  return;",
  "}",
  "Matcher trail = /^aws-cloudtrail-logs-/.matcher(lg);",
  "if (trail.find()) return;",
  "Matcher wafLog = /^aws-waf-logs-/.matcher(lg);",
  "if (wafLog.find() && routes.containsKey('wafv2')) {",
  "  ctx._target_dataset = routes.get('wafv2');",
  "}",
].join(" ");

const S3_REROUTE_SCRIPT = [
  "String key = ctx.aws?.s3?.object?.key;",
  "if (key == null || key.length() == 0) return;",
  `Map routes = ${routeMapLiteral};`,
  "Matcher m = /AWSLogs\\/[0-9]+\\/([^\\/]+)\\//.matcher(key);",
  "if (m.find()) {",
  "  String svc = m.group(1).toLowerCase();",
  "  if (routes.containsKey(svc)) {",
  "    ctx._target_dataset = routes.get(svc);",
  "  }",
  "}",
].join(" ");

const FH_REROUTE_SCRIPT = [
  "String lg = ctx.aws?.cloudwatch?.log_group;",
  "if (lg != null && lg.length() > 0) {",
  `  Map routes = ${routeMapLiteral};`,
  "  Matcher m = /^\\/aws\\/([^\\/]+)/.matcher(lg);",
  "  if (m.find()) {",
  "    String svc = m.group(1);",
  "    if (routes.containsKey(svc)) {",
  "      ctx._target_dataset = routes.get(svc);",
  "      return;",
  "    }",
  "  }",
  "}",
  "String key = ctx.aws?.s3?.object?.key;",
  "if (key != null && key.length() > 0) {",
  `  Map routes2 = ${routeMapLiteral};`,
  "  Matcher m2 = /AWSLogs\\/[0-9]+\\/([^\\/]+)\\//.matcher(key);",
  "  if (m2.find()) {",
  "    String svc = m2.group(1).toLowerCase();",
  "    if (routes2.containsKey(svc)) {",
  "      ctx._target_dataset = routes2.get(svc);",
  "    }",
  "  }",
  "}",
].join(" ");

function buildReroutePipeline(pipelineId, description, scriptSource) {
  return {
    id: pipelineId,
    dataset: pipelineId.replace(/^logs-/, "").replace(/@custom$/, ""),
    group: "reroute",
    description,
    processors: [
      {
        script: {
          lang: "painless",
          tag: "resolve_target_dataset",
          description: "Detect AWS service from ingestion metadata and resolve target dataset",
          source: scriptSource,
          ignore_failure: true,
        },
      },
      {
        reroute: {
          tag: "reroute_to_service_pipeline",
          dataset: ["{{_target_dataset}}"],
          namespace: "default",
          if: "ctx._target_dataset != null",
        },
      },
      {
        remove: {
          field: "_target_dataset",
          ignore_missing: true,
          tag: "cleanup_target_dataset",
        },
      },
    ],
    on_failure: [
      {
        append: {
          field: "error.message",
          tag: "append_reroute_error",
          value:
            "Reroute processor '{{{_ingest.on_failure_processor_type}}}' with tag '{{{_ingest.on_failure_processor_tag}}}' failed: '{{{_ingest.on_failure_message}}}'",
        },
      },
      {
        set: {
          field: "event.kind",
          tag: "set_reroute_error",
          value: "pipeline_error",
        },
      },
    ],
  };
}

const rerouteEntries = [
  buildReroutePipeline(
    "logs-aws.cloudwatch_logs@custom",
    "CloudLoadGen: Route CloudWatch logs to service-specific pipelines based on log group",
    CW_REROUTE_SCRIPT
  ),
  buildReroutePipeline(
    "logs-aws_logs.generic@custom",
    "CloudLoadGen: Route S3-ingested AWS logs to service-specific pipelines based on S3 key",
    S3_REROUTE_SCRIPT
  ),
  buildReroutePipeline(
    "logs-awsfirehose@custom",
    "CloudLoadGen: Route Firehose-delivered logs to service-specific pipelines based on metadata",
    FH_REROUTE_SCRIPT
  ),
];

entries.push(...rerouteEntries);

const header = `/**
 * Registry of custom Elasticsearch ingest pipelines for AWS services
 * not covered by the official Elastic AWS integration.
 *
 * Pipeline naming convention:  logs-aws.{dataset_suffix}-default
 * This matches the index pattern the load generator writes documents into,
 * so pipelines are applied automatically on ingest.
 *
 * Also includes 3 reroute pipelines (group: "reroute") that sit at generic
 * ingestion entry points (CloudWatch Logs, S3/aws_logs, Firehose) and
 * redirect documents to the correct service-specific data stream + pipeline
 * based on metadata like aws.cloudwatch.log_group or aws.s3.object.key.
 *
 * Each service pipeline includes:
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
