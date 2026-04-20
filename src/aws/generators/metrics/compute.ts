/**
 * Dimensional metric generators for AWS compute services:
 * Lambda, EC2, ECS/Fargate, EKS, AppRunner, Batch, ElasticBeanstalk, ECR.
 */

import {
  REGIONS,
  ACCOUNTS,
  rand,
  randInt,
  randId,
  sample,
  jitter,
  dp,
  stat,
  counter,
  metricDoc,
  pickCloudContext,
} from "./helpers.js";

// ─── Lambda ───────────────────────────────────────────────────────────────────

const LAMBDA_NAMES = [
  "api-handler",
  "auth-service",
  "order-processor",
  "notification-sender",
  "image-resizer",
  "data-transformer",
  "payment-processor",
  "report-generator",
  "webhook-handler",
  "cache-warmer",
  "event-consumer",
  "session-manager",
  "file-processor",
  "search-indexer",
  "email-dispatcher",
  "audit-logger",
  "cleanup-scheduler",
  "token-validator",
  "media-encoder",
  "rate-limiter",
];

export function generateLambdaMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(LAMBDA_NAMES, randInt(3, 8)).map((name) => {
    const inv = randInt(0, 8000);
    const errs = Math.round(
      inv * (Math.random() < er ? jitter(0.08, 0.06, 0.01, 0.4) : jitter(0.005, 0.004, 0, 0.02))
    );
    const dur = jitter(300, 250, 10, 15000);
    const throttles = Math.round(inv * (Math.random() < 0.1 ? jitter(0.02, 0.015, 0, 0.1) : 0));
    const concurrentExec = randInt(0, 300);
    const isColdStart = Math.random() < 0.05;
    const hasEventSourceMapping = Math.random() > 0.5;
    return metricDoc(
      ts,
      "lambda",
      "aws.lambda",
      region,
      account,
      { FunctionName: name, Resource: `${name}:$LATEST`, ExecutedVersion: "$LATEST" },
      {
        Invocations: counter(inv),
        Errors: counter(errs),
        Duration: stat(dp(dur), {
          max: dp(dur * jitter(3, 1.5, 1.5, 8)),
          min: dp(dur * jitter(0.3, 0.15, 0.05, 0.8)),
        }),
        Throttles: counter(throttles),
        ConcurrentExecutions: stat(concurrentExec),
        UnreservedConcurrentExecutions: stat(Math.max(0, concurrentExec - randInt(0, 50))),
        DeadLetterErrors: counter(Math.random() < 0.05 ? randInt(1, 10) : 0),
        ProvisionedConcurrencyInvocations: counter(Math.random() < 0.3 ? randInt(0, inv) : 0),
        ProvisionedConcurrencySpilloverInvocations: counter(
          Math.random() < 0.1 ? randInt(0, 50) : 0
        ),
        ProvisionedConcurrencyUtilization: stat(
          dp(Math.random() < 0.3 ? jitter(0.6, 0.3, 0, 1) : 0)
        ),
        ...(isColdStart ? { InitDuration: stat(dp(jitter(300, 200, 50, 2000))) } : {}),
        PostRuntimeExtensionsDuration: stat(dp(jitter(5, 4, 0, 50))),
        IteratorAge: stat(
          dp(Math.random() < er ? jitter(60000, 50000, 0, 3600000) : jitter(100, 90, 0, 5000))
        ),
        AsyncEventsReceived: counter(randInt(0, inv)),
        AsyncEventAge: stat(dp(jitter(500, 400, 0, 30000))),
        AsyncEventsDropped: counter(Math.random() < er ? randInt(0, 10) : 0),
        ...(hasEventSourceMapping
          ? {
              PolledEventCount: counter(randInt(0, 5000)),
              FilteredOutEventCount: counter(randInt(0, 500)),
            }
          : {}),
      }
    );
  });
}

// ─── EC2 ──────────────────────────────────────────────────────────────────────

const EC2_INSTANCE_TYPES = [
  "t3.micro",
  "t3.small",
  "t3.medium",
  "t3.large",
  "m5.large",
  "m5.xlarge",
  "m5.2xlarge",
  "c5.large",
  "c5.xlarge",
  "r5.large",
];

