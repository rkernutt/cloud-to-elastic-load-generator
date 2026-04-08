# Ingest pipeline reference: parse JSON message (all services)

This document lists pipeline IDs, target fields, index patterns, and example parsed JSON keys for every AWS service in the load generator that can emit **structured (JSON) log lines** in the `message` field.

The pattern is simple: one `json` processor on `message` → target field, with `ignore_failure: true` so plain-text messages are left unchanged.

> **Easy install:** `npm run setup:pipelines` installs all 106 pipelines interactively — no manual JSON needed. This document is a reference for understanding what each pipeline does and which fields are available after parsing.

---

## Table: pipeline ID, target field, index pattern

| Service           | Pipeline ID                           | Target field              | Index pattern                |
| ----------------- | ------------------------------------- | ------------------------- | ---------------------------- |
| Glue              | `glue-parse-json-message`             | `glue.parsed`             | `logs-aws.glue*`             |
| S3                | `s3-parse-json-message`               | `s3.parsed`               | `logs-aws.s3*`               |
| Lambda            | `lambda-parse-json-message`           | `lambda.parsed`           | `logs-aws.lambda*`           |
| API Gateway       | `apigateway-parse-json-message`       | `apigateway.parsed`       | `logs-aws.apigateway*`       |
| RDS               | `rds-parse-json-message`              | `rds.parsed`              | `logs-aws.rds*`              |
| ECS               | `ecs-parse-json-message`              | `ecs.parsed`              | `logs-aws.ecs*`              |
| EC2               | `ec2-parse-json-message`              | `ec2.parsed`              | `logs-aws.ec2*`              |
| EKS               | `eks-parse-json-message`              | `eks.parsed`              | `logs-aws.eks*`              |
| App Runner        | `apprunner-parse-json-message`        | `apprunner.parsed`        | `logs-aws.apprunner*`        |
| Batch             | `batch-parse-json-message`            | `batch.parsed`            | `logs-aws.batch*`            |
| Fargate           | `fargate-parse-json-message`          | `fargate.parsed`          | `logs-aws.ecs_fargate*`      |
| Step Functions    | `stepfunctions-parse-json-message`    | `stepfunctions.parsed`    | `logs-aws.stepfunctions*`    |
| CodeBuild         | `codebuild-parse-json-message`        | `codebuild.parsed`        | `logs-aws.codebuild*`        |
| CodePipeline      | `codepipeline-parse-json-message`     | `codepipeline.parsed`     | `logs-aws.codepipeline*`     |
| Kinesis Analytics | `kinesisanalytics-parse-json-message` | `kinesisanalytics.parsed` | `logs-aws.kinesisanalytics*` |
| Athena            | `athena-parse-json-message`           | `athena.parsed`           | `logs-aws.athena*`           |
| Elastic Beanstalk | `elasticbeanstalk-parse-json-message` | `elasticbeanstalk.parsed` | `logs-aws.elasticbeanstalk*` |
| EventBridge       | `eventbridge-parse-json-message`      | `eventbridge.parsed`      | `logs-aws.eventbridge*`      |
| DynamoDB          | `dynamodb-parse-json-message`         | `dynamodb.parsed`         | `logs-aws.dynamodb*`         |
| IoT Core          | `iotcore-parse-json-message`          | `iotcore.parsed`          | `logs-aws.iot*`              |
| CloudFormation    | `cloudformation-parse-json-message`   | `cloudformation.parsed`   | `logs-aws.cloudformation*`   |
| SSM               | `ssm-parse-json-message`              | `ssm.parsed`              | `logs-aws.ssm*`              |
| EMR               | `emr-parse-json-message`              | `emr.parsed`              | `logs-aws.emr*`              |
| SageMaker         | `sagemaker-parse-json-message`        | `sagemaker.parsed`        | `logs-aws.sagemaker*`        |

---

## Apply and attach (all pipelines)

- **Easy way:** `npm run setup:pipelines` — interactive CLI installs all 106 pipelines; skips already-installed ones.

- **Manual (API):**
  `PUT _ingest/pipeline/<pipeline-id>` with the body below (replace `<target_field>` with the value from the table).

- **Attach:**  
  In Fleet (AWS integration / Custom Logs) or in the index template for the service’s data stream, set **Custom ingest pipeline** / `default_pipeline` to the pipeline ID above.

