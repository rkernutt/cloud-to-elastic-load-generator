/**
 * Multi-document security / attack-pattern generators for Azure (Defender, Sentinel, Activity Log).
 */
import { offsetTs } from "../../aws/generators/traces/helpers.js";
import {
  type CisBenchmarkRule,
  CIS_AZURE_RULES,
  CIS_K8S_RULES,
} from "../../data/cisBenchmarkRules.js";
import type { CspFindingResource } from "../../data/cspFindingsHelpers.js";
import { buildCspFinding, pick, randBetween, randHex } from "../../data/cspFindingsHelpers.js";
import {
  type EcsDocument,
  rand,
  randInt,
  randId,
  randIp,
  randUUID,
  azureCloud,
  makeAzureSetup,
} from "./helpers.js";

const DEFENDER_ALERT_TYPES = [
  "VM_EXECUTION_RUN_COMMAND",
  "SQL_ANOMALOUS_QUERY",
  "CONTAINER_SUSPICIOUS_IMAGE",
  "APP_SERVICES_SSH_BRUTEFORCE",
  "KUBERNETES_PRIVILEGED_CONTAINER",
  "STORAGE_SAS_ANOMALY",
] as const;

const MITRE_INTENTS = [
  "Execution",
  "CredentialAccess",
  "LateralMovement",
  "InitialAccess",
  "DefenseEvasion",
] as const;

/** Defender for Cloud → Sentinel incident → Activity Log (incident write) */
export function generateAzureSecurityFindingChain(ts: string, _er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = makeAzureSetup(0);
  const baseDate = new Date(ts);
  const findingChainId = randUUID();
  const alertId = randUUID();
  const incidentId = randUUID();
  const workspace = `law-${randId(6)}`;
  const srcIp = randIp();
  const tactic = rand([...MITRE_INTENTS]);
  const alertType = rand([...DEFENDER_ALERT_TYPES]);
  const severity = rand(["High", "Medium", "Low"] as const);
  const compromised = `vm-${resourceGroup.slice(0, 8)}-${randId(4)}`;

  const chainLabels = {
    finding_chain_id: findingChainId,
    subscription_id: subscription.id,
    resource_group: resourceGroup,
    alert_id: alertId,
    incident_id: incidentId,
  };

  const sentinelTs = offsetTs(baseDate, 2 * 60_000);
  const activityTs = offsetTs(baseDate, 5 * 60_000);

  const defender: EcsDocument = {
    "@timestamp": ts,
    __dataset: "azure.defender",
    labels: chainLabels,
    cloud: azureCloud(region, subscription, "Microsoft.Security/alerts"),
    azure: {
      defender: {
        alert_id: alertId,
        alert_type: alertType,
        alert_name: `Defender: ${alertType.replace(/_/g, " ")} on ${compromised}`,
        severity,
        status: "Active",
        resource_group: resourceGroup,
        remediation_steps: "Isolate affected resources, revoke tokens, review IAM assignments",
        intent: tactic,
        compromised_entity: compromised,
        source_ip: srcIp,
      },
    },
    source: { ip: srcIp },
    event: { kind: "alert", category: ["intrusion_detection"], outcome: "failure" },
    message: `Defender for Cloud: alert ${alertId} (${alertType})`,
    log: { level: "error" },
  };

  const sentinel: EcsDocument = {
    "@timestamp": sentinelTs,
    __dataset: "azure.sentinel",
    labels: chainLabels,
    cloud: azureCloud(region, subscription, "Microsoft.OperationalInsights/workspaces"),
    azure: {
      sentinel: {
        incident_id: incidentId,
        title: `Correlated: ${alertType} — ${compromised}`,
        incident_name: `Defender correlation — ${alertId}`,
        severity,
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
    "@timestamp": activityTs,
    __dataset: "azure.activity_log",
    labels: chainLabels,
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
        claims: {
          appid: "00000003-0000-0000-c000-000000000000",
          aud: "https://management.azure.com/",
          "http://schemas.microsoft.com/identity/claims/objectidentifier": randUUID(),
          ipaddr: srcIp,
          name: "sentinel-incident-writer@contoso.com",
        },
      },
    },
    event: { outcome: "success", duration: randInt(5e5, 2e6) },
    message: `Activity Log: Sentinel incident ${incidentId} materialized (Defender ${alertId})`,
  };

  return [defender, sentinel, activity];
}

function armStorageAccount(subId: string, rg: string, name: string): string {
  return `/subscriptions/${subId}/resourceGroups/${rg}/providers/Microsoft.Storage/storageAccounts/${name}`;
}

