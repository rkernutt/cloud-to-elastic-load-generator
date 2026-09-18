/**
 * AWS Glue Data Quality — results published through Confluent Kafka.
 *
 * Models the customer topology: a Glue ETL job runs the EvaluateDataQuality
 * transform against the Parquet output of a pipeline run, then publishes the
 * evaluation result to a topic on a self-managed Confluent Kafka cluster (EKS).
 * A Kafka Connect S3 sink writes each record to the DQ results bucket. Elastic
 * consumes the topic with the Elastic Agent Kafka input (Custom Kafka Logs
 * integration, dataset `aws.glue_dataquality`).
 *
 * ── What is real here ────────────────────────────────────────────────────────
 *  • The message body is the GetDataQualityResult API response
 *    (ResultId / Score / RulesetName / EvaluationContext / StartedOn /
 *    CompletedOn / JobName / JobRunId / RuleResults[...]) — the documented
 *    shape AWS's own EventBridge→Lambda example forwards.
 *  • Rule strings are valid DQDL; failure messages follow Glue's wording
 *    ("Value: 10 does not meet the constraint requirement!",
 *     "Input data does not include column colA!").
 *  • kafka.* metadata is exactly what the Filebeat/Elastic Agent kafka input
 *    sets: topic, partition, offset, key, block_timestamp, headers ("k: v").
 *  • The EventBridge companion is the native
 *    "Data Quality Evaluation Results Available" event (source
 *    aws.glue-dataquality) with the GLUE_JOB context.
 *  • S3 sink object keys follow the Confluent S3 Sink DefaultPartitioner:
 *    topics/<topic>/partition=<p>/<topic>+<p>+<startOffset>.json
 *
 * ── Assumption to verify against the customer's sample ──────────────────────
 *  How the result reaches Kafka (job step vs Lambda on the EventBridge event)
 *  decides which ids the message carries. Here the publisher forwards the
 *  GetDataQualityResult response unchanged and sets the Kafka key to ResultId.
 *
 * ── Post-pipeline field contract (aws.glue_dataquality.*) ───────────────────
 *   result_id, ruleset_name, evaluation_context, job.{name,run_id},
 *   score (0–1), state (SUCCEEDED|FAILED), rules.{passed,failed,skipped,total},
 *   started_on, completed_on, duration_ms,
 *   rule_results[] {name, description, evaluated_rule, rule_type, result,
 *                   evaluation_message, evaluated_metrics{}},
 *   failed_rules[] (DQDL strings), failed_rule_types[] (RowCount, Completeness…)
 *   + kafka.*, input.type = kafka, message = raw result JSON.
 */

import { rand, randInt, randFloat, randId, randAccount, REGIONS } from "../../helpers";
import type { EcsDocument } from "./types.js";

// ── Customer-side constants ────────────────────────────────────────────────

/** Confluent topic the DQ publisher writes to (customer-defined name). */
export const DQ_TOPIC = "glue.dq.results";
/** Kafka Connect S3 sink connector name and its IAM role (IRSA on EKS). */
export const DQ_S3_SINK_CONNECTOR = "glue-dq-s3-sink";
export const DQ_S3_SINK_ROLE = "confluent-s3-sink-connector";
export const DQ_RESULTS_BUCKETS = [
  "dq-results-archive",
  "data-quality-results",
  "glue-dq-sink",
  "pipeline-dq-results",
];
export const CONFLUENT_NAMESPACE = "confluent";
export const CONFLUENT_CLUSTER_NAME = "confluent-platform";
export const CONFLUENT_BOOTSTRAP = "kafka.confluent.svc.cluster.local:9092";
/** Glue version the DQ job runs on (Glue 4.0 is required for DQDL where-clauses). */
export const GLUE_DQ_VERSION = "4.0";

// ── Rule catalogue ─────────────────────────────────────────────────────────

