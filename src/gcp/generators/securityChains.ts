/**
 * Multi-document security / attack-pattern generators for GCP (SCC, Chronicle, SecOps, CSPM, etc.).
 */
import {
  type EcsDocument,
  rand,
  randInt,
  randId,
  randIp,
  gcpCloud,
  makeGcpSetup,
  randBucket,
  randGkeCluster,
  randSeverity,
  randPrincipal,
  randLatencyMs,
} from "./helpers.js";

function uuidLike(): string {
  return `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`.toLowerCase();
}

/** SCC Event Threat Detection → Chronicle detection → Security Operations case */
export function generateGcpSecurityFindingChain(ts: string, _er: number): EcsDocument[] {
  const { region, project } = makeGcpSetup(0);
  const findingId = `organizations/${randInt(1, 9)}/sources/${randId(8)}/findings/${uuidLike()}`;
  const category = rand(["BRUTE_FORCE", "CRYPTOMINING", "MALWARE", "OPEN_FIREWALL"] as const);
  const severity = rand(["CRITICAL", "HIGH", "MEDIUM"] as const);
  const chronicleRule = `gcp_scc_correlation_${randId(6)}`;
  const caseId = `case-${randId(10).toLowerCase()}`;
  const srcIp = randIp();

  const scc: EcsDocument = {
    "@timestamp": ts,
    __dataset: "gcp.scc",
    cloud: gcpCloud(region, project, "security-command-center"),
    gcp: {
      security_command_center: {
        finding_id: findingId,
        category,
        severity,
        resource_name: `//compute.googleapis.com/projects/${project.id}/zones/${region}-a/instances/compromised-${randId(4)}`,
        resource_type: "compute.googleapis.com/Instance",
        state: "ACTIVE",
        source: "EVENT_THREAT_DETECTION",
        organization_id: `organizations/${randInt(100000, 999999)}`,
      },
    },
    source: { ip: srcIp },
    event: { kind: "alert", category: ["intrusion_detection"], outcome: "failure" },
    message: `SCC [${severity}] ${category} — finding ${findingId}`,
    log: { level: "error" },
  };

  const chronicle: EcsDocument = {
    "@timestamp": ts,
    __dataset: "gcp.chronicle",
    cloud: gcpCloud(region, project, "chronicle"),
    gcp: {
      chronicle: {
        rule_name: chronicleRule,
        detection_type: "RULE_DETECTION",
        severity: randSeverity(false),
        alert_state: "NEW",
        ioc_type: "IP",
        matched_events_count: randInt(12, 8000),
        case_name: caseId,
        related_scc_finding_id: findingId,
      },
    },
    source: { ip: srcIp },
    event: { kind: "alert", category: ["intrusion_detection"], outcome: "failure" },
    message: `Chronicle: SCC finding ${findingId} promoted — rule ${chronicleRule}`,
    log: { level: "error" },
  };

  const secops: EcsDocument = {
    "@timestamp": ts,
    __dataset: "gcp.secops",
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
        chronicle_rule: chronicleRule,
      },
    },
    event: { kind: "alert", outcome: "failure" },
    message: `SecOps case ${caseId} opened for SCC→Chronicle chain (${category})`,
    log: { level: "error" },
  };

  return [scc, chronicle, secops];
}

const CIS_GCP_RULES = [
  {
    section: "2.4",
    id: "cis_gcp_2_4",
    name: "Ensure that IAM password policy enforces minimum password length",
    resource_type: "cloud-identity-management",
    sub_type: "iam-policy",
    severity: "high",
    tags: ["IAM"],
  },
  {
    section: "2.5",
    id: "cis_gcp_2_5",
    name: "Ensure that MFA is enabled for all non-service accounts",
    resource_type: "cloud-identity-management",
    sub_type: "iam-user",
    severity: "critical",
    tags: ["IAM"],
  },
  {
    section: "3.1",
    id: "cis_gcp_3_1",
    name: "Ensure default network does not exist in projects",
    resource_type: "cloud-network",
    sub_type: "vpc",
    severity: "medium",
    tags: ["VPC"],
  },
  {
    section: "5.1",
    id: "cis_gcp_5_1",
    name: "Ensure that Cloud Storage bucket is not publicly accessible",
    resource_type: "object-storage",
    sub_type: "gcs-bucket",
    severity: "high",
    tags: ["Storage"],
  },
] as const;

