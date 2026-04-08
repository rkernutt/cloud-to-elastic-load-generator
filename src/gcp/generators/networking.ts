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
  HTTP_METHODS,
  PROTOCOLS,
} from "./helpers.js";

function eventBlock(isErr: boolean, durationNs: number) {
  return {
    outcome: isErr ? ("failure" as const) : ("success" as const),
    duration: durationNs,
  };
}

export function generateVpcFlowLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const direction = rand(["ingress", "egress"] as const);
  const action = isErr ? "DENY" : rand(["ALLOW", "ALLOW", "ALLOW", "DENY"] as const);
  const protocol = rand(Object.values(PROTOCOLS));
  const srcPort = randInt(1024, 65535);
  const dstPort = rand([80, 443, 3306, 5432, 6379, 8080, 22]);
  const bytesSent = randInt(64, isErr ? 512 : 1_500_000);
  const packetsSent = Math.max(1, Math.floor(bytesSent / randInt(512, 1500)));
  const latencyNs = randLatencyMs(randInt(1, 5), isErr) * 1e6;
  const ruleName = isErr
    ? `deny-suspicious-${randId(4).toLowerCase()}`
    : `allow-internal-${randId(4).toLowerCase()}`;
  const message = isErr
    ? `VPC flow DENY ${direction} ${randIp()} -> ${randIp()}:${dstPort} matched ${ruleName}`
    : `VPC flow ${action} ${direction} ${bytesSent}b ${packetsSent}pkts proto ${protocol}`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "vpc-flow"),
    gcp: {
      vpc_flow: {
        src_ip: randIp(),
        dst_ip: randIp(),
        src_port: srcPort,
        dst_port: dstPort,
        protocol,
        bytes_sent: bytesSent,
        packets_sent: packetsSent,
        direction,
        subnet: randSubnet(region),
        vpc_name: randVpcNetwork(),
        action,
        rule_name: ruleName,
      },
    },
    event: eventBlock(isErr || action === "DENY", latencyNs),
    message,
  };
}

