/**
 * Dimensional metric generators for AWS networking services:
 * ALB, NLB, API Gateway, CloudFront, NAT Gateway, Transit Gateway,
 * VPN, Network Firewall, Global Accelerator, Direct Connect, VPC, PrivateLink.
 */

import {
  REGIONS,
  ACCOUNTS,
  rand,
  randInt,
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

export function generateAlbMetrics(ts, er) {
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
        ActiveConnectionCount: counter(randInt(100, 50_000)),
        NewConnectionCount: counter(randInt(10, 5_000)),
        ProcessedBytes: counter(randInt(1_000_000, 10_000_000_000)),
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

export function generateNlbMetrics(ts, er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(
    LB_NAMES.filter((n) => n.includes("nlb")),
    randInt(1, 2)
  ).map((name) => {
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
        ProcessedBytes: counter(randInt(1_000_000, 50_000_000_000)),
        TCP_Client_Reset_Count: counter(Math.random() < er ? randInt(1, 500) : 0),
        TCP_Target_Reset_Count: counter(Math.random() < er * 0.5 ? randInt(1, 200) : 0),
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

export function generateApigatewayMetrics(ts, er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const api = rand(APIGW_APIS);
  const stage = rand(APIGW_STAGES);
  const count = randInt(500, 200_000);
  const err4 = Math.round(count * jitter(0.02, 0.015, 0.001, 0.1));
  const err5 = Math.round(
    count * (Math.random() < er ? jitter(0.04, 0.03, 0.005, 0.25) : jitter(0.003, 0.002, 0, 0.01))
  );
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
        "4XXError": counter(err4),
        "5XXError": counter(err5),
        Latency: stat(dp(jitter(80, 60, 5, 10000)), {
          max: dp(jitter(2000, 1500, 200, 30000)),
          min: dp(jitter(10, 7, 1, 50)),
        }),
        IntegrationLatency: stat(dp(jitter(50, 40, 3, 9000))),
        CacheHitCount: counter(randInt(0, Math.round(count * 0.3))),
        CacheMissCount: counter(randInt(0, Math.round(count * 0.7))),
      }
    ),
  ];
}

// ─── CloudFront ───────────────────────────────────────────────────────────────

const CF_DISTRIBUTIONS = ["E1ABCDEF123456", "E2BCDEFG234567", "E3CDEFGH345678", "E4DEFGHI456789"];

export function generateCloudfrontMetrics(ts, er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(CF_DISTRIBUTIONS, randInt(1, 3)).map((distId) => {
    const req = randInt(5_000, 10_000_000);
    const err5xx = Math.round(req * (Math.random() < er ? jitter(0.02, 0.015, 0.001, 0.1) : 0));
    const hit = dp(jitter(85, 10, 50, 99));
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
        "5xxErrorRate": stat(dp((err5xx / req) * 100)),
        CacheHitRate: stat(hit),
        OriginLatency: stat(dp(jitter(50, 40, 5, 5000))),
      }
    );
  });
}

// ─── NAT Gateway ──────────────────────────────────────────────────────────────

export function generateNatgatewayMetrics(ts, er) {
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
        ConnectionAttemptCount: counter(randInt(100, 100_000)),
        ConnectionEstablishedCount: counter(randInt(100, 50_000)),
        ErrorPortAllocation: counter(Math.random() < er ? randInt(1, 100) : 0),
        PacketsDropCount: counter(Math.random() < er ? randInt(0, 1000) : 0),
      }
    );
  });
}

// ─── Transit Gateway ──────────────────────────────────────────────────────────

export function generateTransitgatewayMetrics(ts, er) {
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
      }
    ),
  ];
}

// ─── VPN ──────────────────────────────────────────────────────────────────────

export function generateVpnMetrics(ts, er) {
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

export function generateNetworkfirewallMetrics(ts, er) {
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
      }
    ),
  ];
}

// ─── Global Accelerator ───────────────────────────────────────────────────────

export function generateGlobalacceleratorMetrics(ts, er) {
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

export function generateDirectconnectMetrics(ts, er) {
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

export function generateVpcMetrics(ts, er) {
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

export function generatePrivatelinkMetrics(ts, er) {
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