export function generateEc2Metrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(EC2_INSTANCE_TYPES, randInt(3, 10)).map((itype, idx) => {
    const instanceId = `i-${randId(17).toLowerCase()}`;
    const cpu = Math.random() < er ? jitter(80, 15, 60, 100) : jitter(30, 20, 1, 95);
    const isTInstance = /^t[0-9]/i.test(itype);
    const tUnlimited = isTInstance && Math.random() < 0.35;
    const burstGp2 = Math.random() < 0.45;
    return metricDoc(
      ts,
      "ec2",
      "aws.ec2",
      region,
      account,
      {
        InstanceId: instanceId,
        InstanceType: itype,
        AutoScalingGroupName: `asg-${["web", "app", "worker", "api"][idx % 4]}-${region}`,
      },
      {
        CPUUtilization: stat(dp(cpu)),
        NetworkIn: counter(randInt(10_000, 500_000_000)),
        NetworkOut: counter(randInt(5_000, 200_000_000)),
        NetworkPacketsIn: counter(randInt(100, 500_000)),
        NetworkPacketsOut: counter(randInt(100, 400_000)),
        DiskReadBytes: counter(randInt(0, 50_000_000)),
        DiskWriteBytes: counter(randInt(0, 80_000_000)),
        DiskReadOps: counter(randInt(0, 5_000)),
        DiskWriteOps: counter(randInt(0, 8_000)),
        EBSReadOps: counter(randInt(0, 15_000)),
        EBSWriteOps: counter(randInt(0, 25_000)),
        EBSReadBytes: counter(randInt(0, 120_000_000)),
        EBSWriteBytes: counter(randInt(0, 200_000_000)),
        ...(burstGp2
          ? {
              "EBSIOBalance%": stat(
                dp(Math.random() < er ? jitter(15, 12, 0, 100) : jitter(88, 10, 25, 100))
              ),
              "EBSByteBalance%": stat(
                dp(Math.random() < er ? jitter(20, 15, 0, 100) : jitter(85, 12, 30, 100))
              ),
            }
          : {}),
        ...(isTInstance
          ? {
              CPUCreditBalance: stat(
                dp(Math.random() < er ? jitter(40, 35, 0, 576) : jitter(420, 120, 0, 576))
              ),
              CPUCreditUsage: stat(dp(jitter(2.5, 2, 0, 48))),
              ...(tUnlimited
                ? {
                    CPUSurplusCreditBalance: stat(
                      dp(Math.random() < er ? jitter(8, 6, 0, 144) : jitter(0.5, 0.4, 0, 24))
                    ),
                    CPUSurplusCreditsCharged: counter(
                      Math.random() < er ? randInt(0, 120) : randInt(0, 8)
                    ),
                  }
                : {}),
            }
          : {}),
        StatusCheckFailed: counter(Math.random() < er * 0.3 ? 1 : 0),
        StatusCheckFailed_Instance: counter(Math.random() < er * 0.2 ? 1 : 0),
        StatusCheckFailed_System: counter(Math.random() < er * 0.1 ? 1 : 0),
        MetadataNoToken: counter(randInt(0, 5)),
      }
    );
  });
}

// ─── ECS / Fargate ────────────────────────────────────────────────────────────

const ECS_CLUSTERS = ["production", "staging", "workers", "batch", "api-cluster", "microservices"];
const ECS_SERVICES = [
  "web-frontend",
  "api-gateway",
  "auth-service",
  "order-service",
  "payment-service",
  "notification-service",
  "search-service",
  "inventory-service",
];

