import {
  type EcsDocument,
  rand,
  randInt,
  randId,
  HTTP_METHODS,
  HTTP_PATHS,
  azureCloud,
  makeAzureSetup,
} from "./helpers.js";

export function generateAppServiceLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const app = `app-${rand(["api", "web", "admin"])}-${randId(4).toLowerCase()}`;
  const method = rand(HTTP_METHODS);
  const path = rand(HTTP_PATHS);
  const sc = isErr ? rand([500, 502, 503]) : 200;
  return {
    "@timestamp": ts,
    cloud: azureCloud(region, subscription, "Microsoft.Web/sites"),
    azure: {
      app_service: {
        app_name: app,
        resource_group: resourceGroup,
        host: `${app}.azurewebsites.net`,
        request_method: method,
        url_path: path,
        status_code: sc,
        latency_ms: randInt(isErr ? 200 : 8, isErr ? 30_000 : 400),
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e6, 1e9) },
    message: isErr
      ? `App Service ${app}: ${method} ${path} → ${sc}`
      : `App Service ${app}: served ${method} ${path}`,
  };
}

export function generateFunctionsLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const fn = `func-${rand(["http", "timer", "queue"])}-${randId(4).toLowerCase()}`;
  return {
    "@timestamp": ts,
    cloud: azureCloud(region, subscription, "Microsoft.Web/sites"),
    azure: {
      functions: {
        function_name: fn,
        resource_group: resourceGroup,
        trigger: rand(["httpTrigger", "timerTrigger", "serviceBusTrigger"]),
        invocation_id: randId(16).toLowerCase(),
        memory_mb: rand([128, 256, 512, 1536]),
        duration_ms: randInt(5, isErr ? 10 * 60 * 1000 : 8000),
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e6, 9e9) },
    message: isErr
      ? `Function ${fn}: uncaught exception`
      : `Function ${fn}: completed`,
  };
}

export function generateServiceBusLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const ns = `sb-${randId(6).toLowerCase()}.servicebus.windows.net`;
  const ent = rand(["orders", "events", "audit"]);
  return {
    "@timestamp": ts,
    cloud: azureCloud(region, subscription, "Microsoft.ServiceBus/namespaces"),
    azure: {
      service_bus: {
        namespace: ns,
        resource_group: resourceGroup,
        entity: ent,
        operation: rand(["Send", "Receive", "Complete", "Abandon"]),
        delivery_count: isErr ? randInt(5, 50) : randInt(0, 3),
        dead_letter: isErr && Math.random() > 0.4,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e6, 5e8) },
    message: isErr
      ? `Service Bus ${ns}/${ent}: message moved to DLQ`
      : `Service Bus ${ns}: message processed`,
  };
}

export function generateEventHubsLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const hub = `evh-${randId(5).toLowerCase()}`;
  const partition = `partition-${randInt(0, 31)}`;
  return {
    "@timestamp": ts,
    cloud: azureCloud(region, subscription, "Microsoft.EventHub/namespaces"),
    azure: {
      event_hubs: {
        namespace: `${hub}.servicebus.windows.net`,
        resource_group: resourceGroup,
        eventhub: rand(["telemetry", "clicks", "logs"]),
        partition,
        incoming_bytes: isErr ? randInt(0, 1000) : randInt(50_000, 80_000_000),
        server_busy: isErr,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(5e5, 4e8) },
    message: isErr ? `Event Hubs ${hub}: throttling on ${partition}` : `Event Hubs ${hub}: ingress OK`,
  };
}

export function generateKeyVaultLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const vault = `kv-${randId(8).toLowerCase()}`;
  return {
    "@timestamp": ts,
    cloud: azureCloud(region, subscription, "Microsoft.KeyVault/vaults"),
    azure: {
      key_vault: {
        vault_name: vault,
        resource_group: resourceGroup,
        operation: rand(["SecretGet", "KeySign", "CertificateGet"]),
        result: isErr ? "Forbidden" : "Success",
        caller_ip: `203.0.113.${randInt(1, 200)}`,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(5e5, 4e7) },
    message: isErr ? `KeyVault ${vault}: access denied` : `KeyVault ${vault}: secret retrieved`,
  };
}

export function generateEntraIdLog(ts: string, er: number): EcsDocument {
  const { region, subscription, isErr } = makeAzureSetup(er);
  const user = `user${randInt(1000, 9999)}@${rand(["contoso", "fabrikam"])}.com`;
  return {
    "@timestamp": ts,
    cloud: azureCloud(region, subscription, "Microsoft.Authorization"),
    azure: {
      entra_id: {
        category: rand(["SignIn", "AuditLog", "RiskDetection"]),
        user,
        app_id: randId(8).toLowerCase(),
        ip_address: `198.51.100.${randInt(2, 250)}`,
        result: isErr ? rand(["Failure", "Interrupted"]) : "Success",
        conditional_access: rand(["Success", "Failure", "Not applied"]),
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(5e5, 2e8) },
    message: isErr ? `Entra sign-in failed for ${user}` : `Entra audit: user ${user}`,
  };
}
