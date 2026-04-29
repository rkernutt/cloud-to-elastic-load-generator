# Cloud Loadgen for Elastic — Architecture Diagrams

> **Catalog sizes (log · metric · trace services):** AWS **212 · 206 · 54**; GCP **129 · 123 · 48**; Azure **131 · 120 · 40**.

> **Installer assets (custom Kibana dashboards · ML anomaly jobs · Elasticsearch-query alert rules):** AWS **220 · 384 · 17**; GCP **127 · 152 · 17**; Azure **120 · 154 · 17**. Rules are defined in `installer/{aws,gcp,azure}-custom-rules/` (including Data & Analytics Pipeline rules plus Security Finding, IAM Privesc, and Data Exfil chains per cloud).

---

## 1 · System Architecture

```mermaid
flowchart LR
    subgraph Browser["Browser — localhost:8765"]
        UI["Web UI\nReact + Vite"]
    end

    subgraph Engine["Load Generator Engine"]
        SEL["Service Selector\n212 AWS services / 15 groups"]
        MODE["Mode Switch\nLogs · Metrics · Traces"]
        GEN["Generator Functions\nECS-shaped documents"]
        BUF["Batch Buffer\n50–1,000 docs / request"]
    end

    subgraph Elastic["Elastic Stack"]
        PIPE["Ingest Pipelines\n100 custom pipelines"]
        DS[("Data Streams\nlogs-aws.*\nmetrics-aws.*\ntraces-apm.*")]
        KB["Kibana\n220 custom dashboards"]
        ML["ML Anomaly Detection\n384 jobs / 32 groups"]
    end

    UI -->|"select services\nset volume + error rate"| SEL
    SEL --> MODE
    MODE --> GEN
    GEN -->|"generate batch"| BUF
    BUF -->|"POST _bulk\nAPI key auth"| PIPE
    PIPE -->|"enriched + parsed"| DS
    DS --> KB
    DS --> ML
    KB -->|"preview + progress"| Browser
```

---

## 2 · Document Data Flow

```mermaid
flowchart TD
    A(["User selects service\nmode + config"]) --> B

    subgraph Generate["Generate"]
        B["Call generator fn\ngeneratorFn(ts, er)"]
        C["Shape ECS document\ncloud · aws · event · log"]
        D["Apply ingestion source\nS3 · CloudWatch · Firehose\nAPI · OTel · Agent"]
    end

    B --> C --> D

    subgraph Ship["Ship"]
        E["Buffer batch\n≤ batchSize docs"]
        F["POST /_bulk\nindex: logs-aws.service-default"]
    end

    D --> E --> F

    subgraph Ingest["Elasticsearch Ingest"]
        G{"Custom pipeline\nexists?"}
        H["Parse aws.* fields\nfrom message JSON"]
        I["Write to data stream\nlogs-aws.service-default"]
    end

    F --> G
    G -->|"yes"| H --> I
    G -->|"no"| I

    subgraph Observe["Observe"]
        J["Kibana Dashboard\nLens panels + ES|QL"]
        K["ML Datafeed\nanomaly detection"]
    end

    I --> J
    I --> K

    style Generate fill:#1e3a5f,color:#fff
    style Ship fill:#1e3a5f,color:#fff
    style Ingest fill:#1e3a5f,color:#fff
    style Observe fill:#1e3a5f,color:#fff
```

---

## 3 · Service Groups (212 services)

