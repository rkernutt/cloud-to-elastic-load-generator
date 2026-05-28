export interface AgentToolDef {
  id: string;
  type: "esql" | "index_search" | "workflow";
  description: string;
  configuration: Record<string, unknown>;
  tags?: string[];
}

export interface AgentDef {
  id: string;
  name: string;
  description: string;
  instructions: string;
  toolIds: string[];
}

// Cloud vendor is "aws" | "gcp" | "azure"
export function getAgentTools(vendor: string): AgentToolDef[] {
  const logPattern = `logs-${vendor}.*`;

  return [
    {
      id: `cloudloadgen-${vendor}-error-summary`,
      type: "esql",
      description: `Summarises ${vendor.toUpperCase()} service errors by service, region, and error code for a given time window.`,
      configuration: {
        query: `FROM ${logPattern} | WHERE event.outcome == "failure" AND @timestamp >= NOW() - ?hours::integer * 1h | STATS error_count = COUNT(*) BY event.dataset, cloud.region, error.code | SORT error_count DESC | LIMIT 20`,
        params: {
          hours: { type: "integer", description: "Look-back window in hours (e.g. 1, 6, 24)" },
        },
      },
      tags: ["cloudloadgen"],
    },
    {
      id: `cloudloadgen-${vendor}-service-health`,
      type: "esql",
      description: `Shows ${vendor.toUpperCase()} service health — success/failure counts and error rate per service over the last N hours.`,
      configuration: {
        query: `FROM ${logPattern} | WHERE @timestamp >= NOW() - ?hours::integer * 1h | STATS total = COUNT(*), failures = SUM(CASE(event.outcome == "failure", 1, 0)) BY event.dataset | EVAL error_rate = ROUND(failures * 100.0 / total, 2) | SORT error_rate DESC | LIMIT 20`,
        params: {
          hours: { type: "integer", description: "Look-back window in hours" },
        },
      },
      tags: ["cloudloadgen"],
    },
    {
      id: `cloudloadgen-${vendor}-top-errors`,
      type: "esql",
      description: `Lists the most frequent error messages from ${vendor.toUpperCase()} services in the given time window.`,
      configuration: {
        query: `FROM ${logPattern} | WHERE event.outcome == "failure" AND @timestamp >= NOW() - ?hours::integer * 1h | STATS count = COUNT(*) BY error.code, error.message | SORT count DESC | LIMIT 15`,
        params: {
          hours: { type: "integer", description: "Look-back window in hours" },
        },
      },
      tags: ["cloudloadgen"],
    },
    {
      id: `cloudloadgen-${vendor}-ml-anomalies`,
      type: "esql",
      description: `Queries ML anomaly detection results for ${vendor.toUpperCase()} jobs — shows jobs with the highest anomaly scores.`,
      configuration: {
        query: `FROM .ml-anomalies-* | WHERE anomaly_score > 0 AND job_id LIKE "${vendor}-*" | STATS max_score = MAX(anomaly_score), latest = MAX(timestamp) BY job_id | SORT max_score DESC | LIMIT 20`,
        params: {},
      },
      tags: ["cloudloadgen"],
    },
    {
      id: `cloudloadgen-${vendor}-logs-search`,
      type: "index_search",
      description: `Search ${vendor.toUpperCase()} log data — find specific events, error messages, or patterns across all ${vendor.toUpperCase()} services.`,
      configuration: {
        pattern: logPattern,
      },
      tags: ["cloudloadgen"],
    },
    {
      id: `cloudloadgen-${vendor}-trace-latency`,
      type: "esql",
      description: `Shows ${vendor.toUpperCase()} service trace latency percentiles and throughput. Identifies slow services.`,
      configuration: {
        query: `FROM traces-apm* | WHERE service.name LIKE "${vendor}-*" AND @timestamp >= NOW() - ?hours::integer * 1h | STATS p50 = PERCENTILE(transaction.duration.us, 50), p95 = PERCENTILE(transaction.duration.us, 95), p99 = PERCENTILE(transaction.duration.us, 99), throughput = COUNT(*) BY service.name | SORT p99 DESC | LIMIT 20`,
        params: {
          hours: { type: "integer", description: "Look-back window in hours" },
        },
      },
      tags: ["cloudloadgen"],
    },
    {
      id: `cloudloadgen-${vendor}-security-findings`,
      type: "esql",
      description: `Summarises ${vendor.toUpperCase()} security findings — compliance failures, GuardDuty/Defender alerts, and posture checks.`,
      configuration: {
        query: `FROM logs-${vendor}.*,logs-cloud_security_posture.* | WHERE (event.kind == "alert" OR event.category == "configuration") AND @timestamp >= NOW() - ?hours::integer * 1h | STATS count = COUNT(*) BY rule.name, event.outcome | SORT count DESC | LIMIT 20`,
        params: {
          hours: { type: "integer", description: "Look-back window in hours" },
        },
      },
      tags: ["cloudloadgen"],
    },
  ];
}

