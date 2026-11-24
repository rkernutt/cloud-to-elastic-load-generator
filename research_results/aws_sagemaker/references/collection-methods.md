# Amazon SageMaker collection methods

Research date: 2026-11-24. Scope is a standalone Elastic Fleet package `aws_sagemaker`. SageMaker Pipelines, Feature Store, Model Monitor, and Clarify are in scope when they emit their own logs or metrics. They are not AWS Step Functions, AWS Glue, or Amazon Athena.

## Product summary

Amazon SageMaker AI is the AWS managed machine-learning platform. Observable workloads are training jobs, processing jobs, batch transform jobs, real-time inference endpoints (including serverless, multi-model, inference-component, and multi-container inference pipelines), asynchronous inference, notebook instances, SageMaker Studio and Studio Classic, Ground Truth labeling, Neo compilation jobs, Inference Recommender, Model Monitor, Feature Store, SageMaker Pipelines, Clarify, and Debugger.

What each surface actually emits:

| Workload                | Default telemetry                                                                                                                             | Opt-in telemetry                                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Training jobs           | Container `stdout`/`stderr` in CloudWatch Logs. Host CPU, memory, GPU, and disk metrics at 1-minute period.                                   | Up to 40 `MetricDefinitions` regex metrics parsed from those logs. Debugger tensors in S3 and Debugger rule jobs (processing logs).                |
| Processing jobs         | Same pattern as training: logs plus host metrics. Clarify jobs, Model Monitor executions, and Debugger rule jobs are processing jobs.         | Clarify `analysis.json` and related files in the job's S3 output.                                                                                  |
| Batch transform         | Container logs, optional `data-log` stream, host metrics (no `DiskUtilization`).                                                              | `DataCaptureConfig` JSONL in a customer S3 prefix. Prediction files at `TransformOutput.S3OutputPath` are customer output, not an operational log. |
| Real-time endpoints     | Per-endpoint log group of container stdout/stderr. Invocation metrics in `AWS/SageMaker`. Instance utilization in `/aws/sagemaker/Endpoints`. | Data capture JSONL in S3. `EnableEnhancedMetrics` adds `InstanceId`, `ContainerId`, and `AcceleratorId`. Model Monitor schedules.                  |
| Async inference         | Same endpoint log group, plus a `.../data-log` stream.                                                                                        | Optional SNS success/error notifications on `AsyncInferenceConfig`. Those are not a CloudWatch log group.                                          |
| Notebook instances      | `jupyter.log` and, when a lifecycle config exists, a lifecycle-hook stream.                                                                   | None beyond what the notebook process prints.                                                                                                      |
| Studio / Studio Classic | `/aws/sagemaker/studio` streams per domain, user profile, app type, and app name.                                                             | App processes may also launch training, processing, or pipeline jobs, which log in those job groups.                                               |
| Ground Truth            | `/aws/sagemaker/LabelingJobs` and `/aws/sagemaker/groundtruth/WorkerActivity`, plus labeling progress metrics.                                | Output manifests in the customer's S3 bucket.                                                                                                      |
| Neo compilation         | `/aws/sagemaker/CompilationJobs`, one stream per job name.                                                                                    | No separate metrics namespace found.                                                                                                               |
| Inference Recommender   | Dedicated log group and metric namespace.                                                                                                     | Creates compilation jobs and endpoints, which also log in those groups.                                                                            |
| Model Monitor           | Monitoring executions are processing jobs, so their logs are in `/aws/sagemaker/ProcessingJobs`.                                              | Must be scheduled. Violation reports in S3. Per-feature CloudWatch metrics only when `emit_metrics` is enabled. Closed to new customers.           |
| Feature Store           | Runtime consumption and operational metrics. No request-body log group was found.                                                             | Feature Processor pipelines log like training jobs. Offline store tables are Glue/Athena and are out of scope.                                     |
| Pipelines               | Execution and step count/duration metrics. EventBridge execution and step status events.                                                      | No pipeline log group. A step's logs are the underlying training, processing, or transform job logs.                                               |
| Clarify                 | Runs as a processing job (logs and host metrics).                                                                                             | `analysis.json`, `report.ipynb`, and optional SHAP files in the processing output S3 prefix.                                                       |
| Debugger                | Rule-job logs in `/aws/sagemaker/ProcessingJobs`.                                                                                             | Hook config required. Tensors go to an S3 debug-output prefix, not CloudWatch.                                                                     |

Platform status (`TrainingJobStatus`, `FailureReason`, endpoint status, pipeline execution status) is control-plane state. It is not the log body. If a training job fails before the container starts, CloudWatch often has no stream and the only explanation is `DescribeTrainingJob` `FailureReason`.

Two product-availability limits, from AWS:

- Model Monitor is no longer open to new customers. Existing customers keep it. https://docs.aws.amazon.com/sagemaker/latest/dg/model-monitor-interpreting-cloudwatch.html
- Ground Truth is no longer open to new customers. https://docs.aws.amazon.com/sagemaker/latest/dg/sms.html

## Log groups and streams

Source: https://docs.aws.amazon.com/sagemaker/latest/dg/logging-cloudwatch.html

SageMaker copies container `stdout` and `stderr` to CloudWatch Logs. Retention is indefinite unless someone sets a retention policy on the group. https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/Working-with-log-groups-and-streams.html

