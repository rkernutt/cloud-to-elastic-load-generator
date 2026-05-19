/**
 * Dimensional metric generators for AWS infrastructure edge networking,
 * hybrid connectivity, specialized compute, and related application services.
 * Metric names follow CloudWatch namespaces (AWS/…).
 */

import {
  REGIONS,
  ACCOUNTS,
  rand,
  randInt,
  randFloat,
  randId,
  dp,
  stat,
  counter,
  metricDoc,
  pickCloudContext,
  jitter,
} from "./helpers.js";
import type { EcsDocument } from "../types.js";

// ─── App Mesh (AWS/AppMesh) ───────────────────────────────────────────────────

export function generateAppmeshMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const stressed = Math.random() < er;
  const req = randInt(500, 800_000);
  const mesh = rand(["prod-mesh", "edge-mesh", "svc-mesh"]);
  const vn = `vn-${rand(["api", "worker", "gateway"])}-${randInt(1, 9)}`;
  return [
    metricDoc(
      ts,
      "appmesh",
      "aws.appmesh",
      region,
      account,
      {
        MeshName: mesh,
        VirtualNode: vn,
      },
      {
        ActiveConnectionCount: counter(randInt(50, 100_000)),
        NewConnectionCount: counter(randInt(100, 50_000)),
        ProcessedBytes: counter(randInt(1_000_000, 20_000_000_000)),
        RequestCount: counter(req),
        RequestError4xx: counter(stressed ? randInt(5, 100) : randInt(0, 2)),
        RequestError5xx: counter(Math.random() < er ? randInt(5, 100) : randInt(0, 2)),
        ListenerRequestLatencyP99: stat(dp(stressed ? randFloat(420, 9800) : randFloat(18, 920))),
      }
    ),
    metricDoc(
      ts,
      "appmesh",
      "aws.appmesh",
      region,
      account,
      {
        MeshName: mesh,
        VirtualNode: vn,
        Route: `rt-${randId(6)}`,
      },
      {
        ThrottledRequests: counter(Math.random() < er ? randInt(10, 500) : 0),
        CircuitBreakerOpenCount: counter(Math.random() < er ? randInt(5, 800) : randInt(0, 25)),
      }
    ),
  ];
}

// ─── Client VPN (AWS/ClientVPN) ────────────────────────────────────────────────

export function generateClientvpnMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const stressed = Math.random() < er;
  const ingress = randInt(10_000_000, 4_000_000_000);
  const egress = Math.round(ingress * jitter(0.35, 0.2, 0.05, 0.95));
  const ep = `cvpn-endpoint-${randId(12).toLowerCase()}`;
  return [
    metricDoc(
      ts,
      "clientvpn",
      "aws.clientvpn",
      region,
      account,
      {
        Endpoint: ep,
      },
      {
        ActiveConnectionsCount: counter(randInt(5, 8_000)),
        IngressBytes: counter(ingress),
        EgressBytes: counter(egress),
        ConnectionAttemptFailures: counter(stressed ? randInt(5, 100) : randInt(0, 2)),
        HandshakeLatencyMilliseconds: stat(
          dp(stressed ? randFloat(800, 15_000) : randFloat(45, 980))
        ),
      }
    ),
    metricDoc(
      ts,
      "clientvpn",
      "aws.clientvpn",
      region,
      account,
      { Endpoint: ep, SubnetId: `subnet-${randId(8)}` },
      {
        AuthNegotiationFailures: counter(
          Math.random() < er ? randInt(50, 18_000) : randInt(0, 420)
        ),
        CPSExceeded: counter(Math.random() < er ? randInt(10, 500) : 0),
      }
    ),
  ];
}

// ─── Cloud Map (AWS/CloudMap) ─────────────────────────────────────────────────

