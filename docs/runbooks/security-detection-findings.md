# Runbook — Security Finding Detection Rules

Investigation and remediation guides for the six Elastic Security detection rules that target **security findings** — GuardDuty threats, Security Hub compliance, Security Lake OCSF, root account activity, and CloudTrail logging tampering.

> **Linked dashboard:** `Security Finding Chain — overview`
> **MITRE ATT&CK coverage:** Impact (TA0040), Defense Evasion (TA0005), Privilege Escalation (TA0004)
> **Agent Builder:** Ask the SOC Analyst: _"Show me GuardDuty findings from the last hour"_

| Rule                                      | Severity | Risk | MITRE Technique |
| ----------------------------------------- | -------- | ---- | --------------- |
| GuardDuty HIGH or CRITICAL Finding        | High     | 73   | T1496           |
| GuardDuty Cryptocurrency Mining Detection | High     | 73   | T1496           |
| Security Hub Compliance Check Failed      | Medium   | 47   | T1562.001       |
| Security Lake OCSF Security Finding       | High     | 73   | —               |
| AWS Root Account API Activity             | Critical | 99   | T1078.004       |
| CloudTrail Logging Stopped or Deleted     | Critical | 99   | T1562.008       |

---

## 1. `[CloudLoadGen] GuardDuty HIGH or CRITICAL Finding`

**Severity:** High | **Risk Score:** 73
**MITRE:** Impact → Resource Hijacking (T1496)

### What this means

AWS GuardDuty raised a HIGH or CRITICAL severity finding. GuardDuty's threat intelligence and ML models have high confidence this is malicious activity. Finding types include `Backdoor`, `Trojan`, `Exfiltration`, `CryptoCurrency`, `PrivilegeEscalation`, and more.

### Five-minute triage

1. **Read the finding type.** The `aws.guardduty.type` field tells you the attack category — each type has a specific playbook.
2. **Identify the resource.** Instance ID, IAM user, or S3 bucket from the finding's resource details.
3. **Check for related chains.** If the finding is `Exfiltration*`, cross-reference with the [Data Exfil runbook](./security-detection-exfil.md). If `*PrivilegeEscalation*`, check the [IAM PrivEsc runbook](./security-detection-iam-privesc.md).

### Investigation queries

#### HIGH/CRITICAL findings breakdown

```esql
FROM logs-aws.guardduty-*
| WHERE @timestamp > NOW() - 1h AND (event.severity >= 7 OR message LIKE "*HIGH*" OR message LIKE "*CRITICAL*")
| KEEP @timestamp, event.action, event.severity, source.ip, destination.ip, message
| SORT @timestamp DESC
| LIMIT 25
```

#### Historical frequency of this finding type

```esql
FROM logs-aws.guardduty-*
| WHERE @timestamp > NOW() - 30d
| STATS count = COUNT(*) BY event.action
| SORT count DESC
| LIMIT 20
```

### Containment & remediation

1. **Open a security case** — the workflow does this automatically if attached.
2. **Follow the finding-type playbook:**
   - `Backdoor*` → Isolate the instance, snapshot for forensics.
   - `Trojan*` → Quarantine, scan with endpoint protection.
   - `Exfiltration*` → Block the destination IP, rotate credentials.
   - `CryptoCurrency*` → Terminate the instance, check for lateral spread.
   - `PrivilegeEscalation*` → Follow [IAM PrivEsc runbook](./security-detection-iam-privesc.md).
3. **Snapshot evidence** before any destructive containment.

### When to escalate

- **Always page on-call** for HIGH/CRITICAL findings.
- Page leadership if customer data or production identity systems are implicated.
- Engage IR team if the finding involves data exfiltration.

---

## 2. `[CloudLoadGen] GuardDuty Cryptocurrency Mining Detection`

**Severity:** High | **Risk Score:** 73
**MITRE:** Impact → Resource Hijacking (T1496)

### What this means

GuardDuty detected cryptocurrency mining activity on your infrastructure — typically an EC2 instance communicating with known mining pools. This indicates the instance is compromised and being used for unauthorised compute.

### Five-minute triage

1. **Identify the instance.** Check `aws.guardduty.resource.instance_details.instance_id`.
2. **Check the instance role.** If the instance has a privileged IAM role, the attacker may have pivoted to other services.
3. **Is the instance internet-facing?** Check security groups and public IP assignment.

