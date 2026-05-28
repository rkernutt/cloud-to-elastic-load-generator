# AI SOC Demo Setup Guide

Run a live Security Operations Centre demo with Attack Discovery, Agent Builder, and ServiceNow CMDB enrichment — all powered by Cloud Loadgen data.

## What the demo shows

| Feature              | What the audience sees                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Attack Discovery** | 50+ security alerts automatically grouped into a correlated IAM privilege escalation attack pattern                                               |
| **Agent Builder**    | A conversational SOC analyst that traces the attack chain, looks up CMDB context, and recommends containment                                      |
| **Workflow**         | A security alert fires and is automatically enriched with the originating IP address, hostname, CI owner, and open incidents from ServiceNow CMDB |
| **Detection Rules**  | 16 custom Elastic Security detection rules with MITRE ATT&CK mappings, severity, and risk scores                                                  |
| **Knowledge Base**   | 364 indexed documents — runbooks, investigation guides, and detection rule context — enabling grounded Agent Builder responses                    |

## Prerequisites

- Elastic Cloud Hosted or Serverless (Security or Observability project)
- Stack 9.3+ (Workflows require 9.3+; `cases.createCase` needs 9.4+)
- API key with Security > All + Stack Management > All privileges
- Cloud Loadgen running and shipping data

## Quick start

```bash
# 1. Ship chain generator data (IAM PrivEsc + Security + Data Exfil)
#    At least 10 minutes of data to accumulate 50+ detection alerts.
#    Enable these generators in the UI or via config:
#    - iam-privesc-chain (primary scenario)
#    - security-chain (supplementary)
#    - data-exfil-chain (supplementary)
#    - cmdb (ServiceNow CMDB correlation data)

# 2. Install detection rules
npm run setup:security-detection-rules

# 3. Install everything else via the setup wizard (or CLI)
#    The wizard installs:
#    - Security Alert Enrichment workflow (auto-installed with data-pipeline workflow)
#    - SOC Analyst Agent Builder (auto-installed with vendor analyst)
#    - Dashboards, ML jobs, alerting rules
```

## Step-by-step

### 1. Start shipping security data

Enable the following generators in the Cloud Loadgen UI:

| Generator             | Purpose                           | Data produced                                                                                |
| --------------------- | --------------------------------- | -------------------------------------------------------------------------------------------- |
| **iam-privesc-chain** | Primary attack scenario           | 4-5 CloudTrail events per cycle: ListUsers → CreateAccessKey → AttachUserPolicy → AssumeRole |
| **security-chain**    | GuardDuty + Security Hub findings | HIGH/CRITICAL findings, compliance failures                                                  |
| **data-exfil-chain**  | S3 exfiltration indicators        | GetObject bursts, VPC flow anomalies                                                         |
| **cmdb**              | ServiceNow CMDB records           | CIs (including security infrastructure), users, incidents, change requests                   |
| **guardduty**         | Standalone GuardDuty              | Additional finding volume for Attack Discovery                                               |
| **cloudtrail**        | CloudTrail audit trail            | API call audit logs                                                                          |

Ship for at least **10 minutes** before opening Attack Discovery — the detection rules run on 5-minute intervals, so two rule cycles produce enough alerts.

### 2. Install Elastic Security detection rules

```bash
npm run setup:security-detection-rules
```

This installs 16 detection rules via the Detection Engine API:

**IAM Privilege Escalation (6 rules)**

- IAM Access Key Created for Another User
- AdministratorAccess Policy Attached to User
- AssumeRole to AdminRole from Non-Corporate IP
- IAM User Enumeration (ListUsers)
- IAM API Call Without MFA Authentication
- Multiple IAM Privilege Changes from Single IP (threshold)

**Security Findings (6 rules)**

- GuardDuty HIGH or CRITICAL Finding
- GuardDuty Cryptocurrency Mining Detection
- Security Hub Compliance Check Failed
- Security Lake OCSF Security Finding
- AWS Root Account API Activity
- CloudTrail Logging Stopped or Deleted

**Data Exfiltration (4 rules)**

- GuardDuty S3 Data Exfiltration Finding
- S3 Mass Object Access (threshold)
- VPC Flow Unusually High Egress Volume
- WAF Block Rate Spike

All rules include MITRE ATT&CK tactic/technique mappings and are tagged `Attack Discovery` so the workflow can count related alerts.

### 3. Install the SOC Analyst Agent Builder

The setup wizard automatically installs the SOC Analyst agent alongside the vendor-specific analyst. The SOC Analyst has 7 security-focused tools:

| Tool                       | What it does                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| `soc-attack-timeline`      | Reconstructs the attack chain across CloudTrail, GuardDuty, VPC Flow                             |
| `soc-iam-privesc-details`  | IAM escalation events with MITRE context                                                         |
| `soc-attacker-ip-activity` | All activity from a specific IP across all log sources                                           |
| `soc-security-alerts`      | Elastic Security alert summary with severity and risk                                            |
| `soc-cmdb-enrichment`      | ServiceNow CMDB context: CI owner, IP, hostname                                                  |
| `soc-enriched-alerts`      | Workflow-enriched alerts with full CMDB context                                                  |
| `soc-guardduty-findings`   | GuardDuty finding breakdown                                                                      |
| `soc-knowledge-base`       | Searches investigation runbooks, containment procedures, and MITRE context for grounded guidance |

### 4. Install the SOC Knowledge Base

The setup wizard automatically indexes 364 knowledge base documents when Agent Builder is enabled. The knowledge base includes:

