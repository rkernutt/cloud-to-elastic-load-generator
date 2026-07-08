import {
  type EcsDocument,
  rand,
  randInt,
  randFloat,
  randId,
  randIp,
  randPublicIp,
  azureCloud,
  makeAzureSetup,
  randUUID,
  USER_AGENTS,
  randAzureOnMicrosoftEmail,
  azureDiagnosticTime,
  azureLogEvent,
} from "./helpers.js";

const MISC_EXTENDED_ERR_CODES = [
  "FrontDoorNotFound",
  "CdnProfileQuotaExceeded",
  "MapsAccountKeyExpired",
  "ChaosTargetNotFound",
  "AuthorizationFailed",
  "QuotaExceeded",
  "InternalServerError",
  "ResourceNotFound",
] as const;

type MiscExtendedErr = {
  code: (typeof MISC_EXTENDED_ERR_CODES)[number];
  message: string;
  type: "azure";
};

function miscExtendedErrFields(
  isErr: boolean,
  message: string,
  scope: "data" | "adminOrProvision"
): { error?: MiscExtendedErr; statusMessage?: { error: MiscExtendedErr } } {
  if (!isErr) return {};
  const error: MiscExtendedErr = {
    code: rand([...MISC_EXTENDED_ERR_CODES]),
    message,
    type: "azure",
  };
  return scope === "adminOrProvision" ? { error, statusMessage: { error } } : { error };
}

function armCdnProfile(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Cdn/profiles/${name}`;
}

function armAfdEndpoint(sub: string, rg: string, profile: string, ep: string): string {
  return `${armCdnProfile(sub, rg, profile)}/afdEndpoints/${ep}`;
}

function armClassicEndpoint(sub: string, rg: string, profile: string, ep: string): string {
  return `${armCdnProfile(sub, rg, profile)}/endpoints/${ep}`;
}

function armVpnGateway(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Network/virtualNetworkGateways/${name}`;
}

function armArcMachine(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.HybridCompute/machines/${name}`;
}

function armStackReg(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.AzureStack/registrations/${name}`;
}

function armApiCenter(sub: string, rg: string, name: string): string {
  return `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.ApiCenter/services/${name}`;
}

