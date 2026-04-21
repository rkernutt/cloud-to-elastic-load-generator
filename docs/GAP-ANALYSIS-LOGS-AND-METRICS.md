# Gap Analysis: Complete Logs and Metrics for All Services

> **Last updated:** 2026-04-21

This document compares what the **Cloud to Elastic Load Generator** (AWS catalog) currently emits per service with what is needed for **complete** logs and metrics as defined by **Elastic AWS integration** and **AWS service documentation**. Use it to prioritize additions (fields, message types, metrics) for full fidelity in Elastic dashboards, rules, and ML.

**Current coverage (`npm run samples:verify`, [README](../README.md)):** **AWS:** **212** log services, **206** metrics-supported services, **54** trace generators — **GCP:** **130** logs, **124** metrics, **48** traces — **Azure:** **131** logs, **120** metrics, **40** traces.

**Historical release notes:** v8.0 expanded metrics coverage and made `aws.dimensions` always-present; v11.x aligned `METRICS_SUPPORTED_SERVICE_IDS` with `METRICS_GENERATORS`. v7.6 aligned CloudWatch metric names/dimensions and `event.category` as an ECS array across metrics generators; v7.5 closed `event.duration` gaps, addressed RDS Enhanced Monitoring fields, and Lambda START/END/REPORT patterns. All generators use real AWS API error codes on failure paths.

**Sources of truth:**