```mermaid
mindmap
  root((212 AWS Services))
    Serverless and Core
      Lambda
      API Gateway
      VPC Flow
      CloudTrail
      RDS
      ECS
    Compute and Containers
      EC2
      Outposts
      Wavelength
      EKS
      Fargate
      ECR
      App Runner
      Batch
      Elastic Beanstalk
      Auto Scaling
      Image Builder
    Networking and CDN
      ALB
      NLB
      CloudFront
      WAF
      Route 53
      Network Firewall
      Shield
      Global Accelerator
      Transit Gateway
      Direct Connect
      Site-to-Site VPN
      PrivateLink
      NAT Gateway
      VPC Lattice
      App Mesh
      Client VPN
      Cloud Map
    Security and Compliance
      GuardDuty
      Security Hub
      Macie
      Inspector
      Config
      Access Analyzer
      Cognito
      KMS
      Secrets Manager
      ACM
      IAM Identity Center
      Detective
      Verified Access
      Security Lake
      Security IR
      CloudHSM
      Audit Manager
      Verified Permissions
      Payment Cryptography
      Artifact
    Security Findings
      GD to SecHub to Lake Chain
      CSPM (55 real CIS AWS rules)
      KSPM (31 real CIS EKS rules)
      IAM PrivEsc Chain
      Data Exfil Chain
    Storage and Databases
      S3
      S3 Storage Lens
      EFS
      FSx
      EBS
      AWS Backup
      DataSync
      Storage Gateway
      DynamoDB
      Aurora
      ElastiCache
      MemoryDB
      Redshift
      OpenSearch
      DocumentDB
      Neptune
      Timestream
      QLDB
      DynamoDB DAX
      Keyspaces
    Streaming and Messaging
      Kinesis Streams
      Firehose
      Kinesis Analytics
      MSK Kafka
      SQS
      SNS
      Amazon MQ
      EventBridge
      Step Functions
      AppSync
      MSK Connect
    Developer and CICD
      CodeBuild
      CodePipeline
      CodeDeploy
      CodeCommit
      CodeArtifact
      Amplify
      X-Ray
      CodeCatalyst
      Device Farm
      Proton
    Analytics
      EMR
      Glue
      Athena
      Lake Formation
      QuickSight
      DataBrew
      AppFlow
      MWAA
      Clean Rooms
      DataZone
      Entity Resolution
      Data Exchange
      AppFabric
      B2B Data Interchange
    AI and Machine Learning
      SageMaker
      Bedrock
      Bedrock Agent
      Rekognition
      Textract
      Comprehend
      Translate
      Transcribe
      Polly
      Forecast
      Personalize
      Lex
      Q Business
      Kendra
      Augmented AI A2I
      HealthLake
      Amazon Nova
      Lookout for Vision
    IoT
      IoT Core
      Greengrass
      IoT Analytics
      IoT TwinMaker
      IoT FleetWise
      IoT Events
      IoT SiteWise
      IoT Defender
    Management and Governance
      CloudFormation
      Systems Manager
      CloudWatch Alarms
      AWS Health
      Trusted Advisor
      Control Tower
      Organizations
      Service Catalog
      Service Quotas
      Compute Optimizer
      Budgets
      Billing
      Resource Access Manager
      Resilience Hub
      Migration Hub
      Network Manager
      DMS
      Fault Injection
      Managed Grafana
      Supply Chain
      App Recovery Controller
      AppConfig
      Elastic Disaster Recovery
      License Manager
      Chatbot
    Media and End User Computing
      MediaConvert
      MediaLive
      WorkSpaces
      Amazon Connect
      AppStream
      GameLift
      Deadline Cloud
      Chime SDK Voice
    Messaging and Communications
      SES
      Pinpoint
```

---

## 4 · Installer Flow

```mermaid
flowchart TD
    START(["npm run setup:{aws,gcp,azure}-*\nor node installer/*/index.mjs"]) --> AUTH

    AUTH["Enter credentials\nDeployment URL + API key"]
    AUTH --> TEST{"Connection\ntest"}
    TEST -->|"fail"| ERR1["Print error\nExit"]
    TEST -->|"pass"| MENU["Select groups\nor install all"]

    MENU --> I1 & I2 & I3 & I4

    subgraph I1["setup:aws-integration"]
        direction TB
        A1["Kibana Fleet API"]
        A2["AWS integration package\nILM policy · index templates\ndatastream setup"]
    end

    subgraph I2["setup:aws-pipelines"]
        direction TB
        B1["Elasticsearch Ingest API"]
        B2["100 custom pipelines\n15 groups\nlogs-aws.service-default"]
    end

    subgraph I3["setup:aws-dashboards"]
        direction TB
        C1["Kibana Saved Objects API\nor legacy NDJSON import"]
        C2["220 Kibana dashboards\nLens + ES|QL panels\nper-service visualisations"]
    end

    subgraph I4["setup:aws-ml-jobs"]
        direction TB
        D1["Elasticsearch ML API"]
        D2["384 anomaly detection jobs\n32 groups\noptional auto-start"]
    end

    I1 --> DONE
    I2 --> DONE
    I3 --> DONE
    I4 --> DONE

    DONE(["Summary\n✓ installed  ⊘ skipped  ✗ failed\nRe-runnable — skips existing"])

    style I1 fill:#FF9900,color:#000
    style I2 fill:#1BA9F5,color:#000
    style I3 fill:#00BFB3,color:#000
    style I4 fill:#7C3AED,color:#fff
```

