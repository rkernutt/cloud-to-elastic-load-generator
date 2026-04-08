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

export function generateLambdaMetrics(ts, er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(LAMBDA_NAMES, randInt(3, 8)).map((name) => {
    const inv = randInt(0, 8000);
    const errs = Math.round(
      inv * (Math.random() < er ? jitter(0.08, 0.06, 0.01, 0.4) : jitter(0.005, 0.004, 0, 0.02))
    );
    const dur = jitter(300, 250, 10, 15000);
    return metricDoc(
      ts,
      "lambda",
      "aws.lambda",
      region,
      account,
      { FunctionName: name, Resource: name },
      {
        Invocations: counter(inv),
        Errors: counter(errs),
        Duration: stat(dp(dur), {
          max: dp(dur * jitter(3, 1.5, 1.5, 8)),
          min: dp(dur * jitter(0.3, 0.15, 0.05, 0.8)),
        }),
        Throttles: counter(
          Math.round(inv * (Math.random() < 0.1 ? jitter(0.02, 0.015, 0, 0.1) : 0))
        ),
        ConcurrentExecutions: counter(randInt(0, 300)),
        DeadLetterErrors: counter(Math.random() < 0.05 ? randInt(1, 10) : 0),
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

export function generateEc2Metrics(ts, er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(EC2_INSTANCE_TYPES, randInt(3, 10)).map((itype, idx) => {
    const instanceId = `i-${randId(17).toLowerCase()}`;
    const cpu = Math.random() < er ? jitter(80, 15, 60, 100) : jitter(30, 20, 1, 95);
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

export function generateEcsMetrics(ts, er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const cluster = rand(ECS_CLUSTERS);
  return sample(ECS_SERVICES, randInt(2, 5)).map((svc) => {
    const cpu = Math.random() < er ? jitter(85, 10, 70, 100) : jitter(35, 20, 1, 90);
    const mem = jitter(50, 25, 5, 95);
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
      }
    );
  });
}

export function generateFargateMetrics(ts, er) {
  return generateEcsMetrics(ts, er).map((doc) => {
    const d = doc as Record<string, any>;
    return {
      ...d,
      aws: { ...d.aws, ecs: { ...d.aws.ecs } },
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

export function generateEksMetrics(ts, er) {
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
        pod_count: counter(randInt(5, 80)),
        pod_cpu_reserved: stat(dp(jitter(20, 10, 0, 80))),
        pod_memory_reserved: stat(dp(jitter(30, 15, 0, 90))),
      }
    );
  });
}

// ─── AppRunner ────────────────────────────────────────────────────────────────

const APPRUNNER_SERVICES = ["web-app", "api-service", "backend-service", "frontend", "mobile-api"];

export function generateApprunnerMetrics(ts, er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(APPRUNNER_SERVICES, randInt(1, 3)).map((svc) => {
    const req = randInt(100, 50_000);
    const http5xx = Math.round(req * (Math.random() < er ? jitter(0.05, 0.04, 0.001, 0.3) : 0));
    return metricDoc(
      ts,
      "apprunner",
      "aws.apprunner",
      region,
      account,
      { ServiceName: svc },
      {
        Requests: counter(req),
        Http2xxRequests: counter(req - http5xx - randInt(0, Math.round(req * 0.02))),
        Http4xxRequests: counter(randInt(0, Math.round(req * 0.02))),
        Http5xxRequests: counter(http5xx),
        RequestLatency: stat(dp(jitter(50, 40, 5, 5000)), {
          max: dp(jitter(500, 400, 100, 10000)),
          min: dp(jitter(5, 3, 1, 50)),
        }),
        ActiveInstances: counter(randInt(1, 10)),
      }
    );
  });
}

// ─── Batch ────────────────────────────────────────────────────────────────────

const BATCH_QUEUES = ["high-priority", "standard", "low-priority", "spot-queue", "on-demand-queue"];

export function generateBatchMetrics(ts, er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(BATCH_QUEUES, randInt(2, 4)).map((q) => {
    return metricDoc(
      ts,
      "batch",
      "aws.batch",
      region,
      account,
      { JobQueueName: q },
      {
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
      }
    );
  });
}

// ─── ElasticBeanstalk ─────────────────────────────────────────────────────────

const EB_ENVS = ["production", "staging", "dev", "testing", "canary"];

export function generateElasticbeanstalkMetrics(ts, er) {
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
        InstancesOk: counter(randInt(2, 10)),
        InstancesDegraded: counter(Math.random() < er * 0.3 ? randInt(1, 3) : 0),
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

export function generateEcrMetrics(ts, er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(ECR_REPOS, randInt(2, 5)).map((repo) => {
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
        ScanFindingsTotal: counter(Math.random() < er ? randInt(1, 30) : 0),
      }
    );
  });
}
