# Runbook — Data Exfiltration Detection Rules

Investigation and remediation guides for the four Elastic Security detection rules that target **data exfiltration** patterns — GuardDuty exfiltration findings, S3 mass access, VPC egress anomalies, and WAF attack indicators.

> **Linked dashboard:** `Data Exfiltration Chain — overview`
> **MITRE ATT&CK coverage:** Exfiltration (TA0010), Collection (TA0009), Reconnaissance (TA0043)
> **Agent Builder:** Ask the SOC Analyst: _"Investigate all activity from IP &lt;source_ip&gt;"_

| Rule                                    | Severity | Risk | MITRE Technique |
| --------------------------------------- | -------- | ---- | --------------- |
| GuardDuty S3 Data Exfiltration Finding  | Critical | 99   | T1537           |
| S3 Mass Object Access (GetObject Burst) | High     | 73   | T1530           |
| VPC Flow Unusually High Egress Volume   | High     | 73   | T1048           |
| WAF Block Rate Spike                    | Medium   | 47   | T1595           |

---

## 1. `[CloudLoadGen] GuardDuty S3 Data Exfiltration Finding`

**Severity:** Critical | **Risk Score:** 99
**MITRE:** Exfiltration → Transfer Data to Cloud Account (T1537)

### What this means

GuardDuty has classified an event as data exfiltration. This is the highest-fidelity exfiltration signal available — GuardDuty uses ML models and threat intelligence to make this determination. Findings in this category include `Exfiltration:S3/MaliciousIPCaller`, `Exfiltration:S3/AnomalousBehavior`, and `Exfiltration:IAMUser/AnomalousBehavior`.

### Five-minute triage

1. **Read the finding type.** Different exfiltration types indicate different vectors (S3, IAM role, network).
2. **Identify the principal.** Who is moving data — an IAM user, a role, or an instance?
3. **Check the destination.** Where is data going — an external IP, a different AWS account, or a foreign region?
4. **Is the principal still active?** If sessions are open, contain **now**.

### Investigation queries

#### Exfiltration finding details

```esql
FROM logs-aws.guardduty-*
| WHERE @timestamp > NOW() - 1h
| WHERE message LIKE "*Exfiltration*" OR message LIKE "*exfil*"
| KEEP @timestamp, event.action, event.severity, source.ip, destination.ip, message
| SORT @timestamp DESC
```

#### Principal's recent S3 activity

```esql
FROM logs-aws.cloudtrail-*
| WHERE @timestamp > NOW() - 6h
| WHERE event.action IN ("GetObject", "ListObjects", "PutObject", "CopyObject")
| KEEP @timestamp, event.action, user.name, source.ip,
       aws.cloudtrail.request_parameters
| SORT @timestamp DESC
| LIMIT 50
```

#### CMDB context for affected storage

```esql
FROM logs-servicenow.event-*
| WHERE tags == "cmdb_ci"
| WHERE servicenow.event.category.value == "Storage"
| KEEP servicenow.event.name.value, servicenow.event.owned_by.display_value,
       servicenow.event.support_group.display_value,
       servicenow.event.ip_address.value, servicenow.event.fqdn.value
| LIMIT 10
```

### Containment & remediation

1. **Rotate the principal's credentials immediately.**
2. **Block outbound traffic** to the destination IP at the security group/firewall.
3. **Apply a deny-all S3 bucket policy** scoped to the compromised principal.
4. **Snapshot evidence** — VPC flow logs, CloudTrail, S3 access logs.
5. **Assess data impact** — what data was in the bucket? Is it PII, financial, or customer data?
6. **Open a Sev-1 incident.**

### When to escalate

- **Always page on-call for exfiltration findings.**
- Page legal/compliance if customer or regulated data is involved.
- Engage forensics to determine exact data volume and content.

---

## 2. `[CloudLoadGen] S3 Mass Object Access (GetObject Burst)`

**Severity:** High | **Risk Score:** 73
**MITRE:** Collection → Data from Cloud Storage (T1530)

### What this means

10 or more S3 `GetObject` calls came from the same source IP within a 5-minute window. This threshold-based rule catches bulk data reads that may not trigger GuardDuty's ML model but are still anomalous — especially from unfamiliar IPs or service accounts that don't normally access S3 at this volume.

### Five-minute triage

1. **Which IP?** The threshold groups by `source.ip` — identify the source.
2. **Which bucket(s)?** Check `aws.cloudtrail.resources.arn` for the target bucket.
3. **Is this a known data pipeline?** Legitimate batch jobs read many objects — check `user_agent.original` for Spark, EMR, Glue, or known ETL tools.

### Investigation queries

#### Burst source identification

```esql
FROM logs-aws.cloudtrail-*
| WHERE @timestamp > NOW() - 30m AND event.action == "GetObject"
| STATS reads = COUNT(*) BY source.ip, user.name
| SORT reads DESC
| LIMIT 10
```

#### Target bucket and object volume