export type DqRuleType =
  | "RowCount"
  | "IsComplete"
  | "IsUnique"
  | "Completeness"
  | "ColumnValues"
  | "ColumnDataType"
  | "ColumnExists"
  | "ColumnCount"
  | "ColumnLength"
  | "DataFreshness"
  | "Uniqueness";

export interface DqRuleSpec {
  /** DQDL text exactly as written in the ruleset */
  rule: string;
  type: DqRuleType;
  column?: string;
  /** EvaluatedMetrics emitted on PASS */
  metrics: (ctx: { rowCount: number; columnCount: number }) => Record<string, number>;
}

/** Baseline ruleset applied to the Parquet output of every pipeline run. */
export const DQ_BASE_RULES: DqRuleSpec[] = [
  {
    rule: "RowCount > 0",
    type: "RowCount",
    metrics: (c) => ({ "Dataset.*.RowCount": c.rowCount }),
  },
  {
    rule: 'IsComplete "transaction_id"',
    type: "IsComplete",
    column: "transaction_id",
    metrics: () => ({ "Column.transaction_id.Completeness": 1 }),
  },
  {
    rule: 'IsUnique "transaction_id"',
    type: "IsUnique",
    column: "transaction_id",
    metrics: () => ({ "Column.transaction_id.Uniqueness": 1 }),
  },
  {
    rule: 'IsComplete "customer_id"',
    type: "IsComplete",
    column: "customer_id",
    metrics: () => ({ "Column.customer_id.Completeness": 1 }),
  },
  {
    rule: 'Completeness "amount" > 0.95',
    type: "Completeness",
    column: "amount",
    metrics: () => ({ "Column.amount.Completeness": Number(randFloat(0.97, 1).toFixed(4)) }),
  },
  {
    rule: 'ColumnDataType "amount" = "Integer"',
    type: "ColumnDataType",
    column: "amount",
    metrics: () => ({ "Column.amount.ColumnDataType.Compliance": 1 }),
  },
  {
    rule: 'ColumnValues "currency" in ["USD", "EUR", "GBP", "AUD"]',
    type: "ColumnValues",
    column: "currency",
    metrics: () => ({ "Column.currency.ColumnValues.Compliance": 1 }),
  },
  {
    rule: 'ColumnLength "country_code" = 2',
    type: "ColumnLength",
    column: "country_code",
    metrics: () => ({
      "Column.country_code.MinimumLength": 2,
      "Column.country_code.MaximumLength": 2,
    }),
  },
  {
    rule: 'ColumnExists "legacy_id"',
    type: "ColumnExists",
    column: "legacy_id",
    metrics: () => ({}),
  },
  {
    rule: "ColumnCount = 12",
    type: "ColumnCount",
    metrics: (c) => ({ "Dataset.*.ColumnCount": c.columnCount }),
  },
  {
    rule: 'DataFreshness "event_ts" <= 24 hours',
    type: "DataFreshness",
    column: "event_ts",
    metrics: () => ({ "Column.event_ts.DataFreshness": Number(randFloat(0.5, 20).toFixed(2)) }),
  },
];

/** DQDL document as authored in the Glue job (what Glue Studio generates). */
export function dqdlRuleset(rules: DqRuleSpec[] = DQ_BASE_RULES): string {
  return `Rules = [\n    ${rules.map((r) => r.rule).join(",\n    ")}\n]`;
}

// ── Result builder ─────────────────────────────────────────────────────────

export type DqSchemaDrift =
  | { added: string; type: string }
  | { removed: string; type: string }
  | { typeChange: { column: string; from: string; to: string } };

export interface DqBuildOptions {
  jobName: string;
  jobRunId: string;
  evaluationContext: string;
  rulesetName: string;
  startedOn: string;
  completedOn: string;
  rowCount: number;
  /** Baseline column count of the Parquet output (ColumnCount rule target). */
  columnCount?: number;
  /** Zero-row output: RowCount fails, freshness cannot be computed. */
  nullData?: boolean;
  /** Schema drift on the output: ColumnExists / ColumnDataType / ColumnCount fail. */
  drift?: DqSchemaDrift | null;
  /** Probability of an unrelated marginal Completeness failure (data quality, not a pipeline fault). */
  marginalFailureRate?: number;
}

