import { describe, it, expect, afterAll } from "vitest";
import { generateDataPipelineChain, setPipelineOrchestration } from "./dataPipelineChain.js";
import { generateOpenLineageLog } from "./openlineage.js";
import { generateGlueDataQualityLog } from "./glueDataQuality.js";
import { GENERATORS } from "./index.js";

const TS = "2024-06-01T12:00:00.000Z";

type Doc = Record<string, unknown>;

const CHAIN_IDS = [
  "security-chain",
  "iam-privesc-chain",
  "data-exfil-chain",
  "data-pipeline-chain",
];

describe("AWS chain generators — structural invariants", () => {
  for (const chainId of CHAIN_IDS) {
    describe(chainId, () => {
      it("returns an array of 2+ correlated documents", () => {
        const gen = GENERATORS[chainId as keyof typeof GENERATORS]!;
        const docs = gen(TS, 0.05) as Doc[];
        expect(Array.isArray(docs)).toBe(true);
        expect(docs.length).toBeGreaterThanOrEqual(2);
      });

      it("every doc has @timestamp", () => {
        const gen = GENERATORS[chainId as keyof typeof GENERATORS]!;
        const docs = gen(TS, 0.05) as Doc[];
        for (const doc of docs) {
          expect(typeof doc["@timestamp"]).toBe("string");
        }
      });

      it("produces docs with __dataset routing field", () => {
        const gen = GENERATORS[chainId as keyof typeof GENERATORS]!;
        const docs = gen(TS, 0.05) as Doc[];
        const withDataset = docs.filter((d) => d.__dataset);
        expect(withDataset.length).toBeGreaterThan(0);
      });
    });
  }
});

