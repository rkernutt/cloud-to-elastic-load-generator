import { randHex, randInt, randFloat, serviceBlock, otelBlocks } from "./helpers.js";

// ─── Shared constants ─────────────────────────────────────────────────────────

const ENVS = ["production", "production", "staging", "dev"];

const RUNTIME_LANG = {
  "python3.11": "python",
  "python3.12": "python",
  "nodejs18.x": "nodejs",
  "nodejs20.x": "nodejs",
  java21: "java",
};

const RUNTIME_VERSION = {
  "python3.11": "3.11.9",
  "python3.12": "3.12.3",
  "nodejs18.x": "18.20.4",
  "nodejs20.x": "20.15.1",
  java21: "21.0.3",
} as const;

/** AWS cloud block as produced by `cloudBlock`. */
export interface WorkflowCloudBlock {
  provider: string;
  region: string;
  account: { id: string; name: string };
  service: { name: string };
}

/** FaaS (Lambda) block as produced by `faasBlock`. */
export interface WorkflowFaasBlock {
  name: string;
  id: string;
  version: string;
  coldstart: boolean;
  execution: string;
  trigger: { type: string };
}

export interface WorkflowTxDocArgs {
  ts: string;
  traceId: string;
  txId: string;
  /** Omitted for the trace root; otherwise the invoking span id. */
  parentId?: string;
  serviceName: string;
  environment: string;
  language: string;
  runtime: string;
  framework?: string | null;
  txType: string;
  txName: string;
  durationUs: number;
  isErr: boolean;
  spanCount?: number;
  cloud: WorkflowCloudBlock;
  faas?: WorkflowFaasBlock;
  labels?: Record<string, string>;
  distro?: string;
}

export interface WorkflowSpanDb {
  type: string;
  statement: string;
}

export interface WorkflowSpanDocArgs {
  ts: string;
  traceId: string;
  txId: string;
  parentId: string;
  spanId: string;
  spanType: string;
  spanSubtype: string;
  spanName: string;
  spanAction: string;
  durationUs: number;
  isErr: boolean;
  db?: WorkflowSpanDb;
  destination?: string;
  labels?: Record<string, string>;
  serviceName: string;
  environment: string;
  language: string;
  runtime: string;
  distro?: string;
}

/** Stack frame shapes passed to `errorDoc` (Python-style or Java-style). */
export type WorkflowErrorStackFrame =
  | {
      function: string;
      filename: string;
      lineno: number;
      library_frame: boolean;
    }
  | {
      classname: string;
      function: string;
      filename: string;
      lineno: number;
      library_frame: boolean;
    };

export interface WorkflowErrorDocArgs {
  ts: string;
  traceId: string;
  txId: string;
  txType: string;
  parentId: string;
  exceptionType: string;
  exceptionMessage: string;
  culprit: string;
  handled?: boolean;
  frames?: readonly WorkflowErrorStackFrame[];
  serviceName: string;
  environment: string;
  language: string;
  runtime: string;
  distro?: string;
}

// ─── Low-level document builders ─────────────────────────────────────────────

/**
 * Build a transaction document for a service entry point.
 * `parentId` is undefined for the root service; set it to the invoking span ID
 * for downstream services so APM can stitch the distributed trace.
 */
function txDoc(args: WorkflowTxDocArgs) {
  const {
    ts,
    traceId,
    txId,
    parentId,
    serviceName,
    environment,
    language,
    runtime,
    framework,
    txType,
    txName,
    durationUs,
    isErr,
    spanCount,
    cloud,
    faas,
    labels,
    distro = "elastic",
  } = args;
  const svcBlock = serviceBlock(
    serviceName,
    environment,
    language,
    framework ?? null,
    runtime,
    RUNTIME_VERSION[runtime as keyof typeof RUNTIME_VERSION] ?? "1.0.0"
  );
  const { agent, telemetry } = otelBlocks(language, distro);

  return {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    ...(parentId ? { parent: { id: parentId } } : {}),
    transaction: {
      id: txId,
      name: txName,
      type: txType,
      duration: { us: durationUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: spanCount ?? 1, dropped: 0 },
      ...(faas ? { faas: faas } : {}),
    },
    ...(faas ? { faas: faas } : {}),
    service: svcBlock,
    agent: agent,
    telemetry: telemetry,
    cloud: cloud,
    ...(labels || distro === "aws"
      ? {
          labels: {
            ...(labels ?? {}),
            ...(distro === "aws"
              ? {
                  "aws.xray.trace_id": `1-${randHex(8)}-${randHex(24)}`,
                  "aws.xray.segment_id": randHex(16),
                }
              : {}),
          },
        }
      : {}),
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };
}

/**
 * Build a span document.
 * `txId`     = the transaction this span belongs to (for grouping in APM).
 * `parentId` = the immediate parent (could be txId or another span's id).
 */