export function generateEcsMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const cluster = rand(ECS_CLUSTERS);
  return sample(ECS_SERVICES, randInt(2, 5)).map((svc) => {
    const cpu = Math.random() < er ? jitter(85, 10, 70, 100) : jitter(35, 20, 1, 90);
    const mem = jitter(50, 25, 5, 95);
    const serviceConnect = Math.random() < 0.3;
    return metricDoc(
      ts,
      "ecs",
      "aws.ecs_metrics",
      region,
      account,
      { ClusterName: cluster, ServiceName: svc },
      {
        CPUUtilization: stat(dp(cpu)),
        MemoryUtilization: stat(dp(mem)),
        RunningTaskCount: counter(randInt(1, 20)),
        PendingTaskCount: counter(Math.random() < 0.1 ? randInt(1, 5) : 0),
        DesiredTaskCount: counter(randInt(2, 20)),
        ActiveConnectionCount: counter(randInt(10, 5000)),
        NewConnectionCount: counter(randInt(1, 500)),
        NetworkTxBytes: counter(randInt(50_000, 800_000_000)),
        NetworkRxBytes: counter(randInt(80_000, 900_000_000)),
        StorageReadBytes: counter(randInt(0, 400_000_000)),
        StorageWriteBytes: counter(randInt(0, 250_000_000)),
        DeploymentCount: counter(randInt(0, 8)),
        TaskSetCount: counter(Math.random() < 0.2 ? randInt(2, 4) : 1),
        ...(serviceConnect
          ? {
              ServiceConnectRequestCount: counter(randInt(500, 500_000)),
              ServiceConnectConnectionCount: counter(randInt(20, 25_000)),
            }
          : {}),
      }
    );
  });
}

export function generateFargateMetrics(ts: string, er: number) {
  const serviceCount = randInt(4, 28);
  return generateEcsMetrics(ts, er).map((doc) => {
    const d = doc as Record<string, any>;
    const ecs = d.aws.ecs as Record<string, any>;
    const metrics = ecs.metrics as Record<string, unknown>;
    const reservedMiB = randInt(512, 20_480);
    const utilizedMiB = Math.round(
      reservedMiB *
        (Math.random() < er ? jitter(0.92, 0.06, 0.75, 1) : jitter(0.42, 0.2, 0.05, 0.95))
    );
    return {
      ...d,
      aws: {
        ...d.aws,
        ecs: {
          ...ecs,
          metrics: {
            ...metrics,
            EphemeralStorageUtilized: stat(dp(utilizedMiB)),
            EphemeralStorageReserved: stat(dp(reservedMiB)),
            ServiceCount: counter(serviceCount),
          },
        },
      },
      data_stream: { type: "metrics", dataset: "aws.ecs_metrics", namespace: "default" },
      event: { dataset: "aws.ecs_metrics", module: "aws" },
    };
  });
}

// ─── EKS ──────────────────────────────────────────────────────────────────────

const EKS_CLUSTERS = ["eks-prod-cluster", "eks-staging", "eks-workers", "eks-platform"];
const EKS_NAMESPACES = [
  "default",
  "kube-system",
  "monitoring",
  "production",
  "staging",
  "applications",
];

export function generateEksMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const cluster = rand(EKS_CLUSTERS);
  return sample(EKS_NAMESPACES, randInt(2, 4)).map((ns) => {
    const cpu = Math.random() < er ? jitter(80, 12, 60, 100) : jitter(40, 20, 1, 90);
    const mem = jitter(55, 25, 5, 95);
    return metricDoc(
      ts,
      "kubernetes",
      "aws.kubernetes",
      region,
      account,
      { ClusterName: cluster, Namespace: ns },
      {
        cluster_failed_node_count: counter(Math.random() < er * 0.2 ? randInt(1, 3) : 0),
        node_cpu_utilization: stat(dp(cpu)),
        node_memory_utilization: stat(dp(mem)),
        node_cpu_reserved_capacity: stat(dp(jitter(55, 18, 10, 95))),
        node_memory_reserved_capacity: stat(dp(jitter(62, 18, 12, 96))),
        node_filesystem_utilization: stat(
          dp(Math.random() < er ? jitter(88, 8, 70, 99) : jitter(48, 22, 8, 92))
        ),
        node_number_of_running_pods: counter(randInt(8, 110)),
        node_number_of_running_containers: counter(randInt(12, 180)),
        pod_count: counter(randInt(5, 80)),
        pod_cpu_reserved: stat(dp(jitter(20, 10, 0, 80))),
        pod_memory_reserved: stat(dp(jitter(30, 15, 0, 90))),
        pod_cpu_utilization: stat(
          dp(Math.random() < er ? jitter(78, 14, 55, 100) : jitter(38, 22, 1, 92))
        ),
        pod_memory_utilization: stat(
          dp(Math.random() < er ? jitter(82, 12, 60, 100) : jitter(52, 24, 5, 94))
        ),
        pod_number_of_container_restarts: counter(
          Math.random() < er ? randInt(1, 45) : randInt(0, 6)
        ),
        service_number_of_running_pods: counter(randInt(2, 40)),
      }
    );
  });
}