---

## 5 · Three-Mode Generation Pipeline

```mermaid
flowchart TD
    UI(["User selects mode"]) --> SWITCH{"Mode?"}

    SWITCH -->|"Logs"| LOGS
    SWITCH -->|"Metrics"| METRICS
    SWITCH -->|"Traces"| TRACES

    subgraph LOGS["Logs — 212 services"]
        direction TB
        L1["GENERATORS registry\nsrc/aws/generators/*.ts"]
        L2["fn(ts, er) → single ECS doc"]
        L3["cloud · aws · event · log · message"]
        L1 --> L2 --> L3
    end

    subgraph METRICS["Metrics — 206 services"]
        direction TB
        M1{"Dedicated\ngenerator?"}
        M2["90 specialised generators\nsrc/aws/generators/metrics/*.ts"]
        M3["52 generic generators\nmakeGenericGenerator()"]
        M4["fn(ts, er) → Object[ ] array\nCloudWatch-shaped dimensional metrics"]
        M1 -->|"yes"| M2 --> M4
        M1 -->|"no"| M3 --> M4
    end

    subgraph TRACES["Traces — 54 generators"]
        direction TB
        T1{"Trace\ntype?"}
        T2["46 single-service traces\nLambda, S3, Glue, Bedrock ..."]
        T3["6 multi-service workflows\necommerce, ML, ingestion, SNS fan-out ..."]
        T4["2 data-pipeline traces\nS3→SQS, EventBridge→Step Functions"]
        T5["fn(ts, er) → Object[ ] array\nAPM transaction + child spans"]
        T1 -->|"single"| T2 --> T5
        T1 -->|"workflow"| T3 --> T5
        T1 -->|"pipeline"| T4 --> T5
    end

    LOGS --> ENR
    METRICS --> ENR
    TRACES --> ENR

    ENR["enrichDocument()\n5-stage enrichment"]
    ENR --> IDX

    IDX["Index target"]
    IDX --> IDX_L["logs-aws.{service}-default"]
    IDX --> IDX_M["metrics-aws.{service}-default\n(TSDS)"]
    IDX --> IDX_T["traces-apm-default"]

    style LOGS fill:#1BA9F5,color:#fff
    style METRICS fill:#FF9900,color:#000
    style TRACES fill:#00BFB3,color:#000
```

---

## 6 · Document Enrichment Pipeline

```mermaid
flowchart LR
    RAW(["Raw generator\noutput"]) --> S1

    S1["Stage 1\nECS Version\necs.version: 8.11.0"]
    S1 --> S2

    S2["Stage 2\nData Stream\ndata_stream.type\ndata_stream.dataset\ndata_stream.namespace"]
    S2 --> S3

    S3["Stage 3\nAgent Metadata"]
    S3 --> S3A & S3B & S3C

    S3A["Logs: filebeat 8.18.0\nor otel 0.115.0"]
    S3B["Metrics: metricbeat\n8.18.0"]
    S3C["Traces: preserved\nfrom generator"]

    S3A & S3B & S3C --> S4

    S4["Stage 4\nInput Type\naws-s3 · aws-cloudwatch\naws-firehose · http_endpoint\nopentelemetry · logfile"]
    S4 --> S5

    S5["Stage 5\nECS Baseline\nhost.* (compute services)\nservice.name · service.type\nlog.level"]
    S5 --> S6

    S6["Bonus: Source Context\nS3: bucket + object key\nCW: log_group + log_stream\nFirehose: ARN + request_id\nOTel: telemetry.sdk.*"]
    S6 --> OUT(["Enriched\ndocument"])

    style S1 fill:#1e3a5f,color:#fff
    style S2 fill:#1e3a5f,color:#fff
    style S3 fill:#1e3a5f,color:#fff
    style S4 fill:#1e3a5f,color:#fff
    style S5 fill:#1e3a5f,color:#fff
    style S6 fill:#1e3a5f,color:#fff
```

---

## 7 · Shipping Pipeline