export function getSecurityTools(): AgentToolDef[] {
  return [
    {
      id: "cloudloadgen-soc-attack-timeline",
      type: "esql",
      description:
        "Reconstructs the full attack timeline by correlating events across CloudTrail, GuardDuty, and VPC Flow logs. Use to trace an attack chain from initial access to impact.",
      configuration: {
        query: `FROM logs-aws.cloudtrail*,logs-aws.guardduty*,logs-aws.vpcflow* | WHERE @timestamp >= NOW() - ?hours::integer * 1h AND (labels.attack_session_id IS NOT NULL OR event.category == "intrusion_detection") | STATS count = COUNT(*) BY event.action, event.dataset, source.ip, user.name, @timestamp | SORT @timestamp ASC | LIMIT 50`,
        params: {
          hours: {
            type: "integer",
            description: "Look-back window in hours (e.g. 1, 6, 24)",
          },
        },
      },
      tags: ["cloudloadgen", "security", "soc"],
    },
    {
      id: "cloudloadgen-soc-iam-privesc-details",
      type: "esql",
      description:
        "Retrieves IAM privilege escalation events — ListUsers, CreateAccessKey, AttachUserPolicy, AssumeRole — with attacker identity and MITRE ATT&CK context.",
      configuration: {
        query: `FROM logs-aws.cloudtrail* | WHERE @timestamp >= NOW() - ?hours::integer * 1h AND event.category == "iam" AND (event.action == "CreateAccessKey" OR event.action == "AttachUserPolicy" OR event.action == "AssumeRole" OR event.action == "ListUsers") | KEEP @timestamp, event.action, user.name, source.ip, event.outcome, labels.attack_session_id, labels.target_user, threat.tactic.name, threat.technique.name | SORT @timestamp ASC | LIMIT 50`,
        params: {
          hours: { type: "integer", description: "Look-back window in hours" },
        },
      },
      tags: ["cloudloadgen", "security", "soc"],
    },
    {
      id: "cloudloadgen-soc-attacker-ip-activity",
      type: "esql",
      description:
        "Analyses all activity from a specific IP address across all log sources to assess scope of compromise.",
      configuration: {
        query: `FROM logs-aws.*,logs-gcp.*,logs-azure.* | WHERE source.ip == ?ip AND @timestamp >= NOW() - ?hours::integer * 1h | STATS actions = COUNT(*) BY event.dataset, event.action, event.outcome | SORT actions DESC | LIMIT 30`,
        params: {
          ip: { type: "string", description: "Source IP address to investigate" },
          hours: { type: "integer", description: "Look-back window in hours" },
        },
      },
      tags: ["cloudloadgen", "security", "soc"],
    },
    {
      id: "cloudloadgen-soc-security-alerts",
      type: "esql",
      description:
        "Lists Elastic Security alerts with rule name, severity, risk score, and MITRE tactic. Use to understand the alert landscape before triaging with Attack Discovery.",
      configuration: {
        query: `FROM .alerts-security.alerts-* | WHERE @timestamp >= NOW() - ?hours::integer * 1h AND kibana.alert.status != "closed" | STATS count = COUNT(*) BY kibana.alert.rule.name, kibana.alert.severity, kibana.alert.risk_score | SORT count DESC | LIMIT 30`,
        params: {
          hours: { type: "integer", description: "Look-back window in hours" },
        },
      },
      tags: ["cloudloadgen", "security", "soc"],
    },
    {
      id: "cloudloadgen-soc-cmdb-enrichment",
      type: "esql",
      description:
        "Looks up ServiceNow CMDB context for an affected CI — returns owner, IP address, hostname, support group, and department.",
      configuration: {
        query: `FROM logs-servicenow.event-* | WHERE tags == "cmdb_ci" AND @timestamp >= NOW() - 30d | KEEP servicenow.event.name.value, servicenow.event.ip_address.value, servicenow.event.fqdn.value, servicenow.event.owned_by.display_value, servicenow.event.support_group.display_value, servicenow.event.department.display_value, servicenow.event.category.value, servicenow.event.environment.value | LIMIT 20`,
        params: {},
      },
      tags: ["cloudloadgen", "security", "soc", "cmdb"],
    },
    {
      id: "cloudloadgen-soc-enriched-alerts",
      type: "index_search",
      description:
        "Search enriched security alerts that have been correlated with CMDB context — includes attacker IP, hostname, CI owner.",
      configuration: {
        pattern: "logs-security-alert-enriched-*",
      },
      tags: ["cloudloadgen", "security", "soc"],
    },
    {
      id: "cloudloadgen-soc-guardduty-findings",
      type: "esql",
      description:
        "Lists GuardDuty findings with severity, finding type, and affected resources. Filters by severity level.",
      configuration: {
        query: `FROM logs-aws.guardduty* | WHERE @timestamp >= NOW() - ?hours::integer * 1h | STATS count = COUNT(*) BY event.action, event.severity, source.ip | SORT event.severity DESC, count DESC | LIMIT 20`,
        params: {
          hours: { type: "integer", description: "Look-back window in hours" },
        },
      },
      tags: ["cloudloadgen", "security", "soc"],
    },
  ];
}

