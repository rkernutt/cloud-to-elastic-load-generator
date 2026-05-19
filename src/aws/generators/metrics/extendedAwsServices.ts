/**
 * CloudWatch dimensional metrics for additional AWS integrations (Bedrock Guardrails,
 * EMR Serverless, GWLB & classic ELB, Elemental media & IVS, CloudSearch, Directory Service,
 * ACM PCA, MGN, CloudWatch Synthetics, Amazon Managed Prometheus).
 */

import {
  REGIONS,
  ACCOUNTS,
  rand,
  randInt,
  randFloat,
  randId,
  dp,
  stat,
  counter,
  metricDoc,
  pickCloudContext,
  jitter,
} from "./helpers.js";
import { ELASTIC_METRICS_DATASET_MAP, ELASTIC_DATASET_MAP } from "../../../data/elasticMaps.js";
import type { EcsDocument } from "../types.js";

function dataset(svcId: string): string {
  const m = ELASTIC_METRICS_DATASET_MAP[svcId as keyof typeof ELASTIC_METRICS_DATASET_MAP];
  const d = ELASTIC_DATASET_MAP[svcId as keyof typeof ELASTIC_DATASET_MAP];
  return m ?? d ?? `aws.${svcId}`;
}

/** Stamp AWS CloudWatch namespace for Elastic integration parity. */
function withCwNs(doc: Record<string, unknown>, namespace: string): Record<string, unknown> {
  const aws = doc.aws as Record<string, unknown>;
  aws.cloudwatch = { namespace };
  return doc;
}

// ─── Bedrock Guardrails — AWS/Bedrock/Guardrails ───────────────────────────────

export function generateBedrockguardrailsMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const stressIntervene = Math.random() < er;
  const stressThrottle = Math.random() < er;
  const stressClient = Math.random() < er;
  const stressServer = Math.random() < er;
  const stressLatency = Math.random() < er;
  const grArn = `arn:aws:bedrock:${region}:${account.id}:guardrail/gr-${randId(10)}`;
  const inv = randInt(500, 800_000);
  const intervened = Math.round(
    inv * (stressIntervene ? jitter(0.08, 0.06, 0, 0.35) : jitter(0.012, 0.008, 0, 0.06))
  );
  const doc1 = metricDoc(
    ts,
    "bedrockguardrails",
    dataset("bedrockguardrails"),
    region,
    account,
    {
      GuardrailArn: grArn,
      GuardrailVersion: rand(["1", "2", "DRAFT"]),
      Operation: "ApplyGuardrail",
    },
    {
      Invocations: counter(inv),
      InvocationLatency: stat(dp(stressLatency ? randFloat(800, 8000) : randFloat(50, 450))),
      InvocationsIntervened: counter(intervened),
      TextUnitCount: counter(randInt(inv * 2, inv * 40)),
      InvocationThrottles: counter(stressThrottle ? randInt(10, 500) : randInt(0, 2)),
      InvocationClientErrors: counter(stressClient ? randInt(5, 100) : randInt(0, 2)),
      InvocationServerErrors: counter(stressServer ? randInt(5, 100) : randInt(0, 2)),
      TotalFindings: counter(randInt(intervened, intervened * 6)),
    }
  );
  const grArn2 = `arn:aws:bedrock:${region}:${account.id}:guardrail/gr-${randId(10)}`;
  const inv2 = randInt(200, 120_000);
  const doc2 = metricDoc(
    ts,
    "bedrockguardrails",
    dataset("bedrockguardrails"),
    region,
    account,
    {
      GuardrailArn: grArn2,
      GuardrailVersion: "DRAFT",
      Operation: "InvokeAutomatedReasoningCheck",
    },
    {
      Invocations: counter(inv2),
      InvocationLatency: stat(
        dp(Math.random() < er ? jitter(1200, 400, 200, 12_000) : jitter(95, 40, 8, 1200))
      ),
      InvocationThrottles: counter(Math.random() < er ? randInt(10, 500) : 0),
      InvocationClientErrors: counter(Math.random() < er ? randInt(5, 100) : randInt(0, 2)),
      InvocationServerErrors: counter(Math.random() < er ? randInt(5, 120) : randInt(0, 2)),
      TextUnitCount: counter(randInt(inv2 * 3, inv2 * 25)),
    }
  );
  const doc3 = metricDoc(
    ts,
    "bedrockguardrails",
    dataset("bedrockguardrails"),
    region,
    account,
    { GuardrailArn: grArn, GuardrailVersion: "2", Operation: "ApplyGuardrail", Stage: "pre" },
    {
      InvocationLatencyP99: stat(
        dp(Math.random() < er ? randFloat(2.8, 35) : randFloat(0.12, 1.6))
      ),
      InvocationsIntervened: counter(Math.round(inv * (Math.random() < er ? 0.06 : 0.01))),
      InvocationThrottles: counter(Math.random() < er ? randInt(10, 500) : randInt(0, 15)),
      TotalFindings: counter(randInt(0, intervened * 4)),
    }
  );
  return [
    withCwNs(doc1, "AWS/Bedrock/Guardrails"),
    withCwNs(doc2, "AWS/Bedrock/Guardrails"),
    withCwNs(doc3, "AWS/Bedrock/Guardrails"),
  ];
}

// ─── EMR Serverless — AWS/EMR Serverless ───────────────────────────────────────

