/**
 * AWS service log generators — extended services with multi-scenario branching,
 * structured errors, and real API operation names.
 *
 * Quality target: match generateLambdaLog / generateAppRunnerLog depth.
 */
import {
  rand,
  randInt,
  randFloat,
  randId,
  randHexId,
  randIp,
  randUUID,
  randAccount,
  REGIONS,
  randFqdn,
  randAppDomain,
  EMAIL_DOMAINS,
} from "../../helpers";
import type { EcsDocument } from "./types.js";

type AwsEventType =
  | "access"
  | "admin"
  | "change"
  | "connection"
  | "creation"
  | "deletion"
  | "error"
  | "info"
  | "start"
  | "end";

function awsEventType(
  isErr: boolean,
  onSuccess: AwsEventType | readonly AwsEventType[]
): AwsEventType[] {
  if (isErr) return ["error"];
  return Array.isArray(onSuccess) ? [...onSuccess] : [onSuccess];
}

/* ------------------------------------------------------------------ */
/*  Bedrock Guardrails                                                */
/* ------------------------------------------------------------------ */
function generateBedrockGuardrailsLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const guardrailId = `gr-${randId(10).toLowerCase()}`;
  const version = rand(["DRAFT", "1", "2", "3"]);
  const guardrailArn = `arn:aws:bedrock:${region}:${acct.id}:guardrail/${guardrailId}`;

  const scenario = isErr
    ? rand(["throttle", "validation", "internal", "access_denied"] as const)
    : rand(["pass_clean", "pass_clean", "intervened", "automated_reasoning", "audit"] as const);

  const lat = randFloat(0.02, scenario === "throttle" ? 0.05 : isErr ? 2.5 : 0.8);
  const tokenIn = randInt(120, 12_000);
  const tokenOut = randInt(40, 8_000);

  let message: string;
  let errorBlock: Record<string, unknown> | null = null;

  if (scenario === "throttle") {
    const retryAfter = randInt(1, 30);
    message = `ApplyGuardrail throttled for ${guardrailId} — Retry-After: ${retryAfter}s (concurrent invocations exceeded)`;
    errorBlock = {
      code: "ThrottlingException",
      message: `Rate exceeded for guardrail ${guardrailId}`,
      type: "client",
    };
  } else if (scenario === "validation") {
    const reason = rand([
      "Input text exceeds maximum length of 100000 characters",
      "GuardrailVersion DRAFT is not deployable",
      "Content type application/xml is not supported",
    ]);
    message = `ApplyGuardrail ValidationException: ${reason}`;
    errorBlock = { code: "ValidationException", message: reason, type: "client" };
  } else if (scenario === "internal") {
    message = `ApplyGuardrail InternalServerException for ${guardrailId} v${version} — upstream model endpoint returned 503`;
    errorBlock = {
      code: "InternalServerException",
      message: "Upstream service unavailable",
      type: "server",
    };
  } else if (scenario === "access_denied") {
    message = `ApplyGuardrail AccessDeniedException: User arn:aws:iam::${acct.id}:user/dev is not authorized to invoke guardrail ${guardrailId}`;
    errorBlock = {
      code: "AccessDeniedException",
      message: "Insufficient permissions",
      type: "client",
    };
  } else if (scenario === "intervened") {
    const policyType = rand([
      "CONTENT_FILTER",
      "DENIED_TOPICS",
      "WORD_FILTER",
      "PII",
      "CONTEXTUAL_GROUNDING",
    ]);
    const action = rand(["BLOCKED", "ANONYMIZED"]);
    const findings = randInt(1, 6);
    message = `ApplyGuardrail OK — ${guardrailId} v${version}: ${action} by ${policyType} (${findings} finding${findings > 1 ? "s" : ""}, tokens_in=${tokenIn} tokens_out=${tokenOut})`;
  } else if (scenario === "automated_reasoning") {
    const claims = randInt(1, 8);
    const hallucinations = randInt(0, 2);
    message = `InvokeAutomatedReasoningCheck OK — ${guardrailId}: ${claims} claims validated, ${hallucinations} potential hallucination${hallucinations !== 1 ? "s" : ""} flagged`;
  } else {
    message = `ApplyGuardrail OK — ${guardrailId} v${version}: no intervention (tokens_in=${tokenIn} tokens_out=${tokenOut}, latency_ms=${Math.round(lat * 1000)})`;
  }

  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "bedrock-guardrails" },
    },
    aws: {
      dimensions: {
        GuardrailArn: guardrailArn,
        GuardrailVersion: version,
        Operation: scenario.startsWith("auto") ? "InvokeAutomatedReasoningCheck" : "ApplyGuardrail",
      },
      bedrockguardrails: {
        guardrail_id: guardrailId,
        guardrail_version: version,
        operation: scenario.startsWith("auto") ? "InvokeAutomatedReasoningCheck" : "ApplyGuardrail",
        source: rand(["INPUT", "OUTPUT", "NONE"]),
        action: scenario === "intervened" ? rand(["BLOCKED", "ANONYMIZED"]) : "NONE",
        findings: scenario === "intervened" ? randInt(1, 6) : 0,
        policy_types:
          scenario === "intervened"
            ? [rand(["CONTENT_FILTER", "DENIED_TOPICS", "WORD_FILTER", "PII"])]
            : [],
        latency_ms: Math.round(lat * 1000),
        text_units: randInt(1, 120),
        tokens_input: tokenIn,
        tokens_output: tokenOut,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      dataset: "aws.bedrockguardrails",
      category: ["process"],
      type: awsEventType(isErr, scenario === "intervened" ? "change" : "access"),
      duration: Math.round(lat * 1e9),
    },
    message,
    ...(errorBlock ? { error: errorBlock } : {}),
  };
}

/* ------------------------------------------------------------------ */
/*  EMR Serverless                                                    */
/* ------------------------------------------------------------------ */
function generateEmrServerlessLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const appId = `00${randInt(100000000, 999999999)}`;
  const appName = rand(["analytics-app", "batch-processor", "streaming-etl", "hive-warehouse"]);
  const jobId = `00${randInt(100000000, 999999999)}${randInt(100000000, 999999999)}`;
  const jobName = rand([
    "daily-spark-etl",
    "hive-report",
    "streaming-micro-batch",
    "data-quality-check",
    "feature-engineering",
  ]);
  const releaseLabel = rand(["emr-7.2.0-latest", "emr-7.5.0-latest", "emr-6.15.0-latest"]);
  const roleArn = `arn:aws:iam::${acct.id}:role/EMRServerlessJobRole`;

  const scenario = isErr
    ? rand(["job_failed", "driver_oom", "validation_err", "cancelled", "s3_access_denied"] as const)
    : rand([
        "job_submitted",
        "job_running",
        "job_success",
        "driver_log",
        "spark_stage_complete",
      ] as const);

  const durSec =
    scenario === "job_success"
      ? randFloat(60, 3600)
      : scenario === "job_submitted"
        ? 0
        : randFloat(5, isErr ? 600 : 1800);
  const vcores = randInt(4, 64);
  const memGb = randInt(8, 512);

  let message: string;
  let errorBlock: Record<string, unknown> | null = null;
  let state: string;

  if (scenario === "job_failed") {
    state = "FAILED";
    const exitCode = rand([1, 137, 143]);
    message = `EMR Serverless job ${jobName} (${jobId}) FAILED — Spark driver exited with code ${exitCode} after ${Math.round(durSec)}s. Application: ${appName} (${appId}). Release: ${releaseLabel}`;
    errorBlock = {
      code: "JobRunFailedException",
      message: `Driver process exited with code ${exitCode}`,
      type: "server",
    };
  } else if (scenario === "driver_oom") {
    state = "FAILED";
    message = `EMR Serverless job ${jobName} (${jobId}) FAILED — java.lang.OutOfMemoryError: Java heap space. Driver requested ${memGb}GB but peak usage exceeded limit. Consider increasing spark.driver.memory.`;
    errorBlock = {
      code: "OutOfMemoryError",
      message: "Java heap space exhausted in driver",
      type: "server",
      stack_trace: `java.lang.OutOfMemoryError: Java heap space\n\tat java.util.Arrays.copyOf(Arrays.java:${randInt(100, 400)})\n\tat org.apache.spark.sql.execution.SparkPlan.executeQuery(SparkPlan.scala:${randInt(100, 300)})`,
    };
  } else if (scenario === "validation_err") {
    state = "FAILED";
    const reason = rand([
      "Entry point script s3://bucket/main.py does not exist",
      "Release label emr-5.0.0 is not supported for Serverless",
      "IAM role does not have sufficient S3 permissions",
    ]);
    message = `EMR Serverless StartJobRun ValidationException: ${reason}`;
    errorBlock = { code: "ValidationException", message: reason, type: "client" };
  } else if (scenario === "cancelled") {
    state = "CANCELLED";
    message = `EMR Serverless job ${jobName} (${jobId}) CANCELLED by user arn:aws:iam::${acct.id}:user/${rand(["admin", "data-eng"])} after ${Math.round(durSec)}s`;
  } else if (scenario === "s3_access_denied") {
    state = "FAILED";
    message = `EMR Serverless job ${jobName} (${jobId}) FAILED — S3 AccessDenied on s3://${rand(["data-lake", "analytics-raw"])}-${acct.id}/input/. Verify ${roleArn} has s3:GetObject permission.`;
    errorBlock = {
      code: "AccessDeniedException",
      message: "S3 bucket access denied for execution role",
      type: "client",
    };
  } else if (scenario === "job_submitted") {
    state = "SUBMITTED";
    message = `EMR Serverless StartJobRun accepted: app=${appName} (${appId}) job=${jobName} (${jobId}) release=${releaseLabel} role=${roleArn}`;
  } else if (scenario === "job_running") {
    state = "RUNNING";
    const progress = randInt(10, 90);
    message = `EMR Serverless job ${jobName} (${jobId}) RUNNING — ${progress}% complete, ${vcores} vCores allocated, ${memGb}GB memory`;
  } else if (scenario === "driver_log") {
    state = "RUNNING";
    const sparkMsg = rand([
      `SparkContext: Running Spark version 3.5.0`,
      `DAGScheduler: Submitting ShuffleMapStage ${randInt(0, 50)} with ${randInt(10, 500)} tasks`,
      `BlockManager: Using ${rand(["org.apache.spark.storage.S3ShuffleBlockResolver", "org.apache.spark.storage.DiskBlockManager"])} for block transfers`,
      `SparkUI: Bound SparkUI to 0.0.0.0, and started at http://driver:${randInt(4040, 4050)}`,
    ]);
    message = `[${new Date(ts).toISOString()}] [driver] ${sparkMsg}`;
  } else if (scenario === "spark_stage_complete") {
    state = "RUNNING";
    const stageId = randInt(0, 50);
    const tasks = randInt(10, 500);
    const stageMs = randInt(500, 120_000);
    message = `EMR Serverless job ${jobName}: Stage ${stageId} completed — ${tasks} tasks in ${stageMs}ms (${Math.round(tasks / (stageMs / 1000))} tasks/s)`;
  } else {
    state = "SUCCESS";
    message = `EMR Serverless job ${jobName} (${jobId}) SUCCESS in ${Math.round(durSec)}s — ${vcores} vCores peak, ${memGb}GB memory peak`;
  }

  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "emr-serverless" },
    },
    aws: {
      emrserverless: {
        application_id: appId,
        application_name: appName,
        job_run_id: jobId,
        job_run_name: jobName,
        state,
        execution_role_arn: roleArn,
        release_label: releaseLabel,
        worker_cpu_used_vcores: vcores,
        worker_memory_used_gb: memGb,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      dataset: "aws.emrserverless",
      category: ["process"],
      type: awsEventType(
        isErr,
        scenario === "job_submitted" || scenario === "job_running"
          ? "start"
          : scenario === "job_success"
            ? "end"
            : "change"
      ),
      duration: Math.round(durSec * 1e9),
    },
    log: { level: isErr ? "error" : scenario === "driver_log" ? "info" : "info" },
    message,
    ...(errorBlock ? { error: errorBlock } : {}),
  };
}

