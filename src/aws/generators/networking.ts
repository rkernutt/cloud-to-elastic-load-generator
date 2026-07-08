import {
  rand,
  randInt,
  randFloat,
  randId,
  randHexId,
  randIp,
  randPublicIp,
  randPrivateIp,
  randAccount,
  randUUID,
  REGIONS,
  ACCOUNTS,
  USER_AGENTS,
  HTTP_METHODS,
  HTTP_PATHS,
  PROTOCOLS,
  randAppDomain,
  randFqdn,
  randVpcCidr16,
} from "../../helpers";
import { randAttackerHost, randTargetHost } from "../../helpers/identity.js";
import type { EcsDocument } from "./types.js";

const GEO_LOCATIONS = [
  {
    country_iso_code: "US",
    country_name: "United States",
    city_name: "Ashburn",
    location: { lat: 39.0438, lon: -77.4874 },
  },
  {
    country_iso_code: "US",
    country_name: "United States",
    city_name: "Seattle",
    location: { lat: 47.6062, lon: -122.3321 },
  },
  {
    country_iso_code: "US",
    country_name: "United States",
    city_name: "New York",
    location: { lat: 40.7128, lon: -74.006 },
  },
  {
    country_iso_code: "US",
    country_name: "United States",
    city_name: "Dallas",
    location: { lat: 32.7767, lon: -96.797 },
  },
  {
    country_iso_code: "US",
    country_name: "United States",
    city_name: "San Francisco",
    location: { lat: 37.7749, lon: -122.4194 },
  },
  {
    country_iso_code: "GB",
    country_name: "United Kingdom",
    city_name: "London",
    location: { lat: 51.5074, lon: -0.1278 },
  },
  {
    country_iso_code: "DE",
    country_name: "Germany",
    city_name: "Frankfurt",
    location: { lat: 50.1109, lon: 8.6821 },
  },
  {
    country_iso_code: "FR",
    country_name: "France",
    city_name: "Paris",
    location: { lat: 48.8566, lon: 2.3522 },
  },
  {
    country_iso_code: "JP",
    country_name: "Japan",
    city_name: "Tokyo",
    location: { lat: 35.6762, lon: 139.6503 },
  },
  {
    country_iso_code: "AU",
    country_name: "Australia",
    city_name: "Sydney",
    location: { lat: -33.8688, lon: 151.2093 },
  },
  {
    country_iso_code: "CA",
    country_name: "Canada",
    city_name: "Toronto",
    location: { lat: 43.6532, lon: -79.3832 },
  },
  {
    country_iso_code: "IN",
    country_name: "India",
    city_name: "Mumbai",
    location: { lat: 19.076, lon: 72.8777 },
  },
  {
    country_iso_code: "BR",
    country_name: "Brazil",
    city_name: "São Paulo",
    location: { lat: -23.5505, lon: -46.6333 },
  },
  {
    country_iso_code: "SG",
    country_name: "Singapore",
    city_name: "Singapore",
    location: { lat: 1.3521, lon: 103.8198 },
  },
  {
    country_iso_code: "CN",
    country_name: "China",
    city_name: "Beijing",
    location: { lat: 39.9042, lon: 116.4074 },
  },
  {
    country_iso_code: "RU",
    country_name: "Russia",
    city_name: "Moscow",
    location: { lat: 55.7558, lon: 37.6173 },
  },
  {
    country_iso_code: "NL",
    country_name: "Netherlands",
    city_name: "Amsterdam",
    location: { lat: 52.3676, lon: 4.9041 },
  },
  {
    country_iso_code: "SE",
    country_name: "Sweden",
    city_name: "Stockholm",
    location: { lat: 59.3293, lon: 18.0686 },
  },
  {
    country_iso_code: "KR",
    country_name: "South Korea",
    city_name: "Seoul",
    location: { lat: 37.5665, lon: 126.978 },
  },
  {
    country_iso_code: "ZA",
    country_name: "South Africa",
    city_name: "Johannesburg",
    location: { lat: -26.2041, lon: 28.0473 },
  },
];

function generateAlbLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const method = rand(HTTP_METHODS);
  const path = rand(HTTP_PATHS);
  const isErr = Math.random() < er;
  const status = isErr
    ? rand([400, 403, 404, 500, 502, 503, 504])
    : rand([200, 200, 200, 201, 204, 301]);
  const is5xx = status >= 500;
  const reqProc = Number(randFloat(0.001, is5xx ? 2 : isErr ? 0.5 : 0.2));
  const backendProc = Number(randFloat(0.01, is5xx ? 30 : isErr ? 3 : 2));
  const respProc = Number(randFloat(0.001, 0.1));
  const lbName = `app/prod-alb-${region}/${randId(16).toLowerCase()}`;
  const tgArn = `arn:aws:elasticloadbalancing:${region}:${acct.id}:targetgroup/tg-${rand(["web", "api", "admin"])}/${randId(16).toLowerCase()}`;
  const az = `${region}${rand(["a", "b", "c"])}`;
  const backendIp = randPrivateIp();
  const backendPort = randInt(3000, 9000);
  const certArn =
    `arn:aws:acm:${region}:${acct.id}:certificate/${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`.toLowerCase();
  const isSuspicious = isErr && Math.random() < 0.15;
  const clientGeo = rand(GEO_LOCATIONS);
  const clientIp = randPublicIp();
  const clientPort = randInt(1024, 65535);
  const domain = randAppDomain();
  const receivedBytes = randInt(200, 8000);
  const sentBytes = randInt(500, 50000);
  const ua = rand(USER_AGENTS);
  const traceId = `Root=1-${Math.floor(new Date(ts).getTime() / 1000).toString(16)}-${randHexId(24)}`;
  const matchedRulePriority = String(rand([1, 2, 3, 4, 5, 10, "default"]));
  const targetDown = is5xx && Math.random() < 0.25;
  const targetField = targetDown ? "-" : `${backendIp}:${backendPort}`;
  const elbStatusCode = status;
  const targetStatusCode = targetDown ? "-" : String(status);
  const requestLine = `${method} https://${domain}:443${path} HTTP/1.1`;
  const actionsExecuted =
    isErr && status >= 500
      ? rand(["forward", "fixed-response"])
      : rand(["forward", "forward", "forward", "authenticate-cognito"]);
  const redirectUrl = status >= 300 && status < 400 ? `https://${domain}/new` : "-";
  const elbAccessErrorReason =
    isErr && status >= 500
      ? rand([
          "TargetConnectionError",
          "TargetResponseError",
          "TargetTimeout",
          "ELBInternalError",
          "RequestTimeout",
        ])
      : "-";
  const targetPortList = targetField === "-" ? "-" : `"${backendIp}:${backendPort}"`;
  const targetStatusCodeList = targetDown ? "-" : `"${status}"`;
  const classification = isSuspicious ? "SUSPICIOUS" : "NORMAL";
  const classificationReason = isSuspicious
    ? rand(["AmbiguousUri", "BadContentLength", "DuplicateHeader"])
    : "-";
  const albTime = new Date(ts).toISOString();
  const requestCreationTime = albTime;
  const q = (s: string) => `"${s.replace(/"/g, "'")}"`;
  const albRawLine = [
    "https",
    albTime,
    lbName,
    `${clientIp}:${clientPort}`,
    targetField,
    String(reqProc),
    String(backendProc),
    String(respProc),
    String(elbStatusCode),
    targetStatusCode,
    String(receivedBytes),
    String(sentBytes),
    q(requestLine),
    q(ua),
    "TLS_AES_128_GCM_SHA256",
    "TLSv1.3",
    tgArn,
    q(traceId),
    q(domain),
    q(certArn),
    matchedRulePriority,
    requestCreationTime,
    q(`[${actionsExecuted}]`),
    redirectUrl === "-" ? q("-") : q(redirectUrl),
    elbAccessErrorReason === "-" ? q("-") : q(elbAccessErrorReason),
    targetPortList,
    targetStatusCodeList,
    q(classification),
    classificationReason === "-" ? q("-") : q(classificationReason),
  ].join(" ");
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "alb" },
    },
    aws: {
      dimensions: {
        LoadBalancer: lbName,
        TargetGroup: tgArn.replace(/.*targetgroup\//, "targetgroup/"),
        AvailabilityZone: az,
      },
      elb: {
        name: lbName,
        type: "application",
        "target_group.arn": tgArn,
        listener: `arn:aws:elasticloadbalancing:${region}:${acct.id}:listener/app/prod-alb/${randId(16).toLowerCase()}/${randId(16).toLowerCase()}`,
        protocol: "HTTPS",
        "request_processing_time.sec": reqProc,
        "backend_processing_time.sec": backendProc,
        "response_processing_time.sec": respProc,
        "backend.ip": backendIp,
        "backend.port": String(backendPort),
        "backend.http.response.status_code": status,
        ssl_protocol: "TLSv1.3",
        ssl_cipher: "TLS_AES_128_GCM_SHA256",
        tls_named_group: "x25519",
        "chosen_cert.arn": certArn,
        trace_id: traceId,
        matched_rule_priority: matchedRulePriority,
        action_executed: actionsExecuted,
        target_port: targetField === "-" ? undefined : `${backendIp}:${backendPort}`,
        target_status_code: targetStatusCode,
        classification,
        ...(isSuspicious ? { classification_reason: classificationReason } : {}),
        "error.reason": elbAccessErrorReason === "-" ? undefined : elbAccessErrorReason,
      },
    },
    http: {
      request: {
        method,
        bytes: receivedBytes,
        referrer:
          Math.random() < 0.2
            ? rand([
                "https://www.google.com/",
                `https://${randAppDomain()}/`,
                "https://console.aws.amazon.com/",
              ])
            : undefined,
      },
      response: { status_code: status, bytes: sentBytes },
    },
    url: { path, domain },
    client: {
      ip: clientIp,
      port: clientPort,
      geo: {
        country_iso_code: clientGeo.country_iso_code,
        country_name: clientGeo.country_name,
        city_name: clientGeo.city_name,
        location: clientGeo.location,
      },
    },
    user_agent: { original: ua },
    event: {
      duration: (reqProc + backendProc + respProc) * 1e9,
      outcome: status >= 400 ? "failure" : "success",
      category: ["web", "network"],
      type: ["access"],
      dataset: "aws.elb_logs",
      provider: "elasticloadbalancing.amazonaws.com",
    },
    message: albRawLine,
    log: { level: status >= 500 ? "error" : status >= 400 ? "warn" : "info" },
    ...(status >= 500
      ? {
          error: {
            code: rand([
              "TargetTimeoutException",
              "TargetGroupNotFoundException",
              "TooManyRequestsException",
              "DependencyAccessDeniedException",
              "InvalidConfigurationRequestException",
            ]),
            message: rand([
              "Target failed to respond within the load balancer idle timeout",
              "Registered target group ARN could not be resolved for this listener rule",
              "Request rate exceeded throttle limits for this load balancer",
              "ELB lacks permission to authenticate with the configured OIDC provider",
              "Listener default action configuration violated AWS validation constraints",
            ]),
            type: "aws",
          },
        }
      : status >= 400
        ? {
            error: {
              code: "ClientError",
              message: `HTTP ${status}`,
              type: "server",
            },
          }
        : {}),
  };
}

function generateNlbLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const proto = rand(["TCP", "TLS", "UDP"]);
  const port = rand([443, 80, 22, 3306, 5432, 6379, 8080]);
  const status = isErr ? rand(["connection_error", "timeout", "target_not_found"]) : "success";
  const lbName = `net/prod-nlb-${region}/${randId(16).toLowerCase()}`;
  const connDuration = randInt(1, isErr ? 30000 : 5000);
  const bytes = randInt(64, 1048576);
  const targetIp = randPrivateIp();
  const srcGeo = rand(GEO_LOCATIONS);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "nlb" },
    },
    aws: {
      dimensions: {
        LoadBalancer: lbName,
        TargetGroup: `targetgroup/tg-${rand(["web", "api", "admin"])}/${randId(16).toLowerCase()}`,
        AvailabilityZone: `${region}${rand(["a", "b", "c"])}`,
      },
      elb: {
        name: lbName,
        type: "network",
        listener: `arn:aws:elasticloadbalancing:${region}:${acct.id}:listener/net/prod-nlb/${randId(16).toLowerCase()}/${randId(16).toLowerCase()}`,
        protocol: proto,
        "connection_time.ms": connDuration,
        ssl_cipher: proto === "TLS" ? "TLS_AES_128_GCM_SHA256" : undefined,
        ssl_protocol: proto === "TLS" ? "TLSv1.3" : undefined,
        "backend.ip": targetIp,
        "backend.port": String(port),
        "error.reason": isErr ? status : undefined,
        received_bytes: bytes,
        sent_bytes: randInt(64, 1048576),
      },
    },
    source: {
      ip: randPublicIp(),
      port: randInt(1024, 65535),
      geo: {
        country_iso_code: srcGeo.country_iso_code,
        country_name: srcGeo.country_name,
        city_name: srcGeo.city_name,
        location: srcGeo.location,
      },
    },
    network: { transport: proto.toLowerCase(), bytes },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["network"],
      type: ["connection"],
      dataset: "aws.elb_logs",
      provider: "elasticloadbalancing.amazonaws.com",
      duration: connDuration * 1e6,
    },
    message: isErr
      ? `NLB ${proto}:${port} connection ${status}`
      : `NLB ${proto}:${port} ${bytes}B in ${connDuration}ms`,
    log: { level: isErr ? "warn" : "info" },
    ...(isErr
      ? { error: { code: status, message: `NLB connection ${status}`, type: "network" } }
      : {}),
  };
}

function generateCloudFrontLog(ts: string, er: number): EcsDocument {
  const acct = randAccount();
  const isErr = Math.random() < er;
  const status = isErr ? rand([400, 403, 404, 500, 503]) : rand([200, 200, 200, 304, 301]);
  const edges = [
    "IAD89",
    "LHR62",
    "FRA56",
    "NRT57",
    "SYD4",
    "SIN52",
    "CDG50",
    "AMS1",
    "GRU3",
    "BOM78",
  ];
  const edge = rand(edges);
  const paths = [
    "/index.html",
    "/assets/app.js",
    "/assets/style.css",
    "/images/hero.webp",
    "/fonts/inter.woff2",
  ];
  const path = rand(paths);
  const distId = `E${randId(13).toUpperCase()}`; // CloudFront distribution IDs are uppercase
  const timeTaken = Number(randFloat(0.001, isErr ? 5 : 0.5));
  const bytes = randInt(500, 500000);
  const clientIp = randPublicIp();
  const clientGeo = rand(GEO_LOCATIONS);
  const edgeResultType = isErr ? "Error" : rand(["Hit", "Miss", "RefreshHit", "Redirect"]);
  const edgeResponseResultType = isErr ? "Error" : rand(["Hit", "Miss", "RefreshHit", "Redirect"]);
  const edgeDetailedResultType = isErr
    ? rand(["Error", "AbortedOrigin", "OriginDNSError", "OriginConnectError"])
    : rand(["Hit", "Miss", "RefreshHit", "Redirect"]);
  const cookies = rand(["", `session=${randId(12).toLowerCase()}`, "user=guest"]);
  const cfDomain = `d${randId(12).toLowerCase()}.cloudfront.net`;
  const du = new Date(ts);
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const cfDate = `${du.getUTCFullYear()}-${pad2(du.getUTCMonth() + 1)}-${pad2(du.getUTCDate())}`;
  const cfTime = `${pad2(du.getUTCHours())}:${pad2(du.getUTCMinutes())}:${pad2(du.getUTCSeconds())}`;
  const csMethod = "GET";
  const csBytes = randInt(0, 1000);
  const xForwardedFor = Math.random() < 0.45 ? `${clientIp}, ${randPublicIp()}` : clientIp;
  const sslProtocol = "TLSv1.3";
  const sslCipher = "TLS_AES_128_GCM_SHA256";
  const cfExtendedLine = [
    cfDate,
    cfTime,
    edge,
    String(bytes),
    clientIp,
    csMethod,
    cfDomain,
    path,
    String(status),
    edgeResultType,
    edgeResponseResultType,
    String(timeTaken),
    xForwardedFor,
    sslProtocol,
    sslCipher,
    edgeDetailedResultType,
  ].join("\t");
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region: "us-east-1",
      account: { id: acct.id, name: acct.name },
      service: { name: "cloudfront" },
    },
    aws: {
      dimensions: { DistributionId: distId, Region: "Global" },
      cloudfront: {
        domain: cfDomain,
        edge_location: edge,
        edge_result_type: edgeResultType,
        edge_response_result_type: edgeResponseResultType,
        edge_detailed_result_type: edgeDetailedResultType,
        time_to_first_byte: timeTaken,
        range_start: null,
        range_end: null,
        cookies: cookies || undefined,
        "x-edge-location": edge,
        "sc-bytes": bytes,
        "c-ip": clientIp,
        "cs-method": csMethod,
        "cs(Host)": cfDomain,
        "cs-uri-stem": path,
        "sc-status": status,
        "x-edge-result-type": edgeResultType,
        "x-edge-response-result-type": edgeResponseResultType,
        "time-taken": timeTaken,
        "x-forwarded-for": xForwardedFor,
        "ssl-protocol": sslProtocol,
        "ssl-cipher": sslCipher,
        "x-edge-detailed-result-type": edgeDetailedResultType,
      },
    },
    http: {
      request: { method: "GET", bytes: csBytes },
      response: { status_code: status, bytes },
    },
    url: { path, domain: cfDomain },
    client: {
      ip: clientIp,
      geo: {
        country_iso_code: clientGeo.country_iso_code,
        country_name: clientGeo.country_name,
        city_name: clientGeo.city_name,
        location: clientGeo.location,
      },
    },
    event: {
      outcome: status >= 400 ? "failure" : "success",
      category: ["web", "network"],
      type: ["access"],
      dataset: "aws.cloudfront_logs",
      provider: "cloudfront.amazonaws.com",
      duration: Math.round(timeTaken * 1e9),
    },
    message: cfExtendedLine,
    log: { level: status >= 500 ? "error" : status >= 400 ? "warn" : "info" },
    ...(status >= 500
      ? {
          error: {
            code: rand([
              "AccessDenied",
              "NoSuchOrigin",
              "TooManyRequests",
              "InvalidViewerCertificate",
              "OriginSslProtocolError",
            ]),
            message: rand([
              "Origin refused request — S3 OAI/OAC signature mismatch or OAI disabled",
              "Configured origin DNS name failed to resolve at CloudFront edge",
              "Lambda@Edge throttle triggered for this viewer request burst",
              "Viewer certificate ARN is missing or revoked in ACM",
              "Origin closed TLS handshake with unsupported cipher/protocol offer",
            ]),
            type: "aws",
          },
        }
      : status >= 400
        ? {
            error: {
              code: status === 403 ? "AccessDenied" : "BadRequest",
              message: `HTTP ${status} from CloudFront edge`,
              type: "aws",
            },
          }
        : {}),
  };
}

function generateWafLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isBlock = Math.random() < er;
  const rules = [
    "AWSManagedRulesCommonRuleSet",
    "AWSManagedRulesKnownBadInputsRuleSet",
    "AWSManagedRulesSQLiRuleSet",
    "AWSManagedRulesLinuxRuleSet",
    "AWSManagedRulesUnixRuleSet",
    "AWSManagedRulesWindowsRuleSet",
    "AWSManagedRulesPHPRuleSet",
    "AWSManagedRulesWordPressRuleSet",
    "IPRateBasedRule",
    "GeoBlockRule",
    "CustomSQLiRule",
  ];
  const rule = rand(rules);
  const webAclName = rand(["prod-waf", "api-waf", "admin-waf"]);
  const webaclId = randUUID();
  const uri = rand(HTTP_PATHS);
  const method = rand(HTTP_METHODS);
  const clientIp = randPublicIp();
  const ua = rand(USER_AGENTS);
  const clientGeo = rand(GEO_LOCATIONS);
  const lbId = `${acct.id}-app/${webAclName}/${randId(16).toLowerCase()}`;
  const terminatingRuleId = rand([
    "NoUserAgent_HEADER",
    "SQLi_Args",
    "CrossSiteScripting",
    "GenericRFI_BODY",
    "GenericLFI_URIPATH",
    "BadBot",
    "SizeRestrictions_BODY",
    "IPRateBasedRule",
    "GeoBlockRule",
    "RateLimit_IP",
  ]);
  const terminatingRuleType =
    rule === "IPRateBasedRule" || terminatingRuleId === "IPRateBasedRule"
      ? "RATE_BASED"
      : rule.startsWith("AWSManaged")
        ? "MANAGED_RULE_GROUP"
        : "GROUP";
  const action = isBlock ? "BLOCK" : "ALLOW";
  const httpHeaders = [
    { name: "Host", value: randAppDomain() },
    { name: "User-Agent", value: ua },
    { name: "Accept", value: "*/*" },
  ];
  const httpRequest = {
    clientIp,
    country: clientGeo.country_iso_code,
    headers: httpHeaders,
    httpMethod: method,
    httpVersion: "HTTP/1.1",
    uri: uri.startsWith("/") ? uri : `/${uri}`,
  };
  const rateBasedRuleList =
    rule === "IPRateBasedRule" || terminatingRuleId === "IPRateBasedRule"
      ? [
          {
            rateBasedRuleId: "IPRateBasedRule",
            rateLimitKey: "IP",
            limitKey: clientIp,
            maxRateAllowed: 2000,
          },
        ]
      : [];
  const nonTerminatingMatchingRules =
    !isBlock && Math.random() < 0.35
      ? [{ ruleId: "SizeRestrictions_BODY", action: "COUNT", ruleMatchDetails: [] }]
      : [];
  const requestHeadersInserted: { name: string; value: string }[] = [];
  const responseCodeSent = isBlock ? 403 : 200;
  const wafNative = {
    timestamp: ts,
    formatVersion: 1,
    webaclId,
    terminatingRuleId,
    terminatingRuleType,
    action,
    httpRequest,
    httpSourceId: lbId,
    rateBasedRuleList,
    nonTerminatingMatchingRules,
    requestHeadersInserted,
    responseCodeSent,
  };
  return {
    "@timestamp": ts,
    host: { name: randTargetHost() },
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "waf" },
    },
    aws: {
      dimensions: { WebACL: webAclName, Rule: rule, Region: region },
      waf: {
        id: randUUID(),
        arn: `arn:aws:wafv2:${region}:${acct.id}:regional/webacl/${webAclName}/${webaclId}`,
        format_version: "1",
        source: { name: "ALB", id: lbId },
        rule_group_list: [
          {
            ruleGroupId: rule,
            terminatingRule: isBlock
              ? { action: "BLOCK", ruleId: rule, ruleMatchDetails: [] }
              : undefined,
            nonTerminatingMatchingRules: [],
          },
        ],
        non_terminating_matching_rules: [],
        terminating_rule_match_details: [],
        request: {
          headers: httpHeaders,
        },
        labels: isBlock ? [{ name: `awswaf:managed:aws:${rule.toLowerCase()}` }] : [],
        response_code_sent: isBlock ? 403 : undefined,
        webaclId,
        terminatingRuleId,
        terminatingRuleType,
        action,
        httpRequest,
        httpSourceId: lbId,
        rateBasedRuleList,
        nonTerminatingMatchingRules,
        requestHeadersInserted,
        responseCodeSent,
      },
    },
    rule: {
      id: terminatingRuleId,
      ruleset: rule,
    },
    http: { request: { method, bytes: randInt(100, 10000) } },
    url: { path: uri },
    source: {
      ip: clientIp,
      geo: {
        country_iso_code: clientGeo.country_iso_code,
        country_name: clientGeo.country_name,
        city_name: clientGeo.city_name,
        location: clientGeo.location,
      },
    },
    client: {
      ip: clientIp,
      geo: {
        country_iso_code: clientGeo.country_iso_code,
        country_name: clientGeo.country_name,
        city_name: clientGeo.city_name,
        location: clientGeo.location,
      },
    },
    user_agent: { original: ua },
    event: {
      action: isBlock ? "block" : "allow",
      outcome: isBlock ? "failure" : "success",
      category: ["intrusion_detection", "network"],
      type: ["info"],
      dataset: "aws.waf",
      provider: "wafv2.amazonaws.com",
      duration: randInt(1, isBlock ? 500 : 50) * 1e6,
    },
    message: JSON.stringify(wafNative),
    log: { level: isBlock ? "warn" : "info" },
    ...(isBlock
      ? {
          error: {
            code: "WAFBlock",
            message: `Request blocked by rule: ${rule}`,
            type: "security",
          },
        }
      : {}),
  };
}

function generateWafv2Log(ts: string, er: number) {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const webAcl = rand(["prod-api-acl", "cdn-waf", "admin-portal-waf", "regional-waf"]);
  const webaclId = randUUID();
  const action = isErr ? rand(["BLOCK", "CAPTCHA", "COUNT"]) : rand(["ALLOW", "ALLOW", "BLOCK"]);
  const ruleGroup = rand([
    "AWSManagedRulesCommonRuleSet",
    "AWSManagedRulesSQLiRuleSet",
    "AWSManagedRulesKnownBadInputsRuleSet",
    "AWSManagedRulesLinuxRuleSet",
    "AWSManagedRulesWindowsRuleSet",
    "AWSManagedRulesPHPRuleSet",
    "AWSManagedRulesWordPressRuleSet",
    "IPRateBasedRule",
    "GeoBlockRule",
    "CustomSQLiRule",
  ]);
  const terminatingRuleId = rand([
    "SQLi_Args",
    "CrossSiteScripting",
    "GenericRFI_BODY",
    "GenericLFI_URIPATH",
    "BadBot",
    "NoUserAgent",
    "UserAgent_BadBots_HEADER",
    "SizeRestrictions_BODY",
    "IPRateBasedRule",
    "GeoBlockRule",
  ]);
  const uri = rand(HTTP_PATHS);
  const method = rand(HTTP_METHODS);
  const ip = randPublicIp();
  const ua = rand(USER_AGENTS);
  const srcGeo = rand(GEO_LOCATIONS);
  const isBlock = action === "BLOCK" || action === "CAPTCHA";
  const labelNames = isBlock
    ? [
        rand([
          "awswaf:managed:aws:core-rule-set:CrossSiteScripting",
          "awswaf:managed:aws:sql-database:SQLi_Args",
          "awswaf:managed:aws:known-bad-inputs:NoUserAgent_HEADER",
        ]),
      ]
    : [];
  const httpSourceId = `${acct.id}-app/${webAcl}/${randId(16).toLowerCase()}`;
  const httpHeaders = [
    { name: "Host", value: randAppDomain() },
    { name: "User-Agent", value: ua },
    { name: "Accept", value: "*/*" },
  ];
  const httpRequest = {
    clientIp: ip,
    country: srcGeo.country_iso_code,
    headers: httpHeaders,
    httpMethod: method,
    httpVersion: "HTTP/1.1",
    uri: uri.startsWith("/") ? uri : `/${uri}`,
  };
  const terminatingRuleType =
    ruleGroup === "IPRateBasedRule" || terminatingRuleId === "IPRateBasedRule"
      ? "RATE_BASED"
      : ruleGroup.startsWith("AWSManaged")
        ? "MANAGED_RULE_GROUP"
        : "GROUP";
  const rateBasedRuleList =
    ruleGroup === "IPRateBasedRule" || terminatingRuleId === "IPRateBasedRule"
      ? [
          {
            rateBasedRuleId: "IPRateBasedRule",
            rateLimitKey: "IP",
            limitKey: ip,
            maxRateAllowed: 5000,
          },
        ]
      : [];
  const nonTerminatingMatchingRules =
    action === "COUNT" || (!isBlock && Math.random() < 0.3)
      ? [{ ruleId: "GeoBlockRule", action: "COUNT", ruleMatchDetails: [] }]
      : [];
  const requestHeadersInserted: { name: string; value: string }[] = [];
  const responseCodeSent =
    action === "BLOCK" ? 403 : action === "CAPTCHA" ? 405 : action === "COUNT" ? 200 : 200;
  const wafNative = {
    timestamp: ts,
    formatVersion: 1,
    webaclId,
    terminatingRuleId,
    terminatingRuleType,
    action,
    httpRequest,
    httpSourceId,
    rateBasedRuleList,
    nonTerminatingMatchingRules,
    requestHeadersInserted,
    responseCodeSent,
  };
  return {
    "@timestamp": ts,
    host: { name: randTargetHost() },
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "wafv2" },
    },
    aws: {
      dimensions: { WebACL: webAcl, Rule: terminatingRuleId, Region: region },
      waf: {
        id: randUUID(),
        arn: `arn:aws:wafv2:${region}:${acct.id}:regional/webacl/${webAcl}/${webaclId}`,
        format_version: "1",
        source: {
          name: rand(["ALB", "APIGW", "CF"]),
          id: httpSourceId,
        },
        rule_group_list: [
          {
            ruleGroupId: ruleGroup,
            terminatingRule: isBlock
              ? { action, ruleId: terminatingRuleId, ruleMatchDetails: [] }
              : undefined,
            nonTerminatingMatchingRules: [],
          },
        ],
        non_terminating_matching_rules: [],
        terminating_rule_match_details: [],
        request: {
          headers: httpHeaders,
        },
        labels: labelNames.map((n) => ({ name: n })),
        response_code_sent: isBlock ? 403 : undefined,
        webaclId,
        terminatingRuleId,
        terminatingRuleType,
        action,
        httpRequest,
        httpSourceId,
        rateBasedRuleList,
        nonTerminatingMatchingRules,
        requestHeadersInserted,
        responseCodeSent,
      },
    },
    source: {
      ip,
      geo: {
        country_iso_code: srcGeo.country_iso_code,
        country_name: srcGeo.country_name,
        city_name: srcGeo.city_name,
        location: srcGeo.location,
      },
    },
    http: { request: { method, bytes: randInt(100, 10000) } },
    url: { path: uri },
    user_agent: { original: ua },
    event: {
      action: action.toLowerCase(),
      outcome: action === "ALLOW" ? "success" : "failure",
      category: ["intrusion_detection", "network"],
      type: ["info"],
      dataset: "aws.waf",
      provider: "wafv2.amazonaws.com",
      duration: randInt(1, isBlock ? 500 : 50) * 1e6,
    },
    message: JSON.stringify(wafNative),
    log: { level: isBlock ? "warn" : "info" },
    ...(isBlock
      ? { error: { code: "WAFBlock", message: "WAFv2 request blocked", type: "security" } }
      : {}),
  };
}