describe("AWS data pipeline chain — orchestration modes", () => {
  it("produces correlated docs with shared pipeline_run_id", () => {
    const docs = generateDataPipelineChain(TS, 0) as Doc[];
    const labels = docs
      .map((d) => (d.labels as Record<string, unknown>)?.pipeline_run_id)
      .filter(Boolean);
    expect(labels.length).toBeGreaterThan(0);
    const unique = new Set(labels);
    expect(unique.size).toBe(1);
  });

  it("includes APM trace documents", () => {
    const docs = generateDataPipelineChain(TS, 0) as Doc[];
    const traceDocs = docs.filter(
      (d) => (d.data_stream as Record<string, unknown>)?.type === "traces"
    );
    expect(traceDocs.length).toBeGreaterThanOrEqual(2);
  });

  it("trace docs share a single trace.id", () => {
    const docs = generateDataPipelineChain(TS, 0) as Doc[];
    const traceDocs = docs.filter(
      (d) => (d.data_stream as Record<string, unknown>)?.type === "traces"
    );
    const traceIds = new Set(
      traceDocs.map((d) => (d.trace as Record<string, unknown>)?.id).filter(Boolean)
    );
    expect(traceIds.size).toBe(1);
  });

  it("co-emits correlated CloudWatch metrics routed to metrics-aws.*", () => {
    const docs = generateDataPipelineChain(TS, 0.3) as Doc[];
    const metricDocs = docs.filter(
      (d) => (d.data_stream as Record<string, unknown>)?.type === "metrics"
    );
    expect(metricDocs.length).toBeGreaterThan(0);
    for (const m of metricDocs) {
      // Routed to a fully-qualified metrics stream so it lands in metrics-aws.*
      // even though the scenario ships over the logs path.
      expect(String(m.__dataset)).toMatch(/^metrics-aws\./);
      // Correlated with the rest of the run.
      expect((m.labels as Record<string, unknown>)?.pipeline_run_id).toBeTruthy();
    }
    // Metric docs share the single run id used by logs + traces.
    const runIds = new Set(
      docs.map((d) => (d.labels as Record<string, unknown>)?.pipeline_run_id).filter(Boolean)
    );
    expect(runIds.size).toBe(1);
  });

  it("error mode produces at least one failure or error doc", () => {
    let found = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      const docs = generateDataPipelineChain(TS, 1.0) as Doc[];
      const hasFailure = docs.some((d) => {
        const ev = d.event as Record<string, unknown> | undefined;
        const err = d.error as Record<string, unknown> | undefined;
        return ev?.outcome === "failure" || err?.type;
      });
      if (hasFailure) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});

// ── OpenLineage lineage invariants ──────────────────────────────────────────
// Lineage must come from the components that know the graph (Airflow provider,
// Spark listener), never be stamped onto raw service logs, and every event of a
// run must resolve to the same pipeline run id via the ParentRunFacet root.

type OlDoc = Doc & {
  aws: { openlineage: Record<string, any> };
  labels: Record<string, unknown>;
  event: Record<string, unknown>;
};

const ol = (docs: Doc[]) =>
  docs.filter((d) => d.__dataset === "aws.openlineage") as unknown as OlDoc[];
const runIdOf = (docs: Doc[]) => {
  const ids = new Set(
    docs.map((d) => (d.labels as Record<string, unknown>)?.pipeline_run_id).filter(Boolean)
  );
  expect(ids.size).toBe(1);
  return [...ids][0] as string;
};

const RAW_SERVICE_DATASETS = new Set([
  "aws.s3access",
  "aws.emr_logs",
  "aws.glue",
  "aws.glue_dataquality",
  "aws.eks",
]);
const ORCHESTRATOR_DATASETS = new Set(["aws.mwaa", "aws.stepfunctions", "aws.eventbridge"]);

describe("AWS data pipeline chain — OpenLineage lineage", () => {
  afterAll(() => setPipelineOrchestration("all"));

  it("mwaa: full lineage — DAG run, 4 Airflow tasks, Spark job, all keyed to one run", () => {
    setPipelineOrchestration("mwaa");
    const docs = generateDataPipelineChain(TS, 0) as Doc[];
    const runId = runIdOf(docs);
    const events = ol(docs);
    expect(events.length).toBeGreaterThanOrEqual(10);

    const dagEvents = events.filter((e) => e.aws.openlineage.job.type === "DAG");
    expect(dagEvents.map((e) => e.aws.openlineage.event_type).sort()).toEqual([
      "COMPLETE",
      "START",
    ]);
    expect(dagEvents[0].aws.openlineage.run.id).toBe(runId);

    const taskIds = new Set(
      events
        .filter((e) => e.aws.openlineage.job.type === "TASK")
        .map((e) => e.aws.openlineage.airflow.task_id)
    );
    expect([...taskIds].sort()).toEqual([
      "glue_dq_evaluate",
      "spark_avro_to_parquet",
      "wait_for_source_file",
      "write_run_manifest",
    ]);
    for (const e of events.filter((e) => e.aws.openlineage.job.type === "TASK")) {
      expect(e.aws.openlineage.run.parent.id).toBe(runId);
      expect(e.aws.openlineage.run.root.id).toBe(runId);
    }

    const spark = events.filter((e) => e.aws.openlineage.job.integration === "SPARK");
    expect(spark.map((e) => e.aws.openlineage.event_type).sort()).toEqual(["COMPLETE", "START"]);
    for (const e of spark) {
      // immediate parent is the Airflow task run, root is the DAG run
      expect(e.aws.openlineage.run.parent.id).not.toBe(runId);
      expect(e.aws.openlineage.run.parent.job_name).toContain(".spark_avro_to_parquet");
      expect(e.aws.openlineage.run.root.id).toBe(runId);
      expect(e.labels.pipeline_run_id).toBe(runId);
    }
    const sparkDone = spark.find((e) => e.aws.openlineage.event_type === "COMPLETE")!;
    expect(sparkDone.aws.openlineage.inputs[0]).toMatch(/^s3:\/\/.+\.avro$/);
    expect(sparkDone.aws.openlineage.outputs[0]).toMatch(/^s3:\/\/.+\/processed\//);
    expect(sparkDone.aws.openlineage.output_statistics.row_count).toBeGreaterThan(0);
    expect(sparkDone.aws.openlineage.output_schema_fields).toContain("amount:int");
    expect(sparkDone.aws.openlineage.run.duration_ms).toBeGreaterThan(0);
    expect(sparkDone.event.duration).toBe(sparkDone.aws.openlineage.run.duration_ms * 1_000_000);

    // every RunEvent is preserved verbatim on the wire
    for (const e of events) {
      const raw = JSON.parse(e.message as string);
      expect(raw.schemaURL).toContain("openlineage.io/spec");
      expect(raw.producer).toMatch(/github\.com\/(apache\/airflow|OpenLineage)/);
      expect(raw.run.runId).toBe(e.aws.openlineage.run.id);
    }
  });

  it("eventbridge: Spark lineage only + native Step Functions execution history", () => {
    setPipelineOrchestration("eventbridge");
    const docs = generateDataPipelineChain(TS, 0) as Doc[];
    const runId = runIdOf(docs);
    const events = ol(docs);
    expect(events.every((e) => e.aws.openlineage.job.integration === "SPARK")).toBe(true);
    expect(events.length).toBe(2);
    expect(events[0].aws.openlineage.run.root.id).toBe(runId);

    const sfn = docs.filter((d) => d.__dataset === "aws.stepfunctions");
    const types = new Set(
      sfn.map(
        (d) => ((d.aws as Record<string, any>).stepfunctions as Record<string, any>).event_type
      )
    );
    expect(types.has("ExecutionStarted")).toBe(true);
    expect(types.has("TaskStateEntered")).toBe(true);
    expect(types.has("TaskSucceeded")).toBe(true);
    expect(types.has("ExecutionSucceeded")).toBe(true);
  });

  it("manual: Spark lineage with no parent, still keyed to the run", () => {
    setPipelineOrchestration("manual");
    const docs = generateDataPipelineChain(TS, 0) as Doc[];
    const runId = runIdOf(docs);
    const events = ol(docs);
    expect(events.length).toBe(2);
    for (const e of events) {
      expect(e.aws.openlineage.run.parent).toBeUndefined();
      expect(e.labels.pipeline_run_id).toBe(runId);
    }
  });

  it("trace.id only on orchestrator logs; labels.pipeline_run_id on CloudTrail companions", () => {
    setPipelineOrchestration("mwaa");
    const docs = generateDataPipelineChain(TS, 0) as Doc[];
    const runId = runIdOf(docs);
    const apmTraceId = (
      docs.find((d) => (d.data_stream as Record<string, unknown>)?.type === "traces")!
        .trace as Record<string, unknown>
    ).id;
    for (const d of docs) {
      const ds = d.__dataset as string;
      if (ORCHESTRATOR_DATASETS.has(ds))
        expect((d.trace as Record<string, unknown>)?.id, ds).toBe(apmTraceId);
      if (RAW_SERVICE_DATASETS.has(ds)) expect(d.trace, ds).toBeUndefined();
      if (ds === "aws.cloudtrail")
        expect((d.labels as Record<string, unknown>).pipeline_run_id).toBe(runId);
    }
  });

  it("halted run: Spark FAIL with errorMessage facet, DAG FAIL, no downstream COMPLETE", () => {
    setPipelineOrchestration("mwaa");
    let checked = false;
    for (let attempt = 0; attempt < 40 && !checked; attempt++) {
      const docs = generateDataPipelineChain(TS, 1.0) as Doc[];
      const events = ol(docs);
      const sparkFail = events.find(
        (e) =>
          e.aws.openlineage.job.integration === "SPARK" && e.aws.openlineage.event_type === "FAIL"
      );
      if (!sparkFail) continue;
      checked = true;
      expect((sparkFail.error as Record<string, unknown>).message).toMatch(
        /AvroParseException|FileNotFoundException/
      );
      expect((sparkFail.error as Record<string, unknown>).stack_trace).toBeTruthy();
      expect(sparkFail.event.outcome).toBe("failure");
      expect(sparkFail.aws.openlineage.outputs).toEqual([]);
      const dagEnd = events.find(
        (e) => e.aws.openlineage.job.type === "DAG" && e.aws.openlineage.event_type !== "START"
      )!;
      expect(dagEnd.aws.openlineage.event_type).toBe("FAIL");
      expect(dagEnd.aws.openlineage.airflow.dag_run_state).toBe("failed");
      const downstream = events.filter((e) =>
        ["glue_dq_evaluate", "write_run_manifest"].includes(e.aws.openlineage.airflow?.task_id)
      );
      expect(downstream).toEqual([]);
      // nothing downstream of Spark runs either: no DQ result, no Kafka sink object
      expect(docs.filter((d) => d.__dataset === "aws.glue_dataquality")).toEqual([]);
      expect(docs.filter((d) => d.__dataset === "aws.eks")).toEqual([]);
    }
    expect(checked).toBe(true);
  });
});

describe("AWS data pipeline chain — Glue Data Quality via Confluent Kafka", () => {
  afterAll(() => setPipelineOrchestration("all"));

  type DqDoc = Doc & {
    kafka: Record<string, any>;
    aws: { glue_dataquality: Record<string, any>; s3access?: Record<string, any> };
    message: string;
    labels: Record<string, any>;
    event: Record<string, any>;
  };

  it("completed run: DQ result on the topic, EventBridge companion, Connect log and S3 sink object", () => {
    setPipelineOrchestration("mwaa");
    const docs = generateDataPipelineChain(TS, 0) as Doc[];
    const runId = runIdOf(docs);

    const dq = docs.filter((d) => d.__dataset === "aws.glue_dataquality") as DqDoc[];
    expect(dq.length).toBe(1);
    const d = dq[0];
    // Kafka input metadata + raw GetDataQualityResult body
    expect(d.kafka.topic).toBe("glue.dq.results");
    expect((d.input as Record<string, unknown>).type).toBe("kafka");
    const raw = JSON.parse(d.message);
    expect(raw.ResultId).toMatch(/^dqresult-/);
    expect(raw.RuleResults.length).toBeGreaterThan(5);
    expect(d.kafka.key).toBe(raw.ResultId);
    expect(d.aws.glue_dataquality.result_id).toBe(raw.ResultId);
    expect(d.aws.glue_dataquality.score).toBe(raw.Score);
    expect(d.aws.glue_dataquality.rules.total).toBe(raw.RuleResults.length);
    expect(d.labels.pipeline_run_id).toBe(runId);
    expect(d.trace).toBeUndefined();

    // Glue job run that produced the result (CloudWatch /aws-glue/jobs/output)
    const glue = docs.filter((x) => x.__dataset === "aws.glue") as Array<
      Doc & { aws: { glue: Record<string, any> } }
    >;
    expect(glue.length).toBe(1);
    expect(glue[0].aws.glue.job.run_id).toBe(raw.JobRunId);
    expect(glue[0].aws.glue.job.name).toBe(raw.JobName);
    expect(glue[0].aws.glue.arguments["--pipeline_run_id"]).toBe(runId);

    // Native EventBridge event: aws.glue-dataquality
    const eb = docs.filter((x) => x.__dataset === "aws.eventbridge") as Array<
      Doc & { aws: { eventbridge: Record<string, any> }; message: string }
    >;
    const dqEb = eb.find((x) => x.aws.eventbridge.source === "aws.glue-dataquality")!;
    expect(dqEb).toBeTruthy();
    const ebEvent = JSON.parse(dqEb.message);
    expect(ebEvent["detail-type"]).toBe("Data Quality Evaluation Results Available");
    expect(ebEvent.detail.resultID).toBe(raw.ResultId);
    expect(ebEvent.detail.context.contextType).toBe("GLUE_JOB");
    expect(ebEvent.detail.context.jobId).toBe(raw.JobRunId);
    expect(ebEvent.detail.state).toBe(d.aws.glue_dataquality.state);

    // Kafka Connect S3 sink: worker log on EKS + PutObject under the Confluent key layout
    const connect = docs.filter((x) => x.__dataset === "aws.eks") as Array<
      Doc & { message: string }
    >;
    expect(connect.length).toBe(1);
    expect(connect[0].message).toMatch(
      /Files committed to S3\. Target commit offset for glue\.dq\.results-\d+ is \d+/
    );
    const sinkPut = (docs.filter((x) => x.__dataset === "aws.s3access") as DqDoc[]).find((x) =>
      String(x.aws.s3access?.key).startsWith("topics/glue.dq.results/")
    )!;
    expect(sinkPut).toBeTruthy();
    expect(sinkPut.aws.s3access!.key).toMatch(
      /^topics\/glue\.dq\.results\/partition=\d\/glue\.dq\.results\+\d\+\d{10}\.json$/
    );
    expect(sinkPut.aws.s3access!.requester).toContain("confluent-s3-sink-connector");
    // sink object lands after the record was produced
    expect(new Date(sinkPut["@timestamp"] as string).getTime()).toBeGreaterThan(
      new Date(d["@timestamp"] as string).getTime()
    );

    // No Athena or crawler stages remain in the chain
    expect(docs.some((x) => x.__dataset === "aws.athena")).toBe(false);
    expect(glue.some((g) => g.aws.glue.crawler_name)).toBe(false);
  });

  it("null-data and schema-drift runs fail the matching DQDL rules without failing the DAG", () => {
    setPipelineOrchestration("mwaa");
    let sawRowCount = false;
    let sawDrift = false;
    for (let attempt = 0; attempt < 60 && !(sawRowCount && sawDrift); attempt++) {
      const docs = generateDataPipelineChain(TS, 1.0) as Doc[];
      const dq = docs.find((x) => x.__dataset === "aws.glue_dataquality") as DqDoc | undefined;
      if (!dq) continue; // halted run — nothing downstream of Spark
      const g = dq.aws.glue_dataquality;
      expect(g.state).toBe("FAILED");
      expect(g.failed_rules.length).toBe(g.rules.failed);
      expect(dq.event.outcome).toBe("failure");
      if (g.failed_rule_types.includes("RowCount")) {
        sawRowCount = true;
        const rc = g.rule_results.find((r: any) => r.rule_type === "RowCount");
        expect(rc.evaluation_message).toBe("Value: 0 does not meet the constraint requirement!");
      }
      if (
        g.failed_rule_types.some((t: string) =>
          ["ColumnExists", "ColumnCount", "ColumnDataType"].includes(t)
        )
      ) {
        sawDrift = true;
        expect(dq.labels.schema_drift_detected).toBe("true");
      }
      // Ruleset-failure action is "None": the DAG still completes successfully
      const dagEnd = ol(docs).find(
        (e) => e.aws.openlineage.job.type === "DAG" && e.aws.openlineage.event_type !== "START"
      )!;
      expect(dagEnd.aws.openlineage.event_type).toBe("COMPLETE");
    }
    expect(sawRowCount).toBe(true);
    expect(sawDrift).toBe(true);
  });
});

describe("AWS standalone Glue Data Quality generator", () => {
  it("emits one Kafka-input shaped DQ result", () => {
    const d = generateGlueDataQualityLog(TS, 0) as unknown as Doc & {
      kafka: Record<string, any>;
      aws: { glue_dataquality: Record<string, any> };
      message: string;
    };
    expect(d.__dataset).toBe("aws.glue_dataquality");
    expect(d.kafka.topic).toBe("glue.dq.results");
    const raw = JSON.parse(d.message);
    expect(raw.RuleResults.every((r: any) => ["PASS", "FAIL", "ERROR"].includes(r.Result))).toBe(
      true
    );
    expect(d.aws.glue_dataquality.score).toBeLessThanOrEqual(1);
  });

  it("er=1 yields a FAILED evaluation with failed rules", () => {
    const d = generateGlueDataQualityLog(TS, 1) as unknown as Doc & {
      aws: { glue_dataquality: Record<string, any> };
      event: Record<string, any>;
    };
    expect(d.aws.glue_dataquality.state).toBe("FAILED");
    expect(d.aws.glue_dataquality.failed_rules.length).toBeGreaterThan(0);
    expect(d.event.outcome).toBe("failure");
  });
});

describe("AWS standalone OpenLineage generator", () => {
  it("emits a single RunEvent-shaped ECS doc with a derived pipeline run id", () => {
    const d = generateOpenLineageLog(TS, 0) as unknown as OlDoc;
    expect(d.__dataset).toBe("aws.openlineage");
    const raw = JSON.parse(d.message as string);
    expect(["START", "COMPLETE"]).toContain(raw.eventType);
    expect(raw.run.runId).toBe(d.aws.openlineage.run.id);
    expect(d.labels.pipeline_run_id).toBeTruthy();
    expect(["AIRFLOW", "SPARK"]).toContain(d.aws.openlineage.job.integration);
    if (d.aws.openlineage.run.root)
      expect(d.labels.pipeline_run_id).toBe(d.aws.openlineage.run.root.id);
  });

  it("er=1 yields FAIL with error fields", () => {
    const d = generateOpenLineageLog(TS, 1) as unknown as OlDoc;
    expect(d.aws.openlineage.event_type).toBe("FAIL");
    expect(d.event.outcome).toBe("failure");
    expect((d.error as Record<string, unknown>).message).toBeTruthy();
  });
});