export function generateCloudmapMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const stressed = Math.random() < er;
  const ns = rand(["prod.local", "internal", "platform.svc"]);
  const svc = rand(["api", "worker", "cache", "auth"]);
  return [
    metricDoc(
      ts,
      "cloudmap",
      "aws.cloudmap",
      region,
      account,
      {
        NamespaceName: ns,
        ServiceName: svc,
      },
      {
        DiscoveryServiceInstanceCount: counter(randInt(3, 2_000)),
        RegisteredInstances: counter(randInt(3, 5_000)),
        DeRegistrationStorm: counter(Math.random() < er ? randInt(50, 9000) : randInt(0, 400)),
        DnsQueryFailures: counter(stressed ? randInt(5, 100) : randInt(0, 2)),
      }
    ),
    metricDoc(
      ts,
      "cloudmap",
      "aws.cloudmap",
      region,
      account,
      {
        NamespaceName: ns,
        Operation: "DiscoverInstances",
      },
      {
        DiscoveryLatencyP99: stat(dp(stressed ? randFloat(280, 9800) : randFloat(12, 820))),
        ApiThrottles: counter(Math.random() < er ? randInt(10, 500) : 0),
      }
    ),
  ];
}

// ─── Outposts (AWS/Outposts) ──────────────────────────────────────────────────

export function generateOutpostsMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const connected = Math.random() >= er;
  return [
    metricDoc(
      ts,
      "outposts",
      "aws.outposts",
      region,
      account,
      {
        OutpostId: `op-${randId(10).toLowerCase()}`,
      },
      {
        ConnectedStatus: stat(dp(connected ? 1 : 0)),
        CapacityAvailable: stat(dp(jitter(45, 20, 5, 100))),
        InstanceCount: counter(randInt(0, 500)),
      }
    ),
  ];
}

// ─── Network Manager (AWS/NetworkManager) ─────────────────────────────────────

export function generateNetworkmanagerMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const tunnelUp = Math.random() >= er;
  const bi = randInt(1_000_000, 80_000_000_000);
  const bo = Math.round(bi * jitter(0.4, 0.25, 0.05, 1.2));
  return [
    metricDoc(
      ts,
      "networkmanager",
      "aws.networkmanager",
      region,
      account,
      {
        GlobalNetworkId: `gn-${randId(16).toLowerCase()}`,
        DeviceId: `device-${randId(8).toLowerCase()}`,
      },
      {
        TunnelState: stat(dp(tunnelUp ? 1 : 0)),
        BytesIn: counter(bi),
        BytesOut: counter(bo),
      }
    ),
  ];
}

// ─── Neptune Analytics (AWS/NeptuneAnalytics) ────────────────────────────────

export function generateNeptuneanalyticsMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const q = Math.random() < er ? randInt(50, 8_000) : randInt(200, 120_000);
  return [
    metricDoc(
      ts,
      "neptuneanalytics",
      "aws.neptuneanalytics",
      region,
      account,
      {
        GraphIdentifier: `g-${randId(14).toLowerCase()}`,
      },
      {
        QueryCount: counter(q),
        QueryLatency: stat(dp(jitter(12, 40, 1, 800))),
        GraphSize: counter(randInt(10_000_000, 500_000_000_000)),
      }
    ),
  ];
}

// ─── VPC IPAM (AWS/VPCIPAMPool) ───────────────────────────────────────────────

export function generateVpcipamMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const stressed = Math.random() < er;
  const pool = `ipam-pool-${randInt(1, 999)}-${randId(6).toLowerCase()}`;
  const pct = Math.random() < er ? jitter(88, 12, 58, 100) : jitter(35, 25, 2, 85);
  return [
    metricDoc(
      ts,
      "vpcipam",
      "aws.vpcipam",
      region,
      account,
      {
        IpamPoolId: pool,
      },
      {
        PercentIPAddressUsage: stat(dp(pct)),
        IpAddressUsage: counter(randInt(64, 65_536)),
        AllocationFailures: counter(stressed ? randInt(5, 100) : randInt(0, 2)),
        OverlappingAllocationErrors: counter(Math.random() < er ? randInt(5, 800) : 0),
      }
    ),
    metricDoc(
      ts,
      "vpcipam",
      "aws.vpcipam",
      region,
      account,
      { IpamPoolId: pool, ScopeId: `ipam-scope-${randId(6)}` },
      {
        ApiThrottles: counter(Math.random() < er ? randInt(10, 500) : 0),
        IPAMOperationalHealth: stat(dp(stressed ? randFloat(0.85, 0.95) : randFloat(0.99, 1))),
      }
    ),
  ];
}