export function generateEmrserverlessMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const appId = `00${randInt(100000000, 999999999)}`;
  const appName = rand(["spark-batch", "hive-analytics"]);
  const jobId = `00${randInt(100000000, 999999999)}${randInt(100000000, 999999999)}`;
  const jobId2 = `00${randInt(100000000, 999999999)}${randInt(100000000, 999999999)}`;
  const workers = randInt(4, 120);
  const stressPending = Math.random() < er;
  const stressFail = Math.random() < er;
  const stressIdle = Math.random() < er;
  const stressCapacity = Math.random() < er;
  const docApp = metricDoc(
    ts,
    "emrserverless",
    dataset("emrserverless"),
    region,
    account,
    { ApplicationId: appId, ApplicationName: appName },
    {
      MaxCPUAllowed: stat(randInt(256, 1024)),
      MaxMemoryAllowed: stat(randInt(512, 8192)),
      MaxStorageAllowed: stat(randInt(500, 12000)),
      SubmittedJobs: stat(stressPending ? randInt(5, 100) : randInt(0, 2)),
      PendingJobs: stat(stressPending ? randInt(10, 500) : randInt(0, 2)),
      RunningJobs: stat(randInt(0, 20)),
      SuccessJobs: stat(randInt(0, 500)),
      FailedJobs: stat(stressFail ? randInt(5, 100) : randInt(0, 2)),
      CPUAllocated: stat(dp(jitter(workers * 4, workers, 0, workers * 16)), {
        sum: dp(jitter(workers * 240, workers * 60, 0, workers * 3600)),
      }),
      MemoryAllocated: stat(dp(jitter(workers * 16, workers * 4, 0, workers * 64))),
      StorageAllocated: stat(dp(jitter(workers * 200, workers * 50, 10, workers * 2000))),
      RunningWorkerCount: stat(workers),
      TotalWorkerCount: stat(workers + randInt(0, 8)),
      IdleWorkerCount: stat(stressIdle ? randInt(10, 500) : randInt(0, 2)),
      PendingCreationWorkerCount: stat(Math.random() < er ? randInt(10, 500) : 0),
      JobRunLatencyP99: stat(dp(Math.random() < er ? randFloat(120, 3600) : randFloat(12, 280))),
      CapacityAllocationErrors: counter(Math.random() < er ? randInt(5, 100) : randInt(0, 2)),
    }
  );

  const docWorker = metricDoc(
    ts,
    "emrserverless",
    dataset("emrserverless"),
    region,
    account,
    {
      JobId: jobId,
      JobName: rand(["daily-aggregation", "feature-pipeline"]),
      ApplicationId: appId,
      ApplicationName: appName,
      WorkerType: "SPARK_DRIVER",
      CapacityAllocationType: rand(["PreInitCapacity", "OnDemandCapacity"]),
    },
    {
      WorkerCpuAllocated: stat(dp(jitter(32, 12, 4, 256))),
      WorkerCpuUsed: stat(
        dp(Math.random() < er ? jitter(90, 35, 20, 240) : jitter(22, 10, 0, 240))
      ),
      WorkerMemoryAllocated: stat(dp(jitter(120, 40, 8, 1024))),
      WorkerMemoryUsed: stat(
        dp(Math.random() < er ? jitter(110, 45, 50, 1020) : jitter(90, 35, 2, 980))
      ),
      WorkerEphemeralStorageAllocated: stat(dp(jitter(200, 80, 50, 2000))),
      WorkerEphemeralStorageUsed: stat(dp(jitter(140, 60, 10, 1900))),
      WorkerStorageReadBytes: stat(dp(randInt(10_000_000, 500_000_000_000))),
      WorkerStorageWriteBytes: stat(dp(randInt(5_000_000, 200_000_000_000))),
      WorkerConnectionErrors: counter(Math.random() < er ? randInt(5, 100) : randInt(0, 2)),
    }
  );

  const docWorkerExec = metricDoc(
    ts,
    "emrserverless",
    dataset("emrserverless"),
    region,
    account,
    {
      JobId: jobId2,
      JobName: "nightly-report",
      ApplicationId: appId,
      ApplicationName: appName,
      WorkerType: "SPARK_EXECUTORS",
      CapacityAllocationType: "OnDemandCapacity",
    },
    {
      WorkerCpuAllocated: stat(dp(stressCapacity ? randFloat(120, 512) : randFloat(16, 128))),
      WorkerCpuUsed: stat(dp(stressCapacity ? randFloat(100, 500) : randFloat(10, 120))),
      WorkerMemoryUsed: stat(dp(Math.random() < er ? randFloat(512, 8192) : randFloat(64, 900))),
      ShuffleReadErrors: counter(Math.random() < er ? randInt(5, 100) : 0),
      ExecutorLostCount: counter(Math.random() < er ? randInt(1, 40) : 0),
    }
  );

  const docQueue = metricDoc(
    ts,
    "emrserverless",
    dataset("emrserverless"),
    region,
    account,
    { ApplicationId: appId, ApplicationName: appName, QueueName: "default" },
    {
      QueuedJobs: stat(Math.random() < er ? randInt(50, 2000) : randInt(0, 35)),
      QueueWaitTimeSeconds: stat(dp(Math.random() < er ? randFloat(120, 7200) : randFloat(2, 180))),
      ThrottledCapacityRequests: counter(Math.random() < er ? randInt(10, 500) : 0),
      APICallThrottleCount: counter(Math.random() < er ? randInt(10, 500) : randInt(0, 2)),
    }
  );

  return [
    withCwNs(docApp, "AWS/EMR Serverless"),
    withCwNs(docWorker, "AWS/EMRServerless"),
    withCwNs(docWorkerExec, "AWS/EMRServerless"),
    withCwNs(docQueue, "AWS/EMR Serverless"),
  ];
}

// ─── Gateway Load Balancer — AWS/GatewayELB ───────────────────────────────────

