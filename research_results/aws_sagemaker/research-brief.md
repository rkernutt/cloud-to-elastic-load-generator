# Research Brief: Amazon SageMaker

> **Generated:** 2026-11-24
> **Researcher:** AI-assisted research via /research-integration skill
> **Status:** READY FOR REVIEW
> **Confidence:** HIGH for CloudWatch log groups, classic metric namespaces, and the EventBridge events that have a published body. MEDIUM overall, because container stdout has no schema, 41 EventBridge detail-types have no published `detail`, and the Feature Store and Ground Truth metric namespaces are not named on the AWS metrics page.

## 1. Product Overview

### 1.1 What is it?

Amazon SageMaker AI is AWS's managed machine-learning platform. Customers use it to train models, run processing and batch-transform jobs, host real-time and asynchronous inference endpoints, and orchestrate those steps with SageMaker Pipelines. The data an integration can collect is container stdout and stderr, CloudWatch metrics, optional S3 reports, and EventBridge state-change events. It is not an audit product. Control-plane audit is CloudTrail, which the existing Elastic `aws` package already collects.

### 1.2 Vendor

- **Vendor name:** Amazon Web Services
- **Product name:** Amazon SageMaker (SageMaker AI)
- **Product category:** cloud machine-learning platform
- **Vendor documentation portal:** https://docs.aws.amazon.com/sagemaker/latest/dg/whatis.html

### 1.3 Data generated

- Container stdout and stderr for training, processing, transform, endpoints, notebooks, Studio, compilation, labeling, and Inference Recommender.
- Classic CloudWatch metrics: endpoint invocations and latency, host CPU/GPU/memory/disk, pipeline execution counts, Inference Recommender client latency.
- Opt-in S3 objects: endpoint data-capture JSONL (request and response bodies), Model Monitor `constraint_violations.json`, Clarify `analysis.json`.
- EventBridge events with `source` `aws.sagemaker` for job, endpoint, pipeline, and feature-group state, including `FailureReason` when a job fails.
- Control-plane API audit on CloudTrail (`sagemaker.amazonaws.com`). Out of scope for this package.
- SageMaker AI Insights OTel metrics in CloudWatch's OTel store. `GetMetricData` cannot read them. Out of scope for v1.

### 1.4 Existing Elastic coverage

No `aws_sagemaker` package is on the Elastic Package Registry for Kibana 9.4.0 (search returned an empty list on 2026-11-24).

The `aws` package 7.1.7 collects CloudTrail, CloudWatch logs as a generic input, and metrics for many other services. It has no SageMaker policy template, no SageMaker log group defaults, and no SageMaker metric namespace. CloudTrail events for `sagemaker.amazonaws.com` already land in `aws.cloudtrail` if the customer enabled CloudTrail. Do not collect them again.

`aws_bedrock` 1.7.0 is a separate package (invocation logs, runtime metrics, guardrail metrics). A SageMaker endpoint that calls Bedrock still produces Bedrock telemetry. That stays in `aws_bedrock`.

This repository's load generator already emits a synthetic `aws.sagemaker` dataset, plus dashboards for SageMaker, SageMaker Pipelines, Feature Store, and Model Monitor (`installer/aws-custom-dashboards/sagemaker*.json`, pipeline id `logs-aws.sagemaker-default`). Those documents are a demo shape. They are not the CloudWatch wire format. Use `references/sample-events/` as the schema source when building the package. The dashboards are useful later only as a picture of which questions operators ask.

### 1.5 Competitive SIEM coverage

Only Sumo Logic ships a named SageMaker app. QRadar and Splunk see SageMaker only when an operator points a generic CloudTrail or CloudWatch collector at it. Nobody parses training stdout as a schema, because AWS does not publish one. The shared collection method is CloudWatch APIs, S3, or Firehose. SageMaker has no syslog, CEF, or LEEF feed.

| Vendor     | Integration name                                                                                              | Supported data sources                                                                                                                                                          | Collection method                                                                                                                                        | Link                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| IBM QRadar | No SageMaker integration. Partial via Amazon AWS CloudTrail DSM and the generic Amazon Web Services protocol. | CloudTrail JSON if the trail includes `sagemaker.amazonaws.com`. CloudWatch Logs only if an operator creates one log source per log group. No metrics, no parser.               | S3 REST API for CloudTrail. CloudWatch Logs API pull.                                                                                                    | https://www.ibm.com/docs/en/dsm?topic=amazon-aws-cloudtrail                   |
| Splunk     | No SageMaker app. Partial via Splunk Add-on for Amazon Web Services (`Splunk_TA_aws` 8.3.1, 2026-10-21).      | Sourcetypes `aws:cloudtrail`, `aws:cloudwatch`, `aws:cloudwatchlogs` only. Operator must name the log groups and namespaces.                                                    | S3/SQS, CloudWatch `GetMetricData`, CloudWatch Logs API, or Firehose/EventBridge to HEC.                                                                 | https://splunkbase.splunk.com/app/1876                                        |
| Sumo Logic | Amazon SageMaker app (exact match, first published 2026-03-31).                                               | Ten dashboards: Overview, CloudTrail Audit, Models, Endpoints, Endpoint Invocations, Feature Store, Pipeline, Processing, Transform, Training. Seven CPU/GPU/pipeline monitors. | CloudTrail from S3. CloudWatch Logs and metrics via Kinesis Firehose (recommended) or a Lambda/metrics source. Log groups must match `/aws/sagemaker/*`. | https://www.sumologic.com/help/docs/integrations/amazon-aws/amazon-sagemaker/ |

