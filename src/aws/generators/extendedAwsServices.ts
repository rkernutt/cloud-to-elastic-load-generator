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

  let errorBlock: Record<string, unknown> | null = null;
  let messageDetails: Record<string, unknown> = {};

  if (scenario === "throttle") {
    const retryAfter = randInt(1, 30);
    messageDetails = { retryAfter };
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
    errorBlock = { code: "ValidationException", message: reason, type: "client" };
  } else if (scenario === "internal") {
    errorBlock = {
      code: "InternalServerException",
      message: "Upstream service unavailable",
      type: "server",
    };
  } else if (scenario === "access_denied") {
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
    messageDetails = { policyType, action, findings };
  } else if (scenario === "automated_reasoning") {
    const claims = randInt(1, 8);
    const hallucinations = randInt(0, 2);
    messageDetails = { claims, hallucinations };
  } else {
  }

  const message = JSON.stringify({
    scenario,
    timestamp: new Date(ts).toISOString(),
    region,
    accountId: acct.id,
    ...messageDetails,
    ...(errorBlock ? { status: "Failed", error: errorBlock } : { status: "Succeeded" }),
  });
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
/*  Gateway Load Balancer                                             */
/* ------------------------------------------------------------------ */
function generateGwlbLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const gwlb = `gwlb-${randId(8).toLowerCase()}`;
  const gwlbArn = `arn:aws:elasticloadbalancing:${region}:${acct.id}:loadbalancer/gwy/${gwlb}/abc${randId(5)}`;
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

  let errorBlock: Record<string, unknown> | null = null;
  let messageDetails: Record<string, unknown> = {};

  if (scenario === "target_unhealthy") {
    const targetIp = randIp();
    messageDetails = { targetIp };
    const reason = rand([
      "Health check failed",
      "Target.ResponseCodeMismatch",
      "Target.Timeout",
      "Elb.InternalError",
    ]);
    errorBlock = { code: "TargetHealthCheckFailure", message: reason, type: "server" };
  } else if (scenario === "geneve_drop") {
    const dropped = randInt(100, 50_000);
    const reason = rand([
      "InvalidHeader",
      "TunnelMTUExceeded",
      "ApplianceTimeout",
      "InvalidGeneveVersion",
    ]);
    errorBlock = {
      code: "GenevePacketDrop",
      message: `${dropped} packets dropped: ${reason}`,
      type: "network",
    };
  } else if (scenario === "deregistration") {
    const targetIp = randIp();
    const drainSec = randInt(10, 300);
    messageDetails = { targetIp, drainSec };
    errorBlock = {
      code: "TargetDeregistration",
      message: "Target deregistering from target group",
      type: "server",
    };
  } else if (scenario === "connection_timeout") {
    errorBlock = {
      code: "ConnectionTimeout",
      message: "Appliance did not respond within timeout",
      type: "server",
    };
  } else if (scenario === "health_check_ok") {
    const healthy = randInt(2, 8);
    messageDetails = { healthy };
  } else if (scenario === "target_registered") {
    const targetIp = randIp();
    messageDetails = { targetIp };
  } else if (scenario === "cross_zone_rebalance") {
  } else {
  }

  const message = JSON.stringify({
    scenario,
    timestamp: new Date(ts).toISOString(),
    region,
    accountId: acct.id,
    ...messageDetails,
    ...(errorBlock ? { status: "Failed", error: errorBlock } : { status: "Succeeded" }),
  });
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
  let errorBlock: Record<string, unknown> | null = null;

  if (scenario === "backend_5xx") {
    elbStatus = rand([502, 502, 503]);
    backendStatus = rand([500, 502, 503]);
    errorBlock = {
      code: `HTTP_${backendStatus}`,
      message: `Backend returned ${backendStatus}`,
      type: "server",
    };
  } else if (scenario === "backend_timeout") {
    elbStatus = 504;
    backendStatus = 0;
    errorBlock = {
      code: "BackendConnectionTimeout",
      message: "Backend did not respond within idle timeout",
      type: "server",
    };
  } else if (scenario === "no_healthy_targets") {
    elbStatus = 503;
    backendStatus = 0;
    errorBlock = {
      code: "NoHealthyBackends",
      message: "No registered targets are healthy",
      type: "server",
    };
  } else if (scenario === "ssl_error") {
    elbStatus = 463;
    backendStatus = 0;
    errorBlock = {
      code: "SSLCertificateError",
      message: "Client TLS certificate verification failed",
      type: "client",
    };
  } else if (scenario === "elb_5xx") {
    elbStatus = 500;
    backendStatus = 0;
    errorBlock = {
      code: "ELBInternalError",
      message: "Internal load balancer error",
      type: "server",
    };
  } else if (scenario === "ssl_handshake") {
    elbStatus = 200;
    backendStatus = 200;
  } else {
    elbStatus = scenario === "access_301" ? 301 : scenario === "access_304" ? 304 : 200;
    backendStatus = elbStatus;
  }

  const message = JSON.stringify({
    scenario,
    timestamp: new Date(ts).toISOString(),
    region,
    accountId: acct.id,
    ...(errorBlock ? { status: "Failed", error: errorBlock } : { status: "Succeeded" }),
  });
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
  let errorBlock: Record<string, unknown> | null = null;
  let messageDetails: Record<string, unknown> = {};

  if (scenario === "source_disconnect") {
    const protocol = rand(["SRT", "Zixi", "RIST", "RTP-FEC"]);
    errorBlock = {
      code: "SourceDisconnected",
      message: `${protocol} source lost connection`,
      type: "network",
    };
  } else if (scenario === "encoder_error") {
    errorBlock = {
      code: "EncoderFormatMismatch",
      message: "Input codec incompatible with output profile",
      type: "client",
    };
  } else if (scenario === "entitlement_revoked") {
    errorBlock = {
      code: "EntitlementRevoked",
      message: "Sharing entitlement was revoked by granter",
      type: "client",
    };
  } else if (scenario === "network_congestion") {
    const packetLoss = randFloat(0.5, 8.0);
    const jitterMs = randFloat(5, 80);
    messageDetails = { packetLoss, jitterMs };
    errorBlock = {
      code: "NetworkCongestion",
      message: `Packet loss ${packetLoss.toFixed(1)}%`,
      type: "network",
    };
  } else if (scenario === "failover_switch") {
  } else if (scenario === "output_started") {
    const protocol = rand(["SRT", "Zixi", "RIST", "CDI"]);
    messageDetails = { protocol };
  } else if (scenario === "source_health_ok") {
  } else {
  }

  const message = JSON.stringify({
    scenario,
    timestamp: new Date(ts).toISOString(),
    region,
    accountId: acct.id,
    ...messageDetails,
    ...(errorBlock ? { status: "Failed", error: errorBlock } : { status: "Succeeded" }),
  });
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

  let errorBlock: Record<string, unknown> | null = null;
  let messageDetails: Record<string, unknown> = {};

  if (scenario === "ingest_timeout") {
    errorBlock = {
      code: "IngestTimeout",
      message: "No segments received within expected interval",
      type: "server",
    };
  } else if (scenario === "manifest_stale") {
    const staleSec = randInt(10, 60);
    errorBlock = {
      code: "StaleManifest",
      message: `Manifest not updated for ${staleSec}s`,
      type: "server",
    };
  } else if (scenario === "origin_4xx") {
    const status = rand([403, 404, 410]);
    errorBlock = { code: `HTTP_${status}`, message: `Origin returned ${status}`, type: "client" };
  } else if (scenario === "drm_license_fail") {
    errorBlock = {
      code: "DRMLicenseFailure",
      message: "SPEKE key provider unavailable",
      type: "server",
    };
  } else if (scenario === "segment_ingested") {
    const segNum = randInt(0, 99999);
    const segBytes = randInt(50_000, 4_000_000);
    messageDetails = { segNum, segBytes };
  } else if (scenario === "endpoint_created") {
  } else if (scenario === "harvest_complete") {
  } else {
  }

  const message = JSON.stringify({
    scenario,
    timestamp: new Date(ts).toISOString(),
    region,
    accountId: acct.id,
    ...messageDetails,
    ...(errorBlock ? { status: "Failed", error: errorBlock } : { status: "Succeeded" }),
  });
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
      type: awsEventType(isErr, scenario === "endpoint_created" ? "creation" : "change"),
      duration: randInt(8_000_000, 500_000_000),
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
  let errorBlock: Record<string, unknown> | null = null;
  let messageDetails: Record<string, unknown> = {};

  if (scenario === "ads_timeout") {
    const adsUrl = `https://ads.${rand(EMAIL_DOMAINS)}/vast/${rand(["v3", "v4"])}`;
    messageDetails = { adsUrl };
    errorBlock = {
      code: "AdsDecisionServerTimeout",
      message: "ADS did not respond in time",
      type: "server",
    };
  } else if (scenario === "vast_empty") {
    errorBlock = {
      code: "EmptyVASTResponse",
      message: "No ad creatives returned for avail",
      type: "client",
    };
  } else if (scenario === "origin_error") {
    const status = rand([502, 503, 504]);
    errorBlock = {
      code: `OriginHTTP${status}`,
      message: `Content origin returned ${status}`,
      type: "server",
    };
  } else if (scenario === "stitch_failure") {
    errorBlock = {
      code: "TranscodeProfileMismatch",
      message: "Ad creative codec incompatible with content profile",
      type: "server",
    };
  } else if (scenario === "ad_break_filled") {
    const breakDur = rand([15, 30, 60, 90, 120]);
    const filled = randInt(1, 6);
    messageDetails = { breakDur, filled };
  } else if (scenario === "session_init") {
    const sessionId = randId(16);
    messageDetails = { sessionId };
  } else if (scenario === "prefetch_ok") {
  } else {
  }

  const message = JSON.stringify({
    scenario,
    timestamp: new Date(ts).toISOString(),
    region,
    accountId: acct.id,
    ...messageDetails,
    ...(errorBlock ? { status: "Failed", error: errorBlock } : { status: "Succeeded" }),
  });
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
  let errorBlock: Record<string, unknown> | null = null;
  let messageDetails: Record<string, unknown> = { channelName };

  if (scenario === "ingest_starvation") {
    const gapSec = randFloat(2, 30);
    errorBlock = {
      code: "StreamStarvation",
      message: `No frames for ${gapSec.toFixed(1)}s`,
      type: "network",
    };
  } else if (scenario === "stream_disconnect") {
    errorBlock = {
      code: "StreamDisconnected",
      message: "Encoder closed connection",
      type: "network",
    };
  } else if (scenario === "quota_exceeded") {
    errorBlock = {
      code: "ThrottlingException",
      message: "Concurrent stream limit exceeded",
      type: "client",
    };
  } else if (scenario === "recording_fail") {
    errorBlock = {
      code: "RecordingS3AccessDenied",
      message: "S3 bucket returned AccessDenied for recording",
      type: "client",
    };
  } else if (scenario === "stream_start") {
  } else if (scenario === "stream_end") {
    const durSec = randInt(60, 28800);
    messageDetails = { ...messageDetails, durSec };
  } else if (scenario === "recording_saved") {
  } else if (scenario === "viewer_spike") {
    const delta = randInt(1000, 20000);
    messageDetails = { ...messageDetails, delta };
  } else {
  }

  const message = JSON.stringify({
    scenario,
    timestamp: new Date(ts).toISOString(),
    region,
    accountId: acct.id,
    ...messageDetails,
    ...(errorBlock ? { status: "Failed", error: errorBlock } : { status: "Succeeded" }),
  });
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

  let errorBlock: Record<string, unknown> | null = null;
  let messageDetails: Record<string, unknown> = {};
  let eventType: string;

  if (scenario === "send_fail") {
    eventType = "MESSAGE_SEND_FAILED";
    const reason = rand(["MessageTooLong", "RoomNotFound", "InternalError"]);
    errorBlock = { code: reason, message: `Message delivery failed: ${reason}`, type: "client" };
  } else if (scenario === "rate_limited") {
    eventType = "RATE_LIMITED";
    errorBlock = {
      code: "ThrottlingException",
      message: "Message rate exceeded room limit",
      type: "client",
    };
  } else if (scenario === "room_deleted") {
    eventType = "DELETE_ROOM";
    errorBlock = {
      code: "RoomDeleted",
      message: "Room was deleted while connections were active",
      type: "server",
    };
  } else if (scenario === "auth_fail") {
    eventType = "CONNECT_FAILED";
    errorBlock = {
      code: rand(["TokenExpired", "InvalidToken"]),
      message: "Chat token validation failed",
      type: "client",
    };
  } else if (scenario === "user_connect") {
    eventType = "CONNECT";
  } else if (scenario === "user_disconnect") {
    eventType = "DISCONNECT";
    const dur = randInt(10, 7200);
    messageDetails = { dur };
  } else if (scenario === "moderation_action") {
    eventType = "MODERATION";
    const action = rand(["DELETE_MESSAGE", "DISCONNECT_USER", "BAN_USER"]);
    messageDetails = { action };
  } else if (scenario === "room_created") {
    eventType = "CREATE_ROOM";
  } else {
    eventType = "MESSAGE_RECEIVED";
  }

  const message = JSON.stringify({
    scenario,
    timestamp: new Date(ts).toISOString(),
    region,
    accountId: acct.id,
    ...messageDetails,
    ...(errorBlock ? { status: "Failed", error: errorBlock } : { status: "Succeeded" }),
  });
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

  let errorBlock: Record<string, unknown> | null = null;
  let messageDetails: Record<string, unknown> = {};
  let ldapCode: string;

  if (scenario === "auth_failed") {
    ldapCode = rand(["49", "52", "53"]);
    const reason =
      ldapCode === "49"
        ? "invalidCredentials"
        : ldapCode === "52"
          ? "unavailable"
          : "unwillingToPerform";
    errorBlock = { code: `LDAP_${ldapCode}`, message: reason, type: "authentication" };
  } else if (scenario === "ldap_bind_err") {
    ldapCode = "1";
    errorBlock = { code: "LDAP_1", message: "Operations error", type: "server" };
  } else if (scenario === "replication_fail") {
    ldapCode = "0";
    const partnerDc = `DC-${randId(4).toUpperCase()}`;
    messageDetails = { partnerDc };
    errorBlock = { code: "ReplicationFailure", message: "AD replication failed", type: "server" };
  } else if (scenario === "dns_timeout") {
    ldapCode = "0";
    const target = `_ldap._tcp.${domainName}`;
    errorBlock = {
      code: "DNSLookupFailed",
      message: `SRV lookup failed for ${target}`,
      type: "network",
    };
  } else if (scenario === "account_locked") {
    ldapCode = "775";
    errorBlock = {
      code: "AccountLocked",
      message: `Account locked: too many failed attempts`,
      type: "authentication",
    };
  } else if (scenario === "ldap_search") {
    ldapCode = "0";
    const base = `ou=${rand(["Users", "Computers", "Groups"])},dc=${domainName.split(".")[0]},dc=${domainName.split(".")[1]}`;
    messageDetails = { base };
  } else if (scenario === "dns_lookup") {
    ldapCode = "0";
  } else if (scenario === "replication_ok") {
    ldapCode = "0";
    const partnerDc = `DC-${randId(4).toUpperCase()}`;
    messageDetails = { partnerDc };
  } else if (scenario === "schema_update") {
    ldapCode = "0";
  } else {
    ldapCode = "0";
  }

  const message = JSON.stringify({
    scenario,
    timestamp: new Date(ts).toISOString(),
    region,
    accountId: acct.id,
    ...messageDetails,
    ...(errorBlock ? { status: "Failed", error: errorBlock } : { status: "Succeeded" }),
  });
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

  let errorBlock: Record<string, unknown> | null = null;
  let messageDetails: Record<string, unknown> = {};
  let apiCall: string;

  if (scenario === "issue_fail") {
    apiCall = "IssueCertificate";
    const reason = rand([
      "CSR signature mismatch",
      "Template not found",
      "Validity period exceeds CA validity",
    ]);
    errorBlock = { code: "MalformedCSRException", message: reason, type: "client" };
  } else if (scenario === "revoke_fail") {
    apiCall = "RevokeCertificate";
    errorBlock = {
      code: "InvalidRequestException",
      message: "Certificate not found or already revoked",
      type: "client",
    };
  } else if (scenario === "ca_expired") {
    apiCall = "IssueCertificate";
    errorBlock = {
      code: "InvalidStateException",
      message: "CA is in EXPIRED state",
      type: "server",
    };
  } else if (scenario === "quota_exceeded") {
    apiCall = "IssueCertificate";
    errorBlock = {
      code: "RequestThrottledException",
      message: "Certificate issuance rate limit exceeded",
      type: "client",
    };
  } else if (scenario === "access_denied") {
    apiCall = rand(["IssueCertificate", "RevokeCertificate", "GetCertificate"]);
    errorBlock = {
      code: "AccessDeniedException",
      message: `Insufficient IAM permissions for ${apiCall}`,
      type: "client",
    };
  } else if (scenario === "revoke_ok") {
    apiCall = "RevokeCertificate";
  } else if (scenario === "describe_ca") {
    apiCall = "DescribeCertificateAuthority";
    const status = rand(["ACTIVE", "ACTIVE", "PENDING_CERTIFICATE", "DISABLED"]);
    messageDetails = { status };
  } else if (scenario === "get_cert") {
    apiCall = "GetCertificate";
  } else if (scenario === "audit_report") {
    apiCall = "CreateCertificateAuthorityAuditReport";
  } else {
    apiCall = "IssueCertificate";
    const template = rand([
      "EndEntityCertificate/V1",
      "SubordinateCACertificate_PathLen3/V1",
      "CodeSigningCertificate/V1",
    ]);
    messageDetails = { template };
  }

  const message = JSON.stringify({
    scenario,
    timestamp: new Date(ts).toISOString(),
    region,
    accountId: acct.id,
    ...messageDetails,
    ...(errorBlock ? { status: "Failed", error: errorBlock } : { status: "Succeeded" }),
  });
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
  let errorBlock: Record<string, unknown> | null = null;

  if (scenario === "replication_stall") {
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
    errorBlock = { code: "CutoverFailedException", message: reason, type: "server" };
  } else if (scenario === "agent_disconnect") {
    errorBlock = {
      code: "AgentDisconnected",
      message: "No heartbeat from replication agent",
      type: "network",
    };
  } else if (scenario === "launch_fail") {
    const reason = rand(["InsufficientInstanceCapacity", "InvalidAMI", "VolumeLimitExceeded"]);
    errorBlock = { code: reason, message: `EC2 launch failed: ${reason}`, type: "server" };
  } else if (scenario === "disk_full") {
    const disk = rand(["C:\\", "/dev/sda1", "/dev/xvda1"]);
    errorBlock = {
      code: "DiskSpaceLow",
      message: `Staging disk ${disk} near capacity`,
      type: "server",
    };
  } else if (scenario === "cutover_ok") {
  } else if (scenario === "test_launch") {
  } else if (scenario === "agent_connect") {
  } else if (scenario === "finalize") {
  } else {
  }

  const message = JSON.stringify({
    scenario,
    timestamp: new Date(ts).toISOString(),
    region,
    accountId: acct.id,
    ...(errorBlock ? { status: "Failed", error: errorBlock } : { status: "Succeeded" }),
  });
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
  let errorBlock: Record<string, unknown> | null = null;
  let messageDetails: Record<string, unknown> = {};

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
    errorBlock = {
      code: isNode ? "TimeoutError" : "NoSuchElementException",
      message: reason,
      type: "test",
      stack_trace: isNode
        ? `TimeoutError: ${reason}\n    at waitForSelector (/opt/nodejs/node_modules/synthetics/src/canary.js:${randInt(50, 200)}:${randInt(5, 30)})\n    at executeStep (/opt/nodejs/node_modules/synthetics/src/step.js:${randInt(10, 100)}:${randInt(5, 20)})`
        : `selenium.common.exceptions.${rand(["NoSuchElementException", "TimeoutException"])}: Message: ${reason}\n  File "/opt/python/lib/python3.12/selenium/webdriver/remote/webdriver.py", line ${randInt(100, 500)}`,
    };
  } else if (scenario === "timeout") {
    errorBlock = {
      code: "CanaryTimeout",
      message: `Exceeded maximum execution time`,
      type: "test",
    };
  } else if (scenario === "screenshot_diff") {
    const diffPct = randFloat(5, 40);
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
    messageDetails = { url };
    errorBlock = {
      code: netErr,
      message: `Network request failed for ${url}: ${netErr}`,
      type: "network",
    };
  } else if (scenario === "assertion_fail") {
    const assertion = rand([
      `Expected status 200 but got 503`,
      `Expected text "Welcome" but got "Service Unavailable"`,
      `Expected response time < 2000ms but was ${durMs}ms`,
    ]);
    errorBlock = { code: "AssertionError", message: assertion, type: "test" };
  } else if (scenario === "step_pass") {
    const stepMs = randInt(100, 5000);
    messageDetails = { stepMs };
  } else if (scenario === "visual_pass") {
  } else {
    const steps = randInt(3, 8);
    messageDetails = { steps };
  }

  const message = JSON.stringify({
    scenario,
    timestamp: new Date(ts).toISOString(),
    region,
    accountId: acct.id,
    ...messageDetails,
    ...(errorBlock ? { status: "Failed", error: errorBlock } : { status: "Succeeded" }),
  });
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
  let errorBlock: Record<string, unknown> | null = null;
  let messageDetails: Record<string, unknown> = {};

  if (scenario === "remote_write_fail") {
    const reason = rand([
      "SigV4 signature expired",
      "Workspace not found",
      "Payload decompression failed",
      "Sample timestamp too old (>1h)",
    ]);
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
    messageDetails = { queryExpr };
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
    messageDetails = { metric };
    errorBlock = {
      code: "OutOfOrderSample",
      message: "Samples arrived with timestamps older than accepted window",
      type: "client",
    };
  } else if (scenario === "rate_limit") {
    errorBlock = {
      code: "ThrottlingException",
      message: "Ingestion rate limit exceeded",
      type: "client",
    };
  } else if (scenario === "rule_eval_fail") {
    const ruleName = rand(["HighErrorRate", "PodCrashLooping", "NodeNotReady", "DiskPressure"]);
    const ruleGroup = rand(["kubernetes-alerts", "sre-slos", "infrastructure"]);
    messageDetails = { ruleName, ruleGroup };
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
    messageDetails = { queryExpr, resultCount };
  } else if (scenario === "rule_eval_ok") {
    const ruleGroup = rand(["kubernetes-alerts", "sre-slos", "infrastructure"]);
    const rules = randInt(5, 50);
    messageDetails = { ruleGroup, rules };
  } else if (scenario === "ruler_reload") {
  } else if (scenario === "workspace_describe") {
  } else {
    const scraper = rand([
      "prometheus-k8s-0",
      "grafana-agent-01",
      "otel-collector",
      "adot-collector",
    ]);
    messageDetails = { scraper };
  }

  const message = JSON.stringify({
    scenario,
    timestamp: new Date(ts).toISOString(),
    region,
    accountId: acct.id,
    ...messageDetails,
    ...(errorBlock ? { status: "Failed", error: errorBlock } : { status: "Succeeded" }),
  });
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
  generateGwlbLog,
  generateElbClassicLog,
  generateMediaConnectLog,
  generateMediaPackageLog,
  generateMediaTailorLog,
  generateIvsLog,
  generateIvsChatLog,
  generateDirectoryServiceLog,
  generateAcmpcaLog,
  generateMgnLog,
  generateCwSyntheticsLog,
  generateManagedPrometheusLog,
};
