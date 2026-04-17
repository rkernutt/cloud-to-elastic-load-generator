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
} from "./helpers.js";

export function generateCloudTraceLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const spanId = randSpanId();
  const parentSpanId = Math.random() < 0.65 ? randSpanId() : "";
  const displayName = rand([
    "grpc.io.server.call",
    "HTTP GET",
    "pubsub.subscribe",
    "run.googleapis.com/request",
    "tasks.enqueue",
  ]);
  const kind = rand(["SERVER", "CLIENT", "PRODUCER", "CONSUMER"] as const);
  const statusCode = isErr ? 2 : 0;
  const latencyMs = randLatencyMs(randInt(5, 800), isErr);
  const attributesCount = randInt(3, 40);
  const labels: Record<string, string> = {
    "g.co/r/gcp.project.id": project.id,
    "service.name": rand(["checkout-api", "search-bff", "worker", "gateway"]),
    "http.route": rand(["/v1/cart", "/healthz", "/internal/jobs"]),
  };
  const severity = randSeverity(isErr);
  const message = isErr
    ? `cloudtrace.googleapis.com: Span ended with ERROR trace_id=${traceId} span_id=${spanId} name="${displayName}" latency_ms=${latencyMs} status.code=${statusCode} status.message=${rand(["DEADLINE_EXCEEDED", "UNAVAILABLE", "INTERNAL"])}`
    : `Exported span: trace_id=${traceId} span_id=${spanId} display_name="${displayName}" kind=${kind} latency_ms=${latencyMs} attribute_count=${attributesCount}`;

  return {
    "@timestamp": ts,
    severity,
    labels: {
      ...labels,
      "resource.type": "cloudtrace.googleapis.com/Project",
      trace: traceId,
    },
    cloud: gcpCloud(region, project, "cloudtrace.googleapis.com"),
    gcp: {
      cloud_trace: {
        trace_id: traceId,
        span_id: spanId,
        parent_span_id: parentSpanId || null,
        display_name: displayName,
        kind,
        status_code: statusCode,
        latency_ms: latencyMs,
        attributes_count: attributesCount,
        labels,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: latencyMs,
    },
    message,
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
  const severity = randSeverity(isErr);
  const message = isErr
    ? `cloudprofiler.googleapis.com: UploadProfile FAILED service=${serviceName} version=${serviceVersion}: ${rand(["Agent version incompatible", "PERMISSION_DENIED on profiler.googleapis.com", "Upload quota exceeded"])}`
    : `Profile uploaded: type=${profileType} deployment.labels.version="${serviceVersion}" service=${serviceName} target=${deploymentTarget} duration_s=${durationSeconds} zone=${zone}`;

  return {
    "@timestamp": ts,
    severity,
    labels: { "resource.type": "cloudprofiler.googleapis.com/Project", service: serviceName },
    cloud: gcpCloud(region, project, "cloudprofiler.googleapis.com"),
    gcp: {
      cloud_profiler: {
        profile_type: profileType,
        service_name: serviceName,
        service_version: serviceVersion,
        deployment_target: deploymentTarget,
        duration_seconds: durationSeconds,
        zone,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: durationSeconds * 1000,
    },
    message,
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
  const severity = randSeverity(isErr);
  const message = isErr
    ? `clouderrorreporting.googleapis.com: Error group ${errorGroupId} (${exceptionType}) event_rate elevated: message="${errMsg}" events=${count} affected_users≈${affectedUsersCount} ${httpMethod} ${url} service=${serviceName}@${version}`
    : `Error group ${errorGroupId} marked RESOLVED for service=${serviceName}@${version} (last_event_at=${firstSeen})`;

  return {
    "@timestamp": ts,
    severity,
    labels: {
      "resource.type": "clouderrorreporting.googleapis.com/Project",
      error_group: errorGroupId,
      service: serviceName,
    },
    cloud: gcpCloud(region, project, "clouderrorreporting.googleapis.com"),
    gcp: {
      error_reporting: {
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
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(1, 500),
    },
    message,
  };
}
