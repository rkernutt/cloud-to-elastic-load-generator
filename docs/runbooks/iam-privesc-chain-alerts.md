# Runbook — IAM Privilege Escalation Chain alerts

Investigation guides for the four rules in the **IAM Privilege Escalation Chain**. The chain models a principal who already has _some_ IAM permissions and is using them to grant themselves more — typically by minting access keys, attaching admin policies, or assuming privileged roles.

> **Linked dashboard:** `IAM Privilege Escalation Chain — overview`
> **Chain reference:** [iam-privilege-escalation-chain.md](../chained-events/iam-privilege-escalation-chain.md)

| Vendor | Audit dataset                         | Notable fields                                                   |
| ------ | ------------------------------------- | ---------------------------------------------------------------- |
| AWS    | `aws.cloudtrail`                      | `event.action`, `user.name`, `aws.cloudtrail.request_parameters` |
| GCP    | `gcp.audit` (`activity` log)          | `event.action`, `user.name`, `gcp.audit.request`                 |
| Azure  | `azure.activitylogs` (Entra ID + ARM) | `event.action`, `user.name`, `azure.activitylogs.properties`     |

The shipped rules are AWS-named. Swap dataset names for GCP/Azure equivalents — the structure is identical.

---

## 1. `[CloudLoadGen] IAM PrivEsc Chain — CreateAccessKey (Non-Admin)`

**Threshold:** at least 1 `CreateAccessKey` call in 15 minutes by a principal whose username does not contain "admin".

### What this means

A non-admin principal minted a new programmatic access key. By itself this is a routine action — developers do it. It becomes a privilege-escalation signal when paired with the other rules in the chain (especially rule 4).

### Five-minute triage