```mermaid
flowchart TD
    START(["Ship button\nor scheduled run"]) --> POOL

    POOL["Worker Pool\n4 concurrent service shippers"]
    POOL --> W1 & W2 & W3 & W4

    subgraph W1["Worker 1"]
        direction TB
        WA1["Pick next service\nfrom shared queue"]
        WB1["Generate docs\nlogsPerService × fn(ts, er)"]
        WC1["Enrich + strip nulls"]
        WD1["Assemble NDJSON batch\n≤ batchSize lines"]
    end

    subgraph W2["Worker 2"]
        direction TB
        WA2[" "]
    end

    subgraph W3["Worker 3"]
        direction TB
        WA3[" "]
    end

    subgraph W4["Worker 4"]
        direction TB
        WA4[" "]
    end

    W1 & W2 & W3 & W4 --> FETCH

    FETCH["fetchWithRetry()\nPOST /proxy/_bulk"]
    FETCH --> PROXY

    subgraph PROXY["Bulk Proxy — proxy.cjs"]
        direction TB
        P1["Validate headers\nx-elastic-url · x-elastic-key"]
        P2["Forward to Elasticsearch\nPOST /_bulk"]
        P3{"Response?"}
        P4["5xx / timeout / non-JSON\nretry with backoff\n1s → 2s → 4s"]
        P5["2xx + JSON — parse items\ncount indexed vs errors"]
        P3 -->|"error"| P4 -->|"≤ 3 retries"| P2
        P3 -->|"success"| P5
    end

    P1 --> P2 --> P3

    P5 --> PROGRESS

    PROGRESS["Update progress\nsent / total / errors\nthrottled flush ≤ 120ms"]
    PROGRESS --> NEXT{"More\nservices?"}
    NEXT -->|"yes"| POOL
    NEXT -->|"no"| DONE(["Ship complete\nsummary in activity log"])

    style PROXY fill:#232F3E,color:#fff
```

---

## 8 · Scheduled Mode and Anomaly Injection

```mermaid
flowchart TD
    CONFIG(["Configure schedule (off by default)\nN runs × M-minute interval\n+ optional anomaly injection"]) --> RUN1

    subgraph SCHED["Scheduled Shipping Loop"]
        direction TB
        RUN1["Run 1 / N\nnormal ship pass\ner = configured rate"]
        INJ1{"Inject\nanomalies?"}
        SPIKE1["Anomaly spike pass\nmetrics × 20\ner = 100%\ntrace durations × 15"]
        WAIT1["Countdown\nM minutes"]
        RUN2["Run 2 / N\n..."]
        RUNN["Run N / N\nfinal pass"]

        RUN1 --> INJ1
        INJ1 -->|"yes"| SPIKE1 --> WAIT1
        INJ1 -->|"no"| WAIT1
        WAIT1 --> RUN2
        RUN2 -.->|"repeat"| RUNN
    end

    RUNN --> DS

    subgraph DS["Elastic Data Streams"]
        direction LR
        BASELINE["Baseline data\nnormal error rates\ntypical metric values"]
        ANOMALY["Anomaly data\n100% errors\n20× metric spikes\n15× trace durations"]
    end

    DS --> ML_DETECT

    subgraph ML_DETECT["ML Anomaly Detection"]
        direction TB
        FEED["Datafeeds poll\nevery 15m bucket span"]
        DETECT["Detectors compare\ncurrent vs learned baseline"]
        SCORE["Score anomalies\n0–100 severity"]
        ALERT["Anomaly Explorer\nin Kibana"]
        FEED --> DETECT --> SCORE --> ALERT
    end

    style SCHED fill:#1e3a5f,color:#fff
    style ML_DETECT fill:#7C3AED,color:#fff
```

---

## 9 · Trace Architecture