| Log group                                     | Stream name                                                                                                       | Workload                                                                                                                                                                                                                                                                           |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/aws/sagemaker/TrainingJobs`                 | `[training-job-name]/algo-[instance-number-in-cluster]-[epoch_timestamp]`                                         | Training. One stream per node. Feature Processor `@remote` and pipeline-step streams also land here; pipeline-step streams contain `feature-processor` and the execution id. https://docs.aws.amazon.com/sagemaker/latest/dg/feature-store-feature-processor-monitor-pipeline.html |
| `/aws/sagemaker/ProcessingJobs`               | `[processing-job-name]/[hostname]-[epoch_timestamp]`                                                              | Processing, Clarify, Model Monitor executions, Debugger rule jobs. https://docs.aws.amazon.com/sagemaker/latest/dg/debugger-cloudwatch-metric.html                                                                                                                                 |
| `/aws/sagemaker/TransformJobs`                | `[transform-job-name]/[instance-id]-[epoch_timestamp]`                                                            | Batch transform container stdout/stderr.                                                                                                                                                                                                                                           |
| `/aws/sagemaker/TransformJobs`                | `[transform-job-name]/[instance-id]-[epoch_timestamp]/data-log`                                                   | Batch transform data log.                                                                                                                                                                                                                                                          |
| `/aws/sagemaker/TransformJobs`                | `[transform-job-name]/[instance-id]-[epoch_timestamp]/[container-name]`                                           | Inference-pipeline transform. Unnamed containers become `container-1`, `container-2`, in model order.                                                                                                                                                                              |
| `/aws/sagemaker/Endpoints/[EndpointName]`     | `[production-variant-name]/[instance-id]`                                                                         | Real-time endpoint, including serverless. This is one log **group per endpoint**, not one group with many streams. https://docs.aws.amazon.com/sagemaker/latest/dg/serverless-endpoints-monitoring.html                                                                            |
| `/aws/sagemaker/Endpoints/[EndpointName]`     | `[production-variant-name]/[instance-id]/data-log`                                                                | Asynchronous inference.                                                                                                                                                                                                                                                            |
| `/aws/sagemaker/Endpoints/[EndpointName]`     | `[production-variant-name]/[instance-id]/[container-name]`                                                        | Inference pipeline. Same `container-N` fallback.                                                                                                                                                                                                                                   |
| `/aws/sagemaker/NotebookInstances`            | `[notebook-instance-name]/jupyter.log`                                                                            | Notebook Jupyter process.                                                                                                                                                                                                                                                          |
| `/aws/sagemaker/NotebookInstances`            | `[notebook-instance-name]/[LifecycleConfigHook]`                                                                  | Only when the instance has a lifecycle configuration.                                                                                                                                                                                                                              |
| `/aws/sagemaker/studio`                       | `[domain-id]/[user-profile-name]/[app-type]/[app-name]`                                                           | Studio and Studio Classic apps.                                                                                                                                                                                                                                                    |
| `/aws/sagemaker/studio`                       | `[domain-id]/domain-shared/rstudioserverpro/default`                                                              | Shared RStudio Server Pro.                                                                                                                                                                                                                                                         |
| `/aws/sagemaker/CompilationJobs`              | `[compilation-job-name]`                                                                                          | Neo compilation.                                                                                                                                                                                                                                                                   |
| `/aws/sagemaker/LabelingJobs`                 | `[labeling-job-name]`                                                                                             | Ground Truth labeling job.                                                                                                                                                                                                                                                         |
| `/aws/sagemaker/groundtruth/WorkerActivity`   | `aws/sagemaker/groundtruth/worker-activity/[requester-AWS-Id]-[region]/[timestamp]`                               | Ground Truth worker activity. The group name is lowercase `groundtruth`.                                                                                                                                                                                                           |
| `/aws/sagemaker/InferenceRecommendationsJobs` | `[job-name]/execution`, `[job-name]/CompilationJob/[compilation-job-name]`, `[job-name]/Endpoint/[endpoint-name]` | Inference Recommender.                                                                                                                                                                                                                                                             |

Prefixes an `aws-cloudwatch` input can use:

- Single groups, use the exact name: `/aws/sagemaker/TrainingJobs`, `/aws/sagemaker/ProcessingJobs`, `/aws/sagemaker/TransformJobs`, `/aws/sagemaker/NotebookInstances`, `/aws/sagemaker/studio`, `/aws/sagemaker/CompilationJobs`, `/aws/sagemaker/LabelingJobs`, `/aws/sagemaker/groundtruth/WorkerActivity`, `/aws/sagemaker/InferenceRecommendationsJobs`.
- Prefix, because each endpoint is its own group: `/aws/sagemaker/Endpoints`.

There is no `/aws/sagemaker/Pipelines` group and no Feature Store request log group.

Built-in algorithm logs are free text: argument echo, stage timings, accuracy lines, and errors. They are not a versioned JSON schema. https://docs.aws.amazon.com/sagemaker/latest/dg/common-info-all-sagemaker-models-logs.html

Example training lines, structure only:

```text
Train_error=0.138318;  Valid_error=0.324557;
```

```text
AlgorithmError: framework error: ValueError: Example Corp feature column missing
```

CloudWatch stores each newline-delimited write as its own log event. A Python traceback is many events, not one multiline document. The `aws` package added a multiline grok for EMR S3 logs specifically because those files span lines (elastic/integrations PR 6895). The same problem exists for SageMaker stdout, and the CloudWatch input does not reassemble it. Treat any field extraction from training or endpoint logs as inference. Regex training metrics are the supported structured extract, and SageMaker already performs that extract.

## Metric namespaces

Authoritative list: https://docs.aws.amazon.com/sagemaker/latest/dg/monitoring-cloudwatch.html

Classic metrics are 1-minute unless noted. Statistics are retained 15 months. The CloudWatch console search only shows metrics updated in the last 2 weeks. High-resolution 1-second metrics, when a job emits them, are kept for 3 hours.

`MetricPublishFrequencyInSeconds` on endpoint `MetricsConfig` can be 10, 30, 60, 120, 180, 240, or 300. For invocation metrics that setting also requires `EnableEnhancedMetrics=true`. Utilization metrics can change frequency without enhanced metrics. https://docs.aws.amazon.com/sagemaker/latest/dg/monitoring-cloudwatch-enhanced-metrics.html

| Namespace                                     | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Dimensions                                                                                                                                                                                                                                   |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/aws/sagemaker/Endpoints`                    | Endpoint instance utilization: `CPUUtilization`, `CPUUtilizationNormalized`, `CPUReservation`, `MemoryUtilization`, `MemoryReservation`, `DiskUtilization`, `GPUUtilization`, `GPUUtilizationNormalized`, `GPUMemoryUtilization`, `GPUMemoryUtilizationNormalized`, `GPUReservation`. Also multi-model `LoadedModelCount`.                                                                                                                                                                                                                                            | `EndpointName` + `VariantName`. Optional `InstanceType` for instance pools. `InstanceId` and GPU `AcceleratorId` only when `EnableEnhancedMetrics=true`.                                                                                     |
| `AWS/SageMaker`                               | `InvokeEndpoint` metrics: `Invocations`, `InvocationsPerInstance`, `InvocationsPerCopy`, `Invocation4XXErrors`, `Invocation5XXErrors`, `InvocationModelErrors`, `ModelLatency`, `OverheadLatency`, `ModelSetupTime` (serverless), `ConcurrentRequestsPerModel`, `ConcurrentRequestsPerCopy`, streaming `FirstChunkLatency`, `FirstChunkModelLatency`, `FirstChunkOverheadLatency`, `MidStreamErrors`. Multi-model loading: `ModelLoadingWaitTime`, `ModelUnloadingTime`, `ModelDownloadingTime`, `ModelLoadingTime`, `ModelCacheHit`. Latency units are microseconds. | `EndpointName` + `VariantName`, optional `InstanceType`. `InferenceComponentName` for component invocations. `InstanceId` and `ContainerId` only with enhanced metrics. Multi-model loading metrics use `EndpointName` + `VariantName` only. |
| `/aws/sagemaker/InferenceComponents`          | Per-copy normalized CPU, memory, GPU, and GPU-memory utilization.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `InferenceComponentName`, optional `InstanceType`. `InstanceId`, `ContainerId`, `AcceleratorId` only with enhanced metrics.                                                                                                                  |
| `/aws/sagemaker/TrainingJobs`                 | Job host metrics: `CPUUtilization`, `MemoryUtilization`, `DiskUtilization`, `GPUUtilization`, `GPUMemoryUtilization`.                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `Host` = `[training-job-name]/algo-[instance-number-in-cluster]`.                                                                                                                                                                            |
| `/aws/sagemaker/TrainingJobs`                 | Regex-parsed algorithm metrics (`train:error` and similar). Names come from `MetricDefinitions` or the built-in algorithm.                                                                                                                                                                                                                                                                                                                                                                                                                                            | Dimension `TrainingJobName`. https://docs.aws.amazon.com/sagemaker/latest/dg/view-train-metrics.html                                                                                                                                         |
| `/aws/sagemaker/ProcessingJobs`               | Same host metrics as training.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `Host` = `[processing-job-name]/algo-[instance-number-in-cluster]`. The log stream uses `[hostname]-[epoch]`, which does not match this dimension. Both forms are what the docs specify.                                                     |
| `/aws/sagemaker/TransformJobs`                | `CPUUtilization`, `MemoryUtilization`, `GPUUtilization`, `GPUMemoryUtilization`. `DiskUtilization` is not supported.                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `Host` = `[transform-job-name]/[instance-id]`.                                                                                                                                                                                               |
| `/aws/sagemaker/InferenceRecommendationsJobs` | `ClientInvocations`, `ClientInvocationErrors`, `ClientLatency` (milliseconds), `NumberOfUsers`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `JobName`, `EndpointName`.                                                                                                                                                                                                                   |
| `AWS/Sagemaker/ModelBuildingPipeline`         | Pipeline executions: `ExecutionStarted`, `ExecutionFailed`, `ExecutionSucceeded`, `ExecutionStopped`, `ExecutionDuration`. Steps: `StepStarted`, `StepFailed`, `StepSucceeded`, `StepStopped`, `StepDuration`. Durations are milliseconds.                                                                                                                                                                                                                                                                                                                            | Executions: `PipelineName` (omit it for the account-wide series). Steps: `PipelineName` + `StepName`. The namespace spelling is `Sagemaker`, not `SageMaker`.                                                                                |
| `/aws/sagemaker/Endpoints/data-metric`        | Built-in Model Monitor, real-time. `feature_data_{feature_name}` (Max, Min, Sum, SampleCount, Average), `feature_non_null_{feature_name}`, `feature_baseline_drift_{feature_name}`.                                                                                                                                                                                                                                                                                                                                                                                   | `EndpointName`, `ScheduleName`. Only when `emit_metrics` is `Enabled`. https://docs.aws.amazon.com/sagemaker/latest/dg/model-monitor-interpreting-cloudwatch.html                                                                            |
| `/aws/sagemaker/ModelMonitoring/data-metric`  | Built-in Model Monitor, batch transform. Same metric names.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `MonitoringSchedule`.                                                                                                                                                                                                                        |
| `/aws/sagemaker/Endpoint/data-metrics`        | Bring-your-own Model Monitor container, real-time. Singular `Endpoint`, plural `metrics`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Recommended `Endpoint`, `MonitoringSchedule`. https://docs.aws.amazon.com/sagemaker/latest/dg/model-monitor-byoc-cloudwatch.html                                                                                                             |
| `/aws/sagemaker/ModelMonitoring/data-metrics` | Bring-your-own container, batch.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `MonitoringSchedule`.                                                                                                                                                                                                                        |

