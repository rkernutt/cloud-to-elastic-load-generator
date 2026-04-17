import {
  type EcsDocument,
  rand,
  randInt,
  randFloat,
  randId,
  randIp,
  azureCloud,
  makeAzureSetup,
  randCorrelationId,
} from "./helpers.js";

export function generateVirtualNetworkLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const vnet = `vnet-${randId(4).toLowerCase()}`;
  const correlationId = randCorrelationId();
  const callerIp = randIp();
  const resourceId = `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/virtualNetworks/${vnet}`;
  const style = rand([
    "SubnetWrite",
    "PeeringWrite",
    "RouteTableAssociation",
    "DdosNotification",
  ] as const);
  const failed = isErr || (style === "SubnetWrite" && Math.random() < 0.25);

  let category = "Administrative";
  let operationName = "Microsoft.Network/virtualNetworks/write";
  let resultType = failed ? "Failed" : "Succeeded";
  let level = failed ? "Error" : "Informational";
  const properties: Record<string, unknown> = {
    resourceId,
    statusCode: failed ? "Conflict" : "OK",
    statusMessage: failed
      ? "Another update is in progress for the referenced subnet."
      : "Request completed successfully",
  };
  let message = "";

  if (style === "SubnetWrite") {
    category = "Administrative";
    operationName = "Microsoft.Network/virtualNetworks/subnets/write";
    properties.subnetName = `snet-${rand(["app", "data", "edge"])}`;
    properties.addressPrefix = `10.${randInt(0, 200)}.${randInt(0, 255)}.0/24`;
    message = failed
      ? `Subnet write failed on ${vnet}/${properties.subnetName}: conflicting address space`
      : `Subnet ${properties.subnetName} updated on virtual network ${vnet}`;
  } else if (style === "PeeringWrite") {
    category = "Administrative";
    operationName = "Microsoft.Network/virtualNetworks/virtualNetworkPeerings/write";
    properties.peeringName = `peer-${randId(4).toLowerCase()}`;
    properties.remoteVirtualNetwork = `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/virtualNetworks/vnet-hub-${randId(3)}`;
    message = failed
      ? `VNet peering ${properties.peeringName} on ${vnet} failed: gateway transit mismatch`
      : `VNet peering ${properties.peeringName} established for ${vnet}`;
  } else if (style === "RouteTableAssociation") {
    category = "RouteService";
    operationName = "RouteTableSubnetAssociation";
    properties.routeTableId = `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/routeTables/rt-${randId(4)}`;
    properties.subnetName = `snet-${rand(["dmz", "private"])}`;
    message = `Route table associated to ${vnet}/${properties.subnetName}`;
  } else {
    category = "DdosProtectionNotification";
    operationName = "DdosAttackMitigationReport";
    resultType = failed ? "Failed" : "Succeeded";
    level = failed ? "Warning" : "Informational";
    properties.publicIpAddresses = [`pip-${randId(4)}.${region}.cloudapp.azure.com`];
    properties.packetsDropped = failed ? 0 : randInt(1_000_000, 900_000_000);
    properties.maxAttackBandwidthBps = randInt(1_000_000_000, 80_000_000_000);
    message = failed
      ? `DDoS telemetry unavailable for ${vnet} public endpoint`
      : `DDoS mitigation active for ${vnet}: dropped ${properties.packetsDropped} packets`;
  }

  return {
    "@timestamp": ts,
    cloud: azureCloud(region, subscription, "Microsoft.Network/virtualNetworks"),
    category,
    operationName,
    resultType,
    level,
    correlationId,
    callerIpAddress: callerIp,
    properties,
    azure: {
      virtual_network: {
        name: vnet,
        resource_group: resourceGroup,
        subnet: String(properties.subnetName ?? `snet-${rand(["app", "data", "edge"])}`),
        operation: style,
      },
    },
    event: { outcome: failed ? "failure" : "success", duration: randInt(1e8, 3e9) },
    message,
  };
}

