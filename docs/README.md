# Documentation

Reference material for **Cloud to Elastic Load Generator**. All Markdown guides live under this folder; the [project README](../README.md) covers quick start, Docker, and CI.

---

## Essentials

| Document                                                         | Description                                                                                               |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [api-key-permissions.md](./api-key-permissions.md)               | Least-privilege API key definitions (ship-only and full-access), privilege breakdown, API operations list |
| [development.md](./development.md)                               | Local dev, Docker, npm scripts, samples, icons, format/lint/typecheck                                     |
| [SETUP-WIZARD-AND-UNINSTALL.md](./SETUP-WIZARD-AND-UNINSTALL.md) | Setup wizard: Cloud Loadgen Integrations, per-service install, **`cloudloadgen`** tag, Serverless limits  |
| [otel-traces-setup.md](./otel-traces-setup.md)                   | OpenTelemetry-style traces and related setup notes                                                        |
| [INGEST-PIPELINE-REFERENCE.md](./INGEST-PIPELINE-REFERENCE.md)   | Ingest pipeline conventions and field reference (AWS custom pipelines)                                    |

---

## Cloud Loadgen Integrations

All Elastic assets — **ingest pipelines**, **data stream templates**, **Kibana dashboards**, **ML anomaly detection jobs**, and **alerting rules** — are installed together **per service** as **Cloud Loadgen Integrations**. Every asset is tagged or labelled **`cloudloadgen`** so you can filter, view, or bulk-edit them in Kibana without affecting production objects. The Setup page groups integrations by service category (Compute, Networking, Databases, etc.) across all three clouds.

See [SETUP-WIZARD-AND-UNINSTALL.md](./SETUP-WIZARD-AND-UNINSTALL.md) for details on installing, filtering, removing integrations, **post-install options** (enabling rules and starting ML jobs), **ServiceNow CMDB integration**, **ML Training Mode**, **Serverless use-case selector**, dashboard installation fallback strategy, and alerting rule compatibility.

---

## Chained Events

Multi-service correlated scenarios that generate logs, metrics, APM traces (for the Elastic Service Map), dashboards, ML jobs, and alerting rules. Security-oriented chains (**Security Finding**, **IAM Privilege Escalation**, **Data Exfiltration**) use **time-distributed events** and `labels.finding_chain_id`, `labels.attack_session_id`, or `labels.exfil_chain_id` for correlation. All chains include **ECS user identity fields** and **companion audit trail events** for realistic attribution. The first three guides each document **AWS, GCP, and Azure** variants in one place.

| Scenario                                                                               | Document                                                                                               |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Security Finding Chain (detect → aggregate → triage)                                   | [chained-events/security-finding-chain.md](./chained-events/security-finding-chain.md)                 |
| IAM Privilege Escalation Chain                                                         | [chained-events/iam-privilege-escalation-chain.md](./chained-events/iam-privilege-escalation-chain.md) |
| Data Exfiltration Chain                                                                | [chained-events/data-exfiltration-chain.md](./chained-events/data-exfiltration-chain.md)               |
| AWS Data & Analytics Pipeline (S3 → EMR → Glue → Athena → MWAA)                        | [chained-events/data-analytics-pipeline.md](./chained-events/data-analytics-pipeline.md)               |
| GCP Data & Analytics Pipeline (GCS → Dataproc → Data Catalog → BigQuery → Composer)    | [chained-events/gcp-data-analytics-pipeline.md](./chained-events/gcp-data-analytics-pipeline.md)       |
| Azure Data & Analytics Pipeline (Blob → Databricks → Purview → Synapse → Data Factory) | [chained-events/azure-data-analytics-pipeline.md](./chained-events/azure-data-analytics-pipeline.md)   |

---

## AWS: CloudWatch → Elastic

| Document                                                                                   | Description                                                            |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| [CLOUDWATCH-TO-INDEX-ROUTING.md](./CLOUDWATCH-TO-INDEX-ROUTING.md)                         | Routing CloudWatch-style logs to the correct data streams/indices      |
| [GUIDE-CLOUDWATCH-GLUE-SAGEMAKER-ELASTIC.md](./GUIDE-CLOUDWATCH-GLUE-SAGEMAKER-ELASTIC.md) | Step-by-step AWS + Elastic setup for Glue and SageMaker via CloudWatch |

---

## Coverage and internal reference

| Document                                                                       | Description                     |
| ------------------------------------------------------------------------------ | ------------------------------- |
| [AWS-SERVICES-DOCUMENTATION-REVIEW.md](./AWS-SERVICES-DOCUMENTATION-REVIEW.md) | AWS service docs cross-check    |
| [GAP-ANALYSIS-LOGS-AND-METRICS.md](./GAP-ANALYSIS-LOGS-AND-METRICS.md)         | Logs/metrics coverage notes     |
| [GLUE-METRICS-COVERAGE.md](./GLUE-METRICS-COVERAGE.md)                         | Glue metrics detail             |
| [diagrams.md](./diagrams.md)                                                   | Diagrams and architecture notes |

---

## ServiceNow CMDB & Enrichment

The app includes a **ServiceNow CMDB log generator** that produces realistic records across 9 CMDB/ITSM tables (`cmdb_ci`, `incident`, `change_request`, `sys_user`, etc.) with CIs correlated to cloud infrastructure and users aligned with the data pipeline operators. Data ships to `logs-servicenow.event-*`. See the [project README](../README.md#servicenow-cmdb-integration) for table details.

A sample **Elastic Workflow** for automated alert enrichment is in [`workflows/data-pipeline-alert-enrichment.yaml`](../workflows/data-pipeline-alert-enrichment.yaml).

---

## ML Training Mode

The **Ship** page includes an **ML Training Mode** that automates the full anomaly detection workflow: **reset → baseline → ML learning wait → anomaly injection → stabilise & freeze**. The reset phase clears stale model state from previous runs to prevent score renormalization. Anomaly injection uses 100% error rate, 15x duration scaling (logs and traces), and 20x metric scaling in a 5-minute window. An optional "Stop datafeeds after training" toggle freezes anomaly scores by stopping datafeeds after injection. See the [project README](../README.md#ml-training-mode) for configuration details.

---

## Installers

Idempotent onboarding CLIs (AWS, GCP, Azure): **[installer/README.md](../installer/README.md)**.

**Cloud Loadgen Integrations** can be installed from the **Setup** page in the web UI or from the CLI. **AWS** is the only cloud with a single-command per-service bundle: `npm run setup:aws-loadgen-packs` installs pipeline + dashboard + ML jobs + alerting rules together for chosen services. **GCP and Azure** do not have that combined CLI — use the **individual asset installers** (see [installer/README.md](../installer/README.md)) or the web UI **Setup** step. You can install alerting rules across clouds with `npm run setup:alert-rules`. All installed assets carry the **`cloudloadgen`** tag for easy management in Kibana.
