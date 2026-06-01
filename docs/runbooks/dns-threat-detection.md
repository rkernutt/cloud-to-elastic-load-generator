# Runbook — DNS Threat Detection alerts

Investigation guides for the four DNS detection rules targeting **Route 53 Resolver query logs**. These rules detect C2 beaconing, DGA activity, DNS tunnelling, and DNS Firewall policy enforcement. They produce alerts in `.alerts-security.alerts-*` for Attack Discovery correlation with IAM, exfiltration, and security finding alerts.

> **Linked chain reference:** [chained-events/dns-c2-chain.md](../chained-events/dns-c2-chain.md)
> **Workflow:** [workflows/dns-alert-enrichment.yaml](../../workflows/dns-alert-enrichment.yaml) — auto-enriches DNS alerts with domain stats, source IP breadth, related alerts, AI threat assessment, and creates a Security Case.

| Dataset                     | Index pattern                     | Key ECS fields                                                                      |
| --------------------------- | --------------------------------- | ----------------------------------------------------------------------------------- |
| `aws.route53_resolver_logs` | `logs-aws.route53_resolver_logs*` | `dns.question.name`, `dns.response_code`, `source.ip`, `host.name`, `rule.category` |

---

## 1. `[CloudLoadGen] DNS Query to Suspicious Domain`

**Type:** query — fires on any DNS query to a known dynamic DNS / tunnelling provider.

### What this means

A host inside your VPC resolved a domain associated with dynamic DNS services (DuckDNS, ngrok, serveo) or suspicious TLDs (`.xyz`). These services are routinely used to host C2 infrastructure, exfiltrate data over DNS, or establish reverse tunnels to bypass network controls.

### Five-minute triage