- **Scope:**  
  Attach each pipeline only to the index pattern in the table so only that service’s documents are parsed.

---

## Example JSON keys (from this app’s generators)

Use these to add optional `rename` or `set` processors after the `json` processor (e.g. map into ECS or `aws.<service>`).

| Service               | Example keys in parsed JSON                                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Glue**              | `jobName`, `jobRunId`, `level`, `message`, `timestamp`, `thread`, `logger`, `errorCode`                                           |
| **S3**                | `bucket`, `key`, `operation`, `http_status`, `request_id`, `bytes_sent`, `total_time_ms`, `timestamp`                             |
| **Lambda**            | `requestId`, `level`, `message`, `timestamp`, `duration_ms`, `memory_used_mb`, `traceId` (optional)                               |
| **API Gateway**       | `requestId`, `requestMethod`, `requestPath`, `status`, `responseLatency`, `integrationLatency`, `timestamp`, `traceId` (optional) |
| **RDS**               | `instanceId`, `engine`, `userId`, `queryTime`, `error`, `timestamp`                                                               |
| **ECS**               | `cluster`, `service`, `taskId`, `container`, `level`, `message`, `timestamp`                                                      |
| **EC2**               | `instanceId`, `instanceType`, `level`, `message`, `timestamp`, `component`                                                        |
| **EKS**               | `cluster`, `namespace`, `pod`, `level`, `message`, `timestamp`, `stream`                                                          |
| **App Runner**        | `service`, `status`, `latency_ms`, `timestamp`                                                                                    |
| **Batch**             | `jobId`, `jobName`, `jobQueue`, `level`, `message`, `timestamp`, `arrayIndex`                                                     |
| **Fargate**           | `cluster`, `taskId`, `taskDefinition`, `container`, `level`, `message`, `timestamp`                                               |
| **Step Functions**    | `executionArn`, `stateMachine`, `state`, `status`, `durationSeconds`, `timestamp`                                                 |
| **CodeBuild**         | `buildId`, `project`, `phase`, `status`, `durationSeconds`, `timestamp`                                                           |
| **CodePipeline**      | `pipeline`, `executionId`, `stage`, `state`, `timestamp`                                                                          |
| **Kinesis Analytics** | `applicationName`, `recordsPerSecond`, `inputWatermarkLagMs`, `level`, `message`, `timestamp`                                     |
| **Athena**            | `queryId`, `workgroup`, `database`, `state`, `durationSeconds`, `dataScannedBytes`, `timestamp`                                   |
| **Elastic Beanstalk** | `application`, `environment`, `status`, `message`, `timestamp`                                                                    |
| **EventBridge**       | `id`, `source`, `detailType`, `rule`, `eventBus`, `message`, `timestamp`                                                          |
| **DynamoDB**          | `table`, `operation`, `consumedReadCapacityUnits`, `consumedWriteCapacityUnits`, `timestamp`                                      |
| **IoT Core**          | `clientId`, `action`, `topic`, `message`, `timestamp`                                                                             |
| **CloudFormation**    | `stackName`, `action`, `stackStatus`, `resourceType`, `message`, `timestamp`                                                      |
| **SSM**               | `commandId`, `documentName`, `instanceId`, `action`, `status`, `timestamp`                                                        |
| **EMR**               | `clusterId`, `applicationId`, `containerId`, `logLevel`, `message`, `timestamp`, `component`                                      |
| **SageMaker**         | `domainId`, `space`, `appType`, `user`, `level`, `message`, `timestamp`, `event`                                                  |

---

## Pipeline processor (template)

Each pipeline uses a single processor. Replace `<target_field>` with the value from the table (e.g. `lambda.parsed`).

```json
{
  "description": "Parse JSON from the log message field. Stores parsed object under <target_field>; non-JSON messages are left unchanged.",
  "processors": [
    {
      "json": {
        "field": "message",
        "target_field": "<target_field>",
        "ignore_failure": true
      }
    }
  ]
}
```

Pipeline JSON files are provided in this folder for **Glue**, **Lambda**, **API Gateway**, **EMR**, and **RDS**. For any other service, copy one of them, change `target_field` and the pipeline ID in the `PUT _ingest/pipeline/<id>` request, then apply.