export function generateGwlbMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const lb = `gwy/${rand(["prod", "sec", "inspection"])}-gwlb/${randId(12)}`;
  const flows = randInt(5_000, 2_000_000);
  const svc = `com.amazonaws.vpce.${region}.${randId(8)}`;
  const doc1 = metricDoc(
    ts,
    "gwlb",
    dataset("gwlb"),
    region,
    account,
    { LoadBalancer: lb, EndpointService: svc },
    {
      ActiveFlowCount: counter(flows),
      NewFlowCount: counter(randInt(100, flows * 2)),
      ProcessedBytes: counter(randInt(1_000_000, 80_000_000_000)),
      HealthyHostCount: stat(Math.random() < er ? randInt(1, 4) : randInt(2, 10)),
      UnHealthyHostCount: stat(Math.random() < er ? randInt(5, 100) : randInt(0, 2)),
      PacketsDroppedCount_InvalidGeneveTunnel: counter(
        Math.random() < er ? randInt(100, 500_000) : randInt(0, 800)
      ),
      PacketsDroppedCount_InvalidGwlbEndpointId: counter(
        Math.random() < er ? randInt(10, 500_000) : 0
      ),
      PacketsDroppedCount_InvalidGwlbFlowCookie: counter(
        Math.random() < er ? randInt(5, 350_000) : 0
      ),
    }
  );
  const doc2 = metricDoc(
    ts,
    "gwlb",
    dataset("gwlb"),
    region,
    account,
    { LoadBalancer: lb, AvailabilityZone: `${region}c`, TargetGroup: `tg-${randId(10)}` },
    {
      TargetTLSNegotiationErrors: counter(Math.random() < er ? randInt(5, 100) : randInt(0, 2)),
      TcpClientResetCount: counter(Math.random() < er ? randInt(50, 50_000) : randInt(0, 500)),
      TargetConnectionErrorCount: counter(
        Math.random() < er ? randInt(10, 25_000) : randInt(0, 200)
      ),
      FlowLatencyMilliseconds: stat(
        dp(Math.random() < er ? randFloat(45, 800) : randFloat(0.8, 25))
      ),
    }
  );
  const doc3 = metricDoc(
    ts,
    "gwlb",
    dataset("gwlb"),
    region,
    account,
    { LoadBalancer: lb, EndpointGroup: `gwlb-eg-${randId(8)}` },
    {
      GatewayEndpointCount: counter(randInt(2, 24)),
      OutOfSyncFlows: counter(Math.random() < er ? randInt(10, 500) : randInt(0, 15)),
      ThrottledFlows: counter(Math.random() < er ? randInt(10, 500) : 0),
      CPSExceeded: counter(Math.random() < er ? randInt(5, 100) : 0),
    }
  );
  return [
    withCwNs(doc1, "AWS/GatewayELB"),
    withCwNs(doc2, "AWS/GatewayELB"),
    withCwNs(doc3, "AWS/GatewayELB"),
  ];
}

// ─── Classic ELB — AWS/ELB ─────────────────────────────────────────────────────

export function generateElbMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const name = rand(["classic-web", "legacy-api", "mgmt-lb"]);
  const req = randInt(2_000, 2_000_000);
  const be5xxRate =
    Math.random() < er ? jitter(0.04, 0.03, 0, 0.2) : jitter(0.002, 0.0015, 0, 0.015);
  const be5xx = Math.round(req * be5xxRate);
  const doc1 = metricDoc(
    ts,
    "elb",
    dataset("elb"),
    region,
    account,
    { LoadBalancerName: name, AvailabilityZone: `${region}a` },
    {
      RequestCount: counter(req),
      HealthyHostCount: stat(Math.random() < er ? randInt(1, 4) : randInt(2, 12)),
      UnHealthyHostCount: stat(Math.random() < er ? randInt(5, 100) : randInt(0, 2)),
      Latency: stat(dp(Math.random() < er ? randFloat(0.5, 6) : jitter(0.045, 0.035, 0.002, 2.5))),
      LatencyP99: stat(dp(Math.random() < er ? randFloat(1.5, 30) : randFloat(0.08, 1.8))),
      HTTPCode_Backend_2XX_Count: counter(Math.max(0, req - be5xx)),
      HTTPCode_Backend_5XX_Count: counter(be5xx),
      HTTPCode_ELB_5XX_Count: counter(Math.round(be5xx * 0.15)),
      BackendConnectionErrors: counter(Math.random() < er ? randInt(10, 8000) : randInt(0, 400)),
      SurgeQueueLength: stat(Math.random() < er ? randInt(50, 5000) : randInt(0, 120)),
      SpilloverCount: counter(Math.random() < er ? randInt(1, 900) : 0),
      EstimatedProcessedBytes: counter(randInt(100_000_000, 60_000_000_000)),
    }
  );
  const doc2 = metricDoc(
    ts,
    "elb",
    dataset("elb"),
    region,
    account,
    { LoadBalancerName: name, AvailabilityZone: `${region}b` },
    {
      HTTPCode_Backend_4XX_Count: counter(
        Math.random() < er ? randInt(50, 80_000) : randInt(0, 4000)
      ),
      HTTPCode_ELB_4XX_Count: counter(Math.random() < er ? randInt(10, 5000) : randInt(0, 120)),
      ThrottleCount: counter(Math.random() < er ? randInt(10, 500) : 0),
      RejectedConnectionCount: counter(Math.random() < er ? randInt(5, 100) : randInt(0, 2)),
    }
  );
  const doc3 = metricDoc(
    ts,
    "elb",
    dataset("elb"),
    region,
    account,
    { LoadBalancerName: name, Listener: "HTTPS:443" },
    {
      TargetResponseTimeP99: stat(
        dp(Math.random() < er ? randFloat(0.35, 8) : randFloat(0.02, 0.55))
      ),
      HealthCheckFailures: counter(Math.random() < er ? randInt(50, 12_000) : randInt(0, 200)),
      StickySessionErrors: counter(Math.random() < er ? randInt(10, 500) : randInt(0, 35)),
      CrossZoneMismatchCount: counter(Math.random() < er ? randInt(1, 250) : 0),
    }
  );
  return [withCwNs(doc1, "AWS/ELB"), withCwNs(doc2, "AWS/ELB"), withCwNs(doc3, "AWS/ELB")];
}

// ─── MediaConnect — AWS/MediaConnect ───────────────────────────────────────────

