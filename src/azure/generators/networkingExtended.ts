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
} from "./helpers.js";

function azureDiagnosticTime(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) {
    const base = ts.replace(/Z$/i, "").split(".")[0] ?? ts;
    return `${base}.0000000Z`;
  }
  const iso = d.toISOString();
  const m = /^(.+)T(.+)\.(\d+)Z$/.exec(iso);
  if (!m) return `${iso.slice(0, 19)}.0000000Z`;
  const frac = m[3]!.padEnd(7, "0").slice(0, 7);
  return `${m[1]}T${m[2]}.${frac}Z`;
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
  const variant = rand(["flow", "rule_eval", "admin"] as const);

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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e5, 6e8) },
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e6, 2e8) },
      message: isErr
        ? `NSG ${nsg}: rule evaluation dropped traffic (implicit deny)`
        : `NSG ${nsg}: security rule ${props.matchedRule} matched`,
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
    properties: props,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 4e9) },
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
  const variant = rand(["snat", "path", "admin"] as const);

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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e6, 3e8) },
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e5, 2e8) },
      message: isErr
        ? `NAT ${nat}: outbound flow dropped (${String(props.dropReason)})`
        : `NAT ${nat}: SNAT ${props.srcPrivateIp}→${props.destPublicIp}:${props.destPort}`,
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
    properties: props,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 4e9) },
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
  const variant = rand(["connection", "dns", "admin"] as const);

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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e7, 9e8) },
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e6, 4e8) },
      message: isErr
        ? `Private Endpoint ${pe}: DNS resolution failed for ${props.privateDnsZone}`
        : `Private Endpoint ${pe}: resolved ${props.privateDnsZone} (${props.resolutionResult})`,
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
    properties: props,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 5e9) },
    message: isErr
      ? `Private endpoint ${pe}: ARM operation failed`
      : `Private endpoint ${pe}: provisioning completed`,
  };
}

