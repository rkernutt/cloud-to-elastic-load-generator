/**
 * Multi-document security / attack-pattern generators for GCP (SCC, Security Operations / SecOps, CSPM, etc.).
 */
import { offsetTs } from "../../aws/generators/traces/helpers.js";
import {
  CIS_GCP_RULES,
  CIS_K8S_RULES,
  type CisBenchmarkRule,
} from "../../data/cisBenchmarkRules.js";
import type { CspFindingResource } from "../../data/cspFindingsHelpers.js";
import { buildCspFinding, pick, randHex, randBetween } from "../../data/cspFindingsHelpers.js";
import {
  randHumanUser,
  randSourceIp,
  randPipelineUserAgent,
  ecsIdentityFields,
} from "../../helpers/identity.js";
import {
  type EcsDocument,
  rand,
  randInt,
  randId,
  randIp,
  randUUID,
  gcpCloud,
  makeGcpSetup,
  randBucket,
  randGkeCluster,
  randSeverity,
  randLatencyMs,
  randZone,
} from "./helpers.js";

function uuidLike(): string {
  return `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`.toLowerCase();
}

const SCC_CATEGORIES = [
  "MALWARE",
  "BRUTE_FORCE",
  "CRYPTOMINING",
  "OPEN_FIREWALL",
  "DATA_EXFILTRATION",
  "PRIVILEGE_ESCALATION",
  "C2_COMMUNICATION",
] as const;