export function generateMediaconnectMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const flowArn = `arn:aws:mediaconnect:${region}:${account.id}:flow:flow-${randId(10)}`;
  const flowArn2 = `arn:aws:mediaconnect:${region}:${account.id}:flow:flow-${randId(10)}`;
  const doc1 = metricDoc(
    ts,
    "mediaconnect",
    dataset("mediaconnect"),
    region,
    account,
    { FlowARN: flowArn },
    {
      SourceBitRate: stat(dp(jitter(25e6, 8e6, 1e6, 120e6))),
      OutputConnected: stat(randInt(1, 16)),
      OutputHealthy: stat(dp(Math.random() < er ? randFloat(0.85, 0.95) : randFloat(0.99, 1))),
      TransportPacketLossRatio: stat(
        dp(Math.random() < er ? jitter(0.08, 0.06, 0, 0.5) : jitter(0.001, 0.0008, 0, 0.02))
      ),
      ConnectedOutputs: counter(randInt(1, 12)),
      SourceDroppedFrames: counter(Math.random() < er ? randInt(5, 100) : randInt(0, 2)),
    }
  );
  const doc2 = metricDoc(
    ts,
    "mediaconnect",
    dataset("mediaconnect"),
    region,
    account,
    { FlowARN: flowArn, OutputArn: `${flowArn}:output:out1` },
    {
      RenditionLatencyMilliseconds: stat(
        dp(Math.random() < er ? randFloat(280, 6200) : randFloat(20, 180))
      ),
      OutputDroppedPackets: counter(Math.random() < er ? randInt(500, 900_000) : randInt(0, 2000)),
      ThrottleEvents: counter(Math.random() < er ? randInt(10, 500) : 0),
      ConnectionErrors: counter(Math.random() < er ? randInt(5, 100) : randInt(0, 2)),
    }
  );
  const doc3 = metricDoc(
    ts,
    "mediaconnect",
    dataset("mediaconnect"),
    region,
    account,
    { FlowARN: flowArn2, SourceArn: `${flowArn2}:src` },
    {
      SourceFECRecoveredPackets: counter(randInt(0, 900_000)),
      SourceFECUnrecoverablePackets: counter(Math.random() < er ? randInt(5, 100) : randInt(0, 2)),
      DecoderBufferDepthMs: stat(
        dp(Math.random() < er ? randFloat(400, 12_000) : randFloat(8, 120))
      ),
      EncoderFrameP99Late: stat(dp(Math.random() < er ? randFloat(2, 80) : randFloat(0.05, 2.5))),
    }
  );
  return [
    withCwNs(doc1, "AWS/MediaConnect"),
    withCwNs(doc2, "AWS/MediaConnect"),
    withCwNs(doc3, "AWS/MediaConnect"),
  ];
}

// ─── MediaPackage — AWS/MediaPackage ──────────────────────────────────────────

export function generateMediapackageMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const ch = `channel-${randId(8)}`;
  const doc1 = metricDoc(
    ts,
    "mediapackage",
    dataset("mediapackage"),
    region,
    account,
    { Channel: ch },
    {
      IngressBytes: counter(randInt(50_000_000, 40_000_000_000)),
      IngressResponseTime: stat(
        dp(Math.random() < er ? randFloat(500, 28_000) : jitter(120, 80, 10, 9000))
      ),
      Ingress4xxErrors: counter(Math.random() < er ? randInt(5, 100) : randInt(0, 2)),
      Ingress5xxErrors: counter(Math.random() < er ? randInt(5, 100) : randInt(0, 2)),
      EgressBytes: counter(randInt(80_000_000, 90_000_000_000)),
      EgressResponseTime: stat(
        dp(Math.random() < er ? randFloat(400, 20_000) : jitter(95, 70, 8, 7500))
      ),
      EgressProcessingTime: stat(dp(jitter(45, 30, 2, 4000))),
      EgressRequestCount: counter(randInt(10_000, 20_000_000)),
      OriginLatency: stat(
        dp(Math.random() < er ? jitter(2800, 1500, 200, 12000) : jitter(420, 180, 40, 2400))
      ),
    }
  );
  const doc2 = metricDoc(
    ts,
    "mediapackage",
    dataset("mediapackage"),
    region,
    account,
    { Channel: ch, PackagingConfiguration: `dash-${randId(4)}` },
    {
      ThrottleEvents: counter(Math.random() < er ? randInt(10, 500) : 0),
      Egress5xxCounts: counter(Math.random() < er ? randInt(50, 50_000) : randInt(0, 200)),
      KeyRotationFailures: counter(Math.random() < er ? randInt(5, 100) : 0),
    }
  );
  const doc3 = metricDoc(
    ts,
    "mediapackage",
    dataset("mediapackage"),
    region,
    account,
    { Channel: ch, OriginEndpointId: `orig-${randId(8)}` },
    {
      DecoderQueueDepth: stat(dp(Math.random() < er ? randFloat(120, 8000) : randFloat(1, 90))),
      StaleManifestCount: counter(Math.random() < er ? randInt(500, 200_000) : randInt(0, 2000)),
    }
  );
  return [
    withCwNs(doc1, "AWS/MediaPackage"),
    withCwNs(doc2, "AWS/MediaPackage"),
    withCwNs(doc3, "AWS/MediaPackage"),
  ];
}

// ─── MediaStore — AWS/MediaStore ───────────────────────────────────────────────

