/**
 * Dimensional metric generators for AWS networking services:
 * ALB, NLB, API Gateway, CloudFront, NAT Gateway, Transit Gateway,
 * VPN, Network Firewall, Global Accelerator, Direct Connect, VPC, PrivateLink,
 * WAF / WAFv2, VPC Lattice.
 */

import {
  REGIONS,
  ACCOUNTS,
  rand,
  randInt,
  randId,
  dp,
  stat,
  counter,
  metricDoc,
  pickCloudContext,
  jitter,
  sample,
} from "./helpers.js";

// ─── ALB / NLB ────────────────────────────────────────────────────────────────

const LB_NAMES = [
  "prod-alb",
  "api-alb",
  "web-alb",
  "internal-alb",
  "staging-alb",
  "prod-nlb",
  "db-nlb",
  "internal-nlb",
  "tcp-nlb",
];

export function generateAlbMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(
    LB_NAMES.filter((n) => n.includes("alb")),
    randInt(1, 3)
  ).map((name) => {
    const req = randInt(1_000, 500_000);
    const http5xx = Math.round(
      req * (Math.random() < er ? jitter(0.05, 0.04, 0.001, 0.3) : jitter(0.002, 0.001, 0, 0.01))
    );
    const http4xx = Math.round(req * jitter(0.015, 0.01, 0.001, 0.05));
    const httpElb3xx = Math.round(req * jitter(0.002, 0.0015, 0, 0.03));
    const ipv6Req = Math.round(req * jitter(0.08, 0.05, 0, 0.35));
    const grpcReq = Math.random() < 0.2 ? randInt(1, Math.max(1, Math.round(req * 0.15))) : 0;
    const tlsErrScale = Math.random() < er ? jitter(1, 0.5, 0.2, 4) : jitter(0.05, 0.03, 0, 0.5);
    return metricDoc(
      ts,
      "elb",
      "aws.elb",
      region,
      account,
      { LoadBalancer: `app/${name}/abc123def456` },
      {
        RequestCount: counter(req),
        HTTPCode_Target_2XX_Count: counter(req - http5xx - http4xx),
        HTTPCode_Target_4XX_Count: counter(http4xx),
        HTTPCode_Target_5XX_Count: counter(http5xx),
        HTTPCode_ELB_5XX_Count: counter(Math.round(http5xx * 0.1)),
        HTTPCode_ELB_3XX_Count: counter(httpElb3xx),
        ActiveConnectionCount: counter(randInt(100, 50_000)),
        NewConnectionCount: counter(randInt(10, 5_000)),
        ProcessedBytes: counter(randInt(1_000_000, 10_000_000_000)),
        IPv6ProcessedBytes: counter(randInt(0, Math.round(req * 8000))),
        IPv6RequestCount: counter(ipv6Req),
        RuleEvaluations: counter(randInt(req, req * 3)),
        ConsumedLCUs: counter(dp(jitter(5, 3, 0.5, 500))),
        TargetTLSNegotiationErrorCount: counter(Math.round(randInt(0, 200) * tlsErrScale)),
        ClientTLSNegotiationErrorCount: counter(Math.round(randInt(0, 120) * tlsErrScale)),
        GrpcRequestCount: counter(grpcReq),
        TargetResponseTime: stat(dp(jitter(0.05, 0.04, 0.001, 10)), {
          max: dp(jitter(5, 4, 0.5, 60)),
          min: dp(jitter(0.005, 0.003, 0.001, 0.05)),
        }),
        HealthyHostCount: stat(randInt(2, 10)),
        UnHealthyHostCount: stat(Math.random() < er ? randInt(1, 3) : 0),
        RejectedConnectionCount: counter(Math.random() < er * 0.2 ? randInt(1, 100) : 0),
      }
    );
  });
}

