# Documentation

Reference material for **Cloud to Elastic Load Generator** lives here. This is a fresh **1.x** documentation set; there is no bundled legacy version history.

## Start here

| Document                                                       | Description                                        |
| -------------------------------------------------------------- | -------------------------------------------------- |
| [development.md](./development.md)                             | Local dev, Docker, npm scripts, samples workflow   |
| [otel-traces-setup.md](./otel-traces-setup.md)                 | OpenTelemetry-style traces and related setup notes |
| [INGEST-PIPELINE-REFERENCE.md](./INGEST-PIPELINE-REFERENCE.md) | Ingest pipeline conventions and reference          |

## Elastic ↔ cloud routing and guides

| Document                                                                                   | Description                             |
| ------------------------------------------------------------------------------------------ | --------------------------------------- |
| [CLOUDWATCH-TO-INDEX-ROUTING.md](./CLOUDWATCH-TO-INDEX-ROUTING.md)                         | AWS CloudWatch-style routing to indices |
| [GUIDE-CLOUDWATCH-GLUE-SAGEMAKER-ELASTIC.md](./GUIDE-CLOUDWATCH-GLUE-SAGEMAKER-ELASTIC.md) | Longer AWS analytics path guide         |

Shorter-path copies of some AWS guides also live under **[`aws-elastic-setup/`](../aws-elastic-setup/)** at the repo root.

## Coverage and deep dives (AWS-focused)

| Document                                                                       | Description                  |
| ------------------------------------------------------------------------------ | ---------------------------- |
| [AWS-SERVICES-DOCUMENTATION-REVIEW.md](./AWS-SERVICES-DOCUMENTATION-REVIEW.md) | AWS service docs cross-check |
| [GAP-ANALYSIS-LOGS-AND-METRICS.md](./GAP-ANALYSIS-LOGS-AND-METRICS.md)         | Logs/metrics coverage notes  |
| [GLUE-METRICS-COVERAGE.md](./GLUE-METRICS-COVERAGE.md)                         | Glue metrics detail          |
| [diagrams.md](./diagrams.md)                                                   | Diagrams and structure notes |

## Installers

Automated onboarding: **[`installer/README.md`](../installer/README.md)**.
