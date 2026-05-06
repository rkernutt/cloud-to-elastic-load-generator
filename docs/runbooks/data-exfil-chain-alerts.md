# Runbook — Data Exfiltration Chain alerts

Investigation guides for the four rules in the **Data Exfiltration Chain**. The chain models a credentialled actor reading large volumes of data out of object storage and pushing it to an external endpoint.

> **Linked dashboard:** `Data Exfiltration Chain — overview`
> **Chain reference:** [data-exfiltration-chain.md](../chained-events/data-exfiltration-chain.md)

| Vendor | Threat detector dataset             | Network flow dataset | Object-storage audit dataset |
| ------ | ----------------------------------- | -------------------- | ---------------------------- |
| AWS    | `aws.guardduty`                     | `aws.vpcflow`        | `aws.cloudtrail` (S3 events) |
| GCP    | `gcp.scc` (Security Command Center) | `gcp.vpcflow`        | `gcp.audit` (GCS events)     |
| Azure  | `azure.defender`                    | `azure.nsgflowlogs`  | `azure.activitylogs` (Blob)  |

The shipped rules are AWS-named. Swap dataset names in the queries below for GCP/Azure — the structure is identical.

---

## 1. `[CloudLoadGen] Data Exfil Chain — GuardDuty Exfiltration Finding`

**Threshold:** at least 1 GuardDuty finding with type starting `Exfiltration*` in the last 15 minutes.

### What this means

The cloud's native threat detector has classified an action as exfiltration. This is the single highest-fidelity rule in the chain — GuardDuty/SCC/Defender don't generate `Exfiltration*` findings lightly.

### Five-minute triage