/** Azure Front Door — edge access, WAF, routing, and control plane. */
export function generateFrontDoorLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const profile = `afd-${rand(["prod", "global", "pci"])}-${randId(5).toLowerCase()}`;
  const ep = `ep-${rand(["api", "web", "static"])}-${randId(4).toLowerCase()}`;
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["access", "waf", "route", "purge", "tls", "admin"] as const);

  if (variant === "access") {
    const resourceId = armAfdEndpoint(subscription.id, resourceGroup, profile, ep);
    const sc = isErr ? rand([502, 503, 504]) : rand([200, 200, 204, 301, 302, 404]);
    const props = {
      clientReference: randUUID(),
      clientIp: callerIp,
      requestUri: rand(["/api/v2/catalog", "/en-us/products", "/_health", "/oauth/token"]),
      httpMethod: rand(["GET", "POST", "HEAD"]),
      httpStatusCode: sc,
      bytesSent: isErr ? randInt(120, 900) : randInt(2_000, 4_000_000),
      edgePop: rand(["SEA", "LAX", "AMS", "FRA", "DXB"]),
      timeTakenMs: randFloat(isErr ? 800 : 12, isErr ? 12_000 : 420),
      ...miscExtendedErrFields(
        isErr,
        "Front Door edge POP returned gateway error retrieving origin response",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "AzureFrontDoorAccessLog",
      category: "FrontDoorAccessLog",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(sc),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Cdn/profiles"),
      azure: {
        front_door: {
          profile_name: profile,
          endpoint: ep,
          resource_group: resourceGroup,
          category: "FrontDoorAccessLog",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: azureLogEvent(
        isErr,
        randInt(1e6, 8e8),
        String("AzureFrontDoorAccessLog"),
        ["configuration"],
        isErr ? ["change"] : ["info"]
      ),
      message: isErr
        ? `Front Door ${profile}/${ep}: ${props.httpMethod} ${props.requestUri} ${sc}`
        : `Front Door ${profile}: edge ${props.edgePop} served ${props.requestUri} (${sc})`,
    };
  }

  if (variant === "waf") {
    const resourceId = armCdnProfile(subscription.id, resourceGroup, profile);
    const props = {
      ruleName: rand(["DefaultRuleSet-2.1", "BotManagerRuleSet", "Custom-BlockGeo"]),
      action: isErr ? "Log" : rand(["Block", "Allow", "Log"]),
      matchVariable: rand(["RemoteAddr", "RequestUri", "SocketAddr"]),
      matchValue: callerIp,
      policyId: randUUID(),
      requestId: randUUID(),
      ...miscExtendedErrFields(
        isErr,
        "WAF engine failed evaluating managed ruleset telemetry stream",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "AzureFrontDoorWebApplicationFirewallLog",
      category: "FrontDoorWebApplicationFirewallLog",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "Matched" : "ScanComplete",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Cdn/profiles"),
      azure: {
        front_door: {
          profile_name: profile,
          resource_group: resourceGroup,
          category: "FrontDoorWebApplicationFirewallLog",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: azureLogEvent(
        isErr,
        randInt(5e5, 2e8),
        String("AzureFrontDoorWebApplicationFirewallLog"),
        ["configuration"],
        isErr ? ["change"] : ["info"]
      ),
      message: isErr
        ? `Front Door WAF ${profile}: evaluation error on ${props.ruleName}`
        : `Front Door WAF ${profile}: ${props.action} ${props.ruleName}`,
    };
  }

  if (variant === "route") {
    const resourceId = armAfdEndpoint(subscription.id, resourceGroup, profile, ep);
    const props = {
      routeName: `route-${randId(4).toLowerCase()}`,
      originGroup: `og-${rand(["primary", "failover"])}`,
      patterns: rand([["/api/*"], ["/*"], ["/static/*", "/assets/*"]]),
      changeType: isErr ? "Rollback" : rand(["Create", "Update"]),
      validationErrors: isErr ? ["OverlappingPathPattern"] : [],
      ...miscExtendedErrFields(
        isErr,
        "Route configuration overlap blocked deployment of Front Door path rules",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "FrontDoorRouteConfigurationChanged",
      category: "FrontDoorOperational",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "400" : "200",
      callerIpAddress: "169.254.169.254",
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Cdn/profiles"),
      azure: {
        front_door: {
          profile_name: profile,
          endpoint: ep,
          resource_group: resourceGroup,
          category: "FrontDoorOperational",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: azureLogEvent(
        isErr,
        randInt(1e7, 4e8),
        String("FrontDoorRouteConfigurationChanged"),
        ["configuration"],
        isErr ? ["change"] : ["info"]
      ),
      message: isErr
        ? `Front Door ${profile}: route ${props.routeName} config rejected`
        : `Front Door ${profile}: applied ${props.changeType} on ${props.routeName}`,
    };
  }

  if (variant === "purge") {
    const resourceId = armCdnProfile(subscription.id, resourceGroup, profile);
    const props = {
      urlsPurged: isErr ? randInt(0, 8) : randInt(40, 800),
      purgeOperationId: randUUID(),
      propagationComplete: !isErr,
      ...miscExtendedErrFields(
        isErr,
        "CDN purge API failed flushing paths still referenced active connections",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Cdn/profiles/endpoints/purge",
      category: "FrontDoorOperational",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.propagationComplete ? "flush_ok" : "partial",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Cdn/profiles"),
      azure: {
        front_door: {
          profile_name: profile,
          resource_group: resourceGroup,
          category: "FrontDoorOperational",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: azureLogEvent(
        isErr,
        randInt(2e9, 4e11),
        String("Microsoft.Cdn/profiles/endpoints/purge"),
        ["configuration"],
        isErr ? ["change"] : ["info"]
      ),
      message: isErr
        ? `Front Door ${profile}: purge stalled op=${props.purgeOperationId}`
        : `Front Door ${profile}: purge ${props.urlsPurged} paths`,
    };
  }

  if (variant === "tls") {
    const resourceId = armAfdEndpoint(subscription.id, resourceGroup, profile, ep);
    const props = {
      sniHostname: rand(["www.meridiantech.io", "api.meridiantech.io"]),
      certVersion: rand(["2026-03", "2025-12"]),
      handshakeOk: !isErr,
      ...miscExtendedErrFields(
        isErr,
        "Custom domain TLS handshake failed revoked certificate or mismatched SAN",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "FrontDoorTlsHandshakeDiagnostic",
      category: "FrontDoorOperational",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.handshakeOk ? "success" : "failed",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Cdn/profiles"),
      azure: {
        front_door: {
          profile_name: profile,
          endpoint: ep,
          resource_group: resourceGroup,
          category: "FrontDoorOperational",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: azureLogEvent(
        isErr,
        randInt(2e7, 5e8),
        String("FrontDoorTlsHandshakeDiagnostic"),
        ["configuration"],
        isErr ? ["change"] : ["info"]
      ),
      message: isErr
        ? `Front Door ${profile}: TLS ${props.sniHostname} failed`
        : `Front Door ${profile}: cert ${props.certVersion} OK`,
    };
  }

  const resourceId = armCdnProfile(subscription.id, resourceGroup, profile);
  const op = isErr
    ? "Microsoft.Cdn/profiles/write"
    : rand([
        "Microsoft.Cdn/profiles/write",
        "Microsoft.Cdn/profiles/delete",
        "Microsoft.Cdn/profiles/afdEndpoints/write",
      ]);
  const props = {
    entity: resourceId,
    eventCategory: "Administrative",
    status: isErr ? "Failed" : "Succeeded",
    errorCode: isErr ? rand(["FrontDoorProfileInUse", "SkuNotSupportedInRegion"]) : "",
    httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
    ...miscExtendedErrFields(
      isErr,
      "Front Door profile ARM change blocked due to active routes or SKU limits",
      "adminOrProvision"
    ),
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
    cloud: azureCloud(region, subscription, "Microsoft.Cdn/profiles"),
    azure: {
      front_door: {
        profile_name: profile,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: azureLogEvent(
      isErr,
      randInt(1e8, 6e9),
      String(op),
      ["configuration"],
      isErr ? ["change"] : ["info"]
    ),
    message: isErr
      ? `Front Door profile ${profile}: ARM ${op} failed`
      : `Front Door profile ${profile}: ${op} ok`,
  };
}

/** Classic / standard CDN profiles — edge access, origin health, ARM. */
export function generateCdnLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const profile = `cdn-${randId(5).toLowerCase()}`;
  const ep = `cdnep-${rand(["static", "media", "app"])}-${randId(3).toLowerCase()}`;
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["access", "origin", "admin", "purge", "qos", "rules"] as const);

  if (variant === "access") {
    const resourceId = armClassicEndpoint(subscription.id, resourceGroup, profile, ep);
    const sc = isErr ? rand([502, 504]) : rand([200, 206, 304, 404]);
    const props = {
      Endpoint: `${ep}.azureedge.net`,
      HttpStatusCode: sc,
      RequestBytes: randInt(200, 9_000),
      ResponseBytes: isErr ? randInt(100, 600) : randInt(2_000, 25_000_000),
      ClientIp: callerIp,
      UserAgent: rand(USER_AGENTS),
      HitCount: isErr ? 0 : randInt(1, 120),
      ...miscExtendedErrFields(
        isErr,
        "Classic CDN edge returned error contacting customer origin or storage static site",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Cdn/profiles/endpoints/GetEndpointLogs",
      category: "AzureCdnAccessLog",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: String(sc),
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Cdn/profiles"),
      azure: {
        cdn: {
          profile_name: profile,
          endpoint: ep,
          resource_group: resourceGroup,
          category: "AzureCdnAccessLog",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: azureLogEvent(
        isErr,
        randInt(8e5, 5e8),
        String("Microsoft.Cdn/profiles/endpoints/GetEndpointLogs"),
        ["configuration"],
        isErr ? ["change"] : ["info"]
      ),
      message: isErr
        ? `CDN ${profile}/${ep}: origin error (${sc})`
        : `CDN ${profile}: edge cache hit ratio event for ${props.Endpoint}`,
    };
  }

  if (variant === "origin") {
    const resourceId = armClassicEndpoint(subscription.id, resourceGroup, profile, ep);
    const props = {
      OriginHost: rand(["origin.meridiantech.io", "storagexxx.blob.core.windows.net"]),
      HealthProbeStatus: isErr ? "Unhealthy" : "Healthy",
      HttpLatencyMs: isErr ? randInt(8000, 30000) : randInt(8, 220),
      FailoverTriggered: isErr,
      LastError: isErr ? rand(["ConnectionTimeout", "TLSHandshakeFailed"]) : "",
      ...miscExtendedErrFields(
        isErr,
        "CDN origin health probe failed TLS or TCP connect to storage account host",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Cdn/profiles/endpoints/health",
      category: "AzureCdnOriginHealth",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "503" : "200",
      callerIpAddress: "127.0.0.1",
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Cdn/profiles"),
      azure: {
        cdn: {
          profile_name: profile,
          endpoint: ep,
          resource_group: resourceGroup,
          category: "AzureCdnOriginHealth",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: azureLogEvent(
        isErr,
        randInt(1e6, 3e8),
        String("Microsoft.Cdn/profiles/endpoints/health"),
        ["configuration"],
        isErr ? ["change"] : ["info"]
      ),
      message: isErr
        ? `CDN ${profile}/${ep}: origin ${props.OriginHost} ${props.HealthProbeStatus}`
        : `CDN ${profile}: origin probe OK (${props.HttpLatencyMs}ms)`,
    };
  }

  if (variant === "purge") {
    const resourceId = armClassicEndpoint(subscription.id, resourceGroup, profile, ep);
    const props = {
      pathsRequested: randInt(1, 900),
      completed: !isErr,
      ...miscExtendedErrFields(
        isErr,
        "CDN purge request failed CDN profile quota exceeded for concurrent operations",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Cdn/profiles/endpoints/PurgeContent",
      category: "AzureCdnOperational",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.completed ? "purge_ok" : "throttled",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Cdn/profiles"),
      azure: {
        cdn: {
          profile_name: profile,
          endpoint: ep,
          resource_group: resourceGroup,
          category: "AzureCdnOperational",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: azureLogEvent(
        isErr,
        randInt(4e8, 2e10),
        String("Microsoft.Cdn/profiles/endpoints/PurgeContent"),
        ["configuration"],
        isErr ? ["change"] : ["info"]
      ),
      message: isErr
        ? `CDN ${profile}: purge bottleneck paths=${props.pathsRequested}`
        : `CDN ${profile}: purge propagated`,
    };
  }

  if (variant === "qos") {
    const resourceId = armClassicEndpoint(subscription.id, resourceGroup, profile, ep);
    const props = {
      bandwidthMbps: isErr ? randFloat(0.2, 4) : randFloat(600, 12_000),
      throttleReason: isErr ? "origin_rate_limit" : "",
      ...miscExtendedErrFields(
        isErr,
        "CDN edge QoS throttled egress because origin returned 429 upstream",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Cdn/profiles/endpoints/metricsBandwidth",
      category: "AzureCdnMetrics",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "capped" : "open",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Cdn/profiles"),
      azure: {
        cdn: {
          profile_name: profile,
          endpoint: ep,
          resource_group: resourceGroup,
          category: "AzureCdnMetrics",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: azureLogEvent(
        isErr,
        randInt(9e11, 2e11),
        String("Microsoft.Cdn/profiles/endpoints/metricsBandwidth"),
        ["configuration"],
        isErr ? ["change"] : ["info"]
      ),
      message: isErr
        ? `CDN ${profile}: qos ${props.throttleReason}`
        : `CDN ${profile}: qos healthy`,
    };
  }

  if (variant === "rules") {
    const resourceId = armClassicEndpoint(subscription.id, resourceGroup, profile, ep);
    const props = {
      ruleEngine: rand(["rulesengine-v2", "standard-rules"]),
      rulesEvaluated: randInt(3, 24),
      lastMatchConflict: isErr,
      ...miscExtendedErrFields(
        isErr,
        "CDN rules engine halted due conflicting match conditions ordering error",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.Cdn/profiles/endpoints/rules/diagnostic",
      category: "AzureCdnOperational",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.lastMatchConflict ? "conflict" : "ok",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Cdn/profiles"),
      azure: {
        cdn: {
          profile_name: profile,
          endpoint: ep,
          resource_group: resourceGroup,
          category: "AzureCdnOperational",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: azureLogEvent(
        isErr,
        randInt(2e9, 2e10),
        String("Microsoft.Cdn/profiles/endpoints/rules/diagnostic"),
        ["configuration"],
        isErr ? ["change"] : ["info"]
      ),
      message: isErr ? `CDN ${profile}: rule conflict` : `CDN ${profile}: rules ok`,
    };
  }

  const resourceId = armCdnProfile(subscription.id, resourceGroup, profile);
  const op = isErr
    ? "Microsoft.Cdn/profiles/endpoints/write"
    : rand([
        "Microsoft.Cdn/profiles/write",
        "Microsoft.Cdn/profiles/delete",
        "Microsoft.Cdn/profiles/endpoints/write",
      ]);
  const props = {
    entity: resourceId,
    eventCategory: "Administrative",
    status: isErr ? "Failed" : "Succeeded",
    errorCode: isErr ? rand(["EndpointNameUnavailable", "InvalidOrigin"]) : "",
    httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
    ...miscExtendedErrFields(
      isErr,
      "CDN ARM operation failed SKU limits or provisioning lock on endpoint",
      "adminOrProvision"
    ),
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
    cloud: azureCloud(region, subscription, "Microsoft.Cdn/profiles"),
    azure: {
      cdn: {
        profile_name: profile,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: azureLogEvent(
      isErr,
      randInt(1e8, 5e9),
      String(op),
      ["configuration"],
      isErr ? ["change"] : ["info"]
    ),
    message: isErr
      ? `CDN profile ${profile}: ${op} failed`
      : `CDN profile ${profile}: ${op} succeeded`,
  };
}

/** Site-to-site VPN Gateway — tunnel, IKE, and control plane (distinct from P2S vpn-client). */
export function generateVpnGatewayLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const gw = `vgw-s2s-${randId(5).toLowerCase()}`;
  const resourceId = armVpnGateway(subscription.id, resourceGroup, gw);
  const callerIp = randIp();
  const peerIp = `${randInt(203, 203)}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(2, 250)}`;
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand(["tunnel", "ike", "bgp", "admin", "packetDiag", "nat"] as const);
  const conn = `conn-${rand(["hq", "branch", "partner"])}-${randId(3).toLowerCase()}`;

  if (variant === "tunnel") {
    const props = {
      connectionName: conn,
      tunnelType: "IPsec",
      connectionStatus: isErr ? "Disconnected" : rand(["Connected", "Connected", "Degraded"]),
      ingressBytes: isErr ? 0 : randInt(10_000, 9_000_000_000),
      egressBytes: isErr ? 0 : randInt(10_000, 8_000_000_000),
      remoteVpnSite: peerIp,
      natTraversal: "UDP-4500",
      ...miscExtendedErrFields(
        isErr,
        "IPsec tunnel teardown detected keepalive miss or PMTU black hole",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "TunnelDiagnosticLog",
      category: "TunnelDiagnosticLog",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "500" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Network/virtualNetworkGateways"),
      azure: {
        vpn_gateway: {
          gateway_name: gw,
          resource_group: resourceGroup,
          category: "TunnelDiagnosticLog",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: azureLogEvent(
        isErr,
        randInt(1e7, 6e8),
        String("TunnelDiagnosticLog"),
        ["configuration"],
        isErr ? ["change"] : ["info"]
      ),
      message: isErr
        ? `VPN GW ${gw}: S2S tunnel ${conn} down (peer ${peerIp})`
        : `VPN GW ${gw}: ${conn} ${props.connectionStatus} (${props.ingressBytes}B in)`,
    };
  }

  if (variant === "ike") {
    const props = {
      connectionName: conn,
      ikeVersion: "IKEv2",
      saStatus: isErr ? "NegotiationFailed" : "Established",
      cipherSuite: rand(["AES256-GCM", "GCMAES256"]),
      remoteIp: peerIp,
      failureDetail: isErr ? rand(["AUTHENTICATION_FAILED", "PEER_NOT_RESPONDING"]) : "",
      ...miscExtendedErrFields(
        isErr,
        "IKE SA negotiation failed mismatched transform or shared secret rotation",
        "data"
      ),
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
      level: isErr ? "Warning" : "Informational",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Network/virtualNetworkGateways"),
      azure: {
        vpn_gateway: {
          gateway_name: gw,
          resource_group: resourceGroup,
          category: "IKEDiagnosticLog",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: azureLogEvent(
        isErr,
        randInt(1e6, 4e8),
        String("IKEDiagnosticLog"),
        ["configuration"],
        isErr ? ["change"] : ["info"]
      ),
      message: isErr
        ? `VPN GW ${gw}: IKE ${props.saStatus} for ${conn}`
        : `VPN GW ${gw}: IKE ${props.cipherSuite} ${props.saStatus}`,
    };
  }

  if (variant === "bgp") {
    const props = {
      connectionName: conn,
      peerAsn: rand([65001, 65010, 4200000000]),
      routesAdvertised: isErr ? 0 : randInt(2, 128),
      routesLearned: isErr ? 0 : randInt(2, 256),
      peeringState: isErr ? "Stopped" : "Established",
      ...miscExtendedErrFields(
        isErr,
        "BGP peering reset hold timer expired on VPN gateway",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "RouteDiagnosticLog",
      category: "RouteDiagnosticLog",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "503" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Network/virtualNetworkGateways"),
      azure: {
        vpn_gateway: {
          gateway_name: gw,
          resource_group: resourceGroup,
          category: "RouteDiagnosticLog",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: azureLogEvent(
        isErr,
        randInt(5e6, 3e8),
        String("RouteDiagnosticLog"),
        ["configuration"],
        isErr ? ["change"] : ["info"]
      ),
      message: isErr
        ? `VPN GW ${gw}: BGP peer ASN ${props.peerAsn} unhealthy`
        : `VPN GW ${gw}: BGP learned ${props.routesLearned} routes for ${conn}`,
    };
  }

  if (variant === "packetDiag") {
    const props = {
      filtersApplied: randInt(1, 5),
      captureDroppedFrames: isErr ? randInt(50, 400) : randInt(0, 12),
      ...miscExtendedErrFields(
        isErr,
        "Gateway packet capture saturated buffer NIC dropped mirrored frames diagnostic",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "VpnGatewayPacketCapture",
      category: "PacketCapture",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: `${props.captureDroppedFrames}`,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Network/virtualNetworkGateways"),
      azure: {
        vpn_gateway: {
          gateway_name: gw,
          resource_group: resourceGroup,
          category: "PacketCapture",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: azureLogEvent(
        isErr,
        randInt(3e11, 4e11),
        String("VpnGatewayPacketCapture"),
        ["configuration"],
        isErr ? ["change"] : ["info"]
      ),
      message: isErr ? `VPN GW ${gw}: packet capture loss` : `VPN GW ${gw}: capture balanced`,
    };
  }

  if (variant === "nat") {
    const props = {
      snatPortExhaustion: isErr,
      sessionsActive: isErr ? randInt(48_000, 65_000) : randInt(2_000, 44_000),
      ...miscExtendedErrFields(
        isErr,
        "Outbound SNAT ports exhausted on VPN Gateway public IP prefixes",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "OutboundNatDiagnosticLog",
      category: "NatDiagnostics",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.snatPortExhaustion ? "starved" : "available",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.Network/virtualNetworkGateways"),
      azure: {
        vpn_gateway: {
          gateway_name: gw,
          resource_group: resourceGroup,
          category: "NatDiagnostics",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: azureLogEvent(
        isErr,
        randInt(2e9, 2e10),
        String("OutboundNatDiagnosticLog"),
        ["configuration"],
        isErr ? ["change"] : ["info"]
      ),
      message: isErr
        ? `VPN GW ${gw}: NAT sessions=${props.sessionsActive}`
        : `VPN GW ${gw}: SNAT OK`,
    };
  }

  const op = isErr
    ? "Microsoft.Network/virtualNetworkGateways/write"
    : rand([
        "Microsoft.Network/virtualNetworkGateways/write",
        "Microsoft.Network/virtualNetworkGateways/delete",
        "Microsoft.Network/virtualNetworkGateways/reset/action",
      ]);
  const props = {
    entity: resourceId,
    eventCategory: "Administrative",
    status: isErr ? "Failed" : "Succeeded",
    errorCode: isErr ? rand(["GatewaySubnetRequired", "VpnGatewaySkuMismatch"]) : "",
    httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
    ...miscExtendedErrFields(
      isErr,
      "VPN Gateway ARM provisioning failed SKU resize or BGP settings conflict",
      "adminOrProvision"
    ),
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
      vpn_gateway: {
        gateway_name: gw,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: azureLogEvent(
      isErr,
      randInt(1e8, 6e9),
      String(op),
      ["configuration"],
      isErr ? ["change"] : ["info"]
    ),
    message: isErr ? `VPN gateway ${gw}: ${op} failed` : `VPN gateway ${gw}: ${op} succeeded`,
  };
}

/** Microsoft 365 active users (Graph-style usage report row). */
export function generateActiveUsersServicesLog(ts: string, er: number): EcsDocument {
  const { region, subscription, isErr } = makeAzureSetup(er);
  const orgId = randId(8).toUpperCase();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const resourceId = `/organization/${orgId}/reports/GetOffice365ActiveUserDetail`;
  const product = rand(["Exchange", "Microsoft 365", "OneDrive", "SharePoint", "Teams", "Yammer"]);
  const variant = rand([
    "rollup",
    "department",
    "anomaly",
    "tenantAddOn",
    "federation",
    "refresh",
  ] as const);

  let sliceNote = "";
  if (variant === "department") {
    sliceNote = "engineering-slice";
  } else if (variant === "anomaly") {
    sliceNote = "spike-watch";
  } else if (variant === "tenantAddOn") {
    sliceNote = "addon-skus";
  } else if (variant === "federation") {
    sliceNote = "b2b-guest";
  } else if (variant === "refresh") {
    sliceNote = "async-refresh-job";
  } else {
    sliceNote = "org-wide";
  }

  const props = {
    ReportPeriod: rand(["7", "30", "90"]),
    ReportRefreshDate: ts.slice(0, 10),
    Product: product,
    ActiveUserCount: isErr ? 0 : randInt(12, 85_000),
    EnabledUserCount: isErr ? 0 : randInt(50, 120_000),
    Department: rand(["Engineering", "Sales", "Operations", ""]),
    Slice: sliceNote,
    ...miscExtendedErrFields(
      isErr,
      variant === "refresh"
        ? "Graph reporting export refresh job stalled internal data pipeline timeout"
        : "Office 365 usage report rollup failed entitlement or delegated scope missing",
      "data"
    ),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.Graph/reports/getOffice365ActiveUserDetail",
    category: "Audit.General",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "Failed" : "Succeeded",
    callerIpAddress: randPublicIp(),
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.Office365"),
    azure: {
      o365_active_users: {
        organization_id: orgId,
        product,
        report_period: props.ReportPeriod,
        category: "Audit.General",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: azureLogEvent(
      isErr,
      randInt(5e5, 2e8),
      String("Microsoft.Graph/reports/getOffice365ActiveUserDetail"),
      ["configuration"],
      isErr ? ["change"] : ["info"]
    ),
    message: isErr
      ? `O365 active users report failed for ${product} (org ${orgId})`
      : `O365 active users: ${props.ActiveUserCount} active on ${product}`,
  };
}

/** Microsoft 365 Teams user activity report. */
export function generateTeamsUserActivityLog(ts: string, er: number): EcsDocument {
  const { region, subscription, isErr } = makeAzureSetup(er);
  const orgId = randId(8).toUpperCase();
  const user = randAzureOnMicrosoftEmail();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const resourceId = `/organization/${orgId}/reports/GetMicrosoftTeamsUserActivityUserDetail`;
  const variant = rand([
    "chatHeavy",
    "meetingHeavy",
    "hybridPresence",
    "devicePolicy",
    "copilotSignals",
    "exportJob",
  ] as const);
  const props = {
    ReportPeriod: rand(["7", "30"]),
    ReportRefreshDate: ts.slice(0, 10),
    UserPrincipalName: user,
    TeamChatMessageCount: isErr ? 0 : randInt(0, 4000),
    PrivateChatMessageCount: isErr ? 0 : randInt(0, 2000),
    MeetingsAttendedCount: isErr ? 0 : randInt(0, 120),
    LastActivityDate: isErr ? "" : ts.slice(0, 10),
    Deleted: isErr,
    ReportSlice: variant,
    ...miscExtendedErrFields(
      isErr,
      variant === "exportJob"
        ? "Teams activity Graph export aborted async job concurrency limit exceeded"
        : "Teams telemetry row rejected license or privacy masking rule evaluation",
      "data"
    ),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.Graph/reports/getTeamsUserActivityUserDetail",
    category: "Audit.General",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "0" : "1",
    callerIpAddress: randPublicIp(),
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.Office365"),
    azure: {
      o365_teams_activity: {
        organization_id: orgId,
        user_principal_name: user,
        category: "Audit.General",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: azureLogEvent(
      isErr,
      randInt(5e5, 2e8),
      String("Microsoft.Graph/reports/getTeamsUserActivityUserDetail"),
      ["configuration"],
      isErr ? ["change"] : ["info"]
    ),
    message: isErr
      ? `Teams activity report row failed for ${user}`
      : `Teams activity: ${user} chat=${props.TeamChatMessageCount} meetings=${props.MeetingsAttendedCount}`,
  };
}

/** Microsoft 365 Outlook activity report. */
export function generateOutlookActivityLog(ts: string, er: number): EcsDocument {
  const { region, subscription, isErr } = makeAzureSetup(er);
  const orgId = randId(8).toUpperCase();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const resourceId = `/organization/${orgId}/reports/GetEmailActivityUserDetail`;
  const user = randAzureOnMicrosoftEmail();
  const variant = rand([
    "mailbox",
    "sharedMailbox",
    "archiving",
    "dlpLatency",
    "connectors",
    "mobileSync",
  ] as const);
  const props = {
    ReportPeriod: "7",
    ReportRefreshDate: ts.slice(0, 10),
    UserPrincipalName: user,
    SendCount: isErr ? 0 : randInt(0, 800),
    ReceiveCount: isErr ? 0 : randInt(0, 5000),
    ReadCount: isErr ? 0 : randInt(0, 9000),
    LastActivityDate: isErr ? "" : ts.slice(0, 10),
    MailboxSlice: variant,
    ...miscExtendedErrFields(
      isErr,
      "Outlook email activity ingestion failed journaling connector or impersonation ACL",
      "data"
    ),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.Graph/reports/getEmailActivityUserDetail",
    category: "Audit.General",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "0" : "1",
    callerIpAddress: randPublicIp(),
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.Office365"),
    azure: {
      o365_outlook_activity: {
        organization_id: orgId,
        user_principal_name: user,
        category: "Audit.General",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: azureLogEvent(
      isErr,
      randInt(5e5, 2e8),
      String("Microsoft.Graph/reports/getEmailActivityUserDetail"),
      ["configuration"],
      isErr ? ["change"] : ["info"]
    ),
    message: isErr
      ? `Outlook activity report failed for ${user}`
      : `Outlook activity: ${user} send=${props.SendCount} read=${props.ReadCount}`,
  };
}

/** Microsoft 365 OneDrive usage and storage report. */
export function generateOnedriveUsageStorageLog(ts: string, er: number): EcsDocument {
  const { region, subscription, isErr } = makeAzureSetup(er);
  const orgId = randId(8).toUpperCase();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const resourceId = `/organization/${orgId}/reports/GetOneDriveUsageStorage`;
  const user = randAzureOnMicrosoftEmail();
  const variant = rand([
    "personalSites",
    "knownFolders",
    "sensitivityLabels",
    "retentionHold",
    "deltaSync",
    "malwareScan",
  ] as const);
  const props = {
    ReportPeriod: rand(["7", "30"]),
    ReportRefreshDate: ts.slice(0, 10),
    OwnerPrincipalName: user,
    SiteUrl: isErr
      ? ""
      : `https://${rand(["meridiantech", "cascadeops"])}.sharepoint.com/personal/${user.split("@")[0]}`,
    StorageAllocatedInMB: isErr ? 0 : randInt(1024, 5_242_880),
    StorageUsedInMB: isErr ? 0 : randInt(100, 2_000_000),
    FileCount: isErr ? 0 : randInt(0, 800_000),
    DataSlice: variant,
    ...miscExtendedErrFields(
      isErr,
      "OneDrive storage telemetry export missing site mapping or encrypted library state",
      "data"
    ),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.Graph/reports/getOneDriveUsageStorage",
    category: "Audit.General",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "0" : "1",
    callerIpAddress: randPublicIp(),
    correlationId,
    level: isErr ? "Warning" : "Information",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.Office365"),
    azure: {
      o365_onedrive_storage: {
        organization_id: orgId,
        owner_principal_name: user,
        category: "Audit.General",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: azureLogEvent(
      isErr,
      randInt(5e5, 2e8),
      String("Microsoft.Graph/reports/getOneDriveUsageStorage"),
      ["configuration"],
      isErr ? ["change"] : ["info"]
    ),
    message: isErr
      ? `OneDrive storage report failed for ${user}`
      : `OneDrive storage: ${user} used ${props.StorageUsedInMB}MB of ${props.StorageAllocatedInMB}MB`,
  };
}

/** Azure Arc-enabled servers — extension, guest configuration, ARM. */
export function generateArcLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const machine = `arc-${rand(["sql", "web", "k8s"])}-${randId(5).toLowerCase()}`;
  const resourceId = armArcMachine(subscription.id, resourceGroup, machine);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "heartbeat",
    "extension",
    "guestcfg",
    "admin",
    "patch",
    "identity",
  ] as const);

  if (variant === "heartbeat") {
    const props = {
      agentVersion: rand(["1.39.0", "1.41.2", "1.42.0"]),
      heartbeatSource: "GuestAgent",
      connectionStatus: isErr ? "Disconnected" : "Connected",
      lastHeartbeatUtc: ts,
      osType: rand(["Linux", "Windows"]),
      osName: rand(["Ubuntu 22.04", "RHEL 9", "Windows Server 2022"]),
      ...miscExtendedErrFields(
        isErr,
        "Arc machine heartbeat stale agent proxy blocked relay to Azure endpoints",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "HybridComputeMachineHeartbeat",
      category: "HybridComputeHeartbeat",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "503" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.HybridCompute/machines"),
      azure: {
        arc: {
          machine_name: machine,
          resource_group: resourceGroup,
          category: "HybridComputeHeartbeat",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: azureLogEvent(
        isErr,
        randInt(1e6, 2e8),
        String("HybridComputeMachineHeartbeat"),
        ["configuration"],
        isErr ? ["change"] : ["info"]
      ),
      message: isErr
        ? `Arc ${machine}: agent heartbeat missed`
        : `Arc ${machine}: heartbeat OK (${props.osType})`,
    };
  }

  if (variant === "extension") {
    const ext = rand(["AzureMonitorLinuxAgent", "DependencyAgentLinux", "DSC"]);
    const props = {
      extensionName: ext,
      extensionVersion: rand(["1.0.0.0", "2.24.0"]),
      provisioningState: isErr ? "Failed" : rand(["Succeeded", "Updating"]),
      provisioningMessage: isErr
        ? "Download timed out"
        : rand(["Extension installed", "No changes detected"]),
      ...miscExtendedErrFields(
        isErr,
        "Arc extension provisioning failed Artifact download MSI or gpg signature validation",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.HybridCompute/machines/extensions/write",
      category: "ExtensionDeployment",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "500" : "200",
      callerIpAddress: "169.254.169.254",
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.HybridCompute/machines"),
      azure: {
        arc: {
          machine_name: machine,
          resource_group: resourceGroup,
          category: "ExtensionDeployment",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: azureLogEvent(
        isErr,
        randInt(5e7, 8e8),
        String("Microsoft.HybridCompute/machines/extensions/write"),
        ["configuration"],
        isErr ? ["change"] : ["info"]
      ),
      message: isErr
        ? `Arc ${machine}: extension ${ext} failed`
        : `Arc ${machine}: ${ext} ${props.provisioningState}`,
    };
  }

  if (variant === "guestcfg") {
    const props = {
      configurationName: rand(["AzureSecurityBaseline", "EncryptTempDsks"]),
      complianceStatus: isErr ? "NonCompliant" : rand(["Compliant", "Compliant"]),
      lastComplianceScanUtc: ts,
      assignmentName: `gc-${randId(4).toLowerCase()}`,
      ...miscExtendedErrFields(
        isErr,
        "Guest Configuration assignment remediation script returned non-compliant exit codes",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "GuestConfigurationAssignmentCompliance",
      category: "GuestConfiguration",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "1" : "0",
      callerIpAddress: "127.0.0.1",
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.HybridCompute/machines"),
      azure: {
        arc: {
          machine_name: machine,
          resource_group: resourceGroup,
          category: "GuestConfiguration",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: azureLogEvent(
        isErr,
        randInt(2e6, 4e8),
        String("GuestConfigurationAssignmentCompliance"),
        ["configuration"],
        isErr ? ["change"] : ["info"]
      ),
      message: isErr
        ? `Arc ${machine}: guest config ${props.configurationName} non-compliant`
        : `Arc ${machine}: guest config scan ${props.complianceStatus}`,
    };
  }

  if (variant === "patch") {
    const props = {
      patchesPendingCritical: isErr ? randInt(8, 40) : randInt(0, 4),
      assessmentAgeHours: isErr ? randFloat(72, 200) : randFloat(0.5, 24),
      ...miscExtendedErrFields(
        isErr,
        "Arc patch assessment backlog WSUS upstream unreachable offline connected machine",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.HybridCompute/machines/assessPatches/action",
      category: "PatchAssessment",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: `${props.patchesPendingCritical}`,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.HybridCompute/machines"),
      azure: {
        arc: {
          machine_name: machine,
          resource_group: resourceGroup,
          category: "PatchAssessment",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: azureLogEvent(
        isErr,
        randInt(2e11, 4e11),
        String("Microsoft.HybridCompute/machines/assessPatches/action"),
        ["configuration"],
        isErr ? ["change"] : ["info"]
      ),
      message: isErr
        ? `Arc ${machine}: stale patch assessment`
        : `Arc ${machine}: patch scan fresh`,
    };
  }

  if (variant === "identity") {
    const props = {
      servicePrincipalSynced: !isErr,
      lastIamRefreshUtc: ts,
      ...miscExtendedErrFields(
        isErr,
        "Arc hybrid identity federation token issuer mismatch blocked Azure RBAC onboarding",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "Microsoft.HybridCompute/machines/identity/sync",
      category: "IdentityBridge",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.servicePrincipalSynced ? "ok" : "drift",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.HybridCompute/machines"),
      azure: {
        arc: {
          machine_name: machine,
          resource_group: resourceGroup,
          category: "IdentityBridge",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: azureLogEvent(
        isErr,
        randInt(3e11, 4e11),
        String("Microsoft.HybridCompute/machines/identity/sync"),
        ["configuration"],
        isErr ? ["change"] : ["info"]
      ),
      message: isErr ? `Arc ${machine}: identity drift` : `Arc ${machine}: IAM synced`,
    };
  }

  const op = isErr
    ? "Microsoft.HybridCompute/machines/write"
    : rand([
        "Microsoft.HybridCompute/machines/write",
        "Microsoft.HybridCompute/machines/delete",
        "Microsoft.HybridCompute/machines/assessPatches/action",
      ]);
  const props = {
    entity: resourceId,
    eventCategory: "Administrative",
    status: isErr ? "Failed" : "Succeeded",
    errorCode: isErr ? rand(["MachineAgentNotInstalled", "InvalidResourceName"]) : "",
    httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
    ...miscExtendedErrFields(
      isErr,
      "Hybrid Compute machine ARM provisioning metadata conflict deleting connected resource",
      "adminOrProvision"
    ),
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
    cloud: azureCloud(region, subscription, "Microsoft.HybridCompute/machines"),
    azure: {
      arc: {
        machine_name: machine,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: azureLogEvent(
      isErr,
      randInt(1e8, 5e9),
      String(op),
      ["configuration"],
      isErr ? ["change"] : ["info"]
    ),
    message: isErr ? `Arc machine ${machine}: ${op} failed` : `Arc machine ${machine}: ${op} ok`,
  };
}

/** Azure Stack Hub registration — cloud sync and marketplace. */
export function generateStackLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const reg = `stackreg-${randId(5).toLowerCase()}`;
  const resourceId = armStackReg(subscription.id, resourceGroup, reg);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "sync",
    "marketplace",
    "admin",
    "capacity",
    "fabricHealth",
    "drift",
  ] as const);

  if (variant === "sync") {
    const props = {
      cloudId: randUUID(),
      lastSyncTimeUtc: ts,
      syncStatus: isErr ? "Failed" : rand(["Succeeded", "InProgress"]),
      usagePayloadSizeKb: isErr ? 0 : randInt(12, 9000),
      errorDetail: isErr ? rand(["EndpointUnreachable", "CertificateValidationFailed"]) : "",
      ...miscExtendedErrFields(
        isErr,
        "Azure Stack Hub usage metering upload failed federation trust with Azure public cloud",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "AzureStackUsageSync",
      category: "AzureStackOperational",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "500" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.AzureStack/registrations"),
      azure: {
        azure_stack: {
          registration_name: reg,
          resource_group: resourceGroup,
          category: "AzureStackOperational",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: azureLogEvent(
        isErr,
        randInt(1e8, 3e9),
        String("AzureStackUsageSync"),
        ["configuration"],
        isErr ? ["change"] : ["info"]
      ),
      message: isErr
        ? `Azure Stack ${reg}: usage sync failed (${props.errorDetail})`
        : `Azure Stack ${reg}: usage sync ${props.syncStatus}`,
    };
  }

  if (variant === "marketplace") {
    const props = {
      productName: rand([
        "Windows Server 2022 Datacenter",
        "Ubuntu 22.04 LTS",
        "SQL IaaS Extension",
      ]),
      downloadStatus: isErr ? "Failed" : rand(["Downloaded", "Cached"]),
      packageSizeMb: isErr ? 0 : randInt(40, 12_000),
      SyndicationApiVersion: "2020-06-01",
      ...miscExtendedErrFields(
        isErr,
        "Disconnected marketplace syndication blob missing signature or CDN blocked",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "AzureStackMarketplaceSyndication",
      category: "AzureStackMarketplace",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "404" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.AzureStack/registrations"),
      azure: {
        azure_stack: {
          registration_name: reg,
          resource_group: resourceGroup,
          category: "AzureStackMarketplace",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: azureLogEvent(
        isErr,
        randInt(5e7, 2e9),
        String("AzureStackMarketplaceSyndication"),
        ["configuration"],
        isErr ? ["change"] : ["info"]
      ),
      message: isErr
        ? `Azure Stack ${reg}: marketplace item ${props.productName} failed`
        : `Azure Stack ${reg}: syndicated ${props.productName}`,
    };
  }

  if (variant === "capacity") {
    const props = {
      stampsOnline: randInt(4, 12),
      imbalanceScore: isErr ? randFloat(0.55, 0.95) : randFloat(0.02, 0.35),
      ...miscExtendedErrFields(
        isErr,
        "Azure Stack fleet capacity balancer flagged asymmetric storage consumption stamp",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "AzureStackCapacityPlanner",
      category: "AzureStackOperational",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: `${props.stampsOnline}`,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.AzureStack/registrations"),
      azure: {
        azure_stack: {
          registration_name: reg,
          resource_group: resourceGroup,
          category: "AzureStackOperational",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: azureLogEvent(
        isErr,
        randInt(2e11, 4e11),
        String("AzureStackCapacityPlanner"),
        ["configuration"],
        isErr ? ["change"] : ["info"]
      ),
      message: isErr
        ? `Azure Stack ${reg}: capacity skew`
        : `Azure Stack ${reg}: stamps=${props.stampsOnline}`,
    };
  }

  if (variant === "fabricHealth") {
    const props = {
      infraRole: rand(["fabriccontroller", "slb"]),
      degradedNodes: isErr ? randInt(2, 9) : 0,
      ...miscExtendedErrFields(
        isErr,
        "Azure Stack Infrastructure role health degraded hardware isolation needed",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "AzureStackInfraFabricHealth",
      category: "AzureStackOperational",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.infraRole,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.AzureStack/registrations"),
      azure: {
        azure_stack: {
          registration_name: reg,
          resource_group: resourceGroup,
          category: "AzureStackOperational",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: azureLogEvent(
        isErr,
        randInt(4e11, 5e11),
        String("AzureStackInfraFabricHealth"),
        ["configuration"],
        isErr ? ["change"] : ["info"]
      ),
      message: isErr
        ? `Azure Stack ${reg}: ${props.infraRole} nodes=${props.degradedNodes}`
        : `Fabric OK`,
    };
  }

  if (variant === "drift") {
    const props = {
      blueprintVersionDesired: rand(["2610A", "2609C"]),
      actualVersion: isErr ? "2588Z" : "2610A",
      ...miscExtendedErrFields(
        isErr,
        "Update readiness drift detected target cloud version behind Microsoft baseline stamp",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "AzureStackSoftwareUpdateCompliance",
      category: "AzureStackOperational",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "behind" : "current",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.AzureStack/registrations"),
      azure: {
        azure_stack: {
          registration_name: reg,
          resource_group: resourceGroup,
          category: "AzureStackOperational",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: azureLogEvent(
        isErr,
        randInt(5e11, 6e11),
        String("AzureStackSoftwareUpdateCompliance"),
        ["configuration"],
        isErr ? ["change"] : ["info"]
      ),
      message: isErr
        ? `Azure Stack ${reg}: drift want=${props.blueprintVersionDesired} have=${props.actualVersion}`
        : `Azure Stack ${reg}: blueprint aligned`,
    };
  }

  const op = isErr
    ? "Microsoft.AzureStack/registrations/write"
    : rand([
        "Microsoft.AzureStack/registrations/write",
        "Microsoft.AzureStack/registrations/delete",
      ]);
  const props = {
    entity: resourceId,
    eventCategory: "Administrative",
    status: isErr ? "Failed" : "Succeeded",
    errorCode: isErr ? rand(["RegistrationConflict", "InvalidLocation"]) : "",
    httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
    ...miscExtendedErrFields(
      isErr,
      "Azure Stack registration ARM update conflicted multitenant stamps or geography",
      "adminOrProvision"
    ),
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
    cloud: azureCloud(region, subscription, "Microsoft.AzureStack/registrations"),
    azure: {
      azure_stack: {
        registration_name: reg,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: azureLogEvent(
      isErr,
      randInt(1e8, 5e9),
      String(op),
      ["configuration"],
      isErr ? ["change"] : ["info"]
    ),
    message: isErr
      ? `Azure Stack registration ${reg}: ${op} failed`
      : `Azure Stack registration ${reg}: ${op} ok`,
  };
}

/** Azure API Center — inventory, lint, control plane. */
export function generateApiCenterLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const svc = `apic-${rand(["corp", "platform"])}-${randId(4).toLowerCase()}`;
  const resourceId = armApiCenter(subscription.id, resourceGroup, svc);
  const callerIp = randIp();
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const variant = rand([
    "inventory",
    "lint",
    "admin",
    "conformance",
    "exportPack",
    "webhookRelay",
  ] as const);

  if (variant === "inventory") {
    const apiName = `${rand(["orders", "billing", "identity"])}-api`;
    const props = {
      apiName,
      apiVersion: `v${randInt(1, 3)}`,
      lifecycle: rand(["Design", "Production", "Deprecated"]),
      discoveredFrom: rand(["OpenApiSpec", "ApiManagement", "GitHub"]),
      breakingChangeCount: isErr ? randInt(3, 20) : randInt(0, 2),
      ...miscExtendedErrFields(
        isErr,
        "API Center inventory crawler rejected semver breaking diff against curated catalog",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ApiCenterInventoryUpdated",
      category: "ApiCenterInventory",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "422" : "200",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.ApiCenter/services"),
      azure: {
        api_center: {
          service_name: svc,
          resource_group: resourceGroup,
          category: "ApiCenterInventory",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: azureLogEvent(
        isErr,
        randInt(5e6, 4e8),
        String("ApiCenterInventoryUpdated"),
        ["configuration"],
        isErr ? ["change"] : ["info"]
      ),
      message: isErr
        ? `API Center ${svc}: inventory update rejected for ${apiName}`
        : `API Center ${svc}: indexed ${apiName} (${props.lifecycle})`,
    };
  }

  if (variant === "lint") {
    const props = {
      specPath: `/apis/${rand(["payments", "crm"])}.${rand(["yaml", "json"])}`,
      ruleSet: "Spectral-Oas",
      violations: isErr ? randInt(1, 40) : randInt(0, 5),
      severityMax: isErr ? "error" : rand(["info", "warn", "error"]),
      autoFixApplied: !isErr && Math.random() > 0.6,
      ...miscExtendedErrFields(
        isErr,
        "Spectral lint build failed cyclic external $ref dereference unreachable URL",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ApiCenterLintRun",
      category: "ApiCenterAnalysis",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "400" : "200",
      callerIpAddress: "169.254.169.254",
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.ApiCenter/services"),
      azure: {
        api_center: {
          service_name: svc,
          resource_group: resourceGroup,
          category: "ApiCenterAnalysis",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: azureLogEvent(
        isErr,
        randInt(1e6, 5e8),
        String("ApiCenterLintRun"),
        ["configuration"],
        isErr ? ["change"] : ["info"]
      ),
      message: isErr
        ? `API Center ${svc}: lint failed on ${props.specPath}`
        : `API Center ${svc}: lint ${props.violations} issue(s) on ${props.specPath}`,
    };
  }

  if (variant === "conformance") {
    const props = {
      profile: rand(["rest-level-0", "rest-level-1"]),
      passedRules: isErr ? randInt(10, 40) : randInt(92, 120),
      totalRules: 120,
      ...miscExtendedErrFields(
        isErr,
        "API conformance profile grading failed versioning header requirements",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ApiCenterConformanceEvaluate",
      category: "ApiCenterAnalysis",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: isErr ? "fail" : "pass",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.ApiCenter/services"),
      azure: {
        api_center: {
          service_name: svc,
          resource_group: resourceGroup,
          category: "ApiCenterAnalysis",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: azureLogEvent(
        isErr,
        randInt(2e9, 3e11),
        String("ApiCenterConformanceEvaluate"),
        ["configuration"],
        isErr ? ["change"] : ["info"]
      ),
      message: isErr
        ? `API Center ${svc}: conformance ${props.profile} ${props.passedRules}/${props.totalRules}`
        : `API Center ${svc}: conformance OK`,
    };
  }

  if (variant === "exportPack") {
    const props = {
      binderFormat: rand(["zip", "postman-collection"]),
      bytesPackaged: isErr ? 0 : randInt(120_000, 12_000_000),
      ...miscExtendedErrFields(
        isErr,
        "API documentation export aborted storage account SAS token revocation",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ApiCenterExportPortfolio",
      category: "ApiCenterInventory",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: props.bytesPackaged > 0 ? "ready" : "empty",
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Error" : "Informational",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.ApiCenter/services"),
      azure: {
        api_center: {
          service_name: svc,
          resource_group: resourceGroup,
          category: "ApiCenterInventory",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: azureLogEvent(
        isErr,
        randInt(4e10, 2e11),
        String("ApiCenterExportPortfolio"),
        ["configuration"],
        isErr ? ["change"] : ["info"]
      ),
      message: isErr ? `API Center ${svc}: export ${props.binderFormat} failed` : `Export zipped`,
    };
  }

  if (variant === "webhookRelay") {
    const props = {
      targetUrlScheme: rand(["https://slack", "https://teams"]),
      deliveriesFailed: isErr ? randInt(3, 40) : randInt(0, 2),
      ...miscExtendedErrFields(
        isErr,
        "API Center webhook fan-out backlog hitting downstream rate limit backoff",
        "data"
      ),
    };
    return {
      "@timestamp": ts,
      time,
      resourceId,
      operationName: "ApiCenterEventWebhookDelivery",
      category: "ApiCenterOperational",
      resultType: isErr ? "Failure" : "Success",
      resultSignature: `${props.deliveriesFailed}`,
      callerIpAddress: callerIp,
      correlationId,
      level: isErr ? "Warning" : "Informational",
      properties: props,
      cloud: azureCloud(region, subscription, "Microsoft.ApiCenter/services"),
      azure: {
        api_center: {
          service_name: svc,
          resource_group: resourceGroup,
          category: "ApiCenterOperational",
          correlation_id: correlationId,
          properties: props,
        },
      },
      event: azureLogEvent(
        isErr,
        randInt(3e11, 4e11),
        String("ApiCenterEventWebhookDelivery"),
        ["configuration"],
        isErr ? ["change"] : ["info"]
      ),
      message: isErr
        ? `API Center ${svc}: webhook failures=${props.deliveriesFailed}`
        : `Webhook OK`,
    };
  }

  const op = isErr
    ? "Microsoft.ApiCenter/services/write"
    : rand([
        "Microsoft.ApiCenter/services/write",
        "Microsoft.ApiCenter/services/delete",
        "Microsoft.ApiCenter/services/metadataSchemas/write",
      ]);
  const props = {
    entity: resourceId,
    eventCategory: "Administrative",
    status: isErr ? "Failed" : "Succeeded",
    errorCode: isErr ? rand(["ApiCenterNameUnavailable", "LinkedWorkspaceMissing"]) : "",
    httpRequest: { clientRequestId: randUUID(), clientIpAddress: callerIp, method: "PUT" },
    ...miscExtendedErrFields(
      isErr,
      "API Center service ARM update blocked workspace linkage or delegated subnet",
      "adminOrProvision"
    ),
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
    cloud: azureCloud(region, subscription, "Microsoft.ApiCenter/services"),
    azure: {
      api_center: {
        service_name: svc,
        resource_group: resourceGroup,
        category: "Administrative",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: azureLogEvent(
      isErr,
      randInt(1e8, 4e9),
      String(op),
      ["configuration"],
      isErr ? ["change"] : ["info"]
    ),
    message: isErr ? `API Center ${svc}: ${op} failed` : `API Center ${svc}: ${op} ok`,
  };
}
