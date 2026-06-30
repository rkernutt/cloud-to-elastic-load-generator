import {
  type EcsDocument,
  rand,
  randInt,
  randFloat,
  randId,
  randIp,
  azureCloud,
  makeAzureSetup,
  randUUID,
  USER_AGENTS,
  FIRST_NAMES,
  LAST_NAMES,
  EMAIL_DOMAINS,
  azureDiagnosticTime,
} from "./helpers.js";

type NetworkingAzureErr = { code: string; message: string; type: "azure" };

const NETWORK_EXTENDED_ERR_CODES = [
  "SubnetInUse",
  "NetworkSecurityGroupInUse",
  "LoadBalancerInUseByVirtualMachineScaleSet",
  "PrivateEndpointNotFound",
  "DnsRecordInUse",
] as const;

function networkingExtendedErrDetail(code: (typeof NETWORK_EXTENDED_ERR_CODES)[number]): string {
  switch (code) {
    case "SubnetInUse":
      return "The subnet references active IP configurations or delegation and cannot be modified.";
    case "NetworkSecurityGroupInUse":
      return "The network security group is still associated with one or more subnets or NICs.";
    case "LoadBalancerInUseByVirtualMachineScaleSet":
      return "Backend pool members from a Virtual Machine Scale Set block deletion or SKU change.";
    case "PrivateEndpointNotFound":
      return "Referenced private endpoint or NIC linkage was missing or orphaned.";
    case "DnsRecordInUse":
      return "DNS record set is referenced by resolver policy or a conflicting delegation.";
    default:
      return "Azure Networking rejected the requested change.";
  }
}

function withNetworkingExtendedAzureErrors(
  isErr: boolean,
  variant: string,
  props: Record<string, unknown>
): { properties: Record<string, unknown>; error?: NetworkingAzureErr } {
  if (!isErr) return { properties: props };
  const code = rand([...NETWORK_EXTENDED_ERR_CODES]);
  const message = networkingExtendedErrDetail(code);
  const armStatusEligible = variant === "admin" || variant.includes("provision");
  return {
    properties: armStatusEligible
      ? {
          ...props,
          statusMessage: {
            error: {
              code,
              message: `ARM provisioning: ${message}`,
            },
          },
        }
      : props,
    error: { code, message, type: "azure" },
  };
}

function armNsg(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Network/networkSecurityGroups/${name}`;
}

function armNatGw(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Network/natGateways/${name}`;
}

function armPrivateEndpoint(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Network/privateEndpoints/${name}`;
}

function armPrivateDnsZone(sub: string, rg: string, zone: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Network/privateDnsZones/${zone}`;
}

function armTrafficManager(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Network/trafficmanagerprofiles/${name}`;
}

function armDdosPlan(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Network/ddosProtectionPlans/${name}`;
}

function armBastion(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Network/bastionHosts/${name}`;
}

function armWafPolicy(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies/${name}`;
}

function armVirtualWan(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Network/virtualWans/${name}`;
}

function armRouteServer(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Network/routeServers/${name}`;
}

function armNetworkWatcher(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Network/networkWatchers/${name}`;
}

function armVpnGateway(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Network/virtualNetworkGateways/${name}`;
}

function armFirewallPolicy(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Network/firewallPolicies/${name}`;
}

function armExpressRouteCircuit(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Network/expressRouteCircuits/${name}`;
}