// ─── Verified Permissions (AWS/VerifiedPermissions) ─────────────────────────

export function generateVerifiedpermissionsMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const total = randInt(1_000, 2_000_000);
  return [
    metricDoc(
      ts,
      "verifiedpermissions",
      "aws.verifiedpermissions",
      region,
      account,
      {
        PolicyStoreId: `ps-${randId(18).toLowerCase()}`,
      },
      {
        IsAuthorized: counter(total),
        DecisionLatency: stat(
          dp(Math.random() < er ? jitter(85, 60, 8, 400) : jitter(4, 12, 0.5, 250))
        ),
      }
    ),
  ];
}

// ─── DAX (AWS/DAX) ───────────────────────────────────────────────────────────

export function generateDaxMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const stressed = Math.random() < er;
  const hits = randInt(50_000, 8_000_000);
  const missRate = stressed ? jitter(0.28, 0.12, 0.05, 0.72) : jitter(0.06, 0.04, 0.001, 0.45);
  const misses = Math.round(hits * missRate);
  const qh = randInt(20_000, 4_000_000);
  const cluster = rand(["prod-dax", "session-cache", "catalog-dax"]);
  return [
    metricDoc(
      ts,
      "dax",
      "aws.dax",
      region,
      account,
      {
        ClusterId: cluster,
      },
      {
        ItemCacheHits: counter(hits),
        ItemCacheMisses: counter(misses),
        QueryCacheHits: counter(qh),
        TotalRequestCount: counter(hits + misses + qh + randInt(0, hits)),
        ErrorRequestCount: counter(stressed ? randInt(5, 100) : randInt(0, 2)),
        CpuUtilizationPercent: stat(dp(stressed ? jitter(91, 5, 70, 100) : jitter(38, 22, 5, 88))),
      }
    ),
    metricDoc(
      ts,
      "dax",
      "aws.dax",
      region,
      account,
      { ClusterId: cluster, NodeId: `${cluster}-001` },
      {
        ReplicationLatencyMilliseconds: stat(
          dp(stressed ? randFloat(400, 9800) : randFloat(0.35, 95))
        ),
        ThrottledCommands: counter(Math.random() < er ? randInt(10, 500) : 0),
        ConnectionAcquisitionFailures: counter(
          Math.random() < er ? randInt(50, 12_000) : randInt(0, 400)
        ),
      }
    ),
  ];
}

// ─── Chime SDK Voice (AWS/ChimeSDKVoice) ──────────────────────────────────────

export function generateChimesdkvoiceMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const active = randInt(10, 5_000);
  const ok = randInt(500, 80_000);
  const fail = Math.random() < er ? randInt(10, 4_000) : randInt(0, 120);
  return [
    metricDoc(
      ts,
      "chimesdkvoice",
      "aws.chimesdkvoice",
      region,
      account,
      {
        VoiceConnectorId: `${randId(12).toLowerCase()}`,
      },
      {
        ActiveCalls: counter(active),
        CallSetupSucceeded: counter(ok),
        CallSetupFailed: counter(fail),
      }
    ),
  ];
}

// ─── DRS (AWS/DRS) ────────────────────────────────────────────────────────────

export function generateDrsMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const lag = Math.random() < er ? jitter(180, 120, 30, 3600) : jitter(8, 6, 0.5, 120);
  return [
    metricDoc(
      ts,
      "drs",
      "aws.drs",
      region,
      account,
      {
        SourceServerID: `s-${randId(18).toLowerCase()}`,
      },
      {
        RecoveryPointAge: stat(dp(jitter(300, 400, 30, 86_400))),
        ReplicationLag: stat(dp(lag)),
        DataReplicationRate: stat(dp(jitter(45, 25, 1, 500) * 1_000_000)),
      }
    ),
  ];
}

// ─── Wavelength (AWS/Wavelength) ──────────────────────────────────────────────

