# Amazon SageMaker structured records — field schema

Research date: 2026-11-24. Scope is structured SageMaker records only (EventBridge `source` `aws.sagemaker`, S3 data-capture and Model Monitor JSON, CloudWatch `GetMetricData`, and Describe\* API snapshots). Step Functions, Glue, and Athena are out of scope.

Training, processing, transform, and endpoint **container logs have no stable field schema**. See the last section.

## Counts

| Group                         | With a published field schema                                                                                                                                                                                            | Names only (no `detail` body)                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| EventBridge detail-types      | **17** bodies on the SageMaker events guide. The model-package sample is invalid JSON as published (repaired in the samples). `SageMaker Job State Change` is one of the 17 and is **not** on the EventBridge name list. | **41** of the 58 EventBridge-ref names have no published `detail`. `SageMaker Model State Change` has a rule pattern only. |
| S3 JSON records               | **6** (endpoint data capture, ground-truth label, data-quality violations, data-quality constraints, bias-drift violations, attribution-drift violations)                                                                | Model-quality `constraint_violations.json` is not given a schema on the violations page                                    |
| Semi-structured batch capture | Manifest JSON array, plus CSV/JSONL rows that gain `SageMakerInferenceId` and `SageMakerInferenceTime`                                                                                                                   | Not the `captureData` envelope                                                                                             |
| API snapshots (not logs)      | DescribeTrainingJob, DescribeProcessingJob, DescribeTransformJob, DescribeEndpoint                                                                                                                                       | —                                                                                                                          |
| Metrics (not a log)           | CloudWatch `GetMetricData` → `MetricDataResult`                                                                                                                                                                          | Response does not echo dimensions                                                                                          |

Highest-value records for an observability pipeline, in order:

1. **Training, processing, and transform job state changes** — status plus conditional `FailureReason`. Low volume, high signal.
2. **Endpoint state change and endpoint deployment state change** — `Failed`, `RollingBack`, `UPDATING` / `IN_SERVICE`. Low volume.
3. **Pipeline execution and step status changes** — `currentStepStatus` `Failed` adds `failureReason`. Low to medium volume.
4. **CloudWatch `GetMetricData` points** for `AWS/SageMaker` invocations (`Invocations`, `ModelLatency`, `Invocation4XXErrors`, `Invocation5XXErrors`) and `/aws/sagemaker/TrainingJobs|ProcessingJobs|TransformJobs|Endpoints` resource metrics. Steady 1-minute series.
5. **Endpoint data-capture JSONL** — one object per sampled `InvokeEndpoint`. Highest volume by far. ML payload, not an ops log.
6. **Model Monitor `constraint_violations.json`** — one small file per monitoring hour. Model Monitor is closed to new customers.
7. **HyperPod node health** — only if the account uses HyperPod clusters.

## Sources