Ground Truth metric names are on the same monitoring page (`ActiveWorkers`, `DatasetObjectsAutoAnnotated`, `DatasetObjectsHumanAnnotated`, `DatasetObjectsLabelingFailed`, `JobsFailed`, `JobsSucceeded`, `JobsStopped`, `TasksAccepted`, `TasksDeclined`, `TasksReturned`, `TasksSubmitted`, `TimeSpent`, `TotalDatasetObjectsLabeled`). Dataset-object metrics filter on `LabelingJobName`. The page does not name the namespace. [UNVERIFIED] namespace.

Feature Store metric names are also on that page. Consumption: `ConsumedReadRequestsUnits`, `ConsumedWriteRequestsUnits`, `ConsumedReadCapacityUnits`, `ConsumedWriteCapacityUnits`, dimensions `FeatureGroupName` + `OperationName`. Operational: `Invocations`, `Operation4XXErrors`, `Operation5XXErrors`, `ThrottledRequests`, `Latency` (microseconds). Non-batch operations (`GetRecord`, `PutRecord`, `DeleteRecord`, `ListRecords`) use `FeatureGroupName` + `OperationName`. Batch operations (`BatchGetRecord`, `BatchWriteRecord`) use `OperationName` only. The official page does not name the namespace. A third-party measurement (not AWS) reports `AWS/SageMaker` and says `AWS/SageMaker/FeatureStore` returns nothing: https://zenn.dev/nttdata_tech/articles/a32fd071026898. [UNVERIFIED] against AWS docs.