See `references/competitive-siem-coverage.md` for full per-vendor analysis.

## 2. Data Collection Method

### 2.1 Recommended method

- **Input type:** `aws-cloudwatch` for logs, and `aws/metrics` (`cloudwatch:GetMetricData` plus `cloudwatch:ListMetrics`) for metrics.
- **Rationale:** Those are the streams SageMaker writes without extra configuration, and they are the same inputs the `aws` package uses for Lambda logs and the same pattern `aws_bedrock` uses for invocation logs plus runtime metrics. Container logs are on by default. Invocation and utilization metrics are structured and lower volume than stdout. A single package with these two streams can ship without asking the customer to create an EventBridge rule or an S3 bucket.

### 2.2 Alternative methods

| Method                                                                          | Input type                   | Pros                                                                                            | Cons                                                                                                                                                          |
| ------------------------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CloudWatch Logs                                                                 | `aws-cloudwatch`             | Default container output. One prefix covers every endpoint log group.                           | Unstructured text. `FilterLogEvents` is 5–25 TPS per account per Region and is shared with every other CloudWatch log input.                                  |
| CloudWatch metrics                                                              | `aws/metrics`                | Structured. 1-minute period. Matches the AWS package.                                           | `GetMetricData` is billed. Per-host training series are high cardinality and vanish when the job ends. Does not read OTel Insights metrics.                   |
| S3 data capture and monitor reports                                             | `aws-s3`                     | JSON envelopes with a real schema.                                                              | Off until the customer enables capture or a schedule. Capture files contain request and response bodies. Model Monitor is closed to new customers.            |
| EventBridge `aws.sagemaker`, forwarded by the customer to a log group or bucket | `aws-cloudwatch` or `aws-s3` | `FailureReason` and status transitions, including jobs that failed before a log stream existed. | No Elastic Agent EventBridge input. The customer must add a rule. Duplicate events are normal. CloudTrail-shaped events on the same bus must be filtered out. |
| `List*` / `Describe*` SageMaker APIs                                            | `cel`                        | `FailureReason` and `FinalMetricDataList` without a forwarder.                                  | Not log bodies. Polling duplicates EventBridge and spends API quota.                                                                                          |
| CloudTrail                                                                      | already `aws` / `cloudtrail` | Audit of `CreateTrainingJob`, `CreateEndpoint`, and similar.                                    | Already collected. `InvokeEndpoint` is not in CloudTrail.                                                                                                     |
| SageMaker AI Insights (OTel to CloudWatch, PromQL)                              | none in this package         | Richer GPU and framework metrics, on by default for new endpoints.                              | `GetMetricData` cannot query that store.                                                                                                                      |
| Subscription filter to Firehose                                                 | not an agent input           | Avoids the `FilterLogEvents` quota. Sumo uses this path.                                        | Customer-managed. The `aws` package dropped CloudWatch-via-S3 as a deprecated path.                                                                           |

### 2.3 Vendor-side setup required

Container logs and classic metrics need no SageMaker toggle. The customer still has to:

1. Pick the Region. Logs and metrics stay there.
2. Give the collector IAM permissions listed in section 3.1. The SageMaker execution role is not the collector role.
3. Optionally set a retention policy on `/aws/sagemaker/*` groups. The default is indefinite, so `start_position: beginning` can replay a large backlog.
4. For custom training metrics, add up to 40 `MetricDefinitions` (name plus regex) on the training job. Built-in algorithms already define theirs, and the container must print a matching line.
5. Data capture, Model Monitor, enhanced endpoint dimensions, Debugger hooks, and Clarify jobs are separate opt-ins. Do not require them for the default policy.
6. For cross-account collection, create an IAM role in the SageMaker account whose trust policy allows the monitoring principal and checks `sts:ExternalId`.

Full steps are in `references/collection-methods.md`.

## 3. Data Source Details

### 3.1 Connection and authentication

**For cloud ingest:**

- Service: Amazon CloudWatch Logs and Amazon CloudWatch metrics, in the workload Region.
- Authentication: the same methods as the `aws` package. Direct access keys, temporary credentials (access key, secret, session token), shared credentials file, AssumeRole, AssumeRole with external id, or the instance/pod IAM role. There is no SageMaker-specific API key.
- Required permissions on the collector identity:
  - `logs:DescribeLogGroups`
  - `logs:FilterLogEvents`
  - `logs:DescribeLogStreams` when a stream-prefix filter is used. [UNVERIFIED] whether every `aws-cloudwatch` code path calls it. Include it when `log_stream_prefix` is set.
  - `cloudwatch:ListMetrics`
  - `cloudwatch:GetMetricData`
  - `sts:AssumeRole` only for cross-account
- Do not grant `sagemaker:InvokeEndpoint`, and do not grant read on the training-data bucket.
- Documentation: https://www.elastic.co/docs/reference/integrations/aws and https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/permissions-reference-cwl.html

`FilterLogEvents` quota, per account per Region, not adjustable (https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/cloudwatch_limits_cwl.html):

| Region class                                                                    | TPS |
| ------------------------------------------------------------------------------- | --- |
| `us-east-1`                                                                     | 25  |
| `ap-northeast-3`, `ap-southeast-3`, `ca-west-1`, `eu-central-1`, `il-central-1` | 5   |
| Other supported Regions                                                         | 10  |