| Category              | Documents | Content                                                                    |
| --------------------- | --------- | -------------------------------------------------------------------------- |
| Detection rule guides | 259       | Investigation guides embedded in all AWS/GCP/Azure alerting rules          |
| Runbooks              | 40        | Detailed triage, ES\|QL queries, containment, and escalation procedures    |
| Chain references      | 40        | Correlation IDs, service relationships, and failure modes for chain events |
| Workflow guides       | 12        | Alert enrichment workflow configuration and customization                  |
| SOC guides            | 7         | Demo setup, architecture, and operational procedures                       |
| Reference docs        | 6         | Advanced data types, CSPM/KSPM, CMDB architecture                          |

The index (`kb-cloudloadgen-soc`) uses `semantic_text` when ELSER is available, falling back to standard BM25 text search otherwise.

You can also install the knowledge base standalone:

```bash
# Interactive installer (prompts for connection details and semantic/text choice)
npm run setup:knowledge-base

# Generate NDJSON only (no Elasticsearch connection needed)
npm run generate:knowledge-base
```

### 5. Install the Security Alert Enrichment workflow

The security workflow is installed automatically alongside the data-pipeline workflow when you enable "Alert-enrichment Workflow" in the setup wizard. After install:

1. **Review the notification step** — default is email via `elastic-cloud-email`
2. **Attach to detection rules** — via Security → Rules → Actions → Workflow
3. **Enable the workflow** — flip the toggle in Stack Management → Workflows

The workflow enriches security alerts with:

- **Attacker source IP** from CloudTrail events
- **Attacker user identity** and user agent
- **Target CI** from ServiceNow CMDB (name, IP, hostname/FQDN)
- **CI owner**, support group, department, and location
- **Open incident count** and recent change requests
- **Related security alert count** (for Attack Discovery context)

### 6. CMDB data for the demo

The CMDB generator produces security infrastructure CIs that correlate with the attack chain:

| CI Name                             | Category | Description                   |
| ----------------------------------- | -------- | ----------------------------- |
| `iam-admin-role`                    | Identity | Privileged cross-account role |
| `compromised-developer-workstation` | Compute  | Developer EC2 instance        |
| `guardduty-findings-aggregator`     | Security | GuardDuty aggregator          |
| `cloudtrail-audit-trail`            | Security | Management event logging      |
| `securityhub-central`               | Security | Compliance finding hub        |
| `vpc-prod-us-east-1`                | Network  | Production VPC                |
| `waf-api-gateway`                   | Security | WAF protection                |
| `s3-sensitive-data-bucket`          | Storage  | PII/financial data bucket     |

Plus security-themed incidents:

- Unauthorized IAM access key creation
- AdministratorAccess policy attached without change request
- GuardDuty HIGH severity finding
- S3 data exfiltration attempt
- CloudTrail logging interruption

## Demo walkthrough

### Scenario: IAM Privilege Escalation

**Narrative:** A developer's credentials are compromised. The attacker enumerates IAM users, creates a new access key for a target user, escalates to admin, and assumes a privileged role.

1. **Show the alert** — Open Security → Alerts. Point out the detection rules firing with MITRE ATT&CK tactics (Discovery → Persistence → Privilege Escalation → Lateral Movement).

2. **Show the workflow enrichment** — Click into an alert. The workflow has added:
   - The originating IP address of the attack
   - The hostname of the compromised workstation
   - The CI owner and support group from ServiceNow CMDB
   - Open incidents and recent changes on the affected infrastructure

3. **Open Attack Discovery** — Security → Attack Discovery. The feature groups the 50+ alerts into a coherent attack pattern, showing the escalation chain.

4. **Triage with Attack Discovery** — Use the automated triage to acknowledge and classify the correlated alerts.

5. **Investigate with Agent Builder** — Open the SOC Analyst agent. Ask:
   - "What happened in the last hour?"
   - "Show me the full attack timeline"
   - "What IAM privilege escalation events occurred?"
   - "Who owns the compromised infrastructure?"
   - "What's the CMDB context for the affected CIs?"
   - "What containment actions do you recommend?"
   - "What does the runbook say about this type of attack?" (triggers KB search)
   - "What MITRE ATT&CK techniques are involved?" (grounded in indexed rule guides)

## Troubleshooting

| Symptom                              | Cause                                | Fix                                                  |
| ------------------------------------ | ------------------------------------ | ---------------------------------------------------- |
| Attack Discovery shows no patterns   | Fewer than 50 alerts                 | Ship data longer; check Security → Alerts for count  |
| Detection rules not firing           | Data not in correct index patterns   | Verify `logs-aws.cloudtrail*` has documents          |
| Workflow enrichment fields are blank | CMDB data not shipped                | Enable the `cmdb` generator                          |
| Agent Builder SOC analyst missing    | Setup didn't include Agent Builder   | Re-run setup wizard with Agent Builder enabled       |
| Workflow not running                 | Not attached to rules or not enabled | See workflow deployment guide                        |
| KB search returns no results         | Index not populated                  | Run `npm run setup:knowledge-base` or re-run wizard  |
| Agent gives generic advice           | KB tool not registered               | Ensure `soc-knowledge-base` tool is in Agent Builder |

## Related docs

- [Workflow deployment guide](./workflow-deployment.md) — full deployment matrix and troubleshooting
- [Advanced data types](./advanced-data-types.md) — chain generators, CMDB, CSPM/KSPM
- [Installer README](../installer/README.md) — per-service alerting rules and detection rules