export function generateMediastoreMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const container = `live-${randId(6)}`;
  const doc1 = metricDoc(
    ts,
    "mediastore",
    dataset("mediastore"),
    region,
    account,
    { ContainerName: container },
    {
      "4xxError": counter(Math.random() < er ? randInt(50, 8000) : randInt(0, 400)),
      "5xxError": counter(Math.random() < er ? randInt(10, 1200) : randInt(0, 60)),
      BytesUploaded: counter(randInt(100_000_000, 25_000_000_000)),
      BytesDownloaded: counter(randInt(200_000_000, 60_000_000_000)),
      TotalTime: stat(dp(Math.random() < er ? randFloat(800, 9000) : jitter(180, 120, 20, 9000))),
      TurnaroundTime: stat(
        dp(Math.random() < er ? randFloat(450, 6200) : jitter(95, 70, 10, 6000))
      ),
      ConnectionErrors: counter(Math.random() < er ? randInt(5, 100) : randInt(0, 2)),
      ThrottleRequests: counter(Math.random() < er ? randInt(10, 500) : 0),
    }
  );
  const doc2 = metricDoc(
    ts,
    "mediastore",
    dataset("mediastore"),
    region,
    account,
    { ContainerName: container, AccessPoint: `ap-${randId(6)}` },
    {
      PendingUploads: stat(dp(Math.random() < er ? randFloat(30, 9000) : randFloat(0, 120))),
      StaleObjectRequeue: counter(Math.random() < er ? randInt(500, 50_000) : randInt(0, 900)),
    }
  );
  const doc3 = metricDoc(
    ts,
    "mediastore",
    dataset("mediastore"),
    region,
    account,
    { ContainerName: container, ObjectGroup: "live-segments" },
    {
      LifecyclePolicyFailures: counter(Math.random() < er ? randInt(5, 100) : randInt(0, 2)),
      ServerSideEncryptionErrors: counter(Math.random() < er ? randInt(5, 80) : 0),
    }
  );
  const doc4 = metricDoc(
    ts,
    "mediastore",
    dataset("mediastore"),
    region,
    account,
    { ContainerName: container, RequestType: rand(["PUT", "GET", "DELETE"]) },
    {
      "4xxError": counter(Math.random() < er ? randInt(500, 120_000) : randInt(0, 9000)),
      DurationP99Milliseconds: stat(
        dp(Math.random() < er ? randFloat(1200, 25_000) : randFloat(40, 800))
      ),
    }
  );
  return [
    withCwNs(doc1, "AWS/MediaStore"),
    withCwNs(doc2, "AWS/MediaStore"),
    withCwNs(doc3, "AWS/MediaStore"),
    withCwNs(doc4, "AWS/MediaStore"),
  ];
}

// ─── MediaTailor — AWS/MediaTailor ────────────────────────────────────────────

export function generateMediatailorMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const cfg = `playback-${randId(6)}`;
  const doc1 = metricDoc(
    ts,
    "mediatailor",
    dataset("mediatailor"),
    region,
    account,
    { ConfigurationName: cfg },
    {
      AdDecisionServerAds: counter(randInt(10_000, 12_000_000)),
      "AdDecisionServer.Duration": stat(
        dp(Math.random() < er ? randFloat(400, 12000) : jitter(120, 90, 10, 9000))
      ),
      OriginLatency: stat(
        dp(Math.random() < er ? jitter(2100, 900, 100, 12000) : jitter(380, 140, 40, 2800))
      ),
      ManifestLatency: stat(
        dp(Math.random() < er ? jitter(620, 300, 50, 8000) : jitter(95, 55, 8, 4500))
      ),
      FillRate: stat(dp(Math.random() < er ? randFloat(0.2, 0.75) : jitter(0.82, 0.12, 0.2, 1))),
      AvailsFilled: counter(randInt(5_000, 9_000_000)),
      AvailsEmpty: counter(Math.random() < er ? randInt(500, 800_000) : randInt(0, 80_000)),
    }
  );
  const doc2 = metricDoc(
    ts,
    "mediatailor",
    dataset("mediatailor"),
    region,
    account,
    { ConfigurationName: cfg, AdSource: "prebid" },
    {
      AdServer5xx: counter(Math.random() < er ? randInt(50, 40_000) : randInt(0, 800)),
      AdServerThrottles: counter(Math.random() < er ? randInt(10, 500) : 0),
      AdBreakFillErrors: counter(Math.random() < er ? randInt(500, 200_000) : randInt(0, 12_000)),
    }
  );
  const doc3 = metricDoc(
    ts,
    "mediatailor",
    dataset("mediatailor"),
    region,
    account,
    { ConfigurationName: cfg, PlaybackSessionPrefix: `ps-${randId(8)}` },
    {
      SessionDropRate: stat(
        dp(Math.random() < er ? jitter(0.08, 0.05, 0, 0.45) : jitter(0.002, 0.002, 0, 0.03))
      ),
      PersonalizedManifestErrors: counter(
        Math.random() < er ? randInt(500, 80_000) : randInt(0, 2000)
      ),
    }
  );
  return [
    withCwNs(doc1, "AWS/MediaTailor"),
    withCwNs(doc2, "AWS/MediaTailor"),
    withCwNs(doc3, "AWS/MediaTailor"),
  ];
}

// ─── IVS — AWS/IVS ─────────────────────────────────────────────────────────────