SageMaker AI Insights is a separate, newer path. An OTel collector on the instance scrapes DCGM, node exporter, and framework `/metrics` (vLLM, SGLang, TensorRT-LLM) and exports OTLP to CloudWatch. Labels include `aws.sagemaker.endpoint.name` and `aws.sagemaker.inference_component.name`. `EnableDetailedObservability` defaults to true for new endpoints. Query is PromQL, not `GetMetricData`. https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/SageMaker-Insights.html and https://docs.aws.amazon.com/sagemaker/latest/dg/monitoring-detailed-observability-metric-mapping.html. CloudWatch documents that `GetMetricData` does not query OTel metrics. https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/metrics-classic-getdata.html

`AWS/Usage` with service dimension `Sagemaker` is SageMaker Runtime API usage, not inference quality. Leave it to a generic AWS usage integration if one exists. https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AWS-API-Usage-Metrics.html

## S3 destinations

| Destination            | Path                                                                                   | Contents                                                                | Default?                                                                                                                                                                                                                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Endpoint data capture  | `s3://{bucket}/{endpoint-name}/{variant-name}/yyyy/mm/dd/hh/{filename}.jsonl`          | JSON Lines envelope around the raw request and response.                | Off. `DataCaptureConfig.EnableCapture=true` on the endpoint config. Capture is async and can lag by minutes. Capture stops if instance disk is under pressure; AWS recommends keeping disk utilization under 75%. https://docs.aws.amazon.com/sagemaker/latest/dg/model-monitor-data-capture-endpoint.html |
| Batch data capture     | Customer `DestinationS3Uri`. Same region as the monitor schedule.                      | JSONL of transform input and output.                                    | Off. https://docs.aws.amazon.com/sagemaker/latest/dg/model-monitor-faqs.html                                                                                                                                                                                                                               |
| Model Monitor reports  | Monitoring schedule output URI.                                                        | `statistics.json` (data-quality only) and `constraint_violations.json`. | Schedule must exist. https://docs.aws.amazon.com/sagemaker/latest/dg/model-monitor-interpreting-results.html                                                                                                                                                                                               |
| Clarify                | Processing output S3 prefix.                                                           | `analysis.json`, `report.ipynb`, optional `explanations_shap/`.         | Only if a Clarify job is run. https://docs.aws.amazon.com/sagemaker/latest/dg/clarify-processing-job-analysis-results.html                                                                                                                                                                                 |
| Debugger tensors       | `S3OutputPath`, or default `s3://sagemaker-{region}-{account-id}/{job}/debug-output/`. | Binary tensor collections, not logs.                                    | Hook must be configured. https://docs.aws.amazon.com/sagemaker/latest/dg/debugger-configure-hook.html                                                                                                                                                                                                      |
| Batch transform output | `TransformOutput.S3OutputPath`                                                         | Model predictions. Customer data.                                       | Always written for a successful transform, but it is not operational telemetry.                                                                                                                                                                                                                            |
| Training output        | `OutputDataConfig.S3OutputPath`                                                        | Model artifacts. Not telemetry.                                         | Always configured by the job.                                                                                                                                                                                                                                                                              |

Anonymized capture record (CSV endpoint), from the AWS sample shape:

```json
{
  "captureData": {
    "endpointInput": {
      "observedContentType": "text/csv",
      "mode": "INPUT",
      "data": "1,2,3\n",
      "encoding": "CSV"
    },
    "endpointOutput": {
      "observedContentType": "text/csv; charset=utf-8",
      "mode": "OUTPUT",
      "data": "0.42",
      "encoding": "CSV"
    }
  },
  "eventMetadata": {
    "eventId": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    "inferenceTime": "2022-02-14T17:25:49Z"
  },
  "eventVersion": "0"
}
```

The `data` fields are customer payloads. Do not collect this stream by default.

## EventBridge

SageMaker emits best-effort events with `source` = `aws.sagemaker`. https://docs.aws.amazon.com/eventbridge/latest/ref/events-ref-sagemaker.html and https://docs.aws.amazon.com/sagemaker/latest/dg/automating-sagemaker-with-eventbridge.html

Match-all pattern:

```json
{ "source": ["aws.sagemaker"] }
```

Detail-types documented on the events reference include training, hyperparameter tuning, transform, processing, endpoint, endpoint config, endpoint deployment, model, model package, model card, notebook instance, notebook lifecycle config, algorithm, image, image version, feature group, monitoring schedule, labeling job, labeling task, pipeline execution, pipeline step, evaluation job, compilation is not a separate detail-type in that list, HyperPod cluster state/node health/cluster event, A2I human-loop and human-task events, MLflow tracking-server lifecycle, and a generic "SageMaker job state change" for reinforcement fine-tuning jobs (`JobCategory` `AgentRFT` or `AgentRFTEvaluation`).

AWS notes that one state change can produce multiple events. Failed jobs include `FailureReason` on the training, processing, transform, and RFT job events.

Anonymized endpoint state event:

```json
{
  "version": "0",
  "id": "d2921b5a-b0ad-cace-a8e3-0f159d018e06",
  "detail-type": "SageMaker Endpoint State Change",
  "source": "aws.sagemaker",
  "account": "111122223333",
  "time": "2021-10-25T01:52:12Z",
  "region": "us-west-2",
  "resources": ["arn:aws:sagemaker:us-west-2:111122223333:endpoint/example-endpoint"],
  "detail": {
    "EndpointName": "example-endpoint",
    "EndpointArn": "arn:aws:sagemaker:us-west-2:111122223333:endpoint/example-endpoint",
    "EndpointConfigName": "example-endpoint-config",
    "EndpointStatus": "IN_SERVICE"
  }
}
```