export interface DqRuleResult {
  Name: string;
  Description: string;
  EvaluatedRule: string;
  Result: "PASS" | "FAIL" | "ERROR";
  EvaluationMessage?: string;
  EvaluatedMetrics: Record<string, number>;
}

/** GetDataQualityResult response — the message body published to Kafka. */
export interface DqResult {
  ResultId: string;
  Score: number;
  RulesetName: string;
  EvaluationContext: string;
  StartedOn: string;
  CompletedOn: string;
  JobName: string;
  JobRunId: string;
  RulesetEvaluationRunId?: string;
  RuleResults: DqRuleResult[];
}

export interface DqBuilt {
  result: DqResult;
  /** EventBridge `state`: SUCCEEDED when every rule passed, otherwise FAILED. */
  state: "SUCCEEDED" | "FAILED";
  passed: number;
  failed: number;
  skipped: number;
  failedRules: string[];
  failedRuleTypes: DqRuleType[];
  ruleTypes: Record<string, DqRuleType>;
}

const constraintMsg = (v: number | string) =>
  `Value: ${v} does not meet the constraint requirement!`;

export function buildDqResult(o: DqBuildOptions): DqBuilt {
  const columnCount = o.columnCount ?? 12;
  const drift = o.drift ?? null;
  const observedColumns =
    drift && "added" in drift
      ? columnCount + 1
      : drift && "removed" in drift
        ? columnCount - 1
        : columnCount;
  const marginal = Math.random() < (o.marginalFailureRate ?? 0);

  const ruleTypes: Record<string, DqRuleType> = {};
  const results: DqRuleResult[] = DQ_BASE_RULES.map((spec, i) => {
    ruleTypes[spec.rule] = spec.type;
    const base: DqRuleResult = {
      Name: `Rule_${i + 1}`,
      Description: spec.rule,
      EvaluatedRule: spec.rule,
      Result: "PASS",
      EvaluatedMetrics: spec.metrics({ rowCount: o.rowCount, columnCount: observedColumns }),
    };

    // Zero-row output
    if (o.nullData) {
      if (spec.type === "RowCount") {
        return {
          ...base,
          Result: "FAIL",
          EvaluationMessage: constraintMsg(0),
          EvaluatedMetrics: { "Dataset.*.RowCount": 0 },
        };
      }
      if (spec.type === "DataFreshness") {
        return {
          ...base,
          Result: "ERROR",
          EvaluationMessage: "No data available to evaluate the rule",
          EvaluatedMetrics: {},
        };
      }
    }

    // Schema drift on the output
    if (drift) {
      if ("removed" in drift && spec.type === "ColumnExists" && spec.column === drift.removed) {
        return {
          ...base,
          Result: "FAIL",
          EvaluationMessage: `Input data does not include column ${drift.removed}!`,
          EvaluatedMetrics: {},
        };
      }
      if (("added" in drift || "removed" in drift) && spec.type === "ColumnCount") {
        return {
          ...base,
          Result: "FAIL",
          EvaluationMessage: constraintMsg(observedColumns),
          EvaluatedMetrics: { "Dataset.*.ColumnCount": observedColumns },
        };
      }
      if (
        "typeChange" in drift &&
        spec.type === "ColumnDataType" &&
        spec.column === drift.typeChange.column
      ) {
        const compliance = Number(randFloat(0, 0.2).toFixed(4));
        return {
          ...base,
          Result: "FAIL",
          EvaluationMessage: constraintMsg(compliance),
          EvaluatedMetrics: { [`Column.${spec.column}.ColumnDataType.Compliance`]: compliance },
        };
      }
    }

    // Marginal, unrelated data-quality failure on the Completeness rule
    if (marginal && spec.type === "Completeness") {
      const v = Number(randFloat(0.9, 0.949).toFixed(4));
      return {
        ...base,
        Result: "FAIL",
        EvaluationMessage: constraintMsg(v),
        EvaluatedMetrics: { [`Column.${spec.column}.Completeness`]: v },
      };
    }
    return base;
  });

  const passed = results.filter((r) => r.Result === "PASS").length;
  const failed = results.filter((r) => r.Result === "FAIL").length;
  const skipped = results.filter((r) => r.Result === "ERROR").length;
  const failedRules = results.filter((r) => r.Result === "FAIL").map((r) => r.EvaluatedRule);
  const failedRuleTypes = failedRules.map((r) => ruleTypes[r]);
  const score = Number((passed / results.length).toFixed(4));

  return {
    result: {
      ResultId: `dqresult-${randId(32).toLowerCase()}`,
      Score: score,
      RulesetName: o.rulesetName,
      EvaluationContext: o.evaluationContext,
      StartedOn: o.startedOn,
      CompletedOn: o.completedOn,
      JobName: o.jobName,
      JobRunId: o.jobRunId,
      RuleResults: results,
    },
    state: failed === 0 ? "SUCCEEDED" : "FAILED",
    passed,
    failed,
    skipped,
    failedRules,
    failedRuleTypes,
    ruleTypes,
  };
}

