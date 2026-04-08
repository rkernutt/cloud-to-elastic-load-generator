import { type EcsDocument, rand, randInt, randId, randIp, azureCloud, makeAzureSetup } from "./helpers.js";

export function generateVirtualNetworkLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const vnet = `vnet-${randId(4).toLowerCase()}`;
  return {
    "@timestamp": ts,
    cloud: azureCloud(region, subscription, "Microsoft.Network/virtualNetworks"),
    azure: {
      virtual_network: {
        name: vnet,
        resource_group: resourceGroup,
        subnet: `snet-${rand(["app", "data", "edge"])}`,
        operation: isErr ? "subnet-delete-failed" : rand(["subnet-create", "peering-update", "route-change"]),
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e8, 3e9) },
    message: isErr ? `VNet ${vnet}: subnet operation failed` : `VNet ${vnet}: networking updated`,
  };
}

export function generateLoadBalancerLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const lb = `lb-${randId(5).toLowerCase()}`;
  return {
    "@timestamp": ts,
    cloud: azureCloud(region, subscription, "Microsoft.Network/loadBalancers"),
    azure: {
      load_balancer: {
        name: lb,
        resource_group: resourceGroup,
        sku: rand(["Standard", "Gateway"]),
        backend_health: isErr ? "Unhealthy" : "Healthy",
        bytes_in: randInt(1_000_000, 500_000_000),
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e7, 2e8) },
    message: isErr
      ? `LB ${lb}: probe failure on backend pool`
      : `LB ${lb}: traffic distributed`,
  };
}

export function generateApplicationGatewayLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const agw = `agw-${randId(4).toLowerCase()}`;
  const status = isErr ? rand([502, 503, 504]) : rand([200, 201, 204]);
  return {
    "@timestamp": ts,
    cloud: azureCloud(region, subscription, "Microsoft.Network/applicationGateways"),
    azure: {
      application_gateway: {
        name: agw,
        resource_group: resourceGroup,
        backend_host: rand(["api.internal", "web.internal"]),
        http_status: status,
        latency_ms: randInt(isErr ? 2000 : 20, isErr ? 30_000 : 400),
        rule: `rule-${randId(3)}`,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(5e6, 5e8) },
    message: isErr
      ? `App Gateway ${agw}: HTTP ${status} from backend`
      : `App Gateway ${agw}: request served`,
  };
}

export function generateAzureFirewallLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const fw = `afw-${randId(4).toLowerCase()}`;
  const action = isErr ? "Deny" : rand(["Allow", "Allow", "Deny"]);
  return {
    "@timestamp": ts,
    cloud: azureCloud(region, subscription, "Microsoft.Network/azureFirewalls"),
    azure: {
      firewall: {
        name: fw,
        resource_group: resourceGroup,
        source_ip: randIp(),
        dest_ip: randIp(),
        dest_port: randInt(80, 443),
        action,
        rule_collection: `RC-${randId(3)}`,
      },
    },
    event: { outcome: action === "Deny" ? "failure" : "success", duration: randInt(1e6, 8e7) },
    message: `${action} ${fw}: ${randIp()} → ${randIp()}:${randInt(80, 443)}`,
  };
}
