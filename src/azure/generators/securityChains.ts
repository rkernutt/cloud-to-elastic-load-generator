/**
 * Multi-document security / attack-pattern generators for Azure (Defender, Sentinel, Activity Log).
 */
import {
  type EcsDocument,
  rand,
  randInt,
  randId,
  randIp,
  azureCloud,
  makeAzureSetup,
} from "./helpers.js";

/** Microsoft Defender for Cloud alert → Sentinel incident → Activity Log correlation */
export function generateAzureSecurityFindingChain(ts: string, _er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = makeAzureSetup(0);
  const alertId = randId(10).toLowerCase();
  const incidentId = randId(8).toUpperCase();
  const workspace = `law-${randId(6)}`;
  const srcIp = randIp();
  const tactic = rand(["InitialAccess", "Execution", "CredentialAccess"] as const);

  const defender: EcsDocument = {
    "@timestamp": ts,
    __dataset: "azure.defender",
    cloud: azureCloud(region, subscription, "Microsoft.Security/alerts"),
    azure: {
      defender: {
        alert_id: alertId,
        alert_name: `Suspicious ${tactic} activity detected`,
        severity: "High",
        status: "Active",
        resource_group: resourceGroup,
        remediation_steps: "Isolate VM and revoke sessions",
        intent: "LateralMovement",
        compromised_entity: `vm-${randId(4)}`,
        source_ip: srcIp,
      },
    },
    source: { ip: srcIp },
    event: { kind: "alert", category: ["intrusion_detection"], outcome: "failure" },
    message: `Defender for Cloud: alert ${alertId} (${tactic})`,
    log: { level: "error" },
  };

  const sentinel: EcsDocument = {
    "@timestamp": ts,
    __dataset: "azure.sentinel",
    cloud: azureCloud(region, subscription, "Microsoft.OperationalInsights/workspaces"),
    azure: {
      sentinel: {
        incident_id: incidentId,
        incident_name: `Defender correlation — ${alertId}`,
        severity: "High",
        status: "Active",
        workspace,
        tactics: [tactic],
        related_alert_ids: [alertId],
        owner: "soc-tier1",
        product_name: "Microsoft Sentinel",
      },
    },
    source: { ip: srcIp },
    event: { kind: "alert", outcome: "failure" },
    message: `Sentinel incident ${incidentId} created from Defender ${alertId}`,
    log: { level: "error" },
  };

  const activity: EcsDocument = {
    "@timestamp": ts,
    __dataset: "azure.activity_log",
    cloud: azureCloud(region, subscription, "Microsoft.Resources/subscriptions"),
    azure: {
      activity_log: {
        resource_group: resourceGroup,
        resource_name: workspace,
        resource_id: `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.OperationalInsights/workspaces/${workspace}`,
        operation_name: "Microsoft.SecurityInsights/incidents/write",
        status: "Succeeded",
        correlation_id: randId(16).toLowerCase(),
        http_status: 201,
        duration_ms: randInt(120, 900),
        incident_id: incidentId,
        defender_alert_id: alertId,
      },
    },
    event: { outcome: "success", duration: randInt(5e5, 2e6) },
    message: `Activity Log: Sentinel incident ${incidentId} materialized (Defender ${alertId})`,
  };

  return [defender, sentinel, activity];
}

const CIS_AZURE_RULES = [
  {
    section: "2.1.1",
    id: "cis_az_2_1_1",
    name: "Ensure MFA is enabled for privileged accounts",
    resource_type: "cloud-identity-management",
    sub_type: "entra-user",
    severity: "critical",
    tags: ["Identity"],
  },
  {
    section: "3.1",
    id: "cis_az_3_1",
    name: "Ensure storage accounts disallow public access",
    resource_type: "object-storage",
    sub_type: "storage-account",
    severity: "high",
    tags: ["Storage"],
  },
  {
    section: "6.1",
    id: "cis_az_6_1",
    name: "Ensure Azure Defender is enabled for servers",
    resource_type: "security-saas",
    sub_type: "defender-plan",
    severity: "high",
    tags: ["Defender"],
  },
] as const;