export function generateLoadBalancerLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const lb = `lb-${randId(5).toLowerCase()}`;
  const correlationId = randCorrelationId();
  const callerIp = randIp();
  const resourceId = `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/loadBalancers/${lb}`;
  const style = rand([
    "LoadBalancerAlertEvent",
    "LoadBalancerProbeHealthStatus",
    "SnatPortUsage",
  ] as const);
  const failed = isErr || style === "LoadBalancerAlertEvent";

  let category: string = style;
  let operationName: string = style;
  let resultType = failed ? "Failed" : "Succeeded";
  let level = failed ? "Warning" : "Informational";
  const feIp = `${randInt(51, 52)}.${randInt(1, 254)}.${randInt(1, 254)}.${randInt(2, 250)}`;
  const properties: Record<string, unknown> = { resourceId, frontendIP: feIp };
  let message = "";

  if (style === "LoadBalancerAlertEvent") {
    operationName = "UnhealthyBackendPool";
    properties.eventName = "BackendHealthProbeFailure";
    properties.probePort = rand([80, 443, 8080, 8443]);
    properties.probeProtocol = rand(["Http", "Https", "Tcp"]);
    properties.backendIPAddress = `${randInt(10, 10)}.${randInt(1, 3)}.${randInt(0, 200)}.${randInt(2, 250)}`;
    properties.backendPort = properties.probePort;
    properties.failureReason = rand([
      "TCP connection timeout",
      "HTTP 502 Bad Gateway",
      "Reset from backend",
      "TLS handshake failure",
    ]);
    message = `Load balancer ${lb}: health probe failed for backend ${properties.backendIPAddress}:${properties.backendPort} (${properties.failureReason})`;
  } else if (style === "LoadBalancerProbeHealthStatus") {
    resultType = "Succeeded";
    level = "Informational";
    operationName = "ProbeHealthStatus";
    properties.backendPoolName = `pool-${rand(["web", "api", "grpc"])}`;
    properties.backendIPAddress = `${randInt(10, 10)}.${randInt(1, 3)}.${randInt(0, 200)}.${randInt(2, 250)}`;
    properties.healthState = failed ? "Unhealthy" : rand(["Healthy", "Healthy", "Unknown"]);
    properties.probeId = `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/loadBalancers/${lb}/probes/probe-${randId(3)}`;
    message = `Load balancer ${lb}: backend ${properties.backendIPAddress} state=${properties.healthState}`;
  } else {
    category = "LoadBalancerOperationEvent";
    operationName = "OutboundSnatConnection";
    resultType = "Succeeded";
    level = "Informational";
    properties.frontendIP = feIp;
    properties.backendIPAddress = `${randInt(10, 48)}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(2, 250)}`;
    properties.backendPort = randInt(1024, 65535);
    properties.allocatedSnatPorts = randInt(100, 1024);
    properties.usedSnatPorts = failed ? randInt(900, 1024) : randInt(10, 400);
    properties.snatPortExhaustion = failed && Number(properties.usedSnatPorts) > 950;
    message = failed
      ? `Load balancer ${lb}: SNAT port pressure frontend=${feIp} used=${properties.usedSnatPorts}/${properties.allocatedSnatPorts}`
      : `Load balancer ${lb}: outbound flow ${randIp()}:${randInt(40000, 60000)} → ${properties.backendIPAddress}:${properties.backendPort}`;
  }

  return {
    "@timestamp": ts,
    cloud: azureCloud(region, subscription, "Microsoft.Network/loadBalancers"),
    category,
    operationName,
    resultType,
    level,
    correlationId,
    callerIpAddress: callerIp,
    properties,
    azure: {
      load_balancer: {
        name: lb,
        resource_group: resourceGroup,
        sku: rand(["Standard", "Gateway"]),
        backend_health:
          style === "LoadBalancerProbeHealthStatus"
            ? String(properties.healthState)
            : failed
              ? "Unhealthy"
              : "Healthy",
        bytes_in: randInt(1_000_000, 500_000_000),
      },
    },
    event: { outcome: failed ? "failure" : "success", duration: randInt(1e7, 2e8) },
    message,
  };
}