- Event names: [Amazon SageMaker AI events (EventBridge)](https://docs.aws.amazon.com/eventbridge/latest/ref/events-ref-sagemaker.html)
- Detail examples: [Events that SageMaker sends to EventBridge](https://docs.aws.amazon.com/sagemaker/latest/dg/automating-sagemaker-with-eventbridge.html)
- HyperPod detail-type table: [HyperPod cluster events reference](https://docs.aws.amazon.com/sagemaker/latest/dg/sagemaker-hyperpod-cluster-events-reference.html)
- Data capture: [real-time endpoint](https://docs.aws.amazon.com/sagemaker/latest/dg/model-monitor-data-capture-endpoint.html), [preprocessing record class](https://docs.aws.amazon.com/sagemaker/latest/dg/model-monitor-pre-and-post-processing.html), [batch transform](https://docs.aws.amazon.com/sagemaker/latest/dg/model-monitor-data-capture-batch.html), [ground truth merge](https://docs.aws.amazon.com/sagemaker/latest/dg/model-monitor-model-quality-merge.html)
- Monitor files: [violations](https://docs.aws.amazon.com/sagemaker/latest/dg/model-monitor-interpreting-violations.html), [constraints](https://docs.aws.amazon.com/sagemaker/latest/dg/model-monitor-byoc-constraints.html), [statistics](https://docs.aws.amazon.com/sagemaker/latest/dg/model-monitor-byoc-statistics.html), [bias drift](https://docs.aws.amazon.com/sagemaker/latest/dg/clarify-model-monitor-bias-drift-violations.html), [attribution drift](https://docs.aws.amazon.com/sagemaker/latest/dg/clarify-model-monitor-model-attribution-drift-violations.html), [model quality metrics](https://docs.aws.amazon.com/sagemaker/latest/dg/model-monitor-model-quality-metrics.html)
- Metrics: [SageMaker metrics in CloudWatch](https://docs.aws.amazon.com/sagemaker/latest/dg/monitoring-cloudwatch.html), [GetMetricData](https://docs.aws.amazon.com/AmazonCloudWatch/latest/APIReference/API_GetMetricData.html), [MetricDataResult](https://docs.aws.amazon.com/AmazonCloudWatch/latest/APIReference/API_MetricDataResult.html)
- API shapes and enums: botocore `sagemaker/2017-07-24/service-2.json` (protocol `json`, `jsonVersion` `1.1`), saved at `temp/schema-files/sagemaker-service-2.json`. Enum dump: `temp/schema-files/status-enums.json`. Human pages: [DescribeTrainingJob](https://docs.aws.amazon.com/sagemaker/latest/APIReference/API_DescribeTrainingJob.html), [DescribeProcessingJob](https://docs.aws.amazon.com/sagemaker/latest/APIReference/API_DescribeProcessingJob.html), [DescribeTransformJob](https://docs.aws.amazon.com/sagemaker/latest/APIReference/API_DescribeTransformJob.html), [DescribeEndpoint](https://docs.aws.amazon.com/sagemaker/latest/APIReference/API_DescribeEndpoint.html)
- Feature Store: [offline store format](https://docs.aws.amazon.com/sagemaker/latest/dg/feature-store-offline.html), [CloudTrail](https://docs.aws.amazon.com/sagemaker/latest/dg/feature-store-logging-using-cloudtrail.html), [GetRecord](https://docs.aws.amazon.com/sagemaker/latest/APIReference/API_feature_store_GetRecord.html)

SageMaker may send **more than one EventBridge event per state change**. Delivery of service events is best effort.

## Event type catalog

Volume figures are engineering estimates, not AWS quotas. "Low" means a handful of events per job or deployment. "High" means one record per invocation or per minute per dimension set.

### EventBridge — published `detail`

| detail-type                                                      | Where                                                                                                    | Volume                   | Priority                                  | Status field                                       |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------- | -------------------------------------------------- |
| `SageMaker Training Job State Change`                            | EventBridge                                                                                              | Low                      | High                                      | `detail.TrainingJobStatus`                         |
| `SageMaker Processing Job State Change`                          | EventBridge                                                                                              | Low                      | High                                      | `detail.ProcessingJobStatus`                       |
| `SageMaker Transform Job State Change`                           | EventBridge                                                                                              | Low                      | High                                      | `detail.TransformJobStatus`                        |
| `SageMaker HyperParameter Tuning Job State Change`               | EventBridge                                                                                              | Low                      | Medium                                    | `detail.HyperParameterTuningJobStatus`             |
| `SageMaker Endpoint State Change`                                | EventBridge                                                                                              | Low                      | High                                      | `detail.EndpointStatus`                            |
| `SageMaker Endpoint Deployment State Change`                     | EventBridge                                                                                              | Low                      | High                                      | `detail.EndpointStatus` plus `VariantStatus`       |
| `SageMaker Model Building Pipeline Execution Status Change`      | EventBridge                                                                                              | Low–medium               | High                                      | `detail.currentPipelineExecutionStatus`            |
| `SageMaker Model Building Pipeline Execution Step Status Change` | EventBridge                                                                                              | Low–medium               | High                                      | `detail.currentStepStatus`                         |
| `SageMaker Feature Group State Change`                           | EventBridge                                                                                              | Rare                     | Low                                       | `detail.FeatureGroupStatus`                        |
| `SageMaker Model Package State Change`                           | EventBridge                                                                                              | Low                      | Medium                                    | `detail.ModelPackageStatus`, `ModelApprovalStatus` |
| `SageMaker Model Card State Change`                              | EventBridge                                                                                              | Rare                     | Low                                       | `detail.ModelCardStatus`                           |
| `SageMaker Image State Change`                                   | EventBridge                                                                                              | Rare                     | Low                                       | `detail.ImageStatus`                               |
| `SageMaker Image Version State Change`                           | EventBridge                                                                                              | Rare                     | Low                                       | `detail.ImageVersionStatus`                        |
| `SageMaker Job State Change`                                     | EventBridge. On the SageMaker guide only (RFT). **Not** in the EventBridge name list fetched 2026-11-24. | Low                      | Medium                                    | `detail.JobStatus`                                 |
| `SageMaker HyperPod Cluster State Change`                        | EventBridge                                                                                              | Low                      | Medium (high if HyperPod is the platform) | `detail.ClusterStatus`                             |
| `SageMaker HyperPod Cluster Event`                               | EventBridge                                                                                              | Medium on large clusters | Medium                                    | nested `EventDetails`                              |
| `SageMaker HyperPod Cluster Node Health Event`                   | EventBridge                                                                                              | Medium                   | High if HyperPod                          | `detail.HealthSummary.HealthStatus`                |

`SageMaker Model State Change` is documented only as a **rule pattern** (`source`, `detail-type`, `Resources`). AWS does not publish a `detail` object. The state changes when a model is created or deleted.

### EventBridge — name only (no published `detail`)

These 41 names are on the [events reference](https://docs.aws.amazon.com/eventbridge/latest/ref/events-ref-sagemaker.html) and have no field example in the SageMaker events guide:

- `SageMaker Endpoint Config State Change`
- `SageMaker Notebook Instance State Change`
- `SageMaker Notebook Lifecycle Config State Change`
- `SageMaker Algorithm State Change`
- `SageMaker Model Card Export Job State Change`
- `SageMaker Monitoring Schedule State Change`
- `SageMaker A2I HumanLoop Status Change`
- `SageMaker Human Loop Finished`
- `SageMaker Human Loop Step Execution Finished`
- `SageMaker Human Task Accepted`, `Created`, `Declined`, `Expired`, `Returned`, `Submitted`
- `SageMaker Ground Truth Labeling Job State Change`
- `SageMaker Ground Truth Labeling Job Task Status Change`
- `SageMaker Evaluation Job Status Change`
- 18 tracking-server names: `SageMaker Tracking Server` + `Creating`, `Created`, `Create Failed`, `Updating`, `Updated`, `Update Failed`, `Deleting`, `Deleted`, `Delete Failed`, `Starting`, `Started`, `Start Failed`, `Stopping`, `Stopped`, `Stop Failed`, `Maintenance In Progress`, `Maintenance Complete`, `Maintenance Failed`
- 5 MLflow names: `SageMaker MLFlow Tracking Server Creating Run`, `Creating RegisteredModel`, `Creating ModelVersion`, `Transitioning ModelVersion Stage`, `Setting Registered Model Alias`

API enums that likely correspond, but are **not** confirmed as the event payload: `NotebookInstanceStatus`, `AlgorithmStatus`, `LabelingJobStatus`, `TrackingServerStatus`, `ModelCardExportJobStatus`, `ScheduleStatus` (`Pending | Failed | Scheduled | Stopped`). Do not invent `detail` keys for these.

### S3 and API records

| Record                                                  | Where                                                                                 | Volume                                        | Priority                                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Endpoint data capture JSONL                             | `s3://{DestinationS3Uri}/{endpoint}/{variant}/yyyy/mm/dd/hh/*.jsonl`                  | High (sampled by `InitialSamplingPercentage`) | High for ML quality, low for infra paging                                                             |
| Ground-truth JSONL                                      | Same `yyyy/mm/dd/hh` layout, caller-uploaded                                          | Medium                                        | Medium (joins to capture on id)                                                                       |
| Data-quality `constraint_violations.json`               | Monitoring execution output. Blog example folder `.../reports/yyyyMMddHH-yyyyMMddHH/` | Low (one file per execution)                  | High for data drift                                                                                   |
| `constraints.json`, `statistics.json`                   | Baseline and each data-quality execution                                              | Low                                           | Medium (baseline, not an alert)                                                                       |
| Bias `constraint_violations.json`                       | Clarify bias execution output                                                         | Low                                           | Medium                                                                                                |
| Attribution `constraint_violations.json`                | Clarify explainability execution output                                               | Low                                           | Medium                                                                                                |
| Batch capture manifest                                  | `{DestinationS3Uri}/input/` and `/output/` + `yyyy/mm/dd/hh`                          | Low–medium                                    | Low                                                                                                   |
| Batch output row with inference id                      | Transform output objects, not the capture envelope                                    | Medium                                        | Medium for model-quality join                                                                         |
| `GetMetricData` `MetricDataResult`                      | CloudWatch API, not a log stream                                                      | High                                          | High                                                                                                  |
| DescribeTrainingJob / Processing / Transform / Endpoint | Poll response. Not a log.                                                             | Depends on poller                             | Medium. EventBridge already carries status. Useful for `ModelArtifacts` and fields the event omitted. |

CloudTrail is a second EventBridge path, not a SageMaker-specific schema: `detail-type` `AWS API Call via CloudTrail`, `source` `aws.sagemaker`, `detail.eventSource` `sagemaker.amazonaws.com`. That is the standard CloudTrail event (it is where `sourceIPAddress` and `userIdentity` live).

## Common fields vs type-specific fields

### EventBridge envelope (every service event)

| Field         | Type     | Notes                                                                                                                                                             |
| ------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `version`     | string   | Always `"0"` in examples                                                                                                                                          |
| `id`          | string   | Event id                                                                                                                                                          |
| `detail-type` | string   | Table above. Exact spelling, including `HyperParameter` and `MLFlow`                                                                                              |
| `source`      | string   | `aws.sagemaker`                                                                                                                                                   |
| `account`     | string   | 12-digit account                                                                                                                                                  |
| `time`        | string   | EventBridge spec is ISO 8601. **The endpoint state-change example sets `time` to the string `"1583831889050"`.** Treat that as a documented sample, not the spec. |
| `region`      | string   |                                                                                                                                                                   |
| `resources`   | string[] | SageMaker ARNs. Pipeline events include both the pipeline ARN and the execution ARN.                                                                              |
| `detail`      | object   | Type-specific. Casing is **not** consistent. Job events use PascalCase. Pipeline events use camelCase.                                                            |

There is no common `detail` schema. Do not assume `JobName` exists on every event.

### Shared job-event keys (training, processing, transform, tuning, RFT job)

Present on the job examples, with different prefixes:

| Concept     | Training                                          | Processing                                 | Transform                                | Tuning                                 | RFT job                                           |
| ----------- | ------------------------------------------------- | ------------------------------------------ | ---------------------------------------- | -------------------------------------- | ------------------------------------------------- |
| Name        | `TrainingJobName`                                 | `ProcessingJobName`                        | `TransformJobName`                       | `HyperParameterTuningJobName`          | `JobName`                                         |
| ARN         | `TrainingJobArn`                                  | `ProcessingJobArn`                         | `TransformJobArn`                        | `HyperParameterTuningJobArn`           | `JobArn`                                          |
| Status      | `TrainingJobStatus`                               | `ProcessingJobStatus`                      | `TransformJobStatus`                     | `HyperParameterTuningJobStatus`        | `JobStatus`                                       |
| Failure     | `FailureReason` if `Failed`                       | `FailureReason` if `Failed`                | `FailureReason` if `Failed`              | not shown                              | `FailureReason` if `Failed`                       |
| Role        | `RoleArn`                                         | `RoleArn`                                  | —                                        | inside `TrainingJobDefinition.RoleArn` | `RoleArn`                                         |
| Created     | `CreationTime`                                    | `CreationTime`                             | `CreationTime`                           | `CreationTime`                         | `CreationTime`                                    |
| Start / end | `TrainingStartTime`, `TrainingEndTime`            | `ProcessingStartTime`, `ProcessingEndTime` | `TransformStartTime`, `TransformEndTime` | —                                      | —                                                 |
| Modified    | `LastModifiedTime`                                | `LastModifiedTime`                         | —                                        | `LastModifiedTime`                     | `LastModifiedTime`                                |
| Secondary   | `SecondaryStatus`, `SecondaryStatusTransitions[]` | —                                          | —                                        | —                                      | `SecondaryStatus`, `SecondaryStatusTransitions[]` |
| Tags        | `Tags` object                                     | not in the failed example                  | `Tags`                                   | `Tags`                                 | not in the example                                |

`SecondaryStatusTransitions[]` objects: `Status`, `StartTime`, `EndTime`, `StatusMessage`.

### Training `detail` (type-specific)

`HyperParameters` (map of strings), `AlgorithmSpecification` (`TrainingImage`, `TrainingInputMode`, and on the API also `MetricDefinitions`, `AlgorithmName`), `InputDataConfig[]` (`ChannelName`, `DataSource.S3DataSource.{S3DataType,S3Uri,S3DataDistributionType}`, `ContentType`, `CompressionType`, `RecordWrapperType`), `OutputDataConfig` (`KmsKeyId`, `S3OutputPath`), `ResourceConfig` (`InstanceType`, `InstanceCount`, `VolumeSizeInGB`, `VolumeKmsKeyId`), `VpcConfig`, `StoppingCondition.MaxRuntimeInSeconds`.

The EventBridge training example does **not** include `ModelArtifacts` or `FailureReason` (status in that example is `Completed`). `FailureReason` is documented as present when `TrainingJobStatus` is `Failed`. `ModelArtifacts.S3ModelArtifacts` is on `DescribeTrainingJob`, not in the published event example.

### Processing `detail` (type-specific)

`ProcessingInputs[]`, `ProcessingOutputConfig.Outputs[]` (`OutputName`, `S3Output.{S3Uri,LocalPath,S3UploadMode}`, optional `KmsKeyId`), `ProcessingResources.ClusterConfig.{InstanceCount,InstanceType,VolumeSizeInGB,VolumeKmsKeyId}`, `AppSpecification.ImageUri`, `NetworkConfig` (`EnableInterContainerTrafficEncryption`, `EnableNetworkIsolation`, `VpcConfig.{SecurityGroupIds,Subnets}`), `ExperimentConfig`, `StoppingCondition.MaxRuntimeInSeconds`.

### Transform `detail` (type-specific)

`ModelName`, `MaxConcurrentTransforms`, `MaxPayloadInMB`, `BatchStrategy`, `Environment`, `TransformInput` (`DataSource.S3DataSource`, `ContentType`, `CompressionType`, `SplitType`), `TransformOutput` (`S3OutputPath`, `Accept`, `AssembleWith`, `KmsKeyId`), `TransformResources.{InstanceType,InstanceCount}`.

### Endpoint `detail`

Both endpoint events: `EndpointName`, `EndpointArn`, `EndpointConfigName`, `ProductionVariants[]`, `EndpointStatus`, `CreationTime`, `LastModifiedTime`, `Tags`.

Deployment event adds `PendingDeploymentSummary` (`EndpointConfigName`, `StartTime`, `ProductionVariants[]`).

`ProductionVariants[]` in the deployment example: `VariantName`, `CurrentWeight`, `DesiredWeight`, `CurrentInstanceCount`, `DesiredInstanceCount`, optional `VariantStatus[]`.

`VariantStatus[]`: `Status`, `StatusMessage`, `StartTime`.

The plain endpoint-state example's variant objects only have `DesiredWeight` and `DesiredInstanceCount` (as floats). Variant fields are not stable across the two examples.

### Pipeline `detail` (camelCase)

Execution: `pipelineExecutionDisplayName`, `currentPipelineExecutionStatus`, `previousPipelineExecutionStatus`, `executionStartTime`, `executionEndTime`, `pipelineExecutionDescription`, `pipelineArn`, `pipelineExecutionArn`.

Step: `metadata` (example key `processingJob.arn`), `stepStartTime`, `stepEndTime`, `stepName`, `stepType` (example `Processing`), `previousStepStatus`, `currentStepStatus`, `pipelineArn`, `pipelineExecutionArn`.

Conditional, named but not given an object schema: `failureReason` when `currentStepStatus` is `Failed`; `cacheHitResult` on a cache hit.

### Other published `detail` objects

- **Feature group:** `FeatureGroupArn`, `FeatureGroupName`, `RecordIdentifierFeatureName`, `EventTimeFeatureName`, `FeatureDefinitions[]` (`FeatureName`, `FeatureType`), `CreationTime`, `OnlineStoreConfig.EnableOnlineStore`, `OfflineStoreConfig` (`S3StorageConfig.S3Uri`, `DisableGlueTableCreation`, `DataCatalogConfig.{TableName,Catalog,Database}`), `RoleArn`, `FeatureGroupStatus`, `Tags`.
- **Tuning:** `TrainingJobDefinition` (same shape as a training job spec), `TrainingJobStatusCounters` (`Completed`, `InProgress`, `RetryableError`, `NonRetryableError`, `Stopped`), `ObjectiveStatusCounters` (`Succeeded`, `Pending`, `Failed`).
- **Model package:** `ModelPackageGroupName`, `ModelPackageVersion`, `ModelPackageArn`, `CreationTime`, `InferenceSpecification.Containers[]` (`Image`, `ImageDigest`, `ModelDataUrl`), `SupportedContentTypes`, `SupportedResponseMIMETypes`, `ModelPackageStatus`, `ModelPackageStatusDetails.{ValidationStatuses,ImageScanStatuses}`, `CertifyForMarketplace`, `ModelApprovalStatus`, `MetadataProperties.GeneratedBy`, `ModelMetrics.ModelQuality.Statistics.{ContentType,S3Uri}`, `ModelLifeCycle.{Stage,StageStatus,StageDescription}`, `UpdatedModelPackageFields[]`, `LastModifiedTime`. The published sample is not valid JSON.
- **Model card:** `ModelCardName`, `ModelCardVersion`, `ModelCardStatus`, `ModelId`, `AccountId`, `CreationTime`, `LastModifiedTime`, `CreatedBy` and `LastModifiedBy` (`DomainId`, `UserProfileArn`, `UserProfileName`), `SecurityConfig`.
- **Image:** `ImageName`, `ImageArn`, `ImageStatus`, `Version`, `Tags`.
- **Image version:** `ImageArn`, `ImageVersionArn`, `ImageVersionStatus`, `Version`, `Tags`.
- **RFT job:** `JobCategory` (`AgentRFT` or `AgentRFTEvaluation` per the guide). Resource ARN `arn:aws:sagemaker:{region}:{account}:job/{category}/{job-name}`.
- **HyperPod cluster event:** `detail.EventDetails` then a nested `EventDetails` again. Outer: `EventId`, `ClusterArn`, `ClusterName`, `InstanceGroupName`, `InstanceId`, `ResourceType`, `EventTime`, `Description`, inner `EventDetails.EventMetadata`.
- **HyperPod node health:** `ClusterName`, `ClusterArn`, `InstanceId`, `Tags`, `HealthSummary.{HealthStatus,HealthStatusReason,RepairAction,Recommendation}`.
- **HyperPod cluster state:** `ClusterArn`, `ClusterName`, `ClusterStatus`, `CreationTime`, `FailureMessage`, `InstanceGroups[]` (counts, `InstanceType`, `Status`, `LifeCycleConfig`, `ExecutionRole`, `TrainingPlanArn`, `TrainingPlanStatus`, …), `NodeRecovery`, `Orchestrator.Eks.ClusterArn`, `VpcConfig`.

## Enums

Authoritative values are the SageMaker API model (`temp/schema-files/status-enums.json`). Several **published event examples do not match those enums**. Parsers should accept both the API value and the example literal.

| Enum                                     | API values                                                                                                                                                                                                                                                                      | Example mismatch                                                                                                                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TrainingJobStatus`                      | `InProgress`, `Completed`, `Failed`, `Stopping`, `Stopped`, `Deleting`                                                                                                                                                                                                          | —                                                                                                                                                                                                           |
| `SecondaryStatus`                        | `Starting`, `LaunchingMLInstances`, `PreparingTrainingStack`, `Downloading`, `DownloadingTrainingImage`, `Training`, `Uploading`, `Stopping`, `Stopped`, `MaxRuntimeExceeded`, `Completed`, `Failed`, `Interrupted`, `MaxWaitTimeExceeded`, `Updating`, `Restarting`, `Pending` | Docs say `LaunchingMLInstances`, `PreparingTrainingStack`, and `DownloadingTrainingImage` are no longer supported but they remain in the enum. "Valid values are subject to change."                        |
| `ProcessingJobStatus`                    | `InProgress`, `Completed`, `Failed`, `Stopping`, `Stopped`                                                                                                                                                                                                                      | —                                                                                                                                                                                                           |
| `TransformJobStatus`                     | `InProgress`, `Completed`, `Failed`, `Stopping`, `Stopped`                                                                                                                                                                                                                      | Published example uses the placeholder `"another status... GO"`.                                                                                                                                            |
| `EndpointStatus`                         | `OutOfService`, `Creating`, `Updating`, `SystemUpdating`, `RollingBack`, `InService`, `Deleting`, `Failed`, `UpdateRollbackFailed`                                                                                                                                              | Events use `IN_SERVICE` and `UPDATING`.                                                                                                                                                                     |
| `VariantStatus.Status`                   | `Creating`, `Updating`, `Deleting`, `ActivatingTraffic`, `Baking`                                                                                                                                                                                                               | Matches the deployment example.                                                                                                                                                                             |
| `HyperParameterTuningJobStatus`          | `Completed`, `InProgress`, `Failed`, `Stopped`, `Stopping`, `Deleting`, `DeleteFailed`                                                                                                                                                                                          | Published example uses the placeholder `"status"`.                                                                                                                                                          |
| `FeatureGroupStatus`                     | `Creating`, `Created`, `CreateFailed`, `Deleting`, `DeleteFailed`                                                                                                                                                                                                               | Event example sets `FeatureGroupStatus` to `Active`, which is an `OfflineStoreStatusValue` (`Active`, `Blocked`, `Disabled`), not a `FeatureGroupStatus`. The prose says the event fires for either status. |
| `PipelineExecutionStatus`                | `Executing`, `Stopping`, `Stopped`, `Failed`, `Succeeded`, `CompletedWithFailures`                                                                                                                                                                                              | The events guide lists only the first five. `CompletedWithFailures` is API-only in what was published.                                                                                                      |
| Step status (`StepStatus`)               | `Starting`, `Executing`, `Stopping`, `Stopped`, `Failed`, `Succeeded`                                                                                                                                                                                                           | Matches the events guide.                                                                                                                                                                                   |
| `ModelPackageStatus`                     | `Pending`, `InProgress`, `Completed`, `Failed`, `Deleting`                                                                                                                                                                                                                      | —                                                                                                                                                                                                           |
| `ModelApprovalStatus`                    | `Approved`, `Rejected`, `PendingManualApproval`                                                                                                                                                                                                                                 | —                                                                                                                                                                                                           |
| `ModelCardStatus`                        | `Draft`, `PendingReview`, `Approved`, `Archived`                                                                                                                                                                                                                                | —                                                                                                                                                                                                           |
| `ImageStatus`                            | `CREATING`, `CREATED`, `CREATE_FAILED`, `UPDATING`, `UPDATE_FAILED`, `DELETING`, `DELETE_FAILED`                                                                                                                                                                                | Event example uses `Creating`.                                                                                                                                                                              |
| `ImageVersionStatus`                     | `CREATING`, `CREATED`, `CREATE_FAILED`, `DELETING`, `DELETE_FAILED`                                                                                                                                                                                                             | Event example uses `Creating`.                                                                                                                                                                              |
| `ClusterStatus`                          | `Creating`, `Deleting`, `Failed`, `InService`, `RollingBack`, `SystemUpdating`, `Updating`                                                                                                                                                                                      | Example `InService` matches.                                                                                                                                                                                |
| `JobStatus` (RFT and other jobs)         | `InProgress`, `Completed`, `Failed`, `Stopping`, `Stopped`, `Deleting`, `DeleteFailed`                                                                                                                                                                                          | —                                                                                                                                                                                                           |
| `JobCategory`                            | `AgentRFT`, `SyntheticDataGeneration`, `DataQualityEvaluation`, `AgentRFTEvaluation`, `DataTransformation`                                                                                                                                                                      | Guide text only mentions the two `AgentRFT*` values.                                                                                                                                                        |
| `ScheduleStatus`                         | `Pending`, `Failed`, `Scheduled`, `Stopped`                                                                                                                                                                                                                                     | No event body published.                                                                                                                                                                                    |
| `ExecutionStatus` (monitoring execution) | `Pending`, `Completed`, `CompletedWithViolations`, `InProgress`, `Failed`, `Stopping`, `Stopped`                                                                                                                                                                                | This is the monitoring job, not an EventBridge enum.                                                                                                                                                        |
| `MonitoringType`                         | `DataQuality`, `ModelQuality`, `ModelBias`, `ModelExplainability`                                                                                                                                                                                                               | —                                                                                                                                                                                                           |
| `MonitoringProblemType` / `ProblemType`  | `BinaryClassification`, `MulticlassClassification`, `Regression`                                                                                                                                                                                                                | —                                                                                                                                                                                                           |
| `CaptureStatus`                          | `Started`, `Stopped`                                                                                                                                                                                                                                                            | On `DescribeEndpoint.DataCaptureConfig`, not on the capture record.                                                                                                                                         |
| `FeatureType`                            | `Integral`, `Fractional`, `String`                                                                                                                                                                                                                                              | Also `Unknown` in the constraints `inferred_type` sketch.                                                                                                                                                   |
| `TableFormat`                            | `Default`, `Glue`, `Iceberg`                                                                                                                                                                                                                                                    | Offline store.                                                                                                                                                                                              |
| `BatchStrategy`                          | `MultiRecord`, `SingleRecord`                                                                                                                                                                                                                                                   | —                                                                                                                                                                                                           |
| `TrainingInputMode`                      | `Pipe`, `File`, `FastFile`                                                                                                                                                                                                                                                      | —                                                                                                                                                                                                           |
| Objective counters                       | `Succeeded`, `Pending`, `Failed`                                                                                                                                                                                                                                                | `ObjectiveStatus` enum.                                                                                                                                                                                     |

### Model Monitor violation `constraint_check_type`

Data quality (`constraint_violations.json`, no `version` field in the published schema):

| Value                      | Meaning                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `data_type_check`          | Observed type disagrees with baseline `inferred_type` beyond `datatype_check_threshold` |
| `completeness_check`       | Non-null fraction misses the per-feature completeness threshold                         |
| `baseline_drift_check`     | Distribution distance above `comparison_threshold`                                      |
| `missing_column_check`     | Fewer columns than the baseline                                                         |
| `extra_column_check`       | More columns than the baseline                                                          |
| `categorical_values_check` | Unknown categorical values above `domain_content_threshold`                             |

Each data-quality violation object is only `feature_name`, `constraint_check_type`, `description`.

Bias file (`version` `"1.0"`): `constraint_check_type` `bias_drift_check` only. Fields: `facet`, `facet_value`, `metric_name` (short name such as `CI`, `DPPL`), `description`.

Attribution file (`version` `"1.0"`): `constraint_check_type` `feature_attribution_drift_check` only. Fields: `label`, `metric_name` (only `shap` is documented), `description`. There is no per-feature field; the check is nDCG of global SHAP values against threshold 0.9.

`monitoring_config` on `constraints.json`: `evaluate_constraints` and `emit_metrics` are `Enabled` or `Disabled`. The same page shows `comparison_method` as `Simple` or `Robust` in the schema sketch and as `linf_simple` or `linf_robust` in the prose. `categorical_drift_method` is `LInfinity` or `ChiSquared`. Treat the prose values as the ones the container documents in sentences, and accept the sketch values too.

## Timestamps and formats

There is **no single timestamp format** across SageMaker structured records.

| Location                                                                               | Format in the official material                                                                                                    | Example                                   |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| EventBridge envelope `time`                                                            | ISO 8601 UTC (`...Z`) on almost every example                                                                                      | `2018-10-06T12:26:13Z`                    |
| Endpoint state-change envelope `time`                                                  | Epoch milliseconds as a **string**                                                                                                 | `"1583831889050"`                         |
| Training and tuning `detail` times                                                     | Epoch milliseconds as a **string**                                                                                                 | `"CreationTime": "1583831889050"`         |
| Processing, feature group, endpoint, deployment, HyperPod `EventTime` / `CreationTime` | Epoch milliseconds as a **number** (sometimes a float)                                                                             | `1704320746000`, `1592411992203.0`        |
| Transform `detail` times                                                               | ISO 8601 strings                                                                                                                   | `2018-10-06T12:26:13Z`                    |
| Pipeline execution and step times                                                      | ISO 8601 strings                                                                                                                   | `2021-03-15T16:03:13Z`                    |
| RFT job `detail` times                                                                 | ISO 8601 strings                                                                                                                   | `2026-07-24T12:20:04Z`                    |
| Model card times                                                                       | ISO 8601, fractional seconds, up to nanoseconds                                                                                    | `2022-12-03T00:09:44.893854735Z`          |
| Model package times                                                                    | ISO 8601 strings                                                                                                                   | `2021-02-24T17:00:14Z`                    |
| Data capture `eventMetadata.inferenceTime`                                             | ISO 8601 UTC                                                                                                                       | `2022-02-14T17:25:49Z`                    |
| Batch `SageMakerInferenceTime`                                                         | ISO 8601 UTC (transform job start, not per-row time)                                                                               | `2022-08-30T00:49:15Z`                    |
| `Describe*` JSON 1.1 wire                                                              | Unix epoch **seconds**, number. Botocore `timestampFormat` is unset; JSON 1.1 default is unix seconds. SDK callers see `datetime`. | `1732449600.0` in the constructed samples |
| `GetMetricData` `Timestamps`                                                           | Unix timestamp. Parallel array with `Values`. SDK prints ISO 8601; the API documents Unix timestamp format.                        | `1732449600`                              |
| Feature Store offline `api_invocation_time`, `write_time`                              | Documented as timestamps. **Encoding is not specified.**                                                                           | —                                         |
| `GetRecord` `ExpiresAt`                                                                | ISO string                                                                                                                         | —                                         |

A 13-digit integer is milliseconds. A 10-digit integer is seconds. Do not coerce every `*Time` field with one parser. Strings may be ISO 8601 or a decimal millisecond count.

`TrainingStartTime`, `TrainingEndTime`, `TrainingTimeInSeconds`, and `BillableTimeInSeconds` can be **absent** on `DescribeTrainingJob` when the job fails before those phases. The same is true of the event: the failed-processing example includes start and end; a failure before start may not.

## Nested objects and arrays

- EventBridge `detail` is one object. Pipeline `resources` has two ARNs. HyperPod cluster events nest `EventDetails` twice.
- `ProductionVariants`, `VariantStatus`, `InputDataConfig`, `ProcessingInputs`, `ProcessingOutputConfig.Outputs`, `FeatureDefinitions`, `SecondaryStatusTransitions`, `InferenceSpecification.Containers`, `InstanceGroups` are arrays.
- `Tags` is an object (map), not an array, in the event examples.
- `HyperParameters` and `Environment` are string maps.
- Data capture `captureData` contains `endpointInput` and/or `endpointOutput` (only the modes enabled in `CaptureOptions`). The Model Monitor record class also names `captureData.batchTransformOutput`, but the current batch-capture doc does not show that object. It shows manifests instead. [The `batchTransformOutput` key is in the published record class; a sample payload was not found.]
- Data capture `eventMetadata.customAttributes` is an array of strings when the caller set `CustomAttributes` on `InvokeEndpoint`.
- Violations files: top-level `violations` array. Bias and attribution also have string `version` `"1.0"`. Constraints and statistics use numeric `version` `0`.
- `statistics.json` `features[]` is either `numerical_statistics` (mean, sum, std_dev, min, max, `distribution.kll.buckets[]`, `distribution.kll.sketch`) or `string_statistics` (`distinct_count`, `distribution.categorical.buckets[]`). Dataset level: `dataset.item_count`. KLL sketches are materialized as 10 buckets by default.
- `GetMetricData` returns `MetricDataResults[]`. Each result has parallel `Timestamps[]` and `Values[]` (doubles). `Messages[]` is `{Code, Value}` both on the result and at the top level.
- `DescribeEndpoint.ProductionVariants[]` (`ProductionVariantSummary`): `VariantName`, `DeployedImages[]`, `CurrentWeight`, `DesiredWeight`, `CurrentInstanceCount`, `DesiredInstanceCount`, `InstancePools`, `VariantStatus[]`, serverless configs, `ManagedInstanceScaling`, `RoutingConfig`, `CapacityReservationConfig`, `AcceleratorPartitionLayouts`. `DeployedImage` has `SpecifiedImage`, `ResolvedImage`, `ResolutionTime`.

## Endpoint data capture

One JSON object per line.

| Field                             | Type     | Notes                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eventVersion`                    | string   | `"0"` in every official example                                                                                                                                                                                                                                                                                                                                             |
| `captureData.endpointInput.mode`  | string   | `INPUT`                                                                                                                                                                                                                                                                                                                                                                     |
| `captureData.endpointOutput.mode` | string   | `OUTPUT`                                                                                                                                                                                                                                                                                                                                                                    |
| `observedContentType`             | string   | Request or response content type, e.g. `text/csv`, `text/csv; charset=utf-8`, `application/json`                                                                                                                                                                                                                                                                            |
| `encoding`                        | string   | `CSV` or `JSON` when `CaptureContentTypeHeader` lists that content type. Otherwise the body is base64. An AWS blog shows the literal `BASE64`. The API text says "base64 encode" and does not publish an enum.                                                                                                                                                              |
| `data`                            | string   | Payload. For `JSON` encoding the examples still store `data` as a **string** (a JSON document inside a string, or a raw array string such as `[0.008...]`), not as a nested object.                                                                                                                                                                                         |
| `eventMetadata.eventId`           | string   | Generated per invocation                                                                                                                                                                                                                                                                                                                                                    |
| `eventMetadata.inferenceTime`     | string   | ISO 8601                                                                                                                                                                                                                                                                                                                                                                    |
| `eventMetadata.customAttributes`  | string[] | Optional                                                                                                                                                                                                                                                                                                                                                                    |
| `eventMetadata.inferenceId`       | string   | The ground-truth merge doc says a caller-supplied inference id is used when present on the captured record. The published capture examples and the preprocessing class key list (`eventId`, `inferenceTime`, `customAttributes`) do **not** show `inferenceId`. [Field name is documented as a merge key; the exact JSON path is not shown in an official capture example.] |

S3 layout from the capture doc: `{DestinationS3Uri}/{endpoint-name}/{variant-name}/yyyy/mm/dd/hh/{filename}.jsonl`. Files are partitioned by the hour of the invocation. Delivery can lag a couple of minutes. Capture does not require Model Monitor.

Ground-truth record (separate JSONL, same hour-prefix layout, date is when the label was collected):

```json
{
  "groundTruthData": { "data": "1", "encoding": "CSV" },
  "eventMetadata": { "eventId": "aaaa-bbbb-cccc" },
  "eventVersion": "0"
}
```

Merge rule: if the captured record has `inferenceId`, that id must match the ground-truth `eventMetadata.eventId`. Otherwise the captured `eventId` is the join key. The ground-truth doc's sentence that puts `eventId` "in the `groundTruthData` structure" contradicts its own JSON, where `eventId` is under `eventMetadata`. Follow the JSON.

Batch transform capture is different. `{DestinationS3Uri}/input` and `/output` hold **manifests** (a JSON array whose first element is `{"prefix":"s3://..."}` and whose remaining elements are object keys), under a `yyyy/mm/dd/hh` prefix. With `GenerateInferenceId: true`, each transform **output** row gains an id and the job start time: CSV appends two columns; JSON/JSONL adds `SageMakerInferenceId` and `SageMakerInferenceTime`. Those two names are reserved.

## Model Monitor files

Model Monitor is closed to new customers. Existing schedules still write these files. A monitoring execution ends in `Completed`, `CompletedWithViolations`, `Failed`, or `Stopped` (`ExecutionStatus`).

Data-quality violation (no version):

```json
{
  "violations": [
    {
      "feature_name": "feature_a",
      "constraint_check_type": "baseline_drift_check",
      "description": "..."
    }
  ]
}
```

Constraints file: `version` number, `features[]` (`name`, `inferred_type`, `completeness`, `num_constraints.is_non_negative`, `string_constraints.domains[]`), `monitoring_config`.

Statistics file: `version` number, `dataset.item_count`, `features[]` with either `numerical_statistics` or `string_statistics`. The container may emit extra metrics; SageMaker visualizations only recognize the documented ones.

Model quality does **not** reuse the six data-quality check types. The metrics page publishes `regression_metrics` (`mae`, `mse`, `rmse`, `r2`), `binary_classification_metrics` (confusion matrix, precision, recall, accuracy, rates, ROC, PR, `auc`, `f0_5`, `f1`, `f2`, plus `*_best_constant_classifier`), and `multiclass_classification_metrics` (weighted precision/recall/f-scores). Each metric object is `{value, standard_deviation}`. Standard deviation is present only with at least 200 samples; otherwise the example uses the string `"NaN"`. With `enable_cloudwatch_metrics` true, those metrics go to:

- real-time: `aws/sagemaker/Endpoints/model-metrics`
- batch: `aws/sagemaker/ModelMonitoring/model-metrics`

A schema for model-quality `constraint_violations.json` was **not** found on the violations page. Do not assume `feature_name` / `data_type_check` for it.

## Feature Store

Feature Store has **no dedicated log or audit-event schema**.

- Offline store rows are **Parquet**, not JSON logs. Glue tables are partitioned by event time hourly; Iceberg tables daily. AWS adds exactly three system columns: `api_invocation_time`, `write_time`, `is_deleted` (`false` until `DeleteRecord`, which appends a new row with `is_deleted` true). Every other column is the feature group's own definitions, including the record identifier and the event-time feature. Timestamp encoding for the two system times is not documented.
- Online reads are the `GetRecord` API (`ExpiresAt` ISO string, `Record[]` of `FeatureName`, `ValueAsString`, optional `ValueAsStringList`). That is a request response, not a log. `ValueAsString` is always a string even for `Integral` and `Fractional` features.
- Audit of `CreateFeatureGroup`, `DeleteFeatureGroup`, `DescribeFeatureGroup`, `UpdateFeatureGroup` is CloudTrail management events. `BatchGetRecord`, `DeleteRecord`, `GetRecord`, `PutRecord` are CloudTrail **data events** and are off unless data-event logging is enabled. The schema is CloudTrail's, not a Feature Store schema.

The `SageMaker Feature Group State Change` event above is a control-plane state change, not a record of feature values.

## CloudWatch metric point (`GetMetricData`)

This is the metrics event. It is not a log line.

```json
{
  "Id": "m1",
  "Label": "Invocations",
  "Timestamps": [1732449600],
  "Values": [42.0],
  "StatusCode": "Complete",
  "Messages": []
}
```

| Field        | Notes                                                     |
| ------------ | --------------------------------------------------------- |
| `Id`         | The query id from the request (1–255 chars)               |
| `Label`      | Defaults to the metric name unless the query sets `Label` |
| `Timestamps` | Unix timestamps. Same length and index as `Values`        |
| `Values`     | Doubles                                                   |
| `StatusCode` | `Complete`, `PartialData`, `InternalError`, `Forbidden`   |
| `Messages`   | `{Code, Value}`                                           |

`Namespace`, `MetricName`, and `Dimensions` are **not** in the result. A pipeline has to keep them from the query. `PartialData` means follow `NextToken`.

Dimensions and namespaces that **are** stated on the SageMaker metrics page:

| Namespace                                     | Dimension sets                                                                                                        | Representative metrics                                                                                                                                                                                                                     |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AWS/SageMaker`                               | `EndpointName`+`VariantName`; optional `InstanceType`; `InferenceComponentName`; enhanced `InstanceId`, `ContainerId` | `Invocations`, `InvocationsPerInstance`, `Invocation4XXErrors`, `Invocation5XXErrors`, `InvocationModelErrors`, `ModelLatency` (microseconds), `OverheadLatency`, `ModelSetupTime`, multi-model `ModelLoadingWaitTime`, `ModelCacheHit`, … |
| `/aws/sagemaker/Endpoints`                    | `EndpointName`+`VariantName`; optional `InstanceType`; enhanced `InstanceId`, `AcceleratorId`                         | `CPUUtilization`, `MemoryUtilization`, `DiskUtilization`, `GPUUtilization`, `GPUMemoryUtilization`, plus reservation/normalized metrics for inference components                                                                           |
| `/aws/sagemaker/InferenceComponents`          | `InferenceComponentName`; optional `InstanceType`, `InstanceId`, `ContainerId`, `AcceleratorId`                       | Normalized CPU/GPU/memory                                                                                                                                                                                                                  |
| `/aws/sagemaker/TrainingJobs`                 | `Host` = `{training-job-name}/algo-{n}`                                                                               | `CPUUtilization`, `MemoryUtilization`, `DiskUtilization`, `GPUUtilization`, `GPUMemoryUtilization`                                                                                                                                         |
| `/aws/sagemaker/ProcessingJobs`               | `Host` = `{processing-job-name}/algo-{n}`                                                                             | Same family. `DiskUtilization` is supported.                                                                                                                                                                                               |
| `/aws/sagemaker/TransformJobs`                | `Host` = `{transform-job-name}/{instance-id}`                                                                         | Same family. `DiskUtilization` is **not** supported for batch transform.                                                                                                                                                                   |
| `/aws/sagemaker/InferenceRecommendationsJobs` | `JobName`, `EndpointName`                                                                                             | `ClientInvocations`, `ClientInvocationErrors`, `ClientLatency` (milliseconds), `NumberOfUsers`                                                                                                                                             |
| `AWS/Sagemaker/ModelBuildingPipeline`         | `PipelineName`; steps add `StepName`                                                                                  | `ExecutionStarted`, `ExecutionFailed`, `ExecutionSucceeded`, `ExecutionStopped`, `ExecutionDuration` (ms); `StepStarted`, `StepFailed`, `StepSucceeded`, `StepStopped`, `StepDuration`                                                     |

The namespace string on the pipeline section is `AWS/Sagemaker/ModelBuildingPipeline` (capital S, lowercase agemaker), as published.

Ground Truth metrics (`LabelingJobName`, `ActiveWorkers`, `TasksSubmitted`, …) and Feature Store metrics (`FeatureGroupName`, `OperationName`, `ConsumedReadRequestsUnits`, `Invocations`, `Latency`, …) are listed on the same page **without a namespace in that section**. [UNVERIFIED namespace for those two groups.]

Default period is 1 minute. Endpoint metric publish frequency can be 10, 30, 60, 120, 180, 240, or 300 seconds via `MetricsConfig.MetricPublishFrequencyInSeconds`. Invocation-metric frequency changes require `EnableEnhancedMetrics`.

`DescribeTrainingJob.FinalMetricDataList[]` is a different metric shape emitted at job end: `MetricName`, `Value`, `Timestamp`. Those values are parsed from container stdout by `AlgorithmSpecification.MetricDefinitions[].Regex`. They are API fields, not log fields.

## Describe\* API state (not logs)

Poll these only if the EventBridge event is missing a field. Wire timestamps are Unix seconds. Enums are the API enums (`InService`, not `IN_SERVICE`).

### DescribeTrainingJob

Fields that matter for observability: `TrainingJobName`, `TrainingJobArn`, `TrainingJobStatus`, `SecondaryStatus`, `FailureReason`, `SecondaryStatusTransitions[]`, `CreationTime`, `TrainingStartTime`, `TrainingEndTime`, `LastModifiedTime`, `TrainingTimeInSeconds`, `BillableTimeInSeconds`, `AlgorithmSpecification` (`TrainingImage`, `TrainingInputMode`, `MetricDefinitions[]`), `ResourceConfig` (`InstanceType`, `InstanceCount`, `VolumeSizeInGB`, optional `InstanceGroups[]`), `ModelArtifacts.S3ModelArtifacts`, `OutputDataConfig.S3OutputPath`, `HyperParameters`, `FinalMetricDataList[]`, `RoleArn`, `ProfilingStatus`, `EnableManagedSpotTraining`, `BillableTokenCount`.

The response has on the order of 50 top-level members (debug/profiler rules, experiment config, MLflow, checkpoint, AutoML ARN, and so on). Full tree: `temp/schema-files/DescribeTrainingJobResponse.txt`.

### DescribeProcessingJob

`ProcessingJobName`, `ProcessingJobArn`, `ProcessingJobStatus`, `FailureReason`, `ExitMessage`, `CreationTime`, `ProcessingStartTime`, `ProcessingEndTime`, `LastModifiedTime`, `AppSpecification.ImageUri`, `ProcessingResources.ClusterConfig`, `RoleArn`, `MonitoringScheduleArn`, `TrainingJobArn`, `AutoMLJobArn`. `ExitMessage` is container output and is not on the EventBridge example.

### DescribeTransformJob

`TransformJobName`, `TransformJobArn`, `TransformJobStatus`, `FailureReason`, `ModelName`, `MaxConcurrentTransforms`, `MaxPayloadInMB`, `BatchStrategy`, `TransformInput`, `TransformOutput`, `TransformResources`, `DataCaptureConfig.{DestinationS3Uri,KmsKeyId,GenerateInferenceId}`, `CreationTime`, `TransformStartTime`, `TransformEndTime`, `LabelingJobArn`, `AutoMLJobArn`.

### DescribeEndpoint

`EndpointName`, `EndpointArn`, `EndpointConfigName`, `EndpointStatus`, `FailureReason`, `CreationTime`, `LastModifiedTime`, `ProductionVariants[]`, `DataCaptureConfig` (`EnableCapture`, `CaptureStatus`, `CurrentSamplingPercentage`, `DestinationS3Uri`, `KmsKeyId`), `PendingDeploymentSummary`, `ShadowProductionVariants`, `MetricsConfig.{EnableEnhancedMetrics,EnableDetailedObservability,MetricPublishFrequencyInSeconds}`, `LastDeploymentConfig`, `AsyncInferenceConfig`.

`FailureReason` is how a `Failed` endpoint explains `Create`, `Update`, or scale failure. It is not in the published EventBridge endpoint examples.

## IP, user, host, hash

| Field                                          | Where                                                           | What it is                                                                                    |
| ---------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| None                                           | Job/endpoint/pipeline EventBridge events and data-capture JSONL | No client IP, no user, no hostname                                                            |
| `sourceIPAddress`, `userIdentity`, `userAgent` | CloudTrail event (`detail-type` `AWS API Call via CloudTrail`)  | Standard CloudTrail. Not in SageMaker state-change `detail`.                                  |
| `CreatedBy` / `LastModifiedBy`                 | Model card event                                                | `UserProfileName`, `UserProfileArn`, `DomainId`. Studio profile, not an IP.                   |
| `RoleArn`                                      | Job events                                                      | IAM role that ran the job, not the caller.                                                    |
| `AccountId`                                    | Model card event                                                | AWS account.                                                                                  |
| `InstanceId`                                   | HyperPod events                                                 | EC2 instance id (`i-...`), not an IP.                                                         |
| `Host`                                         | CloudWatch dimension only                                       | `{job-name}/algo-{n}` or `{transform-job}/{instance-id}`. Not a log field.                    |
| `ImageDigest`                                  | Model package `InferenceSpecification.Containers[]`             | `sha256:` digest of the inference image.                                                      |
| `eventId`, `SageMakerInferenceId`              | Data capture, ground truth, batch output                        | Identifiers. `eventId` is generated. Inference id may be caller-supplied. Not a content hash. |

Data-capture `data` can contain whatever the model received, including PII. The envelope itself has no identity fields.

## Training container logs have no stable field schema

SageMaker writes container stdout/stderr to CloudWatch Logs. The lines are free text. AWS does not publish a JSON schema, ECS field set, or required keys for those lines.

| Job        | Log group                                 | Stream pattern (documented by the console/API behavior and metric `Host` dimension) |
| ---------- | ----------------------------------------- | ----------------------------------------------------------------------------------- |
| Training   | `/aws/sagemaker/TrainingJobs`             | `{TrainingJobName}/algo-{n}-...`                                                    |
| Processing | `/aws/sagemaker/ProcessingJobs`           | `{ProcessingJobName}/algo-{n}-...`                                                  |
| Transform  | `/aws/sagemaker/TransformJobs`            | job and instance                                                                    |
| Endpoint   | `/aws/sagemaker/Endpoints/{EndpointName}` | variant / instance                                                                  |

What _is_ structured about training logs is optional and user-defined: `MetricDefinitions[].Regex` pulls numbers out of stdout into CloudWatch metrics and into `FinalMetricDataList`. The regex and the metric name are per algorithm. A line that does not match is still an unstructured log line.

`FailureReason` and processing `ExitMessage` are the supported structured substitutes for "why did this container fail."

## Gaps

- 41 EventBridge detail-types, including monitoring schedule, notebook, algorithm, labeling, A2I, evaluation, tracking server, and MLflow, have **no published `detail` schema**. `SageMaker Job State Change` is the opposite problem: it has an example and is missing from the EventBridge name list.
- `SageMaker Model State Change` has no `detail` example.
- Endpoint event status strings (`IN_SERVICE`, `UPDATING`) and image event status strings (`Creating`) disagree with the API enums. Confirm against a live event before locking a parser to one casing. [Not verified against a live account.]
- Feature-group event uses `FeatureGroupStatus: "Active"`, which is not in the `FeatureGroupStatus` enum.
- `comparison_method` is documented twice with different tokens (`Simple`/`Robust` vs `linf_simple`/`linf_robust`).
- Model-quality `constraint_violations.json` schema was not found. Only the metrics objects and the CloudWatch namespaces are published.
- `captureData.batchTransformOutput` is named in the record class and has no official example. Current batch capture docs describe manifests plus `SageMakerInferenceId`.
- `inferenceId` inside a capture record is described as a merge key and is not shown in an official capture JSON example.
- Offline-store `api_invocation_time` and `write_time` have no documented epoch-vs-ISO encoding.
- Ground Truth and Feature Store CloudWatch **namespaces** are not stated in the metrics section that lists their metric names.
- Pipeline `failureReason` and `cacheHitResult` are named and not schematized. `stepType` has no closed enum in the API model; the example value is `Processing`.
- EventBridge `detail` timestamps are internally inconsistent (string ms, numeric ms, ISO 8601). The Describe\* API uses Unix seconds. This is from the published examples, not from a single AWS timestamp spec.
