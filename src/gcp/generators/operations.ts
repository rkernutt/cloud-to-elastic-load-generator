/**
 * GCP operations and reliability log generators (Trace, Profiler, Error Reporting).
 */

import {
  type EcsDocument,
  rand,
  randInt,
  gcpCloud,
  makeGcpSetup,
  randLatencyMs,
  randSeverity,
  randTraceId,
  randSpanId,
  randZone,
  gcpLogEvent,
} from "./helpers.js";

const GRPC_RPC_STATUSES = [
  "INTERNAL",
  "DEADLINE_EXCEEDED",
  "PERMISSION_DENIED",
  "RESOURCE_EXHAUSTED",
  "NOT_FOUND",
  "ALREADY_EXISTS",
  "UNAVAILABLE",
] as const;

type GrpcRpcStatus = (typeof GRPC_RPC_STATUSES)[number];

const GRPC_MESSAGES: Partial<Record<GrpcRpcStatus, string>> = {
  INTERNAL: "Internal error servicing Cloud Operations API RPC",
  DEADLINE_EXCEEDED: "Upstream deadline exceeded before trace batch could flush",
  PERMISSION_DENIED: "Caller lacks cloudtrace.spans.create on the traces resource",
  RESOURCE_EXHAUSTED: "Write quota or ingestion rate exhausted for tracing",
  NOT_FOUND: "Requested trace or span resource was not found",
  ALREADY_EXISTS: "Span or profile identifier already accepted for this batch",
  UNAVAILABLE: "Trace backend temporarily unavailable; retry with backoff",
};

function grpcStructuredFault(isErr: boolean): {
  spread: Record<string, unknown>;
  rpcLabel: Record<string, string>;
} {
  if (!isErr) return { spread: {}, rpcLabel: {} };
  const status_code = rand(GRPC_RPC_STATUSES);
  return {
    spread: {
      "gcp.rpc": { status_code },
      error: {
        code: status_code,
        message: GRPC_MESSAGES[status_code] ?? `RPC terminated with ${status_code}`,
        type: "gcp",
      },
    },
    rpcLabel: { "gcp.rpc.status_code": status_code },
  };
}