export function getSecurityAgentDef(): AgentDef {
  const tools = getSecurityTools();
  return {
    id: "cloudloadgen-soc-analyst",
    name: "Cloud Loadgen SOC Analyst",
    description:
      "AI-powered SOC analyst for investigating security incidents — traces attack chains across CloudTrail, GuardDuty, and VPC Flow logs, enriches with ServiceNow CMDB context (IP, hostname, owner), and summarises findings for triage.",
    instructions: [
      "You are a Security Operations Centre (SOC) analyst investigating cloud security incidents.",
      "Use the available tools to trace attack chains, identify compromised accounts, and assess blast radius.",
      "Always start by checking the attack timeline to understand the sequence of events.",
      "When investigating IAM privilege escalation, trace the full chain: reconnaissance → persistence → escalation → lateral movement.",
      "For each attacker IP, check all activity across CloudTrail, GuardDuty, and VPC Flow logs.",
      "Enrich findings with ServiceNow CMDB context to identify affected CI owners and support groups.",
      "Report the originating IP address and hostname of the attack source.",
      "Include MITRE ATT&CK tactic and technique references when describing attack stages.",
      "Recommend immediate containment actions (revoke keys, disable users, block IPs) based on severity.",
      "Keep responses structured: timeline, affected assets, CMDB context, recommended actions.",
    ].join(" "),
    toolIds: [...tools.map((t) => t.id), "platform.core.esql", "platform.core.search"],
  };
}

export function getAgentDef(vendor: string): AgentDef {
  const tools = getAgentTools(vendor);
  const v = vendor.toUpperCase();
  return {
    id: `cloudloadgen-${vendor}-analyst`,
    name: `Cloud Loadgen ${v} Analyst`,
    description: `AI analyst for ${v} cloud infrastructure — queries logs, traces, ML anomalies, and security findings generated by Cloud Loadgen.`,
    instructions: [
      `You are an infrastructure analyst for ${v} cloud services.`,
      `Use the available tools to answer questions about service health, errors, latency, anomalies, and security findings.`,
      `Always specify a reasonable time window (default to 24 hours if the user doesn't specify).`,
      `When reporting errors, include the service name, region, and error code.`,
      `For latency analysis, report p50, p95, and p99 percentiles.`,
      `Flag any ML anomaly scores above 75 as critical and above 50 as warning.`,
      `Keep responses concise and use tables when presenting multiple data points.`,
    ].join(" "),
    toolIds: [...tools.map((t) => t.id), "platform.core.esql", "platform.core.search"],
  };
}