export function generateWavelengthMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const stressed = Math.random() < er;
  const ni = randInt(10_000_000, 6_000_000_000);
  const no = Math.round(ni * jitter(0.25, 0.15, 0.02, 1.1));
  const wlz = `${region}-wlz-${randInt(1, 3)}`;
  const inst = `i-${randId(16).toLowerCase()}`;
  return [
    metricDoc(
      ts,
      "wavelength",
      "aws.wavelength",
      region,
      account,
      {
        WavelengthZone: wlz,
        InstanceId: inst,
      },
      {
        NetworkIn: counter(ni),
        NetworkOut: counter(no),
        Latency: stat(dp(stressed ? randFloat(20, 120) : jitter(2.5, 1.2, 0.8, 25))),
        PacketDroppedCount: counter(Math.random() < er ? randInt(500, 200_000) : randInt(0, 2000)),
        CarrierGatewayErrors: counter(stressed ? randInt(5, 100) : randInt(0, 2)),
      }
    ),
    metricDoc(
      ts,
      "wavelength",
      "aws.wavelength",
      region,
      account,
      { WavelengthZone: wlz, CarrierGatewayId: `cgw-${randId(8)}` },
      {
        HealthyTargetCount: stat(Math.random() < er ? randInt(0, 8) : randInt(2, 48)),
        UnhealthyTargetCount: stat(Math.random() < er ? randInt(5, 100) : randInt(0, 2)),
        BackboneLatencyP99: stat(dp(Math.random() < er ? randFloat(120, 9800) : randFloat(8, 620))),
      }
    ),
  ];
}

// ─── Nova (AWS/Nova) ──────────────────────────────────────────────────────────

export function generateNovaMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const req = Math.random() < er ? randInt(50, 4_000) : randInt(200, 50_000);
  return [
    metricDoc(
      ts,
      "nova",
      "aws.nova",
      region,
      account,
      {
        InferenceProfileId: `ip-${randId(14).toLowerCase()}`,
      },
      {
        InferenceLatency: stat(dp(jitter(180, 120, 40, 12_000))),
        RequestCount: counter(req),
        TokensGenerated: counter(randInt(10_000, 80_000_000)),
      }
    ),
  ];
}

// ─── Lookout for Vision (AWS/LookoutVision) ───────────────────────────────────

export function generateLookoutvisionMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const images = randInt(100, 400_000);
  const anomalies = Math.round(
    images * (Math.random() < er ? jitter(0.05, 0.04, 0.005, 0.25) : jitter(0.008, 0.006, 0, 0.04))
  );
  return [
    metricDoc(
      ts,
      "lookoutvision",
      "aws.lookoutvision",
      region,
      account,
      {
        ProjectName: rand(["qa-line", "packaging", "pcb-defects"]),
      },
      {
        AnomalyDetected: counter(anomalies),
        AnalyzedImageCount: counter(images),
      }
    ),
  ];
}

// ─── Lookout for Equipment (AWS/LookoutEquipment) ───────────────────────────

export function generateLookoutequipmentMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const anomalies = Math.random() < er ? randInt(5, 400) : randInt(0, 45);
  return [
    metricDoc(
      ts,
      "lookoutequipment",
      "aws.lookoutequipment",
      region,
      account,
      {
        ModelName: rand(["turbine-v3", "conveyor-a", "hvac-main"]),
      },
      {
        AnomalyCount: counter(anomalies),
        InferenceSchedulerUptime: stat(dp(jitter(97.5, 2, 85, 100))),
      }
    ),
  ];
}

// ─── Ground Station (AWS/GroundStation) ─────────────────────────────────────

export function generateGroundstationMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const minutes = randInt(5, 14_400);
  const data = randInt(50_000_000, 120_000_000_000);
  const success = Math.random() >= er ? 1 : 0;
  return [
    metricDoc(
      ts,
      "groundstation",
      "aws.groundstation",
      region,
      account,
      {
        GroundStationId: `gs-${randId(8).toLowerCase()}`,
        MissionProfileId: `mp-${randId(12).toLowerCase()}`,
      },
      {
        ContactMinutes: counter(minutes),
        DataDelivered: counter(data),
        ContactSuccess: stat(dp(success)),
      }
    ),
  ];
}

// ─── ParallelCluster (AWS/ParallelCluster) ──────────────────────────────────