```mermaid
flowchart TD
    subgraph SINGLE["Single-Service Traces (46)"]
        direction LR
        SS["Lambda · S3 · Glue\nBedrock · EMR · ECS\nEKS · SQS · Kinesis\nDynamoDB · RDS\nAPI GW · EventBridge\nSageMaker · Step Functions\n+ additional services"]
        SS_OUT["1 transaction\n+ 2–5 child spans"]
        SS --> SS_OUT
    end

    subgraph WORKFLOW["Multi-Service Workflows (6)"]
        direction LR
        WF_LIST["Ecommerce Order\nML Inference\nData Ingestion\nStep Functions Orchestration\nCascading Failure\nSNS Event Fan-out"]
        WF_OUT["1 root TX\n+ chained service TXs\n+ intermediate spans\nshared trace.id"]
        WF_LIST --> WF_OUT
    end

    subgraph PIPELINE["Data Pipeline Traces (2)"]
        direction LR
        PL_LIST["S3 → SQS (event chain)\nEventBridge → Step Functions"]
        PL_OUT["Event-driven TXs\nlinked by trace context\nparent → child propagation"]
        PL_LIST --> PL_OUT
    end

    SINGLE & WORKFLOW & PIPELINE --> INSTR

    subgraph INSTR["Instrumentation"]
        direction TB
        EDOT["EDOT (Elastic)\ntelemetry.distro.name:\nelastic"]
        ADOT["ADOT (AWS)\ntelemetry.distro.name:\naws-otel\n+ aws.xray.trace_id"]
        COLD["Cold Start\n~8% of Lambda invocations\nadd Lambda init span"]
    end

    INSTR --> W3C["W3C Traceparent\nsame trace.id across\nall services in chain"]
    W3C --> APM["traces-apm-default\nKibana APM Service Map"]

    style SINGLE fill:#00BFB3,color:#000
    style WORKFLOW fill:#1BA9F5,color:#fff
    style PIPELINE fill:#FF9900,color:#000
```

---

## 10 · Metrics Generator Architecture

```mermaid
flowchart TD
    SVC(["Service ID"]) --> CHECK{"In dedicated\ngenerators?"}

    CHECK -->|"yes (90)"| DED
    CHECK -->|"no"| GENERIC

    subgraph DED["Dedicated Generators"]
        direction TB
        D1["Lambda · EC2 · RDS\nALB · DynamoDB · S3\nCloudFront · ECS · EKS\n... 90 specialised fns"]
        D2["Service-specific dimensions\naws.lambda.function.name\naws.ec2.instance.id\naws.rds.db_instance.identifier"]
        D3["Service-specific metrics\nCPUUtilization · Invocations\nReadLatency · BucketSizeBytes"]
        D1 --> D2 --> D3
    end

    subgraph GENERIC["Generic Fallback (52 + 47 inline)"]
        direction TB
        G1["makeGenericGenerator(svcId)"]
        G2{"TEMPLATE_MAP\nlookup"}
        G_IOT["IoT template\nProtocol dimension\nConnect · Publish · Rules"]
        G_ANA["Analytics template\nJobName dimension\nRecords · Bytes · Duration"]
        G_MGT["Management template\nRegion dimension\nRequest · Error · Success"]
        G_DEF["Default template\nResource dimension\nRequest · Error · Latency\nThrottle"]

        G1 --> G2
        G2 -->|"iot"| G_IOT
        G2 -->|"analytics"| G_ANA
        G2 -->|"management"| G_MGT
        G2 -->|"default"| G_DEF
    end

    DED & GENERIC --> SHAPE

    SHAPE["CloudWatch metric shape\naws.{svc}.metrics.{Metric}.avg/sum/count\naws.dimensions.{Dim}\nmetricset.name · metricset.period"]
    SHAPE --> IDX["metrics-aws.{dataset}-default\n(TSDS data stream)"]

    style DED fill:#FF9900,color:#000
    style GENERIC fill:#1BA9F5,color:#fff
```

---

## 11 · Sub-Service Folding