/** NSG flow logs, rule evaluation, and administrative rule changes. */
export function generateNetworkSecurityGroupsLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const nsg = `nsg-${rand(["app", "edge", "data"])}-${randId(5).toLowerCase()}`;
  const resourceId = armNsg(subscription.id, resourceGroup, nsg);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "flow",
    "rule_eval",
    "admin",
    "effective_routes",
    "association_change",
    "cap_burst",
  ] as const);

  if (variant === "flow") {
    const props = {
      macAddress: `${randInt(10, 60).toString(16).padStart(2, "0")}-${randId(4)}-${randId(4)}`,
      ruleName: rand(["AllowAzureLoadBalancerInBound", "DenyInternetOutBound", "UserRule-SSH"]),
      direction: rand(["In", "Out"]),
      flowType: isErr ? "Deny" : "Allow",
      srcAddr: randIp(),
      destAddr: randIp(),
      destPort: randInt(22, 65534),
      protocol: rand(["T", "U", "A"]),
    };
    const { properties: nfProps, error: nfErr } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Network/networkSecurityGroups/flowlogs/write",
      category: "NetworkSecurityGroupFlowEvent",
      resultType: isErr ? "Denied" : "Allowed",
      resultSignature: isErr ? "403" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: nfProps,
      ...(nfErr ? { error: nfErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/networkSecurityGroups"),
      azure: {
        network_security_groups: {
          nsg_name: nsg,
          resource_group: resourceGroup,
          category: "NetworkSecurityGroupFlowEvent",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("Microsoft.Network/networkSecurityGroups/flowlogs/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e5, 6e8),
      },
      message: isErr
        ? `NSG ${nsg}: flow denied ${props.protocol} ${props.srcAddr}→${props.destAddr}:${props.destPort} (${props.ruleName})`
        : `NSG ${nsg}: flow allowed ${props.direction} ${props.destAddr}:${props.destPort}`,
    };
  }

  if (variant === "rule_eval") {
    const props = {
      conditionsMatched: isErr ? "false" : "true",
      priority: randInt(100, 4096),
      matchedRule: isErr ? "ImplicitDeny" : rand(["SecurityRule-AllowVNet", "SecurityRule-HTTPS"]),
      packetsDropped: isErr ? randInt(10, 5000) : 0,
    };
    const { properties: nrProps, error: nrErr } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "NetworkSecurityGroupRuleCounter",
      category: "NetworkSecurityGroupEvent",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "1" : "0",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: nrProps,
      ...(nrErr ? { error: nrErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/networkSecurityGroups"),
      azure: {
        network_security_groups: {
          nsg_name: nsg,
          resource_group: resourceGroup,
          category: "NetworkSecurityGroupEvent",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("NetworkSecurityGroupRuleCounter"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e6, 2e8),
      },
      message: isErr
        ? `NSG ${nsg}: rule evaluation dropped traffic (implicit deny)`
        : `NSG ${nsg}: security rule ${props.matchedRule} matched`,
    };
  }

  if (variant === "effective_routes") {
    const props = {
      nicResourceId: `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/networkInterfaces/nic-${randId(4)}`,
      destPrefix: `${randInt(10, 172)}.${randInt(0, 255)}.0.0/16`,
      nextHopType: rand(["Internet", "VnetLocal"]),
      conflictingRule: rand(["InternetSystemRoute", "UserDefinedRoute-EastUS"]),
      result: isErr ? "BlackholeSuspected" : "ExpectedPath",
      message: isErr
        ? "EffectiveRoute: traffic hairpinned due to contradictory UDR and service tag route"
        : "Effective routes align with topology intent matrix",
      hopCountEstimated: randInt(2, 6),
    };
    const { properties: erProps, error: erErr } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Network/networkInterfaces/effectiveRoutes/action",
      category: "NetworkSecurityGroupDiagnostics",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.result,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: erProps,
      ...(erErr ? { error: erErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/networkSecurityGroups"),
      azure: {
        network_security_groups: {
          nsg_name: nsg,
          resource_group: resourceGroup,
          category: "NetworkSecurityGroupDiagnostics",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("Microsoft.Network/networkInterfaces/effectiveRoutes/action"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(8e8, 3e10),
      },
      message: `[nsg-er] ${nsg}: ${props.message}`,
    };
  }

  if (variant === "association_change") {
    const props = {
      subnetResourceId: `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/virtualNetworks/vnet-core/subnets/snet-apps`,
      changeType: isErr ? "DetachFailed" : "Attached",
      asgReferenced: `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/applicationSecurityGroups/asg-${randId(4)}`,
      provisioningOperation: "Microsoft.Network/networkSecurityGroups/subnets/action",
      message: isErr
        ? "Cannot associate NSG: subnet delegation Microsoft.Sql prevents securityRule updates"
        : "Subnet association propagated to flow log pipeline within SLA",
      appliedRuleCountPre: randInt(20, 80),
      appliedRuleCountPost: randInt(20, 85),
    };
    const { properties: ascProps, error: ascErr } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Network/networkSecurityGroups/write",
      category: "NetworkSecurityGroupAssociationTrace",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.changeType,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: ascProps,
      ...(ascErr ? { error: ascErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/networkSecurityGroups"),
      azure: {
        network_security_groups: {
          nsg_name: nsg,
          resource_group: resourceGroup,
          category: "NetworkSecurityGroupAssociationTrace",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("Microsoft.Network/networkSecurityGroups/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e9, 8e10),
      },
      message: `[assoc] NSG ${nsg}: ${props.message}`,
    };
  }

  if (variant === "cap_burst") {
    const props = {
      meteringWindow: `PT${rand(["1", "5"])}M`,
      newConnectionsObservedPerSec: isErr ? randInt(8000, 50000) : randInt(200, 4000),
      maxRulesEvaluatedParallel: randInt(32, 256),
      throttledEvaluationsPct: isErr ? randFloat(4, 38) : randFloat(0, 2.5),
      message: isErr
        ? "NSG datapath metering throttled evaluations during burst ingress from CDN edge POP"
        : "Rule evaluation backlog cleared; capacity headroom nominal",
      hardwareGeneration: rand(["FastPath", "Standard"]),
    };
    const { properties: cbProps, error: cbErr } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Insights/diagnosticSettings/write",
      category: "NetworkSecurityGroupCapacitySignals",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "Throttled" : "Healthy",
      callerIpAddress: "168.63.129.16",
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: cbProps,
      ...(cbErr ? { error: cbErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/networkSecurityGroups"),
      azure: {
        network_security_groups: {
          nsg_name: nsg,
          resource_group: resourceGroup,
          category: "NetworkSecurityGroupCapacitySignals",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("Microsoft.Insights/diagnosticSettings/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e9, 1.2e10),
      },
      message: `[meter] NSG ${nsg}: ${props.message}`,
    };
  }

  const rule = `sr-${rand(["https", "jump", "db"])}-${randId(3)}`;
  const op = isErr
    ? "Microsoft.Network/networkSecurityGroups/securityRules/write"
    : rand([
        "Microsoft.Network/networkSecurityGroups/securityRules/write",
        "Microsoft.Network/networkSecurityGroups/securityRules/delete",
      ]);
  const props = {
    entity: resourceId,
    eventCategory: "Administrative",
    status: isErr ? "Failed" : "Succeeded",
    securityRule: rule,
    httpRequest: {
      clientRequestId: randUUID(),
      clientIpAddress: callerIp,
      method: rand(["PUT", "DELETE"]),
    },
    errorCode: isErr ? rand(["SecurityRuleConflict", "InvalidResourceReference"]) : "",
  };
  const { properties: nmProps, error: nmErr } = withNetworkingExtendedAzureErrors(
    isErr,
    variant,
    props as Record<string, unknown>
  );
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: op,
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? rand(["409", "400"]) : "200",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Informational",
    properties: nmProps,
    ...(nmErr ? { error: nmErr } : {}),
    cloud: azureCloud(region, subscription, "Microsoft.Network/networkSecurityGroups"),
    azure: {
      network_security_groups: {
        nsg_name: nsg,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        security_rule: rule,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["network"],
      type: isErr ? ["denied"] : ["connection"],
      action: String(op),
      outcome: isErr ? "failure" : "success",
      duration: randInt(1e8, 4e9),
    },
    message: isErr
      ? `Activity: security rule ${rule} on NSG ${nsg} failed (${String(props.errorCode)})`
      : `Activity: security rule ${rule} updated on ${nsg}`,
  };
}

/** NAT Gateway SNAT metrics and connection path diagnostics. */
export function generateNatGatewayLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const nat = `nat-${rand(["egress", "hub", "spoke"])}-${randId(5).toLowerCase()}`;
  const resourceId = armNatGw(subscription.id, resourceGroup, nat);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "snat",
    "path",
    "admin",
    "prefix_exhaust",
    "cross_zone_lb",
    "idle_reset",
  ] as const);

  if (variant === "snat") {
    const allocated = randInt(1024, 65_536);
    const used = isErr
      ? randInt(Math.floor(allocated * 0.92), allocated)
      : randInt(100, Math.floor(allocated * 0.4));
    const props = {
      publicIpPrefix: `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/publicIPPrefixes/ippfx-${randId(3)}`,
      allocatedSnatPorts: allocated,
      usedSnatPorts: used,
      portExhaustionRisk: isErr ? "High" : "Low",
      protocol: rand(["TCP", "UDP"]),
    };
    const { properties: ntSProps, error: ntSErr } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "NatGatewaySnatUsage",
      category: "NatGatewayMetricEvent",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "507" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: ntSProps,
      ...(ntSErr ? { error: ntSErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/natGateways"),
      azure: {
        nat_gateway: {
          name: nat,
          resource_group: resourceGroup,
          category: "NatGatewayMetricEvent",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("NatGatewaySnatUsage"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e6, 3e8),
      },
      message: isErr
        ? `NAT Gateway ${nat}: SNAT port pressure used=${used}/${allocated}`
        : `NAT Gateway ${nat}: SNAT usage healthy (${used}/${allocated})`,
    };
  }

  if (variant === "path") {
    const props = {
      srcPrivateIp: `${randInt(10, 10)}.${randInt(0, 5)}.${randInt(0, 255)}.${randInt(2, 250)}`,
      destPublicIp: randIp(),
      destPort: rand([443, 80, 22, 8443]),
      translatedSourceIp: randIp(),
      datapathStatus: isErr ? "Dropped" : "Forwarded",
      dropReason: isErr ? rand(["ICMPUnreachable", "PolicyBlock", "IdleTimeout"]) : "",
    };
    const { properties: ntPProps, error: ntPErr } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "NatGatewayConnectionEvent",
      category: "NatGatewayFlowLog",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "504" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: ntPProps,
      ...(ntPErr ? { error: ntPErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/natGateways"),
      azure: {
        nat_gateway: {
          name: nat,
          resource_group: resourceGroup,
          category: "NatGatewayFlowLog",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("NatGatewayConnectionEvent"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e5, 2e8),
      },
      message: isErr
        ? `NAT ${nat}: outbound flow dropped (${String(props.dropReason)})`
        : `NAT ${nat}: SNAT ${props.srcPrivateIp}→${props.destPublicIp}:${props.destPort}`,
    };
  }

  if (variant === "prefix_exhaust") {
    const props = {
      publicIpPrefixName: `ippfx-nat-${randId(4)}`,
      prefixesAvailable: isErr ? 0 : randInt(8, 64),
      prefixesAllocatedToNat: isErr ? randInt(480, 512) : randInt(128, 400),
      requestOperation: "Microsoft.Network/natGateways/publicIPPrefixes/write",
      outcome: isErr ? "InsufficientPrefixSpace" : "CapacityOk",
      message: isErr
        ? "NAT cannot attach additional /28 from prefix: delegated subscription quota capped"
        : "Public IP Prefix allocation replenished ahead of spike window",
      regionalCapacityHeadroomPct: randFloat(isErr ? 0.05 : 0.18, isErr ? 0.35 : 0.62),
    };
    const { properties: nxProps2, error: nxErr2 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: props.requestOperation,
      category: "NatGatewayPrefixCapacity",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.outcome,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: nxProps2,
      ...(nxErr2 ? { error: nxErr2 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/natGateways"),
      azure: {
        nat_gateway: {
          name: nat,
          resource_group: resourceGroup,
          category: "NatGatewayPrefixCapacity",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String(props.requestOperation),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e8, 4e10),
      },
      message: `[prefix] NAT ${nat}: ${props.message}`,
    };
  }

  if (variant === "cross_zone_lb") {
    const props = {
      illbResourceId: `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/loadBalancers/ilb-${randId(4)}`,
      zonePair: rand([
        ["1", "3"],
        ["2", "3"],
      ]).join("|"),
      probeDownStreamNics: isErr ? randInt(4, 40) : 0,
      dataplaneFailoverTriggered: isErr,
      mitigation: isErr
        ? "shifted egress path to standby NAT GW in paired zone slice"
        : "no asymmetric routing detected vs ILB probes",
      flowSymmetryScore: randFloat(isErr ? 0.41 : 0.88, isErr ? 0.71 : 0.995),
    };
    const { properties: czProps, error: czErr } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Network/natGateways/connectionHealth/read",
      category: "NatGatewayZoneAlignment",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "AsymmetricDetected" : "Symmetric",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: czProps,
      ...(czErr ? { error: czErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/natGateways"),
      azure: {
        nat_gateway: {
          name: nat,
          resource_group: resourceGroup,
          category: "NatGatewayZoneAlignment",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("Microsoft.Network/natGateways/connectionHealth/read"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e9, 7e10),
      },
      message: `[zonal] NAT ${nat}: ILB linkage ${props.illbResourceId.split("/").pop()} (${props.zonePair})`,
    };
  }

  if (variant === "idle_reset") {
    const props = {
      connectionId: randUUID(),
      idleTimeoutSeconds: rand([240, 600, 1200]),
      resetReason: isErr ? "HalfOpenDetected" : "Graceful FIN",
      lastPayloadBytesDelta: randInt(0, 4096),
      tcpStateBefore: rand(["TIME_WAIT", "ESTABLISHED", "SYN_SENT"]),
      message: isErr
        ? "NAT prematurely cleared mapping while server still held session in CLOSE_WAIT"
        : "NAT idle cleanup matched configured timeout policy matrix",
      packetCaptureHint: `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/networkWatchers/NetworkWatcher_${region}`,
    };
    const { properties: irProps, error: irErr } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "NatGatewayTcpResetEvent",
      category: "NatGatewaySessionTelemetry",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.resetReason,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: irProps,
      ...(irErr ? { error: irErr } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/natGateways"),
      azure: {
        nat_gateway: {
          name: nat,
          resource_group: resourceGroup,
          category: "NatGatewaySessionTelemetry",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("NatGatewayTcpResetEvent"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(8e8, 2e10),
      },
      message: `[idle] NAT ${nat}: ${props.message}`,
    };
  }

  const op = isErr
    ? "Microsoft.Network/natGateways/write"
    : rand(["Microsoft.Network/natGateways/write", "Microsoft.Network/natGateways/delete"]);
  const props = {
    entity: resourceId,
    eventCategory: "Administrative",
    status: isErr ? "Failed" : "Succeeded",
    errorCode: isErr ? rand(["NatGatewaySubnetLocked", "TooManyNatGateways"]) : "",
    httpRequest: {
      clientRequestId: randUUID(),
      clientIpAddress: callerIp,
      method: rand(["PUT", "DELETE"]),
    },
  };
  const { properties: ntAProps, error: ntAErr } = withNetworkingExtendedAzureErrors(
    isErr,
    variant,
    props as Record<string, unknown>
  );
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: op,
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? rand(["409", "429"]) : "200",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Informational",
    properties: ntAProps,
    ...(ntAErr ? { error: ntAErr } : {}),
    cloud: azureCloud(region, subscription, "Microsoft.Network/natGateways"),
    azure: {
      nat_gateway: {
        name: nat,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["network"],
      type: isErr ? ["denied"] : ["connection"],
      action: String(op),
      outcome: isErr ? "failure" : "success",
      duration: randInt(1e8, 4e9),
    },
    message: isErr
      ? `NAT Gateway ${nat}: control-plane operation failed`
      : `NAT Gateway ${nat}: ${op} succeeded`,
  };
}

/** Private Endpoint connection lifecycle and link status. */
export function generatePrivateLinkLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const pe = `pe-${rand(["sql", "kv", "st"])}-${randId(5).toLowerCase()}`;
  const resourceId = armPrivateEndpoint(subscription.id, resourceGroup, pe);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "connection",
    "dns",
    "nic_link_audit",
    "service_consumer_scale",
    "dns_integrity_cross_vnet",
    "admin",
  ] as const);

  if (variant === "connection") {
    const props = {
      privateLinkServiceId: `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/privateLinkServices/pls-${randId(4)}`,
      connectionStatus: isErr
        ? rand(["Disconnected", "Rejected"])
        : rand(["Approved", "Pending", "Approved"]),
      requesterTenantId: randUUID(),
      privateEndpointIp: `${randInt(10, 10)}.${randInt(40, 50)}.${randInt(0, 255)}.${randInt(2, 250)}`,
      subResource: rand(["sqlServer", "vault", "blob", "sites"]),
    };
    const { properties: peProps1, error: peErr1 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "PrivateEndpointConnectionEvent",
      category: "PrivateEndpointConnectionProxy",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "403" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: peProps1,
      ...(peErr1 ? { error: peErr1 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/privateEndpoints"),
      azure: {
        private_link: {
          endpoint_name: pe,
          resource_group: resourceGroup,
          category: "PrivateEndpointConnectionProxy",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("PrivateEndpointConnectionEvent"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e7, 9e8),
      },
      message: isErr
        ? `Private Link ${pe}: connection ${props.connectionStatus} for ${props.subResource}`
        : `Private Link ${pe}: endpoint linked (${props.privateEndpointIp})`,
    };
  }

  if (variant === "dns") {
    const props = {
      privateDnsZone: `privatelink.${rand(["database.windows.net", "blob.core.windows.net", "vault.azure.net"])}`,
      recordSet: pe,
      resolutionResult: isErr ? "NXDOMAIN" : "NOERROR",
      queriedFromVnet: `vnet-${randId(4)}`,
    };
    const { properties: peProps2, error: peErr2 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "PrivateEndpointDnsResolution",
      category: "PrivateDnsIntegration",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "502" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: peProps2,
      ...(peErr2 ? { error: peErr2 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/privateEndpoints"),
      azure: {
        private_link: {
          endpoint_name: pe,
          resource_group: resourceGroup,
          category: "PrivateDnsIntegration",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("PrivateEndpointDnsResolution"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e6, 4e8),
      },
      message: isErr
        ? `Private Endpoint ${pe}: DNS resolution failed for ${props.privateDnsZone}`
        : `Private Endpoint ${pe}: resolved ${props.privateDnsZone} (${props.resolutionResult})`,
    };
  }

  if (variant === "nic_link_audit") {
    const nicId = `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/networkInterfaces/nic-pe-${randId(4)}`;
    const props = {
      linkedNicResourceId: nicId,
      ipConfigName: rand(["ipconfig1", "pe-ipconfig"]),
      linkState: isErr ? rand(["StaleReference", "OrphanPending"]) : "Healthy",
      privateLinkServiceFqdnMismatch: isErr,
      message: isErr
        ? "Private endpoint NIC private IP config still references dissolved PLS connection"
        : "NIC IP configuration aligns with stable private endpoint linkage",
      evaluationWindowSec: randInt(30, 600),
    };
    const { properties: peProps3, error: peErr3 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "PrivateEndpointNicLinkConsistency",
      category: "PrivateEndpointNicAudit",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "409" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: peProps3,
      ...(peErr3 ? { error: peErr3 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/privateEndpoints"),
      azure: {
        private_link: {
          endpoint_name: pe,
          resource_group: resourceGroup,
          category: "PrivateEndpointNicAudit",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("PrivateEndpointNicLinkConsistency"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e7, 5e9),
      },
      message: `[nic] Private Link ${pe}: ${props.message}`,
    };
  }

  if (variant === "service_consumer_scale") {
    const props = {
      privateLinkServiceAlias: rand(["pls-sql-eastus-alias", "pls-stor-private-alias"]),
      concurrentConnectionsObserved: isErr ? randInt(4000, 12000) : randInt(200, 1800),
      scaleUnitSaturationPct: randFloat(isErr ? 92 : 12, isErr ? 99.9 : 55),
      backPressureApplied: isErr,
      remediationHint: isErr
        ? "request PLS subnet scale-out or shard consumers across stamps"
        : "headroom nominal for advertised RPS envelope",
      stamp: `${region}-${randId(3)}`,
    };
    const { properties: peProps4, error: peErr4 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "PrivateLinkServiceConsumptionMeter",
      category: "PrivateEndpointScaleSignals",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "429" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: peProps4,
      ...(peErr4 ? { error: peErr4 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/privateEndpoints"),
      azure: {
        private_link: {
          endpoint_name: pe,
          resource_group: resourceGroup,
          category: "PrivateEndpointScaleSignals",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("PrivateLinkServiceConsumptionMeter"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e7, 6e9),
      },
      message: `[scale] Private Link ${pe}: PLS alias ${props.privateLinkServiceAlias} saturation ${props.scaleUnitSaturationPct.toFixed(1)}%`,
    };
  }

  if (variant === "dns_integrity_cross_vnet") {
    const props = {
      hubVnetResolver: `resolver-hub-${randId(3)}`,
      spokeVnetId: `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/virtualNetworks/vnet-spoke-${randId(3)}`,
      conditionalForwardHits: isErr ? 0 : randInt(3, 64),
      soaMismatch: isErr,
      chainOutcome: isErr ? "DelegationBreak" : "PrivateZoneMatched",
      message: isErr
        ? "Resolver chain saw SOA TTL drift vs authoritative private zone delegation"
        : "Cross-VNet resolver policy satisfied private zone completeness checks",
      policyScope: rand(["subnet", "virtualNetwork"]),
    };
    const { properties: peProps5, error: peErr5 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "PrivateEndpointDnsChainValidation",
      category: "PrivateEndpointDnsDelegationTrace",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "422" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: peProps5,
      ...(peErr5 ? { error: peErr5 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/privateEndpoints"),
      azure: {
        private_link: {
          endpoint_name: pe,
          resource_group: resourceGroup,
          category: "PrivateEndpointDnsDelegationTrace",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("PrivateEndpointDnsChainValidation"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e8, 7e9),
      },
      message: `[dns-chain] PE ${pe}: ${props.chainOutcome}`,
    };
  }

  const op = isErr
    ? "Microsoft.Network/privateEndpoints/write"
    : rand([
        "Microsoft.Network/privateEndpoints/write",
        "Microsoft.Network/privateEndpoints/delete",
      ]);
  const props = {
    entity: resourceId,
    eventCategory: "Administrative",
    status: isErr ? "Failed" : "Succeeded",
    errorCode: isErr
      ? rand(["PrivateEndpointCannotBeCreatedInSubnet", "ReferencedResourceNotProvisioned"])
      : "",
    httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
  };
  const { properties: peAProps, error: peAErr } = withNetworkingExtendedAzureErrors(
    isErr,
    variant,
    props as Record<string, unknown>
  );
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: op,
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? rand(["400", "409"]) : "200",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Informational",
    properties: peAProps,
    ...(peAErr ? { error: peAErr } : {}),
    cloud: azureCloud(region, subscription, "Microsoft.Network/privateEndpoints"),
    azure: {
      private_link: {
        endpoint_name: pe,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["network"],
      type: isErr ? ["denied"] : ["connection"],
      action: String(op),
      outcome: isErr ? "failure" : "success",
      duration: randInt(1e8, 5e9),
    },
    message: isErr
      ? `Private endpoint ${pe}: ARM operation failed`
      : `Private endpoint ${pe}: provisioning completed`,
  };
}

/** Private DNS zone record changes and optional query logging style events. */
export function generatePrivateDnsLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const zone = `${rand(["meridiantech", "cascadeops"])}.internal`;
  const resourceId = armPrivateDnsZone(subscription.id, resourceGroup, zone);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "recordset_provision",
    "vnet_link_provision",
    "query",
    "delegation_audit",
    "autoreg_conflict",
    "admin",
  ] as const);
  const recordName = rand(["api", "db", "vault", "files"]);

  if (variant === "recordset_provision") {
    const op = isErr
      ? "Microsoft.Network/privateDnsZones/recordSets/write"
      : rand([
          "Microsoft.Network/privateDnsZones/recordSets/write",
          "Microsoft.Network/privateDnsZones/recordSets/delete",
        ]);
    const props = {
      entity: resourceId,
      eventCategory: "Administrative",
      recordType: rand(["A", "AAAA", "CNAME"]),
      recordSet: `${recordName}.${zone}`,
      ttl: randInt(60, 3600),
      status: isErr ? "Failed" : "Succeeded",
      errorCode: isErr ? rand(["Conflict", "RecordSetAlreadyExists"]) : "",
    };
    const { properties: pdProps1, error: pdErr1 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: op,
      category: "Administrative",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "409" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: pdProps1,
      ...(pdErr1 ? { error: pdErr1 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/privateDnsZones"),
      azure: {
        private_dns: {
          zone,
          resource_group: resourceGroup,
          category: "Administrative",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String(op),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e8, 3e9),
      },
      message: isErr
        ? `Private DNS ${zone}: record set update failed for ${props.recordSet}`
        : `Private DNS ${zone}: ${props.recordType} record ${props.recordSet} updated`,
    };
  }

  if (variant === "vnet_link_provision") {
    const props = {
      virtualNetworkLink: `vnetlink-${randId(4)}`,
      vnetId: `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/virtualNetworks/vnet-${randId(4)}`,
      registrationEnabled: rand([true, false]),
      linkStatus: isErr ? "Failed" : "Completed",
      provisioningState: isErr ? "Failed" : "Succeeded",
    };
    const { properties: pdProps2, error: pdErr2 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Network/privateDnsZones/virtualNetworkLinks/write",
      category: "PrivateDnsVirtualNetworkLink",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "500" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: pdProps2,
      ...(pdErr2 ? { error: pdErr2 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/privateDnsZones"),
      azure: {
        private_dns: {
          zone,
          resource_group: resourceGroup,
          category: "PrivateDnsVirtualNetworkLink",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("Microsoft.Network/privateDnsZones/virtualNetworkLinks/write"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e8, 4e9),
      },
      message: isErr
        ? `Private DNS ${zone}: VNet link ${props.virtualNetworkLink} failed`
        : `Private DNS ${zone}: linked to ${props.virtualNetworkLink}`,
    };
  }

  if (variant === "query") {
    const props = {
      queryName: `${recordName}.${zone}`,
      queryType: rand(["A", "AAAA"]),
      clientIp: `${randInt(10, 10)}.${randInt(0, 5)}.${randInt(0, 255)}.${randInt(2, 250)}`,
      responseCode: isErr ? "SERVFAIL" : "NOERROR",
      answerCount: isErr ? 0 : randInt(1, 4),
      queryTimeMs: randFloat(0.5, isErr ? 200 : 12),
    };
    const { properties: pdProps3, error: pdErr3 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "PrivateDnsQueryLog",
      category: "PrivateDnsQueryLogs",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "503" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: pdProps3,
      ...(pdErr3 ? { error: pdErr3 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/privateDnsZones"),
      azure: {
        private_dns: {
          zone,
          resource_group: resourceGroup,
          category: "PrivateDnsQueryLogs",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("PrivateDnsQueryLog"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e5, 2e7),
      },
      message: isErr
        ? `Private DNS query failed: ${props.queryName} (${props.responseCode})`
        : `Private DNS query: ${props.queryName} ${props.queryType} answers=${props.answerCount}`,
    };
  }

  if (variant === "delegation_audit") {
    const props = {
      parentZoneFqdn: `${rand(["corp", "platform"])}.internal`,
      delegationNsdname: `ns${randId(2)}-azure-dns.com`,
      glueRecordConsistent: !isErr,
      soaSerialDrift: isErr ? randInt(2, 40) : 0,
      chainDepth: randInt(2, 5),
      outcome: isErr ? "BrokenDelegation" : "Verified",
      message: isErr
        ? "Authoritative parent NS set diverged from child zone glue during replication window"
        : "Delegation chain integrity check passed within RTO budget",
    };
    const { properties: pdProps4, error: pdErr4 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "PrivateDnsDelegationIntegrity",
      category: "PrivateDnsDelegationAudit",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "502" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: pdProps4,
      ...(pdErr4 ? { error: pdErr4 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/privateDnsZones"),
      azure: {
        private_dns: {
          zone,
          resource_group: resourceGroup,
          category: "PrivateDnsDelegationAudit",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("PrivateDnsDelegationIntegrity"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e6, 4e8),
      },
      message: `[deleg] Private DNS ${zone}: ${props.outcome}`,
    };
  }

  if (variant === "autoreg_conflict") {
    const props = {
      vmResourceId: `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Compute/virtualMachines/vm-${randId(4)}`,
      desiredHostname: `${recordName}-auto`,
      conflictType: isErr ? rand(["DuplicateARecord", "ReversePtrCollision"]) : "None",
      autoRegistrationEnabled: true,
      repairAction: isErr ? "PendingManualMerge" : "IdempotentUpdate",
      message: isErr
        ? "Autoregistration attempted to create clashing A record against managed SOA policy"
        : "VM autoregistration reconciled hostname without collision",
    };
    const { properties: pdProps5, error: pdErr5 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "PrivateDnsAutoRegistrationEvent",
      category: "PrivateDnsVmAutoreg",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "409" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: pdProps5,
      ...(pdErr5 ? { error: pdErr5 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/privateDnsZones"),
      azure: {
        private_dns: {
          zone,
          resource_group: resourceGroup,
          category: "PrivateDnsVmAutoreg",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("PrivateDnsAutoRegistrationEvent"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e7, 5e9),
      },
      message: `[autoreg] ${zone}: ${props.message}`,
    };
  }

  const op = isErr
    ? "Microsoft.Network/privateDnsZones/write"
    : rand(["Microsoft.Network/privateDnsZones/write", "Microsoft.Network/privateDnsZones/delete"]);
  const props = {
    entity: resourceId,
    eventCategory: "Administrative",
    status: isErr ? "Failed" : "Succeeded",
    errorCode: isErr ? rand(["PrivateZoneInUse", "DnsZoneNameNotAvailable"]) : "",
    httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
  };
  const { properties: pdAProps, error: pdAErr } = withNetworkingExtendedAzureErrors(
    isErr,
    variant,
    props as Record<string, unknown>
  );
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: op,
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? rand(["400", "409"]) : "200",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Informational",
    properties: pdAProps,
    ...(pdAErr ? { error: pdAErr } : {}),
    cloud: azureCloud(region, subscription, "Microsoft.Network/privateDnsZones"),
    azure: {
      private_dns: {
        zone,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["network"],
      type: isErr ? ["denied"] : ["connection"],
      action: String(op),
      outcome: isErr ? "failure" : "success",
      duration: randInt(1e8, 4e9),
    },
    message: isErr
      ? `Private DNS zone ${zone}: ARM operation failed`
      : `Private DNS zone ${zone}: ${op} completed`,
  };
}

/** Traffic Manager health probes and routing decisions. */
export function generateTrafficManagerLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const profile = `tm-${rand(["global", "failover"])}-${randId(4).toLowerCase()}`;
  const resourceId = armTrafficManager(subscription.id, resourceGroup, profile);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "probe",
    "routing",
    "warmup_window",
    "endpoint_drain",
    "geo_redirect_map",
    "admin",
  ] as const);
  const endpoint = `ep-${rand(["westus2", "eastus"])}-${randId(3)}`;

  if (variant === "probe") {
    const props = {
      endpointName: endpoint,
      probeTarget: rand([
        "https://api.meridiantech.io/health",
        "https://web.meridiantech.io/",
        "tcp://10.0.1.4:443",
      ]),
      probeStatus: isErr ? "Degraded" : rand(["Healthy", "Healthy", "Unknown"]),
      httpStatusCode: isErr ? rand([0, 408, 503]) : 200,
      failureReason: isErr ? rand(["Timeout", "TcpReset", "CertificateError"]) : "",
    };
    const { properties: tmProps1, error: tmErr1 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "TrafficManagerEndpointProbeResult",
      category: "ProbeHealthStatusEvents",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "503" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: tmProps1,
      ...(tmErr1 ? { error: tmErr1 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/trafficmanagerprofiles"),
      azure: {
        traffic_manager: {
          profile_name: profile,
          resource_group: resourceGroup,
          category: "ProbeHealthStatusEvents",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("TrafficManagerEndpointProbeResult"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e5, 3e8),
      },
      message: isErr
        ? `Traffic Manager ${profile}: probe failed for ${endpoint} (${props.failureReason})`
        : `Traffic Manager ${profile}: endpoint ${endpoint} probe ${props.probeStatus}`,
    };
  }

  if (variant === "routing") {
    const props = {
      routingMethod: rand(["Performance", "Priority", "Geographic", "Weighted"]),
      selectedEndpoint: isErr ? "" : endpoint,
      dnsQuery: `www.${rand(["meridiantech", "cascadeops"])}.com`,
      reasonCode: isErr
        ? "AllEndpointsUnhealthy"
        : rand(["BestPerformance", "FailoverToSecondary", "GeoMatch"]),
    };
    const { properties: tmProps2, error: tmErr2 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "TrafficManagerDnsReply",
      category: "TrafficRoutingEvents",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "500" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: tmProps2,
      ...(tmErr2 ? { error: tmErr2 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/trafficmanagerprofiles"),
      azure: {
        traffic_manager: {
          profile_name: profile,
          resource_group: resourceGroup,
          category: "TrafficRoutingEvents",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("TrafficManagerDnsReply"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e5, 8e7),
      },
      message: isErr
        ? `Traffic Manager ${profile}: routing failure (${props.reasonCode})`
        : `Traffic Manager ${profile}: routed ${props.dnsQuery} → ${props.selectedEndpoint}`,
    };
  }

  if (variant === "warmup_window") {
    const props = {
      warmupEndpoint: endpoint,
      minProbeSuccessesNeeded: randInt(2, 8),
      successesObserved: isErr ? randInt(0, 2) : randInt(6, 20),
      windowElapsedSec: randInt(15, 300),
      state: isErr ? "StuckWarmup" : "GraduatedHealthy",
      message: isErr
        ? "Cold endpoint never cleared adaptive probe warmup before SLA deadline"
        : "Warmup runway satisfied; probes promoted to authoritative health",
      profileDnsTtlHintSec: randInt(30, 120),
    };
    const { properties: tmProps3, error: tmErr3 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "TrafficManagerWarmupTelemetry",
      category: "ProbeWarmupSignals",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "408" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: tmProps3,
      ...(tmErr3 ? { error: tmErr3 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/trafficmanagerprofiles"),
      azure: {
        traffic_manager: {
          profile_name: profile,
          resource_group: resourceGroup,
          category: "ProbeWarmupSignals",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("TrafficManagerWarmupTelemetry"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(8e6, 4e8),
      },
      message: `[warmup] Traffic Manager ${profile}: ${props.state}`,
    };
  }

  if (variant === "endpoint_drain") {
    const props = {
      drainTarget: endpoint,
      connectionsDrainedEstimate: isErr ? 0 : randInt(50, 80_000),
      minChildRequestsRemaining: isErr ? randInt(5, 200) : 0,
      drainPolicy: rand(["WeightedZero", "PriorityDeprioritized"]),
      completed: !isErr,
      message: isErr
        ? "Sticky clients kept hitting deprioritized endpoint during drain window"
        : "Drain window closed with zero routed answers to retired endpoint",
      observedRpsTail: randFloat(isErr ? 120 : 0, isErr ? 900 : 12),
    };
    const { properties: tmProps4, error: tmErr4 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "TrafficManagerEndpointDrainStatus",
      category: "TrafficManagerDrainSignals",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "409" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: tmProps4,
      ...(tmErr4 ? { error: tmErr4 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/trafficmanagerprofiles"),
      azure: {
        traffic_manager: {
          profile_name: profile,
          resource_group: resourceGroup,
          category: "TrafficManagerDrainSignals",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("TrafficManagerEndpointDrainStatus"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e7, 5e9),
      },
      message: `[drain] Traffic Manager ${profile}: ${endpoint} ${props.message}`,
    };
  }

  if (variant === "geo_redirect_map") {
    const props = {
      resolverCountry: rand(["US", "DE", "JP", "BR"]),
      geoMappingRule: rand(["EU-PreferPrimary", "US-WestBias", "APAC-Sticky"]),
      matchedEndpointOverride: isErr ? "" : endpoint,
      ambiguousRegions: isErr ? rand(["LATAM, US", "APAC, OC"]) : "",
      rationale: isErr
        ? "Overlapping geo filters produced indeterminate precedence"
        : "Geo map resolved uniquely",
      ednsClientSubnetUsed: rand([true, false]),
    };
    const { properties: tmProps5, error: tmErr5 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "TrafficManagerGeoRouteEvaluation",
      category: "GeoRoutingAudit",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "422" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: tmProps5,
      ...(tmErr5 ? { error: tmErr5 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/trafficmanagerprofiles"),
      azure: {
        traffic_manager: {
          profile_name: profile,
          resource_group: resourceGroup,
          category: "GeoRoutingAudit",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("TrafficManagerGeoRouteEvaluation"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e6, 3e8),
      },
      message: `[geo] Traffic Manager ${profile}: ${props.rationale}`,
    };
  }

  const op = isErr
    ? "Microsoft.Network/trafficmanagerprofiles/write"
    : rand([
        "Microsoft.Network/trafficmanagerprofiles/write",
        "Microsoft.Network/trafficmanagerprofiles/delete",
      ]);
  const props = {
    entity: resourceId,
    eventCategory: "Administrative",
    status: isErr ? "Failed" : "Succeeded",
    errorCode: isErr ? rand(["TrafficManagerBadRequest", "DnsNameNotAvailable"]) : "",
    httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
  };
  const { properties: tmAProps, error: tmAErr } = withNetworkingExtendedAzureErrors(
    isErr,
    variant,
    props as Record<string, unknown>
  );
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: op,
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "400" : "200",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Informational",
    properties: tmAProps,
    ...(tmAErr ? { error: tmAErr } : {}),
    cloud: azureCloud(region, subscription, "Microsoft.Network/trafficmanagerprofiles"),
    azure: {
      traffic_manager: {
        profile_name: profile,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["network"],
      type: isErr ? ["denied"] : ["connection"],
      action: String(op),
      outcome: isErr ? "failure" : "success",
      duration: randInt(1e8, 4e9),
    },
    message: isErr
      ? `Traffic Manager ${profile}: profile change failed`
      : `Traffic Manager ${profile}: ${op} ok`,
  };
}

/** DDoS Protection Plan detection and mitigation summaries. */
export function generateDdosProtectionLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const plan = `ddos-${rand(["platform", "plan"])}-${randId(4).toLowerCase()}`;
  const resourceId = armDdosPlan(subscription.id, resourceGroup, plan);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "attack",
    "mitigation",
    "telemetry_shard",
    "false_positive_calibration",
    "auto_suppress_headroom",
    "admin",
  ] as const);

  if (variant === "attack") {
    const props = {
      publicIpAddresses: [`pip-${randId(5)}`],
      attackVectors: rand([
        "TCP SYN flood",
        "DNS amplification",
        "UDP reflection",
        "Mixed volumetric",
      ]),
      attackThroughputPps: randInt(100_000, 10_000_000),
      attackStatus: isErr ? "TelemetryGap" : "Ongoing",
    };
    const { properties: ddProps1, error: ddErr1 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "DdosAttackDetected",
      category: "DdosDetection",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "503" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Warning",
      properties: ddProps1,
      ...(ddErr1 ? { error: ddErr1 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/ddosProtectionPlans"),
      azure: {
        ddos_protection: {
          plan_name: plan,
          resource_group: resourceGroup,
          category: "DdosDetection",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("DdosAttackDetected"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e7, 6e8),
      },
      message: isErr
        ? `DDoS plan ${plan}: attack telemetry unavailable (${props.attackStatus})`
        : `DDoS plan ${plan}: volumetric attack detected (${props.attackVectors})`,
    };
  }

  if (variant === "mitigation") {
    const props = {
      mitigationPolicy: rand(["Standard", "Strict"]),
      mitigatedTrafficPps: isErr ? 0 : randInt(50_000, 5_000_000),
      droppedPackets: isErr ? 0 : randInt(1_000_000, 900_000_000),
      falsePositiveSignals: isErr ? randInt(1, 50) : randInt(0, 3),
      mitigationStatus: isErr ? "Partial" : "Active",
    };
    const { properties: ddProps2, error: ddErr2 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "DdosAttackMitigation",
      category: "DdosMitigationReports",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "507" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: ddProps2,
      ...(ddErr2 ? { error: ddErr2 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/ddosProtectionPlans"),
      azure: {
        ddos_protection: {
          plan_name: plan,
          resource_group: resourceGroup,
          category: "DdosMitigationReports",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("DdosAttackMitigation"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e7, 5e8),
      },
      message: isErr
        ? `DDoS mitigation ${plan}: mitigation degraded (status=${props.mitigationStatus})`
        : `DDoS mitigation ${plan}: dropped ${props.droppedPackets} packets`,
    };
  }

  if (variant === "telemetry_shard") {
    const props = {
      shardId: `ddos-tel-${randId(4)}`,
      ingestLagMs: isErr ? randInt(4000, 180_000) : randInt(5, 400),
      samplesDroppedPct: randFloat(isErr ? 18 : 0, isErr ? 62 : 1.8),
      backfillQueued: isErr,
      correlatedPublicIpPrefix: `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/publicIPPrefixes/ipp-${randId(3)}`,
      message: isErr
        ? "Regional telemetry aggregator could not hydrate attack timeline within SLO"
        : "Telemetry shard pacing matched enforcement plane ingest budget",
      plane: rand(["Control", "Data"]),
    };
    const { properties: ddProps3, error: ddErr3 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "DdosTelemetryPipelineHealth",
      category: "DdosTelemetryLag",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "504" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: ddProps3,
      ...(ddErr3 ? { error: ddErr3 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/ddosProtectionPlans"),
      azure: {
        ddos_protection: {
          plan_name: plan,
          resource_group: resourceGroup,
          category: "DdosTelemetryLag",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("DdosTelemetryPipelineHealth"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e7, 6e9),
      },
      message: `[tel] DDoS plan ${plan}: ${props.message}`,
    };
  }

  if (variant === "false_positive_calibration") {
    const props = {
      heuristicId: `ddfp-${randId(5)}`,
      trustScoreSuggested: randFloat(isErr ? 22 : 75, isErr ? 58 : 99),
      benignTrafficFingerprint: rand(["CDN-Partner", "EgressNAT", "LoadTestSweep"]),
      autoTuneRejected: isErr,
      reviewerTicket: isErr ? `SEC-${randId(6)}` : "",
      rationale: isErr
        ? "Calibration would widen allow window across protected prefix during known campaign"
        : "Conservative widen approved with scoped prefix exception",
      protectedResources: randInt(isErr ? 12 : 1, isErr ? 80 : 24),
    };
    const { properties: ddProps4, error: ddErr4 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "DdosFalsePositiveModelReview",
      category: "DdosPolicyTuning",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "423" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: ddProps4,
      ...(ddErr4 ? { error: ddErr4 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/ddosProtectionPlans"),
      azure: {
        ddos_protection: {
          plan_name: plan,
          resource_group: resourceGroup,
          category: "DdosPolicyTuning",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("DdosFalsePositiveModelReview"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e7, 5e9),
      },
      message: `[fp-cal] DDoS plan ${plan}: heuristic ${props.heuristicId}`,
    };
  }

  if (variant === "auto_suppress_headroom") {
    const props = {
      protectionPlanSku: rand(["Basic", "Standard"]),
      burstableThroughputGbpsObserved: randFloat(isErr ? 92 : 3, isErr ? 220 : 45),
      platformSuppressBudgetPct: randFloat(isErr ? 103 : 20, isErr ? 138 : 70),
      action: isErr
        ? rand(["ThrottleLogging", "DowngradeMitigationSignals"])
        : "MaintainFullLogging",
      message: isErr
        ? "Burst exceeded partner suppress budget; degraded verbose counters for tenancy slice"
        : "Suppress budgeting held below committed partner overlay threshold",
      regionPair: `${region}->${rand(["paired-east", "paired-west"])}`,
    };
    const { properties: ddProps5, error: ddErr5 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "DdosSuppressBudgetMeter",
      category: "DdosSuppressHeadroomSignals",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "429" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: ddProps5,
      ...(ddErr5 ? { error: ddErr5 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/ddosProtectionPlans"),
      azure: {
        ddos_protection: {
          plan_name: plan,
          resource_group: resourceGroup,
          category: "DdosSuppressHeadroomSignals",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("DdosSuppressBudgetMeter"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e7, 4e9),
      },
      message: `[budget] DDoS plan ${plan}: ${props.message}`,
    };
  }

  const op = "Microsoft.Network/ddosProtectionPlans/write";
  const props = {
    entity: resourceId,
    eventCategory: "Administrative",
    status: isErr ? "Failed" : "Succeeded",
    errorCode: isErr ? rand(["DdosPlanLimitExceeded", "InvalidSubscriptionState"]) : "",
    httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
  };
  const { properties: ddAProps, error: ddAErr } = withNetworkingExtendedAzureErrors(
    isErr,
    variant,
    props as Record<string, unknown>
  );
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: op,
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "409" : "200",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Informational",
    properties: ddAProps,
    ...(ddAErr ? { error: ddAErr } : {}),
    cloud: azureCloud(region, subscription, "Microsoft.Network/ddosProtectionPlans"),
    azure: {
      ddos_protection: {
        plan_name: plan,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["network"],
      type: isErr ? ["denied"] : ["connection"],
      action: String(op),
      outcome: isErr ? "failure" : "success",
      duration: randInt(1e8, 4e9),
    },
    message: isErr
      ? `DDoS plan ${plan}: update failed`
      : `DDoS plan ${plan}: configuration updated`,
  };
}

/** Azure Bastion session and tunnel audit. */
export function generateBastionLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const host = `bastion-${rand(["hub", "corp"])}-${randId(4).toLowerCase()}`;
  const resourceId = armBastion(subscription.id, resourceGroup, host);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "session",
    "tunnel",
    "shareable_link_audit",
    "kerberos_constrained",
    "clipboard_file_transfer",
    "admin",
  ] as const);
  const user = `${rand(FIRST_NAMES)}.${rand(LAST_NAMES)}@${rand(EMAIL_DOMAINS)}`;

  if (variant === "session") {
    const props = {
      sessionType: rand(["ssh", "rdp"]),
      targetVmResourceId: `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Compute/virtualMachines/vm-jump-${randId(3)}`,
      clientPublicIp: callerIp,
      sessionId: randUUID(),
      sessionState: isErr ? "Failed" : rand(["Connected", "Disconnected"]),
      disconnectReason: isErr ? rand(["AuthFailed", "IdleTimeout", "PolicyDeny"]) : "",
    };
    const merged = { ...props, userPrincipalName: user };
    const { properties: bsProps1, error: bsErr1 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      merged as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "BastionHostSessionEvent",
      category: "BastionAudit",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "401" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: bsProps1,
      ...(bsErr1 ? { error: bsErr1 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/bastionHosts"),
      azure: {
        bastion: {
          host_name: host,
          resource_group: resourceGroup,
          category: "BastionAudit",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("BastionHostSessionEvent"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e8, 3e10),
      },
      message: isErr
        ? `Bastion ${host}: session failed for ${user} (${String(props.disconnectReason)})`
        : `Bastion ${host}: ${user} ${props.sessionState} ${props.sessionType} session`,
    };
  }

  if (variant === "tunnel") {
    const props = {
      nativeClientMode: rand(["Enable", "Disable"]),
      tunnelId: randUUID(),
      bytesUpstream: isErr ? 0 : randInt(10_000, 50_000_000),
      bytesDownstream: isErr ? 0 : randInt(50_000, 120_000_000),
      tunnelStatus: isErr ? "Reset" : "Established",
    };
    const merged = { ...props, userPrincipalName: user };
    const { properties: bsProps2, error: bsErr2 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      merged as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "BastionTunnelActivity",
      category: "BastionNativeClient",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "502" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: bsProps2,
      ...(bsErr2 ? { error: bsErr2 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/bastionHosts"),
      azure: {
        bastion: {
          host_name: host,
          resource_group: resourceGroup,
          category: "BastionNativeClient",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("BastionTunnelActivity"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e7, 8e9),
      },
      message: isErr
        ? `Bastion ${host}: tunnel reset for ${user}`
        : `Bastion ${host}: native client tunnel active (${props.nativeClientMode})`,
    };
  }

  if (variant === "shareable_link_audit") {
    const props = {
      shareableLinkId: randUUID(),
      ephemeralTokenTtlMinutes: randInt(15, 240),
      linkRevokedEarly: isErr,
      originatingConditionalAccessPolicy: rand(["Corp-Compliant", "BreakGlass-Excluded"]),
      devicePlatform: rand(["Windows", "macOS", "iOS"]),
      message: isErr
        ? "Shareable Bastion URL remained valid after revocation attempt"
        : "Ephemeral JWT consumption matched entitlement matrix",
      targetResourceGroup: resourceGroup,
    };
    const merged = { ...props, userPrincipalName: user };
    const { properties: bsProps3, error: bsErr3 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      merged as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "BastionShareableLinkEvent",
      category: "BastionEphemeralLinks",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "423" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: bsProps3,
      ...(bsErr3 ? { error: bsErr3 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/bastionHosts"),
      azure: {
        bastion: {
          host_name: host,
          resource_group: resourceGroup,
          category: "BastionEphemeralLinks",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("BastionShareableLinkEvent"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e8, 4e10),
      },
      message: `[link] Bastion ${host}: ${props.message}`,
    };
  }

  if (variant === "kerberos_constrained") {
    const props = {
      targetSpn: rand([
        "HOST/jump.vm.core.meridiantech.local",
        "MSSQLSvc/sql01.meridiantech.local:1433",
      ]),
      delegatedTicketIssued: !isErr,
      keyVersionStale: isErr,
      kmsPolicyVersion: randInt(40, 90),
      message: isErr
        ? "Constrained delegation TGT bridging rejected due stale SID history"
        : "Protocol transition completed with audited S4U chain",
      adSiteName: rand(["SEA-HUB", "IAD-CORE"]),
    };
    const merged = { ...props, userPrincipalName: user };
    const { properties: bsProps4, error: bsErr4 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      merged as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "BastionKerberosDelegationTrace",
      category: "BastionKerbAudit",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "467" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: bsProps4,
      ...(bsErr4 ? { error: bsErr4 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/bastionHosts"),
      azure: {
        bastion: {
          host_name: host,
          resource_group: resourceGroup,
          category: "BastionKerbAudit",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("BastionKerberosDelegationTrace"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e9, 2e11),
      },
      message: `[kerb] Bastion ${host}: ${props.targetSpn} ${props.message}`,
    };
  }

  if (variant === "clipboard_file_transfer") {
    const props = {
      clipboardDirectionBlocked: isErr ? rand(["Inbound", "Outbound", "Bidirectional"]) : "None",
      fileTransferAttempts: randInt(isErr ? 18 : 0, isErr ? 120 : 3),
      dataExfilFingerprint: rand(["multipart/x-zip-compressed", "application/octet-stream"]),
      verdict: isErr ? "InterceptedMalwareSweep" : "AllowedPolicy",
      message: isErr
        ? "Adaptive DLP heuristic flagged pasted payload hash against sanctioned blocklist"
        : "Clipboard and drive redirection stayed within sanctioned patterns",
      scanLatencyMs: randInt(isErr ? 800 : 5, isErr ? 9000 : 180),
    };
    const merged = { ...props, userPrincipalName: user };
    const { properties: bsProps5, error: bsErr5 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      merged as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "BastionClipboardInspection",
      category: "BastionDlpSignals",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "406" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: bsProps5,
      ...(bsErr5 ? { error: bsErr5 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/bastionHosts"),
      azure: {
        bastion: {
          host_name: host,
          resource_group: resourceGroup,
          category: "BastionDlpSignals",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("BastionClipboardInspection"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e8, 5e10),
      },
      message: `[dlp] Bastion ${host}: ${props.verdict}`,
    };
  }

  const op = isErr
    ? "Microsoft.Network/bastionHosts/write"
    : rand(["Microsoft.Network/bastionHosts/write", "Microsoft.Network/bastionHosts/delete"]);
  const props = {
    entity: resourceId,
    eventCategory: "Administrative",
    status: isErr ? "Failed" : "Succeeded",
    errorCode: isErr ? rand(["BastionSubnetInvalid", "BastionSkuNotSupported"]) : "",
    httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
  };
  const { properties: bsAProps, error: bsAErr } = withNetworkingExtendedAzureErrors(
    isErr,
    variant,
    props as Record<string, unknown>
  );
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: op,
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "400" : "200",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Informational",
    properties: bsAProps,
    ...(bsAErr ? { error: bsAErr } : {}),
    cloud: azureCloud(region, subscription, "Microsoft.Network/bastionHosts"),
    azure: {
      bastion: {
        host_name: host,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["network"],
      type: isErr ? ["denied"] : ["connection"],
      action: String(op),
      outcome: isErr ? "failure" : "success",
      duration: randInt(1e8, 6e9),
    },
    message: isErr ? `Bastion ${host}: host update failed` : `Bastion ${host}: ${op} completed`,
  };
}

/** Standalone WAF policy rule matches and policy revisions. */
export function generateWafPolicyLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const policy = `waf-${rand(["core", "pci"])}-${randId(5).toLowerCase()}`;
  const resourceId = armWafPolicy(subscription.id, resourceGroup, policy);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "match",
    "bot",
    "rate_limit_pulse",
    "owasp_exclusion_audit",
    "json_body_parse",
    "admin",
  ] as const);

  if (variant === "match") {
    const props = {
      ruleId: `94${randInt(100, 999)}`,
      ruleGroup: rand(["REQUEST-920-PROTOCOL-ENFORCEMENT", "REQUEST-931-APPLICATION-ATTACK-RFI"]),
      action: isErr ? "Block" : rand(["Allow", "Log", "Block"]),
      message: isErr
        ? "Inbound Anomaly Score Exceeded (Critical)"
        : "Restricted SQL Character Anomaly Detection (score 3)",
      clientIp: callerIp,
      hostname: rand(["api.meridiantech.io", "shop.cascadeops.io"]),
      requestUri: rand(["/admin/login", "/api/query", "/.env"]),
      details: { match: "union select", severity: isErr ? "Critical" : "Warning" },
    };
    const { properties: wfProps1, error: wfErr1 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ApplicationGatewayFirewallLog",
      category: "WebApplicationFirewallLog",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "403" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: wfProps1,
      ...(wfErr1 ? { error: wfErr1 } : {}),
      cloud: azureCloud(
        region,
        subscription,
        "Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies"
      ),
      azure: {
        waf: {
          policy_name: policy,
          resource_group: resourceGroup,
          category: "WebApplicationFirewallLog",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("ApplicationGatewayFirewallLog"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e5, 6e8),
      },
      message: isErr
        ? `WAF policy ${policy}: blocked ${props.clientIp} rule=${props.ruleId}`
        : `WAF policy ${policy}: ${props.action} rule ${props.ruleGroup}`,
    };
  }

  if (variant === "bot") {
    const props = {
      botCategory: rand(["BadBots", "UnknownBots", "GoodBots"]),
      botScore: isErr ? randInt(0, 2) : randInt(3, 100),
      challengeResult: isErr ? "Fail" : rand(["Pass", "NotRequired"]),
      userAgent: rand(USER_AGENTS),
    };
    const { properties: wfProps2, error: wfErr2 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "AzureBotManagerRule",
      category: "BotProtectionLog",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "403" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: wfProps2,
      ...(wfErr2 ? { error: wfErr2 } : {}),
      cloud: azureCloud(
        region,
        subscription,
        "Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies"
      ),
      azure: {
        waf: {
          policy_name: policy,
          resource_group: resourceGroup,
          category: "BotProtectionLog",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("AzureBotManagerRule"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e6, 4e8),
      },
      message: isErr
        ? `WAF policy ${policy}: bot challenge failed (${props.botCategory})`
        : `WAF policy ${policy}: bot score=${props.botScore} ${props.challengeResult}`,
    };
  }

  if (variant === "rate_limit_pulse") {
    const props = {
      clientFingerprint: randUUID().slice(0, 12),
      windowSec: rand([10, 30, 60]),
      allowedRatePerWindow: randInt(40, 800),
      observedHits: isErr ? randInt(920, 4000) : randInt(6, 180),
      mitigation: isErr ? rand(["JsChallenge", "Captcha", "Block"]) : "ObserveOnly",
      asnOwner: rand(["Cloud-CDN-ASN", "Cable-ISP-East"]),
      message: isErr
        ? "Global rate limit tripped by bursty partner integration without grace token"
        : "Token bucket remained within configured soft ceiling",
    };
    const { properties: wfProps3, error: wfErr3 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ApplicationGatewayWafRateLimitEvent",
      category: "RateLimitTelemetry",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "429" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: wfProps3,
      ...(wfErr3 ? { error: wfErr3 } : {}),
      cloud: azureCloud(
        region,
        subscription,
        "Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies"
      ),
      azure: {
        waf: {
          policy_name: policy,
          resource_group: resourceGroup,
          category: "RateLimitTelemetry",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("ApplicationGatewayWafRateLimitEvent"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(8e5, 9e8),
      },
      message: `[ratelimit] WAF ${policy}: ${props.observedHits}/${props.allowedRatePerWindow} in ${props.windowSec}s`,
    };
  }

  if (variant === "owasp_exclusion_audit") {
    const props = {
      exclusionName: `ex-${randId(4)}`,
      matchVariable: rand(["RequestCookieNames", "RequestArgNames", "RequestHeaderNames"]),
      selector: rand(["__RequestVerificationToken", "traceparent", "authorization"]),
      overlapsCoreRule: isErr,
      effectiveScope: rand(["Policy", "RuleSet", "Rule"]),
      reviewer: isErr
        ? "auto-guard"
        : `${rand(FIRST_NAMES)}.${rand(LAST_NAMES)}@${rand(EMAIL_DOMAINS)}`,
      message: isErr
        ? "Exclusion intersects critical SQLi rule group after OWASP CRS minor bump"
        : "Scoped exclusion validated against regression harness",
    };
    const { properties: wfProps4, error: wfErr4 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ApplicationGatewayWafExclusionDrift",
      category: "OwaspExclusionAudit",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "409" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: wfProps4,
      ...(wfErr4 ? { error: wfErr4 } : {}),
      cloud: azureCloud(
        region,
        subscription,
        "Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies"
      ),
      azure: {
        waf: {
          policy_name: policy,
          resource_group: resourceGroup,
          category: "OwaspExclusionAudit",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("ApplicationGatewayWafExclusionDrift"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e7, 7e9),
      },
      message: `[excl] WAF ${policy}: ${props.exclusionName} ${props.message}`,
    };
  }

  if (variant === "json_body_parse") {
    const props = {
      contentType: rand(["application/json", "application/ld+json"]),
      parsingDepthExceeded: isErr,
      anomalyTag: rand(["MalformedUnicodeEscape", "KeyDepthOverflow", "NumberOutOfBounds"]),
      maxDepthAllowed: randInt(12, 64),
      truncatedBytes: randInt(isErr ? 8192 : 0, isErr ? 65536 : 256),
      message: isErr
        ? "JSON inspection engine halted after depth guard tripped adaptive parser"
        : "JSON traversal finished within CRS compute budget",
    };
    const { properties: wfProps5, error: wfErr5 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ApplicationGatewayWafBodyInspection",
      category: "JsonInspectionTelemetry",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "422" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: wfProps5,
      ...(wfErr5 ? { error: wfErr5 } : {}),
      cloud: azureCloud(
        region,
        subscription,
        "Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies"
      ),
      azure: {
        waf: {
          policy_name: policy,
          resource_group: resourceGroup,
          category: "JsonInspectionTelemetry",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("ApplicationGatewayWafBodyInspection"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e5, 2e9),
      },
      message: `[json] WAF ${policy}: ${props.anomalyTag}`,
    };
  }

  const op = isErr
    ? "Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies/write"
    : rand([
        "Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies/write",
        "Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies/delete",
      ]);
  const props = {
    entity: resourceId,
    eventCategory: "Administrative",
    status: isErr ? "Failed" : "Succeeded",
    errorCode: isErr ? rand(["WafPolicyInUse", "CustomRuleLimitExceeded"]) : "",
    httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
  };
  const { properties: wfAProps, error: wfAErr } = withNetworkingExtendedAzureErrors(
    isErr,
    variant,
    props as Record<string, unknown>
  );
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: op,
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "409" : "200",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Informational",
    properties: wfAProps,
    ...(wfAErr ? { error: wfAErr } : {}),
    cloud: azureCloud(
      region,
      subscription,
      "Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies"
    ),
    azure: {
      waf: {
        policy_name: policy,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["network"],
      type: isErr ? ["denied"] : ["connection"],
      action: String(op),
      outcome: isErr ? "failure" : "success",
      duration: randInt(1e8, 4e9),
    },
    message: isErr
      ? `WAF policy ${policy}: policy update failed`
      : `WAF policy ${policy}: revision applied`,
  };
}

/** Virtual WAN hub VPN/SDWAN site connectivity and routing. */
export function generateVirtualWanLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const vwan = `vwan-${rand(["global", "regional"])}-${randId(4).toLowerCase()}`;
  const resourceId = armVirtualWan(subscription.id, resourceGroup, vwan);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "site",
    "route",
    "vwan_nva_detach",
    "sdwan_quality_mos",
    "hub_scale_provision",
    "admin",
  ] as const);
  const hub = `hub-${randId(4)}`;

  if (variant === "site") {
    const props = {
      virtualHub: hub,
      remoteSite: `branch-${rand(["sea", "iad", "fra"])}-${randId(3)}`,
      tunnelState: isErr ? "Disconnected" : rand(["Connected", "Connected", "Degraded"]),
      lastHandshakeSecAgo: isErr ? -1 : randInt(1, 900),
      bytesIn: isErr ? 0 : randInt(1_000_000, 9_000_000_000),
      bytesOut: isErr ? 0 : randInt(1_000_000, 9_000_000_000),
    };
    const { properties: vwProps1, error: vwErr1 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "VirtualWanP2SVpnTunnelStatus",
      category: "VirtualWANHubRouteTable",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "503" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: vwProps1,
      ...(vwErr1 ? { error: vwErr1 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/virtualWans"),
      azure: {
        virtual_wan: {
          name: vwan,
          resource_group: resourceGroup,
          category: "VirtualWANHubRouteTable",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("VirtualWanP2SVpnTunnelStatus"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e7, 4e8),
      },
      message: isErr
        ? `Virtual WAN ${vwan}: site ${props.remoteSite} tunnel down on ${hub}`
        : `Virtual WAN ${vwan}: site ${props.remoteSite} ${props.tunnelState}`,
    };
  }

  if (variant === "route") {
    const props = {
      virtualHub: hub,
      routeTable: `rt-${randId(4)}`,
      advertisedRoutes: isErr ? 0 : randInt(2, 120),
      withdrawnRoutes: isErr ? randInt(1, 40) : 0,
      effectivePrefix: isErr ? "" : `10.${randInt(60, 180)}.0.0/16`,
      routeOperation: isErr ? "WithdrawFailed" : rand(["Advertise", "Withdraw", "Learned"]),
    };
    const { properties: vwProps2, error: vwErr2 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "VirtualHubEffectiveRoutesChanged",
      category: "VirtualWANRouteAdvertisement",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "500" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: vwProps2,
      ...(vwErr2 ? { error: vwErr2 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/virtualWans"),
      azure: {
        virtual_wan: {
          name: vwan,
          resource_group: resourceGroup,
          category: "VirtualWANRouteAdvertisement",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("VirtualHubEffectiveRoutesChanged"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e6, 3e8),
      },
      message: isErr
        ? `Virtual WAN ${vwan}: route propagation error on ${hub}`
        : `Virtual WAN ${vwan}: ${props.routeOperation} ${props.effectivePrefix} via ${props.routeTable}`,
    };
  }

  if (variant === "vwan_nva_detach") {
    const props = {
      virtualHub: hub,
      nvaName: `nva-${randId(4)}`,
      datapathStaleSeconds: isErr ? randInt(45, 600) : 0,
      forcedReset: isErr,
      orphanedRouteServerPeer: `peer-${randId(3)}`,
      message: isErr
        ? "NVAs detached asymmetrically; datapath leaked learned routes toward spoke"
        : "NVA failover completed with converged BGP next-hop rewrite",
      controlPlaneCorrelation: randUUID(),
    };
    const { properties: vwProps3, error: vwErr3 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "VirtualWanNVADetachmentTrace",
      category: "VirtualWanNVAHealthSignals",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "424" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: vwProps3,
      ...(vwErr3 ? { error: vwErr3 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/virtualWans"),
      azure: {
        virtual_wan: {
          name: vwan,
          resource_group: resourceGroup,
          category: "VirtualWanNVAHealthSignals",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("VirtualWanNVADetachmentTrace"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e9, 8e10),
      },
      message: `[nva] VWAN ${vwan}: ${hub} ${props.nvaName}`,
    };
  }

  if (variant === "sdwan_quality_mos") {
    const props = {
      virtualHub: hub,
      wanLinkPriority: rand(["MPLS-Primary", "Internet-Secondary"]),
      jitterMsAvg: randFloat(isErr ? 140 : 2, isErr ? 420 : 40),
      packetLossPct: randFloat(isErr ? 12 : 0.05, isErr ? 38 : 0.9),
      mosScoreEstimated: randFloat(isErr ? 2.4 : 3.9, isErr ? 3.9 : 4.65),
      linkFlapEvents: randInt(isErr ? 14 : 0, isErr ? 120 : 3),
      message: isErr
        ? "Synthetic voice probes missed MOS target after sustained jitter burst"
        : "WAN quality envelope healthy for prioritized branch traffic classes",
      branchCpeModel: rand(["silver-peak-pe", "viptela-cedge"]),
    };
    const { properties: vwProps4, error: vwErr4 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "VirtualHubSDWANQualityProbe",
      category: "VirtualWanWANQualitySignals",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "502" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: vwProps4,
      ...(vwErr4 ? { error: vwErr4 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/virtualWans"),
      azure: {
        virtual_wan: {
          name: vwan,
          resource_group: resourceGroup,
          category: "VirtualWanWANQualitySignals",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("VirtualHubSDWANQualityProbe"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e7, 4e10),
      },
      message: `[qos] VWAN ${vwan}: MOS ${props.mosScoreEstimated.toFixed(2)}`,
    };
  }

  if (variant === "hub_scale_provision") {
    const props = {
      virtualHub: hub,
      skuUnitsAllocated: isErr ? randInt(11, 14) : randInt(2, 6),
      maxUnitsLicensed: isErr ? randInt(8, 10) : randInt(12, 24),
      autoscaleRecommendation: isErr ? "ManualInterventionRequired" : "WithinBounds",
      message: isErr
        ? "Regional hub dataplane slice refused additional capacity during incident burst"
        : "Hub elasticity buffer satisfied forecasted spike window",
      changeTicket: isErr ? `CHG-${randId(7)}` : "",
      partnerRegionMirror: rand(["paired-west", "paired-east"]),
    };
    const { properties: vwProps5, error: vwErr5 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "VirtualHubCapacityMeter",
      category: "VirtualWanProvisionSignals",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "507" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: vwProps5,
      ...(vwErr5 ? { error: vwErr5 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/virtualWans"),
      azure: {
        virtual_wan: {
          name: vwan,
          resource_group: resourceGroup,
          category: "VirtualWanProvisionSignals",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("VirtualHubCapacityMeter"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e9, 2e11),
      },
      message: `[cap] VWAN ${vwan}: ${props.autoscaleRecommendation}`,
    };
  }

  const op = isErr
    ? "Microsoft.Network/virtualWans/write"
    : rand(["Microsoft.Network/virtualWans/write", "Microsoft.Network/virtualWans/delete"]);
  const props = {
    entity: resourceId,
    eventCategory: "Administrative",
    status: isErr ? "Failed" : "Succeeded",
    errorCode: isErr ? rand(["VirtualWanHubLimit", "InvalidRegionPair"]) : "",
    httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
  };
  const { properties: vwAProps, error: vwAErr } = withNetworkingExtendedAzureErrors(
    isErr,
    variant,
    props as Record<string, unknown>
  );
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: op,
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "400" : "200",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Informational",
    properties: vwAProps,
    ...(vwAErr ? { error: vwAErr } : {}),
    cloud: azureCloud(region, subscription, "Microsoft.Network/virtualWans"),
    azure: {
      virtual_wan: {
        name: vwan,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["network"],
      type: isErr ? ["denied"] : ["connection"],
      action: String(op),
      outcome: isErr ? "failure" : "success",
      duration: randInt(1e8, 5e9),
    },
    message: isErr
      ? `Virtual WAN ${vwan}: control-plane update failed`
      : `Virtual WAN ${vwan}: ${op} succeeded`,
  };
}

/** Azure Route Server BGP peers and route propagation. */
export function generateRouteServerLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const rs = `rs-${rand(["hub", "edge"])}-${randId(4).toLowerCase()}`;
  const resourceId = armRouteServer(subscription.id, resourceGroup, rs);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "bgp",
    "route",
    "prefix_guard",
    "graceful_restart_fsm",
    "filter_map_mismatch",
    "admin",
  ] as const);

  if (variant === "bgp") {
    const peerIp = `${randInt(169, 169)}.254.${randInt(0, 50)}.${randInt(2, 250)}`;
    const props = {
      peerAsn: rand([65001, 65002, 4200000000]),
      peerIp,
      sessionState: isErr ? "Idle" : rand(["Established", "Active", "Connect"]),
      prefixCount: isErr ? 0 : randInt(4, 400),
      lastError: isErr ? rand(["HoldTimerExpired", "BGPNotificationCease", "AuthFailed"]) : "",
    };
    const { properties: rsProps1, error: rsErr1 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "RouteServerBgpSessionState",
      category: "RouteServerBgp",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "500" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: rsProps1,
      ...(rsErr1 ? { error: rsErr1 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/routeServers"),
      azure: {
        route_server: {
          name: rs,
          resource_group: resourceGroup,
          category: "RouteServerBgp",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("RouteServerBgpSessionState"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e7, 5e8),
      },
      message: isErr
        ? `Route Server ${rs}: BGP session with ${peerIp} down (${props.lastError})`
        : `Route Server ${rs}: BGP ${props.sessionState} peer ${peerIp} (${props.prefixCount} prefixes)`,
    };
  }

  if (variant === "route") {
    const props = {
      branchName: `nva-${randId(4)}`,
      advertisedToVnet: isErr ? 0 : randInt(1, 64),
      learnedFromOnPrem: randInt(0, isErr ? 0 : 200),
      propagationTarget: `hub-${randId(4)}`,
      operation: isErr ? "RouteRefreshFailed" : rand(["Advertise", "Withdraw", "Replace"]),
    };
    const { properties: rsProps2, error: rsErr2 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "RouteServerRouteAdvertisement",
      category: "RouteServerRouteTable",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "503" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: rsProps2,
      ...(rsErr2 ? { error: rsErr2 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/routeServers"),
      azure: {
        route_server: {
          name: rs,
          resource_group: resourceGroup,
          category: "RouteServerRouteTable",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("RouteServerRouteAdvertisement"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e6, 4e8),
      },
      message: isErr
        ? `Route Server ${rs}: failed to push routes to ${props.propagationTarget}`
        : `Route Server ${rs}: ${props.operation} for ${props.branchName}`,
    };
  }

  if (variant === "prefix_guard") {
    const props = {
      peerSubnet: `${randInt(10, 10)}.${randInt(120, 180)}.${randInt(0, 255)}.${randInt(0, 252)}/22`,
      maxPrefixesAllowed: randInt(isErr ? 24 : 200, isErr ? 96 : 4000),
      prefixesReceivedSnapshot: randInt(isErr ? 980 : 120, isErr ? 2500 : 1800),
      guardAction: isErr ? rand(["SoftShutdown", "PrefixFiltered"]) : "MonitorOnly",
      message: isErr
        ? "Branch exceeded delegated prefix-cap before dampening timers engaged"
        : "BGP learned prefixes remained under guard envelope",
      policyVersion: randInt(3, 12),
    };
    const { properties: rsProps3, error: rsErr3 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "RouteServerPrefixGuardViolation",
      category: "RouteServerPrefixGuardSignals",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "508" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: rsProps3,
      ...(rsErr3 ? { error: rsErr3 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/routeServers"),
      azure: {
        route_server: {
          name: rs,
          resource_group: resourceGroup,
          category: "RouteServerPrefixGuardSignals",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("RouteServerPrefixGuardViolation"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e7, 9e10),
      },
      message: `[guard] RS ${rs}: ${props.peerSubnet} prefixes=${props.prefixesReceivedSnapshot}`,
    };
  }

  if (variant === "graceful_restart_fsm") {
    const props = {
      restartTimerSec: randInt(60, 180),
      routesPreservedPct: randFloat(isErr ? 42 : 88, isErr ? 71 : 100),
      staleMarkedPrefixes: randInt(isErr ? 420 : 0, isErr ? 1800 : 40),
      fsmOutcome: isErr ? "StaleTimeout" : "HelperComplete",
      message: isErr
        ? "Stale RIB lingered beyond GR stale timer after control-plane bounce"
        : "GR helper transitioned peers without datapath flap",
      neighborAsnHint: rand([65011, 65012, 65100]),
    };
    const { properties: rsProps4, error: rsErr4 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "RouteServerGracefulRestartTrace",
      category: "RouteServerBGPGRSignals",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "556" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: rsProps4,
      ...(rsErr4 ? { error: rsErr4 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/routeServers"),
      azure: {
        route_server: {
          name: rs,
          resource_group: resourceGroup,
          category: "RouteServerBGPGRSignals",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("RouteServerGracefulRestartTrace"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e9, 3e11),
      },
      message: `[gr] RS ${rs}: ${props.fsmOutcome}`,
    };
  }

  if (variant === "filter_map_mismatch") {
    const props = {
      mapName: `rs-map-${randId(3)}`,
      expectedCommunity: rand(["64512:910", "65515:722"]),
      receivedCommunity: isErr ? "64599:UNKNOWN" : "64512:910",
      action: isErr ? "SuppressExport" : "PermitMirrored",
      mismatchWindowSec: randInt(isErr ? 300 : 0, isErr ? 3600 : 45),
      message: isErr
        ? "BGP community tagging diverged causing selective export blackout"
        : "Imported community strings matched egress policy selectors",
      peeringVlan: randInt(100, 4094),
    };
    const { properties: rsProps5, error: rsErr5 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "RouteServerFilterMapConsistency",
      category: "RouteServerPolicySignals",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "409" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: rsProps5,
      ...(rsErr5 ? { error: rsErr5 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/routeServers"),
      azure: {
        route_server: {
          name: rs,
          resource_group: resourceGroup,
          category: "RouteServerPolicySignals",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("RouteServerFilterMapConsistency"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e8, 5e10),
      },
      message: `[map] RS ${rs}: ${props.mapName} ${props.message}`,
    };
  }

  const op = isErr
    ? "Microsoft.Network/routeServers/write"
    : rand(["Microsoft.Network/routeServers/write", "Microsoft.Network/routeServers/delete"]);
  const props = {
    entity: resourceId,
    eventCategory: "Administrative",
    status: isErr ? "Failed" : "Succeeded",
    errorCode: isErr ? rand(["RouteServerSubnetRequiresDelegation", "QuotaExceeded"]) : "",
    httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
  };
  const { properties: rsAProps, error: rsAErr } = withNetworkingExtendedAzureErrors(
    isErr,
    variant,
    props as Record<string, unknown>
  );
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: op,
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "400" : "200",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Informational",
    properties: rsAProps,
    ...(rsAErr ? { error: rsAErr } : {}),
    cloud: azureCloud(region, subscription, "Microsoft.Network/routeServers"),
    azure: {
      route_server: {
        name: rs,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["network"],
      type: isErr ? ["denied"] : ["connection"],
      action: String(op),
      outcome: isErr ? "failure" : "success",
      duration: randInt(1e8, 6e9),
    },
    message: isErr ? `Route Server ${rs}: provisioning failed` : `Route Server ${rs}: ${op} ok`,
  };
}

/** Network Watcher flow logs, topology, and packet capture. */
export function generateNetworkWatcherLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const nw = `NetworkWatcher_${region}`;
  const resourceId = armNetworkWatcher(subscription.id, resourceGroup, nw);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "flow",
    "capture",
    "topology_refresh",
    "nsg_topology_diff",
    "connection_monitor_probe",
    "admin",
  ] as const);

  if (variant === "flow") {
    const nsgId = armNsg(subscription.id, resourceGroup, `nsg-${randId(4)}`);
    const props = {
      targetNsg: nsgId,
      storageAccount: `stnw${randId(8).toLowerCase()}`,
      flowLogVersion: rand([1, 2]),
      enabled: !isErr,
      retentionDays: isErr ? 0 : randInt(7, 90),
      provisioningState: isErr ? "Failed" : "Succeeded",
      errorMessage: isErr ? "Flow log could not write to storage account (authorization)" : "",
    };
    const { properties: nwProps1, error: nwErr1 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "NetworkWatcherFlowLogConfigure",
      category: "FlowLogConfiguration",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "403" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: nwProps1,
      ...(nwErr1 ? { error: nwErr1 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/networkWatchers"),
      azure: {
        network_watcher: {
          name: nw,
          resource_group: resourceGroup,
          category: "FlowLogConfiguration",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("NetworkWatcherFlowLogConfigure"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e8, 4e9),
      },
      message: isErr
        ? `Network Watcher ${nw}: flow log enable failed for ${nsgId}`
        : `Network Watcher ${nw}: flow logs writing to ${props.storageAccount}`,
    };
  }

  if (variant === "capture") {
    const vmId = `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Compute/virtualMachines/vm-cap-${randId(3)}`;
    const props = {
      targetNicResourceId: `${vmId}/networkInterfaces/nic-0`,
      captureFileUri: isErr
        ? ""
        : `https://stcap${randId(6).toLowerCase()}.blob.core.windows.net/caps/${randUUID()}.cap`,
      totalBytesCaptured: isErr ? 0 : randInt(500_000, 80_000_000),
      captureStatus: isErr ? "Failed" : "Stopped",
      filters: { protocol: "Any", maxDurationSec: 180 },
    };
    const { properties: nwProps2, error: nwErr2 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "NetworkWatcherPacketCaptureResult",
      category: "PacketCapture",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "500" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: nwProps2,
      ...(nwErr2 ? { error: nwErr2 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/networkWatchers"),
      azure: {
        network_watcher: {
          name: nw,
          resource_group: resourceGroup,
          category: "PacketCapture",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("NetworkWatcherPacketCaptureResult"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e8, 12e9),
      },
      message: isErr
        ? `Network Watcher ${nw}: packet capture failed on target VM`
        : `Network Watcher ${nw}: capture ${props.totalBytesCaptured} bytes to blob`,
    };
  }

  if (variant === "topology_refresh") {
    const props = {
      refreshScopeVnetCount: randInt(isErr ? 1 : 2, isErr ? 4 : 32),
      resourceGraphStaleMin: randInt(isErr ? 240 : 0, isErr ? 900 : 30),
      cacheInvalidationForced: isErr,
      orphanedEdgeCount: randInt(isErr ? 38 : 0, isErr ? 220 : 4),
      message: isErr
        ? "Topology builder detected divergent NIC↔subnet edges against ARM snapshot watermark"
        : "Regional topology cache reconciled incrementally across stamp",
      graphBuildId: randUUID(),
    };
    const { properties: nwProps3, error: nwErr3 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "NetworkWatcherTopologyRefreshMeter",
      category: "NetworkWatcherTopologyIntegrity",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "503" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: nwProps3,
      ...(nwErr3 ? { error: nwErr3 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/networkWatchers"),
      azure: {
        network_watcher: {
          name: nw,
          resource_group: resourceGroup,
          category: "NetworkWatcherTopologyIntegrity",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("NetworkWatcherTopologyRefreshMeter"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(9e9, 4e11),
      },
      message: `[topo] ${nw}: staleMin=${props.resourceGraphStaleMin}`,
    };
  }

  if (variant === "nsg_topology_diff") {
    const nsgA = armNsg(subscription.id, resourceGroup, `nsg-a-${randId(3)}`);
    const nsgB = armNsg(subscription.id, resourceGroup, `nsg-b-${randId(3)}`);
    const props = {
      expectedSecurityPath: rand(["EastWest", "NorthSouthIngress"]),
      asymmetricRuleIds: isErr ? ["sr-SSH-22", "sr-HTTPS"] : [],
      dataplaneProbeResult: isErr ? "Unreachable" : "Symmetric",
      nsgEndpointsCompared: [nsgA.split("/").pop(), nsgB.split("/").pop()].join("|"),
      message: isErr
        ? "Effective NSG matrices disagree between probe agents after recent rule bulk replace"
        : "Cross-NSG path simulation matched authoring intent blueprint",
      diffEngineBuild: randInt(400, 900),
    };
    const { properties: nwProps4, error: nwErr4 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "NetworkWatcherNSGConnectivityMatrix",
      category: "NSGConnectivityTrace",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "418" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: nwProps4,
      ...(nwErr4 ? { error: nwErr4 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/networkWatchers"),
      azure: {
        network_watcher: {
          name: nw,
          resource_group: resourceGroup,
          category: "NSGConnectivityTrace",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("NetworkWatcherNSGConnectivityMatrix"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e9, 3e11),
      },
      message: `[nsg-diff] ${nw}: ${props.dataplaneProbeResult}`,
    };
  }

  if (variant === "connection_monitor_probe") {
    const props = {
      monitorName: `cm-${randId(4)}`,
      sourceVm: `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Compute/virtualMachines/vm-src-${randId(3)}`,
      destAddress: `${randInt(10, 10)}.${randInt(20, 60)}.${randInt(0, 255)}.${randInt(2, 250)}`,
      roundTripMs: randFloat(isErr ? 800 : 2.5, isErr ? 5000 : 140),
      packetLossPct: randFloat(isErr ? 58 : 0, isErr ? 100 : 0.8),
      probeProtocol: rand(["ICMP", "TCP"]),
      verdict: isErr ? "Unreachable" : "Healthy",
      message: isErr
        ? "Synthetic probe breached loss budget amid coincident backbone brownout"
        : "Connection Monitor maintained GREEN across configured test groups",
      testFrequencySec: randInt(30, 300),
    };
    const { properties: nwProps5, error: nwErr5 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "NetworkWatcherConnectionMonitorResult",
      category: "ConnectionMonitorTests",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "504" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: nwProps5,
      ...(nwErr5 ? { error: nwErr5 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/networkWatchers"),
      azure: {
        network_watcher: {
          name: nw,
          resource_group: resourceGroup,
          category: "ConnectionMonitorTests",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("NetworkWatcherConnectionMonitorResult"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e7, 9e11),
      },
      message: `[cm] ${nw}: ${props.monitorName} RTT=${props.roundTripMs.toFixed(1)}ms`,
    };
  }

  const op = isErr
    ? "Microsoft.Network/networkWatchers/write"
    : "Microsoft.Network/networkWatchers/queryTopology/action";
  const props = {
    entity: resourceId,
    eventCategory: "Administrative",
    status: isErr ? "Failed" : "Succeeded",
    errorCode: isErr ? rand(["NetworkWatcherNotFoundInRegion", "Throttled"]) : "",
    httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "POST" },
  };
  const { properties: nwAProps, error: nwAErr } = withNetworkingExtendedAzureErrors(
    isErr,
    variant,
    props as Record<string, unknown>
  );
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: op,
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "429" : "200",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Informational",
    properties: nwAProps,
    ...(nwAErr ? { error: nwAErr } : {}),
    cloud: azureCloud(region, subscription, "Microsoft.Network/networkWatchers"),
    azure: {
      network_watcher: {
        name: nw,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["network"],
      type: isErr ? ["denied"] : ["connection"],
      action: String(op),
      outcome: isErr ? "failure" : "success",
      duration: randInt(5e7, 3e9),
    },
    message: isErr
      ? `Network Watcher ${nw}: operation failed`
      : `Network Watcher ${nw}: topology query completed`,
  };
}

/** Point-to-site VPN client (gateway) connection events. */
export function generateVpnClientLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const gw = `gw-p2s-${randId(5).toLowerCase()}`;
  const resourceId = armVpnGateway(subscription.id, resourceGroup, gw);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "connect",
    "ike",
    "split_tunnel_leak",
    "aad_token_refresh",
    "profile_publish",
    "admin",
  ] as const);
  const clientId = randUUID();

  if (variant === "connect") {
    const props = {
      vpnClientId: clientId,
      publicClientIp: callerIp,
      assignedVIP: `${randInt(172, 172)}.16.${randInt(0, 255)}.${randInt(2, 250)}`,
      authentication: rand(["AAD", "Certificate", "Radius"]),
      connectionDurationSec: isErr ? 0 : randInt(60, 86_400),
      disconnectReason: isErr ? rand(["UserInitiated", "AuthFailure", "IdleTimeout"]) : "",
    };
    const { properties: vcProps1, error: vcErr1 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "P2SConnectionLogEvent",
      category: "P2SDiagnosticLog",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "401" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: vcProps1,
      ...(vcErr1 ? { error: vcErr1 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/virtualNetworkGateways"),
      azure: {
        vpn_client: {
          gateway_name: gw,
          resource_group: resourceGroup,
          category: "P2SDiagnosticLog",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("P2SConnectionLogEvent"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e7, 4e9),
      },
      message: isErr
        ? `P2S VPN ${gw}: client ${clientId.slice(0, 8)}… failed (${props.disconnectReason})`
        : `P2S VPN ${gw}: client connected VIP ${props.assignedVIP} (${props.authentication})`,
    };
  }

  if (variant === "ike") {
    const props = {
      ikeVersion: rand(["IKEv2", "OpenVPN"]),
      cipherSuite: rand(["GCMAES256", "AES256SHA384"]),
      saStatus: isErr ? "NegotiationFailed" : "Established",
      remoteUdpPort: randInt(4500, 4500),
      natTraversal: "UDP-4500",
      failureDetail: isErr ? rand(["NO_PROPOSAL_CHOSEN", "AUTHENTICATION_FAILED"]) : "",
    };
    const { properties: vcProps2, error: vcErr2 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "IKEDiagnosticLog",
      category: "IKEDiagnosticLog",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "500" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: vcProps2,
      ...(vcErr2 ? { error: vcErr2 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/virtualNetworkGateways"),
      azure: {
        vpn_client: {
          gateway_name: gw,
          resource_group: resourceGroup,
          category: "IKEDiagnosticLog",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("IKEDiagnosticLog"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e6, 5e8),
      },
      message: isErr
        ? `P2S ${gw}: IKE negotiation failed (${props.failureDetail})`
        : `P2S ${gw}: tunnel ${props.cipherSuite} ${props.saStatus}`,
    };
  }

  if (variant === "split_tunnel_leak") {
    const props = {
      routeModeObserved: isErr ? "ForceTunnelExpected" : "SplitTunnelHonor",
      leakedPublicDestinations: isErr ? ["youtube.com", "cdn.partner.net"] : [],
      corpRangesHonoredPct: randFloat(isErr ? 38 : 96, isErr ? 71 : 100),
      dnsSplitBrainDetected: isErr,
      remediationScriptVersion: randInt(120, 400),
      message: isErr
        ? "Client adapter still hairpinned SaaS egress despite published forced-tunnel ACL"
        : "Split exclusions matched approved split-tunnel blueprint",
      clientOsBuild: rand(["26100", "25996", "24H2-preview"]),
    };
    const { properties: vcProps3, error: vcErr3 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "VpnClientTunnelPolicyAudit",
      category: "P2SRoutingCompliance",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "451" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: vcProps3,
      ...(vcErr3 ? { error: vcErr3 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/virtualNetworkGateways"),
      azure: {
        vpn_client: {
          gateway_name: gw,
          resource_group: resourceGroup,
          category: "P2SRoutingCompliance",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("VpnClientTunnelPolicyAudit"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e8, 3e11),
      },
      message: `[routecheck] ${gw}: mode=${props.routeModeObserved}`,
    };
  }

  if (variant === "aad_token_refresh") {
    const props = {
      tenantIdPreview: randUUID(),
      expiresOnUtcSkewSec: randInt(isErr ? 5600 : -80, isErr ? 9600 : -5),
      tokenRefreshRetries: randInt(isErr ? 12 : 0, isErr ? 40 : 2),
      mfaElevationRequired: isErr,
      issuerEndpoint: rand(["login.microsoftonline.com", "sts.windows.net"]),
      message: isErr
        ? "Interactive token broker did not hydrate CAE token before dataplane deadline"
        : "Continuous access evaluation token rotation healthy",
      deviceId: randUUID(),
    };
    const { properties: vcProps4, error: vcErr4 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "VpnClientAADTokenDiag",
      category: "P2SIdentitySignals",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "472" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: vcProps4,
      ...(vcErr4 ? { error: vcErr4 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/virtualNetworkGateways"),
      azure: {
        vpn_client: {
          gateway_name: gw,
          resource_group: resourceGroup,
          category: "P2SIdentitySignals",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("VpnClientAADTokenDiag"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e7, 2e11),
      },
      message: `[aad] ${gw}: skew=${props.expiresOnUtcSkewSec}s`,
    };
  }

  if (variant === "profile_publish") {
    const props = {
      packageFlavor: rand(["vpnclientconfiguration.zip", "OpenVPN.ovpn-bundle"]),
      downloadRegionEdge: rand([`${region}-edge-a`, `${region}-edge-c`]),
      signatureValidation: isErr ? "TamperSuspected" : "VerifiedTrustedPublisher",
      publishedBytes: randInt(isErr ? 0 : 200_000, isErr ? 60_000 : 2_200_000),
      manifestChecksumMatch: !isErr,
      message: isErr
        ? "CDN edge served stale gzip manifest mismatched authoritative gateway stamp"
        : "Profile rollout aligned with GW configuration generation token",
      generationId: randUUID(),
    };
    const { properties: vcProps5, error: vcErr5 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "VpnClientProfilePublishTrace",
      category: "P2SProfileDistribution",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "409" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: vcProps5,
      ...(vcErr5 ? { error: vcErr5 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/virtualNetworkGateways"),
      azure: {
        vpn_client: {
          gateway_name: gw,
          resource_group: resourceGroup,
          category: "P2SProfileDistribution",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("VpnClientProfilePublishTrace"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e8, 4e11),
      },
      message: `[pkg] ${gw}: ${props.packageFlavor}`,
    };
  }

  const op = isErr
    ? "Microsoft.Network/virtualNetworkGateways/write"
    : rand([
        "Microsoft.Network/virtualNetworkGateways/write",
        "Microsoft.Network/virtualNetworkGateways/reset/action",
      ]);
  const props = {
    entity: resourceId,
    eventCategory: "Administrative",
    status: isErr ? "Failed" : "Succeeded",
    errorCode: isErr ? rand(["GatewaySubnetRequired", "VpnGatewaySkuMismatch"]) : "",
    httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
  };
  const { properties: vcAProps, error: vcAErr } = withNetworkingExtendedAzureErrors(
    isErr,
    variant,
    props as Record<string, unknown>
  );
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: op,
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "400" : "200",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Informational",
    properties: vcAProps,
    ...(vcAErr ? { error: vcAErr } : {}),
    cloud: azureCloud(region, subscription, "Microsoft.Network/virtualNetworkGateways"),
    azure: {
      vpn_client: {
        gateway_name: gw,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["network"],
      type: isErr ? ["denied"] : ["connection"],
      action: String(op),
      outcome: isErr ? "failure" : "success",
      duration: randInt(1e8, 6e9),
    },
    message: isErr ? `VPN gateway ${gw}: update failed` : `VPN gateway ${gw}: ${op} succeeded`,
  };
}

/** Azure Firewall Policy rule collection group revisions. */
export function generateFirewallPolicyLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const pol = `afwp-${rand(["prod", "pci"])}-${randId(4).toLowerCase()}`;
  const resourceId = armFirewallPolicy(subscription.id, resourceGroup, pol);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "rule_collection_bundle_provision",
    "policy_provision_deploy",
    "idps_signature_hit_meter",
    "threat_intel_pipeline_sync",
    "dns_proxy_intercept_audit",
    "admin",
  ] as const);

  if (variant === "rule_collection_bundle_provision") {
    const props = {
      ruleCollectionGroup: `DefaultDnat-${randId(3)}`,
      priority: randInt(100, 65_000),
      ruleCount: isErr ? 0 : randInt(2, 80),
      changeType: isErr ? "Rollback" : rand(["Create", "Update", "Replace"]),
      validationErrors: isErr ? ["OverlappingRulePriorities", "InvalidFqdnPattern"] : [],
    };
    const { properties: fwProps1, error: fwErr1 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "FirewallPolicyRuleCollectionGroupChanged",
      category: "AzureFirewallPolicyRuleCollectionGroup",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "400" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: fwProps1,
      ...(fwErr1 ? { error: fwErr1 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/firewallPolicies"),
      azure: {
        firewall_policy: {
          name: pol,
          resource_group: resourceGroup,
          category: "AzureFirewallPolicyRuleCollectionGroup",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("FirewallPolicyRuleCollectionGroupChanged"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e7, 4e9),
      },
      message: isErr
        ? `Firewall policy ${pol}: RCG ${props.ruleCollectionGroup} validation failed`
        : `Firewall policy ${pol}: applied ${props.changeType} on ${props.ruleCollectionGroup}`,
    };
  }

  if (variant === "policy_provision_deploy") {
    const props = {
      attachedFirewalls: [
        `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/azureFirewalls/afw-${randId(3)}`,
      ],
      commitId: randUUID(),
      propagationStatus: isErr ? "PartialFailure" : "Complete",
      failedTargets: isErr ? ["afw-edge-east"] : [],
    };
    const { properties: fwProps2, error: fwErr2 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "FirewallPolicyPropagationStatus",
      category: "AzureFirewallPolicyCommit",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "503" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: fwProps2,
      ...(fwErr2 ? { error: fwErr2 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/firewallPolicies"),
      azure: {
        firewall_policy: {
          name: pol,
          resource_group: resourceGroup,
          category: "AzureFirewallPolicyCommit",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("FirewallPolicyPropagationStatus"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e8, 8e9),
      },
      message: isErr
        ? `Firewall policy ${pol}: propagation incomplete (${props.propagationStatus})`
        : `Firewall policy ${pol}: committed to ${props.attachedFirewalls.length} firewall(s)`,
    };
  }

  if (variant === "idps_signature_hit_meter") {
    const props = {
      signatureId: `sig-${randId(6)}`,
      severity: rand(["Medium", "High", "Critical"]),
      hitsBlocked: randInt(isErr ? 400 : 12, isErr ? 180_000 : 8000),
      falsePositiveSuspectPct: randFloat(isErr ? 62 : 0.05, isErr ? 93 : 0.8),
      mode: rand(["Prevent", "Alert"]),
      correlationFlowId: randUUID(),
      message: isErr
        ? "Burst of IDPS denies correlated with malformed SMB fragment replays upstream"
        : "Signature behaving within expected nuisance tolerance band",
      snortRevision: randInt(1400, 2800),
    };
    const { properties: fwProps3, error: fwErr3 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "FirewallPolicyIdpsSignatureMeter",
      category: "AzureFirewallIdpsSignals",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "429" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: fwProps3,
      ...(fwErr3 ? { error: fwErr3 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/firewallPolicies"),
      azure: {
        firewall_policy: {
          name: pol,
          resource_group: resourceGroup,
          category: "AzureFirewallIdpsSignals",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("FirewallPolicyIdpsSignatureMeter"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e8, 5e11),
      },
      message: `[idps] ${pol}: ${props.signatureId}`,
    };
  }

  if (variant === "threat_intel_pipeline_sync") {
    const props = {
      feedVendor: rand(["RecordedFuture", "MISP-Community", "STIX-AzureTI"]),
      feedVersionUtc: azureDiagnosticTime(ts),
      ingestionLagSec: randInt(isErr ? 980 : 30, isErr ? 7200 : 420),
      dedupCollapsedIndicators: randInt(isErr ? 8200 : 400, isErr ? 120_000 : 9000),
      syncOutcome: isErr ? "StaleCursor" : "Fresh",
      message: isErr
        ? "Downloader could not reconcile delta cursor after upstream manifest rotation"
        : "Incremental TI bundle applied atomically across policy attachments",
      protectedLists: randInt(isErr ? 5 : 1, isErr ? 12 : 5),
    };
    const { properties: fwProps4, error: fwErr4 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "FirewallPolicyThreatIntelSync",
      category: "AzureFirewallIntelPipeline",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "408" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: fwProps4,
      ...(fwErr4 ? { error: fwErr4 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/firewallPolicies"),
      azure: {
        firewall_policy: {
          name: pol,
          resource_group: resourceGroup,
          category: "AzureFirewallIntelPipeline",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("FirewallPolicyThreatIntelSync"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e9, 4e11),
      },
      message: `[ti] ${pol}: ${props.syncOutcome}`,
    };
  }

  if (variant === "dns_proxy_intercept_audit") {
    const props = {
      queriedFqdn: rand(["evil-update.net", "api.partner.meridiantech.", "streaming-edge.io"]),
      responsePolicyAction: isErr
        ? rand(["OverrideSinkhole", "BlockNXDOMAIN"])
        : "PassthroughTrusted",
      chainLatencyMs: randFloat(isErr ? 420 : 4, isErr ? 2400 : 65),
      cachePoisonSuspected: isErr,
      ecsClientScope: rand(["10.120.10.5/29", "fd00::21a/64"]),
      message: isErr
        ? "Upstream resolver chain diverged from signed policy manifest midway through rollout"
        : "DNS Proxy classification matched approved domain category matrix",
      queryType: rand(["A", "AAAA", "HTTPS"]),
    };
    const { properties: fwProps5, error: fwErr5 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "FirewallPolicyDnsInspectTrace",
      category: "AzureFirewallDnsSignals",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "451" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: fwProps5,
      ...(fwErr5 ? { error: fwErr5 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/firewallPolicies"),
      azure: {
        firewall_policy: {
          name: pol,
          resource_group: resourceGroup,
          category: "AzureFirewallDnsSignals",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("FirewallPolicyDnsInspectTrace"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e8, 4e11),
      },
      message: `[dns] ${pol}: ${props.queriedFqdn}`,
    };
  }

  const op = isErr
    ? "Microsoft.Network/firewallPolicies/write"
    : rand([
        "Microsoft.Network/firewallPolicies/write",
        "Microsoft.Network/firewallPolicies/delete",
      ]);
  const props = {
    entity: resourceId,
    eventCategory: "Administrative",
    status: isErr ? "Failed" : "Succeeded",
    errorCode: isErr ? rand(["FirewallPolicyInUseByRuleStack", "InvalidPolicyReference"]) : "",
    httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
  };
  const { properties: fwAProps, error: fwAErr } = withNetworkingExtendedAzureErrors(
    isErr,
    variant,
    props as Record<string, unknown>
  );
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: op,
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "409" : "200",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Informational",
    properties: fwAProps,
    ...(fwAErr ? { error: fwAErr } : {}),
    cloud: azureCloud(region, subscription, "Microsoft.Network/firewallPolicies"),
    azure: {
      firewall_policy: {
        name: pol,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["network"],
      type: isErr ? ["denied"] : ["connection"],
      action: String(op),
      outcome: isErr ? "failure" : "success",
      duration: randInt(1e8, 5e9),
    },
    message: isErr
      ? `Firewall policy ${pol}: control-plane update failed`
      : `Firewall policy ${pol}: ${op} ok`,
  };
}

/** ExpressRoute circuit provisioning and peering. */
export function generateExpressRouteCircuitLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const circ = `erc-${rand(["primary", "backup"])}-${randId(4).toLowerCase()}`;
  const resourceId = armExpressRouteCircuit(subscription.id, resourceGroup, circ);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "bgp",
    "provision",
    "optical_health",
    "carrier_handoff_sla",
    "vlan_translate_drift",
    "admin",
  ] as const);

  if (variant === "bgp") {
    const props = {
      peeringType: rand(["AzurePrivatePeering", "MicrosoftPeering"]),
      peerAsn: rand([12076, 8075, 65000]),
      peeringState: isErr ? "Disabled" : rand(["Enabled", "Enabled", "Connecting"]),
      advertisedPrefixes: isErr ? 0 : randInt(1, 64),
      learnedRoutes: isErr ? 0 : randInt(4, 400),
      arpUnresolved: isErr ? randInt(1, 5) : 0,
    };
    const { properties: ercProps1, error: ercErr1 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ExpressRouteBgpPeeringState",
      category: "ExpressRouteCircuitPeering",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "503" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: ercProps1,
      ...(ercErr1 ? { error: ercErr1 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/expressRouteCircuits"),
      azure: {
        express_route: {
          circuit_name: circ,
          resource_group: resourceGroup,
          category: "ExpressRouteCircuitPeering",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("ExpressRouteBgpPeeringState"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e7, 6e8),
      },
      message: isErr
        ? `ExpressRoute ${circ}: ${props.peeringType} unhealthy (ARP ${props.arpUnresolved})`
        : `ExpressRoute ${circ}: ${props.peeringState} ${props.peeringType} routes=${props.learnedRoutes}`,
    };
  }

  if (variant === "provision") {
    const props = {
      bandwidthInMbps: rand([50, 100, 200, 1000]),
      serviceProvider: rand(["Equinix", "AT&T", "BT", "Megaport"]),
      provisioningState: isErr ? "Failed" : rand(["Succeeded", "Updating"]),
      circuitSku: rand(["Standard", "Premium"]),
      lastError: isErr ? "Provider provisioning ticket rejected" : "",
    };
    const { properties: ercProps2, error: ercErr2 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ExpressRouteCircuitProvisioningState",
      category: "ExpressRouteOperational",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "500" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: ercProps2,
      ...(ercErr2 ? { error: ercErr2 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/expressRouteCircuits"),
      azure: {
        express_route: {
          circuit_name: circ,
          resource_group: resourceGroup,
          category: "ExpressRouteOperational",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("ExpressRouteCircuitProvisioningState"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e8, 12e9),
      },
      message: isErr
        ? `ExpressRoute ${circ}: provisioning failed (${props.lastError})`
        : `ExpressRoute ${circ}: ${props.serviceProvider} ${props.bandwidthInMbps}Mbps ${props.provisioningState}`,
    };
  }

  if (variant === "optical_health") {
    const props = {
      fecCorrectedSymbols: randInt(isErr ? 3_800_000 : 0, isErr ? 22_000_000 : 400_000),
      berEstimate: randFloat(isErr ? 1.2e-9 : 1e-13, isErr ? 4e-8 : 1e-11),
      lineCard: rand(["LC1", "LC2", "MetroEdgeMux"]),
      lastOpticalAlarm: isErr ? rand(["LossOfSignal", "High BER"]) : "None",
      message: isErr
        ? "Metro wave experienced sustained FEC pressure breaching SLA envelope"
        : "Optical margin nominal across redundant lambda pair",
      maintenanceWindowBypassed: isErr,
    };
    const { properties: ercProps3, error: ercErr3 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ExpressRoutePhysicalLayerDiag",
      category: "ExpressRouteOpticalHealth",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "555" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: ercProps3,
      ...(ercErr3 ? { error: ercErr3 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/expressRouteCircuits"),
      azure: {
        express_route: {
          circuit_name: circ,
          resource_group: resourceGroup,
          category: "ExpressRouteOpticalHealth",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("ExpressRoutePhysicalLayerDiag"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(3e9, 4e11),
      },
      message: `[phy] ExpressRoute ${circ}: ${props.lastOpticalAlarm}`,
    };
  }

  if (variant === "carrier_handoff_sla") {
    const props = {
      handoffPop: rand(["Equinix-CH2", "CoreSite-LA1", "NYIIX-MegaIX"]),
      committedMsLatency: randInt(3, 18),
      observedMsLatency: randFloat(isErr ? 42 : 4.2, isErr ? 120 : 16),
      jitterMsP99: randFloat(isErr ? 28 : 0.4, isErr ? 90 : 4.5),
      breachReason: isErr ? "CongestedIXPort" : "",
      message: isErr
        ? "Carrier demarc burst queue introduced multi-ms jitter above committed envelope"
        : "Handoff latency distribution stayed within gold SLA tier",
      crossConnectId: `xc-${randId(6)}`,
    };
    const { properties: ercProps4, error: ercErr4 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ExpressRouteCarrierHandoffMeter",
      category: "ExpressRouteSLATelemetry",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "504" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: ercProps4,
      ...(ercErr4 ? { error: ercErr4 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/expressRouteCircuits"),
      azure: {
        express_route: {
          circuit_name: circ,
          resource_group: resourceGroup,
          category: "ExpressRouteSLATelemetry",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("ExpressRouteCarrierHandoffMeter"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e8, 5e11),
      },
      message: `[sla] ExpressRoute ${circ}: ${props.handoffPop}`,
    };
  }

  if (variant === "vlan_translate_drift") {
    const props = {
      customerVlan: randInt(100, 900),
      serviceVlan: randInt(1000, 1999),
      innerTagPreserve: rand([true, false]),
      translateTableHash: randUUID(),
      datapathSymmetric: !isErr,
      message: isErr
        ? "Q-in-Q stacking diverged causing ARP starvation on standby path during failover rehearsal"
        : "Single-tagged VLAN mapping stayed consistent vs authoritative template",
      peeringMux: rand(["PRIMARY", "SECONDARY"]),
    };
    const { properties: ercProps5, error: ercErr5 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ExpressRouteVlanTranslateConsistency",
      category: "ExpressRouteVlanAudit",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "427" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: ercProps5,
      ...(ercErr5 ? { error: ercErr5 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/expressRouteCircuits"),
      azure: {
        express_route: {
          circuit_name: circ,
          resource_group: resourceGroup,
          category: "ExpressRouteVlanAudit",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("ExpressRouteVlanTranslateConsistency"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e9, 2e11),
      },
      message: `[vlan] ER ${circ}: cVlan=${props.customerVlan} mux=${props.peeringMux}`,
    };
  }

  const op = isErr
    ? "Microsoft.Network/expressRouteCircuits/write"
    : rand([
        "Microsoft.Network/expressRouteCircuits/write",
        "Microsoft.Network/expressRouteCircuits/delete",
      ]);
  const props = {
    entity: resourceId,
    eventCategory: "Administrative",
    status: isErr ? "Failed" : "Succeeded",
    errorCode: isErr ? rand(["ExpressRoutePortUnavailable", "BandwidthUnavailable"]) : "",
    httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
  };
  const { properties: ercAProps, error: ercAErr } = withNetworkingExtendedAzureErrors(
    isErr,
    variant,
    props as Record<string, unknown>
  );
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: op,
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "409" : "200",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Informational",
    properties: ercAProps,
    ...(ercAErr ? { error: ercAErr } : {}),
    cloud: azureCloud(region, subscription, "Microsoft.Network/expressRouteCircuits"),
    azure: {
      express_route: {
        circuit_name: circ,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["network"],
      type: isErr ? ["denied"] : ["connection"],
      action: String(op),
      outcome: isErr ? "failure" : "success",
      duration: randInt(1e8, 5e9),
    },
    message: isErr
      ? `ExpressRoute circuit ${circ}: ARM operation failed`
      : `ExpressRoute circuit ${circ}: updated`,
  };
}

/** ExpressRoute virtual network gateway connection to circuit. */
export function generateExpressRouteGatewayLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const gw = `ergw-${randId(5).toLowerCase()}`;
  const resourceId = armVpnGateway(subscription.id, resourceGroup, gw);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "connection",
    "arp",
    "msee_peering_health",
    "tunnel_encryption_rekey",
    "mac_address_migration",
    "admin",
  ] as const);
  const circuitId = armExpressRouteCircuit(subscription.id, resourceGroup, `erc-core-${randId(3)}`);

  if (variant === "connection") {
    const props = {
      expressRouteCircuitId: circuitId,
      connectionStatus: isErr ? "Disconnected" : rand(["Connected", "Connected", "Degraded"]),
      bitsInPerSecond: isErr ? 0 : randInt(10_000_000, 2_000_000_000),
      bitsOutPerSecond: isErr ? 0 : randInt(10_000_000, 2_000_000_000),
      adminState: isErr ? "Disabled" : "Enabled",
    };
    const { properties: ergwProps1, error: ergwErr1 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ExpressRouteGatewayConnectionEvent",
      category: "ExpressRouteGatewayDiagnostic",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "503" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: ergwProps1,
      ...(ergwErr1 ? { error: ergwErr1 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/virtualNetworkGateways"),
      azure: {
        expressroute_gateway: {
          gateway_name: gw,
          resource_group: resourceGroup,
          category: "ExpressRouteGatewayDiagnostic",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("ExpressRouteGatewayConnectionEvent"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e7, 5e8),
      },
      message: isErr
        ? `ExpressRoute GW ${gw}: lost connectivity to circuit ${circuitId.split("/").pop()}`
        : `ExpressRoute GW ${gw}: ${props.connectionStatus} to circuit (bps in/out ${props.bitsInPerSecond}/${props.bitsOutPerSecond})`,
    };
  }

  if (variant === "arp") {
    const props = {
      peeringAzurePrimaryMAC: `00-1D-${randId(4)}-${randId(4)}`,
      onPremPrimaryRouterIp: `${randInt(192, 192)}.168.${randInt(0, 255)}.${randInt(2, 250)}`,
      arpResolution: isErr ? "Failed" : "Succeeded",
      failedPeer: isErr ? "secondary" : "",
    };
    const { properties: ergwProps2, error: ergwErr2 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ExpressRouteGatewayArpTable",
      category: "ExpressRouteGatewayArp",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "500" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: ergwProps2,
      ...(ergwErr2 ? { error: ergwErr2 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/virtualNetworkGateways"),
      azure: {
        expressroute_gateway: {
          gateway_name: gw,
          resource_group: resourceGroup,
          category: "ExpressRouteGatewayArp",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("ExpressRouteGatewayArpTable"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(5e6, 3e8),
      },
      message: isErr
        ? `ExpressRoute GW ${gw}: ARP resolution failed on ${props.failedPeer} path`
        : `ExpressRoute GW ${gw}: ARP OK primary=${props.onPremPrimaryRouterIp}`,
    };
  }

  if (variant === "msee_peering_health") {
    const props = {
      mseeFacility: rand(["MSEE-EAST-DMZ", "MSEE-WEST-Core"]),
      controlPlaneHeartbeatMs: randFloat(isErr ? 840 : 3.8, isErr ? 4200 : 44),
      routeServerSyncLagSec: randInt(isErr ? 120 : 0, isErr ? 900 : 8),
      lastNotifiedIncident: isErr ? "PartialMSEE-brownout" : "None",
      circuitIdentifierShort: circuitId.split("/").pop(),
      message: isErr
        ? "BGP control channel flapped concurrently with constrained MSEE power domain"
        : "MSEE peering dataplane remained aligned with redundancy pair",
      trafficEngineeringTier: rand(["Gold", "Silver"]),
    };
    const { properties: ergwProps3, error: ergwErr3 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ExpressRouteGatewayMseeHealthPulse",
      category: "ExpressRouteGatewayMSEE",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "532" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: ergwProps3,
      ...(ergwErr3 ? { error: ergwErr3 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/virtualNetworkGateways"),
      azure: {
        expressroute_gateway: {
          gateway_name: gw,
          resource_group: resourceGroup,
          category: "ExpressRouteGatewayMSEE",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("ExpressRouteGatewayMseeHealthPulse"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(2e8, 3e11),
      },
      message: `[msee] ER GW ${gw}: ${props.mseeFacility}`,
    };
  }

  if (variant === "tunnel_encryption_rekey") {
    const props = {
      ipsecChildSaCount: randInt(isErr ? 28 : 2, isErr ? 220 : 32),
      rekeyFailures: randInt(isErr ? 9 : 0, isErr ? 80 : 1),
      encryptionSuite: rand(["GCMAES256", "AES256-SHA384"]),
      mmSaLifetimeSec: randInt(28_800, 86_400),
      blackoutMsObserved: randInt(isErr ? 820 : 0, isErr ? 9400 : 140),
      message: isErr
        ? "Child SA churn exceeded allowed overlap window during IKEv2 rekey spike"
        : "IKEv2/MM rekeys completed inside silent maintenance envelope",
      peerRouterLoopback: `${randInt(169, 169)}.254.${randInt(0, 12)}.${randInt(10, 200)}`,
    };
    const { properties: ergwProps4, error: ergwErr4 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ExpressRouteGatewayIpsecRekeyTrace",
      category: "ExpressRouteGatewayCryptoSignals",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "552" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: ergwProps4,
      ...(ergwErr4 ? { error: ergwErr4 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/virtualNetworkGateways"),
      azure: {
        expressroute_gateway: {
          gateway_name: gw,
          resource_group: resourceGroup,
          category: "ExpressRouteGatewayCryptoSignals",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("ExpressRouteGatewayIpsecRekeyTrace"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(4e9, 9e11),
      },
      message: `[ipsec] ER GW ${gw}: rekeys failed=${props.rekeyFailures}`,
    };
  }

  if (variant === "mac_address_migration") {
    const props = {
      previousMac: `00-${randId(4)}-${randId(4)}`,
      intendedMac: `00-${randId(4)}-${randId(4)}`,
      grArpBurstSent: randInt(isErr ? 420 : 6, isErr ? 9000 : 120),
      neighborCachePoisonRisk: isErr,
      failoverRole: rand(["PRIMARY", "STANDBY"]),
      message: isErr
        ? "Stale ARP caches on-prem ignored gratuitous bursts after NIC migration"
        : "Controlled MAC failover converged inside maintenance comms window",
      vnetNicResourceId: `${resourceId}/ipConfigurations/ipconfig1`,
    };
    const { properties: ergwProps5, error: ergwErr5 } = withNetworkingExtendedAzureErrors(
      isErr,
      variant,
      props as Record<string, unknown>
    );
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ExpressRouteGatewayMacMigrationTrace",
      category: "ExpressRouteGatewayL2Signals",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "558" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: ergwProps5,
      ...(ergwErr5 ? { error: ergwErr5 } : {}),
      cloud: azureCloud(region, subscription, "Microsoft.Network/virtualNetworkGateways"),
      azure: {
        expressroute_gateway: {
          gateway_name: gw,
          resource_group: resourceGroup,
          category: "ExpressRouteGatewayL2Signals",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: {
        kind: "event",
        category: ["network"],
        type: isErr ? ["denied"] : ["connection"],
        action: String("ExpressRouteGatewayMacMigrationTrace"),
        outcome: isErr ? "failure" : "success",
        duration: randInt(1e10, 4e11),
      },
      message: `[mac] ER GW ${gw}: role=${props.failoverRole}`,
    };
  }

  const op = isErr
    ? "Microsoft.Network/virtualNetworkGateways/write"
    : rand([
        "Microsoft.Network/virtualNetworkGateways/write",
        "Microsoft.Network/connections/write",
      ]);
  const props = {
    entity: resourceId,
    eventCategory: "Administrative",
    status: isErr ? "Failed" : "Succeeded",
    errorCode: isErr ? rand(["GatewaySubnetConflict", "ExpressRouteConnectionNotFound"]) : "",
    circuitRef: circuitId,
    httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
  };
  const { properties: ergwAProps, error: ergwAErr } = withNetworkingExtendedAzureErrors(
    isErr,
    variant,
    props as Record<string, unknown>
  );
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: op,
    category: "Administrative",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "400" : "200",
    callerIpAddress: callerIp,
    correlationId,
    level: isErr ? "Error" : "Informational",
    properties: ergwAProps,
    ...(ergwAErr ? { error: ergwAErr } : {}),
    cloud: azureCloud(region, subscription, "Microsoft.Network/virtualNetworkGateways"),
    azure: {
      expressroute_gateway: {
        gateway_name: gw,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      category: ["network"],
      type: isErr ? ["denied"] : ["connection"],
      action: String(op),
      outcome: isErr ? "failure" : "success",
      duration: randInt(1e8, 6e9),
    },
    message: isErr
      ? `ExpressRoute GW ${gw}: link configuration failed`
      : `ExpressRoute GW ${gw}: ${op} completed`,
  };
}