export function generateNlbMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(
    LB_NAMES.filter((n) => n.includes("nlb")),
    randInt(1, 2)
  ).map((name) => {
    const processed = randInt(1_000_000, 50_000_000_000);
    const processedTls = Math.round(processed * jitter(0.55, 0.15, 0.1, 0.95));
    const isUdpHeavy = Math.random() < 0.25;
    return metricDoc(
      ts,
      "elb",
      "aws.elb",
      region,
      account,
      { LoadBalancer: `net/${name}/xyz789uvw012` },
      {
        ActiveFlowCount: counter(randInt(100, 100_000)),
        NewFlowCount: counter(randInt(10, 10_000)),
        ProcessedBytes: counter(processed),
        ProcessedBytes_TLS: counter(processedTls),
        TCP_Client_Reset_Count: counter(Math.random() < er ? randInt(1, 500) : 0),
        TCP_Target_Reset_Count: counter(Math.random() < er * 0.5 ? randInt(1, 200) : 0),
        TCP_ELB_Reset_Count: counter(Math.random() < er * 0.3 ? randInt(1, 150) : randInt(0, 20)),
        PeakPacketsPerSecond: stat(dp(jitter(50_000, 20_000, 1_000, 500_000)), {
          max: dp(jitter(800_000, 200_000, 50_000, 2_000_000)),
          min: dp(jitter(500, 300, 10, 5000)),
        }),
        PortAllocErrorCount: counter(
          isUdpHeavy && Math.random() < er * 0.4
            ? randInt(1, 500)
            : Math.random() < er * 0.05
              ? randInt(0, 50)
              : 0
        ),
        HealthyHostCount: stat(randInt(2, 8)),
        UnHealthyHostCount: stat(Math.random() < er ? randInt(1, 2) : 0),
        ConsumedLCUs: counter(dp(jitter(2, 1.5, 0.1, 20))),
      }
    );
  });
}

// ─── API Gateway ──────────────────────────────────────────────────────────────

const APIGW_APIS = [
  "users-api",
  "orders-api",
  "payments-api",
  "products-api",
  "auth-api",
  "notifications-api",
  "search-api",
];
const APIGW_STAGES = ["prod", "v1", "v2", "staging", "dev"];

export function generateApigatewayMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const api = rand(APIGW_APIS);
  const stage = rand(APIGW_STAGES);
  const count = randInt(500, 200_000);
  const err4 = Math.round(count * jitter(0.02, 0.015, 0.001, 0.1));
  const err5 = Math.round(
    count * (Math.random() < er ? jitter(0.04, 0.03, 0.005, 0.25) : jitter(0.003, 0.002, 0, 0.01))
  );
  const hasCache = Math.random() < 0.3;
  const cacheHit = hasCache ? randInt(0, Math.round(count * 0.55)) : 0;
  const cacheMiss = hasCache ? Math.max(0, count - cacheHit - err4 - err5) : 0;
  const dataProcessed = randInt(50_000, count * 25_000);
  return [
    metricDoc(
      ts,
      "apigateway",
      "aws.apigateway_metrics",
      region,
      account,
      { ApiName: api, Stage: stage },
      {
        Count: counter(count),
        DataProcessed: counter(dataProcessed),
        "4XXError": counter(err4),
        "5XXError": counter(err5),
        Latency: stat(dp(jitter(80, 60, 5, 10000)), {
          max: dp(jitter(2000, 1500, 200, 30000)),
          min: dp(jitter(10, 7, 1, 50)),
        }),
        IntegrationLatency: stat(dp(jitter(50, 40, 3, 9000)), {
          max: dp(jitter(2500, 2000, 50, 45000)),
          min: dp(jitter(3, 2, 0.5, 80)),
        }),
        CacheHitCount: counter(cacheHit),
        CacheMissCount: counter(cacheMiss),
      }
    ),
  ];
}

// ─── CloudFront ───────────────────────────────────────────────────────────────

const CF_DISTRIBUTIONS = ["E1ABCDEF123456", "E2BCDEFG234567", "E3CDEFGH345678", "E4DEFGHI456789"];