/** SCC finding → SecOps SIEM detection → SecOps SOAR case (time-correlated). */
export function generateGcpSecurityFindingChain(ts: string, _er: number): EcsDocument[] {
  const { region, project } = makeGcpSetup(0);
  const baseDate = new Date(ts);
  const attacker = randHumanUser();
  const attackerIp = randSourceIp();
  const attackerUa = randPipelineUserAgent();
  const attackerIdentity = ecsIdentityFields(attacker, attackerIp, attackerUa);
  const findingChainId = randUUID();
  const findingId = `organizations/${randInt(1, 9)}/sources/${randId(8)}/findings/${uuidLike()}`;
  const zone = randZone(region);
  const instanceName = `compromised-${randId(4)}`;
  const resourceName = `//compute.googleapis.com/projects/${project.id}/zones/${zone}/instances/${instanceName}`;
  const category = rand([...SCC_CATEGORIES]);
  const severity = rand(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const);
  const secopsRule = `gcp_scc_secops_${category.toLowerCase()}_${randId(6)}`;
  const caseId = `cases/${randUUID()}`;
  const srcIp = randIp();
  const assignee = rand([
    "soc-analyst@example.com",
    "tier2-oncall@example.com",
    "ir-team@example.com",
  ]);
  const priority = rand(["P1", "P2", "P3"] as const);

  const chainLabels = {
    finding_chain_id: findingChainId,
    project_id: project.id,
    finding_id: findingId,
    resource_name: resourceName,
  };

  const sccTs = ts;
  const detectionTs = offsetTs(baseDate, 60_000);
  const secopsTs = offsetTs(baseDate, 180_000);

  const scc: EcsDocument = {
    ...attackerIdentity,
    "@timestamp": sccTs,
    __dataset: "gcp.scc",
    labels: chainLabels,
    cloud: gcpCloud(region, project, "security-command-center"),
    gcp: {
      security_command_center: {
        finding_id: findingId,
        category,
        severity,
        resource_name: resourceName,
        resource_type: "compute.googleapis.com/Instance",
        state: "ACTIVE",
        source: "EVENT_THREAT_DETECTION",
        organization_id: `organizations/${randInt(100000, 999999)}`,
        source_properties: {
          detectionCategory: category,
          detectionPriority: severity,
          explanation:
            category === "MALWARE"
              ? "Malicious process or file observed on the instance matching known malware indicators."
              : `Anomalous activity consistent with ${category.replace(/_/g, " ").toLowerCase()} was detected.`,
          externalUri: `https://console.cloud.google.com/security/command-center/findings?organizationId=0&resourceId=${encodeURIComponent(resourceName)}`,
          scannerName: "Event Threat Detection",
        },
      },
    },
    source: { ip: srcIp },
    event: { kind: "alert", category: ["intrusion_detection"], outcome: "failure" },
    message: `SCC [${severity}] ${category} — finding ${findingId}`,
    log: { level: "error" },
  };

  const detection: EcsDocument = {
    ...attackerIdentity,
    "@timestamp": detectionTs,
    __dataset: "gcp.secops",
    labels: chainLabels,
    cloud: gcpCloud(region, project, "security-operations"),
    gcp: {
      secops_detection: {
        rule_name: secopsRule,
        detection_type: "RULE_DETECTION",
        severity: randSeverity(false),
        alert_state: "NEW",
        ioc_type: "IP",
        matched_events_count: randInt(12, 8000),
        case_name: caseId,
        related_scc_finding_id: findingId,
        match_timestamp: detectionTs,
        udm_event: {
          metadata: {
            event_timestamp: detectionTs,
            product_name: "Google Security Operations",
            vendor_name: "Google",
            log_type: "GCP_SCC_FINDING",
          },
          principal: {
            ip: [srcIp],
            asset_id: resourceName,
          },
          target: {
            resource_name: resourceName,
            project_id: project.id,
          },
          security_result: {
            rule_name: secopsRule,
            severity: severity === "CRITICAL" ? "HIGH" : severity,
            summary: `SecOps SIEM rule matched SCC finding ${findingId}`,
          },
        },
      },
    },
    source: { ip: srcIp },
    event: { kind: "alert", category: ["intrusion_detection"], outcome: "failure" },
    message: `SecOps: SCC finding ${findingId} promoted — rule ${secopsRule}`,
    log: { level: "error" },
  };

  const secops: EcsDocument = {
    ...attackerIdentity,
    "@timestamp": secopsTs,
    __dataset: "gcp.secops",
    labels: chainLabels,
    cloud: gcpCloud(region, project, "security-operations"),
    gcp: {
      security_operations: {
        case_id: caseId,
        playbook_name: "gcp_incident_triage",
        action_type: "CASE_CREATED",
        severity,
        entities_count: randInt(4, 120),
        indicators_count: randInt(2, 40),
        source_finding_id: findingId,
        siem_rule: secopsRule,
        status: "NEW",
        priority,
        assignee,
      },
    },
    event: { kind: "alert", outcome: "failure" },
    message: `SecOps case ${caseId} opened for SCC→SecOps chain (${category})`,
    log: { level: "error" },
  };

  return [scc, detection, secops];
}

