# SageMaker S3 records and EventBridge events

These are not CloudWatch Logs. They matter for the same ingest integration because Model Monitor, data capture, and job state changes do not show up in `/aws/sagemaker/*` log groups.

## Endpoint data capture (JSONL in S3)

Off until you set `DataCaptureConfig` on `CreateEndpointConfig` (or the SDK equivalent). You do **not** need a Model Monitor schedule to capture. Capture is asynchronous and does not sit on the invoke path. It stops when instance disk usage is high; AWS recommends staying under 75% disk.

| API field                      | Behavior                                                                                           |
| ------------------------------ | -------------------------------------------------------------------------------------------------- |
| `EnableCapture`                | Required in spirit. API description: defaults to enabled **when the config object is present**.    |
| `InitialSamplingPercentage`    | 0–100, required in the API. SDK default if omitted is **20**.                                      |
| `DestinationS3Uri`             | Required in the API. SDK default if omitted is `s3://{default-bucket}/model-monitor/data-capture`. |
| `CaptureOptions[].CaptureMode` | `Input`, `Output`, or both. SDK uses `REQUEST` / `RESPONSE`.                                       |
| `CaptureContentTypeHeader`     | Optional. If you do not list headers, SageMaker **base64-encodes** captured payloads.              |

Path ([Capture data from a real-time endpoint](https://docs.aws.amazon.com/sagemaker/latest/dg/model-monitor-data-capture-endpoint.html)):

```
s3://{DestinationS3Uri}/{endpoint-name}/{variant-name}/yyyy/mm/dd/hh/{filename}.jsonl
```

The docs render the bucket as `s3:///{endpoint-name}/...` because the placeholder was stripped. The FAQ states the same layout under the destination you configured. Files are hourly. Delivery can lag a couple of minutes. The destination must be in the same Region as a Model Monitor schedule if you use one.

Format: **JSON Lines**. One inference per line. Top-level keys from the published sample:

| Field                                            | Contents                                                                     |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| `captureData.endpointInput.observedContentType`  | Example `text/csv`                                                           |
| `captureData.endpointInput.mode`                 | `INPUT`                                                                      |
| `captureData.endpointInput.data`                 | Raw payload. CSV sample includes a trailing `\n`.                            |
| `captureData.endpointInput.encoding`             | `CSV` in the sample. `BASE64` when content type is not declared for capture. |
| `captureData.endpointOutput.observedContentType` | Example `text/csv; charset=utf-8`                                            |
| `captureData.endpointOutput.mode`                | `OUTPUT`                                                                     |
| `captureData.endpointOutput.data`                | Response body.                                                               |
| `captureData.endpointOutput.encoding`            | `CSV` in the sample.                                                         |
| `eventMetadata.eventId`                          | UUID. The doc sample uses `aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`.            |
| `eventMetadata.inferenceTime`                    | UTC `2022-02-14T17:25:49Z`                                                   |
| `eventVersion`                                   | `"0"`                                                                        |

`inferenceId` is **not** in the published real-time sample. Do not add it unless a later capture config documents it.

Sample: `sample-events/endpoint-data-capture.jsonl` (shortened from the AWS CSV sample, anonymized).

### Batch transform capture is different

[Capture data from a batch transform job](https://docs.aws.amazon.com/sagemaker/latest/dg/model-monitor-data-capture-batch.html). Opt-in `DataCaptureConfig` on `CreateTransformJob`:

| Field                 | Required | Notes                                                                                        |
| --------------------- | -------- | -------------------------------------------------------------------------------------------- |
| `DestinationS3Uri`    | Yes      |                                                                                              |
| `GenerateInferenceId` | No       | Appends inference id and time onto output so model-quality monitoring can join ground truth. |
| `KmsKeyId`            | No       |                                                                                              |

This does **not** write the endpoint `captureData` JSONL. It writes **manifests** of S3 object locations:

```
s3://{DestinationS3Uri}/input
s3://{DestinationS3Uri}/output
```

Each manifest is a JSON array (the doc calls it JSONL, but the published example is one JSON array):

```json
[{ "prefix": "s3://example-bucket/input/" }, "batch_0.csv", "batch_1.csv"]
```

The output manifest lists `batch_0.csv.out` and so on. The actual records stay in the transform input and output objects.

## Model Monitor violation JSON (S3)

A monitoring schedule launches a **processing job**. Container logs go to `/aws/sagemaker/ProcessingJobs`. The violation report goes to the schedule's `output_s3_uri`.

The execution's output destination is the prefix to list. The docs do not publish a fixed `{yyyy}/{mm}/{dd}/{hh}` template; the SDK/console may add a time partition. **[UNVERIFIED]** exact key under the destination, beyond the file name.

| File                          | When                                                                                                                                                                                                                                                                 |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `statistics.json`             | Data-quality monitoring only. Column stats.                                                                                                                                                                                                                          |
| `constraint_violations.json`  | Current data vs baseline constraints. This is the violations report the interpreting-results page reads (`violations` array).                                                                                                                                        |
| `constraints.json`            | Baseline constraints, not the per-run violations.                                                                                                                                                                                                                    |
| `constraints_violations.json` | Spelling on the [BYOC outputs](https://docs.aws.amazon.com/sagemaker/latest/dg/model-monitor-byoc-contract-outputs.html) table (extra **s**). The prebuilt report name on the interpreting-results page is `constraint_violations.json`. Accept both if you scan S3. |

Violation schema ([Schema for violations](https://docs.aws.amazon.com/sagemaker/latest/dg/model-monitor-interpreting-violations.html)):

```json
{
  "violations": [
    {
      "feature_name": "string",
      "constraint_check_type": "data_type_check | completeness_check | baseline_drift_check | missing_column_check | extra_column_check | categorical_values_check",
      "description": "string"
    }
  ]
}
```

| `constraint_check_type`    | Meaning                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| `data_type_check`          | Inferred type differs from baseline. Threshold: `monitoring_config.datatype_check_threshold`.   |
| `completeness_check`       | Non-null percent crosses the per-feature completeness threshold.                                |
| `baseline_drift_check`     | Distribution distance above `monitoring_config.comparison_threshold`.                           |
| `missing_column_check`     | Fewer columns than baseline.                                                                    |
| `extra_column_check`       | More columns than baseline.                                                                     |
| `categorical_values_check` | More unknown categories than baseline. Threshold: `monitoring_config.domain_content_threshold`. |

Tabular data only. `statistics.json` is not created for every monitor type (the page says data quality only).

Statistics schema (abbreviated from [statistics.json schema](https://docs.aws.amazon.com/sagemaker/latest/dg/model-monitor-byoc-statistics.html)): top-level `version` (example `0`), `dataset.item_count`, and `features[]` with `name`, `inferred_type` (`Fractional`, `Integral`, or `String`), `numerical_statistics` or `string_statistics`. Numerical stats include `common.num_present`, `common.num_missing`, `mean`, `sum`, `std_dev`, `min`, `max`, and a KLL `distribution`. Default histogram is **10 buckets** and is not configurable. String stats include `distinct_count` and categorical buckets `{value, count}`.

Samples: `sample-events/constraint-violations.json`, `sample-events/statistics.json`.

CloudWatch metrics from the same run are a second channel (`/aws/sagemaker/Endpoints/data-metric` and the model/bias/explainability namespaces). See `metrics-notes.md`.

## Clarify `analysis.json` (S3)

[Analysis results](https://docs.aws.amazon.com/sagemaker/latest/dg/clarify-processing-job-analysis-results.html). Written to the Clarify processing job output prefix, next to `report.ipynb`. Optional `explanations_shap/out.csv` when local SHAP values are saved.

`analysis.json` sections:

- `pre_training_bias_metrics` — `label`, `label_value_or_threshold`, `facets` keyed by facet `name_or_index`. Each facet has `value_or_threshold` and `metrics[]` of `{name, description, value, error?}`. `name` is the short code (`CI`). `value` is a number, JSON null, or the strings `∞` / `-∞`.
- `post_training_bias_metrics` — same shape.
- `explanations` — feature importance / SHAP. Asymmetric Shapley locations are S3 URIs recorded in this section.

This file is not the bias CloudWatch metric stream. Bias monitors publish `bias_metric_{name}` separately.

## EventBridge (not CloudWatch Logs)

Source `aws.sagemaker`. Delivery is best effort. SageMaker may emit **more than one event per state change**. Page: [Events that SageMaker sends to EventBridge](https://docs.aws.amazon.com/sagemaker/latest/dg/automating-sagemaker-with-eventbridge.html).

Envelope fields on every sample: `version` (`"0"`), `id`, `detail-type`, `source`, `account`, `time` (ISO-8601), `region`, `resources` (ARN array), `detail`.

### Training job state change

|                                   |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `detail-type`                     | `SageMaker Training Job State Change`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `resources[0]`                    | `arn:aws:sagemaker:{region}:{account}:training-job/{name}`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `detail.TrainingJobStatus`        | Sample value `Completed`. `FailureReason` is present when status is `Failed`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `detail.SecondaryStatus`          | Sample `Completed`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `detail.TrainingJobName`          | In the published sample this is a UUID, while `resources` and `TrainingJobArn` use `kmeans-1`. The doc sample is internally inconsistent. Do not join only on one of them.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Other detail fields in the sample | `TrainingJobArn`, `HyperParameters`, `AlgorithmSpecification.TrainingImage`, `AlgorithmSpecification.TrainingInputMode`, `RoleArn`, `InputDataConfig[]` (`ChannelName`, `DataSource.S3DataSource.S3Uri`, `ContentType`, `CompressionType`, `RecordWrapperType`), `OutputDataConfig.S3OutputPath`, `ResourceConfig` (`InstanceType`, `InstanceCount`, `VolumeSizeInGB`), `VpcConfig`, `StoppingCondition.MaxRuntimeInSeconds`, `CreationTime`, `TrainingStartTime`, `TrainingEndTime`, `LastModifiedTime` (these four are **millisecond epoch strings** in the sample, e.g. `"1583831889050"`), `SecondaryStatusTransitions`, `Tags`. |

Sample: `sample-events/eventbridge-training-job-state-change.json`.

### Other detail-types on the same page

| `detail-type`                                                    | Detail fields worth indexing                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SageMaker Processing Job State Change`                          | `ProcessingJobName`, `ProcessingJobStatus`, `ProcessingJobArn`, `FailureReason` if `Failed`, `AppSpecification.ImageUri`, `ProcessingInputs`, `ProcessingOutputConfig`, time fields as **millisecond numbers** in the failed-job sample (`ProcessingEndTime`: `1704320746000`). The published sample uses account `037210630506`; treat account ids in examples as documentation artifacts. |
| `SageMaker Transform Job State Change`                           | `TransformJobName`, `TransformJobArn`, `TransformJobStatus`, `FailureReason`, `ModelName`, `MaxConcurrentTransforms`, `MaxPayloadInMB`, `BatchStrategy`, `Environment`, `TransformInput`, `TransformOutput`.                                                                                                                                                                                |
| `SageMaker Model Building Pipeline Execution Status Change`      | `pipelineArn`, `pipelineExecutionArn`, `pipelineExecutionDisplayName`, `currentPipelineExecutionStatus`, `previousPipelineExecutionStatus` (`Executing`, `Succeeded`, `Failed`, `Stopping`, `Stopped`), `executionStartTime`, `executionEndTime` (ISO-8601, unlike training-job epochs), `pipelineExecutionDescription`.                                                                    |
| `SageMaker Model Building Pipeline Execution Step Status Change` | `stepName`, `stepType` (sample `Processing`), `currentStepStatus`, `previousStepStatus` (`Starting`, `Executing`, `Succeeded`, `Failed`, `Stopping`, `Stopped`), `stepStartTime`, `stepEndTime`, `metadata.processingJob.arn` (or the job type that ran), `failureReason` when failed, `cacheHitResult` on a cache hit.                                                                     |
| `SageMaker Endpoint State Change`                                | Endpoint status. Separate from deployment state.                                                                                                                                                                                                                                                                                                                                            |
| `SageMaker Endpoint Deployment State Change`                     | Deployment status. The page includes two examples.                                                                                                                                                                                                                                                                                                                                          |
| `SageMaker Feature Group State Change`                           | Feature group status. Not Feature Store runtime metrics.                                                                                                                                                                                                                                                                                                                                    |
| `SageMaker HyperParameter Tuning Job State Change`               | Tuning job status.                                                                                                                                                                                                                                                                                                                                                                          |
| `SageMaker Job State Change`                                     | Reinforcement fine-tuning. `JobCategory` `AgentRFT` or `AgentRFTEvaluation`. ARN `arn:aws:sagemaker:{region}:{account}:job/{category}/{job-name}`. `FailureReason` when `JobStatus` is `Failed`.                                                                                                                                                                                            |
| `SageMaker Model State Change`                                   | Model status.                                                                                                                                                                                                                                                                                                                                                                               |
| `SageMaker Model Package State Change`                           |                                                                                                                                                                                                                                                                                                                                                                                             |
| `SageMaker Model Card State Change`                              |                                                                                                                                                                                                                                                                                                                                                                                             |
| `SageMaker Image State Change`                                   |                                                                                                                                                                                                                                                                                                                                                                                             |
| `SageMaker Image Version State Change`                           |                                                                                                                                                                                                                                                                                                                                                                                             |
| `SageMaker HyperPod Cluster Event`                               | Out of scope for a SageMaker-jobs ingest mapping except to ignore it.                                                                                                                                                                                                                                                                                                                       |
| `SageMaker HyperPod Cluster Node Health Event`                   | Same.                                                                                                                                                                                                                                                                                                                                                                                       |
| `SageMaker HyperPod Cluster State Change`                        | Same.                                                                                                                                                                                                                                                                                                                                                                                       |

Pipeline execution sample: `sample-events/eventbridge-pipeline-execution.json`.

Ground Truth labeling status (`Completed`, `Failed`, `Stopped`) and worker task actions are described as **CloudWatch Events** rules on [Monitor labeling job status](https://docs.aws.amazon.com/sagemaker/latest/dg/sms-monitor-cloud-watch.html). That page does not include a `detail-type` or JSON body. **[UNVERIFIED]** whether those still arrive on the default EventBridge bus as `aws.sagemaker` events. The worker-activity CloudWatch log is the documented payload for task completion.

## Gaps

- Real-time capture record does not document `customAttributes`, `inferenceId`, or JSON/base64 variants beyond the CSV sample and the base64-by-default rule.
- Monitoring-report S3 time partition is not specified; list the execution output prefix.
- `constraint_violations.json` vs `constraints_violations.json`.
- EventBridge training sample mixes epoch-as-string timestamps with a name mismatch between ARN and `TrainingJobName`.
- Processing-job EventBridge timestamps are epoch millis as numbers; pipeline events use ISO-8601. Do not use one parser for every `detail-type`.
- Ground Truth EventBridge detail JSON was not on the automating-with-EventBridge page.
