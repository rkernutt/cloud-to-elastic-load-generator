# Documentation index

Reference material for **Cloud Loadgen for Elastic**. Quick start, Docker, and architecture live in the [project README](../README.md). Everything below is the deeper detail.

## What you're probably looking for

| If you want to…                                                                | Read this                                                          |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Run the app locally, understand the proxy, or contribute generators            | [development.md](./development.md)                                 |
| Understand the **Setup wizard**, the `cloudloadgen` tag, and Serverless limits | [SETUP-WIZARD-AND-UNINSTALL.md](./SETUP-WIZARD-AND-UNINSTALL.md)   |
| Use chained events, CSPM/KSPM, ServiceNow, and the alert-enrichment workflow   | [advanced-data-types.md](./advanced-data-types.md)                 |
| Drive ML jobs through reset → baseline → inject → freeze                       | [ml-training-mode.md](./ml-training-mode.md)                       |
| Create least-privilege Elasticsearch API keys                                  | [api-key-permissions.md](./api-key-permissions.md)                 |
| Install Elastic assets from the CLI                                            | [../installer/README.md](../installer/README.md)                   |
| Deploy a single pipeline / dashboard / ML job / rule by hand                   | [../assets/README.md](../assets/README.md)                         |
| Per-scenario timing, correlation, and failure modes                            | [chained-events/](./chained-events/)                               |
| Route AWS CloudWatch logs into Elastic                                         | [CLOUDWATCH-TO-INDEX-ROUTING.md](./CLOUDWATCH-TO-INDEX-ROUTING.md) |
| Set up OpenTelemetry traces                                                    | [otel-traces-setup.md](./otel-traces-setup.md)                     |
| Customise an AWS ingest pipeline                                               | [INGEST-PIPELINE-REFERENCE.md](./INGEST-PIPELINE-REFERENCE.md)     |

## Cloud Loadgen Integrations (TL;DR)

Every Elastic asset the app installs — ingest pipelines, data stream templates, Kibana dashboards, ML anomaly detection jobs, and alerting rules — is bundled **per service** as a Cloud Loadgen Integration and tagged **`cloudloadgen`**. That tag makes it easy to view, bulk-edit, or bulk-delete load-generator assets in Kibana without touching production objects. The full behaviour (categories, post-install options, Serverless limits, dashboard fallback, alerting rule compatibility) is in [SETUP-WIZARD-AND-UNINSTALL.md](./SETUP-WIZARD-AND-UNINSTALL.md).

## Chained event scenarios

Multi-service correlated scenarios that emit logs, metrics, APM traces (for the Elastic Service Map), companion cloud audit events, and ECS user identity fields. They share `labels.*_chain_id` IDs so the events can be correlated end-to-end.

| Scenario                                                                               | Doc                                                                                                    |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Security Finding Chain (detect → aggregate → triage)                                   | [chained-events/security-finding-chain.md](./chained-events/security-finding-chain.md)                 |
| IAM Privilege Escalation Chain                                                         | [chained-events/iam-privilege-escalation-chain.md](./chained-events/iam-privilege-escalation-chain.md) |
| Data Exfiltration Chain                                                                | [chained-events/data-exfiltration-chain.md](./chained-events/data-exfiltration-chain.md)               |
| AWS Data & Analytics Pipeline (S3 → EMR → Glue → Athena → MWAA)                        | [chained-events/data-analytics-pipeline.md](./chained-events/data-analytics-pipeline.md)               |
| GCP Data & Analytics Pipeline (GCS → Dataproc → Data Catalog → BigQuery → Composer)    | [chained-events/gcp-data-analytics-pipeline.md](./chained-events/gcp-data-analytics-pipeline.md)       |
| Azure Data & Analytics Pipeline (Blob → Databricks → Purview → Synapse → Data Factory) | [chained-events/azure-data-analytics-pipeline.md](./chained-events/azure-data-analytics-pipeline.md)   |

## AWS deep-dive

| Document                                                                                   | Description                                                            |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| [CLOUDWATCH-TO-INDEX-ROUTING.md](./CLOUDWATCH-TO-INDEX-ROUTING.md)                         | Routing CloudWatch-style logs to the correct data streams/indices      |
| [GUIDE-CLOUDWATCH-GLUE-SAGEMAKER-ELASTIC.md](./GUIDE-CLOUDWATCH-GLUE-SAGEMAKER-ELASTIC.md) | Step-by-step AWS + Elastic setup for Glue and SageMaker via CloudWatch |
| [INGEST-PIPELINE-REFERENCE.md](./INGEST-PIPELINE-REFERENCE.md)                             | Custom AWS ingest pipeline conventions and field reference             |

## Coverage notes (internal reference)

| Document                                                                       | Description                     |
| ------------------------------------------------------------------------------ | ------------------------------- |
| [AWS-SERVICES-DOCUMENTATION-REVIEW.md](./AWS-SERVICES-DOCUMENTATION-REVIEW.md) | AWS service docs cross-check    |
| [GAP-ANALYSIS-LOGS-AND-METRICS.md](./GAP-ANALYSIS-LOGS-AND-METRICS.md)         | Logs/metrics coverage notes     |
| [GLUE-METRICS-COVERAGE.md](./GLUE-METRICS-COVERAGE.md)                         | Glue metrics detail             |
| [diagrams.md](./diagrams.md)                                                   | Diagrams and architecture notes |