function gcpCspmResourceForRule(
  rule: CisBenchmarkRule,
  ctx: { projectId: string; region: string; zone: string },
  isFailed: boolean
): { resource: CspFindingResource; evidence?: Record<string, unknown> } {
  const { projectId, region, zone } = ctx;
  const bucket = randBucket();
  const instanceName = `vm-${randId(6)}`;
  const fwName = `fw-${randId(6)}`;
  const sqlName = `sql-${randId(6)}`;
  const dsName = `dataset_${randId(4)}`;
  const saEmail = `svc-${randId(6)}@${projectId}.iam.gserviceaccount.com`;

  switch (rule.section) {
    case "Identity and Access Management": {
      const resourceId = `//iam.googleapis.com/projects/${projectId}/serviceAccounts/${saEmail}`;
      const resource: CspFindingResource = {
        id: resourceId,
        name: saEmail,
        type: "iam.googleapis.com/ServiceAccount",
        sub_type: "service-account",
        raw: { email: saEmail, projectId },
      };
      const evidence: Record<string, unknown> | undefined = isFailed
        ? {
            keys: [
              {
                name: `projects/${projectId}/serviceAccounts/${saEmail}/keys/${randHex(40)}`,
                keyType: "USER_MANAGED",
                validAfterTime: "2020-01-01T00:00:00Z",
              },
            ],
            iamPolicy: {
              bindings: [{ role: "roles/owner", members: ["user:attacker@example.com"] }],
            },
          }
        : undefined;
      return { resource, evidence };
    }
    case "Logging and Monitoring": {
      const resourceId = `//cloudresourcemanager.googleapis.com/projects/${projectId}`;
      const resource: CspFindingResource = {
        id: resourceId,
        name: projectId,
        type: "cloudresourcemanager.googleapis.com/Project",
        sub_type: "audit-logging",
        raw: { projectId },
      };
      const evidence: Record<string, unknown> | undefined = isFailed
        ? {
            auditConfigs: [],
            logging: { sinks: [] },
          }
        : undefined;
      return { resource, evidence };
    }
    case "Networking": {
      const resourceId = `//compute.googleapis.com/projects/${projectId}/global/firewalls/${fwName}`;
      const resource: CspFindingResource = {
        id: resourceId,
        name: fwName,
        type: "compute.googleapis.com/Firewall",
        sub_type: "firewall",
      };
      const evidence: Record<string, unknown> | undefined = isFailed
        ? {
            sourceRanges: ["0.0.0.0/0"],
            allowed: [{ IPProtocol: "tcp", ports: ["22"] }],
            direction: "INGRESS",
            disabled: false,
          }
        : undefined;
      return { resource, evidence };
    }
    case "Virtual Machines": {
      const resourceId = `//compute.googleapis.com/projects/${projectId}/zones/${zone}/instances/${instanceName}`;
      const resource: CspFindingResource = {
        id: resourceId,
        name: instanceName,
        type: "compute.googleapis.com/Instance",
        sub_type: "gce-instance",
      };
      const evidence: Record<string, unknown> | undefined = isFailed
        ? {
            metadata: {
              items: [
                { key: "block-project-ssh-keys", value: "false" },
                { key: "enable-oslogin", value: "FALSE" },
              ],
            },
            networkInterfaces: [
              {
                accessConfigs: [{ natIP: randIp(), name: "External NAT" }],
              },
            ],
            canIpForward: true,
          }
        : undefined;
      return { resource, evidence };
    }
    case "Storage": {
      const resourceId = `//storage.googleapis.com/${bucket}`;
      const resource: CspFindingResource = {
        id: resourceId,
        name: bucket,
        type: "storage.googleapis.com/Bucket",
        sub_type: "gcs-bucket",
      };
      const evidence: Record<string, unknown> | undefined = isFailed
        ? {
            iamConfiguration: { uniformBucketLevelAccess: { enabled: false } },
            acl: [{ entity: "allUsers", role: "READER" }],
          }
        : undefined;
      return { resource, evidence };
    }
    case "BigQuery": {
      const resourceId = `//bigquery.googleapis.com/projects/${projectId}/datasets/${dsName}`;
      const resource: CspFindingResource = {
        id: resourceId,
        name: dsName,
        type: "bigquery.googleapis.com/Dataset",
        sub_type: "bigquery-dataset",
      };
      const evidence: Record<string, unknown> | undefined = isFailed
        ? {
            datasetReference: { datasetId: dsName, projectId },
            access: [{ role: "READER", specialGroup: "allAuthenticatedUsers" }],
            defaultEncryptionConfiguration: null,
          }
        : undefined;
      return { resource, evidence };
    }
    case "Cloud SQL Database Services":
    case "MySQL Database":
    case "PostgreSQL Database":
    case "SQL Server": {
      const engine =
        rule.section === "PostgreSQL Database"
          ? "POSTGRES_15"
          : rule.section === "SQL Server"
            ? "SQLSERVER_2019_STANDARD"
            : rule.section === "MySQL Database"
              ? "MYSQL_8_0"
              : pick(["MYSQL_8_0", "POSTGRES_15", "SQLSERVER_2019_STANDARD"]);
      const resourceId = `//sqladmin.googleapis.com/projects/${projectId}/instances/${sqlName}`;
      const resource: CspFindingResource = {
        id: resourceId,
        name: sqlName,
        type: "sqladmin.googleapis.com/Instance",
        sub_type: "cloud-sql-instance",
        raw: { databaseVersion: engine },
      };
      const evidence: Record<string, unknown> | undefined = isFailed
        ? {
            settings: {
              ipConfiguration: {
                ipv4Enabled: true,
                authorizedNetworks: [{ value: "0.0.0.0/0", name: "open-world" }],
                requireSsl: false,
              },
              backupConfiguration: { enabled: false },
            },
            databaseVersion: engine,
          }
        : undefined;
      return { resource, evidence };
    }
    default: {
      const resourceId = `//cloudresourcemanager.googleapis.com/projects/${projectId}`;
      return {
        resource: {
          id: resourceId,
          name: projectId,
          type: "cloudresourcemanager.googleapis.com/Project",
          sub_type: "project",
        },
        evidence: isFailed ? { findingContext: "cis_gcp", ruleName: rule.name, region } : undefined,
      };
    }
  }
}