export function generateCloudLbLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const requestMethod = rand(HTTP_METHODS);
  const urlPath = rand(["/api/v1/orders", "/health", "/static/app.js", "/graphql", "/v2/checkout"]);
  const responseCode = randHttpStatus(isErr);
  const latencyMs = randLatencyMs(randInt(8, 120), isErr);
  const protocol = rand(["HTTP", "HTTPS", "HTTP2"] as const);
  const message = isErr
    ? `HTTP(S) LB ${requestMethod} ${urlPath} failed ${responseCode} from ${randIp()} — backend timeout`
    : `HTTP(S) LB ${requestMethod} ${urlPath} ${responseCode} ${latencyMs.toFixed(1)}ms ${protocol}`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "cloud-lb"),
    gcp: {
      cloud_lb: {
        backend_service: `bes-${rand(["api", "web", "grpc"])}-${randId(4).toLowerCase()}`,
        url_map: `um-${randId(6).toLowerCase()}`,
        forwarding_rule: `fr-${region}-${randId(4).toLowerCase()}`,
        request_method: requestMethod,
        url_path: urlPath,
        response_code: responseCode,
        latency_ms: latencyMs,
        client_ip: randIp(),
        backend_ip: randIp(),
        protocol,
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
  const cacheHit = !isErr && Math.random() > 0.35;
  const responseCode = randHttpStatus(isErr);
  const servedBytes = randInt(1024, 8_000_000);
  const originLatencyMs = cacheHit ? randInt(0, 5) : randLatencyMs(randInt(20, 200), isErr);
  const ttlSeconds = cacheHit ? randInt(60, 86400) : 0;
  const message = isErr
    ? `Cloud CDN MISS origin error ${responseCode} for ${urlPath} — upstream refused connection`
    : `Cloud CDN ${cacheHit ? "HIT" : "MISS"} ${servedBytes}B ${responseCode} ttl=${ttlSeconds}s`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "cloud-cdn"),
    gcp: {
      cloud_cdn: {
        cache_hit: cacheHit,
        cache_id: `edge-${randId(8).toLowerCase()}`,
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
  const message = isErr
    ? `Cloud DNS ${queryType} query for ${queryName} -> ${responseCode} from ${randIp()}`
    : `Cloud DNS resolved ${queryName} ${queryType} ${dnsProto} ${responseCode}`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "cloud-dns"),
    gcp: {
      cloud_dns: {
        query_name: queryName,
        query_type: queryType,
        response_code: responseCode,
        source_ip: randIp(),
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
  const action = isErr
    ? rand(["DENY", "REDIRECT", "THROTTLE"] as const)
    : rand(["ALLOW", "ALLOW", "THROTTLE"] as const);
  const priority = randInt(100, 9000);
  const previewMode = Math.random() > 0.85;
  const matchedExpr = isErr
    ? `evaluatePreconfiguredExpr('xss-v33-stable')`
    : `inIpRange(origin.ip, '${randIp()}/32')`;
  const policyName = `armor-${rand(["edge", "api", "corp"])}-${randId(4).toLowerCase()}`;
  const ruleName = isErr
    ? `block-tor-${randId(4).toLowerCase()}`
    : `allow-corp-${randId(4).toLowerCase()}`;
  const durationNs = randLatencyMs(randInt(1, 12), false) * 1e6;
  const message = previewMode
    ? `Cloud Armor [preview] would ${action} ${randIp()} — ${ruleName}`
    : isErr
      ? `Cloud Armor ${action} ${randIp()} priority ${priority} matched ${matchedExpr}`
      : `Cloud Armor ${action} request from ${randIp()} policy ${policyName}`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "cloud-armor"),
    gcp: {
      cloud_armor: {
        policy_name: policyName,
        rule_name: ruleName,
        action,
        priority,
        source_ip: randIp(),
        matched_expression: matchedExpr,
        preview_mode: previewMode,
      },
    },
    event: eventBlock(isErr && !previewMode, durationNs),
    message,
  };
}

export function generateCloudNatLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const gatewayName = `nat-gw-${randId(5).toLowerCase()}`;
  const natIp = randIp();
  const vmInstance = `vm-${rand(["app", "batch"])}-${randId(4).toLowerCase()}`;
  const protocol = rand(Object.values(PROTOCOLS));
  const endpointType = rand(["ENDPOINT_TYPE_VM", "ENDPOINT_TYPE_SERVERLESS"] as const);
  const allocatedPorts = randInt(32, 2048);
  const packetsDropped = isErr ? randInt(10, 500_000) : randInt(0, 3);
  const durationNs = randLatencyMs(randInt(1, 8), isErr) * 1e6;
  const message = isErr
    ? `Cloud NAT ${gatewayName} dropped ${packetsDropped} packets for ${vmInstance} — port exhaustion`
    : `Cloud NAT ${gatewayName} SNAT ${protocol} ${vmInstance} ports=${allocatedPorts}`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "cloud-nat"),
    gcp: {
      cloud_nat: {
        gateway_name: gatewayName,
        nat_ip: natIp,
        vm_instance: vmInstance,
        protocol,
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
  const ikeVersion = rand(["ikev1", "ikev2"] as const);
  const receivedBytes = isErr ? randInt(0, 5000) : randInt(50_000, 500_000_000);
  const sentBytes = isErr ? randInt(0, 5000) : randInt(50_000, 500_000_000);
  const durationNs = randLatencyMs(randInt(50, 500), isErr) * 1e6;
  const message = isErr
    ? `Cloud VPN ${tunnelName} ${status} peer ${randIp()} — IKE ${ikeVersion} handshake failed`
    : `Cloud VPN ${tunnelName} ESTABLISHED rx=${receivedBytes} tx=${sentBytes}`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "cloud-vpn"),
    gcp: {
      cloud_vpn: {
        tunnel_name: tunnelName,
        gateway_name: gatewayName,
        peer_ip: randIp(),
        local_ip: randIp(),
        status,
        ike_version: ikeVersion,
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
  const message = isErr
    ? `Interconnect ${interconnectName} operational ${operationalStatus} — carrier circuit flap on ${attachmentName}`
    : `Interconnect ${interconnectName} ${icType} ${bandwidthGbps}Gbps ${operationalStatus} circuits=${circuitsCount}`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "cloud-interconnect"),
    gcp: {
      cloud_interconnect: {
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
  const bgpPeer = `peer-${randIp()}`;
  const message = isErr
    ? `Cloud Router ${routerName} BGP ${bgpPeer} DOWN — hold timer expired ASN ${peerAsn}`
    : `Cloud Router ${routerName} BGP ${bgpPeer} UP adv=${advertisedRoutes} recv=${receivedRoutes}`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "cloud-router"),
    gcp: {
      cloud_router: {
        router_name: routerName,
        bgp_peer: bgpPeer,
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
  const message = isErr
    ? `Traffic Director ${serviceName} error_rate=${(errorRate * 100).toFixed(2)}% backends ${healthStatus}`
    : `Traffic Director ${meshName} ${serviceName} rq=${requestCount} err=${(errorRate * 100).toFixed(3)}%`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "traffic-director"),
    gcp: {
      traffic_director: {
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
  const serviceAttachment = `projects/p-${randId(4)}/regions/${region}/serviceAttachments/sa-${randId(4).toLowerCase()}`;
  const forwardingRule = `psc-fr-${randId(4).toLowerCase()}`;
  const message = isErr
    ? `Private Service Connect ${endpointName} ${connectionStatus} — consumer policy blocked attachment`
    : `Private Service Connect ${endpointName} ACCEPTED via ${forwardingRule}`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "private-service-connect"),
    gcp: {
      private_service_connect: {
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
  const message = isErr
    ? `NCC hub ${hubName} spoke ${spokeName} ${status} — ${spokeType} tunnel flap`
    : `NCC hub ${hubName} linked spoke ${spokeName} (${spokeType}) ${status}`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "network-connectivity-center"),
    gcp: {
      network_connectivity_center: {
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
  const message = isErr
    ? `NIC connectivity test ${testName} ${src} -> ${dst} ${result} after ${packetTraceHops} hops — ACL drop`
    : `NIC connectivity test ${testName} ${src} -> ${dst} REACHABLE ttl_hops=${packetTraceHops}`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "network-intelligence-center"),
    gcp: {
      network_intelligence_center: {
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
  const severity = rand(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const);
  const category = rand(["TROJAN", "EXPLOIT", "MALWARE", "COMMAND_AND_CONTROL"] as const);
  const srcIp = randIp();
  const dstIp = randIp();
  const protocol = rand(Object.values(PROTOCOLS));
  const action = isErr ? rand(["ALERT", "DENY"] as const) : rand(["ALERT", "DENY"] as const);
  const durationNs = randLatencyMs(randInt(5, 80), isErr) * 1e6;
  const message = isErr
    ? `Cloud IDS ${endpointName}: ${severity} ${category} ${srcIp} -> ${dstIp} ${protocol} ${action} — inspection error`
    : `Cloud IDS ${endpointName}: detected ${category} (${severity}) ${srcIp} -> ${dstIp} ${action}`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "cloud-ids"),
    gcp: {
      cloud_ids: {
        endpoint_name: endpointName,
        threat_id: threatId,
        severity: isErr ? "HIGH" : severity,
        category,
        source_ip: srcIp,
        dest_ip: dstIp,
        protocol,
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
  const collectorInstance = `mirror-collector-${randId(6).toLowerCase()}`;
  const mirroredInstancesCount = isErr ? randInt(0, 2) : randInt(3, 120);
  const filterProtocol = rand(["tcp", "udp", "icmp", "all"]);
  const filterCidr = `10.${randInt(0, 255)}.${randInt(0, 255)}.0/24`;
  const durationNs = randLatencyMs(randInt(10, 200), isErr) * 1e6;
  const message = isErr
    ? `Packet mirroring ${policyName} on ${mirroredNetwork}: collector ${collectorInstance} unhealthy`
    : `Packet mirroring ${policyName} mirroring ${mirroredInstancesCount} instances to ${collectorInstance} (${filterProtocol}, ${filterCidr})`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "packet-mirroring"),
    gcp: {
      packet_mirroring: {
        policy_name: policyName,
        mirrored_network: mirroredNetwork,
        collector_instance: collectorInstance,
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
  const message = isErr
    ? `Network Service Tiers ${tier} ${resourceType} in ${region}: routing anomaly (${routingType})`
    : `Network Service Tiers ${tier} egress ${egressBytes}B for ${resourceType} (${routingType})`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "network-service-tiers"),
    gcp: {
      network_service_tiers: {
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
  const message = isErr
    ? `Cloud Domains ${action} failed for ${domainName}: ${registrarStatus}`
    : `Cloud Domains ${action} ${domainName} expires ${expirationDate} dnssec=${dnssecEnabled}`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "cloud-domains"),
    gcp: {
      cloud_domains: {
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
  const message = isErr
    ? `Media CDN ${serviceName} ${edgeLocation} ${cacheResult} HTTP ${responseCode} ttfb=${ttfbMs.toFixed(1)}ms`
    : `Media CDN ${serviceName} ${cacheResult} ${servedBytes}B ${protocol} ${responseCode} ttfb=${ttfbMs.toFixed(1)}ms`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "media-cdn"),
    gcp: {
      media_cdn: {
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
  const message = isErr
    ? `Serverless NEG ${negName} -> ${backendService} (${targetType}) unhealthy err=${(errorRate * 100).toFixed(2)}%`
    : `Serverless NEG ${negName} health=${healthStatus} requests=${requestCount} err=${(errorRate * 100).toFixed(3)}%`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "serverless-neg"),
    gcp: {
      serverless_neg: {
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