export function generateGcpCspmFindings(ts: string, er: number): EcsDocument[] {
  const { region, project } = makeGcpSetup(er);
  const rule = rand([...CIS_GCP_RULES]);
  const isFailed = Math.random() < er + 0.22;
  const evaluation = isFailed ? "failed" : "passed";
  const resourceId = `//${rule.sub_type === "gcs-bucket" ? "storage.googleapis.com" : "compute.googleapis.com"}/projects/${project.id}/global/${rule.sub_type}-${randId(6)}`;
  return [
    {
      "@timestamp": ts,
      __dataset: "cloud_security_posture.findings",
      data_stream: {
        dataset: "cloud_security_posture.findings",
        namespace: "default",
        type: "logs",
      },
      cloud: { provider: "gcp", region, account: { id: project.id, name: project.name } },
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
          id: "cis_gcp",
          version: "v2.0.0",
          rule_number: rule.section,
          posture_type: "cspm",
        },
        impact: isFailed
          ? `CIS GCP ${rule.section} gap may widen blast radius in ${project.id}.`
          : null,
        remediation: isFailed
          ? `Remediate per CIS GCP Foundations Benchmark section ${rule.section}.`
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
      message: `CSPM [CIS GCP / ${rule.section}] ${evaluation}: ${rule.name}`,
      log: { level: isFailed ? (rule.severity === "critical" ? "error" : "warn") : "info" },
    },
  ];
}

const CIS_GKE_GCP_RULES = [
  {
    section: "4.1.1",
    id: "cis_gke_4_1_1",
    name: "Ensure anonymous access to the API server is restricted",
    sub_type: "api-server",
    severity: "critical",
    tags: ["API Server"],
  },
  {
    section: "4.2.1",
    id: "cis_gke_4_2_1",
    name: "Ensure audit logging is enabled",
    sub_type: "api-server",
    severity: "high",
    tags: ["Logging"],
  },
  {
    section: "4.3.2",
    id: "cis_gke_4_3_2",
    name: "Ensure usage of the default namespace is minimized",
    sub_type: "Namespace",
    severity: "medium",
    tags: ["Workloads"],
  },
] as const;

export function generateGcpKspmFindings(ts: string, er: number): EcsDocument[] {
  const { region, project } = makeGcpSetup(er);
  const cluster = randGkeCluster();
  const rule = rand([...CIS_GKE_GCP_RULES]);
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
      cloud: { provider: "gcp", region, account: { id: project.id, name: project.name } },
      orchestrator: { cluster: { name: cluster } },
      resource: {
        id: `//container.googleapis.com/${cluster}`,
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
          id: "cis_gke",
          version: "v1.4.0",
          rule_number: rule.section,
          posture_type: "kspm",
        },
        impact: isFailed ? `GKE CIS ${rule.section} failure on ${cluster}.` : null,
        remediation: isFailed ? `Harden ${cluster} per CIS GKE Benchmark ${rule.section}.` : null,
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
      message: `KSPM [CIS GKE / ${rule.section}] ${evaluation}: ${rule.name} [${cluster}]`,
      log: { level: isFailed ? (rule.severity === "critical" ? "error" : "warn") : "info" },
    },
  ];
}

function auditDoc(
  ts: string,
  region: string,
  project: ReturnType<typeof makeGcpSetup>["project"],
  methodName: string,
  resourceName: string,
  message: string,
  tactic: string,
  technique: string
): EcsDocument {
  const callerIp = randIp();
  const principal = randPrincipal(project);
  return {
    "@timestamp": ts,
    __dataset: "gcp.audit",
    cloud: gcpCloud(region, project, "cloud-audit-logs"),
    gcp: {
      cloud_audit: {
        service_name: "iam.googleapis.com",
        method_name: methodName,
        resource_name: resourceName,
        caller_ip: callerIp,
        caller_type: "USER",
        authorization_decision: "ALLOWED",
        request_metadata: {
          caller_network: `projects/${project.id}/global/networks/default`,
          request_id: randId(16).toLowerCase(),
          user_agent: "Terraform/1.7.5",
        },
      },
    },
    user: { name: principal },
    source: { ip: callerIp },
    threat: { tactic: { name: tactic, id: "TA0007" }, technique: { name: technique, id: "T1580" } },
    event: {
      outcome: "success",
      category: ["iam", "configuration"],
      type: ["change"],
      duration: randInt(1_000_000, 8_000_000),
    },
    message,
    log: { level: "warn" },
  };
}