export function generateAzureCspmFindings(ts: string, er: number): EcsDocument[] {
  const { region, subscription } = makeAzureSetup(er);
  const rule = rand([...CIS_AZURE_RULES]);
  const isFailed = Math.random() < er + 0.22;
  const evaluation = isFailed ? "failed" : "passed";
  const resourceId = `/subscriptions/${subscription.id}/resourceGroups/rg-security/providers/Microsoft.${rule.sub_type === "storage-account" ? "Storage/storageAccounts" : "Authorization"}/res-${randId(6)}`;
  return [
    {
      "@timestamp": ts,
      __dataset: "cloud_security_posture.findings",
      data_stream: {
        dataset: "cloud_security_posture.findings",
        namespace: "default",
        type: "logs",
      },
      cloud: {
        provider: "azure",
        region,
        account: { id: subscription.id, name: subscription.name },
      },
      resource: {
        id: resourceId,
        name: resourceId.split("/").pop(),
        sub_type: rule.sub_type,
        type: rule.resource_type,
      },
      rule: {
        id: rule.id,
        name: rule.name,
        section: rule.section,
        tags: [...rule.tags],
        benchmark: {
          id: "cis_azure",
          version: "v2.0.0",
          rule_number: rule.section,
          posture_type: "cspm",
        },
        impact: isFailed
          ? `CIS Azure ${rule.section} increases exposure in ${subscription.name}.`
          : null,
        remediation: isFailed
          ? `Remediate per CIS Microsoft Azure Foundations Benchmark ${rule.section}.`
          : null,
      },
      result: { evaluation },
      severity: isFailed ? rule.severity : "none",
      event: {
        kind: "state",
        category: ["configuration"],
        type: ["info"],
        outcome: isFailed ? "failure" : "success",
        dataset: "cloud_security_posture.findings",
        provider: "elastic_cspm",
      },
      message: `CSPM [CIS Azure / ${rule.section}] ${evaluation}: ${rule.name}`,
      log: { level: isFailed ? (rule.severity === "critical" ? "error" : "warn") : "info" },
    },
  ];
}

const CIS_AKS_AZURE_RULES = [
  {
    section: "4.1.2",
    id: "cis_aks_az_4_1_2",
    name: "Ensure private clusters are used where possible",
    sub_type: "managed-cluster",
    severity: "high",
    tags: ["AKS"],
  },
  {
    section: "4.2.3",
    id: "cis_aks_az_4_2_3",
    name: "Ensure cluster-admin role is not widely assigned",
    sub_type: "rbac-binding",
    severity: "critical",
    tags: ["RBAC"],
  },
] as const;

export function generateAzureKspmFindings(ts: string, er: number): EcsDocument[] {
  const { region, subscription } = makeAzureSetup(er);
  const cluster = `aks-${rand(["prod", "data", "shared"])}-${randId(4)}`;
  const rule = rand([...CIS_AKS_AZURE_RULES]);
  const isFailed = Math.random() < er + 0.2;
  const evaluation = isFailed ? "failed" : "passed";
  return [
    {
      "@timestamp": ts,
      __dataset: "cloud_security_posture.findings",
      data_stream: {
        dataset: "cloud_security_posture.findings",
        namespace: "default",
        type: "logs",
      },
      cloud: {
        provider: "azure",
        region,
        account: { id: subscription.id, name: subscription.name },
      },
      orchestrator: { cluster: { name: cluster } },
      resource: {
        id: `/subscriptions/${subscription.id}/resourceGroups/rg-aks/providers/Microsoft.ContainerService/managedClusters/${cluster}`,
        name: cluster,
        sub_type: rule.sub_type,
        type: "k8s_object",
      },
      rule: {
        id: rule.id,
        name: rule.name,
        section: rule.section,
        tags: [...rule.tags],
        benchmark: {
          id: "cis_aks",
          version: "v1.3.0",
          rule_number: rule.section,
          posture_type: "kspm",
        },
        impact: isFailed ? `AKS CIS ${rule.section} gap on ${cluster}.` : null,
        remediation: isFailed ? `Harden ${cluster} per CIS AKS Benchmark ${rule.section}.` : null,
      },
      result: { evaluation },
      severity: isFailed ? rule.severity : "none",
      event: {
        kind: "state",
        category: ["configuration"],
        type: ["info"],
        outcome: isFailed ? "failure" : "success",
        dataset: "cloud_security_posture.findings",
        provider: "elastic_kspm",
      },
      message: `KSPM [CIS AKS / ${rule.section}] ${evaluation}: ${rule.name} [${cluster}]`,
      log: { level: isFailed ? (rule.severity === "critical" ? "error" : "warn") : "info" },
    },
  ];
}