/* ------------------------------------------------------------------ */
/*  Gateway Load Balancer                                             */
/* ------------------------------------------------------------------ */
function generateGwlbLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const gwlb = `gwlb-${randId(8).toLowerCase()}`;
  const gwlbArn = `arn:aws:elasticloadbalancing:${region}:${acct.id}:loadbalancer/gwy/${gwlb}/abc${randId(5)}`;
  const tgArn = `arn:aws:elasticloadbalancing:${region}:${acct.id}:targetgroup/tg-${randId(8).toLowerCase()}/abc`;
  const endpointId = `vpce-${randId(17).toLowerCase()}`;

  const scenario = isErr
    ? rand(["target_unhealthy", "geneve_drop", "deregistration", "connection_timeout"] as const)
    : rand([
        "flow_ok",
        "flow_ok",
        "health_check_ok",
        "target_registered",
        "cross_zone_rebalance",
      ] as const);

  const flows = randInt(1000, 500_000);
  const srcIp = randIp();
  const dstIp = randIp();

  let message: string;
  let errorBlock: Record<string, unknown> | null = null;

  if (scenario === "target_unhealthy") {
    const targetIp = randIp();
    const reason = rand([
      "Health check failed",
      "Target.ResponseCodeMismatch",
      "Target.Timeout",
      "Elb.InternalError",
    ]);
    message = `Gateway LB ${gwlb}: target ${targetIp}:${rand([6081, 443])} UNHEALTHY — ${reason}. Target group: ${tgArn}`;
    errorBlock = { code: "TargetHealthCheckFailure", message: reason, type: "server" };
  } else if (scenario === "geneve_drop") {
    const dropped = randInt(100, 50_000);
    const reason = rand([
      "InvalidHeader",
      "TunnelMTUExceeded",
      "ApplianceTimeout",
      "InvalidGeneveVersion",
    ]);
    message = `Gateway LB ${gwlb}: GENEVE tunnel ${endpointId} — ${dropped} packets dropped (${reason}). Source: ${srcIp} → ${dstIp}`;
    errorBlock = {
      code: "GenevePacketDrop",
      message: `${dropped} packets dropped: ${reason}`,
      type: "network",
    };
  } else if (scenario === "deregistration") {
    const targetIp = randIp();
    const drainSec = randInt(10, 300);
    message = `Gateway LB ${gwlb}: target ${targetIp} deregistering — draining connections (${drainSec}s remaining). Reason: ${rand(["UserInitiated", "HealthCheckFailure", "CapacityReduction"])}`;
    errorBlock = {
      code: "TargetDeregistration",
      message: "Target deregistering from target group",
      type: "server",
    };
  } else if (scenario === "connection_timeout") {
    message = `Gateway LB ${gwlb}: connection from ${srcIp} to appliance timed out after ${randInt(30, 120)}s — no GENEVE response. Endpoint: ${endpointId}`;
    errorBlock = {
      code: "ConnectionTimeout",
      message: "Appliance did not respond within timeout",
      type: "server",
    };
  } else if (scenario === "health_check_ok") {
    const healthy = randInt(2, 8);
    message = `Gateway LB ${gwlb}: health check OK — ${healthy}/${healthy} targets healthy in ${tgArn}`;
  } else if (scenario === "target_registered") {
    const targetIp = randIp();
    message = `Gateway LB ${gwlb}: target ${targetIp}:6081 registered in ${tgArn}. Initial health check pending.`;
  } else if (scenario === "cross_zone_rebalance") {
    message = `Gateway LB ${gwlb}: cross-zone load balancing rebalanced ${flows} flows across ${randInt(2, 6)} AZs`;
  } else {
    message = `Gateway LB ${gwlb}: ${flows} active flows, GENEVE tunnel ${endpointId} healthy. ${srcIp} → ${dstIp}`;
  }

  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "gateway-elb" },
    },
    aws: {
      gwlb: {
        load_balancer_arn: gwlbArn,
        endpoint_service_name: `com.amazonaws.vpce.${region}.${gwlb}`,
        geneve_tunnel_packets_in: flows * 900,
        geneve_tunnel_packets_out: flows * 880,
        packets_dropped_invalid_tunnel: isErr ? randInt(10, 50_000) : randInt(0, 200),
        appliance_health: isErr ? "UNHEALTHY" : "HEALTHY",
        vpc_endpoint_id: endpointId,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      dataset: "aws.gwlb",
      category: ["network"],
      type: awsEventType(isErr, "connection"),
      duration: randInt(1_000_000, 800_000_000),
    },
    source: { ip: srcIp },
    destination: { ip: dstIp },
    message,
    ...(errorBlock ? { error: errorBlock } : {}),
  };
}

/* ------------------------------------------------------------------ */
/*  Classic ELB                                                       */
/* ------------------------------------------------------------------ */
function generateElbClassicLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const lb = `classic-${randId(6).toLowerCase()}`;
  const az = `${region}${rand(["a", "b", "c"])}`;
  const clientIp = randIp();
  const clientPort = randInt(1024, 65535);
  const method = rand(["GET", "GET", "GET", "POST", "PUT", "DELETE", "HEAD"]);
  const path = rand([
    "/",
    "/api/v1/health",
    "/api/v1/users",
    "/static/app.js",
    "/login",
    "/api/v2/orders",
  ]);

  const scenario = isErr
    ? rand([
        "backend_5xx",
        "backend_timeout",
        "no_healthy_targets",
        "ssl_error",
        "elb_5xx",
      ] as const)
    : rand([
        "access_200",
        "access_200",
        "access_200",
        "access_301",
        "access_304",
        "ssl_handshake",
      ] as const);

  const requestMs = randFloat(0.5, scenario === "backend_timeout" ? 60000 : 200);
  const backendMs = scenario === "backend_timeout" ? -1 : randFloat(0.3, requestMs * 0.9);

  let elbStatus: number;
  let backendStatus: number;
  let message: string;
  let errorBlock: Record<string, unknown> | null = null;

  if (scenario === "backend_5xx") {
    elbStatus = rand([502, 502, 503]);
    backendStatus = rand([500, 502, 503]);
    message = `${clientIp}:${clientPort} ${elbStatus} ${backendStatus} ${requestMs.toFixed(6)} ${backendMs.toFixed(6)} - "${method} http://${lb}-${acct.id}.${region}.elb.amazonaws.com${path} HTTP/1.1" "${rand(["Mozilla/5.0", "curl/7.88.1", "python-requests/2.31.0"])}"`;
    errorBlock = {
      code: `HTTP_${backendStatus}`,
      message: `Backend returned ${backendStatus}`,
      type: "server",
    };
  } else if (scenario === "backend_timeout") {
    elbStatus = 504;
    backendStatus = 0;
    message = `${clientIp}:${clientPort} 504 0 ${requestMs.toFixed(6)} -1 - "${method} http://${lb}-${acct.id}.${region}.elb.amazonaws.com${path} HTTP/1.1" "-"`;
    errorBlock = {
      code: "BackendConnectionTimeout",
      message: "Backend did not respond within idle timeout",
      type: "server",
    };
  } else if (scenario === "no_healthy_targets") {
    elbStatus = 503;
    backendStatus = 0;
    message = `${clientIp}:${clientPort} 503 0 ${requestMs.toFixed(6)} -1 - "${method} http://${lb}-${acct.id}.${region}.elb.amazonaws.com${path} HTTP/1.1" "-"`;
    errorBlock = {
      code: "NoHealthyBackends",
      message: "No registered targets are healthy",
      type: "server",
    };
  } else if (scenario === "ssl_error") {
    elbStatus = 463;
    backendStatus = 0;
    message = `${clientIp}:${clientPort} 463 0 ${requestMs.toFixed(6)} -1 - "${method} https://${lb}-${acct.id}.${region}.elb.amazonaws.com${path} HTTP/1.1" "-"`;
    errorBlock = {
      code: "SSLCertificateError",
      message: "Client TLS certificate verification failed",
      type: "client",
    };
  } else if (scenario === "elb_5xx") {
    elbStatus = 500;
    backendStatus = 0;
    message = `${clientIp}:${clientPort} 500 0 0.000001 -1 - "${method} http://${lb}-${acct.id}.${region}.elb.amazonaws.com${path} HTTP/1.1" "-"`;
    errorBlock = {
      code: "ELBInternalError",
      message: "Internal load balancer error",
      type: "server",
    };
  } else if (scenario === "ssl_handshake") {
    elbStatus = 200;
    backendStatus = 200;
    message = `${clientIp}:${clientPort} 200 200 ${requestMs.toFixed(6)} ${backendMs.toFixed(6)} - "${method} https://${lb}-${acct.id}.${region}.elb.amazonaws.com${path} HTTP/1.1" "Mozilla/5.0"`;
  } else {
    elbStatus = scenario === "access_301" ? 301 : scenario === "access_304" ? 304 : 200;
    backendStatus = elbStatus;
    message = `${clientIp}:${clientPort} ${elbStatus} ${backendStatus} ${requestMs.toFixed(6)} ${backendMs.toFixed(6)} - "${method} http://${lb}-${acct.id}.${region}.elb.amazonaws.com${path} HTTP/1.1" "${rand(["Mozilla/5.0", "curl/7.88.1", "python-requests/2.31.0"])}"`;
  }

  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "elb" },
    },
    aws: {
      elb: {
        load_balancer_name: lb,
        availability_zone: az,
        scheme: rand(["internet-facing", "internal"]),
        dns_name: `${lb}-${acct.id}.${region}.elb.amazonaws.com`,
        elb_status_code: String(elbStatus),
        target_status_code: String(backendStatus),
        request_processing_time_sec: Number(((requestMs / 1000) * 0.01).toFixed(6)),
        backend_processing_time_sec: backendMs > 0 ? Number((backendMs / 1000).toFixed(6)) : -1,
        response_processing_time_sec: Number(((requestMs / 1000) * 0.02).toFixed(6)),
        received_bytes: randInt(100, 50_000),
        sent_bytes: randInt(500, 120_000),
      },
    },
    http: { request: { method }, response: { status_code: elbStatus } },
    source: { ip: clientIp, port: clientPort },
    url: { path, domain: `${lb}-${acct.id}.${region}.elb.amazonaws.com` },
    event: {
      outcome: isErr ? "failure" : "success",
      dataset: "aws.elb_logs",
      category: ["network"],
      type: awsEventType(isErr, "access"),
      duration: Math.round(requestMs * 1e6),
    },
    message,
    ...(errorBlock ? { error: errorBlock } : {}),
  };
}