function armSqlServer(subId: string, rg: string, name: string): string {
  return `/subscriptions/${subId}/resourceGroups/${rg}/providers/Microsoft.Sql/servers/${name}`;
}

function armVm(subId: string, rg: string, name: string): string {
  return `/subscriptions/${subId}/resourceGroups/${rg}/providers/Microsoft.Compute/virtualMachines/${name}`;
}

function armKeyVault(subId: string, rg: string, name: string): string {
  return `/subscriptions/${subId}/resourceGroups/${rg}/providers/Microsoft.KeyVault/vaults/${name}`;
}

function armNsg(subId: string, rg: string, name: string): string {
  return `/subscriptions/${subId}/resourceGroups/${rg}/providers/Microsoft.Network/networkSecurityGroups/${name}`;
}

function armAksCluster(subId: string, rg: string, name: string): string {
  return `/subscriptions/${subId}/resourceGroups/${rg}/providers/Microsoft.ContainerService/managedClusters/${name}`;
}

function armAppService(subId: string, rg: string, siteName: string): string {
  return `/subscriptions/${subId}/resourceGroups/${rg}/providers/Microsoft.Web/sites/${siteName}`;
}

function armCosmosDb(subId: string, rg: string, name: string): string {
  return `/subscriptions/${subId}/resourceGroups/${rg}/providers/Microsoft.DocumentDB/databaseAccounts/${name}`;
}

function armPostgresServer(subId: string, rg: string, name: string): string {
  return `/subscriptions/${subId}/resourceGroups/${rg}/providers/Microsoft.DBforPostgreSQL/servers/${name}`;
}

function armMysqlServer(subId: string, rg: string, name: string): string {
  return `/subscriptions/${subId}/resourceGroups/${rg}/providers/Microsoft.DBforMySQL/servers/${name}`;
}

function armActivityLogAlert(subId: string, rg: string, name: string): string {
  return `/subscriptions/${subId}/resourceGroups/${rg}/providers/Microsoft.Insights/activityLogAlerts/${name}`;
}

function armAppInsights(subId: string, rg: string, name: string): string {
  return `/subscriptions/${subId}/resourceGroups/${rg}/providers/Microsoft.Insights/components/${name}`;
}

function armDiagnosticSetting(subId: string, rg: string, name: string): string {
  return `/subscriptions/${subId}/resourceGroups/${rg}/providers/Microsoft.Insights/diagnosticSettings/${name}`;
}

function armNetworkWatcher(subId: string, rg: string, region: string, name: string): string {
  return `/subscriptions/${subId}/resourceGroups/${rg}/providers/Microsoft.Network/networkWatchers/${name}/locations/${region}`;
}

function nsgRuleAllowInbound(port: string, proto: string): Record<string, unknown> {
  return {
    name: `Allow-${port}-${proto}`,
    properties: {
      priority: randBetween(100, 500),
      direction: "Inbound",
      access: "Allow",
      protocol: proto,
      sourcePortRange: "*",
      destinationPortRange: port,
      sourceAddressPrefix: "*",
      destinationAddressPrefix: "*",
    },
  };
}

function storageEvidenceForRule(rule: CisBenchmarkRule): Record<string, unknown> {
  const rn = rule.benchmark.rule_number;
  const base = {
    supportsHttpsTrafficOnly: false,
    allowBlobPublicAccess: true,
    minimumTlsVersion: "TLS1_0",
    enableInfrastructureEncryption: false,
  };
  switch (rn) {
    case "3.1":
      return { properties: { supportsHttpsTrafficOnly: false } };
    case "3.2":
      return { properties: { encryption: { requireInfrastructureEncryption: false } } };
    case "3.7":
      return { properties: { allowBlobPublicAccess: true } };
    case "3.8":
      return {
        properties: {
          networkAcls: { defaultAction: "Allow", bypass: "None" },
        },
      };
    case "3.9":
      return {
        properties: {
          networkAcls: { defaultAction: "Deny", bypass: "None" },
          allowTrustedServices: false,
        },
      };
    case "3.10":
      return { properties: { privateEndpointConnections: [] } };
    case "3.11":
      return { properties: { deleteRetentionPolicy: { enabled: false } } };
    case "3.13":
    case "3.14":
    case "3.5":
      return {
        properties: {
          logging: { delete: false, read: false, write: false, service: "blob" },
        },
      };
    case "3.15":
      return { properties: { minimumTlsVersion: "TLS1_0" } };
    default:
      return { properties: base };
  }
}