Elastic tells operators to treat the shared budget as about 5 TPS across every CloudWatch log integration in that account, with `number_of_workers` at most 5. Follow that when the `aws` package is already polling other groups. https://www.elastic.co/docs/reference/integrations/aws/cloudwatch

`GetMetricData` is 500 requests per second per Region (adjustable). It is billed at about $0.01 per 1,000 metrics requested and is excluded from the 1 million free CloudWatch API requests. https://aws.amazon.com/cloudwatch/pricing/

Agentless Elastic Managed collection is a poor fit for these logs. Training jobs print continuously, endpoint groups are tailed for the life of the endpoint, and the `FilterLogEvents` quota is shared and not adjustable. A metrics-only policy on a few long-lived endpoints is the only agentless shape that is plausible. That is an inference from the quotas, not a measured account.

### 3.2 Endpoints / data paths

Authoritative log-group page: https://docs.aws.amazon.com/sagemaker/latest/dg/logging-cloudwatch.html

| Endpoint / Path                                                      | Method          | Purpose                                                                                               | Event types                     |
| -------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------- |
| `/aws/sagemaker/TrainingJobs`                                        | CloudWatch Logs | Training container stdout/stderr. Stream `[job]/algo-[n]-[epoch]`.                                    | plaintext log lines             |
| `/aws/sagemaker/ProcessingJobs`                                      | CloudWatch Logs | Processing, Clarify, Model Monitor executions, Debugger rule jobs. Stream `[job]/[hostname]-[epoch]`. | plaintext log lines             |
| `/aws/sagemaker/TransformJobs`                                       | CloudWatch Logs | Batch transform stdout, plus `/data-log` and inference-pipeline container suffixes.                   | plaintext log lines             |
| `/aws/sagemaker/Endpoints/[EndpointName]`                            | CloudWatch Logs | One **group per endpoint**. Stream `[variant]/[instance-id]`. Async adds `/data-log`.                 | plaintext log lines             |
| `/aws/sagemaker/NotebookInstances`                                   | CloudWatch Logs | `jupyter.log`, plus a lifecycle stream only if a lifecycle config exists.                             | plaintext                       |
| `/aws/sagemaker/studio`                                              | CloudWatch Logs | Studio and Studio Classic app streams.                                                                | plaintext                       |
| `/aws/sagemaker/CompilationJobs`                                     | CloudWatch Logs | Neo compilation.                                                                                      | plaintext. No sample published. |
| `/aws/sagemaker/LabelingJobs`                                        | CloudWatch Logs | Ground Truth labeling job. Closed to new customers.                                                   | line format not published       |
| `/aws/sagemaker/groundtruth/WorkerActivity`                          | CloudWatch Logs | One JSON object per worker task.                                                                      | JSON                            |
| `/aws/sagemaker/InferenceRecommendationsJobs`                        | CloudWatch Logs | Three stream suffixes.                                                                                | no samples published            |
| `AWS/SageMaker`                                                      | GetMetricData   | Invocations, 4XX/5XX/model errors, latency in **microseconds**.                                       | metric datapoints               |
| `/aws/sagemaker/Endpoints`                                           | GetMetricData   | Instance CPU, memory, GPU, disk. CPU/GPU are summed across devices (4 CPUs can read 400%).            | metric datapoints               |
| `/aws/sagemaker/TrainingJobs`                                        | GetMetricData   | Host utilization on dimension `Host`, plus regex algorithm metrics on dimension `TrainingJobName`.    | metric datapoints               |
| `/aws/sagemaker/ProcessingJobs`                                      | GetMetricData   | Host utilization. `Host` uses `algo-[n]`, which does not match the log-stream hostname.               | metric datapoints               |
| `/aws/sagemaker/TransformJobs`                                       | GetMetricData   | Host utilization. No `DiskUtilization`.                                                               | metric datapoints               |
| `/aws/sagemaker/InferenceComponents`                                 | GetMetricData   | Per-copy normalized utilization.                                                                      | metric datapoints               |
| `AWS/Sagemaker/ModelBuildingPipeline`                                | GetMetricData   | Execution and step counts and durations in **milliseconds**. Namespace spelling is `Sagemaker`.       | metric datapoints               |
| `s3://{DestinationS3Uri}/{endpoint}/{variant}/yyyy/mm/dd/hh/*.jsonl` | S3              | Endpoint data capture. Off by default.                                                                | JSONL                           |
| Monitoring output `constraint_violations.json`                       | S3              | Model Monitor violations. Schedule required.                                                          | JSON                            |

There is no `/aws/sagemaker/Pipelines` log group and no Feature Store request log group. Pipeline step logs are the underlying training, processing, or transform streams. Feature Processor remote runs log in `/aws/sagemaker/TrainingJobs`.

v1 should collect the four default log paths (training, processing, transform, and the Endpoints prefix) and the seven metric namespaces above. Notebooks, Studio, labeling, compilation, Inference Recommender, and Model Monitor metric namespaces are separate toggles so unused accounts do not pay for empty scans.

### 3.3 Pagination (API only)

N/A as a CEL integration. The AWS inputs page their own APIs.

`FilterLogEvents` pages are up to 1 MB or 10,000 events. `GetMetricData` accepts up to 500 metric queries per call. Both facts are from the Elastic AWS integration API table and the CloudWatch API docs: https://www.elastic.co/docs/reference/integrations/aws and https://docs.aws.amazon.com/AmazonCloudWatch/latest/APIReference/API_GetMetricData.html

