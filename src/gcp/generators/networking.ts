import {
  type EcsDocument,
  rand,
  randInt,
  randFloat,
  randId,
  randIp,
  gcpCloud,
  makeGcpSetup,
  randSubnet,
  randVpcNetwork,
  randHttpStatus,
  randLatencyMs,
  randSeverity,
  randGceInstance,
  randZone,
  HTTP_METHODS,
  HTTP_PATHS,
  USER_AGENTS,
} from "./helpers.js";

function eventBlock(isErr: boolean, durationNs: number) {
  return {
    outcome: isErr ? ("failure" as const) : ("success" as const),
    duration: durationNs,
  };
}

function gcpLogName(projectId: string, logId: string) {
  return `projects/${projectId}/logs/${encodeURIComponent(logId)}`;
}

function randGeo() {
  return rand([
    { continent: "Americas", country: "usa" },
    { continent: "Americas", country: "can" },
    { continent: "Europe", country: "deu" },
    { continent: "Europe", country: "gbr" },
    { continent: "Europe", country: "fra" },
    { continent: "Asia Pacific", country: "jpn" },
    { continent: "Asia Pacific", country: "aus" },
    { continent: "Asia Pacific", country: "ind" },
    { continent: "Africa", country: "zaf" },
    { continent: "Middle East", country: "isr" },
  ] as const);
}

function protocolNumber() {
  return rand([6, 17, 1, 58] as const);
}

function instanceInConnection(
  projectId: string,
  region: string,
  inst: { name: string; id: string },
  vpc: string,
  subnetUrl: string
) {
  const zone = randZone(region);
  return {
    project_id: projectId,
    region,
    zone,
    vpc: {
      project_id: projectId,
      vpc_name: vpc,
      subnetwork_name: subnetUrl.split("/").pop() ?? "default",
    },
    instance_name: inst.name,
    instance_id: inst.id,
    vm_name: `projects/${projectId}/zones/${zone}/instances/${inst.name}`,
  };
}

export function generateVpcFlowLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const reporter = rand(["SRC", "DEST"] as const);
  const proto = protocolNumber();
  const srcPort = randInt(1024, 65535);
  const destPort = rand([80, 443, 3306, 5432, 6379, 8080, 22, 53, 3389]);
  const srcInst = randGceInstance();
  const destInst = randGceInstance();
  const srcIp = randIp();
  const destIp = randIp();
  const vpc = randVpcNetwork();
  const subnet = randSubnet(region);
  const bytesSent = randInt(64, isErr ? 512 : 1_500_000);
  const packetsSent = Math.max(1, Math.floor(bytesSent / randInt(512, 1500)));
  const latencyNs = randLatencyMs(randInt(1, 5), isErr) * 1e6;
  const srcLoc = randGeo();
  const destLoc = randGeo();
  const connection = {
    src_ip: srcIp,
    dest_ip: destIp,
    src_port: srcPort,
    dest_port: destPort,
    protocol: proto,
    src_instance: instanceInConnection(project.id, region, srcInst, vpc, subnet),
    dest_instance: instanceInConnection(project.id, region, destInst, vpc, subnet),
  };
  const jsonPayload = {
    connection,
    reporter,
    bytes_sent: bytesSent,
    packets_sent: packetsSent,
    src_location: srcLoc,
    dest_location: destLoc,
    start_time: ts,
    end_time: ts,
  };
  const action = isErr ? "DENY" : rand(["ALLOW", "ALLOW", "ALLOW", "DENY"] as const);
  const message = `VPCFlow: ${reporter} ${proto} ${srcIp}:${srcPort}->${destIp}:${destPort} ${bytesSent}b ${packetsSent}pkts`;

  return {
    "@timestamp": ts,
    severity: isErr || action === "DENY" ? "WARNING" : "INFO",
    logName: gcpLogName(project.id, "compute.googleapis.com/vpc_flows"),
    insertId: `${randId(8)}${randId(8)}`,
    resource: {
      type: "gce_subnetwork",
      labels: {
        project_id: project.id,
        subnetwork_id: subnet.split("/").pop() ?? "default",
        subnetwork_name: subnet.split("/").pop() ?? "default",
        location: region,
      },
    },
    jsonPayload,
    cloud: gcpCloud(region, project, "vpc-flow"),
    gcp: {
      vpc_flow: {
        json_payload: jsonPayload,
        connection,
        reporter,
        bytes_sent: bytesSent,
        packets_sent: packetsSent,
        src_location: srcLoc,
        dest_location: destLoc,
        direction: reporter === "SRC" ? "egress" : "ingress",
        subnet,
        vpc_name: vpc,
        action,
        rule_name: isErr
          ? `deny-suspicious-${randId(4).toLowerCase()}`
          : `allow-internal-${randId(4).toLowerCase()}`,
      },
    },
    event: eventBlock(isErr || action === "DENY", latencyNs),
    message,
  };
}

