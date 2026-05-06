# Runbook — Security Finding Chain alerts

Investigation guides for the four rules in the **Security Finding Chain**. The chain models the lifecycle of cloud-native security findings: detect → aggregate (Security Hub / SCC / Defender) → archive (Security Lake / equivalent), with a focus on signal volume and severity.

> **Linked dashboard:** `Security Finding Chain — overview`
> **Chain reference:** [security-finding-chain.md](../chained-events/security-finding-chain.md)

| Vendor | Threat detector dataset | Aggregator dataset               | Archive dataset    |
| ------ | ----------------------- | -------------------------------- | ------------------ |
| AWS    | `aws.guardduty`         | `aws.securityhub_findings`       | `aws.securitylake` |
| GCP    | `gcp.scc` (findings)    | `gcp.scc` (postures)             | `gcp.securitylake` |
| Azure  | `azure.defender`        | `azure.defender_recommendations` | `azure.sentinel`   |

The shipped rules are AWS-named. Swap dataset names for GCP/Azure equivalents — the structure is identical.

---

## 1. `[CloudLoadGen] Security Finding Chain — GuardDuty HIGH/CRITICAL Findings`

**Threshold:** more than 0 GuardDuty findings in 15 minutes with `severity.value` equal to `High` or `Critical`.

### What this means

The cloud's threat detector raised a HIGH or CRITICAL finding — the highest severity bands the platform offers. These findings are explicitly designed to be paged on; do not auto-close.

### Five-minute triage