### 3.4 Time-based filtering (API only)

N/A as a CEL integration.

`aws-cloudwatch` uses `start_position` (`beginning` or `end`) and then a cursor. Default this package to `end`.

`GetMetricData` uses a start and end time on each collection interval. Classic SageMaker metrics are 1-minute. `MetricPublishFrequencyInSeconds` on an endpoint can be 10, 30, 60, 120, 180, 240, or 300, and invocation metrics at a non-default frequency also require `EnableEnhancedMetrics=true`. https://docs.aws.amazon.com/sagemaker/latest/dg/monitoring-cloudwatch-enhanced-metrics.html

### 3.5 Reference documentation

| Title                                       | URL                                                                                        | Relevance                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------ |
| Log Amazon SageMaker events with CloudWatch | https://docs.aws.amazon.com/sagemaker/latest/dg/logging-cloudwatch.html                    | Log group and stream names           |
| Built-in algorithm logs                     | https://docs.aws.amazon.com/sagemaker/latest/dg/common-info-all-sagemaker-models-logs.html | Plaintext line samples               |
| SageMaker metrics in CloudWatch             | https://docs.aws.amazon.com/sagemaker/latest/dg/monitoring-cloudwatch.html                 | Namespaces, names, dimensions, units |
| Define training metrics                     | https://docs.aws.amazon.com/sagemaker/latest/dg/define-train-metrics.html                  | Regex metrics from stdout            |
| Events that SageMaker sends to EventBridge  | https://docs.aws.amazon.com/sagemaker/latest/dg/automating-sagemaker-with-eventbridge.html | `detail` examples                    |
| SageMaker events in EventBridge             | https://docs.aws.amazon.com/eventbridge/latest/ref/events-ref-sagemaker.html               | detail-type names                    |
| Data capture                                | https://docs.aws.amazon.com/sagemaker/latest/dg/model-monitor-data-capture-endpoint.html   | JSONL path and envelope              |
| Monitor violations                          | https://docs.aws.amazon.com/sagemaker/latest/dg/model-monitor-interpreting-violations.html | Violation file schema                |
| CloudWatch Logs quotas                      | https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/cloudwatch_limits_cwl.html        | FilterLogEvents TPS                  |
| Elastic AWS integration                     | https://www.elastic.co/docs/reference/integrations/aws                                     | Input types and IAM                  |
| Elastic AWS CloudWatch logs                 | https://www.elastic.co/docs/reference/integrations/aws/cloudwatch                          | Worker and quota guidance            |
| Elastic Amazon Bedrock                      | https://www.elastic.co/docs/reference/integrations/aws_bedrock                             | Sibling package pattern              |
| SageMaker AI Insights                       | https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/SageMaker-Insights.html     | OTel path that v1 does not collect   |
| Sumo Logic SageMaker app                    | https://www.sumologic.com/help/docs/integrations/amazon-aws/amazon-sagemaker/              | Competitive coverage                 |

## 4. Data Format and Structure

### 4.1 Format overview

- **Wire format:** CloudWatch log events whose `message` is plaintext for every container log group except Ground Truth worker activity, which is one JSON object per event. Metrics are `GetMetricData` `MetricDataResult` values. S3 capture is JSON Lines. Violation reports are a single JSON object per file. EventBridge is a JSON envelope with a `detail` object.
- **Encoding:** UTF-8.
- **Compression:** none on the CloudWatch API. S3 objects may be uncompressed JSON or JSONL. CloudTrail objects are gzip, and this package does not read them.
- **Envelope structure:** a CloudWatch log event is `{ timestamp, message, logStreamName, eventId }`. Capture files are one JSON object per line with `captureData`, `eventMetadata`, and `eventVersion`. There is no batch wrapper inside the log message.

### 4.2 Event types

| Event type                                     | Description                                              | Relative volume             | Priority                                               |
| ---------------------------------------------- | -------------------------------------------------------- | --------------------------- | ------------------------------------------------------ |
| Training job log line                          | Plaintext stdout/stderr in `/aws/sagemaker/TrainingJobs` | High while a job runs       | High                                                   |
| Processing job log line                        | Includes Clarify, Monitor, and Debugger rule jobs        | Medium                      | High                                                   |
| Transform job log line                         | Batch transform stdout and optional data-log             | Medium                      | Medium                                                 |
| Endpoint container log line                    | One group per endpoint, for the life of the endpoint     | High on busy endpoints      | High                                                   |
| Endpoint invocation metrics                    | `Invocations`, errors, `ModelLatency` (microseconds)     | Steady, 1 minute            | High                                                   |
| Host utilization metrics                       | CPU, memory, GPU, disk                                   | Steady per host or endpoint | High                                                   |
| Pipeline execution metrics                     | `ExecutionFailed`, `StepFailed`, durations               | Low                         | High                                                   |
| Training / processing / transform state change | EventBridge, includes `FailureReason`                    | Low                         | High, but needs a customer forwarder                   |
| Endpoint state change                          | `IN_SERVICE`, `Failed`, `Updating`                       | Low                         | High, same forwarder                                   |
| Pipeline execution and step status             | camelCase `detail`, not Step Functions                   | Low–medium                  | High, same forwarder                                   |
| Model Monitor violations                       | S3 JSON, one file per execution                          | Low                         | Medium. Closed to new customers.                       |
| Endpoint data capture                          | JSONL of request and response bodies                     | Highest if sampling is high | Low for v1. Customer content.                          |
| Ground Truth worker activity                   | JSON log events                                          | Low                         | Low. Closed to new customers.                          |
| Feature Store records                          | No log schema                                            | —                           | Metrics only, and the namespace string is [UNVERIFIED] |