/* ------------------------------------------------------------------ */
/*  MediaConnect                                                      */
/* ------------------------------------------------------------------ */
function generateMediaConnectLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const flowName = rand([
    "live-feed-primary",
    "live-feed-backup",
    "contribution-ingest",
    "playout-egress",
  ]);
  const flowArn = `arn:aws:mediaconnect:${region}:${acct.id}:flow:${randId(8)}:${flowName}`;
  const srcArn = `arn:aws:mediaconnect:${region}:${acct.id}:source:${randId(8)}:src-${flowName}`;

  const scenario = isErr
    ? rand([
        "source_disconnect",
        "encoder_error",
        "entitlement_revoked",
        "network_congestion",
      ] as const)
    : rand([
        "transport_ok",
        "transport_ok",
        "failover_switch",
        "output_started",
        "source_health_ok",
      ] as const);

  const bitrateMbps = randFloat(1.5, 80);
  let message: string;
  let errorBlock: Record<string, unknown> | null = null;

  if (scenario === "source_disconnect") {
    const protocol = rand(["SRT", "Zixi", "RIST", "RTP-FEC"]);
    message = `MediaConnect flow ${flowName}: source disconnected — ${protocol} listener on port ${rand([5000, 5001, 9000])} lost connection from ${randIp()}. Last bitrate: ${bitrateMbps.toFixed(1)} Mbps`;
    errorBlock = {
      code: "SourceDisconnected",
      message: `${protocol} source lost connection`,
      type: "network",
    };
  } else if (scenario === "encoder_error") {
    message = `MediaConnect flow ${flowName}: encoder format error — received ${rand(["HEVC/H.265", "AV1"])} but output expects ${rand(["AVC/H.264", "MPEG-2"])}. Transcoding not available on this flow.`;
    errorBlock = {
      code: "EncoderFormatMismatch",
      message: "Input codec incompatible with output profile",
      type: "client",
    };
  } else if (scenario === "entitlement_revoked") {
    message = `MediaConnect flow ${flowName}: entitlement ${randId(8)} revoked by account ${randInt(100000000000, 999999999999)}. Output ${rand(["hls-origin", "srt-backup"])} will stop.`;
    errorBlock = {
      code: "EntitlementRevoked",
      message: "Sharing entitlement was revoked by granter",
      type: "client",
    };
  } else if (scenario === "network_congestion") {
    const packetLoss = randFloat(0.5, 8.0);
    const jitterMs = randFloat(5, 80);
    message = `MediaConnect flow ${flowName}: network congestion detected — packet loss ${packetLoss.toFixed(1)}%, jitter ${jitterMs.toFixed(0)}ms. Source: ${srcArn}`;
    errorBlock = {
      code: "NetworkCongestion",
      message: `Packet loss ${packetLoss.toFixed(1)}%`,
      type: "network",
    };
  } else if (scenario === "failover_switch") {
    message = `MediaConnect flow ${flowName}: failover triggered — switching from source A (${randIp()}) to source B (${randIp()}). Reason: ${rand(["SourceHealthCheckFailed", "PacketLossThresholdExceeded"])}`;
  } else if (scenario === "output_started") {
    const protocol = rand(["SRT", "Zixi", "RIST", "CDI"]);
    message = `MediaConnect flow ${flowName}: output started — ${protocol} to ${randIp()}:${rand([5000, 5001, 9000])} at ${bitrateMbps.toFixed(1)} Mbps`;
  } else if (scenario === "source_health_ok") {
    message = `MediaConnect flow ${flowName}: source health OK — ${bitrateMbps.toFixed(1)} Mbps, ${randInt(0, 2)} dropped frames in last 60s`;
  } else {
    message = `MediaConnect flow ${flowName}: transport stable — bitrate ${bitrateMbps.toFixed(1)} Mbps, RTT ${randInt(1, 80)}ms`;
  }

  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "mediaconnect" },
    },
    aws: {
      mediaconnect: {
        flow_arn: flowArn,
        flow_name: flowName,
        source_arn: srcArn,
        entitlements: randInt(0, 3),
        output_health: isErr ? "STALE" : "HEALTHY",
        bitrate_mbps: bitrateMbps,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      dataset: "aws.mediaconnect",
      category: ["network"],
      type: awsEventType(isErr, "connection"),
      duration: randInt(5_000_000, 400_000_000),
    },
    message,
    ...(errorBlock ? { error: errorBlock } : {}),
  };
}

/* ------------------------------------------------------------------ */
/*  MediaPackage                                                      */
/* ------------------------------------------------------------------ */
function generateMediaPackageLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const channel = rand(["live-sports", "news-24h", "event-stream", "vod-catalog"]);
  const endpoint = rand(["hls-primary", "dash-backup", "cmaf-low-latency", "mss-legacy"]);

  const scenario = isErr
    ? rand(["ingest_timeout", "manifest_stale", "origin_4xx", "drm_license_fail"] as const)
    : rand([
        "manifest_ok",
        "manifest_ok",
        "segment_ingested",
        "endpoint_created",
        "harvest_complete",
      ] as const);

  let message: string;
  let errorBlock: Record<string, unknown> | null = null;

  if (scenario === "ingest_timeout") {
    message = `MediaPackage channel ${channel}: ingest timeout — no segments received for ${randInt(30, 120)}s on endpoint ${endpoint}. Expected segment duration: ${rand([2, 4, 6])}s`;
    errorBlock = {
      code: "IngestTimeout",
      message: "No segments received within expected interval",
      type: "server",
    };
  } else if (scenario === "manifest_stale") {
    const staleSec = randInt(10, 60);
    message = `MediaPackage channel ${channel}: stale manifest on ${endpoint} — last update ${staleSec}s ago (threshold: ${rand([6, 10])}s)`;
    errorBlock = {
      code: "StaleManifest",
      message: `Manifest not updated for ${staleSec}s`,
      type: "server",
    };
  } else if (scenario === "origin_4xx") {
    const status = rand([403, 404, 410]);
    message = `MediaPackage channel ${channel}: origin returned ${status} for segment request — path: /v1/${channel}/${endpoint}/segment_${randInt(0, 99999)}.ts`;
    errorBlock = { code: `HTTP_${status}`, message: `Origin returned ${status}`, type: "client" };
  } else if (scenario === "drm_license_fail") {
    message = `MediaPackage channel ${channel}: DRM license acquisition failed for ${rand(["Widevine", "FairPlay", "PlayReady"])} — SPEKE endpoint returned ${rand([500, 503])}`;
    errorBlock = {
      code: "DRMLicenseFailure",
      message: "SPEKE key provider unavailable",
      type: "server",
    };
  } else if (scenario === "segment_ingested") {
    const segNum = randInt(0, 99999);
    const segBytes = randInt(50_000, 4_000_000);
    message = `MediaPackage channel ${channel}: segment ${segNum} ingested (${(segBytes / 1024).toFixed(0)} KB) on ${endpoint}. Latency: ${randInt(50, 800)}ms`;
  } else if (scenario === "endpoint_created") {
    message = `MediaPackage channel ${channel}: endpoint ${endpoint} created — format: ${rand(["HLS", "DASH", "CMAF", "MSS"])}, segment duration: ${rand([2, 4, 6])}s, DRM: ${rand(["enabled", "disabled"])}`;
  } else if (scenario === "harvest_complete") {
    message = `MediaPackage channel ${channel}: VOD harvest job completed — ${randInt(100, 5000)} segments, ${randInt(60, 14400)}s duration, destination: s3://${rand(["media-archive", "vod-assets"])}-${acct.id}/`;
  } else {
    message = `MediaPackage channel ${channel}: manifest published on ${endpoint} — ${randInt(10, 500_000)} egress requests/min, latency: ${randInt(200, 2500)}ms`;
  }

  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "mediapackage" },
    },
    aws: {
      mediapackage: {
        channel_id: channel,
        endpoint_id: endpoint,
        ingest_protocol: rand(["HLS", "CMAF", "WebDAV"]),
        egress_requests: randInt(10, 500_000),
        manifest_latency_ms: randInt(200, isErr ? 9000 : 2500),
        drm: Math.random() < 0.35,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      dataset: "aws.mediapackage",
      category: ["process"],
      type: awsEventType(
        isErr,
        scenario === "endpoint_created" ? "creation" : "change"
      ),
      duration: randInt(8_000_000, 500_000_000),
    },
    message,
    ...(errorBlock ? { error: errorBlock } : {}),
  };
}

