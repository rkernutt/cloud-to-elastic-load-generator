# Investigation guides (alert runbooks)

Practical "what to do when this alert fires" guides for the alerting rules that **Cloud Loadgen for Elastic** installs. They're designed for the on-call engineer who lands on an Alert Details page and needs to triage in under five minutes.

The runbooks are **cloud-agnostic** in structure and call out vendor-specific datasets/queries inline (AWS, GCP, Azure). They cover the 51 chained-scenario rules across the four chains and apply to ESS, Serverless, and self-hosted deployments. An additional **192 per-service domain rules** (compute, database, networking, AI/ML, storage, messaging, DevOps, security-ops) ship alongside the chains — **243 rules total** — each with its own investigation guide and linked dashboards.

## Runbooks by chain

| Chain                          | Rules                                                                              | Runbook                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Data & Analytics Pipeline      | Failure rate, null/empty data, EMR/Spark error, source format error, slow run      | [data-pipeline-alerts.md](./data-pipeline-alerts.md)                   |
| Data Exfiltration Chain        | Threat-detector exfiltration, high egress, mass object access, full chain          | [data-exfil-chain-alerts.md](./data-exfil-chain-alerts.md)             |
| IAM Privilege Escalation Chain | Access-key creation, admin policy attach, AssumeRole+TTPs, dangerous-action volume | [iam-privesc-chain-alerts.md](./iam-privesc-chain-alerts.md)           |
| Security Finding Chain         | High/critical findings, multi-stage burst, compliance failed, source-IP repetition | [security-finding-chain-alerts.md](./security-finding-chain-alerts.md) |

## How to find a runbook from an alert

1. **Open the alert** (Alerts → click the alert).
2. **Click the linked dashboard** (rules ship with `artifacts.dashboards` so the chain overview dashboard opens in one click).
3. **Open the runbook** for that chain — link is at the top of the dashboard markdown panel and in the workflow email body when the alert-enrichment workflow is enabled.

Each runbook follows the same template so on-call engineers don't have to context-switch:

- **What this means** — one sentence; what fired and why
- **Five-minute triage** — the three checks you must do before paging
- **Investigation queries** — copy/paste ES|QL the on-call engineer can run in Discover
- **Likely causes** — true positives and the common false positives
- **Containment & remediation** — what to do (and not do) right now
- **Related rules in the chain** — what to look for next
- **When to escalate** — the bar for waking someone up

## Linked dashboards (one-click context)

Every chain rule has the chain's overview dashboard linked via Kibana's `artifacts.dashboards` (Stack 8.19 / 9.1+) **plus** one or more service-specific dashboards that match the rule's primary dataset — so an EMR/Spark error alert opens both the chain overview and the EMR dashboard, an S3 mass-access alert opens the chain overview, the CloudTrail dashboard, **and** the S3 dashboard, and so on. Multi-source correlation rules (the chain "burst" / "full chain" rules) deliberately link only the chain overview because that's where the cross-service panels live. On older Kibana versions (pre-8.19 / pre-9.1) the link block is silently ignored — the runbooks always show the dashboard title so you can open it manually.

| Chain                          | Always-linked chain overview                |
| ------------------------------ | ------------------------------------------- |
| Data & Analytics Pipeline      | `Data & Analytics Pipeline — overview`      |
| Data Exfiltration Chain        | `Data Exfiltration Chain — overview`        |
| IAM Privilege Escalation Chain | `IAM Privilege Escalation Chain — overview` |
| Security Finding Chain         | `Security Finding Chain — overview`         |

Per-rule additions are listed in [`docs/SETUP-WIZARD-AND-UNINSTALL.md → Linked dashboards on alerts`](../SETUP-WIZARD-AND-UNINSTALL.md#linked-dashboards-on-alerts) and are editable per rule in `installer/<cloud>-custom-rules/<file>.json`.

## See also

- [chained-events/](../chained-events/) — how each chain is generated, the services involved, and the correlation IDs the runbooks reference.
- [workflow-deployment.md](../workflow-deployment.md) — the optional alert-enrichment workflow that adds ServiceNow context (CI owner, support group, recent changes) to alert notifications.
- [SETUP-WIZARD-AND-UNINSTALL.md](../SETUP-WIZARD-AND-UNINSTALL.md#linked-dashboards-on-alerts) — how the dashboard link block is built and which Stack versions surface it.