function azureCspmResourceAndEvidence(
  rule: CisBenchmarkRule,
  subId: string,
  rg: string,
  region: string,
  isFailed: boolean
): { resource: CspFindingResource; evidence?: Record<string, unknown> } {
  const st = randHex(6);
  const suffix = () => `${pick(["prod", "app", "data", "shared"])}${st}`;

  let resource: CspFindingResource;
  let evidence: Record<string, unknown> | undefined;

  switch (rule.section) {
    case "Identity and Access Management": {
      const roleId = randUUID();
      resource = {
        id: `/subscriptions/${subId}/providers/Microsoft.Authorization/roleDefinitions/${roleId}`,
        name: `CustomAdmin-${st}`,
        type: "cloud-identity-management",
        sub_type: "role-definition",
        raw: {
          properties: {
            roleName: "CustomSubscriptionAdmin",
            permissions: [{ actions: ["*"], notActions: [] }],
            assignableScopes: [`/subscriptions/${subId}`],
          },
        },
      };
      evidence = isFailed
        ? {
            customAdministratorRoles: [
              {
                id: roleId,
                properties: {
                  permissions: [{ actions: ["*"], notActions: [] }],
                  roleName: "CustomSubscriptionAdmin",
                },
              },
            ],
          }
        : undefined;
      break;
    }
    case "Microsoft Defender for Cloud": {
      resource = {
        id: `/subscriptions/${subId}/providers/Microsoft.Security/pricings/VirtualMachines`,
        name: "VirtualMachines",
        type: "security-saas",
        sub_type: "defender-plan",
        raw: {
          properties: {
            pricingTier: "Free",
            autoProvisioning: "Off",
          },
        },
      };
      evidence = isFailed
        ? {
            securityContacts: {
              email: "",
              phone: "",
              alertNotifications: "Off",
              notificationsByRole: { state: "Off", roles: [] },
            },
            pricings: { VirtualMachines: "Free", SqlServers: "Free", AppServices: "Free" },
          }
        : undefined;
      break;
    }
    case "Storage Accounts": {
      const name = `st${suffix().toLowerCase()}`;
      resource = {
        id: armStorageAccount(subId, rg, name),
        name,
        type: "object-storage",
        sub_type: "storage-account",
        raw: isFailed ? { properties: storageEvidenceForRule(rule).properties } : undefined,
      };
      evidence = isFailed ? storageEvidenceForRule(rule) : undefined;
      break;
    }
    case "SQL Server - Auditing":
    case "SQL Server - Microsoft Defender for SQL": {
      const sqlName = `sql-${suffix()}`;
      const rn = rule.benchmark.rule_number;
      resource = {
        id: armSqlServer(subId, rg, sqlName),
        name: sqlName,
        type: "relational-database",
        sub_type: "azure-sql-server",
        raw: undefined,
      };
      if (!isFailed) {
        evidence = undefined;
        break;
      }
      if (rn === "4.1.1") {
        evidence = {
          auditing: { properties: { state: "Disabled" } },
        };
      } else if (rn === "4.1.2") {
        evidence = {
          firewallRules: [
            {
              name: "AllowAllWindowsAzureIps",
              properties: { startIpAddress: "0.0.0.0", endIpAddress: "255.255.255.255" },
            },
          ],
        };
      } else if (rn === "4.1.3") {
        evidence = {
          encryptionProtector: {
            properties: {
              serverKeyType: "ServiceManaged",
              thumbprint: null,
            },
          },
        };
      } else if (rn === "4.1.4") {
        evidence = {
          administrators: { azureADAdmin: null },
        };
      } else if (rn === "4.1.5") {
        evidence = {
          transparentDataEncryption: { properties: { state: "Disabled" } },
        };
      } else if (rn === "4.1.6") {
        evidence = {
          auditing: { properties: { state: "Enabled", retentionDays: 30 } },
        };
      } else if (rn === "4.2.1") {
        evidence = {
          advancedThreatProtection: { properties: { state: "Disabled" } },
        };
      } else {
        evidence = {
          properties: {
            auditing: { state: "Disabled" },
            transparentDataEncryption: { state: "Disabled" },
          },
        };
      }
      break;
    }
    case "PostgreSQL Database Server": {
      const pgName = `psql-${suffix()}`;
      resource = {
        id: armPostgresServer(subId, rg, pgName),
        name: pgName,
        type: "relational-database",
        sub_type: "postgresql-server",
        raw: undefined,
      };
      evidence = isFailed
        ? {
            properties: {
              sslEnforcement: "Disabled",
              infrastructureEncryption: "Disabled",
              firewallRules: [
                {
                  name: "allow-azure",
                  properties: { startIpAddress: "0.0.0.0", endIpAddress: "0.0.0.0" },
                },
              ],
            },
          }
        : undefined;
      break;
    }
    case "MySQL Database": {
      const myName = `mysql-${suffix()}`;
      resource = {
        id: armMysqlServer(subId, rg, myName),
        name: myName,
        type: "relational-database",
        sub_type: "mysql-server",
        raw: undefined,
      };
      evidence = isFailed
        ? {
            properties: {
              sslEnforcement: "Disabled",
              minimalTlsVersion: "TLSV1_0",
            },
          }
        : undefined;
      break;
    }
    case "Cosmos DB": {
      const cName = `cosmos-${suffix()}`;
      resource = {
        id: armCosmosDb(subId, rg, cName),
        name: cName,
        type: "nosql-database",
        sub_type: "cosmos-account",
        raw: undefined,
      };
      evidence = isFailed
        ? {
            properties: {
              isVirtualNetworkFilterEnabled: false,
              ipRules: [{ ipAddressOrRange: "0.0.0.0" }],
            },
          }
        : undefined;
      break;
    }
    case "Configuring Diagnostic Settings":
    case "Monitoring using Activity Log Alerts":
    case "Configuring Application Insights": {
      if (rule.section === "Monitoring using Activity Log Alerts") {
        const alertName = `activity-alert-${st}`;
        resource = {
          id: armActivityLogAlert(subId, rg, alertName),
          name: alertName,
          type: "monitoring",
          sub_type: "activity-log-alert",
          raw: undefined,
        };
        evidence = isFailed
          ? {
              properties: {
                enabled: false,
                scopes: [`/subscriptions/${subId}`],
                condition: { allOf: [] },
              },
            }
          : undefined;
      } else if (rule.section === "Configuring Application Insights") {
        const aiName = `insight-${suffix()}`;
        resource = {
          id: armAppInsights(subId, rg, aiName),
          name: aiName,
          type: "monitoring",
          sub_type: "application-insights",
          raw: undefined,
        };
        evidence = isFailed
          ? {
              properties: {
                publicNetworkAccessForIngestion: "Enabled",
                publicNetworkAccessForQuery: "Enabled",
                disableLocalAuth: false,
              },
            }
          : undefined;
      } else {
        const dsName = `diag-${suffix()}`;
        resource = {
          id: armDiagnosticSetting(subId, rg, dsName),
          name: dsName,
          type: "logging",
          sub_type: "diagnostic-setting",
          raw: undefined,
        };
        evidence = isFailed
          ? {
              logs: [],
              metrics: [],
              workspaceId: null,
              storageAccountId: null,
            }
          : undefined;
      }
      break;
    }
    case "Logging and Monitoring": {
      resource = {
        id: `/subscriptions/${subId}/resourceGroups/${rg}/providers/Microsoft.OperationalInsights/workspaces/law-${suffix()}`,
        name: `law-${suffix()}`,
        type: "logging",
        sub_type: "log-analytics-workspace",
        raw: undefined,
      };
      evidence = isFailed
        ? {
            properties: {
              sku: { name: "Free" },
              retentionInDays: 30,
              features: { enableLogAccessUsingOnlyResourcePermissions: false },
            },
          }
        : undefined;
      break;
    }
    case "Networking": {
      const nsg = `nsg-${suffix()}`;
      const rn = rule.benchmark.rule_number;
      resource = {
        id: armNsg(subId, rg, nsg),
        name: nsg,
        type: "network",
        sub_type: "network-security-group",
        raw: undefined,
      };
      if (!isFailed) {
        evidence = undefined;
        break;
      }
      if (rn === "6.1") {
        evidence = {
          securityRules: [nsgRuleAllowInbound("3389", "Tcp")],
        };
      } else if (rn === "6.2") {
        evidence = {
          securityRules: [nsgRuleAllowInbound("22", "Tcp")],
        };
      } else if (rn === "6.3") {
        evidence = {
          securityRules: [nsgRuleAllowInbound("*", "Udp")],
        };
      } else if (rn === "6.4") {
        evidence = {
          securityRules: [nsgRuleAllowInbound("80", "Tcp"), nsgRuleAllowInbound("443", "Tcp")],
        };
      } else if (rn === "6.5") {
        evidence = {
          flowLogs: {
            retentionPolicy: { days: 7, enabled: false },
            enabled: false,
          },
        };
      } else if (rn === "6.6") {
        const nwName = `NetworkWatcher_${region}`;
        evidence = {
          networkWatcher: {
            id: armNetworkWatcher(subId, rg, region, nwName),
            provisioningState: "Disabled",
          },
        };
      } else {
        evidence = {
          securityRules: [nsgRuleAllowInbound("22", "Tcp")],
        };
      }
      break;
    }
    case "Virtual Machines": {
      const vmName = `vm-${suffix()}`;
      resource = {
        id: armVm(subId, rg, vmName),
        name: vmName,
        type: "cloud-compute",
        sub_type: "virtual-machine",
        raw: undefined,
      };
      evidence = isFailed
        ? {
            properties: {
              storageProfile: {
                osDisk: {
                  diskSizeGB: 128,
                  managedDisk: {
                    storageAccountType: "Premium_LRS",
                    diskEncryptionSet: null,
                  },
                  encryptionSettings: { enabled: false },
                },
              },
              securityProfile: {
                encryptionAtHost: false,
              },
            },
          }
        : undefined;
      break;
    }
    case "Key Vault": {
      const kvName = `kv-${suffix()}`;
      resource = {
        id: armKeyVault(subId, rg, kvName),
        name: kvName,
        type: "key-vault",
        sub_type: "key-vault",
        raw: undefined,
      };
      evidence = isFailed
        ? {
            properties: {
              enableSoftDelete: true,
              enablePurgeProtection: false,
              enableRbacAuthorization: false,
            },
            keys: [{ name: "default", attributes: { expires: null } }],
            secrets: [{ name: "db-password", attributes: { expires: null } }],
          }
        : undefined;
      break;
    }
    case "AppService": {
      const site = `app-${suffix()}`;
      resource = {
        id: armAppService(subId, rg, site),
        name: site,
        type: "web-app",
        sub_type: "app-service",
        raw: undefined,
      };
      evidence = isFailed
        ? {
            properties: {
              httpsOnly: false,
              clientCertEnabled: false,
              siteConfig: {
                minTlsVersion: "1.0",
                ftpsState: "AllAllowed",
                http20Enabled: false,
              },
              identity: { type: "None" },
            },
          }
        : undefined;
      break;
    }
    default: {
      const name = `res-${suffix()}`;
      resource = {
        id: `/subscriptions/${subId}/resourceGroups/${rg}/providers/Microsoft.Resources/resources/${name}`,
        name,
        type: "cloud-configuration",
        sub_type: "azure-resource",
        raw: undefined,
      };
      evidence = isFailed
        ? {
            evaluated: false,
            reason: "Non-compliant configuration detected",
          }
        : undefined;
    }
  }

  return { resource, evidence };
}

