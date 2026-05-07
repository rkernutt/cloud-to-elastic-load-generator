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

export function generateAppmeshMetrics(ts: string, _er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const req = randInt(500, 800_000);
  return [
    metricDoc(
      ts,
      "appmesh",
      "aws.appmesh",
      region,
      account,
      {
        MeshName: rand(["prod-mesh", "edge-mesh", "svc-mesh"]),
        VirtualNode: `vn-${rand(["api", "worker", "gateway"])}-${randInt(1, 9)}`,
      },
      {
        ActiveConnectionCount: counter(randInt(50, 100_000)),
        NewConnectionCount: counter(randInt(100, 50_000)),
        ProcessedBytes: counter(randInt(1_000_000, 20_000_000_000)),
        RequestCount: counter(req),
      }
    ),
  ];
}

// ─── Client VPN (AWS/ClientVPN) ────────────────────────────────────────────────

export function generateClientvpnMetrics(ts: string, _er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const ingress = randInt(10_000_000, 4_000_000_000);
  const egress = Math.round(ingress * jitter(0.35, 0.2, 0.05, 0.95));
  return [
    metricDoc(
      ts,
      "clientvpn",
      "aws.clientvpn",
      region,
      account,
      {
        Endpoint: `cvpn-endpoint-${randId(12).toLowerCase()}`,
      },
      {
        ActiveConnectionsCount: counter(randInt(5, 8_000)),
        IngressBytes: counter(ingress),
        EgressBytes: counter(egress),
      }
    ),
  ];
}

// ─── Cloud Map (AWS/CloudMap) ─────────────────────────────────────────────────

export function generateCloudmapMetrics(ts: string, _er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "cloudmap",
      "aws.cloudmap",
      region,
      account,
      {
        NamespaceName: rand(["prod.local", "internal", "platform.svc"]),
        ServiceName: rand(["api", "worker", "cache", "auth"]),
      },
      {
        DiscoveryServiceInstanceCount: counter(randInt(3, 2_000)),
        RegisteredInstances: counter(randInt(3, 5_000)),
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

export function generateVpcipamMetrics(ts: string, _er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const pct = jitter(35, 25, 2, 98);
  return [
    metricDoc(
      ts,
      "vpcipam",
      "aws.vpcipam",
      region,
      account,
      {
        IpamPoolId: `ipam-pool-${randInt(1, 999)}-${randId(6).toLowerCase()}`,
      },
      {
        PercentIPAddressUsage: stat(dp(pct)),
        IpAddressUsage: counter(randInt(64, 65_536)),
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

export function generateDaxMetrics(ts: string, _er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const hits = randInt(50_000, 8_000_000);
  const misses = Math.round(hits * jitter(0.06, 0.04, 0.001, 0.45));
  const qh = randInt(20_000, 4_000_000);
  return [
    metricDoc(
      ts,
      "dax",
      "aws.dax",
      region,
      account,
      {
        ClusterId: rand(["prod-dax", "session-cache", "catalog-dax"]),
      },
      {
        ItemCacheHits: counter(hits),
        ItemCacheMisses: counter(misses),
        QueryCacheHits: counter(qh),
        TotalRequestCount: counter(hits + misses + qh + randInt(0, hits)),
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

export function generateWavelengthMetrics(ts: string, _er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const ni = randInt(10_000_000, 6_000_000_000);
  const no = Math.round(ni * jitter(0.25, 0.15, 0.02, 1.1));
  return [
    metricDoc(
      ts,
      "wavelength",
      "aws.wavelength",
      region,
      account,
      {
        WavelengthZone: `${region}-wlz-${randInt(1, 3)}`,
        InstanceId: `i-${randId(16).toLowerCase()}`,
      },
      {
        NetworkIn: counter(ni),
        NetworkOut: counter(no),
        Latency: stat(dp(jitter(2.5, 1.2, 0.8, 25))),
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

export function generateParallelcomputingMetrics(ts: string, _er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const nodes = randInt(4, 2_048);
  return [
    metricDoc(
      ts,
      "parallelcomputing",
      "aws.pcs",
      region,
      account,
      {
        ClusterName: rand(["hpc-prod", "cfd-batch", "genomics-hpc"]),
      },
      {
        NodeCount: counter(nodes),
        ComputeUtilization: stat(dp(jitter(62, 28, 5, 100))),
      }
    ),
  ];
}

// ─── Private 5G (AWS/Private5G) ───────────────────────────────────────────────

export function generatePrivate5gMetrics(ts: string, _er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const tx = randInt(50_000_000, 40_000_000_000);
  return [
    metricDoc(
      ts,
      "private5g",
      "aws.private5g",
      region,
      account,
      {
        NetworkArn: `arn:aws:private-networks:${region}:${account.id}:network-${randId(10).toLowerCase()}`,
      },
      {
        ActiveConnections: counter(randInt(10, 50_000)),
        DataTransferred: counter(tx),
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

export function generateWickrMetrics(ts: string, _er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "wickr",
      "aws.wickr",
      region,
      account,
      {
        NetworkId: `net-${randId(14).toLowerCase()}`,
      },
      {
        ActiveUsers: counter(randInt(50, 80_000)),
        MessagesSent: counter(randInt(5_000, 12_000_000)),
        FilesSent: counter(randInt(100, 800_000)),
      }
    ),
  ];
}
