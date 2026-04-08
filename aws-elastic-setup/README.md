# AWS → Elastic setup guides (convenience copies)

These AWS-focused guides complement the multi-cloud **Cloud Load Generator**. Canonical copies live under [`docs/`](../docs/).

> **Canonical copies** of these guides also live under [`docs/`](../docs/) (see [`docs/README.md`](../docs/README.md)). Edit the `docs/` versions first, then keep the matching files here in sync when content changes.

How-to guides for ingesting real AWS service logs from **CloudWatch** into **Elastic** and routing them to the correct indices. Covers configuration on the AWS side (logging, IAM), Elastic side (Fleet integration or Custom Logs, ingest pipelines), and troubleshooting index routing.

> **For automated setup** (installing the Elastic AWS integration and custom ingest pipelines), use the onboarding installers in [`installer/`](../installer/README.md):
>
> ```bash
> npm run setup:integration   # install official Elastic AWS integration
> npm run setup:pipelines     # install 106 custom ingest pipelines
> ```
>
> The guides below cover the manual, step-by-step path for specific services — useful when you need to understand exactly what's happening or troubleshoot routing.

---

## Contents

| Document                                                                                     | What it covers                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [**guide-cloudwatch-glue-sagemaker-elastic.md**](guide-cloudwatch-glue-sagemaker-elastic.md) | **Start here for real CloudWatch ingestion.** Step-by-step AWS + Elastic setup so Glue and SageMaker logs from CloudWatch land in `logs-aws.glue` and `logs-aws.sagemaker` with JSON parsing. Covers IAM, Fleet integration vs Custom Logs, dataset routing, index templates, and ingest pipeline attachment. |
| [**cloudwatch-to-index-routing.md**](cloudwatch-to-index-routing.md)                         | Why CloudWatch doesn't provide an index name and how to route logs by log group to the correct data stream. Three options: Fleet multi-input, ingest pipeline reroute, and custom Lambda/Firehose sender.                                                                                                     |

---

## Related

- **Onboarding installers** — [`installer/README.md`](../installer/README.md) — automated setup for all 135 services
- **Ingest pipeline reference** — [`docs/INGEST-PIPELINE-REFERENCE.md`](../docs/INGEST-PIPELINE-REFERENCE.md) — pipeline IDs, target fields, and example parsed keys for all 106 services
- **Reference docs** — [`docs/`](../docs/) — gap analysis, service coverage, CloudWatch metric alignment, and version history