function spanDoc(args: WorkflowSpanDocArgs) {
  const {
    ts,
    traceId,
    txId,
    parentId,
    spanId,
    spanType,
    spanSubtype,
    spanName,
    spanAction,
    durationUs,
    isErr,
    db,
    destination,
    labels,
    serviceName,
    environment,
    language,
    runtime,
    distro = "elastic",
  } = args;
  const svcBlock = serviceBlock(
    serviceName,
    environment,
    language,
    null,
    runtime,
    RUNTIME_VERSION[runtime as keyof typeof RUNTIME_VERSION] ?? "1.0.0"
  );
  const { agent, telemetry } = otelBlocks(language, distro);

  return {
    "@timestamp": ts,
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: parentId },
    span: {
      id: spanId,
      type: spanType,
      subtype: spanSubtype,
      name: spanName,
      duration: { us: durationUs },
      action: spanAction,
      ...(db ? { db: db } : {}),
      ...(destination
        ? { destination: { service: { resource: destination, type: spanType, name: destination } } }
        : {}),
    },
    service: svcBlock,
    agent: agent,
    telemetry: telemetry,
    ...(labels ? { labels: labels } : {}),
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };
}

/** Build the standard AWS cloud block. */
function cloudBlock(region: string, account: { id: string; name: string }, awsService: string): WorkflowCloudBlock {
  return {
    provider: "aws",
    region: region,
    account: { id: account.id, name: account.name },
    service: { name: awsService },
  };
}

/**
 * Build an APM error document.
 * Errors land in logs-apm.error-* (data_stream.type = "logs").
 * The parent.id ties the error to the tx or span where it occurred.
 */
function errorDoc(args: WorkflowErrorDocArgs) {
  const {
    ts,
    traceId,
    txId,
    txType,
    parentId,
    exceptionType,
    exceptionMessage,
    culprit,
    handled = false,
    frames = [],
    serviceName,
    environment,
    language,
    runtime,
    distro = "elastic",
  } = args;
  const svcBlock = serviceBlock(
    serviceName,
    environment,
    language,
    null,
    runtime,
    RUNTIME_VERSION[runtime as keyof typeof RUNTIME_VERSION] ?? "1.0.0"
  );
  const { agent, telemetry } = otelBlocks(language, distro);
  return {
    "@timestamp": ts,
    processor: { name: "error", event: "error" },
    trace: { id: traceId },
    transaction: { id: txId, type: txType, sampled: true },
    parent: { id: parentId },
    error: {
      id: randHex(32),
      grouping_key: randHex(32),
      culprit,
      exception: [
        {
          type: exceptionType,
          message: exceptionMessage,
          handled,
          stacktrace: frames,
        },
      ],
    },
    service: svcBlock,
    agent,
    telemetry,
    data_stream: { type: "logs", dataset: "apm.error", namespace: "default" },
  };
}

// ─── Stacktrace frame sets ────────────────────────────────────────────────────
// Realistic frames per runtime/scenario. Mixed library + user frames.