export function generateCloudTraceLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const spanId = randSpanId();
  const parentSpanId = Math.random() < 0.65 ? randSpanId() : "";
  const kind = rand(["SERVER", "CLIENT", "PRODUCER", "CONSUMER"] as const);
  const statusCodeNum = isErr ? 2 : 0;
  const latencyMs = randLatencyMs(randInt(5, 800), isErr);
  const attributesCount = randInt(3, 40);

  const TRACE_SCENARIOS = [
    "export_trace",
    "batch_write",
    "get_span",
    "list_traces",
    "agent_report",
    "span_end_legacy",
  ] as const;
  const scenario = rand(TRACE_SCENARIOS);

  const baseName = rand([
    "grpc.io.server.call",
    "HTTP GET",
    "pubsub.subscribe",
    "run.googleapis.com/request",
    "tasks.enqueue",
  ]);
  let displayName = baseName;
  let apiMethod = "";
  let message = "";

  if (scenario === "batch_write") {
    apiMethod = `cloudtrace.googleapis.com/v2/projects/${project.id}/traces:batchWrite`;
    displayName = rand(["BatchWriteSpans", "otel.export_span", "run.request"]);
    message = isErr
      ? `TraceService.BatchWriteSpans FAILED project=${project.id} spans_written=0 latency_ms=${latencyMs} grpc.status=${rand(GRPC_RPC_STATUSES)}`
      : `BatchWriteSpans accepted trace_id=${traceId} spans=${randInt(1, 420)} ingestion_latency_ms=${latencyMs}`;
  } else if (scenario === "get_span") {
    apiMethod = `cloudtrace.googleapis.com/v2/projects/${project.id}/traces/${traceId}/spans/${spanId}`;
    displayName = `span:${rand(["db.query", "http.client", "pubsub.pull"])}`;
    message = isErr
      ? `GetTrace/GetSpan FAILED trace=${traceId} span=${spanId}: ${GRPC_MESSAGES.PERMISSION_DENIED}`
      : `Span metadata resolved trace=${traceId} span=${spanId} kind=${kind} attributes=${attributesCount}`;
  } else if (scenario === "list_traces") {
    apiMethod = `cloudtrace.googleapis.com/v2/projects/${project.id}/traces`;
    displayName = "ListTraces";
    message = isErr
      ? `ListTraces FAILED filter=root:"${rand(["checkout", "payments"])}" returning 0 rows: UNAVAILABLE`
      : `ListTraces page returned ${randInt(0, 200)} traces time_range=${randInt(1, 96)}h`;
  } else if (scenario === "agent_report") {
    apiMethod = `cloudtrace.googleapis.com/v2/projects/${project.id}/traceSpans:reportAgentSpans`;
    displayName = rand(["CloudTrace.AgentFlush", "opentelemetry_exporter"]);
    message = isErr
      ? `Agent span report FAILED host=${randZone(region)} queued=${randInt(50, 2000)} dropped=${randInt(1, 120)}`
      : `Agent reported ${randInt(4, 500)} spans from ${rand(["nodejs-otel", "java-otel", "go-otel"])}`;
  } else if (scenario === "export_trace") {
    apiMethod = `cloudtrace.googleapis.com/v2/projects/${project.id}/traces:export`;
    displayName = "ExportTraceServiceRequest";
    message = isErr
      ? `Trace export FAILED destination=${rand(["bigquery", "storage", "pubsub"])} batches=${randInt(0, 4)}`
      : `Exported trace ${traceId} to sink=${rand(["bq://...traces_daily", "gcs://.../otel"])}`;
  } else {
    apiMethod = `cloudtrace.googleapis.com/v2/projects/${project.id}/traces/${traceId}:spanSummary`;
    displayName = rand(["CLOSE_SPAN_EVENT", baseName]);
    message = isErr
      ? `Span ended ERROR trace_id=${traceId} span_id=${spanId} latency_ms=${latencyMs} grpc.code=${statusCodeNum}`
      : `Span closed: trace=${traceId} display_name="${displayName}" latency_ms=${latencyMs} attributes=${attributesCount}`;
  }

  const { spread: faultSpread, rpcLabel } = grpcStructuredFault(isErr);
  const severity = randSeverity(isErr);
  const labels: Record<string, string> = {
    "g.co/r/gcp.project.id": project.id,
    "service.name": rand(["checkout-api", "search-bff", "worker", "gateway"]),
    "http.route": rand(["/v1/cart", "/healthz", "/internal/jobs"]),
    api_method: apiMethod,
    trace_scenario: scenario,
    ...(rpcLabel ?? {}),
  };

  return {
    "@timestamp": ts,
    severity,
    log: { level: severity.toLowerCase() },
    labels: {
      ...labels,
      "resource.type": "cloudtrace.googleapis.com/Project",
      trace: traceId,
    },
    cloud: gcpCloud(region, project, "cloudtrace.googleapis.com"),
    gcp: {
      cloud_trace: {
        scenario,
        api_method: apiMethod,
        trace_id: traceId,
        span_id: spanId,
        parent_span_id: parentSpanId || null,
        display_name: displayName,
        kind,
        grpc_status_numeric: statusCodeNum,
        latency_ms: latencyMs,
        attributes_count: attributesCount,
        labels,
      },
    },
    event: gcpLogEvent(
      isErr,
      latencyMs,
      apiMethod || displayName,
      ["process"],
      isErr
        ? ["error"]
        : scenario === "batch_write" || scenario === "agent_report"
          ? ["change"]
          : ["access"]
    ),
    message,
    ...faultSpread,
  };
}

