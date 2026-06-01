# DNS C2 Attack Chain

A chained event scenario modelling a DNS-based command-and-control (C2) attack lifecycle detected via AWS Route 53 Resolver query logs. The chain generates **8 time-distributed** correlated DNS documents from a single compromised host: DGA reconnaissance, C2 domain resolution, beaconing at regular intervals, and DNS Firewall blocks when the threat is identified.

**Chain correlation:** every document in a run shares `labels.dns_attack_chain_id` with **consistent entity identity** (same `host.name`, `source.ip`, VPC, instance ID, and region) across all steps.

**Attack Discovery integration:** the chain uses `randAttackerHost()` — the **same host pool** as the IAM Privilege Escalation and Data Exfiltration chains — so Attack Discovery can correlate DNS C2 activity with privilege escalation and data theft on the same compromised host, building a multi-stage attack narrative.

> **Investigation guide for the alerts in this chain:** [../runbooks/dns-threat-detection.md](../runbooks/dns-threat-detection.md) — covers all four DNS detection rules (suspicious domain, DNS Firewall block, high NXDOMAIN rate, high unique domain count) with ES|QL queries, containment steps, and escalation criteria.

## Attack Timeline

| Step | Stage              | Time Offset | DNS Response | Description                                                      |
| ---- | ------------------ | ----------- | ------------ | ---------------------------------------------------------------- |
| 1    | DGA Recon          | T+0s        | NXDOMAIN     | Random-looking `.xyz` domain lookup #1 — DGA probing             |
| 2    | DGA Recon          | T+2s        | NXDOMAIN     | Random `.xyz` domain lookup #2                                   |
| 3    | DGA Recon          | T+4s        | NXDOMAIN     | Random `.xyz` domain lookup #3                                   |
| 4    | C2 Establishment   | T+8s        | NOERROR      | Successful resolution of DuckDNS C2 domain → IP address returned |
| 5    | Beaconing          | T+68s       | NOERROR      | First beacon — repeated query to C2 domain (~60s interval)       |
| 6    | Beaconing          | T+128s      | NOERROR      | Second beacon — same C2 domain (~60s interval)                   |
| 7    | Firewall Block     | T+188s      | NXDOMAIN     | DNS Firewall catches C2 domain — `BLOCK` action                  |
| 8    | Fallback (Blocked) | T+195s      | NXDOMAIN     | Attacker tries alternate domain (ngrok.io) — also blocked        |

## ECS Field Mapping

All documents land in `event.dataset: aws.route53_resolver_logs` with full ECS mapping:

| ECS Field                     | Value                                  | Notes                                     |
| ----------------------------- | -------------------------------------- | ----------------------------------------- |
| `host.name`                   | From `ATTACKER_HOSTS` pool             | Shared with IAM PrivEsc / Data Exfil      |
| `source.ip`                   | Consistent private IP per chain run    | Same source across all 8 events           |
| `dns.question.name`           | DGA domain / C2 domain / fallback      | Varies per stage                          |
| `dns.response_code`           | `NXDOMAIN` or `NOERROR`                | DGA + blocks = NXDOMAIN; C2 = NOERROR     |
| `dns.answers[].data`          | Resolved IP (C2 stages only)           | Synthetic `198.51.100.x` documentation IP |
| `rule.category`               | `dns_firewall` (block stages only)     | Links to Route 53 Resolver DNS Firewall   |
| `event.type`                  | `["denied"]` (blocks) / `["protocol"]` | Blocked queries carry `denied` type       |
| `event.category`              | `["network", "intrusion_detection"]`   | Firewall events add intrusion_detection   |
| `labels.dns_attack_chain_id`  | UUID shared across all 8 docs          | Correlation ID for the full chain         |
| `labels.dns_threat_indicator` | `dga_candidate` or `suspicious_domain` | Stage-specific threat label               |

## Detection Rules

Four Elastic Security detection rules target `aws.route53_resolver_logs`:

| Rule                                                 | Type      | MITRE Tactic                       | MITRE Technique                              | What It Catches                   |
| ---------------------------------------------------- | --------- | ---------------------------------- | -------------------------------------------- | --------------------------------- |
| `[CloudLoadGen] DNS Query to Suspicious Domain`      | query     | C2 (TA0011), Exfiltration (TA0010) | T1071.004 App Layer Protocol: DNS, T1048.003 | DuckDNS, ngrok, serveo, .xyz      |
| `[CloudLoadGen] DNS Firewall Block Event`            | query     | C2 (TA0011)                        | T1568 Dynamic Resolution                     | Queries blocked by DNS Firewall   |
| `[CloudLoadGen] High NXDOMAIN Rate from Single Host` | threshold | C2 (TA0011)                        | T1568.002 Domain Generation Algorithms       | 5+ NXDOMAIN from one host         |
| `[CloudLoadGen] Unusually High Unique Domain Count`  | threshold | Recon (TA0043), Exfil (TA0010)     | T1595.002 Vuln Scanning, T1048.003           | 15+ queries to 10+ unique domains |