function generateRoute53Log(ts: string, er: number) {
  const acct = randAccount();
  const isErr = Math.random() < er;
  const domains = [
    randFqdn("api"),
    randFqdn("www"),
    randFqdn("mail"),
    "app.internal",
    "db.internal",
    "s3.amazonaws.com",
  ];
  const types = ["A", "AAAA", "CNAME", "MX", "TXT", "SRV"];
  const rcode = isErr ? rand(["NXDOMAIN", "SERVFAIL", "REFUSED"]) : "NOERROR";
  const hostedZoneId = `Z${randId(21)}`;
  const srcIp = randPublicIp();
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region: "us-east-1",
      account: { id: acct.id, name: acct.name },
      service: { name: "route53" },
    },
    aws: {
      dimensions: { HostedZoneId: hostedZoneId, Region: "us-east-1" },
      route53: {
        hosted_zone_id: hostedZoneId,
        edge_location: `${rand(["IAD", "LHR", "SFO"])}${randInt(50, 99)}`,
        edns_client_subnet: `${randInt(1, 254)}.${randInt(0, 255)}.0.0/24`,
      },
    },
    dns: { question: { name: rand(domains), type: rand(types) }, response_code: rcode },
    client: { ip: srcIp },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["network"],
      type: ["protocol"],
      dataset: "aws.route53_public_logs",
      provider: "route53.amazonaws.com",
      duration: randInt(1, isErr ? 500 : 50) * 1e6,
    },
    message: `${ts} ${randId(8)} ${rand(["ip4", "ip6"])} ${srcIp} ${53} ${rand(["A", "AAAA", "CNAME", "MX", "TXT", "SRV"])} ${rand([randFqdn(), randFqdn("api"), "db.internal", "s3.amazonaws.com"])}. ${rcode}`,
    log: { level: isErr ? "warn" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand(["NoSuchHostedZone", "InvalidChangeBatch", "DelegationSetInUse"]),
            message: rand([
              "NoSuchHostedZone: hosted zone referenced by change batch was not found",
              "InvalidChangeBatch: RRSet of type TXT with conflicting name already exists",
              "DelegationSetInUse: reusable delegation set is still referenced by hosted zones",
            ]),
            type: "aws",
          },
        }
      : {}),
  };
}

function generateRoute53ResolverLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const vpcId = `vpc-${randHexId(8)}`;
  const isErr = Math.random() < er;

  const internalDomains = [
    "api.payments.internal",
    "db-primary.rds.internal",
    "cache-01.redis.internal",
    "kafka-broker-1.streaming.internal",
    "vault.secrets.internal",
    "grafana.monitoring.internal",
    "registry.containers.internal",
    "auth.identity.internal",
  ];
  const externalDomains = [
    "s3.amazonaws.com",
    "dynamodb.us-east-1.amazonaws.com",
    "sqs.eu-west-2.amazonaws.com",
    "secretsmanager.us-east-1.amazonaws.com",
    "api.github.com",
    "registry.npmjs.org",
    "pypi.org",
    "hub.docker.com",
  ];
  const suspiciousDomains = [
    `c2-${randId(6).toLowerCase()}.duckdns.org`,
    `exfil-${randId(4).toLowerCase()}.ngrok.io`,
    `data.${randId(8).toLowerCase()}.xyz`,
    `tunnel-${randId(5).toLowerCase()}.serveo.net`,
  ];

  const isSuspicious = Math.random() < 0.08;
  const isInternal = !isSuspicious && Math.random() < 0.4;
  const queryName = isSuspicious
    ? rand(suspiciousDomains)
    : isInternal
      ? rand(internalDomains)
      : rand(externalDomains);

  const queryType = rand(["A", "A", "A", "AAAA", "CNAME", "PTR", "MX", "TXT", "SRV", "SOA"]);
  const rcode = isErr
    ? rand(["NXDOMAIN", "SERVFAIL", "REFUSED"])
    : isSuspicious && Math.random() < 0.5
      ? "NXDOMAIN"
      : "NOERROR";

  const srcIp = randPrivateIp();
  const srcPort = randInt(32768, 61000);
  const instanceId = `i-${randHexId(17)}`;
  const resolverEndpointId = `rslvr-in-${randHexId(12)}`;
  const resolverNetworkInterfaceId = `rni-${randHexId(12)}`;

  const hasFirewall = isSuspicious && Math.random() < 0.7;
  const firewallAction = hasFirewall ? rand(["BLOCK", "BLOCK", "ALERT"]) : undefined;
  const firewallRuleGroupId = hasFirewall ? `rslvr-frg-${randHexId(12)}` : undefined;
  const firewallDomainListId = hasFirewall ? `rslvr-fdl-${randHexId(12)}` : undefined;

  const answers =
    rcode === "NOERROR"
      ? queryType === "A"
        ? [
            {
              Rdata: `${randInt(1, 254)}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`,
              Type: "A",
              Class: "IN",
            },
          ]
        : queryType === "AAAA"
          ? [{ Rdata: `2600:1f18:${randHexId(4)}::${randInt(1, 9)}`, Type: "AAAA", Class: "IN" }]
          : queryType === "CNAME"
            ? [
                {
                  Rdata: `${queryName.split(".")[0]}.elb.${region}.amazonaws.com`,
                  Type: "CNAME",
                  Class: "IN",
                },
              ]
            : []
      : [];

  const nativeLog = {
    version: "1.100000",
    account_id: acct.id,
    region,
    vpc_id: vpcId,
    query_timestamp: ts,
    query_name: `${queryName}.`,
    query_type: queryType,
    query_class: "IN",
    rcode,
    answers,
    srcaddr: srcIp,
    srcport: String(srcPort),
    transport: rand(["UDP", "UDP", "UDP", "TCP"]),
    srcids: {
      instance: instanceId,
      resolver_endpoint: resolverEndpointId,
      resolver_network_interface: resolverNetworkInterfaceId,
    },
    ...(hasFirewall
      ? {
          firewall_rule_group_id: firewallRuleGroupId,
          firewall_rule_action: firewallAction,
          firewall_domain_list_id: firewallDomainListId,
        }
      : {}),
  };

  const eventCategory: string[] = ["network"];
  if (hasFirewall) eventCategory.push("intrusion_detection");

  return {
    "@timestamp": ts,
    host: { name: randTargetHost() },
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "route53resolver" },
      instance: { id: instanceId },
    },
    aws: {
      dimensions: { VpcId: vpcId, Region: region },
      route53_resolver: {
        ...nativeLog,
      },
    },
    dns: {
      question: { name: queryName, type: queryType, class: "IN" },
      response_code: rcode,
      ...(answers.length > 0
        ? {
            answers: answers.map((a) => ({
              data: a.Rdata,
              type: a.Type,
              class: a.Class,
            })),
          }
        : {}),
    },
    source: { ip: srcIp, port: srcPort },
    network: { transport: nativeLog.transport.toLowerCase(), protocol: "dns" },
    ...(hasFirewall
      ? {
          rule: {
            id: firewallRuleGroupId,
            name: `DNS Firewall ${firewallAction}`,
            category: "dns_firewall",
            ruleset: firewallDomainListId,
          },
        }
      : {}),
    event: {
      outcome: rcode === "NOERROR" && !hasFirewall ? "success" : "failure",
      category: eventCategory,
      type: hasFirewall && firewallAction === "BLOCK" ? ["denied"] : ["protocol", "info"],
      dataset: "aws.route53_resolver_logs",
      provider: "route53resolver.amazonaws.com",
      duration: randInt(1, isErr ? 2000 : 50) * 1e6,
    },
    message: `Route 53 Resolver: ${queryType} ${queryName} → ${rcode}${hasFirewall ? ` [DNS Firewall: ${firewallAction}]` : ""} from ${srcIp} in ${vpcId}`,
    log: { level: hasFirewall && firewallAction === "BLOCK" ? "error" : isErr ? "warn" : "info" },
    ...(hasFirewall && firewallAction === "BLOCK"
      ? {
          error: {
            code: "DNSFirewallBlock",
            message: `DNS Firewall blocked query for ${queryName}`,
            type: "dns_firewall",
          },
        }
      : {}),
    labels: {
      ...(isSuspicious ? { dns_threat_indicator: "suspicious_domain" } : {}),
    },
  };
}

/**
 * generateDnsC2Chain — returns 6–8 correlated Route 53 Resolver documents
 * modelling a DNS-based C2 attack lifecycle on a single host:
 *
 *   1. DGA reconnaissance  (3 NXDOMAIN lookups to random-looking domains)
 *   2. C2 establishment    (successful resolution of a DuckDNS/ngrok domain)
 *   3. Beaconing           (2 repeated queries to the C2 domain at regular intervals)
 *   4. DNS Firewall block   (firewall catches and blocks the C2 domain)
 *   5. Fallback attempt     (query to a different suspicious domain, also blocked)
 *
 * All events share the same host.name (from TARGET_HOSTS pool — same pool as
 * GuardDuty, IAM PrivEsc, and Data Exfil chains) and source.ip, so Attack
 * Discovery can correlate DNS C2 activity with privilege escalation and
 * data exfiltration on the same compromised host.
 */