```esql
FROM logs-aws.cloudtrail-*
| WHERE @timestamp > NOW() - 30m AND event.action == "GetObject"
| WHERE source.ip == "<suspicious_ip>"
| KEEP @timestamp, user.name, aws.cloudtrail.resources.arn, user_agent.original
| SORT @timestamp DESC
| LIMIT 50
```

### Containment & remediation

1. **If unknown IP/principal** — block the IP and rotate the principal's credentials.
2. **If known pipeline** — add an exception to the detection rule for that source IP or service account.
3. **If sensitive bucket** — audit exactly which objects were read and assess data exposure.

### When to escalate

- The target bucket contains PII, financial, or customer data.
- The source IP is external or from a non-production environment accessing production data.
- Combined with a GuardDuty exfiltration finding (rules 1 + 2 = confirmed exfil).

---

## 3. `[CloudLoadGen] VPC Flow Unusually High Egress Volume`

**Severity:** High | **Risk Score:** 73
**MITRE:** Exfiltration → Exfiltration Over Alternative Protocol (T1048)

### What this means

VPC Flow Logs show unusually high outbound (egress) traffic. While this rule casts a wider net than GuardDuty, it catches exfiltration channels that GuardDuty might miss — encrypted tunnels, DNS exfiltration, or non-standard protocols.

### Five-minute triage

1. **Which source instance?** Check the source IP — map it to an EC2 instance.
2. **Which destination?** Foreign IPs, Tor exit nodes, or known file-sharing services are high-signal.
3. **What's the normal baseline?** Compare to the last 7 days of egress from the same source.

### Investigation queries

#### Top egress sources

```esql
FROM logs-aws.vpcflow-*
| WHERE @timestamp > NOW() - 1h AND event.outcome == "success"
| WHERE network.direction == "outbound" OR message LIKE "*egress*"
| KEEP @timestamp, source.ip, destination.ip, message
| SORT @timestamp DESC
| LIMIT 25
```

#### Cross-reference with CloudTrail

```esql
FROM logs-aws.cloudtrail-*
| WHERE @timestamp > NOW() - 1h AND source.ip == "<high_egress_source_ip>"
| STATS actions = COUNT(*) BY event.action, event.outcome
| SORT actions DESC
| LIMIT 20
```

### Containment & remediation

1. **Block the destination** if unknown — at the security group, NACL, or route table.
2. **Investigate the source instance** — check for malware, unauthorised processes, or compromised credentials.
3. **If the source is a data pipeline host** — verify the egress is to expected destinations.
4. **Capture a flow log snapshot** for forensic analysis.

### When to escalate

- Destination is a foreign IP not in any allow-list.
- Egress volume exceeds 10x the 7-day average.
- Combined with GuardDuty or S3 access alerts.

---

## 4. `[CloudLoadGen] WAF Block Rate Spike`

**Severity:** Medium | **Risk Score:** 47
**MITRE:** Reconnaissance → Active Scanning (T1595)

### What this means

AWS WAF is blocking an elevated number of requests — indicating active scanning, probing, or attack attempts against your web applications. While WAF is doing its job (blocking), a spike may indicate a persistent attacker who will eventually find an unprotected endpoint.

### Five-minute triage

1. **What's being blocked?** Check WAF rule IDs — SQL injection, XSS, rate limiting, or geo-blocking?
2. **From where?** Identify the top source IPs being blocked.
3. **Is it automated?** High volume from few IPs = automated scanner; low volume from many IPs = distributed attack.

### Investigation queries

#### WAF block analysis

```esql
FROM logs-aws.waf-*
| WHERE @timestamp > NOW() - 1h AND event.outcome == "failure"
| WHERE message LIKE "*BLOCK*"
| KEEP @timestamp, source.ip, message, event.action
| SORT @timestamp DESC
| LIMIT 25
```

#### Source IP concentration

```esql
FROM logs-aws.waf-*
| WHERE @timestamp > NOW() - 1h AND event.outcome == "failure"
| STATS blocks = COUNT(*) BY source.ip
| SORT blocks DESC
| LIMIT 10
```

### Containment & remediation

1. **If single-source scanner** — add the IP to the WAF IP blacklist for permanent blocking.
2. **If distributed** — enable AWS Shield Advanced or increase rate-limiting thresholds.
3. **Review WAF rules** — are any managed rule groups disabled that should be active?
4. **Check for bypass attempts** — is the attacker also accessing non-WAF-protected endpoints?

### When to escalate

- Block rate exceeds 10x normal for more than 30 minutes.
- The blocked requests target authentication endpoints or admin panels.
- Evidence of successful requests from the same IPs (WAF bypass).

---

## See also

- [Data Exfiltration Chain runbook (stack rules)](./data-exfil-chain-alerts.md) — the chain-scenario `.es-query` rules for the full exfil chain.
- [IAM PrivEsc detection runbook](./security-detection-iam-privesc.md) — privilege escalation often precedes data exfiltration.
- [SOC Demo Setup](../SOC-DEMO-SETUP.md) — full walkthrough using these rules with Attack Discovery and Agent Builder.
- [Workflow deployment guide](../workflow-deployment.md) — the security alert enrichment workflow adds CMDB context to notifications.