- **Elastic:** [AWS Integration](https://docs.elastic.co/en/integrations/aws), [AWS exported fields (Metricbeat)](https://www.elastic.co/docs/reference/beats/metricbeat/exported-fields-aws), per-service integration reference (e.g. CloudTrail, Lambda, RDS).
- **AWS:** Per-service CloudWatch Logs and CloudWatch Metrics documentation (e.g. [Lambda log structure](https://docs.aws.amazon.com/lambda/latest/dg/monitoring-cloudwatchlogs.html), [RDS Enhanced Monitoring](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_Monitoring-Available-OS-Metrics.html), [CloudTrail record contents](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-event-reference-record-contents.html)).

---

## 1. Summary: Elastic vs App Coverage

### 1.1 Elastic AWS integration (reference)

From Elastic’s reference table, the following services have **Metrics** and/or **Logs** in the integration:

| Service          | Metrics | Logs | In app (logs) | In app (metrics) |
| ---------------- | ------- | ---- | ------------- | ---------------- |
| API Gateway      | ✓       | —    | ✓             | ✓                |
| Billing          | ✓       | —    | ✓             | ✓                |
| CloudFront       | —       | ✓    | ✓             | ✓                |
| CloudTrail       | —       | ✓    | ✓             | —                |
| CloudWatch       | ✓       | ✓    | ✓             | ✓                |
| DynamoDB         | ✓       | —    | ✓             | ✓                |
| EBS              | ✓       | —    | ✓             | ✓                |
| EC2              | ✓       | ✓    | ✓             | ✓                |
| ECS              | ✓       | —    | ✓             | ✓                |
| ELB              | ✓       | ✓    | ✓             | ✓                |
| Fargate          | ✓       | —    | ✓             | ✓                |
| Kinesis          | ✓       | —    | ✓             | ✓                |
| Network Firewall | ✓       | ✓    | ✓             | ✓                |
| Lambda           | ✓       | —    | ✓             | ✓                |
| NAT Gateway      | ✓       | —    | ✓             | ✓                |
| Redshift         | ✓       | —    | ✓             | ✓                |
| RDS              | ✓       | —    | ✓             | ✓                |
| Route 53         | —       | ✓    | ✓             | —                |
| S3               | ✓       | ✓    | ✓             | ✓                |
| S3 Storage Lens  | ✓       | —    | ✓             | ✓                |
| SNS              | ✓       | —    | ✓             | ✓                |
| SQS              | ✓       | —    | ✓             | ✓                |
| Transit Gateway  | ✓       | —    | ✓             | ✓                |
| Usage            | ✓       | —    | (billing)     | ✓                |
| VPC Flow         | —       | ✓    | ✓             | —                |
| VPN              | ✓       | —    | ✓             | ✓                |
| WAF              | —       | ✓    | ✓             | ✓                |
| Custom           | —       | ✓    | (any)         | —                |

**Gaps vs Elastic list:** NAT Gateway and S3 Storage Lens **are** implemented as separate services (logs + metrics).

### 1.2 App state (high level)

- **Logs:** **212** services; each generator returns one document shape (single “log event” style).
- **Metrics:** **206 services** support metrics mode (`METRICS_SUPPORTED_SERVICE_IDS`, aligned with `METRICS_GENERATORS`); documents include `data_stream.type: “metrics”`, `metricset`, and `aws.<service>.metrics` (or equivalent).
- **Structured `message`:** Many services probabilistically emit JSON in `message` (see [INGEST-PIPELINE-REFERENCE.md](INGEST-PIPELINE-REFERENCE.md)); not all do.
- **`event.duration`:** Present on all time-bound services (closed in v7.5).
- **`aws.dimensions`:** Always-present on all generators (closed in v8.0).

### 1.3 Chained event scenarios (security and data pipeline)

Multi-step **Chained Events** generators emit **time-distributed** logs with explicit correlation labels so dashboards, detection rules, and ML jobs can group related documents:

| Scenario                                       | AWS                                      | GCP                      | Azure                              | Correlation label(s)                                                                 |
| ---------------------------------------------- | ---------------------------------------- | ------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------ |
| Security Finding (detect → aggregate → triage) | GuardDuty → Security Hub → Security Lake | SCC → Chronicle → SecOps | Defender → Sentinel → Activity Log | `labels.finding_chain_id`                                                            |
| IAM privilege escalation                       | CloudTrail IAM/STS                       | Cloud Audit (IAM)        | Entra ID + Activity Log            | `labels.attack_session_id`                                                           |
| Data exfiltration                              | GuardDuty + CloudTrail + VPC Flow        | DLP + VPC + GCS          | Defender + Blob + NSG              | `labels.exfil_chain_id`                                                              |
| Data & Analytics Pipeline                      | S3 → EMR → Glue → Athena → MWAA          | GCS → Dataproc → …       | Blob → Databricks → …              | `pipeline_run_id` (and related fields; see [chained-events docs](./chained-events/)) |

Each scenario has matching **Kibana dashboards**, **Elasticsearch-query alert rules**, and **ML anomaly detection jobs** under `installer/{aws,gcp,azure}-custom-{dashboards,rules,ml-jobs}/` (file names include `security-finding-chain`, `iam-privesc-chain`, `data-exfil-chain`, and `data-pipeline` where applicable). Counts per cloud are summarized in [diagrams.md](./diagrams.md).

### 1.4 CSPM / KSPM — Real CIS benchmark findings

CSPM and KSPM generators produce findings documents identical to what Elastic's **cloudbeat** agent writes to `logs-cloud_security_posture.findings-default`. Every finding uses **real CIS rule UUIDs, names, sections, and benchmark metadata** sourced from `elastic/cloudbeat` (321 rules total across 5 benchmarks):

| Benchmark | Rules | Sections |
|-----------|-------|----------|
| CIS AWS Foundations v1.5.0 | 55 | IAM (16), S3 (4), EC2 (1), RDS (3), Logging (11), Monitoring (16), Networking (4) |
| CIS GCP Foundations v2.0.0 | 71 | IAM, Logging/Monitoring, Networking, VMs, Storage, SQL, BigQuery |
| CIS Azure Foundations v2.0.0 | 72 | IAM, Defender, Storage, SQL, Logging, Networking, VMs, Key Vault, App Service |
| CIS EKS v1.4.0 | 31 | Logging, Authentication, Networking, Pod Security |
| CIS Kubernetes v1.0.1 | 92 | Control Plane, etcd, RBAC, Worker Nodes, Pod Security Standards |

Failed findings include realistic resource evidence — for example, S3 buckets with `ServerSideEncryptionConfiguration: null`, security groups with `0.0.0.0/0` SSH ingress, IAM users with `mfa_active: false`, or pods with `privileged: true`. When the `cloud_security_posture` Fleet integration is installed (automatic when CSPM/KSPM services are selected in the Setup wizard), Elastic's built-in Posture Dashboard, Findings page, and Benchmark Rules pages display the generated data exactly as they would with real cloud infrastructure.

---

## 2. Cross‑cutting Gaps (All or Many Services)

### 2.1 Logs

| Gap                                        | Description                                                                                                                                                                                                                                                                                                                                                                                          | Elastic / AWS reference                                                                                                                           | Priority                           |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| **Single event type per document**         | Real CloudWatch log streams have multiple line types (e.g. Lambda START, REPORT, END, extension events). We emit one document = one “event” and do not model START/REPORT/END as separate message types.                                                                                                                                                                                             | [Lambda log structure](https://docs.aws.amazon.com/lambda/latest/dg/monitoring-cloudwatchlogs.html); CloudWatch Logs Insights discoverable fields | High for Lambda; medium for others |
| **`log.group` / `log.file.path`**          | Elastic and CloudWatch use log group (and often log stream) on each event. We set `aws.lambda.log_group` etc. in some generators but not a consistent ECS `log.*` or `log.file.path` for every service.                                                                                                                                                                                              | ECS log fields; CloudWatch log group/stream                                                                                                       | Medium                             |
| **Cold start and init duration**           | Lambda REPORT lines include `Init Duration` and `Billed Duration`; cold starts are a distinct scenario. We do not emit separate cold-start events or init duration.                                                                                                                                                                                                                                  | Lambda REPORT format                                                                                                                              | Medium                             |
| **RDS Enhanced Monitoring (RDSOSMetrics)** | RDS can emit OS metrics to CloudWatch Logs (`RDSOSMetrics` log group) with engine, instanceID, CPU, disk, memory, etc. We do not generate this log type.                                                                                                                                                                                                                                             | [RDS Enhanced Monitoring](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_Monitoring-Available-OS-Metrics.html)                       | Medium                             |
| **CloudTrail record shape**                | CloudTrail has a fixed record schema: `eventVersion`, `userIdentity`, `eventTime`, `eventSource`, `requestParameters`, `responseElements`, etc. Our CloudTrail generator approximates this; full alignment with [CloudTrail record contents](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-event-reference-record-contents.html) would improve rule/dashboard compatibility. | Elastic CloudTrail integration; AWS CloudTrail event reference                                                                                    | Medium                             |
| **VPC Flow Logs format**                   | AWS defines a strict format (version, account-id, interface-id, srcaddr, dstaddr, srcport, dstport, protocol, packets, bytes, start, end, action, log-status). We align but could add missing fields (e.g. pkt-srcaddr, pkt-dstaddr for NAT) if supporting NAT Gateway.                                                                                                                              | VPC Flow Logs format; Elastic vpcflow                                                                                                             | Low unless adding NAT              |

### 2.2 Metrics

| Gap                             | Description                                                                                                                                                                                        | Elastic / AWS reference                                                                                                             | Priority |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **Metric names and dimensions** | Some generators use slightly different names or nesting than CloudWatch/Elastic. Exact CloudWatch metric names and dimensions improve drop-in compatibility with Elastic’s AWS metrics dashboards. | [Metricbeat AWS fields](https://www.elastic.co/docs/reference/beats/metricbeat/exported-fields-aws); CloudWatch metrics per service | High     |
| **NAT Gateway**                 | ~~No NAT Gateway service~~ **Addressed:** NAT Gateway service added (logs + metrics).                                                                                                              | Elastic reference table                                                                                                             | Done     |
| **S3 Storage Lens**             | ~~No S3 Storage Lens service~~ **Addressed:** S3 Storage Lens service added (metrics + log-style events).                                                                                          | Elastic reference table                                                                                                             | Done     |
| **Multi-dimensional metrics**   | Real CloudWatch metrics are often split by dimension (e.g. InstanceId, TableName). We often emit one aggregate; adding dimension breakdowns would better match real data.                          | CloudWatch dimensions; Elastic dashboards                                                                                           | Medium   |

### 2.3 Messages and details

| Gap                              | Description                                                                                                                                                                                                                            | Elastic / AWS reference                           | Priority       |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | -------------- |
| **Structured JSON in `message`** | More services could emit parseable JSON in `message` (with an ingest pipeline target) for consistent parsing. See [INGEST-PIPELINE-REFERENCE.md](INGEST-PIPELINE-REFERENCE.md).                                                        | Ingest pipelines; AWS structured logging patterns | Medium         |
| **Error codes and messages**     | Some services have a fixed set of error messages; expanding to match AWS error codes and messages would improve realism and testing.                                                                                                   | AWS API/service error docs                        | Low–medium     |
| **Request/response IDs**         | ~~X-Ray trace IDs~~ **Addressed:** Lambda and API Gateway now emit optional `trace.id` (X-Ray format) and `aws.<service>.trace_id`. Error codes expanded for DynamoDB, RDS, API Gateway; S3 has optional structured JSON in `message`. | Lambda requestId; API Gateway request ID; X-Ray   | Partially done |

---

## 3. Gaps by Category (Logs, Metrics, Messages)

### 3.1 Serverless & Core

| Service         | Logs gap                                                                                                                                                                             | Metrics gap                                                                                                                                    | Messages / details gap                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Lambda**      | Emit distinct START / REPORT / END (and optionally extension) message types; add `Init Duration`, `Billed Duration`, `Memory Size`, `Max Memory Used` in REPORT; cold-start variant. | Align metric names with CloudWatch (Invocations, Errors, Throttles, Duration, ConcurrentExecutions); optional IteratorAge for stream-based.    | requestId in every message; **X-Ray trace ID (done:** `trace.id`, `aws.lambda.trace_id`); runtime and log stream. |
| **API Gateway** | Access log format (requestId, ip, caller, method, path, status, latency); optional execution/integration latency breakdown.                                                          | Already strong; ensure dimensions (ApiId, ApiName, Stage).                                                                                     | **Trace ID (done:** `trace.id`, `aws.apigateway.trace_id`); more HTTP details (query string, response length).    |
| **VPC Flow**    | Strict field set per [VPC Flow Logs format](https://docs.aws.amazon.com/vpc/latest/userguide/flow-log-records.html); pkt-srcaddr/pkt-dstaddr for NAT if needed.                      | N/A (logs only in Elastic).                                                                                                                    | —                                                                                                                 |
| **CloudTrail**  | Full record: eventVersion, userIdentity, eventTime, eventSource, eventName, requestParameters, responseElements, sourceIPAddress, userAgent, errorCode, errorMessage.                | N/A.                                                                                                                                           | Management vs data vs insight events; readOnly.                                                                   |
| **RDS**         | Add RDSOSMetrics-style log (Enhanced Monitoring) with engine, instanceID, CPU, disk, memory; error log line type.                                                                    | Align with CloudWatch RDS metrics (CPUUtilization, DatabaseConnections, ReadIOPS, WriteIOPS, ReadLatency, WriteLatency, FreeableMemory, etc.). | Postgres/MySQL error log message formats.                                                                         |
| **ECS**         | Task state change events (PENDING, RUNNING, STOPPED); container exit codes; optional service event messages.                                                                         | Already good; ensure TaskDefinitionFamily dimension where used.                                                                                | —                                                                                                                 |

### 3.2 Compute & Containers

| Service        | Logs gap                                                                                     | Metrics gap                                                                                            | Messages / details gap |
| -------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------- |
| **EC2**        | System log vs instance status; optional console output snippet.                              | InstanceId, InstanceType, AutoScalingGroupName dimensions; DiskReadOps/WriteOps, NetworkPacketsIn/Out. | —                      |
| **EKS**        | Control plane logs (api, audit, authenticator, scheduler); data plane (kubelet, containerd). | ClusterName dimension; node/pod CPU and memory where applicable.                                       | —                      |
| **Fargate**    | Task stopped reason; container exit code.                                                    | Already updated; align with ECS metrics naming.                                                        | —                      |
| **Batch**      | Job queue and job definition; array job index; attempt number.                               | JobQueueName, JobDefinition dimensions; optional vCPU/memory utilization.                              | —                      |
| **App Runner** | Request log with latency; service state change.                                              | Already good.                                                                                          | —                      |
| **Beanstalk**  | Environment health; deployment lifecycle; request 2xx/4xx/5xx counts in message.             | Already good.                                                                                          | —                      |

### 3.3 Networking & CDN

| Service          | Logs gap                                                                                                                                        | Metrics gap                                                                                                                  | Messages / details gap |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| **ALB**          | Access log fields: target:port, request_processing_time, target_processing_time, response_processing_time, elb_status_code, target_status_code. | LoadBalancer, TargetGroup, AvailabilityZone dimensions; SSL errors if applicable.                                            | —                      |
| **NLB**          | Flow log (connection duration, TLS version); target group and listener.                                                                         | Same as ALB where applicable.                                                                                                | —                      |
| **CloudFront**   | Standard access log fields (x-edge-location, sc-bytes, time-taken, cs-method, etc.).                                                            | DistributionId, Region; ErrorRate, BytesDownloaded, Requests.                                                                | —                      |
| **WAF / WAF v2** | Rule group and rule ID; action (ALLOW, BLOCK, COUNT); request snippet.                                                                          | Rule/WebACL dimensions if used by Elastic.                                                                                   | —                      |
| **Route 53**     | Query type, query name, resolver endpoint; response code.                                                                                       | N/A (logs in Elastic).                                                                                                       | —                      |
| **NAT Gateway**  | Implemented.                                                                                                                                    | Implemented; BytesInToDestination, BytesOutFromSource, PacketsInToDestination, PacketsOutFromSource, connection/port errors. | —                      |

### 3.4 Security & Compliance

| Service          | Logs gap                                                                         | Metrics gap         | Messages / details gap |
| ---------------- | -------------------------------------------------------------------------------- | ------------------- | ---------------------- |
| **GuardDuty**    | Finding schema (type, severity, resource, service, confidence); optional sample. | N/A (findings API). | —                      |
| **Security Hub** | Full finding (AwsSecurityFinding format); compliance status.                     | N/A; CSPM uses API. | —                      |
| **Inspector**    | CVE, package, severity; EC2/ECR finding type.                                    | N/A.                | —                      |
| **Config**       | ConfigurationItemChangeNotification; compliance change.                          | N/A.                | —                      |

### 3.5 Storage & Databases

| Service         | Logs gap                                                                                                                                                                                                                            | Metrics gap                                                                                                               | Messages / details gap |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| **S3**          | Access log (key, bucket, operation, referer, bytes); **optional JSON in `message` (done:** bucket, key, operation, http_status, request_id, bytes_sent, total_time_ms, timestamp). S3 Storage Lens implemented as separate service. | Bucket, FilterId; NumberOfObjects, BucketSizeBytes.                                                                       | —                      |
| **DynamoDB**    | Stream record (eventName, Keys, NewImage); conditional check failure.                                                                                                                                                               | TableName, Operation; UserErrors, SystemErrors, ThrottledRequests; ConsumedReadCapacityUnits, ConsumedWriteCapacityUnits. | —                      |
| **ElastiCache** | Engine-specific (Redis) command and key; replication lag.                                                                                                                                                                           | CacheClusterId, CacheNodeId; CurrConnections, CacheHits, CacheMisses, ReplicationLag.                                     | —                      |
| **Redshift**    | Query log (query_id, duration, rows); connection log.                                                                                                                                                                               | ClusterIdentifier; CPUUtilization, PercentageDiskSpaceUsed, ReadLatency, WriteLatency.                                    | —                      |
| **OpenSearch**  | Index/search slow log; audit log.                                                                                                                                                                                                   | DomainName; SearchLatency, IndexingLatency, JVMMemoryPressure, ClusterStatus.                                             | —                      |
| **DocumentDB**  | Slow query; opcode and collection.                                                                                                                                                                                                  | Cluster, Role; CPUUtilization, DatabaseConnections, ReadIOPS, WriteIOPS.                                                  | —                      |
| **Aurora**      | MySQL/Postgres error and slow query; replication lag.                                                                                                                                                                               | DBClusterIdentifier; ServerlessDatabaseCapacity, etc.                                                                     | —                      |

### 3.6 Streaming & Messaging

| Service            | Logs gap                                                        | Metrics gap                                                                                                          | Messages / details gap |
| ------------------ | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| **Kinesis**        | PutRecord/PutRecords success/failure; shard iterator.           | StreamName, ShardId; IncomingRecords, IncomingBytes, IteratorAgeMilliseconds, WriteProvisionedThroughputExceeded.    | —                      |
| **Firehose**       | Delivery to S3/Redshift/OpenSearch; buffer and delivery errors. | DeliveryStreamName; DeliveryToS3*, IncomingRecords, DeliveryToElasticsearch\_*.                                      | —                      |
| **MSK**            | Broker log; topic and partition.                                | Cluster, Broker, Topic; BytesInPerSec, BytesOutPerSec, UnderReplicatedPartitions.                                    | —                      |
| **SQS**            | Receive/delete visibility; DLQ attributes.                      | QueueName; ApproximateNumberOfMessagesVisible, ApproximateAgeOfOldestMessage, NumberOfMessagesSent/Received/Deleted. | —                      |
| **SNS**            | Publish and delivery status; endpoint attributes.               | TopicName; NumberOfMessagesPublished, NumberOfNotificationsDelivered, NumberOfNotificationsFailed.                   | —                      |
| **EventBridge**    | Rule invocation; target success/failure; dead-letter.           | EventBusName, RuleName; Invocations, FailedInvocations, TriggeredRules.                                              | —                      |
| **Step Functions** | State entered/exited; task token; execution history.            | StateMachineArn; ExecutionsStarted, ExecutionsSucceeded, ExecutionsFailed, ExecutionTime.                            | —                      |

### 3.7 Analytics & ML

| Service                     | Logs gap                                                                        | Metrics gap                                                                                   | Messages / details gap |
| --------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------- |
| **Glue**                    | Job run bookkeeping; driver/executor log; continuous logging JSON.              | Already strong (skewness, heap, disk, workerUtilization); JobName, JobRunId, Type dimensions. | —                      |
| **EMR**                     | Step and job flow; YARN/Spark log line.                                         | ClusterId; CoreNodesPending, HDFSUtilization, etc.                                            | —                      |
| **Athena**                  | Query state (QUEUED, RUNNING, SUCCEEDED, FAILED); data scanned; engine version. | Already added; WorkGroup, DataScannedInBytes, EngineExecutionTimeInMillis.                    | —                      |
| **SageMaker**               | Training job and endpoint log; model and pipeline.                              | Invocations, ModelLatency, GPUUtilization, DiskUtilization; already extended.                 | —                      |
| **Bedrock / Bedrock Agent** | Model ID, token counts, guardrail action.                                       | Invocations, InvocationLatency, InputTokenCount, OutputTokenCount, Throttles; already added.  | —                      |

### 3.8 Management & Governance

| Service             | Logs gap                                      | Metrics gap                                               | Messages / details gap |
| ------------------- | --------------------------------------------- | --------------------------------------------------------- | ---------------------- |
| **CloudWatch**      | Metric alarm state change; alarm description. | Namespace, MetricName, dimensions; alarm-related metrics. | —                      |
| **AWS Health**      | Event type; affected entities; description.   | awshealth.\* fields per Metricbeat.                       | —                      |
| **Billing / Usage** | Cost and usage line item; group keys.         | Already; Service, UsageType, dimensions.                  | —                      |

### 3.9 Other services (high level)

- **CodeBuild / CodePipeline / CodeDeploy:** Build and deployment phase messages; artifact and environment details.
- **IoT (Core, Greengrass, Events, SiteWise, Defender):** Thing and topic; shadow and rule actions; connection state.
- **Connect / WorkSpaces / AppStream / GameLift:** Session and user; connection and latency.
- **MediaConvert / MediaLive:** Job and channel state; input/output and errors.
- **Remaining catalog services:** Many have no Elastic integration; gaps are mainly (1) consistent `event.duration`, (2) optional `aws.<service>.metrics` block for future dashboards, (3) structured `message` where AWS supports it.

---

## 4. Recommended Priorities

Items marked ✅ are now addressed.

1. **Closed (High)**
   - ✅ Lambda START/REPORT/END log events and REPORT fields (Billed Duration, Max Memory Used, Init Duration) — v7.5
   - ✅ Metrics: CloudWatch metric name and dimension alignment across all metrics-supported services (currently **206**) — v7.6 through v11.x+
   - ✅ `event.duration` on all time-bound services — v7.5
   - ✅ `aws.dimensions` always-present on all generators — v8.0
   - ✅ Real AWS API error codes on all failure paths — v7.6

2. **Closed (Medium)**
   - ✅ RDS Enhanced Monitoring OS metrics (`cpuUtilization`, `memory`, `disk`, `network`) — v7.5
   - ✅ NAT Gateway service (logs + metrics) — implemented
   - ✅ S3 Storage Lens service (metrics + log-style events) — implemented
   - ✅ `event.category` as ECS array on all generators — v7.6

3. **Still open (lower priority)**
   - CloudTrail: full record shape (eventVersion, userIdentity, requestParameters, responseElements) for tighter dashboard/rule compatibility
   - `log.group` / `log.file.path` ECS fields consistently across all services
   - More structured `message` JSON for additional services beyond current set
   - CloudFront: additional access log fields (x-edge-location, sc-bytes, time-taken)

---

## 5. How to use this document

- **Implementing a service:** Check its row in §3 and §1.1; add missing log fields, message types, and metrics from AWS and Elastic docs.
- **Adding a new service:** Ensure logs + metrics (if in Elastic table), dimensions, and at least one realistic message type.
- **Ingest pipelines:** When adding JSON in `message`, update [INGEST-PIPELINE-REFERENCE.md](INGEST-PIPELINE-REFERENCE.md) and run `npm run setup:aws-pipelines` to install the updated pipeline.

After changes, regenerate samples with `npm run samples`.
