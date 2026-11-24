# Competitive SIEM coverage: Amazon SageMaker

Research date: 2026-11-24.
Product: Amazon SageMaker (aliases: SageMaker, AWS SageMaker, Amazon SageMaker AI, training jobs, endpoints, Model Monitor, Pipelines, Feature Store).
Vendor: Amazon Web Services.

Scope: whether IBM QRadar, Splunk, and Sumo Logic ship an integration or app for SageMaker, what data it covers, and how it collects that data. A generic AWS or CloudWatch integration is a **partial** match, not an exact SageMaker integration.

## 1. Summary table

Use this table in research brief section 1.5.

| Competitor | Match                                                        | Integration                                                                                                                                                              | Collection method                                                                                                                                                                                                                                                                                            | Coverage snapshot                                                                                                                                                                                                                                                                                                                                 | Maintenance                                                                                                                                                                                                                                                                                    |
| ---------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IBM QRadar | Partial. No SageMaker DSM or App Exchange extension found.   | Amazon AWS CloudTrail DSM, plus the generic Amazon Web Services protocol (CloudWatch Logs / Kinesis / SQS).                                                              | API pull. CloudTrail JSON from S3 (`Amazon AWS S3 REST API`) or from a CloudWatch log group (`Amazon Web Services` protocol). CloudWatch Logs: one log group per log source. Auth: access key or EC2 instance IAM role.                                                                                      | Control-plane CloudTrail events (`eventSource` `sagemaker.amazonaws.com`) land as generic CloudTrail JSON. Endpoint, training, processing, and transform logs can be pulled only if an operator points a log source at `/aws/sagemaker/*`. No SageMaker parser, QID map, metrics, or dashboards.                                                  | CloudTrail DSM is an IBM-supported, auto-discovered DSM. No SageMaker-specific release. AWS protocol requires QRadar 7.3.1+ and the Log Source Management app. Last-updated date is not shown on the DSM page.                                                                                 |
| Splunk     | Partial. No SageMaker app, Technology Add-on, or sourcetype. | Splunk Add-on for Amazon Web Services (AWS), app ID `Splunk_TA_aws`, Splunkbase app 1876. Splunk-built.                                                                  | API pull (CloudTrail via S3/SQS, CloudWatch `GetMetricData`, CloudWatch Logs API) and push (Kinesis Data Firehose or EventBridge to HEC). Auth: access key ID + secret key, IAM `AssumeRole`, or auto-discovered EC2 instance role (not on Splunk Cloud).                                                    | Generic sourcetypes only: `aws:cloudtrail`, `aws:cloudwatch`, `aws:cloudwatchlogs`. Operator must name SageMaker log groups and metric namespaces. No SageMaker field extractions. CIM maps CloudTrail to Authentication and Change, and CloudWatch metrics to Performance. Endpoint access logs stay inside the generic CloudWatch Logs message. | Version 8.3.1, published 2026-10-21. Splunk-supported. 1,169,300 downloads (Splunkbase API, fetched 2026-11-24). 33 reviews on the listing. Numeric star average was not in the API payload. Compatible with Splunk Enterprise and Splunk Cloud 9.3–10.8, CIM 5.x (release notes: CIM 5.1.1+). |
| Sumo Logic | Exact. Named Amazon SageMaker app.                           | Amazon SageMaker app in the Sumo Logic App Catalog. Sumo-built. Docs: [Amazon SageMaker](https://www.sumologic.com/help/docs/integrations/amazon-aws/amazon-sagemaker/). | CloudTrail from the trail S3 bucket. CloudWatch Logs via Kinesis Data Firehose (recommended) or a Lambda forwarder. CloudWatch metrics via Kinesis Firehose for Metrics (recommended) or the CloudWatch metrics source. Auth: access key ID + secret, or IAM role. Log groups must match `/aws/sagemaker/*`. | Ten dashboards (Overview, CloudTrail Audit, Models, Endpoints, Endpoints Invocations, Feature Store, Pipeline, Processing Jobs, Transform Jobs, Training Jobs) and seven CPU/GPU/pipeline-duration monitors. Field extraction rules for `sagemaker.amazonaws.com` and `/aws/sagemaker/*`. Observability content, not detection rules.             | First published in the 2026-03-31 apps release. No public version number or download count. Vendor-supported, installed from the in-product App Catalog.                                                                                                                                       |

## 2. IBM QRadar

**Result: no SageMaker integration. Partial coverage only through generic AWS DSMs.**

### Integration identity

| Item                       | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact SageMaker app or DSM | Not found.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Nearest supported DSMs     | Amazon AWS CloudTrail; generic Amazon Web Services protocol for CloudWatch Logs, Kinesis Data Streams, and SQS. Other Amazon DSMs (ALB, Config, EKS, Network Firewall, Route 53, Security Hub, WAF, CloudFront, GuardDuty, Verified Access) do not parse SageMaker logs.                                                                                                                                                                                                                                                          |
| Publisher                  | IBM, for the CloudTrail DSM and the AWS protocol.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Catalog URLs               | [QRadar SIEM integrations](https://www.ibm.com/products/qradar-siem/integrations) (partner marketing page, not a filterable DSM catalog). Authoritative list: [QRadar supported DSMs](https://www.ibm.com/docs/en/dsm?topic=configuration-qradar-supported-dsms). CloudTrail DSM: [Amazon AWS CloudTrail](https://www.ibm.com/docs/en/dsm?topic=amazon-aws-cloudtrail). Protocol: [Amazon Web Services protocol configuration options](https://www.ibm.com/docs/en/dsm?topic=options-amazon-web-services-protocol-configuration). |
| Version                    | CloudTrail DSM RPM name pattern `DSM-AmazonAWSCloudTrail-<QRadar_version>-<Build_number>.noarch.rpm`. No build number is published on the page.                                                                                                                                                                                                                                                                                                                                                                                   |
| Last updated               | Not shown on the DSM or protocol pages.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Compatibility              | Amazon Web Services protocol requires QRadar 7.3.1 or later and the IBM QRadar Log Source Management app. CloudTrail DSM is auto-discovered.                                                                                                                                                                                                                                                                                                                                                                                      |
| X-Force / App Exchange     | No SageMaker extension was found. `site:exchange.xforce.ibmcloud.com` searches for SageMaker returned unrelated QRadar apps. The Exchange UI is client-rendered, so an unindexed new app could be missed. The IBM-supported DSM table, which is the catalog QRadar actually ships, has no SageMaker row. Third-party DSM table: [DSMs supported by third-party vendors](https://www.ibm.com/docs/en/dsm?topic=configuration-dsms-supported-by-third-party-vendors).                                                               |

The integrations marketing page says QRadar ships 450+ DSMs and links to the DSM guide and the [IBM Security App Exchange](https://exchange.xforce.ibmcloud.com/hub/). It does not list SageMaker.

Amazon rows in the supported-DSM table (retrieved 2026-11-24):

| Device                                                      | Protocol                                 | What it records                                                         |
| ----------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------- |
| Amazon AWS Application Load Balancer Access Logs            | S3 REST API                              | Access logs                                                             |
| Amazon AWS CloudTrail                                       | S3 REST API, Amazon Web Services         | CloudTrail JSON, event versions 1.0, 1.02, 1.03, 1.04, 1.05, 1.06, 1.08 |
| Amazon AWS Config                                           | S3 REST API                              | JSON                                                                    |
| Amazon AWS Elastic Kubernetes Service (Kubernetes API 1.19) | Amazon Web Services                      | JSON                                                                    |
| Amazon AWS Network Firewall                                 | S3 REST API                              | Alert and flow logs                                                     |
| Amazon AWS Route 53                                         | Amazon Web Services, S3 REST API, Syslog | Resolver and public DNS query logs                                      |
| Amazon AWS Security Hub                                     | Amazon Web Services                      | ASFF JSON                                                               |
| Amazon AWS WAF                                              | S3 REST API                              | Allow and block                                                         |
| Amazon CloudFront                                           | Amazon Web Services                      | Real-time TSV logs                                                      |
| Amazon GuardDuty                                            | Amazon Web Services                      | Findings JSON                                                           |
| AWS Verified Access                                         | S3 REST API, Syslog                      | JSON                                                                    |

GuardDuty is a near-miss, not SageMaker coverage. AWS documents that GuardDuty can flag suspicious SageMaker API use (for example an unusual pre-signed notebook URL) by analyzing CloudTrail. That finding is a GuardDuty event. QRadar's GuardDuty DSM would ingest the finding, not SageMaker logs. Source: [Logging and Monitoring](https://docs.aws.amazon.com/sagemaker/latest/dg/sagemaker-incident-response.html).

### Data coverage

What an operator can get, and what they do not get:

| SageMaker data                                                                                                                                                                                                                   | QRadar behavior                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Control-plane API audit (`sagemaker.amazonaws.com`: `CreateTrainingJob`, `CreateEndpoint`, `CreatePresignedNotebookInstanceUrl`, `ListTags`, and similar)                                                                        | Ingested only because it is CloudTrail. Parsed as CloudTrail JSON. No documented SageMaker event names, custom properties, or identity enrichment (`Includes identity?` No, `Includes custom properties?` No). |
| `InvokeEndpoint` / runtime data-plane calls                                                                                                                                                                                      | Not in CloudTrail. AWS states CloudTrail does not monitor `InvokeEndpoint`. QRadar therefore does not see inference calls through the CloudTrail DSM.                                                          |
| Endpoint access logs (`/aws/sagemaker/Endpoints/<name>`), training logs (`/aws/sagemaker/TrainingJobs`), processing logs (`/aws/sagemaker/ProcessingJobs`), transform logs (`/aws/sagemaker/TransformJobs`)                      | Collectable as raw CloudWatch Logs if the operator creates a log source per log group. No SageMaker DSM parses `ACCESS_LOG` lines, job logs, or log-group structure.                                           |
| CloudWatch metrics (`AWS/SageMaker`, `/aws/sagemaker/Endpoints`, `/aws/sagemaker/TrainingJobs`, `/aws/sagemaker/ProcessingJobs`, `/aws/sagemaker/TransformJobs`, `/aws/sagemaker/InferenceComponents`, Feature Store, pipelines) | Not a documented AWS-protocol data type. The protocol collects CloudWatch **Logs**, Kinesis, and SQS, not CloudWatch metrics.                                                                                  |
| Model Monitor / Clarify reports, data-capture files in S3, Studio or notebook Jupyter logs, Ground Truth worker logs                                                                                                             | No DSM. Generic S3 collection is not a SageMaker parser.                                                                                                                                                       |

### Collection method

CloudTrail DSM ([source](https://www.ibm.com/docs/en/dsm?topic=amazon-aws-cloudtrail)):

- Protocols: `Amazon AWS S3 REST API` and `Amazon Web Services`.
- Format: CloudTrail JSON. S3 collection accepts only the default CloudTrail object name, `_CloudTrail_<region>_<YYYYMMDDTHHMMZ>_<UniqueString>.json.gz`.
- Recorded versions: 1.0, 1.02, 1.03, 1.04, 1.05, 1.06, 1.08.
- Auto-discovered: yes.

CloudWatch Logs path ([protocol options](https://www.ibm.com/docs/en/dsm?topic=options-amazon-web-services-protocol-configuration), [CloudTrail-via-CloudWatch procedure](https://www.ibm.com/docs/en/dsm?topic=caaclsbuawspcl-adding-amazon-aws-cloudtrail-log-source-by-using-amazon-web-services-protocol-cloudwatch-logs)):

- Protocol configuration: Amazon Web Services. AWS Service: CloudWatch Logs.
- One log source collects one log group. A fleet of endpoints (each with `/aws/sagemaker/Endpoints/<endpoint-name>`) means one QRadar log source per endpoint, plus separate sources for the shared job log groups.
- Optional log-stream name. Blank collects every stream in the group.
- Filter pattern is an exact substring, not a regex. The documented example is the word `ACCEPT`.
- `Extract Original Event` unwraps the CloudWatch envelope and forwards only the original message. For SageMaker container logs that message is often unstructured text, so a CloudTrail DSM will not parse it.
- Authentication: Access Key ID / Secret Key, or EC2 Instance IAM Role when the QRadar managed host runs on EC2. The EC2-role method does not work outside AWS.
- Regions are selected per log source.
- `Use As A Gateway Log Source` can hand events to traffic analysis for auto-discovery of further log sources. That does not add a SageMaker parser.

The Universal Cloud REST API is a generic QRadar protocol for APIs that have no DSM. It is not a SageMaker integration and is not counted as one.

### Quality signals

- No ratings, reviews, or install counts. DSMs are product capabilities, not marketplace apps.
- Support tier: IBM-supported for the CloudTrail DSM and the AWS protocol. A custom log-source extension written for SageMaker would be customer-supported.
- Documentation quality: the CloudTrail and AWS-protocol pages are real setup docs. They never mention SageMaker, log-group prefixes, or metric namespaces.

## 3. Splunk

**Result: no SageMaker integration. Partial coverage only through the Splunk Add-on for AWS.**

### Integration identity

| Item                      | Finding                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact SageMaker app or TA | Not found. Splunkbase search for SageMaker returns the AWS add-on and unrelated ML apps (Splunk AI Toolkit, Splunk App for Data Science and Deep Learning). Those ML apps train models inside Splunk. They do not collect Amazon SageMaker.                                                                                                                                      |
| Integration name          | Splunk Add-on for Amazon Web Services (AWS)                                                                                                                                                                                                                                                                                                                                      |
| App ID                    | `Splunk_TA_aws` (Splunkbase 1876)                                                                                                                                                                                                                                                                                                                                                |
| Publisher                 | Splunk LLC. Support tier: Splunk Supported.                                                                                                                                                                                                                                                                                                                                      |
| Catalog URL               | https://splunkbase.splunk.com/app/1876                                                                                                                                                                                                                                                                                                                                           |
| Docs                      | https://splunk.github.io/splunk-add-on-for-amazon-web-services/                                                                                                                                                                                                                                                                                                                  |
| Version                   | 8.3.1                                                                                                                                                                                                                                                                                                                                                                            |
| Last updated              | 2026-10-21. Splunkbase API: `published_time` and `updated_time` `2026-10-21T09:03:38Z` / `2026-10-21T10:18:11Z`. That timestamp is the current release, not the original app (1876 has existed for years).                                                                                                                                                                       |
| Compatibility             | Listing: Splunk Enterprise and Splunk Cloud 9.3, 9.4, 10.0–10.8. CIM 5.x. Release notes for 8.3.1: Splunk 9.3.x–10.5.x, CIM 5.1.1+, Linux and Windows collectors. macOS dropped in 8.2.2. FedRAMP: `fedramp_validation` `yes`. Cloud compatible: true. The listing and the release-notes platform table disagree on 10.6–10.8. Both are cited; the listing is the broader claim. |
| Downloads                 | 1,169,300 (Splunkbase API `download_count`, fetched 2026-11-24). The HTML listing fluctuated between 1,169,191 and 1,169,300 during the same research pass.                                                                                                                                                                                                                      |
| Reviews                   | 33 reviews on the Splunkbase home listing. The apps index markup includes `rating (30)`, which is a rating count, not a star score. The app API payload did not include an average star rating. Star average: [UNVERIFIED].                                                                                                                                                      |
| Rank                      | Listing badges: #1 in Security, Fraud & Compliance and #1 in IT Operations. Those ranks are for the AWS add-on, not for SageMaker content.                                                                                                                                                                                                                                       |

Near-misses that are not SageMaker integrations:

- Splunk App for AWS reached end of life on 2022-07-15. IT dashboards moved to the Content Pack for Amazon Web Services Dashboards and Reports. Security dashboards moved to Splunk App for AWS Security Dashboards. A docs search for SageMaker on `docs.splunk.com` and `splunk.github.io` returned no SageMaker dashboards. Sources: [migration note](https://docs.splunk.com/Documentation/CPAWSDash/latest/CP/Migrate), [legacy dashboard list](https://docs.splunk.com/Documentation/AWS/6.0.3/User/Overview).
- Splunk Data Inputs (formerly Data Manager), mentioned on the add-on listing, is a Splunk Cloud AWS onboarding path. The listing does not name a SageMaker input. [UNVERIFIED] whether a Data Manager tile exists for SageMaker.
- Search for AWS (Outcold Solutions, Splunkbase 10022, v1.1.0, 2026-10-20) live-queries Cloud Control, CloudWatch Logs, CloudWatch metrics, and CloudTrail. It does not ingest, and its listing does not name SageMaker. Treat it as a generic AWS query app.

### Data coverage

The add-on description and the [source-type table](https://splunk.github.io/splunk-add-on-for-amazon-web-services/DataTypes/) list no SageMaker data type. Supported vendor products in the 8.3.1 release notes are CloudTrail, CloudTrail Lake, CloudWatch, CloudWatch Logs, Config, Config Rules, EventBridge, Inspector, Kinesis, S3, VPC Flow Logs, Transit Gateway Flow Logs, billing, metadata, SQS, SNS, IAM Access Analyzer, Security Hub findings, and Security Lake.

Sourcetypes an operator would actually use for SageMaker, all generic:

| SageMaker data                                                                                                                                                                                                         | Sourcetype if collected                                                  | What the add-on does with it                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CloudTrail management events for `sagemaker.amazonaws.com`                                                                                                                                                             | `aws:cloudtrail`                                                         | CIM Authentication and Change. No SageMaker-specific event types, tags, or dashboards. `InvokeEndpoint` is absent from CloudTrail, so it never appears here.                                                                                                                                                                                                                                                                |
| Endpoint, training, processing, transform, and notebook log groups                                                                                                                                                     | `aws:cloudwatchlogs`                                                     | Documented as "generic data from the CloudWatch Logs service." The only specialized CloudWatch Logs sourcetypes are `aws:cloudwatchlogs:vpcflow`, `aws:cloudwatchlogs:vpcflow:metric`, and `aws:cloudwatchlogs:guardduty`. SageMaker `ACCESS_LOG` lines are not extracted. CIM Network Traffic applies only to VPC flow.                                                                                                    |
| Metrics in `AWS/SageMaker`, `/aws/sagemaker/Endpoints`, `/aws/sagemaker/TrainingJobs`, `/aws/sagemaker/ProcessingJobs`, `/aws/sagemaker/TransformJobs`, `/aws/sagemaker/InferenceComponents`, Feature Store, pipelines | `aws:cloudwatch` (or `aws:cloudwatch:metric` if sent to a metrics index) | One namespace per input. The UI can take a namespace from a drop-down or a manually entered custom namespace. Examples in the docs are `AWS/EBS` and `AWS/S3`, not SageMaker. Changing the sourcetype away from `aws:cloudwatch` requires a matching `props.conf` change because extractions depend on the default. Source: [CloudWatch input](https://splunk.github.io/splunk-add-on-for-amazon-web-services/CloudWatch/). |
| Model Monitor reports, data capture, or other S3 objects                                                                                                                                                               | `aws:s3` or `aws:firehose:json` / `aws:firehose:text`                    | Generic S3 or generic Firehose. No schema.                                                                                                                                                                                                                                                                                                                                                                                  |

Official SageMaker metric namespaces, for comparison with what an operator would have to type in ([AWS docs](https://docs.aws.amazon.com/sagemaker/latest/dg/monitoring-cloudwatch.html)):

- `/aws/sagemaker/Endpoints`
- `AWS/SageMaker` (endpoint invocation metrics)
- `/aws/sagemaker/InferenceComponents`
- `/aws/sagemaker/ProcessingJobs`, `/aws/sagemaker/TrainingJobs`, `/aws/sagemaker/TransformJobs`
- Plus Feature Store, pipelines, Ground Truth, and Inference Recommender sections on the same page

None of those names appear in the add-on's source-type or vendor-product lists.

### Collection method

From the [input overview](https://splunk.github.io/splunk-add-on-for-amazon-web-services/ConfigureInputs/) and source-type table:

| Data                                            | Input types                                                                                     | Preferred path documented by Splunk                                                                                                                                                                                                                                          |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CloudTrail                                      | SQS-based S3, CloudTrail, Generic S3, Incremental S3. Also Firehose to HEC as `aws:cloudtrail`. | SQS-based S3 is the usual production path. Format is CloudTrail JSON.                                                                                                                                                                                                        |
| CloudWatch metrics                              | CloudWatch modular input (`aws_cloudwatch://`). API pull of `GetMetricData`.                    | One namespace per input. Example statistics: Average, Sum, SampleCount, Maximum, Minimum.                                                                                                                                                                                    |
| CloudWatch Logs                                 | Kinesis, and a pull-based CloudWatch Logs input.                                                | Do not use the pull API for high-volume `aws:cloudwatchlogs:*` data. Splunk documents rate limits and tells operators to use Kinesis Data Firehose instead. Source: [CloudWatch Logs input](https://splunk.github.io/splunk-add-on-for-amazon-web-services/CloudWatchLogs/). |
| Generic S3 (Model Monitor output, data capture) | Generic S3, Incremental S3, SQS-based S3                                                        | Operator-defined bucket and prefix. Sourcetype `aws:s3`.                                                                                                                                                                                                                     |

Wire format is the AWS service format (CloudTrail JSON, CloudWatch metric JSON, CloudWatch Logs messages, or raw S3 bytes). Not CEF, LEEF, or syslog. SageMaker does not push a native SIEM feed.

Authentication ([Manage AWS accounts](https://splunk.github.io/splunk-add-on-for-amazon-web-services/ManageAwsAccounts/), [IAM roles](https://splunk.github.io/splunk-add-on-for-amazon-web-services/ManageAwsIAMRole/), [auto-discovered role](https://splunk.github.io/splunk-add-on-for-amazon-web-services/AutoDiscoveredAwsIAMRole/)):

- Account tab: Key ID and Secret Key, plus a region category. Optional private-account mode for regional or VPC endpoints and a private STS URL.
- IAM Role tab: role ARN `arn:aws:iam::<account-id>:role/<role-name>` assumed with STS `AssumeRole`.
- Auto-discovered EC2 instance role when the forwarder runs on EC2. Splunk Cloud blocks this feature. The role cannot be edited inside the add-on.

Configuration the user must do:

1. Create an IAM policy that can read the chosen CloudTrail bucket, call CloudWatch Logs and CloudWatch metrics, and (if used) read the Firehose/S3 path.
2. Add the account or role in the add-on.
3. Create a CloudTrail input scoped to the trail that records SageMaker management events.
4. Create a CloudWatch Logs input or Firehose delivery for each `/aws/sagemaker/*` group the user cares about, and leave the sourcetype at `aws:cloudwatchlogs`.
5. Create one CloudWatch metric input per SageMaker namespace, with metric names and dimensions entered by hand.
6. Expect no dashboard. The legacy Splunk App for AWS is end of life and its replacements do not name SageMaker.

### Quality signals

- Splunk-supported, actively released (8.3.1 on 2026-10-21), very widely installed.
- Documentation is strong for the generic inputs and silent on SageMaker.
- Popularity of the add-on does not indicate SageMaker coverage. The same add-on is the collection path for EC2, VPC flow, CloudTrail, and billing.

## 4. Sumo Logic

**Result: exact match. Sumo Logic publishes an Amazon SageMaker app.**

### Integration identity

| Item                | Finding                                                                                                                                                                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Integration name    | Amazon SageMaker                                                                                                                                                                                                                             |
| Publisher           | Sumo Logic. Official product docs, not a partner or community app.                                                                                                                                                                           |
| Catalog URL         | Listed under [Amazon and AWS apps](https://www.sumologic.com/help/docs/integrations/amazon-aws/). App page: https://www.sumologic.com/help/docs/integrations/amazon-aws/amazon-sagemaker/                                                    |
| Install location    | In-product App Catalog. Search for the app, then Install App (the button is sometimes labeled Add Integration). Sumo recommends opening the dashboards from the AWS Observability view.                                                      |
| Version             | Not published. The docs tell operators to check the release-notes changelog and support upgrade and revert from the App Catalog.                                                                                                             |
| Last updated        | Introduced as a new app on 2026-03-31. Source: [Apps, Solutions, and Collection Integrations - March Release](https://www.sumologic.com/help/release-notes-service/2026/03/31/apps/). No later SageMaker-specific changelog entry was found. |
| Compatibility       | A Sumo Logic account with App Catalog install rights (Manage Apps, and depending on content, Manage Monitors, Manage Fields, Manage Metric Rules, Manage Collectors). No on-prem SIEM version range. This is a cloud app.                    |
| Ratings / downloads | Not published. The app is not a public download marketplace item.                                                                                                                                                                            |

### Data coverage

The app states it uses three inputs:

- SageMaker API calls from CloudTrail (`eventSource` `sagemaker.amazonaws.com`).
- Endpoint invocation logs from CloudWatch Logs.
- SageMaker runtime CloudWatch metrics.

Dashboards:

| Dashboard                                | What it shows                                                                                                                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Amazon SageMaker - Overview              | Invocations, model errors, loaded models, CPU/GPU for endpoints and training/transform/processing jobs, Feature Store latency and throttles, pipeline executions. Filters: account, region. |
| Amazon SageMaker - CloudTrail Audit      | Success and failure locations, read-only vs mutating events, most active users, events invoked on the service.                                                                              |
| Amazon SageMaker - Models                | Invocations, model latency, cache hits, max concurrent requests, model load/download/wait, per endpoint.                                                                                    |
| Amazon SageMaker - Endpoints             | CPU, GPU, GPU memory, memory, disk, loaded model count (including multi-model endpoints), access-log status and log level.                                                                  |
| Amazon SageMaker - Endpoints Invocations | Total and per-instance invocations, 4XX/5XX, model errors, overhead latency.                                                                                                                |
| Amazon SageMaker - Feature Store         | Read/write capacity units, invocations, throttles, 4XX/5XX, latency, by feature group and operation.                                                                                        |
| Amazon SageMaker - Pipeline              | Step status (started, succeeded, failed, stopped), execution and step duration.                                                                                                             |
| Amazon SageMaker - Processing Jobs       | CPU/GPU/memory/disk by job and algorithm, plus a recent-logs table.                                                                                                                         |
| Amazon SageMaker - Transform Jobs        | Same resource view for batch transform, plus recent logs.                                                                                                                                   |
| Amazon SageMaker - Training Jobs         | Same resource view for training, plus recent logs.                                                                                                                                          |

Preconfigured monitors (performance thresholds, not security detections):

| Monitor                                            | Trigger                              |
| -------------------------------------------------- | ------------------------------------ |
| Amazon Sagemaker - Pipeline Duration               | Count > 300000, recover at <= 300000 |
| Amazon Sagemaker - Processing Jobs CPU Utilization | Count > 80                           |
| Amazon Sagemaker - Processing Jobs GPU Utilization | Count > 80                           |
| Amazon Sagemaker - Training Jobs CPU Utilization   | Count > 80                           |
| Amazon Sagemaker - Training Jobs GPU Utilization   | Count > 80                           |
| Amazon Sagemaker - Transform Jobs CPU Utilization  | Count > 80                           |
| Amazon Sagemaker - Transform Jobs GPU Utilization  | Count > 80                           |

Metric namespaces the app tells operators to collect. Sumo's published strings, copied as documented (case differs from AWS; see the gap note below):

- `AWS/Sagemaker`
- `/aws/sagemaker/endpoints`
- `aws/sagemaker/modelbuildingpipeline`
- `/aws/sagemaker/processingjobs`
- `/aws/sagemaker/trainingjobs`
- `/aws/sagemaker/TransformJobs`

Log groups the app expects under `/aws/sagemaker/*`. Sample groups shown in the docs, with identifying values removed:

| Log group                                  | Sample stream shape              | Sample message shape                                                                 |
| ------------------------------------------ | -------------------------------- | ------------------------------------------------------------------------------------ |
| `/aws/sagemaker/Endpoints/<endpoint-name>` | `AllTraffic/i-0123456789abcdef0` | `<ts> [ERROR ] <thread> ACCESS_LOG - /203.0.113.10:49506 "GET /ping HTTP/1.1" 200 0` |
| `/aws/sagemaker/ProcessingJobs`            | `<job-name>/algo-1-<epoch>`      | Container stdout (library warnings, pandas, and similar)                             |
| `/aws/sagemaker/TrainingJobs`              | `<pipeline-step>/<algo>`         | `train-logloss` / `validation-logloss` lines                                         |
| `/aws/sagemaker/TransformJobs`             | `<job>/i-<id>-<epoch>`           | TorchServe-style `TS_METRICS` lines                                                  |

CloudTrail sample shape (anonymized): `eventSource` `sagemaker.amazonaws.com`, `eventName` `ListTags`, `eventType` `AwsApiCall`, `managementEvent` true, `readOnly` true, `requestParameters.resourceArn` `arn:aws:sagemaker:us-east-1:111122223333:notebook-instance/<name>`.

Field extraction rules shipped as setup instructions, not as a silent default of the collector:

- `AwsObservabilitySagemakerCloudTrailLogsFER`, ingest time. Scope includes `sagemaker.amazonaws.com`. Sets `namespace` to `aws/sagemaker` and copies `endpointname` from `requestParameters.endpointname` or `requestParameters.endpointconfigname`.
- `AwsObservabilitySagemakerCloudWatchLogsFER`, ingest time. Scope `_sourceHost=/aws/sagemaker/*`. Parses the log group into `namespace` and, for `/aws/sagemaker/Endpoints/*`, into `endpointname`. Lowercases both. Special-cases `/aws/sagemaker/groundtruth/WorkerActivity`.
- Central-account CloudTrail FER `AWS Accounts` maps `recipientAccountId` to a friendly `account` alias when many accounts share one bucket. The docs use placeholder account IDs; operators must edit them.

Fields created at install: `account`, `region`, `accountid`, `namespace`, `endpointname`.

Coverage gaps visible from the app page:

- No Model Monitor, Clarify, model-quality, bias, or feature-attribution dashboard. Data-capture and violation reports that SageMaker writes to S3 are not mentioned.
- No notebook, Studio, Canvas, or Data Wrangler dashboard. Notebook ARNs appear only as CloudTrail resources.
- Ground Truth is a special case inside the CloudWatch FER (`/aws/sagemaker/groundtruth/WorkerActivity`) and is not a dashboard.
- `/aws/sagemaker/InferenceComponents` is not in the namespace list. AWS documents that namespace separately.
- Namespace strings in the Sumo doc do not match AWS's published case (`AWS/SageMaker`, `/aws/sagemaker/Endpoints`, `/aws/sagemaker/TrainingJobs`, and so on). CloudWatch namespaces are case-sensitive. Treat the Sumo list as what the app docs tell users to configure, and confirm the live namespace in the account before collection. This mismatch is a documentation risk, not proof that the dashboards fail.
- Monitors are utilization and duration alerts. There is no detection content for sensitive control-plane calls (`CreatePresignedNotebookInstanceUrl`, `CreateModel`, public model package changes, and similar).
- CloudTrail audit cannot see `InvokeEndpoint`. Invocation visibility is the metrics dashboards plus endpoint `ACCESS_LOG` lines.

### Collection method

Three independent setups. The app install does not create the AWS sources by itself.

**CloudTrail**

1. Add an AWS CloudTrail Source on a Hosted Collector.
2. S3 region, bucket name, and a path expression (no leading slash, bucket name not included).
3. Source category `aws/observability/cloudtrail/logs`.
4. Add an `account` field whose value is a friendly account alias.
5. Access Key ID and Secret Access Key, or [role-based access](https://www.sumologic.com/help/docs/integrations/amazon-aws/amazon-sagemaker/) (the app page points at Sumo's role-based AWS access doc).
6. Log File Discovery scan interval default 5 minutes.
7. Timestamp parsing on, time zone UTC, format auto-detected. Multiline processing on, boundaries inferred.

**CloudWatch Logs**

- Enable SageMaker logging so groups match `/aws/sagemaker/*`.
- Recommended: AWS Kinesis Firehose for Logs.
- Alternative: Sumo Logic Lambda log forwarder, with or without the supplied CloudFormation template. Docs: Amazon CloudWatch Logs collection pages linked from the app.
- Add `account`, `region`, and `accountId` fields on the source.

**CloudWatch metrics**

- Recommended: AWS Kinesis Firehose for Metrics.
- Alternative: Amazon CloudWatch Source for Metrics.
- Collect the six namespaces listed above.
- Add an `account` metadata field.

Protocol and format: JSON CloudTrail records from S3, CloudWatch Logs events (JSON envelope with a `message` string), and CloudWatch metrics. Not syslog, CEF, or LEEF.

### Quality signals

- Vendor-written, current (March 2026), and linked from the official AWS apps index.
- The app page includes sample events, the queries behind several panels, FER definitions, dashboard descriptions, and monitor thresholds. That is enough to rebuild the parsing without opening the product.
- No public rating or install count.
- The content is an observability pack (dashboards and threshold monitors). It is not a SIEM content pack with offenses, risk scores, or MITRE mappings.

## 5. Comparison notes

### Coverage breadth

Sumo Logic is the only competitor with a named SageMaker integration, and it covers the most product surface: CloudTrail audit, endpoint access logs, training/processing/transform logs, and metrics for endpoints, jobs, Feature Store, and pipelines, with ten dashboards.

Splunk can collect the same raw sources, because CloudTrail, CloudWatch Logs, and CloudWatch metrics are generic inputs, but it ships no SageMaker sourcetype, field extraction, or dashboard. Endpoint `ACCESS_LOG` lines stay unparsed. CIM helps only for CloudTrail (Authentication, Change) and for CloudWatch metrics (Performance).

QRadar can collect CloudTrail and, with one log source per log group, CloudWatch Logs. It does not collect CloudWatch metrics through the AWS protocol. It has no SageMaker parser. A large endpoint fleet is operationally expensive because each endpoint log group needs its own log source.

None of the three ship detection content for SageMaker-specific abuse. Sumo's monitors are CPU, GPU, and pipeline duration.

### Collection method alignment

The dominant method is AWS-native delivery, not an agent on the SageMaker container and not syslog:

| Path               | QRadar                          | Splunk                                                      | Sumo Logic                                                              | Elastic AWS integration (context)                                                                                                                                                                                            |
| ------------------ | ------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CloudTrail from S3 | Yes (S3 REST API)               | Yes (SQS-based S3 or generic S3)                            | Yes (CloudTrail S3 source)                                              | Yes. [AWS integration](https://www.elastic.co/docs/reference/integrations/aws/) and [AWS CloudTrail](https://www.elastic.co/docs/reference/integrations/aws/cloudtrail/), version 7.1.7, ingest from API, CloudWatch, or S3. |
| CloudWatch Logs    | API pull, one group per source  | API pull discouraged; Firehose recommended                  | Firehose recommended; Lambda forwarder alternative                      | API pull (`FilterLogEvents`) on a log-group prefix, or the generic CloudWatch logs stream.                                                                                                                                   |
| CloudWatch metrics | No                              | API pull, one namespace per input                           | Firehose for Metrics recommended; CloudWatch metrics source alternative | API pull (`ListMetrics` / `GetMetricData`) for named services only.                                                                                                                                                          |
| Auth               | Access key or EC2 instance role | Access key, `AssumeRole`, or EC2 role (not on Splunk Cloud) | Access key or IAM role                                                  | Access keys, temporary keys, `AssumeRole`, external ID, shared credentials, or instance/pod role.                                                                                                                            |

Elastic's own AWS integration (7.1.7) does not list SageMaker in its service table. Named services stop at API Gateway, billing, CloudFront, CloudTrail, CloudWatch, DynamoDB, EBS, EC2, ECS, ELB, Fargate, Kinesis, Network Firewall, Lambda, NAT Gateway, Redshift, RDS, Route 53, S3, S3 Storage Lens, SNS, SQS, Transit Gateway, Usage, VPC Flow, VPN, WAF, and a generic Custom logs stream. SageMaker today would be collected the same way Splunk collects it: CloudTrail as generic account activity, plus the CloudWatch logs and metrics streams with a log-group prefix or a custom namespace. Source: [AWS integration reference](https://www.elastic.co/docs/reference/integrations/aws/).

So the competitive collection pattern and Elastic's current collection pattern match. The gap is normalization and content, not a missing transport. Sumo is ahead on that content. QRadar and Splunk are not.

### Maintenance status

| Competitor | Status                                                                                                                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| QRadar     | The AWS DSMs are current IBM product capabilities. There is no SageMaker artifact to go stale.                                                                                                      |
| Splunk     | The AWS add-on is actively maintained (8.3.1, 2026-10-21) and heavily downloaded. SageMaker-specific knowledge has never shipped. The old Splunk App for AWS has been end of life since 2022-07-15. |
| Sumo Logic | The SageMaker app is new (2026-03-31) and is the only exact integration. No follow-up release was found between April and November 2026.                                                            |

### Gaps Elastic could address

These are product surfaces that no competitor covers as security content, or that only Sumo covers as operations dashboards:

1. **Control-plane audit normalized to ECS.** CloudTrail `eventSource=sagemaker.amazonaws.com` mapped to `event.action`, `event.outcome`, `user.*`, `cloud.service.name=sagemaker`, and `cloud.resource.id` parsed from SageMaker ARNs (endpoint, model, notebook-instance, training-job, pipeline, feature-group). Splunk CIM-maps CloudTrail only at the generic Authentication/Change level. QRadar stores CloudTrail JSON without SageMaker custom properties. Sumo extracts a few fields and draws an audit dashboard, without a detection rule set.
2. **Endpoint access logs.** The `ACCESS_LOG` line (`client IP`, method, path, status, bytes, endpoint name from the log group) is security-relevant because `InvokeEndpoint` is not in CloudTrail. Sumo parses it for status-code panels. Splunk and QRadar do not. An ECS `http.*` / `source.ip` / `url.path` parse is a concrete differentiator.
3. **High-risk API detections** that none of the apps ship: `CreatePresignedNotebookInstanceUrl`, notebook internet access changes, model artifact copy-out, cross-account `CreateModel` / `CreateEndpoint`, and failed mutating calls. GuardDuty may raise some of these, but that is a different product.
4. **Job and pipeline logs as operational context**, with the log group telling training vs processing vs transform apart. Sumo already dashboards this. Elastic would be matching Sumo, not breaking new ground, if it stopped at CPU charts.
5. **Surfaces nobody named.** Model Monitor and Clarify outputs (usually S3), `/aws/sagemaker/InferenceComponents` metrics, Ground Truth worker logs (Sumo only special-cases the log group), Studio/Canvas/notebook Jupyter logs, and Feature Store record-level audit beyond invocation metrics.

### Differentiators

- **ECS and Fleet versus per-object setup.** QRadar needs a log source per CloudWatch log group. Splunk needs a metric input per namespace and a custom namespace typed by hand. Sumo needs a Firehose (or Lambda), an S3 CloudTrail source, two FERs, and six metric namespaces. Elastic Agent with a log-group prefix `/aws/sagemaker/` plus one CloudTrail S3 input is a smaller configuration, if the ingest pipeline then splits endpoint vs job logs by `aws.cloudwatch.log_group`.
- **Security content versus ops dashboards.** Sumo won the observability listing. It did not publish SIEM detections. That is the open lane: normalize CloudTrail and `ACCESS_LOG`, then ship rules. Matching Sumo's ten dashboards is optional and is not what makes the integration competitive for a SIEM use case.
- **Do not claim a collection-method advantage.** All three competitors, and Elastic's current AWS integration, already use S3 and CloudWatch APIs or Firehose. SageMaker has no syslog, CEF, or LEEF feed to be "more native" about.
- **Namespace case must be taken from AWS, not from Sumo's doc.** Building Elastic metricsets off Sumo's lowercase `AWS/Sagemaker` and `/aws/sagemaker/endpoints` strings would miss the namespaces AWS documents (`AWS/SageMaker`, `/aws/sagemaker/Endpoints`).

## 6. Search log

Searches performed against the catalogs named in the track prompt.

| Catalog                      | Queries                                                                                                     | Outcome                                                                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| IBM QRadar integrations page | Page fetch of https://www.ibm.com/products/qradar-siem/integrations                                         | Marketing page. No SageMaker entry. Points at the DSM guide and App Exchange.                                             |
| IBM DSM guide                | Page fetch; scanned every Amazon row                                                                        | No SageMaker device. CloudTrail and the AWS protocol are the only relevant partials.                                      |
| IBM third-party DSM table    | Page fetch and `site:exchange.xforce.ibmcloud.com SageMaker`                                                | No SageMaker extension in the retrieved table or the indexed Exchange results. Exchange UI itself is not server-rendered. |
| Splunkbase                   | `SageMaker`, `Amazon SageMaker`, app 1876 API `https://splunkbase.splunk.com/api/v1/app/1876/`              | No SageMaker app. AWS add-on 8.3.1 confirmed.                                                                             |
| Splunk add-on docs           | Source-type table, CloudWatch input, CloudWatch Logs input, release notes 8.3.1, account and IAM role pages | No `aws:sagemaker` sourcetype. Generic `aws:cloudtrail`, `aws:cloudwatch`, `aws:cloudwatchlogs` only.                     |
| Splunk docs search           | `"SageMaker" site:docs.splunk.com` and `site:splunk.github.io`                                              | No results.                                                                                                               |
| Sumo Logic docs              | App index and the SageMaker app page, March 2026 release notes                                              | Exact app, full dashboard and collection write-up.                                                                        |
| Elastic (context only)       | AWS integration service table, integrations index                                                           | No SageMaker integration. Generic CloudTrail and CloudWatch only.                                                         |

## 7. Gaps and open questions

- X-Force Exchange could not be queried as an interactive catalog. Conclusion "no SageMaker app" rests on the IBM DSM guide plus site search. A private or just-published extension might not be indexed.
- Splunkbase did not return a numeric star average in the app API. Review count 33 is from the public listing.
- Splunk listing platform versions (through 10.8) and the 8.3.1 release-notes table (through 10.5.x) disagree. [UNVERIFIED] which upper bound is authoritative.
- [UNVERIFIED] whether Splunk Data Manager / Data Inputs has a SageMaker-specific source. The add-on listing mentions Data Inputs only as a general AWS onboarding alternative.
- [UNVERIFIED] whether the Splunk CloudWatch namespace drop-down includes `AWS/SageMaker` or `/aws/sagemaker/*` automatically. The docs say unknown namespaces are typed in by hand, and every published example is a different service.
- [UNVERIFIED] whether QRadar's CloudTrail QID map has any `sagemaker.amazonaws.com` event names. The DSM page lists CloudTrail event _versions_, not SageMaker API names, and custom properties are off.
- Sumo Logic does not publish an app version number. "Current as of 2026-03-31" is the last dated evidence.
- Sumo's metric namespace capitalization should be checked against a live CloudWatch `ListMetrics` call before anyone copies those strings into an Elastic metricset. AWS's own page uses different case, and CloudWatch treats namespace as case-sensitive.
- Model Monitor, Clarify, Studio, and notebook log formats were not part of any competitor listing. Whether those are worth a later collection track is a product decision, not something the catalogs answer.
