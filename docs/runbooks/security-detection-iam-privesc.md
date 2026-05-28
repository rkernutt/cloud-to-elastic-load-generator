# Runbook — IAM Privilege Escalation Detection Rules

Investigation and remediation guides for the six Elastic Security detection rules that target **IAM privilege escalation** patterns. These rules produce alerts in `.alerts-security.alerts-*` for Attack Discovery.

> **Linked dashboard:** `IAM Privilege Escalation Chain — overview`
> **MITRE ATT&CK coverage:** Discovery (TA0007), Persistence (TA0003), Privilege Escalation (TA0004), Credential Access (TA0006), Lateral Movement (TA0008)
> **Agent Builder:** Ask the SOC Analyst: _"Show me IAM privilege escalation events from the last hour"_

| Rule                                          | Severity | Risk | MITRE Technique |
| --------------------------------------------- | -------- | ---- | --------------- |
| IAM Access Key Created for Another User       | High     | 73   | T1098.001       |
| AdministratorAccess Policy Attached to User   | Critical | 99   | T1078.004       |
| AssumeRole to AdminRole from Non-Corporate IP | Critical | 95   | T1550.001       |
| IAM User Enumeration (ListUsers)              | Medium   | 47   | T1087.004       |
| IAM API Call Without MFA Authentication       | High     | 73   | T1528           |
| Multiple IAM Privilege Changes from Single IP | Critical | 95   | T1078           |

---

## 1. `[CloudLoadGen] IAM Access Key Created for Another User`

**Severity:** High | **Risk Score:** 73
**MITRE:** Persistence → Additional Cloud Credentials (T1098.001)

### What this means

A user created a programmatic access key. When the caller and the target are different users, this is a strong persistence indicator — the attacker creates a key for a less-monitored user and uses it as a backdoor.

### Five-minute triage

1. **Identify the actor and target.** The `user.name` is the actor; the target is in the CloudTrail request parameters (look for `UserName` in `aws.cloudtrail.request_parameters`).
2. **Are they the same person?** Same user creating their own key is routine. Cross-user key creation is high-signal.
3. **Check the source IP.** Compare `source.ip` against known corporate/VPN ranges using the Agent Builder `soc-attacker-ip-activity` tool.
4. **Check for chain correlation.** Look for `labels.attack_session_id` — if present, this is part of a coordinated attack.

### Investigation queries

#### Who created keys and for whom?

```esql
FROM logs-aws.cloudtrail-*
| WHERE @timestamp > NOW() - 1h AND event.action == "CreateAccessKey"
| KEEP @timestamp, user.name, source.ip, user_agent.original,
       aws.cloudtrail.request_parameters, labels.attack_session_id,
       labels.target_user
| SORT @timestamp DESC
```

#### Was the new key already used?

```esql
FROM logs-aws.cloudtrail-*
| WHERE @timestamp > NOW() - 1h
| WHERE user.name == "<target_user>"
| STATS actions = COUNT(*) BY event.action, source.ip
| SORT actions DESC
| LIMIT 20
```

#### CMDB context for the target user

```esql
FROM logs-servicenow.event-*
| WHERE tags == "sys_user"
| KEEP servicenow.event.user_name.value, servicenow.event.email.value,
       servicenow.event.department.display_value,
       servicenow.event.manager.display_value
| LIMIT 10
```

### Containment & remediation

1. **Disable the new access key** — `aws iam update-access-key --user-name <target> --access-key-id <key-id> --status Inactive`
2. **Rotate the actor's credentials** — if the actor is compromised, their existing keys should be disabled too.
3. **Review all keys for the target user** — `aws iam list-access-keys --user-name <target>`
4. **Check for related privilege changes** — run the chain timeline query below.

### Full chain timeline

```esql
FROM logs-aws.cloudtrail-*
| WHERE @timestamp > NOW() - 6h AND user.name == "<attacker_user>"
| KEEP @timestamp, event.action, source.ip, event.outcome,
       aws.cloudtrail.request_parameters
| SORT @timestamp ASC
| LIMIT 100
```

