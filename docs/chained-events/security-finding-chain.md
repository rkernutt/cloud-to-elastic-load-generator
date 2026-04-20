# Security Finding Chain

A chained event scenario modelling a realistic multi-stage threat detection workflow across native cloud security services. Each cloud variant generates correlated log documents that represent a threat being detected, aggregated, and triaged across security products.

## Cloud Variants

### AWS: GuardDuty → Security Hub → Security Lake

| Step | Service              | Dataset                    | Description                                                                                   |
| ---- | -------------------- | -------------------------- | --------------------------------------------------------------------------------------------- |
| 1    | Amazon GuardDuty     | `aws.guardduty`            | Native threat detection (SSH brute force, crypto mining, trojan, recon)                       |
| 2    | AWS Security Hub     | `aws.securityhub_findings` | Finding normalized and forwarded with `related_findings` linking back to GuardDuty ARN        |
| 3    | Amazon Security Lake | `aws.securitylake`         | OCSF-formatted security finding with `related_finding_uid` bridging to both upstream findings |

**Correlation:** GuardDuty finding ARN → Security Hub `related_findings[].id` → Security Lake `finding.related_finding_uid`. All documents share the same timestamp, account, region, and source IP.

### GCP: Security Command Center → Chronicle → Security Operations

| Step | Service                 | Dataset         | Description                                                                        |
| ---- | ----------------------- | --------------- | ---------------------------------------------------------------------------------- |
| 1    | Security Command Center | `gcp.scc`       | Event Threat Detection raises a finding with severity, category, and resource name |
| 2    | Chronicle               | `gcp.chronicle` | Rule detection promotes the finding, opens a case, and records matched events      |
| 3    | Security Operations     | `gcp.secops`    | Case creation for SOC triage with linked finding and playbook                      |

**Correlation:** SCC `finding_id` → Chronicle `related_scc_finding_id` → SecOps `source_finding_id`. Case ID links Chronicle `case_name` to SecOps `case_id`. Shared source IP and severity across all documents.

### Azure: Defender for Cloud → Sentinel → Activity Log

| Step | Service            | Dataset              | Description                                                                      |
| ---- | ------------------ | -------------------- | -------------------------------------------------------------------------------- |
| 1    | Defender for Cloud | `azure.defender`     | Security alert with severity, intent, compromised entity, and source IP          |
| 2    | Microsoft Sentinel | `azure.sentinel`     | Incident created from the Defender alert with MITRE tactics mapping              |
| 3    | Azure Activity Log | `azure.activity_log` | Resource provider operation confirming incident write to Log Analytics workspace |

**Correlation:** Defender `alert_id` → Sentinel `related_alert_ids` → Activity Log `defender_alert_id`. Sentinel `incident_id` is also present on the Activity Log document. Shared source IP across Defender and Sentinel.

## Detection Story

The chain models the standard **detect → aggregate → triage** workflow:

1. A native cloud threat detector identifies suspicious activity
2. The finding is normalized and correlated into a central security hub
3. An operational record is created for SOC investigation

All steps produce `event.outcome: "failure"` and `log.level: "error"` for the alert path, making them discoverable via standard security queries.

## Selecting This Chain

1. Set event type to **Logs** in the wizard.
2. On the **Chained Events** step, select the **Security Finding Chain**.
3. Adjust the **Error rate** slider to control the mix of threat types generated.