export function generateAzureCspmFindings(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = makeAzureSetup(er);
  const rule = pick(CIS_AZURE_RULES);
  const isFailed = Math.random() < er + 0.22;
  const cloud = {
    provider: "azure",
    region,
    account: { id: subscription.id, name: subscription.name },
  };
  const { resource, evidence } = azureCspmResourceAndEvidence(
    rule,
    subscription.id,
    resourceGroup,
    region,
    isFailed
  );
  return [
    buildCspFinding({
      ts,
      rule,
      isFailed,
      cloud,
      resource,
      evidence: isFailed ? evidence : undefined,
      cloudModule: "azure",
    }) as unknown as EcsDocument,
  ];
}

function k8sSubTypeForSection(section: string): string {
  const map: Record<string, string> = {
    "Control Plane Node Configuration Files": "static-pod",
    "API Server": "apiserver",
    "Controller Manager": "controller-manager",
    Scheduler: "scheduler",
    etcd: "etcd",
    "Worker Node Configuration Files": "node-config",
    Kubelet: "kubelet",
    "Pod Security Policies": "pod",
    "Pod Security Standards": "pod",
    "RBAC and Service Accounts": "clusterrolebinding",
    "Image Registry and Image Scanning": "pod",
    "Cluster Networking": "service",
    "AWS Key Management Service (KMS)": "secret",
  };
  return map[section] ?? "k8s_object";
}