// ─── AppRunner ────────────────────────────────────────────────────────────────

const APPRUNNER_SERVICES = ["web-app", "api-service", "backend-service", "frontend", "mobile-api"];

export function generateApprunnerMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(APPRUNNER_SERVICES, randInt(1, 3)).map((svc) => {
    const req = randInt(100, 50_000);
    const http4xx = Math.round(req * jitter(0.012, 0.008, 0, 0.06));
    const http5xx = Math.round(
      req * (Math.random() < er ? jitter(0.05, 0.04, 0.001, 0.3) : jitter(0.0015, 0.001, 0, 0.012))
    );
    const http2xx = Math.max(0, req - http4xx - http5xx);
    const p50 = jitter(38, 28, 4, 2500);
    const p95 = p50 * jitter(4.2, 1.2, 2, 12);
    const p99 = p95 * jitter(2.4, 0.9, 1.2, 6);
    const conc = Math.random() < er ? jitter(4200, 800, 800, 12000) : jitter(380, 200, 5, 8000);
    return metricDoc(
      ts,
      "apprunner",
      "aws.apprunner",
      region,
      account,
      { ServiceName: svc },
      {
        Requests: counter(req),
        Http2xxRequests: counter(http2xx),
        Http4xxRequests: counter(http4xx),
        Http5xxRequests: counter(http5xx),
        RequestLatency: stat(dp(jitter(50, 40, 5, 5000)), {
          max: dp(jitter(500, 400, 100, 10000)),
          min: dp(jitter(5, 3, 1, 50)),
        }),
        RequestLatencyP50: stat(dp(p50), {
          max: dp(p95 * jitter(1.15, 0.08, 1, 1.4)),
          min: dp(jitter(3, 2, 0.5, 80)),
        }),
        RequestLatencyP95: stat(dp(p95), {
          max: dp(p99 * jitter(1.2, 0.1, 1, 1.5)),
          min: dp(p50 * jitter(1.05, 0.05, 1, 1.3)),
        }),
        RequestLatencyP99: stat(dp(p99), {
          max: dp(p99 * jitter(2.5, 0.8, 1.2, 8)),
          min: dp(p95 * jitter(0.95, 0.05, 0.85, 1.1)),
        }),
        ActiveInstances: counter(randInt(1, 10)),
        ConcurrentConnections: stat(dp(conc)),
        MaxConcurrentConnections: stat(dp(conc * jitter(1.25, 0.15, 1.05, 2))),
        CPUUtilization: stat(
          dp(Math.random() < er ? jitter(82, 12, 65, 100) : jitter(36, 22, 4, 88))
        ),
        MemoryUtilization: stat(
          dp(Math.random() < er ? jitter(79, 14, 58, 100) : jitter(48, 24, 8, 90))
        ),
      }
    );
  });
}

// ─── Batch ────────────────────────────────────────────────────────────────────

const BATCH_QUEUES = ["high-priority", "standard", "low-priority", "spot-queue", "on-demand-queue"];