// ── Kafka-side helpers ─────────────────────────────────────────────────────

/** Confluent S3 Sink (DefaultPartitioner, JsonFormat) object key. */
export function s3SinkObjectKey(topic: string, partition: number, startOffset: number): string {
  return `topics/${topic}/partition=${partition}/${topic}+${partition}+${String(startOffset).padStart(10, "0")}.json`;
}

/** Native EventBridge event for a GLUE_JOB evaluation (aws.glue-dataquality). */
export function dqEventBridgeDetail(b: DqBuilt, evaluationContext: string) {
  return {
    context: {
      contextType: "GLUE_JOB",
      jobId: b.result.JobRunId,
      jobName: b.result.JobName,
      evaluationContext,
    },
    resultID: b.result.ResultId,
    rulesetNames: [b.result.RulesetName],
    state: b.state,
    score: b.result.Score,
    rulesSucceeded: b.passed,
    rulesFailed: b.failed,
    rulesSkipped: b.skipped,
  };
}

const ruleTypeOf = (rule: string): DqRuleType => rule.trim().split(/\s+/)[0] as DqRuleType;

export interface DqKafkaContext {
  region: string;
  acct: { id: string; name: string };
  topic?: string;
  partition?: number;
  offset?: number;
  /** Timestamp the broker stamped on the record (kafka.block_timestamp). */
  blockTimestamp?: string;
  labels?: Record<string, unknown>;
}

/**
 * The DQ result as the Elastic Agent kafka input indexes it, plus the curated
 * aws.glue_dataquality.* fields the ingest pipeline derives from `message`.
 */
