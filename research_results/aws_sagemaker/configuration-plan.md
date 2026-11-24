# Configuration plan: `aws_sagemaker`

> **Generated:** 2026-11-24
> **Inputs:** `aws-cloudwatch` for logs, `aws/metrics` (`GetMetricData`) for metrics. Optional later inputs: `aws-s3` and a second `aws-cloudwatch` stream for EventBridge JSON that the customer forwards.

Authentication variables match the AWS integration Setup Access selector so an operator who already runs `aws` can reuse the same role. Do not add a SageMaker API key. SageMaker has no product-specific token.

Region is required. Log groups and metrics do not replicate across Regions.

## Required variables (logs stream)

| Variable                                      | Type     | Title             | Description                                                                 | Default   | Show user |
| --------------------------------------------- | -------- | ----------------- | --------------------------------------------------------------------------- | --------- | --------- |
| `region`                                      | text     | AWS Region        | Region where the SageMaker workloads run. One policy instance per Region.   | none      | yes       |
| `access_key_id`                               | password | Access Key ID     | Shown only for the Direct Access Keys and Temporary Access Keys methods.    | none      | yes       |
| `secret_access_key`                           | password | Secret Access Key | Paired with the access key.                                                 | none      | yes       |
| `log_group_arn_prefix` or explicit group list | text     | Log groups        | Defaults cover the four groups that exist without extra SageMaker features. | see below | yes       |

Default log groups for the first policy template:

- `/aws/sagemaker/TrainingJobs`
- `/aws/sagemaker/ProcessingJobs`
- `/aws/sagemaker/TransformJobs`
- prefix `/aws/sagemaker/Endpoints`

`start_position` default is `end`. `beginning` will replay indefinite retention on long-lived endpoint groups.

## Required variables (metrics stream)

| Variable     | Type      | Title             | Description                                                | Default         | Show user |
| ------------ | --------- | ----------------- | ---------------------------------------------------------- | --------------- | --------- |
| `region`     | text      | AWS Region        | Same Region as the workloads.                              | none            | yes       |
| `namespaces` | text list | Metric namespaces | Exact strings, case-sensitive.                             | the seven below | yes       |
| `period`     | text      | Period            | CloudWatch period. Classic SageMaker metrics are 1 minute. | `1m`            | yes       |

Default namespaces:

- `AWS/SageMaker`
- `/aws/sagemaker/Endpoints`
- `/aws/sagemaker/TrainingJobs`
- `/aws/sagemaker/ProcessingJobs`
- `/aws/sagemaker/TransformJobs`
- `/aws/sagemaker/InferenceComponents`
- `AWS/Sagemaker/ModelBuildingPipeline`

The last namespace is spelled `Sagemaker`, not `SageMaker`. Do not lowercase `Endpoints`.

## Optional variables