/* ------------------------------------------------------------------ */
/*  MediaStore                                                        */
/* ------------------------------------------------------------------ */
function generateMediaStoreLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const container = rand(["live-origin", "vod-assets", "recording-store", "thumbnail-cache"]);
  const containerArn = `arn:aws:mediastore:${region}:${acct.id}:container/${container}`;

  const scenario = isErr
    ? rand(["not_found", "throttle", "policy_denied", "internal"] as const)
    : rand([
        "put_object",
        "put_object",
        "get_object",
        "get_object",
        "describe_object",
        "list_items",
        "delete_object",
      ] as const);

  const objectPath = `/ingest/${rand(["channel-a", "channel-b"])}/${rand(["segment", "manifest", "init"])}${scenario === "list_items" ? "" : `-${randInt(0, 99999)}.${rand(["ts", "m3u8", "mpd", "mp4"])}`}`;
  const bytes = scenario === "list_items" ? 0 : randInt(1_000, 8_000_000);
  const requestId = randUUID();
  const latMs = randFloat(1, isErr ? 500 : 80);

  let op: string;
  let message: string;
  let errorBlock: Record<string, unknown> | null = null;

  if (scenario === "not_found") {
    op = "GetObject";
    message = `MediaStore ${container}: GetObject 404 — path ${objectPath} not found. RequestId: ${requestId}`;
    errorBlock = {
      code: "ObjectNotFoundException",
      message: `Object ${objectPath} does not exist`,
      type: "client",
    };
  } else if (scenario === "throttle") {
    op = rand(["PutObject", "GetObject"]);
    message = `MediaStore ${container}: ${op} 429 — request throttled. Container throughput limit reached. RequestId: ${requestId}`;
    errorBlock = {
      code: "ContainerRateExceededException",
      message: "Container throughput limit exceeded",
      type: "client",
    };
  } else if (scenario === "policy_denied") {
    op = rand(["PutObject", "DeleteObject"]);
    message = `MediaStore ${container}: ${op} 403 — container policy denies action for principal arn:aws:iam::${acct.id}:role/${rand(["reader", "external-app"])}`;
    errorBlock = {
      code: "PolicyNotFoundException",
      message: "Container policy denies this action",
      type: "client",
    };
  } else if (scenario === "internal") {
    op = rand(["PutObject", "GetObject"]);
    message = `MediaStore ${container}: ${op} 500 — InternalServerError. RequestId: ${requestId}`;
    errorBlock = { code: "InternalServerError", message: "Internal service error", type: "server" };
  } else {
    op =
      scenario === "put_object"
        ? "PutObject"
        : scenario === "get_object"
          ? "GetObject"
          : scenario === "describe_object"
            ? "DescribeObject"
            : scenario === "delete_object"
              ? "DeleteObject"
              : "ListItems";
    message = `MediaStore ${container}: ${op} 200 — path: ${objectPath}${bytes > 0 ? ` (${(bytes / 1024).toFixed(0)} KB)` : ""} in ${latMs.toFixed(0)}ms. RequestId: ${requestId}`;
  }

  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "mediastore" },
    },
    aws: {
      mediastore: {
        container_name: container,
        container_arn: containerArn,
        operation: op,
        object_path: objectPath,
        bytes,
        request_id: requestId,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      dataset: "aws.mediastore",
      category: ["file"],
      type: awsEventType(
        isErr,
        scenario === "delete_object"
          ? "deletion"
          : scenario === "put_object"
            ? "change"
            : "access"
      ),
      duration: Math.round(latMs * 1e6),
    },
    message,
    ...(errorBlock ? { error: errorBlock } : {}),
  };
}

/* ------------------------------------------------------------------ */
/*  MediaTailor                                                       */
/* ------------------------------------------------------------------ */
function generateMediaTailorLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const config = rand(["live-sports-ssai", "news-preroll", "vod-midroll", "linear-channel"]);

  const scenario = isErr
    ? rand(["ads_timeout", "vast_empty", "origin_error", "stitch_failure"] as const)
    : rand([
        "manifest_ok",
        "manifest_ok",
        "ad_break_filled",
        "session_init",
        "prefetch_ok",
      ] as const);

  const availFilled = randFloat(scenario === "vast_empty" ? 0 : 40, isErr ? 55 : 98);
  let message: string;
  let errorBlock: Record<string, unknown> | null = null;

  if (scenario === "ads_timeout") {
    const adsUrl = `https://ads.${rand(EMAIL_DOMAINS)}/vast/${rand(["v3", "v4"])}`;
    message = `MediaTailor ${config}: ADS timeout — ${adsUrl} did not respond within ${randInt(3, 10)}s. Avail at ${new Date(ts).toISOString()} unfilled.`;
    errorBlock = {
      code: "AdsDecisionServerTimeout",
      message: "ADS did not respond in time",
      type: "server",
    };
  } else if (scenario === "vast_empty") {
    message = `MediaTailor ${config}: VAST response empty — ADS returned no ads for avail duration ${randInt(15, 120)}s. Slate will be inserted.`;
    errorBlock = {
      code: "EmptyVASTResponse",
      message: "No ad creatives returned for avail",
      type: "client",
    };
  } else if (scenario === "origin_error") {
    const status = rand([502, 503, 504]);
    message = `MediaTailor ${config}: content origin returned ${status} for manifest request. Viewer session ${randId(16)} affected.`;
    errorBlock = {
      code: `OriginHTTP${status}`,
      message: `Content origin returned ${status}`,
      type: "server",
    };
  } else if (scenario === "stitch_failure") {
    message = `MediaTailor ${config}: ad stitch failure — transcoding profile mismatch between ad creative (${rand(["1080p/H.264", "720p/H.265"])}) and content (${rand(["1080p/H.264", "4K/H.265"])})`;
    errorBlock = {
      code: "TranscodeProfileMismatch",
      message: "Ad creative codec incompatible with content profile",
      type: "server",
    };
  } else if (scenario === "ad_break_filled") {
    const breakDur = rand([15, 30, 60, 90, 120]);
    const filled = randInt(1, 6);
    message = `MediaTailor ${config}: ad break filled — ${filled} creative${filled > 1 ? "s" : ""} for ${breakDur}s avail (${availFilled.toFixed(0)}% fill rate). Tracking events queued.`;
  } else if (scenario === "session_init") {
    const sessionId = randId(16);
    message = `MediaTailor ${config}: session ${sessionId} initialized — player: ${rand(["HLS", "DASH"])}, personalization: ${rand(["ENABLED", "ENABLED", "DISABLED"])}`;
  } else if (scenario === "prefetch_ok") {
    message = `MediaTailor ${config}: ad prefetch completed — ${randInt(2, 10)} creatives cached for next ${randInt(1, 5)} avails`;
  } else {
    message = `MediaTailor ${config}: personalized manifest served — ${randInt(100, 900_000)} requests/min, avail fill ${availFilled.toFixed(0)}%`;
  }

  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "mediatailor" },
    },
    aws: {
      mediatailor: {
        playback_configuration_name: config,
        ads_decision_server: `https://ads.${rand(EMAIL_DOMAINS)}/vast`,
        avail_filled_percent: availFilled,
        stitch_rate: randFloat(0.8, isErr ? 0.92 : 0.999),
        manifest_requests: randInt(100, 900_000),
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      dataset: "aws.mediatailor",
      category: ["process"],
      type: awsEventType(isErr, "access"),
      duration: randInt(4_000_000, 450_000_000),
    },
    message,
    ...(errorBlock ? { error: errorBlock } : {}),
  };
}