function azureKspmResourceAndEvidence(
  rule: CisBenchmarkRule,
  clusterName: string,
  clusterArmId: string,
  isFailed: boolean
): { resource: CspFindingResource; evidence?: Record<string, unknown> } {
  const ns = pick(["kube-system", "default", "production"]);
  const subType = k8sSubTypeForSection(rule.section);
  const resourceName = `${rule.benchmark.rule_number.replace(/\./g, "-")}-${randHex(4)}`;

  let resource: CspFindingResource;
  let evidence: Record<string, unknown> | undefined;

  if (rule.section === "RBAC and Service Accounts") {
    resource = {
      id: `${clusterArmId}/namespaces/${ns}/clusterrolebindings/${resourceName}`,
      name: resourceName,
      type: "k8s_object",
      sub_type: "clusterrolebinding",
      raw: undefined,
    };
    evidence = isFailed
      ? {
          subjects: [
            { kind: "Group", name: "system:authenticated", apiGroup: "rbac.authorization.k8s.io" },
          ],
          roleRef: { kind: "ClusterRole", name: "cluster-admin" },
        }
      : undefined;
  } else if (rule.section === "Cluster Networking") {
    resource = {
      id: `${clusterArmId}/namespaces/${ns}/services/${resourceName}`,
      name: resourceName,
      type: "k8s_object",
      sub_type: "service",
      raw: undefined,
    };
    evidence = isFailed
      ? {
          spec: {
            type: "LoadBalancer",
            loadBalancerSourceRanges: ["0.0.0.0/0"],
          },
        }
      : undefined;
  } else if (
    rule.section === "Pod Security Policies" ||
    rule.section === "Pod Security Standards"
  ) {
    resource = {
      id: `${clusterArmId}/namespaces/${ns}/pods/${resourceName}`,
      name: resourceName,
      type: "k8s_object",
      sub_type: "pod",
      raw: undefined,
    };
    evidence = isFailed
      ? {
          spec: {
            securityContext: { privileged: true, allowPrivilegeEscalation: true },
            containers: [
              {
                name: "app",
                securityContext: { privileged: true, capabilities: { add: ["NET_RAW"] } },
              },
            ],
          },
        }
      : undefined;
  } else if (rule.section === "API Server") {
    resource = {
      id: `${clusterArmId}/namespaces/kube-system/pods/kube-apiserver-${clusterName}`,
      name: `kube-apiserver-${clusterName}`,
      type: "k8s_object",
      sub_type: "apiserver",
      raw: undefined,
    };
    evidence = isFailed
      ? {
          command: [
            "kube-apiserver",
            "--anonymous-auth=true",
            "--authorization-mode=AlwaysAllow",
            "--insecure-port=8080",
          ],
        }
      : undefined;
  } else if (rule.section === "Kubelet" || rule.section === "Worker Node Configuration Files") {
    const nodeId = randHex(4);
    resource = {
      id: `${clusterArmId}/nodes/aks-node-${nodeId}`,
      name: `aks-node-${nodeId}`,
      type: "k8s_object",
      sub_type: "kubelet",
      raw: undefined,
    };
    evidence = isFailed
      ? {
          kubeletConfig: {
            authentication: { anonymous: { enabled: true } },
            authorization: { mode: "AlwaysAllow" },
          },
        }
      : undefined;
  } else if (rule.section === "Control Plane Node Configuration Files") {
    resource = {
      id: `${clusterArmId}/nodes/control-plane/config/${resourceName}`,
      name: resourceName,
      type: "k8s_object",
      sub_type: "node-file",
      raw: undefined,
    };
    evidence = isFailed
      ? {
          path: "/etc/kubernetes/manifests/kube-apiserver.yaml",
          mode: "0666",
          owner: "root:root",
        }
      : undefined;
  } else if (rule.section === "AWS Key Management Service (KMS)") {
    resource = {
      id: `${clusterArmId}/namespaces/kube-system/secrets/${resourceName}`,
      name: resourceName,
      type: "k8s_object",
      sub_type: "secret",
      raw: undefined,
    };
    evidence = isFailed
      ? {
          encryption: { kmsKeyId: null, provider: "identity" },
        }
      : undefined;
  } else if (rule.section === "Image Registry and Image Scanning") {
    resource = {
      id: `${clusterArmId}/namespaces/${ns}/pods/${resourceName}`,
      name: resourceName,
      type: "k8s_object",
      sub_type: "pod",
      raw: undefined,
    };
    evidence = isFailed
      ? {
          spec: {
            containers: [
              { name: "app", image: "unscanned.example.com/app:latest", imagePullPolicy: "Always" },
            ],
          },
        }
      : undefined;
  } else {
    resource = {
      id: `${clusterArmId}/namespaces/${ns}/${subType}/${resourceName}`,
      name: resourceName,
      type: "k8s_object",
      sub_type: subType,
      raw: undefined,
    };
    evidence = isFailed
      ? {
          evaluatedObject: {
            apiVersion: "v1",
            kind: subType,
            metadata: { name: resourceName, namespace: ns },
            nonCompliant: true,
          },
        }
      : undefined;
  }

  return { resource, evidence };
}