export function generateIvsMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const channel = `arn:aws:ivs:${region}:${account.id}:channel/${randId(16)}`;
  const channel2 = `arn:aws:ivs:${region}:${account.id}:channel/${randId(16)}`;
  const doc1 = metricDoc(
    ts,
    "ivs",
    dataset("ivs"),
    region,
    account,
    { Channel: channel },
    {
      ConcurrentStreams: stat(randInt(0, 800)),
      ConcurrentViews: stat(randInt(0, 120_000)),
      LiveDeliveredTime: counter(randInt(60_000, 400_000_000)),
      RecordingDeliveredTime: counter(randInt(0, 200_000_000)),
      IngestBitrate: stat(dp(jitter(4_500_000, 1_500_000, 800_000, 25_000_000))),
      IngestDroppedFrames: counter(Math.random() < er ? randInt(100, 500_000) : randInt(0, 8000)),
      OutputDeliveredTime: counter(randInt(120_000, 500_000_000)),
      IngestLatencyMilliseconds: stat(
        dp(Math.random() < er ? randFloat(800, 8500) : randFloat(40, 520))
      ),
    }
  );
  const doc2 = metricDoc(
    ts,
    "ivs",
    dataset("ivs"),
    region,
    account,
    { Channel: channel, Stage: "broadcast" },
    {
      PublishingErrors: counter(Math.random() < er ? randInt(5, 100) : randInt(0, 2)),
      TranscodeThrottleCount: counter(Math.random() < er ? randInt(10, 500) : 0),
      PlaybackStartFailures: counter(Math.random() < er ? randInt(50, 120_000) : randInt(0, 3500)),
    }
  );
  const doc3 = metricDoc(
    ts,
    "ivs",
    dataset("ivs"),
    region,
    account,
    { Channel: channel2, RecordingSessionId: `rec-${randId(10)}` },
    {
      RenditionBufferDepth: stat(dp(Math.random() < er ? randFloat(2, 420) : randFloat(0.1, 35))),
      Output5xxCount: counter(Math.random() < er ? randInt(50, 25_000) : randInt(0, 350)),
    }
  );
  const doc4 = metricDoc(
    ts,
    "ivs",
    dataset("ivs"),
    region,
    account,
    { Channel: channel, HealthCheck: "viewer-path" },
    {
      StreamHealthScore: stat(dp(Math.random() < er ? randFloat(0.85, 0.95) : randFloat(0.99, 1))),
      ChannelConnectionErrors: counter(Math.random() < er ? randInt(5, 100) : randInt(0, 2)),
    }
  );
  return [
    withCwNs(doc1, "AWS/IVS"),
    withCwNs(doc2, "AWS/IVS"),
    withCwNs(doc3, "AWS/IVS"),
    withCwNs(doc4, "AWS/IVS"),
  ];
}

// ─── IVS Chat — AWS/IVSChat ────────────────────────────────────────────────────

export function generateIvschatMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const doc1 = metricDoc(
    ts,
    "ivschat",
    dataset("ivschat"),
    region,
    account,
    {},
    {
      ConcurrentChatConnections: stat(randInt(50, 120_000)),
      MessagingDeliveries: counter(randInt(10_000, 90_000_000)),
      MessagingRequests: counter(randInt(12_000, 95_000_000)),
      InvocationErrors: counter(Math.random() < er ? randInt(50, 900_000) : randInt(0, 40_000)),
      ResponseValidationErrors: counter(
        Math.random() < er ? randInt(10, 120_000) : randInt(0, 8000)
      ),
      LogDestinationErrors: counter(Math.random() < er ? randInt(5, 80_000) : randInt(0, 6000)),
      ThrottleErrors: counter(Math.random() < er ? randInt(10, 500) : 0),
    }
  );
  const doc2 = metricDoc(
    ts,
    "ivschat",
    dataset("ivschat"),
    region,
    account,
    { RoomArn: `arn:aws:ivschat:${region}:${account.id}:room/${randId(12)}` },
    {
      MessageProcessingLatencyP99: stat(
        dp(Math.random() < er ? randFloat(400, 9200) : randFloat(35, 340))
      ),
      WebSocketHandshakeFailures: counter(
        Math.random() < er ? randInt(50, 120_000) : randInt(0, 3500)
      ),
      RoomFullRejects: counter(Math.random() < er ? randInt(10, 9000) : randInt(0, 120)),
    }
  );
  const doc3 = metricDoc(
    ts,
    "ivschat",
    dataset("ivschat"),
    region,
    account,
    { LogGroupArn: `arn:aws:logs:${region}:${account.id}:log-group:ivschat` },
    {
      LogDeliveryLatency: stat(dp(Math.random() < er ? randFloat(500, 9000) : randFloat(45, 620))),
      FloodControlDrops: counter(Math.random() < er ? randInt(500, 200_000) : randInt(0, 4500)),
    }
  );
  return [
    withCwNs(doc1, "AWS/IVSChat"),
    withCwNs(doc2, "AWS/IVSChat"),
    withCwNs(doc3, "AWS/IVSChat"),
  ];
}

// ─── CloudSearch — AWS/CloudSearch ────────────────────────────────────────────

export function generateCloudsearchMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const domain = `search-${randId(8)}`;
  const doc1 = metricDoc(
    ts,
    "cloudsearch",
    dataset("cloudsearch"),
    region,
    account,
    { DomainName: domain },
    {
      SuccessfulRequests: counter(randInt(50_000, 90_000_000)),
      SearchLatency: stat(dp(Math.random() < er ? randFloat(120, 2400) : jitter(42, 35, 5, 900))),
      SearchLatencyP99: stat(dp(Math.random() < er ? randFloat(400, 9800) : randFloat(85, 980))),
      IndexUtilization: stat(dp(jitter(0.35, 0.22, 0.05, 0.92))),
      DocumentsBlockedForIndexingUserErrors: counter(
        Math.random() < er ? randInt(10, 8000) : randInt(0, 400)
      ),
      DocumentsBlockedForIndexingSystemErrors: counter(
        Math.random() < er ? randInt(1, 900) : randInt(0, 80)
      ),
    }
  );
  const doc2 = metricDoc(
    ts,
    "cloudsearch",
    dataset("cloudsearch"),
    region,
    account,
    { DomainName: domain, IndexField: rand(["title", "desc", "sku"]) },
    {
      IndexThrottles: counter(Math.random() < er ? randInt(10, 500) : 0),
      PartitionQueueDepth: stat(dp(Math.random() < er ? randFloat(50, 9500) : randFloat(1, 280))),
    }
  );
  const doc3 = metricDoc(
    ts,
    "cloudsearch",
    dataset("cloudsearch"),
    region,
    account,
    { DomainName: domain, ClientRequestType: rand(["search2013", "suggest2013"]) },
    {
      "5xx": counter(Math.random() < er ? randInt(500, 220_000) : randInt(0, 8500)),
      "4xx": counter(Math.random() < er ? randInt(900, 380_000) : randInt(0, 42_000)),
    }
  );
  return [
    withCwNs(doc1, "AWS/CloudSearch"),
    withCwNs(doc2, "AWS/CloudSearch"),
    withCwNs(doc3, "AWS/CloudSearch"),
  ];
}

// ─── Directory Service — AWS/DirectoryService ───────────────────────────────────

