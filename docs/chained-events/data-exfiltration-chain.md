# Data Exfiltration Chain

A chained event scenario modelling a data exfiltration attack detected across cloud security, storage, and network services. The chain generates correlated log documents showing a threat detection, data-plane evidence of mass reads, and network-level egress activity from the same source IP.

## Cloud Variants

### AWS: GuardDuty + CloudTrail + VPC Flow (3 documents)

| Step | Service       | Dataset          | Description                                                           |
| ---- | ------------- | ---------------- | --------------------------------------------------------------------- |
| 1    | GuardDuty     | `aws.guardduty`  | `Exfiltration:S3/MaliciousIPCaller` finding with bucket and key count |
| 2    | CloudTrail    | `aws.cloudtrail` | Mass `GetObject` calls from the same attacker IP                      |
| 3    | VPC Flow Logs | `aws.vpcflow`    | Large egress byte count toward the attacker IP                        |

**Correlation:** Attacker IP, bucket name, and key count link GuardDuty and CloudTrail. VPC flow shows egress toward the same attacker IP.

### GCP: Cloud DLP + VPC Flow + Cloud Storage (3 documents)

| Step | Service       | Dataset       | Description                                                                |
| ---- | ------------- | ------------- | -------------------------------------------------------------------------- |
| 1    | Cloud DLP     | `gcp.dlp`     | High sensitive data findings (e.g. `CREDIT_CARD`) with large bytes scanned |
| 2    | VPC Flow Logs | `gcp.vpcflow` | Egress traffic from the exfiltration IP over HTTPS                         |
| 3    | Cloud Storage | `gcp.gcs`     | Sustained large-object reads from the same requester IP                    |

**Correlation:** Exfiltration IP appears across DLP `source.ip`, VPC `src_ip`, and GCS `requester_ip`. DLP adds a data sensitivity dimension not present in other clouds.

### Azure: Defender + Blob Storage + NSG (3 documents)

| Step | Service                 | Dataset                         | Description                                                  |
| ---- | ----------------------- | ------------------------------- | ------------------------------------------------------------ |
| 1    | Defender for Cloud      | `azure.defender`                | Alert on unusual storage volume with exfiltration intent     |
| 2    | Blob Storage            | `azure.blob_storage`            | High-volume blob reads from the same client IP               |
| 3    | Network Security Groups | `azure.network_security_groups` | Egress deny rule (`DenyHighEgress`) hit — containment signal |

**Correlation:** Source IP and storage account name link all three documents. Azure is the only variant where the final step models an **explicit network block** (NSG deny) rather than just evidence of egress.

## Detection Story

The chain models the standard **detect → evidence → network** exfiltration pattern:

1. **Detection** — a security service flags suspicious data access activity
2. **Data-plane evidence** — storage access logs confirm mass reads from the flagged IP
3. **Network evidence** — flow/firewall logs show large egress toward an external destination

Key signals:

- Detection document: `event.outcome: "failure"`, `event.kind: "alert"`
- Storage document: `event.outcome: "success"` (reads succeeded)
- Network document: synthetic `error` field (`DataExfiltration` or `HighEgressBytes`) for correlation

## Selecting This Chain

1. Set event type to **Logs** in the wizard.
2. On the **Chained Events** step, select the **Data Exfiltration Chain**.
3. Adjust the **Error rate** slider to control how frequently exfiltration scenarios are generated.