export function generateCloudLbLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const requestMethod = rand(HTTP_METHODS);
  const urlPath = rand(HTTP_PATHS);
  const requestUrl = `https://api.${project.id}.${rand(["io", "com", "net"])}${urlPath}`;
  const responseCode = randHttpStatus(isErr);
  const latencyMs = randLatencyMs(randInt(8, 120), isErr);
  const remoteIp = randIp();
  const userAgent = rand(USER_AGENTS);
  const backendService = `bes-${rand(["api", "web", "grpc"])}-${randId(4).toLowerCase()}`;
  const latencyStr = `${(latencyMs / 1000).toFixed(6)}s`;
  const httpRequest = {
    requestMethod,
    requestUrl,
    status: responseCode,
    userAgent,
    remoteIp,
    latency: latencyStr,
    protocol: "HTTP/2",
  };
  const jsonPayload = {
    cacheDecision: rand(["USE_ORIGIN", "CACHE_HIT", "CACHE_MISS"]),
    backendTargetProjectNumber: project.number,
    backend_name: backendService,
    forwarding_rule_name: `fr-${region}-${randId(4).toLowerCase()}`,
    url_map_name: `um-${randId(6).toLowerCase()}`,
    target_proxy_name: `tp-https-${randId(4).toLowerCase()}`,
  };
  const message = `loadbalancing.googleapis.com/requests ${requestMethod} ${responseCode} ${latencyStr} ${requestUrl}`;

  return {
    "@timestamp": ts,
    severity: randSeverity(isErr),
    logName: gcpLogName(project.id, "requests"),
    insertId: randId(16).toLowerCase(),
    resource: {
      type: "http_load_balancer",
      labels: {
        project_id: project.id,
        zone: "global",
        url_map_name: String(jsonPayload.url_map_name),
        target_proxy_name: String(jsonPayload.target_proxy_name),
        forwarding_rule_name: String(jsonPayload.forwarding_rule_name),
        backend_service_name: backendService,
      },
    },
    httpRequest,
    jsonPayload,
    cloud: gcpCloud(region, project, "cloud-lb"),
    gcp: {
      cloud_lb: {
        http_request: httpRequest,
        json_payload: jsonPayload,
        backend_service: backendService,
        url_map: jsonPayload.url_map_name,
        forwarding_rule: jsonPayload.forwarding_rule_name,
        request_method: requestMethod,
        url_path: urlPath,
        response_code: responseCode,
        latency_ms: latencyMs,
        client_ip: remoteIp,
        backend_ip: randIp(),
        protocol: "HTTP/2",
      },
    },
    event: eventBlock(isErr, latencyMs * 1e6),
    message,
  };
}

export function generateCloudCdnLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const urlPath = rand([
    "/assets/logo.png",
    "/video/segment.ts",
    "/api/config.json",
    "/fonts.woff2",
  ]);
  const requestUrl = `https://cdn.${project.id}.example.com${urlPath}`;
  const cacheHit = !isErr && Math.random() > 0.35;
  const responseCode = randHttpStatus(isErr);
  const servedBytes = randInt(1024, 8_000_000);
  const originLatencyMs = cacheHit ? randInt(0, 5) : randLatencyMs(randInt(20, 200), isErr);
  const ttlSeconds = cacheHit ? randInt(60, 86400) : 0;
  const remoteIp = randIp();
  const latencyStr = `${(originLatencyMs / 1000).toFixed(6)}s`;
  const httpRequest = {
    requestMethod: "GET",
    requestUrl,
    status: responseCode,
    userAgent: rand(USER_AGENTS),
    remoteIp,
    latency: latencyStr,
    protocol: "HTTP/1.1",
  };
  const jsonPayload = {
    cacheId: `edge-${randId(8).toLowerCase()}`,
    cacheDecision: cacheHit ? "HIT" : "MISS",
    cacheFillBytes: cacheHit ? "0" : String(servedBytes),
    ttl: String(ttlSeconds),
    originResponseTime: `${originLatencyMs}ms`,
    statusDetails: isErr ? "upstream_failed" : "response_sent_by_backend",
  };
  const message = `cloudcdn.googleapis.com/requests ${cacheHit ? "HIT" : "MISS"} ${responseCode} ${requestUrl}`;

  return {
    "@timestamp": ts,
    severity: randSeverity(isErr),
    logName: gcpLogName(project.id, "requests"),
    insertId: randId(16).toLowerCase(),
    resource: {
      type: "http_load_balancer",
      labels: {
        project_id: project.id,
        zone: "global",
        backend_service_name: `cdn-${randId(4)}`,
        url_map_name: `cdn-um-${randId(4)}`,
      },
    },
    httpRequest,
    jsonPayload,
    cloud: gcpCloud(region, project, "cloud-cdn"),
    gcp: {
      cloud_cdn: {
        http_request: httpRequest,
        json_payload: jsonPayload,
        cache_hit: cacheHit,
        cache_id: jsonPayload.cacheId,
        url_path: urlPath,
        response_code: responseCode,
        served_bytes: servedBytes,
        origin_latency_ms: originLatencyMs,
        ttl_seconds: ttlSeconds,
      },
    },
    event: eventBlock(isErr, originLatencyMs * 1e6),
    message,
  };
}

export function generateCloudDnsLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const queryType = rand(["A", "AAAA", "CNAME", "MX", "TXT"] as const);
  const responseCode = isErr ? rand(["NXDOMAIN", "SERVFAIL"] as const) : "NOERROR";
  const dnsProto = rand(["UDP", "TCP"] as const);
  const zoneName = `${rand(["prod", "staging", "internal"])}.${randId(4).toLowerCase()}.example.com.`;
  const queryName = `${rand(["api", "db", "cdn", "auth"])}.${zoneName}`;
  const durationNs = randLatencyMs(randInt(2, 25), isErr) * 1e6;
  const sourceIp = randIp();
  const jsonPayload = {
    vmInstanceName: `projects/${project.id}/zones/${randZone(region)}/instances/${randGceInstance().name}`,
    queryName,
    queryType,
    responseCode,
    protocol: dnsProto,
    sourceIP: sourceIp,
    sourceNetwork: randVpcNetwork(),
    serverLatency: `${randInt(1, 40)}`,
    rdata: isErr ? "" : rand(["10.0.0.5", "2001:db8::1", "cname.example.com."]),
  };
  const message = `dns.googleapis.com/dns_queries ${queryName} ${queryType} ${responseCode} from ${sourceIp}`;

  return {
    "@timestamp": ts,
    severity: isErr ? "WARNING" : "INFO",
    logName: gcpLogName(project.id, "dns.googleapis.com/dns_queries"),
    insertId: randId(16).toLowerCase(),
    resource: {
      type: "dns_query",
      labels: { project_id: project.id, target_type: "public-zone", location: region },
    },
    jsonPayload,
    cloud: gcpCloud(region, project, "cloud-dns"),
    gcp: {
      cloud_dns: {
        json_payload: jsonPayload,
        query_name: queryName,
        query_type: queryType,
        response_code: responseCode,
        source_ip: sourceIp,
        zone_name: zoneName,
        protocol: dnsProto,
      },
    },
    event: eventBlock(isErr, durationNs),
    message,
  };
}