### 4.3 Field inventory

Container log lines have no stable fields. The only structured piece the package can rely on without a grok is CloudWatch metadata: log group, log stream, and the CloudWatch event timestamp. Stream names do have a documented pattern, and those patterns are fields.

#### Common fields on a CloudWatch log document

| Field path            | Type      | Description                      | Example value                                  | Always present? |
| --------------------- | --------- | -------------------------------- | ---------------------------------------------- | --------------- |
| `message`             | string    | Raw container line               | `Train_error=0.138318;  Valid_error=0.324557;` | yes             |
| CloudWatch event time | date (ms) | When CloudWatch stored the event | `1508190317000`                                | yes             |
| `logGroup`            | string    | Group name                       | `/aws/sagemaker/TrainingJobs`                  | yes             |
| `logStream`           | string    | Stream name                      | `example-job/algo-1-1508190317`                | yes             |

#### Training state-change `detail` (EventBridge)

| Field path                                                      | Type             | Description                                                | Example value                                                          |
| --------------------------------------------------------------- | ---------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| `detail.TrainingJobName`                                        | string           | Job name                                                   | `89c96cc8-dded-4739-afcc-6f1dc936701d`                                 |
| `detail.TrainingJobArn`                                         | string           | ARN                                                        | `arn:aws:sagemaker:us-east-1:111122223333:training-job/kmeans-1`       |
| `detail.TrainingJobStatus`                                      | string           | `InProgress`, `Completed`, `Failed`, `Stopping`, `Stopped` | `Completed`                                                            |
| `detail.FailureReason`                                          | string           | Present when `Failed`                                      | `AlgorithmError: …`                                                    |
| `detail.SecondaryStatus`                                        | string           | Finer training phase                                       | `Completed`                                                            |
| `detail.AlgorithmSpecification.TrainingImage`                   | string           | Training image                                             | `123456789012.dkr.ecr.us-east-1.amazonaws.com/example-training:latest` |
| `detail.ResourceConfig.InstanceType`                            | string           | Instance type                                              | `ml.m5.large`                                                          |
| `detail.CreationTime` / `TrainingStartTime` / `TrainingEndTime` | number or string | Epoch milliseconds, sometimes strings                      | `1538824131` style values vary by event                                |

Processing and transform events use the same shape with `Processing*` and `Transform*` prefixes. Pipeline events switch to camelCase (`currentPipelineExecutionStatus`, `failureReason`). Status enums and the full key list are in `references/field-schema-analysis.md`.

#### Endpoint data capture

| Field path                                      | Type   | Description       | Example value                          |
| ----------------------------------------------- | ------ | ----------------- | -------------------------------------- |
| `captureData.endpointInput.data`                | string | Raw request body  | `1,2,3\n`                              |
| `captureData.endpointInput.observedContentType` | string | Content type      | `text/csv`                             |
| `captureData.endpointOutput.data`               | string | Raw response body | `0.42`                                 |
| `eventMetadata.eventId`                         | string | Capture id        | `aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee` |
| `eventMetadata.inferenceTime`                   | string | ISO 8601          | `2022-02-14T17:25:49Z`                 |
| `eventVersion`                                  | string | Schema version    | `0`                                    |

#### GetMetricData result

The response does not echo dimensions. The collector must store the namespace, metric name, and dimensions it queried next to each value. `Timestamps` are Unix seconds. `Values` are numbers. See `references/sample-events/constructed-get-metric-data-result.json`.

### 4.4 Sample data

See `references/sample-events/` for the files. Official lines and official JSON shapes are unmarked. Files with `constructed-` in the name, and the endpoint/transform/notebook samples called out in `references/sample-events/README.md`, are `[CONSTRUCTED EXAMPLE]`.

- `training-jobs.log` — official built-in algorithm lines
- `processing-jobs.log` — processing lines
- `groundtruth-worker-activity.json` — official JSON shape, anonymized
- `endpoint-data-capture.jsonl` — capture envelope
- `constraint-violations.json` — data-quality violations
- `eventbridge-training-job-state-change.json` — training state event
- `eventbridge-pipeline-execution-status-change.json` — pipeline event, not Step Functions

See `references/field-schema-analysis.md` for the complete field inventory.
See `references/log-format-notes.md` and `references/metrics-notes.md` for log-group and metric tables.
See `references/s3-and-eventbridge-records.md` for capture, violations, and EventBridge detail-types.
See `temp/schema-files/sagemaker-service-2.json` for the botocore SageMaker API model used to dump status enums.

#### Inline sample (training log line)

```text
[10/16/2017 23:45:17 ERROR 139623806805824 train.py:48] Additional properties are not allowed (u'mini_batch_siz' was unexpected)
```

```text
Train_error=0.138318;  Valid_error=0.324557;
```

CloudWatch stores each newline-delimited write as its own event. A Python traceback arrives as many events. The `aws-cloudwatch` input does not reassemble them. The bracket timestamp is inside the text. `@timestamp` should be the CloudWatch event time.

### 4.5 Timestamp handling

