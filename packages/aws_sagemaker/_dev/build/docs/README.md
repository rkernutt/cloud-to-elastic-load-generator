{{- generatedHeader }}
{{/\*
This template can be used as a starting point for writing documentation for your new integration. For each section, fill in the details
described in the comments.

Find more detailed documentation guidelines in https://www.elastic.co/docs/extend/integrations/documentation-guidelines
\*/}}

# aws_sagemaker Integration for Elastic

## Overview

{{/* Complete this section with a short summary of what data this integration collects and the service it integrates with. */}}
The aws_sagemaker integration collects Amazon SageMaker container logs and CloudWatch metrics. Logs come from the `/aws/sagemaker/` log groups. Metrics come from the SageMaker, endpoint, training, processing, transform, inference component, and model building pipeline namespaces.

### Compatibility

{{/* Complete this section with information on what 3rd party software or hardware versions this integration is compatible with */}}
This integration is compatible with Amazon SageMaker CloudWatch logs and the classic CloudWatch metrics API. It does not read SageMaker AI Insights OpenTelemetry metrics.

### How it works

Elastic Agent calls CloudWatch Logs `FilterLogEvents` for groups under `/aws/sagemaker/` and CloudWatch `GetMetricData` for the SageMaker metric namespaces. Ingest pipelines route each log to a workload and copy metric statistics into `aws_sagemaker.metrics.*`.

## What data does this integration collect?

{{/* Complete this section with information on what types of data the integration collects, and link to reference documentation if available
*/}}
The aws_sagemaker integration collects:

- Container stdout and stderr from SageMaker training, processing, transform, and endpoint log groups.
- Invocation, latency, utilization, and model building pipeline metrics.

### Supported use cases

{{/* Add details on the use cases that can be enabled by using this integration. Explain why a user would want to install and use this integration. */}}

- Find training and processing failures in container logs.
- Track endpoint invocations, 4xx and 5xx errors, and model latency.
- Compare CPU and GPU utilization for endpoints and training jobs.

## What do I need to use this integration?

{{/* List any Elastic or vendor-specific prerequisites needed before starting to install the integration. For example, Elastic self-managed or cloud deployment, or a vendor-specific credentials or accounts */}}

- An Elastic deployment and an Elastic Agent that can reach the AWS APIs.
- An IAM principal with `logs:DescribeLogGroups`, `logs:DescribeLogStreams`, `logs:FilterLogEvents`, `cloudwatch:ListMetrics`, and `cloudwatch:GetMetricData`.
- The AWS region where the SageMaker workloads run.

## How do I deploy this integration?

### Agent-based deployment