export function generateCloudArmorLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const policyResource = `projects/${project.id}/global/securityPolicies/armor-${rand(["edge", "api", "corp"])}-${randId(4).toLowerCase()}`;
  const previewMode = Math.random() > 0.85;
  const rateLimit = !previewMode && Math.random() < 0.28;
  const wafMatch = !rateLimit && (isErr || Math.random() < 0.45);
  const priority = randInt(100, 9000);
  const configuredAction = rateLimit
    ? "THROTTLE"
    : isErr || wafMatch
      ? rand(["DENY", "DENY_403", "REDIRECT"] as const)
      : rand(["ALLOW", "THROTTLE"] as const);
  const outcome = previewMode
    ? "ACCEPT"
    : configuredAction === "THROTTLE" && rateLimit
      ? "RATE_LIMITED"
      : configuredAction;
  const preconfiguredExpr = wafMatch
    ? rand([
        "evaluatePreconfiguredExpr('sqli-v33-stable')",
        "evaluatePreconfiguredExpr('xss-v33-stable')",
        "evaluatePreconfiguredExpr('lfi-v33-stable')",
      ])
    : `inIpRange(origin.ip, '${randIp()}/32')`;
  const ruleId = wafMatch
    ? rand(["owasp-crs-v030001-id942100-sqli", "owasp-crs-v030001-id941100-xss"])
    : `custom-${randId(6)}`;
  const requestUrl = `https://api.${project.id}.example.com${rand(HTTP_PATHS)}`;
  const status = randHttpStatus(isErr);
  const remoteIp = randIp();
  const userAgent = rand(USER_AGENTS);
  const method = rand(HTTP_METHODS);
  const latencyMs = randLatencyMs(randInt(1, 12), false);
  const httpRequest = {
    requestMethod: method,
    requestUrl,
    status,
    userAgent,
    remoteIp,
    latency: `${(latencyMs / 1000).toFixed(6)}s`,
    protocol: "HTTP/1.1",
  };
  const enforcedSecurityPolicy = {
    name: policyResource,
    priority,
    configuredAction,
    outcome: previewMode ? "ACCEPT" : outcome,
    preconfiguredExpr: wafMatch ? preconfiguredExpr : undefined,
    matchedFieldName: wafMatch ? "request.query" : undefined,
    matchedFieldValue: wafMatch ? rand(["' OR 1=1--", "<script>alert(1)</script>"]) : undefined,
    preconfiguredExprIds: wafMatch ? [ruleId] : undefined,
  };
  const rateLimitAction = rateLimit
    ? {
        key: `http-cookie:session=${randId(16)}`,
        outcome: "RATE_LIMITED",
        rateLimitThreshold: { count: randInt(100, 2000), intervalSec: randInt(60, 600) },
      }
    : undefined;
  const jsonPayload = {
    enforcedSecurityPolicy,
    previewSecurityPolicy: previewMode
      ? { name: policyResource, outcome: "DENY", priority }
      : undefined,
    rateLimitAction,
    remoteIp,
    backendServiceName: `bes-${rand(["api", "web"])}-${randId(4).toLowerCase()}`,
    enforcedSecurityPolicyRequestHeadersToAdds: [],
  };
  const message = previewMode
    ? `Cloud Armor preview: would enforce ${configuredAction} priority=${priority} ${remoteIp}`
    : rateLimit
      ? `Cloud Armor rate limit ${rateLimitAction?.outcome} key=${rateLimitAction?.key}`
      : `Cloud Armor ${outcome} ${policyResource} expr=${preconfiguredExpr}`;

  return {
    "@timestamp": ts,
    severity: isErr || outcome === "DENY" || outcome === "RATE_LIMITED" ? "WARNING" : "INFO",
    logName: gcpLogName(project.id, "requests"),
    insertId: randId(16).toLowerCase(),
    resource: { type: "http_load_balancer", labels: { project_id: project.id, zone: "global" } },
    httpRequest,
    jsonPayload,
    cloud: gcpCloud(region, project, "cloud-armor"),
    gcp: {
      cloud_armor: {
        http_request: httpRequest,
        json_payload: jsonPayload,
        policy_name: policyResource,
        rule_name: ruleId,
        action: String(outcome),
        priority,
        source_ip: remoteIp,
        matched_expression: preconfiguredExpr,
        preview_mode: previewMode,
        enforced_security_policy: enforcedSecurityPolicy,
        rate_limit_action: rateLimitAction,
      },
    },
    event: eventBlock(isErr && !previewMode, latencyMs * 1e6),
    message,
  };
}