- **Primary timestamp field:** CloudWatch log event timestamp for container logs. `GetMetricData` `Timestamps` (Unix seconds) for metrics. EventBridge `time` for state events. `eventMetadata.inferenceTime` for data capture.
- **Format:** CloudWatch log time is epoch milliseconds. Metric timestamps are Unix seconds. EventBridge `time` is ISO 8601 in the spec, but the published endpoint state-change sample sets `time` to the string `"1583831889050"`. Job `detail` times are epoch milliseconds, either numbers or strings, or ISO 8601, depending on the event. Describe\* APIs use Unix seconds.
- **Timezone:** UTC.
- **Additional timestamp fields:** bracket time inside built-in algorithm lines (`MM/dd/yyyy HH:mm:ss`), `CreationTime`, `TrainingStartTime`, `TrainingEndTime`, and the pipeline equivalents. Map start/end onto `event.start` and `event.end` only on the state stream. Do not treat the bracket time as `@timestamp`.

### 4.6 Special parsing considerations

- Training, processing, transform, endpoint, notebook, and Studio messages are free text. Any grok beyond log-group and stream parsing is best-effort. Built-in algorithm lines sometimes start with `[MM/dd/yyyy HH:mm:ss LEVEL pid file:line]`. BYOC containers print whatever the user coded.
- Regex metrics (`Train_error=0.138318`) are already extracted by SageMaker into `/aws/sagemaker/TrainingJobs` with dimension `TrainingJobName`. Collect them as metrics. Do not depend on re-parsing the log line.
- Endpoint log groups are not one group. The input must use the prefix `/aws/sagemaker/Endpoints`.
- Processing log streams use `[hostname]-[epoch]`. Processing metric dimension `Host` uses `algo-[n]`. They do not join on the raw string.
- EventBridge job events are PascalCase. Pipeline events are camelCase. Status enums disagree on case (`IN_SERVICE` versus `InService`). Store the source value.
- AWS may emit more than one EventBridge event per state change. Delivery is best effort.
- The published training event's resource ARN (`kmeans-1`) does not match `detail.TrainingJobName` (`89c96cc8-…`). Do not assume those two strings are equal.
- Model Monitor namespace strings disagree across AWS pages (`data-metric` versus `data-metrics`, singular `Endpoint` versus `Endpoints`, leading slash or not). A single hard-coded name will miss the other.
- Data-capture `data` fields are customer payloads. Leave that stream off by default.
- Sumo's docs lowercase some namespaces (`/aws/sagemaker/endpoints`). CloudWatch namespaces are case-sensitive. Use the AWS metrics page spelling, not Sumo's.

## 5. ECS Mapping Analysis

### 5.1 Categorization per event type

| Event type                         | event.kind | event.category                                                                       | event.type                                                        | event.outcome                          |
| ---------------------------------- | ---------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | -------------------------------------- |
| Container log line                 | `event`    | `[process]`                                                                          | `[info]` or `[error]`                                             | `failure` only on error lines          |
| Invocation and utilization metrics | `metric`   | `[process]` for invocations and pipeline counts; `[host]` for CPU, memory, GPU, disk | omit                                                              | omit                                   |
| Job or endpoint state change       | `event`    | `[process]`                                                                          | `[change]`, plus `[start]` or `[end]`, plus `[error]` when failed | `success` or `failure` from the status |
| Pipeline execution or step         | `event`    | `[process]`                                                                          | same status rule                                                  | `success` or `failure`                 |
| Monitor violation file             | `alert`    | `[process]`                                                                          | `[info]`                                                          | `failure`                              |
| Data capture                       | `event`    | `[process]`                                                                          | `[info]`                                                          | omit                                   |

`event.module` is `aws_sagemaker`. `event.dataset` is `aws_sagemaker.logs` or `aws_sagemaker.metrics`. `cloud.provider` is `aws`. `cloud.service.name` is `sagemaker`.

### 5.2 Field mappings

| Source field                                                            | ECS field                          | Notes                                                                                                                                |
| ----------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| CloudWatch event time                                                   | `@timestamp`                       | Logs stream                                                                                                                          |
| Metric datapoint timestamp                                              | `@timestamp`                       | Unix seconds                                                                                                                         |
| Log message                                                             | `message`                          | match_only_text                                                                                                                      |
| Log group                                                               | `log.logger`                       | Also derive `aws_sagemaker.workload`                                                                                                 |
| Endpoint instance id from the stream                                    | `host.name`                        | Not training `algo-N`                                                                                                                |
| `InstanceType`                                                          | `host.type`                        | State events and enhanced metrics                                                                                                    |
| Training image URI                                                      | `container.image.name`             | State events                                                                                                                         |
| `FailureReason`                                                         | `event.reason` and `error.message` | State events                                                                                                                         |
| `detail-type`                                                           | `event.action`                     | State events                                                                                                                         |
| `account`                                                               | `cloud.account.id`                 | State events                                                                                                                         |
| `region`                                                                | `cloud.region`                     | State events and the agent Region                                                                                                    |
| Job, endpoint, variant, pipeline, metric name, namespace, latency value | `aws_sagemaker.*`                  | No ECS equivalent. Do not reuse `aws.*` from the shared AWS package except input metadata the `aws-cloudwatch` input already writes. |

The full table is in `ecs-mapping-analysis.md`.

### 5.3 Related field enrichment

| ECS enrichment field | Source fields                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `related.ip`         | none on v1 logs or metrics                                                                          |
| `related.user`       | none. CloudTrail identity is out of scope. A role ARN is `aws_sagemaker.role.arn`, not `user.name`. |
| `related.hosts`      | endpoint stream instance id, when it is a real host id                                              |
| `related.hash`       | none                                                                                                |