1. **Identify caller and target.** Run [Key-creation lookup](#key-creation-lookup) — note both the _caller_ (who made the call) and the _target user_ (whose key was minted). They're often different.
2. **Is the target user privileged?** If the target user has admin policies attached or is a service account, this is much higher signal.
3. **Was the caller's session normal?** Check `source.ip` and `user_agent.original` — unusual sources or non-standard agents (e.g. `python-requests`) suggest scripted activity.

### Investigation queries

#### Key-creation lookup

```esql
FROM logs-aws.cloudtrail-*
| WHERE @timestamp > NOW() - 1h AND event.action == "CreateAccessKey"
| KEEP @timestamp, user.name AS caller,
       aws.cloudtrail.request_parameters AS target_params,
       source.ip, user_agent.original
| SORT @timestamp DESC
```

#### Privileges held by the target user

```esql
FROM logs-aws.cloudtrail-*
| WHERE @timestamp > NOW() - 30d
| WHERE user.name == "<target_user>"
| STATS actions = COUNT(*) BY event.action
| SORT actions DESC
| LIMIT 25
```

If you see `iam:*`, `sts:AssumeRole`, or any `Admin*Policy*` actions in that user's history, treat as critical.

### Likely causes

- **True positive:** Compromised user creating a key for persistence; insider creating a key on a teammate's identity.
- **False positive:** Normal developer minting their own key (caller == target user, both are people accounts).

### Containment & remediation

- If the caller != target user and the target is privileged, **disable the new key immediately**.
- If the caller is unfamiliar with the target user, follow up with the caller out-of-band before disabling — could be social engineering bait.

### Related rules in the chain

- `IAM PrivEsc Chain — AdministratorAccess Policy Attached` (next stage).
- `IAM PrivEsc Chain — High Volume of Dangerous IAM Actions` (catches the broader pattern).

### When to escalate

- Caller != target user.
- Target user is a service account.
- Source IP is outside the corp / VPN egress.

---

## 2. `[CloudLoadGen] IAM PrivEsc Chain — AdministratorAccess Policy Attached`

**Threshold:** at least 1 `AttachUserPolicy` call in 15 minutes where `request_parameters` contains `AdministratorAccess`, by a non-admin caller.

### What this means

A non-admin principal attached the `AdministratorAccess` policy to a user. This is one of the highest-signal privilege-escalation actions — there's almost no legitimate reason a non-admin should be doing this.

### Five-minute triage

1. **Confirm the policy and target.** Run [Policy-attach lookup](#policy-attach-lookup).
2. **Confirm caller's permissions.** If the caller has `iam:AttachUserPolicy` but isn't on the admin team, the access shouldn't have been granted in the first place.
3. **Check what came before.** Run [Caller activity timeline](#caller-activity-timeline) — admin attach is rarely the first step in a kill chain.

### Investigation queries

#### Policy-attach lookup

```esql
FROM logs-aws.cloudtrail-*
| WHERE @timestamp > NOW() - 1h
| WHERE event.action == "AttachUserPolicy" AND aws.cloudtrail.request_parameters LIKE "*AdministratorAccess*"
| KEEP @timestamp, user.name AS caller,
       aws.cloudtrail.request_parameters AS attach_request,
       source.ip, user_agent.original
| SORT @timestamp DESC
```

#### Caller activity timeline

```esql
FROM logs-aws.cloudtrail-*
| WHERE @timestamp > NOW() - 6h
| WHERE user.name == "<caller_from_attach_lookup>"
| KEEP @timestamp, event.action, source.ip, aws.cloudtrail.request_parameters
| SORT @timestamp ASC
```

### Likely causes

- **True positive:** Compromised credentials being used to grant themselves or a backdoor user admin rights.
- **False positive:** A legitimate IAM administrator whose username doesn't contain "admin" (e.g. `sre-platform-bot`). Tune the rule's `must_not` clause if this is common.

### Containment & remediation

- **Detach the policy** from the target user immediately.
- Disable the caller's session/keys until the action is verified.
- Audit all IAM changes by the caller in the last 24h.

### Related rules in the chain

- `IAM PrivEsc Chain — CreateAccessKey (Non-Admin)` (often precedes this).
- `IAM PrivEsc Chain — High Volume of Dangerous IAM Actions` (broader pattern).

### When to escalate

- **Always page security on-call.** Admin-attach by a non-admin is a rare and high-confidence signal.

---

## 3. `[CloudLoadGen] IAM PrivEsc Chain — AssumeRole With Privilege-Escalation Tactic`

**Threshold:** at least 1 `AssumeRole` event in 15 minutes that already has `threat.tactic.name` populated by an upstream enrichment.

### What this means

A role-assumption was tagged by an upstream classifier as part of a privilege-escalation tactic (MITRE ATT&CK T1078, T1098, etc.). The classifier could be the Elastic Detection Engine, a SIEM rule, or the load-generator's own enrichment.

### Five-minute triage

1. **Read the threat tactic.** Run [Tagged-tactic lookup](#tagged-tactic-lookup) and note the exact `threat.tactic.name`.
2. **Identify caller and assumed role.** The assumed role is the _new_ identity the actor will use — you need to track its activity from now on.
3. **Trace forward.** Run [Post-assume activity](#post-assume-activity) to see what the assumed role did next.

### Investigation queries

#### Tagged-tactic lookup

```esql
FROM logs-aws.cloudtrail-*
| WHERE @timestamp > NOW() - 1h
| WHERE event.action == "AssumeRole" AND threat.tactic.name IS NOT NULL
| KEEP @timestamp, user.name AS caller,
       aws.cloudtrail.request_parameters AS role_arn,
       threat.tactic.name, threat.technique.id, source.ip
| SORT @timestamp DESC
```

#### Post-assume activity

```esql
FROM logs-aws.cloudtrail-*
| WHERE @timestamp > NOW() - 1h
| WHERE aws.cloudtrail.user_identity.session_context.session_issuer.user_name == "<assumed_role_name>"
| KEEP @timestamp, event.action, source.ip, aws.cloudtrail.request_parameters
| SORT @timestamp ASC
| LIMIT 50
```

### Likely causes

- **True positive:** A compromised principal chaining role assumptions to escalate, or to evade detection by jumping to a role with a different audit footprint.
- **False positive:** A legitimate workflow that the threat enrichment hasn't yet been told about — fix by adding the role-pair to the detection rule's exception list.

### Containment & remediation

- Revoke the assumed-role session (`aws sts revoke-session` equivalent / shorten the role's max session duration).
- Audit what the assumed role did in the post-assume window.

### Related rules in the chain

- `IAM PrivEsc Chain — High Volume of Dangerous IAM Actions` (the macro pattern).

### When to escalate

- The assumed role has admin or production data access.
- Multiple AssumeRole events from the same caller in a short window — actor is "jumping" between roles.

---

## 4. `[CloudLoadGen] IAM PrivEsc Chain — High Volume of Dangerous IAM Actions`

**Threshold:** more than 3 IAM actions (`CreateAccessKey`, `AttachUserPolicy AdministratorAccess`, `AssumeRole`) in any 30-minute window from a principal with a username.

### What this means

The macro version of the rules above. It triggers when the _combination_ of dangerous IAM actions clusters around a single principal — i.e. the kill chain pattern itself, not any one stage.

### Five-minute triage

1. **Identify the principal.** Run [Dangerous-action concentration](#dangerous-action-concentration).
2. **Reconstruct the timeline.** Open the linked dashboard's timeline panel — it groups all three event types side by side.
3. **Treat as confirmed PrivEsc.** This rule is intentionally tuned for high specificity.

### Investigation queries

#### Dangerous-action concentration

```esql
FROM logs-aws.cloudtrail-*
| WHERE @timestamp > NOW() - 1h
| WHERE event.action IN ("CreateAccessKey", "AttachUserPolicy", "AssumeRole")
| WHERE event.action != "AttachUserPolicy" OR aws.cloudtrail.request_parameters LIKE "*AdministratorAccess*"
| STATS dangerous = COUNT(*) BY user.name, event.action
| SORT dangerous DESC
```

#### Full timeline for a single principal

```esql
FROM logs-aws.cloudtrail-*
| WHERE @timestamp > NOW() - 6h
| WHERE user.name == "<principal_from_concentration>"
| KEEP @timestamp, event.action, source.ip, aws.cloudtrail.request_parameters
| SORT @timestamp ASC
```

### Likely causes

- **True positive:** Active privilege escalation kill chain.
- **False positive:** A platform-engineering script that genuinely does these actions in batch — should be running under an admin identity, in which case the rule's username `must_not` filter should already exclude it.

### Containment & remediation

- **Treat as Sev-2 minimum.** Disable the principal, rotate any keys they minted, detach any policies they attached.
- Snapshot all IAM activity by the principal in the last 24h before any cleanup, for forensics.

### Related rules in the chain

- All three rules above; this rule combines them.

### When to escalate

- **Always.** This is the apex rule of the IAM PrivEsc chain.

---

## See also

- [Chained event reference — IAM Privilege Escalation Chain](../chained-events/iam-privilege-escalation-chain.md) — how the chain is generated.
- [Workflow deployment guide](../workflow-deployment.md) — the alert-enrichment workflow opens a case and emails the principal's manager / support group via ServiceNow.