export function generateCloudNatLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const gatewayName = `nat-gw-${randId(5).toLowerCase()}`;
  const routerName = `cr-${region}-${randId(4).toLowerCase()}`;
  const natIp = randIp();
  const vmInstance = randGceInstance();
  const proto = protocolNumber();
  const endpointType = rand(["ENDPOINT_TYPE_VM", "ENDPOINT_TYPE_SERVERLESS"] as const);
  const allocatedPorts = randInt(32, 2048);
  const packetsDropped = isErr ? randInt(10, 500_000) : randInt(0, 3);
  const durationNs = randLatencyMs(randInt(1, 8), isErr) * 1e6;
  const jsonPayload = {
    connection: {
      nat_gateway_name: gatewayName,
      router_name: routerName,
      nat_ip: natIp,
      allocated_ports: allocatedPorts,
      endpoint_type: endpointType,
      protocol: proto,
      vm_name: `projects/${project.id}/zones/${randZone(region)}/instances/${vmInstance.name}`,
      packets_dropped: packetsDropped,
    },
    gateway_identifiers: { region, router_name: routerName, gateway_name: gatewayName },
  };
  const message = `nat.googleapis.com/nat_flows ${gatewayName} ${endpointType} ports=${allocatedPorts} dropped=${packetsDropped}`;

  return {
    "@timestamp": ts,
    severity: isErr ? "ERROR" : "INFO",
    logName: gcpLogName(project.id, "compute.googleapis.com/nat_flows"),
    insertId: randId(16).toLowerCase(),
    resource: {
      type: "nat_gateway",
      labels: { project_id: project.id, gateway_name: gatewayName, region },
    },
    jsonPayload,
    cloud: gcpCloud(region, project, "cloud-nat"),
    gcp: {
      cloud_nat: {
        json_payload: jsonPayload,
        gateway_name: gatewayName,
        nat_ip: natIp,
        vm_instance: vmInstance.name,
        protocol: proto,
        endpoint_type: endpointType,
        allocated_ports: allocatedPorts,
        ...(isErr ? { packets_dropped: packetsDropped } : {}),
      },
    },
    event: eventBlock(isErr, durationNs),
    message,
  };
}

export function generateCloudVpnLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const status = isErr
    ? rand(["NO_INCOMING_PACKETS", "AUTHORIZATION_ERROR"] as const)
    : "ESTABLISHED";
  const tunnelName = `tunnel-${randId(6).toLowerCase()}`;
  const gatewayName = `vpn-gw-${randId(4).toLowerCase()}`;
  const ikeVersion = rand(["1", "2"] as const);
  const receivedBytes = isErr ? randInt(0, 5000) : randInt(50_000, 500_000_000);
  const sentBytes = isErr ? randInt(0, 5000) : randInt(50_000, 500_000_000);
  const durationNs = randLatencyMs(randInt(50, 500), isErr) * 1e6;
  const peerIp = randIp();
  const jsonPayload = {
    vpn_gateway_id: `projects/${project.id}/regions/${region}/vpnGateways/${gatewayName}`,
    vpn_tunnel_id: `projects/${project.id}/regions/${region}/vpnTunnels/${tunnelName}`,
    peer_ip: peerIp,
    status,
    ike_version: `ikev${ikeVersion}`,
    traffic: { ingress_bytes: String(receivedBytes), egress_bytes: String(sentBytes) },
  };
  const message = `vpn.googleapis.com/tunnel_events ${tunnelName} ${status} peer=${peerIp}`;

  return {
    "@timestamp": ts,
    severity: isErr ? "ERROR" : "INFO",
    logName: gcpLogName(project.id, "vpn.googleapis.com/tunnel_events"),
    insertId: randId(16).toLowerCase(),
    resource: {
      type: "vpn_gateway",
      labels: { project_id: project.id, gateway_id: gatewayName, region },
    },
    jsonPayload,
    cloud: gcpCloud(region, project, "cloud-vpn"),
    gcp: {
      cloud_vpn: {
        json_payload: jsonPayload,
        tunnel_name: tunnelName,
        gateway_name: gatewayName,
        peer_ip: peerIp,
        local_ip: randIp(),
        status,
        ike_version: `ikev${ikeVersion}`,
        received_bytes: receivedBytes,
        sent_bytes: sentBytes,
      },
    },
    event: eventBlock(isErr, durationNs),
    message,
  };
}

export function generateCloudInterconnectLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const icType = rand(["DEDICATED", "PARTNER"] as const);
  const bandwidthGbps = rand([10, 50, 100, 200] as const);
  const operationalStatus = isErr ? "OS_DOWN" : "OS_ACTIVE";
  const circuitsCount = icType === "DEDICATED" ? randInt(1, 4) : 1;
  const durationNs = randLatencyMs(randInt(10, 100), isErr) * 1e6;
  const attachmentName = `attach-${randId(5).toLowerCase()}`;
  const interconnectName = `ic-${rand(["dfw", "iad", "lhr"])}-${randId(4).toLowerCase()}`;
  const jsonPayload = {
    interconnect: `projects/${project.id}/global/interconnects/${interconnectName}`,
    interconnect_attachment: `projects/${project.id}/regions/${region}/interconnectAttachments/${attachmentName}`,
    operational_status: operationalStatus,
    interconnect_type: icType,
    bandwidth_gbps: bandwidthGbps,
    circuits: circuitsCount,
    google_circuit_id: `GC-${randId(8)}`,
  };
  const message = `interconnect.googleapis.com/interconnect_events ${interconnectName} ${operationalStatus}`;

  return {
    "@timestamp": ts,
    severity: isErr ? "ERROR" : "NOTICE",
    logName: gcpLogName(project.id, "interconnect.googleapis.com/interconnect_events"),
    insertId: randId(16).toLowerCase(),
    resource: {
      type: "interconnect_attachment",
      labels: { project_id: project.id, attachment: attachmentName, region },
    },
    jsonPayload,
    cloud: gcpCloud(region, project, "cloud-interconnect"),
    gcp: {
      cloud_interconnect: {
        json_payload: jsonPayload,
        attachment_name: attachmentName,
        interconnect_name: interconnectName,
        type: icType,
        bandwidth_gbps: bandwidthGbps,
        operational_status: operationalStatus,
        circuits_count: circuitsCount,
      },
    },
    event: eventBlock(isErr, durationNs),
    message,
  };
}