export function dqKafkaDoc(b: DqBuilt, ctx: DqKafkaContext): EcsDocument {
  const r = b.result;
  const topic = ctx.topic ?? DQ_TOPIC;
  const partition = ctx.partition ?? randInt(0, 5);
  const offset = ctx.offset ?? randInt(100_000, 999_999);
  const ts = ctx.blockTimestamp ?? r.CompletedOn;
  const durationMs = Math.max(
    0,
    new Date(r.CompletedOn).getTime() - new Date(r.StartedOn).getTime()
  );
  const outcome = b.state === "SUCCEEDED" ? "success" : "failure";

  return {
    __dataset: "aws.glue_dataquality",
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region: ctx.region,
      account: { id: ctx.acct.id, name: ctx.acct.name },
      service: { name: "glue" },
    },
    input: { type: "kafka" },
    kafka: {
      topic,
      partition,
      offset,
      key: r.ResultId,
      block_timestamp: ts,
      headers: [`content-type: application/json`, `glue-job-run-id: ${r.JobRunId}`],
    },
    aws: {
      glue_dataquality: {
        result_id: r.ResultId,
        ruleset_name: r.RulesetName,
        evaluation_context: r.EvaluationContext,
        job: { name: r.JobName, run_id: r.JobRunId },
        score: r.Score,
        state: b.state,
        rules: {
          passed: b.passed,
          failed: b.failed,
          skipped: b.skipped,
          total: r.RuleResults.length,
        },
        started_on: r.StartedOn,
        completed_on: r.CompletedOn,
        duration_ms: durationMs,
        rule_results: r.RuleResults.map((x) => ({
          name: x.Name,
          description: x.Description,
          evaluated_rule: x.EvaluatedRule,
          rule_type: ruleTypeOf(x.EvaluatedRule),
          result: x.Result,
          ...(x.EvaluationMessage ? { evaluation_message: x.EvaluationMessage } : {}),
          evaluated_metrics: x.EvaluatedMetrics,
        })),
        failed_rules: b.failedRules,
        failed_rule_types: [...new Set(b.failedRuleTypes)],
      },
    },
    event: {
      kind: "event",
      category: ["database"],
      type: outcome === "success" ? ["info"] : ["error"],
      action: "data-quality-evaluation",
      outcome,
      duration: durationMs * 1_000_000,
      dataset: "aws.glue_dataquality",
      provider: "glue.amazonaws.com",
    },
    ...(b.failed > 0
      ? {
          error: {
            type: "DataQualityRuleFailure",
            message: `${b.failed} of ${r.RuleResults.length} rules failed (score ${r.Score}): ${b.failedRules.join("; ")}`,
          },
        }
      : {}),
    message: JSON.stringify(r),
    log: { level: outcome === "success" ? "info" : "warn" },
    labels: { ...(ctx.labels ?? {}) },
  } as EcsDocument;
}

// ── Standalone generator ──────────────────────────────────────────────────

const DQ_DAGS = [
  "data_pipeline_daily",
  "analytics_etl_hourly",
  "warehouse_refresh",
  "customer_360_pipeline",
  "clickstream_processing",
];

const DRIFTS: DqSchemaDrift[] = [
  { added: "customer_ltv", type: "double" },
  { removed: "legacy_id", type: "bigint" },
  { typeChange: { column: "amount", from: "int", to: "double" } },
];

/**
 * Standalone Glue Data Quality generator — one DQ result per call as read from
 * the Confluent topic. Use the Data Pipeline chain for fully correlated runs.
 */
export function generateGlueDataQualityLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const dagId = rand(DQ_DAGS);
  const isFail = Math.random() < er;
  const nullData = isFail && Math.random() < 0.3;
  const drift = isFail && !nullData ? rand(DRIFTS) : null;
  const durationMs = randInt(20_000, 180_000);
  const startedOn = new Date(new Date(ts).getTime() - durationMs).toISOString();
  const jobName = `${dagId}-dq-evaluate`;
  const built = buildDqResult({
    jobName,
    jobRunId: `jr_${randId(64).toLowerCase()}`,
    evaluationContext: "EvaluateDataQuality_parquet_output",
    rulesetName: `${dagId}-parquet-output-ruleset`,
    startedOn,
    completedOn: ts,
    rowCount: nullData ? 0 : randInt(100_000, 10_000_000),
    nullData,
    drift,
    marginalFailureRate: isFail && !nullData && !drift ? 1 : 0.03,
  });
  // No pipeline_run_id here: on a real cluster that label is attached at ingest
  // time by the enrich policy keyed on JobRunId (see docs/chained-events).
  return dqKafkaDoc(built, { region, acct });
}