/* ------------------------------------------------------------------ */
/*  IVS (Interactive Video Service)                                   */
/* ------------------------------------------------------------------ */
function generateIvsLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const channelName = rand([
    "gaming-live",
    "esports-main",
    "creator-studio",
    "corporate-town-hall",
  ]);
  const channelArn = `arn:aws:ivs:${region}:${acct.id}:channel/${randId(16)}`;
  const streamId = `st-${randId(12)}`;

  const scenario = isErr
    ? rand(["ingest_starvation", "stream_disconnect", "quota_exceeded", "recording_fail"] as const)
    : rand([
        "stream_start",
        "stream_healthy",
        "stream_healthy",
        "stream_end",
        "recording_saved",
        "viewer_spike",
      ] as const);

  const bitrateKbps = randInt(800, 8500);
  const concurrentViews = randInt(0, 50_000);
  let message: string;
  let errorBlock: Record<string, unknown> | null = null;

  if (scenario === "ingest_starvation") {
    const gapSec = randFloat(2, 30);
    message = `IVS channel ${channelName}: ingest starvation — no frames received for ${gapSec.toFixed(1)}s. Stream ${streamId} degraded. Bitrate dropped from ${bitrateKbps} to ${randInt(0, 200)} Kbps.`;
    errorBlock = {
      code: "StreamStarvation",
      message: `No frames for ${gapSec.toFixed(1)}s`,
      type: "network",
    };
  } else if (scenario === "stream_disconnect") {
    message = `IVS channel ${channelName}: stream ${streamId} disconnected — encoder at ${randIp()} closed RTMPS connection. Duration: ${randInt(60, 28800)}s, peak viewers: ${concurrentViews}`;
    errorBlock = {
      code: "StreamDisconnected",
      message: "Encoder closed connection",
      type: "network",
    };
  } else if (scenario === "quota_exceeded") {
    message = `IVS channel ${channelName}: ConcurrentStreams quota exceeded — limit ${rand([5, 10, 25])} active streams. CreateStream API returned ThrottlingException.`;
    errorBlock = {
      code: "ThrottlingException",
      message: "Concurrent stream limit exceeded",
      type: "client",
    };
  } else if (scenario === "recording_fail") {
    message = `IVS channel ${channelName}: recording to S3 failed for stream ${streamId} — bucket s3://${rand(["ivs-recordings", "live-archive"])}-${acct.id}/ returned AccessDenied`;
    errorBlock = {
      code: "RecordingS3AccessDenied",
      message: "S3 bucket returned AccessDenied for recording",
      type: "client",
    };
  } else if (scenario === "stream_start") {
    message = `IVS channel ${channelName}: stream ${streamId} started — RTMPS ingest from ${randIp()}, ${bitrateKbps} Kbps, ${rand(["1080p60", "720p30", "1080p30"])}`;
  } else if (scenario === "stream_end") {
    const durSec = randInt(60, 28800);
    message = `IVS channel ${channelName}: stream ${streamId} ended gracefully — duration: ${durSec}s, peak viewers: ${concurrentViews}, avg bitrate: ${bitrateKbps} Kbps`;
  } else if (scenario === "recording_saved") {
    message = `IVS channel ${channelName}: recording saved for stream ${streamId} — s3://${rand(["ivs-recordings", "live-archive"])}-${acct.id}/${streamId}.mp4 (${randInt(50, 5000)} MB)`;
  } else if (scenario === "viewer_spike") {
    const delta = randInt(1000, 20000);
    message = `IVS channel ${channelName}: viewer spike detected — ${concurrentViews} → ${concurrentViews + delta} concurrent viewers in ${randInt(10, 60)}s`;
  } else {
    message = `IVS channel ${channelName}: stream ${streamId} healthy — ${bitrateKbps} Kbps, ${concurrentViews} viewers, 0 dropped frames`;
  }

  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "ivs" },
    },
    aws: {
      ivs: {
        channel_arn: channelArn,
        stream_id: streamId,
        stream_state: isErr ? "DEGRADED" : rand(["LIVE", "LIVE", "OFFLINE"]),
        concurrent_views: concurrentViews,
        bitrate_kbps: bitrateKbps,
        health: isErr ? "STARVING" : "HEALTHY",
        recording_configuration_arn:
          Math.random() < 0.45
            ? `arn:aws:ivs:${region}:${acct.id}:recording-configuration/rc-${randId(8)}`
            : null,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      dataset: "aws.ivs",
      category: ["network"],
      duration: randInt(10_000_000, 900_000_000),
    },
    message,
    ...(errorBlock ? { error: errorBlock } : {}),
  };
}

/* ------------------------------------------------------------------ */
/*  IVS Chat                                                          */
/* ------------------------------------------------------------------ */
function generateIvsChatLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const roomId = `room-${randId(10)}`;
  const roomArn = `arn:aws:ivschat:${region}:${acct.id}:room/${roomId}`;
  const userId = `u_${randId(8)}`;

  const scenario = isErr
    ? rand(["send_fail", "rate_limited", "room_deleted", "auth_fail"] as const)
    : rand([
        "message_sent",
        "message_sent",
        "message_sent",
        "user_connect",
        "user_disconnect",
        "moderation_action",
        "room_created",
      ] as const);

  let message: string;
  let errorBlock: Record<string, unknown> | null = null;
  let eventType: string;

  if (scenario === "send_fail") {
    eventType = "MESSAGE_SEND_FAILED";
    const reason = rand(["MessageTooLong", "RoomNotFound", "InternalError"]);
    message = `IVS Chat ${roomId}: SendMessage failed for user ${userId} — ${reason}`;
    errorBlock = { code: reason, message: `Message delivery failed: ${reason}`, type: "client" };
  } else if (scenario === "rate_limited") {
    eventType = "RATE_LIMITED";
    message = `IVS Chat ${roomId}: user ${userId} rate-limited — ${randInt(5, 20)} messages/s exceeds room limit of ${rand([5, 10])}/s`;
    errorBlock = {
      code: "ThrottlingException",
      message: "Message rate exceeded room limit",
      type: "client",
    };
  } else if (scenario === "room_deleted") {
    eventType = "DELETE_ROOM";
    message = `IVS Chat: room ${roomId} deleted by principal arn:aws:iam::${acct.id}:user/${rand(["admin", "moderator"])}. ${randInt(0, 500)} active connections disconnected.`;
    errorBlock = {
      code: "RoomDeleted",
      message: "Room was deleted while connections were active",
      type: "server",
    };
  } else if (scenario === "auth_fail") {
    eventType = "CONNECT_FAILED";
    message = `IVS Chat ${roomId}: connection rejected for token sub=${userId} — ${rand(["TokenExpired", "InvalidToken", "RoomCapacityExceeded"])}`;
    errorBlock = {
      code: rand(["TokenExpired", "InvalidToken"]),
      message: "Chat token validation failed",
      type: "client",
    };
  } else if (scenario === "user_connect") {
    eventType = "CONNECT";
    message = `IVS Chat ${roomId}: user ${userId} connected — active connections: ${randInt(1, 5000)}`;
  } else if (scenario === "user_disconnect") {
    eventType = "DISCONNECT";
    const dur = randInt(10, 7200);
    message = `IVS Chat ${roomId}: user ${userId} disconnected after ${dur}s — ${randInt(0, 500)} messages sent during session`;
  } else if (scenario === "moderation_action") {
    eventType = "MODERATION";
    const action = rand(["DELETE_MESSAGE", "DISCONNECT_USER", "BAN_USER"]);
    message = `IVS Chat ${roomId}: moderator action ${action} on user ${userId} — reason: ${rand(["spam", "harassment", "inappropriate_content", "bot_detected"])}`;
  } else if (scenario === "room_created") {
    eventType = "CREATE_ROOM";
    message = `IVS Chat: room ${roomId} created — max message length: ${rand([500, 1000, 5000])}, rate limit: ${rand([5, 10])}/s, logging: ${rand(["ENABLED", "DISABLED"])}`;
  } else {
    eventType = "MESSAGE_RECEIVED";
    message = `IVS Chat ${roomId}: message from ${userId} — ${randInt(1, 500)} chars, type: ${rand(["TEXT", "CUSTOM"])}`;
  }

  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "ivschat" },
    },
    aws: {
      ivschat: {
        room_id: roomId,
        room_arn: roomArn,
        event_type: eventType,
        sender_user_id: userId,
        moderation_action:
          scenario === "moderation_action" ? rand(["DELETE_MESSAGE", "DISCONNECT_USER"]) : "NONE",
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      dataset: "aws.ivschat",
      category: ["network"],
      duration: randInt(500_000, 120_000_000),
    },
    message,
    ...(errorBlock ? { error: errorBlock } : {}),
  };
}

/* ------------------------------------------------------------------ */
/*  CloudSearch                                                       */
/* ------------------------------------------------------------------ */
function generateCloudSearchLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const domain = `search-${rand(["products", "articles", "support-kb", "catalog"])}-${randId(4).toLowerCase()}`;
  const domainArn = `arn:aws:cloudsearch:${region}:${acct.id}:domain/${domain}`;

  const scenario = isErr
    ? rand(["search_error", "throttle", "index_field_err", "capacity_limit"] as const)
    : rand([
        "search_ok",
        "search_ok",
        "search_ok",
        "suggest_ok",
        "upload_batch",
        "index_config",
      ] as const);

  const queryTerms = rand([
    "status:active category:books",
    "release_date:[2024 TO *]",
    "title:'machine learning'",
    "*:*",
    "color:red AND size:large",
  ]);
  const ms = randFloat(2, scenario === "search_error" ? 4000 : 180);
  let message: string;
  let errorBlock: Record<string, unknown> | null = null;

  if (scenario === "search_error") {
    const code = rand(["SearchException", "InternalException", "DisabledAction"]);
    message = `CloudSearch ${domain}: search request failed — ${code}. Query: "${queryTerms}". RequestId: ${randId(12)}`;
    errorBlock = { code, message: `Search request failed: ${code}`, type: "server" };
  } else if (scenario === "throttle") {
    message = `CloudSearch ${domain}: 507 — search request throttled (concurrent search limit reached). Query: "${queryTerms}". Retry after ${randInt(1, 5)}s.`;
    errorBlock = {
      code: "LimitExceededException",
      message: "Concurrent search request limit exceeded",
      type: "client",
    };
  } else if (scenario === "index_field_err") {
    const field = rand(["description", "tags", "metadata.source"]);
    message = `CloudSearch ${domain}: IndexField configuration error — field "${field}" type ${rand(["text-array", "literal"])} is incompatible with faceting. Domain: ${domainArn}`;
    errorBlock = {
      code: "InvalidTypeException",
      message: `Index field type incompatible with requested option`,
      type: "client",
    };
  } else if (scenario === "capacity_limit") {
    message = `CloudSearch ${domain}: partition capacity at ${randInt(85, 100)}% — index size ${randInt(10, 500)} GB across ${randInt(1, 10)} partitions. Scale-up recommended.`;
    errorBlock = {
      code: "ResourceBusy",
      message: "Domain partition near capacity",
      type: "server",
    };
  } else if (scenario === "suggest_ok") {
    const suggestions = randInt(1, 10);
    message = `CloudSearch ${domain}: suggest OK — "${queryTerms}" returned ${suggestions} suggestions in ${ms.toFixed(0)}ms`;
  } else if (scenario === "upload_batch") {
    const docCount = randInt(100, 10_000);
    const bytes = randInt(50_000, 10_000_000);
    message = `CloudSearch ${domain}: documents/batch OK — ${docCount} documents (${(bytes / 1024).toFixed(0)} KB) indexed in ${randInt(200, 5000)}ms`;
  } else if (scenario === "index_config") {
    message = `CloudSearch ${domain}: IndexDocuments initiated — ${randInt(5, 50)} fields, ${rand(["text", "literal", "int", "date", "latlon"])} types. Reindexing in progress.`;
  } else {
    const hits = randInt(0, 500_000);
    message = `CloudSearch ${domain}: search OK — query="${queryTerms}" hits=${hits} latency=${ms.toFixed(0)}ms facets=${randInt(0, 5)} highlights=${rand(["on", "off"])}`;
  }

  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "cloudsearch" },
    },
    aws: {
      cloudsearch: {
        domain_name: domain,
        domain_arn: domainArn,
        operation: scenario.startsWith("search")
          ? "Search"
          : scenario === "suggest_ok"
            ? "Suggest"
            : scenario === "upload_batch"
              ? "UploadDocuments"
              : "IndexDocuments",
        hits_found: scenario.startsWith("search") && !isErr ? randInt(0, 500_000) : 0,
        search_latency_ms: Math.round(ms),
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      dataset: "aws.cloudsearch",
      category: ["process"],
      duration: Math.round(ms * 1e6),
    },
    message,
    ...(errorBlock ? { error: errorBlock } : {}),
  };
}

