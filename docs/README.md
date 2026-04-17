# Documentation

Reference material for **Cloud to Elastic Load Generator**. All Markdown guides live under this folder; the [project README](../README.md) covers quick start, Docker, and CI.

---

## Essentials

| Document                                                         | Description                                                                                                      |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [development.md](./development.md)                               | Local dev, Docker, npm scripts, samples, icons, format/lint/typecheck                                            |
| [SETUP-WIZARD-AND-UNINSTALL.md](./SETUP-WIZARD-AND-UNINSTALL.md) | Setup wizard: Cloud Loadgen Integrations, per-service install, **`cloudloadgen`** tag, Serverless limits         |
| [otel-traces-setup.md](./otel-traces-setup.md)                   | OpenTelemetry-style traces and related setup notes                                                               |
| [INGEST-PIPELINE-REFERENCE.md](./INGEST-PIPELINE-REFERENCE.md)   | Ingest pipeline conventions and field reference (AWS custom pipelines)                                           |

---

## Cloud Loadgen Integrations

All Elastic assets — **ingest pipelines**, **data stream templates**, **Kibana dashboards**, **ML anomaly detection jobs**, and **alerting rules** — are installed together **per service** as **Cloud Loadgen Integrations**. Every asset is tagged or labelled **`cloudloadgen`** so you can filter, view, or bulk-edit them in Kibana without affecting production objects. The Setup page groups integrations by service category (Compute, Networking, Databases, etc.) across all three clouds.

See [SETUP-WIZARD-AND-UNINSTALL.md](./SETUP-WIZARD-AND-UNINSTALL.md) for details on installing, filtering, and removing integrations.

---

## Chained Events

Multi-service correlated scenarios that generate logs, metrics, APM traces (for the Elastic Service Map), dashboards, ML jobs, and alerting rules:

| Scenario | Document |
| --- | --- |
| AWS Data & Analytics Pipeline (S3 → EMR → Glue → Athena → MWAA) | [chained-events/data-analytics-pipeline.md](./chained-events/data-analytics-pipeline.md) |
| GCP Data & Analytics Pipeline (GCS → Dataproc → Data Catalog → BigQuery → Composer) | [chained-events/gcp-data-analytics-pipeline.md](./chained-events/gcp-data-analytics-pipeline.md) |
| Azure Data & Analytics Pipeline (Blob → Databricks → Purview → Synapse → Data Factory) | [chained-events/azure-data-analytics-pipeline.md](./chained-events/azure-data-analytics-pipeline.md) |

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

## Installers

Idempotent onboarding CLIs (AWS, GCP, Azure): **[installer/README.md](../installer/README.md)**.

**Cloud Loadgen Integrations** can be installed from the **Setup** page in the web UI or from the CLI. The CLI provides the same per-service bundle approach: `npm run setup:aws-loadgen-packs` installs pipeline + dashboard + ML jobs + alerting rules together for chosen services. GCP and Azure have equivalent commands. All installed assets carry the **`cloudloadgen`** tag for easy management in Kibana.
