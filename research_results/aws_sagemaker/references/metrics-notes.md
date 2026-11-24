# Amazon SageMaker CloudWatch metrics

Primary page: [Amazon SageMaker AI metrics in Amazon CloudWatch](https://docs.aws.amazon.com/sagemaker/latest/dg/monitoring-cloudwatch.html) (fetched 2026-11-24).

Standard metrics are retained **15 months**. The console metric search only shows metrics updated in the **last 2 weeks**. Default publish period for the families below is **1 minute** unless a row says otherwise. `GetMetricStatistics` high-resolution note on the same page: 1-second metrics are kept **3 hours**. Debugger can profile training down to **100 ms** and store that in **S3**, which is not these CloudWatch metrics.

Namespace strings are case-sensitive. Two official spellings of "SageMaker" both occur.

## Namespace inventory

| Namespace                                              | What it contains                                                                                  | Period                                                                                                                                                                     | Opt-in                                                                                                                                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AWS/SageMaker`                                        | InvokeEndpoint request metrics (latency, errors, invocations) and multi-model load/unload metrics | 1 min. Invocation publish interval can be 10, 30, 60, 120, 180, 240, or 300 s via `MetricsConfig.MetricPublishFrequencyInSeconds` **only if** `EnableEnhancedMetrics=true` | Invocation metrics are default for real-time endpoints. Enhanced dimensions are opt-in. Async **does not** publish `Invocations`, `InvocationsPerInstance`, or `OverheadLatency`. |
| `/aws/sagemaker/Endpoints`                             | Instance CPU, memory, disk, GPU, reservations. Also multi-model `LoadedModelCount`                | 1 min. Instance-metric publish interval can be changed **without** `EnableEnhancedMetrics`                                                                                 | Default for hosted endpoints. `InstanceId` and `AcceleratorId` dimensions require enhanced metrics.                                                                               |
| `/aws/sagemaker/InferenceComponents`                   | Per-copy normalized CPU, memory, GPU                                                              | 1 min. Same publish-frequency rule as endpoint instance metrics                                                                                                            | Only endpoints that host inference components. Container/instance/GPU dimensions need enhanced metrics.                                                                           |
| `/aws/sagemaker/TrainingJobs`                          | Job instance utilization **and** algorithm metrics parsed from logs                               | Utilization: 1 min. Algorithm metrics: emitted when a log line matches (real time; not documented as a fixed period)                                                       | Utilization is default. Algorithm metrics require built-in definitions or `AlgorithmSpecification.MetricDefinitions` (max **40**, name 1–255, regex 1–500).                       |
| `/aws/sagemaker/ProcessingJobs`                        | Processing instance utilization                                                                   | 1 min                                                                                                                                                                      | Default for processing jobs.                                                                                                                                                      |
| `/aws/sagemaker/TransformJobs`                         | Transform instance utilization. **No `DiskUtilization`.**                                         | 1 min                                                                                                                                                                      | Default for batch transform.                                                                                                                                                      |
| `/aws/sagemaker/InferenceRecommendationsJobs`          | Recommender load-test client metrics                                                              | Not stated (other families are 1 min)                                                                                                                                      | When an Inference Recommender job runs.                                                                                                                                           |
| `AWS/Sagemaker/ModelBuildingPipeline`                  | Pipeline execution and step counts and duration. Note the lowercase **m** in `Sagemaker`.         | 1 min                                                                                                                                                                      | Default for pipeline executions.                                                                                                                                                  |
| `AWS/SageMaker/Workteam`                               | Private-workforce worker metrics                                                                  | Not restated on the workteam page                                                                                                                                          | After worker-activity tracking is permitted. **Not** for Augmented AI.                                                                                                            |
| `aws/sagemaker/Endpoints/data-metric`                  | Model Monitor per-feature data-quality stats                                                      | Per monitoring execution, not per invoke                                                                                                                                   | Schedule + `emit_metrics=Enabled` in the baseline constraints. Closed to new Model Monitor customers.                                                                             |
| `/aws/sagemaker/ModelMonitoring/data-metric`           | Same, for batch transform monitors                                                                | Same                                                                                                                                                                       | Same. Dimension is `MonitoringSchedule` (not `ScheduleName`).                                                                                                                     |
| `aws/sagemaker/Endpoints/model-metrics`                | Model quality (mae, f1, auc, …)                                                                   | Per monitoring execution                                                                                                                                                   | `enable_cloudwatch_metrics=True` on the schedule.                                                                                                                                 |
| `aws/sagemaker/ModelMonitoring/model-metrics`          | Same, batch transform                                                                             | Same                                                                                                                                                                       | Same.                                                                                                                                                                             |
| `aws/sagemaker/Endpoints/bias-metrics`                 | Clarify bias metrics `bias_metric_{shortname}`                                                    | Per bias monitor run                                                                                                                                                       | Publishing is on unless `publish_cloudwatch_metrics=Disabled`.                                                                                                                    |
| `aws/sagemaker/ModelMonitoring/bias-metrics`           | Same, batch transform                                                                             | Same                                                                                                                                                                       | Same.                                                                                                                                                                             |
| `aws/sagemaker/Endpoints/explainability-metrics`       | Global SHAP `feature_{name}` and `ExpectedValue`                                                  | Per explainability monitor run                                                                                                                                             | Off only if `publish_cloudwatch_metrics=Disabled`.                                                                                                                                |
| `aws/sagemaker/ModelMonitoring/explainability-metrics` | Same, batch transform                                                                             | Same                                                                                                                                                                       | Same.                                                                                                                                                                             |
| Feature Store                                          | Consumption and operation metrics listed below                                                    | "Specified time period" — exact period **[UNVERIFIED]**                                                                                                                    | Default for Feature Store runtime calls. **Namespace string is not on the metrics page. [UNVERIFIED]**                                                                            |
| Ground Truth labeling progress                         | Dataset-object and job status metrics                                                             | Not stated                                                                                                                                                                 | Default for labeling jobs. Namespace for the `LabelingJobName` dimension is **not named** on the metrics page. See the Ground Truth section.                                      |

Leading-slash and singular/plural drift is real in the docs, not a transcription choice:

- Data quality built-in page uses `/aws/sagemaker/Endpoints/data-metric` (singular `metric`, **with** a leading slash) and dimensions `EndpointName`, `ScheduleName`.
- BYOC page uses `/aws/sagemaker/Endpoint/data-metrics` (singular `Endpoint`, plural `metrics`) and tells you to set dimensions `Endpoint` and `MonitoringSchedule`.
- Bias, model-quality, and explainability pages omit the leading slash: `aws/sagemaker/Endpoints/bias-metrics`.

Do not normalize these to one string until a live `ListMetrics` check. The built-in data-quality page is the one to prefer for the prebuilt container.

Grafana's CloudWatch namespace catalog (third party, not AWS) lists `AWS/SageMaker/LabelingJobs` for the Ground Truth metric names and does **not** list a Feature Store namespace. That catalog is corroboration only. Official text for workers is `AWS/SageMaker/Workteam`.

## High-value metrics for an observability integration

Ship these first. Units are the documented ones.

| Signal                                                        | Namespace                                        | Metric                                                      | Unit                        | Statistic          | Dimensions                                                   |
| ------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------- | --------------------------- | ------------------ | ------------------------------------------------------------ |
| Request volume                                                | `AWS/SageMaker`                                  | `Invocations`                                               | None                        | Sum                | `EndpointName`, `VariantName`                                |
| Client errors                                                 | `AWS/SageMaker`                                  | `Invocation4XXErrors`                                       | None                        | Sum (also Average) | `EndpointName`, `VariantName`                                |
| Server errors                                                 | `AWS/SageMaker`                                  | `Invocation5XXErrors`                                       | None                        | Sum                | `EndpointName`, `VariantName`                                |
| Any model failure (4xx, 5xx, socket, malformed HTTP, timeout) | `AWS/SageMaker`                                  | `InvocationModelErrors`                                     | None                        | Sum                | `EndpointName`, `VariantName`                                |
| Model time, includes container round-trip                     | `AWS/SageMaker`                                  | `ModelLatency`                                              | **Microseconds**            | Average, p99, Max  | `EndpointName`, `VariantName`                                |
| Platform overhead                                             | `AWS/SageMaker`                                  | `OverheadLatency`                                           | Microseconds                | Average, Max       | `EndpointName`, `VariantName`                                |
| Serverless cold start                                         | `AWS/SageMaker`                                  | `ModelSetupTime`                                            | Microseconds                | Average, Max       | `EndpointName`, `VariantName`                                |
| Async queue depth                                             | `AWS/SageMaker`                                  | `ApproximateBacklogSize`                                    | Count                       | Average, Max       | `EndpointName` only                                          |
| Async oldest request                                          | `AWS/SageMaker`                                  | `ApproximateAgeOfOldestRequest`                             | Seconds                     | Max                | `EndpointName`                                               |
| Async scale-from-zero                                         | `AWS/SageMaker`                                  | `HasBacklogWithoutCapacity`                                 | Count                       | Average            | `EndpointName` (1 = backlog and zero instances)              |
| Async failures                                                | `AWS/SageMaker`                                  | `InvocationFailures`                                        | Count                       | Sum                | `EndpointName`, `VariantName`                                |
| CPU                                                           | `/aws/sagemaker/Endpoints` or `.../TrainingJobs` | `CPUUtilization`                                            | Percent                     | Average            | Endpoints: `EndpointName`, `VariantName`. Jobs: `Host`       |
| Memory                                                        | same                                             | `MemoryUtilization`                                         | Percent                     | Average            | same                                                         |
| Disk                                                          | same                                             | `DiskUtilization`                                           | Percent                     | Average            | Endpoints and training/processing. **Absent for transform.** |
| GPU                                                           | same                                             | `GPUUtilization`, `GPUMemoryUtilization`                    | Percent                     | Average            | same                                                         |
| Training loss / error                                         | `/aws/sagemaker/TrainingJobs`                    | User or built-in name (`train:error`, `validation:rmse`, …) | The regex capture, numeric  | Average            | `TrainingJobName`                                            |
| Pipeline failures                                             | `AWS/Sagemaker/ModelBuildingPipeline`            | `ExecutionFailed`, `StepFailed`                             | Count                       | Sum                | `PipelineName` or `PipelineName`+`StepName`                  |
| Pipeline duration                                             | same                                             | `ExecutionDuration`, `StepDuration`                         | Milliseconds                | Average, Max       | same                                                         |
| Feature Store errors                                          | **[UNVERIFIED namespace]**                       | `Operation5XXErrors`, `ThrottledRequests`, `Latency`        | Latency is **microseconds** | Sum / Average      | `FeatureGroupName`, `OperationName`                          |

`ModelLatency` is not end-to-end client time. The docs split latency into network (outside these metrics), `OverheadLatency`, and `ModelLatency`. `ModelLatency` includes local send/receive around the container plus inference inside it.

Per-variant `CPUUtilization` / `GPUUtilization` are **sums across cores or GPUs**, so four CPUs can report 0–400%. Inference-component metrics `CPUUtilizationNormalized` and `GPUUtilizationNormalized` are 0–100%.

## `AWS/SageMaker` — endpoint invocation metrics

From calls to `InvokeEndpoint`.

| Metric                       | Unit          | Valid statistics                                  | Notes                                                                                                 |
| ---------------------------- | ------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `Invocations`                | None          | Sum                                               | Count of `InvokeEndpoint` requests.                                                                   |
| `InvocationsPerInstance`     | None          | Sum                                               | Each request contributes `1/numberOfInstances`.                                                       |
| `InvocationsPerCopy`         | None          | Sum                                               | Inference components. Normalized by copy count.                                                       |
| `Invocation4XXErrors`        | None          | Average, Sum                                      | 1 on 4xx, else 0.                                                                                     |
| `Invocation5XXErrors`        | None          | Average, Sum                                      | 1 on 5xx, else 0.                                                                                     |
| `InvocationModelErrors`      | None          | Average, Sum                                      | Not 2xx, plus socket errors, malformed HTTP, timeouts.                                                |
| `ModelLatency`               | Microseconds  | Average, Sum, Min, Max, Sample Count, Percentiles |                                                                                                       |
| `OverheadLatency`            | Microseconds  | Average, Sum, Min, Max, Sample Count              | Receive-to-response minus `ModelLatency`.                                                             |
| `ModelSetupTime`             | Microseconds  | Average, Min, Max, Sample Count, Percentiles      | Serverless compute launch.                                                                            |
| `ConcurrentRequestsPerModel` | (none stated) | Min, Max                                          |                                                                                                       |
| `ConcurrentRequestsPerCopy`  | (none stated) | Min, Max                                          | Inference components.                                                                                 |
| `MidStreamErrors`            | None          | Average, Sum                                      | Errors after the first streamed byte.                                                                 |
| `FirstChunkLatency`          | Microseconds  | Average, Sum, Min, Max, Sample Count, Percentiles | Bidirectional streaming.                                                                              |
| `FirstChunkModelLatency`     | Microseconds  | Average, Sum, Min, Max, Sample Count, Percentiles | Bidirectional streaming.                                                                              |
| `FirstChunkOverheadLatency`  | Microseconds  | Average, Sum, Min, Max, Sample Count, Percentile  | Docs say "Percentile" singular on this row only. Equals `FirstChunkLatency - FirstChunkModelLatency`. |

Dimensions:

| Dimension set                                 | When                                             |
| --------------------------------------------- | ------------------------------------------------ |
| `EndpointName`, `VariantName`                 | Production variant. Primary key for integration. |
| `EndpointName`, `VariantName`, `InstanceType` | Variants that use instance pools.                |
| `InferenceComponentName`                      | Inference-component invocation metrics.          |
| `InstanceId`                                  | `EnableEnhancedMetrics=true`.                    |
| `ContainerId`                                 | Inference components only, and enhanced metrics. |

### Async-only metrics (same namespace)

Source: [async inference monitoring](https://docs.aws.amazon.com/sagemaker/latest/dg/async-inference-monitor.html).

Not published for async endpoints: `OverheadLatency`, `Invocations`, `InvocationsPerInstance`. The page says the list of common metrics that **are** published is `Invocation4XXErrors`, `Invocation5XXErrors`, `ModelLatency`, and that anything not listed is not published.

`EndpointName` only:

| Metric                              | Unit    | Statistics        |
| ----------------------------------- | ------- | ----------------- |
| `ApproximateBacklogSize`            | Count   | Average, Max, Min |
| `ApproximateBacklogSizePerInstance` | Count   | Average, Max, Min |
| `ApproximateAgeOfOldestRequest`     | Seconds | Average, Max, Min |
| `HasBacklogWithoutCapacity`         | Count   | Average           |

`EndpointName` + `VariantName`:

| Metric                    | Unit         | Statistics                           |
| ------------------------- | ------------ | ------------------------------------ |
| `RequestDownloadFailures` | Count        | Sum                                  |
| `ResponseUploadFailures`  | Count        | Sum                                  |
| `NotificationFailures`    | Count        | Sum                                  |
| `RequestDownloadLatency`  | Microseconds | Average, Sum, Min, Max, Sample Count |
| `ResponseUploadLatency`   | Microseconds | Average, Sum, Min, Max, Sample Count |
| `ExpiredRequests`         | Count        | Sum                                  |
| `InvocationFailures`      | Count        | Sum                                  |
| `InvocationsProcesssed`   | Count        | Sum                                  |
| `TimeInBacklog`           | Milliseconds | Average, Sum, Min, Max, Sample Count |
| `TotalProcessingTime`     | Milliseconds | Average, Sum, Min, Max, Sample Count |

`InvocationsProcesssed` is the spelling on the AWS page (double s). `TimeInBacklog` excludes download, upload, and model latency. `TotalProcessingTime` includes backlog, upload, and notification.

### Serverless (same `AWS/SageMaker` namespace)

Source: [serverless endpoint monitoring](https://docs.aws.amazon.com/sagemaker/latest/dg/serverless-endpoints-monitoring.html).

The serverless page names `Invocations4XXErrors` and `Invocations5XXErrors` (plural "Invocations"). The canonical invocation table names `Invocation4XXErrors` and `Invocation5XXErrors`. **Treat the canonical table as the metric name** and flag the serverless page as inconsistent. It also says serverless can use `Invocations`, `ModelLatency`, `ModelSetupTime`, and `MemoryUtilization`. `OverheadLatency` on serverless includes cold start; provisioned concurrency makes that overhead smaller.

| Metric                                                 | Applies                               | Unit  | Statistics        |
| ------------------------------------------------------ | ------------------------------------- | ----- | ----------------- |
| `ServerlessConcurrentExecutionsUtilization`            | On-demand and provisioned concurrency | None  | Average, Max, Min |
| `ServerlessProvisionedConcurrencyExecutions`           | Provisioned concurrency               | Count | Average, Max, Min |
| `ServerlessProvisionedConcurrencyUtilization`          | Provisioned concurrency               | None  | Average, Max, Min |
| `ServerlessProvisionedConcurrencyInvocations`          | Provisioned concurrency               | Count | Average, Max, Min |
| `ServerlessProvisionedConcurrencySpilloverInvocations` | Provisioned concurrency               | Count | Average, Max, Min |

Dimension sets for the serverless-specific metrics are **not** stated on that page. **[UNVERIFIED]** Assume `EndpointName` + `VariantName` only as an inference from other invocation metrics.

### Multi-model loading metrics (`AWS/SageMaker`)

1-minute. Dimension: `EndpointName`, `VariantName`.

| Metric                 | Unit         | Statistics                           | Docs spelling                                                        |
| ---------------------- | ------------ | ------------------------------------ | -------------------------------------------------------------------- |
| `ModelLoadingWaitTime` | Microseconds | Average, Sum, Min, Max, Sample Count | Page shows a trailing space in the name cell. Use the unspaced name. |
| `ModelUnloadingTime`   | Microseconds | Average, Sum, Min, Max, Sample Count | Same trailing-space caveat.                                          |
| `ModelDownloadingTime` | Microseconds | Average, Sum, Min, Max, Sample Count |                                                                      |
| `ModelLoadingTime`     | Microseconds | Average, Sum, Min, Max, Sample Count | Trailing-space caveat.                                               |
| `ModelCacheHit`        | None         | Average, Sum, Sample Count           | Average is the hit ratio.                                            |

`LoadedModelCount` is in **`/aws/sagemaker/Endpoints`**, not `AWS/SageMaker`. Unit None. Statistics Average, Sum, Min, Max, Sample Count. Emitted per instance. Sum is models loaded across instances (not distinct models). Dimension `EndpointName`, `VariantName`.

### Multi-container direct invocation

Source: [multi-container metrics](https://docs.aws.amazon.com/sagemaker/latest/dg/multi-container-metrics.html).

Per-container invocation metrics use namespace `AWS/SageMaker` and dimensions `EndpointName`, `VariantName`, `ContainerName`. Names called out: `Invocations` (Sum, Sample Count, unit None) and `ContainerLatency` (microseconds; Average, Sum, Min, Max, Sample Count). `ContainerLatency` is the target container's time as viewed by SageMaker (send, fetch, inference). The page also places an overhead latency on the same dimension set. CPU and memory for this mode are in `aws/sagemaker/Endpoints` (the page's casing, no leading slash in that sentence).

## `/aws/sagemaker/Endpoints` — instance metrics

| Metric                           | Unit    | Range note                                                                                               | Who gets it               |
| -------------------------------- | ------- | -------------------------------------------------------------------------------------------------------- | ------------------------- |
| `CPUUtilization`                 | Percent | Sum of cores, 0–100 each, so N cores → 0–N×100. Variant value sums primary and supplementary containers. | Endpoint variants         |
| `CPUUtilizationNormalized`       | Percent | 0–100                                                                                                    | Inference components only |
| `CPUReservation`                 | Percent | 0–100. From `NumberOfCpuCoresRequired`.                                                                  | Inference components only |
| `MemoryUtilization`              | Percent | 0–100                                                                                                    | Variants                  |
| `MemoryReservation`              | Percent | 0–100. From `MinMemoryRequiredInMb`.                                                                     | Inference components only |
| `DiskUtilization`                | Percent | 0–100                                                                                                    | Variants                  |
| `GPUUtilization`                 | Percent | 0–100 per GPU, summed                                                                                    | Variants                  |
| `GPUUtilizationNormalized`       | Percent | 0–100                                                                                                    | Inference components only |
| `GPUMemoryUtilization`           | Percent | Summed across GPUs                                                                                       | Variants                  |
| `GPUMemoryUtilizationNormalized` | Percent | 0–100                                                                                                    | Inference components only |
| `GPUReservation`                 | Percent | 0–100. From `NumberOfAcceleratorDevicesRequired`.                                                        | Inference components only |

Dimensions: `EndpointName`+`VariantName`; `EndpointName`+`VariantName`+`InstanceType` (instance pools); `InstanceId` (enhanced); `AcceleratorId` (GPU metrics, enhanced).

`/aws/sagemaker/InferenceComponents` repeats the normalized CPU, memory, GPU, and GPU-memory metrics per copy. If a reservation is set, utilization is over the reservation; otherwise over the limit. Dimensions: `InferenceComponentName`; plus `InstanceType`; plus enhanced `InstanceId`, `ContainerId`, `AcceleratorId`.

## Job utilization — Training, Processing, Transform

Namespaces: `/aws/sagemaker/ProcessingJobs`, `/aws/sagemaker/TrainingJobs`, `/aws/sagemaker/TransformJobs`.

| Metric                 | Unit    | Transform | Meaning                                                                                                                                            |
| ---------------------- | ------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CPUUtilization`       | Percent | Yes       | Sum of cores for the processing, algorithm, or transform container. Multi-instance jobs emit per instance; the default console view averages them. |
| `MemoryUtilization`    | Percent | Yes       | Container memory on the instance.                                                                                                                  |
| `DiskUtilization`      | Percent | **No**    | Processing container or algorithm container.                                                                                                       |
| `GPUUtilization`       | Percent | Yes       | Summed across GPUs.                                                                                                                                |
| `GPUMemoryUtilization` | Percent | Yes       | Summed across GPUs.                                                                                                                                |

Dimension `Host` only:

| Namespace                       | `Host` value                                              |
| ------------------------------- | --------------------------------------------------------- |
| `/aws/sagemaker/ProcessingJobs` | `[processing-job-name]/algo-[instance-number-in-cluster]` |
| `/aws/sagemaker/TrainingJobs`   | `[training-job-name]/algo-[instance-number-in-cluster]`   |
| `/aws/sagemaker/TransformJobs`  | `[transform-job-name]/[instance-id]`                      |

The `Host` value does **not** include the `[epoch_timestamp]` suffix that log streams have. An older inference-pipeline page also describes endpoint `Host` as `[endpoint-name]/[variant]/[instance-id]` inside `/aws/sagemaker/Endpoints`. The current monitoring chapter instead uses `EndpointName` + `VariantName` (+ `InstanceId` when enhanced). Prefer the current chapter for endpoints.

## Custom and built-in training metrics

Same namespace as utilization: `/aws/sagemaker/TrainingJobs`.

Console path ([View training job metrics](https://docs.aws.amazon.com/sagemaker/latest/dg/view-train-metrics.html)): Metrics → `/aws/sagemaker/TrainingJobs` → dimension **`TrainingJobName`** → metric name.

| Kind               | How it is defined                                                               | Metric name                                                                                                               | Dimension                                                                                   |
| ------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| System utilization | Always, no regex                                                                | `CPUUtilization`, `MemoryUtilization`, `DiskUtilization`, `GPUUtilization`, `GPUMemoryUtilization`                        | `Host`                                                                                      |
| Built-in algorithm | Predefined by the algorithm. Also used as HPO objectives.                       | Example XGBoost names: `validation:rmse`, `validation:mae`, `validation:logloss`, `validation:auc`, `validation:error`, … | `TrainingJobName` (console procedure). Whether `Host` is also attached is **[UNVERIFIED]**. |
| Your container     | `MetricDefinitions`: `{ "Name": "train:error", "Regex": "Train_error=(.*?);" }` | Whatever `Name` you set. The regex's first capture group is the value.                                                    | `TrainingJobName`                                                                           |

Final-iteration values are also on `DescribeTrainingJob` (`FinalMetricDataList`), which is an API, not CloudWatch.

`MetricDefinitions` is optional on `CreateTrainingJob`, maximum 40. HPO reads the same regexes from stdout/stderr.

## Inference Recommender

Namespace `/aws/sagemaker/InferenceRecommendationsJobs`.

| Metric                   | Unit                                | Statistics                                        | Dimensions                |
| ------------------------ | ----------------------------------- | ------------------------------------------------- | ------------------------- |
| `ClientInvocations`      | None                                | Sum                                               | `JobName`, `EndpointName` |
| `ClientInvocationErrors` | None                                | Sum                                               | same                      |
| `ClientLatency`          | **Milliseconds** (not microseconds) | Average, Sum, Min, Max, Sample Count, Percentiles | same                      |
| `NumberOfUsers`          | None                                | Max, Min, Average                                 | same                      |

`ClientLatency` is the recommender's client-observed `InvokeEndpoint` time. Do not graph it on the same axis as `ModelLatency`.

## Pipelines

Namespace **`AWS/Sagemaker/ModelBuildingPipeline`** (lowercase m).

Execution metrics. Dimension `PipelineName` filters to one pipeline; with no dimension the page describes account-wide counts.

| Metric               | Unit         | Statistics                           |
| -------------------- | ------------ | ------------------------------------ |
| `ExecutionStarted`   | Count        | Average, Sum                         |
| `ExecutionFailed`    | Count        | Average, Sum                         |
| `ExecutionSucceeded` | Count        | Average, Sum                         |
| `ExecutionStopped`   | Count        | Average, Sum                         |
| `ExecutionDuration`  | Milliseconds | Average, Sum, Min, Max, Sample Count |

Step metrics. Dimensions `PipelineName`, `StepName`.

| Metric          | Unit         | Statistics                           |
| --------------- | ------------ | ------------------------------------ |
| `StepStarted`   | Count        | Average, Sum                         |
| `StepFailed`    | Count        | Average, Sum                         |
| `StepSucceeded` | Count        | Average, Sum                         |
| `StepStopped`   | Count        | Average, Sum                         |
| `StepDuration`  | Milliseconds | Average, Sum, Min, Max, Sample Count |

Feature Processor pipelines use these same pipeline metrics. They do not add a Feature Store pipeline namespace.

## Ground Truth

Worker metrics, namespace **`AWS/SageMaker/Workteam`** ([Track worker performance](https://docs.aws.amazon.com/sagemaker/latest/dg/workteam-private-tracking.html)). The page says to open that namespace and that "Workteam and Workforce" metrics support average time per submitted task for a labeling job. It does **not** list dimension **keys**. Do not invent `WorkteamName` / `WorkforceName` key strings. **[UNVERIFIED]** exact dimension names.

Dataset and job metrics are documented on the main metrics page **without a namespace**. The only dimension the main page names is `LabelingJobName`, and it labels that table "Dimensions for dataset object metrics" (so it may not apply to `TasksSubmitted` / `ActiveWorkers`).

| Metric                         | Unit    | Statistics        | When                                                                                 |
| ------------------------------ | ------- | ----------------- | ------------------------------------------------------------------------------------ |
| `ActiveWorkers`                | None    | Sum, Sample Count | One private worker submitted, released, or declined a task. Best-effort delivery.    |
| `TasksAccepted`                | None    | Sum, Sample Count | Best-effort. The prose says `TaskAccepted` once; the metric name is `TasksAccepted`. |
| `TasksDeclined`                | None    | Sum, Sample Count | Best-effort.                                                                         |
| `TasksReturned`                | None    | Sum, Sample Count | Best-effort.                                                                         |
| `TasksSubmitted`               | None    | Sum, Sample Count | Private worker completed a task. Best-effort.                                        |
| `TimeSpent`                    | Seconds | Sum, Sample Count | Excludes pause and break. Best-effort.                                               |
| `DatasetObjectsAutoAnnotated`  | None    | Max               | Only if automated labeling is on.                                                    |
| `DatasetObjectsHumanAnnotated` | None    | Max               |                                                                                      |
| `DatasetObjectsLabelingFailed` | None    | Max               |                                                                                      |
| `TotalDatasetObjectsLabeled`   | None    | Max               |                                                                                      |
| `JobsFailed`                   | None    | Sum, Sample Count | One failed job emits one.                                                            |
| `JobsSucceeded`                | None    | Sum, Sample Count |                                                                                      |
| `JobsStopped`                  | None    | Sum, Sample Count |                                                                                      |

`LabelingJobName` filters the dataset-object count metrics. Whether job-status metrics (`JobsFailed`, …) use that dimension or none is not stated.

## Feature Store

Metrics and dimensions are documented. The namespace string is **not**. Do not guess `AWS/SageMaker/FeatureStore` in a pipeline until `ListMetrics` confirms it. **[UNVERIFIED]**

Consumption. Dimensions `FeatureGroupName`, `OperationName`. Unit None. Statistics: All.

| Metric                       | Emitted when              |
| ---------------------------- | ------------------------- |
| `ConsumedReadRequestsUnits`  | On-demand throughput mode |
| `ConsumedWriteRequestsUnits` | On-demand                 |
| `ConsumedReadCapacityUnits`  | Provisioned mode          |
| `ConsumedWriteCapacityUnits` | Provisioned mode          |

On-demand is the default throughput mode ([Throughput modes](https://docs.aws.amazon.com/sagemaker/latest/dg/feature-store-throughput-mode.html)).

Operations:

| Metric               | Unit         | Statistics                                        | Dimensions                                                                                                                                            |
| -------------------- | ------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Invocations`        | None         | Sum                                               | `FeatureGroupName`+`OperationName` for GetRecord, PutRecord, DeleteRecord, ListRecords. `OperationName` only for BatchGetRecord and BatchWriteRecord. |
| `Operation4XXErrors` | None         | Average, Sum                                      | same split                                                                                                                                            |
| `Operation5XXErrors` | None         | Average, Sum                                      | same                                                                                                                                                  |
| `ThrottledRequests`  | None         | Average, Sum                                      | same                                                                                                                                                  |
| `Latency`            | Microseconds | Average, Sum, Min, Max, Sample Count, Percentiles | same. Receive-to-response inside Feature Store.                                                                                                       |

A 2022 what's-new post says online-store storage size is also tracked. The current metrics tables do **not** name that metric. **[UNVERIFIED]** metric name (do not assume `OnlineStoreTotalSize`).

## Model Monitor and Clarify metrics (opt-in, S3 reports are separate)

Model Monitor and Clarify are closed to new customers.

### Data quality

[CloudWatch metrics](https://docs.aws.amazon.com/sagemaker/latest/dg/model-monitor-interpreting-cloudwatch.html). Emitted when `emit_metrics` is `Enabled` in the baseline constraints file.

| Namespace                                    | Dimensions                     |
| -------------------------------------------- | ------------------------------ |
| `/aws/sagemaker/Endpoints/data-metric`       | `EndpointName`, `ScheduleName` |
| `/aws/sagemaker/ModelMonitoring/data-metric` | `MonitoringSchedule`           |

| Metric name                             | Statistic to query                  | Meaning                                              |
| --------------------------------------- | ----------------------------------- | ---------------------------------------------------- |
| `feature_data_{feature_name}`           | Max, Min, Sum, SampleCount, Average | Numerical columns only. One metric name, five stats. |
| `feature_non_null_{feature_name}`       | Sum                                 | Completeness. Numeric and string columns.            |
| `feature_baseline_drift_{feature_name}` | Sum                                 | Baseline drift. Numeric and string columns.          |

BYOC containers write `/opt/ml/output/metrics/cloudwatch` JSON (PutMetricData-like). The file must not set `Namespace`; SageMaker fills `/aws/sagemaker/Endpoint/data-metrics` or `/aws/sagemaker/ModelMonitoring/data-metrics`. Recommended dimensions in that file are `Endpoint` + `MonitoringSchedule` (different key names from the built-in `EndpointName` / `ScheduleName`).

### Model quality

Namespaces `aws/sagemaker/Endpoints/model-metrics` and `aws/sagemaker/ModelMonitoring/model-metrics`. Requires `enable_cloudwatch_metrics=True`.

The page shows the **S3/report JSON keys**, not a separate CloudWatch metric-name table. Those keys are the metrics to expect:

- Regression: `mae`, `mse`, `rmse`, `r2` (each has `value` and `standard_deviation` in the report).
- Binary: `recall`, `precision`, `accuracy`, `auc`, `f1`, `f0_5`, `f2`, `true_positive_rate`, `true_negative_rate`, `false_positive_rate`, `false_negative_rate`, plus `*_best_constant_classifier` variants.
- Multiclass: `accuracy`, `weighted_recall`, `weighted_precision`, `weighted_f0_5`, `weighted_f1`, `weighted_f2`, plus `*_best_constant_classifier`.

Standard deviation is computed only with at least 200 samples (five draws of 80%). How each key is spelled as a CloudWatch `MetricName` (flat `f1` vs nested `binary_classification_metrics/f1`) is **[UNVERIFIED]** — the page says "for a list of the metrics that are emitted, see the previous sections" and those sections are the JSON report, not `MetricName` strings. Dimensions are **not** listed on the model-quality page.

### Bias

[Bias drift CloudWatch metrics](https://docs.aws.amazon.com/sagemaker/latest/dg/clarify-model-monitor-bias-drift-cw.html).

| Namespace                                    |
| -------------------------------------------- |
| `aws/sagemaker/Endpoints/bias-metrics`       |
| `aws/sagemaker/ModelMonitoring/bias-metrics` |

Metric name: `bias_metric` + short name. Example: `bias_metric_CI` (class imbalance). ±infinity is published as the float `±2.348543e108`. Nulls and errors are not published.

Properties (documented as metric properties; treat as dimensions until proven otherwise): `Endpoint` (if any), `MonitoringSchedule`, `BiasStage` (`Pre-training` or `Post-Training`), `Label`, `LabelValue`, `Facet`, `FacetValue`.

### Explainability

[Feature drift CloudWatch metrics](https://docs.aws.amazon.com/sagemaker/latest/dg/clarify-feature-attribute-drift-cw.html).

| Namespace                                              |
| ------------------------------------------------------ |
| `aws/sagemaker/Endpoints/explainability-metrics`       |
| `aws/sagemaker/ModelMonitoring/explainability-metrics` |

| Metric                   | Meaning                                            |
| ------------------------ | -------------------------------------------------- |
| `feature_{feature_name}` | Global SHAP for that feature. Example `feature_X`. |
| `ExpectedValue`          | Expected value of the model output.                |

Properties: `Endpoint`, `MonitoringSchedule`, `ExplainabilityMethod` (`KernelShap`), `Label` (from `label_headers`, or a placeholder like `label0`), `ValueType` (`GlobalShapValues` or `ExpectedValue`).

Clarify also writes `analysis.json` to the processing-job S3 output. That file is not a CloudWatch metric. See `s3-and-eventbridge-records.md`.

## Gaps

- Feature Store **namespace string** is undocumented on the metrics page.
- Ground Truth dataset-metric **namespace** is undocumented. Worker metrics are `AWS/SageMaker/Workteam`. Whether dataset metrics share that namespace or `AWS/SageMaker/LabelingJobs` (Grafana only) is **[UNVERIFIED]**.
- Worker-metric **dimension key names** are undocumented.
- Model-quality CloudWatch **metric name spelling and dimensions** are undocumented; only the report JSON keys and the namespace are documented.
- Serverless-specific metric **dimensions**, and the `Invocation4XXErrors` vs `Invocations4XXErrors` naming conflict.
- Custom training metric **period** and whether `Host` is attached beside `TrainingJobName`.
- Online-store **storage-size** metric name.
- Inference Recommender metric period.