1. **Check the domain.** Is this a known-bad indicator or a legitimate use (e.g. developer using ngrok for local testing)?
2. **Check the host.** Run [Host identity lookup](#host-identity-lookup) — is this a production workload, developer instance, or unknown asset?
3. **Check for beaconing.** Run [Beaconing pattern check](#beaconing-pattern-check) — are queries to this domain periodic? Regular intervals (30s, 60s, 120s) are strong C2 indicators.

### Investigation queries

#### Host identity lookup

```esql
FROM logs-aws.route53_resolver_logs-*
| WHERE @timestamp > NOW() - 1h
  AND dns.question.name LIKE "*duckdns.org"
  OR dns.question.name LIKE "*ngrok.io"
  OR dns.question.name LIKE "*serveo.net"
  OR dns.question.name LIKE "*.xyz"
| STATS queries = COUNT(), unique_domains = COUNT_DISTINCT(dns.question.name)
  BY host.name, source.ip
| SORT queries DESC
| LIMIT 20
```

#### Beaconing pattern check

```esql
FROM logs-aws.route53_resolver_logs-*
| WHERE @timestamp > NOW() - 6h
  AND dns.question.name == "<suspicious_domain_from_alert>"
| KEEP @timestamp, host.name, source.ip, dns.question.name, dns.response_code
| SORT @timestamp ASC
| LIMIT 100
```

Look for regular time intervals between queries. Intervals of 30s, 60s, or 120s are classic C2 beaconing patterns.

#### Cross-reference with other alert types

```esql
FROM .alerts-security.alerts-*
| WHERE @timestamp > NOW() - 7d
  AND host.name == "<host_from_alert>"
| KEEP @timestamp, kibana.alert.rule.name, kibana.alert.severity
| SORT @timestamp DESC
| LIMIT 20
```

If the same host also triggered IAM PrivEsc or Data Exfil alerts, this is a multi-stage attack. Escalate immediately.

### Likely causes

- **True positive:** C2 callback from malware or a compromised application; data exfiltration via DNS tunnelling through DuckDNS subdomains.
- **False positive:** Developer tooling (ngrok for webhook testing), IoT devices using legitimate dynamic DNS, marketing analytics using `.xyz` TLD.

### Containment & remediation

1. **Block the domain** in Route 53 Resolver DNS Firewall immediately.
2. **Isolate the host** if beaconing is confirmed — snapshot for forensics before terminating.
3. **Check for data exfiltration** — look for encoded payloads in DNS TXT/CNAME responses:

```esql
FROM logs-aws.route53_resolver_logs-*
| WHERE @timestamp > NOW() - 24h
  AND dns.question.name LIKE "*<c2_parent_domain>*"
  AND (dns.question.type == "TXT" OR dns.question.type == "CNAME")
| KEEP @timestamp, dns.question.name, dns.question.type, dns.answers.data
| SORT @timestamp DESC
```

4. **Rotate credentials** on the compromised host (instance role, any stored secrets).

### Related rules

- `[CloudLoadGen] DNS Firewall Block Event` — confirms the domain was subsequently caught by policy.
- `[CloudLoadGen] High NXDOMAIN Rate from Single Host` — DGA reconnaissance often precedes C2 establishment.
- GuardDuty / Security Hub findings on the same host may provide additional malware indicators.

### When to escalate

- The domain resolves to a known threat intelligence indicator.
- The same host has triggered IAM PrivEsc or Data Exfil rules in the last 7 days.
- Beaconing intervals are regular (< 5-minute intervals) and sustained (> 1 hour).

---

## 2. `[CloudLoadGen] DNS Firewall Block Event`

**Type:** query — fires on any DNS query blocked by Route 53 Resolver DNS Firewall.

### What this means

Route 53 DNS Firewall blocked a query to a domain on a managed or custom block list. The threat was **prevented** — the host did not receive a valid resolution — but the query itself is evidence that something on the host tried to reach a known-bad domain.

### Five-minute triage

1. **Check the blocked domain.** What category is it on the block list? (Malware C2, phishing, crypto mining, newly observed?)
2. **Check the host.** Is this the first block or a pattern? Run [Block history for this host](#block-history-for-this-host).
3. **Check for successful queries.** Did the host successfully resolve the same or similar domains _before_ the firewall rule was added? Run [Pre-block resolution check](#pre-block-resolution-check).

### Investigation queries

#### Block history for this host

```esql
FROM logs-aws.route53_resolver_logs-*
| WHERE @timestamp > NOW() - 24h
  AND rule.category == "dns_firewall"
| STATS blocks = COUNT(), domains_blocked = COUNT_DISTINCT(dns.question.name)
  BY host.name, source.ip
| SORT blocks DESC
| LIMIT 20
```

#### Pre-block resolution check

```esql
FROM logs-aws.route53_resolver_logs-*
| WHERE @timestamp > NOW() - 7d
  AND dns.question.name == "<blocked_domain>"
  AND dns.response_code == "NOERROR"
| KEEP @timestamp, host.name, source.ip, dns.answers.data
| SORT @timestamp ASC
```

If there are successful resolutions before the block date, the host was communicating with the C2 domain before the firewall caught it. Treat as confirmed compromise.

### Likely causes

- **True positive:** Malware or a compromised application attempted to reach C2 infrastructure.
- **False positive:** Overly broad DNS Firewall rules blocking legitimate domains; newly registered domains caught by "newly observed" block lists.

### Containment & remediation

- The DNS Firewall already blocked the query — the immediate threat is contained at the DNS layer.
- **Investigate the host** for other compromise indicators. The block means something on the host is actively trying to reach a bad domain.
- **Check for alternative resolution methods** — if the host has hardcoded IPs or uses DNS-over-HTTPS (DoH), the DNS Firewall won't catch those.

### Related rules

- `[CloudLoadGen] DNS Query to Suspicious Domain` — if the host successfully resolved the domain before the firewall rule was applied.
- `[CloudLoadGen] High NXDOMAIN Rate from Single Host` — a blocked host may fall back to DGA patterns.

### When to escalate

- Multiple hosts are hitting the same block rule simultaneously (coordinated malware).
- The blocked domain appears in threat intelligence feeds as active C2.
- The host was resolving the domain successfully for days/weeks before the block.

---

## 3. `[CloudLoadGen] High NXDOMAIN Rate from Single Host`

**Type:** threshold — fires when a single host generates 5+ NXDOMAIN responses within the detection window.

### What this means

A single host is generating an abnormal volume of failed DNS lookups. This is a strong indicator of **Domain Generation Algorithm (DGA)** activity, where malware systematically probes random-looking domain names until it finds one that the C2 operator has registered.

### Five-minute triage

1. **Examine the domains.** Run [NXDOMAIN domain list](#nxdomain-domain-list) — are the queried domains random-looking strings? That confirms DGA.
2. **Check for successful resolution.** If any of the probed domains resolved successfully, the host has found its C2 server.
3. **Check for malware indicators.** Cross-reference the host with GuardDuty findings.

### Investigation queries

#### NXDOMAIN domain list

```esql
FROM logs-aws.route53_resolver_logs-*
| WHERE @timestamp > NOW() - 1h
  AND dns.response_code == "NXDOMAIN"
  AND host.name == "<host_from_alert>"
| STATS count = COUNT() BY dns.question.name
| SORT count DESC
| LIMIT 50
```

#### Successful resolution amidst NXDOMAIN storm

```esql
FROM logs-aws.route53_resolver_logs-*
| WHERE @timestamp > NOW() - 1h
  AND host.name == "<host_from_alert>"
  AND dns.response_code == "NOERROR"
| KEEP @timestamp, dns.question.name, dns.answers.data
| SORT @timestamp DESC
| LIMIT 20
```

Any domain that resolved successfully during a DGA storm is the live C2 domain — block it and investigate immediately.

#### Host NXDOMAIN rate over time

```esql
FROM logs-aws.route53_resolver_logs-*
| WHERE @timestamp > NOW() - 24h
  AND host.name == "<host_from_alert>"
| EVAL is_nxdomain = CASE(dns.response_code == "NXDOMAIN", 1, 0)
| STATS total = COUNT(), nxdomain = SUM(is_nxdomain)
  BY host.name
```

### Likely causes

- **True positive:** DGA-based malware probing for active C2 domains; misconfigured malware with a dead C2 domain generating continuous lookups.
- **False positive:** Misconfigured service discovery (querying non-existent internal hostnames), DNS health checks against canary domains, Kubernetes DNS search path expansion generating NXDOMAIN for short names.

### Containment & remediation

1. **Isolate the host** from the network — DGA activity confirms the host is compromised.
2. **Block the DGA pattern** in DNS Firewall — if domains share a common TLD or naming pattern, create a wildcard block rule.
3. **Scan the host** for malware — check running processes, network connections, and recently modified files.
4. **Check for successful C2 connections** — any domain from the same host that resolved to an external IP is a confirmed C2 channel.

### Related rules

- `[CloudLoadGen] DNS Query to Suspicious Domain` — the successful resolution that ends a DGA storm.
- `[CloudLoadGen] Unusually High Unique Domain Count` — DGA storms always query many unique domains.

### When to escalate

- The NXDOMAIN rate is sustained (> 100/hour) — active DGA loop.
- Any domain from the storm resolved successfully — active C2 established.
- Multiple hosts are showing the same DGA pattern — worm propagation.

---

## 4. `[CloudLoadGen] Unusually High Unique Domain Count from Single Host`

**Type:** threshold with cardinality — fires when a single host queries 15+ DNS requests with 10+ unique domain names within the detection window.

### What this means

A single host is querying an abnormally large number of distinct domains. This can indicate:

- **DNS tunnelling** — data exfiltration encoded as random subdomains of a single parent domain
- **Reconnaissance** — scanning/probing many targets by DNS name
- **Compromised host** — beaconing to rotating C2 infrastructure

### Five-minute triage

1. **Check domain diversity.** Run [Domain diversity analysis](#domain-diversity-analysis) — are the domains random subdomains of one parent (tunnelling) or many unrelated domains (recon/compromise)?
2. **Check for data patterns.** If domains look like `<base64-data>.evil.com`, that's DNS tunnelling.
3. **Compare to baseline.** Is this normal for this host role? Web servers naturally query many domains.

### Investigation queries

#### Domain diversity analysis

```esql
FROM logs-aws.route53_resolver_logs-*
| WHERE @timestamp > NOW() - 1h
  AND host.name == "<host_from_alert>"
| STATS queries = COUNT() BY dns.question.name
| SORT queries DESC
| LIMIT 50
```

Look for patterns:

- Many subdomains of **one parent** = DNS tunnelling (e.g. `abc123.evil.com`, `def456.evil.com`)
- Many **unrelated** domains = reconnaissance or compromised host
- Many **internal** domains = misconfigured service discovery (likely benign)

#### DNS tunnelling indicator — subdomain entropy

```esql
FROM logs-aws.route53_resolver_logs-*
| WHERE @timestamp > NOW() - 1h
  AND host.name == "<host_from_alert>"
| STATS unique_subdomains = COUNT_DISTINCT(dns.question.name), total = COUNT()
  BY dns.question.name
| WHERE unique_subdomains > 5
| SORT unique_subdomains DESC
```

#### Compare with host baseline

```esql
FROM logs-aws.route53_resolver_logs-*
| WHERE @timestamp > NOW() - 7d
| STATS daily_unique = COUNT_DISTINCT(dns.question.name)
  BY host.name, BUCKET(@timestamp, 1 day)
| SORT host.name, `BUCKET(@timestamp, 1 day)` DESC
```

### Likely causes

- **True positive:** DNS tunnelling (data exfiltration via DNS), compromised host beaconing to rotating infrastructure, reconnaissance scanning.
- **False positive:** Web crawlers or spiders, package managers resolving many registry domains, CI/CD systems pulling dependencies from many sources.

### Containment & remediation

1. **If DNS tunnelling** — block the parent domain in DNS Firewall and monitor the host's network egress.
2. **If reconnaissance** — the host may be compromised and scanning your infrastructure. Isolate and investigate.
3. **Check for encoded payloads** — DNS TXT query responses with Base64 or hex-encoded data confirm tunnelling.

### Related rules

- `[CloudLoadGen] DNS Query to Suspicious Domain` — many unique domains may include known-bad providers.
- `[CloudLoadGen] High NXDOMAIN Rate from Single Host` — if many of the unique domains also fail resolution, that's DGA.

### When to escalate

- Subdomain pattern analysis confirms DNS tunnelling (random strings under a single parent).
- The same host has triggered network egress or data exfiltration alerts.
- Multiple hosts show the same queried parent domain (coordinated exfiltration).

---

## Attack Discovery correlation

When DNS detection rules fire alongside IAM PrivEsc or Data Exfil rules for the same `host.name`, Attack Discovery will attempt to correlate these into a unified attack narrative. The typical multi-stage pattern:

| Stage | Chain             | MITRE Tactic         | What happened                                     |
| ----- | ----------------- | -------------------- | ------------------------------------------------- |
| 1     | DNS C2            | Command and Control  | Host resolves C2 domain, begins DNS beaconing     |
| 2     | IAM PrivEsc       | Privilege Escalation | Attacker uses C2 access to enumerate/escalate IAM |
| 3     | Data Exfiltration | Exfiltration         | Attacker exfiltrates data from S3 via the host    |

To maximise Attack Discovery effectiveness, ensure:

1. All three chains are enabled and generating logs
2. Detection rules for all three chains are installed and active
3. The error rate is high enough that suspicious events fire regularly
4. Logs have been shipping for at least 24 hours so AD has enough alert volume to correlate

## See also

- [Chained event reference — DNS C2 Chain](../chained-events/dns-c2-chain.md) — how the chain is generated, timeline, and ECS field mapping.
- [Workflow deployment guide](../workflow-deployment.md) — general workflow installation and configuration.
- [Security detection — IAM PrivEsc](./security-detection-iam-privesc.md) — IAM escalation rules that correlate with DNS C2.
- [Security detection — Data Exfil](./security-detection-exfil.md) — data exfiltration rules that correlate with DNS C2.