export function generateApplicationGatewayLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const agw = `agw-${randId(4).toLowerCase()}`;
  const correlationId = randCorrelationId();
  const callerIp = randIp();
  const resourceId = `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/applicationGateways/${agw}`;
  const style = rand([
    "ApplicationGatewayAccess",
    "ApplicationGatewayPerformance",
    "ApplicationGatewayFirewall",
  ] as const);
  const status = isErr ? rand([502, 503, 504, 500]) : rand([200, 201, 204]);
  const failed = isErr;

  let category: string = style;
  let operationName = "ApplicationGatewayAccess";
  let resultType = failed ? "Failed" : "Succeeded";
  let level = failed ? "Error" : "Informational";
  const properties: Record<string, unknown> = {
    resourceId,
    instanceId: `appgw_${randId(8)}`,
    clientIP: callerIp,
    httpStatus: status,
  };
  let message = "";

  if (style === "ApplicationGatewayAccess") {
    operationName = "ApplicationGatewayAccess";
    properties.httpMethod = rand(["GET", "POST", "PUT", "DELETE"]);
    properties.requestUri = `https://${rand(["api", "www"])}.${rand(["contoso", "fabrikam"])}.com${rand(["/v1/orders", "/health", "/graphql"])}`;
    properties.listener = "listener-https-443";
    properties.ruleName = `rule-${randId(3)}`;
    properties.backendPoolName = `pool-${rand(["api", "web"])}`;
    properties.backendHostname = rand(["api.internal", "web.internal"]);
    properties.timeTaken = failed ? randFloat(2.5, 120) : randFloat(0.02, 1.8);
    properties.receivedBytes = randInt(200, 50_000);
    properties.sentBytes = failed ? randInt(100, 2000) : randInt(500, 2_000_000);
    properties.userAgent = rand(["Mozilla/5.0", "curl/8.4.0", "kube-probe/1.29"]);
    message = failed
      ? `Application Gateway ${agw}: ${properties.httpMethod} ${properties.requestUri} returned ${status} in ${Number(properties.timeTaken).toFixed(2)}s`
      : `Application Gateway ${agw}: ${properties.httpMethod} ${status} backend=${properties.backendHostname} latency=${Number(properties.timeTaken).toFixed(3)}s`;
  } else if (style === "ApplicationGatewayPerformance") {
    category = "ApplicationGatewayPerformance";
    operationName = "Throughput";
    resultType = "Succeeded";
    level = "Informational";
    properties.throughputBytesPerSec = randInt(50_000, 12_000_000);
    properties.failedRequests = randInt(0, failed ? 400 : 5);
    properties.avgLatencyMs = randInt(failed ? 800 : 8, failed ? 25_000 : 120);
    message = `Application Gateway ${agw}: throughput ${properties.throughputBytesPerSec} B/s p95 latency ${properties.avgLatencyMs}ms`;
  } else {
    category = "ApplicationGatewayFirewallLog";
    operationName = "MatchedRule";
    properties.ruleId = `920${randInt(100, 999)}`;
    properties.ruleGroup = "REQUEST-920-PROTOCOL-ENFORCEMENT";
    properties.action = failed ? "Blocked" : rand(["Detected", "Blocked"]);
    properties.message = failed
      ? "Inbound Anomaly Score Exceeded"
      : "SQL Injection Attack Detected via libinjection";
    properties.details = { match: "SELECT.*FROM", severity: failed ? "Critical" : "Warning" };
    resultType = failed ? "Failed" : "Succeeded";
    level = failed ? "Warning" : "Informational";
    message = failed
      ? `Application Gateway ${agw}: WAF blocked request rule=${properties.ruleId}`
      : `Application Gateway ${agw}: WAF ${properties.action} rule=${properties.ruleGroup}`;
  }

  return {
    "@timestamp": ts,
    cloud: azureCloud(region, subscription, "Microsoft.Network/applicationGateways"),
    category,
    operationName,
    resultType,
    level,
    correlationId,
    callerIpAddress: callerIp,
    properties,
    azure: {
      application_gateway: {
        name: agw,
        resource_group: resourceGroup,
        backend_host: String(properties.backendHostname ?? rand(["api.internal", "web.internal"])),
        http_status: status,
        latency_ms:
          style === "ApplicationGatewayAccess"
            ? Math.round(Number(properties.timeTaken) * 1000)
            : randInt(20, failed ? 30_000 : 400),
        rule: String(properties.ruleName ?? `rule-${randId(3)}`),
      },
    },
    event: { outcome: failed ? "failure" : "success", duration: randInt(5e6, 5e8) },
    message,
  };
}