export function generateCloudProfilerLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const profileType = rand(["CPU", "HEAP", "THREADS", "CONTENTION", "WALL"] as const);
  const serviceName = rand(["api-server", "batch-worker", "indexer", "payments-svc"]);
  const serviceVersion = `v${randInt(1, 9)}.${randInt(0, 40)}.${randInt(0, 99)}`;
  const deploymentTarget = rand(["gce", "gke", "cloud-run"] as const);
  const durationSeconds = randInt(10, isErr ? 120 : 300);
  const zone = randZone(region);

  const PROF_SCENARIOS = [
    "create_profile",
    "update_profile",
    "list_profiles",
    "offline_profile",
    "upload_batch",
    "profile_symbolize",
  ] as const;
  const scenario = rand(PROF_SCENARIOS);

  let apiMethod = "";
  let message = "";
  if (scenario === "create_profile") {
    apiMethod = `cloudprofiler.googleapis.com/v2/projects/${project.id}/profiles`;
    message = isErr
      ? `ProfilerService.CreateProfile FAILED service=${serviceName}: ${GRPC_MESSAGES.PERMISSION_DENIED}`
      : `CreateProfile queued type=${profileType} deployment=${deploymentTarget} duration_s=${durationSeconds}`;
  } else if (scenario === "update_profile") {
    apiMethod = `cloudprofiler.googleapis.com/v2/projects/${project.id}/profiles/${rand(["cpu", "wall", "heap"])}:${profileType}`;
    message = isErr
      ? `ProfilerService.UpdateProfile FAILED profile_id=${randInt(1000, 9999)} quota`
      : `UpdateProfile stored bytes=${randInt(8_000, 2_000_000)} service=${serviceName}@${serviceVersion}`;
  } else if (scenario === "list_profiles") {
    apiMethod = `cloudprofiler.googleapis.com/v2/projects/${project.id}/profiles:list`;
    message = isErr
      ? `ListProfiles FAILED pageToken corrupt: INVALID_ARGUMENT`
      : `ListProfiles returned ${randInt(0, 25)} profiles for service=${serviceName}`;
  } else if (scenario === "offline_profile") {
    apiMethod = `cloudprofiler.googleapis.com/v2/projects/${project.id}/profiles:offline`;
    message = isErr
      ? `Offline profile upload FAILED agent=${rand(["pprof", "async-profiler"])}: ALREADY_EXISTS`
      : `Offline pprof ingested service=${serviceName} samples=${randInt(1_000, 800_000)}`;
  } else if (scenario === "upload_batch") {
    apiMethod = `cloudprofiler.googleapis.com/v2/projects/${project.id}/profiles:batchCreate`;
    message = isErr
      ? `Batch profile upload FAILED shard=${zone} reason=RESOURCE_EXHAUSTED`
      : `BatchCreateProfiles accepted ${randInt(1, 12)} slices zone=${zone}`;
  } else {
    apiMethod = `cloudprofiler.googleapis.com/v2/projects/${project.id}/profiles:symbolize`;
    message = isErr
      ? `Symbolization FAILED build_id=${randInt(1e8, 9e8)} NOT_FOUND`
      : `Symbolize completed frames=${randInt(200, 90_000)} missing_debug_info=0`;
  }

  const { spread: faultSpread, rpcLabel } = grpcStructuredFault(isErr);
  const severity = randSeverity(isErr);

  return {
    "@timestamp": ts,
    severity,
    log: { level: severity.toLowerCase() },
    labels: {
      "resource.type": "cloudprofiler.googleapis.com/Project",
      service: serviceName,
      api_method: apiMethod,
      profiler_scenario: scenario,
      ...rpcLabel,
    },
    cloud: gcpCloud(region, project, "cloudprofiler.googleapis.com"),
    gcp: {
      cloud_profiler: {
        scenario,
        api_method: apiMethod,
        profile_type: profileType,
        service_name: serviceName,
        service_version: serviceVersion,
        deployment_target: deploymentTarget,
        duration_seconds: durationSeconds,
        zone,
      },
    },
    event: gcpLogEvent(
      isErr,
      durationSeconds * 1000,
      apiMethod,
      ["process"],
      isErr
        ? ["error"]
        : scenario === "create_profile" || scenario === "upload_batch"
          ? ["creation"]
          : scenario === "update_profile"
            ? ["change"]
            : ["access"]
    ),
    message,
    ...faultSpread,
  };
}