export function generateGcpCspmFindings(ts: string, er: number): EcsDocument[] {
  const { region, project } = makeGcpSetup(er);
  const zone = randZone(region);
  const rule = pick(CIS_GCP_RULES);
  const isFailed = Math.random() < er + 0.22;
  const cloud = {
    provider: "gcp",
    region,
    account: { id: project.id, name: project.name },
  };
  const { resource, evidence } = gcpCspmResourceForRule(
    rule,
    { projectId: project.id, region, zone },
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
      cloudModule: "gcp",
    }) as unknown as EcsDocument,
  ];
}

function gkeKspmResourceForRule(
  rule: CisBenchmarkRule,
  cluster: string,
  isFailed: boolean
): { resource: CspFindingResource; evidence?: Record<string, unknown> } {
  const ns = pick(["kube-system", "production", "default"]);
  const pod = `${rand(["nginx", "api", "worker"])}-${randHex(6)}`;
  const nodeName = `gke-${cluster.replace(/[^a-z0-9-]/gi, "-").slice(0, 32)}-np-${randHex(4)}`;

  switch (rule.section) {
    case "API Server": {
      const name = `kube-apiserver-master-${randBetween(1, 3)}`;
      const resource: CspFindingResource = {
        id: `kube-system/pod/${name}`,
        name,
        type: "k8s_object",
        sub_type: "kube-apiserver",
      };
      const evidence: Record<string, unknown> | undefined = isFailed
        ? {
            spec: {
              containers: [
                {
                  command: ["kube-apiserver", "--anonymous-auth=true", "--insecure-port=8080"],
                },
              ],
            },
          }
        : undefined;
      return { resource, evidence };
    }
    case "etcd": {
      const name = `etcd-${randBetween(1, 3)}`;
      const resource: CspFindingResource = {
        id: `kube-system/pod/${name}`,
        name,
        type: "k8s_object",
        sub_type: "etcd",
      };
      const evidence: Record<string, unknown> | undefined = isFailed
        ? {
            spec: {
              containers: [{ command: ["etcd", "--client-cert-auth=false"] }],
            },
          }
        : undefined;
      return { resource, evidence };
    }
    case "Controller Manager": {
      const name = `kube-controller-manager-${randBetween(1, 3)}`;
      const resource: CspFindingResource = {
        id: `kube-system/pod/${name}`,
        name,
        type: "k8s_object",
        sub_type: "kube-controller-manager",
      };
      const evidence: Record<string, unknown> | undefined = isFailed
        ? {
            spec: {
              containers: [
                {
                  command: ["kube-controller-manager", "--use-service-account-credentials=false"],
                },
              ],
            },
          }
        : undefined;
      return { resource, evidence };
    }
    case "Scheduler": {
      const name = `kube-scheduler-${randBetween(1, 3)}`;
      const resource: CspFindingResource = {
        id: `kube-system/pod/${name}`,
        name,
        type: "k8s_object",
        sub_type: "kube-scheduler",
      };
      const evidence: Record<string, unknown> | undefined = isFailed
        ? {
            spec: {
              containers: [
                {
                  command: ["kube-scheduler", "--profiling=true", "--address=0.0.0.0"],
                },
              ],
            },
          }
        : undefined;
      return { resource, evidence };
    }
    case "Kubelet": {
      const resource: CspFindingResource = {
        id: `node/${nodeName}`,
        name: nodeName,
        type: "k8s_object",
        sub_type: "kubelet",
      };
      const evidence: Record<string, unknown> | undefined = isFailed
        ? {
            config: {
              authentication: { anonymous: { enabled: true } },
              authorization: { mode: "AlwaysAllow" },
            },
          }
        : undefined;
      return { resource, evidence };
    }
    case "Pod Security Standards": {
      const resource: CspFindingResource = {
        id: `${ns}/pod/${pod}`,
        name: pod,
        type: "k8s_object",
        sub_type: "pod",
      };
      const evidence: Record<string, unknown> | undefined = isFailed
        ? {
            spec: {
              hostNetwork: true,
              containers: [
                {
                  name: "app",
                  securityContext: { privileged: true, runAsUser: 0 },
                },
              ],
            },
          }
        : undefined;
      return { resource, evidence };
    }
    case "RBAC and Service Accounts": {
      const binding = `cluster-admin-${randHex(4)}`;
      const resource: CspFindingResource = {
        id: `clusterrolebinding/${binding}`,
        name: binding,
        type: "k8s_object",
        sub_type: "clusterrolebinding",
      };
      const evidence: Record<string, unknown> | undefined = isFailed
        ? {
            roleRef: {
              kind: "ClusterRole",
              name: "cluster-admin",
              apiGroup: "rbac.authorization.k8s.io",
            },
            subjects: [{ kind: "User", name: "admin@example.com" }],
          }
        : undefined;
      return { resource, evidence };
    }
    case "Control Plane Node Configuration Files": {
      const file = pick([
        "/etc/kubernetes/manifests/kube-apiserver.yaml",
        "/etc/kubernetes/manifests/etcd.yaml",
        "/etc/kubernetes/pki/apiserver.crt",
      ]);
      const resource: CspFindingResource = {
        id: `control-plane/file/${file.replace(/\//g, "_")}`,
        name: file,
        type: "k8s_object",
        sub_type: "node-config-file",
      };
      const evidence: Record<string, unknown> | undefined = isFailed
        ? { path: file, mode: "0666", owner: "root:root" }
        : undefined;
      return { resource, evidence };
    }
    case "Worker Node Configuration Files": {
      const file = "/var/lib/kubelet/config.yaml";
      const resource: CspFindingResource = {
        id: `node/${nodeName}/file/kubelet-config`,
        name: file,
        type: "k8s_object",
        sub_type: "kubelet-config",
      };
      const evidence: Record<string, unknown> | undefined = isFailed
        ? {
            path: file,
            mode: "0644",
            status: { nodeInfo: { kubeletVersion: "v1.28.0" } },
          }
        : undefined;
      return { resource, evidence };
    }
    default: {
      return {
        resource: {
          id: `${ns}/pod/${pod}`,
          name: pod,
          type: "k8s_object",
          sub_type: "workload",
        },
        evidence: isFailed ? { cluster, ruleName: rule.name, section: rule.section } : undefined,
      };
    }
  }
}

