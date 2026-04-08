# Documentation

Reference material for **Cloud to Elastic Load Generator**. All Markdown guides live under this folder; the [project README](../README.md) covers quick start, Docker, and CI.

---

## Essentials

| Document                                                       | Description                                                            |
| -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [development.md](./development.md)                             | Local dev, Docker, npm scripts, samples, icons, format/lint/typecheck  |
| [otel-traces-setup.md](./otel-traces-setup.md)                 | OpenTelemetry-style traces and related setup notes                     |
| [INGEST-PIPELINE-REFERENCE.md](./INGEST-PIPELINE-REFERENCE.md) | Ingest pipeline conventions and field reference (AWS custom pipelines) |

---

## AWS: CloudWatch → Elastic

| Document                                                                                   | Description                                                            |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| [CLOUDWATCH-TO-INDEX-ROUTING.md](./CLOUDWATCH-TO-INDEX-ROUTING.md)                         | Routing CloudWatch-style logs to the correct data streams/indices      |
| [GUIDE-CLOUDWATCH-GLUE-SAGEMAKER-ELASTIC.md](./GUIDE-CLOUDWATCH-GLUE-SAGEMAKER-ELASTIC.md) | Step-by-step AWS + Elastic setup for Glue and SageMaker via CloudWatch |

---

## Coverage and internal reference (AWS-focused)

| Document                                                                       | Description                     |
| ------------------------------------------------------------------------------ | ------------------------------- |
| [AWS-SERVICES-DOCUMENTATION-REVIEW.md](./AWS-SERVICES-DOCUMENTATION-REVIEW.md) | AWS service docs cross-check    |
| [GAP-ANALYSIS-LOGS-AND-METRICS.md](./GAP-ANALYSIS-LOGS-AND-METRICS.md)         | Logs/metrics coverage notes     |
| [GLUE-METRICS-COVERAGE.md](./GLUE-METRICS-COVERAGE.md)                         | Glue metrics detail             |
| [diagrams.md](./diagrams.md)                                                   | Diagrams and architecture notes |

---

## Installers

Idempotent onboarding CLIs (AWS, GCP, Azure): **[installer/README.md](../installer/README.md)**.

**npm script names:** AWS installers use the `setup:aws-*` prefix (for example `npm run setup:aws-integration`, `npm run setup:aws-pipelines`). GCP and Azure use `setup:gcp-*` and `setup:azure-*` respectively.