### Investigation queries

#### Mining detection details

```esql
FROM logs-aws.guardduty-*
| WHERE @timestamp > NOW() - 1h
| WHERE message LIKE "*CryptoCurrency*" OR message LIKE "*BitcoinTool*" OR message LIKE "*crypto*"
| KEEP @timestamp, event.action, source.ip, destination.ip, message
| SORT @timestamp DESC
```

#### Instance role activity (did the attacker pivot?)

```esql
FROM logs-aws.cloudtrail-*
| WHERE @timestamp > NOW() - 6h
| WHERE source.ip == "<instance_private_ip>"
| STATS actions = COUNT(*) BY event.action, event.outcome
| SORT actions DESC
| LIMIT 20
```

### Containment & remediation

1. **Terminate the instance** — crypto miners should be killed, not isolated.
2. **Revoke the instance role's sessions** and rotate any secrets the instance had access to.
3. **Check for lateral movement** — did the instance role access other services, create keys, or assume roles?
4. **Investigate initial access** — how did the attacker get in? Check SSH keys, exposed APIs, vulnerable software.
5. **Block known mining pool IPs** at the VPC level.

### When to escalate

- The instance has a privileged role (admin, data access).
- Multiple instances are mining (lateral spread).
- The instance was customer-facing.

---

## 3. `[CloudLoadGen] Security Hub Compliance Check Failed`

**Severity:** Medium | **Risk Score:** 47
**MITRE:** Defense Evasion → Disable or Modify Tools (T1562.001)

### What this means

AWS Security Hub found one or more compliance checks in FAILED status — security controls that your resources should pass but don't. This is a **posture** signal: it indicates drift from your security baseline.

### Five-minute triage

1. **Which controls failed?** Check the compliance control ID and severity.
2. **Was this caused by a recent change?** Cross-reference with ServiceNow change requests.
3. **Is the resource production?** Production failures need immediate remediation; non-production can be ticketed.

### Investigation queries

#### Failed compliance checks

```esql
FROM logs-aws.securityhub-*
| WHERE @timestamp > NOW() - 1h AND event.outcome == "failure"
| KEEP @timestamp, message, event.action
| SORT @timestamp DESC
| LIMIT 25
```

#### Recent changes that might explain the drift

```esql
FROM logs-servicenow.event-*
| WHERE tags == "change_request" AND @timestamp > NOW() - 7d
| KEEP servicenow.event.number.value, servicenow.event.short_description.value,
       servicenow.event.state.display_value
| SORT @timestamp DESC
| LIMIT 10
```

### Containment & remediation

1. **For each failed control**, follow the remediation guidance in the Security Hub finding.
2. **Production + HIGH severity** → Fix today.
3. **Non-production or LOW severity** → Create a posture-debt ticket.
4. **If caused by a change request** → review the change and update the guardrails.

### When to escalate

- The failed control is in your regulatory compliance framework (PCI, HIPAA, SOC 2).
- Multiple resources fail the same control simultaneously.
- A production resource fails a critical control.

---

## 4. `[CloudLoadGen] Security Lake OCSF Security Finding`

**Severity:** High | **Risk Score:** 73

### What this means

AWS Security Lake received a high-severity OCSF-normalized security finding. Security Lake aggregates findings from multiple sources (GuardDuty, Macie, Inspector, third-party tools) into a single data lake with a standardised schema.

### Five-minute triage

1. **Check the original source.** Security Lake OCSF docs have a `metadata.product.name` that tells you which tool generated the finding.
2. **Check severity.** Compare `event.severity` and `log.level` to determine urgency.
3. **Cross-reference.** If the finding also appears in GuardDuty or Security Hub, follow those runbooks.

### Investigation queries

```esql
FROM logs-aws.securitylake-*
| WHERE @timestamp > NOW() - 1h AND (event.severity >= 7 OR log.level IN ("error", "warn"))
| KEEP @timestamp, event.action, event.severity, log.level, message
| SORT @timestamp DESC
| LIMIT 25
```

### Containment & remediation

- Follow the source-specific playbook (GuardDuty, Macie, Inspector).
- If the source tool is a third-party integration, check that tool's documentation for response procedures.

---

## 5. `[CloudLoadGen] AWS Root Account API Activity`

**Severity:** Critical | **Risk Score:** 99
**MITRE:** Privilege Escalation → Cloud Accounts (T1078.004)