/* ------------------------------------------------------------------ */
/*  Directory Service                                                 */
/* ------------------------------------------------------------------ */
function generateDirectoryServiceLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const dirId = `d-${randId(10)}`;
  const dirType = rand(["MicrosoftAD", "SimpleAD", "ADConnector"]);
  const domainName = `${rand(["corp", "internal", "ad"])}.${rand(["example", "company"])}.com`;
  const clientIp = `${randInt(10, 223)}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`;
  const principal = `${rand(["jdoe", "admin", "svc-app", "backup-agent"])}@${domainName}`;

  const scenario = isErr
    ? rand([
        "auth_failed",
        "ldap_bind_err",
        "replication_fail",
        "dns_timeout",
        "account_locked",
      ] as const)
    : rand([
        "auth_ok",
        "auth_ok",
        "ldap_search",
        "dns_lookup",
        "replication_ok",
        "schema_update",
      ] as const);

  let message: string;
  let errorBlock: Record<string, unknown> | null = null;
  let ldapCode: string;

  if (scenario === "auth_failed") {
    ldapCode = rand(["49", "52", "53"]);
    const reason =
      ldapCode === "49"
        ? "invalidCredentials"
        : ldapCode === "52"
          ? "unavailable"
          : "unwillingToPerform";
    message = `Directory Service ${dirId} (${dirType}): LDAP Bind FAILED for ${principal} from ${clientIp} — result code ${ldapCode} (${reason}). Domain: ${domainName}`;
    errorBlock = { code: `LDAP_${ldapCode}`, message: reason, type: "authentication" };
  } else if (scenario === "ldap_bind_err") {
    ldapCode = "1";
    message = `Directory Service ${dirId}: LDAP operations error — ${rand(["referral loop detected", "TLS handshake failed", "connection reset by peer"])} for ${clientIp}`;
    errorBlock = { code: "LDAP_1", message: "Operations error", type: "server" };
  } else if (scenario === "replication_fail") {
    ldapCode = "0";
    const partnerDc = `DC-${randId(4).toUpperCase()}`;
    message = `Directory Service ${dirId}: replication FAILED from ${partnerDc} — ${rand(["network timeout after 30s", "USN rollback detected", "schema version mismatch"])}. Domain: ${domainName}`;
    errorBlock = { code: "ReplicationFailure", message: "AD replication failed", type: "server" };
  } else if (scenario === "dns_timeout") {
    ldapCode = "0";
    const target = `_ldap._tcp.${domainName}`;
    message = `Directory Service ${dirId}: DNS SRV lookup timeout for ${target} — ${rand(["no response from forwarder", "NXDOMAIN", "SERVFAIL"])}`;
    errorBlock = {
      code: "DNSLookupFailed",
      message: `SRV lookup failed for ${target}`,
      type: "network",
    };
  } else if (scenario === "account_locked") {
    ldapCode = "775";
    message = `Directory Service ${dirId}: account ${principal} LOCKED after ${randInt(3, 10)} failed authentication attempts from ${clientIp}. Lockout duration: ${rand([15, 30, 60])} minutes.`;
    errorBlock = {
      code: "AccountLocked",
      message: `Account locked: too many failed attempts`,
      type: "authentication",
    };
  } else if (scenario === "ldap_search") {
    ldapCode = "0";
    const base = `ou=${rand(["Users", "Computers", "Groups"])},dc=${domainName.split(".")[0]},dc=${domainName.split(".")[1]}`;
    message = `Directory Service ${dirId}: LDAP Search OK — base="${base}" filter="(sAMAccountName=${rand(["*admin*", principal.split("@")[0], "svc-*"])})" scope=subtree results=${randInt(0, 500)} in ${randInt(1, 200)}ms`;
  } else if (scenario === "dns_lookup") {
    ldapCode = "0";
    message = `Directory Service ${dirId}: DNS lookup OK — ${rand(["A", "SRV", "PTR"])} record for ${rand([`dc1.${domainName}`, `_kerberos._tcp.${domainName}`, clientIp])} resolved in ${randInt(1, 50)}ms`;
  } else if (scenario === "replication_ok") {
    ldapCode = "0";
    const partnerDc = `DC-${randId(4).toUpperCase()}`;
    message = `Directory Service ${dirId}: replication OK with ${partnerDc} — ${randInt(0, 500)} objects synced, USN ${randInt(10000, 999999)}`;
  } else if (scenario === "schema_update") {
    ldapCode = "0";
    message = `Directory Service ${dirId}: schema update applied — ${rand(["added custom attribute", "extended groupType", "updated objectClass"])} by ${principal}`;
  } else {
    ldapCode = "0";
    message = `Directory Service ${dirId}: LDAP Bind OK for ${principal} from ${clientIp} — ${dirType} domain ${domainName}`;
  }

  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "directory-service" },
    },
    aws: {
      directoryservice: {
        directory_id: dirId,
        directory_type: dirType,
        domain_name: domainName,
        event_name:
          scenario.startsWith("auth") || scenario === "account_locked"
            ? "Authenticate"
            : scenario.startsWith("ldap")
              ? "LDAPSearch"
              : scenario.startsWith("repl")
                ? "Replication"
                : scenario.startsWith("dns")
                  ? "DNSLookup"
                  : "SchemaUpdate",
        client_ip: clientIp,
        ldap_result_code: ldapCode,
      },
    },
    user: { name: principal.split("@")[0], domain: domainName },
    source: { ip: clientIp },
    event: {
      outcome: isErr ? "failure" : "success",
      dataset: "aws.directoryservice",
      category: ["authentication"],
      duration: randInt(2_000_000, 180_000_000),
    },
    message,
    ...(errorBlock ? { error: errorBlock } : {}),
  };
}

/* ------------------------------------------------------------------ */
/*  ACM Private CA                                                    */
/* ------------------------------------------------------------------ */
function generateAcmpcaLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const caId = randUUID();
  const caArn = `arn:aws:acm-pca:${region}:${acct.id}:certificate-authority/${caId}`;
  const serial = randId(16).toUpperCase();

  const scenario = isErr
    ? rand(["issue_fail", "revoke_fail", "ca_expired", "quota_exceeded", "access_denied"] as const)
    : rand([
        "issue_ok",
        "issue_ok",
        "revoke_ok",
        "describe_ca",
        "get_cert",
        "audit_report",
      ] as const);

  let message: string;
  let errorBlock: Record<string, unknown> | null = null;
  let apiCall: string;

  if (scenario === "issue_fail") {
    apiCall = "IssueCertificate";
    const reason = rand([
      "CSR signature mismatch",
      "Template not found",
      "Validity period exceeds CA validity",
    ]);
    message = `ACM PCA ${caId}: IssueCertificate FAILED — ${reason}. CA: ${caArn}`;
    errorBlock = { code: "MalformedCSRException", message: reason, type: "client" };
  } else if (scenario === "revoke_fail") {
    apiCall = "RevokeCertificate";
    message = `ACM PCA ${caId}: RevokeCertificate FAILED — certificate ${serial} not found or already revoked`;
    errorBlock = {
      code: "InvalidRequestException",
      message: "Certificate not found or already revoked",
      type: "client",
    };
  } else if (scenario === "ca_expired") {
    apiCall = "IssueCertificate";
    message = `ACM PCA ${caId}: CA certificate expired — unable to issue new certificates. CA status: EXPIRED. Renew the CA certificate.`;
    errorBlock = {
      code: "InvalidStateException",
      message: "CA is in EXPIRED state",
      type: "server",
    };
  } else if (scenario === "quota_exceeded") {
    apiCall = "IssueCertificate";
    message = `ACM PCA ${caId}: RequestThrottledException — certificate issuance rate exceeded (${randInt(50, 200)}/s, limit: ${rand([25, 50])}). CA: ${caArn}`;
    errorBlock = {
      code: "RequestThrottledException",
      message: "Certificate issuance rate limit exceeded",
      type: "client",
    };
  } else if (scenario === "access_denied") {
    apiCall = rand(["IssueCertificate", "RevokeCertificate", "GetCertificate"]);
    message = `ACM PCA ${caId}: AccessDeniedException — arn:aws:iam::${acct.id}:role/${rand(["app-role", "ci-runner"])} does not have acm-pca:${apiCall} on ${caArn}`;
    errorBlock = {
      code: "AccessDeniedException",
      message: `Insufficient IAM permissions for ${apiCall}`,
      type: "client",
    };
  } else if (scenario === "revoke_ok") {
    apiCall = "RevokeCertificate";
    message = `ACM PCA ${caId}: RevokeCertificate OK — serial ${serial}, reason: ${rand(["KEY_COMPROMISE", "CESSATION_OF_OPERATION", "SUPERSEDED", "UNSPECIFIED"])}. CRL updated.`;
  } else if (scenario === "describe_ca") {
    apiCall = "DescribeCertificateAuthority";
    const status = rand(["ACTIVE", "ACTIVE", "PENDING_CERTIFICATE", "DISABLED"]);
    message = `ACM PCA ${caId}: DescribeCertificateAuthority — status: ${status}, type: ${rand(["ROOT", "SUBORDINATE"])}, algorithm: ${rand(["RSA_2048", "RSA_4096", "EC_prime256v1", "EC_secp384r1"])}`;
  } else if (scenario === "get_cert") {
    apiCall = "GetCertificate";
    message = `ACM PCA ${caId}: GetCertificate OK — serial ${serial}, algorithm: ${rand(["SHA256WITHRSA", "SHA384WITHECDSA", "SHA512WITHRSA"])}`;
  } else if (scenario === "audit_report") {
    apiCall = "CreateCertificateAuthorityAuditReport";
    message = `ACM PCA ${caId}: audit report created — s3://${rand(["pca-audits", "compliance-logs"])}-${acct.id}/audit-${new Date(ts).toISOString().slice(0, 10)}.json, ${randInt(10, 10_000)} certificates evaluated`;
  } else {
    apiCall = "IssueCertificate";
    const template = rand([
      "EndEntityCertificate/V1",
      "SubordinateCACertificate_PathLen3/V1",
      "CodeSigningCertificate/V1",
    ]);
    message = `ACM PCA ${caId}: IssueCertificate OK — serial ${serial}, template: ${template}, validity: ${rand([365, 730, 1095])} days, algorithm: ${rand(["SHA256WITHRSA", "SHA384WITHECDSA"])}`;
  }

  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "acm-pca" },
    },
    aws: {
      acmpca: {
        certificate_authority_arn: caArn,
        api_call: apiCall,
        signing_algorithm: rand(["SHA256WITHRSA", "SHA384WITHECDSA"]),
        template_arn:
          apiCall === "IssueCertificate"
            ? `arn:aws:acm-pca:::template/${rand(["EndEntityCertificate/V1", "SubordinateCACertificate_PathLen3/V1"])}`
            : null,
        serial: apiCall !== "DescribeCertificateAuthority" ? serial : null,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      dataset: "aws.acmpca",
      category: ["process"],
      duration: randInt(5_000_000, 400_000_000),
    },
    message,
    ...(errorBlock ? { error: errorBlock } : {}),
  };
}

