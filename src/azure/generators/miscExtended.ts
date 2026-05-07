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
  const variant = rand(["access", "waf", "route", "admin"] as const);

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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e6, 8e8) },
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e5, 2e8) },
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e7, 4e8) },
      message: isErr
        ? `Front Door ${profile}: route ${props.routeName} config rejected`
        : `Front Door ${profile}: applied ${props.changeType} on ${props.routeName}`,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 6e9) },
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
  const variant = rand(["access", "origin", "admin"] as const);

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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(8e5, 5e8) },
      message: isErr
        ? `CDN ${profile}/${ep}: origin error (${sc})`
        : `CDN ${profile}: edge cache hit ratio event for ${props.Endpoint}`,
    };
  }

  if (variant === "origin") {
    const resourceId = armClassicEndpoint(subscription.id, resourceGroup, profile, ep);
    const props = {
      OriginHost: rand(["origin.contoso.com", "storagexxx.blob.core.windows.net"]),
      HealthProbeStatus: isErr ? "Unhealthy" : "Healthy",
      HttpLatencyMs: isErr ? randInt(8000, 30000) : randInt(8, 220),
      FailoverTriggered: isErr,
      LastError: isErr ? rand(["ConnectionTimeout", "TLSHandshakeFailed"]) : "",
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e6, 3e8) },
      message: isErr
        ? `CDN ${profile}/${ep}: origin ${props.OriginHost} ${props.HealthProbeStatus}`
        : `CDN ${profile}: origin probe OK (${props.HttpLatencyMs}ms)`,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 5e9) },
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
  const variant = rand(["tunnel", "ike", "bgp", "admin"] as const);
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e7, 6e8) },
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e6, 4e8) },
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e6, 3e8) },
      message: isErr
        ? `VPN GW ${gw}: BGP peer ASN ${props.peerAsn} unhealthy`
        : `VPN GW ${gw}: BGP learned ${props.routesLearned} routes for ${conn}`,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 6e9) },
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
  const props = {
    ReportPeriod: rand(["7", "30", "90"]),
    ReportRefreshDate: ts.slice(0, 10),
    Product: product,
    ActiveUserCount: isErr ? 0 : randInt(12, 85_000),
    EnabledUserCount: isErr ? 0 : randInt(50, 120_000),
    Department: rand(["Engineering", "Sales", "Operations", ""]),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.Graph/reports/getOffice365ActiveUserDetail",
    category: "Audit.General",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "Failed" : "Succeeded",
    callerIpAddress: `198.51.100.${randInt(2, 250)}`,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(5e5, 2e8) },
    message: isErr
      ? `O365 active users report failed for ${product} (org ${orgId})`
      : `O365 active users: ${props.ActiveUserCount} active on ${product}`,
  };
}