export function generateCloudfrontMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(CF_DISTRIBUTIONS, randInt(1, 3)).map((distId) => {
    const req = randInt(5_000, 10_000_000);
    const err5xx = Math.round(req * (Math.random() < er ? jitter(0.02, 0.015, 0.001, 0.1) : 0));
    const err401 = Math.round(req * jitter(0.0005, 0.0003, 0, 0.01));
    const err403 = Math.round(req * jitter(0.0015, 0.001, 0, 0.02));
    const err502 = Math.round(
      req * (Math.random() < er ? jitter(0.008, 0.005, 0, 0.05) : jitter(0.0002, 0.0001, 0, 0.003))
    );
    const err503 = Math.round(
      req * (Math.random() < er ? jitter(0.006, 0.004, 0, 0.04) : jitter(0.0001, 0.00005, 0, 0.002))
    );
    const hit = dp(jitter(85, 10, 50, 99));
    const originP50 = dp(jitter(45, 20, 8, 120));
    const originP99 = dp(jitter(480, 150, 80, 2500));
    const fnInv = randInt(0, Math.round(req * 0.08));
    const fnValErr =
      Math.random() < er ? randInt(0, Math.max(1, Math.round(fnInv * 0.05))) : randInt(0, 3);
    return metricDoc(
      ts,
      "cloudfront",
      "aws.cloudfront",
      region,
      account,
      { DistributionId: distId, Region: "Global" },
      {
        Requests: counter(req),
        BytesDownloaded: counter(randInt(100_000_000, 100_000_000_000)),
        BytesUploaded: counter(randInt(1_000, 500_000_000)),
        TotalErrorRate: stat(dp(jitter(0.5, 0.4, 0, 5))),
        "4xxErrorRate": stat(dp(jitter(0.3, 0.2, 0, 3))),
        "5xxErrorRate": stat(dp((err5xx / Math.max(1, req)) * 100)),
        "401ErrorRate": stat(dp((err401 / Math.max(1, req)) * 100)),
        "403ErrorRate": stat(dp((err403 / Math.max(1, req)) * 100)),
        "502ErrorRate": stat(dp((err502 / Math.max(1, req)) * 100)),
        "503ErrorRate": stat(dp((err503 / Math.max(1, req)) * 100)),
        CacheHitRate: stat(hit),
        OriginLatency: stat(originP50, {
          max: originP99,
          min: dp(jitter(4, 2, 1, 25)),
        }),
        FunctionInvocations: counter(fnInv),
        FunctionValidationErrors: counter(fnValErr),
        FunctionComputeUtilization: stat(dp(jitter(12, 8, 0, 100)), {
          max: dp(jitter(98, 2, 50, 100)),
          min: dp(jitter(0.5, 0.3, 0, 5)),
        }),
      }
    );
  });
}

// ─── NAT Gateway ──────────────────────────────────────────────────────────────

export function generateNatgatewayMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return Array.from({ length: randInt(1, 3) }, (_, _i) => {
    const natId = `nat-${randInt(100000000, 999999999)}`;
    return metricDoc(
      ts,
      "natgateway",
      "aws.natgateway",
      region,
      account,
      { NatGatewayId: natId },
      {
        ActiveConnectionCount: counter(randInt(10, 10_000)),
        BytesInFromDestination: counter(randInt(1_000_000, 10_000_000_000)),
        BytesInFromSource: counter(randInt(1_000_000, 10_000_000_000)),
        BytesOutToDestination: counter(randInt(1_000_000, 10_000_000_000)),
        BytesOutToSource: counter(randInt(1_000_000, 10_000_000_000)),
        PacketsInFromDestination: counter(randInt(10_000, 50_000_000)),
        PacketsInFromSource: counter(randInt(10_000, 50_000_000)),
        PacketsOutToDestination: counter(randInt(10_000, 50_000_000)),
        PacketsOutToSource: counter(randInt(10_000, 50_000_000)),
        ConnectionAttemptCount: counter(randInt(100, 100_000)),
        ConnectionEstablishedCount: counter(randInt(100, 50_000)),
        ErrorPortAllocation: counter(Math.random() < er ? randInt(1, 100) : 0),
        IdleTimeoutCount: counter(randInt(0, Math.random() < er ? 5000 : 800)),
        PacketsDropCount: counter(Math.random() < er ? randInt(0, 1000) : randInt(0, 50)),
      }
    );
  });
}

// ─── Transit Gateway ──────────────────────────────────────────────────────────

export function generateTransitgatewayMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const tgwId = `tgw-${randInt(100000000, 999999999)}`;
  return [
    metricDoc(
      ts,
      "transitgateway",
      "aws.transitgateway",
      region,
      account,
      { TransitGateway: tgwId },
      {
        BytesIn: counter(randInt(10_000_000, 50_000_000_000)),
        BytesOut: counter(randInt(10_000_000, 50_000_000_000)),
        PacketsIn: counter(randInt(10_000, 100_000_000)),
        PacketsOut: counter(randInt(10_000, 100_000_000)),
        PacketDropCountBlackhole: counter(Math.random() < er ? randInt(1, 1000) : 0),
        PacketDropCountNoRoute: counter(
          Math.random() < er * 0.6 ? randInt(1, 500) : randInt(0, 30)
        ),
      }
    ),
  ];
}

// ─── VPN ──────────────────────────────────────────────────────────────────────