export function generateErrorReportingLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const errorGroupId = Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
  const serviceName = rand(["checkout-api", "render-ssr", "etl-worker", "mobile-bff"]);
  const version = `${randInt(1, 9)}.${randInt(0, 50)}.${randInt(0, 99)}`;
  const exceptionType = rand([
    "NullPointerException",
    "TypeError",
    "IndexError",
    "RuntimeException",
    "IllegalStateException",
    "ValueError",
  ] as const);
  const errMsg = isErr
    ? rand([
        "Cannot read property 'id' of undefined",
        "Connection reset by peer",
        "Division by zero",
        "Required header X-Request-Id missing",
      ])
    : "Recovered after retry";
  const firstSeen = ts;
  const count = randInt(isErr ? 12 : 1, isErr ? 50_000 : 200);
  const affectedUsersCount = isErr ? randInt(5, 12_000) : randInt(0, 3);
  const httpMethod = rand(["GET", "POST", "PUT", "DELETE"] as const);
  const url = rand(["/v1/orders", "/cart", "/graphql", "/batch/import"]);

  const ERR_SCENARIOS = [
    "report_event",
    "delete_events",
    "get_group",
    "update_group",
    "stats_list",
    "resolution_note",
  ] as const;
  const scenario = rand(ERR_SCENARIOS);

  let apiMethod = "";
  let message = "";
  if (scenario === "report_event") {
    apiMethod = `clouderrorreporting.googleapis.com/v1beta1/projects/${project.id}/events:report`;
    message = isErr
      ? `ReportErrorEvent FAILED group=${errorGroupId} exception=${exceptionType} msg="${errMsg}"`
      : `ReportErrorEvent accepted service=${serviceName}@${version} events=${count}`;
  } else if (scenario === "delete_events") {
    apiMethod = `clouderrorreporting.googleapis.com/v1beta1/projects/${project.id}/events`;
    message = isErr
      ? `DeleteEvents FAILED filter=${errorGroupId}: PERMISSION_DENIED`
      : `DeleteEvents removed ${randInt(1, 500)} stale events`;
  } else if (scenario === "get_group") {
    apiMethod = `clouderrorreporting.googleapis.com/v1beta1/projects/${project.id}/groups/${errorGroupId}`;
    message = isErr
      ? `GetGroup FAILED ${errorGroupId}: NOT_FOUND`
      : `GetGroup reps=${randInt(2, 40)} representative_message="${rand(["timeout", "5xx"])}"`;
  } else if (scenario === "update_group") {
    apiMethod = `clouderrorreporting.googleapis.com/v1beta1/projects/${project.id}/groups/${errorGroupId}`;
    message = isErr
      ? `UpdateGroup FAILED resolution_status=IGNORED_LOCKED: RESOURCE_EXHAUSTED`
      : `UpdateGroup set resolution_status=MUTED_ISSUE group=${errorGroupId}`;
  } else if (scenario === "stats_list") {
    apiMethod = `clouderrorreporting.googleapis.com/v1beta1/projects/${project.id}/groupStats:list`;
    message = isErr
      ? `ListGroupStats FAILED time_range=${randInt(1, 48)}h: DEADLINE_EXCEEDED`
      : `ListGroupStats buckets=${randInt(1, 24)} trending=${rand(["UP", "FLAT", "DOWN"])}`;
  } else {
    apiMethod = `clouderrorreporting.googleapis.com/v1beta1/projects/${project.id}/groups/${errorGroupId}:setResolution`;
    message = isErr
      ? `Resolution workflow FAILED exception=${exceptionType}`
      : `Error group ${errorGroupId} marked RESOLVED for service=${serviceName}@${version} (last_event_at=${firstSeen})`;
  }

  const { spread: faultSpread, rpcLabel } = grpcStructuredFault(isErr);
  const severity = randSeverity(isErr);

  return {
    "@timestamp": ts,
    severity,
    log: { level: severity.toLowerCase() },
    labels: {
      "resource.type": "clouderrorreporting.googleapis.com/Project",
      error_group: errorGroupId,
      service: serviceName,
      api_method: apiMethod,
      error_report_scenario: scenario,
      ...rpcLabel,
    },
    cloud: gcpCloud(region, project, "clouderrorreporting.googleapis.com"),
    gcp: {
      error_reporting: {
        scenario,
        api_method: apiMethod,
        error_group_id: errorGroupId,
        service_name: serviceName,
        version,
        exception_type: exceptionType,
        message: errMsg,
        first_seen: firstSeen,
        count,
        affected_users_count: affectedUsersCount,
        http_method: httpMethod,
        url,
      },
    },
    event: gcpLogEvent(
      isErr,
      randInt(1, 500),
      apiMethod,
      ["process"],
      isErr
        ? ["error"]
        : scenario === "report_event"
          ? ["info"]
          : scenario === "delete_events"
            ? ["deletion"]
            : scenario === "update_group"
              ? ["change"]
              : ["access"]
    ),
    message,
    ...faultSpread,
  };
}