Pipeline execution statuses: `Executing`, `Succeeded`, `Failed`, `Stopping`, `Stopped`. These events are SageMaker Pipelines, not Step Functions. A pipeline can be configured to start a Step Functions state machine as a downstream action; that state machine is `aws.states` and belongs in the future Step Functions package.

CloudTrail management events also arrive on EventBridge as `detail-type` `AWS API Call via CloudTrail` with `detail.eventSource` `sagemaker.amazonaws.com`. That is the same audit stream the Elastic `aws` CloudTrail data stream already collects. Do not add it here.

Elastic Agent has no EventBridge input. A practical secondary path is an EventBridge rule that writes the SageMaker state events to a dedicated CloudWatch log group or S3 bucket, then collect that destination with `aws-cloudwatch` or `aws-s3`.

## Control-plane APIs

These return state, ARNs, timestamps, and `FailureReason`. They do not return log bodies. https://docs.aws.amazon.com/sagemaker/latest/APIReference/API_Operations.html

| API                                                                                 | State it adds beyond logs                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ListTrainingJobs`, `DescribeTrainingJob`                                           | `TrainingJobStatus`, `SecondaryStatus`, `FailureReason`, `FinalMetricDataList` (last regex-metric values), billable seconds. https://docs.aws.amazon.com/sagemaker/latest/APIReference/API_DescribeTrainingJob.html |
| `ListProcessingJobs`, `DescribeProcessingJob`                                       | Processing status and `FailureReason`. Covers Clarify and Monitor executions.                                                                                                                                       |
| `ListTransformJobs`, `DescribeTransformJob`                                         | Transform status and `FailureReason`.                                                                                                                                                                               |
| `ListEndpoints`, `DescribeEndpoint`, `DescribeEndpointConfig`                       | `EndpointStatus`, variant weights, whether data capture is enabled.                                                                                                                                                 |
| `ListMonitoringSchedules`, `DescribeMonitoringSchedule`, `ListMonitoringExecutions` | Schedule state and `CompletedWithViolations` vs `Failed`.                                                                                                                                                           |
| `ListPipelineExecutions`, `DescribePipelineExecution`, `ListPipelineExecutionSteps` | Pipeline and step status.                                                                                                                                                                                           |
| `ListCompilationJobs`, `DescribeCompilationJob`                                     | Neo job status.                                                                                                                                                                                                     |
| `ListLabelingJobs`, `DescribeLabelingJob`                                           | Labeling status and label counters.                                                                                                                                                                                 |
| `ListFeatureGroups`, `DescribeFeatureGroup`                                         | `FeatureGroupStatus`, offline-store status.                                                                                                                                                                         |
| `ListNotebookInstances`, `DescribeNotebookInstance`                                 | Instance status.                                                                                                                                                                                                    |

Polling these on a short interval duplicates EventBridge and burns SageMaker API quota. Do not make them the log collector. `FinalMetricDataList` is a small end-of-job summary and is reasonable as an enrichment later, not as a first data stream.

## Collection methods

| Mechanism                                                              | Data                                                                                                                             | Pros                                                                                                                                                               | Cons                                                                                                                                                                                                                         | Official URL                                                                               |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| CloudWatch Logs `FilterLogEvents` via Elastic `aws-cloudwatch`         | Container stdout/stderr for every job and endpoint group above. Studio, notebooks, labeling, compilation, Inference Recommender. | On by default for container output. Same input Elastic uses for Lambda logs and for Bedrock invocation logs. One prefix covers every endpoint group.               | Unstructured text. Account-wide TPS quota. Endpoint fan-out is one group per endpoint. Indefinite retention can make `start_position: beginning` replay a large backlog.                                                     | https://docs.aws.amazon.com/sagemaker/latest/dg/logging-cloudwatch.html                    |
| CloudWatch `GetMetricData` and `ListMetrics` via Elastic `aws/metrics` | Invocation health, host utilization, pipeline execution, Inference Recommender, and opt-in monitor feature metrics.              | Structured, low volume relative to stdout, 1-minute (or configured) period, batched 500 queries per call. Matches `aws` metrics and `aws_bedrock` runtime metrics. | `GetMetricData` is always billed. Job `Host` series are high cardinality and disappear when the job ends. Does not read SageMaker AI Insights OTel metrics. Feature Store and Ground Truth namespaces are not stated by AWS. | https://docs.aws.amazon.com/sagemaker/latest/dg/monitoring-cloudwatch.html                 |
| S3 `GetObject` / `ListBucket` via Elastic `aws-s3`                     | Data-capture JSONL, `constraint_violations.json`, `statistics.json`, Clarify `analysis.json`.                                    | Structured envelopes. Bedrock already uses this input for invocation logs. SQS notifications are the cheap way to discover objects.                                | Off unless the customer enables capture or a schedule. Payloads are customer content. List polling is expensive. Debugger tensors and model artifacts are the wrong objects.                                                 | https://docs.aws.amazon.com/sagemaker/latest/dg/model-monitor-data-capture-endpoint.html   |
| EventBridge `aws.sagemaker`, forwarded to Logs or S3                   | Job, endpoint, pipeline, feature-group, and monitor state changes, including `FailureReason`.                                    | Near real time. Small. Structured JSON. Covers the "failed before logs existed" case.                                                                              | No native Elastic Agent input. Customer must add a rule. Duplicate events are normal. CloudTrail-shaped events on this bus must be filtered out.                                                                             | https://docs.aws.amazon.com/sagemaker/latest/dg/automating-sagemaker-with-eventbridge.html |
| SageMaker `List*` / `Describe*`                                        | Status and `FailureReason` only.                                                                                                 | Works without a forwarder. `FinalMetricDataList` is a clean end-of-job metric snapshot.                                                                            | Not log bodies. Polling cost and quota. EventBridge already has the transitions.                                                                                                                                             | https://docs.aws.amazon.com/sagemaker/latest/APIReference/API_Operations.html              |
| CloudTrail                                                             | `sagemaker.amazonaws.com` management calls.                                                                                      | Already collected by the `aws` CloudTrail data stream.                                                                                                             | Duplicating it in `aws_sagemaker` would double-store API audit.                                                                                                                                                              | https://docs.aws.amazon.com/eventbridge/latest/ref/events-ref-sagemaker.html               |
| SageMaker AI Insights OTel / PromQL                                    | Endpoint GPU, node, and framework series (tokens, TTFT, KV cache) for new endpoints.                                             | Richer than classic `AWS/SageMaker` invocation metrics. On by default for new endpoints.                                                                           | `GetMetricData` cannot read it. `aws/metrics` will not collect it. Needs a PromQL or OTLP input this package does not have a precedent for.                                                                                  | https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/SageMaker-Insights.html     |
| CloudWatch Logs subscription filter to Firehose, Kinesis, or Lambda    | Same log events, pushed.                                                                                                         | Avoids `FilterLogEvents` polling quota.                                                                                                                            | Not an Elastic Agent input. Customer-managed plumbing. The `aws` package dropped "CloudWatch via S3" as a deprecated path in 2.0.0.                                                                                          | https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/Subscriptions.html                |

## Recommended primary and secondary

Primary: CloudWatch Logs with the `aws-cloudwatch` input, plus classic CloudWatch metrics with the `aws/metrics` input (`GetMetricData`).

This is the Elastic precedent that fits SageMaker's default telemetry.

- Published `aws` 7.1.7 collects Lambda logs with `aws-cloudwatch` and EMR logs with both `aws-cloudwatch` and `aws-s3`. Metrics use `aws/metrics`. https://www.elastic.co/docs/reference/integrations/aws/lambda and the `aws` manifest inputs (`lambda` logs are `aws-cloudwatch`; `emr` logs are `aws-s3` and `aws-cloudwatch`; metrics are `aws/metrics`). GitHub `main` is ahead of the 7.1.7 registry version and still uses those input types: https://github.com/elastic/integrations/blob/main/packages/aws/manifest.yml
- The AWS integration calls `logs:DescribeLogGroups`, `logs:FilterLogEvents`, `cloudwatch:GetMetricData`, and `cloudwatch:ListMetrics`. https://www.elastic.co/docs/reference/integrations/aws
- `aws_bedrock` 1.7.0 is a separate package. EPR for Kibana 9.4.0 returns that version and no `aws_sagemaker` package (`https://epr.elastic.co/search?package=aws_sagemaker&kibana.version=9.4.0` returned `[]` on 2026-11-24; Bedrock search returned 1.7.0). Bedrock data streams are `invocation` (logs), `runtime` (metrics), and `guardrails` (metrics). Invocation logs are collected from CloudWatch with `filterLogEvents` or from S3. Runtime metrics are CloudWatch `AWS/Bedrock`. https://www.elastic.co/docs/reference/integrations/aws_bedrock and https://epr.elastic.co/package/aws_bedrock/1.7.0
- Bedrock can do this with one customer-chosen log group because Bedrock invocation logging is a structured `ModelInvocationLog` schema, version 1.0, and is off until enabled. SageMaker's equivalent of "always on" is the container log groups above, and they are unstructured. The package should still use the same two inputs. It should not pretend the log body has a Bedrock-style schema. Parsing training and endpoint lines is inference.