/** Private DNS zone record changes and optional query logging style events. */
export function generatePrivateDnsLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const zone = `${rand(["contoso", "fabrikam"])}.internal`;
  const resourceId = armPrivateDnsZone(subscription.id, resourceGroup, zone);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["record", "link", "query"] as const);
  const recordName = rand(["api", "db", "vault", "files"]);

  if (variant === "record") {
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 3e9) },
      message: isErr
        ? `Private DNS ${zone}: record set update failed for ${props.recordSet}`
        : `Private DNS ${zone}: ${props.recordType} record ${props.recordSet} updated`,
    };
  }

  if (variant === "link") {
    const props = {
      virtualNetworkLink: `vnetlink-${randId(4)}`,
      vnetId: `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/virtualNetworks/vnet-${randId(4)}`,
      registrationEnabled: rand([true, false]),
      linkStatus: isErr ? "Failed" : "Completed",
      provisioningState: isErr ? "Failed" : "Succeeded",
    };
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 4e9) },
      message: isErr
        ? `Private DNS ${zone}: VNet link ${props.virtualNetworkLink} failed`
        : `Private DNS ${zone}: linked to ${props.virtualNetworkLink}`,
    };
  }

  const props = {
    queryName: `${recordName}.${zone}`,
    queryType: rand(["A", "AAAA"]),
    clientIp: `${randInt(10, 10)}.${randInt(0, 5)}.${randInt(0, 255)}.${randInt(2, 250)}`,
    responseCode: isErr ? "SERVFAIL" : "NOERROR",
    answerCount: isErr ? 0 : randInt(1, 4),
    queryTimeMs: randFloat(0.5, isErr ? 200 : 12),
  };
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
    properties: props,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e5, 2e7) },
    message: isErr
      ? `Private DNS query failed: ${props.queryName} (${props.responseCode})`
      : `Private DNS query: ${props.queryName} ${props.queryType} answers=${props.answerCount}`,
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
  const variant = rand(["probe", "routing", "admin"] as const);
  const endpoint = `ep-${rand(["westus2", "eastus"])}-${randId(3)}`;

  if (variant === "probe") {
    const props = {
      endpointName: endpoint,
      probeTarget: rand([
        "https://api.contoso.com/health",
        "https://web.contoso.com/",
        "tcp://10.0.1.4:443",
      ]),
      probeStatus: isErr ? "Degraded" : rand(["Healthy", "Healthy", "Unknown"]),
      httpStatusCode: isErr ? rand([0, 408, 503]) : 200,
      failureReason: isErr ? rand(["Timeout", "TcpReset", "CertificateError"]) : "",
    };
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e5, 3e8) },
      message: isErr
        ? `Traffic Manager ${profile}: probe failed for ${endpoint} (${props.failureReason})`
        : `Traffic Manager ${profile}: endpoint ${endpoint} probe ${props.probeStatus}`,
    };
  }

  if (variant === "routing") {
    const props = {
      routingMethod: rand(["Performance", "Priority", "Geographic", "Weighted"]),
      selectedEndpoint: isErr ? "" : endpoint,
      dnsQuery: `www.${rand(["contoso", "fabrikam"])}.com`,
      reasonCode: isErr
        ? "AllEndpointsUnhealthy"
        : rand(["BestPerformance", "FailoverToSecondary", "GeoMatch"]),
    };
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(2e5, 8e7) },
      message: isErr
        ? `Traffic Manager ${profile}: routing failure (${props.reasonCode})`
        : `Traffic Manager ${profile}: routed ${props.dnsQuery} → ${props.selectedEndpoint}`,
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
    properties: props,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 4e9) },
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
  const variant = rand(["attack", "mitigation", "admin"] as const);

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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e7, 6e8) },
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e7, 5e8) },
      message: isErr
        ? `DDoS mitigation ${plan}: mitigation degraded (status=${props.mitigationStatus})`
        : `DDoS mitigation ${plan}: dropped ${props.droppedPackets} packets`,
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
    properties: props,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 4e9) },
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
  const variant = rand(["session", "tunnel", "admin"] as const);
  const user = rand(["alice@contoso.com", "bob@fabrikam.com", "breakglass-admin"]);

  if (variant === "session") {
    const props = {
      sessionType: rand(["ssh", "rdp"]),
      targetVmResourceId: `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Compute/virtualMachines/vm-jump-${randId(3)}`,
      clientPublicIp: callerIp,
      sessionId: randUUID(),
      sessionState: isErr ? "Failed" : rand(["Connected", "Disconnected"]),
      disconnectReason: isErr ? rand(["AuthFailed", "IdleTimeout", "PolicyDeny"]) : "",
    };
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
      properties: { ...props, userPrincipalName: user },
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 3e10) },
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
      properties: { ...props, userPrincipalName: user },
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e7, 8e9) },
      message: isErr
        ? `Bastion ${host}: tunnel reset for ${user}`
        : `Bastion ${host}: native client tunnel active (${props.nativeClientMode})`,
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
    properties: props,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 6e9) },
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
  const variant = rand(["match", "bot", "admin"] as const);

  if (variant === "match") {
    const props = {
      ruleId: `94${randInt(100, 999)}`,
      ruleGroup: rand(["REQUEST-920-PROTOCOL-ENFORCEMENT", "REQUEST-931-APPLICATION-ATTACK-RFI"]),
      action: isErr ? "Block" : rand(["Allow", "Log", "Block"]),
      message: isErr
        ? "Inbound Anomaly Score Exceeded (Critical)"
        : "Restricted SQL Character Anomaly Detection (score 3)",
      clientIp: callerIp,
      hostname: rand(["api.contoso.com", "shop.fabrikam.com"]),
      requestUri: rand(["/admin/login", "/api/query", "/.env"]),
      details: { match: "union select", severity: isErr ? "Critical" : "Warning" },
    };
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e5, 6e8) },
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e6, 4e8) },
      message: isErr
        ? `WAF policy ${policy}: bot challenge failed (${props.botCategory})`
        : `WAF policy ${policy}: bot score=${props.botScore} ${props.challengeResult}`,
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
    properties: props,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 4e9) },
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
  const variant = rand(["site", "route", "admin"] as const);
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e7, 4e8) },
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e6, 3e8) },
      message: isErr
        ? `Virtual WAN ${vwan}: route propagation error on ${hub}`
        : `Virtual WAN ${vwan}: ${props.routeOperation} ${props.effectivePrefix} via ${props.routeTable}`,
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
    properties: props,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 5e9) },
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
  const variant = rand(["bgp", "route", "admin"] as const);

  if (variant === "bgp") {
    const peerIp = `${randInt(169, 169)}.254.${randInt(0, 50)}.${randInt(2, 250)}`;
    const props = {
      peerAsn: rand([65001, 65002, 4200000000]),
      peerIp,
      sessionState: isErr ? "Idle" : rand(["Established", "Active", "Connect"]),
      prefixCount: isErr ? 0 : randInt(4, 400),
      lastError: isErr ? rand(["HoldTimerExpired", "BGPNotificationCease", "AuthFailed"]) : "",
    };
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e7, 5e8) },
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e6, 4e8) },
      message: isErr
        ? `Route Server ${rs}: failed to push routes to ${props.propagationTarget}`
        : `Route Server ${rs}: ${props.operation} for ${props.branchName}`,
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
    properties: props,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 6e9) },
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
  const variant = rand(["flow", "capture", "admin"] as const);

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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 4e9) },
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 12e9) },
      message: isErr
        ? `Network Watcher ${nw}: packet capture failed on target VM`
        : `Network Watcher ${nw}: capture ${props.totalBytesCaptured} bytes to blob`,
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
    properties: props,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(5e7, 3e9) },
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
  const variant = rand(["connect", "ike", "admin"] as const);
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e7, 4e9) },
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e6, 5e8) },
      message: isErr
        ? `P2S ${gw}: IKE negotiation failed (${props.failureDetail})`
        : `P2S ${gw}: tunnel ${props.cipherSuite} ${props.saStatus}`,
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
    properties: props,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 6e9) },
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
  const variant = rand(["rcg", "commit", "admin"] as const);

  if (variant === "rcg") {
    const props = {
      ruleCollectionGroup: `DefaultDnat-${randId(3)}`,
      priority: randInt(100, 65_000),
      ruleCount: isErr ? 0 : randInt(2, 80),
      changeType: isErr ? "Rollback" : rand(["Create", "Update", "Replace"]),
      validationErrors: isErr ? ["OverlappingRulePriorities", "InvalidFqdnPattern"] : [],
    };
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e7, 4e9) },
      message: isErr
        ? `Firewall policy ${pol}: RCG ${props.ruleCollectionGroup} validation failed`
        : `Firewall policy ${pol}: applied ${props.changeType} on ${props.ruleCollectionGroup}`,
    };
  }

  if (variant === "commit") {
    const props = {
      attachedFirewalls: [
        `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/azureFirewalls/afw-${randId(3)}`,
      ],
      commitId: randUUID(),
      propagationStatus: isErr ? "PartialFailure" : "Complete",
      failedTargets: isErr ? ["afw-edge-east"] : [],
    };
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 8e9) },
      message: isErr
        ? `Firewall policy ${pol}: propagation incomplete (${props.propagationStatus})`
        : `Firewall policy ${pol}: committed to ${props.attachedFirewalls.length} firewall(s)`,
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
    properties: props,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 5e9) },
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
  const variant = rand(["bgp", "provision", "admin"] as const);

  if (variant === "bgp") {
    const props = {
      peeringType: rand(["AzurePrivatePeering", "MicrosoftPeering"]),
      peerAsn: rand([12076, 8075, 65000]),
      peeringState: isErr ? "Disabled" : rand(["Enabled", "Enabled", "Connecting"]),
      advertisedPrefixes: isErr ? 0 : randInt(1, 64),
      learnedRoutes: isErr ? 0 : randInt(4, 400),
      arpUnresolved: isErr ? randInt(1, 5) : 0,
    };
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e7, 6e8) },
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 12e9) },
      message: isErr
        ? `ExpressRoute ${circ}: provisioning failed (${props.lastError})`
        : `ExpressRoute ${circ}: ${props.serviceProvider} ${props.bandwidthInMbps}Mbps ${props.provisioningState}`,
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
    properties: props,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 5e9) },
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
  const variant = rand(["connection", "arp", "admin"] as const);
  const circuitId = armExpressRouteCircuit(subscription.id, resourceGroup, `erc-core-${randId(3)}`);

  if (variant === "connection") {
    const props = {
      expressRouteCircuitId: circuitId,
      connectionStatus: isErr ? "Disconnected" : rand(["Connected", "Connected", "Degraded"]),
      bitsInPerSecond: isErr ? 0 : randInt(10_000_000, 2_000_000_000),
      bitsOutPerSecond: isErr ? 0 : randInt(10_000_000, 2_000_000_000),
      adminState: isErr ? "Disabled" : "Enabled",
    };
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e7, 5e8) },
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
      properties: props,
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e6, 3e8) },
      message: isErr
        ? `ExpressRoute GW ${gw}: ARP resolution failed on ${props.failedPeer} path`
        : `ExpressRoute GW ${gw}: ARP OK primary=${props.onPremPrimaryRouterIp}`,
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
    properties: props,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 6e9) },
    message: isErr
      ? `ExpressRoute GW ${gw}: link configuration failed`
      : `ExpressRoute GW ${gw}: ${op} completed`,
  };
}
