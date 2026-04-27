# IAM Privilege Escalation Chain

A chained event scenario modelling a multi-step IAM privilege escalation attack. The chain generates **time-distributed** correlated audit/control-plane log documents representing an attacker progressing through a MITRE ATT&CK-aligned kill chain: enumeration, persistence, privilege escalation, and lateral movement. Steps are spaced **about 30 seconds to 2 minutes** apart so the sequence reads like a real interactive session rather than a single burst.

**Chain correlation:** every document in a run shares `labels.attack_session_id` with **consistent entity identity** (same attacker principal, target identity, source IP, and user agent where applicable) across all steps.

## Cloud Variants

### AWS: CloudTrail IAM + STS (4 documents)

| Step | API Call           | Event Source        | MITRE Tactic         | Description                                        |
| ---- | ------------------ | ------------------- | -------------------- | -------------------------------------------------- |
| 1    | `ListUsers`        | `iam.amazonaws.com` | Discovery            | Attacker enumerates IAM users                      |
| 2    | `CreateAccessKey`  | `iam.amazonaws.com` | Persistence          | Access key created on a target user account        |
| 3    | `AttachUserPolicy` | `iam.amazonaws.com` | Privilege Escalation | AdministratorAccess policy attached to target user |
| 4    | `AssumeRole`       | `sts.amazonaws.com` | Lateral Movement     | Attacker assumes an AdminRole with elevated creds  |

All 4 documents use dataset `aws.cloudtrail` and share the same caller identity, source IP, account, and region. Narrative steps are labeled 1/4 through 4/4 in the message field.

### GCP: Cloud Audit Logs (4 documents)

| Step | Method                    | MITRE Tactic         | Description                                      |
| ---- | ------------------------- | -------------------- | ------------------------------------------------ |
| 1    | `ListServiceAccounts`     | Discovery            | Service account enumeration                      |
| 2    | `CreateServiceAccountKey` | Persistence          | Key created for a secondary service account      |
| 3    | `SetIamPolicy`            | Privilege Escalation | `roles/owner` granted via IAM policy update      |
| 4    | `generateAccessToken`     | Lateral Movement     | Access token generated for the escalated account |

All 4 documents use dataset `gcp.audit` with `service_name: "iam.googleapis.com"`. Shared caller IP, project, and `labels.attack_session_id` across all steps.

### Azure: Entra ID + Activity Log (3 documents)

| Step | Service                | Dataset              | MITRE Tactic         | Description                                                                                |
| ---- | ---------------------- | -------------------- | -------------------- | ------------------------------------------------------------------------------------------ |
| 1    | Microsoft Entra ID     | `azure.entra_id`     | Initial Access       | Risky sign-in detected (risk level: high, conditional access failed but sign-in succeeded) |
| 2    | Azure Resource Manager | `azure.activity_log` | Privilege Escalation | Owner role assignment written to a subscription                                            |
| 3    | Azure Resource Manager | `azure.activity_log` | Lateral Movement     | Elevated token used for subscription reads                                                 |

Shared user identity and `labels.attack_session_id` across all documents. Activity Log rows include `claims_token_minted: true` on the final step.

## Detection Story

The chain models an **undetected** privilege escalation where all control-plane operations succeed:

1. **Discovery** — attacker enumerates users/accounts to identify targets
2. **Persistence** — new credentials created on a secondary identity
3. **Privilege escalation** — administrative permissions granted
4. **Lateral movement** — escalated credentials used to access additional resources

All steps produce `event.outcome: "success"` (the attack succeeded in the control plane). The final document includes a synthetic `error` field with `PrivilegeEscalation` to signal chain completion — in a real environment, detection would rely on anomaly detection or rule-based correlation across the individual events.

## Supporting Elastic assets

| Cloud | Dashboard                                | Alert rules (JSON)                             | ML jobs (JSON)                               |
| ----- | ---------------------------------------- | ---------------------------------------------- | -------------------------------------------- |
| AWS   | `iam-privesc-chain-dashboard.json`       | `iam-privesc-chain-rules.json` (4 rules)       | `iam-privesc-chain-jobs.json` (3 jobs)       |
| GCP   | `gcp-iam-privesc-chain-dashboard.json`   | `gcp-iam-privesc-chain-rules.json` (4 rules)   | `gcp-iam-privesc-chain-jobs.json` (3 jobs)   |
| Azure | `azure-iam-privesc-chain-dashboard.json` | `azure-iam-privesc-chain-rules.json` (4 rules) | `azure-iam-privesc-chain-jobs.json` (3 jobs) |

Install via `npm run setup:{aws,gcp,azure}-dashboards`, `npm run setup:{aws,gcp,azure}-ml-jobs`, and `npm run setup:alert-rules`, or the web UI **Setup** step.

## Selecting This Chain

1. Set event type to **Logs** in the wizard.
2. On the **Advanced Data Types** step, select the **IAM Privilege Escalation Chain**.
3. The error rate slider does not affect this chain — all runs model a successful attack sequence.