Collect these log groups first, in the endpoint's region: `/aws/sagemaker/TrainingJobs`, `/aws/sagemaker/ProcessingJobs`, `/aws/sagemaker/TransformJobs`, and the prefix `/aws/sagemaker/Endpoints`. Add notebooks, Studio, compilation, labeling, and Inference Recommender as separate streams so a customer who does not use them does not pay for empty `DescribeLogGroups` scans.

Collect these metric namespaces first: `AWS/SageMaker`, `/aws/sagemaker/Endpoints`, `/aws/sagemaker/TrainingJobs`, `/aws/sagemaker/ProcessingJobs`, `/aws/sagemaker/TransformJobs`, `/aws/sagemaker/InferenceComponents`, `AWS/Sagemaker/ModelBuildingPipeline`. Add the Model Monitor `data-metric` namespaces only when the customer runs monitors. Do not point `GetMetricData` at the OTel store.

Secondary: S3 via `aws-s3`, off by default, for Model Monitor `constraint_violations.json` and Clarify `analysis.json`. Data-capture JSONL is a further opt-in because it contains request and response payloads. Prefer an SQS notification on the bucket. The Bedrock docs say bucket listing without SQS is the expensive path. https://www.elastic.co/docs/reference/integrations/aws_bedrock

EventBridge-to-Logs is the right later addition for lifecycle state (`Failed` plus `FailureReason`) and is still the same `aws-cloudwatch` input. Do not poll `Describe*` APIs in v1.

## Package boundary

In scope for `aws_sagemaker`:

- Log groups and metric namespaces in the tables above.
- SageMaker Pipelines metrics and, if forwarded, pipeline execution and step EventBridge events. Pipelines are not Step Functions.
- Feature Store runtime metrics, and Feature Processor logs that already appear in `/aws/sagemaker/TrainingJobs`.
- Model Monitor processing logs, violation reports, and `data-metric` namespaces.
- Clarify processing logs and `analysis.json`.
- Debugger rule-job logs. Debugger tensor objects in S3 are profiling binaries, not a log stream; leave them out of the default S3 input.
- Ground Truth labeling logs and worker-activity logs for existing customers.
- Neo compilation logs.
- Inference Recommender logs and metrics.

Out of scope:

- AWS Step Functions (`states.amazonaws.com`, EventBridge `aws.states`). A pipeline that starts a state machine does not make those events SageMaker.
- AWS Glue. Feature Store offline store can register a Glue table. Glue job logs and the Glue Data Catalog belong in a future Glue package.
- Amazon Athena. Offline feature queries and any Athena workgroup logs belong in a future Athena package.
- CloudTrail, including EventBridge events whose `detail-type` is `AWS API Call via CloudTrail`. The `aws` package already has that data stream.
- Amazon Bedrock invocation logs and `AWS/Bedrock` metrics. A SageMaker endpoint that calls Bedrock is still Bedrock telemetry and belongs in `aws_bedrock`.
- Training datasets, model artifacts (`model.tar.gz`), batch prediction files, and Debugger tensor binaries.
- HyperPod cluster logs and the HyperPod EventBridge detail-types, MLflow tracking-server events, SageMaker Canvas, and JumpStart. They are SageMaker-family surfaces, but they were not in the assigned workload list and each has its own operational model. Confirm before folding them into v1. The events reference lists them, so a match-all `aws.sagemaker` rule would include them if someone forwards the whole bus.

## IAM permissions

Collector identity, not the SageMaker execution role. Scope resources to the log group ARNs, metric namespaces, and buckets the package is configured to read.

| Action                                                                                      | Why                                                                                                                                                                               | Doc                                                                                                                                                |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `logs:DescribeLogGroups`                                                                    | Discover groups, including the per-endpoint prefix.                                                                                                                               | https://www.elastic.co/docs/reference/integrations/aws and https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/permissions-reference-cwl.html |
| `logs:FilterLogEvents`                                                                      | The `aws-cloudwatch` input reads events with this API.                                                                                                                            | Same Elastic page. Bedrock docs name the API: https://www.elastic.co/docs/reference/integrations/aws_bedrock                                       |
| `logs:DescribeLogStreams`                                                                   | Needed when a stream prefix filter is used. [UNVERIFIED] whether every `aws-cloudwatch` code path calls it; include it when `log_stream_prefix` is set.                           | https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_DescribeLogStreams.html                                                   |
| `cloudwatch:ListMetrics`                                                                    | Discover series before `GetMetricData`.                                                                                                                                           | https://www.elastic.co/docs/reference/integrations/aws                                                                                             |
| `cloudwatch:GetMetricData`                                                                  | Metric collection.                                                                                                                                                                | https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/permissions-reference-cw.html                                                       |
| `s3:GetBucketLocation`                                                                      | Required by the `aws` package for S3 inputs.                                                                                                                                      | https://www.elastic.co/docs/reference/integrations/aws                                                                                             |
| `s3:ListBucket`                                                                             | Discover capture and report objects when not using SQS.                                                                                                                           | https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectsV2.html                                                                             |
| `s3:GetObject`                                                                              | Read JSONL and violation reports.                                                                                                                                                 | https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html                                                                                 |
| `sqs:ReceiveMessage`, `sqs:DeleteMessage`, `sqs:ChangeMessageVisibility`, `sqs:GetQueueUrl` | Only if S3 event notifications are used. The `aws` package already documents the SQS actions for S3 inputs.                                                                       | https://www.elastic.co/docs/reference/integrations/aws                                                                                             |
| `sts:AssumeRole`                                                                            | Cross-account. Called with the monitoring account's credentials. The SageMaker account role trust policy must allow the monitoring principal and should require `sts:ExternalId`. | https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRole.html                                                                            |

The SageMaker job role still needs `logs:CreateLogGroup`, `logs:CreateLogStream`, and `logs:PutLogEvents` if a customer uses a custom role that does not include the AWS-managed SageMaker policy. Service-linked jobs create the groups listed above without an extra collector permission.

Do not grant the collector `sagemaker:InvokeEndpoint` or S3 read on the training-data bucket.

## Vendor setup

1. Run the workload in a known region. Logs and metrics stay in that region. The agent `region_name` must match. Regional availability: https://docs.aws.amazon.com/general/latest/gr/sagemaker.html
2. Container logs appear without a logging toggle. Optionally set retention on each group so a new agent with `start_position: beginning` does not replay the indefinite default. https://docs.aws.amazon.com/sagemaker/latest/dg/logging-cloudwatch.html
3. Training custom metrics: put `MetricDefinitions` on `AlgorithmSpecification` (name plus regex, max 40). Built-in algorithms already define theirs. The algorithm must print a matching line. https://docs.aws.amazon.com/sagemaker/latest/dg/define-train-metrics.html and https://docs.aws.amazon.com/sagemaker/latest/APIReference/API_MetricDefinition.html
4. Endpoint data capture, only if the customer wants payload archive: `CreateEndpointConfig` `DataCaptureConfig` with `EnableCapture=true`, `InitialSamplingPercentage`, `DestinationS3Uri`, and `CaptureOptions` of `Input`, `Output`, or both. Same region as any Model Monitor schedule. https://docs.aws.amazon.com/sagemaker/latest/dg/model-monitor-data-capture-endpoint.html and https://docs.aws.amazon.com/sagemaker/latest/APIReference/API_DataCaptureConfig.html
5. Model Monitor, existing customers only: create a baseline, then `CreateMonitoringSchedule`. Set `emit_metrics` to `Enabled` in the constraints file or the `data-metric` namespace stays empty. https://docs.aws.amazon.com/sagemaker/latest/APIReference/API_CreateMonitoringSchedule.html
6. Enhanced endpoint dimensions: `EnableEnhancedMetrics=true` in `MetricsConfig`. This is separate from data capture.
7. Debugger: `DebuggerHookConfig` with an `S3OutputPath` and, for rule logs, a rule configuration. Rule stdout is a processing job. https://docs.aws.amazon.com/sagemaker/latest/dg/debugger-configure-hook.html
8. Clarify: run the Clarify processing job with an output S3 prefix. Logs are then in `/aws/sagemaker/ProcessingJobs` automatically.
9. Pipelines: no logging toggle. Execution metrics show up under `AWS/Sagemaker/ModelBuildingPipeline`. Step logs are the inner job's log stream.
10. Feature Store: create the feature group and call the runtime API. Metrics follow the calls. Do not enable Glue or Athena collection for the offline store in this package.
11. Create the collector IAM policy above. For cross-account, create the role in the SageMaker account and set `role_arn` plus `external_id` on the agent, which is the `aws` package Assume Role with External ID method. https://www.elastic.co/docs/reference/integrations/aws
12. Set `number_of_workers` to 1 for each single log group. For the `/aws/sagemaker/Endpoints` prefix, keep workers at or below 5 and `scan_frequency` at 5 minutes or slower when this account also runs other CloudWatch log inputs. Elastic documents that guidance because the quota is shared. https://www.elastic.co/docs/reference/integrations/aws/cloudwatch
13. Use `start_position: end` for the first install on accounts with long-lived endpoint groups.