export function generateVpnMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return Array.from({ length: randInt(1, 2) }, () => {
    const vpnId = `vpn-${randInt(100000000, 999999999)}`;
    const tunnelState = Math.random() < er * 0.3 ? 0 : 1;
    return metricDoc(
      ts,
      "vpn",
      "aws.vpn",
      region,
      account,
      { VpnId: vpnId },
      {
        TunnelState: stat(tunnelState),
        TunnelDataIn: counter(randInt(100_000, 5_000_000_000)),
        TunnelDataOut: counter(randInt(100_000, 5_000_000_000)),
      }
    );
  });
}

// ─── Network Firewall ─────────────────────────────────────────────────────────

export function generateNetworkfirewallMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const fwName = rand(["prod-firewall", "egress-fw", "inspection-fw", "perimeter-fw"]);
  return [
    metricDoc(
      ts,
      "firewall",
      "aws.firewall",
      region,
      account,
      { FirewallName: fwName, AvailabilityZone: `${region}${rand(["a", "b", "c"])}` },
      {
        DroppedPackets: counter(Math.random() < er ? randInt(0, 5000) : randInt(0, 100)),
        PassedPackets: counter(randInt(10_000, 10_000_000)),
        ReceivedPackets: counter(randInt(10_000, 10_000_000)),
        StreamExceptionPolicyPackets: counter(
          Math.random() < er * 0.25 ? randInt(1, 2000) : randInt(0, 80)
        ),
        ThreatSignatureMatchedActions: counter(
          Math.random() < er * 0.35 ? randInt(1, 5000) : randInt(0, 200)
        ),
      }
    ),
  ];
}

// ─── Global Accelerator ───────────────────────────────────────────────────────

export function generateGlobalacceleratorMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "globalaccelerator",
      "aws.globalaccelerator",
      region,
      account,
      { Accelerator: "global-acc-1" },
      {
        NewFlowCount: counter(randInt(100, 50_000)),
        ProcessedBytesIn: counter(randInt(1_000_000, 10_000_000_000)),
        ProcessedBytesOut: counter(randInt(1_000_000, 10_000_000_000)),
        ReceivedPacketsDropped: counter(Math.random() < er ? randInt(1, 1000) : 0),
      }
    ),
  ];
}

// ─── Direct Connect ───────────────────────────────────────────────────────────

export function generateDirectconnectMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "directconnect",
      "aws.directconnect",
      region,
      account,
      { ConnectionId: `dxcon-${randInt(10000000, 99999999)}` },
      {
        ConnectionState: stat(Math.random() < er * 0.2 ? 0 : 1),
        ConnectionBpsIngress: counter(randInt(1_000_000, 10_000_000_000)),
        ConnectionBpsEgress: counter(randInt(1_000_000, 10_000_000_000)),
        ConnectionPpsIngress: counter(randInt(1_000, 10_000_000)),
        ConnectionPpsEgress: counter(randInt(1_000, 10_000_000)),
        ConnectionErrorCount: counter(Math.random() < er ? randInt(1, 100) : 0),
      }
    ),
  ];
}

// ─── VPC ──────────────────────────────────────────────────────────────────────

export function generateVpcMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "vpcflow",
      "aws.vpcflow",
      region,
      account,
      { Region: region },
      {
        BytesIn: counter(randInt(10_000_000, 100_000_000_000)),
        BytesOut: counter(randInt(10_000_000, 100_000_000_000)),
        PacketsIn: counter(randInt(100_000, 1_000_000_000)),
        PacketsOut: counter(randInt(100_000, 1_000_000_000)),
        RejectedFlows: counter(Math.random() < er ? randInt(100, 50_000) : randInt(0, 500)),
      }
    ),
  ];
}

// ─── PrivateLink ──────────────────────────────────────────────────────────────

export function generatePrivatelinkMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "privatelink",
      "aws.privatelink",
      region,
      account,
      { ServiceName: `com.amazonaws.${region}.execute-api` },
      {
        ActiveConnections: counter(randInt(10, 5000)),
        NewConnections: counter(randInt(1, 500)),
        BytesProcessed: counter(randInt(1_000_000, 10_000_000_000)),
        PacketsDropped: counter(Math.random() < er ? randInt(1, 100) : 0),
        RstPacketsFromServiceEndpoint: counter(Math.random() < er ? randInt(1, 50) : 0),
      }
    ),
  ];
}

// ─── WAF / WAFv2 (AWS/WAFV2) ───────────────────────────────────────────────────