Elastic Agent must be installed. For more details, check the Elastic Agent [installation instructions](https://www.elastic.co/guide/en/fleet/current/elastic-agent-installation.html). You can install only one Elastic Agent per host.

Elastic Agent is required to stream data from the syslog or log file receiver and ship the data to Elastic, where the events will then be processed via the integration's ingest pipelines.

{{/\* If Elastic Managed integration is available for this integration, include the following section. You can determine if it is available by checking the `manifest.yml` file, and looking for the existence of `policy_templates.deployment_modes.agentless.enabled: "true"`.

### Elastic Managed enabled integration

Elastic Managed integrations are only supported on Elastic Cloud Serverless and Elastic Cloud Hosted deployments. An Elastic Managed integration lets you ingest data from a cloud source while avoiding the orchestration, management, and maintenance associated with standard ingest infrastructure. Elastic runs the collector for you, so you can focus on your data instead of the infrastructure that collects it.

For more information, refer to [Elastic Managed integrations](https://www.elastic.co/docs/manage-data/ingest/managed-integrations/managed-integrations) and the [Elastic Managed integrations FAQ](https://www.elastic.co/docs/manage-data/ingest/managed-integrations/managed-integrations-faq).
\*/}}

### Set up steps in aws_sagemaker

{{/* List the steps that are required to set up the 3rd party system to send data to Elastic.
This should be specific to the steps needed to set up the 3rd party system to send data to Elastic. It should not include generic information about how to install or set up the 3rd party system itself.
*/}}

Create an IAM user or role for the agent. Grant the log and metric read actions above. Do not grant `sagemaker:InvokeEndpoint` or training-bucket read access. SageMaker writes the container logs to CloudWatch; no extra SageMaker logging destination is required.

#### Vendor resources

{{/* Add vendor documentation links that are specific to the steps needed to set up the vendor system to send data to Elastic. Exclude this section if no vendor setup links are available. */}}

- [Log Amazon SageMaker events with CloudWatch](https://docs.aws.amazon.com/sagemaker/latest/dg/logging-cloudwatch.html)
- [SageMaker metrics in CloudWatch](https://docs.aws.amazon.com/sagemaker/latest/dg/monitoring-cloudwatch.html)

### Set up steps in Kibana

{{/\* List the steps that are required to set up the integration in Kibana.
This includes how to add the integration, and how to configure the integration, with descriptions of each available configuration option.

If multiple input types are supported, add instructions for each in a subsection.
\*/}}

The same package installs on Elastic Cloud Hosted, a self-managed stack, and Elastic Cloud Serverless.

1. Add the Amazon SageMaker integration.
2. On Serverless, choose the agentless deployment. Elastic runs the collector. Choose Identity Federation and deploy the CloudFormation stack so Elastic can assume the AWS role. Direct access keys also work.
3. On a stack where you run Elastic Agent, keep the default deployment. Use access keys, a shared credentials file, an instance role, or a role ARN.
4. For logs, set the region and leave the log group prefix at `/aws/sagemaker/`. The default start position is `end` and the scan frequency is `5m`.
5. For metrics, set the same region. The default period is `5m`.

### Validation

{{/* In this section, describe the actions required to validate that the integration is working properly, and data is flowing into Elasticsearch.
If required, list the steps needed in the vendor product to start sending events or trigger alerts.
Then list how to validate that the data is in Elasticsearch, using Kibana. This could be which indices to check in the Discover table, or which built in dashboards to look at to see the data.
*/}}

In Discover, open `logs-aws_sagemaker.logs-*` and `metrics-aws_sagemaker.metrics-*`. A training job or endpoint invocation should produce documents within one scan period.

## Troubleshooting

{{/\* The troubleshooting section should contain troubleshooting for common issues specific to this integration. Do not include generic troubleshooting information. Where appropriate, include details specific to each input type.
Whenever possible, link to the troubleshooting documentation provided by the third-party software.

IMPORTANT: Use plain text for issue descriptions, NOT bold. Example:

- No data is being collected: Verify network connectivity and credentials
- TCP framing issues: Check that both sides use the same framing method
  Do NOT use **bold** for issue names like "**No data is being collected**:".
  \*/}}

- No log events: Confirm the region and that log groups exist under `/aws/sagemaker/`. Endpoint logs use one group per endpoint, `/aws/sagemaker/Endpoints/{EndpointName}`.
- Throttling on FilterLogEvents: Keep `number_of_workers` at 1. The quota is shared by every collector in the account and Region.
- Model latency looks too large for milliseconds: `ModelLatency` and `OverheadLatency` are microseconds.

## Performance and scaling

{{/* Add any vendor specific performance and scaling information to this section.
Performance and scaling information should be specific to sending data to Elasticsearch. It should not include information about the vendor product itself or generic information about performance and scaling.
*/}}
For more information on architectures that can be used for scaling this integration, check the [Ingest Architectures](https://www.elastic.co/docs/manage-data/ingest/ingest-reference-architectures) documentation.

## Reference

### Inputs used

{{/* All inputs used by this package will be automatically listed here. Do not modify this section. */}}
{{ inputDocs }}

### API usage

{{/* For integrations that use APIs to collect data, document all the APIs that are used, and link to relevent information. For integrations that do not use APIs, do not include this section. */}}
These APIs are used with this integration:

- `logs:FilterLogEvents`
- `logs:DescribeLogGroups`
- `cloudwatch:ListMetrics`
- `cloudwatch:GetMetricData`

### Vendor documentation links

{{/* Add vendor documentation links which provide useful general information about the integration.*/}}

- [Log Amazon SageMaker events with CloudWatch](https://docs.aws.amazon.com/sagemaker/latest/dg/logging-cloudwatch.html)
- [SageMaker metrics in CloudWatch](https://docs.aws.amazon.com/sagemaker/latest/dg/monitoring-cloudwatch.html)

### Data streams

{{/* Repeat all information in this section for each data stream the package collects.*/}}

#### {Data stream name}

The `{data stream name}` data stream provides events from {source} of the following types: {list types}.

For each data_stream_name, include an optional summary of the datastream, the exported fields reference table and the sample event.

The fields template function will be replaced by a generated list of all fields from the `fields/` directory of the data stream when building the integration.

##### {data stream name} fields

To include a generated list of fields from the `fields/` directory, uncomment and use:
{{/* {{ fields "data_stream_name" }} \*/}}

##### {data stream name} sample event

The event template function will be replace by a sample event, taken from `sample_event.json`, when building this integration.

To include a sample event from `sample_event.json`, uncomment and use:
{{/* {{ event "data_stream_name" }} \*/}}

{{/\* Export ILM Policies
This accepts a list of data stream names as arguments and documents one policy
per data stream. If no arguments are provided, data streams are auto-discovered by
scanning for data_stream/<name>/elasticsearch/ilm/ directories and
data_stream/<name>/lifecycle.yml files (lifecycle.yml takes precedence when both exist).

     If there are no policies defined, this renders as an empty string (no heading).

\*/}}
{{ ilm }}

{{/* Export Transforms
     This will export the transforms used by this integration.
     If there are no transforms defined, this renders as an empty string (no heading).
*/}}
{{ transform }}