export function generateGcpKspmFindings(ts: string, er: number): EcsDocument[] {
  const { region, project } = makeGcpSetup(er);
  const cluster = randGkeCluster();
  const rule = pick(CIS_K8S_RULES);
  const isFailed = Math.random() < er + 0.2;
  const cloud = {
    provider: "gcp",
    region,
    account: { id: project.id, name: project.name },
  };
  const { resource, evidence } = gkeKspmResourceForRule(rule, cluster, isFailed);
  return [
    buildCspFinding({
      ts,
      rule,
      isFailed,
      cloud,
      resource,
      evidence: isFailed ? evidence : undefined,
      orchestrator: { cluster: { name: cluster } },
      cloudModule: "gcp",
    }) as unknown as EcsDocument,
  ];
}

function iamPrivEscAuditDoc(
  ts: string,
  region: string,
  project: ReturnType<typeof makeGcpSetup>["project"],
  opts: {
    serviceName: string;
    methodName: string;
    resourceName: string;
    message: string;
    tacticId: string;
    tacticName: string;
    techniqueId: string;
    techniqueName: string;
    callerIp: string;
    principalEmail: string;
    targetServiceAccountEmail: string;
    authorizationInfo: Array<Record<string, unknown>>;
    labels: Record<string, string>;
  }
): EcsDocument {
  return {
    "@timestamp": ts,
    __dataset: "gcp.audit",
    labels: opts.labels,
    cloud: gcpCloud(region, project, "cloud-audit-logs"),
    gcp: {
      cloud_audit: {
        service_name: opts.serviceName,
        method_name: opts.methodName,
        resource_name: opts.resourceName,
        caller_ip: opts.callerIp,
        caller_type: "USER",
        authorization_decision: "ALLOWED",
        authorization_info: opts.authorizationInfo,
        request_metadata: {
          caller_network: `projects/${project.id}/global/networks/default`,
          request_id: randId(16).toLowerCase(),
          user_agent: "Terraform/1.7.5",
        },
      },
    },
    user: { name: opts.principalEmail },
    source: { ip: opts.callerIp },
    threat: {
      tactic: { name: opts.tacticName, id: opts.tacticId },
      technique: { name: opts.techniqueName, id: opts.techniqueId },
    },
    event: {
      outcome: "success",
      category: ["iam", "configuration"],
      type: ["change"],
      duration: randInt(1_000_000, 8_000_000),
    },
    message: opts.message,
    log: { level: "warn" },
  };
}