export function generateDirectoryserviceMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const dirId = `d-${randId(10)}`;
  const doc1 = metricDoc(
    ts,
    "directoryservice",
    dataset("directoryservice"),
    region,
    account,
    { DirectoryId: dirId },
    {
      CPUUtilization: stat(dp(Math.random() < er ? jitter(92, 6, 70, 99) : jitter(38, 22, 5, 85))),
      DirectoryReadsIPOpsPerSecond: stat(dp(randInt(50, 120_000))),
      DirectoryWritesIPOpsPerSecond: stat(dp(randInt(20, 80_000))),
      ReceivedLDAPBindFailures: counter(Math.random() < er ? randInt(50, 9000) : randInt(0, 600)),
    }
  );
  const doc2 = metricDoc(
    ts,
    "directoryservice",
    dataset("directoryservice"),
    region,
    account,
    { DirectoryId: dirId, DomainController: `dc-${randId(6)}` },
    {
      SecureChannelFailures: counter(Math.random() < er ? randInt(5, 100) : randInt(0, 2)),
      LDAPSearchLatencyP99: stat(
        dp(Math.random() < er ? randFloat(1200, 9800) : randFloat(35, 620))
      ),
    }
  );
  const doc3 = metricDoc(
    ts,
    "directoryservice",
    dataset("directoryservice"),
    region,
    account,
    { DirectoryId: dirId, ReplicationScope: "forest" },
    {
      ReplicationLatencySeconds: stat(
        dp(Math.random() < er ? randFloat(8, 580) : randFloat(0.05, 4.8))
      ),
      ReplicationErrors: counter(Math.random() < er ? randInt(10, 500) : randInt(0, 15)),
      TrustRelationshipFailures: counter(Math.random() < er ? randInt(5, 900) : 0),
    }
  );
  const doc4 = metricDoc(
    ts,
    "directoryservice",
    dataset("directoryservice"),
    region,
    account,
    { DirectoryId: dirId, AvailabilityZone: `${region}a` },
    {
      ReplicationAvailability: stat(
        dp(Math.random() < er ? randFloat(0.85, 0.95) : randFloat(0.99, 1))
      ),
      ThrottledBinds: counter(Math.random() < er ? randInt(10, 500) : 0),
    }
  );
  return [
    withCwNs(doc1, "AWS/DirectoryService"),
    withCwNs(doc2, "AWS/DirectoryService"),
    withCwNs(doc3, "AWS/DirectoryService"),
    withCwNs(doc4, "AWS/DirectoryService"),
  ];
}

// ─── ACM Private CA — AWS/ACM Private CA ───────────────────────────────────────

export function generateAcmpcaMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const caArn = `arn:aws:acm-pca:${region}:${account.id}:certificate-authority/${randId(36)}`;
  const doc1 = metricDoc(
    ts,
    "acmpca",
    dataset("acmpca"),
    region,
    account,
    { CertificateAuthorityArn: caArn },
    {
      CRLGenerated: counter(randInt(0, 400)),
      MisconfiguredCRLBucket: counter(Math.random() < er ? randInt(1, 120) : 0),
      OCSPMetrics: counter(randInt(1000, 50_000_000)),
      CertificatesIssued: counter(randInt(10, 900_000)),
      CertificatesRevoked: counter(randInt(0, 50_000)),
      IssueCertificateLatency: stat(
        dp(Math.random() < er ? randFloat(880, 9800) : randFloat(55, 920))
      ),
    }
  );
  const doc2 = metricDoc(
    ts,
    "acmpca",
    dataset("acmpca"),
    region,
    account,
    { CertificateAuthorityArn: caArn, Operation: "IssueCertificate" },
    {
      OCSPResponderErrors: counter(Math.random() < er ? randInt(50, 9000) : randInt(0, 350)),
      SigningThrottles: counter(Math.random() < er ? randInt(10, 500) : 0),
      TemplateMismatchFailures: counter(Math.random() < er ? randInt(5, 100) : randInt(0, 2)),
    }
  );
  const doc3 = metricDoc(
    ts,
    "acmpca",
    dataset("acmpca"),
    region,
    account,
    { CertificateAuthorityArn: caArn, AuditReport: "monthly" },
    {
      CRLPublicationFailures: counter(Math.random() < er ? randInt(5, 800) : randInt(0, 25)),
      KMSIntegrationErrors: counter(Math.random() < er ? randInt(5, 100) : 0),
    }
  );
  return [
    withCwNs(doc1, "AWS/ACM Private CA"),
    withCwNs(doc2, "AWS/ACM Private CA"),
    withCwNs(doc3, "AWS/ACM Private CA"),
  ];
}

// ─── MGN — AWS/MGN ─────────────────────────────────────────────────────────────

export function generateMgnMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const sid = `s-${randId(12)}`;
  const sid2 = `s-${randId(12)}`;
  const doc1 = metricDoc(
    ts,
    "mgn",
    dataset("mgn"),
    region,
    account,
    { SourceServerID: sid },
    {
      TotalLaunchDuration: stat(
        dp(Math.random() < er ? jitter(2200, 900, 240, 29000) : jitter(420, 220, 60, 7200))
      ),
      TotalReplicationDuration: stat(dp(jitter(86400 * 3, 86400, 3600, 86400 * 90))),
      ReplicationLagDuration: stat(
        dp(Math.random() < er ? jitter(540, 280, 120, 9600) : jitter(8.5, 6, 0.5, 420))
      ),
      BytesTransferred: counter(randInt(500_000_000, 60_000_000_000_000)),
      SnapshotReplicationBandwidth: stat(dp(randInt(5_000_000, 900_000_000))),
    }
  );
  const doc2 = metricDoc(
    ts,
    "mgn",
    dataset("mgn"),
    region,
    account,
    { SourceServerID: sid, ReplicationJobId: `rj-${randId(10)}` },
    {
      ReplicationErrors: counter(Math.random() < er ? randInt(50, 9000) : randInt(0, 400)),
      DiskQueueDepth: stat(dp(Math.random() < er ? randFloat(40, 9800) : randFloat(1, 280))),
    }
  );
  const doc3 = metricDoc(
    ts,
    "mgn",
    dataset("mgn"),
    region,
    account,
    { SourceServerID: sid2 },
    {
      CuttingOverFailures: counter(Math.random() < er ? randInt(5, 100) : randInt(0, 2)),
      AgentConnectionLoss: counter(Math.random() < er ? randInt(10, 500) : randInt(0, 35)),
    }
  );
  const doc4 = metricDoc(
    ts,
    "mgn",
    dataset("mgn"),
    region,
    account,
    { SourceServerID: sid, AvailabilityZone: `${region}b` },
    {
      LaunchSuccessRate: stat(dp(Math.random() < er ? randFloat(0.85, 0.95) : randFloat(0.99, 1))),
    }
  );
  return [
    withCwNs(doc1, "AWS/MGN"),
    withCwNs(doc2, "AWS/MGN"),
    withCwNs(doc3, "AWS/MGN"),
    withCwNs(doc4, "AWS/MGN"),
  ];
}