These rules are installed via the Setup wizard or `npm run setup:alert-rules` and appear under Elastic Security → Detection Rules.

## MITRE ATT&CK Coverage

The chain and its rules cover multiple tactics and techniques, complementing the existing IAM and exfil chains:

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    MITRE ATT&CK Tactic Coverage                          │
├─────────────────────────┬────────────────────────────────────────────────┤
│ Reconnaissance (TA0043) │ T1595.002 Vulnerability Scanning              │
│                         │ → High unique domain count rule               │
├─────────────────────────┼────────────────────────────────────────────────┤
│ Command & Control       │ T1071.004 App Layer Protocol: DNS             │
│ (TA0011)                │ → Suspicious domain rule, beaconing detection │
│                         │ T1568 Dynamic Resolution                      │
│                         │ → DNS Firewall block rule                     │
│                         │ T1568.002 Domain Generation Algorithms        │
│                         │ → High NXDOMAIN rate rule                     │
├─────────────────────────┼────────────────────────────────────────────────┤
│ Exfiltration (TA0010)   │ T1048.003 Exfil Over Unencrypted Non-C2      │
│                         │ → Suspicious domain + high unique domain rules│
└─────────────────────────┴────────────────────────────────────────────────┘
```

## Attack Discovery Correlation

The DNS C2 chain is designed to produce alerts that Attack Discovery can correlate with alerts from other chains on the **same host**. A typical multi-chain attack narrative might look like:

1. **DNS C2** — compromised host resolves C2 domain, begins beaconing
2. **IAM PrivEsc** — attacker on the same host enumerates IAM users, creates access keys, attaches admin policies
3. **Data Exfil** — attacker exfiltrates data from S3 via the same compromised host

Attack Discovery links these together because:

- `host.name` is drawn from the same `ATTACKER_HOSTS` pool across all three chains
- Each chain's detection rules carry distinct MITRE ATT&CK tactic/technique mappings
- The combination of C2 + PrivEsc + Exfil tactics on a single host forms a recognisable attack pattern

## DNS Alert Enrichment Workflow

The bundled [`dns-alert-enrichment.yaml`](../../workflows/dns-alert-enrichment.yaml) is a Kibana Workflow that fires when any DNS detection rule alerts. It:

1. **Extracts** `dns.question.name`, `source.ip`, `alert_id`, `rule_name`, and `severity` from the alert (AI-powered)
2. **Queries** DNS domain frequency stats over 24h (ES|QL) — total queries, unique source IPs, NXDOMAIN count
3. **Queries** source IP DNS breadth over 24h — how many unique domains this IP has queried
4. **Searches** for related security alerts on the same source IP over 7 days
5. **Synthesises** all enrichment data via AI — threat assessment, key indicators, confidence level, recommended actions, and Attack Discovery context
6. **Creates** a Security Case with the full enrichment report, alert attached, and domain/IP observables added

Install via the Setup wizard (tick **DNS Alert Enrichment Workflow**) or paste the YAML into **Stack Management → Workflows → Create**.

## Supporting Elastic Assets

| Asset                   | File                                                                |
| ----------------------- | ------------------------------------------------------------------- |
| Detection rules (4)     | `installer/security-detection-rules/rules/dns-detection-rules.json` |
| Workflow                | `workflows/dns-alert-enrichment.yaml`                               |
| Generator (single logs) | `src/aws/generators/networking.ts` → `generateRoute53ResolverLog`   |
| Generator (chain)       | `src/aws/generators/networking.ts` → `generateDnsC2Chain`           |

## Selecting This Chain

1. Set event type to **Logs** in the wizard.
2. On the **Advanced Data Types** step, select **DNS C2 Chain**.
3. Adjust the **Error rate** slider — the standalone Route 53 Resolver generator uses the error rate for NXDOMAIN/SERVFAIL/REFUSED responses, while the chain always produces its full 8-event attack sequence.

For standalone (non-chain) DNS logs, select **Route 53 Resolver** under the Networking & CDN group.

## See Also

- [../runbooks/dns-threat-detection.md](../runbooks/dns-threat-detection.md) — per-rule investigation guides
- [../workflow-deployment.md](../workflow-deployment.md) — workflow install and deployment guide
- [data-exfiltration-chain.md](./data-exfiltration-chain.md) — the data exfil chain that correlates with DNS C2
- [iam-privilege-escalation-chain.md](./iam-privilege-escalation-chain.md) — the IAM privesc chain that correlates with DNS C2