/** ListServiceAccounts → CreateServiceAccountKey → SetIamPolicy → GenerateAccessToken */
export function generateGcpIamPrivEscChain(ts: string, _er: number): EcsDocument[] {
  const { region, project } = makeGcpSetup(0);
  const baseDate = new Date(ts);
  let offsetMs = 0;
  const advance = (minMs: number, maxMs: number) => {
    offsetMs += randInt(minMs, maxMs);
    return offsetTs(baseDate, offsetMs);
  };

  const attackSessionId = randUUID();
  const callerIp = randIp();
  const principalEmail = `attacker-${randId(6)}@${project.id.split("-")[0]}.example.com`;
  const targetSa = `persistence-sa@${project.id}.iam.gserviceaccount.com`;
  const targetSaResource = `projects/${project.id}/serviceAccounts/${targetSa}`;
  const labels = {
    attack_session_id: attackSessionId,
    project_id: project.id,
    target_service_account: targetSa,
  };

  const t1 = advance(30_000, 120_000);
  const t2 = advance(30_000, 120_000);
  const t3 = advance(30_000, 120_000);

  const listAuth = [
    {
      resource: `projects/${project.id}`,
      permission: "iam.serviceAccounts.list",
      granted: true,
      permission_type: "ADMIN_WRITE",
    },
  ];
  const keyAuth = [
    {
      resource: targetSaResource,
      permission: "iam.serviceAccountKeys.create",
      granted: true,
      permission_type: "ADMIN_WRITE",
    },
  ];
  const policyAuth = [
    {
      resource: `projects/${project.id}`,
      permission: "resourcemanager.projects.setIamPolicy",
      granted: true,
      permission_type: "ADMIN_WRITE",
    },
  ];
  const tokenAuth = [
    {
      resource: targetSaResource,
      permission: "iam.serviceAccounts.getAccessToken",
      granted: true,
      permission_type: "DATA_READ",
    },
  ];

  return [
    iamPrivEscAuditDoc(ts, region, project, {
      serviceName: "iam.googleapis.com",
      methodName: "google.iam.admin.v1.ListServiceAccounts",
      resourceName: `projects/${project.id}`,
      message: `Cloud Audit [PrivEsc 1/4]: ListServiceAccounts by ${principalEmail}`,
      tacticId: "TA0007",
      tacticName: "Discovery",
      techniqueId: "T1526",
      techniqueName: "Cloud Service Discovery",
      callerIp,
      principalEmail,
      targetServiceAccountEmail: targetSa,
      authorizationInfo: listAuth,
      labels,
    }),
    iamPrivEscAuditDoc(t1, region, project, {
      serviceName: "iam.googleapis.com",
      methodName: "google.iam.admin.v1.CreateServiceAccountKey",
      resourceName: `${targetSaResource}/keys/${randId(16)}`,
      message: `Cloud Audit [PrivEsc 2/4]: CreateServiceAccountKey for ${targetSa}`,
      tacticId: "TA0003",
      tacticName: "Persistence",
      techniqueId: "T1098",
      techniqueName: "Account Manipulation",
      callerIp,
      principalEmail,
      targetServiceAccountEmail: targetSa,
      authorizationInfo: keyAuth,
      labels,
    }),
    iamPrivEscAuditDoc(t2, region, project, {
      serviceName: "iam.googleapis.com",
      methodName: "google.iam.admin.v1.SetIamPolicy",
      resourceName: `projects/${project.id}`,
      message: `Cloud Audit [PrivEsc 3/4]: SetIamPolicy grants elevated role to ${targetSa}`,
      tacticId: "TA0004",
      tacticName: "Privilege Escalation",
      techniqueId: "T1078",
      techniqueName: "Valid Accounts",
      callerIp,
      principalEmail,
      targetServiceAccountEmail: targetSa,
      authorizationInfo: policyAuth,
      labels,
    }),
    {
      ...iamPrivEscAuditDoc(t3, region, project, {
        serviceName: "iamcredentials.googleapis.com",
        methodName: "GenerateAccessToken",
        resourceName: `${targetSaResource}:generateAccessToken`,
        message: `Cloud Audit [PrivEsc 4/4]: GenerateAccessToken — abuse of key material`,
        tacticId: "TA0006",
        tacticName: "Credential Access",
        techniqueId: "T1550.001",
        techniqueName: "Application Access Token",
        callerIp,
        principalEmail,
        targetServiceAccountEmail: targetSa,
        authorizationInfo: tokenAuth,
        labels,
      }),
      error: {
        code: "PrivilegeEscalation",
        message: `GCP IAM chain completed for ${targetSa}`,
        type: "security",
      },
    },
  ];
}