### When to escalate

- Caller ≠ target user
- Target user has admin or production-data permissions
- Source IP is outside corporate/VPN ranges
- `labels.attack_session_id` is present (coordinated attack)

---

## 2. `[CloudLoadGen] AdministratorAccess Policy Attached to User`

**Severity:** Critical | **Risk Score:** 99
**MITRE:** Privilege Escalation → Cloud Accounts (T1078.004)

### What this means

Someone attached the `AdministratorAccess` managed policy to an IAM user. This is the single most dangerous IAM API call — it grants full control over the AWS account. There is almost no legitimate reason for a non-admin to do this.

### Five-minute triage

1. **Confirm the attachment.** Run [Policy attach lookup](#policy-attach-lookup-2) to see who attached what to whom.
2. **Was there a change request?** Check ServiceNow CMDB for a recent change request covering this modification.
3. **Check MFA status.** If `mfa_authenticated` is `false`, the actor's long-term credentials are likely compromised.
4. **Look backward.** This is rarely the first step — check for preceding ListUsers and CreateAccessKey events.

### Investigation queries

#### Policy attach lookup {#policy-attach-lookup-2}

```esql
FROM logs-aws.cloudtrail-*
| WHERE @timestamp > NOW() - 1h
| WHERE event.action == "AttachUserPolicy"
| WHERE message LIKE "*AdministratorAccess*"
| KEEP @timestamp, user.name, source.ip, user_agent.original,
       aws.cloudtrail.request_parameters, labels.attack_session_id
| SORT @timestamp DESC
```

#### Was there a matching change request?

```esql
FROM logs-servicenow.event-*
| WHERE tags == "change_request" AND @timestamp > NOW() - 7d
| WHERE message LIKE "*IAM*" OR message LIKE "*admin*" OR message LIKE "*policy*"
| KEEP servicenow.event.number.value, servicenow.event.short_description.value,
       servicenow.event.state.display_value, servicenow.event.requested_by.display_value
| SORT @timestamp DESC
| LIMIT 5
```

### Containment & remediation

1. **Detach the policy immediately** — `aws iam detach-user-policy --user-name <target> --policy-arn arn:aws:iam::aws:policy/AdministratorAccess`
2. **Disable the actor** — disable access keys and console password.
3. **Audit the actor's full timeline** — every API call they made in the last 24 hours.
4. **Check for persistence** — look for new roles, keys, or login profiles created by the actor.
5. **Open an incident** in ServiceNow via the security workflow.

### When to escalate

- **Always page security on-call.** This is a critical-severity event.
- Page legal if the actor or target has access to customer data.
- If MFA was not authenticated, treat as confirmed credential compromise.

---

## 3. `[CloudLoadGen] AssumeRole to AdminRole from Non-Corporate IP`

**Severity:** Critical | **Risk Score:** 95
**MITRE:** Lateral Movement → Application Access Token (T1550.001)

### What this means

A user assumed an admin-level role, typically the final step in a privilege escalation chain. Combined with the preceding key creation and policy attachment, this completes the attacker's objective — they now have admin credentials they can use from anywhere.

### Five-minute triage

1. **Identify the role being assumed.** Check `aws.cloudtrail.request_parameters` for the role ARN.
2. **Check the source IP.** A non-corporate IP assuming an admin role is extremely high signal.
3. **Trace forward.** What did the assumed role do next? This tells you the attacker's real objective.
4. **Check for the full chain.** Use `labels.attack_session_id` to find the complete attack sequence.

### Investigation queries

#### Role assumption details

```esql
FROM logs-aws.cloudtrail-*
| WHERE @timestamp > NOW() - 1h AND event.action == "AssumeRole"
| WHERE message LIKE "*AdminRole*"
| KEEP @timestamp, user.name, source.ip, user_agent.original,
       aws.cloudtrail.request_parameters, labels.attack_session_id,
       threat.tactic.name, threat.technique.name
| SORT @timestamp DESC
```

#### Post-assume activity (what did the admin role do?)

```esql
FROM logs-aws.cloudtrail-*
| WHERE @timestamp > NOW() - 1h
| WHERE aws.cloudtrail.user_identity.type == "AssumedRole"
| KEEP @timestamp, event.action, source.ip, event.outcome,
       aws.cloudtrail.request_parameters
| SORT @timestamp ASC
| LIMIT 50
```

#### Full attack chain reconstruction

```esql
FROM logs-aws.cloudtrail-*
| WHERE @timestamp > NOW() - 1h AND labels.attack_session_id IS NOT NULL
| KEEP @timestamp, event.action, user.name, source.ip, event.outcome,
       threat.tactic.name, threat.technique.name
| SORT @timestamp ASC
```

### Containment & remediation

1. **Revoke all active sessions** for the assumed role — `aws iam put-role-policy` with a deny-all inline policy.
2. **Rotate the role's trust policy** to prevent re-assumption.
3. **Block the source IP** at WAF, NACL, or security group.
4. **Disable the actor's credentials** (the original user who assumed the role).
5. **Audit what the role did** post-assumption — data access, resource creation, secret retrieval.

### When to escalate

- **Always.** This is the apex of the IAM PrivEsc chain.
- Page leadership if the admin role has production or data-plane access.
- Engage incident response if post-assume activity includes data access or secret retrieval.

---

## 4. `[CloudLoadGen] IAM User Enumeration (ListUsers)`

**Severity:** Medium | **Risk Score:** 47
**MITRE:** Discovery → Cloud Account (T1087.004)

### What this means

A non-admin user called `ListUsers` to enumerate all IAM users in the account. By itself this is low-signal, but it's the reconnaissance phase that precedes key creation and policy attachment in the IAM PrivEsc chain.

### Five-minute triage

1. **Who made the call?** Check `user.name` and `source.ip`.
2. **Was it followed by dangerous actions?** Check if CreateAccessKey or AttachUserPolicy events appeared from the same source within 5 minutes.
3. **Is this user expected to enumerate IAM?** Developers rarely need ListUsers; security scanners and CI/CD pipelines sometimes do.

### Investigation queries

#### ListUsers caller context

```esql
FROM logs-aws.cloudtrail-*
| WHERE @timestamp > NOW() - 1h AND event.action == "ListUsers"
| WHERE user.name NOT LIKE "*admin*" AND user.name NOT LIKE "*service*"
| KEEP @timestamp, user.name, source.ip, user_agent.original
| SORT @timestamp DESC
```

#### Did dangerous actions follow?

```esql
FROM logs-aws.cloudtrail-*
| WHERE @timestamp > NOW() - 1h
| WHERE user.name == "<user_from_above>"
| WHERE event.action IN ("ListUsers", "CreateAccessKey", "AttachUserPolicy", "AssumeRole")
| KEEP @timestamp, event.action, source.ip, event.outcome
| SORT @timestamp ASC
```

### Containment & remediation

- If followed by key creation or policy changes: **treat as confirmed reconnaissance** and follow rules 1–3 containment.
- If standalone: **investigate but don't contain** — may be legitimate.
- Consider adding IAM condition keys to restrict ListUsers to admin roles only.

### When to escalate

- ListUsers followed by CreateAccessKey within 5 minutes from the same IP.
- The user's IP is outside known corporate ranges.
- `labels.attack_session_id` is present.

---

## 5. `[CloudLoadGen] IAM API Call Without MFA Authentication`

**Severity:** High | **Risk Score:** 73
**MITRE:** Credential Access → Steal Application Access Token (T1528)

### What this means

A privileged IAM API call (CreateAccessKey, AttachUserPolicy, or AssumeRole) was made without MFA. This strongly suggests the actor is using compromised long-term credentials (access key + secret) rather than a properly authenticated console session.

### Five-minute triage

1. **Confirm MFA status.** Check `aws.cloudtrail.user_identity.session_context.attributes.mfa_authenticated` — should be `false`.
2. **Is this a service account?** Service accounts often can't use MFA. Check if `user_agent.original` indicates SDK/CLI usage expected for automation.
3. **What action was performed?** CreateAccessKey without MFA is higher risk than ListUsers without MFA.

### Investigation queries

#### Non-MFA privileged actions

```esql
FROM logs-aws.cloudtrail-*
| WHERE @timestamp > NOW() - 1h
| WHERE event.category == "iam"
| WHERE event.action IN ("CreateAccessKey", "AttachUserPolicy", "AssumeRole")
| WHERE message LIKE "*mfa_authenticated*false*"
| KEEP @timestamp, event.action, user.name, source.ip, user_agent.original
| SORT @timestamp DESC
```

### Containment & remediation

1. **Enforce MFA** on the user — attach an IAM policy requiring MFA for all actions.
2. **Rotate the user's access keys** — the long-term credentials may be compromised.
3. **Enable AWS SCP** to deny IAM actions without MFA across the organization.

### When to escalate

- Non-MFA actions from an IP outside the corporate range.
- Combined with other IAM PrivEsc chain events.
- The action is CreateAccessKey or AttachUserPolicy (persistence/escalation).

---

## 6. `[CloudLoadGen] Multiple IAM Privilege Changes from Single IP`

**Severity:** Critical | **Risk Score:** 95
**MITRE:** Privilege Escalation → Valid Accounts (T1078)

### What this means

Three or more IAM privilege modification events (`event.type: change`) came from the same source IP within a 5-minute window, with at least 2 different action types. This pattern is characteristic of automated attack tooling running through a privilege escalation playbook.

### Five-minute triage

1. **Identify the IP.** This is the key pivot — all activity from this IP should be investigated.
2. **What actions were performed?** Run [Action breakdown per IP](#action-breakdown-per-ip) to see the sequence.
3. **Is this automated tooling?** Check `user_agent.original` for `python-requests`, `boto3`, `pacu`, or other enumeration tools.
4. **Cross-reference with CMDB.** Use the Agent Builder to look up the IP — is it a known corporate/developer IP?

### Investigation queries

#### Action breakdown per IP

```esql
FROM logs-aws.cloudtrail-*
| WHERE @timestamp > NOW() - 30m AND event.category == "iam" AND event.type == "change"
| STATS actions = COUNT(*) BY source.ip, event.action, user.name
| SORT actions DESC
| LIMIT 20
```

#### All activity from the suspicious IP

```esql
FROM logs-aws.cloudtrail-*,logs-aws.guardduty-*,logs-aws.vpcflow-*
| WHERE @timestamp > NOW() - 1h AND source.ip == "<suspicious_ip>"
| STATS count = COUNT(*) BY event.dataset, event.action, event.outcome
| SORT count DESC
| LIMIT 30
```

### Containment & remediation

1. **Block the source IP** at WAF, security group, and NACL.
2. **Disable all users that acted from this IP** until verified.
3. **Revert all IAM changes** made from this IP (detach policies, delete keys, revoke role sessions).
4. **Run a full audit** of the IP's activity across all log sources.

### When to escalate

- **Always page security on-call.** This pattern is extremely high confidence for automated attack tooling.
- Engage incident response if the IP is not from a known range.

---

## See also

- [IAM PrivEsc Chain runbook (stack rules)](./iam-privesc-chain-alerts.md) — the chain-scenario `.es-query` rules overlap with these detection rules.
- [SOC Demo Setup](../SOC-DEMO-SETUP.md) — full walkthrough using these rules with Attack Discovery and Agent Builder.
- [Workflow deployment guide](../workflow-deployment.md) — the security alert enrichment workflow adds CMDB context (IP, hostname, owner) to every notification.