### 5.4 Geo enrichment candidates

None. Do not GeoIP container logs or data-capture bodies.

## 6. Configuration Plan

### 6.1 Required configuration variables

| Variable            | Type     | Title             | Description                                                | Default                       | Show user |
| ------------------- | -------- | ----------------- | ---------------------------------------------------------- | ----------------------------- | --------- |
| `region`            | text     | AWS Region        | Workload Region. One policy per Region.                    | none                          | yes       |
| `access_key_id`     | password | Access Key ID     | Only for access-key auth methods.                          | none                          | yes       |
| `secret_access_key` | password | Secret Access Key | Paired with the access key.                                | none                          | yes       |
| log groups          | text     | Log groups        | Training, processing, transform, and the Endpoints prefix. | the four paths in section 3.2 | yes       |
| metric namespaces   | text     | Metric namespaces | The seven namespaces in section 3.2, exact case.           | those seven                   | yes       |

### 6.2 Optional configuration variables

| Variable                        | Type     | Title                    | Description                                                | Default | Show user |
| ------------------------------- | -------- | ------------------------ | ---------------------------------------------------------- | ------- | --------- |
| `role_arn`                      | text     | Role ARN                 | Cross-account AssumeRole.                                  | empty   | yes       |
| `external_id`                   | password | External ID              | Store as a secret.                                         | empty   | yes       |
| `session_token`                 | password | Session Token            | Temporary credentials.                                     | empty   | yes       |
| `start_position`                | text     | Start position           | `end` avoids replaying indefinite retention.               | `end`   | yes       |
| `scan_frequency`                | text     | Scan frequency           | Shared `FilterLogEvents` budget.                           | `5m`    | yes       |
| `number_of_workers`             | integer  | Workers                  | `1` per single group. At most `5` on the Endpoints prefix. | `1`     | no        |
| `period`                        | text     | Metric period            | Classic metrics are 1 minute.                              | `1m`    | yes       |
| `include_notebooks`             | bool     | Notebook and Studio logs | Extra log groups.                                          | false   | yes       |
| `include_model_monitor_metrics` | bool     | Model Monitor metrics    | Opt-in namespaces.                                         | false   | yes       |
| `tags`                          | text     | Tags                     | User tags.                                                 | empty   | yes       |
| `processors`                    | yaml     | Processors               | Agent processors.                                          | empty   | no        |
| `preserve_original_event`       | bool     | Preserve original event  | Keep `event.original`.                                     | false   | yes       |

S3 queue URL and the EventBridge state log group are defined in `configuration-plan.md` and stay off in v1.

### 6.3 Deployment notes

Run Elastic Agent in the SageMaker account, or AssumeRole from a monitoring account. Quotas and `GetMetricData` charges apply in the SageMaker account. Set `start_position` to `end` on the first install. Keep workers inside the shared CloudWatch Logs budget if the `aws` package is already collecting other groups. Do not point `GetMetricData` at the OTel Insights store. Do not add Glue, Athena, or Step Functions variables to this package.

## 7. Recommended Integration Architecture

### 7.1 Package name

`aws_sagemaker`

This is one package. The three products that follow it are other packages, not data streams of this one:

| Order          | Package             | What it owns                                                                                               |
| -------------- | ------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1 (this brief) | `aws_sagemaker`     | SageMaker logs, metrics, and later SageMaker-only S3 and EventBridge records                               |
| 2              | `aws_stepfunctions` | `aws.states` executions. A SageMaker Pipeline that starts a state machine does not move those events here. |
| 3              | `aws_glue`          | Glue job logs and the Glue Data Catalog. Feature Store's offline Glue table is Glue.                       |
| 4              | `aws_athena`        | Athena workgroup query logs. Offline feature queries are Athena.                                           |

SageMaker Pipelines, Feature Store runtime metrics, Model Monitor, and Clarify stay inside `aws_sagemaker` when the record is a SageMaker log group, SageMaker metric namespace, or SageMaker S3 report. Their underlying processing jobs already log in `/aws/sagemaker/ProcessingJobs`.

### 7.2 Data streams

| Data stream name                       | Input type       | Source                                                                                                           | Description                                                                          |
| -------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `logs`                                 | `aws-cloudwatch` | `/aws/sagemaker/TrainingJobs`, `ProcessingJobs`, `TransformJobs`, prefix `Endpoints`                             | Container stdout and stderr. Parse the group and stream. Do not require a JSON body. |
| `metrics`                              | `aws/metrics`    | The seven namespaces in section 3.2                                                                              | Invocations, errors, latency, utilization, pipeline failures.                        |
| `state` (v2, off by default)           | `aws-cloudwatch` | One customer log group fed by an EventBridge rule on `source` `aws.sagemaker`, excluding CloudTrail detail-types | Status and `FailureReason`.                                                          |
| `monitor` (v2, off by default)         | `aws-s3`         | `constraint_violations.json` via SQS                                                                             | Drift and completeness violations.                                                   |
| `capture` (not in the default package) | `aws-s3`         | Data-capture JSONL                                                                                               | Request and response bodies. Ship only if a customer asks.                           |

### 7.3 Architecture rationale

Two streams match the two wires SageMaker actually writes by default, and they match the Bedrock package split (logs plus metrics) without pretending stdout is a `ModelInvocationLog`. Putting notebooks, Ground Truth, and Model Monitor behind toggles keeps the default policy small.