export function generateAzureKspmFindings(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = makeAzureSetup(er);
  const rule = pick(CIS_K8S_RULES);
  const isFailed = Math.random() < er + 0.2;
  const clusterName = `aks-${pick(["prod", "data", "shared"])}-${randId(4)}`;
  const clusterArmId = armAksCluster(subscription.id, resourceGroup, clusterName);
  const cloud = {
    provider: "azure",
    region,
    account: { id: subscription.id, name: subscription.name },
  };
  const orchestrator = {
    cluster: {
      name: clusterName,
      id: clusterArmId,
      resource_id: clusterArmId,
    },
  };
  const { resource, evidence } = azureKspmResourceAndEvidence(
    rule,
    clusterName,
    clusterArmId,
    isFailed
  );
  return [
    buildCspFinding({
      ts,
      rule,
      isFailed,
      cloud,
      resource,
      evidence: isFailed ? evidence : undefined,
      orchestrator,
      cloudModule: "kubernetes",
    }) as unknown as EcsDocument,
  ];
}

const OWNER_ROLE_DEFINITION_ID = "8e3af657-a8ff-443c-a75c-2fe8c4bcb635";

/** Entra ID risky sign-in → Owner role assignment → subscription enumeration */
export function generateAzureIamPrivEscChain(ts: string, _er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = makeAzureSetup(0);
  const baseDate = new Date(ts);
  const attackSessionId = randUUID();
  const principalId = randUUID();
  const userPrincipalName = `attacker${randInt(100, 999)}@contoso.com`;
  const ipAddress = randIp();
  const roleAssignmentId = randUUID();

  const sessionLabels = {
    attack_session_id: attackSessionId,
    subscription_id: subscription.id,
    principal_id: principalId,
    user_principal_name: userPrincipalName,
  };

  const roleTs = offsetTs(baseDate, 60_000);
  const enumTs = offsetTs(baseDate, 3 * 60_000);
  const ownerRoleArm = `/subscriptions/${subscription.id}/providers/Microsoft.Authorization/roleDefinitions/${OWNER_ROLE_DEFINITION_ID}`;

  const entra: EcsDocument = {
    "@timestamp": ts,
    __dataset: "azure.entra_id",
    labels: sessionLabels,
    cloud: azureCloud(region, subscription, "Microsoft.Authorization"),
    azure: {
      entra_id: {
        category: "RiskDetection",
        user_principal_name: userPrincipalName,
        principal_id: principalId,
        user: userPrincipalName,
        app_id: randId(8).toLowerCase(),
        ip_address: ipAddress,
        result: "Success",
        riskLevel: "high",
        riskState: "AtRisk",
        riskDetail: "unfamiliarFeatures",
        conditionalAccessStatus: "failure",
        detection_type: "unfamiliarFeatures",
      },
    },
    source: { ip: ipAddress },
    event: { outcome: "success", duration: randInt(5e5, 2e6) },
    message: `Entra [PrivEsc 1/3]: risky sign-in for ${userPrincipalName}`,
    log: { level: "warn" },
  };

  const roleAssign: EcsDocument = {
    "@timestamp": roleTs,
    __dataset: "azure.activity_log",
    labels: sessionLabels,
    cloud: azureCloud(region, subscription, "Microsoft.Authorization"),
    azure: {
      activity_log: {
        resource_group: resourceGroup,
        resource_name: "role-assignments",
        resource_id: `/subscriptions/${subscription.id}/providers/Microsoft.Authorization/roleAssignments/${roleAssignmentId}`,
        operation_name: "Microsoft.Authorization/roleAssignments/write",
        status: "Succeeded",
        correlation_id: randId(16).toLowerCase(),
        http_status: 201,
        duration_ms: randInt(80, 400),
        principal_id: principalId,
        user_principal_name: userPrincipalName,
        role_definition: "Owner",
        role_definition_id: ownerRoleArm,
      },
    },
    source: { ip: ipAddress },
    event: { outcome: "success", duration: randInt(5e5, 1e6) },
    message: `Activity Log [PrivEsc 2/3]: Owner role assigned to ${userPrincipalName}`,
    log: { level: "warn" },
  };

  const enumerated = [
    `/subscriptions/${subscription.id}`,
    `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}`,
    `/subscriptions/${subscription.id}/resourceGroups/rg-network-prod`,
    `/subscriptions/${subscription.id}/providers/Microsoft.Storage/storageAccounts/st${randId(8).toLowerCase()}`,
  ];

  const arm: EcsDocument = {
    "@timestamp": enumTs,
    __dataset: "azure.activity_log",
    labels: sessionLabels,
    cloud: azureCloud(region, subscription, "Microsoft.Resources/subscriptions"),
    azure: {
      activity_log: {
        resource_group: resourceGroup,
        resource_name: subscription.name,
        resource_id: `/subscriptions/${subscription.id}`,
        operation_name: "Microsoft.Resources/subscriptions/read",
        status: "Succeeded",
        correlation_id: randId(16).toLowerCase(),
        http_status: 200,
        duration_ms: randInt(40, 200),
        principal_id: principalId,
        user_principal_name: userPrincipalName,
        enumerated_resources: enumerated,
        claims_token_minted: true,
      },
    },
    source: { ip: ipAddress },
    event: { outcome: "success", duration: randInt(3e5, 8e5) },
    message: `Activity Log [PrivEsc 3/3]: subscription enumeration (${enumerated.length} resources)`,
    log: { level: "error" },
    error: {
      code: "PrivilegeEscalation",
      message: `Azure identity chain completed for ${userPrincipalName}`,
      type: "security",
    },
  };

  return [entra, roleAssign, arm];
}

