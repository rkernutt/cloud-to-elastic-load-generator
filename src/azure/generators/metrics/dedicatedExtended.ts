import {
  randInt,
  jitter,
  dp,
  stat,
  counter,
  azureMetricDoc,
  pickAzureContext,
  randId,
  rand,
} from "./helpers.js";
import type { EcsDocument } from "../../../aws/generators/types.js";
import { AZURE_METRICS_DATASET_MAP } from "../../data/elasticMaps.js";

export function generateApplicationGatewayDedicatedExtendedMetrics(
  ts: string,
  er: number
): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const pools = ["backend-pool-a", "backend-pool-b", "backend-pool-c"];
  const n = Math.min(randInt(1, 3), pools.length);
  const dataset = AZURE_METRICS_DATASET_MAP["application-gateway"]!;
  return Array.from({ length: n }, (_, i) => {
    const agw = `agw-${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "application_gateway", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Network/applicationGateways",
      resourceName: agw,
      armProviderSegments: ["Microsoft.Network", "applicationGateways", agw],
      dimensions: {
        BackendPool: pools[i]!,
        Listener: rand(["https-443", "http-80"]),
        HttpStatusGroup: rand(["2xx", "4xx", "5xx"]),
      },
      metrics: {
        Throughput: counter(randInt(500_000, fail ? 1_200_000_000 : 820_000_000)),
        ConnectionCount: counter(randInt(200, fail ? 2_500_000 : 1_800_000)),
        CurrentConnections: stat(dp(jitter(800 + (fail ? 4_000 : 0), 600, 0, 50_000))),
        FailedRequests: counter(fail ? randInt(50, 120_000) : randInt(0, 2_500)),
        HealthyHostCount: stat(dp(jitter(fail ? 2 : 9, 3, 0, 48))),
      },
    });
  });
}

export function generateAzureFirewallDedicatedExtendedMetrics(
  ts: string,
  er: number
): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const policies = ["policy-east", "policy-west", "policy-shared"];
  const n = Math.min(randInt(1, 3), policies.length);
  const dataset = AZURE_METRICS_DATASET_MAP["azure-firewall"]!;
  return Array.from({ length: n }, (_, i) => {
    const fw = `afw-${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "azure_firewall", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Network/azureFirewalls",
      resourceName: fw,
      armProviderSegments: ["Microsoft.Network", "azureFirewalls", fw],
      dimensions: { FirewallPolicy: policies[i]!, Protocol: rand(["TCP", "UDP", "Any"]) },
      metrics: {
        ApplicationRuleHit: counter(randInt(0, 4_500_000)),
        NetworkRuleHit: counter(randInt(0, 2_800_000)),
        FirewallHealth: stat(dp(jitter(fail ? 76 : 100, fail ? 18 : 0.05, 0, 100))),
        DataProcessed: counter(randInt(50_000_000, fail ? 520_000_000_000 : 360_000_000_000)),
        SNATPortUtilization: stat(dp(jitter(32 + (fail ? 45 : 0), 28, 0, 100))),
      },
    });
  });
}

export function generateContainerAppsDedicatedExtendedMetrics(
  ts: string,
  er: number
): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const revs = ["ca-api--v1", "ca-worker--v2", "ca-job--v3"];
  const n = Math.min(randInt(1, 3), revs.length);
  const dataset = AZURE_METRICS_DATASET_MAP["container-apps"]!;
  return Array.from({ length: n }, (_, i) => {
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "container_apps", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.App/containerApps",
      resourceName: "ca-prod",
      armProviderSegments: ["Microsoft.App", "containerApps", "ca-prod"],
      dimensions: { revisionName: revs[i]!, replicaName: `ca-prod-${randInt(1000, 9999)}` },
      metrics: {
        Requests: counter(randInt(0, 620_000)),
        RestartCount: counter(fail ? randInt(1, 55) : randInt(0, 4)),
        ReplicaCount: stat(dp(jitter(3 + (fail ? 6 : 0), 2, 1, 60))),
        CpuUsage: stat(dp(jitter(38 + (fail ? 40 : 0), 28, 0, 100))),
        MemoryUsage: stat(
          dp(jitter(420_000_000 + (fail ? 220_000_000 : 0), 140_000_000, 40_000_000, 4_000_000_000))
        ),
      },
    });
  });
}