1. **Read the finding.** Open the full GuardDuty document (Discover → click the alert event). The finding type tells you whether it's an instance, a role, or a user.
2. **Identify the principal.** Run [Principal lookup](#principal-lookup). The principal is your scope — instance ID, IAM user, or assumed role.
3. **Check whether the principal is currently active.** If sessions are still open you must contain _now_; if the principal has rotated keys / logged out, you have time to investigate properly.

### Investigation queries

#### Principal lookup

```esql
FROM logs-aws.guardduty-*
| WHERE @timestamp > NOW() - 1h AND aws.guardduty.type LIKE "Exfiltration*"
| KEEP @timestamp, aws.guardduty.type, aws.guardduty.severity.value,
       aws.guardduty.resource.instance_details.instance_id,
       aws.guardduty.resource.access_key_details.user_name,
       source.ip, destination.ip, destination.geo.country_iso_code
| SORT @timestamp DESC
```

#### Recent activity by the same principal

```esql
FROM logs-aws.cloudtrail-*
| WHERE @timestamp > NOW() - 6h
| WHERE user.name == "<user_from_principal_lookup>" OR
        aws.cloudtrail.user_identity.session_context.session_issuer.user_name == "<user>"
| KEEP @timestamp, event.action, source.ip, aws.cloudtrail.request_parameters
| SORT @timestamp DESC
| LIMIT 50
```

### Likely causes

- **True positive:** Compromised credentials or a malicious insider; the destination IP is usually outside the org's known egress ranges.
- **False positive:** A new legitimate workflow (third-party SaaS integration, replication target) that hasn't been allow-listed in GuardDuty/SCC suppression rules.

### Containment & remediation

- **Rotate** the implicated access key or detach the IAM role from the instance.
- **Block** outbound traffic to the destination IP at the security-group / firewall level if the actor is still active.
- Open a security incident under the **CI's support group** — the [alert-enrichment workflow](../workflow-deployment.md) attaches owner/incident context to the email if it's enabled.
- Preserve evidence: snapshot the volume, dump the role's recent CloudTrail events, capture VPC flow logs.

### Related rules in the chain

- `Data Exfil Chain — VPC Flow High Egress Bytes` (corroborates volume).
- `Data Exfil Chain — S3 GetObject With High Additional Event Count` (corroborates which data was taken).
- `Data Exfil Chain — Full Chain Correlation` (catches the end-to-end pattern).

### When to escalate

- Always page the on-call security lead for `Exfiltration*` findings of severity HIGH or CRITICAL.
- Page leadership if the principal has access to customer-data buckets or production secrets.

---

## 2. `[CloudLoadGen] Data Exfil Chain — VPC Flow High Egress Bytes`

**Threshold:** at least 1 VPC flow log in 15 minutes with `network.direction: egress` and bytes > 50 MiB (52 428 800 bytes).

### What this means

A single flow shipped more than 50 MiB outbound. The threshold is loose by design — it's a corroborating signal for the GuardDuty rule, not a primary detector.

### Five-minute triage

1. **Identify the source.** Run [Top egress sources](#top-egress-sources). If it's a known data-replication subnet, this is benign; if it's a workload subnet, investigate.
2. **Identify the destination.** Run [Destination geo-check](#destination-geo-check). Foreign or cloud-IP destinations are higher signal than internet-corp destinations.
3. **Cross-reference with GuardDuty.** If rule 1 also fired in the same window for the same instance, treat as confirmed exfiltration.

### Investigation queries

#### Top egress sources

```esql
FROM logs-aws.vpcflow-*
| WHERE @timestamp > NOW() - 1h
| WHERE network.direction == "egress" AND aws.vpcflow.bytes > 52428800
| STATS bytes = SUM(aws.vpcflow.bytes), flows = COUNT(*) BY source.ip
| SORT bytes DESC
| LIMIT 25
```

#### Destination geo-check

```esql
FROM logs-aws.vpcflow-*
| WHERE @timestamp > NOW() - 1h
| WHERE network.direction == "egress" AND aws.vpcflow.bytes > 52428800
| STATS bytes = SUM(aws.vpcflow.bytes) BY destination.ip, destination.geo.country_iso_code
| SORT bytes DESC
| LIMIT 25
```

### Likely causes

- **True positive:** Bulk download to an attacker-controlled host; large data dump from a compromised instance.
- **False positive:** Backup target, cross-region replication, software updates pulling large tarballs in.

### Containment & remediation

- If the destination is unknown, block it at the security group or NACL.
- If the source is known and the volume is unusual, snapshot the host for forensics before terminating.

### Related rules in the chain

- `Data Exfil Chain — GuardDuty Exfiltration Finding` (primary signal).
- `Data Exfil Chain — Full Chain Correlation` (confirms multi-stage pattern).

### When to escalate

- Same source IP triggering this rule repeatedly inside a 30-minute window.
- Destination country is on your egress-deny list.

---

## 3. `[CloudLoadGen] Data Exfil Chain — S3 GetObject With High Additional Event Count`

**Threshold:** at least 1 CloudTrail `GetObject` event in 15 minutes with `aws.cloudtrail.additional_event_count > 100`.

### What this means

CloudTrail collapses repeated identical S3 GetObject events into a single document with an `additional_event_count`. A value over 100 within a single CloudTrail aggregation window means the principal pulled at least 100 objects programmatically.

### Five-minute triage

1. **Get the bucket and the principal.** Run [Bulk-access lookup](#bulk-access-lookup).
2. **Decide whether the bucket is sensitive.** Customer-data, PII, secrets, backup buckets → escalate immediately.
3. **Was this a console session or programmatic?** `userAgent` tells you — `Boto3`, `aws-cli`, or a non-standard agent all suggest scripted behaviour.

### Investigation queries

#### Bulk-access lookup

```esql
FROM logs-aws.cloudtrail-*
| WHERE @timestamp > NOW() - 1h
| WHERE event.action == "GetObject" AND aws.cloudtrail.additional_event_count > 100
| KEEP @timestamp, user.name, source.ip, user_agent.original,
       aws.cloudtrail.resources.arn, aws.cloudtrail.additional_event_count
| SORT aws.cloudtrail.additional_event_count DESC
```

#### Check what else the principal did in the same window

```esql
FROM logs-aws.cloudtrail-*
| WHERE @timestamp > NOW() - 1h
| WHERE user.name == "<user_from_bulk_access_lookup>"
| STATS events = COUNT(*) BY event.action
| SORT events DESC
```

### Likely causes

- **True positive:** Credentialled bulk read of a sensitive bucket — the same principal almost always also called `ListObjects` immediately before.
- **False positive:** A legitimate batch job, lifecycle policy execution, or replication agent.

### Containment & remediation

- Block the principal's access to the bucket via a deny-all bucket policy keyed on the principal.
- If the principal is an EC2 instance role, snapshot and quarantine the instance.

### Related rules in the chain

- `Data Exfil Chain — VPC Flow High Egress Bytes` (objects had to leave somewhere).
- `Data Exfil Chain — Full Chain Correlation` (confirms multi-source pattern).

### When to escalate

- The bucket is customer-data, PII, or a secrets/backup bucket.
- The principal is a service account that shouldn't be reading at this volume.

---

## 4. `[CloudLoadGen] Data Exfil Chain — Full Chain Correlation`

**Threshold:** more than 2 of the previous three signals (GuardDuty exfiltration, high egress, bulk S3 GetObject) firing in a single 15-minute window.

### What this means

This is the apex rule of the chain. It only fires when multiple stages of the chain co-occur — i.e. you have _both_ the threat detector and corroborating volume / object-access signals. **Treat as a confirmed incident until proven otherwise.**

### Five-minute triage

1. **Page the on-call security lead.** Don't wait to investigate — start the incident process and continue investigation from there.
2. **Identify the principal.** Use the queries from rules 1–3 to reconstruct who, what, and where.
3. **Contain.** Even before root cause is established, rotate the principal's credentials and block the destination IP.

### Investigation query

```esql
FROM logs-aws.guardduty-*, logs-aws.vpcflow-*, logs-aws.cloudtrail-*
| WHERE @timestamp > NOW() - 30m
| WHERE
    (event.dataset == "aws.guardduty" AND aws.guardduty.type LIKE "Exfiltration*") OR
    (event.dataset == "aws.vpcflow" AND network.direction == "egress" AND aws.vpcflow.bytes > 52428800) OR
    (event.dataset == "aws.cloudtrail" AND event.action == "GetObject" AND aws.cloudtrail.additional_event_count > 100)
| KEEP @timestamp, event.dataset, event.action, user.name, source.ip, destination.ip
| SORT @timestamp ASC
```

### Likely causes

- **True positive:** Active exfiltration in progress.
- **False positive:** A coincidental overlap — possible if all three rules are mistuned, but vanishingly rare.

### Containment & remediation

- Rotate credentials, isolate the host, block the destination, snapshot evidence.
- Open a Sev-1 / P0 security incident.
- Engage legal / compliance if customer data is implicated.

### Related rules in the chain

- All three rules above; this rule's job is to combine them.

### When to escalate

- **Always.** This rule is intentionally tuned to be the page-the-CISO bar.

---

## See also

- [Chained event reference — Data Exfiltration Chain](../chained-events/data-exfiltration-chain.md) — how the chain is generated and the correlation IDs that link the three signals.
- [Workflow deployment guide](../workflow-deployment.md) — the alert-enrichment workflow opens cases automatically and pulls owner/CI/recent-changes context from ServiceNow.