const DLP_INFO_TYPES = [
  "CREDIT_CARD_NUMBER",
  "EMAIL_ADDRESS",
  "US_SOCIAL_SECURITY_NUMBER",
  "PHONE_NUMBER",
  "GCP_CREDENTIALS",
  "STREET_ADDRESS",
] as const;

/** DLP inspection finding (T+0) ↔ prior VPC egress (T-5m) ↔ prior GCS access (T-3m). */
export function generateGcpDataExfilChain(ts: string, _er: number): EcsDocument[] {
  const { region, project } = makeGcpSetup(0);
  const baseDate = new Date(ts);
  const attacker = randHumanUser();
  const attackerIp = randSourceIp();
  const attackerUa = randPipelineUserAgent();
  const exfilChainId = randUUID();
  const bucket = randBucket();
  const instanceSrcIp = `10.${randInt(10, 120)}.${randInt(1, 250)}.${randInt(2, 250)}`;
  const jobName = `dlp-exfil-${randId(6)}`;
  const infoType = rand([...DLP_INFO_TYPES]);
  const likelihood = rand(["VERY_LIKELY", "LIKELY", "POSSIBLE"] as const);
  const objectName = `exports/customer-dump-${randId(8)}.parquet`;

  const exfilLabels = {
    exfil_chain_id: exfilChainId,
    project_id: project.id,
    bucket_name: bucket,
    attacker_ip: attackerIp,
  };

  const vpcTs = offsetTs(baseDate, -5 * 60_000);
  const gcsTs = offsetTs(baseDate, -3 * 60_000);

  const vpc: EcsDocument = {
    user: { name: attacker.name, email: attacker.email },
    user_agent: { original: attackerUa },
    "@timestamp": vpcTs,
    __dataset: "gcp.vpcflow",
    labels: exfilLabels,
    cloud: gcpCloud(region, project, "vpc-flow"),
    gcp: {
      vpc_flow: {
        src_ip: instanceSrcIp,
        dst_ip: attackerIp,
        src_port: randInt(40000, 65000),
        dst_port: 443,
        protocol: "TCP",
        bytes_sent: randInt(80_000_000, 900_000_000),
        packets_sent: randInt(50_000, 400_000),
        direction: "egress",
        subnet: `projects/${project.id}/regions/${region}/subnets/data`,
        vpc_name: `vpc-${randId(4)}`,
        action: "ALLOW",
        rule_name: "allow-egress-https",
      },
    },
    source: { ip: instanceSrcIp },
    event: { outcome: "success", duration: randLatencyMs(2, false) * 1e6 },
    message: `VPC flow: high-volume egress ${instanceSrcIp} → ${attackerIp} (bucket ${bucket})`,
    log: { level: "warn" },
  };

  const gcs: EcsDocument = {
    user: { name: attacker.name, email: attacker.email },
    user_agent: { original: attackerUa },
    "@timestamp": gcsTs,
    __dataset: "gcp.gcs",
    labels: exfilLabels,
    cloud: gcpCloud(region, project, "cloud-storage"),
    gcp: {
      cloud_storage: {
        bucket,
        object_name: objectName,
        operation: "storage.objects.get",
        size_bytes: randInt(50_000_000, 500_000_000),
        storage_class: "STANDARD",
        requester_ip: attackerIp,
        response_code: 200,
      },
    },
    source: { ip: attackerIp },
    event: { outcome: "success", duration: randInt(1e6, 8e6) },
    message: `GCS: storage.objects.get on gs://${bucket}/${objectName} from ${attackerIp}`,
    log: { level: "error" },
  };

  const dlp: EcsDocument = {
    user: { name: attacker.name, email: attacker.email },
    user_agent: { original: attackerUa },
    "@timestamp": ts,
    __dataset: "gcp.dlp",
    labels: exfilLabels,
    cloud: gcpCloud(region, project, "dlp"),
    gcp: {
      dlp: {
        job_name: jobName,
        inspect_template: `projects/${project.id}/inspectTemplates/pii-${randId(4)}`,
        info_type: infoType,
        likelihood,
        findings_count: randInt(800, 9000),
        bytes_scanned: randInt(50_000_000, 400_000_000),
        action: "INSPECT",
      },
    },
    source: { ip: attackerIp },
    event: { kind: "alert", outcome: "failure" },
    message: `DLP: ${likelihood} ${infoType} mass findings — post-facto detection (${jobName})`,
    log: { level: "error" },
    error: {
      code: "DataExfiltration",
      message: `Correlated DLP + VPC egress + GCS reads (${bucket})`,
      type: "security",
    },
  };

  return [vpc, gcs, dlp];
}