export function generateContainerInstancesDedicatedExtendedMetrics(
  ts: string,
  er: number
): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const groups = ["aci-api", "aci-worker", "aci-batch"];
  const n = Math.min(randInt(1, 3), groups.length);
  const dataset = AZURE_METRICS_DATASET_MAP["container-instances"]!;
  return Array.from({ length: n }, (_, i) => {
    const cg = `${groups[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "container_instances", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.ContainerInstance/containerGroups",
      resourceName: cg,
      armProviderSegments: ["Microsoft.ContainerInstance", "containerGroups", cg],
      dimensions: { containerName: `${cg}-main`, ResourceName: cg },
      metrics: {
        CpuUsage: stat(dp(jitter(41 + (fail ? 48 : 0), 30, 0, 100))),
        MemoryUsage: stat(
          dp(jitter(890_000_000 + (fail ? 350_000_000 : 0), 280_000_000, 64_000_000, 14e9))
        ),
        NetworkBytesReceived: counter(randInt(1_000_000, fail ? 90_000_000_000 : 55_000_000_000)),
        NetworkBytesTransmitted: counter(randInt(800_000, fail ? 72_000_000_000 : 48_000_000_000)),
      },
    });
  });
}

export function generateBatchDedicatedExtendedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const pools = ["pool-prod", "pool-gpu", "pool-lowprio"];
  const n = Math.min(randInt(1, 3), pools.length);
  const dataset = AZURE_METRICS_DATASET_MAP.batch!;
  return Array.from({ length: n }, (_, i) => {
    const acct = `batch-${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "batch", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Batch/batchAccounts",
      resourceName: acct,
      armProviderSegments: ["Microsoft.Batch", "batchAccounts", acct],
      dimensions: { PoolId: pools[i]!, JobId: `job-${randId(4).toLowerCase()}` },
      metrics: {
        TaskStartEvent: counter(randInt(0, 180_000)),
        TaskCompleteEvent: counter(randInt(0, fail ? 165_000 : 175_000)),
        PoolNodeCount: stat(dp(jitter(8 + (fail ? -2 : 0), 4, 0, 512))),
        CoreCount: stat(dp(jitter(32 + (fail ? 0 : 8), 16, 0, 4096))),
      },
    });
  });
}

export function generateDdosProtectionDedicatedExtendedMetrics(
  ts: string,
  er: number
): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const plans = ["ddos-plan-hub", "ddos-plan-spoke", "ddos-plan-prod"];
  const n = Math.min(randInt(1, 3), plans.length);
  const dataset = AZURE_METRICS_DATASET_MAP["ddos-protection"]!;
  return Array.from({ length: n }, (_, i) => {
    const plan = `${plans[i]}-${randId(4).toLowerCase()}`;
    const underAttack = Math.random() < er * 0.5;
    return azureMetricDoc(ts, "ddos_protection", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Network/ddosProtectionPlans",
      resourceName: plan,
      armProviderSegments: ["Microsoft.Network", "ddosProtectionPlans", plan],
      dimensions: { PublicIPAddress: `pip-${randId(5).toLowerCase()}`, ResourceName: plan },
      metrics: {
        DDoSAttack: stat(dp(underAttack ? jitter(1, 0.2, 0, 100) : 0)),
        BytesDropped: counter(
          underAttack ? randInt(1_000_000, 180_000_000_000) : randInt(0, 50_000_000)
        ),
        PacketsDropped: counter(underAttack ? randInt(10_000, 900_000_000) : randInt(0, 200_000)),
        BytesForwarded: counter(
          randInt(5_000_000, underAttack ? 120_000_000_000 : 400_000_000_000)
        ),
      },
    });
  });
}