/* ------------------------------------------------------------------ */
/*  MGN (Application Migration Service)                               */
/* ------------------------------------------------------------------ */
function generateMgnLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const serverId = `s-${randId(10)}`;
  const hostname = `${rand(["web", "app", "db", "batch"])}-${rand(["prod", "staging"])}-${randInt(1, 20)}`;

  const scenario = isErr
    ? rand([
        "replication_stall",
        "cutover_fail",
        "agent_disconnect",
        "launch_fail",
        "disk_full",
      ] as const)
    : rand([
        "replication_ok",
        "replication_ok",
        "cutover_ok",
        "test_launch",
        "agent_connect",
        "finalize",
      ] as const);

  const replicationType = rand(["CONTINUOUS", "SNAPSHOT", "ON_DEMAND"]);
  const lagSec = isErr ? randFloat(300, 7200) : randFloat(0.2, 12);
  const bytesReplicated = randInt(1e9, 8e12);
  let message: string;
  let errorBlock: Record<string, unknown> | null = null;

  if (scenario === "replication_stall") {
    message = `MGN source ${serverId} (${hostname}): replication STALLED — lag ${Math.round(lagSec)}s, last checkpoint ${new Date(Date.now() - lagSec * 1000).toISOString()}. Agent status: ${rand(["STALLED", "LAGGING"])}. Check network bandwidth and disk I/O.`;
    errorBlock = {
      code: "ReplicationStalled",
      message: `Replication lag ${Math.round(lagSec)}s exceeds threshold`,
      type: "server",
    };
  } else if (scenario === "cutover_fail") {
    const reason = rand([
      "EC2 launch template error",
      "EBS volume conversion failed",
      "Security group not found",
      "Subnet has no available IPs",
    ]);
    message = `MGN source ${serverId} (${hostname}): CUTOVER FAILED — ${reason}. Job: mgnjob-${randId(8)}. Manual intervention required.`;
    errorBlock = { code: "CutoverFailedException", message: reason, type: "server" };
  } else if (scenario === "agent_disconnect") {
    message = `MGN source ${serverId} (${hostname}): replication agent DISCONNECTED — last heartbeat ${randInt(5, 60)} min ago. OS: ${rand(["Windows Server 2019", "RHEL 8", "Ubuntu 22.04"])}. Verify agent process and network connectivity.`;
    errorBlock = {
      code: "AgentDisconnected",
      message: "No heartbeat from replication agent",
      type: "network",
    };
  } else if (scenario === "launch_fail") {
    const reason = rand(["InsufficientInstanceCapacity", "InvalidAMI", "VolumeLimitExceeded"]);
    message = `MGN source ${serverId} (${hostname}): test launch FAILED — EC2 returned ${reason} in ${region}`;
    errorBlock = { code: reason, message: `EC2 launch failed: ${reason}`, type: "server" };
  } else if (scenario === "disk_full") {
    const disk = rand(["C:\\", "/dev/sda1", "/dev/xvda1"]);
    message = `MGN source ${serverId} (${hostname}): staging disk ${disk} at ${randInt(95, 100)}% — replication may stall. Total: ${randInt(50, 2000)} GB, used: ${randInt(48, 1990)} GB`;
    errorBlock = {
      code: "DiskSpaceLow",
      message: `Staging disk ${disk} near capacity`,
      type: "server",
    };
  } else if (scenario === "cutover_ok") {
    message = `MGN source ${serverId} (${hostname}): CUTOVER SUCCESS — EC2 instance i-${randHexId(17)} launched in ${region}. DNS updated. Cutover duration: ${randInt(120, 3600)}s`;
  } else if (scenario === "test_launch") {
    message = `MGN source ${serverId} (${hostname}): test launch SUCCESS — instance i-${randHexId(17)} running. Boot validation: ${rand(["PASSED", "PASSED", "WARNING_DRIVERS"])}`;
  } else if (scenario === "agent_connect") {
    message = `MGN source ${serverId} (${hostname}): agent connected — OS: ${rand(["Windows Server 2019", "RHEL 8", "Ubuntu 22.04"])}, disks: ${randInt(1, 8)}, total: ${randInt(50, 4000)} GB`;
  } else if (scenario === "finalize") {
    message = `MGN source ${serverId} (${hostname}): migration FINALIZED — source server archived. Total data replicated: ${(bytesReplicated / 1e9).toFixed(1)} GB over ${randInt(1, 90)} days`;
  } else {
    message = `MGN source ${serverId} (${hostname}): replication healthy — lag ${lagSec.toFixed(1)}s, ${(bytesReplicated / 1e9).toFixed(1)} GB replicated, ${replicationType}`;
  }

  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "mgn" },
    },
    aws: {
      mgn: {
        source_server_id: serverId,
        hostname,
        replication_type: replicationType,
        lifecycle_state: isErr
          ? rand(["CUTOVER_FAILED", "STALLED", "DISCONNECTED"])
          : rand(["READY_FOR_CUTOVER", "CUTOVER", "TESTING"]),
        lag_seconds: lagSec,
        bytes_replicated_total: bytesReplicated,
        job_id: `mgnjob-${randId(8)}`,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      dataset: "aws.mgn",
      category: ["process"],
      duration: randInt(20_000_000, 2_000_000_000),
    },
    message,
    ...(errorBlock ? { error: errorBlock } : {}),
  };
}

