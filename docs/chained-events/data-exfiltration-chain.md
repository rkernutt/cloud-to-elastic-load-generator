# Data Exfiltration Chain

A chained event scenario modelling a data exfiltration attack detected across cloud security, storage, and network services. The chain generates **time-distributed** correlated log documents: **data-plane access and evidence typically occur before or alongside** the formal detection timestamps so the story reads as access → movement → detection, with **megabyte-scale byte volumes** on storage and flow fields for credible scale.

**Chain correlation:** every document in a run shares `labels.exfil_chain_id` with **consistent entities** (same attacker IP, bucket/storage account, and compute identity where modeled) across GuardDuty/Defender/DLP, access logs, and network logs.

## Cloud Variants

### AWS: GuardDuty + CloudTrail + VPC Flow (3 documents)

| Step | Service       | Dataset          | Description                                                           |
| ---- | ------------- | ---------------- | --------------------------------------------------------------------- |
| 1    | GuardDuty     | `aws.guardduty`  | `Exfiltration:S3/MaliciousIPCaller` finding with bucket and key count |
| 2    | CloudTrail    | `aws.cloudtrail` | Mass `GetObject` calls from the same attacker IP                      |
| 3    | VPC Flow Logs | `aws.vpcflow`    | Large egress byte count toward the attacker IP                        |

**Correlation:** Attacker IP, bucket name, and key count link GuardDuty and CloudTrail. VPC flow shows egress toward the same attacker IP. `labels.exfil_chain_id` ties the full chain.

### GCP: Cloud DLP + VPC Flow + Cloud Storage (3 documents)

| Step | Service       | Dataset       | Description                                                                |
| ---- | ------------- | ------------- | -------------------------------------------------------------------------- |
| 1    | Cloud DLP     | `gcp.dlp`     | High sensitive data findings (e.g. `CREDIT_CARD`) with large bytes scanned |
| 2    | VPC Flow Logs | `gcp.vpcflow` | Egress traffic from the exfiltration IP over HTTPS                         |
| 3    | Cloud Storage | `gcp.gcs`     | Sustained large-object reads from the same requester IP                    |

**Correlation:** Exfiltration IP appears across DLP `source.ip`, VPC `src_ip`, and GCS `requester_ip`. DLP adds a data sensitivity dimension not present in other clouds. Shared `labels.exfil_chain_id`.

### Azure: Defender + Blob Storage + NSG (3 documents)

| Step | Service                 | Dataset                         | Description                                                  |
| ---- | ----------------------- | ------------------------------- | ------------------------------------------------------------ |
| 1    | Defender for Cloud      | `azure.defender`                | Alert on unusual storage volume with exfiltration intent     |
| 2    | Blob Storage            | `azure.blob_storage`            | High-volume blob reads from the same client IP               |
| 3    | Network Security Groups | `azure.network_security_groups` | Egress deny rule (`DenyHighEgress`) hit — containment signal |

**Correlation:** Source IP, storage account name, and `labels.exfil_chain_id` link all three documents. Azure is the only variant where the final step models an **explicit network block** (NSG deny) rather than just evidence of egress.

## Detection Story

The chain models the standard **detect → evidence → network** exfiltration pattern:

1. **Detection** — a security service flags suspicious data access activity
2. **Data-plane evidence** — storage access logs confirm mass reads from the flagged IP
3. **Network evidence** — flow/firewall logs show large egress toward an external destination

Key signals:

- Detection document: `event.outcome: "failure"`, `event.kind: "alert"`
- Storage document: `event.outcome: "success"` (reads succeeded)
- Network document: synthetic `error` field (`DataExfiltration` or `HighEgressBytes`) for correlation

## Supporting Elastic assets

| Cloud | Dashboard                               | Alert rules (JSON)                            | ML jobs (JSON)                              |
| ----- | --------------------------------------- | --------------------------------------------- | ------------------------------------------- |
| AWS   | `data-exfil-chain-dashboard.json`       | `data-exfil-chain-rules.json` (4 rules)       | `data-exfil-chain-jobs.json` (3 jobs)       |
| GCP   | `gcp-data-exfil-chain-dashboard.json`   | `gcp-data-exfil-chain-rules.json` (4 rules)   | `gcp-data-exfil-chain-jobs.json` (3 jobs)   |
| Azure | `azure-data-exfil-chain-dashboard.json` | `azure-data-exfil-chain-rules.json` (4 rules) | `azure-data-exfil-chain-jobs.json` (3 jobs) |

Install via `npm run setup:{aws,gcp,azure}-dashboards`, `npm run setup:{aws,gcp,azure}-ml-jobs`, and `npm run setup:alert-rules`, or the web UI **Setup** step.

## Selecting This Chain

1. Set event type to **Logs** in the wizard.
2. On the **Advanced Data Types** step, select the **Data Exfiltration Chain**.
3. Adjust the **Error rate** slider to control how frequently exfiltration scenarios are generated.