export function generateParallelcomputingMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const stressed = Math.random() < er;
  const nodes = randInt(4, 2_048);
  const cluster = rand(["hpc-prod", "cfd-batch", "genomics-hpc"]);
  return [
    metricDoc(
      ts,
      "parallelcomputing",
      "aws.pcs",
      region,
      account,
      {
        ClusterName: cluster,
      },
      {
        NodeCount: counter(nodes),
        ComputeUtilization: stat(dp(stressed ? jitter(92, 6, 72, 100) : jitter(62, 28, 5, 100))),
        SchedulerBacklogJobs: counter(Math.random() < er ? randInt(500, 40_000) : randInt(0, 800)),
        JobFailures: counter(stressed ? randInt(5, 100) : randInt(0, 2)),
      }
    ),
    metricDoc(
      ts,
      "parallelcomputing",
      "aws.pcs",
      region,
      account,
      { ClusterName: cluster, QueueName: "gpu-high" },
      {
        GpuMemoryPressure: stat(dp(stressed ? randFloat(0.85, 0.98) : randFloat(0.35, 0.78))),
        FabricLatencyP99: stat(dp(Math.random() < er ? randFloat(80, 6200) : randFloat(2, 180))),
      }
    ),
  ];
}

// ─── Private 5G (AWS/Private5G) ───────────────────────────────────────────────

export function generatePrivate5gMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const stressed = Math.random() < er;
  const tx = randInt(50_000_000, 40_000_000_000);
  const na = `arn:aws:private-networks:${region}:${account.id}:network-${randId(10).toLowerCase()}`;
  return [
    metricDoc(
      ts,
      "private5g",
      "aws.private5g",
      region,
      account,
      {
        NetworkArn: na,
      },
      {
        ActiveConnections: counter(randInt(10, 50_000)),
        DataTransferred: counter(tx),
        RadioLinkFailures: counter(stressed ? randInt(5, 100) : randInt(0, 2)),
        CoreLatencyMilliseconds: stat(dp(stressed ? randFloat(400, 9000) : randFloat(35, 520))),
      }
    ),
    metricDoc(
      ts,
      "private5g",
      "aws.private5g",
      region,
      account,
      { NetworkArn: na, CellSiteId: `cell-${randId(6)}` },
      {
        SubscriberAttachFailures: counter(
          Math.random() < er ? randInt(50, 25_000) : randInt(0, 850)
        ),
        ApiThrottles: counter(Math.random() < er ? randInt(10, 500) : 0),
      }
    ),
  ];
}

// ─── Proton (AWS/Proton) ─────────────────────────────────────────────────────

export function generateProtonMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const instances = randInt(5, 4_000);
  const ok = randInt(20, 8_000);
  const fail = Math.random() < er ? randInt(1, 600) : randInt(0, 25);
  return [
    metricDoc(
      ts,
      "proton",
      "aws.proton",
      region,
      account,
      {
        ServiceName: rand(["api-svc", "worker-svc", "edge-svc"]),
        EnvironmentName: rand(["dev", "staging", "prod"]),
      },
      {
        ServiceInstanceCount: counter(instances),
        DeploymentSucceeded: counter(ok),
        DeploymentFailed: counter(fail),
      }
    ),
  ];
}

// ─── Wickr (AWS/Wickr) ──────────────────────────────────────────────────────

export function generateWickrMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const stressed = Math.random() < er;
  const net = `net-${randId(14).toLowerCase()}`;
  return [
    metricDoc(
      ts,
      "wickr",
      "aws.wickr",
      region,
      account,
      {
        NetworkId: net,
      },
      {
        ActiveUsers: counter(randInt(50, 80_000)),
        MessagesSent: counter(randInt(5_000, 12_000_000)),
        FilesSent: counter(randInt(100, 800_000)),
        DeliveryFailures: counter(stressed ? randInt(5, 100) : randInt(0, 2)),
        MessageLatencyP99: stat(dp(stressed ? randFloat(800, 9800) : randFloat(42, 780))),
      }
    ),
    metricDoc(
      ts,
      "wickr",
      "aws.wickr",
      region,
      account,
      { NetworkId: net, RoomId: `room-${randId(10)}` },
      {
        WebsocketDisconnectErrors: counter(
          Math.random() < er ? randInt(500, 90_000) : randInt(0, 6200)
        ),
        AttachmentUploadThrottles: counter(Math.random() < er ? randInt(10, 500) : 0),
      }
    ),
  ];
}