/** Defender alert (T+0) ↔ prior blob download & NSG flow (T-5m) — same actor and storage account */
export function generateAzureDataExfilChain(ts: string, _er: number): EcsDocument[] {
  const { region, subscription, resourceGroup } = makeAzureSetup(0);
  const baseDate = new Date(ts);
  const exfilChainId = randUUID();
  const account = `st${randId(10).toLowerCase()}`;
  const srcIp = randIp();
  const contentLengthMb = randInt(120, 980);
  const blobTs = offsetTs(baseDate, -5 * 60_000);
  const nsgName = `nsg-data-${randId(4)}`;
  const vmInternalIp = `10.${randInt(1, 200)}.${randInt(1, 250)}.${randInt(2, 250)}`;

  const exfilLabels = {
    exfil_chain_id: exfilChainId,
    subscription_id: subscription.id,
    storage_account: account,
    source_ip: srcIp,
  };

  const defenderAlertId = randUUID();

  const blob: EcsDocument = {
    "@timestamp": blobTs,
    __dataset: "azure.blob_storage",
    labels: exfilLabels,
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
        caller_ip_address: srcIp,
        properties: {
          contentLength: contentLengthMb * 1024 * 1024,
          contentLengthMb,
        },
        bytes_out: contentLengthMb * 1024 * 1024,
        client_ip: srcIp,
      },
    },
    source: { ip: srcIp },
    event: { outcome: "success", duration: randInt(1e6, 5e6) },
    message: `Blob Storage: large GetBlob from ${account} by ${srcIp}`,
    log: { level: "warn" },
  };

  const nsg: EcsDocument = {
    "@timestamp": blobTs,
    __dataset: "azure.network_security_groups",
    labels: exfilLabels,
    cloud: azureCloud(region, subscription, "Microsoft.Network/networkSecurityGroups"),
    azure: {
      network_security_groups: {
        resource_group: resourceGroup,
        resource_name: nsgName,
        resource_id: `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/networkSecurityGroups/${nsgName}`,
        flow_log: {
          srcAddr: vmInternalIp,
          dstAddr: srcIp,
          dstPort: "443",
          protocol: "TCP",
          bytes: contentLengthMb * 1024 * 1024,
          direction: "O",
        },
        operation_name: "NSGFlowLog",
        status: "Succeeded",
        correlation_id: randId(16).toLowerCase(),
        rule_name: "defaultAllowInternetOut",
        source_ip: srcIp,
        direction: "Outbound",
      },
    },
    event: { outcome: "success", duration: randInt(1e5, 5e5) },
    message: `NSG flow: outbound transfer toward ${srcIp} during blob exfil window`,
    log: { level: "warn" },
  };

  const defender: EcsDocument = {
    "@timestamp": ts,
    __dataset: "azure.defender",
    labels: exfilLabels,
    cloud: azureCloud(region, subscription, "Microsoft.Security/alerts"),
    azure: {
      defender: {
        alert_id: defenderAlertId,
        alert_type: "STORAGE.BLOB_ExfiltrationAnomaly",
        alert_name: "Anomalous volume of data read from storage account",
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
    message: `Defender: STORAGE.BLOB_ExfiltrationAnomaly on ${account}`,
    log: { level: "error" },
    error: {
      code: "DataExfiltration",
      message: `Correlated Defender + Blob + NSG flow for ${account}`,
      type: "security",
    },
  };

  return [blob, nsg, defender];
}