// ─── CloudWatch Synthetics — AWS/Synthetics ────────────────────────────────────

export function generateCwsyntheticsMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const canary = `cw-syn-${randId(8)}`;
  const doc1 = metricDoc(
    ts,
    "cwsynthetics",
    dataset("cwsynthetics"),
    region,
    account,
    { CanaryName: canary },
    {
      SuccessPercent: stat(
        dp(Math.random() < er ? jitter(62, 25, 0, 95) : jitter(98.5, 1.2, 85, 100))
      ),
      Duration: stat(
        dp(Math.random() < er ? randFloat(18_000, 320_000) : jitter(4200, 2800, 400, 180_000))
      ),
      Failed: counter(Math.random() < er ? randInt(5, 900) : randInt(0, 40)),
      "5XXCount": counter(Math.random() < er ? randInt(2, 600) : randInt(0, 25)),
      "4XXCount": counter(Math.random() < er ? randInt(20, 80_000) : randInt(0, 400)),
    }
  );
  const doc2 = metricDoc(
    ts,
    "cwsynthetics",
    dataset("cwsynthetics"),
    region,
    account,
    { CanaryName: canary, StepName: "home" },
    {
      StepDuration: stat(dp(Math.random() < er ? randFloat(800, 45_000) : randFloat(120, 6200))),
      StepFailureCount: counter(Math.random() < er ? randInt(5, 100) : randInt(0, 2)),
    }
  );
  const doc3 = metricDoc(
    ts,
    "cwsynthetics",
    dataset("cwsynthetics"),
    region,
    account,
    { CanaryName: canary, RuntimeVersion: "syn-nodejs-2.2" },
    {
      ThrottledInvocations: counter(Math.random() < er ? randInt(10, 500) : 0),
      DNSLookupFailures: counter(Math.random() < er ? randInt(50, 8000) : randInt(0, 120)),
    }
  );
  return [
    withCwNs(doc1, "AWS/Synthetics"),
    withCwNs(doc2, "AWS/Synthetics"),
    withCwNs(doc3, "AWS/Synthetics"),
  ];
}

// ─── Amazon Managed Prometheus — AWS/Prometheus ────────────────────────────────

export function generateManagedprometheusMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const ws = `ws-${randId(24)}`;
  const doc1 = metricDoc(
    ts,
    "managedprometheus",
    dataset("managedprometheus"),
    region,
    account,
    { Workspace: ws },
    {
      DiscardedSamples: counter(
        Math.random() < er ? randInt(50_000, 120_000_000) : randInt(0, 9_000_000)
      ),
      RuleEvaluationFailures: counter(Math.random() < er ? randInt(10, 8000) : randInt(0, 400)),
      RuleEvaluations: counter(randInt(100_000, 900_000_000)),
      AlertmanagerAlerts: counter(randInt(0, 500_000)),
      IngestionRate: stat(dp(jitter(850_000, 400_000, 10_000, 120_000_000))),
      ActiveSeries: stat(randInt(50_000, 120_000_000)),
      QueryLatencyP99: stat(dp(Math.random() < er ? randFloat(800, 28_000) : randFloat(35, 2200))),
    }
  );
  const doc2 = metricDoc(
    ts,
    "managedprometheus",
    dataset("managedprometheus"),
    region,
    account,
    { Workspace: ws, ScraperJob: "kube-cadvisor" },
    {
      ScrapeFailures: counter(Math.random() < er ? randInt(500, 120_000) : randInt(0, 9000)),
      ScrapeTimeoutCount: counter(Math.random() < er ? randInt(200, 80_000) : randInt(0, 3500)),
    }
  );
  const doc3 = metricDoc(
    ts,
    "managedprometheus",
    dataset("managedprometheus"),
    region,
    account,
    { Workspace: ws, RuleGroup: "recording" },
    {
      RemoteWriteThrottles: counter(Math.random() < er ? randInt(10, 500) : 0),
      WALReplayLatencySeconds: stat(
        dp(Math.random() < er ? randFloat(40, 9200) : randFloat(1.2, 420))
      ),
    }
  );
  const doc4 = metricDoc(
    ts,
    "managedprometheus",
    dataset("managedprometheus"),
    region,
    account,
    { Workspace: ws, AvailabilityZone: `${region}a` },
    {
      IngestAvailability: stat(dp(Math.random() < er ? randFloat(0.85, 0.95) : randFloat(0.99, 1))),
      OutOfOrderSamplesDropped: counter(
        Math.random() < er ? randInt(50_000, 50_000_000) : randInt(0, 2_000_000)
      ),
    }
  );
  return [
    withCwNs(doc1, "AWS/Prometheus"),
    withCwNs(doc2, "AWS/Prometheus"),
    withCwNs(doc3, "AWS/Prometheus"),
    withCwNs(doc4, "AWS/Prometheus"),
  ];
}