/** Service account enumeration → key material → IAM binding → token abuse */
export function generateGcpIamPrivEscChain(ts: string, _er: number): EcsDocument[] {
  const { region, project } = makeGcpSetup(0);
  const saEmail = `compromised-sa@${project.id}.iam.gserviceaccount.com`;
  const targetSa = `persistence-sa@${project.id}.iam.gserviceaccount.com`;
  return [
    auditDoc(
      ts,
      region,
      project,
      "google.iam.admin.v1.ListServiceAccounts",
      `projects/${project.id}`,
      `Cloud Audit [PrivEsc 1/4]: ListServiceAccounts by ${saEmail}`,
      "Discovery",
      "Cloud Service Discovery"
    ),
    auditDoc(
      ts,
      region,
      project,
      "google.iam.admin.v1.CreateServiceAccountKey",
      `projects/${project.id}/serviceAccounts/${targetSa}`,
      `Cloud Audit [PrivEsc 2/4]: CreateServiceAccountKey for ${targetSa}`,
      "Persistence",
      "Account Manipulation"
    ),
    auditDoc(
      ts,
      region,
      project,
      "SetIamPolicy",
      `projects/${project.id}`,
      `Cloud Audit [PrivEsc 3/4]: SetIamPolicy grants roles/owner to ${targetSa}`,
      "Privilege Escalation",
      "Valid Accounts"
    ),
    {
      ...auditDoc(
        ts,
        region,
        project,
        "generateAccessToken",
        `projects/${project.id}/serviceAccounts/${targetSa}`,
        `Cloud Audit [PrivEsc 4/4]: generateAccessToken — lateral movement`,
        "Lateral Movement",
        "Use Alternate Authentication Material"
      ),
      error: {
        code: "PrivilegeEscalation",
        message: `GCP IAM chain completed for ${targetSa}`,
        type: "security",
      },
    },
  ];
}

/** DLP sensitive data findings → VPC flow egress spike → bulk GCS reads */
export function generateGcpDataExfilChain(ts: string, _er: number): EcsDocument[] {
  const { region, project } = makeGcpSetup(0);
  const bucket = randBucket();
  const exfilIp = randIp();
  const jobName = `dlp-exfil-${randId(6)}`;

  const dlp: EcsDocument = {
    "@timestamp": ts,
    __dataset: "gcp.dlp",
    cloud: gcpCloud(region, project, "dlp"),
    gcp: {
      dlp: {
        job_name: jobName,
        inspect_template: `projects/${project.id}/inspectTemplates/pii-${randId(4)}`,
        info_type: "CREDIT_CARD",
        findings_count: randInt(800, 9000),
        bytes_scanned: randInt(50_000_000, 400_000_000),
        action: "INSPECT",
      },
    },
    source: { ip: exfilIp },
    event: { kind: "alert", outcome: "failure" },
    message: `DLP: mass sensitive findings — possible staging before exfil (${jobName})`,
    log: { level: "error" },
  };

  const vpc: EcsDocument = {
    "@timestamp": ts,
    __dataset: "gcp.vpcflow",
    cloud: gcpCloud(region, project, "vpc-flow"),
    gcp: {
      vpc_flow: {
        src_ip: exfilIp,
        dst_ip: randIp(),
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
    event: { outcome: "success", duration: randLatencyMs(2, false) * 1e6 },
    message: `VPC flow: high-volume egress from ${exfilIp} (${bucket} correlation)`,
    log: { level: "warn" },
  };

  const gcs: EcsDocument = {
    "@timestamp": ts,
    __dataset: "gcp.gcs",
    cloud: gcpCloud(region, project, "cloud-storage"),
    gcp: {
      cloud_storage: {
        bucket,
        object_name: `exports/customer-dump-${randId(8)}.parquet`,
        operation: "GET",
        size_bytes: randInt(50_000_000, 500_000_000),
        storage_class: "STANDARD",
        requester_ip: exfilIp,
        response_code: 200,
      },
    },
    source: { ip: exfilIp },
    event: { outcome: "success", duration: randInt(1e6, 8e6) },
    message: `GCS: sustained GetObject from ${exfilIp} on gs://${bucket}/exports/*`,
    log: { level: "error" },
    error: {
      code: "DataExfiltration",
      message: `Correlated DLP + VPC + GCS read burst (${bucket})`,
      type: "security",
    },
  };

  return [dlp, vpc, gcs];
}