| Variable                        | Type     | Title                         | Description                                                                                                                                                                     | Default | Show user |
| ------------------------------- | -------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------- |
| `session_token`                 | password | Session Token                 | Temporary credentials only.                                                                                                                                                     | empty   | yes       |
| `role_arn`                      | text     | Role ARN                      | Cross-account AssumeRole.                                                                                                                                                       | empty   | yes       |
| `external_id`                   | password | External ID                   | Required with `role_arn` when the trust policy checks it. Store as a secret.                                                                                                    | empty   | yes       |
| `shared_credential_file`        | text     | Shared credentials file       | Path on the agent host.                                                                                                                                                         | empty   | no        |
| `credential_profile_name`       | text     | Credential profile            | Profile name in that file.                                                                                                                                                      | empty   | yes       |
| `scan_frequency`                | text     | Scan frequency                | How often to poll CloudWatch Logs. Elastic's shared-quota guidance is 5 minutes or slower when other CloudWatch inputs share the account.                                       | `5m`    | yes       |
| `number_of_workers`             | integer  | Workers                       | `1` for a single log group. At most `5` for the Endpoints prefix, and only when this account is not already using the quota.                                                    | `1`     | no        |
| `start_position`                | text     | Start position                | `beginning` or `end`.                                                                                                                                                           | `end`   | yes       |
| `include_notebooks`             | bool     | Notebook and Studio logs      | Adds `/aws/sagemaker/NotebookInstances` and `/aws/sagemaker/studio`.                                                                                                            | false   | yes       |
| `include_labeling`              | bool     | Ground Truth logs             | Adds labeling and worker-activity groups. Ground Truth is closed to new customers.                                                                                              | false   | yes       |
| `include_compilation`           | bool     | Neo compilation logs          | Adds `/aws/sagemaker/CompilationJobs`.                                                                                                                                          | false   | yes       |
| `include_inference_recommender` | bool     | Inference Recommender         | Adds that log group and `/aws/sagemaker/InferenceRecommendationsJobs` metrics.                                                                                                  | false   | yes       |
| `include_model_monitor_metrics` | bool     | Model Monitor feature metrics | Adds `/aws/sagemaker/Endpoints/data-metric` and `/aws/sagemaker/ModelMonitoring/data-metric`. Empty unless `emit_metrics` is enabled. Model Monitor is closed to new customers. | false   | yes       |
| `tags`                          | text     | Tags                          | User tags.                                                                                                                                                                      | empty   | yes       |
| `processors`                    | yaml     | Processors                    | Agent processors.                                                                                                                                                               | empty   | no        |
| `preserve_original_event`       | bool     | Preserve original event       | Keep `event.original`.                                                                                                                                                          | false   | yes       |
| `proxy_url`                     | url      | Proxy URL                     | HTTP proxy for AWS APIs.                                                                                                                                                        | empty   | no        |
| `latency`                       | text     | Metrics latency               | CloudWatch metric delay. Match the AWS package default.                                                                                                                         | `15m`   | yes       |

### Optional S3 stream (not in v1)

| Variable             | Type | Title         | Description                                                                                      | Default | Show user |
| -------------------- | ---- | ------------- | ------------------------------------------------------------------------------------------------ | ------- | --------- |
| `queue_url`          | url  | SQS queue URL | S3 event notifications for violation reports. Preferred over bucket listing.                     | empty   | yes       |
| `bucket_arn`         | text | Bucket ARN    | Polling mode only.                                                                               | empty   | yes       |
| `bucket_list_prefix` | text | Prefix        | Limit to the monitoring-report prefix. Do not point this at training datasets or `model.tar.gz`. | empty   | yes       |

### Optional state stream (not in v1)

The customer creates an EventBridge rule with `source` = `aws.sagemaker`, excludes `detail-type` `AWS API Call via CloudTrail`, and writes the events to one CloudWatch log group they name. The package then tails that group.

| Variable          | Type | Title           | Description                                                        | Default | Show user |
| ----------------- | ---- | --------------- | ------------------------------------------------------------------ | ------- | --------- |
| `state_log_group` | text | State log group | Customer-created group that receives SageMaker EventBridge events. | empty   | yes       |

## Deployment notes

- Run the agent in the SageMaker account, or AssumeRole into it. Quotas and `GetMetricData` charges apply in the SageMaker account.
- IAM for the collector: `logs:DescribeLogGroups`, `logs:FilterLogEvents`, `logs:DescribeLogStreams` when a stream prefix is set, `cloudwatch:ListMetrics`, `cloudwatch:GetMetricData`. S3 and SQS actions only if that stream is enabled. `sts:AssumeRole` only for cross-account.
- Do not grant `sagemaker:InvokeEndpoint` or read access to the training-data bucket.
- `FilterLogEvents` is 25 TPS in `us-east-1`, 10 TPS in most Regions, and 5 TPS in a short list of Regions, per account per Region, not adjustable. Elastic documents a shared budget of about 5 TPS across every CloudWatch log input in that account. `number_of_workers` must respect that shared budget, because the `aws` package may already be polling other groups.
- Agentless (Elastic Managed) collection is a poor fit for container stdout. It is more plausible for a metrics-only policy on a few long-lived endpoints. Do not make agentless the default deployment mode for the logs stream.
- `GetMetricData` does not read SageMaker AI Insights OTel metrics. Do not add a PromQL variable in v1.
- Feature Store offline tables are Glue tables queried with Athena. Those logs belong in the future `aws_glue` and `aws_athena` packages. This package does not grow variables for them.