```mermaid
flowchart LR
    subgraph PARENTS["Parent Generators"]
        RDS_GEN["RDS generator"]
        S3_GEN["S3 generator"]
        SM_GEN["SageMaker generator"]
        EC_GEN["ElastiCache generator"]
        DMS_GEN["DMS generator"]
    end

    RDS_GEN -->|"random variant"| RDS_SUB
    S3_GEN -->|"random variant"| S3_SUB
    SM_GEN -->|"random variant"| SM_SUB
    EC_GEN -->|"random variant"| EC_SUB
    DMS_GEN -->|"random variant"| DMS_SUB

    subgraph RDS_SUB["RDS sub-services"]
        RDS_P["RDS Proxy\n__dataset: aws.rdsproxy"]
        RDS_C["RDS Custom\n__dataset: aws.rdscustom"]
    end

    subgraph S3_SUB["S3 sub-services"]
        S3_IT["S3 Intelligent-Tiering\n__dataset: aws.s3_intelligent_tiering"]
        S3_BO["S3 Batch Ops\n__dataset: aws.s3_batch_operations"]
    end

    subgraph SM_SUB["SageMaker sub-services"]
        SM_FS["Feature Store\n__dataset: aws.sagemaker_featurestore"]
        SM_PP["Pipelines\n__dataset: aws.sagemaker_pipelines"]
        SM_MM["Model Monitor\n__dataset: aws.sagemaker_modelmonitor"]
    end

    subgraph EC_SUB["ElastiCache sub-service"]
        EC_G["ElastiCache Global\n__dataset: aws.elasticacheglobal"]
    end

    subgraph DMS_SUB["DMS sub-service"]
        DMS_S["DMS Serverless\n__dataset: aws.dmsserverless"]
    end

    RDS_SUB & S3_SUB & SM_SUB & EC_SUB & DMS_SUB --> ROUTE

    ROUTE["Enrichment resolves __dataset\n→ dedicated pipeline\n→ dedicated dashboard\n→ dedicated ML job"]
    ROUTE --> P1["Pipeline:\nlogs-aws.rdsproxy-default"]
    ROUTE --> D1["Dashboard:\nrdsproxy-dashboard.json"]
    ROUTE --> M1["ML Job:\naws-rdsproxy-*"]

    style PARENTS fill:#1e3a5f,color:#fff
```

---

## 12 · ML Anomaly Detection Lifecycle

```mermaid
flowchart TD
    subgraph GEN["Data Generation"]
        direction LR
        NORMAL["Normal shipping\nbaseline error rates\ntypical metric ranges"]
        SPIKE["Anomaly injection\n100% errors · 20× metrics\n15× trace durations"]
    end

    GEN --> DS[("Data Streams\nlogs-aws.* · metrics-aws.*\ntraces-apm-default")]

    DS --> FEED

    subgraph FEED["Datafeeds — 384 jobs"]
        direction TB
        F1["Query: event.dataset filter\ne.g. aws.lambda_logs"]
        F2["Indices: logs-aws.* or metrics-aws.*"]
        F3["Query delay: 60s\nChunking: auto"]
        F1 --> F2 --> F3
    end

    FEED --> JOBS

    subgraph JOBS["ML Job Groups — 32 groups"]
        direction TB
        J1["Compute\nLambda error spike\nEC2 CPU anomaly"]
        J2["Databases\nRDS query latency\nDynamo throttle spike"]
        J3["Streaming\nKinesis iterator age\nKDA KPU utilisation"]
        J4["Security\nGuardDuty finding spike\nIAM failed auth"]
        J5["Networking\nALB latency\nVPC flow anomaly"]
        J6["+ 17 more groups ..."]
    end

    JOBS --> DETECT

    subgraph DETECT["Detection"]
        direction TB
        DET1["Bucket span: 15 minutes"]
        DET2["Functions: high_mean\nhigh_count · count"]
        DET3["Partition by dimension\nfunction name · instance ID\nstream name · queue name"]
        DET4["Influencers:\ncloud.region · cloud.account.id\nservice-specific fields"]
        DET1 --> DET2 --> DET3 --> DET4
    end

    DETECT --> RESULTS

    subgraph RESULTS["Kibana Anomaly Explorer"]
        direction LR
        R1["Anomaly timeline\nseverity 0–100"]
        R2["Top influencers\ndrill-down by service"]
        R3["Swimlane view\nacross all jobs"]
        R4["Link to dashboards\nfor affected service"]
    end

    style GEN fill:#1e3a5f,color:#fff
    style JOBS fill:#7C3AED,color:#fff
    style DETECT fill:#FF9900,color:#000
    style RESULTS fill:#00BFB3,color:#000
```

---

## 13 · Ingestion Source Routing