export function generateCloudRouterLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const routerStatus = isErr ? "DOWN" : "UP";
  const localAsn = randInt(64512, 65534);
  const peerAsn = randInt(1000, 65000);
  const advertisedRoutes = isErr ? randInt(0, 5) : randInt(8, 400);
  const receivedRoutes = isErr ? randInt(0, 3) : randInt(20, 8000);
  const durationNs = randLatencyMs(randInt(5, 80), isErr) * 1e6;
  const routerName = `cr-${region}-${randId(4).toLowerCase()}`;
  const peerIp = randIp();
  const jsonPayload = {
    router: `projects/${project.id}/regions/${region}/routers/${routerName}`,
    bgp_peer: {
      name: `peer-${randId(4)}`,
      peer_ip: peerIp,
      peer_asn: peerAsn,
      status: routerStatus,
      uptime: `${randInt(60, 864000)}s`,
    },
    local_asn: localAsn,
    routes: { advertised: advertisedRoutes, received: receivedRoutes },
  };
  const message = `router.googleapis.com/bgp_sessions ${routerName} peer=${peerIp} ${routerStatus}`;

  return {
    "@timestamp": ts,
    severity: isErr ? "WARNING" : "INFO",
    logName: gcpLogName(project.id, "router.googleapis.com/bgp_sessions"),
    insertId: randId(16).toLowerCase(),
    resource: {
      type: "cloud_router",
      labels: { project_id: project.id, router_id: routerName, region },
    },
    jsonPayload,
    cloud: gcpCloud(region, project, "cloud-router"),
    gcp: {
      cloud_router: {
        json_payload: jsonPayload,
        router_name: routerName,
        bgp_peer: peerIp,
        peer_asn: peerAsn,
        local_asn: localAsn,
        advertised_routes: advertisedRoutes,
        received_routes: receivedRoutes,
        status: routerStatus,
      },
    },
    event: eventBlock(isErr, durationNs),
    message,
  };
}

export function generateTrafficDirectorLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const healthStatus = isErr ? "UNHEALTHY" : rand(["HEALTHY", "HEALTHY", "DRAINING"] as const);
  const requestCount = randInt(100, 500_000);
  const errorRate = isErr ? randFloat(0.05, 0.45) : randFloat(0, 0.02);
  const durationNs = randLatencyMs(randInt(15, 200), isErr) * 1e6;
  const meshName = `mesh-${randId(4).toLowerCase()}`;
  const serviceName = `xds://${rand(["payments", "search", "catalog"])}.svc.cluster.local`;
  const backendGroup = `neg-${randId(6).toLowerCase()}`;
  const jsonPayload = {
    mesh_uid: `mesh-${project.number}-${meshName}`,
    service_host: serviceName,
    endpoint_group: `projects/${project.id}/zones/${randZone(region)}/networkEndpointGroups/${backendGroup}`,
    locality: { region, zone: randZone(region) },
    health_state: healthStatus,
    metrics: { requests: requestCount, error_rate: Math.round(errorRate * 10_000) / 10_000 },
  };
  const message = `trafficdirector.googleapis.com/xds_streams ${meshName} ${serviceName} health=${healthStatus}`;

  return {
    "@timestamp": ts,
    severity: isErr ? "WARNING" : "INFO",
    logName: gcpLogName(project.id, "trafficdirector.googleapis.com/xds"),
    insertId: randId(16).toLowerCase(),
    resource: { type: "td_mesh", labels: { project_id: project.id, mesh: meshName, region } },
    jsonPayload,
    cloud: gcpCloud(region, project, "traffic-director"),
    gcp: {
      traffic_director: {
        json_payload: jsonPayload,
        mesh_name: meshName,
        service_name: serviceName,
        backend_group: backendGroup,
        health_status: healthStatus,
        request_count: requestCount,
        error_rate: Math.round(errorRate * 10_000) / 10_000,
      },
    },
    event: eventBlock(isErr, durationNs),
    message,
  };
}

export function generatePrivateServiceConnectLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const connectionStatus = isErr ? rand(["REJECTED", "PENDING"] as const) : "ACCEPTED";
  const durationNs = randLatencyMs(randInt(20, 400), isErr) * 1e6;
  const endpointName = `psc-endpoint-${randId(5).toLowerCase()}`;
  const serviceAttachment = `projects/${randInt(100000000000, 999999999999)}/regions/${region}/serviceAttachments/sa-${randId(4).toLowerCase()}`;
  const forwardingRule = `psc-fr-${randId(4).toLowerCase()}`;
  const jsonPayload = {
    psc_endpoint: `projects/${project.id}/regions/${region}/forwardingRules/${forwardingRule}`,
    service_attachment: serviceAttachment,
    connection_status: connectionStatus,
    consumer_network: `projects/${project.id}/global/networks/${randVpcNetwork()}`,
    producer_service: `projects/${randInt(100000000000, 999999999999)}/regions/${region}/serviceAttachments/producer-${randId(4)}`,
  };
  const message = `compute.googleapis.com/psc_endpoints ${endpointName} ${connectionStatus}`;

  return {
    "@timestamp": ts,
    severity: isErr ? "WARNING" : "INFO",
    logName: gcpLogName(project.id, "compute.googleapis.com/psc_connection"),
    insertId: randId(16).toLowerCase(),
    resource: {
      type: "forwarding_rule",
      labels: { project_id: project.id, region, forwarding_rule_id: forwardingRule },
    },
    jsonPayload,
    cloud: gcpCloud(region, project, "private-service-connect"),
    gcp: {
      private_service_connect: {
        json_payload: jsonPayload,
        endpoint_name: endpointName,
        service_attachment: serviceAttachment,
        connection_status: connectionStatus,
        forwarding_rule: forwardingRule,
      },
    },
    event: eventBlock(isErr, durationNs),
    message,
  };
}

export function generateNetworkConnectivityCenterLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const spokeType = rand(["VPN", "INTERCONNECT", "VPC"] as const);
  const status = isErr ? "DEGRADED" : "ACTIVE";
  const linkedVpc = `https://www.googleapis.com/compute/v1/projects/${project.id}/global/networks/${randVpcNetwork()}`;
  const durationNs = randLatencyMs(randInt(30, 300), isErr) * 1e6;
  const hubName = `ncc-hub-${randId(4).toLowerCase()}`;
  const spokeName = `spoke-${rand(["emea", "amer", "apac"])}-${randId(4).toLowerCase()}`;
  const jsonPayload = {
    hub: `projects/${project.id}/locations/global/hubs/${hubName}`,
    spoke: `projects/${project.id}/locations/global/spokes/${spokeName}`,
    spoke_type: spokeType,
    state: status,
    linked_vpc_network: linkedVpc,
    routing_state: isErr ? "DEGRADED" : "STABLE",
  };
  const message = `networkconnectivity.googleapis.com/hub_events hub=${hubName} spoke=${spokeName} ${status}`;

  return {
    "@timestamp": ts,
    severity: isErr ? "WARNING" : "INFO",
    logName: gcpLogName(project.id, "networkconnectivity.googleapis.com/hub_activity"),
    insertId: randId(16).toLowerCase(),
    resource: {
      type: "network_spoke",
      labels: { project_id: project.id, hub: hubName, spoke: spokeName },
    },
    jsonPayload,
    cloud: gcpCloud(region, project, "network-connectivity-center"),
    gcp: {
      network_connectivity_center: {
        json_payload: jsonPayload,
        hub_name: hubName,
        spoke_name: spokeName,
        spoke_type: spokeType,
        status,
        linked_vpc: linkedVpc,
      },
    },
    event: eventBlock(isErr, durationNs),
    message,
  };
}

export function generateNetworkIntelligenceCenterLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const src = randIp();
  const dst = randIp();
  const result = isErr ? rand(["UNREACHABLE", "AMBIGUOUS"] as const) : "REACHABLE";
  const packetTraceHops = isErr ? randInt(2, 8) : randInt(4, 18);
  const durationNs = randLatencyMs(randInt(100, 2000), isErr) * 1e6;
  const testName = `nic-probe-${randId(6).toLowerCase()}`;
  const jsonPayload = {
    connectivity_test: `projects/${project.id}/locations/global/connectivityTests/${testName}`,
    source: {
      ip_address: src,
      network: `projects/${project.id}/global/networks/${randVpcNetwork()}`,
    },
    destination: {
      ip_address: dst,
      network: `projects/${project.id}/global/networks/${randVpcNetwork()}`,
    },
    result,
    trace: { hop_count: packetTraceHops, final_state: isErr ? "DROP" : "FORWARD" },
  };
  const message = `networkmanagement.googleapis.com/connectivity_tests ${testName} ${src}->${dst} ${result}`;

  return {
    "@timestamp": ts,
    severity: isErr ? "WARNING" : "INFO",
    logName: gcpLogName(project.id, "networkmanagement.googleapis.com/connectivity_test"),
    insertId: randId(16).toLowerCase(),
    resource: {
      type: "connectivity_test",
      labels: { project_id: project.id, test: testName, region: "global" },
    },
    jsonPayload,
    cloud: gcpCloud(region, project, "network-intelligence-center"),
    gcp: {
      network_intelligence_center: {
        json_payload: jsonPayload,
        test_name: testName,
        source_ip: src,
        destination_ip: dst,
        result,
        packet_trace_hops: packetTraceHops,
      },
    },
    event: eventBlock(isErr, durationNs),
    message,
  };
}

export function generateCloudIdsLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const endpointName = `ids-endpoint-${randId(6).toLowerCase()}`;
  const threatId = `threat-${randId(10).toLowerCase()}`;
  const severityRank = rand(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const);
  const category = rand(["TROJAN", "EXPLOIT", "MALWARE", "COMMAND_AND_CONTROL"] as const);
  const srcIp = randIp();
  const dstIp = randIp();
  const proto = protocolNumber();
  const action = rand(["ALERT", "DENY"] as const);
  const durationNs = randLatencyMs(randInt(5, 80), isErr) * 1e6;
  const jsonPayload = {
    ids_endpoint: `projects/${project.id}/locations/${region}/endpoints/${endpointName}`,
    threat: { id: threatId, category, severity: isErr ? "HIGH" : severityRank },
    connection: {
      src_ip: srcIp,
      dest_ip: dstIp,
      protocol: proto,
      src_port: randInt(1024, 65535),
      dest_port: rand([80, 443, 8080]),
    },
    action,
    detection_time: ts,
  };
  const message = `ids.googleapis.com/threats ${endpointName} ${category} ${srcIp}->${dstIp}`;

  return {
    "@timestamp": ts,
    severity: isErr
      ? "ERROR"
      : severityRank === "CRITICAL" || severityRank === "HIGH"
        ? "ALERT"
        : "NOTICE",
    logName: gcpLogName(project.id, "ids.googleapis.com/threat"),
    insertId: randId(16).toLowerCase(),
    resource: {
      type: "ids_endpoint",
      labels: { project_id: project.id, endpoint: endpointName, region },
    },
    jsonPayload,
    cloud: gcpCloud(region, project, "cloud-ids"),
    gcp: {
      cloud_ids: {
        json_payload: jsonPayload,
        endpoint_name: endpointName,
        threat_id: threatId,
        severity: isErr ? "HIGH" : severityRank,
        category,
        source_ip: srcIp,
        dest_ip: dstIp,
        protocol: proto,
        action,
      },
    },
    event: eventBlock(isErr, durationNs),
    message,
  };
}