### What this means

API calls were made using the AWS root account. Root should be used exclusively for a small set of account-management tasks (changing support plan, closing the account). Any other API activity from root — especially IAM, EC2, or S3 operations — is a critical security event.

### Five-minute triage

1. **What action was performed?** Root calling CreateUser, CreateAccessKey, or DeleteTrail is an emergency.
2. **From where?** Check `source.ip` — root activity from an unknown IP is confirmed compromise.
3. **Was MFA used?** Root without MFA means the root credentials (email + password) are compromised.

### Investigation queries

#### Root account activity

```esql
FROM logs-aws.cloudtrail-*
| WHERE @timestamp > NOW() - 24h
| WHERE user.name == "root" OR message LIKE "*Root*"
| KEEP @timestamp, event.action, source.ip, user_agent.original, event.outcome
| SORT @timestamp DESC
| LIMIT 50
```

### Containment & remediation

1. **Change the root password immediately** from a trusted device.
2. **Enable MFA on root** if not already enabled.
3. **Delete any root access keys** — `aws iam delete-access-key --user-name root`
4. **Audit what root did** — every action in the last 24 hours.
5. **Enable SCPs** in AWS Organizations to deny root API access to all accounts except identity.

### When to escalate

- **Always page security leadership.** Root account compromise is a Sev-1 event.
- Engage AWS support to verify account integrity.
- Engage legal if the root account has billing or customer-data access.

---

## 6. `[CloudLoadGen] CloudTrail Logging Stopped or Deleted`

**Severity:** Critical | **Risk Score:** 99
**MITRE:** Defense Evasion → Disable Cloud Logs (T1562.008)

### What this means

Someone called `StopLogging` or `DeleteTrail` on a CloudTrail trail. This is a textbook defense-evasion technique — the attacker disables logging to hide subsequent actions. CloudTrail is the single most important audit log in AWS.

### Five-minute triage

1. **Which trail was affected?** Check `aws.cloudtrail.request_parameters` for the trail name/ARN.
2. **Is logging currently stopped?** Verify immediately: `aws cloudtrail get-trail-status --name <trail>`
3. **Who did it?** Check `user.name` and `source.ip` — this should never come from a non-admin.
4. **What happened between the stop and now?** If logging was stopped even briefly, there's a gap in your audit trail.

### Investigation queries

#### Trail tampering events

```esql
FROM logs-aws.cloudtrail-*
| WHERE @timestamp > NOW() - 24h
| WHERE event.action IN ("StopLogging", "DeleteTrail", "UpdateTrail", "PutEventSelectors")
| KEEP @timestamp, event.action, user.name, source.ip, user_agent.original,
       aws.cloudtrail.request_parameters, event.outcome
| SORT @timestamp DESC
```

#### Gap analysis — what happened while logging was stopped?

```esql
FROM logs-aws.cloudtrail-*
| WHERE @timestamp > NOW() - 6h
| STATS events = COUNT(*) BY BUCKET(@timestamp, 5 minutes)
| SORT @timestamp ASC
```

A gap in the histogram indicates the period when logging was stopped.

### Containment & remediation

1. **Re-enable logging immediately** — `aws cloudtrail start-logging --name <trail>`
2. **Identify and disable the actor** who stopped logging.
3. **Assume the worst for the gap period** — without audit logs, you cannot determine what happened. Rotate all credentials that could have been used during the gap.
4. **Enable CloudTrail Insights** to detect unusual API activity patterns.
5. **Add an SCP** to deny `cloudtrail:StopLogging` and `cloudtrail:DeleteTrail` for all non-admin principals.

### When to escalate

- **Always page security leadership.** Audit log tampering is a Sev-1 event.
- The gap period may contain undetectable malicious activity — assume compromise.
- Engage IR team for forensic reconstruction using alternative log sources (VPC Flow, S3 access logs, load balancer logs).

---

## See also

- [Security Finding Chain runbook (stack rules)](./security-finding-chain-alerts.md) — the chain-scenario `.es-query` rules for GuardDuty/Security Hub.
- [SOC Demo Setup](../SOC-DEMO-SETUP.md) — full walkthrough using these rules with Attack Discovery and Agent Builder.
- [Workflow deployment guide](../workflow-deployment.md) — the security alert enrichment workflow adds CMDB context to notifications.