1. **Read the finding type.** Run [HIGH/CRITICAL list](#high-critical-list). The finding type tells you the kill-chain phase (Recon, Backdoor, Trojan, Exfiltration…).
2. **Identify the resource.** Note `resource.instance_details.instance_id` or `resource.access_key_details.user_name`. That's your scope.
3. **Check for related chains.** If the finding type is `Exfiltration*`, jump to the [Data Exfiltration Chain runbook](./data-exfil-chain-alerts.md). If it's `*PrivilegeEscalation*` or `Persistence*`, check the [IAM PrivEsc runbook](./iam-privesc-chain-alerts.md).

### Investigation queries

#### HIGH/CRITICAL list

```esql
FROM logs-aws.guardduty-*
| WHERE @timestamp > NOW() - 1h
| WHERE aws.guardduty.severity.value IN ("High", "Critical")
| KEEP @timestamp, aws.guardduty.severity.value, aws.guardduty.type,
       aws.guardduty.resource.instance_details.instance_id,
       aws.guardduty.resource.access_key_details.user_name,
       source.ip, destination.ip
| SORT @timestamp DESC
| LIMIT 25
```

#### Has this finding type fired before?

```esql
FROM logs-aws.guardduty-*
| WHERE @timestamp > NOW() - 30d
| WHERE aws.guardduty.type == "<finding_type>"
| STATS occurrences = COUNT(*) BY aws.guardduty.severity.value
```

### Likely causes

- **True positive:** Real malicious activity. GuardDuty's HIGH/CRITICAL bar is high.
- **False positive:** A penetration test, a chaos-engineering exercise, or a known security tool whose behaviour the detector hasn't been told about yet.

### Containment & remediation

- Open a security case (the [alert-enrichment workflow](../workflow-deployment.md) does this automatically if enabled).
- Follow the finding-type-specific playbook from your IR runbook library.
- Snapshot the affected resource before any destructive containment.

### Related rules in the chain

- `Security Finding Chain — Multi-Stage Chain Burst` (catches when many findings fire across detectors).
- `Security Finding Chain — Multiple GuardDuty Alerts With Source IP` (corroborates external attacker).

### When to escalate

- **Always page security on-call** for HIGH or CRITICAL findings.
- Page leadership / legal if customer data, secrets, or production identity systems are implicated.

---

## 2. `[CloudLoadGen] Security Finding Chain — Multi-Stage Chain Burst`

**Threshold:** more than 2 documents tagged `event.kind: alert` in 15 minutes from any of `aws.guardduty`, `aws.securityhub_findings`, or `aws.securitylake`.

### What this means

Multiple alert-class documents landed across multiple detectors / aggregators / archives in a short window. This is a _broad_ signal that something is firing across multiple security pipelines — useful for catching incidents that don't trip any single severity bar.

### Five-minute triage

1. **What detectors fired?** Run [Detector breakdown](#detector-breakdown). One detector spiking is much less interesting than three detectors spiking.
2. **Are they correlated?** Check for shared `source.ip`, `user.name`, or `cloud.account.id`.
3. **Compare to baseline.** A burst of 10 findings during business hours is often noise; a burst of 10 findings overnight is a stronger signal.

### Investigation queries

#### Detector breakdown

```esql
FROM logs-aws.guardduty-*, logs-aws.securityhub_findings-*, logs-aws.securitylake-*
| WHERE @timestamp > NOW() - 30m AND event.kind == "alert"
| STATS findings = COUNT(*) BY event.dataset
| SORT findings DESC
```

#### Common pivots

```esql
FROM logs-aws.guardduty-*, logs-aws.securityhub_findings-*, logs-aws.securitylake-*
| WHERE @timestamp > NOW() - 30m AND event.kind == "alert"
| STATS findings = COUNT(*) BY source.ip, cloud.account.id, user.name
| SORT findings DESC
| LIMIT 25
```

### Likely causes

- **True positive:** A real incident that's lighting up multiple detection layers (GuardDuty → Security Hub → Security Lake).
- **False positive:** A scheduled compliance scan that emits many findings at once (run [Detector breakdown](#detector-breakdown) — if the spike is overwhelmingly from one source, it's the scan).

### Containment & remediation

- Triage in priority order: HIGH/CRITICAL findings first (rule 1), then MEDIUM, then LOW.
- If the spike is from a compliance scan, mute this rule for the duration of the scan window only.

### Related rules in the chain

- `Security Finding Chain — GuardDuty HIGH/CRITICAL Findings` (drills into the high-severity portion).
- `Security Finding Chain — Security Hub Compliance FAILED` (compliance signal).

### When to escalate

- The spike crosses three or more detectors with a shared pivot field.
- The spike includes any HIGH/CRITICAL severity finding.

---

## 3. `[CloudLoadGen] Security Finding Chain — Security Hub Compliance FAILED`

**Threshold:** more than 3 Security Hub findings in 30 minutes with `Compliance.Status: FAILED`.

### What this means

Security Hub (or SCC / Defender) marked at least 4 findings as compliance-FAILED in the last 30 minutes. This is a _posture_ signal more than an _incident_ signal — it usually means a control was bypassed or a new resource was created without the right tags / policies.

### Five-minute triage

1. **What controls failed?** Run [Failed-control breakdown](#failed-control-breakdown). Repeated failures of one control mean a single misconfiguration; failures across many controls mean a broader posture drift.
2. **Was this caused by a recent change?** Check CloudTrail for `CreateBucket`, `RunInstances`, `CreateRole` events in the same window.
3. **Is the resource production?** Tag-based — non-production resource failures are usually still valid but lower priority.

### Investigation queries

#### Failed-control breakdown

```esql
FROM logs-aws.securityhub_findings-*
| WHERE @timestamp > NOW() - 1h
| WHERE aws.securityhub_findings.Compliance.Status == "FAILED"
| STATS failures = COUNT(*) BY aws.securityhub_findings.Compliance.SecurityControlId
| SORT failures DESC
| LIMIT 25
```

#### Resource-level failures

```esql
FROM logs-aws.securityhub_findings-*
| WHERE @timestamp > NOW() - 1h
| WHERE aws.securityhub_findings.Compliance.Status == "FAILED"
| KEEP @timestamp, aws.securityhub_findings.Resources.Type,
       aws.securityhub_findings.Resources.Id,
       aws.securityhub_findings.Compliance.SecurityControlId,
       aws.securityhub_findings.Severity.Label
| SORT @timestamp DESC
| LIMIT 25
```

### Likely causes

- **True positive:** A recent change introduced a misconfiguration (public S3, unencrypted volume, overly permissive IAM).
- **False positive:** A control firing on legacy resources that have been formally exception-listed but the exception hasn't been pushed to Security Hub yet.

### Containment & remediation

- For each failed control, follow the **AWS Foundational Security Best Practices** remediation guide that Security Hub links to in the finding.
- If the resource is non-production, file a posture-debt ticket.
- If the resource is production and the control is HIGH severity, fix today.

### Related rules in the chain

- `Security Finding Chain — Multi-Stage Chain Burst` (the broader signal).

### When to escalate

- The failed control is in the regulatory subset your org is audited against (PCI, HIPAA, SOC 2).
- The same resource fails multiple controls — likely a new resource that bypassed the landing-zone guardrails.

---

## 4. `[CloudLoadGen] Security Finding Chain — Multiple GuardDuty Alerts With Source IP`

**Threshold:** more than 5 GuardDuty alerts in 30 minutes that have a `source.ip` set.

### What this means

A burst of GuardDuty findings that share the property of having an external source IP. This usually means an external scanner / attacker is interacting with multiple resources in your account.

### Five-minute triage

1. **Which IPs?** Run [Top source IPs](#top-source-ips). One IP responsible for most of the burst → external actor; many IPs contributing → broader campaign.
2. **What did they touch?** Run [Targets per IP](#targets-per-ip).
3. **Is the IP on a threat feed?** If your environment has threat-intel enrichment, the GuardDuty document will already include it; otherwise check externally.

### Investigation queries

#### Top source IPs

```esql
FROM logs-aws.guardduty-*
| WHERE @timestamp > NOW() - 1h AND event.kind == "alert" AND source.ip IS NOT NULL
| STATS findings = COUNT(*) BY source.ip
| SORT findings DESC
| LIMIT 10
```

#### Targets per IP

```esql
FROM logs-aws.guardduty-*
| WHERE @timestamp > NOW() - 1h AND source.ip == "<top_ip>"
| KEEP @timestamp, aws.guardduty.type, aws.guardduty.severity.value,
       aws.guardduty.resource.instance_details.instance_id
| SORT @timestamp ASC
| LIMIT 50
```

### Likely causes

- **True positive:** An external scan / attack from one or a handful of IPs.
- **False positive:** A legitimate scanner you've engaged (penetration test, vulnerability scanner) — should already be source-IP allow-listed in GuardDuty.

### Containment & remediation

- Block the source IPs at WAF / NACL / firewall.
- If the targets include externally-exposed resources (load balancers, CloudFront distributions), check whether the attack succeeded by looking at downstream service logs.

### Related rules in the chain

- `Security Finding Chain — GuardDuty HIGH/CRITICAL Findings` (drill into severity).
- `Security Finding Chain — Multi-Stage Chain Burst` (broader signal across detectors).

### When to escalate

- Source IP is on a known threat feed.
- One or more of the targets is a customer-facing resource.

---

## See also

- [Chained event reference — Security Finding Chain](../chained-events/security-finding-chain.md) — how the chain is generated.
- [Data Exfiltration Chain runbook](./data-exfil-chain-alerts.md) — `Exfiltration*` GuardDuty findings live there.
- [IAM Privilege Escalation Chain runbook](./iam-privesc-chain-alerts.md) — `*PrivEsc*` and `*Persistence*` findings live there.
- [Workflow deployment guide](../workflow-deployment.md) — the alert-enrichment workflow attaches CI / owner / open-incident context to every notification.