export function generatePacketMirroringLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const policyName = `pm-policy-${randId(5).toLowerCase()}`;
  const mirroredNetwork = randVpcNetwork();
  const collectorInstance = randGceInstance();
  const mirroredInstancesCount = isErr ? randInt(0, 2) : randInt(3, 120);
  const filterProtocol = rand(["tcp", "udp", "icmp", "all"]);
  const filterCidr = `10.${randInt(0, 255)}.${randInt(0, 255)}.0/24`;
  const durationNs = randLatencyMs(randInt(10, 200), isErr) * 1e6;
  const jsonPayload = {
    packet_mirroring_policy: `projects/${project.id}/regions/${region}/packetMirrorings/${policyName}`,
    mirrored_network: `projects/${project.id}/global/networks/${mirroredNetwork}`,
    collector_ilb: `projects/${project.id}/regions/${region}/forwardingRules/ilb-${collectorInstance.name}`,
    mirrored_instance_count: mirroredInstancesCount,
    filter: { ip_cidr_range: filterCidr, protocol: filterProtocol },
    health: isErr ? "UNHEALTHY" : "HEALTHY",
  };
  const message = `compute.googleapis.com/packet_mirroring ${policyName} mirrored=${mirroredInstancesCount}`;

  return {
    "@timestamp": ts,
    severity: isErr ? "ERROR" : "INFO",
    logName: gcpLogName(project.id, "compute.googleapis.com/packet_mirroring"),
    insertId: randId(16).toLowerCase(),
    resource: {
      type: "packet_mirroring_policy",
      labels: { project_id: project.id, policy: policyName, region },
    },
    jsonPayload,
    cloud: gcpCloud(region, project, "packet-mirroring"),
    gcp: {
      packet_mirroring: {
        json_payload: jsonPayload,
        policy_name: policyName,
        mirrored_network: mirroredNetwork,
        collector_instance: collectorInstance.name,
        mirrored_instances_count: mirroredInstancesCount,
        filter_protocol: filterProtocol,
        filter_cidr: filterCidr,
      },
    },
    event: eventBlock(isErr, durationNs),
    message,
  };
}

export function generateNetworkServiceTiersLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const tier = rand(["PREMIUM", "STANDARD"] as const);
  const resourceType = rand(["VM", "LOAD_BALANCER", "CLOUD_STORAGE", "VPN"] as const);
  const egressBytes = isErr ? randInt(0, 5000) : randInt(50_000, 5_000_000_000);
  const routingType = rand(["HOT_POTATO", "COLD_POTATO", "REGIONAL"] as const);
  const durationNs = randLatencyMs(randInt(2, 40), isErr) * 1e6;
  const jsonPayload = {
    network_tier: tier,
    resource_kind: resourceType,
    region,
    egress_bytes: String(egressBytes),
    routing_preference: routingType,
    project: project.id,
  };
  const message = `compute.googleapis.com/network_tiers ${tier} ${resourceType} egress=${egressBytes}`;

  return {
    "@timestamp": ts,
    severity: isErr ? "WARNING" : "INFO",
    logName: gcpLogName(project.id, "compute.googleapis.com/network_tier_usage"),
    insertId: randId(16).toLowerCase(),
    resource: { type: "project", labels: { project_id: project.id } },
    jsonPayload,
    cloud: gcpCloud(region, project, "network-service-tiers"),
    gcp: {
      network_service_tiers: {
        json_payload: jsonPayload,
        tier,
        resource_type: resourceType,
        region,
        egress_bytes: egressBytes,
        routing_type: routingType,
      },
    },
    event: eventBlock(isErr, durationNs),
    message,
  };
}

export function generateCloudDomainsLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const domainName = `${rand(["app", "shop", "corp"])}-${randId(4).toLowerCase()}.example.com`;
  const action = rand(["REGISTER", "RENEW", "TRANSFER", "CONFIGURE_DNS", "DELETE"] as const);
  const registrarStatus = isErr
    ? rand(["PENDING", "FAILED"] as const)
    : rand(["ACTIVE", "OK", "LOCKED"] as const);
  const base = new Date(ts);
  const expirationDate = new Date(base.getTime() + randInt(30, 730) * 86400_000)
    .toISOString()
    .slice(0, 10);
  const dnssecEnabled = !isErr && Math.random() > 0.4;
  const durationNs = randLatencyMs(randInt(20, 300), isErr) * 1e6;
  const jsonPayload = {
    domain: `projects/${project.id}/locations/global/registrations/${domainName}`,
    operation: action,
    state: registrarStatus,
    expire_time: `${expirationDate}T00:00:00Z`,
    dnssec_state: dnssecEnabled ? "ENABLED" : "DISABLED",
    contact_privacy: "PRIVATE_CONTACT_DATA",
  };
  const message = `domains.googleapis.com/registrations ${action} ${domainName} ${registrarStatus}`;

  return {
    "@timestamp": ts,
    severity: isErr ? "ERROR" : "NOTICE",
    logName: gcpLogName(project.id, "domains.googleapis.com/domain_operations"),
    insertId: randId(16).toLowerCase(),
    resource: {
      type: "domain_registration",
      labels: { project_id: project.id, domain: domainName },
    },
    jsonPayload,
    cloud: gcpCloud(region, project, "cloud-domains"),
    gcp: {
      cloud_domains: {
        json_payload: jsonPayload,
        domain_name: domainName,
        action,
        registrar_status: registrarStatus,
        expiration_date: expirationDate,
        dnssec_enabled: dnssecEnabled,
      },
    },
    event: eventBlock(isErr, durationNs),
    message,
  };
}