```mermaid
flowchart LR
    SVC(["AWS Service"]) --> LOOKUP["SERVICE_INGESTION_DEFAULTS\nlookup"]

    LOOKUP --> S3_SRC & CW_SRC & FH_SRC & API_SRC & OTEL_SRC

    subgraph S3_SRC["S3 Source"]
        direction TB
        S3_SVCS["CloudTrail · ALB · NLB\nCloudFront · WAF · WAFv2\nVPC Flow · Network Firewall\nS3 Access Logs"]
        S3_META["input.type: aws-s3\nagent.type: filebeat\naws.s3.bucket + object.key"]
    end

    subgraph CW_SRC["CloudWatch Source (default)"]
        direction TB
        CW_SVCS["Lambda · RDS · Aurora\nECS · EKS · DynamoDB\nGlue · EMR · Kinesis\nSQS · SNS · CodeBuild\n+ 100 more services"]
        CW_META["input.type: aws-cloudwatch\nagent.type: filebeat\naws.cloudwatch.log_group\naws.cloudwatch.log_stream"]
    end

    subgraph FH_SRC["Firehose Source"]
        direction TB
        FH_SVCS["Kinesis Data Firehose"]
        FH_META["input.type: aws-firehose\nagent.type: filebeat\naws.firehose.arn\naws.firehose.request_id"]
    end

    subgraph API_SRC["API Source"]
        direction TB
        API_SVCS["GuardDuty · Security Hub\nInspector · Config\nAccess Analyzer · Macie\nDetective · Trusted Advisor\nBudgets · Billing\nCloudWatch RUM"]
        API_META["input.type: http_endpoint\nagent.type: filebeat"]
    end

    subgraph OTEL_SRC["OTel Source"]
        direction TB
        OTEL_SVCS["All trace generators"]
        OTEL_META["input.type: opentelemetry\nagent.type: otlp\ntelemetry.sdk.*\ntelemetry.distro.*"]
    end

    S3_SRC & CW_SRC & FH_SRC & API_SRC & OTEL_SRC --> ENRICH["enrichDocument()\napplies source-specific\nmetadata to every doc"]

    style CW_SRC fill:#FF9900,color:#000
    style S3_SRC fill:#1BA9F5,color:#fff
    style API_SRC fill:#00BFB3,color:#000
    style OTEL_SRC fill:#7C3AED,color:#fff
```

---

## 14 · End-to-End Workflow

```mermaid
flowchart TD
    subgraph SETUP["One-Time Setup"]
        direction LR
        I1["npm run\nsetup:aws-integration\n(Fleet API)"]
        I2["npm run\nsetup:aws-pipelines\n(ingest pipelines)"]
        I3["npm run\nsetup:aws-dashboards\n(Kibana)"]
        I4["npm run\nsetup:aws-ml-jobs\n(ML jobs)"]
    end

    SETUP --> RESET

    subgraph RESET["Phase 0 — Reset ML Jobs"]
        direction TB
        R1["Stop datafeeds\n& close jobs"]
        R2["Reset model state\n(clear stale data)"]
        R3["Reopen jobs\n& restart datafeeds"]
        R1 --> R2 --> R3
    end

    RESET --> BASELINE

    subgraph BASELINE["Phase 1 — Build Baseline"]
        direction TB
        B1["ML Training Mode\n5 runs × 15 min apart"]
        B2["Anomaly injection: OFF"]
        B3["Ship normal traffic\nacross all services"]
        B4["ML jobs learn patterns\nbaseline established"]
        B1 --> B2 --> B3 --> B4
    end

    BASELINE --> SPIKE

    subgraph SPIKE["Phase 2 — Inject Anomalies"]
        direction TB
        SP1["Single anomaly batch"]
        SP2["Ship with spike pass\nmetrics × 20 · errors 100%\ntrace durations × 15"]
        SP3["ML detectors fire\nseverity scores 0–100"]
        SP1 --> SP2 --> SP3
    end

    SPIKE --> FREEZE

    subgraph FREEZE["Phase 3 — Stabilise & Freeze"]
        direction TB
        F1["Wait 2 min for ML\nto score anomalies"]
        F2["Stop all datafeeds\n(prevents re-baselining)"]
        F3["Anomaly scores frozen\nin Anomaly Explorer"]
        F1 --> F2 --> F3
    end

    FREEZE --> OBSERVE

    subgraph OBSERVE["Phase 4 — Observe and Investigate"]
        direction TB
        O1["Kibana Dashboards\nper-service health panels"]
        O2["ML Anomaly Explorer\nswimlane · timeline · drill-down"]
        O3["APM Service Map\ntrace topology · latency"]
        O4["Alerting Rules\nnotify on high-severity anomalies"]
    end

    style SETUP fill:#232F3E,color:#fff
    style RESET fill:#BD271E,color:#fff
    style BASELINE fill:#1BA9F5,color:#fff
    style SPIKE fill:#FF9900,color:#000
    style FREEZE fill:#6092C0,color:#fff
    style OBSERVE fill:#00BFB3,color:#000
```