## Rate limits and cost

`FilterLogEvents`, per account per Region, not adjustable. https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/cloudwatch_limits_cwl.html

| Region class                                                                    | FilterLogEvents |
| ------------------------------------------------------------------------------- | --------------- |
| `us-east-1`                                                                     | 25 TPS          |
| `ap-northeast-3`, `ap-southeast-3`, `ca-west-1`, `eu-central-1`, `il-central-1` | 5 TPS           |
| Every other supported Region                                                    | 10 TPS          |

`GetLogEvents` is a different quota (10, 25, or 30 TPS depending on Region) and is not the API the Elastic input uses.

Elastic's own CloudWatch page tells operators to assume about 5 TPS shared by every integration in that account and Region, with `number_of_workers` at most 5. That is stricter than the AWS quota in `us-east-1` and in the 10 TPS regions, and it matches the AWS quota in the 5 TPS regions. Follow Elastic's shared-budget guidance when the `aws` package is already tailing other groups. https://www.elastic.co/docs/reference/integrations/aws/cloudwatch

Each `FilterLogEvents` page is up to 1 MB or 10,000 events, per the Elastic AWS API table. https://www.elastic.co/docs/reference/integrations/aws

`GetMetricData`: 500 requests per second per Region (adjustable). Datapoint budgets are 180,000 per second for the last three hours and 396,000 per second for older data. https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/cloudwatch_limits.html

Price, from the CloudWatch pricing page. Numbers vary by Region; these are the published example rates. https://aws.amazon.com/cloudwatch/pricing/

- `GetMetricData` is $0.01 per 1,000 metrics requested. A metric request is up to five statistics for one metric. This API is excluded from the 1 million free CloudWatch API requests. Basic AWS service metrics are free to publish and are not free to read back through `GetMetricData`.
- SageMaker already pays CloudWatch Logs ingestion and storage for vended logs. The Elastic pull does not ingest them a second time at the CloudWatch ingestion rate. The pricing page does not list a per-GB scanned charge for `FilterLogEvents` (that charge is documented for Logs Insights). [UNVERIFIED] that no Region has added a FilterLogEvents data-scanned price; the documented constraint is the TPS quota.
- S3 `ListObjectsV2` plus `GetObject` on a capture bucket is the customer's S3 request bill. SQS notifications avoid the list.

High training verbosity and one log group per endpoint are what make the log quota the design limit, not `GetMetricData`.

## Deployment architecture

Run Elastic Agent in the SageMaker account, or in a monitoring account that `AssumeRole`s into it.

- In-account: instance or pod role with the policy above. No static keys. One agent can collect several regions by configuring one input per region. Log groups do not replicate across regions.
- Cross-account: the `aws` package `role_arn` + `external_id` path. Quotas and `GetMetricData` charges apply to the SageMaker account, because that is where the APIs run. The trust policy should restrict the principal and require the external id.
- Elastic-managed agentless deployments are an API pull from Elastic's cloud, aimed at low volume. The `aws` package has enabled agentless for some CloudWatch policy templates (changelog 6.20.0) and uses Cloud Connectors identity federation for agentless only. https://www.elastic.co/docs/reference/integrations/aws

Inference, not a measured SageMaker account: agentless is a poor fit for SageMaker container logs. Training jobs print continuously, one stream per instance, and a busy endpoint group is tailed forever. `FilterLogEvents` is 5 to 25 TPS for the whole account and Region and is not adjustable. A hosted poller sharing that budget with the customer's other CloudWatch consumers will lag or throttle. Endpoint collection multiplies calls by the number of endpoint log groups under the prefix. Metrics-only agentless is more plausible for a handful of long-lived endpoints, because `GetMetricData` batches hundreds of series per call, and it is a worse fit for per-host training series that exist only while a job runs. OTel Insights metrics are unavailable to either mode until a PromQL client exists.

Log parsing is also inference. EventBridge details, capture-file envelopes, `constraint_violations.json`, and Clarify `analysis.json` have documented JSON shapes. Training, processing, transform, endpoint, notebook, and Studio log lines do not.

## Gaps

- Feature Store and Ground Truth CloudWatch namespaces are not written on the official metrics page. Confirm with `ListMetrics` in a live account before hard-coding them.
- Built-in versus bring-your-own Model Monitor namespaces differ by a trailing `s` and by `Endpoints` versus `Endpoint`. A single metricset that assumes one name will miss the other.
- Processing-job `Host` dimensions use `algo-[n]` while processing log streams use `[hostname]-[epoch]`. Do not join them on the raw stream name without a rule.
- No official sample of Studio log _contents_. Stream naming is documented; the message format is whatever the app prints.
- HyperPod, MLflow tracking servers, Canvas, and JumpStart were not investigated beyond their EventBridge detail-types.
- SageMaker AI Insights PromQL metric names were not inventoried. Classic `GetMetricData` namespaces were.
- Async inference SNS notification payload was not pulled. The CloudWatch `data-log` stream is the log path.
- `logs:DescribeLogStreams` is not in the Elastic published minimum IAM list. Confirm against the `aws-cloudwatch` input before dropping it.
- Model Monitor and Ground Truth being closed to new customers means those data streams will be empty for new accounts even when the package offers them.
- Region coverage for every feature (serverless, inference components, HyperPod, Studio) was not enumerated. Collection is per Region either way.