State events are the highest-value structured records, and they are still a second phase, because Elastic Agent cannot read EventBridge. Asking every customer to add a rule before the package collects anything would make the default install empty of logs. Logs and metrics work on day one.

S3 capture is a different product decision. It is ML payload, high volume, and off until `DataCaptureConfig` is enabled. Violation files are small and structured, so they are the S3 stream to add first if a v2 needs S3.

One package rather than one package per SageMaker feature (Pipelines, Feature Store, Model Monitor) keeps Fleet policy count down. Those features do not have their own log groups. Splitting them out would fork the same `/aws/sagemaker/ProcessingJobs` stream across packages.

### 7.4 Estimated complexity

- **Pipeline complexity:** moderate. The logs pipeline is a router on log-group name plus a stream-name dissect, with a small optional grok for built-in algorithm `ERROR` lines. The metrics pipeline is the usual CloudWatch metric rename. The v2 state pipeline is the complex one, because `detail` keys change by detail-type and timestamps are mixed.
- **CEL complexity:** N/A. This is not a CEL package.
- **Field count estimate:** about 25 fields on `logs` (mostly group, stream, workload, job, endpoint, variant, level). About 40 fields on `metrics` (namespace, name, value, unit, and the dimension set). The state stream, if built, is 80 or more because training `detail` nests `InputDataConfig`, `ResourceConfig`, and `AlgorithmSpecification`.

## 8. Open Questions and Gaps

| #   | Question                                                                                 | Impact                                                    | Suggested resolution                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Feature Store and Ground Truth metric namespace strings are not on the AWS metrics page. | medium                                                    | Run `ListMetrics` in an account that uses those features before hard-coding a namespace.                                                 |
| 2   | 41 EventBridge detail-types have no published `detail` body.                             | medium                                                    | v1 does not collect them. When the state stream is built, parse only the 17 types with a sample, and keep the raw `detail` for the rest. |
| 3   | Does the `aws-cloudwatch` input call `logs:DescribeLogStreams`?                          | low                                                       | Check the input source before dropping that IAM action.                                                                                  |
| 4   | Async inference `data-log` line template is not published.                               | low                                                       | Treat it as plaintext in v1.                                                                                                             |
| 5   | Model-quality violation file schema is not on the violations page.                       | low                                                       | Skip that file until a sample exists. Data-quality violations are documented.                                                            |
| 6   | Should v1 include HyperPod, MLflow tracking servers, Canvas, and JumpStart?              | medium                                                    | Leave them out. A match-all `aws.sagemaker` rule would pull them in. The state-stream rule should list detail-types.                     |
| 7   | SageMaker AI Insights PromQL names were not inventoried.                                 | medium                                                    | A later package or stream can target that store. `aws/metrics` will return nothing for it.                                               |
| 8   | This repo's synthetic `aws.sagemaker` documents do not match CloudWatch lines.           | high for anyone reusing the load generator as sample data | Use `references/sample-events/` for pipeline tests.                                                                                      |

## 9. Source Attribution

| Source                         | URL                                                                                         | Access method               | Date       |
| ------------------------------ | ------------------------------------------------------------------------------------------- | --------------------------- | ---------- |
| SageMaker CloudWatch logs      | https://docs.aws.amazon.com/sagemaker/latest/dg/logging-cloudwatch.html                     | web fetch by research track | 2026-11-24 |
| SageMaker CloudWatch metrics   | https://docs.aws.amazon.com/sagemaker/latest/dg/monitoring-cloudwatch.html                  | web fetch by research track | 2026-11-24 |
| Built-in algorithm log samples | https://docs.aws.amazon.com/sagemaker/latest/dg/common-info-all-sagemaker-models-logs.html  | web fetch by research track | 2026-11-24 |
| EventBridge SageMaker events   | https://docs.aws.amazon.com/sagemaker/latest/dg/automating-sagemaker-with-eventbridge.html  | web fetch by research track | 2026-11-24 |
| EventBridge event name list    | https://docs.aws.amazon.com/eventbridge/latest/ref/events-ref-sagemaker.html                | web fetch by research track | 2026-11-24 |
| CloudWatch Logs quotas         | https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/cloudwatch_limits_cwl.html         | web fetch by research track | 2026-11-24 |
| Elastic AWS integration 7.1.7  | https://epr.elastic.co/search?package=aws&kibana.version=9.4.0                              | registry fetch              | 2026-11-24 |
| Elastic Bedrock 1.7.0          | https://www.elastic.co/docs/reference/integrations/aws_bedrock                              | web fetch by research track | 2026-11-24 |
| botocore SageMaker model       | `temp/schema-files/sagemaker-service-2.json`                                                | downloaded API model        | 2026-11-24 |
| Sumo Logic SageMaker app       | https://www.sumologic.com/help/docs/integrations/amazon-aws/amazon-sagemaker/               | web fetch by research track | 2026-11-24 |
| Splunk Add-on for AWS 8.3.1    | https://splunkbase.splunk.com/app/1876                                                      | Splunkbase API and docs     | 2026-11-24 |
| IBM QRadar DSM guide           | https://www.ibm.com/docs/en/dsm?topic=configuration-qradar-supported-dsms                   | web fetch by research track | 2026-11-24 |
| Local load-generator assets    | `installer/aws-custom-dashboards/sagemaker-dashboard.json` and `logs-aws.sagemaker-default` | local files                 | 2026-11-24 |