export function generateBatchMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(BATCH_QUEUES, randInt(2, 4)).map((q) => {
    const desiredV = randInt(0, 2048);
    const actualV = Math.min(
      desiredV,
      Math.round(
        desiredV * (Math.random() < er ? jitter(0.62, 0.18, 0.12, 1) : jitter(0.94, 0.06, 0.48, 1))
      )
    );
    return metricDoc(
      ts,
      "batch",
      "aws.batch",
      region,
      account,
      { JobQueueName: q },
      {
        SubmittedJobCount: counter(randInt(0, 400)),
        PendingJobCount: counter(randInt(0, 200)),
        RunnableJobCount: counter(randInt(0, 100)),
        StartingJobCount: counter(randInt(0, 20)),
        RunningJobCount: counter(randInt(0, 50)),
        SucceededJobCount: counter(randInt(0, 1000)),
        FailedJobCount: counter(
          Math.round(
            randInt(0, 1000) *
              (Math.random() < er ? jitter(0.1, 0.08, 0, 0.5) : jitter(0.01, 0.008, 0, 0.05))
          )
        ),
        DesiredvCPUs: counter(desiredV),
        ActualvCPUs: counter(actualV),
      }
    );
  });
}

// ─── ElasticBeanstalk ─────────────────────────────────────────────────────────

const EB_ENVS = ["production", "staging", "dev", "testing", "canary"];

export function generateElasticbeanstalkMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(EB_ENVS, randInt(1, 3)).map((env) => {
    const req = randInt(100, 20_000);
    const cpu = Math.random() < er ? jitter(75, 15, 50, 100) : jitter(35, 20, 5, 80);
    return metricDoc(
      ts,
      "elasticbeanstalk",
      "aws.elasticbeanstalk",
      region,
      account,
      { EnvironmentName: `myapp-${env}` },
      {
        ApplicationRequests2xx: counter(Math.round(req * 0.92)),
        ApplicationRequests4xx: counter(randInt(0, Math.round(req * 0.05))),
        ApplicationRequests5xx: counter(
          Math.random() < er ? randInt(1, Math.round(req * 0.08)) : 0
        ),
        ApplicationLatencyP50: stat(dp(jitter(50, 30, 5, 5000))),
        ApplicationLatencyP99: stat(dp(jitter(500, 300, 50, 30000))),
        CPUUtilization: stat(dp(cpu)),
        InstanceHealth: stat(
          dp(Math.random() < er ? jitter(72, 14, 35, 100) : jitter(97, 2, 85, 100))
        ),
        RootFilesystemUtil: stat(
          dp(Math.random() < er ? jitter(86, 8, 70, 98) : jitter(52, 18, 18, 88))
        ),
        InstancesOk: counter(randInt(2, 10)),
        InstancesDegraded: counter(Math.random() < er * 0.3 ? randInt(1, 3) : 0),
        InstancesSevere: counter(Math.random() < er * 0.25 ? randInt(1, 4) : 0),
        InstancesWarning: counter(Math.random() < er * 0.35 ? randInt(1, 3) : randInt(0, 1)),
        InstancesInfo: counter(randInt(0, 2)),
        InstancesNoData: counter(Math.random() < er * 0.15 ? randInt(1, 2) : 0),
      }
    );
  });
}

// ─── ECR ──────────────────────────────────────────────────────────────────────

const ECR_REPOS = [
  "app/frontend",
  "app/backend",
  "app/worker",
  "infra/nginx",
  "infra/fluentd",
  "ml/inference",
];

export function generateEcrMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(ECR_REPOS, randInt(2, 5)).map((repo) => {
    const stress = Math.random() < er;
    const crit = stress ? randInt(0, 7) : randInt(0, 2);
    const high = stress ? randInt(0, 14) : randInt(0, 5);
    const med = stress ? randInt(0, 32) : randInt(0, 14);
    const low = stress ? randInt(0, 48) : randInt(0, 22);
    const total = crit + high + med + low;
    return metricDoc(
      ts,
      "ecr",
      "aws.ecr",
      region,
      account,
      { RepositoryName: repo },
      {
        ImagePushCount: counter(randInt(0, 50)),
        ImagePullCount: counter(randInt(0, 5000)),
        StorageBytes: stat(dp(randInt(100_000_000, 50_000_000_000))),
        ScanCount: counter(randInt(0, 100)),
        ScanFindingsTotal: counter(total),
        ScanFindingsCritical: counter(crit),
        ScanFindingsHigh: counter(high),
        ScanFindingsMedium: counter(med),
        ScanFindingsLow: counter(low),
        LifecyclePolicyPreviewImageCount: counter(randInt(0, 120)),
      }
    );
  });
}