export function generateMediaCdnLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const serviceName = `media-cdn-${randId(5).toLowerCase()}`;
  const edgeLocation = rand([`${region}-edge`, "global-edge", `cdn-${randId(4)}`]);
  const cacheResult = isErr
    ? rand(["PASS", "MISS"] as const)
    : rand(["HIT", "MISS", "PASS"] as const);
  const responseCode = randHttpStatus(isErr);
  const servedBytes = isErr ? randInt(0, 2000) : randInt(10_000, 120_000_000);
  const ttfbMs = randLatencyMs(randInt(8, 200), isErr);
  const protocol = rand(["QUIC", "HTTP2", "HTTP3"] as const);
  const durationNs = ttfbMs * 1e6;
  const requestUrl = `https://stream.${project.id}.example.com${rand(["/live/seg.ts", "/vod/manifest.m3u8", "/clip.mp4"])}`;
  const remoteIp = randIp();
  const httpRequest = {
    requestMethod: "GET",
    requestUrl,
    status: responseCode,
    userAgent: rand(USER_AGENTS),
    remoteIp,
    latency: `${(ttfbMs / 1000).toFixed(6)}s`,
    protocol: protocol === "QUIC" ? "HTTP/3" : "HTTP/2",
  };
  const jsonPayload = {
    edge_cache_id: edgeLocation,
    media_cdn_service: serviceName,
    cache_status: cacheResult,
    bytes_sent: String(servedBytes),
    ttfb_ms: String(Math.round(ttfbMs)),
    protocol,
    origin: `origins-${randId(4)}.cdn.googleapis.com`,
  };
  const message = `edgecache.googleapis.com/requests ${serviceName} ${cacheResult} ${responseCode} ${requestUrl}`;

  return {
    "@timestamp": ts,
    severity: randSeverity(isErr),
    logName: gcpLogName(project.id, "requests"),
    insertId: randId(16).toLowerCase(),
    resource: {
      type: "media_cdn_service",
      labels: { project_id: project.id, service: serviceName, region: "global" },
    },
    httpRequest,
    jsonPayload,
    cloud: gcpCloud(region, project, "media-cdn"),
    gcp: {
      media_cdn: {
        http_request: httpRequest,
        json_payload: jsonPayload,
        service_name: serviceName,
        edge_location: edgeLocation,
        cache_result: cacheResult,
        response_code: responseCode,
        served_bytes: servedBytes,
        ttfb_ms: ttfbMs,
        protocol,
      },
    },
    event: eventBlock(isErr, durationNs),
    message,
  };
}

export function generateServerlessNegLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const negName = `neg-${randId(8).toLowerCase()}`;
  const backendService = `bes-${rand(["run", "fn", "gae"])}-${randId(4).toLowerCase()}`;
  const targetType = rand(["cloud-run", "cloud-functions", "app-engine"] as const);
  const healthStatus = isErr
    ? rand(["UNHEALTHY", "UNKNOWN"] as const)
    : rand(["HEALTHY", "DRAINING"] as const);
  const requestCount = isErr ? randInt(5, 500) : randInt(1000, 2_000_000);
  const errorRate = isErr ? randFloat(0.05, 0.5) : randFloat(0, 0.03);
  const durationNs = randLatencyMs(randInt(15, 250), isErr) * 1e6;
  const jsonPayload = {
    serverless_neg: `projects/${project.id}/regions/${region}/networkEndpointGroups/${negName}`,
    backend_service: `projects/${project.id}/regions/${region}/backendServices/${backendService}`,
    target_type: targetType,
    cloud_run_revision:
      targetType === "cloud-run"
        ? `projects/${project.id}/locations/${region}/services/api-${randId(4)}/revisions/api-${randId(4)}-00001-abc`
        : undefined,
    health_check: {
      state: healthStatus,
      consecutive_success: randInt(0, 50),
      consecutive_failure: isErr ? randInt(1, 10) : 0,
    },
    stats: { requests: requestCount, error_rate: Math.round(errorRate * 10_000) / 10_000 },
  };
  const message = `compute.googleapis.com/serverless_negs ${negName} health=${healthStatus}`;

  return {
    "@timestamp": ts,
    severity: isErr ? "WARNING" : "INFO",
    logName: gcpLogName(project.id, "compute.googleapis.com/serverless_neg"),
    insertId: randId(16).toLowerCase(),
    resource: {
      type: "network_endpoint_group",
      labels: { project_id: project.id, neg: negName, region },
    },
    jsonPayload,
    cloud: gcpCloud(region, project, "serverless-neg"),
    gcp: {
      serverless_neg: {
        json_payload: jsonPayload,
        neg_name: negName,
        backend_service: backendService,
        target_type: targetType,
        health_status: healthStatus,
        request_count: requestCount,
        error_rate: Math.round(errorRate * 10_000) / 10_000,
      },
    },
    event: eventBlock(isErr, durationNs),
    message,
  };
}