export function generateExpressRouteCircuitDedicatedExtendedMetrics(
  ts: string,
  er: number
): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const peers = ["AzurePrivatePeering", "AzurePublicPeering", "MicrosoftPeering"];
  const n = Math.min(randInt(1, 3), peers.length);
  const dataset = AZURE_METRICS_DATASET_MAP["expressroute-circuit"]!;
  return Array.from({ length: n }, (_, i) => {
    const circuit = `erc-${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(
      ts,
      "expressroute_circuit",
      dataset,
      region,
      subscription,
      resourceGroup,
      {
        namespace: "Microsoft.Network/expressRouteCircuits",
        resourceName: circuit,
        armProviderSegments: ["Microsoft.Network", "expressRouteCircuits", circuit],
        dimensions: { PeeringType: peers[i]!, Peering: peers[i]! },
        metrics: {
          BitsInPerSecond: stat(
            dp(jitter(120_000_000 + (fail ? -40_000_000 : 0), 45_000_000, 0, 10_000_000_000))
          ),
          BitsOutPerSecond: stat(
            dp(jitter(115_000_000 + (fail ? -35_000_000 : 0), 42_000_000, 0, 10_000_000_000))
          ),
          ArpAvailability: stat(dp(jitter(fail ? 92 : 100, fail ? 6 : 0.02, 0, 100))),
          BgpAvailability: stat(dp(jitter(fail ? 88 : 100, fail ? 10 : 0.05, 0, 100))),
        },
      }
    );
  });
}

export function generateExpressRouteGatewayDedicatedExtendedMetrics(
  ts: string,
  er: number
): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const gws = ["ergw-hub", "ergw-spoke-a", "ergw-dr"];
  const n = Math.min(randInt(1, 3), gws.length);
  const dataset = AZURE_METRICS_DATASET_MAP["expressroute-gateway"]!;
  return Array.from({ length: n }, (_, i) => {
    const gw = `${gws[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(
      ts,
      "expressroute_gateway",
      dataset,
      region,
      subscription,
      resourceGroup,
      {
        namespace: "Microsoft.Network/expressRouteGateways",
        resourceName: gw,
        armProviderSegments: ["Microsoft.Network", "expressRouteGateways", gw],
        dimensions: { ConnectionName: `conn-${randId(4)}`, ResourceName: gw },
        metrics: {
          BitsPerSecond: stat(
            dp(jitter(95_000_000 + (fail ? -25_000_000 : 0), 35_000_000, 0, 8_000_000_000))
          ),
          PacketsPerSecond: stat(dp(jitter(125_000 + (fail ? -35_000 : 0), 48_000, 0, 10_000_000))),
          CountOfRoutes: stat(dp(jitter(48 + (fail ? 8 : 0), 18, 0, 4000))),
        },
      }
    );
  });
}

export function generateFrontDoorDedicatedExtendedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const endpoints = ["ep-api", "ep-static", "ep-stream"];
  const n = Math.min(randInt(1, 3), endpoints.length);
  const dataset = AZURE_METRICS_DATASET_MAP["front-door"]!;
  return Array.from({ length: n }, (_, i) => {
    const prof = `fd-${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "front_door", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Cdn/profiles",
      resourceName: prof,
      armProviderSegments: ["Microsoft.Cdn", "profiles", prof],
      dimensions: {
        Endpoint: endpoints[i]!,
        Profile: prof,
        HttpStatusGroup: rand(["2xx", "3xx", "4xx", "5xx"]),
      },
      metrics: {
        RequestCount: counter(randInt(0, 28_000_000)),
        RequestSize: counter(randInt(0, fail ? 920_000_000_000 : 620_000_000_000)),
        ResponseSize: counter(randInt(0, fail ? 1_100_000_000_000 : 780_000_000_000)),
        TotalLatency: stat(dp(jitter(42 + (fail ? 240 : 0), 38, 2, 12_000))),
        BackendRequestCount: counter(randInt(0, fail ? 26_000_000 : 20_000_000)),
      },
    });
  });
}

export function generateFirewallPolicyDedicatedExtendedMetrics(
  ts: string,
  er: number
): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const policies = ["pol-eastus", "pol-shared", "pol-pci"];
  const n = Math.min(randInt(1, 3), policies.length);
  const dataset = AZURE_METRICS_DATASET_MAP["firewall-policy"]!;
  return Array.from({ length: n }, (_, i) => {
    const pol = `fwp-${policies[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "firewall_policy", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Network/firewallPolicies",
      resourceName: pol,
      armProviderSegments: ["Microsoft.Network", "firewallPolicies", pol],
      dimensions: {
        FirewallPolicyName: pol,
        RuleCollectionGroup: rand(["DefaultDNat", "DefaultNetwork", "AppRules"]),
      },
      metrics: {
        RuleEvaluationCount: counter(randInt(200_000, fail ? 220_000_000 : 180_000_000)),
        HitCount: counter(randInt(150_000, fail ? 180_000_000 : 150_000_000)),
      },
    });
  });
}

export function generateNatGatewayDedicatedExtendedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const subnets = ["subnet-app", "subnet-data", "subnet-mgmt"];
  const n = Math.min(randInt(1, 3), subnets.length);
  const dataset = AZURE_METRICS_DATASET_MAP["nat-gateway"]!;
  return Array.from({ length: n }, (_, i) => {
    const nat = `nat-${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "nat_gateway", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Network/natGateways",
      resourceName: nat,
      armProviderSegments: ["Microsoft.Network", "natGateways", nat],
      dimensions: { Subnet: subnets[i]!, Protocol: rand(["TCP", "UDP"]) },
      metrics: {
        SNATConnectionCount: counter(randInt(0, fail ? 1_200_000 : 820_000)),
        DatapathAvailability: stat(dp(jitter(fail ? 88 : 100, fail ? 10 : 0.02, 0, 100))),
        ByteCount: counter(randInt(10_000_000, fail ? 480_000_000_000 : 320_000_000_000)),
        PacketCount: counter(randInt(100_000, fail ? 620_000_000 : 450_000_000)),
      },
    });
  });
}

export function generateVirtualMachinesDedicatedExtendedMetrics(
  ts: string,
  er: number
): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const vms = ["vm-web-01", "vm-app-02", "vm-batch-03"];
  const n = Math.min(randInt(1, 3), vms.length);
  const dataset = AZURE_METRICS_DATASET_MAP["virtual-machines"]!;
  return Array.from({ length: n }, (_, i) => {
    const vmName = vms[i]!;
    const fail = Math.random() < er;
    const stress = fail ? 35 : 0;
    return azureMetricDoc(ts, "virtual_machines", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Compute/virtualMachines",
      resourceName: vmName,
      armProviderSegments: ["Microsoft.Compute", "virtualMachines", vmName],
      dimensions: { VMName: vmName, ResourceName: vmName },
      metrics: {
        "Percentage CPU": stat(dp(jitter(32 + stress, 28, 1, 100))),
        "Available Memory Bytes": stat(dp(jitter(5e9 - stress * 1.4e7, 1.4e9, 4e8, 16e9))),
        "Disk Read Bytes": counter(randInt(5_000_000, 12_000_000_000)),
        "Network In Total": counter(randInt(50_000_000, 4_000_000_000)),
      },
    });
  });
}

export function generateVirtualNetworkDedicatedExtendedMetrics(
  ts: string,
  er: number
): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const vnets = ["vnet-hub", "vnet-spoke-a", "vnet-spoke-b"];
  const n = Math.min(randInt(1, 3), vnets.length);
  const dataset = AZURE_METRICS_DATASET_MAP["virtual-network"]!;
  return Array.from({ length: n }, (_, i) => {
    const vnet = `${vnets[i]}-${randId(4).toLowerCase()}`;
    const underAttack = Math.random() < er * 0.45;
    return azureMetricDoc(ts, "virtual_network", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Network/virtualNetworks",
      resourceName: vnet,
      armProviderSegments: ["Microsoft.Network", "virtualNetworks", vnet],
      dimensions: { VnetName: vnet, ResourceName: vnet },
      metrics: {
        IfUnderAttack: stat(dp(underAttack ? 1 : 0)),
        BytesInDDoS: counter(
          underAttack ? randInt(1_000_000, 220_000_000_000) : randInt(0, 12_000_000)
        ),
        PacketsDroppedDDoS: counter(underAttack ? randInt(5_000, 900_000_000) : randInt(0, 50_000)),
      },
    });
  });
}

export function generateVmScaleSetsDedicatedExtendedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const instances = ["vmss-prod_0", "vmss-prod_1", "vmss-prod_2"];
  const n = Math.min(randInt(1, 3), instances.length);
  const dataset = AZURE_METRICS_DATASET_MAP["vm-scale-sets"]!;
  return Array.from({ length: n }, (_, i) => {
    const vmName = instances[i]!;
    const fail = Math.random() < er;
    const stress = fail ? 35 : 0;
    return azureMetricDoc(ts, "vm_scale_sets", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Compute/virtualMachineScaleSets",
      resourceName: "vmss-prod",
      armProviderSegments: [
        "Microsoft.Compute",
        "virtualMachineScaleSets",
        "vmss-prod",
        "virtualMachines",
        vmName,
      ],
      dimensions: { VMName: vmName, vmssName: "vmss-prod", ResourceName: "vmss-prod" },
      metrics: {
        "Percentage CPU": stat(dp(jitter(30 + stress, 26, 1, 100))),
        "Available Memory Bytes": stat(dp(jitter(4.8e9 - stress * 1.3e7, 1.3e9, 4e8, 14e9))),
        "VMSS Instances Count": stat(dp(jitter(6 + (fail ? 10 : 4), 3, 1, 600))),
      },
    });
  });
}

export function generateVpnClientDedicatedExtendedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const gateways = ["vgw-p2s-0", "vgw-p2shared", "vgw-remote"];
  const n = Math.min(randInt(1, 3), gateways.length);
  const dataset = AZURE_METRICS_DATASET_MAP["vpn-client"]!;
  return Array.from({ length: n }, (_, i) => {
    const vgw = `${gateways[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "vpn_client", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Network/virtualNetworkGateways",
      resourceName: vgw,
      armProviderSegments: ["Microsoft.Network", "virtualNetworkGateways", vgw],
      dimensions: { GatewayName: vgw, ConnectionName: `P2S-${randId(4)}` },
      metrics: {
        P2SConnectionCount: stat(dp(jitter(120 + (fail ? 1_200 : 400), 180, 0, 10_000))),
        P2SBandwidth: stat(
          dp(jitter(8_000_000 + (fail ? 2_000_000 : 0), 4_000_000, 0, 10_000_000_000))
        ),
      },
    });
  });
}

export function generateVpnGatewayDedicatedExtendedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const tunnels = ["tunnel-aws", "tunnel-onprem", "tunnel-dr"];
  const n = Math.min(randInt(1, 3), tunnels.length);
  const dataset = AZURE_METRICS_DATASET_MAP["vpn-gateway"]!;
  return Array.from({ length: n }, (_, i) => {
    const vgw = `vgw-${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "vpn_gateway", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Network/virtualNetworkGateways",
      resourceName: vgw,
      armProviderSegments: ["Microsoft.Network", "virtualNetworkGateways", vgw],
      dimensions: { ConnectionName: tunnels[i]!, Tunnel: tunnels[i]! },
      metrics: {
        TunnelAverageBandwidth: stat(
          dp(jitter(2_500_000 + (fail ? -800_000 : 0), 1_200_000, 0, 1_000_000_000))
        ),
        TunnelEgressBytes: counter(randInt(1_000_000, fail ? 280_000_000_000 : 190_000_000_000)),
        TunnelIngressBytes: counter(randInt(1_000_000, fail ? 260_000_000_000 : 175_000_000_000)),
        BgpPeerStatus: stat(dp(fail && Math.random() < 0.35 ? 0 : 1)),
      },
    });
  });
}

export function generateKeyVaultDedicatedExtendedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const vaults = ["kv-prod", "kv-shared", "kv-pci"];
  const n = Math.min(randInt(1, 3), vaults.length);
  const dataset = AZURE_METRICS_DATASET_MAP["key-vault"]!;
  return Array.from({ length: n }, (_, i) => {
    const v = `${vaults[i]}-${randId(3).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "key_vault", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.KeyVault/vaults",
      resourceName: v,
      armProviderSegments: ["Microsoft.KeyVault", "vaults", v],
      dimensions: {
        VaultName: v,
        ActivityType: rand(["get", "list", "unwrap"]),
        StatusCode: rand(["200", "429", "503"]),
      },
      metrics: {
        ServiceApiHit: counter(randInt(0, 720_000)),
        ServiceApiLatency: stat(dp(jitter(32 + (fail ? 420 : 0), 26, 1, 10_000))),
        SaturationShoebox: stat(dp(jitter(22 + (fail ? 55 : 0), 24, 0, 100))),
        Availability: stat(dp(jitter(fail ? 93 : 100, fail ? 5 : 0.02, 0, 100))),
      },
    });
  });
}

export function generateEntraIdDedicatedExtendedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const tenants = ["tenant-primary", "tenant-b2b", "tenant-guest"];
  const n = Math.min(randInt(1, 3), tenants.length);
  const dataset = AZURE_METRICS_DATASET_MAP["entra-id"]!;
  return Array.from({ length: n }, (_, i) => {
    const tenantId =
      `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`.toLowerCase();
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "entra_id", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.AadIam/azureADTenants",
      resourceName: tenantId,
      armProviderSegments: ["Microsoft.AadIam", "azureADTenants", tenantId],
      dimensions: {
        TenantName: tenants[i]!,
        TenantId: tenantId,
        AuthenticationProtocol: rand(["OAuth2", "SAML", "ROPC"]),
      },
      metrics: {
        SignInFailures: counter(fail ? randInt(40, 180_000) : randInt(0, 3_000)),
        InteractiveSignIns: counter(randInt(5_000, fail ? 1_800_000 : 2_400_000)),
        NonInteractiveSignIns: counter(randInt(20_000, fail ? 6_000_000 : 8_000_000)),
      },
    });
  });
}

export function generateKubernetesFleetDedicatedExtendedMetrics(
  ts: string,
  er: number
): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const fleets = ["fleet-prod", "fleet-platform", "fleet-edge"];
  const n = Math.min(randInt(1, 3), fleets.length);
  const dataset = AZURE_METRICS_DATASET_MAP["kubernetes-fleet"]!;
  return Array.from({ length: n }, (_, i) => {
    const fleet = `${fleets[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "kubernetes_fleet", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.ContainerService/fleets",
      resourceName: fleet,
      armProviderSegments: ["Microsoft.ContainerService", "fleets", fleet],
      dimensions: { FleetName: fleet, MemberCluster: rand(["aks-west", "aks-east", "aks-npc-0"]) },
      metrics: {
        MemberCount: stat(dp(jitter(5 + (fail ? 2 : 6), 3, 0, 200))),
        FleetOperationCount: counter(randInt(0, fail ? 12_000 : 8_500)),
      },
    });
  });
}

export function generateServiceBusDedicatedExtendedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const entities = ["orders", "events", "audit"];
  const n = Math.min(randInt(1, 3), entities.length);
  const dataset = AZURE_METRICS_DATASET_MAP["service-bus"]!;
  return Array.from({ length: n }, (_, i) => {
    const ns = `sb-${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "service_bus", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.ServiceBus/namespaces",
      resourceName: ns,
      armProviderSegments: ["Microsoft.ServiceBus", "namespaces", ns],
      dimensions: { EntityName: entities[i]!, MessagingNamespace: ns },
      metrics: {
        IncomingRequests: counter(randInt(0, 3_200_000)),
        IncomingMessages: counter(randInt(0, 2_800_000)),
        OutgoingMessages: counter(randInt(0, 2_700_000)),
        ActiveConnections: stat(dp(jitter(180 + (fail ? 2_200 : 0), 420, 0, 50_000))),
        DeadletteredMessages: counter(fail ? randInt(20, 55_000) : randInt(0, 600)),
      },
    });
  });
}

export function generateSqlManagedInstanceDedicatedExtendedMetrics(
  ts: string,
  er: number
): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const instances = ["mi-prod", "mi-dr", "mi-analytics"];
  const n = Math.min(randInt(1, 3), instances.length);
  const dataset = AZURE_METRICS_DATASET_MAP["sql-managed-instance"]!;
  return Array.from({ length: n }, (_, i) => {
    const mi = `${instances[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(
      ts,
      "sql_managed_instance",
      dataset,
      region,
      subscription,
      resourceGroup,
      {
        namespace: "Microsoft.Sql/managedInstances",
        resourceName: mi,
        armProviderSegments: ["Microsoft.Sql", "managedInstances", mi],
        dimensions: { managedInstanceName: mi, DatabaseName: rand(["appdb", "dw", "staging"]) },
        metrics: {
          avg_cpu_percent: stat(dp(jitter(38 + (fail ? 52 : 0), 30, 0, 100))),
          io_bytes_read: counter(randInt(50_000_000, fail ? 420_000_000_000 : 280_000_000_000)),
          io_bytes_written: counter(randInt(40_000_000, fail ? 180_000_000_000 : 120_000_000_000)),
          storage_space_used_mb: stat(
            dp(jitter(48_000 + (fail ? 25_000 : 0), 18_000, 1024, 260_000))
          ),
        },
      }
    );
  });
}

export function generateLoadTestingDedicatedExtendedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const tests = ["checkout-spike", "api-soak", "report-stress"];
  const n = Math.min(randInt(1, 3), tests.length);
  const dataset = AZURE_METRICS_DATASET_MAP["load-testing"]!;
  return Array.from({ length: n }, (_, i) => {
    const lt = `lt-${randId(5).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "load_testing", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.LoadTestService/loadTests",
      resourceName: lt,
      armProviderSegments: ["Microsoft.LoadTestService", "loadTests", lt],
      dimensions: { TestName: tests[i]!, TestRunId: `run-${randId(6)}` },
      metrics: {
        VirtualUsers: stat(dp(jitter(420 + (fail ? 2_000 : 0), 380, 1, 50_000))),
        ResponseTime: stat(dp(jitter(185 + (fail ? 3_200 : 0), 140, 5, 120_000))),
        ErrorPercentage: stat(dp(jitter(fail ? 4.2 : 0.35, fail ? 3 : 0.2, 0, 100))),
      },
    });
  });
}