/** Entra risky sign-in → role assignment → ARM token minting */
export function generateAzureIamPrivEscChain(ts: string, _er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = makeAzureSetup(0);
  const user = `attacker${randInt(100, 999)}@contoso.com`;
  const roleId = randId(8).toLowerCase();

  const entra: EcsDocument = {
    "@timestamp": ts,
    __dataset: "azure.entra_id",
    cloud: azureCloud(region, subscription, "Microsoft.Authorization"),
    azure: {
      entra_id: {
        category: "RiskDetection",
        user,
        app_id: randId(8).toLowerCase(),
        ip_address: randIp(),
        result: "Success",
        conditional_access: "Failure",
        risk_level: "high",
        detection_type: "unfamiliarFeatures",
      },
    },
    event: { outcome: "success", duration: randInt(5e5, 2e6) },
    message: `Entra [PrivEsc 1/3]: risky sign-in for ${user}`,
    log: { level: "warn" },
  };

  const roleAssign: EcsDocument = {
    "@timestamp": ts,
    __dataset: "azure.activity_log",
    cloud: azureCloud(region, subscription, "Microsoft.Authorization"),
    azure: {
      activity_log: {
        resource_group: resourceGroup,
        resource_name: "role-assignments",
        resource_id: `/subscriptions/${subscription.id}/providers/Microsoft.Authorization/roleAssignments/${roleId}`,
        operation_name: "Microsoft.Authorization/roleAssignments/write",
        status: "Succeeded",
        correlation_id: randId(16).toLowerCase(),
        http_status: 201,
        duration_ms: randInt(80, 400),
        principal_id: user,
        role_definition: "Owner",
      },
    },
    event: { outcome: "success", duration: randInt(5e5, 1e6) },
    message: `Activity Log [PrivEsc 2/3]: Owner assigned to ${user}`,
    log: { level: "warn" },
  };

  const arm: EcsDocument = {
    "@timestamp": ts,
    __dataset: "azure.activity_log",
    cloud: azureCloud(region, subscription, "Microsoft.Resources/subscriptions"),
    azure: {
      activity_log: {
        resource_group: resourceGroup,
        resource_name: subscription.name,
        resource_id: `/subscriptions/${subscription.id}`,
        operation_name: "Microsoft.Resources/subscriptions/resourcegroups/read",
        status: "Succeeded",
        correlation_id: randId(16).toLowerCase(),
        http_status: 200,
        duration_ms: randInt(40, 200),
        caller: user,
        claims_token_minted: true,
      },
    },
    event: { outcome: "success", duration: randInt(3e5, 8e5) },
    message: `Activity Log [PrivEsc 3/3]: subscription enumeration with elevated ARM token`,
    log: { level: "error" },
    error: {
      code: "PrivilegeEscalation",
      message: `Azure identity chain completed for ${user}`,
      type: "security",
    },
  };

  return [entra, roleAssign, arm];
}

/** Defender storage exfiltration → blob read burst → NSG deny storm */
export function generateAzureDataExfilChain(ts: string, _er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = makeAzureSetup(0);
  const account = `st${randId(10).toLowerCase()}`;
  const srcIp = randIp();

  const defender: EcsDocument = {
    "@timestamp": ts,
    __dataset: "azure.defender",
    cloud: azureCloud(region, subscription, "Microsoft.Security/alerts"),
    azure: {
      defender: {
        alert_id: randId(10).toLowerCase(),
        alert_name: "Unusual volume of data extracted from storage account",
        severity: "High",
        status: "Active",
        resource_group: resourceGroup,
        compromised_entity: account,
        source_ip: srcIp,
        intent: "Exfiltration",
      },
    },
    source: { ip: srcIp },
    event: { kind: "alert", outcome: "failure" },
    message: `Defender: possible data exfiltration from ${account}`,
    log: { level: "error" },
  };

  const blob: EcsDocument = {
    "@timestamp": ts,
    __dataset: "azure.blob_storage",
    cloud: azureCloud(region, subscription, "Microsoft.Storage/storageAccounts"),
    azure: {
      blob_storage: {
        resource_group: resourceGroup,
        resource_name: account,
        resource_id: `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Storage/storageAccounts/${account}`,
        operation_name: "Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read",
        status: "Succeeded",
        correlation_id: randId(16).toLowerCase(),
        http_status: 206,
        duration_ms: randInt(200, 2000),
        bytes_out: randInt(80_000_000, 600_000_000),
        client_ip: srcIp,
      },
    },
    event: { outcome: "success", duration: randInt(1e6, 5e6) },
    message: `Blob Storage: high-volume reads from ${account} by ${srcIp}`,
    log: { level: "warn" },
  };

  const nsg: EcsDocument = {
    "@timestamp": ts,
    __dataset: "azure.network_security_groups",
    cloud: azureCloud(region, subscription, "Microsoft.Network/networkSecurityGroups"),
    azure: {
      network_security_groups: {
        resource_group: resourceGroup,
        resource_name: `nsg-data-${randId(4)}`,
        resource_id: `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/networkSecurityGroups/nsg-data`,
        operation_name: "securityRuleHit",
        status: "Failed",
        correlation_id: randId(16).toLowerCase(),
        http_status: 403,
        duration_ms: randInt(2, 40),
        rule_name: "DenyHighEgress",
        source_ip: srcIp,
        direction: "Outbound",
      },
    },
    event: { outcome: "failure", duration: randInt(1e5, 5e5) },
    message: `NSG: deny egress matched for ${srcIp} after blob burst`,
    log: { level: "error" },
    error: {
      code: "DataExfiltration",
      message: `Correlated Defender + Blob + NSG for ${account}`,
      type: "security",
    },
  };

  return [defender, blob, nsg];
}
