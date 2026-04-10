import {
  rand,
  randInt,
  randFloat,
  randId,
  randIp,
  randAccount,
  REGIONS,
  ACCOUNTS,
  USER_AGENTS,
  HTTP_METHODS,
  HTTP_PATHS,
  PROTOCOLS,
} from "../../helpers";
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
  const backendIp = randIp();
  const backendPort = randInt(3000, 9000);
  const certArn =
    `arn:aws:acm:${region}:${acct.id}:certificate/${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`.toLowerCase();
  const isSuspicious = isErr && Math.random() < 0.15;
  const clientGeo = rand(GEO_LOCATIONS);
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
        ssl_cipher: "ECDHE-RSA-AES128-GCM-SHA256",
        tls_named_group: "x25519",
        "chosen_cert.arn": certArn,
        trace_id: `Root=1-${randId(8)}-${randId(24)}`,
        matched_rule_priority: String(rand([1, 2, 3, 4, 5, 10, "default"])),
        action_executed:
          isErr && status >= 500
            ? rand(["fixed-response", "forward"])
            : rand(["forward", "forward", "forward", "authenticate-cognito"]),
        target_port: `${backendIp}:${backendPort}`,
        target_status_code: String(status),
        classification: isSuspicious ? "SUSPICIOUS" : "NORMAL",
        ...(isSuspicious
          ? { classification_reason: rand(["AmbiguousUri", "BadContentLength", "DuplicateHeader"]) }
          : {}),
        "error.reason":
          isErr && status >= 500
            ? rand([
                "TargetConnectionError",
                "TargetResponseError",
                "TargetTimeout",
                "ELBInternalError",
                "RequestTimeout",
              ])
            : undefined,
      },
    },
    http: {
      request: {
        method,
        bytes: randInt(200, 8000),
        referrer:
          Math.random() < 0.2
            ? rand([
                "https://www.google.com/",
                "https://app.example.com/",
                "https://console.aws.amazon.com/",
              ])
            : undefined,
      },
      response: { status_code: status, bytes: randInt(500, 50000) },
    },
    url: { path, domain: "api.example.com" },
    client: {
      ip: randIp(),
      port: randInt(1024, 65535),
      geo: {
        country_iso_code: clientGeo.country_iso_code,
        country_name: clientGeo.country_name,
        city_name: clientGeo.city_name,
        location: clientGeo.location,
      },
    },
    user_agent: { original: rand(USER_AGENTS) },
    event: {
      duration: (reqProc + backendProc + respProc) * 1e9,
      outcome: status >= 400 ? "failure" : "success",
      category: ["web", "network"],
      type: ["access"],
      dataset: "aws.elb_logs",
      provider: "elasticloadbalancing.amazonaws.com",
    },
    message: `${method} ${path} ${status} ${((reqProc + backendProc + respProc) * 1000).toFixed(0)}ms`,
    log: { level: status >= 500 ? "error" : status >= 400 ? "warn" : "info" },
    ...(status >= 400
      ? {
          error: {
            code: status >= 500 ? "TargetResponseError" : "ClientError",
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
  const targetIp = randIp();
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
        ssl_cipher: proto === "TLS" ? "ECDHE-RSA-AES128-GCM-SHA256" : undefined,
        ssl_protocol: proto === "TLS" ? "TLSv1.3" : undefined,
        "backend.ip": targetIp,
        "backend.port": String(port),
        "error.reason": isErr ? status : undefined,
        received_bytes: bytes,
        sent_bytes: randInt(64, 1048576),
      },
    },
    source: {
      ip: randIp(),
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
  const distId = `E${randId(13)}`;
  const timeTaken = Number(randFloat(0.001, isErr ? 5 : 0.5));
  const bytes = randInt(500, 500000);
  const clientIp = randIp();
  const clientGeo = rand(GEO_LOCATIONS);
  const edgeResultType = isErr ? "Error" : rand(["Hit", "Miss", "RefreshHit", "Redirect"]);
  const edgeResponseResultType = isErr ? "Error" : rand(["Hit", "Miss", "RefreshHit", "Redirect"]);
  const edgeDetailedResultType = isErr
    ? rand(["Error", "AbortedOrigin", "OriginDNSError", "OriginConnectError"])
    : rand(["Hit", "Miss", "RefreshHit", "Redirect"]);
  const cookies = rand(["", "session=abc123", "user=guest"]);
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
        domain: `d${randId(12).toLowerCase()}.cloudfront.net`,
        edge_location: edge,
        edge_result_type: edgeResultType,
        edge_response_result_type: edgeResponseResultType,
        edge_detailed_result_type: edgeDetailedResultType,
        time_to_first_byte: timeTaken,
        range_start: null,
        range_end: null,
        cookies: cookies || undefined,
      },
    },
    http: {
      request: { method: "GET", bytes: randInt(0, 1000) },
      response: { status_code: status, bytes },
    },
    url: { path, domain: `d${randId(12).toLowerCase()}.cloudfront.net` },
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
    message: `GET ${path} ${status} [${edge}]`,
    log: { level: status >= 500 ? "error" : status >= 400 ? "warn" : "info" },
    ...(status >= 400
      ? {
          error: {
            code: status >= 500 ? "OriginError" : "ClientError",
            message: `HTTP ${status}`,
            type: "server",
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
  const webAclId =
    `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`.toLowerCase();
  const uri = rand(HTTP_PATHS);
  const method = rand(HTTP_METHODS);
  const clientIp = randIp();
  const ua = rand(USER_AGENTS);
  const clientGeo = rand(GEO_LOCATIONS);
  const lbId = `${acct.id}-app/${webAclName}/${randId(16).toLowerCase()}`;
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "waf" },
    },
    aws: {
      dimensions: { WebACL: webAclName, Rule: rule, Region: region },
      waf: {
        id: randId(36).toLowerCase(),
        arn: `arn:aws:wafv2:${region}:${acct.id}:regional/webacl/${webAclName}/${webAclId}`,
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
          headers: [
            { name: "User-Agent", value: ua },
            { name: "Host", value: "api.example.com" },
          ],
        },
        labels: isBlock ? [{ name: `awswaf:managed:aws:${rule.toLowerCase()}` }] : [],
        response_code_sent: isBlock ? 403 : undefined,
        metrics: {
          AllowedRequests: { sum: isBlock ? 0 : 1 },
          BlockedRequests: { sum: isBlock ? 1 : 0 },
          CountedRequests: { sum: 0 },
          PassedRequests: { sum: isBlock ? 0 : 1 },
          RequestsWithValidCaptchaToken: { sum: 0 },
          ChallengeRequests: { sum: 0 },
          FailedCaptcha: { sum: 0 },
        },
      },
    },
    rule: {
      id: rand([
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
      ]),
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
      dataset: "aws.waf",
      provider: "wafv2.amazonaws.com",
      duration: randInt(1, isBlock ? 500 : 50) * 1e6,
    },
    message: `WAF ${isBlock ? "BLOCKED" : "ALLOWED"} request - Rule: ${rule}`,
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
  const webAclId =
    `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`.toLowerCase();
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
  const rule = rand([
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
  const ip = randIp();
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
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "wafv2" },
    },
    aws: {
      dimensions: { WebACL: webAcl, Rule: rule, Region: region },
      waf: {
        id: randId(36).toLowerCase(),
        arn: `arn:aws:wafv2:${region}:${acct.id}:regional/webacl/${webAcl}/${webAclId}`,
        format_version: "1",
        source: {
          name: rand(["ALB", "APIGW", "CF"]),
          id: `${acct.id}-app/${webAcl}/${randId(16).toLowerCase()}`,
        },
        rule_group_list: [
          {
            ruleGroupId: ruleGroup,
            terminatingRule: isBlock ? { action, ruleId: rule, ruleMatchDetails: [] } : undefined,
            nonTerminatingMatchingRules: [],
          },
        ],
        non_terminating_matching_rules: [],
        terminating_rule_match_details: [],
        request: {
          headers: [
            { name: "User-Agent", value: ua },
            { name: "Host", value: "api.example.com" },
          ],
        },
        labels: labelNames.map((n) => ({ name: n })),
        response_code_sent: isBlock ? 403 : undefined,
        metrics: {
          AllowedRequests: { sum: isBlock ? 0 : 1 },
          BlockedRequests: { sum: isBlock ? 1 : 0 },
          CountedRequests: { sum: 0 },
          PassedRequests: { sum: isBlock ? 0 : 1 },
          RequestsWithValidCaptchaToken: { sum: 0 },
          ChallengeRequests: { sum: 0 },
          FailedCaptcha: { sum: 0 },
        },
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
      dataset: "aws.waf",
      provider: "wafv2.amazonaws.com",
    },
    message: isBlock
      ? `WAFv2 ${action} [${webAcl}] ${ip}: ${ruleGroup}/${rule}`
      : `WAFv2 ${action} [${webAcl}] ${ip} ${method} ${uri}`,
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
    "api.example.com",
    "www.example.com",
    "mail.example.com",
    "app.internal",
    "db.internal",
    "s3.amazonaws.com",
  ];
  const types = ["A", "AAAA", "CNAME", "MX", "TXT", "SRV"];
  const rcode = isErr ? rand(["NXDOMAIN", "SERVFAIL", "REFUSED"]) : "NOERROR";
  const hostedZoneId = `Z${randId(21)}`;
  const srcIp = randIp();
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
      dataset: "aws.route53",
      provider: "route53.amazonaws.com",
      duration: randInt(1, isErr ? 500 : 50) * 1e6,
    },
    message: `${ts} ${randId(8)} ${rand(["ip4", "ip6"])} ${srcIp} ${53} ${rand(["A", "AAAA", "CNAME", "MX", "TXT", "SRV"])} ${rand(["example.com", "api.example.com", "db.internal", "s3.amazonaws.com"])}. ${rcode}`,
    log: { level: isErr ? "warn" : "info" },
    ...(isErr
      ? { error: { code: rcode, message: `DNS query failed: ${rcode}`, type: "network" } }
      : {}),
  };
}

function generateNetworkFirewallLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const action = Math.random() < er ? "DROP" : "PASS";
  const proto = rand([6, 17, 1]);
  const fwName = `fw-${region}`;
  const az = `${region}${rand(["a", "b", "c"])}`;
  const srcIp = randIp();
  const dstIp = randIp();
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
        metrics: {
          DroppedPackets: { sum: action === "DROP" ? randInt(1, 1000) : 0 },
          PassedPackets: { sum: action === "PASS" ? randInt(1000, 100000) : 0 },
          RejectedPackets: { sum: 0 },
          Packets: { sum: randInt(1000, 100000) },
          DroppedBytes: { sum: action === "DROP" ? randInt(64, 65535) : 0 },
        },
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
        metrics: {
          DDoSAttackBitsPerSecond: { avg: isAttack ? randInt(1e9, 100e9) : 0 },
          DDoSAttackPacketsPerSecond: { avg: isAttack ? randInt(1e6, 100e6) : 0 },
          DDoSAttackRequestsPerSecond: { avg: isAttack ? randInt(1e4, 1e6) : 0 },
        },
      },
    },
    network: { bytes: randInt(1e6, 1e9), packets: randInt(1000, 1000000) },
    event: {
      action: isAttack ? "ddos_detected" : "health_check",
      outcome: isAttack ? "failure" : "success",
      category: ["intrusion_detection", "network"],
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
        client_ip: randIp(),
        rtt_ms: rttMs,
        processing_time_ms: randInt(1, 20),
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: "network",
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
        src_vpc_id: `vpc-${randId(8).toLowerCase()}`,
        dst_vpc_id: `vpc-${randId(8).toLowerCase()}`,
        action,
        bytes: randInt(64, 65535),
        packets: randInt(1, 100),
        protocol: PROTOCOLS[proto] || "TCP",
        metrics: {
          BytesIn: { sum: randInt(1e6, 1e10) },
          BytesOut: { sum: randInt(1e6, 1e10) },
          PacketsIn: { sum: randInt(1000, 1e7) },
          PacketsOut: { sum: randInt(1000, 1e7) },
          PacketDropCountBlackhole: { sum: isErr ? randInt(1, 1000) : 0 },
          PacketDropCountNoRoute: { sum: isErr ? randInt(1, 100) : 0 },
          BytesDropCountBlackhole: { sum: isErr ? randInt(64, 65535) : 0 },
          BytesDropCountNoRoute: { sum: isErr ? randInt(64, 65535) : 0 },
        },
      },
    },
    source: { ip: randIp(), port: randInt(1024, 65535) },
    destination: { ip: randIp(), port: rand([80, 443, 22, 3306, 5432]) },
    network: { transport: (PROTOCOLS[proto] || "TCP").toLowerCase(), bytes: randInt(64, 65535) },
    event: {
      action,
      outcome: action === "drop" || action === "blackhole" ? "failure" : "success",
      category: ["network"],
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
      category: "network",
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
      category: "network",
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
        vpc_id: `vpc-${randId(8).toLowerCase()}`,
        state,
        private_dns_enabled: Math.random() > 0.3,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: "network",
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
      category: "network",
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
  const natId = `nat-${randId(17).toLowerCase()}`;
  const privateIp = `10.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`;
  const publicIp = randIp();
  const destIp = randIp();
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
        metrics: {
          ActiveConnectionCount: { avg: randInt(1, 10000) },
          BytesInFromDestination: { sum: randInt(1e6, 1e9) },
          BytesInFromSource: { sum: randInt(1e6, 1e9) },
          BytesOutToDestination: { sum: randInt(1e6, 1e9) },
          BytesOutToSource: { sum: randInt(1e6, 1e9) },
          ConnectionAttemptCount: { sum: randInt(1, 1000) },
          ConnectionEstablishedCount: { sum: randInt(1, 1000) },
          ErrorPortAllocation: { sum: isErr ? randInt(1, 100) : 0 },
          IdleTimeoutCount: { sum: randInt(0, 100) },
          PacketsDropCount: { sum: isErr ? randInt(1, 1000) : 0 },
          PacketsInFromDestination: { sum: randInt(1000, 1e6) },
          PacketsInFromSource: { sum: randInt(1000, 1e6) },
          PacketsOutToDestination: { sum: randInt(1000, 1e6) },
          PacketsOutToSource: { sum: randInt(1000, 1e6) },
        },
      },
    },
    source: { ip: privateIp, port: randInt(1024, 65535) },
    destination: { ip: destIp, port },
    network: { protocol: protocol.toLowerCase(), bytes, packets, direction: "egress" },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["network"],
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
  const proto = rand([6, 6, 6, 17, 1]);
  const pkts = randInt(1, 100);
  const bytes = pkts * randInt(40, 1500);
  const src = randIp();
  const dst = randIp();
  const dstPort = rand([22, 80, 443, 3306, 5432, 6379, 8080, 8443]);
  const srcPort = randInt(1024, 65535);
  const srcGeo = rand(GEO_LOCATIONS);
  const dstGeo = rand(GEO_LOCATIONS);
  const vpcId = `vpc-${randId(8).toLowerCase()}`;
  const eni = `eni-${randId(8).toLowerCase()}`;
  const subnetId = `subnet-${randId(8).toLowerCase()}`;
  const tsEpoch = Math.floor(new Date(ts).getTime() / 1000);
  const endEpoch = tsEpoch + randInt(1, 60);
  return {
    "@timestamp": ts,
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
        action,
        log_status: "OK",
        instance_id: Math.random() > 0.3 ? `i-${randId(17).toLowerCase()}` : undefined,
        pkt_srcaddr: src,
        pkt_dstaddr: dst,
        vpc_id: vpcId,
        subnet_id: subnetId,
        type: "IPv4",
      },
    },
    source: {
      ip: src,
      port: srcPort,
      geo: {
        country_iso_code: srcGeo.country_iso_code,
        country_name: srcGeo.country_name,
        city_name: srcGeo.city_name,
        location: srcGeo.location,
      },
    },
    destination: {
      ip: dst,
      port: dstPort,
      geo: {
        country_iso_code: dstGeo.country_iso_code,
        country_name: dstGeo.country_name,
        city_name: dstGeo.city_name,
        location: dstGeo.location,
      },
    },
    network: {
      transport: PROTOCOLS[proto]?.toLowerCase() || "tcp",
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
    message: `2 ${acct.id} ${eni} ${src} ${dst} ${srcPort} ${dstPort} ${proto} ${pkts} ${bytes} ${tsEpoch} ${endEpoch} ${action} OK`,
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
  const srcVpc = `vpc-${randId(8).toLowerCase()}`;
  const dstVpc = `vpc-${randId(8).toLowerCase()}`;
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
  const sourceIp = randIp();
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
  const instanceId = `i-` + randId(17).toLowerCase();
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
    "10.0.0.0/16",
    "10.1.0.0/16",
    "172.16.0.0/12",
    "192.168.0.0/24",
    "10.100.0.0/16",
  ];
  const cidr = rand(cidrBlocks);
  const allocationType = rand(["vpc", "subnet", "resource"]);
  const allocationsCount = randInt(1, 200);
  const totalCount = randInt(200, 500);
  const freeCount = isErr ? randInt(0, 5) : totalCount - allocationsCount;
  const usedCount = totalCount - freeCount;
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
        metrics: {
          allocations_count: allocationsCount,
          free_count: freeCount,
          used_count: usedCount,
        },
        error_code: isErr ? errorCode : null,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["network"],
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
  const activatedDevices = randInt(1, 50);
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
        metrics: {
          activated_device_identifiers: activatedDevices,
          radio_units_online: radioUnitsOnline,
          throughput_mbps: throughputMbps,
        },
        error_code: isErr ? errorCode : null,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["network"],
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