export function generateAzureFirewallLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const fw = `afw-${randId(4).toLowerCase()}`;
  const correlationId = randCorrelationId();
  const callerIp = randIp();
  const resourceId = `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/azureFirewalls/${fw}`;
  const style = rand([
    "AzureFirewallApplicationRule",
    "AzureFirewallNetworkRule",
    "AzureFirewallDnsProxy",
    "AzureFirewallThreatIntel",
  ] as const);
  const deny = isErr || (style === "AzureFirewallApplicationRule" && Math.random() < 0.2);

  let category: string = style;
  let operationName: string = style;
  let resultType = deny ? "Denied" : "Allowed";
  let level = deny ? "Warning" : "Informational";
  const properties: Record<string, unknown> = {
    resourceId,
    firewallName: fw,
    RuleCollectionName: `RC-${rand(["App", "Net", "DNS"])}-${randId(3)}`,
    RuleCollectionType:
      style === "AzureFirewallApplicationRule"
        ? "ApplicationRule"
        : style === "AzureFirewallNetworkRule"
          ? "NetworkRule"
          : "NatRule",
    Action: deny ? "Deny" : "Allow",
  };
  let message = "";

  if (style === "AzureFirewallApplicationRule") {
    operationName = "AzureFirewallApplicationRule";
    properties.TargetUrl = deny
      ? rand(["malware.example", "tor-exit.bad", "cc.bad"])
      : rand(["login.microsoftonline.com", "packages.microsoft.com", "api.github.com"]);
    properties.Protocol = "Https";
    properties.SourceIp = callerIp;
    properties.DestinationPort = 443;
    properties.RuleName = deny ? "Block-HighRisk" : "Allow-Microsoft-Services";
    message = deny
      ? `AzureFirewall: DENY HTTPS to ${properties.TargetUrl} from ${properties.SourceIp} collection=${properties.RuleCollectionName}`
      : `AzureFirewall: ALLOW HTTPS ${properties.TargetUrl} from ${properties.SourceIp} rule=${properties.RuleName}`;
  } else if (style === "AzureFirewallNetworkRule") {
    operationName = "AzureFirewallNetworkRule";
    properties.Protocol = rand(["TCP", "UDP", "Any"]);
    properties.SourceIp = `${randInt(10, 10)}.${randInt(0, 5)}.${randInt(0, 255)}.${randInt(2, 250)}`;
    properties.DestinationIp = randIp();
    properties.DestinationPort = randInt(22, 65535);
    properties.RuleName = `Net-${randId(4)}`;
    properties.Action = deny ? "Deny" : "Allow";
    resultType = deny ? "Denied" : "Allowed";
    message = deny
      ? `AzureFirewall: DENY ${properties.Protocol} ${properties.SourceIp} → ${properties.DestinationIp}:${properties.DestinationPort}`
      : `AzureFirewall: ALLOW ${properties.Protocol} flow ${properties.SourceIp} → ${properties.DestinationIp}:${properties.DestinationPort}`;
  } else if (style === "AzureFirewallDnsProxy") {
    operationName = "AzureFirewallDnsProxy";
    category = "AzureFirewallDnsProxy";
    properties.QueryName = rand([
      "_ldap._tcp.contoso.com",
      "login.windows.net",
      "cdn.shop.example",
    ]);
    properties.QueryType = rand(["A", "AAAA", "CNAME"]);
    properties.DnsServerIp = rand(["168.63.129.16", "1.1.1.1", "8.8.8.8"]);
    properties.ResponseCode = deny ? "NXDOMAIN" : "NOERROR";
    properties.RequestTime = ts;
    resultType = deny ? "Failed" : "Succeeded";
    level = deny ? "Warning" : "Informational";
    message = deny
      ? `AzureFirewall DNS: ${properties.QueryName} (${properties.QueryType}) → ${properties.ResponseCode}`
      : `AzureFirewall DNS: resolved ${properties.QueryName} via ${properties.DnsServerIp}`;
  } else {
    operationName = "ThreatIntel";
    category = "AzureFirewallThreatIntel";
    properties.threatType = rand(["Cryptominer", "C2", "Phishing", "Botnet"]);
    properties.indicator = deny
      ? rand(["185.220.101.4", "evil.onion", "badpayload.example"])
      : rand(["tor-exit-list", "emerging-threats-ip"]);
    properties.action = deny ? "Alert" : "Allow";
    properties.priority = randInt(100, 5000);
    resultType = "Succeeded";
    level = deny ? "Error" : "Warning";
    message = deny
      ? `AzureFirewall ThreatIntel: match ${properties.threatType} indicator=${properties.indicator} action=${properties.action}`
      : `AzureFirewall ThreatIntel: informational hit ${properties.threatType}`;
  }

  return {
    "@timestamp": ts,
    cloud: azureCloud(region, subscription, "Microsoft.Network/azureFirewalls"),
    category,
    operationName,
    resultType,
    level,
    correlationId,
    callerIpAddress: callerIp,
    properties,
    azure: {
      firewall: {
        name: fw,
        resource_group: resourceGroup,
        source_ip: String((properties as { SourceIp?: string }).SourceIp ?? callerIp),
        dest_ip: String((properties as { DestinationIp?: string }).DestinationIp ?? randIp()),
        dest_port: Number(
          (properties as { DestinationPort?: number }).DestinationPort ?? randInt(80, 443)
        ),
        action: String(properties.Action ?? (deny ? "Deny" : "Allow")),
        rule_collection: String(properties.RuleCollectionName),
      },
    },
    event: { outcome: deny ? "failure" : "success", duration: randInt(1e6, 8e7) },
    message,
  };
}