/* ------------------------------------------------------------------ */
/*  CloudWatch Synthetics                                             */
/* ------------------------------------------------------------------ */
function generateCwSyntheticsLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const canary = rand([
    "heartbeat-prod",
    "checkout-flow",
    "api-health",
    "login-page",
    "search-e2e",
  ]);
  const canaryArn = `arn:aws:synthetics:${region}:${acct.id}:canary:${canary}`;
  const runId = randId(12).toLowerCase();
  const runtime = rand([
    "syn-nodejs-puppeteer-7.0",
    "syn-nodejs-puppeteer-6.2",
    "syn-python-selenium-3.0",
  ]);
  const isNode = runtime.includes("nodejs");
  const durMs = randInt(800, isErr ? 120_000 : 45_000);

  const scenario = isErr
    ? rand(["step_fail", "timeout", "screenshot_diff", "network_error", "assertion_fail"] as const)
    : rand(["run_ok", "run_ok", "run_ok", "step_pass", "visual_pass"] as const);

  const stepName = rand([
    "navigate_homepage",
    "click_login",
    "fill_credentials",
    "verify_dashboard",
    "add_to_cart",
    "complete_checkout",
    "search_products",
  ]);
  let message: string;
  let errorBlock: Record<string, unknown> | null = null;

  if (scenario === "step_fail") {
    const reason = isNode
      ? rand([
          `Element "#submit-btn" not found within 10000ms`,
          `Navigation timeout of 30000ms exceeded`,
          `net::ERR_CONNECTION_REFUSED at https://${randAppDomain()}/api`,
        ])
      : rand([
          `NoSuchElementException: Unable to locate element: {"method":"css selector","selector":"#submit-btn"}`,
          `TimeoutException: page load timed out`,
        ]);
    message = `Synthetics ${canary} run ${runId}: step "${stepName}" FAILED — ${reason}`;
    errorBlock = {
      code: isNode ? "TimeoutError" : "NoSuchElementException",
      message: reason,
      type: "test",
      stack_trace: isNode
        ? `TimeoutError: ${reason}\n    at waitForSelector (/opt/nodejs/node_modules/synthetics/src/canary.js:${randInt(50, 200)}:${randInt(5, 30)})\n    at executeStep (/opt/nodejs/node_modules/synthetics/src/step.js:${randInt(10, 100)}:${randInt(5, 20)})`
        : `selenium.common.exceptions.${rand(["NoSuchElementException", "TimeoutException"])}: Message: ${reason}\n  File "/opt/python/lib/python3.12/selenium/webdriver/remote/webdriver.py", line ${randInt(100, 500)}`,
    };
  } else if (scenario === "timeout") {
    message = `Synthetics ${canary} run ${runId}: TIMEOUT — canary exceeded maximum duration of ${rand([60, 120, 300])}s. Last completed step: "${stepName}" at ${durMs}ms`;
    errorBlock = {
      code: "CanaryTimeout",
      message: `Exceeded maximum execution time`,
      type: "test",
    };
  } else if (scenario === "screenshot_diff") {
    const diffPct = randFloat(5, 40);
    message = `Synthetics ${canary} run ${runId}: visual regression — step "${stepName}" screenshot differs by ${diffPct.toFixed(1)}% from baseline (threshold: 5%). Screenshot: s3://cw-syn-results-${acct.id}-${region}/${canary}/${runId}/screenshots/${stepName}.png`;
    errorBlock = {
      code: "VisualRegressionDetected",
      message: `Screenshot diff ${diffPct.toFixed(1)}% exceeds threshold`,
      type: "test",
    };
  } else if (scenario === "network_error") {
    const url = `https://${randFqdn()}/${rand(["health", "api/v1/status", "static/app.js"])}`;
    const netErr = rand([
      "net::ERR_CONNECTION_REFUSED",
      "net::ERR_CERT_DATE_INVALID",
      "net::ERR_NAME_NOT_RESOLVED",
    ]);
    message = `Synthetics ${canary} run ${runId}: network error at "${stepName}" — ${netErr} for ${url}`;
    errorBlock = { code: netErr, message: `Network request failed: ${netErr}`, type: "network" };
  } else if (scenario === "assertion_fail") {
    const assertion = rand([
      `Expected status 200 but got 503`,
      `Expected text "Welcome" but got "Service Unavailable"`,
      `Expected response time < 2000ms but was ${durMs}ms`,
    ]);
    message = `Synthetics ${canary} run ${runId}: assertion failed at step "${stepName}" — ${assertion}`;
    errorBlock = { code: "AssertionError", message: assertion, type: "test" };
  } else if (scenario === "step_pass") {
    const stepMs = randInt(100, 5000);
    message = `Synthetics ${canary} run ${runId}: step "${stepName}" PASSED in ${stepMs}ms — screenshot captured`;
  } else if (scenario === "visual_pass") {
    message = `Synthetics ${canary} run ${runId}: visual comparison PASSED — step "${stepName}" within 2% of baseline`;
  } else {
    const steps = randInt(3, 8);
    message = `Synthetics ${canary} run ${runId}: PASSED — ${steps}/${steps} steps completed in ${durMs}ms. Runtime: ${runtime}. Screenshot S3: s3://cw-syn-results-${acct.id}-${region}/${canary}/${runId}/`;
  }

  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "synthetics" },
    },
    aws: {
      cwsynthetics: {
        canary_name: canary,
        canary_arn: canaryArn,
        run_id: runId,
        runtime_version: runtime,
        success: !isErr,
        http_status: isErr ? rand([0, 502, 503, 504]) : 200,
        duration_ms: durMs,
        step_name: stepName,
        screenshot_s3_key: `cw-syn-results-${acct.id}-${region}/${canary}/${runId}/screenshots/${stepName}.png`,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      dataset: "aws.cwsynthetics",
      category: ["web"],
      duration: durMs * 1_000_000,
    },
    message,
    ...(errorBlock ? { error: errorBlock } : {}),
  };
}

/* ------------------------------------------------------------------ */
/*  Managed Prometheus (AMP)                                          */
/* ------------------------------------------------------------------ */
function generateManagedPrometheusLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const wsAlias = rand([
    "prod-monitoring",
    "staging-metrics",
    "k8s-cluster-01",
    "microservices-obs",
  ]);
  const wsId = `ws-${randId(24).toLowerCase()}`;
  const wsArn = `arn:aws:aps:${region}:${acct.id}:workspace/${wsId}`;

  const scenario = isErr
    ? rand([
        "remote_write_fail",
        "query_timeout",
        "out_of_order",
        "rate_limit",
        "rule_eval_fail",
      ] as const)
    : rand([
        "remote_write_ok",
        "remote_write_ok",
        "query_ok",
        "rule_eval_ok",
        "ruler_reload",
        "workspace_describe",
      ] as const);

  const samplesIngested = randInt(10_000, 500_000_000);
  let message: string;
  let errorBlock: Record<string, unknown> | null = null;

  if (scenario === "remote_write_fail") {
    const reason = rand([
      "SigV4 signature expired",
      "Workspace not found",
      "Payload decompression failed",
      "Sample timestamp too old (>1h)",
    ]);
    message = `AMP workspace ${wsAlias} (${wsId}): remote_write FAILED — ${reason}. Dropped ${randInt(100, 50_000)} samples from ${rand(["prometheus-k8s-0", "grafana-agent", "otel-collector"])}.`;
    errorBlock = {
      code: rand(["InvalidSignatureException", "ResourceNotFoundException", "ValidationException"]),
      message: reason,
      type: "client",
    };
  } else if (scenario === "query_timeout") {
    const queryExpr = rand([
      `sum(rate(http_requests_total[5m])) by (service)`,
      `histogram_quantile(0.99, sum(rate(request_duration_seconds_bucket[5m])) by (le))`,
      `topk(10, container_memory_working_set_bytes)`,
    ]);
    message = `AMP workspace ${wsAlias}: query_range TIMEOUT — "${queryExpr}" exceeded ${rand([30, 60, 120])}s limit. Time range: ${rand(["1h", "6h", "24h", "7d"])}. Consider reducing cardinality or time range.`;
    errorBlock = {
      code: "QueryTimeout",
      message: "PromQL query exceeded execution time limit",
      type: "server",
    };
  } else if (scenario === "out_of_order") {
    const metric = rand([
      "node_cpu_seconds_total",
      "container_memory_usage_bytes",
      "http_request_duration_seconds",
    ]);
    message = `AMP workspace ${wsAlias}: ${randInt(100, 10_000)} out-of-order samples discarded for metric "${metric}" — source: ${rand(["prometheus-k8s-0", "victoria-agent"])}. Ensure scrapers use consistent timestamps.`;
    errorBlock = {
      code: "OutOfOrderSample",
      message: "Samples arrived with timestamps older than accepted window",
      type: "client",
    };
  } else if (scenario === "rate_limit") {
    message = `AMP workspace ${wsAlias}: remote_write rate-limited — ${randInt(50_000, 500_000)} samples/s exceeds workspace limit of ${rand([50_000, 100_000, 200_000])}/s. ${randInt(1000, 50_000)} samples dropped.`;
    errorBlock = {
      code: "ThrottlingException",
      message: "Ingestion rate limit exceeded",
      type: "client",
    };
  } else if (scenario === "rule_eval_fail") {
    const ruleName = rand(["HighErrorRate", "PodCrashLooping", "NodeNotReady", "DiskPressure"]);
    const ruleGroup = rand(["kubernetes-alerts", "sre-slos", "infrastructure"]);
    message = `AMP workspace ${wsAlias}: rule evaluation FAILED — group "${ruleGroup}", rule "${ruleName}": ${rand(["query returned no data", "vector selector must be instant", "expression too complex"])}`;
    errorBlock = {
      code: "RuleEvaluationFailure",
      message: `Rule "${ruleName}" failed to evaluate`,
      type: "server",
    };
  } else if (scenario === "query_ok") {
    const queryExpr = rand([
      `up{job="api-server"}`,
      `rate(http_requests_total[5m])`,
      `node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes`,
    ]);
    const resultCount = randInt(1, 500);
    message = `AMP workspace ${wsAlias}: query_range OK — "${queryExpr}" returned ${resultCount} series in ${randInt(5, 2000)}ms. Time range: ${rand(["1h", "6h", "24h"])}`;
  } else if (scenario === "rule_eval_ok") {
    const ruleGroup = rand(["kubernetes-alerts", "sre-slos", "infrastructure"]);
    const rules = randInt(5, 50);
    message = `AMP workspace ${wsAlias}: rule group "${ruleGroup}" evaluated — ${rules} rules in ${randInt(10, 500)}ms, ${randInt(0, 3)} alerts firing`;
  } else if (scenario === "ruler_reload") {
    message = `AMP workspace ${wsAlias}: ruler configuration reloaded — ${randInt(1, 10)} rule groups, ${randInt(5, 100)} total rules. Source: ${rand(["API update", "config sync"])}`;
  } else if (scenario === "workspace_describe") {
    message = `AMP workspace ${wsAlias} (${wsId}): DescribeWorkspace — status: ACTIVE, alias: ${wsAlias}, created: ${rand(["2024-01-15", "2024-06-01", "2025-03-10"])}`;
  } else {
    const scraper = rand([
      "prometheus-k8s-0",
      "grafana-agent-01",
      "otel-collector",
      "adot-collector",
    ]);
    message = `AMP workspace ${wsAlias}: remote_write OK — ${samplesIngested.toLocaleString()} samples ingested from ${scraper} in ${randInt(50, 2000)}ms. Active series: ${randInt(10_000, 5_000_000)}`;
  }

  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "aps" },
    },
    aws: {
      managedprometheus: {
        workspace_alias: wsAlias,
        workspace_id: wsId,
        workspace_arn: wsArn,
        operation: scenario.startsWith("remote_write")
          ? "remote_write"
          : scenario.startsWith("query")
            ? "query_range"
            : scenario.startsWith("rule")
              ? "rules_evaluation"
              : "describe_workspace",
        samples_ingested: samplesIngested,
        rule_evaluation_failures: isErr && scenario.startsWith("rule") ? randInt(1, 500) : 0,
        discard_reason:
          scenario === "out_of_order"
            ? "out-of-order"
            : scenario === "rate_limit"
              ? "rate-limited"
              : null,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      dataset: "aws.managedprometheus",
      category: ["process"],
      duration: randInt(3_000_000, 600_000_000),
    },
    message,
    ...(errorBlock ? { error: errorBlock } : {}),
  };
}

export {
  generateBedrockGuardrailsLog,
  generateEmrServerlessLog,
  generateGwlbLog,
  generateElbClassicLog,
  generateMediaConnectLog,
  generateMediaPackageLog,
  generateMediaStoreLog,
  generateMediaTailorLog,
  generateIvsLog,
  generateIvsChatLog,
  generateCloudSearchLog,
  generateDirectoryServiceLog,
  generateAcmpcaLog,
  generateMgnLog,
  generateCwSyntheticsLog,
  generateManagedPrometheusLog,
};