const WAF_ACLS = ["prod-waf", "api-waf", "staging-waf", "global-waf"];

export function generateWafMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const waf = rand(WAF_ACLS);
  const rule = rand([
    "RateLimitRule",
    "SQLiRule",
    "XSSRule",
    "GeoBlockRule",
    "BadBotsRule",
    "IPBlocklist",
  ]);
  const req = randInt(1_000, 5_000_000);
  const blocked = Math.round(
    req * (Math.random() < er ? jitter(0.1, 0.08, 0.01, 0.5) : jitter(0.02, 0.015, 0.001, 0.1))
  );
  const counted = randInt(0, Math.round(req * 0.05));
  const passed = Math.max(0, req - blocked - counted);
  const allowed = Math.round(passed * jitter(0.92, 0.06, 0.55, 1));
  const captcha = Math.random() < er * 0.15 ? randInt(1, 5_000) : randInt(0, 800);
  const challenge = Math.random() < er * 0.12 ? randInt(1, 3_000) : randInt(0, 400);
  const validToken = Math.round(req * jitter(0.88, 0.08, 0.4, 0.99));
  const ruleEval = randInt(req, req * 4);
  const wcu = Math.random() < er ? jitter(820, 200, 500, 5000) : jitter(180, 90, 20, 1200);
  return [
    metricDoc(
      ts,
      "waf",
      "aws.waf",
      region,
      account,
      { WebACL: waf, Rule: rule, Region: region },
      {
        AllowedRequests: counter(allowed),
        BlockedRequests: counter(blocked),
        CountedRequests: counter(counted),
        PassedRequests: counter(passed),
        RuleEvaluations: counter(ruleEval),
        WebACLCapacityUnits: stat(dp(wcu), {
          max: dp(wcu * jitter(1.8, 0.4, 1.1, 3.5)),
          min: dp(wcu * jitter(0.15, 0.08, 0.02, 0.5)),
        }),
        SampleCount: counter(randInt(1, Math.max(2, Math.round(req / 50)))),
        RequestsWithValidToken: counter(validToken),
        CaptchaRequests: counter(captcha),
        ChallengeRequests: counter(challenge),
        RequestWithNoRuleActionMatched: counter(randInt(0, 10_000)),
      }
    ),
  ];
}

export const generateWafv2Metrics = generateWafMetrics;

// ─── VPC Lattice ──────────────────────────────────────────────────────────────

const LATTICE_SERVICES = ["checkout-api", "orders-internal", "payments-edge", "inventory-rpc"];

export function generateVpclatticeMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const snId = `sn-${randId(10).toLowerCase()}`;
  return sample(LATTICE_SERVICES, randInt(1, 3)).map((svc) => {
    const req = randInt(500, 800_000);
    const healthy = randInt(2, 18);
    const unhealthy = Math.random() < er ? randInt(1, 4) : 0;
    const activeConn = randInt(20, 80_000);
    const processed = Math.round(req * jitter(1800, 900, 200, 120_000));
    return metricDoc(
      ts,
      "vpclattice",
      "aws.vpclattice",
      region,
      account,
      {
        ServiceNetworkId: snId,
        ServiceId: `svc-${randId(10).toLowerCase()}`,
        TargetGroupId: `tg-${randId(10).toLowerCase()}`,
        ServiceName: svc,
      },
      {
        RequestCount: counter(req),
        HealthyTargetCount: stat(healthy),
        UnhealthyTargetCount: stat(unhealthy),
        ActiveConnectionCount: counter(activeConn),
        ProcessedBytes: counter(processed),
        TargetResponseTime: stat(dp(jitter(14, 10, 0.5, 800)), {
          max: dp(jitter(900, 500, 50, 8000)),
          min: dp(jitter(0.8, 0.5, 0.05, 120)),
        }),
        HTTPCode_Target_2XX_Count: counter(
          Math.max(0, Math.round(req * jitter(0.92, 0.05, 0.75, 0.99)))
        ),
        HTTPCode_Target_4XX_Count: counter(Math.round(req * jitter(0.04, 0.025, 0, 0.12))),
        HTTPCode_Target_5XX_Count: counter(
          Math.round(
            req *
              (Math.random() < er
                ? jitter(0.06, 0.045, 0.001, 0.25)
                : jitter(0.002, 0.0015, 0, 0.02))
          )
        ),
        NewConnectionCount: counter(randInt(5, 25_000)),
      }
    );
  });
}