function generateDnsC2Chain(ts: string, _er: number): EcsDocument[] {
  const region = rand(REGIONS);
  const acct = randAccount();
  const vpcId = `vpc-${randHexId(8)}`;
  const hostName = randAttackerHost();
  const srcIp = randPrivateIp();
  const srcPort = randInt(32768, 61000);
  const instanceId = `i-${randHexId(17)}`;
  const chainId = randUUID();
  const baseDate = new Date(ts);
  const resolverEndpointId = `rslvr-in-${randHexId(12)}`;

  const c2Domain = `c2-${randId(6).toLowerCase()}.duckdns.org`;
  const fallbackDomain = `exfil-${randId(4).toLowerCase()}.ngrok.io`;
  const dgaDomains = Array.from({ length: 3 }, () => `${randId(12).toLowerCase()}.xyz`);
  const firewallRuleGroupId = `rslvr-frg-${randHexId(12)}`;
  const firewallDomainListId = `rslvr-fdl-${randHexId(12)}`;

  function makeBase(offsetMs: number) {
    const t = new Date(baseDate.getTime() + offsetMs);
    return {
      "@timestamp": t.toISOString(),
      host: { name: hostName },
      cloud: {
        provider: "aws" as const,
        region,
        account: { id: acct.id, name: acct.name },
        service: { name: "route53resolver" },
        instance: { id: instanceId },
      },
      aws: { dimensions: { VpcId: vpcId, Region: region } },
      source: { ip: srcIp, port: srcPort + Math.floor(offsetMs / 1000) },
      network: { transport: "udp", protocol: "dns" },
      labels: { dns_attack_chain_id: chainId },
    };
  }

  const docs: EcsDocument[] = [];

  // Stage 1: DGA reconnaissance — 3 NXDOMAIN lookups
  dgaDomains.forEach((domain, i) => {
    const base = makeBase(i * 2000);
    docs.push({
      ...base,
      dns: { question: { name: domain, type: "A", class: "IN" }, response_code: "NXDOMAIN" },
      aws: {
        ...base.aws,
        route53_resolver: {
          version: "1.100000",
          account_id: acct.id,
          region,
          vpc_id: vpcId,
          query_timestamp: base["@timestamp"],
          query_name: `${domain}.`,
          query_type: "A",
          query_class: "IN",
          rcode: "NXDOMAIN",
          answers: [],
          srcaddr: srcIp,
          srcport: String(base.source.port),
          transport: "UDP",
          srcids: { instance: instanceId, resolver_endpoint: resolverEndpointId },
        },
      },
      event: {
        outcome: "failure",
        category: ["network"],
        type: ["protocol", "info"],
        dataset: "aws.route53_resolver_logs",
        provider: "route53resolver.amazonaws.com",
        duration: randInt(5, 30) * 1e6,
      },
      message: `Route 53 Resolver: A ${domain} → NXDOMAIN from ${srcIp} in ${vpcId}`,
      log: { level: "warn" },
      labels: { ...base.labels, dns_threat_indicator: "dga_candidate" },
    });
  });

  // Stage 2: C2 establishment — successful resolution
  const c2Ip = `198.51.100.${randInt(1, 254)}`;
  const c2Base = makeBase(8000);
  docs.push({
    ...c2Base,
    dns: {
      question: { name: c2Domain, type: "A", class: "IN" },
      response_code: "NOERROR",
      answers: [{ data: c2Ip, type: "A", class: "IN" }],
    },
    aws: {
      ...c2Base.aws,
      route53_resolver: {
        version: "1.100000",
        account_id: acct.id,
        region,
        vpc_id: vpcId,
        query_timestamp: c2Base["@timestamp"],
        query_name: `${c2Domain}.`,
        query_type: "A",
        query_class: "IN",
        rcode: "NOERROR",
        answers: [{ Rdata: c2Ip, Type: "A", Class: "IN" }],
        srcaddr: srcIp,
        srcport: String(c2Base.source.port),
        transport: "UDP",
        srcids: { instance: instanceId, resolver_endpoint: resolverEndpointId },
      },
    },
    event: {
      outcome: "success",
      category: ["network"],
      type: ["protocol", "info"],
      dataset: "aws.route53_resolver_logs",
      provider: "route53resolver.amazonaws.com",
      duration: randInt(1, 10) * 1e6,
    },
    message: `Route 53 Resolver: A ${c2Domain} → NOERROR [${c2Ip}] from ${srcIp} in ${vpcId}`,
    log: { level: "info" },
    labels: { ...c2Base.labels, dns_threat_indicator: "suspicious_domain" },
  });

  // Stage 3: Beaconing — 2 repeated queries at ~60s intervals
  [60000, 120000].forEach((offset) => {
    const beaconBase = makeBase(8000 + offset);
    docs.push({
      ...beaconBase,
      dns: {
        question: { name: c2Domain, type: "A", class: "IN" },
        response_code: "NOERROR",
        answers: [{ data: c2Ip, type: "A", class: "IN" }],
      },
      aws: {
        ...beaconBase.aws,
        route53_resolver: {
          version: "1.100000",
          account_id: acct.id,
          region,
          vpc_id: vpcId,
          query_timestamp: beaconBase["@timestamp"],
          query_name: `${c2Domain}.`,
          query_type: "A",
          query_class: "IN",
          rcode: "NOERROR",
          answers: [{ Rdata: c2Ip, Type: "A", Class: "IN" }],
          srcaddr: srcIp,
          srcport: String(beaconBase.source.port),
          transport: "UDP",
          srcids: { instance: instanceId, resolver_endpoint: resolverEndpointId },
        },
      },
      event: {
        outcome: "success",
        category: ["network"],
        type: ["protocol", "info"],
        dataset: "aws.route53_resolver_logs",
        provider: "route53resolver.amazonaws.com",
        duration: randInt(1, 10) * 1e6,
      },
      message: `Route 53 Resolver: A ${c2Domain} → NOERROR [${c2Ip}] from ${srcIp} in ${vpcId}`,
      log: { level: "info" },
      labels: { ...beaconBase.labels, dns_threat_indicator: "suspicious_domain" },
    });
  });

  // Stage 4: DNS Firewall catches and blocks the C2 domain
  const blockBase = makeBase(188000);
  docs.push({
    ...blockBase,
    dns: {
      question: { name: c2Domain, type: "A", class: "IN" },
      response_code: "NXDOMAIN",
    },
    aws: {
      ...blockBase.aws,
      route53_resolver: {
        version: "1.100000",
        account_id: acct.id,
        region,
        vpc_id: vpcId,
        query_timestamp: blockBase["@timestamp"],
        query_name: `${c2Domain}.`,
        query_type: "A",
        query_class: "IN",
        rcode: "NXDOMAIN",
        answers: [],
        srcaddr: srcIp,
        srcport: String(blockBase.source.port),
        transport: "UDP",
        srcids: { instance: instanceId, resolver_endpoint: resolverEndpointId },
        firewall_rule_group_id: firewallRuleGroupId,
        firewall_rule_action: "BLOCK",
        firewall_domain_list_id: firewallDomainListId,
      },
    },
    rule: {
      id: firewallRuleGroupId,
      name: "DNS Firewall BLOCK",
      category: "dns_firewall",
      ruleset: firewallDomainListId,
    },
    event: {
      outcome: "failure",
      category: ["network", "intrusion_detection"],
      type: ["denied"],
      dataset: "aws.route53_resolver_logs",
      provider: "route53resolver.amazonaws.com",
      duration: randInt(1, 5) * 1e6,
    },
    error: {
      code: "DNSFirewallBlock",
      message: `DNS Firewall blocked query for ${c2Domain}`,
      type: "dns_firewall",
    },
    message: `Route 53 Resolver: A ${c2Domain} → NXDOMAIN [DNS Firewall: BLOCK] from ${srcIp} in ${vpcId}`,
    log: { level: "error" },
    labels: { ...blockBase.labels, dns_threat_indicator: "suspicious_domain" },
  });

  // Stage 5: Fallback attempt — different suspicious domain, also blocked
  const fallbackBase = makeBase(195000);
  docs.push({
    ...fallbackBase,
    dns: {
      question: { name: fallbackDomain, type: "A", class: "IN" },
      response_code: "NXDOMAIN",
    },
    aws: {
      ...fallbackBase.aws,
      route53_resolver: {
        version: "1.100000",
        account_id: acct.id,
        region,
        vpc_id: vpcId,
        query_timestamp: fallbackBase["@timestamp"],
        query_name: `${fallbackDomain}.`,
        query_type: "A",
        query_class: "IN",
        rcode: "NXDOMAIN",
        answers: [],
        srcaddr: srcIp,
        srcport: String(fallbackBase.source.port),
        transport: "UDP",
        srcids: { instance: instanceId, resolver_endpoint: resolverEndpointId },
        firewall_rule_group_id: firewallRuleGroupId,
        firewall_rule_action: "BLOCK",
        firewall_domain_list_id: firewallDomainListId,
      },
    },
    rule: {
      id: firewallRuleGroupId,
      name: "DNS Firewall BLOCK",
      category: "dns_firewall",
      ruleset: firewallDomainListId,
    },
    event: {
      outcome: "failure",
      category: ["network", "intrusion_detection"],
      type: ["denied"],
      dataset: "aws.route53_resolver_logs",
      provider: "route53resolver.amazonaws.com",
      duration: randInt(1, 5) * 1e6,
    },
    error: {
      code: "DNSFirewallBlock",
      message: `DNS Firewall blocked query for ${fallbackDomain}`,
      type: "dns_firewall",
    },
    message: `Route 53 Resolver: A ${fallbackDomain} → NXDOMAIN [DNS Firewall: BLOCK] from ${srcIp} in ${vpcId}`,
    log: { level: "error" },
    labels: { ...fallbackBase.labels, dns_threat_indicator: "suspicious_domain" },
  });

  return docs.map((d) => ({ ...d, __dataset: "aws.route53_resolver_logs" }));
}

function generateNetworkFirewallLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const action = Math.random() < er ? "DROP" : "PASS";
  const proto = rand([6, 17, 1]);
  const fwName = `fw-${region}`;
  const az = `${region}${rand(["a", "b", "c"])}`;
  const srcIp = randPrivateIp();
  const dstIp = Math.random() < 0.35 ? randPublicIp() : randPrivateIp();
  const srcPort = randInt(1024, 65535);
  const dstPort = rand([80, 443, 22, 3306, 5432]);
  const flowId = randInt(100000, 999999);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "network-firewall" },
    },
    aws: {
      dimensions: {
        FirewallName: fwName,
        AvailabilityZone: az,
        CustomAction: action === "DROP" ? "CustomBlockAction" : "CustomPassAction",
      },
      firewall_logs: {
        flow_id: flowId,
        event_timestamp: ts,
        action,
        src_ip: srcIp,
        dest_ip: dstIp,
        src_port: srcPort,
        dest_port: dstPort,
        protocol: PROTOCOLS[proto] || "TCP",
        firewall_name: fwName,
        availability_zone: az,
      },
      network_firewall: {
        firewall_name: fwName,
        availability_zone: az,
        policy_name: "prod-fw-policy",
      },
    },
    source: { ip: srcIp, port: srcPort },
    destination: { ip: dstIp, port: dstPort },
    network: {
      transport: PROTOCOLS[proto]?.toLowerCase() || "tcp",
      bytes: randInt(64, 65535),
      packets: randInt(1, 50),
    },
    event: {
      action: action.toLowerCase(),
      outcome: action === "PASS" ? "success" : "failure",
      category: ["intrusion_detection", "network"],
      type: ["info"],
      dataset: "aws.firewall_logs",
      provider: "network-firewall.amazonaws.com",
      duration: randInt(1, action === "DROP" ? 200 : 50) * 1e6,
    },
    message: `${action} ${PROTOCOLS[proto] || "TCP"} flow`,
    log: { level: action === "DROP" ? "warn" : "info" },
    ...(action === "DROP"
      ? {
          error: {
            code: "FlowDropped",
            message: "Packet dropped by firewall rule",
            type: "network",
          },
        }
      : {}),
  };
}

function generateShieldLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isAttack = Math.random() < er + 0.1;
  const vectors = ["SYN_FLOOD", "UDP_REFLECTION", "HTTP_FLOOD", "DNS_AMPLIFICATION", "VOLUMETRIC"];
  const attackVector = rand(vectors);
  const attackGbps = Number(randFloat(1, 120)).toFixed(1);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "shield" },
    },
    aws: {
      dimensions: { AttackVector: isAttack ? rand(vectors) : "NONE" },
      shield: {
        attack_id: isAttack ? `${randId(8)}-${randId(4)}`.toLowerCase() : null,
        attack_vector: isAttack ? rand(vectors) : null,
        mitigation_started: isAttack,
        subscription_type: "ADVANCED",
        protected_resource: `arn:aws:elasticloadbalancing:${region}:${acct.id}:loadbalancer/app/prod/${randId(16).toLowerCase()}`,
      },
    },
    network: { bytes: randInt(1e6, 1e9), packets: randInt(1000, 1000000) },
    event: {
      action: isAttack ? "ddos_detected" : "health_check",
      outcome: isAttack ? "failure" : "success",
      category: ["intrusion_detection", "network"],
      type: ["info"],
      dataset: "aws.shield",
      provider: "shield.amazonaws.com",
      duration: randInt(1, isAttack ? 3600 : 60) * 1e9,
    },
    message: isAttack
      ? `DDoS attack detected: vector=${attackVector} magnitude=${attackGbps}Gbps pps=${randInt(1e6, 100e6)} mitigation=ACTIVE`
      : `DDoS mitigation active: 0 attacks detected in last 60s`,
    log: { level: isAttack ? "warn" : "info" },
    ...(isAttack
      ? {
          error: {
            code: "DDoSAttack",
            message: `Attack vector: ${attackVector} at ${attackGbps}Gbps - mitigation active`,
            type: "network",
          },
        }
      : {}),
  };
}

function generateGlobalAcceleratorLog(ts: string, er: number): EcsDocument {
  const acct = randAccount();
  const region = rand(REGIONS);
  const isErr = Math.random() < er;
  const ep = rand(["us-east-1-alb", "eu-west-2-alb", "us-east-1-nlb"]);
  const health = isErr ? "UNHEALTHY" : "HEALTHY";
  const rttMs = randInt(5, isErr ? 500 : 80);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "globalaccelerator" },
    },
    aws: {
      globalaccelerator: {
        accelerator_arn:
          `arn:aws:globalaccelerator::${acct.id}:accelerator/${randId(8)}`.toLowerCase(),
        listener_port: rand([80, 443]),
        protocol: rand(["TCP", "UDP"]),
        endpoint_group_region: rand(REGIONS),
        endpoint_id: ep,
        endpoint_health: health,
        client_ip: randPublicIp(),
        rtt_ms: rttMs,
        processing_time_ms: randInt(1, 20),
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["network"],
      type: ["connection"],
      dataset: "aws.globalaccelerator",
      provider: "globalaccelerator.amazonaws.com",
      duration: rttMs * 1e6,
    },
    message: isErr
      ? `Global Accelerator: ${ep} UNHEALTHY - traffic rerouting`
      : `Global Accelerator: ${ep} healthy, RTT ${rttMs}ms`,
    log: { level: isErr ? "warn" : "info" },
    ...(isErr
      ? {
          error: {
            code: "EndpointUnhealthy",
            message: `Endpoint ${ep} UNHEALTHY - traffic rerouting`,
            type: "network",
          },
        }
      : {}),
  };
}

function generateTransitGatewayLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const tgwId = `tgw-${randId(17).toLowerCase()}`;
  const action = isErr ? "drop" : rand(["accept", "accept", "accept", "blackhole"]);
  const proto = rand([6, 17, 1]);
  const tgwAttachId = `tgw-attach-${randId(17).toLowerCase()}`;
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "transitgateway" },
    },
    aws: {
      dimensions: { TransitGateway: tgwId, TransitGatewayAttachment: tgwAttachId },
      transitgateway: {
        tgw_id: tgwId,
        tgw_attachment_id: tgwAttachId,
        resource_type: rand(["vpc", "vpn", "direct-connect-gateway", "peering"]),
        src_vpc_id: `vpc-${randHexId(8)}`,
        dst_vpc_id: `vpc-${randHexId(8)}`,
        action,
        bytes: randInt(64, 65535),
        packets: randInt(1, 100),
        protocol: PROTOCOLS[proto] || "TCP",
      },
    },
    source: { ip: randPrivateIp(), port: randInt(1024, 65535) },
    destination: { ip: randPrivateIp(), port: rand([80, 443, 22, 3306, 5432]) },
    network: { transport: (PROTOCOLS[proto] || "TCP").toLowerCase(), bytes: randInt(64, 65535) },
    event: {
      action,
      outcome: action === "drop" || action === "blackhole" ? "failure" : "success",
      category: ["network"],
      type: ["connection"],
      dataset: "aws.transitgateway",
      provider: "ec2.amazonaws.com",
    },
    message: `TGW ${tgwId} ${action.toUpperCase()} ${PROTOCOLS[proto] || "TCP"} flow`,
    log: { level: action === "drop" || action === "blackhole" ? "warn" : "info" },
    ...(action === "drop" || action === "blackhole"
      ? {
          error: {
            code: "FlowDropped",
            message: `TGW ${action} - no route or blackhole`,
            type: "network",
          },
        }
      : {}),
  };
}

function generateDirectConnectLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const connId = `dxcon-${randId(8).toLowerCase()}`;
  const bandwidth = rand(["1Gbps", "10Gbps", "100Gbps"]);
  const state = isErr ? rand(["down", "deleted"]) : "available";
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "directconnect" },
    },
    aws: {
      directconnect: {
        connection_id: connId,
        connection_name: `dx-${rand(["primary", "secondary", "backup"])}`,
        bandwidth,
        connection_state: state,
        vlan: randInt(100, 4000),
        asn: randInt(64512, 65534),
        bgp_status: isErr ? "down" : "up",
        bgp_peer_ip: randIp(),
        bytes_in: randInt(0, 1e9),
        bytes_out: randInt(0, 1e9),
        location: rand(["EQC2", "DFW2", "LAX", "LHR1"]),
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["network"],
      type: ["connection"],
      dataset: "aws.directconnect",
      provider: "directconnect.amazonaws.com",
    },
    message: isErr
      ? `Direct Connect ${connId} (${bandwidth}) DOWN - BGP session lost`
      : `Direct Connect ${connId} (${bandwidth}): BGP up, ${rand(["12.4", "45.2", "123.8"])} Mbps`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: "BgpSessionDown",
            message: `Direct Connect ${connId} DOWN - BGP session lost`,
            type: "network",
          },
        }
      : {}),
  };
}

function generateVpnLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const vpnId = `vpn-${randId(8).toLowerCase()}`;
  const tunnelState = isErr ? "DOWN" : "UP";
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "vpn" },
    },
    aws: {
      vpn: {
        vpn_connection_id: vpnId,
        vpn_gateway_id: `vgw-${randId(8).toLowerCase()}`,
        customer_gateway_ip: randIp(),
        tunnel_state: tunnelState,
        tunnel_outside_ip: randIp(),
        tunnel_inside_cidr: rand(["169.254.10.0/30", "169.254.11.0/30"]),
        phase1_status: tunnelState === "UP" ? "ESTABLISHED" : "FAILED",
        phase2_status: tunnelState === "UP" ? "ESTABLISHED" : "FAILED",
        bytes_in: randInt(0, 1e8),
        bytes_out: randInt(0, 1e8),
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["network"],
      type: ["connection"],
      dataset: "aws.vpn",
      provider: "ec2.amazonaws.com",
    },
    message: isErr
      ? `Site-to-Site VPN ${vpnId} tunnel DOWN - IKE negotiation failed`
      : `Site-to-Site VPN ${vpnId} tunnel UP`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: "TunnelDown",
            message: "VPN tunnel DOWN - IKE negotiation failed",
            type: "network",
          },
        }
      : {}),
  };
}

function generatePrivateLinkLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const svcName = `com.amazonaws.vpce.${region}.${rand(["s3", "dynamodb", "execute-api", "secretsmanager", "ssm"])}`;
  const endpointId = `vpce-${randId(17).toLowerCase()}`;
  const state = isErr ? rand(["rejected", "failed"]) : rand(["available", "pending"]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "privatelink" },
    },
    aws: {
      privatelink: {
        endpoint_id: endpointId,
        service_name: svcName,
        endpoint_type: rand(["Interface", "Gateway", "GatewayLoadBalancer"]),
        vpc_id: `vpc-${randHexId(8)}`,
        state,
        private_dns_enabled: Math.random() > 0.3,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["network"],
      type: ["connection"],
      dataset: "aws.privatelink",
      provider: "ec2.amazonaws.com",
    },
    message: isErr
      ? `PrivateLink endpoint ${endpointId}: ${state} - ${rand(["Request rejected", "Service unavailable"])}`
      : `PrivateLink endpoint ${endpointId} for ${svcName}: ${state}`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: state,
            message: `PrivateLink endpoint ${endpointId}: ${state}`,
            type: "network",
          },
        }
      : {}),
  };
}

function generateNetworkManagerLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const event = rand([
    "LINK_STATUS_UP",
    "LINK_STATUS_DOWN",
    "TOPOLOGY_CHANGE",
    "ROUTE_ANALYSIS_COMPLETE",
    "CONNECTION_STATUS_UP",
    "CONNECTION_STATUS_DOWN",
  ]);
  const network = rand(["global-network-prod", "global-network-dr", "enterprise-wan"]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "networkmanager" },
    },
    aws: {
      networkmanager: {
        global_network_id: `network-${randId(17).toLowerCase()}`,
        global_network_name: network,
        event_type: event,
        device_id: `device-${randId(17).toLowerCase()}`,
        link_id: `link-${randId(17).toLowerCase()}`,
        site_id: `site-${randId(17).toLowerCase()}`,
        site_name: rand(["hq-london", "dc-us-east", "branch-tokyo", "colo-frankfurt"]),
        bandwidth_mbps: rand([10, 50, 100, 500, 1000, 10000]),
        provider: rand(["AT&T", "BT", "NTT", "Telstra", "Zayo"]),
        type: rand(["broadband", "mpls", "vpn", "direct-connect"]),
        state: isErr ? "DOWN" : "UP",
        error_code: isErr
          ? rand(["ThrottlingException", "ResourceNotFoundException", "ValidationException"])
          : null,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["network"],
      type: ["connection"],
      dataset: "aws.networkmanager",
      provider: "networkmanager.amazonaws.com",
    },
    message: isErr
      ? `Network Manager ${event} [${network}]: connection degraded`
      : `Network Manager ${event} [${network}]: ${rand(["hq-london", "dc-us-east", "branch-tokyo"])} link ${isErr ? "DOWN" : "UP"}`,
    log: { level: isErr ? "error" : event.includes("DOWN") ? "warn" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand(["ThrottlingException", "ResourceNotFoundException"]),
            message: "Network Manager connection degraded",
            type: "network",
          },
        }
      : {}),
  };
}

function generateNatGatewayLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const natId = `nat-${randHexId(17)}`;
  const privateIp = `10.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`;
  const publicIp = randPublicIp();
  const destIp = randPublicIp();
  const packets = randInt(1, 1000);
  const bytes = packets * randInt(64, 1500);
  const port = rand([80, 443, 8080, 3306, 5432, 6379, 27017]);
  const protocol = rand(["TCP", "UDP"]);
  const action = isErr ? rand(["REJECT", "ERROR"]) : "ACCEPT";
  const status = isErr
    ? rand(["connection-timeout", "no-route", "port-allocation-error"])
    : "established";
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "natgateway" },
    },
    aws: {
      dimensions: { NatGatewayId: natId },
      natgateway: {
        id: natId,
        private_ip: privateIp,
        public_ip: publicIp,
        bytes_in_from_source: bytes,
        bytes_out_to_destination: bytes,
        bytes_in_from_destination: Math.floor(bytes * randFloat(0.5, 1.5)),
        bytes_out_to_source: Math.floor(bytes * randFloat(0.5, 1.5)),
        packets_in_from_source: packets,
        packets_out_to_destination: packets,
        packets_in_from_destination: Math.floor(packets * randFloat(0.5, 1.5)),
        packets_out_to_source: Math.floor(packets * randFloat(0.5, 1.5)),
        connection_attempt_count: isErr ? randInt(1, 20) : 0,
        connection_established_count: isErr ? 0 : randInt(1, 50),
        error_port_allocation: isErr && status === "port-allocation-error" ? randInt(1, 100) : 0,
      },
    },
    source: { ip: privateIp, port: randInt(1024, 65535) },
    destination: { ip: destIp, port },
    network: { protocol: protocol.toLowerCase(), bytes, packets, direction: "egress" },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["network"],
      type: ["connection"],
      dataset: "aws.natgateway",
      provider: "natgateway.amazonaws.com",
      duration: randInt(1, 5000) * 1e6,
    },
    message: isErr
      ? `NAT Gateway ${natId}: ${status} (${protocol} ${privateIp} → ${destIp}:${port})`
      : `NAT Gateway ${natId}: ${action} ${protocol} ${privateIp}:${randInt(1024, 65535)} → ${destIp}:${port} ${bytes}B`,
    log: { level: isErr ? "warn" : "info" },
    ...(isErr
      ? { error: { code: status, message: `NAT Gateway ${action}: ${status}`, type: "network" } }
      : {}),
  };
}

function generateVpcFlowLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const action = Math.random() < er ? "REJECT" : "ACCEPT";
  const pkts = randInt(1, 100);
  const bytes = pkts * randInt(40, 1500);
  const rejectTuple = rand([
    { dstPort: 22, proto: 6, note: "ssh_from_internet_sg" },
    { dstPort: 3389, proto: 6, note: "rdp_blocked" },
    { dstPort: 5432, proto: 6, note: "postgres_wide_open" },
    { dstPort: 6379, proto: 6, note: "redis_acl" },
    { dstPort: 9092, proto: 6, note: "kafka_plaint_text" },
    { dstPort: 53, proto: 17, note: "dns_udp" },
    { dstPort: 111, proto: 6, note: "rpcbind_scan" },
  ]);
  const acceptTuple = rand([
    { dstPort: 443, proto: 6 },
    { dstPort: 80, proto: 6 },
    { dstPort: 443, proto: 17 },
    { dstPort: 22, proto: 6 },
    { dstPort: 3306, proto: 6 },
  ]);
  const picked = action === "REJECT" ? rejectTuple : acceptTuple;
  const protoNum = picked.proto;
  const src = randPrivateIp();
  const dst = Math.random() < 0.5 ? randPublicIp() : randPrivateIp();
  const dstPort = picked.dstPort;
  const srcPort =
    picked.proto === 1
      ? randInt(0, 65535)
      : action === "REJECT" && picked.dstPort <= 1024
        ? rand([randInt(1, 1023), randInt(40000, 65535)])
        : randInt(1024, 65535);
  // Geo data only applies to public IPs; private/RFC1918 addresses have no geo
  const dstIsPublic =
    !dst.startsWith("10.") &&
    !dst.startsWith("192.168.") &&
    !/^172\.(1[6-9]|2\d|3[01])\./.test(dst);
  const dstGeo = dstIsPublic ? rand(GEO_LOCATIONS) : null;
  const vpcId = `vpc-${randHexId(8)}`;
  const eni = `eni-${randHexId(8)}`;
  const subnetId = `subnet-${randHexId(8)}`;
  const instanceId = Math.random() > 0.3 ? `i-${randHexId(17)}` : undefined;
  const tsEpoch = Math.floor(new Date(ts).getTime() / 1000);
  const endEpoch = tsEpoch + randInt(1, 60);
  return {
    "@timestamp": ts,
    // host.name reflects the ENI's instance when known, matched to region
    host: {
      name: instanceId
        ? `i-${instanceId.slice(2)}.${region}.compute.internal`
        : `eni-${eni.slice(4)}.${region}.compute.internal`,
    },
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "vpc" },
    },
    aws: {
      dimensions: { VpcId: vpcId },
      vpcflow: {
        version: "2",
        account_id: acct.id,
        interface_id: eni,
        srcaddr: src,
        dstaddr: dst,
        srcport: srcPort,
        dstport: dstPort,
        protocol: String(protoNum),
        packets: pkts,
        bytes,
        start: tsEpoch,
        end: endEpoch,
        action,
        log_status: "OK",
        instance_id: instanceId,
        pkt_srcaddr: src,
        pkt_dstaddr: dst,
        vpc_id: vpcId,
        subnet_id: subnetId,
        type: "IPv4",
      },
    },
    // src is always a private IP in this generator (traffic originates from VPC ENI)
    source: {
      ip: src,
      port: srcPort,
    },
    destination: {
      ip: dst,
      port: dstPort,
      ...(dstGeo
        ? {
            geo: {
              country_iso_code: dstGeo.country_iso_code,
              country_name: dstGeo.country_name,
              city_name: dstGeo.city_name,
              location: dstGeo.location,
            },
          }
        : {}),
    },
    network: {
      transport: PROTOCOLS[protoNum]?.toLowerCase() || "tcp",
      bytes,
      packets: pkts,
      direction: rand(["inbound", "outbound"]),
    },
    event: {
      action: action.toLowerCase(),
      outcome: action === "ACCEPT" ? "success" : "failure",
      category: ["network"],
      type: action === "ACCEPT" ? ["connection"] : ["connection", "denied"],
      dataset: "aws.vpcflow",
      provider: "ec2.amazonaws.com",
      duration: randInt(1, 500) * 1e6,
    },
    message: `2 ${acct.id} ${eni} ${src} ${dst} ${srcPort} ${dstPort} ${protoNum} ${pkts} ${bytes} ${tsEpoch} ${endEpoch} ${action} OK`,
    log: { level: action === "REJECT" ? "warn" : "info" },
    ...(action === "REJECT"
      ? {
          error: {
            code: "FlowRejected",
            message: "Security group or ACL rejected flow",
            type: "network",
          },
        }
      : {}),
  };
}

function generateVpcLatticeLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const svcName = rand([
    "checkout-svc",
    "auth-svc",
    "inventory-svc",
    "payment-svc",
    "notification-svc",
  ]);
  const svcArn = `arn:aws:vpc-lattice:${region}:${acct.id}:service/${svcName}-${randId(8).toLowerCase()}`;
  const svcNetworkName = rand([
    "prod-service-network",
    "staging-service-network",
    "shared-services-network",
  ]);
  const tgId = `tg-${randId(17).toLowerCase()}`;
  const srcVpc = `vpc-${randHexId(8)}`;
  const dstVpc = `vpc-${randHexId(8)}`;
  const method = rand(HTTP_METHODS);
  const responseCode = isErr ? rand([500, 502, 503, 504]) : rand([200, 200, 200, 201, 204, 301]);
  const responseTimeMs = randInt(1, isErr ? 30000 : 500);
  const tlsCiphers = [
    "TLS_AES_128_GCM_SHA256",
    "TLS_AES_256_GCM_SHA384",
    "ECDHE-RSA-AES128-GCM-SHA256",
    "ECDHE-RSA-AES256-GCM-SHA384",
  ];
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "vpclattice" },
    },
    aws: {
      dimensions: { ServiceName: svcName, ServiceNetworkName: svcNetworkName },
      vpclattice: {
        service_name: svcName,
        service_arn: svcArn,
        service_network_name: svcNetworkName,
        target_group_id: tgId,
        source_vpc_id: srcVpc,
        destination_vpc_id: dstVpc,
        request_method: method,
        response_code: responseCode,
        response_time_ms: responseTimeMs,
        bytes_received: randInt(100, 65536),
        bytes_sent: randInt(200, 131072),
        tls_cipher_suite: rand(tlsCiphers),
      },
    },
    event: {
      action: rand([
        "ServiceNetworkVpcAssociation",
        "ServiceAssociation",
        "ForwardRule",
        "FixedResponseRule",
        "RequestAccepted",
        "RequestRejected",
        "AuthPolicyCheck",
      ]),
      outcome: isErr ? "failure" : "success",
      category: ["network"],
      type: ["connection"],
      dataset: "aws.vpclattice",
      provider: "vpc-lattice.amazonaws.com",
      duration: responseTimeMs * 1e6,
    },
    message: isErr
      ? `VPC Lattice ${svcName}: HTTP ${responseCode} after ${responseTimeMs}ms`
      : `VPC Lattice ${svcName}: ${method} ${responseCode} ${responseTimeMs}ms`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: String(responseCode),
            message: `VPC Lattice service error: HTTP ${responseCode}`,
            type: "network",
          },
        }
      : {}),
  };
}

function generateAppMeshLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const meshName = rand(["prod-mesh", "staging-mesh", "dev-mesh"]);
  const virtualNode = rand(["checkout-vn", "auth-vn", "inventory-vn", "payment-vn"]);
  const virtualService = rand(["checkout.svc", "auth.svc", "inventory.svc", "payment.svc"]);
  const listenerPort = rand([8080, 8443, 9090, 3000]);
  const protocol = rand(["http", "http2", "grpc"]);
  const responseCode = isErr ? rand([500, 502, 503, 504]) : rand([200, 200, 201, 204]);
  const responseTimeMs = randInt(1, isErr ? 5000 : 300);
  const bytesReceived = randInt(100, 8192);
  const bytesSent = randInt(200, 16384);
  const envoyResponseCodeDetails = isErr
    ? rand(["upstream_reset_before_response", "no_healthy_upstreams"])
    : "via_upstream";
  const action = rand([
    "RequestForwarded",
    "RequestRejected",
    "CircuitBreakerOpen",
    "RetryAttempt",
    "HealthCheckFailed",
  ]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "appmesh" },
    },
    aws: {
      dimensions: { MeshName: meshName, VirtualNodeName: virtualNode },
      appmesh: {
        mesh_name: meshName,
        virtual_node: virtualNode,
        virtual_service: virtualService,
        listener_port: listenerPort,
        protocol,
        response_code: responseCode,
        response_time_ms: responseTimeMs,
        bytes_received: bytesReceived,
        bytes_sent: bytesSent,
        envoy_response_code_details: envoyResponseCodeDetails,
      },
    },
    event: {
      action,
      outcome: isErr ? "failure" : "success",
      category: ["network"],
      type: ["connection"],
      dataset: "aws.appmesh",
      provider: "appmesh.amazonaws.com",
      duration: responseTimeMs * 1e6,
    },
    message: isErr
      ? `App Mesh ${virtualNode}: ${responseCode} upstream_reset after ${responseTimeMs}ms`
      : `App Mesh ${virtualNode}: ${protocol} ${responseCode} ${responseTimeMs}ms`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: { code: String(responseCode), message: envoyResponseCodeDetails, type: "network" },
        }
      : {}),
  };
}

function generateClientVpnLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const endpointId = `cvpn-endpoint-` + randId(17).toLowerCase();
  const connectionId = `cvpn-connection-` + randId(17).toLowerCase();
  const username = rand(ACCOUNTS).name.toLowerCase().replace(/ /g, ".");
  const sourceIp = randPublicIp();
  const assignedIp = `10.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(2, 254)}`;
  const egressBytes = randInt(1024, 10485760);
  const ingressBytes = randInt(512, 5242880);
  const connectionDurationSeconds = randInt(60, 86400);
  const terminationReason = isErr
    ? rand([
        "User disconnected",
        "Idle timeout",
        "Maximum session duration",
        "Authentication failure",
      ])
    : "User disconnected";
  const action = rand([
    "connected",
    "disconnected",
    "authentication-failure",
    "authorization-failure",
    "connection-attempt",
  ]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "clientvpn" },
    },
    aws: {
      dimensions: { Endpoint: endpointId },
      clientvpn: {
        endpoint_id: endpointId,
        connection_id: connectionId,
        username,
        source_ip: sourceIp,
        assigned_ip: assignedIp,
        egress_bytes: egressBytes,
        ingress_bytes: ingressBytes,
        connection_duration_seconds: connectionDurationSeconds,
        termination_reason: terminationReason,
      },
    },
    event: {
      action,
      outcome: isErr ? "failure" : "success",
      category: ["network", "authentication"],
      type: ["connection"],
      dataset: "aws.clientvpn",
      provider: "clientvpn.amazonaws.com",
      duration: connectionDurationSeconds * 1e9,
    },
    source: { ip: sourceIp },
    user: { name: username },
    message: isErr
      ? `Client VPN auth failure for ${username} from ${sourceIp}`
      : `Client VPN ${username} ${action} from ${sourceIp}`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? { error: { code: "AuthenticationFailure", message: terminationReason, type: "network" } }
      : {}),
  };
}

function generateCloudMapLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const namespace = rand(["prod-namespace", "staging-namespace", "internal-services"]);
  const serviceName = rand(["checkout", "auth", "inventory", "payment", "notification"]);
  const instanceId = `i-${randHexId(17)}`;
  const operation = rand([
    "RegisterInstance",
    "DeregisterInstance",
    "DiscoverInstances",
    "GetInstancesHealthStatus",
  ]);
  const healthStatus = isErr ? "UNHEALTHY" : rand(["HEALTHY", "HEALTHY", "HEALTHY", "ALL"]);
  const instancesReturned = randInt(1, 10);
  const queryType = rand(["DNS", "API", "HTTP"]);
  const ttl = rand([15, 30, 60, 300]);
  const action = rand([
    "RegisterInstance",
    "DeregisterInstance",
    "DiscoverInstances",
    "HealthStatusChange",
    "RoutingPolicyUpdate",
  ]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "cloudmap" },
    },
    aws: {
      dimensions: { Namespace: namespace, ServiceName: serviceName },
      cloudmap: {
        namespace,
        service_name: serviceName,
        instance_id: instanceId,
        operation,
        health_status: healthStatus,
        instances_returned: instancesReturned,
        query_type: queryType,
        ttl,
      },
    },
    event: {
      action,
      outcome: isErr ? "failure" : "success",
      category: ["network"],
      type: ["connection"],
      dataset: "aws.cloudmap",
      provider: "cloudmap.amazonaws.com",
      duration: randInt(1, 500) * 1e6,
    },
    message: isErr
      ? `Cloud Map ${serviceName}: instance ${instanceId} unhealthy`
      : `Cloud Map ${serviceName}: ${operation} returned ${instancesReturned} instances`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: "HealthCheckFailed",
            message: `Instance ${instanceId} health status: ${healthStatus}`,
            type: "network",
          },
        }
      : {}),
  };
}

function generateVpcIpamLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const poolId = `ipam-pool-${randId(8).toLowerCase()}`;
  const scopeId = `ipam-scope-${randId(8).toLowerCase()}`;
  const allocationId = `ipam-alloc-${randId(8).toLowerCase()}`;
  const cidrBlocks = [
    randVpcCidr16(),
    randVpcCidr16(),
    "172.16.0.0/12",
    "192.168.0.0/24",
    `10.${randInt(100, 200)}.0.0/16`,
  ];
  const cidr = rand(cidrBlocks);
  const allocationType = rand(["vpc", "subnet", "resource"]);
  const allocationsCount = randInt(1, 200);
  const totalCount = randInt(200, 500);
  const freeCount = isErr ? randInt(0, 5) : totalCount - allocationsCount;
  const errorCode = rand(["AllocationFailure", "CidrOverlapConflict"]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "ipam" },
    },
    aws: {
      dimensions: { PoolId: poolId, ScopeId: scopeId },
      vpcipam: {
        pool_id: poolId,
        scope_id: scopeId,
        allocation_id: allocationId,
        cidr,
        allocation_type: allocationType,
        error_code: isErr ? errorCode : null,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["network"],
      type: ["connection"],
      dataset: "aws.vpcipam",
      provider: "ec2.amazonaws.com",
      duration: randInt(1, 200) * 1e6,
    },
    data_stream: { type: "logs", dataset: "aws.vpcipam", namespace: "default" },
    message: isErr
      ? `VPC IPAM pool ${poolId}: ${errorCode} for CIDR ${cidr}`
      : `VPC IPAM pool ${poolId}: allocated ${cidr} (${allocationType}), free=${freeCount}`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: errorCode,
            message: `VPC IPAM allocation failed for CIDR ${cidr}`,
            type: "network",
          },
        }
      : {}),
  };
}

function generatePrivate5gLog(ts: string, er: number) {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const networkArn = `arn:aws:private5g:${region}:${acct.id}:network/net-${randId(8).toLowerCase()}`;
  const networkSiteId = `site-${randId(8).toLowerCase()}`;
  const deviceIdentifier = `device-${randId(10).toLowerCase()}`;
  const orderId = `order-${randId(8).toLowerCase()}`;
  const radioUnitStatus = isErr ? "OFFLINE" : rand(["ACTIVE", "PROVISIONED", "ACTIVE"]);
  const radioUnitsOnline = isErr ? 0 : randInt(1, 10);
  const throughputMbps = isErr ? 0 : Number(randFloat(10, 1000));
  const errorCode = rand(["RadioUnitOffline", "ActivationFailed"]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "private5g" },
    },
    aws: {
      dimensions: { NetworkSiteId: networkSiteId },
      private5g: {
        network_arn: networkArn,
        network_site_id: networkSiteId,
        device_identifier: deviceIdentifier,
        order_id: orderId,
        radio_unit_status: radioUnitStatus,
        error_code: isErr ? errorCode : null,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["network"],
      type: ["connection"],
      dataset: "aws.private5g",
      provider: "private5g.amazonaws.com",
      duration: randInt(10, 500) * 1e6,
    },
    data_stream: { type: "logs", dataset: "aws.private5g", namespace: "default" },
    message: isErr
      ? `Private 5G site ${networkSiteId}: ${errorCode} — radio unit ${radioUnitStatus}`
      : `Private 5G site ${networkSiteId}: ${radioUnitsOnline} radio units online, ${throughputMbps.toFixed(1)}Mbps`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: errorCode,
            message: `Private 5G radio unit failure at site ${networkSiteId}`,
            type: "network",
          },
        }
      : {}),
  };
}

export {
  generateAlbLog,
  generateNlbLog,
  generateCloudFrontLog,
  generateWafLog,
  generateWafv2Log,
  generateRoute53Log,
  generateRoute53ResolverLog,
  generateDnsC2Chain,
  generateNetworkFirewallLog,
  generateShieldLog,
  generateGlobalAcceleratorLog,
  generateTransitGatewayLog,
  generateDirectConnectLog,
  generateVpnLog,
  generatePrivateLinkLog,
  generateNetworkManagerLog,
  generateNatGatewayLog,
  generateVpcFlowLog,
  generateVpcLatticeLog,
  generateAppMeshLog,
  generateClientVpnLog,
  generateCloudMapLog,
  generateVpcIpamLog,
  generatePrivate5gLog,
};