const FRAMES = {
  // Python Lambda — task timeout (Runtime.ExitError)
  python_timeout: (fn: string) => [
    { function: "handler", filename: `${fn}.py`, lineno: 47, library_frame: false },
    { function: "_execute", filename: `${fn}.py`, lineno: 31, library_frame: false },
    { function: "invoke", filename: "botocore/endpoint.py", lineno: 174, library_frame: true },
  ],
  // Python — DynamoDB ProvisionedThroughputExceededException
  python_dynamo_throttle: (fn: string) => [
    {
      function: "_make_api_call",
      filename: "botocore/client.py",
      lineno: 960,
      library_frame: true,
    },
    {
      function: "_convert_input_params",
      filename: "botocore/serialize.py",
      lineno: 289,
      library_frame: true,
    },
    { function: "write_record", filename: `${fn}.py`, lineno: 38, library_frame: false },
    { function: "handler", filename: `${fn}.py`, lineno: 14, library_frame: false },
  ],
  // Python — Bedrock ThrottlingException
  python_bedrock_throttle: (fn: string) => [
    {
      function: "_make_api_call",
      filename: "botocore/client.py",
      lineno: 960,
      library_frame: true,
    },
    { function: "invoke_model", filename: `${fn}.py`, lineno: 52, library_frame: false },
    { function: "handler", filename: `${fn}.py`, lineno: 19, library_frame: false },
  ],
  // Python — SageMaker ResourceLimitExceeded (throttle)
  python_sagemaker_throttle: (fn: string) => [
    {
      function: "create_processing_job",
      filename: "botocore/client.py",
      lineno: 960,
      library_frame: true,
    },
    {
      function: "_make_api_call",
      filename: "botocore/client.py",
      lineno: 886,
      library_frame: true,
    },
    { function: "start_job", filename: `${fn}.py`, lineno: 38, library_frame: false },
    { function: "handler", filename: `${fn}.py`, lineno: 15, library_frame: false },
  ],
  // Python — Redshift COPY S3ServiceException
  python_redshift: (fn: string) => [
    { function: "execute", filename: "psycopg2/cursor.py", lineno: 122, library_frame: true },
    { function: "fetchall", filename: "psycopg2/cursor.py", lineno: 136, library_frame: true },
    { function: "run_copy", filename: `${fn}.py`, lineno: 61, library_frame: false },
    { function: "handler", filename: `${fn}.py`, lineno: 22, library_frame: false },
  ],
  // Java Lambda — PSQLException (RDS)
  java_rds: () => [
    {
      classname: "org.postgresql.core.v3.QueryExecutorImpl",
      function: "execute",
      filename: "QueryExecutorImpl.java",
      lineno: 342,
      library_frame: true,
    },
    {
      classname: "org.postgresql.jdbc.PgPreparedStatement",
      function: "executeUpdate",
      filename: "PgPreparedStatement.java",
      lineno: 137,
      library_frame: true,
    },
    {
      classname: "com.example.payment.PaymentRepository",
      function: "insertTransaction",
      filename: "PaymentRepository.java",
      lineno: 78,
      library_frame: false,
    },
    {
      classname: "com.example.payment.Handler",
      function: "handleRequest",
      filename: "Handler.java",
      lineno: 31,
      library_frame: false,
    },
  ],
  // Java — Glue/Spark JobRunFailedException
  java_glue: () => [
    {
      classname: "org.apache.spark.sql.execution.datasources.FileFormatWriter",
      function: "write",
      filename: "FileFormatWriter.scala",
      lineno: 203,
      library_frame: true,
    },
    {
      classname: "com.amazonaws.services.glue.GlueContext",
      function: "getSinkWithFormat",
      filename: "GlueContext.scala",
      lineno: 342,
      library_frame: true,
    },
    {
      classname: "com.example.etl.LakehouseEtlJob",
      function: "run",
      filename: "LakehouseEtlJob.scala",
      lineno: 87,
      library_frame: false,
    },
    {
      classname: "com.example.etl.Main",
      function: "main",
      filename: "Main.scala",
      lineno: 12,
      library_frame: false,
    },
  ],
  // Java — Redshift COPY via JDBC
  java_redshift: () => [
    {
      classname: "com.amazon.redshift.jdbc42.RS42PreparedStatement",
      function: "execute",
      filename: "RS42PreparedStatement.java",
      lineno: 553,
      library_frame: true,
    },
    {
      classname: "com.example.loader.RedshiftLoader",
      function: "executeCopy",
      filename: "RedshiftLoader.java",
      lineno: 92,
      library_frame: false,
    },
    {
      classname: "com.example.loader.Handler",
      function: "handleRequest",
      filename: "Handler.java",
      lineno: 28,
      library_frame: false,
    },
  ],
};

/**
 * Occasionally inflate a duration to simulate resource contention, queue wait,
 * or partition skew. ~7% of calls produce a 2.5–4× spike; the rest pass through.
 * Only applied to long-running stages (Glue, Redshift, SageMaker) — not API calls.
 */
function spike(baseUs: number, prob = 0.07, lo = 2.5, hi = 4.0) {
  return Math.random() < prob ? Math.round(baseUs * randFloat(lo, hi)) : baseUs;
}

/**
 * Cold start init duration by runtime. JVM classloading (java21) takes 2–8 s;
 * Python and Node cold starts are 300 ms–2.5 s and 150 ms–1.2 s respectively.
 * Only called when faas.coldstart is true (~8 % of invocations).
 */
function coldStartInitUs(runtime: string) {
  if (runtime === "java21") return randInt(2000, 8000) * 1000;
  if (runtime === "nodejs18.x" || runtime === "nodejs20.x") return randInt(150, 1200) * 1000;
  return randInt(300, 2500) * 1000; // Python default
}

/** Build a FaaS block for Lambda transactions. */
function faasBlock(funcName: string, region: string, accountId: string, trigger = "other") {
  const executionId = `${randHex(8)}-${randHex(4)}-${randHex(4)}-${randHex(4)}-${randHex(12)}`;
  const coldStart = Math.random() < 0.08;
  return {
    name: funcName,
    id: `arn:aws:lambda:${region}:${accountId}:function:${funcName}`,
    version: "$LATEST",
    coldstart: coldStart,
    execution: executionId,
    trigger: { type: trigger },
  };
}

export {
  ENVS,
  RUNTIME_LANG,
  RUNTIME_VERSION,
  txDoc,
  spanDoc,
  cloudBlock,
  errorDoc,
  FRAMES,
  spike,
  coldStartInitUs,
  faasBlock,
};
