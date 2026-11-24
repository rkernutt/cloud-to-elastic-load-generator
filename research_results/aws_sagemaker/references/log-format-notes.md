# Amazon SageMaker CloudWatch Logs — format notes

Sources fetched 2026-11-24. Primary page: [CloudWatch Logs for Amazon SageMaker AI](https://docs.aws.amazon.com/sagemaker/latest/dg/logging-cloudwatch.html).

SageMaker ships **container stdout and stderr** for compilation, processing, training, endpoints, transform, notebook instances, and notebook lifecycle configuration scripts to CloudWatch Logs. Retention is **indefinite unless you change the log group retention**. That shipping is on by default for those resources. It is not JSON. Data capture, Model Monitor, and Clarify reports are separate and are **off until configured** (see the S3 section and `s3-and-eventbridge-records.md`).

## Payload, multiline behavior, timestamps

| Question                                         | What AWS documents                                                                                                                                                                                                                                       | What to assume for ingest                                                                                                                                                                                                                      |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Payload type for job and endpoint container logs | "Anything an algorithm container, a model container, or a notebook instance lifecycle configuration sends to `stdout` or `stderr`." Plain text. Built-in algorithm examples are single log lines with an embedded timestamp and a Python `ERROR` prefix. | **Plaintext.** Not a SageMaker JSON envelope. A container may print JSON or a traceback; that is application text, not a platform schema.                                                                                                      |
| Multiline / one event vs many                    | **Not specified.** Published examples are one logical line each (the HTML docs wrap long lines).                                                                                                                                                         | **[INFERENCE]** Treat a newline as an event boundary. A Python traceback is several CloudWatch events that must be reassembled with log group + stream + sequence, not one event. Do not expect a stack trace to arrive as a single `message`. |
| Timestamp                                        | Not specified as "ingestion time vs message time" for container logs. Ground Truth worker events carry `event_timestamp` (Unix seconds) **inside** the JSON message. Data capture (S3, not Logs) carries `eventMetadata.inferenceTime`.                  | Use the CloudWatch event timestamp as ingestion time. Parse an in-message timestamp only when the line matches a known container format (see training sample). The two clocks are not the same field.                                          |
| Studio / notebook LCC                            | STDOUT and STDERR only. Bash stdout is default; stderr requires `>&2`.                                                                                                                                                                                   | Plaintext shell output.                                                                                                                                                                                                                        |

## Log group inventory

Log group names are exact. Stream patterns use the placeholders from the logging page. `[epoch_timestamp]` is a Unix epoch embedded in the stream name (documented token, not further specified).

| Log group                                     | Stream pattern                                                                      | Payload                                                                                                                                                                                | Default?                                                                                                                                                                                                                                          | Sample file                                               |
| --------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `/aws/sagemaker/TrainingJobs`                 | `[training-job-name]/algo-[instance-number-in-cluster]-[epoch_timestamp]`           | Plaintext stdout/stderr. One stream per training node. Stream name **begins with** `TrainingJobName`.                                                                                  | Yes, for training jobs (and Debugger training logs, Feature Processor remote/pipeline runs).                                                                                                                                                      | `sample-events/training-jobs.log`                         |
| `/aws/sagemaker/ProcessingJobs`               | `[processing-job-name]/[hostname]-[epoch_timestamp]`                                | Plaintext stdout/stderr.                                                                                                                                                               | Yes, for processing jobs. Also Debugger **rule** jobs, Clarify jobs, Model Monitor executions, pipeline Processing steps.                                                                                                                         | `sample-events/processing-jobs.log`                       |
| `/aws/sagemaker/TransformJobs`                | `[transform-job-name]/[instance-id]-[epoch_timestamp]`                              | Plaintext model container stdout/stderr.                                                                                                                                               | Yes, for batch transform.                                                                                                                                                                                                                         | `sample-events/transform-jobs.log`                        |
| same                                          | `[transform-job-name]/[instance-id]-[epoch_timestamp]/data-log`                     | Platform data log. **No sample line published.**                                                                                                                                       | Present on the logging table for transform. Content format **[UNVERIFIED]**.                                                                                                                                                                      | —                                                         |
| same                                          | `[transform-job-name]/[instance-id]-[epoch_timestamp]/[container-name]`             | Per-container stdout/stderr for inference-pipeline models. Missing container names become `container-1`, `container-2`, … in model order.                                              | Yes when the model is an inference pipeline.                                                                                                                                                                                                      | —                                                         |
| `/aws/sagemaker/Endpoints/[EndpointName]`     | `[production-variant-name]/[instance-id]`                                           | Plaintext model container stdout/stderr. Serverless endpoints use this **same group**.                                                                                                 | Yes, for real-time, serverless, and async endpoints.                                                                                                                                                                                              | `sample-events/endpoint-container.log`                    |
| same                                          | `[production-variant-name]/[instance-id]/data-log`                                  | Async inference **platform** log. Lines include the request inference ID. Exact line template **not published**.                                                                       | Emitted for asynchronous inference endpoints (in addition to container logs).                                                                                                                                                                     | `sample-events/async-endpoint-data-log.log` (constructed) |
| same                                          | `[production-variant-name]/[instance-id]/[container-name]`                          | Inference-pipeline container logs. Fallback names `container-1`, `container-2`, ….                                                                                                     | Yes for multi-container inference pipelines.                                                                                                                                                                                                      | —                                                         |
| `/aws/sagemaker/CompilationJobs`              | `[compilation-job-name]`                                                            | Plaintext compiler/container stdout/stderr. No sample published.                                                                                                                       | Yes, for Neo compilation jobs.                                                                                                                                                                                                                    | —                                                         |
| `/aws/sagemaker/NotebookInstances`            | `[notebook-instance-name]/jupyter.log`                                              | Jupyter server log. Plaintext. No sample published.                                                                                                                                    | Created for notebook instances.                                                                                                                                                                                                                   | —                                                         |
| same                                          | `[notebook-instance-name]/[LifecycleConfigHook]`                                    | LCC script stdout/stderr. The logging-page note writes this as `/aws/sagemaker/NotebookInstances/[LifecycleConfigHook]`; the table is the accurate pattern (notebook name, then hook). | **Only if** the notebook instance is created with a lifecycle configuration.                                                                                                                                                                      | `sample-events/notebook-lifecycle.log` (constructed)      |
| `/aws/sagemaker/studio`                       | `[domain-id]/[user-profile-name]/[app-type]/[app-name]`                             | App stdout/stderr.                                                                                                                                                                     | Yes when Studio apps run.                                                                                                                                                                                                                         | —                                                         |
| same                                          | `[domain-id]/domain-shared/rstudioserverpro/default`                                | RStudioServerPro shared app.                                                                                                                                                           | When that app type is used.                                                                                                                                                                                                                       | —                                                         |
| same                                          | `[domain-id]/[space-name]/[app-type]/default/LifecycleConfigOnStart`                | Studio lifecycle STDOUT/STDERR. Documented example: `d-m85lcu8vbqmz/i-sonic-js/JupyterLab/default/LifecycleConfigOnStart`.                                                             | **Only when** a lifecycle configuration runs. Timeout is 5 minutes.                                                                                                                                                                               | `sample-events/studio-lifecycle.log` (constructed)        |
| `/aws/sagemaker/LabelingJobs`                 | `[labeling-job-name]`                                                               | Labeling-job events. sms.html says events appear in this group and the stream is the job name. Line format **not published** (do not assume the worker-activity JSON).                 | Yes for Ground Truth labeling jobs. Ground Truth is closed to new customers; existing customers continue.                                                                                                                                         | —                                                         |
| `/aws/sagemaker/groundtruth/WorkerActivity`   | `aws/sagemaker/groundtruth/worker-activity/[requester-AWS-Id]-[region]/[timestamp]` | **One JSON object per completed task.** See fields below.                                                                                                                              | Worker tracking is on for private work teams created after the August 2019 permission change. Teams created earlier need a new (even empty) work team once to install the permissions. **Not available for Augmented AI human review workflows.** | `sample-events/groundtruth-worker-activity.json`          |
| `/aws/sagemaker/InferenceRecommendationsJobs` | `[inference-recommendations-job-name]/execution`                                    | No sample published.                                                                                                                                                                   | Yes for Inference Recommender jobs.                                                                                                                                                                                                               | —                                                         |
| same                                          | `[inference-recommendations-job-name]/CompilationJob/[compilation-job-name]`        | No sample published.                                                                                                                                                                   | When the recommender runs a compilation job.                                                                                                                                                                                                      | —                                                         |
| same                                          | `[inference-recommendations-job-name]/Endpoint/[endpoint-name]`                     | No sample published.                                                                                                                                                                   | When the recommender creates an endpoint.                                                                                                                                                                                                         | —                                                         |

There is **no** `/aws/sagemaker/Pipelines` log group in the official log table. Pipeline step logs are the underlying training, processing, or transform job logs. Feature Store Feature Processor logs are also under `/aws/sagemaker/TrainingJobs` (below).

### Training jobs

- Group: `/aws/sagemaker/TrainingJobs`
- Stream: `[training-job-name]/algo-[instance-number-in-cluster]-[epoch_timestamp]`
- One stream per node. If a job fails and **no** logs appear, the failure happened before training started (wrong image or S3 location). `DescribeTrainingJob` `FailureReason` is a separate API field, not a CloudWatch line.
- Built-in algorithm logs vary. Typical contents: echoed arguments, errors, accuracy or numeric performance, stage timings.
- Official error lines (from [Logs for built-in algorithms](https://docs.aws.amazon.com/sagemaker/latest/dg/common-info-all-sagemaker-models-logs.html)):

```
[10/16/2017 23:45:17 ERROR 139623806805824 train.py:48] Additional properties are not allowed (u'mini_batch_siz' was unexpected)
```

```
[10/16/2017 23:57:17 ERROR 140373086025536 train.py:48] u'abc' is not valid under any of the given schemas
```

```
[10/17/2017 18:01:04 ERROR 140234860816192 train.py:48] cannot copy sequence with size 785 to array axis with dimension 784
```

The embedded `[MM/DD/YYYY HH:MM:SS ERROR <pid> file:line]` prefix is **inside the message**. CloudWatch still has its own event timestamp.

Custom metrics are parsed from these same lines. The algorithm must print a stable token. Documented example line and regexes ([Define training metrics](https://docs.aws.amazon.com/sagemaker/latest/dg/define-train-metrics.html)):

```
Train_error=0.138318;  Valid_error=0.324557;
```

`Train_error=(.*?);` and `Valid_error=(.*?);`. Another documented stdout/stderr line ([Define metrics and environment variables](https://docs.aws.amazon.com/sagemaker/latest/dg/automatic-model-tuning-define-metrics-variables.html)):

```
GAN_loss=0.138318; Scaled_reg=2.654134; disc:[-0.017371,0.102429] real 93.3% gen 0.0% disc-combined=0.000000; disc_train_loss=1.374587; Loss = 16.020744; Iteration 0 took 0.704s; Elapsed=0s
```

Built-in algorithms already define metrics; you do not pass `MetricDefinitions` for them. Those metrics are still produced by parsing stdout/stderr. XGBoost validation metric **names** that can be the tuning objective include `validation:rmse`, `validation:mae`, `validation:logloss`, `validation:auc`, `validation:error`, `validation:accuracy`, `validation:f1`, `validation:mse`, `validation:merror`, `validation:mlogloss`, `validation:map`, `validation:ndcg` ([Tune an XGBoost model](https://docs.aws.amazon.com/sagemaker/latest/dg/xgboost-tuning.html)). The exact XGBoost log spelling (`train-rmse:` vs `Train_error=`) is **not** shown on that page.

Debugger training logs: same group. Debugger **rule** logs: `/aws/sagemaker/ProcessingJobs` ([Access CloudWatch logs for Debugger rules and training jobs](https://docs.aws.amazon.com/sagemaker/latest/dg/debugger-cloudwatch-metric.html)).

Feature Store Feature Processor ([monitor page](https://docs.aws.amazon.com/sagemaker/latest/dg/feature-store-feature-processor-monitor-pipeline.html)):

- Direct `@feature_processor` invocation: local console, not CloudWatch.
- `@remote` executions: `/aws/sagemaker/TrainingJobs`. Stream name contains the function name and the execution timestamp.
- Pipeline executions: stream for the step contains the string `feature-processor` and the pipeline execution ID.

### Processing jobs (Clarify, Model Monitor, Debugger rules, pipeline steps)

- Group: `/aws/sagemaker/ProcessingJobs`
- Stream: `[processing-job-name]/[hostname]-[epoch_timestamp]`
- Clarify failures: read this group, or `describe-processing-job` `FailureReason` / exit message. Documented warning when a job ends with no results because it was stopped or hit `max_runtime_in_seconds`:

```
Signal 15 received, cleaning up.
```

Source: [Troubleshoot SageMaker Clarify processing jobs](https://docs.aws.amazon.com/sagemaker/latest/dg/clarify-processing-job-run-troubleshooting.html). Clarify and Model Monitor are closed to new customers.

### Endpoints, async, inference pipelines, serverless

Container logs: `/aws/sagemaker/Endpoints/[EndpointName]` stream `[variant]/[instance-id]`.

Inference pipeline path documented both as the stream suffix and as a full path ([Troubleshoot inference pipelines](https://docs.aws.amazon.com/sagemaker/latest/dg/inference-pipeline-troubleshoot.html)):

```
/aws/sagemaker/Endpoints/{EndpointName}/{Variant}/{InstanceId}/{ContainerHostname}
```

Example from that page: group `/aws/sagemaker/Endpoints/MyInferencePipelinesEndpoint`, streams `MyInferencePipelinesVariant/i-0179208609ff7e488/MyContainerName1` and `.../MyContainerName2`.

Async platform log ([Alarms and logs for asynchronous endpoints](https://docs.aws.amazon.com/sagemaker/latest/dg/async-inference-monitor.html)):

- Group: `/aws/sagemaker/Endpoints/[EndpointName]`
- Stream: `[production-variant-name]/[instance-id]/data-log`
- "Log lines contain the request’s inference ID." No literal example is published. The sample file is marked constructed.

Serverless uses the same endpoint log group ([serverless monitoring](https://docs.aws.amazon.com/sagemaker/latest/dg/serverless-endpoints-monitoring.html)). No separate serverless log group.

A failed inference-pipeline invoke returns `ModelError` (HTTP 424) from the runtime API, not as a guaranteed CloudWatch line. Documented message shape: `Received response from MyContainerName1 with status code 200. However, the request payload from MyContainerName1 to MyContainerName2 is 6000000 bytes, which has exceeded the maximum limit of 5 MB.`

### Ground Truth worker activity (JSON)

Official example from [Track worker performance](https://docs.aws.amazon.com/sagemaker/latest/dg/workteam-private-tracking.html). One JSON object per completed task. Fields:

| Field                       | Type in the example    | Notes                                                                |
| --------------------------- | ---------------------- | -------------------------------------------------------------------- |
| `worker_id`                 | string                 | Opaque worker id                                                     |
| `cognito_user_pool_id`      | string                 | Pool id, join to Cognito to name a worker                            |
| `cognito_sub_id`            | UUID string            | Stable worker key                                                    |
| `task_accepted_time`        | string                 | `Wed Aug 14 16:00:59 UTC 2019` (not ISO-8601)                        |
| `task_submitted_time`       | string                 | Same format, or `""`                                                 |
| `task_returned_time`        | string                 | `""` when unused                                                     |
| `task_declined_time`        | string                 | `""` when unused                                                     |
| `workteam_arn`              | ARN                    | `arn:aws:sagemaker:{region}:{account}:workteam/private-crowd/{team}` |
| `labeling_job_arn`          | ARN                    | `...:labeling-job/{name}`                                            |
| `work_requester_account_id` | string                 | Account id                                                           |
| `job_reference_code`        | string                 |                                                                      |
| `job_type`                  | string                 | Example value `Private`                                              |
| `event_type`                | string                 | Example value `TasksSubmitted`                                       |
| `event_timestamp`           | string of unix seconds | Example `1565798464`                                                 |

This is the only SageMaker **CloudWatch Logs** family documented as JSON. It is one JSON value per event (not JSONL spanning lines in the published example).

### Studio and notebooks

[Debug lifecycle configurations](https://docs.aws.amazon.com/sagemaker/latest/dg/studio-lcc-debug.html) (Studio Classic section, still the page that documents the stream):

- Log group search string: `aws/sagemaker/studio` (the group is `/aws/sagemaker/studio`).
- LCC stream: `{domain-id}/{space-name}/{app-type}/default/LifecycleConfigOnStart`
- App types called out: `JupyterLab`, and Classic `JupyterServer` / `KernelGateway` failures that link to these logs.
- The logging table’s `[domain-id]/[user-profile-name]/[app-type]/[app-name]` pattern is older Studio Classic naming. Keep both patterns. Current Studio spaces use `space-name`.

Notebook instance LCC is a different group (`/aws/sagemaker/NotebookInstances`), not `/aws/sagemaker/studio`.

## What is not a CloudWatch log

| Record                                                     | Where it goes                                        | File                                                       |
| ---------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------- |
| Endpoint data capture                                      | S3 JSONL, opt-in                                     | `sample-events/endpoint-data-capture.jsonl`                |
| Model Monitor `constraint_violations.json`                 | S3 JSON, only if a monitor runs and violations exist | `sample-events/constraint-violations.json`                 |
| Training / processing / transform / pipeline state changes | EventBridge, not Logs                                | `sample-events/eventbridge-training-job-state-change.json` |

Details, paths, and schemas: `references/s3-and-eventbridge-records.md`.

## Gaps

- No official sample lines for endpoint container logs, async `data-log`, transform `data-log`, compilation jobs, `jupyter.log`, labeling-job streams, Inference Recommender streams, or Studio app logs (only the worker-activity JSON, built-in training error lines, the Clarify SIGTERM warning, and metric-regex training lines).
- Whether CloudWatch stores one event per newline is **not** documented. Marked inference above.
- Async `data-log` field layout (timestamp, inference id position, severity) is **[UNVERIFIED]** beyond "lines contain the inference ID."
- Labeling-job log line format is **[UNVERIFIED]**. Do not reuse the worker-activity schema for `/aws/sagemaker/LabelingJobs`.
- Feature Store has **no** dedicated log group on the logging page. Only Feature Processor execution logs under TrainingJobs are documented.
- Pipelines have **no** dedicated log group.