/** Microsoft 365 Teams user activity report. */
export function generateTeamsUserActivityLog(ts: string, er: number): EcsDocument {
  const { region, subscription, isErr } = makeAzureSetup(er);
  const orgId = randId(8).toUpperCase();
  const user = `user${randInt(100, 999)}@${rand(["contoso", "fabrikam"])}.onmicrosoft.com`;
  const correlationId = randUUID();
  const time = azureDiagnosticTime(ts);
  const resourceId = `/organization/${orgId}/reports/GetMicrosoftTeamsUserActivityUserDetail`;
  const props = {
    ReportPeriod: rand(["7", "30"]),
    ReportRefreshDate: ts.slice(0, 10),
    UserPrincipalName: user,
    TeamChatMessageCount: isErr ? 0 : randInt(0, 4000),
    PrivateChatMessageCount: isErr ? 0 : randInt(0, 2000),
    MeetingsAttendedCount: isErr ? 0 : randInt(0, 120),
    LastActivityDate: isErr ? "" : ts.slice(0, 10),
    Deleted: isErr,
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.Graph/reports/getTeamsUserActivityUserDetail",
    category: "Audit.General",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "0" : "1",
    callerIpAddress: `198.51.100.${randInt(2, 250)}`,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(5e5, 2e8) },
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
  const user = `user${randInt(100, 999)}@${rand(["contoso", "fabrikam"])}.onmicrosoft.com`;
  const props = {
    ReportPeriod: "7",
    ReportRefreshDate: ts.slice(0, 10),
    UserPrincipalName: user,
    SendCount: isErr ? 0 : randInt(0, 800),
    ReceiveCount: isErr ? 0 : randInt(0, 5000),
    ReadCount: isErr ? 0 : randInt(0, 9000),
    LastActivityDate: isErr ? "" : ts.slice(0, 10),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.Graph/reports/getEmailActivityUserDetail",
    category: "Audit.General",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "0" : "1",
    callerIpAddress: `198.51.100.${randInt(2, 250)}`,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(5e5, 2e8) },
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
  const user = `user${randInt(100, 999)}@${rand(["contoso", "fabrikam"])}.onmicrosoft.com`;
  const props = {
    ReportPeriod: rand(["7", "30"]),
    ReportRefreshDate: ts.slice(0, 10),
    OwnerPrincipalName: user,
    SiteUrl: isErr
      ? ""
      : `https://${rand(["contoso", "fabrikam"])}.sharepoint.com/personal/${user.split("@")[0]}`,
    StorageAllocatedInMB: isErr ? 0 : randInt(1024, 5_242_880),
    StorageUsedInMB: isErr ? 0 : randInt(100, 2_000_000),
    FileCount: isErr ? 0 : randInt(0, 800_000),
  };
  return {
    "@timestamp": ts,
    time,
    resourceId,
    operationName: "Microsoft.Graph/reports/getOneDriveUsageStorage",
    category: "Audit.General",
    resultType: isErr ? "Failure" : "Success",
    resultSignature: isErr ? "0" : "1",
    callerIpAddress: `198.51.100.${randInt(2, 250)}`,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(5e5, 2e8) },
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
  const variant = rand(["heartbeat", "extension", "guestcfg", "admin"] as const);

  if (variant === "heartbeat") {
    const props = {
      agentVersion: rand(["1.39.0", "1.41.2", "1.42.0"]),
      heartbeatSource: "GuestAgent",
      connectionStatus: isErr ? "Disconnected" : "Connected",
      lastHeartbeatUtc: ts,
      osType: rand(["Linux", "Windows"]),
      osName: rand(["Ubuntu 22.04", "RHEL 9", "Windows Server 2022"]),
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e6, 2e8) },
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
      message: isErr ? "Download timed out" : rand(["Extension installed", "No changes detected"]),
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e7, 8e8) },
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(2e6, 4e8) },
      message: isErr
        ? `Arc ${machine}: guest config ${props.configurationName} non-compliant`
        : `Arc ${machine}: guest config scan ${props.complianceStatus}`,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 5e9) },
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
  const variant = rand(["sync", "marketplace", "admin"] as const);

  if (variant === "sync") {
    const props = {
      cloudId: randUUID(),
      lastSyncTimeUtc: ts,
      syncStatus: isErr ? "Failed" : rand(["Succeeded", "InProgress"]),
      usagePayloadSizeKb: isErr ? 0 : randInt(12, 9000),
      errorDetail: isErr ? rand(["EndpointUnreachable", "CertificateValidationFailed"]) : "",
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 3e9) },
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e7, 2e9) },
      message: isErr
        ? `Azure Stack ${reg}: marketplace item ${props.productName} failed`
        : `Azure Stack ${reg}: syndicated ${props.productName}`,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 5e9) },
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
  const variant = rand(["inventory", "lint", "admin"] as const);

  if (variant === "inventory") {
    const apiName = `${rand(["orders", "billing", "identity"])}-api`;
    const props = {
      apiName,
      apiVersion: `v${randInt(1, 3)}`,
      lifecycle: rand(["Design", "Production", "Deprecated"]),
      discoveredFrom: rand(["OpenApiSpec", "ApiManagement", "GitHub"]),
      breakingChangeCount: isErr ? randInt(3, 20) : randInt(0, 2),
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(5e6, 4e8) },
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
      event: { outcome: isErr ? "failure" : "success", duration: randInt(1e6, 5e8) },
      message: isErr
        ? `API Center ${svc}: lint failed on ${props.specPath}`
        : `API Center ${svc}: lint ${props.violations} issue(s) on ${props.specPath}`,
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
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 4e9) },
    message: isErr ? `API Center ${svc}: ${op} failed` : `API Center ${svc}: ${op} ok`,
  };
}