export function generateMachineLearningDedicatedExtendedMetrics(
  ts: string,
  er: number
): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const workspaces = ["mlw-core", "mlw-gpu", "mlw-experiments"];
  const n = Math.min(randInt(1, 3), workspaces.length);
  const dataset = AZURE_METRICS_DATASET_MAP["machine-learning"]!;
  return Array.from({ length: n }, (_, i) => {
    const ws = `${workspaces[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "machine_learning", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.MachineLearningServices/workspaces",
      resourceName: ws,
      armProviderSegments: ["Microsoft.MachineLearningServices", "workspaces", ws],
      dimensions: { WorkspaceName: ws, ClusterName: rand(["cpu-cluster", "gpu-a100"]) },
      metrics: {
        CompletedRuns: counter(randInt(0, fail ? 4_200 : 5_500)),
        FailedRuns: counter(fail ? randInt(8, 420) : randInt(0, 12)),
        ModelDeployCount: counter(randInt(0, 180)),
        QuotaUtilizationPercentage: stat(dp(jitter(42 + (fail ? 38 : 0), 28, 0, 100))),
      },
    });
  });
}

export function generateSentinelDedicatedExtendedMetrics(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const workspaces = ["law-sentinel-prod", "law-soc", "law-dev"];
  const n = Math.min(randInt(1, 3), workspaces.length);
  const dataset = AZURE_METRICS_DATASET_MAP.sentinel!;
  return Array.from({ length: n }, (_, i) => {
    const w = `${workspaces[i]}-${randId(4).toLowerCase()}`;
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "sentinel", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.OperationalInsights/workspaces",
      resourceName: w,
      armProviderSegments: ["Microsoft.OperationalInsights", "workspaces", w],
      dimensions: { WorkspaceName: w, Solution: "SecurityInsights" },
      metrics: {
        IncidentsCreated: counter(randInt(0, fail ? 280 : 120)),
        IncidentsClosed: counter(randInt(0, fail ? 200 : 140)),
        AutomationRulesTriggered: counter(randInt(0, fail ? 4_200 : 2_800)),
      },
    });
  });
}

export function generateDefenderForCloudDedicatedExtendedMetrics(
  ts: string,
  er: number
): EcsDocument[] {
  const { region, subscription, resourceGroup } = pickAzureContext();
  const scopes = ["sub-scan-a", "sub-scan-b", "mg-platform"];
  const n = Math.min(randInt(1, 3), scopes.length);
  const dataset = AZURE_METRICS_DATASET_MAP["defender-for-cloud"]!;
  return Array.from({ length: n }, (_, i) => {
    const fail = Math.random() < er;
    return azureMetricDoc(ts, "defender_for_cloud", dataset, region, subscription, resourceGroup, {
      namespace: "Microsoft.Security/locations",
      resourceName: "eastus",
      armProviderSegments: ["Microsoft.Security", "locations", "eastus"],
      dimensions: { Assessment: scopes[i]!, Severity: rand(["High", "Medium", "Low"]) },
      metrics: {
        SecureScore: stat(dp(jitter(fail ? 58 : 86, 14, 0, 100))),
        RecommendationsCount: counter(randInt(120, fail ? 18_000 : 8_500)),
        AlertCount: counter(fail ? randInt(25, 920) : randInt(0, 45)),
      },
    });
  });
}
