# Security Finding Chain

A chained event scenario modelling a realistic multi-stage threat detection workflow across native cloud security services. Each cloud variant generates **time-distributed** correlated log documents that represent a threat being detected, aggregated, and triaged across security products — step timestamps are offset so events appear in a believable order (initial detection first, hub and lake records minutes later), not all at the same second.

**Chain correlation:** every document in a run shares `labels.finding_chain_id` (alongside the native cross-product IDs below) so you can filter or join the full finding lifecycle in Kibana.

## Cloud Variants

### AWS: GuardDuty → Security Hub → Security Lake

| Step | Service              | Dataset                    | Description                                                                                                 |
| ---- | -------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1    | Amazon GuardDuty     | `aws.guardduty`            | Native threat detection (SSH brute force, crypto mining, trojan, recon) — **T+0**                           |
| 2    | AWS Security Hub     | `aws.securityhub_findings` | Finding normalized and forwarded with `related_findings` linking back to GuardDuty ARN — **T+30s–2m**       |
| 3    | Amazon Security Lake | `aws.securitylake`         | OCSF-formatted security finding with `related_finding_uid` bridging to both upstream findings — **T+1m–5m** |

**Correlation:** GuardDuty finding ARN → Security Hub `related_findings[].id` → Security Lake `finding.related_finding_uid`. Documents share `labels.finding_chain_id`, account, region, and source IP; `@timestamp` reflects the staged delays above.

### GCP: Security Command Center → SecOps SIEM → SecOps SOAR

| Step | Service                    | Dataset      | Description                                                                                  |
| ---- | -------------------------- | ------------ | -------------------------------------------------------------------------------------------- |
| 1    | Security Command Center    | `gcp.scc`    | Event Threat Detection raises a finding with severity, category, and resource name — **T+0** |
| 2    | Security Operations (SIEM) | `gcp.secops` | Rule detection promotes the finding, opens a case, and records matched events — **T+1m**     |
| 3    | Security Operations (SOAR) | `gcp.secops` | Case creation for SOC triage with linked finding and playbook — **T+3m**                     |

**Correlation:** SCC `finding_id` → SecOps `related_scc_finding_id` → SecOps `source_finding_id`. Case ID links the SIEM detection `case_name` to the SOAR `case_id`. Shared `labels.finding_chain_id`, source IP, and severity across all documents.

### Azure: Defender for Cloud → Sentinel → Activity Log

| Step | Service            | Dataset              | Description                                                                                 |
| ---- | ------------------ | -------------------- | ------------------------------------------------------------------------------------------- |
| 1    | Defender for Cloud | `azure.defender`     | Security alert with severity, intent, compromised entity, and source IP — **T+0**           |
| 2    | Microsoft Sentinel | `azure.sentinel`     | Incident created from the Defender alert with MITRE tactics mapping — **T+2m**              |
| 3    | Azure Activity Log | `azure.activity_log` | Resource provider operation confirming incident write to Log Analytics workspace — **T+5m** |

**Correlation:** Defender `alert_id` → Sentinel `related_alert_ids` → Activity Log `defender_alert_id`. Sentinel `incident_id` is also present on the Activity Log document. Shared `labels.finding_chain_id` and source IP across Defender and Sentinel.

## Detection Story

The chain models the standard **detect → aggregate → triage** workflow:

1. A native cloud threat detector identifies suspicious activity
2. The finding is normalized and correlated into a central security hub
3. An operational record is created for SOC investigation

All steps produce `event.outcome: "failure"` and `log.level: "error"` for the alert path, making them discoverable via standard security queries.

## Supporting Elastic assets

Installed with the Cloud Loadgen installers (tagged `cloudloadgen`):

| Cloud | Dashboard                                     | Alert rules (JSON)                                  | ML jobs (JSON)                                    |
| ----- | --------------------------------------------- | --------------------------------------------------- | ------------------------------------------------- |
| AWS   | `security-finding-chain-dashboard.json`       | `security-finding-chain-rules.json` (4 rules)       | `security-finding-chain-jobs.json` (4 jobs)       |
| GCP   | `gcp-security-finding-chain-dashboard.json`   | `gcp-security-finding-chain-rules.json` (4 rules)   | `gcp-security-finding-chain-jobs.json` (4 jobs)   |
| Azure | `azure-security-finding-chain-dashboard.json` | `azure-security-finding-chain-rules.json` (4 rules) | `azure-security-finding-chain-jobs.json` (4 jobs) |

Use `npm run setup:{aws,gcp,azure}-dashboards`, `npm run setup:{aws,gcp,azure}-ml-jobs`, and `npm run setup:alert-rules` (or the web UI **Setup** step) to install them.

## Selecting This Chain

1. Set event type to **Logs** in the wizard.
2. On the **Chained Events** step, select the **Security Finding Chain**.
3. Adjust the **Error rate** slider to control the mix of threat types generated.
